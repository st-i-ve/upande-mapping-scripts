import json
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import Polygon as MplPolygon
import numpy as np
from matplotlib.lines import Line2D
from itertools import combinations
import math

def line_intersection(line1, line2, segment_intersection=True):
    """
    Find the intersection point of two lines.
    If segment_intersection=True, only return intersection if it lies on both segments.
    """
    x1, y1 = line1[0]
    x2, y2 = line1[1]
    x3, y3 = line2[0]
    x4, y4 = line2[1]
    
    # Calculate determinants
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    
    if abs(denom) < 1e-12:  # Lines are parallel or coincident
        return None
    
    # Calculate intersection point
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    
    # Check if intersection lies within both segments
    if segment_intersection:
        # Check if point is within bounds of line1 segment
        min_x1, max_x1 = min(x1, x2), max(x1, x2)
        min_y1, max_y1 = min(y1, y2), max(y1, y2)
        
        # Check if point is within bounds of line2 segment
        min_x2, max_x2 = min(x3, x4), max(x3, x4)
        min_y2, max_y2 = min(y3, y4), max(y3, y4)
        
        # Add small tolerance
        tol = 1e-9
        if not (min_x1 - tol <= px <= max_x1 + tol and 
                min_y1 - tol <= py <= max_y1 + tol and
                min_x2 - tol <= px <= max_x2 + tol and
                min_y2 - tol <= py <= max_y2 + tol):
            return None
    
    return (px, py)

def is_point_inside_polygon(point, polygon):
    """Check if a point is inside a polygon using ray casting algorithm"""
    x, y = point
    n = len(polygon)
    inside = False
    
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    
    return inside

def distance(point1, point2):
    """Calculate Euclidean distance between two points"""
    return math.sqrt((point2[0] - point1[0])**2 + (point2[1] - point1[1])**2)

def extend_line(line, extension_factor=5.0):
    """
    Extend a line segment in both directions.
    Returns the extended line.
    """
    x1, y1 = line[0]
    x2, y2 = line[1]
    
    # Calculate direction vector
    dx = x2 - x1
    dy = y2 - y1
    
    # Get current length
    length = math.sqrt(dx**2 + dy**2)
    
    if length == 0:
        return line  # Zero-length line
    
    # Normalize direction vector
    dx /= length
    dy /= length
    
    # Extend in both directions
    extended_start = (x1 - dx * length * extension_factor, y1 - dy * length * extension_factor)
    extended_end = (x2 + dx * length * extension_factor, y2 + dy * length * extension_factor)
    
    return [extended_start, extended_end]

def find_all_extended_intersections(polygon_vertices, extension_factor=5.0):
    """
    Extend all edges and find all intersections inside the polygon.
    Returns edges, extended edges, and intersections.
    """
    n = len(polygon_vertices)
    edges = []
    extended_edges = []
    
    # Create all edges and their extensions
    for i in range(n):
        p1 = polygon_vertices[i]
        p2 = polygon_vertices[(i + 1) % n]
        
        edge = {
            'index': i,
            'label': chr(65 + i),  # A, B, C, ...
            'vertices': (i, (i + 1) % n),
            'line': [p1, p2],
            'original_line': [p1, p2]
        }
        
        edges.append(edge)
        
        # Create extended edge
        extended_line = extend_line([p1, p2], extension_factor)
        extended_edge = edge.copy()
        extended_edge['extended_line'] = extended_line
        extended_edges.append(extended_edge)
    
    # Find all intersections between extended edges
    intersections = []
    
    for i in range(len(extended_edges)):
        for j in range(i + 1, len(extended_edges)):
            # Skip adjacent edges (they already intersect at vertices)
            edge_i = extended_edges[i]
            edge_j = extended_edges[j]
            
            # Skip if edges share a vertex (they're already connected)
            i_v1, i_v2 = edge_i['vertices']
            j_v1, j_v2 = edge_j['vertices']
            
            if len({i_v1, i_v2, j_v1, j_v2}) < 4:
                continue
            
            # Find intersection of extended lines
            intersection = line_intersection(
                edge_i['extended_line'], 
                edge_j['extended_line'], 
                segment_intersection=False
            )
            
            if intersection:
                # Check if intersection is inside polygon
                if is_point_inside_polygon(intersection, polygon_vertices):
                    # Calculate distances from intersection to original edge endpoints
                    dist_to_edge_i = min(
                        distance(intersection, edge_i['line'][0]),
                        distance(intersection, edge_i['line'][1])
                    )
                    
                    dist_to_edge_j = min(
                        distance(intersection, edge_j['line'][0]),
                        distance(intersection, edge_j['line'][1])
                    )
                    
                    # Check if this intersection creates a meaningful internal line
                    # (not too close to vertices or edges)
                    min_distance_threshold = 0.00005  # Adjust as needed
                    
                    if dist_to_edge_i > min_distance_threshold and dist_to_edge_j > min_distance_threshold:
                        intersections.append({
                            'edge1': edge_i,
                            'edge2': edge_j,
                            'intersection': intersection,
                            'dist_to_edge1': dist_to_edge_i,
                            'dist_to_edge2': dist_to_edge_j
                        })
    
    return edges, extended_edges, intersections

