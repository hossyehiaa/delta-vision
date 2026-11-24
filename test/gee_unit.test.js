#!/usr/bin/env node
/*
 * gee_unit.test.js — the Earth Engine pipeline's pure pieces + demo-mode
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
  console.log("== engine class schemes (from scheme.json)");
  ok(E.classesOf("crops").length === 11, "11 crop-type classes", E.classesOf("crops").length);
  ok(E.classesOf("crops").map((c) => c.id).join(",") === "1,2,3,4,5,6,7,8,9,10,11", "crop class ids 1..11");
  ok(E.classesOf("general").length === 4, "4 land-cover classes");
  ok(E.schemeOf("crops") === "crops" && E.schemeOf(undefined) === "general" && E.schemeOf("bogus") === "general", "scheme defaults to Level 1");
  ok(E.classesOf("crops").filter((c) => c.family === "winter").length === 3, "3 strictly-winter crop classes (Wheat, Potato, Sugar Beet)");
  ok(E.classesOf("crops").filter((c) => c.family === "summer").length === 2, "2 strictly-summer crop classes (Maize, Grapes)");
  ok(E.classesOf("crops").filter((c) => c.family === "both" || c.family === "all").length === 6, "6 all-season classes (VEG, MED, CIT, Bare, Urban, Water)");
  ok(E.mapClassId(1, "general") === 4 && E.mapClassId(9, "general") === 3 && E.mapClassId(11, "general") === 1 && E.mapClassId(1, "crops") === 1,
    "crop → land-cover mapping (wheat→cropland, bare→3, water→1)");

  console.log("== strict seasonal filtering (the professor's rule)");
  ok(E.activeClassIds("crops", "winter").join(",") === "1,3,4,5,6,7,9,10,11", "winter: 9 classes without Maize (2) and Grapes (8)", E.activeClassIds("crops", "winter"));
  ok(E.activeClassIds("crops", "summer").join(",") === "2,5,6,7,8,9,10,11", "summer: 8 classes without Wheat (1), Potato (3), Sugar Beet (4)");
  ok(E.activeClassIds("crops", "full").length === 11, "full family keeps all 11 (never sent with the crops scheme)");
  ok(E.activeClassIds("general", "winter").length === 4, "land cover: all 4 classes every season");

  console.log("== built-in reference points (Validation_Samples_CSV.csv)");
  const pts = E.referencePoints("crops");
  ok(pts.length === 360, "360 reference points", pts.length);
  ok(pts.every((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat) && p.classId >= 1 && p.classId <= 11), "every point is well-formed");
  const byClass = {};
  pts.forEach((p) => { byClass[p.classId] = (byClass[p.classId] || 0) + 1; });
  ok(byClass[1] === 36 && byClass[2] === 42 && byClass[11] === 36, "class counts match the CSV (Wheat 36, Maize 42, Water 36)", byClass);
  const gen = E.referencePoints("general");
  const genCounts = {};
  gen.forEach((p) => { genCounts[p.classId] = (genCounts[p.classId] || 0) + 1; });
  ok(genCounts[4] === 252 && genCounts[3] === 36 && genCounts[2] === 36 && genCounts[1] === 36, "land-cover roll-up: 252 cropland / 36 / 36 / 36", genCounts);
  ok(gen.every((p) => p.split === 0.25 || p.split === 0.75), "splits are exactly 0.25 / 0.75");
  const val = pts.filter((p) => p.split === 0.75);
  ok(val.length >= 100 && val.length <= 120, "≈30 % validation points (" + val.length + " of 360)", val.length);
  // per-class balance of the split
  const perClass = {};
  pts.forEach((p) => {
    perClass[p.classId] = perClass[p.classId] || { train: 0, val: 0 };
    perClass[p.classId][p.split === 0.75 ? "val" : "train"]++;
  });
  ok(Object.values(perClass).every((c) => c.val / (c.val + c.train) >= 0.25 && c.val / (c.val + c.train) <= 0.36), "the split keeps ~30 % per class", perClass);

  console.log("== period resolution (season labelled by the year it ends)");
  ok(JSON.stringify(E.resolvePeriod({ season: "winter", year: 2026 })) === JSON.stringify({ start: "2025-11-01", end: "2026-04-30", season: "winter", family: "winter" }), "winter 2026 → Nov–Apr");
  ok(JSON.stringify(E.resolvePeriod({ season: "early_winter", year: 2026 })) === JSON.stringify({ start: "2025-10-01", end: "2026-01-31", season: "early_winter", family: "winter" }), "early winter 2026 → Oct–Jan");
  ok(JSON.stringify(E.resolvePeriod({ season: "late_winter", year: 2026 })) === JSON.stringify({ start: "2026-02-01", end: "2026-05-31", season: "late_winter", family: "winter" }), "late winter 2026 → Feb–May");
  ok(JSON.stringify(E.resolvePeriod({ season: "summer", year: 2026 })) === JSON.stringify({ start: "2026-05-01", end: "2026-10-31", season: "summer", family: "summer" }), "summer 2026 → May–Oct");
  ok(JSON.stringify(E.resolvePeriod({ season: "summer_peak", year: 2026 })) === JSON.stringify({ start: "2026-06-01", end: "2026-09-30", season: "summer_peak", family: "summer" }), "summer peak 2026 → Jun–Sep");
  ok(JSON.stringify(E.resolvePeriod({ season: "full", year: 2024 })) === JSON.stringify({ start: "2024-01-01", end: "2024-12-31", season: "full", family: "full" }), "full year");
  ok(JSON.stringify(E.resolvePeriod({ season: "custom", dateFrom: "2026-01-01", dateTo: "2026-03-31" })) === JSON.stringify({ start: "2026-01-01", end: "2026-03-31", season: "custom", family: "winter" }), "custom range detects winter");
  let threw = false;
  try { E.resolvePeriod({ season: "custom", dateFrom: "2025-05-01", dateTo: "2025-01-01" }); } catch (e) { threw = e.code === "bad_date_range"; }
  ok(threw, "reversed custom range → bad_date_range");

  console.log("== season family detection (custom ranges)");
  ok(E.detectSeasonFamily("2026-01-15", "2026-03-20") === "winter", "Jan–Mar → winter");
  ok(E.detectSeasonFamily("2026-06-01", "2026-09-30") === "summer", "Jun–Sep → summer");
  ok(E.detectSeasonFamily("2026-03-10", "2026-08-20") === "summer", "Mar–Aug dominated by summer months → summer");
  ok(E.runFamily("crops", "full", "2025-11-01", "2026-04-30") === "winter", "crops + full-year family collapses to the dominant family");
  ok(E.runFamily("general", "full", "2025-11-01", "2026-04-30") === "full", "land cover keeps the full family");

  console.log("== instant-scan reference statistics");
  ok(E.SIG_FEATURES.length === 9 && E.SIG_SCALES.length === 9, "9 signature features + scales");
  ok(E.SIG_FEATURES[0] === "NDVI_p10" && E.SIG_FEATURES[2] === "NDVI_mean", "feature order = scheme.json");
  ok(E.SUPERVISED_KEYS.length === 9 && E.RUNNABLE_KEYS.length === 11, "9 supervised + 11 runnable algorithms");

  console.log("== AOI area (single source of truth)");
  const bourjKm2 = E.aoiGeoAreaM2(undefined) / 1e6;
  // the engine's own BORJ_COORDS ring — the frontend's slightly-coarser data.js
  // ring (595.73) is what live runs receive via aoiGeo
  ok(bourjKm2 > 595.2 && bourjKm2 < 596.0, "Borj El Arab ≈ 595.7 km² (authalic, matches PostGIS + client)", bourjKm2);
  const box = { type: "Polygon", coordinates: [[[29.7, 30.85], [29.7, 30.9], [29.8, 30.9], [29.8, 30.85], [29.7, 30.85]]] };
  const boxKm2 = E.aoiGeoAreaM2(box) / 1e6;
  ok(boxKm2 > 50 && boxKm2 < 60, "0.1°×0.05° box ≈ 55 km²", boxKm2);
  ok(E.sampleDistanceKm(undefined) < 40, "the built-in AOI is near the sample set (" + E.sampleDistanceKm(undefined).toFixed(1) + " km)");
  ok(E.sampleDistanceKm({ type: "Polygon", coordinates: [[[32.0, 30.85], [32.0, 30.9], [32.1, 30.9], [32.1, 30.85], [32.0, 30.85]]] }) > 100, "an AOI 2° away counts as far");

  console.log("== MLP hybrid (deterministic, pure JS)");
  // three well-separated classes over 6 features → the network must nail them
  const rows = [];
  for (let i = 0; i < 60; i++) {
    rows.push({ classId: 1, x: [0.8 + Math.random() * 0.1, 0.1, 0.2, 0.5, 0.1, 0.9] });
    rows.push({ classId: 4, x: [0.1, 0.85 + Math.random() * 0.1, 0.3, 0.2, 0.9, 0.15] });
    rows.push({ classId: 12, x: [0.05, 0.05, 0.9, 0.1, 0.2, 0.1] });
  }
  const shuffled = rows.slice().sort(() => Math.random() - 0.5);
  const train = shuffled.slice(0, 150), mval = shuffled.slice(150);
  const model = E.mlpTrain(train, ["f1", "f2", "f3", "f4", "f5", "f6"], { hidden: 10, epochs: 300 });
  ok(model.w1.length === 10 && model.classIds.join(",") === "1,4,12", "model shape + sorted class ids");
  ok([model.mean, model.std, model.w1.flat(), model.w2.flat(), model.b1, model.b2]
    .every((arr) => arr.every((v) => Number.isFinite(v))), "all weights finite");
  const cm = E.mlpConfusion(model, mval);
  ok(cm.oa > 0.9, "validation OA > 0.9 on separable data", cm.oa);
  ok(cm.rows.flat().reduce((s, v) => s + v, 0) === mval.length, "confusion counts sum to n");
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
    res = await geeRun(mkreq("POST", { algorithm: "rf", season: "winter", scheme: "crops" }), mkres());
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
    kind: "run", algorithm: "rf", scheme: "crops", season: "early_winter", year: 2026,
    cloudMax: 40, params: { rfTrees: 200, knnK: 7 },
    samplePoints: [{ classId: 1, lon: 29.7, lat: 30.88 }],
    aoiGeo: box, aoiName: "QA box",
  }), mkres());
  ok(r2.statusCode === 503 && unwrap(r2).error === "gee_not_configured",
    "frontend-shaped payload (crops + early_winter) normalizes without crashing", unwrap(r2));

  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed");
  if (fails.length) { console.log("FAILED:", fails); process.exit(1); }
})().catch((e) => { console.error("SUITE ERROR", e); process.exit(1); });
