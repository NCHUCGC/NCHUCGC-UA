/**
 * NCHUCGC 國立中興大學卡牌研究社 - Union Arena 環境排表資料檔 (tier-data.js)
 * 編輯說明：
 * - tier 可填：'T0'、'T1'、'T2'、'T3'、'T4'、'T5'、'T6'、'UNRATED'（待評定）
 * - color 可填：'RED'、'BLUE'、'GREEN'、'YELLOW'、'PURPLE'
 * - difficulty 可填：1 ~ 5，或 null（待評）
 * - coverCardId 請填寫 cards.js 內的標準卡號，網頁會自動載入對應卡圖
 */
window.NCHUCGC_TIER_META = {
    envLabel: '社團排表（T0–T6）',
    updatedAt: '2026-11-21',
    clubName: '國立中興大學卡牌研究社 NCHUCGC',
    announcements: [
        { date: '2026-11-21', title: 'NCHUCGC UA 模擬器與環境排表上線', body: '已開放 T0–T6 環境排表與「自排／提案模式」，歡迎社員自行調整排表與操作難度後匯出提案至社團群組討論。' },
        { date: '2026-11-21', title: '牌組收錄持續擴充中', body: '若排表中尚未收錄你想評價的牌組，可在自排模式點擊「新增牌組提案」自行加入。' }
    ]
};

