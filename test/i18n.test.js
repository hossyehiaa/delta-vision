#!/usr/bin/env node
/*
 * i18n.test.js — Arabic/English dictionary parity, and the domain data (classes, algorithms,
 * parameter defaults, periods) against the engine's own values.
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
// the only Arabic leaves that are legitimately Latin: the wordmark, the language toggle (always written in the
// OTHER language), two numbers, two e-mail examples, a product name
const LATIN_OK = ["brand.name", "nav.langLabel", "home.stats.0.value", "home.stats.1.value", "login.emailPh", "signup.emailPh", "ws.results.modeLive", "ws.results.pa", "ws.results.ua", "ws.results.f1", "ws.results.download", "ws.map.scene.ndvi", "ws.map.scene.ndwi"];
const latinOnly = ar.filter(([, v]) => !/[\u0600-\u06FF]/.test(v)).map(([k, v]) => k + "=" + JSON.stringify(v));
ok(latinOnly.length === LATIN_OK.length && latinOnly.every((s) => LATIN_OK.indexOf(s.split("=")[0]) >= 0), "Arabic leaves contain Arabic, except the allow-list (" + latinOnly.join(", ") + ")");
const enArabic = en.filter(([k, v]) => /[\u0600-\u06FF]/.test(v) && k !== "nav.langLabel").map(([k]) => k);
ok(enArabic.length === 0 && /^[\u0600-\u06FF]+$/.test(I.dictionaries.en.nav.langLabel) && /^[A-Za-z]+$/.test(arMap.get("nav.langLabel")),
  "English leaves contain no Arabic; the toggle shows the other language's name (en UI: " + I.dictionaries.en.nav.langLabel + " / ar UI: " + arMap.get("nav.langLabel") + ")");
const counts = { en: en.reduce((s, l) => s + l[1].length, 0), ar: ar.reduce((s, l) => s + l[1].length, 0) };
ok(counts.en > 15000 && counts.ar > 12000, "dictionaries are substantial (" + counts.en + " / " + counts.ar + " characters)");

console.log("== domain data vs the engine");
const ENGINE_CLASSES = [
  [1, "WHT", "Wheat", "قمح", "#ffff00"], [2, "MZE", "Maize", "ذرة", "#00ff00"], [3, "RIC", "Rice", "أرز", "#00ffff"],
  [4, "CLV", "Clover", "برسيم", "#008000"], [5, "POT", "Potato", "بطاطس", "#b5651d"], [6, "BET", "Sugar Beet", "بنجر السكر", "#ff69b4"],
  [7, "FBA", "Faba Bean", "فول", "#800080"], [8, "SUN", "Sunflower", "عباد الشمس", "#ff8c00"], [9, "ORC", "Orchards", "بساتين", "#808000"],
  [10, "FLW", "Fallow", "أرض بور", "#808080"], [11, "URB", "Urban", "عمران", "#ff0000"], [12, "WTR", "Water", "مياه", "#0000ff"]
];
ok(I.CLASSES.length === 12, "12 classes");
let clsOk = true;
for (const [id, code, enName, arName, color] of ENGINE_CLASSES) {
  const c = I.classById(id);
  if (!c || c.code !== code || c.en !== enName || c.ar !== arName || c.color !== color) { clsOk = false; console.log("    mismatch class " + id, c); }
}
ok(clsOk, "class ids, codes, names and colours equal the engine's CLASSES");
let prOk = true, actOk = true;
for (const season of ["winter", "summer"]) {
  for (const c of I.CLASSES) {
    if (c.prior[season] !== (D.PRIORS[season][c.id] || 0)) { prOk = false; console.log("    prior mismatch", season, c.id, c.prior[season], D.PRIORS[season][c.id]); }
  }
  const ids = I.activeClasses(season).map((c) => c.id), ref = D.ACTIVE[season];
  if (ids.join(",") !== ref.join(",")) { actOk = false; console.log("    active mismatch", season, ids.join(","), "vs", ref.join(",")); }
}
ok(prOk, "prevalence priors equal the engine's SIG_PRIORS");
ok(actOk, "active classes per season equal ACTIVE_SIGNATURE_CLASSES");
ok(I.activeClasses("full").map((c) => c.id).join(",") === D.ACTIVE.full.join(","), "all 12 classes active in the full year");
ok(I.ALGORITHMS.map((a) => a.key).join(",") === "rf,svm,cart,gtb,nb,mlp,knn,mindist_e,mindist_m,kmeans,signature", "11 algorithms in the engine's order");
ok(I.ALGORITHMS.filter((a) => a.group === "supervised").length === 9, "9 supervised algorithms");
ok(Object.keys(I.dictionaries.en.algo.names).length === 11 && Object.keys(I.dictionaries.en.algo.text).length === 11, "a name and a description for each algorithm");
for (const a of I.ALGORITHMS) {
  ok(!!I.dictionaries.en.algo.names[a.key] && !!I.dictionaries.ar.algo.names[a.key] && !!I.dictionaries.en.algo.text[a.key] && !!I.dictionaries.ar.algo.text[a.key], "texts exist for " + a.key);
  ok(a.params.every((p) => !!I.PARAMS[p] && !!I.dictionaries.en.ws.algorithm[p] && !!I.dictionaries.ar.ws.algorithm[p]), "parameters + labels for " + a.key + " (" + (a.params.join(",") || "none") + ")");
}
const def = I.defaults();
ok(def.rfTrees === 100 && def.knnK === 5 && def.kClusters === 8 && def.mlpHidden === 24 && def.mlpEpochs === 400 && def.cloudMax === 60, "defaults = engine defaults (100 / 5 / 8 / 24 / 400 / 60)");
for (const k in I.PARAMS) { const p = I.PARAMS[k]; ok(p.min <= p.def && p.def <= p.max && p.step > 0 && (p.def - p.min) % p.step === 0, k + " default inside its range and on a step"); }
const w = I.period("winter", 2025), s = I.period("summer", 2025), f = I.period("full", 2025), d = I.period("winter");
ok(w.dateFrom === "2024-11-01" && w.dateTo === "2025-04-30", "winter 2025 = 2024-11-01 → 2025-04-30");
ok(s.dateFrom === "2025-05-01" && s.dateTo === "2025-10-31", "summer 2025 = 2025-05-01 → 2025-10-31");
ok(f.dateFrom === "2025-01-01" && f.dateTo === "2025-12-31", "full 2025 = 2025-01-01 → 2025-12-31");
ok(d.dateFrom === "2024-11-01", "default year 2025");
ok(D.FEATURES.length === 9 && D.FEATURES[0] === "NDVI_mean" && D.FEATURES[8] === "B12_median", "9 signature features from the engine file");
ok(Object.keys(D.SIGNATURES.winter).length === 12 && D.SIGNATURES.winter[1].length === 9 && Math.abs(D.SIGNATURES.winter[1][0] - 0.52) < 1e-12, "winter signatures: 12 classes × 9 features");
ok(D.BOURJ.ring.length > 50 && D.BOURJ.ring[0][0] === D.BOURJ.ring[D.BOURJ.ring.length - 1][0], "built-in Borj El Arab boundary is a closed ring (" + D.BOURJ.ring.length + " vertices)");
ok(Math.abs(D.BOURJ.areaM2 / 4200 - 141841.261) < 0.01, "Borj El Arab sample boundary = " + (D.BOURJ.areaM2 / 4200).toFixed(3) + " feddan");

console.log("== formatting and lookup");
ok(I.fmt(141849.239, 2) === "141,849.24", "fmt 141,849.24");
ok(I.fmt(238.095238, 3) === "238.095", "fmt 238.095");
ok(I.fmt(0.5, 2) === "0.50" && I.fmt(0, 0) === "0" && I.fmt(1234567.891, 1) === "1,234,567.9", "fmt small, zero and large values");
ok(I.fmt(NaN) === "—" && I.fmt(null) === "—" && I.fmt(undefined, 2) === "—" && I.fmt(Infinity) === "—", "fmt of non-numbers → em dash");
ok(I.lang() === "ar" && I.dir() === "rtl", "Arabic is the default (rtl) with no stored preference");
ok(I.t("ws.run") === "صنّف", "t() reads Arabic by default");
ok(I.setLang("en") === "en" && I.dir() === "ltr" && I.t("ws.run") === "Classify", "switch to English (ltr)");
ok(I.t("ws.upload.features", { n: 5 }) === "5 features" && I.t("ws.results.ofMany", { n: 20, total: 340 }) === "Showing the first 20 of 340 parcels.", "placeholders replaced");
ok(I.t("does.not.exist") === "does.not.exist", "a missing key returns its path (visible in tests, never silent)");
ok(I.unit(141849.239, "feddan", 2) === "141,849.24 feddan", "unit(): " + I.unit(141849.239, "feddan", 2));
I.setLang("ar");
ok(I.unit(141849.239, "feddan", 2) === "141,849.24 فدان", "unit() in Arabic: " + I.unit(141849.239, "feddan", 2));
ok(I.t("home.slides").length === 5 && I.t("home.product.items").length === 4 && I.t("home.features.items").length === 4 && I.t("home.steps.items").length === 4, "5 slides, 4 outputs, 4 features, 4 steps");
ok(I.t("guide.steps").length === 6 && I.t("guide.faq").length >= 6, "6 guide steps and " + I.t("guide.faq").length + " questions");
ok(I.t("algo.protocol.items").length === 5, "5 training-protocol items");
for (const code of ["ZIP_BROKEN", "ZIP64", "ZIP_UNSUPPORTED", "DBF_BROKEN", "SHP_BROKEN", "SHP_MISSING", "PRJ_MISSING", "PRJ_UNSUPPORTED", "CSV_EMPTY", "CSV_COLUMNS", "NO_POLYGONS", "EMAIL_TAKEN", "BAD_CREDENTIALS", "STORAGE"])
  ok(!!I.dictionaries.en.errors[code] && !!I.dictionaries.ar.errors[code], "error text for " + code);
for (const code of ["preview", "no_accuracy", "kmeans_no_accuracy", "instant_estimate", "auto_sample_failed"])
  ok(!!I.dictionaries.en.ws.notes[code] && !!I.dictionaries.ar.ws.notes[code], "note text for " + code);

console.log("\n" + pass + " passed, " + fails.length + " failed" + (fails.length ? "\n  " + fails.join("\n  ") : ""));
process.exit(fails.length ? 1 : 0);
