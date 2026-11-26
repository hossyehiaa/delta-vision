#!/usr/bin/env node
/*
 * i18n.test.js — Arabic/English dictionary parity, and the domain data (two
 * classification levels, seasonal class filtering, period presets, algorithms,
 * parameter defaults) against the engine's own scheme file (via data.js).
 *   node i18n.test.js <i18n.js> <data.js>
 */
"use strict";
const path = require("path");
const I = require(path.resolve(process.argv[2]));
const D = require(path.resolve(process.argv[3]));
let pass = 0;
const fails = [];
const ok = (c, n, x) => { if (c) { pass++; console.log("  PASS " + n); } else { fails.push(n + (x ? "  → " + x : "")); console.log("  FAIL " + n + (x ? "  → " + x : "")); } };

function leaves(o, p, out) {
  for (const k of Object.keys(o)) {
    const v = o[k], q = p ? p + "." + k : k;
    if (v && typeof v === "object") leaves(v, q, out); else out.push([q, v]);
  }
  return out;
}
const en = leaves(I.dictionaries.en, "", []), ar = leaves(I.dictionaries.ar, "", []);
const enKeys = en.map((l) => l[0]), arKeys = ar.map((l) => l[0]);
const only = (a, b) => a.filter((k) => b.indexOf(k) < 0);
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");

