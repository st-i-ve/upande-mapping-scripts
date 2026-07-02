/**
 * Typed wrappers over the FastAPI backend (`/api/*`), which is unchanged by
 * the migration. All calls are same-origin: in dev, next.config rewrites
 * `/api/*` to the local uvicorn server; in prod, nginx routes it.
 */
import type { FeatureCollection, OutputInfo } from "@/lib/types";

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
    request<FeatureCollection>("/terrace_sections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal,
    }),

  listOutputs: () => request<{ outputs: OutputInfo[] }>("/outputs"),

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
};
