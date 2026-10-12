import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  hint?: string;
  invalid?: boolean;
  error?: string;
}

/**
 * Native `<select>` with the platform styling. Native is deliberate: it keeps
 * keyboard and screen-reader behaviour correct on every device without
 * shipping a listbox implementation.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, options, placeholder, hint, invalid, error, id, required, ...props }, ref) => {
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
        <div className="relative">
          <select
            ref={ref}
            id={fieldId}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              "h-12 w-full appearance-none rounded-lg border bg-card px-3.5 pr-10 text-[15px] text-nv-ink",
              "placeholder:text-nv-muted focus:outline-none focus-visible:outline-none",
              "transition-colors duration-200",
              "focus:border-nv-primary focus:ring-2 focus:ring-nv-primary/25",
              invalid ? "border-nv-danger" : "border-nv-line",
              className,
            )}
            {...props}
          >
            {placeholder ? (
              <option value="" disabled={required}>
                {placeholder}
              </option>
            ) : null}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-nv-muted"
          />
        </div>
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
Select.displayName = "Select";

export { Select };
