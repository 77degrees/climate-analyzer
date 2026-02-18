import { useEffect, useState } from "react";
import {
  Timer,
  Gauge,
  Target,
  Award,
  RefreshCw,
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
} from "recharts";
import { StatCard } from "@/components/shared/StatCard";
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

const DAYS_MAP: Record<number, number> = {
  24: 1, 168: 7, 720: 30, 2160: 90, 8760: 365, 2: 1, 6: 1,
};

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

  useEffect(() => {
    fetchData();
  }, [hours, sensorId]);

  const scoreColor =
    (summary?.efficiency_score ?? 0) >= 75
      ? "success"
      : (summary?.efficiency_score ?? 0) >= 50
        ? "warning"
        : "destructive";

  const scatterHeating = energyProfile
    .filter((d) => d.outdoor_avg_temp != null && d.heating_hours > 0)
    .map((d) => ({ x: d.outdoor_avg_temp, y: d.heating_hours, date: d.date }));
  const scatterCooling = energyProfile
    .filter((d) => d.outdoor_avg_temp != null && d.cooling_hours > 0)
    .map((d) => ({ x: d.outdoor_avg_temp, y: d.cooling_hours, date: d.date }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Performance</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            HVAC efficiency & runtime analysis
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Avg Recovery Time"
          value={summary ? `${summary.avg_recovery_minutes} min` : "--"}
          icon={Timer}
          borderColor="#38bdf8"
        />
        <StatCard
          title="Duty Cycle"
          value={summary ? `${summary.duty_cycle_pct}%` : "--"}
          subtitle="Heating + Cooling"
          icon={Gauge}
          borderColor="#fbbf24"
        />
        <StatCard
          title="Hold Efficiency"
          value={summary ? `\u00b1${summary.hold_efficiency}\u00b0F` : "--"}
          subtitle="Avg drift from setpoint"
          icon={Target}
          borderColor="#a78bfa"
        />
        <StatCard
          title="Efficiency Score"
          value={summary ? `${summary.efficiency_score}` : "--"}
          subtitle="Out of 100"
          subtitleColor={scoreColor as any}
          icon={Award}
          borderColor="#34d399"
        />
      </div>

      {/* Energy Profile Scatter Chart */}
      {(scatterHeating.length > 0 || scatterCooling.length > 0) && (
        <Card className="p-6">
          <div className="mb-5">
            <h2 className="font-display text-sm font-semibold text-foreground">
              Energy Profile
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Outdoor temperature vs. daily HVAC runtime
            </p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Outdoor Temp"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  tickFormatter={(v) => `${v}\u00b0`}
                  label={{ value: "Outdoor Temp (\u00b0F)", position: "bottom", fill: "#666", fontSize: 11, fontFamily: "DM Sans", offset: -5 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Runtime"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  label={{ value: "Hours", angle: -90, position: "insideLeft", fill: "#666", fontSize: 11, fontFamily: "DM Sans" }}
                />
                <ZAxis range={[40, 200]} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => {
                    if (name === "Outdoor Temp") return [`${value}\u00b0F`, name];
                    return [`${value} hrs`, name];
                  }}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload;
                    return p?.date ? new Date(p.date + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }} />
                {scatterHeating.length > 0 && (
                  <Scatter name="Heating" data={scatterHeating} fill="#f97316" />
                )}
                {scatterCooling.length > 0 && (
                  <Scatter name="Cooling" data={scatterCooling} fill="#38bdf8" />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Recovery Times Chart */}
      <Card className="p-6">
        <div className="mb-5">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Recovery Events
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Time to reach setpoint after HVAC activation</p>
        </div>
        <div className="h-72">
          {recovery.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recovery}>
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
                  label={{ value: "Minutes", angle: -90, position: "insideLeft", fill: "#666", fontSize: 11, fontFamily: "DM Sans" }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const e = payload[0].payload as RecoveryEvent;
                    return (
                      <div style={TOOLTIP_STYLE} className="rounded-xl p-3">
                        <p className="font-semibold" style={{ color: e.action === "heating" ? "#f97316" : "#38bdf8" }}>
                          {e.action === "heating" ? "Heating" : "Cooling"} {e.success ? "\u2713" : "\u2717"}
                        </p>
                        <p className="text-[11px] text-gray-400">{new Date(e.start_time).toLocaleString()}</p>
                        <p className="mt-1 text-[11px] text-gray-500">Duration: <span className="text-gray-300 font-mono">{e.duration_minutes} min</span></p>
                        {e.start_temp != null && <p className="text-[11px] text-gray-500">Start: <span className="text-gray-300 font-mono">{e.start_temp}\u00b0F</span></p>}
                        {e.end_temp != null && <p className="text-[11px] text-gray-500">End: <span className="text-gray-300 font-mono">{e.end_temp}\u00b0F</span></p>}
                        {e.setpoint != null && <p className="text-[11px] text-gray-500">Setpoint: <span className="text-gray-300 font-mono">{e.setpoint}\u00b0F</span></p>}
                        {e.outdoor_temp != null && <p className="text-[11px] text-gray-500">Outdoor: <span className="text-gray-300 font-mono">{e.outdoor_temp}\u00b0F</span></p>}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="duration_minutes" radius={[4, 4, 0, 0]}>
                  {recovery.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.action === "heating" ? "#f97316" : "#38bdf8"}
                      opacity={entry.success ? 1 : 0.4}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No recovery events in this period"}
            </div>
          )}
        </div>
      </Card>

      {/* Duty Cycle Stacked Bar */}
      <Card className="p-6">
        <div className="mb-5">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Daily Duty Cycle
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Percentage of time in each HVAC state</p>
        </div>
        <div className="h-64">
          {dutyCycle.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dutyCycle}>
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
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }} />
                <Bar dataKey="heating_pct" name="Heating" stackId="a" fill="#f97316" />
                <Bar dataKey="cooling_pct" name="Cooling" stackId="a" fill="#38bdf8" />
                <Bar dataKey="idle_pct" name="Idle" stackId="a" fill="#525252" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No duty cycle data"}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
