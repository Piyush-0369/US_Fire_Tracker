// app/live/page.tsx
"use client";

import dynamic from "next/dynamic";
import "../globals.css";

// Load map component only on client
const LiveMapComponent = dynamic(() => import("./LiveMapComponent"), { ssr: false });

export default function LivePage() {
  return (
    <div className="maps-page">
      <h1 className="page-title">Live Fires (VIIRS — high confidence)</h1>

      <div className="map-wrapper" style={{ height: "80vh" }}>
        <LiveMapComponent />
      </div>
    </div>
  );
}
