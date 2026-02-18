from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Reading, Sensor, Zone
from schemas import SensorReadings, ReadingOut

router = APIRouter(prefix="/api/readings", tags=["readings"])


@router.get("", response_model=list[SensorReadings])
async def get_readings(
    hours: int = Query(24, ge=1, le=26280),
    start: datetime | None = Query(None, description="Custom range start (ISO datetime)"),
    end: datetime | None = Query(None, description="Custom range end (ISO datetime)"),
    sensor_ids: str | None = Query(None, description="Comma-separated sensor IDs"),
    device_class: str | None = Query(None, description="Filter by device_class (e.g. temperature, humidity)"),
    db: AsyncSession = Depends(get_db),
):
    """Get readings for tracked sensors within time range."""
    if start and end:
        cutoff = start if start.tzinfo else start.replace(tzinfo=timezone.utc)
        end_time = end if end.tzinfo else end.replace(tzinfo=timezone.utc)
    else:
        end_time = datetime.now(timezone.utc)
        cutoff = end_time - timedelta(hours=hours)

    # Get target sensors
    query = select(Sensor).where(Sensor.is_tracked == True)
    if sensor_ids:
        ids = [int(x) for x in sensor_ids.split(",")]
        query = query.where(Sensor.id.in_(ids))
    if device_class:
        query = query.where(Sensor.device_class == device_class)
    result = await db.execute(query)
    sensors = result.scalars().all()

    output = []
    for sensor in sensors:
        readings_q = await db.execute(
            select(Reading)
            .where(
                and_(
                    Reading.sensor_id == sensor.id,
                    Reading.timestamp >= cutoff,
                    Reading.timestamp <= end_time,
                )
            )
            .order_by(Reading.timestamp)
        )
        readings = readings_q.scalars().all()

        # Get zone color
        zone_color = None
        if sensor.zone_id:
            zone_q = await db.execute(select(Zone).where(Zone.id == sensor.zone_id))
            zone = zone_q.scalar_one_or_none()
            zone_color = zone.color if zone else None

        output.append(
            SensorReadings(
                sensor_id=sensor.id,
                entity_id=sensor.entity_id,
                friendly_name=sensor.friendly_name,
                zone_id=sensor.zone_id,
                zone_color=zone_color,
                is_outdoor=sensor.is_outdoor,
                readings=[ReadingOut.model_validate(r) for r in readings],
            )
        )

    return output


@router.get("/latest")
async def get_latest_readings(db: AsyncSession = Depends(get_db)):
    """Get the most recent reading for each tracked sensor."""
    result = await db.execute(select(Sensor).where(Sensor.is_tracked == True))
    sensors = result.scalars().all()

    output = []
    for sensor in sensors:
        latest_q = await db.execute(
            select(Reading)
            .where(Reading.sensor_id == sensor.id)
            .order_by(Reading.timestamp.desc())
            .limit(1)
        )
        reading = latest_q.scalar_one_or_none()
        if reading:
            output.append({
                "sensor_id": sensor.id,
                "entity_id": sensor.entity_id,
                "friendly_name": sensor.friendly_name,
                "domain": sensor.domain,
                "zone_id": sensor.zone_id,
                "is_outdoor": sensor.is_outdoor,
                "timestamp": reading.timestamp.isoformat(),
                "value": reading.value,
                "hvac_action": reading.hvac_action,
                "hvac_mode": reading.hvac_mode,
                "setpoint_heat": reading.setpoint_heat,
                "setpoint_cool": reading.setpoint_cool,
            })

    return output
