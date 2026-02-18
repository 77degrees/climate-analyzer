import { useEffect, useState } from "react";
import {
  Thermometer,
  Sun,
  ArrowUpDown,
  Droplets,
  RefreshCw,
  CloudRain,
  Zap,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/ui/card";
import { formatTemp, formatHumidity } from "@/lib/utils";
import {
  getDashboard,
  getReadings,
  getForecast,
  type DashboardData,
  type SensorReadings,
  type ForecastPeriod,
} from "@/lib/api";

const ACTION_COLORS: Record<string, string> = {
  heating: "#f97316",
  cooling: "#38bdf8",
  idle: "#525252",
  off: "#2a2a2a",
};

const ACTION_LABELS: Record<string, string> = {
  heating: "HEATING",
  cooling: "COOLING",
  idle: "IDLE",
  off: "OFF",
  heat: "HEAT",
  cool: "COOL",
  auto: "AUTO",
  heat_cool: "AUTO",
};

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

// ── NWS icon category → simple emoji/label ──────────────────

function forecastIconEmoji(shortForecast: string, isDaytime: boolean): string {
  const s = shortForecast.toLowerCase();
  if (s.includes("thunder")) return "⛈";
  if (s.includes("snow")) return "❄️";
  if (s.includes("rain") || s.includes("shower")) return "🌧";
  if (s.includes("drizzle") || s.includes("mist")) return "🌦";
  if (s.includes("fog")) return "🌫";
  if (s.includes("wind")) return isDaytime ? "💨" : "💨";
  if (s.includes("partly cloudy") || s.includes("partly sunny") || s.includes("mostly cloudy")) {
    return isDaytime ? "⛅" : "🌙";
  }
  if (s.includes("cloudy") || s.includes("overcast")) return "☁️";
  if (s.includes("sunny") || s.includes("clear")) return isDaytime ? "☀️" : "🌙";
  return isDaytime ? "🌤" : "🌙";
}

// ── Forecast strip ──────────────────────────────────────────

function ForecastStrip({ periods }: { periods: ForecastPeriod[] }) {
  if (!periods.length) return null;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-foreground">Forecast</h2>
        <span className="font-mono text-[10px] text-muted-foreground/60">NWS · next 3–4 days</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {periods.map((p, i) => (
          <div
            key={i}
            className={`flex min-w-[90px] shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-3 transition-all ${
              i === 0
                ? "border-primary/30 bg-primary/5"
                : "border-border/30 bg-secondary/20 hover:border-border/60"
            }`}
          >
            <p className="font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {p.name}
            </p>
            <span className="text-2xl leading-none" role="img" aria-label={p.short_forecast}>
              {forecastIconEmoji(p.short_forecast, p.is_daytime)}
            </span>
            <p
              className="font-mono text-base font-bold"
              style={{
                color:
                  (p.temperature ?? 0) >= 100
                    ? "#ef4444"
                    : (p.temperature ?? 0) >= 85
                      ? "#f97316"
                      : (p.temperature ?? 0) <= 40
                        ? "#38bdf8"
                        : "#e5e5e5",
              }}
            >
              {p.temperature != null ? `${p.temperature}°` : "—"}
            </p>
            <p className="text-center font-mono text-[9px] leading-tight text-muted-foreground/70">
              {p.short_forecast.length > 14 ? p.short_forecast.slice(0, 13) + "…" : p.short_forecast}
            </p>
            {p.wind_speed && (
              <p className="font-mono text-[9px] text-muted-foreground/50">
                {p.wind_direction} {p.wind_speed}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Water leak section ───────────────────────────────────────

function WaterLeakSection({ leaks }: { leaks: DashboardData["water_leaks"] }) {
  if (!leaks.length) return null;
  const wet = leaks.filter((l) => l.is_wet);
  return (
    <Card className={`p-5 ${wet.length > 0 ? "border-red-500/40 bg-red-950/10" : ""}`}>
      <div className="flex items-center gap-2 mb-3">
        {wet.length > 0 ? (
          <AlertTriangle className="h-4 w-4 text-[#ef4444]" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-[#34d399]" />
        )}
        <h2 className="font-display text-sm font-semibold text-foreground">Water Leak Sensors</h2>
        {wet.length > 0 && (
          <span className="ml-auto rounded-full bg-[#ef4444]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[#ef4444]">
            {wet.length} WET
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {leaks.map((leak) => (
          <div
            key={leak.entity_id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
              leak.is_wet
                ? "border-[#ef4444]/40 bg-[#ef4444]/10"
                : "border-border/30 bg-secondary/20"
            }`}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: leak.is_wet ? "#ef4444" : "#34d399" }}
            />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-foreground">
                {leak.friendly_name}
              </p>
              <p className={`font-mono text-[10px] ${leak.is_wet ? "text-[#ef4444]" : "text-[#34d399]"}`}>
                {leak.is_wet ? "WET" : "Dry"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Power sensors section ────────────────────────────────────

function PowerSection({ sensors }: { sensors: DashboardData["power_sensors"] }) {
  if (!sensors.length) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-[#fbbf24]" />
        <h2 className="font-display text-sm font-semibold text-foreground">Power &amp; Energy</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sensors.map((s) => (
          <div
            key={s.entity_id}
            className="rounded-xl border border-border/30 bg-secondary/20 px-4 py-3"
          >
            <p className="truncate font-mono text-[10px] text-muted-foreground">{s.friendly_name}</p>
            <p className="mt-1 font-mono text-lg font-bold text-[#fbbf24]">
              {s.value != null ? s.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "—"}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">{s.unit ?? ""}</span>
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [chartData, setChartData] = useState<SensorReadings[]>([]);
  const [forecast, setForecast] = useState<ForecastPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [dash, readings, fc] = await Promise.all([
        getDashboard(),
        getReadings(2, "temperature"),
        getForecast().catch(() => [] as ForecastPeriod[]),
      ]);
      setData(dash);
      setChartData(readings);
      setForecast(fc);
    } catch (e) {
      console.error("Failed to fetch dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, []);

  const zonedSensors = chartData.filter((s) => s.zone_id != null);
  const zoneNameMap = new Map<number, string>();
  data?.zone_cards.forEach((z) => zoneNameMap.set(z.zone_id, z.zone_name));
  const { chartPoints, chartLines } = buildZoneChart(zonedSensors, zoneNameMap);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-primary/60" />
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Real-time climate overview
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/50 px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Indoor Temp"
          value={formatTemp(stats?.indoor_temp)}
          icon={Thermometer}
          borderColor="#38bdf8"
        />
        <StatCard
          title="Outdoor Temp"
          value={formatTemp(stats?.outdoor_temp)}
          subtitle={stats?.feels_like != null ? `Feels like ${formatTemp(stats.feels_like)}` : undefined}
          icon={Sun}
          borderColor="#fbbf24"
        />
        <StatCard
          title="Indoor / Outdoor"
          value={stats?.delta != null ? `${stats.delta > 0 ? "+" : ""}${stats.delta}\u00b0F` : "--"}
          subtitleColor={
            stats?.delta != null
              ? Math.abs(stats.delta) > 20
                ? "warning"
                : "success"
              : "default"
          }
          subtitle={
            stats?.delta != null
              ? Math.abs(stats.delta) > 20
                ? "High differential"
                : "Normal"
              : undefined
          }
          icon={ArrowUpDown}
          borderColor="#a78bfa"
        />
        <StatCard
          title="Humidity"
          value={formatHumidity(stats?.humidity)}
          icon={Droplets}
          borderColor="#34d399"
        />
      </div>

      {/* NWS Forecast strip */}
      {forecast.length > 0 && <ForecastStrip periods={forecast} />}

      {/* Water leak alerts (shown only if tracked sensors exist) */}
      {data?.water_leaks && data.water_leaks.length > 0 && (
        <WaterLeakSection leaks={data.water_leaks} />
      )}

      {/* Live Temperature Chart */}
      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">
              Temperature
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Last 2 hours by zone</p>
          </div>
          <div className="flex items-center gap-3">
            {chartLines.map((line) => (
              <div key={line.key} className="flex items-center gap-1.5">
                <div
                  className="h-[3px] w-4 rounded-full"
                  style={{
                    backgroundColor: line.isOutdoor ? "#fbbf24" : line.color,
                    opacity: line.isOutdoor ? 0.7 : 1,
                  }}
                />
                <span className="text-[10px] text-muted-foreground">{line.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="time" tick={CHART_TICK} stroke={CHART_GRID} />
              <YAxis
                domain={["auto", "auto"]}
                tick={CHART_TICK}
                stroke={CHART_GRID}
                tickFormatter={(v) => `${v}\u00b0`}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {chartLines
                .filter((l) => !l.isOutdoor)
                .map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              {chartLines
                .filter((l) => l.isOutdoor)
                .map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.name}
                    stroke="#fbbf24"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Power sensors */}
      {data?.power_sensors && data.power_sensors.length > 0 && (
        <PowerSection sensors={data.power_sensors} />
      )}

      {/* HVAC Status + Zone Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* HVAC Status */}
        <Card className="p-6">
          <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
            HVAC Status
          </h2>
          <div className="space-y-2.5">
            {data?.hvac_statuses.map((hvac) => (
              <div
                key={hvac.entity_id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/30 px-4 py-3 transition-colors hover:border-border"
              >
                <div>
                  <p className="text-[13px] font-semibold text-foreground">
                    {hvac.zone_name || hvac.friendly_name}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {formatTemp(hvac.current_temp)}
                    {hvac.setpoint_heat && ` \u00b7 Set: ${formatTemp(hvac.setpoint_heat)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hvac.hvac_mode && (
                    <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {ACTION_LABELS[hvac.hvac_mode] || hvac.hvac_mode}
                    </span>
                  )}
                  {hvac.hvac_action && (
                    <span
                      className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-white"
                      style={{ backgroundColor: ACTION_COLORS[hvac.hvac_action] || "#2a2a2a" }}
                    >
                      {ACTION_LABELS[hvac.hvac_action] || hvac.hvac_action}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {(!data?.hvac_statuses || data.hvac_statuses.length === 0) && (
              <p className="text-sm text-muted-foreground">
                No HVAC entities found. Configure sensors in Settings.
              </p>
            )}
          </div>
        </Card>

        {/* Zone Cards */}
        <Card className="p-6">
          <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
            Zones
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data?.zone_cards.map((zone) => (
              <div
                key={zone.zone_id}
                className="group relative overflow-hidden rounded-lg border border-border/40 bg-secondary/20 p-4 transition-all duration-200 hover:border-border hover:bg-secondary/40"
              >
                <div
                  className="absolute inset-x-0 top-0 h-[2px]"
                  style={{
                    background: `linear-gradient(90deg, ${zone.zone_color}00, ${zone.zone_color}, ${zone.zone_color}00)`,
                  }}
                />
                <p className="text-[13px] font-semibold text-foreground">{zone.zone_name}</p>
                <div className="mt-2.5 flex items-baseline gap-3">
                  <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                    {formatTemp(zone.avg_temp)}
                  </span>
                  {zone.avg_humidity != null && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatHumidity(zone.avg_humidity)}
                    </span>
                  )}
                </div>
                {zone.hvac_action && (
                  <span
                    className="mt-2 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: ACTION_COLORS[zone.hvac_action] || "#2a2a2a" }}
                  >
                    {zone.hvac_action}
                  </span>
                )}
              </div>
            ))}
            {(!data?.zone_cards || data.zone_cards.length === 0) && (
              <p className="col-span-2 text-sm text-muted-foreground">
                No zones configured. Create zones in Settings.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Chart helpers ────────────────────────────────────────────

interface ChartLine {
  key: string;
  name: string;
  color: string;
  isOutdoor: boolean;
}

function buildZoneChart(sensors: SensorReadings[], zoneNameMap?: Map<number, string>): {
  chartPoints: Record<string, any>[];
  chartLines: ChartLine[];
} {
  const zoneMap = new Map<number, { sensors: SensorReadings[]; color: string; isOutdoor: boolean }>();

  for (const sensor of sensors) {
    if (sensor.zone_id == null) continue;
    if (!zoneMap.has(sensor.zone_id)) {
      zoneMap.set(sensor.zone_id, { sensors: [], color: sensor.zone_color || "#38bdf8", isOutdoor: sensor.is_outdoor });
    }
    const group = zoneMap.get(sensor.zone_id)!;
    group.sensors.push(sensor);
    if (sensor.is_outdoor) group.isOutdoor = true;
  }

  const zoneNames = zoneNameMap || new Map<number, string>();
  const allTimestamps = new Set<string>();
  for (const sensor of sensors) {
    for (const r of sensor.readings) allTimestamps.add(r.timestamp);
  }

  const timeMap = new Map<string, Record<string, any>>();
  for (const ts of allTimestamps) {
    const time = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const point: Record<string, any> = { time, _ts: ts };
    for (const [zoneId, group] of zoneMap) {
      const key = `zone_${zoneId}`;
      const values: number[] = [];
      for (const sensor of group.sensors) {
        const reading = sensor.readings.find((r) => r.timestamp === ts);
        if (reading?.value != null) values.push(reading.value);
      }
      if (values.length > 0) {
        point[key] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
      }
    }
    timeMap.set(ts, point);
  }

  const chartPoints = Array.from(timeMap.values()).sort((a, b) => a._ts.localeCompare(b._ts));
  const chartLines: ChartLine[] = [];
  for (const [zoneId, group] of zoneMap) {
    chartLines.push({
      key: `zone_${zoneId}`,
      name: zoneNames.get(zoneId) || `Zone ${zoneId}`,
      color: group.color,
      isOutdoor: group.isOutdoor,
    });
  }
  return { chartPoints, chartLines };
}
