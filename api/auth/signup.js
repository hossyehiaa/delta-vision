/*
 * POST /api/auth/signup — { name, email, password, org } → { ok, user, token }
 * Also creates the shared demo account on first call (idempotent, no credentials leak:
 * the demo credentials are printed on the login card client-side anyway).
 */
"use strict";
const crypto = require("crypto");
const { getPool, initSchema, json, readBody, validateSignup, publicUser, newToken } = require("../_db");

async function create(db, v) {
  const id = crypto.randomBytes(8).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPw(v.password, salt);
  const q = "INSERT INTO users (id, email, name, org, pw_salt, pw_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *";
  const r = await db.query(q, [id, v.email, v.name, v.org, salt, hash]);
  return r.rows[0];
}
function hashPw(pw, salt) {
  return crypto.scryptSync(String(pw), String(salt), 64).toString("hex");
}

module.exports = async function (req, res) {
  try {
    const db = getPool();
    await initSchema();
    const b = readBody(req);
    const v = validateSignup(b);
    if (!v.ok) return json(res, { ok: false, error: "INVALID", errors: v.errors }, 400);

    const exists = await db.query("SELECT 1 FROM users WHERE email = $1", [v.email]);
    if (exists.rowCount) return json(res, { ok: false, error: "EMAIL_TAKEN", errors: { email: "EMAIL_TAKEN" } }, 409);

    const u = await create(db, v);
    return json(res, { ok: true, user: publicUser(u), token: newToken(u.id) }, 201);
  } catch (e) {
    if (String(e.code || "").startsWith("23") || /duplicate key/i.test(String(e.message || ""))) {
      return json(res, { ok: false, error: "EMAIL_TAKEN", errors: { email: "EMAIL_TAKEN" } }, 409);
    }
    return json(res, { ok: false, error: "SERVER" }, 500);
  }
};
