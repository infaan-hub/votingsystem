import { ApiError } from "@/src/lib/http";
import { DATETIME_FORMAT_ERROR, parseDateTime } from "@/src/lib/time";
import { type Payload } from "@/src/lib/request";

/**
 * Collects field errors (every value is a list of messages) so a whole
 * validation pass is reported at once rather than failing on the first
 * invalid field.
 */
export class Collector {
  private errors: Record<string, string[]> | null = null;

  field(name: string, message: string): this {
    if (!this.errors) this.errors = {};
    (this.errors[name] ??= []).push(message);
    return this;
  }

  has(name: string): boolean {
    return (this.errors?.[name]?.length ?? 0) > 0;
  }

  get hasErrors(): boolean {
    return this.errors !== null && Object.keys(this.errors).length > 0;
  }

  throwIfAny(): void {
    if (this.hasErrors) {
      throw new ApiError(400, this.errors ?? {});
    }
  }
}

function rawOf(payload: Payload, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : undefined;
}

type StrOpts = {
  required?: boolean;
  allowBlank?: boolean;
  maxLength?: number;
  minLength?: number;
  trim?: boolean;
};

/** String field: required/blank/length checks with optional trimming. */
export function strField(
  c: Collector,
  payload: Payload,
  key: string,
  opts: StrOpts = {},
): string {
  const required = opts.required !== false;
  const trim = opts.trim !== false;
  const raw = rawOf(payload, key);

  if (raw === undefined) {
    if (required) c.field(key, "This field is required.");
    return "";
  }
  if (raw === null) {
    c.field(key, "This field may not be null.");
    return "";
  }
  if (typeof raw === "object" || typeof raw === "boolean") {
    c.field(key, "Not a valid string.");
    return "";
  }

  let value = String(raw);
  if (trim) value = value.trim();

  if (!value && !opts.allowBlank) {
    c.field(key, "This field may not be blank.");
    return value;
  }
  if (opts.maxLength !== undefined && value.length > opts.maxLength) {
    c.field(key, `Ensure this field has no more than ${opts.maxLength} characters.`);
    return value;
  }
  if (opts.minLength !== undefined && value && value.length < opts.minLength) {
    c.field(key, `Ensure this field has at least ${opts.minLength} characters.`);
    return value;
  }
  return value;
}

// Email syntax check: RFC-ish local part, domain labels, an IP-literal
// branch, and a `localhost` allowlist entry.
const EMAIL_USER_RE =
  /^[-!#$%&'*+/=?^_`{}|~0-9A-Z]+(?:\.[-!#$%&'*+/=?^_`{}|~0-9A-Z]+)*$|^"(?:[\x01-\x08\x0b\x0c\x0e-\x1f!#-\[\]-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*"$/i;
const EMAIL_DOMAIN_RE = new RegExp(
  "^[a-z\\u0080-\\uffff0-9](?:[a-z\\u0080-\\uffff0-9-]{0,61}[a-z\\u0080-\\uffff0-9])?" +
    "(?:\\.(?!-)[a-z\\u0080-\\uffff0-9-]{1,63}(?<!-))*" +
    "\\.(?!-)(?:[a-z\\u0080-\\uffff-]{2,63}|xn--[a-z0-9]{1,59})(?<!-)$",
  "i",
);
const EMAIL_LITERAL_RE = /^\[([A-Fa-f0-9:.]+)\]$/;

export function isValidEmail(value: string): boolean {
  if (!value || !value.includes("@") || value.length > 320) return false;
  const at = value.lastIndexOf("@");
  const userPart = value.slice(0, at);
  const domainPart = value.slice(at + 1);
  if (!EMAIL_USER_RE.test(userPart)) return false;
  if (domainPart === "localhost") return true;
  if (EMAIL_DOMAIN_RE.test(domainPart)) return true;
  const literal = EMAIL_LITERAL_RE.exec(domainPart);
  if (literal) {
    const ip = literal[1];
    if (ip.includes(":")) return /^[0-9a-f:.]+$/i.test(ip) && ip.includes(".");
    const parts = ip.split(".");
    return (
      parts.length === 4 &&
      parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
    );
  }
  return false;
}

/** Email field: string field plus the syntax check above. */
export function emailField(
  c: Collector,
  payload: Payload,
  key: string,
  opts: { required?: boolean; maxLength?: number } = {},
): string {
  const value = strField(c, payload, key, {
    required: opts.required,
    allowBlank: true,
    maxLength: opts.maxLength ?? 254,
  });
  if (value && !isValidEmail(value)) {
    c.field(key, "Enter a valid email address.");
  }
  return value;
}

/** Integer field: accepts numeric strings, rejects NaN/Infinity. */
export function intField(
  c: Collector,
  payload: Payload,
  key: string,
  opts: { required?: boolean } = {},
): number | undefined {
  const required = opts.required !== false;
  const raw = rawOf(payload, key);

  if (raw === undefined) {
    if (required) c.field(key, "This field is required.");
    return undefined;
  }
  if (raw === null) {
    c.field(key, "This field may not be null.");
    return undefined;
  }
  if (typeof raw === "boolean" || typeof raw === "object") {
    c.field(key, "A valid integer is required.");
    return undefined;
  }
  const text = String(raw).trim();
  if (!text) {
    c.field(key, "A valid integer is required.");
    return undefined;
  }
  if (/^\+\d+$/.test(text)) {
    return Number(text.slice(1));
  }
  if (!/^-?\d+$/.test(text)) {
    c.field(key, "A valid integer is required.");
    return undefined;
  }
  return Number(text);
}

const TRUE_VALUES = new Set(["t", "y", "yes", "true", "on", "1"]);
const FALSE_VALUES = new Set(["f", "n", "no", "false", "off", "0"]);

/** Boolean field: accepts true/false and the "True"/"False" string form. */
export function boolField(
  c: Collector,
  payload: Payload,
  key: string,
  opts: { required?: boolean; defaultValue?: boolean } = {},
): boolean | undefined {
  const required = opts.required !== false && opts.defaultValue === undefined;
  const raw = rawOf(payload, key);

  if (raw === undefined) {
    if (required) c.field(key, "This field is required.");
    return opts.defaultValue;
  }
  if (raw === null) {
    c.field(key, "Must be a valid boolean.");
    return undefined;
  }
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") {
    if (raw === 1) return true;
    if (raw === 0) return false;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
  }
  c.field(key, "Must be a valid boolean.");
  return undefined;
}

