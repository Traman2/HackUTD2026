# 05 — Tickets and Steps

Goal: show a space's troubleshooting tickets, open one to see its steps, update steps and
status, and start Agent Resolution Mode.

## Data

```sql
SELECT id, title, kind, priority, status, asset_label, equipment_code,
       summary, safety_notes, steps, updated_at
FROM my_tickets WHERE space_id = {spaceId}
```

(`spaceId` is a `Long` you put into the string yourself; it is never user-typed text.)

```kotlin
data class Ticket(
    val id: Long,
    val title: String,
    val kind: String,          // resolve | discovery
    val priority: String,      // critical | high | elevated
    val status: String,        // open | in_progress | resolved | closed | cancelled
    val assetLabel: String,
    val equipmentCode: String,
    val summary: String,
    val safetyNotes: String,
    val steps: List<TicketStep>,
    val updatedAtMicros: Long,
)

data class TicketStep(
    val order: Int,
    val instruction: String,
    val kind: String,          // observe | measure | verify | photo | record | escalate
    val expectedResult: String,
    val requiresPhoto: Boolean,
    val status: String,        // pending | done | failed | skipped
    val result: String?,
    val completedAtMicros: Long?,
)

// steps column = JSONArray of positional arrays:
// [order, instruction, kind, expected_result, requires_photo, status, result(option), completed_at(option ts)]
fun parseStep(a: JSONArray) = TicketStep(
    a.getInt(0), a.getString(1), a.getString(2), a.getString(3), a.getBoolean(4),
    a.getString(5), a.optionString(6), a.optionTimestampMicros(7),
)
```

Sort: active first (`in_progress`, `open`), then by priority (`critical` > `high` > `elevated`),
then newest `updatedAt`. Show `resolved`/`closed`/`cancelled` in a collapsed "Done" section.

## Tickets screen (`tickets/{spaceId}`)

- Top bar: space name, back arrow.
- Filter chips: All · Open · In progress · Done.
- Ticket card:
  - Priority color bar/badge (critical = red, high = orange, elevated = amber).
  - Title, asset label (`CRAC-02`), kind badge (`Resolve` / `Discovery`).
  - Progress: "2 of 5 steps" + thin progress bar (non-pending steps / total).
  - Status chip.
- Pull-to-refresh, empty state "No tickets yet. Generate tickets on the web app.", error + Retry.
- Tap → `ticket/{ticketId}`.

## Ticket detail screen (`ticket/{ticketId}`)

Get the ticket from the same query (filter by id in Kotlin, or add `AND id = {ticketId}`).

Layout, top to bottom:
1. Title, asset, priority + status chips.
2. **Safety notes** card (warning colors, icon) — only if not blank. Always above the steps.
3. Summary text.
4. **Steps checklist** — each row: order number, instruction, "Expected: …" in smaller text,
   status icon, camera icon if `requiresPhoto`, the saved `result` note if any.
   Tapping a step opens a bottom sheet with: **Done**, **Failed**, **Skip**, **Reset to pending**,
   and an optional note field (max 500 chars).
5. Bottom bar actions:
   - Big primary button **Start Agent Resolution Mode** (enabled when status is `open` or
     `in_progress`) → navigate to `resolution/{ticketId}`.
   - Secondary **Mark resolved** (enabled when no step is `pending` and status is `open`/`in_progress`).
   - For `resolved` tickets: **Reopen** (→ `in_progress`).

## Writes

```kotlin
suspend fun updateStep(ticketId: Long, stepOrder: Int, status: String, note: String) =
    client.callReducer(token, "update_ticket_step", JSONArray().put(ticketId).put(stepOrder).put(status).put(note))

suspend fun setStatus(ticketId: Long, status: String, note: String = "") =
    client.callReducer(token, "set_ticket_status", JSONArray().put(ticketId).put(status).put(note))
```

After every successful write, re-query the ticket so the UI shows what the backend saved
(the backend also auto-moves `open` → `in_progress` on the first step update).

Show backend errors as a snackbar (e.g. "Complete or skip every step before resolving the ticket.").

## Shared state for Resolution Mode

Put the selected ticket and the update functions in a `TicketsViewModel` scoped to the nav graph
(or a repository-level `StateFlow<Ticket?>`), so the Resolution Mode screen shows the **same**
ticket state and step updates made there appear back on the detail screen.

## Done when

- Tickets generated on the web appear under the right space with correct step counts.
- Marking a step done on the phone shows as done on the web Tickets view after refresh.
- Resolving with a pending step shows the backend's error; after finishing all steps it resolves.
