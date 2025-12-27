// src/lib/pmtilesClient.ts
// A minimal wrapper around @protomaps/pmtiles + pbf + @mapbox/vector-tile
// Exposes: createPmtilesClient(pmtilesName) => { getTile(z,x,y) => GeoJSONFeatureCollection }

import { PMTiles } from "pmtiles";
import Pbf from "pbf";
import { VectorTile } from "@mapbox/vector-tile";

export async function createPmtilesClient(pmtilesName: string) {
  // pmtilesName: 'us_state' (we will fetch at /api/tiles/pmtiles/us_state)
  // PMTiles expects a URL; we pass the pmtiles archive URL
  const url = `/api/tiles/pmtiles/${pmtilesName}`;
  
  console.log(`[PMTiles] Creating client for: ${pmtilesName} at ${url}`);

  const pmtiles = new PMTiles(url);
  
  // Test the connection by getting metadata
  try {
    const metadata = await pmtiles.getMetadata();
    console.log(`[PMTiles] ${pmtilesName} metadata:`, metadata);
  } catch (err) {
    console.error(`[PMTiles] Failed to get metadata for ${pmtilesName}:`, err);
  }

  return {
    async getTile(z: number, x: number, y: number) {
      // returns a GeoJSON feature collection (features may be many)
      // pmtiles.getZxy returns raw MVT bytes (Uint8Array)
      console.log(`[PMTiles] Fetching tile ${pmtilesName} ${z}/${x}/${y}`);
      const result = await pmtiles.getZxy(z, x, y);
      if (!result || !result.data) {
        console.log(`[PMTiles] No data for tile ${pmtilesName} ${z}/${x}/${y}`);
        return { type: "FeatureCollection", features: [] };
      }

      // decode using pbf & vector-tile
      const pbfDecoder = new Pbf(new Uint8Array(result.data as ArrayBuffer));
      const tile = new VectorTile(pbfDecoder);
      const layers = Object.keys(tile.layers);
      const features = [];
      for (const layerName of layers) {
        const l = tile.layers[layerName];
        for (let i = 0; i < l.length; i++) {
          const f = l.feature(i).toGeoJSON(x, y, z);
          // attach layer name to feature.properties
          f.properties = f.properties || {};
          f.properties._mvt_layer = layerName;
          features.push(f);
        }
      }
      return { type: "FeatureCollection", features };
    },
    metadata: async () => await pmtiles.getMetadata(),
  };
}

export default createPmtilesClient;
