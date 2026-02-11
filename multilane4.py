import json
import math
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon
from matplotlib.widgets import CheckButtons, Button
import numpy as np

class PolygonExtensionAnalyzer:
    def __init__(self, geojson_data):
        # Extract vertices from GeoJSON
        coords = geojson_data["features"][0]["geometry"]["coordinates"][0][:-1]
        self.vertices = [(lon, lat) for lon, lat in coords]
        self.polygon_name = geojson_data["features"][0]["properties"]["id"]
        
        # Define edges
        self.edges = {}
        for i in range(len(self.vertices)):
            edge_name = f'E{i+1}'
            v1 = self.vertices[i]
            v2 = self.vertices[(i+1) % len(self.vertices)]
            self.edges[edge_name] = {
                'start': v1,
                'end': v2,
                'index': i,
                'name': edge_name
            }
        
        # Analysis results
        self.extension_analysis = {}
        self.selected_extensions = []
        self.checkbox_labels = []
        self.checkbox_mapping = {}
        
        # Analyze extensions
        self.analyze_extensions()
        
        # Setup visualization
        self.setup_plot()
    
    def line_intersection(self, p1, p2, p3, p4):
        """
        Find intersection point of two infinite lines defined by segments.
        Returns (x, y, t1, t2) where t1 and t2 are parameters.
        """
        x1, y1 = p1
        x2, y2 = p2
        x3, y3 = p3
        x4, y4 = p4
        
        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        
        if abs(denom) < 1e-10:
            return None  # Lines are parallel
        
        t1 = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
        t2 = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom
        
        x = x1 + t1 * (x2 - x1)
        y = y1 + t1 * (y2 - y1)
        
        return (x, y, t1, t2)
    
    def point_in_polygon(self, point):
        """Check if a point is inside the polygon using ray casting."""
        x, y = point
        n = len(self.vertices)
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = self.vertices[i]
            xj, yj = self.vertices[j]
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                inside = not inside
            j = i
        return inside
    
    def calculate_angle(self, v1, v2):
        """Calculate angle between two vectors in degrees."""
        dot = v1[0] * v2[0] + v1[1] * v2[1]
        mag1 = math.sqrt(v1[0]**2 + v1[1]**2)
        mag2 = math.sqrt(v2[0]**2 + v2[1]**2)
        
        if mag1 == 0 or mag2 == 0:
            return 0
        
        cos_angle = max(-1, min(1, dot / (mag1 * mag2)))
        return abs(math.acos(cos_angle)) * 180 / math.pi
    
    def analyze_extensions(self):
        """Analyze which edges can be extended to intersect other edges."""
        print("\n" + "="*70)
        print("ANALYZING POLYGON EDGE EXTENSIONS")
        print("="*70)
        
        for edge_name, edge_data in self.edges.items():
            p1 = edge_data['start']
            p2 = edge_data['end']
            
            intersections = []
            
            # Check intersection with all other edges
            for other_name, other_data in self.edges.items():
                if other_name == edge_name:
                    continue
                
                # Skip adjacent edges
                idx_diff = abs(self.edges[edge_name]['index'] - self.edges[other_name]['index'])
                if idx_diff == 1 or idx_diff == len(self.vertices) - 1:
                    continue
                
                p3 = other_data['start']
                p4 = other_data['end']
                
                # Find intersection when extending the lines
                result = self.line_intersection(p1, p2, p3, p4)
                
                if result:
                    x, y, t1, t2 = result
                    intersection_point = (x, y)
                    
                    # Check if we need to extend the first line (t1 outside [0,1])
                    # The intersection should be on or near the second line segment
                    extension_needed = (t1 < -0.01 or t1 > 1.01)
                    on_second_segment = (t2 >= -0.01 and t2 <= 1.01)
                    
                    if extension_needed and on_second_segment:
                        # Calculate angle between edges
                        v1 = (p2[0] - p1[0], p2[1] - p1[1])
                        v2 = (p4[0] - p3[0], p4[1] - p3[1])
                        angle = self.calculate_angle(v1, v2)
                        
                        intersections.append({
                            'target_edge': other_name,
                            'intersection_point': intersection_point,
                            't1': t1,
                            't2': t2,
                            'angle': angle
                        })
                        
                        print(f"\n✓ {edge_name} can extend to intersect {other_name}")
                        print(f"  Intersection at: ({x:.7f}, {y:.7f})")
                        print(f"  Angle: {angle:.1f}° {'[~Perpendicular]' if 80 <= angle <= 100 else ''}")
                        print(f"  Extension parameter: t1={t1:.3f} (< 0 means extend from start, > 1 means extend from end)")
            
            if intersections:
                self.extension_analysis[edge_name] = intersections
        
        print("\n" + "="*70)
        print(f"SUMMARY: {len(self.extension_analysis)} edges can be extended")
        print("="*70 + "\n")
        
        if not self.extension_analysis:
            print("⚠ WARNING: No valid extensions found!")
            print("This could mean:")
            print("  - The polygon is convex (no edges point inward)")
            print("  - All potential intersections are outside the polygon")
            print("  - The polygon geometry doesn't allow internal extensions")
    
    def setup_plot(self):
        """Setup the matplotlib figure and controls."""
        self.fig = plt.figure(figsize=(16, 10))
        
        # Main plot for polygon
        self.ax_main = plt.subplot2grid((1, 4), (0, 0), colspan=3)
        
        # Control panel
        self.ax_controls = plt.subplot2grid((1, 4), (0, 3))
        self.ax_controls.axis('off')
        
        # Create checkbox options
        if self.extension_analysis:
            for edge_name in sorted(self.extension_analysis.keys()):
                for intersection in self.extension_analysis[edge_name]:
                    target = intersection['target_edge']
                    angle = intersection['angle']
                    perp = " [⊥]" if 80 <= angle <= 100 else ""
                    label = f"{edge_name}→{target} ({angle:.0f}°){perp}"
                    self.checkbox_labels.append(label)
                    self.checkbox_mapping[label] = (edge_name, intersection)
            
            # Create checkboxes
            n_options = len(self.checkbox_labels)
            checkbox_height = min(0.05, 0.9 / max(n_options, 1))
            
            rax = plt.axes([0.78, 0.15, 0.18, 0.7])
            self.check = CheckButtons(rax, self.checkbox_labels, 
                                     [False] * len(self.checkbox_labels))
            self.check.on_clicked(self.on_checkbox_clicked)
            
            # Add buttons
            ax_visualize = plt.axes([0.78, 0.88, 0.08, 0.05])
            self.btn_visualize = Button(ax_visualize, 'Visualize')
            self.btn_visualize.on_clicked(self.visualize_selected)
            
            ax_clear = plt.axes([0.88, 0.88, 0.08, 0.05])
            self.btn_clear = Button(ax_clear, 'Clear All')
            self.btn_clear.on_clicked(self.clear_all)
            
            ax_export = plt.axes([0.78, 0.05, 0.18, 0.05])
            self.btn_export = Button(ax_export, 'Export GeoJSON')
            self.btn_export.on_clicked(self.export_geojson)
        else:
            self.ax_controls.text(0.5, 0.5, 'No extensions\nfound', 
                                ha='center', va='center', fontsize=14, color='red')
        
        # Draw initial polygon
        self.draw_polygon()
        
        plt.tight_layout()
        plt.show()
    
    def on_checkbox_clicked(self, label):
        """Handle checkbox clicks."""
        # Update will happen when visualize is clicked
        pass
    
    def visualize_selected(self, event=None):
        """Visualize the selected extensions."""
        self.selected_extensions = []
        
        for i, label in enumerate(self.checkbox_labels):
            if self.check.get_status()[i]:
                edge_name, intersection = self.checkbox_mapping[label]
                self.selected_extensions.append((edge_name, intersection))
        
        self.draw_polygon()
    
    def clear_all(self, event=None):
        """Clear all selections."""
        for i in range(len(self.checkbox_labels)):
            if self.check.get_status()[i]:
                # Toggle off if it's on
                self.check.set_active(i)
        self.selected_extensions = []
        self.draw_polygon()
    
    def draw_polygon(self):
        """Draw the polygon and selected extensions."""
        self.ax_main.clear()
        
        # Draw polygon fill
        vertices_array = np.array(self.vertices)
        self.ax_main.fill(vertices_array[:, 0], vertices_array[:, 1], 
                         alpha=0.1, color='blue', label='Polygon Area')
        
        # Draw edges
        for edge_name, edge_data in self.edges.items():
            p1 = edge_data['start']
            p2 = edge_data['end']
            
            self.ax_main.plot([p1[0], p2[0]], [p1[1], p2[1]], 
                            'b-', linewidth=2.5, alpha=0.6)
            
            # Edge label
            mid_x = (p1[0] + p2[0]) / 2
            mid_y = (p1[1] + p2[1]) / 2
            self.ax_main.text(mid_x, mid_y, edge_name, fontsize=11, ha='center',
                            bbox=dict(boxstyle='round,pad=0.4', facecolor='lightblue', 
                                    alpha=0.8, edgecolor='blue'))
        
        # Draw vertices
        for i, v in enumerate(self.vertices):
            self.ax_main.plot(v[0], v[1], 'ro', markersize=10, zorder=5)
            
            # Adjust label position
            offset_y = 0.00015
            if i == 2:  # V3
                offset_y = -0.00020
            elif i == 4:  # V5
                offset_y = 0.00020
            
            self.ax_main.text(v[0], v[1] + offset_y, f'V{i+1}', 
                            fontsize=12, ha='center', fontweight='bold',
                            bbox=dict(boxstyle='round,pad=0.4', facecolor='yellow', 
                                    alpha=0.9, edgecolor='orange', linewidth=2))
        
        # Draw selected extensions
        colors = ['red', 'green', 'purple', 'orange', 'brown', 'pink', 'cyan', 'magenta']
        
        for idx, (edge_name, intersection) in enumerate(self.selected_extensions):
            edge_data = self.edges[edge_name]
            p1 = edge_data['start']
            p2 = edge_data['end']
            int_point = intersection['intersection_point']
            t1 = intersection['t1']
            target = intersection['target_edge']
            
            color = colors[idx % len(colors)]
            
            # Draw extension line
            if t1 < 0:
                # Extend from p1
                start_point = p1
            else:
                # Extend from p2
                start_point = p2
            
            self.ax_main.plot([start_point[0], int_point[0]], 
                            [start_point[1], int_point[1]], 
                            color=color, linewidth=3, linestyle='--', 
                            label=f'{edge_name}→{target}', zorder=4)
            
            # Draw intersection point
            self.ax_main.plot(int_point[0], int_point[1], 'o', 
                            color=color, markersize=12, zorder=6,
                            markeredgecolor='white', markeredgewidth=2)
            
            # Label intersection
            self.ax_main.text(int_point[0], int_point[1] + 0.00012, 
                            f'{edge_name}∩{target}', 
                            fontsize=10, ha='center', fontweight='bold',
                            color=color,
                            bbox=dict(boxstyle='round,pad=0.3', facecolor='white', 
                                    alpha=0.9, edgecolor=color, linewidth=2))
        
        self.ax_main.set_xlabel('Longitude', fontsize=12, fontweight='bold')
        self.ax_main.set_ylabel('Latitude', fontsize=12, fontweight='bold')
        self.ax_main.set_title(f'{self.polygon_name}: Edge Extension Analysis\n'
                              f'{len(self.selected_extensions)} extension(s) selected', 
                              fontsize=13, fontweight='bold')
        
        if self.selected_extensions:
            self.ax_main.legend(loc='best', fontsize=9, framealpha=0.9)
        
        self.ax_main.grid(True, alpha=0.3, linestyle='--')
        self.ax_main.set_aspect('equal')
        
        self.fig.canvas.draw()
    
    def export_geojson(self, event=None):
        """Export selected extensions as GeoJSON."""
        if not self.selected_extensions:
            print("\n⚠ No extensions selected to export!")
            return
        
        features = [
            # Original polygon
            {
                "type": "Feature",
                "properties": {"id": self.polygon_name, "type": "original_polygon"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[list(v) for v in self.vertices] + [list(self.vertices[0])]]
                }
            }
        ]
        
        # Add extension lines
        for edge_name, intersection in self.selected_extensions:
            edge_data = self.edges[edge_name]
            p1 = edge_data['start']
            p2 = edge_data['end']
            int_point = intersection['intersection_point']
            t1 = intersection['t1']
            target = intersection['target_edge']
            
            if t1 < 0:
                line_coords = [list(p1), list(int_point)]
            else:
                line_coords = [list(p2), list(int_point)]
            
            features.append({
                "type": "Feature",
                "properties": {
                    "id": f"{edge_name}_extended_to_{target}",
                    "type": "extension",
                    "source_edge": edge_name,
                    "target_edge": target,
                    "angle": round(intersection['angle'], 2)
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": line_coords
                }
            })
        
        output = {
            "type": "FeatureCollection",
            "features": features
        }
        
        filename = "/home/claude/polygon_extensions.geojson"
        with open(filename, 'w') as f:
            json.dump(output, f, indent=2)
        
        print(f"\n✓ GeoJSON exported successfully to: {filename}")
        print(f"  Exported {len(self.selected_extensions)} extension(s)")

# Main execution
if __name__ == "__main__":
    # GeoJSON data
    geojson_data = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": "Kapkolia GH 18"}, "geometry": {"type": "Polygon", "coordinates": [[[35.7476211, 0.0686487], [35.7484332, 0.0682052], [35.7486109, 0.0685414], [35.7485188, 0.0685899], [35.7486008, 0.0687426], [35.7485605, 0.0687621], [35.7486369, 0.0689017], [35.7485544, 0.0689431], [35.7486364, 0.0691011], [35.7485011, 0.0691646], [35.7486711, 0.069492], [35.7482149, 0.0697103], [35.7476211, 0.0686487]]]}}]}
    
    print("\n" + "="*70)
    print("POLYGON EDGE EXTENSION ANALYZER")
    print("="*70)
    print(f"\nAnalyzing polygon: {geojson_data['features'][0]['properties']['id']}")
    print(f"Vertices: {len(geojson_data['features'][0]['geometry']['coordinates'][0]) - 1}")
    
    analyzer = PolygonExtensionAnalyzer(geojson_data)