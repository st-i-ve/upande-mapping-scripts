/**
 * Typed wrappers over the FastAPI backend (`/api/*`), which is unchanged by
 * the migration. All calls are same-origin: in dev, next.config rewrites
 * `/api/*` to the local uvicorn server; in prod, nginx routes it.
 */
import type { FeatureCollection, GeoGeometry, OutputInfo, SavedShape, TerraceResult, UnitItem } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** application/json, application/geo+json, …+json (with or without a charset). */
export const isJsonType = (ct: string) => /^application\/([\w.-]+\+)?json\b/i.test(ct.trim());

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  const ct = res.headers.get("content-type") ?? "";
  // Any JSON flavour — outputs come back as application/geo+json, and reading
  // those as text handed the map a string instead of a FeatureCollection.
  return (isJsonType(ct) ? res.json() : res.text()) as Promise<T>;
}

/** What a tile download needs: the service, the zooms and the area to cover. */
export interface TileJob {
  url: string;
  subdomains: string[];
  min_zoom: number;
  max_zoom: number;
  format: string;
  area: GeoGeometry;
}

/** A downloaded tile layer on the server, with its download progress. */
export interface TileLayerInfo {
  name: string;
  slug: string;
  source_url: string;
  format: string;
  min_zoom: number;
  max_zoom: number;
  state: "starting" | "downloading" | "done" | "stopped" | "error";
  current: number;
  total: number;
  failed: number;
  created: string;
  /** Leaflet template for the stored tiles, e.g. /tiles/downloaded/x/{z}/{x}/{y}.png */
  tile_url: string;
  area: { geometry: GeoGeometry };
}

/** A project as listed: a named set of shapes kept on the server. */
export interface ProjectSummary {
  name: string;
  slug: string;
  created: string;
  updated: string;
  /** Bumped on every save; a save based on an older version is refused (409). */
  version: number;
  shape_count: number;
}

export interface Project extends Omit<ProjectSummary, "shape_count"> {
  shapes: SavedShape[];
  /** Every folder path in the project, empty ones included ("Greenhouses/GH-A"). */
  folders?: string[];
  /** Generated results filed in the project (pointers to saved outputs). */
  units?: UnitItem[];
  /** A slicing session in progress (cuts not yet finished), or null. */
  draft?: unknown;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export interface GenerateParams {
  [key: string]: unknown;
}

export interface GenerateResponse {
  filename: string;
  result: FeatureCollection;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),

  /** Generate beds & zones. Pass an AbortSignal to support Cancel. */
  generate: (params: GenerateParams, signal?: AbortSignal) =>
    request<GenerateResponse>("/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal,
    }),

  preview: (params: GenerateParams, signal?: AbortSignal) =>
    request<FeatureCollection>("/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal,
    }),

  terraceSections: (params: GenerateParams, signal?: AbortSignal) =>
    request<TerraceResult>("/terrace_sections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal,
    }),

  listOutputs: () => request<{ outputs: OutputInfo[] }>("/outputs"),

  /** Store a client-generated FeatureCollection alongside the server's outputs. */
  saveOutput: (name: string, geojson: FeatureCollection, signal?: AbortSignal) =>
    request<{ filename: string }>("/outputs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, geojson }),
      signal,
    }),

  getOutput: (filename: string) =>
    request<FeatureCollection>(`/outputs/${encodeURIComponent(filename)}`),

  deleteOutput: (filename: string) =>
    request<{ ok: boolean; deleted: string }>(
      `/outputs/${encodeURIComponent(filename)}`,
      { method: "DELETE" },
    ),

  /** URL for the Frappe-format export (used as a download href). */
  frappeUrl: (filename: string) =>
    `/api/outputs/${encodeURIComponent(filename)}/frappe`,

  // ---- downloaded tile layers ----
  countTiles: (job: TileJob) =>
    request<{ count: number; max: number; est_bytes: number }>("/tiles/count", json(job)),

  /** Start downloading; returns at once — poll listTileLayers for progress. */
  downloadTiles: (job: TileJob & { name: string }) =>
    request<TileLayerInfo>("/tiles/download", json(job)),

  /** Add layers from a Tile Cache Inspector export (<layer>/<z>/<x>/<y>.<ext> zip). */
  // XHR rather than fetch: only XHR reports upload progress.
  uploadTileZip: (file: File, name: string, opts: { onProgress?: (sent: number, total: number) => void; signal?: AbortSignal } = {}) =>
    new Promise<{ layers: TileLayerInfo[] }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/tiles/upload?name=${encodeURIComponent(name)}`);
      xhr.setRequestHeader("content-type", "application/zip");
      xhr.responseType = "json";
      xhr.upload.onprogress = (e) => opts.onProgress?.(e.loaded, e.lengthComputable ? e.total : file.size);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
        else reject(new ApiError(xhr.status, xhr.response?.detail ?? xhr.statusText ?? "Upload failed"));
      };
      xhr.onerror = () => reject(new ApiError(0, "Upload failed — network error"));
      xhr.onabort = () => reject(new ApiError(0, "Upload cancelled"));
      opts.signal?.addEventListener("abort", () => xhr.abort());
      xhr.send(file);
    }),

  renameTileLayer: (slug: string, name: string) =>
    request<TileLayerInfo>(`/tiles/layers/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  listTileLayers: () => request<{ layers: TileLayerInfo[] }>("/tiles/layers"),

  // ---- projects (shapes stored on the server) ----
  listProjects: () => request<{ projects: ProjectSummary[] }>("/projects"),
  createProject: (name: string, shapes: SavedShape[], folders: string[] = [], units: UnitItem[] = []) =>
    request<Project>("/projects", json({ name, shapes, folders, units })),
  getProject: (slug: string) => request<Project>(`/projects/${encodeURIComponent(slug)}`),
  /** `draft`: the slicing session to keep with the project (null clears it; undefined leaves it). */
  saveProjectShapes: (slug: string, shapes: SavedShape[], folders: string[], baseVersion: number, force = false, units?: UnitItem[], draft?: unknown) =>
    request<ProjectSummary>(`/projects/${encodeURIComponent(slug)}/shapes`, {
      ...json(draft === undefined
        ? { shapes, folders, units, base_version: baseVersion, force }
        : { shapes, folders, units, draft, base_version: baseVersion, force }),
      method: "PUT",
    }),
  renameProject: (slug: string, name: string) =>
    request<ProjectSummary>(`/projects/${encodeURIComponent(slug)}`, { ...json({ name }), method: "PATCH" }),
  deleteProject: (slug: string) =>
    request<{ deleted: string }>(`/projects/${encodeURIComponent(slug)}`, { method: "DELETE" }),

  deleteTileLayer: (slug: string) =>
    request<{ deleted: string }>(`/tiles/layers/${encodeURIComponent(slug)}`, { method: "DELETE" }),
};
