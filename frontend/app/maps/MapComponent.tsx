// app/maps/MapComponent.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createPmtilesClient } from "../lib/pmtilesClient";
import { createCogLayer, CogLayerName } from "../lib/cogLayerClient";

type PMTilesLayer = "us_state" | "us_county" | "fire_perimeter";

/* ---------------------------
   WeatherPanel component
   --------------------------- */
function WeatherPanel({
  open,
  onClose,
  loading,
  station,
  series,
  startDate,
  endDate,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  station: { station: string; latitude: number; longitude: number } | null;
  series: { date: string; temp: number | null; dewp: number | null }[] | null;
  startDate: string | null;
  endDate: string | null;
}) {
  if (!open) return null;
  // --- BEGIN REPLACEMENT: WeatherPanel internals ---
  const svgWidth = 300;
  const svgHeight = 120; // per-chart height
  const pad = 36  ; // left/right/top/bottom padding for axes
  const innerW = svgWidth - pad * 2;
  const innerH = svgHeight - pad * 2;

  // normalize dates to YYYY-MM-DD (handles if backend includes time)
  const normalizedDates = series ? series.map((s) => (s.date ? s.date.slice(0, 10) : "")) : [];
  const dates = normalizedDates;

  // arrays
  const tempArr = series ? series.map((s) => (s.temp == null ? null : Number(s.temp))) : [];
  const dewpArr = series ? series.map((s) => (s.dewp == null ? null : Number(s.dewp))) : [];

  // helper: numeric filter
  const numeric = (arr: (number | null)[]) => arr.filter((v): v is number => v !== null && v !== undefined);

  // X coordinate helper (shared)
// bin-centered x coordinate: each date occupies a bin; place points in center of that bin
const binCount = Math.max(1, dates.length);
const binWidth = innerW / binCount;
const xForIndex = (i: number) => {
  // center of bin i
  return pad + binWidth * 0.5 + i * binWidth;
};

  // build path generator for a provided y mapping function
  function pathFromArrayWithY(arr: (number | null)[], yForValue: (v: number) => number) {
    let path = "";
    let started = false;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v === null || v === undefined) {
        started = false;
        continue;
      }
      const x = xForIndex(i);
      const y = yForValue(v);
      if (!started) {
        path += `M ${x},${y}`;
        started = true;
      } else {
        path += ` L ${x},${y}`;
      }
    }
    return path;
  }

  // ---- Temperature chart scales + path ----
  const tempNums = numeric(tempArr);
  const yMinTemp = tempNums.length ? Math.min(...tempNums) : 0;
  const yMaxTemp = tempNums.length ? Math.max(...tempNums) : yMinTemp + 1;
  const ySpanTemp = yMaxTemp === yMinTemp ? 1 : yMaxTemp - yMinTemp;
  const yForValueTemp = (v: number) => pad + (1 - (v - yMinTemp) / ySpanTemp) * innerH;
  const tempPath = pathFromArrayWithY(tempArr, yForValueTemp);

  // ---- Dew point chart scales + path ----
  const dewpNums = numeric(dewpArr);
  const yMinDewp = dewpNums.length ? Math.min(...dewpNums) : 0;
  const yMaxDewp = dewpNums.length ? Math.max(...dewpNums) : yMinDewp + 1;
  const ySpanDewp = yMaxDewp === yMinDewp ? 1 : yMaxDewp - yMinDewp;
  const yForValueDewp = (v: number) => pad + (1 - (v - yMinDewp) / ySpanDewp) * innerH;
  const dewpPath = pathFromArrayWithY(dewpArr, yForValueDewp);

  // Y ticks (4) — same count for both charts but values differ per-chart
  const yTicks = 4;
  const yTickValuesTemp = Array.from({ length: yTicks + 1 }, (_, i) => yMinTemp + (i * ySpanTemp) / yTicks);
  const yTickValuesDewp = Array.from({ length: yTicks + 1 }, (_, i) => yMinDewp + (i * ySpanDewp) / yTicks);

  // X ticks: adaptively pick at most 5 labels to avoid overlap
  const maxXTicks = 5;
  const xStep = Math.max(1, Math.ceil((Math.max(1, dates.length - 1)) / (maxXTicks - 1)));
  const xTickIndices: number[] = [];
  for (let i = 0; i < dates.length; i += xStep) xTickIndices.push(i);
  if (dates.length && xTickIndices[xTickIndices.length - 1] !== dates.length - 1) xTickIndices.push(dates.length - 1);

  // find start/end indices robustly (compare YYYY-MM-DD substrings)
  const startNorm = startDate ? String(startDate).slice(0, 10) : null;
  const endNorm = endDate ? String(endDate).slice(0, 10) : null;


  function findClosestIndex(target: string | null) {
    if (!target || !dates.length) return -1;
    // exact
    let idx = dates.findIndex((d) => d === target);
    if (idx !== -1) return idx;
    // first date >= target (ISO strings compare lexicographically)
    idx = dates.findIndex((d) => d >= target);
    if (idx !== -1) return idx;
    // fallback to nearest by absolute milliseconds difference
    const tMs = Date.parse(target);
    if (Number.isNaN(tMs)) return -1;
    let best = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < dates.length; i++) {
      const dMs = Date.parse(dates[i]);
      if (Number.isNaN(dMs)) continue;
      const diff = Math.abs(dMs - tMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    return best;
  }

  const startIndex = findClosestIndex(startNorm);
  const endIndex = findClosestIndex(endNorm);


  // Packed small helper to render one chart SVG — used twice (temp / dewp)
  function ChartSVG({
    title,
    path,
    arr,
    yTickValues,
    yForValue,
    color,
    showXLabels,
  }: {
    title: string;
    path: string;
    arr: (number | null)[];
    yTickValues: number[];
    yForValue: (v: number) => number;
    color: string;
    showXLabels: boolean;
  }) {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 12, color: "#666" }}>{/* y-units placeholder (°C) */}°C</div>
        </div>

        <svg width={svgWidth} height={svgHeight} style={{ width: "100%", height: svgHeight, background: "#fafafa", borderRadius: 6 }}>
          {/* Y gridlines and ticks */}
          {yTickValues.map((val, i) => {
            const y = yForValue(val);
            return (
              <g key={`yt-${title}-${i}`}>
                <line x1={pad} x2={pad + innerW} y1={y} y2={y} stroke="#eee" strokeWidth={1} />
                <text x={6} y={y + 4} fontSize={11} fill="#444">{val.toFixed(1)}</text>
              </g>
            );
          })}

          {/* Path */}
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* points */}
          {arr.map((v, i) => {
            if (v == null) return null;
            const x = xForIndex(i);
            const y = yForValue(v);
            return <circle key={`${title}-pt-${i}`} cx={x} cy={y} r={1.6} fill={color} />;
          })}

          {/* X ticks & labels (only if showXLabels true) */}
          {showXLabels && xTickIndices.map((ix, i) => {
            const x = xForIndex(ix);
            const label = dates[ix] || "";
            return (
              <g key={`xt-${title}-${i}`}>
                <line x1={x} x2={x} y1={pad + innerH} y2={pad + innerH + 4} stroke="#666" strokeWidth={1} />
                <text x={x} y={pad + innerH + 18} fontSize={10} fill="#444" textAnchor="middle">{label}</text>
              </g>
            );
          })}

          {/* X axis baseline */}
          <line x1={pad} x2={pad + innerW} y1={pad + innerH} y2={pad + innerH} stroke="#999" strokeWidth={1} />
        </svg>
      </>
    );
  }

  // ---- Render two separate charts: temp (no x-labels) then dewpoint (with x-labels) ----
  return (
    <div style={{
      width: 360,
      background: "white",
      borderRadius: 8,
      boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
      padding: 12,
      position: "fixed",
      top: 120,
      right: 20,
      zIndex: 3000,
      maxHeight: "70vh",
      overflow: "auto",
      borderLeft: "6px solid var(--green-primary)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <strong>Weather (±15 days)</strong>
          <div style={{ fontSize: 12, color: "#666" }}>{station ? `${station.station} — ${station.latitude?.toFixed(3)}, ${station.longitude?.toFixed(3)}` : "No station"}</div>
        </div>
        <div>
          <button onClick={onClose} style={{ border: "none", background: "#eee", padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}>Close</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 20 }}>Loading...</div>
      ) : !series || !series.length ? (
        <div style={{ padding: 12, color: "#444" }}>No data available for this period.</div>
      ) : (
        <>
          {/* Legend */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ width: 12, height: 12, background: "#d9534f", borderRadius: 2 }} />
              <div style={{ fontSize: 12 }}>Temperature (°C)</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ width: 12, height: 12, background: "#1f77b4", borderRadius: 2 }} />
              <div style={{ fontSize: 12 }}>Dew point (°C)</div>
            </div>
          </div>

          {/* Temperature chart (no x labels) */}
          <ChartSVG
            title="Temperature"
            path={tempPath}
            arr={tempArr}
            yTickValues={yTickValuesTemp}
            yForValue={yForValueTemp}
            color="#d9534f"
            showXLabels={true}
          />

          <div style={{ height: 8 }} />

          {/* Dew point chart (with x labels) */}
          <ChartSVG
            title="Dew point"
            path={dewpPath}
            arr={dewpArr}
            yTickValues={yTickValuesDewp}
            yForValue={yForValueDewp}
            color="#1f77b4"
            showXLabels={true}
          />

          <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
            Showing {series.length} days: {dates[0] || ""} → {dates[dates.length - 1] || ""}
          </div>
        </>
      )}
    </div>
  );

}


