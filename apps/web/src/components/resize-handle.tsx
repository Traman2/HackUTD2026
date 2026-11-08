import type { HTMLAttributes } from "react";
import { GripVertical } from "lucide-react";

/** Vertical drag handle. Place inside a `relative` element; it straddles that element's left edge. */
export function ResizeHandle({ label, controls, visible = true, handleProps }: {
  label: string; controls: string; visible?: boolean; handleProps: HTMLAttributes<HTMLElement>;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-controls={controls}
      tabIndex={visible ? 0 : -1}
      style={{ visibility: visible ? "visible" : "hidden" }}
      title="Drag to resize. Use arrow keys, or double-click to reset."
      {...handleProps}
      className="group absolute inset-y-0 -left-1.5 z-30 flex w-3 touch-none cursor-col-resize items-center justify-center outline-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-transparent hover:before:bg-border-strong focus-visible:before:w-0.5 focus-visible:before:bg-ring"
    >
      <span className="relative flex h-8 w-3 items-center justify-center rounded border border-border bg-white text-subtle shadow-sm group-hover:border-border-strong group-hover:text-foreground group-focus-visible:border-ring">
        <GripVertical aria-hidden="true" className="size-3" />
      </span>
    </div>
  );
}
