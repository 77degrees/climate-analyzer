import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";
import { TimeRangeSelector } from "@/components/shared/TimeRangeSelector";
import {
  getReadings,
  getWeatherHistory,
  type SensorReadings,
  type WeatherPoint,
} from "@/lib/api";

export default function History() {
  const [hours, setHours] = useState(24);
  const [readings, setReadings] = useState<SensorReadings[]>([]);
  const [weather, setWeather] = useState<WeatherPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r, w] = await Promise.all([
        getReadings(hours),
        getWeatherHistory(hours),
      ]);
      setReadings(r);
      setWeather(w);
    } catch (e) {
      console.error("Failed to fetch history:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [hours]);

  // Build temperature chart data
  const tempData = buildTempChart(readings, weather, hours);
  const humidityData = buildHumidityChart(weather);

  // Get all indoor sensors for legend
  const indoorSensors = readings.filter((s) => !s.is_outdoor && s.readings.length > 0);

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

      {/* Temperature Chart */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
          Temperature
        </h2>
        <div className="h-80">
          {tempData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tempData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                  stroke="hsl(222, 20%, 18%)"
                  interval="preserveStartEnd"
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
                {indoorSensors.map((sensor) => (
                  <Line
                    key={sensor.sensor_id}
                    type="monotone"
                    dataKey={sensor.entity_id}
                    name={sensor.friendly_name}
                    stroke={sensor.zone_color || "#06b6d4"}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="outdoor"
                  name="Outdoor"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No data for this time range"}
            </div>
          )}
        </div>
      </Card>

      {/* Humidity Chart */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
          Outdoor Humidity
        </h2>
        <div className="h-64">
          {humidityData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={humidityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                  stroke="hsl(222, 20%, 18%)"
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                  stroke="hsl(222, 20%, 18%)"
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 41%, 8%)",
                    border: "1px solid hsl(222, 20%, 18%)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="humidity"
                  name="Humidity"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No weather data"}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function buildTempChart(
  sensors: SensorReadings[],
  weather: WeatherPoint[],
  hours: number,
): Record<string, any>[] {
  const timeMap = new Map<string, Record<string, any>>();

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    if (hours <= 24) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  for (const sensor of sensors) {
    if (sensor.is_outdoor) continue;
    for (const r of sensor.readings) {
      const key = r.timestamp;
      if (!timeMap.has(key)) {
        timeMap.set(key, { time: formatTime(key), _ts: key });
      }
      timeMap.get(key)![sensor.entity_id] = r.value;
    }
  }

  for (const w of weather) {
    const key = w.timestamp;
    if (!timeMap.has(key)) {
      timeMap.set(key, { time: formatTime(key), _ts: key });
    }
    timeMap.get(key)!.outdoor = w.temperature;
  }

  return Array.from(timeMap.values()).sort((a, b) =>
    a._ts.localeCompare(b._ts),
  );
}

function buildHumidityChart(weather: WeatherPoint[]): Record<string, any>[] {
  return weather
    .filter((w) => w.humidity != null)
    .map((w) => ({
      time: new Date(w.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      humidity: w.humidity,
    }));
}
