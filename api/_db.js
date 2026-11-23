/*
 * Delta Vision — api/_db.js (shared by all serverless functions)
 * Neon Postgres via `pg`. One pool per lambda instance. scrypt password hashing,
 * HMAC-SHA256 session tokens ("uid.exp.hmac"), JSON input guards.
 *
 * Env vars (set in Vercel, never in code):
 *   DATABASE_URL  postgres://… (Neon)
 *   AUTH_SECRET   long random string for token signing
 */
"use strict";
const { Pool } = require("pg");
const crypto = require("crypto");

let pool = null;
function getPool() {
  if (!pool) {
    const cs = process.env.DATABASE_URL;
    if (!cs) throw Object.assign(new Error("DATABASE_URL is not set"), { statusCode: 500 });
    // serverless: one pool per instance; Neon pooler handles the rest
    pool = new Pool({
      connectionString: cs,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: cs.includes("sslmode=") ? { rejectUnauthorized: true } : { rejectUnauthorized: true }
    });
  }
  return pool;
}

// ---------------------------------------------------------------- schema
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  org           TEXT NOT NULL DEFAULT '',
  pw_salt       TEXT NOT NULL,
  pw_hash       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  algorithm     TEXT NOT NULL,
  season        TEXT NOT NULL,
  year          INT,
  mode          TEXT NOT NULL DEFAULT 'preview',
  aoi_name      TEXT NOT NULL DEFAULT '',
  aoi_geo       JSONB NOT NULL,
  sample_points JSONB,
  params        JSONB,
  results       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_user_idx ON runs (user_id, created_at DESC);
`;

async function initSchema() {
  const db = getPool();
  await db.query(SCHEMA);
}

// ---------------------------------------------------------------- password + tokens
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 64).toString("hex");
}
function verifyPassword(password, salt, hash) {
  const got = hashPassword(password, salt);
  const a = Buffer.from(got), b = Buffer.from(String(hash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sign(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET || "dev-secret").update(payload).digest("hex");
}
function newToken(userId) {
  const exp = String(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14); // 14 days
  return userId + "." + exp + "." + sign(userId + "." + exp);
}
function parseToken(raw) {
  const parts = String(raw || "").split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, mac] = parts;
  const expect = sign(uid + "." + exp);
  const a = Buffer.from(mac), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (parseInt(exp, 10) < Math.floor(Date.now() / 1000)) return null;
  return { userId: uid };
}

// ---------------------------------------------------------------- helpers
function send(res, body, status) {
  const payload = JSON.stringify(body);
  const code = status || 200;
  // Vercel Node functions write through res; the returned object is for tests/tools
  if (res && typeof res.end === "function") {
    res.statusCode = code;
    if (res.setHeader) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(payload);
  }
  return { statusCode: code, headers: { "Content-Type": "application/json; charset=utf-8" }, body: payload };
}
const json = (res, body, status) => send(res, body, status);
function readBody(req) {
  // Vercel puts the parsed JSON body in req.body already
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validateSignup(b) {
  const errors = {};
  const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase(), pw = String(b.password || "");
  if (name.length < 2 || name.length > 60) errors.name = "NAME";
  if (!EMAIL_RE.test(email)) errors.email = "EMAIL";
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) errors.password = "PASSWORD";
  return { ok: !Object.keys(errors).length, errors, name, email, password: pw, org: String(b.org || "").trim().slice(0, 80) };
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, org: u.org || "", created: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at || "") };
}
function authUser(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  if (!m) return null;
  const tok = parseToken(m[1]);
  return tok ? tok.userId : null;
}

module.exports = {
  getPool, initSchema, hashPassword, verifyPassword, newToken, parseToken,
  json: send, readBody, validateSignup, publicUser, authUser, EMAIL_RE
};
