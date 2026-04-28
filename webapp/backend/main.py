"""FastAPI app: serves the static frontend and the /api endpoints."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from beds_zones import generate_beds_zones

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
STORAGE = ROOT / "storage"
STORAGE.mkdir(parents=True, exist_ok=True)
TILES = ROOT.parent / "tiles"

app = FastAPI(title="Upande Bed & Zone Mapper")


class GenerateRequest(BaseModel):
    polygon: dict[str, Any] = Field(..., description="GeoJSON Polygon/Feature/FeatureCollection")
    bed_spacing: float = Field(1.5, gt=0, le=100)
    zone_length: float = Field(10.0, gt=0, le=1000)
    buffer_m: float = Field(0.1, ge=0, le=50)
    direction: str = Field("along_long_axis", pattern="^(along_long_axis|across_long_axis)$")
    name: Optional[str] = Field(None, max_length=80)


_SAFE = re.compile(r"[^A-Za-z0-9_-]+")


def _safe_name(raw: Optional[str]) -> str:
    if not raw:
        return "plot"
    return _SAFE.sub("_", raw).strip("_") or "plot"


@app.post("/api/generate")
def generate(req: GenerateRequest) -> JSONResponse:
    try:
        result = generate_beds_zones(
            req.polygon,
            bed_spacing=req.bed_spacing,
            zone_length=req.zone_length,
            buffer_m=req.buffer_m,
            direction=req.direction,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Generation failed: {e}")

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    fname = f"{ts}_{_safe_name(req.name)}_{uuid.uuid4().hex[:6]}.geojson"
    (STORAGE / fname).write_text(json.dumps(result))

    return JSONResponse({"filename": fname, "result": result})


@app.get("/api/outputs")
def list_outputs() -> dict:
    items = []
    for p in sorted(STORAGE.glob("*.geojson"), reverse=True):
        st = p.stat()
        items.append({
            "filename": p.name,
            "size_bytes": st.st_size,
            "mtime": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
        })
    return {"outputs": items}


@app.get("/api/outputs/{filename}")
def get_output(filename: str):
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    path = STORAGE / filename
    if not path.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(path, media_type="application/geo+json", filename=filename)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


if TILES.is_dir():
    app.mount("/tiles", StaticFiles(directory=str(TILES)), name="tiles")

# Static frontend (mounted last so /api/* routes above take precedence).
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
