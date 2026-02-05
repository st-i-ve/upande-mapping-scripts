import geopandas as gpd
from shapely.geometry import Polygon, LineString, MultiPolygon, Point
from shapely.affinity import translate, rotate
from shapely.ops import substring, unary_union
import os
import pyproj
import numpy as np
import json
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon
from matplotlib.collections import PatchCollection, LineCollection
import tkinter as tk
from tkinter import ttk
from tkinter import filedialog, messagebox, scrolledtext
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk
from matplotlib.figure import Figure
import matplotlib.patches as mpatches


class PolygonSectionManager:
    """Manages polygon decomposition into rectangular sections."""
    
    def __init__(self, polygon, min_section_area=10):
        self.original_polygon = polygon
        self.min_section_area = min_section_area
        self.sections = []
        self.section_colors = []
        
    def decompose_polygon(self, num_divisions_x=3, num_divisions_y=3):
        """
        Decompose polygon into grid sections based on bounding box.
        Returns list of section polygons that intersect with original polygon.
        """
        bounds = self.original_polygon.bounds  # (minx, miny, maxx, maxy)
        minx, miny, maxx, maxy = bounds
        
        width = maxx - minx
        height = maxy - miny
        
        dx = width / num_divisions_x
        dy = height / num_divisions_y
        
        sections = []
        
        for i in range(num_divisions_x):
            for j in range(num_divisions_y):
                # Create grid cell
                cell_minx = minx + i * dx
                cell_miny = miny + j * dy
                cell_maxx = cell_minx + dx
                cell_maxy = cell_miny + dy
                
                cell = Polygon([
                    (cell_minx, cell_miny),
                    (cell_maxx, cell_miny),
                    (cell_maxx, cell_maxy),
                    (cell_minx, cell_maxy)
                ])
                
                # Intersect with original polygon
                intersection = self.original_polygon.intersection(cell)
                
                if not intersection.is_empty and intersection.area > self.min_section_area:
                    if intersection.geom_type == 'Polygon':
                        sections.append({
                            'id': len(sections),
                            'geometry': intersection,
                            'grid_pos': (i, j),
                            'selected': False
                        })
                    elif intersection.geom_type == 'MultiPolygon':
                        # Take the largest polygon from multipolygon
                        largest = max(intersection.geoms, key=lambda p: p.area)
                        if largest.area > self.min_section_area:
                            sections.append({
                                'id': len(sections),
                                'geometry': largest,
                                'grid_pos': (i, j),
                                'selected': False
                            })
        
        self.sections = sections
        self._generate_colors()
        return sections
    
    def _generate_colors(self):
        """Generate distinct colors for each section."""
        import matplotlib.cm as cm
        cmap = cm.get_cmap('tab20')
        self.section_colors = [cmap(i % 20) for i in range(len(self.sections))]
    
    def get_selected_sections(self):
        """Return list of selected section geometries."""
        return [s['geometry'] for s in self.sections if s['selected']]
    
    def combine_sections(self, section_ids):
        """Combine multiple sections into a single polygon."""
        geometries = [self.sections[sid]['geometry'] for sid in section_ids]
        if not geometries:
            return None
        return unary_union(geometries)


