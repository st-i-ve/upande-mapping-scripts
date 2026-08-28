/**
 * Full set of map base layers, ported 1:1 from the vanilla app. Built at map
 * init (client-only) because some read localStorage (API keys) and the NASA
 * layer uses today's date. Local /tiles are served by FastAPI at the root
 * (nginx routes /tiles → uvicorn), so they stay absolute — not base-path'd.
 */
import L from "leaflet";
import type { BasemapKeys } from "@/lib/types";

/**
 * Esri advertises World Imagery to z23 worldwide, but coverage is regional: over
 * these farms (western Kenya) the deepest real tile is z18, Clarity stops at z17
 * and the labels overlay at z19. Ask past that and the service answers with a
 * grey "Map data not available" placeholder. maxNativeZoom makes Leaflet upscale
 * the deepest real tile instead — soft, but it still shows the ground.
 *
 * Re-probe if coverage improves: <service>/tilemap/{z}/{y}/{x}/1/1 answers
 * {"data":[1]} when a tile exists. Google, the default base, does have imagery
 * past z18 here — this cap is per-layer, not a cap on the map.
 */
const ESRI_IMAGERY_NATIVE_ZOOM = 18;
const ESRI_CLARITY_NATIVE_ZOOM = 17;
const ESRI_LABELS_NATIVE_ZOOM = 19;

/** Pane for reference overlays: above every base tile layer, below our data. */
export const LABEL_PANE = "reference-labels";

export interface BaseLayerSet {
  baseLayers: Record<string, L.Layer>;
  defaultLayer: L.Layer;
}

/** Key-gated provider layers (Mapbox / MapTiler / Stadia). Built from the
 *  in-app keys so they can be (re)added to the layer control reactively. */
export function buildKeyedLayers(keys: BasemapKeys): Record<string, L.Layer> {
  const keyed: Record<string, L.Layer> = {};
  if (keys.mapbox) {
    keyed["Mapbox Satellite"] = L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${keys.mapbox}`,
      { maxZoom: 22, tileSize: 512, zoomOffset: -1, attribution: "&copy; Mapbox" },
    );
    keyed["Mapbox Satellite Streets"] = L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${keys.mapbox}`,
      { maxZoom: 22, tileSize: 512, zoomOffset: -1, attribution: "&copy; Mapbox" },
    );
  }
  if (keys.maptiler) {
    keyed["MapTiler Satellite"] = L.tileLayer(
      `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${keys.maptiler}`,
      { maxZoom: 22, attribution: "&copy; MapTiler" },
    );
    keyed["MapTiler Hybrid"] = L.tileLayer(
      `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${keys.maptiler}`,
      { maxZoom: 22, attribution: "&copy; MapTiler" },
    );
  }
  if (keys.stadia) {
    keyed["Stadia Alidade Satellite"] = L.tileLayer(
      `https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}.jpg?api_key=${keys.stadia}`,
      { maxZoom: 20, attribution: "&copy; Stadia Maps" },
    );
    keyed["Stadia Outdoors"] = L.tileLayer(
      `https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}.png?api_key=${keys.stadia}`,
      { maxZoom: 20, attribution: "&copy; Stadia Maps" },
    );
  }
  return keyed;
}

/**
 * Reference overlays, drawn on top of whichever satellite base is selected —
 * unlike Google Hybrid, whose labels are welded to Google's own imagery. They
 * live in their own pane so switching the base layer doesn't bury them, and the
 * layer control offers them as checkboxes (off until ticked).
 */
export function buildOverlays(): Record<string, L.Layer> {
  return {
    "Place labels": L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        pane: LABEL_PANE,
        maxZoom: 22,
        maxNativeZoom: ESRI_LABELS_NATIVE_ZOOM,
        attribution: "Esri Reference (Boundaries and Places)",
      },
    ),
  };
}

