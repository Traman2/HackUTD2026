import { t, SenderError } from "spacetimedb/server";
import spacetimedb from "../schema";
import { profileSchema } from "../validation/auth";

export const save_profile = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    const session = ctx.db.sessions.identity.find(ctx.sender);
    const user = session && ctx.db.users.username.find(session.username);
    if (!user) throw new SenderError("Log in first.");
    const result = profileSchema.safeParse({ displayName });
    if (!result.success) throw new SenderError(result.error.issues[0].message);
    ctx.db.users.username.update({
      ...user,
      displayName: result.data.displayName,
    });
  },
);

export const delete_profile = spacetimedb.reducer((ctx) => {
  const session = ctx.db.sessions.identity.find(ctx.sender);
  if (!session) throw new SenderError("Log in first.");
  if (Array.from(ctx.db.spaces.ownerUsername.filter(session.username)).length > 0) {
    throw new SenderError("Accounts that own spaces cannot be deleted yet.");
  }
  // Revoke every login for this account, including other devices.
  for (const login of Array.from(
    ctx.db.sessions.username.filter(session.username),
  )) {
    ctx.db.sessions.identity.delete(login.identity);
  }
  ctx.db.users.username.delete(session.username);
});

// Explicit projection prevents password values from being exposed by the view.
const profile = t.row("UserProfile", {
  username: t.string(),
  displayName: t.string(),
  createdAt: t.timestamp(),
});

export const my_profile = spacetimedb.view(
  { name: "my_profile", public: true },
  t.option(profile),
  (ctx) => {
    const session = ctx.db.sessions.identity.find(ctx.sender);
    const user = session && ctx.db.users.username.find(session.username);
    if (!user) return undefined;
    return {
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
    };
  },
);

