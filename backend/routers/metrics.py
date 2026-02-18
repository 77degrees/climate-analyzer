from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Sensor, Reading, Zone
from schemas import (
    RecoveryEvent, DutyCycleDay, MetricsSummary, EnergyProfileDay, ThermostatInfo,
    HeatmapCell, MonthlyTrend, TempBin, SetpointPoint, AcStruggleDay, ZoneThermalPerf,
)
from services.metrics_engine import (
    compute_recovery_events,
    compute_duty_cycle,
    compute_hold_efficiency,
    compute_efficiency_score,
    compute_energy_profile,
    compute_activity_heatmap,
    compute_monthly_trends,
    compute_temp_bins,
    compute_setpoint_history,
    compute_ac_struggle,
    compute_zone_thermal_performance,
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
    days: int = Query(7, ge=1, le=730),
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
    days: int = Query(7, ge=1, le=730),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return []
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return await compute_duty_cycle(db, sid, start, end)


@router.get("/thermostats", response_model=list[ThermostatInfo])
async def get_thermostats(db: AsyncSession = Depends(get_db)):
    """List all tracked climate sensors for thermostat selector."""
    result = await db.execute(
        select(Sensor, Zone.name)
        .outerjoin(Zone, Sensor.zone_id == Zone.id)
        .where(and_(Sensor.domain == "climate", Sensor.is_tracked == True))
        .order_by(Sensor.friendly_name)
    )
    return [
        ThermostatInfo(
            sensor_id=row[0].id,
            entity_id=row[0].entity_id,
            friendly_name=row[0].friendly_name,
            zone_name=row[1],
        )
        for row in result.all()
    ]


@router.get("/energy-profile", response_model=list[EnergyProfileDay])
async def get_energy_profile(
    days: int = Query(30, ge=1, le=730),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return []
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return await compute_energy_profile(db, sid, start, end)


@router.get("/heatmap", response_model=list[HeatmapCell])
async def get_activity_heatmap(
    days: int = Query(90, ge=7, le=730),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """7×24 activity heatmap: fraction of time HVAC heating/cooling per hour-of-day × weekday."""
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return []
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return await compute_activity_heatmap(db, sid, start, end)


@router.get("/monthly", response_model=list[MonthlyTrend])
async def get_monthly_trends(
    months: int = Query(24, ge=1, le=36),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Monthly aggregation of heating/cooling runtime hours and avg outdoor temp."""
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return []
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=months * 31)
    return await compute_monthly_trends(db, sid, start, end)


@router.get("/temp-bins", response_model=list[TempBin])
async def get_temp_bins(
    days: int = Query(365, ge=30, le=730),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """HVAC runtime hours grouped by 5°F outdoor temperature bins."""
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return []
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return await compute_temp_bins(db, sid, start, end)


@router.get("/setpoints", response_model=list[SetpointPoint])
async def get_setpoint_history(
    days: int = Query(30, ge=1, le=730),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Setpoint changes over time — only emits when heat or cool setpoint changes."""
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return []
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return await compute_setpoint_history(db, sid, start, end)


@router.get("/ac-struggle", response_model=list[AcStruggleDay])
async def get_ac_struggle(
    days: int = Query(365, ge=30, le=730),
    sensor_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Daily breakdown of AC struggle: when indoor temp exceeded cooling setpoint while running."""
    sid = await _get_climate_sensor_id(db, sensor_id)
    if not sid:
        return []
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return await compute_ac_struggle(db, sid, start, end)


@router.get("/zone-performance", response_model=list[ZoneThermalPerf])
async def get_zone_thermal_performance(
    days: int = Query(365, ge=30, le=730),
    db: AsyncSession = Depends(get_db),
):
    """Per-zone thermal performance on hot/cold days vs outdoor temperature."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return await compute_zone_thermal_performance(db, start, end)


@router.get("/summary", response_model=MetricsSummary)
async def get_metrics_summary(
    days: int = Query(7, ge=1, le=730),
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
