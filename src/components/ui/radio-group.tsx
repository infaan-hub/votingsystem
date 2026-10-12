import * as React from "react";
import { cn } from "@/src/lib/utils";

export type RadioGroupOption = {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
};

export interface RadioGroupProps {
  label?: string;
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: RadioGroupOption[];
  error?: string;
  hint?: string;
  /** `card` renders each option as a selectable panel. */
  variant?: "list" | "card";
  className?: string;
  required?: boolean;
}

/**
 * Native radio inputs wired as a group. Native inputs keep arrow-key
 * navigation and screen-reader announcement correct for ballots and settings.
 */
function RadioGroup({
  label,
  name,
  value,
  defaultValue,
  onChange,
  options,
  error,
  hint,
  variant = "list",
  className,
  required,
}: RadioGroupProps) {
  const generatedId = React.useId();
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const current = value !== undefined ? value : internal;

  function select(option: string, disabled?: boolean) {
    if (disabled) return;
    if (value === undefined) setInternal(option);
    onChange?.(option);
  }

  return (
    <fieldset
      className={cn("w-full", className)}
      aria-describedby={error ? `${generatedId}-error` : undefined}
      aria-invalid={error ? true : undefined}
    >
      {label ? (
        <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.6px] text-nv-muted">
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </legend>
      ) : null}
      <div className={cn(variant === "card" ? "grid gap-2.5" : "space-y-2")}>
        {options.map((option) => {
          const checked = current === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3",
                variant === "card"
                  ? "rounded-lg border bg-card px-3.5 py-3 transition-colors"
                  : "rounded-md px-0.5 py-1",
                variant === "card" && checked
                  ? "border-nv-primary ring-2 ring-nv-primary/25"
                  : variant === "card"
                    ? "border-nv-line hover:border-nv-muted"
                    : "",
                option.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={option.disabled}
                onChange={() => select(option.value, option.disabled)}
                className="mt-0.5 h-4.5 w-4.5 shrink-0 cursor-pointer appearance-none rounded-full border border-nv-line bg-card transition-colors checked:border-[6px] checked:border-nv-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary/40 focus-visible:ring-offset-2"
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-nv-ink">
                  {option.label}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-[12.5px] text-nv-muted">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {hint && !error ? <p className="mt-2 text-[12px] text-nv-muted">{hint}</p> : null}
      {error ? (
        <p id={`${generatedId}-error`} role="alert" className="mt-2 text-[12px] font-medium text-nv-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export { RadioGroup };