/** Choice field: value must be one of the allowed choices. */
export function choiceField(
  c: Collector,
  payload: Payload,
  key: string,
  choices: readonly string[],
  opts: { required?: boolean; allowNull?: boolean; defaultValue?: string } = {},
): string | undefined {
  const required = opts.required !== false && opts.defaultValue === undefined;
  const raw = rawOf(payload, key);

  if (raw === undefined) {
    if (required) c.field(key, "This field is required.");
    return opts.defaultValue;
  }
  if (raw === null) {
    if (opts.allowNull) return null as unknown as string;
    c.field(key, "This field may not be null.");
    return undefined;
  }
  const value = typeof raw === "string" ? raw : String(raw);
  if (!choices.includes(value)) {
    c.field(key, `"${value}" is not a valid choice.`);
    return undefined;
  }
  return value;
}

/** DateTime field: ISO-8601 input only. */
export function dateTimeField(
  c: Collector,
  payload: Payload,
  key: string,
  opts: {
    required?: boolean;
    allowNull?: boolean;
    defaultValue?: Date;
  } = {},
): Date | undefined {
  const required = opts.required !== false && opts.defaultValue === undefined;
  const raw = rawOf(payload, key);

  if (raw === undefined) {
    if (required) c.field(key, "This field is required.");
    return opts.defaultValue;
  }
  if (raw === null) {
    if (opts.allowNull) return null as unknown as Date;
    c.field(key, "This field may not be null.");
    return undefined;
  }
  const parsed = parseDateTime(raw);
  if (!parsed) {
    c.field(key, DATETIME_FORMAT_ERROR);
    return undefined;
  }
  return parsed;
}

/** True when the buffer starts with a signature of a format Pillow can open. */
export function looksLikeImage(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const startsWith = (sig: number[], offset = 0) =>
    sig.every((byte, index) => bytes[offset + index] === byte);

  // GIF
  if (startsWith([0x47, 0x49, 0x46])) return true;
  // PNG
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return true;
  // JPEG
  if (startsWith([0xff, 0xd8, 0xff])) return true;
  // BMP
  if (startsWith([0x42, 0x4d])) return true;
  // WEBP (RIFF....WEBP)
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    startsWith([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return true;
  }
  // TIFF
  if (
    startsWith([0x49, 0x49, 0x2a, 0x00]) ||
    startsWith([0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return true;
  }
  // ICO
  if (startsWith([0x00, 0x00, 0x01, 0x00])) return true;
  return false;
}

/** File field: reads a File body part and enforces size/type limits. */
export function fileField(
  c: Collector,
  payload: Payload,
  key: string,
  opts: {
    required?: boolean;
    allowNull?: boolean;
  } = {},
): File | null | undefined {
  const raw = rawOf(payload, key);

  if (raw === undefined) {
    if (opts.required) c.field(key, "No file was submitted.");
    return undefined;
  }
  if (raw === null) {
    if (opts.allowNull) return null;
    c.field(key, "This field may not be null.");
    return undefined;
  }
  if (raw instanceof File) {
    if (!raw.name) {
      c.field(key, "No filename could be determined.");
      return undefined;
    }
    if (raw.size === 0) {
      c.field(key, "The submitted file is empty.");
      return undefined;
    }
    return raw;
  }
  c.field(key, "The submitted data was not a file. Check the encoding type on the form.");
  return undefined;
}

/** Image type check via magic bytes. */
export async function validateImageFile(
  c: Collector,
  key: string,
  file: File,
): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) {
    c.field(key, "The submitted file is empty.");
    return null;
  }
  if (!looksLikeImage(bytes)) {
    c.field(
      key,
      "Upload a valid image. The file you uploaded was either not an image or a corrupted image.",
    );
    return null;
  }
  return bytes;
}
