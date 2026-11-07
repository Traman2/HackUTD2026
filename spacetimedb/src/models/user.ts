import { table, t } from 'spacetimedb/server';

export const users = table(
  { public: false },
  {
    username: t.string().primaryKey(),
    // Hackathon demo only: intentionally stored and compared as plaintext.
    password: t.string(),
    displayName: t.string(),
    createdAt: t.timestamp(),
  }
);
