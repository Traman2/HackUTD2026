import { Timestamp } from "spacetimedb";
import { SenderError, t, type InferSchema, type TransactionCtx } from "spacetimedb/server";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";
import db from "../schema";
import { requireTicket, requireUser } from "../validation/ownership";
import { checklistDefinition, nextChecklistPrompt, resolutionReplySchema } from "../validation/resolution";
import { serializeTicket } from "./tickets-storage";
import { applyTicketStep, applyTicketStatus } from "./ticket-work";

type Tx = TransactionCtx<InferSchema<typeof db>>;
type Session = NonNullable<ReturnType<Tx["db"]["resolutionSessions"]["id"]["find"]>>;
const uuid = z.string().uuid();
const later = (tx: Tx) => new Timestamp(tx.timestamp.microsSinceUnixEpoch + 90_000_000n);
const sign = (key: string, payload: string) => bytesToHex(hmac(sha256, utf8ToBytes(key), utf8ToBytes(payload)));
function owned(tx: Tx, sessionId: string) {
  const row = tx.db.resolutionSessions.id.find(sessionId);
  if (!row || row.ownerUsername !== requireUser(tx)) throw new SenderError("Voice session not found.");
  requireTicket(tx, row.ticketId);
  return row;
}
function live(tx: Tx, row: Session, allowCompleted = false) {
  const ticket = tx.db.tickets.id.find(row.ticketId);
  const space = ticket && tx.db.spaces.id.find(ticket.spaceId);
  const login = tx.db.sessions.identity.find(row.actorIdentity);
  if (!ticket || !space || space.archived || space.ownerUsername !== row.ownerUsername ||
      login?.username !== row.ownerUsername || !tx.db.users.username.find(row.ownerUsername)) throw new SenderError("Voice access expired. Sign in again.");
  if (!(allowCompleted && ((row.status === "ended" && ticket.status === "resolved") || (row.status === "halted" && ["open", "in_progress"].includes(ticket.status)))) &&
      (row.status !== "active" || !["open", "in_progress"].includes(ticket.status))) throw new SenderError("This voice session is not active.");
  if (row.checklistJson !== checklistDefinition(ticket)) throw new SenderError("Checklist instructions changed. End this session and start again.");
  return ticket;
}
function snapshot(tx: Tx, row: Session) {
  const ticket = tx.db.tickets.id.find(row.ticketId);
  if (!ticket) throw new SenderError("Ticket not found.");
  const actions = Array.from(tx.db.resolutionActions.sessionId.filter(row.id));
  return { sessionId: row.id, ticketId: String(row.ticketId), status: row.status, revision: row.revision,
    activeStepOrder: row.activeStepOrder, ticketVersion: String(ticket.updatedAt.microsSinceUnixEpoch), ticket: serializeTicket(ticket),
    photoRequest: (() => {
      const action = actions.find(a => a.state === "capturing");
      return action ? { requestId: action.id, clientTurnId: action.turnId.slice(row.id.length + 1), stepOrder: action.stepOrder,
        caption: action.result, emergency: action.kind === "emergency_photo" } : null;
    })(),
    pendingAction: (() => { const action = actions.find(a => a.state === "pending"); return action ? {
      id: action.id, kind: action.kind, stepOrder: action.stepOrder, status: action.status, result: action.result,
      expectedRevision: action.expectedRevision,
    } : null; })(),
    turns: Array.from(tx.db.resolutionTurns.sessionId.filter(row.id))
      .sort((a,b) => a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch ? -1 : 1).slice(-20)
      .map(turn => ({ ...turn, createdAt: turn.createdAt.toDate().toISOString(), updatedAt: turn.updatedAt.toDate().toISOString() })),
  };
}
function supersede(tx: Tx, id: string) {
  for (const action of tx.db.resolutionActions.sessionId.filter(id)) {
    if (action.state === "pending") tx.db.resolutionActions.id.update({ ...action, state: "superseded" });
  }
}

