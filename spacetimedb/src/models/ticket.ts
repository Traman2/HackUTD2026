import { table, t } from "spacetimedb/server";

const ticketStep = t.object("TicketStep", {
  order: t.u32(), instruction: t.string(), kind: t.string(), expectedResult: t.string(), requiresPhoto: t.bool(),
  // Filled in from the mobile app / glasses as the technician works.
  status: t.string(), result: t.option(t.string()), completedAt: t.option(t.timestamp()),
});
const ticketSource = t.object("TicketSource", { documentId: t.string(), page: t.u32() });

// Maintenance tickets drafted by the ticket agent from a space's problems.
// problemKey identifies the underlying problem so a re-run never duplicates an
// open ticket.
export const tickets = table({ public: false }, {
  id: t.u64().primaryKey().autoInc(), spaceId: t.u64().index("btree"), ownerUsername: t.string(),
  problemKey: t.string(), title: t.string(), kind: t.string(), priority: t.string(), status: t.string(),
  assetLabel: t.string(), equipmentCode: t.string(), overviewNodeId: t.option(t.string()), networkNodeId: t.string(),
  summary: t.string(), safetyNotes: t.string(), steps: t.array(ticketStep), sources: t.array(ticketSource),
  draftedBy: t.string(), jobId: t.string(), createdAt: t.timestamp(), updatedAt: t.timestamp(),
});

// Ticket-agent job state, one row per space.
export const ticketJobs = table({ public: false }, {
  spaceId: t.u64().primaryKey(), ownerUsername: t.string(),
  status: t.string(), stage: t.string(), error: t.option(t.string()),
  jobId: t.string(), leaseUntil: t.timestamp(), lastCreated: t.u32(),
  generatedAt: t.option(t.timestamp()), updatedAt: t.timestamp(),
});
