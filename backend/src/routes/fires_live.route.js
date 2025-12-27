// src/routes/fires_live.route.js
import express from 'express';
import pool from '../db/db_index.js'; // adjust path if your pool file is elsewhere

const router = express.Router();

/**
 * GET /api/fires_live
 * Returns all rows from fires_live as a GeoJSON FeatureCollection.
 * This route intentionally ignores query params (you asked: send everything).
 */
router.get('/', async (req, res) => {
  try {
    // Select all relevant columns and produce GeoJSON in SQL for speed.
    // ST_AsGeoJSON returns text; we parse below to attach to features.
    const sql = `
      SELECT
        id,
        unique_hash,
        latitude,
        longitude,
        bright_ti4,
        bright_ti5,
        acq_date,
        acq_time,
        satellite,
        confidence_raw,
        confidence_num,
        frp,
        daynight,
        inserted_at,
        ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) AS geojson
      FROM fires_live
      ORDER BY inserted_at DESC;
    `;

    const { rows } = await pool.query(sql);

    const features = rows.map((r) => ({
      type: 'Feature',
      geometry: r.geojson ? JSON.parse(r.geojson) : null,
      properties: {
        id: r.id,
        unique_hash: r.unique_hash,
        bright_ti4: r.bright_ti4,
        bright_ti5: r.bright_ti5,
        acq_date: r.acq_date,
        acq_time: r.acq_time,
        satellite: r.satellite,
        confidence_raw: r.confidence_raw,
        confidence_num: r.confidence_num,
        frp: r.frp,
        daynight: r.daynight,
        inserted_at: r.inserted_at,
      },
    }));

    res.json({
      type: 'FeatureCollection',
      features,
    });
  } catch (err) {
    console.error('GET /api/fires_live error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

export default router;
