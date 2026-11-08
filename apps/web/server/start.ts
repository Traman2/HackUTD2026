import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { startUiMcp } from "./ui-mcp.ts";
const env = fileURLToPath(new URL("../../../spacetimedb/.env", import.meta.url));
if (existsSync(env)) loadEnvFile(env);
if (!process.env.AGENT_API_KEY) throw new Error("AGENT_API_KEY is required (same as backend agent).");
startUiMcp(process.env.AGENT_API_KEY);
