const A = require("../public/analysis.js");

// مولّد شموع اصطناعي (مشي عشوائي مع اتجاه)
function gen(n, start, drift, vol, seed, step) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const out = [];
  let p = start;
  const t0 = Date.UTC(2026, 10, 1);
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = o * (1 + drift + (rnd() - 0.5) * vol);
    const h = Math.max(o, c) * (1 + rnd() * vol * 0.4);
    const l = Math.min(o, c) * (1 - rnd() * vol * 0.4);
    out.push({ t: t0 + i * step, o, h, l, c, v: 100 + rnd() * 200 });
    p = c;
  }
  return out;
}

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.error("FAIL:", m); } else console.log("ok  :", m); };

for (const [name, drift] of [["صاعد", 0.0015], ["هابط", -0.0015], ["جانبي", 0]]) {
  const m = {};
  const tfs = { "15m": 900000, "1h": 3600000, "4h": 14400000 };
  for (const k in tfs) m[k] = A.analyze(gen(500, 100, drift, 0.012, 7 + k.length, tfs[k]), k, gen(200, 100, drift, 0.02, 3, 86400000));
  const main = m["1h"];
  const conf = A.confluence(main, m);
  const plan = A.tradePlan(main, conf);
  console.log(`\n[${name}] score=${conf.score.toFixed(1)} ${conf.label.text} conf=${conf.confidence}% bull=${conf.bull} bear=${conf.bear}`);
  ok(conf.ind.length === 18, `${name}: 18 مؤشر`);
  ok(Number.isFinite(conf.score) && Math.abs(conf.score) <= 100, `${name}: الدرجة ضمن النطاق`);
  ok(conf.ind.every((x) => Number.isFinite(x.s) && Math.abs(x.s) <= 1), `${name}: كل الدرجات صالحة`);
  ok(Number.isFinite(main.atr) && main.atr > 0, `${name}: ATR`);
  if (plan.dir) {
    ok(plan.dir > 0 ? plan.sl < plan.entry && plan.tp[0] > plan.entry : plan.sl > plan.entry && plan.tp[0] < plan.entry, `${name}: اتجاه SL/TP صحيح`);
    ok(plan.rr.every((r) => r > 0), `${name}: R:R موجب`);
  }
  ok(main.pivots.R1 > main.pivots.P && main.pivots.S1 < main.pivots.P, `${name}: البيفوت`);
}

try { A.analyze(gen(30, 100, 0, 0.01, 1, 3600000), "1h"); ok(false, "يجب رفض بيانات قصيرة"); } catch (e) { ok(true, "رفض البيانات القصيرة"); }

// RSI على سلسلة صاعدة بالكامل = 100
const up = Array.from({ length: 40 }, (_, i) => i + 1);
ok(Math.abs(A.rsi(up, 14).pop() - 100) < 1e-9, "RSI صاعد بالكامل = 100");
// EMA ثابتة
ok(Math.abs(A.ema([5, 5, 5, 5], 3).pop() - 5) < 1e-12, "EMA لسلسلة ثابتة");

console.log(fail ? `\n${fail} اختبار فشل` : "\nكل الاختبارات نجحت");
process.exit(fail ? 1 : 0);
