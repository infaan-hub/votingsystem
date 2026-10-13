import * as React from "react";

import { cn } from "@/src/lib/utils";
import { BackButton } from "@/src/components/back-button";

/**
 * The one page-opening hero. A red gradient band (`nv-grad-profile`) that
 * bleeds to the edges of the main column, rounded only at the bottom, with a
 * single h1 and white text. Everything a page used to hand-roll as its top
 * section — eyebrow, title, description, avatar, meta line, chips, actions,
 * stat tiles — is declared here as content and laid out for you.
 *
 * Variant is auto-picked from content when not given: avatar or stats →
 * "profile", actions without avatar → "dashboard", description → "default",
 * title only → "compact". Buttons and badges placed inside should use the
 * `hero` / `heroGhost` variants so they stay legible on the gradient.
 *
 * Bleed: negative margins cancel AppShell's `<main>` padding (`px-4 pt-5
 * md:pt-6` signed-in, `pt-6` public) so the band reaches the column edges —
 * pass `className="-mt-6"` from public routes to match their `pt-6`.
 */
export type PageHeroStat = { label: string; value: React.ReactNode };

export type PageHeroVariant = "default" | "compact" | "profile" | "dashboard";

export function PageHero({
  eyebrow,
  title,
  description,
  avatar,
  meta,
  actions,
  badges,
  stats,
  variant,
  backHref,
  backLabel = "Back",
  align = "start",
  overlap = false,
  className,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Initials block, photo, or any node; sits left of the title. */
  avatar?: React.ReactNode;
  /** Small line under the title (e.g. `{t.idLabel}: username`). */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Chips/badges row under the heading block. */
  badges?: React.ReactNode;
  stats?: PageHeroStat[];
  variant?: PageHeroVariant;
  /** Renders a white "Back" control that falls back to this route. */
  backHref?: string;
  backLabel?: string;
  /** Center the heading block (used by the public home hero). */
  align?: "start" | "center";
  /** Pull the next sibling card up over the hero's bottom edge for depth. */
  overlap?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const resolved: PageHeroVariant =
    variant ??
    (avatar || stats?.length
      ? "profile"
      : actions
        ? "dashboard"
        : description
          ? "default"
          : "compact");

  const padding =
    resolved === "compact"
      ? "px-4 pb-6 pt-6 sm:px-6"
      : resolved === "profile"
        ? "px-4 pb-8 pt-7 sm:px-6"
        : "px-4 pb-7 pt-7 sm:px-6";

  return (
    <header
      className={cn(
        "nv-grad-profile relative overflow-hidden text-white",
        "rounded-b-[36px] shadow-[0_16px_40px_rgba(187,24,46,0.28)]",
        "-mx-4 -mt-5 sm:-mx-6 md:-mt-6",
        overlap && "-mb-8",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="nv-dots pointer-events-none absolute inset-0 text-white/12"
      />
      <div className={cn("relative", padding)}>
        {backHref ? (
          <BackButton
            label={backLabel}
            fallback={backHref}
            className="-ml-2 mb-1 text-white/85 hover:text-white focus-visible:ring-white/80 focus-visible:ring-offset-transparent"
          />
        ) : null}
        <div
          className={cn(
            "flex gap-4",
            align === "center"
              ? "flex-col items-center text-center"
              : "flex-col sm:flex-row sm:items-start sm:justify-between",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 gap-4",
              align === "center" && "flex-col items-center",
            )}
          >
            {avatar}
            <div className="min-w-0 space-y-1.5">
              {eyebrow ? (
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
                  {eyebrow}
                </p>
              ) : null}
              <h1
                className={cn(
                  "font-bold tracking-[-0.01em] text-white",
                  resolved === "compact"
                    ? "text-[22px] leading-tight sm:text-2xl"
                    : "text-fluid-xl",
                )}
              >
                {title}
              </h1>
              {meta ? (
                <p className="nums-tabular truncate text-[13px] text-white/80">
                  {meta}
                </p>
              ) : null}
              {description ? (
                <p
                  className={cn(
                    "text-[14.5px] leading-relaxed text-white/80",
                    align === "center" ? "max-w-xl" : "max-w-2xl",
                  )}
                >
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
        {badges ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div>
        ) : null}
        {children}
        {stats?.length ? (
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="min-w-[7rem] rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm"
              >
                <dt className="text-[10.5px] font-bold uppercase tracking-[0.8px] text-white/75">
                  {stat.label}
                </dt>
                <dd className="nums-tabular mt-0.5 text-[17px] font-extrabold text-white">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </header>
  );
}
