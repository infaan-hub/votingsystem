"use client";

import { useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";

import { cn } from "@/src/lib/utils";

const DIGITS = 6;

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Fired when all digits are present. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
};

/**
 * Six square OTP boxes. Auto-advances on entry, supports pasting a full code,
 * and backspace crosses cells. The first box renders the active crimson border
 * until the code is complete.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  label,
}: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState(0);
  const digits = value.padEnd(DIGITS, " ").slice(0, DIGITS).split("");

  useEffect(() => {
    // Focus the first empty cell when the code is not yet complete.
    if (value.length < DIGITS) {
      refs.current[value.length]?.focus();
    }
  }, [value]);

  function setDigit(index: number, char: string) {
    if (disabled) return;
    if (char && !/^\d$/.test(char)) return;
    const next = (value.slice(0, index) + (char || " ") + value.slice(index + 1))
      .replace(/\s+$/, "")
      .slice(0, DIGITS);
    onChange(next);
    if (char && index < DIGITS - 1) {
      refs.current[index + 1]?.focus();
      setFocused(index + 1);
    }
    if (next.length === DIGITS) {
      refs.current[DIGITS - 1]?.blur();
      onComplete?.(next);
    }
  }

  function onKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]?.trim()) {
        setDigit(index, "");
        return;
      }
      if (index > 0) {
        setDigit(index - 1, "");
        refs.current[index - 1]?.focus();
        setFocused(index - 1);
      }
    }
    if (event.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
      setFocused(index - 1);
    }
    if (event.key === "ArrowRight" && index < DIGITS - 1) {
      refs.current[index + 1]?.focus();
      setFocused(index + 1);
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, DIGITS);
    if (!pasted) return;
    onChange(pasted);
    if (pasted.length === DIGITS) {
      refs.current[DIGITS - 1]?.blur();
      onComplete?.(pasted);
    }
  }

  const complete = value.length === DIGITS;

  return (
    <div className="w-full">
      {label ? (
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.6px] text-nv-muted">
          {label}
        </p>
      ) : null}

      <div
        className="flex justify-between gap-2"
        role="group"
        aria-label={label ?? "One-time code"}
      >
        {Array.from({ length: DIGITS }, (_, index) => {
          const active = !complete && focused === index && !disabled;
          return (
            <input
              key={index}
              ref={(node) => {
                refs.current[index] = node;
              }}
              value={digits[index]?.trim() ?? ""}
              onChange={(event) => setDigit(index, event.target.value.slice(-1))}
              onKeyDown={(event) => onKeyDown(index, event)}
              onPaste={onPaste}
              onFocus={() => setFocused(index)}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              disabled={disabled}
              aria-label={`Digit ${index + 1}`}
              aria-invalid={invalid || undefined}
              className={cn(
                "h-14 w-full min-w-0 rounded-lg border bg-transparent text-center text-2xl font-bold text-nv-ink",
                "transition-colors duration-200 ease-out",
                "focus:outline-none focus-visible:outline-none",
                invalid
                  ? "border-nv-danger"
                  : active || digits[index]?.trim()
                    ? "border-nv-primary"
                    : "border-nv-line",
                disabled && "opacity-40",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

/**
 * Custom numeric keypad for touch devices. Hidden on pointer-precise devices
 * where the native keyboard is better; every key is at least 44px tall.
 */
export function OtpKeypad({
  onDigit,
  onBackspace,
  disabled,
}: {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:hidden" role="group" aria-label="Number pad">
      {KEYPAD.map((key, index) => {
        if (key === "") {
          return <span key={`spacer-${index}`} aria-hidden="true" />;
        }
        const isDelete = key === "del";
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => (isDelete ? onBackspace() : onDigit(key))}
            aria-label={isDelete ? "Delete last digit" : key}
            className={cn(
              "flex h-14 items-center justify-center rounded-xl border border-nv-line bg-nv-surface",
              "text-xl font-bold text-nv-ink transition-colors duration-150",
              "active:bg-nv-primary-100 disabled:opacity-40",
            )}
          >
            {isDelete ? <Delete className="h-5 w-5" aria-hidden="true" /> : key}
          </button>
        );
      })}
    </div>
  );
}