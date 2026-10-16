"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { cn } from "@/src/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";

/** Where a toast is docked: banner-style at the top, or above the bottom nav. */
type ToastPlacement = "bottom" | "top";

type Toast = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  placement: ToastPlacement;
  durationMs: number;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Defaults to "bottom"; in-app notifications use "top". */
  placement?: ToastPlacement;
  /** Defaults to AUTO_DISMISS_MS. */
  durationMs?: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { className: string; icon: typeof Info }> = {
  success: { className: "border-success/40 bg-success/10 text-success", icon: CheckCircle2 },
  error: {
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: XCircle,
  },
  warning: {
    className: "border-status-ready/40 bg-status-ready/10 text-status-ready",
    icon: AlertTriangle,
  },
  info: { className: "border-border bg-popover text-popover-foreground", icon: Info },
};

const AUTO_DISMISS_MS = 5000;

/** Placement-specific viewport chrome (safe areas, desktop docking). */
const VIEWPORT_STYLES: Record<ToastPlacement, string> = {
  bottom:
    "pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-20 sm:bottom-4 sm:right-4 sm:left-auto sm:items-end sm:pb-0",
  top: "pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:left-auto sm:right-4 sm:top-4 sm:items-end sm:px-0 sm:pt-0",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ title, description, tone = "info", placement = "bottom", durationMs = AUTO_DISMISS_MS }) => {
      // Monotonic id from an incrementing counter plus a random tail so repeated
      // identical toasts never collide.
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((current) => [
        ...current.slice(-3),
        { id, title, description, tone, placement, durationMs },
      ]);
    },
    [],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        placement="top"
        toasts={toasts.filter((entry) => entry.placement === "top")}
        onDismiss={dismiss}
      />
      <ToastViewport
        placement="bottom"
        toasts={toasts.filter((entry) => entry.placement === "bottom")}
        onDismiss={dismiss}
      />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  placement,
  toasts,
  onDismiss,
}: {
  placement: ToastPlacement;
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  // Never leave an empty region in the DOM: it would be announced to screen
  // readers as "Notifications" with nothing inside.
  if (toasts.length === 0) return null;
  return (
    <div
      className={VIEWPORT_STYLES[placement]}
      role="region"
      aria-label={placement === "top" ? "Notifications" : "Messages"}
    >
      {toasts.map((entry) => (
        <ToastCard key={entry.id} toast={entry} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const style = TONE_STYLES[toast.tone];
  const Icon = style.icon;

  useEffect(() => {
    const id = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(id);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3.5 shadow-panel backdrop-blur-xl",
        toast.placement === "top" && "shadow-xl",
        style.className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-xs opacity-90">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="flex h-11 w-11 shrink-0 -mr-1.5 -mt-1.5 items-center justify-center rounded-md opacity-70 hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}