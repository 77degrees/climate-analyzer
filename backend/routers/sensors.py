from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Sensor, AppSetting
from schemas import SensorOut, SensorUpdate
from services.ha_client import HAClient
from services.discovery import discover_sensors

router = APIRouter(prefix="/api/sensors", tags=["sensors"])


@router.get("", response_model=list[SensorOut])
async def list_sensors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sensor).order_by(Sensor.domain, Sensor.friendly_name))
    return result.scalars().all()


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
