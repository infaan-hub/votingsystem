"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

type ResponsiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

/**
 * A dialog that behaves natively on each platform: a bottom sheet on phones
 * (thumb-reachable, dismissible by dragging down) and a centred modal on
 * tablet and desktop.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: ResponsiveDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  // Parents pass an inline onOpenChange, so its identity changes on every
  // re-render (every keystroke in a form dialog). Reading it through a ref
  // keeps the effects below stable instead of re-running per keystroke.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  const focusPlacedRef = useRef(false);

  // Escape closes, and Tab is trapped inside the panel while it is open.
  useEffect(() => {
    if (!open) {
      setDragOffset(0);
      focusPlacedRef.current = false;
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Move focus into the panel once per open so screen readers announce the
  // dialog. Never re-run this on parent re-renders (typing) and never steal
  // focus from something the user is already interacting with.
  useEffect(() => {
    if (!open || focusPlacedRef.current) return;
    focusPlacedRef.current = true;
    const id = window.setTimeout(() => {
      const active = document.activeElement;
      if (active && panelRef.current?.contains(active)) return;
      // Prefer the first form field; the close button comes first in the DOM
      // but focusing it would swallow the user's first keystrokes.
      const field = panelRef.current?.querySelector<HTMLElement>(
        "input, select, textarea",
      );
      (field ?? panelRef.current?.querySelector<HTMLElement>("button"))?.focus();
    }, 40);
    return () => {
      window.clearTimeout(id);
    };
  }, [open]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const onTouchStart = (event: React.TouchEvent) => {
    dragStart.current = event.touches[0].clientY;
  };
  const onTouchMove = (event: React.TouchEvent) => {
    if (dragStart.current === null) return;
    setDragOffset(Math.max(0, event.touches[0].clientY - dragStart.current));
  };
  const onTouchEnd = () => {
    // A drag past 96px dismisses the sheet, matching platform convention.
    if (dragOffset > 96) onOpenChange(false);
    dragStart.current = null;
    setDragOffset(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChangeRef.current(false);
      }}
    >
      <div
        ref={panelRef}
        style={dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined}
        className={cn(
          "w-full max-w-md rounded-t-2xl border border-nv-line bg-popover text-popover-foreground shadow-float backdrop-blur-xl",
          "max-h-[88dvh] overflow-y-auto pb-safe",
          "transition-transform sm:rounded-xl",
        )}
      >
        {/* Drag-to-dismiss lives on the handle/header only — binding it to the
            whole panel made scrolling the form dismiss the sheet on phones. */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
            <span className="h-1.5 w-10 rounded-full bg-muted" />
          </div>

          <div className="flex items-start justify-between gap-3 p-5">
            <div>
              <h2 id="dialog-title" className="text-fluid-lg font-semibold">
                {title}
              </h2>
              {description ? (
                <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChangeRef.current(false)}
              aria-label="Close dialog"
              className="-mr-1 -mt-1"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {children ? <div className="px-5 pb-2">{children}</div> : null}

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t p-5 sm:flex-row sm:justify-end max-sm:[&_button]:w-full max-sm:[&_a]:w-full">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}