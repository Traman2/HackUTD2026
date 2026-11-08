import { Timestamp } from "spacetimedb";
import { SenderError, t, type InferSchema, type TransactionCtx } from "spacetimedb/server";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";
import spacetimedb from "../schema";
import { graphDetailsSchema, graphResultSchema, graphSchema, networkSchema, validateGraph, withoutDanglingEdges, type GraphDetails } from "../validation/flowchart";
import { handleRiskOperation, RISK_OPERATIONS, type RiskOperation } from "./risk-storage";
import { citedPages, documentFactsSchema } from "../validation/document-facts";

type Tx = TransactionCtx<InferSchema<typeof spacetimedb>>;
export function sourceFingerprint(documents: { id: bigint; checksumSha256: string; storageVersionId?: string; storageKey: string }[]) {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify([...documents].sort((a, b) => a.id < b.id ? -1 : 1).map(doc => [String(doc.id), doc.checksumSha256, doc.storageVersionId ?? "", doc.storageKey])))));
}

export function savedFlowchart(tx: Tx, spaceId: bigint) {
  let row = tx.db.flowcharts.spaceId.find(spaceId);
  if (!row) return graphResultSchema.parse({ status: "empty", stale: false, stage: "", error: null, generatedAt: null, graph: null, documents: [] });
  if (row.status === "processing" && row.leaseUntil.microsSinceUnixEpoch < tx.timestamp.microsSinceUnixEpoch) {
    row = tx.db.flowcharts.spaceId.update({ ...row, status: "failed", stage: "", error: "Generation was interrupted. Please retry.", updatedAt: tx.timestamp });
  }
  const documents = Array.from(tx.db.documents.spaceId.filter(spaceId)).filter(doc => doc.verifiedAt);
  const graph = row.generatedAt ? withoutDanglingEdges({ nodes: row.nodes, edges: row.edges }) : null;
  let details: GraphDetails = {};
  if (graph && row.detailsJson) {
    const parsed = graphDetailsSchema.safeParse(JSON.parse(row.detailsJson));
    if (parsed.success) details = Object.fromEntries(graph.nodes.flatMap(node => parsed.data[node.id] ? [[node.id, parsed.data[node.id]!]] : []));
  }
  // Describe each cited source with its extracted title, type and summary.
  const sources = row.documents.map(doc => {
    const metadata = tx.db.documentMetadata.documentId.find(BigInt(doc.id));
    return metadata ? { ...doc, title: metadata.title, documentType: metadata.documentType, summary: metadata.summary } : doc;
  });
  return graphResultSchema.parse({ status: row.status, stale: !!row.generatedAt && row.fingerprint !== sourceFingerprint(documents),
    stage: row.stage, error: row.error ?? null, generatedAt: row.generatedAt?.toDate().toISOString() ?? null,
    graph, details, documents: sources,
  });
}

const serviceRequest = z.object({
  audience: z.literal("flowchart-store"), namespace: z.string(), owner: z.string(), spaceId: z.string().regex(/^[1-9]\d*$/),
  jobId: z.string().uuid(), expiresAt: z.number().int(),
  operation: z.enum(["get", "begin", "stage", "heartbeat", "fail", "save", "checkpoint", "cacheGet", "cacheSave", "metadataGet", "metadataSave", "networkSave", ...RISK_OPERATIONS]),
  data: z.record(z.string(), z.unknown()),
});

