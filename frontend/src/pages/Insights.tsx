import { useEffect, useState, useMemo } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Flame, Snowflake } from "lucide-react";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  getActivityHeatmap,
  getMonthlyTrends,
  getTempBins,
  getSetpointHistory,
  getThermostats,
  type HeatmapCell,
  type MonthlyTrend,
  type TempBin,
  type SetpointPoint,
  type ThermostatInfo,
} from "@/lib/api";

const CHART_GRID = "#1a1a1a";
const CHART_TICK = { fill: "#666", fontSize: 11, fontFamily: "JetBrains Mono" };
const TOOLTIP_STYLE = {
  backgroundColor: "#141414",
  border: "1px solid #242424",
  borderRadius: "10px",
  fontSize: 12,
  fontFamily: "DM Sans",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return "12am";
  if (i === 12) return "12pm";
  return i < 12 ? `${i}am` : `${i - 12}pm`;
});

// ── Heatmap cell color ────────────────────────────────────────────────────────
function cellColor(cell: HeatmapCell | undefined, mode: "heating" | "cooling" | "active"): string {
  if (!cell) return "#111";
  const pct = mode === "heating" ? cell.heating_pct : mode === "cooling" ? cell.cooling_pct : cell.active_pct;
  if (pct < 2) return "#111";

  if (mode === "heating") {
    // Orange gradient
    const intensity = Math.min(pct / 80, 1);
    const r = Math.round(80 + intensity * 169);
    const g = Math.round(20 + intensity * 96);
    const b = 10;
    return `rgb(${r},${g},${b})`;
  } else if (mode === "cooling") {
    // Sky blue gradient
    const intensity = Math.min(pct / 80, 1);
    const r = Math.round(10 + intensity * 28);
    const g = Math.round(40 + intensity * 145);
    const b = Math.round(80 + intensity * 118);
    return `rgb(${r},${g},${b})`;
  } else {
    // Purple gradient for combined
    const intensity = Math.min(pct / 80, 1);
    const r = Math.round(30 + intensity * 115);
    const g = Math.round(10 + intensity * 30);
    const b = Math.round(60 + intensity * 130);
    return `rgb(${r},${g},${b})`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Insights() {
  const [sensorId, setSensorId] = useState<number | undefined>();
  const [thermostats, setThermostats] = useState<ThermostatInfo[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [monthly, setMonthly] = useState<MonthlyTrend[]>([]);
  const [tempBins, setTempBins] = useState<TempBin[]>([]);
  const [setpoints, setSetpoints] = useState<SetpointPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<"heating" | "cooling" | "active">("active");

  useEffect(() => {
    getThermostats().then((ts) => {
      setThermostats(ts);
    }).catch(console.error);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [hm, mo, tb, sp] = await Promise.all([
        getActivityHeatmap(90, sensorId),
        getMonthlyTrends(24, sensorId),
        getTempBins(365, sensorId),
        getSetpointHistory(90, sensorId),
      ]);
      setHeatmap(hm);
      setMonthly(mo);
      setTempBins(tb);
      setSetpoints(sp);
    } catch (e) {
      console.error("Failed to load insights:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [sensorId]);

  // Build heatmap lookup: [dow][hour] = cell
  const heatmapGrid = useMemo(() => {
    const grid: (HeatmapCell | undefined)[][] = Array.from({ length: 7 }, () =>
      Array(24).fill(undefined),
    );
    for (const cell of heatmap) {
      if (cell.day_of_week >= 0 && cell.day_of_week < 7 && cell.hour >= 0 && cell.hour < 24) {
        grid[cell.day_of_week][cell.hour] = cell;
      }
    }
    return grid;
  }, [heatmap]);

  // Monthly chart: format month label
  const monthlyChart = useMemo(() =>
    monthly.map((m) => {
      const [year, mon] = m.month.split("-");
      const label = new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString([], {
        month: "short",
        year: "2-digit",
      });
      return { ...m, label };
    }),
    [monthly],
  );

  // Setpoint chart: downsampled step data
  const setpointChart = useMemo(() => {
    if (setpoints.length === 0) return [];
    const sampled = setpoints.length > 200
      ? setpoints.filter((_, i) => i % Math.ceil(setpoints.length / 200) === 0)
      : setpoints;
    return sampled.map((p) => ({
      time: new Date(p.timestamp).toLocaleDateString([], { month: "short", day: "numeric" }),
      heat: p.setpoint_heat,
      cool: p.setpoint_cool,
      _ts: p.timestamp,
    }));
  }, [setpoints]);

  // Summary stats from monthly data
  const totalHeatingHours = useMemo(() => monthly.reduce((s, m) => s + m.heating_hours, 0), [monthly]);
  const totalCoolingHours = useMemo(() => monthly.reduce((s, m) => s + m.cooling_hours, 0), [monthly]);
  const peakCoolingMonth = useMemo(() => {
    if (!monthly.length) return null;
    return monthly.reduce((a, b) => b.cooling_hours > a.cooling_hours ? b : a);
  }, [monthly]);
  const peakHeatingMonth = useMemo(() => {
    if (!monthly.length) return null;
    return monthly.reduce((a, b) => b.heating_hours > a.heating_hours ? b : a);
  }, [monthly]);

  const formatMonthLabel = (m: string) => {
    const [year, mon] = m.split("-");
    return new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString([], {
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Insights</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Patterns, trends & behavior analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          {thermostats.length > 1 && (
            <select
              value={sensorId ?? ""}
              onChange={(e) => setSensorId(e.target.value ? Number(e.target.value) : undefined)}
              className="rounded-lg border border-border/50 bg-secondary/50 px-3 py-1.5 font-mono text-[11px] text-foreground"
            >
              <option value="">All Thermostats</option>
              {thermostats.map((t) => (
                <option key={t.sensor_id} value={t.sensor_id}>
                  {t.zone_name || t.friendly_name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/50 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {monthly.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="glass-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Total Heating
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {Math.round(totalHeatingHours)}<span className="ml-1 text-sm font-normal text-muted-foreground">hrs</span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">across {monthly.length} months</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f97316]/10">
                <Flame className="h-[18px] w-[18px] text-[#f97316]" />
              </div>
            </div>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Total Cooling
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {Math.round(totalCoolingHours)}<span className="ml-1 text-sm font-normal text-muted-foreground">hrs</span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">across {monthly.length} months</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#38bdf8]/10">
                <Snowflake className="h-[18px] w-[18px] text-[#38bdf8]" />
              </div>
            </div>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Peak Heating
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {peakHeatingMonth ? Math.round(peakHeatingMonth.heating_hours) : "--"}<span className="ml-1 text-sm font-normal text-muted-foreground">hrs</span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {peakHeatingMonth ? formatMonthLabel(peakHeatingMonth.month) : ""}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fbbf24]/10">
                <TrendingUp className="h-[18px] w-[18px] text-[#fbbf24]" />
              </div>
            </div>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Peak Cooling
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
                  {peakCoolingMonth ? Math.round(peakCoolingMonth.cooling_hours) : "--"}<span className="ml-1 text-sm font-normal text-muted-foreground">hrs</span>
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {peakCoolingMonth ? formatMonthLabel(peakCoolingMonth.month) : ""}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#34d399]/10">
                <TrendingDown className="h-[18px] w-[18px] text-[#34d399]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Activity Heatmap ───────────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">
              Activity Heatmap
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              When does HVAC run? Hour of day × day of week (90-day window)
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border/40 bg-secondary/30 p-1">
            {(["heating", "cooling", "active"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setHeatmapMode(mode)}
                className={`rounded-md px-3 py-1 text-[11px] font-medium capitalize transition-all ${
                  heatmapMode === mode
                    ? mode === "heating"
                      ? "bg-[#f97316] text-white"
                      : mode === "cooling"
                        ? "bg-[#38bdf8] text-[#0a0a0a]"
                        : "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {heatmap.length > 0 ? (
          <div className="overflow-x-auto">
            {/* Hour labels */}
            <div className="flex" style={{ paddingLeft: "3.5rem" }}>
              {HOURS.map((label, h) => (
                <div
                  key={h}
                  className="flex-1 text-center font-mono text-[9px] text-muted-foreground/60"
                  style={{ minWidth: 28 }}
                >
                  {h % 3 === 0 ? label : ""}
                </div>
              ))}
            </div>
            {/* Grid rows */}
            {DAYS_SHORT.map((day, dow) => (
              <div key={dow} className="flex items-center gap-1 mt-1">
                <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground/70 pr-2">
                  {day}
                </span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = heatmapGrid[dow]?.[hour];
                  const pct = cell
                    ? heatmapMode === "heating"
                      ? cell.heating_pct
                      : heatmapMode === "cooling"
                        ? cell.cooling_pct
                        : cell.active_pct
                    : 0;
                  return (
                    <div
                      key={hour}
                      className="flex-1 rounded-sm transition-all duration-200 cursor-default"
                      style={{
                        minWidth: 28,
                        height: 28,
                        backgroundColor: cellColor(cell, heatmapMode),
                      }}
                      title={
                        cell
                          ? `${day} ${HOURS[hour]}: ${pct.toFixed(1)}% ${heatmapMode} (${cell.sample_count} samples)`
                          : `${day} ${HOURS[hour]}: no data`
                      }
                    />
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="mt-4 flex items-center gap-3">
              <span className="font-mono text-[10px] text-muted-foreground">Low</span>
              <div className="flex h-3 flex-1 rounded-full overflow-hidden max-w-48">
                {Array.from({ length: 20 }, (_, i) => {
                  const fakePct = (i / 20) * 80;
                  const fakeCell = { heating_pct: fakePct, cooling_pct: fakePct, active_pct: fakePct, day_of_week: 0, hour: 0, sample_count: 1 };
                  return (
                    <div
                      key={i}
                      className="flex-1 h-full"
                      style={{ backgroundColor: cellColor(fakeCell, heatmapMode) }}
                    />
                  );
                })}
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">High</span>
            </div>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {loading ? "Loading..." : "No HVAC data available"}
          </div>
        )}
      </Card>

      {/* ── Monthly Trends ────────────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-5">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Monthly Runtime Trends
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Heating & cooling hours per month with average outdoor temperature
          </p>
        </div>
        <div className="h-80">
          {monthlyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyChart} barSize={14} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="label"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  interval="preserveStartEnd"
                  angle={-35}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  yAxisId="hours"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  label={{ value: "Hours", angle: -90, position: "insideLeft", fill: "#666", fontSize: 11, fontFamily: "DM Sans" }}
                />
                <YAxis
                  yAxisId="temp"
                  orientation="right"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  tickFormatter={(v) => `${v}°`}
                  label={{ value: "Avg Outdoor (°F)", angle: 90, position: "insideRight", fill: "#666", fontSize: 11, fontFamily: "DM Sans", dx: 16 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => {
                    if (name === "Avg Temp") return [`${value}°F`, name];
                    return [`${value} hrs`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }} />
                <Bar yAxisId="hours" dataKey="heating_hours" name="Heating" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="hours" dataKey="cooling_hours" name="Cooling" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="avg_outdoor_temp"
                  name="Avg Temp"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={{ fill: "#fbbf24", r: 3 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No monthly data available"}
            </div>
          )}
        </div>
      </Card>

      {/* ── Temperature Sensitivity ───────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-5">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Temperature Sensitivity
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            How much did HVAC run at each outdoor temperature range? (last 365 days)
          </p>
        </div>
        <div className="h-72">
          {tempBins.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={tempBins}
                layout="vertical"
                barSize={18}
                margin={{ left: 20, right: 20, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                <XAxis
                  type="number"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  label={{ value: "Hours", position: "insideBottom", fill: "#666", fontSize: 11, fontFamily: "DM Sans", offset: -4 }}
                />
                <YAxis
                  type="category"
                  dataKey="range_label"
                  tick={{ ...CHART_TICK, fontSize: 10 }}
                  stroke={CHART_GRID}
                  width={72}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [`${value} hrs`, name]}
                  labelFormatter={(label) => {
                    const bin = tempBins.find((b) => b.range_label === label);
                    return bin ? `${label} · ${bin.day_count} days` : label;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }} />
                <ReferenceLine x={0} stroke="#333" />
                <Bar dataKey="heating_hours" name="Heating" fill="#f97316" radius={[0, 3, 3, 0]} />
                <Bar dataKey="cooling_hours" name="Cooling" fill="#38bdf8" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No temperature bin data available"}
            </div>
          )}
        </div>
      </Card>

      {/* ── Setpoint History ──────────────────────────────────────────────────── */}
      {setpointChart.length > 1 && (
        <Card className="p-6">
          <div className="mb-5">
            <h2 className="font-display text-sm font-semibold text-foreground">
              Setpoint History
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              When and how were thermostat setpoints adjusted? (90-day window)
            </p>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={setpointChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="time"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  tickFormatter={(v) => `${v}°`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [`${value}°F`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }} />
                <Line
                  type="stepAfter"
                  dataKey="heat"
                  name="Heat Setpoint"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="stepAfter"
                  dataKey="cool"
                  name="Cool Setpoint"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {setpoints.length} setpoint events recorded in this window
          </p>
        </Card>
      )}
    </div>
  );
}
