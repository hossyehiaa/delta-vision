/*
 * POST /api/runs — save a run snapshot (Bearer auth)
 *   { algorithm, scheme, season, year, mode, aoiName, aoiGeo, samplePoints, params, results }
 * GET  /api/runs — list the caller's runs (id, algorithm, season, mode, aoiName, createdAt; last 50)
 */
"use strict";
const crypto = require("crypto");
const { getPool, initSchema, json, readBody, authUser } = require("./_db");

const RUN_FIELDS = ["algorithm", "scheme", "season", "mode", "aoiName", "aoiGeo", "samplePoints", "params", "results"];

function guardRun(b) {
  if (!b || typeof b !== "object") return "BAD_JSON";
  if (!b.aoiGeo || b.aoiGeo.type !== "FeatureCollection" || !Array.isArray(b.aoiGeo.features)) return "BAD_AOI";
  if (!b.algorithm || !b.season) return "MISSING";
  if (!b.results || typeof b.results !== "object") return "BAD_RESULTS";
  const blob = JSON.stringify(b);
  if (blob.length > 3_500_000) return "TOO_LARGE";
  return null;
}

module.exports = async function (req, res) {
  try {
    const uid = authUser(req);
    if (!uid) return json(res, { ok: false, error: "AUTH" }, 401);
    const db = getPool();
    await initSchema();

    if (req.method === "GET") {
      const r = await db.query(
        "SELECT id, algorithm, scheme, season, year, mode, aoi_name, created_at FROM runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
        [uid]
      );
      return json(res, { ok: true, runs: r.rows.map(row) });
    }

    const b = readBody(req);
    const bad = guardRun(b);
    if (bad) return json(res, { ok: false, error: bad }, 400);

    const id = crypto.randomBytes(8).toString("hex");
    await db.query(
      "INSERT INTO runs (id, user_id, algorithm, scheme, season, year, mode, aoi_name, aoi_geo, sample_points, params, results) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [id, uid, String(b.algorithm).slice(0, 40), b.scheme === "crops" ? "crops" : "general",
       String(b.season).slice(0, 16), b.year ? parseInt(b.year, 10) || null : null,
       b.mode === "live" ? "live" : "preview",
       String(b.aoiName || "").slice(0, 120), JSON.stringify(b.aoiGeo),
       b.samplePoints ? JSON.stringify(b.samplePoints) : null,
       b.params ? JSON.stringify(b.params) : null, JSON.stringify(b.results)]
    );
    return json(res, { ok: true, id: id }, 201);
  } catch (e) {
    return json(res, { ok: false, error: "SERVER" }, 500);
  }
};

function row(r) {
  return {
    id: r.id, algorithm: r.algorithm, scheme: r.scheme || "general", season: r.season, year: r.year, mode: r.mode,
    aoiName: r.aoi_name, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || "")
  };
}
