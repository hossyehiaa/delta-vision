/* GET /api/health — DB reachable? */
"use strict";
const { getPool, json } = require("./_db");

module.exports = async function (req, res) {
  try {
    const r = await getPool().query("SELECT 1 AS ok");
    return json({ ok: true, db: r.rows.length === 1, time: new Date().toISOString() });
  } catch (e) {
    return json({ ok: false, error: "DB_DOWN" }, 503);
  }
};
