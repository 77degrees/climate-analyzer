import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Sensor, Reading, WeatherObservation, AppSetting
from services.ha_client import HAClient
from services.nws_client import NWSClient
from database import async_session
from config import settings as app_config

logger = logging.getLogger(__name__)


async def _get_setting(db: AsyncSession, key: str) -> str | None:
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def _get_ha_client(db: AsyncSession) -> HAClient | None:
    url = await _get_setting(db, "ha_url")
    token = await _get_setting(db, "ha_token")
    if not url or not token:
        return None
    return HAClient(url, token)


async def collect_ha_readings():
    """Poll HA for all tracked sensor states and insert readings."""
    async with async_session() as db:
        ha = await _get_ha_client(db)
        if not ha:
            logger.debug("HA not configured, skipping collection")
            return

        try:
            states = await ha.get_states()
        except Exception as e:
            logger.error(f"Failed to poll HA: {e}")
            return

        # Build lookup of tracked sensors
        result = await db.execute(select(Sensor).where(Sensor.is_tracked == True))
        tracked = {s.entity_id: s for s in result.scalars().all()}

        now = datetime.now(timezone.utc)
        count = 0

        for state in states:
            eid = state.get("entity_id", "")
            if eid not in tracked:
                continue

            sensor = tracked[eid]
            domain = eid.split(".")[0]
            attrs = state.get("attributes", {})

            if domain == "climate":
                reading = Reading(
                    sensor_id=sensor.id,
                    timestamp=now,
                    value=attrs.get("current_temperature"),
                    hvac_action=attrs.get("hvac_action"),
                    hvac_mode=state.get("state"),
                    setpoint_heat=attrs.get("target_temp_low") or attrs.get("temperature"),
                    setpoint_cool=attrs.get("target_temp_high") or attrs.get("temperature"),
                    fan_mode=attrs.get("fan_mode"),
                )
            elif domain == "sensor":
                try:
                    val = float(state.get("state", ""))
                except (ValueError, TypeError):
                    val = None
                reading = Reading(
                    sensor_id=sensor.id,
                    timestamp=now,
                    value=val,
                )
            elif domain == "binary_sensor":
                # Store moisture sensors as 1.0 (wet) or 0.0 (dry/unknown)
                raw = state.get("state", "off").lower()
                val = 1.0 if raw == "on" else 0.0
                reading = Reading(
                    sensor_id=sensor.id,
                    timestamp=now,
                    value=val,
                )
            else:
                continue

            db.add(reading)
            count += 1

        await db.commit()
        logger.info(f"Collected {count} readings from HA")


async def collect_nws_observation():
    """Poll NWS for latest weather observation."""
    async with async_session() as db:
        station_id = await _get_setting(db, "nws_station_id")
        if not station_id:
            # Try to resolve — use DB values or fall back to config defaults
            lat_str = await _get_setting(db, "nws_lat") or str(app_config.nws_lat)
            lon_str = await _get_setting(db, "nws_lon") or str(app_config.nws_lon)
            if not lat_str or not lon_str:
                logger.debug("NWS not configured, skipping")
                return

            try:
                nws = NWSClient()
                station_id, forecast_url = await nws.resolve_station(float(lat_str), float(lon_str))
                db.add(AppSetting(key="nws_station_id", value=station_id))
                if forecast_url:
                    result2 = await db.execute(select(AppSetting).where(AppSetting.key == "nws_forecast_url"))
                    existing_fu = result2.scalar_one_or_none()
                    if existing_fu:
                        existing_fu.value = forecast_url
                    else:
                        db.add(AppSetting(key="nws_forecast_url", value=forecast_url))
                await db.commit()
            except Exception as e:
                logger.error(f"Failed to resolve NWS station: {e}")
                return

        try:
            nws = NWSClient()
            obs = await nws.get_latest_observation(station_id)
        except Exception as e:
            logger.error(f"Failed to poll NWS: {e}")
            return

        if not obs:
            return

        ts = obs.get("timestamp")
        if ts:
            try:
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                ts = datetime.now(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        weather = WeatherObservation(
            timestamp=ts,
            source="nws",
            temperature=obs.get("temperature"),
            humidity=obs.get("humidity"),
            wind_speed=obs.get("wind_speed"),
            condition=obs.get("condition"),
            pressure=obs.get("pressure"),
            dewpoint=obs.get("dewpoint"),
            heat_index=obs.get("heat_index"),
        )
        db.add(weather)
        await db.commit()
        logger.info(f"Collected NWS observation: {obs.get('temperature')}°F")
