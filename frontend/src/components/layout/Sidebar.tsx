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
    <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
          <Thermometer className="h-4.5 w-4.5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-sm font-semibold text-foreground">
            Climate Analyzer
          </h1>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active/10 text-sidebar-active"
                  : "text-sidebar-foreground/70 hover:bg-secondary hover:text-sidebar-foreground",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <p className="text-[10px] text-muted-foreground">
          Climate Analyzer v1.0
        </p>
      </div>
    </aside>
  );
}
