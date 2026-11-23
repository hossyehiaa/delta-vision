#!/usr/bin/env node
/*
 * gee_unit.test.js — the ported Earth Engine pipeline's pure pieces + demo-mode
 * endpoint behaviour. No GEE key needed: everything here either avoids ee
 * calls entirely or asserts the graceful "not configured" paths.
 * Run from the repo root after `bash scripts/build_gee.sh`:
 *   node test/gee_unit.test.js
 */
"use strict";
const assert = require("assert");
const path = require("path");

const E = require(path.resolve("engine/_gee_engine.js"));
const geeHealth = require(path.resolve("api/gee/health.js"));
const geeRun = require(path.resolve("api/gee/run.js"));
const geeScene = require(path.resolve("api/gee/scene.js"));
const geeNdvi = require(path.resolve("api/gee/ndvi-point.js"));

let pass = 0, fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fails.push(name); console.log("  FAIL " + name + (extra ? "  → " + JSON.stringify(extra).slice(0, 220) : "")); }
}
function mkreq(method, body) { return { method, headers: { "content-type": "application/json" }, body: body || {} }; }
function mkres() {
  const r = { statusCode: 0, headers: {}, body: "" };
  r.end = (b) => { r.body = b || ""; };
  return r;
}
function unwrap(r) { try { return JSON.parse(r.body); } catch (e) { return {}; } }

