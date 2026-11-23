#!/usr/bin/env node
/*
 * api_local.test.js — exercises every serverless handler against the real Neon DB,
 * with a mock Vercel req/res. Run from the repo root:
 *   DATABASE_URL=postgresql://… AUTH_SECRET=… node test/api_local.test.js
 * Uses a random test email so reruns never collide.
 */
"use strict";
const assert = require("assert");
const path = require("path");
const crypto = require("crypto");

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-" + crypto.randomBytes(8).toString("hex");

const dbmod = require(path.resolve("api/_db.js"));
const signup = require(path.resolve("api/auth/signup.js"));
const login = require(path.resolve("api/auth/login.js"));
const me = require(path.resolve("api/auth/me.js"));
const demo = require(path.resolve("api/auth/demo.js"));
const health = require(path.resolve("api/health.js"));
const runs = require(path.resolve("api/runs.js"));
const runById = require(path.resolve("api/runs/[id].js"));

let pass = 0, fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fails.push(name); console.log("  FAIL " + name + (extra ? "  → " + JSON.stringify(extra).slice(0, 200) : "")); }
}

// mock Vercel req/res
function mkreq(method, body, token, query) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  return { method, headers, body, query: query || {} };
}
function mkres() {
  const r = { statusCode: 0, headers: {}, body: "" };
  r.end = (b) => { r.body = b || ""; };
  return r;
}
function unwrap(r) { try { return JSON.parse(r.body); } catch (e) { return {}; } }

