# 07 — Agent Resolution Mode: Live Camera + To-Do Overlay

## Current implementation

Resolution Mode now starts the real glasses camera after registration and camera permission.
`GlassesCamera` requests compressed HEVC at MEDIUM quality / 24 fps; `HevcDecoder` renders to a
Compose-managed Surface. Video fills the screen without stretching. Codec parameters are cached
across surface recreation, and decoding waits for a keyframe before showing LIVE.

The bottom half contains a compact, scrollable checklist: title, progress, safety notes, step
instructions, checkboxes, and the current step's expected result. Photo requirement/count badges
are retained. Tap safety notes to read their full text. Checkboxes save through the same
`TicketDetailViewModel` as the detail screen, so changes remain synchronized. Failed/skipped
steps display an indeterminate checkbox and their status. The existing detail sheet remains the
place to add notes or select Failed/Skipped.

The checklist remains usable while the glasses are disconnected or paused. Reconnect creates
a fresh session. Exiting/backgrounding stops the camera, decoder, and session; returning from
the background reconnects a session that was active. The glasses button opens connection
settings. There are no simulated-device controls, phone-camera fallback, AI calls, recording,
or photo capture/upload controls in this implementation.

Verification: eight HEVC parser/configuration tests pass; debug build and lint pass with no
errors. Live video, reconnect, and lifecycle behavior still require a test with worn glasses.

The sections below describe the original guide; the implementation above reflects the current
scope (compact checkboxes, with the agent to follow).

Goal: after tapping **Start Agent Resolution Mode** on a ticket, show the live video from the
glasses full screen, with the ticket's steps as a to-do card covering the bottom half of the video.

## Layout

```
┌──────────────────────────────┐
│ ← CRAC-02 · Critical   ● LIVE│  top bar over video (translucent)
│                              │
│      LIVE GLASSES VIDEO      │  full-screen video (fills whole screen,
│        (fills screen)        │  crop to fill; video is portrait 504×896)
│                              │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ Verify CRAC-02 lockout…  │ │  to-do card: bottom 50% of screen,
│ │ ⚠ Do not reset the unit… │ │  rounded top corners, ~85% opaque
│ │ ✓ 1 Locate CRAC-02 tag   │ │  surface so video shows around it
│ │ ▶ 2 Check lockout tag    │ │  current step highlighted + expected
│ │    Expected: tag visible │ │  result shown under it
│ │ ○ 3 Read BMS screen      │ │
│ │ [ Fail ] [ Skip ] [Done ]│ │  actions for the current step
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

Compose structure:

```kotlin
Box(Modifier.fillMaxSize().background(Color.Black)) {
    GlassesVideo(Modifier.fillMaxSize())                 // layer 1: video
    ResolutionTopBar(Modifier.align(Alignment.TopCenter)) // layer 2
    TodoCard(Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(0.5f)) // layer 3
    ConnectionOverlay(...)                                // centered status when not streaming
}
```

Keep the screen on while in this mode (`view.keepScreenOn = true` via `DisposableEffect`).
Lock to portrait for this screen (the glasses video is portrait).

## Starting the camera stream (after session `STARTED`)

Use the same approach as Meta's CameraAccess sample: request **compressed HEVC** frames and decode
them with Android's hardware `MediaCodec` straight onto a Surface. This is the most efficient path
and is the one Meta ships and tests.

```kotlin
import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.StreamState
import com.meta.wearable.dat.camera.types.VideoFrame
import com.meta.wearable.dat.camera.types.VideoQuality

