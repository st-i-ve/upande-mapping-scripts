import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import json
import numpy as np

class PolygonViewer:
    def __init__(self, root):
        self.root = root
        self.root.title("Polygon Edge Selector - GeoJSON Input")
        self.root.geometry("1400x900")
        
        # Initial data
        self.coords = []
        self.polygon_name = ""
        self.edge_labels = {}
        self.selected_edges = set()
        
        # Slicing data
        self.slice_vertices = []
        self.slice_mode = None  # 'polar' or 'side_to_side'
        self.num_segments = 2
        
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
        title_label = ttk.Label(left_frame, text="🗺️ GeoJSON Polygon Viewer", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=10)
        
        # GeoJSON input section
        input_label = ttk.Label(left_frame, text="📄 Paste GeoJSON Here:", 
                               font=('Arial', 12, 'bold'))
        input_label.pack(pady=(10, 5))
        
        # Scrolled text widget for GeoJSON input
        self.geojson_text = scrolledtext.ScrolledText(left_frame, 
                                                      width=45, 
                                                      height=12,
                                                      wrap=tk.WORD,
                                                      font=('Courier', 9))
        self.geojson_text.pack(pady=5, padx=10)
        
        # Load button
        load_btn = tk.Button(left_frame, text="🔄 Load & Process GeoJSON",
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
        
        # Edge selection section
        selection_label = ttk.Label(left_frame, text="Edge Selection:", 
                                   font=('Arial', 12, 'bold'))
        selection_label.pack(pady=(5, 10))
        
        # Polar Selection button
        self.polar_btn = tk.Button(left_frame, text="🌐 Polar Selection\n(Top & Bottom)",
                                  command=self.select_polar,
                                  bg='#4CAF50', fg='white', 
                                  font=('Arial', 11, 'bold'),
                                  cursor='hand2',
                                  state='disabled',
                                  pady=15)
        self.polar_btn.pack(pady=5, padx=10, fill=tk.X)
        
        # Side to Side Selection button
        self.side_btn = tk.Button(left_frame, text="↔️ Side to Side Selection\n(Left & Right)",
                                 command=self.select_side_to_side,
                                 bg='#2196F3', fg='white', 
                                 font=('Arial', 11, 'bold'),
                                 cursor='hand2',
                                 state='disabled',
                                 pady=15)
        self.side_btn.pack(pady=5, padx=10, fill=tk.X)
        
        # Clear Selection button
        self.clear_btn = tk.Button(left_frame, text="🔄 Clear Selection",
                                  command=self.clear_selection,
                                  bg='#FF5722', fg='white', 
                                  font=('Arial', 11, 'bold'),
                                  cursor='hand2',
                                  state='disabled',
                                  pady=15)
        self.clear_btn.pack(pady=5, padx=10, fill=tk.X)
        
        # Separator
        ttk.Separator(left_frame, orient='horizontal').pack(fill='x', pady=10)
        
        # SECTION 2: Slicing controls
        slicing_label = ttk.Label(left_frame, text="🍰 Section 2: Polygon Slicing", 
                                 font=('Arial', 12, 'bold'))
        slicing_label.pack(pady=(5, 10))
        
        # Number of segments control
        segments_frame = ttk.Frame(left_frame)
        segments_frame.pack(pady=5, padx=10, fill=tk.X)
        
        ttk.Label(segments_frame, text="Number of Segments:", 
                 font=('Arial', 10)).pack(side=tk.LEFT, padx=(0, 10))
        
        self.segments_var = tk.IntVar(value=2)
        self.segments_spinbox = ttk.Spinbox(segments_frame, 
                                           from_=2, to=20, 
                                           textvariable=self.segments_var,
                                           width=10,
                                           command=self.update_slicing,
                                           state='disabled')
        self.segments_spinbox.pack(side=tk.LEFT)
        
        # Polar Slicing button
        self.polar_slice_btn = tk.Button(left_frame, 
                                        text="🌐 Polar Slicing\n(Divide Top & Bottom)",
                                        command=self.slice_polar,
                                        bg='#8BC34A', fg='white', 
                                        font=('Arial', 10, 'bold'),
                                        cursor='hand2',
                                        state='disabled',
                                        pady=12)
        self.polar_slice_btn.pack(pady=5, padx=10, fill=tk.X)
        
        # Side to Side Slicing button
        self.side_slice_btn = tk.Button(left_frame, 
                                       text="↔️ Side to Side Slicing\n(Divide Left & Right)",
                                       command=self.slice_side_to_side,
                                       bg='#03A9F4', fg='white', 
                                       font=('Arial', 10, 'bold'),
                                       cursor='hand2',
                                       state='disabled',
                                       pady=12)
        self.side_slice_btn.pack(pady=5, padx=10, fill=tk.X)
        
        # Clear Slicing button
        self.clear_slice_btn = tk.Button(left_frame, 
                                        text="🔄 Clear Slicing",
                                        command=self.clear_slicing,
                                        bg='#FF9800', fg='white', 
                                        font=('Arial', 10, 'bold'),
                                        cursor='hand2',
                                        state='disabled',
                                        pady=12)
        self.clear_slice_btn.pack(pady=5, padx=10, fill=tk.X)
        
        # Separator
        ttk.Separator(left_frame, orient='horizontal').pack(fill='x', pady=10)
        
        # Polygon info section
        info_label = ttk.Label(left_frame, text="Polygon Info:", 
                              font=('Arial', 12, 'bold'))
        info_label.pack(pady=(5, 5))
        
        # Info text widget
        info_frame = ttk.Frame(left_frame)
        info_frame.pack(pady=5, padx=10, fill=tk.BOTH, expand=True)
        
        self.info_text = tk.Text(info_frame, 
                                width=45, 
                                height=10,
                                wrap=tk.WORD,
                                font=('Arial', 9),
                                bg='#f9f9f9',
                                relief=tk.FLAT,
                                state='disabled')
        self.info_text.pack(fill=tk.BOTH, expand=True)
        
        # === RIGHT PANEL ===
        
        # Create matplotlib figure
        self.fig, self.ax = plt.subplots(figsize=(10, 9))
        self.canvas = FigureCanvasTkAgg(self.fig, master=right_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
    
    def load_geojson(self):
        """Load and process GeoJSON from text input"""
        try:
            # Get text from input
            geojson_str = self.geojson_text.get('1.0', tk.END).strip()
            
            if not geojson_str:
                messagebox.showwarning("Empty Input", "Please paste GeoJSON data first!")
                return
            
            # Parse JSON
            geojson = json.loads(geojson_str)
            
            # Validate structure
            if geojson.get('type') != 'FeatureCollection':
                raise ValueError("Invalid GeoJSON: Must be a FeatureCollection")
            
            if not geojson.get('features') or len(geojson['features']) == 0:
                raise ValueError("No features found in GeoJSON")
            
            feature = geojson['features'][0]
            
            if feature.get('geometry', {}).get('type') != 'Polygon':
                raise ValueError("First feature must be a Polygon")
            
            # Extract coordinates
            self.coords = feature['geometry']['coordinates'][0]
            self.polygon_name = feature.get('properties', {}).get('id') or \
                               feature.get('properties', {}).get('name') or \
                               'Unnamed Polygon'
            
            if len(self.coords) < 4:
                raise ValueError("Polygon must have at least 3 vertices (4 coordinates including closing point)")
            
            # Calculate edge labels
            self.calculate_edge_labels()
            
            # Enable buttons
            self.polar_btn.config(state='normal')
            self.side_btn.config(state='normal')
            self.clear_btn.config(state='normal')
            
            # Enable slicing controls
            self.segments_spinbox.config(state='normal')
            self.polar_slice_btn.config(state='normal')
            self.side_slice_btn.config(state='normal')
            self.clear_slice_btn.config(state='normal')
            
            # Clear selection and slicing
            self.selected_edges = set()
            self.clear_slicing()
            
            # Update info
            self.update_info()
            
            # Draw polygon
            self.draw_polygon()
            
            # Update status
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
        """Determine edge position label - assigns one of: Left, Right, Top, Bottom"""
        x1, y1 = p1
        x2, y2 = p2
        
        # Calculate midpoint
        mid_x = (x1 + x2) / 2
        mid_y = (y1 + y2) / 2
        
        # Get all y and x values (excluding the closing point)
        all_x = [c[0] for c in self.coords[:-1]]
        all_y = [c[1] for c in self.coords[:-1]]
        
        min_x, max_x = min(all_x), max(all_x)
        min_y, max_y = min(all_y), max(all_y)
        
        # Calculate relative position
        x_range = max_x - min_x
        y_range = max_y - min_y
        
        x_rel = (mid_x - min_x) / x_range if x_range > 0 else 0.5
        y_rel = (mid_y - min_y) / y_range if y_range > 0 else 0.5
        
        # Calculate edge orientation (slope)
        dx = x2 - x1
        dy = y2 - y1
        
        # Determine if edge is more horizontal or vertical
        is_horizontal = abs(dx) > abs(dy)
        
        if is_horizontal:
            # Horizontal edge - classify as Top or Bottom
            if y_rel > 0.5:
                return "Top"
            else:
                return "Bottom"
        else:
            # Vertical edge - classify as Left or Right
            if x_rel > 0.5:
                return "Right"
            else:
                return "Left"
    
    def update_info(self):
        """Update the info panel with polygon details"""
        self.info_text.config(state='normal')
        self.info_text.delete('1.0', tk.END)
        
        info = f"Name: {self.polygon_name}\n"
        info += f"Vertices: {len(self.coords) - 1}\n"
        info += f"Edges: {len(self.coords) - 1}\n\n"
        info += "Edge Details:\n"
        info += "-" * 30 + "\n"
        
        for i in range(len(self.coords) - 1):
            info += f"Edge {i+1}: {self.edge_labels[i]}\n"
        
        # Add slicing info
        if self.slice_vertices:
            info += "\n" + "=" * 30 + "\n"
            info += f"SLICING: {self.slice_mode.replace('_', ' ').title()}\n"
            info += f"Segments: {self.num_segments}\n"
            info += f"New Vertices: {len(self.slice_vertices)}\n"
            info += "-" * 30 + "\n"
            for vertex in self.slice_vertices:
                vertex_label = f"{vertex['number']}{vertex['suffix']}"
                info += f"V{vertex_label}: {vertex['edge']} edge\n"
        
        self.info_text.insert('1.0', info)
        self.info_text.config(state='disabled')
    
    def draw_polygon(self):
        """Draw the polygon on the canvas"""
        self.ax.clear()
        
        if not self.coords:
            # Show placeholder
            self.ax.text(0.5, 0.5, 'Load GeoJSON to display polygon',
                        ha='center', va='center', fontsize=14, color='gray')
            self.ax.set_xlim(0, 1)
            self.ax.set_ylim(0, 1)
            self.canvas.draw()
            return
        
        # Extract x and y coordinates
        x_coords = [point[0] for point in self.coords]
        y_coords = [point[1] for point in self.coords]
        
        # Plot polygon outline
        self.ax.plot(x_coords, y_coords, 'k-', linewidth=1.5, alpha=0.5)
        self.ax.fill(x_coords, y_coords, alpha=0.1, color='lightgray')
        
        # Plot vertices
        self.ax.plot(x_coords[:-1], y_coords[:-1], 'ko', markersize=8)
        
        # Label vertices
        for i, (x, y) in enumerate(self.coords[:-1]):
            self.ax.annotate(f'V{i+1}', (x, y), xytext=(8, 8), 
                           textcoords='offset points', fontsize=10, fontweight='bold')
        
        # Draw edges with highlighting
        for i in range(len(self.coords) - 1):
            p1 = self.coords[i]
            p2 = self.coords[i + 1]
            
            # Determine if this edge is selected
            is_selected = i in self.selected_edges
            
            # Edge color and width
            if is_selected:
                color = 'red'
                linewidth = 5
                alpha = 1.0
            else:
                color = 'blue'
                linewidth = 2
                alpha = 0.6
            
            # Draw edge
            self.ax.plot([p1[0], p2[0]], [p1[1], p2[1]], 
                        color=color, linewidth=linewidth, alpha=alpha)
            
            # Calculate midpoint for label
            mid_x = (p1[0] + p2[0]) / 2
            mid_y = (p1[1] + p2[1]) / 2
            
            # Get edge label
            edge_label = self.edge_labels[i]
            
            # Add edge label with highlighting
            if is_selected:
                bbox_color = 'red'
                text_color = 'white'
            else:
                bbox_color = 'yellow'
                text_color = 'black'
            
            self.ax.annotate(edge_label, (mid_x, mid_y), 
                           bbox=dict(boxstyle='round,pad=0.5', 
                                   facecolor=bbox_color, alpha=0.8),
                           fontsize=12, fontweight='bold', ha='center',
                           color=text_color)
            
            # Add edge number
            self.ax.annotate(f'E{i+1}', (mid_x, mid_y), 
                           xytext=(0, -25), textcoords='offset points',
                           fontsize=8, style='italic', ha='center', alpha=0.7)
        
        # Set labels and title
        self.ax.set_xlabel('Longitude', fontsize=12)
        self.ax.set_ylabel('Latitude', fontsize=12)
        
        title = f'Polygon: {self.polygon_name}'
        if self.selected_edges:
            selected_labels = [self.edge_labels[i] for i in sorted(self.selected_edges)]
            title += f'\nHighlighted: {", ".join(selected_labels)}'
        if self.slice_vertices:
            title += f'\n🍰 Slicing: {self.slice_mode.replace("_", " ").title()} - {self.num_segments} segments'
        
        self.ax.set_title(title, fontsize=14, fontweight='bold')
        self.ax.grid(True, alpha=0.3)
        self.ax.set_aspect('equal', adjustable='box')
        
        # Draw slicing vertices if any
        if self.slice_vertices:
            for vertex in self.slice_vertices:
                coords = vertex['coords']
                number = vertex['number']
                suffix = vertex['suffix']
                vertex_label = f"{number}{suffix}"
                
                # Draw vertex point
                self.ax.plot(coords[0], coords[1], 'go', markersize=10, 
                           markeredgecolor='darkgreen', markeredgewidth=2, zorder=5)
                
                # Draw vertex label with number and suffix
                self.ax.annotate(f'V{vertex_label}', (coords[0], coords[1]), 
                               xytext=(10, 10), textcoords='offset points',
                               fontsize=11, fontweight='bold', color='darkgreen',
                               bbox=dict(boxstyle='round,pad=0.3', 
                                       facecolor='lightgreen', alpha=0.8))
        
        # Refresh canvas
        self.canvas.draw()
    
    def slice_polar(self):
        """Slice polygon using polar mode (divide Top and Bottom edges)"""
        if not self.coords:
            return
        
        self.slice_mode = 'polar'
        self.num_segments = self.segments_var.get()
        self.slice_vertices = []
        
        # Find Top and Bottom edges
        top_edge_idx = None
        bottom_edge_idx = None
        
        for i, label in self.edge_labels.items():
            if label == 'Top':
                top_edge_idx = i
            elif label == 'Bottom':
                bottom_edge_idx = i
        
        if top_edge_idx is None or bottom_edge_idx is None:
            messagebox.showwarning("Slicing Error", "Could not find Top and Bottom edges!")
            return
        
        # Get edge coordinates
        top_p1 = self.coords[top_edge_idx]
        top_p2 = self.coords[top_edge_idx + 1]
        bottom_p1 = self.coords[bottom_edge_idx]
        bottom_p2 = self.coords[bottom_edge_idx + 1]
        
        # Create vertices on top and bottom edges (left to right)
        # For top edge, order from left to right
        if top_p1[0] > top_p2[0]:  # if p1 is to the right, swap
            top_p1, top_p2 = top_p2, top_p1
        
        # For bottom edge, order from left to right
        if bottom_p1[0] > bottom_p2[0]:  # if p1 is to the right, swap
            bottom_p1, bottom_p2 = bottom_p2, bottom_p1
        
        # Create vertices from left to right, paired (1T with 1B, 2T with 2B, etc.)
        for i in range(1, self.num_segments):
            t = i / self.num_segments
            
            # Top edge vertex
            top_vertex = [
                top_p1[0] + t * (top_p2[0] - top_p1[0]),
                top_p1[1] + t * (top_p2[1] - top_p1[1])
            ]
            self.slice_vertices.append({
                'coords': top_vertex,
                'number': i,
                'suffix': 'T',
                'edge': 'Top'
            })
            
            # Bottom edge vertex
            bottom_vertex = [
                bottom_p1[0] + t * (bottom_p2[0] - bottom_p1[0]),
                bottom_p1[1] + t * (bottom_p2[1] - bottom_p1[1])
            ]
            self.slice_vertices.append({
                'coords': bottom_vertex,
                'number': i,
                'suffix': 'B',
                'edge': 'Bottom'
            })
        
        # Update status
        self.status_label.config(
            text=f"🌐 Polar Slicing: {self.num_segments} segments created ({len(self.slice_vertices)} new vertices)",
            foreground='green'
        )
        
        # Update info and redraw
        self.update_info()
        self.draw_polygon()
    
    def slice_side_to_side(self):
        """Slice polygon using side-to-side mode (divide Left and Right edges)"""
        if not self.coords:
            return
        
        self.slice_mode = 'side_to_side'
        self.num_segments = self.segments_var.get()
        self.slice_vertices = []
        
        # Find Left and Right edges
        left_edge_idx = None
        right_edge_idx = None
        
        for i, label in self.edge_labels.items():
            if label == 'Left':
                left_edge_idx = i
            elif label == 'Right':
                right_edge_idx = i
        
        if left_edge_idx is None or right_edge_idx is None:
            messagebox.showwarning("Slicing Error", "Could not find Left and Right edges!")
            return
        
        # Get edge coordinates
        left_p1 = self.coords[left_edge_idx]
        left_p2 = self.coords[left_edge_idx + 1]
        right_p1 = self.coords[right_edge_idx]
        right_p2 = self.coords[right_edge_idx + 1]
        
        # Create vertices on left and right edges (top to bottom)
        # For left edge, order from top to bottom
        if left_p1[1] < left_p2[1]:  # if p1 is below, swap
            left_p1, left_p2 = left_p2, left_p1
        
        # For right edge, order from top to bottom
        if right_p1[1] < right_p2[1]:  # if p1 is below, swap
            right_p1, right_p2 = right_p2, right_p1
        
        # Create vertices from top to bottom, paired (1L with 1R, 2L with 2R, etc.)
        for i in range(1, self.num_segments):
            t = i / self.num_segments
            
            # Left edge vertex
            left_vertex = [
                left_p1[0] + t * (left_p2[0] - left_p1[0]),
                left_p1[1] + t * (left_p2[1] - left_p1[1])
            ]
            self.slice_vertices.append({
                'coords': left_vertex,
                'number': i,
                'suffix': 'L',
                'edge': 'Left'
            })
            
            # Right edge vertex
            right_vertex = [
                right_p1[0] + t * (right_p2[0] - right_p1[0]),
                right_p1[1] + t * (right_p2[1] - right_p1[1])
            ]
            self.slice_vertices.append({
                'coords': right_vertex,
                'number': i,
                'suffix': 'R',
                'edge': 'Right'
            })
        
        # Update status
        self.status_label.config(
            text=f"↔️ Side to Side Slicing: {self.num_segments} segments created ({len(self.slice_vertices)} new vertices)",
            foreground='green'
        )
        
        # Update info and redraw
        self.update_info()
        self.draw_polygon()
    
    def clear_slicing(self):
        """Clear slicing vertices"""
        self.slice_vertices = []
        self.slice_mode = None
        self.status_label.config(text="🔄 Slicing cleared", foreground='blue')
        self.update_info()
        self.draw_polygon()
    
    def update_slicing(self):
        """Update slicing when segment number changes"""
        if self.slice_mode == 'polar':
            self.slice_polar()
        elif self.slice_mode == 'side_to_side':
            self.slice_side_to_side()
    
    def select_polar(self):
        """Select Top and Bottom edges"""
        self.selected_edges = {i for i, label in self.edge_labels.items() 
                              if label in ['Top', 'Bottom']}
        self.status_label.config(text="🌐 Polar Selection: Top & Bottom edges highlighted",
                                foreground='green')
        self.draw_polygon()
    
    def select_side_to_side(self):
        """Select Left and Right edges"""
        self.selected_edges = {i for i, label in self.edge_labels.items() 
                              if label in ['Left', 'Right']}
        self.status_label.config(text="↔️ Side to Side Selection: Left & Right edges highlighted",
                                foreground='green')
        self.draw_polygon()
    
    def clear_selection(self):
        """Clear all selections"""
        self.selected_edges = set()
        self.status_label.config(text="🔄 Selection cleared", foreground='blue')
        self.draw_polygon()

def main():
    root = tk.Tk()
    app = PolygonViewer(root)
    root.mainloop()

if __name__ == "__main__":
    main()