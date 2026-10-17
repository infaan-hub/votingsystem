"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Select } from "@/src/components/ui/select";

/**
 * Search box for list screens. Enter does not submit a form — filtering is
 * client-side on the current page of data — so it is a labelled input rather
 * than a form, which avoids double submits.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const inputId = React.useId();
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-nv-muted"
      />
      <input
        id={inputId}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-lg border border-nv-line bg-nv-surface pl-9 pr-3 text-[16px] text-nv-ink placeholder:text-nv-muted focus:border-nv-primary focus:outline-none focus:ring-2 focus:ring-nv-primary/25"
      />
    </div>
  );
}

export type FilterOption = { value: string; label: string };

export function FilterSelect({
  value,
  onChange,
  options,
  label,
  placeholder = "All",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  label: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("w-full sm:w-48", className)}>
      <Select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={[{ value: "", label: placeholder }, ...options]}
        className="h-12"
      />
    </div>
  );
}

/** Row of search + filters + a reset control; wraps on small screens. */
export function FiltersToolbar({
  children,
  onReset,
  hasFilters,
  className,
}: {
  children: React.ReactNode;
  onReset: () => void;
  hasFilters: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {hasFilters ? (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-nv-muted transition-colors hover:text-nv-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary/40"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Clear
        </button>
      ) : null}
    </div>
  );
}
