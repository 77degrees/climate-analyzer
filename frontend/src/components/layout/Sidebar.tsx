import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  History,
  Gauge,
  Settings,
  Thermometer,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/sensors", icon: Radio, label: "Sensors" },
  { to: "/history", icon: History, label: "History" },
  { to: "/performance", icon: Gauge, label: "Performance" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[220px] flex-col border-r border-border/50 bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
          <Thermometer className="h-[18px] w-[18px] text-primary" />
        </div>
        <div>
          <h1 className="font-display text-[13px] font-bold tracking-tight text-foreground">
            Climate
          </h1>
          <p className="font-display text-[10px] font-medium tracking-widest uppercase text-muted-foreground">
            Analyzer
          </p>
        </div>
      </div>

      {/* Divider with subtle gradient */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 pt-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                isActive
                  ? "nav-link-active bg-primary/[0.08] text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )
            }
          >
            <Icon className="h-[16px] w-[16px] transition-transform duration-200 group-hover:scale-110" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="px-5 py-4">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground/60">
          v1.0 &middot; 77&deg;
        </p>
      </div>
    </aside>
  );
}
