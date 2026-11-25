#!/usr/bin/env node
/*
 * live_gee.test.js — E2E of the LIVE Earth Engine path with the /api/gee/* endpoints
 * mocked at the network layer (no GEE key needed). Proves the whole wiring:
 * boot probe → badge → level switcher → real run (tiles + OA/Kappa + PA/UA/F1 +
 * confusion + DSS + GeoTIFF + honest accuracy insight) → scene layers → NDVI
 * point popup → accuracy league → error mapping.
 *   node live_gee.test.js <html>
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

// Level 1 — land-cover run (the default): 4 classes
const RUN_L1 = {
  mode: "live", algorithm: "rf", scheme: "general", family: "winter", season: "winter",
  dateFrom: "2025-11-01", dateTo: "2026-04-30",
  tileUrl: "https://tiles.test/run/{z}/{x}/{y}",
  oa: 0.846, kappa: 0.665,
  activeClassIds: [1, 2, 3, 4], excludedClassIds: [],
  classes: [
    { classId: 4, code: "CRO", en: "Cropland", ar: "أراضٍ زراعية", color: "#22C55E", areaKm2: 366.1, percent: 61.4, pa: 0.94, ua: 0.907, f1: 0.907, support: 270 },
    { classId: 2, code: "URB", en: "Urban", ar: "عمران", color: "#EF4444", areaKm2: 104.8, percent: 17.6, pa: 0.725, ua: 0.673, f1: 0.673, support: 108 },
    { classId: 3, code: "BAR", en: "Bare Land", ar: "أرض بور", color: "#9CA3AF", areaKm2: 78.1, percent: 13.1, pa: 0.433, ua: 0.538, f1: 0.538, support: 108 },
    { classId: 1, code: "WTR", en: "Water", ar: "مياه", color: "#2563EB", areaKm2: 47.0, percent: 7.9, pa: 0.89, ua: 0.92, f1: 0.9, support: 108 },
  ],
  confusion: { classIds: [1, 2, 3, 4], rows: [[96, 2, 4, 6], [3, 78, 27, 0], [1, 12, 47, 48], [2, 0, 3, 103]], total: 432, nValPoints: 340 },
  nImages: 41, nTrain: 3185, nVal: 2380, nValPoints: 340, nTrainPoints: 455, durationMs: 29500,
  downloadUrl: "https://download.test/dv_landcover_rf.tif", downloadScaleM: 30,
  areaKm2: 595.6, sampleSource: "builtin", nReferencePoints: 795,
  sampleClassCounts: { "1": 76, "2": 76, "3": 76, "4": 567 },
  notes: ["builtin_training"],
};
// Level 2 — crop-type winter run (9 classes, 370 train / 279 validation points, honest low accuracy)
const RUN_L2 = {
  mode: "live", algorithm: "rf", scheme: "crops", family: "winter", season: "winter",
  dateFrom: "2025-11-01", dateTo: "2026-04-30",
  tileUrl: "https://tiles.test/run-crops/{z}/{x}/{y}",
  oa: 0.349, kappa: 0.262,
  activeClassIds: [1, 3, 4, 5, 6, 7, 9, 10, 11], excludedClassIds: [2, 8],
  classes: [
    { classId: 10, code: "URB", en: "Urban", ar: "عمران", color: "#EF4444", areaKm2: 134.0, percent: 22.5, pa: 0.802, ua: 0.695, f1: 0.695, support: 108 },
    { classId: 9, code: "BAR", en: "Bare Land", ar: "أرض بور", color: "#9CA3AF", areaKm2: 132.2, percent: 22.2, pa: 0.567, ua: 0.482, f1: 0.482, support: 108 },
    { classId: 4, code: "BET", en: "Sugar Beet", ar: "بنجر السكر", color: "#e56db1", areaKm2: 91.1, percent: 15.3, pa: 0.225, ua: 0.19, f1: 0.19, support: 126 },
    { classId: 1, code: "WHT", en: "Wheat", ar: "قمح", color: "#ffd23f", areaKm2: 59.5, percent: 10.0, pa: 0.31, ua: 0.29, f1: 0.3, support: 108 },
    { classId: 11, code: "WTR", en: "Water", ar: "مياه", color: "#2563EB", areaKm2: 47.0, percent: 7.9, pa: 0.89, ua: 0.92, f1: 0.9, support: 108 },
  ],
  confusion: { classIds: [1, 4, 10], rows: [[11, 8, 7], [4, 14, 9], [0, 1, 22]] },
  nImages: 41, nTrain: 2590, nVal: 1953, nValPoints: 279, nTrainPoints: 370, durationMs: 61000,
  downloadUrl: "https://download.test/dv_crops_rf.tif",
  areaKm2: 595.6, sampleSource: "builtin", nReferencePoints: 649,
  sampleClassCounts: { "1": 83, "3": 65, "4": 85, "5": 59, "6": 59, "7": 70, "9": 76, "10": 76, "11": 76 },
  notes: ["builtin_training"],
};
const COMPARE = {
  kind: "compare",
  summary: [
    { algorithm: "rf", oa: 0.846, kappa: 0.665, nVal: 910 },
    { algorithm: "gtb", oa: 0.822, kappa: 0.64, nVal: 910 },
    { algorithm: "mlp", oa: null, kappa: null, nVal: 910 },
  ],
  best: { ...RUN_L1 },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/net::ERR|Failed to load resource|the server responded with a status/.test(m.text())) errors.push(m.text());
  });

  const calls = { run: 0, scene: 0, ndvi: 0 };
  let nextRunError = null; // set to an error code to make the next run fail
  let wantScheme = "general";

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
      if (body.scheme) wantScheme = body.scheme;
      if (nextRunError) { const c = nextRunError; nextRunError = null; return reply(400, { error: c, message: "mock" }); }
      if (body.kind === "compare") return reply(200, COMPARE);
      return reply(200, wantScheme === "crops" ? RUN_L2 : RUN_L1);
    }
    if (p === "/api/gee/scene" && method === "POST") {
      calls.scene++;
      return reply(200, { tileUrl: "https://scene-tiles.test/" + body.layer + "/{z}/{x}/{y}", nImages: 41, dateFrom: "2025-11-01", dateTo: "2026-04-30", layer: body.layer });
    }
    if (p === "/api/gee/ndvi-point" && method === "POST") {
      calls.ndvi++;
      return reply(200, { series: [{ d: "2025-11-12", v: 0.31 }, { d: "2025-12-19", v: 0.55 }, { d: "2026-01-18", v: 0.72 }, { d: "2026-02-21", v: 0.81 }, { d: "2026-03-15", v: 0.64 }] });
    }
    return reply(404, { error: "NO_MOCK", path: p });
  });

  console.log("== 1. boot + live detection");
  // file:// page: point srv.js at a mock absolute API base the router can intercept
  await page.addInitScript(() => { window.DV_API_BASE = "https://mock-api.example"; });
  await page.goto(HTML + "#/login");
  await page.waitForTimeout(400);
  await page.goto(HTML + "#/signup");
  await page.waitForTimeout(400);
  const stamp = Date.now();
  await page.fill("#su-name", "Live Tester");
  await page.fill("#su-email", "live" + stamp + "@example.com");
  await page.fill("#su-password", "pass1234word");
  await page.fill("#su-confirm", "pass1234word");
  await page.click("#signup-form button[type=submit]");
  await page.waitForTimeout(1600);
  ok((await page.locator("#view-workspace.is-on").count()) === 1, "signup lands in the workspace", page.url());
  await page.waitForTimeout(600); // give the boot GEE probe time to resolve
  const badge = await page.locator("#gee-badge").textContent();
  ok(/Earth Engine/.test(badge), "badge announces live mode", badge);
  ok((await page.locator("#league-btn").getAttribute("hidden")) === null, "accuracy-league button visible");
  ok((await page.locator("#scene-seg").getAttribute("hidden")) === null, "scene-layer buttons visible");
  ok(await page.locator(".preview-note").isHidden(), "the preview-mode banner is hidden in live mode");
  ok((await page.locator('#level-seg .level-btn.is-on').first().getAttribute("data-scheme")) === "general", "Level 1 is the default");

  console.log("== 2. Level 1 land-cover run (mocked engine)");
  await page.click("#sample-aoi-btn");
  await page.waitForTimeout(1400);
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  ok(await page.locator("#results-body").isVisible(), "results rendered");
  ok(calls.run === 1, "exactly one /api/gee/run call", String(calls.run));
  const statTxt = await page.locator("#stat-row").textContent();
  ok(/84\.6/.test(statTxt), "OA 84.6% card shown", statTxt.slice(0, 90));
  const headTxt = await page.locator("#class-table thead").textContent();
  ok(/PA|UA|F1/.test(headTxt), "PA/UA/F1 columns in the class table", headTxt.slice(0, 90));
  const rows = await page.locator("#class-table tbody tr").count();
  ok(rows === 4, "four land-cover rows", String(rows));
  const trainingLine = await page.locator("#training-set-line").textContent();
  ok(/455/.test(trainingLine) && /340/.test(trainingLine) && (/20 نقطة متطابقة|20 coordinate overlaps/).test(trainingLine), "training provenance line shows the professor's 455/340 split with the 20 removed overlaps", trainingLine);

  console.log("== 3. confusion matrix + GeoTIFF");
  ok(await page.locator("#confusion-wrap").isVisible(), "confusion matrix visible");
  const cmCells = await page.locator("#confusion-table tbody td").count();
  ok(cmCells === 16, "confusion matrix is 4×4", String(cmCells));
  const diag = await page.locator("#confusion-table td.diag").count();
  ok(diag === 4, "green diagonal cells", String(diag));
  const geoBtn = await page.locator("#geotiff-btn").count();
  const geoTxt = geoBtn ? await page.locator("#geotiff-btn").textContent() : "";
  ok(geoBtn === 1 && /GeoTIFF/.test(geoTxt), "GeoTIFF export button (blob download + scale)", geoTxt);
  ok(/30\s*m/.test(geoTxt), "GeoTIFF button shows the export scale", geoTxt);
  ok((await page.locator("#dss-wrap").isVisible()) === false, "no decision-support rows at the land-cover level");

  console.log("== 4. live tile overlay + scene layer");
  const runTiles = await page.locator('.leaflet-tile[src*="tiles.test/run"]').count();
  ok(runTiles > 0, "classification tile layer added to the map", String(runTiles));
  await page.click('#scene-seg button[data-scene="ndvi"]');
  await page.waitForTimeout(1200);
  ok(calls.scene === 1, "scene endpoint called", String(calls.scene));
  const sceneTiles = await page.locator('.leaflet-tile[src*="scene-tiles.test/ndvi"]').count();
  ok(sceneTiles > 0, "NDVI scene layer added under the overlay", String(sceneTiles));
  await page.click('#scene-seg button[data-scene="ndvi"]'); // toggle off
  await page.waitForTimeout(400);

  console.log("== 5. NDVI point popup (map click)");
  await page.click("#map", { position: { x: 500, y: 300 } });
  await page.waitForTimeout(900);
  ok(calls.ndvi === 1, "ndvi-point endpoint called", String(calls.ndvi));
  const popSvg = await page.locator(".ndvi-pop svg").count();
  ok(popSvg === 1, "NDVI chart popup rendered", String(popSvg));

  console.log("== 6. accuracy league");
  await page.click("#league-btn");
  await page.waitForTimeout(800);
  ok(await page.locator("#league-dialog").isVisible(), "league dialog opens");
  const leagueRows = await page.locator("#league-table tbody tr").count();
  ok(leagueRows === 3, "three algorithms scored", String(leagueRows));
  const leagueTxt = await page.locator("#league-table").textContent();
  ok(/84\.6%/.test(leagueTxt) && /82\.2%/.test(leagueTxt), "OA column shows the scores", leagueTxt.slice(0, 90));
  ok(/فشلت|failed/i.test(leagueTxt), "failed algorithm marked", leagueTxt.slice(0, 120));
  await page.click("#league-best-btn");
  await page.waitForTimeout(900);
  ok(!(await page.locator("#league-dialog").isVisible()), "dialog closes after loading the winner");
  ok(await page.locator("#results-body").isVisible(), "winner's results rendered");

  console.log("== 7. Level 2 crop-type run: DSS + honest accuracy insight");
  await page.click('#level-seg .level-btn[data-scheme="crops"]');
  await page.waitForTimeout(300);
  const sbE = await page.locator("#sb-excluded").textContent();
  ok(/ذرة|عنب|Maize|Grapes/.test(sbE), "seasonal badge lists the excluded crops", sbE);
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  ok(await page.locator("#dss-wrap").isVisible(), "DSS section visible for crop classes");
  const dssRows = await page.locator("#dss-table tbody tr").count();
  ok(dssRows === 2, "DSS rows only for crop classes (wheat + sugar beet)", String(dssRows));
  const dssTotals = await page.locator("#dss-totals").textContent();
  ok(/[0-9]/.test(dssTotals), "DSS totals computed", dssTotals.slice(0, 80));
  ok(await page.locator("#run-insight").isVisible(), "the honest low-accuracy insight appears at the crop level");
  const insightTxt = await page.locator("#run-insight").textContent();
  ok(/overlap|تداخل/.test(insightTxt), "the insight explains the spectral overlap", insightTxt.slice(0, 90));
  const cropsTiles = await page.locator('.leaflet-tile[src*="tiles.test/run-crops"]').count();
  ok(cropsTiles > 0, "crop-level tile layer swapped in", String(cropsTiles));

  console.log("== 8. engine error mapping");
  nextRunError = "no_images";
  // the same combination is already cached client-side — a plain Run click
  // would replay it; switch to an uncached algorithm so the mock error fires
  await page.selectOption("#algorithm-select", "svm");
  await page.click("#run-btn");
  await page.waitForTimeout(900);
  const toastTxt = await page.locator("#toast").textContent();
  ok(/Sentinel-2|سحاب/.test(toastTxt), "no_images error shown in the user's language", toastTxt.slice(0, 90));

  ok(errors.length === 0, "no page JS errors", errors.join(" | ").slice(0, 200));
  await browser.close();
  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed");
  if (fails.length) { console.log("FAILED:", fails); process.exit(1); }
})().catch((e) => { console.error("SUITE ERROR", e); process.exit(1); });
