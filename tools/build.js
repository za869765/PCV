// 產生書籤：node tools/build.js → 各工具資料夾的 bookmarklet.txt（書籤網址）＋ install.html（拖曳安裝頁）
const fs = require('fs');
const path = require('path');

const TOOLS = [
    {
        dir: 'quick-lookup', file: 'quick-lookup.js', title: '⚡ 快速掛號', color: '#c62828,#5e35b1',
        usage: [
            '登入臺南市流感疫苗預約平台 → 進入「報到作業」→ 選好日期與場次。',
            '點書籤列上的「⚡ 快速掛號」，右上角出現面板。',
            '點選類別（Flu／XFG…，會保留，連續掛同類不用重選）。',
            '輸入身分證按 Enter：未掛 → 自動打開「現場掛號」並填好身分證＋類別，<b>檢查後由你按確認</b>；已掛 → 顯示已掛類別與報到狀態。',
            '從「💉 NIIS 最近接種」書籤複製來的「身分證＋類別」，在輸入框按 Ctrl+V 即可（類別只套用這一位）。',
            '再點一次書籤＝關閉面板。'
        ],
        safety: '不會自行送出任何掛號／報到／退掛（只幫忙填好平台的現場掛號視窗，送出由你按）；不讀取或保存帳號密碼；不自行呼叫平台 API；不連線外部網站；不保存民眾資料（關閉即清除）；全部程式碼都在書籤內，可由資訊人員檢視 <code>quick-lookup.js</code>。'
    },
    {
        dir: 'niis-lastdose', file: 'niis-lastdose.js', title: '💉 NIIS 最近接種', color: '#00796b,#1565c0',
        usage: [
            '在 NIIS 讀健保卡，進入個案的「預防接種登錄」頁（有接種紀錄表）。',
            '點書籤列上的「💉 NIIS 最近接種」，面板列出新冠／流感最近一次接種日、距今天數、流感本季是否已打。',
            '點選要掛的類別（例：Flu＋XFG），按「📋 複製」。',
            '切到掛號平台，在「⚡ 快速掛號」輸入框按 Ctrl+V → 自動開好現場掛號視窗，由你按確認。',
            '換下一位時面板會自動更新，不用再點；再點一次書籤＝關閉。'
        ],
        safety: '完全唯讀（只讀畫面上的接種紀錄表，不點擊、不送出、不修改 NIIS 資料）；不讀取或保存帳號密碼；不呼叫任何 API；不連線外部網站；只在你按「複製」時把「身分證＋類別代號」放到本機剪貼簿；全部程式碼都在書籤內，可由資訊人員檢視 <code>niis-lastdose.js</code>。'
    }
];

TOOLS.forEach(function (t) {
    const dir = path.join(__dirname, t.dir);
    const src = fs.readFileSync(path.join(dir, t.file), 'utf8');

    // 去掉區塊註解與整行註解（字串內的 // 不受影響：只刪「行首空白＋//」的整行）
    const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter(l => !/^\s*\/\//.test(l))
        .map(l => l.replace(/\s+\/\/ [^'"]*$/, ''))   // 行尾註解（該段不含引號才刪，避免誤刪字串）
        .map(l => l.trim())
        .filter(Boolean)
        .join('\n');

    new Function(code);   // 語法檢查
    const bookmarklet = 'javascript:' + encodeURIComponent(code);
    fs.writeFileSync(path.join(dir, 'bookmarklet.txt'), bookmarklet);

    const ver = (src.match(/VERSION = '([^']+)'/) || [])[1] || '';
    const html = `<!doctype html>
<html lang="zh-TW"><head><meta charset="utf-8"><title>${t.title.replace(/^\S+\s/, '')} 書籤安裝</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#1e293b;line-height:1.7}
.bm{display:inline-block;background:linear-gradient(135deg,${t.color});color:#fff;padding:12px 22px;border-radius:12px;font-size:18px;font-weight:700;text-decoration:none;box-shadow:0 6px 18px rgba(0,0,0,.2)}
.box{background:#f1f5f9;border-radius:10px;padding:12px 16px;margin:16px 0}
code{background:#e2e8f0;padding:1px 6px;border-radius:4px}
</style></head><body>
<h1>${t.title} 書籤 ${ver}</h1>
<p><b>安裝：</b>先按 <code>Ctrl＋Shift＋B</code> 顯示書籤列，再把下面的按鈕<b>用滑鼠拖到書籤列</b>。</p>
<p><a class="bm" href="${bookmarklet.replace(/"/g, '&quot;')}">${t.title}</a></p>
<div class="box"><b>使用：</b>
<ol>
${t.usage.map(u => '<li>' + u + '</li>').join('\n')}
</ol></div>
<div class="box"><b>安全說明：</b>${t.safety}</div>
</body></html>`;
    fs.writeFileSync(path.join(dir, 'install.html'), html);
    console.log(t.dir, '| bookmarklet chars:', bookmarklet.length, '| code chars:', code.length);
});
