"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/src/lib/utils";
import type { NavGroup } from "@/src/lib/nav";

export type SidebarLink = {
  href: string;
  label: string;
  /** A lucide icon component, rendered with a consistent size. */
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  exact?: boolean;
};

function isActive(pathname: string, link: { href: string; exact?: boolean }): boolean {
  if (link.exact || link.href === "/") return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

/**
 * Navigation rail. Icons-only at the `md` breakpoint (72px) and labelled from
 * `lg` up (240px). Always deep navy — the navigation surface is the brand
 * anchor in both light and dark themes.
 */
export function Sidebar({
  links,
  groups,
  brand,
  footer,
  roleBadge,
}: {
  links?: SidebarLink[];
  groups?: NavGroup[];
  brand?: React.ReactNode;
  footer?: React.ReactNode;
  /** Small chip above the footer, e.g. "Administrator". */
  roleBadge?: React.ReactNode;
}) {
  const pathname = usePathname();
  const flat: SidebarLink[] = groups
    ? groups.flatMap((group) => group.items)
    : (links ?? []);

  return (
    <aside
      aria-label="Sidebar"
      className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col border-r border-sidebar-border bg-sidebar md:flex lg:w-60"
    >
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-sidebar-border px-2 lg:justify-start lg:px-5">
        {brand}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2 lg:p-3">
        {groups ? (
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-1 hidden px-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/50 lg:block">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((link) => (
                    <NavLink key={link.href} link={link} pathname={pathname} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {flat.map((link) => (
              <NavLink key={link.href} link={link} pathname={pathname} />
            ))}
          </ul>
        )}
      </nav>

      {roleBadge ? (
        <div className="hidden shrink-0 px-3 pb-1 lg:block">{roleBadge}</div>
      ) : null}
      {footer ? (
        <div className="hidden shrink-0 border-t border-sidebar-border p-3 lg:block">{footer}</div>
      ) : null}
    </aside>
  );
}

function NavLink({
  link,
  pathname,
}: {
  link: SidebarLink;
  pathname: string;
}) {
  const active = isActive(pathname, link);
  const Icon = link.icon;
  return (
    <li>
      <Link
        href={link.href}
        aria-current={active ? "page" : undefined}
        title={link.label}
        className={cn(
          "group flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary",
          active
            ? "bg-nv-primary text-nv-navy shadow-[0_4px_14px_rgba(214,255,203,0.2)]"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <span className="shrink-0" aria-hidden="true">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="hidden truncate text-[13px] font-semibold lg:inline">{link.label}</span>
      </Link>
    </li>
  );
}
