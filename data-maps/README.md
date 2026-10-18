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
