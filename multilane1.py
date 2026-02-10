import matplotlib.pyplot as plt
import numpy as np

# GeoJSON coordinates
geojson = {
    "type": "FeatureCollection",
    "features": [{
        "type": "Feature",
        "properties": {"id": "Kaptumbo GH 03 - KR"},
        "geometry": {
            "coordinates": [[[35.7486266142804, 0.09298520732512827],
                            [35.74880627366329, 0.09244952638019299],
                            [35.749824892916195, 0.09278247269176632],
                            [35.749645233533215, 0.09332145012884041],
                            [35.7486266142804, 0.09298520732512827]]],
            "type": "Polygon"
        }
    }]
}

# Extract coordinates
coords = geojson["features"][0]["geometry"]["coordinates"][0]
polygon_name = geojson["features"][0]["properties"]["id"]

# Separate x and y coordinates
x_coords = [point[0] for point in coords]
y_coords = [point[1] for point in coords]

# Create figure
fig, ax = plt.subplots(figsize=(12, 10))

# Plot polygon
ax.plot(x_coords, y_coords, 'b-', linewidth=2)
ax.fill(x_coords, y_coords, alpha=0.3, color='lightblue')

# Plot vertices
ax.plot(x_coords[:-1], y_coords[:-1], 'ro', markersize=8)

# Label vertices
for i, (x, y) in enumerate(coords[:-1]):
    ax.annotate(f'V{i+1}', (x, y), xytext=(5, 5), 
                textcoords='offset points', fontsize=10, fontweight='bold')

# Function to determine edge position based on slope and midpoint
def get_edge_label(p1, p2, all_coords):
    """Determine edge position label based on geometric analysis"""
    x1, y1 = p1
    x2, y2 = p2
    
    # Calculate midpoint
    mid_x = (x1 + x2) / 2
    mid_y = (y1 + y2) / 2
    
    # Get all y and x values (excluding the closing point)
    all_x = [c[0] for c in all_coords[:-1]]
    all_y = [c[1] for c in all_coords[:-1]]
    
    min_x, max_x = min(all_x), max(all_x)
    min_y, max_y = min(all_y), max(all_y)
    
    # Calculate relative position
    x_range = max_x - min_x
    y_range = max_y - min_y
    
    x_rel = (mid_x - min_x) / x_range if x_range > 0 else 0.5
    y_rel = (mid_y - min_y) / y_range if y_range > 0 else 0.5
    
    # Determine primary and secondary directions
    labels = []
    
    # Vertical position
    if y_rel > 0.66:
        labels.append("Top")
    elif y_rel < 0.33:
        labels.append("Bottom")
    
    # Horizontal position
    if x_rel > 0.66:
        labels.append("Right")
    elif x_rel < 0.33:
        labels.append("Left")
    
    # If no clear position, use center or analyze slope
    if not labels:
        dx = x2 - x1
        dy = y2 - y1
        
        if abs(dx) > abs(dy):
            labels.append("Left" if dx < 0 else "Right")
        else:
            labels.append("Bottom" if dy < 0 else "Top")
    
    return " ".join(labels) if labels else "Edge"

# Label edges
for i in range(len(coords) - 1):
    p1 = coords[i]
    p2 = coords[i + 1]
    
    # Calculate midpoint
    mid_x = (p1[0] + p2[0]) / 2
    mid_y = (p1[1] + p2[1]) / 2
    
    # Get edge label
    edge_label = get_edge_label(p1, p2, coords)
    
    # Add edge label
    ax.annotate(edge_label, (mid_x, mid_y), 
                bbox=dict(boxstyle='round,pad=0.5', facecolor='yellow', alpha=0.7),
                fontsize=11, fontweight='bold', ha='center')
    
    # Add edge length
    length = np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
    ax.annotate(f'L={length:.6f}', (mid_x, mid_y), 
                xytext=(0, -20), textcoords='offset points',
                fontsize=8, style='italic', ha='center')

# Set labels and title
ax.set_xlabel('Longitude', fontsize=12)
ax.set_ylabel('Latitude', fontsize=12)
ax.set_title(f'Polygon: {polygon_name}\nEdges labeled by position', fontsize=14, fontweight='bold')
ax.grid(True, alpha=0.3)
ax.set_aspect('equal', adjustable='box')

# Add legend
legend_text = "Edge Labels:\n"
for i in range(len(coords) - 1):
    edge_label = get_edge_label(coords[i], coords[i+1], coords)
    legend_text += f"Edge {i+1} (V{i+1}→V{i+2}): {edge_label}\n"

ax.text(0.02, 0.98, legend_text, transform=ax.transAxes,
        fontsize=9, verticalalignment='top',
        bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

plt.tight_layout()
plt.savefig('/mnt/user-data/outputs/polygon_diagram.png', dpi=300, bbox_inches='tight')
print(f"Diagram saved as 'polygon_diagram.png'")
print(f"\nPolygon: {polygon_name}")
print(f"Number of vertices: {len(coords)-1}")
print("\nEdge positions:")
for i in range(len(coords) - 1):
    edge_label = get_edge_label(coords[i], coords[i+1], coords)
    print(f"  Edge {i+1}: {edge_label}")

plt.show()