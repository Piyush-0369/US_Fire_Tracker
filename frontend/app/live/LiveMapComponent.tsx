// app/live/LiveMapComponent.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const REFRESH_INTERVAL_MS = 15_000;

export default function LiveMapComponent() {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBase, setShowBase] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  // initialize map
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mapRef.current) return;

    const map = L.map("live-map", {
      center: [37.5, -96.5],
      zoom: 4,
      minZoom: 3,
      maxZoom: 12,
    });

    mapRef.current = map;

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    });

    baseLayerRef.current = osm;
    if (showBase) osm.addTo(map);

    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // base toggle
  useEffect(() => {
    const map = mapRef.current;
    const osm = baseLayerRef.current;
    if (!map || !osm) return;
    if (showBase) {
      if (!map.hasLayer(osm)) osm.addTo(map);
    } else {
      if (map.hasLayer(osm)) map.removeLayer(osm);
    }
  }, [showBase]);

  // fetch + render markers
  async function fetchAndRender() {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    setLoading(true);
    try {
      const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
      const res = await fetch(`${base}/api/fires_live`, { credentials: "same-origin" });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const geo = await res.json();

      // clear existing markers
      layer.clearLayers();

      if (geo?.type === "FeatureCollection" && Array.isArray(geo.features)) {
        geo.features.forEach((f: any) => {
          const geom = f.geometry;
          if (!geom || geom.type !== "Point") return;
          const [lon, lat] = geom.coordinates;

          // scale emoji size by FRP, fallback to moderate size
          const frp = f.properties?.frp;
          const radius = frp ? Math.min(Math.max(frp / 2, 4), 30) : 8;
          const size = Math.min(Math.max(radius * 2.2, 16), 48);

          const fireIcon = L.divIcon({
            html: `<div style="
              font-size:${size}px;
              transform: translate(-50%, -50%);
            ">🔥</div>`,
            className: "",
            iconSize: [size, size],
          });

          const marker = L.marker([lat, lon], { icon: fireIcon });

          marker.bindPopup(
            `<div style="min-width:200px">
               <strong>Fire</strong><br/>
               Date: ${f.properties?.acq_date ?? "-"} ${f.properties?.acq_time ?? ""}<br/>
               Satellite: ${f.properties?.satellite ?? "-"}<br/>
               FRP: ${f.properties?.frp ?? "-"}<br/>
             </div>`
          );

          marker.addTo(layer);
        });
      }

      setLastFetchedAt(new Date().toISOString());
    } catch (err) {
      console.error("Failed to fetch live fires:", err);
    } finally {
      setLoading(false);
    }
  }

  // initial + polling fetch
  useEffect(() => {
    fetchAndRender();
    const t = setInterval(fetchAndRender, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Controls */}
      <div
        style={{
          position: "absolute",
          zIndex: 1000,
          left: 16,
          top: 16,
          background: "white",
          padding: "10px 12px",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} />
            <span style={{ fontWeight: 700 }}>Base map</span>
          </label>

          <button
            onClick={fetchAndRender}
            style={{
              border: "none",
              padding: "6px 10px",
              borderRadius: 6,
              background: "#78C841",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
            disabled={loading}
            title="Refresh now"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          {lastFetchedAt ? `Last: ${new Date(lastFetchedAt).toLocaleString()}` : "No data yet"}
        </div>
      </div>

      {/* Map container */}
      <div id="live-map" style={{ flex: 1, width: "100%", height: "100%" }} />
    </div>
  );
}
