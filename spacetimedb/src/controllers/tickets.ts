import { t } from "spacetimedb/server";
import spacetimedb from "../schema";
import { requireSpace } from "../validation/ownership";
import { requestAgent } from "./flowchart";
import { savedTickets } from "./tickets-storage";

// Starts the ticket agent only on explicit request (the "Generate tickets"
// button): returns a signed capability the browser forwards to the agent.
export const generate_space_tickets = spacetimedb.procedure({ spaceId: t.u64() }, t.string(), (ctx, { spaceId }) => requestAgent(ctx, spaceId, "tickets"));
export const get_space_tickets = spacetimedb.procedure({ spaceId: t.u64() }, t.string(), (ctx, { spaceId }) => ctx.withTx(tx => {
  requireSpace(tx, spaceId);
  return JSON.stringify(savedTickets(tx, spaceId));
}));
