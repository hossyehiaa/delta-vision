/*
 * Delta Vision — auth.js
 * Sign-up / login / logout / session for the static build. Everything lives in this browser
 * (localStorage): there is no server, so this is a demonstration of the flow, not production security.
 * Passwords are never stored — only a salted, iterated SHA-256 digest.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DVAuth = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEY_USERS = "dv_users", KEY_SESSION = "dv_session", ITER = 4096;
  var DEMO = { email: "demo@deltavision.app", password: "delta2026", name: "Demo", org: "" };

  // ------------------------------------------------------------------ SHA-256 (FIPS 180-4), pure JS
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };

  /** SHA-256 digest of a byte array → 32-byte Uint8Array */
  function sha256Bytes(msg) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = msg.length, bitLen = l * 8, padded = new Uint8Array((((l + 8) >> 6) + 1) << 6);
    padded.set(msg);
    padded[l] = 0x80;
    var dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
    dv.setUint32(padded.length - 4, bitLen >>> 0, false);
    var w = new Int32Array(64), a, b, c, d, e, f, g, h, t1, t2, S0, S1, i, s0, s1;
    for (var off = 0; off < padded.length; off += 64) {
      for (i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
      for (; i < 64; i++) {
        s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
      for (i = 0; i < 64; i++) {
        S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) { out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = (H[i] >>> 16) & 255; out[i * 4 + 2] = (H[i] >>> 8) & 255; out[i * 4 + 3] = H[i] & 255; }
    return out;
  }
  function toHex(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return s;
  }
  /** SHA-256 of a UTF-8 string → lowercase hex */
  function sha256(str) { return toHex(sha256Bytes(new TextEncoder().encode(str))); }

  /** Salted + iterated digest (the number of rounds is stored with the record). */
  function hashPassword(password, salt, iter) {
    var h = sha256(salt + ":" + password);
    for (var i = 1; i < (iter || ITER); i++) h = sha256(h + password);
    return h;
  }
  function randomHex(nBytes) {
    var bytes = new Uint8Array(nBytes);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < nBytes; i++) bytes[i] = Math.floor(Math.random() * 256);
    return toHex(bytes);
  }

  // ------------------------------------------------------------------ storage
  function store() {
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; }
  }
  function readJSON(key) {
    var s = store();
    if (!s) return null;
    try { return JSON.parse(s.getItem(key) || "null"); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    var s = store();
    if (!s) return false;
    try { if (value == null) s.removeItem(key); else s.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function loadUsers() { return readJSON(KEY_USERS) || []; }
  function saveUsers(users) { return writeJSON(KEY_USERS, users); }
  function publicUser(u) { return { id: u.id, name: u.name, email: u.email, org: u.org || "", created: u.created }; }

  // ------------------------------------------------------------------ validation
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validate(form) {
    var errors = {};
    var name = String(form.name || "").trim(), email = String(form.email || "").trim().toLowerCase(), pw = String(form.password || "");
    if (name.length < 2 || name.length > 60) errors.name = "NAME";
    if (!EMAIL_RE.test(email)) errors.email = "EMAIL";
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) errors.password = "PASSWORD";
    if (form.confirm != null && form.confirm !== pw) errors.confirm = "CONFIRM";
    return { ok: !Object.keys(errors).length, errors: errors, name: name, email: email, password: pw };
  }

  // ------------------------------------------------------------------ API
  function createAccount(form) {
    var v = validate(form);
    if (!v.ok) return { ok: false, error: "INVALID", errors: v.errors };
    var users = loadUsers();
    for (var i = 0; i < users.length; i++) if (users[i].email === v.email) return { ok: false, error: "EMAIL_TAKEN", errors: { email: "EMAIL_TAKEN" } };
    var salt = randomHex(16), now = new Date().toISOString();
    var user = { id: randomHex(8), name: v.name, email: v.email, org: String(form.org || "").trim().slice(0, 80), salt: salt, hash: hashPassword(v.password, salt), iter: ITER, created: now };
    users.push(user);
    if (!saveUsers(users)) return { ok: false, error: "STORAGE" };
    return { ok: true, user: publicUser(user) };
  }
  function login(email, password) {
    email = String(email || "").trim().toLowerCase();
    var users = loadUsers(), u = null;
    for (var i = 0; i < users.length; i++) if (users[i].email === email) u = users[i];
    if (!u || u.hash !== hashPassword(String(password || ""), u.salt, u.iter)) return { ok: false, error: "BAD_CREDENTIALS" };
    var session = { token: randomHex(16), userId: u.id, email: u.email, name: u.name, org: u.org || "", since: new Date().toISOString() };
    if (!writeJSON(KEY_SESSION, session)) return { ok: false, error: "STORAGE" };
    return { ok: true, user: publicUser(u), session: session };
  }
  function logout() { writeJSON(KEY_SESSION, null); }
  function session() {
    var s = readJSON(KEY_SESSION);
    if (!s || !s.userId) return null;
    var users = loadUsers();
    for (var i = 0; i < users.length; i++) if (users[i].id === s.userId) return s;
    return null;
  }
  /** The demo account exists so a visitor can look around without signing up. */
  function ensureDemo() {
    var users = loadUsers();
    for (var i = 0; i < users.length; i++) if (users[i].email === DEMO.email) return { ok: true, user: publicUser(users[i]), created: false };
    var r = createAccount({ name: DEMO.name, email: DEMO.email, password: DEMO.password, org: DEMO.org });
    if (r.ok) r.created = true;
    return r;
  }
  /** Number of accounts stored in this browser (for the tests). */
  function count() { return loadUsers().length; }

  return {
    signup: createAccount, login: login, logout: logout, session: session, ensureDemo: ensureDemo, count: count,
    sha256: sha256, hashPassword: hashPassword, validate: validate, DEMO: DEMO, KEYS: { users: KEY_USERS, session: KEY_SESSION }
  };
});
