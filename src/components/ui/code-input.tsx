"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/src/lib/utils";
import { OTP_LENGTH } from "@/src/lib/otp-constants";

export type CodeDigits = string[];

/**
 * Per-digit verification-code entry with browser autofill hooks:
 *
 *  - the first box carries `autocomplete="one-time-code"` so platform
 *    autofill (iOS QuickType for received codes, Chrome/Gboard, password
 *    managers) can fill a code the user received on this device;
 *  - `inputMode="numeric"` keeps a numeric keypad up on phones;
 *  - a pasted or autofilled multi-digit code is distributed across the boxes;
 *  - clearing the value (e.g. after a wrong-code error) re-focuses box one.
 */
export function CodeInput({
  digits,
  onDigitsChange,
  length = OTP_LENGTH,
  disabled = false,
  autoFocusFirst = false,
  label = "Verification code",
  className,
}: {
  digits: CodeDigits;
  onDigitsChange: (next: CodeDigits) => void;
  length?: number;
  disabled?: boolean;
  autoFocusFirst?: boolean;
  label?: string;
  className?: string;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const wasCleared = useRef(false);

  // Normalise the array once so index math can assume full length.
  const safeDigits = Array.from({ length }, (_, index) => digits[index] ?? "");

  useEffect(() => {
    if (autoFocusFirst) inputsRef.current[0]?.focus();
  }, [autoFocusFirst]);

  // After a wrong code the consumer clears the boxes — put the caret back
  // in the first box so the retry needs no extra tap.
  const empty = safeDigits.every((digit) => digit === "");
  useEffect(() => {
    if (empty) {
      if (wasCleared.current) inputsRef.current[0]?.focus();
      wasCleared.current = true;
    } else {
      wasCleared.current = false;
    }
  }, [empty]);

  function commit(next: CodeDigits) {
    onDigitsChange(Array.from({ length }, (_, index) => next[index] ?? ""));
  }

  function setDigit(index: number, rawValue: string) {
    const digit = rawValue.replace(/\D/g, "").slice(-1);
    const next = [...safeDigits];
    next[index] = digit;
    commit(next);
    if (digit && index < length - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !safeDigits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    const next = Array.from({ length }, () => "");
    pasted.split("").forEach((character, index) => {
      next[index] = character;
    });
    commit(next);
    inputsRef.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div
      className={cn("flex items-center justify-between gap-1.5 sm:gap-2", className)}
      onPaste={handlePaste}
      role="group"
      aria-label={`Enter the ${length}-digit ${label.toLowerCase()}`}
    >
      {safeDigits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputsRef.current[index] = element;
          }}
          value={digit}
          onChange={(event) => setDigit(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          inputMode="numeric"
          // Autofill source: the FIRST box advertises a one-time code so the
          // platform suggestion strip can fill the whole group.
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${index + 1}`}
          disabled={disabled}
          // w-full + flex-1 + max-w keeps the six boxes inside the card on
          // narrow phones (down to 320px) instead of overflowing off centre.
          className="h-12 w-full min-w-0 max-w-[2.75rem] flex-1 rounded-lg border border-nv-primary/20 bg-white text-center text-lg font-bold text-nv-ink focus:border-nv-primary focus:outline-none focus:ring-2 focus:ring-nv-primary/30 disabled:opacity-50 sm:h-14 sm:max-w-[3rem]"
        />
      ))}
    </div>
  );
}
