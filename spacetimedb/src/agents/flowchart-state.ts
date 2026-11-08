import { Annotation } from "@langchain/langgraph";
import type { GraphDetails, SpaceGraph } from "../validation/flowchart.ts";
import type { AnalyzedDocument } from "../validation/document-facts.ts";

// Credentials, URLs and raw PDF/page resources live only in per-job runtime;
// state holds document IDs and extracted facts so traces stay small and safe.
export const FlowchartState = Annotation.Root({
  // Parallel extract_document workers each return one analysis; merge by ID.
  analyses: Annotation<AnalyzedDocument[]>({
    reducer: (current, update) => [...new Map([...current, ...update].map(doc => [doc.documentId, doc])).values()],
    default: () => [],
  }),
  pendingIds: Annotation<string[]>({ reducer: (_old, next) => next, default: () => [] }),
  // Input of a single extract_document worker, supplied through Send.
  documentId: Annotation<string>({ reducer: (_old, next) => next, default: () => "" }),
  candidates: Annotation<SpaceGraph>({ reducer: (_old, next) => next, default: () => ({ nodes: [], edges: [] }) }),
  candidateDetails: Annotation<GraphDetails>({ reducer: (_old, next) => next, default: () => ({}) }),
  graph: Annotation<SpaceGraph>({ reducer: (_old, next) => next, default: () => ({ nodes: [], edges: [] }) }),
  details: Annotation<GraphDetails>({ reducer: (_old, next) => next, default: () => ({}) }),
  members: Annotation<Record<string, string[]>>({ reducer: (_old, next) => next, default: () => ({}) }),
});
export type FlowchartStateType = typeof FlowchartState.State;
