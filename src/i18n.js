/*
 * Delta Vision — i18n.js
 * Arabic (default, right-to-left) and English (left-to-right).
 * Domain data (12 classes, 11 algorithms, parameter ranges, seasons) lives here too, so the
 * interface and the dictionaries always describe the same model.
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
  /** The engine's 12 classes. `prior` = regional prevalence per season (0 = the crop is out of season). */
  var CLASSES = [
    { id: 1, code: "WHT", en: "Wheat", ar: "قمح", color: "#ffff00", prior: { winter: 0.95, summer: 0 } },
    { id: 2, code: "MZE", en: "Maize", ar: "ذرة", color: "#00ff00", prior: { winter: 0, summer: 0.9 } },
    { id: 3, code: "RIC", en: "Rice", ar: "أرز", color: "#00ffff", prior: { winter: 0, summer: 0.6 } },
    { id: 4, code: "CLV", en: "Clover", ar: "برسيم", color: "#008000", prior: { winter: 0.85, summer: 0.3 } },
    { id: 5, code: "POT", en: "Potato", ar: "بطاطس", color: "#b5651d", prior: { winter: 0.3, summer: 0.35 } },
    { id: 6, code: "BET", en: "Sugar Beet", ar: "بنجر السكر", color: "#ff69b4", prior: { winter: 0.55, summer: 0 } },
    { id: 7, code: "FBA", en: "Faba Bean", ar: "فول", color: "#800080", prior: { winter: 0.35, summer: 0 } },
    { id: 8, code: "SUN", en: "Sunflower", ar: "عباد الشمس", color: "#ff8c00", prior: { winter: 0, summer: 0.5 } },
    { id: 9, code: "ORC", en: "Orchards", ar: "بساتين", color: "#808000", prior: { winter: 0.65, summer: 0.65 } },
    { id: 10, code: "FLW", en: "Fallow", ar: "أرض بور", color: "#808080", prior: { winter: 0.85, summer: 0.85 } },
    { id: 11, code: "URB", en: "Urban", ar: "عمران", color: "#ff0000", prior: { winter: 0.5, summer: 0.5 } },
    { id: 12, code: "WTR", en: "Water", ar: "مياه", color: "#0000ff", prior: { winter: 0.45, summer: 0.45 } }
  ];
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
  var SEASONS = ["winter", "summer", "full"];
  var YEARS = [2025, 2024, 2023];
  var DEFAULT_YEAR = 2025;

  function classById(id) {
    for (var i = 0; i < CLASSES.length; i++) if (CLASSES[i].id === id) return CLASSES[i];
    return null;
  }
  function algorithmByKey(key) {
    for (var i = 0; i < ALGORITHMS.length; i++) if (ALGORITHMS[i].key === key) return ALGORITHMS[i];
    return ALGORITHMS[0];
  }
  /** Image period of a season — the engine's resolvePeriod(). */
  function period(season, year) {
    var y = year || DEFAULT_YEAR;
    if (season === "winter") return { dateFrom: (y - 1) + "-11-01", dateTo: y + "-04-30" };
    if (season === "summer") return { dateFrom: y + "-05-01", dateTo: y + "-10-31" };
    return { dateFrom: y + "-01-01", dateTo: y + "-12-31" };
  }
  /** Classes that compete in a season (crop calendar): prior > 0. */
  function activeClasses(season) {
    return CLASSES.filter(function (c) {
      if (season === "full") return Math.max(c.prior.winter, c.prior.summer) > 0;
      return c.prior[season] > 0;
    });
  }
  function defaults() {
    var d = {};
    for (var k in PARAMS) d[k] = PARAMS[k].def;
    return d;
  }

  // ------------------------------------------------------------------ lookup
  function lookup(dict, path) {
    var o = dict, parts = path.split(".");
    for (var i = 0; i < parts.length; i++) {
      if (o == null || typeof o !== "object") return undefined;
      o = o[parts[i]];
    }
    return o;
  }
  function fill(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? "" : String(vars[k]); });
  }
  /** t("ws.run") or t("ws.upload.features", { n: 3 }). Falls back to English, then to the key itself. */
  function t(path, vars) {
    var s = lookup(current === "ar" ? ar : en, path);
    if (s == null) s = lookup(en, path);
    if (s == null) return path;
    return typeof s === "string" ? fill(s, vars) : s;
  }
  function lang() { return current; }
  function dir() { return current === "ar" ? "rtl" : "ltr"; }
  function setLang(l) {
    current = l === "en" ? "en" : "ar";
    try { localStorage.setItem(KEY_LANG, current); } catch (e) { /* ignore */ }
    return current;
  }
  /** Western digits with thousands separators ("141,849.24"); "—" for anything that is not a number. */
  function fmt(n, digits) {
    if (n == null || !isFinite(n)) return "—";
    var d = digits == null ? 2 : digits;
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  /** Number + unit label ("141,849.24 feddan"); the bidi algorithm places the label correctly in Arabic. */
  function unit(n, unitKey, digits) {
    return fmt(n, digits) + " " + t("units." + unitKey);
  }

  // ------------------------------------------------------------------ English
  var en = {
    meta: {
      title: "Delta Vision — crop maps of the Nile Delta in feddan",
      description: "Crop classification of Sentinel-2 imagery for the Nile Delta: 12 classes, 11 algorithms, areas in feddan, shapefile upload."
    },
    brand: { name: "Delta Vision", tagline: "Crop classification from Sentinel-2 for the Nile Delta" },
    nav: {
      home: "Home", workspace: "Workspace", algorithms: "Algorithms", upload: "Data upload", guide: "Guide",
      login: "Log in", logout: "Log out", getStarted: "Get started", menu: "Menu", closeMenu: "Close menu", account: "Account", langLabel: "العربية"
    },
    units: { feddan: "feddan", km2: "km²", ha: "hectares", m2: "m²" },
    common: {
      back: "Back", cancel: "Cancel", apply: "Apply", clear: "Clear", remove: "Remove", replace: "Replace", download: "Download", print: "Print",
      loading: "Loading…", preview: "Preview", close: "Close", optional: "optional", error: "Something went wrong", unknownError: "Unexpected error ({code}).",
      pages: "Page {n} of {total}", of: "of", prev: "Previous", next: "Next",
      toasts: { signedUp: "Account created. Welcome, {name}!", welcomed: "Welcome back, {name}.", loggedOut: "You are logged out." }
    },
    home: {
      badge: "Sentinel-2 · Google Earth Engine · Nile Delta",
      title: "Crop maps of the Delta, measured in feddan",
      subtitle: "Delta Vision turns Sentinel-2 imagery into a 12-class crop and land-cover map and reports every area in feddan. Draw a study area or upload your own shapefile, choose a season and an algorithm, and read the result on the map and in the table.",
      ctaPrimary: "Start classifying", ctaSecondary: "How it works",
      chipAlgo: "11 algorithms", chipRes: "10 m pixels", chipShp: "SHP upload",
      heroAlt: "Fields and a village of the Nile Delta seen from the air",
      floatLabel: "feddan in the built-in Borj El Arab study area",
      stats: [
        { value: "12", label: "crop and land-cover classes", text: "Wheat, maize, rice, clover, potato, sugar beet, faba bean, sunflower, orchards, fallow, urban and water." },
        { value: "238.095", label: "feddan in one square kilometre", text: "One feddan is 4,200 m². Areas are geodesic on the WGS84 ellipsoid — the same quantity Earth Engine reports." }
      ],
      slideAlt: "Photo {n} of {total}",
      slides: [
        { kicker: "From orbit", title: "The Delta, every five days", text: "The two Sentinel-2 satellites revisit each patch of the Delta every five days. Delta Vision composites the cloud-free scenes of a season into one feature stack per pixel." },
        { kicker: "In the field", title: "Every parcel keeps its identity", text: "Upload the boundaries of your fields, district or command area as a shapefile. Each parcel is outlined on the map and listed with its own area in feddan." },
        { kicker: "At the desk", title: "A report you can hand over", text: "The class table gives feddan, km² and percent for every crop. Export it as CSV or print it with the map and the settings of the run." },
        { kicker: "Winter · November to April", title: "Wheat, clover, sugar beet", text: "In winter, wheat, clover, potato, sugar beet, faba bean and orchards compete with fallow, urban and water. Off-season crops such as maize never win a winter pixel." },
        { kicker: "Summer · May to October", title: "Maize, rice, sunflower", text: "In summer, maize, rice, clover, potato, sunflower and orchards compete with fallow, urban and water." }
      ],
      product: {
        kicker: "Outputs", watermark: "Output", title: "What every run delivers",
        text: "Four outputs for each study area: the map, the feddan report, the accuracy report and the boundaries you started from.",
        more: "Open the workspace",
        ask: "Want to see them on your own study area?",
        items: [
          { title: "Classification map", text: "Every pixel coloured by class, over satellite imagery and the outlines of your parcels." },
          { title: "Feddan report", text: "Area per class in feddan, km² and percent, ready to download as CSV or to print." },
          { title: "Accuracy report", text: "Supervised runs report overall accuracy, Kappa and per-class precision on the 30 % of samples kept out of training." },
          { title: "Your boundaries", text: "SHP files of fields or districts are read, re-projected to WGS84 and measured one feature at a time." }
        ]
      },
      features: {
        title: "One study area, from shapefile to feddan",
        text: "Boundaries, coordinate systems and areas are handled entirely in your browser.",
        cta: "Get started",
        items: [
          { title: "Upload a shapefile", text: ".shp with .dbf, .prj and .cpg, or a .zip of them. Egyptian belts, UTM zones and old datums are converted to WGS84." },
          { title: "Draw or type it", text: "A polygon, a rectangle, a centre with a radius, or a bounding box in longitude and latitude." },
          { title: "Areas in feddan", text: "Geodesic WGS84 areas converted at 4,200 m² per feddan — shown per class and per parcel." },
          { title: "11 algorithms", text: "Random Forest, SVM, CART, gradient boosting, Naive Bayes, KNN, minimum distance, MLP, k-means and the signature scan." }
        ],
        note: "Front-end build: the class map shown in the workspace is an illustrative preview. Real classification runs on the Earth Engine engine."
      },
      steps: {
        title: "How a run goes",
        items: [
          { title: "Create an account", text: "Sign up, or open the demo account to look around." },
          { title: "Define the study area", text: "Upload a shapefile or draw the area on the map. Its area in feddan appears immediately." },
          { title: "Choose season and algorithm", text: "Winter, summer or the full year, plus one of 11 algorithms and its parameters." },
          { title: "Read the feddan report", text: "Class map, areas per class, CSV export and a printable report." }
        ]
      },
      cta: { title: "Ready to map your fields?", text: "Create an account and run a first classification in under a minute.", button: "Create an account", login: "I already have an account" },
      aiNote: "Photographs on this page are AI-generated illustrations."
    },
    login: {
      title: "Welcome back", subtitle: "Log in to open your workspace.",
      email: "E-mail", emailPh: "name@example.com", password: "Password", submit: "Log in",
      alt: "New to Delta Vision?", toSignup: "Create an account",
      demoTitle: "Just looking?", demoText: "Open the demo account with one click — no form needed.", demoButton: "Enter as demo",
      demoEmail: "Demo e-mail", demoPassword: "Demo password", back: "Back to home",
      required: "This field is required.",
      error: {
        BAD_CREDENTIALS: "E-mail or password is incorrect.",
        STORAGE: "This browser refuses to store data (private mode?). Log in cannot work without local storage."
      }
    },
    signup: {
      title: "Create your account", subtitle: "It takes less than a minute.",
      name: "Full name", namePh: "e.g. Ahmed Ali", org: "Organisation (optional)", orgPh: "University, company or institute",
      email: "E-mail", emailPh: "name@example.com", password: "Password", passwordHint: "At least 8 characters, with a letter and a digit.",
      confirm: "Confirm password", confirmPh: "Repeat the password",
      submit: "Create account", alt: "Already have an account?", toLogin: "Log in", back: "Back to home",
      note: "This build has no server: the account is saved in this browser only, as a salted password digest. Never reuse a real password here.",
      error: {
        EMAIL_TAKEN: "An account with this e-mail already exists in this browser.",
        STORAGE: "This browser refuses to store data (private mode?). Sign-up cannot work without local storage.",
        NAME: "Enter your name (2 to 60 characters).", EMAIL: "Enter a valid e-mail address.",
        PASSWORD: "Use at least 8 characters, with a letter and a digit.", CONFIRM: "The two passwords do not match."
      }
    },
    ws: {
      title: "Workspace", subtitle: "Define the study area, choose a season and an algorithm, then read the areas in feddan.",
      previewBadge: "Preview mode",
      previewText: "This page is not connected to Earth Engine: the class map is an illustrative pattern and no accuracy is computed. Shapefiles, areas and exports are real.",
      studyArea: "Study area",
      tabs: { upload: "Upload SHP", draw: "Draw", circle: "Centre + radius", bbox: "Bounding box" },
      sample: { button: "Load the sample area (Borj El Arab)", text: "No shapefile at hand? Load the built-in boundary the engine uses by default: {area} feddan." },
      upload: {
        title: "Shapefile",
        hint: "A .zip, or the loose files together: .shp + .dbf + .prj (+ .cpg). With several layers in one archive, the largest is used.",
        drop: "Drop the shapefile here", browse: "Choose files", or: "or",
        encoding: "Attribute encoding", encodingAuto: "Automatic",
        layer: "Layer", features: "{n} features", geometry: "Geometry", area: "Area", crs: "Coordinate system",
        nameField: "Label field", parcels: "Parcels",
        applied: "On the map", invalid: "Only shapefile components or .zip archives are accepted.", processing: "Reading the shapefile…"
      },
      draw: {
        hint: "Pick a tool, then draw on the map. The polygon tool finishes when you click the first point again.",
        polygon: "Polygon", rectangle: "Rectangle", clear: "Remove drawing", area: "Drawn area",
        finish: "Finish polygon", first: "Click the first point again — or press Finish — to close the polygon.", needMore: "Add at least three points."
      },
      circle: { lon: "Longitude", lat: "Latitude", radius: "Radius (km)", apply: "Draw the circle", hint: "Egypt lies between longitudes 24° E and 37° E and latitudes 22° N and 31.5° N." },
      bbox: { minLon: "Min longitude", minLat: "Min latitude", maxLon: "Max longitude", maxLat: "Max latitude", apply: "Draw the box" },
      invalidCoords: "Check the coordinates: they must be numbers, with min smaller than max, inside the world.",
      invalidRadius: "Enter a radius between 0.01 and 500 km.",
      season: {
        title: "Season", winter: "Winter", summer: "Summer", full: "Full year", year: "Year", period: "Images from {from} to {to}",
        competing: "Classes competing: {classes}"
      },
      algorithm: {
        title: "Algorithm", params: "Parameters", cloud: "Maximum cloud cover per scene (%)",
        rfTrees: "Trees", knnK: "Neighbours (k)", kClusters: "Clusters (k)", mlpHidden: "Hidden neurons", mlpEpochs: "Training epochs",
        more: "About the algorithms"
      },
      samples: {
        title: "Training samples",
        hint: "Optional. The engine needs at least 20 points over at least 2 classes; with fewer it picks confident anchor pixels automatically.",
        class: "Class", pick: "Add points by clicking the map", stop: "Stop adding", upload: "Upload CSV",
        csvHint: "Columns lon, lat, class (id 1–12, code such as WHT, or name).",
        count: "{n} points", none: "No samples yet", clear: "Clear samples",
        loaded: "{n} samples loaded", skipped: ", {n} skipped", inactive: "Not active in this season",
        unused: "This algorithm does not use training samples.", pickHint: "Click the map to add a point of class {class}.",
        few: "{n} points over {k} classes — below the engine's minimum of 20 points over 2 classes, so automatic anchors would be used.",
        ok: "{n} points over {k} classes — enough to train on your own points."
      },
      run: "Classify", compare: "Compare algorithms", running: "Running…",
      needAoi: "Define a study area first (upload, draw or coordinates).",
      aoi: {
        clear: "Remove study area",
        kinds: { shp: "Shapefile", draw: "Drawn", circle: "Circle", bbox: "Bounding box", sample: "Built-in boundary" },
        total: "Total: {feddan} feddan ({km2} km²)", perParcel: "{n} parcels, each measured separately", oneParcel: "One polygon",
        hint: "The area is on the map. Choose a season and an algorithm, then press Classify.", removePoint: "Remove point",
        outlinesCapped: "Outlines are drawn for the first {n} of {total} features; the areas of all of them are measured.", crsLatLon: "Longitude/latitude (WGS84)"
      },
      map: { satellite: "Satellite", streets: "Streets", opacity: "Class overlay opacity", legend: "Classes", fit: "Zoom to the study area", outline: "Study area", aria: "Study-area map" },
      results: {
        title: "Results", run: "Run: {algo} · {season} · {period}",
        total: "Total area", parcels: "Parcels", oa: "Overall accuracy", kappa: "Kappa", notComputed: "not computed in preview",
        tableTitle: "Area per class", class: "Class", percent: "Share", second: "Also in",
        parcelsTitle: "Area per parcel", parcel: "Parcel", ofMany: "Showing the first {n} of {total} parcels.",
        signatureTitle: "Reference NDVI signatures — {season}",
        signatureText: "Mean NDVI and the 10–90 % range of each class in the model's reference library (the nine features of the instant scan).",
        export: "Download CSV", print: "Print report", empty: "Choose an area, a season and an algorithm, then press Classify.",
        cluster: "Cluster {n}", clusters: "k-means clusters (not crop names)",
        mode: "Mode", modePreview: "Illustrative preview", modeLive: "Earth Engine",
        samples: "Samples", auto: "automatic anchors", manual: "{n} of your points", images: "Scenes", train: "Training px", val: "Validation px",
        cell: "Preview cell: about {m} m", parcelsCsv: "Parcels CSV"
      },
      compareBtn: "Compare algorithms",
      compare: {
        close: "Close",
        title: "Compare algorithms", text: "All 11 algorithms on the same study area and season. Pick one to see its preview map; in a connected build this table also shows overall accuracy and Kappa for each.",
        cols: { algo: "Algorithm", family: "Family", samples: "Training samples", accuracy: "Accuracy", params: "Parameters", choose: "Show" }
      },
      notes: {
        preview: "Illustrative preview: not a model output.",
        no_accuracy: "Fewer than 10 validation points were left, so no accuracy was computed.",
        kmeans_no_accuracy: "k-means produces spectral clusters, not crop labels; accuracy cannot be computed.",
        instant_estimate: "Instant estimate: each pixel was labelled by its nearest reference signature, without training samples.",
        auto_sample_failed: "Too few confident pixels were found to train a model, so the run fell back to the instant scan."
      }
    },
    errors: {
      ZIP_BROKEN: "The .zip archive is damaged or is not a zip file.",
      ZIP64: "This archive uses the ZIP64 format, which the browser reader does not support. Unzip it and upload the loose files.",
      ZIP_UNSUPPORTED: "This browser cannot decompress .zip files. Unzip it and upload the loose files.",
      ZIP_METHOD: "The .zip uses a compression method the reader does not handle. Re-zip it with the Deflate or Store method.",
      DBF_BROKEN: "The .dbf attribute table is damaged.",
      SHP_BROKEN: "The .shp file is damaged or is not an ESRI shapefile.",
      SHP_MISSING: "No .shp file found. A shapefile needs at least its .shp and .dbf.",
      PRJ_MISSING: "The shapefile has no .prj and its coordinates are not longitude/latitude. Add the .prj of its original coordinate system.",
      PRJ_UNSUPPORTED: "The .prj describes a coordinate system that cannot be interpreted. Re-project the layer to WGS84 (EPSG:4326) in a GIS and export it again.",
      PRJ_MISSING_LATLON: "No .prj file: the coordinates were read as longitude/latitude (WGS84).",
      PRJ_UNSUPPORTED_LATLON: "The .prj could not be interpreted: the coordinates were read as longitude/latitude (WGS84).",
      DATUM_SHIFT: "The .prj carries no datum transformation: the coordinates were taken as WGS84, which may shift the layer.",
      CSV_EMPTY: "The CSV file has no usable rows.",
      CSV_COLUMNS: "The CSV needs columns for longitude, latitude and class (for example lon, lat, class).",
      NO_POLYGONS: "The layer has no polygons to classify: areas need polygon or multipolygon features.",
      INVALID: "Check the highlighted fields.",
      EMAIL_TAKEN: "An account with this e-mail already exists in this browser.",
      BAD_CREDENTIALS: "E-mail or password is incorrect.",
      STORAGE: "This browser refuses to store data (private mode?).",
      BACKEND: "The classification server did not answer. Try again in a moment.",
      BACKEND_BAD: "The classification server answered in a format this page cannot read."
    },
    warns: {
      PRJ_MISSING_LATLON: "No .prj: read as longitude/latitude.",
      PRJ_UNSUPPORTED_LATLON: "Unreadable .prj: read as longitude/latitude.",
      DATUM_SHIFT: "No datum transformation in the .prj: taken as WGS84.",
      datumShift: "Datum {name}: transformation to WGS84 applied (about {m} m).",
      noDbf: "No .dbf: parcels are numbered.",
      otherLayers: "Ignored layers in the archive: {names}."
    },
    algo: {
      title: "The 11 algorithms", cta: "Try them in the workspace",
      subtitle: "Nine supervised classifiers trained on labelled pixels, one unsupervised clustering and one knowledge-based scan — all reading the same Sentinel-2 feature stack.",
      group: { supervised: "Supervised", unsupervised: "Unsupervised", knowledge: "Knowledge-based" },
      groupText: {
        supervised: "Learn from labelled pixels. With fewer than 20 of your own points, the engine extracts confident anchor pixels from the imagery itself.",
        unsupervised: "Groups pixels by spectral similarity, without labels. The groups are not crop names.",
        knowledge: "Compares every pixel with the reference spectral library. No training, instant result."
      },
      labels: {
        needs: "Training samples", yes: "Yours, or automatic anchors", no: "Not needed",
        accuracy: "Accuracy", measured: "On 30 % held-out samples", none: "Cannot be measured", params: "Parameters", fixed: "None"
      },
      names: {
        rf: "Random Forest", svm: "Support Vector Machine", cart: "Decision Tree (CART)", gtb: "Gradient Tree Boost", nb: "Naive Bayes",
        mlp: "Multi-Layer Perceptron", knn: "K-Nearest Neighbours", mindist_e: "Minimum Distance (Euclidean)",
        mindist_m: "Minimum Distance (Mahalanobis)", kmeans: "k-Means clustering", signature: "Signature scan (instant)"
      },
      text: {
        rf: "An ensemble of decision trees; each tree votes and the majority class wins. Robust, and usually the strongest baseline.",
        svm: "Separates the classes with maximum-margin boundaries (libsvm).",
        cart: "One single decision tree: fast and readable, less stable than an ensemble.",
        gtb: "Trees built in sequence, each correcting the errors of the previous ones (60 trees).",
        nb: "Probabilistic classifier that treats the feature bands as independent; fast, but the independence assumption is only approximate.",
        mlp: "A small feed-forward neural network trained outside Earth Engine (24 hidden neurons and 400 epochs by default), then applied to the image pixel by pixel.",
        knn: "Labels a pixel by the majority class among its k nearest training pixels; k goes from 1 to 15.",
        mindist_e: "Assigns each pixel to the class whose mean is closest in Euclidean distance.",
        mindist_m: "Minimum distance that accounts for each class's covariance. It needs more training pixels per class, so the engine draws 140 anchors per class instead of 50.",
        kmeans: "Groups pixels into k spectral clusters without labels (2 to 30 clusters, 8 by default), trained on 2,500 pixels sampled at 100 m.",
        signature: "No training: each pixel goes to the nearest reference signature of the season, with a prevalence bonus for the region's dominant crops. An instant estimate, labelled as such."
      },
      protocol: {
        title: "How the supervised models are trained",
        items: [
          { title: "A feature stack per pixel", text: "For every pixel the engine stacks a monthly median of NDVI, NDWI and NDMI for each month of the period (6 months in a season, 12 in a full year), five NDVI statistics (10th, 50th and 90th percentile, mean, standard deviation) and the median of bands B4, B8, B11 and B12: 27 bands for a season, 45 for a full year." },
          { title: "Twelve reference signatures", text: "Each class has a reference signature of nine seasonal features — NDVI mean, NDVI 10th and 90th percentile, NDWI mean, NDMI mean and the medians of B4, B8, B11 and B12 — calibrated on Sentinel-2 measurements over Borj El Arab." },
          { title: "Labels: your points or automatic anchors", text: "With at least 20 of your own points spread over at least two classes, those points are the labels. Otherwise the signatures select the pixels whose class clearly wins over the runner-up (margin of at least 0.35): 50 anchors per class, sampled at 20 m. Urban anchors must also pass a built-up rule (NDBI above −0.02, NDWI below 0, NDVI below 0.25)." },
          { title: "A 70 / 30 split", text: "The labelled pixels are split at random: 70 % train the model and 30 % validate it. Overall accuracy, Kappa, precision, recall and F1 are measured on the 30 % only; with fewer than 10 validation points the run reports no accuracy." },
          { title: "A minimum per class, and a fallback", text: "A class takes part with at least 25 anchor pixels — more for Mahalanobis distance, which has to invert a covariance matrix. If fewer than two classes qualify, the run falls back to the instant signature scan and says so." }
        ]
      }
    },
    upload: {
      title: "Data upload", subtitle: "Load the study-area boundaries and the training samples, check them, then open them in the workspace.",
      shpTitle: "Study area — shapefile", shpText: "Polygons or multipolygons with their .prj. The files never leave your device.",
      csvTitle: "Training samples — CSV", csvText: "One point per row with a class id (1–12), a class code (WHT, RIC…) or a class name.",
      open: "Open in the workspace", loginFirst: "Log in to continue",
      summaryTitle: "Loaded data", none: "Nothing loaded yet.",
      attributes: "Attributes", rows: "Showing the first {n} of {total} rows.",
      template: "Download a template CSV",
      kept: "The data is kept in this browser and will be waiting in the workspace until you reload the page."
    },
    guide: {
      title: "Guide", subtitle: "Six steps from an empty map to a feddan report, and the questions asked most often.",
      stepsTitle: "Step by step", step: "Step {n}",
      steps: [
        { title: "Create an account or open the demo", text: "Sign-up asks for a name, an e-mail and a password. The demo account opens the workspace without a form." },
        { title: "Define the study area", text: "Upload a shapefile (a .zip or the loose .shp, .dbf and .prj), load the built-in Borj El Arab boundary, draw a polygon or a rectangle, or type a centre with a radius or a bounding box." },
        { title: "Check the area", text: "As soon as the area is on the map, its geodesic area appears in feddan. For a shapefile, every parcel is measured separately." },
        { title: "Choose the period", text: "Winter runs from 1 November of the previous year to 30 April, summer from 1 May to 31 October, and the full year from 1 January to 31 December. Only the crops of the season compete for the pixels." },
        { title: "Choose the algorithm and its parameters", text: "Random Forest is the default. Each algorithm shows only the parameters it uses, plus the cloud-cover limit for the scenes." },
        { title: "Add samples if you have them, then run", text: "Samples are optional: click the map or upload a CSV. Classify gives the map and the feddan table; Compare lists all algorithms side by side." }
      ],
      faqTitle: "Questions asked most often",
      faq: [
        { q: "How can a model be trained on only 12 signatures?", a: "It is not trained on 12 numbers. The 12 are classes. Each class has a reference signature of 9 features, and these signatures do two jobs: the instant scan labels each pixel by its nearest signature, and for the supervised algorithms they pick confident anchor pixels, which are then described by the full feature stack (27 to 45 bands) and labelled with their class. That labelled set — not the signatures — is what trains Random Forest, SVM and the others." },
        { q: "Why feddan, and how exact is it?", a: "One feddan is 4,200 m², so a square kilometre is 238.095 feddan. This front-end measures each polygon as a geodesic area on the WGS84 ellipsoid — the same quantity Earth Engine's pixelArea() gives — so the feddan figure of a parcel is the same here and in a real run. For old datums (Egypt 1907, ED50) the built-in transformation is accurate to about 10–11 m: boundaries may shift slightly, areas barely change." },
        { q: "Which shapefiles can I upload?", a: "ESRI shapefiles — polygons with holes and multipolygons — as loose files (.shp, .dbf, .prj, .cpg) or zipped. Any coordinate system with a readable .prj is converted to WGS84: UTM zones, the Egyptian Red, Blue and Purple belts on Egypt 1907, ED50, Web Mercator, or an EPSG code. Without a .prj, only longitude/latitude files are accepted. Attribute tables in Arabic Windows-1256, ISO-8859-6 or DOS-864 are read." },
        { q: "Winter, summer or full year?", a: "The seasons follow the Egyptian crop calendar. Winter (1 November to 30 April) is wheat, clover, potato, sugar beet, faba bean, orchards, fallow, urban and water; summer (1 May to 31 October) is maize, rice, clover, potato, sunflower, orchards, fallow, urban and water. The full year lets all twelve classes compete, but mixes crops that never grow together — a season is the better choice." },
        { q: "Why is accuracy missing?", a: "Accuracy is measured on labelled samples the model never saw in training. k-means has no labels and the instant scan has no training, so neither can have an accuracy. A supervised run reports no accuracy when fewer than 10 validation points are left after the 70/30 split. And in this front-end build nothing is classified for real, so the accuracy cards stay empty." },
        { q: "Does my shapefile leave my computer?", a: "No. The file is read by your own browser and never uploaded. The same goes for the account: it is stored in this browser only." },
        { q: "How do I get real results?", a: "Connect the Earth Engine backend: replace the preview adapter in the script (DVBackend) by a request to your run endpoint, sending the same input object — algorithm, season, year, cloud limit, parameters, sample points and the study area as GeoJSON. The result panel already accepts the engine's output shape (tile URL, accuracy, Kappa, class areas)." }
      ],
      limitsTitle: "What is real in this build, and what is not",
      limits: {
        real: { title: "Real", text: "Reading shapefiles, converting coordinate systems, geodesic areas in feddan (per class and per parcel), the CSV export and the printable report." },
        preview: { title: "Preview", text: "The class map. It is an illustrative pattern built from the season's classes and their regional weights, not a satellite classification. Accuracy and Kappa are therefore never shown." },
        demo: { title: "Demonstration", text: "Accounts. They live in this browser's local storage, protected by a salted password digest, but with no server behind them this is not production security." }
      }
    },
    report: {
      title: "Delta Vision — classification report", studyArea: "Study area", period: "Period", algorithm: "Algorithm", params: "Parameters",
      generated: "Generated",
      disclaimer: "Illustrative preview: the class map is not a model output and no accuracy was computed. Areas are geodesic (WGS84); 1 feddan = 4,200 m²."
    },
    footer: {
      about: "Crop classification of the Nile Delta with Sentinel-2 and Google Earth Engine.",
      links: "Pages", credits: "Data and software",
      data: "Imagery: Copernicus Sentinel-2 (ESA). Basemap: Esri World Imagery, © OpenStreetMap contributors.",
      software: "Built with Leaflet and proj4js. Typefaces Poppins and Cairo (SIL Open Font License).",
      build: "Front-end build: accounts are stored in this browser and the class map is an illustrative preview.",
      rights: "Delta Vision — for study and demonstration."
    }
  };

  // ------------------------------------------------------------------ العربية
  var ar = {
    meta: {
      title: "دلتا فيجن — خرائط محاصيل دلتا النيل بالفدان",
      description: "تصنيف المحاصيل من صور Sentinel-2 لدلتا النيل: 12 فئة، 11 خوارزمية، مساحات بالفدان، ورفع ملفات SHP."
    },
    brand: { name: "Delta Vision", tagline: "تصنيف المحاصيل من صور Sentinel-2 لدلتا النيل" },
    nav: {
      home: "الرئيسية", workspace: "مساحة العمل", algorithms: "الخوارزميات", upload: "رفع البيانات", guide: "الدليل",
      login: "تسجيل الدخول", logout: "تسجيل الخروج", getStarted: "ابدأ الآن", menu: "القائمة", closeMenu: "إغلاق القائمة", account: "الحساب", langLabel: "English"
    },
    units: { feddan: "فدان", km2: "كم²", ha: "هكتار", m2: "م²" },
    common: {
      back: "رجوع", cancel: "إلغاء", apply: "تطبيق", clear: "مسح", remove: "إزالة", replace: "استبدال", download: "تنزيل", print: "طباعة",
      loading: "جارٍ التحميل…", preview: "معاينة", close: "إغلاق", optional: "اختياري", error: "حدث خطأ", unknownError: "خطأ غير متوقع ({code}).",
      pages: "الصفحة {n} من {total}", of: "من", prev: "السابق", next: "التالي",
      toasts: { signedUp: "أُنشئ الحساب. أهلًا بك يا {name}!", welcomed: "أهلًا بعودتك يا {name}.", loggedOut: "تم تسجيل الخروج." }
    },
    home: {
      badge: "Sentinel-2 · Google Earth Engine · دلتا النيل",
      title: "خرائط محاصيل الدلتا بالفدان",
      subtitle: "تحوّل «دلتا فيجن» صور Sentinel-2 إلى خريطة من 12 فئة للمحاصيل والغطاء الأرضي، وتحسب كل المساحات بالفدان. حدّد منطقة الدراسة بالرسم على الخريطة أو برفع ملف SHP خاص بك، ثم اختر الموسم والخوارزمية واقرأ النتيجة على الخريطة وفي الجدول.",
      ctaPrimary: "ابدأ التصنيف", ctaSecondary: "كيف يعمل؟",
      chipAlgo: "11 خوارزمية", chipRes: "بكسل 10 أمتار", chipShp: "رفع SHP",
      heroAlt: "حقول وقرية في دلتا النيل من الجو",
      floatLabel: "فدان في منطقة برج العرب المدمجة",
      stats: [
        { value: "12", label: "فئة محاصيل وغطاء أرضي", text: "قمح، ذرة، أرز، برسيم، بطاطس، بنجر السكر، فول، عباد الشمس، بساتين، أرض بور، عمران، مياه." },
        { value: "238.095", label: "فدان في الكيلومتر المربع الواحد", text: "الفدان يساوي 4,200 م². تُحسب المساحات جيوديسيًا على إهليلج WGS84، وهي نفس الكمية التي يخرج بها Earth Engine." }
      ],
      slideAlt: "صورة {n} من {total}",
      slides: [
        { kicker: "من المدار", title: "دلتا النيل كل خمسة أيام", text: "يُعيد قمرا Sentinel-2 تصوير كل بقعة في الدلتا كل خمسة أيام. يجمع «دلتا فيجن» المشاهد الخالية من السحاب في الموسم في حزمة صفات واحدة لكل بكسل." },
        { kicker: "في الحقل", title: "كل قطعة تحتفظ بهويتها", text: "ارفع حدود حقلك أو حيّك أو منطقتك كملف شكل (SHP). تُرسم حدود كل قطعة على الخريطة، وتظهر مساحتها بالفدان في جدول مستقل." },
        { kicker: "على المكتب", title: "تقرير يمكن تسليمه", text: "يعرض جدول الفئات المساحة بالفدان والكم² والنسبة المئوية لكل محصول. صدّره كملف CSV أو اطبعه مع الخريطة وإعدادات التشغيل." },
        { kicker: "شتاء · نوفمبر – أبريل", title: "قمح وبرسيم وبنجر سكر", text: "في الشتاء تنافس القمح والبرسيم والبطاطس وبنجر السكر والفول والبساتين أرض البور والعمران والمياه. المحاصيل خارج موسمها مثل الذرة لا تفوز بأي بكسل شتوي." },
        { kicker: "صيف · مايو – أكتوبر", title: "ذرة وأرز وعباد شمس", text: "في الصيف تنافس الذرة والأرز والبرسيم والبطاطس وعباد الشمس والبساتين أرض البور والعمران والمياه." }
      ],
      product: {
        kicker: "المخرجات", watermark: "المخرجات", title: "ماذا ينتج عن كل تشغيل؟",
        text: "أربعة مخرجات لكل منطقة دراسة: الخريطة، وتقرير الفدان، وتقرير الدقة، والحدود التي بدأت منها.",
        more: "افتح مساحة العمل",
        ask: "تراها على منطقة دراستك؟",
        items: [
          { title: "خريطة التصنيف", text: "كل بكسل ملوّن حسب فئته، فوق صورة القمر الصناعي وحدود قطعك." },
          { title: "تقرير الفدان", text: "مساحة كل فئة بالفدان والكم² والنسبة المئوية، جاهزة للتنزيل بصيغة CSV أو للطباعة." },
          { title: "تقرير الدقة", text: "تُظهر عمليات التصنيف الموجَّه الدقة الكلية وكابا ودقة كل فئة على 30٪ من العينات المحجوبة عن التدريب." },
          { title: "حدودك", text: "ملفات SHP للحقول أو الأحياء: تُقرأ وتُحوَّل إلى WGS84 وتُقاس قطعة قطعة." }
        ]
      },
      features: {
        title: "منطقة دراسة واحدة، من ملف الشكل إلى الفدان",
        text: "تُعالَج الحدود وأنظمة الإحداثيات والمساحات كلها داخل متصفحك.",
        cta: "ابدأ الآن",
        items: [
          { title: "ارفع ملف شكل", text: "ملف .shp مع .dbf و.prj و.cpg، أو ملف .zip يحتويها. تُحوَّل الأحزمة المصرية ومناطق UTM والمرجعيات القديمة إلى WGS84." },
          { title: "ارسمه أو اكتب إحداثياته", text: "مضلع، أو مستطيل، أو مركز مع نصف قطر، أو صندوق محيطي بخط الطول وخط العرض." },
          { title: "المساحات بالفدان", text: "مساحات جيوديسية على WGS84 تُحوَّل بمعدل 4,200 م² للفدان، وتظهر لكل فئة ولكل قطعة." },
          { title: "11 خوارزمية", text: "غابة عشوائية، SVM، CART، تعزيز تدريجي، بايز الساذج، أقرب الجيران، أقل مسافة، MLP، وK-means، والمسح بالبصمات الطيفية." }
        ],
        note: "نسخة الواجهة فقط: خريطة الفئات في مساحة العمل نمط توضيحي. التصنيف الحقيقي يجري على محرك Earth Engine."
      },
      steps: {
        title: "كيف يسير التشغيل؟",
        items: [
          { title: "أنشئ حسابًا", text: "سجّل بياناتك، أو افتح الحساب التجريبي لتلقي نظرة." },
          { title: "حدّد منطقة الدراسة", text: "ارفع ملف شكل أو ارسم المنطقة على الخريطة. تظهر مساحتها بالفدان فورًا." },
          { title: "اختر الموسم والخوارزمية", text: "شتاء أو صيف أو سنة كاملة، مع واحدة من 11 خوارزمية ووسائطها." },
          { title: "اقرأ تقرير الفدان", text: "خريطة الفئات، ومساحة كل فئة، وتصدير CSV، وتقرير قابل للطباعة." }
        ]
      },
      cta: { title: "جاهز لرسم خريطة أرضك؟", text: "أنشئ حسابًا ونفّذ أول تصنيف في أقل من دقيقة.", button: "أنشئ حسابًا", login: "لدي حساب بالفعل" },
      aiNote: "الصور الفوتوغرافية في هذه الصفحة رسوم توضيحية مولّدة بالذكاء الاصطناعي."
    },
    login: {
      title: "أهلًا بعودتك", subtitle: "سجّل الدخول لفتح مساحة العمل.",
      email: "البريد الإلكتروني", emailPh: "name@example.com", password: "كلمة المرور", submit: "تسجيل الدخول",
      alt: "جديد في «دلتا فيجن»؟", toSignup: "أنشئ حسابًا",
      demoTitle: "تريد الاطلاع فقط؟", demoText: "افتح الحساب التجريبي بنقرة واحدة، دون أي نموذج.", demoButton: "دخول بحساب تجريبي",
      demoEmail: "بريد الحساب التجريبي", demoPassword: "كلمة المرور", back: "العودة إلى الرئيسية",
      required: "هذا الحقل مطلوب.",
      error: {
        BAD_CREDENTIALS: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
        STORAGE: "هذا المتصفح يرفض حفظ البيانات (وضع التصفح الخاص؟). لا يعمل تسجيل الدخول بدون التخزين المحلي."
      }
    },
    signup: {
      title: "أنشئ حسابك", subtitle: "يستغرق أقل من دقيقة.",
      name: "الاسم الكامل", namePh: "مثل: أحمد علي", org: "الجهة (اختياري)", orgPh: "جامعة أو شركة أو معهد",
      email: "البريد الإلكتروني", emailPh: "name@example.com", password: "كلمة المرور", passwordHint: "8 أحرف على الأقل، بحرف ورقم.",
      confirm: "تأكيد كلمة المرور", confirmPh: "أعد كتابة كلمة المرور",
      submit: "إنشاء الحساب", alt: "لديك حساب بالفعل؟", toLogin: "تسجيل الدخول", back: "العودة إلى الرئيسية",
      note: "هذه النسخة تعمل بلا خادم: يُحفظ الحساب في هذا المتصفح فقط، وبصيغة ملخّص مملّح لكلمة المرور. لا تستخدم هنا كلمة مرور حقيقية.",
      error: {
        EMAIL_TAKEN: "يوجد بالفعل حساب بهذا البريد الإلكتروني في هذا المتصفح.",
        STORAGE: "هذا المتصفح يرفض حفظ البيانات (وضع التصفح الخاص؟). لا يعمل إنشاء الحساب بدون التخزين المحلي.",
        NAME: "اكتب اسمك (من 2 إلى 60 حرفًا).", EMAIL: "اكتب بريدًا إلكترونيًا صحيحًا.",
        PASSWORD: "استخدم 8 أحرف على الأقل، بحرف ورقم.", CONFIRM: "كلمتا المرور غير متطابقتين."
      }
    },
    ws: {
      title: "مساحة العمل", subtitle: "حدّد منطقة الدراسة، واختر الموسم والخوارزمية، ثم اقرأ المساحات بالفدان.",
      previewBadge: "وضع المعاينة",
      previewText: "هذه الصفحة غير متصلة بـ Earth Engine: خريطة الفئات نمط توضيحي ولا تُحسب أي دقة. ملفات الشكل والمساحات والتصدير حقيقية.",
      studyArea: "منطقة الدراسة",
      tabs: { upload: "رفع SHP", draw: "رسم", circle: "مركز ونصف قطر", bbox: "صندوق محيطي" },
      sample: { button: "حمّل منطقة التجربة (برج العرب)", text: "لا يوجد ملف شكل معك؟ حمّل الحدود المدمجة التي يستخدمها المحرك افتراضيًا: {area} فدان." },
      upload: {
        title: "ملف الشكل (Shapefile)",
        hint: "ملف .zip، أو الملفات المتفرقة معًا: .shp و.dbf و.prj (و.cpg). إذا احتوى الأرشيف على عدة طبقات تُستخدم الأكبر.",
        drop: "أفلت ملف الشكل هنا", browse: "اختر الملفات", or: "أو",
        encoding: "ترميز جدول الصفات", encodingAuto: "تلقائي",
        layer: "الطبقة", features: "{n} عنصر", geometry: "نوع الهندسة", area: "المساحة", crs: "نظام الإحداثيات",
        nameField: "حقل التسمية", parcels: "القطع",
        applied: "على الخريطة", invalid: "تُقبل مكونات ملف الشكل أو أرشيفات .zip فقط.", processing: "جارٍ قراءة ملف الشكل…"
      },
      draw: {
        hint: "اختر أداة ثم ارسم على الخريطة. تنتهي أداة المضلع عند النقر على النقطة الأولى مرة أخرى.",
        polygon: "مضلع", rectangle: "مستطيل", clear: "إزالة الرسم", area: "المساحة المرسومة",
        finish: "إنهاء المضلع", first: "انقر النقطة الأولى مرة أخرى — أو اضغط «إنهاء المضلع» — لإغلاقه.", needMore: "أضف ثلاث نقاط على الأقل."
      },
      circle: { lon: "خط الطول", lat: "خط العرض", radius: "نصف القطر (كم)", apply: "ارسم الدائرة", hint: "تقع مصر بين خطي طول 24° و37° شرقًا وخطي عرض 22° و31.5° شمالًا." },
      bbox: { minLon: "أدنى خط طول", minLat: "أدنى خط عرض", maxLon: "أقصى خط طول", maxLat: "أقصى خط عرض", apply: "ارسم الصندوق" },
      invalidCoords: "راجع الإحداثيات: يجب أن تكون أرقامًا، والأدنى أصغر من الأقصى، وضمن حدود العالم.",
      invalidRadius: "اكتب نصف قطر بين 0.01 و500 كم.",
      season: {
        title: "الموسم", winter: "شتاء", summer: "صيف", full: "سنة كاملة", year: "السنة", period: "الصور من {from} إلى {to}",
        competing: "الفئات المتنافسة: {classes}"
      },
      algorithm: {
        title: "الخوارزمية", params: "الوسائط", cloud: "أقصى غطاء سحابي للمشهد (%)",
        rfTrees: "عدد الأشجار", knnK: "عدد الجيران (k)", kClusters: "عدد العناقيد (k)", mlpHidden: "خلايا الطبقة المخفية", mlpEpochs: "حقب التدريب",
        more: "عن الخوارزميات"
      },
      samples: {
        title: "عينات التدريب",
        hint: "اختياري. يحتاج المحرك إلى 20 نقطة على الأقل موزعة على فئتين على الأقل؛ بأقل من ذلك يختار بكسلات مرساة واثقة تلقائيًا.",
        class: "الفئة", pick: "أضف نقاطًا بالنقر على الخريطة", stop: "إيقاف الإضافة", upload: "ارفع ملف CSV",
        csvHint: "الأعمدة lon وlat وclass (رقم 1–12، أو رمز مثل WHT، أو الاسم).",
        count: "{n} نقطة", none: "لا توجد عينات بعد", clear: "مسح العينات",
        loaded: "تم تحميل {n} عينة", skipped: "، وتُخطّي {n}", inactive: "غير نشطة في هذا الموسم",
        unused: "لا تستخدم هذه الخوارزمية عينات تدريب.", pickHint: "انقر على الخريطة لإضافة نقطة من فئة {class}.",
        few: "{n} نقطة على {k} فئات — أقل من حد المحرك (20 نقطة على فئتين)، فستُستخدم مراسٍ تلقائية.",
        ok: "{n} نقطة على {k} فئات — تكفي للتدريب على نقاطك."
      },
      run: "صنّف", compare: "قارن الخوارزميات", running: "جارٍ التنفيذ…",
      needAoi: "حدّد منطقة الدراسة أولًا (بالرفع أو الرسم أو الإحداثيات).",
      aoi: {
        clear: "إزالة منطقة الدراسة",
        kinds: { shp: "ملف شكل", draw: "مرسومة", circle: "دائرة", bbox: "صندوق محيطي", sample: "حدود مدمجة" },
        total: "الإجمالي: {feddan} فدان ({km2} كم²)", perParcel: "{n} قطعة، كل واحدة مُقاسة على حدة", oneParcel: "مضلع واحد",
        hint: "المنطقة على الخريطة. اختر موسمًا وخوارزمية، ثم اضغط «صنّف».", removePoint: "إزالة النقطة",
        outlinesCapped: "تُرسم حدود أول {n} من {total} عنصرًا؛ وتُقاس مساحاتها كلها.", crsLatLon: "خط طول وخط عرض (WGS84)"
      },
      map: { satellite: "قمر صناعي", streets: "شوارع", opacity: "شفافية طبقة الفئات", legend: "الفئات", fit: "تكبير إلى منطقة الدراسة", outline: "منطقة الدراسة", aria: "خريطة منطقة الدراسة" },
      results: {
        title: "النتائج", run: "تشغيل: {algo} · {season} · {period}",
        total: "المساحة الكلية", parcels: "القطع", oa: "الدقة الكلية", kappa: "كابا", notComputed: "لا تُحسب في المعاينة",
        tableTitle: "المساحة لكل فئة", class: "الفئة", percent: "الحصة", second: "وأيضًا بوحدة",
        parcelsTitle: "المساحة لكل قطعة", parcel: "القطعة", ofMany: "عرض أول {n} من {total} قطعة.",
        signatureTitle: "بصمات NDVI المرجعية — {season}",
        signatureText: "متوسط NDVI والمدى 10–90٪ لكل فئة في المكتبة المرجعية للنموذج (الصفات التسع التي يعمل عليها المسح الفوري).",
        export: "تنزيل CSV", print: "طباعة التقرير", empty: "اختر منطقة وموسمًا وخوارزمية، ثم اضغط «صنّف».",
        cluster: "عنقود {n}", clusters: "عناقيد K-means (ليست أسماء محاصيل)",
        mode: "الوضع", modePreview: "معاينة توضيحية", modeLive: "Earth Engine",
        samples: "العينات", auto: "مراسٍ تلقائية", manual: "{n} من نقاطك", images: "المشاهد", train: "بكسلات التدريب", val: "بكسلات التحقق",
        cell: "خلية المعاينة: نحو {m} م", parcelsCsv: "CSV للقطع"
      },
      compareBtn: "قارن الخوارزميات",
      compare: {
        close: "إغلاق",
        title: "مقارنة الخوارزميات", text: "كل الخوارزميات الـ11 على منطقة الدراسة والموسم نفسهما. اختر واحدة لرؤية خريطة معاينتها؛ في نسخة متصلة يعرض هذا الجدول أيضًا الدقة الكلية وكابا لكل خوارزمية.",
        cols: { algo: "الخوارزمية", family: "العائلة", samples: "عينات التدريب", accuracy: "الدقة", params: "الوسائط", choose: "عرض" }
      },
      notes: {
        preview: "معاينة توضيحية: ليست مخرجات نموذج.",
        no_accuracy: "لم يتبقَّ 10 نقاط تحقق، لذلك لم تُحسب الدقة.",
        kmeans_no_accuracy: "يعطي K-means عناقيد طيفية لا أسماء محاصيل؛ لا يمكن حساب الدقة.",
        instant_estimate: "تقدير فوري: صُنّف كل بكسل بأقرب بصمة مرجعية، دون عينات تدريب.",
        auto_sample_failed: "لم توجد بكسلات واثقة تكفي لتدريب نموذج، فتراجع التشغيل إلى المسح الفوري."
      }
    },
    errors: {
      ZIP_BROKEN: "أرشيف .zip تالف أو ليس ملف zip.",
      ZIP64: "يستخدم هذا الأرشيف صيغة ZIP64 التي لا يدعمها القارئ في المتصفح. فك ضغطه وارفع الملفات المتفرقة.",
      ZIP_UNSUPPORTED: "هذا المتصفح لا يستطيع فك ضغط ملفات .zip. فك الضغط وارفع الملفات المتفرقة.",
      ZIP_METHOD: "يستخدم الـzip طريقة ضغط لا يتعامل معها القارئ. أعد ضغطه بطريقة Deflate أو Store.",
      DBF_BROKEN: "جدول الصفات .dbf تالف.",
      SHP_BROKEN: "ملف .shp تالف أو ليس ملف شكل ESRI.",
      SHP_MISSING: "لا يوجد ملف .shp. يحتاج ملف الشكل إلى .shp و.dbf على الأقل.",
      PRJ_MISSING: "لا يوجد ملف .prj وإحداثيات الملف ليست خط طول وخط عرض. أضف ملف .prj لنظام الإحداثيات الأصلي.",
      PRJ_UNSUPPORTED: "يصف ملف .prj نظام إحداثيات لا يمكن تفسيره. أعد إسقاط الطبقة إلى WGS84 (EPSG:4326) في برنامج GIS ثم صدّرها مرة أخرى.",
      PRJ_MISSING_LATLON: "لا يوجد ملف .prj: قُرئت الإحداثيات كخط طول وخط عرض (WGS84).",
      PRJ_UNSUPPORTED_LATLON: "تعذّر تفسير ملف .prj: قُرئت الإحداثيات كخط طول وخط عرض (WGS84).",
      DATUM_SHIFT: "لا يحمل ملف .prj أي تحويل بين المرجعيات: اعتُبرت الإحداثيات WGS84، وقد ينزاح الملف مكانيًا.",
      CSV_EMPTY: "لا يحتوي ملف CSV على أي صف صالح.",
      CSV_COLUMNS: "يحتاج CSV إلى أعمدة خط الطول وخط العرض والفئة (مثل lon, lat, class).",
      NO_POLYGONS: "لا تحتوي الطبقة على مضلعات لتصنيفها: تحتاج المساحات إلى عناصر من نوع مضلع أو مضلع متعدد.",
      INVALID: "راجع الحقول المعلَّمة.",
      EMAIL_TAKEN: "يوجد بالفعل حساب بهذا البريد الإلكتروني في هذا المتصفح.",
      BAD_CREDENTIALS: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      STORAGE: "هذا المتصفح يرفض حفظ البيانات (وضع التصفح الخاص؟).",
      BACKEND: "لم يستجب خادم التصنيف. حاول مرة أخرى بعد لحظات.",
      BACKEND_BAD: "أجاب خادم التصنيف بصيغة لا تفهمها هذه الصفحة."
    },
    warns: {
      PRJ_MISSING_LATLON: "لا يوجد .prj: قُرئت الإحداثيات كخط طول وخط عرض.",
      PRJ_UNSUPPORTED_LATLON: "تعذّر تفسير .prj: قُرئت الإحداثيات كخط طول وخط عرض.",
      DATUM_SHIFT: "لا يحمل .prj تحويلًا بين المرجعيات: اعتُبرت WGS84.",
      datumShift: "المرجعية {name}: طُبِّق التحويل إلى WGS84 (بدقة نحو {m} م).",
      noDbf: "لا يوجد .dbf: رُقّمت القطع.",
      otherLayers: "طبقات مُتجاهَلة في الأرشيف: {names}."
    },
    algo: {
      title: "الخوارزميات الـ11", cta: "جرّبها في مساحة العمل",
      subtitle: "تسع مصنفات موجَّهة تُدرَّب على بكسلات معلَّمة، وتجميع واحد غير موجَّه، ومسح واحد قائم على المعرفة، وكلها تقرأ حزمة الصفات نفسها من Sentinel-2.",
      group: { supervised: "موجَّه", unsupervised: "غير موجَّه", knowledge: "قائم على المعرفة" },
      groupText: {
        supervised: "تتعلم من بكسلات معلَّمة. بأقل من 20 نقطة منك يستخرج المحرك بكسلات مرساة واثقة من الصورة نفسها.",
        unsupervised: "تجمّع البكسلات حسب التشابه الطيفي دون أسماء. المجموعات ليست أسماء محاصيل.",
        knowledge: "تقارن كل بكسل بمكتبة البصمات الطيفية المرجعية. بلا تدريب، ونتيجة فورية."
      },
      labels: {
        needs: "عينات التدريب", yes: "منك، أو مراسٍ تلقائية", no: "غير مطلوبة",
        accuracy: "الدقة", measured: "على 30٪ من العينات المحجوبة", none: "لا يمكن قياسها", params: "الوسائط", fixed: "لا يوجد"
      },
      names: {
        rf: "الغابة العشوائية (Random Forest)", svm: "آلة المتجهات الداعمة (SVM)", cart: "شجرة القرار (CART)", gtb: "التعزيز التدريجي للأشجار (GTB)",
        nb: "بايز الساذج", mlp: "الشبكة العصبية (MLP)", knn: "أقرب الجيران (KNN)", mindist_e: "أقل مسافة (إقليدية)",
        mindist_m: "أقل مسافة (مهالانوبيس)", kmeans: "تجميع K-means", signature: "المسح بالبصمات (فوري)"
      },
      text: {
        rf: "مجموعة من أشجار القرار؛ كل شجرة تصوّت وتفوز الفئة الأكثر أصواتًا. متينة، وعادة أقوى خط أساس.",
        svm: "تفصل الفئات بحدود بأكبر هامش ممكن (libsvm).",
        cart: "شجرة قرار واحدة: سريعة وسهلة القراءة، وأقل ثباتًا من مجموعة الأشجار.",
        gtb: "أشجار تُبنى تباعًا، كل واحدة تصحح أخطاء سابقاتها (60 شجرة).",
        nb: "مصنف احتمالي يفترض استقلال حزم الصفات؛ سريع، لكن فرض الاستقلال تقريبي.",
        mlp: "شبكة عصبية تغذية أمامية صغيرة تُدرَّب خارج Earth Engine (24 خلية مخفية و400 حقبة افتراضيًا)، ثم تُطبَّق على الصورة بكسل بكسل.",
        knn: "يُسمّي البكسل حسب الفئة الأكثر تكرارًا بين k من أقرب بكسلات التدريب إليه؛ k من 1 إلى 15.",
        mindist_e: "ينسب كل بكسل إلى الفئة التي يكون متوسطها أقرب إليه بمسافة إقليدية.",
        mindist_m: "أقل مسافة مع مراعاة التغاير داخل كل فئة. تحتاج بكسلات تدريب أكثر لكل فئة، فيسحب المحرك 140 مرساة لكل فئة بدل 50.",
        kmeans: "يجمّع البكسلات في k عنقودًا طيفيًا دون أسماء (من 2 إلى 30 عنقودًا، و8 افتراضيًا)، ويُدرَّب على 2,500 بكسل بعينات كل 100 م.",
        signature: "بلا تدريب: يذهب كل بكسل إلى أقرب بصمة مرجعية في الموسم، مع علاوة انتشار للفئات السائدة في المنطقة. تقدير فوري، ومعلَّم كذلك."
      },
      protocol: {
        title: "كيف تُدرَّب النماذج الموجَّهة",
        items: [
          { title: "حزمة صفات لكل بكسل", text: "لكل بكسل يركّب المحرك وسيطًا شهريًا لـNDVI وNDWI وNDMI لكل شهر في الفترة (6 أشهر في الموسم، و12 في السنة الكاملة)، وخمسة إحصاءات لـNDVI (المئين العاشر والخمسون والتسعون، المتوسط، الانحراف المعياري)، ووسيط الحزم B4 وB8 وB11 وB12: 27 حزمة في الموسم، و45 في السنة الكاملة." },
          { title: "اثنتا عشرة بصمة مرجعية", text: "لكل فئة بصمة مرجعية من تسع صفات موسمية: متوسط NDVI ومئيناه العاشر والتسعون، ومتوسط NDWI، ومتوسط NDMI، ووسيط B4 وB8 وB11 وB12، مُعايَرة على قياسات Sentinel-2 فوق برج العرب." },
          { title: "التسميات: نقاطك أو مراسٍ تلقائية", text: "بـ 20 نقطة منك على الأقل موزعة على فئتين على الأقل تكون نقاطك هي التسميات. وإلا تختار البصمات البكسلات التي تفوز فئتها بوضوح على الوصيفة (هامش 0.35 على الأقل): 50 مرساة لكل فئة بعينات كل 20 م. يجب أن تجتاز مراسٍ العمران أيضًا قاعدة عمرانية (NDBI أعلى من −0.02، وNDWI أقل من 0، وNDVI أقل من 0.25)." },
          { title: "تقسيم 70 / 30", text: "تُقسَّم البكسلات المعلَّمة عشوائيًا: 70٪ لتدريب النموذج و30٪ للتحقق منه. تُقاس الدقة الكلية وكابا والدقة والاستدعاء وF1 على الـ30٪ وحدها؛ وبأقل من 10 نقاط تحقق يُبلّغ التشغيل بعدم وجود دقة." },
          { title: "حد أدنى لكل فئة، ومسار بديل", text: "تشارك الفئة بـ25 بكسل مرسًى على الأقل، وأكثر في مسافة مهالانوبيس التي تحتاج إلى عكس مصفوفة تغاير. إذا لم تؤهل فئتان فأكثر، يتراجع التشغيل إلى المسح الفوري بالبصمات ويذكر ذلك." }
        ]
      }
    },
    upload: {
      title: "رفع البيانات", subtitle: "حمّل حدود منطقة الدراسة وعينات التدريب، وراجعها، ثم افتحها في مساحة العمل.",
      shpTitle: "منطقة الدراسة — ملف شكل", shpText: "مضلعات أو مضلعات متعددة مع ملف .prj. الملفات لا تغادر جهازك.",
      csvTitle: "عينات التدريب — CSV", csvText: "نقطة في كل صف مع رقم الفئة (1–12) أو رمزها (WHT، RIC…) أو اسمها.",
      open: "افتح في مساحة العمل", loginFirst: "سجّل الدخول للمتابعة",
      summaryTitle: "البيانات المحمَّلة", none: "لم يُحمَّل شيء بعد.",
      attributes: "الصفات", rows: "عرض أول {n} من {total} صفًا.",
      template: "تنزيل نموذج CSV",
      kept: "تبقى البيانات في هذا المتصفح في انتظارك في مساحة العمل حتى إعادة تحميل الصفحة."
    },
    guide: {
      title: "الدليل", subtitle: "ست خطوات من خريطة فارغة إلى تقرير بالفدان، وأكثر الأسئلة تكرارًا.",
      stepsTitle: "خطوة بخطوة", step: "الخطوة {n}",
      steps: [
        { title: "أنشئ حسابًا أو افتح الحساب التجريبي", text: "يطلب التسجيل اسمًا وبريدًا إلكترونيًا وكلمة مرور. ويفتح الحساب التجريبي مساحة العمل دون نموذج." },
        { title: "حدّد منطقة الدراسة", text: "ارفع ملف شكل (ملف .zip أو الملفات .shp و.dbf و.prj المتفرقة)، أو حمّل حدود برج العرب المدمجة، أو ارسم مضلعًا أو مستطيلًا، أو اكتب مركزًا مع نصف قطر أو صندوقًا محيطيًا." },
        { title: "راجع المساحة", text: "بمجرد وجود المنطقة على الخريطة تظهر مساحتها الجيوديسية بالفدان. وفي ملف الشكل تُقاس كل قطعة على حدة." },
        { title: "اختر الفترة", text: "يمتد الشتاء من 1 نوفمبر من السنة السابقة إلى 30 أبريل، والصيف من 1 مايو إلى 31 أكتوبر، والسنة الكاملة من 1 يناير إلى 31 ديسمبر. ولا تتنافس على البكسلات إلا محاصيل الموسم." },
        { title: "اختر الخوارزمية ووسائطها", text: "الغابة العشوائية هي الافتراضية. تعرض كل خوارزمية الوسائط التي تستخدمها فقط، مع حد الغطاء السحابي للمشاهد." },
        { title: "أضف عينات إن وجدت، ثم شغّل", text: "العينات اختيارية: انقر على الخريطة أو ارفع CSV. يعطي «صنّف» الخريطة وجدول الفدان، وتعرض «قارن» كل الخوارزميات جنبًا إلى جنب." }
      ],
      faqTitle: "أكثر الأسئلة تكرارًا",
      faq: [
        { q: "كيف يُدرَّب نموذج على 12 بصمة فقط؟", a: "ليس على 12 رقمًا. الـ12 فئات. لكل فئة بصمة مرجعية من 9 صفات، ولهذه البصمات وظيفتان: يُسمّي المسح الفوري كل بكسل بأقرب بصمة إليه، وفي الخوارزميات الموجَّهة تختار البصمات بكسلات مرساة واثقة تُوصَف بعد ذلك بحزمة الصفات كاملة (27 إلى 45 حزمة) وتُعلَّم بفئتها. هذه المجموعة المعلَّمة، لا البصمات، هي التي تدرّب الغابة العشوائية وSVM وغيرهما." },
        { q: "لماذا الفدان؟ وكم دقته؟", a: "الفدان يساوي 4,200 م²، فالكيلومتر المربع يساوي 238.095 فدان. تقيس الواجهة كل مضلع كمساحة جيوديسية على إهليلج WGS84، وهي نفس الكمية التي يعطيها pixelArea() في Earth Engine، فرقم الفدان لقطعة ما هنا هو نفسه في التشغيل الحقيقي. في المرجعيات القديمة (Egypt 1907 وED50) تبلغ دقة التحويل المدمج نحو 10–11 م: قد تنزاح الحدود قليلًا، أما المساحات فتكاد لا تتغير." },
        { q: "أي ملفات شكل يمكن رفعها؟", a: "ملفات شكل ESRI (مضلعات بفتحات ومضلعات متعددة)، متفرقة (.shp و.dbf و.prj و.cpg) أو مضغوطة. أي نظام إحداثيات له ملف .prj مقروء يُحوَّل إلى WGS84: مناطق UTM، والأحزمة المصرية الأحمر والأزرق والبنفسجي على Egypt 1907، وED50، وWeb Mercator، أو رقم EPSG. بدون .prj تُقبل الملفات بخط الطول وخط العرض فقط. وتُقرأ جداول الصفات العربية بترميز Windows-1256 أو ISO-8859-6 أو DOS-864." },
        { q: "شتاء أم صيف أم سنة كاملة؟", a: "تتبع المواسم التقويم الزراعي المصري. الشتاء (1 نوفمبر – 30 أبريل) قمح وبرسيم وبطاطس وبنجر سكر وفول وبساتين وأرض بور وعمران ومياه؛ والصيف (1 مايو – 31 أكتوبر) ذرة وأرز وبرسيم وبطاطس وعبّاد الشمس وبساتين وأرض بور وعمران ومياه. السنة الكاملة تتيح للفئات الـ12 جميعًا التنافس، لكنها تخلط محاصيل لا تنمو معًا، فالموسم خيار أفضل." },
        { q: "لماذا الدقة غير موجودة؟", a: "تُقاس الدقة على عينات معلَّمة لم يرها النموذج في التدريب. لا أسماء لـK-means ولا تدريب للمسح الفوري، فلا دقة لأي منهما. ويُبلّغ التشغيل الموجَّه بعدم وجود دقة إذا بقي أقل من 10 نقاط تحقق بعد تقسيم 70/30. وفي نسخة الواجهة هذه لا يجري تصنيف حقيقي، فتبقى بطاقتا الدقة فارغتين." },
        { q: "هل يغادر ملف الشكل جهازي؟", a: "لا. يقرأ الملف متصفحك نفسه ولا يُرفع إلى أي مكان. وكذلك الحساب: يُحفظ في هذا المتصفح فقط." },
        { q: "كيف أحصل على نتائج حقيقية؟", a: "وصّل خادم Earth Engine: استبدل محوّل المعاينة في السكربت (DVBackend) بطلب إلى نقطة التشغيل عندك، وأرسل كائن الإدخال نفسه (الخوارزمية والموسم والسنة وحد السحاب والوسائط ونقاط العينات ومنطقة الدراسة بصيغة GeoJSON). لوحة النتائج تقبل بالفعل شكل مخرجات المحرك (رابط المربعات، الدقة، كابا، مساحات الفئات)." }
      ],
      limitsTitle: "ما الحقيقي في هذه النسخة وما ليس كذلك",
      limits: {
        real: { title: "حقيقي", text: "قراءة ملفات الشكل، وتحويل أنظمة الإحداثيات، والمساحات الجيوديسية بالفدان (لكل فئة ولكل قطعة)، وتصدير CSV، والتقرير المطبوع." },
        preview: { title: "معاينة", text: "خريطة الفئات. هي نمط توضيحي مبني من فئات الموسم وأوزانها الإقليمية، وليست تصنيفًا من القمر الصناعي. لذلك لا تُعرض الدقة ولا كابا." },
        demo: { title: "تجريبي", text: "الحسابات. تعيش في التخزين المحلي لهذا المتصفح بحماية ملخّص مملّح لكلمة المرور، لكن بلا خادم خلفها ليست أمانًا إنتاجيًا." }
      }
    },
    report: {
      title: "دلتا فيجن — تقرير تصنيف", studyArea: "منطقة الدراسة", period: "الفترة", algorithm: "الخوارزمية", params: "الوسائط",
      generated: "أُنشئ في",
      disclaimer: "معاينة توضيحية: خريطة الفئات ليست مخرجات نموذج ولم تُحسب أي دقة. المساحات جيوديسية (WGS84)، والفدان = 4,200 م²."
    },
    footer: {
      about: "تصنيف محاصيل دلتا النيل بـSentinel-2 وGoogle Earth Engine.",
      links: "الصفحات", credits: "البيانات والبرمجيات",
      data: "الصور: Copernicus Sentinel-2 (ESA). خريطة الأساس: Esri World Imagery، © مساهمو OpenStreetMap.",
      software: "بُنيت بـLeaflet وproj4js. الخطوط Poppins وCairo (رخصة SIL Open Font License).",
      build: "نسخة الواجهة: تُحفظ الحسابات في هذا المتصفح، وخريطة الفئات معاينة توضيحية.",
      rights: "دلتا فيجن — للدراسة والعرض."
    }
  };

  return {
    CLASSES: CLASSES, ALGORITHMS: ALGORITHMS, PARAMS: PARAMS, SEASONS: SEASONS, YEARS: YEARS, DEFAULT_YEAR: DEFAULT_YEAR,
    DEFAULT_ALGORITHM: DEFAULT_ALGORITHM, classById: classById, algorithmByKey: algorithmByKey, period: period,
    activeClasses: activeClasses, defaults: defaults,
    t: t, lang: lang, dir: dir, setLang: setLang, fmt: fmt, unit: unit,
    dictionaries: { ar: ar, en: en }
  };
});
