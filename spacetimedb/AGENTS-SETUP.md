# Bedrock procedure

`ask_agent({ prompt })` requires an application login and returns generated text.
It calls a Node service using `ctx.http.fetch` outside the database transaction.
The service uses the LangChain Bedrock client with Amazon Nova Lite by default.

1. Copy `.env.example` to `.env` in this directory. Replace `AGENT_API_KEY` with
   a random shared secret and configure AWS credentials.
2. Start the agent with `pnpm --dir spacetimedb dev:agent` (Node 24+).
3. Supply the same secret and the service URL when publishing the database:

```powershell
$env:AGENT_URL = "http://127.0.0.1:3001/invoke"
$env:AGENT_API_KEY = "your-shared-secret"
pnpm publish:spacetime
pnpm generate:spacetime
```

The publish command reads these declared variables from the shell; it does not
load the agent's `.env` file. After login, call
`connection.procedures.askAgent({ prompt: "Hello" })` using regenerated bindings.

The service contract is `POST /invoke` with `Authorization: Bearer <shared secret>`
and `{ "prompt": "..." }`, returning `{ "text": "..." }`. Prompts must contain
1–16000 characters. Invalid input returns 400, invalid credentials 401, and
Bedrock failures 502. The procedure hides upstream error details.

The URL must be reachable from the database host. For remote deployment, use an
HTTPS endpoint and configure `AGENT_HOST` for the hosting environment. AWS
credentials remain in the Node process. The procedure times out after 60 seconds;
the service cancels inference after 55 seconds. This initial service invokes a
LangChain model; add tools and agent orchestration in `src/agents/server.ts`.
