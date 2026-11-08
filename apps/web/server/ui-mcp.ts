import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { panelSchema } from "../src/lib/insights-contract.ts";

// Frontend-owned companion server: a browser cannot listen for HTTP connections.
export function startUiMcp(key: string) {
  const server = createServer(async (req, res) => {
    const fail = (status: number) => { res.writeHead(status); res.end(); };
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ service: "property-insights-ui" }));
      return;
    }
    if (req.url !== "/mcp" || req.method !== "POST") return fail(404);
    if (req.headers.origin) return fail(403);
    try {
      const [payload, signature] = (req.headers.authorization?.replace(/^Bearer /, "") ?? "").split(".");
      if (!payload || !/^[a-f0-9]{64}$/.test(signature ?? "")) return fail(401);
      if (!timingSafeEqual(createHmac("sha256", key).update(payload).digest(), Buffer.from(signature!, "hex"))) return fail(401);
      const grant = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (grant.audience !== "insights-panel" || typeof grant.space !== "string" || typeof grant.requestId !== "string" || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt < Date.now() || grant.expiresAt > Date.now() + 180000) return fail(401);
      let body = "";
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 128000) return fail(413); }
      const mcp = new McpServer({ name: "property-insights-ui", version: "1.0.0" });
      mcp.registerTool("render_insights_panel", {
        description: "Replace only the generated Insights panel left of chat. Approved cards, bar/line charts, tables and graphs. Plain text, citations, no scripts or actions. Never invent measurements.",
        inputSchema: panelSchema,
      }, async input => ({ content: [{ type: "text", text: JSON.stringify(panelSchema.parse(input)) }] }));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { void transport.close(); void mcp.close(); });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, JSON.parse(body));
    } catch { if (!res.headersSent) fail(400); else res.end(); }
  });
  server.requestTimeout = 15000;
  server.listen(Number(process.env.UI_MCP_PORT || 3002), "127.0.0.1", () => console.log("Insights UI MCP listening", server.address()));
  return server;
}
