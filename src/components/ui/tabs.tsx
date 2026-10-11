"use client";

import { useId, useState, type ReactNode } from "react";

import { cn } from "@/src/lib/utils";

export type TabItem = {
  id: string;
  label: string;
  content?: ReactNode;
};

/**
 * Segmented tabs. The active segment is crimson, bold, and underlined — the
 * tab is the only place the active state is signalled, never colour alone
 * (weight + underline carry it too).
 */
export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active?: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  const baseId = useId();
  const [internal, setInternal] = useState(items[0]?.id ?? "");
  const current = active ?? internal;

  function select(id: string) {
    if (!active) setInternal(id);
    onChange?.(id);
  }

  return (
    <div className={cn("w-full", className)}>
      <div
        role="tablist"
        aria-label="Sections"
        className="flex gap-6 border-b border-nv-line"
      >
        {items.map((item) => {
          const selected = item.id === current;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              id={`${baseId}-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-${item.id}-panel`}
              onClick={() => select(item.id)}
              className={cn(
                "relative -mb-px min-h-11 px-1 pb-2.5 text-[14px] transition-colors duration-200",
                selected
                  ? "font-bold text-nv-primary"
                  : "font-medium text-nv-muted hover:text-nv-text",
              )}
            >
              {item.label}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-0 bottom-0 h-[3px] rounded-full transition-colors duration-200",
                  selected ? "bg-nv-primary" : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-${item.id}-panel`}
          aria-labelledby={`${baseId}-${item.id}`}
          hidden={item.id !== current}
        >
          {item.id === current ? item.content : null}
        </div>
      ))}
    </div>
  );
}