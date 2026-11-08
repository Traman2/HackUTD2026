import { useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Play } from "lucide-react";
import "@/styles/auth.css";
import { Chevron } from "./Chevron";
import { GradientBand } from "./GradientBand";
import { Nav } from "./Nav";
import { CascadeCard, GlassesCard } from "./PreviewCards";
import { StatStrip } from "./StatStrip";
import type { AuthOutletContext } from "./auth-context";

const HEADLINE = ["Catch the cascade", "before it spreads."];

export default function AuthLayout() {
  const { pathname } = useLocation();
  const mode = pathname.startsWith("/signup") ? "signup" : "login";
  const prevMode = useRef(mode);
  const dir = prevMode.current === mode ? "none" : mode === "signup" ? "next" : "prev";
  useLayoutEffect(() => {
    prevMode.current = mode;
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>();
  const [flash, setFlash] = useState(0);

  // Smoothly resize the card when switching between login and signup.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight + 12));
    ro.observe(el);
    setHeight(el.offsetHeight + 12);
    return () => ro.disconnect();
  }, []);

  // Pointer parallax for the preview cards + spotlight on the auth card.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        root.style.setProperty("--px", String(e.clientX / window.innerWidth - 0.5));
        root.style.setProperty("--py", String(e.clientY / window.innerHeight - 0.5));
        const card = cardRef.current;
        if (card) {
          const r = card.getBoundingClientRect();
          card.style.setProperty("--mx", `${e.clientX - r.left}px`);
          card.style.setProperty("--my", `${e.clientY - r.top}px`);
        }
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const ctx: AuthOutletContext = { celebrate: () => setFlash((f) => f + 1) };

  return (
    <div ref={rootRef} className="sx-root">
      <GradientBand />
      <div className="sx-lines" aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>

      <Nav />

      <main className="sx-hero">
        <section className="sx-copy">
          <a href="#preview" className="sx-announce sx-chev-host sx-in" style={{ "--d": "0.25s" } as React.CSSProperties}>
            <span className="sx-announce-tag">New</span>
            Meta glasses live inspection <Chevron />
          </a>

          <h1 className="sx-h1">
            {HEADLINE.map((line, i) => (
              <span key={line} className="sx-line">
                <span className="sx-line-in" style={{ "--d": `${0.35 + i * 0.12}s` } as React.CSSProperties}>
                  {line}
                </span>
              </span>
            ))}
          </h1>

          <p className="sx-sub sx-in" style={{ "--d": "0.65s" } as React.CSSProperties}>
            REALestate connects HVAC, access control, power and lease data into one living map, predicts how
            a failure will spread, and dispatches the fix before tenants feel it. Check any file, or walk the
            floor wearing Meta glasses and see issues in real time.
          </p>

          <div className="sx-ctas sx-in" style={{ "--d": "0.8s" } as React.CSSProperties}>
            <Link to={mode === "login" ? "/signup" : "/login"} className="sx-pill sx-chev-host">
              {mode === "login" ? "Create account" : "Log in"} <Chevron />
            </Link>
            <a href="#preview" className="sx-ghost">
              <span><Play size={11} fill="currentColor" /></span>
              See it in action
            </a>
          </div>
        </section>

        <section className="sx-card-slot">
          <div
            ref={cardRef}
            className="sx-card sx-in"
            style={{ "--d": "0.5s" } as React.CSSProperties}
          >
            <div className="sx-spot" aria-hidden="true" />
            {flash > 0 && <span key={flash} className="sx-flash" aria-hidden="true" />}
            <div className="sx-tabs" role="tablist" aria-label="Authentication" data-mode={mode}>
              <span className="sx-tabs-ind" aria-hidden="true" />
              <Link to="/login" role="tab" aria-selected={mode === "login"}>Log in</Link>
              <Link to="/signup" role="tab" aria-selected={mode === "signup"}>Sign up</Link>
            </div>
            <div className="sx-body" style={{ height }}>
              <div ref={innerRef} className="sx-body-inner">
                <div key={pathname} className={`sx-page sx-page--${dir}`}>
                  <Outlet context={ctx} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="preview" className="sx-previews">
          <div className="sx-float sx-float--a sx-in" style={{ "--d": "0.95s" } as React.CSSProperties}>
            <CascadeCard />
          </div>
          <div className="sx-float sx-float--b sx-in" style={{ "--d": "1.1s" } as React.CSSProperties}>
            <GlassesCard />
          </div>
        </section>
      </main>

      <StatStrip />
    </div>
  );
}
