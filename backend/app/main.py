"""RightBus backend: GET /api/buses/search (+ serves the frontend)."""
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import gds_client
from .service import ValidationError, process_trips, validate_params

app = FastAPI(title="RightBus Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"status": "error", "message": message})


@app.get("/api/buses/search")
def search_buses(
    source: Optional[str] = None,
    destination: Optional[str] = None,
    journey_date: Optional[str] = None,
):
    try:
        source, destination, journey_date = validate_params(source, destination, journey_date)
    except ValidationError as exc:
        return _error(400, str(exc))

    try:
        raw_trips = gds_client.fetch_gds_trips(source, destination, journey_date)
    except gds_client.GdsError as exc:
        return _error(502, f"Upstream bus provider error: {exc}")

    buses = process_trips(raw_trips, source, destination, journey_date)
    return {
        "status": "success",
        "search": {"source": source, "destination": destination, "journey_date": journey_date},
        "count": len(buses),
        "buses": buses,
    }


# Serve the frontend from the same origin (registered last so /api wins).
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
