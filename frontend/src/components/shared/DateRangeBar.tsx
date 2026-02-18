import { useState } from "react";
import { cn } from "@/lib/utils";
import { CalendarDays, X } from "lucide-react";

export type DateRange =
  | { mode: "preset"; hours: number }
  | { mode: "custom"; start: string; end: string };

interface DateRangeBarProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS = [
  { label: "2h", hours: 2 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
  { label: "90d", hours: 2160 },
  { label: "1y", hours: 8760 },
];

export function DateRangeBar({ value, onChange }: DateRangeBarProps) {
  const [customOpen, setCustomOpen] = useState(value.mode === "custom");
  const [startVal, setStartVal] = useState(
    value.mode === "custom" ? value.start.slice(0, 10) : "",
  );
  const [endVal, setEndVal] = useState(
    value.mode === "custom" ? value.end.slice(0, 10) : "",
  );

  const applyCustom = () => {
    if (!startVal || !endVal) return;
    onChange({
      mode: "custom",
      start: new Date(startVal + "T00:00:00").toISOString(),
      end: new Date(endVal + "T23:59:59").toISOString(),
    });
  };

  const clearCustom = () => {
    setCustomOpen(false);
    setStartVal("");
    setEndVal("");
    onChange({ mode: "preset", hours: 24 });
  };

  const isCustomActive = value.mode === "custom";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Preset buttons */}
      <div className="flex gap-0.5 rounded-lg border border-border/50 bg-secondary/50 p-1">
        {PRESETS.map((r) => (
          <button
            key={r.hours}
            onClick={() => {
              setCustomOpen(false);
              onChange({ mode: "preset", hours: r.hours });
            }}
            className={cn(
              "rounded-md px-2.5 py-1.5 font-mono text-[11px] font-medium transition-all duration-200",
              !isCustomActive && value.mode === "preset" && value.hours === r.hours
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            {r.label}
          </button>
        ))}
        {/* Custom toggle */}
        <button
          onClick={() => setCustomOpen((v) => !v)}
          title="Custom date range"
          className={cn(
            "rounded-md px-2.5 py-1.5 font-mono text-[11px] font-medium transition-all duration-200 flex items-center gap-1",
            isCustomActive || customOpen
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          <CalendarDays className="h-3 w-3" />
          {isCustomActive ? "Custom" : "…"}
        </button>
      </div>

      {/* Custom date inputs */}
      {customOpen && (
        <div className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-1.5">
          <input
            type="date"
            value={startVal}
            onChange={(e) => setStartVal(e.target.value)}
            className="rounded bg-transparent font-mono text-[11px] text-foreground outline-none [color-scheme:dark] w-[130px]"
            max={endVal || undefined}
          />
          <span className="text-muted-foreground text-[11px]">→</span>
          <input
            type="date"
            value={endVal}
            onChange={(e) => setEndVal(e.target.value)}
            className="rounded bg-transparent font-mono text-[11px] text-foreground outline-none [color-scheme:dark] w-[130px]"
            min={startVal || undefined}
            max={new Date().toISOString().slice(0, 10)}
          />
          <button
            onClick={applyCustom}
            disabled={!startVal || !endVal}
            className="rounded-md bg-primary/20 px-2.5 py-1 font-mono text-[10px] font-semibold text-primary transition-opacity hover:bg-primary/30 disabled:opacity-30"
          >
            Go
          </button>
          {isCustomActive && (
            <button
              onClick={clearCustom}
              className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Clear custom range"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Active custom range label */}
      {isCustomActive && !customOpen && (
        <div className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5">
          <span className="font-mono text-[11px] text-primary">
            {value.start.slice(0, 10)} → {value.end.slice(0, 10)}
          </span>
          <button onClick={clearCustom} className="text-primary/60 hover:text-primary transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