def create_internal_lines(intersections, polygon_vertices):
    """
    Create internal lines by connecting intersection points to nearest edge points
    that are inside the polygon.
    """
    internal_lines = []
    
    for inter in intersections:
        intersection_pt = inter['intersection']
        edge1 = inter['edge1']
        edge2 = inter['edge2']
        
        # For each edge, find which endpoint gives a line inside the polygon
        for edge in [edge1, edge2]:
            for endpoint in edge['line']:  # Try both endpoints
                # Create line from intersection to endpoint
                line = [intersection_pt, endpoint]
                
                # Check if the midpoint of this line is inside polygon
                midpoint = ((intersection_pt[0] + endpoint[0]) / 2, 
                           (intersection_pt[1] + endpoint[1]) / 2)
                
                if is_point_inside_polygon(midpoint, polygon_vertices):
                    internal_lines.append({
                        'type': 'edge_to_intersection',
                        'line': line,
                        'intersection': intersection_pt,
                        'edge_endpoint': endpoint,
                        'edge_label': edge['label']
                    })
        
        # Also check if we should connect two intersections
        # (We'll do this later after we have all intersections)
    
    return internal_lines

def find_intersection_clusters(intersections, cluster_threshold=0.0001):
    """
    Group intersections that are very close to each other.
    """
    if not intersections:
        return []
    
    clusters = []
    used = set()
    
    for i in range(len(intersections)):
        if i in used:
            continue
        
        cluster = [i]
        used.add(i)
        
        for j in range(i + 1, len(intersections)):
            if j in used:
                continue
            
            dist = distance(intersections[i]['intersection'], 
                           intersections[j]['intersection'])
            
            if dist < cluster_threshold:
                cluster.append(j)
                used.add(j)
        
        clusters.append(cluster)
    
    return clusters

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

# Extract coordinates from the first feature
coords = geojson_data['features'][0]['geometry']['coordinates'][0]

# Remove the last point since it's the same as the first (closed polygon)
polygon_vertices = coords[:-1]
longitudes = [coord[0] for coord in polygon_vertices]
latitudes = [coord[1] for coord in polygon_vertices]
num_vertices = len(polygon_vertices)

print("=" * 80)
print("COMPREHENSIVE EDGE EXTENSION ANALYSIS")
print("=" * 80)
print(f"Polygon: {geojson_data['features'][0]['properties']['id']}")
print(f"Number of vertices: {num_vertices}")
print()

# Find all extended intersections
edges, extended_edges, intersections = find_all_extended_intersections(polygon_vertices, extension_factor=3.0)

print(f"Analyzing {len(edges)} edges...")
print(f"Found {len(intersections)} intersection(s) inside polygon")
print()

