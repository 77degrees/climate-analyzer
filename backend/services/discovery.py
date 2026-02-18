import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Sensor
from services.ha_client import HAClient

logger = logging.getLogger(__name__)

# Platforms whose sensors we never want to track (noisy/irrelevant)
EXCLUDED_PLATFORMS = {"eight_sleep", "eightsleep"}

# Device classes that are auto-tracked (beyond climate.* and weather.*)
AUTO_TRACKED_DEVICE_CLASSES = {"moisture", "power", "energy"}


async def discover_sensors(ha: HAClient, db: AsyncSession) -> int:
    """Auto-discover climate entities from HA and upsert into sensors table.
    Returns count of newly discovered sensors."""
    states = await ha.get_all_relevant_states()
    platforms = await ha.get_entity_platforms()
    new_count = 0

    for state in states:
        eid = state["entity_id"]
        attrs = state.get("attributes", {})
        domain = eid.split(".")[0]

        # Check if sensor already exists
        existing = await db.execute(select(Sensor).where(Sensor.entity_id == eid))
        sensor = existing.scalar_one_or_none()

        friendly_name = attrs.get("friendly_name", eid)
        device_class = attrs.get("device_class")
        unit = attrs.get("unit_of_measurement")
        platform = platforms.get(eid, "")

        # Skip sensors from excluded platforms (e.g., Eight Sleep bed sensors)
        if platform in EXCLUDED_PLATFORMS:
            if sensor and sensor.is_tracked:
                sensor.is_tracked = False
                logger.info(f"Untracking excluded platform sensor: {eid} [{platform}]")
            continue

        # For climate entities, set device_class to temperature
        if domain == "climate":
            device_class = "temperature"
            unit = attrs.get("temperature_unit", "°F")

        if sensor:
            # Update fields that may have changed
            sensor.friendly_name = friendly_name
            if platform:
                sensor.platform = platform
        else:
            # Auto-track climate, weather, and specific device classes (moisture, power)
            auto_track = (
                domain in ("climate", "weather")
                or device_class in AUTO_TRACKED_DEVICE_CLASSES
            )
            sensor = Sensor(
                entity_id=eid,
                friendly_name=friendly_name,
                domain=domain,
                device_class=device_class,
                unit=unit,
                platform=platform,
                is_outdoor=domain == "weather",
                is_tracked=auto_track,
            )
            db.add(sensor)
            new_count += 1
            logger.info(f"Discovered sensor: {eid} ({friendly_name}) [{platform}]")

    await db.commit()
    logger.info(f"Discovery complete: {new_count} new sensors, {len(states)} total")
    return new_count
