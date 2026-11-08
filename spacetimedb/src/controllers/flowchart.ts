import { SenderError, t, type InferSchema, type ProcedureCtx } from "spacetimedb/server";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import spacetimedb from "../schema";
import { requireSpace } from "../validation/ownership";
import { presignS3, storageConfig } from "../clients/s3";
import { savedFlowchart, sourceFingerprint } from "./flowchart-storage";

type Context = ProcedureCtx<InferSchema<typeof spacetimedb>>;
function requestGraph(ctx: Context, spaceId: bigint, generate: boolean) {
  const snapshot = ctx.withTx(tx => {
    const space = requireSpace(tx, spaceId, generate);
    const all = Array.from(tx.db.documents.spaceId.filter(spaceId));
    if (generate && all.some(doc => !doc.verifiedAt)) throw new SenderError("Finish or remove unverified document uploads before generating the flowchart.");
    return { space, documents: all.filter(doc => doc.verifiedAt).sort((a, b) => a.id < b.id ? -1 : 1) };
  });
  if (snapshot.documents.length > 100) throw new SenderError("A flowchart supports at most 100 documents per space.");
  const key = ctx.env.AGENT_API_KEY;
  if (!key) throw new SenderError("Agent service is not configured.");
  const fingerprint = sourceFingerprint(snapshot.documents);
  const config = generate && snapshot.documents.length ? storageConfig(ctx) : null;
  const manifest = {
    namespace: ctx.env.GRAPH_NAMESPACE || "hackutd2026",
    owner: snapshot.space.ownerUsername, spaceId: String(spaceId), spaceName: snapshot.space.name, fingerprint,
    documents: snapshot.documents.map(doc => ({
      id: String(doc.id), filename: doc.filename, sizeBytes: doc.sizeBytes, checksumSha256: doc.checksumSha256,
      // Reads need no S3 URL or credentials; only generation downloads originals.
      url: config ? presignS3({ ...config, bucket: doc.storageBucket, region: doc.storageRegion }, ctx.timestamp.toDate(), "GET", doc.storageKey, {}, doc.storageVersionId ? { versionId: doc.storageVersionId } : {}) : "https://unused.invalid",
    })),
  };
  // The database host blocks outbound loopback/private HTTP. Return an
  // owner-authorized, short-lived signed capability for the local agent instead.
  const payload = JSON.stringify({
    operation: generate ? "generate" : "get",
    expiresAt: ctx.timestamp.toDate().getTime() + 60_000,
    manifest,
  });
  const signature = bytesToHex(hmac(sha256, utf8ToBytes(key), utf8ToBytes(payload)));
  return JSON.stringify({ payload, signature });
}

export const generate_space_flowchart = spacetimedb.procedure({ spaceId: t.u64() }, t.string(), (ctx, { spaceId }) => requestGraph(ctx, spaceId, true));
export const get_space_flowchart = spacetimedb.procedure({ spaceId: t.u64() }, t.string(), (ctx, { spaceId }) => ctx.withTx(tx => {
  requireSpace(tx, spaceId);
  return JSON.stringify(savedFlowchart(tx, spaceId));
}));
