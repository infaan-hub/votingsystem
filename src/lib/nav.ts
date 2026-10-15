import {
  BarChart3,
  Contact,
  FileClock,
  LayoutDashboard,
  Megaphone,
  PieChart,
  Settings2,
  ShieldCheck,
  Tags,
  UserRound,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact-match highlighting (used for `/`). */
  exact?: boolean;
  /** When set, the bottom nav renders this image instead of the icon. */
  avatarSrc?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Landing / marketing navigation, shown when nobody is signed in. */
export const PUBLIC_NAV: NavItem[] = [
  { href: "/elections", label: "Elections", icon: Vote },
  { href: "/compaigns", label: "Campaigns", icon: Megaphone },
  { href: "/results", label: "Results", icon: PieChart },
  { href: "/contact", label: "Contact", icon: Contact },
];

/** Normal voter / student / staff navigation. */
export const VOTER_NAV: NavGroup[] = [
  {
    label: "Voting",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/elections", label: "Elections", icon: Vote },
      { href: "/compaigns", label: "Campaigns", icon: Megaphone },
      { href: "/results", label: "Results", icon: PieChart },
    ],
  },
  {
    label: "Participation",
    items: [{ href: "/contact", label: "Contact us", icon: Contact }],
  },
  {
    label: "Account",
    items: [{ href: "/profile", label: "Profile", icon: UserRound }],
  },
];

/** Election-officer navigation. */
export const OFFICER_NAV: NavGroup[] = [
  {
    label: "Officer desk",
    items: [
      { href: "/officer/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/officer/election", label: "My election", icon: Vote },
      { href: "/officer/compaign", label: "Campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/officer/management", label: "Management", icon: Settings2 },
      { href: "/officer/results", label: "Results", icon: PieChart },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/profile", label: "Profile", icon: UserRound }],
  },
];

/** Administrator navigation. */
export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Administration",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/elections", label: "Elections", icon: Vote },
      { href: "/admin/compaigns", label: "Campaigns", icon: Megaphone },
      { href: "/admin/votes", label: "Votes", icon: BarChart3 },
      { href: "/admin/results", label: "Results", icon: PieChart },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/add-election-officer", label: "Election officers", icon: ShieldCheck },
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    label: "Integrity",
    items: [
      { href: "/admin/categories", label: "Categories", icon: Tags },
      { href: "/admin/audit-logs", label: "Audit logs", icon: FileClock },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/admin/profile", label: "Profile", icon: UserRound }],
  },
];

export type ShellRole = "public" | "voter" | "officer" | "admin";

export function shellRoleFor(role: string | null | undefined): ShellRole {
  if (role === "admin") return "admin";
  if (role === "officer") return "officer";
  if (role) return "voter";
  return "public";
}

/** Phone bottom-navigation items per role (max five). */
export function bottomNavFor(shell: ShellRole): NavItem[] {
  switch (shell) {
    case "admin":
      return [
        { href: "/admin/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
        { href: "/admin/elections", label: "Elections", icon: Vote },
        { href: "/admin/users", label: "Users", icon: Users },
        { href: "/admin/profile", label: "Profile", icon: UserRound },
      ];
    case "officer":
      return [
        { href: "/officer/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
        { href: "/officer/election", label: "Election", icon: Vote },
        { href: "/officer/compaign", label: "Campaigns", icon: Megaphone },
        { href: "/officer/results", label: "Results", icon: PieChart },
        { href: "/profile", label: "Profile", icon: UserRound },
      ];
    case "voter":
      return [
        { href: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
        { href: "/elections", label: "Elections", icon: Vote },
        { href: "/compaigns", label: "Campaigns", icon: Megaphone },
        { href: "/results", label: "Results", icon: PieChart },
        { href: "/profile", label: "Profile", icon: UserRound },
      ];
    default:
      return [
        { href: "/", label: "Home", icon: LayoutDashboard, exact: true },
        { href: "/elections", label: "Elections", icon: Vote },
        { href: "/compaigns", label: "Campaigns", icon: Megaphone },
        { href: "/results", label: "Results", icon: PieChart },
        { href: "/contact", label: "Contact", icon: Contact },
      ];
  }
}

export function navGroupsFor(shell: ShellRole): NavGroup[] {
  switch (shell) {
    case "admin":
      return ADMIN_NAV;
    case "officer":
      return OFFICER_NAV;
    case "voter":
      return VOTER_NAV;
    default:
      return [{ label: "Explore", items: PUBLIC_NAV }];
  }
}

/** Human label for the signed-in role, shown in the sidebar footer. */
export function roleLabel(role: string | null | undefined): string | null {
  switch (role) {
    case "admin":
      return "Administrator";
    case "officer":
      return "Election officer";
    case "voter":
      return "Voter";
    default:
      return null;
  }
}
