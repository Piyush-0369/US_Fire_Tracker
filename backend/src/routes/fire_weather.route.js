// src/routes/fire_weather.route.js
// Returns time series (date => temp, dewp) for a fire (id or GUID) covering
// [start_date - 15d, end_date + 15d] using nearest weather station / coord.

import express from "express";
import pool from "../db/db_index.js";

const router = express.Router();

function isIntegerString(s) {
  return /^\d+$/.test(String(s));
}

/**
 * GET /api/fires/weather/:idOrKey
 *
 * Accepts:
 *  - numeric id (primary key fires_staging_staging.id)
 *  - or string identifier that may match GlobalID, GEO_ID, UNQE_FIRE_
 */
router.get("/weather/:idOrKey", async (req, res) => {
  const idOrKey = req.params.idOrKey;
  if (!idOrKey) return res.status(400).json({ error: "fire id required" });

  try {
    // Resolve the actual fire row by trying numeric id first, then alternate keys
    let fire = null;

    if (isIntegerString(idOrKey)) {
      const q = `SELECT id, start_date, end_date, station_coord_id, geom
                 FROM fires_staging_staging
                 WHERE id = $1
                 LIMIT 1;`;
      const r = await pool.query(q, [Number(idOrKey)]);
      if (r.rows && r.rows.length) fire = r.rows[0];
    }

    if (!fire) {
      const altSql = `
  SELECT id, start_date, end_date, station_coord_id, geom
  FROM fires_staging_staging
  WHERE "GlobalID" = $1 OR "GEO_ID" = $1 OR "UNQE_FIRE_" = $1
  LIMIT 1;
`;

      const altRes = await pool.query(altSql, [idOrKey]);
      if (altRes.rows && altRes.rows.length) fire = altRes.rows[0];
    }

    if (!fire) {
      return res.status(404).json({ error: "fire not found (tried id and alternative keys)" });
    }

    if (!fire.start_date || !fire.end_date) {
      return res.status(400).json({ error: "fire record missing start_date or end_date" });
    }

    // compute date range (15 days before and after)
    const rangeRes = await pool.query(
      `SELECT ($1::date - INTERVAL '15 days')::date AS range_start,
              ($2::date + INTERVAL '15 days')::date AS range_end;`,
      [fire.start_date, fire.end_date]
    );
    const rangeStart = rangeRes.rows[0].range_start;
    const rangeEnd = rangeRes.rows[0].range_end;

    // 2) find a coordinate to query from:
    // prefer the station_coord_id if present; otherwise attempt to find nearest unique_weather_coords by fire.geom
    let coord = null;
    if (fire.station_coord_id) {
      const csql = `
        SELECT coord_id, latitude, longitude, geom_point
        FROM unique_weather_coords
        WHERE coord_id = $1
        LIMIT 1;
      `;
      const cres = await pool.query(csql, [fire.station_coord_id]);
      if (cres.rows && cres.rows.length) coord = cres.rows[0];
    }

    if (!coord) {
      // fallback: nearest coord to the fire geometry (if both geometries exist)
      if (fire.geom) {
        // Use ST_GeomFromGeoJSON to convert the stored JSON geometry (if stored as GeoJSON)
        // and KNN operator <-> to find nearest.
        try {
          const nearestRes = await pool.query(
            `SELECT u.coord_id, u.latitude, u.longitude, u.geom_point
             FROM unique_weather_coords u
             WHERE u.geom_point IS NOT NULL
             ORDER BY u.geom_point <-> ST_GeomFromGeoJSON($1)
             LIMIT 1;`,
            [JSON.stringify(fire.geom)]
          );
          if (nearestRes.rows && nearestRes.rows.length) coord = nearestRes.rows[0];
        } catch (err) {
          // If spatial query fails (PostGIS not available or geometry type mismatch),
          // fall through to non-spatial fallback.
          console.warn("Spatial nearest coord failed:", err && err.message ? err.message : err);
        }
      }

      if (!coord) {
        // as a last resort pick any coord (first)
        const anyRes = await pool.query(
          `SELECT coord_id, latitude, longitude, geom_point FROM unique_weather_coords LIMIT 1;`
        );
        if (anyRes.rows && anyRes.rows.length) coord = anyRes.rows[0];
      }
    }

    if (!coord) {
      return res.status(404).json({ error: "no weather coordinate found to query" });
    }

    // 3) find the closest station in daily_weather_readings_staging to this coord
    let station = null;

    // Prefer spatial nearest using geom if available
    try {
      const coordGeo = coord.geom_point ? JSON.stringify(coord.geom_point) : null;
      const stationSql = `
        SELECT station, latitude, longitude, geom
        FROM daily_weather_readings_staging
        WHERE geom IS NOT NULL
        ORDER BY geom <-> (
          CASE WHEN $1 IS NOT NULL THEN ST_GeomFromGeoJSON($1) ELSE ST_SetSRID(ST_MakePoint($2::double precision, $3::double precision), 4326) END
        )
        LIMIT 1;
      `;
      const stationRes = await pool.query(stationSql, [coordGeo, coord.longitude, coord.latitude]);
      if (stationRes.rows && stationRes.rows.length) station = stationRes.rows[0];
    } catch (err) {
      // ignore and fallback
      console.warn("Spatial station lookup failed:", err && err.message ? err.message : err);
      station = null;
    }

    if (!station) {
      const tol = 0.001;
      const lat = coord.latitude;
      const lon = coord.longitude;
      const tolSql = `
        SELECT station, latitude, longitude
        FROM daily_weather_readings_staging
        WHERE latitude BETWEEN $1 AND $2
          AND longitude BETWEEN $3 AND $4
        LIMIT 1;
      `;
      const tolRes = await pool.query(tolSql, [lat - tol, lat + tol, lon - tol, lon + tol]);
      if (tolRes.rows && tolRes.rows.length) station = tolRes.rows[0];
    }

    if (!station) {
      const fallbackRes = await pool.query(
        `SELECT station, latitude, longitude FROM daily_weather_readings_staging LIMIT 1;`
      );
      if (fallbackRes.rows && fallbackRes.rows.length) station = fallbackRes.rows[0];
    }

    if (!station || !station.station) {
      return res.status(404).json({ error: "no matching station found in daily readings" });
    }

    // 4) Query daily readings for that station in the desired date range (inclusive)
    const readingsSql = `
      SELECT date::text AS date, temp, dewp
      FROM daily_weather_readings_staging
      WHERE station = $1
        AND date BETWEEN $2::date AND $3::date
      ORDER BY date ASC;
    `;
    const readingsRes = await pool.query(readingsSql, [station.station, rangeStart, rangeEnd]);
    const series = (readingsRes.rows || []).map((r) => ({
      date: String(r.date),
      temp: r.temp === null ? null : Number(r.temp),
      dewp: r.dewp === null ? null : Number(r.dewp),
    }));

    return res.json({
      fireId: fire.id,
      start_date: String(fire.start_date),
      end_date: String(fire.end_date),
      range_start: String(rangeStart),
      range_end: String(rangeEnd),
      station: {
        station: station.station,
        latitude: station.latitude,
        longitude: station.longitude,
      },
      series,
    });
  } catch (err) {
    console.error("GET /api/fires/weather/:idOrKey error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: err.message || "server error" });
  }
});

export default router;
