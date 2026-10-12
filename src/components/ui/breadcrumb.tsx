import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/lib/utils";

export type Crumb = {
  label: string;
  href?: string;
};

export function Breadcrumb({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("w-full", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-[12.5px] text-nv-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? (
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-nv-muted/70" />
              ) : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded transition-colors hover:text-nv-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary/40"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && "font-semibold text-nv-text")}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
