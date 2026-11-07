import { table, t } from 'spacetimedb/server';

// A successful login associates this SpacetimeDB caller with an account.
export const sessions = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    username: t.string().index('btree'),
  }
);
