/*
 * NIIS 最近接種（v2.1）— 全國性預防接種資訊管理系統「預防接種登錄」頁輔助工具
 *
 * 用途：讀健保卡進到個案接種紀錄頁後點書籤，自動從畫面上的接種紀錄表找出
 *       新冠（CoV…）與流感（Flu…）最近一次接種日、距今天數、新冠 84 天間隔與最快可打日（週四）、公費年齡；
 *       換人時自動把身分證放進剪貼簿（附 NIIS 標記），到掛號平台「現場掛號」身分證欄 Ctrl+V；
 *       平台開著「快速掛號」書籤時，會用這個標記比對掛號的人是否與 NIIS 同一人。
 * 安全設計：
 *   - 完全唯讀：只讀取畫面上已顯示的表格，不點擊、不送出、不修改 NIIS 任何資料
 *   - 不讀取、不保存任何帳號密碼或登入憑證；不呼叫任何 API
 *   - 不連線到任何外部網站；只把目前個案的身分證（＋姓名標記）放到本機剪貼簿
 *   - 全部程式碼都在書籤內，不從網路載入外部程式
 * 用法：在 NIIS 點書籤開啟面板（NIIS 是框架頁，面板放在右側內容框架）；換下一位時面板自動更新；再點一次書籤＝關閉。
 */
