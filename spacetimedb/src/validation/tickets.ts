import { z } from "zod";
import { evidenceSchema } from "./flowchart.ts";
import { severitySchema } from "./risk.ts";

const nodeId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const ticketKindSchema = z.enum(["resolve", "discovery"]);
export const ticketStatusSchema = z.enum(["open", "in_progress", "resolved", "closed", "cancelled"]);
export const stepKindSchema = z.enum(["observe", "measure", "verify", "photo", "record", "escalate"]);
export const stepStatusSchema = z.enum(["pending", "done", "failed", "skipped"]);
const source = z.object({ documentId: evidenceSchema.shape.documentId, page: z.number().int().positive() });

// What the model drafts for one problem. Steps are spoken through open-ear
// glasses speakers, so each is one short, safe, observable action.
export const ticketDraftSchema = z.object({
  title: z.string().min(1).max(100).describe("Short imperative title naming the asset, e.g. 'Verify CRAC-02 refrigerant leak repair'."),
  kind: ticketKindSchema.describe("resolve: steps aim to fix or confirm a fix. discovery: steps gather evidence when the cause or state is unknown."),
  summary: z.string().min(1).max(400).describe("Why this ticket exists, citing the evidence."),
  safetyNotes: z.string().max(300).describe("Hazards and when to stop and call a qualified technician. Empty if none."),
  steps: z.array(z.object({
    instruction: z.string().min(1).max(200).describe("One short action a technician can do hands-free and hear through glasses."),
    kind: stepKindSchema,
    expectedResult: z.string().max(200).describe("What a normal or passing result looks like."),
    requiresPhoto: z.boolean().describe("True when a photo from the glasses would document the result."),
  })).min(2).max(8),
}).describe("A maintenance ticket with ordered troubleshooting steps for one problem.");
export type TicketDraft = z.infer<typeof ticketDraftSchema>;

// A ticket the agent produced, as saved. Step status/result are filled in later
// from the mobile app and glasses.
export const ticketInputSchema = ticketDraftSchema.extend({
  problemKey: z.string().regex(/^[a-f0-9]{32}$/),
  priority: severitySchema.exclude(["none"]),
  assetLabel: z.string().min(1).max(100),
  equipmentCode: z.string().max(40),
  overviewNodeId: nodeId.nullable(),
  networkNodeId: nodeId,
  sources: z.array(source).max(12),
  draftedBy: z.enum(["model", "rules"]),
});
export type TicketInput = z.infer<typeof ticketInputSchema>;

export const ticketSchema = ticketInputSchema.omit({ steps: true }).extend({
  id: z.string().regex(/^\d+$/),
  status: ticketStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  steps: z.array(ticketDraftSchema.shape.steps.element.extend({
    order: z.number().int().positive(),
    status: stepStatusSchema,
    result: z.string().nullable(),
    completedAt: z.string().nullable(),
  })),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const ticketsResultSchema = z.object({
  status: z.enum(["empty", "processing", "ready", "failed"]),
  stage: z.string(),
  error: z.string().nullable(),
  generatedAt: z.string().nullable(),
  lastCreated: z.number().int().nonnegative(),
  tickets: z.array(ticketSchema),
});
export type TicketsResult = z.infer<typeof ticketsResultSchema>;
