/**
 * 佳里區衛生所 - 疫苗掛號對針統計系統 (v4.7)
 *
 * v3.0 變更：
 *  - 移除 Phis 驗證（6Z / 6V / 6k）全部後端邏輯，僅保留 NIIS 名單統計
 *  - CSV 只解析一次（單一迴圈同時完成建檔、分類、重複與異常偵測）
 *  - 新增辨識：XFG → 新冠(Moderna)、NXFG → 新冠(Novavax)、21PCV 獨立區塊
 * v3.1 變更：浮標加出生日期、針數容器配色調整
 * v3.2 變更：
 *  - 疫苗辨識規則改為「設定驅動」，儲存在 Script Properties（全所共用）
 *  - 前端齒輪設定面板可檢視/編輯代號、複製群組新增辨識群組與針數邏輯
 *  - 辨識改為「較精確（較長）代號優先」計分制，不再依賴判斷順序
 * v3.5 變更（PHIS 交叉對針回歸）：
 *  - 新增 6K/6Z/6V 三個 PHIS 掛號檔「選傳」欄位；針數仍以 NIIS 為準，
 *    PHIS 檔用來對針：列出「NIIS 有、PHIS 未掛」與「PHIS 有掛、NIIS 沒有」差異名單
 *  - PHIS 檔以表頭偵測欄位（實測 13 欄格式身份證在第4欄），舊格式（A欄=身分證）相容
 *  - PHIS 檔以「優待別」欄自動驗證檔案類型（6K/6Z/6V 放錯會擋下）
 *  - 流感身份別 F 分類統計：依 NIIS 檔身份別欄（附件14 新標準），未知代碼動態顯示
 * v3.6 變更（HIS 更名＋改加計模式）：
 *  - 系統更名：PHIS → HIS（所有顯示文字）
 *  - 取消對針差異比對；HIS 檔中 NIIS 名單沒有的人直接「加計」進針數與名單群組，
 *    名字旁備註 (HIS)，浮標顯示來源檔；同類別已在 NIIS 有針者不重複計
 *  - 加計群組：先以 HIS 檔「診斷代號/疫苗劑別」欄比對辨識代號（限同類別群組），
 *    辨識不到用該類別設定中的第一組；6Z 檔「NIIS身分別」欄一併帶入流感 F 分類
 * v3.7 變更（產 NIIS 匯入檔）：
 *  - 依媒體資料上傳範本（24 欄）產出 HIS 檔中 NIIS 名單沒有者的匯入 CSV（Big5）
 *  - 身分別自動填：新冠/流感各一組預設代號（可記憶），HIS 檔內有值優先；肺鏈不填
 *  - 針劑（疫苗種類代號＋批號）由使用者於面板新增，存 Script Properties 全所共用，
 *    下次開啟直接下拉選（批次拉選）；接種機構代碼一併記憶
 * v3.8 變更（新冠身分別依年齡自動判斷）：
 *  - 新冠身分別代碼改依「接種對象年齡」自動計算（出生日期 vs 接種日期）：
 *    6月-4歲 C15 / 5-11歲 C14 / 12-17歲 C17 / 18-49歲 C12 / 50-64歲 C10 /
 *    65-74歲 C11 / 75歲以上 C08A；HIS 檔內值仍優先，備援代號僅在無出生日期時使用
 * v3.9 變更（流感身分別個別拉選）：
 *  - 產檔面板列出 6Z 流感名單，每人可從附件14 對象別代碼表（F01~F09）個別拉選；
 *    未拉選者用「流感預設代號」；優先序：個別拉選 > 預設代號
 * v4.1 變更（HIS 加計醒目標示）：
 *  - HIS 加計者：名字加底線＋名字後紅色粗體「＊」標記，與 NIIS 名單者明顯區分；
 *    佔版面極小（上百人名單也不擠）；浮標顯示來源檔；統計列加圖例說明
 * v4.2 變更（產檔面板全螢幕＋自動判讀設定）：
 *  - 產檔面板改全螢幕；結存量檔改主頁同款夾帶區（夾帶即自動解析＋動畫回饋）
 *  - 接種機構代碼僅檢視；接種日期改日期選擇器（即時顯示民國換算，預設上個週四）
 *  - 移除新冠備援/流感預設輸入框，改齒輪「身分別自動判讀設定」面板（存雲端）：
 *    新冠年齡對照表 7 區間代碼、流感所內/外設代號（F03A/F03B）、公費門檻
 *    （特別月份預設 10 月＝65 歲、其他月份＝50 歲，皆可設定）
 *  - 流感容器：外設站切換（F03A↔F03B）；名單勾選＋批次套用；年齡不符公費門檻
 *    → 紅底＋浮標原因，未拉選例外身分別前「產生並下載」前後端皆擋
 *  - 新冠缺出生日期改為直接列名擋下（HIS 檔必有出生年，備援代號取消）
 * v4.3 變更（八點 UI/流程優化）：
 *  - HIS 卡片移除 ✕（重新夾帶即替換）；按鈕更名「身分別設定與匯出」
 *  - 主頁名單浮標顯示「目前身分別＋來源」（前端依設定即時計算，設定變更即時反映）
 *  - 判讀設定面板補流感 F 代碼表（可編輯存雲端，名單拉選選單同步使用）
 *  - 紅底不符列加脈動＋👉手勢動畫；場次顯示「目前設定是：…」＋「切換」鈕
 *  - 手動新增疫苗種類/批號支援記憶值自動填入（datalist，三容器皆有）
 *  - 一鍵列印附「流感特殊身分別檢核表」獨立一頁（大勾選框＋簽章欄）
 * v4.4 變更：
 *  - 主頁名單：HIS 加計流感者不符公費門檻且未拉選 → 紅色脈動＋⚠ 醒目動畫，
 *    設定/拉選/場次切換後即時消長（personSpan 加 data-his 供前端判斷）
 *  - NIIS 名單內的流感者浮標改顯示「已在 NIIS 名單」，不再誤標不符門檻
 * v4.5 變更（針劑分配到人＋四宮格）：
 *  - 匯出面板改橫式全螢幕 2×2 四宮格（檔案共用/新冠/流感/肺鏈各一角，寬敞操作）
 *  - 三種疫苗名單每人可個別拉選針劑（疫苗種類＋批號；同日最多五種批號分不同人），
 *    未拉選用該檔主選針劑；勾選＋批次套用；picks.personBatch 傳後端逐人套用
 *  - 特殊身分別清單移除簽章列（三處：列印視窗/一鍵列印附頁/寄信 PDF）
 *  - 新增 getNiisFamilyIds（一次回傳三類別 NIIS 身分證集合，前端名單灰階用）
 * v4.6 變更（真全螢幕＋手風琴）：
 *  - 修掉 exportModal 殘留的行內 max-width:860px（v3.7 遺留，蓋過全螢幕 CSS 的元兇）
 *  - 四宮格改手風琴：預設全部縮小成標題＋摘要列，點擊該格展開成整列寬（一次一格）；
 *    收合用 CSS 隱藏保留 DOM，輸入值與個別拉選不流失；面板標題更名「身分別設定與匯出」
 * v4.7 變更：四大格固定 2×2 吃滿整頁高度（grid-template-rows 1fr 1fr），
 *  內容在格內展開（不再跨列），格內各自捲動
 */

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('佳里區衛生所 - 疫苗掛號對針統計')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ===== 疫苗辨識設定 =====
// 群組欄位：key(唯一代碼) / label(區塊標題) / family(corona|flu|lung) /
//           indicator(名單標記) / box(容器配色) / codes(辨識代號陣列)
// 代號語法：'A'＝包含A；'A+B'＝同時包含A與B；'=X'＝完全等於X（皆不分大小寫）

var FAMILY_NAMES = { corona: '新冠', flu: '流感', lung: '肺鏈' };
var FAMILY_DEFAULT_BOX = { corona: 'red-box', flu: 'blue-box', lung: 'orange-box' };
var BOX_WHITELIST = {
  'red-box': true, 'rose-box': true, 'blue-box': true,
  'orange-box': true, 'amber-box': true, 'deep-orange-box': true
};

