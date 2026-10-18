# Interwar Europe geography

`europe-interwar.json` is adapted from André Ourednik and contributors' [Historical Basemaps](https://github.com/aourednik/historical-basemaps), revision `da7a4b735ecef70aebdc9c73e409d8a2500d50f3`. The source repository distributes these maps under GPL-3.0; the adapted data and adaptation script retain that license. See [LICENSE](LICENSE). The remaining game's license is unchanged.

This is an interwar approximation, not an exact January 1936 atlas. Most outlines use `world_1938.geojson`. Germany (including East Prussia), Austria, Poland, Czechoslovakia, Hungary and Romania use the 1930 snapshot to avoid incorporating 1938 annexations. Ireland uses the independent outline from 1938. Small islands absent from named multipart features are assigned geographically to Britain, Estonia and Finland. Data is clipped to 12° W–45° E, 34°–72° N and simplified with a 0.018° topology-preserving tolerance. The Soviet Union is cut off at the eastern map edge. The dataset has historical inaccuracies and generalization; do not use it as a reference atlas.

Each nation is divided into three gameplay sectors, preserving the existing 84 province IDs and route graph. Those sectors are not historical administrative borders. Island polygons and holes remain separate rings, rendered as compound SVG paths. No map service or runtime download is required.

To regenerate, download the two GeoJSON files from the pinned source revision, install Shapely 2 in a development environment, and run:

```sh
python scripts/build-geography.py world_1930.geojson world_1938.geojson data-maps/europe-interwar.json
```

Source SHA-256 checksums:

- `world_1930.geojson`: `5666e451125ceb0193532338bfecf6f403e1a4d7ff62f54fd560cafb0b0b1b61`
- `world_1938.geojson`: `f2565926fed1b197227b7fe126934a43ed75b8fce007e38be72a7d21a415d813`

Original default version-4 saves with unchanged schematic geometry upgrade on load, including their checkpoints. Ownership, treaties, orders, units and IDs remain unchanged. Custom geometry is not migrated.

## Full-world starting scenario

New campaigns now use `world-interwar.json`: 47 governments, 122 playable regions and neutral Antarctica. Existing European and custom campaigns keep their saved world; the earlier legacy-geometry upgrade still applies only to untouched old Europe maps. No active campaign silently gains new countries or changes ownership.

The global adaptation uses the same pinned 1930/1938 source files, license and checksums above. Rebuild with:

```sh
python scripts/build-world.py world_1930.geojson world_1938.geojson data-maps/europe-interwar.json data-maps/world-interwar.json
```

Vetting performed: only GeoJSON data was loaded; no third-party scripts were run. Coordinates, polygon topology, vertex limits, island components, global coverage and representative inland locations were checked. The adaptation repairs invalid source geometry, resolves overlaps with smaller areas taking precedence, simplifies coastlines with a 0.035° tolerance, and bounds every ring to 512 points. The source is a generalized historical approximation, including imperfect historical labels and borders; it is unsuitable as an exact 1936 atlas.

Deliberate gameplay groupings include:

| Playable government | Smaller countries or territories grouped into it |
| --- | --- |
| Mexico | Central America |
| Argentina | Uruguay and Paraguay |
| Colombia | Venezuela, Guyana, Suriname and Trinidad |
| Peru | Bolivia and Ecuador |
| China | Mongolia, Tibet and Xinjiang |
| British India | Nepal, Bhutan and Ceylon |
| Iran | Afghanistan |
| Arabian states | Gulf states, Iraq, Jordan, Palestine and Yemen |
| Siam | Mainland Southeast Asia |
| Australia | Pacific islands, Malaysia and Brunei |
| Southern Africa | Neighboring southern African territories |
| Egypt | Sudan |
| Ethiopia | Eritrea |
| United States | Caribbean groups, the Philippines, Guam and American Samoa |
| Belgium | Luxembourg and Belgian-controlled African territories |
| Spain | Andorra and Spanish-controlled African territories |

Other overseas territories are assigned to larger powers using the source's colonial ownership fields, with explicit overrides for the gameplay groups above. These are scenario abstractions, not assertions that the grouped countries formed a historical union. Greenland and Iceland are represented with Denmark; Indonesia with the Netherlands. The generated `assignments` list records the owner chosen for every source feature.

Geographic region borders supply adjacency. Internal links, retained European homeland routes and a small explicit set of sea routes keep the world connected. These are abstract gameplay routes; they do not add unrestricted naval transport. Neutral Antarctica is rendered but excluded from ownership and AI planning.
