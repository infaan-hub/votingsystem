import * as React from "react";
import { cn } from "@/src/lib/utils";

/**
 * Empty / zero-data state. Always ships an explanation *and* the next
 * action — a blank table is never acceptable per the product spec.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-nv-md border border-dashed border-nv-line bg-nv-surface px-6 py-12 text-center",
        className,
      )}
    >
      <div aria-hidden="true" className="nv-dots pointer-events-none absolute inset-0 text-nv-muted" />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
        {icon ? (
          <span className="grid h-12 w-12 place-items-center rounded-full bg-nv-primary-100 text-nv-ink">
            {icon}
          </span>
        ) : null}
        <h2 className="text-fluid-lg text-nv-ink">{title}</h2>
        {description ? (
          <p className="text-[13.5px] leading-relaxed text-nv-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
