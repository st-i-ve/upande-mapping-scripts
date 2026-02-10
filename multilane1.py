import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import tkinter as tk
from tkinter import ttk
import numpy as np

class PolygonViewer:
    def __init__(self, root):
        self.root = root
        self.root.title("Polygon Edge Selector - Kaptumbo GH 03 - KR")
        self.root.geometry("1200x800")
        
        # GeoJSON coordinates
        self.coords = [
            [35.7486266142804, 0.09298520732512827],
            [35.74880627366329, 0.09244952638019299],
            [35.749824892916195, 0.09278247269176632],
            [35.749645233533215, 0.09332145012884041],
            [35.7486266142804, 0.09298520732512827]
        ]
        
        self.polygon_name = "Kaptumbo GH 03 - KR"
        
        # Edge labels based on our analysis
        self.edge_labels = {
            0: "Left",
            1: "Bottom",
            2: "Right",
            3: "Top"
        }
        
        # Current selection
        self.selected_edges = set()
        
        # Create UI
        self.create_widgets()
        self.draw_polygon()
    
    def create_widgets(self):
        # Control panel frame
        control_frame = ttk.Frame(self.root, padding="10")
        control_frame.pack(side=tk.TOP, fill=tk.X)
        
        # Title
        title_label = ttk.Label(control_frame, text="Edge Selection", 
                               font=('Arial', 14, 'bold'))
        title_label.pack(pady=5)
        
        # Button frame
        button_frame = ttk.Frame(control_frame)
        button_frame.pack(pady=10)
        
        # Polar Selection button (Top and Bottom)
        polar_btn = tk.Button(button_frame, text="Polar Selection\n(Top & Bottom)",
                             command=self.select_polar,
                             bg='#4CAF50', fg='white', font=('Arial', 11, 'bold'),
                             width=20, height=3, cursor='hand2')
        polar_btn.grid(row=0, column=0, padx=10)
        
        # Side to Side Selection button (Left and Right)
        side_btn = tk.Button(button_frame, text="Side to Side Selection\n(Left & Right)",
                            command=self.select_side_to_side,
                            bg='#2196F3', fg='white', font=('Arial', 11, 'bold'),
                            width=20, height=3, cursor='hand2')
        side_btn.grid(row=0, column=1, padx=10)
        
        # Clear Selection button
        clear_btn = tk.Button(button_frame, text="Clear Selection",
                             command=self.clear_selection,
                             bg='#FF5722', fg='white', font=('Arial', 11, 'bold'),
                             width=20, height=3, cursor='hand2')
        clear_btn.grid(row=0, column=2, padx=10)
        
        # Status label
        self.status_label = ttk.Label(control_frame, text="No edges selected", 
                                     font=('Arial', 10))
        self.status_label.pack(pady=5)
        
        # Canvas frame
        canvas_frame = ttk.Frame(self.root)
        canvas_frame.pack(side=tk.TOP, fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Create matplotlib figure
        self.fig, self.ax = plt.subplots(figsize=(10, 8))
        self.canvas = FigureCanvasTkAgg(self.fig, master=canvas_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
    
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
    
    def draw_polygon(self):
        self.ax.clear()
        
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
        
        self.ax.set_title(title, fontsize=14, fontweight='bold')
        self.ax.grid(True, alpha=0.3)
        self.ax.set_aspect('equal', adjustable='box')
        
        # Refresh canvas
        self.canvas.draw()
    
    def select_polar(self):
        """Select Top and Bottom edges"""
        self.selected_edges = {i for i, label in self.edge_labels.items() 
                              if label in ['Top', 'Bottom']}
        self.update_status("Polar Selection: Top & Bottom edges highlighted")
        self.draw_polygon()
    
    def select_side_to_side(self):
        """Select Left and Right edges"""
        self.selected_edges = {i for i, label in self.edge_labels.items() 
                              if label in ['Left', 'Right']}
        self.update_status("Side to Side Selection: Left & Right edges highlighted")
        self.draw_polygon()
    
    def clear_selection(self):
        """Clear all selections"""
        self.selected_edges = set()
        self.update_status("No edges selected")
        self.draw_polygon()
    
    def update_status(self, message):
        """Update status label"""
        self.status_label.config(text=message)

def main():
    root = tk.Tk()
    app = PolygonViewer(root)
    root.mainloop()

if __name__ == "__main__":
    main()