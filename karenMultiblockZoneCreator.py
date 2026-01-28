import geopandas as gpd
from shapely.geometry import Polygon, LineString
from shapely.ops import substring
import os
import json
import numpy as np

# ====================== USER INPUT ======================
# Provide your block polygons here as a list
# Each item is a full GeoJSON Feature with a Polygon
block_geojsons = [
    {
        "type": "Feature",
        "properties": {"block": 1, "id": "Chepsito GH 05 - Block 1"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                # Paste coordinates for Block 1 here
               [
              35.756075108570286,
              0.0679437664293232
            ],
            [
              35.75552909793984,
              0.06724444295649334
            ],
            [
              35.755711998051936,
              0.0671045782605546
            ],
            [
              35.75624724985215,
              0.06780928114673657
            ],
            [
              35.756075108570286,
              0.0679437664293232
            ]
            ]]
        }
    },
    {
        "type": "Feature",
        "properties": {"block": 2, "id": "Chepsito GH 05 - Block 2"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                # Paste coordinates for Block 2 here
               [
              35.75625800868238,
              0.06780121203053113
            ],
            [
              35.75570392892925,
              0.0670991988491636
            ],
            [
              35.7558975878716,
              0.06694857533075549
            ],
            [
              35.75644628820962,
              0.06765058851348726
            ],
            [
              35.75625800868238,
              0.06780121203053113
            ]
            ]]
        }
    }
    # Add more blocks if needed...
]

# CONFIGURATION
num_beds_per_block = 66           # Will use this for each block
zone_length_m = 4.0
buffer_distance_m = 1.0
greenhouse_name = "Chepsito GH 05"  # Used for output filename
# =====================================================

# === YOUR ORIGINAL PROVEN FUNCTIONS ===
def generate_parallel_lines(base_line_start: np.array, base_line_end: np.array,
                            translation_start: np.array, translation_vector: np.array,
                            translation_length: float, num_lines: int) -> list:
    all_lines = []
    spacing = translation_length / (num_lines - 1) if num_lines > 1 else 0
    translation_unit_vector = translation_vector / np.linalg.norm(translation_vector)
    for i in range(num_lines):
        offset = i * spacing
        start = translation_start + translation_unit_vector * offset
        end = start + (base_line_end - base_line_start)
        line = LineString([start, end])
        all_lines.append(line)
    return all_lines

def create_offset_lines_in_buffered_polygon(polygon: Polygon, num_lines: int, 
                                           buffer_distance: float = 1.0) -> gpd.GeoDataFrame:
    buffered_polygon = polygon.buffer(-buffer_distance)
    if buffered_polygon.is_empty or buffered_polygon.geom_type != 'Polygon':
        raise ValueError(f"Buffer too large for this block.")

    min_rect = buffered_polygon.minimum_rotated_rectangle
    rect_coords = list(min_rect.exterior.coords)

    side1_len = np.linalg.norm(np.array(rect_coords[0]) - np.array(rect_coords[1]))
    side2_len = np.linalg.norm(np.array(rect_coords[1]) - np.array(rect_coords[2]))

    if side1_len <= side2_len:
        base_line_start = np.array(rect_coords[0])
        base_line_end = np.array(rect_coords[1])
        translation_start = np.array(rect_coords[0])
        translation_vector = np.array(rect_coords[3]) - np.array(rect_coords[0])
        available_length = side2_len
    else:
        base_line_start = np.array(rect_coords[1])
        base_line_end = np.array(rect_coords[2])
        translation_start = np.array(rect_coords[1])
        translation_vector = np.array(rect_coords[0]) - np.array(rect_coords[1])
        available_length = side1_len

    all_generated_lines = generate_parallel_lines(base_line_start, base_line_end,
                                                  translation_start, translation_vector,
                                                  available_length, num_lines)
    
    clipped_geometries = []
    for line in all_generated_lines:
        inter = buffered_polygon.intersection(line)
        if inter.geom_type == 'LineString':
            clipped_geometries.append(inter)
        elif inter.geom_type == 'MultiLineString':
            clipped_geometries.extend(inter.geoms)

    clipped_gdf = gpd.GeoDataFrame(geometry=clipped_geometries)
    clipped_gdf = clipped_gdf[clipped_gdf.geometry.is_valid & ~clipped_gdf.geometry.is_empty]
    clipped_gdf['line_id'] = range(1, len(clipped_gdf) + 1)
    return clipped_gdf

