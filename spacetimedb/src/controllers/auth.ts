import { t, SenderError } from "spacetimedb/server";
import spacetimedb from "../schema";
import { signupSchema, loginSchema } from "../validation/auth";

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
