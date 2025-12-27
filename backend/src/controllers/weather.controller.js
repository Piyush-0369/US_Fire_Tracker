import {
  queryStations,
  queryStationById,
  queryReadings,
} from "../services/weather.service.js";

/* GET /api/weather/stations */
export async function fetchStations(req, res) {
  console.log("→ fetchStations hit");  // ADD
  try {
    const params = {
      q: req.query.q,
      bbox: req.query.bbox,
      country: req.query.country,
      limit: req.query.limit,
      offset: req.query.offset,
    };
    console.log("→ query params:", params);  // ADD
    const rows = await queryStations(params);
    console.log("→ rows received:", rows.length); // ADD
    res.json(rows);
  } catch (err) {
    console.error("fetchStations error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}


/* GET /api/weather/stations/:id */
export async function fetchStationById(req, res) {
  try {
    const id = req.params.id;
    const row = await queryStationById(id);
    if (!row) return res.status(404).json({ message: "Station not found" });
    res.json(row);
  } catch (err) {
    console.error("fetchStationById error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/* GET /api/weather/readings */
export async function fetchReadings(req, res) {
  try {
    const params = {
      stationId: req.query.stationId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit,
      offset: req.query.offset,
    };

    if (!params.stationId) {
      return res.status(400).json({ error: "stationId query parameter is required" });
    }

    const rows = await queryReadings(params);
    res.json(rows);
  } catch (err) {
    console.error("fetchReadings error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
