#!/usr/bin/env node
/* prod_ui.test.js — Playwright flow against the LIVE deployment (signup → run → history). */
"use strict";
const { chromium } = require("playwright");

const BASE = process.argv[2] || "https://delta-vision-reelzatak.vercel.app";
let pass = 0, fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fails.push(name); console.log("  FAIL " + name + (extra ? "  → " + String(extra).slice(0, 160) : "")); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR|Failed to load resource|the server responded with a status/.test(m.text())) errors.push(m.text()); });

  console.log("== load");
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const title = await page.title();
  ok(/Delta Vision|دلتا/.test(title), "page title", title);
  ok(await page.locator("#map").count() >= 0 && (await page.locator(".view.is-on").count()) >= 1, "app booted");
  const lang = await page.evaluate(() => document.documentElement.lang);
  ok(lang === "ar" || lang === "en", "lang detected", lang);

  console.log("== server signup");
  await page.goto(BASE + "/#/login");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/#/signup");
  await page.waitForTimeout(1200);
  const stamp = Date.now();
  await page.fill("#su-name", "Live Tester");
  await page.fill("#su-email", "live" + stamp + "@example.com");
  await page.fill("#su-password", "pass1234word");
  await page.fill("#su-confirm", "pass1234word");
  await page.click("#signup-form button[type=submit]");
  await page.waitForTimeout(3500);
  const nav = await page.locator("#nav-auth").textContent();
  ok(/Live Tester/.test(nav), "nav shows the account", nav.slice(0, 60));

  console.log("== run + auto-save");
  await page.locator("#sample-aoi-btn").click({ timeout: 10000 }).catch(() => page.evaluate(() => document.querySelector("#sample-aoi-btn").click()));
  await page.waitForTimeout(2000);
  await page.locator("#run-btn").click({ timeout: 10000 }).catch(() => page.evaluate(() => document.querySelector("#run-btn").click()));
  await page.waitForTimeout(3500);
  ok(await page.locator("#results-body").isVisible(), "results rendered");
  await page.waitForTimeout(1500);
  const histHidden = await page.locator("#history-btn").getAttribute("hidden");
  ok(histHidden === null, "History button visible after auto-save", String(histHidden));

  console.log("== history dialog");
  await page.click("#history-btn");
  await page.waitForTimeout(1500);
  ok(await page.locator("#history-dialog").isVisible(), "dialog opens");
  const rows = await page.locator("#history-table tbody tr").count();
  ok(rows >= 1, "saved run listed", String(rows));

  console.log("== sample AOI feddan value on production");
  const statRow = await page.locator("#stat-row").textContent();
  ok(/141,|141\d/.test(statRow), "Borj El Arab feddan total shown", statRow.slice(0, 80));

  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed" + (fails.length ? "\n  failed: " + fails.join(" | ") : ""));
  const realErrors = errors.filter((e) => !/net::ERR|Failed to load resource|the server responded with a status of 4|ERR_/i.test(e));
  if (realErrors.length) console.log("PAGE ERRORS: " + realErrors.join(" | "));
  await page.screenshot({ path: "/tmp/dv_shots_prod/prod.png" }).catch(() => {});
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
