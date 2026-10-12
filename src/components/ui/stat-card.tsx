import * as React from "react";
import { cn } from "@/src/lib/utils";

export type StatCardProps = {
  label: string;
  value: React.ReactNode;
  /** Small caption under the value, e.g. "of 1,200 registered". */
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
};

const TONE: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-nv-bg text-nv-ink",
  primary: "bg-nv-primary-100 text-nv-primary-600",
  success: "bg-emerald-950 text-emerald-300",
  warning: "bg-amber-950 text-amber-300",
  danger: "bg-red-950 text-red-300",
};

/** One headline metric. Numbers are tabular so columns of cards line up. */
export function StatCard({ label, value, caption, icon, tone = "default", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-nv-md border border-nv-line bg-nv-surface p-4 shadow-nv-card",
        className,
      )}
    >
      {icon ? (
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", TONE[tone])}>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-nv-muted">{label}</p>
        <p className="nums-tabular mt-1 text-fluid-lg text-nv-ink">{value}</p>
        {caption ? <p className="mt-0.5 text-[12px] text-nv-muted">{caption}</p> : null}
      </div>
    </div>
  );
}

/** Responsive grid of stat cards: 1 → 2 → 4 columns. */
export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}
