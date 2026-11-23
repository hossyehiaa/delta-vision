#!/usr/bin/env node
/*
 * live_gee.test.js — E2E of the LIVE Earth Engine path with the /api/gee/* endpoints
 * mocked at the network layer (no GEE key needed). Proves the whole wiring:
 * boot probe → badge → real run (tiles + OA/Kappa + PA/UA/F1 + confusion + DSS +
 * GeoTIFF link) → scene layers → NDVI point popup → accuracy league → error mapping.
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

const RUN = {
  mode: "live", algorithm: "rf", season: "winter",
  dateFrom: "2024-11-01", dateTo: "2025-04-30",
  tileUrl: "https://tiles.test/run/{z}/{x}/{y}",
  oa: 0.87, kappa: 0.81,
  classes: [
    { classId: 1, code: "WHT", en: "Wheat", ar: "قمح", color: "#ffff00", areaKm2: 200.5, percent: 33.7, pa: 0.93, ua: 0.90, f1: 0.915, support: 30 },
    { classId: 4, code: "CLV", en: "Clover", ar: "برسيم", color: "#008000", areaKm2: 180.2, percent: 30.3, pa: 0.86, ua: 0.88, f1: 0.87, support: 28 },
    { classId: 10, code: "FLW", en: "Fallow", ar: "أرض بور", color: "#808080", areaKm2: 214.9, percent: 36.0, pa: 0.84, ua: 0.85, f1: 0.845, support: 32 },
  ],
  confusion: { classIds: [1, 4, 10], rows: [[28, 2, 0], [3, 24, 1], [0, 4, 28]] },
  nImages: 23, nTrain: 210, nVal: 90, durationMs: 41230,
  downloadUrl: "https://download.test/dv_rf.tif",
  areaKm2: 595.6, sampleSource: "auto",
  sampleClassCounts: { "1": 70, "4": 70, "10": 70 },
};
const COMPARE = {
  kind: "compare",
  summary: [
    { algorithm: "rf", oa: 0.87, kappa: 0.81, nVal: 90 },
    { algorithm: "svm", oa: 0.82, kappa: 0.74, nVal: 90 },
    { algorithm: "mlp", oa: null, kappa: null, nVal: 90 },
  ],
  best: { ...RUN },
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
      if (nextRunError) { const c = nextRunError; nextRunError = null; return reply(400, { error: c, message: "mock" }); }
      if (body.kind === "compare") return reply(200, COMPARE);
      return reply(200, RUN);
    }
    if (p === "/api/gee/scene" && method === "POST") {
      calls.scene++;
      return reply(200, { tileUrl: "https://scene-tiles.test/" + body.layer + "/{z}/{x}/{y}", nImages: 23, dateFrom: "2024-11-01", dateTo: "2025-04-30", layer: body.layer });
    }
    if (p === "/api/gee/ndvi-point" && method === "POST") {
      calls.ndvi++;
      return reply(200, { series: [{ d: "2024-11-12", v: 0.31 }, { d: "2024-12-19", v: 0.55 }, { d: "2025-01-18", v: 0.72 }, { d: "2025-02-21", v: 0.81 }, { d: "2025-03-15", v: 0.64 }] });
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

  console.log("== 2. real run (mocked engine)");
  await page.click("#sample-aoi-btn");
  await page.waitForTimeout(1400);
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  ok(await page.locator("#results-body").isVisible(), "results rendered");
  ok(calls.run === 1, "exactly one /api/gee/run call", String(calls.run));
  const statTxt = await page.locator("#stat-row").textContent();
  ok(/87/.test(statTxt), "OA 87% card shown", statTxt.slice(0, 90));
  const headTxt = await page.locator("#class-table thead").textContent();
  ok(/PA|UA|F1/.test(headTxt), "PA/UA/F1 columns in the class table", headTxt.slice(0, 90));

  console.log("== 3. confusion matrix + DSS + GeoTIFF");
  ok(await page.locator("#confusion-wrap").isVisible(), "confusion matrix visible");
  const cmCells = await page.locator("#confusion-table tbody td").count();
  ok(cmCells === 9, "confusion matrix is 3×3", String(cmCells));
  const diag = await page.locator("#confusion-table td.diag").count();
  ok(diag === 3, "green diagonal cells", String(diag));
  ok(await page.locator("#dss-wrap").isVisible(), "DSS section visible");
  const dssRows = await page.locator("#dss-table tbody tr").count();
  ok(dssRows === 2, "DSS rows only for crop classes (wheat + clover)", String(dssRows));
  const dssTotals = await page.locator("#dss-totals").textContent();
  ok(/[0-9]/.test(dssTotals), "DSS totals computed", dssTotals.slice(0, 80));
  const geoHref = await page.locator("#geotiff-btn").getAttribute("href");
  ok(geoHref === RUN.downloadUrl, "GeoTIFF download link", String(geoHref));

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
  ok(/87\.0%/.test(leagueTxt) && /82\.0%/.test(leagueTxt), "OA column shows the scores", leagueTxt.slice(0, 90));
  ok(/فشلت|failed/i.test(leagueTxt), "failed algorithm marked", leagueTxt.slice(0, 120));
  await page.click("#league-best-btn");
  await page.waitForTimeout(900);
  ok(!(await page.locator("#league-dialog").isVisible()), "dialog closes after loading the winner");
  ok(await page.locator("#results-body").isVisible(), "winner's results rendered");

  console.log("== 7. engine error mapping");
  nextRunError = "no_images";
  await page.click("#run-btn");
  await page.waitForTimeout(900);
  const toastTxt = await page.locator("#toast").textContent();
  ok(/Sentinel-2/.test(toastTxt), "no_images error shown in the user's language", toastTxt.slice(0, 90));

  ok(errors.length === 0, "no page JS errors", errors.join(" | ").slice(0, 200));
  await browser.close();
  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed");
  if (fails.length) { console.log("FAILED:", fails); process.exit(1); }
})().catch((e) => { console.error("SUITE ERROR", e); process.exit(1); });
