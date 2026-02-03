import geopandas as gpd
from shapely.geometry import Polygon, LineString
from shapely.affinity import translate
from shapely.ops import substring
import os
import pyproj
import numpy as np
import json
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
import tkinter as tk
from tkinter import ttk


def get_user_inputs():
    root = tk.Tk()
    root.title("Greenhouse Bed Generator")
    root.geometry("300x280")
    root.resizable(False, False)

    values = {}

    def submit():
        values["num_lines"] = int(num_lines_var.get())
        values["zone_length"] = float(zone_length_var.get())
        values["buffer_distance"] = float(buffer_distance_var.get())
        values["bed_numbering"] = bed_numbering_var.get()
        root.destroy()

    ttk.Label(root, text="Number of Beds").pack(pady=(10, 0))
    num_lines_var = tk.StringVar(value="146")
    ttk.Entry(root, textvariable=num_lines_var).pack()

    ttk.Label(root, text="Zone Length (meters)").pack(pady=(10, 0))
    zone_length_var = tk.StringVar(value="4.0")
    ttk.Entry(root, textvariable=zone_length_var).pack()

    ttk.Label(root, text="Buffer Distance (meters)").pack(pady=(10, 0))
    buffer_distance_var = tk.StringVar(value="3.0")
    ttk.Entry(root, textvariable=buffer_distance_var).pack()

    ttk.Label(root, text="Bed Numbering Direction").pack(pady=(10, 0))
    bed_numbering_var = tk.StringVar(value=bed_numbering)
    ttk.Combobox(
        root,
        textvariable=bed_numbering_var,
        state="readonly",
        values=[
            "bottom_to_top",
            "top_to_bottom",
            "left_to_right",
            "right_to_left",
            "north",
            "south",
            "east",
            "west",
        ],
    ).pack()

    ttk.Button(root, text="Run", command=submit).pack(pady=15)

    root.mainloop()
    return values

# ==================== CONFIGURATION ====================
bed_numbering = 'right_to_left'  # Options:
# 'bottom_to_top', 'top_to_bottom', 'left_to_right', 'right_to_left'
# 'north', 'south', 'east', 'west'
# ======================================================

def generate_parallel_lines(base_line_start: np.array, base_line_end: np.array,
                            translation_start: np.array, translation_vector: np.array,
                            translation_length: float, num_lines: int) -> list:
    """Helper function to generate a set of parallel lines with a fixed count."""
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
    """
    Generates parallel bed lines aligned with the longest dimension of the polygon.
    Returns lines with temporary IDs that will be reordered later.
    """
    if not isinstance(polygon, Polygon):
        raise TypeError("Input 'polygon' must be a shapely.geometry.Polygon object.")
    if not isinstance(num_lines, int) or num_lines <= 0:
        raise ValueError("Input 'num_lines' must be a positive integer.")

    buffered_polygon = polygon.buffer(-buffer_distance)
    if buffered_polygon.is_empty or buffered_polygon.geom_type != 'Polygon':
        raise ValueError(f"Buffer of {buffer_distance}m is too large for this polygon.")

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

    lines_gdf = gpd.GeoDataFrame(geometry=all_generated_lines, crs=None)

    clipped_geometries = []
    for line in lines_gdf.geometry:
        if buffered_polygon.intersects(line):
            intersection = buffered_polygon.intersection(line)
            if intersection.geom_type == 'LineString':
                clipped_geometries.append(intersection)
            elif intersection.geom_type == 'MultiLineString':
                for segment in intersection.geoms:
                    clipped_geometries.append(segment)

    clipped_gdf = gpd.GeoDataFrame(geometry=clipped_geometries)
    clipped_gdf = clipped_gdf[clipped_gdf.geometry.is_valid & ~clipped_gdf.geometry.is_empty]

    # Temporary sequential ID (will be reordered later)
    clipped_gdf['temp_id'] = range(len(clipped_gdf))
    return clipped_gdf


