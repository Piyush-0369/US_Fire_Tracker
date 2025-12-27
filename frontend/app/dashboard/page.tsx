"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Leaderboard from "../components/leaderboard";
import FireCard from "../components/FireCard";
import "./styles.css";

type LeaderboardEntry = { state: string; count: number };
type FireEntry = {
  id: string;
  state?: string;
  latitude: number;
  longitude: number;
  acq_date?: string;
  acq_time?: string;
  satellite?: string;
  frp?: number;
};

export default function DashboardPage() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbError, setLbError] = useState<string | null>(null);

  const [liveFires, setLiveFires] = useState<FireEntry[]>([]);
  const [firesLoading, setFiresLoading] = useState(false);
  const [firesError, setFiresError] = useState<string | null>(null);

  const states = [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
    "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
    "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
    "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
    "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
    "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
    "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
    "Wisconsin","Wyoming"
  ];

  // Fetch leaderboard (top states)
  useEffect(() => {
    let mounted = true;

    async function fetchTopStates() {
      setLbLoading(true);
      setLbError(null);

      try {
        const base = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
        const url = base
          ? `${base}/api/fires_archive/top-states`
          : `/api/fires_archive/top-states`;

        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!mounted) return;
        if (!Array.isArray(data)) throw new Error("Unexpected response shape");

        setLeaderboard(
          data.map((d: any) => ({
            state: String(d.state || "Unknown"),
            count: Number(d.count || 0),
          }))
        );
      } catch (err: any) {
        console.error("Failed to fetch leaderboard:", err);
        if (mounted) setLbError(err?.message || "Failed to load leaderboard");
      } finally {
        if (mounted) setLbLoading(false);
      }
    }

    fetchTopStates();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch live fires (updates every 15s)
  useEffect(() => {
    let mounted = true;
    const REFRESH_INTERVAL_MS = 15000;

    async function fetchLiveFires() {
      setFiresLoading(true);
      setFiresError(null);

      try {
        const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
        const res = await fetch(`${base}/api/fires_live`, {
          credentials: "same-origin",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const geo = await res.json();
        if (!mounted) return;

        const features = geo?.features || [];

        const mapped = features.map((f: any, idx: number) => ({
          id: `${f.properties?.acq_date}-${f.properties?.acq_time}-${idx}`,
          state: f.properties?.state,
          latitude: f.geometry.coordinates[1],
          longitude: f.geometry.coordinates[0],
          acq_date: f.properties?.acq_date,
          acq_time: f.properties?.acq_time,
          satellite: f.properties?.satellite,
          frp: f.properties?.frp,
        }));

        setLiveFires(mapped);
      } catch (err: any) {
        console.error("Failed to fetch live fires:", err);
        if (mounted) setFiresError(err?.message || "Failed to load live fires");
      } finally {
        if (mounted) setFiresLoading(false);
      }
    }

    fetchLiveFires();
    const interval = setInterval(fetchLiveFires, REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Search redirect
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    router.push(q ? `/maps?search=${encodeURIComponent(q)}` : "/maps");
  }

  // Filtered fires
  const filteredFires = liveFires.filter(
    (f) =>
      (!stateFilter || f.state === stateFilter) &&
      (!search ||
        `${f.state ?? ""}`.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="dashboard-layout">
      {/* LEFT SIDE */}
      <div className="dashboard-main">
        <h1 className="page-title">US Fire Dashboard</h1>

        {/* Search & Filters */}
        <form className="filters" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search fires..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button type="submit" className="go-btn">
            Go
          </button>
        </form>

        {/* Live Fire Cards */}
        <div className="fires-cards">
          {firesLoading && <p>Loading live fires...</p>}
          {firesError && (
            <p style={{ color: "#a00" }}>Error: {firesError}</p>
          )}
          {!firesLoading &&
            !firesError &&
            filteredFires.length === 0 && <p>No live fires found.</p>}

          <div className="cards-grid">
            {filteredFires.map((f) => (
              <FireCard
                key={f.id}
                date={f.acq_date ?? "-"}
                time={f.acq_time ?? "-"}
                satellite={f.satellite ?? "Unknown"}
                frp={f.frp ?? "-"}
                location={`${f.latitude.toFixed(2)}, ${f.longitude.toFixed(
                  2
                )}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div className="right-sidebar">
        {lbLoading ? (
          <div className="card" style={{ padding: 12 }}>
            Loading top states...
          </div>
        ) : lbError ? (
          <div className="card" style={{ padding: 12, color: "#a00" }}>
            Failed to load top states: {lbError}
          </div>
        ) : (
          <Leaderboard
            data={
              leaderboard.length
                ? leaderboard
                : [
                    { state: "California", count: 123 },
                    { state: "Texas", count: 98 },
                    { state: "Florida", count: 87 },
                    { state: "Arizona", count: 74 },
                    { state: "Nevada", count: 63 },
                  ]
            }
          />
        )}
      </div>
    </div>
  );
}
