#!/usr/bin/env node
/*
 * geo.test.js — checks src/geo.js against values computed independently with pyproj / geopandas.
 *
 *   PROJ4_PATH=/path/proj4.js node geo.test.js <geo.js> <fixturesDir> <bourj_reference.json>
 */
"use strict";
const fs = require("fs"), path = require("path");
const G = require(path.resolve(process.argv[2]));
const FIX = path.resolve(process.argv[3]);
const BO = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
const REF = JSON.parse(fs.readFileSync(path.join(FIX, "geo_reference.json"), "utf8"));

let pass = 0, fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fails.push(name); console.log("  FAIL " + name + (extra ? "  → " + extra : "")); }
}
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const buf = (p) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const u8 = (p) => new Uint8Array(fs.readFileSync(p));
const distDeg = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(b[1] * Math.PI / 180), a[1] - b[1]) * 111320;
const F = (n) => path.join(FIX, "synth", n);

const CLASSES = [
  { id: 1, prior: { winter: 0.95, summer: 0 } }, { id: 2, prior: { winter: 0, summer: 0.9 } }, { id: 3, prior: { winter: 0, summer: 0.6 } },
  { id: 4, prior: { winter: 0.85, summer: 0.3 } }, { id: 5, prior: { winter: 0.3, summer: 0.35 } }, { id: 6, prior: { winter: 0.55, summer: 0 } },
  { id: 7, prior: { winter: 0.35, summer: 0 } }, { id: 8, prior: { winter: 0, summer: 0.5 } }, { id: 9, prior: { winter: 0.65, summer: 0.65 } },
  { id: 10, prior: { winter: 0.85, summer: 0.85 } }, { id: 11, prior: { winter: 0.5, summer: 0.5 } }, { id: 12, prior: { winter: 0.45, summer: 0.45 } },
];

