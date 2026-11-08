# Meta glasses voice resolution agent

Status: implementation plan, based on repository review on 2026-11-08. No runtime code or AWS resources changed.

## Outcome

Add a dedicated LangGraph resolution agent that guides a technician through an existing maintenance ticket over voice. Amazon Transcribe converts observations to text; the existing Bedrock integration reasons over the ticket and its sources; Amazon Polly converts each reply to playable speech. Persist the session, turns, confirmations, and evidence associations in SpacetimeDB, linked to the ticket's actual checklist.

Spoken audio is the primary response. Keep the exact spoken transcript on the phone and in the database for accessibility, recovery, and audit. Session persistence must survive app and agent restarts.

## What exists today

- `apps/mobile` is the Kotlin/Compose app. Root milestones 07–10 still mention an older `apps/mobile-android` layout; implement against the actual `apps/mobile` source.
- `ResolutionModeScreen.kt` shows glasses video with a checklist overlay. Its `ResolutionViewModel` currently owns glasses lifecycle only. `TicketDetailViewModel` loads ticket state and saves manual results through `Repository`.
- `GlassesManager.kt` opens a DAT device session and starts `GlassesCamera`. There is no audio recorder, audio route manager, speech player, or voice transport. The manifest has no `RECORD_AUDIO` permission.
- `spacetimedb/src/agents/ticket-agent.ts` already generates short, spoken-style instructions and safety notes using LangGraph and `createBedrockClient()`.
- The checklist is `tickets.steps`: each entry has `order`, `instruction`, `expectedResult`, `requiresPhoto`, `status`, and result metadata. There is no separate troubleshooting checklist table to integrate with.
- `controllers/ticket-work.ts` implements `update_ticket_step`, `set_ticket_status`, owner-scoped reads, S3 photo authorization, and append-only `ticketEvents`.
- `models/session.ts` contains authentication sessions only. Do not reuse it for inspection conversations.
- `agents/server.ts` is already a Node HTTP agent service. `/chat` uses a database-issued signed capability; `SpacetimeGraphStore` uses a signed server-to-database persistence channel. Reuse these patterns with a distinct voice audience and session scope.
- `scripts/tunnel-router.mjs` already forwards `/agent/*` HTTP and WebSocket traffic to the agent service. The agent service itself needs a WebSocket handler.
- Some mobile planning statements predate this architecture: SpacetimeDB remains authoritative, but a separate Node agent service already exists. Voice should run there, not inside a synchronous database procedure.

## Architecture

```text
Glasses microphone (when verified) / phone microphone
  -> Android AudioRecord -> authenticated WSS /agent/voice
  -> Node voice transport -> Amazon Transcribe Streaming
  -> final utterance -> resolution LangGraph -> validated proposal
  -> SpacetimeDB persisted turn / confirmation / checklist update
  -> Amazon Polly -> audio reply -> Android player -> glasses speakers

Android and web read the same SpacetimeDB tickets and voice session views.
Large retained audio and existing evidence photos live privately in S3.
```

Use a bounded state machine rather than an open-ended autonomous agent. The model helps interpret observations and explain approved steps; database transactions control workflow changes.

## 1. Prove hardware and AWS prerequisites first

1. On the actual Galaxy S24 Ultra and Wayfarer Gen 2, verify speech playback through glasses with the current DAT camera stream active.
2. Test microphone capture with Android communication-device routing and inspect actual routed devices and non-silent input. Test the microphone before and during camera streaming. Do not infer microphone availability from successful camera registration.
3. If simultaneous glasses microphone and camera capture fails, use phone microphone plus glasses playback and expose that route on the phone. Start with half-duplex turns to avoid transcribing the assistant's own speech. A later hands-free endpointing mode can use silence detection after hardware verification.
4. Add Android microphone runtime permission and audio settings permission as required. Use version-appropriate routing for the app's API 29+ support, restoring prior routes/audio mode when the session stops. Do not require a background microphone service for the first version: backgrounding pauses capture.
5. Verify the existing server AWS credential chain and region with small Transcribe and Polly smoke calls; verify the selected Polly voice supports the configured engine in that region. Current review found no AWS CLI or dedicated AWS connector, so live credentials and speech permissions are unverified.

