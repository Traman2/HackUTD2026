import { z } from "zod";

export const agentRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(16000),
});
export const agentResponseSchema = z.object({
  text: z.string().min(1).max(100000),
});
