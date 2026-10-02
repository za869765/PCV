/*
 * NIIS 最近接種（v1.7）— 全國性預防接種資訊管理系統「預防接種登錄」頁輔助工具
 *
 * 用途：讀健保卡進到個案接種紀錄頁後點書籤，自動從畫面上的接種紀錄表找出
 *       新冠（CoV…）與流感（Flu…）最近一次接種日、距今天數、新冠 84 天間隔與最快可打日（週四）；
 *       點證號或「複製身分證」，到掛號平台「現場掛號」身分證欄 Ctrl+V。
 * 安全設計：
 *   - 完全唯讀：只讀取畫面上已顯示的表格，不點擊、不送出、不修改 NIIS 任何資料
 *   - 不讀取、不保存任何帳號密碼或登入憑證；不呼叫任何 API
 *   - 不連線到任何外部網站；只把身分證字號複製到本機剪貼簿（使用者按下才複製）
 *   - 全部程式碼都在書籤內，不從網路載入外部程式
 * 用法：在 NIIS 點書籤開啟面板（NIIS 是框架頁，面板放在右側內容框架）；換下一位時面板自動更新；再點一次書籤＝關閉。
 */
(function () {
    'use strict';
    var PANEL_ID = 'niis-ld-panel';
    var VERSION = 'v1.7';

    var TOP = document, STATE_KEY = '__niisLastDose';
    if (TOP[STATE_KEY]) { TOP[STATE_KEY].close(); return; }   // 再點一次書籤＝關閉

    function isCov(code) { return /^cov|covid|新冠/i.test(code); }
    function isFlu(code) { return /flu|influ|流感/i.test(code); }

    // ── 收集本頁與同網域子框架的 document（NIIS 可能用 iframe） ──
    var diag = { frames: 0, blocked: 0 };
    function allDocs() {
        var out = [];
        diag.frames = 0; diag.blocked = 0;
        (function add(doc, depth) {
            if (!doc || depth > 6 || out.indexOf(doc) >= 0) return;
            out.push(doc);
            Array.prototype.forEach.call(doc.querySelectorAll('iframe,frame'), function (f) {
                diag.frames++;
                var d = null;
                try { d = f.contentDocument || (f.contentWindow && f.contentWindow.document); } catch (e) { d = null; }
                if (d) add(d, depth + 1); else diag.blocked++;
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

    // ── 讀取接種紀錄表：表頭含「劑別」與「接種日」（表頭格文字短，避免誤抓外層排版表格） ──
    function colOf(cells, re) {
        for (var k = 0; k < cells.length; k++) {
            var c = cells[k].replace(/\s/g, '');
            if (c.length <= 12 && re.test(c)) return k;
        }
        return -1;
    }
    function readRecords(docs) {
        var recs = [], found = false;
        diag.tables = 0; diag.heads = [];
        docs.forEach(function (doc) {
            Array.prototype.forEach.call(doc.querySelectorAll('table'), function (tb) {
                diag.tables++;
                var rows = tb.rows, hi = -1, ci = -1, di = -1, ui = -1, li = -1;
                for (var r = 0; r < rows.length && r < 5 && hi < 0; r++) {
                    var cells = Array.prototype.map.call(rows[r].cells, txt);
                    var a = colOf(cells, /劑別/), b = colOf(cells, /^接種日(?!期)|^接種日期$/);
                    if (a >= 0 || colOf(cells, /接種/) >= 0) {
                        var hd = cells.filter(function (c) { return c.length <= 12; }).join('｜');
                        if (hd && diag.heads.indexOf(hd) < 0 && diag.heads.length < 6) diag.heads.push(hd);
                    }
                    if (a >= 0 && b >= 0) { hi = r; ci = a; di = b; ui = colOf(cells, /接種單位/); li = colOf(cells, /^批號$/); }
                }
                if (hi < 0) return;
                found = true;
                for (var i = hi + 1; i < rows.length; i++) {
                    var c = rows[i].cells;
                    if (c.length <= Math.max(ci, di)) continue;
                    var dt = rocToDate(txt(c[di]));
                    if (!dt) continue;
                    recs.push({ code: txt(c[ci]), date: dt, unit: ui >= 0 && c[ui] ? txt(c[ui]) : '', lot: li >= 0 && c[li] ? txt(c[li]) : '' });
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
    var CSS_TEXT =
        '#niis-ld-panel{position:fixed;top:60px;right:16px;width:430px;max-height:calc(100vh - 80px);z-index:99999;background:#fff;' +
        'border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);font:14px/1.5 "Noto Sans TC","Microsoft JhengHei",sans-serif;color:#1e293b;display:flex;flex-direction:column;overflow:hidden;text-align:left}' +
        '#niis-ld-panel *{box-sizing:border-box}' +
        '#niis-ld-panel .qh{background:linear-gradient(135deg,#00796b,#1565c0);color:#fff;padding:9px 12px;display:flex;align-items:center;gap:8px;cursor:move;user-select:none}' +
        '#niis-ld-panel .qh b{font-size:15px;flex:1}' +
        '#niis-ld-panel .qh button{background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:14px}' +
        '#niis-ld-panel .qb{padding:10px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}' +
        '#niis-ld-panel .who{font-size:13px;color:#475569;background:#f1f5f9;border-radius:8px;padding:6px 9px}' +
        '#niis-ld-panel .who b{color:#0f172a;font-size:15px;letter-spacing:1px}' +
        '#niis-ld-panel .who .nm{font-size:17px;letter-spacing:2px}#niis-ld-panel .who .age{font-size:13px;color:#334155;font-weight:700;margin-top:2px}' +
        '#niis-ld-panel .who .pid{cursor:pointer;border-bottom:1px dashed #64748b}#niis-ld-panel .who .pid:hover{background:#e0f2f1}' +
        '#niis-ld-panel .card{border-radius:10px;padding:8px 11px;border:2px solid}' +
        '#niis-ld-panel .card.cov{border-color:#fca5a5;background:#fef2f2}' +
        '#niis-ld-panel .card.flu{border-color:#93c5fd;background:#eff6ff}' +
        '#niis-ld-panel .card .t{font-weight:700;font-size:13px}' +
        '#niis-ld-panel .card.cov .t{color:#b91c1c}#niis-ld-panel .card.flu .t{color:#1d4ed8}' +
        '#niis-ld-panel .card .d{font-size:20px;font-weight:800;color:#0f172a}' +
        '#niis-ld-panel .card .ago{font-size:13px;font-weight:700;color:#334155}' +
        '#niis-ld-panel .sub{color:#64748b;font-size:12px}' +
        '#niis-ld-panel .brand{display:inline-block;background:#334155;color:#fff;border-radius:6px;padding:0 7px;margin-right:6px;font-size:12.5px;font-weight:700}' +
        '#niis-ld-panel .brand.unk{background:#e2e8f0;color:#475569;font-weight:400}' +
        '#niis-ld-panel .gap{margin-top:4px;font-size:14px;font-weight:700;color:#92400e;background:#fef3c7;border-radius:6px;padding:3px 8px}' +
        '#niis-ld-panel .gapsub{font-size:11.5px;font-weight:400;margin-left:8px;color:#a16207}' +
        '#niis-ld-panel .tag{display:inline-block;border-radius:999px;padding:0 8px;font-size:12px;font-weight:700;margin-left:6px}' +
        '#niis-ld-panel .tag.warn{background:#fde68a;color:#92400e}#niis-ld-panel .tag.ok{background:#bbf7d0;color:#166534}' +
        '#niis-ld-panel .copy{border:none;border-radius:10px;padding:10px;cursor:pointer;font:inherit;font-size:16px;font-weight:800;color:#fff;background:#00796b}' +
        '#niis-ld-panel .copy:disabled{background:#94a3b8;cursor:not-allowed}' +
        '#niis-ld-panel .err{color:#b91c1c;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:7px 10px;font-size:13px}' +
        '#niis-ld-panel .ft{font-size:11px;color:#94a3b8;text-align:right;padding:4px 12px 8px}';

    var pid = '';
    var host = null;      // 目前放面板的 document（NIIS 是框架頁：放在右側內容框架）
    var frameEl = null;   // 內容框架元素（重新載入＝換下一位時自動重掛面板）
    var panel = null, css = null, mo = null, timer = null;

    // 框架頁（<frameset>）的最外層不顯示任何內容 → 面板要放進有接種紀錄表的框架；找不到就放最大的框架
    function pickHost() {
        if (TOP.body && TOP.body.tagName !== 'FRAMESET') return { doc: TOP, frame: null };
        var best = null, bestScore = -1;
        (function scan(doc, depth) {
            if (depth > 4) return;
            Array.prototype.forEach.call(doc.querySelectorAll('iframe,frame'), function (f) {
                var d = null;
                try { d = f.contentDocument; } catch (e) { d = null; }
                if (!d || !d.body) return;
                if (d.body.tagName === 'FRAMESET') { scan(d, depth + 1); return; }
                var hasTable = Array.prototype.some.call(d.querySelectorAll('th,td'), function (c) { return txt(c) === '劑別代號'; });
                var score = (hasTable ? 1e9 : 0) + f.clientWidth * f.clientHeight;
                if (score > bestScore) { bestScore = score; best = { doc: d, frame: f }; }
            });
        })(TOP, 0);
        return best || { doc: TOP, frame: null };
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function cardHtml(fam, title, info, extraTag, extraLine) {
        if (!info.last) return '<div class="card ' + fam + '"><div class="t">' + title + '</div><div class="d">查無接種紀錄</div></div>';
        var n = daysAgo(info.last.date);
        return '<div class="card ' + fam + '"><div class="t">' + title + '（共 ' + info.count + ' 劑）' + (extraTag || '') + '</div>' +
            '<div class="d">' + fmtRoc(info.last.date) + '　<span class="ago">' + agoText(n) + '</span></div>' +
            '<div class="sub">' + brandHtml(info.last) + esc(info.last.code) + (info.last.unit ? '｜' + esc(info.last.unit) : '') + '</div>' + (extraLine || '') + '</div>';
    }

    // ── 依「劑別代號＋批號命名規則」推估廠牌（與對針系統 BRAND_RULES 同規則；僅供參考） ──
    var BRAND_RULES = [
        { brand: '東洋 FLUAD', type: /^FLUADJ/i },
        { brand: '賽諾菲 高劑量', type: /^FLUHD/i },
        { brand: '賽諾菲', type: /^FLU/i, lot: /^AFLUA/i },
        { brand: '國光', type: /^FLU/i, lot: /^P\d/i },
        { brand: 'GSK', type: /^FLU/i, lot: /^F[A-Z]/i },
        { brand: 'Seqirus', type: /^FLU/i, lot: /^\d+P\d*$/i },
        { brand: 'Moderna', type: /MODERNA/i },
        { brand: 'Novavax', type: /NOVAVAX/i },
        { brand: 'BNT 輝瑞', type: /BIONTECH|BNT|PFIZER/i },
        { brand: 'AZ', type: /ASTRA|_AZ/i },
        { brand: '高端', type: /MEDIGEN|MVC/i }
    ];
    function brandOf(rec) {
        // NIIS 批號可能有括號、-CDC／-hb 撥發尾碼、_日期 尾碼 → 去掉後比對原廠批號
        var lot = String(rec.lot || '').replace(/[()（）\s]/g, '').replace(/-(CDC|HB)$/i, '').replace(/_\d{6,7}$/, '');
        for (var i = 0; i < BRAND_RULES.length; i++) {
            var r = BRAND_RULES[i];
            if (r.type && !r.type.test(rec.code)) continue;
            if (r.lot && !r.lot.test(lot)) continue;
            return { brand: r.brand, lot: lot };
        }
        return { brand: '', lot: lot };
    }
    function brandHtml(rec) {
        var b = brandOf(rec);
        if (b.brand) return '<span class="brand">' + esc(b.brand) + '</span>';
        return b.lot ? '<span class="brand unk" title="批號判斷不出廠牌">批號 ' + esc(b.lot) + '</span>' : '';
    }
    // 新冠與上一劑需間隔 84 天：回傳 { tag, line }
    var COV_GAP = 84;
    function covGapInfo(info) {
        if (!info.last) return { tag: '', line: '' };
        var n = daysAgo(info.last.date);
        var ok = new Date(info.last.date.getTime()); ok.setDate(ok.getDate() + COV_GAP);
        if (n >= COV_GAP) return { tag: '<span class="tag ok">已滿 ' + COV_GAP + ' 天，可接種</span>', line: '' };
        // 最快可打＝滿 84 天後遇到的第一個星期四（當天就是週四則當天）
        var thu = new Date(ok.getTime());
        while (thu.getDay() !== 4) thu.setDate(thu.getDate() + 1);
        return {
            tag: '<span class="tag warn">間隔未滿 ' + COV_GAP + ' 天（還差 ' + (COV_GAP - n) + ' 天）</span>',
            line: '<div class="gap">⛔ 最快可打：<b>' + fmtRoc(thu) + '（四）</b><span class="gapsub">滿 ' + COV_GAP + ' 天為 ' + fmtRoc(ok) + '</span></div>'
        };
    }

    function render() {
        if (!panel) return;
        var docs = allDocs();
        var newPid = (readLabel(docs, /^證號[:：]?$/).toUpperCase().match(/[A-Z][A-Z0-9]\d{8}/) || [''])[0];
        pid = newPid;
        var birth = rocToDate(readLabel(docs, /^出生日期[:：]?$/));
        var data = readRecords(docs);
        var body = panel.querySelector('[data-role="body"]');
        if (!data.found) {
            body.innerHTML = '<div class="err">這一頁找不到接種紀錄表（需有「劑別代號」「接種日」欄）。請進入個案的「預防接種登錄」頁，面板會自動更新（或按 ↻）。</div>' +
                '<div class="sub">診斷（不含個資，可截圖給開發者）：網址 ' + esc(host.location.host + host.location.pathname) + '｜框架 ' + diag.frames + ' 個（無法讀取 ' + diag.blocked + '）｜表格 ' + diag.tables + ' 個' +
                (diag.heads.length ? '<br>疑似表頭：' + diag.heads.map(esc).join('<br>') : '｜未見含「劑別／接種」的表頭') + '</div>';
            return;
        }
        var name = readLabel(docs, /^姓名[:：]?$/);
        var age = '';
        if (birth) {
            // 足歲到「月」：未滿當月生日的日子不算一個月
            var t = new Date(), mon = (t.getFullYear() - birth.getFullYear()) * 12 + (t.getMonth() - birth.getMonth());
            if (t.getDate() < birth.getDate()) mon--;
            age = '民國 ' + (birth.getFullYear() - 1911) + ' 年次・' + Math.floor(mon / 12) + ' 歲 ' + (mon % 12) + ' 個月';
        }
        var cov = latest(data.recs, isCov), flu = latest(data.recs, isFlu);
        var covGap = covGapInfo(cov);
        var codes = [];
        data.recs.forEach(function (r) { var c = r.code.split(/[-_\s]/)[0]; if (codes.indexOf(c) < 0) codes.push(c); });
        var fluTag = flu.last && flu.last.date >= fluSeasonStart()
            ? '<span class="tag warn">本季（' + (fluSeasonStart().getFullYear() - 1911) + '/10/01 起）已接種</span>'
            : '<span class="tag ok">本季尚未接種</span>';
        var h = '<div class="who">' + (name ? '<b class="nm">' + esc(name) + '</b>　' : '') +
            '證號：' + (pid ? '<b class="pid" data-act="copyId" title="點一下複製身分證">' + esc(pid) + ' 📋</b>' : '<b style="color:#b91c1c">讀不到</b>') +
            (age ? '<div class="age">' + esc(age) + '</div>' : '') + '</div>' +
            cardHtml('cov', '🦠 新冠最近一次', cov, covGap.tag, covGap.line) +
            cardHtml('flu', '🤧 流感最近一次', flu, fluTag) +
            '<div class="sub">讀到 ' + data.recs.length + ' 筆已接種紀錄' + (codes.length ? '（代號開頭：' + esc(codes.slice(0, 12).join('、')) + '）' : '') + '</div>' +
            '<button class="copy" data-act="copyId"' + (pid ? '' : ' disabled') + '>📋 複製身分證「' + esc(pid || '—') + '」</button>' +
            '<div class="sub">複製後到掛號平台「現場掛號」的身分證欄按 Ctrl+V，再勾類別、按掛號。</div>';
        body.innerHTML = h;
    }

    function copyText(s, btn) {
        function done() {
            var oldHtml = btn.innerHTML;
            btn.textContent = '✅ 已複製，請到掛號平台按 Ctrl+V';
            setTimeout(function () { if (btn.isConnected) btn.innerHTML = oldHtml; }, 2000);
        }
        var nav = host.defaultView ? host.defaultView.navigator : navigator;
        if (nav.clipboard && nav.clipboard.writeText) {
            nav.clipboard.writeText(s).then(done, fallback);
        } else fallback();
        function fallback() {
            var ta = host.createElement('textarea');
            ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
            host.body.appendChild(ta); ta.select();
            try { host.execCommand('copy'); done(); } catch (e) { btn.textContent = '複製失敗，請手動輸入'; }
            ta.remove();
        }
    }

    // 拖曳面板
    var dragOn = false, sx, sy, ox, oy;
    function dragMove(e) {
        if (!dragOn) return;
        panel.style.left = (ox + e.clientX - sx) + 'px';
        panel.style.top = (oy + e.clientY - sy) + 'px';
        panel.style.right = 'auto';
    }
    function dragUp() { dragOn = false; }

    function onPanelClick(e) {
        var t = e.target.closest ? e.target.closest('[data-act]') : e.target;
        if (!t) return;
        var act = t.getAttribute('data-act');
        if (act === 'close') return close();
        if (act === 'refresh') { render(); return; }
        if (act === 'copyId' && pid) { copyText(pid, t); return; }
    }

    function unmount() {
        if (mo) { mo.disconnect(); mo = null; }
        clearTimeout(timer);
        try {
            host.removeEventListener('mousemove', dragMove);
            host.removeEventListener('mouseup', dragUp);
            panel.remove();
            css.remove();
        } catch (e) { /* 框架已換頁，舊 document 已失效 */ }
        panel = css = null;
    }

    function mount() {
        var h = pickHost();
        host = h.doc;
        if (h.frame !== frameEl) {
            if (frameEl) frameEl.removeEventListener('load', onFrameLoad);
            frameEl = h.frame;
            if (frameEl) frameEl.addEventListener('load', onFrameLoad);
        }
        css = host.createElement('style');
        css.textContent = CSS_TEXT;
        (host.head || host.body).appendChild(css);
        panel = host.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML =
            '<div class="qh"><b>💉 最近接種（新冠／流感）</b><button data-act="refresh" title="重新讀取畫面">↻</button><button data-act="close" title="關閉（再點書籤也可關閉）">✕</button></div>' +
            '<div class="qb" data-role="body"></div>' +
            '<div class="ft">' + VERSION + '｜唯讀・只複製身分證到剪貼簿・不保存</div>';
        host.body.appendChild(panel);
        panel.addEventListener('click', onPanelClick);
        panel.querySelector('.qh').addEventListener('mousedown', function (e) {
            if (e.target.tagName === 'BUTTON') return;
            dragOn = true; sx = e.clientX; sy = e.clientY;
            var r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
            e.preventDefault();
        });
        host.addEventListener('mousemove', dragMove);
        host.addEventListener('mouseup', dragUp);
        // 頁面局部更新（沒整頁重載）時自動重讀
        var W = host.defaultView || window;
        if (W.MutationObserver) {
            var p = panel;
            mo = new W.MutationObserver(function (list) {
                if (list.every(function (m) { return p.contains(m.target); })) return;
                clearTimeout(timer);
                timer = setTimeout(render, 400);
            });
            mo.observe(host.body, { childList: true, subtree: true });
        }
        render();
    }

    // 內容框架換頁（換下一位）→ 自動在新頁面重掛面板
    function onFrameLoad() {
        unmount();
        setTimeout(mount, 200);
    }

    function close() {
        unmount();
        if (frameEl) frameEl.removeEventListener('load', onFrameLoad);
        frameEl = null;
        try { delete TOP[STATE_KEY]; } catch (e) { TOP[STATE_KEY] = null; }
    }
    TOP[STATE_KEY] = { close: close };

    mount();
})();
