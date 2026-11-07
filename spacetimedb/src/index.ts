import { schema, t, SenderError } from "spacetimedb/server";
import { users } from "./models/user";
import { sessions } from "./models/session";
import { signupSchema, loginSchema, profileSchema } from "./validation/auth";

const spacetimedb = schema({ users, sessions });
export default spacetimedb;

export const signup = spacetimedb.reducer(
  { username: t.string(), password: t.string(), displayName: t.string() },
  (ctx, args) => {
    const result = signupSchema.safeParse(args);
    if (!result.success) throw new SenderError(result.error.issues[0].message);
    const { username: normalized, password, displayName: name } = result.data;
    if (ctx.db.users.username.find(normalized)) {
      throw new SenderError("Username is already taken.");
    }
    ctx.db.users.insert({
      username: normalized,
      password,
      displayName: name,
      createdAt: ctx.timestamp,
    });
    const session = { identity: ctx.sender, username: normalized };
    if (ctx.db.sessions.identity.find(ctx.sender)) {
      ctx.db.sessions.identity.update(session);
    } else {
      ctx.db.sessions.insert(session);
    }
  },
);

export const login = spacetimedb.reducer(
  { username: t.string(), password: t.string() },
  (ctx, args) => {
    const result = loginSchema.safeParse(args);
    if (!result.success) throw new SenderError("Invalid username or password.");
    const { username, password } = result.data;
    const user = ctx.db.users.username.find(username);
    if (!user || user.password !== password) {
      throw new SenderError("Invalid username or password.");
    }
    const session = { identity: ctx.sender, username: user.username };
    if (ctx.db.sessions.identity.find(ctx.sender)) {
      ctx.db.sessions.identity.update(session);
    } else {
      ctx.db.sessions.insert(session);
    }
  },
);

export const logout = spacetimedb.reducer((ctx) => {
  ctx.db.sessions.identity.delete(ctx.sender);
});

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
