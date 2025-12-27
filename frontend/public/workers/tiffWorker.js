// public/workers/tiffWorker.js
// Worker script — loads geotiff at runtime via importScripts for minimal bundling
// We use geotiff browser build via importScripts from node_modules path served by bundler.
// For robustness, we use a fallback: geotiff/dist/geotiff.browser.min.js should be available in node_modules.
// If your build does not serve node_modules to public, you can bundle geotiff into worker file.
// For this MVP, we assume geotiff is accessible via CDN path. Alternatively, copy a minified geotiff to public libs and import it.

self.importScripts("https://unpkg.com/geotiff/dist/geotiff.browser.min.js");

const { fromArrayBuffer } = self.GeoTIFF || {};

async function fetchRange(url, start, end, signal) {
  const headers = {};
  if (typeof start === "number" && typeof end === "number") {
    headers.Range = `bytes=${start}-${end}`;
  }
  const res = await fetch(url, { headers, signal });
  if (!res.ok && res.status !== 206 && res.status !== 200) {
    throw new Error(`Range fetch failed: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return buf;
}

async function getImageWindow(tiffUrl, bbox4326, width, height, options = {}, signal) {
  // tiffUrl: '/api/cog/slope' (backend will serve the file with Accept-Ranges)
  // bbox4326: [minLon, minLat, maxLon, maxLat]
  // width/height: desired output tile pixel size (256)
  // options: {overviewLevelPrefer} not used in this minimal MVP
  // returns ImageBitmap transferable

  // Fetch the whole GEO TIFF header & directory just via a full fetch for simplicity in MVP
  // (geotiff.js will itself use range requests if given the URL with fetch, but for robust control, we
  // fetch the full file header may be larger. In practice, geotiff.js supports streaming via readRasters with window)
  // For MVP: fetch whole file's ArrayBuffer once and then use geotiff to read window. But files are large — so we instead
  // use fetch without ranges and hope backend returns partial responses. However geotiff.js supports remote request with range callbacks
  // but that's more complex; for MVP we fetch the entire file only if it's small.
  //
  // To avoid fetching the entire giant file in this MVP, we'll rely on geotiff.fromUrl which will use Range requests under the hood.
  try {
    const tiff = await self.GeoTIFF.fromUrl(tiffUrl);
    const image = await tiff.getImage(); // first image
    const rasters = await image.readRasters({
      window: [
        // compute window array indices from bbox; but image.getBoundingBox & geotransform are available
        // We'll compute the pixel coordinates corresponding to bbox roughly.
      ],
      // width, height // optionally resample to width/height
    });

    // === FALLBACK SIMPLE APPROACH ===
    // For MVP we will use image.readRasters({width, height, bbox}) if supported by geotiff.js.
    // Some builds support "bbox" param as geographic coordinates; if not, more complex math required.
    // Try bbox approach (works with modern geotiff.js)
    const data = await image.readRasters({
      bbox: bbox4326,
      width,
      height,
      pool: null,
      // interleave: true // maybe
    });

    // data is typed array or array of typed arrays (single band expected)
    // Create ImageData RGBA with colormap applied by main thread (simpler) OR apply it here.
    // To reduce main-thread work, attempt to create an ImageBitmap here by mapping to RGBA.

    const band = Array.isArray(data) ? data[0] : data;
    const w = width;
    const h = height;
    const rgba = new Uint8ClampedArray(w * h * 4);

    // For slope (float) or fuel (int) we will just pack the raw values into rgba channels:
    // We'll encode single-band value into RGBA like this for transport:
    // - For floats: use Float32Array buffer transfer (but transferable across postMessage? ArrayBuffer yes)
    // Simpler: return the raw band as Float32/Int32 via postMessage.

    // We'll post back the raw raster values and metadata; main thread will colorize.
    return { bandBuffer: band.buffer, width: w, height: h, dtype: band.constructor.name };

  } catch (err) {
    throw err;
  }
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg || !msg.id) return;
  const { id, action } = msg;

  try {
    if (action === "decodeWindow") {
      const { url, bbox, width, height } = msg;
      const result = await getImageWindow(url, bbox, width, height, {}, msg.signal);
      // result: { bandBuffer, width, height, dtype }
      self.postMessage({ id, success: true, result }, [result.bandBuffer]);
    } else {
      self.postMessage({ id, success: false, error: "unknown action" });
    }
  } catch (err) {
    self.postMessage({ id, success: false, error: err.message || String(err) });
  }
};
