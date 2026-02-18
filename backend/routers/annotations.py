from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import Annotation
from schemas import AnnotationCreate, AnnotationOut

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


@router.get("", response_model=list[AnnotationOut])
async def list_annotations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Annotation).order_by(Annotation.timestamp))
    return result.scalars().all()


@router.post("", response_model=AnnotationOut)
async def create_annotation(data: AnnotationCreate, db: AsyncSession = Depends(get_db)):
    ann = Annotation(
        timestamp=data.timestamp if data.timestamp.tzinfo else data.timestamp.replace(tzinfo=timezone.utc),
        label=data.label,
        note=data.note,
        color=data.color,
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return ann


@router.delete("/{annotation_id}")
async def delete_annotation(annotation_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Annotation).where(Annotation.id == annotation_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    await db.delete(ann)
    await db.commit()
    return {"ok": True}
