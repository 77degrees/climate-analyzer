import logging
from datetime import datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from models import Reading, Sensor, WeatherObservation

logger = logging.getLogger(__name__)

RECOVERY_TIMEOUT_MIN = 120


async def compute_recovery_events(
    db: AsyncSession,
    sensor_id: int,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Find recovery events: idle→heating/cooling until setpoint reached."""
    result = await db.execute(
        select(Reading)
        .where(
            and_(
                Reading.sensor_id == sensor_id,
                Reading.timestamp >= start,
                Reading.timestamp <= end,
                Reading.hvac_action.isnot(None),
            )
        )
        .order_by(Reading.timestamp)
    )
    readings = result.scalars().all()
    if not readings:
        return []

    events = []
    current_event = None

    for r in readings:
        action = r.hvac_action
        if action in ("heating", "cooling"):
            if current_event is None or current_event["action"] != action:
                # Start new recovery event
                if current_event:
                    _finalize_event(current_event, r)
                    events.append(current_event)
                setpoint = r.setpoint_heat if action == "heating" else r.setpoint_cool
                current_event = {
                    "start_time": r.timestamp,
                    "end_time": None,
                    "action": action,
                    "start_temp": r.value,
                    "end_temp": None,
                    "setpoint": setpoint,
                    "readings": [r],
                }
        elif action in ("idle", "off") and current_event:
            _finalize_event(current_event, r)
            events.append(current_event)
            current_event = None

    if current_event:
        _finalize_event(current_event, readings[-1])
        events.append(current_event)

    # Enrich with outdoor temp
    for evt in events:
        weather = await db.execute(
            select(WeatherObservation.temperature)
            .where(WeatherObservation.timestamp <= evt["start_time"])
            .order_by(WeatherObservation.timestamp.desc())
            .limit(1)
        )
        outdoor = weather.scalar_one_or_none()
        evt["outdoor_temp"] = outdoor
        del evt["readings"]

    return events


def _finalize_event(event: dict, last_reading: Reading):
    event["end_time"] = last_reading.timestamp
    event["end_temp"] = last_reading.value
    duration = (event["end_time"] - event["start_time"]).total_seconds() / 60
    event["duration_minutes"] = round(duration, 1)

    # Check if setpoint was reached
    sp = event["setpoint"]
    if sp and event["end_temp"]:
        if event["action"] == "heating":
            event["success"] = event["end_temp"] >= sp
        else:
            event["success"] = event["end_temp"] <= sp
    else:
        event["success"] = duration < RECOVERY_TIMEOUT_MIN


async def compute_duty_cycle(
    db: AsyncSession,
    sensor_id: int,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Compute daily duty cycle percentages."""
    result = await db.execute(
        select(Reading)
        .where(
            and_(
                Reading.sensor_id == sensor_id,
                Reading.timestamp >= start,
                Reading.timestamp <= end,
                Reading.hvac_action.isnot(None),
            )
        )
        .order_by(Reading.timestamp)
    )
    readings = result.scalars().all()

    # Group by date
    days: dict[str, dict] = {}
    for r in readings:
        day = r.timestamp.strftime("%Y-%m-%d")
        if day not in days:
            days[day] = {"heating": 0, "cooling": 0, "idle": 0, "off": 0, "total": 0}
        action = r.hvac_action or "off"
        if action not in days[day]:
            days[day][action] = 0
        days[day][action] += 1
        days[day]["total"] += 1

    result_list = []
    for day, counts in sorted(days.items()):
        total = counts["total"] or 1
        result_list.append({
            "date": day,
            "heating_pct": round(counts["heating"] / total * 100, 1),
            "cooling_pct": round(counts["cooling"] / total * 100, 1),
            "idle_pct": round(counts["idle"] / total * 100, 1),
            "off_pct": round(counts["off"] / total * 100, 1),
        })

    return result_list


async def compute_hold_efficiency(
    db: AsyncSession,
    sensor_id: int,
    start: datetime,
    end: datetime,
) -> float:
    """Average temperature drift from setpoint while HVAC is idle."""
    result = await db.execute(
        select(Reading)
        .where(
            and_(
                Reading.sensor_id == sensor_id,
                Reading.timestamp >= start,
                Reading.timestamp <= end,
                Reading.hvac_action == "idle",
                Reading.value.isnot(None),
            )
        )
    )
    readings = result.scalars().all()

    if not readings:
        return 0.0

    drifts = []
    for r in readings:
        sp = r.setpoint_heat or r.setpoint_cool
        if sp and r.value:
            drifts.append(abs(r.value - sp))

    return round(sum(drifts) / len(drifts), 1) if drifts else 0.0


async def compute_energy_profile(
    db: AsyncSession,
    sensor_id: int,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Daily outdoor avg temp vs HVAC runtime hours for scatter/energy chart."""
    result = await db.execute(
        select(Reading)
        .where(
            and_(
                Reading.sensor_id == sensor_id,
                Reading.timestamp >= start,
                Reading.timestamp <= end,
                Reading.hvac_action.isnot(None),
            )
        )
        .order_by(Reading.timestamp)
    )
    readings = result.scalars().all()

    # Group by date, count heating/cooling samples
    days: dict[str, dict] = {}
    for r in readings:
        day = r.timestamp.strftime("%Y-%m-%d")
        if day not in days:
            days[day] = {"heating": 0, "cooling": 0, "total": 0}
        action = r.hvac_action or "off"
        if action == "heating":
            days[day]["heating"] += 1
        elif action == "cooling":
            days[day]["cooling"] += 1
        days[day]["total"] += 1

    # Get daily outdoor avg temps from weather observations
    weather_result = await db.execute(
        select(
            func.strftime("%Y-%m-%d", WeatherObservation.timestamp).label("day"),
            func.avg(WeatherObservation.temperature).label("avg_temp"),
        )
        .where(
            and_(
                WeatherObservation.timestamp >= start,
                WeatherObservation.timestamp <= end,
                WeatherObservation.temperature.isnot(None),
            )
        )
        .group_by(func.strftime("%Y-%m-%d", WeatherObservation.timestamp))
    )
    outdoor_temps = {row.day: round(row.avg_temp, 1) for row in weather_result}

    profile = []
    for day, counts in sorted(days.items()):
        total = counts["total"] or 1
        # Estimate hours based on sample count (5-min intervals = 12 samples/hour)
        samples_per_hour = total / 24  # approximate samples per hour for this day
        scale = 1 / max(samples_per_hour, 1) if samples_per_hour > 0 else 1 / 12
        heating_h = round(counts["heating"] * scale, 1)
        cooling_h = round(counts["cooling"] * scale, 1)

        profile.append({
            "date": day,
            "outdoor_avg_temp": outdoor_temps.get(day),
            "heating_hours": heating_h,
            "cooling_hours": cooling_h,
            "total_runtime_hours": round(heating_h + cooling_h, 1),
        })

    return profile


async def compute_efficiency_score(
    avg_recovery_min: float,
    hold_efficiency: float,
    duty_cycle_pct: float,
) -> float:
    """Composite score 0-100. Lower recovery + lower drift + reasonable duty = better."""
    # Recovery: 40 pts. 0 min = 40, 60+ min = 0
    recovery_score = max(0, 40 - (avg_recovery_min / 60 * 40))

    # Hold: 35 pts. 0 drift = 35, 3+ drift = 0
    hold_score = max(0, 35 - (hold_efficiency / 3 * 35))

    # Duty: 25 pts. 30-60% is ideal. Too high or too low loses points
    if 30 <= duty_cycle_pct <= 60:
        duty_score = 25
    elif duty_cycle_pct < 30:
        duty_score = duty_cycle_pct / 30 * 25
    else:
        duty_score = max(0, 25 - ((duty_cycle_pct - 60) / 40 * 25))

    return round(recovery_score + hold_score + duty_score, 0)