class InteractiveBlockDesigner:
    """Interactive UI for selecting sections and creating blocks."""
    
    def __init__(self, parent, polygon, section_manager):
        self.parent = parent
        self.polygon = polygon
        self.section_manager = section_manager
        self.blocks = []  # List of {sections: [], orientation: str, num_beds: int}
        self.current_selection = []
        
        self.setup_ui()
        
    def setup_ui(self):
        """Create the interactive design interface."""
        self.window = tk.Toplevel(self.parent)
        self.window.title("Block Designer - Select Sections")
        self.window.geometry("1200x800")
        
        # Main container
        main_frame = ttk.Frame(self.window)
        main_frame.pack(fill="both", expand=True, padx=5, pady=5)
        
        # Left panel - Canvas for polygon visualization
        left_frame = ttk.Frame(main_frame)
        left_frame.pack(side="left", fill="both", expand=True)
        
        ttk.Label(left_frame, text="Click sections to select, then create blocks", 
                 font=('Arial', 11, 'bold')).pack(pady=5)
        
        # Matplotlib figure
        self.fig = Figure(figsize=(8, 8))
        self.ax = self.fig.add_subplot(111)
        
        self.canvas = FigureCanvasTkAgg(self.fig, left_frame)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)
        
        # Toolbar
        toolbar = NavigationToolbar2Tk(self.canvas, left_frame)
        toolbar.update()
        
        # Right panel - Controls
        right_frame = ttk.Frame(main_frame, width=300)
        right_frame.pack(side="right", fill="both", padx=5)
        right_frame.pack_propagate(False)
        
        # Section info
        ttk.Label(right_frame, text="Selected Sections:", 
                 font=('Arial', 10, 'bold')).pack(pady=(5, 2))
        
        self.selection_listbox = tk.Listbox(right_frame, height=6)
        self.selection_listbox.pack(fill="x", padx=5, pady=5)
        
        ttk.Button(right_frame, text="Clear Selection", 
                  command=self.clear_selection).pack(pady=2)
        
        ttk.Separator(right_frame, orient="horizontal").pack(fill="x", pady=10)
        
        # Block creation
        ttk.Label(right_frame, text="Create Block from Selection:", 
                 font=('Arial', 10, 'bold')).pack(pady=5)
        
        ttk.Label(right_frame, text="Number of Beds:").pack()
        self.block_beds_var = tk.StringVar(value="20")
        ttk.Entry(right_frame, textvariable=self.block_beds_var, width=15).pack()
        
        ttk.Label(right_frame, text="Orientation:").pack(pady=(8, 0))
        self.block_orientation_var = tk.StringVar(value="auto")
        orientations = ["auto", "horizontal", "vertical", 
                       "north", "south", "east", "west"]
        ttk.Combobox(right_frame, textvariable=self.block_orientation_var,
                    values=orientations, state="readonly", width=13).pack()
        
        ttk.Label(right_frame, text="Bed Numbering:").pack(pady=(8, 0))
        self.block_numbering_var = tk.StringVar(value="left_to_right")
        numberings = ["left_to_right", "right_to_left", 
                     "bottom_to_top", "top_to_bottom",
                     "north", "south", "east", "west"]
        ttk.Combobox(right_frame, textvariable=self.block_numbering_var,
                    values=numberings, state="readonly", width=13).pack()
        
        ttk.Button(right_frame, text="Create Block", 
                  command=self.create_block_from_selection,
                  style="Accent.TButton").pack(pady=10)
        
        ttk.Separator(right_frame, orient="horizontal").pack(fill="x", pady=10)
        
        # Blocks list
        ttk.Label(right_frame, text="Created Blocks:", 
                 font=('Arial', 10, 'bold')).pack(pady=5)
        
        self.blocks_listbox = tk.Listbox(right_frame, height=8)
        self.blocks_listbox.pack(fill="x", padx=5, pady=5)
        
        blocks_buttons_frame = ttk.Frame(right_frame)
        blocks_buttons_frame.pack(fill="x", pady=5)
        
        ttk.Button(blocks_buttons_frame, text="Remove Block", 
                  command=self.remove_selected_block).pack(side="left", padx=2)
        ttk.Button(blocks_buttons_frame, text="Edit Block", 
                  command=self.edit_selected_block).pack(side="left", padx=2)
        
        ttk.Separator(right_frame, orient="horizontal").pack(fill="x", pady=10)
        
        # Bottom buttons
        button_frame = ttk.Frame(right_frame)
        button_frame.pack(side="bottom", pady=10)
        
        ttk.Button(button_frame, text="Generate Beds", 
                  command=self.confirm_blocks).pack(side="left", padx=5)
        ttk.Button(button_frame, text="Cancel", 
                  command=self.window.destroy).pack(side="left", padx=5)
        
        # Mouse click handler
        self.canvas.mpl_connect('button_press_event', self.on_canvas_click)
        
        # Initial draw
        self.draw_sections()
        
    def draw_sections(self):
        """Draw all sections and highlight selected ones."""
        self.ax.clear()
        
        # Draw original polygon outline
        if self.polygon.geom_type == 'Polygon':
            x, y = self.polygon.exterior.xy
            self.ax.plot(x, y, 'k-', linewidth=2, label='Greenhouse')
        
        # Draw sections
        for idx, section in enumerate(self.section_manager.sections):
            geom = section['geometry']
            color = self.section_manager.section_colors[idx]
            
            if section['selected']:
                alpha = 0.6
                edgecolor = 'red'
                linewidth = 2.5
            else:
                alpha = 0.3
                edgecolor = 'gray'
                linewidth = 1
            
            if geom.geom_type == 'Polygon':
                x, y = geom.exterior.xy
                self.ax.fill(x, y, color=color, alpha=alpha, edgecolor=edgecolor, 
                           linewidth=linewidth)
                
                # Add section number
                centroid = geom.centroid
                self.ax.text(centroid.x, centroid.y, str(idx), 
                           ha='center', va='center', fontsize=10, fontweight='bold',
                           bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.8))
        
        # Draw existing blocks
        for block_idx, block in enumerate(self.blocks):
            block_geom = self.section_manager.combine_sections(block['sections'])
            if block_geom:
                x, y = block_geom.exterior.xy
                self.ax.plot(x, y, 'b-', linewidth=3, alpha=0.7)
                
                centroid = block_geom.centroid
                self.ax.text(centroid.x, centroid.y, f"Block {block_idx+1}", 
                           ha='center', va='center', fontsize=9, 
                           bbox=dict(boxstyle='round,pad=0.4', facecolor='lightblue', alpha=0.9))
        
        self.ax.set_aspect('equal')
        self.ax.set_title('Click sections to select for block creation', fontsize=12)
        self.ax.grid(True, alpha=0.3)
        self.canvas.draw()
    
    def on_canvas_click(self, event):
        """Handle mouse clicks on canvas to select sections."""
        if event.inaxes != self.ax:
            return
        
        click_point = Point(event.xdata, event.ydata)
        
        # Find which section was clicked
        for section in self.section_manager.sections:
            if section['geometry'].contains(click_point):
                section['selected'] = not section['selected']
                self.update_selection_list()
                self.draw_sections()
                break
    
    def update_selection_list(self):
        """Update the listbox showing selected sections."""
        self.selection_listbox.delete(0, tk.END)
        self.current_selection = [i for i, s in enumerate(self.section_manager.sections) 
                                 if s['selected']]
        for idx in self.current_selection:
            self.selection_listbox.insert(tk.END, f"Section {idx}")
    
    def clear_selection(self):
        """Clear all selected sections."""
        for section in self.section_manager.sections:
            section['selected'] = False
        self.update_selection_list()
        self.draw_sections()
    
    def create_block_from_selection(self):
        """Create a block from currently selected sections."""
        if not self.current_selection:
            messagebox.showwarning("No Selection", "Please select at least one section.")
            return
        
        try:
            num_beds = int(self.block_beds_var.get())
            if num_beds <= 0:
                raise ValueError()
        except:
            messagebox.showerror("Invalid Input", "Number of beds must be a positive integer.")
            return
        
        block = {
            'sections': self.current_selection.copy(),
            'num_beds': num_beds,
            'orientation': self.block_orientation_var.get(),
            'numbering': self.block_numbering_var.get()
        }
        
        self.blocks.append(block)
        self.update_blocks_list()
        self.clear_selection()
        
        messagebox.showinfo("Block Created", 
                          f"Block {len(self.blocks)} created with {num_beds} beds")
    
    def update_blocks_list(self):
        """Update the listbox showing created blocks."""
        self.blocks_listbox.delete(0, tk.END)
        for idx, block in enumerate(self.blocks):
            self.blocks_listbox.insert(tk.END, 
                f"Block {idx+1}: {block['num_beds']} beds, {block['orientation']}")
    
    def remove_selected_block(self):
        """Remove the selected block from the list."""
        selection = self.blocks_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a block to remove.")
            return
        
        block_idx = selection[0]
        del self.blocks[block_idx]
        self.update_blocks_list()
        self.draw_sections()
    
    def edit_selected_block(self):
        """Edit the selected block."""
        selection = self.blocks_listbox.curselection()
        if not selection:
            messagebox.showwarning("No Selection", "Please select a block to edit.")
            return
        
        block_idx = selection[0]
        block = self.blocks[block_idx]
        
        # Populate fields
        self.block_beds_var.set(str(block['num_beds']))
        self.block_orientation_var.set(block['orientation'])
        self.block_numbering_var.set(block['numbering'])
        
        # Highlight sections
        for section in self.section_manager.sections:
            section['selected'] = section['id'] in block['sections']
        
        self.update_selection_list()
        self.draw_sections()
        
        # Remove the block (will be re-created)
        del self.blocks[block_idx]
        self.update_blocks_list()
    
    def confirm_blocks(self):
        """Confirm and close the designer."""
        if not self.blocks:
            messagebox.showwarning("No Blocks", "Please create at least one block.")
            return
        
        self.window.quit()
        self.window.destroy()
    
    def get_blocks(self):
        """Return the created blocks."""
        return self.blocks


