// scripts/import_viirs.mjs
// ESM Node importer for VIIRS CSV -> PostgreSQL (fires_live table).
// Usage: node scripts/import_viirs.mjs
//
// Requirements:
//  - Node 18+ (for built-in fetch). If using older Node, install node-fetch and adjust imports.
//  - npm install pg csv-parse dotenv
//  - .env must contain DB_USER, DB_NAME, DB_PASS (DB_HOST optional, default 'localhost'), DB_PORT optional default 5432

import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';
import { parse } from 'csv-parse/sync';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ---------- CONFIG ----------
const VIIRS_URL =
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv';

const BATCH_SIZE = 800; // safe batch size for INSERT ON CONFLICT

// ---------- ENV / DB VALIDATION ----------
const {
  DB_USER,
  DB_NAME,
  DB_PASS,
  DB_PORT,
  DB_HOST = 'localhost',
} = process.env;

function exitWithError(msg) {
  console.error('ERROR:', msg);
  process.exit(1);
}

if (!DB_USER) exitWithError('DB_USER environment variable missing in .env');
if (!DB_NAME) exitWithError('DB_NAME environment variable missing in .env');
// require password to be explicitly set (avoid undefined / non-string error)
if (DB_PASS === undefined || DB_PASS === null || String(DB_PASS).trim() === '') {
  exitWithError('DB_PASS environment variable is missing or empty in .env — set your DB password as a string');
}

const dbPort = DB_PORT ? Number(DB_PORT) : 5432;
if (Number.isNaN(dbPort) || dbPort <= 0) exitWithError('DB_PORT must be a valid port number if provided');

const pgConfig = {
  user: String(DB_USER),
  host: String(DB_HOST),
  database: String(DB_NAME),
  password: String(DB_PASS), // now guaranteed to be a string
  port: dbPort,
  // optional: increase statement timeout or keep default
};

// ---------- Helper fns ----------
function acceptableConfidence(confRaw) {
  if (confRaw === null || confRaw === undefined) return false;
  const s = String(confRaw).trim().toLowerCase();
  if (s === '') return false;
  const num = Number(s);
  if (!Number.isNaN(num)) return num >= 80;
  if (s.includes('high')) return true;
  return false;
}
function normalizeConfidence(confRaw) {
  if (confRaw === null || confRaw === undefined) return null;
  const s = String(confRaw).trim().toLowerCase();
  const num = Number(s);
  if (!Number.isNaN(num)) return Math.round(num);
  if (s.includes('high')) return 90;
  if (s.includes('nominal')) return 60;
  if (s.includes('low')) return 25;
  return null;
}
function computeHash(lat, lon, date, time, satellite) {
  const h = crypto.createHash('sha1');
  h.update(String(lat ?? ''));
  h.update('|');
  h.update(String(lon ?? ''));
  h.update('|');
  h.update(String(date ?? ''));
  h.update('|');
  h.update(String(time ?? ''));
  h.update('|');
  h.update(String(satellite ?? ''));
  return h.digest('hex');
}

async function downloadCsv(url) {
  console.log('Downloading CSV from:', url);
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch not available. Please run on Node 18+ or install node-fetch and modify the script.');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download CSV: ${res.status} ${res.statusText}`);
  const text = await res.text();
  return text;
}

// batch upsert implementation
async function upsertBatch(client, rows) {
  if (!rows || rows.length === 0) return;
  const columns = [
    'unique_hash',
    'latitude',
    'longitude',
    'bright_ti4',
    'bright_ti5',
    'scan',
    'track',
    'acq_date',
    'acq_time',
    'satellite',
    'confidence_raw',
    'confidence_num',
    'version',
    'frp',
    'daynight',
    'inserted_at',
    'source'
  ];

  const values = [];
  const paramsFragments = [];
  let idx = 1;
  for (const r of rows) {
    const vals = [
      r.unique_hash,
      r.latitude,
      r.longitude,
      r.bright_ti4,
      r.bright_ti5,
      r.scan,
      r.track,
      r.acq_date,
      r.acq_time,
      r.satellite,
      r.confidence_raw,
      r.confidence_num,
      r.version,
      r.frp,
      r.daynight,
      new Date(),
      'VIIRS'
    ];
    paramsFragments.push(`(${vals.map(() => `$${idx++}`).join(',')})`);
    values.push(...vals);
  }

  const sql = `
    INSERT INTO fires_live (${columns.join(',')})
    VALUES ${paramsFragments.join(',')}
    ON CONFLICT (unique_hash)
    DO UPDATE SET
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      bright_ti4 = EXCLUDED.bright_ti4,
      bright_ti5 = EXCLUDED.bright_ti5,
      scan = EXCLUDED.scan,
      track = EXCLUDED.track,
      acq_date = EXCLUDED.acq_date,
      acq_time = EXCLUDED.acq_time,
      satellite = EXCLUDED.satellite,
      confidence_raw = EXCLUDED.confidence_raw,
      confidence_num = EXCLUDED.confidence_num,
      version = EXCLUDED.version,
      frp = EXCLUDED.frp,
      daynight = EXCLUDED.daynight,
      inserted_at = EXCLUDED.inserted_at,
      source = EXCLUDED.source
  `;

  try {
    const res = await client.query(sql, values);
    console.log(`Upserted ${res.rowCount} rows (batch).`);
  } catch (err) {
    console.error('Upsert batch failed:', err.message || err);
    // don't throw — continue with other batches
  }
}

// ---------- MAIN ----------
async function main() {
  console.log('Importer starting — connecting to Postgres...');

  const client = new Client(pgConfig);
  await client.connect();

  try {
    const csvText = await downloadCsv(VIIRS_URL);

    // parse CSV text synchronously into records
    // csv columns: latitude,longitute,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`CSV parsed: ${records.length} records total.`);

    const toInsert = [];
    let processed = 0;
    let kept = 0;

    for (const record of records) {
      processed++;
      const lat = parseFloat(record.latitude);
      const lon = parseFloat(record.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

      const confRaw = record.confidence;
      if (!acceptableConfidence(confRaw)) continue;

      const confNum = normalizeConfidence(confRaw);
      const acq_date = record.acq_date || null;
      const acq_time = record.acq_time || null;
      const unique_hash = computeHash(lat, lon, acq_date, acq_time, record.satellite);

      toInsert.push({
        unique_hash,
        latitude: lat,
        longitude: lon,
        bright_ti4: record.bright_ti4 ? Number(record.bright_ti4) : null,
        bright_ti5: record.bright_ti5 ? Number(record.bright_ti5) : null,
        scan: record.scan ? Number(record.scan) : null,
        track: record.track ? Number(record.track) : null,
        acq_date,
        acq_time,
        satellite: record.satellite || null,
        confidence_raw: record.confidence || null,
        confidence_num: confNum,
        version: record.version || null,
        frp: record.frp ? Number(record.frp) : null,
        daynight: record.daynight || null,
      });

      kept++;

      if (toInsert.length >= BATCH_SIZE) {
        const batch = toInsert.splice(0, toInsert.length);
        await upsertBatch(client, batch);
      }
    }

    // final batch
    if (toInsert.length) await upsertBatch(client, toInsert);

    console.log(`Done. Processed ${processed} rows; kept ${kept} high-confidence rows (attempted upserts).`);
  } finally {
    await client.end();
  }
}

// run and handle errors
main().catch((err) => {
  console.error('Import failed:', err && err.message ? err.message : err);
  process.exit(1);
});
