import { useEffect, useState } from "react";
import {
  Thermometer,
  Sun,
  ArrowUpDown,
  Droplets,
  RefreshCw,
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
  type DashboardData,
  type SensorReadings,
} from "@/lib/api";

const ACTION_COLORS: Record<string, string> = {
  heating: "#f97316",
  cooling: "#3b82f6",
  idle: "#6b7280",
  off: "#374151",
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

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [chartData, setChartData] = useState<SensorReadings[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [dash, readings] = await Promise.all([
        getDashboard(),
        getReadings(2, "temperature"),
      ]);
      setData(dash);
      setChartData(readings);
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

  // Filter to zoned sensors only (excludes appliances, vehicles, batteries)
  const zonedSensors = chartData.filter((s) => s.zone_id != null);

  // Build zone name lookup from dashboard data
  const zoneNameMap = new Map<number, string>();
  data?.zone_cards.forEach((z) => zoneNameMap.set(z.zone_id, z.zone_name));

  // Build chart data points — one line per zone (averaged)
  const { chartPoints, chartLines } = buildZoneChart(zonedSensors, zoneNameMap);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
          borderColor="#06b6d4"
        />
        <StatCard
          title="Outdoor Temp"
          value={formatTemp(stats?.outdoor_temp)}
          subtitle={stats?.feels_like != null ? `Feels like ${formatTemp(stats.feels_like)}` : undefined}
          icon={Sun}
          borderColor="#f59e0b"
        />
        <StatCard
          title="Indoor/Outdoor Delta"
          value={stats?.delta != null ? `${stats.delta > 0 ? "+" : ""}${stats.delta}°F` : "--"}
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
          borderColor="#8b5cf6"
        />
        <StatCard
          title="Humidity"
          value={formatHumidity(stats?.humidity)}
          icon={Droplets}
          borderColor="#10b981"
        />
      </div>

      {/* Live Temperature Chart */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
          Temperature — Last 2 Hours
        </h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
              <XAxis
                dataKey="time"
                tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                stroke="hsl(222, 20%, 18%)"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                stroke="hsl(222, 20%, 18%)"
                tickFormatter={(v) => `${v}°`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(222, 41%, 8%)",
                  border: "1px solid hsl(222, 20%, 18%)",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
              />
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
                  />
                ))}
              {/* Outdoor line - dashed */}
              {chartLines
                .filter((l) => l.isOutdoor)
                .map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.name}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* HVAC Status + Zone Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* HVAC Status */}
        <Card className="p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
            HVAC Status
          </h2>
          <div className="space-y-3">
            {data?.hvac_statuses.map((hvac) => (
              <div
                key={hvac.entity_id}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {hvac.zone_name || hvac.friendly_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTemp(hvac.current_temp)}
                    {hvac.setpoint_heat && ` · Set: ${formatTemp(hvac.setpoint_heat)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hvac.hvac_mode && (
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      {ACTION_LABELS[hvac.hvac_mode] || hvac.hvac_mode}
                    </span>
                  )}
                  {hvac.hvac_action && (
                    <span
                      className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                      style={{
                        backgroundColor:
                          ACTION_COLORS[hvac.hvac_action] || "#374151",
                      }}
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
        <Card className="p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
            Zones
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data?.zone_cards.map((zone) => (
              <div
                key={zone.zone_id}
                className="relative overflow-hidden rounded-lg border border-border bg-secondary/30 p-4"
              >
                <div
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ backgroundColor: zone.zone_color }}
                />
                <p className="text-sm font-semibold text-foreground">
                  {zone.zone_name}
                </p>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-xl font-bold text-foreground">
                    {formatTemp(zone.avg_temp)}
                  </span>
                  {zone.avg_humidity != null && (
                    <span className="text-xs text-muted-foreground">
                      {formatHumidity(zone.avg_humidity)}
                    </span>
                  )}
                </div>
                {zone.hvac_action && (
                  <span
                    className="mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                    style={{
                      backgroundColor:
                        ACTION_COLORS[zone.hvac_action] || "#374151",
                    }}
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
  // Group sensors by zone
  const zoneMap = new Map<
    number,
    { sensors: SensorReadings[]; color: string; isOutdoor: boolean }
  >();

  for (const sensor of sensors) {
    if (sensor.zone_id == null) continue;
    if (!zoneMap.has(sensor.zone_id)) {
      zoneMap.set(sensor.zone_id, {
        sensors: [],
        color: sensor.zone_color || "#06b6d4",
        isOutdoor: sensor.is_outdoor,
      });
    }
    const group = zoneMap.get(sensor.zone_id)!;
    group.sensors.push(sensor);
    // If any sensor in the zone is outdoor, mark the zone as outdoor
    if (sensor.is_outdoor) group.isOutdoor = true;
  }

  // Use provided zone names or fall back to zone ID
  const zoneNames = zoneNameMap || new Map<number, string>();

  // Collect all unique timestamps
  const allTimestamps = new Set<string>();
  for (const sensor of sensors) {
    for (const r of sensor.readings) {
      allTimestamps.add(r.timestamp);
    }
  }

  // Build time-aligned points with zone averages
  const timeMap = new Map<string, Record<string, any>>();

  for (const ts of allTimestamps) {
    const time = new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const point: Record<string, any> = { time, _ts: ts };

    for (const [zoneId, group] of zoneMap) {
      const key = `zone_${zoneId}`;
      const values: number[] = [];

      for (const sensor of group.sensors) {
        const reading = sensor.readings.find((r) => r.timestamp === ts);
        if (reading?.value != null) {
          values.push(reading.value);
        }
      }

      if (values.length > 0) {
        // Average all sensor values for this zone at this timestamp
        point[key] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
      }
    }

    timeMap.set(ts, point);
  }

  const chartPoints = Array.from(timeMap.values()).sort((a, b) =>
    a._ts.localeCompare(b._ts),
  );

  // Build chart line definitions
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
