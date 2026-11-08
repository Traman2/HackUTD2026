# 06 — Meta Glasses Connection

Goal: initialize Meta's SDK, register the app with the Meta AI app, get camera permission on the
glasses, and open a device session. Hardware: **Ray-Ban Meta Wayfarer Gen 2** (camera, mics,
speakers; no display) + Galaxy S24 Ultra.

Source: Meta Wearables Device Access Toolkit 1.0 docs and the official CameraAccess sample
(`github.com/facebook/meta-wearables-dat-android/tree/main/samples/CameraAccess`).

## One-time phone setup

1. Install the **Meta AI** app (v254+), sign in, pair the glasses.
2. In Meta AI → Settings → turn on **Developer Mode** for the glasses
   (lets an unpublished app register; the app ID / client token can stay `"0"`).
3. Only one third-party app can be registered in Developer Mode at a time.

## How access works (two tiers)

1. **Registration** — your app asks the Meta AI app to list it as a connected app. Done once.
2. **Device permission** — the user grants `CAMERA` to your app inside the Meta AI app
   ("Allow once" or "Allow always").

Without registration, permission requests fail. With registration but no permission, the app
connects but can't use the camera.

## Key APIs (imports verified from the sample)

```kotlin
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.types.RegistrationState
```

| Call | Purpose |
|---|---|
| `Wearables.initialize(context)` | Once per process, before anything else. Second call → `ALREADY_INITIALIZED` |
| `Wearables.startRegistration(activity)` | Opens Meta AI to register; returns via `realestate://` |
| `Wearables.registrationState` | Flow; `RegistrationState.REGISTERED` when done |
| `Wearables.devices` | Flow of linked glasses |
| `Wearables.checkPermissionStatus(Permission.CAMERA)` | suspend, returns `DatResult` |
| `Wearables.RequestPermissionContract()` | Activity-result contract that runs the Meta AI permission flow |
| `Wearables.createSession(AutoDeviceSelector())` | Creates a `DeviceSession` (returns `DatResult`) |
| `session.state` | Flow of `DeviceSessionState`: `STARTED`, `PAUSED`, `STOPPED` |
| `session.errors` | Flow of errors (`error.description`) |
| `session.start()` | Returns immediately; connects in background |

## Steps

### 1. Android runtime permission, then initialize

`BLUETOOTH_CONNECT` is a runtime permission on Android 12+. In `MainActivity`:

```kotlin
private val btPermission = registerForActivityResult(RequestMultiplePermissions()) { result ->
    if (result.values.all { it }) Wearables.initialize(this)   // guard so it runs once per process
}
// onCreate: if already granted → Wearables.initialize(this), else btPermission.launch(arrayOf(BLUETOOTH_CONNECT))
```

Only request this when the user first opens Resolution Mode (not at app start), so login and
tickets work without Bluetooth.

### 2. Register with Meta AI

In `GlassesManager`, collect `Wearables.registrationState` into a `StateFlow`. If not
`REGISTERED`, the Resolution Mode screen shows a **Connect glasses** button →
`Wearables.startRegistration(activity)`. Meta AI opens, the user approves, and Android returns to
`MainActivity` through the `realestate://` intent filter (already in the manifest;
`launchMode="singleTop"` keeps the same activity).

### 3. Camera permission on the glasses

Register the contract in `MainActivity` (must be created before `onStart`):

```kotlin
private var permissionContinuation: CancellableContinuation<PermissionStatus>? = null
private val permissionMutex = Mutex()
private val wearablesPermission =
    registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
        permissionContinuation?.resume(result.getOrDefault(PermissionStatus.Denied))
        permissionContinuation = null
    }

suspend fun requestWearablesPermission(p: Permission): PermissionStatus = permissionMutex.withLock {
    suspendCancellableCoroutine { cont ->
        permissionContinuation = cont
        cont.invokeOnCancellation { permissionContinuation = null }
        wearablesPermission.launch(p)
    }
}
```

Before streaming:

```kotlin
Wearables.checkPermissionStatus(Permission.CAMERA)
    .onSuccess { status ->
        val granted = status == PermissionStatus.Granted ||
            requestWearablesPermission(Permission.CAMERA) == PermissionStatus.Granted
        if (granted) startSession()
    }
    .onFailure { error, _ -> showError(error.description) }
```

Expose `requestWearablesPermission` to `GlassesManager` through an interface the activity
implements, so the manager never holds a leaked Activity reference.

### 4. Device session

```kotlin
Wearables.createSession(AutoDeviceSelector())
    .onSuccess { session ->
        scope.launch { session.errors.collect { showError(it.description) } }
        scope.launch {
            session.state.collect { state ->
                when (state) {
                    DeviceSessionState.STARTED -> startCamera(session)   // guide 07
                    DeviceSessionState.PAUSED  -> { /* keep UI, wait */ }
                    DeviceSessionState.STOPPED -> { camera = null; /* show Reconnect */ }
                    else -> {}
                }
            }
        }
        session.start()     // collect state/errors BEFORE start()
    }
    .onFailure { error, _ -> showError(error.description) }
```

Rules from Meta's lifecycle guide:
- Add the camera only after `STARTED`.
- A `STOPPED` session can't be restarted — create a new session (and new camera) next time.
- Folding the glasses arms disconnects Bluetooth and forces `STOPPED`. Unfolding does **not**
  restart; the user taps Reconnect.
- Don't restart while `PAUSED`; wait for `STARTED` or `STOPPED`.

## `GlassesManager` shape

```kotlin
class GlassesManager(private val app: Application, private val scope: CoroutineScope) {
    val registration: StateFlow<RegistrationState>
    val connection: StateFlow<GlassesConnection>   // Idle, NeedsRegistration, NeedsPermission, Connecting, Streaming, Paused, Stopped, Error(msg)
    fun register(activity: Activity)
    suspend fun connect(permissions: WearablesPermissionRequester)
    fun disconnect()                               // stop camera, stop session
}
```

Keep it as a single app-wide instance (create it in an `Application` subclass or a simple
singleton) so the session survives screen rotation.

## Hardware testing

Use paired Ray-Ban Meta glasses for registration, permissions, sessions, and streaming.

## Done when

- Tapping **Connect glasses** opens Meta AI, you approve, and the app comes back with
  registration = `REGISTERED`.
- The Meta AI camera permission prompt appears once, and the session reaches `STARTED`.
- Folding the glasses shows "Glasses disconnected" with a Reconnect button that works.

## Implementation status

Guide 06 is implemented. From an active ticket, tap **Start Agent Resolution Mode** to open
Resolution Mode. Nearby devices access is requested here, so login and ticket
updates do not require Bluetooth permission. If Android permanently denies access, the button
opens the app's Android settings.

The app-wide `GlassesManager` initializes the SDK once, observes registration and linked devices,
checks glasses camera permission, and opens a device session. Registration returns from Meta AI
and continues the connection flow. A paused session waits; a stopped session requires
**Reconnect**, which creates a new session. Connecting times out after 30 seconds with a retry
message. Leaving the screen or backgrounding the app stops the session; rotation preserves it.

Verified with `:app:assembleDebug :app:lintDebug` (zero lint errors). Registration, permission
prompts, rotation, and fold/reconnect still need hardware verification. Guide 07 now supplies the camera preview and compact checklist overlay on the same destination.
