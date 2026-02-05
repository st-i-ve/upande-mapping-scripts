import json
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import Polygon as MplPolygon
import numpy as np
import math
from matplotlib.widgets import Button, CheckButtons, RadioButtons, Slider
import warnings
warnings.filterwarnings('ignore')

class EdgeExtensionAnalyzer:
    def __init__(self, geojson_data):
        self.geojson_data = geojson_data
        self.coords = geojson_data['features'][0]['geometry']['coordinates'][0]
        self.polygon_vertices = self.coords[:-1]
        self.longitudes = [coord[0] for coord in self.polygon_vertices]
        self.latitudes = [coord[1] for coord in self.polygon_vertices]
        self.num_vertices = len(self.polygon_vertices)
        
        # Initialize settings
        self.selected_edges = [True] * self.num_vertices  # All edges selected by default
        self.extension_factor = 3.0
        self.edge_type_filter = 'all'  # 'all', 'vertical', 'horizontal'
        self.angle_threshold = 45.0  # degrees for horizontal/vertical classification
        self.show_extended_lines = True
        self.show_intersections = True
        self.show_internal_lines = True
        self.show_labels = True
        
        # Calculate edge information
        self.edges = self.calculate_edge_info()
        
        # Results
        self.intersections = []
        self.internal_lines = []
        
        # Create figure with GUI controls
        self.fig = plt.figure(figsize=(18, 12))
        self.setup_gui()
        
    def calculate_edge_info(self):
        """Calculate information for all edges using equatorial angle classification"""
        edges = []
        for i in range(self.num_vertices):
            p1 = self.polygon_vertices[i]
            p2 = self.polygon_vertices[(i + 1) % self.num_vertices]
            
            # Calculate raw angle in geographic coordinates
            dx = p2[0] - p1[0]  # Longitude difference (east-west)
            dy = p2[1] - p1[1]  # Latitude difference (north-south)
            
            # Calculate bearing/azimuth (angle from north)
            # Note: This gives us the angle relative to true north, not the equator
            angle_rad = math.atan2(dx, dy)  # Note: dx first for bearing calculation
            angle_deg = math.degrees(angle_rad)
            
            # Normalize to 0-360 degrees
            if angle_deg < 0:
                angle_deg += 360
            
            # Calculate angle relative to equator (east-west line)
            # The equator runs east-west, so we want the minimum angle between
            # the line and the east-west direction
            
            # Option 1: Angle from east-west axis (0° or 180° for perfectly east-west)
            angle_from_east_west = min(
                abs(angle_deg),  # 0° = east
                abs(angle_deg - 180),  # 180° = west
                abs(angle_deg - 360)  # 360° = east
            )
            
            # Option 2: Alternative calculation using vector math
            # East direction vector (along equator)
            east_vec = [1, 0]
            # Our edge direction vector
            edge_vec = [dx, dy]
            
            # Normalize vectors
            def normalize(v):
                norm = math.sqrt(v[0]**2 + v[1]**2)
                if norm == 0:
                    return [0, 0]
                return [v[0]/norm, v[1]/norm]
            
            east_norm = normalize(east_vec)
            edge_norm = normalize(edge_vec)
            
            # Calculate dot product and angle
            dot_product = east_norm[0] * edge_norm[0] + east_norm[1] * edge_norm[1]
            # Clamp to avoid floating point errors
            dot_product = max(-1, min(1, dot_product))
            angle_from_equator = math.degrees(math.acos(dot_product))
            
            # The angle from equator will be between 0 and 180 degrees
            # 0° = perfectly parallel to equator (east-west)
            # 90° = perfectly perpendicular to equator (north-south)
            # 180° = perfectly parallel but opposite direction (west-east)
            
            # We want the acute angle (0-90 degrees)
            acute_angle = min(angle_from_equator, 180 - angle_from_equator)
            
            # Classify based on your criteria
            # acute_angle = angle from east-west line (equator)
            # 0° = perfectly horizontal (parallel to equator)
            # 90° = perfectly vertical (perpendicular to equator)
            
            if acute_angle <= self.angle_threshold:
                is_horizontal = True
                is_vertical = False
                edge_type = "horizontal"
                orientation = "H"
            else:
                is_horizontal = False
                is_vertical = True
                edge_type = "vertical"
                orientation = "V"
            
            # Calculate also the visual angle for plotting/direction arrows
            visual_angle_rad = math.atan2(dy, dx)  # For plotting purposes
            visual_angle_deg = math.degrees(visual_angle_rad)
            
            # Determine visual direction for labeling
            if abs(dx) > abs(dy):
                if dx > 0:
                    direction = "→"  # Right
                else:
                    direction = "←"  # Left
            else:
                if dy > 0:
                    direction = "↑"  # Up
                else:
                    direction = "↓"  # Down
            
            edges.append({
                'index': i,
                'label': chr(65 + i),  # A, B, C, ...
                'vertices': (i, (i + 1) % self.num_vertices),
                'line': [p1, p2],
                'angle_from_equator': acute_angle,
                'visual_angle': visual_angle_deg,
                'dx': dx,
                'dy': dy,
                'type': edge_type,
                'orientation': orientation,
                'direction': direction,
                'is_vertical': is_vertical,
                'is_horizontal': is_horizontal,
                'length': math.sqrt(dx**2 + dy**2),
                'bearing': angle_deg,  # Angle from north
                'angle_from_east_west': angle_from_east_west
            })
        
        return edges
    
    def line_intersection(self, line1, line2, segment_intersection=True):
        """Find intersection point of two lines"""
        x1, y1 = line1[0]
        x2, y2 = line1[1]
        x3, y3 = line2[0]
        x4, y4 = line2[1]
        
        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        
        if abs(denom) < 1e-12:
            return None
        
        px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
        py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
        
        if segment_intersection:
            min_x1, max_x1 = min(x1, x2), max(x1, x2)
            min_y1, max_y1 = min(y1, y2), max(y1, y2)
            min_x2, max_x2 = min(x3, x4), max(x3, x4)
            min_y2, max_y2 = min(y3, y4), max(y3, y4)
            
            tol = 1e-9
            if not (min_x1 - tol <= px <= max_x1 + tol and 
                    min_y1 - tol <= py <= max_y1 + tol and
                    min_x2 - tol <= px <= max_x2 + tol and
                    min_y2 - tol <= py <= max_y2 + tol):
                return None
        
        return (px, py)
    
    def is_point_inside_polygon(self, point):
        """Check if a point is inside the polygon"""
        x, y = point
        n = self.num_vertices
        inside = False
        
        p1x, p1y = self.polygon_vertices[0]
        for i in range(n + 1):
            p2x, p2y = self.polygon_vertices[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        
        return inside
    
    def extend_line(self, line, extension_factor):
        """Extend a line segment in both directions"""
        x1, y1 = line[0]
        x2, y2 = line[1]
        
        dx = x2 - x1
        dy = y2 - y1
        
        length = math.sqrt(dx**2 + dy**2)
        if length == 0:
            return line
        
        dx /= length
        dy /= length
        
        extended_start = (x1 - dx * length * extension_factor, y1 - dy * length * extension_factor)
        extended_end = (x2 + dx * length * extension_factor, y2 + dy * length * extension_factor)
        
        return [extended_start, extended_end]
    
    def get_edges_to_extend(self):
        """Get edges to extend based on current filter settings"""
        edges_to_extend = []
        
        for i, edge in enumerate(self.edges):
            if not self.selected_edges[i]:
                continue
            
            # Apply edge type filter
            if self.edge_type_filter == 'all':
                edges_to_extend.append(edge)
            elif self.edge_type_filter == 'vertical' and edge['is_vertical']:
                edges_to_extend.append(edge)
            elif self.edge_type_filter == 'horizontal' and edge['is_horizontal']:
                edges_to_extend.append(edge)
        
        return edges_to_extend
    
    def analyze_intersections(self):
        """Find all intersections from extended edges"""
        edges_to_extend = self.get_edges_to_extend()
        self.intersections = []
        self.internal_lines = []
        
        # Extend selected edges
        extended_edges = []
        for edge in edges_to_extend:
            extended_line = self.extend_line(edge['line'], self.extension_factor)
            extended_edges.append({
                'edge': edge,
                'extended_line': extended_line
            })
        
        # Find intersections
        for i in range(len(extended_edges)):
            for j in range(i + 1, len(extended_edges)):
                edge_i = extended_edges[i]['edge']
                edge_j = extended_edges[j]['edge']
                
                # Skip adjacent edges
                i_v1, i_v2 = edge_i['vertices']
                j_v1, j_v2 = edge_j['vertices']
                
                if len({i_v1, i_v2, j_v1, j_v2}) < 4:
                    continue
                
                intersection = self.line_intersection(
                    extended_edges[i]['extended_line'], 
                    extended_edges[j]['extended_line'], 
                    segment_intersection=False
                )
                
                if intersection and self.is_point_inside_polygon(intersection):
                    # Calculate distances
                    def min_distance(point, line):
                        x1, y1 = line[0]
                        x2, y2 = line[1]
                        return min(
                            math.sqrt((point[0] - x1)**2 + (point[1] - y1)**2),
                            math.sqrt((point[0] - x2)**2 + (point[1] - y2)**2)
                        )
                    
                    dist1 = min_distance(intersection, edge_i['line'])
                    dist2 = min_distance(intersection, edge_j['line'])
                    
                    if dist1 > 0.00001 and dist2 > 0.00001:
                        self.intersections.append({
                            'edge1': edge_i,
                            'edge2': edge_j,
                            'intersection': intersection,
                            'dist1': dist1,
                            'dist2': dist2,
                            'extended_line1': extended_edges[i]['extended_line'],
                            'extended_line2': extended_edges[j]['extended_line']
                        })
        
        # Create internal lines
        for inter in self.intersections:
            intersection_pt = inter['intersection']
            
            # Connect to edge1 endpoints
            for endpoint in inter['edge1']['line']:
                midpoint = ((intersection_pt[0] + endpoint[0]) / 2, 
                           (intersection_pt[1] + endpoint[1]) / 2)
                if self.is_point_inside_polygon(midpoint):
                    self.internal_lines.append({
                        'line': [intersection_pt, endpoint],
                        'color': 'red' if inter['edge1']['is_vertical'] else 'blue',
                        'edge_label': inter['edge1']['label']
                    })
            
            # Connect to edge2 endpoints
            for endpoint in inter['edge2']['line']:
                midpoint = ((intersection_pt[0] + endpoint[0]) / 2, 
                           (intersection_pt[1] + endpoint[1]) / 2)
                if self.is_point_inside_polygon(midpoint):
                    self.internal_lines.append({
                        'line': [intersection_pt, endpoint],
                        'color': 'red' if inter['edge2']['is_vertical'] else 'blue',
                        'edge_label': inter['edge2']['label']
                    })
    
    def setup_gui(self):
        """Setup the GUI controls"""
        # Main plot area
        self.ax_plot = plt.axes([0.3, 0.1, 0.65, 0.85])
        
        # Control panels
        self.ax_edge_select = plt.axes([0.02, 0.7, 0.25, 0.25])
        self.ax_edge_type = plt.axes([0.02, 0.5, 0.25, 0.15])
        self.ax_slider = plt.axes([0.02, 0.35, 0.25, 0.1])
        self.ax_angle_threshold = plt.axes([0.02, 0.2, 0.25, 0.1])
        self.ax_buttons = plt.axes([0.02, 0.05, 0.25, 0.1])
        
        # Edge selection checkboxes with visual indicators
        edge_labels = []
        for edge in self.edges:
            if edge['is_vertical']:
                label = f"{edge['label']} (V:{edge['direction']} {edge['angle_from_equator']:.1f}°)"
            elif edge['is_horizontal']:
                label = f"{edge['label']} (H:{edge['direction']} {edge['angle_from_equator']:.1f}°)"
            edge_labels.append(label)
        
        self.checkboxes = CheckButtons(self.ax_edge_select, edge_labels, self.selected_edges)
        self.checkboxes.on_clicked(self.on_edge_select)
        
        # Edge type filter radio buttons
        self.radio = RadioButtons(self.ax_edge_type, 
                                 ['All edges', 'Vertical only', 'Horizontal only'])
        self.radio.on_clicked(self.on_edge_type_change)
        
        # Extension factor slider
        self.slider = Slider(self.ax_slider, 'Extension Factor', 1.0, 10.0, 
                           valinit=self.extension_factor, valstep=0.5)
        self.slider.on_changed(self.on_slider_change)
        
        # Angle threshold slider
        self.slider_angle = Slider(self.ax_angle_threshold, 'Angle Threshold (°)', 1.0, 90.0, 
                                  valinit=self.angle_threshold, valstep=1.0)
        self.slider_angle.on_changed(self.on_angle_threshold_change)
        
        # Action buttons
        self.btn_analyze = Button(self.ax_buttons, 'Analyze & Update')
        self.btn_analyze.on_clicked(self.on_analyze)
        
        # Add toggle buttons
        self.ax_toggles = plt.axes([0.02, 0.42, 0.25, 0.05])
        self.toggle_labels = ['Show Extended', 'Show Intersections', 'Show Internal', 'Show Labels']
        self.toggle_states = [True, True, True, True]
        self.toggle_buttons = CheckButtons(self.ax_toggles, self.toggle_labels, self.toggle_states)
        self.toggle_buttons.on_clicked(self.on_toggle_change)
        
        # Initial analysis and plot
        self.analyze_intersections()
        self.update_plot()
        
        # Add info panel
        self.ax_info = plt.axes([0.3, 0.02, 0.65, 0.06])
        self.ax_info.axis('off')
        self.update_info_panel()
    
    def on_edge_select(self, label):
        """Handle edge selection change"""
        # Extract edge label (first character)
        edge_label = label[0]
        index = ord(edge_label) - 65
        self.selected_edges[index] = not self.selected_edges[index]
    
    def on_edge_type_change(self, label):
        """Handle edge type filter change"""
        if label == 'All edges':
            self.edge_type_filter = 'all'
        elif label == 'Vertical only':
            self.edge_type_filter = 'vertical'
        elif label == 'Horizontal only':
            self.edge_type_filter = 'horizontal'
    
    def on_slider_change(self, val):
        """Handle slider change"""
        self.extension_factor = val
    
    def on_angle_threshold_change(self, val):
        """Handle angle threshold change"""
        self.angle_threshold = val
        # Recalculate edge types
        self.edges = self.calculate_edge_info()
        # Update checkbox labels
        self.ax_edge_select.clear()
        
        edge_labels = []
        for edge in self.edges:
            if edge['is_vertical']:
                label = f"{edge['label']} (V:{edge['direction']} {edge['angle_from_equator']:.1f}°)"
            elif edge['is_horizontal']:
                label = f"{edge['label']} (H:{edge['direction']} {edge['angle_from_equator']:.1f}°)"
            edge_labels.append(label)
        
        self.checkboxes = CheckButtons(self.ax_edge_select, edge_labels, self.selected_edges)
        self.checkboxes.on_clicked(self.on_edge_select)
        
        # Redraw
        self.fig.canvas.draw_idle()
    
    def on_toggle_change(self, label):
        """Handle toggle button changes"""
        if label == 'Show Extended':
            self.show_extended_lines = not self.show_extended_lines
        elif label == 'Show Intersections':
            self.show_intersections = not self.show_intersections
        elif label == 'Show Internal':
            self.show_internal_lines = not self.show_internal_lines
        elif label == 'Show Labels':
            self.show_labels = not self.show_labels
    
    def on_analyze(self, event):
        """Handle analyze button click"""
        self.analyze_intersections()
        self.update_plot()
        self.update_info_panel()
    
    def update_info_panel(self):
        """Update the information panel"""
        self.ax_info.clear()
        self.ax_info.axis('off')
        
        edges_to_extend = self.get_edges_to_extend()
        vertical_edges = [e for e in edges_to_extend if e['is_vertical']]
        horizontal_edges = [e for e in edges_to_extend if e['is_horizontal']]
        
        # Count intersection types
        v_v_intersections = 0
        h_h_intersections = 0
        v_h_intersections = 0
        
        for inter in self.intersections:
            edge1_vertical = inter['edge1']['is_vertical']
            edge2_vertical = inter['edge2']['is_vertical']
            
            if edge1_vertical and edge2_vertical:
                v_v_intersections += 1
            elif (not edge1_vertical) and (not edge2_vertical):
                h_h_intersections += 1
            else:
                v_h_intersections += 1
        
        info_text = (
            f"Polygon: {self.geojson_data['features'][0]['properties']['id']} | "
            f"Filter: {self.edge_type_filter} | "
            f"Threshold: ≤{self.angle_threshold}° = Horizontal, >{self.angle_threshold}° = Vertical | "
            f"Extension: {self.extension_factor}x\n"
            f"Edges: {len(edges_to_extend)}/{self.num_vertices} "
            f"(V:{len(vertical_edges)} H:{len(horizontal_edges)}) | "
            f"Intersections: {len(self.intersections)} "
            f"(V-V:{v_v_intersections} H-H:{h_h_intersections} V-H:{v_h_intersections})"
        )
        
        self.ax_info.text(0.02, 0.5, info_text, 
                         fontsize=9, verticalalignment='center',
                         bbox=dict(boxstyle="round,pad=0.3", facecolor="lightblue", alpha=0.8))
    
    def update_plot(self):
        """Update the main plot"""
        self.ax_plot.clear()
        
        # Plot original polygon
        polygon = MplPolygon(list(zip(self.longitudes, self.latitudes)), 
                           facecolor='lightblue', 
                           edgecolor='darkblue',
                           linewidth=2,
                           alpha=0.2)
        self.ax_plot.add_patch(polygon)
        
        # Plot original edges with type-based coloring
        for edge in self.edges:
            x1, y1 = edge['line'][0]
            x2, y2 = edge['line'][1]
            
            # Color and style based on type
            if edge['is_vertical']:
                color = 'red'
                linestyle = '-'
                linewidth = 3.0 if self.selected_edges[edge['index']] else 1.5
                label_suffix = f" (V: {edge['angle_from_equator']:.1f}°)"
            else:  # horizontal
                color = 'green'
                linestyle = '-'
                linewidth = 3.0 if self.selected_edges[edge['index']] else 1.5
                label_suffix = f" (H: {edge['angle_from_equator']:.1f}°)"
            
            # Draw edge
            self.ax_plot.plot([x1, x2], [y1, y2], color=color, 
                            linestyle=linestyle, linewidth=linewidth, alpha=0.8)
            
            # Add label with angle from equator
            if self.show_labels:
                mid_x = (x1 + x2) / 2
                mid_y = (y1 + y2) / 2
                
                # Calculate label rotation for readability (visual angle)
                dx = x2 - x1
                dy = y2 - y1
                angle = edge['visual_angle']
                
                # Adjust angle for better readability
                if angle > 90:
                    angle -= 180
                elif angle < -90:
                    angle += 180
                
                self.ax_plot.text(mid_x, mid_y, f"{edge['label']}{label_suffix}",
                                fontsize=8, fontweight='bold',
                                color=color, ha='center', va='center',
                                rotation=angle,
                                bbox=dict(boxstyle="round,pad=0.1", facecolor="white", 
                                         edgecolor=color, alpha=0.7))
        
        # Plot vertices
        for i in range(self.num_vertices):
            self.ax_plot.scatter(self.longitudes[i], self.latitudes[i], 
                               color='black', s=50, zorder=5, alpha=0.7)
            if self.show_labels:
                self.ax_plot.text(self.longitudes[i], self.latitudes[i], f'V{i+1}', 
                                fontsize=8, fontweight='bold', 
                                color='white', ha='center', va='center',
                                bbox=dict(boxstyle="circle,pad=0.1", facecolor="black", alpha=0.8))
        
        # Get edges to extend
        edges_to_extend = self.get_edges_to_extend()
        
        # Plot extended lines
        if self.show_extended_lines and edges_to_extend:
            for edge in edges_to_extend:
                extended_line = self.extend_line(edge['line'], self.extension_factor)
                x1, y1 = extended_line[0]
                x2, y2 = extended_line[1]
                
                # Color based on type
                if edge['is_vertical']:
                    color = 'red'
                    linestyle = ':'
                else:
                    color = 'green'
                    linestyle = ':'
                
                self.ax_plot.plot([x1, x2], [y1, y2], 
                                color=color, linewidth=1, linestyle=linestyle, alpha=0.5)
        
        # Plot intersections
        if self.show_intersections and self.intersections:
            for idx, inter in enumerate(self.intersections):
                ix, iy = inter['intersection']
                # Color intersection based on edge types
                edge1_vertical = inter['edge1']['is_vertical']
                edge2_vertical = inter['edge2']['is_vertical']
                
                if edge1_vertical != edge2_vertical:  # One vertical, one horizontal
                    color = 'purple'  # Vertical-Horizontal intersection
                    marker = 'o'
                    size = 100
                elif edge1_vertical:  # Both vertical
                    color = 'darkred'  # Vertical-Vertical intersection
                    marker = 's'
                    size = 80
                else:  # Both horizontal
                    color = 'darkgreen'  # Horizontal-Horizontal intersection
                    marker = 's'
                    size = 80
                
                self.ax_plot.scatter([ix], [iy], color=color, s=size, zorder=6, marker=marker)
                
                if self.show_labels:
                    edge_types = f"{inter['edge1']['label']}({inter['edge1']['type'][0]})-{inter['edge2']['label']}({inter['edge2']['type'][0]})"
                    self.ax_plot.text(ix, iy + 0.00003, f'I{idx+1}\n{edge_types}', 
                                    fontsize=8, fontweight='bold', color=color,
                                    ha='center', va='bottom',
                                    bbox=dict(boxstyle="round,pad=0.15", facecolor="white", 
                                             edgecolor=color, alpha=0.8))
        
        # Plot internal lines
        if self.show_internal_lines and self.internal_lines:
            for line_data in self.internal_lines:
                x1, y1 = line_data['line'][0]
                x2, y2 = line_data['line'][1]
                self.ax_plot.plot([x1, x2], [y1, y2], 
                                color=line_data['color'], linewidth=2, 
                                linestyle='--', alpha=0.6)
        
        # Set plot properties
        self.ax_plot.set_xlabel('Longitude', fontsize=12)
        self.ax_plot.set_ylabel('Latitude', fontsize=12)
        self.ax_plot.set_title('Edge Extension Analyzer - Equatorial Angle Classification', 
                              fontsize=14, fontweight='bold')
        
        # Add orientation guide
        self.add_orientation_guide()
        
        # Add legend
        legend_elements = [
            patches.Patch(facecolor='red', edgecolor='red', alpha=0.8, 
                         label=f'Vertical (> {self.angle_threshold}° from equator)'),
            patches.Patch(facecolor='green', edgecolor='green', alpha=0.8, 
                         label=f'Horizontal (≤ {self.angle_threshold}° from equator)'),
            patches.Patch(facecolor='purple', edgecolor='purple', alpha=0.8, label='V-H Intersections'),
            patches.Patch(facecolor='darkred', edgecolor='darkred', alpha=0.8, label='V-V Intersections'),
            patches.Patch(facecolor='darkgreen', edgecolor='darkgreen', alpha=0.8, label='H-H Intersections'),
            patches.Patch(facecolor='lightblue', edgecolor='darkblue', alpha=0.2, label='Polygon Area')
        ]
        
        self.ax_plot.legend(handles=legend_elements, loc='upper right', fontsize=9)
        
        self.ax_plot.grid(True, alpha=0.2, linestyle='--')
        self.ax_plot.set_aspect('equal', adjustable='box')
        
        self.fig.canvas.draw_idle()
    
    def add_orientation_guide(self):
        """Add an orientation guide to the plot showing equator reference"""
        # Position in upper left corner
        x_center = self.ax_plot.get_xlim()[0] + (self.ax_plot.get_xlim()[1] - self.ax_plot.get_xlim()[0]) * 0.05
        y_center = self.ax_plot.get_ylim()[1] - (self.ax_plot.get_ylim()[1] - self.ax_plot.get_ylim()[0]) * 0.05
        
        # Draw equator direction (horizontal)
        self.ax_plot.arrow(x_center - 0.0001, y_center, 0.0002, 0, 
                          head_width=0.00002, head_length=0.00003, 
                          fc='green', ec='green', alpha=0.8)
        self.ax_plot.text(x_center, y_center + 0.00002, 'Equator Direction', 
                         fontsize=9, fontweight='bold', color='green', 
                         ha='center', va='bottom')
        
        # Draw meridian direction (vertical)
        self.ax_plot.arrow(x_center, y_center - 0.0001, 0, 0.0002, 
                          head_width=0.00002, head_length=0.00003, 
                          fc='red', ec='red', alpha=0.8)
        self.ax_plot.text(x_center + 0.00002, y_center, 'Meridian Direction', 
                         fontsize=9, fontweight='bold', color='red', 
                         ha='left', va='center', rotation=90)
        
        # Add angle threshold indicator
        angle_text = f"Threshold: {self.angle_threshold}°\n≤{self.angle_threshold}° = Horizontal\n>{self.angle_threshold}° = Vertical"
        self.ax_plot.text(x_center, y_center - 0.0002, angle_text,
                         fontsize=8, color='black', ha='center', va='top',
                         bbox=dict(boxstyle="round,pad=0.3", facecolor="yellow", alpha=0.5))
    
    def run(self):
        """Run the application"""
        plt.show()

# Parse the GeoJSON data
geojson_data = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {"id": "Kapkolia GH 18"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [35.7476211, 0.0686487],
                        [35.7484332, 0.0682052],
                        [35.7486109, 0.0685414],
                        [35.7485188, 0.0685899],
                        [35.7486008, 0.0687426],
                        [35.7485605, 0.0687621],
                        [35.7486369, 0.0689017],
                        [35.7485544, 0.0689431],
                        [35.7486364, 0.0691011],
                        [35.7485011, 0.0691646],
                        [35.7486711, 0.069492],
                        [35.7482149, 0.0697103],
                        [35.7476211, 0.0686487]
                    ]
                ]
            }
        }
    ]
}

