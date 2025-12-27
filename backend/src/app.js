import express from "express";
import cors from "cors";
import notFound from "./middlewares/notFound.js";
import errorHandler from "./middlewares/errorHandler.js";

import cog from "./routes/cog.route.js";
import weather from "./routes/weather.route.js";
import tiles from "./routes/tiles.route.js";
import fuelLegend from "./routes/fuelLegend.route.js"; // NEW
import firesLive from "./routes/fires_live.route.js"; // <-- NEW
import firesArchive from "./routes/fires_archive.route.js";
import reports from "./routes/reports.route.js";
import fireWeather from "./routes/fire_weather.route.js";

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use("/api", fuelLegend); // exposes GET /api/cog/fuel-legend - must be before /api/cog
app.use("/api/cog", cog);
app.use("/api/weather", weather);
app.use("/api/tiles", tiles);
app.use("/api/fires_live", firesLive);
app.use("/api/fires_archive", firesArchive);
app.use("/api/reports", reports);
app.use("/api/fires", fireWeather);

// Middlewares
// Force log any unhandled errors
app.use((err, req, res, next) => {
  console.error("UNCAUGHT ERROR:", err);
  next(err);
});

app.use(notFound);
app.use(errorHandler);

export default app;
