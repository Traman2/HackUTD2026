import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { startUiMcp } from "./ui-mcp.ts";

export function uiMcpPlugin(): Plugin {
  return {
    name: "insights-ui-mcp",
    async configureServer(vite) {
      const env = fileURLToPath(new URL("../../../spacetimedb/.env", import.meta.url));
      if (existsSync(env)) loadEnvFile(env);
      const port = Number(process.env.UI_MCP_PORT || 3002);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
        const health = await response.json();
        if (response.ok && typeof health === "object" && health !== null && "service" in health && health.service === "property-insights-ui") return;
      } catch { /* Start the companion when no healthy service is available. */ }
      const key = process.env.AGENT_API_KEY;
      if (!key) throw new Error("AGENT_API_KEY is required for chat. Configure spacetimedb/.env with the backend agent's key.");
      const companion = startUiMcp(key);
      await new Promise<void>((resolve, reject) => {
        companion.once("listening", resolve);
        companion.once("error", reject);
      });
      vite.httpServer?.once("close", () => companion.close());
    },
  };
}
