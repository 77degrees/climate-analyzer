from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Zone
from schemas import ZoneOut, ZoneCreate, ZoneUpdate

router = APIRouter(prefix="/api/zones", tags=["zones"])


@router.get("", response_model=list[ZoneOut])
async def list_zones(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Zone).order_by(Zone.sort_order, Zone.name))
    return result.scalars().all()


@router.post("", response_model=ZoneOut)
async def create_zone(zone: ZoneCreate, db: AsyncSession = Depends(get_db)):
    new_zone = Zone(**zone.model_dump())
    db.add(new_zone)
    await db.commit()
    await db.refresh(new_zone)
    return new_zone


@router.patch("/{zone_id}", response_model=ZoneOut)
async def update_zone(
    zone_id: int, updates: ZoneUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = result.scalar_one_or_none()
    if not zone:
        raise HTTPException(404, "Zone not found")

    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(zone, field, value)
    await db.commit()
    await db.refresh(zone)
    return zone


@router.delete("/{zone_id}")
async def delete_zone(zone_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Zone).where(Zone.id == zone_id))
    zone = result.scalar_one_or_none()
    if not zone:
        raise HTTPException(404, "Zone not found")

    await db.delete(zone)
    await db.commit()
    return {"deleted": True}
