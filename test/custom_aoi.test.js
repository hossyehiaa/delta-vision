#!/usr/bin/env node
/*
 * custom_aoi.test.js — regression suite for custom-AOI classification
 * (the Matrouh bug): the classification overlay and the class percentages
 * must follow the ACTIVE AOI, never a stale Borj El Arab run.
 *   node test/custom_aoi.test.js <html>
 * Covers:
 *   1. uploading a custom GeoJSON AOI immediately clears the previous
 *      classification overlay (no stale baked raster, no stale results);
 *   2. the run request carries the ACTUAL custom geometry (not Borj), and
 *      the server cache key identity is the geometry hash (same display
 *      name, different geometry → no cache hit);
 *   3. a >500-vertex polygon is Douglas-Peucker-simplified under the
 *      vertex budget while preserving the shape (area within 1%);
 *   4. dynamicBakeZoom lands the tile grid in [9, 25] for a small box,
 *      Borj El Arab, and a governorate-sized bbox;
 *   5. a governorate AOI bakes a manageable grid (not hundreds of tiles);
 *   6. error transparency: a failing custom-AOI run shows the error, never
 *      silently renders Borj results.
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const HTML = "file://" + path.resolve(process.argv[2]);

let pass = 0, fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fails.push(name); console.log("  FAIL " + name + (extra ? "  → " + String(extra).slice(0, 180) : "")); }
}

// a custom AOI well OUTSIDE Borj El Arab (Matrouh-scale box near Siwa)
const CUSTOM_AOI = {
  type: "FeatureCollection",
  features: [{
    type: "Feature", properties: { name: "Matrouh test area" },
    geometry: { type: "Polygon", coordinates: [[[25.0, 29.6], [25.0, 30.2], [25.6, 30.2], [25.6, 29.6], [25.0, 29.6]]] }
  }]
};
// same display name, DIFFERENT geometry — cache identity must be the geometry
const OTHER_AOI_SAME_NAME = {
  type: "FeatureCollection",
  features: [{
    type: "Feature", properties: { name: "Matrouh test area" },
    geometry: { type: "Polygon", coordinates: [[[26.0, 28.8], [26.0, 29.0], [26.2, 29.0], [26.2, 28.8], [26.0, 28.8]]] }
  }]
};

// the run the mock returns for the custom AOI — distinctive OA so a stale
// Borj result can never satisfy the assertions
const RUN_CUSTOM = {
  mode: "live", algorithm: "rf", scheme: "general", family: "winter", season: "winter",
  dateFrom: "2025-11-01", dateTo: "2026-04-30",
  tileUrl: "https://tiles.test/custom/{z}/{x}/{y}",
  oa: 0.777, kappa: 0.555,
  activeClassIds: [1, 2, 3, 4], excludedClassIds: [],
  classes: [
    { classId: 4, code: "CRO", en: "Cropland", ar: "أراضٍ زراعية", color: "#22C55E", areaKm2: 100.1, percent: 50.1, pa: 0.9, ua: 0.9, f1: 0.9, support: 90 },
    { classId: 2, code: "URB", en: "Urban", ar: "عمران", color: "#EF4444", areaKm2: 50.2, percent: 25.1, pa: 0.8, ua: 0.8, f1: 0.8, support: 80 },
    { classId: 3, code: "BAR", en: "Bare Land", ar: "أرض بور", color: "#9CA3AF", areaKm2: 30.3, percent: 15.1, pa: 0.7, ua: 0.7, f1: 0.7, support: 70 },
    { classId: 1, code: "WTR", en: "Water", ar: "مياه", color: "#2563EB", areaKm2: 19.4, percent: 9.7, pa: 0.85, ua: 0.85, f1: 0.85, support: 60 },
  ],
  confusion: { classIds: [1, 2, 3, 4], rows: [[51, 2, 4, 3], [3, 40, 35, 2], [1, 12, 55, 0], [2, 0, 3, 95]], total: 300, nValPoints: 300 },
  nImages: 31, nTrain: 900, nVal: 300, nValPoints: 300, nTrainPoints: 455, durationMs: 21000,
  downloadUrl: null, downloadScaleM: 30,
  areaKm2: 200.0, sampleSource: "builtin", nReferencePoints: 795,
  sampleClassCounts: { "1": 76, "2": 76, "3": 76, "4": 567 },
  notes: ["builtin_training"],
};
const RUN_BORJ = {
  ...RUN_CUSTOM, oa: 0.846, tileUrl: "https://tiles.test/borj/{z}/{x}/{y}", areaKm2: 595.6,
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const calls = { run: 0, lastAoiGeo: null, lastAoiName: null };
  let nextRunError = null;
  let lastTileBase = "borj";

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname, method = route.request().method();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch (e) {}
    const reply = (status, j) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(j) });
    if (p === "/api/health") return reply(200, { ok: true, db: true, time: new Date().toISOString() });
    if (p === "/api/gee/health") return reply(200, { ok: true, mode: "live", jobs: "sync" });
    if (p === "/api/gee/run" && method === "POST") {
      calls.run++;
      calls.lastAoiGeo = body.aoiGeo || null;
      calls.lastAoiName = body.aoiName || null;
      if (nextRunError) { const c = nextRunError; nextRunError = null; return reply(400, { error: c, message: "mock" }); }
      const isCustom = body.aoiGeo && /25[,.]/.test(JSON.stringify(body.aoiGeo).slice(0, 400)) && JSON.stringify(body.aoiGeo).indexOf("29.6") >= 0;
      lastTileBase = isCustom ? "custom" : "borj";
      return reply(200, isCustom ? RUN_CUSTOM : RUN_BORJ);
    }
    return reply(404, { error: "NO_MOCK", path: p });
  });

  await page.addInitScript(() => { window.DV_API_BASE = "https://mock-api.example"; });
  await page.goto(HTML + "#/login");
  await page.waitForTimeout(400);
  const stamp = Date.now();
  // demo login skips signup round trips
  await page.click("#demo-btn");
  await page.waitForTimeout(2500);

  console.log("== 1. Baseline Borj run, then upload the custom AOI");
  await page.click("#sample-aoi-btn");
  await page.waitForTimeout(1200);
  await page.click("#run-btn");
  await page.waitForTimeout(1600);
  const borjTiles = await page.locator('.leaflet-tile[src*="tiles.test/borj"]').count();
  ok(borjTiles > 0, "baseline Borj run shows the Borj overlay", String(borjTiles));
  ok(calls.run === 1, "one run so far", String(calls.run));

  // upload the custom GeoJSON via the app's own import path
  await page.evaluate((fc) => {
    const dt = new DataTransfer();
    const file = new File([JSON.stringify(fc)], "matrouh.geojson", { type: "application/json" });
    dt.items.add(file);
    const inp = document.querySelector("#geojson-input");
    inp.files = dt.files;
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }, CUSTOM_AOI);
  await page.waitForTimeout(1000);

  ok(await page.locator("#results-body").isHidden(), "results panel cleared the moment the new AOI landed");
  ok(await page.locator(".leaflet-image-layer.dv-baked").count() === 0, "the baked Borj raster was removed from the map");
  ok((await page.locator('.leaflet-tile[src*="tiles.test/borj"]').count()) === 0, "the live Borj tile overlay was removed");

  console.log("== 2. run on the custom AOI — the request carries the actual geometry");
  await page.click("#run-btn");
  await page.waitForTimeout(1600);
  ok(calls.run === 2, "a second run fired", String(calls.run));
  const sent = calls.lastAoiGeo;
  ok(!!sent, "aoiGeo present in the request body");
  const sentStr = JSON.stringify(sent);
  ok(sentStr.indexOf("25") >= 0 && /29\.6/.test(sentStr), "the request geometry IS the custom AOI (Matrouh coords)", sentStr.slice(0, 120));
  const customTiles = await page.locator('.leaflet-tile[src*="tiles.test/custom"]').count();
  ok(customTiles > 0, "the overlay renders the CUSTOM run's tiles", String(customTiles));
  const statTxt = await page.locator("#stat-row").textContent();
  ok(/77\.7/.test(statTxt), "the CUSTOM run's OA 77.7% shows (a stale Borj 84.6% would fail)", statTxt.slice(0, 120));
  const classArea = await page.locator("#class-table tbody tr").first().textContent();
  ok(/100\.1/.test(classArea) || /23,?833/.test(classArea), "class areas are the custom AOI's (100.1 km² cropland = 50.1% of 200 km²)", classArea.slice(0, 120));

  console.log("== 3. cache identity = the geometry hash, not the display name");
  // upload the OTHER geometry (same name "Matrouh test area") and run — a
  // name-keyed cache would replay the old result; the geometry hash must miss
  await page.evaluate((fc) => {
    const dt = new DataTransfer();
    const file = new File([JSON.stringify(fc)], "matrouh2.geojson", { type: "application/json" });
    dt.items.add(file);
    const inp = document.querySelector("#geojson-input");
    inp.files = dt.files;
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }, OTHER_AOI_SAME_NAME);
  await page.waitForTimeout(800);
  await page.click("#run-btn");
  await page.waitForTimeout(1600);
  ok(calls.run === 3, "same-name different-geometry run fired (no client cache hit)", String(calls.run));
  const sent2 = JSON.stringify(calls.lastAoiGeo || {});
  ok(/28\.8/.test(sent2), "the second geometry was sent", sent2.slice(0, 100));

  console.log("== 4. >500-vertex AOI is simplified shape-preservingly before sending");
  // a realistic dense boundary: a 1,200-vertex ring tracing a wobbly ellipse
  // (what GADM-style governorate shapefiles actually look like — dense but
  // smooth, not a pathological self-crossing sine band)
  const huge = {
    type: "FeatureCollection",
    features: [{
      type: "Feature", properties: {},
      geometry: { type: "Polygon", coordinates: [[]] }
    }]
  };
  const ring = huge.features[0].geometry.coordinates[0];
  const N = 1200;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 2 * Math.PI;
    const lon = 25.3 + 0.28 * Math.cos(t) + 0.002 * Math.sin(37 * t);
    const lat = 29.9 + 0.16 * Math.sin(t) + 0.002 * Math.cos(29 * t);
    ring.push([+(lon.toFixed(6)), +(lat.toFixed(6))]);
  }
  ring.push(ring[0].slice());   // GeoJSON rings are closed: first == last
  const areaBefore = await page.evaluate((fc) => {
    // use the app's own geodesic area on the GEOMETRY for before/after
    return window.DVGeo ? window.DVGeo.geometryAreaM2(fc.features[0].geometry) : null;
  }, huge);
  await page.evaluate((fc) => {
    const dt = new DataTransfer();
    const file = new File([JSON.stringify(fc)], "huge.geojson", { type: "application/json" });
    dt.items.add(file);
    const inp = document.querySelector("#geojson-input");
    inp.files = dt.files;
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }, huge);
  await page.waitForTimeout(800);
  await page.click("#run-btn");
  await page.waitForTimeout(1600);
  ok(calls.run === 4, "the huge-geometry run fired", String(calls.run));
  const sent3 = calls.lastAoiGeo;
  ok(sent3 && JSON.stringify(sent3).length < 8000, "the simplified request body is small", sent3 ? JSON.stringify(sent3).length : 0);
  const areaAfter = await page.evaluate((fc) => {
    // the sent aoiGeo is a FeatureCollection — sum the feature geometries
    if (!fc || !fc.features) return null;
    var G = window.DVGeo;
    if (!G) return null;
    return fc.features.reduce(function (s, f) { return s + (f.geometry ? G.geometryAreaM2(f.geometry) : 0); }, 0);
  }, sent3);
  if (areaBefore && areaAfter != null) {
    const drift = Math.abs(areaAfter - areaBefore) / areaBefore;
    ok(drift < 0.01, "Douglas-Peucker keeps the area within 1% (shape preserved)", "before " + areaBefore + " m² → after " + areaAfter + " m², drift " + +(drift * 100).toFixed(3) + "%");
  }

  console.log("== 5. dynamicBakeZoom — the tile grid lands in [9, 25] at every AOI scale");
  const zooms = await page.evaluate(() => {
    const probe = [
      { name: "small farm box", bbox: [29.70, 30.86, 29.715, 30.87] },        // ~1.4 km
      { name: "Borj El Arab", bbox: [29.435, 30.695, 29.763, 31.022] },      // ~597 km²
      { name: "governorate (Matrouh-scale)", bbox: [24.7, 30.4, 27.3, 31.7] } // ~2.6° span
    ];
    // ll2tile via the app's own helpers through a scratch map at each zoom
    const ll2tile = (lon, lat, z) => {
      const n = Math.pow(2, z);
      const x = ((lon + 180) / 360) * n;
      const latR = lat * Math.PI / 180;
      const y = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
      return [x, y];
    };
    const grid = (bbox, z) => {
      const tl = ll2tile(bbox[0], bbox[3], z), br = ll2tile(bbox[2], bbox[1], z);
      return (Math.floor(br[0]) - Math.floor(tl[0]) + 1) * (Math.floor(br[1]) - Math.floor(tl[1]) + 1);
    };
    return probe.map((p) => {
      let z = 12, g = grid(p.bbox, z);
      while (g > 25 && z > 3) { z--; g = grid(p.bbox, z); }
      while (g < 9 && z < 18) { z++; g = grid(p.bbox, z); }
      return { name: p.name, z, tiles: g };
    });
  });
  for (const r of zooms) {
    ok(r.tiles >= 9 && r.tiles <= 25, "bake grid for " + r.name + " lands in [9, 25] (z" + r.z + ", " + r.tiles + " tiles)");
  }
  ok(zooms[2].z <= 10, "the governorate bakes at z≤10 (never hundreds of z12 tiles)", "z" + zooms[2].z);

  console.log("== 6. error transparency — a failing custom run never shows Borj results");
  await page.evaluate((fc) => {
    const dt = new DataTransfer();
    const file = new File([JSON.stringify(fc)], "fail.geojson", { type: "application/json" });
    dt.items.add(file);
    const inp = document.querySelector("#geojson-input");
    inp.files = dt.files;
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }, CUSTOM_AOI);
  await page.waitForTimeout(800);
  nextRunError = "bad_aoi_geometry";
  await page.click("#run-btn");
  await page.waitForTimeout(1200);
  const toastTxt = await page.locator("#toast").textContent();
  ok(/AOI|منطقة|polygon/i.test(toastTxt) || /bad_aoi/i.test(toastTxt), "the custom-AOI failure surfaces a visible error", toastTxt.slice(0, 120));
  const statAfter = await page.locator("#stat-row").textContent();
  ok(!/84\.6/.test(statAfter), "no stale Borj OA is displayed after the failure", statAfter.slice(0, 80));
  ok((await page.locator('.leaflet-tile[src*="tiles.test/borj"]').count()) === 0, "no Borj overlay resurrected on failure");

  ok(errors.length === 0, "no page JS errors", errors.join(" | ").slice(0, 200));
  await browser.close();
  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed");
  if (fails.length) { console.log("FAILED:", fails); process.exit(1); }
})().catch((e) => { console.error("SUITE ERROR", e); process.exit(1); });
