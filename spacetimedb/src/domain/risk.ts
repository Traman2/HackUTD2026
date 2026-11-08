import type { GraphDetails, Network, NodeDetails, SpaceGraph } from "../validation/flowchart.ts";
import type { NodeRisk, RiskAssessment, RiskFlag, RiskReason, Severity } from "../validation/risk.ts";

// Deterministic rules own every severity and traversal decision (planning
// milestone 05). The same network, details and rules version always produce
// the same assessment; a model may only reword recommendations afterwards.
export const RISK_RULES_VERSION = "risk-rules-v1";

const RANK: Record<Severity, number> = { none: 0, elevated: 1, high: 2, critical: 3 };
const BY_RANK: Severity[] = ["none", "elevated", "high", "critical"];
const worst = (a: Severity, b: Severity) => RANK[a] >= RANK[b] ? a : b;
const atMost = (value: Severity, cap: Severity) => RANK[value] <= RANK[cap] ? value : cap;
const MAX_DEPTH = 5;

const CONDITION_SEVERITY: Record<NodeDetails["conditions"][number]["condition"], Severity> = {
  out_of_service: "critical", degraded: "high", unverified: "elevated", normal: "none", unknown: "none",
};
const CONDITION_TEXT: Record<NodeDetails["conditions"][number]["condition"], string> = {
  out_of_service: "Out of service", degraded: "Degraded", unverified: "Condition unverified", normal: "Normal", unknown: "Unknown",
};
const ISSUE_SEVERITY: Record<NodeDetails["issues"][number]["kind"], Severity> = {
  threshold_exceeded: "high", contradiction: "high", unverified_claim: "elevated", overdue: "elevated", missing_evidence: "elevated",
};

// How a problem at one end of an edge reaches the other. Service edges carry
// failure from provider to dependent; contracts are reached in reverse (an
// at-risk asset exposes the contract covering it, then the contract's parties).
type Mode = "service" | "backup" | "oversight" | "contract";
export const EDGE_RULES: Record<string, { mode: Mode; reverse: boolean }> = {
  powers: { mode: "service", reverse: false },
  cools: { mode: "service", reverse: false },
  connects: { mode: "service", reverse: false },
  controls: { mode: "service", reverse: false },
  "backs up": { mode: "backup", reverse: false },
  monitors: { mode: "oversight", reverse: false },
  protects: { mode: "oversight", reverse: false },
  covers: { mode: "contract", reverse: true },
  "party to": { mode: "contract", reverse: true },
};

export type RiskInput = {
  network: Network;
  overview: SpaceGraph;
  filenames: Record<string, string>;
};
type Graph = Network["graph"];
type Direct = Record<string, { severity: Severity; reasons: RiskReason[] }>;

const dedupe = (reasons: RiskReason[]) => [...new Map(reasons.map(reason => [`${reason.kind}:${reason.text}`, reason])).values()]
  .sort((a, b) => RANK[b.severity] - RANK[a.severity]);

// An issue is attached to every node it mentions; only its subject (the node
// named earliest in the statement) takes the severity.
function issueSubjects(graph: Graph, details: GraphDetails) {
  const terms = new Map(graph.nodes.map(node => [node.id, [node.label, ...(details[node.id]?.aliases ?? [])]
    .map(term => term.trim().toLowerCase()).filter(term => term.length >= 3)]));
  const position = (nodeId: string, text: string) => {
    const lower = text.toLowerCase();
    const found = terms.get(nodeId)!.map(term => lower.indexOf(term)).filter(index => index >= 0);
    return found.length ? Math.min(...found) : Number.POSITIVE_INFINITY;
  };
  const mentions = new Map<string, string[]>();
  for (const node of graph.nodes) for (const issue of details[node.id]?.issues ?? []) {
    const key = `${issue.documentId}:${issue.page}:${issue.statement}`;
    mentions.set(key, [...(mentions.get(key) ?? []), node.id]);
  }
  const subjects = new Map<string, string>();
  for (const [key, nodeIds] of mentions) {
    const statement = key.split(":").slice(2).join(":");
    subjects.set(key, [...nodeIds].sort((a, b) => position(a, statement) - position(b, statement) || a.localeCompare(b))[0]!);
  }
  return subjects;
}

export function assessDirect({ network, filenames }: RiskInput): Direct {
  const { graph, details } = network;
  const subjects = issueSubjects(graph, details);
  const result: Direct = {};
  for (const node of graph.nodes) {
    const info = details[node.id];
    const reasons: RiskReason[] = [];
    for (const item of info?.conditions ?? []) {
      const severity = CONDITION_SEVERITY[item.condition];
      if (severity === "none") continue;
      const evidence = node.evidence.find(source => source.documentId === item.documentId);
      reasons.push({ kind: "condition", severity, text: `${CONDITION_TEXT[item.condition]} per ${filenames[item.documentId] ?? "a source document"}`,
        ...(evidence ? { source: { documentId: evidence.documentId, page: evidence.page } } : {}) });
    }
    for (const issue of info?.issues ?? []) {
      if (subjects.get(`${issue.documentId}:${issue.page}:${issue.statement}`) !== node.id) continue;
      reasons.push({ kind: "issue", severity: ISSUE_SEVERITY[issue.kind], text: issue.statement.slice(0, 400), source: { documentId: issue.documentId, page: issue.page } });
    }
    // Worst evidence wins: a vendor "pass" or a normal reading never lowers a
    // severity established by another source.
    const unique = dedupe(reasons).slice(0, 8);
    result[node.id] = { severity: unique.reduce<Severity>((value, reason) => worst(value, reason.severity), "none"), reasons: unique };
  }
  return result;
}

