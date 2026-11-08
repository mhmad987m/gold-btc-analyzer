/* محرك التحليل — يعمل في المتصفح وفي Node للاختبار
 * candles: [{t,o,h,l,c,v}] مرتبة من الأقدم للأحدث
 */
(function (root) {
  const A = {};
  const last = (a, k = 1) => a[a.length - k];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  /* ================= المؤشرات الأساسية ================= */
  A.ema = (v, p) => {
    const k = 2 / (p + 1);
    const o = [];
    let e = v[0];
    for (let i = 0; i < v.length; i++) {
      e = i === 0 ? v[0] : v[i] * k + e * (1 - k);
      o.push(e);
    }
    return o;
  };

  A.sma = (v, p) => {
    const o = new Array(v.length).fill(null);
    let s = 0;
    for (let i = 0; i < v.length; i++) {
      s += v[i];
      if (i >= p) s -= v[i - p];
      if (i >= p - 1) o[i] = s / p;
    }
    return o;
  };

  A.rsi = (c, p = 14) => {
    const o = new Array(c.length).fill(null);
    if (c.length <= p) return o;
    let g = 0, l = 0;
    for (let i = 1; i <= p; i++) {
      const d = c[i] - c[i - 1];
      if (d >= 0) g += d; else l -= d;
    }
    g /= p; l /= p;
    o[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = p + 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      g = (g * (p - 1) + Math.max(d, 0)) / p;
      l = (l * (p - 1) + Math.max(-d, 0)) / p;
      o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return o;
  };

  A.trueRange = (cs) =>
    cs.map((x, i) => {
      if (i === 0) return x.h - x.l;
      const pc = cs[i - 1].c;
      return Math.max(x.h - x.l, Math.abs(x.h - pc), Math.abs(x.l - pc));
    });

  A.atr = (cs, p = 14) => {
    const tr = A.trueRange(cs);
    const o = new Array(cs.length).fill(null);
    if (cs.length < p) return o;
    let a = sum(tr.slice(0, p)) / p;
    o[p - 1] = a;
    for (let i = p; i < cs.length; i++) {
      a = (a * (p - 1) + tr[i]) / p;
      o[i] = a;
    }
    return o;
  };

  A.macd = (c, f = 12, s = 26, sg = 9) => {
    const ef = A.ema(c, f), es = A.ema(c, s);
    const line = c.map((_, i) => ef[i] - es[i]);
    const signal = A.ema(line, sg);
    const hist = line.map((x, i) => x - signal[i]);
    return { line, signal, hist };
  };

  A.bollinger = (c, p = 20, k = 2) => {
    const mid = A.sma(c, p);
    const up = [], lo = [], pb = [], bw = [];
    for (let i = 0; i < c.length; i++) {
      if (mid[i] == null) { up.push(null); lo.push(null); pb.push(null); bw.push(null); continue; }
      const sl = c.slice(i - p + 1, i + 1);
      const sd = Math.sqrt(sum(sl.map((x) => (x - mid[i]) ** 2)) / p);
      up.push(mid[i] + k * sd);
      lo.push(mid[i] - k * sd);
      pb.push(up[i] === lo[i] ? 0.5 : (c[i] - lo[i]) / (up[i] - lo[i]));
      bw.push((up[i] - lo[i]) / mid[i]);
    }
    return { mid, up, lo, pb, bw };
  };

  A.stoch = (cs, p = 14, sk = 3, sd = 3) => {
    const raw = cs.map((x, i) => {
      if (i < p - 1) return null;
      const sl = cs.slice(i - p + 1, i + 1);
      const hh = Math.max(...sl.map((y) => y.h));
      const ll = Math.min(...sl.map((y) => y.l));
      return hh === ll ? 50 : ((x.c - ll) / (hh - ll)) * 100;
    });
    const sm = (arr, n) =>
      arr.map((_, i) => {
        if (i < n - 1 || arr.slice(i - n + 1, i + 1).some((v) => v == null)) return null;
        return sum(arr.slice(i - n + 1, i + 1)) / n;
      });
    const k = sm(raw, sk);
    const d = sm(k, sd);
    return { k, d };
  };

  A.supertrend = (cs, p = 10, m = 3) => {
    const atr = A.atr(cs, p);
    const trend = new Array(cs.length).fill(0);
    const line = new Array(cs.length).fill(null);
    let fu = null, fl = null, dir = 1;
    for (let i = 0; i < cs.length; i++) {
      if (atr[i] == null) continue;
      const hl2 = (cs[i].h + cs[i].l) / 2;
      let bu = hl2 + m * atr[i];
      let bl = hl2 - m * atr[i];
      if (fu == null) { fu = bu; fl = bl; dir = cs[i].c >= hl2 ? 1 : -1; }
      else {
        const pc = cs[i - 1].c;
        bu = bu < fu || pc > fu ? bu : fu;
        bl = bl > fl || pc < fl ? bl : fl;
        if (dir === 1 && cs[i].c < fl) dir = -1;
        else if (dir === -1 && cs[i].c > fu) dir = 1;
        fu = bu; fl = bl;
      }
      trend[i] = dir;
      line[i] = dir === 1 ? fl : fu;
    }
    return { trend, line };
  };

  A.adx = (cs, p = 14) => {
    const n = cs.length;
    const adx = new Array(n).fill(null), pdi = new Array(n).fill(null), mdi = new Array(n).fill(null);
    if (n < p * 2 + 1) return { adx, pdi, mdi };
    const tr = A.trueRange(cs);
    const pdm = [0], mdm = [0];
    for (let i = 1; i < n; i++) {
      const up = cs[i].h - cs[i - 1].h, dn = cs[i - 1].l - cs[i].l;
      pdm.push(up > dn && up > 0 ? up : 0);
      mdm.push(dn > up && dn > 0 ? dn : 0);
    }
    let str = sum(tr.slice(1, p + 1)), sp = sum(pdm.slice(1, p + 1)), sm = sum(mdm.slice(1, p + 1));
    const dx = [];
    for (let i = p; i < n; i++) {
      if (i > p) {
        str = str - str / p + tr[i];
        sp = sp - sp / p + pdm[i];
        sm = sm - sm / p + mdm[i];
      }
      const pi = (sp / str) * 100, mi = (sm / str) * 100;
      pdi[i] = pi; mdi[i] = mi;
      dx.push({ i, v: pi + mi === 0 ? 0 : (Math.abs(pi - mi) / (pi + mi)) * 100 });
    }
    let a = sum(dx.slice(0, p).map((d) => d.v)) / p;
    adx[dx[p - 1].i] = a;
    for (let j = p; j < dx.length; j++) {
      a = (a * (p - 1) + dx[j].v) / p;
      adx[dx[j].i] = a;
    }
    return { adx, pdi, mdi };
  };

  A.vwap = (cs, tf) => {
    const intraday = tf === "15m" || tf === "1h";
    let start = Math.max(0, cs.length - 30);
    if (intraday) {
      const dayStart = Math.floor(last(cs).t / 86400000) * 86400000;
      const idx = cs.findIndex((x) => x.t >= dayStart);
      start = cs.length - idx >= 4 ? idx : Math.max(0, cs.length - 24);
    }
    let pv = 0, vv = 0;
    for (let i = start; i < cs.length; i++) {
      const tp = (cs[i].h + cs[i].l + cs[i].c) / 3;
      pv += tp * cs[i].v; vv += cs[i].v;
    }
    return vv ? pv / vv : last(cs).c;
  };

  /* ================= SMC / ICT ================= */
  A.swings = (cs, n = 3) => {
    const out = [];
    for (let i = n; i < cs.length - n; i++) {
      let hi = true, lo = true;
      for (let j = 1; j <= n; j++) {
        if (cs[i].h <= cs[i - j].h || cs[i].h <= cs[i + j].h) hi = false;
        if (cs[i].l >= cs[i - j].l || cs[i].l >= cs[i + j].l) lo = false;
      }
      if (hi) out.push({ i, p: cs[i].h, type: "H" });
      if (lo) out.push({ i, p: cs[i].l, type: "L" });
    }
    return out;
  };

  A.structure = (cs, sw) => {
    const H = sw.filter((s) => s.type === "H"), L = sw.filter((s) => s.type === "L");
    const price = last(cs).c;
    let trend = "range";
    if (H.length >= 2 && L.length >= 2) {
      const hh = last(H).p > last(H, 2).p, hl = last(L).p > last(L, 2).p;
      if (hh && hl) trend = "bull";
      else if (!hh && !hl) trend = "bear";
    }
    let event = null;
    const lastH = H.length ? last(H) : null, lastL = L.length ? last(L) : null;
    const look = Math.max(0, cs.length - 10);
    if (lastH) {
      const from = Math.max(lastH.i + 1, look);
      for (let i = from; i < cs.length; i++) if (cs[i].c > lastH.p) { event = { dir: 1, kind: trend === "bear" ? "CHOCH" : "BOS", level: lastH.p, age: cs.length - 1 - i }; break; }
    }
    if (lastL) {
      const from = Math.max(lastL.i + 1, look);
      for (let i = from; i < cs.length; i++) if (cs[i].c < lastL.p) {
        const ev = { dir: -1, kind: trend === "bull" ? "CHOCH" : "BOS", level: lastL.p, age: cs.length - 1 - i };
        if (!event || ev.age < event.age) event = ev;
        break;
      }
    }
    return { trend, event, lastH, lastL, price };
  };

  A.fvgs = (cs, atr) => {
    const out = [];
    for (let i = 2; i < cs.length; i++) {
      const a = cs[i - 2], c = cs[i];
      let g = null;
      if (a.h < c.l) g = { dir: 1, lo: a.h, hi: c.l, i };
      else if (a.l > c.h) g = { dir: -1, lo: c.h, hi: a.l, i };
      if (!g || g.hi - g.lo < 0.1 * atr) continue;
      let filled = false;
      for (let j = i + 1; j < cs.length; j++) {
        if (g.dir === 1 && cs[j].l <= g.lo) { filled = true; break; }
        if (g.dir === -1 && cs[j].h >= g.hi) { filled = true; break; }
      }
      if (!filled) out.push(g);
    }
    return out.slice(-8);
  };

  A.orderBlocks = (cs, atrArr) => {
    const out = [];
    const start = Math.max(1, cs.length - 200);
    for (let i = start; i < cs.length - 3; i++) {
      const a = atrArr[i] || atrArr.find((x) => x) || 1;
      const bear = cs[i].c < cs[i].o, bull = cs[i].c > cs[i].o;
      const nx = cs.slice(i + 1, i + 4);
      if (bear && cs[i + 1].c > cs[i + 1].o && Math.max(...nx.map((x) => x.h)) - cs[i].h > 1.2 * a)
        out.push({ dir: 1, lo: cs[i].l, hi: cs[i].h, i });
      else if (bull && cs[i + 1].c < cs[i + 1].o && cs[i].l - Math.min(...nx.map((x) => x.l)) > 1.2 * a)
        out.push({ dir: -1, lo: cs[i].l, hi: cs[i].h, i });
    }
    return out
      .filter((ob) => {
        for (let j = ob.i + 4; j < cs.length; j++) {
          if (ob.dir === 1 && cs[j].c < ob.lo) return false;
          if (ob.dir === -1 && cs[j].c > ob.hi) return false;
        }
        return true;
      })
      .slice(-6);
  };

  A.liquidity = (cs, sw, atr) => {
    const H = sw.filter((s) => s.type === "H").slice(-10), L = sw.filter((s) => s.type === "L").slice(-10);
    const tol = 0.15 * atr;
    const eqh = [], eql = [];
    for (let a = 0; a < H.length; a++) for (let b = a + 1; b < H.length; b++)
      if (Math.abs(H[a].p - H[b].p) <= tol) {
        const lvl = (H[a].p + H[b].p) / 2;
        const swept = cs.slice(H[b].i + 1).some((x) => x.h > lvl + tol);
        if (!swept) eqh.push({ level: lvl });
      }
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++)
      if (Math.abs(L[a].p - L[b].p) <= tol) {
        const lvl = (L[a].p + L[b].p) / 2;
        const swept = cs.slice(L[b].i + 1).some((x) => x.l < lvl - tol);
        if (!swept) eql.push({ level: lvl });
      }
    // كنس السيولة في آخر 5 شموع
    let sweep = null;
    const n = cs.length;
    for (let k = n - 1; k >= n - 5 && !sweep; k--) {
      const c = cs[k];
      for (const s of sw.filter((x) => x.i < k - 1 && x.i > k - 50).reverse()) {
        if (s.type === "H" && c.h > s.p && c.c < s.p) { sweep = { dir: -1, level: s.p, age: n - 1 - k }; break; }
        if (s.type === "L" && c.l < s.p && c.c > s.p) { sweep = { dir: 1, level: s.p, age: n - 1 - k }; break; }
      }
    }
    return { eqh: eqh.slice(-3), eql: eql.slice(-3), sweep };
  };

  A.premiumDiscount = (cs, sw) => {
    const rec = sw.filter((s) => s.i > cs.length - 80);
    const hs = rec.filter((s) => s.type === "H"), ls = rec.filter((s) => s.type === "L");
    const hi = hs.length ? Math.max(...hs.map((s) => s.p)) : Math.max(...cs.slice(-80).map((x) => x.h));
    const lo = ls.length ? Math.min(...ls.map((s) => s.p)) : Math.min(...cs.slice(-80).map((x) => x.l));
    const price = last(cs).c;
    const eq = (hi + lo) / 2;
    return { hi, lo, eq, pos: hi === lo ? 0.5 : clamp((price - lo) / (hi - lo), 0, 1), zone: price > eq ? "premium" : "discount" };
  };

  A.divergence = (cs, rsi, sw) => {
    const n = cs.length;
    const H = sw.filter((s) => s.type === "H" && rsi[s.i] != null).slice(-2);
    const L = sw.filter((s) => s.type === "L" && rsi[s.i] != null).slice(-2);
    if (L.length === 2 && n - 1 - L[1].i <= 30 && L[1].p < L[0].p && rsi[L[1].i] > rsi[L[0].i] + 1)
      return { dir: 1, text: "دايفرجنس صاعد (قاع أدنى بسعر وأعلى بالـRSI)" };
    if (H.length === 2 && n - 1 - H[1].i <= 30 && H[1].p > H[0].p && rsi[H[1].i] < rsi[H[0].i] - 1)
      return { dir: -1, text: "دايفرجنس هابط (قمة أعلى بسعر وأدنى بالـRSI)" };
    return null;
  };

  A.fibonacci = (cs) => {
    const sl = cs.slice(-100);
    let hiI = 0, loI = 0;
    sl.forEach((x, i) => { if (x.h > sl[hiI].h) hiI = i; if (x.l < sl[loI].l) loI = i; });
    const hi = sl[hiI].h, lo = sl[loI].l, up = loI < hiI;
    const r = hi - lo;
    const lv = (f) => (up ? hi - r * f : lo + r * f);
    return {
      dir: up ? 1 : -1, hi, lo,
      levels: [0.236, 0.382, 0.5, 0.618, 0.786].map((f) => ({ f, p: lv(f) })),
      ext: [1.272, 1.618].map((f) => ({ f, p: up ? lo + r * f : hi - r * f })),
    };
  };

  A.pivots = (c) => {
    const P = (c.h + c.l + c.c) / 3, r = c.h - c.l;
    return { P, R1: 2 * P - c.l, R2: P + r, R3: c.h + 2 * (P - c.l), S1: 2 * P - c.h, S2: P - r, S3: c.l - 2 * (c.h - P) };
  };

  A.supportResistance = (sw, price, atr) => {
    const pts = sw.map((s) => s.p).sort((a, b) => a - b);
    const cl = [];
    pts.forEach((p) => {
      const c = cl.find((x) => Math.abs(x.p - p) <= 0.5 * atr);
      if (c) { c.p = (c.p * c.n + p) / (c.n + 1); c.n++; } else cl.push({ p, n: 1 });
    });
    const above = cl.filter((x) => x.p > price).sort((a, b) => a.p - b.p).slice(0, 3);
    const below = cl.filter((x) => x.p <= price).sort((a, b) => b.p - a.p).slice(0, 3);
    return { resistance: above, support: below };
  };

  /* ================= الأنماط ================= */
  A.candlePatterns = (cs, atr) => {
    const out = [];
    const n = cs.length;
    for (let age = 0; age < 3; age++) {
      const i = n - 1 - age;
      if (i < 6) break;
      const x = cs[i], p = cs[i - 1];
      const body = Math.abs(x.c - x.o), range = x.h - x.l || 1e-9;
      const up = x.h - Math.max(x.o, x.c), lw = Math.min(x.o, x.c) - x.l;
      const downtrend = cs[i - 1].c < cs[i - 5].c, uptrend = cs[i - 1].c > cs[i - 5].c;
      const push = (name, dir) => out.push({ name, dir, age });
      if (body <= 0.1 * range) push("دوجي (تردد)", 0);
      if (body >= 0.85 * range && range > 0.8 * atr) push(x.c > x.o ? "ماروبوزو صاعد" : "ماروبوزو هابط", x.c > x.o ? 1 : -1);
      if (body > 0 && lw >= 2 * body && up <= 0.35 * body + 0.05 * range && downtrend) push("مطرقة (Hammer)", 1);
      if (body > 0 && up >= 2 * body && lw <= 0.35 * body + 0.05 * range && uptrend) push("نجمة الرجم (Shooting Star)", -1);
      if (body <= range / 3 && lw >= (2 / 3) * range) push("بين بار صاعد", 1);
      if (body <= range / 3 && up >= (2 / 3) * range) push("بين بار هابط", -1);
      if (p.c < p.o && x.c > x.o && x.o <= p.c && x.c >= p.o) push("ابتلاع صاعد", 1);
      if (p.c > p.o && x.c < x.o && x.o >= p.c && x.c <= p.o) push("ابتلاع هابط", -1);
    }
    return out;
  };

  A.chartPatterns = (cs, sw, atr) => {
    const out = [];
    const n = cs.length, price = last(cs).c;
    const H = sw.filter((s) => s.type === "H"), L = sw.filter((s) => s.type === "L");
    const lowBetween = (a, b) => Math.min(...cs.slice(a.i, b.i + 1).map((x) => x.l));
    const highBetween = (a, b) => Math.max(...cs.slice(a.i, b.i + 1).map((x) => x.h));
    if (H.length >= 2) {
      const a = last(H, 2), b = last(H);
      if (n - b.i < 60 && Math.abs(a.p - b.p) <= 0.6 * atr && b.i - a.i >= 5) {
        const neck = lowBetween(a, b);
        out.push({ name: "قمة مزدوجة", dir: -1, status: price < neck ? "مكتمل (كسر خط العنق)" : "قيد التشكل", level: neck });
      }
    }
    if (L.length >= 2) {
      const a = last(L, 2), b = last(L);
      if (n - b.i < 60 && Math.abs(a.p - b.p) <= 0.6 * atr && b.i - a.i >= 5) {
        const neck = highBetween(a, b);
        out.push({ name: "قاع مزدوج", dir: 1, status: price > neck ? "مكتمل (كسر خط العنق)" : "قيد التشكل", level: neck });
      }
    }
    if (H.length >= 3) {
      const [s1, hd, s2] = H.slice(-3);
      if (n - s2.i < 80 && hd.p > s1.p && hd.p > s2.p && Math.abs(s1.p - s2.p) <= 1.2 * atr) {
        const neck = (lowBetween(s1, hd) + lowBetween(hd, s2)) / 2;
        out.push({ name: "رأس وكتفين", dir: -1, status: price < neck ? "مكتمل" : "قيد التشكل", level: neck });
      }
    }
    if (L.length >= 3) {
      const [s1, hd, s2] = L.slice(-3);
      if (n - s2.i < 80 && hd.p < s1.p && hd.p < s2.p && Math.abs(s1.p - s2.p) <= 1.2 * atr) {
        const neck = (highBetween(s1, hd) + highBetween(hd, s2)) / 2;
        out.push({ name: "رأس وكتفين معكوس", dir: 1, status: price > neck ? "مكتمل" : "قيد التشكل", level: neck });
      }
    }
    return out;
  };

  /* ================= التحليل الكامل لإطار واحد ================= */
  A.analyze = (cs, tf, dailyCs) => {
    if (!cs || cs.length < 60) throw new Error("بيانات غير كافية");
    const close = cs.map((x) => x.c);
    const price = last(close);
    const n = cs.length;

    const e9 = A.ema(close, 9), e21 = A.ema(close, 21), e50 = A.ema(close, 50), e200 = A.ema(close, 200);
    const rsiA = A.rsi(close, 14);
    const atrA = A.atr(cs, 14);
    const atr = last(atrA);
    const mac = A.macd(close);
    const bb = A.bollinger(close);
    const st = A.stoch(cs);
    const sup = A.supertrend(cs);
    const adx = A.adx(cs);
    const vwap = A.vwap(cs, tf);
    const sw = A.swings(cs, 3);
    const struct = A.structure(cs, sw);
    const fvg = A.fvgs(cs, atr);
    const ob = A.orderBlocks(cs, atrA);
    const liq = A.liquidity(cs, sw, atr);
    const pd = A.premiumDiscount(cs, sw);
    const div = A.divergence(cs, rsiA, sw);
    const fib = A.fibonacci(cs);
    const piv = A.pivots(dailyCs && dailyCs.length > 2 ? dailyCs[dailyCs.length - 2] : cs[n - 2]);
    const sr = A.supportResistance(sw, price, atr);
    const candlePat = A.candlePatterns(cs, atr);
    const chartPat = A.chartPatterns(cs, sw, atr);

    const rsi = last(rsiA);
    const volAvg = sum(cs.slice(-21, -1).map((x) => x.v)) / 20;
    const lastC = last(cs);

    /* ---- نقاط المؤشرات الـ17 (المؤشر 17 MTF يُضاف لاحقاً) ---- */
    const I = [];
    const add = (id, name, w, s, text, value) => I.push({ id, name, w, s: clamp(s, -1, 1), text, value });

    const l9 = last(e9), l21 = last(e21), l50 = last(e50), l200 = last(e200);
    let s1 = 0;
    if (l9 > l21 && l21 > l50) s1 = 1; else if (l9 < l21 && l21 < l50) s1 = -1;
    else s1 = l9 > l21 ? 0.35 : -0.35;
    add(1, "ترتيب EMA (9/21/50)", 3, s1, s1 > 0.5 ? "ترتيب صاعد" : s1 < -0.5 ? "ترتيب هابط" : "ترتيب مختلط", `${l9.toFixed(2)} / ${l21.toFixed(2)} / ${l50.toFixed(2)}`);

    add(2, "السعر مقابل EMA 200", 2, price > l200 ? 1 : -1, price > l200 ? "فوق EMA200" : "تحت EMA200", l200.toFixed(2));

    let s3 = 0;
    if (rsi >= 70) s3 = -0.8; else if (rsi >= 60) s3 = 0.5; else if (rsi >= 50) s3 = 0.3;
    else if (rsi >= 40) s3 = -0.3; else if (rsi >= 30) s3 = -0.5; else s3 = 0.8;
    add(3, "RSI (14)", 2, s3, rsi >= 70 ? "تشبع شراء" : rsi <= 30 ? "تشبع بيع" : rsi >= 50 ? "زخم إيجابي" : "زخم سلبي", rsi.toFixed(1));

    const mL = last(mac.line), mS = last(mac.signal), mH = last(mac.hist), mH1 = last(mac.hist, 2);
    const s4 = (mL > mS ? 0.5 : -0.5) + (mH > mH1 ? 0.3 : -0.3) + (mL > 0 ? 0.2 : -0.2);
    add(4, "MACD", 2, s4, mL > mS ? "فوق خط الإشارة" : "تحت خط الإشارة", `هيستوغرام ${mH.toFixed(3)}`);

    const pb = last(bb.pb);
    let s5 = 0;
    if (pb < 0.05) s5 = 0.8; else if (pb < 0.2) s5 = 0.4; else if (pb > 0.95) s5 = -0.8; else if (pb > 0.8) s5 = -0.4; else s5 = (pb - 0.5) * 0.4;
    add(5, "Bollinger %B", 1.5, s5, pb > 0.95 ? "عند الحد العلوي" : pb < 0.05 ? "عند الحد السفلي" : "داخل النطاق", `%B ${(pb * 100).toFixed(0)}`);

    const K = last(st.k), D = last(st.d);
    let s6 = 0;
    if (K < 20 && K > D) s6 = 1; else if (K < 20) s6 = 0.5; else if (K > 80 && K < D) s6 = -1; else if (K > 80) s6 = -0.5; else s6 = K > D ? 0.2 : -0.2;
    add(6, "Stochastic", 1.5, s6, K < 20 ? "تشبع بيع" : K > 80 ? "تشبع شراء" : "محايد", `K ${K.toFixed(0)} / D ${D.toFixed(0)}`);

    const stDir = last(sup.trend);
    const flipped = sup.trend.slice(-4).some((x, i, a) => i > 0 && x !== a[i - 1]);
    add(7, "SuperTrend", 2, stDir * (flipped ? 1 : 0.85), stDir > 0 ? "اتجاه صاعد" : "اتجاه هابط", (last(sup.line) || 0).toFixed(2) + (flipped ? " (انعكاس حديث)" : ""));

    add(8, "VWAP", 1.5, price > vwap ? 0.7 : -0.7, price > vwap ? "السعر فوق VWAP" : "السعر تحت VWAP", vwap.toFixed(2));

    add(9, "هيكل السوق", 3, struct.trend === "bull" ? 1 : struct.trend === "bear" ? -1 : 0, struct.trend === "bull" ? "قمم وقيعان أعلى" : struct.trend === "bear" ? "قمم وقيعان أدنى" : "نطاق جانبي", "");

    let s10 = 0, t10 = "لا كسر حديث";
    if (struct.event) {
      const e = struct.event;
      s10 = e.dir * (e.kind === "CHOCH" ? 1 : 0.8) * (e.age <= 3 ? 1 : 0.7);
      t10 = `${e.kind} ${e.dir > 0 ? "صاعد" : "هابط"} منذ ${e.age} شمعة`;
    }
    add(10, "BOS / CHOCH", 2, s10, t10, struct.event ? struct.event.level.toFixed(2) : "");

    let s11 = 0, t11 = "لا فجوات قريبة";
    for (const g of fvg) {
      const inside = price >= g.lo && price <= g.hi;
      const dist = g.dir === 1 ? price - g.hi : g.lo - price;
      if (inside || (dist >= 0 && dist <= 2 * atr)) {
        s11 += g.dir * (inside ? 1 : 0.8);
        t11 = inside ? "السعر داخل FVG" : "FVG قريب";
      }
    }
    add(11, "FVG قريب", 1.5, s11, t11, "");

    let s12 = 0, t12 = "لا بلوك قريب";
    for (const o of ob) {
      const inside = price >= o.lo && price <= o.hi;
      const dist = o.dir === 1 ? price - o.hi : o.lo - price;
      if (inside || (dist >= 0 && dist <= 2 * atr)) {
        s12 += o.dir * (inside ? 1 : 0.8);
        t12 = inside ? "السعر داخل Order Block" : "Order Block قريب";
      }
    }
    add(12, "Order Block قريب", 1.5, s12, t12, "");

    add(13, "كنس السيولة", 2.5, liq.sweep ? liq.sweep.dir * (liq.sweep.age <= 1 ? 1 : 0.7) : 0,
      liq.sweep ? (liq.sweep.dir > 0 ? "كنس قيعان ثم ارتداد" : "كنس قمم ثم رفض") : "لا كنس حديث", liq.sweep ? liq.sweep.level.toFixed(2) : "");

    add(14, "دايفرجنس RSI", 2.5, div ? div.dir : 0, div ? div.text : "لا دايفرجنس", "");

    const dirC = lastC.c >= lastC.o ? 1 : -1;
    const vr = volAvg ? lastC.v / volAvg : 1;
    add(15, "الحجم", 1, vr > 1.5 ? dirC : vr > 1 ? dirC * 0.5 : dirC * 0.2, vr > 1.5 ? "حجم مرتفع" : vr > 1 ? "حجم فوق المتوسط" : "حجم ضعيف", `${vr.toFixed(2)}×`);

    const ADX = last(adx.adx), PD = last(adx.pdi), MD = last(adx.mdi);
    add(16, "ADX قوة الاتجاه", 1.5, ADX > 25 ? Math.sign(PD - MD) * Math.min(1, ADX / 40) : 0,
      ADX > 25 ? (PD > MD ? "اتجاه صاعد قوي" : "اتجاه هابط قوي") : "اتجاه ضعيف", ADX.toFixed(1));

    add(18, "Premium / Discount", 1.5, pd.pos < 0.3 ? 0.8 : pd.pos < 0.5 ? 0.3 : pd.pos > 0.7 ? -0.8 : -0.3,
      pd.zone === "discount" ? "منطقة خصم (رخيص)" : "منطقة علاوة (غالي)", `${(pd.pos * 100).toFixed(0)}%`);

    const baseW = sum(I.map((x) => x.w));
    const baseScore = (sum(I.map((x) => x.w * x.s)) / baseW) * 100;

    return {
      tf, price, atr, candles: cs, last: lastC,
      ind: I, baseScore,
      raw: { rsi, adx: ADX, vwap, stochK: K, stochD: D, macd: { line: mL, signal: mS, hist: mH }, bb: { pb, up: last(bb.up), lo: last(bb.lo), mid: last(bb.mid) }, ema: { e9: l9, e21: l21, e50: l50, e200: l200 }, supertrend: { dir: stDir, line: last(sup.line) } },
      series: { e21, e50, e200, bbUp: bb.up, bbLo: bb.lo },
      structure: struct, swings: sw, fvg, ob, liquidity: liq, pd, divergence: div, fib, pivots: piv, sr,
      candlePatterns: candlePat, chartPatterns: chartPat,
    };
  };

  /* ================= دمج الأطر + المحرك النهائي ================= */
  A.signalLabel = (s) => {
    if (s >= 45) return { text: "شراء قوي", cls: "sbuy2", dir: 1 };
    if (s >= 20) return { text: "شراء", cls: "sbuy", dir: 1 };
    if (s >= 10) return { text: "ميل صاعد", cls: "lbuy", dir: 0 };
    if (s <= -45) return { text: "بيع قوي", cls: "ssell2", dir: -1 };
    if (s <= -20) return { text: "بيع", cls: "ssell", dir: -1 };
    if (s <= -10) return { text: "ميل هابط", cls: "lsell", dir: 0 };
    return { text: "محايد", cls: "neutral", dir: 0 };
  };

  A.confluence = (main, mtfMap) => {
    const tfs = Object.keys(mtfMap);
    const scores = tfs.map((k) => mtfMap[k].baseScore);
    const avg = sum(scores) / scores.length;
    const aligned = scores.filter((s) => Math.sign(s) === Math.sign(avg) && Math.abs(s) >= 10).length;
    const s17 = clamp(avg / 50, -1, 1) * (aligned === scores.length ? 1 : 0.7);
    const mtfInd = {
      id: 17, name: "توافق الأطر الزمنية", w: 3, s: s17,
      text: aligned === scores.length ? "كل الأطر متفقة" : `${aligned}/${scores.length} أطر متفقة`,
      value: tfs.map((k) => `${k}:${mtfMap[k].baseScore.toFixed(0)}`).join(" "),
    };
    const ind = [...main.ind, mtfInd].sort((a, b) => a.id - b.id);
    const W = sum(ind.map((x) => x.w));
    const score = (sum(ind.map((x) => x.w * x.s)) / W) * 100;
    const dirSign = Math.sign(score);
    const active = ind.filter((x) => Math.abs(x.s) >= 0.15);
    const agreeW = sum(active.filter((x) => Math.sign(x.s) === dirSign).map((x) => x.w));
    const actW = sum(active.map((x) => x.w)) || 1;
    const agree = agreeW / actW;
    const conf = Math.round(clamp(30 + Math.abs(score) * 0.55 + (agree - 0.5) * 50 + (aligned === scores.length ? 8 : 0), 5, 95));
    const label = A.signalLabel(score);
    return {
      score, label, confidence: conf, agree, ind, aligned, total: scores.length,
      bull: ind.filter((x) => x.s >= 0.15).length, bear: ind.filter((x) => x.s <= -0.15).length,
      mtf: tfs.map((k) => ({ tf: k, score: mtfMap[k].baseScore, label: A.signalLabel(mtfMap[k].baseScore), price: mtfMap[k].price })),
    };
  };

  A.tradePlan = (main, conf) => {
    const price = main.price, atr = main.atr;
    const dir = conf.score >= 10 ? 1 : conf.score <= -10 ? -1 : 0;
    if (!dir) return { dir: 0 };
    const strong = Math.abs(conf.score) >= 20;
    // وقف الخسارة: الأقصى بين 1.5 ATR وهيكل السوق (بحد 3 ATR)
    let slDist = 1.5 * atr;
    const struct = dir === 1 ? main.structure.lastL : main.structure.lastH;
    if (struct) {
      const d = Math.abs(price - struct.p) + 0.2 * atr;
      if (d > slDist && d <= 3 * atr) slDist = d;
    }
    const entry = price;
    const sl = entry - dir * slDist;
    const tp = [2, 3.5, 5].map((m) => entry + dir * m * atr);
    const rr = tp.map((t) => Math.abs(t - entry) / slDist);
    // دخول بديل (ارتداد) من أقرب OB/FVG بنفس الاتجاه
    const zones = [...main.ob, ...main.fvg].filter((z) => z.dir === dir && (dir === 1 ? z.hi < price : z.lo > price));
    zones.sort((a, b) => (dir === 1 ? b.hi - a.hi : a.lo - b.lo));
    const z = zones[0];
    const limit = z ? (dir === 1 ? z.hi : z.lo) : null;
    const limitSL = limit != null ? limit - dir * Math.max(1.2 * atr, 0) : null;
    return { dir, strong, entry, sl, slDist, tp, rr, limit, limitSL, atr };
  };

  root.Analysis = A;
  if (typeof module !== "undefined") module.exports = A;
})(typeof window !== "undefined" ? window : globalThis);
