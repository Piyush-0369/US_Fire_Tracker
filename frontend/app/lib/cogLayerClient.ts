// app/lib/cogLayerClient.ts
// COG rendering (Leaflet GridLayer) with safe overview selection, throttling,
// and strict North-America bounds to avoid requesting / decoding tiles outside the data area.

import L from "leaflet";
import { fromUrl } from "geotiff";

export type CogLayerName = "fuel" | "slope";

interface ColorMapEntry {
  label: string;
  color: string;
}

/* -------------------------
   CONFIG
   ------------------------- */

// Concurrency
const MAX_CONCURRENT = 6;

// Source pixel safety thresholds
const SAFE_SOURCE_PIXELS = 4_000_000; // prefer overviews that map to <= this many source pixels
const HARD_LIMIT_SOURCE_PIXELS = 50_000_000; // if even smallest overview > this, slope will abort

// HARD-CODED COG bounds for both fuel & slope: North America region (you asked "fix to USA only")
export const COG_BOUNDS: [number, number, number, number] = [-128.38690525209998, 22.428354333912164, -64.05404295852681, 52.481560035612816];
// Note: format is [minLon, minLat, maxLon, maxLat] (lon, lat).

/* -------------------------
   Throttle implementation
   ------------------------- */
let activeRequests = 0;
const pendingQueue: Array<() => void> = [];
async function throttle<T>(fn: () => Promise<T>): Promise<T> {
  if (activeRequests >= MAX_CONCURRENT) {
    await new Promise<void>((res) => pendingQueue.push(res));
  }
  activeRequests++;
  try {
    return await fn();
  } finally {
    activeRequests--;
    const next = pendingQueue.shift();
    if (next) next();
  }
}

/* -------------------------
   Color maps & legend
   ------------------------- */
let fuelLegendCache: Record<string, ColorMapEntry> | null = null;

const SLOPE_COLORMAP: [number, string][] = [
  [0, "#f7fcf5"],
  [5, "#e5f5e0"],
  [10, "#c7e9c0"],
  [15, "#a1d99b"],
  [20, "#74c476"],
  [25, "#41ab5d"],
  [30, "#238b45"],
  [35, "#006d2c"],
  [40, "#00441b"],
];

async function fetchFuelLegend(): Promise<Record<string, ColorMapEntry>> {
  if (fuelLegendCache) return fuelLegendCache;
  try {
    const r = await fetch("/api/cog/fuel-legend");
    if (!r.ok) throw new Error("Failed to fetch fuel legend");
    fuelLegendCache = await r.json();
    return fuelLegendCache!;
  } catch (err) {
    console.error("Error fetching fuel legend:", err);
    return {
      "1": { label: "Type 1", color: "#f7fcb9" },
      "2": { label: "Type 2", color: "#addd8e" },
      "3": { label: "Type 3", color: "#78c679" },
    };
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [200, 200, 200];
}

function getSlopeColor(value: number): [number, number, number] {
  for (let i = 0; i < SLOPE_COLORMAP.length - 1; i++) {
    const [v1, c1] = SLOPE_COLORMAP[i];
    const [v2, c2] = SLOPE_COLORMAP[i + 1];
    if (value >= v1 && value <= v2) {
      const t = (value - v1) / (v2 - v1);
      const rgb1 = hexToRgb(c1);
      const rgb2 = hexToRgb(c2);
      return [
        Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t),
        Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t),
        Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t),
      ];
    }
  }
  if (value < SLOPE_COLORMAP[0][0]) return hexToRgb(SLOPE_COLORMAP[0][1]);
  return hexToRgb(SLOPE_COLORMAP[SLOPE_COLORMAP.length - 1][1]);
}

/* -------------------------
   Create GridLayer (with bounds)
   ------------------------- */

export async function createCogLayer(
  layerName: CogLayerName,
  options: { opacity?: number } = {}
): Promise<L.GridLayer> {
  const cogUrl = `/api/cog/${layerName}`;
  const opacity = options.opacity ?? 0.7;

  console.log(`[COG] Creating layer for ${layerName} from ${cogUrl}`);
  console.log(`[COG] Enforcing COG_BOUNDS (lon/lat): ${JSON.stringify(COG_BOUNDS)}`);

  const CogGridLayer = L.GridLayer.extend({
    createTile: function (coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement("canvas");
      const tileSize = this.getTileSize();
      tile.width = tileSize.x;
      tile.height = tileSize.y;

      renderCogTile(cogUrl, layerName, coords, tile, done);

      return tile;
    },
  });

  // Provide bounds option (Leaflet will avoid requesting tiles outside these bounds)
  // Convert COG_BOUNDS [minLon,minLat,maxLon,maxLat] -> Leaflet LatLngBounds uses [southWest, northEast] as [lat, lon]
  const sw = L.latLng(COG_BOUNDS[1], COG_BOUNDS[0]); // minLat,minLon
  const ne = L.latLng(COG_BOUNDS[3], COG_BOUNDS[2]); // maxLat,maxLon
  const leafletBounds = L.latLngBounds(sw, ne);

  const layer = new (CogGridLayer as any)({
    tileSize: 256,
    minZoom: 3,
    maxZoom: 12,
    bounds: leafletBounds, // instruct Leaflet to request only tiles intersecting these bounds
  }) as L.GridLayer;

  layer.setOpacity(opacity);
  return layer;
}

