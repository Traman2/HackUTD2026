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
    category: z.enum(["property", "utility", "contract", "party", "financial", "obligation", "other"]),
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
  documents: z.array(z.object({ id: z.string(), filename: z.string(), pages: z.number().int().positive() })),
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
