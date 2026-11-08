# Milestone 10 — Issue Approval, Maintenance Tickets, and Risk Recalculation

**Priority:** P0  
**Depends on:** 05, 08, 09  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

A confirmed inspection finding becomes an approved maintenance issue and propagates risk changes across the existing infrastructure graph.

## Ownership / Codebase Boundaries

Primary areas: `spacetimedb/src/tables/{issues,approvals,work_orders,audit_events}`, `reducers/{issues,workOrders}`, `domain/risk`, `apps/web/src/features/work-orders`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Define two separate objects: a finding/issue that records evidence and a work order that requests intervention. A model may propose but cannot silently approve either.
2. Implement the approval flow: agent proposes issue → person reviews priority, scope, and attachments → authorized user approves/rejects → reducer commits change.
3. Enforce company membership and role checks on the reducer, not just in the mobile approval screen. Record who approved, when, and which evidence was used.
4. Create work order status flow (open, assigned, in progress, resolved, closed) and preserve an immutable action history where practical.
5. Recompute risk for confirmed issue changes using dependency graph traversal and documented severity rules; only known edges should propagate risk.
6. Publish work-order and risk changes to authorized web subscriptions so the React graph and issue panel update automatically.
7. Offer a follow-up inspection recommendation for at-risk dependents, but don't automatically create unrelated tickets or fabricate missing systems.
8. Test duplicate retries, rejected approvals, insufficient permission, failed photo upload, and rollback when a required write fails.

## Data and Contract Checklist

- Proposal ID, issue ID, ticket ID, approval identity, priority, source evidence, risk delta, event log.
- Repeated approvals or network retries must not create duplicate tickets.

## Definition of Done

- [ ] With one explicit approval, one work order appears and the correct node and dependent risk indicators change live.
- [ ] A rejected proposal causes no work order or risk escalation.
- [ ] The work order contains a traceable chain: original document → photo/test evidence → approval → updated risks.

## Judge-Visible Demo Proof

Ask the glasses to create a high-priority AHU-03 ticket, approve on phone, then show a newly created order and downstream risk updates on the React graph.

## Risks / Constraints

Do not confuse 'issue flagged' with maintenance completed. The system facilitates response but does not prove the physical failure has been fixed.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
