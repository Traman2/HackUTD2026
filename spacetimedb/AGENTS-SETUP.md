# Bedrock procedure

## Insights chatbot and UI MCP

The Insights view docks chat on the right and generated components on the left.
The backend agent discovers `render_insights_panel` over MCP Streamable HTTP,
then uses it to populate approved cards, bar/line charts, tables and dependency
graphs. Tool results return with the chat response and React updates only the
generated Insights panel. Updates appear when the assistant finishes its turn.
The frontend owns the MCP companion under `apps/web/server/`; a browser itself
cannot listen for inbound HTTP connections.

After installing dependencies, publish the updated database module so it exposes
`authorize_space_chat`. Bindings have been regenerated. Start these services in
separate terminals from the repository root:

```powershell
pnpm start:spacetime
pnpm publish:spacetime
pnpm dev:agent
pnpm dev:ui-mcp
pnpm dev:web
```

The agent and UI MCP process both read `spacetimedb/.env` and must use the same
`AGENT_API_KEY` as the published database. The UI MCP listens on loopback port
3002 by default (`UI_MCP_PORT`). The agent connects to
`http://127.0.0.1:3002/mcp` by default (`UI_MCP_URL`). Vite proxies `/api/chat`
to the agent on port 3001. Production hosting must provide the equivalent proxy.

Chat authorization is a short-lived space-scoped capability issued by the
database after checking ownership. The agent loads saved graph/details,
document summaries and risk results from SpacetimeDB, rather than accepting
browser-provided evidence. Generate the property's flowchart first for useful
answers; chat does not independently download or search raw PDF pages.

The UI MCP accepts only backend-signed capabilities and offers no arbitrary
HTML, JavaScript, selectors, navigation, ticket mutations or whole-page tools.
Component citations open the existing document preview at the cited page.
Chat history and generated panels live in the current browser view and are
not persisted after reload.

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
