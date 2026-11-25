/*
 * Delta Vision — i18n.js
 * Arabic (default, right-to-left) and English (left-to-right).
 * Domain data lives here too (two classification levels, 11 algorithms, period
 * presets, parameter ranges), mirroring gee_src/scheme.json — the i18n test
 * asserts the two never drift apart.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DVI18N = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEY_LANG = "dv_lang";
  var current = "ar";
  try { var saved = localStorage.getItem(KEY_LANG); if (saved === "ar" || saved === "en") current = saved; } catch (e) { /* no storage: default */ }

  // ------------------------------------------------------------------ domain data
  /** Level 1 "general" = land cover (4 classes). Level 2 "crops" = the 11
   *  crop-type classes of the built-in sample set, filtered by season:
   *  winter family keeps 9 classes (294 of 360 points), summer family keeps
   *  8 (252 points) — off-season crops never share a model. */
  var SCHEMES = {
    general: {
      key: "general",
      classes: [
        { id: 1, code: "WTR", en: "Water", ar: "مياه", color: "#2563EB" },
        { id: 2, code: "URB", en: "Urban", ar: "عمران", color: "#EF4444" },
        { id: 3, code: "BAR", en: "Bare Land", ar: "أرض بور", color: "#9CA3AF" },
        { id: 4, code: "CRO", en: "Cropland", ar: "أراضٍ زراعية", color: "#22C55E" }
      ],
      active: { winter: [1, 2, 3, 4], summer: [1, 2, 3, 4], full: [1, 2, 3, 4] }
    },
    crops: {
      key: "crops",
      classes: [
        { id: 1, code: "WHT", en: "Wheat", ar: "قمح", color: "#FACC15", family: "winter" },
        { id: 2, code: "MZE", en: "Maize", ar: "ذرة", color: "#4ADE80", family: "summer" },
        { id: 3, code: "POT", en: "Potato", ar: "بطاطس", color: "#C19A6B", family: "winter" },
        { id: 4, code: "BET", en: "Sugar Beet", ar: "بنجر السكر", color: "#F472B6", family: "winter" },
        { id: 5, code: "VEG", en: "Vegetables", ar: "خضروات", color: "#15803D", family: "both" },
        { id: 6, code: "MED", en: "Medicinal Plants", ar: "نباتات طبية", color: "#06B6D4", family: "both" },
        { id: 7, code: "CIT", en: "Citrus", ar: "موالح", color: "#6B8E23", family: "both" },
        { id: 8, code: "GRP", en: "Grapes", ar: "عنب", color: "#9333EA", family: "summer" },
        { id: 9, code: "BAR", en: "Bare Land", ar: "أرض بور", color: "#9CA3AF", family: "all" },
        { id: 10, code: "URB", en: "Urban", ar: "عمران", color: "#EF4444", family: "all" },
        { id: 11, code: "WTR", en: "Water", ar: "مياه", color: "#2563EB", family: "all" }
      ],
      active: { winter: [1, 3, 4, 5, 6, 7, 9, 10, 11], summer: [2, 5, 6, 7, 8, 9, 10, 11], full: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
    }
  };
  var SCHEME_KEYS = ["general", "crops"];
  var DEFAULT_SCHEME = "general";
  /** Level 2 alias kept for compatibility with older code/tests. */
  var CLASSES = SCHEMES.crops.classes;

  /** Period presets. Winter family: Nov–Apr, Oct–Jan (early winter / النيلي),
   *  Feb–May (late winter). Summer family: May–Oct, Jun–Sep (peak). "full" is
   *  offered for land cover only. */
  var SEASONS = [
    { key: "winter", family: "winter" },
    { key: "early_winter", family: "winter" },
    { key: "late_winter", family: "winter" },
    { key: "summer", family: "summer" },
    { key: "summer_peak", family: "summer" },
    { key: "full", family: "full" }
  ];
  var YEARS = [2026, 2025, 2024, 2023];
  var DEFAULT_YEAR = 2026;
  var DEFAULT_SEASON = "winter";
  var DEFAULT_ALGORITHM = "rf";

  /** group: supervised | unsupervised | knowledge — the same order as the engine's algorithm list. */
  var ALGORITHMS = [
    { key: "rf", group: "supervised", params: ["rfTrees"] },
    { key: "svm", group: "supervised", params: [] },
    { key: "cart", group: "supervised", params: [] },
    { key: "gtb", group: "supervised", params: [] },
    { key: "nb", group: "supervised", params: [] },
    { key: "mlp", group: "supervised", params: ["mlpHidden", "mlpEpochs"] },
    { key: "knn", group: "supervised", params: ["knnK"] },
    { key: "mindist_e", group: "supervised", params: [] },
    { key: "mindist_m", group: "supervised", params: [] },
    { key: "kmeans", group: "unsupervised", params: ["kClusters"] },
    { key: "signature", group: "knowledge", params: [] }
  ];
  /** Parameter ranges of this interface; `def` is the engine's default. */
  var PARAMS = {
    rfTrees: { min: 10, max: 500, step: 10, def: 100 },
    knnK: { min: 1, max: 15, step: 1, def: 5 },
    kClusters: { min: 2, max: 30, step: 1, def: 8 },
    mlpHidden: { min: 4, max: 128, step: 2, def: 24 },
    mlpEpochs: { min: 50, max: 2000, step: 50, def: 400 },
    cloudMax: { min: 0, max: 90, step: 5, def: 60 }
  };

  function classesOf(scheme) {
    return SCHEMES[scheme === "crops" ? "crops" : "general"].classes;
  }
  function classById(id, scheme) {
    var list = classesOf(scheme);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function algorithmByKey(key) {
    for (var i = 0; i < ALGORITHMS.length; i++) if (ALGORITHMS[i].key === key) return ALGORITHMS[i];
    return ALGORITHMS[0];
  }
  /** class ids of a scheme that compete in a season family */
  function activeClassIds(scheme, family) {
    var s = SCHEMES[scheme === "crops" ? "crops" : "general"];
    return (s.active[family] || s.active.full).slice();
  }
  function activeClasses(scheme, family) {
    var ids = activeClassIds(scheme, family);
    return ids.map(function (id) { return classById(id, scheme); }).filter(Boolean);
  }
  /** season family of a period: preset → its family; custom → detected from the dates */
  function seasonFamily(season, dateFrom, dateTo) {
    for (var i = 0; i < SEASONS.length; i++) if (SEASONS[i].key === season) return SEASONS[i].family;
    return detectFamily(dateFrom, dateTo);
  }
  /** Winter months: Nov–Apr; summer: May–Oct. Majority wins; tie → the family
   *  of the first month — winter and summer crops never mix in one model. */
  function detectFamily(dateFrom, dateTo) {
    var a = new Date(String(dateFrom || "") + "T00:00:00Z");
    var b = new Date(String(dateTo || "") + "T00:00:00Z");
    if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return "winter";
    var isWinter = function (m) { return m === 11 || m === 12 || m <= 4; };
    var winter = 0, summer = 0, n = 0;
    var d = new Date(a.getTime());
    while (d.getTime() <= b.getTime() && n < 48) {
      if (isWinter(d.getUTCMonth() + 1)) winter++; else summer++;
      d.setUTCMonth(d.getUTCMonth() + 1); n++;
    }
    if (winter > summer) return "winter";
    if (summer > winter) return "summer";
    return isWinter(a.getUTCMonth() + 1) ? "winter" : "summer";
  }
  /** Same dates the engine's resolvePeriod() produces (season labelled by the year it ENDS). */
  function period(season, year, dateFrom, dateTo) {
    var y = year || DEFAULT_YEAR;
    if (season === "winter") return { dateFrom: (y - 1) + "-11-01", dateTo: y + "-04-30" };
    if (season === "early_winter") return { dateFrom: (y - 1) + "-10-01", dateTo: y + "-01-31" };
    if (season === "late_winter") return { dateFrom: y + "-02-01", dateTo: y + "-05-31" };
    if (season === "summer") return { dateFrom: y + "-05-01", dateTo: y + "-10-31" };
    if (season === "summer_peak") return { dateFrom: y + "-06-01", dateTo: y + "-09-30" };
    if (season === "full") return { dateFrom: y + "-01-01", dateTo: y + "-12-31" };
    return { dateFrom: dateFrom || "", dateTo: dateTo || "" };
  }
  function defaults() {
    var out = {};
    Object.keys(PARAMS).forEach(function (k) { out[k] = PARAMS[k].def; });
    return out;
  }

  function lookup(dict, path) {
    var parts = path.split(".");
    var node = dict;
    for (var i = 0; i < parts.length; i++) {
      if (node == null) return null;
      node = node[parts[i]];
    }
    return node == null ? null : node;
  }
  function fill(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? "" : String(vars[k]); });
  }
  function t(path, vars) {
    var v = lookup(current === "ar" ? ar : en, path);
    if (typeof v === "string") return fill(v, vars);
    if (v && typeof v === "object") return v; // arrays / objects returned raw
    return path;
  }
  function lang() { return current; }
  function dir() { return current === "ar" ? "rtl" : "ltr"; }
  function setLang(l) {
    current = l === "en" ? "en" : "ar";
    try { localStorage.setItem(KEY_LANG, current); } catch (e) { /* no storage */ }
    return current;
  }
  function fmt(n, digits) {
    if (n == null || !isFinite(n)) return "—";
    var d = digits == null ? 2 : digits;
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function unit(n, unitKey, digits) {
    return fmt(n, digits) + " " + (unitKey ? t("units." + unitKey) : "");
  }

  var en = {
    meta: {
      title: "Delta Vision — land cover and crop maps of the Nile Delta",
      description: "Two-level Sentinel-2 classification of the Nile Delta: 4 land-cover classes and 11 seasonally filtered crop classes, 10 algorithms, areas in feddan."
    },
    brand: { name: "Delta Vision", tagline: "Two-level land cover & crop classification from Sentinel-2" },
    nav: {
      home: "Home", workspace: "Workspace", algorithms: "Algorithms", upload: "Data upload", guide: "Guide",
      login: "Log in", logout: "Log out", getStarted: "Get started", menu: "Menu", closeMenu: "Close menu", account: "Account", langLabel: "العربية"
    },
    units: { feddan: "feddan", km2: "km²", ha: "hectares", m2: "m²", ton: "t" },
    common: {
      back: "Back", cancel: "Cancel", apply: "Apply", clear: "Clear", remove: "Remove", replace: "Replace", download: "Download", print: "Print",
      loading: "Loading…", preview: "Preview", close: "Close", optional: "optional", error: "Something went wrong", unknownError: "Unexpected error ({code}).",
      pages: "Page {n} of {total}", of: "of", prev: "Previous", next: "Next",
      toasts: { signedUp: "Account created. Welcome, {name}!", welcomed: "Welcome back, {name}.", loggedOut: "You are logged out." }
    },
    home: {
      badge: "Sentinel-2 · Google Earth Engine · Nile Delta",
      title: "Two-level maps of the Delta, measured in feddan",
      subtitle: "Delta Vision classifies Sentinel-2 imagery at two levels trained on the same 360 verified field points: a reliable land-cover level (Water, Urban, Bare Land, Cropland) and a seasonally filtered crop-type level with the accuracy measured on a held-out 30 % — never inflated. Draw a study area or upload your own data, choose a period and an algorithm, and read the result on the map and in the table.",
      ctaPrimary: "Start classifying", ctaSecondary: "How it works",
      chipAlgo: "11 algorithms", chipRes: "10 m pixels", chipShp: "SHP & CSV upload", chipLevels: "2 classification levels",
      heroAlt: "Fields and a village of the Nile Delta seen from the air",
      floatLabel: "feddan in the built-in Borj El Arab study area",
      stats: [
        { value: "4 + 11", label: "classes on two levels", text: "Level 1 — land cover: Water, Urban, Bare land, Cropland. Level 2 — crop type: the 11 classes of the built-in sample set, seasonally filtered so winter and summer crops never share one model." },
        { value: "238.095", label: "feddan in one square kilometre", text: "One feddan is 4,200 m². Areas are geodesic on the WGS84 ellipsoid — the same quantity Earth Engine reports." }
      ],
      slideAlt: "Photo {n} of {total}",
      slides: [
        { kicker: "From orbit", title: "The Delta, every five days", text: "The two Sentinel-2 satellites revisit each patch of the Delta every five days. Delta Vision composites the cloud-free scenes of the season into one feature stack per pixel." },
        { kicker: "In the field", title: "Every parcel keeps its identity", text: "Upload the boundaries of your fields, district or command area as a shapefile or GeoJSON. Each parcel is outlined on the map and listed with its own area in feddan." },
        { kicker: "Trained on real points", title: "360 verified field samples", text: "Every supervised model trains on a built-in reference set of 360 labelled points. Accuracy is measured on a held-out 30 % split, grouped by point, before any number reaches the screen." },
        { kicker: "Winter · November to April", title: "9 winter classes", text: "In the winter family the model competes Wheat, Sugar Beet, Potato, Citrus, Medicinal Plants, Vegetables, Bare Land, Urban and Water — 294 points. Maize and Grapes are strictly excluded as out of season." },
        { kicker: "Summer · May to October", title: "8 summer classes", text: "In the summer family the model competes Maize, Grapes, Citrus, Medicinal Plants, Vegetables, Bare Land, Urban and Water — 252 points. Wheat, Sugar Beet and Potato are strictly excluded." }
      ],
      product: {
        kicker: "Outputs", watermark: "Output", title: "What every run delivers",
        text: "Four outputs for each study area: the map, the feddan report, the accuracy report and the boundaries you started from.",
        more: "Open the workspace",
        ask: "All of it works in Arabic and English, on the phone as on the desk.",
        items: [
          { title: "Classification map", text: "Every pixel coloured by class over satellite imagery, with a clickable legend, opacity control and an A/B slider that wipes between image and classification." },
          { title: "Feddan report", text: "Area of every class in feddan, km² and percent, per parcel and for the whole study area — exportable as CSV and printable as a report." },
          { title: "Accuracy report", text: "Overall accuracy, Kappa and per-class PA/UA/F1 from the held-out 30 % of the sample points, plus the full confusion matrix." },
          { title: "Decision support", text: "For crop classes, indicative yield and water figures per feddan — planning numbers, clearly labelled as indicative." }
        ]
      },
      features: {
        title: "Built for the Delta workflow",
        text: "From imagery to a defensible table in four steps — in Arabic first.",
        cta: "Open the workspace",
        note: "Delta Vision runs the same pipeline as the graduation-project engine behind it: Sentinel-2 L2A, SCL cloud masking, monthly median composites, and a 70/30 grouped split of the reference points.",
        items: [
          { title: "Upload a shapefile or GeoJSON", text: ".shp with .dbf, .prj and .cpg, a .zip of them, or a .geojson — parcels are outlined on the map with their own feddan areas." },
          { title: "Pick a period, not just a season", text: "Whole seasons or 4-month agronomic windows (Oct–Jan, Feb–May, Jun–Sep); a custom range detects its dominant season and filters the classes for you." },
          { title: "Choose the level, then the algorithm", text: "Level 1 land cover for a reliable map, Level 2 crop type for seasonal detail — 9 supervised algorithms, K-Means and the instant scan." },
          { title: "Compare algorithms fairly", text: "The league table trains all supervised algorithms on the same split of the same points and ranks them by measured overall accuracy." }
        ]
      },
      steps: {
        title: "From orbit to feddan in four steps",
        items: [
          { title: "Create an account", text: "Sign up, or open the demo account to look around. Accounts and run history live on the server." },
          { title: "Draw or upload a study area", text: "Use the built-in Borj El Arab boundary, draw a rectangle or polygon, type coordinates, or upload a shapefile / GeoJSON." },
          { title: "Choose level, period and algorithm", text: "Land cover or crop type; a season preset or a custom range; one of the eleven algorithms with its parameters." },
          { title: "Read the map and the numbers", text: "Feddan per class, accuracy from the held-out points, the confusion matrix, and a CSV / GeoTIFF export." }
        ]
      },
      cta: {
        title: "Classify your own command area",
        text: "Free to try with the demo account — every algorithm runs for real on Earth Engine.",
        button: "Create an account", login: "I already have one"
      },
      aiNote: "Accuracy figures shown anywhere in the app are measured on the held-out split of the 360-point reference set — never hand-tuned or inflated."
    },

    login: {
      back: "Back", title: "Welcome back", subtitle: "Log in to open the workspace and your run history.",
      email: "E-mail", emailPh: "you@example.com", password: "Password",
      submit: "Log in", alt: "New here?", toSignup: "Create an account",
      required: "This field is required",
      error: { BAD_CREDENTIALS: "Wrong e-mail or password.", STORAGE: "Could not reach the account service. Try again." },
      demoTitle: "Demo account", demoText: "Look around with the ready-made account — nothing you run is stored.",
      demoEmail: "E-mail", demoPassword: "Password", demoButton: "Open demo"
    },
    signup: {
      back: "Back", title: "Create your account", subtitle: "One minute, and the workspace is yours.",
      name: "Name", namePh: "Your name", org: "Organisation", orgPh: "Company, faculty, co-op…",
      email: "E-mail", emailPh: "you@example.com", password: "Password", passwordHint: "At least 8 characters.",
      confirm: "Confirm password", confirmPh: "Repeat the password",
      submit: "Create account", alt: "Already registered?", toLogin: "Log in",
      error: {
        name: "Please tell us your name.", email: "This does not look like an e-mail address.",
        password: "At least 8 characters.", confirm: "The two passwords do not match.",
        EMAIL_TAKEN: "This e-mail is already registered.", STORAGE: "Could not reach the account service. Try again."
      },
      note: "Accounts are stored on the server; if it cannot be reached the account is kept in this browser only."
    },

    ws: {
      title: "Workspace",
      subtitle: "Choose the level, the period and the algorithm — the map and the numbers follow.",
      previewBadge: "Preview mode",
      liveBadge: "Earth Engine live",
      previewText: "This deployment has no Earth Engine key: the map shows an illustrative pattern, not a real classification. Everything else works exactly the same.",
      level: {
        title: "Classification level",
        general: "Land cover",
        generalSub: "4 classes",
        crops: "Crop type",
        cropsSub: "seasonal",
        hint: "Both levels train on the same 360 verified points. Land cover is the reliable level; crop type shows the real measured seasonal accuracy — spectral overlap between crop types is significant, so always read the accuracy panel.",
        generalHint: "Water · Urban · Bare land · Cropland — the level with the strongest measured accuracy (~85 %).",
        cropsHint: "The 11 crop classes of the sample set, strictly filtered by season."
      },
      season: {
        title: "Period",
        winter: "Winter",
        early_winter: "Early winter",
        late_winter: "Late winter",
        summer: "Summer",
        summer_peak: "Summer peak",
        full: "Full year",
        year: "Year",
        period: "Scenes: {from} → {to}",
        custom: "Custom range",
        customFrom: "From", customTo: "To", customApply: "Apply range", customClear: "Back to presets",
        detected: "Detected season: {family}",
        badgeActive: "{n} active classes · {points} points",
        badgeExcluded: "out of season: {classes}",
        fullNote: "The full-year period is available for the land-cover level only — winter and summer crops never share one model.",
        months: { winter: "Nov–Apr", early_winter: "Oct–Jan", late_winter: "Feb–May", summer: "May–Oct", summer_peak: "Jun–Sep", full: "Jan–Dec" },
        family: { winter: "winter", summer: "summer", full: "full year" },
        competing: "Competing classes: {classes}"
      },
      studyArea: "Study area",
      tabs: { upload: "Upload", draw: "Draw", circle: "Circle", bbox: "Box" },
      upload: {
        drop: "Drop the shapefile here", or: "or", browse: "browse",
        hint: ".shp + .dbf + .prj (+ .cpg / .shx), or a .zip / .geojson of them.",
        encoding: "Text encoding", processing: "Reading the shapefile…", applied: "Study area applied.",
        layer: "Layer", crs: "Coordinate system", crsLatLon: "WGS84 (lat/lon)", parcels: "Parcels", features: "{n} features",
        geometry: "Geometry types", area: "Total area", fileTooBig: "A file is larger than 25 MB.", zipOnlyOne: "The .zip must contain exactly one shapefile."
      },
      sample: {
        button: "Use the built-in study area (Borj El Arab)",
        text: "Borj El Arab: {area} feddan, {vertices} vertices, geodesic area."
      },
      draw: { hint: "Click the map to add corners; click the first corner (or press Esc) to finish.", polygon: "Draw polygon", rectangle: "Draw rectangle", clear: "Cancel", first: "Click the first corner again to close the polygon." },
      circle: { hint: "Centre and radius in kilometres — a circular AOI is built geodesically.", lon: "Centre longitude", lat: "Centre latitude", radius: "Radius (km)", apply: "Build circle" },
      bbox: { hint: "Two corners of a box in degrees.", minLon: "West", minLat: "South", maxLon: "East", maxLat: "North", apply: "Build box" },
      aoi: {
        kinds: { draw: "Drawn area", circle: "Circle area", bbox: "Box area", geojson: "GeoJSON area" },
        total: "{feddan} feddan · {km2} km²",
        perParcel: "{n} parcels", clear: "Clear the study area", removePoint: "Remove this point",
        outlinesCapped: "Showing {n} of {total} outlines on the map."
      },
      invalidCoords: "Those coordinates are out of range.", invalidRadius: "The radius must be between 0.01 and 500 km.",
      needAoi: "Choose a study area first.",
      algorithm: {
        title: "Algorithm",
        more: "How the algorithms differ",
        rfTrees: "Random-Forest trees", knnK: "k-NN neighbours", kClusters: "K-Means clusters",
        mlpHidden: "MLP hidden units", mlpEpochs: "MLP epochs",
        cloud: "Max cloud cover %"
      },
      samples: {
        title: "Training samples",
        hint: "Built-in: the 360 verified reference points (Borj El Arab area) train every run. Add your own points — at least 20 over 2 classes — to train on them instead.",
        class: "Class",
        pick: "Pick points", stop: "Stop picking", pickHint: "Click the map to add points of class: {class}",
        upload: "Upload CSV", clear: "Clear",
        none: "No manual points — the built-in 360-point reference set will train the run.",
        few: "{n} points over {k} classes — 20 points over 2 classes are needed before they replace the built-in set.",
        ok: "{n} points over {k} classes — your points replace the built-in set.",
        unused: "This algorithm trains itself: the sample set is not used.",
        loaded: "{n} samples loaded.", skipped: " {n} rows skipped.", inactive: "out of season",
        csvHint: "CSV or semicolon-separated; columns lon/lat/class or POINT_X/POINT_Y/ClassName — class can be the code (WHT), the id (1) or the name (Wheat).",
        groundTruth: "Ground-truth points", gtHint: "Show the 360 built-in reference points on the map, coloured by class."
      },
      run: "Run classification", running: "Running…",
      historyBtn: "History", compareBtn: "Compare algorithms", leagueBtn: "Accuracy league",
      map: {
        aria: "Study area map",
        satellite: "Satellite", streets: "Streets", hybrid: "Hybrid", dark: "Dark",
        scene: { truecolor: "True colour", ndvi: "NDVI", ndwi: "NDWI" },
        opacity: "Overlay opacity",
        fit: "Zoom to AOI", fullscreen: "Fullscreen", latlon: "Cursor: {lat}, {lon}",
        outline: "AOI outline — run a classification to fill it.",
        overlay: "Classification", gt: "Ground truth", aoi: "AOI outline",
        ab: "A/B", abHint: "Drag the handle to wipe between the satellite image and the classification.",
        reset: "Reset to study area", geojson: "GeoJSON",
        none: "Blank basemap", geojsonExport: "Export the study area (GeoJSON)", geojsonImport: "Import GeoJSON area",
        inspectHint: "Click anywhere on the map to inspect that pixel (NDVI series for the selected period)."
      },
      results: {
        title: "Results", empty: "Run a classification to see the map, the feddan table and the accuracy report.",
        run: "{algo} · {season} · {period}",
        level: "Level {level} — {name}",
        total: "Total area", parcels: "Parcels",
        oa: "Overall accuracy", kappa: "Kappa", notComputed: "not computed",
        class: "Class", percent: "Share", pa: "PA (recall)", ua: "UA (precision)", f1: "F1",
        tableTitle: "Classes", parcelsTitle: "Parcels", parcel: "Parcel",
        cluster: "Cluster {n}", clusters: "clusters",
        confusionTitle: "Confusion matrix (rows = reference, columns = prediction)",
        confusionHint: "Read a row as: of the reference pixels of that class, the share predicted into each column.",
        dssTitle: "Decision support — indicative", dssHint: "Indicative Egyptian planning figures per feddan, not measurements.",
        dssCrop: "Crop", dssYield: "Indicative yield (t)", dssWater: "Indicative water (m³)",
        dssTotalYield: "Indicative yield total", dssTotalWater: "Indicative water total",
        clusters: "clusters", mode: "Mode", modeLive: "Earth Engine", modePreview: "Preview",
        export: "Export CSV", parcelsCsv: "Parcels CSV", print: "Print report", download: "GeoTIFF",
        png: "Classified image (PNG)", pngHint: "Export a publication-ready classified map: full AOI, active legend, no basemap",
        pngStitching: "Rendering the classified image…", pngTiles: "Fetching Earth Engine tiles ({n} tiles)…",
        pngNoTiles: "The classified layer has expired — run the classification again, then export.",
        pngFailed: "The image export failed ({err}).",
        tifOk: "GeoTIFF downloaded: {size} at {scale} m/px", tifFailed: "The GeoTIFF download failed ({err}).",
        printTitle: "Delta Vision — classification report",
        printIntro: "Full-frame classified map, class areas and validation matrix.",
        geojsonOk: "GeoJSON downloaded: {n} features, {area} feddan", geojsonEmpty: "Draw or load a study area first.",
        stageFetch: "Fetching Sentinel-2 imagery…", stageTrain: "Training the model…", stageRender: "Rendering the map…",
        fromCache: "shown from cache", rerun: "Re-run fresh",
        confusionCaption: "Pixel-based validation: {pixels} pixels sampled from {points} withheld test points (70/30 split by point).",
        confusionNoPoints: "Pixel-based validation: {pixels} validation pixels.",
        signatureTitle: "Reference signatures — {season}",
        signatureText: "Mean NDVI and the 10–90 % range of each class, measured at the built-in reference points.",
        insight: "Measured accuracy is low at this level: crop types overlap strongly in the Sentinel-2 signal. Switch to the land-cover level for a reliable map, or add crop-specific samples.",
        trainingSet: "{source} ({n} points · {k} classes) · {split} split"
      },
      history: {
        title: "Run history", close: "Close", text: "Every finished run of this account, newest first.",
        when: "When", algo: "Algorithm", area: "Study area", mode: "Mode", empty: "No runs yet — the history fills as you work.",
        open: "Open", delete: "Delete", deleted: "Run deleted.", error: "Could not load that run.", loaded: "Run restored."
      },
      compare: {
        title: "Compare algorithms", close: "Close",
        computed: "OA {oa}% · κ {k} (measured)",
        text: "Pick an algorithm to run it now on the same study area, period and level.",
        cols: { algo: "Algorithm", family: "Family", samples: "Needs samples", accuracy: "Accuracy", params: "Parameters", choose: "Run" }
      },
      league: {
        title: "Accuracy league", hint: "All supervised algorithms, trained on the same split of the same reference points, ranked by measured overall accuracy.",
        running: "Training every algorithm on the same split…", winner: "best", failed: "failed",
        loadBest: "Show the winner on the map",
        cols: { algo: "Algorithm", oa: "Overall accuracy", kappa: "Kappa" }
      },
      gee: { checking: "Checking Earth Engine…", live: "Earth Engine live", preview: "Preview mode", unsure: "Earth Engine status not verified" },
      ndvi: { title: "NDVI at this point", loading: "Loading the NDVI series…", empty: "No cloud-free observations at this point in the selected period." },
    notes: {
      preview: "Preview mode: illustrative pattern, not a real classification.",
      no_accuracy: "Too few validation points for an accuracy measurement.",
      kmeans_no_accuracy: "K-Means is unsupervised: no class labels, no accuracy.",
      instant_estimate: "Instant scan: an estimate from the measured reference statistics, not a trained model.",
      samples_far: "The study area lies far from the built-in sample set — treat the result with care.",
      season_detected: "The custom range spans both seasons: the dominant one was used, so winter and summer crops stay separated.",
      weak_accuracy: "Measured accuracy is low at this level: crop types overlap strongly in the Sentinel-2 signal.",
      builtin_training: "Trained on the built-in reference set",
      manual_training: "Trained on your uploaded points"
    },
    },

    errors: {
      SHP_MISSING: "A .shp file is required.", DBF_MISSING: "A .dbf file is required (the attribute table).",
      NO_POLYGONS: "No polygons found in that shapefile.", NOT_SHAPEFILE: "That file is not a shapefile.",
      BAD_SHP: "The shapefile could not be read.", BAD_PRJ: "The .prj could not be parsed.", BAD_GEOJSON: "The GeoJSON could not be read.",
      CSV_EMPTY: "The CSV file is empty.", CSV_COLUMNS: "The CSV needs longitude, latitude and class columns.",
      ZIP_BROKEN: "The .zip could not be read.", ZIP64: "ZIP64 archives are not supported.", ZIP_UNSUPPORTED: "That compression method is not supported.",
      DBF_BROKEN: "The .dbf could not be read.", SHP_BROKEN: "The .shp could not be read.", PRJ_UNSUPPORTED: "That .prj projection is not supported.",
      EMAIL_TAKEN: "This e-mail is already registered.", BAD_CREDENTIALS: "Wrong e-mail or password.", STORAGE: "Could not reach the account service. Try again.",
      BAD_DBF: "The .dbf could not be read.", PRJ_MISSING: "No .prj file — the layer is assumed to be WGS84.",
      UNSUPPORTED_CRS: "That coordinate system is not supported.",
      BACKEND: "The server did not answer. Try again.", BACKEND_401: "Please log in again.", BACKEND_429: "Too many requests — wait a moment.",
      BACKEND_500: "The server hit an error. Try again.", BACKEND_503: "The classification service is busy — try again shortly.",
      BACKEND_TIMEOUT: "The run took too long. Try a smaller area or a shorter period.", BACKEND_BAD: "The server answered with an unexpected result.",
      gee_not_configured: "Earth Engine is not configured on this server — the app stays in preview mode.",
      no_images: "No cloud-free Sentinel-2 scenes in that period — widen the dates or raise the cloud limit.",
      popup_blocked: "The report window was blocked — allow pop-ups for this site.", bad_date_range: "The date range is invalid.", too_few_samples: "Too few sample points are in season for this period.",
      mahalanobis_needs_samples: "Mahalanobis needs more training pixels per class — add samples or pick another algorithm.",
      samples_outside_aoi: "No sample point produced a valid pixel — check the period or the cloud limit.",
      unknown_algorithm: "Unknown algorithm.", all_algorithms_failed: "Every algorithm failed to train on this window.",
      scene_failed: "The scene layer could not be loaded.", ndvi_failed: "The NDVI series could not be loaded.",
      no_active_classes: "No class is active for this period."
    },
    warns: {
      reprojected: "Reprojected from {src} to WGS84.", prjMissing: "No .prj — assumed WGS84.",
      cpgMismatch: "The .cpg and .dbf encodings disagree; the .cpg won.", otherLayers: "More layers inside: {names}"
    },

    algo: {
      title: "Algorithms",
      subtitle: "Eleven ways to turn one feature stack into a map — all trained on the same 360 verified points and measured on the same held-out 30 %.",
      cta: "Open the workspace",
      group: { supervised: "Supervised", unsupervised: "Unsupervised", knowledge: "Knowledge-based" },
      groupText: {
        supervised: "A model is fitted to the labelled reference points, then applied to every pixel. Accuracy is measured on the held-out 30 % of the points.",
        unsupervised: "Pixels are grouped by spectral similarity alone — no labels, no accuracy: a structure map.",
        knowledge: "No training at all: pixels are matched to the class statistics measured at the reference points."
      },
      labels: { needs: "Needs samples", accuracy: "Accuracy", params: "Parameters", yes: "yes", no: "no", none: "—", measured: "measured", fixed: "fixed" },
      names: {
        rf: "Random Forest", svm: "SVM (RBF)", cart: "CART decision tree", gtb: "Gradient Tree Boosting",
        nb: "Naive Bayes", mlp: "Neural network (MLP)", knn: "k-Nearest Neighbours",
        mindist_e: "Minimum distance (Euclidean)", mindist_m: "Minimum distance (Mahalanobis)",
        kmeans: "K-Means clustering", signature: "Instant scan"
      },
      text: {
        rf: "An ensemble of decision trees, each fitted to a random slice of the training pixels; the class with the most votes wins the pixel. Robust, parallel, and consistently the strongest performer on the reference set.",
        svm: "A support-vector machine with the RBF kernel: it draws the best separating boundary between classes in feature space. Sensitive to feature scale, so it shines on the decorrelated summary bands.",
        cart: "A single interpretable decision tree: every split is a threshold on one band you can read and explain — the honest choice when the map must be defended line by line.",
        gtb: "Boosted shallow trees built one after another, each correcting the previous one's mistakes. Often the closest challenger to the random forest on small sample sets.",
        nb: "Gaussian Naive Bayes: per class and per band it assumes an independent normal distribution — fast, simple, and a useful baseline for what the bands alone can explain.",
        mlp: "A one-hidden-layer neural network trained in the server and replayed per pixel inside Earth Engine as band math — the same network, the same result, at planetary scale.",
        knn: "A pixel is labelled by the majority of its k nearest training pixels in feature space. With 360 reference points it behaves like a local memory of the fields.",
        mindist_e: "Every pixel joins the class whose mean is nearest in Euclidean distance — the classic nearest-mean classifier, transparent and fast.",
        mindist_m: "The same nearest-mean idea, but distances are scaled by the covariance of the training data, so correlated bands stop dominating. Runs on the 9 decorrelated summary bands.",
        kmeans: "Pixels are clustered into k spectral groups with no labels at all — the map to reach for when you want structure, not names.",
        signature: "No training: each pixel is scored against the mean/std statistics measured at the 360 reference points with a Gaussian naive-Bayes distance. An instant estimate, clearly labelled as such."
      },
      protocol: {
        title: "The pipeline behind every run",
        items: [
          { title: "A feature stack per pixel", text: "For every pixel the engine stacks monthly medians of NDVI, NDWI and NDMI for the period, NDVI statistics (p10, median, p90, mean, std) and the B4/B8/B11/B12 medians — 21 to 45 bands depending on the window." },
          { title: "Cloud masking", text: "Sentinel-2 L2A scene-classification pixels marked as cloud, shadow or cirrus are removed before any composite; the cloud-percentage ceiling is yours to set." },
          { title: "Seasonal class filtering", text: "The period's season family decides the class list: winter windows keep the 9 winter classes, summer windows the 8 summer classes — off-season crops never enter a model." },
          { title: "Training on the reference points", text: "Features are sampled at the 360 labelled points (AOI plus the sample area), about 7 pixels per point, and split 70/30 per class with all pixels of a point kept on the same side." },
          { title: "Measured accuracy", text: "OA, Kappa and per-class PA/UA/F1 are computed on the held-out 30 % only — the numbers on the screen are measurements, not expectations." }
        ]
      }
    },

    upload: {
      title: "Data upload", subtitle: "Prepare your data here, then open the workspace with everything in place.",
      shpTitle: "Study-area shapefile / GeoJSON", shpText: "The polygons you want to classify — parcels, a district, a command area.",
      csvTitle: "Training samples CSV", csvText: "Your own labelled points. At least 20 points over 2 classes replace the built-in reference set.",
      template: "Download the CSV template", open: "Open the workspace", summaryTitle: "Ready to use",
      attributes: "Attribute preview", rows: "First {n} of {total} rows.", kept: "Everything is kept on your device until you open the workspace."
    },

    guide: {
      title: "Guide", subtitle: "The short path from imagery to a defensible table.",
      stepsTitle: "Step by step", faqTitle: "Frequently asked",
      steps: [
        { title: "Create an account or open the demo", text: "Sign-up asks for a name, an e-mail and a password (8+ characters). The demo account needs nothing." },
        { title: "Choose the classification level", text: "Level 1 — land cover (Water, Urban, Bare land, Cropland) is the reliable level. Level 2 — crop type adds the 11 classes of the reference set, seasonally filtered, with its real measured accuracy." },
        { title: "Pick a period", text: "A whole season (Nov–Apr or May–Oct), a 4-month window (Oct–Jan, Feb–May, Jun–Sep) or a custom range. The dominant season is detected for custom ranges and the class list follows it." },
        { title: "Set the study area", text: "The built-in Borj El Arab boundary, a drawn rectangle or polygon, a circle or box by coordinates, or an uploaded shapefile / GeoJSON." },
        { title: "Run and compare", text: "Run one algorithm, then open the accuracy league to train all supervised algorithms on the same split and rank them by measured overall accuracy." },
        { title: "Export", text: "The class table as CSV, the classified raster as GeoTIFF, and the whole report through the print view." }
      ],
      faq: [
        { q: "Where do the training points come from?", a: "A verified reference set of 360 labelled points in the Borj El Arab area, built into the engine. Upload your own CSV (20+ points over 2 classes) to train on your data instead." },
        { q: "Why two classification levels?", a: "The reference set separates Water, Urban, Bare land and Cropland reliably (~85 % measured), but crop types overlap strongly in the Sentinel-2 signal. Level 1 gives you the reliable map; Level 2 gives the seasonal detail with its honest measured accuracy." },
        { q: "Why are some classes missing in some periods?", a: "Winter and summer crops never share one model: winter windows exclude Maize and Grapes (294 points stay), summer windows exclude Wheat, Sugar Beet and Potato (252 points stay). A badge in the workspace always shows the active and the excluded classes." },
        { q: "How is accuracy measured?", a: "The reference points are split 70/30 per class, grouped so all pixels of one point stay on the same side. Every accuracy number in the app comes from the held-out 30 % only." },
        { q: "Which algorithm should I use?", a: "Random Forest is the safest default. The accuracy league trains all nine supervised algorithms on the same split and ranks them — try it before writing the report." },
        { q: "What is the instant scan?", a: "A no-training estimate: each pixel is scored against the class statistics measured at the reference points. Instant, clearly labelled as an estimate, useful as a first look." },
        { q: "Are the yield and water numbers measurements?", a: "No — they are indicative Egyptian planning figures per feddan, labelled as such everywhere they appear." }
      ],
      limitsTitle: "What is real and what is not",
      limits: {
        real: { title: "Live classification", text: "With the Earth Engine key configured, every run is a real classification: real composites, real training, real measured accuracy." },
        preview: { title: "Preview mode", text: "Without the key, the map shows an illustrative pattern so the interface stays explorable; nothing is classified for real." },
        demo: { title: "The demo account", text: "A ready-made account with the same pipeline. Run history is stored on the server for signed-in accounts." }
      }
    },

    report: {
      title: "Delta Vision — classification report",
      studyArea: "Study area", period: "Period", algorithm: "Algorithm", level: "Level",
      params: "Parameters", generated: "Generated",
      disclaimer: "Areas are geodesic (WGS84). Accuracy is measured on the held-out 30 % of the reference points. Indicative yield and water figures are planning values, not measurements."
    },

    footer: {
      links: "Delta Vision", credits: "Credits",
      about: "Delta Vision turns Sentinel-2 imagery into two-level land-cover and crop maps of the Nile Delta, trained on 360 verified field points and reported in feddan.",
      data: "Imagery: Copernicus Sentinel-2 (ESA) processed on Google Earth Engine.",
      software: "Built as an Arabic-first single-page app with a serverless Earth Engine backend.",
      build: "Class scheme, reference statistics and this site all come from the same data file.",
      rights: "© Delta Vision — graduation project."
    }
  };

  var ar = {
    meta: {
      title: "دلتا فيجن — خرائط غطاء الأرض والمحاصيل لدلتا النيل",
      description: "تصنيف Sentinel-2 على مستويين لدلتا النيل: 4 فئات لغطاء الأرض و11 فئة محاصيل بترشيح موسمي، و10 خوارزميات، والمساحات بالفدان."
    },
    brand: { name: "دلتا فيجن", tagline: "تصنيف غطاء الأرض والمحاصيل من Sentinel-2 على مستويين" },
    nav: {
      home: "الرئيسية", workspace: "مساحة العمل", algorithms: "الخوارزميات", upload: "رفع البيانات", guide: "الدليل",
      login: "تسجيل الدخول", logout: "تسجيل الخروج", getStarted: "ابدأ الآن", menu: "القائمة", closeMenu: "إغلاق القائمة", account: "الحساب", langLabel: "English"
    },
    units: { feddan: "فدان", km2: "كم²", ha: "هكتار", m2: "م²", ton: "طن" },
    common: {
      back: "رجوع", cancel: "إلغاء", apply: "تطبيق", clear: "مسح", remove: "إزالة", replace: "استبدال", download: "تنزيل", print: "طباعة",
      loading: "جارٍ التحميل…", preview: "معاينة", close: "إغلاق", optional: "اختياري", error: "حدث خطأ ما", unknownError: "خطأ غير متوقع ({code}).",
      pages: "شريحة {n} من {total}", of: "من", prev: "السابق", next: "التالي",
      toasts: { signedUp: "تم إنشاء الحساب. أهلًا بك يا {name}!", welcomed: "أهلًا بعودتك يا {name}.", loggedOut: "تم تسجيل خروجك." }
    },
    home: {
      badge: "Sentinel-2 · Google Earth Engine · دلتا النيل",
      title: "خرائط للدلتا على مستويين، بالفدان",
      subtitle: "يصنّف دلتا فيجن صور Sentinel-2 على مستويين يُدرَّبان على 360 نقطة حقلية موثّقة: مستوى غطاء أرضي موثوق (مياه، عمران، أرض بور، أراضٍ زراعية)، ومستوى محاصيل مُرشَّح موسميًا تُعرض دقته الحقيقية المقاسة على 30% محتجزة — بلا أي تضخيم. ارسم منطقة دراسة أو ارفع بياناتك، واختر الفترة والخوارزمية، واقرأ النتيجة على الخريطة وفي الجدول.",
      ctaPrimary: "ابدأ التصنيف", ctaSecondary: "كيف يعمل؟",
      chipAlgo: "١١ خوارزمية", chipRes: "دقة 10 م", chipShp: "رفع SHP و CSV", chipLevels: "مستويان للتصنيف",
      heroAlt: "حقول وقرية في دلتا النيل من الجو",
      floatLabel: "فدان داخل منطقة الدراسة المدمجة برج العرب",
      stats: [
        { value: "4 + 11", label: "فئة على مستويين", text: "المستوى الأول — غطاء الأرض: مياه، عمران، أرض بور، أراضٍ زراعية. المستوى الثاني — المحاصيل: 11 فئة من عينات المرجع، مُرشَّحة موسميًا حتى لا تجتمع شتوية وصيفية في نموذج واحد أبدًا." },
        { value: "238.095", label: "فدان في كيلومتر مربع واحد", text: "الفدان 4200 م². المساحات جيوديسية على سطح WGS84 — نفس الكمية التي يعلنها Earth Engine." }
      ],
      slideAlt: "صورة {n} من {total}",
      slides: [
        { kicker: "من المدار", title: "الدلتا كل خمسة أيام", text: "يقوم قمرا Sentinel-2 بزيارة كل بقعة من الدلتا كل خمسة أيام. يجمع دلتا فيجن مشاهد الموسم الخالية من السحب في حزمة صفات واحدة لكل بكسل." },
        { kicker: "في الحقل", title: "كل قطعة تحتفظ بهويتها", text: "ارفع حدود حقولك أو قريتك أو منطقتك كملف شكل أو GeoJSON؛ تُرسَم حدود كل قطعة على الخريطة وتُدرَج مساحتها بالفدان." },
        { kicker: "تدريب على نقاط حقيقية", title: "360 عينة حقلية موثّقة", text: "كل نموذج موجَّه يُدرَّب على طقم مرجعي مدمج من 360 نقطة معنونة. تُقاس الدقة على 30% محتجزة، مجمّعة بالنقطة، قبل أن يصل أي رقم إلى الشاشة." },
        { kicker: "الشتوية · نوفمبر–أبريل", title: "9 فئات شتوية", text: "في الفصل الشتوي تنافس 9 فئات: القمح والبنجر والبطاطس والموالح والنباتات الطبية والخضروات والأرض البور والعمران والمياه — 294 نقطة، مع استبعاد الذرة والعنب قطعًا لخروجهما عن الموسم." },
        { kicker: "الصيفية · مايو–أكتوبر", title: "8 فئات صيفية", text: "في الفصل الصيفي تنافس 8 فئات: الذرة والعنب والموالح والنباتات الطبية والخضروات والأرض البور والعمران والمياه — 252 نقطة، مع استبعاد القمح والبنجر والبطاطس قطعًا." }
      ],
      product: {
        kicker: "المخرجات", watermark: "المخرج", title: "ما تقدمه كل عملية تشغيل",
        text: "أربعة مخرجات لكل منطقة دراسة: الخريطة، وتقرير الفدان، وتقرير الدقة، والحدود التي بدأت منها.",
        more: "افتح مساحة العمل",
        ask: "كل ذلك بالعربية والإنجليزية، على الهاتف كما على المكتب.",
        items: [
          { title: "خريطة التصنيف", text: "كل بكسل ملوّن حسب فئته فوق صورة القمر الصناعي، مع مفتاح قابل للنقر وتحكم في الشفافية وشريط مقارنة يمسح بين الصورة والتصنيف." },
          { title: "تقرير الفدان", text: "مساحة كل فئة بالفدان والكم² والنسبة، لكل قطعة ولكل منطقة الدراسة — قابل للتصدير CSV وللطباعة كتقرير." },
          { title: "تقرير الدقة", text: "الدقة الكلية ومعامل Kappa وPA/UA/F1 لكل فئة من الـ30% المحتجزة من نقاط العينات، مع مصفوفة الالتباس كاملة." },
          { title: "دعم القرار", text: "للفئات المحصولية: أرقام إنتاجية ومياه استرشادية للفدان — أرقام تخطيط توصف في كل موضع بأنها استرشادية." }
        ]
      },
      features: {
        title: "مبني لسير عمل الدلتا",
        text: "من الصورة إلى جدول يمكن الدفاع عنه في أربع خطوات — بالعربية أولًا.",
        cta: "افتح مساحة العمل",
        note: "يشغّل دلتا فيجن نفس خط أنابيب محرك مشروع التخرج الكامن خلفه: Sentinel-2 L2A وقناع السحب SCL ووسائط شهرية وتقسيم 70/30 مجمّع لنقاط المرجع.",
        items: [
          { title: "ارفع ملف شكل أو GeoJSON", text: "ملف .shp مع .dbf و.prj و.cpg، أو .zip يجمعها، أو ملف .geojson — تُرسَم القطع على الخريطة بمساحاتها بالفدان." },
          { title: "اختر فترة لا موسمًا فقط", text: "مواسم كاملة أو نوافذ زراعية 4 أشهر (أكتوبر–يناير، فبراير–مايو، يونيو–سبتمبر)؛ والمدى المخصص يكتشف موسمه السائد ويرشّح الفئات تلقائيًا." },
          { title: "اختر المستوى ثم الخوارزمية", text: "المستوى الأول لخريطة غطاء موثوقة، والثاني لتفاصيل المحاصيل الموسمية — 9 خوارزميات موجّهة وK-Means والمسح الفوري." },
          { title: "قارن الخوارزميات بعدل", text: "جدول الدوري يدرّب جميع الخوارزميات الموجّهة على نفس تقسيم نفس النقاط ويرتّبها بالدقة الكلية المقاسة." }
        ]
      },
      steps: {
        title: "من المدار إلى الفدان في أربع خطوات",
        items: [
          { title: "أنشئ حسابًا", text: "سجّل بياناتك أو افتح الحساب التجريبي للتجول. الحسابات وسجل التشغيل محفوظة على الخادم." },
          { title: "ارسم أو ارفع منطقة دراسة", text: "استخدم حدود برج العرب المدمجة، أو ارسم مستطيلًا/مضلعًا، أو اكتب إحداثيات، أو ارفع ملف شكل / GeoJSON." },
          { title: "اختر المستوى والفترة والخوارزمية", text: "غطاء أرض أو محاصيل؛ فترة مسبقة أو مدى مخصص؛ واحدة من إحدى عشرة خوارزمية مع معاملاتها." },
          { title: "اقرأ الخريطة والأرقام", text: "الفدان لكل فئة، والدقة من النقاط المحتجزة، ومصفوفة الالتباس، وتصدير CSV وGeoTIFF." }
        ]
      },
      cta: {
        title: "صنّف منطقتك بنفسك",
        text: "جرّبه مجانًا بالحساب التجريبي — كل خوارزمية تعمل فعلًا على Earth Engine.",
        button: "أنشئ حسابًا", login: "لديّ حساب بالفعل"
      },
      aiNote: "أرقام الدقة المعروضة في أي موضع بالتطبيق مقاسة على الجزء المحتجز من نقاط المرجع الـ360 — لا تُضبط يدويًا ولا تُضخّم."
    },

    login: {
      back: "رجوع", title: "أهلًا بعودتك", subtitle: "سجّل دخولك لتفتح مساحة العمل وسجل تشغيلك.",
      email: "البريد الإلكتروني", emailPh: "you@example.com", password: "كلمة المرور",
      submit: "تسجيل الدخول", alt: "أول مرة هنا؟", toSignup: "أنشئ حسابًا",
      required: "هذا الحقل مطلوب",
      error: { BAD_CREDENTIALS: "البريد أو كلمة المرور غير صحيحة.", STORAGE: "تعذّر الوصول إلى خدمة الحسابات. حاول مرة أخرى." },
      demoTitle: "حساب تجريبي", demoText: "تجوّل بالحساب الجاهز — لا يُحفظ شيء مما تشغّله.",
      demoEmail: "البريد", demoPassword: "كلمة المرور", demoButton: "افتح الحساب التجريبي"
    },
    signup: {
      back: "رجوع", title: "أنشئ حسابك", subtitle: "دقيقة واحدة وتصبح مساحة العمل لك.",
      name: "الاسم", namePh: "اسمك", org: "الجهة", orgPh: "شركة، كلية، جمعية…",
      email: "البريد الإلكتروني", emailPh: "you@example.com", password: "كلمة المرور", passwordHint: "8 أحرف على الأقل.",
      confirm: "تأكيد كلمة المرور", confirmPh: "أعد كتابة كلمة المرور",
      submit: "إنشاء الحساب", alt: "مسجل بالفعل؟", toLogin: "سجّل الدخول",
      error: {
        name: "من فضلك أخبرنا باسمك.", email: "هذا لا يبدو بريدًا إلكترونيًا صحيحًا.",
        password: "8 أحرف على الأقل.", confirm: "كلمتا المرور غير متطابقتين.",
        EMAIL_TAKEN: "هذا البريد مسجل بالفعل.", STORAGE: "تعذّر الوصول إلى خدمة الحسابات. حاول مرة أخرى."
      },
      note: "تُحفظ الحسابات على الخادم؛ وإن تعذّر الوصول إليه يُحفظ الحساب في هذا المتصفح فقط."
    },

    ws: {
      title: "مساحة العمل",
      subtitle: "اختر المستوى والفترة والخوارزمية — تتبعها الخريطة والأرقام.",
      previewBadge: "وضع المعاينة",
      liveBadge: "Earth Engine مباشر",
      previewText: "هذا النشر بلا مفتاح Earth Engine: تعرض الخريطة نمطًا توضيحيًا لا تصنيفًا حقيقيًا. كل شيء آخر يعمل كما هو تمامًا.",
      level: {
        title: "مستوى التصنيف",
        general: "غطاء الأرض",
        generalSub: "4 فئات",
        crops: "المحاصيل",
        cropsSub: "موسمي",
        hint: "يُدرَّب المستويان على 360 نقطة موثّقة. غطاء الأرض هو المستوى الموثوق؛ والمحاصيل تعرض دقتها الموسمية المقاسة فعلًا — التداخل الطيفي بين المحاصيل كبير، فاقرأ لوحة الدقة دائمًا.",
        generalHint: "مياه · عمران · أرض بور · أراضٍ زراعية — المستوى صاحب أقوى دقة مقاسة (~85%).",
        cropsHint: "فئات المحاصيل الإحدى عشرة من طقم العينات، مُرشَّحة موسميًا بصرامة."
      },
      season: {
        title: "الفترة",
        winter: "الشتوية",
        early_winter: "بداية الشتاء",
        late_winter: "آخر الشتاء",
        summer: "الصيفية",
        summer_peak: "ذروة الصيف",
        full: "سنة كاملة",
        year: "السنة",
        period: "المشاهد: {from} ← {to}",
        custom: "مدى مخصص",
        customFrom: "من", customTo: "إلى", customApply: "تطبيق المدى", customClear: "عودة إلى الفترات الجاهزة",
        detected: "الموسم المكتشف: {family}",
        badgeActive: "{n} فئات نشطة · {points} نقطة",
        badgeExcluded: "خارج الموسم: {classes}",
        fullNote: "فترة السنة الكاملة متاحة لمستوى غطاء الأرض فقط — لا تجتمع شتوية وصيفية في نموذج واحد أبدًا.",
        months: { winter: "نوفمبر–أبريل", early_winter: "أكتوبر–يناير", late_winter: "فبراير–مايو", summer: "مايو–أكتوبر", summer_peak: "يونيو–سبتمبر", full: "يناير–ديسمبر" },
        family: { winter: "شتوية", summer: "صيفية", full: "سنة كاملة" },
        competing: "الفئات المتنافسة: {classes}"
      },
      studyArea: "منطقة الدراسة",
      tabs: { upload: "رفع", draw: "رسم", circle: "دائرة", bbox: "مربع" },
      upload: {
        drop: "أفلت ملف الشكل هنا", or: "أو", browse: "تصفح",
        hint: "‎.shp مع .dbf و.prj (+ .cpg / .shx)، أو .zip / .geojson يجمعها.",
        encoding: "ترميز النص", processing: "جارٍ قراءة ملف الشكل…", applied: "تم تطبيق منطقة الدراسة.",
        layer: "الطبقة", crs: "نظام الإحداثيات", crsLatLon: "WGS84 (خطوط الطول/العرض)", parcels: "القطع", features: "{n} عنصر",
        geometry: "أنواع الأشكال", area: "المساحة الكلية", fileTooBig: "أحد الملفات أكبر من 25 ميغابايت.", zipOnlyOne: "يجب أن يحتوي الـ.zip على ملف شكل واحد فقط."
      },
      sample: {
        button: "استخدم منطقة الدراسة المدمجة (برج العرب)",
        text: "برج العرب: {area} فدان، {vertices} رأسًا، مساحة جيوديسية."
      },
      draw: { hint: "انقر على الخريطة لإضافة الرؤوس؛ وانقر الرأس الأول (أو اضغط Esc) للإنهاء.", polygon: "رسم مضلع", rectangle: "رسم مستطيل", clear: "إلغاء", first: "انقر الرأس الأول مرة أخرى لإغلاق المضلع." },
      circle: { hint: "المركز ونصف القطر بالكيلومترات — تُبنى الدائرة جيوديسيًا.", lon: "خط طول المركز", lat: "دائرة عرض المركز", radius: "نصف القطر (كم)", apply: "بناء الدائرة" },
      bbox: { hint: "رأسان متقابلان للمربع بالدرجات.", minLon: "غربًا", minLat: "جنوبًا", maxLon: "شرقًا", maxLat: "شمالًا", apply: "بناء المربع" },
      aoi: {
        kinds: { draw: "منطقة مرسومة", circle: "منطقة دائرية", bbox: "منطقة مربعة", geojson: "منطقة GeoJSON" },
        total: "{feddan} فدان · {km2} كم²",
        perParcel: "{n} قطعة", clear: "مسح منطقة الدراسة", removePoint: "إزالة هذه النقطة",
        outlinesCapped: "يعرض الرسم {n} من {total} حدودًا على الخريطة."
      },
      invalidCoords: "هذه الإحداثيات خارج النطاق.", invalidRadius: "يجب أن يكون نصف القطر بين 0.01 و500 كم.",
      needAoi: "اختر منطقة دراسة أولًا.",
      algorithm: {
        title: "الخوارزمية",
        more: "ما الفرق بين الخوارزميات؟",
        rfTrees: "أشجار الغابة العشوائية", knnK: "جيران k-NN", kClusters: "عناقيد K-Means",
        mlpHidden: "وحدات الطبقة الخفية MLP", mlpEpochs: "دورات تدريب MLP",
        cloud: "حد الغيوم %"
      },
      samples: {
        title: "عينات التدريب",
        hint: "المدمج: 360 نقطة مرجعية موثّقة (منطقة برج العرب) تدرّب كل عملية تشغيل. أضف نقاطك — 20 نقطة على الأقل على فئتين — لتتدرب عليها بدلًا منها.",
        class: "الفئة",
        pick: "اختر نقاطًا", stop: "إيقاف الاختيار", pickHint: "انقر على الخريطة لإضافة نقاط من فئة: {class}",
        upload: "رفع CSV", clear: "مسح",
        none: "لا نقاط يدوية — سيُدرَّب التشغيل على الطقم المرجعي المدمج (360 نقطة).",
        few: "{n} نقطة على {k} فئات — يلزم 20 نقطة على فئتين قبل أن تحل محل الطقم المدمج.",
        ok: "{n} نقطة على {k} فئات — نقاطك تحل محل الطقم المدمج.",
        unused: "هذه الخوارزمية تدرب نفسها: لا تُستخدم عينات.",
        loaded: "تم تحميل {n} عينة.", skipped: " تم تجاهل {n} صفوفًا.", inactive: "خارج الموسم",
        csvHint: "CSV مفصول بفاصلة أو بفاصلة منقوطة؛ الأعمدة lon/lat/class أو POINT_X/POINT_Y/ClassName — والفئة قد تكون الرمز (WHT) أو الرقم (1) أو الاسم (قمح).",
        groundTruth: "نقاط الحقيقة الأرضية", gtHint: "اعرض 360 نقطة مرجعية مدمجة على الخريطة، ملوّنة حسب الفئة."
      },
      run: "شغّل التصنيف", running: "جارٍ التشغيل…",
      historyBtn: "السجل", compareBtn: "قارن الخوارزميات", leagueBtn: "دوري الدقة",
      map: {
        aria: "خريطة منطقة الدراسة",
        satellite: "قمر صناعي", streets: "شوارع", hybrid: "هجين", dark: "داكن",
        scene: { truecolor: "ألوان حقيقية", ndvi: "NDVI", ndwi: "NDWI" },
        opacity: "شفافية الطبقة",
        fit: "تكبير على المنطقة", fullscreen: "ملء الشاشة", latlon: "المؤشر: {lat}، {lon}",
        outline: "حدود منطقة الدراسة — شغّل تصنيفًا لتعبئتها.",
        overlay: "التصنيف", gt: "الحقيقة الأرضية", aoi: "حدود المنطقة",
        ab: "مقارنة A/B", abHint: "اسحب المقبض للمسح بين صورة القمر الصناعي والتصنيف.",
        reset: "عودة لمنطقة الدراسة", geojson: "GeoJSON",
        none: "بدون خريطة أساس", geojsonExport: "تصدير منطقة الدراسة (GeoJSON)", geojsonImport: "استيراد منطقة GeoJSON",
        inspectHint: "انقر في أي مكان على الخريطة لفحص ذلك البكسل (سلسلة NDVI للفترة المختارة)."
      },
      results: {
        title: "النتائج", empty: "شغّل تصنيفًا لترى الخريطة وجدول الفدان وتقرير الدقة.",
        run: "{algo} · {season} · {period}",
        level: "المستوى {level} — {name}",
        total: "المساحة الكلية", parcels: "القطع",
        oa: "الدقة الكلية", kappa: "Kappa", notComputed: "غير محسوبة",
        class: "الفئة", percent: "الحصة", pa: "PA (استرجاع)", ua: "UA (دقة)", f1: "F1",
        tableTitle: "الفئات", parcelsTitle: "القطع", parcel: "القطعة",
        cluster: "عنقود {n}", clusters: "عناقيد",
        confusionTitle: "مصفوفة الالتباس (الصفوف مرجع والأعمدة تنبؤ)",
        confusionHint: "اقرأ الصف: من بكسلات المرجع لهذه الفئة، الحصة المتنبأ بها في كل عمود.",
        dssTitle: "دعم القرار — استرشادي", dssHint: "أرقام تخطيطية استرشادية مصرية للفدان، وليست قياسات.",
        dssCrop: "المحصول", dssYield: "إنتاجية استرشادية (طن)", dssWater: "مياه استرشادية (م³)",
        dssTotalYield: "إجمالي الإنتاجية الاسترشادية", dssTotalWater: "إجمالي المياه الاسترشادية",
        clusters: "عناقيد", mode: "الوضع", modeLive: "Earth Engine", modePreview: "معاينة",
        export: "تصدير CSV", parcelsCsv: "CSV القطع", print: "طباعة التقرير", download: "GeoTIFF",
        png: "صورة مصنّفة (PNG)", pngHint: "تصدير خريطة مصنّفة جاهزة للنشر: المنطقة كاملة، مفتاح الخريطة الفعلي، بدون خريطة أساس",
        pngStitching: "جاري تركيب الصورة المصنّفة…", pngTiles: "جاري جلب مربّعات Earth Engine ({n} مربّعًا)…",
        pngNoTiles: "انتهت صلاحية الطبقة المصنّفة — أعد التصنيف ثم صدّر الصورة.",
        pngFailed: "فشل تصدير الصورة ({err}).",
        tifOk: "تم تنزيل GeoTIFF: {size} بدقة {scale} م/بكسل", tifFailed: "فشل تنزيل GeoTIFF ({err}).",
        printTitle: "دلتا فيجن — تقرير التصنيف",
        printIntro: "الخريطة المصنّفة كاملة، مساحات الفئات، ومصفوفة التحقق.",
        geojsonOk: "تم تنزيل GeoJSON: {n} عنصرًا بمساحة {area} فدان", geojsonEmpty: "ارسم أو حمّل منطقة دراسة أولًا.",
        stageFetch: "جاري جلب صور Sentinel-2…", stageTrain: "جاري تدريب النموذج…", stageRender: "جاري إنتاج الخريطة…",
        fromCache: "معروض من الذاكرة المؤقتة", rerun: "إعادة تشغيل جديدة",
        confusionCaption: "تحقق على مستوى البكسل: {pixels} بكسل مأخوذة من {points} نقطة اختبار محجوزة (تقسيم 70/30 بالنقطة).",
        confusionNoPoints: "تحقق على مستوى البكسل: {pixels} بكسل تحقق.",
        signatureTitle: "بصمات المرجع — {season}",
        signatureText: "متوسط NDVI والمدى 10–90% لكل فئة، مقاسة عند نقاط المرجع المدمجة.",
        insight: "الدقة المقاسة منخفضة عند هذا المستوى: تتداخل المحاصيل بقوة في إشارة Sentinel-2. انتقل لمستوى غطاء الأرض لخريطة موثوقة، أو أضف عينات خاصة بالمحاصيل.",
        trainingSet: "{source} ({n} نقطة · {k} فئات) · تقسيم {split}"
      },
      history: {
        title: "سجل التشغيل", close: "إغلاق", text: "كل عملية تشغيل مكتملة لهذا الحساب، الأحدث أولًا.",
        when: "الموعد", algo: "الخوارزمية", area: "منطقة الدراسة", mode: "الوضع", empty: "لا عمليات بعد — يمتلئ السجل وأنت تعمل.",
        open: "فتح", delete: "حذف", deleted: "تم حذف العملية.", error: "تعذّر تحميل تلك العملية.", loaded: "تمت استعادة العملية."
      },
      compare: {
        title: "قارن الخوارزميات", close: "إغلاق",
        computed: "OA {oa}% · κ {k} (مقاسة)",
        text: "اختر خوارزمية لتشغّلها الآن على نفس منطقة الدراسة والفترة والمستوى.",
        cols: { algo: "الخوارزمية", family: "العائلة", samples: "تحتاج عينات", accuracy: "الدقة", params: "المعاملات", choose: "تشغيل" }
      },
      league: {
        title: "دوري الدقة", hint: "جميع الخوارزميات الموجهة، تُدرَّب على نفس تقسيم نفس نقاط المرجع، وترتّب بالدقة الكلية المقاسة.",
        running: "جارٍ تدريب كل الخوارزميات على نفس التقسيم…", winner: "الأفضل", failed: "فشلت",
        loadBest: "اعرض الفائز على الخريطة",
        cols: { algo: "الخوارزمية", oa: "الدقة الكلية", kappa: "Kappa" }
      },
      gee: { checking: "جارٍ فحص Earth Engine…", live: "Earth Engine مباشر", preview: "وضع المعاينة", unsure: "تعذر التحقق من حالة Earth Engine" },
      ndvi: { title: "NDVI عند هذه النقطة", loading: "جارٍ تحميل سلسلة NDVI…", empty: "لا مشاهد خالية من السحب عند هذه النقطة في الفترة المختارة." },
    notes: {
      preview: "وضع المعاينة: نمط توضيحي، لا تصنيفًا حقيقيًا.",
      no_accuracy: "نقاط التحقق قليلة جدًا لقياس الدقة.",
      kmeans_no_accuracy: "K-Means غير موجّه: لا فئات ولا دقة.",
      instant_estimate: "مسح فوري: تقدير من إحصاءات المرجع المقاسة، لا نموذجًا مدرّبًا.",
      samples_far: "منطقة الدراسة بعيدة عن طقم العينات المدمج — تعامل مع النتيجة بحذر.",
      season_detected: "المدى المخصص يغطي الموسمين: استُخدم السائد، فتبقى الشتوية والصيفية مفصولتين.",
      weak_accuracy: "الدقة المقاسة منخفضة عند هذا المستوى: تتداخل المحاصيل بقوة في إشارة Sentinel-2.",
      builtin_training: "دُرِّب على الطقم المرجعي المدمج",
      manual_training: "دُرِّب على نقاطك المرفوعة"
    },
    },

    errors: {
      SHP_MISSING: "ملف .shp مطلوب.", DBF_MISSING: "ملف .dbf مطلوب (جدول الخصائص).",
      NO_POLYGONS: "لا مضلعات في ملف الشكل هذا.", NOT_SHAPEFILE: "هذا الملف ليس ملف شكل.",
      BAD_SHP: "تعذّرت قراءة ملف الشكل.", BAD_PRJ: "تعذّر تحليل .prj.", BAD_GEOJSON: "تعذّرت قراءة GeoJSON.",
      CSV_EMPTY: "ملف CSV فارغ.", CSV_COLUMNS: "يحتاج CSV أعمدة خط الطول ودائرة العرض والفئة.",
      ZIP_BROKEN: "تعذّرت قراءة ملف الـ.zip.", ZIP64: "أرشيفات ZIP64 غير مدعومة.", ZIP_UNSUPPORTED: "طريقة الضغط هذه غير مدعومة.",
      DBF_BROKEN: "تعذّرت قراءة ملف .dbf.", SHP_BROKEN: "تعذّرت قراءة ملف .shp.", PRJ_UNSUPPORTED: "الإسقاط في .prj غير مدعوم.",
      EMAIL_TAKEN: "هذا البريد مسجل بالفعل.", BAD_CREDENTIALS: "البريد أو كلمة المرور غير صحيحة.", STORAGE: "تعذّر الوصول إلى خدمة الحسابات. حاول مرة أخرى.",
      BAD_DBF: "تعذّرت قراءة .dbf.", PRJ_MISSING: "لا يوجد ملف .prj — سيُفترض WGS84.",
      UNSUPPORTED_CRS: "نظام الإحداثيات غير مدعوم.",
      BACKEND: "لم يجب الخادم. حاول مرة أخرى.", BACKEND_401: "سجّل دخولك من جديد.", BACKEND_429: "طلبات كثيرة — انتظر قليلًا.",
      BACKEND_500: "واجه الخادم خطأ. حاول مجددًا.", BACKEND_503: "خدمة التصنيف مشغولة — حاول بعد قليل.",
      BACKEND_TIMEOUT: "استغرقت العملية طويلًا. جرّب منطقة أصغر أو فترة أقصر.", BACKEND_BAD: "أجاب الخادم بنتيجة غير متوقعة.",
      gee_not_configured: "لم يُضبط Earth Engine على هذا الخادم — يبقى التطبيق في وضع المعاينة.",
      no_images: "لا مشاهد Sentinel-2 خالية من السحب في هذه الفترة — وسّع التواريخ أو ارفع حد الغيوم.",
      popup_blocked: "تم حظر نافذة التقرير — اسمح بالنوافذ المنبثقة لهذا الموقع.", bad_date_range: "المدى الزمني غير صالح.", too_few_samples: "نقاط العينات داخل الموسم قليلة جدًا لهذه الفترة.",
      mahalanobis_needs_samples: "تحتاج مسافة ماهالانوبيس بكسلات تدريب أكثر لكل فئة — أضف عينات أو اختر خوارزمية أخرى.",
      samples_outside_aoi: "لم تنتج أي نقطة عينة بكسلًا صالحًا — راجع الفترة أو حد الغيوم.",
      unknown_algorithm: "خوارزمية غير معروفة.", all_algorithms_failed: "فشلت كل الخوارزميات في التدريب على هذه النافذة.",
      scene_failed: "تعذّر تحميل طبقة المشهد.", ndvi_failed: "تعذّر تحميل سلسلة NDVI.",
      no_active_classes: "لا فئة نشطة لهذه الفترة."
    },
    warns: {
      reprojected: "أُعيدت الإسقاط من {src} إلى WGS84.", prjMissing: "لا يوجد .prj — افتُرض WGS84.",
      cpgMismatch: "ترميزا .cpg و.dbf مختلفان؛ سيُعتمد .cpg.", otherLayers: "طبقات أخرى بالداخل: {names}"
    },

    algo: {
      title: "الخوارزميات",
      subtitle: "إحدى عشرة طريقة لتحويل حزمة صفات واحدة إلى خريطة — كلها تُدرَّب على 360 نقطة موثّقة وتُقاس على نفس الـ30% المحتجزة.",
      cta: "افتح مساحة العمل",
      group: { supervised: "موجهة", unsupervised: "غير موجّهة", knowledge: "معرفية" },
      groupText: {
        supervised: "يُضبَّط نموذج على نقاط المرجع المعنونة ثم يُطبَّق على كل بكسل. وتُقاس الدقة على الـ30% المحتجزة من النقاط.",
        unsupervised: "تُجمَّع البكسلات بالتشابه الطيفي وحده — بلا فئات وبلا دقة: خريطة بنية.",
        knowledge: "بلا تدريب إطلاقًا: تُطابَق البكسلات مع إحصاءات الفئات المقاسة عند نقاط المرجع."
      },
      labels: { needs: "تحتاج عينات", accuracy: "الدقة", params: "المعاملات", yes: "نعم", no: "لا", none: "—", measured: "مقاسة", fixed: "ثابتة" },
      names: {
        rf: "الغابة العشوائية", svm: "آلة المتجهات الداعمة (RBF)", cart: "شجرة قرار CART", gtb: "تعزيز الأشجار التدرجي",
        nb: "بايز السذج", mlp: "شبكة عصبية (MLP)", knn: "أقرب الجيران k",
        mindist_e: "أدنى مسافة (إقليدية)", mindist_m: "أدنى مسافة (ماهالانوبيس)",
        kmeans: "تجميع K-Means", signature: "المسح الفوري"
      },
      text: {
        rf: "مجموعة أشجار قرار، كل شجرة تُضبَّط على شريحة عشوائية من بكسلات التدريب؛ والفئة صاحبة الأصوات أكثر تفوز بالبكسل. متينة ومتوازية، وهي الأقوى دومًا على طقم المرجع.",
        svm: "آلة متجهات داعمة بنواة RBF: ترسم أفضل حد فاصل بين الفئات في فضاء الصفات. حساسة لسلّم الصفات، فتتفوق على النطاقات المُفككة الارتباط.",
        cart: "شجرة قرار واحدة قابلة للقراءة: كل تفرّع عتبة على نطاق واحد يمكنك قراءته وشرحه — الخيار الأمين حين يجب الدفاع عن الخريطة سطرًا سطرًا.",
        gtb: "أشجار ضحلة معزّقة تُبنى تباعًا، كل واحدة تصحح أخطاء سابقتها. غالبًا أقرب منافس للغابة العشوائية على الأطقم الصغيرة.",
        nb: "بايز السذج الغاوسي: يفترض لكل فئة ونطاق توزيعًا طبيعيًا مستقلًا — سريع وبسيط، وخط أساس مفيد لما تستطيع النطاقات وحدها تفسيره.",
        mlp: "شبكة عصبية بطبقة خفية واحدة تُدرَّب على الخادم ثم تُعاد حسبة كل بكسل داخل Earth Engine كجبر نطاقات — نفس الشبكة ونفس النتيجة على مقياس كوكبي.",
        knn: "تُسمّى البكسلة بفئة أغلبية جيرانها التدريبيين الأقرب في فضاء الصفات. مع 360 نقطة مرجعية يتصرف كذاكرة محلية للحقول.",
        mindist_e: "ينضم كل بكسل للفئة الأقرب متوسطًا بمسافة إقليدية — مصنّف أقرب المتوسطات الكلاسيكي، شفاف وسريع.",
        mindist_m: "نفس فكرة أقرب المتوسطات، لكن المسافات تُوزن بتغاير بيانات التدريب فيتوقف هيمنة النطاقات المترابطة. يعمل على نطاقات الخلاصة التسعة المُفككة.",
        kmeans: "تُجمَّع البكسلات في k مجموعات طيفية بلا فئات إطلاقًا — الخريطة التي تريدها حين تحتاج بنية لا أسماء.",
        signature: "بلا تدريب: تُقيَّم كل بكسلة مقابل متوسطات وانحرافات الفئات المقاسة عند 360 نقطة مرجعية بمسافة غاوسية ساذجة. تقدير فوري، موسوم بذلك بوضوح."
      },
      protocol: {
        title: "خط الأنابيب خلف كل تشغيلة",
        items: [
          { title: "حزمة صفات لكل بكسل", text: "لكل بكسل يركّب المحرك وسائط شهرية لـNDVI وNDWI وNDMI للفترة، وإحصاءات NDVI (p10 والوسيط وp90 والمتوسط والانحراف)، ووسائط B4/B8/B11/B12 — من 21 إلى 45 نطاقًا حسب النافذة." },
          { title: "قناع السحب", text: "تُستبعد بكسلات تصنيف المشهد في Sentinel-2 L2A الموسومة كسحب أو ظل أو سحك قبل أي تجميع؛ وسقف نسبة الغيوم بيدك." },
          { title: "الترشيح الموسمي للفئات", text: "عائلة موسم الفترة تقرر قائمة الفئات: نوافذ الشتاء تُبقي 9 فئات شتوية، ونوافذ الصيف 8 صيفية — لا تدخل محصول خارج موسمه نموذجًا أبدًا." },
          { title: "التدريب على نقاط المرجع", text: "تُؤخذ الصفات عند 360 نقطة معنونة (منطقة الدراسة مع منطقة العينات)، نحو 7 بكسلات لكل نقطة، وتُقسم 70/30 لكل فئة مع بقاء كل بكسلات النقطة في الجهة نفسها." },
          { title: "دقة مقاسة", text: "تُحسب OA وKappa وPA/UA/F1 لكل فئة على الـ30% المحتجزة وحدها — الأرقام على الشاشة قياسات لا توقعات." }
        ]
      }
    },

    upload: {
      title: "رفع البيانات", subtitle: "جهّز بياناتك هنا ثم افتح مساحة العمل وكل شيء في مكانه.",
      shpTitle: "ملف شكل / GeoJSON لمنطقة الدراسة", shpText: "المضلعات التي تريد تصنيفها — قطع أو قرية أو منطقة ري.",
      csvTitle: "CSV عينات التدريب", csvText: "نقاطك المعنونة. 20 نقطة على فئتين على الأقل تحل محل الطقم المرجعي المدمج.",
      template: "نزّل قالب CSV", open: "افتح مساحة العمل", summaryTitle: "جاهز للاستخدام",
      attributes: "معاينة الخصائص", rows: "أول {n} من {total} صفوف.", kept: "يبقى كل شيء على جهازك حتى تفتح مساحة العمل."
    },

    guide: {
      title: "الدليل", subtitle: "الطريق القصير من الصورة إلى جدول يمكن الدفاع عنه.",
      stepsTitle: "خطوة بخطوة", faqTitle: "أسئلة متكررة",
      steps: [
        { title: "أنشئ حسابًا أو افتح التجريبي", text: "يطلب التسجيل اسمًا وبريدًا وكلمة مرور (8 أحرف فأكثر). والحساب التجريبي لا يطلب شيئًا." },
        { title: "اختر مستوى التصنيف", text: "المستوى الأول — غطاء الأرض (مياه، عمران، أرض بور، أراضٍ زراعية) هو الموثوق. والمستوى الثاني — المحاصيل يضيف فئات المرجع الإحدى عشرة، مُرشَّحة موسميًا، بدقتها المقاسة الحقيقية." },
        { title: "اختر الفترة", text: "موسم كامل (نوفمبر–أبريل أو مايو–أكتوبر)، أو نافذة 4 أشهر (أكتوبر–يناير، فبراير–مايو، يونيو–سبتمبر)، أو مدى مخصص يُكتشف موسمه السائد وتتبعه قائمة الفئات." },
        { title: "حدّد منطقة الدراسة", text: "حدود برج العرب المدمجة، أو مستطيل/مضلع مرسوم، أو دائرة/مربع بالإحداثيات، أو ملف شكل / GeoJSON مرفوع." },
        { title: "شغّل وقارن", text: "شغّل خوارزمية واحدة، ثم افتح دوري الدقة لتدريب جميع الخوارزميات الموجهة على نفس التقسيم وترتيبها بالدقة الكلية المقاسة." },
        { title: "صدّر", text: "جدول الفئات CSV، والنطاق المصنّف GeoTIFF، والتقرير كاملًا عبر عرض الطباعة." }
      ],
      faq: [
        { q: "من أين تأتي نقاط التدريب؟", a: "طقم مرجعي موثّق من 360 نقطة معنونة في منطقة برج العرب، مدمج في المحرك. ارفع CSV خاصًا بك (20 نقطة على فئتين فأكثر) لتتدرب على بياناتك بدلًا منها." },
        { q: "لماذا مستويان للتصنيف؟", a: "يفصل طقم المرجع المياه والعمران والأرض البور والأراضي الزراعية بموثوقية (~85% مقاسة)، بينما تتداخل المحاصيل بقوة في إشارة Sentinel-2. المستوى الأول يمنحك الخريطة الموثوقة، والثاني يمنح التفصيل الموسمي بدقته الصادقة." },
        { q: "لماذا تختفي بعض الفئات في بعض الفترات؟", a: "لا تجتمع شتوية وصيفية في نموذج واحد: نوافذ الشتاء تستبعد الذرة والعنب (يبقى 294 نقطة)، ونوافذ الصيف تستبعد القمح والبنجر والبطاطس (يبقى 252 نقطة). ويعرض شريط في مساحة العمل الفئات النشطة والمستبعدة دومًا." },
        { q: "كيف تُقاس الدقة؟", a: "تُقسم نقاط المرجع 70/30 لكل فئة، بتجميع يُبقي بكسلات النقطة الواحدة في الجهة نفسها. وكل رقم دقة في التطبيق يأتي من الـ30% المحتجزة وحدها." },
        { q: "أي خوارزمية أستخدم؟", a: "الغابة العشوائية أأمن اختيار افتراضي. ودوري الدقة يدرّب الخوارزميات الموجهة التسع على نفس التقسيم ويرتبها — جرّبه قبل كتابة التقرير." },
        { q: "ما المسح الفوري؟", a: "تقدير بلا تدريب: تُقيَّم كل بكسلة مقابل إحصاءات الفئات المقاسة عند نقاط المرجع. فوري، وموسوم بوضوح بأنه تقدير، ومفيد كنظرة أولى." },
        { q: "هل أرقام الإنتاجية والمياه قياسات؟", a: "لا — أرقام تخطيطية استرشادية مصرية للفدان، موسومة بذلك في كل موضع تظهر فيه." }
      ],
      limitsTitle: "ما الحقيقي وما ليس حقيقيًا",
      limits: {
        real: { title: "تصنيف حي", text: "مع ضبط مفتاح Earth Engine، كل تشغيلة تصنيف حقيقي: تجميعات حقيقية وتدريب حقيقي ودقة مقاسة فعلًا." },
        preview: { title: "وضع المعاينة", text: "بلا المفتاح، تعرض الخريطة نمطًا توضيحيًا ليبقى الواجهة قابلة للاستكشاف؛ ولا يُصنَّف شيء فعليًا." },
        demo: { title: "الحساب التجريبي", text: "حساب جاهز بنفس خط الأنابيب. يُحفظ سجل التشغيل على الخادم للحسابات المسجلة." }
      }
    },

    report: {
      title: "دلتا فيجن — تقرير التصنيف",
      studyArea: "منطقة الدراسة", period: "الفترة", algorithm: "الخوارزمية", level: "المستوى",
      params: "المعاملات", generated: "تاريخ الإنشاء",
      disclaimer: "المساحات جيوديسية (WGS84). الدقة مقاسة على الـ30% المحتجزة من نقاط المرجع. وأرقام الإنتاجية والمياه قيم تخطيطية استرشادية لا قياسات."
    },

    footer: {
      links: "دلتا فيجن", credits: "الفضل",
      about: "يحوّل دلتا فيجن صور Sentinel-2 إلى خرائط غطاء أرض ومحاصيل لدلتا النيل على مستويين، مدرّبة على 360 نقطة حقلية موثّقة ومقدَّمة بالفدان.",
      data: "الصور: كوبرنيكوس Sentinel-2 (ESA) معالَجة على Google Earth Engine.",
      software: "مبني كتطبيق صفحة واحدة عربي أولًا مع خلفية Earth Engine بلا خادم.",
      build: "نظام الفئات وإحصاءات المرج وهذا الموقع كلها من ملف البيانات نفسه.",
      rights: "© دلتا فيجن — مشروع تخرج."
    }
  };

  return {
    dictionaries: { en: en, ar: ar },
    CLASSES: CLASSES, SCHEMES: SCHEMES, SCHEME_KEYS: SCHEME_KEYS, DEFAULT_SCHEME: DEFAULT_SCHEME,
    ALGORITHMS: ALGORITHMS, PARAMS: PARAMS, SEASONS: SEASONS, YEARS: YEARS, DEFAULT_YEAR: DEFAULT_YEAR,
    DEFAULT_SEASON: DEFAULT_SEASON, DEFAULT_ALGORITHM: DEFAULT_ALGORITHM,
    classesOf: classesOf, classById: classById, algorithmByKey: algorithmByKey,
    activeClasses: activeClasses, activeClassIds: activeClassIds,
    seasonFamily: seasonFamily, detectFamily: detectFamily, period: period, defaults: defaults,
    t: t, lang: lang, dir: dir, setLang: setLang, fmt: fmt, unit: unit
  };
});
