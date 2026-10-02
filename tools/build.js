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
            '<b>NIIS 接力：</b>從「💉 NIIS 最近接種」書籤複製「身分證＋類別」後，打開平台的「現場掛號」，在身分證欄按 Ctrl+V → 身分證填好、接種疫苗自動勾好，按「掛號」即可（面板輸入框按 Ctrl+V 也行）。面板要保持開著（可按－縮小）。',
            '再點一次書籤＝關閉面板。'
        ],
        safety: '不會自行送出任何掛號／報到／退掛（只幫忙填好平台的現場掛號視窗，送出由你按）；不讀取或保存帳號密碼；不自行呼叫平台 API；不連線外部網站；不保存民眾資料（關閉即清除）；全部程式碼都在書籤內，可由資訊人員檢視 <code>quick-lookup.js</code>。'
    },
    {
        dir: 'niis-lastdose', file: 'niis-lastdose.js', title: '💉 NIIS 最近接種', color: '#00796b,#1565c0',
        usage: [
            '在 NIIS 讀健保卡（或搜尋身分證），進入個案的「預防接種登錄」頁。',
            '點書籤列上的「💉 NIIS 最近接種」，面板列出新冠／流感最近一次接種日、距今天數、流感本季是否已打；新冠未滿 84 天會標出<b>最快可打日（週四）</b>。',
            '點證號或「📋 複製身分證」，到掛號平台「現場掛號」身分證欄按 Ctrl+V，再勾類別、按掛號。',
            '<b>想切到掛號平台也看得到：</b>按面板上的「📌 浮動」→ 面板變成永遠在最上層的小視窗（Chrome／Edge 子母畫面），NIIS 換下一位也會自動更新；按「↙ 收回」回到 NIIS 頁面。',
            '換下一位時面板會自動更新，不用再點；再點一次書籤＝關閉。'
        ],
        safety: '完全唯讀（只讀畫面上的接種紀錄表，不點擊、不送出、不修改 NIIS 資料）；不讀取或保存帳號密碼；不呼叫任何 API；不連線外部網站；只在你按「複製」時把身分證字號放到本機剪貼簿；全部程式碼都在書籤內，可由資訊人員檢視 <code>niis-lastdose.js</code>。'
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
.warn{display:none;background:#fef2f2;border:2px solid #fca5a5;color:#b91c1c;border-radius:10px;padding:10px 14px;font-weight:700}
.cp{border:none;border-radius:8px;padding:6px 14px;background:#475569;color:#fff;font:inherit;cursor:pointer}
</style></head><body>
<h1>${t.title} 書籤 ${ver}</h1>
<p><b>安裝方法一（拖曳）：</b>先按 <code>Ctrl＋Shift＋B</code> 顯示書籤列，再把下面的按鈕<b>用滑鼠按住、拖到書籤列放開</b>（不是點它）。</p>
<p><a class="bm" id="bm" href="${bookmarklet.replace(/"/g, '&quot;')}">${t.title}</a></p>
<div class="warn" id="warn">⚠ 這裡是安裝頁，點按鈕不會有作用。請把按鈕<b>拖到書籤列</b>，之後在要用的網頁上點<b>書籤列上的書籤</b>。</div>
<p><b>安裝方法二（拖不上去時）：</b><button class="cp" id="cp">📋 複製書籤網址</button> → 在書籤列空白處按右鍵 →「新增網頁」→ 名稱填「${t.title.replace(/^\S+\s/, '')}」、網址按 <code>Ctrl＋V</code> 貼上 → 儲存。</p>
<p>裝好後書籤列會出現「${t.title}」（書籤列太滿時在最右邊的 <code>»</code> 裡）。</p>
<script>
document.getElementById('bm').addEventListener('click', function (e) { e.preventDefault(); document.getElementById('warn').style.display = 'block'; });
document.getElementById('cp').addEventListener('click', function () {
    var b = this, s = document.getElementById('bm').href;
    navigator.clipboard.writeText(s).then(function () { b.textContent = '✅ 已複製，請到書籤列新增網頁貼上'; }, function () { b.textContent = '複製失敗，請改用拖曳'; });
});
</script>
<div class="box"><b>使用：</b>
<ol>
${t.usage.map(u => '<li>' + u + '</li>').join('\n')}
</ol></div>
<div class="box"><b>安全說明：</b>${t.safety}</div>
</body></html>`;
    fs.writeFileSync(path.join(dir, 'install.html'), html);
    console.log(t.dir, '| bookmarklet chars:', bookmarklet.length, '| code chars:', code.length);
});
