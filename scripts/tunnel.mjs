// `pnpm tunnel`: starts the local router and exposes it through ngrok on your static domain.
// Reads NGROK_DOMAIN from the repo root .env.local (run with --env-file-if-exists).
import { spawn } from "node:child_process";
import "./tunnel-router.mjs";

const port = String(process.env.ROUTER_PORT || 8080);
const domain = process.env.NGROK_DOMAIN;
const args = ["http", port];
// --domain works on both older and current ngrok v3 releases (newer ones also accept --url).
if (domain) args.push(`--domain=${domain}`);
else console.warn("NGROK_DOMAIN is not set in .env.local; ngrok will use a random URL.");

// No shell: Windows finds ngrok.exe on PATH directly, and args are passed safely.
const ngrok = spawn("ngrok", args, { stdio: "inherit" });
ngrok.on("error", error => {
  console.error("Could not start ngrok. Install it with: winget install ngrok.ngrok", error.message);
  process.exit(1);
});
ngrok.on("exit", code => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => ngrok.kill(signal));
