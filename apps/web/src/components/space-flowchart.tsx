import { useEffect, useMemo, useRef } from "react";
import dagre from "@dagrejs/dagre";
import { Controls, Handle, MarkerType, Panel, Position, ReactFlow, useNodesState, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { Building2, Cable, CircleDot, Cpu, Fan, FileText, Landmark, ListChecks, Network, ShieldCheck, SlidersHorizontal, Users, Zap } from "lucide-react";
import type { GraphResult, SpaceGraph } from "../../../../spacetimedb/src/validation/flowchart";
import { withoutDanglingEdges } from "../../../../spacetimedb/src/validation/flowchart";
import "@xyflow/react/dist/style.css";
import "./space-flowchart.css";

const categories = {
  property: { icon: Building2, color: "#7c83db" }, utility: { icon: Cable, color: "#53a986" },
  contract: { icon: FileText, color: "#699ad1" }, party: { icon: Users, color: "#ad83c5" },
  financial: { icon: Landmark, color: "#c5a24e" }, obligation: { icon: ListChecks, color: "#cf8b70" },
  equipment: { icon: Cpu, color: "#7e91b0" }, cooling: { icon: Fan, color: "#55a8ad" },
  power: { icon: Zap, color: "#c5a24e" }, network: { icon: Network, color: "#8d83c5" },
  controls: { icon: SlidersHorizontal, color: "#699ad1" }, safety: { icon: ShieldCheck, color: "#b58b79" },
  other: { icon: CircleDot, color: "#8b929b" },
};
type ComponentNode = Node<{ component: SpaceGraph["nodes"][number]; filenames: Record<string, string>; onPreview: (id: bigint, page: number) => void }, "component">;
function ComponentCard({ data, selected }: NodeProps<ComponentNode>) {
  const item = data.component;
  const { icon: Icon, color } = categories[item.category];
  const sources = [...new Map(item.evidence.map(source => [source.documentId, source])).values()];
  return <article className={`flow-component ${selected ? "is-selected" : ""}`}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
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

function layout(graph: SpaceGraph, documents: GraphResult["documents"], onPreview: (id: bigint, page: number) => void) {
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
    return { id: component.id, type: "component", position: { x: position.x - 150, y: position.y - 135 }, data: { component, filenames, onPreview } };
  });
  const edges: Edge[] = graph.edges.map(edge => ({
    id: edge.id, source: edge.source, target: edge.target, type: "default", label: edge.label,
    ariaLabel: `${edge.label}. ${edge.evidence.map(source => `${filenames[source.documentId]}, page ${source.page}: ${source.detail}`).join("; ")}`,
    style: { stroke: "#77ae91", strokeWidth: 2, strokeDasharray: "2 5" },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#77ae91", width: 18, height: 18 },
    labelStyle: { fill: "#fff", fontSize: 10, fontWeight: 500 }, labelBgStyle: { fill: "#6ca780" }, labelBgPadding: [7, 4], labelBgBorderRadius: 5,
  }));
  return { nodes, edges };
}

export function SpaceFlowchart({ graph, documents, onPreview, status = "ready" }: { graph: SpaceGraph; documents: GraphResult["documents"]; onPreview: (id: bigint, page: number) => void; status?: GraphResult["status"] }) {
  const initial = useMemo(() => layout(graph, documents, onPreview), [graph, documents, onPreview]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const topology = `${graph.nodes.map(node => node.id).join(",")}|${graph.edges.map(edge => edge.id).join(",")}`;
  const previousTopology = useRef(topology);
  useEffect(() => {
    const changed = previousTopology.current !== topology;
    previousTopology.current = topology;
    setNodes(current => initial.nodes.map(node => {
      const previous = current.find(item => item.id === node.id);
      return previous && !changed ? { ...node, position: previous.position, selected: previous.selected } : node;
    }));
  }, [initial, topology, setNodes]);
  return <div className="space-flowchart login-grid-bg h-full min-h-64 w-full" role="region" aria-label="Document component flowchart">
    <ReactFlow nodes={nodes} edges={initial.edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.1} maxZoom={2.5} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}>
      <Controls showInteractive={false} />
      <Panel position="top-left" className="rounded-md border border-neutral-200 bg-white/95 px-3 py-2 text-[11px] text-neutral-500 shadow-sm">{status === "processing" ? "Building graph · " : status === "failed" ? "Incomplete graph · " : ""}{graph.nodes.length} components · {graph.edges.length} relationships</Panel>
    </ReactFlow>
  </div>;
}
