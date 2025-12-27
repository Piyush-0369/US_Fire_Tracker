import "./FireCard.css";

export type FireCardProps = {
  date: string;
  time: string;
  satellite: string;
  frp: number | string;
  location: string;
};

export default function FireCard({ date, time, satellite, frp, location }: FireCardProps) {
  
  // Normalize FRP value (if "-")
  const frpValue = typeof frp === "number" ? frp : 0;

  // Determine intensity bar color
  function getFRPColor(val: number) {
    if (val < 20) return "#4caf50";      // green
    if (val < 50) return "#ffc107";      // yellow
    if (val < 100) return "#ff9800";     // orange
    return "#f44336";                    // red
  }

  const barColor = getFRPColor(frpValue);
  const barWidth = Math.min(frpValue, 100); // clamp at 100%

  return (
    <div className="fire-card">
      <div className="fire-card-header">
        <h3>{satellite}</h3>
      </div>

      <p><strong>Date:</strong> {date}</p>
      <p><strong>Time:</strong> {time}</p>
      <p><strong>Satellite:</strong> {satellite}</p>
      <p><strong>FRP:</strong> {frp}</p>

      {/* 🔥 Intensity Bar */}
      <div className="intensity-bar">
        <div
          className="intensity-fill"
          style={{
            width: `${barWidth}%`,
            backgroundColor: barColor,
          }}
        />
      </div>

      <p><strong>Location:</strong> {location}</p>
    </div>
  );
}
