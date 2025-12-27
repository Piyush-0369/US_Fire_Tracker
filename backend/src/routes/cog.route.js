// backend/routes/cog.route.js
import express from "express";
import path from "path";
import fs from "fs";

const router = express.Router();

/**
 * Base directory where COG files reside.
 * Set PATH_TO_COG_DIR in .env (e.g. ./data/cog)
 * Default fallback: ./data/cog
 */
const COG_DIR = process.env.PATH_TO_COG_DIR
  ? path.resolve(process.env.PATH_TO_COG_DIR)
  : path.resolve("./data/cog");

// Ensure directory exists (warn but keep server running).
if (!fs.existsSync(COG_DIR)) {
  console.warn("COG directory not found:", COG_DIR);
}

/**
 * GET /api/cog/:name
 * - :name may be "slope" or "slope.tif"
 * - Serves file COG_DIR/:name(.tif)
 * - Security checks to prevent ../ traversal and invalid characters
 */
router.get("/:name", (req, res) => {
  try {
    const rawName = req.params.name;

    // Allow only filenames with safe characters to avoid XSS/path attacks
    if (!/^[a-zA-Z0-9._-]+$/.test(rawName)) {
      return res.status(400).json({ error: "Invalid filename" });
    }

    const fileName = rawName.toLowerCase().endsWith(".tif") || rawName.toLowerCase().endsWith(".tiff")
      ? rawName
      : `${rawName}.tif`;

    const filePath = path.resolve(COG_DIR, fileName);

    // Security: ensure resolved path is inside COG_DIR
    if (!filePath.startsWith(COG_DIR)) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "COG file not found" });
    }

    // Let Express handle Range headers while making intent explicit
    res.setHeader("Accept-Ranges", "bytes");

    // Use sendFile which supports range requests and streams efficiently
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("Error sending COG:", err);
        // If headers already sent, we can't send json; just end.
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to serve COG" });
        } else {
          res.end();
        }
      }
    });
  } catch (err) {
    console.error("COG route error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
