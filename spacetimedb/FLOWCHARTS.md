# Space document flowcharts

The first sidebar button starts a background Deep Agents job for a space.
SpacetimeDB is the authoritative store for source metadata, generation progress,
completed graphs, and cached page findings. S3 stores only the source PDF bytes.

## SpacetimeDB models

`src/models/flowchart.ts` defines two private models:

- `flowcharts`: keyed by `spaceId`. Stores the owner, typed `nodes` and `edges`
  arrays with source evidence, document inventory, generation status, progress,
  error, source fingerprints, generation timestamp, and job lease.
- `flowchart_page_findings`: successful page-batch analyses, keyed by a digest
  of deployment, owner, space, document checksum, model, prompt, page batch,
  and analysis version. Findings are reused on matching retries.

The entire finished graph is replaced in one SpacetimeDB transaction. Node IDs,
edge endpoints, and document/page references are validated before saving.
A failed regeneration retains the last successful graph. Changed documents mark
an existing result outdated. No separate database service or local database file
is used by the agent.

## Authorization and transport

`generateSpaceFlowchart` checks ownership and verified uploads, then returns a
60-second HMAC-signed capability for that space and source snapshot. The browser
relays it through `/api/flowchart/dispatch`. Vite proxies that exact path to the
local agent, which verifies the ticket before beginning the job. This avoids
SpacetimeDB's restriction on database-initiated HTTP requests to localhost.

The Node agent uses the SpacetimeDB SDK and `agentFlowchartStore` to persist
progress, cached findings, failures, and results. Each service request is signed
with the backend-only `AGENT_API_KEY`, bound to a space, owner, deployment,
operation, expiry, and job ID. Service requests use a different signed payload
shape from browser capabilities. The model never receives signing credentials.

`getSpaceFlowchart` reads directly from SpacetimeDB after checking the caller's
ownership. Saved charts and progress can therefore be loaded without the agent
running. The frontend polls while a job is processing. The agent renews a
2-minute job lease every 30 seconds. An expired job is reported as interrupted,
so another generation can start. Job IDs prevent an obsolete worker overwriting
newer results. Two jobs may run concurrently in each agent process; the database
also prevents concurrent jobs for the same space.

## Document analysis and rendering

The agent downloads every original using a short-lived S3 URL and verifies its
stored size and SHA-256 checksum. Each uncached PDF page is rendered with its
extracted text and passed to a Deep Agent. The model returns nodes and edges
directly; it does not return or choose document/page numbers. Application code
attaches the correct source identity and validates edge endpoints.

The application merges each page update into the accumulated graph, assigns
stable IDs, reuses explicit existing catalogue IDs, deduplicates relationships,
and writes a processing checkpoint to SpacetimeDB after every completed page.
The frontend polls and renders these checkpoints while later pages are analyzed.
There is no final all-document synthesis call or page-report coverage check.
Only completing the whole traversal changes the status to ready. Failed jobs
retain the last checkpoint and are shown as incomplete. Each node or edge keeps
up to eight distinct page references for a bounded evidence display.

Successful page graph updates are cached under a key that also includes the
existing component catalogue, preventing reuse against incompatible node IDs.
Retries reconstruct the graph in page order and reuse compatible page updates.
The page agent can use the bounded read_source_page tool. Broad filesystem,
planning, and delegation tools stay hidden, and automatic prompt-cache markers
remain disabled. The agent uses the current BEDROCK_MODEL_ID, standard LangChain
Zod/toolStrategy output definitions, and an 8,192-token per-page output allowance.
The current integration uses tool-based results, not native schema-enforced
output. Each page has at most six model steps. Application-side Zod validation
and source/endpoint checks run before every checkpoint and final save.

React Flow renders white component cards, category accents, dotted curved arrows,
and a dotted canvas inspired by `apps/web/sample-ui/react-flow-example.png`.
Dagre calculates a left-to-right layout. Zoom, pan, fit-to-view, keyboard focus,
and node dragging are supported. Source chips open private PDF previews at the
cited page. Dragged positions and viewport zoom are not persisted.

## Configuration and startup

Use Node.js 24+ and the pnpm workspace dependencies. Configure `spacetimedb/.env`:

- Existing S3 settings configure the database's signer.
- `AGENT_API_KEY` must match in the published database environment and the agent.
- `SPACETIMEDB_HOST=http://127.0.0.1:3000` and
  `SPACETIMEDB_DB_NAME=hackutd2026` identify the agent's database connection.
- `GRAPH_NAMESPACE=hackutd2026` identifies this deployment in signed requests
  and analysis cache keys. Publish it with the module.
- `AWS_REGION` and `BEDROCK_MODEL_ID` select the Bedrock model; the default is
  selected in that file. AWS credentials use the SDK credential chain.
- `AGENT_PORT` defaults to 3001. Update the Vite proxy if changing this port.
- `LANGSMITH_TRACING`, `LANGSMITH_ENDPOINT`, `LANGSMITH_API_KEY`,
  `LANGSMITH_AGENT_ID`, and `LANGSMITH_AGENT_ENVIRONMENT` configure tracing.
  The agent loads these before importing LangChain. Tool calls, stage names,
  and space/document IDs are included in traces.

From the repository root, in separate terminals as appropriate:

```powershell
pnpm install
pnpm start:spacetime
pnpm publish:spacetime
pnpm dev:agent
pnpm dev:web
```

In production, proxy only `/api/flowchart/dispatch` to the private agent's
`/flowchart/dispatch` endpoint. Keep shared keys out of frontend/Vite variables.
`AGENT_URL` belongs to the older generic agent invocation procedure, not the
flowchart persistence path.

## Limits

Generation supports at most 100 documents, 100 MiB of source PDFs, 200 pages,
100 nodes, and 200 edges in the accumulated graph. Extracted text is
limited to 60,000 characters per page, and the overall job has a 20-minute
deadline. Oversized, encrypted, corrupt, or unavailable documents fail explicitly
instead of producing a chart from a silently incomplete corpus. Finish or clean
up unverified uploads before generating.

## References

- [Deep Agents multimodal input](https://docs.langchain.com/oss/javascript/deepagents/multimodal)
- [LangChain tools](https://docs.langchain.com/oss/javascript/langchain/tools)
- [Nova tool troubleshooting](https://docs.aws.amazon.com/nova/latest/userguide/tools-troubleshooting.html)
- [React Flow Dagre layout](https://reactflow.dev/examples/layout/dagre)
