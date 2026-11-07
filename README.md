# hackutd2026

React + TypeScript frontend and a standalone SpacetimeDB backend.

## Development

Install Node.js 22+, pnpm, and the SpacetimeDB CLI. On Windows, add `%LOCALAPPDATA%\SpacetimeDB` to PATH if `spacetime` is not found.

```powershell
pnpm install
# Terminal 1: standalone database, with persistent local state
pnpm start:spacetime
# Terminal 2: publish the backend, then run the independent frontend
pnpm publish:spacetime
pnpm dev:web
```

The frontend connects using the SpacetimeDB React SDK and shows connection status. Vite reads `VITE_SPACETIMEDB_HOST` and `VITE_SPACETIMEDB_DB_NAME` from the repository root `.env.local`. The connection token is saved in browser local storage to preserve caller identity across reloads. Components can access connection state using `useSpacetimeDB()`. Connecting does not invoke auth reducers.
Alternatively, `pnpm dev:spacetime` publishes, generates bindings, watches backend changes, and launches Vite together.

Database: `hackutd2026` on `127.0.0.1:3000`. Ignored `.spacetime-data/` holds local database state.

## Basic hackathon auth

Models live in `spacetimedb/src/models/` and are registered in `src/index.ts`:

- `user.ts`: private users table keyed by normalized username, with plaintext password, display name, and creation timestamp.
- `session.ts`: private sessions table mapping a SpacetimeDB caller identity to the logged-in username.

This intentionally uses plaintext password storage and comparison for the hackathon demo. Use throwaway demo credentials. No external auth provider or frontend sign-in is configured.

Reducers:

Auth inputs are validated and normalized with Zod schemas in `spacetimedb/src/validation/auth.ts`.

- `signup({ username, password, displayName })`: creates the account and logs the caller in. Usernames are case-insensitive, 3-32 letters/numbers/underscores. Passwords are 1-128 characters and compared exactly. Display names are trimmed, 1-80 characters.
- `login({ username, password })`: verifies credentials and logs in the caller. The same account can log in from another SpacetimeDB identity/device.
- `logout()`: removes the caller's session.
- `saveProfile({ displayName })`: updates the logged-in account's display name.
- `deleteProfile()`: deletes the logged-in account and revokes all its sessions.

These are generated TypeScript method names; CLI/HTTP reducer names are `signup`, `login`, `logout`, `save_profile`, and `delete_profile`.
`SELECT * FROM my_profile` returns only the logged-in account's username, display name, and creation time. Passwords and session rows are not exposed to ordinary clients.

SpacetimeDB's token identifies the caller/connection, while the sessions table determines which account that caller logged into. Keep that token in the client between requests; a fresh identity must log in. Sessions persist until logout or account deletion and have no automatic expiry in this demo.

## Checks

```powershell
pnpm typecheck:spacetime
pnpm build:spacetime
pnpm generate:spacetime
pnpm build:web
```

See the official [authentication guidance](https://spacetimedb.com/docs/intro/faq/) and [per-user views](https://spacetimedb.com/docs/functions/views/).

