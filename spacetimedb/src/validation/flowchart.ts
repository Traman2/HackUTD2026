import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const evidenceSchema = z.object({
  documentId: z.string().regex(/^[1-9]\d*$/),
  page: z.number().int().positive(),
  detail: z.string().min(1).max(400).describe("Short source quote or description of the visible diagram evidence. Never invent a quote."),
});
export const graphSchema = z.object({
  nodes: z.array(z.object({
    id,
    label: z.string().min(1).max(100),
    category: z.enum(["property", "utility", "contract", "party", "financial", "obligation", "equipment", "cooling", "power", "network", "controls", "safety", "other"]),
    description: z.string().min(1).max(400),
    evidence: z.array(evidenceSchema).min(1).max(8),
  })).max(100),
  edges: z.array(z.object({
    id,
    source: id,
    target: id,
    label: z.string().min(1).max(80).describe("Specific directed relationship, such as supplies, leases, pays, or requires."),
    evidence: z.array(evidenceSchema).min(1).max(8),
  })).max(200),
});
export type SpaceGraph = z.infer<typeof graphSchema>;

export const conditionSchema = z.enum(["normal", "degraded", "out_of_service", "unverified", "unknown"]);
export const findingKindSchema = z.enum(["measured", "vendor_claim", "recorded_status", "historical", "obligation"]);
export const issueKindSchema = z.enum(["contradiction", "unverified_claim", "threshold_exceeded", "overdue", "missing_evidence"]);
const sourced = { documentId: evidenceSchema.shape.documentId, page: z.number().int().positive() };
// Everything known about one graph node beyond its card: names, per-source
// conditions, labelled findings and review issues, each with its source page.
export const nodeDetailsSchema = z.object({
  aliases: z.array(z.string().min(1).max(160)).max(24),
  conditions: z.array(z.object({ condition: conditionSchema, documentId: sourced.documentId })).max(40),
  findings: z.array(z.object({ kind: findingKindSchema, statement: z.string().min(1).max(240), ...sourced })).max(60),
  issues: z.array(z.object({ kind: issueKindSchema, statement: z.string().min(1).max(300), ...sourced })).max(30),
});
export type NodeDetails = z.infer<typeof nodeDetailsSchema>;
export const graphDetailsSchema = z.record(id, nodeDetailsSchema);
export type GraphDetails = z.infer<typeof graphDetailsSchema>;
export const emptyNodeDetails = (): NodeDetails => ({ aliases: [], conditions: [], findings: [], issues: [] });

// The complete published relationship graph behind the overview, used for risk
// propagation. members maps each overview node to the network nodes it merges.
export const networkSchema = z.object({
  graph: z.object({
    nodes: z.array(graphSchema.shape.nodes.element).max(400),
    edges: z.array(graphSchema.shape.edges.element).max(800),
  }),
  details: graphDetailsSchema,
  members: z.record(id, z.array(id).min(1).max(50)),
});
export type Network = z.infer<typeof networkSchema>;

export function withoutDanglingEdges<T extends { nodes: { id: string }[]; edges: { source: string; target: string }[] }>(graph: T): T {
  const ids = new Set(graph.nodes.map(node => node.id));
  return { ...graph, edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target) };
}

export const manifestSchema = z.object({
  namespace: z.string().min(1).max(200),
  owner: z.string().min(1).max(200),
  spaceId: z.string().regex(/^[1-9]\d*$/),
  spaceName: z.string().max(120),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  documents: z.array(z.object({
    id: z.string().regex(/^[1-9]\d*$/), filename: z.string().max(255),
    sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
    checksumSha256: z.string(), url: z.string().url(),
  })).max(100),
});
export type GraphManifest = z.infer<typeof manifestSchema>;

export const graphResultSchema = z.object({
  status: z.enum(["empty", "processing", "ready", "failed"]),
  stale: z.boolean(),
  stage: z.string(),
  error: z.string().nullable(),
  generatedAt: z.string().nullable(),
  graph: graphSchema.nullable(),
  details: graphDetailsSchema.default({}),
  documents: z.array(z.object({ id: z.string(), filename: z.string(), pages: z.number().int().positive(),
    title: z.string().optional(), documentType: z.string().optional(), summary: z.string().optional() })),
});
export type GraphResult = z.infer<typeof graphResultSchema>;

// Validate references after provider schema validation. Disconnected components
// are valid; fabricated connecting edges are not needed to make a graph neat.
export function validateGraph(graph: SpaceGraph, pages: Map<string, number>) {
  const nodes = new Set(graph.nodes.map(node => node.id));
  const edgeIds = new Set(graph.edges.map(edge => edge.id));
  if (nodes.size !== graph.nodes.length || edgeIds.size !== graph.edges.length) throw new Error("Graph contains duplicate IDs.");
  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target) || edge.source === edge.target) throw new Error("Graph contains an invalid relationship.");
  }
  for (const item of [...graph.nodes, ...graph.edges]) {
    for (const evidence of item.evidence) {
      if (evidence.page > (pages.get(evidence.documentId) ?? 0)) throw new Error("Graph contains an invalid source reference.");
    }
  }
  return graph;
}
