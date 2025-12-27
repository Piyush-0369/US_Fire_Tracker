"use client";

import Link from "next/link";
import "./Navbar.css";

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="logo">🔥 FireTrack</div>
      </div>

      <div className="navbar-links">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/maps">Maps</Link>
        <Link href="/live">Live Fires</Link> 
        <Link href="/reports">Reports</Link>
      </div>
    </nav>
  );
}
