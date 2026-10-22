import { CalendarDays, ChartColumn, ClipboardList, Dumbbell, History, LayoutDashboard, UserRound, type LucideIcon } from "lucide-react";

import type { Dict } from "@/lib/i18n";

export interface NavItem {
  href: string;
  /** Key in the `nav` dictionary section. */
  key: keyof Dict["nav"];
  icon: LucideIcon;
}

export const MAIN_NAV: NavItem[] = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/calendar", key: "calendar", icon: CalendarDays },
  { href: "/stats", key: "stats", icon: ChartColumn },
  { href: "/profile", key: "profile", icon: UserRound },
];

export const LIBRARY_NAV: NavItem[] = [
  { href: "/templates", key: "templates", icon: ClipboardList },
  { href: "/exercises", key: "exercises", icon: Dumbbell },
  { href: "/history", key: "history", icon: History },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
