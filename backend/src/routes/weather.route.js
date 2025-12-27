import express from "express";
import {
  fetchStations,
  fetchStationById,
  fetchReadings,
} from "../controllers/weather.controller.js";

const router = express.Router();

/**
 * GET /api/weather/stations
 * Query params:
 *  - q         (optional) search string against station name or station id
 *  - bbox      (optional) "minLon,minLat,maxLon,maxLat"
 *  - limit     (optional) integer (default 100)
 *  - offset    (optional) integer (default 0)
 *  - country   (optional) country name/code filter (if you have it)
 */
router.get("/stations", fetchStations);

/**
 * GET /api/weather/stations/:id
 * Path param:
 *  - id (station id or primary key)
 */
router.get("/stations/:id", fetchStationById);

/**
 * GET /api/weather/readings
 * Query params:
 *  - stationId (required) station primary id or station code
 *  - startDate (optional) YYYY-MM-DD
 *  - endDate   (optional) YYYY-MM-DD
 *  - limit     (optional) integer (default 1000)
 *  - offset    (optional) integer (default 0)
 */
router.get("/readings", fetchReadings);

export default router;
