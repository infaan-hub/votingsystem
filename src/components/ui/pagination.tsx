"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/src/lib/utils";

export type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Total row count, rendered as a summary line. */
  total?: number;
  pageSize?: number;
  className?: string;
};

/**
 * Page numbers with ellipses: first, last, current ± 1. Rendered as buttons
 * inside a `nav` so keyboard users can move through a table without a
 * scrollable list of hundreds of controls.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  total,
  pageSize,
  className,
}: PaginationProps) {
  if (pageCount <= 1) {
    return total !== undefined ? (
      <p className={cn("text-[12.5px] text-nv-muted", className)}>
        {total} {total === 1 ? "result" : "results"}
      </p>
    ) : null;
  }

  const pages = buildPageList(page, pageCount);
  const first = total !== undefined && pageSize ? (page - 1) * pageSize + 1 : undefined;
  const last = total !== undefined && pageSize ? Math.min(page * pageSize, total) : undefined;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      {total !== undefined && first !== undefined && last !== undefined ? (
        <p className="text-[12.5px] text-nv-muted">
          Showing <span className="font-semibold text-nv-text">{first}–{last}</span> of{" "}
          <span className="font-semibold text-nv-text">{total}</span>
        </p>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1">
        <PageButton
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </PageButton>
        {pages.map((entry, index) =>
          entry === "…" ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1.5 text-nv-muted">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? "page" : undefined}
              className={cn(
                "h-9 min-w-9 rounded-md px-2 text-[13px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary/40",
                entry === page
                  ? "bg-nv-primary text-nv-navy"
                  : "bg-transparent text-nv-muted hover:bg-muted hover:text-nv-ink",
              )}
            >
              {entry}
            </button>
          ),
        )}
        <PageButton
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-md border border-nv-line text-nv-text transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary/40",
        "hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function buildPageList(page: number, pageCount: number): (number | "…")[] {
  const wanted = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...wanted].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) out.push("…");
    out.push(value);
    previous = value;
  }
  return out;
}
