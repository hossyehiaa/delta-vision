/* POST /api/gee/export-png — the publication classified map, rendered by a
 * single synchronous Earth Engine thumbnail request (no client-side tile
 * storm, no 429 rate limiting). Same run params as /api/gee/run; answers
 * image/png. The client composites title/legend/caption over it and upscales
 * to >= 2000 px with nearest-neighbour. */
"use strict";
const E = require("../../engine/_gee_engine");
const { json, readBody } = require("../_db");

module.exports = async function (req, res) {
  if (req.method !== "POST") return json(res, { error: "METHOD" }, 405);
  if (!E.isGEEConfigured()) return json(res, { error: "gee_not_configured" }, 503);
  try {
    const body = await readBody(req);
    const p = (body && typeof body.params === "object" && body.params) || {};
    const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
    const input = {
      kind: "run",
      scheme: body.scheme === "crops" ? "crops" : "general",
      algorithm: body.algorithm,
      season: typeof body.season === "string" && body.season ? body.season : "winter",
      year: body.year != null ? num(body.year, undefined) : undefined,
      dateFrom: body.dateFrom || undefined,
      dateTo: body.dateTo || undefined,
      cloudMax: num(body.cloudMax != null ? body.cloudMax : p.cloudMax, 60),
      rfTrees: num(body.rfTrees != null ? body.rfTrees : p.rfTrees, 100),
      kClusters: num(body.kClusters != null ? body.kClusters : p.kClusters, 8),
      knnK: num(body.knnK != null ? body.knnK : p.knnK, 5),
      samplePoints: Array.isArray(body.samplePoints) ? body.samplePoints : [],
      aoiGeo: body.aoiGeo && (body.aoiGeo.type === "Polygon" || body.aoiGeo.type === "MultiPolygon") ? body.aoiGeo : undefined,
      aoiName: body.aoiName ? String(body.aoiName) : undefined,
      thumbDim: 1400,
    };
    if (!input.algorithm) return json(res, { error: "unknown_algorithm" }, 400);
    const { thumbUrl } = await E.renderThumbUrl(input);
    const png = await fetch(thumbUrl);
    if (!png.ok) return json(res, { error: "thumb_failed", status: png.status }, 502);
    const buf = Buffer.from(await png.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": buf.length,
      "Cache-Control": "no-store",
    });
    res.end(buf);
  } catch (e) {
    const code = e && e.code ? e.code : "BACKEND";
    json(res, { error: code, message: String(e && e.message || e).slice(0, 200) }, 500);
  }
};
