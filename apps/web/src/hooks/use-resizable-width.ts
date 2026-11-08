import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type PointerEvent } from "react";

/** Tracks an element's content width. Attach the returned callback as a ref. */
export function useElementWidth<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Drag/keyboard resizing for a panel whose width is stored as a ratio of its container,
 * so it scales with the window. `side` is the edge the panel is docked to.
 */
export function useResizableWidth({ containerWidth, defaultRatio, minWidth, maxWidth, side, valueLabel }: {
  containerWidth: number; defaultRatio: number; minWidth: number; maxWidth: number; side: "left" | "right"; valueLabel: string;
}) {
  const [ratio, setRatio] = useState(defaultRatio);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(null);
  const min = Math.min(minWidth, containerWidth);
  const max = Math.max(min, maxWidth);
  const width = Math.round(clamp(containerWidth * ratio, min, max));
  // Dragging toward the container's middle grows the panel.
  const direction = side === "left" ? 1 : -1;

  const resize = (next: number) => { if (containerWidth > 0) setRatio(clamp(next, min, max) / containerWidth); };
  const cancel = useCallback(() => { drag.current = null; setResizing(false); }, []);
  const finish = (event: PointerEvent<HTMLElement>) => {
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleProps: HTMLAttributes<HTMLElement> = {
    "aria-valuemin": Math.round(min),
    "aria-valuemax": Math.round(max),
    "aria-valuenow": width,
    "aria-valuetext": `${containerWidth ? Math.round(width / containerWidth * 100) : Math.round(defaultRatio * 100)}% of ${valueLabel}`,
    onPointerDown: event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width, pointerId: event.pointerId };
      setResizing(true);
    },
    onPointerMove: event => {
      const current = drag.current;
      if (current && current.pointerId === event.pointerId) resize(current.width + direction * (event.clientX - current.x));
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: cancel,
    onDoubleClick: () => setRatio(defaultRatio),
    onKeyDown: event => {
      const step = event.shiftKey ? 48 : 16;
      if (event.key === "ArrowRight") resize(width + direction * step);
      else if (event.key === "ArrowLeft") resize(width - direction * step);
      else if (event.key === "Home") resize(min);
      else if (event.key === "End") resize(max);
      else return;
      event.preventDefault();
    },
  };

  return { width, resizing, cancel, handleProps };
}