(async () => {
  console.log("== engine constants (ported from Basira)");
  ok(E.CLASSES.length === 12, "12 land-cover classes", E.CLASSES.length);
  ok(E.CLASSES.map((c) => c.id).join(",") === "1,2,3,4,5,6,7,8,9,10,11,12", "class ids 1..12");
  ok(E.SIG_FEATURES.length === 9 && E.SIG_SCALES.length === 9, "9 signature features + scales");
  for (const season of ["winter", "summer"]) {
    ok(Object.keys(E.SIGNATURES[season]).length === 12, "signatures: 12 classes in " + season);
    ok(Object.values(E.SIGNATURES[season]).every((v) => v.length === 9), "every signature has 9 values (" + season + ")");
  }
  ok(E.ACTIVE_SIGNATURE_CLASSES.winter.length === 9 && !E.ACTIVE_SIGNATURE_CLASSES.winter.includes(2),
    "winter crop calendar excludes off-season maize");
  ok(E.SUPERVISED_KEYS.length === 9 && E.RUNNABLE_KEYS.length === 11, "9 supervised + 11 runnable algorithms");

  console.log("== period resolution");
  ok(JSON.stringify(E.resolvePeriod({ season: "winter", year: 2025 })) === JSON.stringify({ start: "2024-11-01", end: "2025-04-30" }), "winter 2025 → Nov–Apr");
  ok(JSON.stringify(E.resolvePeriod({ season: "summer", year: 2025 })) === JSON.stringify({ start: "2025-05-01", end: "2025-10-31" }), "summer 2025 → May–Oct");
  ok(JSON.stringify(E.resolvePeriod({ season: "full", year: 2024 })) === JSON.stringify({ start: "2024-01-01", end: "2024-12-31" }), "full year");
  ok(JSON.stringify(E.resolvePeriod({ season: "custom", dateFrom: "2025-01-01", dateTo: "2025-03-31" })) === JSON.stringify({ start: "2025-01-01", end: "2025-03-31" }), "custom range");
  let threw = false;
  try { E.resolvePeriod({ season: "custom", dateFrom: "2025-05-01", dateTo: "2025-01-01" }); } catch (e) { threw = e.code === "bad_date_range"; }
  ok(threw, "reversed custom range → bad_date_range");

  console.log("== signature season picker");
  ok(E.signatureSeason("2024-11-01", "2025-04-30") === "winter", "Nov–Apr → winter");
  ok(E.signatureSeason("2025-05-01", "2025-10-31") === "summer", "May–Oct → summer");
  ok(E.signatureSeason("2025-01-01", "2025-12-31") === "full", "≥300 days → full");

  console.log("== AOI area (single source of truth)");
  const bourjKm2 = E.aoiGeoAreaM2(undefined) / 1e6;
  // the engine's own BORJ_COORDS ring (Basira's simplification) — the frontend's
  // slightly-coarser data.js ring (595.73) is what live runs receive via aoiGeo
  ok(bourjKm2 > 596.5 && bourjKm2 < 597.5, "Borj El Arab ≈ 597 km² (engine ring)", bourjKm2);
  const box = { type: "Polygon", coordinates: [[[29.7, 30.85], [29.7, 30.9], [29.8, 30.9], [29.8, 30.85], [29.7, 30.85]]] };
  const boxKm2 = E.aoiGeoAreaM2(box) / 1e6;
  ok(boxKm2 > 50 && boxKm2 < 60, "0.1°×0.05° box ≈ 55 km²", boxKm2);

  console.log("== MLP hybrid (deterministic, pure JS)");
  // three well-separated classes over 6 features → the network must nail them
  const rows = [];
  for (let i = 0; i < 60; i++) {
    rows.push({ classId: 1, x: [0.8 + Math.random() * 0.1, 0.1, 0.2, 0.5, 0.1, 0.9] });
    rows.push({ classId: 4, x: [0.1, 0.85 + Math.random() * 0.1, 0.3, 0.2, 0.9, 0.15] });
    rows.push({ classId: 12, x: [0.05, 0.05, 0.9, 0.1, 0.2, 0.1] });
  }
  const shuffled = rows.slice().sort(() => Math.random() - 0.5);
  const train = shuffled.slice(0, 150), val = shuffled.slice(150);
  const model = E.mlpTrain(train, ["f1", "f2", "f3", "f4", "f5", "f6"], { hidden: 10, epochs: 300 });
  ok(model.w1.length === 10 && model.classIds.join(",") === "1,4,12", "model shape + sorted class ids");
  ok([model.mean, model.std, model.w1.flat(), model.w2.flat(), model.b1, model.b2]
    .every((arr) => arr.every((v) => Number.isFinite(v))), "all weights finite");
  const cm = E.mlpConfusion(model, val);
  ok(cm.oa > 0.9, "validation OA > 0.9 on separable data", cm.oa);
  ok(cm.rows.flat().reduce((s, v) => s + v, 0) === val.length, "confusion counts sum to n");
  const det = E.mlpTrain(train, ["f1", "f2", "f3", "f4", "f5", "f6"], { hidden: 10, epochs: 300 });
  ok(JSON.stringify(det.w1) === JSON.stringify(model.w1), "training is deterministic (same seed)");

  console.log("== GEEError shape");
  const ge = new E.GEEError("no_images");
  ok(ge instanceof Error && ge.code === "no_images", "GEEError carries its code");

  console.log("== demo-mode endpoints (no GEE key in the test env)");
  if (!E.isGEEConfigured()) {
    let res = await geeHealth(mkreq("GET"), mkres());
    ok(res.statusCode === 200 && unwrap(res).mode === "demo" && unwrap(res).ok === false,
      "health → demo mode", unwrap(res));
    res = await geeRun(mkreq("POST", { algorithm: "rf", season: "winter" }), mkres());
    ok(res.statusCode === 503 && unwrap(res).error === "gee_not_configured", "run → 503 gee_not_configured", unwrap(res));
    res = await geeScene(mkreq("POST", { layer: "truecolor" }), mkres());
    ok(res.statusCode === 503 && unwrap(res).error === "gee_not_configured", "scene → 503", unwrap(res));
    res = await geeNdvi(mkreq("POST", { lon: 29.7, lat: 30.88 }), mkres());
    ok(res.statusCode === 503 && unwrap(res).error === "gee_not_configured", "ndvi-point → 503", unwrap(res));
    res = await geeRun(mkreq("POST", { kind: "compare", season: "winter" }), mkres());
    ok(res.statusCode === 503, "compare → 503 too", res.statusCode);
  } else {
    ok(false, "GEE key present in test env — demo-mode checks skipped (unset it for this suite)", null);
  }

  console.log("== run.js body normalization (frontend params bundle)");
  const norm = require(path.resolve("api/gee/run.js"));
  // call with the Delta Vision frontend shape and confirm it reaches the engine
  // layer as a RunInput (we cannot run it without a key; assert the 503 path
  // keeps the friendly code and never a crash)
  const r2 = await norm(mkreq("POST", {
    kind: "run", algorithm: "rf", season: "summer", year: 2024,
    cloudMax: 40, params: { rfTrees: 200, knnK: 7 },
    samplePoints: [{ classId: 1, lon: 29.7, lat: 30.88 }],
    aoiGeo: box, aoiName: "QA box",
  }), mkres());
  ok(r2.statusCode === 503 && unwrap(r2).error === "gee_not_configured",
    "frontend-shaped payload normalizes without crashing", unwrap(r2));

  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed");
  if (fails.length) { console.log("FAILED:", fails); process.exit(1); }
})().catch((e) => { console.error("SUITE ERROR", e); process.exit(1); });