# Create analyzer
analyzer = EdgeExtensionAnalyzer(geojson_data)

# Print initial analysis
print("=" * 80)
print("EDGE EXTENSION ANALYZER - EQUATORIAL ANGLE CLASSIFICATION")
print("=" * 80)
print("CLASSIFICATION CRITERIA:")
print(f"  Horizontal: Angle from equator ≤ {analyzer.angle_threshold}°")
print(f"  Vertical: Angle from equator > {analyzer.angle_threshold}°")
print("  (0° = perfectly parallel to equator, 90° = perpendicular to equator)")
print("=" * 80)
print("\nInstructions:")
print("1. Select which edges to extend using the checkboxes")
print("2. Choose edge type filter (Vertical, Horizontal, or All)")
print("3. Adjust angle threshold to change classification boundary")
print("4. Adjust extension factor for line extension length")
print("5. Click 'Analyze & Update' to see results")
print("6. Use toggle buttons to show/hide elements")
print("=" * 80)

# Print detailed edge information
print("\nEDGE ANALYSIS WITH EQUATORIAL ANGLES:")
print("-" * 80)
print(f"{'Edge':<6} {'Type':<12} {'Dir':<4} {'Angle from':<12} {'Bearing':<10} {'Length':<10} {'Vertices'}")
print(f"{'':<6} {'':<12} {'':<4} {'Equator (°)':<12} {'(from N)':<10} {'':<10} {'':<10}")
print("-" * 80)

