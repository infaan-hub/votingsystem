"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Avatar } from "@/src/components/ui/avatar";
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
 * Navigation rail below the top header. White glass with charcoal text;
 * collapsed shows icons only (72px), open shows labels (240px). The rail is
 * opened and closed by the three-line toggle in the top header — the brand
 * and any toggle live there, never here.
 */
export function Sidebar({
  links,
  groups,
  collapsed = false,
  footer,
  roleBadge,
  profile,
  onSignOut,
}: {
  links?: SidebarLink[];
  groups?: NavGroup[];
  /** Icons-only rail when true; labels visible when false. */
  collapsed?: boolean;
  footer?: React.ReactNode;
  /** Small chip above the footer, e.g. "Administrator". */
  roleBadge?: React.ReactNode;
  /** Signed-in user's picture + name, pinned at the top of the rail. */
  profile?: { name: string; src: string | null };
  /** Renders a Sign out control pinned under the nav (desktop rail). */
  onSignOut?: () => void;
}) {
  const pathname = usePathname();
  const flat: SidebarLink[] = groups
    ? groups.flatMap((group) => group.items)
    : (links ?? []);

  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        "fixed bottom-0 left-0 top-16 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-xl md:flex",
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      {profile ? (
        <div className="shrink-0 border-b border-sidebar-border p-2 lg:p-3">
          <Link
            href="/profile"
            title={profile.name}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors duration-200",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary",
              collapsed && "justify-center px-0",
            )}
          >
            <Avatar src={profile.src ?? undefined} name={profile.name} size={32} />
            <span
              className={cn("truncate text-[13px] font-semibold", collapsed && "hidden")}
            >
              {profile.name}
            </span>
          </Link>
        </div>
      ) : null}
      <nav className="min-h-0 flex-1 overflow-y-auto p-2 lg:p-3">
        {groups ? (
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p
                  className={cn(
                    "mb-1 px-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/50",
                    collapsed ? "hidden" : "block",
                  )}
                >
                  {group.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((link) => (
                    <NavLink key={link.href} link={link} pathname={pathname} collapsed={collapsed} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {flat.map((link) => (
              <NavLink key={link.href} link={link} pathname={pathname} collapsed={collapsed} />
            ))}
          </ul>
        )}
      </nav>

      {onSignOut ? (
        <div className="shrink-0 border-t border-sidebar-border p-2 lg:p-3">
          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sidebar-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
          >
            <span className="shrink-0" aria-hidden="true">
              <LogOut className="h-[18px] w-[18px]" />
            </span>
            <span
              className={cn(
                "truncate text-[13px] font-semibold",
                collapsed ? "hidden" : "inline",
              )}
            >
              Sign out
            </span>
          </button>
        </div>
      ) : null}
      {roleBadge ? (
        <div className={cn("shrink-0 px-3 pb-1", collapsed ? "hidden" : "block")}>{roleBadge}</div>
      ) : null}
      {footer ? (
        <div
          className={cn(
            "shrink-0 border-t border-sidebar-border p-3",
            collapsed ? "hidden" : "block",
          )}
        >
          {footer}
        </div>
      ) : null}
    </aside>
  );
}

function NavLink({
  link,
  pathname,
  collapsed,
}: {
  link: SidebarLink;
  pathname: string;
  collapsed: boolean;
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
            ? "bg-nv-primary-100 text-nv-primary shadow-[inset_3px_0_0_0_var(--nv-primary)]"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <span className="shrink-0" aria-hidden="true">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span
          className={cn(
            "truncate text-[13px] font-semibold",
            collapsed ? "hidden" : "block",
          )}
        >
          {link.label}
        </span>
      </Link>
    </li>
  );
}
