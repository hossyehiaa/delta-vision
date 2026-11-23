#!/usr/bin/env node
/*
 * server_auth.test.js — E2E with a mocked /api (route interception): server signup →
 * workspace → run → auto-save → History dialog (list/open/delete) → logout/login.
 * Proves the srv.js + app.js integration without a deployed backend.
 *   node server_auth.test.js <html> <fixturesDir>
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const HTML = "file://" + path.resolve(process.argv[2]);

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
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR|Failed to load resource/.test(m.text())) errors.push(m.text()); });

  // ---- mock /api
  const users = new Map();
  const runsByUser = new Map();
  let tokenSeq = 0;
  function mkUser(b) { return { id: "u" + (++tokenSeq).toString(16).padStart(16, "0"), email: b.email, name: b.name, org: b.org || "", created: new Date().toISOString() }; }
  function mkToken(u) { return u.id + "." + Math.floor(Date.now() / 1000 + 1e5) + "." + "f".repeat(64); }
  function authUser(req) {
    const h = req.headers()["authorization"] || "";
    const m = /^Bearer (.+)$/.exec(h);
    if (!m) return null;
    const uid = m[1].split(".")[0];
    for (const u of users.values()) if (u.id === uid) return u;
    return null;
  }
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const method = route.request().method();
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch (e) {}
    const reply = (status, j) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(j) });

    if (p === "/api/health") return reply(200, { ok: true, db: true, time: new Date().toISOString() });
    if (p === "/api/auth/signup" && method === "POST") {
      if (users.has(body.email)) return reply(409, { ok: false, error: "EMAIL_TAKEN", errors: { email: "EMAIL_TAKEN" } });
      const u = mkUser(body);
      users.set(u.email, u);
      return reply(201, { ok: true, user: u, token: mkToken(u) });
    }
    if (p === "/api/auth/login" && method === "POST") {
      const u = users.get(String(body.email || "").toLowerCase());
      if (!u || !body.password) return reply(401, { ok: false, error: "BAD_CREDENTIALS" });
      return reply(200, { ok: true, user: u, token: mkToken(u) });
    }
    if (p === "/api/auth/demo") {
      let u = users.get("demo@deltavision.app");
      if (!u) { u = mkUser({ email: "demo@deltavision.app", name: "Demo" }); users.set(u.email, u); }
      return reply(200, { ok: true, user: u, token: mkToken(u) });
    }
    if (p === "/api/runs" && method === "GET") {
      const u = authUser(route.request());
      if (!u) return reply(401, { ok: false, error: "AUTH" });
      return reply(200, { ok: true, runs: (runsByUser.get(u.id) || []).slice().reverse().map(r => ({ id: r.id, algorithm: r.algorithm, season: r.season, mode: r.mode, aoiName: r.aoiName, createdAt: r.createdAt })) });
    }
    if (p === "/api/runs" && method === "POST") {
      const u = authUser(route.request());
      if (!u) return reply(401, { ok: false, error: "AUTH" });
      const id = "r" + (++tokenSeq).toString(16).padStart(16, "0");
      const arr = runsByUser.get(u.id) || [];
      arr.push(Object.assign({ id, createdAt: new Date().toISOString() }, body));
      runsByUser.set(u.id, arr);
      return reply(201, { ok: true, id });
    }
    const m = /^\/api\/runs\/(.+)$/.exec(p);
    if (m && method === "GET") {
      const u = authUser(route.request());
      if (!u) return reply(401, { ok: false, error: "AUTH" });
      const r = (runsByUser.get(u.id) || []).find((x) => x.id === m[1]);
      if (!r) return reply(404, { ok: false, error: "NOT_FOUND" });
      return reply(200, { ok: true, run: r });
    }
    if (m && method === "DELETE") {
      const u = authUser(route.request());
      if (!u) return reply(401, { ok: false, error: "AUTH" });
      const arr = runsByUser.get(u.id) || [];
      const i = arr.findIndex((x) => x.id === m[1]);
      if (i < 0) return reply(404, { ok: false, error: "NOT_FOUND" });
      arr.splice(i, 1);
      return reply(200, { ok: true });
    }
    return reply(404, { ok: false, error: "NOT_FOUND" });
  });

  console.log("== 1. server signup");
  // file:// page: point srv.js at a mock absolute API base the router can intercept
  await page.addInitScript(() => { window.DV_API_BASE = "https://mock-api.example"; });
  await page.goto(HTML + "#/login");
  await page.waitForTimeout(500);
  await page.goto(HTML + "#/signup");
  await page.waitForTimeout(500);
  const stamp = Date.now();
  await page.fill("#su-name", "Field Tester");
  await page.fill("#su-email", "field" + stamp + "@example.com");
  await page.fill("#su-password", "pass1234word");
  await page.fill("#su-confirm", "pass1234word");
  await page.click("#signup-form button[type=submit]");
  await page.waitForTimeout(1400);
  ok(await page.locator("#workspace").isVisible() || page.url().includes("#/workspace"), "signup lands in the workspace", page.url());
  const nav = await page.locator("#nav-auth").textContent();
  ok(/Field Tester/.test(nav), "nav shows the server account", nav.slice(0, 60));

  console.log("== 2. run → auto-save");
  await page.click("#sample-aoi-btn");
  await page.waitForTimeout(1400);
  await page.click("#run-btn");
  await page.waitForTimeout(1800);
  ok(await page.locator("#results-body").isVisible(), "run produced results");
  await page.waitForTimeout(900); // give the auto-save promise time
  const histBtn = await page.locator("#history-btn").getAttribute("hidden");
  ok(histBtn === null, "History button appears after a saved run", String(histBtn));

  console.log("== 3. History dialog");
  await page.click("#history-btn");
  await page.waitForTimeout(600);
  ok(await page.locator("#history-dialog").isVisible(), "dialog opens");
  const rows = await page.locator("#history-table tbody tr").count();
  ok(rows === 1, "one saved run in the table", String(rows));
  const rowTxt = await page.locator("#history-table tbody tr").first().textContent();
  ok(/Borj|برج/.test(rowTxt), "row shows the AOI name", rowTxt.slice(0, 80));

  console.log("== 4. open a saved run");
  await page.click("#history-table tbody tr button.btn-lime");
  await page.waitForTimeout(2200);
  ok(await page.locator("#results-body").isVisible(), "reopened run shows results");
  const aoi = await page.locator("#aoi-summary").textContent().catch(() => "");
  ok(/Borj|برج|141|فدان|feddan/i.test(aoi || (await page.locator("#results-body").textContent()).slice(0, 200)), "AOI restored", (aoi || "").slice(0, 90));

  console.log("== 5. delete + logout/login");
  await page.click("#history-btn");
  await page.waitForTimeout(600);
  const rowsBefore = await page.locator("#history-table tbody tr").count();
  if (rowsBefore > 0) {
    await page.locator("#history-table tbody tr button.btn-ghost").first().click();
    await page.waitForTimeout(1000);
  }
  const rowsAfter = await page.locator("#history-table tbody tr").count();
  ok(rowsAfter === 0, "history emptied after delete", String(rowsAfter));
  // logout through the account menu
  await page.keyboard.press("Escape");  // close the dialog
  await page.waitForTimeout(300);
  await page.click("#account-btn");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const menu = document.querySelector("#nav-auth .account-menu");
    const btns = menu ? Array.from(menu.querySelectorAll("button")) : [];
    const out = btns.find((b) => b.textContent.trim().length > 0);
    if (out) out.click();
  });
  await page.waitForTimeout(600);
  const nav2 = await page.locator("#nav-auth").textContent();
  ok(/تسجيل الدخول|Log in|تسجيل/.test(nav2), "logged out (login button back)", nav2.slice(0, 60));

  // login again — server session restored
  await page.goto(HTML + "#/login");
  await page.waitForTimeout(500);
  await page.fill("#login-email", "field" + stamp + "@example.com");
  await page.fill("#login-password", "pass1234word");
  await page.click("#login-form button[type=submit]");
  await page.waitForTimeout(1400);
  const nav3 = await page.locator("#nav-auth").textContent();
  ok(/Field Tester/.test(nav3), "server login works after logout", nav3.slice(0, 60));

  console.log("== 6. offline fallback");
  // kill the API: every /api route now fails → app must fall back to local demo auth
  await page.unrouteAll();
  await page.route("**/api/**", async (route) => route.abort());
  await page.evaluate(() => { if (window.DVSrv && window.DVSrv.setAvailable) window.DVSrv.setAvailable(false); });
  // hard reload so the probe runs fresh against the now-aborting API
  await page.goto(HTML + "#/login");
  await page.waitForTimeout(1200);
  const loginVisible = await page.locator("#login-form").isVisible();
  ok(loginVisible, "login view visible for the offline test");
  await page.locator("#demo-btn").click({ timeout: 5000 }).catch(async () => {
    await page.evaluate(() => document.querySelector("#demo-btn").click());
  });
  await page.waitForTimeout(2200);
  const nav4 = await page.locator("#nav-auth").textContent();
  ok(/Demo|عرض/.test(nav4), "demo button falls back to local auth when API is down", nav4.slice(0, 60));
  ok(await page.locator("#workspace").isVisible() || page.url().includes("workspace"), "workspace reachable via local fallback", page.url());

  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed" + (fails.length ? "\n  failed: " + fails.join(" | ") : ""));
  const realErrors = errors.filter((e) => !/net::ERR|Failed to load resource|ERR_FAILED/.test(e));
  if (realErrors.length) console.log("PAGE ERRORS: " + realErrors.join(" | "));
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
