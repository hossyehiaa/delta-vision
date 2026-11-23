/* GET /api/auth/me — Bearer token → { ok, user } */
"use strict";
const { getPool, json, authUser, publicUser } = require("../_db");

module.exports = async function (req, res) {
  try {
    const uid = authUser(req);
    if (!uid) return json({ ok: false, error: "AUTH" }, 401);
    const r = await getPool().query("SELECT * FROM users WHERE id = $1", [uid]);
    if (!r.rows[0]) return json({ ok: false, error: "AUTH" }, 401);
    return json({ ok: true, user: publicUser(r.rows[0]) });
  } catch (e) {
    return json({ ok: false, error: "SERVER" }, 500);
  }
};
