import { ArrowRight, FileText, LoaderCircle, RefreshCw, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GraphResult } from "../../../../spacetimedb/src/validation/flowchart";
import type { RiskFlag } from "../../../../spacetimedb/src/validation/risk";
import type { SpaceRisk } from "@/hooks/use-space-risk";
import { severityStyles } from "./risk-styles";

const formatTime = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Ranked risk flags from the latest risk-agent run, with next steps and history. */
export function RiskPanel({ risk, documents, onPreview, onSelectNode, onClose }: {
  risk: SpaceRisk;
  documents: GraphResult["documents"];
  onPreview: (documentId: bigint, page: number) => void;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}) {
  const { result, assessment, busy, error, analyze } = risk;
  const filenames = new Map(documents.map(doc => [doc.id, doc.filename]));

  const Flag = ({ flag }: { flag: RiskFlag }) => (
    <li className="rounded-md border border-[#ecebe6] bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${severityStyles[flag.severity].badge}`}>{severityStyles[flag.severity].label}</span>
        <span className="text-[10px] text-[#939188]">{flag.kind === "direct" ? "Own evidence" : "Via upstream dependency"}</span>
      </div>
      {flag.overviewNodeId
        ? <button type="button" onClick={() => onSelectNode(flag.overviewNodeId!)} className="mt-1.5 block cursor-pointer text-left text-sm font-semibold leading-5 underline decoration-[#d5d3cc] underline-offset-2 hover:decoration-[#37352f] focus-visible:outline-2 focus-visible:outline-[#b9d8f3]">{flag.label}</button>
        : <p className="mt-1.5 text-sm font-semibold leading-5" title="Not shown in the overview graph">{flag.label}</p>}
      <p className="mt-1 text-xs leading-[18px] text-[#5f5d56]">{flag.summary}</p>
      <div className="mt-2.5 rounded bg-[#f7f6f2] px-2.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3px] text-[#78766e]">Recommended next step</p>
        <p className="mt-0.5 text-xs leading-[18px] text-[#37352f]">{flag.recommendation}</p>
        {flag.rationale && <p className="mt-1 text-[11px] leading-4 text-[#78766e]">{flag.rationale}</p>}
      </div>
      {flag.affected.length > 0 && <div className="mt-2.5">
        <p className="text-[10px] text-[#939188]">Puts {flag.affected.length} downstream component{flag.affected.length === 1 ? "" : "s"} at risk</p>
        <ul className="mt-1 flex flex-wrap gap-1">
          {flag.affected.slice(0, 10).map(item => <li key={item.nodeId} className="inline-flex items-center gap-1 rounded border border-[#e3e3e7] bg-[#faf9f6] px-1.5 py-0.5 text-[10px] text-[#5f5d56]"><ArrowRight aria-hidden="true" className="size-2.5" />{item.label}</li>)}
          {flag.affected.length > 10 && <li className="px-1 py-0.5 text-[10px] text-[#939188]">+{flag.affected.length - 10} more</li>}
        </ul>
      </div>}
      {flag.sources.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1">
        {flag.sources.map(source => <button key={`${source.documentId}:${source.page}`} type="button" onClick={() => onPreview(BigInt(source.documentId), source.page)}
          className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded bg-[#f3f2ee] px-1.5 py-0.5 text-[10px] text-[#78766e] hover:bg-[#e9e7e1] hover:text-[#37352f] focus-visible:outline-2 focus-visible:outline-[#b9d8f3]">
          <FileText aria-hidden="true" className="size-2.5 shrink-0" /><span className="truncate">{filenames.get(source.documentId) ?? "Document"} · p. {source.page}</span>
        </button>)}
      </div>}
    </li>
  );

  return <>
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e3e3e7] px-4 py-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><ShieldAlert aria-hidden="true" className="size-4 text-[#b4372c]" />Risk flags</h2>
        {result?.generatedAt && <p className="mt-0.5 text-[11px] text-[#939188]">Analyzed {formatTime(result.generatedAt)}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="xs" onClick={analyze} disabled={busy}>
          {busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" />}{busy ? "Running" : "Re-run"}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Close risk flags" onClick={onClose}><X aria-hidden="true" /></Button>
      </div>
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto">
      {busy && <p role="status" className="flex items-center gap-2 border-b border-[#efeeea] bg-[#faf9f6] px-4 py-2 text-xs text-[#78766e]"><LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />{result?.stage || "Starting risk analysis"}</p>}
      {error && <p role="alert" className="border-b border-[#efeeea] bg-[#fdf1f0] px-4 py-2 text-xs text-[#b4372c]">{error}</p>}
      {result?.stale && <p className="border-b border-[#efeeea] bg-[#fdf9ea] px-4 py-2 text-xs text-[#8a6a10]">The flowchart changed after this analysis. Re-run it to update the flags.</p>}

      {!assessment ? <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-[#939188]">
        <ShieldAlert aria-hidden="true" className="size-7" />
        <p className="text-xs">{busy ? "The risk agent is analyzing the flowchart." : "Run the risk agent to flag problem components and what depends on them."}</p>
      </div> : <>
        <section className="border-b border-[#efeeea] px-4 py-4">
          <div className="flex flex-wrap gap-1.5">
            {(["critical", "high", "elevated"] as const).map(level => <span key={level} className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${severityStyles[level].badge}`}>{assessment.counts[level]} {severityStyles[level].label.toLowerCase()}</span>)}
          </div>
          <p className="mt-2.5 text-xs leading-5 text-[#37352f]">{assessment.summary}</p>
          <p className="mt-2 text-[10px] leading-4 text-[#a3a198]">Severities and dependency paths come from deterministic rules ({assessment.rulesVersion}). {assessment.recommendationsBy === "model" ? `Recommendation wording by ${assessment.modelId}.` : "Recommendations are rule-based."} Suggestions only; no equipment actions are taken.</p>
        </section>

        <section className="px-4 py-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#78766e]">Prioritized flags<span className="ml-1.5 font-normal text-[#a3a198]">{assessment.flags.length}</span></h3>
          {assessment.flags.length
            ? <ul className="mt-2.5 space-y-2.5">{assessment.flags.map(flag => <Flag key={flag.id} flag={flag} />)}</ul>
            : <p className="mt-2 text-xs text-[#78766e]">No component has evidence of a problem.</p>}
        </section>

        {result && result.history.length > 0 && <section className="border-t border-[#efeeea] px-4 py-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[#78766e]">Change history</h3>
          <ol className="mt-2.5 space-y-3">
            {result.history.map(entry => <li key={entry.createdAt}>
              <p className="text-[11px] font-medium text-[#5f5d56]">{formatTime(entry.createdAt)}</p>
              <ul className="mt-1 space-y-0.5">
                {entry.changes.slice(0, 12).map(change => <li key={change.nodeId} className="text-[11px] text-[#78766e]">
                  {change.label}: <span className="capitalize">{change.from}</span> → <span className="font-medium capitalize text-[#37352f]">{change.to}</span>
                </li>)}
                {entry.changes.length > 12 && <li className="text-[11px] text-[#a3a198]">+{entry.changes.length - 12} more</li>}
              </ul>
            </li>)}
          </ol>
        </section>}
      </>}
    </div>
  </>;
}
