"use client";

import { useLayoutEffect, useMemo, useRef } from "react";

export function useFlipList<T>(
  items: readonly T[],
  getId: (item: T) => string,
  options?: { durationMs?: number },
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const durationMs = options?.durationMs ?? 3600;

  const idsKey = useMemo(() => items.map(getId).join("|"), [items, getId]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-flip-id]"),
    );

    const newRects = new Map<string, DOMRect>();
    for (const node of nodes) {
      const id = node.dataset.flipId;
      if (!id) continue;
      newRects.set(id, node.getBoundingClientRect());
    }

    for (const node of nodes) {
      const id = node.dataset.flipId;
      if (!id) continue;

      const prevRect = prevRectsRef.current.get(id);
      const newRect = newRects.get(id);
      if (!prevRect || !newRect) continue;

      const dy = prevRect.top - newRect.top;
      if (Math.abs(dy) < 1) continue;

      node.style.transition = "transform 0ms";
      node.style.transform = `translateY(${dy}px)`;
      node.getBoundingClientRect();

      requestAnimationFrame(() => {
        node.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        node.style.transform = "translateY(0px)";
      });
    }

    prevRectsRef.current = newRects;
  }, [idsKey, durationMs]);

  return { containerRef };
}
