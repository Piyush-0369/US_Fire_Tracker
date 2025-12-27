import pool from "../db/db_index.js";

/** Utility Validators */
const isInteger = (v) => Number.isInteger(Number(v));
const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Get distinct station list
 * Supports optional:
 *  - q        (search in name/station)
 *  - bbox     (minLon,minLat,maxLon,maxLat)
 *  - limit    (default 100)
 *  - offset   (default 0)
 */
export async function queryStations(params = {}) {
  const limit = isInteger(params.limit) ? Math.min(5000, Number(params.limit)) : 100;
  const offset = isInteger(params.offset) ? Math.max(0, Number(params.offset)) : 0;

  const where = [];
  const values = [];
  let idx = 1;

  if (params.q) {
    values.push(`%${params.q}%`);
    where.push(`(name ILIKE $${idx} OR station ILIKE $${idx})`);
    idx++;
  }

  if (params.bbox) {
    const parts = params.bbox.split(",").map((n) => Number(n.trim()));
    if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
      const [minLon, minLat, maxLon, maxLat] = parts;
      values.push(minLon, maxLon, minLat, maxLat);
      where.push(`longitude BETWEEN $${idx} AND $${idx + 1}`);
      where.push(`latitude BETWEEN $${idx + 2} AND $${idx + 3}`);
      idx += 4;
    }
  }

  let sql = `
    SELECT DISTINCT
      station,
      name,
      latitude,
      longitude,
      elevation
    FROM daily_weather_readings_staging
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY station
    LIMIT $${idx} OFFSET $${idx + 1};
  `;
  values.push(limit, offset);

  const { rows } = await pool.query(sql, values);
  return rows;
}

/**
 * Get one station by its code
 */
export async function queryStationById(id) {
  const sql = `
    SELECT DISTINCT
      station,
      name,
      latitude,
      longitude,
      elevation
    FROM daily_weather_readings_staging
    WHERE station = $1
    LIMIT 1;
  `;
  const { rows } = await pool.query(sql, [id]);
  return rows[0] || null;
}

/**
 * Get daily readings for a station
 * Required: stationId
 * Optional: startDate, endDate, limit, offset
 */
export async function queryReadings(params = {}) {
  if (!params.stationId) throw new Error("stationId is required");

  const limit = isInteger(params.limit) ? Math.min(200000, Number(params.limit)) : 1000;
  const offset = isInteger(params.offset) ? Math.max(0, Number(params.offset)) : 0;

  const where = [`station = $1`];
  const values = [params.stationId];
  let idx = 2;

  if (params.startDate) {
    if (!isValidDate(params.startDate)) throw new Error("startDate must be YYYY-MM-DD");
    where.push(`date >= $${idx}`);
    values.push(params.startDate);
    idx++;
  }

  if (params.endDate) {
    if (!isValidDate(params.endDate)) throw new Error("endDate must be YYYY-MM-DD");
    where.push(`date <= $${idx}`);
    values.push(params.endDate);
    idx++;
  }

  const sql = `
    SELECT
      station,
      date,
      temp,
      temp_attributes,
      dewp,
      dewp_attributes,
      slp,
      slp_attributes,
      stp,
      stp_attributes,
      visib,
      visib_attributes,
      wdsp,
      wdsp_attributes,
      mxspd,
      gust,
      max,
      max_attributes,
      min,
      min_attributes,
      prcp,
      prcp_attributes,
      sndp,
      frshtt
    FROM daily_weather_readings_staging
    WHERE ${where.join(" AND ")}
    ORDER BY date ASC
    LIMIT $${idx} OFFSET $${idx + 1};
  `;

  values.push(limit, offset);
  const { rows } = await pool.query(sql, values);
  return rows;
}
