import { useEffect, useState } from "react";
import {
  Timer,
  Gauge,
  Target,
  RefreshCw,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  Legend,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { TimeRangeSelector } from "@/components/shared/TimeRangeSelector";
import {
  getRecoveryEvents,
  getDutyCycle,
  getMetricsSummary,
  getEnergyProfile,
  getThermostats,
  type RecoveryEvent,
  type DutyCycleDay,
  type MetricsSummary,
  type EnergyProfileDay,
  type ThermostatInfo,
} from "@/lib/api";

const CHART_GRID = "#1e1e1e";
const CHART_TICK = { fill: "#555", fontSize: 11, fontFamily: "JetBrains Mono" };
const TOOLTIP_STYLE = {
  backgroundColor: "#111",
  border: "1px solid #252525",
  borderRadius: "10px",
  fontSize: 12,
  fontFamily: "DM Sans",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

const DAYS_MAP: Record<number, number> = {
  24: 1, 168: 7, 720: 30, 2160: 90, 8760: 365, 2: 1, 6: 1,
};

// ── Score gauge (SVG semicircle) ─────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const cx = 90, cy = 110, r = 68;
  const startX = cx - r; // 22
  const endX = cx + r;   // 158
  // Endpoint at score% along the semicircle arc (CCW = through top)
  const θ = Math.PI * (1 - score / 100);
  const scoreX = cx + r * Math.cos(θ);
  const scoreY = cy - r * Math.sin(θ);
  const color =
    score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#ef4444";
  const label =
    score >= 75 ? "Excellent" : score >= 50 ? "Good" : "Needs Work";

  return (
    <svg width="180" height="120" viewBox="0 0 180 120" aria-label={`Efficiency score: ${score}`}>
      {/* Subtle track glow */}
      <path
        d={`M ${startX} ${cy} A ${r} ${r} 0 0 0 ${endX} ${cy}`}
        fill="none"
        stroke="#1c1c1c"
        strokeWidth="18"
        strokeLinecap="round"
      />
      {/* Background arc */}
      <path
        d={`M ${startX} ${cy} A ${r} ${r} 0 0 0 ${endX} ${cy}`}
        fill="none"
        stroke="#2a2a2a"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {/* Score arc */}
      {score > 1 && (
        <path
          d={`M ${startX} ${cy} A ${r} ${r} 0 0 0 ${scoreX} ${scoreY}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
      )}
      {/* Tick marks at 0, 25, 50, 75, 100 */}
      {[0, 25, 50, 75, 100].map((pct) => {
        const tθ = Math.PI * (1 - pct / 100);
        const tx = cx + r * Math.cos(tθ);
        const ty = cy - r * Math.sin(tθ);
        const ix = cx + (r - 10) * Math.cos(tθ);
        const iy = cy - (r - 10) * Math.sin(tθ);
        return (
          <line key={pct} x1={tx} y1={ty} x2={ix} y2={iy}
            stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
        );
      })}
      {/* Score text */}
      <text
        x="90" y="85"
        textAnchor="middle"
        fill={color}
        fontSize="30"
        fontWeight="700"
        fontFamily="JetBrains Mono"
        style={{ filter: `drop-shadow(0 0 8px ${color}44)` }}
      >
        {score}
      </text>
      <text x="90" y="103" textAnchor="middle" fill="#666" fontSize="10" fontFamily="DM Sans">
        {label}
      </text>
    </svg>
  );
}

// ── Mini stat row ────────────────────────────────────────────

interface MiniStatProps {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  trend?: "up" | "down" | "flat" | null;
}

function MiniStat({ label, value, icon: Icon, color, trend }: MiniStatProps) {
  const TrendIcon =
    trend === "up" ? TrendingUp
    : trend === "down" ? TrendingDown
    : trend === "flat" ? Minus
    : null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-secondary/20 px-4 py-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <div className="flex items-center gap-1.5">
          <p className="font-mono text-lg font-bold leading-tight text-foreground">{value}</p>
          {TrendIcon && (
            <TrendIcon
              className="h-3.5 w-3.5 shrink-0"
              style={{
                color: trend === "up" ? "#ef4444" : trend === "down" ? "#22c55e" : "#666",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Custom tooltip for recovery ──────────────────────────────

const RecoveryTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const e = payload[0].payload as RecoveryEvent;
  return (
    <div style={TOOLTIP_STYLE} className="rounded-xl p-3 space-y-1">
      <p
        className="font-semibold text-[12px]"
        style={{ color: e.action === "heating" ? "#f97316" : "#38bdf8" }}
      >
        {e.action === "heating" ? "♨ Heating" : "❄ Cooling"}{" "}
        <span className="text-[11px]">{e.success ? "✓ reached setpoint" : "✗ timed out"}</span>
      </p>
      <p className="text-[10px] text-muted-foreground">
        {new Date(e.start_time).toLocaleString([], {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        })}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
        <p className="text-[11px] text-muted-foreground">Duration</p>
        <p className="text-[11px] font-mono text-right text-foreground">{e.duration_minutes} min</p>
        {e.start_temp != null && <>
          <p className="text-[11px] text-muted-foreground">Start temp</p>
          <p className="text-[11px] font-mono text-right text-foreground">{e.start_temp}°F</p>
        </>}
        {e.end_temp != null && <>
          <p className="text-[11px] text-muted-foreground">End temp</p>
          <p className="text-[11px] font-mono text-right text-foreground">{e.end_temp}°F</p>
        </>}
        {e.setpoint != null && <>
          <p className="text-[11px] text-muted-foreground">Setpoint</p>
          <p className="text-[11px] font-mono text-right text-foreground">{e.setpoint}°F</p>
        </>}
        {e.outdoor_temp != null && <>
          <p className="text-[11px] text-muted-foreground">Outdoor</p>
          <p className="text-[11px] font-mono text-right text-[#fbbf24]">{e.outdoor_temp}°F</p>
        </>}
      </div>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────

export default function Performance() {
  const [hours, setHours] = useState(168);
  const [sensorId, setSensorId] = useState<number | undefined>(undefined);
  const [thermostats, setThermostats] = useState<ThermostatInfo[]>([]);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [recovery, setRecovery] = useState<RecoveryEvent[]>([]);
  const [dutyCycle, setDutyCycle] = useState<DutyCycleDay[]>([]);
  const [energyProfile, setEnergyProfile] = useState<EnergyProfileDay[]>([]);
  const [loading, setLoading] = useState(true);

  const days = DAYS_MAP[hours] || Math.ceil(hours / 24);

  useEffect(() => {
    getThermostats().then(setThermostats).catch(console.error);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, r, d, e] = await Promise.all([
        getMetricsSummary(days, sensorId),
        getRecoveryEvents(days, sensorId),
        getDutyCycle(days, sensorId),
        getEnergyProfile(days, sensorId),
      ]);
      setSummary(s);
      setRecovery(r);
      setDutyCycle(d);
      setEnergyProfile(e);
    } catch (e) {
      console.error("Failed to fetch performance data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [hours, sensorId]);

  const score = summary?.efficiency_score ?? 0;

  const scatterHeating = energyProfile
    .filter((d) => d.outdoor_avg_temp != null && d.heating_hours > 0)
    .map((d) => ({ x: d.outdoor_avg_temp, y: d.heating_hours, date: d.date }));
  const scatterCooling = energyProfile
    .filter((d) => d.outdoor_avg_temp != null && d.cooling_hours > 0)
    .map((d) => ({ x: d.outdoor_avg_temp, y: d.cooling_hours, date: d.date }));

  const avgRecovery = recovery.filter((r) => r.success).reduce(
    (s, r) => ({ total: s.total + r.duration_minutes, count: s.count + 1 }),
    { total: 0, count: 0 },
  );

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Performance</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            HVAC efficiency &amp; runtime analysis
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
          <TimeRangeSelector value={hours} onChange={setHours} />
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/50 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Score + Key Stats ────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Efficiency Score card */}
        <Card className="flex flex-col items-center justify-center p-6">
          <p className="mb-1 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Efficiency Score
          </p>
          {summary ? (
            <ScoreGauge score={Math.round(score)} />
          ) : (
            <div className="flex h-28 items-center justify-center">
              <RefreshCw className="h-5 w-5 animate-spin text-primary/40" />
            </div>
          )}
          {summary && (
            <p className="mt-1 text-center font-mono text-[10px] text-muted-foreground">
              {days === 1 ? "Today" : `Last ${days} days`}
            </p>
          )}
        </Card>

        {/* Three key metrics */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniStat
            label="Avg Recovery"
            value={summary ? `${summary.avg_recovery_minutes} min` : "—"}
            icon={Timer}
            color="#38bdf8"
          />
          <MiniStat
            label="Duty Cycle"
            value={summary ? `${summary.duty_cycle_pct}%` : "—"}
            icon={Gauge}
            color="#fbbf24"
          />
          <MiniStat
            label="Hold Drift"
            value={summary ? `±${summary.hold_efficiency}°F` : "—"}
            icon={Target}
            color="#a78bfa"
          />

          {/* Duty cycle visual breakdown */}
          {summary && dutyCycle.length > 0 && (() => {
            const avg = dutyCycle.reduce(
              (a, d) => ({
                h: a.h + d.heating_pct,
                c: a.c + d.cooling_pct,
                i: a.i + d.idle_pct,
              }),
              { h: 0, c: 0, i: 0 },
            );
            const n = dutyCycle.length;
            const heat = Math.round(avg.h / n);
            const cool = Math.round(avg.c / n);
            const idle = Math.round(avg.i / n);
            return (
              <div className="col-span-full rounded-xl border border-border/30 bg-secondary/20 px-4 py-3">
                <p className="mb-2 font-display text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Avg Daily Split
                </p>
                <div className="flex h-3 w-full overflow-hidden rounded-full">
                  {heat > 0 && (
                    <div className="h-full" style={{ width: `${heat}%`, backgroundColor: "#f97316" }} title={`Heating: ${heat}%`} />
                  )}
                  {cool > 0 && (
                    <div className="h-full" style={{ width: `${cool}%`, backgroundColor: "#38bdf8" }} title={`Cooling: ${cool}%`} />
                  )}
                  {idle > 0 && (
                    <div className="h-full" style={{ width: `${idle}%`, backgroundColor: "#2a2a2a" }} title={`Idle: ${idle}%`} />
                  )}
                </div>
                <div className="mt-2 flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
                  {heat > 0 && <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#f97316]" />Heat {heat}%</span>}
                  {cool > 0 && <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#38bdf8]" />Cool {cool}%</span>}
                  {idle > 0 && <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-[#2a2a2a]" />Idle {idle}%</span>}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Recovery Events ──────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">
              Recovery Events
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Time from activation to setpoint — opaque = success, faded = timeout
            </p>
          </div>
          {recovery.length > 0 && (
            <div className="flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#f97316]" /> Heating
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#38bdf8]" /> Cooling
              </span>
            </div>
          )}
        </div>
        <div className="h-64">
          {recovery.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recovery} barSize={recovery.length > 40 ? 4 : 10}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="start_time"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString([], { month: "short", day: "numeric" })
                  }
                />
                <YAxis
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  label={{ value: "min", angle: -90, position: "insideLeft", fill: "#555", fontSize: 10, fontFamily: "DM Sans" }}
                />
                {avgRecovery.count > 0 && (
                  <ReferenceLine
                    y={Math.round(avgRecovery.total / avgRecovery.count)}
                    stroke="#fbbf24"
                    strokeDasharray="5 3"
                    strokeOpacity={0.5}
                    label={{ value: "avg", fill: "#fbbf24", fontSize: 9, fontFamily: "DM Sans" }}
                  />
                )}
                <Tooltip content={<RecoveryTooltip />} />
                <Bar dataKey="duration_minutes" radius={[3, 3, 0, 0]}>
                  {recovery.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.action === "heating" ? "#f97316" : "#38bdf8"}
                      opacity={entry.success ? 1 : 0.25}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Zap className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {loading ? "Loading..." : "No recovery events in this period"}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ── Duty Cycle + Energy Profile ──────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Daily Duty Cycle */}
        <Card className="p-6">
          <div className="mb-5">
            <h2 className="font-display text-sm font-semibold text-foreground">
              Daily Duty Cycle
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              % of each day spent heating / cooling / idle
            </p>
          </div>
          <div className="h-56">
            {dutyCycle.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dutyCycle} barSize={dutyCycle.length > 14 ? 6 : 14}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis
                    dataKey="date"
                    tick={CHART_TICK}
                    stroke={CHART_GRID}
                    tickFormatter={(v) => {
                      const d = new Date(v + "T00:00:00");
                      return d.toLocaleDateString([], { month: "short", day: "numeric" });
                    }}
                  />
                  <YAxis domain={[0, 100]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [`${v}%`, name]} />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "DM Sans", paddingTop: 4 }} />
                  <Bar dataKey="heating_pct" name="Heating" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="cooling_pct" name="Cooling" stackId="a" fill="#38bdf8" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="idle_pct" name="Idle" stackId="a" fill="#2a2a2a" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading..." : "No duty cycle data"}
              </div>
            )}
          </div>
        </Card>

        {/* Energy Profile */}
        <Card className="p-6">
          <div className="mb-5">
            <h2 className="font-display text-sm font-semibold text-foreground">
              Energy Profile
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Outdoor temp vs. daily runtime — key for TX summers
            </p>
          </div>
          <div className="h-56">
            {(scatterHeating.length > 0 || scatterCooling.length > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Outdoor Temp"
                    tick={CHART_TICK}
                    stroke={CHART_GRID}
                    tickFormatter={(v) => `${v}°`}
                    label={{ value: "Outdoor Temp (°F)", position: "insideBottom", fill: "#555", fontSize: 10, fontFamily: "DM Sans", offset: -12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Runtime"
                    tick={CHART_TICK}
                    stroke={CHART_GRID}
                    label={{ value: "hrs", angle: -90, position: "insideLeft", fill: "#555", fontSize: 10, fontFamily: "DM Sans" }}
                  />
                  <ZAxis range={[30, 140]} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => {
                      if (name === "Outdoor Temp") return [`${value}°F`, name];
                      return [`${value} hrs`, name];
                    }}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p?.date
                        ? new Date(p.date + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
                        : "";
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "DM Sans" }} />
                  {scatterHeating.length > 0 && (
                    <Scatter name="Heating" data={scatterHeating} fill="#f97316" opacity={0.7} />
                  )}
                  {scatterCooling.length > 0 && (
                    <Scatter name="Cooling" data={scatterCooling} fill="#38bdf8" opacity={0.7} />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading..." : "No energy data for this period"}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