function getDefaultVaccineConfig() {
  return [
    { key: 'moderna', label: '新冠針數 (Moderna)', family: 'corona', indicator: '(M)',  box: 'red-box',         codes: ['XFG', 'MO', 'LP'] },
    { key: 'novavax', label: '新冠針數 (Novavax)', family: 'corona', indicator: '(N)',  box: 'rose-box',        codes: ['NXFG', 'NO', 'NJN', '=NV'] },
    { key: 'flu',     label: '流感針數 (Flu)',     family: 'flu',    indicator: '',     box: 'blue-box',        codes: ['FLU'] },
    { key: 'ppv',     label: '肺鏈針數 (PPV)',     family: 'lung',   indicator: '(23)', box: 'orange-box',      codes: ['23', 'PPV'] },
    { key: 'pcv20',   label: '肺鏈針數 (20PCV)',   family: 'lung',   indicator: '(20)', box: 'amber-box',       codes: ['13', '20', 'PCV'] },
    { key: 'pcv21',   label: '肺鏈針數 (21PCV)',   family: 'lung',   indicator: '(21)', box: 'deep-orange-box', codes: ['21+PCV'] }
  ];
}

function getVaccineConfigList() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('vaccineConfig');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch (e) {
    // 設定損壞時回退預設
  }
  return getDefaultVaccineConfig();
}

// 前端設定面板用
function getVaccineConfig() {
  return { groups: getVaccineConfigList() };
}

function saveVaccineConfig(groups) {
  try {
    if (!groups || !groups.length) return { success: false, error: '至少需要一個辨識群組' };
    var seen = {};
    var clean = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i] || {};
      var key = String(g.key || '').trim();
      if (!/^[A-Za-z0-9_]{1,30}$/.test(key)) return { success: false, error: '群組代碼格式錯誤：' + key };
      if (seen[key]) return { success: false, error: '群組代碼重複：' + key };
      seen[key] = true;

      var label = String(g.label || '').trim();
      if (!label || label.length > 40) return { success: false, error: '第 ' + (i + 1) + ' 個群組名稱不可空白且需在 40 字內' };

      var family = String(g.family || '');
      if (!FAMILY_NAMES[family]) return { success: false, error: '「' + label + '」的類別錯誤' };

      var indicator = String(g.indicator || '').trim().slice(0, 10);
      var box = BOX_WHITELIST[g.box] ? g.box : FAMILY_DEFAULT_BOX[family];

      var codes = [];
      var rawCodes = g.codes || [];
      for (var j = 0; j < rawCodes.length && codes.length < 20; j++) {
        var c = String(rawCodes[j] || '').trim().toUpperCase();
        if (c && c.length <= 20) codes.push(c);
      }
      if (codes.length === 0) return { success: false, error: '「' + label + '」的辨識代號不可空白' };

      clean.push({ key: key, label: label, family: family, indicator: indicator, box: box, codes: codes });
    }
    PropertiesService.getScriptProperties().setProperty('vaccineConfig', JSON.stringify(clean));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function resetVaccineConfig() {
  PropertiesService.getScriptProperties().deleteProperty('vaccineConfig');
  return { groups: getDefaultVaccineConfig() };
}

// 區塊標題轉短名稱：'新冠針數 (Moderna)' → '新冠 (Moderna)'（tooltip 與訊息用）
function shortLabel(group) {
  return String(group.label || '').replace(/針數\s*/, '');
}

// ===== 疫苗辨識（計分制：較精確／較長的代號優先） =====
function matchScore(categoryUpper, code) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return 0;
  if (code.charAt(0) === '=') {
    var target = code.slice(1);
    return (target && categoryUpper === target) ? 100 + target.length : 0;
  }
  if (code.indexOf('+') !== -1) {
    var parts = code.split('+');
    var total = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      if (categoryUpper.indexOf(p) === -1) return 0;
      total += p.length;
    }
    return total;
  }
  return categoryUpper.indexOf(code) !== -1 ? code.length : 0;
}

