# Milestone 02 — Private File Storage and Document Library

**Priority:** P0  
**Depends on:** 01  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

A property space can securely accept PDFs and inspection images while Spacetime stores metadata and S3 stores the actual bytes.

## Ownership / Codebase Boundaries

Primary areas: `spacetimedb/src/tables/{documents,uploads}`, `procedures/storage`, `apps/web/src/features/documents`, `apps/mobile-android/.../network`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Create one private S3 bucket for synthetic property PDFs and images; establish environment-specific bucket configuration and scoped credentials.
2. Define a document record: space, uploader, category, MIME type, S3 key, size, checksum, created timestamp, processing state, and visibility.
3. Have a Spacetime procedure authorize an upload and return a short-lived, single-purpose signed S3 URL; clients upload directly to S3 and confirm completion.
4. Validate company/space membership before signing upload or download links; constrain supported file types and maximum sizes.
5. Keep the original file and derived outputs separate: parsed text, thumbnails, image annotations, and extraction metadata refer back to the original document.
6. Design upload statuses (requested, uploaded, verified, processing, completed, failed) and allow user-visible retry of failed steps.
7. Create a document browser with labeled containers, preview/download actions, upload progress, and processing state.
8. Give the mobile app the same authorized path for attaching inspection photos to the correct space; verify that orphaned or failed uploads are cleaned up.

## Data and Contract Checklist

- Document ID, S3 key, uploader, MIME, size, status, category, extraction version.
- Uploaded file must be confirmed before a processing job can run.

## Definition of Done

- [ ] Upload a sample PDF and a JPEG into one space and retrieve both through authorized download links.
- [ ] An unauthorized identity cannot request the files even if it knows an S3 object key.
- [ ] PDF bytes are not persisted in SpacetimeDB rows; metadata and references are.

## Judge-Visible Demo Proof

Upload a synthetic HVAC inspection PDF and show it in the new space's document library with status and preview.

## Risks / Constraints

A signed URL is a bearer credential while valid. Keep validity short, validate uploaded content, and never expose AWS credentials to the browser or phone.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
