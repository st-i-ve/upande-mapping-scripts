"""
Improved Edge Extension Analyzer with enhanced architecture and features
"""
import json
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import Polygon as MplPolygon
from matplotlib.collections import LineCollection
import numpy as np
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict
from enum import Enum
import warnings
warnings.filterwarnings('ignore')


class EdgeType(Enum):
    """Enumeration for edge types"""
    HORIZONTAL = "horizontal"
    VERTICAL = "vertical"


@dataclass
class Edge:
    """Data class for edge information"""
    index: int
    label: str
    vertices: Tuple[int, int]
    p1: Tuple[float, float]
    p2: Tuple[float, float]
    angle_from_equator: float
    visual_angle: float
    dx: float
    dy: float
    edge_type: EdgeType
    direction: str
    length: float
    bearing: float
    
    @property
    def is_vertical(self) -> bool:
        return self.edge_type == EdgeType.VERTICAL
    
    @property
    def is_horizontal(self) -> bool:
        return self.edge_type == EdgeType.HORIZONTAL
    
    @property
    def line(self) -> List[Tuple[float, float]]:
        return [self.p1, self.p2]


@dataclass
class Intersection:
    """Data class for intersection information"""
    edge1: Edge
    edge2: Edge
    point: Tuple[float, float]
    dist1: float
    dist2: float
    
    @property
    def intersection_type(self) -> str:
        """Get intersection type (V-V, H-H, or V-H)"""
        if self.edge1.is_vertical and self.edge2.is_vertical:
            return "V-V"
        elif self.edge1.is_horizontal and self.edge2.is_horizontal:
            return "H-H"
        else:
            return "V-H"


