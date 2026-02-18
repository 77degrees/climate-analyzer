import { useEffect, useState, useMemo } from "react";
import {
  RefreshCw,
  Flame,
  Snowflake,
  AlertTriangle,
  ThermometerSun,
  Clock,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Wind,
  Minus,
} from "lucide-react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  getAcStruggle,
  getActivityHeatmap,
  getThermostats,
  getZoneThermalPerf,
  type AcStruggleDay,
  type HeatmapCell,
  type ThermostatInfo,
  type ZoneThermalPerf,
} from "@/lib/api";

// ── Color helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score < 10) return "#22c55e";   // green — AC winning
  if (score < 25) return "#84cc16";   // lime — slight
  if (score < 45) return "#f59e0b";   // amber — moderate
  if (score < 65) return "#f97316";   // orange — significant
  return "#ef4444";                   // red — severe
}

function scoreLabel(score: number): string {
  if (score < 10) return "Normal";
  if (score < 25) return "Slight";
  if (score < 45) return "Moderate";
  if (score < 65) return "Significant";
  return "Severe";
}

function overshootColor(ov: number): string {
  if (ov <= 0) return "#22c55e";
  if (ov < 1) return "#84cc16";
  if (ov < 2) return "#f59e0b";
  if (ov < 3.5) return "#f97316";
  return "#ef4444";
}

// ── Heatmap color ─────────────────────────────────────────────────────────────

function heatmapCellColor(cell: HeatmapCell | undefined): string {
  if (!cell) return "#111";
  const pct = cell.active_pct;
  if (pct < 2) return "#111";
  const intensity = Math.min(pct / 80, 1);
  const r = Math.round(10 + intensity * 28);
  const g = Math.round(40 + intensity * 145);
  const b = Math.round(80 + intensity * 118);
  return `rgb(${r},${g},${b})`;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_GRID = "#1a1a1a";
const CHART_TICK = { fill: "#555", fontSize: 11, fontFamily: "JetBrains Mono" };
const TOOLTIP_STYLE = {
  backgroundColor: "#0e0e0e",
  border: "1px solid #252525",
  borderRadius: "10px",
  fontSize: 12,
  fontFamily: "DM Sans",
  boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
};

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return "12a";
  if (i === 12) return "12p";
  return i < 12 ? `${i}a` : `${i - 12}p`;
});

const DAY_OPTIONS = [
  { label: "90d", value: 90 },
  { label: "180d", value: 180 },
  { label: "1yr", value: 365 },
  { label: "2yr", value: 730 },
];

// ── Custom tooltip for scatter ────────────────────────────────────────────────

const ScatterTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as AcStruggleDay & { _date: string };
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2.5">
      <p className="font-mono text-[11px] font-semibold text-foreground mb-1">{d._date}</p>
      <div className="space-y-0.5">
        <p className="text-[11px] text-muted-foreground">
          Outdoor high: <span className="text-[#fbbf24] font-mono">{d.outdoor_high ?? "—"}°F</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          Max above setpoint: <span style={{ color: overshootColor(d.max_overshoot) }} className="font-mono">
            {d.max_overshoot > 0 ? "+" : ""}{d.max_overshoot.toFixed(1)}°F
          </span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          AC running: <span className="text-foreground font-mono">{d.hours_cooling}h</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          Struggle score: <span style={{ color: scoreColor(d.struggle_score) }} className="font-mono font-semibold">
            {d.struggle_score}
          </span>
        </p>
      </div>
    </div>
  );
};

// ── Timeline tooltip ──────────────────────────────────────────────────────────

const TimelineTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const score = payload.find((p: any) => p.dataKey === "struggle_score");
  const temp = payload.find((p: any) => p.dataKey === "outdoor_high");
  const ov = payload.find((p: any) => p.dataKey === "max_overshoot");
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2.5">
      <p className="font-mono text-[11px] font-semibold text-foreground mb-1">{label}</p>
      <div className="space-y-0.5">
        {temp?.value != null && (
          <p className="text-[11px] text-muted-foreground">
            Outdoor high: <span className="text-[#fbbf24] font-mono">{temp.value}°F</span>
          </p>
        )}
        {ov && (
          <p className="text-[11px] text-muted-foreground">
            Above setpoint: <span style={{ color: overshootColor(ov.value) }} className="font-mono">
              {ov.value > 0 ? "+" : ""}{ov.value.toFixed(1)}°F
            </span>
          </p>
        )}
        {score && (
          <p className="text-[11px] text-muted-foreground">
            Score: <span style={{ color: scoreColor(score.value) }} className="font-mono font-semibold">
              {score.value} — {scoreLabel(score.value)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
};

// ── Zone Perf Card ────────────────────────────────────────────────────────────

function ZonePerfCard({ zone, mode }: { zone: ZoneThermalPerf; mode: "hot" | "cold" }) {
  const delta = mode === "hot" ? zone.avg_delta_hot : zone.avg_delta_cold;
  const avgTemp = mode === "hot" ? zone.avg_temp_hot_days : zone.avg_temp_cold_days;
  const dayCount = mode === "hot" ? zone.hot_days_count : zone.cold_days_count;

  // Severity: higher delta = struggles more
  const severity = delta == null ? 0 : Math.min(Math.abs(delta) / 8, 1);
  const severityColor =
    mode === "hot"
      ? `rgba(249,115,22,${0.1 + severity * 0.4})`   // orange
      : `rgba(56,189,248,${0.1 + severity * 0.4})`;    // blue

  const trendIcon =
    zone.weekly_trend == null ? null :
    zone.weekly_trend > 0.3 ? <TrendingUp className="h-3 w-3 text-[#ef4444]" /> :
    zone.weekly_trend < -0.3 ? <TrendingDown className="h-3 w-3 text-[#22c55e]" /> :
    <Minus className="h-3 w-3 text-muted-foreground/50" />;

  const trendLabel =
    zone.weekly_trend == null ? null :
    zone.weekly_trend > 0.3 ? `+${zone.weekly_trend.toFixed(1)}°F vs last wk` :
    zone.weekly_trend < -0.3 ? `${zone.weekly_trend.toFixed(1)}°F vs last wk` :
    "Stable vs last wk";

  return (
    <div
      className="relative rounded-xl border border-border/40 p-4 transition-all hover:border-border/70"
      style={{ backgroundColor: severityColor }}
    >
      {/* Zone header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: zone.zone_color }}
          />
          <span className="font-display text-sm font-semibold text-foreground truncate">{zone.zone_name}</span>
        </div>
        {zone.has_portable_ac && (
          <span className="shrink-0 rounded-full border border-[#34d399]/30 bg-[#34d399]/10 px-2 py-0.5 font-mono text-[9px] font-bold text-[#34d399] uppercase tracking-wider flex items-center gap-1">
            <Wind className="h-2.5 w-2.5" />Portable AC
          </span>
        )}
      </div>

      {/* Main metrics */}
      <div className="flex items-end gap-4 mb-3">
        <div>
          <p className="font-mono text-[10px] text-muted-foreground">Avg indoor</p>
          <p className="font-mono text-xl font-bold text-foreground">
            {avgTemp != null ? `${avgTemp}°F` : "—"}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {mode === "hot" ? "Above outdoor" : "Below outdoor"}
          </p>
          <p
            className="font-mono text-lg font-semibold"
            style={{ color: mode === "hot" ? "#f97316" : "#38bdf8" }}
          >
            {delta != null ? (delta > 0 ? `+${delta.toFixed(1)}°` : `${delta.toFixed(1)}°`) : "—"}
          </p>
        </div>
      </div>

      {/* Week trend */}
      {trendIcon && (
        <div className="flex items-center gap-1.5 mb-2">
          {trendIcon}
          <span className="font-mono text-[10px] text-muted-foreground">{trendLabel}</span>
        </div>
      )}

      {/* Footer info */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 font-mono">
        <span>{dayCount} days analyzed</span>
        {zone.has_portable_ac && zone.portable_ac_days > 0 && (
          <span className="text-[#34d399]/70">AC ran {zone.portable_ac_days}d</span>
        )}
      </div>
    </div>
  );
}


// ── Component ─────────────────────────────────────────────────────────────────

export default function Insights() {
  const [sensorId, setSensorId] = useState<number | undefined>();
  const [rangeDays, setRangeDays] = useState(365);
  const [thermostats, setThermostats] = useState<ThermostatInfo[]>([]);
  const [struggle, setStruggle] = useState<AcStruggleDay[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [zonePerf, setZonePerf] = useState<ZoneThermalPerf[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getThermostats().then(setThermostats).catch(console.error);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [str, hm, zp] = await Promise.all([
        getAcStruggle(rangeDays, sensorId),
        getActivityHeatmap(90, sensorId),
        getZoneThermalPerf(rangeDays),
      ]);
      setStruggle(str);
      setHeatmap(hm);
      setZonePerf(zp);
    } catch (e) {
      console.error("Failed to load insights:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [sensorId, rangeDays]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const struggleDays = useMemo(
    () => struggle.filter((d) => d.max_overshoot > 0),
    [struggle],
  );

  const worstDay = useMemo(
    () => struggle.reduce<AcStruggleDay | null>((a, b) => (!a || b.struggle_score > a.struggle_score ? b : a), null),
    [struggle],
  );

  const totalStruggleHours = useMemo(
    () => struggle.reduce((s, d) => s + d.struggle_hours, 0),
    [struggle],
  );

  const significantDays = useMemo(
    () => struggle.filter((d) => d.struggle_score >= 30).length,
    [struggle],
  );

  const hottestStruggleDay = useMemo(
    () =>
      struggleDays.reduce<AcStruggleDay | null>(
        (a, b) =>
          b.outdoor_high != null && (!a || !a.outdoor_high || b.outdoor_high > a.outdoor_high)
            ? b
            : a,
        null,
      ),
    [struggleDays],
  );

  // Timeline — one bar per day, show outdoor_high as line
  const timelineData = useMemo(() => {
    if (!struggle.length) return [];
    // Downsample if too many days
    const data = struggle.map((d) => ({
      date: d.date.slice(5),  // "MM-DD"
      struggle_score: d.struggle_score,
      outdoor_high: d.outdoor_high,
      max_overshoot: d.max_overshoot,
      _full: d,
    }));
    if (data.length <= 90) return data;
    // Keep every Nth point for readability
    const step = Math.ceil(data.length / 90);
    return data.filter((_, i) => i % step === 0);
  }, [struggle]);

  // Worst 10 days sorted by struggle_score
  const worstDays = useMemo(
    () => [...struggle].sort((a, b) => b.struggle_score - a.struggle_score).slice(0, 10),
    [struggle],
  );

  // Scatter data: outdoor_high vs max_overshoot, sized by hours_cooling
  const maxHours = useMemo(() => Math.max(...struggle.map((d) => d.hours_cooling), 1), [struggle]);
  const scatterData = useMemo(
    () =>
      struggle
        .filter((d) => d.outdoor_high != null)
        .map((d) => ({
          outdoor: d.outdoor_high!,
          overshoot: d.max_overshoot,
          hours: d.hours_cooling,
          score: d.struggle_score,
          _date: d.date,
          // Pass through all fields for tooltip
          ...d,
        })),
    [struggle],
  );

  // Heatmap grid
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

  // Format date for display
  const fmtDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            AC Performance
          </h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            When did extreme heat overwhelm your cooling system?
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Day range */}
          <div className="flex rounded-lg border border-border/40 bg-secondary/30 p-0.5">
            {DAY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRangeDays(opt.value)}
                className={`rounded-md px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
                  rangeDays === opt.value
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Thermostat selector */}
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

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      {struggle.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Worst day */}
          <div className="glass-card p-5">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Worst Day
                </p>
                {worstDay ? (
                  <>
                    <p className="mt-2 font-mono text-xl font-semibold leading-tight" style={{ color: scoreColor(worstDay.struggle_score) }}>
                      {worstDay.max_overshoot > 0 ? "+" : ""}{worstDay.max_overshoot.toFixed(1)}°F
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground truncate">
                      {fmtDate(worstDay.date)} · score {worstDay.struggle_score}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 font-mono text-xl text-foreground">—</p>
                )}
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#ef4444]/10">
                <AlertTriangle className="h-[18px] w-[18px] text-[#ef4444]" />
              </div>
            </div>
          </div>

          {/* Hottest struggle */}
          <div className="glass-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Hottest
                </p>
                <p className="mt-2 font-mono text-xl font-semibold text-[#fbbf24]">
                  {hottestStruggleDay?.outdoor_high != null ? `${hottestStruggleDay.outdoor_high}°F` : "—"}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {hottestStruggleDay ? fmtDate(hottestStruggleDay.date) : "outdoor during struggle"}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#fbbf24]/10">
                <ThermometerSun className="h-[18px] w-[18px] text-[#fbbf24]" />
              </div>
            </div>
          </div>

          {/* Struggle hours */}
          <div className="glass-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Struggle Hours
                </p>
                <p className="mt-2 font-mono text-xl font-semibold text-foreground">
                  {Math.round(totalStruggleHours)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">hrs</span>
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  indoor above setpoint
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f97316]/10">
                <Clock className="h-[18px] w-[18px] text-[#f97316]" />
              </div>
            </div>
          </div>

          {/* Significant events */}
          <div className="glass-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Notable Days
                </p>
                <p className="mt-2 font-mono text-xl font-semibold text-foreground">
                  {significantDays}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">days</span>
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  score ≥ 30 in range
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#38bdf8]/10">
                <CalendarDays className="h-[18px] w-[18px] text-[#38bdf8]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Struggle Timeline ──────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-4">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Struggle Timeline
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Daily severity score (bars) vs outdoor high temperature (line). Red = AC overwhelmed.
          </p>
        </div>
        <div className="h-72">
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timelineData} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="date"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="score"
                  domain={[0, 100]}
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  label={{
                    value: "Struggle Score",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#555",
                    fontSize: 10,
                    fontFamily: "DM Sans",
                  }}
                />
                <YAxis
                  yAxisId="temp"
                  orientation="right"
                  domain={["auto", "auto"]}
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  tickFormatter={(v) => `${v}°`}
                />
                <Tooltip content={<TimelineTooltip />} />
                <ReferenceLine yAxisId="score" y={30} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.4} />
                <ReferenceLine yAxisId="score" y={60} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4} />
                <Bar yAxisId="score" dataKey="struggle_score" barSize={6} radius={[2, 2, 0, 0]}>
                  {timelineData.map((entry, i) => (
                    <Cell key={i} fill={scoreColor(entry.struggle_score)} />
                  ))}
                </Bar>
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="outdoor_high"
                  stroke="#fbbf24"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No cooling data available for this range"}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground/70">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#22c55e]" />Normal (&lt;30)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#f97316]" />Significant (30–60)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#ef4444]" />Severe (&gt;60)
          </span>
        </div>
      </Card>

      {/* ── Two-column: Scatter + Worst Days ──────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Heat vs Struggle scatter */}
        <Card className="p-6">
          <div className="mb-4">
            <h2 className="font-display text-sm font-semibold text-foreground">
              Heat vs Struggle
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Outdoor high (X) vs indoor overshoot (Y). Dot size = AC hours running.
            </p>
          </div>
          <div className="h-64">
            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 4, right: 16, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis
                    type="number"
                    dataKey="outdoor"
                    name="Outdoor High"
                    tick={CHART_TICK}
                    stroke={CHART_GRID}
                    label={{ value: "Outdoor High (°F)", position: "insideBottom", fill: "#555", fontSize: 10, fontFamily: "DM Sans", offset: -12 }}
                    domain={["auto", "auto"]}
                  />
                  <YAxis
                    type="number"
                    dataKey="overshoot"
                    name="Above Setpoint"
                    tick={CHART_TICK}
                    stroke={CHART_GRID}
                    tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`}
                  />
                  <ZAxis type="number" dataKey="hours" range={[20, 250]} />
                  <ReferenceLine y={0} stroke="#333" strokeWidth={1} />
                  <Tooltip content={<ScatterTooltip />} cursor={{ stroke: "#333" }} />
                  <Scatter
                    data={scatterData}
                    shape={(props: any) => {
                      const { cx, cy, payload } = props;
                      const r = Math.max(4, Math.min(16, (payload.hours / maxHours) * 16));
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={scoreColor(payload.score)}
                          opacity={0.75}
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth={1}
                        />
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading..." : "No data"}
              </div>
            )}
          </div>
        </Card>

        {/* Worst days list */}
        <Card className="p-6">
          <div className="mb-4">
            <h2 className="font-display text-sm font-semibold text-foreground">
              Worst Days
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Top 10 days by struggle score — when the AC was overwhelmed most.
            </p>
          </div>
          {worstDays.length > 0 ? (
            <div className="space-y-2">
              {worstDays.map((d, i) => (
                <div
                  key={d.date}
                  className="flex items-center gap-3 rounded-lg border border-border/30 bg-secondary/20 px-3 py-2"
                >
                  {/* Rank */}
                  <span className="w-5 shrink-0 text-center font-mono text-[10px] text-muted-foreground/50">
                    {i + 1}
                  </span>
                  {/* Date */}
                  <span className="w-20 shrink-0 font-mono text-[11px] text-foreground">
                    {fmtDate(d.date)}
                  </span>
                  {/* Severity bar */}
                  <div className="flex-1">
                    <div className="h-1.5 w-full rounded-full bg-secondary/50">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(d.struggle_score, 100)}%`,
                          backgroundColor: scoreColor(d.struggle_score),
                        }}
                      />
                    </div>
                  </div>
                  {/* Overshoot */}
                  <span
                    className="w-14 shrink-0 text-right font-mono text-[11px] font-semibold"
                    style={{ color: overshootColor(d.max_overshoot) }}
                  >
                    {d.max_overshoot > 0 ? "+" : ""}{d.max_overshoot.toFixed(1)}°F
                  </span>
                  {/* Outdoor */}
                  <span className="w-14 shrink-0 text-right font-mono text-[10px] text-[#fbbf24]">
                    {d.outdoor_high != null ? `${d.outdoor_high}°` : "—"}
                  </span>
                </div>
              ))}
              {worstDays.length > 0 && (
                <div className="flex items-center gap-3 px-3 pt-1 text-[10px] text-muted-foreground/50">
                  <span className="w-5" />
                  <span className="w-20">date</span>
                  <span className="flex-1 text-center">severity</span>
                  <span className="w-14 text-right">above set.</span>
                  <span className="w-14 text-right">out. high</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No struggle events detected — AC is keeping up!"}
            </div>
          )}
        </Card>
      </div>

      {/* ── Activity Heatmap ───────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-5">
          <h2 className="font-display text-sm font-semibold text-foreground">
            When AC Runs Most
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Fraction of time cooling or heating by hour-of-day × weekday (90-day window). Darker = more active.
          </p>
        </div>
        {heatmap.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="flex" style={{ paddingLeft: "3.5rem" }}>
              {HOURS.map((label, h) => (
                <div
                  key={h}
                  className="flex-1 text-center font-mono text-[9px] text-muted-foreground/50"
                  style={{ minWidth: 26 }}
                >
                  {h % 4 === 0 ? label : ""}
                </div>
              ))}
            </div>
            {DAYS_SHORT.map((day, dow) => (
              <div key={dow} className="flex items-center gap-1 mt-1">
                <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground/60 pr-2">
                  {day}
                </span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = heatmapGrid[dow]?.[hour];
                  const pct = cell ? cell.active_pct : 0;
                  return (
                    <div
                      key={hour}
                      className="flex-1 rounded-sm"
                      style={{
                        minWidth: 26,
                        height: 26,
                        backgroundColor: heatmapCellColor(cell),
                      }}
                      title={
                        cell
                          ? `${day} ${HOURS[hour]}: ${pct.toFixed(1)}% active (${cell.sample_count} samples)`
                          : `${day} ${HOURS[hour]}: no data`
                      }
                    />
                  );
                })}
              </div>
            ))}
            {/* Gradient legend */}
            <div className="mt-4 flex items-center gap-3">
              <span className="font-mono text-[10px] text-muted-foreground/60">Less</span>
              <div className="flex h-2.5 w-40 overflow-hidden rounded-full">
                {Array.from({ length: 20 }, (_, i) => {
                  const fakePct = (i / 20) * 80;
                  const fakeCell = { active_pct: fakePct, day_of_week: 0, hour: 0, heating_pct: 0, cooling_pct: 0, sample_count: 1 };
                  return (
                    <div
                      key={i}
                      className="flex-1 h-full"
                      style={{ backgroundColor: heatmapCellColor(fakeCell) }}
                    />
                  );
                })}
              </div>
              <span className="font-mono text-[10px] text-muted-foreground/60">More</span>
            </div>
          </div>
        ) : (
          <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
            {loading ? "Loading..." : "No activity data available"}
          </div>
        )}
      </Card>

      {/* ── Zone Thermal Performance ───────────────────────────────────────── */}
      {zonePerf.length > 0 && (
        <div>
          <div className="mb-4">
            <h2 className="font-display text-lg font-bold tracking-tight">Zone Thermal Performance</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              How each room handles extreme heat (&gt;85°F) and cold (&lt;50°F) outdoor days.
              Zones with higher deltas struggle more to maintain comfort.
            </p>
          </div>

          {/* Hot days ranking */}
          {zonePerf.some((z) => z.hot_days_count > 0) && (
            <div className="mb-4">
              <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-[#f97316]/70 flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5" /> Hot Days (&gt;85°F outdoor)
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...zonePerf]
                  .filter((z) => z.hot_days_count > 0)
                  .sort((a, b) => (b.avg_delta_hot ?? -999) - (a.avg_delta_hot ?? -999))
                  .map((zone) => (
                    <ZonePerfCard key={zone.zone_id} zone={zone} mode="hot" />
                  ))}
              </div>
            </div>
          )}

          {/* Cold days ranking */}
          {zonePerf.some((z) => z.cold_days_count > 0) && (
            <div>
              <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-[#38bdf8]/70 flex items-center gap-1.5">
                <Snowflake className="h-3.5 w-3.5" /> Cold Days (&lt;50°F outdoor)
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...zonePerf]
                  .filter((z) => z.cold_days_count > 0)
                  .sort((a, b) => (b.avg_delta_cold ?? -999) - (a.avg_delta_cold ?? -999))
                  .map((zone) => (
                    <ZonePerfCard key={zone.zone_id} zone={zone} mode="cold" />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── No cooling data empty state ──────────────────────────────────── */}
      {!loading && struggle.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/30 py-16 text-center">
          <Snowflake className="h-8 w-8 text-[#38bdf8]/40" />
          <p className="font-display text-sm font-semibold text-foreground">No cooling data found</p>
          <p className="text-[12px] text-muted-foreground">
            Make sure your thermostat is tracked and has been polling long enough to accumulate data.
          </p>
        </div>
      )}

      {/* ── Leander TX Seasonal Lawn Care ───────────────────────────────── */}
      <LawnCareSection />
    </div>
  );
}

// ── Leander TX Lawn Care Tips ─────────────────────────────────────────────────

interface LawnTip {
  months: number[];  // 1=Jan … 12=Dec
  category: "mow" | "water" | "fertilize" | "treat" | "overseed";
  tip: string;
}

const LAWN_TIPS: LawnTip[] = [
  // Watering
  { months: [4, 5], category: "water", tip: "Begin watering 1–2×/wk as temps rise. Target 1\" per week." },
  { months: [6, 7, 8], category: "water", tip: "Water 2–3×/wk in early morning. Avoid watering mid-day — evaporation loss >50% in 100°F+ heat." },
  { months: [9, 10], category: "water", tip: "Taper to 1×/wk as highs drop below 90°F. Let grass harden for dormancy." },
  { months: [11, 12, 1, 2], category: "water", tip: "Water only if no rain for 3+ weeks during dormancy. Overwatering dormant grass invites fungus." },
  { months: [3], category: "water", tip: "Resume watering as green-up begins. Wait until grass is actively growing." },
  // Mowing
  { months: [3, 4], category: "mow", tip: "First mow at 2.5\" once grass is 3–4\" tall. Scalping while still dormant stresses roots." },
  { months: [5, 6, 7, 8, 9], category: "mow", tip: "Mow St. Augustine at 3.5–4\" to shade roots and reduce heat stress. Never remove >1/3 at once." },
  { months: [10, 11], category: "mow", tip: "Last mow of season at 3–3.5\" going into dormancy. Taller = better cold protection." },
  // Fertilizing
  { months: [4], category: "fertilize", tip: "Apply 15-5-10 or similar slow-release after green-up (soil ≥65°F). Leander's clay holds nutrients well." },
  { months: [6, 7], category: "fertilize", tip: "Light summer feed with 32-0-10 or similar. Avoid high-nitrogen in heat — can burn stressed grass." },
  { months: [9], category: "fertilize", tip: "Fall potassium boost (0-0-50 or winterizer) strengthens roots before dormancy. Key in Central TX." },
  // Pest/weed treatment
  { months: [2, 3], category: "treat", tip: "Apply pre-emergent (Prodiamine/Barricade) before soil hits 55°F to prevent crabgrass and other summer weeds." },
  { months: [4, 5], category: "treat", tip: "Spot-treat broadleaf weeds (clover, dandelion) with 3-way herbicide while temps are under 85°F." },
  { months: [7, 8], category: "treat", tip: "Watch for chinch bugs in hot dry spells — yellowing patches near curbs/sidewalks. Treat with bifenthrin." },
  { months: [10], category: "treat", tip: "Apply pre-emergent for winter weeds (henbit, annual bluegrass) before first cold front." },
  // Overseeding
  { months: [9, 10], category: "overseed", tip: "Overseed thin areas with bermuda or repair St. Augustine by patching — timing is critical before 60°F nights." },
];

const CATEGORY_META: Record<LawnTip["category"], { label: string; color: string; emoji: string }> = {
  mow:       { label: "Mowing",      color: "#34d399", emoji: "🌿" },
  water:     { label: "Watering",    color: "#38bdf8", emoji: "💧" },
  fertilize: { label: "Fertilizing", color: "#fbbf24", emoji: "🌱" },
  treat:     { label: "Treatment",   color: "#f97316", emoji: "🛡" },
  overseed:  { label: "Overseed",    color: "#a78bfa", emoji: "🌾" },
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function LawnCareSection() {
  const currentMonth = new Date().getMonth() + 1; // 1–12
  const currentTips = LAWN_TIPS.filter((t) => t.months.includes(currentMonth));
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextTips = LAWN_TIPS.filter((t) => t.months.includes(nextMonth) && !t.months.includes(currentMonth));

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold tracking-tight">Leander TX Lawn Care</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Seasonal tips for Central Texas — St. Augustine &amp; bermuda on clay soil.
        </p>
      </div>

      {/* Current month tips */}
      {currentTips.length > 0 && (
        <div className="mb-4">
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-primary/80">
            {MONTH_NAMES[currentMonth - 1]} — Now
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {currentTips.map((tip, i) => {
              const meta = CATEGORY_META[tip.category];
              return (
                <div
                  key={i}
                  className="flex gap-3 rounded-xl border border-border/30 bg-secondary/20 p-4 hover:border-border/50 transition-colors"
                >
                  <span className="mt-0.5 text-lg leading-none">{meta.emoji}</span>
                  <div>
                    <p
                      className="mb-1 font-mono text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </p>
                    <p className="text-[12px] leading-relaxed text-foreground/85">{tip.tip}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Coming up next month */}
      {nextTips.length > 0 && (
        <div>
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {MONTH_NAMES[nextMonth - 1]} — Coming Up
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {nextTips.map((tip, i) => {
              const meta = CATEGORY_META[tip.category];
              return (
                <div
                  key={i}
                  className="flex gap-3 rounded-xl border border-border/20 bg-secondary/10 p-3 opacity-70"
                >
                  <span className="mt-0.5 text-base leading-none">{meta.emoji}</span>
                  <div>
                    <p className="mb-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      {meta.label}
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{tip.tip}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
