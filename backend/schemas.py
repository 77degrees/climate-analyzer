from datetime import datetime
from pydantic import BaseModel


# ── Zones ─────────────────────────────────────────────────────

class ZoneCreate(BaseModel):
    name: str
    color: str = "#06b6d4"
    sort_order: int = 0

class ZoneUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    sort_order: int | None = None

class ZoneOut(BaseModel):
    id: int
    name: str
    color: str
    sort_order: int
    model_config = {"from_attributes": True}


# ── Sensors ───────────────────────────────────────────────────

class SensorUpdate(BaseModel):
    friendly_name: str | None = None
    zone_id: int | None = None
    is_outdoor: bool | None = None
    is_tracked: bool | None = None

class SensorOut(BaseModel):
    id: int
    entity_id: str
    friendly_name: str
    domain: str
    device_class: str | None
    unit: str | None
    platform: str | None
    zone_id: int | None
    is_outdoor: bool
    is_tracked: bool
    model_config = {"from_attributes": True}


# ── Readings ──────────────────────────────────────────────────

class ReadingOut(BaseModel):
    timestamp: datetime
    value: float | None
    hvac_action: str | None = None
    hvac_mode: str | None = None
    setpoint_heat: float | None = None
    setpoint_cool: float | None = None
    fan_mode: str | None = None
    model_config = {"from_attributes": True}

class SensorReadings(BaseModel):
    sensor_id: int
    entity_id: str
    friendly_name: str
    zone_id: int | None
    zone_color: str | None = None
    is_outdoor: bool
    readings: list[ReadingOut]


# ── Weather ───────────────────────────────────────────────────

class WeatherOut(BaseModel):
    timestamp: datetime
    source: str
    temperature: float | None
    humidity: float | None
    wind_speed: float | None
    condition: str | None
    pressure: float | None
    dewpoint: float | None
    heat_index: float | None
    model_config = {"from_attributes": True}


# ── Metrics ───────────────────────────────────────────────────

class RecoveryEvent(BaseModel):
    start_time: datetime
    end_time: datetime | None
    duration_minutes: float
    action: str  # heating or cooling
    start_temp: float | None
    end_temp: float | None
    setpoint: float | None
    outdoor_temp: float | None
    success: bool

class DutyCycleDay(BaseModel):
    date: str
    heating_pct: float
    cooling_pct: float
    idle_pct: float
    off_pct: float

class MetricsSummary(BaseModel):
    avg_recovery_minutes: float
    duty_cycle_pct: float
    hold_efficiency: float  # avg drift from setpoint in F
    efficiency_score: float  # 0-100

class EnergyProfileDay(BaseModel):
    date: str
    outdoor_avg_temp: float | None
    heating_hours: float
    cooling_hours: float
    total_runtime_hours: float

class ThermostatInfo(BaseModel):
    sensor_id: int
    entity_id: str
    friendly_name: str
    zone_name: str | None


# ── Settings ──────────────────────────────────────────────────

class SettingsOut(BaseModel):
    ha_url: str
    ha_token_set: bool
    nws_lat: float
    nws_lon: float
    nws_station_id: str
    ha_poll_interval: int
    nws_poll_interval: int

class SettingsUpdate(BaseModel):
    ha_url: str | None = None
    ha_token: str | None = None
    nws_lat: float | None = None
    nws_lon: float | None = None
    nws_station_id: str | None = None
    ha_poll_interval: int | None = None
    nws_poll_interval: int | None = None

class ConnectionTest(BaseModel):
    success: bool
    message: str
    entities_found: int = 0


# ── Dashboard ─────────────────────────────────────────────────

class DashboardStats(BaseModel):
    indoor_temp: float | None
    outdoor_temp: float | None
    delta: float | None
    humidity: float | None
    feels_like: float | None

class HvacStatus(BaseModel):
    entity_id: str
    friendly_name: str
    zone_name: str | None
    zone_color: str | None
    hvac_mode: str | None
    hvac_action: str | None
    current_temp: float | None
    setpoint_heat: float | None
    setpoint_cool: float | None
    fan_mode: str | None

class ZoneCard(BaseModel):
    zone_id: int
    zone_name: str
    zone_color: str
    avg_temp: float | None
    avg_humidity: float | None
    hvac_mode: str | None
    hvac_action: str | None

class DashboardData(BaseModel):
    stats: DashboardStats
    hvac_statuses: list[HvacStatus]
    zone_cards: list[ZoneCard]


# ── Insights ──────────────────────────────────────────────────

class HeatmapCell(BaseModel):
    day_of_week: int   # 0=Mon, 6=Sun
    hour: int          # 0-23
    heating_pct: float
    cooling_pct: float
    active_pct: float  # heating + cooling combined
    sample_count: int

class MonthlyTrend(BaseModel):
    month: str         # "2024-01"
    heating_hours: float
    cooling_hours: float
    total_runtime_hours: float
    avg_outdoor_temp: float | None
    sample_days: int   # days with data in this month

class TempBin(BaseModel):
    range_label: str   # "65–70°F"
    min_temp: float
    max_temp: float
    heating_hours: float
    cooling_hours: float
    day_count: int     # number of days contributing to this bin

class SetpointPoint(BaseModel):
    timestamp: datetime
    setpoint_heat: float | None
    setpoint_cool: float | None
    hvac_action: str | None


# ── DB Stats ──────────────────────────────────────────────────

class DbStats(BaseModel):
    total_readings: int
    total_weather: int
    total_sensors: int
    total_zones: int
    db_size_mb: float
    oldest_reading: datetime | None
    newest_reading: datetime | None
