import { TimeDuration, Timestamp } from "spacetimedb";
import { SenderError, t, type InferSchema, type ReducerCtx, type ViewCtx } from "spacetimedb/server";
import spacetimedb from "../schema";
import { photoStorageConfig, presignS3, storageConfig, URL_EXPIRY_SECONDS } from "../clients/s3";
import { ticketSource, ticketStep } from "../models/ticket";
import { requireTicket, requireUser } from "../validation/ownership";
import { PHOTO_TYPES, photoInputSchema, stepUpdateSchema, ticketDetailSchema, ticketStatusUpdateSchema } from "../validation/tickets";
import { serializeTicket } from "./tickets-storage";

// Field-work API for the mobile app and Meta glasses. Reducers own every state
// change; procedures are used only where S3 or a return value is needed. Every
// call is authorized against the signed-in user's space.

type Db = ReducerCtx<InferSchema<typeof spacetimedb>>["db"];
type Ticket = ReturnType<typeof requireTicket>;
const WORKABLE = new Set(["open", "in_progress"]);
const TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "resolved", "cancelled"],
  in_progress: ["open", "resolved", "cancelled"],
  resolved: ["in_progress", "closed"],
  cancelled: ["open"],
  closed: [],
};

function logEvent(db: Db, ticket: Ticket, actor: string, kind: string, stepOrder: number, detail: string, at: Timestamp) {
  db.ticketEvents.insert({ id: 0n, ticketId: ticket.id, spaceId: ticket.spaceId, actor, kind, stepOrder, detail: detail.slice(0, 600), createdAt: at });
}

function requireStep(ticket: Ticket, stepOrder: number) {
  const step = ticket.steps.find(item => item.order === stepOrder);
  if (!step) throw new SenderError(`Step ${stepOrder} does not exist on this ticket.`);
  return step;
}

/** Mark a step done / failed / skipped (or back to pending) with what the technician said or saw. */
export const update_ticket_step = spacetimedb.reducer(
  { ticketId: t.u64(), stepOrder: t.u32(), status: t.string(), result: t.string() },
  (ctx, input) => {
    const actor = requireUser(ctx);
    const ticket = requireTicket(ctx, input.ticketId, true);
    applyTicketStep(ctx.db, ticket, actor, input, ctx.timestamp);
  },
);

/** Move a ticket through open -> in_progress -> resolved -> closed (or cancel / reopen). */
export const set_ticket_status = spacetimedb.reducer(
  { ticketId: t.u64(), status: t.string(), note: t.string() },
  (ctx, input) => {
    const actor = requireUser(ctx);
    const ticket = requireTicket(ctx, input.ticketId, true);
    applyTicketStatus(ctx.db, ticket, actor, input, ctx.timestamp);
  },
);

const photoUploadTicket = t.object("TicketPhotoUploadTicket", {
  photoId: t.u64(), url: t.string(), expiresAt: t.timestamp(), contentType: t.string(), checksumSha256: t.string(),
});

/**
 * Step 1 of attaching a photo: returns a signed S3 PUT URL. Upload the bytes
 * with the returned content-type and x-amz-checksum-sha256 headers, then call
 * confirm_ticket_photo_upload. stepOrder 0 attaches the photo to the ticket.
 */
export const request_ticket_photo_upload = spacetimedb.procedure({
  ticketId: t.u64(), stepOrder: t.u32(), contentType: t.string(), sizeBytes: t.u32(),
  checksumSha256: t.string(), caption: t.string(), source: t.string(),
}, photoUploadTicket, (ctx, input) => {
  // Authorize before reading config or allocating any rows.
  ctx.withTx(tx => requireTicket(tx, input.ticketId, true));
  const parsed = photoInputSchema.safeParse(input);
  if (!parsed.success) throw new SenderError(parsed.error.issues[0]!.message);
  const config = photoStorageConfig(ctx);
  const expiresAt = new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(URL_EXPIRY_SECONDS) * 1_000_000n);
  const photo = ctx.withTx(tx => {
    const actor = requireUser(tx);
    const ticket = requireTicket(tx, input.ticketId, true);
    if (!WORKABLE.has(ticket.status)) throw new SenderError("Reopen the ticket before adding photos.");
    if (parsed.data.stepOrder > 0) requireStep(ticket, parsed.data.stepOrder);
    const row = tx.db.ticketPhotos.insert({ id: 0n, ticketId: ticket.id, spaceId: ticket.spaceId, ownerUsername: ticket.ownerUsername,
      ...parsed.data, storageBucket: config.bucket, storageRegion: config.region, storageKey: "",
      status: "requested", capturedBy: actor, createdAt: tx.timestamp, verifiedAt: undefined });
    const storageKey = `${config.prefix}/spaces/${ticket.spaceId}/tickets/${ticket.id}/photos/${row.id}-${tx.timestamp.microsSinceUnixEpoch}.${PHOTO_TYPES[parsed.data.contentType]}`;
    tx.db.ticketPhotos.id.update({ ...row, storageKey });
    return { ...row, storageKey };
  });
  const url = presignS3(config, ctx.timestamp.toDate(), "PUT", photo.storageKey, {
    "content-length": String(photo.sizeBytes), "content-type": photo.contentType, "x-amz-checksum-sha256": photo.checksumSha256,
  });
  return { photoId: photo.id, url, expiresAt, contentType: photo.contentType, checksumSha256: photo.checksumSha256 };
});

