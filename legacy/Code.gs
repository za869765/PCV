// Code.gs
function doGet() {
    return HtmlService.createHtmlOutputFromFile('Index')
                      .setTitle('佳里區衛生所 - 疫苗掛號對針小工具');
}

function compareCSVFiles(content1, content2, num6kContent, num6vContent) {
    content1 = content1 || '';
    content2 = content2 || '';
    num6kContent = num6kContent || '';
    num6vContent = num6vContent || '';

    var errorMessage = validateFiles(content1, content2);
    if (errorMessage) {
        return { errorMessage: errorMessage };
    }

    // 解析CSV文件為ID-Name Map
    var names1Map = processJNContent(content1);
    if (names1Map.errorMessage) {
        return { errorMessage: names1Map.errorMessage };
    }
    var names1 = Object.keys(names1Map.idNameMap);
    var nonCoronaCount = names1Map.nonCoronaCount;

    var names2Map = parseCSV(content2);
    var names2 = Object.keys(names2Map);

    var num6kMap = parseCSV(num6kContent);
    var num6kNames = Object.keys(num6kMap);

    var num6vMap = parseCSV(num6vContent);
    var num6vNames = Object.keys(num6vMap);

    // 建立一個總的ID-Name映射，優先使用系統JN的名字
    var masterIdNameMap = {};
    names1.forEach(function(id) {
        masterIdNameMap[id] = names1Map.idNameMap[id];
    });
    names2.forEach(function(id) {
        if (!masterIdNameMap[id]) {
            masterIdNameMap[id] = names2Map[id];
        }
    });
    num6kNames.forEach(function(id) {
        if (!masterIdNameMap[id]) {
            masterIdNameMap[id] = num6kMap[id];
        }
    });
    num6vNames.forEach(function(id) {
        if (!masterIdNameMap[id]) {
            masterIdNameMap[id] = num6vMap[id];
        }
    });

    var commonNames = [];
    var uniqueNames1 = [];
    var uniqueNames2 = [];
    var lungFluNames = [];
    var lungNewCoronaNames = [];
    var lungFluNewCoronaNames = [];
    var singleLungNames = [];
    var duplicateCoronaNames = [];
    var lungNewCoronaOnlyNames = [];

    var classification = classifyNamesByColumnQ(content2);

    // 1. 計算新冠消耗 (JN + 6k)
    var totalNewCoronaShots = new Set([...names1, ...num6kNames]).size;

    // 2. 計算流感消耗 (只計算6Z名單)
    var totalFluShots = names2.length;

    // 3. 計算肺鏈消耗 (只計算6V名單)
    var totalLungChainShots = num6vNames.length;

    // 合併6k與JN名單並檢查重複掛號
    num6kNames.forEach(function(id) {
        if (names1.includes(id)) {
            duplicateCoronaNames.push(id); // 新冠重複掛號
        } else if (names2.includes(id) && !num6vNames.includes(id)) {
            commonNames.push(id); // 新冠+流感 (不在肺鏈)
        } else if (num6vNames.includes(id) && !names2.includes(id)) {
            lungNewCoronaOnlyNames.push(id); // 新冠+肺鏈 (不在流感)
        } else if (!names2.includes(id) && !num6vNames.includes(id)) {
            uniqueNames1.push(id); // 只打新冠
        }
    });

    // 判斷新冠+流感（6k + 6Z）、肺鏈+流感（6V + 6Z）
    names1.forEach(function(id) {
        if (names2.includes(id) && !num6vNames.includes(id)) {
            commonNames.push(id);  // 新冠+流感 (不在肺鏈)
        } else if (num6vNames.includes(id) && !names2.includes(id)) {
            lungNewCoronaNames.push(id);  // 肺鏈 + 新冠 (不在流感)
        } else if (!names2.includes(id) && !num6vNames.includes(id)) {
            uniqueNames1.push(id);  // 只打新冠
        }
    });

    names2.forEach(function(id) {
        if (num6vNames.includes(id) && !names1.includes(id) && !num6kNames.includes(id)) {
            lungFluNames.push(id); // 肺鏈 + 流感 (不在新冠)
        } else if (!names1.includes(id) && !num6kNames.includes(id) && !num6vNames.includes(id)) {
            uniqueNames2.push(id); // 只打流感
        }
    });

    // 判斷符合肺鏈+新冠+流感的人
    names1.concat(num6kNames).forEach(function(id) {
        if (names2.includes(id) && num6vNames.includes(id)) {
            lungFluNewCoronaNames.push(id); // 肺鏈 + 新冠 + 流感
        }
    });

    // 排除已經計入肺鏈+新冠+流感的人名，從肺鏈+流感名單和其他名單中移除
    lungFluNewCoronaNames.forEach(function(id) {
        var index = lungFluNames.indexOf(id);
        if (index > -1) {
            lungFluNames.splice(index, 1); // 如果該名字已經在肺鏈+新冠+流感，則從肺鏈+流感移除
        }

        var indexCommon = commonNames.indexOf(id);
        if (indexCommon > -1) {
            commonNames.splice(indexCommon, 1); // 從新冠+流感移除
        }

        var indexLungNewCorona = lungNewCoronaNames.indexOf(id);
        if (indexLungNewCorona > -1) {
            lungNewCoronaNames.splice(indexLungNewCorona, 1); // 從肺鏈+新冠移除
        }
    });

    num6vNames.forEach(function(id) {
        if (!lungFluNames.includes(id) && !lungNewCoronaNames.includes(id) && !lungFluNewCoronaNames.includes(id)) {
            singleLungNames.push(id);  // 只打肺鏈
        }
    });

    // 定義 compareStrokeOrder 函數，根據名字的筆劃順序排序
    function compareStrokeOrder(a, b) {
        var nameA = masterIdNameMap[a] || "";
        var nameB = masterIdNameMap[b] || "";
        return nameA.localeCompare(nameB, 'zh-Hant-TW-u-co-stroke');
    }

    // 姓名按照筆劃排序
    commonNames.sort(compareStrokeOrder);
    uniqueNames1.sort(compareStrokeOrder);
    uniqueNames2.sort(compareStrokeOrder);
    num6kNames.sort(compareStrokeOrder);
    num6vNames.sort(compareStrokeOrder);
    lungFluNames.sort(compareStrokeOrder);
    lungNewCoronaNames.sort(compareStrokeOrder);
    lungFluNewCoronaNames.sort(compareStrokeOrder);
    singleLungNames.sort(compareStrokeOrder);
    lungNewCoronaOnlyNames.sort(compareStrokeOrder);

    // 彈窗提示 - 新冠重複掛號
    if (duplicateCoronaNames.length > 0) {
        return { errorMessage: "新冠重複掛號：" + duplicateCoronaNames.map(id => masterIdNameMap[id] || id).join(", ") };
    }

    // 將所有分類結果進行筆劃排序
    Object.keys(classification).forEach(function(category) {
        classification[category].sort(compareStrokeOrder);
    });

    // 標記顏色的函數
    function markAsRed(name) {
        return "<span style='color: red; font-weight: bold;'>" + name + "</span>";
    }

    function markAsOrange(name) {
        return "<span style='color: orange; font-weight: bold;'>" + name + "</span>";
    }

    function markAsBlack(name) {
        return "<span style='color: black; font-weight: bold;'>" + name + "</span>";
    }

    function markAsGreen(name) {
        return "<span style='color: #006400; font-weight: bold;'>" + name + "</span>"; // 深綠色
    }

    function markAsPurple(name) {
        return "<span style='color: purple; font-weight: bold;'>" + name + "</span>";
    }

    function markAsDeepBlue(name) {
        return "<span style='color: #00008B; font-weight: bold;'>" + name + "</span>"; // 深藍色
    }

    // 標記 Phis_6k 名單中的名字
    var commonNamesMarked = commonNames.map(function(id) {
        return num6vNames.includes(id) && names2.includes(id) ? markAsBlack(masterIdNameMap[id]) :
               (num6kNames.includes(id) ? markAsRed(masterIdNameMap[id]) : markAsDeepBlue(masterIdNameMap[id]));
    });

    var uniqueNames1Marked = uniqueNames1.map(function(id) {
        return num6kNames.includes(id) ? markAsRed(masterIdNameMap[id]) : markAsGreen(masterIdNameMap[id]);
    });

    var uniqueNames2Marked = uniqueNames2.map(function(id) {
        return markAsPurple(masterIdNameMap[id]);
    });

    var num6kNamesMarked = num6kNames.map(function(id) {
        return markAsRed(masterIdNameMap[id]);
    });

    // 標記 Phis_6V 名單中的名字
    var singleLungNamesMarked = singleLungNames.map(function(id) {
        return markAsOrange(masterIdNameMap[id]);
    });

    var lungFluNamesMarked = lungFluNames.map(function(id) {
        return markAsOrange(masterIdNameMap[id]);
    });

    var lungNewCoronaNamesMarked = lungNewCoronaNames.map(function(id) {
        return markAsOrange(masterIdNameMap[id]);
    });

    var lungFluNewCoronaNamesMarked = lungFluNewCoronaNames.map(function(id) {
        return markAsBlack(masterIdNameMap[id]); // 肺鏈 + 新冠 + 流感 顯示為黑色
    });

    var lungNewCoronaOnlyMarked = lungNewCoronaOnlyNames.map(function(id) {
        return markAsOrange(masterIdNameMap[id]); // 新冠+肺鏈標記為橘色
    });

    // 處理擴展分類的標記，並根據規則修改顯示文字
    var fluDetails = "";
    var categoryDisplayMap = {
        "F01": "流感F01:六個月至入學前",
        "F02A01": "流感F02A01小學生:",
        "F02A02": "流感F02A02國中生:",
        "F02A03": "流感F02A03高中生:",
        "F02B": "流感F02B幼兒園托育人員:",
        "F03A": "流感F03A五十歲以上所內施打:",
        "F03B": "流感F03B五十歲以上所外施打:",
        "F04A": "流感F04A長照受照顧者:",
        "F04B": "流感F04B長照工作人員:",
        "F05A": "流感F05A孕婦:",
        "F05B": "流感F05B六個月嬰兒的父母:",
        "F06A": "流感F06A高風險慢性病患:",
        "F06B": "流感F06B罕見疾病患者:",
        "F06C": "流感F06C重大傷病患者:",
        "F07A": "流感F07A具執登醫事人員:",
        "F07B": "流感F07B醫療院所工作人員:",
        "F07C": "流感F07C防疫相關人員:",
        "F07D": "流感F07D禽畜養殖/動物防疫相關人員:",
        "F09": "流感F09擴大對象:",
        "Others": "流感未分類名單:"
    };

    // 只有在上傳了 6Z 檔案時，才生成流感分類細節
    if (content2) {
        Object.keys(classification).forEach(function(category) {
            if (classification[category].length > 0) {
                var displayCategory = categoryDisplayMap[category] || "流感未分類名單:";
                fluDetails += "<div class='section'>";
                fluDetails += "<div class='boxed-title purple-text'>" + displayCategory + " " + classification[category].length + " 個<br>";
                fluDetails += "<span class='sorted-names'>" + classification[category].map(function(id) {
                    return num6kNames.includes(id) ? markAsRed(masterIdNameMap[id]) :
                           (num6vNames.includes(id) ? markAsOrange(masterIdNameMap[id]) : masterIdNameMap[id]);
                }).join(", ") + "</span>";
                fluDetails += "</div></div>";
            }
        });
    }

    var result = "";

    // 如果新冠消耗大於0，則顯示新冠相關段落
    if (totalNewCoronaShots > 0) {
        result += "<div class='section' style='margin-bottom: 40px;'>";
        result += "<strong style='color: #27ae60; font-size: 36px;'>新冠消耗：</strong>";
        result += "<span id='newCoronaCount' data-original='" + totalNewCoronaShots + "' style='font-size: 36px; color: #27ae60; font-weight: bold;'>" + totalNewCoronaShots + " 針</span>";
        result += "</div>";
        result += "<div class='correction-toggle' data-target='newCoronaCorrections'>";
        result += "  <span class='plus-icon'>+</span>";
        result += "</div>";
        result += "<div class='correction-inputs' id='newCoronaCorrections' style='flex-direction: column; gap: 15px;'>";
        result += "    <label style='color: red; font-weight: bold;'>多劑型校正：</label>";
        result += "    <input type='number' min='0' value='0' id='newCoronaCorrection' onchange='updateNewCoronaShots()' class='input-correction'>";
        result += "    <label style='color: green; font-weight: bold;'>手抄未掛校正(單劑型)：</label>";
        result += "    <input type='number' min='0' value='0' id='newCoronaSingleCorrection' onchange='updateNewCoronaShots()' class='input-correction'>";
        result += "</div>";
    }

    // 如果流感消耗大於0，則顯示流感相關段落
    if (totalFluShots > 0) {
        result += "<div class='section' style='margin-bottom: 40px;'>";
        result += "<strong style='color: #8e44ad; font-size: 36px;'>流感消耗：</strong>";
        result += "<span id='fluCount' data-original='" + totalFluShots + "' style='font-size: 36px; color: #8e44ad; font-weight: bold;'>" + totalFluShots + " 針</span>";
        result += "</div>";
        result += "<div class='correction-toggle' data-target='fluCorrections'>";
        result += "  <span class='plus-icon'>+</span>";
        result += "</div>";
        result += "<div class='correction-inputs' id='fluCorrections' style='flex-direction: column; gap: 15px;'>";
        result += "    <label style='color: #9370DB; font-weight: bold;'>次要廠牌校正：</label>";
        result += "    <input type='number' min='0' value='0' id='fluCorrection' onchange='updateFluShots()' class='input-correction'>";
        result += "    <label style='color: #4B0082; font-weight: bold;'>補接種未掛校正：</label>";
        result += "    <input type='number' min='0' value='0' id='fluCorrection2' onchange='updateFluShots()' class='input-correction'>";
        result += "</div>";
    }

    // 如果肺鏈消耗大於0，則顯示肺鏈相關段落
    if (totalLungChainShots > 0) {
        result += "<div class='section' style='margin-bottom: 40px;'>";
        result += "<strong style='color: #e67e22; font-size: 36px;'>肺鏈消耗：</strong>";
        result += "<span id='lungChainCount' data-original='" + totalLungChainShots + "' style='font-size: 36px; color: #e67e22; font-weight: bold;'>" + totalLungChainShots + " 針</span>";
        result += "</div>";
        result += "<div class='correction-toggle' data-target='lungChainCorrections'>";
        result += "  <span class='plus-icon'>+</span>";
        result += "</div>";
        result += "<div class='correction-inputs' id='lungChainCorrections' style='flex-direction: column; gap: 15px;'>";
        result += "    <label style='color: #006400; font-weight: bold;'>23PPV校正：</label>";
        result += "    <input type='number' min='0' value='0' id='lungChainCorrection' onchange='updateLungChainShots()' class='input-correction'>";
        result += "</div>";
    }

    result += "<div class='divider'></div>"; // 分隔線

    // 顯示各組名單
    // 只打新冠
    if (uniqueNames1Marked.length > 0) {
        result += "<div class='section'>";
        result += "<div class='boxed-title green-text'>只打新冠：" + uniqueNames1Marked.length + " 個<br>";
        result += "<span class='sorted-names'>" + uniqueNames1Marked.join(", ") + "</span></div>";
        result += "</div>";
    }

    // 新冠+流感
    if (commonNamesMarked.length > 0) {
        result += "<div class='section'>";
        result += "<div class='boxed-title blue-text'>新冠+流感：" + commonNamesMarked.length + " 個<br>";
        result += "<span class='sorted-names'>" + commonNamesMarked.join(", ") + "</span></div>";
        result += "</div>";
    }

    // 新冠+肺鏈
    if (lungNewCoronaOnlyMarked.length > 0) {
        result += "<div class='section'>";
        result += "<div class='boxed-title orange-text'>新冠+肺鏈：" + lungNewCoronaOnlyMarked.length + " 個<br>";
        result += "<span class='sorted-names'>" + lungNewCoronaOnlyMarked.join(", ") + "</span></div>";
        result += "</div>";
    }

    // 只打流感
    if (uniqueNames2Marked.length > 0) {
        result += "<div class='section'>";
        result += "<div class='boxed-title purple-text'>只打流感：" + uniqueNames2Marked.length + " 個<br>";
        result += "<span class='sorted-names'>" + uniqueNames2Marked.join(", ") + "</span></div>";
        result += "</div>";
    }

    // 只打肺鏈
    if (singleLungNamesMarked.length > 0) {
        result += "<div class='section'>";
        result += "<div class='boxed-title orange-text'>只打肺鏈：" + singleLungNamesMarked.length + " 個<br>";
        result += "<span class='sorted-names'>" + singleLungNamesMarked.join(", ") + "</span></div>";
        result += "</div>";
    }

    // 肺鏈+流感
    if (lungFluNamesMarked.length > 0) {
        result += "<div class='section'>";
        result += "<div class='boxed-title orange-text'>肺鏈+流感：" + lungFluNamesMarked.length + " 個<br>";
        result += "<span class='sorted-names'>" + lungFluNamesMarked.join(", ") + "</span></div>";
        result += "</div>";
    }

    // 肺鏈+新冠
    if (lungNewCoronaNamesMarked.length > 0) {
        result += "<div class='section'>";
        result += "<div class='boxed-title orange-text'>肺鏈+新冠：" + lungNewCoronaNamesMarked.length + " 個<br>";
        result += "<span class='sorted-names'>" + lungNewCoronaNamesMarked.join(", ") + "</span></div>";
        result += "</div>";
    }

    // 肺鏈+新冠+流感
    if (lungFluNewCoronaNamesMarked.length > 0) {
        result += "<div class='section'>";
        result += "<div class='boxed-title black-text'>肺鏈+新冠+流感：" + lungFluNewCoronaNamesMarked.length + " 個<br>";
        result += "<span class='sorted-names'>" + lungFluNewCoronaNamesMarked.join(", ") + "</span><br>";
        result += "<strong style='color: red;'>請確認是否真的打三針!??</strong></div>";
        result += "</div>";
        result += "<div class='divider'></div>"; // 新增分隔線
    }

    // 只有在上傳了 6k 檔案時，才顯示 "Phis_6k 掛號：" 段落
    if (num6kContent && num6kNamesMarked.length > 0) {
        result += "<div class='divider'></div>"; // 添加分隔線

        // 特殊明細 - Phis_6k 掛號人數
        result += "<div class='section'>";
        result += "<div class='boxed-title red-text'>Phis_6k 掛號：" + num6kNamesMarked.length + " 個<br>";
        result += "<span class='sorted-names'>" + num6kNamesMarked.join(", ") + "</span></div>";
        result += "</div>";
    }

    // 只有在同時上傳了 6k 和 6Z 檔案時，才在 "Phis_6k 掛號：" 和流感分類之間添加分隔線
    if (num6kContent && content2 && num6kNamesMarked.length > 0 && fluDetails.length > 0) {
        result += "<div class='divider'></div>"; // 添加分隔線
    }

    // 只有在上傳了 6Z 檔案時，才顯示流感分類段落
    if (content2 && fluDetails.length > 0) {
        result += fluDetails;
    }

    return { htmlContent: result, nonCoronaCount: nonCoronaCount };
}

