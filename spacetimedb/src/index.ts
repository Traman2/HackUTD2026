import { schema, table, t, SenderError } from 'spacetimedb/server';

const users = table(
  { public: false },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    createdAt: t.timestamp(),
  }
);

const spacetimedb = schema({ users });
export default spacetimedb;

// Authentication is handled by SpacetimeDB tokens, never a client-supplied user ID.
export const save_profile = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    const name = displayName.trim();
    if (!name || name.length > 80) {
      throw new SenderError('Display name must contain 1 to 80 characters.');
    }
    const existing = ctx.db.users.identity.find(ctx.sender);
    if (existing) {
      ctx.db.users.identity.update({ ...existing, displayName: name });
    } else {
      ctx.db.users.insert({ identity: ctx.sender, displayName: name, createdAt: ctx.timestamp });
    }
  }
);

export const delete_profile = spacetimedb.reducer(ctx => {
  ctx.db.users.identity.delete(ctx.sender);
});

// The underlying table is private; each caller can only query their own row.
export const my_profile = spacetimedb.view(
  { name: 'my_profile', public: true },
  t.option(users.rowType),
  ctx => ctx.db.users.identity.find(ctx.sender) ?? undefined
);