(async () => {
  const stamp = Date.now();
  const email = "tester" + stamp + "@example.com";
  const pw = "pass1234word";

  console.log("== health");
  let res = await health(mkreq("GET"), mkres());
  ok(res.statusCode === 200 && unwrap(res).ok === true, "health returns ok", unwrap(res));

  console.log("== signup");
  res = await signup(mkreq("POST", { name: "Tester", email, password: pw, org: "Agri" }), mkres());
  let j = unwrap(res);
  ok(res.statusCode === 201 && j.ok && j.user.email === email && /^[a-f0-9]{16}\.\d+\.[a-f0-9]{64}$/.test(j.token), "signup creates user + token", j);
  let token = j.token;

  // duplicate
  res = await signup(mkreq("POST", { name: "Tester", email, password: pw }), mkres());
  ok(res.statusCode === 409 && unwrap(res).error === "EMAIL_TAKEN", "duplicate email rejected", unwrap(res));

  // invalid payloads
  res = await signup(mkreq("POST", { name: "x", email: "bad", password: "short" }), mkres());
  ok(res.statusCode === 400 && unwrap(res).errors && unwrap(res).errors.name === "NAME" && unwrap(res).errors.email === "EMAIL" && unwrap(res).errors.password === "PASSWORD", "validation errors", unwrap(res));

  console.log("== login");
  res = await login(mkreq("POST", { email, password: pw }), mkres());
  j = unwrap(res);
  ok(res.statusCode === 200 && j.ok && j.user.email === email, "login works", j);
  const tok2 = j.token;
  ok(tok2 !== token, "fresh token per login");
  res = await login(mkreq("POST", { email, password: "wrong1234" }), mkres());
  ok(res.statusCode === 401 && unwrap(res).error === "BAD_CREDENTIALS", "wrong password rejected", unwrap(res));
  res = await login(mkreq("POST", { email: "nobody@example.com", password: pw }), mkres());
  ok(res.statusCode === 401 && unwrap(res).error === "BAD_CREDENTIALS", "unknown user rejected (no enumeration)", unwrap(res));

  console.log("== me");
  res = await me(mkreq("GET", undefined, token), mkres());
  j = unwrap(res);
  ok(res.statusCode === 200 && j.ok && j.user.email === email && j.user.org === "Agri", "me returns the user", j);
  res = await me(mkreq("GET"), mkres());
  ok(res.statusCode === 401 && unwrap(res).error === "AUTH", "me without token → 401", unwrap(res));
  res = await me(mkreq("GET", undefined, token.split(".").slice(0, 2).join(".") + ".deadbeef"), mkres());
  ok(res.statusCode === 401, "tampered token → 401", unwrap(res));

  console.log("== demo account");
  res = await demo(mkreq("POST", {}), mkres());
  j = unwrap(res);
  ok(res.statusCode === 200 && j.ok && j.user.email === "demo@deltavision.app", "demo login works", j);
  const demoTok = j.token;
  res = await demo(mkreq("POST", {}), mkres());
  j = unwrap(res);
  ok(j.ok && j.user.email === "demo@deltavision.app", "demo is idempotent", j);

  console.log("== runs");
  const aoiGeo = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[29.7, 30.85], [29.7, 30.9], [29.8, 30.9], [29.8, 30.85], [29.7, 30.85]]] } }] };
  const runPayload = {
    algorithm: "rf", season: "winter", year: 2025, mode: "preview", aoiName: "Test AOI",
    aoiGeo, samplePoints: [{ classId: 1, lon: 29.75, lat: 30.87 }],
    params: { rfTrees: 100 }, results: { mode: "preview", classes: [{ classId: 1, percent: 50, areaM2: 3e6 }] }
  };
  res = await runs(mkreq("POST", runPayload, token), mkres());
  j = unwrap(res);
  ok(res.statusCode === 201 && j.ok && j.id, "run saved", j);
  const runId = j.id;

  // second run so the list has >1
  await runs(mkreq("POST", Object.assign({}, runPayload, { algorithm: "kmeans", mode: "live", results: { mode: "live", classes: [{ classId: 2, percent: 30, areaM2: 2e6 }] } }), token), mkres());

  res = await runs(mkreq("GET", undefined, token), mkres());
  j = unwrap(res);
  ok(res.statusCode === 200 && j.ok && j.runs.length === 2, "list shows 2 runs", j.runs && j.runs.length);
  ok(j.runs[0].algorithm && j.runs[0].createdAt && j.runs[0].aoiName === "Test AOI", "list row shape", j.runs[0]);
  ok(j.runs.every(r => r.id !== undefined && r.mode !== undefined), "list has id+mode");

  // no auth
  res = await runs(mkreq("GET"), mkres());
  ok(res.statusCode === 401 && unwrap(res).error === "AUTH", "runs without token → 401", unwrap(res));
  // bad payload
  res = await runs(mkreq("POST", { algorithm: "rf" }, token), mkres());
  ok(res.statusCode === 400 && unwrap(res).error === "BAD_AOI", "missing aoiGeo rejected", unwrap(res));
  // demo account sees none of tester's runs
  res = await runs(mkreq("GET", undefined, demoTok), mkres());
  ok(unwrap(res).runs.length === 0, "runs are per-user", unwrap(res));

  console.log("== run by id");
  res = await runById(mkreq("GET", undefined, token, { id: runId }), mkres());
  j = unwrap(res);
  ok(res.statusCode === 200 && j.ok && j.run.aoiGeo.type === "FeatureCollection" && j.run.results.classes.length === 1 && j.run.algorithm === "rf", "get run returns the snapshot", j.run && j.run.algorithm);
  // other user's run
  res = await runById(mkreq("GET", undefined, demoTok, { id: runId }), mkres());
  ok(res.statusCode === 404, "another user's run → 404", unwrap(res));
  // bad id
  res = await runById(mkreq("GET", undefined, token, { id: "zzzzzzzzzzzz" }), mkres());
  ok(res.statusCode === 404, "unknown id → 404", unwrap(res));

  console.log("== delete");
  res = await runById(mkreq("DELETE", undefined, token, { id: runId }), mkres());
  ok(res.statusCode === 200 && unwrap(res).ok, "delete own run", unwrap(res));
  res = await runById(mkreq("GET", undefined, token, { id: runId }), mkres());
  ok(res.statusCode === 404, "deleted run gone", unwrap(res));
  res = await runs(mkreq("GET", undefined, token), mkres());
  ok(unwrap(res).runs.length === 1, "list is now 1", unwrap(res).runs.length);

  console.log("\nSUMMARY: " + pass + " passed, " + fails.length + " failed" + (fails.length ? "\n  failed: " + fails.join(" | ") : ""));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
