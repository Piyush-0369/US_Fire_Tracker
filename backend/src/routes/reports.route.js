// src/routes/reports.route.js
import express from "express";
import pool from "../db/db_index.js";

const router = express.Router();

/**
 * POST /api/reports
 * Body (JSON):
 * {
 *   title: string,
 *   state?: string,
 *   description: string,
 *   severity?: string,
 *   coordinates?: string   // e.g. "37.8651, -119.5383" (optional)
 * }
 *
 * Returns:
 *  { id: <inserted id>, created_at: <timestamp> }
 */
router.post("/", async (req, res) => {
  try {
    const { title, state, description, severity, coordinates } = req.body || {};

    if (!title || !description) {
      return res.status(400).json({ error: "Missing required fields: title and description" });
    }

    // Attempt to parse coordinates if provided in "lat, lon" format
    let latitude = null;
    let longitude = null;
    let coordinates_text = null;
    if (coordinates && typeof coordinates === "string") {
      coordinates_text = coordinates.trim();
      const parts = coordinates_text.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
          latitude = Number(lat.toFixed(6));
          longitude = Number(lon.toFixed(6));
        }
      }
    }

    const sql = `
      INSERT INTO reports
        (title, state, description, severity, coordinates_text, latitude, longitude, source)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at;
    `;

    const values = [
      title,
      state || null,
      description,
      severity || null,
      coordinates_text,
      latitude,
      longitude,
      "frontend",
    ];

    const { rows } = await pool.query(sql, values);
    const inserted = rows[0];
    res.status(201).json({ id: inserted.id, created_at: inserted.created_at });
  } catch (err) {
    console.error("POST /api/reports error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

export default router;