/** Step 2 of attaching a photo: verifies the S3 object and attaches it to the ticket. */
export const confirm_ticket_photo_upload = spacetimedb.procedure({ photoId: t.u64() }, t.bool(), (ctx, { photoId }) => {
  const photo = ctx.withTx(tx => {
    const row = tx.db.ticketPhotos.id.find(photoId);
    if (!row) throw new SenderError("Photo not found.");
    requireTicket(tx, row.ticketId, true);
    return row;
  });
  if (photo.status === "verified") return true;
  const config = { ...storageConfig(ctx), bucket: photo.storageBucket, region: photo.storageRegion };
  const headers = { "x-amz-checksum-mode": "ENABLED" };
  let verified = false;
  try {
    const head = ctx.http.fetch(presignS3(config, ctx.timestamp.toDate(), "HEAD", photo.storageKey, headers),
      { method: "HEAD", headers, timeout: TimeDuration.fromMillis(10000) });
    verified = head.ok && Number(head.headers.get("content-length")) === photo.sizeBytes
      && head.headers.get("content-type") === photo.contentType && head.headers.get("x-amz-checksum-sha256") === photo.checksumSha256;
  } catch { verified = false; }
  return ctx.withTx(tx => {
    const actor = requireUser(tx);
    const row = tx.db.ticketPhotos.id.find(photoId);
    if (!row) throw new SenderError("Photo not found.");
    const ticket = requireTicket(tx, row.ticketId, true);
    if (!verified) {
      tx.db.ticketPhotos.id.update({ ...row, status: "failed" });
      throw new SenderError("The photo upload could not be verified. Request a new upload and try again.");
    }
    tx.db.ticketPhotos.id.update({ ...row, status: "verified", verifiedAt: tx.timestamp });
    // Bumping updatedAt lets live subscribers refresh the ticket.
    const next = ticket.status === "open" ? "in_progress" : ticket.status;
    tx.db.tickets.id.update({ ...ticket, status: next, updatedAt: tx.timestamp });
    logEvent(tx.db, ticket, actor, "photo", row.stepOrder, `${row.source} photo${row.caption ? `: ${row.caption}` : ""}`, tx.timestamp);
    if (next !== ticket.status) logEvent(tx.db, ticket, actor, "status", 0, `${ticket.status} -> ${next}`, tx.timestamp);
    return true;
  });
});

/** Short-lived signed URL to view a verified ticket photo. */
export const request_ticket_photo_download = spacetimedb.procedure({ photoId: t.u64() }, t.string(), (ctx, { photoId }) => {
  const photo = ctx.withTx(tx => {
    const row = tx.db.ticketPhotos.id.find(photoId);
    if (!row) throw new SenderError("Photo not found.");
    requireTicket(tx, row.ticketId);
    return row;
  });
  if (photo.status !== "verified") throw new SenderError("Photo is not verified yet.");
  return presignS3({ ...storageConfig(ctx), bucket: photo.storageBucket, region: photo.storageRegion }, ctx.timestamp.toDate(), "GET", photo.storageKey, {},
    { "response-content-type": photo.contentType });
});

/** One call for the phone: the ticket, its photos (with signed view URLs) and its history. */
export const get_ticket = spacetimedb.procedure({ ticketId: t.u64() }, t.string(), (ctx, { ticketId }) => {
  const snapshot = ctx.withTx(tx => {
    const ticket = requireTicket(tx, ticketId);
    return {
      ticket,
      photos: Array.from(tx.db.ticketPhotos.ticketId.filter(ticketId)).filter(photo => photo.status !== "requested")
        .sort((a, b) => a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch ? -1 : 1),
      events: Array.from(tx.db.ticketEvents.ticketId.filter(ticketId))
        .sort((a, b) => a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch ? -1 : 1),
    };
  });
  const config = snapshot.photos.some(photo => photo.status === "verified") ? storageConfig(ctx) : null;
  return JSON.stringify(ticketDetailSchema.parse({
    ticket: serializeTicket(snapshot.ticket),
    photos: snapshot.photos.map(photo => ({
      id: String(photo.id), ticketId: String(photo.ticketId), stepOrder: photo.stepOrder, caption: photo.caption, source: photo.source,
      contentType: photo.contentType, sizeBytes: photo.sizeBytes, status: photo.status, capturedBy: photo.capturedBy,
      createdAt: photo.createdAt.toDate().toISOString(), verifiedAt: photo.verifiedAt?.toDate().toISOString() ?? null,
      url: config && photo.status === "verified"
        ? presignS3({ ...config, bucket: photo.storageBucket, region: photo.storageRegion }, ctx.timestamp.toDate(), "GET", photo.storageKey, {}, { "response-content-type": photo.contentType })
        : null,
    })),
    events: snapshot.events.map(event => ({ id: String(event.id), actor: event.actor, kind: event.kind, stepOrder: event.stepOrder,
      detail: event.detail, createdAt: event.createdAt.toDate().toISOString() })),
  }));
});