console.log("== dictionary parity");
ok(enKeys.length === arKeys.length, "same number of leaves (" + enKeys.length + " en, " + arKeys.length + " ar)");
ok(only(enKeys, arKeys).length === 0, "no key missing in Arabic" + (only(enKeys, arKeys).length ? ": " + only(enKeys, arKeys).join(", ") : ""));
ok(only(arKeys, enKeys).length === 0, "no key missing in English" + (only(arKeys, enKeys).length ? ": " + only(arKeys, enKeys).join(", ") : ""));
const arMap = new Map(ar);
let badType = [], badPh = [], junk = [];
for (const [k, v] of en) {
  if (typeof v !== "string" || !v.trim()) badType.push("en." + k);
  const a = arMap.get(k);
  if (typeof a !== "string" || !a.trim()) badType.push("ar." + k);
  if (placeholders(v) !== placeholders(a)) badPh.push(k + " (en {" + placeholders(v) + "} vs ar {" + placeholders(a) + "})");
  for (const [lang, s] of [["en", v], ["ar", a]]) if (/undefined|NaN|\[object|TODO|XXX|【|\?\?/.test(String(s))) junk.push(lang + "." + k);
}
ok(badType.length === 0, "every leaf is a non-empty string" + (badType.length ? ": " + badType.join(", ") : ""));
ok(badPh.length === 0, "same {placeholders} in both languages" + (badPh.length ? ": " + badPh.join("; ") : ""));
ok(junk.length === 0, "no junk tokens in strings" + (junk.length ? ": " + junk.join(", ") : ""));
// the only Arabic leaves that are legitimately Latin: the wordmark, the language
// toggle (written in the OTHER language), numbers, e-mail examples, acronyms
const LATIN_OK = ["nav.langLabel", "home.stats.0.value", "home.stats.1.value", "login.emailPh", "signup.emailPh",
  "ws.results.modeLive", "ws.results.f1", "ws.results.download", "ws.league.cols.kappa", "ws.map.scene.ndvi", "ws.map.scene.ndwi",
  "ws.map.geojson", "ws.results.run", "ws.results.kappa", "algo.labels.none"];
const latinOnly = ar.filter(([k, v]) => !/[\u0600-\u06FF]/.test(v)).map(([k, v]) => k + "=" + JSON.stringify(v));
ok(latinOnly.length === LATIN_OK.length && latinOnly.every((s) => LATIN_OK.indexOf(s.split("=")[0]) >= 0), "Arabic leaves contain Arabic, except the allow-list (" + latinOnly.join(", ") + ")");
const enArabic = en.filter(([k, v]) => /[\u0600-\u06FF]/.test(v) && k !== "nav.langLabel").map(([k]) => k);
ok(enArabic.length === 0 && /^[\u0600-\u06FF]+$/.test(I.dictionaries.en.nav.langLabel) && /^[A-Za-z]+$/.test(arMap.get("nav.langLabel")),
  "English leaves contain no Arabic; the toggle shows the other language's name (en UI: " + I.dictionaries.en.nav.langLabel + " / ar UI: " + arMap.get("nav.langLabel") + ")");
const counts = { en: en.reduce((s, l) => s + String(l[1]).length, 0), ar: ar.reduce((s, l) => s + String(l[1]).length, 0) };
ok(counts.en > 15000 && counts.ar > 12000, "dictionaries are substantial (" + counts.en + " / " + counts.ar + " characters)");

console.log("== domain data vs the engine's scheme file");
// the engine's 11 crop-type classes (must equal gee_src/scheme.json via data.js)
const SCHEME_CLASSES = D.SCHEMES.crops.classes;
ok(I.classesOf("crops").length === 11, "11 crop-type classes");
let clsOk = true;
for (const c of SCHEME_CLASSES) {
  const m = I.classById(c.id, "crops");
  if (!m || m.code !== c.code || m.en !== c.en || m.ar !== c.ar || m.color !== c.color || m.family !== c.family) { clsOk = false; console.log("    mismatch class", c.id, m); }
}
ok(clsOk, "crop class ids, codes, names, colours and families equal scheme.json");
ok(I.classesOf("general").length === 4 && I.classById(4, "general").en === "Cropland" && I.classById(1, "general").en === "Water", "4 land-cover classes");
let genOk = true;
for (const c of D.SCHEMES.general.classes) {
  const m = I.classById(c.id, "general");
  if (!m || m.code !== c.code || m.en !== c.en || m.ar !== c.ar || m.color !== c.color) { genOk = false; console.log("    general mismatch", c.id, m); }
}
ok(genOk, "land-cover classes equal scheme.json");

// strict seasonal filtering — the professor's rule
let actOk = true;
for (const family of ["winter", "summer", "full"]) {
  for (const scheme of ["crops", "general"]) {
    const ids = I.activeClassIds(scheme, family), ref = D.SCHEMES[scheme].active[family];
    if (ids.join(",") !== ref.join(",")) { actOk = false; console.log("    active mismatch", scheme, family, ids.join(","), "vs", ref.join(",")); }
  }
}
ok(actOk, "active class lists equal scheme.json for both levels and every family");
ok(I.activeClassIds("crops", "winter").join(",") === "1,3,4,5,6,7,9,10,11", "winter keeps 9 classes (370 train / 279 val points)");
ok(I.activeClassIds("crops", "summer").join(",") === "2,5,6,7,8,9,10,11", "summer keeps 8 classes (315 train / 247 val points)");
ok([2, 8].every((id) => I.activeClassIds("crops", "winter").indexOf(id) < 0), "winter strictly excludes Maize and Grapes");
ok([1, 3, 4].every((id) => I.activeClassIds("crops", "summer").indexOf(id) < 0), "summer strictly excludes Wheat, Sugar Beet and Potato");
ok(I.SCHEME_KEYS.join(",") === "general,crops" && I.DEFAULT_SCHEME === "general", "Level 1 (land cover) is the default scheme");

ok(I.ALGORITHMS.map((a) => a.key).join(",") === "rf,svm,cart,gtb,nb,mlp,knn,mindist_e,mindist_m,kmeans,signature", "11 algorithms in the engine's order");
ok(I.ALGORITHMS.filter((a) => a.group === "supervised").length === 9, "9 supervised algorithms");
ok(Object.keys(I.dictionaries.en.algo.names).length === 11 && Object.keys(I.dictionaries.en.algo.text).length === 11, "a name and a description for each algorithm");
for (const a of I.ALGORITHMS) {
  ok(!!I.dictionaries.en.algo.names[a.key] && !!I.dictionaries.ar.algo.names[a.key] && !!I.dictionaries.en.algo.text[a.key] && !!I.dictionaries.ar.algo.text[a.key], "texts exist for " + a.key);
  ok(a.params.every((p) => !!I.PARAMS[p] && !!I.dictionaries.en.ws.algorithm[p] && !!I.dictionaries.ar.ws.algorithm[p]), "parameters + labels for " + a.key + " (" + (a.params.join(",") || "none") + ")");
}
const def = I.defaults();
ok(def.rfTrees === 300 && def.knnK === 5 && def.kClusters === 8 && def.mlpHidden === 24 && def.mlpEpochs === 400 && def.cloudMax === 60, "defaults = engine defaults (300 / 5 / 8 / 24 / 400 / 60)");
for (const k in I.PARAMS) { const p = I.PARAMS[k]; ok(p.min <= p.def && p.def <= p.max && p.step > 0 && (p.def - p.min) % p.step === 0, k + " default inside its range and on a step"); }

// period presets — the same dates the engine's resolvePeriod() produces
const w = I.period("winter", 2026), oj = I.period("early_winter", 2026), fm = I.period("late_winter", 2026);
const s = I.period("summer", 2026), js = I.period("summer_peak", 2026), f = I.period("full", 2026);
ok(w.dateFrom === "2025-11-01" && w.dateTo === "2026-04-30", "winter 2026 = 2025-11-01 → 2026-04-30");
ok(oj.dateFrom === "2025-10-01" && oj.dateTo === "2026-01-31", "early winter 2026 = 2025-10-01 → 2026-01-31");
ok(fm.dateFrom === "2026-02-01" && fm.dateTo === "2026-05-31", "late winter 2026 = 2026-02-01 → 2026-05-31");
ok(s.dateFrom === "2026-05-01" && s.dateTo === "2026-10-31", "summer 2026 = 2026-05-01 → 2026-10-31");
ok(js.dateFrom === "2026-06-01" && js.dateTo === "2026-09-30", "summer peak 2026 = 2026-06-01 → 2026-09-30");
ok(f.dateFrom === "2026-01-01" && f.dateTo === "2026-12-31", "full 2026 = 2026-01-01 → 2026-12-31");
ok(I.YEARS.join(",") === "2026,2025,2024,2023,2022,2021" && I.DEFAULT_YEAR === 2026, "years 2021–2026, default 2026");
ok(I.period("custom", 2026, "2026-02-01", "2026-03-15").dateFrom === "2026-02-01", "custom range carries its own dates");
// season detection: winter = Nov–Apr months, summer = May–Oct; ties → the first month's family
ok(I.detectFamily("2026-01-15", "2026-03-20") === "winter", "custom Jan–Mar → winter");
ok(I.detectFamily("2026-06-01", "2026-09-30") === "summer", "Jun–Sep → summer");
ok(I.detectFamily("2026-03-10", "2026-08-20") === "summer", "Mar–Aug is dominated by summer months → summer");
ok(I.detectFamily("2026-11-01", "2026-04-30") === "winter", "Nov–Apr → winter");
ok(I.seasonFamily("early_winter") === "winter" && I.seasonFamily("summer_peak") === "summer" && I.seasonFamily("full") === "full", "presets carry their family");

// signature statistics measured at the reference points (3 chart values per class)
ok(D.FEATURES.length === 9 && D.FEATURES[0] === "NDVI_p10" && D.FEATURES[8] === "B12_median", "9 signature features from the engine file");
ok(Object.keys(D.SCHEMES.crops.signatures.winter).length === 9, "winter signatures exist for the 9 active crop classes");
ok(Object.keys(D.SCHEMES.crops.signatures.summer).length === 8, "summer signatures exist for the 8 active crop classes");
ok(Object.keys(D.SCHEMES.general.signatures.winter).length === 4, "land-cover signatures exist for the 4 classes");
const sigW = D.SCHEMES.crops.signatures.winter["1"];
ok(Array.isArray(sigW) && sigW.length === 3 && sigW.every((v) => typeof v === "number" && isFinite(v)), "a signature = [mean, p10, p90] numbers");
ok(D.REFERENCE_POINTS && D.REFERENCE_POINTS.n === 795 && Array.isArray(D.REFERENCE_POINTS.points) && D.REFERENCE_POINTS.points.length === 795, "795 built-in reference points (455 train + 340 validation)");
ok(D.REFERENCE_POINTS.points.every((p) => Array.isArray(p) && p.length === 4 && isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2]) && (p[3] === "train" || p[3] === "validation")), "each reference point = [classId, lon, lat, role]");
ok(D.REFERENCE_POINTS.points.filter((p) => p[3] === "train").length === 455 && D.REFERENCE_POINTS.points.filter((p) => p[3] === "validation").length === 340, "roles split exactly 455 / 340");
ok(D.SCHEME_VERSION === 6, "SCHEME_VERSION 6 (stale cached runs miss)");
ok(D.BOURJ.ring.length > 50 && D.BOURJ.ring[0][0] === D.BOURJ.ring[D.BOURJ.ring.length - 1][0], "built-in Borj El Arab boundary is a closed ring (" + D.BOURJ.ring.length + " vertices)");
ok(Math.abs(D.BOURJ.areaM2 / 4200 - 141841.261) < 0.01, "Borj El Arab sample boundary = " + (D.BOURJ.areaM2 / 4200).toFixed(3) + " feddan");

