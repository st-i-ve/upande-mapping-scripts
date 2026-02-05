import json
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import Polygon as MplPolygon
import numpy as np
from matplotlib.lines import Line2D

def line_intersection(line1, line2):
    """
    Find the intersection point of two lines.
    Each line is defined by two points: (x1, y1), (x2, y2)
    Returns (x, y) intersection point or None if lines are parallel
    """
    x1, y1 = line1[0]
    x2, y2 = line1[1]
    x3, y3 = line2[0]
    x4, y4 = line2[1]
    
    # Calculate determinants
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    
    if abs(denom) < 1e-10:  # Lines are parallel or coincident
        return None
    
    # Calculate intersection point
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    
    return (px, py)

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

# Separate longitude (x) and latitude (y) coordinates
longitudes = [coord[0] for coord in coords]
latitudes = [coord[1] for coord in coords]

# Remove the last point since it's the same as the first (closed polygon)
num_vertices = len(coords) - 1

# Create edge labels
edge_labels = [chr(65 + i) for i in range(num_vertices)]  # A, B, C, ...

# Define line A (edge between vertex 1 and 2)
line_A = [(longitudes[0], latitudes[0]), (longitudes[1], latitudes[1])]

# Define line J (edge between vertex 10 and 11, but indices are 9 and 10)
# Note: Vertex 10 is index 9, Vertex 11 is index 10
line_J = [(longitudes[9], latitudes[9]), (longitudes[10], latitudes[10])]

# Extend line J past point 10 (index 9) by creating a longer line
# We'll extend it by continuing in the same direction
def extend_line(line, extension_factor=2.0, extend_from_end=True):
    """Extend a line segment in the same direction"""
    if extend_from_end:
        # Extend from the second point (point 10/11 for line J)
        x1, y1 = line[0]  # Vertex 11 (index 10)
        x2, y2 = line[1]  # Vertex 10 (index 9)
    else:
        # Extend from the first point
        x1, y1 = line[0]
        x2, y2 = line[1]
    
    # Calculate direction vector
    dx = x2 - x1
    dy = y2 - y1
    
    # Create extended point
    if extend_from_end:
        x_ext = x2 + dx * extension_factor
        y_ext = y2 + dy * extension_factor
        extended_line = [(x1, y1), (x_ext, y_ext)]
    else:
        x_ext = x1 - dx * extension_factor
        y_ext = y1 - dy * extension_factor
        extended_line = [(x_ext, y_ext), (x2, y2)]
    
    return extended_line, (x_ext, y_ext)

# Extend line J past point 10 (extend from point 10, which is the second point in line_J)
extended_line_J, extension_point = extend_line(line_J, extension_factor=5.0, extend_from_end=True)

# Find intersection of extended line J with line A
intersection_point = line_intersection(line_A, extended_line_J)

print("=" * 70)
print("LINE EXTENSION ANALYSIS")
print("=" * 70)
print(f"Line A: Vertex 1 → Vertex 2")
print(f"  Point 1: ({line_A[0][0]:.7f}, {line_A[0][1]:.7f})")
print(f"  Point 2: ({line_A[1][0]:.7f}, {line_A[1][1]:.7f})")
print()

print(f"Original Line J: Vertex 11 → Vertex 10")
print(f"  Vertex 11: ({line_J[0][0]:.7f}, {line_J[0][1]:.7f})")
print(f"  Vertex 10: ({line_J[1][0]:.7f}, {line_J[1][1]:.7f})")
print()

print(f"Extended Line J: Extended past Vertex 10")
print(f"  Extension point: ({extension_point[0]:.7f}, {extension_point[1]:.7f})")
print()

if intersection_point:
    print(f"INTERSECTION FOUND!")
    print(f"  Intersection point: ({intersection_point[0]:.7f}, {intersection_point[1]:.7f})")
    print(f"  Distance from Vertex 1: {np.sqrt((intersection_point[0]-line_A[0][0])**2 + (intersection_point[1]-line_A[0][1])**2):.7f}")
    print(f"  Distance from Vertex 2: {np.sqrt((intersection_point[0]-line_A[1][0])**2 + (intersection_point[1]-line_A[1][1])**2):.7f}")
else:
    print("No intersection found (lines are parallel)")
print("=" * 70)

