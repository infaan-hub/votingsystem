import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/src/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** Renders the mixed/indeterminate state. */
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, indeterminate, id, ...props }, ref) => {
    const generatedId = React.useId();
    const fieldId = id ?? generatedId;

    return (
      <div className={cn("flex items-start gap-3", className)}>
        <span className="relative grid h-5 w-5 shrink-0 place-items-center">
          <input
            ref={(node) => {
              if (node) node.indeterminate = Boolean(indeterminate);
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            id={fieldId}
            type="checkbox"
            aria-describedby={description ? `${fieldId}-desc` : undefined}
            className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-nv-line bg-card transition-colors checked:border-nv-primary checked:bg-nv-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary/40 focus-visible:ring-offset-2"
            {...props}
          />
          <Check
            aria-hidden="true"
            className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
            strokeWidth={3}
          />
          <Minus
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute h-3.5 w-3.5 text-white transition-opacity",
              indeterminate ? "opacity-100" : "opacity-0",
            )}
            strokeWidth={3}
          />
        </span>
        {label || description ? (
          <span className="min-w-0">
            <label
              htmlFor={fieldId}
              className="cursor-pointer text-[14px] font-medium text-nv-ink"
            >
              {label}
            </label>
            {description ? (
              <p id={`${fieldId}-desc`} className="mt-0.5 text-[12.5px] text-nv-muted">
                {description}
              </p>
            ) : null}
          </span>
        ) : null}
      </div>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
