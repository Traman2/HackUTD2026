import { useState } from "react";
import { Chevron } from "./Chevron";

type Props = {
  status: "idle" | "loading" | "success";
  idle: string;
  loading: string;
  success: string;
};

export function SubmitButton({ status, idle, loading, success }: Props) {
  const [ripple, setRipple] = useState<{ x: number; y: number; k: number } | null>(null);
  const label = status === "loading" ? loading : status === "success" ? success : idle;

  return (
    <button
      type="submit"
      disabled={status === "loading"}
      className={`sx-pill sx-pill--block sx-chev-host sx-submit sx-submit--${status}`}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setRipple({ x: e.clientX - r.left, y: e.clientY - r.top, k: Date.now() });
      }}
    >
      <span className="sx-submit-shine" aria-hidden="true" />
      {ripple && (
        <span key={ripple.k} className="sx-ripple" style={{ left: ripple.x, top: ripple.y }} aria-hidden="true" />
      )}
      <span key={label} className="sx-submit-label">
        {label}
      </span>
      {status === "idle" && <Chevron />}
      {status === "loading" && <span className="sx-spin" aria-hidden="true" />}
      {status === "success" && (
        <svg className="sx-draw-check" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      )}
    </button>
  );
}
