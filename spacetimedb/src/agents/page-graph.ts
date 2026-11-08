import { createHash } from "node:crypto";
import { z } from "zod";
import { graphSchema, type SpaceGraph } from "../validation/flowchart.ts";

// The model supplies only graph observations. Document/page identity is attached
// by the caller, so a model's numbering cannot reject a successfully read page.
export const pageGraphSchema = z.object({
  nodes: z.array(graphSchema.shape.nodes.element.omit({ evidence: true }).extend({
    evidence: z.string().min(1).max(400),
  })).max(100),
  edges: z.array(graphSchema.shape.edges.element.omit({ id: true, evidence: true }).extend({
    evidence: z.string().min(1).max(400),
  })).max(200),
});
export type PageGraph = z.infer<typeof pageGraphSchema>;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

export function mergePageGraph(current: SpaceGraph, delta: PageGraph, documentId: string, page: number): SpaceGraph {
  const nodes = new Map(current.nodes.map(node => [node.id, { ...node, evidence: [...node.evidence] }]));
  const edges = new Map(current.edges.map(edge => [edge.id, { ...edge, evidence: [...edge.evidence] }]));
  const references = new Map(current.nodes.map(node => [node.id, node.id]));
  const localIds = new Set<string>();
  for (const observation of delta.nodes) {
    if (localIds.has(observation.id)) throw new Error("The page graph contains duplicate component IDs.");
    localIds.add(observation.id);
    const existing = nodes.get(observation.id);
    const id = existing?.id ?? `n_${hash([documentId, page, observation.id, observation.category, observation.label])}`;
    references.set(observation.id, id);
    const evidence = { documentId, page, detail: observation.evidence };
    if (existing) {
      if (!existing.evidence.some(source => source.documentId === documentId && source.page === page) && existing.evidence.length < 8) existing.evidence.push(evidence);
    } else {
      nodes.set(id, { id, label: observation.label, category: observation.category, description: observation.description, evidence: [evidence] });
    }
  }
  for (const observation of delta.edges) {
    const source = references.get(observation.source);
    const target = references.get(observation.target);
    if (!source || !target || source === target) throw new Error("The page graph refers to an unknown component or contains a self-edge.");
    const id = `e_${hash([source, target, observation.label.trim().toLowerCase()])}`;
    const evidence = { documentId, page, detail: observation.evidence };
    const existing = edges.get(id);
    if (existing) {
      if (!existing.evidence.some(item => item.documentId === documentId && item.page === page) && existing.evidence.length < 8) existing.evidence.push(evidence);
    } else edges.set(id, { id, source, target, label: observation.label, evidence: [evidence] });
  }
  return graphSchema.parse({ nodes: [...nodes.values()], edges: [...edges.values()] });
}
