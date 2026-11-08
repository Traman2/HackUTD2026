import { TimeDuration, Timestamp } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import spacetimedb from "../schema";
import { presignS3, storageConfig, URL_EXPIRY_SECONDS } from "../clients/s3";
import { pdfInput } from "../validation/documents";
import { requireDocument, requireSpace } from "../validation/ownership";

const ticket = t.object("PdfUploadTicket", {
  documentId: t.u64(), url: t.string(), expiresAt: t.timestamp(),
  contentType: t.string(), checksumSha256: t.string(),
});

export const request_document_upload = spacetimedb.procedure({
  spaceId: t.u64(), filename: t.string(), mimeType: t.string(), sizeBytes: t.u32(),
  checksumSha256: t.string(), category: t.string(),
}, ticket, (ctx, input) => {
  // Authorize before reading config or allocating any rows.
  ctx.withTx(tx => requireSpace(tx, input.spaceId, true));
  const parsed = pdfInput.safeParse(input);
  if (!parsed.success) throw new SenderError(parsed.error.issues[0].message);
  const config = storageConfig(ctx);
  const expiresAt = new Timestamp(ctx.timestamp.microsSinceUnixEpoch + 300_000_000n);
  const document = ctx.withTx(tx => {
    const space = requireSpace(tx, input.spaceId, true);
    const row = tx.db.documents.insert({
      id: 0n, spaceId: space.id, uploadedBy: space.ownerUsername, ...parsed.data,
      visibility: "private", storageKey: "", storageVersionId: undefined,
      storageBucket: config.bucket, storageRegion: config.region,
      status: "requested", extractionVersion: 0, error: undefined,
      createdAt: tx.timestamp, verifiedAt: undefined,
    });
    const storageKey = `${config.prefix}/spaces/${space.id}/documents/${row.id}-${
      tx.timestamp.microsSinceUnixEpoch}/original.pdf`;
    tx.db.documents.id.update({ ...row, storageKey });
    tx.db.uploads.insert({ documentId: row.id, requestedBy: space.ownerUsername,
      attempt: 1, status: "requested", expiresAt });
    return { ...row, storageKey };
  });
  const url = presignS3(config, ctx.timestamp.toDate(), "PUT", document.storageKey, {
    "content-length": String(document.sizeBytes), "content-type": document.mimeType,
    "x-amz-checksum-sha256": document.checksumSha256,
  });
  return { documentId: document.id, url, expiresAt, contentType: document.mimeType,
    checksumSha256: document.checksumSha256 };
});

export const retry_document_upload = spacetimedb.procedure(
  { documentId: t.u64() }, ticket, (ctx, { documentId }) => {
    ctx.withTx(tx => requireDocument(tx, documentId, true));
    const config = storageConfig(ctx);
    const expiresAt = new Timestamp(ctx.timestamp.microsSinceUnixEpoch +
      BigInt(URL_EXPIRY_SECONDS) * 1_000_000n);
    const document = ctx.withTx(tx => {
      const row = requireDocument(tx, documentId, true);
      if (row.status === "deleting") throw new SenderError("Upload is being cleaned up.");
      if (row.verifiedAt) throw new SenderError("Document is already verified.");
      const upload = tx.db.uploads.documentId.find(documentId);
      if (!upload) throw new SenderError("Upload not found.");
      tx.db.uploads.documentId.update({ ...upload, attempt: upload.attempt + 1,
        status: "requested", expiresAt });
      tx.db.documents.id.update({ ...row, status: "requested", error: undefined });
      return row;
    });
    return { documentId, expiresAt, contentType: document.mimeType,
      checksumSha256: document.checksumSha256,
      url: presignS3({ ...config, bucket: document.storageBucket, region: document.storageRegion }, ctx.timestamp.toDate(), "PUT", document.storageKey, {
        "content-length": String(document.sizeBytes), "content-type": document.mimeType,
        "x-amz-checksum-sha256": document.checksumSha256,
      }) };
  },
);

