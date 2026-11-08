import fs from "node:fs";
const src = fs.readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const worker = mod.default;

// كاش وهمي
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const ctx = { waitUntil() {} };

const mk = (n) => Array.from({ length: n }, (_, i) => [1e12 + i * 6e4, "100", "101", "99", "100.5", "10"]);
let calls = [];
globalThis.fetch = async (u) => {
  calls.push(new URL(u).host);
  if (u.includes("api.binance.com")) return new Response("blocked", { status: 451 });       // محاكاة الحجب
  if (u.includes("binance.vision")) return new Response("blocked", { status: 403 });
  if (u.includes("bybit")) return new Response(JSON.stringify({ retCode: 0, result: { list: mk(100).reverse().map(k => [k[0], k[1], k[2], k[3], k[4], k[5]]) } }));
  return new Response("x", { status: 500 });
};

let fail = 0;
const ok = (c, m) => { console.log(c ? "ok  :" : "FAIL:", m); if (!c) fail++; };

let r = await worker.fetch(new Request("https://x.dev/api/klines?symbol=PAXGUSDT&interval=1h&limit=100"), {}, ctx);
let j = await r.json();
ok(r.status === 200 && j.source === "bybit" && j.candles.length === 100, "fallback: binance مرفوض → bybit يعمل");
ok(calls.join(",") === "api.binance.com,data-api.binance.vision,api.bybit.com", "ترتيب المصادر");
ok(j.candles[0].t < j.candles[99].t, "ترتيب الشموع تصاعدي");

r = await worker.fetch(new Request("https://x.dev/api/klines?symbol=DOGEUSDT&interval=1h"), {}, ctx);
ok(r.status === 400, "رمز غير مدعوم → 400");
r = await worker.fetch(new Request("https://x.dev/api/klines?symbol=BTCUSDT&interval=5m"), {}, ctx);
ok(r.status === 400, "إطار غير مدعوم → 400");

globalThis.fetch = async () => new Response("no", { status: 500 });
r = await worker.fetch(new Request("https://x.dev/api/klines?symbol=BTCUSDT&interval=1h"), {}, ctx);
ok(r.status === 502, "فشل كل المصادر → 502");

r = await worker.fetch(new Request("https://x.dev/"), {}, ctx);
const html = await r.text();
ok(r.status === 200 && html.includes("<!doctype html>") && html.includes("Analysis"), "الصفحة الرئيسية تُخدَّم");
// استخراج السكربتات والتأكد من صحتها
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok(scripts.length === 2, "تم تضمين السكربتين");
fs.writeFileSync("/tmp/_s0.js", scripts[0]); fs.writeFileSync("/tmp/_s1.js", scripts[1]);
process.exit(fail ? 1 : 0);