def determine_optimal_orientation(polygon):
    """
    Determine the optimal orientation for beds based on polygon shape.
    Returns 'horizontal' or 'vertical'.
    """
    min_rect = polygon.minimum_rotated_rectangle
    rect_coords = list(min_rect.exterior.coords)
    
    side1_len = np.linalg.norm(np.array(rect_coords[0]) - np.array(rect_coords[1]))
    side2_len = np.linalg.norm(np.array(rect_coords[1]) - np.array(rect_coords[2]))
    
    # Longer dimension becomes the bed direction
    return 'vertical' if side1_len > side2_len else 'horizontal'


def generate_parallel_lines(base_line_start: np.array, base_line_end: np.array,
                            translation_start: np.array, translation_vector: np.array,
                            translation_length: float, num_lines: int) -> list:
    """Helper function to generate a set of parallel lines with a fixed count."""
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
                                           buffer_distance: float = 1.0,
                                           orientation: str = 'auto') -> gpd.GeoDataFrame:
    """
    Generates parallel bed lines aligned with specified orientation.
    Returns lines with temporary IDs that will be reordered later.
    """
    if not isinstance(polygon, Polygon):
        raise TypeError("Input 'polygon' must be a shapely.geometry.Polygon object.")
    if not isinstance(num_lines, int) or num_lines <= 0:
        raise ValueError("Input 'num_lines' must be a positive integer.")

    buffered_polygon = polygon.buffer(-buffer_distance)
    if buffered_polygon.is_empty:
        raise ValueError(f"Buffer of {buffer_distance}m is too large for this polygon.")
    
    # Handle MultiPolygon result from buffer
    if buffered_polygon.geom_type == 'MultiPolygon':
        buffered_polygon = max(buffered_polygon.geoms, key=lambda p: p.area)
    
    if buffered_polygon.geom_type != 'Polygon':
        raise ValueError(f"Buffered polygon resulted in {buffered_polygon.geom_type}")

    min_rect = buffered_polygon.minimum_rotated_rectangle
    rect_coords = list(min_rect.exterior.coords)

    side1_len = np.linalg.norm(np.array(rect_coords[0]) - np.array(rect_coords[1]))
    side2_len = np.linalg.norm(np.array(rect_coords[1]) - np.array(rect_coords[2]))

    # Determine orientation
    if orientation == 'auto':
        use_side1_as_bed = side1_len <= side2_len
    elif orientation in ['horizontal', 'east', 'west']:
        use_side1_as_bed = True
    else:  # vertical, north, south
        use_side1_as_bed = side1_len <= side2_len
    
    if use_side1_as_bed:
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

    all_generated_lines = generate_parallel_lines(base_line_start, base_line_end,
                                                  translation_start, translation_vector,
                                                  available_length, num_lines)

    lines_gdf = gpd.GeoDataFrame(geometry=all_generated_lines, crs=None)

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

    # Temporary sequential ID (will be reordered later)
    clipped_gdf['temp_id'] = range(len(clipped_gdf))
    return clipped_gdf


