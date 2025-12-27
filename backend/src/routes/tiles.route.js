// backend/routes/tiles.route.js
import express from "express";
import path from "path";
import fs from "fs";

const router = express.Router();

// base directory where pmtiles files are stored
const PMT_DIR = process.env.PATH_TO_PMTILES_DIR
  ? path.resolve(process.env.PATH_TO_PMTILES_DIR)
  : path.resolve("./data/pmtiles"); // default fallback for local dev

// ensure dir exists (warn, but keep server running)
if (!fs.existsSync(PMT_DIR)) {
  console.warn("PMTiles directory does not exist:", PMT_DIR);
}

// GET /api/tiles/pmtiles/:name ...
router.get("/pmtiles/:name", (req, res) => {
  try {
    const rawName = req.params.name;
    if (!/^[a-zA-Z0-9._-]+$/.test(rawName)) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const fileName = rawName.endsWith(".pmtiles") ? rawName : `${rawName}.pmtiles`;
    const filePath = path.resolve(PMT_DIR, fileName);

    if (!filePath.startsWith(PMT_DIR)) {
      // simple check: the resolved path must start with our base dir
      return res.status(400).json({ error: "Invalid file path" });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "PMTiles file not found" });
    }

    res.setHeader("Accept-Ranges", "bytes");

    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("Error serving pmtiles:", err);
        if (!res.headersSent) res.status(500).json({ error: "Failed to serve PMTiles" });
      }
    });
  } catch (err) {
    console.error("pmtiles route error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
