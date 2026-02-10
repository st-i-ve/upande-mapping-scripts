import pandas as pd
import numpy as np
import re
from io import StringIO
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import threading
import os
import csv

class CSVCleanerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("CSV Cleaner for Scouting Data")
        self.root.geometry("900x800")
        
        # Variables
        self.template_headers = tk.StringVar(value="ID,Series,Scouts Name,Greenhouse,Zone,Time Of Capture,Date Of Capture,Latitude,Longitude,Bed,ID (Pests),Count (Pests),Pest (Pests),Plant Section (Pests),Stage (Pests),ID (Diseases),Disease (Diseases),Plant Section (Diseases),Stage (Diseases),ID (Predators),Count (Predators),Plant Section (Predators),Predator (Predators),Stage (Predators),ID (Weeds),Weed (Weeds),ID (Incidents),Incident (Incidents),ID (Physiological Disorders),Physiological Disorders (Physiological Disorders),ID (Traps),Count (Traps),Location (Traps),Pest (Traps),Trap (Traps)")
        self.input_file_path = tk.StringVar()
        self.output_file_path = tk.StringVar()
        self.processing = False
        
        self.setup_ui()
    
    def setup_ui(self):
        # Create main frame with padding
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        
        # Row 0: Title
        title_label = ttk.Label(main_frame, text="CSV Cleaner for Scouting Data", 
                               font=("Arial", 16, "bold"))
        title_label.grid(row=0, column=0, columnspan=3, pady=(0, 20))
        
        # Row 1: Input File Selection
        ttk.Label(main_frame, text="Input CSV File:").grid(row=1, column=0, sticky=tk.W, pady=5)
        ttk.Entry(main_frame, textvariable=self.input_file_path, width=60).grid(row=1, column=1, sticky=(tk.W, tk.E), padx=5)
        ttk.Button(main_frame, text="Browse", command=self.browse_input_file).grid(row=1, column=2, padx=5)
        
        # Row 2: Template Headers
        ttk.Label(main_frame, text="Template Headers (comma-separated):").grid(row=2, column=0, sticky=tk.W, pady=5)
        
        # Use a scrolled text widget for template headers
        self.headers_text = scrolledtext.ScrolledText(main_frame, height=6, width=60)
        self.headers_text.grid(row=2, column=1, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5, padx=5)
        self.headers_text.insert("1.0", self.template_headers.get())
        
        # Row 3: Output File Selection
        ttk.Label(main_frame, text="Output CSV File:").grid(row=3, column=0, sticky=tk.W, pady=5)
        ttk.Entry(main_frame, textvariable=self.output_file_path, width=60).grid(row=3, column=1, sticky=(tk.W, tk.E), padx=5)
        ttk.Button(main_frame, text="Browse", command=self.browse_output_file).grid(row=3, column=2, padx=5)
        
        # Row 4: Action Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=4, column=0, columnspan=3, pady=20)
        
        self.clean_button = ttk.Button(button_frame, text="Clean CSV", command=self.start_cleaning)
        self.clean_button.grid(row=0, column=0, padx=5)
        
        ttk.Button(button_frame, text="Preview Input", command=self.preview_input).grid(row=0, column=1, padx=5)
        ttk.Button(button_frame, text="Reset", command=self.reset).grid(row=0, column=2, padx=5)
        
        # Row 5: Progress bar
        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(main_frame, variable=self.progress_var, maximum=100)
        self.progress_bar.grid(row=5, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=10)
        
        # Row 6: Status label
        self.status_label = ttk.Label(main_frame, text="Ready")
        self.status_label.grid(row=6, column=0, columnspan=3, pady=5)
        
        # Row 7: Results text area
        ttk.Label(main_frame, text="Results:").grid(row=7, column=0, sticky=tk.W, pady=5)
        
        self.results_text = scrolledtext.ScrolledText(main_frame, height=20, width=100)
        self.results_text.grid(row=8, column=0, columnspan=3, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        
        # Configure grid weights for resizing
        main_frame.rowconfigure(8, weight=1)
        
    def browse_input_file(self):
        filename = filedialog.askopenfilename(
            title="Select CSV file to clean",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
        )
        if filename:
            self.input_file_path.set(filename)
            # Auto-generate output filename
            base_name = os.path.splitext(filename)[0]
            self.output_file_path.set(f"{base_name}_cleaned.csv")
    
    def browse_output_file(self):
        filename = filedialog.asksaveasfilename(
            title="Save cleaned CSV as",
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
        )
        if filename:
            self.output_file_path.set(filename)
    
    def get_template_headers(self):
        """Get template headers from the text widget"""
        headers_text = self.headers_text.get("1.0", tk.END).strip()
        headers = [h.strip() for h in headers_text.split(',') if h.strip()]
        return headers
    
    def start_cleaning(self):
        if self.processing:
            return
            
        if not self.input_file_path.get():
            messagebox.showerror("Error", "Please select an input CSV file")
            return
            
        if not self.output_file_path.get():
            messagebox.showerror("Error", "Please select an output CSV file")
            return
            
        template_headers = self.get_template_headers()
        if not template_headers:
            messagebox.showerror("Error", "Please enter template headers")
            return
        
        # Start cleaning in a separate thread
        self.processing = True
        self.clean_button.config(state="disabled")
        self.status_label.config(text="Processing...")
        self.progress_var.set(0)
        
        thread = threading.Thread(
            target=self.clean_csv,
            args=(self.input_file_path.get(), template_headers, self.output_file_path.get())
        )
        thread.daemon = True
        thread.start()
    
    def parse_csv_with_separators(self, filepath):
        """Parse CSV file that contains ~ separators between sections"""
        with open(filepath, 'r') as f:
            lines = f.readlines()
        
        # Find the start of data line
        data_start_index = None
        for i, line in enumerate(lines):
            if 'Start entering data below this line' in line:
                data_start_index = i + 1
                break
        
        if data_start_index is None:
            raise ValueError("Could not find 'Start entering data below this line'")
        
        # Get the data lines
        data_lines = lines[data_start_index:]
        
        # Parse CSV with proper handling of quoted fields
        data = []
        reader = csv.reader(data_lines, quotechar='"', delimiter=',', quoting=csv.QUOTE_ALL, skipinitialspace=True)
        
        for row in reader:
            # Clean up the row - remove empty strings and handle ~ separators
            cleaned_row = []
            for cell in row:
                # Remove quotes if present
                if cell.startswith('"') and cell.endswith('"'):
                    cell = cell[1:-1]
                cleaned_row.append(cell)
            data.append(cleaned_row)
        
        return data
    
    def clean_csv(self, input_file_path, template_headers, output_file_path):
        try:
            # Parse the CSV data
            data = self.parse_csv_with_separators(input_file_path)
            
            if not data or len(data) == 0:
                self.show_error("No data found in the file")
                return
            
            self.update_progress(20)
            
            # Get metadata from the file to understand column structure
            with open(input_file_path, 'r') as f:
                all_lines = f.readlines()
            
            # Find metadata: DocType and Column Name lines
            doctype_line = None
            column_name_line = None
            for line in all_lines:
                if line.startswith('"DocType:"'):
                    doctype_line = line.strip()
                elif line.startswith('"Column Name:"'):
                    column_name_line = line.strip()
            
            if not doctype_line or not column_name_line:
                self.show_error("Could not find required metadata (DocType and Column Name)")
                return
            
            # Parse DocType and Column Name lines
            doctype_parts = [x.strip('"') for x in doctype_line.split(',')[1:]]
            column_name_parts = [x.strip('"') for x in column_name_line.split(',')[1:]]
            
            self.update_progress(40)
            
            # Analyze the structure
            # The data has a hierarchical structure with ~ separators
            # We need to map columns to their sections
            
            # First, let's understand the column structure from the first data row
            first_row = data[0] if data else []
            
            # Create a map of column positions to column names
            column_map = {}
            
            # Process through the column_name_parts, tracking which doctype we're in
            current_doctype = "Scouting Entry"
            col_index = 0
            
            for i, col_name in enumerate(column_name_parts):
                if col_name == "~":
                    continue  # Skip separators
                
                # Check if this is a new doctype
                if col_name in ["Pests Scouting Entry", "Diseases Scouting Entry", 
                               "Predators Scouting Entry", "Weeds Scouting Entry",
                               "Incidents Scouting Entry", "Physiological Disorders Entry",
                               "Trap Scouting Entry"]:
                    current_doctype = col_name
                    continue
                
                # Store mapping
                column_map[col_index] = (current_doctype, col_name)
                col_index += 1
            
            self.update_progress(60)
            
            # Now process the data rows
            cleaned_data = []
            
            # We need to handle the hierarchical data - multiple child records per parent
            # Let's group by main entry ID
            
            # First, collect all main entries
            main_entries = {}
            
            for row in data:
                if len(row) == 0:
                    continue
                
                # Find main entry ID (first non-empty cell after empty first column)
                main_id = None
                for i, cell in enumerate(row):
                    if i in column_map:
                        doctype, col_name = column_map[i]
                        if doctype == "Scouting Entry" and col_name == "name" and cell:
                            main_id = cell
                            break
                
                if not main_id:
                    continue
                
                # Initialize main entry if not exists
                if main_id not in main_entries:
                    main_entries[main_id] = {
                        "ID": main_id,
                        "Scouts Name": "",
                        "Greenhouse": "",
                        "Zone": "",
                        "Time Of Capture": "",
                        "Date Of Capture": "",
                        "Latitude": "",
                        "Longitude": "",
                        "Bed": "",
                        # Initialize child data as lists to collect multiple entries
                        "Pests": [],
                        "Diseases": [],
                        "Predators": [],
                        "Weeds": [],
                        "Incidents": [],
                        "Physiological Disorders": [],
                        "Traps": []
                    }
                
                # Extract main entry data
                for i, cell in enumerate(row):
                    if i in column_map:
                        doctype, col_name = column_map[i]
                        
                        if doctype == "Scouting Entry":
                            # Map to template columns
                            if col_name == "name":
                                continue  # Already have ID
                            elif col_name == "scouts_name":
                                main_entries[main_id]["Scouts Name"] = cell
                            elif col_name == "greenhouse":
                                main_entries[main_id]["Greenhouse"] = cell
                            elif col_name == "zone":
                                main_entries[main_id]["Zone"] = cell
                            elif col_name == "time_of_capture":
                                main_entries[main_id]["Time Of Capture"] = cell
                            elif col_name == "date_of_capture":
                                main_entries[main_id]["Date Of Capture"] = cell
                            elif col_name == "latitude":
                                main_entries[main_id]["Latitude"] = cell
                            elif col_name == "longitude":
                                main_entries[main_id]["Longitude"] = cell
                            elif col_name == "bed":
                                main_entries[main_id]["Bed"] = cell
                        
                        # Extract child data
                        elif doctype == "Pests Scouting Entry" and col_name == "name" and cell:
                            # Found a pest entry
                            pest_data = {
                                "ID": cell,
                                "Pest": row[i+1] if i+1 < len(row) and i+1 in column_map and column_map[i+1][1] == "pest" else "",
                                "Plant Section": row[i+2] if i+2 < len(row) and i+2 in column_map and column_map[i+2][1] == "plant_section" else "",
                                "Stage": row[i+3] if i+3 < len(row) and i+3 in column_map and column_map[i+3][1] == "stage" else "",
                                "Count": row[i+4] if i+4 < len(row) and i+4 in column_map and column_map[i+4][1] == "count" else ""
                            }
                            main_entries[main_id]["Pests"].append(pest_data)
                        
                        elif doctype == "Diseases Scouting Entry" and col_name == "name" and cell:
                            # Found a disease entry
                            disease_data = {
                                "ID": cell,
                                "Disease": row[i+1] if i+1 < len(row) and i+1 in column_map and column_map[i+1][1] == "disease" else "",
                                "Plant Section": row[i+2] if i+2 < len(row) and i+2 in column_map and column_map[i+2][1] == "plant_section" else "",
                                "Stage": row[i+3] if i+3 < len(row) and i+3 in column_map and column_map[i+3][1] == "stage" else ""
                            }
                            main_entries[main_id]["Diseases"].append(disease_data)
                        
                        elif doctype == "Weeds Scouting Entry" and col_name == "name" and cell:
                            # Found a weed entry
                            weed_data = {
                                "ID": cell,
                                "Weed": row[i+1] if i+1 < len(row) and i+1 in column_map and column_map[i+1][1] == "weed" else ""
                            }
                            main_entries[main_id]["Weeds"].append(weed_data)
            
            self.update_progress(80)
            
            # Now flatten the data for output
            cleaned_rows = []
            
            for main_id, entry_data in main_entries.items():
                # Create base row
                row_data = {
                    "ID": entry_data["ID"],
                    "Series": "",  # Not in original data
                    "Scouts Name": entry_data["Scouts Name"],
                    "Greenhouse": entry_data["Greenhouse"],
                    "Zone": entry_data["Zone"],
                    "Time Of Capture": entry_data["Time Of Capture"],
                    "Date Of Capture": entry_data["Date Of Capture"],
                    "Latitude": entry_data["Latitude"],
                    "Longitude": entry_data["Longitude"],
                    "Bed": entry_data["Bed"]
                }
                
                # Add child data - take first of each type if exists
                if entry_data["Pests"]:
                    pest = entry_data["Pests"][0]
                    row_data["ID (Pests)"] = pest.get("ID", "")
                    row_data["Pest (Pests)"] = pest.get("Pest", "")
                    row_data["Plant Section (Pests)"] = pest.get("Plant Section", "")
                    row_data["Stage (Pests)"] = pest.get("Stage", "")
                    row_data["Count (Pests)"] = pest.get("Count", "")
                
                if entry_data["Diseases"]:
                    disease = entry_data["Diseases"][0]
                    row_data["ID (Diseases)"] = disease.get("ID", "")
                    row_data["Disease (Diseases)"] = disease.get("Disease", "")
                    row_data["Plant Section (Diseases)"] = disease.get("Plant Section", "")
                    row_data["Stage (Diseases)"] = disease.get("Stage", "")
                
                if entry_data["Weeds"]:
                    weed = entry_data["Weeds"][0]
                    row_data["ID (Weeds)"] = weed.get("ID", "")
                    row_data["Weed (Weeds)"] = weed.get("Weed", "")
                
                # Add other child types (initialize empty)
                for child_type in ["Predators", "Incidents", "Physiological Disorders", "Traps"]:
                    row_data[f"ID ({child_type})"] = ""
                    if child_type == "Predators":
                        row_data[f"Count ({child_type})"] = ""
                        row_data[f"Plant Section ({child_type})"] = ""
                        row_data[f"Predator ({child_type})"] = ""
                        row_data[f"Stage ({child_type})"] = ""
                    elif child_type == "Traps":
                        row_data[f"Count ({child_type})"] = ""
                        row_data[f"Location ({child_type})"] = ""
                        row_data[f"Pest ({child_type})"] = ""
                        row_data[f"Trap ({child_type})"] = ""
                    elif child_type == "Incidents":
                        row_data[f"Incident ({child_type})"] = ""
                    elif child_type == "Physiological Disorders":
                        row_data[f"Physiological Disorders ({child_type})"] = ""
                
                cleaned_rows.append(row_data)
            
            # Create DataFrame
            cleaned_df = pd.DataFrame(cleaned_rows)
            
            # Reorder columns according to template
            final_columns = []
            for header in template_headers:
                if header in cleaned_df.columns:
                    final_columns.append(header)
            
            # Add any missing columns with NaN
            for header in template_headers:
                if header not in cleaned_df.columns:
                    cleaned_df[header] = np.nan
            
            # Reorder columns
            cleaned_df = cleaned_df[template_headers]
            
            # Clean up NaN values
            cleaned_df = cleaned_df.replace({np.nan: None})
            
            self.update_progress(90)
            
            # Save to CSV
            cleaned_df.to_csv(output_file_path, index=False)
            
            self.update_progress(100)
            
            # Display results
            result_text = f"""
Cleaning completed successfully!

Input file: {input_file_path}
Output file: {output_file_path}

File Information:
- Total rows: {len(cleaned_df)}
- Total columns: {len(cleaned_df.columns)}

Columns in output:
{', '.join(cleaned_df.columns.tolist())}

First 5 rows:
{cleaned_df.head().to_string()}
            """
            
            self.root.after(0, self.show_results, result_text)
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            self.show_error(f"Error during processing:\n{str(e)}\n\nDetails:\n{error_details}")
    
    def update_progress(self, value):
        self.root.after(0, lambda: self.progress_var.set(value))
    
    def show_error(self, message):
        self.root.after(0, lambda: messagebox.showerror("Error", message))
        self.root.after(0, self.reset_ui)
    
    def show_results(self, result_text):
        self.results_text.delete("1.0", tk.END)
        self.results_text.insert("1.0", result_text)
        self.status_label.config(text="Processing complete!")
        self.reset_ui()
    
    def reset_ui(self):
        self.processing = False
        self.clean_button.config(state="normal")
    
    def preview_input(self):
        if not self.input_file_path.get():
            messagebox.showerror("Error", "Please select an input CSV file first")
            return
        
        try:
            # Try to parse and show the actual data
            data = self.parse_csv_with_separators(self.input_file_path.get())
            
            if not data:
                preview_text = "No data found in file"
            else:
                # Show first 10 rows of parsed data
                preview_lines = []
                for i, row in enumerate(data[:10]):
                    preview_lines.append(f"Row {i}: {row}")
                preview_text = "\n".join(preview_lines)
            
            # Show preview in a new window
            preview_window = tk.Toplevel(self.root)
            preview_window.title("CSV Data Preview (Parsed)")
            preview_window.geometry("800x500")
            
            text_widget = scrolledtext.ScrolledText(preview_window, wrap=tk.WORD)
            text_widget.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
            text_widget.insert("1.0", preview_text)
            text_widget.config(state="disabled")
            
        except Exception as e:
            messagebox.showerror("Error", f"Could not preview file:\n{str(e)}")
    
    def reset(self):
        self.input_file_path.set("")
        self.output_file_path.set("")
        self.headers_text.delete("1.0", tk.END)
        self.headers_text.insert("1.0", self.template_headers.get())
        self.results_text.delete("1.0", tk.END)
        self.status_label.config(text="Ready")
        self.progress_var.set(0)

def main():
    root = tk.Tk()
    app = CSVCleanerApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()