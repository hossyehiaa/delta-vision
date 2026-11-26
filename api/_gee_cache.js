/* api/_gee_cache.js — server-side run-result cache (in-memory + Neon).
 *
 * Caches completed /api/gee/run results keyed by the canonical request
 * (aoiGeo, scheme, season/period, cloud, params, samplePoints, algorithm):
 * identical repeat requests — a user switching back to an already-computed
 * algorithm/preset, or a second device hitting the same combination — answer
 * from the cache instead of re-running the Earth Engine graph. Short TTL
 * (10 min) keeps tile mapIds fresh; `fresh: true` in the request bypasses
 * it entirely (the client's "Re-run fresh" button).
 *
 * Every operation is best-effort: a Neon hiccup never fails a run. */
"use strict";
const crypto = require("crypto");

const TTL_MS = 10 * 60 * 1000;      // 10 minutes
const MEMORY_MAX = 16;              // LRU bound per warm lambda
const memory = new Map();           // key → { at, result }

/** canonical key of a normalized run body (see run.js normalize) */
function runKey(body) {
  const parts = {
    v: 5,   // feature-stack revision: v3 S1-SAR + S2-optical fusion — old cached rows miss once
    scheme: body.scheme,
    algorithm: body.algorithm,
    season: body.season,
    year: body.year != null ? Number(body.year) : null,
    dateFrom: body.dateFrom || null,
    dateTo: body.dateTo || null,
    cloudMax: body.cloudMax,
    rfTrees: body.rfTrees,
    kClusters: body.kClusters,
    knnK: body.knnK,
    mlpHidden: body.mlpHidden == null ? null : Number(body.mlpHidden),
    mlpEpochs: body.mlpEpochs == null ? null : Number(body.mlpEpochs),
    aoiGeo: body.aoiGeo || null,
    aoiName: body.aoiName || null,
    samplePoints: (body.samplePoints || []).map((p) => [Number(p.classId), +p.lon.toFixed(6), +p.lat.toFixed(6)]).sort((a, b) => (a[1] - b[1]) || (a[2] - b[2])),
  };
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function memGet(key) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { memory.delete(key); return null; }
  // LRU refresh
  memory.delete(key); memory.set(key, hit);
  return hit.result;
}
function memPut(key, result) {
  memory.set(key, { at: Date.now(), result });
  while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
}

async function ensureTable(pool) {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS gee_run_cache (" +
    "run_key text PRIMARY KEY, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())"
  );
}

/** lookup: memory → Neon (fresh rows only). Returns the result or null. */
async function get(pool, key) {
  const mem = memGet(key);
  if (mem) return mem;
  if (!pool) return null;
  try {
    const r = await pool.query(
      "SELECT result FROM gee_run_cache WHERE run_key = $1 AND created_at > now() - interval '10 minutes'",
      [key]
    );
    if (r.rows && r.rows[0]) {
      const result = r.rows[0].result;
      memPut(key, result);
      return result;
    }
  } catch (e) { /* table may not exist yet or Neon hiccup — best-effort */ }
  return null;
}

/** store: memory immediately, Neon fire-and-forget. */
function put(pool, key, result) {
  memPut(key, result);
  if (!pool) return;
  Promise.resolve().then(async () => {
    try {
      await ensureTable(pool);
      await pool.query(
        "INSERT INTO gee_run_cache (run_key, result, created_at) VALUES ($1, $2, now()) " +
        "ON CONFLICT (run_key) DO UPDATE SET result = EXCLUDED.result, created_at = now()",
        [key, JSON.stringify(result)]
      );
    } catch (e) { /* best-effort */ }
  }).catch(() => {});
}

module.exports = { runKey, get, put };
