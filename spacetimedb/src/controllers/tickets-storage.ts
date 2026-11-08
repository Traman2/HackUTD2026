import { Timestamp } from "spacetimedb";
import {
  SenderError,
  type InferSchema,
  type TransactionCtx,
} from "spacetimedb/server";
import { z } from "zod";
import spacetimedb from "../schema";
import { withoutDanglingEdges } from "../validation/flowchart";
import { riskAssessmentSchema } from "../validation/risk";
import { ticketInputSchema, ticketsResultSchema } from "../validation/tickets";

type Tx = TransactionCtx<InferSchema<typeof spacetimedb>>;
const LEASE_MICROS = 120_000_000n;
const ACTIVE = new Set(["open", "in_progress"]);

export function savedTickets(tx: Tx, spaceId: bigint) {
  let job = tx.db.ticketJobs.spaceId.find(spaceId);
  if (
    job?.status === "processing" &&
    job.leaseUntil.microsSinceUnixEpoch < tx.timestamp.microsSinceUnixEpoch
  ) {
    job = tx.db.ticketJobs.spaceId.update({
      ...job,
      status: "failed",
      stage: "",
      error: "Ticket generation was interrupted. Please retry.",
      updatedAt: tx.timestamp,
    });
  }
  const rows = Array.from(tx.db.tickets.spaceId.filter(spaceId)).sort((a, b) =>
    a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch
      ? -1
      : a.id > b.id
        ? -1
        : 1,
  );
  return ticketsResultSchema.parse({
    status: job ? job.status : rows.length ? "ready" : "empty",
    stage: job?.stage ?? "",
    error: job?.error ?? null,
    generatedAt: job?.generatedAt?.toDate().toISOString() ?? null,
    lastCreated: job?.lastCreated ?? 0,
    tickets: rows.map((row) => ({
      id: String(row.id),
      problemKey: row.problemKey,
      title: row.title,
      kind: row.kind,
      priority: row.priority,
      status: row.status,
      assetLabel: row.assetLabel,
      equipmentCode: row.equipmentCode,
      overviewNodeId: row.overviewNodeId ?? null,
      networkNodeId: row.networkNodeId,
      summary: row.summary,
      safetyNotes: row.safetyNotes,
      sources: row.sources,
      draftedBy: row.draftedBy,
      createdAt: row.createdAt.toDate().toISOString(),
      updatedAt: row.updatedAt.toDate().toISOString(),
      steps: row.steps.map((step) => ({
        ...step,
        result: step.result ?? null,
        completedAt: step.completedAt?.toDate().toISOString() ?? null,
      })),
    })),
  });
}

export const TICKET_OPERATIONS = [
  "ticketsBegin",
  "ticketsGet",
  "ticketsInputs",
  "ticketsStage",
  "ticketsHeartbeat",
  "ticketsFail",
  "ticketsSave",
] as const;
export type TicketOperation = (typeof TICKET_OPERATIONS)[number];

