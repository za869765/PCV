// 產生書籤：node tools/build.js → vax-helper/bookmarklet.txt（書籤網址）＋ install.html（拖曳安裝頁）
// 「💉 疫苗掛號助手」＝ niis-lastdose.js（NIIS 端）＋ quick-lookup.js（掛號平台端）合併成同一個書籤：
//   在掛號平台（Vue #app）點 → 跑平台端；其他（NIIS）→ 跑 NIIS 端
const fs = require('fs');
const path = require('path');

const TITLE = '💉 疫苗掛號助手';
const NAME = '疫苗掛號助手';
const COLOR = '#00796b,#1565c0';

// 去掉區塊註解與整行註解（字串內的 // 不受影響：只刪「行首空白＋//」的整行）
function strip(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/)
        .filter(l => !/^\s*\/\//.test(l))
        .map(l => l.replace(/\s+\/\/ [^'"]*$/, ''))   // 行尾註解（該段不含引號才刪，避免誤刪字串）
        .map(l => l.trim())
        .filter(Boolean)
        .join('\n');
}
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const niisSrc = read('niis-lastdose/niis-lastdose.js');
const code = '(function () {\n' +
    "var app = document.querySelector('#app');\n" +
    "if (!/niis/i.test(location.host) && app && app.__vue__) {\n" + strip(read('quick-lookup/quick-lookup.js')) + '\n} else {\n' + strip(niisSrc) + '\n}\n' +
    '})();';

new Function(code);   // 語法檢查
const bookmarklet = 'javascript:' + encodeURIComponent(code);
const ver = (niisSrc.match(/VERSION = '([^']+)'/) || [])[1] || '';
const out = path.join(__dirname, 'vax-helper');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'bookmarklet.txt'), bookmarklet);

const html = `<!doctype html>
<html lang="zh-TW"><head><meta charset="utf-8"><title>${NAME} 書籤安裝</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#1e293b;line-height:1.8;font-size:17px}
.bm{display:inline-block;background:linear-gradient(135deg,${COLOR});color:#fff;padding:14px 26px;border-radius:12px;font-size:20px;font-weight:700;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.2)}
code{background:#e2e8f0;padding:1px 6px;border-radius:4px}
.warn{display:none;color:#b91c1c;font-weight:700}
.cp{border:none;border-radius:8px;padding:4px 12px;background:#475569;color:#fff;font:inherit;font-size:14px;cursor:pointer}
.sub{color:#64748b;font-size:14px}
</style></head><body>
<h1>${TITLE} <span class="sub">${ver}</span></h1>
<p>按 <code>Ctrl＋Shift＋B</code> → 把按鈕<b>拖到書籤列</b>。</p>
<p><a class="bm" id="bm" href="${bookmarklet.replace(/"/g, '&quot;')}">${TITLE}</a></p>
<p class="warn" id="warn">⚠ 請用拖的，不是點。</p>
<p class="sub">拖不上去：<button class="cp" id="cp">📋 複製網址</button> → 書籤列按右鍵「新增網頁」貼上</p>
<p>NIIS 和掛號平台<b>各點一次</b>即可。</p>
<script>
document.getElementById('bm').addEventListener('click', function (e) { e.preventDefault(); document.getElementById('warn').style.display = 'block'; });
document.getElementById('cp').addEventListener('click', function () {
    var b = this;
    navigator.clipboard.writeText(document.getElementById('bm').href).then(function () { b.textContent = '✅ 已複製'; }, function () { b.textContent = '複製失敗'; });
});
</script>
</body></html>`;
fs.writeFileSync(path.join(out, 'install.html'), html);
console.log('vax-helper', ver, '| bookmarklet chars:', bookmarklet.length);
