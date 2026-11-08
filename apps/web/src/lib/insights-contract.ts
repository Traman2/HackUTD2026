import { z } from "zod";

const text = z.string().min(1).max(600);
export const citationSchema = z.object({ documentId: z.string().regex(/^[1-9]\d*$/), page: z.number().int().positive(), detail: text });
const common = { id: z.string().regex(/^[\w-]{1,60}$/), title: text, citations: z.array(citationSchema).max(12) };
export const insightSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("card"), value: text, description: text, confidence: z.enum(["high", "medium", "low", "unknown"]) }).strict(),
  z.object({ ...common, type: z.enum(["bar", "line"]), unit: z.string().max(40), points: z.array(z.object({ label: text, value: z.number().finite() }).strict()).min(1).max(40) }).strict(),
  z.object({ ...common, type: z.literal("table"), columns: z.array(text).min(1).max(6), rows: z.array(z.array(z.string().max(600)).max(6)).max(30) }).strict(),
  z.object({ ...common, type: z.literal("graph"), nodes: z.array(z.object({ id: text, label: text }).strict()).max(30), edges: z.array(z.object({ source: text, target: text, label: text }).strict()).max(60) }).strict(),
]);
export const panelSchema = z.object({ components: z.array(insightSchema).max(8) }).strict();
export type Insight = z.infer<typeof insightSchema>;
export type InsightsPanel = z.infer<typeof panelSchema>;
export const chatResponseSchema = z.object({ text: z.string().min(1).max(16000), panel: panelSchema });
