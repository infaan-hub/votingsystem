import Link from "next/link";
import { cn } from "@/src/lib/utils";

export const TILE_GRADIENTS = [
  "nv-tile-blue",
  "nv-tile-orange",
  "nv-tile-purple",
  "nv-tile-pink",
  "nv-tile-teal",
] as const;

export type TileData = {
  id: number | string;
  label: string;
  /** Optional count shown in the corner, e.g. "12 elections". */
  meta?: string | null;
  href: string;
  icon?: React.ReactNode;
};

/** Deterministic gradient so a tile keeps its colour across renders. */
function gradientFor(key: string | number): string {
  const text = String(key);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 997;
  }
  return TILE_GRADIENTS[hash % TILE_GRADIENTS.length];
}

/**
 * Explore tile: radius 18, gradient fill, white bold label. `wide` is the
 * full-width card variant used by the Regions tab, which adds a subtitle and an
 * emblem slot instead of just a label.
 */
export function Tile({
  tile,
  wide = false,
  subtitle,
  emblem,
  className,
}: {
  tile: TileData;
  wide?: boolean;
  subtitle?: string | null;
  emblem?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={tile.href}
      className={cn(
        gradientFor(tile.id),
        "group relative flex flex-col justify-end overflow-hidden rounded-[18px] bg-cover p-3.5 shadow-nv-card",
        "transition-transform duration-200 ease-out active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary focus-visible:ring-offset-2 focus-visible:ring-offset-nv-bg",
        wide ? "min-h-[92px] flex-row items-center gap-3.5" : "min-h-[104px]",
        className,
      )}
    >
      {emblem ? (
        <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-nv-ink/20 text-lg font-bold text-nv-ink">
          {emblem}
        </span>
      ) : null}

      <span className="relative min-w-0">
        <span
          className={cn(
            "block font-bold text-nv-ink",
            wide ? "text-[15px]" : "text-[14px] leading-5",
          )}
        >
          {tile.label}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[12px] text-nv-ink/80">{subtitle}</span>
        ) : null}
      </span>

      {tile.meta ? (
        <span className="nums-tabular absolute right-3 top-3 rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-bold text-nv-ink">
          {tile.meta}
        </span>
      ) : null}

      {tile.icon ? (
        <span className="absolute bottom-3 right-3 text-nv-ink/70" aria-hidden="true">
          {tile.icon}
        </span>
      ) : null}
    </Link>
  );
}