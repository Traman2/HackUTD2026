# 01 — Architecture and Backend Contract

Everything in this file was verified against the running local backend (SpacetimeDB 2.14,
database `hackutd2026`).

## System overview

```
 Web app (React)  ──┐
                    ├──►  SpacetimeDB  (database "hackutd2026", http://127.0.0.1:3000)
 Android app  ──────┘        • tables: users, sessions, spaces, tickets, ...
   │                         • views (owner-filtered): my_profile, my_spaces, my_tickets
   │ Bluetooth (Meta SDK)    • reducers: login, logout, update_ticket_step, set_ticket_status
   ▼
 Meta AI app ──► Ray-Ban Meta Wayfarer Gen 2 (camera)
```

- **SpacetimeDB is the whole backend.** There is no separate REST server for the phone.
- Tickets are created on the web by the ticket agent (the "Generate tickets" button). The phone
  only **reads** tickets and **updates step/ticket status**.
- There is **no official Kotlin SDK** for SpacetimeDB, so the phone uses its HTTP API with
  OkHttp. Data is re-fetched (pull-to-refresh, and on screen open), not pushed live.

## How authentication works

SpacetimeDB identifies every client by an **identity token** (a JWT). The app's own login sits
on top of that:

1. `POST /v1/identity` → returns a new `{ identity, token }`. Do this once and **save the token**
   (DataStore). Reuse it forever on this device.
2. Call the `login` reducer with `[username, password]` and `Authorization: Bearer <token>`.
   The backend creates a `sessions` row mapping this identity → username.
3. Every later request sends the same bearer token. The views (`my_spaces`, `my_tickets`, …)
   automatically return only that user's data.
4. Signing out: call the `logout` reducer (deletes the session row). Keep the token.

Logged-in check on app start: query `my_profile`. One row = signed in. Zero rows = show login.

> Losing the token only means you have to log in again — the token is not the password.

## Endpoints

Base URL: `{HOST}/v1/database/hackutd2026` where `{HOST}` is the ngrok URL, e.g. `https://your-name.ngrok-free.app` (see guide 02)
(see guide 02 for reaching it from the phone).

### 1. Create identity

```
POST {HOST}/v1/identity          (no body, no auth)
200 → {"identity":"c200…457a","token":"eyJ0eXAi…"}
```

### 2. Call a reducer

```
POST {BASE}/call/{reducer}
Authorization: Bearer <token>
Content-Type: application/json
Body: JSON array of the arguments, in order
```

- **Success:** HTTP `200` with an **empty body**.
- **Failure:** a non-200 status with a **plain-text** error message body. Show that text to the
  user (it is written for humans). Observed examples:
  - `login` with a wrong password → HTTP `530`, body `Invalid username or password.`
  - Calls without a session → HTTP `500`, body `The module instance encountered a fatal error: Log in first.`
    (strip the `The module instance encountered a fatal error: ` prefix before displaying).

### 3. SQL query (reads)

```
POST {BASE}/sql
Authorization: Bearer <token>
Body: the SQL text (plain text, not JSON)
200 → [ { "schema": {...}, "rows": [ [...], [...] ], "total_duration_micros": 1587, "stats": {...} } ]
```

- The response is an array (one entry per statement). Read `[0].rows`.
- **Each row is a positional JSON array**, in the order of the columns you selected. Always
  select explicit columns (as below) so column order is under your control.
- `WHERE` filters and column lists work on views (verified).

## Value encoding inside rows (verified)

| Backend type | JSON in `rows` | Kotlin |
|---|---|---|
| `u64` / `u32` | number, e.g. `1` | `Long` / `Int` |
| `string` | `"text"` | `String` |
| `bool` | `true` | `Boolean` |
| timestamp | `[1794121315422002]` (one-element array, **microseconds** since epoch) | `Long` micros → `Instant.ofEpochMilli(us / 1000)` |
| option, present | `[0, value]` | value |
| option, empty | `[1, []]` | `null` |
| struct (e.g. a step) | positional array of its fields | data class |
| array | JSON array | `List` |

## Data the phone uses

### Profile — `my_profile`

```sql
SELECT username, display_name FROM my_profile
```
Row: `["tejasraman", "Tejas"]`. Zero rows = not logged in.

### Spaces — `my_spaces`

