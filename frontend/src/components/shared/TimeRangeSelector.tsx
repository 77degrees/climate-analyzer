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
    <div className="flex gap-1 rounded-lg border border-border bg-secondary/50 p-1">
      {ranges.map((r) => (
        <button
          key={r.hours}
          onClick={() => onChange(r.hours)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === r.hours
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