type Contribution = { severity: Severity; reason: RiskReason; origin: string };

export function propagate({ network }: RiskInput, direct: Direct): Record<string, NodeRisk> {
  const { graph } = network;
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const label = (nodeId: string) => nodes.get(nodeId)?.label ?? "component";
  const edges = [...graph.edges].sort((a, b) => a.id.localeCompare(b.id));
  const healthy = (nodeId: string) => RANK[direct[nodeId]?.severity ?? "none"] < RANK.high;
  // Providers of the same service into a dependent ("CRAC-01 cools SR-01").
  const providers = (target: string, kind: string) => edges.filter(edge => edge.target === target && edge.label === kind).map(edge => edge.source);
  const steps = (nodeId: string) => edges.flatMap(edge => {
    const rule = EDGE_RULES[edge.label];
    if (!rule) return [];
    if (!rule.reverse && edge.source === nodeId) return [{ edge, rule, next: edge.target }];
    if (rule.reverse && edge.target === nodeId) return [{ edge, rule, next: edge.source }];
    return [];
  });

  const contributions = new Map<string, Contribution[]>();
  const downstream = new Map<string, Set<string>>();
  const origins = graph.nodes.filter(node => RANK[direct[node.id]?.severity ?? "none"] >= RANK.elevated).map(node => node.id).sort();
  for (const origin of origins) {
    const best = new Map<string, Severity>([[origin, direct[origin]!.severity]]);
    const queue: { nodeId: string; severity: Severity; path: string[]; stop: boolean }[] = [{ nodeId: origin, severity: direct[origin]!.severity, path: [origin], stop: false }];
    downstream.set(origin, new Set());
    while (queue.length) {
      const current = queue.shift()!;
      if (current.stop || current.path.length > MAX_DEPTH) continue;
      for (const { edge, rule, next } of steps(current.nodeId)) {
        if (current.path.includes(next)) continue;
        const from = label(current.nodeId);
        let severity: Severity;
        let kind: RiskReason["kind"];
        let text: string;
        let stop = false;
        if (rule.mode === "service") {
          const alternatives = providers(next, edge.label).filter(id => id !== current.nodeId && healthy(id));
          if (alternatives.length) {
            severity = "elevated"; kind = "redundancy";
            text = `Reduced redundancy: ${from} ${edge.label} ${label(next)}; ${alternatives.map(label).join(", ")} ${alternatives.length > 1 ? "remain" : "remains the only healthy source"}`;
          } else {
            severity = current.severity; kind = "propagated";
            text = `Depends on ${from} (${edge.label}) with no other healthy source`;
          }
        } else if (rule.mode === "backup") {
          severity = "elevated"; kind = "backup";
          text = `Backup source ${from} is at risk, so ${label(next)} has no verified backup`;
        } else if (rule.mode === "oversight") {
          severity = "elevated"; kind = "oversight"; stop = true;
          text = `${from} ${edge.label} ${label(next)} and is itself at risk`;
        } else {
          severity = atMost(current.severity, "high"); kind = "contract";
          text = edge.label === "covers" ? `Covers ${from}, which is at risk` : `Party to ${from}, which is at risk`;
        }
        if (RANK[severity] <= RANK[best.get(next) ?? "none"]) continue;
        best.set(next, severity);
        const path = [...current.path, next];
        downstream.get(origin)!.add(next);
        contributions.set(next, [...(contributions.get(next) ?? []), { severity, origin,
          reason: { kind, severity, text: `${text}. Origin: ${label(origin)}.`.slice(0, 400), path: path.slice(-8) } }]);
        queue.push({ nodeId: next, severity, path, stop });
      }
    }
  }

  const result: Record<string, NodeRisk> = {};
  for (const node of graph.nodes) {
    const own = direct[node.id] ?? { severity: "none" as Severity, reasons: [] };
    const incoming = (contributions.get(node.id) ?? []).sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.origin.localeCompare(b.origin));
    const propagated = incoming.reduce<Severity>((value, item) => worst(value, item.severity), "none");
    const severity = worst(own.severity, propagated);
    if (severity === "none") continue;
    result[node.id] = { nodeId: node.id, label: node.label.slice(0, 100), category: node.category, severity, direct: own.severity, propagated,
      reasons: [...own.reasons, ...dedupe(incoming.map(item => item.reason)).slice(0, 6)].slice(0, 12),
      downstream: [...(downstream.get(node.id) ?? [])].sort() };
  }
  return result;
}