(function () {
    'use strict';
    var PANEL_ID = 'niis-ld-panel';
    var VERSION = 'v2.1';
    var CLIP_TYPE = 'web application/x-niis-id';   // 剪貼簿自訂格式：標記「這個身分證來自 NIIS」，貼上時只會貼出純身分證

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
    // 公費年齡門檻：10/1～11/1 為 65 歲以上，11/2 起 50 歲以上（依出生年計）
    function publicAgeLimit() {
        var t = new Date(), m = t.getMonth(), d = t.getDate();
        return (m === 9 || (m === 10 && d === 1)) ? 65 : 50;
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
        '#niis-ld-panel{position:fixed;top:60px;right:16px;width:440px;max-height:calc(100vh - 80px);z-index:99999;background:#fff;' +
        'border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);font:14px/1.5 "Noto Sans TC","Microsoft JhengHei",sans-serif;color:#1e293b;display:flex;flex-direction:column;overflow:hidden;text-align:left}' +
        '#niis-ld-panel *{box-sizing:border-box}' +
        '#niis-ld-panel .qh{background:linear-gradient(135deg,#00796b,#1565c0);color:#fff;padding:8px 10px;display:flex;align-items:center;gap:6px;cursor:move;user-select:none}' +
        '#niis-ld-panel .qh b{font-size:15px;flex:1}' +
        '#niis-ld-panel .hb{background:rgba(15,23,42,.28);border:1px solid rgba(255,255,255,.6);color:#fff;border-radius:8px;padding:4px 11px;cursor:pointer;font:inherit;font-size:13.5px;font-weight:700;transition:background .15s,transform .1s}' +
        '#niis-ld-panel .hb:hover{background:rgba(255,255,255,.38)}#niis-ld-panel .hb:active{transform:scale(.94)}' +
        '#niis-ld-panel .hb.x{padding:4px 10px}#niis-ld-panel .hb.x:hover{background:#dc2626;border-color:#dc2626}' +
        '#niis-ld-panel .qb{padding:10px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:9px}' +
        '#niis-ld-panel .who{background:#f1f5f9;border:2px solid #e2e8f0;border-radius:10px;padding:8px 12px;transition:border-color .3s}' +
        '#niis-ld-panel .who .r1{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}' +
        '#niis-ld-panel .who .nm{font-size:24px;font-weight:800;color:#0f172a;letter-spacing:3px}' +
        '#niis-ld-panel .who .pid{font:800 20px/1.3 Consolas,"Courier New",monospace;color:#0f172a;letter-spacing:1px}' +
        '#niis-ld-panel .who .age{font-size:15px;color:#334155;font-weight:700;margin-top:2px}' +
        '#niis-ld-panel .who.fresh{box-shadow:inset 6px 0 0 #f59e0b}' +
        '#niis-ld-panel .pub.ok{align-self:center;background:#dcfce7;color:#166534;border:1px solid #86efac;border-radius:999px;padding:0 9px;font-size:12.5px;font-weight:800}' +
        '#niis-ld-panel .pub.no{background:#fef3c7;color:#92400e;border-left:6px solid #d97706;border-radius:8px;padding:6px 10px;font-size:15px;font-weight:800}' +
        '#niis-ld-panel .card{border-radius:12px;padding:9px 12px;border:3px solid}' +
        '#niis-ld-panel .card.ok{border-color:#22c55e;background:#f0fdf4}' +
        '#niis-ld-panel .card.no{border-color:#ef4444;background:#fef2f2;border-width:4px;box-shadow:inset 6px 0 0 #dc2626}' +
        '#niis-ld-panel .card.none{border-color:#cbd5e1;background:#f8fafc}' +
        '#niis-ld-panel .card .t{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;margin-top:4px}' +
        '#niis-ld-panel .card.cov .t{color:#b91c1c}#niis-ld-panel .card.flu .t{color:#1d4ed8}' +
        '#niis-ld-panel .card .t span.n{font-weight:400;color:#64748b;font-size:12.5px}' +
        '#niis-ld-panel .st{display:block;text-align:center;border-radius:8px;padding:4px 10px;font-size:19px;font-weight:900;color:#fff}' +
        '#niis-ld-panel .card.ok .st{background:#16a34a}#niis-ld-panel .card.no .st{background:#dc2626}#niis-ld-panel .card.none .st{background:#64748b}' +
        '#niis-ld-panel .card .d{font-size:24px;font-weight:900;color:#0f172a;line-height:1.25}' +
        '#niis-ld-panel .card .ago{font-size:15px;font-weight:700;color:#334155;margin-left:10px}' +
        '#niis-ld-panel .card .info{font-size:12.5px;color:#475569;margin-top:2px}' +
        '#niis-ld-panel .gap{margin-top:6px;font-size:17px;font-weight:900;color:#fff;background:#dc2626;border-radius:8px;padding:5px 10px}' +
        '#niis-ld-panel .gapsub{display:block;font-size:12px;font-weight:400;color:#fee2e2}' +
        '#niis-ld-panel .sub{color:#64748b;font-size:12px}' +
        '#niis-ld-panel .brand{display:inline-block;background:#334155;color:#fff;border-radius:6px;padding:0 7px;margin-right:6px;font-size:12.5px;font-weight:700}' +
        '#niis-ld-panel .brand.unk{background:#e2e8f0;color:#475569;font-weight:400}' +
        '#niis-ld-panel .hist{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed}' +
        '#niis-ld-panel .hist th{background:#f1f5f9;color:#475569;font-weight:700;text-align:left;padding:3px 6px}' +
        '#niis-ld-panel .hist td{border-bottom:1px solid #e2e8f0;padding:3px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '#niis-ld-panel .hist tr.cov td:first-child{border-left:6px solid #ef4444}#niis-ld-panel .hist tr.flu td:first-child{border-left:6px solid #3b82f6}' +
        '#niis-ld-panel .hist tr.oth td:first-child{border-left:6px solid #cbd5e1}#niis-ld-panel .hist tr.cur td{background:#fef9c3;font-weight:700}' +
        '#niis-ld-panel .clip{border:2px dashed #86efac;background:#f0fdf4;color:#166534;border-radius:10px;padding:6px 10px;font:inherit;font-size:14px;font-weight:800;text-align:left;cursor:pointer;transition:transform .1s}' +
        '#niis-ld-panel .clip:active{transform:scale(.98)}#niis-ld-panel .clip.warn{border:2px solid #f59e0b;background:#fef3c7;color:#92400e}' +
        '#niis-ld-panel .clip.need{border:2px solid #dc2626;background:#dc2626;color:#fff;font-size:16px;padding:9px 12px;animation:niisPulse 1.2s infinite}' +
        '#niis-ld-panel .clip.done{border:2px solid #16a34a;background:#16a34a;color:#fff}' +
        '@keyframes niisPulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.55)}50%{box-shadow:0 0 0 7px rgba(220,38,38,0)}}' +
        '#niis-ld-panel.flash .who{animation:niisFlash 2.5s ease-out}' +
        '@keyframes niisFlash{0%,40%{border-color:#f59e0b;background:#fef3c7;box-shadow:0 0 0 4px rgba(245,158,11,.35)}100%{border-color:#e2e8f0;background:#f1f5f9;box-shadow:none}}' +
        '#niis-ld-panel .err{color:#b91c1c;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:7px 10px;font-size:13px}' +
        '#niis-ld-panel .ft{font-size:11px;color:#64748b;text-align:right;padding:4px 12px 8px}' +
        '@media (prefers-reduced-motion:reduce){#niis-ld-panel *{animation:none!important}}';

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
    // ── 依「劑別代號＋批號命名規則」推估廠牌（與對針系統 BRAND_RULES 同規則；僅供參考） ──
    //   v2.1 依實際批號查證更正：AFLUA/AFLBA＝GSK、FS…＝國光、P100＋6 碼＝東洋（Seqirus）、英數英＋3 碼＋V＝賽諾菲；對不到不猜
    var BRAND_RULES = [
        { brand: '東洋 FLUAD', type: /^FLUADJ/i },
        { brand: '賽諾菲 高劑量', type: /^FLUHD/i },
        { brand: 'GSK 伏流感', type: /^FLU/i, lot: /^AFL[UB]A/i },
        { brand: '國光 安定伏', type: /^FLU/i, lot: /^FS[A-Z]/i },
        { brand: '東洋 輔流威護', type: /^FLU/i, lot: /^P100\d{6}$/i },
        { brand: '賽諾菲 菲流達', type: /^FLU/i, lot: /^[A-Z]\d[A-Z]\d{3}V$/i },
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
    // 新冠與上一劑需間隔 84 天 → 卡片狀態 { cls, st, line }（查無紀錄只說「未查得」，不直接斷言可接種）
    var COV_GAP = 84;
    function covState(info) {
        if (!info.last) return { cls: 'none', st: '◯ 未查得新冠紀錄', line: '' };
        var n = daysAgo(info.last.date);
        var ok = new Date(info.last.date.getTime()); ok.setDate(ok.getDate() + COV_GAP);
        if (n >= COV_GAP) return { cls: 'ok', st: '✅ 已滿 ' + COV_GAP + ' 天・可接種', line: '' };
        // 最快可打＝滿 84 天後遇到的第一個星期四（當天就是週四則當天）
        var thu = new Date(ok.getTime());
        while (thu.getDay() !== 4) thu.setDate(thu.getDate() + 1);
        return {
            cls: 'no', st: '⛔ 未滿 ' + COV_GAP + ' 天（還差 ' + (COV_GAP - n) + ' 天）',
            line: '<div class="gap">最快可打：' + fmtRoc(thu) + '（四）<span class="gapsub">滿 ' + COV_GAP + ' 天為 ' + fmtRoc(ok) + '</span></div>'
        };
    }
    function fluState(info) {
        var s = fluSeasonStart();
        if (info.last && info.last.date >= s) return {
            cls: 'no', st: '⛔ 本季已接種',
            line: '<div class="gap">本季（' + (s.getFullYear() - 1911) + '/10/01 起）已打過，請勿重複掛號</div>'
        };
        return info.last ? { cls: 'ok', st: '✅ 本季未打過', line: '' } : { cls: 'none', st: '◯ 未查得流感紀錄', line: '' };
    }
    function cardHtml(fam, title, info, state) {
        var h = '<div class="card ' + fam + ' ' + state.cls + '"><div class="st">' + state.st + '</div>' +
            '<div class="t">' + title + (info.count ? '<span class="n">共 ' + info.count + ' 劑</span>' : '') + '</div>';
        if (!info.last) return h + '</div>';
        return h + '<div class="d">' + fmtRoc(info.last.date) + '<span class="ago">' + agoText(daysAgo(info.last.date)) + '</span></div>' +
            '<div class="info">' + brandHtml(info.last) + esc(info.last.code) + (info.last.unit ? '｜' + esc(shortUnit(info.last.unit)) : '') + '</div>' + state.line + '</div>';
    }
    function shortUnit(u) { return String(u || '').replace(/^(臺|台)南市/, ''); }
    function histHtml(recs) {
        if (!recs.length) return '';
        var list = recs.slice().sort(function (a, b) { return b.date - a.date; }).slice(0, 6);
        var season = fluSeasonStart();
        return '<div class="sub" style="font-weight:700;color:#475569">最近接種明細（共 ' + recs.length + ' 筆，列最近 ' + list.length + ' 筆）' +
            '<span style="float:right;font-weight:400"><span style="color:#ef4444">■</span>新冠 <span style="color:#3b82f6">■</span>流感 <span style="background:#fef9c3">　</span>本季／84 天內</span></div>' +
            '<table class="hist"><colgroup><col style="width:86px"><col style="width:33%"><col style="width:82px"><col></colgroup>' +
            '<tr><th>日期</th><th>疫苗</th><th>廠牌</th><th>接種單位</th></tr>' +
            list.map(function (r) {
                var b = brandOf(r), cov = isCov(r.code), flu = isFlu(r.code);
                var cur = (flu && r.date >= season) || (cov && daysAgo(r.date) < COV_GAP);
                return '<tr class="' + (cov ? 'cov' : flu ? 'flu' : 'oth') + (cur ? ' cur' : '') + '"><td>' + fmtRoc(r.date) + '</td><td title="' + esc(r.code) + '">' + esc(r.code) +
                    '</td><td title="' + esc(b.lot) + '">' + esc(b.brand || b.lot || '') + '</td><td title="' + esc(r.unit) + '">' + esc(shortUnit(r.unit)) + '</td></tr>';
            }).join('') + '</table>';
    }

    // ── 剪貼簿：換人自動放入身分證；另附 NIIS 標記（自訂格式），平台「快速掛號」據此比對是否同一人 ──
    // 自動與手動複製共用同一個串行流程；成功狀態綁定「實際寫入的身分證」
    var pidName = '', lastPid = '';
    var clip = { id: '', marked: false, at: 0 };   // 最近一次成功寫入
    var clipFail = false, clipBusy = false, clipAgain = '', doneId = '', doneUntil = 0;
    function writeVia(W, id, name) {
        try {
            if (!W || W.closed) throw new Error('視窗已關閉');
            var nav = W.navigator;
            if (!nav.clipboard) throw new Error('不支援剪貼簿');
            var plain = function () { return nav.clipboard.writeText(id).then(function () { return { marked: false }; }); };
            if (!W.ClipboardItem) return plain();
            var parts = {};
            parts['text/plain'] = new W.Blob([id], { type: 'text/plain' });
            parts[CLIP_TYPE] = new W.Blob([JSON.stringify({ id: id, name: name, ts: Date.now() })], { type: CLIP_TYPE });
            return nav.clipboard.write([new W.ClipboardItem(parts)]).then(function () { return { marked: true }; }, plain);
        } catch (e) { return Promise.reject(e); }
    }
    // 依序試各視窗（有焦點的優先：浮動視窗／NIIS 內容框架／最外層），有一個成功即可
    function clipWindows() {
        var out = [];
        [panel && panel.ownerDocument.defaultView, pipWin, host && host.defaultView, TOP.defaultView, window].forEach(function (W) {
            if (W && out.indexOf(W) < 0) out.push(W);
        });
        function f(W) { try { return W.document.hasFocus() ? 0 : 1; } catch (e) { return 1; } }
        return out.sort(function (a, b) { return f(a) - f(b); });
    }
    function writeAny(id, name) {
        var wins = clipWindows(), i = 0;
        return new Promise(function (resolve, reject) {
            (function next(err) {
                if (i >= wins.length) { reject(err); return; }
                writeVia(wins[i++], id, name).then(resolve, next);
            })();
        });
    }
    // 舊式複製（需使用者點擊才有效）：只在手動按鈕使用
    function execCopy(id) {
        var pdoc = panel.ownerDocument, ta = pdoc.createElement('textarea'), ok = false;
        ta.value = id; ta.style.position = 'fixed'; ta.style.opacity = '0';
        pdoc.body.appendChild(ta); ta.select();
        try { ok = pdoc.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        return ok ? Promise.resolve({ marked: false }) : Promise.reject(new Error('複製失敗'));
    }
    function copyNow(manual) {
        if (!pid || closing) return;
        if (clipBusy) { if (clipAgain !== 'manual') clipAgain = manual ? 'manual' : 'auto'; return; }   // 排隊：手動要求優先保留
        var id = pid, name = pidName;
        clipBusy = true;
        var job = writeAny(id, name);
        if (manual) job = job.catch(function () { return execCopy(id); });
        job.then(function (r) {
            clip = { id: id, marked: r.marked, at: Date.now() };
            clipFail = false;
            if (manual) { doneId = id; doneUntil = Date.now() + 1800; setTimeout(updateClip, 1900); }
        }, function () {
            if (id === pid) clipFail = true;   // 視窗沒在前景 → 回到 NIIS／浮動視窗時再試，或由使用者點一下
        }).then(function () {
            clipBusy = false;
            var again = clipAgain;
            clipAgain = '';
            updateClip();
            if (again === 'manual') copyNow(true);   // 寫入途中按了手動複製 → 照做一次
            else if (pid && pid !== clip.id && (again || pid !== id)) copyNow(false);   // 寫入途中換人 → 接著寫最新的人
        });
    }
    function autoCopy() { if (pid && clip.id !== pid && !clipFail) copyNow(false); }
    function onAnyFocus() { if (clipFail && pid) { clipFail = false; copyNow(false); } }
    function clipHtml() {
        if (!pid) return '';
        if (doneId === pid && doneUntil > Date.now()) return '<button class="clip done" data-act="copyId">✅ 已複製・到掛號平台 Ctrl+V</button>';
        if (clip.id === pid) {
            var hm = new Date(clip.at), tm = ('0' + hm.getHours()).slice(-2) + ':' + ('0' + hm.getMinutes()).slice(-2);
            return clip.marked
                ? '<button class="clip" data-act="copyId" title="點一下可再複製一次">📋 已複製（' + tm + '）・到掛號平台 Ctrl+V</button>'
                : '<button class="clip warn" data-act="copyId" title="點一下再試">⚠ 已複製純文字（' + tm + '）・無 NIIS 標記，平台無法比對</button>';
        }
        if (clipFail) return '<button class="clip need" data-act="copyId">📋 點我複製・自動複製沒成功</button>';
        return '<button class="clip" data-act="copyId">📋 複製中…</button>';
    }
    function updateClip() {
        var el = panel && panel.querySelector('[data-role="clip"]');
        if (el) el.innerHTML = clipHtml();
    }

    var freshUntil = 0, freshTimer = null;
    function flashPanel() {
        if (!panel) return;
        panel.classList.remove('flash');
        void panel.offsetWidth;
        panel.classList.add('flash');
        // 換人後姓名框左側保留橘色條 10 秒
        freshUntil = Date.now() + 10000;
        clearTimeout(freshTimer);
        freshTimer = setTimeout(function () { var w = panel && panel.querySelector('.who'); if (w) w.classList.remove('fresh'); }, 10000);
    }

    function render() {
        if (!panel) return;
        var docs = allDocs();
        var newPid = (readLabel(docs, /^證號[:：]?$/).toUpperCase().match(/[A-Z][A-Z0-9]\d{8}/) || [''])[0];
        var birth = rocToDate(readLabel(docs, /^出生日期[:：]?$/));
        var data = readRecords(docs);
        var body = panel.querySelector('[data-role="body"]');
        if (!data.found) {
            pid = '';   // 頁面載入中／不是接種登錄頁 → 不複製任何人
            body.innerHTML = '<div class="err">這一頁找不到接種紀錄表（需有「劑別代號」「接種日」欄）。請進入個案的「預防接種登錄」頁，面板會自動更新。' +
                (/niis/i.test(location.host) ? '' : '<br>這個書籤要在 <b>NIIS</b> 頁面點；想在其他分頁也看到，請在 NIIS 的面板按「📌 浮動」。') + '</div>' +
                '<div class="sub">診斷（不含個資，可截圖給開發者）：網址 ' + esc(host.location.host + host.location.pathname) + '｜框架 ' + diag.frames + ' 個（無法讀取 ' + diag.blocked + '）｜表格 ' + diag.tables + ' 個' +
                (diag.heads.length ? '<br>疑似表頭：' + diag.heads.map(esc).join('<br>') : '｜未見含「劑別／接種」的表頭') + '</div>';
            return;
        }
        var name = readLabel(docs, /^姓名[:：]?$/);
        pid = newPid; pidName = name;   // 證號與姓名同一次讀取一起更新
        if (pid !== lastPid) {
            if (lastPid && pid) flashPanel();   // 換人 → 閃一下提醒資料已換
            lastPid = pid;
            clipFail = false;
        }
        var age = '', pubTag = '', pubWarn = '';
        if (birth) {
            // 足歲到「月」：未滿當月生日的日子不算一個月
            var t = new Date(), mon = (t.getFullYear() - birth.getFullYear()) * 12 + (t.getMonth() - birth.getMonth());
            if (t.getDate() < birth.getDate()) mon--;
            age = '民國 ' + (birth.getFullYear() - 1911) + ' 年次・' + Math.floor(mon / 12) + ' 歲 ' + (mon % 12) + ' 個月';
            var lim = publicAgeLimit(), yrs = t.getFullYear() - birth.getFullYear();
            if (yrs >= lim) pubTag = '<span class="pub ok" title="依出生年計 ' + yrs + ' 歲">✓ 公費 ' + lim + '+</span>';
            else pubWarn = '<div class="pub no">⚠ 未達公費年齡 ' + lim + ' 歲（依出生年計 ' + yrs + ' 歲），需確認其他公費身分' +
                (lim > 50 && yrs >= 50 ? '；11/2 起 50 歲以上即符合' : '') + '</div>';
        }
        var cov = latest(data.recs, isCov), flu = latest(data.recs, isFlu);
        body.innerHTML = '<div class="who' + (freshUntil > Date.now() ? ' fresh' : '') + '"><div class="r1">' + (name ? '<span class="nm">' + esc(name) + '</span>' : '') +
            (pid ? '<span class="pid">' + esc(pid) + '</span>' : '<span class="pid" style="color:#b91c1c">證號讀不到</span>') + pubTag + '</div>' +
            (age ? '<div class="age">' + esc(age) + '</div>' : '') + '</div>' + pubWarn +
            cardHtml('cov', '🦠 新冠', cov, covState(cov)) +
            cardHtml('flu', '🤧 流感', flu, fluState(flu)) +
            '<div data-role="clip" style="display:flex;flex-direction:column">' + clipHtml() + '</div>' +
            histHtml(data.recs);
        autoCopy();
    }

    // 拖曳面板（只在 NIIS 頁面內時）
    var dragOn = false, sx, sy, ox, oy;
    function dragMove(e) {
        if (!dragOn) return;
        panel.style.left = (ox + e.clientX - sx) + 'px';
        panel.style.top = (oy + e.clientY - sy) + 'px';
        panel.style.right = 'auto';
    }
    function dragUp() { dragOn = false; }

    // ── 浮動視窗（Chrome「文件子母畫面」）：永遠在最上層，切到掛號平台也看得到 ──
    var pipWin = null, closing = false;
    var canPip = !!(window.documentPictureInPicture && window.documentPictureInPicture.requestWindow);
    function openPip() {
        window.documentPictureInPicture.requestWindow({ width: 440, height: 560 }).then(function (w) {
            pipWin = w;
            w.document.title = '最近接種';
            w.addEventListener('focus', onAnyFocus);
            w.addEventListener('resize', fitPip);   // 浮動視窗拉大 → 字跟著放大
            w.addEventListener('pagehide', function () {
                pipWin = null;
                if (closing) return;
                unmountPanel();
                mountPanel();             // 關掉浮動視窗 → 面板回到 NIIS 頁面
            });
            unmountPanel();
            mountPanel();
        }, function (err) {
            var b = panel && panel.querySelector('[data-role="body"]');
            if (b) b.insertAdjacentHTML('afterbegin', '<div class="err">浮動視窗開不起來（' + esc((err && err.message) || '瀏覽器不支援') + '）。請確認使用新版 Chrome／Edge。</div>');
        });
    }

    function onPanelClick(e) {
        var t = e.target.closest ? e.target.closest('[data-act]') : e.target;
        if (!t) return;
        var act = t.getAttribute('data-act');
        if (act === 'close') return close();
        if (act === 'pip') { if (pipWin) pipWin.close(); else openPip(); return; }
        if (act === 'copyId' && pid) { copyNow(true); return; }
    }

    function unmountPanel() {
        try {
            if (panel) panel.ownerDocument.removeEventListener('mousemove', dragMove);
            if (panel) panel.ownerDocument.removeEventListener('mouseup', dragUp);
            if (panel) panel.remove();
            if (css) css.remove();
        } catch (e) { /* 框架已換頁，舊 document 已失效 */ }
        panel = css = null;
    }

    function mountPanel() {
        var doc = pipWin ? pipWin.document : host;
        css = doc.createElement('style');
        css.textContent = CSS_TEXT + (pipWin
            ? 'body{margin:0;background:#fff}#niis-ld-panel{position:static;width:auto;max-height:none;min-height:100vh;border-radius:0;box-shadow:none}#niis-ld-panel .qh{cursor:default}'
            : '');
        (doc.head || doc.body).appendChild(css);
        panel = doc.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML =
            '<div class="qh"><b>💉 最近接種（新冠／流感）</b>' +
            (canPip ? '<button class="hb" data-act="pip" title="' + (pipWin ? '收回到 NIIS 頁面' : '變成浮動視窗：切到掛號平台也持續顯示') + '">' + (pipWin ? '↙ 收回' : '📌 浮動') + '</button>' : '') +
            '<button class="hb x" data-act="close" title="關閉（再點書籤也可關閉）">✕ 關閉</button></div>' +
            '<div class="qb" data-role="body"></div>' +
            '<div class="ft">' + VERSION + '｜唯讀・換人自動複製身分證到剪貼簿・不保存</div>';
        doc.body.appendChild(panel);
        panel.addEventListener('click', onPanelClick);
        if (!pipWin) {
            panel.querySelector('.qh').addEventListener('mousedown', function (e) {
                if (e.target.tagName === 'BUTTON') return;
                dragOn = true; sx = e.clientX; sy = e.clientY;
                var r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
                e.preventDefault();
            });
            doc.addEventListener('mousemove', dragMove);
            doc.addEventListener('mouseup', dragUp);
        }
        render();
        fitPip();
    }
    function fitPip() {
        if (pipWin && panel) panel.style.zoom = Math.max(1, Math.min(1.8, pipWin.innerWidth / 440)).toFixed(2);
    }

    // 找 NIIS 內容頁、監看它的局部更新（換人但沒整頁重載時自動重讀）
    function watchPage() {
        if (mo) { mo.disconnect(); mo = null; }
        clearTimeout(timer);
        var h = pickHost();
        try { if (host && host !== h.doc) host.defaultView.removeEventListener('focus', onAnyFocus); } catch (e) { /* 舊框架已失效 */ }
        host = h.doc;
        if (h.frame !== frameEl) {
            if (frameEl) frameEl.removeEventListener('load', onFrameLoad);
            frameEl = h.frame;
            if (frameEl) frameEl.addEventListener('load', onFrameLoad);
        }
        var W = host.defaultView || window;
        W.addEventListener('focus', onAnyFocus);   // 自動複製失敗時，回到 NIIS 就補複製
        if (W.MutationObserver && host.body) {
            mo = new W.MutationObserver(function (list) {
                if (panel && list.every(function (m) { return panel.contains(m.target); })) return;
                clearTimeout(timer);
                timer = setTimeout(render, 400);
            });
            mo.observe(host.body, { childList: true, subtree: true });
        }
    }

    // 內容框架換頁（換下一位）→ 重新監看；面板在頁面內就重掛，在浮動視窗則直接更新
    var reloadTimer = null;
    function onFrameLoad() {
        if (!pipWin) unmountPanel();
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(function () {
            if (closing) return;
            watchPage();
            if (pipWin) render(); else mountPanel();
        }, 200);
    }

    function close() {
        closing = true;
        if (mo) { mo.disconnect(); mo = null; }
        clearTimeout(timer); clearTimeout(reloadTimer); clearTimeout(freshTimer);
        unmountPanel();
        if (pipWin) pipWin.close();
        if (frameEl) frameEl.removeEventListener('load', onFrameLoad);
        frameEl = null;
        try { TOP.defaultView.removeEventListener('focus', onAnyFocus); host.defaultView.removeEventListener('focus', onAnyFocus); } catch (e) { /* 框架已換頁 */ }
        try { delete TOP[STATE_KEY]; } catch (e) { TOP[STATE_KEY] = null; }
    }
    TOP[STATE_KEY] = { close: close };
    TOP.defaultView.addEventListener('focus', onAnyFocus);

    watchPage();
    mountPanel();
})();
