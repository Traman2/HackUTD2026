import { z } from "zod";

export const spaceSchema = z.object({
  name: z.string().trim().min(1, "Enter a space name.").max(120, "Use 120 characters or fewer."),
  description: z.string().trim().max(2000, "Use 2000 characters or fewer."),
});
export type SpaceValues = z.infer<typeof spaceSchema>;