class GeometryUtils:
    """Utility class for geometric calculations"""
    
    @staticmethod
    def calculate_angle_from_equator(dx: float, dy: float) -> float:
        """
        Calculate the acute angle between a line and the equator (east-west direction)
        Returns angle in degrees (0-90)
        """
        # Normalize the edge vector
        length = np.sqrt(dx**2 + dy**2)
        if length == 0:
            return 0.0
        
        edge_norm = np.array([dx / length, dy / length])
        east_vec = np.array([1.0, 0.0])  # East direction along equator
        
        # Calculate dot product and angle
        dot_product = np.clip(np.dot(east_vec, edge_norm), -1.0, 1.0)
        angle = np.degrees(np.arccos(abs(dot_product)))
        
        # Return the acute angle (0-90 degrees)
        return min(angle, 180 - angle)
    
    @staticmethod
    def line_intersection(line1: List[Tuple[float, float]], 
                         line2: List[Tuple[float, float]], 
                         segment_only: bool = True) -> Optional[Tuple[float, float]]:
        """Find intersection point of two lines using numpy for efficiency"""
        p1, p2 = np.array(line1[0]), np.array(line1[1])
        p3, p4 = np.array(line2[0]), np.array(line2[1])
        
        d1 = p2 - p1
        d2 = p4 - p3
        
        cross = np.cross(d1, d2)
        
        if abs(cross) < 1e-12:
            return None
        
        t1 = np.cross(p3 - p1, d2) / cross
        t2 = np.cross(p3 - p1, d1) / cross
        
        if segment_only:
            if not (-1e-9 <= t1 <= 1 + 1e-9 and -1e-9 <= t2 <= 1 + 1e-9):
                return None
        
        intersection = p1 + t1 * d1
        return tuple(intersection)
    
    @staticmethod
    def point_in_polygon(point: Tuple[float, float], 
                        polygon_vertices: List[Tuple[float, float]]) -> bool:
        """Ray casting algorithm for point-in-polygon test"""
        x, y = point
        n = len(polygon_vertices)
        inside = False
        
        p1x, p1y = polygon_vertices[0]
        for i in range(n + 1):
            p2x, p2y = polygon_vertices[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        
        return inside
    
    @staticmethod
    def extend_line(line: List[Tuple[float, float]], 
                   factor: float) -> List[Tuple[float, float]]:
        """Extend a line segment in both directions"""
        p1, p2 = np.array(line[0]), np.array(line[1])
        direction = p2 - p1
        length = np.linalg.norm(direction)
        
        if length == 0:
            return line
        
        unit_dir = direction / length
        extension = unit_dir * length * factor
        
        extended_start = p1 - extension
        extended_end = p2 + extension
        
        return [tuple(extended_start), tuple(extended_end)]
    
    @staticmethod
    def min_distance_to_segment(point: Tuple[float, float], 
                               line: List[Tuple[float, float]]) -> float:
        """Calculate minimum distance from point to line segment endpoints"""
        p = np.array(point)
        p1, p2 = np.array(line[0]), np.array(line[1])
        return min(np.linalg.norm(p - p1), np.linalg.norm(p - p2))


class EdgeExtensionAnalyzer:
    """Main analyzer class with improved architecture"""
    
    def __init__(self, geojson_data: Dict):
        # Data
        self.geojson_data = geojson_data
        self.coords = geojson_data['features'][0]['geometry']['coordinates'][0]
        self.polygon_vertices = self.coords[:-1]
        
        # Settings
        self.angle_threshold = 45.0
        self.extension_factor = 3.0
        self.edge_type_filter = 'all'
        
        # Display settings
        self.show_extended_lines = True
        self.show_intersections = True
        self.show_internal_lines = True
        self.show_labels = True
        
        # Computed data
        self.edges: List[Edge] = []
        self.selected_edges: List[bool] = []
        self.intersections: List[Intersection] = []
        self.internal_lines: List[Dict] = []
        
        # GUI elements
        self.fig = None
        self.ax_plot = None
        
        # Initialize
        self._compute_edges()
        self.selected_edges = [True] * len(self.edges)
    
    def _compute_edges(self):
        """Compute edge information"""
        self.edges = []
        n = len(self.polygon_vertices)
        
        for i in range(n):
            p1 = self.polygon_vertices[i]
            p2 = self.polygon_vertices[(i + 1) % n]
            
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            
            # Calculate angles
            angle_from_equator = GeometryUtils.calculate_angle_from_equator(dx, dy)
            visual_angle = np.degrees(np.arctan2(dy, dx))
            bearing = np.degrees(np.arctan2(dx, dy))
            if bearing < 0:
                bearing += 360
            
            # Classify edge type
            edge_type = (EdgeType.HORIZONTAL if angle_from_equator <= self.angle_threshold 
                        else EdgeType.VERTICAL)
            
            # Determine direction arrow
            if abs(dx) > abs(dy):
                direction = "→" if dx > 0 else "←"
            else:
                direction = "↑" if dy > 0 else "↓"
            
            # Calculate length
            length = np.sqrt(dx**2 + dy**2)
            
            edge = Edge(
                index=i,
                label=chr(65 + i),
                vertices=(i, (i + 1) % n),
                p1=p1,
                p2=p2,
                angle_from_equator=angle_from_equator,
                visual_angle=visual_angle,
                dx=dx,
                dy=dy,
                edge_type=edge_type,
                direction=direction,
                length=length,
                bearing=bearing
            )
            
            self.edges.append(edge)
    
    def _get_filtered_edges(self) -> List[Edge]:
        """Get edges based on current filter settings"""
        filtered = []
        
        for i, edge in enumerate(self.edges):
            if not self.selected_edges[i]:
                continue
            
            if self.edge_type_filter == 'all':
                filtered.append(edge)
            elif self.edge_type_filter == 'vertical' and edge.is_vertical:
                filtered.append(edge)
            elif self.edge_type_filter == 'horizontal' and edge.is_horizontal:
                filtered.append(edge)
        
        return filtered
    
    def analyze(self):
        """Perform intersection analysis"""
        edges_to_extend = self._get_filtered_edges()
        self.intersections = []
        self.internal_lines = []
        
        # Extend edges
        extended_edges = [
            (edge, GeometryUtils.extend_line(edge.line, self.extension_factor))
            for edge in edges_to_extend
        ]
        
        # Find intersections
        n = len(extended_edges)
        for i in range(n):
            for j in range(i + 1, n):
                edge_i, ext_line_i = extended_edges[i]
                edge_j, ext_line_j = extended_edges[j]
                
                # Skip adjacent edges
                vertices_i = set(edge_i.vertices)
                vertices_j = set(edge_j.vertices)
                if len(vertices_i | vertices_j) < 4:
                    continue
                
                # Find intersection
                point = GeometryUtils.line_intersection(
                    ext_line_i, ext_line_j, segment_only=False
                )
                
                if point is None:
                    continue
                
                # Check if inside polygon
                if not GeometryUtils.point_in_polygon(point, self.polygon_vertices):
                    continue
                
                # Calculate distances
                dist1 = GeometryUtils.min_distance_to_segment(point, edge_i.line)
                dist2 = GeometryUtils.min_distance_to_segment(point, edge_j.line)
                
                # Only include if not too close to original edges
                if dist1 > 1e-5 and dist2 > 1e-5:
                    intersection = Intersection(
                        edge1=edge_i,
                        edge2=edge_j,
                        point=point,
                        dist1=dist1,
                        dist2=dist2
                    )
                    self.intersections.append(intersection)
                    
                    # Create internal lines
                    self._create_internal_lines(intersection)
    
    def _create_internal_lines(self, intersection: Intersection):
        """Create internal lines from intersection to edge endpoints"""
        point = intersection.point
        
        for edge, color in [(intersection.edge1, 'red' if intersection.edge1.is_vertical else 'blue'),
                           (intersection.edge2, 'red' if intersection.edge2.is_vertical else 'blue')]:
            for endpoint in edge.line:
                midpoint = ((point[0] + endpoint[0]) / 2, 
                           (point[1] + endpoint[1]) / 2)
                
                if GeometryUtils.point_in_polygon(midpoint, self.polygon_vertices):
                    self.internal_lines.append({
                        'line': [point, endpoint],
                        'color': color,
                        'edge_label': edge.label
                    })
    
    def update_angle_threshold(self, new_threshold: float):
        """Update angle threshold and recompute edges"""
        self.angle_threshold = new_threshold
        self._compute_edges()
        # Preserve selection state if possible
        while len(self.selected_edges) < len(self.edges):
            self.selected_edges.append(True)
    
    def export_results(self) -> Dict:
        """Export analysis results as structured data"""
        return {
            'polygon_id': self.geojson_data['features'][0]['properties']['id'],
            'settings': {
                'angle_threshold': self.angle_threshold,
                'extension_factor': self.extension_factor,
                'edge_type_filter': self.edge_type_filter
            },
            'edges': [
                {
                    'label': edge.label,
                    'type': edge.edge_type.value,
                    'angle_from_equator': edge.angle_from_equator,
                    'bearing': edge.bearing,
                    'length': edge.length,
                    'selected': self.selected_edges[edge.index]
                }
                for edge in self.edges
            ],
            'intersections': [
                {
                    'id': i + 1,
                    'type': inter.intersection_type,
                    'edges': [inter.edge1.label, inter.edge2.label],
                    'point': inter.point,
                    'distances': [inter.dist1, inter.dist2]
                }
                for i, inter in enumerate(self.intersections)
            ],
            'statistics': self.get_statistics()
        }
    
    def get_statistics(self) -> Dict:
        """Get analysis statistics"""
        filtered_edges = self._get_filtered_edges()
        vertical = sum(1 for e in filtered_edges if e.is_vertical)
        horizontal = sum(1 for e in filtered_edges if e.is_horizontal)
        
        inter_types = {'V-V': 0, 'H-H': 0, 'V-H': 0}
        for inter in self.intersections:
            inter_types[inter.intersection_type] += 1
        
        return {
            'total_edges': len(self.edges),
            'selected_edges': len(filtered_edges),
            'vertical_edges': vertical,
            'horizontal_edges': horizontal,
            'total_intersections': len(self.intersections),
            'intersection_types': inter_types
        }
    
    def create_gui(self):
        """Create interactive GUI"""
        from matplotlib.widgets import Button, CheckButtons, RadioButtons, Slider
        
        self.fig = plt.figure(figsize=(18, 12))
        
        # Main plot area
        self.ax_plot = plt.axes([0.3, 0.1, 0.65, 0.85])
        
        # Control panels
        ax_edge_select = plt.axes([0.02, 0.7, 0.25, 0.25])
        ax_edge_type = plt.axes([0.02, 0.5, 0.25, 0.15])
        ax_slider = plt.axes([0.02, 0.35, 0.25, 0.1])
        ax_angle_threshold = plt.axes([0.02, 0.2, 0.25, 0.1])
        ax_buttons = plt.axes([0.02, 0.05, 0.25, 0.1])
        ax_toggles = plt.axes([0.02, 0.42, 0.25, 0.05])
        ax_info = plt.axes([0.3, 0.02, 0.65, 0.06])
        
        # Edge selection checkboxes
        edge_labels = [
            f"{e.label} ({e.edge_type.value[0].upper()}:{e.direction} {e.angle_from_equator:.1f}°)"
            for e in self.edges
        ]
        self.checkboxes = CheckButtons(ax_edge_select, edge_labels, self.selected_edges)
        self.checkboxes.on_clicked(self._on_edge_select)
        
        # Edge type filter
        self.radio = RadioButtons(ax_edge_type, 
                                  ['All edges', 'Vertical only', 'Horizontal only'])
        self.radio.on_clicked(self._on_edge_type_change)
        
        # Sliders
        self.slider = Slider(ax_slider, 'Extension Factor', 1.0, 10.0, 
                           valinit=self.extension_factor, valstep=0.5)
        self.slider.on_changed(self._on_slider_change)
        
        self.slider_angle = Slider(ax_angle_threshold, 'Angle Threshold (°)', 1.0, 90.0, 
                                  valinit=self.angle_threshold, valstep=1.0)
        self.slider_angle.on_changed(self._on_angle_change)
        
        # Buttons
        self.btn_analyze = Button(ax_buttons, 'Analyze & Update')
        self.btn_analyze.on_clicked(self._on_analyze)
        
        # Toggles
        toggle_labels = ['Show Extended', 'Show Intersections', 'Show Internal', 'Show Labels']
        toggle_states = [self.show_extended_lines, self.show_intersections, 
                        self.show_internal_lines, self.show_labels]
        self.toggle_buttons = CheckButtons(ax_toggles, toggle_labels, toggle_states)
        self.toggle_buttons.on_clicked(self._on_toggle)
        
        # Info panel
        self.ax_info = ax_info
        self.ax_info.axis('off')
        
        # Initial render
        self.analyze()
        self._render()
    
    def _on_edge_select(self, label):
        """Handle edge selection"""
        edge_label = label[0]
        index = ord(edge_label) - 65
        self.selected_edges[index] = not self.selected_edges[index]
    
    def _on_edge_type_change(self, label):
        """Handle edge type filter change"""
        filters = {'All edges': 'all', 'Vertical only': 'vertical', 'Horizontal only': 'horizontal'}
        self.edge_type_filter = filters[label]
    
    def _on_slider_change(self, val):
        """Handle extension factor change"""
        self.extension_factor = val
    
    def _on_angle_change(self, val):
        """Handle angle threshold change"""
        self.update_angle_threshold(val)
        # Update checkboxes... (implementation similar to original)
    
    def _on_toggle(self, label):
        """Handle display toggles"""
        toggles = {
            'Show Extended': 'show_extended_lines',
            'Show Intersections': 'show_intersections',
            'Show Internal': 'show_internal_lines',
            'Show Labels': 'show_labels'
        }
        attr = toggles.get(label)
        if attr:
            setattr(self, attr, not getattr(self, attr))
    
    def _on_analyze(self, event):
        """Handle analyze button click"""
        self.analyze()
        self._render()
    
    def _render(self):
        """Render the visualization"""
        self.ax_plot.clear()
        
        # Plot polygon
        lons = [v[0] for v in self.polygon_vertices]
        lats = [v[1] for v in self.polygon_vertices]
        polygon = MplPolygon(list(zip(lons, lats)), 
                           facecolor='lightblue', edgecolor='darkblue',
                           linewidth=2, alpha=0.2)
        self.ax_plot.add_patch(polygon)
        
        # Plot edges
        self._render_edges()
        
        # Plot vertices
        self._render_vertices()
        
        # Plot extended lines
        if self.show_extended_lines:
            self._render_extended_lines()
        
        # Plot intersections
        if self.show_intersections:
            self._render_intersections()
        
        # Plot internal lines
        if self.show_internal_lines:
            self._render_internal_lines()
        
        # Finalize plot
        self._finalize_plot()
        
        # Update info panel
        self._update_info_panel()
        
        self.fig.canvas.draw_idle()
    
    def _render_edges(self):
        """Render polygon edges with type-based styling"""
        for edge in self.edges:
            color = 'red' if edge.is_vertical else 'green'
            linewidth = 3.0 if self.selected_edges[edge.index] else 1.5
            
            self.ax_plot.plot([edge.p1[0], edge.p2[0]], 
                            [edge.p1[1], edge.p2[1]],
                            color=color, linewidth=linewidth, alpha=0.8)
            
            if self.show_labels:
                mid_x = (edge.p1[0] + edge.p2[0]) / 2
                mid_y = (edge.p1[1] + edge.p2[1]) / 2
                angle = edge.visual_angle
                
                # Adjust angle for readability
                if angle > 90:
                    angle -= 180
                elif angle < -90:
                    angle += 180
                
                label_text = f"{edge.label} ({edge.edge_type.value[0].upper()}: {edge.angle_from_equator:.1f}°)"
                self.ax_plot.text(mid_x, mid_y, label_text,
                                fontsize=8, fontweight='bold', color=color,
                                ha='center', va='center', rotation=angle,
                                bbox=dict(boxstyle="round,pad=0.1", facecolor="white", 
                                         edgecolor=color, alpha=0.7))
    
    def _render_vertices(self):
        """Render polygon vertices"""
        lons = [v[0] for v in self.polygon_vertices]
        lats = [v[1] for v in self.polygon_vertices]
        
        self.ax_plot.scatter(lons, lats, color='black', s=50, zorder=5, alpha=0.7)
        
        if self.show_labels:
            for i, (lon, lat) in enumerate(zip(lons, lats)):
                self.ax_plot.text(lon, lat, f'V{i+1}', 
                                fontsize=8, fontweight='bold', color='white',
                                ha='center', va='center',
                                bbox=dict(boxstyle="circle,pad=0.1", 
                                         facecolor="black", alpha=0.8))
    
    def _render_extended_lines(self):
        """Render extended edge lines"""
        edges_to_extend = self._get_filtered_edges()
        
        for edge in edges_to_extend:
            extended = GeometryUtils.extend_line(edge.line, self.extension_factor)
            color = 'red' if edge.is_vertical else 'green'
            
            self.ax_plot.plot([extended[0][0], extended[1][0]], 
                            [extended[0][1], extended[1][1]],
                            color=color, linewidth=1, linestyle=':', alpha=0.5)
    
    def _render_intersections(self):
        """Render intersection points"""
        colors = {'V-V': 'darkred', 'H-H': 'darkgreen', 'V-H': 'purple'}
        markers = {'V-V': 's', 'H-H': 's', 'V-H': 'o'}
        sizes = {'V-V': 80, 'H-H': 80, 'V-H': 100}
        
        for idx, inter in enumerate(self.intersections):
            itype = inter.intersection_type
            
            self.ax_plot.scatter([inter.point[0]], [inter.point[1]], 
                                color=colors[itype], s=sizes[itype], 
                                zorder=6, marker=markers[itype])
            
            if self.show_labels:
                label = f'I{idx+1}\n{inter.edge1.label}({inter.edge1.edge_type.value[0]})-{inter.edge2.label}({inter.edge2.edge_type.value[0]})'
                self.ax_plot.text(inter.point[0], inter.point[1] + 0.00003, label,
                                fontsize=8, fontweight='bold', color=colors[itype],
                                ha='center', va='bottom',
                                bbox=dict(boxstyle="round,pad=0.15", facecolor="white", 
                                         edgecolor=colors[itype], alpha=0.8))
    
    def _render_internal_lines(self):
        """Render internal connection lines"""
        for line_data in self.internal_lines:
            p1, p2 = line_data['line']
            self.ax_plot.plot([p1[0], p2[0]], [p1[1], p2[1]],
                            color=line_data['color'], linewidth=2, 
                            linestyle='--', alpha=0.6)
    
    def _finalize_plot(self):
        """Add labels, legend, and formatting"""
        self.ax_plot.set_xlabel('Longitude', fontsize=12)
        self.ax_plot.set_ylabel('Latitude', fontsize=12)
        self.ax_plot.set_title('Edge Extension Analyzer - Equatorial Angle Classification', 
                              fontsize=14, fontweight='bold')
        
        # Legend
        legend_elements = [
            patches.Patch(facecolor='red', alpha=0.8, 
                         label=f'Vertical (> {self.angle_threshold}°)'),
            patches.Patch(facecolor='green', alpha=0.8, 
                         label=f'Horizontal (≤ {self.angle_threshold}°)'),
            patches.Patch(facecolor='purple', alpha=0.8, label='V-H Intersections'),
            patches.Patch(facecolor='darkred', alpha=0.8, label='V-V Intersections'),
            patches.Patch(facecolor='darkgreen', alpha=0.8, label='H-H Intersections'),
        ]
        
        self.ax_plot.legend(handles=legend_elements, loc='upper right', fontsize=9)
        self.ax_plot.grid(True, alpha=0.2, linestyle='--')
        self.ax_plot.set_aspect('equal', adjustable='box')
    
    def _update_info_panel(self):
        """Update information panel"""
        self.ax_info.clear()
        self.ax_info.axis('off')
        
        stats = self.get_statistics()
        inter_types = stats['intersection_types']
        
        info_text = (
            f"Polygon: {self.geojson_data['features'][0]['properties']['id']} | "
            f"Filter: {self.edge_type_filter} | "
            f"Threshold: ≤{self.angle_threshold}° = H, >{self.angle_threshold}° = V | "
            f"Extension: {self.extension_factor}x\n"
            f"Edges: {stats['selected_edges']}/{stats['total_edges']} "
            f"(V:{stats['vertical_edges']} H:{stats['horizontal_edges']}) | "
            f"Intersections: {stats['total_intersections']} "
            f"(V-V:{inter_types['V-V']} H-H:{inter_types['H-H']} V-H:{inter_types['V-H']})"
        )
        
        self.ax_info.text(0.02, 0.5, info_text, fontsize=9, verticalalignment='center',
                         bbox=dict(boxstyle="round,pad=0.3", facecolor="lightblue", alpha=0.8))
    
    def run(self):
        """Run the application"""
        self.create_gui()
        plt.show()
    
    def print_report(self):
        """Print detailed analysis report"""
        print("=" * 80)
        print("EDGE EXTENSION ANALYZER - REPORT")
        print("=" * 80)
        
        stats = self.get_statistics()
        
        print(f"\nPolygon: {self.geojson_data['features'][0]['properties']['id']}")
        print(f"Threshold: ≤{self.angle_threshold}° = Horizontal, >{self.angle_threshold}° = Vertical")
        print("\n" + "-" * 80)
        print(f"{'Edge':<6} {'Type':<12} {'Dir':<4} {'Angle':<10} {'Bearing':<10} {'Length':<12}")
        print("-" * 80)
        
        for edge in self.edges:
            print(f"{edge.label:<6} {edge.edge_type.value:<12} {edge.direction:<4} "
                  f"{edge.angle_from_equator:<10.2f} {edge.bearing:<10.2f} {edge.length:<12.6f}")
        
        print("-" * 80)
        print(f"\nTotal edges: {stats['total_edges']}")
        print(f"Horizontal edges: {stats['horizontal_edges']}")
        print(f"Vertical edges: {stats['vertical_edges']}")
        print(f"Total intersections: {stats['total_intersections']}")
        print(f"  V-V: {stats['intersection_types']['V-V']}")
        print(f"  H-H: {stats['intersection_types']['H-H']}")
        print(f"  V-H: {stats['intersection_types']['V-H']}")
        print("=" * 80)


# Example usage
if __name__ == "__main__":
    geojson_data = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"id": "Kapkolia GH 18"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [35.7476211, 0.0686487], [35.7484332, 0.0682052],
                    [35.7486109, 0.0685414], [35.7485188, 0.0685899],
                    [35.7486008, 0.0687426], [35.7485605, 0.0687621],
                    [35.7486369, 0.0689017], [35.7485544, 0.0689431],
                    [35.7486364, 0.0691011], [35.7485011, 0.0691646],
                    [35.7486711, 0.069492], [35.7482149, 0.0697103],
                    [35.7476211, 0.0686487]
                ]]
            }
        }]
    }
    
    analyzer = EdgeExtensionAnalyzer(geojson_data)
    analyzer.print_report()
    analyzer.run()