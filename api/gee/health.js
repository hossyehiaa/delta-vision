/* GET /api/gee/health — is live Earth Engine mode available?
 * Mirrors the Basira contract: { ok, mode: "live" | "demo", jobs }. On Vercel
 * there is no background function, so jobs is always "sync" in live mode.
 * The engine require is wrapped: a bundling/runtime problem reports itself
 * here instead of a bare FUNCTION_INVOCATION_FAILED. */
"use strict";
const { json } = require("../_db");
let E = null;
let engineError = null;
try {
  E = require("../../engine/_gee_engine");
} catch (e) {
  engineError = String((e && e.stack) || e).slice(0, 500);
}

module.exports = async function (req, res) {
  if (engineError) return json(res, { ok: false, mode: "engine_error", jobs: "sync", error: engineError });
  if (!E.isGEEConfigured()) return json(res, { ok: false, mode: "demo", jobs: "sync" });
  try {
    await E.getEE();
    return json(res, { ok: true, mode: "live", jobs: "sync" });
  } catch (e) {
    return json(res, {
      ok: false, mode: "demo", jobs: "sync",
      error: String((e && e.message) || e).slice(0, 300),
    });
  }
};
