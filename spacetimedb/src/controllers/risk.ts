import { t } from "spacetimedb/server";
import spacetimedb from "../schema";
import { requireSpace } from "../validation/ownership";
import { requestAgent } from "./flowchart";
import { savedRisk } from "./risk-storage";

// Starts the risk agent only on explicit request: returns a signed capability
// the browser forwards to the agent's dispatch route.
export const analyze_space_risk = spacetimedb.procedure({ spaceId: t.u64() }, t.string(), (ctx, { spaceId }) => requestAgent(ctx, spaceId, "risk"));
export const get_space_risk = spacetimedb.procedure({ spaceId: t.u64() }, t.string(), (ctx, { spaceId }) => ctx.withTx(tx => {
  requireSpace(tx, spaceId);
  return JSON.stringify(savedRisk(tx, spaceId));
}));
