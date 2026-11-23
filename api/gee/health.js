/* GET /api/gee/health — is live Earth Engine mode available?
 * Mirrors the Basira contract: { ok, mode: "live" | "demo", jobs }. On Vercel
 * there is no background function, so jobs is always "sync" in live mode. */
"use strict";
const { json } = require("../_db");
const E = require("../_gee_engine");

module.exports = async function (req, res) {
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
