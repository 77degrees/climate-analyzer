import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { TimeRangeSelector } from "@/components/shared/TimeRangeSelector";
import {
  getReadings,
  getWeatherHistory,
  getZones,
  type SensorReadings,
  type WeatherPoint,
  type Zone,
} from "@/lib/api";

const CHART_GRID = "hsl(222, 20%, 18%)";
const CHART_TICK = { fill: "hsl(215, 15%, 55%)", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(222, 41%, 8%)",
  border: "1px solid hsl(222, 20%, 18%)",
  borderRadius: "8px",
  fontSize: 12,
};

const HVAC_COLORS: Record<string, string> = {
  heating: "#f97316",
  cooling: "#3b82f6",
  idle: "#374151",
  off: "#1f2937",
};

export default function History() {
  const [hours, setHours] = useState(24);
  const [readings, setReadings] = useState<SensorReadings[]>([]);
  const [humidityReadings, setHumidityReadings] = useState<SensorReadings[]>([]);
  const [weather, setWeather] = useState<WeatherPoint[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r, h, w, z] = await Promise.all([
        getReadings(hours, "temperature"),
        getReadings(hours, "humidity"),
        getWeatherHistory(hours),
        getZones(),
      ]);
      setReadings(r);
      setHumidityReadings(h);
      setWeather(w);
      setZones(z);
    } catch (e) {
      console.error("Failed to fetch history:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [hours]);

  const zoneNameMap = new Map<number, string>();
  zones.forEach((z) => zoneNameMap.set(z.id, z.name));

  const zonedTemp = readings.filter((s) => s.zone_id != null);
  const { chartPoints: tempPoints, chartLines: tempLines } = buildZoneChart(zonedTemp, zoneNameMap, hours);

  const zonedHumidity = humidityReadings.filter((s) => s.zone_id != null && !s.is_outdoor);
  const { chartPoints: humidPoints, chartLines: humidLines } = buildZoneChart(zonedHumidity, zoneNameMap, hours);

  const weatherChartData = buildWeatherChart(weather, hours);
  const hvacTimeline = buildHvacTimeline(readings, zoneNameMap, hours);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">History</h1>
        <div className="flex items-center gap-3">
          <TimeRangeSelector value={hours} onChange={setHours} />
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Temperature Chart — zone averaged */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
          Temperature by Zone
        </h2>
        <div className="h-80">
          {tempPoints.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tempPoints}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="time" tick={CHART_TICK} stroke={CHART_GRID} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}°`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {tempLines.filter((l) => !l.isOutdoor).map((line) => (
                  <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={false} connectNulls />
                ))}
                {tempLines.filter((l) => l.isOutdoor).map((line) => (
                  <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No data for this time range"}
            </div>
          )}
        </div>
      </Card>

      {/* HVAC Activity Timeline */}
      {hvacTimeline.zones.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
            HVAC Activity
          </h2>
          <div style={{ height: Math.max(200, hvacTimeline.zones.length * 48 + 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hvacTimeline.data} layout="vertical" barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="zone" tick={CHART_TICK} stroke={CHART_GRID} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="heating" name="Heating" stackId="a" fill="#f97316" radius={0} />
                <Bar dataKey="cooling" name="Cooling" stackId="a" fill="#3b82f6" radius={0} />
                <Bar dataKey="idle" name="Idle" stackId="a" fill="#6b7280" radius={0} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Indoor Humidity Chart — zone averaged */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
          Indoor Humidity by Zone
        </h2>
        <div className="h-64">
          {humidPoints.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={humidPoints}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="time" tick={CHART_TICK} stroke={CHART_GRID} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {humidLines.map((line) => (
                  <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No humidity data"}
            </div>
          )}
        </div>
      </Card>

      {/* Weather Details — dewpoint, heat index, wind */}
      {weatherChartData.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
            Weather Details
          </h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weatherChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="time" tick={CHART_TICK} stroke={CHART_GRID} interval="preserveStartEnd" />
                <YAxis yAxisId="temp" domain={["auto", "auto"]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}°`} />
                <YAxis yAxisId="wind" orientation="right" tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v} mph`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="temp" type="monotone" dataKey="temperature" name="Temperature" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="temp" type="monotone" dataKey="dewpoint" name="Dewpoint" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line yAxisId="temp" type="monotone" dataKey="heat_index" name="Heat Index" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line yAxisId="wind" type="monotone" dataKey="wind_speed" name="Wind Speed" stroke="#8b5cf6" strokeWidth={1.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Outdoor Humidity */}
      {weather.some((w) => w.humidity != null) && (
        <Card className="p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
            Outdoor Humidity
          </h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weatherChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="time" tick={CHART_TICK} stroke={CHART_GRID} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="humidity" name="Humidity" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Chart builders ──────────────────────────────────────────

interface ChartLine {
  key: string;
  name: string;
  color: string;
  isOutdoor: boolean;
}

function formatTimestamp(ts: string, hours: number): string {
  const d = new Date(ts);
  if (hours <= 24) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (hours <= 168) {
    return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function buildZoneChart(
  sensors: SensorReadings[],
  zoneNameMap: Map<number, string>,
  hours: number,
): { chartPoints: Record<string, any>[]; chartLines: ChartLine[] } {
  const zoneMap = new Map<number, { sensors: SensorReadings[]; color: string; isOutdoor: boolean }>();

  for (const sensor of sensors) {
    if (sensor.zone_id == null) continue;
    if (!zoneMap.has(sensor.zone_id)) {
      zoneMap.set(sensor.zone_id, { sensors: [], color: sensor.zone_color || "#06b6d4", isOutdoor: sensor.is_outdoor });
    }
    const group = zoneMap.get(sensor.zone_id)!;
    group.sensors.push(sensor);
    if (sensor.is_outdoor) group.isOutdoor = true;
  }

  // Collect timestamps and downsample for long ranges
  const allTimestamps = new Set<string>();
  for (const sensor of sensors) {
    for (const r of sensor.readings) {
      allTimestamps.add(r.timestamp);
    }
  }

  const timeMap = new Map<string, Record<string, any>>();
  for (const ts of allTimestamps) {
    const time = formatTimestamp(ts, hours);
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

  let chartPoints = Array.from(timeMap.values()).sort((a, b) => a._ts.localeCompare(b._ts));

  // Downsample for very long ranges (keep ~500 points max)
  if (chartPoints.length > 500) {
    const step = Math.ceil(chartPoints.length / 500);
    chartPoints = chartPoints.filter((_, i) => i % step === 0);
  }

  const chartLines: ChartLine[] = [];
  for (const [zoneId, group] of zoneMap) {
    chartLines.push({
      key: `zone_${zoneId}`,
      name: zoneNameMap.get(zoneId) || `Zone ${zoneId}`,
      color: group.color,
      isOutdoor: group.isOutdoor,
    });
  }

  return { chartPoints, chartLines };
}

function buildWeatherChart(weather: WeatherPoint[], hours: number): Record<string, any>[] {
  return weather.map((w) => ({
    time: formatTimestamp(w.timestamp, hours),
    temperature: w.temperature,
    humidity: w.humidity,
    dewpoint: w.dewpoint,
    heat_index: w.heat_index,
    wind_speed: w.wind_speed,
    pressure: w.pressure,
  }));
}

function buildHvacTimeline(
  sensors: SensorReadings[],
  zoneNameMap: Map<number, string>,
  hours: number,
): { data: Record<string, any>[]; zones: string[] } {
  // Find climate sensors with HVAC data
  const climateSensors = sensors.filter(
    (s) => s.readings.some((r) => r.hvac_action) && s.zone_id != null,
  );

  if (climateSensors.length === 0) return { data: [], zones: [] };

  const data: Record<string, any>[] = [];

  for (const sensor of climateSensors) {
    const zoneName = zoneNameMap.get(sensor.zone_id!) || sensor.friendly_name;
    let heating = 0, cooling = 0, idle = 0, total = 0;

    for (const r of sensor.readings) {
      if (!r.hvac_action) continue;
      total++;
      if (r.hvac_action === "heating") heating++;
      else if (r.hvac_action === "cooling") cooling++;
      else idle++;
    }

    if (total > 0) {
      data.push({
        zone: zoneName,
        heating: Math.round((heating / total) * 100),
        cooling: Math.round((cooling / total) * 100),
        idle: Math.round((idle / total) * 100),
      });
    }
  }

  return { data, zones: data.map((d) => d.zone) };
}
