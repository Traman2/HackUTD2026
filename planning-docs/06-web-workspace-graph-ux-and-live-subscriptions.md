# Milestone 06 — Web Workspace, Graph UX, and Live Subscriptions

**Priority:** P0  
**Depends on:** 01, 02, 04, 05  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

One coherent React experience lets a property manager manage spaces, browse evidence, investigate graph alerts, and watch live updates.

## Ownership / Codebase Boundaries

Primary areas: `apps/web/src/app`, `features/{spaces,documents,graph,risk-panel,inspections,work-orders}`, `lib/spacetime`, generated `module_bindings`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Create an app shell with company switcher, property space switcher, navigation, and an intentional empty state for a new property.
2. Build a space detail view with document containers on one side and a primary infrastructure map area.
3. Connect React Flow node and edge state to authorized Spacetime subscriptions; avoid maintaining competing local copies of server truth.
4. Create an asset detail drawer with component identity, source evidence, inspection history, open issues, and affected dependents.
5. Show a clear review state for model-extracted facts and distinguish verified data from AI suggestions.
6. Design statuses for upload/AI job progress, offline/reconnect behavior, access denials, and empty or incomplete graphs.
7. Add a live inspection activity feed that subscribes to new observations and work orders, but do not show cross-company events.
8. Use Tailwind/shadcn/UI and GSAP only after core interactions work; preserve keyboard access and readable risk colors/labels.

## Data and Contract Checklist

- Typed client subscription shapes for space graph, issue lists, work-order status.
- No direct browser access to confidential raw private tables or AWS keys.

## Definition of Done

- [ ] A browser in another session sees space/graph/issue changes through subscriptions with no manual refresh.
- [ ] Every critical card links to the originating document or inspection evidence.
- [ ] The interface clearly distinguishes draft detections, confirmed findings, and work orders.

## Judge-Visible Demo Proof

Run two browser windows: in one approve a synthetic issue; in the other watch the React Flow node and risk panel update live.

## Risks / Constraints

Treat generative components as typed, bounded views over trusted server data. Never execute arbitrary model-produced JavaScript or HTML.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
