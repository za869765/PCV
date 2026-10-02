/*
 * 快速掛號（v1.2）— 臺南市流感疫苗預約平台「報到作業」頁輔助工具
 *
 * 用途：先點選類別（Flu／XFG…，會保留到你改為止），再輸入身分證按 Enter：
 *   - 本場次未掛 → 自動打開平台的「現場掛號」視窗並填好身分證＋類別，由使用者檢查後自己按確認
 *   - 本場次已掛 → 顯示已掛類別與是否報到，不重複開視窗
 * 安全設計：
 *   - 不會自行送出任何掛號／報到／退掛：只幫忙「填好視窗」，送出一律由使用者在平台視窗按確認
 *   - 不讀取、不保存任何帳號密碼或登入憑證；不自行呼叫平台 API
 *   - 不連線到任何外部網站；資料只在本機瀏覽器記憶體，關閉面板或頁面即清除（不寫入 localStorage）
 *   - 全部程式碼都在書籤內，不從網路載入外部程式
 * 用法：在「報到作業」頁選好場次後點書籤開啟面板；再點一次書籤＝關閉。
 */
(function () {
    'use strict';
    var PANEL_ID = 'qkl-panel';
    var VERSION = 'v1.2';

    var old = document.getElementById(PANEL_ID);
    if (old) { if (old._qklClose) old._qklClose(); else old.remove(); return; }   // 再點一次書籤＝關閉

    // ── 掛號類別（取自平台「現場掛號」選單）：fam 同組只能選一個 ──
    var VACS = [
        { key: 'Flu', name: '流感', fam: 'flu', main: 1 },
        { key: 'FluB', name: '幼兒流感', fam: 'flu', main: 1 },
        { key: 'XFG', name: '莫XFG', fam: 'cov', main: 1 },
        { key: 'LP', name: '莫LP', fam: 'cov' },
        { key: 'NV', name: 'Novavax', fam: 'cov', main: 1 },
        { key: 'XFGK', name: '兒童莫XFG', fam: 'cov' },
        { key: 'XFGB', name: '幼兒莫XFG', fam: 'cov' },
        { key: 'LPK', name: '兒童莫LP', fam: 'cov' },
        { key: 'LPB', name: '幼兒莫LP', fam: 'cov' },
        { key: 'XFG-S', name: '新冠特殊族群', fam: 'cov' },
        { key: '20PCV', name: '20PCV', fam: 'pcv' },
        { key: '21PCV', name: '21PCV', fam: 'pcv' },
        { key: 'PPV', name: '23PPV', fam: 'pcv' },
        { key: 'MPV', name: 'M痘', fam: 'oth' }
    ];
    var VAC_BY_KEY = {};
    VACS.forEach(function (v) { VAC_BY_KEY[v.key.toUpperCase()] = v; });
    function vacInfo(code) {
        return VAC_BY_KEY[String(code || '').toUpperCase()] || { key: code, name: code, fam: 'oth' };
    }

    // ── 找到網頁的「報到作業」元件（名單資料在這裡） ──
    function findCheckin() {
        var el = document.querySelector('#app');
        if (!el || !el.__vue__) return null;
        var found = null;
        (function walk(v, d) {
            if (!v || d > 15 || found) return;
            if (v.$options && v.$options.name === 'Checkin') { found = v; return; }
            (v.$children || []).forEach(function (c) { walk(c, d + 1); });
        })(el.__vue__, 0);
        return found;
    }
    function findWalkinDialog() {
        var hit = null;
        ((vm && vm.$children) || []).forEach(function (c) {
            if (c.$data && 'vaccines' in c.$data && '身分證字號' in c.$data) hit = c;
        });
        return hit;
    }

    // ── 面板 ──
    var css = document.createElement('style');
    css.textContent =
        '#qkl-panel{position:fixed;top:70px;right:16px;width:460px;max-height:calc(100vh - 90px);z-index:99999;background:#fff;' +
        'border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);font:14px/1.5 "Noto Sans TC","Microsoft JhengHei",sans-serif;color:#1e293b;display:flex;flex-direction:column;overflow:hidden}' +
        '#qkl-panel *{box-sizing:border-box}' +
        '#qkl-panel .qh{background:linear-gradient(135deg,#c62828,#5e35b1);color:#fff;padding:9px 12px;display:flex;align-items:center;gap:8px;cursor:move;user-select:none}' +
        '#qkl-panel .qh b{font-size:15px;flex:1}' +
        '#qkl-panel .qh button{background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:14px}' +
        '#qkl-panel .qb{padding:10px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}' +
        '#qkl-panel .qsec{font-size:12.5px;color:#475569;background:#f1f5f9;border-radius:8px;padding:6px 9px}' +
        '#qkl-panel .qsec b{color:#0f172a}' +
        '#qkl-panel .lbl{font-size:12.5px;color:#64748b;font-weight:700}' +
        '#qkl-panel .vacs{display:flex;gap:5px;flex-wrap:wrap}' +
        '#qkl-panel .vb{border:2px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:4px 10px;cursor:pointer;font:inherit;font-size:13px;font-weight:700}' +
        '#qkl-panel .vb.main{font-size:15px;padding:6px 14px}' +
        '#qkl-panel .vb small{font-weight:400;color:#94a3b8;margin-left:3px;font-size:11px}' +
        '#qkl-panel .vb.on{color:#fff}#qkl-panel .vb.on small{color:rgba(255,255,255,.85)}' +
        '#qkl-panel .vb.flu.on{background:#2563eb;border-color:#2563eb}#qkl-panel .vb.cov.on{background:#dc2626;border-color:#dc2626}' +
        '#qkl-panel .vb.pcv.on{background:#ea580c;border-color:#ea580c}#qkl-panel .vb.oth.on{background:#6b7280;border-color:#6b7280}' +
        '#qkl-panel .more{font-size:12px;color:#1565c0;cursor:pointer;text-decoration:underline;align-self:center}' +
        '#qkl-panel .pick{font-size:13px;background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:5px 9px}' +
        '#qkl-panel input{width:100%;border:2px solid #cbd5e1;border-radius:8px;padding:8px 10px;font:inherit;font-size:16px;letter-spacing:1px}' +
        '#qkl-panel input:focus{outline:none;border-color:#c62828}' +
        '#qkl-panel .qbtns{display:flex;gap:6px;flex-wrap:wrap}' +
        '#qkl-panel .qbtns button{border:none;border-radius:7px;padding:5px 11px;cursor:pointer;font:inherit;font-size:13px;color:#fff;background:#64748b}' +
        '#qkl-panel .msg{border-radius:8px;padding:7px 10px;font-size:13.5px;font-weight:700}' +
        '#qkl-panel .msg.ok{background:#f0fdf4;color:#15803d;border:1px solid #86efac}' +
        '#qkl-panel .msg.go{background:#fff7ed;color:#c2410c;border:1px solid #fdba74}' +
        '#qkl-panel .msg.err{background:#fef2f2;color:#b91c1c;border:1px solid #fca5a5}' +
        '#qkl-panel table{width:100%;border-collapse:collapse;font-size:13px}' +
        '#qkl-panel td{border-bottom:1px solid #e2e8f0;padding:5px 4px;vertical-align:middle}' +
        '#qkl-panel tr.no td{background:#fef2f2}#qkl-panel tr.ok td{background:#f0fdf4}' +
        '#qkl-panel .st{font-weight:700;white-space:nowrap}' +
        '#qkl-panel tr.no .st{color:#b91c1c}#qkl-panel tr.ok .st{color:#15803d}' +
        '#qkl-panel .chip{display:inline-block;border-radius:999px;padding:0 7px;margin:1px 2px 1px 0;font-size:12px;font-weight:700;color:#fff}' +
        '#qkl-panel .chip.flu{background:#2563eb}#qkl-panel .chip.cov{background:#dc2626}#qkl-panel .chip.pcv{background:#ea580c}#qkl-panel .chip.oth{background:#6b7280}' +
        '#qkl-panel .sub{color:#94a3b8;font-size:11.5px}' +
        '#qkl-panel .lk{color:#1565c0;cursor:pointer;text-decoration:underline;font-size:12px;white-space:nowrap}' +
        '#qkl-panel .ft{font-size:11px;color:#94a3b8;text-align:right;padding:4px 12px 8px}';
    document.head.appendChild(css);

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML =
        '<div class="qh"><b>⚡ 快速掛號</b><button data-act="min" title="縮小／展開">－</button><button data-act="close" title="關閉（再點書籤也可關閉）">✕</button></div>' +
        '<div class="qb">' +
        '  <div class="qsec" data-role="sec">讀取中…</div>' +
        '  <div class="lbl">① 點選類別（會保留，連續掛同類不用重選；同一類只能選一種）</div>' +
        '  <div class="vacs" data-role="vacs"></div>' +
        '  <div class="pick" data-role="pick"></div>' +
        '  <div class="lbl">② 輸入身分證按 Enter → 未掛會自動開「現場掛號」並填好，<span style="color:#c62828">確認由你在平台視窗按</span></div>' +
        '  <input data-role="scan" placeholder="身分證字號" autocomplete="off">' +
        '  <div data-role="msg"></div>' +
        '  <div class="qbtns">' +
        '    <button data-act="clearVac">清除類別</button>' +
        '    <button data-act="reload" title="重新讀取這個場次的名單">↻ 重新讀取名單</button>' +
        '    <button data-act="clear">清空紀錄</button>' +
        '  </div>' +
        '  <div data-role="out"></div>' +
        '</div>' +
        '<div class="ft">' + VERSION + '｜不自動送出・資料不外傳・不保存</div>';
    document.body.appendChild(panel);

    var $ = function (sel) { return panel.querySelector(sel); };
    var vm = findCheckin();
    var picked = {};          // fam → key
    var showMore = false;
    var ids = [];             // 本次輸入過的身分證（新的在上）
    var unwatch = [];

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function pickedKeys() {
        return VACS.filter(function (v) { return picked[v.fam] === v.key; }).map(function (v) { return v.key; });
    }
    function chipsHtml(keys) {
        return keys.map(function (c) {
            var v = vacInfo(c);
            return '<span class="chip ' + v.fam + '" title="' + esc(c) + '">' + esc(v.name) + '</span>';
        }).join('');
    }
    function listIndex() {
        var index = {};
        ((vm && vm.list) || []).forEach(function (r) {
            var k = String(r['身分證字號'] || '').toUpperCase();
            if (k) index[k] = r;
        });
        return index;
    }
    function setMsg(cls, html) { $('[data-role="msg"]').innerHTML = html ? '<div class="msg ' + cls + '">' + html + '</div>' : ''; }

    function renderVacs() {
        var h = '';
        VACS.forEach(function (v) {
            if (!v.main && !showMore && picked[v.fam] !== v.key) return;
            h += '<button class="vb ' + v.fam + (v.main ? ' main' : '') + (picked[v.fam] === v.key ? ' on' : '') + '" data-vac="' + esc(v.key) + '">' +
                esc(v.key) + '<small>' + esc(v.name) + '</small></button>';
        });
        h += '<span class="more" data-act="more">' + (showMore ? '收起' : '更多（兒童莫、特殊族群、肺鏈…）') + '</span>';
        $('[data-role="vacs"]').innerHTML = h;
        var keys = pickedKeys();
        $('[data-role="pick"]').innerHTML = keys.length
            ? '目前類別：' + chipsHtml(keys) + '<span class="sub">（' + keys.length + ' 針）</span>'
            : '<span class="sub">尚未選類別：仍可開「現場掛號」，再到平台視窗勾選</span>';
    }

    function sectionText() {
        if (!vm) return '<span style="color:#b91c1c">找不到報到名單——請先進入「報到作業」頁，再點一次書籤。</span>';
        var s = (vm.selected && vm.selected['場次']) || null;
        if (!s) return '<span style="color:#b91c1c">請先在上方選好「場次」。</span>';
        return '場次：<b>' + esc(s['日期'] || '') + ' ' + esc(s['地點'] || '') + '</b>　名單 <b>' + (vm.list || []).length + '</b> 人';
    }

    function renderList() {
        $('[data-role="sec"]').innerHTML = sectionText();
        var out = $('[data-role="out"]');
        if (!ids.length) { out.innerHTML = ''; return; }
        var index = listIndex(), h = '<table>';
        ids.forEach(function (id) {
            var r = index[id];
            if (r) {
                var keys = String(r['接種疫苗'] || '').split(/[,，\s]+/).filter(Boolean);
                h += '<tr class="ok"><td>' + esc(id) + '<div class="sub">' + esc(r['姓名'] || '') + '</div></td>' +
                    '<td class="st">✅ 已掛</td><td>' + chipsHtml(keys) +
                    '<div class="sub">' + (r['已報到'] ? '✔ 已報到' + (r['報到號碼'] ? '・號碼 ' + esc(r['報到號碼']) : '') : '尚未報到') + '</div></td></tr>';
            } else {
                h += '<tr class="no"><td>' + esc(id) + '</td><td class="st">⬜ 未掛</td>' +
                    '<td><span class="lk" data-open="' + esc(id) + '">開啟現場掛號</span>　<span class="lk" data-del="' + esc(id) + '">移除</span></td></tr>';
            }
        });
        out.innerHTML = h + '</table>';
    }

    // 打開平台的「現場掛號」視窗並填好（不送出）
    function openWalkin(id) {
        if (!vm || !vm.selected || !vm.selected['場次']) { setMsg('err', '請先在上方選好「場次」。'); return; }
        var keys = pickedKeys();
        vm.openDialog();
        vm.$nextTick(function () {
            var dlg = findWalkinDialog();
            if (!dlg) { setMsg('err', '找不到「現場掛號」視窗，請改用平台的「現場掛號」按鈕。'); return; }
            dlg['身分證字號'] = id;
            dlg.vaccines = keys.slice();
            setMsg('go', '⬜ ' + esc(id) + ' 本場次未掛 → 已開「現場掛號」並填好' + (keys.length ? '：' + chipsHtml(keys) : '（請在視窗勾類別）') +
                '<br>請檢查後在平台視窗按確認' + (keys.indexOf('XFG-S') >= 0 ? '（特殊族群身份需在視窗選）' : ''));
        });
    }

    function handleId(id) {
        ids = ids.filter(function (x) { return x !== id; });
        ids.unshift(id);
        var r = listIndex()[id];
        if (r) {
            var keys = String(r['接種疫苗'] || '').split(/[,，\s]+/).filter(Boolean);
            setMsg('ok', '✅ ' + esc(id) + ' ' + esc(r['姓名'] || '') + ' 本場次已掛：' + chipsHtml(keys) +
                (r['已報到'] ? '（已報到）' : '（尚未報到）') + '<br><span class="sub">已掛者不會再開現場掛號；要加掛其他類別請用平台功能處理</span>');
        } else {
            openWalkin(id);
        }
        renderList();
    }

    function close() {
        unwatch.forEach(function (f) { f(); });
        document.removeEventListener('paste', onDialogPaste, true);
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('mouseup', dragUp);
        ids = [];
        panel.remove();
        css.remove();
    }
    panel._qklClose = close;

    panel.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('[data-act],[data-vac],[data-open],[data-del]') : e.target;
        if (!t) return;
        var act = t.getAttribute('data-act');
        if (act === 'close') return close();
        if (act === 'min') {
            var body = $('.qb'), hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            t.textContent = hidden ? '－' : '＋';
            return;
        }
        if (act === 'more') { showMore = !showMore; renderVacs(); return; }
        if (act === 'clearVac') { picked = {}; renderVacs(); scan.focus(); return; }
        if (act === 'reload') { if (vm && vm.loadList) vm.loadList(); return; }
        if (act === 'clear') { ids = []; setMsg(); renderList(); scan.focus(); return; }
        var vac = t.getAttribute('data-vac');
        if (vac) {
            var v = vacInfo(vac);
            picked[v.fam] = picked[v.fam] === v.key ? undefined : v.key;
            renderVacs();
            scan.focus();
            return;
        }
        var o = t.getAttribute('data-open');
        if (o) { openWalkin(o); return; }
        var d = t.getAttribute('data-del');
        if (d) { ids = ids.filter(function (x) { return x !== d; }); renderList(); }
    });

    var scan = $('[data-role="scan"]');
    // 面板內按鍵不傳給平台的掃描器監聽（避免平台把輸入當成條碼掃描而自動報到）
    ['keydown', 'keypress', 'keyup'].forEach(function (ev) {
        panel.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
    scan.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        submitText(scan.value);
    });
    // 從 NIIS 書籤複製來的「身分證＋類別」（例：K123456789 Flu,XFG）貼上即處理，類別只套用這一位
    scan.addEventListener('paste', function (e) {
        var text = (e.clipboardData || window.clipboardData).getData('text');
        if (!/[A-Za-z][A-Za-z0-9]\d{8}/.test(text)) return;
        e.preventDefault();
        submitText(text);
    });
    // 拆「身分證＋類別」文字：回傳 { id, vacs:[類別資訊] }（同一類只留最後一個）
    function parseIdVacs(text) {
        var got = (String(text).toUpperCase().match(/[A-Z][A-Z0-9]\d{8}/g) || []);
        var rest = String(text).replace(/[A-Za-z][A-Za-z0-9]\d{8}/g, ' ');
        var byFam = {};
        (rest.match(/[A-Za-z0-9-]+/g) || []).forEach(function (w) {
            var v = VAC_BY_KEY[w.toUpperCase()];
            if (v) byFam[v.fam] = v;
        });
        return { id: got[0] || '', vacs: VACS.filter(function (v) { return byFam[v.fam] === v; }) };
    }
    function submitText(text) {
        scan.value = '';
        var got = (String(text).toUpperCase().match(/[A-Z][A-Z0-9]\d{8}/g) || []);
        if (!got.length) { setMsg('err', '身分證格式不對（英文字母＋9 碼）'); return; }
        var once = parseIdVacs(text).vacs;
        if (once.length) {
            var saved = picked;
            picked = {};
            once.forEach(function (v) { picked[v.fam] = v.key; });
            handleId(got[0]);
            picked = saved;
        } else {
            handleId(got[0]);
        }
    }

    // 在平台自己的「現場掛號」視窗身分證欄貼上「身分證＋類別」→ 身分證填欄位、類別自動勾好（送出仍由使用者按「掛號」）
    function onDialogPaste(e) {
        if (panel.contains(e.target)) return;
        if (!vm || !vm.dialog || !e.target.closest || !e.target.closest('.v-dialog--active')) return;
        var text = (e.clipboardData || window.clipboardData).getData('text');
        var r = parseIdVacs(text);
        if (!r.id) return;                       // 不是身分證 → 照平台原本方式貼上
        var dlg = findWalkinDialog();
        if (!dlg) return;
        e.preventDefault();
        e.stopPropagation();
        var keys = r.vacs.map(function (v) { return v.key; });
        dlg['身分證字號'] = r.id;
        if (keys.length) dlg.vaccines = keys;
        var had = listIndex()[r.id];
        ids = ids.filter(function (x) { return x !== r.id; });
        ids.unshift(r.id);
        renderList();
        if (had) {
            var hk = String(had['接種疫苗'] || '');
            setMsg('ok', '⚠ ' + esc(r.id) + ' 本場次已掛：' + chipsHtml(hk.split(/[,，\s]+/).filter(Boolean)) + '，請確認是否要再掛');
            if (vm.$toast) vm.$toast.error(r.id + ' 本場次已掛（' + hk + '），請確認是否要再掛');
        } else {
            setMsg('go', '已在現場掛號視窗填好 ' + esc(r.id) + (keys.length ? '：' + chipsHtml(keys) : '') + '，請檢查後按「掛號」');
        }
    }
    document.addEventListener('paste', onDialogPaste, true);

    // 拖曳面板
    var dragOn = false, sx, sy, ox, oy;
    $('.qh').addEventListener('mousedown', function (e) {
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

    if (vm) {
        unwatch.push(vm.$watch('list', renderList));
        unwatch.push(vm.$watch(function () { return vm.selected && vm.selected['場次']; }, function () { ids = []; setMsg(); renderList(); }));
        // 現場掛號視窗關閉後，游標回到面板輸入框，可直接輸入下一位
        unwatch.push(vm.$watch('dialog', function (on) { if (!on) setTimeout(function () { scan.focus(); }, 300); }));
    }
    renderVacs();
    renderList();
    scan.focus();
})();
