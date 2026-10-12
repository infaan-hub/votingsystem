"use client";

import * as React from "react";
import { cn } from "@/src/lib/utils";

export type CountdownProps = {
  /** ISO string or Date. */
  target: string | Date;
  /** Called once the countdown reaches zero. */
  onElapsed?: () => void;
  prefix?: string;
  className?: string;
};

type Parts = { days: number; hours: number; minutes: number; seconds: number; done: boolean };

function compute(target: Date): Parts {
  const remaining = target.getTime() - Date.now();
  if (!Number.isFinite(target.getTime()) || remaining <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: false,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Live countdown, ticked in one-second `setInterval`s and announced politely
 * so a screen-reader user is not interrupted every second.
 */
export function Countdown({ target, onElapsed, prefix = "Ends in", className }: CountdownProps) {
  const date = React.useMemo(() => (target instanceof Date ? target : new Date(target)), [target]);
  const [parts, setParts] = React.useState<Parts>(() => compute(date));

  React.useEffect(() => {
    setParts(compute(date));
    const id = window.setInterval(() => {
      const next = compute(date);
      setParts(next);
      if (next.done) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [date]);

  React.useEffect(() => {
    if (parts.done) onElapsed?.();
  }, [parts.done, onElapsed]);

  if (parts.done) {
    return (
      <p className={cn("text-[13px] font-semibold text-nv-muted", className)}>
        {prefix.replace(/in$/i, "").trim() || "Closed"} — time elapsed
      </p>
    );
  }

  const pieces =
    parts.days > 0
      ? `${parts.days}d ${pad(parts.hours)}h ${pad(parts.minutes)}m`
      : `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;

  return (
    <p
      className={cn("nums-tabular text-[13.5px] font-semibold text-nv-text", className)}
      role="timer"
      aria-live="off"
    >
      <span className="text-nv-muted">{prefix} </span>
      <span className="text-nv-ink">{pieces}</span>
    </p>
  );
}