export const start_resolution_session = db.procedure({ ticketId: t.u64(), clientRequestId: t.string() }, t.string(), (ctx, input) => ctx.withTx(tx => {
  uuid.parse(input.clientRequestId);
  const ticket = requireTicket(tx, input.ticketId, true);
  if (!["open", "in_progress"].includes(ticket.status)) throw new SenderError("Reopen the ticket before starting voice guidance.");
  const existing = Array.from(tx.db.resolutionSessions.ticketId.filter(ticket.id)).find(row => row.status !== "ended");
  if (existing) {
    if (existing.status === "halted") throw new SenderError("Inspection halted after an emergency. Review this ticket manually before starting a new inspection.");
    if (existing.checklistJson !== checklistDefinition(ticket)) {
      tx.db.resolutionSessions.id.update({ ...existing, status: "ended", connectionId: "", updatedAt: tx.timestamp });
      supersede(tx, existing.id);
    } else {
      if (existing.connectionId && existing.leaseUntil.microsSinceUnixEpoch > tx.timestamp.microsSinceUnixEpoch)
        throw new SenderError("Voice guidance is already connected. Stop it on the other screen first.");
      const next = tx.db.resolutionSessions.id.update({ ...existing, status: "active", actorIdentity: tx.sender, updatedAt: tx.timestamp });
      return JSON.stringify(snapshot(tx, next));
    }
  }
  if (tx.db.resolutionSessions.id.find(input.clientRequestId)) throw new SenderError("Session request ID was already used. Try a new session.");
  const row = tx.db.resolutionSessions.insert({ id: input.clientRequestId, ticketId: ticket.id, ownerUsername: requireUser(tx),
    actorIdentity: tx.sender, status: "active", activeStepOrder: ticket.steps.find(s => s.status === "pending")?.order ?? ticket.steps[0]?.order ?? 0,
    revision: 0, checklistJson: checklistDefinition(ticket), grantNonce: "", connectionId: "", leaseUntil: tx.timestamp,
    createdAt: tx.timestamp, updatedAt: tx.timestamp });
  return JSON.stringify(snapshot(tx, row));
}));

export const get_resolution_session = db.procedure({ sessionId: t.string() }, t.string(), (ctx, { sessionId }) => ctx.withTx(tx => JSON.stringify(snapshot(tx, owned(tx, sessionId)))));
export const authorize_resolution_voice = db.procedure({ sessionId: t.string() }, t.string(), (ctx, { sessionId }) => {
  const key = ctx.env.AGENT_API_KEY;
  if (!key) throw new SenderError("Agent service is not configured.");
  return ctx.withTx(tx => {
    const row = owned(tx, sessionId); live(tx, row);
    const nonce = `${sessionId}:${tx.timestamp.microsSinceUnixEpoch}`;
    tx.db.resolutionSessions.id.update({ ...row, actorIdentity: tx.sender, grantNonce: nonce });
    const payload = JSON.stringify({ audience: "resolution-voice", sessionId, owner: row.ownerUsername, nonce, expiresAt: tx.timestamp.toDate().getTime() + 60000 });
    return JSON.stringify({ payload, signature: sign(key, payload) });
  });
});
export const set_resolution_session_status = db.reducer({ sessionId: t.string(), status: t.string() }, (tx, { sessionId, status }) => {
  if (!["paused", "ended"].includes(status)) throw new SenderError("Invalid session status.");
  const row = owned(tx, sessionId);
  tx.db.resolutionSessions.id.update({ ...row, status, connectionId: "", grantNonce: "", updatedAt: tx.timestamp });
  supersede(tx, row.id);
});

function decide(tx: Tx, row: Session, actionId: string, revision: number, confirm: boolean, clientTurnId?: string) {
  const action = tx.db.resolutionActions.id.find(actionId);
  if (!action || action.sessionId !== row.id) throw new SenderError("Confirmation not found.");
  if (action.state === "applied") return snapshot(tx, row);
  const ticket = live(tx, row);
  if (action.state !== "pending" || action.expectedRevision !== revision || row.revision !== revision ||
      String(ticket.updatedAt.microsSinceUnixEpoch) !== action.expectedTicketVersion) throw new SenderError("The checklist changed. Ask again before confirming.");
  if (confirm) {
    if (action.kind === "resolve") applyTicketStatus(tx.db, ticket, row.ownerUsername, { status: "resolved", note: "Confirmed in voice resolution session." }, tx.timestamp);
    else applyTicketStep(tx.db, ticket, row.ownerUsername, { stepOrder: action.stepOrder, status: action.status, result: action.result }, tx.timestamp);
  }
  tx.db.resolutionActions.id.update({ ...action, state: confirm ? "applied" : "rejected", confirmedAt: tx.timestamp });
  tx.db.ticketEvents.insert({ id: 0n, ticketId: ticket.id, spaceId: ticket.spaceId, actor: row.ownerUsername,
    kind: "voice_confirmation", stepOrder: action.stepOrder, detail: `${confirm ? "Applied" : "Rejected"} action ${action.id}; session ${row.id}; turn ${action.turnId}`, createdAt: tx.timestamp });
  const nextStep = tx.db.tickets.id.find(ticket.id)!.steps.find(s => s.status === "pending")?.order ?? row.activeStepOrder;
  const next = tx.db.resolutionSessions.id.update({ ...row, revision: row.revision + 1, activeStepOrder: nextStep,
    status: confirm && action.kind === "resolve" ? "ended" : row.status, updatedAt: tx.timestamp });
  if (clientTurnId) {
    const turn = tx.db.resolutionTurns.id.find(`${row.id}:${uuid.parse(clientTurnId)}`);
    if (!turn || turn.status !== "processing") throw new SenderError("Confirmation turn not reserved.");
    tx.db.resolutionTurns.id.update({ ...turn, intent: "observe", status: "ready",
      assistantTranscript: confirm ? `Your confirmed result is saved. ${action.kind === "resolve" ? "This ticket is resolved. You can stop the agent." : nextChecklistPrompt(tx.db.tickets.id.find(ticket.id)!.steps)}` : "Cancelled. No checklist result was changed. What do you see?", updatedAt: tx.timestamp });
  }
  return snapshot(tx, next);
}
export const confirm_resolution_action = db.procedure({ sessionId: t.string(), actionId: t.string(), expectedRevision: t.u32(), confirm: t.bool() }, t.string(), (ctx, input) =>
  ctx.withTx(tx => JSON.stringify(decide(tx, owned(tx, input.sessionId), input.actionId, input.expectedRevision, input.confirm))));

