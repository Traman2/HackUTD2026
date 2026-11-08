# 02 — Project Setup and Networking

Goal: add the few libraries the app needs and make the phone able to reach the backend that runs
on your PC.

## 1. Dependencies

Add to `gradle/libs.versions.toml`:

```toml
[versions]
okhttp = "5.5.1"
navigationCompose = "2.9.8"
lifecycleViewmodelCompose = "2.10.0"   # keep equal to lifecycleRuntimeKtx
datastore = "1.2.1"

[libraries]
okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
androidx-navigation-compose = { group = "androidx.navigation", name = "navigation-compose", version.ref = "navigationCompose" }
androidx-lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycleViewmodelCompose" }
androidx-datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastore" }
```

And in `app/build.gradle.kts` → `dependencies { … }`:

```kotlin
implementation(libs.okhttp)
implementation(libs.androidx.navigation.compose)
implementation(libs.androidx.lifecycle.viewmodel.compose)
implementation(libs.androidx.datastore.preferences)
```

JSON parsing uses Android's built-in `org.json` (`JSONArray`, `JSONObject`) — rows are positional
arrays, so no serialization library is needed. Coroutines already come in through `mwdat-core`.

> **compileSdk note:** the project compiles against API 36. If a build fails with
> *"Dependency X requires … compileSdk 37"*, step that library down one release
> (this is why `coreKtx`, `activityCompose`, `composeBom` are pinned).

## 2. Backend address as a build setting

In `app/build.gradle.kts`:

The host is read from `local.properties` (git-ignored), so the ngrok URL never gets committed and
can change without editing Gradle files:

```properties
# apps/mobile/local.properties
spacetime.host=https://your-name.ngrok-free.app
```

```kotlin
import java.util.Properties

val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

android {
    buildFeatures {
        compose = true
        buildConfig = true
    }
    defaultConfig {
        val host = localProps.getProperty("spacetime.host", "http://127.0.0.1:3000")
        buildConfigField("String", "SPACETIME_HOST", "\"$host\"")
        buildConfigField("String", "SPACETIME_DB", "\"hackutd2026\"")
    }
}
```

Use `BuildConfig.SPACETIME_HOST` / `BuildConfig.SPACETIME_DB` in `SpacetimeClient`.
After changing `local.properties`, rebuild the app.

## 3. Reaching the PC from the phone (Wi-Fi and cellular)

The backend runs on the PC at `127.0.0.1:3000`. To reach it from anywhere (any Wi-Fi or
cellular), expose that one port with **ngrok**, which gives a public HTTPS URL.

### One-time setup (on the PC)

```powershell
winget install ngrok.ngrok
ngrok config add-authtoken <token from https://dashboard.ngrok.com/get-started/your-authtoken>
```

In the ngrok dashboard → **Domains**, claim your **free static domain**
(e.g. `your-name.ngrok-free.app`). With it the URL stays the same every time, so the app never
needs rebuilding for a new URL.

### Every session

```powershell
pnpm tunnel     # starts the local router (port 8080) + ngrok on your static domain
```

`pnpm tunnel` reads `NGROK_DOMAIN` from the repo root `.env.local` (git-ignored):

```dotenv
NGROK_DOMAIN=your-name.ngrok-free.app
```

One public URL, two services (router: `scripts/tunnel-router.mjs`):

| Public URL | Goes to |
|---|---|
| `https://your-name.ngrok-free.app/v1/...` (and WebSockets) | SpacetimeDB `127.0.0.1:3000` |
| `https://your-name.ngrok-free.app/agent/...` | LangChain agent server `127.0.0.1:3001` |

Keep that terminal open; the phone loses the backend when it closes. The web app on the PC still
talks to everything on `127.0.0.1`.

### Reaching the LangChain agent from the phone

The phone **never** calls `/agent/...` directly and never holds `AGENT_API_KEY`. It calls
SpacetimeDB procedures, which check the user's login and call the agent with the key:

```
Phone ──/v1/database/hackutd2026/call/ask_agent──► SpacetimeDB ──https://<domain>/agent/invoke──► agent
```

