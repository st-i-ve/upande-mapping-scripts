"""
Unified bed + zone generator.

Input: a GeoJSON Polygon / MultiPolygon (WGS84).
Output: a GeoJSON FeatureCollection of numbered bed LineStrings, zone
LineStrings, and (optionally) block polygons. Bed numbering is continuous
across all polygon parts and across all blocks within a part; when blocks
are sliced perpendicular to bed direction the numbering snakes (U-turns)
between blocks for natural irrigation-row flow.

All metric math is done in UTM; geometry is reprojected back to WGS84 on
output. Irregular / terraced polygons are handled naturally by the
inward-buffer + clip step.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Iterable

from pyproj import Transformer
from shapely import ops
from shapely.affinity import rotate
from shapely.geometry import (
    LineString,
    MultiLineString,
    MultiPolygon,
    Point,
    Polygon,
    box,
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


def _parallel_lines(poly, spacing: float) -> list[LineString]:
    """Horizontal lines spanning poly bounds, spaced `spacing` apart in Y."""
    minx, miny, maxx, maxy = poly.bounds
    pad = spacing
    y = miny + spacing / 2.0
    lines: list[LineString] = []
    while y <= maxy:
        lines.append(LineString([(minx - pad, y), (maxx + pad, y)]))
        y += spacing
    return lines


def _evenly_spaced_lines(poly, count: int) -> list[LineString]:
    """Place `count` horizontal LineStrings evenly across poly's Y-extent.

    Each line spans the X-extent (with small padding so clipping doesn't lose
    the endpoints to floating-point noise). Beds are placed at band centers,
    so spacing is uniform and the outermost beds sit half a band from each
    edge — symmetric within the (already inward-buffered) block.
    """
    minx, miny, maxx, maxy = poly.bounds
    if count <= 0 or maxy <= miny:
        return []
    pad = max((maxx - minx) * 0.01, 1.0)
    band = (maxy - miny) / count
    lines: list[LineString] = []
    for i in range(count):
        y = miny + (i + 0.5) * band
        lines.append(LineString([(minx - pad, y), (maxx + pad, y)]))
    return lines


def _resolve_block_counts(block_end_beds, total_blocks: int) -> list[int]:
    """Convert cumulative end-bed numbers into per-block bed counts.

    e.g. [50, 95] with 2 blocks → [50, 45]. Strictly increasing values
    are required. Missing entries (when fewer numbers given than blocks)
    yield 0 so the block gets no beds — easy to spot visually.
    """
    if not block_end_beds:
        return [0] * total_blocks
    counts: list[int] = []
    prev = 0
    for end in block_end_beds:
        end = int(end)
        if end <= prev:
            raise ValueError(
                f"block_end_beds must be strictly increasing positive integers; got {list(block_end_beds)}"
            )
        counts.append(end - prev)
        prev = end
    while len(counts) < total_blocks:
        counts.append(0)
    return counts[:total_blocks]


def _resolve_block_ranges(
    block_bed_ranges,
    block_end_beds,
    total_blocks: int,
) -> list[tuple[int, int]]:
    """Resolve per-block (start_bed, end_bed) pairs.

    Precedence:
      1. block_bed_ranges (list[(start, end)]) is taken as-is. Each block's
         range is independent — gaps between blocks are allowed (e.g. block 1
         is 1-50, block 2 is 200-244 for a physically-separate greenhouse).
      2. block_end_beds (cumulative) is the legacy form; converted to
         contiguous ranges starting at 1.
      3. Neither given → caller falls back to spacing mode; this returns [].

    Validation:
      - 1 ≤ start ≤ end within each block
      - block i's start > block i-1's end (no overlap)
    """
    if block_bed_ranges:
        ranges: list[tuple[int, int]] = []
        prev_end = 0
        for i, item in enumerate(block_bed_ranges):
            try:
                start, end = int(item[0]), int(item[1])
            except (TypeError, ValueError, IndexError) as e:
                raise ValueError(
                    f"block_bed_ranges[{i}] must be [start, end] integers; got {item!r}"
                ) from e
            if start < 1 or end < 1 or start > end:
                raise ValueError(
                    f"block_bed_ranges[{i}]: start={start} end={end} must satisfy 1 ≤ start ≤ end"
                )
            if start <= prev_end:
                raise ValueError(
                    f"block_bed_ranges[{i}] (start={start}) must be greater than the previous block's end ({prev_end})"
                )
            ranges.append((start, end))
            prev_end = end
        while len(ranges) < total_blocks:
            ranges.append((0, 0))  # zero-bed sentinel
        return ranges[:total_blocks]

    if block_end_beds:
        counts = _resolve_block_counts(block_end_beds, total_blocks)
        ranges = []
        cursor = 1
        for cnt in counts:
            if cnt <= 0:
                ranges.append((0, 0))
            else:
                ranges.append((cursor, cursor + cnt - 1))
                cursor += cnt
        return ranges

    return []


def _clip_to_parts(line: LineString, poly) -> list[LineString]:
    clipped = line.intersection(poly)
    if clipped.is_empty:
        return []
    if isinstance(clipped, LineString):
        return [clipped]
    if isinstance(clipped, MultiLineString):
        return [g for g in clipped.geoms if g.length > 0]
    return []


def _subdivide(
    line: LineString,
    zone_length: float,
    min_remainder_m: float = 1.0,
) -> list[LineString]:
    """Split `line` into zones of exactly `zone_length` metres each.

    Full zones are never squeezed. The leftover at the end is kept as its own
    (short) zone only when it exceeds `min_remainder_m`; otherwise it's dropped.
    So a 9 m line at 4 m zones with min_remainder=1 m → two 4 m zones (the 1 m
    tail is dropped), but a 3 m line keeps its single 3 m zone (3 > 1).
    """
    total = line.length
    # 1 µm tolerance covers numerical drift on bed lengths that are exactly
    # an integer multiple of zone_length but land at e.g. 8.0 - 1e-12 in UTM.
    EPS = 1e-6
    n_full = int((total + EPS) // zone_length)
    zones: list[LineString] = []
    for i in range(n_full):
        seg = ops.substring(line, i * zone_length, (i + 1) * zone_length)
        if seg.length > 0:
            zones.append(seg)
    used = n_full * zone_length
    leftover = total - used
    if leftover > min_remainder_m + EPS:
        seg = ops.substring(line, used, total)
        if seg.length > 0:
            zones.append(seg)
    return zones


# ---------- block splitting ------------------------------------------------

def _split_in_rotated_frame(rotated, n_blocks: int, split_axis: str) -> list:
    """
    Split a polygon (already rotated so its long axis aligns with X) into
    `n_blocks` equal pieces along `split_axis`.

    split_axis="longest"  → cuts perpendicular to long axis (slices stacked along X)
    split_axis="shortest" → cuts parallel to long axis      (slices stacked along Y)
    split_axis="none"     → no split, returns [rotated]

    Returned list is ordered by ascending X (longest) or ascending Y (shortest)
    of each piece — re-ordering for the user's start-corner happens in the caller.
    """
    if n_blocks <= 1 or split_axis == "none":
        return [rotated]

    minx, miny, maxx, maxy = rotated.bounds
    pad = max(maxx - minx, maxy - miny) + 10.0  # plenty of overhang for cutters
    pieces = []

    if split_axis == "longest":
        step = (maxx - minx) / n_blocks
        for i in range(n_blocks):
            cutter = box(minx + i * step, miny - pad, minx + (i + 1) * step, maxy + pad)
            piece = rotated.intersection(cutter)
            if not piece.is_empty and piece.area > 0:
                pieces.append(piece)
    elif split_axis == "shortest":
        step = (maxy - miny) / n_blocks
        for i in range(n_blocks):
            cutter = box(minx - pad, miny + i * step, maxx + pad, miny + (i + 1) * step)
            piece = rotated.intersection(cutter)
            if not piece.is_empty and piece.area > 0:
                pieces.append(piece)
    else:
        raise ValueError(f"Unknown split_axis: {split_axis}")

    return pieces


def _order_blocks(blocks: list, start_corner: str, split_axis: str) -> list:
    """Reorder blocks so block #1 is the one nearest the user's start corner."""
    if split_axis == "longest":
        # blocks are stacked along X. NW/SW want low-X first; NE/SE want high-X first.
        if start_corner in ("NE", "SE"):
            return list(reversed(blocks))
    elif split_axis == "shortest":
        # blocks are stacked along Y. NW/NE want high-Y first; SW/SE want low-Y first.
        if start_corner in ("NW", "NE"):
            return list(reversed(blocks))
    return list(blocks)


