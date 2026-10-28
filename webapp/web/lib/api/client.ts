/**
 * Typed wrappers over the FastAPI backend (`/api/*`), which is unchanged by
 * the migration. All calls are same-origin: in dev, next.config rewrites
 * `/api/*` to the local uvicorn server; in prod, nginx routes it.
 */
import type { FeatureCollection, GeoGeometry, OutputInfo, TerraceResult } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
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

  listTileLayers: () => request<{ layers: TileLayerInfo[] }>("/tiles/layers"),

  deleteTileLayer: (slug: string) =>
    request<{ deleted: string }>(`/tiles/layers/${encodeURIComponent(slug)}`, { method: "DELETE" }),
};