// Agent-authenticated ticket job operations. The caller has already verified the
// HMAC request and space ownership.
export function handleTicketOperation(
  tx: Tx,
  input: {
    spaceId: bigint;
    owner: string;
    jobId: string;
    operation: TicketOperation;
    data: Record<string, unknown>;
  },
) {
  const { spaceId, owner, jobId, operation, data } = input;
  if (operation === "ticketsGet")
    return JSON.stringify(savedTickets(tx, spaceId));
  const leaseUntil = new Timestamp(
    tx.timestamp.microsSinceUnixEpoch + LEASE_MICROS,
  );
  const job = tx.db.ticketJobs.spaceId.find(spaceId);
  const flowchart = tx.db.flowcharts.spaceId.find(spaceId);
  if (operation === "ticketsBegin") {
    if (!flowchart?.generatedAt || !flowchart.nodes.length)
      throw new SenderError("Generate the flowchart before creating tickets.");
    if (flowchart.status === "processing")
      throw new SenderError(
        "Wait for flowchart generation to finish before creating tickets.",
      );
    if (!flowchart.networkJson)
      throw new SenderError(
        "Generate the flowchart again to enable ticket creation.",
      );
    if (
      job?.status === "processing" &&
      job.leaseUntil.microsSinceUnixEpoch > tx.timestamp.microsSinceUnixEpoch
    )
      return JSON.stringify({ started: false });
    const value = {
      spaceId,
      ownerUsername: owner,
      status: "processing",
      stage: "Starting ticket agent",
      error: undefined,
      jobId,
      leaseUntil,
      lastCreated: job?.lastCreated ?? 0,
      generatedAt: job?.generatedAt,
      updatedAt: tx.timestamp,
    };
    if (job) tx.db.ticketJobs.spaceId.update(value);
    else tx.db.ticketJobs.insert(value);
    return JSON.stringify({ started: true });
  }
  if (!job || job.jobId !== jobId || job.status !== "processing")
    throw new SenderError("This ticket job is no longer active.");
  if (operation === "ticketsInputs") {
    if (!flowchart?.generatedAt || !flowchart.networkJson)
      throw new SenderError(
        "Generate the flowchart again to enable ticket creation.",
      );
    // Reuse the risk agent's wording when its assessment matches this flowchart.
    const risk = tx.db.riskAssessments.spaceId.find(spaceId);
    const current =
      risk?.assessmentJson &&
      risk.flowchartGeneratedAt?.microsSinceUnixEpoch ===
        flowchart.generatedAt.microsSinceUnixEpoch
        ? riskAssessmentSchema.safeParse(JSON.parse(risk.assessmentJson))
        : null;
    const active = Array.from(tx.db.tickets.spaceId.filter(spaceId)).filter(
      (ticket) => ACTIVE.has(ticket.status),
    );
    return JSON.stringify({
      overview: withoutDanglingEdges({
        nodes: flowchart.nodes,
        edges: flowchart.edges,
      }),
      network: JSON.parse(flowchart.networkJson),
      details: flowchart.detailsJson ? JSON.parse(flowchart.detailsJson) : {},
      documents: flowchart.documents,
      risk: current?.success ? current.data : null,
      activeProblemKeys: active.map((ticket) => ticket.problemKey),
    });
  }
  if (operation === "ticketsStage" || operation === "ticketsHeartbeat") {
    const stage =
      operation === "ticketsStage"
        ? z.string().max(500).parse(data.stage)
        : job.stage;
    tx.db.ticketJobs.spaceId.update({
      ...job,
      stage,
      leaseUntil,
      updatedAt: tx.timestamp,
    });
  } else if (operation === "ticketsFail") {
    tx.db.ticketJobs.spaceId.update({
      ...job,
      status: "failed",
      stage: "",
      error: z.string().max(2000).parse(data.error),
      updatedAt: tx.timestamp,
    });
  } else if (operation === "ticketsSave") {
    const drafts = z.array(ticketInputSchema).max(30).parse(data.tickets);
    const pages = new Map(
      (flowchart?.documents ?? []).map((doc) => [doc.id, doc.pages]),
    );
    if (
      drafts.some((draft) =>
        draft.sources.some(
          (source) => source.page > (pages.get(source.documentId) ?? 0),
        ),
      )
    )
      throw new SenderError("A ticket cites an invalid source page.");
    // Never duplicate a ticket someone may already be working on.
    const active = new Set(
      Array.from(tx.db.tickets.spaceId.filter(spaceId))
        .filter((ticket) => ACTIVE.has(ticket.status))
        .map((ticket) => ticket.problemKey),
    );
    let created = 0;
    for (const draft of drafts) {
      if (active.has(draft.problemKey)) continue;
      active.add(draft.problemKey);
      tx.db.tickets.insert({
        id: 0n,
        spaceId,
        ownerUsername: owner,
        problemKey: draft.problemKey,
        title: draft.title,
        kind: draft.kind,
        priority: draft.priority,
        status: "open",
        assetLabel: draft.assetLabel,
        equipmentCode: draft.equipmentCode,
        overviewNodeId: draft.overviewNodeId ?? undefined,
        networkNodeId: draft.networkNodeId,
        summary: draft.summary,
        safetyNotes: draft.safetyNotes,
        steps: draft.steps.map((step, index) => ({
          ...step,
          order: index + 1,
          status: "pending",
          result: undefined,
          completedAt: undefined,
        })),
        sources: draft.sources,
        draftedBy: draft.draftedBy,
        jobId,
        createdAt: tx.timestamp,
        updatedAt: tx.timestamp,
      });
      created++;
    }
    tx.db.ticketJobs.spaceId.update({
      ...job,
      status: "ready",
      stage: "",
      error: undefined,
      lastCreated: created,
      generatedAt: tx.timestamp,
      updatedAt: tx.timestamp,
      leaseUntil,
    });
  }
  return "null";
}
