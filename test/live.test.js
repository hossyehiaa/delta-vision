#!/usr/bin/env node
/*
 * live.test.js — proves the live-backend path: a mock Earth Engine endpoint is installed with
 * page.route, the page loads with ?backend=<mock>, a run produces the LIVE result set
 * (OA/Kappa shown, tileUrl overlay on the map, feddan areas from the endpoint's areaKm2).
 *   node live.test.js <html> <fixturesDir> <bourjShpDir>
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const HTML = "file://" + path.resolve(process.argv[2]);
const FIX = path.resolve(process.argv[3]);
const SHP = path.resolve(process.argv[4]);

let pass = 0, fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fails.push(name); console.log("  FAIL " + name + (extra ? "  → " + extra : "")); }
}

// a mock RunResult the real endpoint would return (areas as Earth Engine would report them)
function mockResult(body) {
  body = body || {};
  const classes = [
    { classId: 1, percent: 40 }, { classId: 10, percent: 30 }, { classId: 4, percent: 20 }, { classId: 11, percent: 10 }
  ];
  const areaKm2 = 595.73;
  return {
    mode: "live",
    tileUrl: "https://mock.example/ee/{z}/{x}/{y}.png",
    oa: 0.913, kappa: 0.874,
    areaKm2,
    dateFrom: body.season === "summer" ? "2025-05-01" : "2024-11-01",
    dateTo: body.season === "summer" ? "2025-10-31" : "2025-04-30",
    nImages: 23, nTrain: 4520, nVal: 1937, sampleSource: "auto", durationMs: 38210,
    classes: classes.map((c) => ({ classId: c.classId, areaKm2: +(areaKm2 * c.percent / 100).toFixed(3), percent: c.percent }))
  };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // the mock endpoint: answers POST with the RunResult JSON
  let lastBody = null;
  await page.route("**/api/run", async (route) => {
    lastBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockResult(lastBody)) });
  });

  const url = HTML + "?backend=" + encodeURIComponent("https://mock.example/api/run") + "#/login";
  await page.goto(url);
  await page.waitForTimeout(800);
  console.log("== 1. Live mode UI");
  const badge = await page.locator("#mode-badge").textContent();
  ok(/Earth Engine|الوضع: Earth Engine/.test(badge), "badge switches to Earth Engine", badge);

  await page.click("#demo-btn");
  await page.waitForTimeout(900);
  await page.click("#sample-aoi-btn");
  await page.waitForTimeout(1400);
  await page.click("#run-btn");
  await page.waitForTimeout(1500);

  console.log("== 2. Live run");
  ok(!!lastBody, "POST reached the backend");
  if (lastBody) {
    ok(lastBody.algorithm === "rf" && lastBody.season === "winter", "endpoint got algorithm+season", JSON.stringify({ a: lastBody.algorithm, s: lastBody.season }));
    ok(lastBody.samplePoints !== undefined && Array.isArray(lastBody.aoiGeo.features), "RunInput shape (aoiGeo features + samplePoints)");
  }
  ok(await page.locator("#results-body").isVisible(), "results visible");
  const statRow = await page.locator("#stat-row").textContent();
  ok(/91\.3/.test(statRow), "OA shown from the endpoint", statRow.slice(0, 120));
  ok(/87|—/.test(statRow) || /0\.87/.test(statRow), "Kappa shown", statRow.slice(0, 160));
  const rows = await page.locator("#class-table tbody tr").count();
  ok(rows === 4, "4 classes from the endpoint", String(rows));
  const fed = await page.evaluate(() => {
    const row = document.querySelector("#class-table tbody tr td:nth-child(2)");
    return row ? row.textContent.trim() : "";
  });
  ok(fed.includes("56,7") || fed.includes("5"), "feddan computed from endpoint areaKm2 (595.73 km² × 40%)", fed);
  const donut = await page.locator("#donut").textContent();
  ok(/Earth Engine/.test(donut), "donut caption says Earth Engine", donut.slice(0, 80));

  // live failure path
  console.log("== 3. Live failure");
  await page.route("**/api/fail", async (route) => { await route.fulfill({ status: 503, body: "boom" }); });
  await page.evaluate(() => { window.DV_BACKEND_URL = "https://mock.example/api/fail"; });
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  const toastTxt = await page.locator("#toast").textContent();
  const toastOn = await page.locator("#toast").evaluate((n) => n.classList.contains("is-on"));
  ok(toastOn && /خادم|server/i.test(toastTxt), "backend failure toast", toastTxt.slice(0, 60));
  ok(await page.locator("#results-empty").isVisible(), "results cleared after failure");

  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed" + (fails.length ? "\n  failed: " + fails.join(" | ") : ""));
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