(async () => {
  console.log("== 1. ZIP reader");
  for (const z of ["bourj_deflate.zip", "bourj_store.zip"]) {
    const entries = await G.readZip(buf(path.join(FIX, z)));
    const names = entries.map((e) => e.name);
    ok(REF.zip_entries.every((n) => names.includes(n)) && names.includes("__MACOSX/._Bourj_Elarab.shp") && names.includes("readme.txt"),
      z + ": " + names.length + " entries incl. junk");
    const shp = entries.find((e) => e.name.endsWith(".shp") && !e.name.includes("._"));
    const orig = fs.readFileSync(path.join(process.argv[5], "Bourj_Elarab.shp"));
    ok(shp && shp.data.length === orig.length && Buffer.from(shp.data).equals(orig), z + ": .shp bytes identical to source (" + orig.length + " B)");
    const prj = entries.find((e) => e.name.endsWith(".prj"));
    ok(prj && G.readPrj(new TextDecoder().decode(prj.data)).name === "UTM_Zone_35N", z + ": .prj decodes");
  }
  let err = null; try { await G.readZip(new ArrayBuffer(64)); } catch (e) { err = e; }
  ok(err && err.code === "ZIP_BROKEN", "truncated zip → ZIP_BROKEN");

  console.log("== 2. SHP / DBF / PRJ on the real Borj El Arab layer");
  const shp = G.parseShp(buf(path.join(process.argv[5], "Bourj_Elarab.shp")));
  ok(shp.shapes.length === 1 && shp.shapes[0].type === 5 && shp.shapes[0].parts.length === 1, "parseShp: 1 polygon shape, 1 part");
  const pts = shp.shapes[0].parts[0];
  const RING = JSON.parse(fs.readFileSync(path.join(path.dirname(path.resolve(process.argv[4])), "bourj_ring_count.json"), "utf8"));
  ok(pts.length === RING.exterior_coords[0] && Math.abs(pts[0][0] - BO.sample_xy[0]) < 1e-6 && Math.abs(pts[0][1] - BO.sample_xy[1]) < 1e-6,
    "parseShp: " + pts.length + " vertices (geopandas: " + RING.exterior_coords[0] + "), first vertex " + pts[0].map((v) => v.toFixed(3)));
  const dbf = G.parseDbf(u8(path.join(process.argv[5], "Bourj_Elarab.dbf")), "utf-8");
  ok(JSON.stringify(dbf.fields.map((f) => f.name)) === JSON.stringify(BO.columns), "parseDbf: 9 field names match geopandas");
  ok(dbf.records.length === 1 && dbf.records[0][2] === BO.attrs[0][2] && dbf.records[0][3] === BO.attrs[0][3],
    "parseDbf: gov_name = " + dbf.records[0][2] + ", gov_code = " + dbf.records[0][3]);
  ok(dbf.records[0][8] === 596200384.661, "parseDbf: numeric Shape_Area = " + dbf.records[0][8]);
  const cpg = fs.readFileSync(path.join(process.argv[5], "Bourj_Elarab.cpg"), "utf8");
  ok(G.detectEncoding(cpg, u8(path.join(process.argv[5], "Bourj_Elarab.dbf"))) === "utf-8", "detectEncoding(.cpg=" + JSON.stringify(cpg.trim()) + ") → utf-8");
  const prj = G.readPrj(BO.prj);
  ok(prj.kind === "projected" && prj.name === "UTM_Zone_35N" && prj.wgs84 === true && prj.datumWarning === false, "readPrj: " + prj.kind + " / " + prj.name + " / WGS84");
  const ll = prj.toLonLat(BO.sample_xy);
  const d = distDeg(ll, BO.sample_lonlat);
  ok(d < 0.05, "prj → lon/lat matches pyproj to " + (d * 1000).toFixed(3) + " m");

  console.log("== 3. Full layer: area in m² and feddan");
  const set = G.parseShapefileSet({
    shp: u8(path.join(process.argv[5], "Bourj_Elarab.shp")), dbf: u8(path.join(process.argv[5], "Bourj_Elarab.dbf")),
    prj: u8(path.join(process.argv[5], "Bourj_Elarab.prj")), cpg: u8(path.join(process.argv[5], "Bourj_Elarab.cpg")),
  }, { layerName: "bourj" });
  console.log("     area  js = " + set.areaM2.toFixed(3) + " m²   pyproj = " + BO.total_geodesic_m2.toFixed(3) + " m²   (" + (rel(set.areaM2, BO.total_geodesic_m2) * 1e6).toFixed(2) + " ppm)");
  console.log("     feddan js = " + G.m2ToFeddan(set.areaM2).toFixed(3) + "   km² = " + G.m2ToKm2(set.areaM2).toFixed(4) + "   UTM planar = " + G.m2ToFeddan(BO.planar_area_m2[0]).toFixed(3) + " feddan");
  ok(rel(set.areaM2, BO.total_geodesic_m2) < 1e-5, "geodesic area within 10 ppm of pyproj");
  ok(set.nFeatures === 1 && set.featureCollection.features[0].geometry.type === "Polygon" && set.warnings.length === 0, "1 Polygon feature, no warnings");
  ok(set.nameField === "gov_name" || set.nameField === "qesm_name", "nameField = " + set.nameField);
  const bb = G.collectionBbox(set.featureCollection);
  const bd = Math.max(...bb.map((v, i) => Math.abs(v - BO.lonlat_bounds[i])));
  ok(bd < 1e-6, "lon/lat bounds match pyproj to " + (bd * 1e9).toFixed(1) + "e-9°");
  const fed = G.m2ToFeddan(set.areaM2);
  ok(G.FEDDAN_PER_KM2 === 1e6 / 4200 && Math.abs(G.m2ToKm2(set.areaM2) * G.FEDDAN_PER_KM2 - fed) < 1e-6, "feddan ↔ km² conversions consistent (238.095 per km²)");

  console.log("== 4. loadShapefiles: zip and loose files give the same result");
  const fake = (p, name) => ({ name: name || path.basename(p), arrayBuffer: async () => buf(p) });
  const viaZip = await G.loadShapefiles([fake(path.join(FIX, "bourj_deflate.zip"))]);
  const viaStore = await G.loadShapefiles([fake(path.join(FIX, "bourj_store.zip"))]);
  const dir = process.argv[5];
  const looseNames = fs.readdirSync(dir).filter((n) => /\.(shp|dbf|prj|cpg)$/i.test(n));
  const viaLoose = await G.loadShapefiles(looseNames.map((n) => fake(path.join(dir, n))));
  for (const [lbl, r] of [["deflate zip", viaZip], ["store zip", viaStore], ["loose files", viaLoose]]) {
    ok(r.layerName === "bourj_elarab" && Math.abs(r.areaM2 - set.areaM2) < 1 && r.nFeatures === 1 && r.dbf.records[0][2] === BO.attrs[0][2],
      lbl + ": layer " + r.layerName + ", " + G.m2ToFeddan(r.areaM2).toFixed(3) + " feddan, Arabic attributes intact");
  }
  ok(Array.isArray(viaZip.otherLayers) && viaZip.otherLayers.length === 0, "junk entries ignored, no phantom layers: " + JSON.stringify(viaZip.otherLayers));
  err = null; try { await G.loadShapefiles([fake(F("lines.dbf"))]); } catch (e) { err = e; }
  ok(err && err.code === "SHP_MISSING", "dbf without shp → SHP_MISSING");

  console.log("== 5. Synthetic layer: donut, multi-polygon with island, CW/CCW, Windows-1256");
  const parcels = await G.loadShapefiles(["shp", "dbf", "prj", "cpg"].map((e) => fake(F("parcels." + e))));
  ok(parcels.nFeatures === 3 && JSON.stringify(parcels.geometryTypes) === JSON.stringify(["Polygon", "MultiPolygon"]), "3 features: " + parcels.geometryTypes.join(", "));
  const feats = parcels.featureCollection.features;
  const f0 = feats[0].geometry, f1 = feats[1].geometry, f2 = feats[2].geometry;
  ok(f0.type === "Polygon" && f0.coordinates.length === 2, "feature 1 = Polygon with 1 hole (CCW shell / CW hole in file)");
  ok(f1.type === "MultiPolygon" && f1.coordinates.length === 3 && f1.coordinates[0].length === 2 && f1.coordinates[1].length === 1 && f1.coordinates[2].length === 1,
    "feature 2 = MultiPolygon: [shell+hole], [island], [shell] — " + f1.coordinates.length + " polygons, hole kept with its shell");
  for (const [i, g] of [[0, f0], [1, f1], [2, f2]]) {
    const a = G.geometryAreaM2(g);
    console.log("     feature " + (i + 1) + ": js " + a.toFixed(2) + " m²   pyproj " + REF.parcels.areas_m2[i].toFixed(2) + " m²   (" + (rel(a, REF.parcels.areas_m2[i]) * 1e6).toFixed(1) + " ppm)");
    ok(rel(a, REF.parcels.areas_m2[i]) < 1e-5, "feature " + (i + 1) + " area within 10 ppm");
  }
  const sum = G.geometryAreaM2(f0) + G.geometryAreaM2(f1) + G.geometryAreaM2(f2);
  ok(rel(parcels.areaM2, sum) < 1e-9 && rel(parcels.areaM2, REF.parcels.areas_m2.reduce((a, b) => a + b, 0)) < 1e-5,
    "layer areaM2 = Σ features (" + G.m2ToFeddan(parcels.areaM2).toFixed(4) + " feddan)");
  // island inside a hole: geometryAreaM2 must ADD the island back (depth 2)
  const donut = 800 * 800 - 400 * 400, island = 100 * 100, sep = 300 * 300;
  ok(Math.abs(G.geometryAreaM2(f1) / (donut + island + sep) - 1) < 0.002, "island counted, hole subtracted (ratio to planar " + (G.geometryAreaM2(f1) / (donut + island + sep)).toFixed(5) + ")");
  ok(Math.abs(G.geometryAreaM2(f0) / (1000 * 1000 - 200 * 200) - 1) < 0.002, "donut = 1 km² − 200 m hole (ratio " + (G.geometryAreaM2(f0) / 960000).toFixed(5) + ")");
  ok(parcels.dbf.encoding === "windows-1256" && parcels.dbf.records[0][1] === "حقل القمح الشتوي" && parcels.dbf.records[1][1] === "أرض برسيم وبور",
    "Windows-1256 decoded: " + parcels.dbf.records[0][1]);
  ok(parcels.dbf.fields[2].type === "N" && parcels.dbf.records[2][2] === 0.09 && parcels.dbf.records[0][2] === 96, "numeric field with decimals: " + parcels.dbf.records[2][2]);
  ok(parcels.nameField === "name_ar", "nameField = " + parcels.nameField);
  // orientation independence: walk every ring the other way round → same area
  const rev = (g) => JSON.parse(JSON.stringify(g, (k, v) => (Array.isArray(v) && v.length && Array.isArray(v[0]) && typeof v[0][0] === "number" ? v.slice().reverse() : v)));
  ok(Math.abs(G.geometryAreaM2(rev(f1)) - G.geometryAreaM2(f1)) < 1e-6, "reversed ring order → identical area");

  console.log("== 6. Lines, points, Z / M shapes without .prj");
  const lines = await G.loadShapefiles(["shp", "dbf", "prj", "cpg"].map((e) => fake(F("lines." + e))));
  ok(lines.nFeatures === 2 && lines.featureCollection.features[0].geometry.type === "MultiLineString" && lines.featureCollection.features[1].geometry.type === "LineString" && lines.areaM2 === 0,
    "lines: MultiLineString + LineString, area 0");
  const points = await G.loadShapefiles(["shp", "dbf", "prj", "cpg"].map((e) => fake(F("points." + e))));
  const p0 = points.featureCollection.features[0].geometry.coordinates;
  ok(points.nFeatures === 3 && points.featureCollection.features[0].geometry.type === "Point" && distDeg(p0, REF.points.first_lonlat) < 1e-6, "points: 3 Points, first matches pyproj");
  const polyz = await G.loadShapefiles([fake(F("polyz.shp"))]);
  ok(polyz.declaredType === 15 && polyz.nFeatures === 1 && polyz.warnings.includes("PRJ_MISSING_LATLON") && polyz.featureCollection.features[0].geometry.coordinates[0].length === 5,
    "PolygonZ (type 15) parsed, taken as lon/lat with PRJ_MISSING_LATLON");
  ok(rel(polyz.areaM2, REF.polyz.area_m2) < 1e-5, "PolygonZ area within 10 ppm");
  const linem = await G.loadShapefiles([fake(F("linem.shp"))]);
  ok(linem.declaredType === 23 && linem.featureCollection.features[0].geometry.type === "LineString" && linem.featureCollection.features[0].geometry.coordinates.length === 3, "PolylineM (type 23) parsed");
  err = null; try { G.parseShapefileSet({ shp: u8(F("parcels.shp")) }, {}); } catch (e) { err = e; }
  ok(err && err.code === "PRJ_MISSING", "UTM coordinates without .prj → PRJ_MISSING (never guessed)");

  console.log("== 7. Geodesic area vs pyproj.Geod on large polygons");
  for (const [i, b] of REF.big.entries()) {
    const a = G.ringAreaM2(b.ring), r = rel(a, b.area_m2);
    console.log("     polygon " + (i + 1) + ": js " + (a / 1e9).toFixed(6) + " ×10⁹ m²   pyproj " + (b.area_m2 / 1e9).toFixed(6) + " ×10⁹   (" + (r * 1e6).toFixed(1) + " ppm)");
    ok(r < 1e-5, "polygon " + (i + 1) + " within 10 ppm");
  }
  ok(Math.abs(G.ringAreaM2(REF.sq1km.ring) - REF.sq1km.area_m2) / REF.sq1km.area_m2 < 1e-5, "1 km UTM square: " + G.ringAreaM2(REF.sq1km.ring).toFixed(2) + " m²");
  // triangle with a known spherical area (l'Huilier) — independent closed form on the authalic sphere
  const tri = [[0, 0], [10, 0], [0, 10], [0, 0]].map(([x, y]) => [x, y]);
  ok(G.ringAreaM2(tri) > 0 && Math.abs(G.ringAreaM2(tri) / (0.5 * 10 * 10 * 111.32e3 * 111.32e3 * 0.985) - 1) < 0.03, "right triangle area sane: " + (G.ringAreaM2(tri) / 1e9).toFixed(3) + " ×10⁹ m²");
  ok(G.R_AUTH > 6371007 && G.R_AUTH < 6371008, "authalic radius " + G.R_AUTH.toFixed(3) + " m (IUGG 6371007.181)");

  console.log("== 8. WKT variants (vs pyproj / PROJ)");
  const REFDIR = path.dirname(path.resolve(process.argv[4]));
  const hasTow = (t) => /TOWGS84\s*\[/i.test(t);
  for (const w of REF.wkt) {
    const info = G.readPrj(w.wkt);
    let msg = "unsupported", dd = Infinity;
    if (info.toLonLat) { const p = info.toLonLat([w.x, w.y]); dd = distDeg(p, [w.lon, w.lat]); msg = dd.toFixed(2) + " m"; }
    // tolerance in metres: exact for WGS 84; ~2× the EPSG accuracy for old datums; loose when a shift is in the file
    const tol = info.wgs84 ? 0.05 : info.datumAccuracyM ? info.datumAccuracyM * 2 : hasTow(w.wkt) ? 5 : 500;
    console.log("     EPSG " + String(w.epsg).padEnd(5) + w.variant.padEnd(4) + " → " + msg + "  [" + info.kind + (info.epsg ? " EPSG:" + info.epsg : "") + (info.datumAccuracyM ? " shift ±" + info.datumAccuracyM + " m" : "") + (info.datumWarning ? " DATUM WARNING" : "") + "]");
    ok(dd < tol, "EPSG " + w.epsg + " " + w.variant);
    ok(String(info.epsg) === String(w.variant === "esri" ? null : w.epsg), "EPSG " + w.epsg + " " + w.variant + ": code " + info.epsg + " read from the WKT");
  }
  console.log("== 8b. WKT2 files (proj4js cannot read them) → EPSG code table, checked against PROJ");
  const EG = JSON.parse(fs.readFileSync(path.join(REFDIR, "epsg_egypt_proj4.json"), "utf8"));
  for (const code of Object.keys(EG)) {
    const e = EG[code], datum = +code >= 22991 && +code <= 22994 ? "Egypt 1907" : +code >= 23034 && +code <= 23037 ? "European_Datum_1950" : "World Geodetic System 1984";
    const wkt2 = 'PROJCRS["t",BASEGEOGCRS["b",DATUM["' + datum + '",ELLIPSOID["e",6378137,298.257223563,LENGTHUNIT["metre",1]]],PRIMEM["Greenwich",0]],CONVERSION["c",METHOD["Transverse Mercator"]],CS[Cartesian,2],ID["EPSG",' + code + "]]";
    const info = G.readPrj(wkt2);
    const p = info.toLonLat ? info.toLonLat([e.x, e.y]) : null, dd = p ? distDeg(p, [e.lon, e.lat]) : Infinity;
    console.log("     EPSG " + code.padEnd(5) + e.name.padEnd(34) + " → " + (p ? dd.toFixed(3) + " m" : "UNSUPPORTED " + info.error) + (info.datumWarning ? "  [datum warning]" : ""));
    ok(info.kind === "projected" && dd < (e.accuracy_m ? e.accuracy_m * 2 + 0.05 : 0.05), "EPSG:" + code + " via WKT2 fallback");
    if (e.accuracy_m) ok(info.datumAccuracyM === e.accuracy_m && info.datumWarning === false, "EPSG:" + code + " old datum: official shift applied, accuracy reported");
    else ok(info.wgs84 === true, "EPSG:" + code + " recognised as WGS 84");
  }

  console.log("== 9. Samples CSV");
  const resolve = (c) => ({ WHT: 1, MZE: 2, RIC: 3, CLV: 4, POT: 5, BET: 6, FBA: 7, SUN: 8, ORC: 9, FLW: 10, URB: 11, WTR: 12 })[c] || (Number(c) >= 1 && Number(c) <= 12 ? Number(c) : null);
  const csv = "\uFEFFlon,lat,class\n29.60,30.87,WHT\n\"29.61\",\"30.88\",RIC\n29.62,30.89,11\n,,WHT\n29.63,30.9,banana\n";
  const s = G.parseSamplesCsv(csv, resolve);
  ok(s.samples.length === 3 && s.skipped === 2 && s.samples[0].classId === 1 && s.samples[2].classId === 11 && s.header.length === 3, "header + BOM + quoted cells: 3 kept, 2 skipped");
  const s3 = G.parseSamplesCsv("29.6,30.87,4\n29.7,30.9,CLV\n", resolve);
  ok(s3.samples.length === 2 && s3.samples[0].classId === 4 && s3.samples[1].classId === 4 && s3.header.length === 0, "no header, class as id and as code");
  const s4 = G.parseSamplesCsv("Longitude,Latitude,crop\n29.6,30.87,WHT\n", resolve);
  ok(s4.samples.length === 1 && s4.samples[0].classId === 1, "column aliases Longitude/Latitude/crop");
  err = null; try { G.parseSamplesCsv("a,b\n1,2\n", resolve); } catch (e) { err = e; }
  ok(err && err.code === "CSV_COLUMNS", "missing class column → CSV_COLUMNS");
  err = null; try { G.parseSamplesCsv("", resolve); } catch (e) { err = e; }
  ok(err && err.code === "CSV_EMPTY", "empty file → CSV_EMPTY");

  console.log("== 10. Preview grid");
  for (const season of ["winter", "summer", "full"]) {
    const grid = G.buildPreviewGrid(set.featureCollection, CLASSES, season, 42);
    const shares = G.previewShares(grid);
    const gridArea = G.gridAreaM2(grid);
    console.log("     " + season.padEnd(6) + " " + grid.n + "×" + grid.m + " cells, " + grid.totalCells + " classified, " + shares.length + " classes, grid area " + G.m2ToFeddan(gridArea).toFixed(1) +
      " feddan vs " + G.m2ToFeddan(set.areaM2).toFixed(1) + "   top: " + shares.slice(0, 3).map((x) => x.classId + ":" + (x.share * 100).toFixed(1) + "%").join(" "));
    ok(Math.abs(gridArea / set.areaM2 - 1) < 0.03, season + ": grid area within 3% of the polygon area");
    ok(Math.abs(shares.reduce((a, x) => a + x.share, 0) - 1) < 1e-9 && shares.every((x) => x.classId !== 2 && x.classId !== 3 || season !== "winter"), season + ": shares sum to 1, inactive classes absent");
    const expected = season === "winter" ? [1, 4, 5, 6, 7, 9, 10, 11, 12] : season === "summer" ? [2, 3, 4, 5, 8, 9, 10, 11, 12] : CLASSES.map((c) => c.id);
    ok(JSON.stringify(shares.map((x) => x.classId).sort((a, b) => a - b)) === JSON.stringify(expected), season + ": exactly the season-active classes appear");
    const leader = { winter: 1, summer: 2, full: 10 }[season]; // full-year: the engine averages the seasonal priors, so fallow leads
    ok(shares[0].classId === leader && shares[0].share > (season === "full" ? 1 / 12 : 0.18), season + ": largest class is " + leader + " (" + (shares[0].share * 100).toFixed(1) + "%)");
  }
  const g1 = G.buildPreviewGrid(set.featureCollection, CLASSES, "winter", 7), g2 = G.buildPreviewGrid(set.featureCollection, CLASSES, "winter", 7), g3 = G.buildPreviewGrid(set.featureCollection, CLASSES, "winter", 8);
  ok(g1.grid.every((v, i) => v === g2.grid[i]) && g1.grid.some((v, i) => v !== g3.grid[i]), "deterministic for a seed, different across seeds");
  ok(g1.grid.every((v) => v === 0 || (v >= 1 && v <= 12)) && g1.totalCells > 1000, "class ids in range; unclassified cells = 0");
  const sq = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [REF.sq1km.ring] }, properties: {} }] };
  const gsq = G.buildPreviewGrid(sq, CLASSES, "winter", 1, { cellM: 10 });
  ok(Math.abs(G.gridAreaM2(gsq) / REF.sq1km.area_m2 - 1) < 0.03, "1 km² square: " + gsq.n + "×" + gsq.m + " grid → " + G.m2ToFeddan(G.gridAreaM2(gsq)).toFixed(3) + " feddan (true " + G.m2ToFeddan(REF.sq1km.area_m2).toFixed(3) + ")");
  err = null; try { G.buildPreviewGrid(lines.featureCollection, CLASSES, "winter", 1); } catch (e) { err = e; }
  ok(err && err.code === "NO_POLYGONS", "line layer → NO_POLYGONS");

  console.log("\n" + pass + " passed, " + fails.length + " failed" + (fails.length ? "\n  " + fails.join("\n  ") : ""));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error("TEST CRASH", e); process.exit(2); });
