// اختبار دخاني لواجهة app.js بدون متصفح: DOM وهمي + بيانات اصطناعية
const fs = require("fs");
const A = require("../public/analysis.js");
function gen(n, start, drift, step, seed) {
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const out = []; let p = start; const t0 = Date.UTC(2026, 10, 1);
  for (let i = 0; i < n; i++) { const o = p, c = o * (1 + drift + (rnd() - 0.5) * 0.012); out.push({ t: t0 + i * step, o, h: Math.max(o, c) * (1 + rnd() * 0.004), l: Math.min(o, c) * (1 - rnd() * 0.004), c, v: 100 + rnd() * 200 }); p = c; }
  return out;
}
const els = {};
const el = (id) => els[id] || (els[id] = { id, innerHTML: "", textContent: "", style: {}, onchange: null, onclick: null, clientWidth: 600, clientHeight: 340,
  getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }), scale() {} });
let listeners = {};
global.window = { Analysis: A, devicePixelRatio: 1, addEventListener: (e, f) => (listeners["w" + e] = f), scrollTo() {} };
global.document = { querySelector: (s) => el(s), addEventListener: (e, f) => (listeners[e] = f) };
global.setInterval = () => {};
const tfStep = { "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };
global.fetch = async (u) => { const tf = /interval=(\w+)/.exec(u)[1]; return { ok: true, json: async () => ({ source: "test", candles: gen(500, 2400, 0.0008, tfStep[tf], tf.length * 11) }) }; };
global.Intl = Intl;

eval(fs.readFileSync(__dirname + "/../public/app.js", "utf8"));
const click = (data) => listeners.click({ target: { closest: () => ({ dataset: data, id: data.id }) } });
(async () => {
  await new Promise((r) => setTimeout(r, 300));
  let fail = 0;
  for (const tab of ["signal", "smc", "ind", "pat", "risk"]) {
    click({ tab });
    const h = el("#view").innerHTML;
    const bad = /undefined|NaN|Infinity/.test(h);
    console.log(bad ? "FAIL:" : "ok  :", `تبويب ${tab} (${h.length} حرف)`);
    if (bad || h.length < 200) { fail++; console.log(h.match(/.{0,60}(undefined|NaN|Infinity).{0,60}/)?.[0]); }
  }
  for (const tf of ["15m", "4h", "1d", "1h"]) { click({ tf }); const h = el("#view").innerHTML; const bad = /undefined|NaN|Infinity/.test(h); console.log(bad ? "FAIL:" : "ok  :", `إطار ${tf}`); if (bad) fail++; }
  click({ tab: "risk" }); el("#rCap").value = "5000"; el("#rCap").onchange(); 
  console.log(/\$50\.00/.test(el("#view").innerHTML) ? "ok  : الحاسبة (1% من 5000 = $50)" : "FAIL: الحاسبة"); 
  console.log("السعر:", el("#price").textContent, "|", el("#meta").textContent);
  process.exit(fail ? 1 : 0);
})();