def reorder_lines_by_direction(lines_gdf: gpd.GeoDataFrame, direction: str, 
                               start_id: int = 1) -> gpd.GeoDataFrame:
    """
    Reorders the bed lines according to the specified numbering direction.
    Returns a new GeoDataFrame with correct sequential line_id.
    """
    if lines_gdf.empty:
        return lines_gdf

    # Use centroid Y (North-South) and X (East-West) for sorting
    centroids = lines_gdf.geometry.centroid
    lines_gdf = lines_gdf.copy()
    lines_gdf['centroid_x'] = centroids.x
    lines_gdf['centroid_y'] = centroids.y

    ascending = True  # Default sort order

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
    elif direction == 'north':
        key = 'centroid_y'
        ascending = False  # Higher Y = more north
    elif direction == 'south':
        key = 'centroid_y'
        ascending = True   # Lower Y = more south first
    elif direction == 'east':
        key = 'centroid_x'
        ascending = False  # Higher X = more east
    elif direction == 'west':
        key = 'centroid_x'
        ascending = True   # Lower X = more west first
    else:
        raise ValueError(f"Unsupported bed_numbering direction: {direction}")

    lines_gdf = lines_gdf.sort_values(by=key, ascending=ascending).reset_index(drop=True)
    lines_gdf['line_id'] = range(start_id, start_id + len(lines_gdf))  # Final bed number
    lines_gdf = lines_gdf.drop(columns=['centroid_x', 'centroid_y', 'temp_id'], errors='ignore')

    return lines_gdf