# Create the plot
fig, ax = plt.subplots(figsize=(14, 12))

# Plot the original polygon with fill
polygon = MplPolygon(list(zip(longitudes, latitudes)), 
                     facecolor='lightblue', 
                     edgecolor='darkblue',
                     linewidth=2,
                     alpha=0.5,
                     label='Original Polygon')
ax.add_patch(polygon)

# Plot vertices as numbered points (1-indexed)
for i in range(num_vertices):
    ax.scatter(longitudes[i], latitudes[i], color='red', s=80, zorder=3)
    # Add vertex number (1-indexed)
    ax.text(longitudes[i], latitudes[i], f'{i+1}', 
            fontsize=10, fontweight='bold', 
            color='white', ha='center', va='center',
            bbox=dict(boxstyle="circle,pad=0.2", facecolor="red", alpha=0.8))

# Highlight line A (vertices 1-2)
ax.plot([line_A[0][0], line_A[1][0]], [line_A[0][1], line_A[1][1]], 
        color='green', linewidth=4, linestyle='-', alpha=0.7, label='Line A')

# Highlight original line J (vertices 11-10)
ax.plot([line_J[0][0], line_J[1][0]], [line_J[0][1], line_J[1][1]], 
        color='orange', linewidth=4, linestyle='-', alpha=0.7, label='Line J (original)')

# Plot extended line J
ax.plot([line_J[1][0], extension_point[0]], [line_J[1][1], extension_point[1]], 
        color='orange', linewidth=4, linestyle='--', alpha=0.5, label='Line J (extended)')

# Plot the intersection point if found
if intersection_point:
    ax.scatter([intersection_point[0]], [intersection_point[1]], 
               color='purple', s=200, zorder=5, marker='X', label='Intersection Point')
    
    # Add label for intersection point
    ax.text(intersection_point[0], intersection_point[1], 'INTERSECTION', 
            fontsize=10, fontweight='bold', color='purple', 
            ha='center', va='bottom',
            bbox=dict(boxstyle="round,pad=0.3", facecolor="white", edgecolor='purple'))
    
    # Draw the complete extended line up to intersection
    ax.plot([line_J[0][0], intersection_point[0]], [line_J[0][1], intersection_point[1]], 
            color='red', linewidth=3, linestyle=':', alpha=0.8, label='Line J to Intersection')

# Label edges with letters
for i in range(num_vertices):
    # Calculate midpoint of each edge
    x1, y1 = longitudes[i], latitudes[i]
    x2, y2 = longitudes[(i+1) % len(longitudes)], latitudes[(i+1) % len(latitudes)]
    
    mid_x = (x1 + x2) / 2
    mid_y = (y1 + y2) / 2
    
    # Calculate angle for text rotation
    dx = x2 - x1
    dy = y2 - y1
    angle = np.degrees(np.arctan2(dy, dx))
    
    # Add edge label with special highlighting for edges A and J
    if i == 0:  # Edge A
        label_color = 'green'
        bg_color = 'lightgreen'
    elif i == 9:  # Edge J (index 9 corresponds to edge between vertices 10 and 11)
        label_color = 'orange'
        bg_color = 'lightyellow'
    else:
        label_color = 'darkblue'
        bg_color = 'white'
    
    ax.text(mid_x, mid_y, edge_labels[i],
            fontsize=11, fontweight='bold',
            color=label_color, ha='center', va='center',
            rotation=angle,
            bbox=dict(boxstyle="round,pad=0.2", facecolor=bg_color, 
                     edgecolor=label_color, alpha=0.9))

# Add coordinate labels for key points
key_points = [
    (line_A[0], "V1 (Start of A)"),
    (line_A[1], "V2 (End of A)"),
    (line_J[0], "V11 (Start of J)"),
    (line_J[1], "V10 (End of J)"),
]

if intersection_point:
    key_points.append((intersection_point, "Intersection"))

for (x, y), label in key_points:
    ax.text(x, y + 0.00005, f"{label}\n({x:.6f}, {y:.6f})", 
            fontsize=8, ha='center', va='bottom',
            bbox=dict(boxstyle="round,pad=0.2", facecolor="white", alpha=0.8))

