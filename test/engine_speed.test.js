#!/usr/bin/env node
/* test_engine_speed.js — live engine check for this turn's changes:
 * training-table cache (miss → put, hit → reuse), parallel round trips,
 * thumbUrl, GeoTIFF auto-scale + downloadScaleM, confusion meta.
 * Usage: GEE_KEY_FILE=… node test_engine_speed.js
 */
"use strict";
const E = require("../engine/_gee_engine.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function one(label, body) {
  const t0 = Date.now();
  const r = await E.runClassification(body);
  const oa = r.oa == null ? "—" : (r.oa * 100).toFixed(1) + "%";
  console.log(`${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s engine=${(r.durationMs / 1000).toFixed(1)}s OA=${oa} k=${r.kappa == null ? "—" : r.kappa.toFixed(3)} cls=${r.classes.length} pts=${r.nReferencePoints}`);
  console.log(`  downloadUrl: ${r.downloadUrl ? "yes" : "MISSING"} scale=${r.downloadScaleM}m | cm: ${r.confusion ? "total=" + r.confusion.total + " nValPoints=" + r.confusion.nValPoints + " rows=" + r.confusion.rows.length : "—"} | nValPoints=${r.nValPoints}`);
  const sum = r.classes.reduce((s, c) => s + c.areaKm2, 0);
  console.log(`  areaKm2=${r.areaKm2} | class sum=${+sum.toFixed(2)} | percent sum=${+r.classes.reduce((s, c) => s + c.percent, 0).toFixed(1)}`);
  return r;
}

(async () => {
  // protocol 1: L1 winter 2025 RF (the same as the live timing protocols)
  await one("P1 L1 winter 2025 RF [cache miss]", { kind: "run", scheme: "general", algorithm: "rf", season: "winter", year: 2025 });
  await one("P1 L1 winter 2025 RF [cache hit]", { kind: "run", scheme: "general", algorithm: "rf", season: "winter", year: 2025 });
  await sleep(2000);
  // protocol 2: L2 summer 2025 RF
  await one("P2 L2 summer 2025 RF [miss]", { kind: "run", scheme: "crops", algorithm: "rf", season: "summer", year: 2025 });
  await one("P2 L2 summer 2025 RF [hit]", { kind: "run", scheme: "crops", algorithm: "rf", season: "summer", year: 2025 });
  // spot-check: signature still carries a thumb (no training) and confusion meta absent
  const sig = await one("signature instant", { kind: "run", scheme: "general", algorithm: "signature", season: "winter", year: 2025 });
  console.log("sig notes:", sig.notes && sig.notes.join(","));
  process.exit(0);
})().catch((e) => { console.error("FAILED", e.code, String(e.message).slice(0, 300)); process.exit(1); });
