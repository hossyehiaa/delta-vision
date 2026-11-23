/* POST /api/gee/run — real Earth Engine classification (the Basira pipeline).
 *
 * Body (Delta Vision frontend shape; Basira-style top-level params also accepted):
 *   { kind: "run" | "compare", algorithm, season, year?, dateFrom?, dateTo?,
 *     cloudMax?, params?: { rfTrees, kClusters, knnK, mlpHidden, mlpEpochs },
 *     samplePoints?: [{ classId, lon, lat }], aoiGeo?, aoiName? }
 *
 * kind "run"     → answers with the RunResult itself (tileUrl, oa, kappa, classes…)
 * kind "compare" → { kind: "compare", summary: [{algorithm, oa, kappa}], best: RunResult }
 *
 * Without GEE_PRIVATE_KEY_JSON / GEE_KEY_FILE the endpoint answers 503
 * { error: "gee_not_configured" } and the frontend stays in preview mode. */
"use strict";
const { json, readBody } = require("../_db");
const E = require("../../engine/_gee_engine");

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/** Accept the frontend's { params: { … } } bundle and/or Basira-style flat keys. */
function normalize(body) {
  const p = (body && typeof body.params === "object" && body.params) || {};
  const aoiGeo = body.aoiGeo;
  return {
    kind: body.kind === "compare" ? "compare" : "run",
    algorithm: body.algorithm,
    season: body.season || "winter",
    year: body.year ? num(body.year, undefined) : undefined,
    dateFrom: body.dateFrom || undefined,
    dateTo: body.dateTo || undefined,
    cloudMax: num(body.cloudMax != null ? body.cloudMax : p.cloudMax, 60),
    rfTrees: num(body.rfTrees != null ? body.rfTrees : p.rfTrees, 100),
    kClusters: num(body.kClusters != null ? body.kClusters : p.kClusters, 8),
    knnK: num(body.knnK != null ? body.knnK : p.knnK, 5),
    mlpHidden: body.mlpHidden != null || p.mlpHidden != null
      ? num(body.mlpHidden != null ? body.mlpHidden : p.mlpHidden, undefined) : undefined,
    mlpEpochs: body.mlpEpochs != null || p.mlpEpochs != null
      ? num(body.mlpEpochs != null ? body.mlpEpochs : p.mlpEpochs, undefined) : undefined,
    samplePoints: Array.isArray(body.samplePoints) ? body.samplePoints : [],
    aoiGeo: aoiGeo && (aoiGeo.type === "Polygon" || aoiGeo.type === "MultiPolygon") ? aoiGeo : undefined,
    aoiName: body.aoiName ? String(body.aoiName) : undefined,
  };
}

module.exports = async function (req, res) {
  if (req.method !== "POST") return json(res, { error: "METHOD" }, 405);
  if (!E.isGEEConfigured()) return json(res, { error: "gee_not_configured" }, 503);
  let body;
  try {
    body = normalize(readBody(req));
  } catch (e) {
    return json(res, { error: "BAD_JSON" }, 400);
  }
  try {
    if (body.kind === "compare") {
      const { summary, best } = await E.compareAll(body);
      return json(res, { kind: "compare", summary, best });
    }
    if (!body.algorithm) return json(res, { error: "unknown_algorithm" }, 400);
    const result = await E.runClassification({ ...body, kind: "run" });
    return json(res, result);
  } catch (e) {
    const code = e instanceof E.GEEError ? e.code : "run_failed";
    console.error("gee run error", code, String((e && e.message) || e).slice(0, 400));
    return json(res, { error: code, message: String((e && e.message) || e || "").slice(0, 300) },
      e instanceof E.GEEError ? 400 : 500);
  }
};
