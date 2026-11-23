/* GET /api/runs/:id — one run snapshot; DELETE — remove it (Bearer auth, owner only) */
"use strict";
const { getPool, initSchema, json, authUser } = require("../_db");

module.exports = async function (req, res) {
  try {
    const uid = authUser(req);
    if (!uid) return json({ ok: false, error: "AUTH" }, 401);
    const id = String((req.query && req.query.id) || "").replace(/[^a-f0-9]/gi, "");
    if (!id || id.length < 8) return json({ ok: false, error: "NOT_FOUND" }, 404);

    const db = getPool();
    await initSchema();

    if (req.method === "DELETE") {
      const r = await db.query("DELETE FROM runs WHERE id = $1 AND user_id = $2 RETURNING id", [id, uid]);
      if (!r.rowCount) return json({ ok: false, error: "NOT_FOUND" }, 404);
      return json({ ok: true });
    }

    const r = await db.query("SELECT * FROM runs WHERE id = $1 AND user_id = $2", [id, uid]);
    const row = r.rows[0];
    if (!row) return json({ ok: false, error: "NOT_FOUND" }, 404);
    return json({
      ok: true,
      run: {
        id: row.id, algorithm: row.algorithm, season: row.season, year: row.year, mode: row.mode,
        aoiName: row.aoi_name, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ""),
        aoiGeo: row.aoi_geo, samplePoints: row.sample_points, params: row.params, results: row.results
      }
    });
  } catch (e) {
    return json({ ok: false, error: "SERVER" }, 500);
  }
};
