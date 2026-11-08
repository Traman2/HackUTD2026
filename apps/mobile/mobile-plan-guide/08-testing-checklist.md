# 08 — Testing Checklist

## Before every session

- [ ] Backend running on the PC: `pnpm start:spacetime` (and `pnpm publish:spacetime` after backend changes).
- [ ] Phone plugged in with USB debugging (only needed to install/update the app).
- [ ] ngrok tunnel running: `pnpm tunnel` (phone can be on any Wi-Fi or cellular).
- [ ] Test data exists: on the web app, a user with a space that has documents, a generated
      flowchart, and generated tickets.

## Quick backend checks from the PC (optional)

```bash
H=http://127.0.0.1:3000/v1/database/hackutd2026
T=$(curl -s -X POST http://127.0.0.1:3000/v1/identity | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -s -X POST $H/call/login -H "Authorization: Bearer $T" -H "Content-Type: application/json" --data '["<user>","<password>"]'
curl -s -X POST $H/sql -H "Authorization: Bearer $T" --data 'SELECT id, name FROM my_spaces'
curl -s -X POST $H/sql -H "Authorization: Bearer $T" --data 'SELECT id, title, status FROM my_tickets'
```

## App flow

| # | Test | Expected |
|---|---|---|
| 1 | Fresh install, open app | Login screen |
| 2 | Wrong password | "Invalid username or password." |
| 3 | Correct login | Spaces list with your spaces |
| 4 | Kill + reopen app | Goes straight to Spaces |
| 5 | Open a space | Its tickets, sorted by status then priority |
| 6 | Open a ticket | Safety notes (if any), summary, steps |
| 7 | Mark step 1 Done with a note | Step shows done; ticket becomes In progress; web shows it after refresh |
| 8 | Try Mark resolved with pending steps | Backend error shown, nothing changes |
| 9 | Start Agent Resolution Mode | Glasses flow → live video + to-do card on bottom half |
| 10 | Done/Fail/Skip in the card | Advances to next pending step |
| 11 | Finish all steps → Mark resolved | Ticket resolved on phone and web |
| 12 | Fold glasses during streaming | Disconnected overlay; Reconnect restores video |
| 13 | Stop ngrok, pull to refresh | "Can't reach the server" message, no crash |
| 14 | Sign out | Back to Login; reopening the app shows Login |

## Without glasses

Use the Mock Device Kit (guide 06) with a short portrait MP4 as the camera feed; tests 9–11 should
behave the same.

## Common problems

| Symptom | Fix |
|---|---|
| "Can't reach the server" | Start `pnpm tunnel`; check the backend is running and `spacetime.host` matches your ngrok domain |
| `CLEARTEXT communication not permitted` | `network_security_config.xml` missing or not referenced in the manifest |
| Everything returns empty / "Log in first" | Token lost or session removed → log in again |
| Build error "requires compileSdk 37" | Step that dependency down one version (see guide 02) |
| Registration never returns to the app | Check the `realestate` scheme intent filter on `MainActivity`; Developer Mode on in Meta AI |
| `NOT_INITIALIZED` from Meta SDK | `Wearables.initialize(context)` not called before other SDK calls |
| `addCamera` fails "already active" | Call `camera.stop()` when leaving Resolution Mode |
| Black video, state STREAMING | Decoder not created: surface was null when frames arrived, or config frames not offered to `HevcParameterSetCollector` |
| Logcat noise | Filter Logcat by package `com.hackutd.realestate` |
