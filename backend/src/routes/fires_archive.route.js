// src/routes/fires_archive.route.js
import express from "express";
import pool from "../db/db_index.js";

const router = express.Router();

/**
 * GET /api/fires_archive/top-states
 *
 * Returns an array of top states by count from the fires_archive table:
 * [
 *   { state: "California", count: 123 },
 *   { state: "Texas", count: 98 },
 *   ...
 * ]
 *
 * Query params:
 *  - limit (optional) integer, default 10
 *  - min_date (optional) YYYY-MM-DD to filter acq_date >= min_date
 *
 * Keeps SQL injection safe by using parameterized queries.
 */
router.get("/top-states", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const params = [];
    let whereClause = "";

    if (req.query.min_date) {
      params.push(req.query.min_date);
      whereClause = `WHERE acq_date >= $1`;
    }

    // We use state_name column (per schema). Exclude null/empty names.
    // Count rows grouped by state_name and return top by count desc.
    const sql =
      whereClause.length > 0
        ? `SELECT state_name AS state, COUNT(*)::int AS count
           FROM fires_archive
           ${whereClause}
           AND state_name IS NOT NULL AND state_name <> ''
           GROUP BY state_name
           ORDER BY count DESC
           LIMIT $${params.length + 1};`
        : `SELECT state_name AS state, COUNT(*)::int AS count
           FROM fires_archive
           WHERE state_name IS NOT NULL AND state_name <> ''
           GROUP BY state_name
           ORDER BY count DESC
           LIMIT $1;`;

    params.push(limit);

    const { rows } = await pool.query(sql, params);

    // Normalize response shape (ensure state string and count number)
    const out = rows.map((r) => ({
      state: r.state,
      count: Number(r.count || 0),
    }));

    res.json(out);
  } catch (err) {
    console.error("GET /api/fires_archive/top-states error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

export default router;
