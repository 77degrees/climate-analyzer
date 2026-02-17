export const API_BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    let message = `API error: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) message = body.detail;
    } catch {}
    throw new Error(message);
  }
  return (await response.json()) as T;
}

// ── Types ────────────────────────────────────────────────────

export interface DashboardStats {
  indoor_temp: number | null;
  outdoor_temp: number | null;
  delta: number | null;
  humidity: number | null;
  feels_like: number | null;
}

export interface HvacStatus {
  entity_id: string;
  friendly_name: string;
  zone_name: string | null;
  zone_color: string | null;
  hvac_mode: string | null;
  hvac_action: string | null;
  current_temp: number | null;
  setpoint_heat: number | null;
  setpoint_cool: number | null;
  fan_mode: string | null;
}

export interface ZoneCard {
  zone_id: number;
  zone_name: string;
  zone_color: string;
  avg_temp: number | null;
  avg_humidity: number | null;
  hvac_mode: string | null;
  hvac_action: string | null;
}

export interface DashboardData {
  stats: DashboardStats;
  hvac_statuses: HvacStatus[];
  zone_cards: ZoneCard[];
}

export interface ReadingPoint {
  timestamp: string;
  value: number | null;
  hvac_action?: string | null;
  hvac_mode?: string | null;
  setpoint_heat?: number | null;
  setpoint_cool?: number | null;
}

export interface SensorReadings {
  sensor_id: number;
  entity_id: string;
  friendly_name: string;
  zone_id: number | null;
  zone_color: string | null;
  is_outdoor: boolean;
  readings: ReadingPoint[];
}

export interface WeatherPoint {
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
  condition: string | null;
  pressure: number | null;
  dewpoint: number | null;
  heat_index: number | null;
}

export interface Sensor {
  id: number;
  entity_id: string;
  friendly_name: string;
  domain: string;
  device_class: string | null;
  unit: string | null;
  platform: string | null;
  zone_id: number | null;
  is_outdoor: boolean;
  is_tracked: boolean;
}

export interface Zone {
  id: number;
  name: string;
  color: string;
  sort_order: number;
}

export interface Settings {
  ha_url: string;
  ha_token_set: boolean;
  nws_lat: number;
  nws_lon: number;
  nws_station_id: string;
  ha_poll_interval: number;
  nws_poll_interval: number;
}

export interface ConnectionTest {
  success: boolean;
  message: string;
  entities_found: number;
}

export interface DbStats {
  total_readings: number;
  total_weather: number;
  total_sensors: number;
  total_zones: number;
  db_size_mb: number;
  oldest_reading: string | null;
  newest_reading: string | null;
}

export interface SensorWithZone extends Sensor {
  zone_name: string | null;
  zone_color: string | null;
  platform: string | null;
}

export interface LiveState {
  state: string;
  value: number | null;
  unit: string | null;
  hvac_action: string | null;
  hvac_mode: string | null;
  last_updated: string | null;
  last_changed: string | null;
}

export interface RecoveryEvent {
  start_time: string;
  end_time: string | null;
  duration_minutes: number;
  action: string;
  start_temp: number | null;
  end_temp: number | null;
  setpoint: number | null;
  outdoor_temp: number | null;
  success: boolean;
}

export interface DutyCycleDay {
  date: string;
  heating_pct: number;
  cooling_pct: number;
  idle_pct: number;
  off_pct: number;
}

export interface MetricsSummary {
  avg_recovery_minutes: number;
  duty_cycle_pct: number;
  hold_efficiency: number;
  efficiency_score: number;
}

// ── API calls ────────────────────────────────────────────────

export const getDashboard = () => fetchJSON<DashboardData>("/dashboard");
export const getReadings = (hours: number) => fetchJSON<SensorReadings[]>(`/readings?hours=${hours}`);
export const getWeatherHistory = (hours: number) => fetchJSON<WeatherPoint[]>(`/weather/history?hours=${hours}`);
export const getCurrentWeather = () => fetchJSON<WeatherPoint | null>("/weather/current");

export const getSensors = () => fetchJSON<Sensor[]>("/sensors");
export const getSensorsWithZones = () => fetchJSON<SensorWithZone[]>("/sensors/with-zones");
export const getLiveStates = () => fetchJSON<Record<string, LiveState>>("/sensors/live-states");
export const updateSensor = (id: number, data: Partial<Sensor>) =>
  fetchJSON<Sensor>(`/sensors/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const discoverSensors = () => fetchJSON<{ discovered: number }>("/sensors/discover", { method: "POST" });

export const getZones = () => fetchJSON<Zone[]>("/zones");
export const createZone = (data: { name: string; color: string }) =>
  fetchJSON<Zone>("/zones", { method: "POST", body: JSON.stringify(data) });
export const updateZone = (id: number, data: Partial<Zone>) =>
  fetchJSON<Zone>(`/zones/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteZone = (id: number) =>
  fetchJSON<void>(`/zones/${id}`, { method: "DELETE" });

export const getSettings = () => fetchJSON<Settings>("/settings");
export const updateSettings = (data: Record<string, string | number>) =>
  fetchJSON<Settings>("/settings", { method: "PUT", body: JSON.stringify(data) });
export const testHA = () => fetchJSON<ConnectionTest>("/settings/test-ha", { method: "POST" });
export const testNWS = () => fetchJSON<ConnectionTest>("/settings/test-nws", { method: "POST" });
export const getDbStats = () => fetchJSON<DbStats>("/settings/db-stats");

export const getRecoveryEvents = (days: number) => fetchJSON<RecoveryEvent[]>(`/metrics/recovery?days=${days}`);
export const getDutyCycle = (days: number) => fetchJSON<DutyCycleDay[]>(`/metrics/duty-cycle?days=${days}`);
export const getMetricsSummary = (days: number) => fetchJSON<MetricsSummary>(`/metrics/summary?days=${days}`);
