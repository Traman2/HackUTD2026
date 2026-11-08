# Milestone 05 — Proactive Risk Flags and Cascading Risk Engine

**Priority:** P0  
**Depends on:** 04  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

The backend identifies operational flags before users ask and calculates which dependent systems merit attention when an asset deteriorates.

## Ownership / Codebase Boundaries

Primary areas: `spacetimedb/src/domain/risk`, `reducers/risk`, `tables/{risk_assessments,issues}`, `views/spaceRisks`, `apps/web/src/features/risk-panel`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Separate direct evidence flags (failed inspection, overdue inspection, open work order) from downstream exposure (assets that rely on the affected equipment).
2. Define deterministic rules for overdue dates, known fault statuses, severity tiers, dependency traversal, and deduplication of repeated findings.
3. Decide which inputs a financial impact estimate would need (tenant penalties, downtime assumptions, repair estimate). Show unknowns and ranges rather than inventing exact values.
4. Have Spacetime reducers apply validated new facts and recompute downstream risk in one auditable domain operation. Make repeated events idempotent.
5. Persist a risk snapshot and event history so the dashboard can show exactly what changed and why.
6. Expose prioritized recommendations such as 'inspect generator first' linked to source records, not just color changes.
7. Exercise a simple property graph with an overdue HVAC inspection, then add an adverse observation and confirm affected downstream nodes change risk appropriately.
8. Keep suggestions distinct from authorized real-world actions: no automated equipment shutdown, restart, or safety-critical commands.

## Data and Contract Checklist

- Risk event ID, asset ID, severity, direct/propagated kind, affected assets, supporting event IDs.
- Risk recalculation should be reproducible from the same graph and evidence.

## Definition of Done

- [ ] Risk flags appear immediately after ingestion without a user prompt.
- [ ] Downstream risk propagation follows known edge directions and does not mark unrelated equipment.
- [ ] An assessor can open any risk and inspect evidence, assumptions, and event history.

## Judge-Visible Demo Proof

Show a yellow AHU-03 node for an overdue inspection, then enter a confirmed failed test and watch only connected assets move to elevated risk.

## Risks / Constraints

LLMs can recommend risk interpretation, but deterministic rules should own status transitions and graph traversal wherever possible.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
