from fastapi import APIRouter, Depends
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from database import get_db
from models import Sensor, Reading

router = APIRouter(prefix="/api/solar", tags=["solar"])


class SolarStatus(BaseModel):
    current_production_w: float | None = None
    current_consumption_kw: float | None = None
    net_consumption_kw: float | None = None      # positive = buying from grid, negative = exporting
    energy_today_kwh: float | None = None
    energy_7d_kwh: float | None = None
    forecast_today_kwh: float | None = None
    forecast_tomorrow_kwh: float | None = None
    battery_power_w: float | None = None          # positive = charging, negative = discharging
    rain_active: bool | None = None
    rain_entity: str | None = None


async def _latest(db: AsyncSession, sensor_id: int) -> float | None:
    r = await db.execute(
        select(Reading)
        .where(Reading.sensor_id == sensor_id)
        .order_by(Reading.timestamp.desc())
        .limit(1)
    )
    reading = r.scalar_one_or_none()
    return reading.value if reading else None


@router.get("", response_model=SolarStatus)
async def get_solar_status(db: AsyncSession = Depends(get_db)):
    q = await db.execute(
        select(Sensor).where(
            or_(
                Sensor.platform.in_(["enphase_envoy", "forecast_solar", "rachio"]),
                and_(Sensor.domain == "binary_sensor", Sensor.device_class == "moisture"),
            )
        )
    )
    by_eid = {s.entity_id: s for s in q.scalars().all()}

    def find_one(*keywords, platform=None):
        """First sensor whose entity_id contains all keywords (and optional platform match)."""
        for eid, s in by_eid.items():
            if platform and s.platform != platform:
                continue
            if all(k in eid.lower() for k in keywords):
                return s
        return None

    def find_many(*keywords, platform=None):
        return [
            s for eid, s in by_eid.items()
            if (not platform or s.platform == platform)
            and all(k in eid.lower() for k in keywords)
        ]

    # Current solar production (W)
    prod = find_one("current_power_production", platform="enphase_envoy")
    prod_w = await _latest(db, prod.id) if prod else None

    # Current house consumption (kW from envoy; unit may be kW)
    cons = find_one("current_power_consumption", platform="enphase_envoy")
    cons_kw = await _latest(db, cons.id) if cons else None
    if cons_kw is not None and cons and (cons.unit or "").upper() == "W":
        cons_kw /= 1000

    # Net consumption (kW; positive = buying, negative = exporting)
    net = find_one("current_net_power_consumption", platform="enphase_envoy")
    net_kw = await _latest(db, net.id) if net else None
    if net_kw is not None and net and (net.unit or "").upper() == "W":
        net_kw /= 1000

    # Energy produced today (kWh)
    today_s = find_one("energy_production_today", platform="enphase_envoy")
    energy_today = await _latest(db, today_s.id) if today_s else None

    # Energy produced last 7 days (kWh)
    seven_d = find_one("energy_production_last_seven_days", platform="enphase_envoy")
    energy_7d = await _latest(db, seven_d.id) if seven_d else None

    # Forecast from forecast_solar integration (prefer non-_2 variant)
    ft = find_one("energy_production_today", platform="forecast_solar")
    if ft and ft.entity_id.endswith("_2"):
        alt = next((s for eid, s in by_eid.items() if s.platform == "forecast_solar"
                    and "energy_production_today" in eid and not eid.endswith("_2")), None)
        if alt:
            ft = alt
    forecast_today = await _latest(db, ft.id) if ft else None

    ftm = find_one("energy_production_tomorrow", platform="forecast_solar")
    if ftm and ftm.entity_id.endswith("_2"):
        alt = next((s for eid, s in by_eid.items() if s.platform == "forecast_solar"
                    and "energy_production_tomorrow" in eid and not eid.endswith("_2")), None)
        if alt:
            ftm = alt
    forecast_tomorrow = await _latest(db, ftm.id) if ftm else None

    # Battery power (W): sum of encharge units; positive=charging, negative=discharging
    battery_w: float | None = None
    for s in find_many("encharge", "power", platform="enphase_envoy"):
        val = await _latest(db, s.id)
        if val is not None:
            battery_w = (battery_w or 0.0) + val

    # Rachio rain sensor
    rain_active: bool | None = None
    rain_entity: str | None = None
    for s in find_many("rain_sensor", platform="rachio"):
        val = await _latest(db, s.id)
        if val is not None:
            rain_active = val == 1.0
            rain_entity = s.friendly_name
            break

    return SolarStatus(
        current_production_w=round(prod_w) if prod_w is not None else None,
        current_consumption_kw=round(cons_kw, 2) if cons_kw is not None else None,
        net_consumption_kw=round(net_kw, 2) if net_kw is not None else None,
        energy_today_kwh=round(energy_today, 1) if energy_today is not None else None,
        energy_7d_kwh=round(energy_7d, 1) if energy_7d is not None else None,
        forecast_today_kwh=round(forecast_today, 1) if forecast_today is not None else None,
        forecast_tomorrow_kwh=round(forecast_tomorrow, 1) if forecast_tomorrow is not None else None,
        battery_power_w=round(battery_w) if battery_w is not None else None,
        rain_active=rain_active,
        rain_entity=rain_entity,
    )
