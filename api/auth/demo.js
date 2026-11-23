/*
 * POST /api/auth/demo — { email:"demo@deltavision.app", password:"delta2026" } are the
 * public demo credentials printed on the login card. This endpoint logs the visitor into
 * that shared demo account, creating it on first use (it starts empty, like any account).
 */
"use strict";
const crypto = require("crypto");
const { getPool, initSchema, json, publicUser, newToken, hashPassword, verifyPassword, EMAIL_RE } = require("../_db");

const DEMO = { email: "demo@deltavision.app", password: "delta2026", name: "Demo", org: "" };

async function ensureDemo(db) {
  const q = "INSERT INTO users (id, email, name, org, pw_salt, pw_hash) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING RETURNING *";
  const id = crypto.randomBytes(8).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const r = await db.query(q, [id, DEMO.email, DEMO.name, DEMO.org, salt, hashPassword(DEMO.password, salt)]);
  return r.rows[0];
}

module.exports = async function (req, res) {
  try {
    const db = getPool();
    await initSchema();
    let u = await ensureDemo(db);
    if (!u) {
      const r = await db.query("SELECT * FROM users WHERE email = $1", [DEMO.email]);
      u = r.rows[0];
    }
    if (!u) return json(res, { ok: false, error: "SERVER" }, 500);
    return json(res, { ok: true, user: publicUser(u), token: newToken(u.id) });
  } catch (e) {
    return json(res, { ok: false, error: "SERVER" }, 500);
  }
};