export function buildBaseLayers(): BaseLayerSet {
  const g = (lyr: string) =>
    L.tileLayer(`https://mt{s}.google.com/vt/lyrs=${lyr}&x={x}&y={y}&z={z}`, {
      maxZoom: 22,
      subdomains: ["0", "1", "2", "3"],
      attribution: "&copy; Google",
    });

  const googleSat = g("s");
  const googleHybrid = g("y");
  const googleTerrain = g("p");
  const googleRoad = g("m");

  const esri = (svc: string, max = 22, native?: number) =>
    L.tileLayer(
      `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`,
      { maxZoom: max, maxNativeZoom: native, attribution: `Esri ${svc}` },
    );

  const esriSat = esri("World_Imagery", 22, ESRI_IMAGERY_NATIVE_ZOOM);
  const esriTopo = esri("World_Topo_Map", 19);
  const esriStreet = esri("World_Street_Map", 19);
  const esriClarity = L.tileLayer(
    "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 22,
      maxNativeZoom: ESRI_CLARITY_NATIVE_ZOOM,
      attribution: "Esri Clarity (World Imagery)",
    },
  );

  const yandexSat = L.tileLayer(
    "https://sat0{s}.maps.yandex.net/tiles?l=sat&v=3.456.0&x={x}&y={y}&z={z}",
    { maxZoom: 19, subdomains: ["1", "2", "3", "4"], attribution: "&copy; Yandex" },
  );

  const lokitela = L.tileLayer("/tiles/lokitela/lokitela/{z}/{x}/{y}.png", {
    minZoom: 12,
    maxZoom: 16,
    attribution: "Lokitela (local tiles)",
  });
  const archive = L.tileLayer("/tiles/archive/{z}/{x}/{y}.png", {
    minZoom: 12,
    maxZoom: 18,
    attribution: "Archive (local tiles)",
  });

  const openTopo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: "&copy; OpenTopoMap (CC-BY-SA)",
  });
  const osmHot = L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OSM HOT",
  });
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 22,
    attribution: "&copy; OpenStreetMap",
  });
  const cartoLight = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { maxZoom: 20, subdomains: "abcd", attribution: "&copy; CARTO" },
  );
  const cartoDark = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    { maxZoom: 20, subdomains: "abcd", attribution: "&copy; CARTO" },
  );

  // Bing Aerial — quadkey tile addressing via a custom TileLayer.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const BingAerial = (L.TileLayer as any).extend({
    getTileUrl(coords: L.Coords) {
      let q = "";
      for (let i = coords.z; i > 0; i--) {
        let d = 0;
        const mask = 1 << (i - 1);
        if ((coords.x & mask) !== 0) d++;
        if ((coords.y & mask) !== 0) d += 2;
        q += d;
      }
      const sub = (this as any)._getSubdomain(coords);
      return `https://ecn.t${sub}.tiles.virtualearth.net/tiles/a${q}.jpeg?g=1`;
    },
  });
  const bingAerial = new BingAerial("", {
    maxZoom: 21,
    subdomains: ["0", "1", "2", "3"],
    attribution: "&copy; Microsoft Bing",
  }) as L.Layer;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // NASA GIBS VIIRS true-color from yesterday's pass (low-res regional context).
  const gibsDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const nasaViirs = L.tileLayer(
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    { maxZoom: 9, attribution: `NASA GIBS VIIRS ${gibsDate}` },
  );

  const baseLayers: Record<string, L.Layer> = {
    "Google Satellite (latest)": googleSat,
    "Google Hybrid": googleHybrid,
    "Google Terrain": googleTerrain,
    "Google Road": googleRoad,
    "Yandex Satellite": yandexSat,
    "Bing Aerial": bingAerial,
    "Esri Clarity": esriClarity,
    "Esri World Imagery": esriSat,
    "Esri World Topo": esriTopo,
    "Esri World Street": esriStreet,
    Lokitela: lokitela,
    Archive: archive,
    OpenTopoMap: openTopo,
    "OSM Humanitarian": osmHot,
    "Carto Light": cartoLight,
    "Carto Dark": cartoDark,
    [`NASA VIIRS (${gibsDate})`]: nasaViirs,
    OSM: osm,
  };

  return { baseLayers, defaultLayer: googleSat };
}

/** One entry of Esri's waybackconfig.json (only the fields we use). */
export interface WaybackEntry {
  itemURL?: string;
  itemTitle?: string;
}

/** Release date embedded in a Wayback title: "World Imagery (Wayback 2026-08-05)". */
function waybackDate(title?: string): string {
  return /(\d{4}-\d{2}-\d{2})/.exec(title ?? "")?.[1] ?? "";
}

/**
 * Newest Wayback release, as a Leaflet URL template and a label.
 *
 * Picked by the date in the title, NOT by the numeric config key: those keys are
 * release ids in no chronological order — the highest one is a 2023 release,
 * while the newest is filed under a much lower number. Sorting by key served
 * three-year-old imagery from a layer whose whole point is being current.
 */
export function pickWaybackRelease(
  cfg: Record<string, WaybackEntry>,
): { url: string; label: string } | null {
  const newest = Object.values(cfg ?? {})
    .filter((e) => e?.itemURL && waybackDate(e.itemTitle))
    .sort((a, b) => waybackDate(b.itemTitle).localeCompare(waybackDate(a.itemTitle)))[0];
  if (!newest?.itemURL) return null;
  return {
    url: newest.itemURL
      .replace("{level}", "{z}")
      .replace("{row}", "{y}")
      .replace("{col}", "{x}"),
    label: `Esri Wayback (${waybackDate(newest.itemTitle)})`,
  };
}

/** Esri Wayback — freshest imagery release, fetched async and added as a base layer. */
export function addWayback(control: L.Control.Layers) {
  fetch("https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json")
    .then((r) => r.json())
    .then((cfg: Record<string, WaybackEntry>) => {
      const release = pickWaybackRelease(cfg);
      if (!release) return;
      const wb = L.tileLayer(release.url, {
        maxZoom: 22,
        maxNativeZoom: ESRI_IMAGERY_NATIVE_ZOOM,
        attribution: release.label,
      });
      control.addBaseLayer(wb, release.label);
    })
    .catch(() => {
      /* offline / blocked — skip the wayback layer */
    });
}
