import { z } from "zod";
import { evidenceSchema } from "./flowchart.ts";

export const severitySchema = z.enum(["none", "elevated", "high", "critical"]);
export type Severity = z.infer<typeof severitySchema>;
const nodeId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const source = z.object({ documentId: evidenceSchema.shape.documentId, page: z.number().int().positive() });

// Why a node carries risk. Direct reasons come from its own evidence; the others
// describe how an upstream problem reaches it (path runs origin -> this node).
export const riskReasonSchema = z.object({
  kind: z.enum(["condition", "issue", "propagated", "redundancy", "backup", "oversight", "contract"]),
  severity: severitySchema,
  text: z.string().min(1).max(400),
  source: source.optional(),
  path: z.array(nodeId).min(2).max(8).optional(),
});
export type RiskReason = z.infer<typeof riskReasonSchema>;

export const nodeRiskSchema = z.object({
  nodeId, label: z.string().min(1).max(100), category: z.string().max(40),
  severity: severitySchema, direct: severitySchema, propagated: severitySchema,
  reasons: z.array(riskReasonSchema).max(12),
  // Network nodes this node's own problems put at risk.
  downstream: z.array(nodeId).max(400),
});
export type NodeRisk = z.infer<typeof nodeRiskSchema>;

export const riskFlagSchema = z.object({
  id: nodeId, nodeId, overviewNodeId: nodeId.nullable(),
  label: z.string().min(1).max(100),
  severity: severitySchema.exclude(["none"]),
  kind: z.enum(["direct", "propagated"]),
  score: z.number().int().nonnegative(),
  summary: z.string().min(1).max(600),
  recommendation: z.string().min(1).max(400),
  rationale: z.string().max(600),
  affected: z.array(z.object({ nodeId, label: z.string().max(100) })).max(40),
  sources: z.array(source).max(12),
});
export type RiskFlag = z.infer<typeof riskFlagSchema>;

export const riskAssessmentSchema = z.object({
  rulesVersion: z.string().min(1).max(40),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  modelId: z.string().max(200),
  recommendationsBy: z.enum(["model", "rules"]),
  summary: z.string().min(1).max(1200),
  counts: z.object({ critical: z.number().int().nonnegative(), high: z.number().int().nonnegative(), elevated: z.number().int().nonnegative() }),
  // Risk projected onto the visible overview nodes (worst of their members).
  overview: z.record(nodeId, z.object({ severity: severitySchema.exclude(["none"]), kind: z.enum(["direct", "propagated"]), nodeId })),
  // Every network node that carries any risk.
  nodes: z.record(nodeId, nodeRiskSchema),
  flags: z.array(riskFlagSchema).max(60),
});
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;

export const riskChangeSchema = z.object({ nodeId, label: z.string().max(100), from: severitySchema, to: severitySchema });
export const riskResultSchema = z.object({
  status: z.enum(["empty", "processing", "ready", "failed"]),
  stale: z.boolean(),
  stage: z.string(),
  error: z.string().nullable(),
  generatedAt: z.string().nullable(),
  assessment: riskAssessmentSchema.nullable(),
  history: z.array(z.object({ createdAt: z.string(), changes: z.array(riskChangeSchema).max(200) })).max(10),
});
export type RiskResult = z.infer<typeof riskResultSchema>;
