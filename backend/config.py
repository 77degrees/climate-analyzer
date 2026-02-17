from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # Home Assistant
    ha_url: str = "http://homeassistant.local:8123"
    ha_token: str = ""

    # NWS API (default: Leander, TX)
    nws_lat: float = 30.5788
    nws_lon: float = -97.8531
    nws_station_id: str = ""  # auto-resolved from coords

    # Polling intervals (seconds)
    ha_poll_interval: int = 300  # 5 min
    nws_poll_interval: int = 900  # 15 min

    # Database
    data_dir: Path = Path("/app/data")
    db_filename: str = "climate.db"

    # Server
    host: str = "0.0.0.0"
    port: int = 8400

    @property
    def database_url(self) -> str:
        db_path = self.data_dir / self.db_filename
        return f"sqlite+aiosqlite:///{db_path}"

    model_config = {"env_prefix": "", "env_file": ".env", "extra": "ignore"}


settings = Settings()