def visualize_layout(polygon_gdf, beds_gdf, zones_gdf, blocks_info=None):
    """
    Visualize greenhouse polygon, beds, and zones with block information.
    """
    fig, ax = plt.subplots(figsize=(12, 10))

    # Plot greenhouse polygon
    polygon_gdf.plot(
        ax=ax,
        facecolor="none",
        edgecolor="black",
        linewidth=2.5,
        label="Greenhouse"
    )

    # Plot zones (lighter, thinner)
    if zones_gdf is not None and not zones_gdf.empty:
        zones_gdf.plot(
            ax=ax,
            linewidth=1,
            alpha=0.5,
            color='lightgray',
            label="Zones"
        )

    # Plot beds with block colors
    if blocks_info:
        import matplotlib.cm as cm
        cmap = cm.get_cmap('Set3')
        
        for block_idx, block in enumerate(blocks_info):
            block_beds = beds_gdf[beds_gdf['block_id'] == block_idx]
            color = cmap(block_idx % 12)
            
            block_beds.plot(
                ax=ax,
                linewidth=2.5,
                color=color,
                label=f"Block {block_idx+1}"
            )
    else:
        beds_gdf.plot(
            ax=ax,
            linewidth=2.5,
            label="Beds"
        )

    # Label beds
    for _, row in beds_gdf.iterrows():
        centroid = row.geometry.centroid
        ax.text(
            centroid.x,
            centroid.y,
            str(row["line_id"]),
            fontsize=8,
            ha="center",
            va="center",
            bbox=dict(boxstyle="round,pad=0.2", fc="white", alpha=0.8)
        )

    ax.set_aspect("equal")
    ax.set_title("Greenhouse Bed & Zone Layout", fontsize=14, fontweight='bold')
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.grid(True, linestyle="--", alpha=0.3)
    ax.legend(loc='best')

    plt.tight_layout()
    plt.show()


def create_line_zones(lines_gdf: gpd.GeoDataFrame, zone_length: float) -> gpd.GeoDataFrame:
    """Create zones along bed lines."""
    all_zones = []
    fid_counter = 1

    for _, row in lines_gdf.iterrows():
        line = row.geometry
        line_id = row['line_id']
        block_id = row.get('block_id', 0)
        line_length = line.length

        num_zones = int(line_length // zone_length)
        current_position = 0

        for zone_id in range(1, num_zones + 1):
            segment = substring(line, current_position, current_position + zone_length, normalized=False)
            all_zones.append({
                'fid': fid_counter,
                'line_id': line_id,
                'block_id': block_id,
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
                'block_id': block_id,
                'zone_id': num_zones + 1,
                'geometry': remaining_segment
            })
            fid_counter += 1

    return gpd.GeoDataFrame(all_zones, geometry='geometry', crs=lines_gdf.crs)


def featurecollection_from_row(row):
    """Convert a row to GeoJSON FeatureCollection format."""
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {
                "fid": int(row["fid"]),
                "line_id": int(row["line_id"]),
                "block_id": int(row.get("block_id", 0)),
                "zone_id": int(row["zone_id"]),
            },
            "geometry": row.geometry.__geo_interface__
        }]
    }


