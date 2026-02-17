import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import settings
from database import init_db
from routers import sensors, readings, weather, metrics, settings as settings_router, zones, dashboard
from services.collector import collect_ha_readings, collect_nws_observation

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database...")
    await init_db()

    # Start polling jobs
    scheduler.add_job(
        collect_ha_readings,
        "interval",
        seconds=settings.ha_poll_interval,
        id="ha_poll",
        name="HA Sensor Poll",
    )
    scheduler.add_job(
        collect_nws_observation,
        "interval",
        seconds=settings.nws_poll_interval,
        id="nws_poll",
        name="NWS Weather Poll",
    )
    scheduler.start()
    logger.info(
        f"Scheduler started: HA every {settings.ha_poll_interval}s, NWS every {settings.nws_poll_interval}s"
    )

    # Run initial collection
    try:
        await collect_ha_readings()
        await collect_nws_observation()
    except Exception as e:
        logger.warning(f"Initial collection failed (configure HA first): {e}")

    yield

    # Shutdown
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


app = FastAPI(
    title="Climate Analyzer",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers
app.include_router(dashboard.router)
app.include_router(sensors.router)
app.include_router(readings.router)
app.include_router(weather.router)
app.include_router(metrics.router)
app.include_router(settings_router.router)
app.include_router(zones.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# Serve frontend static files in production
STATIC_DIR = Path(__file__).parent.parent / "frontend" / "dist"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the SPA index.html for all non-API routes."""
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)
