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
        self.edge_type_filter = 'all'  # 'all', 'vertical', 'horizontal', 'diagonal'
        self.angle_tolerance = 10.0  # degrees for vertical/horizontal classification
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
        """Calculate information for all edges"""
        edges = []
        for i in range(self.num_vertices):
            p1 = self.polygon_vertices[i]
            p2 = self.polygon_vertices[(i + 1) % self.num_vertices]
            
            # Calculate angle
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            angle = math.degrees(math.atan2(dy, dx)) % 180
            
            # Determine edge type
            edge_type = self.classify_edge_type(angle)
            
            edges.append({
                'index': i,
                'label': chr(65 + i),  # A, B, C, ...
                'vertices': (i, (i + 1) % self.num_vertices),
                'line': [p1, p2],
                'angle': angle,
                'type': edge_type,
                'length': math.sqrt(dx**2 + dy**2),
                'is_vertical': abs(angle - 90) < self.angle_tolerance or abs(angle + 90) < self.angle_tolerance,
                'is_horizontal': abs(angle) < self.angle_tolerance or abs(angle - 180) < self.angle_tolerance,
                'is_diagonal': not (abs(angle - 90) < self.angle_tolerance or 
                                   abs(angle + 90) < self.angle_tolerance or 
                                   abs(angle) < self.angle_tolerance or 
                                   abs(angle - 180) < self.angle_tolerance)
            })
        
        return edges
    
    def classify_edge_type(self, angle):
        """Classify edge as vertical, horizontal, or diagonal"""
        if abs(angle - 90) < self.angle_tolerance or abs(angle + 90) < self.angle_tolerance:
            return 'vertical'
        elif abs(angle) < self.angle_tolerance or abs(angle - 180) < self.angle_tolerance:
            return 'horizontal'
        else:
            return 'diagonal'
    
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
            elif self.edge_type_filter == 'diagonal' and edge['is_diagonal']:
                edges_to_extend.append(edge)
            elif self.edge_type_filter == 'vertical_horizontal' and (edge['is_vertical'] or edge['is_horizontal']):
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
                        'color': 'red',
                        'edge_label': inter['edge1']['label']
                    })
            
            # Connect to edge2 endpoints
            for endpoint in inter['edge2']['line']:
                midpoint = ((intersection_pt[0] + endpoint[0]) / 2, 
                           (intersection_pt[1] + endpoint[1]) / 2)
                if self.is_point_inside_polygon(midpoint):
                    self.internal_lines.append({
                        'line': [intersection_pt, endpoint],
                        'color': 'blue',
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
        self.ax_angle_tol = plt.axes([0.02, 0.2, 0.25, 0.1])
        self.ax_buttons = plt.axes([0.02, 0.05, 0.25, 0.1])
        
        # Edge selection checkboxes
        edge_labels = [f"{edge['label']} ({edge['type'][0].upper()})" for edge in self.edges]
        self.checkboxes = CheckButtons(self.ax_edge_select, edge_labels, self.selected_edges)
        self.checkboxes.on_clicked(self.on_edge_select)
        
        # Edge type filter radio buttons
        self.radio = RadioButtons(self.ax_edge_type, 
                                 ['All edges', 'Vertical only', 'Horizontal only', 
                                  'Diagonal only', 'V+H only'])
        self.radio.on_clicked(self.on_edge_type_change)
        
        # Extension factor slider
        self.slider = Slider(self.ax_slider, 'Extension Factor', 1.0, 10.0, 
                           valinit=self.extension_factor, valstep=0.5)
        self.slider.on_changed(self.on_slider_change)
        
        # Angle tolerance slider
        self.slider_angle = Slider(self.ax_angle_tol, 'Angle Tolerance (°)', 1.0, 45.0, 
                                  valinit=self.angle_tolerance, valstep=1.0)
        self.slider_angle.on_changed(self.on_angle_tolerance_change)
        
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
        index = int(label.split(':')[0].split(' ')[1]) - 1 if ':' in label else ord(label[0]) - 65
        self.selected_edges[index] = not self.selected_edges[index]
    
    def on_edge_type_change(self, label):
        """Handle edge type filter change"""
        if label == 'All edges':
            self.edge_type_filter = 'all'
        elif label == 'Vertical only':
            self.edge_type_filter = 'vertical'
        elif label == 'Horizontal only':
            self.edge_type_filter = 'horizontal'
        elif label == 'Diagonal only':
            self.edge_type_filter = 'diagonal'
        elif label == 'V+H only':
            self.edge_type_filter = 'vertical_horizontal'
    
    def on_slider_change(self, val):
        """Handle slider change"""
        self.extension_factor = val
    
    def on_angle_tolerance_change(self, val):
        """Handle angle tolerance change"""
        self.angle_tolerance = val
        # Recalculate edge types
        self.edges = self.calculate_edge_info()
        # Update checkbox labels
        self.ax_edge_select.clear()
        edge_labels = [f"{edge['label']} ({edge['type'][0].upper()})" for edge in self.edges]
        self.checkboxes = CheckButtons(self.ax_edge_select, edge_labels, self.selected_edges)
        self.checkboxes.on_clicked(self.on_edge_select)
    
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
        edge_names = [edge['label'] for edge in edges_to_extend]
        
        info_text = (
            f"Polygon: {self.geojson_data['features'][0]['properties']['id']}\n"
            f"Edges selected: {', '.join(edge_names) if edge_names else 'None'}\n"
            f"Edges extending: {len(edges_to_extend)}/{self.num_vertices} | "
            f"Intersections found: {len(self.intersections)} | "
            f"Internal lines: {len(self.internal_lines)}"
        )
        
        self.ax_info.text(0.02, 0.5, info_text, 
                         fontsize=10, verticalalignment='center',
                         bbox=dict(boxstyle="round,pad=0.3", facecolor="lightblue", alpha=0.8))
    
    def update_plot(self):
        """Update the main plot"""
        self.ax_plot.clear()
        
        # Plot original polygon
        polygon = MplPolygon(list(zip(self.longitudes, self.latitudes)), 
                           facecolor='lightblue', 
                           edgecolor='darkblue',
                           linewidth=2,
                           alpha=0.3)
        self.ax_plot.add_patch(polygon)
        
        # Plot original edges with type-based coloring
        for edge in self.edges:
            x1, y1 = edge['line'][0]
            x2, y2 = edge['line'][1]
            
            # Color based on type
            if edge['is_vertical']:
                color = 'red'
                linestyle = '-'
                linewidth = 2.5 if self.selected_edges[edge['index']] else 1.0
            elif edge['is_horizontal']:
                color = 'green'
                linestyle = '-'
                linewidth = 2.5 if self.selected_edges[edge['index']] else 1.0
            else:
                color = 'blue'
                linestyle = '-'
                linewidth = 2.0 if self.selected_edges[edge['index']] else 0.8
            
            # Draw edge
            self.ax_plot.plot([x1, x2], [y1, y2], color=color, 
                            linestyle=linestyle, linewidth=linewidth, alpha=0.7)
            
            # Add label
            if self.show_labels:
                mid_x = (x1 + x2) / 2
                mid_y = (y1 + y2) / 2
                dx = x2 - x1
                dy = y2 - y1
                angle = math.degrees(math.atan2(dy, dx))
                
                self.ax_plot.text(mid_x, mid_y, edge['label'],
                                fontsize=10, fontweight='bold',
                                color=color, ha='center', va='center',
                                rotation=angle,
                                bbox=dict(boxstyle="round,pad=0.15", facecolor="white", 
                                         edgecolor=color, alpha=0.8))
        
        # Plot vertices
        for i in range(self.num_vertices):
            self.ax_plot.scatter(self.longitudes[i], self.latitudes[i], 
                               color='black', s=50, zorder=5, alpha=0.7)
            if self.show_labels:
                self.ax_plot.text(self.longitudes[i], self.latitudes[i], f'{i+1}', 
                                fontsize=9, fontweight='bold', 
                                color='white', ha='center', va='center',
                                bbox=dict(boxstyle="circle,pad=0.15", facecolor="black", alpha=0.8))
        
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
                elif edge['is_horizontal']:
                    color = 'green'
                else:
                    color = 'blue'
                
                self.ax_plot.plot([x1, x2], [y1, y2], 
                                color=color, linewidth=1, linestyle='--', alpha=0.4)
        
        # Plot intersections
        if self.show_intersections and self.intersections:
            for idx, inter in enumerate(self.intersections):
                ix, iy = inter['intersection']
                self.ax_plot.scatter([ix], [iy], color='purple', s=100, zorder=6, marker='X')
                
                if self.show_labels:
                    self.ax_plot.text(ix, iy + 0.00003, f'I{idx+1}', 
                                    fontsize=9, fontweight='bold', color='purple',
                                    ha='center', va='bottom',
                                    bbox=dict(boxstyle="round,pad=0.2", facecolor="white", 
                                             edgecolor='purple', alpha=0.8))
        
        # Plot internal lines
        if self.show_internal_lines and self.internal_lines:
            for line_data in self.internal_lines:
                x1, y1 = line_data['line'][0]
                x2, y2 = line_data['line'][1]
                self.ax_plot.plot([x1, x2], [y1, y2], 
                                color=line_data['color'], linewidth=1.5, 
                                linestyle=':', alpha=0.7)
        
        # Set plot properties
        self.ax_plot.set_xlabel('Longitude', fontsize=12)
        self.ax_plot.set_ylabel('Latitude', fontsize=12)
        self.ax_plot.set_title('Edge Extension Analyzer', fontsize=14, fontweight='bold')
        
        # Add legend
        legend_elements = [
            patches.Patch(facecolor='red', edgecolor='red', alpha=0.7, label='Vertical edges'),
            patches.Patch(facecolor='green', edgecolor='green', alpha=0.7, label='Horizontal edges'),
            patches.Patch(facecolor='blue', edgecolor='blue', alpha=0.7, label='Diagonal edges'),
            patches.Patch(facecolor='purple', edgecolor='purple', alpha=0.7, label='Intersections'),
            patches.Patch(facecolor='lightblue', edgecolor='darkblue', alpha=0.3, label='Polygon')
        ]
        
        self.ax_plot.legend(handles=legend_elements, loc='upper right', fontsize=9)
        
        self.ax_plot.grid(True, alpha=0.2, linestyle='--')
        self.ax_plot.set_aspect('equal', adjustable='box')
        
        self.fig.canvas.draw_idle()
    
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

# Print initial analysis
print("=" * 80)
print("EDGE EXTENSION ANALYZER GUI")
print("=" * 80)
print("Instructions:")
print("1. Select which edges to extend using the checkboxes")
print("2. Choose edge type filter (vertical, horizontal, etc.)")
print("3. Adjust extension factor and angle tolerance")
print("4. Click 'Analyze & Update' to see results")
print("5. Use toggle buttons to show/hide elements")
print("=" * 80)
print("\nInitial edge classification:")

# Create analyzer and run
analyzer = EdgeExtensionAnalyzer(geojson_data)

# Print edge information
print("\nEdge Information:")
print("-" * 60)
print(f"{'Edge':<6} {'Type':<12} {'Angle (°)':<10} {'Length':<10} {'Vertices'}")
print("-" * 60)
for edge in analyzer.edges:
    vertices_str = f"{edge['vertices'][0]+1}-{edge['vertices'][1]+1}"
    print(f"{edge['label']:<6} {edge['type']:<12} {edge['angle']:<10.2f} {edge['length']:<10.7f} {vertices_str}")
print("-" * 60)

analyzer.run()