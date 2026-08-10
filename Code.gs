/**
 * 佳里區衛生所 - 疫苗掛號對針統計系統 (v3.5)
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
    var id = (row[0] || '').toString().trim().toUpperCase();  // 統一大寫，與 PHIS 檔對針一致
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

// ===== PHIS 掛號檔解析（v3.5 交叉對針） =====
// 實測 PHIS 匯出為 13 欄（身份證在第4欄、「優待別」欄標 6V/6k/6Z）；
// 以表頭關鍵字偵測欄位，舊格式（A欄=身分證、B欄=姓名）也相容。
function parsePhisList(content) {
  var rows = Utilities.parseCsv(content);
  var header = rows[0] || [];
  var idCol = -1, nameCol = -1, birthCol = -1, typeCol = -1;
  for (var c = 0; c < header.length; c++) {
    var h = String(header[c] || '');
    if (idCol === -1 && (h.indexOf('身份證') !== -1 || h.indexOf('身分證') !== -1)) idCol = c;
    if (nameCol === -1 && h.indexOf('姓名') !== -1) nameCol = c;
    if (birthCol === -1 && h.indexOf('出生') !== -1) birthCol = c;
    if (typeCol === -1 && h.indexOf('優待別') !== -1) typeCol = c;
  }
  if (idCol === -1) { idCol = 0; if (nameCol === -1) nameCol = 1; }  // 無表頭關鍵字時回退舊格式

  var idNameMap = {};
  var idBirthMap = {};
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
    if (typeCol >= 0) {
      var tv = (row[typeCol] || '').toString().trim();
      if (tv) typeValues[tv.toUpperCase()] = tv;
    }
  }
  return { idNameMap: idNameMap, idBirthMap: idBirthMap, typeValues: typeValues, hasTypeCol: typeCol >= 0 };
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

/**
 * 主統計函數（v3.2：辨識規則由設定驅動；v3.5：加 PHIS 交叉對針與 F 分類）
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

  // ===== PHIS 掛號檔（選傳）：解析＋優待別驗證 =====
  phisFiles = phisFiles || {};
  var PHIS_SLOTS = [
    { slot: 'k', family: 'corona', title: '新冠（6K 檔）', box: 'red-box',    expect: '6K' },
    { slot: 'z', family: 'flu',    title: '流感（6Z 檔）', box: 'blue-box',   expect: '6Z' },
    { slot: 'v', family: 'lung',   title: '肺鏈（6V 檔）', box: 'orange-box', expect: '6V' }
  ];
  var phisParsed = {};   // slot -> parsePhisList 結果
  for (var p = 0; p < PHIS_SLOTS.length; p++) {
    var slotDef = PHIS_SLOTS[p];
    var pc = phisFiles[slotDef.slot];
    if (!pc) continue;
    var parsed = parsePhisList(pc);
    if (parsed.hasTypeCol) {
      for (var tvk in parsed.typeValues) {
        if (tvk !== slotDef.expect) {
          return { errorMessage: 'PHIS ' + slotDef.expect + ' 檔案錯誤：優待別欄出現「' +
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

  // ===== PHIS 交叉對針差異計算（v3.5：NIIS 為準） =====
  var niisFamilyIds = { corona: [], flu: [], lung: [] };
  for (var nid in idCategoryCount) {
    var nf = familyGroupsOf(nid);
    if (nf.corona.length) niisFamilyIds.corona.push(nid);
    if (nf.flu.length) niisFamilyIds.flu.push(nid);
    if (nf.lung.length) niisFamilyIds.lung.push(nid);
  }
  var phisChecks = [];
  for (var p2 = 0; p2 < PHIS_SLOTS.length; p2++) {
    var def = PHIS_SLOTS[p2];
    var pr = phisParsed[def.slot];
    if (!pr) continue;
    var phisIds = Object.keys(pr.idNameMap);
    var famIds = niisFamilyIds[def.family];
    var phisSet = {};
    for (var x = 0; x < phisIds.length; x++) phisSet[phisIds[x]] = true;
    var famSet = {};
    for (var y = 0; y < famIds.length; y++) famSet[famIds[y]] = true;
    var missing = [];   // NIIS 有名單、PHIS 未掛
    var extra = [];     // PHIS 有掛、NIIS 沒名單
    for (var m = 0; m < famIds.length; m++) if (!phisSet[famIds[m]]) missing.push(famIds[m]);
    for (var e = 0; e < phisIds.length; e++) if (!famSet[phisIds[e]]) extra.push(phisIds[e]);
    missing.sort(byStroke);
    extra.sort(function(a, b) {
      return (pr.idNameMap[a] || '').localeCompare(pr.idNameMap[b] || '', 'zh-Hant');
    });
    phisChecks.push({ def: def, parsed: pr, phisCount: phisIds.length, niisCount: famIds.length,
                      matched: famIds.length - missing.length, missing: missing, extra: extra });
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
      '&#10;疫苗：' + escapeHtml(labels.join('、') || '無') + '&#10;本日共 ' + labels.length + ' 針';
  }

  function personSpan(id, color) {
    var name = escapeHtml(idNameMap[id] || id);
    var indicators = '';
    var cats = idCategoryCount[id] || {};
    for (var g = 0; g < config.length; g++) {
      if (cats[config[g].key] && config[g].indicator) indicators += escapeHtml(config[g].indicator);
    }
    return "<span class='pname' style='color:" + color + ";' data-tip=\"" + personTip(id) + "\">" + name + indicators + '</span>';
  }

  function needleBlock(group, count) {
    if (count <= 0) return '';
    var key = group.key;
    var tip = 'NIIS 名單統計：' + count + ' 針&#10;可用右側 + / - 或直接輸入數字手動修正';
    var html = "<div class='section'>";
    html += "<div class='box " + group.box + "'>";
    html += "<strong style='font-size:20px;'>" + escapeHtml(group.label) + '：</strong> ';
    html += "<span class='needle-count' id='" + key + "NeedleCount' data-tip=\"" + tip + "\">";
    html += "<span style='color:#27ae60;font-weight:bold;'>" + count + '</span> 針</span>';
    html += "<div class='needle-adjuster'>";
    html += "<button class='adjust-btn minus-btn' onclick=\"adjustCount('" + key + "', -1)\">-</button>";
    html += "<input type='number' class='adjustment-input-field' id='" + key + "Adjustment' value='0' onchange=\"updateCount('" + key + "')\">";
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
    '</style>';

  result += "<div class='stats-meta'>統計時間：" +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
    '　名單人數：' + totalPersons + ' 人　總針數：' + totalShots + ' 針</div>';

  // 針數區塊：依設定順序
  for (var g = 0; g < config.length; g++) {
    result += needleBlock(config[g], stats[config[g].key]);
  }

  // PHIS 對針區塊（v3.5）：僅在 PHIS 檔上傳時顯示，NIIS 沒名單者浮標可看身分證/出生
  function phisPersonSpan(id, parsed, color) {
    var tip = '身分證：' + escapeHtml(id) +
      (parsed.idBirthMap[id] ? '&#10;出生：' + escapeHtml(parsed.idBirthMap[id]) : '') +
      '&#10;（僅在 PHIS 掛號檔，NIIS 名單無此人）';
    return "<span class='pname' style='color:" + color + ";' data-tip=\"" + tip + "\">" +
      escapeHtml(parsed.idNameMap[id] || id) + '</span>';
  }

  function phisSection(chk) {
    var tip = '以 NIIS 名單為準，比對 PHIS 掛號檔&#10;紅＝NIIS 有名單但 PHIS 沒掛號&#10;橘＝PHIS 有掛號但 NIIS 沒名單';
    var html = "<div class='section'>";
    html += "<div class='box " + chk.def.box + "'>";
    html += "<strong style='font-size:20px;'>PHIS 對針 - " + chk.def.title + "：</strong>";
    html += "<span data-tip=\"" + tip + "\">PHIS 掛號 <b>" + chk.phisCount + "</b> 人｜NIIS 名單 <b>" +
      chk.niisCount + "</b> 人｜相符 <b>" + chk.matched + "</b> 人</span>";
    if (chk.missing.length === 0 && chk.extra.length === 0) {
      html += "　<span style='color:#27ae60;font-weight:bold;'>✔ 完全相符</span>";
    } else {
      if (chk.missing.length > 0) {
        var mspans = [];
        for (var mi = 0; mi < chk.missing.length; mi++) mspans.push(personSpan(chk.missing[mi], '#c62828'));
        html += "<div style='margin-top:10px;line-height:1.8;'><span style='color:#c62828;font-weight:bold;'>❗ NIIS 有名單、PHIS 未掛（" +
          chk.missing.length + " 人）：</span>" + mspans.join('、') + '</div>';
      }
      if (chk.extra.length > 0) {
        var espans = [];
        for (var ei = 0; ei < chk.extra.length; ei++) espans.push(phisPersonSpan(chk.extra[ei], chk.parsed, '#e65100'));
        html += "<div style='margin-top:10px;line-height:1.8;'><span style='color:#e65100;font-weight:bold;'>⚠ PHIS 有掛、NIIS 沒名單（" +
          chk.extra.length + " 人）：</span>" + espans.join('、') + '</div>';
      }
    }
    html += '</div></div>';
    return html;
  }

  for (var pc2 = 0; pc2 < phisChecks.length; pc2++) {
    result += phisSection(phisChecks[pc2]);
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
function sendEmailWithAttachments(htmlContent, note, files, recipients) {
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