function recognizeVaccineCategory(rawCategory, config) {
  if (!rawCategory || String(rawCategory).trim() === '') return null;
  var c = String(rawCategory).toUpperCase();
  var bestKey = null;
  var bestScore = 0;
  for (var i = 0; i < config.length; i++) {
    var codes = config[i].codes || [];
    for (var j = 0; j < codes.length; j++) {
      var s = matchScore(c, codes[j]);
      if (s > bestScore) {
        bestScore = s;
        bestKey = config[i].key;
      }
    }
  }
  return bestKey;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 偵測出生日期欄位：表頭含「出生／生日」優先，否則掃描前幾筆資料列
 * 找日期格式的欄位（支援 民國/西元、含分隔符或純數字 7/8 碼）。
 */
function detectBirthColumn(rows) {
  if (!rows || rows.length === 0) return -1;
  var header = rows[0] || [];
  for (var c = 0; c < header.length; c++) {
    var h = String(header[c] || '');
    if (h.indexOf('出生') !== -1 || h.indexOf('生日') !== -1) return c;
  }
  var dateRe = /^\d{2,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/;                          // 42/11/05、1953/11/5、1953-11-05
  var ad8Re = /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/;                // 西元8碼 19531105
  var roc7Re = /^\d{3}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/;                      // 民國7碼 0421105
  for (var r = 1; r < Math.min(rows.length, 6); r++) {
    var row = rows[r] || [];
    for (var c2 = 0; c2 < row.length; c2++) {
      if (c2 === 0 || c2 === 1 || c2 === 10) continue;  // 跳過身分證、姓名、疫苗欄
      var v = String(row[c2] || '').trim();
      if (dateRe.test(v) || ad8Re.test(v) || roc7Re.test(v)) return c2;
    }
  }
  return -1;
}

/**
 * 單次解析 NIIS CSV：一個迴圈同時完成
 *  - 身分證 → 姓名／出生日期對照
 *  - 疫苗分類（每人每類只計一次，重複另行偵測）
 *  - 每人每類掛號次數（供重複掛號偵測與 tooltip 使用）
 *  - 無法辨識資料收集
 */
function analyzeNIIS(jnContent, config) {
  var rows = Utilities.parseCsv(jnContent);
  var idNameMap = {};
  var idBirthMap = {};
  var birthCol = detectBirthColumn(rows);
  var classification = {};
  var keyFamily = {};
  for (var g = 0; g < config.length; g++) {
    classification[config[g].key] = [];
    keyFamily[config[g].key] = config[g].family;
  }
  var idCategoryCount = {};   // id -> { 群組key: 掛號次數 }
  var unrecognized = [];      // 無法辨識的資料列 [{name, type}]

  // 身份別欄（流感 F 對象別代碼）：表頭含「身份別／身分別」
  var identityCol = -1;
  var header0 = rows[0] || [];
  for (var hc = 0; hc < header0.length; hc++) {
    var hv = String(header0[hc] || '');
    if (hv.indexOf('身份別') !== -1 || hv.indexOf('身分別') !== -1) { identityCol = hc; break; }
  }
  var idFCodeMap = {};        // 流感受種者 id -> F 對象別代碼

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;
    var id = (row[0] || '').toString().trim().toUpperCase();  // 統一大寫，與 HIS 檔比對一致
    var name = (row[1] || '').toString().trim();
    var raw = (row[10] || '').toString().trim();
    if (!id && !name && !raw) continue;  // 空白列

    if (id && name && !idNameMap[id]) idNameMap[id] = name;
    if (id && birthCol >= 0 && !idBirthMap[id]) {
      var birth = (row[birthCol] || '').toString().trim();
      if (birth) idBirthMap[id] = birth;
    }

    var cat = recognizeVaccineCategory(raw, config);
    if (!cat) {
      unrecognized.push({ name: name || '未知', type: raw || '空白' });
      continue;
    }
    if (!id) continue;

    if (!idCategoryCount[id]) idCategoryCount[id] = {};
    if (!idCategoryCount[id][cat]) {
      idCategoryCount[id][cat] = 0;
      classification[cat].push(id);
    }
    idCategoryCount[id][cat]++;

    // 流感列記錄 F 對象別代碼
    if (keyFamily[cat] === 'flu' && identityCol >= 0 && !idFCodeMap[id]) {
      var fc = (row[identityCol] || '').toString().trim().toUpperCase();
      if (fc) idFCodeMap[id] = fc;
    }
  }

  return {
    idNameMap: idNameMap,
    idBirthMap: idBirthMap,
    classification: classification,
    idCategoryCount: idCategoryCount,
    unrecognized: unrecognized,
    idFCodeMap: idFCodeMap,
    hasIdentityCol: identityCol >= 0
  };
}

// HIS 檔上傳槽定義（compareCSVFiles 加計與 buildNiisExport 共用）
var PHIS_SLOTS = [
  { slot: 'k', family: 'corona', expect: '6K' },
  { slot: 'z', family: 'flu',    expect: '6Z' },
  { slot: 'v', family: 'lung',   expect: '6V' }
];

// ===== HIS 掛號檔解析（v3.5 起） =====
// 實測 HIS 匯出為 13 欄（身份證在第4欄、「優待別」欄標 6V/6k/6Z）；
// 以表頭關鍵字偵測欄位，舊格式（A欄=身分證、B欄=姓名）也相容。
function parsePhisList(content) {
  var rows = Utilities.parseCsv(content);
  var header = rows[0] || [];
  var idCol = -1, nameCol = -1, birthCol = -1, typeCol = -1, diagCol = -1,
      doseCol = -1, identCol = -1, sexCol = -1, phoneCol = -1, addrCol = -1;
  for (var c = 0; c < header.length; c++) {
    var h = String(header[c] || '');
    if (idCol === -1 && (h.indexOf('身份證') !== -1 || h.indexOf('身分證') !== -1)) idCol = c;
    if (nameCol === -1 && h.indexOf('姓名') !== -1) nameCol = c;
    if (birthCol === -1 && h.indexOf('出生') !== -1) birthCol = c;
    if (typeCol === -1 && h.indexOf('優待別') !== -1) typeCol = c;
    if (diagCol === -1 && h.indexOf('診斷代號') !== -1) diagCol = c;
    if (doseCol === -1 && h.indexOf('疫苗劑別') !== -1) doseCol = c;
    if (identCol === -1 && (h.indexOf('身分別') !== -1 || h.indexOf('身份別') !== -1)) identCol = c;
    if (sexCol === -1 && h.indexOf('性別') !== -1) sexCol = c;
    if (phoneCol === -1 && h.indexOf('電話') !== -1) phoneCol = c;   // 第一個電話欄（電話1）
    if (addrCol === -1 && h.indexOf('地址') !== -1) addrCol = c;
  }
  if (idCol === -1) { idCol = 0; if (nameCol === -1) nameCol = 1; }  // 無表頭關鍵字時回退舊格式

  var idNameMap = {};
  var idBirthMap = {};
  var idHintMap = {};    // 診斷代號＋疫苗劑別（供辨識加計群組）
  var idIdentMap = {};   // NIIS身分別（身分別代碼）
  var idSexMap = {};
  var idPhoneMap = {};
  var idAddrMap = {};
  var idDoseMap = {};
  var typeValues = {};   // 出現過的優待別值（大寫 -> 原值），整欄掃描供驗證
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i] || [];
    var id = (row[idCol] || '').toString().trim().toUpperCase();
    if (!id) continue;
    if (!idNameMap[id]) idNameMap[id] = ((nameCol >= 0 ? row[nameCol] : '') || '').toString().trim() || id;
    if (birthCol >= 0 && !idBirthMap[id]) {
      var b = (row[birthCol] || '').toString().trim();
      if (b) idBirthMap[id] = b;
    }
    if (!idHintMap[id]) {
      var hint = ((diagCol >= 0 ? row[diagCol] : '') || '').toString().trim() + ' ' +
                 ((doseCol >= 0 ? row[doseCol] : '') || '').toString().trim();
      hint = hint.trim();
      if (hint) idHintMap[id] = hint;
    }
    if (identCol >= 0 && !idIdentMap[id]) {
      var ident = (row[identCol] || '').toString().trim();
      if (ident) idIdentMap[id] = ident.toUpperCase();
    }
    if (sexCol >= 0 && !idSexMap[id]) idSexMap[id] = (row[sexCol] || '').toString().trim();
    if (phoneCol >= 0 && !idPhoneMap[id]) idPhoneMap[id] = (row[phoneCol] || '').toString().trim();
    if (addrCol >= 0 && !idAddrMap[id]) idAddrMap[id] = (row[addrCol] || '').toString().trim();
    if (doseCol >= 0 && !idDoseMap[id]) idDoseMap[id] = (row[doseCol] || '').toString().trim();
    if (typeCol >= 0) {
      var tv = (row[typeCol] || '').toString().trim();
      if (tv) typeValues[tv.toUpperCase()] = tv;
    }
  }
  return { idNameMap: idNameMap, idBirthMap: idBirthMap, idHintMap: idHintMap,
           idIdentMap: idIdentMap, idSexMap: idSexMap, idPhoneMap: idPhoneMap,
           idAddrMap: idAddrMap, idDoseMap: idDoseMap,
           typeValues: typeValues, hasTypeCol: typeCol >= 0 };
}

// 流感疫苗接種計畫接種對象代碼對照表（附件14，2026-08 新標準）
// 未列出的代碼會以原代碼動態顯示，不會漏計
var FLU_TARGET_NAMES = {
  F01:    '6個月以上至國小入學前幼兒',
  F02A01: '國小學童',
  F02A02: '國中生',
  F02A03: '高中/職、五專1-3年級學生',
  F02B:   '幼兒園托育機構工作人員/居家托育人員',
  F03A:   '滿50歲以上成人（所內/合約院所）',
  F03B:   '滿50歲以上成人（社區/企業/到宅）',
  F04A:   '長照機構受照顧者',
  F04B:   '長照機構直接照顧工作人員',
  F05A:   '孕婦',
  F05B:   '6個月內嬰兒之雙親/實際扶養者',
  F06A:   '高風險慢性病患',
  F06B:   '罕見疾病患者',
  F06C:   '重大傷病患者',
  F07A:   '具執業登記之醫事人員',
  F07B:   '醫療院所非執登工作人員',
  F07C:   '防疫相關人員',
  F07D:   '禽畜養殖/動物防疫相關行業工作人員',
  F09:    '擴大對象'
};

// ===== 產 NIIS 匯入檔（v3.7） =====
// 媒體資料上傳範本 24 欄表頭（NIIS 官方格式）
var NIIS_EXPORT_HEADER = '幼兒身分證號,嬰幼兒姓名,嬰幼兒性別,(必填)幼兒出生日期,同胎次序,通訊地址,電話,父或母身分證號,(必填)接種機構,(必填)接種日期,(必填)疫苗種類,(必填)疫苗劑別,(必填)疫苗批號,疫苗廠商,(必填)疫苗型別,曾接種流感疫苗,身分別,接種站識別碼,期別,時段,醫師,接種位址,接種站名稱,處置費註記(非必填)';

// 新冠年齡對照表預設（附件：COVID-19 身分別代碼，依接種對象之年齡）
function getDefaultCovidTable() {
  return [
    { label: '0-4 歲（6個月以上）', max: 4,   code: 'C15' },
    { label: '5-11 歲',            max: 11,  code: 'C14' },
    { label: '12-17 歲',           max: 17,  code: 'C17' },
    { label: '18-49 歲',           max: 49,  code: 'C12' },
    { label: '50-64 歲',           max: 64,  code: 'C10' },
    { label: '65-74 歲',           max: 74,  code: 'C11' },
    { label: '75 歲以上',          max: 999, code: 'C08A' }
  ];
}

