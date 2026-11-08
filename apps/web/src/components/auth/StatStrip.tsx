import { useEffect, useRef, useState } from "react";

function CountUp({ to, prefix = "", suffix = "", decimals = 0 }: { to: number; prefix?: string; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const run = () => {
      if (reduce) return setVal(to);
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / 1800);
        setVal(to * (1 - Math.pow(1 - p, 4)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);

  return (
    <span ref={ref}>
      {prefix}
      {val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

export function StatStrip() {
  return (
    <section className="sx-stats" aria-label="Platform stats (simulated demo data)">
      <div>
        <strong><CountUp to={4812} /></strong>
        <span>assets in the dependency graph</span>
      </div>
      <div>
        <strong><CountUp to={38} suffix="s" /></strong>
        <span>mean time to detect a cascade</span>
      </div>
      <div>
        <strong><CountUp to={2.4} prefix="$" suffix="M" decimals={1} /></strong>
        <span>exposure avoided in simulation</span>
      </div>
      <p>Simulated demo data</p>
    </section>
  );
}
