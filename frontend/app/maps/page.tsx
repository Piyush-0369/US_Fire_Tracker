"use client";

import dynamic from "next/dynamic";
import "./styles.css";

// Prevent SSR issues with Leaflet
const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false });

export default function MapsPage() {
  return (
    <div className="maps-page">
      <h1 className="page-title">Interactive Fire Map</h1>

      <div className="map-wrapper">
        <MapComponent />
      </div>
    </div>
  );
}