if intersections:
    print("INTERSECTIONS FOUND:")
    print("-" * 100)
    print(f"{'ID':<4} {'Edge Pair':<12} {'Intersection Coordinates':<40} {'Dist1':<12} {'Dist2':<12}")
    print("-" * 100)
    
    for idx, inter in enumerate(intersections):
        edge_pair = f"{inter['edge1']['label']}-{inter['edge2']['label']}"
        coords = f"({inter['intersection'][0]:.7f}, {inter['intersection'][1]:.7f})"
        dist1 = f"{inter['dist_to_edge1']:.7f}"
        dist2 = f"{inter['dist_to_edge2']:.7f}"
        print(f"{idx+1:<4} {edge_pair:<12} {coords:<40} {dist1:<12} {dist2:<12}")
    
    print("-" * 100)
    
    # Find clusters of intersections (close points)
    clusters = find_intersection_clusters(intersections, cluster_threshold=0.00005)
    
    if clusters:
        print(f"\nFound {len(clusters)} cluster(s) of close intersections:")
        for i, cluster in enumerate(clusters):
            if len(cluster) > 1:
                print(f"  Cluster {i+1}: {len(cluster)} intersections")
                # Calculate centroid of cluster
                cluster_points = [intersections[idx]['intersection'] for idx in cluster]
                centroid_x = sum(p[0] for p in cluster_points) / len(cluster_points)
                centroid_y = sum(p[1] for p in cluster_points) / len(cluster_points)
                print(f"    Centroid: ({centroid_x:.7f}, {centroid_y:.7f})")
else:
    print("No intersections found inside polygon.")
    print("Try increasing the extension_factor or the polygon may not have intersecting extended edges.")

print("\n" + "=" * 80)

# Create internal lines from intersections to edges
internal_lines = create_internal_lines(intersections, polygon_vertices)

print(f"Created {len(internal_lines)} internal line(s) from intersections to edges")
print()

# Create visualization
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(20, 10))

# ============================================
# Plot 1: All Extended Edges and Intersections
# ============================================
ax1.set_title('All Extended Edges and Internal Intersections', fontsize=14, fontweight='bold')

# Plot original polygon
polygon1 = MplPolygon(list(zip(longitudes, latitudes)), 
                     facecolor='lightblue', 
                     edgecolor='darkblue',
                     linewidth=2,
                     alpha=0.3)
ax1.add_patch(polygon1)

# Plot original edges (thicker)
for edge in edges:
    x1, y1 = edge['line'][0]
    x2, y2 = edge['line'][1]
    ax1.plot([x1, x2], [y1, y2], 'darkblue', linewidth=2, alpha=0.7)

# Plot extended edges (thin, dashed)
for edge in extended_edges:
    x1, y1 = edge['extended_line'][0]
    x2, y2 = edge['extended_line'][1]
    ax1.plot([x1, x2], [y1, y2], 'gray', linewidth=1, linestyle='--', alpha=0.3)

# Plot vertices
for i in range(num_vertices):
    ax1.scatter(longitudes[i], latitudes[i], color='red', s=60, zorder=5)
    ax1.text(longitudes[i], latitudes[i], f'{i+1}', 
            fontsize=9, fontweight='bold', 
            color='white', ha='center', va='center',
            bbox=dict(boxstyle="circle,pad=0.15", facecolor="red", alpha=0.8))

# Label edges
for i in range(num_vertices):
    x1, y1 = polygon_vertices[i]
    x2, y2 = polygon_vertices[(i + 1) % num_vertices]
    mid_x = (x1 + x2) / 2
    mid_y = (y1 + y2) / 2
    
    dx = x2 - x1
    dy = y2 - y1
    angle = np.degrees(np.arctan2(dy, dx))
    
    edge_label = chr(65 + i)
    
    ax1.text(mid_x, mid_y, edge_label,
            fontsize=10, fontweight='bold',
            color='darkblue', ha='center', va='center',
            rotation=angle,
            bbox=dict(boxstyle="round,pad=0.15", facecolor="white", 
                     edgecolor='darkblue', alpha=0.8))

