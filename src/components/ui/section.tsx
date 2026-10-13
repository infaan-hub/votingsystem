import * as React from "react";
import { cn } from "@/src/lib/utils";

export type KeyValueItem = {
  label: string;
  value: React.ReactNode;
  /** Renders the value on its own line (long text, lists). */
  block?: boolean;
};

/** Definition list used on detail pages for election windows, rules, etc. */
export function KeyValueList({
  items,
  className,
  columns = 2,
}: {
  items: KeyValueItem[];
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className={cn(item.block && "sm:col-span-2")}>
          <dt className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-nv-muted">
            {item.label}
          </dt>
          <dd className="mt-1 text-[14px] font-medium text-nv-text">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Titled panel used to group form sections and detail blocks. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-nv-md border border-nv-line bg-nv-surface p-5 shadow-nv-card backdrop-blur-xl",
        className,
      )}
    >
      {title || actions ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-fluid-lg text-nv-ink">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-[13px] text-nv-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
