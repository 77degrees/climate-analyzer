import httpx
import logging

logger = logging.getLogger(__name__)

NWS_BASE = "https://api.weather.gov"
NWS_HEADERS = {
    "User-Agent": "(climate-analyzer, github.com/77degrees/climate-analyzer)",
    "Accept": "application/geo+json",
}


def c_to_f(c: float | None) -> float | None:
    if c is None:
        return None
    return round(c * 9 / 5 + 32, 1)


def kph_to_mph(kph: float | None) -> float | None:
    if kph is None:
        return None
    return round(kph * 0.621371, 1)


def pa_to_inhg(pa: float | None) -> float | None:
    if pa is None:
        return None
    return round(pa * 0.00029530, 2)


class NWSClient:
    """National Weather Service API client."""

    async def resolve_station(self, lat: float, lon: float) -> tuple[str, str | None]:
        """Resolve lat/lon to nearest observation station ID.
        Returns (station_id, forecast_url).
        """
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{NWS_BASE}/points/{lat},{lon}",
                headers=NWS_HEADERS,
            )
            resp.raise_for_status()
            data = resp.json()
            props = data["properties"]
            stations_url = props["observationStations"]
            forecast_url = props.get("forecast")

            resp2 = await client.get(stations_url, headers=NWS_HEADERS)
            resp2.raise_for_status()
            stations = resp2.json()
            station_id = stations["features"][0]["properties"]["stationIdentifier"]
            logger.info(f"Resolved NWS station: {station_id}, forecast: {forecast_url}")
            return station_id, forecast_url

    async def get_forecast_periods(self, forecast_url: str) -> list[dict]:
        """Fetch NWS gridpoint forecast and return simplified period list."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(forecast_url, headers=NWS_HEADERS)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
            periods = data.get("properties", {}).get("periods", [])
            result = []
            for p in periods[:7]:  # next 7 periods (3-4 days)
                result.append({
                    "name": p.get("name", ""),
                    "temperature": p.get("temperature"),
                    "temperature_unit": p.get("temperatureUnit", "F"),
                    "short_forecast": p.get("shortForecast", ""),
                    "wind_speed": p.get("windSpeed", ""),
                    "wind_direction": p.get("windDirection", ""),
                    "is_daytime": p.get("isDaytime", True),
                    "icon": p.get("icon", ""),
                })
            return result

    async def get_latest_observation(self, station_id: str) -> dict | None:
        """Get latest weather observation from a station."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{NWS_BASE}/stations/{station_id}/observations/latest",
                headers=NWS_HEADERS,
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            data = resp.json()
            props = data.get("properties", {})

            def val(field: str) -> float | None:
                v = props.get(field, {})
                if isinstance(v, dict):
                    return v.get("value")
                return None

            return {
                "timestamp": props.get("timestamp"),
                "temperature": c_to_f(val("temperature")),
                "humidity": val("relativeHumidity"),
                "wind_speed": kph_to_mph(val("windSpeed")),
                "condition": props.get("textDescription"),
                "pressure": pa_to_inhg(val("barometricPressure")),
                "dewpoint": c_to_f(val("dewpoint")),
                "heat_index": c_to_f(val("heatIndex")),
            }
