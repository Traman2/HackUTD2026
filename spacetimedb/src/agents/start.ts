import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// Load in the watched child, before importing LangChain. The watch supervisor
// must not preload .env or children could inherit the old model on restart.
const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);
await import("./server.ts");
