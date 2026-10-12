import * as React from "react";
import { cn } from "@/src/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  invalid?: boolean;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, invalid, error, id, required, ...props }, ref) => {
    const generatedId = React.useId();
    const fieldId = id ?? generatedId;
    const describedBy = error
      ? `${fieldId}-error`
      : hint
        ? `${fieldId}-hint`
        : undefined;

    return (
      <div className="w-full">
        {label ? (
          <label
            htmlFor={fieldId}
            className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.6px] text-nv-muted"
          >
            {label}
            {required ? <span aria-hidden="true"> *</span> : null}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "min-h-[96px] w-full rounded-lg border bg-card px-3.5 py-2.5 text-[16px] text-nv-ink",
            "placeholder:text-nv-muted focus:outline-none focus-visible:outline-none",
            "transition-colors duration-200",
            "focus:border-nv-primary focus:ring-2 focus:ring-nv-primary/25",
            invalid ? "border-nv-danger" : "border-nv-line",
            className,
          )}
          {...props}
        />
        {hint && !error ? (
          <p id={describedBy} className="mt-1.5 text-[12px] text-nv-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={describedBy} role="alert" className="mt-1.5 text-[12px] font-medium text-nv-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
