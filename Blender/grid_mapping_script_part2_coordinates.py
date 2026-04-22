"""
Grid mapping — Part 2: Blender empties → GeoJSON of tree coordinates.

What this does
--------------
Reads every empty in the collection and maps its (x, y) in Blender to
(lon, lat) on Earth, using TWO ground-control points (GCPs) you pick from
the satellites.pro map.

The math it uses is a 2-D similarity transform (uniform scale + rotation +
translation). That means:
  * The relative distances between all trees are preserved as one ratio —
    no shear, no squish. The *shape* of the grid that you painstakingly
    laid out in Blender stays intact.
  * The 2 GCPs you provide define that ratio plus the rotation + offset.
    Because GCPs picked by hand from a web map are noisy, any small error
    is absorbed as a tiny uniform scale / rotation tweak — NOT by pulling
    individual trees out of line.
  * The fitted scale is printed at the end. If Blender units = meters
    (which they should be if you set the plane to real-world scale), the
    scale will print as ≈ 1.000. A number very far from 1 means either
    Blender units are not meters, or one GCP is badly off.

How to run
----------
  1. Run `grid_mapping_script_part1_renaming.py` first (the empties must
     already be named `KINYOROBLK4_ROW<r>_T<t>`).
  2. Open the Scripting workspace → open this file in the Text Editor.
  3. Edit the 4 CONFIG values below if your collection / GCPs differ.
  4. Press ▶ Run Script (or Alt+P).
  5. Check the system console for the summary (scale, rotation, count,
     output path). The GeoJSON lands at OUT_GEOJSON.

Paste the file contents into the "Load GeoJSON" textarea in the webview
to visualise every tree as a point.
"""

import bpy
import json
import math
import os

# ---------------------------------------------------------------- config --

COLL_NAME = "KINYORO BLK 4 - KL"

# Ground control points: (empty_name, latitude, longitude)
# Values pulled from satellites.pro URL fragments #A<lat>,<lon>,<zoom>
GCP1 = ("KINYOROBLK4_ROW1_T1",   0.983575, 34.869978)
GCP2 = ("KINYOROBLK4_ROW14_T71", 0.986874, 34.870005)

# Output file name. Lives in a "geojson output" folder next to the .blend.
OUT_FILENAME = "kinyoro_blk4_trees.geojson"
OUT_SUBDIR   = "geojson output"


def resolve_output_path():
    """Build <blend_dir>/<OUT_SUBDIR>/<OUT_FILENAME> and create the folder."""
    blend_path = bpy.data.filepath
    if not blend_path:
        raise RuntimeError(
            "The .blend file is unsaved — save it first so the output "
            "folder has a home."
        )
    blend_dir = os.path.dirname(blend_path)
    out_dir = os.path.join(blend_dir, OUT_SUBDIR)
    os.makedirs(out_dir, exist_ok=True)
    return os.path.join(out_dir, OUT_FILENAME)

# -------------------------------------------------------- lat/lon <-> m --

EARTH_M_PER_DEG_LAT = 111320.0  # good to ~0.1% for sub-km spans near equator


def latlon_to_local_m(lat, lon, lat0, lon0):
    """Meters east/north of (lat0, lon0) on a flat-earth tangent plane."""
    m_per_deg_lon = EARTH_M_PER_DEG_LAT * math.cos(math.radians(lat0))
    return ((lon - lon0) * m_per_deg_lon,
            (lat - lat0) * EARTH_M_PER_DEG_LAT)


def local_m_to_latlon(east_m, north_m, lat0, lon0):
    m_per_deg_lon = EARTH_M_PER_DEG_LAT * math.cos(math.radians(lat0))
    return (lat0 + north_m / EARTH_M_PER_DEG_LAT,
            lon0 + east_m / m_per_deg_lon)

# -------------------------------------------------- similarity transform --

