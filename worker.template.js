// Cloudflare Worker: يخدم الواجهة + بروكسي للبيانات (يتجاوز CORS ويجرّب عدة مصادر)
// هذا الملف هو القالب؛ شغّل `npm run build` لتوليد src/worker.js (ملف واحد جاهز للصق في لوحة Cloudflare)

const HTML = __HTML__;

const SYMBOLS = {
  BTCUSDT: { kraken: "XBTUSD" },
  PAXGUSDT: { kraken: "PAXGUSD" }, // PAX Gold = أونصة ذهب
  ETHUSDT: { kraken: "ETHUSD" },
};
const INTERVALS = {
  "15m": { binance: "15m", bybit: "15", kraken: 15 },
  "1h": { binance: "1h", bybit: "60", kraken: 60 },
  "4h": { binance: "4h", bybit: "240", kraken: 240 },
  "1d": { binance: "1d", bybit: "D", kraken: 1440 },
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...extra },
  });

async function getJSON(url) {
  const r = await fetch(url, { headers: { "user-agent": "gold-btc-analyzer/1.0", accept: "application/json" } });
  if (!r.ok) throw new Error(`${new URL(url).host} -> ${r.status}`);
  return r.json();
}

const num = (x) => parseFloat(x);

const sources = {
  async binance(sym, iv, limit) {
    return (await getJSON(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${iv.binance}&limit=${limit}`)).map(
      (k) => ({ t: k[0], o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]) })
    );
  },
  async binanceVision(sym, iv, limit) {
    return (await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${iv.binance}&limit=${limit}`)).map(
      (k) => ({ t: k[0], o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]) })
    );
  },
  async bybit(sym, iv, limit) {
    const d = await getJSON(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${iv.bybit}&limit=${limit}`);
    if (d.retCode !== 0 || !d.result?.list?.length) throw new Error("bybit empty");
    return d.result.list.map((k) => ({ t: num(k[0]), o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[5]) })).reverse();
  },
  async kraken(sym, iv, limit) {
    const pair = SYMBOLS[sym].kraken;
    const d = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${iv.kraken}`);
    if (d.error?.length) throw new Error("kraken " + d.error[0]);
    const key = Object.keys(d.result).find((k) => k !== "last");
    return d.result[key].map((k) => ({ t: k[0] * 1000, o: num(k[1]), h: num(k[2]), l: num(k[3]), c: num(k[4]), v: num(k[6]) })).slice(-limit);
  },
};

async function klines(sym, ivKey, limit) {
  const iv = INTERVALS[ivKey];
  const errors = [];
  for (const name of ["binance", "binanceVision", "bybit", "kraken"]) {
    try {
      const data = await sources[name](sym, iv, limit);
      if (data.length >= 60) return { source: name, candles: data };
      errors.push(`${name}: قليل`);
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  throw new Error("تعذر جلب البيانات: " + errors.join(" | "));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS")
      return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET", "access-control-allow-headers": "*" } });

    if (url.pathname === "/api/klines") {
      const sym = (url.searchParams.get("symbol") || "").toUpperCase();
      const ivKey = url.searchParams.get("interval") || "1h";
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 60), 1000);
      if (!SYMBOLS[sym]) return json({ error: "رمز غير مدعوم" }, 400);
      if (!INTERVALS[ivKey]) return json({ error: "إطار زمني غير مدعوم" }, 400);

      const cache = caches.default;
      const cacheKey = new Request(url.toString(), { method: "GET" });
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
      try {
        const out = await klines(sym, ivKey, limit);
        const res = json({ symbol: sym, interval: ivKey, ...out }, 200, { "cache-control": "public, max-age=15" });
        ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      } catch (e) {
        return json({ error: String(e.message || e) }, 502);
      }
    }

    if (url.pathname === "/api/health") return json({ ok: true, time: Date.now() });

    return new Response(HTML, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "x-content-type-options": "nosniff" },
    });
  },
};
