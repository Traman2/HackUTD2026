# Mobile Plan Guide

Step-by-step guides for building the Android app in `apps/mobile`. Everything the phone needs
from the backend is written down here, so you (or the AI assistant in Android Studio) never need
to open the web or backend code.

## What the app does (this phase)

1. **Login** with an existing account (accounts are created on the web; no signup on the phone).
2. **Spaces list**: the signed-in user's spaces.
3. **Space page**: the space's troubleshooting tickets, each with its ordered steps.
4. **Ticket page**: steps as a checklist; mark each step done / failed / skipped.
5. **Start Agent Resolution Mode**: switches to the live camera view from the Ray-Ban Meta
   glasses, with the ticket's to-do list shown as a card over the bottom half of the video.

**Out of scope for now:** flowcharts, risk analysis, chat, ticket generation, photo uploads and
the voice AI agent. The agent will be added later on top of Resolution Mode.

## Read in order

| # | Guide | Result when done |
|---|-------|------------------|
| 01 | [Architecture and backend contract](01-architecture-and-backend-contract.md) | You know every endpoint, row shape and rule the app uses |
| 02 | [Project setup and networking](02-project-setup-and-networking.md) | The phone can reach the local backend |
| 03 | [Login](03-login.md) | Sign in, stay signed in, sign out |
| 04 | [Spaces list](04-spaces-list.md) | Your spaces render |
| 05 | [Tickets and steps](05-tickets-and-steps.md) | Tickets and steps render and can be updated |
| 06 | [Meta glasses connection](06-meta-glasses-connection.md) | App registered with Meta AI, camera permission granted |
| 07 | [Resolution Mode: live camera and overlay](07-resolution-mode-camera-overlay.md) | Live glasses video with the to-do card on top |
| 08 | [Testing checklist](08-testing-checklist.md) | End-to-end demo verified |

## Using these guides with the AI assistant in Android Studio

Android Studio only has `apps/mobile` open, so this folder is the assistant's view of the rest of
the system. When asking it to build a step, attach (or paste) `01-architecture-and-backend-contract.md`
plus the guide for that step. Ask for one guide at a time and build/run after each.

## Current project state

- Native Kotlin + Jetpack Compose, package `com.hackutd.invisiblenetwork`.
- minSdk 29 (Android 10, required by Meta's SDK), target/compile SDK 36 (Android 16, Galaxy S24 Ultra).
- AGP 9.2.1 (newest supported by the installed Android Studio), Kotlin 2.4.21, Gradle 9.5.1.
- Meta Wearables Device Access Toolkit 1.0.1 already added: `mwdat-core`, `mwdat-camera`,
  `mwdat-mockdevice`. (`mwdat-display` is intentionally omitted: Wayfarer Gen 2 has no display.)
- Manifest already has Bluetooth/Internet/Camera permissions, the Meta app ID / client token
  placeholders (`"0"` in Developer Mode), and the `invisiblenetwork://` callback scheme.
- `MainActivity` shows a Hello World screen.

## Suggested source layout (final)

```
app/src/main/java/com/hackutd/invisiblenetwork/
  MainActivity.kt              // initializes Meta SDK, hosts navigation
  InvisibleNetworkApp.kt       // Application class (optional) holding singletons
  data/
    SpacetimeClient.kt         // HTTP calls: identity, call reducer, SQL
    SessionStore.kt            // DataStore: saved identity token
    Models.kt                  // Space, Ticket, TicketStep data classes
    Repository.kt              // login/logout, spaces, tickets, step updates
  glasses/
    GlassesManager.kt          // Wearables init, registration, permission, session, stream
    HevcDecoder.kt             // copied from Meta's CameraAccess sample
  ui/
    login/LoginScreen.kt + LoginViewModel.kt
    spaces/SpacesScreen.kt + SpacesViewModel.kt
    tickets/TicketsScreen.kt, TicketDetailScreen.kt + TicketsViewModel.kt
    resolution/ResolutionModeScreen.kt + ResolutionViewModel.kt
    theme/Theme.kt
```
