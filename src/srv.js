/*
 * Delta Vision — srv.js (client)
 * Server-backed auth + run history for the deployed build (Vercel + Neon), with graceful
 * fallback to the local demo auth (auth.js) when the API is not reachable — the page stays
 * 100% functional offline either way.
 *
 * Contract with app.js: exposes the same surface as DVAuth (signup/login/logout/session/
 * ensureDemo/DEMO) but async where the server is involved. app.js's small adapter
 * (srvAdapter in app.js) bridges the difference.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./auth.js"));
  else root.DVSrv = factory(root.DVAuth);
})(typeof self !== "undefined" ? self : this, function (A) {
  "use strict";

  var KEY_TOKEN = "dv_token", KEY_SRV_USER = "dv_srv_user";
  // API base: same-origin "/api" when served over http(s); for file:// pages set
  // window.DV_API_BASE = "https://your-deployment.vercel.app" (or an absolute base) so the
  // single-file build can still reach a deployed backend.
  var API = (function () {
    try {
      if (typeof self.DV_API_BASE === "string" && self.DV_API_BASE) return self.DV_API_BASE;
      if (/^https?:$/.test(location.protocol)) return "";  // same-origin /api
    } catch (e) { /* older browsers */ }
    return null;   // file:// or unknown → unavailable until an absolute base is given
  })();
  var available = null;    // tri-state: null unknown, true up, false down

  // ------------------------------------------------------------------ storage
  function store() { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } }
  function readJSON(k) { var s = store(); if (!s) return null; try { return JSON.parse(s.getItem(k) || "null"); } catch (e) { return null; } }
  function writeJSON(k, v) { var s = store(); if (!s) return false; try { if (v == null) s.removeItem(k); else s.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function token() { return readJSON(KEY_TOKEN); }

  // ------------------------------------------------------------------ fetch with timeout
  function call(method, path, body) {
    if (API === null) { var off = new Error("OFFLINE"); off.code = "OFFLINE"; return Promise.reject(off); }
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    var opt = { method: method, headers: {} };
    var tk = token();
    if (tk) opt.headers.Authorization = "Bearer " + tk;
    if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    if (ctl) opt.signal = ctl.signal;
    return fetch(API + path, opt).then(function (res) {
      clearTimeout(timer);
      var j = null;
      return res.json().catch(function () { return {}; }).then(function (parsed) {
        j = parsed;
        if (!res.ok) {
          var e = new Error((j && j.error) || ("HTTP_" + res.status));
          e.code = (j && j.error) || ("HTTP_" + res.status);
          e.errors = j && j.errors;
          throw e;
        }
        return j;
      });
    }, function (err) {
      clearTimeout(timer);
      var e = new Error("OFFLINE");
      e.code = "OFFLINE";
      throw e;
    });
  }

  // ------------------------------------------------------------------ availability probe (cached)
  function probe() {
    if (API === null) { available = false; }
    if (available !== null) return Promise.resolve(available);
    return call("GET", "/api/health").then(function (j) {
      available = j && j.ok ? true : false;
      return available;
    }, function () { available = false; return false; });
  }

  // ------------------------------------------------------------------ session shape shared with app.js
  function srvSession(u) {
    // mimic DVAuth.session() fields + keep the server token
    return { userId: u.id, email: u.email, name: u.name, org: u.org || "", since: u.created || new Date().toISOString(), server: true };
  }
  function saveSession(j) {
    writeJSON(KEY_TOKEN, j.token);
    writeJSON(KEY_SRV_USER, j.user);
    return srvSession(j.user);
  }
  function clearSession() { writeJSON(KEY_TOKEN, null); writeJSON(KEY_SRV_USER, null); }

  // ------------------------------------------------------------------ API
  function signup(form) {
    // validate locally first for instant feedback (same rules as the server)
    var v = A.validate(form);
    if (!v.ok) return Promise.resolve({ ok: false, error: "INVALID", errors: v.errors, offline: false });
    return probe().then(function (up) {
      if (!up) {
        var local = A.signup(form);          // offline fallback (localStorage demo)
        local.offline = true;
        return local;
      }
      return call("POST", "/api/auth/signup", { name: v.name, email: v.email, password: v.password, org: v.org })
        .then(function (j) { return { ok: true, user: j.user, session: saveSession(j), offline: false }; })
        .catch(function (e) {
          if (e.code === "EMAIL_TAKEN" || (e.errors && Object.keys(e.errors).length)) {
            return { ok: false, error: e.code || "INVALID", errors: e.errors || { email: "EMAIL_TAKEN" }, offline: false };
          }
          var fb = A.signup(form); fb.offline = true; fb.serverError = e.code || "SERVER";
          return fb;
        });
    });
  }

  function login(email, password) {
    return probe().then(function (up) {
      if (!up) { var local = A.login(email, password); local.offline = true; return local; }
      return call("POST", "/api/auth/login", { email: email, password: password })
        .then(function (j) { return { ok: true, user: j.user, session: saveSession(j), offline: false }; })
        .catch(function (e) {
          if (e.code === "OFFLINE") { var fb = A.login(email, password); fb.offline = true; return fb; }
          return { ok: false, error: "BAD_CREDENTIALS", offline: false };
        });
    });
  }

  function demo() {
    return probe().then(function (up) {
      if (!up) { var r = A.ensureDemo(); var l = A.login(A.DEMO.email, A.DEMO.password); l.offline = true; return l; }
      return call("POST", "/api/auth/demo", {})
        .then(function (j) { return { ok: true, user: j.user, session: saveSession(j), offline: false }; })
        .catch(function () { var fb = A.login(A.DEMO.email, A.DEMO.password); fb.offline = true; return fb; });
    });
  }

  function logout() {
    var wasServer = !!token();
    clearSession();
    A.logout();
    return wasServer;
  }

  function session() {
    // server session first (token present + cached user), else local demo session.
    // When the API is known-down, prefer the local session so the page stays usable.
    var u = readJSON(KEY_SRV_USER);
    if (u && token() && available !== false) return srvSession(u);
    return A.session();
  }

  // ------------------------------------------------------------------ runs history
  function saveRun(run) {
    if (!token()) return Promise.resolve({ ok: false, error: "AUTH" });
    return call("POST", "/api/runs", run).then(function (j) { return { ok: true, id: j.id }; });
  }
  function listRuns() {
    if (!token()) return Promise.resolve({ ok: false, error: "AUTH", runs: [] });
    return call("GET", "/api/runs").then(function (j) { return { ok: true, runs: j.runs || [] }; });
  }
  function getRun(id) {
    return call("GET", "/api/runs/" + id).then(function (j) { return j.run; });
  }
  function deleteRun(id) {
    return call("DELETE", "/api/runs/" + id).then(function (j) { return { ok: true }; });
  }

  // test/debug hook: force the availability state ("true"|"false"|null)
  function setAvailable(v) { available = v === true || v === "true" ? true : (v === false || v === "false" ? false : null); }

  // ------------------------------------------------------------------ live GEE layer
  /** Same-origin (or DV_API_BASE) base the app talks to, e.g. "" or "https://…vercel.app". */
  function apiBase() { return API; }
  /** GET /api/gee/health → { ok, mode: "live" | "demo", jobs, error }. Never rejects. */
  function geeHealth() {
    return call("GET", "/api/gee/health").then(function (j) {
      return {
        ok: !!j.ok,
        mode: j && j.mode === "live" ? "live" : "demo",
        jobs: (j && j.jobs) || "sync",
        error: (j && j.error) || null
      };
    }, function () {
      return { ok: false, mode: "demo", jobs: "sync", error: "UNREACHABLE" };
    });
  }

  return {
    signup: signup, login: login, demo: demo, logout: logout, session: session,
    setAvailable: setAvailable, get available() { return available; },
    DEMO: A.DEMO,
    saveRun: saveRun, listRuns: listRuns, getRun: getRun, deleteRun: deleteRun,
    isServer: function () { return !!token(); },
    probe: probe,
    apiBase: apiBase, geeHealth: geeHealth
  };
});
