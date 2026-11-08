import { Annotation } from "@langchain/langgraph";
import type { SpaceGraph } from "../validation/flowchart.ts";
import type { AnalyzedDocument, DocumentFacts } from "../validation/document-facts.ts";

// Credentials, URLs and raw PDF/page resources live only in per-job runtime.
export const FlowchartState = Annotation.Root({
  analyses: Annotation<AnalyzedDocument[]>({ reducer: (_old, next) => next, default: () => [] }),
  missingIds: Annotation<string[]>({ reducer: (_old, next) => next, default: () => [] }),
  graph: Annotation<SpaceGraph>({ reducer: (_old, next) => next, default: () => ({ nodes: [], edges: [] }) }),
});

export const DocumentExtractionState = Annotation.Root({
  batchIndex: Annotation<number>({ reducer: (_old, next) => next, default: () => 0 }),
  batchCount: Annotation<number>({ reducer: (_old, next) => next, default: () => 0 }),
  pages: Annotation<number>({ reducer: (_old, next) => next, default: () => 0 }),
  parts: Annotation<DocumentFacts[]>({ reducer: (_old, next) => next, default: () => [] }),
  result: Annotation<AnalyzedDocument | null>({ reducer: (_old, next) => next, default: () => null }),
});
