#!/usr/bin/env node
/*
 * auth.test.js — DVAuth against Node's own crypto (OpenSSL) as the independent reference.
 *   node auth.test.js <auth.js>
 */
"use strict";
const path = require("path"), crypto = require("crypto");
const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const A = require(path.resolve(process.argv[2]));
let pass = 0, fails = [];
const ok = (c, n, x) => { if (c) { pass++; console.log("  PASS " + n); } else { fails.push(n); console.log("  FAIL " + n + (x ? "  → " + x : "")); } };
const ref = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

console.log("== SHA-256 vs OpenSSL");
const cases = ["", "abc", "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(65), "a".repeat(1000),
  "مرحبا بالعالم", "Δelta ✔ é", "x".repeat(100000)];
for (const c of cases) ok(A.sha256(c) === ref(c), "sha256(len " + c.length + ")" + (c.length < 20 ? " " + JSON.stringify(c) : ""));
const known = { "": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", abc: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" };
for (const k of Object.keys(known)) ok(A.sha256(k) === known[k], "FIPS 180-4 vector " + JSON.stringify(k));

console.log("== validation");
const bad = (f, key) => { const r = A.validate(f); return !r.ok && !!r.errors[key]; };
ok(bad({ name: "A", email: "a@b.co", password: "abcd1234" }, "name"), "name too short");
ok(bad({ name: "Ahmed Ali", email: "ahmed", password: "abcd1234" }, "email"), "email without domain");
ok(bad({ name: "Ahmed Ali", email: "a@b.co", password: "12345678" }, "password"), "password without a letter");
ok(bad({ name: "Ahmed Ali", email: "a@b.co", password: "abcdefgh" }, "password"), "password without a digit");
ok(bad({ name: "Ahmed Ali", email: "a@b.co", password: "ab1" }, "password"), "password shorter than 8");
ok(bad({ name: "Ahmed Ali", email: "a@b.co", password: "abcd1234", confirm: "abcd1235" }, "confirm"), "confirmation mismatch");
ok(A.validate({ name: "Ahmed Ali", email: "A@B.CO", password: "abcd1234" }).email === "a@b.co", "email lower-cased");

console.log("== sign-up / login / session");
const t0 = Date.now();
let r = A.signup({ name: "Ahmed Ali", email: "Ahmed@Example.com", password: "Delta2026", org: "Tanta University" });
ok(r.ok && r.user.email === "ahmed@example.com" && r.user.name === "Ahmed Ali" && r.user.org === "Tanta University", "signup ok (" + (Date.now() - t0) + " ms)");
ok(r.ok && !("hash" in r.user) && !("salt" in r.user), "hash and salt never leave the store");
const stored = JSON.parse(mem.get(A.KEYS.users));
ok(stored.length === 1 && stored[0].hash === A.hashPassword("Delta2026", stored[0].salt) && stored[0].hash.length === 64 && !mem.get(A.KEYS.users).includes("Delta2026"), "stored: salted digest only, no plain password");
ok(A.count() === 1 && A.session() === null, "signup does not log in automatically");
r = A.signup({ name: "Another", email: "ahmed@example.com", password: "abcd1234" });
ok(!r.ok && r.error === "EMAIL_TAKEN", "same e-mail again → EMAIL_TAKEN");
r = A.signup({ name: "Another", email: "x@y.co", password: "short" });
ok(!r.ok && r.error === "INVALID" && r.errors.password === "PASSWORD", "weak password → INVALID");
r = A.login("ahmed@example.com", "wrongpass1");
ok(!r.ok && r.error === "BAD_CREDENTIALS" && A.session() === null, "wrong password → BAD_CREDENTIALS, no session");
r = A.login("nobody@example.com", "Delta2026");
ok(!r.ok && r.error === "BAD_CREDENTIALS", "unknown e-mail → BAD_CREDENTIALS");
r = A.login("  Ahmed@Example.com ", "Delta2026");
ok(r.ok && r.session.email === "ahmed@example.com" && r.session.token.length === 32, "login ok (e-mail trimmed, case-insensitive)");
ok(A.session() && A.session().userId === r.user.id, "session persists while the browser keeps localStorage");
r = A.signup({ name: "Sara Hassan", email: "sara@example.com", password: "Rice2026x" });
r = A.login("sara@example.com", "Rice2026x");
ok(r.ok && A.session().email === "sara@example.com" && A.count() === 2, "second account, session switches to Sara");
A.logout();
ok(A.session() === null && mem.get(A.KEYS.session) == null, "logout clears the session");
// tampering: session of a deleted user is not accepted
mem.set(A.KEYS.session, JSON.stringify({ token: "x", userId: "ghost", email: "g@h.co", name: "g" }));
ok(A.session() === null, "session of a deleted user → null");
// two users with the same password get different digests (salt works)
r = A.signup({ name: "Salt Test", email: "salt@example.com", password: "Delta2026" });
const st = JSON.parse(mem.get(A.KEYS.users));
ok(st[0].hash !== st[2].hash && st[0].salt !== st[2].salt, "same password + different salt → different digests");

console.log("== demo account");
r = A.ensureDemo();
ok(r.ok && r.created === true && r.user.email === A.DEMO.email, "demo account created: " + A.DEMO.email);
r = A.ensureDemo();
ok(r.ok && r.created === false, "demo account is not duplicated");
r = A.login(A.DEMO.email, A.DEMO.password);
ok(r.ok && A.session().name === A.DEMO.name, "demo login with the published password");
r = A.login(A.DEMO.email, "nope1234");
ok(!r.ok, "demo rejects a wrong password");

console.log("\n" + pass + " passed, " + fails.length + " failed" + (fails.length ? "\n  " + fails.join("\n  ") : ""));
process.exit(fails.length ? 1 : 0);
