import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import AppSetting, Reading, WeatherObservation, Sensor, Zone
from schemas import SettingsOut, SettingsUpdate, ConnectionTest, DbStats
from services.ha_client import HAClient
from services.nws_client import NWSClient
from config import settings as app_config

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_SETTINGS = {
    "ha_url": app_config.ha_url,
    "ha_token": app_config.ha_token,
    "nws_lat": str(app_config.nws_lat),
    "nws_lon": str(app_config.nws_lon),
    "nws_station_id": app_config.nws_station_id,
    "ha_poll_interval": str(app_config.ha_poll_interval),
    "nws_poll_interval": str(app_config.nws_poll_interval),
}


async def _get_or_default(db: AsyncSession, key: str) -> str:
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        return setting.value
    return DEFAULT_SETTINGS.get(key, "")


async def _set(db: AsyncSession, key: str, value: str):
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = value
    else:
        db.add(AppSetting(key=key, value=value))


@router.get("", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)):
    ha_url = await _get_or_default(db, "ha_url")
    ha_token = await _get_or_default(db, "ha_token")
    return SettingsOut(
        ha_url=ha_url,
        ha_token_set=bool(ha_token),
        nws_lat=float(await _get_or_default(db, "nws_lat") or "30.5788"),
        nws_lon=float(await _get_or_default(db, "nws_lon") or "-97.8531"),
        nws_station_id=await _get_or_default(db, "nws_station_id"),
        ha_poll_interval=int(await _get_or_default(db, "ha_poll_interval") or "300"),
        nws_poll_interval=int(await _get_or_default(db, "nws_poll_interval") or "900"),
    )


@router.put("")
async def update_settings(updates: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    data = updates.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is not None:
            await _set(db, key, str(value))
    await db.commit()
    return await get_settings(db)


@router.post("/test-ha", response_model=ConnectionTest)
async def test_ha_connection(db: AsyncSession = Depends(get_db)):
    ha_url = await _get_or_default(db, "ha_url")
    ha_token = await _get_or_default(db, "ha_token")
    if not ha_url or not ha_token:
        return ConnectionTest(success=False, message="URL or token not set")

    try:
        ha = HAClient(ha_url, ha_token)
        await ha.test_connection()
        entities = await ha.get_climate_entities()
        return ConnectionTest(
            success=True,
            message=f"Connected to Home Assistant",
            entities_found=len(entities),
        )
    except Exception as e:
        return ConnectionTest(success=False, message=str(e))


@router.post("/test-nws", response_model=ConnectionTest)
async def test_nws_connection(db: AsyncSession = Depends(get_db)):
    lat = float(await _get_or_default(db, "nws_lat") or "30.5788")
    lon = float(await _get_or_default(db, "nws_lon") or "-97.8531")
    try:
        nws = NWSClient()
        station, _ = await nws.resolve_station(lat, lon)
        obs = await nws.get_latest_observation(station)
        temp = obs.get("temperature") if obs else "N/A"
        return ConnectionTest(
            success=True,
            message=f"Station {station}: {temp}°F",
            entities_found=1,
        )
    except Exception as e:
        return ConnectionTest(success=False, message=str(e))


@router.get("/db-stats", response_model=DbStats)
async def get_db_stats(db: AsyncSession = Depends(get_db)):
    readings_count = await db.execute(select(func.count(Reading.id)))
    weather_count = await db.execute(select(func.count(WeatherObservation.id)))
    sensor_count = await db.execute(select(func.count(Sensor.id)))
    zone_count = await db.execute(select(func.count(Zone.id)))

    oldest = await db.execute(select(func.min(Reading.timestamp)))
    newest = await db.execute(select(func.max(Reading.timestamp)))

    db_path = app_config.data_dir / app_config.db_filename
    db_size = db_path.stat().st_size / (1024 * 1024) if db_path.exists() else 0

    return DbStats(
        total_readings=readings_count.scalar() or 0,
        total_weather=weather_count.scalar() or 0,
        total_sensors=sensor_count.scalar() or 0,
        total_zones=zone_count.scalar() or 0,
        db_size_mb=round(db_size, 2),
        oldest_reading=oldest.scalar(),
        newest_reading=newest.scalar(),
    )
