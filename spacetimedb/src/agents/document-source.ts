import { createHash } from "node:crypto";
import type { GraphManifest } from "../validation/flowchart.ts";

export class GraphInputError extends Error {}

export function validateS3Url(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.s3\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname) || url.username || url.password || url.port) throw new GraphInputError("Document download URL is invalid.");
}

export async function downloadDocument(doc: GraphManifest["documents"][number], signal: AbortSignal) {
  validateS3Url(doc.url);
  const response = await fetch(doc.url, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
  if (!response.ok || !response.body) throw new GraphInputError(`Could not download ${doc.filename}. Retry generation to refresh download links.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > doc.sizeBytes) throw new GraphInputError(`Document size changed: ${doc.filename}.`);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  if (length !== doc.sizeBytes || createHash("sha256").update(bytes).digest("base64") !== doc.checksumSha256) throw new GraphInputError(`Document verification failed: ${doc.filename}.`);
  return bytes;
}
