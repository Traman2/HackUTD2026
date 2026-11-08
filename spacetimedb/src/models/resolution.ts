import { table, t } from "spacetimedb/server";

export const resolutionSessionFields = {
  id: t.string().primaryKey(), ticketId: t.u64().index("btree"), ownerUsername: t.string().index("btree"),
  actorIdentity: t.identity(), status: t.string(), activeStepOrder: t.u32(), revision: t.u32(),
  checklistJson: t.string(), grantNonce: t.string(), connectionId: t.string(),
  leaseUntil: t.timestamp(), createdAt: t.timestamp(), updatedAt: t.timestamp(),
};
export const resolutionSessions = table({ public: false }, resolutionSessionFields);
export const resolutionTurnFields = {
  id: t.string().primaryKey(), sessionId: t.string().index("btree"), clientTurnId: t.string(),
  stepOrder: t.u32(), userTranscript: t.string(), assistantTranscript: t.string(),
  status: t.string(), intent: t.string(), modelId: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp(),
};
export const resolutionTurns = table({ public: false }, resolutionTurnFields);
export const resolutionActionFields = {
  id: t.string().primaryKey(), sessionId: t.string().index("btree"), turnId: t.string(),
  kind: t.string(), stepOrder: t.u32(), status: t.string(), result: t.string(),
  expectedTicketVersion: t.string(), expectedRevision: t.u32(), state: t.string(),
  createdAt: t.timestamp(), confirmedAt: t.option(t.timestamp()),
};
export const resolutionActions = table({ public: false }, resolutionActionFields);