Hardware evidence: Android recommends `setCommunicationDevice()` for modern communication routing. Reports in Meta's official repository describe silent HFP input and camera sessions ending when a glasses microphone connects. These reports justify an early hardware test; they do not establish that this project's hardware is affected.

## 2. Persist sessions against the existing checklist

Add private tables in `models/voice-session.ts`, register them in `schema.ts`, and export operations through `index.ts`.

| Table | Suggested fields | Purpose |
|---|---|---|
| `resolutionSessions` | id, ticketId, spaceId, ownerUsername, startedBy, status, activeStepOrder, checklistSnapshotJson, checklistHash, revision, summary, lastActivityAt, createdAt, endedAt | Durable workflow and ticket/checklist association |
| `resolutionTurns` | id, sessionId, ticketId, stepOrder, clientTurnId, sequence, userTranscript, assistantTranscript, intent, status, proposedActionJson, sourceRefsJson, errorCode, modelId, promptVersion, createdAt | Auditable utterance and response, including failure/retry stages |
| `resolutionActions` | id, sessionId, turnId, ticketId, stepOrder, actionType, proposedResult, expectedRevision, state, confirmedBy, confirmedAt, appliedEventId | Pending, confirmed, rejected, superseded, or applied action; confirmation bound to one proposal |
| `resolutionMedia` | id, sessionId, turnId, stepOrder, kind, photoId or private object reference, contentType, sizeBytes, expiresAt, createdAt | Optional speech replay assets and existing photo associations |

Use session and ticket indexes, server timestamps, and application-enforced uniqueness for `(sessionId, clientTurnId)` in one transaction. Serialize database u64 IDs as decimal strings in voice JSON to avoid JavaScript precision loss.

The composite `(ticketId, stepOrder)` identifies the existing step. Save an immutable snapshot of instruction, expected result, photo requirement, safety notes, and ticket source references when starting a session; do not fork mutable checklist status. Always reload live ticket state before proposing or applying changes. A hash of checklist definitions detects changed instructions without treating ordinary status changes as a new checklist.

Allow multiple historical sessions per ticket but one active writable session per ticket initially, with a lease/heartbeat and explicit resume or takeover. Record the actor separately from the owner using today's owner-based authorization model.

Keep finalized transcripts and workflow events durable. Do not retain raw microphone audio by default. Persist synthesized MP3 for bounded replay in a private S3 prefix with lifecycle expiry, or regenerate it from the saved assistant transcript. Store object references rather than expiring signed URLs. Define the retention duration as configuration before enabling audio archival.

## 3. Database authorization and transactional commands

Add owner-filtered `my_resolution_sessions`, `my_resolution_turns`, and pending-action views. Apply `requireUser` / `requireTicket` semantics to every mobile read/write; hide raw tables.

Proposed mobile API:

- `start_resolution_session(ticketId, clientRequestId)` returns the session ID and snapshot; repeated requests return the same session.
- `authorize_resolution_voice(sessionId)` returns a short-lived, session-scoped signed capability and endpoint information.
- `confirm_resolution_action(sessionId, actionId, expectedRevision)` applies a specific pending proposal atomically, writes its ticket event, and increments the revision. A repeated confirmation returns the prior result.
- `reject_resolution_action(sessionId, actionId)` preserves the rejected proposal for audit.
- `pause_resolution_session` / `resume_resolution_session` / `end_resolution_session` own lifecycle transitions.

