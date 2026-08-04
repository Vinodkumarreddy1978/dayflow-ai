import {
  BarChart3,
  CalendarDays,
  FolderTree,
  LayoutDashboard,
  Search,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

export interface NavItem {
  /** Typed against the real route tree, so a broken link fails the build. */
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile tab bar. Limited to four, plus the central add button. */
  primary?: boolean;
}

/**
 * Navigation is flat: nine destinations, no nested menus.
 *
 * A hierarchy would be tidier on paper, but every level of nesting is a place
 * for a user to lose something. Nine items fit in a sidebar without scrolling,
 * so the tidiness buys nothing. DF-IA-021.
 */
export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: LayoutDashboard, primary: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, primary: true },
  { href: "/analytics", label: "Analytics", icon: BarChart3, primary: true },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings, primary: true },
];

export const primaryNavItems = navItems.filter((item) => item.primary);

/**
 * Whether a nav item is the current destination.
 *
 * `/calendar` must stay highlighted on `/calendar/2026-08-04`, but `/` must not
 * match everything, hence the exact check for the root.
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
