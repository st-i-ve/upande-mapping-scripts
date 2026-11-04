"""Projects: named sets of saved shapes (pivots, blocks, outlines) kept on the server.

Each project is one JSON file under `storage/projects/<slug>.json`, so it outlives
any one browser and shows the same on every machine. Saves carry the version they
were based on; a save from a stale copy is refused (409) instead of silently
overwriting someone else's changes.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
PROJECTS = ROOT / "storage" / "projects"

router = APIRouter(prefix="/api/projects")

_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.()-]{0,79}$")
_SLUG = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")
MAX_SHAPES = 5000


class Shape(BaseModel):
    name: str = Field(..., max_length=200)
    geometry: dict[str, Any]
    visible: bool = True
    color: Optional[str] = Field(None, max_length=40)
    # Folder path inside the project, "Greenhouses/GH-A"; None/"" = the project root.
    folder: Optional[str] = Field(None, max_length=400)


MAX_FOLDERS = 2000
MAX_UNITS = 2000


class Unit(BaseModel):
    """A generated result filed in the project: a pointer to a saved output."""
    filename: str = Field(..., max_length=200)
    name: str = Field(..., max_length=200)
    kind: Literal["zones", "triads", "hexagons", "trees"]
    folder: Optional[str] = Field(None, max_length=400)
    count: int = 0
    source: Optional[str] = Field(None, max_length=200)
    created: str = Field("", max_length=40)



class CreateRequest(BaseModel):
    name: str = Field(..., max_length=80)
    shapes: list[Shape] = Field(default_factory=list, max_length=MAX_SHAPES)
    folders: Optional[list[str]] = Field(None, max_length=MAX_FOLDERS)
    units: Optional[list[Unit]] = Field(None, max_length=MAX_UNITS)


class SaveRequest(BaseModel):
    shapes: list[Shape] = Field(..., max_length=MAX_SHAPES)
    # Every folder path, including empty ones. Omit to leave the folders as they are.
    folders: Optional[list[str]] = Field(None, max_length=MAX_FOLDERS)
    # Generated results filed in the project. Omit to leave them as they are.
    units: Optional[list[Unit]] = Field(None, max_length=MAX_UNITS)
    # A slicing session in progress (the knife's cuts before Finish), so it
    # survives a reload or another machine. Send null to clear it; omit to leave it.
    draft: Optional[dict[str, Any]] = None
    # The version this save was made from; omit (or force) to overwrite regardless.
    base_version: Optional[int] = None
    force: bool = False


class RenameRequest(BaseModel):
    name: str = Field(..., max_length=80)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")[:80] or "project"


def _path(slug: str) -> Path:
    if not _SLUG.match(slug):
        raise HTTPException(400, "Invalid project")
    return PROJECTS / f"{slug}.json"


def _read(slug: str) -> dict[str, Any]:
    try:
        return json.loads(_path(slug).read_text())
    except FileNotFoundError:
        raise HTTPException(404, "No such project")
    except ValueError:
        raise HTTPException(500, "Project file is damaged")


def _write(project: dict[str, Any]) -> None:
    """Atomic: a reader never sees half a file, a crash never leaves one."""
    PROJECTS.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=PROJECTS)
    with os.fdopen(fd, "w") as f:
        json.dump(project, f)
    os.replace(tmp, _path(project["slug"]))


def _summary(p: dict[str, Any]) -> dict[str, Any]:
    return {k: p[k] for k in ("name", "slug", "created", "updated", "version")} | {"shape_count": len(p["shapes"])}


def _clean_folders(folders: Optional[list[str]]) -> list[str]:
    """Folder paths are "/"-joined names; drop blanks and duplicates, keep order."""
    out: list[str] = []
    for f in folders or []:
        path = "/".join(part.strip() for part in str(f).split("/") if part.strip())[:400]
        if path and path not in out:
            out.append(path)
    return out


def _check_name(name: str) -> str:
    name = name.strip()
    if not _NAME.match(name):
        raise HTTPException(400, "Name: letters, numbers, spaces and - _ . ( ) only")
    return name


@router.get("")
def list_projects() -> dict:
    if not PROJECTS.is_dir():
        return {"projects": []}
    out = []
    for f in PROJECTS.glob("*.json"):
        try:
            out.append(_summary(json.loads(f.read_text())))
        except (OSError, ValueError, KeyError):
            continue
    out.sort(key=lambda p: p["updated"], reverse=True)
    return {"projects": out}


@router.post("")
def create_project(req: CreateRequest) -> dict:
    name = _check_name(req.name)
    if any(p["name"].lower() == name.lower() for p in list_projects()["projects"]):
        raise HTTPException(409, f"A project called {name} already exists")
    base = _slug(name)
    slug, n = base, 2
    while _path(slug).exists():
        slug, n = f"{base}-{n}", n + 1
    now = _now()
    project = {
        "name": name, "slug": slug, "created": now, "updated": now, "version": 1,
        "shapes": [s.model_dump() for s in req.shapes],
        "folders": _clean_folders(req.folders),
        "units": [u.model_dump() for u in req.units or []],
    }
    _write(project)
    return project


@router.get("/{slug}")
def get_project(slug: str) -> dict:
    project = _read(slug)
    project.setdefault("folders", [])  # projects saved before folders existed
    project.setdefault("units", [])
    project.setdefault("draft", None)
    return project


@router.put("/{slug}/shapes")
def save_shapes(slug: str, req: SaveRequest) -> dict:
    project = _read(slug)
    if not req.force and req.base_version is not None and req.base_version != project["version"]:
        raise HTTPException(409, "This project was changed somewhere else since you opened it")
    project["shapes"] = [s.model_dump() for s in req.shapes]
    if req.folders is not None:
        project["folders"] = _clean_folders(req.folders)
    if req.units is not None:
        project["units"] = [u.model_dump() for u in req.units]
    if "draft" in req.model_fields_set:
        project["draft"] = req.draft
    project["version"] += 1
    project["updated"] = _now()
    _write(project)
    return _summary(project)


@router.patch("/{slug}")
def rename_project(slug: str, req: RenameRequest) -> dict:
    project = _read(slug)
    name = _check_name(req.name)
    if any(p["name"].lower() == name.lower() and p["slug"] != slug for p in list_projects()["projects"]):
        raise HTTPException(409, f"A project called {name} already exists")
    project["name"] = name
    project["updated"] = _now()
    _write(project)
    return _summary(project)


@router.delete("/{slug}")
def delete_project(slug: str) -> dict:
    path = _path(slug)
    if not path.is_file():
        raise HTTPException(404, "No such project")
    path.unlink()
    return {"deleted": slug}
