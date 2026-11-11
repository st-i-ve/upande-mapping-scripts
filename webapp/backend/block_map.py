"""The block map of a project, as a download: every shape in its "Blocks" folder
with its name and area — a picture to print or send, a map to open in any
browser, and the GeoJSON / KML for GIS and Google Earth — zipped together.

Served like the tile-cache extension: built fresh from the project on each request.
"""
from __future__ import annotations

import html
import io
import json
import math
import re
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from fastapi import APIRouter, HTTPException, Response
from pyproj import Geod
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from projects import _read

router = APIRouter(prefix="/api/projects")

TILES = Path(__file__).resolve().parent.parent.parent / "tiles" / "downloaded"
ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
GEOD = Geod(ellps="WGS84")
_NUM = re.compile(r"(\d+)")


def _natural(name: str) -> list[Any]:
    """A2 before A10, D9A before D9B."""
    return [int(p) if p.isdigit() else p.lower() for p in _NUM.split(name)]


def _hectares(geom) -> float:
    return abs(GEOD.geometry_area_perimeter(geom)[0]) / 10_000


def _blocks(project: dict[str, Any], folder: str) -> list[dict[str, Any]]:
    out = []
    for s in project["shapes"]:
        f = s.get("folder") or ""
        if f != folder and not f.startswith(folder + "/"):
            continue
        g = shape(s["geometry"])
        if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        out.append({"name": s["name"], "geom": g, "color": s.get("color") or "#f97316",
                    "ha": round(_hectares(g), 2), "parts": len(getattr(g, "geoms", [g]))})
    out.sort(key=lambda b: _natural(b["name"]))
    return out


def _label_point(g):
    """Inside the block — on its biggest part when it has several."""
    if g.geom_type == "MultiPolygon":
        g = max(g.geoms, key=lambda p: p.area)
    return g.representative_point()


# ---------------------------------------------------------------- picture (PNG)

