import { useCallback, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { DocumentPreviewDialog } from "@/components/document-preview-dialog";
import { NodeDetailsPanel } from "@/components/node-details-panel";
import { RiskPanel } from "@/components/risk-panel";
import { ResizeHandle } from "@/components/resize-handle";
import { SpaceFilesList } from "@/components/space-files-list";
import { SpaceFlowchartView } from "@/components/space-flowchart-view";
import { SpaceInsightsView } from "@/components/space-insights-view";
import { SpaceTicketsView } from "@/components/space-tickets-view";
import { SpaceSidebar, type SpaceView } from "@/components/space-sidebar";
import { tables } from "@/module_bindings";
import { useElementWidth, useResizableWidth } from "@/hooks/use-resizable-width";
import { useSpaceFlowchart } from "@/hooks/use-space-flowchart";
import { useSpaceRisk } from "@/hooks/use-space-risk";
import { useSpaceTickets } from "@/hooks/use-space-tickets";

export default function SpaceDetails() {
  const { spaceId } = useParams();
  const { isActive, connectionError } = useSpacetimeDB();
  const [profiles, profileReady] = useTable(tables.myProfile);
  const profile = isActive && profileReady ? profiles[0] : undefined;
  const [spaces, spacesReady] = useTable(tables.mySpaces, { enabled: !!profile });
  const ready = isActive && !!profile && spacesReady;
  const id = spaceId && /^[1-9]\d{0,19}$/.test(spaceId) ? BigInt(spaceId) : null;
  // Resolve through the owner-filtered view, never an unscoped space lookup.
  const space = ready ? spaces.find(row => row.id === id) : undefined;

  const [view, setView] = useState<SpaceView>("flowchart");
  const [filesOpen, setFilesOpen] = useState(false);
  // The selected node stays set while its panel slides closed.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeOpen, setNodeOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [previewId, setPreviewId] = useState<bigint | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const openGraphSource = useCallback((documentId: bigint, page: number) => { setPreviewPage(page); setPreviewId(documentId); }, []);
  const filesButton = useRef<HTMLButtonElement>(null);

  // Both right-hand panels share one width so switching between them is stable.
  const [workspace, workspaceWidth] = useElementWidth<HTMLDivElement>();
  const sidePanel = useResizableWidth({
    containerWidth: workspaceWidth,
    defaultRatio: 0.25,
    minWidth: 240,
    maxWidth: workspaceWidth < 640 ? workspaceWidth : workspaceWidth * 0.7,
    side: "right",
    valueLabel: "workspace",
  });

  const [documents, documentsReady] = useTable(
    tables.myDocuments.where(row => row.spaceId.eq(id ?? 0n)),
    { enabled: !!space },
  );
  const previewDocument = space && documentsReady ? documents.find(document => document.id === previewId) : undefined;

  const corpusRevision = documentsReady ? documents.map(document => `${document.id}:${document.checksumSha256}:${document.verifiedAt?.microsSinceUnixEpoch ?? ""}`).sort().join("|") : "";
  const flowchart = useSpaceFlowchart(space?.id, corpusRevision);
  const graph = flowchart.result?.graph ?? null;
  // A regenerated graph may no longer contain the selected node.
  const nodeVisible = nodeOpen && view === "flowchart" && !!space && !!graph?.nodes.some(node => node.id === selectedNodeId);
  const filesVisible = filesOpen && !!space;
  // The risk agent runs only from the flowchart toolbar button; this just reads results.
  const risk = useSpaceRisk(space?.id, flowchart.result?.generatedAt ?? null);
  // The ticket agent runs only from the Tickets view button; this reads saved tickets.
  const tickets = useSpaceTickets(space?.id, flowchart.result?.generatedAt ?? null);
  const currentRisk = risk.result?.stale ? null : risk.assessment;
  const riskVisible = riskOpen && view === "flowchart" && !!space && !!graph;

  function closeFiles() {
    sidePanel.cancel();
    setFilesOpen(false);
    filesButton.current?.focus();
  }

  function toggleFiles() {
    if (filesOpen) return closeFiles();
    setNodeOpen(false);
    setRiskOpen(false);
    setFilesOpen(true);
  }

  function openRisks() {
    setFilesOpen(false);
    setNodeOpen(false);
    setRiskOpen(true);
  }

  function openNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setNodeOpen(true);
    setFilesOpen(false);
    setRiskOpen(false);
  }

  function changeView(next: SpaceView) {
    setView(next);
    if (next !== "flowchart") { setNodeOpen(false); setRiskOpen(false); }
  }

  function sidePanelShell(panelId: string, label: string, resizeLabel: string, open: boolean, onClose: () => void, children: ReactNode) {
    return (
      <aside id={panelId} aria-label={label} aria-hidden={!open} inert={!open} style={{ width: workspaceWidth ? sidePanel.width : "25%" }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }} className={`absolute inset-y-0 right-0 z-20 flex max-w-full flex-col border-l border-[#e3e3e7] bg-white shadow-lg transition-transform duration-250 ease-out motion-reduce:transition-none ${open ? "translate-x-0" : "translate-x-full"}`}>
        <ResizeHandle label={resizeLabel} controls={panelId} visible={open} handleProps={sidePanel.handleProps} />
        {children}
      </aside>
    );
  }

  if (isActive && profileReady && !profile) return <Navigate to="/login" replace />;

  return (
    <div className={`flex h-svh flex-col overflow-hidden bg-[#faf9f6] text-[#37352f] ${sidePanel.resizing ? "cursor-col-resize select-none" : ""}`}>
      <header className="flex h-12 shrink-0 items-center border-b border-[#e3e3e7] bg-white">
        <div className="flex h-full w-12 shrink-0 items-center justify-center border-r border-[#e3e3e7]">
          <Link to="/spaces" aria-label="Back to your spaces" title="Back to your spaces" className="flex size-8 items-center justify-center rounded-md text-[#78766e] transition-colors hover:bg-[#f3f2ee] hover:text-[#37352f] focus-visible:outline-2 focus-visible:outline-[#b9d8f3]">
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <h1 className="min-w-0 truncate px-3 text-sm font-semibold tracking-[-0.3px] sm:px-4">
          {space?.name || (ready ? "Space not found" : "Loading space...")}
        </h1>
        {space?.archived && <span className="mr-5 shrink-0 rounded border border-[#e3e3e7] px-2 py-0.5 text-[10px] text-[#78766e]">Archived</span>}
      </header>

      <div className="flex min-h-0 flex-1">
        <SpaceSidebar disabled={!space} view={view} onViewChange={changeView} filesOpen={filesOpen} onToggleFiles={toggleFiles} filesButtonRef={filesButton} />

        <div ref={workspace} className="relative flex min-w-0 flex-1 overflow-hidden">
          {sidePanelShell("space-files-panel", "Files in this space", "Resize files panel", filesVisible, closeFiles,
            <SpaceFilesList documents={documents} ready={documentsReady} onPreview={documentId => openGraphSource(documentId, 1)} onClose={closeFiles} />)}
          {sidePanelShell("space-node-panel", "Component details", "Resize component details panel", nodeVisible, () => setNodeOpen(false),
            graph && selectedNodeId && <NodeDetailsPanel nodeId={selectedNodeId} graph={graph} details={flowchart.result?.details ?? {}} documents={flowchart.result?.documents ?? []} onPreview={openGraphSource} onSelectNode={openNode} onClose={() => setNodeOpen(false)} risk={currentRisk} />)}
          {sidePanelShell("space-risk-panel", "Risk flags", "Resize risk flags panel", riskVisible, () => setRiskOpen(false),
            <RiskPanel risk={risk} documents={flowchart.result?.documents ?? []} onPreview={openGraphSource} onSelectNode={openNode} onClose={() => setRiskOpen(false)} />)}

          <main aria-label="Space workspace" className="login-grid-bg relative min-w-0 flex-1 overflow-hidden">
            {!ready ? (
              <div role="status" className="flex h-full min-h-48 items-center justify-center gap-2 px-6 text-sm text-[#78766e]">
                {!connectionError && <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
                {connectionError ? "Unable to connect. Refresh to try again." : "Loading your space..."}
              </div>
            ) : !space ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
                <h2 className="text-lg font-semibold">Space not found</h2>
                <p className="mt-2 text-xs leading-5 text-[#78766e]">This space is unavailable or does not belong to your account.</p>
                <Link to="/spaces" className="mt-5 rounded text-xs font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#b9d8f3]">Return to your spaces</Link>
              </div>
            ) : (
              <>
                {/* Both views stay mounted (hidden, not removed) so the flowchart layout and chat history survive switching. */}
                <div aria-hidden={view !== "flowchart"} inert={view !== "flowchart"} className={`absolute inset-0 ${view === "flowchart" ? "" : "invisible"}`}>
                  <SpaceFlowchartView spaceKey={space.id.toString()} archived={space.archived} documentCount={documentsReady ? documents.length : null} flowchart={flowchart} selectedNodeId={nodeOpen ? selectedNodeId : null} onSelectNode={openNode} onPreview={openGraphSource} risk={risk} onOpenRisks={openRisks} />
                </div>
                <div aria-hidden={view !== "insights"} inert={view !== "insights"} className={`absolute inset-0 ${view === "insights" ? "" : "invisible"}`}>
                  <SpaceInsightsView key={space.id.toString()} active={view === "insights"} spaceId={space.id} onPreview={openGraphSource} />
                </div>
                <div aria-hidden={view !== "tickets"} inert={view !== "tickets"} className={`absolute inset-0 ${view === "tickets" ? "" : "invisible"}`}>
                  <SpaceTicketsView key={space.id.toString()} tickets={tickets} hasFlowchart={!!graph?.nodes.length} flowchartBusy={flowchart.busy} archived={space.archived}
                    documents={flowchart.result?.documents ?? []} onPreview={openGraphSource} onShowNode={nodeId => { changeView("flowchart"); openNode(nodeId); }} />
                </div>
              </>
            )}
          </main>
        </div>
      </div>
      {previewDocument && <DocumentPreviewDialog key={`${id}:${previewDocument.id}:${previewPage}`} document={previewDocument} initialPage={previewPage} onClose={() => setPreviewId(null)} />}
    </div>
  );
}
