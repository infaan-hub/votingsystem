import * as React from "react";
import { cn } from "@/src/lib/utils";

/**
 * Underline-only input. 1px `--nv-primary` on focus, `--nv-line` at rest, with
 * a tiny label above and an optional trailing icon.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Rendered inside the field, after the text (calendar, chevron, ...). */
  icon?: React.ReactNode;
  /** Trailing action such as a "show password" toggle. */
  trailing?: React.ReactNode;
  invalid?: boolean;
  /** Rendered under the field when the value fails validation. */
  error?: string;
  containerClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, icon, trailing, invalid, error, containerClassName, id, ...props },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const describedBy = error ? `${inputId}-error` : undefined;

    return (
      <div className={cn("w-full", containerClassName)}>
        {label ? (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.6px] text-nv-muted"
          >
            {label}
          </label>
        ) : null}
        <div className="relative flex items-center">
          <input
            ref={ref}
            id={inputId}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              "h-12 w-full border-0 border-b bg-transparent px-0 text-[16px] text-nv-ink",
              "placeholder:text-nv-muted",
              "transition-colors duration-200 ease-out",
              "focus:outline-none focus-visible:outline-none",
              invalid ? "border-nv-danger" : "border-nv-line focus:border-nv-primary",
              icon && "pr-9",
              trailing && "pr-11",
              className,
            )}
            {...props}
          />
          {icon ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-0 flex h-11 w-9 items-center justify-center text-nv-muted"
            >
              {icon}
            </span>
          ) : null}
          {trailing ? (
            <span className="absolute right-0 flex h-11 items-center">{trailing}</span>
          ) : null}
        </div>
        {error ? (
          <p id={describedBy} role="alert" className="mt-1.5 text-[12px] text-nv-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };