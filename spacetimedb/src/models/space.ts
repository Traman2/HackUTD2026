import { table, t } from "spacetimedb/server";

export const spaceFields = {
  id: t.u64().primaryKey().autoInc(),
  ownerUsername: t.string().index("btree"),
  name: t.string(),
  description: t.string(),
  archived: t.bool(),
  createdAt: t.timestamp(),
  updatedAt: t.timestamp(),
};

export const spaces = table({ public: false }, spaceFields);
