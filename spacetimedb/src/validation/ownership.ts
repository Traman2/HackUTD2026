import {
  SenderError,
  type InferSchema,
  type ViewCtx,
} from "spacetimedb/server";
import type spacetimedb from "../schema";

type Context = Pick<ViewCtx<InferSchema<typeof spacetimedb>>, "db" | "sender">;

export function requireUser(ctx: Context): string {
  const session = ctx.db.sessions.identity.find(ctx.sender);
  if (!session || !ctx.db.users.username.find(session.username)) {
    throw new SenderError("Log in first.");
  }
  return session.username;
}

export function requireSpace(ctx: Context, spaceId: bigint, active = false) {
  const username = requireUser(ctx);
  const space = ctx.db.spaces.id.find(spaceId);
  if (!space || space.ownerUsername !== username)
    throw new SenderError("Space not found.");
  if (active && space.archived) throw new SenderError("Space is archived.");
  return space;
}

export function requireDocument(
  ctx: Context,
  documentId: bigint,
  active = false,
) {
  const document = ctx.db.documents.id.find(documentId);
  if (!document) throw new SenderError("Document not found.");
  requireSpace(ctx, document.spaceId, active);
  return document;
}
