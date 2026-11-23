/* POST /api/auth/login — { email, password } → { ok, user, token } */
"use strict";
const { getPool, initSchema, json, readBody, publicUser, newToken } = require("../_db");

module.exports = async function (req, res) {
  try {
    const db = getPool();
    await initSchema();
    const b = readBody(req);
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    if (!email || !password) return json({ ok: false, error: "BAD_CREDENTIALS" }, 401);

    const r = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const u = r.rows[0];
    if (!u) return json({ ok: false, error: "BAD_CREDENTIALS" }, 401);

    const crypto = require("crypto");
    const got = crypto.scryptSync(password, u.pw_salt, 64).toString("hex");
    const a = Buffer.from(got), b2 = Buffer.from(u.pw_hash);
    const ok = a.length === b2.length && crypto.timingSafeEqual(a, b2);
    if (!ok) return json({ ok: false, error: "BAD_CREDENTIALS" }, 401);

    return json({ ok: true, user: publicUser(u), token: newToken(u.id) });
  } catch (e) {
    return json({ ok: false, error: "SERVER" }, 500);
  }
};