def reorder_lines_by_direction(lines_gdf: gpd.GeoDataFrame, direction: str) -> gpd.GeoDataFrame:
    """
    Reorders the bed lines according to the specified numbering direction.
    Returns a new GeoDataFrame with correct sequential line_id.
    """
    if lines_gdf.empty:
        return lines_gdf

    # Use centroid Y (North-South) and X (East-West) for sorting
    centroids = lines_gdf.geometry.centroid
    lines_gdf = lines_gdf.copy()
    lines_gdf['centroid_x'] = centroids.x
    lines_gdf['centroid_y'] = centroids.y

    ascending = True  # Default sort order

    if direction == 'bottom_to_top':
        key = 'centroid_y'
        ascending = True
    elif direction == 'top_to_bottom':
        key = 'centroid_y'
        ascending = False
    elif direction == 'left_to_right':
        key = 'centroid_x'
        ascending = True
    elif direction == 'right_to_left':
        key = 'centroid_x'
        ascending = False
    elif direction == 'north':
        key = 'centroid_y'
        ascending = False  # Higher Y = more north
    elif direction == 'south':
        key = 'centroid_y'
        ascending = True   # Lower Y = more south first
    elif direction == 'east':
        key = 'centroid_x'
        ascending = False  # Higher X = more east
    elif direction == 'west':
        key = 'centroid_x'
        ascending = True   # Lower X = more west first
    else:
        raise ValueError(f"Unsupported bed_numbering direction: {direction}")

    lines_gdf = lines_gdf.sort_values(by=key, ascending=ascending).reset_index(drop=True)
    lines_gdf['line_id'] = range(1, len(lines_gdf) + 1)  # Final bed number
    lines_gdf = lines_gdf.drop(columns=['centroid_x', 'centroid_y', 'temp_id'], errors='ignore')

    return lines_gdf


def visualize_layout(polygon_gdf, beds_gdf, zones_gdf):
    """
    Visualize greenhouse polygon, beds, and zones.
    """

    fig, ax = plt.subplots(figsize=(10, 10))

    # Plot greenhouse polygon
    polygon_gdf.plot(
        ax=ax,
        facecolor="none",
        edgecolor="black",
        linewidth=2,
        label="Greenhouse"
    )

    # Plot zones (lighter, thinner)
    zones_gdf.plot(
        ax=ax,
        linewidth=1,
        alpha=0.6,
        label="Zones"
    )

    # Plot beds (thicker)
    beds_gdf.plot(
        ax=ax,
        linewidth=3,
        label="Beds"
    )

    # Label beds
    for _, row in beds_gdf.iterrows():
        centroid = row.geometry.centroid
        ax.text(
            centroid.x,
            centroid.y,
            str(row["line_id"]),
            fontsize=9,
            ha="center",
            va="center",
            bbox=dict(boxstyle="round,pad=0.2", fc="white", alpha=0.7)
        )

    ax.set_aspect("equal")
    ax.set_title("Greenhouse Bed & Zone Layout")
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.grid(True, linestyle="--", alpha=0.4)

    plt.legend()
    plt.tight_layout()
    plt.show()


def create_line_zones(lines_gdf: gpd.GeoDataFrame, zone_length: float) -> gpd.GeoDataFrame:
    all_zones = []
    fid_counter = 1

    for _, row in lines_gdf.iterrows():
        line = row.geometry
        line_id = row['line_id']
        line_length = line.length

        num_zones = int(line_length // zone_length)
        current_position = 0

        for zone_id in range(1, num_zones + 1):
            segment = substring(line, current_position, current_position + zone_length, normalized=False)
            all_zones.append({
                'fid': fid_counter,
                'line_id': line_id,
                'zone_id': zone_id,
                'geometry': segment
            })
            fid_counter += 1
            current_position += zone_length

        if current_position < line_length:
            remaining_segment = substring(line, current_position, line_length, normalized=False)
            all_zones.append({
                'fid': fid_counter,
                'line_id': line_id,
                'zone_id': num_zones + 1,
                'geometry': remaining_segment
            })
            fid_counter += 1

    return gpd.GeoDataFrame(all_zones, geometry='geometry', crs=lines_gdf.crs)


def featurecollection_from_row(row):
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "fid": int(row["fid"]),
                "line_id": int(row["line_id"]),
                "zone_id": int(row["zone_id"]),
            },
            "geometry": row.geometry.__geo_interface__
        }]
    }


