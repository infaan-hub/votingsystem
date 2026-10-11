"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Compass, Home, User, Vote } from "lucide-react";

import { cn } from "@/src/lib/utils";

export type BottomNavItem = {
  href: string;
  label: string;
  icon: typeof Home;
};

export const DEFAULT_BOTTOM_NAV: BottomNavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/feed", label: "Feed", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: User },
];

/**
 * Four-tab bottom navigation for phones. The active tab is crimson with a
 * filled icon and bold label; inactive tabs are muted. Height 64 plus the safe
 * -area inset, so it clears the iOS home indicator and the Android gesture bar.
 */
export function BottomNav({ items }: { items?: BottomNavItem[] }) {
  const pathname = usePathname();
  const nav = items ?? DEFAULT_BOTTOM_NAV;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-nv-line bg-white/95 backdrop-blur dark:bg-[#0F1020]/95 lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch px-safe">
        {nav.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 pt-1.5 transition-colors duration-200",
                  active ? "text-nv-primary" : "text-nv-muted",
                )}
              >
                <Icon
                  className={cn("h-[22px] w-[22px]", active && "stroke-[2.5]")}
                  aria-hidden="true"
                />
                <span className={cn("text-[10px] leading-none", active && "font-bold")}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Safe-area spacer; the visual inset is handled by the ul padding. */}
      <span className="block h-[env(safe-area-inset-bottom)]" aria-hidden="true" />
    </nav>
  );
}

/** Ballot entry point used inside the Feed tab on the bottom nav. */
export const VoteTabIcon = Vote;