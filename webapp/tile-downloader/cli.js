#!/usr/bin/env node
/**
 * Command-line driver for the vendored downloader, run by the mapper backend.
 *
 *   node cli.js count <job.json>              → prints {"count": N}
 *   node cli.js run   <job.json> <layer.json> → downloads, keeping layer.json's
 *                                               progress fields up to date
 *
 * job.json: { url, subdomains, minZoom, maxZoom, format, area, dest }
 * where `area` is a GeoJSON Feature<Polygon> and `dest` the layer folder.
 */
const fs = require('fs');
const path = require('path');
const TilesCounter = require('map-tiles-generator');
const MapTileDownloader = require('./index');

const [, , cmd, jobPath, layerPath] = process.argv;
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
// A run's job file is a temp file the backend wrote for this process alone.
if (cmd === 'run') fs.rmSync(jobPath, { force: true });

if (cmd === 'count') {
  const tiles = new TilesCounter(job.area).getTilesFromZoomRange(job.minZoom, job.maxZoom);
  process.stdout.write(JSON.stringify({ count: tiles.count }));
  process.exit(0);
}

if (cmd !== 'run' || !layerPath) {
  console.error('usage: cli.js count <job.json> | cli.js run <job.json> <layer.json>');
  process.exit(2);
}

/** Merge fields into layer.json, atomically so a reader never sees half a file. */
function update(fields) {
  const cur = JSON.parse(fs.readFileSync(layerPath, 'utf8'));
  const tmp = `${layerPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...cur, ...fields }));
  fs.renameSync(tmp, layerPath);
}

let failed = 0;
let lastWrite = 0;
const downloader = new MapTileDownloader({
  tile: {
    type: 'url',
    url: job.url,
    subdomains: job.subdomains,
    minZoom: job.minZoom,
    maxZoom: job.maxZoom,
    format: job.format,
  },
  area: { type: 'geojson', data: job.area },
});
if (!downloader.status) {
  update({ state: 'error', error: 'The downloader rejected these options.' });
  process.exit(1);
}

update({ state: 'downloading', pid: process.pid });
// generateToPath creates <dest> itself but not its parents.
fs.mkdirSync(path.dirname(job.dest), { recursive: true });
downloader.generateToPath(
  job.dest,
  () => update({ state: 'done', failed, finishedAt: new Date().toISOString() }),
  (s) => {
    if (s.status === 'error' || s.status === 'faild') failed++;
    const now = Date.now();
    if (s.status === 'completed' || now - lastWrite > 1000) {
      lastWrite = now;
      update({ current: s.current, total: s.total, failed });
    }
  },
);