def similarity_from_two_points(src_a, src_b, dst_a, dst_b):
    """
    Solve the 2-D similarity transform T(x,y) = (a*x - b*y + tx,
                                                  b*x + a*y + ty)
    such that T(src_a) = dst_a and T(src_b) = dst_b. Returns the
    function T plus the recovered (scale, rotation_degrees).
    """
    sx, sy = src_a
    ex, ey = src_b
    ax, ay = dst_a
    bx, by = dst_b

    dsx, dsy = ex - sx, ey - sy      # src vector
    ddx, ddy = bx - ax, by - ay      # dst vector

    src_len2 = dsx * dsx + dsy * dsy
    if src_len2 == 0:
        raise ValueError("GCPs collapse to the same point in Blender.")

    # Complex division: (ddx + i ddy) / (dsx + i dsy) = a + i b
    a = (dsx * ddx + dsy * ddy) / src_len2
    b = (dsx * ddy - dsy * ddx) / src_len2

    tx = ax - (a * sx - b * sy)
    ty = ay - (b * sx + a * sy)

    scale = math.hypot(a, b)
    rot_deg = math.degrees(math.atan2(b, a))

    def apply(x, y):
        return (a * x - b * y + tx, b * x + a * y + ty)

    return apply, scale, rot_deg

# ------------------------------------------------------------------ main --

def main():
    coll = bpy.data.collections.get(COLL_NAME)
    if coll is None:
        raise RuntimeError(f"Collection {COLL_NAME!r} not found")

    empties = {o.name: o for o in coll.objects if o.type == "EMPTY"}
    if not empties:
        raise RuntimeError("No empties in the collection")

    # GCP positions in Blender (use world matrix in case of parenting)
    missing = [name for name, *_ in (GCP1, GCP2) if name not in empties]
    if missing:
        raise RuntimeError(f"GCP empty/empties not found: {missing}")

    a_loc = empties[GCP1[0]].matrix_world.translation
    b_loc = empties[GCP2[0]].matrix_world.translation

    # Anchor the flat-earth frame on GCP1
    lat0, lon0 = GCP1[1], GCP1[2]
    a_world = (0.0, 0.0)                                       # GCP1
    b_world = latlon_to_local_m(GCP2[1], GCP2[2], lat0, lon0)  # GCP2 in m

    apply, scale, rot = similarity_from_two_points(
        (a_loc.x, a_loc.y), (b_loc.x, b_loc.y),
        a_world, b_world,
    )

    # Diagnostics ---------------------------------------------------------
    d_bl = math.hypot(b_loc.x - a_loc.x, b_loc.y - a_loc.y)
    d_geo = math.hypot(b_world[0], b_world[1])
    print(f"GCP separation — Blender: {d_bl:.3f} u   Geo: {d_geo:.3f} m")
    print(f"Fitted scale: {scale:.6f}   (≈ 1 if Blender units are metres)")
    print(f"Fitted rotation: {rot:+.3f}°")

    # Transform every empty ----------------------------------------------
    features = []
    lats, lons = [], []
    for name in sorted(empties):
        o = empties[name]
        east_m, north_m = apply(o.matrix_world.translation.x,
                                o.matrix_world.translation.y)
        lat, lon = local_m_to_latlon(east_m, north_m, lat0, lon0)
        lats.append(lat); lons.append(lon)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"name": name},
        })

    fc = {"type": "FeatureCollection", "features": features}
    out_path = resolve_output_path()
    with open(out_path, "w") as f:
        json.dump(fc, f, indent=2)

    print(f"\nWrote {len(features)} points to {out_path}")
    print(f"Lat range: {min(lats):.6f} .. {max(lats):.6f}")
    print(f"Lon range: {min(lons):.6f} .. {max(lons):.6f}")

    # Residual on GCPs (should be ~0 for a 2-point fit — sanity check)
    for name, lat_exp, lon_exp in (GCP1, GCP2):
        o = empties[name]
        e, n = apply(o.matrix_world.translation.x,
                     o.matrix_world.translation.y)
        lat_got, lon_got = local_m_to_latlon(e, n, lat0, lon0)
        print(f"GCP {name}: expected ({lat_exp:.6f}, {lon_exp:.6f}) "
              f"got ({lat_got:.6f}, {lon_got:.6f})")


if __name__ == "__main__":
    main()
