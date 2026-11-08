import { Timestamp } from "spacetimedb";
import { SenderError, type InferSchema, type TransactionCtx } from "spacetimedb/server";
import { z } from "zod";
import spacetimedb from "../schema";
import { withoutDanglingEdges } from "../validation/flowchart";
import { riskAssessmentSchema, riskResultSchema, type RiskAssessment, type Severity } from "../validation/risk";

type Tx = TransactionCtx<InferSchema<typeof spacetimedb>>;
// Short lease: if the agent restarts mid-job, the UI reports it within ~45 s.
const LEASE_MICROS = 45_000_000n;

export function savedRisk(tx: Tx, spaceId: bigint) {
  let row = tx.db.riskAssessments.spaceId.find(spaceId);
  if (!row) return riskResultSchema.parse({ status: "empty", stale: false, stage: "", error: null, generatedAt: null, assessment: null, history: [] });
  if (row.status === "processing" && row.leaseUntil.microsSinceUnixEpoch < tx.timestamp.microsSinceUnixEpoch) {
    row = tx.db.riskAssessments.spaceId.update({ ...row, status: "failed", stage: "", error: "Risk analysis was interrupted. Please retry.", updatedAt: tx.timestamp });
  }
  const flowchart = tx.db.flowcharts.spaceId.find(spaceId);
  const parsed = row.assessmentJson ? riskAssessmentSchema.safeParse(JSON.parse(row.assessmentJson)) : null;
  const history = Array.from(tx.db.riskEvents.spaceId.filter(spaceId))
    .sort((a, b) => a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? -1 : 1).slice(0, 10)
    .map(event => ({ createdAt: event.createdAt.toDate().toISOString(), changes: JSON.parse(event.changesJson) }));
  return riskResultSchema.parse({
    status: row.status,
    // A regenerated flowchart makes the saved assessment out of date.
    stale: !!row.generatedAt && row.flowchartGeneratedAt?.microsSinceUnixEpoch !== flowchart?.generatedAt?.microsSinceUnixEpoch,
    stage: row.stage, error: row.error ?? null, generatedAt: row.generatedAt?.toDate().toISOString() ?? null,
    assessment: parsed?.success ? parsed.data : null, history,
  });
}

function changes(previous: RiskAssessment | null, next: RiskAssessment, labels: Map<string, string>) {
  const before = new Map(Object.entries(previous?.overview ?? {}).map(([id, item]) => [id, item.severity as Severity]));
  const after = new Map(Object.entries(next.overview).map(([id, item]) => [id, item.severity as Severity]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(nodeId => {
    const from = before.get(nodeId) ?? "none";
    const to = after.get(nodeId) ?? "none";
    return from === to || !labels.has(nodeId) ? [] : [{ nodeId, label: labels.get(nodeId)!.slice(0, 100), from, to }];
  });
}

export const RISK_OPERATIONS = ["riskBegin", "riskGet", "riskInputs", "riskStage", "riskHeartbeat", "riskFail", "riskSave"] as const;
export type RiskOperation = typeof RISK_OPERATIONS[number];

// Agent-authenticated risk job operations. The caller has already verified the
// HMAC request and space ownership.
export function handleRiskOperation(tx: Tx, input: { spaceId: bigint; owner: string; jobId: string; operation: RiskOperation; data: Record<string, unknown> }) {
  const { spaceId, owner, jobId, operation, data } = input;
  if (operation === "riskGet") return JSON.stringify(savedRisk(tx, spaceId));
  const leaseUntil = new Timestamp(tx.timestamp.microsSinceUnixEpoch + LEASE_MICROS);
  const row = tx.db.riskAssessments.spaceId.find(spaceId);
  const flowchart = tx.db.flowcharts.spaceId.find(spaceId);
  if (operation === "riskBegin") {
    if (!flowchart?.generatedAt || !flowchart.nodes.length) throw new SenderError("Generate the flowchart before analyzing risk.");
    if (flowchart.status === "processing") throw new SenderError("Wait for flowchart generation to finish before analyzing risk.");
    if (!flowchart.networkJson) throw new SenderError("Generate the flowchart again to enable risk analysis.");
    if (row?.status === "processing" && row.leaseUntil.microsSinceUnixEpoch > tx.timestamp.microsSinceUnixEpoch) return JSON.stringify({ started: false });
    const value = { spaceId, ownerUsername: owner, status: "processing", stage: "Starting risk analysis", error: undefined, jobId, leaseUntil,
      flowchartGeneratedAt: row?.flowchartGeneratedAt, assessmentJson: row?.assessmentJson ?? "", generatedAt: row?.generatedAt, updatedAt: tx.timestamp };
    if (row) tx.db.riskAssessments.spaceId.update(value); else tx.db.riskAssessments.insert(value);
    return JSON.stringify({ started: true });
  }
  if (!row || row.jobId !== jobId || row.status !== "processing") throw new SenderError("This risk analysis job is no longer active.");
  if (operation === "riskInputs") {
    if (!flowchart?.generatedAt || !flowchart.networkJson) throw new SenderError("Generate the flowchart again to enable risk analysis.");
    return JSON.stringify({ overview: withoutDanglingEdges({ nodes: flowchart.nodes, edges: flowchart.edges }),
      network: JSON.parse(flowchart.networkJson), documents: flowchart.documents, flowchartGeneratedAt: flowchart.generatedAt.toDate().toISOString() });
  }
  if (operation === "riskStage" || operation === "riskHeartbeat") {
    const stage = operation === "riskStage" ? z.string().max(500).parse(data.stage) : row.stage;
    tx.db.riskAssessments.spaceId.update({ ...row, stage, leaseUntil, updatedAt: tx.timestamp });
  } else if (operation === "riskFail") {
    tx.db.riskAssessments.spaceId.update({ ...row, status: "failed", stage: "", error: z.string().max(2000).parse(data.error), updatedAt: tx.timestamp });
  } else if (operation === "riskSave") {
    if (!flowchart?.generatedAt) throw new SenderError("The flowchart is no longer available.");
    const assessment = riskAssessmentSchema.parse(data.assessment);
    const overviewIds = new Set(flowchart.nodes.map(node => node.id));
    if (Object.keys(assessment.overview).some(id => !overviewIds.has(id)) || assessment.flags.some(flag => flag.overviewNodeId && !overviewIds.has(flag.overviewNodeId))) {
      throw new SenderError("The flowchart changed during risk analysis. Run it again.");
    }
    const assessmentJson = JSON.stringify(assessment);
    if (assessmentJson.length > 900000) throw new SenderError("Risk assessment is too large.");
    const previous = row.assessmentJson ? riskAssessmentSchema.safeParse(JSON.parse(row.assessmentJson)) : null;
    const diff = changes(previous?.success ? previous.data : null, assessment, new Map(flowchart.nodes.map(node => [node.id, node.label])));
    if (diff.length) tx.db.riskEvents.insert({ id: 0n, spaceId, jobId, changesJson: JSON.stringify(diff.slice(0, 200)), createdAt: tx.timestamp });
    tx.db.riskAssessments.spaceId.update({ ...row, status: "ready", stage: "", error: undefined, assessmentJson,
      flowchartGeneratedAt: flowchart.generatedAt, generatedAt: tx.timestamp, updatedAt: tx.timestamp, leaseUntil });
  }
  return "null";
}
