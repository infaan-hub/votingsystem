import * as React from "react";
import { Select, type SelectProps } from "@/src/components/ui/select";

const TIMES: string[] = [];
for (let hour = 0; hour < 24; hour++) {
  for (const minute of [0, 15, 30, 45]) {
    TIMES.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }
}

export const TIME_OPTIONS = TIMES.map((value) => ({ value, label: value }));

/**
 * Wall-clock time picker forced to 24-hour `HH:MM` values. The native
 * `<input type="time">` follows the browser locale and renders AM/PM on
 * en-US machines, so a select keeps the format identical for every user.
 */
export function TimeSelect(props: Omit<SelectProps, "options">) {
  return <Select {...props} options={TIME_OPTIONS} />;
}
