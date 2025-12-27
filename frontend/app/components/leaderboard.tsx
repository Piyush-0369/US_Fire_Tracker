"use client";

import "./leaderboard.css";

export type LeaderboardEntry = {
  state: string;
  count: number;
};

export default function Leaderboard({ data }: { data: LeaderboardEntry[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="leaderboard-frame">

      <h2 className="leaderboard-title">🔥 Top States</h2>

      <div className="leaderboard-list">
        {data.map((item, index) => {
          const pct = Math.round((item.count / max) * 100);
          const rank = index + 1;

          return (
            <div key={item.state} className="leaderboard-row">
              <span className={`lb-rank rank-${rank}`}>#{rank}</span>

              <div className="lb-info">
                <h4>{item.state}</h4>

                <div className="lb-bar">
                  <div className="lb-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <span className="lb-count">{item.count}</span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
