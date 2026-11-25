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
  var S = window.DVSrv;   // server adapter (deployed build); undefined in the pure-local single file
  var KEY_PREFS = "dv_prefs";

  // ---------------------------------------------------------------- state
  var state = {
    lang: I.lang(),
    scheme: I.DEFAULT_SCHEME,   // "general" = Level 1 land cover, "crops" = Level 2 crop type
    season: I.DEFAULT_SEASON,
    year: I.DEFAULT_YEAR,
    customFrom: null,           // custom date range (season === "custom")
    customTo: null,
    algorithm: I.DEFAULT_ALGORITHM,
    params: I.defaults(),
    aoi: null,        // { kind, name, fc, areaM2, parcels:[{name, areaM2}], crsLabel, warnings, encoding }
    samples: [],
    results: null,
    secondUnit: "km2",
    drawing: null,    // { mode:"poly"|"rect", points:[], first }
    picking: false,
    layers: { overlay: true, gt: false, aoi: true, ab: false },
    abSplit: 50,      // A/B wipe position (percent)
    gee: { checked: false, live: false, demoConfirmed: false, unsure: false, url: null }  // real Earth Engine backend on the server
  };
  // Indicative Egyptian agronomy per class code (tons/feddan, m³/feddan) —
  // PLANNING figures for the decision-support panel, labelled as indicative
  // in the UI; not measurements. Medicinal plants are too heterogeneous to
  // carry a figure and are omitted on purpose.
  var CROP_DSS = {
    WHT: { yieldTFed: 2.8, waterM3Fed: 1900 }, MZE: { yieldTFed: 3.2, waterM3Fed: 3100 },
    POT: { yieldTFed: 11, waterM3Fed: 3000 }, BET: { yieldTFed: 20, waterM3Fed: 3300 },
    VEG: { yieldTFed: 10, waterM3Fed: 3000 }, CIT: { yieldTFed: 10, waterM3Fed: 5500 },
    GRP: { yieldTFed: 8, waterM3Fed: 4500 }
  };
  try { var p = JSON.parse(localStorage.getItem(KEY_PREFS) || "{}"); if (p) { ["scheme","season","year","algorithm","secondUnit"].forEach(function (k) { if (p[k] != null) state[k] = p[k]; }); if (p.params) state.params = p.params; if (p.customFrom) state.customFrom = p.customFrom; if (p.customTo) state.customTo = p.customTo; } } catch (e) { /* ignore */ }
  if (state.season === "custom" && !(state.customFrom && state.customTo)) state.season = I.DEFAULT_SEASON;
  function savePrefs() {
    try { localStorage.setItem(KEY_PREFS, JSON.stringify({ scheme: state.scheme, season: state.season, year: state.year, algorithm: state.algorithm, params: state.params, secondUnit: state.secondUnit, customFrom: state.customFrom, customTo: state.customTo })); } catch (e) { /* ignore */ }
  }
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  // ---------------------------------------------------------------- scheme / period helpers
  /** the run's scheme: "general" (Level 1) or "crops" (Level 2) */
  function currentScheme() { return state.scheme === "crops" ? "crops" : "general"; }
  /** season family of the selected period (presets carry theirs; custom detects) */
  function currentFamily() { return I.seasonFamily(state.season, state.customFrom, state.customTo); }
  /** the period the engine resolves for the current selection */
  function currentPeriod() {
    if (state.season === "custom") return { dateFrom: state.customFrom, dateTo: state.customTo };
    return I.period(state.season, state.year);
  }
  /** classes of the current scheme that compete in the current season family */
  function currentActiveClasses() { return I.activeClasses(currentScheme(), currentFamily()); }
  function classById(id, scheme) { return I.classById(id, scheme == null ? currentScheme() : scheme); }
  /** manual sample points keep their own scheme's ids — resolve the class for
   *  display from either level (crop ids are valid at Level 2, 1–4 at Level 1) */
  function sampleClass(id) { return I.classById(id, currentScheme()) || I.classById(id, currentScheme() === "crops" ? "general" : "crops"); }
  /** class display name in the active language */
  function className(c) { return c ? (state.lang === "ar" ? c.ar : c.en) : ""; }
  /** map a crop-type class id to the current scheme (Level 1 rolls crops up) */
  function mapClassId(id) {
    if (currentScheme() !== "general") return id;
    var crops = I.classesOf("crops");
    for (var i = 0; i < crops.length; i++) if (crops[i].id === id) {
      // crop ids 1..8 are cropland (4); 9/10/11 map to bare/urban/water (3/2/1)
      if (id >= 9) return ({ 9: 3, 10: 2, 11: 1 })[id];
      return 4;
    }
    return id;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
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
      if (authSession()) next = "workspace";
    } else if (name === "workspace" || name === "upload") {
      if (!authSession()) { next = "login"; try { sessionStorage.setItem("dv_next", "#/" + h); } catch (e) { /* ignore */ } }
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
    $("#hero-feddan").textContent = feddan(G.geometryAreaM2({ type: "Polygon", coordinates: [D.BOURJ.ring] }));

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
    var sess = authSession();
    if (!sess) {
      var a1 = el("a", "btn btn-ghost", t("nav.login")); a1.href = "#/login"; box.appendChild(a1);
      var a2 = el("a", "btn btn-lime", t("nav.getStarted")); a2.href = "#/signup"; box.appendChild(a2);
    } else {
      var acc = el("div", "account");
      var btn = el("button", "account-btn");
      btn.id = "account-btn";
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
      out.addEventListener("click", function () { authLogout(); toast(t("common.toasts.loggedOut")); renderNavAuth(); route(); });
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
    observeReveals();   // re-rendered .reveal nodes are new elements — observe them again
    toast(state.lang === "ar" ? "تم التبديل إلى العربية" : "Switched to English");
  }

  // ---------------------------------------------------------------- async auth (server, with local fallback)
  // Wraps DVSrv so the rest of app.js keeps calling login/signup/demo/logout/session synchronously:
  // the forms disable their submit button while the promise settles.
  function authLogin(email, password) {
    if (!S) { var r = A.login(email, password); return Promise.resolve(r); }
    return S.login(email, password);
  }
  function authSignup(form) {
    if (!S) { var r = A.signup(form); return Promise.resolve(r); }
    return S.signup(form);
  }
  function authDemo() {
    if (!S) { A.ensureDemo(); var r = A.login(A.DEMO.email, A.DEMO.password); return Promise.resolve(r); }
    return S.demo();
  }
  function authLogout() {
    if (S) S.logout(); else A.logout();
  }
  function authSession() {
    return S ? S.session() : A.session();
  }
  function isServerAuth() { return !!(S && S.isServer && S.isServer()); }

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
      var submitBtn = lf.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      authLogin(email, password).then(function (res) {
        submitBtn.disabled = false;
        if (res.ok) { afterLogin(t("common.toasts.welcomed", { name: res.user.name || res.user.email })); }
        else if (res.error === "BAD_CREDENTIALS" || res.error === "STORAGE") { formError(lf, t("login.error." + res.error)); }
        else formError(lf, t("common.unknownError", { code: res.error || "?" }));
      });
    });
    $("#demo-btn").addEventListener("click", function () {
      var btn = $("#demo-btn"); btn.disabled = true;
      authDemo().then(function (res) {
        btn.disabled = false;
        if (res.ok) afterLogin(t("common.toasts.welcomed", { name: res.user.name }));
        else toast(t("common.error"), true);
      });
    });

    var sf = $("#signup-form");
    sf.addEventListener("submit", function (ev) {
      ev.preventDefault(); clearErrors(sf);
      var name = $("#su-name").value.trim(), org = $("#su-org").value.trim();
      var email = $("#su-email").value.trim(), password = $("#su-password").value, confirm = $("#su-confirm").value;
      var submitBtn = sf.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      authSignup({ name: name, email: email, password: password, org: org, confirm: confirm }).then(function (res) {
        submitBtn.disabled = false;
        if (res.ok) {
          if (res.session) afterLogin(t("common.toasts.signedUp", { name: res.user.name }));
          else {
            // offline fallback path: open the local session synchronously
            A.login(email, password);
            afterLogin(t("common.toasts.signedUp", { name: res.user.name }));
          }
        }
        else if (res.errors) {
          Object.keys(res.errors).forEach(function (k) { fieldError(sf, k, t("signup.error." + k)); });
          if (res.error === "STORAGE" || res.error === "EMAIL_TAKEN") formError(sf, t("signup.error." + res.error));
        } else if (res.error) { formError(sf, t("signup.error." + res.error) !== "signup.error." + res.error ? t("signup.error." + res.error) : t("common.unknownError", { code: res.error })); }
      });
    });
  }
  /** pull the user's recent live runs into the client cache (and the compare
   *  table) — switching to an already-computed combination is instant even
   *  right after login. Bounded: last 6 live runs, small AOIs only. */
  var runCacheHydrated = false;
  function hydrateRunCache() {
    if (runCacheHydrated || !S || !S.isServer()) return;
    runCacheHydrated = true;
    S.listRuns().then(function (r) {
      if (!r || !r.ok || !r.runs) return;
      var live = r.runs.filter(function (x) { return x.mode === "live"; }).slice(0, 6);
      live.forEach(function (meta) {
        S.getRun(meta.id).then(function (run) {
          if (!run || !run.results || !run.results.tileUrl) return;
          try {
            var geo = JSON.stringify(run.aoiGeo || {});
            if (geo.length > 60000) return;   // skip huge shapefile AOIs
            var input = {
              scheme: run.scheme, algorithm: run.algorithm, season: run.season, year: run.year,
              dateFrom: run.results.dateFrom, dateTo: run.results.dateTo,
              params: run.params || {}, cloudMax: null,
              samplePoints: run.samplePoints || [], aoiGeo: run.aoiGeo,
            };
            var rr = run.results;
            var res = {
              mode: "live", algorithm: run.algorithm, scheme: run.scheme || "general",
              family: rr.family || null, activeClassIds: rr.activeClassIds || null,
              excludedClassIds: rr.excludedClassIds || [], season: rr.season,
              dateFrom: rr.dateFrom, dateTo: rr.dateTo, tileUrl: rr.tileUrl, previewImage: null,
              oa: rr.oa, kappa: rr.kappa, classes: rr.classes || [], confusion: rr.confusion || null,
              nValPoints: rr.nValPoints, nImages: rr.nImages, nTrain: rr.nTrain, nVal: rr.nVal,
              sampleSource: rr.sampleSource, durationMs: rr.durationMs, noteCodes: rr.noteCodes || [],
              downloadUrl: rr.downloadUrl, downloadScaleM: rr.downloadScaleM, areaKm2: rr.areaKm2,
            };
            // fill in the class display fields the snapshot keeps
            res.classes = (res.classes || []).map(function (c) {
              var cls = classById(c.classId, run.scheme || "general");
              return Object.assign({ name: cls ? className(cls) : String(c.classId) }, c);
            });
            runCache.set(runCacheKey(input), res);
            recordCompare(res);
          } catch (e) { /* one bad row never breaks hydration */ }
        }, function () { /* best-effort */ });
      });
    }, function () { /* offline: skip */ });
  }

  function afterLogin(msg) {
    toast(msg);
    hydrateRunCache();
    renderNavAuth();
    var next = "#/workspace";
    try { next = sessionStorage.getItem("dv_next") || next; sessionStorage.removeItem("dv_next"); } catch (e) { /* ignore */ }
    location.hash = next;
  }

  // ---------------------------------------------------------------- the map
  var map = null, aoiLayer = null, samplesLayer = null, overlayLayer = null, drawLayer = null, sceneLayer = null, sceneActive = null;
  var gtLayer = null, basemaps = null, activeBasemap = "satellite", hybridLabels = null, abOn = false;
  /* Earth Engine dynamic-map overlays: tiles are natively rendered to ~z13–14
   * (Sentinel-2 10 m); beyond that EE throttles/drops requests and Leaflet
   * would discard the loaded imagery. maxNativeZoom keeps z13 tiles on screen
   * while zooming to 19 (upscaled), keepBuffer holds a wide ring around the
   * viewport, updateWhenIdle batches requests, and failed tiles retry twice
   * with a backoff instead of vanishing. */
  function geeTileOpts(extra) {
    return Object.assign({
      maxNativeZoom: 13, maxZoom: 19, keepBuffer: 6,
      updateWhenIdle: true, updateWhenZooming: false,
    }, extra || {});
  }
  function attachTileRetry(layer) {
    layer.on("tileerror", function (ev) {
      var tile = ev.tile;
      if (!tile) return;
      var tries = +(tile.getAttribute("data-retries") || 0);
      if (tries >= 2) return;                       // up to 2 retries, then give up
      tile.setAttribute("data-retries", String(tries + 1));
      setTimeout(function () {
        var src = tile.src;                         // same URL (throttle/timeout retry)
        tile.src = "";
        tile.src = src;
      }, tries === 0 ? 600 : 1800);
    });
  }
  function initMap() {
    if (map) return;
    var Esri_WorldImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" });
    var OSM = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" });
    var CartoDark = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 20, subdomains: "abcd", attribution: "&copy; OpenStreetMap contributors &copy; CARTO" });
    hybridLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, pane: "shadowPane" });
    basemaps = { satellite: Esri_WorldImagery, streets: OSM, dark: CartoDark, hybrid: Esri_WorldImagery, none: null };
    map = L.map("map", { center: [30.9, 29.85], zoom: 8, zoomControl: true, worldCopyJump: true, fullscreenControl: false });
    if (basemaps[activeBasemap]) basemaps[activeBasemap].addTo(map);
    else $("#map").classList.add("map-blank");   // blank basemap: classified layer only
    aoiLayer = L.layerGroup().addTo(map);
    samplesLayer = L.layerGroup().addTo(map);
    drawLayer = L.layerGroup().addTo(map);
    gtLayer = L.layerGroup();          // ground-truth reference points — toggled
    map.on("click", onMapClick);
    map.on("mousemove", function (ev) {
      // circle tool: live radius preview after the centre was placed
      if (state.drawing && state.drawing.mode === "circle" && state.drawing.center) {
        var c = state.drawing.center;
        var R = 6371000, latR = c[0] * Math.PI / 180;
        var dy = (ev.latlng.lat - c[0]) * Math.PI / 180 * R;
        var dx = (ev.latlng.lng - c[1]) * Math.PI / 180 * R * Math.cos(latR);
        var km = Math.sqrt(dy * dy + dx * dx) / 1000;
        if (state.drawing._preview) drawLayer.removeLayer(state.drawing._preview);
        state.drawing._preview = L.circle([c[0], c[1]], {
          radius: Math.max(50, Math.min(500000, km * 1000)),
          color: "#151515", weight: 2, dashArray: "6 6", fillOpacity: 0.04,
        }).addTo(drawLayer);
      }
      var box = $("#map-coords"); if (!box) return;
      box.hidden = false;
      box.textContent = ev.latlng.lat.toFixed(5) + ", " + ev.latlng.lng.toFixed(5);
    });
    map.on("mouseout", function () { var box = $("#map-coords"); if (box) box.hidden = true; });
    $$("#basemap-seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        activeBasemap = b.getAttribute("data-basemap");
        // remove only the base layers — the scene layer and the live EE overlay must survive
        map.eachLayer(function (l) {
          var isBase = Object.keys(basemaps).some(function (k) { return basemaps[k] === l; });
          if (isBase) map.removeLayer(l);
        });
        if (hybridLabels) map.removeLayer(hybridLabels);
        $("#map").classList.toggle("map-blank", activeBasemap === "none");
        if (basemaps[activeBasemap]) basemaps[activeBasemap].addTo(map);
        if (activeBasemap === "hybrid") hybridLabels.addTo(map);
        $$("#basemap-seg button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      });
    });
    $$("#scene-seg button").forEach(function (b) {
      b.addEventListener("click", function () { setSceneLayer(b.getAttribute("data-scene")); });
    });
    $("#overlay-opacity").addEventListener("input", function () {
      if (overlayLayer) overlayLayer.setOpacity(parseFloat(this.value));
    });
    $("#fit-btn").addEventListener("click", fitAoi);
    $("#fullscreen-btn").addEventListener("click", toggleFullscreen);
    $("#reset-aoi-btn").addEventListener("click", loadSampleAoi);
    // #geojson-input (the import) is now triggered from the AOI panel label
    $("#geojson-input").addEventListener("change", function () {
      if (!this.files || !this.files.length) return;
      var file = this.files[0];
      file.text().then(loadGeoJson, function () { toast(t("errors.BAD_GEOJSON"), true); });
      this.value = "";
    });
    $$("#layer-toggles button").forEach(function (b) {
      b.addEventListener("click", function () {
        var layer = b.getAttribute("data-layer");
        var on = layer in state.layers ? !state.layers[layer] : !b.classList.contains("is-on");
        setLayerToggle(layer, on);
      });
    });
    initAbSlider();
    map.on("keypress", function (ev) { if (ev.originalEvent.key === "Escape") endDrawing(false); });
  }
  function toggleFullscreen() {
    // fullscreen the WHOLE map card: the map fills 100% of the viewport and
    // the legend stays visible underneath (CSS .ws-map:fullscreen)
    var card = $("#view-workspace .ws-map") || $("#map-wrap") || $("#map").parentNode;
    if (!document.fullscreenElement) {
      (card.requestFullscreen || card.webkitRequestFullscreen || function () {}).call(card);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
    }
  }
  document.addEventListener("fullscreenchange", function () {
    setTimeout(function () { if (map) map.invalidateSize(); }, 120);
    setTimeout(function () { if (map) map.invalidateSize(); }, 450);
  });
  function setLayerToggle(layer, on) {
    state.layers[layer] = on;
    var btn = document.querySelector('#layer-toggles button[data-layer="' + layer + '"]');
    if (btn) btn.classList.toggle("is-on", !!on);
    if (layer === "overlay") {
      if (overlayLayer) { if (on) overlayLayer.addTo(map); else map.removeLayer(overlayLayer); }
    } else if (layer === "aoi") {
      if (aoiLayer) { if (on) aoiLayer.addTo(map); else map.removeLayer(aoiLayer); }
    } else if (layer === "gt") {
      if (on) { buildGroundTruthLayer(); gtLayer.addTo(map); } else map.removeLayer(gtLayer);
    } else if (layer === "ab") {
      setAbMode(on);
    }
  }
  /** the 360 built-in reference points, coloured by their class in the current scheme */
  function buildGroundTruthLayer() {
    gtLayer.clearLayers();
    var pts = (D.REFERENCE_POINTS && D.REFERENCE_POINTS.points) || [];
    var scheme = currentScheme();
    pts.forEach(function (p) {
      var id = scheme === "crops" ? p[0] : mapClassId(p[0]);
      var c = classById(id, scheme);
      if (!c) return;
      var mark = L.circleMarker([p[2], p[1]], { radius: 3.5, color: "#ffffff", weight: 0.8, fillColor: c.color, fillOpacity: 0.95 });
      mark.bindTooltip(className(c) + " (" + c.code + ")", { direction: "top" });
      gtLayer.addLayer(mark);
    });
  }
  // ---------------------------------------------------------------- A/B wipe slider
  function initAbSlider() {
    var slider = $("#ab-slider"), handle = $("#ab-handle");
    if (!slider || !handle) return;
    var dragging = false;
    function pos(ev) {
      var rect = slider.getBoundingClientRect();
      var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      var pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      state.abSplit = pct;
      applyAbSplit();
    }
    handle.addEventListener("mousedown", function (ev) { dragging = true; ev.preventDefault(); });
    slider.addEventListener("mousedown", function (ev) { dragging = true; pos(ev); });
    window.addEventListener("mousemove", function (ev) { if (dragging) pos(ev); });
    window.addEventListener("mouseup", function () { dragging = false; });
    handle.addEventListener("touchstart", function (ev) { dragging = true; pos(ev); }, { passive: true });
    window.addEventListener("touchmove", function (ev) { if (dragging) pos(ev); }, { passive: true });
    window.addEventListener("touchend", function () { dragging = false; });
    applyAbSplit();
  }
  function setAbMode(on) {
    abOn = !!on;
    var slider = $("#ab-slider");
    if (slider) slider.hidden = !abOn || !overlayLayer;
    applyAbSplit();
  }
  function applyAbSplit() {
    var slider = $("#ab-slider"), handle = $("#ab-handle");
    if (handle) {
      handle.style.left = state.abSplit + "%";
      handle.setAttribute("aria-valuenow", Math.round(state.abSplit));
    }
    if (slider) slider.setAttribute("data-ab", abOn ? "on" : "off");
    var el = abTargetElement();
    if (!el) return;
    if (abOn && overlayLayer) {
      var rtl = I.dir() === "rtl";
      var pct = rtl ? 100 - state.abSplit : state.abSplit;
      el.style.clipPath = "inset(0 0 0 " + pct + "%)";
      el.style.webkitClipPath = "inset(0 0 0 " + pct + "%)";
    } else {
      el.style.clipPath = "";
      el.style.webkitClipPath = "";
    }
  }
  function abTargetElement() {
    if (!overlayLayer) return null;
    if (overlayLayer.getContainer) { var c = overlayLayer.getContainer(); if (c) return c; }
    return overlayLayer._image || null;
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
    var lgWrap = el("div", "legend-items");
    items.forEach(function (c) {
      var it = el("button", "legend-item");
      it.type = "button";
      it.appendChild(el("span", "swatch"));
      it.lastChild.style.background = c.color;
      it.appendChild(el("span", null, c.name));
      if (c.percent != null) it.appendChild(el("small", "num", fmt(c.percent, 1) + "%"));
      it.addEventListener("click", function () {
        $$("#legend .legend-item").forEach(function (x) { x.classList.remove("is-sel"); });
        it.classList.add("is-sel");
        legendDetail(c);
      });
      lgWrap.appendChild(it);
    });
    lg.appendChild(lgWrap);
    var det = el("div", "legend-detail"); det.id = "legend-detail";
    lg.appendChild(det);
  }
  /** one-class detail strip under the legend (click a legend item) */
  function legendDetail(c) {
    var box = $("#legend-detail"); if (!box) return;
    box.innerHTML = "";
    box.hidden = false;
    box.appendChild(el("b", null, c.name));
    var parts = [];
    parts.push(t("units.feddan") + " " + feddan(c.areaM2));
    if (c.percent != null) parts.push(fmt(c.percent, 1) + "%");
    if (c.pa != null) parts.push("PA " + fmt(c.pa * 100, 1) + "%");
    if (c.ua != null) parts.push("UA " + fmt(c.ua * 100, 1) + "%");
    if (c.support) parts.push("n=" + fmt(c.support, 0));
    box.appendChild(el("span", "num", parts.join(" · ")));
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
    // the AOI's area is computed by the SAME geodesic formula as the engine
    // (595.735 km² = 141,841.6 feddan) — chip, table footer and report all
    // show one number
    var sampleArea = G.geometryAreaM2(fc.features[0].geometry);
    var aoi = {
      kind: "sample",
      name: D.BOURJ.nameAr + " — " + D.BOURJ.name,
      fc: fc,
      areaM2: sampleArea,
      parcels: [{ name: D.BOURJ.name, areaM2: sampleArea, properties: {} }],
      crsLabel: "WGS84",
      warnings: []
    };
    setAoi(aoi);
    toast(t("ws.upload.applied"));
  }

  /** Parse an uploaded GeoJSON file into an AOI (polygons / multipolygons). */
  function loadGeoJson(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw G.fail("BAD_GEOJSON"); }
    var fc = data && data.type === "FeatureCollection" ? data
      : data && (data.type === "Feature") ? { type: "FeatureCollection", features: [data] }
      : data && (data.type === "Polygon" || data.type === "MultiPolygon") ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: data }] }
      : null;
    if (!fc || !Array.isArray(fc.features) || !fc.features.length) throw G.fail("BAD_GEOJSON");
    var area = 0, parcels = [];
    fc.features.forEach(function (f, i) {
      var g = f.geometry;
      if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) {
        var a = G.geometryAreaM2(g);
        area += a;
        parcels.push({ name: (f.properties && (f.properties.name || f.properties.NAME)) || ("#" + (i + 1)), areaM2: a, properties: f.properties || {} });
      }
    });
    if (!parcels.length) throw G.fail("BAD_GEOJSON");
    setAoi({ kind: "geojson", name: t("ws.aoi.kinds.geojson"), fc: fc, areaM2: area, parcels: parcels, crsLabel: "WGS84", warnings: [] });
    toast(t("ws.upload.applied"));
  }

  function startDrawing(mode) {
    state.drawing = { mode: mode, points: [], center: null };
    drawLayer.clearLayers();
    var wrap = $("#map");
    wrap.classList.add("crosshair");
    syncDrawToolButtons();
    updateDrawState();
  }
  function endDrawingMode() {
    state.drawing = null;
    $("#map").classList.remove("crosshair");
    syncDrawToolButtons();
    updateDrawState();
  }
  /** highlight the toolbar draw button matching the active drawing mode */
  function syncDrawToolButtons() {
    $$("#draw-tools button").forEach(function (b) {
      b.classList.toggle("is-on", !!state.drawing && state.drawing.mode === b.getAttribute("data-draw"));
    });
  }
  function endDrawing(commit) {
    var d = state.drawing;
    state.drawing = null;
    $("#map").classList.remove("crosshair");
    syncDrawToolButtons();
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
    var mode = state.drawing.mode;
    if (mode === "circle") node.textContent = state.drawing.center
      ? t("ws.draw.circleEdge")
      : t("ws.draw.circleCenter");
    else if (mode === "triangle") node.textContent = state.drawing.points.length >= 2
      ? t("ws.draw.triangleClose")
      : t("ws.draw.triangleHint");
    else if (mode === "rect") node.textContent = t("ws.draw.hint");
    else node.textContent = state.drawing.points.length
      ? t("ws.draw.first")
      : t("ws.draw.hint");
  }

  function onMapClick(ev) {
    if (state.picking) { addSamplePoint(ev.latlng); return; }
    if (!state.drawing) {
      // live mode: clicking the map draws the NDVI time series at that point
      if (isLive()) ndviPointPopup(ev.latlng);
      return;
    }
    var d = state.drawing;
    if (d.mode === "triangle") {
      // three clicks: the third click closes the triangle automatically
      d.points.push([ev.latlng.lat, ev.latlng.lng]);
      L.circleMarker(ev.latlng, { radius: 5, color: "#151515", fillColor: "#c6f24e", fillOpacity: 1 }).addTo(drawLayer);
      if (d.points.length >= 2) {
        if (d._line) drawLayer.removeLayer(d._line);
        d._line = L.polyline(d.points.map(function (p) { return [p[0], p[1]]; }), { color: "#151515", weight: 2, dashArray: "6 6" }).addTo(drawLayer);
      }
      if (d.points.length >= 3) { endDrawing(true); }
      else updateDrawState();
    } else if (d.mode === "circle") {
      if (!d.center) {
        d.center = [ev.latlng.lat, ev.latlng.lng];
        L.circleMarker(ev.latlng, { radius: 5, color: "#151515", fillColor: "#c6f24e", fillOpacity: 1 }).addTo(drawLayer);
        updateDrawState();
      } else {
        // second click sets the radius from the centre
        var R = 6371000, latR = d.center[0] * Math.PI / 180;
        var dy = (ev.latlng.lat - d.center[0]) * Math.PI / 180 * R;
        var dx = (ev.latlng.lng - d.center[1]) * Math.PI / 180 * R * Math.cos(latR);
        var radiusKm = Math.sqrt(dy * dy + dx * dx) / 1000;
        if (radiusKm < 0.05) radiusKm = 0.05;
        if (radiusKm > 500) radiusKm = 500;
        commitCircle(d.center[1], d.center[0], radiusKm);
      }
    } else if (d.mode === "circle_preview") { /* handled by mousemove */ }
    else if (d.mode === "poly") {
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
        endDrawingMode();
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

  function commitCircle(lon, lat, radiusKm) {
    var ring = circleRing(lon, lat, radiusKm);
    var fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
    var area = G.geometryAreaM2(fc.features[0].geometry);
    setAoi({ kind: "circle", name: t("ws.aoi.kinds.circle"), fc: fc, areaM2: area, parcels: [{ name: t("ws.aoi.kinds.circle"), areaM2: area, properties: {} }], crsLabel: "WGS84", warnings: [] });
    endDrawingMode();
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
    // classification level (Level 1 land cover / Level 2 crop type)
    $$("#level-seg .level-btn").forEach(function (b) {
      var on = b.getAttribute("data-scheme") === currentScheme();
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", String(on));
    });
    $("#level-hint").textContent = currentScheme() === "general" ? t("ws.level.generalHint") : t("ws.level.cropsHint");

    // season / period preset tabs
    $$("#season-tabs .tab").forEach(function (b) {
      var key = b.getAttribute("data-season");
      b.classList.toggle("is-on", key === state.season);
      // the full-year preset exists for the land-cover level only
      b.disabled = key === "full" && currentScheme() === "crops";
      b.title = b.disabled ? t("ws.season.fullNote") : "";
    });
    var yearSel = $("#year-select");
    if (!yearSel.options.length) {
      I.YEARS.forEach(function (y) { var o = el("option", null, String(y)); o.value = String(y); yearSel.appendChild(o); });
      yearSel.addEventListener("change", function () { state.year = parseInt(yearSel.value, 10); updateSeasonInfo(); savePrefs(); });
    }
    yearSel.value = String(state.year);

    // custom range: the From/To fields always carry the ACTIVE preset's dates —
    // switching to "custom detection" starts from exactly what is on screen,
    // and a stale reversed pair can never survive a reload
    var cf = $("#custom-from"), ct = $("#custom-to");
    if (cf && !cf._wired) {
      cf._wired = ct._wired = true;
      cf.addEventListener("change", function () {
        state.customFrom = cf.value || null;
        syncCustomOrder();
      });
      ct.addEventListener("change", function () {
        state.customTo = ct.value || null;
        syncCustomOrder();
      });
    }
    if (cf) {
      var perNow = currentPeriod();
      if (state.season !== "custom" || !state.customFrom || !state.customTo) {
        state.customFrom = perNow.dateFrom;
        state.customTo = perNow.dateTo;
      }
      if (state.customFrom && state.customTo && state.customFrom > state.customTo) {
        var swap = state.customFrom; state.customFrom = state.customTo; state.customTo = swap;
      }
      cf.value = state.customFrom || "";
      ct.value = state.customTo || "";
    }
    var clearBtn = $("#custom-clear");
    if (clearBtn) clearBtn.hidden = state.season !== "custom";

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

  /** enforce From < To on the custom inputs: an inverted pair is swapped back
   *  into order immediately (and re-synced to the fields) */
  function syncCustomOrder() {
    var cf = $("#custom-from"), ct = $("#custom-to");
    if (!cf || !ct) return;
    var from = cf.value, to = ct.value;
    if (from && to && from >= to) {
      cf.value = to; ct.value = from;
      state.customFrom = to; state.customTo = from;
      toast(t("errors.bad_date_range"), true);
    }
  }
  function updateSeasonInfo() {
    var per = currentPeriod();
    $("#season-period").textContent = state.season === "custom"
      ? t("ws.season.period", { from: per.dateFrom || "—", to: per.dateTo || "—" })
      : t("ws.season.period", { from: per.dateFrom, to: per.dateTo });
    var family = currentFamily();
    var act = currentActiveClasses();
    var names = act.map(function (c) { return className(c); });

    // the seasonal-filter badge: active classes + point counts vs excluded classes
    var pts = 0;
    if (D.REFERENCE_POINTS && D.REFERENCE_POINTS.points) {
      var activeIds = act.map(function (c) { return c.id; });
      D.REFERENCE_POINTS.points.forEach(function (p) {
        var id = currentScheme() === "crops" ? p[0] : mapClassId(p[0]);
        if (activeIds.indexOf(id) >= 0) pts++;
      });
    }
    var badge = $("#season-badge");
    if (badge) {
      badge.hidden = false;
      var sbA = $("#sb-active");
      sbA.textContent = t("ws.season.badgeActive", { n: act.length, points: fmt(pts, 0) });
      var sbE = $("#sb-excluded");
      if (currentScheme() === "crops") {
        var excluded = I.classesOf("crops").filter(function (c) { return c.family !== "all" && c.family !== "both" && c.family !== family; });
        sbE.hidden = !excluded.length;
        sbE.textContent = excluded.length
          ? t("ws.season.badgeExcluded", { classes: excluded.map(function (c) { return className(c); }).join(state.lang === "ar" ? "، " : ", ") })
          : "";
      } else sbE.hidden = true;
      var sbD = $("#sb-detected");
      sbD.hidden = state.season !== "custom";
      if (state.season === "custom") sbD.textContent = t("ws.season.detected", { family: t("ws.season.family." + family) });
    }
    var fullNote = $("#season-full-note");
    if (fullNote) fullNote.hidden = !(currentScheme() === "crops" && state.season === "full");
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
    if (/^\d+$/.test(s)) {
      var n = parseInt(s, 10);
      return (I.classById(n, "crops") || I.classById(n, "general")) ? n : null;
    }
    var up = s.toUpperCase();
    for (var sch = 0; sch < 2; sch++) {
      var list = I.classesOf(sch === 0 ? "crops" : "general");
      for (var i = 0; i < list.length; i++) if (list[i].code === up) return list[i].id;
      for (var j = 0; j < list.length; j++) {
        if (list[j].en.toLowerCase() === s.toLowerCase() || list[j].ar === s) return list[j].id;
      }
    }
    return null;
  }

  function activeIds() { return currentActiveClasses().map(function (c) { return c.id; }); }

  function addSamplePoint(latlng) {
    if (!state.picking) return;
    var classId = parseInt($("#sample-class").value, 10);
    var c = classById(classId) || sampleClass(classId);
    state.samples.push({ lon: latlng.lng, lat: latlng.lat, classId: classId });
    var mark = L.circleMarker(latlng, { radius: 6, color: "#151515", weight: 1.5, fillColor: c.color, fillOpacity: 1 });
    mark.bindTooltip(c.code + " · " + className(c));
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
      var c = sampleClass(id);
      if (!c) return;
      var li = el("li", null);
      li.appendChild(el("span", "swatch"));
      li.lastChild.style.background = c.color;
      li.appendChild(el("span", "name", className(c) + " (" + c.code + ")"));
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
      var c = sampleClass(s.classId);
      if (!c) return;
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
    var act = currentActiveClasses();
    act.forEach(function (c) {
      var o = el("option", null, className(c) + " · " + c.code);
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
        var c = classById(parseInt($("#sample-class").value, 10));
        hint.textContent = t("ws.samples.pickHint", { class: className(c) });
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
          // keep every valid sample — the engine applies the seasonal filter
          // per run; the seasonal badge shows what is in season right now
          state.samples = state.samples.concat(res.samples);
          refreshSampleMarkers();
          renderSamples();
          toast(t("ws.samples.loaded", { n: fmt(res.samples.length, 0) }) + (res.skipped ? t("ws.samples.skipped", { n: fmt(res.skipped, 0) }) : ""));
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
      var s = input.algorithm + "|" + input.scheme + "|" + input.season + "|" + (input.year || "") + "|" + (input.dateFrom || "") + "|" + (input.dateTo || "") + "|" + JSON.stringify(input.params || {}) + "|" + (input.samplePoints ? input.samplePoints.length : 0);
      var h = 0;
      for (var i = 0; i < s.length; i++) { h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; }
      return (h >>> 0) % 100000;
    },
    run: function (input) {
      var algo = I.algorithmByKey(input.algorithm);
      var per = input.season === "custom"
        ? { dateFrom: input.dateFrom, dateTo: input.dateTo }
        : I.period(input.season, input.year || I.DEFAULT_YEAR);
      var scheme = input.scheme === "crops" ? "crops" : "general";
      var family = I.seasonFamily(input.season, input.dateFrom, input.dateTo);
      var res;
      if (algo.key === "kmeans") {
        var k = input.params && input.params.kClusters != null ? input.params.kClusters : I.PARAMS.kClusters.def;
        res = G.buildClusterGrid(input.aoiGeo, k, this.seedOf(input));
        res.isKmeans = true;
        res.kClusters = k;
      } else {
        // preview grid over the scheme's active classes, weighted by the
        // class share of the reference sample set (D.SCHEMES priors)
        var priors = (D.SCHEMES[scheme].priors[family] || D.SCHEMES[scheme].priors.full) || {};
        var classes = I.activeClasses(scheme, family).map(function (c) {
          return { id: c.id, weight: priors[c.id] != null ? priors[c.id] : 0.05 };
        });
        res = G.buildPreviewGrid(input.aoiGeo, classes, this.seedOf(input));
      }
      var shares = G.previewShares(res);
      var gridArea = G.gridAreaM2(res);
      var exact = state.aoi.areaM2; // geodesic polygon area (the quantity a real run would report)
      var classes = shares.map(function (s) {
        var c = classById(s.classId, scheme);
        return {
          classId: s.classId, code: c ? c.code : null, en: c ? c.en : "", ar: c ? c.ar : "", color: c ? c.color : "#cccccc",
          name: className(c),
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
          : { source: "builtin", n: D.REFERENCE_POINTS ? D.REFERENCE_POINTS.n : 360 };
      }
      return {
        mode: "preview",
        algorithm: algo.key, algorithmName: t("algo.names." + algo.key),
        scheme: scheme, family: family,
        activeClassIds: I.activeClassIds(scheme, family),
        excludedClassIds: scheme === "crops" ? I.classesOf("crops").map(function (c) { return c.id; }).filter(function (id) { return I.activeClassIds(scheme, family).indexOf(id) < 0; }) : [],
        season: input.season, dateFrom: per.dateFrom, dateTo: per.dateTo,
        tileUrl: null,
        previewImage: G.gridToDataUrl(res, colorOf, 0.85),
        grid: res,
        oa: null, kappa: null,
        classes: classes,
        nImages: null, nTrain: null, nVal: null,
        sampleSource: samplesInfo ? samplesInfo.source : null,
        nReferencePoints: samplesInfo ? samplesInfo.n : null,
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
    var c = classById(classId);
    return hexToRgb(c ? c.color : "#cccccc");
  }
  function clusterColor(n) {
    var KMEANS = ["e6194b", "3cb44b", "ffe119", "4363d8", "f58231", "911eb4", "46f0f0", "f032e6",
      "d2f53c", "fabebe", "008080", "e6beff", "9a6324", "fffac8", "800000", "aaffc3",
      "808000", "ffd8b1", "000080", "808080", "ffffff", "000000", "9a6324", "ffd700",
      "4363d8", "469990", "9a11f0", "e6194b", "3cb44b", "ffe119"];
    return "#" + KMEANS[(n - 1) % KMEANS.length];
  }
  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  }

  // ---------------------------------------------------------------- live backend (Earth Engine)
  // Two ways to go live:
  //  1. automatic — the server exposes /api/gee/* with a real GEE service-account key;
  //     the app probes /api/gee/health at boot and switches every run to it.
  //  2. explicit — a <script> setting window.DV_BACKEND_URL (or ?backend=https://…/api/run)
  //     pointing at any RunResult-shaped endpoint.
  // The endpoint receives the engine's RunInput JSON (aoiGeo + algorithm + season + params +
  // samplePoints) and answers with a RunResult: { mode:"live", tileUrl, oa, kappa, classes:[…],
  // confusion, dateFrom, dateTo, nImages, nTrain, nVal, sampleSource, durationMs, downloadUrl }.
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
  function isLive() { return !!backendUrl() || state.gee.live; }
  function liveUrl() { return backendUrl() || (state.gee.live ? state.gee.url : null); }

  /** ONE authoritative health check at boot; its verdict propagates to the
   *  badge, the banner, the run labels and the saved history. Only the SERVER
   *  saying "no key" (demo / engine_error) is treated as preview mode — a
   *  network failure is "checking", never a false preview banner; and a
   *  successful live run reconciles the state (markGeeLive). */
  function geeProbe() {
    if (!(S && S.geeHealth)) { state.gee.checked = true; renderGeeBadge(); return Promise.resolve(false); }
    return S.geeHealth().then(function (h) {
      state.gee.checked = true;
      state.gee.live = !!(h && h.mode === "live");
      state.gee.demoConfirmed = !!(h && (h.mode === "demo" || h.mode === "engine_error"));
      state.gee.unsure = !!(h && (h.mode === "unreachable" || h.mode === "error"));
      state.gee.url = S.apiBase() + "/api/gee/run";
      renderGeeBadge();
      return state.gee.live;
    }, function () {
      state.gee.checked = true; state.gee.live = false; state.gee.unsure = true; renderGeeBadge();
      return false;
    });
  }
  /** A live run completing is the strongest possible evidence that Earth
   *  Engine is configured — if the boot health probe had failed (timeout on a
   *  cold auth), reconcile every mode indicator instead of showing a preview
   *  banner over live results. */
  function markGeeLive() {
    if (state.gee.live) return;
    state.gee.live = true;
    state.gee.checked = true;
    renderGeeBadge();
  }
  function renderGeeBadge() {
    var b = $("#gee-badge");
    if (b) {
      if (!state.gee.checked && !backendUrl()) { b.textContent = t("ws.gee.checking"); b.className = "chip"; }
      else if (isLive()) { b.textContent = t("ws.gee.live"); b.className = "chip is-live"; }
      else if (state.gee.unsure && state.gee.checked) { b.textContent = t("ws.gee.unsure"); b.className = "chip"; }
      else { b.textContent = t("ws.gee.preview"); b.className = "chip"; }
    }
    var lb = $("#league-btn"); if (lb) lb.hidden = !isLive();
    var ss = $("#scene-seg"); if (ss) ss.hidden = !isLive();
    applyModeBadge(); // the header's preview/live badge follows the same state
  }

  /** POST JSON with a long abort timeout (cold Earth Engine graphs run for minutes). */
  function liveFetch(url, body, timeoutMs) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 330000) : null;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        return res.text().then(function (tx) {
          var code = "BACKEND_" + res.status;
          try { var j = JSON.parse(tx); if (j && j.error) code = j.error; } catch (e) { /* keep HTTP code */ }
          throw { code: code, message: String(tx).slice(0, 300) };
        });
      }
      return res.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw { code: "BACKEND", message: String(err && err.message || err) };
    });
  }

  /** Engine RunResult → the shape this UI's renderer speaks. */
  function normalizeLiveResult(jr, input) {
    if (!jr || !jr.classes) throw { code: "BACKEND_BAD" };
    var scheme = jr.scheme === "crops" || (input && input.scheme) === "crops" ? "crops" : "general";
    var classes = jr.classes.map(function (c) {
      var cls = classById(c.classId, scheme);
      return {
        classId: c.classId, code: c.code != null ? c.code : (cls ? cls.code : null),
        en: c.en != null ? c.en : (cls ? cls.en : ""), ar: c.ar != null ? c.ar : (cls ? cls.ar : ""),
        color: c.color || (cls ? cls.color : "#cccccc"),
        name: c.name != null ? c.name : className(cls),
        share: c.percent != null ? c.percent / 100 : (c.areaKm2 != null && jr.areaKm2 ? c.areaKm2 / jr.areaKm2 : 0),
        percent: c.percent != null ? c.percent : (c.areaKm2 != null && jr.areaKm2 ? c.areaKm2 / jr.areaKm2 * 100 : 0),
        areaM2: c.areaKm2 != null ? c.areaKm2 * 1e6 : (c.areaFeddan != null ? c.areaFeddan * 4200 : 0),
        pa: typeof c.pa === "number" ? c.pa : null,
        ua: typeof c.ua === "number" ? c.ua : null,
        f1: typeof c.f1 === "number" ? c.f1 : null,
        support: c.support || 0
      };
    });
    if (jr.confusion && jr.confusion.rows && jr.confusion.total == null) {
      jr.confusion.total = jr.confusion.rows.reduce(function (s2, row) { return s2 + row.reduce(function (s3, v) { return s3 + v; }, 0); }, 0);
    }
    var algo = (input && input.algorithm) || jr.algorithm;
    var noteCodes = (jr.notes && jr.notes.length ? jr.notes.slice() : (jr.noteCode ? [jr.noteCode] : [])).slice();
    // honest insight: weak measured accuracy at the crop level
    if (typeof jr.oa === "number" && scheme === "crops" && jr.oa < 0.55 && noteCodes.indexOf("weak_accuracy") < 0) noteCodes.push("weak_accuracy");
    if (jr.sampleSource === "builtin" && noteCodes.indexOf("builtin_training") < 0) noteCodes.push("builtin_training");
    if (jr.sampleSource === "manual" && noteCodes.indexOf("manual_training") < 0) noteCodes.push("manual_training");
    return {
      mode: "live",
      algorithm: algo, algorithmName: t("algo.names." + algo),
      scheme: scheme,
      family: jr.family || (input && input.family) || null,
      activeClassIds: jr.activeClassIds || null,
      excludedClassIds: jr.excludedClassIds || [],
      season: (input && input.season) || jr.season,
      dateFrom: jr.dateFrom || (input && input.dateFrom), dateTo: jr.dateTo || (input && input.dateTo),
      tileUrl: jr.tileUrl || null,
      previewImage: null, grid: null,
      oa: typeof jr.oa === "number" ? jr.oa : null,
      kappa: typeof jr.kappa === "number" ? jr.kappa : null,
      classes: classes,
      confusion: jr.confusion || null,
      nValPoints: jr.nValPoints != null ? jr.nValPoints : null,
      nImages: jr.nImages != null ? jr.nImages : null,
      nTrain: jr.nTrain != null ? jr.nTrain : null,
      nVal: jr.nVal != null ? jr.nVal : null,
      downloadScaleM: jr.downloadScaleM != null ? jr.downloadScaleM : null,
      cached: jr.cached === true,
      sampleSource: jr.sampleSource || null,
      sampleClassCounts: jr.sampleClassCounts || null,
      nReferencePoints: jr.nReferencePoints != null ? jr.nReferencePoints : null,
      durationMs: jr.durationMs || null,
      noteCodes: noteCodes,
      downloadUrl: jr.downloadUrl || null,
      areaKm2: jr.areaKm2 != null ? jr.areaKm2 : G.m2ToKm2(state.aoi ? state.aoi.areaM2 : 0)
    };
  }

  function runLive(input, fresh) {
    var body = JSON.parse(JSON.stringify(input)); // drop marker functions, if any
    if (fresh) body.fresh = true;                  // bypass the server result cache
    return liveFetch(liveUrl(), body, 330000).then(function (jr) {
      var res = normalizeLiveResult(jr, input);
      if (!res.tileUrl) throw { code: "BACKEND_BAD" };
      return res;
    });
  }

  // ---------------------------------------------------------------- run + results
  /* Client-side run cache: a completed live run is kept keyed by the full
   * input signature, so switching back to an already-computed algorithm,
   * preset or level renders in <200 ms (plus the server-side cache behind
   * /api/gee/run for other devices / cold starts). "Re-run fresh" bypasses
   * both. Entries also come from the saved run history (Neon) at login. */
  var runCache = new Map();       // key → normalized result
  var runCacheKey = function (input) {
    var parts = [
      input.scheme, input.algorithm, input.season,
      input.season === "custom" ? (input.dateFrom + ".." + input.dateTo) : String(input.year || ""),
      JSON.stringify(input.params || {}),
      String(input.cloudMax != null ? input.cloudMax : ""),
      (input.samplePoints || []).map(function (p) { return p.classId + "," + (+p.lon).toFixed(5) + "," + (+p.lat).toFixed(5); }).sort().join(";"),
      JSON.stringify(input.aoiGeo ? { t: input.aoiGeo.type, n: (input.aoiGeo.coordinates || []).length } : "borj") + "|" + aoiHash(input.aoiGeo),
    ];
    return parts.join("|");
  };
  function aoiHash(aoiGeo) {
    if (!aoiGeo) return "borj";
    var str = JSON.stringify(aoiGeo);
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /* live-run stage progress: data-driven — the bar advances over the elapsed
   * share of the LAST live run's measured duration (localStorage), cycling
   * the three stage labels; rAF only, no blocking renders. */
  var progressTimer = null;
  function showRunProgress() {
    var box = $("#run-progress"), label = $("#run-progress-label");
    if (!box || !label) return;
    var expected = 15000;
    try { expected = Math.max(6000, +localStorage.getItem("dv_last_live_ms") || 15000); } catch (e) { /* keep default */ }
    var t0 = Date.now();
    var bar = box.querySelector(".run-progress-bar i");
    box.hidden = false;
    if (progressTimer) cancelAnimationFrame(progressTimer);
    var tick = function () {
      var pct = Math.min(96, (Date.now() - t0) / expected * 100);
      if (bar) bar.style.width = pct + "%";
      label.textContent = t(pct < 34 ? "ws.results.stageFetch" : pct < 72 ? "ws.results.stageTrain" : "ws.results.stageRender");
      progressTimer = requestAnimationFrame(tick);
    };
    tick();
  }
  function hideRunProgress() {
    var box = $("#run-progress");
    if (box) box.hidden = true;
    if (progressTimer) { cancelAnimationFrame(progressTimer); progressTimer = null; }
  }

  function runPreview(algorithmKey, opts) {
    opts = opts || {};
    if (!state.aoi) { toast(t("ws.needAoi"), true); return; }
    var algo = I.algorithmByKey(algorithmKey || state.algorithm);
    var btn = $("#run-btn");
    var per = currentPeriod();
    var input = {
      kind: "run",
      scheme: currentScheme(),
      algorithm: algo.key,
      season: state.season,
      year: state.season === "custom" ? undefined : state.year,
      dateFrom: state.season === "custom" ? per.dateFrom : undefined,
      dateTo: state.season === "custom" ? per.dateTo : undefined,
      cloudMax: state.params.cloudMax,
      params: pickParams(algo),
      samplePoints: state.samples.map(function (s) { return { classId: s.classId, lon: s.lon, lat: s.lat }; }),
      aoiGeo: state.aoi.fc,
      aoiName: state.aoi.name
    };
    var cacheKey = runCacheKey(input);
    btn.disabled = true; btn.textContent = t("ws.running");
    var done = function () { btn.disabled = false; btn.textContent = t("ws.run"); hideRunProgress(); };
    var finish = function (res, fromCache) {
      state.results = res;
      state.results._input = input;   // the export endpoint replays exactly this
      state.results.algorithm = algo.key;
      state.resultsParams = { params: pickParams(algo), cloudMax: state.params.cloudMax };
      if (fromCache) res.fromCache = true; else res.fromCache = false;
      if (!fromCache && res.mode === "live" && res.durationMs) {
        try { localStorage.setItem("dv_last_live_ms", String(res.durationMs)); } catch (e) { /* ignore */ }
      }
      recordCompare(res);            // the compare table shows every measured run
      if (res.mode === "live") markGeeLive();  // one source of truth: a live run means live mode
      showOverlay();
      renderResults();
      renderLegend();
      if (!fromCache) {
        runCache.set(cacheKey, res);  // instant on the way back
        if (runCache.size > 24) runCache.delete(runCache.keys().next().value);
        saveRunSnapshot(input, res);  // server history (no-op when offline / not signed in via server)
        warmExportPng(input);         // background: render the export PNG once
      }
      done();
    };
    if (isLive()) {
      // cached result for this exact input → instant, with a fresh re-run chip
      if (!opts.fresh) {
        var cached = runCache.get(cacheKey);
        if (cached) { finish(cached, true); return; }
      }
      showRunProgress();
      runLive(input, opts.fresh).then(function (res) { finish(res, false); }, function (err) {
        toast(errorText(err), true);
        state.results = null;
        renderResults();
        done();
      });
    } else {
      setTimeout(function () {
        try { finish(DVBackend.run(input), false); }
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
      overlayLayer = L.tileLayer(state.results.tileUrl, geeTileOpts({ opacity: parseFloat($("#overlay-opacity").value), zIndex: 400 }));
      attachTileRetry(overlayLayer);
    } else if (state.results.previewImage) {
      var b = state.results.grid.bounds;
      overlayLayer = L.imageOverlay(state.results.previewImage, [[b[1], b[0]], [b[3], b[2]]], { opacity: parseFloat($("#overlay-opacity").value), interactive: false, zIndex: 400 });
    } else return;
    if (state.layers.overlay !== false) overlayLayer.addTo(map);
    if (abOn) setAbMode(true);   // re-clip the fresh overlay layer
  }

  // ---------------------------------------------------------------- live scene layers (Sentinel-2)
  /** Toggle a true-colour / NDVI / NDWI scene layer under the classification overlay. */
  function setSceneLayer(layer) {
    if (!isLive() || !map) return;
    if (sceneActive === layer) { // click again → remove
      if (sceneLayer) { map.removeLayer(sceneLayer); sceneLayer = null; }
      sceneActive = null;
      $$("#scene-seg button").forEach(function (b) { b.classList.remove("is-on"); });
      return;
    }
    sceneActive = layer;
    $$("#scene-seg button").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-scene") === layer); });
    var per = currentPeriod();
    liveFetch((backendUrl() ? backendUrl().replace(/\/api\/gee\/run$/, "") : S.apiBase()) + "/api/gee/scene", {
      layer: layer, season: state.season, year: state.season === "custom" ? undefined : state.year,
      dateFrom: per.dateFrom, dateTo: per.dateTo,
      cloudMax: state.params.cloudMax != null ? state.params.cloudMax : I.PARAMS.cloudMax.def
    }, 130000).then(function (j) {
      if (!j || !j.tileUrl) throw { code: "scene_failed" };
      if (sceneLayer) map.removeLayer(sceneLayer);
      sceneLayer = L.tileLayer(j.tileUrl, geeTileOpts({ opacity: 0.9, zIndex: 300 }));
      attachTileRetry(sceneLayer);
      sceneLayer.addTo(map);
    }, function (err) {
      sceneActive = null;
      $$("#scene-seg button").forEach(function (b) { b.classList.remove("is-on"); });
      toast(errorText(err), true);
    });
  }

  /** NDVI time-series popup at a clicked point (live mode). */
  function ndviPointPopup(latlng) {
    if (!map) return;
    var per = currentPeriod();
    var pop = L.popup({ className: "ndvi-pop", maxWidth: 320 })
      .setLatLng(latlng)
      .setContent('<h4>' + esc(t("ws.ndvi.loading")) + '</h4><p class="num" style="font-size:.75rem">' + latlng.lat.toFixed(5) + ", " + latlng.lng.toFixed(5) + '</p>')
      .openOn(map);
    var base = backendUrl() ? backendUrl().replace(/\/api\/gee\/run$/, "") : (S ? S.apiBase() : "");
    liveFetch(base + "/api/gee/ndvi-point", {
      lon: +latlng.lng.toFixed(6), lat: +latlng.lat.toFixed(6),
      season: state.season, year: state.season === "custom" ? undefined : state.year,
      dateFrom: per.dateFrom, dateTo: per.dateTo,
      cloudMax: state.params.cloudMax != null ? state.params.cloudMax : I.PARAMS.cloudMax.def
    }, 130000).then(function (j) {
      var series = (j && j.series) || [];
      if (!series.length) {
        pop.setContent('<h4>' + esc(t("ws.ndvi.title")) + '</h4><p class="num" style="font-size:.75rem">' + latlng.lat.toFixed(5) + ", " + latlng.lng.toFixed(5) + '</p><p>' + esc(t("ws.ndvi.empty")) + '</p>');
        return;
      }
      pop.setContent('<h4>' + esc(t("ws.ndvi.title")) + '</h4><p class="num" style="font-size:.75rem">' + latlng.lat.toFixed(5) + ", " + latlng.lng.toFixed(5) + '</p>' + ndviChartSvg(series));
    }, function () {
      pop.setContent('<h4>' + esc(t("ws.ndvi.title")) + '</h4><p>' + esc(t("errors.ndvi_failed")) + '</p>');
    });
  }

  /** Small inline SVG line chart of the NDVI series. */
  function ndviChartSvg(series) {
    var w = 280, h = 120, padL = 30, padB = 16, padT = 8;
    var n = series.length;
    var xs = series.map(function (p, i) { return padL + (n > 1 ? (w - padL - 6) * i / (n - 1) : 0); });
    var ys = series.map(function (p) {
      var v = Math.max(-0.5, Math.min(1, p.v == null ? 0 : p.v));
      return padT + (1 - (v + 0.5) / 1.5) * (h - padT - padB);
    });
    var path = xs.map(function (x, i) { return (i ? "L" : "M") + x.toFixed(1) + "," + ys[i].toFixed(1); }).join("");
    var dots = xs.map(function (x, i) {
      return '<circle cx="' + x.toFixed(1) + '" cy="' + ys[i].toFixed(1) + '" r="2.6" fill="#3e8f29"><title>'
        + esc(series[i].d + " · " + (series[i].v == null ? "—" : series[i].v.toFixed(2))) + '</title></circle>';
    }).join("");
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto" role="img">'
      + '<line x1="' + padL + '" y1="0" x2="' + padL + '" y2="' + (h - padB) + '" stroke="#ccc"/>'
      + '<text x="2" y="' + (padT + 4) + '" font-size="9" fill="#666">1.0</text>'
      + '<text x="2" y="' + (h - padB) + '" font-size="9" fill="#666">-0.5</text>'
      + '<line x1="' + padL + '" y1="' + (h - padB) + '" x2="' + (w - 4) + '" y2="' + (h - padB) + '" stroke="#ccc"/>'
      + '<path d="' + path + '" fill="none" stroke="#3e8f29" stroke-width="2"/>' + dots
      + '<text x="' + padL + '" y="' + (h - 4) + '" font-size="9" fill="#666">' + esc(series[0].d) + '</text>'
      + '<text x="' + (w - 4) + '" y="' + (h - 4) + '" font-size="9" fill="#666" text-anchor="end">' + esc(series[n - 1].d) + '</text>'
      + '</svg>';
  }

  // ---------------------------------------------------------------- accuracy league (live compare-all)
  function initLeague() {
    var dlg = $("#league-dialog");
    if (!dlg || !dlg.showModal) { var lb0 = $("#league-btn"); if (lb0) lb0.hidden = true; return; }
    $("#league-btn").addEventListener("click", function () {
      if (!state.aoi) { toast(t("ws.needAoi"), true); return; }
      runLeague();
    });
    $("#league-close").addEventListener("click", function () { dlg.close(); });
  }

  function leaguePayload() {
    var algo = I.algorithmByKey(state.algorithm);
    var per = currentPeriod();
    return {
      kind: "compare",
      scheme: currentScheme(),
      season: state.season,
      year: state.season === "custom" ? undefined : state.year,
      dateFrom: state.season === "custom" ? per.dateFrom : undefined,
      dateTo: state.season === "custom" ? per.dateTo : undefined,
      cloudMax: state.params.cloudMax,
      params: pickParams(algo),
      samplePoints: state.samples.map(function (s) { return { classId: s.classId, lon: s.lon, lat: s.lat }; }),
      aoiGeo: state.aoi.fc,
      aoiName: state.aoi.name
    };
  }

  function runLeague() {
    var dlg = $("#league-dialog"), status = $("#league-status"), tbl = $("#league-table"), bestBtn = $("#league-best-btn");
    if (!isLive()) { toast(t("errors.gee_not_configured"), true); return; }
    status.textContent = t("ws.league.running");
    bestBtn.hidden = true;
    tbl.innerHTML = "";
    dlg.showModal();
    var input = leaguePayload();
    liveFetch(liveUrl(), input, 330000).then(function (j) {
      if (!j || !Array.isArray(j.summary) || !j.best) throw { code: "BACKEND_BAD" };
      status.textContent = "";
      var thead = el("thead"), trh = el("tr");
      [t("ws.league.cols.algo"), t("ws.league.cols.oa"), t("ws.league.cols.kappa")].forEach(function (h) { trh.appendChild(el("th", null, h)); });
      thead.appendChild(trh); tbl.appendChild(thead);
      var tbody = el("tbody");
      var bestIdx = 0;
      j.summary.forEach(function (row, i) {
        // the engine returns the summary sorted by OA (desc) — the winner is the first scored row
        if (row.oa != null && j.summary[bestIdx].oa == null) bestIdx = i;
        var tr = el("tr");
        var td0 = el("td", "wrap", t("algo.names." + row.algorithm));
        if (row.oa != null) {
          var tag = el("span", "chip", " " + t("ws.league.winner") + " ");
          tag.style.fontSize = ".68rem";
          if (i === bestIdx) td0.appendChild(tag);
        }
        tr.appendChild(td0);
        td(tr, row.oa != null ? fmt(row.oa * 100, 1) + "%" : t("ws.league.failed"), "num");
        td(tr, row.kappa != null ? fmt(row.kappa, 3) : "—", "num");
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      bestBtn.hidden = false;
      bestBtn.onclick = function () {
        dlg.close();
        try {
          var res = normalizeLiveResult(j.best, { algorithm: j.best.algorithm, scheme: input.scheme, season: input.season, year: input.year });
          if (!res.tileUrl) throw { code: "BACKEND_BAD" };
          state.results = res;
          state.resultsParams = { params: pickParams(I.algorithmByKey(j.best.algorithm)), cloudMax: state.params.cloudMax };
          state.algorithm = j.best.algorithm; savePrefs();
          showOverlay(); renderResults(); renderLegend();
          saveRunSnapshot({ kind: "run", algorithm: j.best.algorithm, scheme: input.scheme, season: input.season, year: input.year, cloudMax: input.cloudMax, params: input.params, samplePoints: input.samplePoints, aoiGeo: input.aoiGeo, aoiName: input.aoiName }, res);
        } catch (err) { toast(errorText(err), true); }
      };
    }, function (err) {
      status.textContent = errorText(err);
      toast(errorText(err), true);
    });
  }

  function renderResults() {
    var body = $("#results-body"), empty = $("#results-empty");
    if (!state.results) { body.hidden = true; empty.hidden = false; renderLegend(); return; }
    body.hidden = false; empty.hidden = true;

    var r = state.results;
    var algoName = t("algo.names." + r.algorithm);
    var seasonName = t("ws.season." + r.season);
    var levelName = r.scheme === "crops" ? t("ws.level.crops") : t("ws.level.general");
    $("#results-run").textContent = t("ws.results.run", { algo: algoName, season: seasonName, period: r.dateFrom + " → " + r.dateTo })
      + " · " + t("ws.results.level", { level: r.scheme === "crops" ? "2" : "1", name: levelName });
    // cached render → a subtle chip to recompute from scratch
    var oldChip = document.getElementById("rerun-chip"); if (oldChip) oldChip.remove();
    if (r.fromCache) {
      var chip = el("button", "rerun-chip");
      chip.type = "button";
      chip.id = "rerun-chip";
      chip.textContent = "↻ " + t("ws.results.rerun");
      chip.title = t("ws.results.fromCache");
      chip.addEventListener("click", function () { runPreview(r.algorithm, { fresh: true }); });
      var runLine = $("#results-run");
      if (runLine && runLine.parentNode) runLine.parentNode.insertBefore(chip, runLine.nextSibling);
    }
    renderTrainingSetLine(r);

    // stat cards — ONE source of truth for the total: the live run's geodesic
    // AOI area (the class table sums to exactly it), never a second formula
    var row = $("#stat-row"); row.innerHTML = "";
    var totalM2 = totalAreaM2(r);
    statCard(row, feddan(totalM2) + " ", t("ws.results.total"), t("units.feddan"));
    statCard(row, fmt(G.m2ToKm2(totalM2)) + " ", t("units.km2"), "");
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

    // class table (live supervised runs add PA / UA / F1 columns)
    var liveAcc = r.mode === "live" && r.classes.some(function (c) { return c.pa != null; });
    var table = $("#class-table");
    table.innerHTML = "";
    var thead = el("thead");
    var trh = el("tr");
    var th1 = el("th", null, t("ws.results.class")); th1.className = "wrap";
    var th2 = el("th", null, t("units.feddan")); th2.className = "num";
    var th3 = el("th", null, secondUnitLabel()); th3.className = "num";
    var th4 = el("th", null, t("ws.results.percent")); th4.className = "num";
    trh.appendChild(th1); trh.appendChild(th2); trh.appendChild(th3); trh.appendChild(th4);
    if (liveAcc) {
      var th5 = el("th", null, t("ws.results.pa")); th5.className = "num";
      var th6 = el("th", null, t("ws.results.ua")); th6.className = "num";
      var th7 = el("th", null, t("ws.results.f1")); th7.className = "num";
      trh.appendChild(th5); trh.appendChild(th6); trh.appendChild(th7);
    }
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
      if (liveAcc) {
        td(tr, c.pa != null ? fmt(c.pa * 100, 1) + "%" : "—", "num");
        td(tr, c.ua != null ? fmt(c.ua * 100, 1) + "%" : "—", "num");
        td(tr, c.f1 != null ? fmt(c.f1, 3) : "—", "num");
      }
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

    // live-run extras: confusion matrix, yield & water DSS, notes, GeoTIFF link
    renderConfusion(r);
    renderDss(r);
    renderRunExtras(r);

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

    // signature chart (the reference statistics for this season family)
    var st = $("#signature-title"), sx = $("#signature-text");
    if (r.algorithm === "kmeans") {
      st.textContent = t("ws.results.clusters");
      sx.textContent = t("ws.notes.kmeans_no_accuracy");
      $("#signature-chart").innerHTML = "";
    } else {
      var fam = r.family || currentFamily();
      st.textContent = t("ws.results.signatureTitle", { season: t("ws.season.family." + fam) });
      sx.textContent = t("ws.results.signatureText");
      renderSignature(fam, r.scheme);
    }
    updateReportHead();
  }
  /** Confusion matrix (live supervised runs): rows = reference, cols = prediction. */
  function renderConfusion(r) {
    var wrap = $("#confusion-wrap"), tbl = $("#confusion-table");
    if (!wrap || !tbl) return;
    var cm = r.confusion;
    if (!(r.mode === "live" && cm && cm.classIds && cm.classIds.length > 1)) { wrap.hidden = true; tbl.innerHTML = ""; return; }
    wrap.hidden = false;
    tbl.innerHTML = "";
    var names = cm.classIds.map(function (id) { var c = classById(id, r.scheme); return c ? className(c) + " (" + c.code + ")" : String(id); });
    var thead = el("thead"), trh = el("tr");
    trh.appendChild(el("th", "rowhead", "↓"));
    names.forEach(function (n) { trh.appendChild(el("th", null, n)); });
    thead.appendChild(trh); tbl.appendChild(thead);
    var tbody = el("tbody");
    cm.rows.forEach(function (row, i) {
      var tr = el("tr");
      tr.appendChild(el("th", "rowhead", names[i]));
      row.forEach(function (v, j) {
        var d = el("td", i === j ? "diag" : "", String(v));
        tr.appendChild(d);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    var cap = $("#confusion-caption");
    if (cap) cap.textContent = confusionCaptionText(r);
  }

  /** Yield & water decision support: Egyptian indicative figures per feddan. */
  function renderDss(r) {
    var wrap = $("#dss-wrap"), tbl = $("#dss-table"), totals = $("#dss-totals");
    if (!wrap || !tbl || !totals) return;
    var rows = (r.classes || []).filter(function (c) {
      return c.code && CROP_DSS[c.code] && c.areaM2 > 0;
    });
    if (r.algorithm === "kmeans" || !rows.length) { wrap.hidden = true; tbl.innerHTML = ""; totals.innerHTML = ""; return; }
    wrap.hidden = false;
    var sumYield = 0, sumWater = 0;
    tbl.innerHTML = "";
    var thead = el("thead"), trh = el("tr");
    var th1 = el("th", null, t("ws.results.dssCrop")); th1.className = "wrap";
    var th2 = el("th", null, t("units.feddan")); th2.className = "num";
    var th3 = el("th", null, t("ws.results.dssYield")); th3.className = "num";
    var th4 = el("th", null, t("ws.results.dssWater")); th4.className = "num";
    trh.appendChild(th1); trh.appendChild(th2); trh.appendChild(th3); trh.appendChild(th4);
    thead.appendChild(trh); tbl.appendChild(thead);
    var tbody = el("tbody");
    rows.forEach(function (c) {
      var fed = G.m2ToFeddan(c.areaM2);
      var y = fed * CROP_DSS[c.code].yieldTFed;
      var w = fed * CROP_DSS[c.code].waterM3Fed;
      sumYield += y; sumWater += w;
      var tr = el("tr");
      var td0 = el("td", "wrap");
      var cell = el("span", "cell-class");
      cell.appendChild(el("span", "swatch"));
      cell.lastChild.style.background = c.color;
      cell.appendChild(el("span", null, c.name));
      td0.appendChild(cell); tr.appendChild(td0);
      td(tr, fmt(fed), "num");
      td(tr, fmt(y, 1), "num");
      td(tr, fmt(w, 0), "num");
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    totals.innerHTML = "";
    statCard(totals, fmt(sumYield, 0) + " ", t("ws.results.dssTotalYield"), t("units.ton"));
    statCard(totals, fmt(sumWater, 0) + " ", t("ws.results.dssTotalWater"), "m³");
  }

  /** Notes strip + GeoTIFF download + accuracy insight for the current run. */
  function renderRunExtras(r) {
    var run = $("#results-run");
    var actions = document.querySelector(".results-actions");
    var old = document.getElementById("run-notes"); if (old) old.remove();
    var oldInsight = document.getElementById("run-insight"); if (oldInsight) oldInsight.remove();
    var oldDl = document.getElementById("geotiff-btn"); if (oldDl) oldDl.remove();
    // the honest accuracy insight: crop types overlap strongly in the signal
    if (r.noteCodes && r.noteCodes.indexOf("weak_accuracy") >= 0 && r.mode === "live") {
      var insight = el("div", "insight-box");
      insight.id = "run-insight";
      insight.appendChild(el("b", null, t("ws.results.insight")));
      run.parentNode.insertBefore(insight, run.nextSibling);
    }
    if (run && r.noteCodes && r.noteCodes.length) {
      var texts = r.noteCodes.filter(function (code) { return code !== "weak_accuracy"; }).map(function (code) { return t("ws.notes." + code); })
        .filter(function (s) { return s && s.indexOf("ws.notes.") !== 0; });
      if (texts.length) {
        var p = el("p", "hint", texts.join(" · "));
        p.id = "run-notes";
        var anchor = document.getElementById("run-insight") || run;
        run.parentNode.insertBefore(p, anchor.nextSibling);
      }
    }
    if (actions && r.downloadUrl) {
      var dl = el("button", "btn btn-ghost btn-sm", t("ws.results.download") + (r.downloadScaleM ? " · " + r.downloadScaleM + " m" : ""));
      dl.type = "button";
      dl.id = "geotiff-btn";
      dl.addEventListener("click", exportGeotiff);
      actions.appendChild(dl);
    }
  }

  function td(tr, text, cls) { var d = el("td", cls || "", text == null ? "—" : String(text)); tr.appendChild(d); return d; }

  /** one-line provenance of the training set behind the current run */
  function renderTrainingSetLine(r) {
    var old = document.getElementById("training-set-line"); if (old) old.remove();
    if (!r) return;
    if (r.mode !== "live" && r.mode !== "preview") return;
    var algo = I.algorithmByKey(r.algorithm);
    if (algo.group !== "supervised") return;
    var src = r.sampleSource === "manual" ? t("ws.notes.manual_training") : t("ws.notes.builtin_training");
    var line = el("p", "hint", t("ws.results.trainingSet", {
      source: src, n: fmt(r.nReferencePoints != null ? r.nReferencePoints : 360, 0),
      k: fmt(r.activeClassIds ? r.activeClassIds.length : (r.classes || []).length, 0),
      split: "70/30"
    }));
    line.id = "training-set-line";
    var run = $("#results-run");
    if (run && run.parentNode) run.parentNode.insertBefore(line, run.nextSibling);
  }
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
  function renderSignature(family, schemeKey) {
    var box = $("#signature-chart"); box.innerHTML = "";
    var scheme = schemeKey === "crops" ? "crops" : "general";
    var fam = family || currentFamily();
    var classes = I.activeClasses(scheme, fam);
    if (!classes.length) classes = I.classesOf(scheme);
    var W = 640, H = 300, ML = 40, MB = 34, MT = 10, MR = 8;
    var sigs = (D.SCHEMES[scheme] && D.SCHEMES[scheme].signatures) || {};
    var rows = classes.map(function (c) {
      var sig = sigs[fam] ? sigs[fam][c.id] : null;
      if (!sig) { // "full" family or a missing table: average the winter/summer stats
        var w = sigs.winter && sigs.winter[c.id], s = sigs.summer && sigs.summer[c.id];
        if (w && s) sig = [(w[0] + s[0]) / 2, (w[1] + s[1]) / 2, (w[2] + s[2]) / 2];
        else sig = w || s;
      }
      if (!sig) return null;
      return { c: c, mean: sig[0], p10: sig[1], p90: sig[2] };
    }).filter(Boolean);
    if (!rows.length) return;
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

  // ---------------------------------------------------------------- map exports
  /* Full-frame classified PNG: stitch the run's Earth Engine tiles at the
   * highest native zoom (z14 ≈ 10 m/px; z15+ only upscales), composite over a
   * white canvas with the title, the ACTIVE seasonal legend and a caption
   * (OA, kappa, period, study area) — client-side, so Arabic RTL and English
   * both render with the page fonts and no serverless timeout can hit. */
  function ll2tile(lon, lat, z) {
    var n = Math.pow(2, z);
    var x = ((lon + 180) / 360) * n;
    var latR = lat * Math.PI / 180;
    var y = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
    return [x, y];   // fractional tile coords
  }
  function exportPng() {
    var r = state.results;
    if (!r) { toast(t("ws.results.empty"), true); return; }
    if (!r.tileUrl && !r.previewImage) { toast(t("ws.results.pngNoTiles"), true); return; }
    toast(t("ws.results.pngStitching"));
    buildExportRaster(r).then(function (work) {
      return (document.fonts && document.fonts.ready ? document.fonts.ready.then(function () { return work; }) : Promise.resolve(work));
    }).then(function (work) {
      var out = buildComposedCanvas(work, r);
      out.toBlob(function (blob) {
        if (!blob) { toast(t("ws.results.pngFailed", { err: "toBlob" }), true); return; }
        downloadBlob("delta_vision_map_" + stamp() + ".png", blob, "image/png");
        toast(t("common.download") + " · PNG " + out.width + "×" + out.height + " px");
      }, "image/png");
    }, function (err) {
      toast(t("ws.results.pngFailed", { err: (err && err.code) || err }), true);
    });
  }
  /** the classified raster for export. Live runs ask the server for a
   *  single-EE-request thumbnail (palette colours, AOI clipped, outside
   *  transparent) and upscale it to >= 2000 px with nearest-neighbour —
   *  no client-side tile storm, no Earth Engine 429s. On any endpoint
   *  failure the tile-stitch fallback runs. Preview mode draws its own
   *  preview image. */
  function buildExportRaster(r) {
    if (!r.tileUrl || !isLive()) {
      return r.previewImage ? buildClassifiedCanvas(r) : Promise.reject({ code: "pngNoTiles" });
    }
    var url = liveUrl().replace(/\/api\/gee\/run$/, "/api/gee/export-png");
    var body = JSON.stringify(Object.assign({}, (r._input || currentRunInput(r.algorithm)), { kind: "run", thumbDim: 1400 }));
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 95000) : null;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.blob();
    }).then(function (blob) {
      return createImageBitmap(blob);
    }).then(function (bmp) {
      // >= 2000 px on the long side; nearest-neighbour keeps the class
      // pixels crisp instead of blurring them into each other
      var W = bmp.width, H = bmp.height, longSide = Math.max(W, H);
      var k = longSide < 2000 ? 2000 / longSide : 1;
      var cv = document.createElement("canvas");
      cv.width = Math.round(W * k); cv.height = Math.round(H * k);
      var ctx = cv.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      return { img: cv, w: cv.width, h: cv.height, ctx: ctx };
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      // endpoint or Earth Engine refused → the tile-stitch fallback
      return buildClassifiedCanvas(r);
    });
  }
  /** fire-and-forget: ask the server to render (and cache) the export PNG
   *  right after a successful run, so clicking Export later is instant.
   *  Silent by design — errors just leave the click-on path to do the work. */
  function warmExportPng(input) {
    if (!isLive() || !input || !input.aoiGeo) return;
    try {
      var url = liveUrl().replace(/\/api\/gee\/run$/, "/api/gee/export-png");
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, input, { kind: "run", thumbDim: 1400 }))
      }).catch(function () { /* silent warm */ });
    } catch (e) { /* silent */ }
  }
  /** the run input for the current UI state (used when a replayed result
   *  carries no stored input) */
  function currentRunInput(algorithmKey) {
    var algo = I.algorithmByKey(algorithmKey || state.algorithm);
    var per = currentPeriod();
    return {
      kind: "run",
      scheme: currentScheme(),
      algorithm: algo.key,
      season: state.season,
      year: state.season === "custom" ? undefined : state.year,
      dateFrom: state.season === "custom" ? per.dateFrom : undefined,
      dateTo: state.season === "custom" ? per.dateTo : undefined,
      cloudMax: state.params.cloudMax,
      params: pickParams(algo),
      samplePoints: state.samples.map(function (sx) { return { classId: sx.classId, lon: sx.lon, lat: sx.lat }; }),
      aoiGeo: state.aoi ? state.aoi.fc : undefined,
      aoiName: state.aoi ? state.aoi.name : undefined
    };
  }
  function canvasFont() {
    return '"Tajawal", "Segoe UI", system-ui, sans-serif';
  }
  /** the publication composite: classified raster + title + ACTIVE legend +
   *  caption (OA, kappa, period, study area) — RTL for Arabic, LTR otherwise */
  function buildComposedCanvas(work, r) {
    var img = work.img, W = work.w, H = work.h;
    var isAr = state.lang === "ar";
    var pad = Math.round(W * 0.024) + 10;
    var titleSize = Math.max(22, Math.round(W * 0.026));
    var capSize = Math.max(14, Math.round(W * 0.016));
    var legSize = Math.max(15, Math.round(W * 0.018));
    var bands = Math.round(titleSize * 1.8) + pad;
    var legendRows = Math.ceil(r.classes.length / 4);
    var legendH = legendRows * Math.round(legSize * 2.1) + Math.round(pad * 0.7);
    var capH = Math.round(capSize * 2.4);
    var out = document.createElement("canvas");
    out.width = W;
    out.height = bands + H + legendH + capH;
    var c2 = out.getContext("2d");
    c2.fillStyle = "#ffffff";
    c2.fillRect(0, 0, out.width, out.height);
    c2.drawImage(img, 0, bands, W, H);
    c2.textBaseline = "alphabetic";
    c2.direction = isAr ? "rtl" : "ltr";
    // title: level · season · period · algorithm
    var levelName = r.scheme === "crops" ? t("ws.level.crops") : t("ws.level.general");
    var seasonName = t("ws.season." + (r.season || "winter"));
    var algoName = t("algo.names." + r.algorithm);
    var title = r.season === "custom"
      ? levelName + " · " + (r.dateFrom || "") + "→" + (r.dateTo || "") + " · " + algoName
      : levelName + " · " + seasonName + " · " + (r.dateFrom || "") + "→" + (r.dateTo || "") + " · " + algoName;
    c2.textAlign = isAr ? "right" : "left";
    c2.fillStyle = "#151515";
    c2.font = "700 " + titleSize + "px " + canvasFont();
    c2.fillText(title, isAr ? out.width - pad : pad, Math.round(titleSize * 1.35));
    // active seasonal legend: colour + class name (+ share), 4 per row, RTL order
    var colW = out.width / 4;
    r.classes.forEach(function (cl, i) {
      var row = Math.floor(i / 4), col = i % 4;
      var order = isAr ? 3 - col : col;
      var x = order * colW + (isAr ? -pad * 0.6 : pad * 0.6);
      var y = bands + H + Math.round(legSize * (1.35 + row * 2.1));
      c2.fillStyle = cl.color;
      var sw = Math.round(legSize * 1.1);
      c2.fillRect(isAr ? x - sw : x, y - sw, sw, sw);
      c2.fillStyle = "#333";
      c2.font = "600 " + legSize + "px " + canvasFont();
      c2.textAlign = isAr ? "right" : "left";
      c2.fillText(cl.name + (cl.percent != null ? " · " + fmt(cl.percent, 1) + "%" : ""), isAr ? x - sw - 8 : x + sw + 8, y);
    });
    // caption
    var bits = [];
    if (r.oa != null && r.kappa != null) bits.push("OA " + fmt(r.oa * 100, 1) + "% · kappa " + fmt(r.kappa, 3));
    bits.push((r.dateFrom || "") + " → " + (r.dateTo || ""));
    if (state.aoi && state.aoi.name) bits.push(state.aoi.name);
    bits.push("Delta Vision · Sentinel-2");
    c2.font = "500 " + capSize + "px " + canvasFont();
    c2.fillStyle = "#555";
    c2.fillText(bits.filter(Boolean).join("  ·  "), isAr ? out.width - pad : pad, out.height - Math.round(capSize * 0.9));
    return out;
  }
  /** ONE source of truth for the total area: the live run's geodesic AOI area
   *  (server-computed, identical to the rescaled class sum); preview falls
   *  back to the client geometry area */
  function totalAreaM2(r) {
    if (r && r.mode === "live" && r.areaKm2 != null && r.areaKm2 > 0) return r.areaKm2 * 1e6;
    return state.aoi ? state.aoi.areaM2 : 0;
  }
  /** the confusion-matrix caption: pixel total + withheld test points */
  function confusionCaptionText(r) {
    var cm = r && r.confusion;
    if (!cm) return "";
    var total = cm.total;
    if (total == null) total = cm.rows.reduce(function (s, row) { return s + row.reduce(function (s2, v) { return s2 + v; }, 0); }, 0);
    var pts = cm.nValPoints != null ? cm.nValPoints : (r.nValPoints != null ? r.nValPoints : r.nVal);
    return pts ? t("ws.results.confusionCaption", { pixels: fmt(total, 0), points: fmt(pts, 0) })
               : t("ws.results.confusionNoPoints", { pixels: fmt(total, 0) });
  }
  /** the classified raster on a canvas: live runs stitch EE tiles at z14
   *  (≥2000 px on the long side for Borj-sized AOIs; small AOIs step up the
   *  zoom until the long side reaches 2000 px), preview runs draw the
   *  preview image directly. */
  function buildClassifiedCanvas(r) {
    if (!r.tileUrl) {           // preview mode: the already-rendered dataURL
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve({ img: img, w: img.width, h: img.height, ctx: null }); };
        img.onerror = function () { reject({ code: "preview_image" }); };
        img.src = r.previewImage;
      });
    }
    var b = G.collectionBbox(state.aoi.fc);
    // Stitch zoom is picked from the AOI size so the whole grid stays within
    // 9–30 tiles — deep enough to be sharp, small enough that Earth Engine
    // renders them all quickly (and most are already warm from the map, which
    // caps its own native zoom at 13). Borj El Arab lands on z12/z13.
    var z = 13, grid = tileGridFor(b, z);
    while (grid.nx * grid.ny > 30 && z > 8) { z--; grid = tileGridFor(b, z); }
    while (grid.nx * grid.ny < 9 && z < 17) { z++; grid = tileGridFor(b, z); }
    var total = grid.nx * grid.ny;
    toast(t("ws.results.pngTiles", { n: total }));
    var tiles = new Array(total);
    var idx = 0, done = 0, failures = 0, inFlight = 0;
    return new Promise(function (resolve, reject) {
      var next = function () {
        while (idx < total && inFlight < 3) {
          (function (i) {
            inFlight++;
            var url = r.tileUrl.replace("{z}", z).replace("{x}", String(grid.x0 + (i % grid.nx))).replace("{y}", String(grid.y0 + Math.floor(i / grid.nx)));
            loadTile(url, 4).then(function (img) {
              tiles[i] = img; done++; inFlight--;
              if (done === total) finish();
              else next();
            }, function () {
              tiles[i] = null; done++; failures++; inFlight--;
              if (done === total) finish();
              else next();
            });
          })(idx++);
        }
      };
      var finish = function () {
        if (failures > total * 0.25) { reject({ code: "tile_errors" }); return; }
        var W = grid.nx * 256, H = grid.ny * 256;
        var cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        tiles.forEach(function (img, i) {
          if (img) ctx.drawImage(img, (i % grid.nx) * 256, Math.floor(i / grid.nx) * 256, 256, 256);
        });
        // ≥2000 px on the long side, nearest-neighbour so the classification
        // pixels stay crisp instead of blurring into each other
        var longSide = Math.max(W, H);
        if (longSide < 2000) {
          var k = 2000 / longSide;
          var up = document.createElement("canvas");
          up.width = Math.round(W * k); up.height = Math.round(H * k);
          var uc = up.getContext("2d");
          uc.imageSmoothingEnabled = false;
          uc.drawImage(cv, 0, 0, up.width, up.height);
          cv = up; W = up.width; H = up.height;
        }
        var out = new Image();
        out.onload = function () { resolve({ img: out, w: W, h: H, ctx: null }); };
        out.onerror = function () { reject({ code: "compose" }); };
        out.src = cv.toDataURL("image/png");
      };
      next();
    });
  }
  function tileGridFor(bbox, z) {
    var tl = ll2tile(bbox[0], bbox[3], z);   // [x, y] top-left (lon, maxLat)
    var br = ll2tile(bbox[2], bbox[1], z);
    var x0 = Math.floor(tl[0]), x1 = Math.floor(br[0]);
    var y0 = Math.floor(tl[1]), y1 = Math.floor(br[1]);
    return { x0: x0, y0: y0, nx: x1 - x0 + 1, ny: y1 - y0 + 1 };
  }
  /* One map tile. Earth Engine dynamic maps rate-limit bursts with 429, so:
   * "force-cache" first (tiles the map already displayed come straight from
   * the browser cache — no request at all), then real fetches with a low
   * concurrency and a 429-aware backoff (800 ms → 2 s → 5 s → 8 s). */
  function loadTile(url, retries, useCache) {
    if (useCache == null) useCache = true;
    var attempt = fetch(url, { mode: "cors", cache: useCache ? "force-cache" : "default" }).then(function (res) {
      // a cached response that is actually a 429 must not be reused
      if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { status: res.status });
      return res.blob();
    }).then(function (blob) {
      return createImageBitmap(blob);
    });
    return attempt.catch(function (e) {
      var status = e && e.status;
      if (retries > 0) {
        var backoff = status === 429 ? [800, 2000, 5000, 8000][Math.min(3, 4 - retries)] : 700;
        return new Promise(function (r) { setTimeout(r, backoff); }).then(function () {
          return loadTile(url, retries - 1, false);   // real request, skip the cache
        });
      }
      throw e;
    });
  }
  function downloadBlob(name, blob, mime) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 600);
  }
  function fmtBytes(n) {
    if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n > 1024) return Math.round(n / 1024) + " KB";
    return n + " B";
  }

  /* GeoTIFF: fetch the URL as a blob (EE serves CORS headers) so the browser
   * download carries the real file size, reported in the toast together with
   * the export scale. */
  function exportGeotiff() {
    var r = state.results;
    if (!r || !r.downloadUrl) { toast(t("ws.results.pngNoTiles"), true); return; }
    fetch(r.downloadUrl, { mode: "cors" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.blob();
    }).then(function (blob) {
      downloadBlob("delta_vision_" + (r.scheme === "crops" ? "crops" : "landcover") + "_" + r.algorithm + "_" + stamp() + ".tif", blob, "image/tiff");
      toast(t("ws.results.tifOk", { size: fmtBytes(blob.size), scale: r.downloadScaleM || 30 }));
    }).catch(function (e) {
      // CORS or a stale token: fall back to a plain navigation download
      var a = document.createElement("a");
      a.href = r.downloadUrl;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(t("ws.results.tifOk", { size: "—", scale: r.downloadScaleM || 30 }));
    });
  }

  /* GeoJSON export of the ACTIVE AOI with properties (name, areas, level). */
  function exportGeojson() {
    if (!state.aoi || !state.aoi.fc || !state.aoi.fc.features.length) { toast(t("ws.results.geojsonEmpty"), true); return; }
    var r = state.results;
    var fc = {
      type: "FeatureCollection",
      features: state.aoi.fc.features.map(function (f, i) {
        var props = Object.assign({}, f.properties || {});
        props.name = props.name || props.NAME || (state.aoi.name || "AOI") + " #" + (i + 1);
        props.area_feddan = +feddan(G.geometryAreaM2(f.geometry)).replace(/,/g, "");
        props.area_km2 = +G.m2ToKm2(G.geometryAreaM2(f.geometry)).toFixed(3);
        props.dv_study_area = state.aoi.name || "";
        if (r) {
          props.dv_level = r.scheme === "crops" ? 2 : 1;
          props.dv_algorithm = r.algorithm || "";
          props.dv_period = (r.dateFrom || "") + ".." + (r.dateTo || "");
        }
        return { type: "Feature", properties: props, geometry: f.geometry };
      })
    };
    var blob = new Blob([JSON.stringify(fc)], { type: "application/geo+json" });
    downloadBlob("delta_vision_aoi_" + stamp() + ".geojson", blob, "application/geo+json");
    var total = feddan(state.aoi.areaM2);
    toast(t("ws.results.geojsonOk", { n: fc.features.length, area: total }));
  }

  /* Print report: a dedicated print window with the full-frame classified
   * PNG, the class-area table and the confusion matrix — real Save-as-PDF
   * output instead of printing the whole app shell. */
  function printReport() {
    var r = state.results;
    if (!r) { toast(t("ws.results.empty"), true); return; }
    buildExportRaster(r).then(function (work) {
      var isAr = state.lang === "ar";
      var png = composeExportCanvas(work, r);       // same composite as the PNG export
      var dataUrl = png.toDataURL("image/png");
      var levelName = r.scheme === "crops" ? t("ws.level.crops") : t("ws.level.general");
      var rows = r.classes.map(function (c) {
        return "<tr><td>" + esc(c.name) + "</td><td class='n'>" + feddan(c.areaM2) + "</td><td class='n'>" + fmt(G.m2ToKm2(c.areaM2)) + "</td><td class='n'>" + fmt(c.percent, 1) + "%</td>"
          + (c.pa != null ? "<td class='n'>" + fmt(c.pa * 100, 1) + "%</td><td class='n'>" + fmt(c.ua * 100, 1) + "%</td><td class='n'>" + fmt(c.f1, 3) + "</td>" : "") + "</tr>";
      }).join("");
      var cmHtml = "";
      if (r.confusion && r.confusion.classIds && r.confusion.classIds.length > 1) {
        var names = r.confusion.classIds.map(function (id) { var c = classById(id, r.scheme); return c ? esc(className(c)) : String(id); });
        cmHtml = "<h2>" + esc(t("ws.results.confusionTitle")) + "</h2><table class='cm'>"
          + "<tr><th></th>" + names.map(function (n) { return "<th>" + n + "</th>"; }).join("") + "</tr>"
          + r.confusion.rows.map(function (row, i) {
            return "<tr><th>" + names[i] + "</th>" + row.map(function (v, j) { return "<td" + (i === j ? " class='d'" : "") + ">" + v + "</td>"; }).join("") + "</tr>";
          }).join("") + "</table>"
          + "<p class='cap'>" + esc(confusionCaptionText(r)) + "</p>";
      }
      var acc = r.oa != null ? "<b>OA " + fmt(r.oa * 100, 1) + "%</b> · kappa " + fmt(r.kappa, 3) : "";
      var html = "<!doctype html><html lang='" + state.lang + "' dir='" + (isAr ? "rtl" : "ltr") + "'><head><meta charset='utf-8'>"
        + "<title>" + esc(t("ws.results.printTitle")) + "</title><style>"
        + "body{font-family:" + (isAr ? "'Tajawal','Segoe UI'" : "'Segoe UI'") + ",system-ui,sans-serif;margin:0;color:#151515;background:#fff}"
        + "header{padding:14px 18px;border-bottom:2px solid #151515}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:#555;font-size:12px}"
        + "img.map{width:100%;display:block;margin:12px 0}table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0 18px}"
        + "th,td{border:1px solid #ccc;padding:5px 8px;text-align:start}td.n,th.n{text-align:end}tr td:last-child, table.cm td{text-align:center}"
        + "table.cm th{background:#f2f2f2}table.cm td.d{background:#e5f2d8;font-weight:600}"
        + "h2{font-size:15px;margin:18px 0 6px}p.cap{color:#555;font-size:11px}footer{padding:10px 18px;border-top:1px solid #ccc;color:#777;font-size:11px}"
        + "@media print{header{padding:8px 10px}img.map{margin:6px 0}}"
        + "</style></head><body>"
        + "<header><h1>" + esc(t("ws.results.printTitle")) + "</h1><p>" + esc(levelName + " · " + t("ws.season." + (r.season || "winter")) + " · " + (r.dateFrom || "") + " → " + (r.dateTo || "")) + " · " + esc(state.aoi ? state.aoi.name : "") + " · " + acc + "</p></header>"
        + "<img class='map' src='" + dataUrl + "' alt=''>"
        + "<h2>" + esc(t("ws.results.tableTitle")) + "</h2><table><tr><th>" + esc(t("ws.results.class")) + "</th><th class='n'>" + esc(t("units.feddan")) + "</th><th class='n'>km²</th><th class='n'>%</th>"
        + (r.classes.some(function (c) { return c.pa != null; }) ? "<th class='n'>PA</th><th class='n'>UA</th><th class='n'>F1</th>" : "") + "</tr>" + rows
        + "<tr><th>" + esc(t("ws.results.total")) + "</th><th class='n'>" + feddan(totalAreaM2(r)) + "</th><th class='n'>" + fmt(G.m2ToKm2(totalAreaM2(r))) + "</th><th class='n'>100%</th></tr></table>"
        + cmHtml
        + "<footer>" + esc(t("ws.results.printIntro")) + " · " + esc(t("report.disclaimer")) + "</footer>"
        + "</body></html>";
      var w = window.open("", "_blank");
      if (!w) { toast(t("errors.popup_blocked"), true); return; }
      w.document.write(html);
      w.document.close();
      var fire = function () { setTimeout(function () { try { w.focus(); w.print(); } catch (e) { /* the user can print manually */ } }, 250); };
      if (w.document.readyState === "complete") fire();
      else w.onload = fire;
    }, function (err) {
      toast(t("ws.results.pngFailed", { err: (err && err.code) || err }), true);
    });
  }
  /** the composite canvas (image + title + legend + caption) shared by the
   *  PNG export and the print report */
  function composeExportCanvas(work, r) { return buildComposedCanvas(work, r); }

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
    var per = r.season === "custom" ? { dateFrom: r.dateFrom, dateTo: r.dateTo } : I.period(r.season, state.year);
    var head = ["class_id", "code", "class_en", "class_ar", "area_feddan", "area_km2", "share_percent"];
    var lines = [head.join(",")];
    r.classes.forEach(function (c) {
      lines.push([c.classId, c.code == null ? "" : c.code, c.en == null ? "" : c.en, c.ar == null ? "" : c.ar, feddan(c.areaM2), fmt(G.m2ToKm2(c.areaM2), 4), fmt(c.percent, 2)].map(csvCell).join(","));
    });
    lines.push(["", "", "", "", feddan(state.aoi.areaM2), fmt(G.m2ToKm2(state.aoi.areaM2), 4), "100"].map(csvCell).join(","));
    var meta = [
      ["algorithm", r.algorithm], ["scheme", r.scheme || "general"], ["season", r.season],
      ["period", (per.dateFrom || r.dateFrom) + ".." + (per.dateTo || r.dateTo)],
      ["study_area", state.aoi.name || ""], ["mode", state.results && state.results.mode === "live" ? "live" : "preview"], ["exported", new Date().toISOString()]
    ].map(function (kv) { return csvCell("# " + kv[0] + ": " + kv[1]); });
    downloadText("delta_vision_" + (r.scheme === "crops" ? "crops" : "landcover") + "_" + r.algorithm + "_" + stamp() + ".csv", "\ufeff" + meta.concat(lines).join("\n"), "text/csv");
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
    var demo = [[29.81, 30.88, "WHT"], [29.83, 30.89, "Wheat"], [29.86, 30.87, 1], [29.87, 30.90, "Sugar Beet"], [29.90, 30.88, 10]];
    lines = lines.concat(demo.map(function (r) { return r.join(","); }));
    lines.push("# " + t("ws.samples.csvHint"));
    downloadText("delta_vision_samples_template.csv", "\ufeff" + lines.join("\n"), "text/csv");
  }
  function updateReportHead() {
    var rh = $("#report-head"); if (!rh) return;
    rh.innerHTML = "";
    var h = el("h1", null, t("report.title"));
    rh.appendChild(h);
    var r = state.results;
    var per = currentPeriod();
    var dl = el("dl");
    function ddRow(k, v) { dl.appendChild(el("dt", null, k)); dl.appendChild(el("dd", null, v)); }
    ddRow(t("report.studyArea"), (state.aoi ? state.aoi.name : "—"));
    ddRow(t("report.level"), r && r.scheme === "crops" ? t("ws.results.level", { level: "2", name: t("ws.level.crops") }) : t("ws.results.level", { level: "1", name: t("ws.level.general") }));
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
  /* every completed run's measured accuracy, keyed by level × season family —
   * the compare dialog shows these immediately instead of "not computed" */
  var compareMetrics = {};        // "scheme|family" → { algoKey: {oa, kappa} }
  function recordCompare(res) {
    if (!res || res.mode !== "live" || res.oa == null) return;
    var key = (res.scheme || "general") + "|" + (res.family || currentFamily());
    (compareMetrics[key] = compareMetrics[key] || {})[res.algorithm] = { oa: res.oa, kappa: res.kappa };
  }
  function compareCell(algo) {
    var m = (compareMetrics[(currentScheme()) + "|" + (currentFamily())] || {})[algo];
    return m ? t("ws.compare.computed", { oa: (m.oa * 100).toFixed(1), k: m.kappa.toFixed(3) }) : null;
  }
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
  // ---------------------------------------------------------------- run history (server)
  // A snapshot stores the RunInput (aoiGeo, algorithm, season, params, samplePoints) plus the
  // compact results (classes/areas/mode) — NOT the preview image (too big); reopening re-runs
  // the local preview deterministically (seeded by the same input) and restores the numbers.
  function snapshotResults(r) {
    return {
      algorithm: r.algorithm, season: r.season, dateFrom: r.dateFrom, dateTo: r.dateTo,
      mode: r.mode || "preview", oa: r.oa != null ? r.oa : null, kappa: r.kappa != null ? r.kappa : null,
      isKmeans: !!r.isKmeans, nImages: r.nImages || null, nTrain: r.nTrain || null, nVal: r.nVal || null,
      nValPoints: r.nValPoints != null ? r.nValPoints : null,
      sampleSource: r.sampleSource || null, durationMs: r.durationMs || null,
      scheme: r.scheme || null, family: r.family || null,
      activeClassIds: r.activeClassIds || null, excludedClassIds: r.excludedClassIds || [],
      noteCodes: (r.noteCodes || []).slice(),
      areaKm2: r.areaKm2 != null ? r.areaKm2 : null,
      tileUrl: r.tileUrl || null,
      downloadUrl: r.downloadUrl || null, downloadScaleM: r.downloadScaleM != null ? r.downloadScaleM : null,
      confusion: r.confusion || null,
      classes: r.classes.map(function (c) {
        return { classId: c.classId, code: c.code, en: c.en, ar: c.ar, color: c.color, name: c.name,
                 percent: c.percent, areaM2: c.areaM2, pa: c.pa, ua: c.ua, f1: c.f1, support: c.support };
      })
    };
  }
  var suppressSave = false;   // set while reopening a historical run (no duplicate row)

  function saveRunSnapshot(input, res) {
    if (!S || !S.isServer()) return;   // local-only build or offline: history is a server feature
    if (suppressSave) { suppressSave = false; return; }
    S.saveRun({
      algorithm: input.algorithm, scheme: input.scheme, season: input.season, year: input.year,
      mode: res.mode === "live" ? "live" : "preview",
      aoiName: input.aoiName || "", aoiGeo: input.aoiGeo,
      samplePoints: input.samplePoints || [], params: input.params || {},
      results: snapshotResults(res)
    }).then(function (r) { if (r && r.ok) updateHistoryButton(); }, function () { /* silent: history is best-effort */ });
  }

  function updateHistoryButton() {
    var btn = $("#history-btn");
    if (!btn) return;
    btn.hidden = !S;                       // no adapter (pure local file) → no history
    if (S) S.listRuns().then(function (r) {
      btn.hidden = !(r && r.ok && r.runs && r.runs.length);
    }, function () { btn.hidden = true; });
  }

  function initHistory() {
    var dlg = $("#history-dialog");
    if (!dlg) return;
    $("#history-close").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (ev) { if (ev.target === dlg) dlg.close(); });
    $("#history-btn").addEventListener("click", function () {
      dlg.showModal();
      renderHistoryTable();
    });
  }

  function renderHistoryTable() {
    var table = $("#history-table"), empty = $("#history-empty");
    table.innerHTML = "";
    empty.hidden = true;
    var thead = el("thead"), trh = el("tr");
    [t("ws.history.when"), t("ws.history.algo"), t("ws.history.area"), t("ws.history.mode"), ""].forEach(function (h, i) {
      var th = el("th", null, h);
      if (i === 1 || i === 2) th.className = "wrap";
      trh.appendChild(th);
    });
    thead.appendChild(trh); table.appendChild(thead);
    var tbody = el("tbody");
    table.appendChild(tbody);
    if (!S) { empty.hidden = false; tbody.appendChild(el("tr", null, el("td", "wrap", t("ws.history.empty")))); return; }
    S.listRuns().then(function (r) {
      if (!r || !r.ok || !r.runs || !r.runs.length) {
        empty.hidden = false;
        var tb = table.querySelector("tbody");
        if (tb) tb.innerHTML = "";
        return;
      }
      r.runs.forEach(function (run) {
        var tr = el("tr");
        td(tr, whenLabel(run.createdAt), "wrap");
        td(tr, t("algo.names." + run.algorithm) !== "algo.names." + run.algorithm ? t("algo.names." + run.algorithm) : run.algorithm, "wrap");
        td(tr, run.aoiName || "—", "wrap");
        var modeTd = td(tr, "", "wrap");
        modeTd.appendChild(el("span", "preview-badge" + (run.mode === "live" ? " is-live" : ""), run.mode === "live" ? "Earth Engine" : t("ws.results.modePreview")));
        var act = el("td", "wrap");
        var open = el("button", "btn btn-sm btn-lime", t("ws.history.open"));
        open.type = "button";
        open.addEventListener("click", function () { openRun(run.id); });
        var del = el("button", "btn btn-sm btn-ghost", t("ws.history.delete"));
        del.type = "button";
        del.addEventListener("click", function () {
          S.deleteRun(run.id).then(function () {
            toast(t("ws.history.deleted"));
            renderHistoryTable(); updateHistoryButton();
          }, function () { toast(t("ws.history.error"), true); });
        });
        act.appendChild(open); act.appendChild(document.createTextNode(" "));
        act.appendChild(del);
        tr.appendChild(act);
        tbody.appendChild(tr);
      });
    }, function () { empty.hidden = false; });
  }

  function whenLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var now = new Date(), sameDay = d.toDateString() === now.toDateString();
    var hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    if (state.lang === "ar") return d.toLocaleDateString("ar-EG") + " " + hm;
    return (sameDay ? "today " : d.toLocaleDateString("en-GB") + " ") + hm;
  }

  function openRun(id) {
    if (!S) return;
    S.getRun(id).then(function (run) {
      if (!run) { toast(t("ws.history.error"), true); return; }
      $("#history-dialog").close();
      // restore the AOI exactly as the upload flow does
      var aoi = {
        kind: "history",
        name: run.aoiName || "",
        fc: run.aoiGeo,
        areaM2: 0, parcels: [], crsLabel: "WGS84", warnings: []
      };
      var area = 0, parcels = [];
      run.aoiGeo.features.forEach(function (f) {
        var a = G.geometryAreaM2(f.geometry);
        area += a;
        parcels.push({ name: (f.properties && (f.properties.name || f.properties.NAME)) || (run.aoiName || "AOI"), areaM2: a, properties: f.properties || {} });
      });
      aoi.areaM2 = area; aoi.parcels = parcels;
      setAoi(aoi);
      // restore scheme/season/year/algorithm/params/samples
      if (run.scheme) state.scheme = run.scheme === "crops" ? "crops" : "general";
      state.season = run.season; state.year = run.year || state.year;
      state.algorithm = run.algorithm;
      if (run.params) Object.keys(run.params).forEach(function (k) { if (state.params[k] != null || I.PARAMS[k]) state.params[k] = run.params[k]; });
      renderWorkspaceChrome();
      // restore samples markers
      state.samples = (run.samplePoints || []).map(function (sp) { return { classId: sp.classId, lon: sp.lon, lat: sp.lat }; });
      renderSamples();
      toast(t("ws.history.loaded"));
      if (run.results && run.results.mode === "live" && run.results.tileUrl) {
        // a live row carries its full result: restore it directly (instant)
        var rr = run.results;
        var res = {
          mode: "live", algorithm: run.algorithm, algorithmName: t("algo.names." + run.algorithm),
          scheme: rr.scheme || run.scheme || "general", family: rr.family || null,
          activeClassIds: rr.activeClassIds || null, excludedClassIds: rr.excludedClassIds || [],
          season: rr.season, dateFrom: rr.dateFrom, dateTo: rr.dateTo,
          tileUrl: rr.tileUrl, previewImage: null, grid: null,
          oa: rr.oa != null ? rr.oa : null, kappa: rr.kappa != null ? rr.kappa : null,
          classes: (rr.classes || []).map(function (c) {
            var cls = classById(c.classId, rr.scheme || "general");
            return { classId: c.classId, code: c.code != null ? c.code : (cls ? cls.code : null),
                     en: c.en, ar: c.ar, color: c.color || (cls ? cls.color : "#ccc"),
                     name: c.name != null ? c.name : className(cls), share: (c.percent || 0) / 100,
                     percent: c.percent, areaM2: c.areaM2, pa: c.pa, ua: c.ua, f1: c.f1, support: c.support || 0 };
          }),
          confusion: rr.confusion || null, nValPoints: rr.nValPoints != null ? rr.nValPoints : null,
          nImages: rr.nImages || null, nTrain: rr.nTrain || null, nVal: rr.nVal || null,
          sampleSource: rr.sampleSource || null, durationMs: rr.durationMs || null,
          noteCodes: (rr.noteCodes || []).slice(),
          downloadUrl: rr.downloadUrl || null, downloadScaleM: rr.downloadScaleM != null ? rr.downloadScaleM : null,
          areaKm2: rr.areaKm2 != null ? rr.areaKm2 : (state.aoi ? G.m2ToKm2(state.aoi.areaM2) : null),
          fromHistory: true
        };
        state.results = res;
        state.resultsParams = { params: run.params || {}, cloudMax: state.params.cloudMax };
        recordCompare(res);
        showOverlay();
        renderResults();
        renderLegend();
      } else {
        // preview row: re-run the local preview (deterministic: same input → same seed)
        suppressSave = true;
        runPreview(run.algorithm);
      }
    }, function () { toast(t("ws.history.error"), true); });
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
      td(tr, a.key === "kmeans" || a.key === "signature"
        ? t("algo.labels.none")
        : (compareCell(a.key) || t("ws.results.notComputed")), "wrap");
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
      var b = ev.target.closest(".tab"); if (!b || b.disabled) return;
      var next = b.getAttribute("data-season");
      if (next === "custom" && state.season !== "custom") {
        // entering custom detection: start from the preset's exact dates
        var per = I.period(state.season, state.year);
        state.customFrom = per.dateFrom;
        state.customTo = per.dateTo;
      }
      state.season = next;
      $$("#season-tabs .tab").forEach(function (x) { x.classList.toggle("is-on", x === b); });
      updateSeasonInfo();
      updateSamplesUI();
      renderSamples();
      savePrefs();
    });
    // classification level: Level 1 land cover / Level 2 crop type
    $("#level-seg").addEventListener("click", function (ev) {
      var b = ev.target.closest(".level-btn"); if (!b) return;
      var scheme = b.getAttribute("data-scheme");
      if (scheme === state.scheme) return;
      state.scheme = scheme;
      // strict seasonal filtering: the crop scheme has no full-year period
      if (state.scheme === "crops" && state.season === "full") state.season = I.DEFAULT_SEASON;
      renderWorkspaceChrome();
      savePrefs();
    });
    // custom date range → detected season
    $("#custom-apply").addEventListener("click", function () {
      var from = $("#custom-from").value, to = $("#custom-to").value;
      if (!from || !to || from >= to) { toast(t("errors.bad_date_range"), true); return; }
      state.customFrom = from; state.customTo = to; state.season = "custom";
      $$("#season-tabs .tab").forEach(function (x) { x.classList.remove("is-on"); });
      renderWorkspaceChrome();
      savePrefs();
    });
    $("#custom-clear").addEventListener("click", function () {
      state.season = I.DEFAULT_SEASON; state.customFrom = state.customTo = null;
      renderWorkspaceChrome();
      savePrefs();
    });
  }

  // ---------------------------------------------------------------- boot
  function applyModeBadge() {
    var badge = $("#mode-badge");
    if (badge) {
      badge.classList.toggle("is-live", isLive());
      var label = badge.lastElementChild;
      if (label) {
        label.removeAttribute("data-i18n");
        label.textContent = isLive() ? t("ws.results.modeLive") : t("ws.previewBadge");
      }
    }
    // the long preview explanation only belongs to deployments the SERVER
    // confirmed as key-less; a network hiccup at boot must not show it
    var note = document.querySelector(".preview-note");
    if (note) note.hidden = isLive() || !state.gee.demoConfirmed;
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
    initHistory();
    initLeague();
    updateHistoryButton();
    initUploadPage();
    initTabs();
    renderAlgorithmPage();
    renderGuidePage();
    renderWorkspaceChrome();
    renderGeeBadge();
    geeProbe();
    // workspace buttons
    $("#sample-aoi-btn").addEventListener("click", loadSampleAoi);
    $("#draw-poly").addEventListener("click", function () { startDrawing("poly"); });
    $("#draw-rect").addEventListener("click", function () { startDrawing("rect"); });
    $("#draw-clear").addEventListener("click", function () { endDrawing(false); drawLayer.clearLayers(); clearAoi(); });
    // map-toolbar draw tools: the same drawing engine as the study-area panel,
    // one click away from the map (polygon / rectangle / triangle / circle)
    $$("#draw-tools button").forEach(function (b) {
      b.addEventListener("click", function () {
        var mode = b.getAttribute("data-draw");
        if (state.drawing && state.drawing.mode === mode) { endDrawingMode(); drawLayer.clearLayers(); return; }
        // switch the AOI panel to the draw tab so the hints are visible
        var drawTab = document.querySelector('#aoi-tabs .tab[data-tab="draw"]');
        if (drawTab) drawTab.click();
        startDrawing(mode);
      });
    });
    $("#circle-apply").addEventListener("click", applyCircle);
    $("#bb-apply").addEventListener("click", applyBbox);
    $("#run-btn").addEventListener("click", function () { runPreview(state.algorithm); });
    $("#csv-btn").addEventListener("click", classesCsv);
    $("#parcels-csv-btn").addEventListener("click", parcelsCsv);
    $("#print-btn").addEventListener("click", printReport);
    $("#png-btn").addEventListener("click", exportPng);
    $("#geojson-export-btn").addEventListener("click", exportGeojson);
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
      if (id === "workspace" && !authSession()) { location.hash = "#/login"; return; }
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
