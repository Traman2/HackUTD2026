# 09 — Voice resolution agent

Status: implemented, including automatic conversation turns. Original backend design: [voice agent plan](../../../planning-docs/12-meta-glasses-voice-resolution-agent.md).

## Goal

Extend the existing Resolution Mode with spoken checklist guidance and observations. The server uses ElevenLabs Scribe Realtime for recognition, the dedicated LangGraph resolution agent with Bedrock, and ElevenLabs for spoken replies. Configure ELEVENLABS_API_KEY in spacetimedb/.env; ELEVENLABS_VOICE_ID and ELEVENLABS_TTS_MODEL are optional. The phone captures/plays audio, coordinates glasses routing, and displays the same persisted ticket state. No mobile rebuild is needed for this provider switch.

## Existing integration points

- `ui/resolution/ResolutionModeScreen.kt`: camera preview, checklist, and current small `ResolutionViewModel`.
- `ui/tickets/TicketDetailViewModel.kt`: ticket reads, step results, status writes, and reloads.
- `data/Repository.kt` / `SpacetimeClient.kt`: saved identity token, database HTTP calls, procedure support, and plain signed-S3 upload client.
- `glasses/GlassesManager.kt`: DAT camera/device session, not microphone or playback routing.

The backend checklist remains `tickets.steps`, addressed by ticket ID and step order. Authentication sessions in `SessionStore` are distinct from the new persisted resolution session ID.

## Proposed backend contract

Database calls continue to use the saved SpacetimeDB bearer token. Exact generated parameter order and procedure return encoding must be published with the backend implementation before coding positional Android calls.

| Operation | Purpose |
|---|---|
| `start_resolution_session(ticketId, clientRequestId)` | Create/resume a durable checklist-linked session idempotently |
| `authorize_resolution_voice(sessionId)` | Obtain a short-lived signed capability and voice endpoint |
| `confirm_resolution_action(sessionId, actionId, expectedRevision)` | Apply one current pending proposal with the same validation as manual updates |
| `reject_resolution_action(sessionId, actionId)` | Reject a specific proposed change |
| pause / resume / end session | Persist lifecycle state |
| owner-filtered session/turn/action views | Restore session state and history after interruption |

Connect to `wss://<same-host>/agent/voice`, send the capability in the authentication frame, and wait for `session.ready`. No AWS keys or shared agent secret belong in the APK. Voice JSON IDs are decimal strings; SQL row parsing continues to follow the existing database contract.

For one utterance, send `utterance.start` with a durable UUID clientTurnId, binary PCM frames, then `utterance.end`. Use raw signed 16-bit little-endian mono PCM, preferably 16 kHz, and declare the actual sample rate. The server returns partial/final transcripts, a persisted assistant message, an optional action proposal, and an authorized MP3 URL. Download speech without attaching the database bearer token. Notify the server when playback completes or is interrupted.

Only final utterances drive actions. UI partial text must not update checklist state. A retry reuses its clientTurnId; a new observation gets a new ID. Refresh the ticket after the backend confirms a state update. On stale revision, reload rather than overwriting a manual change.

## New mobile components

- `voice/AudioRouteManager.kt`: observe actual input/output devices; select and restore supported routes with API-level handling for minSdk 29. Verify modern communication routing on the target phone.
- `voice/VoiceRecorder.kt`: `AudioRecord`, runtime `RECORD_AUDIO`, bounded uniform chunks, cancellation, silence detection only after the first working version.
- `voice/VoicePlayer.kt`: MP3 playback, audio focus, stop/repeat, route changes, completion acknowledgments.
- `voice/VoiceSessionClient.kt`: OkHttp WebSocket, auth deadline, typed messages, binary audio, heartbeat, reconnect, and bounded queues.
- A separate `ResolutionViewModel.kt`: lifecycle coordination and `StateFlow` for session ID/revision, microphone route, transcripts, pending action, and idle/listening/thinking/speaking/paused/error state.

Keep ticket reads and manual writes in the existing repository/ViewModel path. Add explicit reload coordination for voice updates. Camera and voice have separate resources but share the screen lifecycle.

## Interaction

1. “Start Agent Resolution Mode” opens the overlay and immediately starts the agent. Request microphone access if needed.
2. The agent card matches the checklist: rounded 22dp corners, white text, and black background at 65% opacity. Its only control toggles Start agent / Stop agent.
3. Create/resume the session, authorize the socket, then hear the current saved checklist instruction.
4. Listening starts automatically after playback, with a 450ms echo tail. A turn needs at least 100ms of voiced audio, 1.4s of quiet, and a transcript stable for 700ms. Ignore filler and incomplete phrases. After a four-second gap discard fragments without an agent request. Clear short answers and voice commands remain supported. Rotate recordings after 26 seconds of inactivity/length without completing checklist steps.
5. Clear model-interpreted results save immediately and advance to the next pending step. There is no confirmation round trip. The database checks the session, revision, and ticket version atomically, saves the reported result, and constructs the next spoken instruction. When every step is done, the ticket resolves automatically. Failed/skipped steps do not automatically resolve the ticket.
6. Show the saved checklist result and spoken transcript. Repeat and next are voice commands; there are no Speak, Send, Confirm, Reject, text-entry, or microphone-switch controls on the agent card.

“Next” changes navigation only. “I did not do that” offers skipped/not performed. “Finish” proposes explicit ticket resolution after backend validation; ending a voice session alone does not resolve the ticket.

## Hardware and interruption handling

Test camera plus glasses playback first, then camera plus glasses microphone. DAT camera success does not prove audio capture. If the glasses input is silent or disrupts video, select phone microphone and keep glasses playback, displaying that route. Verify it on hardware before presenting it as supported.

Stop immediately releases capture and playback locally. Background/navigation pauses the durable session and closes media/socket resources; logout ends authorization. Rotation preserves session identity without duplicating recorders. Reconnect obtains a fresh capability and restores database state/pending action; never resend old audio automatically. Offer a fresh explicit retry for an unfinished utterance.

If speech generation or recognition fails, retain saved observations, stop the agent, and show an error. Start agent resumes the checklist. Discarded fragments automatically resume listening. No failed-request loop runs in the background.

## Photos and verification

Say “take a photo” to capture from the glasses' active camera stream. The app uploads through the existing signed S3 PUT and checksum-verification procedures, then attaches the verified photo to the originating ticket and checklist step. Required-photo steps wait for verified evidence before completing. The agent only announces a saved photo after verification. A camera or upload failure keeps the step pending and can be retried by voice.

Reports of an active fire or flooding halt the inspection immediately: the current unfinished step is marked failed, all other pending steps are skipped, completed results are retained, and the ticket remains unresolved. The session stays halted and cannot auto-resume. One automatic glasses photo is attempted with a three-second camera deadline; no camera or upload failure blocks the halt. The agent tells the user to move to safety and contact emergency services, without asking them to remain for a photo. Hypothetical and negated hazard reports do not trigger this deterministic shortcut.

Verify backend session authorization/idempotency and Android assemble/lint. Hardware tests must cover real audio routes, permission denial, camera coexistence, fold/reconnect, background/rotation, stop during speech, echo, network loss after confirmation, and app restart/resume. Demo completion requires hearing an instruction, recording/confirming an observation, seeing the actual checklist update, and resuming its saved conversation.
