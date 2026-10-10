"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  FolderTree,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Search,
  Shield,
  Sun,
  Tags,
  Vote,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Button } from "@/src/components/ui/button";
import { CommandPalette } from "@/src/components/command-palette";
import { cn } from "@/src/lib/utils";

type NavItem = { href: string; label: string; icon: typeof Home; primary?: boolean };

const BASE_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home, primary: true },
  { href: "/elections", label: "Elections", icon: Vote, primary: true },
  { href: "/categories", label: "Categories", icon: Tags, primary: true },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, handleLogout, theme, toggleTheme } = useApp();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const isAdmin = user?.role === "admin";

  const navItems = useMemo(() => {
    const items = [...BASE_NAV];
    if (isAdmin) items.push({ href: "/admin", label: "Admin", icon: Shield, primary: true });
    return items;
  }, [isAdmin]);

  const desktopNav = useMemo(() => {
    const items = [...navItems];
    if (isAdmin) {
      items.push({ href: "/admin/categories", label: "Categories admin", icon: FolderTree });
      items.push({ href: "/admin?view=users", label: "Users", icon: BarChart3 });
    }
    return items;
  }, [navItems, isAdmin]);

  // Keyboard shortcuts: ⌘K / Ctrl+K opens the palette, "/" focuses search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      {/* ---------------- Top bar ---------------- */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-safe pl-4 pr-4 sm:h-16">
          <Link
            href="/"
            className="flex items-center gap-2 text-display text-fluid-lg"
            aria-label="Election Hub home"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Vote className="h-4 w-4" aria-hidden="true" />
            </span>
            Election<span className="text-primary">Hub</span>
          </Link>

          {/* Desktop inline nav */}
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
            {desktopNav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href.split("?")[0]);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="touch"
              className="hidden sm:inline-flex"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search elections and categories"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="hidden text-muted-foreground md:inline">Search</span>
              <kbd className="ml-1 hidden rounded border bg-muted px-1.5 py-0.5 text-[0.7rem] text-muted-foreground md:inline">
                ⌘K
              </kbd>
            </Button>

            <Button
              variant="ghost"
              size="touch"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>

            {user ? (
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/login">
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Sign in
                </Link>
              </Button>
            )}

            <Button
              variant="ghost"
              size="touch"
              className="lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Mobile / tablet drawer */}
        {menuOpen && (
          <nav
            className="border-t bg-background px-safe px-4 pb-3 pt-2 lg:hidden"
            aria-label="Mobile"
          >
            <ul className="flex flex-col">
              {desktopNav.map((item) => {
                const active = pathname.startsWith(item.href.split("?")[0]);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>

      {/* ---------------- Content ---------------- */}
      <main className="mx-auto max-w-7xl px-4 pt-6 lg:px-8 lg:pt-8">{children}</main>

      {/* ---------------- Bottom navigation (mobile) ----------------
          Thumb-reachable on iOS and Android; clears the home indicator via
          pb-safe, and the content above is padded by pb-nav. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-safe backdrop-blur lg:hidden"
        aria-label="Primary"
      >
        <ul className="mx-auto flex max-w-7xl items-stretch justify-around pl-safe pr-safe">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.7rem] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon
                    className={cn("h-5 w-5", active && "stroke-[2.5]")}
                    aria-hidden="true"
                  />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom spacer so the fixed nav never covers page content. */}
      <div className="pb-nav lg:hidden" aria-hidden="true" />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {!user ? (
        <p className="mx-auto max-w-7xl px-4 pb-10 text-center text-xs text-muted-foreground lg:px-8">
          <Building2 className="mr-1 inline h-3 w-3" aria-hidden="true" />
          Configurable elections for organizations, associations, companies,
          communities, unions, clubs, and schools.
        </p>
      ) : null}
    </div>
  );
}