def _flip_corner_for_serpentine(corner: str, split_axis: str) -> str:
    """Flip the start corner used for block N+1 so its first bed touches the
    last bed of block N (boustrophedon U-turn).

    For "shortest" splits (cuts parallel to bed direction → blocks stacked along
    bed direction), flip E↔W so the seam aligns. For everything else — the
    "longest" equal split AND terrace/custom_blocks where blocks are typically
    arranged side-by-side relative to bed flow — flip N↔S so block N+1's first
    bed lives at the same end of the next block as block N's last bed.
    """
    if split_axis == "shortest":
        return {"NW": "NE", "NE": "NW", "SW": "SE", "SE": "SW"}.get(corner, corner)
    return {"NW": "SW", "SW": "NW", "NE": "SE", "SE": "NE"}.get(corner, corner)


def _should_alternate(split_axis: str) -> bool:
    """U-turn between blocks only when the split crosses the bed direction.

    Beds always run along X in our rotated frame. A "longest" split puts cuts
    perpendicular to X → blocks are side-by-side relative to beds → snake.
    A "shortest" split puts cuts parallel to X → blocks are stacked along bed
    direction → continuing in the same direction is the natural flow.
    """
    return split_axis == "longest"


# ---------- preview anchor helpers -----------------------------------------

def _block_corners_wgs(
    block_utm: Polygon,
    parent_angle: float,
    parent_origin,
    to_wgs: Transformer,
) -> dict:
    """Return the four corners (NW, NE, SW, SE) of `block_utm`'s rotated
    long-axis bounding box, projected back to WGS84 lat/lon."""
    rotated = rotate(block_utm, -parent_angle, origin=parent_origin)
    minx, miny, maxx, maxy = rotated.bounds
    out: dict[str, dict] = {}
    for label, xy in [
        ("NW", (minx, maxy)),
        ("NE", (maxx, maxy)),
        ("SW", (minx, miny)),
        ("SE", (maxx, miny)),
    ]:
        pt = rotate(Point(xy), parent_angle, origin=parent_origin)
        wgs = _project(pt, to_wgs)
        out[label] = {"lat": wgs.y, "lon": wgs.x}
    return out


def _first_bed_endpoints(
    block_utm: Polygon,
    parent_angle: float,
    parent_origin,
    start_corner: str,
    buffer_m: float = 0.0,
) -> tuple[Point, Point] | tuple[None, None]:
    """Return (A, B) — the UTM endpoints of bed #1 of `block_utm`.

    A is at the user's chosen `start_corner` of the (buffered) block; B is
    the other end of the same row, so A→B shows the bed-flow direction
    that snakes through subsequent blocks.
    """
    inset = block_utm.buffer(-buffer_m) if buffer_m > 0 else block_utm
    if inset.is_empty or inset.area <= 0:
        inset = block_utm
    rotated = rotate(inset, -parent_angle, origin=parent_origin)
    minx, miny, maxx, maxy = rotated.bounds
    margin = max((maxy - miny) * 0.02, 0.25)
    if start_corner in ("NW", "NE"):
        y = maxy - margin
    else:
        y = miny + margin
    pad = max((maxx - minx) * 0.1, 1.0)
    line = LineString([(minx - pad, y), (maxx + pad, y)])
    seg = line.intersection(rotated)
    if seg.is_empty:
        return None, None
    if seg.geom_type == "MultiLineString":
        seg = max(seg.geoms, key=lambda g: g.length)
    if seg.geom_type != "LineString":
        return None, None
    cs = list(seg.coords)
    if len(cs) < 2:
        return None, None
    # LineString from a horizontal line is left-to-right (low-x to high-x).
    if start_corner in ("NW", "SW"):
        a_rot, b_rot = cs[0], cs[-1]
    else:
        a_rot, b_rot = cs[-1], cs[0]
    a_pt = rotate(Point(a_rot), parent_angle, origin=parent_origin)
    b_pt = rotate(Point(b_rot), parent_angle, origin=parent_origin)
    return a_pt, b_pt


# ---------- bed ordering helpers -------------------------------------------

def _segment_sort_key(corner: str):
    """Sort key turning rotated-frame segments into bed #1, #2, … from `corner`.

    Primary axis is row (Y); secondary is fragment X for clipped multi-fragment rows.
    """
    if corner == "NW":
        return lambda s: (-s.centroid.y, s.centroid.x)
    if corner == "NE":
        return lambda s: (-s.centroid.y, -s.centroid.x)
    if corner == "SW":
        return lambda s: (s.centroid.y, s.centroid.x)
    if corner == "SE":
        return lambda s: (s.centroid.y, -s.centroid.x)
    raise ValueError(f"Unknown start corner: {corner}")


def _orient_segment(seg: LineString, corner: str) -> LineString:
    """Make the LineString run from the corner side outward, so zone Z01 lands
    on the user's chosen end."""
    coords = list(seg.coords)
    if len(coords) < 2:
        return seg
    want_start_low_x = corner in ("NW", "SW")
    starts_low = coords[0][0] <= coords[-1][0]
    if want_start_low_x != starts_low:
        return LineString(list(reversed(coords)))
    return seg


# ---------- terrace mode helpers -------------------------------------------

