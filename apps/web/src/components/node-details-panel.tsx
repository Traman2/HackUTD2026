import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, FileText, Quote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GraphResult, NodeDetails, SpaceGraph } from "../../../../spacetimedb/src/validation/flowchart";
import { categories } from "./flowchart-categories";
import type { RiskAssessment } from "../../../../spacetimedb/src/validation/risk";
import { reasonLabels, severityStyles } from "./risk-styles";

type Condition = NodeDetails["conditions"][number]["condition"];
type FindingKind = NodeDetails["findings"][number]["kind"];
type IssueKind = NodeDetails["issues"][number]["kind"];
type Edge = SpaceGraph["edges"][number];

const conditionStyles: Record<Condition, { label: string; className: string }> = {
  out_of_service: { label: "Out of service", className: "border-ds-red-300 bg-ds-red-100 text-ds-red-900" },
  degraded: { label: "Degraded", className: "border-ds-amber-300 bg-ds-amber-100 text-ds-amber-900" },
  unverified: { label: "Unverified", className: "border-ds-purple-300 bg-ds-purple-100 text-ds-purple-900" },
  normal: { label: "Normal", className: "border-ds-green-300 bg-ds-green-100 text-ds-green-900" },
  unknown: { label: "Unknown", className: "border-border bg-muted text-muted-foreground" },
};
const conditionSeverity: Condition[] = ["out_of_service", "degraded", "unverified", "normal", "unknown"];

const findingGroups: { kind: FindingKind; label: string }[] = [
  { kind: "measured", label: "Measured" },
  { kind: "vendor_claim", label: "Vendor claims" },
  { kind: "recorded_status", label: "Recorded status" },
  { kind: "obligation", label: "Contract obligations" },
  { kind: "historical", label: "Historical" },
];

const issueStyles: Record<IssueKind, { label: string; className: string }> = {
  contradiction: { label: "Contradiction", className: "text-ds-red-900" },
  threshold_exceeded: { label: "Threshold exceeded", className: "text-ds-red-900" },
  unverified_claim: { label: "Unverified claim", className: "text-ds-amber-900" },
  overdue: { label: "Overdue", className: "text-ds-amber-900" },
  missing_evidence: { label: "Missing evidence", className: "text-muted-foreground" },
};

function Section({ title, count, caption, children }: { title: string; count?: number; caption?: string; children: ReactNode }) {
  return <section className="border-b border-border px-4 py-4 last:border-b-0">
    <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{title}{count !== undefined && <span className="ml-1.5 font-normal text-subtle">{count}</span>}</h3>
    {caption && <p className="mt-1 text-[11px] leading-4 text-subtle">{caption}</p>}
    <div className="mt-2.5">{children}</div>
  </section>;
}