The capability includes audience, operation, session/ticket/space, authenticated actor, expiry, and nonce. Validate the signature's shape before constant-time comparison. Consume the nonce at connection establishment; renew authorization on reconnect and periodically revalidate login/session access during a live connection. Keep AWS credentials and `AGENT_API_KEY` server-side.

Add a narrowly scoped signed `agent_resolution_store` channel, modeled on `SpacetimeGraphStore`, for loading context, reserving turns, saving outputs, and proposing actions. Independently validate session ownership, lease/revision, allowed operation, and proposal schema in the database; a server signature alone must not permit arbitrary ticket writes.

Extract shared ticket mutation logic from `ticket-work.ts` so manual and confirmed voice actions use identical validation and event creation in the same transaction. Preserve the existing `update_ticket_step` signature for mobile compatibility. Add optional session/turn linkage to ticket audit events or an explicit linking table.

Existing rules must remain true: only active tickets accept step work, archived spaces reject work, pending steps prevent resolution, and terminal tickets require valid transitions. Completing a conversation never automatically resolves a ticket.

## 4. Dedicated LangGraph resolution agent

Add `agents/resolution-agent.ts`, `validation/resolution.ts`, and `agents/spacetime-resolution-store.ts`.

Per-turn graph:

```text
load_session_and_live_ticket
  -> validate_checklist_revision
  -> classify_final_utterance
  -> explain_step | navigate | propose_result | request_clarification | propose_finish
  -> validate_structured_output
  -> persist_turn_and_optional_proposal
  -> synthesize_speech
  -> persist_audio_ready_or_speech_failure
```

State contains session/turn IDs, current step, bounded recent history and summary, live ticket revision, checklist sources, pending action, and cancellation signal. Restore from SpacetimeDB on each invocation; an in-memory LangGraph checkpointer alone is insufficient. Use session ID as the workflow correlation ID, and persisted turn stages to resume after a process failure without repeating mutations or inference unnecessarily.

Structured output: `spokenText`, intent, target step, optional proposed action/result, source references, and clarification requirement. Cap response length to one or two short sentences and one question. Speak only supplied instructions and supported explanations. Preserve current ticket-agent restrictions against hazardous operations and inventing thresholds. Avoid markdown, JSON, and long source filenames in speech; show citations on the phone.

Support: repeat, explain, next, previous, done, failed, skipped/not performed, correct the previous observation, take a photo, pause, stop, and finish. Navigation does not mark a step complete. Uncertain or ambiguous speech prompts clarification. Corrections create new events rather than deleting history. A failed Bedrock call can still replay the saved checklist instruction and retain the user's finalized observation.

Result-changing commands first create a pending action and ask a specific confirmation, e.g. “Record step three as failed because you saw water?” Explicit voice confirmation or the phone confirmation button applies the same command. Bind voice yes/no to the current action ID and revision; reject stale confirmations after navigation or manual changes. Deterministically recognized confirmation intent is still validated against that pending action.

## 5. Voice transport and AWS adapters

Add `@aws-sdk/client-transcribe-streaming`, `@aws-sdk/client-polly`, and a WebSocket server dependency to the Node agent package. Use production dependencies for server runtime adapters; use the existing AWS default credential provider chain.

Extend `agents/server.ts` with a dedicated WebSocket upgrade at `/voice`, served publicly as `/agent/voice`. Keep voice message limits and timeouts separate from its existing JSON routes (500 KB body limit and 15-second request timeout). Use an authorization first frame over WSS, with a short authentication deadline and no forwarding of audio before authorization. Do not put tokens in URLs or log them.

Protocol v1:

