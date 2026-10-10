"use client";

import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type CountUpProps = {
  value: number;
  durationMs?: number;
  className?: string;
};

/**
 * Animates a number up to its target. Renders the final value immediately when
 * the user prefers reduced motion, or when the value changes to a smaller one.
 */
export function CountUp({ value, durationMs = 900, className }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }
    // Only count upward; a decrease should snap rather than run backwards.
    if (value <= display) {
      setDisplay(value);
      return;
    }

    const from = display;
    const delta = value - from;
    const started = performance.now();

    const step = (now: number) => {
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + delta * eased));
      if (progress < 1) {
        frame.current = requestAnimationFrame(step);
      }
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  return (
    <span className={className}>
      {display.toLocaleString()}
      {value > 0 && display === 0 ? "" : ""}
    </span>
  );
}