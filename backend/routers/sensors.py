from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Sensor, AppSetting, Zone
from schemas import SensorOut, SensorUpdate
from services.ha_client import HAClient
from services.discovery import discover_sensors

router = APIRouter(prefix="/api/sensors", tags=["sensors"])


@router.get("", response_model=list[SensorOut])
async def list_sensors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sensor).order_by(Sensor.domain, Sensor.friendly_name))
    return result.scalars().all()


@router.get("/live-states")
async def get_live_states(db: AsyncSession = Depends(get_db)):
    """Get current live state from HA for all discovered sensors."""
    url_row = await db.execute(select(AppSetting).where(AppSetting.key == "ha_url"))
    token_row = await db.execute(select(AppSetting).where(AppSetting.key == "ha_token"))
    url = url_row.scalar_one_or_none()
    token = token_row.scalar_one_or_none()
    if not url or not token or not url.value or not token.value:
        return {}

    ha = HAClient(url.value, token.value)
    try:
        states = await ha.get_states()
    except Exception:
        return {}

    # Build entity_id -> current state map
    state_map = {}
    for s in states:
        eid = s.get("entity_id", "")
        attrs = s.get("attributes", {})
        state_val = s.get("state", "")

        # Try to get a numeric value
        value = None
        if s.get("state") not in ("unavailable", "unknown", ""):
            try:
                value = float(s["state"])
            except (ValueError, TypeError):
                pass

        # For climate entities, use current_temperature
        domain = eid.split(".")[0] if "." in eid else ""
        if domain == "climate":
            value = attrs.get("current_temperature")

        state_map[eid] = {
            "state": state_val,
            "value": value,
            "unit": attrs.get("unit_of_measurement"),
            "hvac_action": attrs.get("hvac_action"),
            "hvac_mode": s.get("state") if domain == "climate" else None,
            "last_updated": s.get("last_updated"),
            "last_changed": s.get("last_changed"),
        }

    return state_map


@router.get("/with-zones")
async def list_sensors_with_zones(db: AsyncSession = Depends(get_db)):
    """Get all sensors with their zone info."""
    result = await db.execute(select(Sensor).order_by(Sensor.domain, Sensor.friendly_name))
    sensors = result.scalars().all()

    zone_result = await db.execute(select(Zone))
    zones = {z.id: {"name": z.name, "color": z.color} for z in zone_result.scalars().all()}

    output = []
    for s in sensors:
        zone_info = zones.get(s.zone_id) if s.zone_id else None
        output.append({
            "id": s.id,
            "entity_id": s.entity_id,
            "friendly_name": s.friendly_name,
            "domain": s.domain,
            "device_class": s.device_class,
            "unit": s.unit,
            "platform": s.platform,
            "zone_id": s.zone_id,
            "zone_name": zone_info["name"] if zone_info else None,
            "zone_color": zone_info["color"] if zone_info else None,
            "is_outdoor": s.is_outdoor,
            "is_tracked": s.is_tracked,
        })

    return output


@router.get("/{sensor_id}", response_model=SensorOut)
async def get_sensor(sensor_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sensor).where(Sensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(404, "Sensor not found")
    return sensor


@router.patch("/{sensor_id}", response_model=SensorOut)
async def update_sensor(
    sensor_id: int, updates: SensorUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Sensor).where(Sensor.id == sensor_id))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(404, "Sensor not found")

    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(sensor, field, value)
    await db.commit()
    await db.refresh(sensor)
    return sensor


@router.post("/discover")
async def run_discovery(db: AsyncSession = Depends(get_db)):
    """Trigger sensor auto-discovery from HA."""
    url_row = await db.execute(select(AppSetting).where(AppSetting.key == "ha_url"))
    token_row = await db.execute(select(AppSetting).where(AppSetting.key == "ha_token"))
    url = url_row.scalar_one_or_none()
    token = token_row.scalar_one_or_none()
    if not url or not token or not url.value or not token.value:
        raise HTTPException(400, "Home Assistant not configured")

    ha = HAClient(url.value, token.value)
    count = await discover_sensors(ha, db)
    return {"discovered": count}
