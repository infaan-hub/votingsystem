"use client";

import * as React from "react";
import { cn } from "@/src/lib/utils";

/**
 * Tooltip shown on hover and on keyboard focus, hidden on Escape. The target
 * receives `aria-describedby` so screen readers get the hint too.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();

  const placement = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }[side];

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {React.cloneElement(children, { "aria-describedby": open ? id : undefined })}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute z-50 w-max max-w-[16rem] rounded-md border border-nv-navy/10 bg-nv-navy px-2.5 py-1.5 text-[12px] font-medium text-nv-ink shadow-float",
            placement,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
