import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Cascade card: a live dependency graph that fails, spreads, resolves */
/* ------------------------------------------------------------------ */

type NodeStatus = "ok" | "fail" | "fixed";
const NODES = [
  { x: 34, y: 30, l: "Power" },
  { x: 110, y: 18, l: "HVAC" },
  { x: 186, y: 38, l: "Cooling loop" },
  { x: 262, y: 24, l: "Racks" },
  { x: 70, y: 86, l: "Access" },
  { x: 150, y: 94, l: "BMS" },
  { x: 228, y: 104, l: "Tenant SLA" },
  { x: 40, y: 136, l: "Lease" },
  { x: 120, y: 142, l: "Utility" },
];
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 5], [2, 6], [3, 6], [4, 5], [4, 7], [5, 8], [7, 8], [5, 6],
];
const SOURCES = [2, 0, 5];

function waves(source: number): number[][] {
  const seen = new Set([source]);
  let frontier = [source];
  const out: number[][] = [[source]];
  for (let depth = 0; depth < 2; depth++) {
    const next: number[] = [];
    for (const n of frontier) {
      for (const [a, b] of EDGES) {
        const o = a === n ? b : b === n ? a : -1;
        if (o >= 0 && !seen.has(o)) {
          seen.add(o);
          next.push(o);
        }
      }
    }
    if (!next.length) break;
    out.push(next);
    frontier = next;
  }
  return out;
}

export function CascadeCard() {
  const [status, setStatus] = useState<NodeStatus[]>(() => NODES.map(() => "ok"));
  const [phase, setPhase] = useState<"ok" | "spread" | "fixed">("ok");
  const [info, setInfo] = useState({ src: "Cooling loop", count: 0 });

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    let round = 0;

    const cycle = () => {
      const src = SOURCES[round++ % SOURCES.length];
      const ws = waves(src);
      const all = ws.flat();
      setInfo({ src: NODES[src].l, count: all.length });
      let t = 0;
      ws.forEach((w) => {
        at(t, () => {
          setPhase("spread");
          setStatus((s) => s.map((v, i) => (w.includes(i) ? "fail" : v)));
        });
        t += 700;
      });
      t += 1400;
      [...all].reverse().forEach((n) => {
        at(t, () => setStatus((s) => s.map((v, i) => (i === n ? "fixed" : v))));
        t += 260;
      });
      at(t, () => setPhase("fixed"));
      at(t + 2600, () => {
        setStatus(NODES.map(() => "ok"));
        setPhase("ok");
      });
      at(t + 4200, cycle);
    };
    at(2600, cycle);
    return () => timers.forEach(window.clearTimeout);
  }, []);

  const title =
    phase === "spread" ? `${info.src} fault, ${info.count} at risk` : phase === "fixed" ? "Auto-resolved" : "All systems nominal";

  return (
    <article className="sx-pcard sx-pcard--graph" aria-label="Cascade prediction preview">
      <header>
        <span className="sx-pcard-title">Cascade risk</span>
        <span className="sx-badge" data-phase={phase}>
          <i />
          {phase === "spread" ? "Cascade predicted" : phase === "fixed" ? "Resolved" : "Monitoring"}
        </span>
      </header>
      <svg viewBox="0 0 300 160" className="sx-graph" role="img" aria-label="Dependency graph of facility systems">
        {EDGES.map(([a, b], i) => {
          const hot = status[a] === "fail" && status[b] === "fail";
          const done = status[a] === "fixed" && status[b] === "fixed";
          return (
            <line
              key={i}
              x1={NODES[a].x}
              y1={NODES[a].y}
              x2={NODES[b].x}
              y2={NODES[b].y}
              className="sx-edge"
              data-hot={hot}
              data-done={done}
            />
          );
        })}
        {NODES.map((n, i) => (
          <g key={n.l} className="sx-node" data-s={status[i]} transform={`translate(${n.x} ${n.y})`}>
            <circle className="sx-node-ring" r="11" />
            <circle className="sx-node-dot" r="5.5" />
            {status[i] !== "ok" && (
              <text y="-15" textAnchor="middle">
                {n.l}
              </text>
            )}
          </g>
        ))}
      </svg>
      <footer>
        <span key={title}>{title}</span>
        <em>{phase === "spread" ? "$184K exposure" : "$0 exposure"}</em>
      </footer>
      <div className="sx-toast" data-show={phase === "fixed"}>
        <span>
          <Check size={12} strokeWidth={3} />
        </span>
        <div>
          <b>Work order CBRE-2041</b>
          <small>Dispatched to HVAC vendor</small>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Glasses card: simulated first-person feed with detections           */
/* ------------------------------------------------------------------ */

const DETECTIONS = [
  { label: "Coolant leak", conf: "94%", x: 14, y: 52, w: 30, h: 26, tone: "bad", say: "Hey Meta, log this leak" },
  { label: "Rack C-14 · 71°C", conf: "88%", x: 52, y: 18, w: 34, h: 38, tone: "warn", say: "Hey Meta, flag this rack" },
  { label: "Breaker panel", conf: "OK", x: 30, y: 24, w: 38, h: 44, tone: "good", say: "Hey Meta, mark it inspected" },
];

export function GlassesCard() {
  const [i, setI] = useState(0);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const a = window.setInterval(() => setI((v) => (v + 1) % DETECTIONS.length), 3000);
    const b = window.setInterval(() => setClock((v) => v + 1), 1000);
    return () => {
      window.clearInterval(a);
      window.clearInterval(b);
    };
  }, []);

  const d = DETECTIONS[i];
  const mm = String(Math.floor(clock / 60)).padStart(2, "0");
  const ss = String(clock % 60).padStart(2, "0");

  return (
    <article className="sx-pcard sx-pcard--glass" aria-label="Meta glasses live view preview">
      <header>
        <span className="sx-pcard-title">Meta glasses</span>
        <span className="sx-badge" data-phase="live">
          <i />
          Live
        </span>
      </header>
      <div className="sx-view">
        <div className="sx-view-racks" />
        <div className="sx-view-scan" />
        <div className="sx-hud sx-hud--tl">REC {mm}:{ss}</div>
        <div className="sx-hud sx-hud--tr">1 frame / 3s</div>
        <div
          key={i}
          className="sx-box"
          data-tone={d.tone}
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%` }}
        >
          <span>
            {d.label} <b>{d.conf}</b>
          </span>
        </div>
        <div className="sx-corners" />
      </div>
      <footer>
        <span key={d.say} className="sx-say">
          “{d.say}”
        </span>
      </footer>
    </article>
  );
}