/* ---------------------------
   MapComponent (main)
   --------------------------- */

export default function MapComponent() {
  const mapRef = useRef<L.Map | null>(null);
  const pmClientsRef = useRef<Record<string, any>>({});
  const vectorLayersRef = useRef<Record<string, L.LayerGroup>>({});
  const cogLayersRef = useRef<Record<CogLayerName, L.GridLayer | null>>({ fuel: null, slope: null });
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState<string>("");

  // WEATHER PANEL state
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherStation, setWeatherStation] = useState<{ station: string; latitude: number; longitude: number } | null>(null);
  const [weatherSeries, setWeatherSeries] = useState<{ date: string; temp: number | null; dewp: number | null }[] | null>(null);
  const [weatherFireStart, setWeatherFireStart] = useState<string | null>(null);
  const [weatherFireEnd, setWeatherFireEnd] = useState<string | null>(null);


  // UI state
  const [showBaseMap, setShowBaseMap] = useState(false);
  const [showStates, setShowStates] = useState(false);
  const [showCounties, setShowCounties] = useState(false);
  const [showPerimeters, setShowPerimeters] = useState(false);
  const [showFuel, setShowFuel] = useState(false);
  const [showSlope, setShowSlope] = useState(false);

  // Year filter
  const [selectedYear, setSelectedYear] = useState<number | 0>(0);
  const YEAR_MIN = 2000;
  const YEAR_MAX = new Date().getFullYear();

  // State & county selection lists and loading flags
  const [stateList, setStateList] = useState<string[]>([]);
  const [countyList, setCountyList] = useState<string[]>([]);
  const [indexing, setIndexing] = useState<string>(""); // shows what index is being built

  // Controlled selects (avoid event re-use problems)
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedCounty, setSelectedCounty] = useState<string>("");

  // Initialize map on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const map = L.map("map", {
      center: [37.5, -96.5],
      zoom: 4,
      minZoom: 3,
      maxZoom: 12,
    });
    mapRef.current = map;

    // Base OSM tiles - hidden by default
    const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    });
    baseLayerRef.current = baseLayer;

    // Create empty layer groups for admin boundaries
    vectorLayersRef.current["us_state"] = L.layerGroup();
    vectorLayersRef.current["us_county"] = L.layerGroup();
    vectorLayersRef.current["fire_perimeter"] = L.layerGroup();

    preparePmtilesClients();

    setIsReady(true);

    // Zoom handlers: show immediate feedback on zoom start, do reload on zoom end
    function onZoomStart() {
      setLoading("Reloading layers for new zoom...");
    }
    async function onZoomEnd() {
      await reloadVisibleLayersOnZoom();
    }

    map.on("zoomstart", onZoomStart);
    map.on("zoomend", onZoomEnd);

    // Popup open handler: attach click listener to weather button inside popup
    function onPopupOpen(e: any) {
      try {
        const popupEl = e.popup && e.popup.getElement && e.popup.getElement();
        if (!popupEl) return;
        const btn = popupEl.querySelector(".open-weather");
        if (btn) {
          // remove existing to avoid duplicate listeners
          (btn as HTMLElement).onclick = null;
          (btn as HTMLElement).addEventListener("click", async (ev: any) => {
            ev.preventDefault();
            const fireId = (btn as HTMLElement).getAttribute("data-fire-id");
            if (!fireId) return;
            // fetch weather time series for this fire
            await fetchWeatherForFire(fireId);
          });
        }
      } catch (err) {
        // swallow
      }
    }
    map.on("popupopen", onPopupOpen);

    return () => {
      map.off("zoomstart", onZoomStart);
      map.off("zoomend", onZoomEnd);
      map.off("popupopen", onPopupOpen);
      const pm = pmClientsRef.current;
      Object.keys(pm).forEach((k) => {
        try {
          pm[k].close?.();
        } catch (e) {}
      });
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to open pmtiles clients
  async function preparePmtilesClients() {
    const names: PMTilesLayer[] = ["us_state", "us_county", "fire_perimeter"];
    for (const name of names) {
      try {
        const client = await createPmtilesClient(name);
        pmClientsRef.current[name] = client;
      } catch (err) {
        console.error(`PMTiles client failed for ${name}:`, err);
      }
    }
  }

  // Base map toggle
  useEffect(() => {
    if (!isReady || !mapRef.current || !baseLayerRef.current) return;
    const map = mapRef.current;
    const baseLayer = baseLayerRef.current;
    if (showBaseMap) {
      if (!map.hasLayer(baseLayer)) baseLayer.addTo(map);
    } else {
      if (map.hasLayer(baseLayer)) map.removeLayer(baseLayer);
    }
  }, [showBaseMap, isReady]);

  // Vector toggles
  useEffect(() => { if (!isReady || !mapRef.current) return; handleLayerToggle("us_state", showStates); }, [showStates, isReady]);
  useEffect(() => { if (!isReady || !mapRef.current) return; handleLayerToggle("us_county", showCounties); }, [showCounties, isReady]);
  useEffect(() => { if (!isReady || !mapRef.current) return; handleLayerToggle("fire_perimeter", showPerimeters); }, [showPerimeters, isReady]);

  // COG toggles
  useEffect(() => { if (!isReady || !mapRef.current) return; handleCogLayerToggle("fuel", showFuel); }, [showFuel, isReady]);
  useEffect(() => { if (!isReady || !mapRef.current) return; handleCogLayerToggle("slope", showSlope); }, [showSlope, isReady]);

  // Year filter effect
  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    if (showPerimeters) reloadFirePerimeterLayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  // COG layer handler - atomic swap when recreating on zoom
  async function handleCogLayerToggle(layerName: CogLayerName, show: boolean) {
    const map = mapRef.current;
    if (!map) return;

    if (show) {
      setLoading(`Loading ${layerName}...`);
      try {
        const newLayer = await createCogLayer(layerName, { opacity: 0.7 });
        const old = cogLayersRef.current[layerName];
        newLayer.addTo(map);
        cogLayersRef.current[layerName] = newLayer;
        if (old && map.hasLayer(old)) map.removeLayer(old);
      } catch (err) {
        console.error(`Failed to enable ${layerName} COG layer:`, err);
      } finally {
        setLoading("");
      }
    } else {
      const layer = cogLayersRef.current[layerName];
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      cogLayersRef.current[layerName] = null;
    }
  }

  // Vector layer toggle -> use fetchLayerGroup to build a new group and swap
  async function handleLayerToggle(layerName: PMTilesLayer, show: boolean) {
    const map = mapRef.current;
    if (!map) return;
    if (!pmClientsRef.current[layerName]) {
      console.warn(`PMTiles client not ready for ${layerName}`);
    }
    if (!show) {
      const existing = vectorLayersRef.current[layerName];
      if (existing && map.hasLayer(existing)) map.removeLayer(existing);
      return;
    }

    setLoading(`Loading ${layerName}...`);
    try {
      const newGroup = await fetchLayerGroup(layerName, layerName === "fire_perimeter" ? (selectedYear || null) : null);
      const existing = vectorLayersRef.current[layerName];
      if (!map.hasLayer(newGroup)) newGroup.addTo(map);
      vectorLayersRef.current[layerName] = newGroup;
      if (existing && map.hasLayer(existing)) map.removeLayer(existing);
      newGroup.eachLayer((l: any) => { if (l.bringToFront) l.bringToFront(); });
    } catch (err) {
      console.error(`Failed to load ${layerName}:`, err);
    } finally {
      setLoading("");
    }
  }

  // Reload fire perimeters with year filter (keeps layer visible)
  async function reloadFirePerimeterLayer() {
    const map = mapRef.current;
    if (!map) return;
    if (!pmClientsRef.current["fire_perimeter"]) return;

    setLoading("Reloading fire perimeters...");
    try {
      const newGroup = await fetchLayerGroup("fire_perimeter", selectedYear || null);
      const existing = vectorLayersRef.current["fire_perimeter"];
      if (!map.hasLayer(newGroup)) newGroup.addTo(map);
      vectorLayersRef.current["fire_perimeter"] = newGroup;
      if (existing && map.hasLayer(existing)) map.removeLayer(existing);
      newGroup.eachLayer((l: any) => { if (l.bringToFront) l.bringToFront(); });
    } catch (err) {
      console.error("Error reloading fire perimeters:", err);
    } finally {
      setLoading("");
    }
  }

  // Fetch a new LayerGroup for a PMTiles layer (non-destructive)
  async function fetchLayerGroup(layerName: PMTilesLayer, yearFilter: number | null = null) {
    const map = mapRef.current!;
    const client = pmClientsRef.current[layerName];
    const group = L.layerGroup();

    if (!client) return group;

    const z = Math.min(Math.max(Math.round(map.getZoom()), 0), 12);
    const bounds = map.getBounds();
    const tileRange = tileRangeForBounds(bounds, z);

    for (let x = tileRange.minX; x <= tileRange.maxX; x++) {
      for (let y = tileRange.minY; y <= tileRange.maxY; y++) {
        try {
          const geo = await client.getTile(z, x, y);
          if (geo && geo.features && geo.features.length) {
            let features = geo.features;
            if (layerName === "fire_perimeter" && yearFilter) {
              features = features.filter((f: any) => {
                const v = f.properties ? (f.properties.FIRE_YEAR || f.properties.fire_year || f.properties.fireYear) : null;
                if (v === null || v === undefined) return false;
                return Number(v) === Number(yearFilter);
              });
            }
            if (features.length) {
              const gj = { type: "FeatureCollection", features };
              const gjLayer = L.geoJSON(gj as any, {
                style: (feat) => styleFeature(layerName, feat),
                onEachFeature: (feat, layer) => {
                  layer.on("click", () => {
                    const p = feat.properties || {};
                    const html = popupHtmlForFeature(layerName, p);
                    layer.bindPopup(html).openPopup();
                  });
                },
              });
              gjLayer.addTo(group);
            }
          }
        } catch (err) {
          console.warn(`Tile fetch error ${layerName} ${z}/${x}/${y}:`, err);
        }
      }
    }

    return group;
  }

  // Reload visible layers on zoom change:
  async function reloadVisibleLayersOnZoom() {
    const map = mapRef.current;
    if (!map) return;

    setLoading("Reloading layers for new zoom...");

    const promises: Promise<void>[] = [];

    // Vector layers
    const vectorNames: PMTilesLayer[] = ["us_state", "us_county", "fire_perimeter"];
    for (const name of vectorNames) {
      if ((name === "us_state" && showStates) || (name === "us_county" && showCounties) || (name === "fire_perimeter" && showPerimeters)) {
        const p = (async () => {
          try {
            const newGroup = await fetchLayerGroup(name, name === "fire_perimeter" ? (selectedYear || null) : null);
            const existing = vectorLayersRef.current[name];
            if (!map.hasLayer(newGroup)) newGroup.addTo(map);
            vectorLayersRef.current[name] = newGroup;
            if (existing && map.hasLayer(existing)) map.removeLayer(existing);
            newGroup.eachLayer((l: any) => { if (l.bringToFront) l.bringToFront(); });
          } catch (err) {
            console.error(`Error reloading ${name} on zoom change:`, err);
          }
        })();
        promises.push(p);
      }
    }

    // COG layers: recreate and swap
    const cogNames: CogLayerName[] = ["fuel", "slope"];
    for (const c of cogNames) {
      if ((c === "fuel" && showFuel) || (c === "slope" && showSlope)) {
        const p = (async () => {
          try {
            const newLayer = await createCogLayer(c, { opacity: 0.7 });
            const existing = cogLayersRef.current[c];
            if (!map.hasLayer(newLayer)) newLayer.addTo(map);
            cogLayersRef.current[c] = newLayer;
            if (existing && map.hasLayer(existing)) map.removeLayer(existing);
          } catch (err) {
            console.error(`Error reloading COG ${c} on zoom change:`, err);
          }
        })();
        promises.push(p);
      }
    }

    try {
      await Promise.all(promises);
    } catch (err) {
      // individual errors are logged above
    } finally {
      setTimeout(() => setLoading(""), 250);
    }
  }

  // -------------------------
  // Name indexing & zoom-to logic
  // -------------------------
  const CONUS_BOUNDS = L.latLngBounds(
    L.latLng(24.396308, -124.848974),
    L.latLng(49.384358, -66.885444)
  );

  async function buildNameIndex(layerName: "us_state" | "us_county") {
    if (!isReady || !mapRef.current) return;
    const client = pmClientsRef.current[layerName];
    if (!client) return;

    setIndexing(layerName);
    try {
      const z = 4;
      const tileRange = tileRangeForBounds(CONUS_BOUNDS, z);
      const namesSet = new Set<string>();

      for (let x = tileRange.minX; x <= tileRange.maxX; x++) {
        for (let y = tileRange.minY; y <= tileRange.maxY; y++) {
          try {
            const geo = await client.getTile(z, x, y);
            if (geo && geo.features && geo.features.length) {
              for (const f of geo.features) {
                const props = f.properties || {};
                const name = props.NAME || props.name || props.STATE_NAME || props.COUNTY || props.County || props.STATE;
                if (name && typeof name === "string") namesSet.add(name);
              }
            }
          } catch (err) {
            // ignore tile-level errors
          }
        }
      }

      const names = Array.from(namesSet).sort((a, b) => a.localeCompare(b));
      if (layerName === "us_state") setStateList(names);
      if (layerName === "us_county") setCountyList(names);
    } catch (err) {
      console.error("Error building name index:", err);
    } finally {
      setIndexing("");
    }
  }

  async function zoomToNamedFeature(layerName: "us_state" | "us_county", targetName: string) {
    const map = mapRef.current;
    if (!map) return;
    const client = pmClientsRef.current[layerName];
    if (!client) {
      console.error(`No PMTiles client for ${layerName}`);
      return;
    }

    setLoading(`Locating ${targetName}...`);

    try {
      const zSearch = 4;
      const tileRange = tileRangeForBounds(CONUS_BOUNDS, zSearch);

      let foundFeature: any = null;

      const matchName = (props: any) => {
        if (!props) return false;
        const candidates = [props.NAME, props.name, props.STATE_NAME, props.COUNTY, props.County, props.STATE];
        for (const c of candidates) {
          if (!c) continue;
          if (String(c).toLowerCase() === targetName.toLowerCase()) return true;
        }
        return false;
      };

      outer: for (let x = tileRange.minX; x <= tileRange.maxX; x++) {
        for (let y = tileRange.minY; y <= tileRange.maxY; y++) {
          try {
            const geo = await client.getTile(zSearch, x, y);
            if (geo && geo.features && geo.features.length) {
              for (const f of geo.features) {
                if (matchName(f.properties)) {
                  foundFeature = f;
                  break outer;
                }
              }
            }
          } catch (err) {
            // ignore
          }
        }
      }

      if (foundFeature) {
        const temp = L.geoJSON(foundFeature as any);
        const b = temp.getBounds();
        if (b && b.isValid()) {
          map.fitBounds(b.pad(0.05));
          if (layerName === "us_state" && !showStates) setShowStates(true);
          if (layerName === "us_county" && !showCounties) setShowCounties(true);
          setLoading("");
          return;
        }
      }

      // fallback deeper search
      const fallbackZooms = [6, 8, 10];
      for (const z of fallbackZooms) {
        const tRange = tileRangeForBounds(CONUS_BOUNDS, z);
        for (let x = tRange.minX; x <= tRange.maxX; x++) {
          for (let y = tRange.minY; y <= tRange.maxY; y++) {
            try {
              const geo = await client.getTile(z, x, y);
              if (geo && geo.features && geo.features.length) {
                for (const f of geo.features) {
                  if (matchName(f.properties)) {
                    const temp = L.geoJSON(f as any);
                    const b = temp.getBounds();
                    if (b && b.isValid()) {
                      map.fitBounds(b.pad(0.05));
                      if (layerName === "us_state" && !showStates) setShowStates(true);
                      if (layerName === "us_county" && !showCounties) setShowCounties(true);
                      setLoading("");
                      return;
                    }
                  }
                }
              }
            } catch (err) {
              // ignore
            }
          }
        }
      }

      console.warn(`Feature "${targetName}" not found in PMTiles ${layerName}`);
    } catch (err) {
      console.error("Error zooming to feature:", err);
    } finally {
      setLoading("");
    }
  }

  // Helpers
  function tileRangeForBounds(bounds: L.LatLngBounds, z: number) {
    function long2tile(lon: number, zoom: number) {
      return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
    }
    function lat2tile(lat: number, zoom: number) {
      const rad = (lat * Math.PI) / 180;
      return Math.floor(
        ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
          Math.pow(2, zoom)
      );
    }
    const nw = bounds.getNorthWest();
    const se = bounds.getSouthEast();
    const minX = Math.max(0, long2tile(nw.lng, z));
    const maxX = Math.max(0, long2tile(se.lng, z));
    const minY = Math.max(0, lat2tile(nw.lat, z));
    const maxY = Math.max(0, lat2tile(se.lat, z));
    return { minX, maxX, minY, maxY };
  }

  function styleFeature(pmName: string, feat: any) {
    if (pmName === "us_state") {
      return {
        color: "#2b7a0b",
        weight: 1,
        fillColor: "rgba(120,200,65,0.07)",
        fillOpacity: 0.6,
      };
    }
    if (pmName === "us_county") {
      return {
        color: "#999",
        weight: 0.6,
        fillColor: "rgba(120,200,65,0.02)",
        fillOpacity: 0.4,
      };
    }
    if (pmName === "fire_perimeter") {
      return {
        color: "#FB4141",
        weight: 1.2,
        fillColor: "rgba(251,65,65,0.25)",
        fillOpacity: 0.5,
      };
    }
    return {};
  }


  function popupHtmlForFeature(layerName: string, props: any) {
    // (to avoid duplicate function - this is the actual implementation used above)
    // Implementation defined above already; intentionally left as-is.
    return (function () {
      if (layerName === "us_state") {
        return `<strong>${props.NAME || "State"}</strong><br/>FIPS: ${props.STATEFP || ""}`;
      }
      if (layerName === "us_county") {
        return `<strong>${props.NAME || "County"}</strong><br/>GEOID: ${props.GEOID || ""}`;
      }
      if (layerName === "fire_perimeter") {
        const idCandidate = props.GlobalID || props.GEO_ID || props.UNQE_FIRE_ || props.id || "";
        return `<div style="min-width:220px">
                  <strong>${props.INCIDENT || props.FIRE_YEAR || "Perimeter"}</strong><br/>
                  Year: ${props.FIRE_YEAR || ""}<br/>
                  Acres: ${props.GIS_ACRES || ""}<br/>
                  <div style="margin-top:8px;">
                    <button class="open-weather" data-fire-id="${idCandidate}" style="padding:6px 8px;border-radius:6px;border:none;background:#78C841;color:#fff;font-weight:700;cursor:pointer">
                      i
                    </button>
                  </div>
                </div>`;
      }
      return "<div>Feature</div>";
    })();
  }

  // FETCH WEATHER for a given fire id (calls backend)
  async function fetchWeatherForFire(fireId: string) {
    setWeatherOpen(true);
    setWeatherLoading(true);
    setWeatherSeries(null);
    setWeatherStation(null);

    try {
      const base = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
      const url = base ? `${base}/api/fires/weather/${encodeURIComponent(fireId)}` : `/api/fires/weather/${encodeURIComponent(fireId)}`;
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      console.log("DEBUG weather payload:", { start: data.start_date, end: data.end_date, seriesSample: data.series?.slice(0,4) });

      // expect: { station: {station, latitude, longitude}, series: [ ... ] }
      setWeatherFireStart(data.start_date ? String(data.start_date) : null);
      setWeatherFireEnd(data.end_date ? String(data.end_date) : null);
      setWeatherStation(data.station || null);
      setWeatherSeries(data.series || null);
    } catch (err) {
      console.error("Failed to fetch weather for fire:", err);
      setWeatherSeries(null);
      setWeatherStation(null);
      alert("Failed to load weather series for this fire.");
    } finally {
      setWeatherLoading(false);
    }
  }

  // Close weather panel
  function closeWeatherPanel() {
    setWeatherOpen(false);
    setWeatherSeries(null);
    setWeatherStation(null);
  }

  // Render UI
  return (
    <div style={{ display: "flex", gap: 12, height: "100vh", padding: "20px" }}>
      <div style={{ flex: 1, position: "relative" }}>
        {loading && (
          <div style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 1000,
            background: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "10px 20px",
            borderRadius: 4
          }}>
            {loading}
          </div>
        )}
        <div id="map" style={{ width: "100%", height: "100%", backgroundColor: "#f0f0f0" }} />
      </div>

      {/* Sidebar controls (unchanged) */}
      <div style={{ width: 340, flexShrink: 0 }}>
        <div style={{
          background: "white",
          padding: 20,
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
        }}>
          <h3 style={{ marginTop: 0 }}>Map Layers</h3>

          {/* Base Map Toggle */}
          <div style={{ marginBottom: 15, paddingBottom: 15, borderBottom: "2px solid #e0e0e0" }}>
            <label style={{ display: "block", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showBaseMap}
                onChange={(e) => setShowBaseMap(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              <strong style={{ color: "#0066cc" }}>OpenStreetMap Base</strong>
            </label>
            <div style={{ fontSize: 12, color: "#666", marginLeft: 24 }}>Toggle base map visibility</div>
          </div>

          <h4 style={{ marginTop: 0, marginBottom: 10 }}>Admin Boundaries</h4>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showStates}
                onChange={(e) => setShowStates(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              <strong>US States</strong>
            </label>
            <div style={{ fontSize: 12, color: "#666", marginLeft: 24 }}>State boundaries</div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showCounties}
                onChange={(e) => setShowCounties(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              <strong>US Counties</strong>
            </label>
            <div style={{ fontSize: 12, color: "#666", marginLeft: 24 }}>County boundaries</div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showPerimeters}
                onChange={(e) => setShowPerimeters(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              <strong>Fire Perimeters</strong>
            </label>
            <div style={{ fontSize: 12, color: "#666", marginLeft: 24 }}>Historical fire boundaries</div>
          </div>

          <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid #e0e0e0" }} />

          <h4 style={{ marginTop: 0, marginBottom: 10 }}>Raster Layers (COG)</h4>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showFuel}
                onChange={(e) => setShowFuel(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              <strong>Fuel Type</strong>
            </label>
            <div style={{ fontSize: 12, color: "#666", marginLeft: 24 }}>Vegetation fuel model</div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showSlope}
                onChange={(e) => setShowSlope(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              <strong>Slope</strong>
            </label>
            <div style={{ fontSize: 12, color: "#666", marginLeft: 24 }}>Terrain slope gradient</div>
          </div>

          <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid #e0e0e0" }} />

          {/* Year slider */}
          <div style={{ marginBottom: 12 }}>
            <h4 style={{ margin: "8px 0" }}>Filter Fire Perimeters by Year</h4>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedYear === 0}
                  onChange={(e) => setSelectedYear(e.target.checked ? 0 : YEAR_MAX)}
                />
                <span>All years</span>
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="range"
                min={YEAR_MIN}
                max={YEAR_MAX}
                value={selectedYear === 0 ? YEAR_MAX : selectedYear}
                onChange={(e) => { const v = Number(e.target.value); setSelectedYear(v); }}
                disabled={selectedYear === 0}
                style={{ flex: 1 }}
              />
              <div style={{ minWidth: 72, textAlign: "right", fontWeight: 700 }}>
                {selectedYear === 0 ? "All" : selectedYear}
              </div>
            </div>
          </div>

          <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid #e0e0e0" }} />

          {/* State & County selection boxes */}
          <div style={{ marginBottom: 12 }}>
            <h4 style={{ margin: "8px 0" }}>Quick Zoom (State / County)</h4>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                style={{ flex: 1, padding: "8px 10px", borderRadius: 6 }}
                value={selectedState}
                onChange={async (e) => {
                  const v = e.target.value;
                  setSelectedState("");
                  if (!v) return;
                  await zoomToNamedFeature("us_state", v);
                }}
                onFocus={() => { if (!stateList.length && !indexing) buildNameIndex("us_state"); }}
                title="Select a state to zoom"
              >
                <option value="">{indexing === "us_state" ? "Indexing states..." : "Choose a state..."}</option>
                {stateList.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>

              <select
                style={{ flex: 1, padding: "8px 10px", borderRadius: 6 }}
                value={selectedCounty}
                onChange={async (e) => {
                  const v = e.target.value;
                  setSelectedCounty("");
                  if (!v) return;
                  await zoomToNamedFeature("us_county", v);
                }}
                onFocus={() => { if (!countyList.length && !indexing) buildNameIndex("us_county"); }}
                title="Select a county to zoom"
              >
                <option value="">{indexing === "us_county" ? "Indexing counties..." : "Choose a county..."}</option>
                {countyList.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ fontSize: 12, color: "#666" }}>
              Click a dropdown (first focus may build an index). Selecting an item zooms immediately to it.
            </div>
          </div>

          <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid #e0e0e0" }} />

          <div style={{ fontSize: 12, color: "#888" }}>
            <strong>Note:</strong> Layers appear on top when toggled
          </div>
        </div>
      </div>

      {/* WEATHER PANEL (overlaps, fixed) */}
      <WeatherPanel
  open={weatherOpen}
  onClose={closeWeatherPanel}
  loading={weatherLoading}
  station={weatherStation}
  series={weatherSeries}
  startDate={weatherFireStart}
  endDate={weatherFireEnd}
/>

    </div>
  );
}
