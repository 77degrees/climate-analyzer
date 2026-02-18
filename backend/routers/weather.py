from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import WeatherObservation, AppSetting
from schemas import WeatherOut, ForecastPeriod
from services.nws_client import NWSClient

router = APIRouter(prefix="/api/weather", tags=["weather"])


@router.get("/current", response_model=WeatherOut | None)
async def get_current_weather(db: AsyncSession = Depends(get_db)):
    """Get most recent weather observation."""
    result = await db.execute(
        select(WeatherObservation)
        .order_by(WeatherObservation.timestamp.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/forecast", response_model=list[ForecastPeriod])
async def get_forecast(db: AsyncSession = Depends(get_db)):
    """Get NWS gridpoint forecast periods (next 3-4 days)."""
    result = await db.execute(select(AppSetting).where(AppSetting.key == "nws_forecast_url"))
    setting = result.scalar_one_or_none()
    if not setting or not setting.value:
        return []
    try:
        nws = NWSClient()
        periods = await nws.get_forecast_periods(setting.value)
        return [ForecastPeriod(**p) for p in periods]
    except Exception:
        return []


@router.get("/history", response_model=list[WeatherOut])
async def get_weather_history(
    hours: int = Query(24, ge=1, le=26280),
    start: datetime | None = Query(None, description="Custom range start (ISO datetime)"),
    end: datetime | None = Query(None, description="Custom range end (ISO datetime)"),
    db: AsyncSession = Depends(get_db),
):
    """Get weather observations within time range."""
    if start and end:
        cutoff = start if start.tzinfo else start.replace(tzinfo=timezone.utc)
        end_time = end if end.tzinfo else end.replace(tzinfo=timezone.utc)
    else:
        end_time = datetime.now(timezone.utc)
        cutoff = end_time - timedelta(hours=hours)
    result = await db.execute(
        select(WeatherObservation)
        .where(
            and_(
                WeatherObservation.timestamp >= cutoff,
                WeatherObservation.timestamp <= end_time,
            )
        )
        .order_by(WeatherObservation.timestamp)
    )
    return result.scalars().all()
