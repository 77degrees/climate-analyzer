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

export interface EnergyProfileDay {
  date: string;
  outdoor_avg_temp: number | null;
  heating_hours: number;
  cooling_hours: number;
  total_runtime_hours: number;
}

export interface ThermostatInfo {
  sensor_id: number;
  entity_id: string;
  friendly_name: string;
  zone_name: string | null;
}

// ── API calls ────────────────────────────────────────────────

export const getDashboard = () => fetchJSON<DashboardData>("/dashboard");
export const getReadings = (hours: number, deviceClass?: string) =>
  fetchJSON<SensorReadings[]>(`/readings?hours=${hours}${deviceClass ? `&device_class=${deviceClass}` : ""}`);
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

export const getRecoveryEvents = (days: number, sensorId?: number) =>
  fetchJSON<RecoveryEvent[]>(`/metrics/recovery?days=${days}${sensorId ? `&sensor_id=${sensorId}` : ""}`);
export const getDutyCycle = (days: number, sensorId?: number) =>
  fetchJSON<DutyCycleDay[]>(`/metrics/duty-cycle?days=${days}${sensorId ? `&sensor_id=${sensorId}` : ""}`);
export const getMetricsSummary = (days: number, sensorId?: number) =>
  fetchJSON<MetricsSummary>(`/metrics/summary?days=${days}${sensorId ? `&sensor_id=${sensorId}` : ""}`);
export const getEnergyProfile = (days: number, sensorId?: number) =>
  fetchJSON<EnergyProfileDay[]>(`/metrics/energy-profile?days=${days}${sensorId ? `&sensor_id=${sensorId}` : ""}`);
export const getThermostats = () => fetchJSON<ThermostatInfo[]>("/metrics/thermostats");

// ── Insights types ────────────────────────────────────────────

export interface HeatmapCell {
  day_of_week: number;   // 0=Mon, 6=Sun
  hour: number;          // 0-23
  heating_pct: number;
  cooling_pct: number;
  active_pct: number;
  sample_count: number;
}

export interface MonthlyTrend {
  month: string;          // "2024-01"
  heating_hours: number;
  cooling_hours: number;
  total_runtime_hours: number;
  avg_outdoor_temp: number | null;
  sample_days: number;
}

export interface TempBin {
  range_label: string;    // "65–70°F"
  min_temp: number;
  max_temp: number;
  heating_hours: number;
  cooling_hours: number;
  day_count: number;
}

export interface SetpointPoint {
  timestamp: string;
  setpoint_heat: number | null;
  setpoint_cool: number | null;
  hvac_action: string | null;
}

export interface AcStruggleDay {
  date: string;
  outdoor_high: number | null;
  outdoor_avg: number | null;
  hours_cooling: number;
  max_overshoot: number;     // indoor_temp - setpoint_cool while cooling; positive = struggling
  avg_overshoot: number;
  struggle_hours: number;    // hours where overshoot > 0.5°F
  struggle_score: number;    // 0–100 severity composite
}

// ── Insights API calls ────────────────────────────────────────

export const getActivityHeatmap = (days: number, sensorId?: number) =>
  fetchJSON<HeatmapCell[]>(`/metrics/heatmap?days=${days}${sensorId ? `&sensor_id=${sensorId}` : ""}`);
export const getMonthlyTrends = (months: number, sensorId?: number) =>
  fetchJSON<MonthlyTrend[]>(`/metrics/monthly?months=${months}${sensorId ? `&sensor_id=${sensorId}` : ""}`);
export const getTempBins = (days: number, sensorId?: number) =>
  fetchJSON<TempBin[]>(`/metrics/temp-bins?days=${days}${sensorId ? `&sensor_id=${sensorId}` : ""}`);
export const getSetpointHistory = (days: number, sensorId?: number) =>
  fetchJSON<SetpointPoint[]>(`/metrics/setpoints?days=${days}${sensorId ? `&sensor_id=${sensorId}` : ""}`);
export const getAcStruggle = (days: number, sensorId?: number) =>
  fetchJSON<AcStruggleDay[]>(`/metrics/ac-struggle?days=${days}${sensorId ? `&sensor_id=${sensorId}` : ""}`);

// ── Zone thermal performance ──────────────────────────────────

export interface ZoneThermalPerf {
  zone_id: number;
  zone_name: string;
  zone_color: string;
  hot_days_count: number;
  avg_temp_hot_days: number | null;
  avg_delta_hot: number | null;      // indoor - outdoor on hot days; positive = zone runs hotter
  cold_days_count: number;
  avg_temp_cold_days: number | null;
  avg_delta_cold: number | null;     // outdoor - indoor on cold days; positive = zone runs colder
  has_portable_ac: boolean;
  portable_ac_days: number;
  avg_temp_recent_7d: number | null;
  avg_temp_prior_7d: number | null;
  weekly_trend: number | null;       // positive = getting warmer this week vs last
}

export const getZoneThermalPerf = (days = 365) =>
  fetchJSON<ZoneThermalPerf[]>(`/metrics/zone-performance?days=${days}`);

// ── Custom date range readings ───────────────────────────────

export const getReadingsRange = (start: string, end: string, deviceClass?: string) =>
  fetchJSON<SensorReadings[]>(
    `/readings?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${deviceClass ? `&device_class=${deviceClass}` : ""}`,
  );

export const getWeatherHistoryRange = (start: string, end: string) =>
  fetchJSON<WeatherPoint[]>(
    `/weather/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
  );

// ── Annotations ──────────────────────────────────────────────

export interface Annotation {
  id: number;
  timestamp: string;
  label: string;
  note: string | null;
  color: string;
}

export const getAnnotations = () => fetchJSON<Annotation[]>("/annotations");
export const createAnnotation = (data: { timestamp: string; label: string; note?: string; color?: string }) =>
  fetchJSON<Annotation>("/annotations", { method: "POST", body: JSON.stringify(data) });
export const deleteAnnotation = (id: number) =>
  fetchJSON<void>(`/annotations/${id}`, { method: "DELETE" });