// 處理系統JN名單，過濾非 "JN" 或 "CoV_Moderna_JN" 的資料
function processJNContent(content) {
    if (!content) return { idNameMap: {}, nonCoronaCount: 0 };
    var rows = Utilities.parseCsv(content);

    // 驗證K2:K99是否至少有一個含有 "JN" 或 "CoV_Moderna_JN"
    var containsJN = false;
    for (var i = 1; i < Math.min(rows.length, 100); i++) { // 檢查第2行到第99行（索引從0開始）
        var k2Column = rows[i][10]; // K2欄位 (第11列)
        if (k2Column && (k2Column.includes("JN") || k2Column.includes("CoV_Moderna_JN"))) {
            containsJN = true;
            break;
        }
    }
    if (!containsJN) {
        return { errorMessage: "非JN檔案" };
    }

    var idNameMap = {};
    var nonCoronaCount = 0;

    for (var i = 1; i < rows.length; i++) {
        var k2Column = rows[i][10]; // K2欄位
        var id = rows[i][0]; // A欄位，身分證號
        var name = rows[i][1]; // B欄位，名字
        if (k2Column && (k2Column.includes("JN") || k2Column.includes("CoV_Moderna_JN"))) {
            if (id) {
                idNameMap[id] = name;
            }
        } else {
            nonCoronaCount++;
        }
    }

    return { idNameMap: idNameMap, nonCoronaCount: nonCoronaCount };
}

