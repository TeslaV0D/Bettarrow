import { CalendarDays, ChartColumn, ClipboardList, Dumbbell, History, LayoutDashboard, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Kalender", icon: CalendarDays },
  { href: "/stats", label: "Statistik", icon: ChartColumn },
  { href: "/profile", label: "Profil", icon: UserRound },
];

export const LIBRARY_NAV: NavItem[] = [
  { href: "/templates", label: "Vorlagen", icon: ClipboardList },
  { href: "/exercises", label: "Übungen", icon: Dumbbell },
  { href: "/history", label: "Verlauf", icon: History },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
