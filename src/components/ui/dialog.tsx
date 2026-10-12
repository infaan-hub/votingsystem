"use client";

import * as React from "react";
import { ResponsiveDialog } from "@/src/components/ui/responsive-dialog";
import { Button } from "@/src/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/src/lib/utils";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

/** Modal dialog: bottom sheet on phones, centred panel from `sm` up. */
export function Dialog({ open, onOpenChange, title, description, children, footer }: DialogProps) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={footer}
    >
      {children}
    </ResponsiveDialog>
  );
}

export type AlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
};

/**
 * Destructive-action confirmation. The confirm button is the only element
 * that runs `onConfirm`, so a stray Enter or backdrop click never deletes
 * anything.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading = false,
  onConfirm,
  children,
}: AlertDialogProps) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!loading) onOpenChange(next);
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "primary"}
            onClick={onConfirm}
            disabled={loading}
            className="sm:w-auto"
          >
            {loading ? "Workingâ€¦" : confirmLabel}
          </Button>
        </>
      }
    >
      {tone === "destructive" ? (
        <div className="mb-3 flex items-start gap-3 rounded-lg border border-nv-danger/30 bg-nv-danger/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-nv-danger" aria-hidden="true" />
          <p className="text-[13px] text-nv-text">
            This action cannot be undone.
          </p>
        </div>
      ) : null}
      {children}
    </ResponsiveDialog>
  );
}

/** Convenience wrapper: a labelled section inside a dialog body. */
export function DialogSection({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("py-2", className)}>{children}</div>;
}
