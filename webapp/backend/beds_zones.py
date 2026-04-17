"""
Unified bed + zone generator.

Input: a GeoJSON Polygon / MultiPolygon (WGS84).
Output: a GeoJSON FeatureCollection of numbered bed LineStrings and zone
LineStrings, continuously numbered across all polygon parts.

All metric math is done in UTM; geometry is reprojected back to WGS84 on
output. Irregular / terraced polygons are handled naturally by the
inward-buffer + clip step.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable

from pyproj import Transformer
from shapely import ops
from shapely.affinity import rotate, translate
from shapely.geometry import (
    LineString,
    MultiLineString,
    MultiPolygon,
    Polygon,
    mapping,
    shape,
)


# ---------- projection helpers ---------------------------------------------

def _utm_epsg(lon: float, lat: float) -> int:
    zone = int(math.floor((lon + 180) / 6) + 1)
    return (32600 if lat >= 0 else 32700) + zone


def _transformers(lon: float, lat: float) -> tuple[Transformer, Transformer]:
    epsg = _utm_epsg(lon, lat)
    to_utm = Transformer.from_crs(4326, epsg, always_xy=True)
    to_wgs = Transformer.from_crs(epsg, 4326, always_xy=True)
    return to_utm, to_wgs


def _project(geom, transformer: Transformer):
    return ops.transform(lambda x, y, z=None: transformer.transform(x, y), geom)


# ---------- geometry helpers -----------------------------------------------

def _long_axis_angle(poly: Polygon) -> float:
    """Angle (degrees) of the long side of the minimum rotated rectangle."""
    mrr = poly.minimum_rotated_rectangle
    coords = list(mrr.exterior.coords)[:-1]
    edges = [(coords[i], coords[(i + 1) % 4]) for i in range(4)]
    lengths = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in edges]
    i_long = max(range(4), key=lambda i: lengths[i])
    (x1, y1), (x2, y2) = edges[i_long]
    return math.degrees(math.atan2(y2 - y1, x2 - x1))


def _parallel_lines(poly: Polygon, spacing: float) -> list[LineString]:
    """Horizontal lines spanning poly bounds, spaced `spacing` apart in Y."""
    minx, miny, maxx, maxy = poly.bounds
    pad = spacing
    y = miny + spacing / 2.0
    lines: list[LineString] = []
    while y <= maxy:
        lines.append(LineString([(minx - pad, y), (maxx + pad, y)]))
        y += spacing
    return lines


def _clip_to_parts(line: LineString, poly) -> list[LineString]:
    clipped = line.intersection(poly)
    if clipped.is_empty:
        return []
    if isinstance(clipped, LineString):
        return [clipped]
    if isinstance(clipped, MultiLineString):
        return [g for g in clipped.geoms if g.length > 0]
    # Points or GeometryCollections from tangency — ignore.
    return []


def _subdivide(line: LineString, zone_length: float) -> list[LineString]:
    total = line.length
    if total <= zone_length:
        return [line]
    zones: list[LineString] = []
    n = math.ceil(total / zone_length)
    step = total / n  # spread evenly so last zone isn't a tiny stub
    for i in range(n):
        a = ops.substring(line, i * step, (i + 1) * step)
        if a.length > 0:
            zones.append(a)
    return zones


# ---------- main API -------------------------------------------------------

@dataclass
class GenerateResult:
    features: list[dict]
    bed_count: int
    zone_count: int
    area_m2: float


def generate_beds_zones(
    polygon_geojson: dict,
    bed_spacing: float = 1.5,
    zone_length: float = 10.0,
    buffer_m: float = 0.1,
    direction: str = "along_long_axis",
    bed_prefix: str = "B",
    zone_prefix: str = "Z",
) -> dict:
    """
    polygon_geojson: a GeoJSON Feature, FeatureCollection, Polygon, or MultiPolygon.
    Returns a GeoJSON FeatureCollection of beds + zones in WGS84.
    """

    geom = _extract_geom(polygon_geojson)
    lon, lat = geom.centroid.x, geom.centroid.y
    to_utm, to_wgs = _transformers(lon, lat)

    geom_utm = _project(geom, to_utm)
    parts: list[Polygon] = (
        list(geom_utm.geoms) if isinstance(geom_utm, MultiPolygon) else [geom_utm]
    )

    all_features: list[dict] = []
    bed_counter = 0
    zone_counter = 0
    total_area = 0.0

    for part in parts:
        if part.is_empty or part.area <= 0:
            continue
        total_area += part.area

        # Rotate so the long axis aligns with X; beds will run along X.
        angle = _long_axis_angle(part)
        if direction == "across_long_axis":
            angle += 90.0
        origin = part.centroid
        rotated = rotate(part, -angle, origin=origin)
        clip_region = rotated.buffer(-buffer_m) if buffer_m > 0 else rotated
        if clip_region.is_empty:
            clip_region = rotated

        # Generate candidate beds, clip, collect fragments.
        segments: list[LineString] = []
        for line in _parallel_lines(rotated, bed_spacing):
            segments.extend(_clip_to_parts(line, clip_region))

        # Order by Y (top-to-bottom), then by X for multi-fragment rows.
        segments.sort(key=lambda s: (-s.centroid.y, s.centroid.x))

        # Unrotate back to UTM, emit features with continuous IDs.
        for seg in segments:
            bed_counter += 1
            bed_id = f"{bed_prefix}{bed_counter:04d}"
            seg_utm = rotate(seg, angle, origin=origin)
            seg_wgs = _project(seg_utm, to_wgs)
            all_features.append({
                "type": "Feature",
                "geometry": mapping(seg_wgs),
                "properties": {
                    "kind": "bed",
                    "bed_id": bed_id,
                    "length_m": round(seg.length, 3),
                },
            })

            for j, z in enumerate(_subdivide(seg, zone_length), start=1):
                zone_counter += 1
                zone_id = f"{bed_id}-{zone_prefix}{j:02d}"
                z_utm = rotate(z, angle, origin=origin)
                z_wgs = _project(z_utm, to_wgs)
                all_features.append({
                    "type": "Feature",
                    "geometry": mapping(z_wgs),
                    "properties": {
                        "kind": "zone",
                        "bed_id": bed_id,
                        "zone_id": zone_id,
                        "length_m": round(z.length, 3),
                    },
                })

    return {
        "type": "FeatureCollection",
        "metadata": {
            "bed_count": bed_counter,
            "zone_count": zone_counter,
            "area_m2": round(total_area, 2),
            "bed_spacing_m": bed_spacing,
            "zone_length_m": zone_length,
            "buffer_m": buffer_m,
            "direction": direction,
        },
        "features": all_features,
    }


def _extract_geom(gj: dict):
    t = gj.get("type")
    if t == "FeatureCollection":
        geoms = [shape(f["geometry"]) for f in gj["features"]]
        polys: list[Polygon] = []
        for g in geoms:
            if isinstance(g, Polygon):
                polys.append(g)
            elif isinstance(g, MultiPolygon):
                polys.extend(g.geoms)
        if not polys:
            raise ValueError("No polygons in FeatureCollection")
        return polys[0] if len(polys) == 1 else MultiPolygon(polys)
    if t == "Feature":
        return shape(gj["geometry"])
    if t in ("Polygon", "MultiPolygon"):
        return shape(gj)
    raise ValueError(f"Unsupported GeoJSON type: {t}")
