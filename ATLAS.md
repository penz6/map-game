# Geographic atlas

The game now uses MapLibre GL JS rather than a stretched SVG board. It opens on the player's part of the world, fills the play area, and keeps the camera while turns resolve. Actions and chats overlay the map. World view, flat/globe projection, political/physical styling, country focus, real scale, mouse/touch pan/zoom and keyboard navigation are available. Natural Earth relief, bathymetry, lakes and rivers provide the geographic foundation; interwar political ownership remains the campaign's state.

Country borders dissolve the artificial gameplay-sector seams. Sectors appear only at close zoom and remain selectable for game actions. New ownership, renamed states and secessions update the same live map, with no modern administrative-border overlay. Country and city labels are locally rasterized, collision-placed map symbols, so no font/glyph server is required. The province lookup remains available by keyboard focus without filling the default map UI with another control.

## References and licenses

The user's saved Pax Historia HTML was inspected as a visual reference. It contains a Three.js canvas and references external page scripts/styles, but does not contain the canvas pixels or its map assets. No scripts in that document were executed; no account/session data or proprietary files are distributed.

[Open Historia](https://github.com/Open-Historia/open-historia) was inspected, including its `docs/game-map.md` and map composition. It uses a MapLibre map with relief and separate ownership, border, place and label layers. The project is AGPL-3.0-or-later. Its source code/assets were **not copied**; our integration is independently implemented using the separately licensed MapLibre library.

Vendored browser code:

- MapLibre GL JS **5.19.0**, BSD-3-Clause. The CSP bundle and worker are served locally with `script-src 'self'` and `worker-src 'self'`; no `unsafe-eval`, CDN or remote worker is needed. License: `public/vendor/maplibre-LICENSE.txt`.
- polygon-clipping **0.15.7**, MIT, for country outline unions. License: `public/vendor/polygon-clipping-LICENSE.md`.

Packages were fetched with `npm pack --ignore-scripts`, with exact versions and registry integrity. No third-party install scripts were run. Upstream licenses/notices are retained. Browser runtime has no npm dependency installation step. Vendor packages ship in the container's existing `public/` copy.

Natural Earth raster/vector inputs are public domain: [terms](https://www.naturalearthdata.com/about/terms-of-use/). The relief input is `NE2_50M_LC_SR_W.tif` from `nvkelso/natural-earth-raster`, commit `f04832c819e7a203d159dffe93cd9245332d6b33`. Rivers and lakes use Natural Earth's 1:50m GeoJSON. `public/atlas/build.json` records original input SHA-256 checksums. Only data was parsed; no downloaded scripts were run. Existing Historical Basemaps political geometry remains GPL-3.0-only, as documented in `data-maps/README.md`. Derived historical display meshes retain that data license.

## Rebuilding local assets

Build-time dependencies are Python 3, Pillow and NumPy; Shapely 2 is additionally needed for coast refinement. They are not runtime/container dependencies. Inputs can be obtained from the upstream repositories; validate checksums in the existing build manifest before regeneration.

```sh
python3 scripts/build-atlas.py relief.tif rivers.geojson lakes.geojson public/atlas
python3 scripts/build-atlas-coast.py data-maps/world-interwar.json land-10m.geojson public/atlas/coast-regions.geojson.gz
```

The raster is resampled from latitude/longitude into a **4096 × 4096 Web Mercator** image, so terrain and political overlays agree geographically. It is a compact local texture, not an unbounded tile service. Layers load once per map; geometry is rebuilt only when the campaign's geometry, owners, colors or names change. GPU pixel ratio is capped at 1.5 and tile caches are bounded. Coast refinement matches Natural Earth 1:10m land while keeping the historical inland boundaries and gameplay IDs. A source-geometry fingerprint gates the display refinement; custom/imported geometry always keeps its own outline.

The map is an overview/regional strategy atlas, not a street map. Basemap terrain is finite-resolution and the interwar source is an approximation. Country groupings and sectors remain gameplay abstractions. Globe and flat views cover the entire planet; Web Mercator's polar limits apply in flat view. No remote map requests, API keys or tracking are required. WebGL is required; an explicit renderer error appears if the browser cannot initialize it.

Coastal display data is stored gzipped and served with negotiated Content-Encoding; the map fetches ordinary GeoJSON transparently. The build manifest records the uncompressed display hash.
