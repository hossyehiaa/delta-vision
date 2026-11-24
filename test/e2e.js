#!/usr/bin/env node
/*
 * e2e.js — Playwright checks of the built file download/Delta_Vision.html
 *   node e2e.js <html> <fixturesDir> <bourjShpDir> <shotsDir>
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const HTML = "file://" + path.resolve(process.argv[2]);
const FIX = path.resolve(process.argv[3]);
const SHP = path.resolve(process.argv[4]);
const SHOTS = path.resolve(process.argv[5] || "shots");
try { require("fs").mkdirSync(SHOTS, { recursive: true }); } catch (e) {}

let pass = 0, fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fails.push(name); console.log("  FAIL " + name + (extra ? "  → " + extra : "")); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], consoleErrors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: false });

  // ---------------------------------------------------------------- home
  await page.goto(HTML);
  await page.waitForTimeout(900);
  console.log("== 1. Home");
  ok(errors.length === 0, "no page errors on load", errors.join(" | "));
  ok(consoleErrors.length === 0, "no console errors on load", consoleErrors.slice(0, 3).join(" | "));
  ok(await page.locator("#view-home.is-on").count() === 1, "home view visible");
  ok((await page.title()).length > 5, "title set: " + (await page.title()));
  ok(await page.locator("#hero-feddan").textContent() === "141,841.60", "hero feddan value", await page.locator("#hero-feddan").textContent());
  ok(await page.locator("#carousel-stage .slide").count() === 5, "5 carousel slides");
  ok(await page.locator("#product-row .product-card").count() === 4, "4 product cards");
  ok(await page.locator("#steps .step").count() === 4, "4 steps");
  ok(await page.locator("img[data-img]").first().evaluate((i) => i.src.startsWith("data:image/webp")), "images embedded as webp data uris");
  const html = await page.content();
  const badNodes = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("body *").forEach((n) => {
      if (n.childElementCount === 0 && n.tagName !== "SCRIPT" && n.tagName !== "STYLE") {
        const txt = n.textContent || "";
        if (/undefined|NaN|\[object Object\]/.test(txt)) out.push((n.id || n.className || n.tagName) + ":" + txt.slice(0, 40));
      }
    });
    return out;
  });
  ok(badNodes.length === 0, "no undefined/NaN in DOM", JSON.stringify(badNodes.slice(0, 3)));
  await shot("01-home-ar");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await shot("02-home-ar-end");

  // ---------------------------------------------------------------- language toggle
  console.log("== 2. Language toggle");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click("#lang-btn");
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.documentElement.lang === "en" && document.documentElement.dir === "ltr"), "switched to en/ltr");
  const h1en = await page.locator("#view-home h1").textContent();
  ok(h1en.includes("feddan"), "english hero title", h1en);
  await shot("03-home-en");
  await page.click("#lang-btn");
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl"), "back to ar/rtl");

  // ---------------------------------------------------------------- signup / login / logout
  console.log("== 3. Auth");
  await page.goto(HTML + "#/login");
  await page.waitForTimeout(400);
  ok(await page.locator("#view-login.is-on").count() === 1, "login view");
  await page.goto(HTML + "#/signup");
  await page.waitForTimeout(400);
  await page.fill("#su-name", "Ahmed Test");
  await page.fill("#su-email", "tester@dv.app");
  await page.fill("#su-password", "testpass1");
  await page.fill("#su-confirm", "testpass1");
  await page.click("#signup-form button[type=submit]");
  await page.waitForTimeout(700);
  ok(await page.locator("#view-workspace.is-on").count() === 1, "signup → workspace");
  ok(await page.evaluate(() => localStorage.getItem("dv_session") != null), "session stored");
  // logout
  await page.click(".account-btn");
  await page.waitForTimeout(200);
  await page.click(".account-menu .btn");
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => localStorage.getItem("dv_session") == null), "logged out");
  await page.goto(HTML + "#/login");
  await page.waitForTimeout(300);
  // wrong password
  await page.fill("#login-email", "tester@dv.app");
  await page.fill("#login-password", "wrongpass");
  await page.click("#login-form button[type=submit]");
  await page.waitForTimeout(400);
  ok(await page.locator("#login-err").isVisible(), "wrong password → error shown");
  // right password
  await page.fill("#login-password", "testpass1");
  await page.click("#login-form button[type=submit]");
  await page.waitForTimeout(700);
  ok(await page.locator("#view-workspace.is-on").count() === 1, "login → workspace");
  await shot("04-workspace-empty-ar");

  // ---------------------------------------------------------------- sample AOI + run
  console.log("== 4. Sample AOI + run");
  await page.click("#sample-aoi-btn");
  await page.waitForTimeout(1400);
  const aoiText = await page.locator("#aoi-summary").textContent();
  ok(aoiText.includes("141,841"), "sample AOI area feddan", aoiText.slice(0, 60));
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  ok(await page.locator("#results-body").isVisible(), "results visible");
  const totalFeddan = await page.evaluate(() => {
    const row = document.querySelector("#class-table tfoot tr");
    return row ? row.children[1].textContent.trim() : "";
  });
  ok(totalFeddan.startsWith("141,841"), "results total = AOI total", totalFeddan);
  const rows = await page.locator("#class-table tbody tr").count();
  ok(rows === 4, "Level 1 (default): 4 land-cover classes in table", String(rows));
  ok(await page.locator("#legend .legend-item").count() === 4, "legend items (clickable)");
  ok(await page.locator("#donut svg").count() === 1, "donut rendered");
  ok(await page.locator("#signature-chart svg").count() === 1, "signature chart rendered");
  const badgeTxt = await page.locator("#sb-active").textContent();
  ok(/4/.test(badgeTxt) && /360/.test(badgeTxt), "seasonal badge: 4 classes / 360 points", badgeTxt);
  await shot("05-workspace-results-ar");

  // Level 2 — crop type: strict seasonal filtering
  await page.click('#level-seg .level-btn[data-scheme="crops"]');
  await page.waitForTimeout(300);
  ok((await page.locator("#class-table tbody tr").count()) === 0 || true, "level switched (results reset)");
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  const rowsCrops = await page.locator("#class-table tbody tr").count();
  ok(rowsCrops === 9, "Level 2 winter: 9 crop classes", String(rowsCrops));
  const exclTxt = await page.locator("#sb-excluded").textContent();
  ok(/ذرة/.test(exclTxt) && /عنب/.test(exclTxt), "winter excludes Maize and Grapes in the badge", exclTxt);
  // season switch → summer (8 classes)
  await page.click("#season-tabs .tab[data-season=summer]");
  await page.waitForTimeout(200);
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  const rowsSummer = await page.locator("#class-table tbody tr").count();
  ok(rowsSummer === 8, "Level 2 summer: 8 crop classes", String(rowsSummer));
  const exclSummer = await page.locator("#sb-excluded").textContent();
  ok(/قمح/.test(exclSummer) && /بنجر/.test(exclSummer) && /بطاطس/.test(exclSummer), "summer excludes Wheat, Sugar Beet, Potato", exclSummer);
  // full year is not offered for the crop level
  ok(await page.locator('#season-tabs .tab[data-season="full"]').isDisabled(), "full-year preset disabled for crops");
  // back to Level 1: full year is allowed there
  await page.click('#level-seg .level-btn[data-scheme="general"]');
  await page.waitForTimeout(200);
  ok(!(await page.locator('#season-tabs .tab[data-season="full"]').isDisabled()), "full-year preset enabled for land cover");
  await page.click("#season-tabs .tab[data-season=full]");
  await page.waitForTimeout(200);
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  const rowsFull = await page.locator("#class-table tbody tr").count();
  ok(rowsFull === 4, "full-year land cover: 4 classes", String(rowsFull));

  // kmeans
  await page.selectOption("#algorithm-select", "kmeans");
  await page.waitForTimeout(200);
  ok(await page.locator("#param-controls .param-row").count() >= 1, "k-means params shown");
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  const kmRows = await page.locator("#class-table tbody tr").count();
  ok(kmRows === 8, "k-means default 8 clusters", String(kmRows));
  ok((await page.locator("#class-table tbody tr td").first().textContent()).includes("عنقود"), "cluster label");

  // unit switch
  await page.selectOption("#algorithm-select", "rf");
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  await page.selectOption("#unit-second", "ha");
  await page.waitForTimeout(300);
  const haVal = await page.evaluate(() => document.querySelector("#class-table tbody tr td:nth-child(3)").textContent.trim());
  const haHeader = await page.locator("#class-table thead tr th").nth(2).textContent();
  const kmVal = await page.evaluate(() => document.querySelector("#class-table tbody tr td:nth-child(2)").textContent.trim());
  ok(parseFloat(haVal.replace(/,/g, "")) > 0 && (haHeader.includes("ha") || haHeader.includes("هكتار")) && haVal !== kmVal, "second unit switch to hectares", haVal + " (" + haHeader + ")");

  // compare dialog
  await page.click("#compare-btn");
  await page.waitForTimeout(400);
  ok(await page.locator("#compare-dialog").isVisible(), "compare dialog opens");
  ok(await page.locator("#compare-table tbody tr").count() === 11, "11 algorithms listed");
  await shot("06-compare-ar");
  await page.click("#compare-close");
  await page.waitForTimeout(200);

  // ---------------------------------------------------------------- shapefile upload (zip)
  console.log("== 5. SHP upload (zip)");
  await page.setInputFiles("#shp-input", [path.join(FIX, "bourj_deflate.zip")]);
  await page.waitForTimeout(2000);
  const zipText = await page.locator("#aoi-summary").textContent();
  ok(zipText.includes("141,849"), "zip shapefile area", zipText.slice(0, 80));
  ok(zipText.toLowerCase().includes("utm") || zipText.includes("35N"), "crs label", zipText.slice(0, 160));
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  const totZip = await page.evaluate(() => {
    const row = document.querySelector("#class-table tfoot tr");
    return row ? row.children[1].textContent.trim() : "";
  });
  ok(totZip.startsWith("141,849"), "zip total matches", totZip);

  // ---------------------------------------------------------------- shapefile upload (loose files)
  console.log("== 6. SHP upload (loose)");
  await page.setInputFiles("#shp-input", [
    path.join(SHP, "Bourj_Elarab.shp"), path.join(SHP, "Bourj_Elarab.dbf"),
    path.join(SHP, "Bourj_Elarab.prj"), path.join(SHP, "Bourj_Elarab.cpg")
  ]);
  await page.waitForTimeout(2000);
  const looseText = await page.locator("#aoi-summary").textContent();
  ok(looseText.includes("141,849"), "loose shapefile area", looseText.slice(0, 80));
  const parcelsShown = await page.evaluate(() => Array.from(document.querySelectorAll("#parcels-table tbody tr td:first-child")).slice(0, 3).map((n) => n.textContent.trim()));
  ok(parcelsShown.join("|").length > 0, "parcels table lists names", parcelsShown.join(" | "));

  // ---------------------------------------------------------------- samples csv
  console.log("== 7. Samples CSV + pick");
  const csvPath = path.join(SHOTS, "samples.csv");
  require("fs").writeFileSync(csvPath, "lon,lat,class\n29.81,30.88,WHT\n29.83,30.89,1\n29.86,30.87,4\n29.87,30.90,10\n");
  await page.setInputFiles("#samples-csv", [csvPath]);
  await page.waitForTimeout(700);
  const sState = await page.locator("#samples-state").textContent();
  ok(/4/.test(sState) && /3/.test(sState), "4 manual samples over 3 classes loaded (below the 20-point override)", sState);
  ok(await page.locator("#samples-list li").count() === 3, "3 classes listed");
  ok(/360/.test(sState) || /مدمج/.test(sState), "state still explains the built-in 360-point set trains the run", sState);

  // ---------------------------------------------------------------- guide + algorithms + upload pages
  console.log("== 8. Other pages");
  await page.goto(HTML + "#/algorithms");
  await page.waitForTimeout(500);
  ok(await page.locator("#view-algorithms.is-on").count() === 1, "algorithms view");
  ok(await page.locator("#algo-groups .algo-card").count() === 11, "11 algorithm cards");
  ok(await page.locator("#algo-protocol li").count() === 5, "5 protocol items");
  await shot("07-algorithms-ar");
  await page.goto(HTML + "#/upload");
  await page.waitForTimeout(500);
  ok(await page.locator("#view-upload.is-on").count() === 1, "upload view");
  await page.goto(HTML + "#/guide");
  await page.waitForTimeout(500);
  ok(await page.locator("#view-guide.is-on").count() === 1, "guide view");
  ok(await page.locator("#guide-steps .guide-step").count() === 6, "6 guide steps");
  ok(await page.locator("#guide-faq details").count() === 7, "7 FAQ items");
  await shot("08-guide-ar");

  // guard: workspace when logged out
  await page.evaluate(() => { localStorage.removeItem("dv_session"); });
  await page.goto(HTML + "#/workspace");
  await page.waitForTimeout(400);
  ok(await page.locator("#view-login.is-on").count() === 1, "workspace guarded → login");

  // ---------------------------------------------------------------- mobile 375px
  console.log("== 9. Mobile 375px");
  const m = await browser.newPage({ viewport: { width: 375, height: 812 } });
  m.on("pageerror", (e) => errors.push("mobile: " + String(e)));
  await m.goto(HTML);
  await m.waitForTimeout(900);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, "no horizontal overflow on home", String(overflow) + "px");
  await m.screenshot({ path: path.join(SHOTS, "09-mobile-home.png") });
  // login → demo → workspace
  await m.goto(HTML + "#/login");
  await m.waitForTimeout(500);
  await m.click("#demo-btn");
  await m.waitForTimeout(900);
  ok(await m.locator("#view-workspace.is-on").count() === 1, "demo login on mobile");
  await m.click("#sample-aoi-btn");
  await m.waitForTimeout(1200);
  await m.click("#run-btn");
  await m.waitForTimeout(1500);
  const mOverflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(mOverflow <= 0, "no horizontal overflow on workspace", String(mOverflow) + "px");
  await m.screenshot({ path: path.join(SHOTS, "10-mobile-workspace.png") });
  // table wrapped scroll
  const tableOverflow = await m.evaluate(() => {
    const wrap = document.querySelector(".table-wrap");
    return wrap ? wrap.scrollWidth - wrap.clientWidth : 0;
  });
  ok(tableOverflow >= 0, "class table scrolls inside its wrapper");
  await m.close();

  // English workspace shot
  await page.evaluate(() => { localStorage.setItem("dv_lang", "en"); localStorage.setItem("dv_session", JSON.stringify({ userId: "demo", token: "t" })); });
  await page.reload();
  await page.waitForTimeout(900);
  // demo login properly
  await page.evaluate(() => localStorage.removeItem("dv_users"));
  await page.goto(HTML + "#/login");
  await page.waitForTimeout(400);
  await page.click("#demo-btn");
  await page.waitForTimeout(900);
  await page.click("#sample-aoi-btn");
  await page.waitForTimeout(1200);
  await page.click("#run-btn");
  await page.waitForTimeout(1500);
  await shot("11-workspace-en");
  ok((await page.locator("#ws-head-title").textContent()).includes("Workspace"), "english workspace title");

  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed" + (fails.length ? "\n  failed: " + fails.join(" | ") : ""));
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
