# map-tile-downloader (vendored)

`index.js` and `README.md` are copied from
[gislayer/map-tile-downloader](https://github.com/gislayer/map-tile-downloader)
at commit `49f8cc0` (2025-08-06), version 1.0.8, by Ali Kilic — ISC licence
(declared in its package.json). Copyright stays with the upstream author.

`cli.js` is ours: the backend runs it to count and download tiles for an area
into `tiles/<layer>/{z}/{x}/{y}.<format>`, which FastAPI serves at `/tiles`.

## Setup

`node_modules` isn't committed. On a fresh checkout or a new server:

    cd webapp/tile-downloader && npm install

The backend finds Node at `MAPPER_NODE` (default: the nvm v24.14.1 binary).

## Local patches to `index.js`

Each is marked with an `upande:` comment.

1. **No rethrow after a failed tile.** Upstream throws inside the axios
   `.catch` and the stream `error` handler. That is an unhandled rejection,
   which ends the Node process — one 404 stopped the whole download.
2. **30 s request timeout**, so a hung tile server can't stall a job forever.
3. **Subdomain pick** — `random(0, length) % length` favoured the first
   subdomain; now uniform.

The `fs` dependency was dropped from `package.json`: it is npm's empty
security-placeholder package, and Node's built-in `fs` is what gets loaded.

To take a newer upstream: copy its `index.js` over this one and re-apply the
patches above.
