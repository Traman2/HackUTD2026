# Milestone 03 — Document Intelligence and Classification

**Priority:** P0  
**Depends on:** 02  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

Uploaded property records are automatically classified and converted into evidence-backed structured facts about equipment, inspections, and contracts.

## Ownership / Codebase Boundaries

Primary areas: `spacetimedb/src/workflows/documents`, `procedures/ai`, `tables/{document_chunks,extractions,ai_jobs}`, `apps/web/src/features/documents`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Define the synthetic document set before prompting the model: HVAC inspection, maintenance history, generator report, network diagram, lease/SLA, utility bill, and a contradictory or overdue record.
2. Build a document processing state machine: file verified, text extraction, classification, fact extraction, review, publication. Store the stage and failure reason in Spacetime.
3. Choose text extraction by file type, preserve page references and document identifiers, and flag scans that require OCR rather than pretending that every PDF contains selectable text.
4. Ask the model to return structured candidate facts: asset identifiers, types, inspection dates, conditions, recommendations, contractual obligations, and source page/quote boundaries.
5. Make the classifier propose document categories/containers but permit a human to rename, move, or reject its suggestions.
6. Validate identifiers, dates, enums, and references before reducers commit extraction results. Keep low-confidence facts as suggestions awaiting review.
7. Store evidence provenance for each extracted fact, including source document, page, and whether the fact came from direct text, a model inference, or user input.
8. Test module procedure-based AI calls first. If PDF/OCR libraries or LangChain dependencies require unsupported Node capabilities, use a narrowly scoped optional sidecar while keeping workflow state and business logic in Spacetime.

## Data and Contract Checklist

- Processing job ID, file ID, candidate facts, page reference, confidence, review status.
- Every published fact must identify its source and extraction version.

## Definition of Done

- [ ] A multi-document sample sorts into categories without requiring hard-coded file names.
- [ ] Each important extracted asset/inspection fact is traceable back to a specific file and page.
- [ ] A deliberately malformed or contradictory document produces a warning/review state rather than a fabricated authoritative result.

## Judge-Visible Demo Proof

Drop a folder of synthetic real estate records into a space, watch classification statuses, and open a flagged outdated HVAC inspection with its source page.

## Risks / Constraints

Extraction is not verification. Maintain distinct fields for observed fact, inferred fact, model confidence, and human review status.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
