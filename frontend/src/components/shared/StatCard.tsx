import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
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
    <Card
      className={cn(
        "relative overflow-hidden p-5 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5",
        className,
      )}
    >
      {borderColor && (
        <div
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ backgroundColor: borderColor }}
        />
      )}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p
              className={cn(
                "mt-1 text-xs font-medium",
                subtitleColorMap[subtitleColor],
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-4.5 w-4.5 text-primary" />
          </div>
        )}
      </div>
    </Card>
  );
}
