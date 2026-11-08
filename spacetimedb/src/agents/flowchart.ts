import { createHash } from "node:crypto";
import { StateGraph, START, END } from "@langchain/langgraph";
import { bedrockModelId } from "../clients/bedrock.ts";
import { graphSchema, validateGraph, type GraphManifest, type SpaceGraph } from "../validation/flowchart.ts";
import { documentFactsSchema, type AnalyzedDocument } from "../validation/document-facts.ts";
import type { SpacetimeGraphStore } from "./spacetime-graph-store.ts";
import { downloadDocument, GraphInputError } from "./document-source.ts";
import { FlowchartState, DocumentExtractionState } from "./flowchart-state.ts";
import { boundedMap } from "./bounded-map.ts";
import { prepareDocument, extractDocumentBatch, combineDocumentBatches, METADATA_VERSION, type DocumentBatch } from "./extract-document.ts";
import { buildRelationshipCandidates, sparseOverview, selectRelationshipOverview, OVERVIEW_PROMPT } from "./relationship-graph.ts";

export { GraphInputError, validateS3Url } from "./document-source.ts";

export function buildFlowchartWorkflow(manifest: GraphManifest, store: SpacetimeGraphStore, signal: AbortSignal) {
  const originals = new Map<string, Buffer>();
  const completed = new Map<string, AnalyzedDocument>();
  const pageCounts = new Map<string, number>();
  const modelId = bedrockModelId();
  const ordered = () => manifest.documents.flatMap(doc => completed.has(doc.id) ? [completed.get(doc.id)!] : []);
  const inventory = (docs: AnalyzedDocument[]) => docs.map(doc => ({ id: doc.documentId, filename: doc.filename, pages: doc.pages }));
  const validate = (graph: SpaceGraph, docs: AnalyzedDocument[]) => validateGraph(graphSchema.parse(graph), new Map(docs.map(doc => [doc.documentId, doc.pages])));
  let checkpointQueue = Promise.resolve();
  const checkpoint = () => {
    checkpointQueue = checkpointQueue.then(async () => {
      const docs = ordered();
      if (!docs.length) return;
      const graph = sparseOverview(buildRelationshipCandidates(docs));
      await store.checkpoint(validate(graph, docs), inventory(docs), `Extracted ${docs.length}/${manifest.documents.length} documents; building relationship overview`);
    });
    return checkpointQueue;
  };

  async function analyzeDocument(doc: GraphManifest["documents"][number]): Promise<AnalyzedDocument> {
    let batches: DocumentBatch[] = [];
    const documentWorkflow = new StateGraph(DocumentExtractionState)
      .addNode("prepare_pdf", async () => {
        signal.throwIfAborted();
        const bytes = originals.get(doc.id);
        if (!bytes) throw new GraphInputError(`Source PDF unavailable: ${doc.filename}.`);
        originals.delete(doc.id);
        const prepared = await prepareDocument(bytes, doc.filename);
        batches = prepared.batches;
        pageCounts.set(doc.id, prepared.pages);
        if ([...pageCounts.values()].reduce((sum, count) => sum + count, 0) > 200) throw new GraphInputError("The corpus exceeds the 200-page generation limit. Completed documents are saved.");
        return { pages: prepared.pages, batchCount: batches.length };
      })
      .addNode("extract_metadata_and_facts", async state => {
        signal.throwIfAborted();
        await store.stage(manifest, `Extracting ${doc.filename}${state.batchCount > 1 ? `, section ${state.batchIndex + 1}/${state.batchCount}` : ""} (${completed.size}/${manifest.documents.length} complete)`);
        const facts = await extractDocumentBatch({ documentId: doc.id, filename: doc.filename,
          batch: batches[state.batchIndex]!, batchIndex: state.batchIndex, batchCount: state.batchCount, spaceId: manifest.spaceId, signal });
        // Release image data as soon as its extraction call has completed.
        batches[state.batchIndex] = { pages: [] };
        return { parts: [...state.parts, facts], batchIndex: state.batchIndex + 1 };
      })
      .addNode("save_document_metadata", async state => {
        const facts = combineDocumentBatches(state.parts);
        await store.saveDocumentMetadata({ documentId: doc.id, checksumSha256: doc.checksumSha256,
          pipelineVersion: METADATA_VERSION, modelId, pages: state.pages, facts });
        const result: AnalyzedDocument = { documentId: doc.id, filename: doc.filename, pages: state.pages, facts };
        completed.set(doc.id, result);
        await checkpoint();
        return { result, parts: [] };
      })
      .addEdge(START, "prepare_pdf")
      .addEdge("prepare_pdf", "extract_metadata_and_facts")
      .addConditionalEdges("extract_metadata_and_facts", state => state.batchIndex < state.batchCount
        ? "extract_metadata_and_facts" : "save_document_metadata", ["extract_metadata_and_facts", "save_document_metadata"])
      .addEdge("save_document_metadata", END)
      .compile();
    try {
      const state = await documentWorkflow.invoke({}, { signal, recursionLimit: 250,
        runName: "space-documents.document-workflow", tags: ["document-metadata"], metadata: { spaceId: manifest.spaceId, documentId: doc.id } });
      if (!state.result) throw new GraphInputError(`No metadata was saved for ${doc.filename}.`);
      return state.result;
    } finally { batches = []; }
  }

  const workflow = new StateGraph(FlowchartState)
    .addNode("load_cached_metadata", async () => {
      signal.throwIfAborted();
      if (!manifest.documents.length) throw new GraphInputError("Add PDF documents before generating.");
      if (manifest.documents.reduce((sum, doc) => sum + doc.sizeBytes, 0) > 100 * 1024 * 1024) throw new GraphInputError("The corpus exceeds the 100 MiB source limit.");
      await store.stage(manifest, "Checking saved document metadata");
      const cached = await boundedMap(manifest.documents, 3, async doc => {
        const raw = await store.getDocumentMetadata({ documentId: doc.id, checksumSha256: doc.checksumSha256, pipelineVersion: METADATA_VERSION, modelId });
        if (!raw || typeof raw !== "object") return null;
        const value = raw as AnalyzedDocument;
        const parsed = documentFactsSchema.safeParse(value.facts);
        if (!parsed.success || !Number.isInteger(value.pages) || value.pages < 1 || value.documentId !== doc.id) return null;
        const result = { documentId: doc.id, filename: doc.filename, pages: value.pages, facts: parsed.data };
        completed.set(doc.id, result); pageCounts.set(doc.id, value.pages);
        return result;
      });
      if ([...pageCounts.values()].reduce((sum, count) => sum + count, 0) > 200) throw new GraphInputError("The corpus exceeds the 200-page generation limit.");
      if (completed.size) await checkpoint();
      return { analyses: cached.filter((doc): doc is AnalyzedDocument => doc !== null), missingIds: manifest.documents.filter(doc => !completed.has(doc.id)).map(doc => doc.id) };
    })
    .addNode("download_missing_sources", async state => {
      await store.stage(manifest, `Downloading ${state.missingIds.length} uncached PDFs`);
      const missing = new Set(state.missingIds);
      await boundedMap(manifest.documents.filter(doc => missing.has(doc.id)), 3, async doc => {
        originals.set(doc.id, await downloadDocument(doc, signal));
      });
      return {};
    })
    .addNode("extract_documents", async state => {
      const missing = new Set(state.missingIds);
      // Two document workflows run concurrently; each normally needs one model
      // call. Larger PDFs loop over bounded sections without feeding history.
      await boundedMap(manifest.documents.filter(doc => missing.has(doc.id)), 2, analyzeDocument);
      return { analyses: ordered(), missingIds: [] };
    })
    .addNode("build_relationship_candidates", async state => {
      await store.stage(manifest, "Matching asset IDs and joining document relationships");
      return { graph: buildRelationshipCandidates(state.analyses) };
    })
    .addNode("select_relationship_overview", async state => {
      await store.stage(manifest, "Selecting a clear relationship overview");
      const cacheKey = createHash("sha256").update(JSON.stringify(["relationship-overview-v2", manifest.namespace, manifest.owner,
        manifest.spaceId, manifest.fingerprint, METADATA_VERSION, modelId, OVERVIEW_PROMPT, state.analyses])).digest("hex");
      const cached = graphSchema.safeParse(await store.getCachedResult(cacheKey));
      if (cached.success) {
        try { return { graph: validate(cached.data, state.analyses) }; } catch { /* Rebuild incompatible cached graphs. */ }
      }
      const graph = await selectRelationshipOverview(state.graph, state.analyses, signal, manifest.spaceId);
      validate(graph, state.analyses);
      await store.saveCachedResult(cacheKey, graph);
      return { graph };
    })
    .addNode("save_flowchart", async state => {
      await store.save(manifest, validate(state.graph, state.analyses), inventory(state.analyses));
      return {};
    })
    .addEdge(START, "load_cached_metadata")
    .addConditionalEdges("load_cached_metadata", state => state.missingIds.length
      ? "download_missing_sources" : "build_relationship_candidates", ["download_missing_sources", "build_relationship_candidates"])
    .addEdge("download_missing_sources", "extract_documents")
    .addEdge("extract_documents", "build_relationship_candidates")
    .addEdge("build_relationship_candidates", "select_relationship_overview")
    .addEdge("select_relationship_overview", "save_flowchart")
    .addEdge("save_flowchart", END)
    .compile();
  return { workflow, dispose: async () => { await checkpointQueue.catch(() => {}); originals.clear(); completed.clear(); pageCounts.clear(); } };
}

export async function generateFlowchart(manifest: GraphManifest, store: SpacetimeGraphStore) {
  const signal = AbortSignal.timeout(20 * 60 * 1000);
  const { workflow, dispose } = buildFlowchartWorkflow(manifest, store, signal);
  try {
    await workflow.invoke({}, { signal, recursionLimit: 30, runName: "space-flowchart.workflow", tags: ["metadata-to-relationships"],
      metadata: { spaceId: manifest.spaceId, jobId: store.jobId, modelId: bedrockModelId(), metadataVersion: METADATA_VERSION } });
  } finally { await dispose(); }
}
