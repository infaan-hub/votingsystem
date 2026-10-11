"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Compass,
  Home,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Search,
  Shield,
  Sun,
  User,
  Vote,
  X,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { CommandPalette } from "@/src/components/command-palette";
import { Sidebar, type SidebarLink } from "@/src/components/sidebar";
import { BottomNav, DEFAULT_BOTTOM_NAV, type BottomNavItem } from "@/src/components/bottom-nav";
import { Button } from "@/src/components/ui/button";
import tenant, { t } from "@/config/tenant";
import { cn } from "@/src/lib/utils";

/** Phone tabs. `Vote` is the third slot: it opens the active ballot if one
 *  exists and otherwise falls back to the live feed. */
const PHONE_NAV: BottomNavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/feed", label: "Vote", icon: Vote },
  { href: "/profile", label: "Profile", icon: User },
];

const SIDEBAR_LINKS: SidebarLink[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/feed", label: "Live Feed", icon: BarChart3 },
  { href: "/elections", label: "Elections", icon: Vote },
  { href: "/profile", label: "Profile", icon: User },
];

/** Overflow menu for phones; icons are components so they render uniformly. */
const MENU_LINKS: Array<{ href: string; label: string; icon: typeof Home }> = [
  { href: "/elections", label: "Elections", icon: Vote },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/categories", label: "Categories", icon: Compass },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, handleLogout, theme, toggleTheme } = useApp();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  /** Splash/login/register are immersive and own the whole viewport. */
  const immersive = /^\/(login|register|vote\/[^/]+\/thank-you)/.test(pathname);

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

  const sidebarLinks = isAdmin
    ? [...SIDEBAR_LINKS, { href: "/admin", label: "Administration", icon: Shield }]
    : SIDEBAR_LINKS;

  if (immersive) {
    return (
      <div className="app-shell">
        {children}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        links={sidebarLinks}
        brand={
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-nv-primary text-white">
              <Vote className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="hidden text-[15px] font-extrabold tracking-tight text-nv-ink lg:inline">
              {t.name}
            </span>
          </Link>
        }
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] leading-tight text-nv-muted">
              {tenant.authority.name}
            </span>
            <Button
              variant="subtle"
              size="dense"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        }
      />

      {/* Top bar — phones and tablets only; desktop uses the sidebar. */}
      <header className="sticky top-0 z-30 border-b border-nv-line bg-white/90 backdrop-blur dark:bg-[#0F1020]/90 lg:hidden">
        <div className="flex h-14 items-center gap-2 px-safe px-4">
          <Link href="/" className="flex items-center gap-2" aria-label={`${t.name} home`}>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-nv-primary text-white">
              <Vote className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-[16px] font-extrabold tracking-tight text-nv-ink">
              {t.name}
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="subtle"
              size="dense"
              className="hidden sm:inline-flex"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="subtle"
              size="dense"
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
              <Button variant="subtle" size="dense" onClick={handleLogout} aria-label="Sign out">
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button asChild size="dense">
                <Link href="/login">
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  Sign in
                </Link>
              </Button>
            )}
            <Button
              variant="subtle"
              size="dense"
              className="md:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Menu className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {menuOpen ? (
          <nav aria-label="Menu" className="border-t border-nv-line px-4 pb-3 pt-2 md:hidden">
            <ul className="flex flex-col">
              {MENU_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14px] font-semibold",
                      pathname.startsWith(item.href)
                        ? "bg-nv-primary-100 text-nv-primary-600"
                        : "text-nv-muted",
                    )}
                  >
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      {/* Main column: full width on phones, rail offset on tablet, sidebar
          offset plus a right panel from lg up. */}
      <div className="md:pl-[72px] lg:pl-60">
        <main className="mx-auto min-h-[calc(100dvh-3.5rem)] w-full max-w-[960px] px-4 pt-4 pb-nav lg:pb-10">
          {children}
        </main>
      </div>

      <BottomNav items={PHONE_NAV} />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export { DEFAULT_BOTTOM_NAV };