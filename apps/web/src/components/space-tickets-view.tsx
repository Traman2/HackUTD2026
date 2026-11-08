import { useState } from "react";
import { Camera, CheckCircle2, Circle, CircleSlash, FileText, LoaderCircle, MapPin, Search, ShieldAlert, Sparkles, Ticket as TicketIcon, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GraphResult } from "../../../../spacetimedb/src/validation/flowchart";
import type { Ticket } from "../../../../spacetimedb/src/validation/tickets";
import type { SpaceTickets } from "@/hooks/use-space-tickets";
import { severityStyles } from "./risk-styles";

const statusStyles: Record<Ticket["status"], { label: string; className: string }> = {
  open: { label: "Open", className: "border-ds-blue-300 bg-ds-blue-100 text-ds-blue-900" },
  in_progress: { label: "In progress", className: "border-ds-purple-300 bg-ds-purple-100 text-ds-purple-900" },
  resolved: { label: "Resolved", className: "border-ds-green-300 bg-ds-green-100 text-ds-green-900" },
  closed: { label: "Closed", className: "border-border bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", className: "border-border bg-muted text-subtle" },
};
const stepKindLabels: Record<Ticket["steps"][number]["kind"], string> = {
  observe: "Observe", measure: "Measure", verify: "Verify", photo: "Photo", record: "Record", escalate: "Escalate",
};
const StepStatusIcon = ({ status }: { status: Ticket["steps"][number]["status"] }) => {
  if (status === "done") return <CheckCircle2 aria-label="Done" className="size-4 text-ds-green-900" />;
  if (status === "failed") return <XCircle aria-label="Failed" className="size-4 text-ds-red-900" />;
  if (status === "skipped") return <CircleSlash aria-label="Skipped" className="size-4 text-subtle" />;
  return <Circle aria-label="Pending" className="size-4 text-subtle" />;
};
const isActive = (ticket: Ticket) => ticket.status === "open" || ticket.status === "in_progress";
const formatTime = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Maintenance tickets drafted by the ticket agent, worked from the mobile app and Meta glasses. */
export function SpaceTicketsView({ tickets: job, hasFlowchart, flowchartBusy, archived, documents, onPreview, onShowNode }: {
  tickets: SpaceTickets;
  hasFlowchart: boolean; flowchartBusy: boolean; archived: boolean;
  documents: GraphResult["documents"];
  onPreview: (documentId: bigint, page: number) => void;
  onShowNode: (nodeId: string) => void;
}) {
  const { result, tickets, busy, error, generate } = job;
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filenames = new Map(documents.map(doc => [doc.id, doc.filename]));
  const visible = filter === "active" ? tickets.filter(isActive) : tickets;
  const selected = visible.find(ticket => ticket.id === selectedId) ?? visible[0] ?? null;
  const counts = { active: tickets.filter(isActive).length, resolved: tickets.filter(ticket => ticket.status === "resolved" || ticket.status === "closed").length };
  const disabledReason = !hasFlowchart ? "Generate the flowchart first; tickets are created from its problems."
    : flowchartBusy ? "Wait for the flowchart to finish." : archived ? "This space is archived." : "";

  const generateButton = <Button onClick={generate} disabled={busy || !!disabledReason} title={disabledReason || "Run the ticket agent on this space's problems"} className="text-xs">
    {busy ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden="true" />}{busy ? "Generating..." : "Generate tickets"}
  </Button>;

  return (
    <div className="flex h-full flex-col bg-[#faf9f6]">
      {error && tickets.length > 0 && <p role="alert" className="shrink-0 border-b border-border bg-ds-red-100 px-4 py-2 text-xs text-ds-red-900">{error}</p>}

      {!tickets.length ? (
        <div className="login-grid-bg flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          {busy ? <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" /> : <span className="flex size-11 items-center justify-center rounded-full bg-white shadow-geist-sm"><TicketIcon aria-hidden="true" className="size-5 text-muted-foreground" /></span>}
          <h3 className="text-sm font-semibold">{busy ? "The ticket agent is drafting troubleshooting steps" : "No tickets yet"}</h3>
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">{busy ? result?.stage || "Reading the space's problems." : "The ticket agent reviews the problems found in this space's documents and drafts a ticket for each one, with safe steps to resolve it or investigate further."}</p>
          {!busy && generateButton}
          {!busy && disabledReason && <p className="text-[11px] text-ds-amber-900">{disabledReason}</p>}
          {error && <p role="alert" className="max-w-sm text-xs text-ds-red-900">{error}</p>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <section aria-label="Ticket list" className="flex w-[30%] min-w-64 max-w-sm shrink-0 flex-col border-r border-border bg-white">
            <div className="shrink-0 border-b border-border px-3 py-2.5"><div role="tablist" aria-label="Filter tickets" className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5">
              {(["active", "all"] as const).map(value => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}
                className={`cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${filter === value ? "bg-white text-foreground shadow-geist-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {value === "active" ? `Active (${counts.active})` : `All (${tickets.length})`}
              </button>)}
            </div></div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {visible.map(ticket => {
                const done = ticket.steps.filter(step => step.status !== "pending").length;
                return <li key={ticket.id}>
                  <button type="button" onClick={() => setSelectedId(ticket.id)} aria-current={selected?.id === ticket.id}
                    className={`mb-1 w-full cursor-pointer rounded-md border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${selected?.id === ticket.id ? "border-border-strong bg-[#faf9f6]" : "border-transparent hover:bg-[#faf9f6]"}`}>
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: severityStyles[ticket.priority].dot }} />{severityStyles[ticket.priority].label}
                      <span className="text-subtle">·</span>{ticket.kind === "resolve" ? "Resolve" : "Discovery"}
                      <span className={`ml-auto rounded-full border px-1.5 py-px text-[9px] font-medium ${statusStyles[ticket.status].className}`}>{statusStyles[ticket.status].label}</span>
                    </span>
                    <span className="mt-1 block text-xs font-medium leading-[18px] text-foreground">{ticket.title}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[10px] text-subtle">
                      <span className="truncate">{ticket.assetLabel}</span><span className="shrink-0">{done}/{ticket.steps.length} steps</span>
                    </span>
                  </button>
                </li>;
              })}
              {!visible.length && <li className="px-3 py-8 text-center text-xs text-subtle">No active tickets. Switch to All to see resolved ones.</li>}
            </ul>
          </section>

          <section aria-label="Ticket details" className="min-w-0 flex-1 overflow-y-auto">
            {selected ? <article className="mx-auto max-w-3xl px-6 py-5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityStyles[selected.priority].badge}`}>{severityStyles[selected.priority].label}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusStyles[selected.status].className}`}>{statusStyles[selected.status].label}</span>
                <span className="inline-flex items-center gap-1 rounded border border-border bg-white px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {selected.kind === "resolve" ? <Wrench aria-hidden="true" className="size-3" /> : <Search aria-hidden="true" className="size-3" />}{selected.kind === "resolve" ? "Resolve" : "Discovery"}
                </span>
              </div>
              <h3 className="mt-2 text-lg font-semibold leading-6 tracking-[-0.2px]">{selected.title}</h3>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MapPin aria-hidden="true" className="size-3" />{selected.assetLabel}</span>
                {selected.overviewNodeId && <button type="button" onClick={() => onShowNode(selected.overviewNodeId!)} className="cursor-pointer underline decoration-border-strong underline-offset-2 hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring">Show on flowchart</button>}
              </p>
              <p className="mt-4 text-sm leading-6 text-foreground">{selected.summary}</p>
              {selected.safetyNotes && <div className="mt-4 flex gap-2 rounded-md border border-ds-amber-300 bg-ds-amber-100 px-3 py-2.5 text-xs leading-5 text-ds-amber-900">
                <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><p><span className="font-semibold">Safety: </span>{selected.safetyNotes}</p>
              </div>}

              <h4 className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Troubleshooting steps</h4>
              <ol className="mt-2 space-y-2">
                {selected.steps.map(step => <li key={step.order} className="flex gap-3 rounded-lg border border-border bg-white p-3">
                  <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5"><StepStatusIcon status={step.status} /><span className="text-[10px] text-subtle">{step.order}</span></div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{stepKindLabels[step.kind]}
                      {step.requiresPhoto && <span className="inline-flex items-center gap-1 rounded-full bg-ds-blue-100 px-2 py-px font-sans font-medium normal-case tracking-normal text-ds-blue-900"><Camera aria-hidden="true" className="size-3" />Photo from glasses</span>}</p>
                    <p className="mt-0.5 text-sm leading-5 text-foreground">{step.instruction}</p>
                    {step.expectedResult && <p className="mt-1 text-xs leading-[18px] text-muted-foreground"><span className="font-medium">Expected: </span>{step.expectedResult}</p>}
                    {step.result && <p className="mt-1.5 rounded bg-muted px-2 py-1 text-xs text-foreground"><span className="font-medium">Result: </span>{step.result}{step.completedAt ? ` · ${formatTime(step.completedAt)}` : ""}</p>}
                  </div>
                </li>)}
              </ol>

              {selected.sources.length > 0 && <>
                <h4 className="mt-6 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Evidence</h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.sources.map(source => <button key={`${source.documentId}:${source.page}`} type="button" onClick={() => onPreview(BigInt(source.documentId), source.page)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                    <FileText aria-hidden="true" className="size-3" />{filenames.get(source.documentId) ?? "Document"} · p. {source.page}
                  </button>)}
                </div>
              </>}
              <p className="mt-6 border-t border-border pt-3 text-[11px] leading-4 text-subtle">
                Created {formatTime(selected.createdAt)} by the ticket agent{selected.draftedBy === "rules" ? " (rule-based steps; the model was unavailable)" : ""}. Steps are completed from the mobile app and Meta glasses; nothing here operates equipment.
              </p>
            </article> : <p className="px-6 py-12 text-center text-xs text-subtle">Select a ticket to see its steps.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