for edge in analyzer.edges:
    vertices_str = f"V{edge['vertices'][0]+1}-V{edge['vertices'][1]+1}"
    type_str = "Vertical" if edge['is_vertical'] else "Horizontal"
    
    print(f"{edge['label']:<6} {type_str:<12} {edge['direction']:<4} {edge['angle_from_equator']:<12.1f} "
          f"{edge['bearing']:<10.1f} {edge['length']:<10.6f} {vertices_str}")

print("-" * 80)

# Classify each edge based on your criteria
print("\nEDGE CLASSIFICATION BASED ON EQUATORIAL ANGLE:")
print("-" * 80)
print(f"Threshold: ≤{analyzer.angle_threshold}° = Horizontal, >{analyzer.angle_threshold}° = Vertical")
print("-" * 80)

for edge in analyzer.edges:
    angle = edge['angle_from_equator']
    classification = "Horizontal" if angle <= analyzer.angle_threshold else "Vertical"
    angle_status = f"≤{analyzer.angle_threshold}°" if angle <= analyzer.angle_threshold else f">{analyzer.angle_threshold}°"
    
    print(f"Edge {edge['label']} (V{edge['vertices'][0]+1}-V{edge['vertices'][1]+1}): "
          f"{angle:.1f}° from equator → {angle_status} → {classification}")

print("-" * 80)

# Count edges by type
vertical_count = sum(1 for edge in analyzer.edges if edge['is_vertical'])
horizontal_count = sum(1 for edge in analyzer.edges if not edge['is_vertical'])

print(f"\nSUMMARY:")
print(f"Total edges: {len(analyzer.edges)}")
print(f"Horizontal edges (≤{analyzer.angle_threshold}°): {horizontal_count}")
print(f"Vertical edges (>{analyzer.angle_threshold}°): {vertical_count}")

print("\nKEY:")
print("  Angle from Equator: 0° = perfectly east-west (parallel to equator)")
print("                      90° = perfectly north-south (perpendicular to equator)")
print("  Bearing: Angle from true north (0° = north, 90° = east, 180° = south, 270° = west)")
print("=" * 80)

# Run the GUI
analyzer.run()