def _ring_coords(poly: Polygon) -> list[tuple[float, float]]:
    """Exterior ring without the duplicated closing vertex."""
    return [(x, y) for x, y in poly.exterior.coords[:-1]]


def _edge_vec(coords, i):
    n = len(coords)
    a = coords[i]
    b = coords[(i + 1) % n]
    return (b[0] - a[0], b[1] - a[1])


def _edge_length(coords, i):
    dx, dy = _edge_vec(coords, i)
    return math.hypot(dx, dy)


def _turn_angle_deg(coords, i):
    """Signed angle (deg) from edge i to edge i+1 — i.e. the turn at vertex i+1."""
    v1 = _edge_vec(coords, i)
    v2 = _edge_vec(coords, (i + 1) % len(coords))
    a1 = math.degrees(math.atan2(v1[1], v1[0]))
    a2 = math.degrees(math.atan2(v2[1], v2[0]))
    d = a2 - a1
    while d > 180:
        d -= 360
    while d < -180:
        d += 360
    return d


def _is_zigzag_edge(coords, i: int, angle_tol_deg: float) -> bool:
    """An edge is part of a zigzag chain if both its endpoint turns are ~90°
    AND they have opposite signs (alternating left/right turns)."""
    n = len(coords)
    turn_before = _turn_angle_deg(coords, (i - 1) % n)
    turn_after = _turn_angle_deg(coords, i)
    if abs(abs(turn_before) - 90) > angle_tol_deg:
        return False
    if abs(abs(turn_after) - 90) > angle_tol_deg:
        return False
    return (turn_before > 0) != (turn_after > 0)


def _grow_step_chain(coords, start_edge_idx: int, angle_tol_deg: float = 25.0) -> list[int]:
    """Walk forward and backward from start_edge_idx, gathering consecutive
    zigzag edges. The chain stops when the alternating-turn pattern breaks
    (e.g., the next edge is a smooth corner or runs along a flat side).
    """
    n = len(coords)
    if n < 4:
        return [start_edge_idx % n]

    start = start_edge_idx % n
    if not _is_zigzag_edge(coords, start, angle_tol_deg):
        # Click landed on a non-zigzag edge — return just it; UI will warn.
        return [start]

    chain: list[int] = [start]
    seen: set[int] = {start}

    # Walk forward.
    j = start
    while True:
        nxt = (j + 1) % n
        if nxt in seen or not _is_zigzag_edge(coords, nxt, angle_tol_deg):
            break
        chain.append(nxt)
        seen.add(nxt)
        j = nxt

    # Walk backward — prepend.
    j = start
    while True:
        prv = (j - 1) % n
        if prv in seen or not _is_zigzag_edge(coords, prv, angle_tol_deg):
            break
        chain.insert(0, prv)
        seen.add(prv)
        j = prv

    return chain


