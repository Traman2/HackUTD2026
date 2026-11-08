# Milestone 07 — Android App and Meta Glasses Session

**Priority:** P0  
**Depends on:** 01, 02  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

The existing Kotlin Meta SDK application can select a property, connect the glasses, and run a consent-based inspection session with sampled camera frames.

## Ownership / Codebase Boundaries

Primary areas: `apps/mobile-android/app/.../{wearables,inspection,network,ui}`; registration and device permissions kept in the native Android project

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Keep the currently working native Meta SDK project. Verify device registration, session lifecycle, permission prompts, and camera access in the actual demo environment.
2. Create a minimal property selector and inspection start/stop screen; authenticate with an identity mapped to the selected company/space.
3. Request explicit start-of-inspection consent and show a persistent active-capture indicator on the phone; communicate the camera/audio collection to nearby people.
4. Implement periodic frame sampling approximately every three seconds from the active camera stream; skip near-duplicates and upload only useful frames or requested evidence photos.
5. Create an upload queue for selected frames with timestamps, inspection/session IDs, selected space, and asset label if spoken/scanned.
6. Support reconnection, dropped stream, camera permissions, low battery, bandwidth limits, and stop/cancel behavior.
7. Add a phone fallback button to take a photo or manually enter an asset ID in case the glasses connection fails during judging.
8. Verify that voice guidance can be routed to the glasses speakers; do not assume that the SDK itself directly handles all Bluetooth playback behavior.

## Data and Contract Checklist

- Inspection session ID, space ID, wearer identity, capture state, image timestamp, upload state.
- Frame/event IDs must support deduplication on retries.

## Definition of Done

- [ ] On real hardware, a user can start, pause, and stop an inspection without crashing the app.
- [ ] At least one captured frame is associated with the selected space and visible in the web inspection feed.
- [ ] The phone stops uploading when the session ends and recovers gracefully from network failure.

## Judge-Visible Demo Proof

Wear the glasses, start 'Dallas Data Center' inspection, sample a real frame, and show it appear in the appropriate property space.

## Risks / Constraints

Meta SDK camera/audio features vary in maturity. Avoid making experimental raw PCM audio or unpublished capabilities the single point of failure.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
