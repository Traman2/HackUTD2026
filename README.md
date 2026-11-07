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

The frontend is the Vite + React starter screen and does not connect to the database yet.
Alternatively, `pnpm dev:spacetime` publishes, generates bindings, watches backend changes, and launches Vite together.

Database: `hackutd2026` on `127.0.0.1:3000`. Ignored `.spacetime-data/` holds local database state.

## User model

`spacetimedb/src/index.ts` defines a private `users` table:

- `identity`: primary key, taken from the token-authenticated caller (`ctx.sender`).
- `displayName`: trimmed, 1 to 80 characters.
- `createdAt`: server timestamp, preserved when the profile changes.

`save_profile` creates or updates the caller's profile. `delete_profile` deletes only the caller's profile; it does not revoke authentication tokens or delete an identity-provider account.
`SELECT * FROM my_profile` returns only the caller's own profile. Other clients cannot read the private users table or supply an identity to modify somebody else's row.

SpacetimeDB verifies identity tokens; this module stores profiles, not passwords. Local development can use SpacetimeDB-issued identity tokens. Persist and reuse the same token to retain the same user identity. Email/password or social sign-in still requires a future SpacetimeAuth/OIDC integration. No sign-in UI is wired up yet.

## Checks

```powershell
pnpm typecheck:spacetime
pnpm build:spacetime
pnpm generate:spacetime
pnpm build:web
```

With the local server running and this module published, run `powershell -NoProfile -File scripts/test-profiles.ps1` to test profile creation, updates, validation, privacy, isolation between two identities, and deletion. Test profiles are removed afterward.

See the official [authentication guidance](https://spacetimedb.com/docs/intro/faq/) and [per-user views](https://spacetimedb.com/docs/functions/views/).
