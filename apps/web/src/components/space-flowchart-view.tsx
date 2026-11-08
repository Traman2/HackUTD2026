import { lazy, Suspense } from "react";
import { LoaderCircle, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { useSpaceFlowchart } from "@/hooks/use-space-flowchart";
import type { SpaceRisk } from "@/hooks/use-space-risk";

const SpaceFlowchart = lazy(() => import("@/components/space-flowchart").then(module => ({ default: module.SpaceFlowchart })));

/** The flowchart workspace: status banner, the chart itself, and loading/empty states. */
export function SpaceFlowchartView({ spaceKey, archived, documentCount, flowchart, selectedNodeId, onSelectNode, onPreview, risk, onOpenRisks }: {
  spaceKey: string; archived: boolean; documentCount: number | null;
  flowchart: ReturnType<typeof useSpaceFlowchart>;
  selectedNodeId: string | null; onSelectNode: (nodeId: string) => void; onPreview: (documentId: bigint, page: number) => void;
  risk: SpaceRisk; onOpenRisks: () => void;
}) {
  const result = flowchart.result;
  const showBanner = flowchart.busy || flowchart.error || result?.error || result?.stale;

  return (
    <div className="flex h-full flex-col">
      {showBanner && <div className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-white px-4 py-2 text-xs text-muted-foreground">
        <p role={flowchart.error || result?.error ? "alert" : "status"} className="flex items-center gap-2">
          {flowchart.busy && <LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />}
          {flowchart.error || result?.error || (flowchart.busy ? result?.stage || "Loading flowchart..." : "Documents have changed. Generate the flowchart again to update it.")}
        </p>
        {!flowchart.busy && <Button variant="ghost" size="xs" onClick={flowchart.error ? flowchart.retry : flowchart.generate} disabled={archived}>{flowchart.error ? "Retry" : "Generate again"}</Button>}
      </div>}
      <div className="min-h-0 flex-1">
        {result?.graph && result.graph.nodes.length > 0 ? (
          <Suspense fallback={<p role="status" className="p-4 text-xs text-muted-foreground">Loading flowchart...</p>}>
            <SpaceFlowchart key={spaceKey} graph={result.graph} documents={result.documents} onPreview={onPreview} status={result.status} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} risk={risk} onOpenRisks={onOpenRisks} onRegenerate={flowchart.generate} regenerating={flowchart.busy} regenerateDisabled={archived || !documentCount} />
          </Suspense>
        ) : (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
            {flowchart.busy || flowchart.loading ? <>
              <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" />
              <p role="status" className="text-sm font-medium">{flowchart.busy ? "Generating flowchart..." : "Loading saved flowchart..."}</p>
              {flowchart.busy && <p className="max-w-sm text-xs leading-5 text-muted-foreground">{result?.stage || "Starting document analysis. The chart will appear here when it is ready."}</p>}
            </> : <>
              <span className="flex size-11 items-center justify-center rounded-full bg-white shadow-geist-sm"><Workflow aria-hidden="true" className="size-5 text-muted-foreground" /></span>
              <h2 className="text-sm font-semibold">{result?.status === "ready" ? "No supported components identified" : flowchart.phase === "error" ? "Flowchart unavailable" : "No flowchart generated yet"}</h2>
              <p className="max-w-sm text-xs leading-5 text-muted-foreground">{documentCount === 0 ? "Add PDF documents to this space before generating a flowchart." : "Generate a flowchart from this space's documents. It will appear here when ready."}</p>
              <Button onClick={flowchart.generate} disabled={archived || !documentCount} className="mt-1 text-xs"><Workflow aria-hidden="true" />{flowchart.phase === "error" ? "Generate again" : "Generate flowchart"}</Button>
            </>}
          </div>
        )}
      </div>
    </div>
  );
}
