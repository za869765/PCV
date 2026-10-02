/*
 * NIIS 最近接種（v1.0）— 全國性預防接種資訊管理系統「預防接種登錄」頁輔助工具
 *
 * 用途：讀健保卡進到個案接種紀錄頁後點書籤，自動從畫面上的接種紀錄表找出
 *       新冠（CoV…）與流感（Flu…）最近一次接種日、距今天數，讓使用者決定要掛哪幾針；
 *       選好類別按「複製」，到掛號平台「⚡ 快速掛號」輸入框按 Ctrl+V 即自動填好現場掛號視窗。
 * 安全設計：
 *   - 完全唯讀：只讀取畫面上已顯示的表格，不點擊、不送出、不修改 NIIS 任何資料
 *   - 不讀取、不保存任何帳號密碼或登入憑證；不呼叫任何 API
 *   - 不連線到任何外部網站；只把「身分證＋類別代號」複製到本機剪貼簿（使用者按下才複製）
 *   - 全部程式碼都在書籤內，不從網路載入外部程式
 * 用法：在個案接種紀錄頁點書籤開啟面板；再點一次書籤＝關閉。換下一位（頁面重新載入）後再點一次。
 */
(function () {
    'use strict';
    var PANEL_ID = 'niis-ld-panel';
    var VERSION = 'v1.0';

    var old = document.getElementById(PANEL_ID);
    if (old) { if (old._close) old._close(); else old.remove(); return; }   // 再點一次書籤＝關閉

    var VACS = [
        { key: 'Flu', name: '流感', fam: 'flu' },
        { key: 'FluB', name: '幼兒流感', fam: 'flu' },
        { key: 'XFG', name: '莫XFG', fam: 'cov' },
        { key: 'NV', name: 'Novavax', fam: 'cov' },
        { key: 'XFGK', name: '兒童莫XFG', fam: 'cov', kid: 1 },
        { key: 'XFGB', name: '幼兒莫XFG', fam: 'cov', kid: 1 },
    ];
    function isCov(code) { return /^cov|covid|新冠/i.test(code); }
    function isFlu(code) { return /flu|influ|流感/i.test(code); }

    // ── 收集本頁與同網域子框架的 document（NIIS 可能用 iframe） ──
    function allDocs() {
        var out = [];
        (function add(doc, depth) {
            if (!doc || depth > 4) return;
            out.push(doc);
            Array.prototype.forEach.call(doc.querySelectorAll('iframe,frame'), function (f) {
                try { add(f.contentDocument, depth + 1); } catch (e) { /* 跨網域框架略過 */ }
            });
        })(document, 0);
        return out;
    }
    function txt(el) { return String((el && el.textContent) || '').replace(/\s+/g, ' ').trim(); }

    // 民國 yyyMMdd（或 yyMMdd）→ Date
    function rocToDate(s) {
        var m = String(s || '').replace(/\D/g, '').match(/^(\d{2,3})(\d{2})(\d{2})$/);
        if (!m) return null;
        var y = +m[1] + 1911, mo = +m[2], d = +m[3];
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        return new Date(y, mo - 1, d);
    }
    function fmtRoc(dt) {
        return (dt.getFullYear() - 1911) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2) + '/' + ('0' + dt.getDate()).slice(-2);
    }
    function daysAgo(dt) {
        var t = new Date(); t.setHours(0, 0, 0, 0);
        return Math.round((t - dt) / 86400000);
    }
    function agoText(n) {
        if (n < 60) return n + ' 天前';
        var mo = Math.floor(n / 30.44);
        return n + ' 天前（約 ' + (mo >= 24 ? Math.floor(mo / 12) + ' 年 ' + (mo % 12) + ' 個月' : mo + ' 個月') + '）';
    }
    // 本季流感起日：每年 10/1（10 月前算去年 10/1）
    function fluSeasonStart() {
        var t = new Date(), y = t.getMonth() >= 9 ? t.getFullYear() : t.getFullYear() - 1;
        return new Date(y, 9, 1);
    }

    // ── 讀取個案基本資料（證號、出生日期）：找「證號：」「出生日期：」標籤後面的值 ──
    function readLabel(docs, re) {
        var val = '';
        docs.some(function (doc) {
            return Array.prototype.some.call(doc.querySelectorAll('td,th,span,label,div'), function (el) {
                if (el.children.length > 2 || !re.test(txt(el))) return false;
                var nx = el.nextElementSibling;
                var v = txt(nx);
                if (!v) { var m = txt(el).replace(re, '').trim(); v = m; }
                if (v) { val = v; return true; }
                return false;
            });
        });
        return val;
    }

    // ── 讀取接種紀錄表：表頭含「劑別代號」與「接種日」 ──
    function readRecords(docs) {
        var recs = [], found = false;
        docs.forEach(function (doc) {
            Array.prototype.forEach.call(doc.querySelectorAll('table'), function (tb) {
                var rows = tb.rows, hi = -1, ci = -1, di = -1, ui = -1;
                for (var r = 0; r < rows.length && hi < 0; r++) {
                    var cells = Array.prototype.map.call(rows[r].cells, txt);
                    if (cells.indexOf('劑別代號') >= 0 && cells.indexOf('接種日') >= 0) {
                        hi = r; ci = cells.indexOf('劑別代號'); di = cells.indexOf('接種日'); ui = cells.indexOf('接種單位');
                    }
                }
                if (hi < 0) return;
                found = true;
                for (var i = hi + 1; i < rows.length; i++) {
                    var c = rows[i].cells;
                    if (c.length <= Math.max(ci, di)) continue;
                    var dt = rocToDate(txt(c[di]));
                    if (!dt) continue;
                    recs.push({ code: txt(c[ci]), date: dt, unit: ui >= 0 && c[ui] ? txt(c[ui]) : '' });
                }
            });
        });
        return { recs: recs, found: found };
    }

    function latest(recs, test) {
        var hit = recs.filter(function (r) { return test(r.code); });
        hit.sort(function (a, b) { return b.date - a.date; });
        return { last: hit[0] || null, count: hit.length };
    }

    // ── 面板 ──
    var css = document.createElement('style');
    css.textContent =
        '#niis-ld-panel{position:fixed;top:60px;right:16px;width:430px;max-height:calc(100vh - 80px);z-index:99999;background:#fff;' +
        'border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);font:14px/1.5 "Noto Sans TC","Microsoft JhengHei",sans-serif;color:#1e293b;display:flex;flex-direction:column;overflow:hidden;text-align:left}' +
        '#niis-ld-panel *{box-sizing:border-box}' +
        '#niis-ld-panel .qh{background:linear-gradient(135deg,#00796b,#1565c0);color:#fff;padding:9px 12px;display:flex;align-items:center;gap:8px;cursor:move;user-select:none}' +
        '#niis-ld-panel .qh b{font-size:15px;flex:1}' +
        '#niis-ld-panel .qh button{background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:14px}' +
        '#niis-ld-panel .qb{padding:10px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}' +
        '#niis-ld-panel .who{font-size:13px;color:#475569;background:#f1f5f9;border-radius:8px;padding:6px 9px}' +
        '#niis-ld-panel .who b{color:#0f172a;font-size:15px;letter-spacing:1px}' +
        '#niis-ld-panel .card{border-radius:10px;padding:8px 11px;border:2px solid}' +
        '#niis-ld-panel .card.cov{border-color:#fca5a5;background:#fef2f2}' +
        '#niis-ld-panel .card.flu{border-color:#93c5fd;background:#eff6ff}' +
        '#niis-ld-panel .card .t{font-weight:700;font-size:13px}' +
        '#niis-ld-panel .card.cov .t{color:#b91c1c}#niis-ld-panel .card.flu .t{color:#1d4ed8}' +
        '#niis-ld-panel .card .d{font-size:20px;font-weight:800;color:#0f172a}' +
        '#niis-ld-panel .card .ago{font-size:13px;font-weight:700;color:#334155}' +
        '#niis-ld-panel .sub{color:#64748b;font-size:12px}' +
        '#niis-ld-panel .tag{display:inline-block;border-radius:999px;padding:0 8px;font-size:12px;font-weight:700;margin-left:6px}' +
        '#niis-ld-panel .tag.warn{background:#fde68a;color:#92400e}#niis-ld-panel .tag.ok{background:#bbf7d0;color:#166534}' +
        '#niis-ld-panel .lbl{font-size:12.5px;color:#64748b;font-weight:700}' +
        '#niis-ld-panel .vacs{display:flex;gap:5px;flex-wrap:wrap}' +
        '#niis-ld-panel .vb{border:2px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:5px 12px;cursor:pointer;font:inherit;font-size:14px;font-weight:700}' +
        '#niis-ld-panel .vb small{font-weight:400;color:#94a3b8;margin-left:3px;font-size:11px}' +
        '#niis-ld-panel .vb.kid{font-size:12.5px;padding:3px 9px}' +
        '#niis-ld-panel .vb.on{color:#fff}#niis-ld-panel .vb.on small{color:rgba(255,255,255,.85)}' +
        '#niis-ld-panel .vb.flu.on{background:#2563eb;border-color:#2563eb}#niis-ld-panel .vb.cov.on{background:#dc2626;border-color:#dc2626}' +
        '#niis-ld-panel .copy{border:none;border-radius:10px;padding:10px;cursor:pointer;font:inherit;font-size:16px;font-weight:800;color:#fff;background:#00796b}' +
        '#niis-ld-panel .copy:disabled{background:#94a3b8;cursor:not-allowed}' +
        '#niis-ld-panel .err{color:#b91c1c;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:7px 10px;font-size:13px}' +
        '#niis-ld-panel .ft{font-size:11px;color:#94a3b8;text-align:right;padding:4px 12px 8px}';
    document.head.appendChild(css);

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML =
        '<div class="qh"><b>💉 最近接種（新冠／流感）</b><button data-act="refresh" title="重新讀取畫面">↻</button><button data-act="close" title="關閉（再點書籤也可關閉）">✕</button></div>' +
        '<div class="qb" data-role="body"></div>' +
        '<div class="ft">' + VERSION + '｜唯讀・只複製身分證＋類別到剪貼簿・不保存</div>';
    document.body.appendChild(panel);

    var picked = {};      // fam → key
    var pid = '';

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function cardHtml(fam, title, info, extraTag) {
        if (!info.last) return '<div class="card ' + fam + '"><div class="t">' + title + '</div><div class="d">查無接種紀錄</div></div>';
        var n = daysAgo(info.last.date);
        return '<div class="card ' + fam + '"><div class="t">' + title + '（共 ' + info.count + ' 劑）' + (extraTag || '') + '</div>' +
            '<div class="d">' + fmtRoc(info.last.date) + '　<span class="ago">' + agoText(n) + '</span></div>' +
            '<div class="sub">' + esc(info.last.code) + (info.last.unit ? '｜' + esc(info.last.unit) : '') + '</div></div>';
    }
    function pickedKeys() {
        return VACS.filter(function (v) { return picked[v.fam] === v.key; }).map(function (v) { return v.key; });
    }

    function render() {
        var docs = allDocs();
        pid = (readLabel(docs, /^證號[:：]?$/).toUpperCase().match(/[A-Z][A-Z0-9]\d{8}/) || [''])[0];
        var birth = rocToDate(readLabel(docs, /^出生日期[:：]?$/));
        var data = readRecords(docs);
        var body = panel.querySelector('[data-role="body"]');
        if (!data.found) {
            body.innerHTML = '<div class="err">這一頁找不到接種紀錄表（需有「劑別代號」「接種日」欄）。請先讀健保卡進入個案的「預防接種登錄」頁，再點一次書籤或按 ↻。</div>';
            return;
        }
        var age = '';
        if (birth) {
            var t = new Date(), a = t.getFullYear() - birth.getFullYear();
            if (t.getMonth() < birth.getMonth() || (t.getMonth() === birth.getMonth() && t.getDate() < birth.getDate())) a--;
            age = '｜民國 ' + (birth.getFullYear() - 1911) + ' 年次・' + a + ' 歲';
        }
        var cov = latest(data.recs, isCov), flu = latest(data.recs, isFlu);
        var fluTag = flu.last && flu.last.date >= fluSeasonStart()
            ? '<span class="tag warn">本季（' + (fluSeasonStart().getFullYear() - 1911) + '/10/01 起）已接種</span>'
            : '<span class="tag ok">本季尚未接種</span>';
        var h = '<div class="who">證號：<b>' + (pid ? esc(pid) : '<span style="color:#b91c1c">讀不到</span>') + '</b>' + esc(age) + '</div>' +
            cardHtml('cov', '🦠 新冠最近一次', cov) +
            cardHtml('flu', '🤧 流感最近一次', flu, fluTag) +
            '<div class="lbl">要掛哪幾針？（每類選一種，可只選一類）</div><div class="vacs">';
        VACS.forEach(function (v) {
            h += '<button class="vb ' + v.fam + (v.kid ? ' kid' : '') + (picked[v.fam] === v.key ? ' on' : '') + '" data-vac="' + esc(v.key) + '">' +
                esc(v.key) + '<small>' + esc(v.name) + '</small></button>';
        });
        var keys = pickedKeys();
        h += '</div><button class="copy" data-act="copy"' + (pid && keys.length ? '' : ' disabled') + '>📋 複製「' +
            esc(pid || '身分證') + ' ' + esc(keys.join(',') || '…') + '」</button>' +
            '<div class="sub">複製後切到掛號平台，在「⚡ 快速掛號」輸入框按 Ctrl+V，就會開好現場掛號視窗（確認仍由你按）。</div>';
        body.innerHTML = h;
    }

    function copyText(s, btn) {
        function done() { btn.textContent = '✅ 已複製，請到掛號平台按 Ctrl+V'; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(s).then(done, fallback);
        } else fallback();
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = '複製失敗，請手動輸入'; }
            ta.remove();
        }
    }

    function close() {
        if (mo) mo.disconnect();
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('mouseup', dragUp);
        panel.remove();
        css.remove();
    }
    panel._close = close;

    panel.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-act],[data-vac]') : e.target;
        if (!t) return;
        var act = t.getAttribute('data-act');
        if (act === 'close') return close();
        if (act === 'refresh') { picked = {}; render(); return; }
        if (act === 'copy') { copyText(pid + ' ' + pickedKeys().join(','), t); return; }
        var vac = t.getAttribute('data-vac');
        if (vac) {
            VACS.forEach(function (v) { if (v.key === vac) picked[v.fam] = picked[v.fam] === v.key ? undefined : v.key; });
            render();
        }
    });

    // 拖曳面板
    var dragOn = false, sx, sy, ox, oy;
    panel.querySelector('.qh').addEventListener('mousedown', function (e) {
        if (e.target.tagName === 'BUTTON') return;
        dragOn = true; sx = e.clientX; sy = e.clientY;
        var r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
        e.preventDefault();
    });
    function dragMove(e) {
        if (!dragOn) return;
        panel.style.left = (ox + e.clientX - sx) + 'px';
        panel.style.top = (oy + e.clientY - sy) + 'px';
        panel.style.right = 'auto';
    }
    function dragUp() { dragOn = false; }
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragUp);

    // 頁面局部更新（換人但沒整頁重載）時自動重讀；身分證變了才清掉已選類別
    var mo = null, timer = null;
    if (window.MutationObserver) {
        mo = new MutationObserver(function (list) {
            if (list.every(function (m) { return panel.contains(m.target); })) return;
            clearTimeout(timer);
            timer = setTimeout(function () {
                var before = pid;
                render();
                if (pid !== before) { picked = {}; render(); }
            }, 400);
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }
    render();
})();
