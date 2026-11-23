/*
 * Delta Vision — geo.js
 * Shapefile (.shp/.dbf/.cpg/.prj or .zip) → GeoJSON (WGS84) in the browser, with no server.
 * Also: geodesic polygon areas (m², feddan, km²) and the deterministic preview-classification grid.
 *
 * Units used throughout (all from the engine):
 *   1 feddan = 4,200 m²          → FEDDAN_PER_KM2 = 238.095238…
 * Area = ellipsoidal (WGS84) area, computed on the authalic sphere — the same quantity that
 * ee.Image.pixelArea() and PostGIS ST_Area(geography) report.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root.proj4 || require(process.env.PROJ4_PATH || "proj4"));
  } else {
    root.DVGeo = factory(root.proj4);
  }
})(typeof self !== "undefined" ? self : this, function (proj4) {
  "use strict";

  var FEDDAN_M2 = 4200;
  var FEDDAN_PER_KM2 = 1000000 / FEDDAN_M2; // 238.095238095…

  // ------------------------------------------------------------------ errors
  function fail(code, detail) { var e = new Error(code); e.code = code; e.detail = detail; return e; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var rad = function (d) { return d * Math.PI / 180; };

  // ------------------------------------------------------------------ code pages TextDecoder lacks
  // CP437: file names inside old ZIPs (no UTF-8 flag). CP864: Arabic MS-DOS attribute tables.
  // Both tables were generated from Python's codecs (ref/codepage_tables.py).
  var CP437 = "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u007f\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00a0";
  var CP864 = "\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f !\"#$\u066a&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u007f\u00b0\u00b7\u2219\u221a\u2592\u2500\u2502\u253c\u2524\u252c\u251c\u2534\u2510\u250c\u2514\u2518\u03b2\u221e\u03c6\u00b1\u00bd\u00bc\u2248\u00ab\u00bb\ufef7\ufef8\ufffd\ufffd\ufefb\ufefc\ufffd\u00a0\u00ad\ufe82\u00a3\u00a4\ufe84\ufffd\ufffd\ufe8e\ufe8f\ufe95\ufe99\u060c\ufe9d\ufea1\ufea5\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\ufed1\u061b\ufeb1\ufeb5\ufeb9\u061f\u00a2\ufe80\ufe81\ufe83\ufe85\ufeca\ufe8b\ufe8d\ufe91\ufe93\ufe97\ufe9b\ufe9f\ufea3\ufea7\ufea9\ufeab\ufead\ufeaf\ufeb3\ufeb7\ufebb\ufebf\ufec1\ufec5\ufecb\ufecf\u00a6\u00ac\u00f7\u00d7\ufec9\u0640\ufed3\ufed7\ufedb\ufedf\ufee3\ufee7\ufeeb\ufeed\ufeef\ufef3\ufebd\ufecc\ufece\ufecd\ufee1\ufe7d\u0651\ufee5\ufee9\ufeec\ufef0\ufef2\ufed0\ufed5\ufef5\ufef6\ufedd\ufed9\ufef1\u25a0\ufffd";
  function decodeTable(u8, table, nkfc) {
    var s = "";
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(table.charCodeAt(u8[i]));
    return nkfc ? s.normalize("NFKC") : s; // CP864 stores Arabic as presentation forms → base letters
  }

  // ================================================================== ZIP
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") throw fail("ZIP_UNSUPPORTED");
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Minimal ZIP reader (store + deflate, classic ZIP — enough for every GIS "zip shapefile"). */
  async function readZip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf);
    var min = Math.max(0, u8.length - 22 - 65535), eocd = -1;
    for (var i = u8.length - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw fail("ZIP_BROKEN");
    var n = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    if (cdOff === 0xffffffff || n === 0xffff) throw fail("ZIP64");
    var out = [], p = cdOff, utf8 = new TextDecoder("utf-8");
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw fail("ZIP_BROKEN");
      var flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = (flags & 0x800 ? utf8.decode(u8.subarray(p + 46, p + 46 + nlen)) : decodeTable(u8.subarray(p + 46, p + 46 + nlen), CP437));
      if (dv.getUint32(lho, true) !== 0x04034b50) throw fail("ZIP_BROKEN");
      var dataStart = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      var comp = u8.subarray(dataStart, dataStart + csize);
      var data;
      if (method === 0) data = comp.slice();
      else if (method === 8) data = await inflateRaw(comp);
      else throw fail("ZIP_METHOD_" + method);
      if (!name.endsWith("/")) out.push({ name: name, data: data });
      p += 46 + nlen + elen + clen;
    }
    return out;
  }

  // ================================================================== DBF
  // byte 29 of the header ("language driver"). Only encodings the browser can actually decode are
  // listed; the other DOS code pages fall through to the UTF-8 validity check in detectEncoding().
  var LDID = {
    0x0a: "ibm864", 0x3b: "ibm864",
    0x13: "shift_jis", 0x68: "shift_jis", 0x14: "gbk", 0x69: "gbk", 0x15: "windows-949", 0x6a: "windows-949", 0x16: "big5", 0x6b: "big5",
    0x78: "windows-1250", 0x79: "windows-1251", 0x7a: "windows-1252", 0x7b: "windows-1253", 0x7c: "windows-1254",
    0x7d: "windows-1255", 0x7e: "windows-1256", 0x86: "ibm874",
    0xa0: "windows-1250", 0xa1: "windows-1251", 0xa2: "windows-1252", 0xa3: "windows-1253",
    0xa4: "windows-1254", 0xa5: "windows-1255", 0xa6: "windows-1256", 0xa7: "windows-1257", 0xa8: "windows-1258",
    0xd5: "utf-8"
  };
  var CPG_ALIASES = {
    "UTF-8": "utf-8", "UTF8": "utf-8", "65001": "utf-8",
    "ANSI 1252": "windows-1252", "1252": "windows-1252", "CP1252": "windows-1252", "ISO-8859-1": "windows-1252", "LATIN1": "windows-1252", "28591": "windows-1252",
    "1256": "windows-1256", "CP1256": "windows-1256", "WINDOWS-1256": "windows-1256", "ARABIC": "windows-1256",
    "ISO-8859-6": "iso-8859-6", "28596": "iso-8859-6", "ASMO-708": "iso-8859-6",
    "864": "ibm864", "IBM864": "ibm864", "DOS864": "ibm864", "DOS-864": "ibm864", "ASMO-864": "ibm864",
    "1250": "windows-1250", "1251": "windows-1251", "1254": "windows-1254", "1255": "windows-1255", "1257": "windows-1257",
    "65001 ": "utf-8"
  };
  /** the encodings a user may pick by hand in the UI (label → TextDecoder label) */
  var ENCODINGS = [
    ["auto", "auto"], ["utf-8", "UTF-8"], ["windows-1256", "Windows-1256 (Arabic)"],
    ["iso-8859-6", "ISO-8859-6 (Arabic)"], ["windows-1252", "Windows-1252"], ["ibm864", "DOS-864 (Arabic)"]
  ];
  function normEncoding(label) {
    if (!label) return null;
    var k = String(label).trim().toUpperCase().replace(/^CP/, "").replace(/^WINDOWS-/, "");
    if (CPG_ALIASES[k]) return CPG_ALIASES[k];
    if (/^WINDOWS?-\d+$/.test(String(label).trim())) return String(label).trim().toLowerCase();
    return null;
  }
  function encodingFromCpg(text) { return normEncoding(text); }
  function encodingFromLdid(ldid) { return LDID[ldid] || null; }
  function decoderFor(label) {
    if (label === "ibm864") return { decode: function (u8) { return decodeTable(u8, CP864, true); } };
    try { return new TextDecoder(label || "utf-8"); } catch (e) { return new TextDecoder("utf-8"); }
  }

  function parseDbf(buf, encodingLabel) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 32) throw fail("DBF_BROKEN");
    var nRec = dv.getUint32(4, true), hdrLen = dv.getUint16(8, true), recLen = dv.getUint16(10, true);
    var ldid = u8[29];
    var enc = encodingLabel && encodingLabel !== "auto" ? encodingLabel : (encodingFromLdid(ldid) || "utf-8");
    var td = decoderFor(enc);
    var fields = [], p = 32;
    while (p + 32 <= hdrLen && u8[p] !== 0x0d) {
      fields.push({
        name: td.decode(u8.subarray(p, p + 11)).replace(/\0+$/, "").trim(),
        type: String.fromCharCode(u8[p + 11]), length: u8[p + 16], decimals: u8[p + 17]
      });
      p += 32;
    }
    var records = [];
    for (var i = 0; i < nRec; i++) {
      var start = hdrLen + i * recLen;
      if (start + recLen > u8.length) break;
      if (u8[start] === 0x2a) continue; // deleted record
      var q = start + 1, rec = new Array(fields.length);
      for (var f = 0; f < fields.length; f++) {
        var fd = fields[f], bytes = u8.subarray(q, q + fd.length); q += fd.length;
        var s = td.decode(bytes).trim();
        if (fd.type === "N" || fd.type === "F") {
          if (s === "") rec[f] = null;
          else { var v = Number(s); rec[f] = isFinite(v) ? v : s; }
        } else if (fd.type === "I" && bytes.length === 4) rec[f] = dv.getInt32(q - 4, true);
        else if (fd.type === "D" && /^\d{8}$/.test(s)) rec[f] = s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
        else if (fd.type === "L") rec[f] = /^[TtYy1]$/.test(s);
        else rec[f] = s;
      }
      records.push(rec);
    }
    return { fields: fields, records: records, encoding: enc, ldid: ldid, nDeclared: nRec };
  }

  // ================================================================== SHP
  function parseShp(buf) {
    var dv = new DataView(buf);
    if (buf.byteLength < 100 || dv.getInt32(0, false) !== 9994) throw fail("SHP_BROKEN");
    var declaredType = dv.getInt32(32, true);
    var fileEnd = Math.min(buf.byteLength, dv.getInt32(24, false) * 2);
    var shapes = [], off = 100;
    while (off + 12 <= fileEnd) {
      var id = dv.getInt32(off, false), len = dv.getInt32(off + 4, false) * 2;
      if (len < 4) break;
      var start = off + 8, end = start + len;
      if (end > buf.byteLength) break;
      var t = dv.getInt32(start, true), p = start + 4, s = { id: id, type: t };
      if (t === 0) { /* null shape */ }
      else if (t === 1 || t === 11 || t === 21) { // point (+Z, +M)
        s.points = [[dv.getFloat64(p, true), dv.getFloat64(p + 8, true)]];
      } else if (t === 3 || t === 5 || t === 13 || t === 15 || t === 23 || t === 25) { // polyline / polygon (+Z, +M)
        p += 32 + ((t === 13 || t === 15) ? 16 : 0); // bbox, plus the Z range for Z types
        var nParts = dv.getInt32(p, true), nPoints = dv.getInt32(p + 4, true); p += 8;
        var parts = [];
        for (var i = 0; i < nParts; i++, p += 4) parts.push(dv.getInt32(p, true));
        var pts = new Array(nPoints);
        for (var j = 0; j < nPoints; j++, p += 16) pts[j] = [dv.getFloat64(p, true), dv.getFloat64(p + 8, true)];
        s.parts = [];
        if (nParts === 0 && nPoints > 0) s.parts.push(pts);
        for (var k = 0; k < nParts; k++) {
          var a = parts[k], b = k + 1 < nParts ? parts[k + 1] : nPoints;
          if (b > a) s.parts.push(pts.slice(a, b));
        }
      } else if (t === 8 || t === 18 || t === 28) { // multipoint (+Z, +M)
        p += 32 + (t === 18 ? 16 : 0);
        var n = dv.getInt32(p, true); p += 4;
        s.points = [];
        for (var m = 0; m < n; m++, p += 16) s.points.push([dv.getFloat64(p, true), dv.getFloat64(p + 8, true)]);
      } else s.unsupportedType = t;
      shapes.push(s);
      off = end;
    }
    return { declaredType: declaredType, shapes: shapes };
  }

  // ================================================================== .prj (WKT)
  // ---- CRS definitions proj4js cannot read from the file (it understands WKT1 only; WKT2 → EPSG code)
  var EPSG_DEFS = {
    22991: "+proj=tmerc +lat_0=30 +lon_0=35 +k=1 +x_0=300000 +y_0=1100000 +ellps=helmert +units=m +towgs84=-130,110,-13 +no_defs",
    22992: "+proj=tmerc +lat_0=30 +lon_0=31 +k=1 +x_0=615000 +y_0=810000 +ellps=helmert +units=m +towgs84=-130,110,-13 +no_defs",
    22993: "+proj=tmerc +lat_0=30 +lon_0=27 +k=1 +x_0=700000 +y_0=200000 +ellps=helmert +units=m +towgs84=-130,110,-13 +no_defs",
    22994: "+proj=tmerc +lat_0=30 +lon_0=27 +k=1 +x_0=700000 +y_0=1200000 +ellps=helmert +units=m +towgs84=-130,110,-13 +no_defs",
    3395: "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs",
    3857: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs",
    4326: "+proj=longlat +datum=WGS84 +no_defs"
  };
  function epsgDef(code) {
    code = +code;
    if (EPSG_DEFS[code]) return EPSG_DEFS[code];
    if (code >= 32601 && code <= 32660) return "+proj=utm +zone=" + (code - 32600) + " +datum=WGS84 +units=m +no_defs";
    if (code >= 32701 && code <= 32760) return "+proj=utm +zone=" + (code - 32700) + " +south +datum=WGS84 +units=m +no_defs";
    if (code >= 23034 && code <= 23037) return "+proj=utm +zone=" + (code - 23000) + " +ellps=intl +units=m +towgs84=-87,-98,-121 +no_defs";
    return null;
  }
  // Old datums whose files usually carry no WGS 84 transformation: the official EPSG 3-parameter shift
  // (Egypt 1907 → WGS 84 (1): −130, 110, −13 m, ±11 m; ED50 → WGS 84 (1): −87, −98, −121 m, ±10 m),
  // verified against PROJ in ref/epsg_proj4.py.
  var OLD_DATUMS = {
    "egypt 1907": { label: "Egypt 1907", towgs84: [-130, 110, -13], accuracyM: 11 },
    "european datum 1950": { label: "ED50", towgs84: [-87, -98, -121], accuracyM: 10 },
    "european 1950": { label: "ED50", towgs84: [-87, -98, -121], accuracyM: 10 }
  };
  function datumKey(name) {
    return String(name || "").toLowerCase().replace(/^d_/, "").replace(/^gcs_/, "").replace(/[\s_-]+/g, " ").trim();
  }
  /** Insert TOWGS84[dx,dy,dz] into the DATUM[…] block of a WKT1 text. */
  function injectTowgs84(text, p) {
    var m = /\bDATUM\s*\[/.exec(text);
    if (!m) return text;
    var i = m.index + m[0].length, depth = 1, q = false;
    for (; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') q = false; continue; }
      if (c === '"') q = true;
      else if (c === "[") depth++;
      else if (c === "]" && --depth === 0) break;
    }
    if (i >= text.length) return text;
    return text.slice(0, i) + "," + "TOWGS84[" + p.join(",") + "]" + text.slice(i);
  }
  function projectorOf(def) { var conv = proj4(def, "EPSG:4326"); return function (p) { return conv.forward(p); }; }
  /** proj4 converter (the CRS of the file → WGS84 lon/lat) for a WKT string; epsg = EPSG code as a fallback. */
  function wktProjector(text, epsg) {
    var conv, first;
    try { conv = proj4(text, "EPSG:4326"); }
    catch (e1) {
      first = e1;
      try { conv = proj4(unwrapCrs(text), "EPSG:4326"); } // e.g. an ESRI BOUNDCRS[…] wrapper
      catch (e2) { // WKT2 or anything else proj4js cannot read → the CRS's EPSG code
        if (!epsg || !epsgDef(epsg)) throw first;
        conv = proj4(epsgDef(epsg), "EPSG:4326");
      }
    }
    // proj4js: proj4(from, to).forward() converts from → to (here: the CRS of the file → lon/lat)
    return function (p) { return conv.forward(p); };
  }
  /** Balanced-bracket slice of the first CRS object inside a WKT (PROJCRS / PROJCS / GEOGCRS / GEOGCS). */
  function unwrapCrs(text) {
    var m = /\b(PROJCRS|PROJCS|GEOGCRS|GEOGCS)\s*\[/.exec(text);
    if (!m) throw fail("PRJ_UNSUPPORTED");
    var i = m.index + m[0].length, depth = 1, q = false;
    for (; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') q = false; continue; }
      if (c === '"') q = true;
      else if (c === "[") depth++;
      else if (c === "]" && --depth === 0) return text.slice(m.index, i + 1);
    }
    throw fail("PRJ_UNSUPPORTED");
  }
  function readPrj(wkt) {
    if (!wkt || !String(wkt).trim()) return { kind: "none" };
    var text = String(wkt).trim();
    var projected = /\b(PROJCS|PROJCRS)\s*\[/.test(text);
    var geographic = /\b(GEOGCS|GEOGCRS|GEOGRAPHICCRS)\s*\[/.test(text) && !projected;
    var m = text.match(/^\s*[A-Z0-9_]+\s*\[\s*"([^"]+)"/);
    var codes = [], re = /AUTHORITY\s*\[\s*"EPSG"\s*,\s*"(\d+)"\s*\]|ID\s*\[\s*"EPSG"\s*,\s*(\d+)\s*\]/ig, mm;
    while ((mm = re.exec(text))) codes.push(mm[1] || mm[2]);
    var hasShift = /TOWGS84\s*\[/i.test(text), dm = /\bDATUM\s*\[\s*"([^"]+)"/.exec(text);
    var info = {
      kind: projected ? "projected" : geographic ? "geographic" : "unknown",
      name: m ? m[1] : null,
      epsg: codes.length ? codes[codes.length - 1] : null, // the top-level object's code comes last
      wgs84: /WGS[ _]?(84|1984)|World Geodetic System 1984/i.test(text),
      datumName: dm ? dm[1] : null
    };
    // an old datum whose file has no transformation → the official EPSG shift instead of "no shift"
    var old = !info.wgs84 && !hasShift ? OLD_DATUMS[datumKey(info.datumName)] || null : null;
    try {
      if (info.kind === "geographic" && info.wgs84) info.toLonLat = function (p) { return [p[0], p[1]]; };
      else if (info.kind !== "none" && info.kind !== "unknown") {
        if (old && EPSG_DEFS[+info.epsg]) info.toLonLat = projectorOf(EPSG_DEFS[+info.epsg]);
        else info.toLonLat = wktProjector(old ? injectTowgs84(text, old.towgs84) : text, info.epsg);
        info.shiftApplied = true;
        info.datumAccuracyM = old ? old.accuracyM : null;
        if (old) info.datumLabel = old.label;
      }
    } catch (e) { info.kind = "unsupported"; info.error = String(e && e.message || e); }
    info.datumWarning = info.kind !== "none" && !info.wgs84 && !info.shiftApplied;
    return info;
  }

  // ================================================================== geometry helpers
  function ringBbox(ring) {
    var w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (var i = 0; i < ring.length; i++) {
      var x = ring[i][0], y = ring[i][1];
      if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
    }
    return [w, s, e, n];
  }
  function bboxUnion(a, b) {
    if (!a) return b.slice(); if (!b) return a.slice();
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  }
  function pointInRing(x, y, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function ringPlanarArea(ring) {
    var a = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return Math.abs(a / 2);
  }
  function cleanRing(ring) {
    var out = [], prev = null;
    for (var i = 0; i < ring.length; i++) {
      var p = ring[i];
      if (!isFinite(p[0]) || !isFinite(p[1])) continue;
      if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
      out.push(p); prev = p;
    }
    while (out.length > 1) {
      var f = out[0], l = out[out.length - 1];
      if (f[0] === l[0] && f[1] === l[1]) out.pop(); else break;
    }
    return out.length >= 3 ? out : null;
  }
  /** Is ring `inner` inside ring `outer`? Three probe vertices, so touching rings still count. */
  function ringInsideAny(inner, outer) {
    var n = inner.length;
    return pointInRing(inner[0][0], inner[0][1], outer) ||
           pointInRing(inner[n >> 1][0], inner[n >> 1][1], outer) ||
           pointInRing(inner[(2 * n) / 3 | 0][0], inner[(2 * n) / 3 | 0][1], outer);
  }

  // ---- WGS84 authalic sphere (equal-area) — polygon area equals the ellipsoidal area
  var A_WGS = 6378137, F_WGS = 1 / 298.257223563, E2 = F_WGS * (2 - F_WGS), E1 = Math.sqrt(E2), B_WGS = A_WGS * (1 - F_WGS);
  var R_AUTH = Math.sqrt((2 * Math.PI * A_WGS * A_WGS + Math.PI * (B_WGS * B_WGS / E1) * Math.log((1 + E1) / (1 - E1))) / (4 * Math.PI));
  var QP = 1 + (1 - E2) / (2 * E1) * Math.log((1 + E1) / (1 - E1));
  function sinAuthalic(latRad) {
    var s = Math.sin(latRad), e2s2 = E2 * s * s;
    return ((1 - E2) * (s / (1 - e2s2) - Math.log((1 - E1 * s) / (1 + E1 * s)) / (2 * E1))) / QP;
  }
  var MAX_EDGE_M = 5000;
  function densify(ring) {
    var n = ring.length;
    var closed = n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1];
    var edges = closed ? n - 1 : n, out = [ring[0]];
    var cos0 = Math.max(Math.abs(Math.cos(rad(ring[0][1]))), 1e-6);
    for (var i = 0; i < edges; i++) {
      var prev = ring[i], p = ring[(i + 1) % n];
      var dx = (p[0] - prev[0]) * cos0 * 111320, dy = (p[1] - prev[1]) * 110574;
      var nseg = clamp(Math.ceil(Math.sqrt(dx * dx + dy * dy) / MAX_EDGE_M), 1, 4000);
      for (var k = 1; k <= nseg; k++) {
        var t = k / nseg;
        out.push([prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t]);
      }
    }
    return out;
  }
  /** Geodesic area (m²) of one ring given as [[lon, lat], …]; orientation-independent. */
  function ringAreaM2(ring) {
    if (!ring || ring.length < 3) return 0;
    var pts = densify(ring), sum = 0, lamPrev = 0, sbPrev = 0;
    for (var i = 0; i < pts.length; i++) {
      var lam = rad(pts[i][0]), sb = clamp(sinAuthalic(rad(pts[i][1])), -1, 1); // sin of the authalic latitude
      if (i > 0) {
        var d = lam - lamPrev;
        if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
        sum += d * (2 + sbPrev + sb);
      }
      lamPrev = lam; sbPrev = sb;
    }
    return Math.abs(sum / 2 * R_AUTH * R_AUTH);
  }
  /** Area of a GeoJSON Polygon coordinates array: outer ring minus its holes. */
  function polygonAreaM2(coords) {
    var a = 0;
    for (var i = 0; i < coords.length; i++) a += (i === 0 ? 1 : -1) * ringAreaM2(coords[i]);
    return Math.max(0, a);
  }
  /** Area (m²) of a GeoJSON geometry (Polygon / MultiPolygon); 0 for lines and points. */
  function geometryAreaM2(geom) {
    if (!geom) return 0;
    if (geom.type === "Polygon") return polygonAreaM2(geom.coordinates);
    if (geom.type === "MultiPolygon") {
      var a = 0;
      for (var i = 0; i < geom.coordinates.length; i++) a += polygonAreaM2(geom.coordinates[i]);
      return a;
    }
    return 0;
  }
  function geometryBbox(geom, into) {
    var b = into || null;
    var rings = [];
    if (geom.type === "Polygon") rings = geom.coordinates;
    else if (geom.type === "MultiPolygon") geom.coordinates.forEach(function (p) { rings = rings.concat(p); });
    else if (geom.type === "LineString" || geom.type === "MultiPoint") rings = [geom.coordinates];
    else if (geom.type === "MultiLineString") rings = geom.coordinates;
    else if (geom.type === "Point") return bboxUnion(b, [geom.coordinates[0], geom.coordinates[1], geom.coordinates[0], geom.coordinates[1]]);
    for (var i = 0; i < rings.length; i++) if (rings[i].length) b = bboxUnion(b, ringBbox(rings[i]));
    return b;
  }
  function collectionBbox(fc) {
    var b = null;
    for (var i = 0; i < fc.features.length; i++) b = geometryBbox(fc.features[i].geometry, b);
    return b;
  }
  function m2ToFeddan(m2) { return m2 / FEDDAN_M2; }
  function m2ToKm2(m2) { return m2 / 1e6; }

  /**
   * Turns a list of rings (outer + holes, any orientation) into polygons by nesting parity:
   * depth 0 = outer, depth 1 = hole, depth 2 = island …
   * Returns [{ depth, parent, areaAbs, bbox, ring }] and groups holes under their outer ring.
   */
  function nestRings(rings) {
    var items = [];
    for (var i = 0; i < rings.length; i++) {
      var r = cleanRing(rings[i]);
      if (r) items.push({ ring: r, bbox: ringBbox(r), areaAbs: ringPlanarArea(r), depth: 0, parent: -1 });
    }
    var order = items.map(function (_, i) { return i; }).sort(function (a, b) { return items[b].areaAbs - items[a].areaAbs; });
    var done = [];
    for (var oi = 0; oi < order.length; oi++) {
      var idx = order[oi], it = items[idx];
      for (var d = done.length - 1; d >= 0; d--) { // smallest containing ring first
        var c = items[done[d]], bb = c.bbox;
        if (it.bbox[0] >= bb[0] && it.bbox[1] >= bb[1] && it.bbox[2] <= bb[2] && it.bbox[3] <= bb[3] &&
            ringInsideAny(it.ring, c.ring)) {
          it.parent = done[d]; it.depth = c.depth + 1; break;
        }
      }
      done.push(idx);
    }
    var polys = [];
    for (var k = 0; k < items.length; k++) if (items[k].depth % 2 === 0) polys.push(items[k]);
    for (var h = 0; h < items.length; h++) {
      var hole = items[h];
      if (hole.depth % 2 === 1) {
        var parent = items[hole.parent];
        parent.holes = parent.holes || [];
        parent.holes.push(hole);
      }
    }
    return { items: items, polys: polys };
  }
  function closeRing(ring) {
    var f = ring[0], l = ring[ring.length - 1];
    return f[0] === l[0] && f[1] === l[1] ? ring : ring.concat([[f[0], f[1]]]);
  }
  function nestToPolygons(nest) {
    return nest.polys.map(function (p) {
      return [closeRing(p.ring)].concat((p.holes || []).map(function (h) { return closeRing(h.ring); }));
    });
  }
  /** Nesting-parity area of a set of rings (outer positive, holes negative, islands positive). */
  function ringsAreaM2(rings) {
    var nest = nestRings(rings), a = 0;
    for (var i = 0; i < nest.items.length; i++) a += (nest.items[i].depth % 2 === 0 ? 1 : -1) * ringAreaM2(nest.items[i].ring);
    return Math.max(0, a);
  }

  // ================================================================== shapefile set → GeoJSON
  function baseName(path) { var s = String(path).replace(/\\/g, "/").split("/").pop(); return s; }
  function splitName(path) {
    var b = baseName(path), dot = b.lastIndexOf(".");
    return dot > 0 ? { stem: b.slice(0, dot).toLowerCase(), ext: b.slice(dot + 1).toLowerCase(), file: b } : null;
  }
  function detectEncoding(cpgText, dbfBuf) {
    if (cpgText) { var e = encodingFromCpg(cpgText); if (e) return e; }
    var ldid = dbfBuf && dbfBuf.length > 29 ? dbfBuf[29] : 0;
    var fromLdid = encodingFromLdid(ldid);
    if (fromLdid) return fromLdid;
    if (dbfBuf) { // valid UTF-8 → UTF-8, else the usual suspect for Egyptian attribute tables
      try { new TextDecoder("utf-8", { fatal: true }).decode(dbfBuf.subarray(32)); return "utf-8"; }
      catch (err) { return "windows-1256"; }
    }
    return "utf-8";
  }
  function dbfRecordsToObjects(dbf) {
    return dbf.records.map(function (rec) {
      var o = {};
      for (var i = 0; i < dbf.fields.length; i++) o[dbf.fields[i].name] = rec[i];
      return o;
    });
  }
  /** Pick the most human-friendly name field of an attribute table (first text column with short values). */
  function pickNameField(fields, records) {
    var best = null;
    for (var f = 0; f < fields.length; f++) {
      var fd = fields[f];
      if (fd.type !== "C" && fd.type !== "N") continue;
      var ok = 0, total = 0;
      for (var r = 0; r < Math.min(records.length, 30); r++) {
        var v = records[r][f]; if (v == null || v === "") continue;
        total++; if (String(v).trim().length > 0 && String(v).length <= 60) ok++;
      }
      if (!total) continue;
      var score = ok / total + (fd.type === "C" ? 0.5 : 0) + (/name|nom|اسم|اسم_/i.test(fd.name) ? 1 : 0);
      if (!best || score > best.score) best = { index: f, name: fd.name, score: score };
    }
    return best ? best.name : null;
  }

  /**
   * parseShapefileSet({shp, dbf, prj, cpg}, {encoding:"auto"|label})
   *   buffers are Uint8Array/ArrayBuffer (shp required).
   * → { layerName, featureCollection, crs, geometryTypes, nFeatures, dbf, areaM2, nameField, warnings }
   */
  function parseShapefileSet(files, opts) {
    opts = opts || {};
    var shpBuf = files.shp instanceof Uint8Array ? files.shp.buffer.slice(files.shp.byteOffset, files.shp.byteOffset + files.shp.byteLength) : files.shp;
    var shp = parseShp(shpBuf);
    var dbf = null;
    if (files.dbf) {
      var enc = (!opts.encoding || opts.encoding === "auto")
        ? detectEncoding(files.cpg ? textOf(files.cpg) : null, files.dbf) : opts.encoding;
      dbf = parseDbf(files.dbf, enc);
    }
    var crs = readPrj(files.prj ? textOf(files.prj) : null);
    var warnings = [];
    var toLonLat;
    var usable = !!crs.toLonLat && (crs.kind === "projected" || crs.kind === "geographic");
    if (usable) {
      toLonLat = crs.toLonLat;
      if (crs.datumWarning) warnings.push("DATUM_SHIFT");
    } else {
      // no usable .prj: accept plain lon/lat values only — never guess a projected grid
      var looksLonLat = true;
      for (var i = 0; i < shp.shapes.length && looksLonLat; i++) {
        var pts = shp.shapes[i].points || (shp.shapes[i].parts ? [].concat.apply([], shp.shapes[i].parts) : []);
        for (var j = 0; j < pts.length; j++) {
          if (pts[j][0] < -180 || pts[j][0] > 180 || pts[j][1] < -90 || pts[j][1] > 90) { looksLonLat = false; break; }
        }
      }
      if (!looksLonLat) throw fail(crs.kind === "unsupported" ? "PRJ_UNSUPPORTED" : "PRJ_MISSING", crs.error);
      toLonLat = function (p) { return [p[0], p[1]]; };
      warnings.push(crs.kind === "unsupported" ? "PRJ_UNSUPPORTED_LATLON" : "PRJ_MISSING_LATLON");
    }
    var records = dbf ? dbfRecordsToObjects(dbf) : null;
    var features = [], types = {}, areaM2 = 0;
    for (var s = 0; s < shp.shapes.length; s++) {
      var sh = shp.shapes[s], geom = null;
      if (sh.type === 5 || sh.type === 15 || sh.type === 25) {
        var rings = sh.parts.map(function (r) { return r.map(toLonLat); });
        var nest = nestRings(rings), polys = nestToPolygons(nest);
        if (polys.length === 1) geom = { type: "Polygon", coordinates: polys[0] };
        else if (polys.length > 1) geom = { type: "MultiPolygon", coordinates: polys };
        areaM2 += ringsAreaM2(rings);
      } else if (sh.type === 3 || sh.type === 13 || sh.type === 23) {
        var lines = sh.parts.map(function (r) { return r.map(toLonLat); }).filter(function (r) { return r.length >= 2; });
        if (lines.length === 1) geom = { type: "LineString", coordinates: lines[0] };
        else if (lines.length > 1) geom = { type: "MultiLineString", coordinates: lines };
      } else if (sh.type === 1 || sh.type === 11 || sh.type === 21) {
        geom = { type: "Point", coordinates: toLonLat(sh.points[0]) };
      } else if (sh.type === 8 || sh.type === 18 || sh.type === 28) {
        var mp = sh.points.map(toLonLat);
        if (mp.length === 1) geom = { type: "Point", coordinates: mp[0] };
        else if (mp.length) geom = { type: "MultiPoint", coordinates: mp };
      }
      if (!geom) continue;
      types[geom.type] = (types[geom.type] || 0) + 1;
      features.push({ type: "Feature", geometry: geom, properties: records && records[s] ? records[s] : {} });
    }
    return {
      layerName: opts.layerName || "shapefile",
      featureCollection: { type: "FeatureCollection", features: features },
      crs: crs, geometryTypes: Object.keys(types), nFeatures: features.length,
      dbf: dbf, areaM2: areaM2, nameField: dbf ? pickNameField(dbf.fields, dbf.records) : null,
      warnings: warnings, declaredType: shp.declaredType
    };
  }
  function textOf(u8) {
    var b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    return new TextDecoder("utf-8").decode(b);
  }

  /**
   * Load shapefiles from browser File objects (or {name, arrayBuffer()} look-alikes).
   * Accepts loose .shp (+.dbf/.prj/.cpg) and/or .zip archives.
   * → parse result of the largest layer (+.files, .buffers for re-decoding with another encoding)
   */
  async function loadShapefiles(fileList, opts) {
    opts = opts || {};
    var entries = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i], lower = f.name.toLowerCase();
      var buf = await f.arrayBuffer();
      if (lower.endsWith(".zip")) {
        var inner = await readZip(buf);
        for (var k = 0; k < inner.length; k++) entries.push(inner[k]);
      } else entries.push({ name: f.name, data: new Uint8Array(buf) });
    }
    var groups = {};
    for (var e = 0; e < entries.length; e++) {
      var path = entries[e].name, nm = splitName(path);
      if (!nm || nm.file.startsWith("._") || /(^|\/)__MACOSX\//.test(path)) continue; // macOS zip junk
      if (["shp", "dbf", "prj", "cpg"].indexOf(nm.ext) < 0) continue;
      (groups[nm.stem] = groups[nm.stem] || { stem: nm.stem })[nm.ext] = entries[e].data;
    }
    var layers = Object.keys(groups).filter(function (k) { return groups[k].shp; });
    if (!layers.length) throw fail("SHP_MISSING");
    layers.sort(function (a, b) { return groups[b].shp.length - groups[a].shp.length; });
    var key = layers[0], g = groups[key];
    var res = parseShapefileSet(g, { encoding: opts.encoding || "auto", layerName: key });
    res.buffers = g;
    res.otherLayers = layers.slice(1);
    return res;
  }

  // ================================================================== samples CSV
  var LON_KEYS = ["lon", "lng", "long", "longitude", "x", "خط الطول", "longitud"];
  var LAT_KEYS = ["lat", "latitude", "y", "دائرة العرض", "عرض"];
  var CLS_KEYS = ["class", "classid", "class_id", "class_id_", "crop", "category", "label", "الفئة", "type"];
  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); });
  }
  function findKey(header, keys) {
    for (var i = 0; i < header.length; i++) {
      var h = String(header[i]).trim().toLowerCase();
      if (keys.indexOf(h) >= 0) return i;
    }
    return -1;
  }
  /**
   * Training-sample CSV → [{lon, lat, classId|code|name, raw}].
   * Columns lon/lat (many aliases) + class (id 1–12, code such as WHT, or a name) + optional header.
   */
  function parseSamplesCsv(text, resolveClass) {
    var bom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    var rows = parseCsv(bom);
    if (!rows.length) throw fail("CSV_EMPTY");
    var first = rows[0].map(function (v) { return String(v).trim(); });
    var numeric = first.length >= 3 && isFinite(Number(first[0])) && isFinite(Number(first[1]));
    var header = numeric ? [] : first;
    var data = numeric ? rows : rows.slice(1);
    var iLon = header.length ? findKey(header, LON_KEYS) : 0;
    var iLat = header.length ? findKey(header, LAT_KEYS) : 1;
    var iCls = header.length ? findKey(header, CLS_KEYS) : 2;
    if (header.length && (iLon < 0 || iLat < 0 || iCls < 0)) throw fail("CSV_COLUMNS");
    var out = [], skipped = 0;
    var num = function (v) { v = v == null ? "" : String(v).trim(); return v === "" ? NaN : Number(v); };
    for (var r = 0; r < data.length; r++) {
      var lon = num(data[r][iLon]), lat = num(data[r][iLat]);
      var cls = String(data[r][iCls] == null ? "" : data[r][iCls]).trim();
      var classId = resolveClass ? resolveClass(cls) : cls;
      if (!isFinite(lon) || !isFinite(lat) || classId == null) { skipped++; continue; }
      out.push({ lon: lon, lat: lat, classId: classId, raw: cls });
    }
    if (!out.length) throw fail("CSV_EMPTY");
    return { samples: out, skipped: skipped, header: header };
  }

  // ================================================================== preview classification grid
  function hash2(ix, iy, seed) {
    var h = (Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  var merc = function (latRad) { return Math.log(Math.tan(Math.PI / 4 + latRad / 2)); };
  var invMerc = function (y) { return 2 * Math.atan(Math.exp(y)) - Math.PI / 2; };

  // crossing x-coordinates of a ring's edges with the horizontal line y (even-odd rule)
  function ringCrossings(ring, y) {
    var xs = [];
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var yi = ring[i][1], yj = ring[j][1];
      if ((yi > y) !== (yj > y)) xs.push(ring[j][0] + (y - yj) * (ring[i][0] - ring[j][0]) / (yi - yj));
    }
    return xs;
  }
  function mergeSpans(spans) {
    if (!spans.length) return [];
    spans.sort(function (a, b) { return a[0] - b[0]; });
    var out = [spans[0].slice()];
    for (var i = 1; i < spans.length; i++) {
      var last = out[out.length - 1];
      if (spans[i][0] <= last[1]) last[1] = Math.max(last[1], spans[i][1]);
      else out.push(spans[i].slice());
    }
    return out;
  }
  /** Union of the x-spans covered by the polygons of one feature at latitude y (holes excluded). */
  function featureSpansAt(feature, y, spans) {
    var g = feature.geometry;
    if (!g) return;
    var polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
    if (!polys) return;
    for (var p = 0; p < polys.length; p++) {
      var xs = [];
      for (var r = 0; r < polys[p].length; r++) xs.push.apply(xs, ringCrossings(polys[p][r], y));
      if (xs.length < 2) continue;
      xs.sort(function (a, b) { return a - b; });
      for (var k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] > xs[k]) spans.push([xs[k], xs[k + 1]]);
    }
  }

  // parcel + class pattern of the preview (illustrative — proportions follow the engine's priors)
  var PW = 250, PH = 175, ROT = 0.42;
  function parcelOf(x, y, seed) {
    var cs = Math.cos(ROT), sn = Math.sin(ROT);
    var u = (x * cs + y * sn) / PW, v = (-x * sn + y * cs) / PH;
    var iu = Math.floor(u), iv = Math.floor(v), best = -1, bd = Infinity, bi = 0, bj = 0;
    for (var j = iv - 1; j <= iv + 1; j++) {
      for (var i = iu - 1; i <= iu + 1; i++) {
        var cx = i + 0.5 + 0.45 * (hash2(i, j, seed + 11) - 0.5), cy = j + 0.5 + 0.45 * (hash2(i, j, seed + 12) - 0.5);
        var d = (u - cx) * (u - cx) + (v - cy) * (v - cy);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    return [bi, bj];
  }
  function buildClassPicker(classes, season, seed) {
    // classes: [{id, prior:{winter, summer}}] — only season-active classes take part
    function pv(c) {
      // the engine's priorOf(): in the full year the prior is the mean of both seasons, and a class absent
      // from a season's table (here: prior 0) counts 0.3
      if (season === "full") return ((c.prior.winter > 0 ? c.prior.winter : 0.3) + (c.prior.summer > 0 ? c.prior.summer : 0.3)) / 2;
      return c.prior[season] != null ? c.prior[season] : 0;
    }
    var active = classes.filter(function (c) { return c.prior && pv(c) > 0; });
    var rare = { 10: 1.0, 11: 0.14, 12: 0.07 }; // fallow full weight; urban/water appear as small clusters only
    return function (parcel) {
      var i = parcel[0], j = parcel[1], total = 0, cum = [];
      for (var k = 0; k < active.length; k++) {
        var c = active[k];
        var w = pv(c) * (0.2 + 1.6 * vnoise(i * 0.09 + k * 37.7, j * 0.09, seed + 100 + k));
        w *= rare[c.id] != null ? rare[c.id] : 1;
        total += w; cum.push(total);
      }
      var r = hash2(i, j, seed + 99) * total;
      for (var m = 0; m < cum.length; m++) if (r <= cum[m]) return active[m].id;
      return active[active.length - 1].id;
    };
  }

  /**
   * Raster over the union of all polygon features, each cell labelled by classify(parcel).
   * The grid is regular in Web Mercator space (so it registers exactly on the Leaflet overlay),
   * per-row cos²(lat) weights restore equal-area accounting for the feddan shares.
   * → { n, m, bounds, cellW, cellH, grid:Uint8Array, counts, weights, totalCells, totalWeight, cellM }
   */
  function rasterize(fc, classify, seed, opts) {
    opts = opts || {};
    var bbox = null;
    for (var f = 0; f < fc.features.length; f++) {
      var g = fc.features[f].geometry;
      if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) bbox = geometryBbox(g, bbox);
    }
    if (!bbox) throw fail("NO_POLYGONS");
    var lat0 = rad((bbox[1] + bbox[3]) / 2);
    var widthM = rad(bbox[2] - bbox[0]) * 6371000 * Math.cos(lat0);
    var target = opts.cellM || 25;
    var n = clamp(Math.round(widthM / target), 48, opts.maxN || 900);
    var yMin = merc(rad(bbox[1])), yMax = merc(rad(bbox[3])), xMin = rad(bbox[0]), xMax = rad(bbox[2]);
    var m = clamp(Math.round(n * (yMax - yMin) / (xMax - xMin)), 8, opts.maxM || 900);
    var dX = (xMax - xMin) / n, dY = (yMax - yMin) / m;
    var grid = new Uint8Array(n * m), counts = {}, weights = {}, totalCells = 0, totalWeight = 0;
    var feats = fc.features.filter(function (ft) {
      var gg = ft.geometry; return gg && (gg.type === "Polygon" || gg.type === "MultiPolygon");
    }).map(function (ft) { return { f: ft, bbox: geometryBbox(ft.geometry) }; });
    var lon0 = (bbox[0] + bbox[2]) / 2, cos0 = Math.cos(lat0);
    for (var j = 0; j < m; j++) {
      var lat = invMerc(yMin + (j + 0.5) * dY), y = lat * 180 / Math.PI;
      var spans = [];
      for (var q = 0; q < feats.length; q++) {
        if (y < feats[q].bbox[1] || y > feats[q].bbox[3]) continue;
        featureSpansAt(feats[q].f, y, spans);
      }
      spans = mergeSpans(spans);
      if (!spans.length) continue;
      // true area of a Web-Mercator cell = cellW·cellH·cos²(lat): equal-area weight for shares and total area
      var w = Math.cos(lat) * Math.cos(lat);
      for (var s = 0; s < spans.length; s++) {
        var i0 = Math.max(0, Math.ceil((rad(spans[s][0]) - xMin) / dX - 0.5));
        var i1 = Math.min(n - 1, Math.floor((rad(spans[s][1]) - xMin) / dX - 0.5));
        for (var i = i0; i <= i1; i++) {
          var x = ((i + 0.5) * dX + xMin) * 180 / Math.PI;
          var mx = rad(x - lon0) * 6371000 * cos0, my = (lat - lat0) * 6371000;
          var cid = classify(parcelOf(mx, my, seed));
          grid[j * n + i] = cid;
          counts[cid] = (counts[cid] || 0) + 1; weights[cid] = (weights[cid] || 0) + w;
          totalCells++; totalWeight += w;
        }
      }
    }
    return {
      n: n, m: m, bounds: bbox, grid: grid, counts: counts, weights: weights,
      totalCells: totalCells, totalWeight: totalWeight, cellM: widthM / n, seed: seed,
      // cell size in Web-Mercator metres; true metres at latitude φ = cell × cos(φ)
      cellW: rad(bbox[2] - bbox[0]) * 6371000 / n, cellH: (yMax - yMin) / m * 6371000
    };
  }
  /** Preview classification: each parcel gets a class of the season, following the engine's prevalence priors. */
  function buildPreviewGrid(fc, classes, season, seed, opts) {
    var pick = buildClassPicker(classes, season, seed);
    var res = rasterize(fc, function (parcel) { return pick(parcel); }, seed, opts);
    res.season = season;
    return res;
  }
  /** k-means preview: the same raster, each parcel labelled with a spectral cluster 1..k (not a crop class). */
  function buildClusterGrid(fc, k, seed, opts) {
    k = clamp(Math.round(k) || 8, 2, 30);
    return rasterize(fc, function (parcel) {
      var a = Math.floor(vnoise(parcel[0] * 0.07, parcel[1] * 0.07, seed + 7) * k);
      var b = hash2(parcel[0], parcel[1], seed + 8) < 0.3 ? 1 : 0;
      return 1 + ((a < 0 ? 0 : a >= k ? k - 1 : a) + b) % k;
    }, seed, opts);
  }
  /** Area (m²) covered by the classified cells: Σ cos²(lat) × one Mercator cell = equal-area sum. */
  function gridAreaM2(res) { return res.totalWeight * res.cellW * res.cellH; }
  /** Per-class shares (0..1) of the preview grid, cosine-weighted (equal-area). */
  function previewShares(res) {
    var out = [];
    for (var k in res.weights) if (res.totalWeight > 0) out.push({ classId: +k, share: res.weights[k] / res.totalWeight, cells: res.counts[k] });
    return out.sort(function (a, b) { return b.share - a.share; });
  }
  /** Rasterise the grid to a PNG data URL (browser only). colorOf(classId) → [r,g,b]. */
  function gridToDataUrl(res, colorOf, opacity) {
    if (typeof document === "undefined") return null;
    var cv = document.createElement("canvas"); cv.width = res.n; cv.height = res.m;
    var ctx = cv.getContext("2d"), img = ctx.createImageData(res.n, res.m), a = Math.round(255 * (opacity == null ? 0.78 : opacity));
    for (var j = 0; j < res.m; j++) {
      // grid row 0 is the southern edge; image row 0 is the top → flip vertically
      var row = res.m - 1 - j;
      for (var i = 0; i < res.n; i++) {
        var cid = res.grid[j * res.n + i]; if (!cid) continue;
        var c = colorOf(cid), k = (row * res.n + i) * 4;
        img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL("image/png");
  }

  return {
    FEDDAN_M2: FEDDAN_M2, FEDDAN_PER_KM2: FEDDAN_PER_KM2, R_AUTH: R_AUTH, ENCODINGS: ENCODINGS,
    readZip: readZip, parseDbf: parseDbf, parseShp: parseShp, readPrj: readPrj, detectEncoding: detectEncoding, normEncoding: normEncoding,
    parseShapefileSet: parseShapefileSet, loadShapefiles: loadShapefiles, parseSamplesCsv: parseSamplesCsv, parseCsv: parseCsv,
    ringAreaM2: ringAreaM2, polygonAreaM2: polygonAreaM2, geometryAreaM2: geometryAreaM2, ringsAreaM2: ringsAreaM2,
    geometryBbox: geometryBbox, collectionBbox: collectionBbox, nestRings: nestRings, nestToPolygons: nestToPolygons,
    pointInRing: pointInRing, m2ToFeddan: m2ToFeddan, m2ToKm2: m2ToKm2,
    buildPreviewGrid: buildPreviewGrid, buildClusterGrid: buildClusterGrid, previewShares: previewShares, gridAreaM2: gridAreaM2, gridToDataUrl: gridToDataUrl,
    hash2: hash2, vnoise: vnoise, fail: fail
  };
});