def get_user_inputs():
    """Main UI for getting user inputs."""
    root = tk.Tk()
    root.title("Greenhouse Bed Generator v2")
    root.geometry("600x700")
    root.resizable(True, True)

    values = {}

    def browse_file():
        path = filedialog.askopenfilename(
            title="Select GeoJSON file",
            filetypes=[("GeoJSON files", "*.geojson *.json")]
        )
        if path:
            with open(path, "r") as f:
                geojson_text.delete("1.0", tk.END)
                geojson_text.insert(tk.END, f.read())

    def open_block_designer():
        """Open the interactive block designer."""
        try:
            geojson_raw = geojson_text.get("1.0", tk.END).strip()
            if not geojson_raw:
                messagebox.showerror("Missing GeoJSON", "Paste GeoJSON or load a file.")
                return

            geojson_data = json.loads(geojson_raw)

            # Extract polygon
            main_polygon = None
            for feature in geojson_data["features"]:
                if feature['geometry']['type'] == 'Polygon':
                    main_polygon = Polygon(feature['geometry']['coordinates'][0])
                    break

            if main_polygon is None:
                messagebox.showerror("Error", "No polygon found in GeoJSON.")
                return

            # Get grid divisions
            grid_x = int(grid_x_var.get())
            grid_y = int(grid_y_var.get())

            # Create section manager
            section_mgr = PolygonSectionManager(main_polygon, min_section_area=5)
            section_mgr.decompose_polygon(grid_x, grid_y)

            if not section_mgr.sections:
                messagebox.showerror("Error", "Could not decompose polygon into sections.")
                return

            # Open interactive designer
            designer = InteractiveBlockDesigner(root, main_polygon, section_mgr)
            root.wait_window(designer.window)

            # Get blocks
            blocks = designer.get_blocks()
            if blocks:
                values['blocks'] = blocks
                values['geojson'] = geojson_data
                values['section_manager'] = section_mgr
                messagebox.showinfo("Success", f"{len(blocks)} blocks created!")

        except json.JSONDecodeError:
            messagebox.showerror("Invalid GeoJSON", "Pasted text is not valid JSON.")
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def submit():
        try:
            if 'blocks' not in values:
                messagebox.showerror("No Blocks", "Please design blocks first.")
                return

            values['zone_length'] = float(zone_length_var.get())
            values['buffer_distance'] = float(buffer_distance_var.get())

            root.quit()
            root.destroy()

        except Exception as e:
            messagebox.showerror("Error", str(e))

    # GeoJSON input
    ttk.Label(root, text="GeoJSON (Paste or Load File)", 
             font=('Arial', 10, 'bold')).pack(pady=(8, 0))

    geojson_text = scrolledtext.ScrolledText(root, height=12, wrap=tk.NONE)
    geojson_text.pack(fill="both", expand=True, padx=10)

    ttk.Button(root, text="Load GeoJSON from File", command=browse_file).pack(pady=5)

    ttk.Separator(root, orient="horizontal").pack(fill="x", pady=10)

    # Grid division settings
    ttk.Label(root, text="Polygon Decomposition", 
             font=('Arial', 10, 'bold')).pack(pady=(5, 0))
    
    grid_frame = ttk.Frame(root)
    grid_frame.pack(pady=5)
    
    ttk.Label(grid_frame, text="Grid Divisions X:").grid(row=0, column=0, padx=5)
    grid_x_var = tk.StringVar(value="4")
    ttk.Entry(grid_frame, textvariable=grid_x_var, width=10).grid(row=0, column=1, padx=5)
    
    ttk.Label(grid_frame, text="Y:").grid(row=0, column=2, padx=5)
    grid_y_var = tk.StringVar(value="4")
    ttk.Entry(grid_frame, textvariable=grid_y_var, width=10).grid(row=0, column=3, padx=5)

    ttk.Button(root, text="Design Blocks (Interactive)", 
              command=open_block_designer,
              style="Accent.TButton").pack(pady=10)

    ttk.Separator(root, orient="horizontal").pack(fill="x", pady=10)

    # Other parameters
    ttk.Label(root, text="Zone Length (meters)").pack(pady=(6, 0))
    zone_length_var = tk.StringVar(value="4.0")
    ttk.Entry(root, textvariable=zone_length_var).pack()

    ttk.Label(root, text="Buffer Distance (meters)").pack(pady=(6, 0))
    buffer_distance_var = tk.StringVar(value="3.0")
    ttk.Entry(root, textvariable=buffer_distance_var).pack()

    ttk.Button(root, text="Generate Greenhouse Layout", 
              command=submit).pack(pady=15)

    root.mainloop()
    return values


