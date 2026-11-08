import type { MouseEventHandler } from "react";
import { Link } from "react-router-dom";

/** Logo plus wordmark, linking home. */
export function BrandMark({ to, onClick, disabled }: { to: string; onClick?: MouseEventHandler; disabled?: boolean }) {
  return (
    <Link
      to={to}
      aria-label="REALestate home"
      aria-disabled={disabled}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <img src="/logo.svg" alt="" width={28} height={28} className="block size-7 shrink-0 object-contain" />
      <span className="text-sm leading-none font-semibold tracking-[-0.02em]">REALestate</span>
    </Link>
  );
}