export const confirm_document_upload = spacetimedb.procedure(
  { documentId: t.u64() }, t.bool(), (ctx, { documentId }) => {
    const snapshot = ctx.withTx(tx => {
      const document = requireDocument(tx, documentId, true);
      if (document.status === "deleting") throw new SenderError("Upload is being cleaned up.");
      const upload = tx.db.uploads.documentId.find(documentId);
      if (!upload) throw new SenderError("Upload not found.");
      if (!document.verifiedAt) {
        tx.db.documents.id.update({ ...document, status: "uploaded", error: undefined });
        tx.db.uploads.documentId.update({ ...upload, status: "uploaded" });
      }
      return { document, upload };
    });
    if (snapshot.document.verifiedAt) return true;
    const document = snapshot.document;
    const config = { ...storageConfig(ctx), bucket: document.storageBucket, region: document.storageRegion };
    let versionId: string | undefined;
    try {
      const headHeaders = { "x-amz-checksum-mode": "ENABLED" };
      const head = ctx.http.fetch(presignS3(config, ctx.timestamp.toDate(), "HEAD",
        document.storageKey, headHeaders), {
        method: "HEAD", headers: headHeaders, timeout: TimeDuration.fromMillis(10000),
      });
      if (!head.ok || Number(head.headers.get("content-length")) !== document.sizeBytes ||
          head.headers.get("content-type") !== "application/pdf" ||
          head.headers.get("x-amz-checksum-sha256") !== document.checksumSha256) {
        throw new Error("The uploaded PDF could not be verified. Upload it again.");
      }
      const version = head.headers.get("x-amz-version-id");
      versionId = version && version !== "null" ? version : undefined;
      const query: Record<string, string> = versionId ? { versionId } : {};
      const headers = { range: "bytes=0-4" };
      const prefix = ctx.http.fetch(presignS3(config, ctx.timestamp.toDate(), "GET",
        document.storageKey, headers, query), {
        headers, timeout: TimeDuration.fromMillis(10000),
      });
      if (prefix.status !== 206 || prefix.text() !== "%PDF-") {
        throw new Error("The uploaded file does not have a valid PDF header.");
      }
    } catch {
      ctx.withTx(tx => {
        const row = requireDocument(tx, documentId);
        const upload = tx.db.uploads.documentId.find(documentId);
        if (upload && upload.attempt === snapshot.upload.attempt && !row.verifiedAt) {
          tx.db.documents.id.update({ ...row, status: "failed",
            error: "Verification failed. Check the file and retry the upload." });
          tx.db.uploads.documentId.update({ ...upload, status: "failed" });
        }
      });
      throw new SenderError("PDF verification failed. Check the file and retry the upload.");
    }
    return ctx.withTx(tx => {
      const row = requireDocument(tx, documentId, true);
      if (row.status === "deleting") throw new SenderError("Upload is being cleaned up.");
      if (row.verifiedAt) return true;
      const upload = tx.db.uploads.documentId.find(documentId);
      if (!upload || upload.attempt !== snapshot.upload.attempt) {
        throw new SenderError("Upload changed during verification. Confirm it again.");
      }
      tx.db.documents.id.update({ ...row, status: "verified", storageVersionId: versionId,
        verifiedAt: tx.timestamp, error: undefined });
      tx.db.uploads.documentId.update({ ...upload, status: "verified" });
      return true;
    });
  },
);

export const request_document_download = spacetimedb.procedure(
  { documentId: t.u64() }, t.string(), (ctx, { documentId }) => {
    const document = ctx.withTx(tx => requireDocument(tx, documentId));
    if (!document.verifiedAt) throw new SenderError("Document is not verified yet.");
    const query: Record<string, string> = {
      "response-content-type": "application/pdf",
      "response-content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
    };
    if (document.storageVersionId) query.versionId = document.storageVersionId;
    return presignS3({ ...storageConfig(ctx), bucket: document.storageBucket, region: document.storageRegion },
      ctx.timestamp.toDate(), "GET", document.storageKey, {}, query);
  },
);

export const cancel_document_upload = spacetimedb.reducer(
  { documentId: t.u64() }, (ctx, { documentId }) => {
    const document = requireDocument(ctx, documentId);
    if (document.status === "deleting") throw new SenderError("Upload is being cleaned up.");
    if (document.verifiedAt) throw new SenderError("Document is already verified.");
    ctx.db.documents.id.update({ ...document, status: "failed", error: "Upload cancelled." });
    const upload = ctx.db.uploads.documentId.find(documentId);
    if (upload) ctx.db.uploads.documentId.update({ ...upload, status: "failed", attempt: upload.attempt + 1 });
  },
);

// Owner-triggered cleanup for abandoned/failed uploads. Wait until signed URLs
// expire, with a grace period for transfers that started before expiry.
export const cleanup_document_upload = spacetimedb.procedure(
  { documentId: t.u64() }, t.bool(), (ctx, { documentId }) => {
    ctx.withTx(tx => requireDocument(tx, documentId));
    const config = storageConfig(ctx);
    const document = ctx.withTx(tx => {
      const row = requireDocument(tx, documentId);
      if (row.verifiedAt) throw new SenderError("Verified documents cannot be cleaned up as uploads.");
      const upload = tx.db.uploads.documentId.find(documentId);
      if (!upload || ctx.timestamp.microsSinceUnixEpoch < upload.expiresAt.microsSinceUnixEpoch + 600_000_000n) {
        throw new SenderError("Wait 15 minutes after requesting the upload before cleanup.");
      }
      tx.db.documents.id.update({ ...row, status: "deleting" });
      tx.db.uploads.documentId.update({ ...upload, status: "deleting", attempt: upload.attempt + 1 });
      return row;
    });
    try {
      const response = ctx.http.fetch(presignS3({ ...config, bucket: document.storageBucket, region: document.storageRegion },
        ctx.timestamp.toDate(), "DELETE", document.storageKey), {
        method: "DELETE", timeout: TimeDuration.fromMillis(10000),
      });
      if (!response.ok && response.status !== 404) throw new Error("S3 delete failed");
    } catch {
      throw new SenderError("Storage cleanup failed. Retry cleanup later.");
    }
    return ctx.withTx(tx => {
      const row = requireDocument(tx, documentId);
      if (row.status !== "deleting" || row.verifiedAt) throw new SenderError("Upload changed during cleanup.");
      tx.db.uploads.documentId.delete(documentId);
      tx.db.documents.id.delete(documentId);
      return true;
    });
  },
);
