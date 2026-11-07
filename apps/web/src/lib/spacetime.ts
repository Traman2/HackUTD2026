import { DbConnection } from '../module_bindings'

export const databaseName = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? import.meta.env.VITE_SPACETIMEDB_DATABASE ?? 'hackutd2026'
const host = import.meta.env.VITE_SPACETIMEDB_HOST ?? import.meta.env.VITE_SPACETIMEDB_URI ?? 'http://127.0.0.1:3000'
const tokenKey = `spacetimedb:${host}:${databaseName}:token`

function savedToken(): string | undefined {
  try {
    return localStorage.getItem(tokenKey) ?? undefined
  } catch {
    return undefined
  }
}

export const connectionBuilder = DbConnection.builder()
  .withUri(host)
  .withDatabaseName(databaseName)
  .withToken(savedToken())
  .onConnect((_connection, _identity, token) => {
    try {
      localStorage.setItem(tokenKey, token)
    } catch {
      // Connecting still works when browser storage is unavailable.
    }
  })
  .onConnectError((_context, error) => {
    console.error('Unable to connect to SpacetimeDB:', error)
  })
