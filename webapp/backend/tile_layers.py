"""Downloaded tile layers: fetch a tile service's tiles for an area onto disk.

The download itself runs in the vendored Node package (`webapp/tile-downloader`)
as a detached process, so it outlives the request and either uvicorn worker can
report on it. Each layer is a folder under `tiles/downloaded/<name>/` holding
`{z}/{x}/{y}.<format>` plus a `layer.json` with its settings and progress —
the only state there is, so nothing lives in worker memory.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import signal
import subprocess
import tempfile
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
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

# Uploaded zips (from the Tile Cache Inspector extension): size caps for the
# upload itself and for what it unpacks to.
MAX_UPLOAD_BYTES = 1024**3
MAX_UNPACKED_BYTES = 2 * 1024**3
MAX_UPLOAD_TILES = 100_000
# <layer folder>/<z>/<x>/<y>.<ext>, the layer folder optional (A, B, C… from the extension).
_ZIP_TILE = re.compile(r"^(?:(.+)/)?(\d{1,2})/(\d+)/(\d+)\.(png|jpe?g|webp|gif)$", re.I)

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


def _sniff_image(head: bytes) -> Optional[str]:
    """The image format these leading bytes really are, or None if not an image."""
    if head.startswith(b"\x89PNG"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head.startswith(b"GIF8"):
        return "gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def _unique_slug(name: str) -> str:
    base = _slug(name) or "layer"
    slug, n = base, 2
    while (LAYERS / slug).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


def _tiles_area(tiles: list[tuple[int, int, int]]) -> dict[str, Any]:
    """Bounding box of the tiles (taken at their deepest zoom) as a Polygon Feature."""
    zmax = max(z for z, _, _ in tiles)
    xs = [x for z, x, _ in tiles if z == zmax]
    ys = [y for z, _, y in tiles if z == zmax]

    def lonlat(x: int, y: int) -> list[float]:
        n = 2**zmax
        return [x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))]

    (w, n_), (e, s_) = lonlat(min(xs), min(ys)), lonlat(max(xs) + 1, max(ys) + 1)
    ring = [[w, s_], [e, s_], [e, n_], [w, n_], [w, s_]]
    return {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [ring]}}


@router.post("/upload")
async def upload(request: Request, name: str) -> dict:
    """Add tile layers from a zip of <layer>/<z>/<x>/<y>.<ext> — the Tile Cache
    Inspector extension's export. The zip is the raw request body; each top-level
    folder becomes a layer of its own."""
    if not _NAME.match(name.strip()):
        raise HTTPException(400, "Name: letters, numbers, spaces, - and _ only")
    LAYERS.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(TILES).free < MIN_FREE_BYTES:
        raise HTTPException(507, "Not enough free disk on the server for an upload")

    fd, tmp = tempfile.mkstemp(prefix="_upload-", suffix=".zip", dir=LAYERS)
    created: list[Path] = []
    try:
        size = 0
        with os.fdopen(fd, "wb") as f:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"Upload is over {MAX_UPLOAD_BYTES // 1024**2} MB")
                f.write(chunk)
        try:
            zf = zipfile.ZipFile(tmp)
        except zipfile.BadZipFile:
            raise HTTPException(400, "That file isn't a zip")

        with zf:
            groups: dict[str, list[tuple[zipfile.ZipInfo, int, int, int, str]]] = {}
            for info in zf.infolist():
                m = _ZIP_TILE.match(info.filename)
                if info.is_dir() or not m or ".." in info.filename:
                    continue
                folder, z, x, y, _ = m.groups()
                z, x, y = int(z), int(x), int(y)
                if z > 23 or x >= 2**z or y >= 2**z:
                    continue
                # Trust the bytes, not the name: a ".png" can be a JPEG, or no image at all.
                with zf.open(info) as f:
                    ext = _sniff_image(f.read(12))
                if not ext:
                    continue
                groups.setdefault(folder or "", []).append((info, z, x, y, ext))
            tiles = [t for g in groups.values() for t in g]
            if not tiles:
                raise HTTPException(400, "No image tiles in that zip — expected <z>/<x>/<y>.png style files")
            if len(tiles) > MAX_UPLOAD_TILES:
                raise HTTPException(400, f"{len(tiles):,} tiles is over the {MAX_UPLOAD_TILES:,} limit")
            unpacked = sum(t[0].file_size for t in tiles)
            if unpacked > MAX_UNPACKED_BYTES or shutil.disk_usage(TILES).free - unpacked < MIN_FREE_BYTES:
                raise HTTPException(507, "Not enough free disk on the server for those tiles")

            try:
                sources = json.loads(zf.read("layers.json"))
            except (KeyError, ValueError):
                sources = {}

            for folder, group in sorted(groups.items()):
                label = name.strip() if len(groups) == 1 else f"{name.strip()} · {folder or 'tiles'}"[:120]
                slug = _unique_slug(label)
                dest = LAYERS / slug
                dest.mkdir()
                created.append(dest)
                # One extension per layer (its tile URL names it); browsers sniff the image either way.
                fmt = Counter(t[4] for t in group).most_common(1)[0][0]
                for info, z, x, y, _ in group:
                    out = dest / str(z) / str(x) / f"{y}.{fmt}"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(info) as src, open(out, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                zooms = [t[1] for t in group]
                (dest / "layer.json").write_text(json.dumps({
                    "name": label,
                    "slug": slug,
                    "source_url": (sources.get(folder) or {}).get("template", "uploaded zip"),
                    "format": fmt,
                    "min_zoom": min(zooms),
                    "max_zoom": max(zooms),
                    "area": _tiles_area([(z, x, y) for _, z, x, y, _ in group]),
                    "state": "done",
                    "current": len(group),
                    "total": len(group),
                    "failed": 0,
                    "uploaded": True,
                    "created": datetime.now(timezone.utc).isoformat(),
                }))
    except BaseException:
        for d in created:
            shutil.rmtree(d, ignore_errors=True)
        raise
    finally:
        os.unlink(tmp)
    return {"layers": [m for d in created if (m := _read_layer(d))]}


@router.get("/layers")
def list_layers() -> dict:
    if not LAYERS.is_dir():
        return {"layers": []}
    layers = [m for d in sorted(LAYERS.iterdir()) if d.is_dir() and (m := _read_layer(d))]
    return {"layers": layers}


class RenameRequest(BaseModel):
    name: str = Field(..., max_length=60)


@router.patch("/layers/{slug}")
def rename_layer(slug: str, req: RenameRequest) -> dict:
    """Give a layer a new display name; its folder (slug) and tile URL stay put."""
    if not re.fullmatch(r"[a-z0-9_-]+", slug):
        raise HTTPException(400, "Invalid layer name")
    if not _NAME.match(req.name.strip()):
        raise HTTPException(400, "Name: letters, numbers, spaces, - and _ only")
    meta_path = LAYERS / slug / "layer.json"
    try:
        meta = json.loads(meta_path.read_text())
    except (OSError, ValueError):
        raise HTTPException(404, "No such tile layer")
    meta["name"] = req.name.strip()
    tmp = meta_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(meta))
    tmp.replace(meta_path)  # atomic, so a running download's own writes never see half a file
    return _read_layer(LAYERS / slug) or {}


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
