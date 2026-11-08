import { z } from "zod";
import { graphSchema } from "./flowchart.ts";
import { documentAnalysisSchema } from "./document-analysis.ts";

const reference = z.string().min(1).max(100);
const source = z.object({ page: z.number().int().positive(), detail: z.string().min(1).max(240) });
export const relationshipKind = z.enum(["supplies", "backs_up", "cools", "monitors", "controls", "serves", "located_in", "routes_through", "covers", "leases", "operates", "maintains", "requires", "depends_on", "bills"]);
export const documentFactsSchema = documentAnalysisSchema.extend({
  title: z.string().min(1).max(160),
  entities: z.array(z.object({
    key: reference.describe("Stable asset ID when present, otherwise the full entity name. Never use a sensor tag as a separate physical asset."),
    title: z.string().min(1).max(100),
    category: graphSchema.shape.nodes.element.shape.category,
    description: z.string().min(1).max(320),
    aliases: z.array(reference).max(4),
    evidence: z.array(source).min(1).max(3),
  })).max(200),
  relationships: z.array(z.object({ source: reference, target: reference, kind: relationshipKind,
    evidence: z.array(source).min(1).max(2),
  })).max(400),
}).describe("Document classification, concise summary, major entities and explicitly supported relationships, with original PDF page evidence.");
export const extractionBatchSchema = documentFactsSchema.extend({
  entities: documentFactsSchema.shape.entities.max(20),
  relationships: documentFactsSchema.shape.relationships.max(28),
}).describe("Extract a concise document summary, type, major entities and explicit relationships from the supplied PDF pages.");
export type DocumentFacts = z.infer<typeof documentFactsSchema>;
export type AnalyzedDocument = { documentId: string; filename: string; pages: number; facts: DocumentFacts };
