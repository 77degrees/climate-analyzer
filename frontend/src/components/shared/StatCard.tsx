import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: "default" | "success" | "warning" | "destructive" | "primary";
  icon?: LucideIcon;
  className?: string;
  borderColor?: string;
}

const subtitleColorMap: Record<string, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-brand",
  destructive: "text-destructive",
  primary: "text-primary",
};

export function StatCard({
  title,
  value,
  subtitle,
  subtitleColor = "default",
  icon: Icon,
  className,
  borderColor,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "glass-card-hover relative overflow-hidden p-5",
        className,
      )}
    >
      {/* Top accent line */}
      {borderColor && (
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, ${borderColor}00, ${borderColor}, ${borderColor}00)`,
          }}
        />
      )}

      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </p>
          <p className="font-mono text-[28px] font-semibold leading-none tracking-tight text-foreground value-glow">
            {value}
          </p>
          {subtitle && (
            <p
              className={cn(
                "text-[11px] font-medium",
                subtitleColorMap[subtitleColor],
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{
              backgroundColor: borderColor ? `${borderColor}12` : undefined,
            }}
          >
            <Icon
              className="h-[18px] w-[18px]"
              style={{ color: borderColor || "hsl(var(--primary))" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
