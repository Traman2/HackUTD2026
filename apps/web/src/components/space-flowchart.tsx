import { useEffect, useMemo, useRef, useState } from "react";
import dagre from "@dagrejs/dagre";
import { Controls, Handle, MarkerType, Panel, Position, ReactFlow, useNodesState, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { FileText, LoaderCircle, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import type { GraphResult, SpaceGraph } from "../../../../spacetimedb/src/validation/flowchart";
import { withoutDanglingEdges } from "../../../../spacetimedb/src/validation/flowchart";
import "@xyflow/react/dist/style.css";
import "./space-flowchart.css";
import { categories } from "./flowchart-categories";
import { severityStyles } from "./risk-styles";
import type { RiskAssessment } from "../../../../spacetimedb/src/validation/risk";
import type { SpaceRisk } from "@/hooks/use-space-risk";

type NodeRiskBadge = RiskAssessment["overview"][string];
type ComponentNode = Node<{ component: SpaceGraph["nodes"][number]; filenames: Record<string, string>; onPreview: (id: bigint, page: number) => void; risk?: NodeRiskBadge }, "component">;
function ComponentCard({ data, selected }: NodeProps<ComponentNode>) {
  const item = data.component;
  const { icon: Icon, color } = categories[item.category];
  const sources = [...new Map(item.evidence.map(source => [source.documentId, source])).values()];
  const risk = data.risk;
  return <article className={`flow-component ${selected ? "is-selected" : ""} ${risk ? `risk-${risk.severity} risk-${risk.kind}` : ""}`}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    {risk && <span className="flow-component-risk" title={risk.kind === "direct" ? "Risk from this component's own evidence" : "Risk from an upstream dependency"}>
      <span className="flow-component-risk-dot" style={{ background: severityStyles[risk.severity].dot }} />{severityStyles[risk.severity].label}{risk.kind === "propagated" ? " · upstream" : ""}
    </span>}
    <h3 title={item.label}>{item.label}</h3>
    <div className="flow-component-category"><Icon size={13} style={{ color }} /><span>{item.category}</span></div>
    <p className="flow-component-description nodrag nowheel" title={item.description}>{item.description}</p>
    <div className="flow-component-source-heading">Source documents · {sources.length}</div>
    <div className="flow-component-sources nodrag nowheel">
      {sources.map(source => <button key={source.documentId} type="button" onClick={() => data.onPreview(BigInt(source.documentId), source.page)} title={item.evidence.filter(evidence => evidence.documentId === source.documentId).map(evidence => `${data.filenames[evidence.documentId] || "Document"}, p. ${evidence.page}\n${evidence.detail}`).join("\n\n")} aria-label={`View source: ${data.filenames[source.documentId] || "Document"}, page ${source.page}`}><FileText size={10} /><span>{data.filenames[source.documentId] || "Document"} · p. {source.page}</span></button>)}
    </div>
    <div className="flow-component-accent" style={{ background: color }} />
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </article>;
}
const nodeTypes = { component: ComponentCard };
const NO_RISK: RiskAssessment["overview"] = {};

const toolbarButton = "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50";

/** Runs the risk agent on demand and summarizes its latest result. */
function RiskControl({ risk, disabled, onOpenRisks }: { risk: SpaceRisk; disabled: boolean; onOpenRisks?: () => void }) {
  const { result, assessment, busy, error, analyze } = risk;
  if (busy) return <span role="status" className="inline-flex items-center gap-1.5 py-0.5 text-foreground" title={result?.stage || "Starting risk analysis"}>
    <LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />{result?.stage || "Analyzing risk..."}
  </span>;
  const current = assessment && !result?.stale;
  return <span className="inline-flex flex-wrap items-center gap-1">
    {current ? <button type="button" onClick={onOpenRisks} className={toolbarButton} title="Open risk flags">
      <ShieldAlert aria-hidden="true" className="size-3.5" />
      {(["critical", "high", "elevated"] as const).filter(level => assessment.counts[level] > 0).map(level => <span key={level} className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="size-2 rounded-full" style={{ background: severityStyles[level].dot }} />{assessment.counts[level]} {severityStyles[level].label.toLowerCase()}
      </span>)}
      {!assessment.flags.length && "No risks found"}
    </button> : null}
    <button type="button" onClick={analyze} disabled={disabled} className={toolbarButton} title={disabled ? "Wait for the flowchart to finish" : current ? "Run the risk agent again" : "Run the risk agent on this flowchart"}>
      {current ? <><RefreshCw aria-hidden="true" className="size-3" /><span className="sr-only">Re-run risk analysis</span></>
        : <><ShieldAlert aria-hidden="true" className="size-3.5 text-ds-red-900" />{assessment ? "Risk out of date · Re-run" : "Analyze risk"}</>}
    </button>
    {error && <span role="alert" className="max-w-64 truncate text-ds-red-900" title={error}>{error}</span>}
  </span>;
}

function layout(graph: SpaceGraph, documents: GraphResult["documents"], onPreview: (id: bigint, page: number) => void, risk: RiskAssessment["overview"]) {
  graph = withoutDanglingEdges(graph);
  const engine = new dagre.graphlib.Graph({ multigraph: true });
  engine.setGraph({ rankdir: "LR", ranksep: 150, nodesep: 55, marginx: 40, marginy: 40 });
  engine.setDefaultEdgeLabel(() => ({}));
  graph.nodes.forEach(node => engine.setNode(node.id, { width: 300, height: 270 }));
  graph.edges.forEach(edge => engine.setEdge(edge.source, edge.target, { width: edge.label.length * 6 + 20, height: 24 }, edge.id));
  dagre.layout(engine);
  const filenames = Object.fromEntries(documents.map(doc => [doc.id, doc.filename]));
  const nodes: ComponentNode[] = graph.nodes.map(component => {
    const position = engine.node(component.id);
    return { id: component.id, type: "component", position: { x: position.x - 150, y: position.y - 135 }, data: { component, filenames, onPreview, risk: risk[component.id] } };
  });
  const edges: Edge[] = graph.edges.map(edge => ({
    id: edge.id, source: edge.source, target: edge.target, type: "default", label: edge.label,
    ariaLabel: `${edge.label}. ${edge.evidence.map(source => `${filenames[source.documentId]}, page ${source.page}: ${source.detail}`).join("; ")}`,
    style: { stroke: "#8f8f8f", strokeWidth: 1.5, strokeDasharray: "4 4" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#8f8f8f", width: 16, height: 16 },
    labelStyle: { fill: "#fff", fontSize: 10, fontWeight: 500, fontFamily: "var(--font-mono)" }, labelBgStyle: { fill: "#171717" }, labelBgPadding: [8, 4], labelBgBorderRadius: 999,
  }));
  return { nodes, edges };
}

export function SpaceFlowchart({ graph, documents, onPreview, status = "ready", selectedNodeId = null, onSelectNode, risk, onOpenRisks, onRegenerate, regenerating = false, regenerateDisabled = false }: {
  graph: SpaceGraph; documents: GraphResult["documents"]; onPreview: (id: bigint, page: number) => void; status?: GraphResult["status"];
  selectedNodeId?: string | null; onSelectNode?: (nodeId: string) => void;
  risk?: SpaceRisk; onOpenRisks?: () => void;
  onRegenerate?: () => void; regenerating?: boolean; regenerateDisabled?: boolean;
}) {
  const [instance, setInstance] = useState<ReactFlowInstance<ComponentNode> | null>(null);
  // Hide an out-of-date assessment from the cards; the toolbar offers a re-run.
  const overviewRisk = risk?.assessment && !risk.result?.stale ? risk.assessment.overview : NO_RISK;
  const initial = useMemo(() => layout(graph, documents, onPreview, overviewRisk), [graph, documents, onPreview, overviewRisk]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const topology = `${graph.nodes.map(node => node.id).join(",")}|${graph.edges.map(edge => edge.id).join(",")}`;
  const previousTopology = useRef(topology);
  useEffect(() => {
    const changed = previousTopology.current !== topology;
    previousTopology.current = topology;
    setNodes(current => initial.nodes.map(node => {
      const previous = current.find(item => item.id === node.id);
      return { ...node, position: previous && !changed ? previous.position : node.position, selected: !!previous?.selected };
    }));
  }, [initial, topology, setNodes]);
  // The details panel owns selection: highlight the node and bring it into view.
  useEffect(() => {
    setNodes(current => current.map(node => node.selected === (node.id === selectedNodeId) ? node : { ...node, selected: node.id === selectedNodeId }));
  }, [selectedNodeId, setNodes, topology]);
  useEffect(() => {
    if (selectedNodeId && instance) void instance.fitView({ nodes: [{ id: selectedNodeId }], duration: 350, maxZoom: Math.max(instance.getZoom(), 0.8) });
  }, [selectedNodeId, instance]);
  return <div className="space-flowchart login-grid-bg h-full min-h-64 w-full" role="region" aria-label="Document component flowchart">
    <ReactFlow nodes={nodes} edges={initial.edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onInit={setInstance}
      onNodeClick={(event, node) => { if (!(event.target as HTMLElement).closest("button")) onSelectNode?.(node.id); }} elementsSelectable={false} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.1} maxZoom={2.5} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}>
      <Controls showInteractive={false} />
      <Panel position="top-left" className="flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-geist-md backdrop-blur-sm">
        <span className="py-0.5 font-mono">{status === "processing" ? "Building graph · " : status === "failed" ? "Incomplete graph · " : ""}{graph.nodes.length} components · {graph.edges.length} relationships</span>
        {risk && <><span aria-hidden="true" className="h-4 w-px bg-border" /><RiskControl risk={risk} disabled={status === "processing"} onOpenRisks={onOpenRisks} /></>}
      </Panel>
      {onRegenerate && <Panel position="top-right" className="rounded-lg bg-white/90 px-1.5 py-1 text-[11px] shadow-geist-md backdrop-blur-sm">
        <button type="button" onClick={onRegenerate} disabled={regenerating || regenerateDisabled} aria-busy={regenerating} className={toolbarButton} title={regenerating ? "Regenerating flowchart" : "Regenerate the flowchart from this space's documents"}>
          {regenerating ? <LoaderCircle aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" /> : <RotateCcw aria-hidden="true" className="size-3" />}
          {regenerating ? "Regenerating..." : "Regenerate"}
        </button>
      </Panel>}
    </ReactFlow>
  </div>;
}