# Plot intersection points
if intersections:
    for idx, inter in enumerate(intersections):
        ix, iy = inter['intersection']
        ax1.scatter([ix], [iy], color='green', s=100, zorder=6, marker='X')
        
        # Label intersection
        ax1.text(ix, iy + 0.00003, f'I{idx+1}', 
                fontsize=9, fontweight='bold', color='darkgreen',
                ha='center', va='bottom',
                bbox=dict(boxstyle="round,pad=0.2", facecolor="lightgreen", edgecolor='darkgreen'))

ax1.set_xlabel('Longitude', fontsize=12)
ax1.set_ylabel('Latitude', fontsize=12)
ax1.grid(True, alpha=0.2, linestyle='--')
ax1.set_aspect('equal', adjustable='box')

# ============================================
# Plot 2: Internal Structure (Dotted Lines)
# ============================================
ax2.set_title('Internal Structure from Extended Edge Intersections', fontsize=14, fontweight='bold')

# Plot original polygon
polygon2 = MplPolygon(list(zip(longitudes, latitudes)), 
                     facecolor='lightblue', 
                     edgecolor='darkblue',
                     linewidth=2,
                     alpha=0.2)
ax2.add_patch(polygon2)

# Plot original edges (thin)
for edge in edges:
    x1, y1 = edge['line'][0]
    x2, y2 = edge['line'][1]
    ax2.plot([x1, x2], [y1, y2], 'darkblue', linewidth=1, alpha=0.5)

# Plot vertices
for i in range(num_vertices):
    ax2.scatter(longitudes[i], latitudes[i], color='red', s=50, zorder=5, alpha=0.7)

# Plot intersection points
if intersections:
    for idx, inter in enumerate(intersections):
        ix, iy = inter['intersection']
        ax2.scatter([ix], [iy], color='green', s=120, zorder=6, marker='X')
        
        # Draw dotted lines from intersection to the edges that created it
        edge1 = inter['edge1']
        edge2 = inter['edge2']
        
        # Draw line to nearest point on edge1
        for endpoint in edge1['line']:
            ax2.plot([ix, endpoint[0]], [iy, endpoint[1]], 
                    color='red', linewidth=1.5, linestyle=':', alpha=0.7)
        
        # Draw line to nearest point on edge2
        for endpoint in edge2['line']:
            ax2.plot([ix, endpoint[0]], [iy, endpoint[1]], 
                    color='blue', linewidth=1.5, linestyle=':', alpha=0.7)

# Plot internal lines (dotted lines inside polygon)
for line_data in internal_lines:
    x1, y1 = line_data['line'][0]
    x2, y2 = line_data['line'][1]
    
    # Use different colors based on type
    if line_data['type'] == 'edge_to_intersection':
        ax2.plot([x1, x2], [y1, y2], 
                color='purple', linewidth=2, linestyle=':', alpha=0.8)

# Label edges simply
for i in range(num_vertices):
    x1, y1 = polygon_vertices[i]
    x2, y2 = polygon_vertices[(i + 1) % num_vertices]
    mid_x = (x1 + x2) / 2
    mid_y = (y1 + y2) / 2
    
    edge_label = chr(65 + i)
    ax2.text(mid_x, mid_y, edge_label,
            fontsize=9, fontweight='bold',
            color='darkblue', ha='center', va='center',
            bbox=dict(boxstyle="round,pad=0.1", facecolor="white", alpha=0.7))

# Label intersection points
if intersections:
    for idx, inter in enumerate(intersections):
        ix, iy = inter['intersection']
        ax2.text(ix, iy + 0.00002, f'I{idx+1}', 
                fontsize=10, fontweight='bold', color='darkgreen',
                ha='center', va='bottom')

ax2.set_xlabel('Longitude', fontsize=12)
ax2.set_ylabel('Latitude', fontsize=12)
ax2.grid(True, alpha=0.2, linestyle='--')
ax2.set_aspect('equal', adjustable='box')

