import { z } from "zod";

export const documentAnalysisSchema = z.object({
  documentType: z.enum(["lease", "utility_statement", "invoice", "financial_statement", "insurance", "maintenance", "inspection", "contract", "property_report", "asset_register", "generator_test", "controls_report", "network_assessment", "operations_report", "other", "unknown"]),
  summary: z.string().min(1).max(1600),
});
export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;
