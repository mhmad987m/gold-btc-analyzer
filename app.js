(function () {
  const A = window.Analysis;
  const SYMS = [
    { id: "PAXGUSDT", name: "الذهب", short: "XAU" },
    { id: "BTCUSDT", name: "بيتكوين", short: "BTC" },
    { id: "ETHUSDT", name: "إيثيريوم", short: "ETH" },
  ];
  const TFS = [
    { id: "15m", name: "15د" },
    { id: "1h", name: "ساعة" },
    { id: "4h", name: "4س" },
    { id: "1d", name: "يومي" },
  ];
  const TABS = [
    { id: "signal", name: "🎯 إشارة" },
    { id: "smc", name: "🏗️ SMC" },
    { id: "ind", name: "📈 مؤشرات" },
    { id: "pat", name: "🕯️ أنماط" },
    { id: "risk", name: "🛡️ مخاطر" },
  ];

  const st = { sym: "PAXGUSDT", tf: "1h", tab: "signal", data: null, err: null, loading: false, risk: { cap: 1000, riskPct: 1, lev: 1 } };
  const $ = (s) => document.querySelector(s);
  const view = $("#view");

  const fmt = (p) => (p == null || !isFinite(p) ? "—" : p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : p >= 10 ? p.toFixed(2) : p.toFixed(4));
  const cls = (d) => (d > 0 ? "up" : d < 0 ? "dn" : "mut");
  const arrow = (d) => (d > 0 ? "▲" : d < 0 ? "▼" : "◆");
  const L = (s) => `<span class="ltr">${s}</span>`;
  const tfName = (k) => (TFS.find((t) => t.id === k) || {}).name || k;

  /* ---------- جلب البيانات ---------- */
  async function fetchTf(sym, tf) {
    const r = await fetch(`/api/klines?symbol=${sym}&interval=${tf}&limit=500`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "خطأ في جلب البيانات");
    // الشمعة الأخيرة قد تكون غير مكتملة؛ نبقيها (تحليل لحظي)
    return j;
  }

  async function load() {
    if (st.loading) return;
    st.loading = true; st.err = null;
    if (!st.data) view.innerHTML = '<div class="loading">جارٍ تحميل البيانات…</div>';
    try {
      const res = await Promise.all(["15m", "1h", "4h", "1d"].map((tf) => fetchTf(st.sym, tf)));
      const by = {};
      ["15m", "1h", "4h", "1d"].forEach((tf, i) => (by[tf] = res[i]));
      const daily = by["1d"].candles;
      const mtf = {};
      ["15m", "1h", "4h"].forEach((tf) => (mtf[tf] = A.analyze(by[tf].candles, tf, daily)));
      // الإطار اليومي كتحليل مستقل أيضاً عند اختياره
      const all = { ...mtf };
      if (st.tf === "1d") all["1d"] = A.analyze(daily, "1d", daily);
      st.data = { all, mtf, daily, source: by["1h"].source, ts: Date.now() };
    } catch (e) {
      st.err = e.message || String(e);
    }
    st.loading = false;
    render();
  }

  /* ---------- بناء النتيجة للإطار المختار ---------- */
  function result() {
    const d = st.data;
    if (!d) return null;
    let main = d.all[st.tf];
    if (!main) main = A.analyze(d.daily, "1d", d.daily);
    const conf = A.confluence(main, d.mtf);
    const plan = A.tradePlan(main, conf);
    return { main, conf, plan };
  }

  /* ---------- الرسم ---------- */
  function drawChart(main, plan) {
    const cv = $("#chart");
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const N = Math.min(90, main.candles.length);
    const off = main.candles.length - N;
    const cs = main.candles.slice(-N);
    const padR = 64, padT = 10, padB = 18;
    let hi = Math.max(...cs.map((c) => c.h)), lo = Math.min(...cs.map((c) => c.l));
    if (plan && plan.dir) {
      hi = Math.max(hi, plan.tp[0], plan.entry); lo = Math.min(lo, plan.sl, plan.entry);
      if (plan.dir < 0) lo = Math.min(lo, plan.tp[0]);
    }
    const rg = (hi - lo) || 1; hi += rg * 0.04; lo -= rg * 0.04;
    const X = (i) => 6 + (i + 0.5) * ((W - padR - 6) / N);
    const Y = (p) => padT + ((hi - p) / (hi - lo)) * (H - padT - padB);
    const cw = Math.max(2, ((W - padR - 6) / N) * 0.62);

    g.fillStyle = "#0e1420"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#1c2638"; g.lineWidth = 1; g.fillStyle = "#6b7a93"; g.font = "10px system-ui"; g.textAlign = "left";
    for (let k = 0; k <= 5; k++) {
      const p = lo + ((hi - lo) * k) / 5, y = Y(p);
      g.beginPath(); g.moveTo(0, y); g.lineTo(W - padR, y); g.stroke();
      g.fillText(fmt(p), W - padR + 4, y + 3);
    }
    // مناطق FVG / OB
    const zone = (z, color, label) => {
      const x0 = Math.max(6, X(Math.max(0, z.i - off)));
      g.fillStyle = color;
      g.fillRect(x0, Y(z.hi), W - padR - x0, Math.max(2, Y(z.lo) - Y(z.hi)));
      g.fillStyle = "#cbd5e1"; g.font = "9px system-ui"; g.textAlign = "left";
      g.fillText(label, x0 + 2, Y(z.hi) + 9);
    };
    main.fvg.forEach((z) => zone(z, z.dir > 0 ? "rgba(34,197,94,.16)" : "rgba(239,68,68,.16)", "FVG"));
    main.ob.forEach((z) => zone(z, z.dir > 0 ? "rgba(76,154,255,.22)" : "rgba(245,158,11,.22)", "OB"));
    // EMA
    const line = (arr, color) => {
      g.strokeStyle = color; g.lineWidth = 1.2; g.beginPath();
      let s = false;
      cs.forEach((_, i) => { const v = arr[off + i]; if (v == null) return; const x = X(i), y = Y(v); s ? g.lineTo(x, y) : (g.moveTo(x, y), (s = true)); });
      g.stroke();
    };
    line(main.series.e21, "#4c9aff"); line(main.series.e50, "#f5b942"); line(main.series.e200, "#a78bfa");
    // الشموع
    cs.forEach((c, i) => {
      const x = X(i), up = c.c >= c.o, col = up ? "#22c55e" : "#ef4444";
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, Y(c.h)); g.lineTo(x, Y(c.l)); g.stroke();
      const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
      g.fillRect(x - cw / 2, y1, cw, Math.max(1, y2 - y1));
    });
    // مستويات الصفقة
    const hl = (p, color, label) => {
      g.strokeStyle = color; g.setLineDash([5, 4]); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, Y(p)); g.lineTo(W - padR, Y(p)); g.stroke(); g.setLineDash([]);
      g.fillStyle = color; g.font = "bold 10px system-ui"; g.textAlign = "left";
      g.fillText(label + " " + fmt(p), W - padR + 4, Y(p) - 2);
    };
    if (plan && plan.dir) { hl(plan.entry, "#e6edf7", "دخول"); hl(plan.sl, "#ef4444", "SL"); plan.tp.slice(0, 2).forEach((t, i) => hl(t, "#22c55e", "TP" + (i + 1))); }
    g.fillStyle = "#6b7a93"; g.font = "10px system-ui"; g.textAlign = "left";
    g.fillText("EMA21 أزرق · EMA50 ذهبي · EMA200 بنفسجي", 8, H - 5);
  }

  /* ---------- التبويبات ---------- */
  function tabSignal(r) {
    const { main, conf, plan } = r;
    const pos = (conf.score + 100) / 2;
    const lab = conf.label;
    const decision = plan.dir
      ? `<div class="kv"><span>الاتجاه</span><b class="${cls(plan.dir)}">${plan.dir > 0 ? "شراء (Long) ▲" : "بيع (Short) ▼"}</b></div>
         <div class="kv"><span>نقطة الدخول (السوق)</span><b>${L(fmt(plan.entry))}</b></div>
         ${plan.limit != null ? `<div class="kv"><span>دخول بديل عند الارتداد (منطقة OB/FVG)</span><b>${L(fmt(plan.limit))}</b></div>` : ""}
         <div class="kv"><span>وقف الخسارة</span><b class="dn">${L(fmt(plan.sl))} <span class="pill">${L(fmt(plan.slDist))}</span></b></div>
         ${plan.tp.map((t, i) => `<div class="kv"><span>الهدف ${i + 1} <span class="pill">ATR×${[2, 3.5, 5][i]}</span></span><b class="up">${L(fmt(t))} <span class="pill">R:R ${plan.rr[i].toFixed(2)}</span></b></div>`).join("")}
         ${!plan.strong ? '<div class="warn" style="font-size:12px;margin-top:8px">⚠ الإشارة ضعيفة (ميل فقط) — الأفضل الانتظار لتأكيد أو تلاقٍ أقوى.</div>' : ""}`
      : '<div class="mut">لا توجد صفقة واضحة — السوق محايد. الأفضل الانتظار.</div>';

    return `
    <div class="card hero">
      <div class="mut" style="font-size:13px">محرك التلاقي — 18 مؤشراً · الإطار ${tfName(main.tf)}</div>
      <div class="big"><span class="tag ${lab.cls}" style="font-size:22px;padding:6px 22px">${lab.text}</span></div>
      <div style="font-size:14px">الدرجة <b class="ltr">${conf.score.toFixed(1)}</b> / 100 · الثقة <b>${conf.confidence}%</b></div>
      <div class="gauge"><i style="left:${pos}%"></i></div>
      <div class="glab"><span>بيع قوي</span><span>محايد</span><span>شراء قوي</span></div>
      <div class="mut" style="font-size:12px;margin-top:10px">🟢 ${conf.bull} مؤشر صاعد · 🔴 ${conf.bear} مؤشر هابط · اتفاق موزون ${(conf.agree * 100).toFixed(0)}%</div>
    </div>
    <div class="card"><h3>الرسم البياني + المناطق</h3><canvas id="chart"></canvas></div>
    <div class="grid">
      <div class="card"><h3>⏱️ تحليل متعدد الأطر (MTF)</h3>
        ${conf.mtf.map((m) => `<div class="kv"><span>${tfName(m.tf)}</span><span><span class="tag ${m.label.cls}">${m.label.text}</span> <span class="ltr mut">${m.score.toFixed(0)}</span></span></div>`).join("")}
        <div class="mut" style="font-size:12px;margin-top:8px">${conf.aligned === conf.total ? "✅ كل الأطر متفقة = إشارة أقوى" : `${conf.aligned}/${conf.total} أطر متفقة`}</div>
      </div>
      <div class="card"><h3>🎯 خطة التداول</h3>${decision}</div>
    </div>`;
  }

  function zoneRows(arr, label) {
    if (!arr.length) return `<div class="mut">لا يوجد</div>`;
    return arr.slice().reverse().map((z) => `<div class="kv"><span class="${cls(z.dir)}">${label} ${z.dir > 0 ? "صاعد" : "هابط"}</span><b>${L(fmt(z.lo))} – ${L(fmt(z.hi))}</b></div>`).join("");
  }

  function tabSMC(r) {
    const m = r.main, s = m.structure;
    const trend = s.trend === "bull" ? ["صاعد (HH/HL)", 1] : s.trend === "bear" ? ["هابط (LH/LL)", -1] : ["نطاق جانبي", 0];
    const ev = s.event ? `${s.event.kind} ${s.event.dir > 0 ? "صاعد" : "هابط"} عند ${fmt(s.event.level)} (منذ ${s.event.age} شمعة)` : "لا كسر حديث";
    const liq = m.liquidity;
    return `<div class="grid">
      <div class="card"><h3>🏗️ هيكل السوق</h3>
        <div class="kv"><span>الاتجاه</span><b class="${cls(trend[1])}">${trend[0]}</b></div>
        <div class="kv"><span>آخر قمة متأرجحة</span><b>${s.lastH ? L(fmt(s.lastH.p)) : "—"}</b></div>
        <div class="kv"><span>آخر قاع متأرجح</span><b>${s.lastL ? L(fmt(s.lastL.p)) : "—"}</b></div>
        <div class="kv"><span>BOS / CHOCH</span><b class="${cls(s.event ? s.event.dir : 0)}">${ev}</b></div>
      </div>
      <div class="card"><h3>📊 Premium / Discount</h3>
        <div class="kv"><span>أعلى المدى</span><b>${L(fmt(m.pd.hi))}</b></div>
        <div class="kv"><span>التوازن (50%)</span><b>${L(fmt(m.pd.eq))}</b></div>
        <div class="kv"><span>أدنى المدى</span><b>${L(fmt(m.pd.lo))}</b></div>
        <div class="kv"><span>موقع السعر</span><b class="${m.pd.zone === "discount" ? "up" : "dn"}">${(m.pd.pos * 100).toFixed(0)}% — ${m.pd.zone === "discount" ? "خصم (مفضّل للشراء)" : "علاوة (مفضّل للبيع)"}</b></div>
        <div class="bar"><span style="left:0;right:${100 - m.pd.pos * 100}%;background:${m.pd.zone === "discount" ? "var(--up)" : "var(--dn)"}"></span></div>
      </div>
      <div class="card"><h3>⚡ فجوات القيمة العادلة (FVG نشطة)</h3>${zoneRows(m.fvg, "FVG")}</div>
      <div class="card"><h3>📦 بلوكات الأوامر (غير مخففة)</h3>${zoneRows(m.ob, "OB")}</div>
      <div class="card"><h3>💧 السيولة</h3>
        <div class="kv"><span>قمم متساوية (Buy-side)</span><b>${liq.eqh.length ? liq.eqh.map((x) => L(fmt(x.level))).join(" · ") : "—"}</b></div>
        <div class="kv"><span>قيعان متساوية (Sell-side)</span><b>${liq.eql.length ? liq.eql.map((x) => L(fmt(x.level))).join(" · ") : "—"}</b></div>
        <div class="kv"><span>كنس حديث</span><b class="${cls(liq.sweep ? liq.sweep.dir : 0)}">${liq.sweep ? (liq.sweep.dir > 0 ? "كنس قيعان → ارتداد" : "كنس قمم → رفض") + ` عند ${fmt(liq.sweep.level)}` : "لا يوجد"}</b></div>
      </div>
      <div class="card"><h3>📐 فيبوناتشي (${m.fib.dir > 0 ? "موجة صاعدة" : "موجة هابطة"})</h3>
        ${m.fib.levels.map((x) => `<div class="kv"><span>${x.f}</span><b>${L(fmt(x.p))}</b></div>`).join("")}
        ${m.fib.ext.map((x) => `<div class="kv"><span>امتداد ${x.f}</span><b class="mut">${L(fmt(x.p))}</b></div>`).join("")}
      </div>
      <div class="card"><h3>📍 نقاط البيفوت (يومي)</h3>
        ${["R3", "R2", "R1", "P", "S1", "S2", "S3"].map((k) => `<div class="kv"><span class="${k[0] === "R" ? "dn" : k[0] === "S" ? "up" : ""}">${k}</span><b>${L(fmt(m.pivots[k]))}</b></div>`).join("")}
      </div>
    </div>`;
  }

  function heatColor(s) {
    const a = Math.min(1, Math.abs(s));
    return s > 0.1 ? `rgba(34,197,94,${0.18 + a * 0.55})` : s < -0.1 ? `rgba(239,68,68,${0.18 + a * 0.55})` : "rgba(100,116,139,.25)";
  }

  function tabInd(r) {
    const { main, conf } = r, rw = main.raw;
    return `
    <div class="card"><h3>🔥 خريطة الحرارة (18 مؤشر)</h3>
      <div class="heat">${conf.ind.map((x) => `<div style="background:${heatColor(x.s)}"><b>${x.id}. ${x.name}</b>${x.s > 0.1 ? "صاعد" : x.s < -0.1 ? "هابط" : "محايد"}</div>`).join("")}</div>
    </div>
    <div class="card"><h3>تفاصيل المؤشرات (الوزن × الدرجة)</h3>
      <table><tr><th>#</th><th>المؤشر</th><th>الحالة</th><th>القيمة</th><th>وزن</th><th>درجة</th></tr>
      ${conf.ind.map((x) => `<tr><td>${x.id}</td><td>${x.name}</td><td>${x.text}</td><td>${L(x.value)}</td><td>${x.w}</td><td class="${cls(x.s)}">${L((x.s > 0 ? "+" : "") + x.s.toFixed(2))}</td></tr>`).join("")}
      </table>
    </div>
    <div class="grid">
      <div class="card"><h3>قراءات خام</h3>
        <div class="kv"><span>RSI</span><b>${rw.rsi.toFixed(1)}</b></div>
        <div class="kv"><span>ADX</span><b>${rw.adx.toFixed(1)}</b></div>
        <div class="kv"><span>ATR (14)</span><b>${L(fmt(main.atr))}</b></div>
        <div class="kv"><span>VWAP</span><b>${L(fmt(rw.vwap))}</b></div>
        <div class="kv"><span>Bollinger</span><b>${L(fmt(rw.bb.lo))} – ${L(fmt(rw.bb.up))}</b></div>
        <div class="kv"><span>SuperTrend</span><b class="${cls(rw.supertrend.dir)}">${L(fmt(rw.supertrend.line))}</b></div>
      </div>
      <div class="card"><h3>المتوسطات</h3>
        ${["e9", "e21", "e50", "e200"].map((k) => `<div class="kv"><span>EMA ${k.slice(1)}</span><b class="${cls(main.price - rw.ema[k])}">${L(fmt(rw.ema[k]))}</b></div>`).join("")}
      </div>
    </div>`;
  }

  function tabPat(r) {
    const m = r.main;
    const row = (p) => `<div class="kv"><span class="${cls(p.dir)}">${p.name}</span><b>${p.status ? p.status + " · " : ""}${p.level ? L(fmt(p.level)) : p.age === 0 ? "الشمعة الحالية" : `منذ ${p.age} شمعة`}</b></div>`;
    return `<div class="grid">
      <div class="card"><h3>🕯️ أنماط الشموع (آخر 3 شموع)</h3>${m.candlePatterns.length ? m.candlePatterns.map(row).join("") : '<div class="mut">لا نمط واضح</div>'}</div>
      <div class="card"><h3>📐 أنماط الرسم البياني</h3>${m.chartPatterns.length ? m.chartPatterns.map(row).join("") : '<div class="mut">لا نمط مكتمل التشكل حالياً</div>'}</div>
      <div class="card"><h3>🔴 مقاومة</h3>${m.sr.resistance.length ? m.sr.resistance.map((x) => `<div class="kv"><span>${x.n} لمسات</span><b class="dn">${L(fmt(x.p))}</b></div>`).join("") : '<div class="mut">—</div>'}</div>
      <div class="card"><h3>🟢 دعم</h3>${m.sr.support.length ? m.sr.support.map((x) => `<div class="kv"><span>${x.n} لمسات</span><b class="up">${L(fmt(x.p))}</b></div>`).join("") : '<div class="mut">—</div>'}</div>
      <div class="card"><h3>دايفرجنس</h3>${m.divergence ? `<b class="${cls(m.divergence.dir)}">${m.divergence.text}</b>` : '<div class="mut">لا يوجد دايفرجنس حالياً</div>'}</div>
    </div>`;
  }

  function killzones() {
    const zones = [
      { n: "آسيا", s: 0, e: 5, d: "تكوين النطاق — سيولة منخفضة" },
      { n: "لندن", s: 7, e: 10, d: "أقوى جلسة للحركات الاتجاهية وكنس السيولة" },
      { n: "نيويورك", s: 12, e: 15, d: "أعلى تذبذب — أخبار أمريكية" },
      { n: "إغلاق لندن", s: 15, e: 17, d: "تصحيحات وانعكاسات" },
    ];
    const now = new Date(), h = now.getUTCHours() + now.getUTCMinutes() / 60;
    const loc = (u) => { const d = new Date(); d.setUTCHours(u, 0, 0, 0); return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", hour12: false }); };
    return zones.map((z) => { const on = h >= z.s && h < z.e; return `<div class="kz ${on ? "on" : ""}"><span><b>${z.n}</b> ${on ? "🟢 نشطة الآن" : ""}<div class="mut" style="font-size:12px">${z.d}</div></span><span class="ltr">${loc(z.s)} – ${loc(z.e)}</span></div>`; }).join("") +
      '<div class="mut" style="font-size:11px;margin-top:6px">الأوقات بتوقيت جهازك (مبنية على توقيت نيويورك الشتوي؛ تتأخر ساعة صيفاً).</div>';
  }

  function tabRisk(r) {
    const { plan, main } = r;
    const c = st.risk;
    const entry = plan.dir ? plan.entry : main.price;
    const sl = plan.dir ? plan.sl : main.price - 1.5 * main.atr;
    const dir = plan.dir || 1;
    const riskAmt = (c.cap * c.riskPct) / 100;
    const dist = Math.abs(entry - sl);
    const size = dist ? riskAmt / dist : 0;
    const val = size * entry;
    const tps = plan.dir ? plan.tp : [2, 3.5, 5].map((m) => entry + dir * m * main.atr);
    const margin = c.lev > 0 ? val / c.lev : val;
    return `<div class="grid">
      <div class="card"><h3>🧮 حاسبة إدارة المخاطر</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div><label>رأس المال ($)</label><input id="rCap" type="number" inputmode="decimal" value="${c.cap}"></div>
          <div><label>المخاطرة %</label><input id="rPct" type="number" inputmode="decimal" step="0.25" value="${c.riskPct}"></div>
          <div><label>الرافعة ×</label><input id="rLev" type="number" inputmode="decimal" value="${c.lev}"></div>
        </div>
        <div style="margin-top:12px">
          <div class="kv"><span>المبلغ المعرّض للخسارة</span><b class="dn">$${riskAmt.toFixed(2)}</b></div>
          <div class="kv"><span>الدخول / الوقف</span><b>${L(fmt(entry))} / ${L(fmt(sl))}</b></div>
          <div class="kv"><span>حجم الصفقة (${SYMS.find((s) => s.id === st.sym).short})</span><b>${L(size >= 1 ? size.toFixed(3) : size.toFixed(6))}</b></div>
          <div class="kv"><span>قيمة المركز</span><b>$${val.toFixed(2)}</b></div>
          <div class="kv"><span>الهامش المطلوب</span><b class="${margin > c.cap ? "dn" : ""}">$${margin.toFixed(2)} ${margin > c.cap ? "⚠ يتجاوز رأس المال" : ""}</b></div>
          ${tps.map((t, i) => { const pr = Math.abs(t - entry) * size; return `<div class="kv"><span>ربح عند الهدف ${i + 1} (${L(fmt(t))})</span><b class="up">+$${pr.toFixed(2)} <span class="pill">R:R ${(Math.abs(t - entry) / (dist || 1)).toFixed(2)}</span></b></div>`; }).join("")}
        </div>
        ${plan.dir ? "" : '<div class="warn" style="font-size:12px;margin-top:8px">لا توجد إشارة واضحة؛ الأرقام مبنية على سيناريو شراء افتراضي.</div>'}
        <div class="mut" style="font-size:12px;margin-top:8px">قاعدة عامة: لا تخاطر بأكثر من 1–2% من رأس المال في الصفقة الواحدة.</div>
      </div>
      <div class="card"><h3>⏰ مناطق القتل (Killzones)</h3>${killzones()}</div>
    </div>`;
  }

  /* ---------- العرض ---------- */
  function render() {
    // الأزرار
    $("#symSeg").innerHTML = SYMS.map((s) => `<button class="${s.id === st.sym ? "on" : ""}" data-sym="${s.id}">${s.name}</button>`).join("");
    $("#tfSeg").innerHTML = TFS.map((t) => `<button class="${t.id === st.tf ? "on" : ""}" data-tf="${t.id}">${t.name}</button>`).join("");
    $("#tabs").innerHTML = TABS.map((t) => `<button class="${t.id === st.tab ? "on" : ""}" data-tab="${t.id}">${t.name}</button>`).join("");

    if (st.err && !st.data) { view.innerHTML = `<div class="err">⚠️ ${st.err}<br><button class="iconbtn" style="margin-top:8px" id="retry">إعادة المحاولة</button></div>`; const b = $("#retry"); if (b) b.onclick = load; return; }
    if (!st.data) return;

    const r = result();
    const d = st.data;
    const day = d.daily;
    const ref = day[day.length - 2] ? day[day.length - 2].c : r.main.candles[0].c; // إغلاق أمس
    const pct = ((r.main.price - ref) / ref) * 100;
    $("#price").textContent = fmt(r.main.price);
    $("#chg").innerHTML = `<span class="${cls(pct)}">${arrow(pct)} ${pct.toFixed(2)}% (يومي)</span>`;
    $("#meta").textContent = `المصدر: ${d.source} · آخر تحديث ${new Date(d.ts).toLocaleTimeString("ar", { hour12: false })}${st.err ? " · ⚠ تعذر التحديث الأخير" : ""}`;

    const body = { signal: tabSignal, smc: tabSMC, ind: tabInd, pat: tabPat, risk: tabRisk }[st.tab](r);
    view.innerHTML = body;
    if (st.tab === "signal") drawChart(r.main, r.plan);
    if (st.tab === "risk") {
      const bind = (id, k) => { const el = $(id); el.onchange = () => { st.risk[k] = Math.max(0, parseFloat(el.value) || 0); render(); }; };
      bind("#rCap", "cap"); bind("#rPct", "riskPct"); bind("#rLev", "lev");
    }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.sym) { st.sym = b.dataset.sym; st.data = null; load(); render(); }
    else if (b.dataset.tf) { const prev = st.tf; st.tf = b.dataset.tf; if (st.tf === "1d" && st.data && !st.data.all["1d"]) st.data.all["1d"] = A.analyze(st.data.daily, "1d", st.data.daily); render(); }
    else if (b.dataset.tab) { st.tab = b.dataset.tab; render(); window.scrollTo({ top: 0 }); }
    else if (b.id === "refresh") load();
  });
  window.addEventListener("resize", () => { const r = st.data && result(); if (r && st.tab === "signal") drawChart(r.main, r.plan); });

  render();
  load();
  setInterval(load, 60000);
})();