plt.tight_layout()
plt.show()

# ============================================
# Additional Analysis: Find potential subdivisions
# ============================================
if intersections:
    print("\n" + "=" * 80)
    print("POTENTIAL SUBDIVISION ANALYSIS")
    print("=" * 80)
    
    # Group intersections by which edges they connect to
    edge_intersections = {}
    for inter in intersections:
        for edge in [inter['edge1'], inter['edge2']]:
            edge_label = edge['label']
            if edge_label not in edge_intersections:
                edge_intersections[edge_label] = []
            edge_intersections[edge_label].append(inter)
    
    print("\nIntersections per edge:")
    for edge_label, inters in sorted(edge_intersections.items()):
        if len(inters) >= 2:
            print(f"  Edge {edge_label}: {len(inters)} intersections")
            
            # If an edge has 2+ intersections, it could be used for subdivision
            # Sort intersections by distance along the edge
            edge = next(e for e in edges if e['label'] == edge_label)
            edge_line = edge['line']
            
            # Project intersections onto the edge line
            intersection_points = [i['intersection'] for i in inters]
            
            print(f"    Could create {len(intersection_points)-1} subdivision segment(s) on edge {edge_label}")
    
    print("\nSuggested subdivision lines:")
    # Connect intersections that are close to form internal polygons
    for i in range(len(intersections)):
        for j in range(i + 1, len(intersections)):
            dist = distance(intersections[i]['intersection'], 
                           intersections[j]['intersection'])
            
            # If two intersections are reasonably close, they could be connected
            if dist < 0.0003:  # Adjust threshold as needed
                print(f"  Connect I{i+1} to I{j+1} (distance: {dist:.7f})")
                
                # Draw this connection on a new plot
                fig3, ax3 = plt.subplots(figsize=(12, 10))
                
                # Plot original polygon
                polygon3 = MplPolygon(list(zip(longitudes, latitudes)), 
                                     facecolor='lightblue', 
                                     edgecolor='darkblue',
                                     linewidth=2,
                                     alpha=0.2)
                ax3.add_patch(polygon3)
                
                # Plot original edges
                for edge in edges:
                    x1, y1 = edge['line'][0]
                    x2, y2 = edge['line'][1]
                    ax3.plot([x1, x2], [y1, y2], 'darkblue', linewidth=1, alpha=0.5)
                
                # Plot all intersections
                for idx, inter in enumerate(intersections):
                    ix, iy = inter['intersection']
                    color = 'red' if idx in [i, j] else 'green'
                    size = 150 if idx in [i, j] else 100
                    ax3.scatter([ix], [iy], color=color, s=size, zorder=6, marker='X')
                    ax3.text(ix, iy + 0.00002, f'I{idx+1}', 
                            fontsize=10, fontweight='bold', color=color,
                            ha='center', va='bottom')
                
                # Plot the suggested connection
                ix1, iy1 = intersections[i]['intersection']
                ix2, iy2 = intersections[j]['intersection']
                ax3.plot([ix1, ix2], [iy1, iy2], 
                        color='purple', linewidth=3, linestyle='-', alpha=0.8,
                        label=f'Potential subdivision line (dist: {dist:.7f})')
                
                ax3.set_xlabel('Longitude', fontsize=12)
                ax3.set_ylabel('Latitude', fontsize=12)
                ax3.set_title(f'Potential Subdivision: Connect I{i+1} to I{j+1}', 
                             fontsize=14, fontweight='bold')
                ax3.grid(True, alpha=0.2)
                ax3.set_aspect('equal', adjustable='box')
                ax3.legend()
                
                plt.tight_layout()
                plt.show()
                break  # Only show one at a time

print("\n" + "=" * 80)
print("ANALYSIS COMPLETE")
print("=" * 80)
print(f"Total edges analyzed: {len(edges)}")
print(f"Intersections found inside polygon: {len(intersections)}")
print(f"Internal lines created: {len(internal_lines)}")