// Live, owner-filtered subscriptions for the phone and the web Tickets view.
const ticketRow = t.row("TicketRow", {
  id: t.u64(), spaceId: t.u64(), ownerUsername: t.string(), problemKey: t.string(), title: t.string(), kind: t.string(),
  priority: t.string(), status: t.string(), assetLabel: t.string(), equipmentCode: t.string(), overviewNodeId: t.option(t.string()),
  networkNodeId: t.string(), summary: t.string(), safetyNotes: t.string(), steps: t.array(ticketStep), sources: t.array(ticketSource),
  draftedBy: t.string(), jobId: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp(),
});
const ticketPhotoRow = t.row("TicketPhotoSummary", {
  id: t.u64(), ticketId: t.u64(), spaceId: t.u64(), stepOrder: t.u32(), caption: t.string(), source: t.string(),
  contentType: t.string(), sizeBytes: t.u32(), status: t.string(), capturedBy: t.string(), createdAt: t.timestamp(), verifiedAt: t.option(t.timestamp()),
});

function ownedSpaceIds(ctx: Pick<ViewCtx<InferSchema<typeof spacetimedb>>, "db" | "sender">) {
  const session = ctx.db.sessions.identity.find(ctx.sender);
  if (!session || !ctx.db.users.username.find(session.username)) return [];
  return Array.from(ctx.db.spaces.ownerUsername.filter(session.username)).map(space => space.id);
}

export const my_tickets = spacetimedb.view({ public: true }, t.array(ticketRow), ctx =>
  ownedSpaceIds(ctx).flatMap(spaceId => Array.from(ctx.db.tickets.spaceId.filter(spaceId))));

export const my_ticket_photos = spacetimedb.view({ public: true }, t.array(ticketPhotoRow), ctx =>
  ownedSpaceIds(ctx).flatMap(spaceId => Array.from(ctx.db.ticketPhotos.spaceId.filter(spaceId))
    .map(({ storageKey, storageBucket, storageRegion, checksumSha256, ownerUsername, ...summary }) => summary)));

export function applyTicketStep(db: Db, ticket: Ticket, actor: string, input: { stepOrder: number; status: string; result: string }, at: Timestamp) {
    const parsed = stepUpdateSchema.safeParse(input);
    if (!parsed.success) throw new SenderError(parsed.error.issues[0]!.message);
    if (!WORKABLE.has(ticket.status)) throw new SenderError(`This ticket is ${ticket.status.replace("_", " ")}. Reopen it before changing steps.`);
    requireStep(ticket, input.stepOrder);
    const { status, result } = parsed.data;
    const steps = ticket.steps.map(step => step.order !== input.stepOrder ? step : {
      ...step, status, result: result || undefined, completedAt: status === "pending" ? undefined : at,
    });
    // Starting work on any step moves an open ticket to in progress.
    const next = ticket.status === "open" && status !== "pending" ? "in_progress" : ticket.status;
    db.tickets.id.update({ ...ticket, steps, status: next, updatedAt: at });
    logEvent(db, ticket, actor, "step", input.stepOrder, result ? `${status}: ${result}` : status, at);
    if (next !== ticket.status) logEvent(db, ticket, actor, "status", 0, `${ticket.status} -> ${next}`, at);
}

export function applyTicketStatus(db: Db, ticket: Ticket, actor: string, input: { status: string; note: string }, at: Timestamp) {
    const parsed = ticketStatusUpdateSchema.safeParse(input);
    if (!parsed.success) throw new SenderError(parsed.error.issues[0]!.message);
    const { status, note } = parsed.data;
    if (status === ticket.status) return;
    if (!TRANSITIONS[ticket.status]?.includes(status)) throw new SenderError(`A ${ticket.status.replace("_", " ")} ticket cannot become ${status.replace("_", " ")}.`);
    if (status === "resolved" && ticket.steps.some(step => step.status === "pending")) {
      throw new SenderError("Complete or skip every step before resolving the ticket.");
    }
    db.tickets.id.update({ ...ticket, status, updatedAt: at });
    logEvent(db, ticket, actor, "status", 0, `${ticket.status} -> ${status}${note ? `: ${note}` : ""}`, at);
}