// Service-authenticated writes do not require a user session on the agent's SDK
// identity. The shared HMAC key never enters model inputs or browser code.
export const agent_flowchart_store = spacetimedb.procedure({ payload: t.string(), signature: t.string() }, t.string(), (ctx, input) => {
  const key = ctx.env.AGENT_API_KEY;
  if (!key || input.payload.length > 1000000 || !/^[a-f0-9]{64}$/.test(input.signature)) throw new SenderError("Invalid agent authorization.");
  const expected = bytesToHex(hmac(sha256, utf8ToBytes(key), utf8ToBytes(input.payload)));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ input.signature.charCodeAt(i);
  if (difference) throw new SenderError("Invalid agent authorization.");
  const request = serviceRequest.parse(JSON.parse(input.payload));
  const now = ctx.timestamp.toDate().getTime();
  if (request.expiresAt < now || request.expiresAt > now + 65000 || request.namespace !== (ctx.env.GRAPH_NAMESPACE || "hackutd2026")) throw new SenderError("Expired or invalid agent authorization.");
  return ctx.withTx(tx => {
    const spaceId = BigInt(request.spaceId);
    const space = tx.db.spaces.id.find(spaceId);
    if (!space || space.ownerUsername !== request.owner) throw new SenderError("Space not found.");
    const { operation, data, jobId } = request;
    if (operation === "get") return JSON.stringify(savedFlowchart(tx, spaceId));
    if ((RISK_OPERATIONS as readonly string[]).includes(operation)) {
      return handleRiskOperation(tx, { spaceId, owner: request.owner, jobId, operation: operation as RiskOperation, data });
    }
    const leaseUntil = new Timestamp(tx.timestamp.microsSinceUnixEpoch + 120_000_000n);
    const row = tx.db.flowcharts.spaceId.find(spaceId);
    if (operation === "begin") {
      if (space.archived) throw new SenderError("Space is archived.");
      if (row?.status === "processing" && row.leaseUntil.microsSinceUnixEpoch > tx.timestamp.microsSinceUnixEpoch) return JSON.stringify({ started: false });
      const fingerprint = z.string().regex(/^[a-f0-9]{64}$/).parse(data.fingerprint);
      const documents = Array.from(tx.db.documents.spaceId.filter(spaceId));
      if (!documents.length || documents.some(doc => !doc.verifiedAt) || sourceFingerprint(documents) !== fingerprint) throw new SenderError("Documents changed. Start generation again.");
      const value = { spaceId, ownerUsername: space.ownerUsername, status: "processing", stage: "Downloading documents", error: undefined,
        fingerprint: row?.fingerprint ?? "", requestedFingerprint: fingerprint, jobId, leaseUntil, updatedAt: tx.timestamp,
        generatedAt: row?.generatedAt, nodes: row?.nodes ?? [], edges: row?.edges ?? [], documents: row?.documents ?? [],
        // A new generation invalidates the previous network until it saves a new one.
        detailsJson: row?.detailsJson ?? "", networkJson: "",
      };
      if (row) tx.db.flowcharts.spaceId.update(value); else tx.db.flowcharts.insert(value);
      return JSON.stringify({ started: true });
    }
    if (!row || row.jobId !== jobId || row.status !== "processing") throw new SenderError("This generation job is no longer active.");
    if (operation === "metadataGet" || operation === "metadataSave") {
      const input = z.object({ documentId: z.string().regex(/^[1-9]\d*$/), checksumSha256: z.string(),
        pipelineVersion: z.string().min(1).max(100), modelId: z.string().min(1).max(200),
      }).parse(data);
      const source = tx.db.documents.id.find(BigInt(input.documentId));
      if (!source || source.spaceId !== spaceId || !source.verifiedAt || source.checksumSha256 !== input.checksumSha256) throw new SenderError("Invalid document metadata source.");
      const existing = tx.db.documentMetadata.documentId.find(source.id);
      if (operation === "metadataGet") {
        return existing && existing.checksumSha256 === source.checksumSha256 && existing.storageKey === source.storageKey
          && existing.storageVersionId === source.storageVersionId && existing.pipelineVersion === input.pipelineVersion && existing.modelId === input.modelId
          ? JSON.stringify({ documentId: String(source.id), filename: source.filename, pages: existing.pages, facts: JSON.parse(existing.factsJson) }) : "null";
      }
      const pages = z.number().int().positive().max(200).parse(data.pages);
      const facts = documentFactsSchema.parse(data.facts);
      if (citedPages(facts).some(page => page > pages)) throw new SenderError("Invalid document metadata page.");
      const factsJson = JSON.stringify(facts);
      if (factsJson.length > 500000) throw new SenderError("Document metadata is too large.");
      const value = { documentId: source.id, spaceId, filename: source.filename, checksumSha256: source.checksumSha256,
        storageBucket: source.storageBucket, storageKey: source.storageKey, storageVersionId: source.storageVersionId,
        title: facts.title, documentType: facts.documentType, summary: facts.summary, factsJson,
        pages, modelId: input.modelId, pipelineVersion: input.pipelineVersion, updatedAt: tx.timestamp };
      if (existing) tx.db.documentMetadata.documentId.update(value); else tx.db.documentMetadata.insert(value);
      return "null";
    }
    if (operation === "networkSave") {
      const network = networkSchema.parse(data);
      const ids = new Set(network.graph.nodes.map(node => node.id));
      if (network.graph.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target))) throw new SenderError("Network contains an invalid relationship.");
      if (Object.values(network.members).flat().some(id => !ids.has(id))) throw new SenderError("Network membership refers to an unknown node.");
      const networkJson = JSON.stringify(network);
      if (networkJson.length > 900000) throw new SenderError("Network is too large.");
      tx.db.flowcharts.spaceId.update({ ...row, networkJson, updatedAt: tx.timestamp, leaseUntil });
      return "null";
    }
    if (operation === "cacheGet") {
      const cacheKey = z.string().regex(/^[a-f0-9]{64}$/).parse(data.cacheKey);
      const cache = tx.db.flowchartOverviewCache.cacheKey.find(cacheKey);
      return cache && cache.spaceId === spaceId && cache.ownerUsername === request.owner ? cache.resultJson : "null";
    }
    if (operation === "cacheSave") {
      const cacheKey = z.string().regex(/^[a-f0-9]{64}$/).parse(data.cacheKey);
      const resultJson = JSON.stringify(data.result);
      if (resultJson.length > 500000) throw new SenderError("Cached overview is too large.");
      const value = { cacheKey, spaceId, ownerUsername: request.owner, resultJson, createdAt: tx.timestamp };
      if (tx.db.flowchartOverviewCache.cacheKey.find(cacheKey)) tx.db.flowchartOverviewCache.cacheKey.update(value); else tx.db.flowchartOverviewCache.insert(value);
    } else if (operation === "stage" || operation === "heartbeat") {
      const stage = operation === "stage" ? z.string().max(500).parse(data.stage) : row.stage;
      tx.db.flowcharts.spaceId.update({ ...row, stage, leaseUntil, updatedAt: tx.timestamp });
    } else if (operation === "fail") {
      tx.db.flowcharts.spaceId.update({ ...row, status: "failed", error: z.string().max(2000).parse(data.error), updatedAt: tx.timestamp });
    } else if (operation === "save" || operation === "checkpoint") {
      const graph = withoutDanglingEdges(graphSchema.parse(data.graph));
      const documents = graphResultSchema.shape.documents.parse(data.documents);
      const actual = Array.from(tx.db.documents.spaceId.filter(spaceId));
      if (documents.some(doc => !actual.some(source => String(source.id) === doc.id && source.verifiedAt))) throw new SenderError("A source document is no longer available.");
      validateGraph(graph, new Map(documents.map(doc => [doc.id, doc.pages])));
      const pages = new Map(documents.map(doc => [doc.id, doc.pages]));
      const nodeIds = new Set(graph.nodes.map(node => node.id));
      const details = Object.fromEntries(Object.entries(graphDetailsSchema.parse(data.details ?? {})).filter(([id]) => nodeIds.has(id)));
      for (const item of Object.values(details)) {
        if ([...item.findings, ...item.issues].some(source => source.page > (pages.get(source.documentId) ?? 0))) throw new SenderError("Graph details contain an invalid source reference.");
      }
      const detailsJson = JSON.stringify(details);
      if (detailsJson.length > 900000) throw new SenderError("Graph details are too large.");
      tx.db.flowcharts.spaceId.update({ ...row, nodes: graph.nodes, edges: graph.edges, documents, detailsJson,
        status: operation === "save" ? "ready" : "processing",
        stage: operation === "save" ? "" : z.string().max(500).parse(data.stage),
        error: undefined, fingerprint: row.requestedFingerprint, generatedAt: tx.timestamp, updatedAt: tx.timestamp, leaseUntil,
      });
    }
    return "null";
  });
});