// 流感對象別代碼表預設（附件14）
function getDefaultFluCodeTable() {
  return [
    { code: 'F01',    label: '6個月以上至國小入學前幼兒' },
    { code: 'F02A01', label: '國小學童' },
    { code: 'F02A02', label: '國中生' },
    { code: 'F02A03', label: '高中/職、五專1-3年級學生' },
    { code: 'F02B',   label: '幼兒園托育機構/居家托育人員' },
    { code: 'F03A',   label: '滿50歲以上成人（所內/合約院所）' },
    { code: 'F03B',   label: '滿50歲以上成人（社區/到宅）' },
    { code: 'F04A',   label: '長照機構受照顧者' },
    { code: 'F04B',   label: '長照機構直接照顧工作人員' },
    { code: 'F05A',   label: '孕婦' },
    { code: 'F05B',   label: '6個月內嬰兒之雙親/實際扶養者' },
    { code: 'F06A',   label: '高風險慢性病患' },
    { code: 'F06B',   label: '罕見疾病患者' },
    { code: 'F06C',   label: '重大傷病患者' },
    { code: 'F07A',   label: '具執業登記之醫事人員' },
    { code: 'F07B',   label: '醫療院所非執登工作人員' },
    { code: 'F07C',   label: '防疫相關人員' },
    { code: 'F07D',   label: '禽畜養殖/動物防疫相關行業工作人員' },
    { code: 'F09',    label: '擴大對象' }
  ];
}

// 預設值取自 2026-08 實際匯入成功案例（批號來自結存量檔）
function getDefaultNiisExportConfig() {
  return {
    org: '2341050013',
    idCodes: { fluIn: 'F03A', fluOut: 'F03B' },
    covidTable: getDefaultCovidTable(),
    fluCodeTable: getDefaultFluCodeTable(),
    // 流感公費門檻：特別月份（10月）需滿 specialMinAge，其他月份滿 normalMinAge
    fluRule: { specialMonth: 10, specialMinAge: 65, normalMinAge: 50 },
    batches: [
      { type: 'CoV_Moderna_LP', lot: '3053857_1150826-CDC', exp: '1150826', qty: '', family: 'corona' },
      { type: '20PCV', lot: 'ND3093-CDC', exp: '1160430', qty: '', family: 'lung' },
      { type: '20PCV', lot: 'NT3016-CDC', exp: '1161031', qty: '', family: 'lung' },
      { type: '21PCV', lot: 'A007292-CDC', exp: '1170407', qty: '', family: 'lung' }
    ],
    lastPick: {}
  };
}

function getNiisExportConfig() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('niisExportConfig');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.batches) return cleanNiisExportConfig(parsed);   // 順帶補齊舊版缺欄位
    }
  } catch (e) {
    // 設定損壞時回退預設
  }
  return getDefaultNiisExportConfig();
}

function cleanNiisExportConfig(cfg) {
  cfg = cfg || {};
  var def = getDefaultNiisExportConfig();
  var idc = cfg.idCodes || {};
  var clean = {
    org: String(cfg.org || '').trim().slice(0, 20) || def.org,
    idCodes: {
      // 舊版欄位 flu 遷移為 fluIn
      fluIn: String(idc.fluIn || idc.flu || 'F03A').trim().slice(0, 10).toUpperCase(),
      fluOut: String(idc.fluOut || 'F03B').trim().slice(0, 10).toUpperCase()
    },
    covidTable: [],
    fluRule: (function(fr) {
      // 允許門檻 0 歲（不限齡），只有空/非數字才回預設
      function num(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }
      return {
        specialMonth: num(fr.specialMonth, 10) || 10,
        specialMinAge: num(fr.specialMinAge, 65),
        normalMinAge: num(fr.normalMinAge, 50)
      };
    })(cfg.fluRule || {}),
    batches: [],
    lastPick: {}
  };
  if (clean.fluRule.specialMonth < 1 || clean.fluRule.specialMonth > 12) clean.fluRule.specialMonth = 10;
  var srcTable = (cfg.covidTable && cfg.covidTable.length === 7) ? cfg.covidTable : def.covidTable;
  for (var t = 0; t < 7; t++) {
    clean.covidTable.push({
      label: def.covidTable[t].label,
      max: def.covidTable[t].max,
      code: String((srcTable[t] || {}).code || def.covidTable[t].code).trim().slice(0, 10).toUpperCase()
    });
  }
  // 流感對象別代碼表（可編輯；空/壞資料回退附件14 預設）
  clean.fluCodeTable = [];
  var srcFlu = cfg.fluCodeTable || [];
  var seenFlu = {};
  for (var f2 = 0; f2 < srcFlu.length && clean.fluCodeTable.length < 40; f2++) {
    var fc = String((srcFlu[f2] || {}).code || '').trim().slice(0, 10).toUpperCase();
    var fl = String((srcFlu[f2] || {}).label || '').trim().slice(0, 40);
    if (!fc || seenFlu[fc]) continue;
    seenFlu[fc] = true;
    clean.fluCodeTable.push({ code: fc, label: fl });
  }
  if (clean.fluCodeTable.length === 0) clean.fluCodeTable = getDefaultFluCodeTable();
  var list = cfg.batches || [];
  var seen = {};
  for (var i = 0; i < list.length && clean.batches.length < 100; i++) {
    var b = list[i] || {};
    var t = String(b.type || '').trim().slice(0, 40);
    var l = String(b.lot || '').trim().slice(0, 40);
    if (!t || !l || seen[t + '|' + l]) continue;
    seen[t + '|' + l] = true;
    clean.batches.push({
      type: t, lot: l,
      exp: String(b.exp || '').trim().slice(0, 10),
      qty: String(b.qty || '').trim().slice(0, 10),
      family: (b.family === 'corona' || b.family === 'flu' || b.family === 'lung') ? b.family : ''
    });
  }
  var lp = cfg.lastPick || {};
  var slots = ['k', 'z', 'v'];
  for (var s = 0; s < slots.length; s++) {
    if (lp[slots[s]]) clean.lastPick[slots[s]] = String(lp[slots[s]]).slice(0, 90);
  }
  return clean;
}