if __name__ == "__main__":
    # --- Example Usage ---
    geojson_data ={
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "Main GH 17 - MFL"
      },
      "geometry": {
        "coordinates": [
          [
            [
              35.39627438780599,
              0.41863926646996674
            ],
            [
              35.39614186734798,
              0.4181059267455254
            ],
            [
              35.39788099385737,
              0.41768219975959653
            ],
            [
              35.39799878982052,
              0.4182139035023198
            ],
            [
              35.39627438780599,
              0.41863926646996674
            ]
          ]
        ],
        "type": "Polygon"
      }
    }
  ]
}

    desired_num_lines = 146
    zone_length_m = 4.0
    buffer_distance_m = 3.0
    

    print("Loading polygon from GeoJSON data...")
    try:
        main_polygon = None
        greenhouse_id_from_geojson = None

        for feature in geojson_data["features"]:
            if feature['geometry']['type'] == 'Polygon':
                main_polygon = Polygon(feature['geometry']['coordinates'][0])
                greenhouse_id_from_geojson = feature['properties'].get('id', 'unknown_id') \
                    .replace(" ", "_").replace("/", "_").strip()
                break

        if main_polygon is None:
            print("Error: No polygon found in GeoJSON.")
        else:
            print(f"Processing greenhouse: {greenhouse_id_from_geojson}")

            polygon_gdf = gpd.GeoDataFrame(geometry=[main_polygon], crs="EPSG:4326")
            original_crs = polygon_gdf.crs

            # Reproject to UTM for accurate distances
            if polygon_gdf.crs.is_geographic:
                lon = polygon_gdf.centroid.x.iloc[0]
                utm_zone = int((lon + 180) / 6) + 1
                utm_crs = f"EPSG:326{utm_zone:02d}" if polygon_gdf.centroid.y.iloc[0] >= 0 else f"EPSG:327{utm_zone:02d}"
                print(f"Reprojecting to {utm_crs}")
                projected_polygon_gdf = polygon_gdf.to_crs(utm_crs)
                projected_polygon = projected_polygon_gdf.geometry.iloc[0]
            else:
                projected_polygon = main_polygon
                projected_polygon_gdf = polygon_gdf

            # Generate raw clipped lines
            clipped_lines_gdf_projected = create_offset_lines_in_buffered_polygon(
                projected_polygon, desired_num_lines, buffer_distance_m
            )

            if clipped_lines_gdf_projected.empty:
                print("No lines generated – polygon too small or buffer too large.")
            else:
                clipped_lines_gdf_projected.crs = projected_polygon_gdf.crs

                # === NEW: Reorder beds according to desired direction ===
                clipped_lines_gdf_projected = reorder_lines_by_direction(
                    clipped_lines_gdf_projected, bed_numbering
                )
                print(f"Beds reordered using direction: {bed_numbering}")

                # Split into zones
                line_zones_gdf_projected = create_line_zones(clipped_lines_gdf_projected, zone_length_m)

                # Reproject back to WGS84
                line_zones_gdf = line_zones_gdf_projected.to_crs(original_crs)

                # Save output
                output_dir = "output"
                os.makedirs(output_dir, exist_ok=True)
                output_filepath = os.path.join(output_dir, f"{greenhouse_id_from_geojson}_line_zones.geojson")

                with open(output_filepath, "w") as f:
                    for _, row in line_zones_gdf.iterrows():
                        fc = featurecollection_from_row(row)
                        f.write(json.dumps(fc) + "\n")

                print(f"Generated {len(clipped_lines_gdf_projected)} beds ({len(line_zones_gdf)} zones total)")
                print(f"Output saved: {os.path.abspath(output_filepath)}")

               
                visualize_layout(
                     polygon_gdf,
                    clipped_lines_gdf_projected.to_crs(original_crs),
                    line_zones_gdf
                )



                

    except Exception as e:
        print(f"Error: {e}")