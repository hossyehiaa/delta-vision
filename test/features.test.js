#!/usr/bin/env node
/* features.test.js — this turn's additions, end to end in a mocked live
 * session: run cache + Re-run fresh, compare persistence, confusion caption,
 * GeoJSON / PNG / GeoTIFF / print exports, custom date seeding and order,
 * blank basemap, toolbar draw tools, fullscreen layout, single-source mode.
 *   node features.test.js <built index.html> */
"use strict";
const { chromium } = require("playwright");
const HTML = require("path").resolve(process.argv[2] || "public/index.html");

let pass = 0;
const fails = [];
const ok = (c, n, x) => { if (c) { pass++; console.log("  PASS " + n); } else { fails.push(n); console.log("  FAIL " + n + (x ? "  → " + String(x).slice(0, 160) : "")); } };

// 1×1 transparent PNG + a minimal 8-byte TIFF-ish blob for the export routes
const PNG1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const TIFBLOB = Buffer.from("SUkqAGRlbHRhAAAA", "base64");

const RUN_L1 = {
  mode: "live", algorithm: "rf", scheme: "general", family: "winter", season: "winter",
  dateFrom: "2025-11-01", dateTo: "2026-04-30",
  tileUrl: "https://tiles.test/run/{z}/{x}/{y}",
  oa: 0.846, kappa: 0.665, activeClassIds: [1, 2, 3, 4], excludedClassIds: [],
  classes: [
    { classId: 4, code: "CRO", en: "Cropland", ar: "أراضٍ زراعية", color: "#22C55E", areaKm2: 366.1, percent: 61.4, pa: 0.94, ua: 0.907, f1: 0.907, support: 270 },
    { classId: 2, code: "URB", en: "Urban", ar: "عمران", color: "#EF4444", areaKm2: 104.8, percent: 17.6, pa: 0.725, ua: 0.673, f1: 0.673, support: 108 },
    { classId: 3, code: "BAR", en: "Bare Land", ar: "أرض بور", color: "#9CA3AF", areaKm2: 78.1, percent: 13.1, pa: 0.433, ua: 0.538, f1: 0.538, support: 108 },
    { classId: 1, code: "WTR", en: "Water", ar: "مياه", color: "#2563EB", areaKm2: 47.0, percent: 7.9, pa: 0.89, ua: 0.92, f1: 0.9, support: 108 },
  ],
  confusion: { classIds: [1, 2, 3, 4], rows: [[96, 2, 4, 6], [3, 78, 27, 0], [1, 12, 47, 48], [2, 0, 3, 103]], total: 432, nValPoints: 108 },
  nImages: 41, nTrain: 2098, nVal: 910, nValPoints: 108, durationMs: 8000,
  downloadUrl: "https://download.test/dv_landcover_rf.tif", downloadScaleM: 30,
  areaKm2: 595.6, sampleSource: "builtin", nReferencePoints: 360,
  sampleClassCounts: { "1": 36, "2": 36, "3": 36, "4": 252 }, notes: ["builtin_training"],
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERROR:", String(e).slice(0, 250)); });
  page.on("console", (m) => {
    if (m.type() === "error" && !/net::ERR|Failed to load resource|the server responded with a status/.test(m.text())) errors.push(m.text());
  });

  const calls = { run: 0, runBodies: [] };
  let healthMode = "live";   // flipped later for the mode-consistency section
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname, method = route.request().method();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch (e) {}
    const reply = (status, j) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(j) });
    if (p === "/api/health") return reply(200, { ok: true, db: true, time: new Date().toISOString() });
    if (p === "/api/gee/health") {
      if (healthMode === "unreachable") return route.abort();
      return reply(200, { ok: healthMode === "live", mode: healthMode, jobs: "sync" });
    }
    if (p === "/api/runs" && method === "GET") return reply(200, { ok: true, runs: [] });
    if (p === "/api/auth/demo" && method === "POST") return reply(200, { ok: true, token: "demo-token", user: { id: "demo", email: "demo@deltavision.app", name: "Demo" } });
    if (p === "/api/gee/export-png" && method === "POST") {
      return route.fulfill({ contentType: "image/png", body: PNG1x1 });
    }
    if (p === "/api/gee/run" && method === "POST") {
      calls.run++;
      calls.runBodies.push(body);
      const out = { ...RUN_L1, cached: body.fresh ? false : undefined };
      return reply(200, out);
    }
    return reply(404, { error: "NO_MOCK", path: p });
  });
  // the classification tiles + the GeoTIFF download
  let bakeTileHits = 0;   // the bake must fetch the FULL z12 grid (no every()-hole short-circuit)
  await page.route("**/tiles.test/**", (route) => {
    if (/\/run\/12\//.test(route.request().url())) bakeTileHits++;
    return route.fulfill({ contentType: "image/png", body: PNG1x1 });
  });
  await page.route("**/download.test/**", (route) => route.fulfill({ contentType: "image/tiff", body: TIFBLOB }));

  await page.addInitScript(() => { window.DV_API_BASE = "https://mock-api.example"; });
  await page.goto("file://" + HTML + "#/login");
  await page.waitForTimeout(400);
  await page.click("#demo-btn");
  await page.waitForTimeout(2600);
  ok((await page.locator("#view-workspace.is-on").count()) === 1, "demo login → workspace");

  console.log("== 1. first run + new metadata");
  await page.click("#sample-aoi-btn");
  await page.waitForTimeout(700);
  await page.click("#run-btn");
  await page.waitForTimeout(1400);
  ok(await page.locator("#results-body").isVisible(), "results rendered");
  ok(calls.run === 1, "one run call so far", String(calls.run));
  const cap = await page.locator("#confusion-caption").textContent();
  ok(/432/.test(cap) && /108/.test(cap), "confusion caption: 432 pixels from 108 withheld points", cap);
  const tl = await page.locator("#training-set-line").textContent();
  ok((tl.match(/Trained on/g) || []).length + (tl.match(/دُرِّب/g) || []).length === 1, "training line says 'trained on' exactly once", tl);

  console.log("== 1b. reference palette, single provenance, preset date sync");
  // the professor's reference palette on the L1 class swatches
  const sw = await page.evaluate(() => Array.from(document.querySelectorAll("#class-table .swatch")).map((el) => getComputedStyle(el).backgroundColor));
  ok(sw.length === 4 && sw.indexOf("rgb(34, 197, 94)") >= 0 && sw.indexOf("rgb(156, 163, 175)") >= 0 && sw.indexOf("rgb(239, 68, 68)") >= 0 && sw.indexOf("rgb(37, 99, 235)") >= 0,
    "L1 swatches = reference palette (CRO #22C55E, BAR #9CA3AF, URB #EF4444, WTR #2563EB)", JSON.stringify(sw));
  // exactly ONE provenance under Results: the training-set line, no note twin
  const notesTxt = (await page.locator("#run-notes").count()) ? await page.locator("#run-notes").textContent() : "";
  ok(!/built-in reference set|الطقم المرجعي المدمج|\(360 نقطة\)/.test(notesTxt), "no duplicate provenance note stacked under Results", (notesTxt || "").slice(0, 60));
  ok(/\(360 points · 4 classes\)|\(360 نقطة · 4 فئات\)/.test(tl), "training line carries the counts exactly once", tl.slice(0, 80));
  // sub-season preset → From/To fields carry the preset's exact range
  const yr = parseInt(await page.inputValue("#year-select"), 10);
  await page.click('[data-season="early_winter"]');
  await page.waitForTimeout(250);
  const ef = await page.inputValue("#custom-from"), et = await page.inputValue("#custom-to");
  ok(ef === (yr - 1) + "-10-01" && et === yr + "-01-31", "Early Winter click syncs From/To (" + (yr - 1) + "-10-01 → " + yr + "-01-31)", ef + " → " + et);
  await page.click('[data-season="winter"]');
  await page.waitForTimeout(250);
  const wf = await page.inputValue("#custom-from"), wt = await page.inputValue("#custom-to");
  ok(wf === (yr - 1) + "-11-01" && wt === yr + "-04-30", "back on Winter: From/To follow the preset again", wf + " → " + wt);

  // the bake: all 25 z12 tiles of the Borj grid must be requested
  for (let bi = 0; bi < 30 && bakeTileHits < 25; bi++) await page.waitForTimeout(200);
  ok(bakeTileHits === 25, "bake fetched the full z12 grid (25 tiles, not a short-circuit)", String(bakeTileHits));

  console.log("== 2. client run cache + Re-run fresh");
  const t0 = Date.now();
  await page.click("#run-btn");
  await page.waitForTimeout(250);
  const cachedMs = Date.now() - t0;
  ok((await page.locator("#rerun-chip").count()) === 1, "cached render shows the Re-run fresh chip");
  ok(cachedMs < 2000, "cached render is instant (" + cachedMs + " ms)", String(cachedMs));
  ok(await page.locator("#results-body").isVisible(), "cached results still rendered");
  ok(calls.run === 1, "no second backend call for the cached combination", String(calls.run));
  await page.locator("#rerun-chip").click();
  await page.waitForTimeout(1200);
  ok(calls.run === 2, "Re-run fresh hits the backend again", String(calls.run));
  ok((await page.locator("#rerun-chip").count()) === 0, "fresh result has no chip");
  ok(calls.runBodies[1] && calls.runBodies[1].fresh === true, "the fresh flag is sent", JSON.stringify(calls.runBodies[1] || {}).slice(0, 60));

  console.log("== 3. compare persistence after a run");
  await page.click("#compare-btn");
  await page.waitForTimeout(400);
  const rfRow = await page.locator("#compare-table tbody tr").first().textContent();
  ok(/84\.6/.test(rfRow) && /0\.665/.test(rfRow), "the RF row shows its measured OA/κ immediately", rfRow.slice(0, 90));
  await page.click("#compare-close");
  await page.waitForTimeout(200);

  console.log("== 4. exports");
  const dl = page.waitForEvent("download");
  await page.click("#geojson-export-btn");
  const geoDl = await dl;
  const geoJson = JSON.parse((await geoDl.path()) ? require("fs").readFileSync(await geoDl.path(), "utf8") : "{}");
  ok(geoJson.type === "FeatureCollection" && geoJson.features.length === 1, "GeoJSON export: a real FeatureCollection", geoJson.type);
  ok(geoJson.features[0].properties && geoJson.features[0].properties.area_feddan > 100000, "GeoJSON features carry area properties", JSON.stringify(geoJson.features[0].properties).slice(0, 80));

  const dl2 = page.waitForEvent("download");
  await page.click("#geotiff-btn");
  const tifDl = await dl2;
  const tifName = tifDl.suggestedFilename();
  ok(/\.tif$/.test(tifName), "GeoTIFF export downloads a .tif file", tifName);

  const dl3 = page.waitForEvent("download");
  await page.click("#png-btn");
  const pngDl = await dl3;
  const pngName = pngDl.suggestedFilename();
  const pngBytes = require("fs").readFileSync(await pngDl.path());
  ok(/\.png$/.test(pngName) && pngBytes.slice(1, 4).toString() === "PNG", "PNG export downloads a real PNG", pngName);
  const { imageSize } = { imageSize: await pngDl.path() ? (await import("zlib")).default : null };
  const dim = await pngDl.evaluate ? null : null;
  ok(pngBytes.byteLength > 5000, "the exported PNG is a full composite (> 5 KB)", String(pngBytes.byteLength));

  console.log("== 5. print report window");
  const popupP = page.waitForEvent("popup", { timeout: 8000 });
  await page.click("#print-btn");
  const popup = await popupP;
  await popup.waitForTimeout(900);
  const pTitle = await popup.title();
  const pBody = await popup.evaluate(() => document.body.textContent.slice(0, 2000));
  ok(popup.url() === "about:blank" || /report|تقرير/i.test(pTitle + pBody), "the print window opens");
  ok(/Cropland|زراعية/.test(pBody), "the report contains the class table");
  ok(/432/.test(pBody) || /108/.test(pBody), "the report contains the confusion matrix + caption");
  ok((await popup.locator("img.map").count()) === 1, "the report embeds the full-frame classified map");
  await popup.close();

  console.log("== 6. custom dates");
  // the fields always mirror the ACTIVE preset — entering custom detection
  // starts from exactly what is on screen
  const cf = await page.locator("#custom-from").inputValue();
  const ct = await page.locator("#custom-to").inputValue();
  ok(cf && ct && cf < ct, "custom date fields carry the active preset, in order", cf + " → " + ct);
  ok(cf === "2025-11-01" && ct === "2026-04-30", "the fields show the winter preset's exact range", cf + " → " + ct);
  await page.fill("#custom-from", "2026-03-15");
  await page.fill("#custom-to", "2026-01-10");
  await page.dispatchEvent("#custom-to", "change");
  await page.waitForTimeout(300);
  const cf2 = await page.locator("#custom-from").inputValue();
  const ct2 = await page.locator("#custom-to").inputValue();
  ok(cf2 < ct2, "an inverted pair is auto-swapped into order", cf2 + " → " + ct2);
  await page.click("#custom-apply");
  await page.waitForTimeout(400);
  const period = await page.locator("#season-period").textContent();
  ok(/2026-01-10/.test(period) && /2026-03-15/.test(period), "applying the custom range updates the period line", period);

  console.log("== 7. blank basemap + draw tools");
  await page.click('#basemap-seg button[data-basemap="none"]');
  ok(await page.evaluate(() => document.getElementById("map").classList.contains("map-blank")), "blank basemap toggles the map class");
  await page.click('#basemap-seg button[data-basemap="satellite"]');
  ok(await page.evaluate(() => !document.getElementById("map").classList.contains("map-blank")), "satellite basemap restores");

  ok((await page.locator("#draw-tools button").count()) === 4, "four draw tools on the map toolbar");
  await page.click('#draw-tools button[data-draw="triangle"]');
  ok(await page.evaluate(() => document.getElementById("map").classList.contains("crosshair")), "triangle tool enters drawing mode");
  const box = await page.locator("#map").boundingBox();
  const cx = box.x + box.width * 0.45, cy = box.y + box.height * 0.45;
  await page.mouse.click(cx, cy);
  await page.mouse.click(cx + 80, cy);
  await page.mouse.click(cx + 40, cy + 70);
  await page.waitForTimeout(400);
  ok((await page.locator("#aoi-summary").count()) === 1 && !(await page.locator("#aoi-summary").first().isHidden?.() ?? (await page.locator("#aoi-summary").isHidden())), "three clicks close the triangle into an AOI");
  await page.click('#draw-tools button[data-draw="circle"]');
  await page.mouse.click(cx, cy);
  await page.mouse.click(cx + 90, cy);
  await page.waitForTimeout(400);
  ok(await page.locator("#aoi-summary").isVisible(), "two clicks define the circle AOI");

  console.log("== 8. fullscreen covers the viewport with the legend");
  await page.click("#fullscreen-btn");
  await page.waitForTimeout(900);
  const fs = await page.evaluate(() => ({
    el: document.fullscreenElement && document.fullscreenElement.classList.contains("ws-map"),
    legend: !!(document.fullscreenElement && document.querySelector(".legend") && document.fullscreenElement.contains(document.querySelector(".legend"))),
  }));
  ok(fs.el, "the whole map card goes fullscreen");
  ok(fs.legend, "the legend stays visible in fullscreen");
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => !document.fullscreenElement), "exiting fullscreen restores the layout");

  console.log("== 9. single-source mode: unreachable health ≠ preview");
  healthMode = "unreachable";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const badgeTxt = await page.locator("#gee-badge").textContent();
  ok(!/وضع المعاينة|Preview/.test(badgeTxt), "a failed probe is never labelled preview", badgeTxt);
  ok(await page.locator(".preview-note").isHidden(), "no preview banner on an unreachable probe");
  // a successful live run reconciles the mode
  await page.evaluate(() => { window.DV_API_BASE = "https://mock-api.example"; });
  await page.click("#sample-aoi-btn");
  await page.waitForTimeout(500);
  await page.click("#run-btn");
  await page.waitForTimeout(1400);
  const badge2 = await page.locator("#gee-badge").textContent();
  ok(/Earth Engine/.test(badge2), "a successful live run reconciles the badge to live", badge2);

  ok(errors.length === 0, "no console/page errors through the whole suite", errors.slice(0, 3).join(" | ").slice(0, 200));
  await browser.close();
  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed");
  if (fails.length) { console.log("FAILED:", fails); process.exit(1); }
})().catch((e) => { console.error("SUITE ERROR", e); process.exit(1); });