def _identify_treads(coords, chain: list[int], length_threshold: float = 0.5) -> list[int]:
    """Within a chain of stepped edges, return the indices of the 'tread'
    edges — the longer half by length (treads typically alternate with the
    shorter risers in a staircase).
    """
    if not chain:
        return []
    lengths = [_edge_length(coords, i) for i in chain]
    sorted_pairs = sorted(zip(chain, lengths), key=lambda p: p[1], reverse=True)
    keep = max(1, len(chain) // 2)
    treads = sorted(idx for idx, _ in sorted_pairs[:keep])
    return treads


def _project_tread_inward(
    coords, tread_idx: int, polygon: Polygon, ring_buffer: Polygon | None = None,
) -> LineString | None:
    """Extend the tread edge as a line in the direction that goes INTO the
    polygon, returning the inward chord LineString.

    Approach: take the line through the tread's endpoints, lengthen it far
    past both ends, intersect with the polygon. The result is one or more
    LineStrings inside the polygon (typically the tread itself plus the
    inward extension as a single chord). Pick the chord that contains the
    tread, drop the tread piece, return the remaining inward extension.
    """
    n = len(coords)
    a = coords[tread_idx]
    b = coords[(tread_idx + 1) % n]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    if L == 0:
        return None
    ux, uy = dx / L, dy / L
    # A long line through the tread, extending well past both ends.
    far = max(polygon.bounds[2] - polygon.bounds[0], polygon.bounds[3] - polygon.bounds[1]) * 4
    p_far_a = (a[0] - ux * far, a[1] - uy * far)
    p_far_b = (b[0] + ux * far, b[1] + uy * far)
    full_line = LineString([p_far_a, p_far_b])

    # Intersect the long line with the polygon. The result is the full chord:
    # the tread itself (on the boundary) plus its inward extension. We return
    # this whole chord — polygonize will node it correctly with the polygon
    # boundary, and the tread-coincident portion just dedupes harmlessly.
    chord = full_line.intersection(polygon)
    if chord.is_empty:
        return None
    if chord.geom_type == "MultiLineString":
        # Multiple chord pieces — happens when the polygon is concave and the
        # line clips into and out of it. Return the longest piece (typically
        # the one passing through the tread + its extension).
        pieces = [g for g in chord.geoms if g.geom_type == "LineString"]
        if not pieces:
            return None
        pieces.sort(key=lambda p: p.length, reverse=True)
        chord = pieces[0]
    if chord.geom_type != "LineString" or chord.length <= L + 0.1:
        # Tread reaches both polygon boundaries — no inward extension to make.
        return None
    return chord


def _polygonize_with_cuts(polygon: Polygon, cuts: list[LineString]) -> list[Polygon]:
    """Slice a polygon with extension lines.

    The robust path: insert each cut's far endpoint as a new vertex on the
    polygon's boundary (so polygonize sees a clean T-junction there), then
    union the augmented boundary with the cuts and polygonize. This avoids
    the floating-point + collinearity issues that ops.split / unary_union
    run into when a cut is collinear with the tread edge it extends from.
    """
    if not cuts:
        return [polygon]

    boundary_coords = list(polygon.exterior.coords)  # closed ring
    boundary_segments: list[tuple[tuple, tuple]] = []
    for i in range(len(boundary_coords) - 1):
        boundary_segments.append((boundary_coords[i], boundary_coords[i + 1]))

    # For each cut, find the endpoint NOT at a polygon vertex (the inward-end
    # landing on a polygon edge) and figure out which segment it lies on,
    # along with its parametric position. We'll insert all such points into
    # their host segments at the right t.
    insertions: dict[int, list[tuple[float, tuple]]] = {}
    for cut in cuts:
        for pt in (cut.coords[0], cut.coords[-1]):
            best_seg = None
            best_t = None
            best_d = math.inf
            for k, (a, b) in enumerate(boundary_segments):
                # Skip vertices — they're already in the boundary.
                if math.isclose(a[0], pt[0], abs_tol=1e-6) and math.isclose(a[1], pt[1], abs_tol=1e-6):
                    best_d = 0
                    best_seg = None  # exact vertex — skip
                    break
                if math.isclose(b[0], pt[0], abs_tol=1e-6) and math.isclose(b[1], pt[1], abs_tol=1e-6):
                    best_d = 0
                    best_seg = None
                    break
                ax, ay = a
                bx, by = b
                dx, dy = bx - ax, by - ay
                seg_len_sq = dx * dx + dy * dy
                if seg_len_sq == 0:
                    continue
                t = ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / seg_len_sq
                if t < 0 or t > 1:
                    continue
                px = ax + t * dx
                py = ay + t * dy
                d = math.hypot(px - pt[0], py - pt[1])
                if d < best_d:
                    best_d = d
                    best_seg = k
                    best_t = t
            if best_seg is not None and best_d < 0.05:
                insertions.setdefault(best_seg, []).append((best_t, pt))

    # Build the augmented boundary: walk segments, inserting any extra points
    # at their parametric positions in the right order.
    new_boundary: list[tuple] = [boundary_coords[0]]
    for k, (a, b) in enumerate(boundary_segments):
        for t, pt in sorted(insertions.get(k, [])):
            new_boundary.append(pt)
        new_boundary.append(b)
    augmented = LineString(new_boundary)

    merged = ops.unary_union([augmented, *cuts])
    sections = list(ops.polygonize(merged))
    poly_buf = polygon.buffer(1e-3)
    inside = [
        s
        for s in sections
        if s.area > 0.01 and poly_buf.contains(s.representative_point())
    ]
    return inside


def _section_sort_key(part_angle: float, origin):
    """Return a key sorting sections by their centroid along the long axis.

    Sections are walked top-to-bottom in the rotated long-axis frame so S1
    is at the highest Y (north end), SN at the lowest Y.
    """

    def key(poly):
        c = poly.centroid
        # Rotate centroid into the long-axis frame.
        rotated_c = rotate(c, -part_angle, origin=origin)
        return -rotated_c.y

    return key


_AXIS_NORMALISE = {
    "longest": "longest",
    "long": "longest",
    "l": "longest",
    "shortest": "shortest",
    "short": "shortest",
    "s": "shortest",
}

# Outer regex matches the whole group part: leaves bracket internals as a raw
# string for a second pass (so the bracket can carry the new per-sub list with
# its own commas and @C tokens).
_BLOCK_OUTER_RE = re.compile(
    r"""
    ^\s*
    (?P<a>\d+)
    (?:\s*-\s*(?P<b>\d+))?
    (?:\s*\[(?P<bracket>[^\]]*)\]\s*)?
    (?:\s*@\s*(?P<corner>NW|NE|SW|SE)\s*)?
    \s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Old bracket form: "Nx axis" with optional ~ reverse flag.
_BRACKET_OLD_RE = re.compile(
    r"""
    ^\s*
    (?P<n>\d+)\s*x\s*(?P<axis>longest|shortest|long|short|l|s)
    \s*(?P<rev>~)?\s*
    $
    """,
    re.IGNORECASE | re.VERBOSE,
)

# New bracket form: "[Nx ]axis : <orig_idx>[@C], <orig_idx>[@C], …"
# The list order is the bed-flow order; orig_idx points at the natural
# (pre-sort) sub-block position so reordering stays unambiguous.
_BRACKET_NEW_RE = re.compile(
    r"""
    ^\s*
    (?:(?P<n>\d+)\s*x\s*)?
    (?P<axis>longest|shortest|long|short|l|s)
    \s*:\s*
    (?P<list>.+)
    $
    """,
    re.IGNORECASE | re.VERBOSE,
)

_SUB_SPEC_RE = re.compile(
    r"""
    ^\s*
    (?P<idx>\d+)
    (?:\s*@\s*(?P<corner>NW|NE|SW|SE))?
    \s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)


def _parse_bracket(
    bracket_text: str,
) -> tuple[int, str, list[tuple[int, str | None]] | None]:
    """Parse the contents of a [...] split spec.

    Returns (n_split, axis, sub_specs).
    sub_specs is None for old-syntax brackets (caller falls back to natural
    sub-block order). For new syntax, sub_specs is a list of (orig_idx,
    corner_or_None) in bed-flow order. The legacy `~` reverse flag is
    desugared into an equivalent sub_specs list so the caller has one
    code path.
    """
    raw = bracket_text.strip()

    m = _BRACKET_OLD_RE.match(raw)
    if m:
        n_split = int(m.group("n"))
        axis = _AXIS_NORMALISE[m.group("axis").lower()]
        if m.group("rev"):
            sub_specs = [(i, None) for i in range(n_split, 0, -1)]
            return (n_split, axis, sub_specs)
        return (n_split, axis, None)

    m = _BRACKET_NEW_RE.match(raw)
    if m:
        axis = _AXIS_NORMALISE[m.group("axis").lower()]
        items = [it.strip() for it in m.group("list").split(",") if it.strip()]
        if not items:
            raise ValueError(f"Bracket '[{raw}]' has no sub-block items")
        sub_specs: list[tuple[int, str | None]] = []
        seen: set[int] = set()
        for it in items:
            sm = _SUB_SPEC_RE.match(it)
            if not sm:
                raise ValueError(
                    f"Bad sub-block spec '{it}' in '[{raw}]' — use forms like '1' or '2@SE'."
                )
            idx = int(sm.group("idx"))
            if idx in seen:
                raise ValueError(
                    f"Sub-block index {idx} listed twice in '[{raw}]'."
                )
            seen.add(idx)
            corner = sm.group("corner").upper() if sm.group("corner") else None
            sub_specs.append((idx, corner))
        n_split = int(m.group("n")) if m.group("n") else len(sub_specs)
        if n_split != len(sub_specs):
            raise ValueError(
                f"Split count {n_split} doesn't match list length {len(sub_specs)} in '[{raw}]'."
            )
        for idx, _ in sub_specs:
            if idx < 1 or idx > n_split:
                raise ValueError(
                    f"Sub-block index {idx} out of range 1..{n_split} in '[{raw}]'."
                )
        return (n_split, axis, sub_specs)

    raise ValueError(
        f"Invalid bracket '[{raw}]' — use forms like '2x longest', '2x longest~', or 'shortest: 1@SE, 2@SW'."
    )


def _split_grouping_top_level(grouping: str) -> list[str]:
    """Split a grouping string on commas at the top level — commas inside
    `[...]` annotations don't separate blocks."""
    parts: list[str] = []
    depth = 0
    cur: list[str] = []
    for ch in grouping:
        if ch == "[":
            depth += 1
            cur.append(ch)
        elif ch == "]":
            depth = max(0, depth - 1)
            cur.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if cur:
        parts.append("".join(cur))
    return parts


def _resolve_grouping_with_splits(
    grouping: str, n_sections: int
) -> list[tuple[list[int], tuple[int, str] | None, str | None, list[tuple[int, str | None]] | None]]:
    """Parse a grouping string into per-block (section_indices, split_spec, corner_override, sub_specs).

    Examples:
      '1-3, 4, 5-7'                       → 3 plain blocks, no splits
      '1-2[2x longest], 3, 4-5[3xS]'      → split annotations honoured, default sub order
      '1-2, 3@SE, 4-5'                    → middle block forced to start at SE corner
      '1-2[2x long]@NE, 3'                → 1-2 merged then split-2-along-long, first sub at NE
      '2[2x longest~]'                    → split + reverse sub order (sugar for new syntax)
      '5[2x shortest: 2@SW, 1@SE]'        → explicit per-sub list: original#2 becomes 'a' at SW, original#1 becomes 'b' at SE
      '5[shortest: 1@SE, 2]'              → count inferred from list length; sub#2 has no override (auto-flip)

    sub_specs:
      - None: use natural sub-block order (1..N); corner_override applies to first sub only
      - list[(orig_idx, corner_or_None)]: use this explicit bed-flow order; each entry's
        corner overrides for that sub. The group-level @corner falls back to the FIRST sub
        if its entry has no @C.
    """
    if not grouping or not grouping.strip():
        return [([i + 1], None, None, None) for i in range(n_sections)]

    blocks: list[tuple[list[int], tuple[int, str] | None, str | None, list[tuple[int, str | None]] | None]] = []
    for raw in _split_grouping_top_level(grouping):
        part = raw.strip()
        if not part:
            continue
        m = _BLOCK_OUTER_RE.match(part)
        if not m:
            raise ValueError(
                f"Invalid block spec '{part}' — use forms like '1', '2-4', '1-2[2x longest]', '3@SE', '5[shortest: 1@SE, 2@SW]'."
            )
        a = int(m.group("a"))
        b = int(m.group("b")) if m.group("b") else a
        if a < 1 or b < 1 or a > b or b > n_sections:
            raise ValueError(
                f"Block range '{part}' out of bounds for {n_sections} sections."
            )
        sections = list(range(a, b + 1))

        spec: tuple[int, str] | None = None
        sub_specs: list[tuple[int, str | None]] | None = None
        if m.group("bracket") is not None:
            n_split, axis, sub_specs = _parse_bracket(m.group("bracket"))
            if n_split < 1 or n_split > 20:
                raise ValueError(
                    f"Block '{part}': split count must be 1–20, got {n_split}."
                )
            spec = (n_split, axis) if n_split > 1 else None
            if spec is None:
                # n=1 split is a no-op; drop the sub_specs too.
                sub_specs = None

        corner_override = m.group("corner").upper() if m.group("corner") else None
        blocks.append((sections, spec, corner_override, sub_specs))
    return blocks


def _resolve_grouping(grouping: str, n_sections: int) -> list[list[int]]:
    """Backwards-compat shim — returns just the section index lists."""
    return [secs for secs, _, _, _ in _resolve_grouping_with_splits(grouping, n_sections)]


def terrace_sections(
    polygon_geojson: dict,
    start_edge_idx: int,
    grouping: str | None = None,
    angle_tol_deg: float = 25.0,
    tread_length_ratio: float = 0.5,
    start_corner: str = "NW",
    buffer_m: float = 0.0,
) -> dict:
    """Compute terrace sections by extending tread edges inward.

    Steps:
      1. Take the outer polygon (first part if multipolygon).
      2. Walk a chain of right-angled edges starting from start_edge_idx.
      3. Among the chain, keep only the longer 'tread' edges.
      4. Extend each tread inward as a line, take the chord-extension.
      5. Polygonize the polygon with the cuts → numbered sections.
      6. If `grouping` is given, merge sections per the grouping into blocks.

    Returns a FeatureCollection with kind ∈ {"chain_edge","cut","section","block"}
    plus a metadata block. All geometry is in WGS84.
    """

    geom = _extract_geom(polygon_geojson)
    lon, lat = geom.centroid.x, geom.centroid.y
    to_utm, to_wgs = _transformers(lon, lat)

    geom_utm = _project(geom, to_utm)
    if isinstance(geom_utm, MultiPolygon):
        # Pick the largest part — terrace mode operates on a single greenhouse.
        geom_utm = max(geom_utm.geoms, key=lambda g: g.area)
    if not isinstance(geom_utm, Polygon):
        raise ValueError("Terrace mode requires a Polygon (or MultiPolygon).")

    coords = _ring_coords(geom_utm)
    n = len(coords)
    if start_edge_idx < 0 or start_edge_idx >= n:
        raise ValueError(
            f"start_edge_idx {start_edge_idx} out of range for {n} edges"
        )

    chain = _grow_step_chain(coords, start_edge_idx, angle_tol_deg=angle_tol_deg)
    treads = _identify_treads(coords, chain, length_threshold=tread_length_ratio)

    cut_lines: list[LineString] = []
    for t in treads:
        cut = _project_tread_inward(coords, t, geom_utm)
        if cut is not None:
            cut_lines.append(cut)

    sections = _polygonize_with_cuts(geom_utm, cut_lines)
    angle = _long_axis_angle(geom_utm)
    sections.sort(key=_section_sort_key(angle, geom_utm.centroid))

    features: list[dict] = []
    # Chain edges (highlight what was auto-grown).
    for i in chain:
        a = coords[i]
        b = coords[(i + 1) % n]
        seg_wgs = _project(LineString([a, b]), to_wgs)
        features.append({
            "type": "Feature",
            "geometry": mapping(seg_wgs),
            "properties": {
                "kind": "chain_edge",
                "edge_idx": i,
                "is_tread": i in treads,
                "length_m": round(_edge_length(coords, i), 3),
            },
        })

    for k, cut in enumerate(cut_lines, start=1):
        cut_wgs = _project(cut, to_wgs)
        features.append({
            "type": "Feature",
            "geometry": mapping(cut_wgs),
            "properties": {"kind": "cut", "i": k, "length_m": round(cut.length, 3)},
        })

    section_polys_wgs: list[dict] = []
    for k, s in enumerate(sections, start=1):
        s_wgs = _project(s, to_wgs)
        gj = mapping(s_wgs)
        feat = {
            "type": "Feature",
            "geometry": gj,
            "properties": {
                "kind": "section",
                "section_id": f"S{k}",
                "i": k,
                "area_m2": round(s.area, 2),
            },
        }
        features.append(feat)
        section_polys_wgs.append(gj)

    blocks_geojson: list[dict] = []
    block_start_corners: list[str | None] = []
    block_corners_meta: list[dict] = []
    first_a: Point | None = None
    first_b: Point | None = None
    if grouping is not None and sections:
        groups = _resolve_grouping_with_splits(grouping, len(sections))
        # Parent angle/origin used for per-block equal subdivision so all
        # sub-blocks share the polygon's long-axis frame.
        parent_angle = _long_axis_angle(geom_utm)
        parent_origin = geom_utm.centroid

        for group_idx, (grp, split_spec, corner_override, sub_specs) in enumerate(groups, start=1):
            merged = ops.unary_union([sections[i - 1] for i in grp])
            if merged.is_empty:
                continue
            # Merging adjacent polygons normally yields a single Polygon, but
            # if sections are non-adjacent we may get a MultiPolygon — keep
            # the largest piece.
            if isinstance(merged, MultiPolygon):
                merged = max(merged.geoms, key=lambda g: g.area)
            if not isinstance(merged, Polygon):
                continue

            # Each entry: (poly_utm, block_id, grp_used, split_spec, effective_override, orig_idx_or_None)
            block_polys: list[tuple[Polygon, str, list[int], tuple[int, str] | None, str | None, int | None]] = []
            if split_spec is None:
                block_id = f"P{group_idx:02d}"
                block_polys.append((merged, block_id, grp, None, corner_override, None))
            else:
                n_split, split_axis = split_spec
                rotated_block = rotate(merged, -parent_angle, origin=parent_origin)
                sub_blocks_rot = _split_in_rotated_frame(
                    rotated_block, n_split, split_axis
                )
                # Filter empties first so a/b/c suffixes stay contiguous.
                sub_blocks_rot = [
                    sb for sb in sub_blocks_rot if not sb.is_empty and sb.area > 0.01
                ]

                # Resolve final ordering and per-sub corner overrides. With no
                # sub_specs we fall back to natural order (1..N) and apply the
                # group-level @corner only to the first sub.
                if sub_specs is None:
                    final_order: list[tuple[int, str | None]] = [
                        (i + 1, None) for i in range(len(sub_blocks_rot))
                    ]
                else:
                    final_order = [
                        (orig_idx, corner)
                        for orig_idx, corner in sub_specs
                        if 1 <= orig_idx <= len(sub_blocks_rot)
                    ]
                # Group-level @C falls back to the first sub if it has no
                # explicit corner of its own — works for both legacy and
                # new syntax.
                if final_order and corner_override is not None and final_order[0][1] is None:
                    final_order[0] = (final_order[0][0], corner_override)

                for sub_idx, (orig_idx, sub_corner) in enumerate(final_order, start=1):
                    sb_rot = sub_blocks_rot[orig_idx - 1]
                    sb = rotate(sb_rot, parent_angle, origin=parent_origin)
                    if not isinstance(sb, Polygon):
                        if isinstance(sb, MultiPolygon):
                            sb = max(sb.geoms, key=lambda g: g.area)
                        else:
                            continue
                    sub_id = f"P{group_idx:02d}{chr(ord('a') + sub_idx - 1)}"
                    block_polys.append(
                        (sb, sub_id, grp, (n_split, split_axis), sub_corner, orig_idx)
                    )

            for poly_utm, block_id, grp_used, spec, effective_override, orig_idx in block_polys:
                block_start_corners.append(effective_override)

                poly_wgs = _project(poly_utm, to_wgs)
                gj = mapping(poly_wgs)
                blocks_geojson.append(gj)
                features.append({
                    "type": "Feature",
                    "geometry": gj,
                    "properties": {
                        "kind": "block",
                        "block_id": block_id,
                        "sections": grp_used,
                        "split": (
                            {
                                "n": spec[0],
                                "axis": spec[1],
                                "orig_idx": orig_idx,
                                "per_sub": sub_specs is not None,
                            }
                            if spec
                            else None
                        ),
                        "corner_override": effective_override,
                        "area_m2": round(poly_utm.area, 2),
                    },
                })
                # First block in the final list anchors bed-flow direction.
                # Use the override if given (so the A/B markers reflect what
                # the user actually picked), else the global start_corner.
                if first_a is None:
                    first_a, first_b = _first_bed_endpoints(
                        poly_utm,
                        parent_angle,
                        parent_origin,
                        effective_override or start_corner,
                        buffer_m=buffer_m,
                    )
                # Per-block corner coords for the click-to-pick UI.
                corners = _block_corners_wgs(
                    poly_utm, parent_angle, parent_origin, to_wgs
                )
                corners["block_id"] = block_id
                block_corners_meta.append(corners)

    a_wgs = _project(first_a, to_wgs) if first_a is not None else None
    b_wgs = _project(first_b, to_wgs) if first_b is not None else None
    return {
        "type": "FeatureCollection",
        "metadata": {
            "edge_count": n,
            "chain_edges": list(chain),
            "tread_edges": list(treads),
            "section_count": len(sections),
            "block_count": len(blocks_geojson),
            "grouping": grouping,
            "start_corner": start_corner,
            "block_start_corners": block_start_corners,
            "block_corners": block_corners_meta,
            "first_bed_a": (
                {"lat": a_wgs.y, "lon": a_wgs.x} if a_wgs is not None else None
            ),
            "first_bed_b": (
                {"lat": b_wgs.y, "lon": b_wgs.x} if b_wgs is not None else None
            ),
        },
        "features": features,
        "block_geojson": blocks_geojson,
    }


# ---------- preview API (split-only) ---------------------------------------

def preview_split(
    polygon_geojson: dict,
    direction: str = "along_long_axis",
    n_blocks: int = 1,
    split_axis: str = "none",
    start_corner: str = "NW",
    buffer_m: float = 0.0,
    block_prefix: str = "P",
) -> dict:
    """Return block polygons + cut LineStrings for a polygon, without computing
    beds. Used for live UI preview of the split before the user hits Generate."""

    geom = _extract_geom(polygon_geojson)
    lon, lat = geom.centroid.x, geom.centroid.y
    to_utm, to_wgs = _transformers(lon, lat)

    geom_utm = _project(geom, to_utm)
    parts: list[Polygon] = (
        list(geom_utm.geoms) if isinstance(geom_utm, MultiPolygon) else [geom_utm]
    )

    features: list[dict] = []
    block_counter = 0
    first_a: Point | None = None
    first_b: Point | None = None

    for part in parts:
        if part.is_empty or part.area <= 0:
            continue

        angle = _long_axis_angle(part)
        if direction == "across_long_axis":
            angle += 90.0
        origin = part.centroid
        rotated = rotate(part, -angle, origin=origin)

        # Cut LineStrings — the N-1 lines that will slice the polygon.
        if n_blocks > 1 and split_axis != "none":
            minx, miny, maxx, maxy = rotated.bounds
            for i in range(1, n_blocks):
                if split_axis == "longest":
                    x = minx + i * (maxx - minx) / n_blocks
                    cut = LineString([(x, miny), (x, maxy)])
                elif split_axis == "shortest":
                    y = miny + i * (maxy - miny) / n_blocks
                    cut = LineString([(minx, y), (maxx, y)])
                else:
                    continue
                # Clip the cut to the polygon so it ends at the polygon edges,
                # not at the bounding box (cleaner for irregular shapes).
                clipped = cut.intersection(rotated)
                if clipped.is_empty:
                    continue
                cut_utm = rotate(clipped, angle, origin=origin)
                cut_wgs = _project(cut_utm, to_wgs)
                features.append({
                    "type": "Feature",
                    "geometry": mapping(cut_wgs),
                    "properties": {"kind": "cut", "axis": split_axis, "i": i},
                })

        ordered_blocks = _order_blocks(
            _split_in_rotated_frame(rotated, n_blocks, split_axis),
            start_corner,
            split_axis,
        )
        for idx, block in enumerate(ordered_blocks):
            if block.is_empty or block.area <= 0:
                continue
            block_counter += 1
            block_id = f"{block_prefix}{block_counter:02d}"
            block_utm = rotate(block, angle, origin=origin)
            block_wgs = _project(block_utm, to_wgs)
            features.append({
                "type": "Feature",
                "geometry": mapping(block_wgs),
                "properties": {
                    "kind": "block",
                    "block_id": block_id,
                    "area_m2": round(block.area, 2),
                },
            })
            # First block (in user-chosen corner order) gets the A/B anchors.
            if idx == 0 and first_a is None:
                first_a, first_b = _first_bed_endpoints(
                    block_utm, angle, origin, start_corner, buffer_m=buffer_m
                )

    a_wgs = _project(first_a, to_wgs) if first_a is not None else None
    b_wgs = _project(first_b, to_wgs) if first_b is not None else None
    return {
        "type": "FeatureCollection",
        "metadata": {
            "block_count": block_counter,
            "n_blocks": n_blocks,
            "split_axis": split_axis,
            "direction": direction,
            "start_corner": start_corner,
            "first_bed_a": (
                {"lat": a_wgs.y, "lon": a_wgs.x} if a_wgs is not None else None
            ),
            "first_bed_b": (
                {"lat": b_wgs.y, "lon": b_wgs.x} if b_wgs is not None else None
            ),
        },
        "features": features,
    }


# ---------- main API -------------------------------------------------------

def generate_beds_zones(
    polygon_geojson: dict,
    bed_spacing: float = 1.5,
    zone_length: float = 4.0,
    buffer_m: float = 1.0,
    direction: str = "along_long_axis",
    n_blocks: int = 1,
    split_axis: str = "none",
    start_corner: str = "NW",
    block_end_beds: list[int] | None = None,
    block_bed_ranges: list[tuple[int, int]] | list[list[int]] | None = None,
    custom_blocks: list[dict] | None = None,
    block_start_corners: list[str | None] | None = None,
    bed_prefix: str = "B",
    zone_prefix: str = "Z",
    block_prefix: str = "P",
) -> dict:
    """
    polygon_geojson: GeoJSON Feature, FeatureCollection, Polygon, or MultiPolygon.
    direction:    "along_long_axis" | "across_long_axis" — bed orientation
    n_blocks:     integer ≥1; how many equal pieces to split each part into
    split_axis:   "none" | "longest" | "shortest" — which axis the cut lines cross
    start_corner: "NW" | "NE" | "SW" | "SE" of the rotated long-axis frame —
                  determines which end of the polygon bed #1 lives in.
    block_end_beds: optional list of cumulative end-bed numbers per block. When
                  supplied, beds are distributed evenly within each block to
                  meet the per-block count (count[i] = end[i] - end[i-1]); the
                  bed_spacing parameter is ignored. Length should match the
                  total block count (n_blocks × number_of_input_parts).
    block_bed_ranges: optional list of explicit [start, end] bed-ID ranges per
                  block — e.g. [[1, 50], [200, 244]] gives block 1 IDs B0001-B0050
                  and block 2 IDs B0200-B0244 (skipping 51-199). Useful when two
                  blocks belong to physically-separate greenhouses and shouldn't
                  share a contiguous numbering. Takes precedence over block_end_beds.
    custom_blocks: optional list of GeoJSON polygons. When supplied, equal-
                  split is bypassed and these polygons are used as blocks
                  directly (in the order given). The parent polygon's long
                  axis is still used for bed orientation; serpentine flow
                  alternates per block. Used by terrace mode.
    """

    geom = _extract_geom(polygon_geojson)
    lon, lat = geom.centroid.x, geom.centroid.y
    to_utm, to_wgs = _transformers(lon, lat)

    geom_utm = _project(geom, to_utm)
    parts: list[Polygon] = (
        list(geom_utm.geoms) if isinstance(geom_utm, MultiPolygon) else [geom_utm]
    )

    # Up-front: figure out how many blocks we'll emit in total and resolve the
    # user's cumulative end-bed list into per-block counts.
    use_custom = bool(custom_blocks)
    non_empty_parts = [p for p in parts if not p.is_empty and p.area > 0]
    if use_custom:
        # Each custom block is treated as its own block; equal-split is bypassed.
        # We still rotate by the *parent* polygon's long axis so beds run
        # consistently across all blocks of one greenhouse.
        total_blocks = len(custom_blocks)
    else:
        blocks_per_part = n_blocks if (n_blocks > 1 and split_axis != "none") else 1
        total_blocks = len(non_empty_parts) * blocks_per_part
    use_counts = bool(block_end_beds) or bool(block_bed_ranges)
    block_ranges = (
        _resolve_block_ranges(block_bed_ranges, block_end_beds, total_blocks)
        if use_counts
        else []
    )
    # Per-block counts derived from the resolved ranges (legacy metadata).
    block_counts = [
        (e - s + 1) if (s and e) else 0 for s, e in block_ranges
    ]

    all_features: list[dict] = []
    bed_counter = 0
    zone_counter = 0
    block_counter = 0
    total_area = 0.0
    # In custom-blocks mode we always alternate (assume terrace blocks run
    # perpendicular to bed direction — the user can re-arrange grouping if not).
    alternate = _should_alternate(split_axis) or use_custom

    # Build the list of "parents" to process. In equal-split mode each input
    # part is one parent. In custom mode, we treat the union of custom blocks
    # as a single parent so the long-axis angle is computed across the whole
    # greenhouse, and beds run consistently in every block.
    parents: list[tuple[Polygon, list[Polygon] | None]] = []
    if use_custom:
        custom_polys_utm: list[Polygon] = []
        for cb in custom_blocks:
            cgeom = shape(cb)
            if isinstance(cgeom, MultiPolygon):
                cgeom = max(cgeom.geoms, key=lambda g: g.area)
            if isinstance(cgeom, Polygon) and not cgeom.is_empty:
                custom_polys_utm.append(_project(cgeom, to_utm))
        if not custom_polys_utm:
            raise ValueError("custom_blocks did not contain any usable polygons.")
        parent_utm = ops.unary_union(custom_polys_utm)
        if isinstance(parent_utm, MultiPolygon):
            parent_utm = max(parent_utm.geoms, key=lambda g: g.area)
        parents.append((parent_utm, custom_polys_utm))
    else:
        for part in parts:
            if part.is_empty or part.area <= 0:
                continue
            parents.append((part, None))

    # Track the previous emitted block's corner so alternation/overrides chain
    # correctly across all parents.
    prev_corner: str | None = None

    for part, custom_block_polys in parents:
        total_area += part.area

        angle = _long_axis_angle(part)
        if direction == "across_long_axis":
            angle += 90.0
        origin = part.centroid
        rotated = rotate(part, -angle, origin=origin)

        if custom_block_polys is not None:
            # Use the user's grouping order — block 1 = first group, etc.
            blocks = [rotate(p, -angle, origin=origin) for p in custom_block_polys]
        else:
            raw_blocks = _split_in_rotated_frame(rotated, n_blocks, split_axis)
            blocks = _order_blocks(raw_blocks, start_corner, split_axis)

        for block_idx, block in enumerate(blocks):
            if block.is_empty or block.area <= 0:
                continue
            block_counter += 1
            block_id = f"{block_prefix}{block_counter:02d}"

            override = (
                block_start_corners[block_counter - 1]
                if block_start_corners
                and block_counter - 1 < len(block_start_corners)
                else None
            )
            if override:
                block_corner = override
            elif prev_corner is not None and alternate:
                block_corner = _flip_corner_for_serpentine(prev_corner, split_axis)
            else:
                block_corner = start_corner
            prev_corner = block_corner

            clip_region = block.buffer(-buffer_m) if buffer_m > 0 else block
            if clip_region.is_empty:
                clip_region = block

            # Two modes:
            #  1) count-based — block_end_beds supplied → place exactly N
            #     evenly-distributed rows; each row becomes one bed (a
            #     MultiLineString if the polygon notches it into multiple
            #     fragments). Honours the user's "block 1 ends at bed 50"
            #     promise regardless of polygon shape.
            #  2) spacing-based (legacy) — bed_spacing supplied → step parallel
            #     lines through the whole rotated polygon at fixed intervals
            #     and treat each clipped fragment as its own bed.
            rows: list[list[LineString]] = []
            block_start_id, _ = (
                block_ranges[block_counter - 1]
                if use_counts and block_counter - 1 < len(block_ranges)
                else (0, 0)
            )
            if use_counts:
                requested = block_counts[block_counter - 1]
                if requested > 0:
                    for line in _evenly_spaced_lines(clip_region, requested):
                        fragments = _clip_to_parts(line, clip_region)
                        if fragments:
                            rows.append(fragments)
                # _evenly_spaced_lines walks low-Y → high-Y (south to north).
                # NW/NE want bed #1 at the top, so flip for those corners.
                if block_corner in ("NW", "NE"):
                    rows.reverse()
            else:
                # Legacy: each fragment is its own bed.
                segments: list[LineString] = []
                for line in _parallel_lines(rotated, bed_spacing):
                    segments.extend(_clip_to_parts(line, clip_region))
                segments.sort(key=_segment_sort_key(block_corner))
                rows = [[s] for s in segments]

            block_local_idx = 0
            for row_fragments in rows:
                # Sort fragments within the row by X based on the corner
                # direction so zone numbering Z01 lands on the chosen end.
                row_fragments.sort(
                    key=lambda f, c=block_corner: (
                        f.centroid.x if c in ("NW", "SW") else -f.centroid.x
                    )
                )
                row_fragments = [
                    _orient_segment(f, block_corner) for f in row_fragments
                ]

                bed_counter += 1
                if block_start_id > 0:
                    block_local_idx += 1
                    bed_num = block_start_id + block_local_idx - 1
                else:
                    bed_num = bed_counter
                bed_id = f"{bed_prefix}{bed_num:04d}"
                if len(row_fragments) == 1:
                    bed_geom_local = row_fragments[0]
                else:
                    bed_geom_local = MultiLineString(row_fragments)

                bed_local = rotate(bed_geom_local, angle, origin=origin)
                bed_wgs = _project(bed_local, to_wgs)
                total_length = sum(f.length for f in row_fragments)
                all_features.append({
                    "type": "Feature",
                    "geometry": mapping(bed_wgs),
                    "properties": {
                        "kind": "bed",
                        "bed_id": bed_id,
                        "block_id": block_id,
                        "length_m": round(total_length, 3),
                        "fragment_count": len(row_fragments),
                    },
                })

                # Zones — generated per fragment so notched rows still get
                # geometrically meaningful zones. Multi-fragment beds get
                # zone IDs of the form B0042-F1-Z01, B0042-F2-Z01, …
                multi = len(row_fragments) > 1
                for frag_idx, fragment in enumerate(row_fragments, start=1):
                    for j, z in enumerate(_subdivide(fragment, zone_length), start=1):
                        zone_counter += 1
                        zone_id = (
                            f"{bed_id}-F{frag_idx}-{zone_prefix}{j:02d}"
                            if multi
                            else f"{bed_id}-{zone_prefix}{j:02d}"
                        )
                        z_utm = rotate(z, angle, origin=origin)
                        z_wgs = _project(z_utm, to_wgs)
                        all_features.append({
                            "type": "Feature",
                            "geometry": mapping(z_wgs),
                            "properties": {
                                "kind": "zone",
                                "bed_id": bed_id,
                                "zone_id": zone_id,
                                "block_id": block_id,
                                "length_m": round(z.length, 3),
                            },
                        })

            # Block boundary feature — useful for visualising the split.
            block_utm = rotate(block, angle, origin=origin)
            block_wgs = _project(block_utm, to_wgs)
            block_minx, block_miny, block_maxx, block_maxy = block.bounds
            corner_xy = {
                "NW": (block_minx, block_maxy),
                "NE": (block_maxx, block_maxy),
                "SW": (block_minx, block_miny),
                "SE": (block_maxx, block_miny),
            }[block_corner]
            corner_pt = rotate(Point(corner_xy), angle, origin=origin)
            corner_wgs = _project(corner_pt, to_wgs)
            all_features.append({
                "type": "Feature",
                "geometry": mapping(block_wgs),
                "properties": {
                    "kind": "block",
                    "block_id": block_id,
                    "start_corner": block_corner,
                    "start_corner_lon": corner_wgs.x,
                    "start_corner_lat": corner_wgs.y,
                    "area_m2": round(block.area, 2),
                },
            })

    return {
        "type": "FeatureCollection",
        "metadata": {
            "bed_count": bed_counter,
            "zone_count": zone_counter,
            "block_count": block_counter,
            "area_m2": round(total_area, 2),
            "bed_spacing_m": bed_spacing if not use_counts else None,
            "zone_length_m": zone_length,
            "buffer_m": buffer_m,
            "direction": direction,
            "n_blocks": n_blocks,
            "split_axis": split_axis,
            "start_corner": start_corner,
            "block_end_beds": list(block_end_beds) if block_end_beds else None,
            "block_bed_ranges": (
                [list(r) for r in block_ranges] if use_counts else None
            ),
            "block_counts": block_counts if use_counts else None,
            "mode": "count" if use_counts else "spacing",
            "custom_blocks": True if use_custom else False,
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
