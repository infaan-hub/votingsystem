"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, LogOut, Menu, Search, UserPlus, Vote, X } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Sidebar } from "@/src/components/sidebar";
import { BottomNav } from "@/src/components/bottom-nav";
import { Avatar } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import tenant, { t } from "@/config/tenant";
import {
  bottomNavFor,
  navGroupsFor,
  roleLabel,
  shellRoleFor,
  type NavItem,
} from "@/src/lib/nav";
import { cn } from "@/src/lib/utils";

/** Routes that own the entire viewport (no chrome around them). */
const IMMERSIVE = /^\/(login|register|onboarding|vote\/[^/]+\/thank-you)(\/|$)/;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, handleLogout } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  /** Phone drawer visibility (hamburger in the phone header). */
  const [menuOpen, setMenuOpen] = useState(false);
  /** Desktop rail: collapsed = icons only, expanded = icons + labels. */
  const [railOpen, setRailOpen] = useState(false);

  const shell = shellRoleFor(user?.role);
  const immersive = IMMERSIVE.test(pathname);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Prevent the page behind the drawer from scrolling while it is open.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const navGroups = useMemo(() => navGroupsFor(shell), [shell]);
  const bottomItems = useMemo<NavItem[]>(() => {
    const items = bottomNavFor(shell);
    // The Profile tab shows the signed-in user's picture instead of the icon.
    const src = user?.photo_url;
    if (!src) return items;
    return items.map((item) =>
      item.href === "/profile" ? { ...item, avatarSrc: src } : item,
    );
  }, [shell, user?.photo_url]);
  const chip = roleLabel(user?.role);
  const isPublic = shell === "public";
  const profileName = user?.full_name || user?.username || "";
  const profileSrc = user?.photo_url ?? null;

  const publicLinks = useMemo(
    () =>
      isPublic
        ? navGroups.flatMap((group) => group.items)
        : [],
    [isPublic, navGroups],
  );

  // Desktop rail for visitors: the public nav plus auth entry points, so a
  // collapsed icons-only rail still reaches Sign in / Create account.
  const publicRailLinks = useMemo(
    () =>
      isPublic
        ? [
            ...publicLinks,
            { href: "/login", label: "Sign in", icon: LogIn },
            { href: "/register", label: "Create account", icon: UserPlus },
          ]
        : [],
    [isPublic, publicLinks],
  );

  const isActive = (item: { href: string; exact?: boolean }) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const brand = () => (
    <Link
      href="/"
      className="flex min-w-0 max-w-[55vw] items-center gap-2 sm:max-w-none"
      aria-label={`${t.name} home`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-nv-primary text-white">
        <Vote className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="truncate text-[15px] font-extrabold tracking-tight text-nv-ink">
        {t.name}
      </span>
    </Link>
  );

  if (immersive) {
    return <div className="app-shell">{children}</div>;
  }

  const drawerFooter = isPublic ? (
    <div className="space-y-2">
      <Button asChild variant="outline" className="w-full">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild className="w-full">
        <Link href="/register">Create account</Link>
      </Button>
    </div>
  ) : (
    <div className="space-y-2">
      {chip ? (
        <span className="inline-flex rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-1 text-[11px] font-bold uppercase tracking-[0.6px] text-sidebar-accent-foreground">
          {chip}
        </span>
      ) : null}
      <p className="truncate text-[11px] leading-tight text-sidebar-foreground/70">
        {tenant.authority.name}
      </p>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          setMenuOpen(false);
          void handleLogout().then(() => router.push("/"));
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </Button>
    </div>
  );

  /* ------------------------------------------------------------------ *
   * One shell for both roles:                                            *
   *  - Desktop (md+): top header with a hamburger left and the brand     *
   *    centred; a glass sidebar below it, collapsed to icons-only and    *
   *    expanded to labels by the toggle (sidebar top + header button).   *
   *  - Phone (<md): sticky header, hamburger left, brand centred,        *
   *    slide-in drawer sidebar, bottom tab bar.                           *
   * ------------------------------------------------------------------ */
  return (
    <div className="app-shell">
      {/* Desktop header — hamburger left, brand centred. */}
      <header className="sticky top-0 z-30 hidden border-b border-nv-line bg-nv-surface/90 backdrop-blur md:block">
        <div className="relative flex h-16 w-full items-center px-4">
          <button
            type="button"
            onClick={() => setRailOpen((open) => !open)}
            aria-label={railOpen ? "Collapse sidebar" : "Open sidebar"}
            aria-expanded={railOpen}
            title={railOpen ? "Collapse sidebar" : "Open sidebar"}
            className="absolute left-4 grid h-11 w-11 place-items-center rounded-lg text-nv-muted transition-colors duration-200 hover:bg-nv-primary-100 hover:text-nv-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="mx-auto">{brand()}</div>

          {/* Optical balance so the brand stays truly centred. */}
          <span className="absolute right-4 h-11 w-11" aria-hidden="true" />
        </div>
      </header>

      {/* Desktop sidebar — icons only while collapsed. */}
      <Sidebar
        groups={isPublic ? undefined : navGroups}
        links={isPublic ? publicRailLinks : undefined}
        collapsed={!railOpen}
        profile={!isPublic && user ? { name: profileName, src: profileSrc } : undefined}
        roleBadge={
          !isPublic && chip ? (
            <span className="inline-flex rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-1 text-[11px] font-bold uppercase tracking-[0.6px] text-sidebar-accent-foreground">
              {chip}
            </span>
          ) : null
        }
        footer={
          isPublic ? null : (
            <p className="truncate text-[11px] leading-tight text-sidebar-foreground/70">
              {tenant.authority.name}
            </p>
          )
        }
        onSignOut={
          isPublic
            ? undefined
            : () => {
                void handleLogout().then(() => router.push("/"));
              }
        }
      />

      {/* Phone header — hamburger left, brand centred, actions right. */}
      <header className="sticky top-0 z-30 border-b border-nv-line bg-nv-surface/90 backdrop-blur md:hidden">
        <div className="relative flex h-14 w-full items-center px-safe px-4">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            title="Menu"
            className="absolute left-3 grid h-11 w-11 place-items-center rounded-lg text-nv-muted transition-colors duration-200 hover:bg-nv-primary-100 hover:text-nv-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
          >
            {menuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <div className="mx-auto">{brand()}</div>

          {isPublic ? (
            <span className="absolute right-4 h-11 w-11" aria-hidden="true" />
          ) : (
            <div className="absolute right-3 flex items-center gap-1">
              <Button
                asChild
                variant="subtle"
                size="dense"
                className="h-9 w-9 px-0"
                aria-label="Search"
              >
                <Link href="/elections">
                  <Search className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Phone drawer — the sidebar opened by the three-line toggle. */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-xl">
            <div className="flex h-14 shrink-0 items-center justify-end border-b border-sidebar-border px-3">
              <Button
                variant="subtle"
                size="dense"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto p-3">
              {!isPublic && user ? (
                <div className="mb-3 border-b border-sidebar-border pb-3">
                  <Link
                    href="/profile"
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors duration-200",
                      isActive({ href: "/profile" })
                        ? "bg-nv-primary-100 text-nv-primary shadow-[inset_3px_0_0_0_var(--nv-primary)]"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Avatar src={profileSrc ?? undefined} name={profileName} size={32} />
                    <span className="truncate text-[13px] font-semibold">{profileName}</span>
                  </Link>
                </div>
              ) : null}
              {isPublic ? (
                <ul className="flex flex-col gap-0.5">
                  {publicLinks.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item) ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors duration-200",
                          isActive(item)
                            ? "bg-nv-primary-100 text-nv-primary shadow-[inset_3px_0_0_0_var(--nv-primary)]"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                        <span className="truncate text-[13px] font-semibold">{item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                navGroups.map((group) => (
                  <div key={group.label} className="mb-4 last:mb-0">
                    <p className="mb-1 px-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/50">
                      {group.label}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={isActive(item) ? "page" : undefined}
                            className={cn(
                              "flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors duration-200",
                              isActive(item)
                                ? "bg-nv-primary-100 text-nv-primary shadow-[inset_3px_0_0_0_var(--nv-primary)]"
                                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            )}
                          >
                            <item.icon
                              className="h-[18px] w-[18px] shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate text-[13px] font-semibold">
                              {item.label}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </nav>
            <div className="shrink-0 border-t border-sidebar-border p-3">{drawerFooter}</div>
          </div>
        </div>
      ) : null}

      {/* Content — offset by the desktop rail width. */}
      <div className={cn("md:pl-[72px]", railOpen && "md:pl-60")}>
        <main
          className={cn(
            isPublic
              ? "mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6"
              : "mx-auto min-h-[calc(100dvh-3.5rem)] w-full max-w-[1120px] px-4 pt-5 pb-nav md:pb-10 md:pt-6",
          )}
        >
          {children}
        </main>

        {isPublic ? <PublicFooter /> : null}
      </div>

      <BottomNav items={bottomItems} />
    </div>
  );
}

function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="hidden border-t border-nv-line bg-nv-surface pt-8 lg:block">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-[15px] font-extrabold tracking-tight text-nv-ink">{t.name}</p>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-nv-muted">
            Secure, transparent elections for {tenant.authority.name}. Secret ballots, auditable
            results, and accessible voting on any device.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="text-[11px] font-bold uppercase tracking-[0.8px] text-nv-muted">Platform</p>
          <ul className="mt-3 space-y-2">
            {[
              { href: "/elections", label: "Elections" },
              { href: "/compaigns", label: "Campaigns" },
              { href: "/results", label: "Results" },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-[13.5px] font-medium text-nv-text transition-colors hover:text-nv-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Legal">
          <p className="text-[11px] font-bold uppercase tracking-[0.8px] text-nv-muted">Legal</p>
          <ul className="mt-3 space-y-2">
            {[
              { href: "/contact", label: "Contact" },
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-[13.5px] font-medium text-nv-text transition-colors hover:text-nv-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mx-auto mt-8 w-full max-w-6xl px-4 text-[12px] text-nv-muted sm:px-6">
        © {year} {tenant.authority.name}. All rights reserved.
      </p>
    </footer>
  );
}
