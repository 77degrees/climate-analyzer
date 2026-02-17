from fastapi import APIRouter, Depends
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Sensor, Reading, WeatherObservation, Zone
from schemas import DashboardData, DashboardStats, HvacStatus, ZoneCard

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardData)
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    # Latest weather
    weather_q = await db.execute(
        select(WeatherObservation)
        .order_by(WeatherObservation.timestamp.desc())
        .limit(1)
    )
    weather = weather_q.scalar_one_or_none()

    outdoor_temp = weather.temperature if weather else None
    outdoor_humidity = weather.humidity if weather else None
    feels_like = weather.heat_index if weather else None

    # Get all tracked climate sensors with their latest readings
    climate_q = await db.execute(
        select(Sensor).where(
            and_(Sensor.domain == "climate", Sensor.is_tracked == True)
        )
    )
    climate_sensors = climate_q.scalars().all()

    hvac_statuses = []
    indoor_temps = []
    indoor_humidities = []

    for sensor in climate_sensors:
        latest_q = await db.execute(
            select(Reading)
            .where(Reading.sensor_id == sensor.id)
            .order_by(Reading.timestamp.desc())
            .limit(1)
        )
        reading = latest_q.scalar_one_or_none()

        zone_name = None
        zone_color = None
        if sensor.zone_id:
            zone_q = await db.execute(select(Zone).where(Zone.id == sensor.zone_id))
            zone = zone_q.scalar_one_or_none()
            if zone:
                zone_name = zone.name
                zone_color = zone.color

        current_temp = reading.value if reading else None
        if current_temp is not None:
            indoor_temps.append(current_temp)

        hvac_statuses.append(HvacStatus(
            entity_id=sensor.entity_id,
            friendly_name=sensor.friendly_name,
            zone_name=zone_name,
            zone_color=zone_color,
            hvac_mode=reading.hvac_mode if reading else None,
            hvac_action=reading.hvac_action if reading else None,
            current_temp=current_temp,
            setpoint_heat=reading.setpoint_heat if reading else None,
            setpoint_cool=reading.setpoint_cool if reading else None,
            fan_mode=reading.fan_mode if reading else None,
        ))

    # Also get humidity sensors for indoor humidity
    humidity_q = await db.execute(
        select(Sensor).where(
            and_(
                Sensor.device_class == "humidity",
                Sensor.is_tracked == True,
                Sensor.is_outdoor == False,
            )
        )
    )
    for sensor in humidity_q.scalars().all():
        latest_q = await db.execute(
            select(Reading)
            .where(Reading.sensor_id == sensor.id)
            .order_by(Reading.timestamp.desc())
            .limit(1)
        )
        reading = latest_q.scalar_one_or_none()
        if reading and reading.value is not None:
            indoor_humidities.append(reading.value)

    avg_indoor = round(sum(indoor_temps) / len(indoor_temps), 1) if indoor_temps else None
    avg_humidity = round(sum(indoor_humidities) / len(indoor_humidities), 1) if indoor_humidities else None

    delta = None
    if avg_indoor is not None and outdoor_temp is not None:
        delta = round(avg_indoor - outdoor_temp, 1)

    stats = DashboardStats(
        indoor_temp=avg_indoor,
        outdoor_temp=outdoor_temp,
        delta=delta,
        humidity=avg_humidity or outdoor_humidity,
        feels_like=feels_like,
    )

    # Zone cards
    zones_q = await db.execute(select(Zone).order_by(Zone.sort_order))
    zones = zones_q.scalars().all()
    zone_cards = []

    for zone in zones:
        # Get sensors in this zone
        zone_sensors_q = await db.execute(
            select(Sensor).where(Sensor.zone_id == zone.id)
        )
        zone_sensors = zone_sensors_q.scalars().all()

        temps = []
        humidities = []
        zone_hvac_mode = None
        zone_hvac_action = None

        for s in zone_sensors:
            latest_q = await db.execute(
                select(Reading)
                .where(Reading.sensor_id == s.id)
                .order_by(Reading.timestamp.desc())
                .limit(1)
            )
            r = latest_q.scalar_one_or_none()
            if r:
                if r.value is not None and s.device_class == "temperature":
                    temps.append(r.value)
                elif r.value is not None and s.device_class == "humidity":
                    humidities.append(r.value)
                if s.domain == "climate":
                    if r.value is not None:
                        temps.append(r.value)
                    zone_hvac_mode = r.hvac_mode
                    zone_hvac_action = r.hvac_action

        zone_cards.append(ZoneCard(
            zone_id=zone.id,
            zone_name=zone.name,
            zone_color=zone.color,
            avg_temp=round(sum(temps) / len(temps), 1) if temps else None,
            avg_humidity=round(sum(humidities) / len(humidities), 1) if humidities else None,
            hvac_mode=zone_hvac_mode,
            hvac_action=zone_hvac_action,
        ))

    return DashboardData(
        stats=stats,
        hvac_statuses=hvac_statuses,
        zone_cards=zone_cards,
    )