function saveNiisExportConfig(cfg) {
  try {
    var clean = cleanNiisExportConfig(cfg);
    PropertiesService.getScriptProperties().setProperty('niisExportConfig', JSON.stringify(clean));
    return { success: true, config: clean };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 匯入結存量檔解析出的針劑清單（前端解析 XLS 後傳入 [{type, lot, exp, qty}]）
 * 併入現有設定（同 種類+批號 視為同筆、更新效期/結存），依疫苗辨識設定自動歸類別。
 */
function importNiisBatches(entries, currentCfg) {
  try {
    var cfg = cleanNiisExportConfig(currentCfg || getNiisExportConfig());
    var config = getVaccineConfigList();
    var keyFam = {};
    for (var g = 0; g < config.length; g++) keyFam[config[g].key] = config[g].family;

    var byKey = {};
    for (var i = 0; i < cfg.batches.length; i++) byKey[cfg.batches[i].type + '|' + cfg.batches[i].lot] = cfg.batches[i];

    var added = 0, updated = 0;
    entries = entries || [];
    for (var e = 0; e < entries.length && e < 300; e++) {
      var en = entries[e] || {};
      var t = String(en.type || '').trim().slice(0, 40);
      var l = String(en.lot || '').trim().slice(0, 40);
      if (!t || !l) continue;
      var exp = String(en.exp || '').trim().slice(0, 10);
      var qty = String(en.qty == null ? '' : en.qty).trim().slice(0, 10);
      var k = t + '|' + l;
      if (byKey[k]) {
        if (exp) byKey[k].exp = exp;
        if (qty !== '') byKey[k].qty = qty;
        updated++;
      } else {
        var gk = recognizeVaccineCategory(t, config);
        var fam = gk ? (keyFam[gk] || '') : '';
        var nb = { type: t, lot: l, exp: exp, qty: qty, family: fam };
        cfg.batches.push(nb);
        byKey[k] = nb;
        added++;
      }
    }
    var saved = saveNiisExportConfig(cfg);
    if (!saved.success) return saved;
    return { success: true, config: saved.config, added: added, updated: updated };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function csvField(v) {
  v = (v == null ? '' : String(v));
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

// 前端產檔面板用：NIIS 名單三類別身分證集合（與加計/略過邏輯同一套辨識設定）
function getNiisFamilyIds(jnContent) {
  try {
    var out = { corona: {}, flu: {}, lung: {} };
    if (!jnContent) return out;
    var config = getVaccineConfigList();
    var keyFam = {};
    for (var g = 0; g < config.length; g++) keyFam[config[g].key] = config[g].family;
    var data = analyzeNIIS(jnContent, config);
    for (var id in data.idCategoryCount) {
      for (var k in data.idCategoryCount[id]) {
        var fam = keyFam[k];
        if (fam && out[fam]) out[fam][id] = true;
      }
    }
    return out;
  } catch (e) {
    return { corona: {}, flu: {}, lung: {} };
  }
}

// 相容舊呼叫
function getNiisFluIds(jnContent) {
  return getNiisFamilyIds(jnContent).flu;
}

// 民國日期字串取「年」：'0420910'→42、'480327'→48、'1100315'→110
function rocYearOf(roc) {
  roc = String(roc || '').replace(/\D/g, '');
  if (roc.length < 6) return null;
  var y = parseInt(roc.slice(0, roc.length - 4), 10);
  return isNaN(y) ? null : y;
}

// 年齡（只看出生年不看月）：接種年 − 出生年；無法解析回傳 null
function ageByYear(birthRoc, vacRoc) {
  var by = rocYearOf(birthRoc);
  var vy = rocYearOf(vacRoc);
  if (by == null || vy == null) return null;
  var age = vy - by;
  return age < 0 ? null : age;
}

/**
 * COVID-19 身分別代碼：依接種對象之年齡查對照表（表可於設定面板修改）
 */
function covidIdentityByAge(birthRoc, vacRoc, table) {
  var age = ageByYear(birthRoc, vacRoc);
  if (age == null) return '';
  table = (table && table.length === 7) ? table : getDefaultCovidTable();
  for (var i = 0; i < table.length; i++) {
    if (age <= table[i].max) return table[i].code;
  }
  return table[table.length - 1].code;
}

// 流感公費門檻歲數：接種月份為特別月份（預設10月）→ specialMinAge，否則 normalMinAge
function fluMinAge(vacRoc, fluRule) {
  fluRule = fluRule || { specialMonth: 10, specialMinAge: 65, normalMinAge: 50 };
  var m = parseInt(String(vacRoc || '').slice(3, 5), 10);
  return (m === fluRule.specialMonth) ? fluRule.specialMinAge : fluRule.normalMinAge;
}

/**
 * 產 NIIS 匯入檔：HIS 檔中 NIIS 名單沒有的人 → 媒體上傳格式 CSV（Big5）
 * picks = { slots: { k/z/v: { type, lot, dose } }, idCodes: { corona, flu }, org, date }
 * 身分別：HIS 檔內「NIIS身分別」值優先，否則新冠/流感用預設代號；肺鏈不填。
 */
function buildNiisExport(phisFiles, jnContent, picks) {
  try {
    phisFiles = phisFiles || {};
    picks = picks || {};
    var slotPicks = picks.slots || {};
    var fluCodes = picks.fluCodes || {};       // 流感每人個別拉選的身分別（id -> F代碼）
    var personBatch = picks.personBatch || {}; // 每人個別拉選的針劑（slot -> { id: 'type|lot' }）
    var org = String(picks.org || '').trim();
    var date = String(picks.date || '').trim();
    if (!org) return { errorMessage: '接種機構代碼未設定！' };
    if (!/^\d{7}$/.test(date)) return { errorMessage: '接種日期格式錯誤，請填民國 7 碼（如 1150810）！' };

    // 自動判讀規則：前端帶最新設定，缺漏時回退雲端儲存值
    var ruleCfg = cleanNiisExportConfig(picks.rules || getNiisExportConfig());
    var covidTable = ruleCfg.covidTable;
    var fluRule = ruleCfg.fluRule;
    var fluDefault = picks.outpost ? ruleCfg.idCodes.fluOut : ruleCfg.idCodes.fluIn;
    var minAge = fluMinAge(date, fluRule);

    var config = getVaccineConfigList();
    var keyFam = {};
    for (var g = 0; g < config.length; g++) keyFam[config[g].key] = config[g].family;

    // NIIS 名單各類別集合（已在 NIIS 的人不匯出）
    var niisFam = { corona: {}, flu: {}, lung: {} };
    if (jnContent) {
      var data = analyzeNIIS(jnContent, config);
      for (var nid in data.idCategoryCount) {
        for (var nk in data.idCategoryCount[nid]) {
          var fam = keyFam[nk];
          if (fam) niisFam[fam][nid] = true;
        }
      }
    }

    var lines = [NIIS_EXPORT_HEADER];
    var count = 0, skipped = 0;
    var exported = [];   // {name, slot} 供前端顯示
    for (var s = 0; s < PHIS_SLOTS.length; s++) {
      var def = PHIS_SLOTS[s];
      var content = phisFiles[def.slot];
      if (!content) continue;
      var parsed = parsePhisList(content);
      if (parsed.hasTypeCol) {
        for (var tvk in parsed.typeValues) {
          if (tvk !== def.expect) {
            return { errorMessage: 'HIS ' + def.expect + ' 檔案錯誤：優待別欄出現「' + parsed.typeValues[tvk] + '」！' };
          }
        }
      }
      var ids = Object.keys(parsed.idNameMap).sort(function(a, b) {
        return (parsed.idNameMap[a] || '').localeCompare(parsed.idNameMap[b] || '', 'zh-Hant');
      });
      var pick = slotPicks[def.slot] || {};
      var slotDose = String(pick.dose || '').trim();
      var slotPB = personBatch[def.slot] || {};
      var slotRows = [];
      var noBirth = [];      // 新冠缺出生日期（擋下列名）
      var fluBad = [];       // 流感年齡不符公費門檻且未拉選（擋下列名）
      var noBatch = [];      // 個別與主選針劑皆無（擋下列名）
      for (var i = 0; i < ids.length; i++) {
        var pid = ids[i];
        if (niisFam[def.family][pid]) { skipped++; continue; }
        // 針劑：個別拉選優先，否則用該檔主選
        var pType = pick.type || '';
        var pLot = pick.lot || '';
        if (slotPB[pid]) {
          var pbParts = String(slotPB[pid]).split('|');
          if (pbParts[0]) { pType = pbParts[0]; pLot = pbParts.slice(1).join('|'); }
        }
        if (!pType || !pLot) noBatch.push(parsed.idNameMap[pid] || pid);
        var identity = '';
        if (def.family === 'corona') {
          // 新冠：一律依年齡自動判斷（只看出生年，對照表可設定）
          identity = covidIdentityByAge(parsed.idBirthMap[pid], date, covidTable);
          if (!identity) noBirth.push(parsed.idNameMap[pid] || pid);
        } else if (def.family === 'flu') {
          // 流感：個別拉選優先；未拉選者需符合公費門檻才帶預設（所內/外設）
          if (fluCodes[pid]) {
            identity = fluCodes[pid];
          } else {
            var fAge = ageByYear(parsed.idBirthMap[pid], date);
            if (fAge != null && fAge >= minAge) identity = fluDefault;
            else fluBad.push((parsed.idNameMap[pid] || pid) + (fAge != null ? '（' + fAge + ' 歲）' : '（缺出生）'));
          }
        }
        // 肺鏈不填身分別
        var sex = parsed.idSexMap[pid] || '';
        sex = sex.indexOf('男') !== -1 ? 'M' : (sex.indexOf('女') !== -1 ? 'F' : sex);
        var birth = (parsed.idBirthMap[pid] || '').replace(/^0+/, '');   // 民國前置 0 去除（0480327→480327）
        var dose = String(parsed.idDoseMap[pid] || '').trim() || slotDose || '1';
        slotRows.push([
          pid, parsed.idNameMap[pid] || '', sex, birth, '1',
          parsed.idAddrMap[pid] || '', parsed.idPhoneMap[pid] || '', '',
          org, date, pType, dose, pLot, '', '1', '',
          identity, '', '', '', '', '', '', ''
        ]);
        exported.push({ name: parsed.idNameMap[pid] || pid, slot: def.expect });
      }
      if (noBirth.length > 0) {
        return { errorMessage: '新冠名單缺出生日期，無法依年齡判斷身分別，請修正 HIS 檔：' + noBirth.join('、') };
      }
      if (fluBad.length > 0) {
        return { errorMessage: '流感名單有不符公費門檻者（' + (fluMinAge(date, fluRule) === fluRule.specialMinAge ?
          fluRule.specialMonth + ' 月需滿 ' + fluRule.specialMinAge : '需滿 ' + fluRule.normalMinAge) +
          ' 歲），請個別拉選例外身分別：' + fluBad.join('、') };
      }
      if (noBatch.length > 0) {
        return { errorMessage: 'HIS ' + def.expect + ' 有人未分配針劑（個別未拉選且無主選）：' + noBatch.join('、') };
      }
      if (slotRows.length > 0) {
        for (var r = 0; r < slotRows.length; r++) {
          var cells = [];
          for (var c = 0; c < slotRows[r].length; c++) cells.push(csvField(slotRows[r][c]));
          lines.push(cells.join(','));
        }
        count += slotRows.length;
      }
    }

    if (count === 0) {
      return { errorMessage: skipped > 0
        ? 'HIS 檔中 ' + skipped + ' 人都已在 NIIS 名單，沒有需要匯入的人！'
        : 'HIS 檔中沒有可匯出的資料！' };
    }

    var csv = lines.join('\r\n') + '\r\n';
    var fileName = 'NIIS匯入_' + date + '.csv';
    var blob = Utilities.newBlob('', 'text/csv', fileName).setDataFromString(csv, 'Big5');
    return {
      fileName: fileName,
      base64: Utilities.base64Encode(blob.getBytes()),
      count: count,
      skipped: skipped,
      exported: exported
    };
  } catch (error) {
    return { errorMessage: '產檔失敗：' + error.toString() };
  }
}

/**
 * 主統計函數（v3.2：辨識規則由設定驅動；v3.6：HIS 掛號檔加計與流感 F 分類）
 * 回傳：
 *  - { errorMessage } 檔案問題
 *  - { needUserInput, errorType, errorPersons, message } 需人工排除的異常
 *  - { htmlContent, nonCoronaCount, nonCoronaDetails, stats, processingMs } 統計結果
 */
function compareCSVFiles(jnContent, masterFileName, phisFiles) {
  var t0 = Date.now();

  if (!jnContent) {
    return { errorMessage: '請上傳 NIIS 名單檔案！' };
  }
  if (masterFileName && masterFileName.toLowerCase().indexOf('niis') === -1) {
    return { errorMessage: "請確認上傳的檔案名稱包含 'NIIS' 字樣" };
  }

  // ===== HIS 掛號檔（選傳）：解析＋優待別驗證 =====
  phisFiles = phisFiles || {};
  var phisParsed = {};   // slot -> parsePhisList 結果
  for (var p = 0; p < PHIS_SLOTS.length; p++) {
    var slotDef = PHIS_SLOTS[p];
    var pc = phisFiles[slotDef.slot];
    if (!pc) continue;
    var parsed = parsePhisList(pc);
    if (parsed.hasTypeCol) {
      for (var tvk in parsed.typeValues) {
        if (tvk !== slotDef.expect) {
          return { errorMessage: 'HIS ' + slotDef.expect + ' 檔案錯誤：優待別欄出現「' +
            parsed.typeValues[tvk] + '」，請確認檔案是否放錯欄位！' };
        }
      }
    }
    phisParsed[slotDef.slot] = parsed;
  }

  var config = getVaccineConfigList();
  var groupByKey = {};
  for (var g = 0; g < config.length; g++) groupByKey[config[g].key] = config[g];

  var data = analyzeNIIS(jnContent, config);
  var idNameMap = data.idNameMap;
  var idBirthMap = data.idBirthMap;
  var classification = data.classification;
  var idCategoryCount = data.idCategoryCount;

  // ===== HIS 掛號檔人員併入統計（v3.6：不對針，直接加計） =====
  // NIIS 名單沒有的人加進針數與群組，名字旁備註 (HIS)；同類別已有針者不重複計。
  var hisSource = {};        // id -> ['6K','6V',...]（由 HIS 檔加計者）
  var hisAddPerGroup = {};   // 群組key -> 加計針數
  for (var hs = 0; hs < PHIS_SLOTS.length; hs++) {
    var hDef = PHIS_SLOTS[hs];
    var hParsed = phisParsed[hDef.slot];
    if (!hParsed) continue;
    var famGroups = [];
    for (var hg = 0; hg < config.length; hg++) {
      if (config[hg].family === hDef.family) famGroups.push(config[hg]);
    }
    if (famGroups.length === 0) continue;
    for (var hid in hParsed.idNameMap) {
      // 同類別已在 NIIS 有針 → 不重複計
      var already = false;
      var hcats = idCategoryCount[hid];
      if (hcats) {
        for (var hk in hcats) {
          var hGrp = groupByKey[hk];
          if (hGrp && hGrp.family === hDef.family) { already = true; break; }
        }
      }
      if (already) continue;
      // 以 HIS 檔「診斷代號/疫苗劑別」比對辨識代號（限同類別群組），辨識不到用第一組
      var target = null;
      var hint = String(hParsed.idHintMap[hid] || '').toUpperCase();
      if (hint) {
        var hBest = 0;
        for (var hg2 = 0; hg2 < famGroups.length; hg2++) {
          var hCodes = famGroups[hg2].codes || [];
          for (var hc2 = 0; hc2 < hCodes.length; hc2++) {
            var hScore = matchScore(hint, hCodes[hc2]);
            if (hScore > hBest) { hBest = hScore; target = famGroups[hg2]; }
          }
        }
      }
      if (!target) target = famGroups[0];
      if (!idCategoryCount[hid]) idCategoryCount[hid] = {};
      idCategoryCount[hid][target.key] = 1;
      classification[target.key].push(hid);
      hisAddPerGroup[target.key] = (hisAddPerGroup[target.key] || 0) + 1;
      if (!idNameMap[hid]) idNameMap[hid] = hParsed.idNameMap[hid];
      if (!idBirthMap[hid] && hParsed.idBirthMap[hid]) idBirthMap[hid] = hParsed.idBirthMap[hid];
      (hisSource[hid] = hisSource[hid] || []).push(hDef.expect);
      // 6Z 檔「NIIS身分別」欄帶入流感 F 分類
      if (hDef.family === 'flu' && hParsed.idIdentMap[hid] && !data.idFCodeMap[hid]) {
        data.idFCodeMap[hid] = hParsed.idIdentMap[hid];
        data.hasIdentityCol = true;
      }
    }
  }

  // ===== 同人同疫苗重複掛號（阻擋，需回系統退掛） =====
  var duplicatePersons = [];
  for (var id in idCategoryCount) {
    var catCounts = idCategoryCount[id];
    for (var cat in catCounts) {
      if (catCounts[cat] > 1) {
        duplicatePersons.push({
          id: id,
          name: idNameMap[id] || id,
          errorType: '同人同疫苗重複',
          description: '重複掛號 ' + shortLabel(groupByKey[cat]) + '（' + catCounts[cat] + ' 筆）'
        });
      }
    }
  }
  if (duplicatePersons.length > 0) {
    return {
      needUserInput: true,
      errorType: 'duplicate_vaccine',
      errorPersons: duplicatePersons,
      message: '發現同人同疫苗重複掛號，請至系統手動排除：'
    };
  }

  // 依 id 取得各類別（corona/flu/lung）所屬群組
  function familyGroupsOf(id) {
    var fams = { corona: [], flu: [], lung: [] };
    var cats = idCategoryCount[id];
    for (var key in cats) {
      var grp = groupByKey[key];
      if (grp && fams[grp.family]) fams[grp.family].push(grp);
    }
    return fams;
  }

  // ===== 疫苗組合異常（阻擋，需回系統退掛） =====
  var errorPersons = [];
  for (var id in idCategoryCount) {
    var fams = familyGroupsOf(id);
    var hasCorona = fams.corona.length > 0;
    var hasFlu = fams.flu.length > 0;
    var hasLung = fams.lung.length > 0;
    var name = idNameMap[id] || id;

    // 三種疫苗重複（最高優先級）
    if (hasCorona && hasFlu && hasLung) {
      errorPersons.push({
        id: id,
        name: name,
        errorType: '三種疫苗重複',
        description: '同時有新冠、流感、肺鏈疫苗'
      });
      continue;
    }
    // 同類別多種疫苗重複（例：Moderna+Novavax、20PCV+21PCV）
    for (var fam in fams) {
      if (fams[fam].length >= 2) {
        var names = [];
        for (var f = 0; f < fams[fam].length; f++) names.push(shortLabel(fams[fam][f]));
        errorPersons.push({
          id: id,
          name: name,
          errorType: '多種' + FAMILY_NAMES[fam] + '疫苗重複',
          description: '同時有 ' + names.join(' 和 ')
        });
      }
    }
  }
  if (errorPersons.length > 0) {
    return {
      needUserInput: true,
      errorType: 'vaccine_conflicts',
      errorPersons: errorPersons,
      message: '發現疫苗異常人員，請確認是否掛錯：'
    };
  }

  // ===== 人員分組（通過異常檢查後，每人至多兩類疫苗） =====
  var groupCoronaFlu = [];
  var groupFluLung = [];
  var groupCoronaLung = [];
  var onlyCorona = [];
  var onlyFlu = [];
  var onlyLung = [];

  for (var id in idCategoryCount) {
    var fams = familyGroupsOf(id);
    var hasCorona = fams.corona.length > 0;
    var hasFlu = fams.flu.length > 0;
    var hasLung = fams.lung.length > 0;

    if (hasCorona && hasFlu) groupCoronaFlu.push(id);
    else if (hasFlu && hasLung) groupFluLung.push(id);
    else if (hasCorona && hasLung) groupCoronaLung.push(id);
    else if (hasCorona) onlyCorona.push(id);
    else if (hasFlu) onlyFlu.push(id);
    else if (hasLung) onlyLung.push(id);
  }

  // 依姓名筆劃排序
  function byStroke(a, b) {
    var na = idNameMap[a];
    var nb = idNameMap[b];
    if (!na) return 1;
    if (!nb) return -1;
    return na.localeCompare(nb, 'zh-Hant');
  }
  groupCoronaFlu.sort(byStroke);
  groupFluLung.sort(byStroke);
  groupCoronaLung.sort(byStroke);
  onlyCorona.sort(byStroke);
  onlyFlu.sort(byStroke);
  onlyLung.sort(byStroke);

  // 各類別人員集合（流感 F 分類用，含 HIS 加計者）
  var niisFamilyIds = { corona: [], flu: [], lung: [] };
  for (var nid in idCategoryCount) {
    var nf = familyGroupsOf(nid);
    if (nf.corona.length) niisFamilyIds.corona.push(nid);
    if (nf.flu.length) niisFamilyIds.flu.push(nid);
    if (nf.lung.length) niisFamilyIds.lung.push(nid);
  }

  // ===== 針數計算（依設定群組） =====
  var stats = {};
  var totalShots = 0;
  for (var g = 0; g < config.length; g++) {
    stats[config[g].key] = classification[config[g].key].length;
    totalShots += stats[config[g].key];
  }
  var totalPersons = Object.keys(idCategoryCount).length;

  // ===== HTML 產生 =====

  // 個人 tooltip：身分證 + 出生 + 疫苗明細
  function personTip(id) {
    var labels = [];
    var cats = idCategoryCount[id] || {};
    for (var g = 0; g < config.length; g++) {
      if (cats[config[g].key]) labels.push(shortLabel(config[g]));
    }
    return '身分證：' + escapeHtml(id) +
      (idBirthMap[id] ? '&#10;出生：' + escapeHtml(idBirthMap[id]) : '') +
      '&#10;疫苗：' + escapeHtml(labels.join('、') || '無') + '&#10;本日共 ' + labels.length + ' 針' +
      (hisSource[id] ? '&#10;來源：HIS ' + escapeHtml(hisSource[id].join('、')) + ' 掛號檔加計（該疫苗 NIIS 名單無）'
                     : '&#10;來源：NIIS 名單');
  }

  function personSpan(id, color) {
    var name = escapeHtml(idNameMap[id] || id);
    var indicators = '';
    var cats = idCategoryCount[id] || {};
    for (var g = 0; g < config.length; g++) {
      if (cats[config[g].key] && config[g].indicator) indicators += escapeHtml(config[g].indicator);
    }
    // HIS 加計者：名字（含疫苗標記）加底線＋底線外紅色粗體＊，浮標顯示來源
    var inner = name + indicators;
    if (hisSource[id]) {
      inner = "<span class='his-added'>" + inner + "</span><span class='his-mark'>＊</span>";
    }
    // data-pid/fams/birth：前端浮標據此即時計算「目前身分別」（設定變更即時反映）
    var fams = familyGroupsOf(id);
    var famList = [];
    if (fams.corona.length) famList.push('corona');
    if (fams.flu.length) famList.push('flu');
    if (fams.lung.length) famList.push('lung');
    return "<span class='pname' style='color:" + color + ";' data-pid=\"" + escapeHtml(id) +
      "\" data-fams=\"" + famList.join(',') + "\" data-birth=\"" + escapeHtml(idBirthMap[id] || '') +
      "\"" + (hisSource[id] ? " data-his=\"1\"" +
        (hisSource[id].indexOf('6Z') !== -1 ? " data-his-flu=\"1\"" : '') : '') +
      " data-tip=\"" + personTip(id) + "\">" + inner + '</span>';
  }

  function needleBlock(group, count) {
    if (count <= 0) return '';
    var key = group.key;
    var hisAdd = hisAddPerGroup[group.key] || 0;
    var tip = '名單統計：' + count + ' 針' +
      (hisAdd ? '（含 HIS 掛號檔加計 ' + hisAdd + ' 針）' : '') +
      '&#10;可用右側 + / - 或直接輸入數字手動修正';
    var html = "<div class='section'>";
    html += "<div class='box " + group.box + "'>";
    html += "<strong style='font-size:20px;'>" + escapeHtml(group.label) + '：</strong> ';
    html += "<span class='needle-count' id='" + key + "NeedleCount' data-tip=\"" + tip + "\">";
    html += "<span style='color:#27ae60;font-weight:bold;'>" + count + '</span> 針</span>';
    html += "<div class='needle-adjuster'>";
    html += "<button class='adjust-btn minus-btn' onclick=\"adjustCount('" + key + "', -1)\">-</button>";
    html += "<input type='number' class='adjustment-input-field' id='" + key + "Adjustment' value='0' readonly tabindex='-1'>";
    html += "<button class='adjust-btn plus-btn' onclick=\"adjustCount('" + key + "', 1)\">+</button>";
    html += '</div>';
    html += '</div></div>';
    return html;
  }

  function groupSection(title, color, ids) {
    if (ids.length === 0) return '';
    var html = "<div class='section'>";
    html += "<h3 style='color:" + color + ";'>" + title + ' (' + ids.length + ' 人)</h3>';
    html += "<div style='margin:10px 0; line-height:1.8;'>";
    var spans = [];
    for (var k = 0; k < ids.length; k++) spans.push(personSpan(ids[k], color));
    html += spans.join('、');
    html += '</div></div>';
    return html;
  }

  var result = '<style>' +
    '.section { margin-bottom: 20px; }' +
    '.box { padding: 15px; border-radius: 8px; margin-bottom: 10px; }' +
    '.red-box { background-color: #ffebee; border-left: 4px solid #f44336; }' +           /* Moderna 紅 */
    '.rose-box { background-color: #fad0e3; border-left: 4px solid #c2185b; }' +          /* Novavax 桃紅（接近紅、明顯可區別） */
    '.blue-box { background-color: #e3f2fd; border-left: 4px solid #2196f3; }' +          /* 流感 藍 */
    '.orange-box { background-color: #fff3e0; border-left: 4px solid #ff9800; }' +        /* PPV 標準橘 */
    '.amber-box { background-color: #fff8e1; border-left: 4px solid #ffb300; }' +         /* 20PCV 琥珀橘 */
    '.deep-orange-box { background-color: #ffe9dc; border-left: 4px solid #f4511e; }' +   /* 21PCV 深橘 */
    '.needle-count { font-weight: bold; color: #1976d2; font-size: 24px; }' +
    '.stats-meta { color: #7f8c8d; font-size: 13px; margin-bottom: 16px; }' +
    '.his-mark { color: #c62828; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
    '.his-added { text-decoration: underline; text-underline-offset: 2px; }' +
    '</style>';

  var hisAddTotal = Object.keys(hisSource).length;
  result += "<div class='stats-meta'>統計時間：" +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
    '　名單人數：' + totalPersons + ' 人　總針數：' + totalShots + ' 針' +
    (hisAddTotal > 0
      ? "　｜　<span class='his-added'>底線</span><span class='his-mark'>＊</span>＝ HIS 掛號檔加計 " + hisAddTotal + ' 人（NIIS 名單無）'
      : '') +
    '</div>';

  // 針數區塊：依設定順序
  for (var g = 0; g < config.length; g++) {
    result += needleBlock(config[g], stats[config[g].key]);
  }

  result += groupSection('新冠+流感', '#20b2aa', groupCoronaFlu);
  result += groupSection('流感+肺鏈', '#f57c00', groupFluLung);
  result += groupSection('新冠+肺鏈', '#7b1fa2', groupCoronaLung);
  result += groupSection('僅新冠', '#388e3c', onlyCorona);
  result += groupSection('僅流感', '#1976d2', onlyFlu);
  result += groupSection('僅肺鏈', '#f57c00', onlyLung);

  // 流感身份別 F 分類（v3.5，附件14 新標準；未知代碼以原代碼顯示）
  var idFCodeMap = data.idFCodeMap || {};
  var fGroups = {};
  var fluNoCode = [];
  if (data.hasIdentityCol) {
    for (var q = 0; q < niisFamilyIds.flu.length; q++) {
      var fid = niisFamilyIds.flu[q];
      var fcode = idFCodeMap[fid];
      if (fcode) (fGroups[fcode] = fGroups[fcode] || []).push(fid);
      else fluNoCode.push(fid);
    }
  }
  var fCodes = Object.keys(fGroups).sort();
  for (var fi = 0; fi < fCodes.length; fi++) {
    var codeK = fCodes[fi];
    fGroups[codeK].sort(byStroke);
    var fLabel = '流感 ' + codeK + (FLU_TARGET_NAMES[codeK] ? ' ' + FLU_TARGET_NAMES[codeK] : '（未知對象別）');
    result += groupSection(fLabel, '#8e44ad', fGroups[codeK]);
  }
  if (fCodes.length > 0 && fluNoCode.length > 0) {
    fluNoCode.sort(byStroke);
    result += groupSection('流感 未填身份別', '#8e44ad', fluNoCode);
  }

  return {
    htmlContent: result,
    nonCoronaCount: data.unrecognized.length,
    nonCoronaDetails: data.unrecognized,
    stats: stats,
    totalPersons: totalPersons,
    totalShots: totalShots,
    processingMs: Date.now() - t0
  };
}

// ===== 寄送郵件 =====
// specialHtml（v4.3 選填）：流感特殊身分別檢核表 HTML，轉 PDF 一併附上
function sendEmailWithAttachments(htmlContent, note, files, recipients, specialHtml) {
  try {
    var today = new Date();
    var tz = Session.getScriptTimeZone();
    var formattedDate = Utilities.formatDate(today, tz, 'yyyy-MM-dd');
    var formattedDateTime = Utilities.formatDate(today, tz, 'yyyy-MM-dd HH:mm:ss');
    var shortDate = Utilities.formatDate(today, tz, 'M/d');

    var properties = PropertiesService.getScriptProperties();
    var countKey = 'emailCount_' + formattedDate;
    var currentCount = properties.getProperty(countKey) || 0;
    var nextCount = parseInt(currentCount, 10) + 1;
    properties.setProperty(countKey, nextCount.toString());

    var pdfBlob = Utilities.newBlob(
      modifyContentForPDF(htmlContent),
      'text/html',
      'vaccine_report_' + formattedDate + '_' + String(nextCount).padStart(3, '0') + '.html'
    ).getAs('application/pdf');

    var subject = '疫苗掛號對針統計報告 - ' + formattedDate + '-第' + nextCount + '次通知(非社交工程演練)';
    var autoNote = shortDate + ' 第' + nextCount + '次寄送 寄送時間為' + formattedDateTime;

    var body = '資訊安全通知：本信件來自外部部件，請透過不同管道(電話、即時通訊)確認是否為寄件者寄出，否則請勿點連結或開啟附件。\n\n';
    body += '疫苗掛號對針統計報告\n\n';
    if (note && note.trim()) {
      body += '使用者備註：' + note + '\n';
    }
    body += '系統備註：' + autoNote + '\n\n';
    body += '此郵件由佳里區衛生所疫苗掛號對針統計系統自動發送。';

    var attachments = [pdfBlob];
    if (specialHtml) {
      attachments.push(Utilities.newBlob(
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
        'body { font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif; padding: 14px; color: #2c3e50; }' +
        'table { width: 100%; border-collapse: collapse; }' +
        '</style></head><body>' + specialHtml + '</body></html>',
        'text/html', 'flu_special_' + formattedDate + '.html'
      ).getAs('application/pdf').setName('流感特殊身分別清單_' + formattedDate + '.pdf'));
    }
    if (files && files.length > 0) {
      // 前端傳來 base64 編碼的 CSV 檔案內容，解碼後轉為附件避免亂碼
      for (var i = 0; i < files.length; i++) {
        var fileData = files[i];
        if (fileData.content && fileData.name) {
          attachments.push(Utilities.newBlob(
            Utilities.base64Decode(fileData.content),
            'text/csv',
            fileData.name
          ));
        }
      }
    }

    var emailRecipients = (recipients && recipients.length > 0) ? recipients.join(',') : 'a00820@tncghb.gov.tw';

    MailApp.sendEmail({
      to: emailRecipients,
      subject: subject,
      body: body,
      attachments: attachments,
      name: '掛號小幫手'
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function modifyContentForPDF(htmlContent) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body { font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif; font-size: 12px; padding: 10px; color: #2c3e50; }' +
    'h2 { text-align: center; font-size: 18px; margin-bottom: 12px; }' +
    'h3 { margin: 10px 0 6px; }' +
    '</style></head><body>' +
    '<h2>佳里區衛生所 疫苗掛號對針統計</h2>' +
    htmlContent +
    '</body></html>';
}

function getRecipientEmail() {
  try {
    // 承辦人員預設 Email（如需修改請調整此處）
    return 'a00820@tncghb.gov.tw';
  } catch (error) {
    return '無法載入Email地址';
  }
}
