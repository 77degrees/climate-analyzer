import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Sensor
from services.ha_client import HAClient

logger = logging.getLogger(__name__)


async def discover_sensors(ha: HAClient, db: AsyncSession) -> int:
    """Auto-discover climate entities from HA and upsert into sensors table.
    Returns count of newly discovered sensors."""
    states = await ha.get_climate_entities()
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
            sensor = Sensor(
                entity_id=eid,
                friendly_name=friendly_name,
                domain=domain,
                device_class=device_class,
                unit=unit,
                platform=platform,
                is_outdoor=domain == "weather",
                is_tracked=domain in ("climate", "weather"),
            )
            db.add(sensor)
            new_count += 1
            logger.info(f"Discovered sensor: {eid} ({friendly_name}) [{platform}]")

    await db.commit()
    logger.info(f"Discovery complete: {new_count} new sensors, {len(states)} total")
    return new_count
