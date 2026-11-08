# 04 — Spaces List

Goal: show the signed-in user's spaces; tapping one opens its tickets.

## Data

```sql
SELECT id, name, description, archived, updated_at FROM my_spaces
```

```kotlin
data class Space(
    val id: Long,
    val name: String,
    val description: String,
    val archived: Boolean,
    val updatedAtMicros: Long,
)
// row → Space(row.getLong(0), row.getString(1), row.getString(2), row.getBoolean(3), row.timestampMicros(4))
```

Optional ticket counts per space (one extra query, then group in Kotlin):

```sql
SELECT space_id, status FROM my_tickets
```

Count tickets whose status is `open` or `in_progress` → "3 open tickets".

## Screen

- Top bar: "Spaces", user's display name, overflow menu with **Sign out**.
- List (`LazyColumn`) of cards, newest `updatedAt` first, archived spaces last:
  - Name (title), description (2 lines max), open ticket count chip.
  - "Archived" label and dimmed when `archived`.
- Pull-to-refresh (`PullToRefreshBox` from Material 3).
- Empty state: "No spaces yet. Create one on the web app."
- Error state with a Retry button.
- Tap → navigate to `tickets/{spaceId}` (pass the space name too, or look it up).

## Refresh rules

- Load on first open and on pull-to-refresh.
- Reload when returning to this screen (e.g. `LaunchedEffect` keyed on the back-stack entry, or
  `Lifecycle.Event.ON_RESUME`).
- If any query fails with "Log in first", clear the session state and go back to Login.

## Done when

- Your spaces from the web appear with correct names and open-ticket counts.
- Pull-to-refresh picks up a space created on the web.
