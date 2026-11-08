import { z } from "zod";
import { conditionSchema, findingKindSchema, graphSchema, issueKindSchema } from "./flowchart.ts";
import { documentAnalysisSchema } from "./document-analysis.ts";

// Direction convention: every relationship reads "FROM <kind> TO", and service
// relationships point from the provider to the dependent (utility -> MSB-01 ->
// ATS-01 -> UPS-01 -> SR-01 racks). Downstream traversal therefore follows the
// arrows. "X depends on Y" in source text is extracted as Y -> X.
export const RELATIONSHIP_KINDS = {
  powers: "FROM delivers electrical power to TO",
  backs_up: "FROM is the standby or backup source (e.g. a generator) and TO is the equipment or load it backs up",
  cools: "FROM removes heat from TO or supplies chilled water to TO (chillers, pumps, CRAC units)",
  connects: "FROM provides network connectivity to TO",
  controls: "FROM sends control commands or interlocks to TO",
  monitors: "FROM observes, measures or raises alarms about TO without controlling it",
  protects: "FROM provides fire, life-safety or security protection for TO",
  houses: "FROM physically contains TO (building houses room, room houses racks, conduit carries cables)",
  covers: "FROM is a contract, SLA or warranty that sets obligations about TO",
  party_to: "FROM is an organization named as a party to the contract TO",
  operates: "FROM is an organization that operates, maintains or services TO",
  bills: "FROM charges TO for a service",
} as const;
export type RelationshipKind = keyof typeof RELATIONSHIP_KINDS;
export const relationshipKind = z.enum(Object.keys(RELATIONSHIP_KINDS) as [RelationshipKind, ...RelationshipKind[]]);

const reference = z.string().min(1).max(100);
const page = z.number().int().positive().describe("Original PDF page number as labelled in the input.");
const source = z.object({
  page,
  detail: z.string().min(1).max(240).describe("Short faithful quote, or a description of the visible diagram element. Never invented."),
});

export const documentFactsSchema = documentAnalysisSchema.extend({
  title: z.string().min(1).max(160),
  entities: z.array(z.object({
    key: reference.describe("The exact equipment ID when one exists (e.g. CRAC-02), otherwise the full proper name. Relationships refer to this key."),
    title: z.string().min(1).max(100).describe("Readable name that includes the equipment ID when one exists."),
    category: graphSchema.shape.nodes.element.shape.category,
    description: z.string().min(1).max(320).describe("What this entity is and what role it plays at the property."),
    aliases: z.array(reference).max(4).describe("Other names or legacy tags this document explicitly uses for the same entity."),
    condition: conditionSchema
      .describe("Current condition supported by this document. Use unverified when only a vendor claim, closed ticket or paid invoice supports it."),
    findings: z.array(z.object({
      kind: findingKindSchema,
      statement: z.string().min(1).max(240),
      page,
    })).max(4).describe("Most important facts about this entity, each labelled by how it is known."),
    evidence: z.array(source).min(1).max(3),
  })).max(200),
  relationships: z.array(z.object({
    from: reference.describe("Entity key of the provider, container, contract or organization."),
    to: reference.describe("Entity key of the dependent, contained or governed entity."),
    kind: relationshipKind.describe(Object.entries(RELATIONSHIP_KINDS).map(([kind, meaning]) => `${kind}: ${meaning}`).join("; ")),
    basis: z.enum(["stated", "diagram", "inferred"])
      .describe("stated: the text says it; diagram: an arrow or line in a figure shows it; inferred: you concluded it from context."),
    evidence: z.array(source).min(1).max(2),
  })).max(400),
  issues: z.array(z.object({
    kind: issueKindSchema,
    statement: z.string().min(1).max(300),
    page,
  })).max(40).describe("Problems a property manager should review: conflicting records, unverified repairs or tests, exceeded limits, overdue actions."),
}).describe("Document classification, summary, entities, directed relationships and review issues, with original PDF page evidence.");

export const extractionBatchSchema = documentFactsSchema.extend({
  entities: documentFactsSchema.shape.entities.max(20),
  relationships: documentFactsSchema.shape.relationships.max(28),
  issues: documentFactsSchema.shape.issues.max(8),
}).describe("Extract the document type, summary, major entities, directed relationships and review issues from the supplied PDF pages.");

export type DocumentFacts = z.infer<typeof documentFactsSchema>;
export type AnalyzedDocument = { documentId: string; filename: string; pages: number; facts: DocumentFacts };

// Every page a model cites, used to reject citations outside the source PDF.
export function citedPages(facts: DocumentFacts): number[] {
  return [
    ...facts.entities.flatMap(entity => [...entity.evidence.map(item => item.page), ...entity.findings.map(item => item.page)]),
    ...facts.relationships.flatMap(edge => edge.evidence.map(item => item.page)),
    ...facts.issues.map(issue => issue.page),
  ];
}
