"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, LogIn, LogOut, Menu, Search, UserPlus, Vote, X } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Sidebar } from "@/src/components/sidebar";
import { BottomNav } from "@/src/components/bottom-nav";
import { Avatar } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { Tooltip } from "@/src/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
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
  const [menuOpen, setMenuOpen] = useState(false);

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
  const bottomItems = useMemo<NavItem[]>(() => bottomNavFor(shell), [shell]);
  const chip = roleLabel(user?.role);

  const brand = (compact?: boolean) => (
    <Link
      href="/"
      className="flex min-w-0 max-w-[55vw] items-center gap-2 sm:max-w-none"
      aria-label={`${t.name} home`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-nv-primary text-nv-navy">
        <Vote className="h-4 w-4" aria-hidden="true" />
      </span>
      {!compact ? (
        <span className="truncate text-[15px] font-extrabold tracking-tight text-nv-ink">
          {t.name}
        </span>
      ) : null}
    </Link>
  );

  if (immersive) {
    return <div className="app-shell">{children}</div>;
  }

  /* ------------------------------------------------------------------ *
   * Public chrome: desktop icon rail + drawer sidebar + centred brand.  *
   * ------------------------------------------------------------------ */
  if (shell === "public") {
    const publicLinks = navGroups.flatMap((group) => group.items);
    const isActive = (item: NavItem) =>
      item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <div className="app-shell flex min-h-dvh flex-col md:pl-[72px]">
        {/* Desktop rail — icons only while the drawer is closed. */}
        <aside
          aria-label="Sidebar"
          className="fixed inset-y-0 left-0 z-40 hidden w-[72px] flex-col items-center border-r border-sidebar-border bg-sidebar py-4 md:flex"
        >
          <Link
            href="/"
            aria-label={`${t.name} home`}
            className="mb-4 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-nv-primary text-nv-navy"
          >
            <Vote className="h-5 w-5" aria-hidden="true" />
          </Link>

          <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
            {publicLinks.map((item) => (
              <Tooltip key={item.href} content={item.label} side="right">
                <Link
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-colors duration-200",
                    isActive(item)
                      ? "bg-nv-primary text-nv-navy"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </Link>
              </Tooltip>
            ))}
          </nav>

          <div className="flex shrink-0 flex-col items-center gap-1 border-t border-sidebar-border pt-3">
            <Link
              href="/login"
              title="Sign in"
              aria-label="Sign in"
              className="grid h-11 w-11 place-items-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogIn className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              href="/register"
              title="Create account"
              aria-label="Create account"
              className="grid h-11 w-11 place-items-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </aside>

        <header className="sticky top-0 z-30 border-b border-nv-line bg-nv-surface/90 backdrop-blur">
          <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
            <Button
              variant="subtle"
              size="dense"
              className="absolute left-3 top-1/2 h-11 w-11 -translate-y-1/2 px-0 sm:left-5"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </Button>

            <div className="mx-auto">{brand()}</div>

            {/* Optical balance so the brand stays truly centred. */}
            <span className="absolute right-4 h-9 w-9 sm:right-6" aria-hidden="true" />
          </div>
        </header>

        {/* Drawer — the sidebar with nav + auth, opened by the menu on every device. */}
        {menuOpen ? (
          <div className="fixed inset-0 z-50" role="dialog" aria-label="Menu">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/60"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar">
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
                {brand()}
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
                <ul className="flex flex-col gap-0.5">
                  {publicLinks.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors duration-200",
                            active
                              ? "bg-nv-primary text-nv-navy"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                          <span className="truncate text-[13px] font-semibold">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <div className="shrink-0 space-y-2 border-t border-sidebar-border p-3">
                <Button asChild variant="outline" className="w-full">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild className="w-full">
                  <Link href="/register">Create account</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6">{children}</main>

        <PublicFooter />

        <BottomNav items={bottomItems} />
      </div>
    );
  }

  /* ------------------------------------------------------------------ *
   * Signed-in chrome: navy rail + mobile header + tab bar.              *
   * ------------------------------------------------------------------ */
  return (
    <div className="app-shell">
      <Sidebar
        groups={navGroups}
        brand={brand()}
        roleBadge={
          chip ? (
            <span className="inline-flex rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-1 text-[11px] font-bold uppercase tracking-[0.6px] text-sidebar-accent-foreground">
              {chip}
            </span>
          ) : null
        }
        footer={
          <p className="truncate text-[11px] leading-tight text-sidebar-foreground/70">
            {tenant.authority.name}
          </p>
        }
        onSignOut={() => {
          void handleLogout().then(() => router.push("/"));
        }}
      />

      {/* Top bar — phones and tablets; desktop uses the rail. */}
      <header className="sticky top-0 z-30 border-b border-nv-line bg-nv-surface/90 backdrop-blur md:hidden">
        <div className="flex h-14 items-center gap-2 px-safe px-4">
          <Link href="/" className="flex items-center gap-2" aria-label={`${t.name} home`}>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-nv-primary text-nv-navy">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-[16px] font-extrabold tracking-tight text-nv-ink">
              {t.name}
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
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
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="grid h-9 w-9 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary/40"
              >
                <Avatar name={user?.full_name ?? user?.username ?? ""} size={32} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user?.full_name ?? user?.username ?? "Account"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push("/profile")}>
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleLogout} danger>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="md:pl-[72px] lg:pl-60">
        <main className="mx-auto min-h-[calc(100dvh-3.5rem)] w-full max-w-[1120px] px-4 pt-5 pb-nav md:pb-10 md:pt-6">
          {children}
        </main>
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
              { href: "/request-election", label: "Request an election" },
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
