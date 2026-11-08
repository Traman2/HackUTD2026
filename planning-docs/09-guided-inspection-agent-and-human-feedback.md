# Milestone 09 — Guided Inspection Agent and Human Feedback

**Priority:** P0  
**Depends on:** 04, 05, 07, 08  
**Scope:** CBRE *The Invisible Network* — property intelligence + hands-free inspection

## Objective

The glasses copilot offers an equipment-specific inspection checklist, collects spoken/test results, and turns observations into reviewable evidence.

## Ownership / Codebase Boundaries

Primary areas: `spacetimedb/src/workflows/inspection`, `procedures/agent`, `tables/{inspection_steps,responses}`, `apps/mobile-android/.../{speech,inspection}`

SpacetimeDB is the authoritative application backend. Store operational records and permissioned views in its TypeScript module; use reducers for transactional state changes and procedures for external HTTP/model integrations. Large files remain in S3. Avoid unnecessary Express CRUD endpoints or Drizzle.

## Implementation Plan (No Code)

1. Prepare short, equipment-specific inspection checklists from approved records and manufacturer instructions. Prefer safe, observable checks over physically hazardous operations.
2. Define inspection state: initiated, asset identified, checklist proposed, step active, answer captured, evidence pending, completed/aborted.
3. Use voice input for asset selection, observations, and explicit yes/no confirmations; have a phone-screen fallback when recognition fails.
4. Call model APIs from Spacetime procedures for conversational guidance, while reducers own state transitions, step results, and validation.
5. Ground every instruction and factual claim in the associated document/approved checklist. If instructions are missing, say so and suggest a qualified technician.
6. Make the audio responses brief enough to be usable through open-ear speakers; provide a text transcript on the phone and audit the final inspection answers.
7. Support a deliberate 'I didn't perform that test' state, uncertainty, corrections, and rewind/redo; never turn a vague utterance into an automatic failure.
8. Prove an end-to-end session can continue despite one failed AI call and that no inspection outcome changes without a user-provided or evidence-backed event.

## Data and Contract Checklist

- Inspection session/step IDs, answers, source checklist, timestamps, evidence links, approval state.
- The transcript is supporting evidence, not an implicit authorization.

## Definition of Done

- [ ] The user can choose AHU-03, hear a source-backed checklist step, submit a failed observation, and review it on the phone.
- [ ] Voice and phone confirmations result in the same persisted inspection event.
- [ ] No safety-critical test is instructed without appropriate documentation or authorization.

## Judge-Visible Demo Proof

Have one teammate wear glasses and say 'AHU-03 failed the visual leak check'; show the entry added to the inspection record with evidence and a confirmation prompt.

## Risks / Constraints

Avoid continuous passive surveillance. Run the assistant only in a visible, consented inspection session and provide an immediate stop control.

## Relevant References

- [SpacetimeDB TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/)
- [SpacetimeDB reducers and procedures](https://spacetimedb.com/docs/functions/procedures/)
- [SpacetimeDB access permissions](https://spacetimedb.com/docs/tables/access-permissions/)
- [SpacetimeDB S3 file workflow](https://spacetimedb.com/docs/how-to/app-patterns/store-files-in-s3/)
- [Meta Wearables Android SDK](https://github.com/meta/meta-wearables-dat-android)

---

*Implementation planning only — this file intentionally contains no source code.*
