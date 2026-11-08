import { SenderError, t } from "spacetimedb/server";
import spacetimedb from "../schema";
import { requireSpace, requireUser } from "../validation/ownership";
import { spaceInput } from "../validation/documents";

export const create_space = spacetimedb.reducer(
  { name: t.string(), description: t.string() },
  (ctx, input) => {
    const ownerUsername = requireUser(ctx);
    const parsed = spaceInput.safeParse(input);
    if (!parsed.success) throw new SenderError(parsed.error.issues[0].message);
    ctx.db.spaces.insert({ id: 0n, ownerUsername, ...parsed.data,
      archived: false, createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
  },
);

export const update_space = spacetimedb.reducer(
  { spaceId: t.u64(), name: t.string(), description: t.string() },
  (ctx, input) => {
    const space = requireSpace(ctx, input.spaceId, true);
    const parsed = spaceInput.safeParse(input);
    if (!parsed.success) throw new SenderError(parsed.error.issues[0].message);
    ctx.db.spaces.id.update({ ...space, ...parsed.data, updatedAt: ctx.timestamp });
  },
);

export const set_space_archived = spacetimedb.reducer(
  { spaceId: t.u64(), archived: t.bool() },
  (ctx, { spaceId, archived }) => {
    const space = requireSpace(ctx, spaceId);
    ctx.db.spaces.id.update({ ...space, archived, updatedAt: ctx.timestamp });
  },
);

const spaceRow = t.row("SpaceSummary", {
  id: t.u64(), ownerUsername: t.string(), name: t.string(), description: t.string(),
  archived: t.bool(), createdAt: t.timestamp(), updatedAt: t.timestamp(),
});

export const my_spaces = spacetimedb.view(
  { public: true }, t.array(spaceRow), ctx => {
    const session = ctx.db.sessions.identity.find(ctx.sender);
    if (!session || !ctx.db.users.username.find(session.username)) return [];
    return Array.from(ctx.db.spaces.ownerUsername.filter(session.username));
  },
);

const documentRow = t.row("DocumentSummary", {
  id: t.u64(), spaceId: t.u64(), uploadedBy: t.string(), filename: t.string(),
  mimeType: t.string(), sizeBytes: t.u32(), checksumSha256: t.string(),
  category: t.string(), visibility: t.string(), status: t.string(),
  extractionVersion: t.u32(), error: t.option(t.string()),
  createdAt: t.timestamp(), verifiedAt: t.option(t.timestamp()),
});

export const my_documents = spacetimedb.view(
  { public: true }, t.array(documentRow), ctx => {
    const session = ctx.db.sessions.identity.find(ctx.sender);
    if (!session || !ctx.db.users.username.find(session.username)) return [];
    return Array.from(ctx.db.spaces.ownerUsername.filter(session.username)).flatMap(space =>
      Array.from(ctx.db.documents.spaceId.filter(space.id)).map(document => {
        const { storageKey, storageBucket, storageRegion, storageVersionId, ...summary } = document;
        return summary;
      }),
    );
  },
);
