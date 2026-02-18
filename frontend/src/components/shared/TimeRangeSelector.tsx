import { cn } from "@/lib/utils";

interface TimeRangeSelectorProps {
  value: number;
  onChange: (hours: number) => void;
}

const ranges = [
  { label: "2h", hours: 2 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
  { label: "90d", hours: 2160 },
  { label: "1y", hours: 8760 },
];

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-border/50 bg-secondary/50 p-1">
      {ranges.map((r) => (
        <button
          key={r.hours}
          onClick={() => onChange(r.hours)}
          className={cn(
            "rounded-md px-2.5 py-1.5 font-mono text-[11px] font-medium transition-all duration-200",
            value === r.hours
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
