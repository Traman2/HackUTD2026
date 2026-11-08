# 03 — Login

Goal: a login screen for existing accounts; stay signed in across app restarts; sign out.

## Flow

```
App start
  └─ ensureToken()                      // saved token or POST /v1/identity
  └─ SELECT username, display_name FROM my_profile
        ├─ 1 row  → Spaces screen
        └─ 0 rows → Login screen
Login button
  └─ call login [username.trim().lowercase(), password]
        ├─ 200 → query my_profile again → Spaces screen
        └─ error → show message under the form
Sign out (Spaces screen top bar menu)
  └─ call logout [] → Login screen
```

## Repository functions

```kotlin
suspend fun currentProfile(): Profile?               // null = not logged in
suspend fun login(username: String, password: String)
suspend fun logout()

data class Profile(val username: String, val displayName: String)
```

## Login screen (Compose)

- App name "Invisible Network" and a one-line subtitle ("Field resolution for your spaces").
- Username field (no autocorrect, `KeyboardType.Ascii`, `ImeAction.Next`).
- Password field (masked, show/hide toggle, `ImeAction.Done` submits).
- "Sign in" button, disabled while empty or loading; shows a progress indicator while loading.
- Error text below the button.
- Small note: "Don't have an account? Create one on the web app." (no signup on the phone).

## Validation (match the backend so errors appear before the network call)

- Username: 3–32 characters, only `a–z`, `0–9`, `_` after lowercasing.
- Password: 1–128 characters.

## Error messages

| Situation | Show |
|---|---|
| HTTP error body contains `Invalid username or password` | "Invalid username or password." |
| `IOException` / timeout | "Can't reach the server. Check your connection and that the PC tunnel is running." |
| Anything else | the backend's message text |

## State

`LoginViewModel` exposes `StateFlow<LoginUiState>`:
`username`, `password`, `loading`, `error`, and a one-shot "logged in" event the navigation
observes.

A root `AppViewModel` (or the NavHost start logic) decides the start destination with
`currentProfile()`; show a centered spinner while it checks.

## Done when

- Correct credentials (an account made on the web) open the Spaces screen.
- Killing and reopening the app skips the login screen.
- Wrong password shows "Invalid username or password."
- Sign out returns to the login screen, and reopening the app shows login.
