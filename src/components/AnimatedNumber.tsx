"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  from?: number;
  durationMs?: number;
  className?: string;
};

export default function AnimatedNumber({ value, from, durationMs = 900, className }: Props) {
  const [display, setDisplay] = useState<number>(() => {
    if (typeof from === "number" && Number.isFinite(from)) return from;
    return value;
  });
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<number>(
    typeof from === "number" && Number.isFinite(from) ? from : value,
  );
  const startRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      const start =
        typeof from === "number" && Number.isFinite(from) ? from : value;
      fromRef.current = start;
      setDisplay(start);
    }

    const fromValue = fromRef.current;
    const to = value;

    if (!Number.isFinite(to)) return;
    if (fromValue === to) {
      setDisplay(to);
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.max(0, Math.min(1, elapsed / Math.max(1, durationMs)));

      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromValue + (to - fromValue) * eased;

      if (t >= 1) {
        fromRef.current = to;
        setDisplay(to);
        rafRef.current = null;
        return;
      }

      setDisplay(Math.round(next));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [value, durationMs, from]);

  return <span className={className}>{display}</span>;
}