The database host blocks requests to `127.0.0.1`, so `AGENT_URL` must be the **public** URL.
Once, in `spacetimedb/.env`:

```dotenv
AGENT_URL=https://your-name.ngrok-free.app/agent/invoke
```

then republish (`pnpm publish:spacetime`, or restart `pnpm dev:spacetime`). Calling it:

```
POST {BASE}/call/ask_agent   Body: ["What should I check on CRAC-02?"]   → 200 with the reply text (expected as a JSON-encoded string; log the raw body once to confirm)
```

Each database → agent call must finish within 60 s (hard limit 180 s), which suits
conversational turns. Long jobs (ticket generation) stay on the web flow.

### ngrok browser warning

Free ngrok shows a warning page to browser-like requests. Add this header to **every** request in
`SpacetimeClient` so it can never get in the way (one OkHttp interceptor):

```kotlin
val http = OkHttpClient.Builder()
    .addInterceptor { chain ->
        chain.proceed(chain.request().newBuilder().header("ngrok-skip-browser-warning", "true").build())
    }
    .build()
```

### Fallback: USB without ngrok

With the phone plugged in, `adb reverse tcp:3000 tcp:3000` makes `http://127.0.0.1:3000` on the
phone reach the PC. Remove `spacetime.host` from `local.properties` to use it (requires the
plain-HTTP config below).

### Security note

The tunnel URL is public. Everything is still behind login (the `my_*` views return nothing
without a session), but stop ngrok when you're not using it.

## 4. Allow plain HTTP (USB fallback only)

ngrok is HTTPS, so this is only needed for the `adb reverse` fallback. Android blocks unencrypted
HTTP by default. Allow it only for local addresses.

`app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">localhost</domain>
        <!-- Add your PC's LAN IP here if you use Option B -->
    </domain-config>
</network-security-config>
```

In `AndroidManifest.xml`, on `<application>`:

```xml
android:networkSecurityConfig="@xml/network_security_config"
```

## 5. `SpacetimeClient` — the only class that talks HTTP

Responsibilities (build this first, everything else uses it):

```kotlin
class SpacetimeClient(private val http: OkHttpClient, private val host: String, private val db: String) {
    suspend fun createIdentity(): String                         // POST /v1/identity → token
    suspend fun callReducer(token: String, name: String, args: JSONArray)  // 200 empty body or throw
    suspend fun sql(token: String, query: String): JSONArray      // returns [0].rows
}

class SpacetimeException(message: String, val httpStatus: Int) : Exception(message)
```

Implementation notes:
- Run calls on `Dispatchers.IO` (`withContext(Dispatchers.IO) { … }`).
- Timeouts: 15 s connect/read.
- Reducer body: `args.toString()` with media type `application/json`.
- SQL body: the raw query with media type `text/plain`.
- On non-2xx: read the body as text, strip the prefix
  `"The module instance encountered a fatal error: "`, throw `SpacetimeException(text, code)`.
- On `IOException`: throw a friendly "Can't reach the server. Is the ngrok tunnel running?" error.
- HTTP `404` with an ngrok error page (`ERR_NGROK_3200`) means the tunnel is offline.
- Never log the token.

Small parsing helpers (put them next to the client):

```kotlin
fun JSONArray.optionString(i: Int): String? = getJSONArray(i).let { if (it.getInt(0) == 0) it.getString(1) else null }
fun JSONArray.timestampMicros(i: Int): Long = getJSONArray(i).getLong(0)
fun JSONArray.optionTimestampMicros(i: Int): Long? =
    getJSONArray(i).let { if (it.getInt(0) == 0) it.getJSONArray(1).getLong(0) else null }
```

## 6. `SessionStore`

DataStore Preferences with a single key `spacetime_token`. Functions: `token(): String?`,
`save(token)`, `clear()`.

`Repository.ensureToken()`: return the saved token, or call `createIdentity()`, save, and return it.

## Done when

- With the phone on **cellular** (Wi-Fi off) and the ngrok tunnel running, a temporary debug button that calls
  `client.sql(token, "SELECT username FROM my_profile")` returns an empty array without errors.