window.NCHUCGC_TIER_LIST = [
    // Re:從零開始的異世界生活
    { id: 'rez-purple-emilia', tier: 'UNRATED', series: 'Re:從零開始的異世界生活', color: 'PURPLE', name: '紫 聖域愛蜜莉雅', coverCardId: 'UA40BT/REZ-1-090', difficulty: null, tags: ['控場', '抽濾'], summary: '以〈”聖域”の”試練”〉與艾姬多娜橫置連動為核心。', pros: [], cons: [], sampleDeck: ['UA40BT/REZ-1-081', 'UA40BT/REZ-1-091', 'UA40BT/REZ-1-098', 'UA40BT/REZ-1-090'] },
    { id: 'rez-purple-beatrice', tier: 'UNRATED', series: 'Re:從零開始的異世界生活', color: 'PURPLE', name: '紫 碧翠絲＆昂', coverCardId: 'UA40BT/REZ-1-078', difficulty: null, tags: ['牌頂展開'], summary: '透過牌組頂端公開免費登場或突襲碧翠絲。', pros: [], cons: [], sampleDeck: ['UA40BT/REZ-1-071', 'UA40BT/REZ-1-078', 'UA40BT/REZ-1-094'] },
    { id: 'rez-blue-rem', tier: 'UNRATED', series: 'Re:從零開始的異世界生活', color: 'BLUE', name: '藍 雷姆＆0費昂', coverCardId: 'UA40BT/REZ-1-053', difficulty: null, tags: ['快攻', '鋪場'], summary: '利用大量 0 費藍色昂鋪場與場外蘇生壓制。', pros: [], cons: [], sampleDeck: ['UA40BT/REZ-1-051', 'UA40BT/REZ-1-053'] },
    { id: 'rez-blue-crusch', tier: 'UNRATED', series: 'Re:從零開始的異世界生活', color: 'BLUE', name: '藍 庫珥修＆菲利斯', coverCardId: 'UA40BT/REZ-1-058', difficulty: null, tags: ['手牌公開', '控場'], summary: '以公開手牌置底與敵我雙邊加 BP 搭配斬殺。', pros: [], cons: [], sampleDeck: ['UA40BT/REZ-1-058', 'UA40BT/REZ-1-034'] },
    { id: 'rez-green-emilia', tier: 'UNRATED', series: 'Re:從零開始的異世界生活', color: 'GREEN', name: '綠 BP2500／愛蜜莉雅', coverCardId: 'EX17BT/REZ-2-058', difficulty: null, tags: ['連擊'], summary: '以原 BP 2500 角色連動與 6 費突襲愛蜜莉雅為核心。', pros: [], cons: [], sampleDeck: ['EX17BT/REZ-2-058', 'EX17BT/REZ-2-039'] },
    { id: 'rez-green-priscilla', tier: 'UNRATED', series: 'Re:從零開始的異世界生活', color: 'GREEN', name: '綠 普莉希拉異名軸', coverCardId: 'EX17BT/REZ-2-065', difficulty: null, tags: ['異名連動', 'BP強化'], summary: '累積不同名綠角與全體加 BP 觸發高傷害。', pros: [], cons: [], sampleDeck: ['EX17BT/REZ-2-065', 'EX17BT/REZ-2-032'] },
    { id: 'rez-yellow-rem-ram', tier: 'UNRATED', series: 'Re:從零開始的異世界生活', color: 'YELLOW', name: '黃 雷姆＆拉姆／愛蜜莉雅', coverCardId: 'EX17BT/REZ-2-008', difficulty: null, tags: ['中速'], summary: '以黃色 Re:Zero 陣營為核心的構築。', pros: [], cons: [], sampleDeck: ['EX17BT/REZ-2-008'] },

    // 坂本日常
    { id: 'skm-purple-order', tier: 'UNRATED', series: '坂本日常', color: 'PURPLE', name: '紫 ORDER 額外抽軸', coverCardId: 'UA43BT/SMD-1-046', difficulty: null, tags: ['額外抽卡', '中速'], summary: '以大佛免費額外抽卡與神々廻回復 AP 為核心。', pros: [], cons: [], sampleDeck: ['UA43BT/SMD-1-045', 'UA43BT/SMD-1-046', 'UA43BT/SMD-1-055'] },
    { id: 'skm-purple-nagumo', tier: 'UNRATED', series: '坂本日常', color: 'PURPLE', name: '紫 南雲＆坂本觸發軸', coverCardId: 'UA43BT/SMD-1-061', difficulty: null, tags: ['トリガー連動'], summary: '主動發動場外與牌頂卡片的觸發效果。', pros: [], cons: [], sampleDeck: ['UA43BT/SMD-1-051', 'UA43BT/SMD-1-061'] },
    { id: 'skm-purple-labo', tier: 'UNRATED', series: '坂本日常', color: 'PURPLE', name: '紫 LABO 勢羽夏生', coverCardId: 'UA43BT/SMD-1-069', difficulty: null, tags: ['特徵連動'], summary: '圍繞［特徴：LABO］與透明裝備運作。', pros: [], cons: [], sampleDeck: ['UA43BT/SMD-1-069', 'UA43BT/SMD-1-068'] },
    { id: 'skm-yellow-shop', tier: 'UNRATED', series: '坂本日常', color: 'YELLOW', name: '黃 坂本商店', coverCardId: 'UA43BT/SMD-1-026', difficulty: null, tags: ['異名連動', '鋪場'], summary: '集齊不同名［特徴：坂本商店］強化全場與展開。', pros: [], cons: [], sampleDeck: ['UA43BT/SMD-1-026', 'UA43BT/SMD-1-031'] },
    { id: 'skm-yellow-shin', tier: 'UNRATED', series: '坂本日常', color: 'YELLOW', name: '黃 朝倉信＆平助', coverCardId: 'UA43BT/SMD-1-017', difficulty: null, tags: ['表側牌頂', '控場'], summary: '操作雙方牌頂與生命表側卡片獲得資源與減費。', pros: [], cons: [], sampleDeck: ['UA43BT/SMD-1-017', 'UA43BT/SMD-1-008'] },

    // 命運石之門
    { id: 'stg-blue-kurisu', tier: 'UNRATED', series: '命運石之門', color: 'BLUE', name: '藍 紅莉栖事件軸', coverCardId: 'UA57BT/STG-1-029', difficulty: null, tags: ['事件連動', '解場'], summary: '堆疊場外不同 Trigger 種類的 3 費以下藍色事件卡。', pros: [], cons: [], sampleDeck: ['UA57BT/STG-1-028', 'UA57BT/STG-1-029'] },
    { id: 'stg-blue-okabe', tier: 'UNRATED', series: '命運石之門', color: 'BLUE', name: '藍 岡部＆真由理', coverCardId: 'UA57BT/STG-1-011', difficulty: null, tags: ['墓地連動', '移除區'], summary: '透過場外大量藍色真由理與移除區復活連動。', pros: [], cons: [], sampleDeck: ['UA57BT/STG-1-011', 'UA57BT/STG-1-017'] },
    { id: 'stg-green-labmem', tier: 'UNRATED', series: '命運石之門', color: 'GREEN', name: '綠 紅莉栖＆真由理（空位軸）', coverCardId: 'UA57BT/STG-1-070', difficulty: null, tags: ['移動', '中速'], summary: '利用前線空位與能源線拉怪連動。', pros: [], cons: [], sampleDeck: ['UA57BT/STG-1-070', 'UA57BT/STG-1-060'] },
    { id: 'stg-green-faris', tier: 'UNRATED', series: '命運石之門', color: 'GREEN', name: '綠 菲利斯場域軸', coverCardId: 'UA57BT/STG-1-066', difficulty: null, tags: ['場域', '事件'], summary: '搭配 D-Mail 與多張場域卡反覆觸發登場效果。', pros: [], cons: [], sampleDeck: ['UA57BT/STG-1-066', 'UA57BT/STG-1-077'] },

    // 鏈鋸人
    { id: 'csm-red-denji', tier: 'UNRATED', series: '鏈鋸人', color: 'RED', name: '紅 電次／鏈鋸人', coverCardId: 'UA53BT/CSM-1-048', difficulty: null, tags: ['墊底機制', '爆發'], summary: '圍繞波奇塔與裏側墊底卡片運作。', pros: [], cons: [], sampleDeck: ['UA53BT/CSM-1-047', 'UA53BT/CSM-1-048'] },
    { id: 'csm-red-aki', tier: 'UNRATED', series: '鏈鋸人', color: 'RED', name: '紅 早川秋＆姬野', coverCardId: 'UA53BT/CSM-1-056', difficulty: null, tags: ['墊底機制', '狙擊'], summary: '消耗墊底卡片換取狙擊與衝擊。', pros: [], cons: [], sampleDeck: ['UA53BT/CSM-1-056', 'UA53BT/CSM-1-066'] },
    { id: 'csm-purple-reze', tier: 'UNRATED', series: '鏈鋸人', color: 'PURPLE', name: '紫 蕾潔／炸彈魔', coverCardId: 'UA53BT/CSM-1-031', difficulty: null, tags: ['退場連動', '中速'], summary: '透過電次退場與場上退場代價觸發連段。', pros: [], cons: [], sampleDeck: ['UA53BT/CSM-1-031', 'UA53BT/CSM-1-017'] },
    { id: 'csm-purple-makima', tier: 'UNRATED', series: '鏈鋸人', color: 'PURPLE', name: '紫 瑪奇瑪事件軸', coverCardId: 'UA53BT/CSM-1-024', difficulty: null, tags: ['事件連動', '控場'], summary: '將紫色角色視為事件卡並搭配回收與減費。', pros: [], cons: [], sampleDeck: ['UA53BT/CSM-1-023', 'UA53BT/CSM-1-024'] },

    // 魔法少女小圓
    { id: 'mmm-red-madoka', tier: 'UNRATED', series: '魔法少女小圓', color: 'RED', name: '紅 魔法少女群像／杏子沙耶香', coverCardId: 'UA31BT/MMM-1-090', difficulty: null, tags: ['生命加手', '異名連動'], summary: '結合自殘加手連擊與異名魔法少女解場。', pros: [], cons: [], sampleDeck: ['UA31BT/MMM-1-090', 'UA31BT/MMM-1-083'] },
    { id: 'mmm-yellow-ultmadoka', tier: 'UNRATED', series: '魔法少女小圓', color: 'YELLOW', name: '黃 圓環之理（女神小圓）', coverCardId: 'UA31BT/MMM-1-002', difficulty: null, tags: ['移除區展開'], summary: '以移除區作為第二手牌與資源庫展開。', pros: [], cons: [], sampleDeck: ['UA31BT/MMM-1-002', 'EX16BT/MMM-2-001'] },
    { id: 'mmm-yellow-mami', tier: 'UNRATED', series: '魔法少女小圓', color: 'YELLOW', name: '黃 巴麻美事件軸', coverCardId: 'UA31BT/MMM-1-019', difficulty: null, tags: ['事件連動', '彈手'], summary: '累積場外事件卡張數強化彈手與減費。', pros: [], cons: [], sampleDeck: ['UA31BT/MMM-1-019', 'UA31BT/MMM-1-020'] },
    { id: 'mmm-purple-homura', tier: 'UNRATED', series: '魔法少女小圓', color: 'PURPLE', name: '紫 惡魔焰', coverCardId: 'UA31BT/MMM-1-036', difficulty: null, tags: ['控場', '換位'], summary: '以惡魔焰與小圓的手牌／場上往返為核心。', pros: [], cons: [], sampleDeck: ['UA31BT/MMM-1-036', 'EX16BT/MMM-2-012'] },
    { id: 'mmm-green-magius', tier: 'UNRATED', series: '魔法少女小圓', color: 'GREEN', name: '綠 Magius／三日月莊', coverCardId: 'EX16BT/MMM-2-045', difficulty: null, tags: ['牌頂操作', '二彈'], summary: '外傳綠色雙軸（Magius 高費公開／三日月莊鋪場）。', pros: [], cons: [], sampleDeck: ['EX16BT/MMM-2-045', 'EX16BT/MMM-2-049'] },

    // 黑色五葉草
    { id: 'bcv-red-asta', tier: 'UNRATED', series: '黑色五葉草', color: 'RED', name: '紅 亞斯塔／黑色暴牛', coverCardId: 'UA20BT/BCV-1-075', difficulty: null, tags: ['墊底機制', '爆發'], summary: '利用裏側墊底卡片維持突襲亞斯塔與高爆發。', pros: [], cons: [], sampleDeck: ['UA20BT/BCV-1-075', 'UA20ST/BCV-1-103'] },
    { id: 'bcv-red-noelle', tier: 'UNRATED', series: '黑色五葉草', color: 'RED', name: '紅 諾艾兒事件軸', coverCardId: 'UA20BT/BCV-1-083', difficulty: null, tags: ['事件連動'], summary: '透過事件卡強化突襲諾艾兒的衝擊與強制防禦。', pros: [], cons: [], sampleDeck: ['UA20BT/BCV-1-083', 'UA20BT/BCV-1-093'] },
    { id: 'bcv-green-yuno', tier: 'UNRATED', series: '黑色五葉草', color: 'GREEN', name: '綠 亞斯塔＆尤諾', coverCardId: 'UA20BT/BCV-1-046', difficulty: null, tags: ['牌頂展開'], summary: '透過牌頂 3 費判定展開與全場增益。', pros: [], cons: [], sampleDeck: ['UA20BT/BCV-1-046', 'UA20BT/BCV-1-058'] },
    { id: 'bcv-purple-bulls', tier: 'UNRATED', series: '黑色五葉草', color: 'PURPLE', name: '紫 黑色暴牛／漆黑三極性', coverCardId: 'UA20BT/BCV-1-004', difficulty: null, tags: ['特徵連動', '墓地移除'], summary: '紫色暴牛鋪場或三極性移除墓地雙軸。', pros: [], cons: [], sampleDeck: ['UA20BT/BCV-1-004', 'UA20BT/BCV-1-027'] },

    // Hunter x Hunter 獵人
    { id: 'hxh-green-kurapika', tier: 'UNRATED', series: 'Hunter x Hunter 獵人', color: 'GREEN', name: '綠 酷拉皮卡／小傑', coverCardId: 'UA03BT/HTR-1-074', difficulty: null, tags: ['跳費', '狙擊'], summary: '快速跳費並以高 BP 突襲酷拉皮卡狙擊壓制。', pros: [], cons: [], sampleDeck: ['UA03BT/HTR-1-074', 'UA03BT/HTR-1-078'] },
    { id: 'hxh-blue-gi', tier: 'UNRATED', series: 'Hunter x Hunter 獵人', color: 'BLUE', name: '藍 GI 指定口袋／炸彈魔', coverCardId: 'UA03BT/HTR-1-019', difficulty: null, tags: ['指定口袋', '牌頂判定'], summary: '收集指定口袋種類或炸彈魔風險骰子軸。', pros: [], cons: [], sampleDeck: ['UA03BT/HTR-1-019', 'UA03BT/HTR-1-023'] },
    { id: 'hxh-purple-troupe', tier: 'UNRATED', series: 'Hunter x Hunter 獵人', color: 'PURPLE', name: '紫 幻影旅團／揍敵客', coverCardId: 'UA03BT/HTR-1-037', difficulty: null, tags: ['複製效果', '控場'], summary: '庫洛洛複製旅團登場效果，或揍敵客降 BP 解場。', pros: [], cons: [], sampleDeck: ['UA03BT/HTR-1-037', 'UA03BT/HTR-1-057'] },
    { id: 'hxh-yellow-razor', tier: 'UNRATED', series: 'Hunter x Hunter 獵人', color: 'YELLOW', name: '黃 磊札念獸／攻略組', coverCardId: 'EX01BT/HTR-2-008', difficulty: null, tags: ['墊底機制', '雙打'], summary: '磊札念獸墊底解場，或小傑奇犽西索同線連動。', pros: [], cons: [], sampleDeck: ['EX01BT/HTR-2-008', 'EX01BT/HTR-2-016'] },

    // 奇異賢伴
    { id: 'syn-yellow-noir', tier: 'UNRATED', series: '奇異賢伴 黑色天使', color: 'YELLOW', name: '黃 諾娃／黛西歐格', coverCardId: 'UA16ST/SYN-1-102', difficulty: null, tags: ['中速'], summary: '奇異賢伴黃色主軸。', pros: [], cons: [], sampleDeck: ['UA16ST/SYN-1-102'] }
];