console.log("== formatting and lookup");
ok(I.fmt(141849.239, 2) === "141,849.24", "fmt 141,849.24");
ok(I.fmt(238.095238, 3) === "238.095", "fmt 238.095");
ok(I.fmt(0.5, 2) === "0.50" && I.fmt(0, 0) === "0" && I.fmt(1234567.891, 1) === "1,234,567.9", "fmt small, zero and large values");
ok(I.fmt(NaN) === "—" && I.fmt(null) === "—" && I.fmt(undefined, 2) === "—" && I.fmt(Infinity) === "—", "fmt of non-numbers → em dash");
ok(I.lang() === "ar" && I.dir() === "rtl", "Arabic is the default (rtl) with no stored preference");
ok(I.t("ws.run") === "شغّل التصنيف", "t() reads Arabic by default");
ok(I.setLang("en") === "en" && I.dir() === "ltr" && I.t("ws.run") === "Run classification", "switch to English (ltr)");
ok(I.t("ws.upload.features", { n: 5 }) === "5 features" && I.t("ws.season.badgeActive", { n: 9, points: 294 }) === "9 active classes · 294 points", "placeholders replaced");
ok(I.t("does.not.exist") === "does.not.exist", "a missing key returns its path (visible in tests, never silent)");
ok(I.unit(141849.239, "feddan", 2) === "141,849.24 feddan", "unit(): " + I.unit(141849.239, "feddan", 2));
I.setLang("ar");
ok(I.unit(141849.239, "feddan", 2) === "141,849.24 فدان", "unit() in Arabic: " + I.unit(141849.239, "feddan", 2));
ok(I.t("home.slides").length === 5 && I.t("home.product.items").length === 4 && I.t("home.features.items").length === 4 && I.t("home.steps.items").length === 4, "5 slides, 4 outputs, 4 features, 4 steps");
ok(I.t("guide.steps").length === 6 && I.t("guide.faq").length >= 6, "6 guide steps and " + I.t("guide.faq").length + " questions");
ok(I.t("algo.protocol.items").length === 5, "5 pipeline-protocol items");
for (const code of ["ZIP_BROKEN", "ZIP64", "ZIP_UNSUPPORTED", "DBF_BROKEN", "DBF_MISSING", "SHP_BROKEN", "SHP_MISSING", "PRJ_MISSING", "PRJ_UNSUPPORTED", "CSV_EMPTY", "CSV_COLUMNS", "NO_POLYGONS", "NOT_SHAPEFILE", "BAD_GEOJSON", "UNSUPPORTED_CRS", "EMAIL_TAKEN", "BAD_CREDENTIALS", "STORAGE", "BACKEND_TIMEOUT", "gee_not_configured", "no_images", "mahalanobis_needs_samples"])
  ok(!!I.dictionaries.en.errors[code] && !!I.dictionaries.ar.errors[code], "error text for " + code);
for (const code of ["preview", "no_accuracy", "kmeans_no_accuracy", "instant_estimate", "samples_far", "season_detected", "weak_accuracy", "builtin_training", "manual_training"])
  ok(!!I.dictionaries.en.ws.notes[code] && !!I.dictionaries.ar.ws.notes[code], "note text for " + code);

console.log("\n" + pass + " passed, " + fails.length + " failed" + (fails.length ? "\n  " + fails.join("\n  ") : ""));
process.exit(fails.length ? 1 : 0);
