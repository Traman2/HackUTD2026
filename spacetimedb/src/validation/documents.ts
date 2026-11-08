import { z } from "zod";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const spaceInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
});
export const pdfInput = z.object({
  filename: z.string().trim().min(5).max(255)
    .regex(/\.pdf$/i, "Only PDF documents are supported.")
    .refine(value => !/[\x00-\x1f/\\]/.test(value), "Invalid filename."),
  mimeType: z.literal("application/pdf"),
  sizeBytes: z.number().int().min(5).max(MAX_PDF_BYTES),
  // Base64-encoded SHA-256 (32 bytes); S3 validates this against the upload.
  checksumSha256: z.string().regex(/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/),
  category: z.string().trim().min(1).max(80),
});
