import geopandas as gpd
from shapely.geometry import Polygon, LineString, MultiLineString
from shapely.affinity import translate
from shapely.ops import substring, unary_union
import os
import pyproj
import numpy as np
import json
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
import tkinter as tk
from tkinter import ttk
from tkinter import filedialog, messagebox, scrolledtext


class GreenhouseBedGeneratorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Greenhouse Bed Generator - Enhanced")
        self.root.geometry("1400x900")
        
        # Data storage
        self.geojson_data = None
        self.polygon_gdf = None
        self.beds_gdf = None
        self.zones_gdf = None
        
        # Create UI
        self.create_ui()
        
    def create_ui(self):
        # Main container
        main_container = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        main_container.pack(fill=tk.BOTH, expand=True)
        
        # Left panel - Controls
        left_frame = ttk.Frame(main_container, width=400)
        main_container.add(left_frame, weight=0)
        
        # Right panel - Preview
        right_frame = ttk.Frame(main_container)
        main_container.add(right_frame, weight=1)
        
        self.create_left_panel(left_frame)
        self.create_right_panel(right_frame)
        
    def create_left_panel(self, parent):
        # Scrollable frame
        canvas = tk.Canvas(parent)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # GeoJSON Input Section
        ttk.Label(scrollable_frame, text="GeoJSON Input", font=('Arial', 12, 'bold')).pack(pady=(10, 5))
        
        self.geojson_text = scrolledtext.ScrolledText(scrollable_frame, height=10, wrap=tk.WORD)
        self.geojson_text.pack(fill="both", expand=True, padx=10, pady=5)
        
        btn_frame = ttk.Frame(scrollable_frame)
        btn_frame.pack(pady=5)
        
        ttk.Button(btn_frame, text="Load File", command=self.load_geojson_file).pack(side="left", padx=5)
        ttk.Button(btn_frame, text="Load Example 1", command=lambda: self.load_example(1)).pack(side="left", padx=5)
        ttk.Button(btn_frame, text="Load Example 2", command=lambda: self.load_example(2)).pack(side="left", padx=5)
        
        ttk.Separator(scrollable_frame, orient="horizontal").pack(fill="x", pady=10)
        
        # Parameters Section
        ttk.Label(scrollable_frame, text="Parameters", font=('Arial', 12, 'bold')).pack(pady=(5, 5))
        
        # Number of Beds
        param_frame1 = ttk.Frame(scrollable_frame)
        param_frame1.pack(fill="x", padx=10, pady=5)
        ttk.Label(param_frame1, text="Number of Beds:", width=20).pack(side="left")
        self.num_beds_var = tk.StringVar(value="146")
        ttk.Entry(param_frame1, textvariable=self.num_beds_var, width=15).pack(side="left", padx=5)
        
        # Zone Length
        param_frame2 = ttk.Frame(scrollable_frame)
        param_frame2.pack(fill="x", padx=10, pady=5)
        ttk.Label(param_frame2, text="Zone Length (m):", width=20).pack(side="left")
        self.zone_length_var = tk.StringVar(value="4.0")
        ttk.Entry(param_frame2, textvariable=self.zone_length_var, width=15).pack(side="left", padx=5)
        
        # Buffer Distance
        param_frame3 = ttk.Frame(scrollable_frame)
        param_frame3.pack(fill="x", padx=10, pady=5)
        ttk.Label(param_frame3, text="Buffer Distance (m):", width=20).pack(side="left")
        self.buffer_var = tk.StringVar(value="3.0")
        ttk.Entry(param_frame3, textvariable=self.buffer_var, width=15).pack(side="left", padx=5)
        
        # Bed Numbering Direction
        param_frame4 = ttk.Frame(scrollable_frame)
        param_frame4.pack(fill="x", padx=10, pady=5)
        ttk.Label(param_frame4, text="Bed Numbering:", width=20).pack(side="left")
        self.direction_var = tk.StringVar(value="right_to_left")
        direction_combo = ttk.Combobox(
            param_frame4,
            textvariable=self.direction_var,
            state="readonly",
            width=13,
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
        )
        direction_combo.pack(side="left", padx=5)
        
        ttk.Separator(scrollable_frame, orient="horizontal").pack(fill="x", pady=10)
        
        # Action Buttons
        ttk.Label(scrollable_frame, text="Actions", font=('Arial', 12, 'bold')).pack(pady=(5, 5))
        
        btn_action_frame = ttk.Frame(scrollable_frame)
        btn_action_frame.pack(pady=10)
        
        ttk.Button(btn_action_frame, text="Preview", command=self.preview_layout, 
                  style="Accent.TButton").pack(side="left", padx=5)
        ttk.Button(btn_action_frame, text="Generate & Save", command=self.generate_and_save).pack(side="left", padx=5)
        
        # Status Section
        ttk.Separator(scrollable_frame, orient="horizontal").pack(fill="x", pady=10)
        ttk.Label(scrollable_frame, text="Status", font=('Arial', 12, 'bold')).pack(pady=(5, 5))
        
        self.status_text = scrolledtext.ScrolledText(scrollable_frame, height=8, wrap=tk.WORD, 
                                                     state="disabled", bg="#f0f0f0")
        self.status_text.pack(fill="both", expand=True, padx=10, pady=5)
        
    def create_right_panel(self, parent):
        ttk.Label(parent, text="Live Preview", font=('Arial', 14, 'bold')).pack(pady=10)
        
        # Create matplotlib figure
        self.fig = Figure(figsize=(10, 8), dpi=100)
        self.ax = self.fig.add_subplot(111)
        
        self.canvas = FigureCanvasTkAgg(self.fig, parent)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Initial empty plot
        self.ax.text(0.5, 0.5, 'Load GeoJSON and click Preview', 
                    ha='center', va='center', fontsize=14, color='gray')
        self.ax.set_xlim(0, 1)
        self.ax.set_ylim(0, 1)
        self.ax.axis('off')
        self.canvas.draw()
        
    def log_status(self, message):
        self.status_text.config(state="normal")
        self.status_text.insert(tk.END, message + "\n")
        self.status_text.see(tk.END)
        self.status_text.config(state="disabled")
        self.root.update()
        
    def load_geojson_file(self):
        path = filedialog.askopenfilename(
            title="Select GeoJSON file",
            filetypes=[("GeoJSON files", "*.geojson *.json")]
        )
        if path:
            try:
                with open(path, "r") as f:
                    content = f.read()
                    self.geojson_text.delete("1.0", tk.END)
                    self.geojson_text.insert(tk.END, content)
                self.log_status(f"✓ Loaded file: {os.path.basename(path)}")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to load file: {str(e)}")
                
    def load_example(self, example_num):
        examples = {
            1: '{"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": "Kapkolia GH 8"}, "geometry": {"type": "Polygon", "coordinates": [[[35.7483423, 0.0680745], [35.7472962, 0.0671437], [35.7475371, 0.066873], [35.7485832, 0.0678037], [35.7483423, 0.0680745]]]}}]}',
            2: '{"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": "Kapkolia GH 18"}, "geometry": {"type": "Polygon", "coordinates": [[[35.7476211, 0.0686487], [35.7484332, 0.0682052], [35.7486109, 0.0685414], [35.7485188, 0.0685899], [35.7486008, 0.0687426], [35.7485605, 0.0687621], [35.7486369, 0.0689017], [35.7485544, 0.0689431], [35.7486364, 0.0691011], [35.7485011, 0.0691646], [35.7486711, 0.069492], [35.7482149, 0.0697103], [35.7476211, 0.0686487]]]}}]}'
        }
        
        self.geojson_text.delete("1.0", tk.END)
        self.geojson_text.insert(tk.END, examples[example_num])
        self.log_status(f"✓ Loaded Example {example_num}")
        
    def parse_geojson(self):
        try:
            geojson_raw = self.geojson_text.get("1.0", tk.END).strip()
            if not geojson_raw:
                raise ValueError("No GeoJSON data provided")
                
            self.geojson_data = json.loads(geojson_raw)
            
            # Extract polygon
            for feature in self.geojson_data["features"]:
                if feature['geometry']['type'] == 'Polygon':
                    coords = feature['geometry']['coordinates'][0]
                    polygon = Polygon(coords)
                    self.greenhouse_id = feature['properties'].get('id', 'unknown_id') \
                        .replace(" ", "_").replace("/", "_").strip()
                    
                    self.polygon_gdf = gpd.GeoDataFrame(geometry=[polygon], crs="EPSG:4326")
                    self.log_status(f"✓ Parsed polygon: {self.greenhouse_id}")
                    return True
                    
            raise ValueError("No polygon found in GeoJSON")
            
        except json.JSONDecodeError:
            messagebox.showerror("Error", "Invalid JSON format")
            return False
        except Exception as e:
            messagebox.showerror("Error", str(e))
            return False
            
    def generate_beds(self):
        try:
            num_beds = int(self.num_beds_var.get())
            buffer_dist = float(self.buffer_var.get())
            direction = self.direction_var.get()
            
            # Project to UTM
            lon = self.polygon_gdf.centroid.x.iloc[0]
            lat = self.polygon_gdf.centroid.y.iloc[0]
            utm_zone = int((lon + 180) / 6) + 1
            utm_crs = f"EPSG:326{utm_zone:02d}" if lat >= 0 else f"EPSG:327{utm_zone:02d}"
            
            self.log_status(f"Reprojecting to {utm_crs}...")
            projected_gdf = self.polygon_gdf.to_crs(utm_crs)
            projected_polygon = projected_gdf.geometry.iloc[0]
            
            # Generate beds
            self.log_status(f"Generating {num_beds} beds...")
            beds_projected = create_offset_lines_in_buffered_polygon(
                projected_polygon, num_beds, buffer_dist
            )
            
            if beds_projected.empty:
                raise ValueError("No beds generated - check buffer distance")
                
            beds_projected.crs = utm_crs
            
            # Reorder by direction
            self.log_status(f"Applying bed numbering: {direction}")
            beds_projected = reorder_lines_by_direction(beds_projected, direction)
            
            # Convert back to WGS84 for display
            self.beds_gdf = beds_projected.to_crs("EPSG:4326")
            self.beds_projected = beds_projected  # Keep projected version for zones
            
            self.log_status(f"✓ Generated {len(self.beds_gdf)} beds")
            return True
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to generate beds: {str(e)}")
            return False
            
    def generate_zones(self):
        try:
            zone_length = float(self.zone_length_var.get())
            
            self.log_status(f"Creating zones of {zone_length}m...")
            zones_projected = create_line_zones(self.beds_projected, zone_length)
            self.zones_gdf = zones_projected.to_crs("EPSG:4326")
            
            self.log_status(f"✓ Created {len(self.zones_gdf)} zones")
            return True
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to generate zones: {str(e)}")
            return False
            
    def preview_layout(self):
        if not self.parse_geojson():
            return
            
        if not self.generate_beds():
            return
            
        self.visualize()
        
    def visualize(self):
        self.ax.clear()
        
        # Plot polygon
        self.polygon_gdf.plot(
            ax=self.ax,
            facecolor="lightgray",
            edgecolor="black",
            linewidth=2,
            alpha=0.3,
            label="Greenhouse"
        )
        
        # Plot beds
        if self.beds_gdf is not None:
            self.beds_gdf.plot(
                ax=self.ax,
                linewidth=2.5,
                color='blue',
                alpha=0.7,
                label="Beds"
            )
            
            # Add bed numbers
            for _, row in self.beds_gdf.iterrows():
                centroid = row.geometry.centroid
                self.ax.text(
                    centroid.x,
                    centroid.y,
                    str(row["line_id"]),
                    fontsize=8,
                    ha="center",
                    va="center",
                    bbox=dict(boxstyle="round,pad=0.3", fc="yellow", alpha=0.8, edgecolor='black')
                )
                
            # Add direction arrow
            self.add_direction_indicator()
            
        self.ax.set_aspect("equal")
        self.ax.set_title(f"Greenhouse: {self.greenhouse_id}\nBeds: {len(self.beds_gdf) if self.beds_gdf is not None else 0}", 
                         fontsize=12, fontweight='bold')
        self.ax.set_xlabel("Longitude")
        self.ax.set_ylabel("Latitude")
        self.ax.grid(True, linestyle="--", alpha=0.3)
        self.ax.legend(loc='upper right')
        
        self.fig.tight_layout()
        self.canvas.draw()
        
    def add_direction_indicator(self):
        """Add an arrow showing the bed numbering direction"""
        if self.beds_gdf is None or len(self.beds_gdf) < 2:
            return
            
        # Get first and second bed centroids
        first_bed = self.beds_gdf.iloc[0].geometry.centroid
        second_bed = self.beds_gdf.iloc[1].geometry.centroid
        
        # Calculate arrow
        dx = second_bed.x - first_bed.x
        dy = second_bed.y - first_bed.y
        
        # Position arrow at first bed
        self.ax.annotate(
            '',
            xy=(second_bed.x, second_bed.y),
            xytext=(first_bed.x, first_bed.y),
            arrowprops=dict(
                arrowstyle='->',
                lw=3,
                color='red',
                alpha=0.7
            )
        )
        
        # Add text label
        mid_x = (first_bed.x + second_bed.x) / 2
        mid_y = (first_bed.y + second_bed.y) / 2
        self.ax.text(
            mid_x, mid_y,
            f"1→2",
            fontsize=10,
            color='red',
            fontweight='bold',
            bbox=dict(boxstyle="round,pad=0.3", fc="white", alpha=0.8, edgecolor='red')
        )
        
    def generate_and_save(self):
        if not self.parse_geojson():
            return
            
        if not self.generate_beds():
            return
            
        if not self.generate_zones():
            return
            
        # Save to file
        try:
            output_dir = "output"
            os.makedirs(output_dir, exist_ok=True)
            output_filepath = os.path.join(
                output_dir, f"{self.greenhouse_id}_line_zones.geojson"
            )
            
            with open(output_filepath, "w") as f:
                for _, row in self.zones_gdf.iterrows():
                    fc = {
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
                    f.write(json.dumps(fc) + "\n")
                    
            self.log_status(f"✓ SAVED: {os.path.abspath(output_filepath)}")
            messagebox.showinfo("Success", f"File saved:\n{output_filepath}")
            
            # Update visualization to show zones
            self.visualize_with_zones()
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save: {str(e)}")
            
    def visualize_with_zones(self):
        self.ax.clear()
        
        # Plot polygon
        self.polygon_gdf.plot(
            ax=self.ax,
            facecolor="none",
            edgecolor="black",
            linewidth=2,
            label="Greenhouse"
        )
        
        # Plot zones (lighter)
        if self.zones_gdf is not None:
            self.zones_gdf.plot(
                ax=self.ax,
                linewidth=1,
                alpha=0.4,
                color='green',
                label="Zones"
            )
        
        # Plot beds (thicker)
        if self.beds_gdf is not None:
            self.beds_gdf.plot(
                ax=self.ax,
                linewidth=3,
                color='blue',
                label="Beds"
            )
            
            # Add bed numbers
            for _, row in self.beds_gdf.iterrows():
                centroid = row.geometry.centroid
                self.ax.text(
                    centroid.x,
                    centroid.y,
                    str(row["line_id"]),
                    fontsize=7,
                    ha="center",
                    va="center",
                    bbox=dict(boxstyle="round,pad=0.2", fc="white", alpha=0.7)
                )
                
        self.ax.set_aspect("equal")
        self.ax.set_title(f"Final Layout: {self.greenhouse_id}\nBeds: {len(self.beds_gdf)}, Zones: {len(self.zones_gdf)}", 
                         fontsize=12, fontweight='bold')
        self.ax.set_xlabel("Longitude")
        self.ax.set_ylabel("Latitude")
        self.ax.grid(True, linestyle="--", alpha=0.3)
        self.ax.legend()
        
        self.fig.tight_layout()
        self.canvas.draw()


def generate_parallel_lines(base_line_start: np.array, base_line_end: np.array,
                            translation_start: np.array, translation_vector: np.array,
                            translation_length: float, num_lines: int) -> list:
    """Generate parallel lines with fixed count."""
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
    Handles complex polygons including terraced shapes.
    """
    if not isinstance(polygon, Polygon):
        raise TypeError("Input 'polygon' must be a shapely.geometry.Polygon object.")
    if not isinstance(num_lines, int) or num_lines <= 0:
        raise ValueError("Input 'num_lines' must be a positive integer.")

    # Buffer inward
    buffered_polygon = polygon.buffer(-buffer_distance)
    
    # Handle MultiPolygon result (complex shapes may split)
    if buffered_polygon.is_empty:
        raise ValueError(f"Buffer of {buffer_distance}m is too large for this polygon.")
    
    # If buffer creates multiple polygons, use the largest one
    if buffered_polygon.geom_type == 'MultiPolygon':
        buffered_polygon = max(buffered_polygon.geoms, key=lambda p: p.area)
    
    if buffered_polygon.geom_type != 'Polygon':
        raise ValueError(f"Buffering resulted in unexpected geometry type: {buffered_polygon.geom_type}")

    # Get minimum rotated rectangle
    min_rect = buffered_polygon.minimum_rotated_rectangle
    rect_coords = list(min_rect.exterior.coords)

    # Determine longest side
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

    # Generate parallel lines
    all_generated_lines = generate_parallel_lines(
        base_line_start, base_line_end,
        translation_start, translation_vector,
        available_length, num_lines
    )

    # Clip to buffered polygon
    clipped_geometries = []
    for line in all_generated_lines:
        if buffered_polygon.intersects(line):
            intersection = buffered_polygon.intersection(line)
            if intersection.geom_type == 'LineString':
                clipped_geometries.append(intersection)
            elif intersection.geom_type == 'MultiLineString':
                # For complex polygons, take the longest segment
                longest = max(intersection.geoms, key=lambda l: l.length)
                clipped_geometries.append(longest)

    clipped_gdf = gpd.GeoDataFrame(geometry=clipped_geometries)
    clipped_gdf = clipped_gdf[clipped_gdf.geometry.is_valid & ~clipped_gdf.geometry.is_empty]

    clipped_gdf['temp_id'] = range(len(clipped_gdf))
    return clipped_gdf


def reorder_lines_by_direction(lines_gdf: gpd.GeoDataFrame, direction: str) -> gpd.GeoDataFrame:
    """Reorder bed lines according to numbering direction."""
    if lines_gdf.empty:
        return lines_gdf

    centroids = lines_gdf.geometry.centroid
    lines_gdf = lines_gdf.copy()
    lines_gdf['centroid_x'] = centroids.x
    lines_gdf['centroid_y'] = centroids.y

    direction_map = {
        'bottom_to_top': ('centroid_y', True),
        'top_to_bottom': ('centroid_y', False),
        'left_to_right': ('centroid_x', True),
        'right_to_left': ('centroid_x', False),
        'north': ('centroid_y', False),
        'south': ('centroid_y', True),
        'east': ('centroid_x', False),
        'west': ('centroid_x', True),
    }

    if direction not in direction_map:
        raise ValueError(f"Unsupported bed_numbering direction: {direction}")

    key, ascending = direction_map[direction]
    lines_gdf = lines_gdf.sort_values(by=key, ascending=ascending).reset_index(drop=True)
    lines_gdf['line_id'] = range(1, len(lines_gdf) + 1)
    lines_gdf = lines_gdf.drop(columns=['centroid_x', 'centroid_y', 'temp_id'], errors='ignore')

    return lines_gdf


def create_line_zones(lines_gdf: gpd.GeoDataFrame, zone_length: float) -> gpd.GeoDataFrame:
    """Split bed lines into zones."""
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

        # Handle remaining segment
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


if __name__ == "__main__":
    root = tk.Tk()
    app = GreenhouseBedGeneratorApp(root)
    root.mainloop()