# Set plot properties
ax.set_xlabel('Longitude', fontsize=12)
ax.set_ylabel('Latitude', fontsize=12)
ax.set_title('Line Extension: Extending Line J to Intersect with Line A', 
             fontsize=16, fontweight='bold')

# Add grid
ax.grid(True, alpha=0.3, linestyle='--')

# Add legend
ax.legend(loc='upper right', fontsize=10)

# Set equal aspect ratio
ax.set_aspect('equal', adjustable='box')

# Adjust layout
plt.tight_layout()

# Show plot
plt.show()

# Create a zoomed-in view around the intersection area
if intersection_point:
    fig2, ax2 = plt.subplots(figsize=(12, 10))
    
    # Calculate bounds for zoomed view
    all_x = longitudes + [intersection_point[0]]
    all_y = latitudes + [intersection_point[1]]
    
    # Focus on area around intersection and lines A and J
    focus_points_x = [longitudes[0], longitudes[1], longitudes[9], longitudes[10], intersection_point[0]]
    focus_points_y = [latitudes[0], latitudes[1], latitudes[9], latitudes[10], intersection_point[1]]
    
    # Set zoom bounds with padding
    padding = 0.0002
    x_min, x_max = min(focus_points_x) - padding, max(focus_points_x) + padding
    y_min, y_max = min(focus_points_y) - padding, max(focus_points_y) + padding
    
    # Plot the relevant portion of polygon
    polygon_zoom = MplPolygon(list(zip(longitudes, latitudes)), 
                              facecolor='lightblue', 
                              edgecolor='darkblue',
                              linewidth=1,
                              alpha=0.3)
    ax2.add_patch(polygon_zoom)
    
    # Plot key vertices
    key_indices = [0, 1, 9, 10]  # Vertices 1, 2, 10, 11
    for idx in key_indices:
        ax2.scatter(longitudes[idx], latitudes[idx], color='red', s=100, zorder=3)
        ax2.text(longitudes[idx], latitudes[idx], f'{idx+1}', 
                fontsize=12, fontweight='bold', 
                color='white', ha='center', va='center',
                bbox=dict(boxstyle="circle,pad=0.25", facecolor="red", alpha=0.8))
    
    # Plot lines
    ax2.plot([line_A[0][0], line_A[1][0]], [line_A[0][1], line_A[1][1]], 
            color='green', linewidth=4, label='Line A (V1-V2)')
    
    ax2.plot([line_J[0][0], line_J[1][0]], [line_J[0][1], line_J[1][1]], 
            color='orange', linewidth=4, label='Line J (V11-V10)')
    
    ax2.plot([line_J[1][0], intersection_point[0]], [line_J[1][1], intersection_point[1]], 
            color='orange', linewidth=4, linestyle='--', label='Line J Extended')
    
    # Plot intersection point
    ax2.scatter([intersection_point[0]], [intersection_point[1]], 
               color='purple', s=300, zorder=5, marker='X', label='Intersection')
    
    ax2.text(intersection_point[0], intersection_point[1], 
            f'Intersection\n({intersection_point[0]:.7f},\n{intersection_point[1]:.7f})', 
            fontsize=10, fontweight='bold', color='purple', 
            ha='center', va='bottom')
    
    # Add labels for edges A and J
    ax2.text((line_A[0][0] + line_A[1][0])/2, (line_A[0][1] + line_A[1][1])/2, 'EDGE A',
            fontsize=12, fontweight='bold', color='green', ha='center', va='center',
            bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgreen"))
    
    ax2.text((line_J[0][0] + line_J[1][0])/2, (line_J[0][1] + line_J[1][1])/2, 'EDGE J',
            fontsize=12, fontweight='bold', color='orange', ha='center', va='center',
            bbox=dict(boxstyle="round,pad=0.3", facecolor="lightyellow"))
    
    # Set zoomed bounds
    ax2.set_xlim(x_min, x_max)
    ax2.set_ylim(y_min, y_max)
    
    ax2.set_xlabel('Longitude', fontsize=12)
    ax2.set_ylabel('Latitude', fontsize=12)
    ax2.set_title('Zoomed View: Intersection of Extended Line J with Line A', 
                 fontsize=14, fontweight='bold')
    ax2.grid(True, alpha=0.3)
    ax2.legend(loc='upper right')
    
    plt.tight_layout()
    plt.show()