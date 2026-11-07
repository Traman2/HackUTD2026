import { schema } from "spacetimedb/server";
import { users } from "./models/user";
import { sessions } from "./models/session";

const spacetimedb = schema({ users, sessions });
export default spacetimedb;
