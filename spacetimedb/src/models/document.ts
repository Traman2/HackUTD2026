import { table, t } from "spacetimedb/server";

// Originals and future derived outputs have separate records and S3 keys.
export const documents = table({ public: false }, {
  id: t.u64().primaryKey().autoInc(),
  spaceId: t.u64().index("btree"),
  uploadedBy: t.string(),
  filename: t.string(),
  mimeType: t.string(),
  sizeBytes: t.u32(),
  checksumSha256: t.string(),
  category: t.string(),
  visibility: t.string(),
  storageKey: t.string(),
  storageBucket: t.string(),
  storageRegion: t.string(),
  storageVersionId: t.option(t.string()),
  // requested -> uploaded -> verified; AI will later use processing/completed.
  status: t.string(),
  extractionVersion: t.u32(),
  error: t.option(t.string()),
  createdAt: t.timestamp(),
  verifiedAt: t.option(t.timestamp()),
});

export const documentAnalyses = table({ public: false }, {
  documentId: t.u64().primaryKey(), spaceId: t.u64().index("btree"),
  checksumSha256: t.string(), storageBucket: t.string(), storageKey: t.string(), storageVersionId: t.option(t.string()),
  documentType: t.string(), summary: t.string(), status: t.string(), error: t.option(t.string()),
  processedPages: t.u32(), totalPages: t.u32(), modelId: t.string(), updatedAt: t.timestamp(),
});

// Canonical document-level metadata and facts for the current workflow. The
// earlier documentAnalyses table is retained so existing summaries aren't lost.
export const documentMetadata = table({ public: false }, {
  documentId: t.u64().primaryKey(), spaceId: t.u64().index("btree"), filename: t.string(),
  checksumSha256: t.string(), storageBucket: t.string(), storageKey: t.string(), storageVersionId: t.option(t.string()),
  title: t.string(), documentType: t.string(), summary: t.string(), factsJson: t.string(),
  pages: t.u32(), modelId: t.string(), pipelineVersion: t.string(), updatedAt: t.timestamp(),
});

export const uploads = table({ public: false }, {
  documentId: t.u64().primaryKey(),
  requestedBy: t.string().index("btree"),
  attempt: t.u32(),
  status: t.string(),
  expiresAt: t.timestamp(),
});

export const documentArtifacts = table({ public: false }, {
  id: t.u64().primaryKey().autoInc(),
  documentId: t.u64().index("btree"),
  // Future parsed_text, thumbnail, chunks, or extraction_json objects.
  kind: t.string(),
  storageKey: t.string(),
  extractionVersion: t.u32(),
  createdAt: t.timestamp(),
});
