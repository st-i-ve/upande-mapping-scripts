# Upande Bed & Zone Mapper

A single web app that replaces the collection of per-farm mapping scripts
(`karen*`, `mona*`, `multilane1-4`, `myscript.py`, `3-8.py`) with one
unified engine and a browser UI.

Live at: **https://mapping.132.145.21.55.nip.io**

## What we did

- **Consolidated the algorithm.** Every old script was a fork of the same
  "parallel beds + zones" pipeline. Collapsed into one engine
  (`backend/beds_zones.py`) that: reprojects the polygon to UTM,
  rotation-aligns to the long axis, generates parallel bed lines,
  inward-buffers and clips (which handles terraced / irregular edges
  naturally), numbers continuously across all polygon parts, then
  subdivides each bed into fixed-length zones.
- **Exposed it as an API.** `backend/main.py` is a FastAPI app with
  `POST /api/generate`, `GET /api/outputs`, `GET /api/outputs/{file}`.
- **Built a map UI.** `frontend/` is a Leaflet + Leaflet.draw page with
  OSM/Satellite layers. Users can **draw** a polygon or **paste**
  GeoJSON, set parameters, preview beds (green) and zones (orange), and
  download results.
- **Persisted outputs.** Every run is saved to `storage/` as
  `{timestamp}_{name}_{hash}.geojson` and listed in the UI.
- **Deployed it.** systemd service + nginx reverse proxy + Let's Encrypt
  TLS on `mapping.132.145.21.55.nip.io`.

## Layout

```
webapp/
  backend/
    beds_zones.py       # unified engine
    main.py             # FastAPI app
    requirements.txt
  frontend/
    index.html
    app.js              # Leaflet map + form logic
    style.css
  storage/              # generated GeoJSONs (per run)
  deploy/
    mapping.service     # systemd unit (source of truth)
    nginx.conf          # nginx site (source of truth)
  .venv/                # Python 3.10 venv
```

## Parameters

| Field         | Meaning                                                       |
|---------------|---------------------------------------------------------------|
| bed_spacing   | Distance between bed centerlines, in metres.                  |
| zone_length   | Target length of each zone segment along a bed, in metres.    |
| buffer_m      | Inward buffer applied before clipping (keeps beds off edges). |
| direction     | `along_long_axis` (default) or `across_long_axis`.            |
| name          | Optional plot name, used in the saved filename.               |

## Running locally

```bash
cd webapp
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn --app-dir backend main:app --host 127.0.0.1 --port 8765
# → http://127.0.0.1:8765
```

## Operating the deployed service

```bash
sudo systemctl restart mapping     # after backend changes
sudo systemctl reload  nginx       # after nginx config changes
journalctl -u mapping -f           # live logs
```

## Deployment notes

- Service: `mapping.service`, runs `uvicorn main:app --workers 2` on
  `127.0.0.1:8765`.
- Nginx site: `/etc/nginx/sites-enabled/mapping`, proxies
  `mapping.132.145.21.55.nip.io` to the uvicorn upstream.
- TLS: `certbot --nginx` against Let's Encrypt (auto-renews via the
  certbot systemd timer).
