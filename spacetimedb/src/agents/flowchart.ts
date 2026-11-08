import { createHash } from "node:crypto";
import { z } from "zod";
import { StateGraph, Send, START, END } from "@langchain/langgraph";
import { bedrockModelId } from "../clients/bedrock.ts";
import { graphDetailsSchema, graphSchema, validateGraph, type GraphManifest, type SpaceGraph } from "../validation/flowchart.ts";
import { documentFactsSchema, type AnalyzedDocument } from "../validation/document-facts.ts";
import type { SpacetimeGraphStore } from "./spacetime-graph-store.ts";
import { downloadDocument, GraphInputError } from "./document-source.ts";
import { FlowchartState, type FlowchartStateType } from "./flowchart-state.ts";
import { boundedMap } from "./bounded-map.ts";
import { prepareDocument, extractDocumentBatch, combineDocumentBatches, METADATA_VERSION } from "./extract-document.ts";
import { buildRelationshipCandidates, detailsFor, singletonMembers, sparseOverview, selectRelationshipOverview, OVERVIEW_PROMPT } from "./relationship-graph.ts";

export { GraphInputError, validateS3Url } from "./document-source.ts";

const MAX_PAGES = 200;
const MAX_BYTES = 100 * 1024 * 1024;
// Concurrent extract_document workers. Each normally makes one model call.
const EXTRACTION_CONCURRENCY = 2;
const overviewCacheSchema = z.object({ graph: graphSchema, details: graphDetailsSchema, members: z.record(z.string(), z.array(z.string())) });

/*
 * START -> load_cached_metadata --(Send per uncached PDF)--> extract_document (x N, parallel)
 *                     |                                            |
 *                     +-------------(all cached)-------------------+--> build_relationship_candidates
 *       -> select_relationship_overview -> save_flowchart -> END
 */
