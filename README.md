# محلل الذهب والبتكوين (SMC/ICT + محرك تلاقي 18 مؤشر + MTF)

## النشر (الأسهل)
1. Cloudflare Dashboard → Workers & Pages → Create Worker
2. الصق محتوى `src/worker.js` بالكامل (ملف واحد جاهز، فيه الواجهة والـ API) → Deploy

## النشر عبر الطرفية
```
npm install -g wrangler
wrangler deploy
```

## التطوير
- `npm test` — اختبارات المحرك
- `npm run build` — يولّد `src/worker.js` من `public/*` و `src/worker.template.js`
- `npm run dev` — تشغيل محلي

## مصادر البيانات (تلقائياً بالترتيب)
Binance → Binance Vision → Bybit → Kraken (إذا حُجب مصدر يُستخدم التالي)
الذهب = PAXG (مدعوم بالذهب الفعلي، قد يختلف قليلاً عن XAUUSD).

> أداة تحليل فني وليست نصيحة مالية.