def run_processing(geojson_data, blocks, section_manager, zone_length_m, buffer_distance_m):
    """Process the greenhouse with multiple blocks."""
    try:
        print("Loading polygon from GeoJSON data...")
        main_polygon = None
        greenhouse_id_from_geojson = None

        for feature in geojson_data["features"]:
            if feature['geometry']['type'] == 'Polygon':
                main_polygon = Polygon(feature['geometry']['coordinates'][0])
                greenhouse_id_from_geojson = feature['properties'].get(
                    'id', 'unknown_id'
                ).replace(" ", "_").replace("/", "_").strip()
                break

        if main_polygon is None:
            raise ValueError("No polygon found in GeoJSON.")

        print(f"Processing greenhouse: {greenhouse_id_from_geojson}")
        print(f"Number of blocks: {len(blocks)}")

        polygon_gdf = gpd.GeoDataFrame(geometry=[main_polygon], crs="EPSG:4326")
        original_crs = polygon_gdf.crs

        # Reproject to UTM
        if polygon_gdf.crs.is_geographic:
            lon = polygon_gdf.centroid.x.iloc[0]
            utm_zone = int((lon + 180) / 6) + 1
            utm_crs = (
                f"EPSG:326{utm_zone:02d}"
                if polygon_gdf.centroid.y.iloc[0] >= 0
                else f"EPSG:327{utm_zone:02d}"
            )
            projected_polygon_gdf = polygon_gdf.to_crs(utm_crs)
        else:
            projected_polygon_gdf = polygon_gdf

        # Process each block
        all_beds = []
        bed_id_counter = 1

        for block_idx, block in enumerate(blocks):
            print(f"\nProcessing Block {block_idx + 1}...")
            
            # Combine sections into block polygon
            block_polygon = section_manager.combine_sections(block['sections'])
            
            # Convert to projected CRS
            block_gdf = gpd.GeoDataFrame(geometry=[block_polygon], crs=original_crs)
            block_gdf_projected = block_gdf.to_crs(projected_polygon_gdf.crs)
            block_polygon_projected = block_gdf_projected.geometry.iloc[0]

            # Generate beds for this block
            try:
                block_beds = create_offset_lines_in_buffered_polygon(
                    block_polygon_projected,
                    block['num_beds'],
                    buffer_distance_m,
                    block['orientation']
                )

                if block_beds.empty:
                    print(f"  Warning: No beds generated for block {block_idx + 1}")
                    continue

                block_beds.crs = projected_polygon_gdf.crs

                # Reorder beds
                block_beds = reorder_lines_by_direction(
                    block_beds, 
                    block['numbering'],
                    start_id=bed_id_counter
                )

                # Add block ID
                block_beds['block_id'] = block_idx

                all_beds.append(block_beds)
                bed_id_counter += len(block_beds)

                print(f"  Generated {len(block_beds)} beds")

            except Exception as e:
                print(f"  Error processing block {block_idx + 1}: {e}")
                continue

        if not all_beds:
            raise ValueError("No beds generated for any block.")

        # Combine all beds
        combined_beds_gdf = gpd.GeoDataFrame(
            pd.concat(all_beds, ignore_index=True),
            crs=projected_polygon_gdf.crs
        )

        print(f"\nTotal beds generated: {len(combined_beds_gdf)}")

        # Create zones
        line_zones_gdf_projected = create_line_zones(combined_beds_gdf, zone_length_m)

        # Reproject back to WGS84
        line_zones_gdf = line_zones_gdf_projected.to_crs(original_crs)
        combined_beds_gdf_wgs84 = combined_beds_gdf.to_crs(original_crs)

        # Save output
        output_dir = "output"
        os.makedirs(output_dir, exist_ok=True)
        output_filepath = os.path.join(
            output_dir, f"{greenhouse_id_from_geojson}_line_zones.geojson"
        )

        with open(output_filepath, "w") as f:
            for _, row in line_zones_gdf.iterrows():
                f.write(json.dumps(featurecollection_from_row(row)) + "\n")

        print(f"Output saved: {os.path.abspath(output_filepath)}")

        # Visualize
        visualize_layout(
            polygon_gdf,
            combined_beds_gdf_wgs84,
            line_zones_gdf,
            blocks_info=blocks
        )

    except Exception as e:
        raise RuntimeError(str(e))


if __name__ == "__main__":
    import pandas as pd
    
    # Get user inputs through interactive UI
    inputs = get_user_inputs()

    if 'blocks' in inputs and 'geojson' in inputs:
        run_processing(
            inputs['geojson'],
            inputs['blocks'],
            inputs['section_manager'],
            inputs['zone_length'],
            inputs['buffer_distance']
        )
        print("\n✓ Processing complete!")
    else:
        print("No blocks created. Exiting.")