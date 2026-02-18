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

const CHART_GRID = "hsl(222, 20%, 18%)";
const CHART_TICK = { fill: "hsl(215, 15%, 55%)", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(222, 41%, 8%)",
  border: "1px solid hsl(222, 20%, 18%)",
  borderRadius: "8px",
  fontSize: 12,
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

  // Load thermostats on mount
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

  // Scatter data: only points with outdoor temp
  const scatterHeating = energyProfile
    .filter((d) => d.outdoor_avg_temp != null && d.heating_hours > 0)
    .map((d) => ({ x: d.outdoor_avg_temp, y: d.heating_hours, date: d.date }));
  const scatterCooling = energyProfile
    .filter((d) => d.outdoor_avg_temp != null && d.cooling_hours > 0)
    .map((d) => ({ x: d.outdoor_avg_temp, y: d.cooling_hours, date: d.date }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Performance</h1>
        <div className="flex items-center gap-3">
          {/* Thermostat Selector */}
          {thermostats.length > 1 && (
            <select
              value={sensorId ?? ""}
              onChange={(e) => setSensorId(e.target.value ? Number(e.target.value) : undefined)}
              className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground"
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
            className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
          borderColor="#06b6d4"
        />
        <StatCard
          title="Duty Cycle"
          value={summary ? `${summary.duty_cycle_pct}%` : "--"}
          subtitle="Heating + Cooling"
          icon={Gauge}
          borderColor="#f59e0b"
        />
        <StatCard
          title="Hold Efficiency"
          value={summary ? `\u00b1${summary.hold_efficiency}\u00b0F` : "--"}
          subtitle="Avg drift from setpoint"
          icon={Target}
          borderColor="#8b5cf6"
        />
        <StatCard
          title="Efficiency Score"
          value={summary ? `${summary.efficiency_score}` : "--"}
          subtitle="Out of 100"
          subtitleColor={scoreColor as any}
          icon={Award}
          borderColor="#10b981"
        />
      </div>

      {/* Energy Profile Scatter Chart */}
      {(scatterHeating.length > 0 || scatterCooling.length > 0) && (
        <Card className="p-5">
          <h2 className="mb-1 font-display text-sm font-semibold text-foreground">
            Energy Profile
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Outdoor temperature vs. daily HVAC runtime
          </p>
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
                  label={{ value: "Outdoor Temp (\u00b0F)", position: "bottom", fill: "hsl(215, 15%, 55%)", fontSize: 11, offset: -5 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Runtime"
                  tick={CHART_TICK}
                  stroke={CHART_GRID}
                  label={{ value: "Hours", angle: -90, position: "insideLeft", fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
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
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {scatterHeating.length > 0 && (
                  <Scatter name="Heating" data={scatterHeating} fill="#f97316" />
                )}
                {scatterCooling.length > 0 && (
                  <Scatter name="Cooling" data={scatterCooling} fill="#3b82f6" />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Recovery Times Chart */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
          Recovery Events
        </h2>
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
                  label={{ value: "Minutes", angle: -90, position: "insideLeft", fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const e = payload[0].payload as RecoveryEvent;
                    return (
                      <div style={TOOLTIP_STYLE} className="rounded-lg p-3">
                        <p className="font-semibold" style={{ color: e.action === "heating" ? "#f97316" : "#3b82f6" }}>
                          {e.action === "heating" ? "Heating" : "Cooling"} {e.success ? "\u2713" : "\u2717"}
                        </p>
                        <p className="text-xs text-gray-300">{new Date(e.start_time).toLocaleString()}</p>
                        <p className="mt-1 text-xs text-gray-400">Duration: <span className="text-gray-200">{e.duration_minutes} min</span></p>
                        {e.start_temp != null && <p className="text-xs text-gray-400">Start: <span className="text-gray-200">{e.start_temp}\u00b0F</span></p>}
                        {e.end_temp != null && <p className="text-xs text-gray-400">End: <span className="text-gray-200">{e.end_temp}\u00b0F</span></p>}
                        {e.setpoint != null && <p className="text-xs text-gray-400">Setpoint: <span className="text-gray-200">{e.setpoint}\u00b0F</span></p>}
                        {e.outdoor_temp != null && <p className="text-xs text-gray-400">Outdoor: <span className="text-gray-200">{e.outdoor_temp}\u00b0F</span></p>}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="duration_minutes" radius={[4, 4, 0, 0]}>
                  {recovery.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.action === "heating" ? "#f97316" : "#3b82f6"}
                      opacity={entry.success ? 1 : 0.5}
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
      <Card className="p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
          Daily Duty Cycle
        </h2>
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
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="heating_pct" name="Heating" stackId="a" fill="#f97316" />
                <Bar dataKey="cooling_pct" name="Cooling" stackId="a" fill="#3b82f6" />
                <Bar dataKey="idle_pct" name="Idle" stackId="a" fill="#6b7280" />
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
