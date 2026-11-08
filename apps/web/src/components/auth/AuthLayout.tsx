import { useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import "@/styles/auth.css";
import { GradientBand } from "./GradientBand";
import { Logo } from "./Logo";
import type { AuthOutletContext } from "./auth-context";

export default function AuthLayout() {
  const { pathname } = useLocation();
  const mode = pathname.startsWith("/signup") ? "signup" : "login";
  const prevMode = useRef(mode);
  const dir = prevMode.current === mode ? "none" : mode === "signup" ? "next" : "prev";
  useLayoutEffect(() => {
    prevMode.current = mode;
  });

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

  // Soft spotlight that follows the cursor over the card.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const onMove = (e: PointerEvent) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const ctx: AuthOutletContext = { celebrate: () => setFlash((f) => f + 1) };

  return (
    <div className="sx-root">
      <GradientBand />

      <header className="sx-top sx-in" style={{ "--d": "0.1s" } as React.CSSProperties}>
        <Link to="/login" className="sx-logo" aria-label="REALestate home">
          <Logo />
        </Link>
      </header>

      <main className="sx-center">
        <div ref={cardRef} className="sx-card sx-in" style={{ "--d": "0.35s" } as React.CSSProperties}>
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
      </main>
    </div>
  );
}
