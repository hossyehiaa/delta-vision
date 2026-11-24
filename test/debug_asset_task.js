/* debug_asset_task.js — surface why the dv_train export task sits in READY. */
"use strict";
const E = require("../engine/_gee_engine.js");

(async () => {
  await E.getEE();
  const ee = E.eeClient();

  const list1 = await new Promise((r) => ee.batch.Task.list((tasks, err) => r(err ? { err: String(err).slice(0, 200) } : { tasks })));
  const tasks = (list1 && list1.tasks) || [];
  console.log("tasks:", tasks.length);
  const mine = tasks.find((t) => /dv_train/.test(String(t.config && t.config.description || "")) || /dv_train/.test(String(t.id || "")));
  if (!mine) { console.log("no dv_train task found"); return; }
  console.log("found:", mine.id, "| state:", mine.status ? "unknown" : "—");

  // Task.start(cb) — callback(err)
  const startRes = await new Promise((r) => {
    try {
      mine.start((err) => r(err ? "ERR: " + String(err).slice(0, 250) : "started-ok"));
    } catch (e) { r("THROW: " + String(e).slice(0, 250)); }
  });
  console.log("start:", startRes);

  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 20000));
    const l2 = (await new Promise((r) => ee.data.getTaskList((x, e) => r(e ? { tasks: [] } : x))).then((l) => l.tasks)) || [];
    const st = l2.map((t) => ({ d: t.description, s: t.state, e: (t.error_message || "").slice(0, 120) }));
    console.log("poll", i, JSON.stringify(st).slice(0, 500));
    const dv = l2.find((t) => /dv_train/.test(t.description || ""));
    if (dv && /COMPLETED|FAILED|CANCELLED/.test(dv.state)) break;
  }
  // finally check the asset exists
  const assetId = "users/dv_gen_lang_0103893868/dv_training/5sbo20";
  const got = await new Promise((r) => ee.data.getAsset(assetId, (x, e) => r(e ? "ERR " + String(e).slice(0, 120) : "EXISTS " + JSON.stringify(x).slice(0, 100))));
  console.log("asset:", got);
})().catch((e) => console.error("ERR", String(e).slice(0, 300)));
