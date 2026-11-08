import { createServer } from "node:http";
import process from "node:process";
import { bedrockModelId, createBedrockClient } from "../clients/bedrock.ts";
import {
  agentRequestSchema,
  agentResponseSchema,
} from "../validation/agent.ts";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SpacetimeGraphStore } from "./spacetime-graph-store.ts";
import { generateFlowchart, GraphInputError } from "./flowchart.ts";
import { analyzeRisk } from "./risk-agent.ts";
import { manifestSchema } from "../validation/flowchart.ts";

const apiKey = process.env.AGENT_API_KEY;
if (!apiKey) throw new Error("AGENT_API_KEY is required.");
const model = createBedrockClient({ maxRetries: 0 });
const jobs = new Map<string, Promise<void>>();

function generationFailure(error: unknown) {
  if (error instanceof GraphInputError) return error.message;
  const causes: { name?: string; message?: string; cause?: unknown }[] = [];
  let current: unknown = error;
  while (current && typeof current === "object" && causes.length < 5) {
    const cause = current as { name?: string; message?: string; cause?: unknown };
    causes.push(cause); current = cause.cause;
  }
  const detail = causes.map(cause => `${cause.name || ""} ${cause.message || ""}`).join(" ");
  if (/AccessDenied|not authorized|access to.*model|use case details/i.test(detail)) return `AWS access to ${bedrockModelId()} was denied. Enable access to the selected model and grant Bedrock invocation permissions in the configured region.`;
  if (/ResourceNotFound|inference profile|model identifier/i.test(detail)) return `AWS could not use ${bedrockModelId()}. Check its model ID, regional availability, and any required inference profile.`;
  if (/Throttling|ServiceQuota|TooManyRequests/i.test(detail)) return "AWS Bedrock throttled the request. Completed page analyses are saved; please retry shortly.";
  if (/Timeout|AbortError/i.test(detail)) return "Graph generation timed out. Completed page analyses are saved; please retry.";
  if (/ModelError|ToolUse|ValidationException/i.test(detail)) return `Bedrock rejected or failed a ${bedrockModelId()} request. Check the failed stage and corresponding LangSmith trace.`;
  return "Graph generation failed. Check the failed stage and corresponding LangSmith trace, then retry.";
}

// Internal routes require the shared Bearer token. The browser dispatch route
// instead requires a short-lived capability signed by the database after auth.
// /flowchart/start enqueues a job; /flowchart/get reads progress and saved data.
const server = createServer(async (req, res) => {
  const send = (status: number, body: object) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST" || !["/invoke", "/flowchart/start", "/flowchart/get", "/flowchart/dispatch"].includes(req.url || "")) {
    send(404, { error: "Not found" });
    return;
  }
  if (req.url !== "/flowchart/dispatch" && req.headers.authorization !== `Bearer ${apiKey}`) {
    send(401, { error: "Unauthorized" });
    return;
  }
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 500000) {
        send(413, { error: "Request too large" });
        return;
      }
    }
    if (req.url !== "/invoke") {
      let json: unknown;
      try { json = JSON.parse(body); }
      catch { send(400, { error: "Invalid graph request." }); return; }
      let operation = req.url === "/flowchart/start" ? "generate" : "get";
      if (req.url === "/flowchart/dispatch") {
        const ticket = json as { payload?: unknown; signature?: unknown } | null;
        if (!ticket || typeof ticket.payload !== "string" || typeof ticket.signature !== "string" || !/^[a-f0-9]{64}$/.test(ticket.signature)) {
          send(401, { error: "Invalid flowchart authorization. Please retry." }); return;
        }
        const expected = createHmac("sha256", apiKey).update(ticket.payload).digest();
        if (!timingSafeEqual(expected, Buffer.from(ticket.signature, "hex"))) {
          send(401, { error: "Invalid flowchart authorization. Please retry." }); return;
        }
        let grant;
        try { grant = JSON.parse(ticket.payload); }
        catch { send(400, { error: "Invalid flowchart authorization." }); return; }
        if (!grant || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt < Date.now() || grant.expiresAt > Date.now() + 65_000 || !["get", "generate", "risk"].includes(grant.operation)) {
          send(401, { error: "Flowchart authorization expired. Please retry." }); return;
        }
        operation = grant.operation;
        json = grant.manifest;
      }
      const parsed = manifestSchema.safeParse(json);
      if (!parsed.success) { send(400, { error: "Invalid graph request." }); return; }
      const manifest = parsed.data;
      const graphStore = new SpacetimeGraphStore(manifest);
      if (operation === "risk") {
        // Risk analysis runs only on an explicit button press; one job per space.
        const riskKey = `${graphStore.key()}:risk`;
        if (!jobs.has(riskKey)) {
          if (jobs.size >= 4) { send(429, { error: "The agent is busy. Please try again shortly." }); return; }
          let started: boolean;
          try { started = await graphStore.riskBegin(); }
          catch (error) {
            // Preconditions (no flowchart, generation running) come from the database.
            const message = (error instanceof Error ? error.message : typeof error === "string" ? error : "").replace(/^.*fatal error:s*/i, "");
            send(409, { error: message.slice(0, 300) || "Risk analysis could not start. Please retry." });
            return;
          }
          if (started) {
            const heartbeat = setInterval(() => { void graphStore.riskHeartbeat().catch(() => {}); }, 30000);
            const job = analyzeRisk(manifest, graphStore)
              .catch(async error => {
                await graphStore.riskFail(generationFailure(error).replace("Graph generation", "Risk analysis")).catch(() => {});
                console.error("Risk job failed", error instanceof Error ? error.name : "UnknownError");
              }).finally(() => { clearInterval(heartbeat); jobs.delete(riskKey); });
            jobs.set(riskKey, job);
          }
        }
        send(200, await graphStore.riskGet());
        return;
      }
      const key = graphStore.key();
      if (operation === "generate" && !jobs.has(key)) {
        if (!manifest.documents.length) { send(400, { error: "Add and verify PDF documents before generating a flowchart." }); return; }
        if ([...jobs.keys()].filter(item => !item.endsWith(":risk")).length >= 2) { send(429, { error: "The agent is busy. Please try again shortly." }); return; }
        const started = await graphStore.begin(manifest);
        if (!started) { send(200, await graphStore.get(manifest)); return; }
        const heartbeat = setInterval(() => { void graphStore.heartbeat().catch(() => {}); }, 30000);
        const job = generateFlowchart(manifest, graphStore)
          .catch(async error => {
            await graphStore.fail(manifest, generationFailure(error)).catch(() => {});
            // Never log corpus contents, signed URLs, or provider request bodies.
            console.error("Flowchart job failed", error instanceof Error ? error.name : "UnknownError");
          }).finally(() => { clearInterval(heartbeat); jobs.delete(key); });
        jobs.set(key, job);
      }
      send(200, await graphStore.get(manifest));
      return;
    }
    let input;
    try {
      input = agentRequestSchema.parse(JSON.parse(body));
    } catch {
      send(400, { error: "Prompt must contain 1-16000 characters" });
      return;
    }
    const response = await model.invoke(input.prompt, {
      signal: AbortSignal.timeout(55000),
      runName: "agent.invoke",
    });
    send(200, agentResponseSchema.parse({ text: response.text }));
  } catch {
    send(502, { error: "Bedrock request failed" });
  }
});
server.requestTimeout = 15000;
server.listen(
  Number(process.env.AGENT_PORT || 3001),
  process.env.AGENT_HOST || "127.0.0.1",
  () => {
    console.log("Bedrock agent service listening", server.address(), "model:", bedrockModelId());
  },
);
