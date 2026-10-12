import * as React from "react";
import { cn } from "@/src/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name?: string;
  src?: string | null;
  /** Pixel size of the avatar. */
  size?: number;
  /** Render a square instead of a circle (used for election covers). */
  square?: boolean;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/**
 * Deterministic accent per name so the same person keeps the same colour
 * across pages without storing a palette in the database.
 */
const PALETTE = [
  "bg-nv-primary text-nv-navy",
  "bg-emerald-200 text-emerald-900",
  "bg-teal-200 text-teal-900",
  "bg-lime-200 text-lime-900",
  "bg-amber-200 text-amber-900",
  "bg-rose-200 text-rose-900",
];

function paletteFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

function Avatar({ name = "", src, size = 40, square, className, style, ...props }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden font-bold",
        square ? "rounded-lg" : "rounded-full",
        !showImage && paletteFor(name || "?"),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)), ...style }}
      aria-label={name || undefined}
      role={name ? "img" : undefined}
      {...props}
    >
      {showImage ? (
        <img
          src={src!}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}

export { Avatar };
