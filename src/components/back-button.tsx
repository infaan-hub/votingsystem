"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/src/lib/utils";

/**
 * "← Back" control used across detail, form and step pages. Goes to the
 * previous page in history when there is one, otherwise pushes `fallback`
 * (e.g. the parent list), so a user always has a way back even after a
 * hard refresh or a direct link.
 */
export function BackButton({
  label = "Back",
  fallback = "/",
  className,
}: {
  label?: string;
  /** Route used when browser history has nothing to go back to. */
  fallback?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-nv-muted",
        "transition-colors duration-200 hover:text-nv-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary rounded-md",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
