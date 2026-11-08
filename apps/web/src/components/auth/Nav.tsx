import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Camera,
  ChevronDown,
  Gauge,
  Glasses,
  Mic,
  Network,
  ScanLine,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Chevron } from "./Chevron";

type Item = { icon: LucideIcon; title: string; desc: string; tint: string };
type Menu = { id: string; label: string; items: Item[] };

const MENUS: Menu[] = [
  {
    id: "platform",
    label: "Platform",
    items: [
      { icon: Network, title: "Dependency graph", desc: "Self-updating map of every system", tint: "#635bff" },
      { icon: Activity, title: "Cascade prediction", desc: "See failures before they spread", tint: "#ff6b9d" },
      { icon: Gauge, title: "Risk scoring", desc: "Quantify exposure in dollars", tint: "#00b8d9" },
      { icon: Workflow, title: "Auto-resolve", desc: "Agents that open and close tickets", tint: "#f5a623" },
    ],
  },
  {
    id: "glasses",
    label: "Meta glasses",
    items: [
      { icon: Glasses, title: "Live inspection", desc: "Walk the floor, stream what you see", tint: "#635bff" },
      { icon: ScanLine, title: "File & frame checks", desc: "Issues flagged from every upload", tint: "#00b8d9" },
      { icon: Camera, title: "Smart sampling", desc: "One frame every three seconds", tint: "#ff6b9d" },
      { icon: Mic, title: "Voice commands", desc: "“Hey Meta, flag this rack”", tint: "#f5a623" },
    ],
  },
];

export function Nav() {
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = (id: string) => {
    window.clearTimeout(timer.current);
    setOpen(id);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(null), 140);
  };

  return (
    <header className="sx-nav sx-in" style={{ "--d": "0.1s" } as React.CSSProperties}>
      <Link to="/login" className="sx-logo" aria-label="REALestate home">
        <img src="/logo.svg" alt="" width={28} height={28} />
        <span>REALestate</span>
      </Link>

      <nav className="sx-links" aria-label="Primary" onMouseLeave={hide}>
        {MENUS.map((m) => (
          <div
            key={m.id}
            className="sx-link-wrap"
            onMouseEnter={() => show(m.id)}
            onFocus={() => show(m.id)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hide();
            }}
          >
            <button
              type="button"
              className="sx-link-btn"
              aria-expanded={open === m.id}
              aria-haspopup="true"
              onClick={() => setOpen(open === m.id ? null : m.id)}
              onKeyDown={(e) => e.key === "Escape" && setOpen(null)}
            >
              {m.label}
              <ChevronDown size={14} className="sx-link-caret" />
            </button>
            <div className="sx-menu" data-open={open === m.id} role="menu">
              {m.items.map((it) => (
                <a key={it.title} href="#preview" className="sx-menu-item" role="menuitem" onClick={() => setOpen(null)}>
                  <span className="sx-menu-ico" style={{ "--tint": it.tint } as React.CSSProperties}>
                    <it.icon size={16} strokeWidth={2} />
                  </span>
                  <span>
                    <b>{it.title}</b>
                    <small>{it.desc}</small>
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
        <a className="sx-link-btn" href="#preview">How it works</a>
      </nav>

      <div className="sx-nav-cta">
        <Link to="/login" className="sx-signin sx-chev-host">
          Sign in <Chevron />
        </Link>
        <Link to="/signup" className="sx-pill sx-pill--sm sx-chev-host">
          Get started <Chevron />
        </Link>
      </div>
    </header>
  );
}
