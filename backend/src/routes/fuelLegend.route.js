// backend/routes/fuelLegend.route.js
import express from "express";

const router = express.Router();

/**
 * Returns a small JSON legend for FBFM fuel codes.
 * Update colors/labels to match your authoritative legend.
 *
 * Example response:
 * {
 *   "1": { "label": "Short Grass", "color": "#f7fcf5" },
 *   "2": { "label": "Tall Grass", "color": "#e5f5e0" },
 *    ...
 * }
 */
router.get("/cog/fuel-legend", (req, res) => {
  // Minimal canonical legend. Replace with authoritative values later.
  const legend = {
    "1": { label: "Short Grass", color: "#f7fcb9" },
    "2": { label: "Timber (Grass & Understory)", color: "#addd8e" },
    "3": { label: "Chaparral", color: "#78c679" },
    "4": { label: "Shrubland", color: "#31a354" },
    "5": { label: "Ponderosa Pine", color: "#006837" },
    "6": { label: "Sagebrush", color: "#a1d99b" },
    "7": { label: "Mixed Conifer", color: "#66c2a4" },
    "8": { label: "Brush", color: "#41ae76" },
    "9": { label: "Oak Woodland", color: "#238b45" },
    "10": { label: "Sparse Vegetation", color: "#006d2c" },
    // add more as appropriate...
  };

  res.json(legend);
});

export default router;
