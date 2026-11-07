import { z } from "zod";

const username = z.string().trim().toLowerCase()
  .min(3, "Username must contain 3 to 32 characters.")
  .max(32, "Username must contain 3 to 32 characters.")
  .regex(/^[a-z0-9_]+$/, "Username may contain only letters, numbers, or underscores.");

const password = z.string()
  .min(1, "Password must contain 1 to 128 characters.")
  .max(128, "Password must contain 1 to 128 characters.");

const displayName = z.string().trim()
  .min(1, "Display name must contain 1 to 80 characters.")
  .max(80, "Display name must contain 1 to 80 characters.");

export const signupSchema = z.object({ username, password, displayName });
export const loginSchema = z.object({ username, password });
export const profileSchema = z.object({ displayName });
