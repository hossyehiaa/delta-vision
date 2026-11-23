/* POST /api/gee/scene — Sentinel-2 scene tiles (true color / NDVI / NDWI).
 * Light & synchronous: { layer, season, year?, dateFrom?, dateTo?, cloudMax? }
 * → { tileUrl, nImages, dateFrom, dateTo, layer }. */
"use strict";
const { json, readBody } = require("../_db");
const E = require("../../engine/_gee_engine");

module.exports = async function (req, res) {
  if (req.method !== "POST") return json(res, { error: "METHOD" }, 405);
  if (!E.isGEEConfigured()) return json(res, { error: "gee_not_configured" }, 503);
  const b = readBody(req);
  const layer = ["truecolor", "ndvi", "ndwi"].includes(b.layer) ? b.layer : "truecolor";
  try {
    const scene = await E.buildScene({
      layer,
      season: b.season || "winter",
      year: b.year ? Number(b.year) : undefined,
      dateFrom: b.dateFrom || undefined,
      dateTo: b.dateTo || undefined,
      cloudMax: b.cloudMax != null ? Number(b.cloudMax) : 60,
    });
    return json(res, scene);
  } catch (e) {
    const code = e instanceof E.GEEError ? e.code : "scene_failed";
    console.error("scene error", code, String((e && e.message) || e).slice(0, 200));
    return json(res, { error: code }, e instanceof E.GEEError ? 400 : 500);
  }
};
