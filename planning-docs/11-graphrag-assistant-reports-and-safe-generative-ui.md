# Milestone 11 — GraphRAG Assistant, Reports, and Safe Generative UI

**Priority:** P1  
**Depends on:** 03, 04, 05, 06  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

The dashboard agent answers questions with citations and generates safe, interactive views of property risks rather than generic text only.

## Ownership / Codebase Boundaries

Primary areas: `spacetimedb/src/workflows/query`, `procedures/ai`, `apps/web/src/features/ai-chat`, `packages/shared/`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Define the query experience: user asks 'What happens if AHU-03 fails?' and the system must retrieve relevant evidence, traverse the graph, and state assumptions.
2. Design retrieval around a manageable hackathon corpus first: indexed document metadata, page text, asset links, and graph neighbors. Test semantic search needs before introducing a second database.
3. If embeddings and vector retrieval are essential, validate available retrieval APIs or add an optional TigerData-backed vector index while retaining Spacetime as the authoritative operational database.
4. Use server-side procedures to make model calls and typed tool calls; keep risk calculation and ticket approval inside Spacetime reducers. Treat a LangGraph library as optional until its runtime compatibility is proven.
5. Have the model return a bounded view specification (chart type, series, labels, evidence references) rather than executable React/HTML code.
6. Build a small whitelist of renderer components: bar/line chart, asset dependency subgraph, evidence card, priority table, and inspection summary.
7. Display confidence, document/page citations, unknowns, and model-versus-fact distinctions. Refuse to invent monetary exposure when source values are absent.
8. Test prompt injection from uploaded PDFs and maliciously formatted model output; do not grant document text authority to create tickets, change permissions, or leak data.

## Data and Contract Checklist

- Request ID, retrieved passages, cited evidence references, UI component schema, model uncertainty.
- Model-generated UI cannot carry executable JavaScript.

## Definition of Done

- [ ] A user can ask about AHU-03 and receive a cited response and a relevant interactive visualization.
- [ ] Generated UI uses only approved component types and validated data.
- [ ] A malicious document instruction cannot invoke a privileged reducer or expose cross-company files.

## Judge-Visible Demo Proof

Ask 'Which connected systems are affected if AHU-03 fails?' and render a focused graph plus a sourced risk table.

## Risks / Constraints

Keep this after the glasses → issue → live graph P0 path. A polished chat assistant is optional relative to the sponsor's core 'take action' criterion.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
