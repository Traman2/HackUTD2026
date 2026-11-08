import { table, t } from "spacetimedb/server";

const evidence = t.object("FlowchartEvidence", { documentId: t.string(), page: t.u32(), detail: t.string() });
const node = t.object("FlowchartNode", {
  id: t.string(), label: t.string(), category: t.string(), description: t.string(), evidence: t.array(evidence),
});
const edge = t.object("FlowchartEdge", {
  id: t.string(), source: t.string(), target: t.string(), label: t.string(), evidence: t.array(evidence),
});
const source = t.object("FlowchartSource", { id: t.string(), filename: t.string(), pages: t.u32() });

export const flowcharts = table({ public: false }, {
  spaceId: t.u64().primaryKey(), ownerUsername: t.string(),
  status: t.string(), stage: t.string(), error: t.option(t.string()),
  fingerprint: t.string(), requestedFingerprint: t.string(), jobId: t.string(),
  leaseUntil: t.timestamp(), generatedAt: t.option(t.timestamp()), updatedAt: t.timestamp(),
  nodes: t.array(node), edges: t.array(edge), documents: t.array(source),
});

export const flowchartPageFindings = table({ public: false }, {
  cacheKey: t.string().primaryKey(), spaceId: t.u64().index("btree"),
  ownerUsername: t.string(), findingsJson: t.string(), createdAt: t.timestamp(),
});
