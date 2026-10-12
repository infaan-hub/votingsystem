"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/src/lib/utils";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Sticky action row pinned to the bottom of the sheet. */
  footer?: ReactNode;
  children?: ReactNode;
  /** Hide the default close affordance (use for forced flows). */
  dismissible?: boolean;
  className?: string;
};

/**
 * Bottom sheet on phones, centred modal from the `lg` breakpoint up. Drag down
 * to dismiss on touch; Escape closes; focus is trapped while open and
 * background scroll is locked.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  dismissible = true,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    if (!open) {
      setDragOffset(0);
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    }, 60);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange, dismissible]);

  if (!open) return null;

  const onTouchStart = (event: React.TouchEvent) => {
    dragStart.current = event.touches[0].clientY;
  };
  const onTouchMove = (event: React.TouchEvent) => {
    if (dragStart.current === null) return;
    setDragOffset(Math.max(0, event.touches[0].clientY - dragStart.current));
  };
  const onTouchEnd = () => {
    if (dragOffset > 112) onOpenChange(false);
    dragStart.current = null;
    setDragOffset(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] lg:items-center lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "sheet-title" : undefined}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={panelRef}
        style={dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn(
          "sheet flex max-h-[92dvh] w-full flex-col bg-nv-surface text-nv-ink",
          "transition-transform duration-200 ease-out lg:sheet-modal lg:max-h-[88dvh]",
          className,
        )}
      >
        <div className="flex justify-center pt-2.5 lg:hidden" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-nv-line" />
        </div>

        {title || dismissible ? (
          <header className="flex items-start justify-between gap-3 px-5 pt-4">
            <div className="min-w-0">
              {title ? (
                <h2 id="sheet-title" className="text-[22px] font-bold leading-7 tracking-tight">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-[13px] leading-5 text-nv-muted">{description}</p>
              ) : null}
            </div>
            {dismissible ? (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="-mr-1.5 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-nv-muted transition-colors hover:bg-nv-surface"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
          </header>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="border-t border-nv-line px-5 pb-safe pt-3 [&_a]:w-full [&_button]:w-full sm:[&_a]:w-auto sm:[&_button]:w-auto">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}