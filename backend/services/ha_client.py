import httpx
import logging

logger = logging.getLogger(__name__)


class HAClient:
    """Home Assistant REST API client."""

    def __init__(self, url: str, token: str):
        self.base_url = url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def test_connection(self) -> dict:
        """Test HA connection, returns API discovery response."""
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{self.base_url}/api/", headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    async def get_states(self) -> list[dict]:
        """Get all entity states."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{self.base_url}/api/states", headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    async def get_state(self, entity_id: str) -> dict:
        """Get a single entity state."""
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{self.base_url}/api/states/{entity_id}", headers=self.headers
            )
            resp.raise_for_status()
            return resp.json()

    async def get_climate_entities(self) -> list[dict]:
        """Filter states to climate-relevant entities."""
        states = await self.get_states()
        relevant = []
        for state in states:
            eid = state.get("entity_id", "")
            attrs = state.get("attributes", {})
            domain = eid.split(".")[0] if "." in eid else ""

            if domain == "climate":
                relevant.append(state)
            elif domain == "sensor":
                dc = attrs.get("device_class", "")
                if dc in ("temperature", "humidity"):
                    relevant.append(state)
            elif domain == "weather":
                relevant.append(state)

        return relevant

    def parse_climate_state(self, state: dict) -> dict:
        """Extract structured data from a climate entity state."""
        attrs = state.get("attributes", {})
        return {
            "entity_id": state["entity_id"],
            "friendly_name": attrs.get("friendly_name", state["entity_id"]),
            "current_temperature": attrs.get("current_temperature"),
            "current_humidity": attrs.get("current_humidity"),
            "hvac_action": attrs.get("hvac_action"),
            "hvac_mode": state.get("state"),
            "temperature": attrs.get("temperature"),  # single setpoint
            "target_temp_high": attrs.get("target_temp_high"),
            "target_temp_low": attrs.get("target_temp_low"),
            "fan_mode": attrs.get("fan_mode"),
        }

    def parse_sensor_state(self, state: dict) -> dict:
        """Extract data from a sensor entity state."""
        attrs = state.get("attributes", {})
        value = state.get("state")
        try:
            value = float(value)
        except (ValueError, TypeError):
            value = None
        return {
            "entity_id": state["entity_id"],
            "friendly_name": attrs.get("friendly_name", state["entity_id"]),
            "device_class": attrs.get("device_class"),
            "unit": attrs.get("unit_of_measurement"),
            "value": value,
        }
