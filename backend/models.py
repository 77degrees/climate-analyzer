from datetime import datetime
from sqlalchemy import String, Float, Boolean, Integer, DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Zone(Base):
    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    color: Mapped[str] = mapped_column(String(7), default="#06b6d4")  # hex color
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    sensors: Mapped[list["Sensor"]] = relationship(back_populates="zone")


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    friendly_name: Mapped[str] = mapped_column(String(255), default="")
    domain: Mapped[str] = mapped_column(String(50))  # climate, sensor, weather
    device_class: Mapped[str | None] = mapped_column(String(50), nullable=True)  # temperature, humidity
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("zones.id"), nullable=True)
    is_outdoor: Mapped[bool] = mapped_column(Boolean, default=False)
    is_tracked: Mapped[bool] = mapped_column(Boolean, default=True)

    zone: Mapped[Zone | None] = relationship(back_populates="sensors")
    readings: Mapped[list["Reading"]] = relationship(back_populates="sensor")


class Reading(Base):
    __tablename__ = "readings"
    __table_args__ = (
        Index("ix_readings_sensor_time", "sensor_id", "timestamp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)

    # HVAC-specific (only for climate.* entities)
    hvac_action: Mapped[str | None] = mapped_column(String(20), nullable=True)  # heating, cooling, idle, off
    hvac_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)  # heat, cool, auto, off
    setpoint_heat: Mapped[float | None] = mapped_column(Float, nullable=True)
    setpoint_cool: Mapped[float | None] = mapped_column(Float, nullable=True)
    fan_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)

    sensor: Mapped[Sensor] = relationship(back_populates="readings")


class WeatherObservation(Base):
    __tablename__ = "weather_observations"

    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)
    source: Mapped[str] = mapped_column(String(20), default="nws")  # nws, ha
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed: Mapped[float | None] = mapped_column(Float, nullable=True)  # mph
    condition: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pressure: Mapped[float | None] = mapped_column(Float, nullable=True)  # inHg
    dewpoint: Mapped[float | None] = mapped_column(Float, nullable=True)
    heat_index: Mapped[float | None] = mapped_column(Float, nullable=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