| Direction | Message | Behavior |
|---|---|---|
| Client -> server | `authenticate` | Signed capability, protocol version, optional reconnect cursor |
| Server -> client | `session.ready` | Session revision, current step, persisted pending action |
| Client -> server | `utterance.start`, binary PCM frames, `utterance.end` | Unique clientTurnId, format and actual sample rate; bounded duration |
| Server -> client | `transcript.partial`, `transcript.final` | Only final assembled utterances enter the agent |
| Server -> client | `assistant.message`, `action.proposed`, `audio.ready` | Persisted turn ID, exact spoken text, optional proposal, authorized short-lived MP3 URL |
| Client -> server | `playback.completed`, `playback.interrupted`, `cancel`, `ping` | Playback acknowledgment and lifecycle control |
| Server -> client | `state.updated`, `error`, `pong` | Authoritative revision and retryable stage/error information |

Transcribe accepts signed 16-bit little-endian raw PCM, not a WAV header. Prefer mono 16 kHz and uniform 50–100 ms chunks, but send the real rate or resample correctly if the Bluetooth input supplies another rate. Interim transcripts are display-only. Assemble final segments until the utterance boundary so one spoken sentence does not trigger multiple actions. Limit initial utterances to 30 seconds and one turn in flight per session.

Use Transcribe Streaming through the AWS SDK. End the AWS audio stream cleanly and wait for final results before invoking the graph. Start with bounded utterances; add a long-lived listening stream only after correctness is proven. Add equipment vocabulary later if recordings demonstrate a need.

Polly `SynthesizeSpeech` produces MP3 from the persisted `spokenText`. Configure voice and engine together; validate their regional availability. A speech failure retries synthesis for the saved turn, without rerunning an applied action. The mobile client downloads audio through its plain S3 HTTP client, without database authorization headers. Renew expired playback URLs through an owner-authorized operation. Persist playback acknowledgment separately: audio generated does not mean the user heard it.

Apply per-user concurrency, bounded buffers/backpressure, utterance and session idle limits, upstream timeouts, heartbeat, cancellation, and graceful connection cleanup. Use half-duplex capture/playback initially. Stop interrupts local playback and capture immediately even if the network is unavailable; reconnect reloads database state without replaying an old microphone buffer automatically.

## 6. Mobile integration

Detailed mobile implementation contract: [guide 09](../apps/mobile/mobile-plan-guide/09-voice-resolution-agent.md).

- Add `voice/AudioRouteManager.kt`, `VoiceRecorder.kt`, `VoicePlayer.kt`, and `VoiceSessionClient.kt`; keep these separate from camera lifecycle.
- Move the small `ResolutionViewModel` into its own file and give it voice session state and lifecycle coordination. Keep `TicketDetailViewModel` as the source of ticket reads/manual updates; refresh it on persisted voice changes.
- Extend `Repository`, `SpacetimeClient`, and `Models` for session procedures, authorized session history, action confirmations, and the agent endpoint. Continue using the saved Spacetime identity token for database calls.
- Add consent/start, listening/thinking/speaking/error indicators, current audio route, repeat, push-to-talk, pause, stop, transcript, and proposal confirmation to the existing camera/checklist screen. The glasses have no display: visual controls and text remain on the phone.
- Release microphone, playback, sockets, and audio routes on stop, logout, navigation away, or background. Pause the persisted session for recoverable interruptions. Rotation preserves session identity and must not create duplicate recorders or sockets.

## 7. Evidence photos

Reuse `request_ticket_photo_upload` and `confirm_ticket_photo_upload`. The mobile app currently lacks photo capture/upload controls despite retaining the repository upload path, so “take a photo” needs a new DAT capture integration. Bind the capture request to a specific session, turn, and step before invoking the camera. Link only a verified photo from the same authorized ticket. A required photo remains evidence-pending until upload verification; never claim that a requested photo was saved.

Treat photo capture as a follow-on milestone if needed for the first voice demo. The first release can guide existing checklist steps and explicitly report unavailable photo capture. Do not add continuous frame uploads or assume the configured text model supports vision; photo interpretation requires a separately verified multimodal model.

## 8. AWS configuration and access