def _tile_xy(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def _tile(z: int, x: int, y: int):
    """Imagery for one tile: a downloaded layer if one has it, else Esri online."""
    from PIL import Image
    for d in sorted(TILES.glob("*/")):
        meta = d / "layer.json"
        if not meta.is_file():
            continue
        try:
            fmt = json.loads(meta.read_text()).get("format", "jpg")
        except ValueError:
            continue
        if "sketch" in d.name:
            continue  # annotation layers aren't imagery
        p = d / str(z) / str(x) / f"{y}.{fmt}"
        if p.is_file():
            try:
                return Image.open(p).convert("RGB")
            except OSError:
                pass
    try:
        req = urllib.request.Request(ESRI.format(z=z, x=x, y=y), headers={"User-Agent": "upande-mapper"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return Image.open(io.BytesIO(r.read())).convert("RGB")
    except Exception:
        return None


def _picture(blocks: list[dict[str, Any]], title: str, max_px: int = 4200) -> bytes:
    from PIL import Image, ImageDraw, ImageFont
    allg = unary_union([b["geom"] for b in blocks])
    x0, y0, x1, y1 = allg.bounds
    pad = 0.06 * max(x1 - x0, y1 - y0)
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    z = 19
    while z > 10:
        a, b = _tile_xy(x0, y1, z), _tile_xy(x1, y0, z)
        if (b[0] - a[0]) * 256 <= max_px and (b[1] - a[1]) * 256 <= max_px:
            break
        z -= 1
    (ax, ay), (bx, by) = _tile_xy(x0, y1, z), _tile_xy(x1, y0, z)
    W, H = int((bx - ax) * 256), int((by - ay) * 256)
    img = Image.new("RGB", (W, H), (38, 42, 38))
    coords = [(tx, ty) for tx in range(int(ax), int(bx) + 1) for ty in range(int(ay), int(by) + 1)]
    with ThreadPoolExecutor(8) as ex:
        for (tx, ty), t in zip(coords, ex.map(lambda c: _tile(z, *c), coords)):
            if t is not None:
                img.paste(t, (int((tx - ax) * 256), int((ty - ay) * 256)))
    img = Image.blend(img, Image.new("RGB", img.size, (0, 0, 0)), 0.25)  # let the lines and names read

    def px(lon: float, lat: float) -> tuple[float, float]:
        x, y = _tile_xy(lon, lat, z)
        return (x - ax) * 256, (y - ay) * 256

    fill = Image.new("RGBA", img.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(fill)
    for b in blocks:
        rgb = tuple(int(b["color"].lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
        for p in getattr(b["geom"], "geoms", [b["geom"]]):
            fd.polygon([px(*c) for c in p.exterior.coords], fill=rgb + (55,))
    img = Image.alpha_composite(img.convert("RGBA"), fill)
    d = ImageDraw.Draw(img)
    lw = max(2, W // 1400)
    for b in blocks:
        for p in getattr(b["geom"], "geoms", [b["geom"]]):
            d.line([px(*c) for c in p.exterior.coords], fill=(255, 255, 255, 255), width=lw, joint="curve")
    # The farm's outer boundary, heavier.
    for p in getattr(allg.buffer(0.00002).buffer(-0.00002), "geoms", [allg]):
        if p.geom_type == "Polygon" and p.area > 1e-8:
            d.line([px(*c) for c in p.exterior.coords], fill=(250, 204, 21, 255), width=lw * 2, joint="curve")
    size = max(14, W // 120)
    font = ImageFont.truetype(FONT, size)
    small = ImageFont.truetype(FONT, int(size * 0.62))
    for b in blocks:
        c = _label_point(b["geom"])
        x, y = px(c.x, c.y)
        d.text((x, y), b["name"], font=font, anchor="mm", fill="white", stroke_width=max(2, size // 7), stroke_fill="black")
        d.text((x, y + size * 0.95), f"{b['ha']:.2f} ha", font=small, anchor="mm", fill=(230, 230, 230),
               stroke_width=max(1, size // 10), stroke_fill="black")
    head = ImageFont.truetype(FONT, int(size * 1.3))
    total = sum(b["ha"] for b in blocks)
    d.text((size, size), f"{title} — {len(blocks)} blocks, {total:.1f} ha", font=head, fill="white",
           stroke_width=max(2, size // 6), stroke_fill="black")
    d.text((size, H - size), "Imagery: Esri World Imagery / downloaded layers · areas on the WGS84 ellipsoid",
           font=small, anchor="ld", fill=(220, 220, 220), stroke_width=1, stroke_fill="black")
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=88, optimize=True)
    return buf.getvalue()


# ---------------------------------------------------------------- data + viewer

def _geojson(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": b["name"], "area_ha": b["ha"], "parts": b["parts"], "color": b["color"]},
         "geometry": mapping(b["geom"])} for b in blocks]}


def _kml(blocks: list[dict[str, Any]], title: str) -> str:
    def ring(r) -> str:
        return " ".join(f"{x:.7f},{y:.7f},0" for x, y in r.coords)

    def poly(p) -> str:
        inner = "".join(f"<innerBoundaryIs><LinearRing><coordinates>{ring(i)}</coordinates></LinearRing></innerBoundaryIs>" for i in p.interiors)
        return f"<Polygon><outerBoundaryIs><LinearRing><coordinates>{ring(p.exterior)}</coordinates></LinearRing></outerBoundaryIs>{inner}</Polygon>"

    marks = []
    for b in blocks:
        c = b["color"].lstrip("#")
        abgr = f"8c{c[4:6]}{c[2:4]}{c[0:2]}"
        polys = "".join(poly(p) for p in getattr(b["geom"], "geoms", [b["geom"]]))
        lp = _label_point(b["geom"])
        marks.append(
            f"<Placemark><name>{escape(b['name'])}</name><description>{b['ha']:.2f} ha</description>"
            f"<Style><LineStyle><color>ffffffff</color><width>2</width></LineStyle><PolyStyle><color>{abgr}</color></PolyStyle></Style>"
            f"<MultiGeometry><Point><coordinates>{lp.x:.7f},{lp.y:.7f},0</coordinates></Point>{polys}</MultiGeometry></Placemark>")
    return ('<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
            f"<name>{escape(title)}</name>{''.join(marks)}</Document></kml>")


_VIEWER = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
  html,body{margin:0;height:100%;font:13px system-ui,sans-serif;background:#111;color:#eee}
  #wrap{display:flex;height:100%}
  #map{flex:1}
  aside{width:250px;overflow:auto;border-left:1px solid #333;padding:10px 12px;box-sizing:border-box}
  h1{font-size:15px;margin:0 0 2px} .sub{color:#aaa;margin:0 0 10px}
  table{width:100%;border-collapse:collapse} td{padding:3px 4px;border-bottom:1px solid #262626;cursor:pointer}
  td.ha{text-align:right;color:#bbb;font-variant-numeric:tabular-nums} tr:hover td{background:#1f2937}
  .sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}
  .lbl{background:none;border:none;box-shadow:none;color:#fff;font-weight:700;font-size:12px;
       text-shadow:0 0 3px #000,0 0 3px #000,0 0 2px #000}
  .lbl::before{display:none}
  label{display:block;margin:8px 0;color:#ccc}
  @media (max-width:700px){#wrap{flex-direction:column} aside{width:auto;height:38%;border-left:0;border-top:1px solid #333}}
</style></head><body><div id="wrap"><div id="map"></div>
<aside><h1>__TITLE__</h1><p class="sub">__SUB__</p>
<label><input type="checkbox" id="names" checked> Show block names</label>
<table id="list"></table></aside></div>
<script>
const data = __DATA__;
const map = L.map('map');
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagery &copy; Esri'}).addTo(map);
const layers = {};
const all = L.geoJSON(data, {
  style: f => ({color: '#fff', weight: 1.5, fillColor: f.properties.color, fillOpacity: 0.25}),
  onEachFeature: (f, l) => {
    layers[f.properties.name] = l;
    l.bindTooltip(f.properties.name, {permanent: true, direction: 'center', className: 'lbl'});
    l.bindPopup('<b>' + f.properties.name + '</b><br>' + f.properties.area_ha.toFixed(2) + ' ha' +
      (f.properties.parts > 1 ? '<br>' + f.properties.parts + ' parts' : ''));
  }
}).addTo(map);
map.fitBounds(all.getBounds(), {padding: [20, 20]});
const list = document.getElementById('list');
data.features.forEach(f => {
  const tr = list.insertRow();
  tr.innerHTML = '<td><span class="sw" style="background:' + f.properties.color + '"></span>' + f.properties.name +
    '</td><td class="ha">' + f.properties.area_ha.toFixed(2) + ' ha</td>';
  tr.onclick = () => { const l = layers[f.properties.name]; map.fitBounds(l.getBounds(), {maxZoom: 18}); l.openPopup(); };
});
document.getElementById('names').onchange = e =>
  Object.values(layers).forEach(l => e.target.checked ? l.openTooltip() : l.closeTooltip());
</script></body></html>"""


def _viewer(fc: dict[str, Any], title: str, sub: str) -> str:
    return (_VIEWER.replace("__TITLE__", html.escape(title)).replace("__SUB__", html.escape(sub))
            .replace("__DATA__", json.dumps(fc).replace("</", "<\\/")))


@router.get("/{slug}/block-map.zip")
def block_map(slug: str, folder: str = "Blocks", picture: bool = True) -> Response:
    project = _read(slug)
    blocks = _blocks(project, folder)
    if not blocks:
        raise HTTPException(404, f'No shapes in the "{folder}" folder of this project')
    title = f"{project['name']} — blocks"
    total = sum(b["ha"] for b in blocks)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sub = f"{len(blocks)} blocks · {total:.1f} ha · {stamp}"
    fc = _geojson(blocks)
    base = f"{slug}-blocks"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{base}/{base}.html", _viewer(fc, title, sub))
        zf.writestr(f"{base}/{base}.geojson", json.dumps(fc))
        zf.writestr(f"{base}/{base}.kml", _kml(blocks, title))
        zf.writestr(f"{base}/{base}.csv", "block,area_ha,parts\n" + "".join(
            f'"{b["name"]}",{b["ha"]:.2f},{b["parts"]}\n' for b in blocks))
        if picture:
            zf.writestr(f"{base}/{base}.jpg", _picture(blocks, title))
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{base}.zip"'})
