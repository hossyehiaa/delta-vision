/* POST /api/gee/ndvi-point — NDVI time series at a clicked map point.
 * { lon, lat, season, year?, dateFrom?, dateTo?, cloudMax? } → { series: [{ d, v }] }. */
"use strict";
const { json, readBody } = require("../_db");
const E = require("../../engine/_gee_engine");

module.exports = async function (req, res) {
  if (req.method !== "POST") return json(res, { error: "METHOD" }, 405);
  if (!E.isGEEConfigured()) return json(res, { error: "gee_not_configured" }, 503);
  const b = readBody(req);
  const lon = Number(b.lon), lat = Number(b.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return json(res, { error: "bad_point" }, 400);
  }
  try {
    const r = await E.ndviPointSeries({
      lon, lat,
      season: b.season || "winter",
      year: b.year ? Number(b.year) : undefined,
      dateFrom: b.dateFrom || undefined,
      dateTo: b.dateTo || undefined,
      cloudMax: b.cloudMax != null ? Number(b.cloudMax) : 60,
    });
    return json(res, r);
  } catch (e) {
    const code = e instanceof E.GEEError ? e.code : "ndvi_failed";
    console.error("ndvi-point error", code, String((e && e.message) || e).slice(0, 200));
    return json(res, { error: code }, e instanceof E.GEEError ? 400 : 500);
  }
};
