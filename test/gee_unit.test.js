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

  console.log("== built-in reference points (professor's dedicated Train/Validation split)");
  const pts = E.referencePoints("crops");
  ok(pts.length === 795, "795 reference points (455 train + 340 validation)", pts.length);
  ok(pts.every((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat) && p.classId >= 1 && p.classId <= 11), "every point is well-formed");
  ok(pts.every((p) => (p.role === "validation") === (p.split === 0.75)), "the role decides the side: validation ↔ 0.75, train ↔ 0.25");
  const info = E.TRAINING_SET_INFO;
  ok(info.nTrain === 455 && info.nVal === 340 && info.nOverlap === 20, "TRAINING_SET_INFO: 455 train / 340 val / 20 overlaps removed", info);
  const byClass = {};
  pts.forEach((p) => { byClass[p.classId] = (byClass[p.classId] || 0) + 1; });
  ok(byClass[1] === 83 && byClass[2] === 87 && byClass[11] === 76, "class counts match the CSVs (Wheat 83, Maize 87, Water 76)", byClass);
  const gen = E.referencePoints("general");
  const genCounts = {};
  gen.forEach((p) => { genCounts[p.classId] = (genCounts[p.classId] || 0) + 1; });
  ok(genCounts[4] === 567 && genCounts[3] === 76 && genCounts[2] === 76 && genCounts[1] === 76, "land-cover roll-up: 567 cropland / 76 / 76 / 76", genCounts);
  ok(gen.every((p) => p.split === 0.25 || p.split === 0.75), "splits are exactly 0.25 / 0.75");
  const train = pts.filter((p) => p.split === 0.25);
  const val = pts.filter((p) => p.split === 0.75);
  ok(train.length === 455 && val.length === 340, "the professor's split is exact: 455 train / 340 validation", train.length + "/" + val.length);
  // leakage: no coordinate may appear on both sides
  const key = (p) => p.lon.toFixed(6) + "," + p.lat.toFixed(6);
  const trainKeys = new Set(train.map(key));
  ok(val.every((p) => !trainKeys.has(key(p))), "zero coordinate overlaps between train and validation (the 20 duplicates were removed from the validation side)");
  // strict seasonal filtering applies to BOTH sides
  const winter = new Set(E.activeClassIds("crops", "winter")), summer = new Set(E.activeClassIds("crops", "summer"));
  const wTrain = train.filter((p) => winter.has(p.classId)), wVal = val.filter((p) => winter.has(p.classId));
  const sTrain = train.filter((p) => summer.has(p.classId)), sVal = val.filter((p) => summer.has(p.classId));
  ok(wTrain.length === 370 && wVal.length === 279, "winter: 370 training / 279 validation", wTrain.length + "/" + wVal.length);
  ok(sTrain.length === 315 && sVal.length === 247, "summer: 315 training / 247 validation", sTrain.length + "/" + sVal.length);
  // the grouped 70/30 split still exists for manually drawn points
  const manual = E.assignSplit(Array.from({ length: 60 }, (_, i) => ({ classId: 1 + (i % 2), lon: 29.4 + i * 0.001, lat: 30.7 })));
  ok(manual.length === 60 && manual.every((p) => p.split === 0.25 || p.split === 0.75), "manual points keep the grouped 70/30 split");

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

  console.log("== custom AOI never silently falls back to Borj El Arab");
  // a malformed submitted AOI must fail LOUDLY (GEEError bad_aoi_geometry),
  // never classify Borj El Arab in its place
  const malformedCases = [
    { type: "Polygon", coordinates: [[[0, 0], [1, 1]]] },                        // < 4 points
    { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, "x"], [1, 0], [0, 0]]] }, // non-finite coord
    { type: "MultiPolygon", coordinates: [] },                                     // no rings
    { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]], [[0.2, 0.2]]] }, // bad hole
  ];
  for (const bad of malformedCases) {
    let code = "NO_THROW";
    try { E.makeAoi(bad); } catch (e) { code = e instanceof E.GEEError ? e.code : "OTHER"; }
    ok(code === "bad_aoi_geometry", "malformed AOI → GEEError bad_aoi_geometry (" + bad.type + ")", code);
  }
  // a VALID custom AOI must NOT be replaced: without EE auth the ee.Geometry
  // constructor itself throws an auth error — proving the geometry reached
  // Earth Engine instead of being swapped for the built-in ring
  let hitEE = false;
  try { E.makeAoi({ type: "Polygon", coordinates: [[[25.0, 31.2], [25.0, 31.4], [25.4, 31.4], [25.4, 31.2], [25.0, 31.2]]] }); }
  catch (e) { hitEE = /authentication credential/i.test(String(e && e.message || e)); }
  ok(hitEE, "valid custom AOI reaches ee.Geometry (no silent Borj swap)");

  console.log("== area/tif scale ladders scale with the AOI (governorate-safe)");
  // the ladders are keyed by aoiGeoAreaM2. Matrouh governorate is ~166,160
  // km²; a 2.6°×1.3° box at 31° latitude is ~35,770 km² — enough to prove
  // the engine measures big custom AOIs correctly (way past the 5,000 km²
  // memory tier, far above Borj El Arab's 595.7 km²)
  const matrouh = { type: "Polygon", coordinates: [[[24.7, 30.4], [24.7, 31.7], [27.3, 31.7], [27.3, 30.4], [24.7, 30.4]]] };
  const mk2 = E.aoiGeoAreaM2(matrouh) / 1e6;
  ok(mk2 > 35000 && mk2 < 36200, "Matrouh-scale box measures ≈ 35,770 km²", mk2);
  ok(E.aoiGeoAreaM2(undefined) / 1e6 < 600, "Borj stays on the fine ladder (< 600 km²)");

  console.log("== MLP hybrid (deterministic, pure JS)");
  // three well-separated classes over 6 features → the network must nail them
  const rows = [];
  for (let i = 0; i < 60; i++) {
    rows.push({ classId: 1, x: [0.8 + Math.random() * 0.1, 0.1, 0.2, 0.5, 0.1, 0.9] });
    rows.push({ classId: 4, x: [0.1, 0.85 + Math.random() * 0.1, 0.3, 0.2, 0.9, 0.15] });
    rows.push({ classId: 12, x: [0.05, 0.05, 0.9, 0.1, 0.2, 0.1] });
  }
  const shuffled = rows.slice().sort(() => Math.random() - 0.5);
  const trainRows = shuffled.slice(0, 150), mval = shuffled.slice(150);
  const model = E.mlpTrain(trainRows, ["f1", "f2", "f3", "f4", "f5", "f6"], { hidden: 10, epochs: 300 });
  ok(model.w1.length === 10 && model.classIds.join(",") === "1,4,12", "model shape + sorted class ids");
  ok([model.mean, model.std, model.w1.flat(), model.w2.flat(), model.b1, model.b2]
    .every((arr) => arr.every((v) => Number.isFinite(v))), "all weights finite");
  const cm = E.mlpConfusion(model, mval);
  ok(cm.oa > 0.9, "validation OA > 0.9 on separable data", cm.oa);
  ok(cm.rows.flat().reduce((s, v) => s + v, 0) === mval.length, "confusion counts sum to n");
  const det = E.mlpTrain(trainRows, ["f1", "f2", "f3", "f4", "f5", "f6"], { hidden: 10, epochs: 300 });
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
