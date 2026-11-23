/*
 * Delta Vision — app.js
 * The single-page front end: hash routing, landing-page widgets, the demo auth flow,
 * the workspace (shapefile upload, drawing, the preview classification, feddan results),
 * and the static Algorithms / Data-upload / Guide pages.
 *
 * Everything class-map-shaped here is the PREVIEW adapter (DVBackend): an illustrative
 * pattern built from the season's classes and their regional weights. Real classification
 * happens on the Earth Engine engine; swap this adapter for your run endpoint.
 */
(function () {
  "use strict";

  var I = window.DVI18N, D = window.DVData, G = window.DVGeo, A = window.DVAuth;
  var KEY_PREFS = "dv_prefs";

  // ---------------------------------------------------------------- state
  var state = {
    lang: I.lang(),
    season: "winter",
    year: I.DEFAULT_YEAR,
    algorithm: I.DEFAULT_ALGORITHM,
    params: I.defaults(),
    aoi: null,        // { kind, name, fc, areaM2, parcels:[{name, areaM2}], crsLabel, warnings, encoding }
    samples: [],
    results: null,
    secondUnit: "km2",
    drawing: null,    // { mode:"poly"|"rect", points:[], first }
    picking: false
  };
  try { var p = JSON.parse(localStorage.getItem(KEY_PREFS) || "{}"); if (p) { ["season","year","algorithm","secondUnit"].forEach(function (k) { if (p[k] != null) state[k] = p[k]; }); if (p.params) state.params = p.params; } } catch (e) { /* ignore */ }
  function savePrefs() {
    try { localStorage.setItem(KEY_PREFS, JSON.stringify({ season: state.season, year: state.year, algorithm: state.algorithm, params: state.params, secondUnit: state.secondUnit })); } catch (e) { /* ignore */ }
  }
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var t = function (path, vars) { return I.t(path, vars); };
  var fmt = I.fmt;
  var feddan = function (m2, digits) { return fmt(G.m2ToFeddan(m2), digits == null ? 2 : digits); };

  // ---------------------------------------------------------------- toasts
  var toastTimer = null;
  function toast(msg, isErr) {
    var node = $("#toast"); if (!node) return;
    node.textContent = msg;
    node.classList.toggle("is-err", !!isErr);
    node.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove("is-on"); }, 3600);
  }

  // ---------------------------------------------------------------- routing
  var VIEWS = ["home", "login", "signup", "workspace", "algorithms", "upload", "guide"];
  function route() {
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    var name = h.split("?")[0].split("/")[0] || "home";
    if (VIEWS.indexOf(name) < 0) name = "home";
    var next = null;
    if (name === "login" || name === "signup") {
      if (A.session()) next = "workspace";
    } else if (name === "workspace" || name === "upload") {
      if (!A.session()) { next = "login"; try { sessionStorage.setItem("dv_next", "#/" + h); } catch (e) { /* ignore */ } }
    }
    if (next) { location.hash = "#/" + next; return; }
    VIEWS.forEach(function (v) { var node = $("#view-" + v); if (node) node.classList.toggle("is-on", v === name); });
    if (name === "workspace") onWorkspaceEnter();
    var links = $$("#nav-links a");
    links.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#/" + name || (name === "home" && a.getAttribute("href") === "#/")); });
    $("#nav-drawer").classList.remove("is-open");
    $("#menu-btn").classList.remove("is-open");
    $("#menu-btn").setAttribute("aria-expanded", "false");
    window.scrollTo(0, 0);
    document.title = t("meta.title");
  }
  window.addEventListener("hashchange", route);

  // ---------------------------------------------------------------- i18n application
  function applyTranslations() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = I.dir();
    $$("[data-i18n]").forEach(function (node) {
      var key = node.getAttribute("data-i18n");
      var v = t(key);
      if (v && v !== key) node.textContent = v;
    });
    $$("[data-i18n-ph]").forEach(function (node) { node.placeholder = t(node.getAttribute("data-i18n-ph")); });
    $$("[data-i18n-aria]").forEach(function (node) { node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria"))); });
    $$("[data-i18n-title]").forEach(function (node) { node.title = t(node.getAttribute("data-i18n-title")); });
    $$("[data-i18n-alt]").forEach(function (node) { node.alt = t(node.getAttribute("data-i18n-alt")); });
    var langBtn = $("#lang-btn"); if (langBtn) langBtn.textContent = t("nav.langLabel");
    document.title = t("meta.title");
  }

  // ---------------------------------------------------------------- home: dynamic lists
  function renderHome() {
    // hero stats
    var stats = $("#hero-stats"); stats.innerHTML = "";
    t("home.stats").forEach(function (s) {
      var d = el("div", "stat");
      d.appendChild(el("span", "stat-value num", s.value));
      d.appendChild(el("span", "stat-label", s.label));
      d.appendChild(el("span", "stat-text", s.text));
      stats.appendChild(d);
    });
    $("#hero-feddan").textContent = feddan(D.BOURJ.areaM2);

    // carousel: the same five photos, crossfading under the caption block
    var slides = t("home.slides"), total = slides.length;
    var IMGS = ["c_space", "c_drone", "c_tablet", "c_wheat", "c_rice"];
    var stage = $("#carousel-stage"), texts = $("#carousel-texts"), thumbs = $("#carousel-thumbs");
    stage.innerHTML = ""; texts.innerHTML = ""; thumbs.innerHTML = "";
    slides.forEach(function (s, i) {
      var sl = el("div", "slide" + (i === 0 ? " is-on" : ""));
      var img = el("img"); img.dataset.img = IMGS[i]; img.alt = t("home.slideAlt", { n: i + 1, total: total });
      sl.appendChild(img); stage.appendChild(sl);
      var tx = el("div", "carousel-text" + (i === 0 ? " is-on" : ""));
      tx.appendChild(el("span", "carousel-kicker", s.kicker));
      tx.appendChild(el("h3", null, s.title));
      tx.appendChild(el("p", null, s.text));
      texts.appendChild(tx);
      var th = el("button", "thumb" + (i === 0 ? " is-on" : ""));
      th.type = "button"; th.setAttribute("aria-label", t("home.slideAlt", { n: i + 1, total: total }));
      var ti = el("img"); ti.dataset.img = IMGS[i]; ti.alt = "";
      th.appendChild(ti); thumbs.appendChild(th);
    });
    var current = 0, timer = null;
    function show(i) {
      current = (i + slides.length) % slides.length;
      $$("#carousel-stage .slide").forEach(function (n, k) { n.classList.toggle("is-on", k === current); });
      $$("#carousel-texts .carousel-text").forEach(function (n, k) { n.classList.toggle("is-on", k === current); });
      $$("#carousel-thumbs .thumb").forEach(function (n, k) { n.classList.toggle("is-on", k === current); });
      $("#carousel-page").textContent = t("common.pages", { n: current + 1, total: slides.length });
    }
    function restart() {
      clearInterval(timer);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) timer = setInterval(function () { show(current + 1); }, 6000);
    }
    thumbs.addEventListener("click", function (ev) { var b = ev.target.closest(".thumb"); if (b) { show(Array.prototype.indexOf.call(thumbs.children, b)); restart(); } });
    $("#carousel-prev").addEventListener("click", function () { show(current - 1); restart(); });
    $("#carousel-next").addEventListener("click", function () { show(current + 1); restart(); });
    var carousel = $("#carousel");
    carousel.addEventListener("mouseenter", function () { clearInterval(timer); });
    carousel.addEventListener("mouseleave", restart);
    show(0); restart();

    // product cards
    var items = t("home.product.items");
    var IMGS_P = ["p_laptop", "p_mosaic", "p_desert", "c_tablet"];
    var row = $("#product-row"); row.innerHTML = "";
    items.forEach(function (it, i) {
      var card = el("article", "product-card");
      var img = el("img"); img.dataset.img = IMGS_P[i]; img.alt = it.title; img.loading = "lazy";
      card.appendChild(img);
      var cap = el("div", "product-caption");
      cap.appendChild(el("h3", null, it.title));
      cap.appendChild(el("p", null, it.text));
      card.appendChild(cap);
      row.appendChild(card);
    });
    $("#product-watermark").textContent = t("home.product.watermark");
    $("#product-prev").addEventListener("click", function () { row.scrollBy({ left: (I.dir() === "rtl" ? 1 : -1) * row.clientWidth * 0.7, behavior: "smooth" }); });
    $("#product-next").addEventListener("click", function () { row.scrollBy({ left: (I.dir() === "rtl" ? -1 : 1) * row.clientWidth * 0.7, behavior: "smooth" }); });

    // feature tiles
    var fitems = t("home.features.items");
    var ICONS = [
      '<path d="M12 15V3M7 8l5-5 5 5"></path><path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4"></path>',
      '<path d="M3 9l9-6 9 6v6l-9 6-9-6z"></path><path d="M3 9l9 6 9-6M12 15v9"></path>',
      '<rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 7h8M8 12h8M8 17h5"></path>',
      '<circle cx="12" cy="12" r="3"></circle><circle cx="5" cy="6" r="2"></circle><circle cx="19" cy="6" r="2"></circle><circle cx="5" cy="18" r="2"></circle><circle cx="19" cy="18" r="2"></circle><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"></path>'
    ];
    var grid = $("#feature-grid"); grid.innerHTML = "";
    fitems.forEach(function (it, i) {
      var tile = el("article", "tile reveal");
      var ic = el("span", "icon-tile");
      ic.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[i] + '</svg>';
      tile.appendChild(ic);
      tile.appendChild(el("h3", null, it.title));
      tile.appendChild(el("p", null, it.text));
      grid.appendChild(tile);
    });

    // steps
    var steps = $("#steps"); steps.innerHTML = "";
    t("home.steps.items").forEach(function (s, i) {
      var d = el("article", "step reveal");
      d.appendChild(el("span", "step-num num", String(i + 1)));
      d.appendChild(el("h3", null, s.title));
      d.appendChild(el("p", null, s.text));
      steps.appendChild(d);
    });
    $("#sample-text").textContent = t("ws.sample.text", { area: feddan(D.BOURJ.areaM2) });
    assignImages();
  }

  function assignImages() {
    $$("img[data-img]").forEach(function (img) {
      var name = img.getAttribute("data-img");
      if (window.DVIMG && window.DVIMG[name]) img.src = window.DVIMG[name];
    });
  }

  // ---------------------------------------------------------------- reveal on scroll
  function observeReveals() {
    if (!("IntersectionObserver" in window)) { $$(".reveal").forEach(function (n) { n.classList.add("is-in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    $$(".reveal").forEach(function (n) { if (!n.classList.contains("is-in")) io.observe(n); });
  }

  // ---------------------------------------------------------------- auth UI
  function renderNavAuth() {
    var box = $("#nav-auth"); box.innerHTML = "";
    var langBtn = el("button", "lang-btn");
    langBtn.id = "lang-btn"; langBtn.type = "button"; langBtn.textContent = t("nav.langLabel");
    langBtn.setAttribute("aria-label", t("nav.langLabel"));
    langBtn.addEventListener("click", toggleLang);
    box.appendChild(langBtn);
    var sess = A.session();
    if (!sess) {
      var a1 = el("a", "btn btn-ghost", t("nav.login")); a1.href = "#/login"; box.appendChild(a1);
      var a2 = el("a", "btn btn-lime", t("nav.getStarted")); a2.href = "#/signup"; box.appendChild(a2);
    } else {
      var acc = el("div", "account");
      var btn = el("button", "account-btn");
      btn.type = "button";
      var av = el("span", "avatar", (sess.name || sess.email || "?").trim().charAt(0).toUpperCase() || "?");
      var nm = el("span", null, (sess.name || sess.email).split("@")[0]);
      btn.appendChild(av); btn.appendChild(nm);
      btn.setAttribute("aria-expanded", "false");
      var menu = el("div", "account-menu"); menu.hidden = true;
      var who = el("div", "who");
      var b = el("b", null, sess.name || ""); var em = el("span", null, sess.email || "");
      who.appendChild(b); who.appendChild(em);
      if (sess.org) who.appendChild(el("span", null, sess.org));
      menu.appendChild(who);
      var out = el("button", "btn btn-ghost btn-sm", t("nav.logout"));
      out.type = "button";
      out.addEventListener("click", function () { A.logout(); toast(t("common.toasts.loggedOut")); renderNavAuth(); route(); });
      menu.appendChild(out);
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        menu.hidden = !menu.hidden;
        btn.setAttribute("aria-expanded", String(!menu.hidden));
      });
      document.addEventListener("click", function () { if (!menu.hidden) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
      acc.appendChild(btn); acc.appendChild(menu);
      box.appendChild(acc);
    }
  }

  function toggleLang() {
    state.lang = state.lang === "ar" ? "en" : "ar";
    I.setLang(state.lang);
    applyTranslations();
    renderNavAuth(); renderHome(); renderWorkspaceChrome(); renderAlgorithmPage(); renderUploadPage(); renderGuidePage(); applyModeBadge();
    toast(state.lang === "ar" ? "تم التبديل إلى العربية" : "Switched to English");
  }

  // ---------------------------------------------------------------- auth forms
  function fieldError(form, key, msg) {
    var node = form.querySelector('[data-err="' + key + '"]');
    if (node) node.textContent = msg || "";
    var input = form.querySelector('[name="' + key + '"]');
    if (input) input.closest(".field").classList.toggle("has-err", !!msg);
  }
  function clearErrors(form) { $$("#" + form.id + " .field").forEach(function (f) { f.classList.remove("has-err"); }); $$("[data-err]").forEach(function (n) { n.textContent = ""; }); var fe = form.querySelector(".form-err"); if (fe) fe.hidden = true; }
  function formError(form, msg) { var fe = form.querySelector(".form-err"); if (fe) { fe.textContent = msg; fe.hidden = false; } }

  function initAuthForms() {
    $("#demo-email").textContent = A.DEMO.email;
    $("#demo-password").textContent = A.DEMO.password;

    var lf = $("#login-form");
    lf.addEventListener("submit", function (ev) {
      ev.preventDefault(); clearErrors(lf);
      var email = $("#login-email").value.trim(), password = $("#login-password").value;
      var bad = false;
      if (!email) { fieldError(lf, "email", t("login.required")); bad = true; }
      if (!password) { fieldError(lf, "password", t("login.required")); bad = true; }
      if (bad) return;
      var res = A.login(email, password);
      if (res.ok) { afterLogin(t("common.toasts.welcomed", { name: res.user.name || res.user.email })); }
      else if (res.error === "BAD_CREDENTIALS" || res.error === "STORAGE") { formError(lf, t("login.error." + res.error)); }
      else formError(lf, t("common.unknownError", { code: res.error || "?" }));
    });
    $("#demo-btn").addEventListener("click", function () {
      A.ensureDemo();
      var res = A.login(A.DEMO.email, A.DEMO.password);
      if (res.ok) afterLogin(t("common.toasts.welcomed", { name: res.user.name }));
      else toast(t("common.error"), true);
    });

    var sf = $("#signup-form");
    sf.addEventListener("submit", function (ev) {
      ev.preventDefault(); clearErrors(sf);
      var name = $("#su-name").value.trim(), org = $("#su-org").value.trim();
      var email = $("#su-email").value.trim(), password = $("#su-password").value, confirm = $("#su-confirm").value;
      var res = A.signup({ name: name, email: email, password: password, org: org, confirm: confirm });
      if (res.ok) {
        A.login(email, password); // standard UX: signing up also opens the session
        afterLogin(t("common.toasts.signedUp", { name: res.user.name }));
      }
      else if (res.errors) {
        Object.keys(res.errors).forEach(function (k) { fieldError(sf, k, t("signup.error." + k)); });
        if (res.error === "STORAGE" || res.error === "EMAIL_TAKEN") formError(sf, t("signup.error." + res.error));
      } else if (res.error) { formError(sf, t("signup.error." + res.error) !== "signup.error." + res.error ? t("signup.error." + res.error) : t("common.unknownError", { code: res.error })); }
    });
  }
  function afterLogin(msg) {
    toast(msg);
    renderNavAuth();
    var next = "#/workspace";
    try { next = sessionStorage.getItem("dv_next") || next; sessionStorage.removeItem("dv_next"); } catch (e) { /* ignore */ }
    location.hash = next;
  }

  // ---------------------------------------------------------------- the map
  var map = null, aoiLayer = null, samplesLayer = null, overlayLayer = null, drawLayer = null;
  var basemaps = null, activeBasemap = "satellite";
  function initMap() {
    if (map) return;
    var Esri_WorldImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" });
    var OSM = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" });
    basemaps = { satellite: Esri_WorldImagery, streets: OSM };
    map = L.map("map", { center: [30.9, 29.85], zoom: 8, zoomControl: true, worldCopyJump: true });
    basemaps[activeBasemap].addTo(map);
    aoiLayer = L.layerGroup().addTo(map);
    samplesLayer = L.layerGroup().addTo(map);
    drawLayer = L.layerGroup().addTo(map);
    map.on("click", onMapClick);
    $$("#basemap-seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        activeBasemap = b.getAttribute("data-basemap");
        map.eachLayer(function (l) { if (l instanceof L.TileLayer) map.removeLayer(l); });
        basemaps[activeBasemap].addTo(map);
        $$("#basemap-seg button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      });
    });
    $("#overlay-opacity").addEventListener("input", function () {
      if (overlayLayer) overlayLayer.setOpacity(parseFloat(this.value));
    });
    $("#fit-btn").addEventListener("click", fitAoi);
    map.on("keypress", function (ev) { if (ev.originalEvent.key === "Escape") endDrawing(false); });
  }
  function fitAoi() {
    if (!state.aoi) return;
    var b = G.collectionBbox(state.aoi.fc);
    map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [24, 24] });
  }
  function styleAoi() {
    return { color: "#c6f24e", weight: 2, opacity: 1, fillColor: "#ffffff", fillOpacity: 0.04, dashArray: null };
  }

  function drawAoi() {
    aoiLayer.clearLayers();
    if (!state.aoi) { $("#legend").innerHTML = ""; return; }
    var feats = state.aoi.fc.features;
    var cap = 5000;
    var shown = 0;
    feats.forEach(function (f) {
      if (f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")) {
        var l = L.geoJSON(f, { style: styleAoi, pane: "overlayPane" });
        if (shown < cap) { aoiLayer.addLayer(l); shown++; }
      }
    });
    var note = $("#aoi-warn");
    if (note) note.remove();
    if (feats.length > cap) {
      var p = el("p", "hint", t("ws.aoi.outlinesCapped", { n: fmt(cap, 0), total: fmt(feats.length, 0) }));
      p.id = "aoi-warn";
      $("#map").closest(".ws-map").appendChild(p);
    }
    if (!mapInitFit) { fitAoi(); mapInitFit = true; }
    renderLegend();
  }
  var mapInitFit = false;
  function onWorkspaceEnter() {
    initMap();
    setTimeout(function () { map.invalidateSize(); }, 60);
    if (state.aoi && !mapInitFit) { fitAoi(); mapInitFit = true; }
  }

  function renderLegend() {
    var lg = $("#legend"); lg.innerHTML = "";
    if (!state.results) {
      var note = el("span", "fineprint", t("ws.map.outline"));
      lg.appendChild(note);
      return;
    }
    var items = state.results.classes;
    items.forEach(function (c) {
      var it = el("span", "legend-item");
      it.appendChild(el("span", "swatch"));
      it.lastChild.style.background = c.color;
      it.appendChild(el("span", null, c.name));
      if (c.percent != null) it.appendChild(el("small", null, fmt(c.percent, 1) + "%"));
      lg.appendChild(it);
    });
  }

  // ---------------------------------------------------------------- AOI: shapefile upload
  function setAoi(aoi) {
    state.aoi = aoi;
    state.results = null;
    if (overlayLayer) { map.removeLayer(overlayLayer); overlayLayer = null; }
    drawAoi();
    renderAoiSummary();
    renderSamples(); // refresh: sample markers sit on top of the AOI
    renderResults();
  }
  function clearAoi() {
    state.aoi = null; state.results = null;
    aoiLayer.clearLayers(); drawLayer.clearLayers();
    if (overlayLayer) { map.removeLayer(overlayLayer); overlayLayer = null; }
    mapInitFit = false;
    renderAoiSummary(); renderResults(); renderLegend();
  }

  function shpBufferInfo(res) {
    // re-parse with an explicit encoding, using the buffers kept on the result
    return res.buffers;
  }

  async function loadShapefileFiles(fileList, encoding) {
    var files = Array.prototype.slice.call(fileList);
    var valid = files.filter(function (f) { return /\.(shp|shx|dbf|prj|cpg|zip)$/i.test(f.name); });
    if (!valid.length) throw G.fail("SHP_MISSING");
    var res = await G.loadShapefiles(valid, { encoding: encoding || "auto" });
    return res;
  }

  function describeShp(res) {
    var parcels = [];
    var feats = res.featureCollection.features;
    var nameField = res.nameField;
    feats.forEach(function (f, i) {
      var g = f.geometry;
      if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) {
        var name = nameField && f.properties && f.properties[nameField] != null ? String(f.properties[nameField]) : "";
        parcels.push({ name: name || ("#" + (i + 1)), areaM2: G.geometryAreaM2(g), properties: f.properties });
      }
    });
    var total = 0; parcels.forEach(function (p) { total += p.areaM2; });
    var crsLabel = res.crs && res.crs.name ? res.crs.name : t("ws.aoi.crsLatLon");
    var aoi = {
      kind: "shp",
      name: res.layerName,
      fc: res.featureCollection,
      areaM2: total,
      parcels: parcels,
      crsLabel: crsLabel,
      encoding: res.encodingUsed || null,
      warnings: (res.warnings || []).slice(),
      nFeatures: res.nFeatures,
      geometryTypes: res.geometryTypes,
      nameField: nameField,
      attributes: res.dbf ? res.dbf.fields : null,
      attrRows: res.dbf ? res.dbf.records : null
    };
    if (!parcels.length) throw G.fail("NO_POLYGONS");
    return aoi;
  }

  function initUploadTab() {
    var input = $("#shp-input"), drop = $("#shp-drop");
    var encSel = $("#encoding-select");
    G.ENCODINGS.forEach(function (e) {
      var o = el("option", null, e[1]); o.value = e[0]; encSel.appendChild(o);
    });
    encSel.addEventListener("change", function () { reparseEncoding(); });

    async function handleFiles(fileList) {
      var enc = encSel.value === "auto" ? "auto" : encSel.value;
      try {
        toast(t("ws.upload.processing"));
        var res = await loadShapefileFiles(fileList, enc);
        var aoi = describeShp(res);
        aoi.buffers = res.buffers;
        aoi.otherLayers = res.otherLayers || [];
        setAoi(aoi);
        toast(t("ws.upload.applied"));
        showFileList(fileList);
        if (aoi.warnings && aoi.warnings.length) toast(warnText(aoi), false);
      } catch (err) {
        toast(errorText(err), true);
      }
    }
    function showFileList(fileList) {
      var box = $("#shp-files"); box.innerHTML = ""; box.hidden = false;
      Array.prototype.slice.call(fileList).forEach(function (f) {
        var pill = el("div", "file-pill");
        pill.appendChild(el("span", null, f.name));
        box.appendChild(pill);
      });
    }
    input.addEventListener("change", function () { if (input.files.length) handleFiles(input.files); input.value = ""; });
    ["dragover", "dragenter"].forEach(function (evname) { drop.addEventListener(evname, function (ev) { ev.preventDefault(); drop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (evname) { drop.addEventListener(evname, function (ev) { ev.preventDefault(); drop.classList.remove("is-over"); }); });
    drop.addEventListener("drop", function (ev) {
      if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) handleFiles(ev.dataTransfer.files);
    });

    async function reparseEncoding() {
      // re-read the same buffers under the newly chosen encoding
      if (!state.aoi || state.aoi.kind !== "shp" || !state.aoi.buffers) return;
      var enc = encSel.value === "auto" ? "auto" : encSel.value;
      try {
        var res = G.parseShapefileSet(state.aoi.buffers, { encoding: enc, layerName: state.aoi.name });
        res.buffers = state.aoi.buffers;
        var aoi = describeShp(res);
        aoi.buffers = state.aoi.buffers;
        setAoi(aoi);
        toast(t("ws.upload.applied"));
      } catch (err) { toast(errorText(err), true); }
    }
  }
  function warnText(aoi) {
    var parts = (aoi.warnings || []).map(function (w) { return t("warns." + w); });
    if (aoi.otherLayers && aoi.otherLayers.length) parts.push(t("warns.otherLayers", { names: aoi.otherLayers.join(", ") }));
    return parts.join(" · ");
  }
  function errorText(err) {
    var code = err && err.code ? err.code : null;
    if (code && /^BACKEND_/.test(code) && code !== "BACKEND_BAD") code = "BACKEND";
    var msg = code ? t("errors." + code) : null;
    var out = msg && msg !== ("errors." + code) ? msg : null;
    if (!out && err && err.message && /^BACKEND_/.test(err.code || "")) out = t("errors.BACKEND");
    return out || (err && err.message) || t("common.error");
  }

  // ---------------------------------------------------------------- AOI: sample / draw / circle / bbox
  function loadSampleAoi() {
    var ring = D.BOURJ.ring.map(function (p) { return [p[0], p[1]]; });
    var fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
    var aoi = {
      kind: "sample",
      name: D.BOURJ.nameAr + " — " + D.BOURJ.name,
      fc: fc,
      areaM2: D.BOURJ.areaM2,
      parcels: [{ name: D.BOURJ.name, areaM2: D.BOURJ.areaM2, properties: {} }],
      crsLabel: "WGS84",
      warnings: []
    };
    setAoi(aoi);
    toast(t("ws.upload.applied"));
  }

  function startDrawing(mode) {
    state.drawing = { mode: mode, points: [] };
    drawLayer.clearLayers();
    var wrap = $("#map");
    wrap.classList.add("crosshair");
    updateDrawState();
  }
  function endDrawing(commit) {
    var d = state.drawing;
    state.drawing = null;
    $("#map").classList.remove("crosshair");
    updateDrawState();
    if (!d) return;
    if (commit && d.points.length >= 3) {
      var ring = d.points.map(function (p) { return [p[1], p[0]]; }); // [lat,lng] → [lon,lat]
      if (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
      ring.push(ring[0].slice());
      var fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
      var area = G.geometryAreaM2(fc.features[0].geometry);
      setAoi({ kind: "draw", name: t("ws.aoi.kinds.draw"), fc: fc, areaM2: area, parcels: [{ name: t("ws.aoi.kinds.draw"), areaM2: area, properties: {} }], crsLabel: "WGS84", warnings: [] });
    } else drawLayer.clearLayers();
  }
  function updateDrawState() {
    var node = $("#draw-state"); if (!node) return;
    if (!state.drawing) { node.textContent = ""; return; }
    if (state.drawing.mode === "rect") node.textContent = t("ws.draw.hint");
    else node.textContent = state.drawing.points.length
      ? t("ws.draw.first")
      : t("ws.draw.hint");
  }

  function onMapClick(ev) {
    if (state.picking) { addSamplePoint(ev.latlng); return; }
    if (!state.drawing) return;
    var d = state.drawing;
    if (d.mode === "poly") {
      d.points.push([ev.latlng.lat, ev.latlng.lng]);
      L.circleMarker(ev.latlng, { radius: 5, color: "#151515", fillColor: "#c6f24e", fillOpacity: 1 }).addTo(drawLayer);
      if (d.points.length >= 2) {
        var pts = d.points.slice();
        if (d._line) drawLayer.removeLayer(d._line);
        d._line = L.polyline(pts.map(function (p) { return [p[0], p[1]]; }), { color: "#151515", weight: 2, dashArray: "6 6" }).addTo(drawLayer);
      }
      if (d.points.length >= 3) {
        var first = d.points[0];
        if (Math.abs(ev.latlng.lat - first[0]) < 1e-9 && Math.abs(ev.latlng.lng - first[1]) < 1e-9) { endDrawing(true); return; }
      }
      updateDrawState();
    } else if (d.mode === "rect") {
      if (!d.points.length) {
        d.points.push([ev.latlng.lat, ev.latlng.lng]);
        L.circleMarker(ev.latlng, { radius: 5, color: "#151515", fillColor: "#c6f24e", fillOpacity: 1 }).addTo(drawLayer);
      } else {
        var a = d.points[0], b = [ev.latlng.lat, ev.latlng.lng];
        var ring = [[a[1], a[0]], [b[1], a[0]], [b[1], b[0]], [a[1], b[0]], [a[1], a[0]]];
        var fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
        var area = G.geometryAreaM2(fc.features[0].geometry);
        drawLayer.clearLayers();
        setAoi({ kind: "draw", name: t("ws.aoi.kinds.draw"), fc: fc, areaM2: area, parcels: [{ name: t("ws.aoi.kinds.draw"), areaM2: area, properties: {} }], crsLabel: "WGS84", warnings: [] });
        state.drawing = null;
        $("#map").classList.remove("crosshair");
      }
    }
  }

  function circleRing(lon, lat, radiusKm, n) {
    n = n || 96;
    var ring = [], latR = lat * Math.PI / 180;
    var d = radiusKm * 1000, R = 6371000;
    for (var i = 0; i < n; i++) {
      var brg = 2 * Math.PI * i / n;
      var dY = d * Math.cos(brg), dX = d * Math.sin(brg);
      var lat2 = lat + dY / R * 180 / Math.PI;
      var lon2 = lon + dX / (R * Math.cos(latR)) * 180 / Math.PI;
      ring.push([lon2, lat2]);
    }
    ring.push(ring[0].slice());
    return ring;
  }

  function applyCircle() {
    var lon = parseFloat($("#circle-lon").value), lat = parseFloat($("#circle-lat").value), r = parseFloat($("#circle-radius").value);
    if (!isFinite(lon) || !isFinite(lat) || !isFinite(r) || lon < -180 || lon > 180 || lat < -90 || lat > 90) { toast(t("ws.invalidCoords"), true); return; }
    if (r <= 0 || r > 500) { toast(t("ws.invalidRadius"), true); return; }
    var ring = circleRing(lon, lat, r);
    var fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
    var area = G.geometryAreaM2(fc.features[0].geometry);
    setAoi({ kind: "circle", name: t("ws.aoi.kinds.circle"), fc: fc, areaM2: area, parcels: [{ name: t("ws.aoi.kinds.circle"), areaM2: area, properties: {} }], crsLabel: "WGS84", warnings: [] });
  }
  function applyBbox() {
    var mnLon = parseFloat($("#bb-minlon").value), mnLat = parseFloat($("#bb-minlat").value);
    var mxLon = parseFloat($("#bb-maxlon").value), mxLat = parseFloat($("#bb-maxlat").value);
    var nums = [mnLon, mnLat, mxLon, mxLat];
    if (nums.some(function (v) { return !isFinite(v); }) || mnLon >= mxLon || mnLat >= mxLat || mnLon < -180 || mxLon > 180 || mnLat < -90 || mxLat > 90) { toast(t("ws.invalidCoords"), true); return; }
    var ring = [[mnLon, mnLat], [mxLon, mnLat], [mxLon, mxLat], [mnLon, mxLat], [mnLon, mnLat]];
    var fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
    var area = G.geometryAreaM2(fc.features[0].geometry);
    setAoi({ kind: "bbox", name: t("ws.aoi.kinds.bbox"), fc: fc, areaM2: area, parcels: [{ name: t("ws.aoi.kinds.bbox"), areaM2: area, properties: {} }], crsLabel: "WGS84", warnings: [] });
  }

  function renderAoiSummary() {
    var box = $("#aoi-summary");
    if (!state.aoi) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false; box.innerHTML = "";
    var km2 = G.m2ToKm2(state.aoi.areaM2);
    var big = el("div", "area-big num", feddan(state.aoi.areaM2) + " ");
    big.appendChild(el("small", null, t("units.feddan")));
    box.appendChild(big);
    box.appendChild(el("div", "area-sub num", t("ws.aoi.total", { feddan: feddan(state.aoi.areaM2), km2: fmt(km2, 2) })));
    var kv = el("dl", "kv");
    function row(k, v) { var dt = el("dt", null, k); var dd = el("dd", null, v); kv.appendChild(dt); kv.appendChild(dd); }
    row(t("ws.upload.layer"), state.aoi.name || "—");
    row(t("ws.upload.crs"), state.aoi.crsLabel || "WGS84");
    if (state.aoi.parcels && state.aoi.parcels.length > 1) row(t("ws.upload.parcels"), t("ws.aoi.perParcel", { n: fmt(state.aoi.parcels.length, 0) }));
    if (state.aoi.nFeatures) row(t("ws.upload.features"), t("ws.upload.features", { n: fmt(state.aoi.nFeatures, 0) }));
    box.appendChild(kv);
    if (state.aoi.warnings && state.aoi.warnings.length) {
      var ul = el("ul", "warn-list");
      state.aoi.warnings.forEach(function (w) { ul.appendChild(el("li", null, t("warns." + w))); });
      box.appendChild(ul);
    }
    var clearBtn = el("button", "btn btn-danger btn-sm", t("ws.aoi.clear"));
    clearBtn.type = "button";
    clearBtn.addEventListener("click", clearAoi);
    box.appendChild(clearBtn);
  }

  // ---------------------------------------------------------------- season / algorithm / params UI
  function renderWorkspaceChrome() {
    // season tabs
    $$("#season-tabs .tab").forEach(function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-season") === state.season);
    });
    var yearSel = $("#year-select");
    if (!yearSel.options.length) {
      I.YEARS.forEach(function (y) { var o = el("option", null, String(y)); o.value = String(y); yearSel.appendChild(o); });
      yearSel.addEventListener("change", function () { state.year = parseInt(yearSel.value, 10); updateSeasonInfo(); savePrefs(); });
    }
    yearSel.value = String(state.year);

    // algorithm select
    var algoSel = $("#algorithm-select");
    algoSel.innerHTML = "";
    I.ALGORITHMS.forEach(function (a) {
      var o = el("option", null, t("algo.names." + a.key));
      o.value = a.key; algoSel.appendChild(o);
    });
    algoSel.value = state.algorithm;
    algoSel.onchange = function () { state.algorithm = algoSel.value; renderParams(); updateSamplesUI(); savePrefs(); };

    renderParams();
    updateSeasonInfo();
    renderAoiSummary();
    renderSamples();
    updateSamplesUI();
    renderResults();
  }

  function updateSeasonInfo() {
    var per = I.period(state.season, state.year);
    $("#season-period").textContent = t("ws.season.period", { from: per.dateFrom, to: per.dateTo });
    var act = I.activeClasses(state.season);
    var names = act.map(function (c) { return state.lang === "ar" ? c.ar : c.en; });
    $("#season-competing").textContent = t("ws.season.competing", { classes: names.join(" · ") });
  }

  function renderParams() {
    var box = $("#param-controls"); box.innerHTML = "";
    var algo = I.algorithmByKey(state.algorithm);
    var defs = I.defaults();
    algo.params.forEach(function (pk) {
      var p = I.PARAMS[pk];
      var row = el("div", "param-row");
      var lab = el("label", null, t("ws.algorithm." + pk));
      lab.className = "field-hint";
      var wrap = el("div");
      var range = el("input"); range.type = "range";
      range.min = String(p.min); range.max = String(p.max); range.step = String(p.step);
      range.value = String(state.params[pk] != null ? state.params[pk] : p.def);
      var out = el("output", "num", range.value);
      range.addEventListener("input", function () { out.textContent = range.value; state.params[pk] = parseFloat(range.value); savePrefs(); });
      lab.appendChild(range);
      lab.appendChild(out);
      row.appendChild(lab); row.appendChild(out);
      wrap.appendChild(row);
      box.appendChild(wrap);
    });
    // cloud slider for every algorithm (scene filter)
    var p = I.PARAMS.cloudMax;
    var row = el("div", "param-row");
    var lab = el("label", null, t("ws.algorithm.cloud"));
    lab.className = "field-hint";
    var range = el("input"); range.type = "range";
    range.min = String(p.min); range.max = String(p.max); range.step = String(p.step);
    range.value = String(state.params.cloudMax != null ? state.params.cloudMax : p.def);
    var out = el("output", "num", range.value);
    range.addEventListener("input", function () { out.textContent = range.value; state.params.cloudMax = parseFloat(range.value); savePrefs(); });
    lab.appendChild(range); lab.appendChild(out);
    row.appendChild(lab); row.appendChild(out);
    box.appendChild(row);
  }

  // ---------------------------------------------------------------- samples
  function resolveClassId(raw) {
    var s = String(raw).trim();
    if (/^\d+$/.test(s)) { var n = parseInt(s, 10); var c = I.classById(n); return c ? c.id : null; }
    var up = s.toUpperCase();
    for (var i = 0; i < I.CLASSES.length; i++) if (I.CLASSES[i].code === up) return I.CLASSES[i].id;
    for (var j = 0; j < I.CLASSES.length; j++) {
      if (I.CLASSES[j].en.toLowerCase() === s.toLowerCase() || I.CLASSES[j].ar === s) return I.CLASSES[j].id;
    }
    return null;
  }

  function activeIds() { return I.activeClasses(state.season).map(function (c) { return c.id; }); }

  function addSamplePoint(latlng) {
    if (!state.picking) return;
    var classId = parseInt($("#sample-class").value, 10);
    var c = I.classById(classId);
    state.samples.push({ lon: latlng.lng, lat: latlng.lat, classId: classId });
    var mark = L.circleMarker(latlng, { radius: 6, color: "#151515", weight: 1.5, fillColor: c.color, fillOpacity: 1 });
    mark.bindTooltip(c.code + " · " + (state.lang === "ar" ? c.ar : c.en));
    mark.on("click", function (ev) {
      L.DomEvent.stopPropagation(ev);
      var idx = -1;
      for (var i = 0; i < state.samples.length; i++) if (state.samples[i]._marker === mark) { idx = i; break; }
      if (idx >= 0) { state.samples.splice(idx, 1); samplesLayer.removeLayer(mark); renderSamples(); }
    });
    state.samples[state.samples.length - 1]._marker = mark;
    mark.addTo(samplesLayer);
    renderSamples();
  }

  function renderSamples() {
    var list = $("#samples-list");
    var byClass = {};
    state.samples.forEach(function (s) { var k = s.classId; byClass[k] = (byClass[k] || 0) + 1; });
    var keys = Object.keys(byClass).map(Number).sort(function (a, b) { return b - a; });
    if (!keys.length) { list.hidden = true; list.innerHTML = ""; updateSamplesState(); return; }
    list.hidden = false; list.innerHTML = "";
    keys.forEach(function (id) {
      var c = I.classById(id);
      var li = el("li", null);
      li.appendChild(el("span", "swatch"));
      li.lastChild.style.background = c.color;
      li.appendChild(el("span", "name", (state.lang === "ar" ? c.ar : c.en) + " (" + c.code + ")"));
      li.appendChild(el("span", "n", String(byClass[id])));
      var rm = el("button", null);
      rm.type = "button";
      rm.title = t("ws.aoi.removePoint");
      rm.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
      rm.addEventListener("click", function () {
        state.samples = state.samples.filter(function (s) { return s.classId !== id; });
        refreshSampleMarkers();
        renderSamples();
      });
      li.appendChild(rm);
      list.appendChild(li);
    });
    updateSamplesState();
  }
  function refreshSampleMarkers() {
    samplesLayer.clearLayers();
    state.samples.forEach(function (s) {
      var c = I.classById(s.classId);
      var mark = L.circleMarker([s.lat, s.lon], { radius: 6, color: "#151515", weight: 1.5, fillColor: c.color, fillOpacity: 1 });
      s._marker = mark;
      mark.addTo(samplesLayer);
    });
  }
  function updateSamplesState() {
    var node = $("#samples-state"); if (!node) return;
    var algo = I.algorithmByKey(state.algorithm);
    if (algo.group !== "supervised") { node.textContent = t("ws.samples.unused"); return; }
    if (!state.samples.length) { node.textContent = t("ws.samples.none"); return; }
    var k = {}; state.samples.forEach(function (s) { k[s.classId] = 1; });
    var nCls = Object.keys(k).length;
    node.textContent = state.samples.length >= 20 && nCls >= 2
      ? t("ws.samples.ok", { n: fmt(state.samples.length, 0), k: fmt(nCls, 0) })
      : t("ws.samples.few", { n: fmt(state.samples.length, 0), k: fmt(nCls, 0) });
  }
  function updateSamplesUI() {
    var sel = $("#sample-class");
    sel.innerHTML = "";
    var act = I.activeClasses(state.season);
    act.forEach(function (c) {
      var o = el("option", null, (state.lang === "ar" ? c.ar : c.en) + " · " + c.code);
      o.value = String(c.id); sel.appendChild(o);
    });
    updateSamplesState();
  }
  function initSamples() {
    $("#sample-pick").addEventListener("click", function () {
      state.picking = !state.picking;
      var b = $("#sample-pick");
      b.classList.toggle("is-on", state.picking);
      b.textContent = state.picking ? t("ws.samples.stop") : t("ws.samples.pick");
      var hint = $("#samples-state");
      if (state.picking) {
        var c = I.classById(parseInt($("#sample-class").value, 10));
        hint.textContent = t("ws.samples.pickHint", { class: state.lang === "ar" ? c.ar : c.en });
      } else updateSamplesState();
    });
    $("#samples-clear").addEventListener("click", function () {
      state.samples = []; samplesLayer.clearLayers(); state.picking = false;
      var b = $("#sample-pick"); b.classList.remove("is-on"); b.textContent = t("ws.samples.pick");
      renderSamples();
    });
    var input = $("#samples-csv");
    input.addEventListener("change", function () {
      if (!input.files || !input.files.length) return;
      var file = input.files[0];
      file.text().then(function (text) {
        try {
          var res = G.parseSamplesCsv(text, resolveClassId);
          // keep only samples of classes active in the current season
          var act = activeIds();
          var kept = res.samples.filter(function (s) { return act.indexOf(s.classId) >= 0; });
          var skippedInactive = res.samples.length - kept.length;
          state.samples = state.samples.concat(kept);
          refreshSampleMarkers();
          renderSamples();
          toast(t("ws.samples.loaded", { n: fmt(kept.length, 0) }) + (res.skipped ? t("ws.samples.skipped", { n: fmt(res.skipped, 0) }) : "") + (skippedInactive ? " · " + t("ws.samples.inactive") + ": " + fmt(skippedInactive, 0) : ""));
        } catch (err) { toast(errorText(err), true); }
      });
      input.value = "";
    });
  }

  // ---------------------------------------------------------------- preview backend adapter
  // Swap this object for a request to your Earth Engine run endpoint; the workspace
  // and the results panel only speak this RunResult-shaped interface.
  var DVBackend = {
    mode: "preview",
    seedOf: function (input) {
      var s = input.algorithm + "|" + input.season + "|" + (input.year || "") + "|" + JSON.stringify(input.params || {}) + "|" + (input.samplePoints ? input.samplePoints.length : 0);
      var h = 0;
      for (var i = 0; i < s.length; i++) { h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; }
      return (h >>> 0) % 100000;
    },
    run: function (input) {
      var algo = I.algorithmByKey(input.algorithm);
      var per = I.period(input.season, input.year || I.DEFAULT_YEAR);
      var res;
      if (algo.key === "kmeans") {
        var k = input.params && input.params.kClusters != null ? input.params.kClusters : I.PARAMS.kClusters.def;
        res = G.buildClusterGrid(input.aoiGeo, k, this.seedOf(input));
        res.isKmeans = true;
        res.kClusters = k;
      } else {
        res = G.buildPreviewGrid(input.aoiGeo, I.CLASSES, input.season, this.seedOf(input));
      }
      var shares = G.previewShares(res);
      var gridArea = G.gridAreaM2(res);
      var exact = state.aoi.areaM2; // geodesic polygon area (the quantity a real run would report)
      var classes = shares.map(function (s) {
        var c = I.classById(s.classId);
        return {
          classId: s.classId, code: c.code, en: c.en, ar: c.ar, color: c.color,
          name: state.lang === "ar" ? c.ar : c.en,
          share: s.share, percent: s.share * 100,
          areaM2: s.share * exact,
          nameCluster: null
        };
      });
      if (res.isKmeans) {
        classes = classes.map(function (c) {
          return {
            classId: c.classId, code: null, name: t("ws.results.cluster", { n: c.classId }),
            color: clusterColor(c.classId), share: c.share, percent: c.percent, areaM2: c.areaM2
          };
        });
      }
      var samplesInfo = null;
      if (algo.group === "supervised") {
        samplesInfo = input.samplePoints && input.samplePoints.length >= 20 && distinctClasses(input.samplePoints) >= 2
          ? { source: "manual", n: input.samplePoints.length }
          : { source: "auto", n: null };
      }
      return {
        mode: "preview",
        algorithm: algo.key, algorithmName: t("algo.names." + algo.key),
        season: input.season, dateFrom: per.dateFrom, dateTo: per.dateTo,
        tileUrl: null,
        previewImage: G.gridToDataUrl(res, colorOf, 0.85),
        grid: res,
        oa: null, kappa: null,
        classes: classes,
        nImages: null, nTrain: null, nVal: null,
        sampleSource: samplesInfo ? samplesInfo.source : null,
        durationMs: 0,
        noteCodes: [res.isKmeans ? "kmeans_no_accuracy" : (algo.key === "signature" ? "instant_estimate" : null), "preview"].filter(Boolean),
        areaKm2: G.m2ToKm2(exact)
      };
    }
  };
  function distinctClasses(points) {
    var seen = {};
    points.forEach(function (p) { seen[p.classId] = 1; });
    return Object.keys(seen).length;
  }
  function colorOf(classId) {
    var c = I.classById(classId);
    return hexToRgb(c ? c.color : "#cccccc");
  }
  function clusterColor(n) {
    if (n <= 12) { var c = I.classById(n); return c.color; }
    var h = (n * 47) % 360;
    return "hsl(" + h + ", 70%, 55%)";
  }
  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  }

  // ---------------------------------------------------------------- live backend (optional)
  // When a real Earth Engine endpoint is deployed, point BACKEND_URL at it (a <script> before app.js
  // setting window.DV_BACKEND_URL, or the URL query ?backend=https://…/api/run). The endpoint receives
  // the engine's RunInput JSON (aoiGeo + algorithm + season + params + samplePoints) and must answer
  // with a RunResult-shaped JSON: { mode:"live", tileUrl, oa, kappa, classes:[{classId, code, en, ar,
  // color, areaKm2, percent}], dateFrom, dateTo, nImages, nTrain, nVal, sampleSource, durationMs }.
  // Class areas then come from Earth Engine itself (areaKm2 per class), not from the local grid.
  function backendUrl() {
    // runtime override wins: window.DV_BACKEND_URL = "https://…/api/run" (also ?backend=… on load)
    if (typeof window.DV_BACKEND_URL === "string" && window.DV_BACKEND_URL) return window.DV_BACKEND_URL;
    try {
      var q = new URLSearchParams(location.search).get("backend");
      if (q) return q;
    } catch (e) { /* older browsers */ }
    return null;
  }
  // settable at runtime (window.DV_BACKEND_URL = …) without reloading the page
  function isLive() { return !!backendUrl(); }
  function liveUrl() { return backendUrl(); }

  function runLive(input) {
    var body = JSON.parse(JSON.stringify(input)); // drop marker functions, if any
    return fetch(liveUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (tx) { throw { code: "BACKEND_" + res.status, message: tx.slice(0, 300) }; });
      return res.json();
    }).then(function (jr) {
      if (!jr || !jr.classes || !jr.tileUrl) throw { code: "BACKEND_BAD" };
      // normalise into the same shape the renderer speaks
      var classes = jr.classes.map(function (c) {
        var cls = I.classById(c.classId);
        return {
          classId: c.classId, code: c.code != null ? c.code : (cls ? cls.code : null),
          en: c.en != null ? c.en : (cls ? cls.en : ""), ar: c.ar != null ? c.ar : (cls ? cls.ar : ""),
          color: c.color || (cls ? cls.color : "#cccccc"),
          name: c.name != null ? c.name : (state.lang === "ar" ? (c.ar || (cls ? cls.ar : "")) : (c.en || (cls ? cls.en : ""))),
          share: c.percent != null ? c.percent / 100 : (c.areaKm2 != null && jr.areaKm2 ? c.areaKm2 / jr.areaKm2 : 0),
          percent: c.percent != null ? c.percent : (c.areaKm2 != null && jr.areaKm2 ? c.areaKm2 / jr.areaKm2 * 100 : 0),
          areaM2: c.areaKm2 != null ? c.areaKm2 * 1e6 : (c.areaFeddan != null ? c.areaFeddan * 4200 : 0)
        };
      });
      return {
        mode: "live",
        algorithm: input.algorithm, algorithmName: t("algo.names." + input.algorithm),
        season: input.season, dateFrom: jr.dateFrom || input.dateFrom, dateTo: jr.dateTo || input.dateTo,
        tileUrl: jr.tileUrl,
        previewImage: null, grid: null,
        oa: typeof jr.oa === "number" ? jr.oa : null,
        kappa: typeof jr.kappa === "number" ? jr.kappa : null,
        classes: classes,
        nImages: jr.nImages != null ? jr.nImages : null,
        nTrain: jr.nTrain != null ? jr.nTrain : null,
        nVal: jr.nVal != null ? jr.nVal : null,
        sampleSource: jr.sampleSource || null,
        durationMs: jr.durationMs || null,
        noteCodes: (jr.noteCodes || []).slice(),
        areaKm2: jr.areaKm2 != null ? jr.areaKm2 : G.m2ToKm2(state.aoi.areaM2)
      };
    });
  }

  // ---------------------------------------------------------------- run + results
  function runPreview(algorithmKey) {
    if (!state.aoi) { toast(t("ws.needAoi"), true); return; }
    var algo = I.algorithmByKey(algorithmKey || state.algorithm);
    var btn = $("#run-btn");
    var input = {
      kind: "run",
      algorithm: algo.key,
      season: state.season,
      year: state.year,
      cloudMax: state.params.cloudMax,
      params: pickParams(algo),
      samplePoints: state.samples.map(function (s) { return { classId: s.classId, lon: s.lon, lat: s.lat }; }),
      aoiGeo: state.aoi.fc,
      aoiName: state.aoi.name
    };
    btn.disabled = true; btn.textContent = t("ws.running");
    var done = function () { btn.disabled = false; btn.textContent = t("ws.run"); };
    var finish = function (res) {
      state.results = res;
      state.results.algorithm = algo.key;
      state.resultsParams = { params: pickParams(algo), cloudMax: state.params.cloudMax };
      showOverlay();
      renderResults();
      renderLegend();
      done();
    };
    if (isLive()) {
      runLive(input).then(finish, function (err) {
        toast(errorText(err), true);
        state.results = null;
        renderResults();
        done();
      });
    } else {
      setTimeout(function () {
        try { finish(DVBackend.run(input)); }
        catch (err) {
          toast(errorText(err), true);
          state.results = null;
          renderResults();
        } finally { done(); }
      }, 30);
    }
  }
  function pickParams(algo) {
    var out = {};
    algo.params.forEach(function (pk) { out[pk] = state.params[pk] != null ? state.params[pk] : I.PARAMS[pk].def; });
    return out;
  }

  function showOverlay() {
    if (overlayLayer) { map.removeLayer(overlayLayer); overlayLayer = null; }
    if (!state.results) return;
    if (state.results.tileUrl) {
      // live Earth Engine run: XYZ tile overlay under the AOI outline
      overlayLayer = L.tileLayer(state.results.tileUrl, { opacity: parseFloat($("#overlay-opacity").value), maxNativeZoom: 17, zIndex: 400 });
      overlayLayer.addTo(map);
      return;
    }
    if (!state.results.previewImage) return;
    var b = state.results.grid.bounds;
    overlayLayer = L.imageOverlay(state.results.previewImage, [[b[1], b[0]], [b[3], b[2]]], { opacity: parseFloat($("#overlay-opacity").value), interactive: false, zIndex: 400 });
    overlayLayer.addTo(map);
    overlayLayer.setZIndex && overlayLayer.setZIndex(400);
  }

  function renderResults() {
    var body = $("#results-body"), empty = $("#results-empty");
    if (!state.results) { body.hidden = true; empty.hidden = false; renderLegend(); return; }
    body.hidden = false; empty.hidden = true;

    var r = state.results;
    var algoName = t("algo.names." + r.algorithm);
    var seasonName = t("ws.season." + r.season);
    $("#results-run").textContent = t("ws.results.run", { algo: algoName, season: seasonName, period: r.dateFrom + " → " + r.dateTo });

    // stat cards
    var row = $("#stat-row"); row.innerHTML = "";
    var totalM2 = state.aoi.areaM2;
    var liveTotal = 0;
    if (r.mode === "live") r.classes.forEach(function (c) { liveTotal += c.areaM2 || 0; });
    statCard(row, feddan(r.mode === "live" && liveTotal > 0 ? liveTotal : totalM2) + " ", t("ws.results.total"), t("units.feddan"));
    statCard(row, fmt(G.m2ToKm2(r.mode === "live" && liveTotal > 0 ? liveTotal : totalM2)) + " ", t("units.km2"), "");
    statCard(row, fmt(state.aoi.parcels ? state.aoi.parcels.length : 0, 0) + " ", t("ws.results.parcels"), "");
    var acard = el("div", "stat-card");
    if (r.mode === "live" && typeof r.oa === "number" && typeof r.kappa === "number") {
      var b1 = el("b", "num", fmt(r.oa * 100, 1) + "% ");
      b1.appendChild(el("small", null, "OA"));
      acard.appendChild(b1);
      acard.appendChild(el("span", null, t("ws.results.oa") + " " + fmt(r.oa * 100, 1) + "% · " + t("ws.results.kappa") + " " + fmt(r.kappa, 3)));
    } else {
      acard.innerHTML = "<b>— <small>" + esc(t("ws.results.notComputed")) + "</small></b><span>" + esc(t("ws.results.oa")) + " · " + esc(t("ws.results.kappa")) + "</span>";
    }
    row.appendChild(acard);

    // class table
    var table = $("#class-table");
    table.innerHTML = "";
    var thead = el("thead");
    var trh = el("tr");
    var th1 = el("th", null, t("ws.results.class")); th1.className = "wrap";
    var th2 = el("th", null, t("units.feddan")); th2.className = "num";
    var th3 = el("th", null, secondUnitLabel()); th3.className = "num";
    var th4 = el("th", null, t("ws.results.percent")); th4.className = "num";
    trh.appendChild(th1); trh.appendChild(th2); trh.appendChild(th3); trh.appendChild(th4);
    thead.appendChild(trh); table.appendChild(thead);
    var tbody = el("tbody");
    r.classes.forEach(function (c) {
      var tr = el("tr");
      var td0 = el("td", "wrap");
      var cell = el("span", "cell-class");
      cell.appendChild(el("span", "swatch"));
      cell.lastChild.style.background = c.color;
      cell.appendChild(el("span", null, c.name));
      td0.appendChild(cell); tr.appendChild(td0);
      td(tr, feddan(c.areaM2), "num");
      td(tr, secondUnitValue(c.areaM2), "num");
      var tdp = td(tr, fmt(c.percent, 1) + "%", "num");
      tdp.appendChild(barEl(c.percent));
      tbody.appendChild(tr);
    });
    var tfoot = el("tfoot");
    var trf = el("tr");
    td(trf, t("ws.results.total"), "");
    td(trf, feddan(totalM2), "num");
    td(trf, secondUnitValue(totalM2), "num");
    td(trf, "100%", "num");
    tfoot.appendChild(trf);
    table.appendChild(tbody); table.appendChild(tfoot);

    // parcels table
    var pt = $("#parcels-table");
    pt.innerHTML = "";
    var parcels = state.aoi.parcels || [];
    var theadP = el("thead"), trP = el("tr");
    var thp1 = el("th", null, t("ws.results.parcel")); thp1.className = "wrap";
    var thp2 = el("th", null, t("units.feddan")); thp2.className = "num";
    var thp3 = el("th", null, secondUnitLabel()); thp3.className = "num";
    trP.appendChild(thp1); trP.appendChild(thp2); trP.appendChild(thp3);
    theadP.appendChild(trP); pt.appendChild(theadP);
    var tbodyP = el("tbody");
    var show = Math.min(parcels.length, 30);
    parcels.slice(0, show).forEach(function (p) {
      var tr = el("tr");
      var tdp = el("td", "wrap", p.name); tr.appendChild(tdp);
      td(tr, feddan(p.areaM2), "num");
      td(tr, secondUnitValue(p.areaM2), "num");
      tbodyP.appendChild(tr);
    });
    pt.appendChild(tbodyP);
    $("#parcels-csv-btn").hidden = parcels.length < 2;

    // donut
    renderDonut(r.classes);

    // signature chart (the engine's reference library for this season)
    var st = $("#signature-title"), sx = $("#signature-text");
    if (r.algorithm === "kmeans") {
      st.textContent = t("ws.results.clusters");
      sx.textContent = t("notes.kmeans_no_accuracy");
      $("#signature-chart").innerHTML = "";
    } else {
      st.textContent = t("ws.results.signatureTitle", { season: seasonName });
      sx.textContent = t("ws.results.signatureText");
      renderSignature(r.season);
    }
    updateReportHead();
  }
  function td(tr, text, cls) { var d = el("td", cls || "", text == null ? "—" : String(text)); tr.appendChild(d); return d; }
  function statCard(row, big, label, unit) {
    var c = el("div", "stat-card");
    var b = el("b", "num", big);
    if (unit) b.appendChild(el("small", null, unit));
    c.appendChild(b);
    c.appendChild(el("span", null, label));
    row.appendChild(c);
  }
  function barEl(percent) {
    var b = el("span", "bar");
    var i = el("i"); i.style.width = Math.max(2, Math.min(100, percent)) + "%";
    b.appendChild(i);
    return b;
  }
  function secondUnitLabel() { return t("units." + state.secondUnit); }
  function secondUnitValue(m2) {
    if (state.secondUnit === "km2") return fmt(G.m2ToKm2(m2));
    if (state.secondUnit === "ha") return fmt(m2 / 10000);
    return fmt(m2, 0);
  }

  // ---------------------------------------------------------------- donut
  function renderDonut(classes) {
    var box = $("#donut"); box.innerHTML = "";
    var size = 220, r = 78, cx = size / 2, cy = size / 2, lw = 26;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("role", "img");
    var acc = 0;
    var total = classes.reduce(function (a, c) { return a + c.share; }, 0);
    classes.forEach(function (c) {
      var frac = total > 0 ? c.share / total : 0;
      var a0 = acc * 2 * Math.PI - Math.PI / 2, a1 = (acc + frac) * 2 * Math.PI - Math.PI / 2;
      acc += frac;
      if (frac <= 0) return;
      var large = frac > 0.5 ? 1 : 0;
      var p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
      var p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M " + p0[0] + " " + p0[1] + " A " + r + " " + r + " 0 " + large + " 1 " + p1[0] + " " + p1[1]);
      path.setAttribute("stroke", c.color);
      path.setAttribute("stroke-width", String(lw));
      path.setAttribute("fill", "none");
      svg.appendChild(path);
    });
    var hole = document.createElementNS("http://www.w3.org/2000/svg", "text");
    hole.setAttribute("x", String(cx)); hole.setAttribute("y", String(cy - 6));
    hole.setAttribute("text-anchor", "middle");
    hole.setAttribute("style", "font:600 26px var(--font);fill:var(--ink)");
    hole.textContent = fmt(classes.length, 0);
    svg.appendChild(hole);
    var sub = document.createElementNS("http://www.w3.org/2000/svg", "text");
    sub.setAttribute("x", String(cx)); sub.setAttribute("y", String(cy + 18));
    sub.setAttribute("text-anchor", "middle");
    sub.setAttribute("style", "font:12px var(--font);fill:var(--muted)");
    sub.textContent = state.results && state.results.isKmeans ? t("ws.results.clusters") : t("ws.results.tableTitle");
    svg.appendChild(sub);
    box.appendChild(svg);
    var cap = el("figcaption", "donut-caption", t("ws.results.mode") + ": " + (state.results && state.results.mode === "live" ? t("ws.results.modeLive") : t("ws.results.modePreview")));
    box.appendChild(cap);
  }

  // ---------------------------------------------------------------- signature chart
  function renderSignature(season) {
    var box = $("#signature-chart"); box.innerHTML = "";
    var W = 640, H = 300, ML = 40, MB = 34, MT = 10, MR = 8;
    var classes = I.CLASSES.filter(function (c) {
      var act = I.activeClasses(season);
      for (var i = 0; i < act.length; i++) if (act[i].id === c.id) return true;
      return false;
    });
    if (!classes.length) return;
    var rows = classes.map(function (c) {
      var sig = D.SIGNATURES[season] ? D.SIGNATURES[season][c.id] : null;
      if (!sig) { // full year: the engine averages the winter and summer signatures
        var w = D.SIGNATURES.winter[c.id], s = D.SIGNATURES.summer[c.id];
        sig = w.map(function (v, i) { return (v + s[i]) / 2; });
      }
      return { c: c, mean: sig[0], p10: sig[1], p90: sig[2] };
    });
    var yMin = -0.2, yMax = 1.0;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var x = function (i) { return ML + i * (W - ML - MR) / Math.max(1, rows.length - 1); };
    var y = function (v) { return H - MB - (v - yMin) * (H - MB - MT) / (yMax - yMin); };
    // grid lines at -0.2, 0, 0.5, 1.0
    [-0.2, 0, 0.5, 1].forEach(function (v) {
      var ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", String(ML)); ln.setAttribute("x2", String(W - MR));
      ln.setAttribute("y1", String(y(v))); ln.setAttribute("y2", String(y(v)));
      ln.setAttribute("class", "sig-axis");
      if (v !== 0) ln.setAttribute("stroke-dasharray", "3 4");
      svg.appendChild(ln);
      var tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", String(ML - 6)); tx.setAttribute("y", String(y(v) + 4));
      tx.setAttribute("text-anchor", "end");
      tx.textContent = String(v);
      svg.appendChild(tx);
    });
    rows.forEach(function (r2, i) {
      if (r2.p10 != null && r2.p90 != null) {
        var band = document.createElementNS("http://www.w3.org/2000/svg", "line");
        band.setAttribute("x1", String(x(i))); band.setAttribute("x2", String(x(i)));
        band.setAttribute("y1", String(y(r2.p90))); band.setAttribute("y2", String(y(r2.p10)));
        band.setAttribute("stroke", r2.c.color); band.setAttribute("stroke-width", "10");
        band.setAttribute("stroke-linecap", "round");
        band.setAttribute("class", "sig-range");
        band.setAttribute("opacity", "0.55");
        svg.appendChild(band);
      }
      var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(x(i))); dot.setAttribute("cy", String(y(r2.mean)));
      dot.setAttribute("r", "5"); dot.setAttribute("fill", r2.c.color);
      dot.setAttribute("stroke", "#151515"); dot.setAttribute("stroke-width", "1.5");
      svg.appendChild(dot);
      var lb = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lb.setAttribute("x", String(x(i))); lb.setAttribute("y", String(H - 12));
      lb.setAttribute("text-anchor", "middle");
      lb.textContent = r2.c.code;
      svg.appendChild(lb);
    });
    box.appendChild(svg);
  }

  // ---------------------------------------------------------------- CSV exports
  function csvCell(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function downloadText(name, text, mime) {
    var blob = new Blob([text], { type: (mime || "text/csv") + ";charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  function stamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }
  function classesCsv() {
    var r = state.results;
    if (!r) return;
    var per = I.period(r.season, state.year);
    var head = ["class_id", "code", "class_en", "class_ar", "area_feddan", "area_km2", "share_percent"];
    var lines = [head.join(",")];
    r.classes.forEach(function (c) {
      lines.push([c.classId, c.code == null ? "" : c.code, c.en == null ? "" : c.en, c.ar == null ? "" : c.ar, feddan(c.areaM2), fmt(G.m2ToKm2(c.areaM2), 4), fmt(c.percent, 2)].map(csvCell).join(","));
    });
    lines.push(["", "", "", "", feddan(state.aoi.areaM2), fmt(G.m2ToKm2(state.aoi.areaM2), 4), "100"].map(csvCell).join(","));
    var meta = [
      ["algorithm", r.algorithm], ["season", r.season], ["period", per.dateFrom + ".." + per.dateTo],
      ["study_area", state.aoi.name || ""], ["mode", state.results && state.results.mode === "live" ? "live" : "preview"], ["exported", new Date().toISOString()]
    ].map(function (kv) { return csvCell("# " + kv[0] + ": " + kv[1]); });
    downloadText("delta_vision_" + r.algorithm + "_" + r.season + "_" + stamp() + ".csv", "\ufeff" + meta.concat(lines).join("\n"), "text/csv");
    toast(t("common.download"));
  }
  function parcelsCsv() {
    var parcels = state.aoi.parcels || [];
    if (!parcels.length) return;
    var lines = ["parcel,area_feddan,area_km2"].concat(parcels.map(function (p) {
      return [csvCell(p.name), feddan(p.areaM2), fmt(G.m2ToKm2(p.areaM2), 4)].join(",");
    }));
    downloadText("delta_vision_parcels_" + stamp() + ".csv", "\ufeff" + lines.join("\n"), "text/csv");
    toast(t("common.download"));
  }
  function templateCsv() {
    var lines = ["lon,lat,class"];
    var demo = [[29.81, 30.88, "WHT"], [29.83, 30.89, "WHT"], [29.86, 30.87, 4], [29.87, 30.90, "Rice"], [29.90, 30.88, 10]];
    lines = lines.concat(demo.map(function (r) { return r.join(","); }));
    lines.push("# " + t("ws.samples.csvHint"));
    downloadText("delta_vision_samples_template.csv", "\ufeff" + lines.join("\n"), "text/csv");
  }
  function updateReportHead() {
    var rh = $("#report-head"); if (!rh) return;
    rh.innerHTML = "";
    var h = el("h1", null, t("report.title"));
    rh.appendChild(h);
    var per = I.period(state.season, state.year);
    var dl = el("dl");
    function ddRow(k, v) { dl.appendChild(el("dt", null, k)); dl.appendChild(el("dd", null, v)); }
    ddRow(t("report.studyArea"), (state.aoi ? state.aoi.name : "—"));
    ddRow(t("report.period"), per.dateFrom + " → " + per.dateTo);
    ddRow(t("report.algorithm"), t("algo.names." + state.algorithm));
    ddRow(t("report.params"), paramsText());
    ddRow(t("report.generated"), new Date().toLocaleString(state.lang === "ar" ? "ar-EG" : "en-GB"));
    rh.appendChild(dl);
    rh.appendChild(el("p", null, t("report.disclaimer")));
  }
  function paramsText() {
    var algo = I.algorithmByKey(state.algorithm);
    var parts = algo.params.map(function (pk) { return t("ws.algorithm." + pk) + ": " + (state.params[pk] != null ? state.params[pk] : I.PARAMS[pk].def); });
    parts.push(t("ws.algorithm.cloud") + ": " + (state.params.cloudMax != null ? state.params.cloudMax : I.PARAMS.cloudMax.def));
    return parts.join(" · ") || t("algo.labels.fixed");
  }

  // ---------------------------------------------------------------- compare dialog
  function initCompare() {
    var dlg = $("#compare-dialog");
    if (!dlg.showModal) { dlg.hidden = true; return; }
    $("#compare-btn").addEventListener("click", function () {
      if (!state.aoi) { toast(t("ws.needAoi"), true); return; }
      renderCompareTable();
      dlg.showModal();
    });
    $("#compare-close").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (ev) { if (ev.target === dlg) dlg.close(); });
  }
  function renderCompareTable() {
    var table = $("#compare-table");
    table.innerHTML = "";
    var thead = el("thead"), tr = el("tr");
    [t("ws.compare.cols.algo"), t("ws.compare.cols.family"), t("ws.compare.cols.samples"), t("ws.compare.cols.accuracy"), t("ws.compare.cols.params"), t("ws.compare.cols.choose")].forEach(function (h) {
      var th = el("th", null, h); tr.appendChild(th);
    });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el("tbody");
    I.ALGORITHMS.forEach(function (a) {
      var tr = el("tr");
      var td0 = el("td", "wrap");
      var btn = el("button", null, t("algo.names." + a.key));
      btn.type = "button";
      btn.addEventListener("click", function () {
        $("#compare-dialog").close();
        state.algorithm = a.key;
        renderWorkspaceChrome();
        runPreview(a.key);
      });
      td0.appendChild(btn); tr.appendChild(td0);
      td(tr, t("algo.group." + a.group), "");
      td(tr, a.group === "supervised" ? t("algo.labels.yes") : t("algo.labels.no"), "wrap");
      td(tr, a.key === "kmeans" || a.key === "signature" ? t("algo.labels.none") : t("ws.results.notComputed"), "wrap");
      td(tr, a.params.length ? a.params.map(function (pk) { return t("ws.algorithm." + pk); }).join(" · ") : t("algo.labels.fixed"), "wrap");
      var tdc = el("td", "num", "↖");
      tdc.className = "icon-dir";
      tr.appendChild(tdc);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  // ---------------------------------------------------------------- algorithms page
  function renderAlgorithmPage() {
    var box = $("#algo-groups"); box.innerHTML = "";
    var groups = ["supervised", "unsupervised", "knowledge"];
    groups.forEach(function (g) {
      var sect = el("section", "algo-group");
      var head = el("div", "algo-group-head");
      head.appendChild(el("h2", null, t("algo.group." + g)));
      head.appendChild(el("p", null, t("algo.groupText." + g)));
      sect.appendChild(head);
      var grid = el("div", "algo-grid");
      I.ALGORITHMS.filter(function (a) { return a.group === g; }).forEach(function (a) {
        var card = el("article", "card algo-card reveal");
        var top = el("div", "algo-top");
        top.appendChild(el("span", "algo-code", a.key));
        card.appendChild(top);
        card.appendChild(el("h3", null, t("algo.names." + a.key)));
        card.appendChild(el("p", null, t("algo.text." + a.key)));
        var meta = el("dl", "meta");
        function row(k, v) { meta.appendChild(el("dt", null, k)); meta.appendChild(el("dd", null, v)); }
        row(t("algo.labels.needs"), a.group === "supervised" ? t("algo.labels.yes") : t("algo.labels.no"));
        row(t("algo.labels.accuracy"), a.key === "kmeans" || a.key === "signature" ? t("algo.labels.none") : t("algo.labels.measured"));
        row(t("algo.labels.params"), a.params.length ? a.params.map(function (pk) { return t("ws.algorithm." + pk); }).join(" · ") : t("algo.labels.fixed"));
        card.appendChild(meta);
        grid.appendChild(card);
      });
      sect.appendChild(grid);
      box.appendChild(sect);
    });
    var proto = $("#algo-protocol"); proto.innerHTML = "";
    t("algo.protocol.items").forEach(function (it) {
      var li = el("li", "reveal");
      li.appendChild(el("b", null, it.title));
      li.appendChild(el("p", null, it.text));
      proto.appendChild(li);
    });
  }

  // ---------------------------------------------------------------- upload page
  var uploadedShp = null, uploadedCsv = null;
  function renderUploadPage() {
    var box = $("#upload-summary");
    if (!uploadedShp && !uploadedCsv) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false; box.innerHTML = "";
    box.appendChild(el("h2", "card-title", t("upload.summaryTitle")));
    if (uploadedCsv) {
      var csvCard = el("div", "card");
      csvCard.appendChild(el("h3", null, t("upload.csvTitle")));
      csvCard.appendChild(el("p", "hint", t("ws.samples.loaded", { n: fmt(uploadedCsv.samples.length, 0) }) + (uploadedCsv.skipped ? t("ws.samples.skipped", { n: fmt(uploadedCsv.skipped, 0) }) : "")));
      box.appendChild(csvCard);
    }
    if (uploadedShp) {
      var shpCard = el("div", "card");
      shpCard.appendChild(el("h3", null, t("upload.shpTitle")));
      var kv = el("dl", "kv");
      function row(k, v) { kv.appendChild(el("dt", null, k)); kv.appendChild(el("dd", null, v)); }
      row(t("ws.upload.layer"), uploadedShp.name);
      row(t("ws.upload.features"), t("ws.upload.features", { n: fmt(uploadedShp.nFeatures, 0) }));
      row(t("ws.upload.geometry"), (uploadedShp.geometryTypes || []).join(", "));
      row(t("ws.upload.crs"), uploadedShp.crsLabel);
      row(t("ws.upload.area"), feddan(uploadedShp.areaM2) + " " + t("units.feddan"));
      shpCard.appendChild(kv);
      if (uploadedShp.attributes && uploadedShp.attrRows) {
        shpCard.appendChild(el("h3", null, t("upload.attributes")));
        var cap = el("p", "hint", t("upload.rows", { n: fmt(Math.min(uploadedShp.attrRows.length, 20), 0), total: fmt(uploadedShp.attrRows.length, 0) }));
        shpCard.appendChild(cap);
        var wrapEl = el("div", "attr-wrap table-wrap");
        var table = el("table", "dv-table");
        var thead = el("thead"), trh = el("tr");
        uploadedShp.attributes.forEach(function (f) { trh.appendChild(el("th", null, f.name)); });
        thead.appendChild(trh); table.appendChild(thead);
        var tbody = el("tbody");
        uploadedShp.attrRows.slice(0, 20).forEach(function (rec) {
          var tr = el("tr");
          uploadedShp.attributes.forEach(function (f) { var c = td(tr, rec[f.name] == null ? "" : String(rec[f.name]), "wrap"); });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrapEl.appendChild(table);
        shpCard.appendChild(wrapEl);
      }
      box.appendChild(shpCard);
    }
    box.appendChild(el("p", "fineprint", t("upload.kept")));
  }
  function initUploadPage() {
    var input = $("#up-shp-input"), drop = $("#up-shp-drop");
    async function handle(files) {
      try {
        var res = await loadShapefileFiles(files, "auto");
        var aoi = describeShp(res);
        aoi.buffers = res.buffers;
        uploadedShp = aoi;
        pendingAoi = aoi;
        renderUploadPage();
        toast(t("ws.upload.applied"));
      } catch (err) { toast(errorText(err), true); }
    }
    input.addEventListener("change", function () { if (input.files.length) handle(input.files); input.value = ""; });
    ["dragover", "dragenter"].forEach(function (n) { drop.addEventListener(n, function (ev) { ev.preventDefault(); drop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (n) { drop.addEventListener(n, function (ev) { ev.preventDefault(); drop.classList.remove("is-over"); }); });
    drop.addEventListener("drop", function (ev) { if (ev.dataTransfer && ev.dataTransfer.files.length) handle(ev.dataTransfer.files); });

    var csvInput = $("#up-csv-input"), csvDrop = $("#up-csv-drop");
    function handleCsv(file) {
      file.text().then(function (text) {
        try {
          var res = G.parseSamplesCsv(text, resolveClassId);
          uploadedCsv = res;
          pendingSamples = res.samples;
          renderUploadPage();
          toast(t("ws.samples.loaded", { n: fmt(res.samples.length, 0) }) + (res.skipped ? t("ws.samples.skipped", { n: fmt(res.skipped, 0) }) : ""));
        } catch (err) { toast(errorText(err), true); }
      });
    }
    csvInput.addEventListener("change", function () { if (csvInput.files.length) handleCsv(csvInput.files[0]); csvInput.value = ""; });
    ["dragover", "dragenter"].forEach(function (n) { csvDrop.addEventListener(n, function (ev) { ev.preventDefault(); csvDrop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (n) { csvDrop.addEventListener(n, function (ev) { ev.preventDefault(); csvDrop.classList.remove("is-over"); }); });
    csvDrop.addEventListener("drop", function (ev) { if (ev.dataTransfer && ev.dataTransfer.files.length) handleCsv(ev.dataTransfer.files[0]); });

    $("#csv-template-btn").addEventListener("click", templateCsv);
    $("#upload-open-btn").addEventListener("click", function () {
      if (pendingAoi) setAoi(pendingAoi);
      if (pendingSamples && pendingSamples.length) {
        state.samples = state.samples.concat(pendingSamples);
        refreshSampleMarkers();
      }
      pendingAoi = null; pendingSamples = null;
      location.hash = "#/workspace";
      initMap();
      setTimeout(function () { map.invalidateSize(); fitAoi(); }, 80);
    });
  }
  var pendingAoi = null, pendingSamples = null;

  // ---------------------------------------------------------------- guide page
  function renderGuidePage() {
    var steps = $("#guide-steps"); steps.innerHTML = "";
    t("guide.steps").forEach(function (s, i) {
      var d = el("div", "guide-step");
      var body = el("div");
      body.appendChild(el("h3", null, s.title));
      body.appendChild(el("p", null, s.text));
      d.appendChild(body);
      steps.appendChild(d);
    });
    var faq = $("#guide-faq"); faq.innerHTML = "";
    t("guide.faq").forEach(function (f) {
      var det = el("details", null);
      var sum = el("summary", null, f.q);
      det.appendChild(sum);
      det.appendChild(el("p", null, f.a));
      faq.appendChild(det);
    });
  }

  // ---------------------------------------------------------------- tabs + wiring
  function initTabs() {
    $("#aoi-tabs").addEventListener("click", function (ev) {
      var b = ev.target.closest(".tab"); if (!b) return;
      var name = b.getAttribute("data-tab");
      $$("#aoi-tabs .tab").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      $$("#card-aoi .tabpanel").forEach(function (p) { p.classList.toggle("is-on", p.id === "panel-" + name); });
    });
    $("#season-tabs").addEventListener("click", function (ev) {
      var b = ev.target.closest(".tab"); if (!b) return;
      state.season = b.getAttribute("data-season");
      $$("#season-tabs .tab").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      updateSeasonInfo();
      updateSamplesUI();
      renderSamples();
      savePrefs();
    });
  }

  // ---------------------------------------------------------------- boot
  function applyModeBadge() {
    var badge = $("#mode-badge");
    if (!badge) return;
    badge.classList.toggle("is-live", isLive());
    var label = badge.lastElementChild;
    if (label) {
      label.removeAttribute("data-i18n");
      label.textContent = isLive() ? t("ws.results.modeLive") : t("ws.previewBadge");
    }
  }

  function boot() {
    applyTranslations();
    applyModeBadge();
    renderNavAuth();
    renderHome();
    initAuthForms();
    initMap();
    initUploadTab();
    initSamples();
    initCompare();
    initUploadPage();
    initTabs();
    renderAlgorithmPage();
    renderGuidePage();
    renderWorkspaceChrome();
    // workspace buttons
    $("#sample-aoi-btn").addEventListener("click", loadSampleAoi);
    $("#draw-poly").addEventListener("click", function () { startDrawing("poly"); });
    $("#draw-rect").addEventListener("click", function () { startDrawing("rect"); });
    $("#draw-clear").addEventListener("click", function () { endDrawing(false); drawLayer.clearLayers(); });
    $("#circle-apply").addEventListener("click", applyCircle);
    $("#bb-apply").addEventListener("click", applyBbox);
    $("#run-btn").addEventListener("click", function () { runPreview(state.algorithm); });
    $("#csv-btn").addEventListener("click", classesCsv);
    $("#parcels-csv-btn").addEventListener("click", parcelsCsv);
    $("#print-btn").addEventListener("click", function () { updateReportHead(); window.print(); });
    $("#unit-second").addEventListener("change", function () { state.secondUnit = this.value; savePrefs(); renderResults(); });
    $("#unit-second").value = state.secondUnit;
    // menu + scroll
    $("#menu-btn").addEventListener("click", function () {
      var open = $("#nav-drawer").classList.toggle("is-open");
      $("#menu-btn").classList.toggle("is-open", open);
      $("#menu-btn").setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", function (ev) {
      var s = ev.target.closest("[data-scroll]");
      if (!s) return;
      var id = s.getAttribute("data-scroll");
      var target = document.getElementById(id === "workspace" ? "view-workspace" : id);
      if (id === "workspace" && !A.session()) { location.hash = "#/login"; return; }
      if (target) {
        if (target.classList.contains("view") && !target.classList.contains("is-on")) location.hash = "#/" + id.replace(/^view-/, "");
        else target.scrollIntoView({ behavior: "smooth" });
      }
    });
    window.addEventListener("scroll", function () {
      $("#nav").classList.toggle("is-scrolled", window.scrollY > 8);
    }, { passive: true });
    route();
    observeReveals();
    assignImages();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
