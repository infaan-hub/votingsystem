"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { cn } from "@/src/lib/utils";

/** Pull distance (px) required before a refresh fires. */
const THRESHOLD = 72;
/** Visual cap so the indicator never tracks further than this. */
const MAX_PULL = 140;

type PullToRefreshProps = {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  className?: string;
};

/**
 * Touch pull-to-refresh, matching the iOS/Android convention: a spinner appears
 * as the user drags down at scroll top, and `onRefresh` fires once the drag
 * passes the threshold. Only active for touch input, so the desktop scroll is
 * unaffected.
 */
export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAtTop = useCallback(() => {
    const node = containerRef.current;
    if (!node) return true;
    return node.scrollTop <= 0 && window.scrollY <= 0;
  }, []);

  useEffect(() => {
    // Skip on non-touch devices entirely.
    if (typeof window === "undefined") return;
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;

    const onTouchStart = (event: TouchEvent) => {
      if (refreshing) return;
      startY.current = isAtTop() ? event.touches[0].clientY : null;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startY.current === null) return;
      const delta = event.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // Resistance curve: each extra pixel moves the indicator less.
      const resisted = Math.min(MAX_PULL, delta * 0.45);
      setPull(resisted);
    };

    const finish = async () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pull >= THRESHOLD) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
      setPull(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", finish);
    window.addEventListener("touchcancel", finish);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("touchcancel", finish);
    };
  }, [isAtTop, onRefresh, pull, refreshing]);

  const active = refreshing || pull > 0;
  const progress = refreshing ? 1 : Math.min(1, pull / THRESHOLD);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        aria-hidden={!active}
        className={cn(
          "pointer-events-none flex items-center justify-center overflow-hidden text-muted-foreground transition-[height] duration-150",
          active ? "text-primary" : "h-0 text-transparent",
        )}
        style={{ height: refreshing ? 48 : pull ? Math.round(pull) : 0 }}
      >
        <RefreshCw
          className={cn("h-5 w-5", refreshing && "animate-spin")}
          style={{ opacity: progress, transform: `rotate(${progress * 270}deg)` }}
        />
        <span className="sr-only" role="status">
          {refreshing ? "Refreshing…" : pull >= THRESHOLD ? "Release to refresh" : "Pull to refresh"}
        </span>
      </div>
      {children}
    </div>
  );
}