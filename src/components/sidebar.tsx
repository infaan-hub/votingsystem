"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";

export type SidebarLink = {
  href: string;
  label: string;
  /** A lucide icon component, rendered with a consistent size. */
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

/**
 * Left rail on tablets (72px, icons only) and a full sidebar from `lg` up
 * (240px). The rail remains reachable by keyboard and shows tooltips on hover.
 */
export function Sidebar({
  links,
  brand,
  footer,
}: {
  links: SidebarLink[];
  brand?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Sidebar"
      className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col border-r border-nv-line bg-white dark:bg-[#0F1020] md:flex lg:w-60"
    >
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-nv-line px-2 lg:justify-start lg:px-5">
        {brand}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2 lg:p-3">
        <ul className="flex flex-col gap-1">
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  title={link.label}
                  className={cn(
                    "group flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors duration-200",
                    active
                      ? "bg-nv-primary-100 text-nv-primary-600 dark:bg-[#3a1030] dark:text-[#ffd2e0]"
                      : "text-nv-muted hover:bg-nv-surface hover:text-nv-ink",
                  )}
                >
                  <span className="shrink-0" aria-hidden="true">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="hidden text-[13px] font-semibold lg:inline">
                    {link.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {footer ? (
        <div className="hidden shrink-0 border-t border-nv-line p-3 lg:block">{footer}</div>
      ) : null}
    </aside>
  );
}