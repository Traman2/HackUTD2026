import { schema, t } from "spacetimedb/server";
import { users } from "./models/user";
import { sessions } from "./models/session";

const spacetimedb = schema({ users, sessions }, {
  env: {
    AGENT_URL: t.option(t.string()),
    AGENT_API_KEY: t.option(t.string()),
  },
});
export default spacetimedb;