Proposed configuration: `VOICE_AWS_REGION` (fallback to existing AWS region), `VOICE_LANGUAGE_CODE=en-US`, `POLLY_VOICE_ID`, `POLLY_ENGINE=neural`, `VOICE_AUDIO_PREFIX`, `VOICE_AUDIO_TTL_SECONDS`, maximum utterance duration, and session idle timeout. Reuse current Bedrock model selection and private S3 storage where suitable.

Server IAM requires `transcribe:StartStreamTranscription`, `polly:SynthesizeSpeech`, existing Bedrock invocation access, and appropriate S3 put/get permissions restricted to the speech prefix. Check each action's supported resource scoping; use wildcard only for actions that require it. Add vocabulary-related permissions only if that feature is introduced. Never ship these credentials in Android configuration.

Before deployment, prove a short PCM sample transcribes, one configured voice synthesizes playable audio, S3 media remains private, and the same server environment can invoke the configured Bedrock model. Measure actual latency and cost rather than promising real-time performance. Target a first spoken reply within roughly five seconds after utterance end for short commands; record Transcribe, model, database, synthesis, and download timings separately.

## Delivery order and acceptance

1. **Hardware and speech spike:** camera + playback + microphone routing matrix, Transcribe/Polly smoke checks. Acceptance: audible reply and a correct finalized observation with a documented input route.
2. **Durable session foundation:** tables, authorized views, session lifecycle, revisions, idempotency, shared ticket mutation helper, regenerated bindings. Acceptance: restart restores the same ticket/step and pending proposal; another owner cannot read or change it.
3. **Agent without microphone:** typed finalized utterances through the graph and real Polly output. Acceptance: grounded short speech, clarification, explicit confirmation, and exactly one audited step update after duplicate retries.
4. **Mobile speech loop:** WSS, recorder/player, route fallback, existing overlay integration. Acceptance: voice and phone confirmation produce the same persisted result and refreshed checklist.
5. **Recovery and evidence:** restart/reconnect, synthesis retries, logout revocation, stale proposal rejection, optional photo integration and session history on ticket details.

Focused verification must cover duplicate final segments, duplicate clientTurnIds, repeated confirmation, simultaneous manual and voice edits, ticket closure/archive mid-session, ownership denial, expired/replayed grants, stop during playback, permission denial, silent Bluetooth input, failed Transcribe/model/Polly calls, and disconnect after database commit but before reply. Check that the agent never says a result was saved before commit.

Run existing backend typecheck/build and regenerate bindings after schema changes. Run Android assemble/lint and targeted session/transport tests; use the actual glasses for camera/audio coexistence, background/rotation, fold/reconnect, and echo tests. A build cannot establish successful audio routing.

Demo: open an existing ticket, start the voice session, hear its current checklist instruction, say an observation, hear and confirm the proposed result, see the step update on phone/web, restart the app, and resume the persisted session. Failed/skipped steps remain distinct from successful checks; final ticket resolution remains an explicit separate action.

## References

- Repository context: root milestones [07](07-android-app-and-meta-glasses-session.md), [08](08-bedrock-vision-bounding-boxes-and-evidence-photos.md), [09](09-guided-inspection-agent-and-human-feedback.md), and [10](10-issue-approval-maintenance-tickets-and-risk-recalculation.md); mobile guides 01 and 05–08.
- [Amazon Transcribe streaming formats and guidance](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html).
- [Transcribe StartStreamTranscription API](https://docs.aws.amazon.com/transcribe/latest/APIReference/API_streaming_StartStreamTranscription.html).
- [Amazon Polly SynthesizeSpeech API](https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html).
- [Android communication audio routing](https://developer.android.com/develop/connectivity/bluetooth/ble-audio/audio-manager).
- Hardware reports in Meta's official repository: [silent microphone during camera streaming](https://github.com/facebook/meta-wearables-dat-android/issues/196), [camera termination when microphone connects](https://github.com/facebook/meta-wearables-dat-android/issues/206).
