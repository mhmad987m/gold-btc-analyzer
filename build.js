// يدمج public/index.html + analysis.js + app.js داخل src/worker.js (ملف واحد)
const fs = require("fs");
const path = require("path");
const r = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");

let html = r("public/index.html");
const inline = (name) => `<script>\n${r("public/" + name)}\n</script>`;
html = html.replace('<script src="analysis.js"></script>', () => inline("analysis.js"));
html = html.replace('<script src="app.js"></script>', () => inline("app.js"));
if (html.includes('src="analysis.js"') || html.includes('src="app.js"')) throw new Error("فشل دمج السكربتات");

const worker = r("src/worker.template.js").replace("__HTML__", () => JSON.stringify(html));
fs.writeFileSync(path.join(__dirname, "src/worker.js"), worker);
console.log(`src/worker.js تم (${(worker.length / 1024).toFixed(1)} KB)`);
