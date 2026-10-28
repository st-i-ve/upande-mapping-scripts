"""Downloaded tile layers: fetch a tile service's tiles for an area onto disk.

The download itself runs in the vendored Node package (`webapp/tile-downloader`)
as a detached process, so it outlives the request and either uvicorn worker can
report on it. Each layer is a folder under `tiles/downloaded/<name>/` holding
`{z}/{x}/{y}.<format>` plus a `layer.json` with its settings and progress —
the only state there is, so nothing lives in worker memory.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
TILES = ROOT.parent / "tiles"
LAYERS = TILES / "downloaded"
CLI = ROOT / "tile-downloader" / "cli.js"
NODE = os.environ.get("MAPPER_NODE", "/home/ubuntu/.nvm/versions/node/v24.14.1/bin/node")

# One job's ceiling, and the disk it must leave free. A satellite tile averages
# ~20 KB, so 20k tiles is ~400 MB; the root disk runs close to full.
MAX_TILES = 20_000
MIN_FREE_BYTES = 3 * 1024**3
EST_TILE_BYTES = 20 * 1024

router = APIRouter(prefix="/api/tiles")

_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]{0,59}$")
_FORMATS = {"png", "jpg", "jpeg", "gif"}


class TileJob(BaseModel):
    url: str = Field(..., max_length=2000)
    subdomains: list[str] = Field(default_factory=list, max_length=10)
    min_zoom: int = Field(..., ge=0, le=22)
    max_zoom: int = Field(..., ge=0, le=22)
    format: str = "png"
    area: dict[str, Any] = Field(..., description="GeoJSON Polygon/MultiPolygon geometry or Feature")


class DownloadRequest(TileJob):
    name: str = Field(..., max_length=60)


def _slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name.strip()).strip("_").lower()


def _area_feature(area: dict[str, Any]) -> dict[str, Any]:
    """The single-ring Polygon Feature the downloader accepts.

    Its tile counter only takes one outer ring, so holes are dropped and a
    MultiPolygon becomes its bounding box — a few extra tiles, never fewer.
    """
    geom = area.get("geometry", area)
    t, coords = geom.get("type"), geom.get("coordinates")
    try:
        if t == "Polygon":
            ring = coords[0]
        elif t == "MultiPolygon":
            pts = [p for poly in coords for p in poly[0]]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            ring = [[min(xs), min(ys)], [max(xs), min(ys)], [max(xs), max(ys)], [min(xs), max(ys)], [min(xs), min(ys)]]
        else:
            raise ValueError
        if len(ring) < 4:
            raise ValueError
    except (TypeError, ValueError, IndexError, KeyError):
        raise HTTPException(400, "Area must be a Polygon or MultiPolygon")
    return {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [ring]}}


def _check(job: TileJob) -> None:
    if not job.url.startswith(("http://", "https://")):
        raise HTTPException(400, "Tile URL must start with http:// or https://")
    for p in ("{z}", "{x}", "{y}"):
        if p not in job.url:
            raise HTTPException(400, f"Tile URL needs {p}")
    if "{s}" in job.url and not job.subdomains:
        raise HTTPException(400, "The URL uses {s} — give its subdomains (e.g. a,b,c)")
    if job.min_zoom > job.max_zoom:
        raise HTTPException(400, "Min zoom is above max zoom")
    if job.format not in _FORMATS:
        raise HTTPException(400, f"Format must be one of {', '.join(sorted(_FORMATS))}")


def _job_file(job: TileJob, dest: Path) -> str:
    fd, path = tempfile.mkstemp(prefix="tilejob-", suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump({
            "url": job.url,
            "subdomains": job.subdomains,
            "minZoom": job.min_zoom,
            "maxZoom": job.max_zoom,
            "format": job.format,
            "area": _area_feature(job.area),
            "dest": str(dest),
        }, f)
    return path


def _count(job: TileJob) -> int:
    path = _job_file(job, LAYERS / "_count")
    try:
        out = subprocess.run([NODE, str(CLI), "count", path], capture_output=True, text=True, timeout=60)
    finally:
        os.unlink(path)
    if out.returncode != 0:
        raise HTTPException(500, f"Tile count failed: {out.stderr.strip()[:300]}")
    return int(json.loads(out.stdout)["count"])


def _alive(pid: Optional[int]) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    # A finished child of ours lingers as a zombie until reaped; that's not alive.
    try:
        return Path(f"/proc/{pid}/stat").read_text().split()[2] != "Z"
    except OSError:
        return False


def _read_layer(folder: Path) -> Optional[dict[str, Any]]:
    try:
        meta = json.loads((folder / "layer.json").read_text())
    except (OSError, ValueError):
        return None
    state, pid = meta.get("state"), meta.get("pid")
    if state == "starting" and not pid:
        # The CLI hasn't recorded its pid yet; give it a moment before calling it dead.
        age = datetime.now(timezone.utc) - datetime.fromisoformat(meta["created"])
        if age.total_seconds() > 30:
            meta["state"] = "stopped"
    elif state in ("starting", "downloading") and not _alive(pid):
        meta["state"] = "stopped"  # the process died mid-download (e.g. a restart)
    meta["tile_url"] = f"/tiles/downloaded/{folder.name}/{{z}}/{{x}}/{{y}}.{meta['format']}"
    return meta


@router.post("/count")
def count_tiles(job: TileJob) -> dict:
    _check(job)
    n = _count(job)
    return {"count": n, "max": MAX_TILES, "est_bytes": n * EST_TILE_BYTES}


@router.post("/download")
def download(req: DownloadRequest) -> dict:
    _check(req)
    if not _NAME.match(req.name.strip()):
        raise HTTPException(400, "Name: letters, numbers, spaces, - and _ only")
    slug = _slug(req.name)
    dest = LAYERS / slug
    if dest.exists():
        raise HTTPException(409, f"A tile layer called {slug} already exists")
    n = _count(req)
    if n == 0:
        raise HTTPException(400, "No tiles cover that area at those zooms")
    if n > MAX_TILES:
        raise HTTPException(400, f"{n:,} tiles is over the {MAX_TILES:,} limit — narrow the area or the zooms")
    if shutil.disk_usage(TILES).free - n * EST_TILE_BYTES < MIN_FREE_BYTES:
        raise HTTPException(507, "Not enough free disk on the server for that download")

    LAYERS.mkdir(parents=True, exist_ok=True)
    dest.mkdir()
    meta_path = dest / "layer.json"
    meta_path.write_text(json.dumps({
        "name": req.name.strip(),
        "slug": slug,
        "source_url": req.url,
        "format": req.format,
        "min_zoom": req.min_zoom,
        "max_zoom": req.max_zoom,
        "area": _area_feature(req.area),
        "state": "starting",
        "current": 0,
        "total": n,
        "failed": 0,
        "created": datetime.now(timezone.utc).isoformat(),
    }))
    # Detached in its own session: it outlives the request, ties up no worker,
    # and the CLI records its pid (the group to signal on delete) itself.
    subprocess.Popen(
        [NODE, str(CLI), "run", _job_file(req, dest), str(meta_path)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    return _read_layer(dest) or {}


@router.get("/layers")
def list_layers() -> dict:
    if not LAYERS.is_dir():
        return {"layers": []}
    layers = [m for d in sorted(LAYERS.iterdir()) if d.is_dir() and (m := _read_layer(d))]
    return {"layers": layers}


@router.delete("/layers/{slug}")
def delete_layer(slug: str) -> dict:
    if not re.fullmatch(r"[a-z0-9_-]+", slug):
        raise HTTPException(400, "Invalid layer name")
    dest = LAYERS / slug
    if not (dest / "layer.json").is_file():
        raise HTTPException(404, "No such tile layer")
    meta = _read_layer(dest) or {}
    if meta.get("state") in ("starting", "downloading") and meta.get("pid"):
        try:
            os.killpg(meta["pid"], signal.SIGTERM)
        except OSError:
            pass
    shutil.rmtree(dest)
    return {"deleted": slug}
