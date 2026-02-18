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


async def compute_activity_heatmap(
    db: AsyncSession,
    sensor_id: int,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Build a 7×24 heatmap of HVAC activity by day-of-week and hour."""
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

    # Grid: [day_of_week][hour] = {heating, cooling, total}
    grid: dict[tuple[int, int], dict] = {}
    for r in readings:
        # Use local time (CST = UTC-6)
        local_ts = r.timestamp.replace(tzinfo=None) - timedelta(hours=6)
        dow = local_ts.weekday()  # 0=Mon, 6=Sun
        hour = local_ts.hour
        key = (dow, hour)
        if key not in grid:
            grid[key] = {"heating": 0, "cooling": 0, "total": 0}
        action = r.hvac_action or "idle"
        if action == "heating":
            grid[key]["heating"] += 1
        elif action == "cooling":
            grid[key]["cooling"] += 1
        grid[key]["total"] += 1

    cells = []
    for (dow, hour), counts in grid.items():
        total = counts["total"] or 1
        cells.append({
            "day_of_week": dow,
            "hour": hour,
            "heating_pct": round(counts["heating"] / total * 100, 1),
            "cooling_pct": round(counts["cooling"] / total * 100, 1),
            "active_pct": round((counts["heating"] + counts["cooling"]) / total * 100, 1),
            "sample_count": counts["total"],
        })
    return cells


async def compute_monthly_trends(
    db: AsyncSession,
    sensor_id: int,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Monthly aggregation of HVAC runtime hours and outdoor temp."""
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

    months: dict[str, dict] = {}
    for r in readings:
        month = r.timestamp.strftime("%Y-%m")
        if month not in months:
            months[month] = {"heating": 0, "cooling": 0, "total": 0, "days": set()}
        action = r.hvac_action or "off"
        if action == "heating":
            months[month]["heating"] += 1
        elif action == "cooling":
            months[month]["cooling"] += 1
        months[month]["total"] += 1
        months[month]["days"].add(r.timestamp.strftime("%Y-%m-%d"))

    # Get monthly avg outdoor temps
    weather_result = await db.execute(
        select(
            func.strftime("%Y-%m", WeatherObservation.timestamp).label("month"),
            func.avg(WeatherObservation.temperature).label("avg_temp"),
        )
        .where(
            and_(
                WeatherObservation.timestamp >= start,
                WeatherObservation.timestamp <= end,
                WeatherObservation.temperature.isnot(None),
            )
        )
        .group_by(func.strftime("%Y-%m", WeatherObservation.timestamp))
    )
    outdoor_temps = {row.month: round(row.avg_temp, 1) for row in weather_result}

    result_list = []
    for month, counts in sorted(months.items()):
        total = counts["total"] or 1
        # 5-min samples → hours (12 samples/hr)
        heating_h = round(counts["heating"] / 12, 1)
        cooling_h = round(counts["cooling"] / 12, 1)
        result_list.append({
            "month": month,
            "heating_hours": heating_h,
            "cooling_hours": cooling_h,
            "total_runtime_hours": round(heating_h + cooling_h, 1),
            "avg_outdoor_temp": outdoor_temps.get(month),
            "sample_days": len(counts["days"]),
        })
    return result_list


async def compute_temp_bins(
    db: AsyncSession,
    sensor_id: int,
    start: datetime,
    end: datetime,
    bin_size: float = 5.0,
) -> list[dict]:
    """Bin outdoor daily avg temp and sum HVAC runtime per bin."""
    # Get daily energy profile (reuse existing logic)
    profile = await compute_energy_profile(db, sensor_id, start, end)

    bins: dict[float, dict] = {}
    for day in profile:
        temp = day.get("outdoor_avg_temp")
        if temp is None:
            continue
        bin_floor = (temp // bin_size) * bin_size
        if bin_floor not in bins:
            bins[bin_floor] = {"heating": 0.0, "cooling": 0.0, "days": 0}
        bins[bin_floor]["heating"] += day["heating_hours"]
        bins[bin_floor]["cooling"] += day["cooling_hours"]
        bins[bin_floor]["days"] += 1

    result_list = []
    for bin_floor in sorted(bins.keys()):
        b = bins[bin_floor]
        result_list.append({
            "range_label": f"{int(bin_floor)}\u2013{int(bin_floor + bin_size)}\u00b0F",
            "min_temp": bin_floor,
            "max_temp": bin_floor + bin_size,
            "heating_hours": round(b["heating"], 1),
            "cooling_hours": round(b["cooling"], 1),
            "day_count": b["days"],
        })
    return result_list


async def compute_setpoint_history(
    db: AsyncSession,
    sensor_id: int,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Extract setpoint changes over time (only emit when value changes)."""
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

    points = []
    last_heat: float | None = None
    last_cool: float | None = None

    for r in readings:
        heat_changed = r.setpoint_heat is not None and r.setpoint_heat != last_heat
        cool_changed = r.setpoint_cool is not None and r.setpoint_cool != last_cool

        if heat_changed or cool_changed or not points:
            points.append({
                "timestamp": r.timestamp,
                "setpoint_heat": r.setpoint_heat,
                "setpoint_cool": r.setpoint_cool,
                "hvac_action": r.hvac_action,
            })
            if r.setpoint_heat is not None:
                last_heat = r.setpoint_heat
            if r.setpoint_cool is not None:
                last_cool = r.setpoint_cool

    return points


async def compute_ac_struggle(
    db: AsyncSession,
    sensor_id: int,
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Find days when AC was running but indoor temp exceeded setpoint (AC can't keep up)."""
    result = await db.execute(
        select(Reading)
        .where(
            and_(
                Reading.sensor_id == sensor_id,
                Reading.timestamp >= start,
                Reading.timestamp <= end,
                Reading.hvac_action == "cooling",
                Reading.value.isnot(None),
                Reading.value > 30,    # filter bogus sensor readings
                Reading.value < 110,
            )
        )
        .order_by(Reading.timestamp)
    )
    readings = result.scalars().all()

    if not readings:
        return []

    # Group indoor temps and actual setpoints by date
    days: dict[str, dict] = {}
    for r in readings:
        day = r.timestamp.strftime("%Y-%m-%d")
        if day not in days:
            days[day] = {"temps": [], "setpoints": []}
        days[day]["temps"].append(r.value)
        sp = r.setpoint_cool or r.setpoint_heat
        if sp is not None:
            days[day]["setpoints"].append(sp)

    # Build overshoot list per day using actual or estimated setpoint
    day_data: dict[str, list[float]] = {}
    day_targets: dict[str, float] = {}
    for day, data in days.items():
        temps = sorted(data["temps"])
        n = len(temps)
        if data["setpoints"]:
            target = sum(data["setpoints"]) / len(data["setpoints"])
        else:
            # Estimate: 25th percentile — the temperature the AC was fighting toward
            target = temps[max(0, n // 4)]
        day_data[day] = [t - target for t in temps]
        day_targets[day] = target

    # Daily outdoor high + avg from weather
    weather_result = await db.execute(
        select(
            func.strftime("%Y-%m-%d", WeatherObservation.timestamp).label("day"),
            func.max(WeatherObservation.temperature).label("outdoor_high"),
            func.avg(WeatherObservation.temperature).label("outdoor_avg"),
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
    outdoor = {
        row.day: (round(row.outdoor_high, 1), round(row.outdoor_avg, 1))
        for row in weather_result
    }

    result_list = []
    for day in sorted(day_data.keys()):
        overshoots = day_data[day]
        n = len(overshoots)

        max_ov = round(max(overshoots), 2)
        avg_ov = round(sum(overshoots) / n, 2)
        struggle_n = sum(1 for o in overshoots if o > 0.5)
        struggle_hours = round(struggle_n / 12, 1)
        hours_cooling = round(n / 12, 1)

        outdoor_high, outdoor_avg = outdoor.get(day, (None, None))

        # Struggle score 0–100: severity of overshoot + fraction of time struggling
        struggle_pct = struggle_n / max(n, 1)
        overshoot_score = min(max(max_ov, 0) / 5.0 * 60, 60)  # 5°F = max 60 pts
        pct_score = struggle_pct * 40                           # 100% of time = 40 pts
        struggle_score = round(min(overshoot_score + pct_score, 100), 1)

        result_list.append({
            "date": day,
            "outdoor_high": outdoor_high,
            "outdoor_avg": outdoor_avg,
            "hours_cooling": hours_cooling,
            "max_overshoot": max_ov,
            "avg_overshoot": avg_ov,
            "struggle_hours": struggle_hours,
            "struggle_score": struggle_score,
        })

    return result_list


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
