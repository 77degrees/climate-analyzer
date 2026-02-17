from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Sensor, Reading
from schemas import RecoveryEvent, DutyCycleDay, MetricsSummary
from services.metrics_engine import (
    compute_recovery_events,
    compute_duty_cycle,
    compute_hold_efficiency,
    compute_efficiency_score,
)

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


async def _get_climate_sensor_id(db: AsyncSession, sensor_id: int | None) -> int | None:
    """Get a climate sensor ID - use provided or pick first tracked climate sensor."""
    if sensor_id:
        return sensor_id
    result = await db.execute(
        select(Sensor.id)
        .where(and_(Sensor.domain == "climate", Sensor.is_tracked == True))
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/recovery", response_model=list[RecoveryEvent])
async def get_recovery_events(
    days: int = Query(7, ge=1, le=365),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return []
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return await compute_recovery_events(db, sid, start, end)


@router.get("/duty-cycle", response_model=list[DutyCycleDay])
async def get_duty_cycle(
    days: int = Query(7, ge=1, le=365),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return []
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return await compute_duty_cycle(db, sid, start, end)


@router.get("/summary", response_model=MetricsSummary)
async def get_metrics_summary(
    days: int = Query(7, ge=1, le=365),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return MetricsSummary(
            avg_recovery_minutes=0, duty_cycle_pct=0,
            hold_efficiency=0, efficiency_score=0,
        )

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)

    recovery_events = await compute_recovery_events(db, sid, start, end)
    duty_days = await compute_duty_cycle(db, sid, start, end)
    hold_eff = await compute_hold_efficiency(db, sid, start, end)

    avg_recovery = (
        sum(e["duration_minutes"] for e in recovery_events) / len(recovery_events)
        if recovery_events else 0
    )

    avg_duty = 0
    if duty_days:
        avg_duty = sum(d["heating_pct"] + d["cooling_pct"] for d in duty_days) / len(duty_days)

    score = await compute_efficiency_score(avg_recovery, hold_eff, avg_duty)

    return MetricsSummary(
        avg_recovery_minutes=round(avg_recovery, 1),
        duty_cycle_pct=round(avg_duty, 1),
        hold_efficiency=hold_eff,
        efficiency_score=score,
    )
