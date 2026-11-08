import { useMemo } from "react";
import { ReactFlow, Background, Controls, MarkerType } from "@xyflow/react";
import { FileText, Sparkles } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Insight, InsightsPanel } from "@/lib/insights-contract";
import "./generated-insights.css";

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const confidenceStyles = {
  high: "border-ds-green-300 bg-ds-green-100 text-ds-green-900",
  medium: "border-ds-amber-300 bg-ds-amber-100 text-ds-amber-900",
  low: "border-ds-orange-300 bg-ds-orange-100 text-ds-orange-900",
  unknown: "border-border bg-muted text-muted-foreground",
};

function DependencyGraph({ item }: { item: Extract<Insight, { type: "graph" }> }) {
  const nodes = useMemo(() => item.nodes.map((node, index) => ({ id: node.id, data: { label: node.label }, position: { x: (index % 3) * 230, y: Math.floor(index / 3) * 140 }, style: { width: 185, borderRadius: 10, border: "1px solid #ebebeb", background: "#fff", color: "#171717", padding: 16, fontSize: 12, boxShadow: "0 2px 2px #0000000a" } })), [item.nodes]);
  const edges = useMemo(() => item.edges.map((edge, index) => ({ ...edge, id: `edge-${index}`, type: "smoothstep", style: { stroke: "#a8a8a8", strokeWidth: 1.5 }, labelStyle: { fill: "#4d4d4d", fontSize: 10 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#a8a8a8" } })), [item.edges]);
  if (!nodes.length) return <p className="py-4 text-center text-xs text-muted-foreground">No dependencies to display.</p>;
  return <div className="insights-graph h-52 overflow-hidden rounded-lg border bg-[#fafbf9]" aria-label={item.title}><ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.25 }} nodesDraggable={false} nodesConnectable={false}><Background color="#e0e0e0" gap={18} /><Controls showInteractive={false} /></ReactFlow></div>;
}

function DataTable({ item }: { item: Extract<Insight, { type: "table" }> }) {
  return <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow>{item.columns.map((column, i) => <TableHead key={i} scope="col">{column}</TableHead>)}</TableRow></TableHeader><TableBody>{item.rows.length ? item.rows.map((row, i) => <TableRow key={i}>{item.columns.map((_, j) => <TableCell key={j}>{row[j] ?? "—"}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={item.columns.length} className="text-center text-muted-foreground">No data available.</TableCell></TableRow>}</TableBody></Table></div>;
}

function Chart({ item }: { item: Extract<Insight, { type: "bar" | "line" }> }) {
  const config = { value: { label: item.unit || "Value", color: "var(--chart-1)" } };
  const axes = <>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} tickFormatter={value => String(value).length > 12 ? String(value).slice(0, 11) + "..." : String(value)} />
    <YAxis tickLine={false} axisLine={false} width={42} tickFormatter={value => number.format(Number(value))} />
    <ChartTooltip content={<ChartTooltipContent formatter={value => <span className="font-medium tabular-nums">{number.format(Number(value))}{item.unit ? " " + item.unit : ""}</span>} />} />
  </>;
  return <ChartContainer config={config} className="h-[190px] w-full aspect-auto" aria-label={item.title}>
    {item.type === "bar" ? <BarChart accessibilityLayer data={item.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
      {axes}<Bar dataKey="value" fill="var(--color-value)" radius={3} maxBarSize={36} />
    </BarChart> : <LineChart accessibilityLayer data={item.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
      {axes}<Line dataKey="value" type="linear" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-value)" }} activeDot={{ r: 5 }} />
    </LineChart>}
  </ChartContainer>;
}

export function GeneratedInsights({ panel, onPreview }: { panel: InsightsPanel; onPreview: (id: bigint, page: number) => void }) {
  if (!panel.components.length) return <div className="flex h-full items-center justify-center p-4 text-center"><div className="max-w-xs"><span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-white shadow-geist-sm"><Sparkles aria-hidden="true" className="size-5 text-muted-foreground" /></span><h3 className="text-sm font-semibold">Explore your property</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Ask the assistant to compare risks, show evidence, or explore connected systems.</p></div></div>;
  return <div className="@container h-full overflow-auto p-3"><div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-3 @min-[520px]:grid-cols-2">{panel.components.map(item => {
    return <Card key={item.id} size="sm" className="min-w-0">
      <CardHeader className="flex flex-wrap items-start justify-between gap-2"><CardTitle className="min-w-0 flex-1 break-words text-sm">{item.title}</CardTitle>{item.type === "card" && <Badge className={confidenceStyles[item.confidence]}>{item.confidence === "unknown" ? "Unrated" : item.confidence[0].toUpperCase() + item.confidence.slice(1) + " confidence"}</Badge>}</CardHeader>
      <CardContent>
        {item.type === "card" && <><div className="break-words text-2xl font-semibold tracking-[-0.04em] text-foreground tabular-nums">{item.value}</div><CardDescription className="mt-1 text-xs leading-5">{item.description}</CardDescription></>}
        {(item.type === "bar" || item.type === "line") && <Chart item={item} />}
        {item.type === "graph" && <DependencyGraph item={item} />}
        {item.type === "table" && <DataTable item={item} />}
      </CardContent>
      {item.citations.length > 0 && <CardFooter className="flex-wrap gap-1.5 py-2"><span className="mr-1 text-[10px] font-medium text-muted-foreground">Evidence</span>{item.citations.map((citation, i) => <Button key={i} variant="outline" size="xs" className="max-w-full bg-white font-mono text-[10px] text-muted-foreground" title={citation.detail} onClick={() => onPreview(BigInt(citation.documentId), citation.page)}><FileText aria-hidden="true" /><span className="truncate">Source {citation.documentId} · p. {citation.page}</span></Button>)}</CardFooter>}
    </Card>;
  })}</div></div>;
}
