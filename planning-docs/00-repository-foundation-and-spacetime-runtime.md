# Milestone 00 — Repository Foundation and Spacetime Runtime

**Priority:** P0  
**Depends on:** None  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

One pnpm workspace, one live SpacetimeDB module, and working generated React bindings.

## Ownership / Codebase Boundaries

Primary areas: `apps/web/`, `apps/mobile-android/`, `spacetimedb/`, `packages/shared/`, root workspace configuration

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Keep the existing Android Studio project with its working Meta SDK; place it under `apps/mobile-android/` without rewriting it. Kotlin/Gradle are not managed by pnpm.
2. Set up the pnpm workspace for React/TypeScript, SpacetimeDB module, and optional shared TypeScript contracts. Do not introduce Drizzle or a separate Express CRUD backend.
3. Install and pin the SpacetimeDB CLI/runtime version; start a local instance and establish a repeatable build/publish/generate-bindings cycle.
4. Connect the web frontend using generated SpacetimeDB bindings and confirm a reducer mutation appears through a live subscription without manual polling.
5. Decide how teams will manage local vs hosted SpacetimeDB database names, environment variables, deployment identities, and generated artifacts.
6. Reserve `spacetimedb/src/tables`, `reducers`, `procedures`, `views`, `domain`, `workflows`, and `integrations` as code boundaries. Avoid creating multiple default schemas.
7. Test module runtime compatibility with a minimal AI provider HTTP procedure; do not assume a full LangGraph.js runtime will bundle simply because TypeScript npm packages are supported.
8. Add CI checks for module build, TypeScript type checks, and Android compilation (when practical). Keep secrets and local device configuration out of Git.

## Data and Contract Checklist

- Decide table/reducer/procedure/view naming conventions and generated-binding ownership.
- Agree on shared identifiers for company, space, asset, document, inspection, issue, and work order.

## Definition of Done

- [ ] Web app can read a synthetic record, create a new test record, and see that mutation through a subscription.
- [ ] Spacetime module publishes from a clean clone with documented prerequisites.
- [ ] All team members understand which code lives inside Spacetime and what an optional sidecar would do.

## Judge-Visible Demo Proof

Display the web app alongside Spacetime logs; create a dummy record and show an immediate live UI update.

## Risks / Constraints

Watch for TypeScript module bundling/runtime limitations and generated-binding drift. Treat SDK compatibility as a small proof-of-concept before building AI workflows.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
