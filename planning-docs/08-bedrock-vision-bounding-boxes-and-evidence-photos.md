# Milestone 08 — Bedrock Vision, Bounding Boxes, and Evidence Photos

**Priority:** P0  
**Depends on:** 02, 07  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

A glasses-captured photo becomes a structured, human-reviewable asset observation with optional visual highlight boxes and a permanent evidence link.

## Ownership / Codebase Boundaries

Primary areas: `spacetimedb/src/procedures/vision`, `tables/{inspection_images,observations}`, `apps/web/src/features/inspections`, `apps/mobile-android/.../inspection`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Decide when image analysis runs: user-triggered snap, first frame after asset identification, or sampled frames with deduplication; do not bill a model for every video frame.
2. Send an authorized S3 object reference and associated space/inspection context to the image-analysis procedure; call a vision-capable Bedrock model using server-side credentials.
3. Request structured outputs for visible equipment/labels, possible anomaly, description, image dimensions, candidate bounding boxes, and explicit uncertainty.
4. Normalize and validate bounding boxes against the original image dimensions; reject out-of-bounds, inverted, or mismatched coordinate systems.
5. Store the untouched original image in S3 and save box coordinates, labels, model version, prompt/template version, and observations in Spacetime.
6. Overlay the annotation in the web inspector and let a human approve or correct the area of interest before classifying the issue as confirmed.
7. Associate a photo with a known asset using explicit labels, scanned QR/ID, or a cautious human confirmation path rather than pretending computer vision can always recognize equipment identities.
8. Measure accuracy on a few fixed synthetic/demo images: obvious water accumulation, healthy equipment, no visible asset label, and a confusing reflection.

## Data and Contract Checklist

- Photo ID, dimensions, asset candidate, image object key, bounding boxes, model version, review state.
- Coordinates must correspond to the original image dimensions.

## Definition of Done

- [ ] A photo from glasses appears under the correct asset with an optional visible, well-aligned bounding box.
- [ ] The model can answer 'uncertain' and request human confirmation rather than fabricate a leak.
- [ ] The original photo, metadata, and annotations survive reload and can be inspected in the dashboard.

## Judge-Visible Demo Proof

Show AHU-03 photographed with an obvious simulated issue, then click the saved image to reveal a localized highlighted region and supporting asset records.

## Risks / Constraints

Vision descriptions and boxes are model hypotheses, not proof of a mechanical fault. Use a human inspection result for confirmed failure.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