```sql
SELECT id, name, description, archived, updated_at FROM my_spaces
```
Row: `[1, "Dallas Data Center", "…", false, [1794121315422002]]`

Sort by `updated_at` descending. Archived spaces can be hidden or shown greyed out
(ticket updates are rejected on archived spaces).

### Tickets — `my_tickets`

```sql
SELECT id, title, kind, priority, status, asset_label, equipment_code,
       summary, safety_notes, steps, updated_at
FROM my_tickets WHERE space_id = {spaceId}
```

Real example row (from the local database):

```json
[1, "Verify CRAC-02 lockout status and work order WO-C-1422 completion",
 "discovery", "critical", "open", "CRAC-02", "CRAC-02",
 "CRAC-02 experienced a low-pressure lockout on 2026-10-11, …",
 "Do not attempt to reset or restart the unit without escalating to a qualified HVAC technician.",
 [[1, "Locate CRAC-02 and confirm the equipment tag.", "verify", "Equipment tag matches CRAC-02.", true, "pending", [1, []], [1, []]],
  [2, "Check for a lockout tag or active alarm on CRAC-02.", "observe", "Lockout tag or alarm is visible on the unit.", true, "pending", [1, []], [1, []]]],
 [1794121315422002]]
```

Ticket fields:

| Field | Values / meaning |
|---|---|
| `kind` | `resolve` (steps aim to fix) or `discovery` (steps gather evidence) |
| `priority` | `critical`, `high`, `elevated` (sort in that order) |
| `status` | `open`, `in_progress`, `resolved`, `closed`, `cancelled` |
| `asset_label`, `equipment_code` | the equipment, e.g. `CRAC-02` |
| `summary` | why the ticket exists |
| `safety_notes` | hazards; may be empty. Always show it prominently when non-empty |
| `steps` | 2–8 ordered steps (below) |

**Step** = positional array `[order, instruction, kind, expected_result, requires_photo, status, result, completed_at]`:

| # | Field | Type | Values |
|---|---|---|---|
| 0 | `order` | Int | 1-based |
| 1 | `instruction` | String | one short action (written to be spoken through glasses) |
| 2 | `kind` | String | `observe`, `measure`, `verify`, `photo`, `record`, `escalate` |
| 3 | `expected_result` | String | what a pass looks like |
| 4 | `requires_photo` | Boolean | show a camera badge (photo upload is out of scope for now) |
| 5 | `status` | String | `pending`, `done`, `failed`, `skipped` |
| 6 | `result` | option String | technician's note |
| 7 | `completed_at` | option timestamp | when it was marked |

## Writes the phone performs

### Update a step — reducer `update_ticket_step`

```
POST {BASE}/call/update_ticket_step
Body: [ticketId, stepOrder, "done" | "failed" | "skipped" | "pending", "optional note (max 500 chars)"]
e.g.  [1, 2, "done", "Lockout tag present, alarm E14 on panel"]
```

Rules enforced by the backend:
- The ticket must be `open` or `in_progress`, otherwise:
  `This ticket is resolved. Reopen it before changing steps.`
- Marking any step non-pending moves an `open` ticket to `in_progress` automatically.
- `"pending"` clears the step back (result and completed_at are cleared).

### Change ticket status — reducer `set_ticket_status`

```
POST {BASE}/call/set_ticket_status
Body: [ticketId, "in_progress" | "resolved" | "open" | "cancelled" | "closed", "optional note"]
```

Allowed transitions:

| From | To |
|---|---|
| `open` | `in_progress`, `resolved`, `cancelled` |
| `in_progress` | `open`, `resolved`, `cancelled` |
| `resolved` | `in_progress`, `closed` |
| `cancelled` | `open` |
| `closed` | — |

`resolved` is rejected while any step is still `pending`:
`Complete or skip every step before resolving the ticket.`

Every step and status change is recorded in an audit log on the backend automatically.

### Login / logout reducers

```
POST {BASE}/call/login    Body: ["username", "password"]   // username: 3–32 chars, a–z 0–9 _, sent lowercase
POST {BASE}/call/logout   Body: []
```

## Things the phone must NOT do

- Don't call `signup` (accounts are created on the web).
- Don't query private tables (`tickets`, `spaces`, `users`, …) directly — they return nothing
  for normal users. Always use the `my_*` views.
- Don't hardcode the token; never log it.
