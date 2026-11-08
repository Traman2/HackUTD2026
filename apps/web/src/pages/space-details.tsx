import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowLeft, FileText, FolderOpen, GripVertical, LoaderCircle, MessageSquare, Plus, Workflow, X } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { Button } from "@/components/ui/button";
import { DocumentPreviewDialog } from "@/components/document-preview-dialog";
import { tables } from "@/module_bindings";

const tools = [
  { label: "Generate flowchart", icon: Workflow },
  { label: "Open chat", icon: MessageSquare },
  { label: "Add documents", icon: Plus },
];

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
  const [filesOpen, setFilesOpen] = useState(false);
  const [previewId, setPreviewId] = useState<bigint | null>(null);
  const filesButton = useRef<HTMLButtonElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [filesWidthRatio, setFilesWidthRatio] = useState(0.25);
  const [resizing, setResizing] = useState(false);
  const minWidth = Math.min(240, workspaceWidth);
  const maxWidth = Math.max(minWidth, workspaceWidth < 640 ? workspaceWidth : workspaceWidth * 0.7);
  const panelWidth = Math.round(Math.min(maxWidth, Math.max(minWidth, workspaceWidth * filesWidthRatio)));

  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWorkspaceWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [!!profile]);

  function resizeFiles(width: number) {
    if (workspaceWidth > 0) setFilesWidthRatio(Math.min(maxWidth, Math.max(minWidth, width)) / workspaceWidth);
  }

  function finishResize(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const [documents, documentsReady] = useTable(
    tables.myDocuments.where(row => row.spaceId.eq(id ?? 0n)),
    { enabled: !!space && (filesOpen || previewId !== null) },
  );
  const sortedDocuments = [...documents].sort((a, b) => {
    const aTime = a.createdAt.microsSinceUnixEpoch;
    const bTime = b.createdAt.microsSinceUnixEpoch;
    return aTime === bTime ? a.filename.localeCompare(b.filename) : aTime > bTime ? -1 : 1;
  });
  const previewDocument = space && documentsReady ? documents.find(document => document.id === previewId) : undefined;

  function closeFiles() {
    drag.current = null;
    setResizing(false);
    setFilesOpen(false);
    filesButton.current?.focus();
  }

  if (isActive && profileReady && !profile) return <Navigate to="/login" replace />;

  return (
    <div className={`flex h-svh flex-col overflow-hidden bg-[#faf9f6] text-[#37352f] ${resizing ? "cursor-col-resize select-none" : ""}`}>
      <header className="flex h-16 shrink-0 items-center border-b border-[#e3e3e7] bg-white">
        <div className="flex h-full w-16 shrink-0 items-center justify-center border-r border-[#e3e3e7]">
          <Link to="/spaces" aria-label="Back to your spaces" title="Back to your spaces" className="flex size-9 items-center justify-center rounded-lg text-[#78766e] transition-colors hover:bg-[#f3f2ee] hover:text-[#37352f] focus-visible:outline-2 focus-visible:outline-[#b9d8f3]">
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <h1 className="min-w-0 truncate px-5 text-base font-semibold tracking-[-0.3px] sm:px-6">
          {space?.name || (ready ? "Space not found" : "Loading space...")}
        </h1>
        {space?.archived && <span className="mr-5 shrink-0 rounded border border-[#e3e3e7] px-2 py-0.5 text-[10px] text-[#78766e]">Archived</span>}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside aria-label="Space actions" className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-[#e3e3e7] bg-white py-5">
          {tools.map(({ label, icon: Icon }) => (
            <Button key={label} type="button" variant="ghost" size="icon-lg" disabled={!space} aria-label={label} title={label} className="size-10 rounded-xl text-[#78766e] hover:bg-[#f3f2ee] hover:text-[#37352f] focus-visible:ring-[#b9d8f3]">
              <Icon aria-hidden="true" className="size-5" />
            </Button>
          ))}
          <Button ref={filesButton} type="button" variant="ghost" size="icon-lg" disabled={!space} aria-label="View files" title="View files" aria-expanded={filesOpen && !!space} aria-controls="space-files-panel" onClick={() => { if (filesOpen) closeFiles(); else setFilesOpen(true); }} className={`size-10 rounded-xl focus-visible:ring-[#b9d8f3] ${filesOpen && space ? "bg-[#f3f2ee] text-[#37352f]" : "text-[#78766e] hover:bg-[#f3f2ee] hover:text-[#37352f]"}`}>
            <FolderOpen aria-hidden="true" className="size-5" />
          </Button>
        </aside>

        <div ref={workspace} className="relative flex min-w-0 flex-1 overflow-hidden">
          <aside id="space-files-panel" aria-label="Files in this space" aria-hidden={!filesOpen || !space} inert={!filesOpen || !space} style={{ width: workspaceWidth ? panelWidth : "25%" }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeFiles(); } }} className={`absolute inset-y-0 right-0 z-20 flex max-w-full flex-col border-l border-[#e3e3e7] bg-white shadow-lg transition-transform duration-250 ease-out motion-reduce:transition-none ${filesOpen && space ? "translate-x-0" : "translate-x-full"}`}>
            <div role="separator" style={{ visibility: filesOpen && space ? "visible" : "hidden" }} aria-label="Resize files panel" aria-orientation="vertical" aria-controls="space-files-panel" aria-valuemin={Math.round(minWidth)} aria-valuemax={Math.round(maxWidth)} aria-valuenow={panelWidth} aria-valuetext={`${workspaceWidth ? Math.round(panelWidth / workspaceWidth * 100) : 25}% of workspace`} tabIndex={filesOpen && space ? 0 : -1} title="Drag to resize. Use arrow keys, or double-click to reset." onPointerDown={event => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, width: panelWidth, pointerId: event.pointerId };
              setResizing(true);
            }} onPointerMove={event => {
              const current = drag.current;
              if (current && current.pointerId === event.pointerId) resizeFiles(current.width + current.x - event.clientX);
            }} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => { drag.current = null; setResizing(false); }} onDoubleClick={() => setFilesWidthRatio(0.25)} onKeyDown={event => {
              const step = event.shiftKey ? 48 : 16;
              if (event.key === "ArrowLeft") resizeFiles(panelWidth + step);
              else if (event.key === "ArrowRight") resizeFiles(panelWidth - step);
              else if (event.key === "Home") resizeFiles(minWidth);
              else if (event.key === "End") resizeFiles(maxWidth);
              else return;
              event.preventDefault();
            }} className="group absolute inset-y-0 -left-1.5 z-30 flex w-3 touch-none cursor-col-resize items-center justify-center outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-transparent hover:before:bg-[#b9d8f3] focus-visible:before:w-0.5 focus-visible:before:bg-[#b9d8f3]">
              <span className="relative flex h-8 w-3 items-center justify-center rounded border border-[#e3e3e7] bg-white text-[#939188] shadow-sm group-hover:border-[#b9d8f3] group-focus-visible:border-[#b9d8f3]"><GripVertical aria-hidden="true" className="size-3" /></span>
            </div>
            <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[#e3e3e7] px-4">
              <h2 className="text-sm font-semibold">Files <span className="ml-1 text-xs font-normal text-[#939188]">{documentsReady ? documents.length : ""}</span></h2>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close files panel" onClick={closeFiles}><X aria-hidden="true" /></Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {!documentsReady ? (
                <p role="status" className="flex items-center justify-center gap-2 py-10 text-xs text-[#78766e]"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Loading files...</p>
              ) : sortedDocuments.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-3 py-12 text-center text-[#939188]"><FolderOpen aria-hidden="true" className="size-7" /><p className="text-xs">No documents in this space yet.</p></div>
              ) : (
                <ul aria-label="Space documents" className="space-y-2">
                  {sortedDocuments.map(document => (
                    <li key={document.id.toString()}>
                      <button type="button" disabled={!document.verifiedAt} onClick={() => setPreviewId(document.id)} aria-haspopup="dialog" title={document.verifiedAt ? `Preview ${document.filename}` : "Preview is available after upload verification"} className="flex w-full cursor-pointer items-start gap-3 rounded-lg border border-[#e3e3e7] bg-white p-3 text-left transition-colors hover:border-[#b7b5ae] hover:bg-[#faf9f6] focus-visible:outline-2 focus-visible:outline-[#b9d8f3] disabled:cursor-default disabled:opacity-60">
                        <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#939188]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium" title={document.filename}>{document.filename}</span>
                          <span className="mt-1 block text-[10px] text-[#939188]">PDF · {(document.sizeBytes / 1024 / 1024).toFixed(2)} MiB</span>
                          {!document.verifiedAt && <span className={`mt-1.5 block text-[10px] ${document.status === "failed" ? "text-[#d92323]" : "text-[#78766e]"}`}>{document.status === "failed" ? "Upload failed" : "Awaiting verification"}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        <main aria-label="Space workspace" className="login-grid-bg min-w-0 flex-1 overflow-auto">
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
          ) : null}
        </main>
        </div>
      </div>
      {previewDocument && <DocumentPreviewDialog key={`${id}:${previewDocument.id}`} document={previewDocument} onClose={() => setPreviewId(null)} />}
    </div>
  );
}