session.addCamera(
    StreamConfiguration(
        videoQuality = VideoQuality.MEDIUM,   // 504 x 896
        frameRate = 24,                        // allowed: 2, 7, 15, 24, 30
        compressVideo = true,                  // deliver HEVC; we decode with MediaCodec
    )
).onSuccess { camera ->
    val stream = camera.stream
    scope.launch(frameDispatcher) { stream.videoStream.collect { onFrame(it) } }  // subscribe BEFORE start
    scope.launch { stream.state.collect { streamState.value = it } }
    scope.launch { stream.errorStream.collect { showError(it.description) } }
    stream.start().onFailure { error, _ -> showError(error.description) }
}.onFailure { error, _ -> showError(error.description) }
```

- `frameDispatcher = Dispatchers.Default.limitedParallelism(1)` keeps frames in order, off the main thread.
- `StreamState` values: `STARTING`, `STARTED`, `STREAMING`, `PAUSED`, `STOPPING`, `STOPPED`, `CLOSED`.
- Bandwidth: Bluetooth lowers resolution, then frame rate (never below 15 fps) automatically.
  If the image looks blocky, try `VideoQuality.LOW` or `frameRate = 15`.
- To stop: `camera.stop()` (it also stops the stream). Without it, the next `addCamera()` fails
  with "a capability of this type is already active".

## Decoding frames

Copy these from the CameraAccess sample into `glasses/`:
- `stream/HevcDecoder.kt` → class `HevcDecoder` with `start(width, height, surface)`,
  `decodeFrame(bytes, presentationTimeUs)`, `stop()`.
- `class HevcParameterSetCollector` from `stream/VideoCaptureHandler.kt` → collects the
  VPS/SPS/PPS config frames so a decoder created mid-stream can be primed.

Frame handler (simplified from the sample):

```kotlin
fun onFrame(frame: VideoFrame) {
    if (!frame.isCompressed) return
    val bytes = ByteArray(frame.buffer.remaining()).also { frame.buffer.duplicate().get(it) }
    csd.offer(bytes)
    synchronized(decoderLock) {
        val surface = surface
        if (decoder == null && surface != null) {
            decoder = HevcDecoder().also { d ->
                d.start(frame.width, frame.height, surface)
                csd.complete()?.let { d.decodeFrame(it, 0) }
            }
        }
        decoder?.decodeFrame(bytes, frame.presentationTimeUs)
    }
    if (!frame.isCodecConfig) firstFrameReceived.value = true
}
```

## Video surface in Compose

```kotlin
import androidx.compose.foundation.AndroidExternalSurface

@Composable
fun GlassesVideo(onSurface: (Surface?) -> Unit, modifier: Modifier) {
    AndroidExternalSurface(modifier) {
        onSurface { surface, _, _ ->
            onSurface(surface)
            surface.onDestroyed { onSurface(null) }
        }
    }
}
```

When the surface is set to `null`, stop and null the decoder under `decoderLock`; a new decoder is
created on the next frame after a new surface arrives. Until `firstFrameReceived`, show a spinner
with "Waiting for glasses video…".

## To-do card behavior

- Shows the ticket title, safety notes (if any, warning style, collapsible after first view), and
  all steps in a scrollable list.
- **Current step** = first step whose status is `pending`. Auto-scroll to it and highlight it;
  show its `expectedResult` under it.
- Actions on the current step: **Done**, **Failed**, **Skip** → `update_ticket_step`
  (guide 05). Long-press any step to pick a status / add a note.
- After the last step: show "All steps complete" with **Mark resolved** (`set_ticket_status`
  → `resolved`) and **Exit**.
- Updates go through the shared ticket state so the detail screen matches when you go back.
- Optional: a handle to collapse the card to a small bar so the full video is visible.

## Leaving Resolution Mode

Back button / Exit: `camera.stop()`, stop decoder, keep or stop the session (stop it to free the
glasses for other apps). Also stop everything in `onCleared()` of the ViewModel.

Background behavior: for this phase, stop the stream when the app goes to the background
(`ON_STOP`) and restart on return. (The sample uses a foreground service to keep streaming in the
background; add that later if the agent needs it.)

## Connection states to show over the video

| State | Overlay |
|---|---|
| Bluetooth permission missing | "Allow Nearby devices to connect your glasses" + button |
| Not registered | "Connect your glasses" → `startRegistration` |
| Camera permission denied | "Allow camera access in Meta AI" + retry |
| Connecting / `STARTING` | spinner "Connecting to glasses…" |
| `PAUSED` | "Paused by glasses" |
| `STOPPED` | "Glasses disconnected" + **Reconnect** |
| Error | message + Retry |

The to-do card stays usable in every state, so the technician can keep working from the phone if
the glasses drop.

## Later (not in this phase)

The AI agent will plug in here: it will read the current step aloud through the glasses speakers,
listen for the technician's answer, look at video frames, and call `update_ticket_step` itself.
Keep step updates in one function (`completeStep(order, status, note)`) so the agent can call it.

## Done when

- Start Agent Resolution Mode shows live video from the Wayfarer Gen 2 within a few seconds.
- The to-do card covers the bottom half, video is visible above and behind it.
- Tapping Done advances to the next step and the change is visible on the web after refresh.
- Folding the glasses shows the disconnected overlay; Reconnect restores video.
