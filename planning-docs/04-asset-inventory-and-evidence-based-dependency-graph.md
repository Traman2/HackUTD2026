# Milestone 04 — Asset Inventory and Evidence-Based Dependency Graph

**Priority:** P0  
**Depends on:** 03  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

The system turns cross-document facts into a property infrastructure graph with clickable, source-backed equipment nodes and directional dependencies.

## Ownership / Codebase Boundaries

Primary areas: `spacetimedb/src/tables/{assets,dependencies,evidence_links}`, `domain/graph`, `reducers/graph`, `views/spaceGraph`, `apps/web/src/features/graph`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Standardize asset identity across documents: AHU-03, cooling loop, generator, UPS, server room, controls, and tenant/lease obligations. Handle aliases before creating duplicate nodes.
2. Define relation semantics carefully: 'depends on', 'supplies power to', 'cools', 'controls', and 'covered by SLA' should not be conflated.
3. Use an explicit direction convention and document it. Example: 'server room DEPENDS_ON cooling loop'; preserve direction consistently for downstream traversal.
4. Represent candidate edges with evidence and confidence, and publish only reviewed/high-confidence relations to the primary graph.
5. Use Spacetime for asset and edge records. Expose only space-authorized graph data through views/subscriptions.
6. Create a React Flow canvas with zoom, pan, grouping, edge labels, color-coded risk states, and click-to-open a supporting evidence drawer.
7. Support new document imports that merge into the existing asset graph rather than duplicating assets blindly.
8. Include a manual correction/approval pathway for wrong edges and missing relationships.

## Data and Contract Checklist

- Asset ID, aliases, type, space ID, relation type, edge direction, confidence, source references.
- A node/edge should remain stable across re-imports and updates.

## Definition of Done

- [ ] A known test property produces the expected nodes and arrows from multiple documents.
- [ ] Clicking an asset reveals its facts, inspection status, and source documents.
- [ ] An incorrect candidate dependency can be rejected without corrupting the published graph.

## Judge-Visible Demo Proof

Open 'Dallas Data Center'; display AHU-03 → cooling loop → server room → tenant commitment, then click an arrow to show why it exists.

## Risks / Constraints

The graph must not imply a relationship solely because two assets appear in the same document. Evidence and domain meaning matter.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