export function NodeDetailsPanel({ nodeId, graph, details, documents, onPreview, onSelectNode, onClose, risk = null }: {
  nodeId: string;
  graph: SpaceGraph;
  details: GraphResult["details"];
  documents: GraphResult["documents"];
  onPreview: (documentId: bigint, page: number) => void;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
  /** The latest current (not stale) risk assessment, if the risk agent has run. */
  risk?: RiskAssessment | null;
}) {
  const node = graph.nodes.find(item => item.id === nodeId);
  if (!node) return null;
  const info: NodeDetails = details[node.id] ?? { aliases: [], conditions: [], findings: [], issues: [] };
  const hasDetails = !!details[node.id];
  const riskEntry = risk?.overview[node.id];
  const nodeRisk = riskEntry ? risk!.nodes[riskEntry.nodeId] : undefined;
  const riskFlag = risk?.flags.find(flag => flag.overviewNodeId === node.id);
  const riskLabel = (id: string) => risk?.nodes[id]?.label ?? graph.nodes.find(item => item.id === id)?.label ?? "component";
  const documentsById = new Map(documents.map(doc => [doc.id, doc]));
  const filename = (documentId: string) => documentsById.get(documentId)?.filename ?? "Document";
  const nodesById = new Map(graph.nodes.map(item => [item.id, item]));
  const { icon: Icon, color } = categories[node.category];

  const Source = ({ documentId, page }: { documentId: string; page: number }) => (
    <button type="button" onClick={() => onPreview(BigInt(documentId), page)} title={`Open ${filename(documentId)} at page ${page}`}
      className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <FileText aria-hidden="true" className="size-2.5 shrink-0" /><span className="truncate">{filename(documentId)} · p. {page}</span>
    </button>
  );

  const headline = conditionSeverity.find(condition => info.conditions.some(item => item.condition === condition));
  const incoming = graph.edges.filter(edge => edge.target === node.id);
  const outgoing = graph.edges.filter(edge => edge.source === node.id);
  const Relationship = ({ edge, otherId, direction }: { edge: Edge; otherId: string; direction: "in" | "out" }) => {
    const other = nodesById.get(otherId);
    if (!other) return null;
    const OtherIcon = categories[other.category].icon;
    const otherButton = <button type="button" onClick={() => onSelectNode(other.id)} title={`Show ${other.label}`}
      className="inline-flex min-w-0 cursor-pointer items-center gap-1 rounded font-medium text-foreground underline decoration-border-strong underline-offset-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <OtherIcon aria-hidden="true" className="size-3 shrink-0" style={{ color: categories[other.category].color }} /><span className="truncate">{other.label}</span>
    </button>;
    const label = <span className="inline-flex shrink-0 items-center gap-1 rounded bg-ds-green-100 px-1.5 py-0.5 text-[10px] font-medium text-ds-green-900">{edge.label}<ArrowRight aria-hidden="true" className="size-2.5" /></span>;
    return <li className="rounded-lg border border-border bg-white p-2.5">
      <p className="flex flex-wrap items-center gap-1.5 text-xs">
        {direction === "in" ? <>{otherButton}{label}<span className="text-muted-foreground">this</span></> : <><span className="text-muted-foreground">This</span>{label}{otherButton}</>}
      </p>
      <ul className="mt-2 space-y-1.5">
        {edge.evidence.map(item => <li key={`${item.documentId}:${item.page}:${item.detail}`} className="text-[11px] leading-4 text-muted-foreground">
          <span className="italic">“{item.detail}”</span> <Source documentId={item.documentId} page={item.page} />
        </li>)}
      </ul>
    </li>;
  };

  // Every document that says anything about this node, with the pages it is cited on.
  const citedPages = new Map<string, Set<number>>();
  for (const item of [...node.evidence, ...info.findings, ...info.issues]) {
    if (!citedPages.has(item.documentId)) citedPages.set(item.documentId, new Set());
    citedPages.get(item.documentId)!.add(item.page);
  }
  for (const item of info.conditions) if (!citedPages.has(item.documentId)) citedPages.set(item.documentId, new Set());

  const riskSection = riskEntry && nodeRisk && <Section title="Risk" caption={riskEntry.kind === "direct" ? "From this component's own evidence." : "From an upstream component it depends on."}>
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityStyles[riskEntry.severity].badge}`}>{severityStyles[riskEntry.severity].label}</span>
    {riskFlag && <div className="mt-2.5 rounded bg-muted px-2.5 py-2">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Recommended next step</p>
      <p className="mt-0.5 text-xs leading-[18px] text-foreground">{riskFlag.recommendation}</p>
      {riskFlag.rationale && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{riskFlag.rationale}</p>}
    </div>}
    <ul className="mt-2.5 space-y-2">
      {nodeRisk.reasons.map(reason => <li key={`${reason.kind}:${reason.text}`} className="text-xs leading-[18px]">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{reasonLabels[reason.kind] ?? reason.kind} · <span className="normal-case">{severityStyles[reason.severity as keyof typeof severityStyles]?.label ?? reason.severity}</span></p>
        <p className="text-foreground">{reason.text}</p>
        {reason.path && <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">{reason.path.map((id, index) => <span key={`${id}:${index}`} className="inline-flex items-center gap-1">{index > 0 && <ArrowRight aria-hidden="true" className="size-2.5" />}{riskLabel(id)}</span>)}</p>}
        {reason.source && <div className="mt-1"><Source documentId={reason.source.documentId} page={reason.source.page} /></div>}
      </li>)}
    </ul>
    {nodeRisk.downstream.length > 0 && <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">Its problems put {nodeRisk.downstream.length} downstream component{nodeRisk.downstream.length === 1 ? "" : "s"} at risk: {nodeRisk.downstream.slice(0, 8).map(riskLabel).join(", ")}{nodeRisk.downstream.length > 8 ? "…" : ""}.</p>}
  </Section>;

  return <>
    <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] capitalize text-muted-foreground"><Icon aria-hidden="true" className="size-3.5" style={{ color }} />{node.category}</p>
        <h2 className="mt-1 text-sm font-semibold leading-5 [overflow-wrap:anywhere]">{node.label}</h2>
        {headline && <span className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${conditionStyles[headline].className}`}>{conditionStyles[headline].label}</span>}
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Close component details" onClick={onClose}><X aria-hidden="true" /></Button>
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto">
      {riskSection}
      <Section title="Overview">
        <p className="text-xs leading-5 text-foreground">{node.description}</p>
        {!hasDetails && <p className="mt-2 rounded bg-muted px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">Generate the flowchart again to see findings, conditions and review issues for this component.</p>}
      </Section>

      {info.conditions.length > 0 && <Section title="Condition by source" caption="What each document supports about the current state. Sources can disagree.">
        <ul className="space-y-1.5">
          {info.conditions.map(item => <li key={`${item.condition}:${item.documentId}`} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-muted-foreground" title={filename(item.documentId)}>{filename(item.documentId)}</span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${conditionStyles[item.condition].className}`}>{conditionStyles[item.condition].label}</span>
          </li>)}
        </ul>
      </Section>}

      {info.aliases.length > 0 && <Section title="Also referred to as" count={info.aliases.length}>
        <ul className="flex flex-wrap gap-1.5">
          {info.aliases.map(alias => <li key={alias} className="rounded border border-border bg-[#faf9f6] px-1.5 py-0.5 text-[11px] text-muted-foreground">{alias}</li>)}
        </ul>
      </Section>}

      {info.issues.length > 0 && <Section title="Review issues" count={info.issues.length} caption="Problems in the source records that mention this component.">
        <ul className="space-y-2">
          {info.issues.map(issue => <li key={`${issue.documentId}:${issue.page}:${issue.statement}`} className="rounded-lg border border-border bg-white p-2.5">
            <p className={`flex items-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] ${issueStyles[issue.kind].className}`}><AlertTriangle aria-hidden="true" className="size-3" />{issueStyles[issue.kind].label}</p>
            <p className="mt-1 text-xs leading-[18px] text-foreground">{issue.statement}</p>
            <div className="mt-1.5"><Source documentId={issue.documentId} page={issue.page} /></div>
          </li>)}
        </ul>
      </Section>}

      {findingGroups.map(group => {
        const findings = info.findings.filter(item => item.kind === group.kind);
        if (!findings.length) return null;
        return <Section key={group.kind} title={group.label} count={findings.length}>
          <ul className="space-y-2">
            {findings.map(item => <li key={`${item.documentId}:${item.page}:${item.statement}`} className="text-xs leading-[18px] text-foreground">
              {item.statement} <Source documentId={item.documentId} page={item.page} />
            </li>)}
          </ul>
        </Section>;
      })}

      <Section title="Upstream" count={incoming.length} caption="Components and contracts with arrows into this one.">
        {incoming.length ? <ul className="space-y-2">{incoming.map(edge => <Relationship key={edge.id} edge={edge} otherId={edge.source} direction="in" />)}</ul>
          : <p className="text-[11px] text-subtle">None in this overview.</p>}
      </Section>
      <Section title="Downstream" count={outgoing.length} caption="What this component supplies, contains, covers or operates.">
        {outgoing.length ? <ul className="space-y-2">{outgoing.map(edge => <Relationship key={edge.id} edge={edge} otherId={edge.target} direction="out" />)}</ul>
          : <p className="text-[11px] text-subtle">None in this overview.</p>}
      </Section>

      <Section title="Evidence" count={node.evidence.length} caption="Source passages that identify this component.">
        <ul className="space-y-2.5">
          {node.evidence.map(item => <li key={`${item.documentId}:${item.page}:${item.detail}`} className="flex gap-2">
            <Quote aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-subtle" />
            <div className="min-w-0"><p className="text-xs italic leading-[18px] text-muted-foreground">{item.detail}</p><div className="mt-1"><Source documentId={item.documentId} page={item.page} /></div></div>
          </li>)}
        </ul>
      </Section>

      <Section title="Source documents" count={citedPages.size}>
        <ul className="space-y-2">
          {[...citedPages].map(([documentId, pages]) => {
            const doc = documentsById.get(documentId);
            const sorted = [...pages].sort((a, b) => a - b);
            return <li key={documentId} className="rounded-lg border border-border bg-white p-2.5">
              <button type="button" onClick={() => onPreview(BigInt(documentId), sorted[0] ?? 1)} className="flex w-full cursor-pointer items-start gap-2 text-left focus-visible:outline-2 focus-visible:outline-ring">
                <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-subtle" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium hover:underline">{doc?.filename ?? "Document"}</span>
                  {(doc?.title || doc?.documentType) && <span className="mt-0.5 block text-[10px] text-subtle">{[doc.documentType?.replaceAll("_", " "), doc.title].filter(Boolean).join(" · ")}{doc?.pages ? ` · ${doc.pages} pages` : ""}</span>}
                </span>
              </button>
              {doc?.summary && <details className="mt-2 text-[11px] leading-4 text-muted-foreground"><summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Document summary</summary><p className="mt-1">{doc.summary}</p></details>}
              {sorted.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1"><span className="mr-0.5 text-[10px] text-subtle">Cited on</span>
                {sorted.map(page => <button key={page} type="button" onClick={() => onPreview(BigInt(documentId), page)} className="cursor-pointer rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">p. {page}</button>)}
              </div>}
            </li>;
          })}
        </ul>
      </Section>
    </div>
  </>;
}
