from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import WeatherObservation
from schemas import WeatherOut

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


@router.get("/history", response_model=list[WeatherOut])
async def get_weather_history(
    hours: int = Query(24, ge=1, le=8760),
    db: AsyncSession = Depends(get_db),
):
    """Get weather observations within time range."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = await db.execute(
        select(WeatherObservation)
        .where(WeatherObservation.timestamp >= cutoff)
        .order_by(WeatherObservation.timestamp)
    )
    return result.scalars().all()
