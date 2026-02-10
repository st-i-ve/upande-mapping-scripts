import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import json
import numpy as np
import geopandas as gpd
from shapely.geometry import Polygon, LineString
from shapely.ops import substring
import os

class GreenhouseSegmentBedGenerator:
    def __init__(self, root):
        self.root = root
        self.root.title("Greenhouse Segment Bed Generator")
        self.root.geometry("1400x900")
        
        # Initial data
        self.coords = []
        self.polygon_name = ""
        self.edge_labels = {}
        
        # Segment data
        self.segments = []
        self.num_segments = 2
        
        # Bed generation parameters
        self.total_beds = 144
        self.zone_length_m = 4.0
        self.buffer_distance_m = 3.0
        self.bed_direction = "left_to_right"  # or "right_to_left", "bottom_to_top", "top_to_bottom"
        self.starting_segment = 1  # 1 or last segment
        
        # Results
        self.bed_lines_gdf = None
        self.zones_gdf = None
        
        # Create UI
        self.create_widgets()
        self.draw_polygon()
        
        # Pre-fill with example data
        example_geojson = '''{ "type": "FeatureCollection", "features": [{ "type": "Feature", "properties": {"id": "Kaptumbo GH 03 - KR"}, "geometry": { "coordinates": [[[35.7486266142804,0.09298520732512827],[35.74880627366329,0.09244952638019299],[35.749824892916195,0.09278247269176632],[35.749645233533215,0.09332145012884041],[35.7486266142804,0.09298520732512827]]], "type": "Polygon" } }] }'''
        self.geojson_text.insert('1.0', example_geojson)
    
    def create_widgets(self):
        # Main container with two panels
        main_paned = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        main_paned.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Left panel for input and controls
        left_frame = ttk.Frame(main_paned, width=400)
        main_paned.add(left_frame, weight=0)
        
        # Right panel for canvas
        right_frame = ttk.Frame(main_paned)
        main_paned.add(right_frame, weight=1)
        
        # === LEFT PANEL ===
        
        # Title
        title_label = ttk.Label(left_frame, text="🌿 Greenhouse Bed Generator", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=10)
        
        # GeoJSON input section
        input_label = ttk.Label(left_frame, text="📄 Paste GeoJSON Here:", 
                               font=('Arial', 12, 'bold'))
        input_label.pack(pady=(10, 5))
        
        # Scrolled text widget for GeoJSON input
        self.geojson_text = scrolledtext.ScrolledText(left_frame, 
                                                      width=45, 
                                                      height=8,
                                                      wrap=tk.WORD,
                                                      font=('Courier', 9))
        self.geojson_text.pack(pady=5, padx=10)
        
        # Load button
        load_btn = tk.Button(left_frame, text="🔄 Load GeoJSON",
                           command=self.load_geojson,
                           bg='#9C27B0', fg='white', 
                           font=('Arial', 11, 'bold'),
                           cursor='hand2',
                           pady=10)
        load_btn.pack(pady=10, padx=10, fill=tk.X)
        
        # Status label
        self.status_label = ttk.Label(left_frame, text="Ready - Load GeoJSON to start", 
                                     font=('Arial', 10),
                                     foreground='blue')
        self.status_label.pack(pady=5)
        
        # Separator
        ttk.Separator(left_frame, orient='horizontal').pack(fill='x', pady=10)
        
        # === CONFIGURATION SECTION ===
        config_label = ttk.Label(left_frame, text="⚙️ Bed Configuration", 
                                font=('Arial', 12, 'bold'))
        config_label.pack(pady=(5, 10))
        
        # Total number of beds
        beds_frame = ttk.Frame(left_frame)
        beds_frame.pack(pady=5, padx=10, fill=tk.X)
        ttk.Label(beds_frame, text="Total Beds:", font=('Arial', 10)).pack(side=tk.LEFT, padx=(0, 10))
        self.total_beds_var = tk.IntVar(value=144)
        ttk.Spinbox(beds_frame, from_=1, to=1000, textvariable=self.total_beds_var, width=10).pack(side=tk.LEFT)
        
        # Number of segments
        segments_frame = ttk.Frame(left_frame)
        segments_frame.pack(pady=5, padx=10, fill=tk.X)
        ttk.Label(segments_frame, text="Number of Segments:", font=('Arial', 10)).pack(side=tk.LEFT, padx=(0, 10))
        self.num_segments_var = tk.IntVar(value=2)
        ttk.Spinbox(segments_frame, from_=2, to=10, textvariable=self.num_segments_var, width=10).pack(side=tk.LEFT)
        
        # Zone length
        zone_frame = ttk.Frame(left_frame)
        zone_frame.pack(pady=5, padx=10, fill=tk.X)
        ttk.Label(zone_frame, text="Zone Length (m):", font=('Arial', 10)).pack(side=tk.LEFT, padx=(0, 10))
        self.zone_length_var = tk.DoubleVar(value=4.0)
        ttk.Entry(zone_frame, textvariable=self.zone_length_var, width=10).pack(side=tk.LEFT)
        
        # Buffer distance
        buffer_frame = ttk.Frame(left_frame)
        buffer_frame.pack(pady=5, padx=10, fill=tk.X)
        ttk.Label(buffer_frame, text="Buffer Distance (m):", font=('Arial', 10)).pack(side=tk.LEFT, padx=(0, 10))
        self.buffer_var = tk.DoubleVar(value=3.0)
        ttk.Entry(buffer_frame, textvariable=self.buffer_var, width=10).pack(side=tk.LEFT)
        
        # Bed direction
        direction_frame = ttk.Frame(left_frame)
        direction_frame.pack(pady=5, padx=10, fill=tk.X)
        ttk.Label(direction_frame, text="Bed Direction:", font=('Arial', 10)).pack(side=tk.LEFT, padx=(0, 10))
        self.direction_var = tk.StringVar(value="left_to_right")
        direction_combo = ttk.Combobox(direction_frame, textvariable=self.direction_var,
                                      state='readonly', width=15,
                                      values=["left_to_right", "right_to_left", 
                                             "bottom_to_top", "top_to_bottom"])
        direction_combo.pack(side=tk.LEFT)
        
        # Starting segment
        start_seg_frame = ttk.Frame(left_frame)
        start_seg_frame.pack(pady=5, padx=10, fill=tk.X)
        ttk.Label(start_seg_frame, text="Starting Segment:", font=('Arial', 10)).pack(side=tk.LEFT, padx=(0, 10))
        self.start_segment_var = tk.StringVar(value="First (1)")
        start_combo = ttk.Combobox(start_seg_frame, textvariable=self.start_segment_var,
                                   state='readonly', width=15,
                                   values=["First (1)", "Last"])
        start_combo.pack(side=tk.LEFT)
        
        # Separator
        ttk.Separator(left_frame, orient='horizontal').pack(fill='x', pady=10)
        
        # Process button
        self.process_btn = tk.Button(left_frame, 
                                     text="🚀 Generate Beds & Zones",
                                     command=self.process_beds,
                                     bg='#4CAF50', fg='white', 
                                     font=('Arial', 12, 'bold'),
                                     cursor='hand2',
                                     state='disabled',
                                     pady=15)
        self.process_btn.pack(pady=10, padx=10, fill=tk.X)
        
        # Export button
        self.export_btn = tk.Button(left_frame, 
                                   text="💾 Export to GeoJSON",
                                   command=self.export_geojson,
                                   bg='#2196F3', fg='white', 
                                   font=('Arial', 12, 'bold'),
                                   cursor='hand2',
                                   state='disabled',
                                   pady=15)
        self.export_btn.pack(pady=5, padx=10, fill=tk.X)
        
        # Separator
        ttk.Separator(left_frame, orient='horizontal').pack(fill='x', pady=10)
        
        # Info section
        info_label = ttk.Label(left_frame, text="📊 Information:", 
                              font=('Arial', 12, 'bold'))
        info_label.pack(pady=(5, 5))
        
        self.info_text = tk.Text(left_frame, 
                                width=45, 
                                height=10,
                                wrap=tk.WORD,
                                font=('Arial', 9),
                                bg='#f9f9f9',
                                relief=tk.FLAT,
                                state='disabled')
        self.info_text.pack(pady=5, padx=10, fill=tk.BOTH, expand=True)
        
        # === RIGHT PANEL ===
        
        # Create matplotlib figure
        self.fig, self.ax = plt.subplots(figsize=(10, 9))
        self.canvas = FigureCanvasTkAgg(self.fig, master=right_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
    
    def load_geojson(self):
        """Load and process GeoJSON from text input"""
        try:
            geojson_str = self.geojson_text.get('1.0', tk.END).strip()
            
            if not geojson_str:
                messagebox.showwarning("Empty Input", "Please paste GeoJSON data first!")
                return
            
            geojson = json.loads(geojson_str)
            
            if geojson.get('type') != 'FeatureCollection':
                raise ValueError("Invalid GeoJSON: Must be a FeatureCollection")
            
            if not geojson.get('features') or len(geojson['features']) == 0:
                raise ValueError("No features found in GeoJSON")
            
            feature = geojson['features'][0]
            
            if feature.get('geometry', {}).get('type') != 'Polygon':
                raise ValueError("First feature must be a Polygon")
            
            self.coords = feature['geometry']['coordinates'][0]
            self.polygon_name = feature.get('properties', {}).get('id') or \
                               feature.get('properties', {}).get('name') or \
                               'Unnamed Polygon'
            
            if len(self.coords) < 4:
                raise ValueError("Polygon must have at least 3 vertices")
            
            # Calculate edge labels
            self.calculate_edge_labels()
            
            # Enable process button
            self.process_btn.config(state='normal')
            
            # Clear previous results
            self.bed_lines_gdf = None
            self.zones_gdf = None
            self.segments = []
            
            # Update info
            self.update_info()
            
            # Draw polygon
            self.draw_polygon()
            
            self.status_label.config(text=f"✅ Successfully loaded: {self.polygon_name}", 
                                    foreground='green')
            
        except json.JSONDecodeError as e:
            messagebox.showerror("JSON Error", f"Invalid JSON format:\n{str(e)}")
            self.status_label.config(text="❌ Error: Invalid JSON", foreground='red')
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load GeoJSON:\n{str(e)}")
            self.status_label.config(text=f"❌ Error: {str(e)}", foreground='red')
    
    def calculate_edge_labels(self):
        """Calculate edge labels based on position"""
        self.edge_labels = {}
        
        for i in range(len(self.coords) - 1):
            label = self.get_edge_label(self.coords[i], self.coords[i + 1])
            self.edge_labels[i] = label
    
    def get_edge_label(self, p1, p2):
        """Determine edge position label"""
        x1, y1 = p1
        x2, y2 = p2
        
        mid_x = (x1 + x2) / 2
        mid_y = (y1 + y2) / 2
        
        all_x = [c[0] for c in self.coords[:-1]]
        all_y = [c[1] for c in self.coords[:-1]]
        
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        
        x_range = max_x - min_x
        y_range = max_y - min_y
        
        x_rel = (mid_x - min_x) / x_range if x_range > 0 else 0.5
        y_rel = (mid_y - min_y) / y_range if y_range > 0 else 0.5
        
        dx = x2 - x1
        dy = y2 - y1
        
        is_horizontal = abs(dx) > abs(dy)
        
        if is_horizontal:
            return "Top" if y_rel > 0.5 else "Bottom"
        else:
            return "Right" if x_rel > 0.5 else "Left"
    
    def create_segments(self):
        """Create segments based on bed direction"""
        direction = self.direction_var.get()
        num_segments = self.num_segments_var.get()
        
        # Determine slicing mode from direction
        if direction in ["left_to_right", "right_to_left"]:
            return self.create_side_to_side_segments(num_segments)
        else:  # bottom_to_top or top_to_bottom
            return self.create_polar_segments(num_segments)
    
    def create_polar_segments(self, num_segments):
        """Create horizontal segments (for bottom_to_top or top_to_bottom)"""
        segments = []
        
        # Find Top and Bottom edges
        top_edge_idx = None
        bottom_edge_idx = None
        left_edge_idx = None
        right_edge_idx = None
        
        for i, label in self.edge_labels.items():
            if label == 'Top':
                top_edge_idx = i
            elif label == 'Bottom':
                bottom_edge_idx = i
            elif label == 'Left':
                left_edge_idx = i
            elif label == 'Right':
                right_edge_idx = i
        
        if top_edge_idx is None or bottom_edge_idx is None:
            raise ValueError("Could not find Top and Bottom edges!")
        
        # Get edge coordinates
        top_p1 = self.coords[top_edge_idx]
        top_p2 = self.coords[top_edge_idx + 1]
        bottom_p1 = self.coords[bottom_edge_idx]
        bottom_p2 = self.coords[bottom_edge_idx + 1]
        left_p1 = self.coords[left_edge_idx]
        left_p2 = self.coords[left_edge_idx + 1]
        right_p1 = self.coords[right_edge_idx]
        right_p2 = self.coords[right_edge_idx + 1]
        
        # Order edges
        if top_p1[0] > top_p2[0]:
            top_p1, top_p2 = top_p2, top_p1
        if bottom_p1[0] > bottom_p2[0]:
            bottom_p1, bottom_p2 = bottom_p2, bottom_p1
        if left_p1[1] > left_p2[1]:
            left_p1, left_p2 = left_p2, left_p1
        if right_p1[1] > right_p2[1]:
            right_p1, right_p2 = right_p2, right_p1
        
        # Create intermediate vertices
        boundaries = []
        boundaries.append(('bottom', bottom_p1, bottom_p2))
        
        for i in range(1, num_segments):
            t = i / num_segments
            left_vertex = [
                left_p1[0] + t * (left_p2[0] - left_p1[0]),
                left_p1[1] + t * (left_p2[1] - left_p1[1])
            ]
            right_vertex = [
                right_p1[0] + t * (right_p2[0] - right_p1[0]),
                right_p1[1] + t * (right_p2[1] - right_p1[1])
            ]
            boundaries.append((f'V{i}', left_vertex, right_vertex))
        
        boundaries.append(('top', top_p1, top_p2))
        
        # Create segments
        for i in range(len(boundaries) - 1):
            bottom_name, bottom_left, bottom_right = boundaries[i]
            top_name, top_left, top_right = boundaries[i + 1]
            
            segment_coords = [
                bottom_left,
                bottom_right,
                top_right,
                top_left,
                bottom_left
            ]
            
            segment = {
                'type': 'polar',
                'number': i + 1,
                'coordinates': segment_coords
            }
            segments.append(segment)
        
        return segments
    
    def create_side_to_side_segments(self, num_segments):
        """Create vertical segments (for left_to_right or right_to_left)"""
        segments = []
        
        # Find edges
        top_edge_idx = None
        bottom_edge_idx = None
        left_edge_idx = None
        right_edge_idx = None
        
        for i, label in self.edge_labels.items():
            if label == 'Top':
                top_edge_idx = i
            elif label == 'Bottom':
                bottom_edge_idx = i
            elif label == 'Left':
                left_edge_idx = i
            elif label == 'Right':
                right_edge_idx = i
        
        if left_edge_idx is None or right_edge_idx is None:
            raise ValueError("Could not find Left and Right edges!")
        
        # Get edge coordinates
        top_p1 = self.coords[top_edge_idx]
        top_p2 = self.coords[top_edge_idx + 1]
        bottom_p1 = self.coords[bottom_edge_idx]
        bottom_p2 = self.coords[bottom_edge_idx + 1]
        left_p1 = self.coords[left_edge_idx]
        left_p2 = self.coords[left_edge_idx + 1]
        right_p1 = self.coords[right_edge_idx]
        right_p2 = self.coords[right_edge_idx + 1]
        
        # Order edges
        if top_p1[0] > top_p2[0]:
            top_p1, top_p2 = top_p2, top_p1
        if bottom_p1[0] > bottom_p2[0]:
            bottom_p1, bottom_p2 = bottom_p2, bottom_p1
        if left_p1[1] > left_p2[1]:
            left_p1, left_p2 = left_p2, left_p1
        if right_p1[1] > right_p2[1]:
            right_p1, right_p2 = right_p2, right_p1
        
        # Create intermediate vertices
        boundaries = []
        boundaries.append(('left', left_p2, left_p1))  # top to bottom
        
        for i in range(1, num_segments):
            t = i / num_segments
            top_vertex = [
                top_p1[0] + t * (top_p2[0] - top_p1[0]),
                top_p1[1] + t * (top_p2[1] - top_p1[1])
            ]
            bottom_vertex = [
                bottom_p1[0] + t * (bottom_p2[0] - bottom_p1[0]),
                bottom_p1[1] + t * (bottom_p2[1] - bottom_p1[1])
            ]
            boundaries.append((f'V{i}', top_vertex, bottom_vertex))
        
        boundaries.append(('right', right_p2, right_p1))  # top to bottom
        
        # Create segments
        for i in range(len(boundaries) - 1):
            left_name, left_top, left_bottom = boundaries[i]
            right_name, right_top, right_bottom = boundaries[i + 1]
            
            segment_coords = [
                left_top,
                right_top,
                right_bottom,
                left_bottom,
                left_top
            ]
            
            segment = {
                'type': 'side_to_side',
                'number': i + 1,
                'coordinates': segment_coords
            }
            segments.append(segment)
        
        return segments
    
    def process_beds(self):
        """Main processing function - generates beds with winding pattern"""
        try:
            # Get parameters
            total_beds = self.total_beds_var.get()
            num_segments = self.num_segments_var.get()
            zone_length = self.zone_length_var.get()
            buffer_dist = self.buffer_var.get()
            direction = self.direction_var.get()
            start_segment_str = self.start_segment_var.get()
            
            # Validate beds divisible by segments
            if total_beds % num_segments != 0:
                messagebox.showwarning("Invalid Configuration", 
                                      f"Total beds ({total_beds}) must be divisible by number of segments ({num_segments})")
                return
            
            beds_per_segment = total_beds // num_segments
            
            # Create segments
            self.segments = self.create_segments()
            
            # Determine starting segment
            if "First" in start_segment_str:
                segment_order = list(range(len(self.segments)))
            else:  # Last
                segment_order = list(range(len(self.segments) - 1, -1, -1))
            
            # Create polygon from coordinates
            main_polygon = Polygon(self.coords)
            polygon_gdf = gpd.GeoDataFrame(geometry=[main_polygon], crs="EPSG:4326")
            original_crs = polygon_gdf.crs
            
            # Reproject to UTM for accurate distances
            lon = polygon_gdf.centroid.x.iloc[0]
            utm_zone = int((lon + 180) / 6) + 1
            utm_crs = f"EPSG:326{utm_zone:02d}" if polygon_gdf.centroid.y.iloc[0] >= 0 else f"EPSG:327{utm_zone:02d}"
            projected_polygon_gdf = polygon_gdf.to_crs(utm_crs)
            
            # Generate beds for each segment with winding pattern
            all_beds = []
            bed_counter = 1
            
            for seg_idx, orig_seg_num in enumerate(segment_order):
                segment = self.segments[orig_seg_num]
                segment_polygon = Polygon(segment['coordinates'])
                segment_gdf = gpd.GeoDataFrame(geometry=[segment_polygon], crs=original_crs)
                projected_segment_gdf = segment_gdf.to_crs(utm_crs)
                projected_segment = projected_segment_gdf.geometry.iloc[0]
                
                # Determine bed direction for this segment (alternating for winding)
                if seg_idx % 2 == 0:
                    # Even segments: use original direction
                    seg_direction = direction
                else:
                    # Odd segments: reverse direction for winding
                    reverse_map = {
                        "left_to_right": "right_to_left",
                        "right_to_left": "left_to_right",
                        "bottom_to_top": "top_to_bottom",
                        "top_to_bottom": "bottom_to_top"
                    }
                    seg_direction = reverse_map[direction]
                
                # Generate beds for this segment
                segment_beds = self.create_offset_lines_in_buffered_polygon(
                    projected_segment, beds_per_segment, buffer_dist
                )
                
                if segment_beds.empty:
                    continue
                
                segment_beds.crs = projected_segment_gdf.crs
                
                # Reorder beds based on direction
                segment_beds = self.reorder_lines_by_direction(segment_beds, seg_direction)
                
                # Assign global bed IDs
                for idx, row in segment_beds.iterrows():
                    bed_data = {
                        'line_id': bed_counter,
                        'segment_id': orig_seg_num + 1,
                        'geometry': row.geometry
                    }
                    all_beds.append(bed_data)
                    bed_counter += 1
            
            # Create final GeoDataFrame
            self.bed_lines_gdf = gpd.GeoDataFrame(all_beds, crs=projected_polygon_gdf.crs)
            
            # Create zones
            self.zones_gdf = self.create_line_zones(self.bed_lines_gdf, zone_length)
            
            # Reproject back to WGS84
            self.bed_lines_gdf = self.bed_lines_gdf.to_crs(original_crs)
            self.zones_gdf = self.zones_gdf.to_crs(original_crs)
            
            # Enable export
            self.export_btn.config(state='normal')
            
            # Update display
            self.update_info()
            self.draw_polygon()
            
            self.status_label.config(
                text=f"✅ Generated {len(self.bed_lines_gdf)} beds in {len(self.segments)} segments ({len(self.zones_gdf)} zones)",
                foreground='green'
            )
            
        except Exception as e:
            messagebox.showerror("Processing Error", f"Failed to generate beds:\n{str(e)}")
            self.status_label.config(text=f"❌ Error: {str(e)}", foreground='red')
    
    def create_offset_lines_in_buffered_polygon(self, polygon, num_lines, buffer_distance):
        """Generate parallel bed lines within a polygon"""
        buffered_polygon = polygon.buffer(-buffer_distance)
        
        if buffered_polygon.is_empty or buffered_polygon.geom_type != 'Polygon':
            return gpd.GeoDataFrame()
        
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
        
        all_lines = []
        spacing = available_length / (num_lines - 1) if num_lines > 1 else 0
        translation_unit_vector = translation_vector / np.linalg.norm(translation_vector)
        
        for i in range(num_lines):
            offset = i * spacing
            start = translation_start + translation_unit_vector * offset
            end = start + (base_line_end - base_line_start)
            line = LineString([start, end])
            all_lines.append(line)
        
        lines_gdf = gpd.GeoDataFrame(geometry=all_lines, crs=None)
        
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
        clipped_gdf['temp_id'] = range(len(clipped_gdf))
        
        return clipped_gdf
    
    def reorder_lines_by_direction(self, lines_gdf, direction):
        """Reorder bed lines by direction"""
        if lines_gdf.empty:
            return lines_gdf
        
        centroids = lines_gdf.geometry.centroid
        lines_gdf = lines_gdf.copy()
        lines_gdf['centroid_x'] = centroids.x
        lines_gdf['centroid_y'] = centroids.y
        
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
        else:
            key = 'centroid_y'
            ascending = True
        
        lines_gdf = lines_gdf.sort_values(by=key, ascending=ascending).reset_index(drop=True)
        lines_gdf = lines_gdf.drop(columns=['centroid_x', 'centroid_y', 'temp_id'], errors='ignore')
        
        return lines_gdf
    
    def create_line_zones(self, lines_gdf, zone_length):
        """Create zones along bed lines"""
        all_zones = []
        fid_counter = 1
        
        for _, row in lines_gdf.iterrows():
            line = row.geometry
            line_id = row['line_id']
            segment_id = row.get('segment_id', 1)
            line_length = line.length
            
            num_zones = int(line_length // zone_length)
            current_position = 0
            
            for zone_id in range(1, num_zones + 1):
                segment = substring(line, current_position, current_position + zone_length, normalized=False)
                all_zones.append({
                    'fid': fid_counter,
                    'line_id': line_id,
                    'segment_id': segment_id,
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
                    'segment_id': segment_id,
                    'zone_id': num_zones + 1,
                    'geometry': remaining_segment
                })
                fid_counter += 1
        
        return gpd.GeoDataFrame(all_zones, geometry='geometry', crs=lines_gdf.crs)
    
    def export_geojson(self):
        """Export zones to GeoJSON"""
        if self.zones_gdf is None or self.zones_gdf.empty:
            messagebox.showwarning("No Data", "No zones to export!")
            return
        
        try:
            output_dir = "output"
            os.makedirs(output_dir, exist_ok=True)
            
            safe_name = self.polygon_name.replace(" ", "_").replace("/", "_")
            output_filepath = os.path.join(output_dir, f"{safe_name}_line_zones.geojson")
            
            with open(output_filepath, "w") as f:
                for _, row in self.zones_gdf.iterrows():
                    feature_collection = {
                        "type": "FeatureCollection",
                        "features": [{
                            "type": "Feature",
                            "properties": {
                                "fid": int(row["fid"]),
                                "line_id": int(row["line_id"]),
                                "segment_id": int(row["segment_id"]),
                                "zone_id": int(row["zone_id"])
                            },
                            "geometry": row.geometry.__geo_interface__
                        }]
                    }
                    f.write(json.dumps(feature_collection) + "\n")
            
            messagebox.showinfo("Export Success", 
                              f"Zones exported to:\n{os.path.abspath(output_filepath)}")
            
            self.status_label.config(
                text=f"✅ Exported {len(self.zones_gdf)} zones to {output_filepath}",
                foreground='green'
            )
            
        except Exception as e:
            messagebox.showerror("Export Error", f"Failed to export:\n{str(e)}")
    
    def update_info(self):
        """Update info panel"""
        self.info_text.config(state='normal')
        self.info_text.delete('1.0', tk.END)
        
        info = f"Polygon: {self.polygon_name}\n"
        info += f"Vertices: {len(self.coords) - 1}\n\n"
        
        if self.bed_lines_gdf is not None:
            info += f"Configuration:\n"
            info += f"  Total Beds: {len(self.bed_lines_gdf)}\n"
            info += f"  Segments: {len(self.segments)}\n"
            info += f"  Beds/Segment: {len(self.bed_lines_gdf) // len(self.segments)}\n"
            info += f"  Total Zones: {len(self.zones_gdf) if self.zones_gdf is not None else 0}\n"
            info += f"  Direction: {self.direction_var.get()}\n"
            info += f"  Winding: Yes\n"
        
        self.info_text.insert('1.0', info)
        self.info_text.config(state='disabled')
    
    def draw_polygon(self):
        """Draw visualization"""
        self.ax.clear()
        
        if not self.coords:
            self.ax.text(0.5, 0.5, 'Load GeoJSON to start',
                        ha='center', va='center', fontsize=14, color='gray')
            self.ax.set_xlim(0, 1)
            self.ax.set_ylim(0, 1)
            self.canvas.draw()
            return
        
        x_coords = [point[0] for point in self.coords]
        y_coords = [point[1] for point in self.coords]
        
        # Draw original polygon
        self.ax.plot(x_coords, y_coords, 'k-', linewidth=2, label='Greenhouse')
        
        # Draw segments if created
        if self.segments:
            colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
                     '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9']
            
            for i, segment in enumerate(self.segments):
                color = colors[i % len(colors)]
                seg_coords = segment['coordinates']
                seg_x = [p[0] for p in seg_coords]
                seg_y = [p[1] for p in seg_coords]
                
                self.ax.fill(seg_x, seg_y, alpha=0.2, color=color)
                self.ax.plot(seg_x, seg_y, '-', color=color, linewidth=1.5, 
                           label=f"Segment {i+1}")
        
        # Draw beds if generated
        if self.bed_lines_gdf is not None:
            for _, row in self.bed_lines_gdf.iterrows():
                line = row.geometry
                x, y = line.xy
                self.ax.plot(x, y, 'b-', linewidth=2, alpha=0.7)
                
                # Label bed
                centroid = line.centroid
                self.ax.text(centroid.x, centroid.y, str(row['line_id']),
                           fontsize=7, ha='center', va='center',
                           bbox=dict(boxstyle='round,pad=0.2', fc='white', alpha=0.7))
        
        # Draw zones if generated
        if self.zones_gdf is not None:
            for _, row in self.zones_gdf.iterrows():
                zone = row.geometry
                x, y = zone.xy
                self.ax.plot(x, y, 'g-', linewidth=1, alpha=0.5)
        
        self.ax.set_xlabel('Longitude', fontsize=12)
        self.ax.set_ylabel('Latitude', fontsize=12)
        
        title = f'Greenhouse: {self.polygon_name}'
        if self.bed_lines_gdf is not None:
            title += f'\n🌿 {len(self.bed_lines_gdf)} Beds | {len(self.segments)} Segments | {len(self.zones_gdf)} Zones'
        
        self.ax.set_title(title, fontsize=14, fontweight='bold')
        self.ax.grid(True, alpha=0.2, linestyle='--')
        self.ax.set_aspect('equal', adjustable='box')
        
        if self.segments or self.bed_lines_gdf is not None:
            self.ax.legend(loc='upper right', fontsize=8)
        
        self.canvas.draw()

def main():
    root = tk.Tk()
    app = GreenhouseSegmentBedGenerator(root)
    root.mainloop()

if __name__ == "__main__":
    main()