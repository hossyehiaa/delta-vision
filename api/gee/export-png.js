/* POST /api/gee/export-png — the publication classified map, rendered by a
 * single synchronous Earth Engine thumbnail request (no client-side tile
 * storm, no 429 rate limiting). Same run params as /api/gee/run; answers
 * image/png. The client composites title/legend/caption over it and upscales
 * to >= 2000 px with nearest-neighbour. */
"use strict";
const E = require("../../engine/_gee_engine");
const { json, readBody } = require("../_db");
const cache = require("../_gee_cache");

/* Byte cache + in-flight dedupe: a completed classification fires a
 * background warm-up for the PNG, so the later "Export" click reads warm
 * bytes (< 1 s) instead of re-running the Earth Engine render (~50 s). */
const PNG_TTL_MS = 10 * 60 * 1000;
const pngCache = new Map();     // key → { at, buf }
const pngInflight = new Map();  // key → Promise<Buffer>
function pngGet(key) {
  const hit = pngCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PNG_TTL_MS) { pngCache.delete(key); return null; }
  return hit.buf;
}
function renderPng(key, input) {
  const cached = pngGet(key);
  if (cached) return Promise.resolve(cached);
  let p = pngInflight.get(key);
  if (p) return p;
  p = E.renderThumbUrl(input)
    .then(({ thumbUrl }) => fetch(thumbUrl))
    .then(async (res) => {
      if (!res.ok) throw Object.assign(new Error("thumb HTTP " + res.status), { code: "thumb_failed" });
      const buf = Buffer.from(await res.arrayBuffer());
      pngCache.set(key, { at: Date.now(), buf });
      while (pngCache.size > 8) pngCache.delete(pngCache.keys().next().value);
      return buf;
    })
    .finally(() => { pngInflight.delete(key); });
  pngInflight.set(key, p);
  return p;
}

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
    const buf = await renderPng(cache.runKey(body), input);
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