def create_line_zones(lines_gdf: gpd.GeoDataFrame, zone_length: float) -> gpd.GeoDataFrame:
    all_zones = []
    fid_counter = 1
    for _, row in lines_gdf.iterrows():
        line = row.geometry
        line_id = row['line_id']
        length = line.length
        pos = 0.0
        zone_id = 1
        while pos < length:
            end = min(pos + zone_length, length)
            seg = substring(line, pos, end)
            if seg.length > 0.1:
                all_zones.append({
                    'fid': fid_counter,
                    'line_id': line_id,
                    'zone_id': zone_id,
                    'geometry': seg
                })
                fid_counter += 1
            zone_id += 1
            pos = end
    return gpd.GeoDataFrame(all_zones, geometry='geometry', crs=lines_gdf.crs)

def featurecollection_from_row(row):
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "fid": int(row["fid"]),
                "line_id": int(row["line_id"]),
                "zone_id": int(row["zone_id"])
            },
            "geometry": row.geometry.__geo_interface__
        }]
    }

# ========================= MAIN =========================
try:
    all_zones = []
    fid_counter = 1
    global_line_id = 1

    print(f"Processing {len(block_geojsons)} blocks for {greenhouse_name}")

    # Determine UTM zone once (all blocks are close)
    first_coords = block_geojsons[0]["geometry"]["coordinates"][0][0]
    lon = first_coords[0]
    utm_zone = int((lon + 180) // 6) + 1
    utm_crs = f"EPSG:326{utm_zone}" if lon >= 0 else f"EPSG:327{utm_zone}"

    for idx, block_feature in enumerate(block_geojsons):
        block_poly = Polygon(block_feature["geometry"]["coordinates"][0])
        block_name = block_feature["properties"].get("id", f"Block {idx+1}")

        print(f"  → Processing {block_name} ({num_beds_per_block} beds)")

        # Project block
        block_gdf_wgs = gpd.GeoDataFrame(geometry=[block_poly], crs="EPSG:4326")
        block_proj_gdf = block_gdf_wgs.to_crs(utm_crs)
        block_proj_poly = block_proj_gdf.geometry.iloc[0]

        # Generate beds using your original function
        beds_gdf = create_offset_lines_in_buffered_polygon(
            block_proj_poly, num_beds_per_block, buffer_distance_m
        )

        if beds_gdf.empty:
            print(f"    Warning: No beds generated in {block_name}")
            continue

        # Assign continuous global line_id
        beds_gdf['line_id'] = range(global_line_id, global_line_id + len(beds_gdf))
        global_line_id += len(beds_gdf)

        # Create zones
        zones_gdf = create_line_zones(beds_gdf, zone_length_m)

        # Collect with global fid
        for _, row in zones_gdf.iterrows():
            all_zones.append({
                'fid': fid_counter,
                'line_id': row['line_id'],
                'zone_id': row['zone_id'],
                'geometry': row.geometry
            })
            fid_counter += 1

    if not all_zones:
        raise ValueError("No zones generated from any block")

    # Final GeoDataFrame and save
    final_zones_proj = gpd.GeoDataFrame(all_zones, geometry='geometry', crs=utm_crs)
    final_zones_wgs = final_zones_proj.to_crs("EPSG:4326")

    os.makedirs("output", exist_ok=True)
    output_file = f"output/{greenhouse_name.replace(' ', '_')}_line_zones.geojson"

    with open(output_file, "w") as f:
        for _, row in final_zones_wgs.iterrows():
            f.write(json.dumps(featurecollection_from_row(row)) + "\n")

    total_beds = global_line_id - 1
    print(f"\nSUCCESS!")
    print(f"   Total blocks processed: {len(block_geojsons)}")
    print(f"   Total beds (line_id 1–{total_beds}): {total_beds}")
    print(f"   Total zones: {len(final_zones_wgs)}")
    print(f"   Output file: {os.path.abspath(output_file)}")
    print(f"   → Ready to upload to Bed And Zone Automation")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()