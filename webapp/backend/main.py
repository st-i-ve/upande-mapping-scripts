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

from beds_zones import generate_beds_zones, preview_split, terrace_sections

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
STORAGE = ROOT / "storage"
STORAGE.mkdir(parents=True, exist_ok=True)
TILES = ROOT.parent / "tiles"

app = FastAPI(title="Upande Bed & Zone Mapper")


class GenerateRequest(BaseModel):
    polygon: dict[str, Any] = Field(..., description="GeoJSON Polygon/Feature/FeatureCollection")
    bed_spacing: float = Field(1.5, gt=0, le=100)
    zone_length: float = Field(4.0, gt=0, le=1000)
    buffer_m: float = Field(1.0, ge=0, le=50)
    direction: str = Field("along_long_axis", pattern="^(along_long_axis|across_long_axis)$")
    n_blocks: int = Field(1, ge=1, le=20)
    split_axis: str = Field("none", pattern="^(none|longest|shortest)$")
    start_corner: str = Field("NW", pattern="^(NW|NE|SW|SE)$")
    block_end_beds: Optional[list[int]] = Field(None, description="Cumulative end-bed numbers per block; overrides bed_spacing")
    custom_blocks: Optional[list[dict[str, Any]]] = Field(None, description="When supplied, use these GeoJSON polygons as blocks instead of equal-split (terrace mode)")
    block_start_corners: Optional[list[Optional[str]]] = Field(None, description="Per-block corner overrides (NW/NE/SW/SE or null = auto-flip). Same length as custom_blocks (or equal-split count).")
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
            n_blocks=req.n_blocks,
            split_axis=req.split_axis,
            start_corner=req.start_corner,
            block_end_beds=req.block_end_beds,
            custom_blocks=req.custom_blocks,
            block_start_corners=req.block_start_corners,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Generation failed: {e}")

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    fname = f"{ts}_{_safe_name(req.name)}_{uuid.uuid4().hex[:6]}.geojson"
    (STORAGE / fname).write_text(json.dumps(result))

    return JSONResponse({"filename": fname, "result": result})


class PreviewRequest(BaseModel):
    polygon: dict[str, Any]
    direction: str = Field("along_long_axis", pattern="^(along_long_axis|across_long_axis)$")
    n_blocks: int = Field(1, ge=1, le=20)
    split_axis: str = Field("none", pattern="^(none|longest|shortest)$")
    start_corner: str = Field("NW", pattern="^(NW|NE|SW|SE)$")
    buffer_m: float = Field(0.0, ge=0, le=50)


@app.post("/api/preview")
def preview(req: PreviewRequest) -> JSONResponse:
    try:
        result = preview_split(
            req.polygon,
            direction=req.direction,
            n_blocks=req.n_blocks,
            split_axis=req.split_axis,
            start_corner=req.start_corner,
            buffer_m=req.buffer_m,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Preview failed: {e}")
    return JSONResponse(result)


class TerraceRequest(BaseModel):
    polygon: dict[str, Any]
    start_edge_idx: int = Field(..., ge=0, le=10000)
    grouping: Optional[str] = Field(None, description="Grouping like '1-3, 4, 5-7' to merge sections into blocks")
    angle_tol_deg: float = Field(25.0, ge=0, le=89)
    tread_length_ratio: float = Field(0.5, gt=0, le=1.5)
    start_corner: str = Field("NW", pattern="^(NW|NE|SW|SE)$")
    buffer_m: float = Field(0.0, ge=0, le=50)


@app.post("/api/terrace_sections")
def terrace(req: TerraceRequest) -> JSONResponse:
    try:
        result = terrace_sections(
            req.polygon,
            start_edge_idx=req.start_edge_idx,
            grouping=req.grouping,
            angle_tol_deg=req.angle_tol_deg,
            tread_length_ratio=req.tread_length_ratio,
            start_corner=req.start_corner,
            buffer_m=req.buffer_m,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Terrace failed: {e}")
    return JSONResponse(result)


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
