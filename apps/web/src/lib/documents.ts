import type { DbConnection } from "../module_bindings";

// Call this for each File from a space drop zone's dataTransfer.files.
export async function uploadSpacePdf(
  connection: DbConnection,
  spaceId: bigint,
  file: File,
  category = "general",
  options: { onDocumentCreated?: (documentId: bigint) => void } = {},
): Promise<bigint> {
  if (!/\.pdf$/i.test(file.name) || file.size < 5 || file.size > 20 * 1024 * 1024) {
    throw new Error("Choose a PDF between 5 bytes and 20 MiB.");
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  const checksumSha256 = btoa(String.fromCharCode(...digest));
  const ticket = await connection.procedures.requestDocumentUpload({
    spaceId, filename: file.name, mimeType: "application/pdf",
    sizeBytes: file.size, checksumSha256, category,
  });
  options.onDocumentCreated?.(ticket.documentId);
  await putAndConfirm(connection, ticket, file);
  return ticket.documentId;
}

// Retry the same file for an existing failed/expired document upload.
export async function retrySpacePdf(connection: DbConnection, documentId: bigint, file: File) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  const checksum = btoa(String.fromCharCode(...digest));
  const ticket = await connection.procedures.retryDocumentUpload({ documentId });
  if (checksum !== ticket.checksumSha256) throw new Error("Retry with the original PDF file.");
  await putAndConfirm(connection, ticket, file);
}

async function putAndConfirm(
  connection: DbConnection,
  ticket: { documentId: bigint; url: string; contentType: string; checksumSha256: string },
  file: File,
) {
  const response = await fetch(ticket.url, {
    method: "PUT",
    headers: { "Content-Type": ticket.contentType, "x-amz-checksum-sha256": ticket.checksumSha256 },
    body: file,
  });
  if (!response.ok) throw new Error(`PDF upload failed (${response.status}). Please retry.`);
  await connection.procedures.confirmDocumentUpload({ documentId: ticket.documentId });
}
