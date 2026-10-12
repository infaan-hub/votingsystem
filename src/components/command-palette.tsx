"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  FileClock,
  FileText,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  PieChart,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  Vote,
  X,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/lib/utils";

type Action = {
  id: string;
  label: string;
  group: string;
  href: string;
  icon: typeof Vote;
  keywords?: string;
};

const STATIC_ACTIONS: Action[] = [
  { id: "nav-home", label: "Home", group: "Navigate", href: "/", icon: LayoutDashboard },
  { id: "nav-elections", label: "Browse elections", group: "Navigate", href: "/elections", icon: Vote },
  { id: "nav-campaigns", label: "Browse campaigns", group: "Navigate", href: "/compaigns", icon: Megaphone },
  { id: "nav-results", label: "Published results", group: "Navigate", href: "/results", icon: PieChart },
  { id: "nav-contact", label: "Contact support", group: "Navigate", href: "/contact", icon: MessagesSquare },
  { id: "nav-dashboard", label: "My dashboard", group: "Navigate", href: "/dashboard", icon: LayoutDashboard },
  { id: "nav-request", label: "Request an election", group: "Navigate", href: "/request-election", icon: FileText },
  { id: "nav-profile", label: "My profile", group: "Account", href: "/profile", icon: UserRound },
  { id: "nav-login", label: "Sign in", group: "Account", href: "/login", icon: Users },
  { id: "admin-home", label: "Admin dashboard", group: "Admin", href: "/admin/dashboard", icon: LayoutDashboard },
  { id: "admin-requests", label: "Review election requests", group: "Admin", href: "/admin/election-requests", icon: Inbox },
  { id: "admin-elections", label: "Manage elections", group: "Admin", href: "/admin/elections", icon: Vote },
  { id: "admin-campaigns", label: "Review campaigns", group: "Admin", href: "/admin/compaigns", icon: Megaphone },
  { id: "admin-votes", label: "Vote aggregates", group: "Admin", href: "/admin/votes", icon: BarChart3 },
  { id: "admin-results", label: "Publish results", group: "Admin", href: "/admin/results", icon: PieChart },
  { id: "admin-officers", label: "Add election officers", group: "Admin", href: "/admin/add-election-officer", icon: ShieldCheck },
  { id: "admin-users", label: "Manage users", group: "Admin", href: "/admin/users", icon: Users },
  { id: "admin-audit", label: "Audit logs", group: "Admin", href: "/admin/audit-logs", icon: FileClock },
  { id: "officer-home", label: "Officer dashboard", group: "Officer", href: "/officer/dashboard", icon: LayoutDashboard },
  { id: "officer-election", label: "Run my election", group: "Officer", href: "/officer/election", icon: Vote },
  { id: "officer-campaigns", label: "Officer campaigns", group: "Officer", href: "/officer/compaign", icon: Megaphone },
  { id: "officer-management", label: "Election management", group: "Officer", href: "/officer/management", icon: Settings2 },
  { id: "officer-results", label: "Officer results", group: "Officer", href: "/officer/results", icon: PieChart },
];

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * ⌘K / Ctrl+K command palette. Searches navigation actions plus the live
 * elections and categories the user can already see — no privileged data is
 * fetched beyond the public lists.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { user } = useApp();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === "admin";
  const isOfficer = user?.role === "officer";

  const actions = useMemo(() => {
    const allowed = STATIC_ACTIONS.filter((action) => {
      if (action.group === "Admin") return isAdmin;
      if (action.group === "Officer") return isOfficer || isAdmin;
      if (action.id === "nav-login") return !user;
      return true;
    });
    if (!query.trim()) return allowed;
    const needle = query.trim().toLowerCase();
    return allowed.filter((action) =>
      `${action.label} ${action.keywords ?? ""} ${action.group}`.toLowerCase().includes(needle),
    );
  }, [query, isAdmin, isOfficer, user]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      // Focus after the dialog paints so the caret lands reliably on iOS.
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((c) => Math.min(c + 1, Math.max(0, actions.length - 1)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      }
      if (event.key === "Enter" && actions[cursor]) {
        event.preventDefault();
        router.push(actions[cursor].href);
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, actions, cursor, router, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-float">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions and pages…"
            className="h-12 border-0 shadow-none focus-visible:ring-0"
            aria-label="Search actions"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            aria-label="Close palette"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <ul className="max-h-72 overflow-y-auto p-2">
          {actions.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching actions.
            </li>
          ) : (
            actions.map((action, index) => (
              <li key={action.id}>
                <button
                  type="button"
                  onClick={() => {
                    router.push(action.href);
                    onOpenChange(false);
                  }}
                  onMouseEnter={() => setCursor(index)}
                  className={cn(
                    "flex w-full min-h-11 items-center gap-3 rounded-md px-3 text-left text-sm",
                    index === cursor ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  <action.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 truncate">{action.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{action.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}