# Milestone 01 — Company Identity, Roles, and Property Spaces

**Priority:** P0  
**Depends on:** 00  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

A user can sign in to a company context, create a property space, and see only the spaces they are authorized to access.

## Ownership / Codebase Boundaries

Primary areas: `spacetimedb/src/tables/{companies,users,memberships,spaces}`, `reducers/{spaces,membership}`, `views/`, `apps/web/src/features/{auth,spaces}`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Choose an authentication provider or identity integration that yields a stable authenticated identity accepted by SpacetimeDB. Map it to an app user and company membership.
2. Define company-level roles: admin, property manager, inspector, and viewer. Decide who can create spaces, upload documents, begin inspections, approve work orders, and view confidential records.
3. Model the company-to-user-to-space relationships, timestamps, and space lifecycle (draft, active, archived). Use company ownership as a required attribute on sensitive entities.
4. Create Spacetime reducers for company-approved space creation, rename, and archive. Validate each caller's membership and required role on every mutation.
5. Keep tables containing private customer information private. Expose identity-filtered views for the spaces, memberships, and summaries each caller is allowed to see.
6. Create web screens for company selection, space creation, property metadata, and space navigation. Make empty states and permission errors understandable.
7. Plan cross-tenant and revoked-membership tests before creating any genuine document data. Demo with synthetic organizations and users.

## Data and Contract Checklist

- Company identity, role, membership, space ID, owner identity, archived flag.
- Every read view and mutation must be tenant-scoped.

## Definition of Done

- [ ] Two synthetic companies see different spaces; neither can read or mutate the other's records.
- [ ] A user without permission cannot create/approve a record by calling a reducer directly.
- [ ] Space creation and navigation work after reconnecting the browser.

## Judge-Visible Demo Proof

Log in as Property Manager A, create 'Dallas Data Center', then switch to a separate mock company and show the space is hidden.

## Risks / Constraints

A public Spacetime table is readable by subscribers. Treat tenancy as a server-enforced authorization requirement, not just a frontend filter.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