const RECOMMENDATIONS: Record<string, (label: string) => string> = {
  out_of_service: label => `Restore ${label} and record a verified return-to-service test.`,
  degraded: label => `Inspect ${label} and confirm it can carry its design load.`,
  unverified: label => `Obtain independent evidence for ${label}: a witnessed test or calibrated measurement.`,
  contradiction: label => `Reconcile the conflicting records for ${label} before relying on it.`,
  threshold_exceeded: label => `Investigate the exceeded limit on ${label} and schedule corrective work.`,
  default: label => `Review the open evidence for ${label} and assign an owner.`,
};

export function rankFlags(input: RiskInput, risks: Record<string, NodeRisk>): RiskFlag[] {
  const { network, overview } = input;
  const overviewOf = new Map<string, string>();
  for (const node of overview.nodes) for (const member of network.members[node.id] ?? [node.id]) overviewOf.set(member, node.id);
  const nodes = new Map(network.graph.nodes.map(node => [node.id, node]));
  const isContract = (nodeId: string) => ["contract", "party"].includes(nodes.get(nodeId)?.category ?? "");
  const flags: RiskFlag[] = [];
  for (const risk of Object.values(risks)) {
    const kind = RANK[risk.direct] >= RANK[risk.propagated] ? "direct" : "propagated";
    // Propagated exposure is flagged only where people act on it: visible nodes,
    // spaces and contracts. Direct problems are always flagged.
    const visible = overviewOf.has(risk.nodeId);
    if (kind === "propagated" && !visible && !isContract(risk.nodeId) && risk.category !== "property") continue;
    const reachesContract = risk.downstream.some(isContract);
    const score = RANK[risk.severity] * 100 + (kind === "direct" ? 20 : 0) + Math.min(risk.downstream.length, 20) * 5 + (reachesContract ? 30 : 0);
    const top = risk.reasons[0]!;
    let recommendation: string;
    if (kind === "direct") {
      const condition = Object.entries(CONDITION_TEXT).find(([key, text]) => key !== "normal" && top.text.startsWith(text))?.[0];
      const issueKind = network.details[risk.nodeId]?.issues.find(issue => top.text === issue.statement.slice(0, 400))?.kind;
      recommendation = (RECOMMENDATIONS[condition ?? issueKind ?? "default"] ?? RECOMMENDATIONS.default!)(risk.label);
    } else {
      const origin = top.path?.[0];
      recommendation = `Confirm a contingency for ${risk.label} while ${origin ? nodes.get(origin)?.label ?? "the upstream component" : "the upstream component"} is unresolved.`;
    }
    const summary = kind === "direct"
      ? risk.reasons.filter(reason => reason.kind === "condition" || reason.kind === "issue").slice(0, 3).map(reason => reason.text.replace(/[.s]+$/, "")).join(". ") + "."
      : top.text;
    flags.push({ id: `f_${risk.nodeId}`.slice(0, 80), nodeId: risk.nodeId, overviewNodeId: overviewOf.get(risk.nodeId) ?? null,
      label: risk.label, severity: risk.severity as RiskFlag["severity"], kind, score,
      summary: (summary || top.text).slice(0, 600), recommendation: recommendation.slice(0, 400), rationale: "",
      affected: risk.downstream.slice(0, 40).map(nodeId => ({ nodeId, label: (nodes.get(nodeId)?.label ?? "component").slice(0, 100) })),
      sources: [...new Map(risk.reasons.flatMap(reason => reason.source ? [reason.source] : []).map(item => [`${item.documentId}:${item.page}`, item])).values()].slice(0, 12) });
  }
  return flags.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 60);
}

export function projectOverview({ network, overview }: RiskInput, risks: Record<string, NodeRisk>): RiskAssessment["overview"] {
  const projection: RiskAssessment["overview"] = {};
  for (const node of overview.nodes) {
    const members = (network.members[node.id] ?? [node.id]).map(id => risks[id]).filter((risk): risk is NodeRisk => !!risk);
    const top = members.sort((a, b) => RANK[b.severity] - RANK[a.severity] || RANK[b.direct] - RANK[a.direct])[0];
    if (!top || top.severity === "none") continue;
    projection[node.id] = { severity: top.severity as RiskFlag["severity"], kind: RANK[top.direct] >= RANK[top.propagated] ? "direct" : "propagated", nodeId: top.nodeId };
  }
  return projection;
}

export function countFlags(flags: RiskFlag[]) {
  return { critical: flags.filter(flag => flag.severity === "critical").length, high: flags.filter(flag => flag.severity === "high").length,
    elevated: flags.filter(flag => flag.severity === "elevated").length };
}

export function rulesSummary(flags: RiskFlag[]) {
  if (!flags.length) return "No risk flags were found in the current evidence.";
  const counts = countFlags(flags);
  const leading = flags.slice(0, 3).map(flag => flag.label).join(", ");
  return `${counts.critical} critical, ${counts.high} high and ${counts.elevated} elevated flags. Highest priority: ${leading}.`;
}

export { BY_RANK as SEVERITY_ORDER };
