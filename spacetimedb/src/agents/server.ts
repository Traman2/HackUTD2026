import { createServer } from "node:http";
import process from "node:process";
import { createBedrockClient } from "../clients/bedrock.ts";
import {
  agentRequestSchema,
  agentResponseSchema,
} from "../validation/agent.ts";
import { Buffer } from "node:buffer";

const apiKey = process.env.AGENT_API_KEY;
if (!apiKey) throw new Error("AGENT_API_KEY is required.");
const model = createBedrockClient({ maxRetries: 0 });

// Contract: POST /invoke + Bearer token, { prompt } -> { text }.
const server = createServer(async (req, res) => {
  const send = (status: number, body: object) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST" || req.url !== "/invoke") {
    send(404, { error: "Not found" });
    return;
  }
  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    send(401, { error: "Unauthorized" });
    return;
  }
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 100000) {
        send(413, { error: "Request too large" });
        return;
      }
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
    console.log("Bedrock agent service listening", server.address());
  },
);