// 工具函數：生成錯誤訊息的HTML
function generateErrorHTML(message) {
    return "<div style='background-color: #ffe6e6; padding: 25px; border-left: 8px solid #e74c3c; border-radius: 10px; max-width: 1200px; margin: 0 auto; color: #c0392b; font-size: 20px; font-weight: bold;'>" +
           "<strong>錯誤：</strong> " + message + "</div>";
}

// 工具函數：解析 CSV 內容，返回ID-Name Map
function parseCSV(csvContent) {
    if (!csvContent) return {};
    var rows = Utilities.parseCsv(csvContent);
    var idNameMap = {};
    rows.slice(1).forEach(function(row) {
        var id = row[0]; // A欄位，身分證號
        var name = row[1]; // B欄位，名字
        if (id) {
            idNameMap[id] = name;
        }
    });
    return idNameMap;
}

// 工具函數：比較筆劃順序，適用於中文
function compareStrokeOrder(a, b) {
    var nameA = masterIdNameMap[a] || "";
    var nameB = masterIdNameMap[b] || "";
    return nameA.localeCompare(nameB, 'zh-Hant-TW-u-co-stroke');
}

// 工具函數：檢查文件內容是否正確
function validateFiles(content1, content2) {
    if (content2) {
        var rows2 = Utilities.parseCsv(content2);
        if (rows2.length < 2 || (rows2[1][10] && !rows2[1][10].includes("Flu"))) {
            return "流感檔案錯誤，請再確認！";
        }
    }

    return null;
}

// 工具函數：根據 CSV 列進行分類
function classifyNamesByColumnQ(content) {
    if (!content) return { F01: [], F02A01: [], F02A02: [], F02A03: [], F02B: [], F03A: [], F03B: [], F04A: [], F04B: [], F05A: [], F05B: [], F06A: [], F06B: [], F06C: [], F07A: [], F07B: [], F07C: [], F07D: [], F09: [], Others: [] };
    var rows = Utilities.parseCsv(content);

    var classifications = {
        F01: [], F02A01: [], F02A02: [], F02A03: [], F02B: [], F03A: [], F03B: [], F04A: [], F04B: [], F05A: [], F05B: [], F06A: [], F06B: [], F06C: [], F07A: [], F07B: [], F07C: [], F07D: [], F09: [], Others: []
    };

    rows.slice(1).forEach(function(row) {
        var id = row[0]; // A欄位，身分證號
        var category = row[16]; // Q欄位，分類
        if (classifications.hasOwnProperty(category)) {
            classifications[category].push(id);
        } else {
            classifications.Others.push(id);
        }
    });

    return classifications;
}
