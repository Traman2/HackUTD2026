import { TimeDuration } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import spacetimedb from "../schema";
import { agentRequestSchema, agentResponseSchema } from "../validation/agent";

export const ask_agent = spacetimedb.procedure(
  { prompt: t.string() },
  t.string(),
  (ctx, input) => {
    ctx.withTx(tx => {
      const session = tx.db.sessions.identity.find(ctx.sender);
      if (!session || !tx.db.users.username.find(session.username)) {
        throw new SenderError("Log in first.");
      }
    });
    const request = agentRequestSchema.safeParse(input);
    if (!request.success) throw new SenderError("Prompt must contain 1–16000 characters.");
    const url = ctx.env.AGENT_URL;
    const key = ctx.env.AGENT_API_KEY;
    if (!url || !key) throw new SenderError("Agent service is not configured.");

    // External HTTP must run outside withTx; transaction callbacks can retry.
    try {
      const response = ctx.http.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(request.data),
        timeout: new TimeDuration(60_000_000n),
      });
      if (!response.ok) throw new Error("Agent HTTP error");
      return agentResponseSchema.parse(response.json()).text;
    } catch {
      throw new SenderError("Agent request failed. Please try again.");
    }
  },
);