/* -------------------------
   Render tile with safety checks
   ------------------------- */

async function renderCogTile(
  cogUrl: string,
  layerName: CogLayerName,
  coords: L.Coords,
  canvas: HTMLCanvasElement,
  done: L.DoneCallback
) {
  try {
    await throttle(async () => {
      const { z, x, y } = coords;
      const tileSize = canvas.width;
      const tileBounds = tileToBBox(x, y, z); // [minLon,minLat,maxLon,maxLat]

      // QUICK SKIP: if tile bbox doesn't intersect the enforced COG_BOUNDS, return transparent tile immediately.
      // This prevents decode / network for tiles outside the fixed NA extent.
      if (!bboxesIntersect(tileBounds, COG_BOUNDS)) {
        // debug log
        // console.log(`[COG] Skipping tile ${z}/${x}/${y} — outside enforced COG_BOUNDS`);
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        done(undefined, canvas);
        return;
      }

      console.log(`[COG] Rendering tile ${layerName} ${z}/${x}/${y}`, tileBounds);

      // Open GeoTIFF (fromUrl will use range requests)
      const tiff = await fromUrl(cogUrl);

      // Use primary image for georeference
      const imageCount = await tiff.getImageCount();
      const baseImage = await tiff.getImage(0);
      // try to get image bbox
      let imgBbox: [number, number, number, number];
      try {
        imgBbox = baseImage.getBoundingBox() as [number, number, number, number];
      } catch (err) {
        const fd = (baseImage as any).fileDirectory;
        const mt = fd.ModelTiepoint || fd.ModelTiepointTag;
        const mps = fd.ModelPixelScale || fd.ModelPixelScaleTag;
        if (!mt || !mps) {
          console.error(`[COG] No georeference tags found on primary image`);
          done(new Error("No georeference information"), canvas);
          return;
        }
        const tieX = mt[3], tieY = mt[4], scaleX = mps[0], scaleY = mps[1];
        const w = baseImage.getWidth(), h = baseImage.getHeight();
        imgBbox = [tieX, tieY - scaleY * h, tieX + scaleX * w, tieY];
      }

      // Defensive: ensure imgBbox intersects enforced COG_BOUNDS; if not, return transparent tile.
      if (!bboxesIntersect(tileBounds, imgBbox)) {
        // Tile is outside the actual TIFF bounds (not only enforced bounds). Return transparent tile.
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        done(undefined, canvas);
        return;
      }

      // Choose overview safely: start from the smallest (highest index) and pick first with acceptable source-pixels
      let chosenIndex = imageCount - 1;
      let chosenImage = await tiff.getImage(chosenIndex);
      const computeSourcePixels = (img: any) => {
        const imgW = img.getWidth();
        const imgH = img.getHeight();
        const [imgMinX, imgMinY, imgMaxX, imgMaxY] = imgBbox;
        const imgWidthDeg = imgMaxX - imgMinX;
        const imgHeightDeg = imgMaxY - imgMinY;

        const clampedMinX = Math.max(tileBounds[0], imgMinX);
        const clampedMaxX = Math.min(tileBounds[2], imgMaxX);
        const clampedMinY = Math.max(tileBounds[1], imgMinY);
        const clampedMaxY = Math.min(tileBounds[3], imgMaxY);
        if (clampedMaxX <= clampedMinX || clampedMaxY <= clampedMinY) return 0;

        const pxW = Math.ceil(((clampedMaxX - clampedMinX) / imgWidthDeg) * imgW);
        const pxH = Math.ceil(((clampedMaxY - clampedMinY) / imgHeightDeg) * imgH);
        return pxW * pxH;
      };

      let chosenPixels = computeSourcePixels(chosenImage);
      for (let i = imageCount - 1; i >= 0; i--) {
        const img = await tiff.getImage(i);
        const pix = computeSourcePixels(img);
        console.log(`[COG] overview ${i} -> approx source pixels ${pix}`);
        if (pix === 0) {
          chosenIndex = i;
          chosenImage = img;
          chosenPixels = pix;
          break;
        }
        if (pix <= SAFE_SOURCE_PIXELS) {
          chosenIndex = i;
          chosenImage = img;
          chosenPixels = pix;
          break;
        }
      }

      // If even smallest overview is huge, abort for slope (avoid OOM)
      if (chosenPixels > HARD_LIMIT_SOURCE_PIXELS) {
        if (layerName === "slope") {
          const tiffFilename = cogUrl.replace("/api/cog/", "") || "slope.tif";
          console.error(`[COG] SLOPE TIFF too coarse: smallest overview maps to ~${chosenPixels} source pixels (> ${HARD_LIMIT_SOURCE_PIXELS}). Aborting tile to avoid OOM.`);
          console.error(`Run (on data host) to add more overviews: gdaladdo -r average ${tiffFilename} 2 4 8 16 32 64 128 256 512 1024`);
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          done(undefined, canvas);
          return;
        } else {
          console.warn(`[COG] chosenPixels (${chosenPixels}) > HARD_LIMIT; falling back to smallest overview index ${imageCount - 1}`);
          chosenIndex = imageCount - 1;
          chosenImage = await tiff.getImage(chosenIndex);
          chosenPixels = computeSourcePixels(chosenImage);
        }
      }

      console.log(`[COG] Using overview ${chosenIndex} for zoom ${z} (srcPixels ≈ ${chosenPixels})`);

      // Read rasters from chosen overview by bbox and request tileSize output to keep memory low
      let rasters;
      try {
        rasters = await chosenImage.readRasters({
          bbox: imgBbox,
          width: tileSize,
          height: tileSize,
        });
      } catch (err) {
        console.warn(`[COG] bbox read failed on overview ${chosenIndex}. Trying smallest overview as fallback. Err:`, err);
        try {
          const fallback = await tiff.getImage(imageCount - 1);
          rasters = await fallback.readRasters({ bbox: imgBbox, width: tileSize, height: tileSize });
          console.warn(`[COG] bbox read succeeded on fallback overview ${imageCount - 1}`);
        } catch (err2) {
          console.error(`[COG] bbox read failed on fallback overview too:`, err2);
          done(err2 as Error, canvas);
          return;
        }
      }

      const band = Array.isArray(rasters) ? rasters[0] : rasters;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        done(new Error("Cannot get canvas context"), canvas);
        return;
      }

      const imageData = ctx.createImageData(tileSize, tileSize);
      const data = imageData.data;

      // Preload legend if needed
      let fuelLegend: Record<string, ColorMapEntry> | null = null;
      if (layerName === "fuel") fuelLegend = await fetchFuelLegend();

      for (let i = 0; i < band.length; i++) {
        const value = band[i];
        let rgb: [number, number, number];

        if (value === null || value === undefined || isNaN(value) || value < 0) {
          data[i * 4] = 0;
          data[i * 4 + 1] = 0;
          data[i * 4 + 2] = 0;
          data[i * 4 + 3] = 0;
          continue;
        }

        if (layerName === "slope") {
          rgb = getSlopeColor(value);
        } else {
          const key = Math.round(value).toString();
          const entry = fuelLegend?.[key];
          rgb = entry ? hexToRgb(entry.color) : [200, 200, 200];
        }

        data[i * 4] = rgb[0];
        data[i * 4 + 1] = rgb[1];
        data[i * 4 + 2] = rgb[2];
        data[i * 4 + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
      done(undefined, canvas);
    });
  } catch (err) {
    console.error(`[COG] Throttled render error:`, err);
    done(err as Error, canvas);
  }
}

/* -------------------------
   Helpers
   ------------------------- */

function tileToBBox(x: number, y: number, z: number): [number, number, number, number] {
  const n = Math.pow(2, z);
  const lonMin = (x / n) * 360 - 180;
  const lonMax = ((x + 1) / n) * 360 - 180;

  const latMin = (Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180) / Math.PI;
  const latMax = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180) / Math.PI;

  return [lonMin, latMin, lonMax, latMax];
}

function bboxesIntersect(a: [number, number, number, number], b: [number, number, number, number]) {
  const [aMinX, aMinY, aMaxX, aMaxY] = a;
  const [bMinX, bMinY, bMaxX, bMaxY] = b;
  return !(aMaxX < bMinX || aMinX > bMaxX || aMaxY < bMinY || aMinY > bMaxY);
}
