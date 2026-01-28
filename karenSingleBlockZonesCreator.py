import geopandas as gpd
from shapely.geometry import Polygon, LineString, MultiLineString
from shapely.affinity import translate
from shapely.ops import substring
import os
import pyproj
import numpy as np
import json 

def generate_parallel_lines(base_line_start: np.array, base_line_end: np.array,
                            translation_start: np.array, translation_vector: np.array,
                            translation_length: float, num_lines: int) -> list:
    """Helper function to generate a set of parallel lines with a fixed count."""
    
    all_lines = []
    
    # Calculate the spacing based on the desired number of lines
    spacing = translation_length / (num_lines - 1) if num_lines > 1 else 0
    
    # Generate the parallel lines by creating them at specific offsets
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
    Generates a set of offset lines by a fixed count, aligned with the shortest dimension
    of the input polygon. The lines are clipped to an inward buffer.

    Args:
        polygon (Polygon): The input polygon to use as a boundary. This polygon
                            is expected to be in a projected CRS with units in meters.
        num_lines (int): The desired number of lines/beds to generate.
        buffer_distance (float): Distance in meters to buffer inward from polygon edge (default 1.0).

    Returns:
        gpd.GeoDataFrame: A GeoDataFrame containing the clipped line segments
                          in the same projected CRS as the input polygon.
    """
    if not isinstance(polygon, Polygon):
        raise TypeError("Input 'polygon' must be a shapely.geometry.Polygon object.")
    if not isinstance(num_lines, int) or num_lines <= 0:
        raise ValueError("Input 'num_lines' must be a positive integer.")

    # Create the buffered polygon first
    buffered_polygon = polygon.buffer(-buffer_distance)
    
    if buffered_polygon.is_empty or buffered_polygon.geom_type != 'Polygon':
        raise ValueError(f"Buffer of {buffer_distance}m is too large for this polygon.")
    
    # Get the minimum rotated rectangle of the BUFFERED polygon to determine alignment
    min_rect = buffered_polygon.minimum_rotated_rectangle
    rect_coords = list(min_rect.exterior.coords)

    # Get the lengths of the sides of the minimum rotated rectangle
    side1_len = np.linalg.norm(np.array(rect_coords[0]) - np.array(rect_coords[1]))
    side2_len = np.linalg.norm(np.array(rect_coords[1]) - np.array(rect_coords[2]))

    # Determine which side is shorter - beds run perpendicular to this
    # Use the longer side as the available length for spacing the beds
    if side1_len <= side2_len:
        # side1 is shorter, so beds run along side2 direction
        base_line_start = np.array(rect_coords[0])
        base_line_end = np.array(rect_coords[1])
        translation_start = np.array(rect_coords[0])
        translation_vector = np.array(rect_coords[3]) - np.array(rect_coords[0])
        available_length = side2_len  # Use the longer side for bed spacing
    else:
        # side2 is shorter, so beds run along side1 direction
        base_line_start = np.array(rect_coords[1])
        base_line_end = np.array(rect_coords[2])
        translation_start = np.array(rect_coords[1])
        translation_vector = np.array(rect_coords[0]) - np.array(rect_coords[1])
        available_length = side1_len  # Use the longer side for bed spacing

    # Generate the parallel lines using the calculated available length from the polygon
    all_generated_lines = generate_parallel_lines(base_line_start, base_line_end,
                                                  translation_start, translation_vector,
                                                  available_length, num_lines)
    
    # Create a GeoDataFrame from the generated lines
    lines_gdf = gpd.GeoDataFrame(geometry=all_generated_lines)

    # Perform the intersection to clip the lines to the buffered polygon
    clipped_geometries = []
    for line in lines_gdf.geometry:
        if buffered_polygon.intersects(line):
            intersection = buffered_polygon.intersection(line)
            if intersection.geom_type in ['LineString']:
                clipped_geometries.append(intersection)
            elif intersection.geom_type in ['MultiLineString']:
                for segment in intersection.geoms:
                    clipped_geometries.append(segment)

    clipped_gdf = gpd.GeoDataFrame(geometry=clipped_geometries)
    clipped_gdf = clipped_gdf[clipped_gdf.geometry.is_valid & ~clipped_gdf.geometry.is_empty]
    
    # Add a unique ID for each full clipped line
    clipped_gdf['line_id'] = range(1, len(clipped_gdf) + 1)
    
    return clipped_gdf

def create_line_zones(lines_gdf: gpd.GeoDataFrame, zone_length: float) -> gpd.GeoDataFrame:
    """
    Splits a GeoDataFrame of LineStrings into smaller segments of a specified length.
    
    Args:
        lines_gdf (gpd.GeoDataFrame): A GeoDataFrame containing LineString geometries.
        zone_length (float): The desired length of each zone in meters.
        
    Returns:
        gpd.GeoDataFrame: A new GeoDataFrame with the split line segments,
                          each with a unique `zone_id` and `line_id`.
    """
    all_zones = []
    fid_counter = 1
    
    for index, row in lines_gdf.iterrows():
        line = row.geometry
        line_id = row['line_id']
        line_length = line.length
        
        # Calculate the number of full zones and the remaining length
        num_zones = int(line_length // zone_length)
        
        # Split the line into zones
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
            
        # Add the last remaining segment as its own zone if it exists
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
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "fid": int(row["fid"]),
                    "line_id": int(row["line_id"]),
                    "zone_id": int(row["zone_id"]),
                },
                "geometry": row.geometry.__geo_interface__
            }
        ]
    }


if __name__ == "__main__":
    # --- Example Usage with GeoJSON input ---
    # The script will now process the FIRST polygon it finds in this data
    geojson_data = {
        "type": "FeatureCollection",
        "features": [
            {
            "type": "Feature",
            "properties": {
                "id": "Main GH 05 - MFL"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                [
                    [35.4019268, 0.4178427],
                    [35.4017948, 0.4173122],
                    [35.4035295, 0.4168913],
                    [35.4036483, 0.4174147],
                    [35.4019268, 0.4178427]
                ]
                ]
            }
            }
        ]
    }
    desired_num_lines = 146
    zone_length_m = 4.0
    buffer_distance_m = 3.0  # Distance to buffer inward from polygon edge

    print("Loading polygon from GeoJSON data...")
    try:
        main_polygon = None
        greenhouse_id_from_geojson = None
        
        # Find the first polygon in the GeoJSON data to process
        for feature in geojson_data["features"]:
            if feature['geometry']['type'] == 'Polygon':
                main_polygon = Polygon(feature['geometry']['coordinates'][0])
                greenhouse_id_from_geojson = feature['properties'].get('id', 'unknown_id').replace(" ", "_").replace("/", "_").strip()
                break

        if main_polygon is None:
            print(f"Error: No polygon was found in the GeoJSON data.")
        else:
            print(f"Processing greenhouse with ID: {greenhouse_id_from_geojson}")
            
            # 1. Create a GeoDataFrame from the selected polygon
            polygon_gdf = gpd.GeoDataFrame(geometry=[main_polygon], crs="EPSG:4326")
            original_crs = polygon_gdf.crs
            
            # Project to a suitable UTM CRS for accurate calculation
            if polygon_gdf.crs.is_geographic:
                lon = (polygon_gdf.bounds.minx.iloc[0] + polygon_gdf.bounds.maxx.iloc[0]) / 2
                utm_crs_code = f"EPSG:{32600 + int((lon + 180) / 6) + 1}"
                
                print(f"Original CRS is geographic. Re-projecting to {utm_crs_code} for calculation.")
                projected_polygon_gdf = polygon_gdf.to_crs(utm_crs_code)
                projected_polygon = projected_polygon_gdf.geometry.iloc[0]
            else:
                projected_polygon = main_polygon
                projected_polygon_gdf = polygon_gdf
                print(f"Original CRS is projected ({original_crs}). Using it directly for calculation.")
            
            # 2. Call the function to create the clipped lines, passing the number of lines and buffer distance
            clipped_lines_gdf_projected = create_offset_lines_in_buffered_polygon(
                projected_polygon, desired_num_lines, buffer_distance_m
            )

            # 3. Split the clipped lines into zones
            if not clipped_lines_gdf_projected.empty:
                clipped_lines_gdf_projected.crs = projected_polygon_gdf.crs
                line_zones_gdf_projected = create_line_zones(clipped_lines_gdf_projected, zone_length_m)
                
                # 4. Re-project the resulting zones back to the original CRS
                line_zones_gdf = line_zones_gdf_projected.to_crs(original_crs)
            else:
                line_zones_gdf = gpd.GeoDataFrame(geometry=[], crs=original_crs)

            # 5. Create the output directory and define the filepath
            output_dir = "output"
            if not os.path.exists(output_dir):
                os.makedirs(output_dir)
                print(f"Created output directory: {os.path.abspath(output_dir)}")

            output_filepath = os.path.join(output_dir, f"{greenhouse_id_from_geojson}_line_zones.geojson")

            # 6. Save the resulting GeoDataFrame to a new GeoJSON file
            with open(output_filepath, "w") as f:
                for _, row in line_zones_gdf.iterrows():
                    fc = featurecollection_from_row(row)
                    f.write(json.dumps(fc) + "\n")
            
            if not line_zones_gdf.empty:
                print(f"Successfully created {len(clipped_lines_gdf_projected)} beds with {len(line_zones_gdf)} total zones.")
                print(f"Output saved to: {os.path.abspath(output_filepath)}")
            else:
                print(f"No zones were generated. The polygon may be too small or the lines are too short.")

    except Exception as e:
        print(f"An error occurred: {e}")