const requestSchema = z.object({ audience: z.literal("resolution-store"), sessionId: uuid, owner: z.string(), connectionId: uuid,
  expiresAt: z.number().int(), operation: z.enum(["connect", "load", "reserve", "save", "decide", "release", "playback", "fail", "photoResult"]), data: z.record(z.string(), z.unknown()) });
export const agent_resolution_store = db.procedure({ payload: t.string(), signature: t.string() }, t.string(), (ctx, input) => {
  const key = ctx.env.AGENT_API_KEY;
  if (!key || input.payload.length > 40000 || !/^[a-f0-9]{64}$/.test(input.signature)) throw new SenderError("Invalid voice authorization.");
  const expected = sign(key, input.payload);
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ input.signature.charCodeAt(i);
  if (diff) throw new SenderError("Invalid voice authorization.");
  const request = requestSchema.parse(JSON.parse(input.payload));
  const now = ctx.timestamp.toDate().getTime();
  if (request.expiresAt < now || request.expiresAt > now + 65000) throw new SenderError("Voice authorization expired.");
  return ctx.withTx(tx => {
    let row = tx.db.resolutionSessions.id.find(request.sessionId);
    if (!row || row.ownerUsername !== request.owner) throw new SenderError("Session not found.");
    const { operation, data, connectionId } = request;
    if (operation === "release") {
      if (row.connectionId === connectionId) tx.db.resolutionSessions.id.update({ ...row, connectionId: "", leaseUntil: tx.timestamp });
      return "{}";
    }
    const ticket = live(tx, row, ["load", "reserve", "save", "playback", "photoResult"].includes(operation));
    if (operation === "connect") {
      if (row.grantNonce !== data.nonce || !row.grantNonce) throw new SenderError("Voice grant was already used.");
      if (row.connectionId && row.leaseUntil.microsSinceUnixEpoch > tx.timestamp.microsSinceUnixEpoch) throw new SenderError("Voice session already connected.");
      row = tx.db.resolutionSessions.id.update({ ...row, grantNonce: "", connectionId, leaseUntil: later(tx) });
    } else if (row.connectionId !== connectionId) throw new SenderError("Voice connection expired. Reconnect.");
    row = tx.db.resolutionSessions.id.update({ ...row, leaseUntil: later(tx), updatedAt: tx.timestamp });
    if (operation === "connect" || operation === "load") return JSON.stringify(snapshot(tx, row));
    if (operation === "photoResult") {
      const action = tx.db.resolutionActions.id.find(z.string().parse(data.requestId));
      if (!action || action.sessionId !== row.id || !["photo", "emergency_photo"].includes(action.kind)) throw new SenderError("Photo request not found.");
      if (action.state !== "capturing") return JSON.stringify(snapshot(tx, row));
      const photoId = z.string().regex(/^\d+$/).optional().parse(data.photoId);
      const photo = photoId ? tx.db.ticketPhotos.id.find(BigInt(photoId)) : undefined;
      if (photoId && (!photo || photo.ticketId !== ticket.id || photo.stepOrder !== action.stepOrder || photo.status !== "verified" || photo.source !== "glasses"))
        throw new SenderError("Photo must be verified and attached to the requested checklist step.");
      const captured = !!photo;
      tx.db.resolutionActions.id.update({ ...action, state: captured ? "applied" : "failed", confirmedAt: tx.timestamp });
      let message = captured ? `Photo saved to this checklist step.` : "The glasses photo could not be saved. No photo was attached.";
      let ended = false;
      let activeStepOrder = row.activeStepOrder;
      if (captured && action.kind === "photo" && action.status === "done") {
        const step = ticket.steps.find(s => s.order === action.stepOrder);
        if (step?.status === "pending") applyTicketStep(tx.db, ticket, row.ownerUsername,
          { stepOrder: action.stepOrder, status: "done", result: action.result || "Photo captured and verified." }, tx.timestamp);
        const updated = tx.db.tickets.id.find(ticket.id)!;
        activeStepOrder = updated.steps.find(s => s.status === "pending")?.order ?? row.activeStepOrder;
        if (updated.steps.every(s => s.status === "done")) {
          applyTicketStatus(tx.db, updated, row.ownerUsername, { status: "resolved", note: "All inspection steps and photo evidence completed." }, tx.timestamp);
          ended = true;
          message += " All checks passed and this ticket is resolved.";
        } else message += ` ${nextChecklistPrompt(updated.steps)}`;
      } else if (action.kind === "emergency_photo") {
        message += " Inspection remains halted. Move to safety and contact emergency services.";
      } else message += " What do you see?";
      const photoTurn = tx.db.resolutionTurns.id.find(action.turnId);
      if (photoTurn) tx.db.resolutionTurns.id.update({ ...photoTurn, assistantTranscript: message, updatedAt: tx.timestamp });
      row = tx.db.resolutionSessions.id.update({ ...row, activeStepOrder, revision: row.revision + 1, status: ended ? "ended" : row.status, updatedAt: tx.timestamp });
      return JSON.stringify(snapshot(tx, row));
    }
    if (operation === "decide") return JSON.stringify(decide(tx, row, z.string().parse(data.actionId), z.number().int().parse(data.revision), z.boolean().parse(data.confirm), uuid.parse(data.clientTurnId)));
    const clientTurnId = uuid.parse(data.clientTurnId);
    const id = `${row.id}:${clientTurnId}`;
    const turn = tx.db.resolutionTurns.id.find(id);
    if (operation === "reserve") {
      if (turn?.status === "ready" || turn?.status === "played") return JSON.stringify({ cached: true,
        turn: { id: turn.id, clientTurnId: turn.clientTurnId, userTranscript: turn.userTranscript, assistantTranscript: turn.assistantTranscript, status: turn.status } });
      if (row.status !== "active") throw new SenderError("This voice session has ended.");
      // One outstanding inference; a disconnected process can be retried after its lease.
      const busy = Array.from(tx.db.resolutionTurns.sessionId.filter(row.id)).find(t => t.status === "processing" && tx.timestamp.microsSinceUnixEpoch - t.updatedAt.microsSinceUnixEpoch < 65_000_000n);
      if (busy) throw new SenderError("A voice turn is still processing. Retry shortly.");
      const value = { id, sessionId: row.id, clientTurnId, stepOrder: row.activeStepOrder,
        userTranscript: z.string().trim().min(1).max(4000).parse(data.text), assistantTranscript: "", status: "processing", intent: "", modelId: "",
        createdAt: turn?.createdAt ?? tx.timestamp, updatedAt: tx.timestamp };
      if (turn) tx.db.resolutionTurns.id.update(value); else tx.db.resolutionTurns.insert(value);
      return JSON.stringify({ cached: false });
    }
    if (!turn) throw new SenderError("Turn not found.");
    if (operation === "fail") {
      if (turn.status === "processing") tx.db.resolutionTurns.id.update({ ...turn, status: "failed", updatedAt: tx.timestamp });
      return "{}";
    }
    if (operation === "playback") {
      if (["ready", "played"].includes(turn.status)) tx.db.resolutionTurns.id.update({ ...turn, status: "played", updatedAt: tx.timestamp });
      return "{}";
    }
    if (turn.status === "ready" || turn.status === "played") return JSON.stringify(snapshot(tx, row));
    const reply = resolutionReplySchema.parse(data.reply);
    if (reply.intent !== "emergency" && (data.ticketVersion !== String(ticket.updatedAt.microsSinceUnixEpoch) || data.revision !== row.revision))
      throw new SenderError("Checklist changed during this turn. Please retry your observation.");
    if (reply.stepOrder && !ticket.steps.some(s => s.order === reply.stepOrder)) throw new SenderError("Unknown checklist step.");
    supersede(tx, row.id);
    let activeStepOrder = reply.stepOrder || row.activeStepOrder;
    let spokenText = reply.spokenText;
    const nextRevision = row.revision + 1;
    let ended = false;
    let halted = false;
    const step = ticket.steps.find(s => s.order === activeStepOrder);
    const verifiedPhoto = Array.from(tx.db.ticketPhotos.ticketId.filter(ticket.id)).some(p => p.stepOrder === activeStepOrder && p.status === "verified");
    const needsPhoto = reply.intent === "photo" || (reply.proposedStatus === "done" && step?.requiresPhoto && !verifiedPhoto);
    if (reply.intent === "emergency") {
      activeStepOrder = row.activeStepOrder;
      // Halt first. Photo delivery is best effort and cannot block skipping the remaining work.
      for (const pending of ticket.steps.filter(s => s.status === "pending")) {
        applyTicketStep(tx.db, tx.db.tickets.id.find(ticket.id)!, row.ownerUsername,
          { stepOrder: pending.order, status: pending.order === activeStepOrder ? "failed" : "skipped", result: `Inspection halted: ${turn.userTranscript}`.slice(0, 500) }, tx.timestamp);
      }
      tx.db.ticketEvents.insert({ id: 0n, ticketId: ticket.id, spaceId: ticket.spaceId, actor: row.ownerUsername,
        kind: "inspection_emergency", stepOrder: activeStepOrder, detail: turn.userTranscript.slice(0, 600), createdAt: tx.timestamp });
      tx.db.resolutionActions.insert({ id, sessionId: row.id, turnId: id, kind: "emergency_photo", stepOrder: activeStepOrder, status: "none",
        result: `Emergency evidence: ${turn.userTranscript}`.slice(0, 300), expectedTicketVersion: String(ticket.updatedAt.microsSinceUnixEpoch),
        expectedRevision: nextRevision, state: "capturing", createdAt: tx.timestamp, confirmedAt: undefined });
      spokenText = "Inspection halted. Move to safety and contact emergency services. Don't stay to take a photo; I'll attempt one automatically from the glasses.";
      halted = true;
    } else if (needsPhoto) {
      tx.db.resolutionActions.insert({ id, sessionId: row.id, turnId: id, kind: "photo", stepOrder: activeStepOrder,
        status: step?.requiresPhoto || step?.kind === "photo" || reply.proposedStatus === "done" ? "done" : "none",
        result: (reply.result || turn.userTranscript).slice(0, 300), expectedTicketVersion: String(ticket.updatedAt.microsSinceUnixEpoch),
        expectedRevision: nextRevision, state: "capturing", createdAt: tx.timestamp, confirmedAt: undefined });
      spokenText = "Taking a photo through your glasses and attaching it to this checklist step.";
    } else if (reply.proposedStatus === "resolved") {
      if (ticket.steps.some(s => s.status === "pending")) throw new SenderError("Complete or skip every step before resolving.");
      applyTicketStatus(tx.db, ticket, row.ownerUsername, { status: "resolved", note: "Resolved during agent conversation." }, tx.timestamp);
      spokenText = "This ticket is resolved. You're all done.";
      ended = true;
    } else if (reply.proposedStatus !== "none") {
      // Clear model-interpreted results are saved atomically, with no confirmation action.
      applyTicketStep(tx.db, ticket, row.ownerUsername, { stepOrder: activeStepOrder, status: reply.proposedStatus, result: reply.result || turn.userTranscript }, tx.timestamp);
      const updated = tx.db.tickets.id.find(ticket.id)!;
      activeStepOrder = updated.steps.find(s => s.status === "pending")?.order ?? activeStepOrder;
      if (updated.steps.every(s => s.status === "done")) {
        applyTicketStatus(tx.db, updated, row.ownerUsername, { status: "resolved", note: "All checklist steps completed during agent conversation." }, tx.timestamp);
        ended = true;
        spokenText = "That check is complete. All steps passed and this ticket is resolved. You're all done.";
      } else {
        const acknowledgement = reply.proposedStatus === "done" ? "That check is complete." : `Saved as ${reply.proposedStatus}.`;
        spokenText = `${acknowledgement} ${nextChecklistPrompt(updated.steps)}`;
      }
    }
    tx.db.resolutionTurns.id.update({ ...turn, stepOrder: reply.stepOrder, assistantTranscript: spokenText,
      intent: reply.intent, status: "ready", modelId: z.string().max(150).parse(data.modelId), updatedAt: tx.timestamp });
    row = tx.db.resolutionSessions.id.update({ ...row, activeStepOrder, revision: nextRevision, status: halted ? "halted" : ended ? "ended" : row.status, updatedAt: tx.timestamp });
    return JSON.stringify(snapshot(tx, row));
  });
});