export function buildFlowchartWorkflow(manifest: GraphManifest, store: SpacetimeGraphStore, signal: AbortSignal) {
  const modelId = bedrockModelId();
  const documentsById = new Map(manifest.documents.map(doc => [doc.id, doc]));
  // Runtime bookkeeping shared by parallel workers for progress previews and the
  // corpus page budget. Graph state remains the source of truth for results.
  const completed = new Map<string, AnalyzedDocument>();
  const pageCounts = new Map<string, number>();
  const totalPages = () => [...pageCounts.values()].reduce((sum, count) => sum + count, 0);
  const inManifestOrder = (docs: AnalyzedDocument[]) => manifest.documents.flatMap(doc => docs.filter(item => item.documentId === doc.id));
  const inventory = (docs: AnalyzedDocument[]) => docs.map(doc => ({ id: doc.documentId, filename: doc.filename, pages: doc.pages }));
  const validate = (graph: SpaceGraph, docs: AnalyzedDocument[]) => validateGraph(graphSchema.parse(graph), new Map(docs.map(doc => [doc.documentId, doc.pages])));

  // Serialized so concurrent document completions cannot overwrite newer previews.
  let checkpointQueue = Promise.resolve();
  const checkpoint = () => {
    checkpointQueue = checkpointQueue.then(async () => {
      const docs = inManifestOrder([...completed.values()]);
      if (!docs.length) return;
      const candidates = buildRelationshipCandidates(docs);
      const graph = validate(sparseOverview(candidates.graph), docs);
      await store.checkpoint(graph, inventory(docs), `Extracted ${docs.length}/${manifest.documents.length} documents`, detailsFor(graph, candidates.details));
    });
    return checkpointQueue;
  };

  async function loadCachedMetadata(): Promise<Partial<FlowchartStateType>> {
    signal.throwIfAborted();
    if (!manifest.documents.length) throw new GraphInputError("Add PDF documents before generating.");
    if (manifest.documents.reduce((sum, doc) => sum + doc.sizeBytes, 0) > MAX_BYTES) throw new GraphInputError("The corpus exceeds the 100 MiB source limit.");
    await store.stage(manifest, "Checking saved document metadata");
    const cached = await boundedMap(manifest.documents, 3, async doc => {
      const raw = await store.getDocumentMetadata({ documentId: doc.id, checksumSha256: doc.checksumSha256, pipelineVersion: METADATA_VERSION, modelId });
      if (!raw || typeof raw !== "object") return null;
      const value = raw as Partial<AnalyzedDocument>;
      const facts = documentFactsSchema.safeParse(value.facts);
      if (!facts.success || !Number.isInteger(value.pages) || value.pages! < 1 || value.documentId !== doc.id) return null;
      const result: AnalyzedDocument = { documentId: doc.id, filename: doc.filename, pages: value.pages!, facts: facts.data };
      completed.set(doc.id, result);
      pageCounts.set(doc.id, result.pages);
      return result;
    });
    if (totalPages() > MAX_PAGES) throw new GraphInputError(`The corpus exceeds the ${MAX_PAGES}-page generation limit.`);
    if (completed.size) await checkpoint();
    return {
      analyses: cached.filter((doc): doc is AnalyzedDocument => doc !== null),
      pendingIds: manifest.documents.filter(doc => !completed.has(doc.id)).map(doc => doc.id),
    };
  }

  // One worker per uncached PDF: download, read pages, extract each bounded
  // section with one structured call, then persist the document's metadata.
  async function extractDocument(state: FlowchartStateType): Promise<Partial<FlowchartStateType>> {
    const doc = documentsById.get(state.documentId);
    if (!doc) throw new GraphInputError("Unknown document in generation request.");
    signal.throwIfAborted();
    await store.stage(manifest, `Reading ${doc.filename} (${completed.size}/${manifest.documents.length} complete)`);
    const { pages, batches } = await prepareDocument(await downloadDocument(doc, signal), doc.filename);
    pageCounts.set(doc.id, pages);
    if (totalPages() > MAX_PAGES) throw new GraphInputError(`The corpus exceeds the ${MAX_PAGES}-page generation limit. Completed documents are saved.`);
    const parts = [];
    for (let index = 0; index < batches.length; index++) {
      signal.throwIfAborted();
      await store.stage(manifest, `Extracting ${doc.filename}${batches.length > 1 ? `, section ${index + 1}/${batches.length}` : ""} (${completed.size}/${manifest.documents.length} complete)`);
      parts.push(await extractDocumentBatch({ documentId: doc.id, filename: doc.filename, batch: batches[index]!,
        batchIndex: index, batchCount: batches.length, spaceId: manifest.spaceId, signal }));
      batches[index] = { pages: [] }; // Release rendered page images promptly.
    }
    const facts = combineDocumentBatches(parts);
    await store.saveDocumentMetadata({ documentId: doc.id, checksumSha256: doc.checksumSha256, pipelineVersion: METADATA_VERSION, modelId, pages, facts });
    const result: AnalyzedDocument = { documentId: doc.id, filename: doc.filename, pages, facts };
    completed.set(doc.id, result);
    await checkpoint();
    return { analyses: [result] };
  }

  async function buildCandidates(state: FlowchartStateType): Promise<Partial<FlowchartStateType>> {
    await store.stage(manifest, "Matching equipment IDs and joining relationships across documents");
    const { graph, details } = buildRelationshipCandidates(inManifestOrder(state.analyses));
    return { candidates: graph, candidateDetails: details };
  }

  async function selectOverview(state: FlowchartStateType): Promise<Partial<FlowchartStateType>> {
    await store.stage(manifest, "Selecting a clear relationship overview");
    const analyses = inManifestOrder(state.analyses);
    const cacheKey = createHash("sha256").update(JSON.stringify(["relationship-overview-v5", manifest.namespace, manifest.owner,
      manifest.spaceId, manifest.fingerprint, METADATA_VERSION, modelId, OVERVIEW_PROMPT, analyses])).digest("hex");
    const cached = overviewCacheSchema.safeParse(await store.getCachedResult(cacheKey));
    if (cached.success) {
      try { return { graph: validate(cached.data.graph, analyses), details: detailsFor(cached.data.graph, cached.data.details),
        members: { ...singletonMembers(cached.data.graph), ...cached.data.members } }; }
      catch { /* Rebuild incompatible cached graphs. */ }
    }
    const overview = await selectRelationshipOverview(state.candidates, state.candidateDetails, analyses, signal, manifest.spaceId);
    validate(overview.graph, analyses);
    await store.saveCachedResult(cacheKey, overview);
    return overview;
  }

  async function saveFlowchart(state: FlowchartStateType): Promise<Partial<FlowchartStateType>> {
    const analyses = inManifestOrder(state.analyses);
    // The full published network backs risk propagation; the overview is only
    // what is drawn. Findings are omitted to bound size (risk uses conditions
    // and issues), and citations are trimmed to three per item.
    const trim = <T extends { evidence: unknown[] }>(item: T) => ({ ...item, evidence: item.evidence.slice(0, 3) });
    const networkDetails = Object.fromEntries(Object.entries(state.candidateDetails).map(([id, item]) => [id, { ...item, findings: [] }]));
    await store.saveNetwork({ graph: { nodes: state.candidates.nodes.map(trim), edges: state.candidates.edges.map(trim) },
      details: networkDetails, members: { ...singletonMembers(state.graph), ...state.members } });
    await store.save(manifest, validate(state.graph, analyses), inventory(analyses), detailsFor(state.graph, state.details));
    return {};
  }

  const workflow = new StateGraph(FlowchartState)
    .addNode("load_cached_metadata", loadCachedMetadata)
    .addNode("extract_document", extractDocument)
    .addNode("build_relationship_candidates", buildCandidates)
    .addNode("select_relationship_overview", selectOverview)
    .addNode("save_flowchart", saveFlowchart)
    .addEdge(START, "load_cached_metadata")
    // Map: one Send per uncached PDF. The Send payload carries only the ID.
    .addConditionalEdges("load_cached_metadata", state => state.pendingIds.length
      ? state.pendingIds.map(documentId => new Send("extract_document", { documentId }))
      : "build_relationship_candidates", ["extract_document", "build_relationship_candidates"])
    // Reduce: the analyses reducer merges every worker's result before this runs.
    .addEdge("extract_document", "build_relationship_candidates")
    .addEdge("build_relationship_candidates", "select_relationship_overview")
    .addEdge("select_relationship_overview", "save_flowchart")
    .addEdge("save_flowchart", END)
    .compile();
  return { workflow, dispose: async () => { await checkpointQueue.catch(() => {}); completed.clear(); pageCounts.clear(); } };
}

export async function generateFlowchart(manifest: GraphManifest, store: SpacetimeGraphStore) {
  const signal = AbortSignal.timeout(20 * 60 * 1000);
  const { workflow, dispose } = buildFlowchartWorkflow(manifest, store, signal);
  try {
    await workflow.invoke({}, { signal, recursionLimit: 25, maxConcurrency: EXTRACTION_CONCURRENCY,
      runName: "space-flowchart.workflow", tags: ["metadata-to-relationships"],
      metadata: { spaceId: manifest.spaceId, jobId: store.jobId, modelId: bedrockModelId(), metadataVersion: METADATA_VERSION } });
  } finally { await dispose(); }
}
