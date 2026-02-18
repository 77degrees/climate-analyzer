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
  ReferenceDot,
} from "recharts";
import { Card } from "@/components/ui/card";
import { DateRangeBar, type DateRange } from "@/components/shared/DateRangeBar";
import {
  getReadings,
  getReadingsRange,
  getWeatherHistory,
  getWeatherHistoryRange,
  getZones,
  getAnnotations,
  type SensorReadings,
  type WeatherPoint,
  type Zone,
  type Annotation,
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

// Custom dot for annotations on line charts
const AnnotationDot = (props: any) => {
  const { cx, cy, payload, annotations } = props;
  if (!cx || !cy) return null;
  const ts = payload?._ts;
  if (!ts) return null;
  const ann = annotations?.find((a: Annotation) => {
    const diff = Math.abs(new Date(a.timestamp).getTime() - new Date(ts).getTime());
    return diff < 1000 * 60 * 30; // within 30 minutes
  });
  if (!ann) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={ann.color} stroke="#fff" strokeWidth={1.5} opacity={0.9} />
      <text x={cx} y={cy - 10} textAnchor="middle" fill={ann.color} fontSize={9} fontFamily="DM Sans" fontWeight={600}>
        {ann.label}
      </text>
    </g>
  );
};

export default function History() {
  const [range, setRange] = useState<DateRange>({ mode: "preset", hours: 24 });
  const [readings, setReadings] = useState<SensorReadings[]>([]);
  const [humidityReadings, setHumidityReadings] = useState<SensorReadings[]>([]);
  const [weather, setWeather] = useState<WeatherPoint[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);

  const hours = range.mode === "preset" ? range.hours : 24; // fallback for formatTimestamp

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r, h, w, z, anns] = await Promise.all([
        range.mode === "preset"
          ? getReadings(range.hours, "temperature")
          : getReadingsRange(range.start, range.end, "temperature"),
        range.mode === "preset"
          ? getReadings(range.hours, "humidity")
          : getReadingsRange(range.start, range.end, "humidity"),
        range.mode === "preset"
          ? getWeatherHistory(range.hours)
          : getWeatherHistoryRange(range.start, range.end),
        getZones(),
        getAnnotations(),
      ]);
      setReadings(r);
      setHumidityReadings(h);
      setWeather(w);
      setZones(z);
      setAnnotations(anns);
    } catch (e) {
      console.error("Failed to fetch history:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [JSON.stringify(range)]);

  const displayHours =
    range.mode === "preset"
      ? range.hours
      : Math.round(
          (new Date(range.end).getTime() - new Date(range.start).getTime()) / 3600000,
        );

  const zoneNameMap = new Map<number, string>();
  zones.forEach((z) => zoneNameMap.set(z.id, z.name));

  const zonedTemp = readings.filter((s) => s.zone_id != null);
  const { chartPoints: tempPoints, chartLines: tempLines } = buildZoneChart(zonedTemp, zoneNameMap, displayHours);

  const zonedHumidity = humidityReadings.filter((s) => s.zone_id != null && !s.is_outdoor);
  const { chartPoints: humidPoints, chartLines: humidLines } = buildZoneChart(zonedHumidity, zoneNameMap, displayHours);

  const weatherChartData = buildWeatherChart(weather, displayHours);
  const hvacTimeline = buildHvacTimeline(readings, zoneNameMap, displayHours);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">History</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Historical sensor data & trends
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeBar value={range} onChange={setRange} />
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/50 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Temperature Chart */}
      <Card className="p-6">
        <div className="mb-5">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Temperature by Zone
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Zone-averaged indoor temperatures with outdoor reference</p>
        </div>
        <div className="h-80">
          {tempPoints.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tempPoints}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="time" tick={CHART_TICK} stroke={CHART_GRID} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}\u00b0`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }} />
                {tempLines.filter((l) => !l.isOutdoor).map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={2}
                    dot={<AnnotationDot annotations={annotations} />}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                ))}
                {tempLines.filter((l) => l.isOutdoor).map((line) => (
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
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No data for this time range"}
            </div>
          )}
        </div>
      </Card>

      {/* HVAC Activity Timeline */}
      {hvacTimeline.zones.length > 0 && (
        <Card className="p-6">
          <div className="mb-5">
            <h2 className="font-display text-sm font-semibold text-foreground">
              HVAC Activity
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Runtime distribution by zone</p>
          </div>
          <div style={{ height: Math.max(200, hvacTimeline.zones.length * 48 + 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hvacTimeline.data} layout="vertical" barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="zone" tick={CHART_TICK} stroke={CHART_GRID} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="heating" name="Heating" stackId="a" fill="#f97316" radius={0} />
                <Bar dataKey="cooling" name="Cooling" stackId="a" fill="#38bdf8" radius={0} />
                <Bar dataKey="idle" name="Idle" stackId="a" fill="#525252" radius={0} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Indoor Humidity */}
      <Card className="p-6">
        <div className="mb-5">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Indoor Humidity by Zone
          </h2>
        </div>
        <div className="h-64">
          {humidPoints.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={humidPoints}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="time" tick={CHART_TICK} stroke={CHART_GRID} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }} />
                {humidLines.map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={2}
                    dot={<AnnotationDot annotations={annotations} />}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
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

      {/* Weather Details */}
      {weatherChartData.length > 0 && (
        <Card className="p-6">
          <div className="mb-5">
            <h2 className="font-display text-sm font-semibold text-foreground">
              Weather Details
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Temperature, dewpoint, heat index & wind speed</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weatherChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="time" tick={CHART_TICK} stroke={CHART_GRID} interval="preserveStartEnd" />
                <YAxis yAxisId="temp" domain={["auto", "auto"]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}\u00b0`} />
                <YAxis yAxisId="wind" orientation="right" tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v} mph`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "DM Sans" }} />
                <Line yAxisId="temp" type="monotone" dataKey="temperature" name="Temperature" stroke="#fbbf24" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="temp" type="monotone" dataKey="dewpoint" name="Dewpoint" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line yAxisId="temp" type="monotone" dataKey="heat_index" name="Heat Index" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls />
                <Line yAxisId="wind" type="monotone" dataKey="wind_speed" name="Wind Speed" stroke="#a78bfa" strokeWidth={1.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Outdoor Humidity */}
      {weather.some((w) => w.humidity != null) && (
        <Card className="p-6">
          <div className="mb-5">
            <h2 className="font-display text-sm font-semibold text-foreground">
              Outdoor Humidity
            </h2>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weatherChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis dataKey="time" tick={CHART_TICK} stroke={CHART_GRID} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={CHART_TICK} stroke={CHART_GRID} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="humidity" name="Humidity" stroke="#34d399" strokeWidth={2} dot={false} connectNulls />
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
      zoneMap.set(sensor.zone_id, { sensors: [], color: sensor.zone_color || "#38bdf8", isOutdoor: sensor.is_outdoor });
    }
    const group = zoneMap.get(sensor.zone_id)!;
    group.sensors.push(sensor);
    if (sensor.is_outdoor) group.isOutdoor = true;
  }

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
