/**
 * NCHUCGC 管理員單人測試平台 (admin-test-mode.js)
 * 功能：
 * 1. 僅限管理員帳號 (window.nchucgcLobby.isAdminUser()) 可見與進入。
 * 2. 左側內建「系列／顏色／狀態／搜尋」去重卡片清單（自動濾除異圖 /p1 /p2 /★ /UAPR 重印，每種卡只測一次）。
 * 3. 點選卡片即可檢視完整日文效果文並一鍵加入手牌、場外或牌頂進行單人測試。
 * 4. 支援標記「通過 / 有問題」與備註（即時同步 Firebase /cardTestStatus 並備份於 localStorage），一鍵匯出問題清單。
 * 5. 內建假敵人生成（BP 2000/3000/4000/5000）與「無視費用 / AP / 階段」快速切換，不刪除任何既有 DLC 腳本。
 */
(function () {
    const STORAGE_KEY = 'nchucgc_card_test_status_v1';
    const COLOR_ZH = { RED: '紅', BLUE: '藍', GREEN: '綠', YELLOW: '黃', PURPLE: '紫', NONE: '無' };
    const COLOR_HEX = { RED: '#e74c3c', BLUE: '#3498db', GREEN: '#2ecc71', YELLOW: '#f1c40f', PURPLE: '#9b59b6', NONE: '#8c93ad' };

    const state = {
        active: false,
        uniqueCards: [],
        seriesList: [],
        selectedSeries: 'ALL',
        selectedColor: 'ALL',
        selectedStatus: 'ALL',
        searchQuery: '',
        activeCardDef: null,
        statusMap: {}, // { [suffixKey]: { id, name, series, color, status: 'ok'|'bug', note, updatedAt } }
        spawnSeq: 1,
        fbListening: false
    };

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
    }

    function getBaseId(cid) {
        return String(cid || '').replace(/([/_](p\d+|s|sp\d*)|★)+$/i, '');
    }

    // 取得卡號主體（例如 UA40BT/REZ-1-090 -> REZ-1-090），用來同時濾除異圖與 UAPR/UAPB/ST 重印
    function getCanonicalKey(cid) {
        const b = getBaseId(cid);
        return b.includes('/') ? b.split('/', 2)[1] : b;
    }

    function safeFbKey(key) {
        return String(key || '').replace(/[.#$\[\]\/]/g, '_');
    }

    function idPriority(cid) {
        if (cid.includes('/p') || cid.includes('★') || cid.includes('_s')) return 10;
        if (cid.startsWith('UA') && cid.includes('BT/')) return 1;
        if (cid.startsWith('EX') && cid.includes('BT/')) return 2;
        if (cid.startsWith('PC') && cid.includes('BT/')) return 3;
        if (cid.includes('ST/')) return 4;
        if (cid.startsWith('UAPR') || cid.startsWith('UAPB')) return 8;
        return 5;
    }

    function buildUniqueCatalog() {
        if (state.uniqueCards.length > 0 || typeof masterCardCatalog === 'undefined') return;
        const map = new Map();
        for (const c of masterCardCatalog) {
            if (!c || !c.id || c.type === 'AP' || c.id.includes('-AP')) continue;
            if (c.series && (c.series.includes('AP 卡') || c.series.includes('Action Point'))) continue;
            const key = getCanonicalKey(c.id);
            const existing = map.get(key);
            if (!existing) {
                map.set(key, { ...c, _canonicalKey: key, _baseId: getBaseId(c.id) });
            } else {
                const pNew = idPriority(c.id);
                const pOld = idPriority(existing.id);
                const newHasEff = !!(c.effectText && c.effectText !== '-');
                const oldHasEff = !!(existing.effectText && existing.effectText !== '-');
                if ((newHasEff && !oldHasEff) || (newHasEff === oldHasEff && pNew < pOld)) {
                    map.set(key, { ...c, _canonicalKey: key, _baseId: getBaseId(c.id) });
                }
            }
        }
        state.uniqueCards = Array.from(map.values()).sort((a, b) => {
            const sc = (a.series || '').localeCompare(b.series || '', 'zh-Hant');
            if (sc !== 0) return sc;
            return (a.id || '').localeCompare(b.id || '');
        });
        const sSet = new Set(state.uniqueCards.map(c => c.series).filter(Boolean));
        state.seriesList = Array.from(sSet).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    function loadLocalStatuses() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') state.statusMap = parsed;
            }
        } catch (e) {}
    }

    function saveLocalStatuses() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.statusMap)); } catch (e) {}
    }

    function initFirebaseSync() {
        if (state.fbListening) return;
        const db = window.nchucgcLobby && typeof window.nchucgcLobby.getDb === 'function' ? window.nchucgcLobby.getDb() : null;
        if (!db) return;
        state.fbListening = true;
        db.ref('cardTestStatus').on('value', snap => {
            const val = snap.val();
            if (val && typeof val === 'object') {
                Object.entries(val).forEach(([k, v]) => {
                    if (v && typeof v === 'object') state.statusMap[v.canonicalKey || k] = v;
                });
                saveLocalStatuses();
                if (state.active) {
                    renderList();
                    renderInspector();
                }
            }
        });
    }

    function saveCardStatus(cardDef, status, note) {
        if (!cardDef) return;
        const key = cardDef._canonicalKey || getCanonicalKey(cardDef.id);
        const fbKey = safeFbKey(key);
        const db = window.nchucgcLobby && typeof window.nchucgcLobby.getDb === 'function' ? window.nchucgcLobby.getDb() : null;

        if (!status) {
            delete state.statusMap[key];
            saveLocalStatuses();
            if (db) db.ref(`cardTestStatus/${fbKey}`).remove().catch(() => {});
        } else {
            const record = {
                canonicalKey: key,
                id: cardDef.id,
                name: cardDef.name || '',
                series: cardDef.series || '',
                color: cardDef.color || '',
                status, // 'ok' | 'bug'
                note: String(note || '').trim(),
                updatedAt: Date.now()
            };
            state.statusMap[key] = record;
            saveLocalStatuses();
            if (db) db.ref(`cardTestStatus/${fbKey}`).set(record).catch(() => {});
        }
        renderList();
        renderInspector();
    }

    function getStatusRecord(cardDef) {
        if (!cardDef) return null;
        return state.statusMap[cardDef._canonicalKey || getCanonicalKey(cardDef.id)] || null;
    }

    function hasDlcScript(cardDef) {
        if (!cardDef || !window.UACardScripts) return false;
        const base = getBaseId(cardDef.id);
        return !!(window.UACardScripts[base] || window.UACardScripts[cardDef.id]);
    }

    function getZh(cardDef) {
        if (!cardDef || !window.UA_ZH_MAP) return null;
        return window.UA_ZH_MAP[getBaseId(cardDef.id)] || window.UA_ZH_MAP[cardDef.id] || null;
    }

    function displayName(cardDef) {
        const zh = getZh(cardDef);
        return (zh && zh.name) ? zh.name : (cardDef?.name || cardDef?.id || '');
    }

    function displayEffect(cardDef) {
        const zh = getZh(cardDef);
        return (zh && zh.effectText) ? zh.effectText : (cardDef?.effectText || '');
    }

    function displayTrigger(cardDef) {
        const zh = getZh(cardDef);
        return (zh && zh.triggerText) ? zh.triggerText : (cardDef?.triggerText || '');
    }

    // ==================== 單人測試盤面工具 ====================

    function spawnCard(cardDef, destId, isMine = true, options = {}) {
        if (!cardDef || typeof window.createCardDOM !== 'function') return null;
        const dest = document.getElementById(destId);
        if (!dest) return null;
        const netId = (isMine ? 'test_my_' : 'test_opp_') + (state.spawnSeq++);
        const el = window.createCardDOM(cardDef, netId, isMine);

        if (isMine && Array.isArray(window.myCardsElements)) window.myCardsElements.push(el);
        if (!isMine && Array.isArray(window.oppCardsElements)) window.oppCardsElements.push(el);

        dest.appendChild(el);
        if (options.faceDown) el.classList.add('is-flipped');
        else el.classList.remove('is-flipped');

        if (options.rest) el.classList.add('rest');
        else el.classList.remove('rest');

        if (destId.includes('hand') || destId.includes('look')) {
            el.style.position = 'relative';
            el.style.left = '0px';
            el.style.top = '0px';
            el.style.zIndex = '';
        } else {
            el.style.position = 'absolute';
        }
        if (destId.includes('life')) el.classList.add('in-life');

        if (typeof window.recalcStacking === 'function') window.recalcStacking(dest);
        if (typeof window.updateSlotCounts === 'function') window.updateSlotCounts();
        if (window.uaEngine && typeof window.uaEngine.updateEnergyHUD === 'function') window.uaEngine.updateEnergyHUD();
        return el;
    }

    function getSampleCardsForDummy(count) {
        const pool = state.uniqueCards.filter(c => c.type === 'CHARACTER' && c.bp);
        if (pool.length === 0) return [];
        const res = [];
        for (let i = 0; i < count; i++) res.push(pool[i % pool.length]);
        return res;
    }

    function spawnDummyEnemies() {
        const targetBps = [2000, 3000, 4000, 5000];
        const flSlots = Array.from(document.querySelectorAll('#opp-front-line .slot'));
        flSlots.forEach((slot, idx) => {
            Array.from(slot.querySelectorAll('.card')).forEach(c => c.remove());
            if (typeof window.updateBpDisplay === 'function') window.updateBpDisplay(slot, 0);
            const targetBp = targetBps[idx] || 3000;
            const dummyDef = state.uniqueCards.find(c => c.type === 'CHARACTER' && c.bp === targetBp && (!c.effectText || c.effectText === '-'))
                || state.uniqueCards.find(c => c.type === 'CHARACTER' && c.bp === targetBp)
                || state.uniqueCards[0];
            if (dummyDef) spawnCard(dummyDef, slot.id, false, { faceDown: false, rest: false });
        });

        const enSlots = Array.from(document.querySelectorAll('#opp-energy-line .slot'));
        enSlots.slice(0, 2).forEach((slot, idx) => {
            Array.from(slot.querySelectorAll('.card')).forEach(c => c.remove());
            const dummyDef = state.uniqueCards.find(c => c.type === 'CHARACTER' && c.bp === 1500) || state.uniqueCards[idx];
            if (dummyDef) spawnCard(dummyDef, slot.id, false, { faceDown: false, rest: false });
        });

        const oppLife = document.getElementById('opp-life-area');
        if (oppLife && oppLife.querySelectorAll('.card').length === 0) {
            getSampleCardsForDummy(7).forEach(c => spawnCard(c, 'opp-life-area', false, { faceDown: true }));
        }
        const oppHand = document.getElementById('opp-hand-area');
        if (oppHand && oppHand.querySelectorAll('.card').length === 0) {
            getSampleCardsForDummy(5).forEach(c => spawnCard(c, 'opp-hand-area', false, { faceDown: true }));
        }
        const oppDeck = document.getElementById('opp-deck-area');
        if (oppDeck && oppDeck.querySelectorAll('.card').length === 0) {
            getSampleCardsForDummy(15).forEach(c => spawnCard(c, 'opp-deck-area', false, { faceDown: true }));
        }
        showSysMsg('已補齊假敵人（前線 BP 2000~5000、手牌 5、牌組 15、生命 7）');
    }

    function setupSoloBoard() {
        // 清空現有卡片但保留 slot 內建元素 (marker, bp-tracker, bp-badge)
        if (Array.isArray(window.myCardsElements)) {
            window.myCardsElements.forEach(c => c && c.remove());
            window.myCardsElements.length = 0;
        }
        if (Array.isArray(window.oppCardsElements)) {
            window.oppCardsElements.forEach(c => c && c.remove());
            window.oppCardsElements.length = 0;
        }
        document.querySelectorAll('.card').forEach(c => c.remove());
        document.querySelectorAll('#my-front-line .slot, #opp-front-line .slot').forEach(s => {
            if (typeof window.updateBpDisplay === 'function') window.updateBpDisplay(s, 0);
        });

        // 1. 補上 3 張活動 AP
        const apSlots = document.querySelectorAll('#my-ap-area .slot');
        const apDef = { id: 'UA44BT/EVA-1-AP03', name: 'AP', type: 'AP', imageUrl: 'https://rugiacreation.com/ua/cardlist/small/UA44BT_EVA-1-AP03.jpg' };
        apSlots.forEach(slot => {
            const apEl = spawnCard(apDef, slot.id, true, { faceDown: false, rest: false });
            if (apEl) apEl.classList.add('ap-card');
        });

        // 2. 補上 20 張牌組卡（供抽牌、看牌頂、堆墓測試）與 7 張生命卡
        const filler = getSampleCardsForDummy(27);
        filler.slice(0, 20).forEach(c => spawnCard(c, 'my-deck-area', true, { faceDown: true }));
        filler.slice(20, 27).forEach(c => spawnCard(c, 'my-life-area', true, { faceDown: true }));

        // 3. 補上對手測試標靶
        spawnDummyEnemies();

        // 4. 初始化引擎為我方主要階段（啟用全自動模式與單人測試旗標）
        if (window.uaEngine) {
            window.uaEngine.resetMatchState();
            window.uaEngine.enabled = true;
            window.uaEngine.isSoloTestMode = true;
            const bypassEl = document.getElementById('uatm-bypass-chk');
            window.uaEngine.soloTestBypass = bypassEl ? bypassEl.checked : true;
            window.uaEngine.isFirstPlayer = true;
            window.uaEngine.isMyTurn = true;
            window.uaEngine.turnNumber = 3;
            window.uaEngine.currentPhase = '主要';
            const btnFirst = document.getElementById('btn-claim-first');
            if (btnFirst) btnFirst.style.display = 'none';
            const mainPhaseStep = document.querySelectorAll('.phase-step')[2];
            if (mainPhaseStep) {
                document.querySelectorAll('.phase-step').forEach(b => b.classList.remove('active'));
                mainPhaseStep.classList.add('active');
            }
            window.uaEngine.updateEnergyHUD();
        }
    }

    function exportBugReport() {
        const bugs = Object.values(state.statusMap)
            .filter(r => r && r.status === 'bug')
            .filter(r => state.selectedSeries === 'ALL' || r.series === state.selectedSeries);

        if (bugs.length === 0) {
            showSysMsg('目前篩選範圍內沒有標記為「有問題」的卡片。');
            return;
        }

        const enriched = bugs.map(b => {
            const def = state.uniqueCards.find(c => c._canonicalKey === b.canonicalKey || c.id === b.id);
            return {
                id: b.id,
                name: b.name,
                series: b.series,
                color: b.color,
                hasDLC: def ? hasDlcScript(def) : false,
                note: b.note || '(無備註)',
                effectText: def ? (def.effectText || '') : '',
                triggerText: def ? (def.triggerText || '') : ''
            };
        });

        const lines = [`【NCHUCGC 卡片效果異常回報清單】（共 ${enriched.length} 張）`];
        enriched.forEach((item, i) => {
            lines.push(`\n${i + 1}. [${item.id}] ${item.name} (${item.series} / ${COLOR_ZH[item.color] || item.color} / ${item.hasDLC ? 'DLC' : '自動解析'})`);
            lines.push(`   問題備註：${item.note}`);
            if (item.effectText) lines.push(`   效果原文：${item.effectText.replace(/\n/g, ' | ')}`);
            if (item.triggerText) lines.push(`   觸發原文：${item.triggerText}`);
        });

        const text = lines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            showSysMsg(`已複製 ${enriched.length} 張問題卡清單至剪貼簿，可直接貼上進行批次修正！`);
        }).catch(() => {
            prompt('請手動複製問題清單：', text);
        });
    }

    // ==================== 左側測試抽屜 UI ====================

    function injectStyles() {
        if (document.getElementById('uatm-styles')) return;
        const style = document.createElement('style');
        style.id = 'uatm-styles';
        style.textContent = `
            #ua-admin-test-drawer {
                display: none; position: absolute; top: 0; left: 0; bottom: 0; width: 350px;
                background: #111426; border-right: 2px solid #3c4370; z-index: 10025;
                flex-direction: column; box-sizing: border-box; box-shadow: 6px 0 24px rgba(0,0,0,0.85);
                pointer-events: auto;
            }
            .uatm-head {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 12px; background: #181c36; border-bottom: 1px solid #2e3559;
            }
            .uatm-head-title { font-size: 14px; font-weight: 900; color: #6fb897; letter-spacing: 0.5px; }
            .uatm-controls {
                padding: 8px 10px; background: #141729; border-bottom: 1px solid #2b3052;
                display: flex; flex-direction: column; gap: 6px;
            }
            .uatm-btn-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
            .uatm-btn-row-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
            .uatm-btn {
                background: #232845; color: #e6e8f2; border: 1px solid #3c4370; border-radius: 6px;
                padding: 5px 6px; font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.15s;
            }
            .uatm-btn:hover { border-color: #b39ddb; color: #fff; }
            .uatm-btn.primary { background: #4f9678; border-color: #4f9678; color: #fff; }
            .uatm-btn.danger { background: #a3455a; border-color: #c1596f; color: #fff; }
            .uatm-filters {
                padding: 8px 10px; background: #141729; border-bottom: 1px solid #2b3052;
                display: flex; flex-direction: column; gap: 6px;
            }
            .uatm-select, .uatm-input {
                width: 100%; box-sizing: border-box; background: #0c0e1a; color: #fff;
                border: 1px solid #353c66; border-radius: 6px; padding: 6px 8px; font-size: 12px; outline: none;
            }
            .uatm-pills { display: flex; gap: 4px; flex-wrap: wrap; }
            .uatm-pill {
                flex: 1; text-align: center; padding: 4px 4px; font-size: 11px; font-weight: 700;
                border-radius: 5px; border: 1px solid #353c66; background: #1a1e36; color: #cfd4e6; cursor: pointer;
            }
            .uatm-pill.active { background: #b39ddb; color: #121424; border-color: #b39ddb; }
            .uatm-stats { font-size: 11px; color: #9aa0b8; display: flex; justify-content: space-between; }
            .uatm-list {
                flex: 1; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 5px;
                -webkit-overflow-scrolling: touch; touch-action: pan-y;
            }
            .uatm-item {
                display: flex; align-items: center; gap: 8px; padding: 6px 8px;
                background: #171b30; border: 1px solid #2b3052; border-radius: 7px; cursor: pointer;
                transition: 0.12s; border-left: 4px solid #666;
            }
            .uatm-item:hover { border-color: #8d7cc4; }
            .uatm-item.selected { background: #23294a; border-color: #b39ddb; }
            .uatm-item.st-ok { border-right: 4px solid #2ecc71; }
            .uatm-item.st-bug { border-right: 4px solid #e74c3c; background: rgba(231, 76, 60, 0.12); }
            .uatm-thumb { width: 34px; height: 48px; object-fit: cover; border-radius: 4px; flex-shrink: 0; background: #0c0e1a; }
            .uatm-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
            .uatm-name { font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .uatm-meta { font-size: 11px; color: #9aa0b8; display: flex; gap: 6px; align-items: center; }
            .uatm-tag { font-size: 10px; padding: 1px 5px; border-radius: 4px; font-weight: 700; }
            .uatm-inspector {
                background: #181c36; border-top: 2px solid #3c4370; padding: 10px;
                display: flex; flex-direction: column; gap: 7px; flex-shrink: 0;
            }
            .uatm-eff-box {
                background: #0c0e1a; border: 1px solid #2b3052; border-radius: 6px;
                padding: 6px 8px; font-size: 11px; color: #d5d9ea; line-height: 1.45;
                max-height: 86px; overflow-y: auto; white-space: pre-wrap; user-select: text; -webkit-user-select: text;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureDrawerDOM() {
        if (document.getElementById('ua-admin-test-drawer')) return;
        injectStyles();

        const drawer = document.createElement('div');
        drawer.id = 'ua-admin-test-drawer';
        drawer.innerHTML = `
            <div class="uatm-head">
                <span class="uatm-head-title">單人卡牌測試台</span>
                <button class="uatm-btn danger" id="uatm-btn-exit" style="padding:4px 10px;">退出測試</button>
            </div>
            <div class="uatm-controls">
                <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#d1c4e9; cursor:pointer;">
                    <input type="checkbox" id="uatm-bypass-chk" checked>
                    <span>無視費用 / AP / 階段限制（快速出牌測試）</span>
                </label>
                <div class="uatm-btn-row">
                    <button class="uatm-btn" id="uatm-btn-enemies">補假敵人</button>
                    <button class="uatm-btn" id="uatm-btn-reset">重置盤面</button>
                    <button class="uatm-btn primary" id="uatm-btn-export">匯出問題</button>
                </div>
                <div class="uatm-btn-row-4">
                    <button class="uatm-btn" id="uatm-btn-turn" title="切換我方回合／對手回合，可測對手回合常駐、持續 BP 與凍結">切換回合</button>
                    <button class="uatm-btn" id="uatm-btn-dmg" title="翻開我方 1 張生命卡測試 Trigger">吃 1 傷</button>
                    <button class="uatm-btn" id="uatm-btn-opp-atk" title="模擬對手發動攻擊，測試防禦與 [ブロック時]">模擬敵攻</button>
                    <button class="uatm-btn" id="uatm-btn-retire" title="將我方場上點選中的角色退場，觸發 [退場時]">退場選中</button>
                </div>
            </div>
            <div class="uatm-filters">
                <select id="uatm-series" class="uatm-select"></select>
                <div style="display:flex; gap:6px;">
                    <input type="text" id="uatm-search" class="uatm-input" placeholder="搜尋卡號 / 名稱..." style="flex:1;">
                    <select id="uatm-status" class="uatm-select" style="width:92px;">
                        <option value="ALL">全狀態</option>
                        <option value="untested">未測試</option>
                        <option value="ok">通過</option>
                        <option value="bug">有問題</option>
                    </select>
                </div>
                <div class="uatm-pills" id="uatm-colors">
                    <button class="uatm-pill active" data-c="ALL">全</button>
                    <button class="uatm-pill" data-c="RED">紅</button>
                    <button class="uatm-pill" data-c="BLUE">藍</button>
                    <button class="uatm-pill" data-c="GREEN">綠</button>
                    <button class="uatm-pill" data-c="YELLOW">黃</button>
                    <button class="uatm-pill" data-c="PURPLE">紫</button>
                </div>
                <div class="uatm-stats" id="uatm-stats"></div>
            </div>
            <div class="uatm-list" id="uatm-list"></div>
            <div class="uatm-inspector" id="uatm-inspector">
                <div style="font-size:12px; color:#8c93ad; text-align:center;">點選上方卡片檢視效果與標記（雙擊直接加入手牌）</div>
            </div>
        `;

        const viewport = document.getElementById('board-viewport');
        if (viewport) viewport.appendChild(drawer);

        // 防止抽屜內點擊觸發牌桌平移
        ['mousedown', 'touchstart', 'wheel'].forEach(evt => {
            drawer.addEventListener(evt, e => e.stopPropagation(), { passive: false });
        });

        drawer.querySelector('#uatm-btn-exit').onclick = exitTestMode;
        drawer.querySelector('#uatm-btn-enemies').onclick = spawnDummyEnemies;
        drawer.querySelector('#uatm-btn-reset').onclick = () => {
            setupSoloBoard();
            refreshTurnBtn();
            showSysMsg('測試盤面已重置');
        };
        drawer.querySelector('#uatm-btn-export').onclick = exportBugReport;

        const turnBtn = drawer.querySelector('#uatm-btn-turn');
        const refreshTurnBtn = () => {
            if (!turnBtn || !window.uaEngine) return;
            if (window.uaEngine.isMyTurn) {
                turnBtn.textContent = '換敵回合';
                turnBtn.style.background = '#232845';
                turnBtn.style.borderColor = '#3c4370';
            } else {
                turnBtn.textContent = '回我回合';
                turnBtn.style.background = '#8d7cc4';
                turnBtn.style.borderColor = '#b39ddb';
            }
        };
        turnBtn.onclick = () => {
            if (!window.uaEngine) return;
            if (window.uaEngine.isMyTurn) {
                window.uaEngine.finalizeEndTurn();
                showSysMsg('已進入【對手回合】（可測「對手回合中」效果或點擊「模擬敵攻」，再按一次回到我方下回合）');
            } else {
                window.uaEngine.turnNumber++;
                window.uaEngine.beginMyTurn();
                // 方便測試者直接出牌，切換到主要階段（起始抽牌與凍結判定已在 beginMyTurn 完成）
                showSysMsg(`已進入我方第 ${window.uaEngine.turnNumber} 回合（起始階段已抽牌並結算凍結狀態）`);
            }
            refreshTurnBtn();
        };

        drawer.querySelector('#uatm-btn-dmg').onclick = () => {
            if (!window.uaEngine) return;
            const lifeArea = document.getElementById('my-life-area');
            if (!lifeArea || lifeArea.querySelectorAll('.card').length === 0) {
                showSysMsg('我方生命區已空！可點「放到生命頂」或「重置盤面」補卡。');
                return;
            }
            window.uaEngine.processMyLifeDamage(1);
        };

        drawer.querySelector('#uatm-btn-opp-atk').onclick = () => {
            if (!window.uaEngine) return;
            window.uaEngine.promptModal({
                title: '【測試】模擬對手攻擊',
                desc: '選擇假敵人的攻擊 BP（將彈出我方防禦視窗，可測 [ブロック時]、[2回ブロック] 與敗戰退場）：',
                cards: [],
                customButtons: [
                    { label: 'BP 3000 攻擊', color: '#4f739e', onClick: () => window.uaEngine.onOpponentAttackDeclared({ attackId: 'solo_' + Date.now(), attackerName: '假敵人 (3000)', attackerBp: 3000, unblockableMaxBp: 0, damage: 1, impact: 0 }) },
                    { label: 'BP 4000 攻擊', color: '#8d7cc4', onClick: () => window.uaEngine.onOpponentAttackDeclared({ attackId: 'solo_' + Date.now(), attackerName: '假敵人 (4000)', attackerBp: 4000, unblockableMaxBp: 0, damage: 1, impact: 0 }) },
                    { label: 'BP 5000 衝擊(1)', color: '#c1596f', onClick: () => window.uaEngine.onOpponentAttackDeclared({ attackId: 'solo_' + Date.now(), attackerName: '假敵人 (5000 衝擊)', attackerBp: 5000, unblockableMaxBp: 0, damage: 1, impact: 1 }) }
                ]
            });
        };

        drawer.querySelector('#uatm-btn-retire').onclick = () => {
            if (!window.uaEngine) return;
            const active = window.activeCard;
            const slot = active && active.parentElement;
            if (!slot || (!slot.closest('#my-front-line') && !slot.closest('#my-energy-line'))) {
                showSysMsg('請先點選我方前線或能源線上的角色卡，再按「退場選中」。');
                return;
            }
            window.uaEngine.retireCardFromSlot(slot);
            window.activeCard = null;
        };

        drawer.querySelector('#uatm-bypass-chk').onchange = (e) => {
            if (window.uaEngine) {
                window.uaEngine.soloTestBypass = e.target.checked;
                showSysMsg(e.target.checked ? '已啟用：無視費用 / AP / 階段限制' : '已關閉：恢復嚴格能源 / AP / 階段檢查');
            }
        };

        drawer.querySelector('#uatm-series').onchange = (e) => {
            state.selectedSeries = e.target.value;
            renderList();
        };
        drawer.querySelector('#uatm-status').onchange = (e) => {
            state.selectedStatus = e.target.value;
            renderList();
        };
        drawer.querySelector('#uatm-search').oninput = (e) => {
            state.searchQuery = e.target.value.trim().toLowerCase();
            renderList();
        };
        drawer.querySelectorAll('#uatm-colors .uatm-pill').forEach(btn => {
            btn.onclick = () => {
                drawer.querySelectorAll('#uatm-colors .uatm-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.selectedColor = btn.dataset.c;
                renderList();
            };
        });
    }

    function populateSeriesDropdown() {
        const sel = document.getElementById('uatm-series');
        if (!sel) return;
        sel.innerHTML = `<option value="ALL">全部系列（去重後共 ${state.uniqueCards.length} 張）</option>` +
            state.seriesList.map(s => {
                const cnt = state.uniqueCards.filter(c => c.series === s).length;
                return `<option value="${escapeHtml(s)}">${escapeHtml(s)} (${cnt})</option>`;
            }).join('');
        sel.value = state.selectedSeries;
    }

    function getFilteredCards() {
        return state.uniqueCards.filter(c => {
            if (state.selectedSeries !== 'ALL' && c.series !== state.selectedSeries) return false;
            if (state.selectedColor !== 'ALL' && c.color !== state.selectedColor) return false;
            if (state.searchQuery) {
                const zh = getZh(c);
                const hay = `${c.id} ${c.name || ''} ${zh?.name || ''} ${c.effectText || ''} ${zh?.effectText || ''}`.toLowerCase();
                if (!hay.includes(state.searchQuery)) return false;
            }
            const rec = getStatusRecord(c);
            const st = rec ? rec.status : 'untested';
            if (state.selectedStatus !== 'ALL' && st !== state.selectedStatus) return false;
            return true;
        });
    }

    function renderList() {
        const listEl = document.getElementById('uatm-list');
        const statsEl = document.getElementById('uatm-stats');
        if (!listEl) return;

        // 先計算目前系列/顏色下的總進度
        const scopeCards = state.uniqueCards.filter(c =>
            (state.selectedSeries === 'ALL' || c.series === state.selectedSeries) &&
            (state.selectedColor === 'ALL' || c.color === state.selectedColor)
        );
        let okCnt = 0, bugCnt = 0;
        scopeCards.forEach(c => {
            const r = getStatusRecord(c);
            if (r?.status === 'ok') okCnt++;
            else if (r?.status === 'bug') bugCnt++;
        });
        if (statsEl) {
            statsEl.innerHTML = `<span>總計 ${scopeCards.length}（已去異圖）</span><span>通過 <b style="color:#2ecc71;">${okCnt}</b> ｜ 問題 <b style="color:#e74c3c;">${bugCnt}</b></span>`;
        }

        const matched = getFilteredCards();
        listEl.innerHTML = '';

        if (matched.length === 0) {
            listEl.innerHTML = `<div style="padding:20px; text-align:center; color:#7f85a3; font-size:12px;">沒有符合條件的卡片</div>`;
            return;
        }

        // 限制一次最多渲染 150 張，提示選擇系列以保持流暢
        const slice = matched.slice(0, 150);
        slice.forEach(card => {
            const rec = getStatusRecord(card);
            const stClass = rec?.status === 'ok' ? 'st-ok' : (rec?.status === 'bug' ? 'st-bug' : '');
            const isSel = state.activeCardDef && state.activeCardDef._canonicalKey === card._canonicalKey;
            const colHex = COLOR_HEX[card.color] || '#666';
            const dlcBadge = hasDlcScript(card)
                ? `<span class="uatm-tag" style="background:#3a4a7a; color:#b8d4ff;">DLC</span>`
                : `<span class="uatm-tag" style="background:#262a42; color:#8c93ad;">自動</span>`;
            const stBadge = rec?.status === 'ok'
                ? `<span class="uatm-tag" style="background:#2ecc71; color:#111;">通過</span>`
                : (rec?.status === 'bug' ? `<span class="uatm-tag" style="background:#e74c3c; color:#fff;">問題</span>` : '');

            const row = document.createElement('div');
            row.className = `uatm-item ${stClass}` + (isSel ? ' selected' : '');
            row.style.borderLeftColor = colHex;
            row.innerHTML = `
                <img class="uatm-thumb" src="${escapeHtml(card.imageUrl || '')}" loading="lazy" alt="">
                <div class="uatm-info">
                    <div class="uatm-name">${escapeHtml(displayName(card))}</div>
                    <div class="uatm-meta">
                        <span>${escapeHtml(card.id)}</span>
                        <span>En:${card.requiredEnergy?.count ?? 0}</span>
                        ${card.bp ? `<span>BP:${card.bp}</span>` : ''}
                    </div>
                    <div class="uatm-meta">${dlcBadge} ${stBadge} ${rec?.note ? `<span style="color:#f6e08b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(rec.note)}</span>` : ''}</div>
                </div>
            `;
            row.onclick = () => {
                state.activeCardDef = card;
                renderList();
                renderInspector();
            };
            row.ondblclick = () => {
                state.activeCardDef = card;
                spawnCard(card, 'my-hand-area', true, { faceDown: false });
                showSysMsg(`已將【${card.name}】加入手牌`);
                renderInspector();
            };
            listEl.appendChild(row);
        });

        if (matched.length > 150) {
            const more = document.createElement('div');
            more.style.cssText = 'padding:8px; text-align:center; color:#8c93ad; font-size:11px;';
            more.textContent = `尚有 ${matched.length - 150} 張未顯示，請選擇特定系列或輸入關鍵字篩選`;
            listEl.appendChild(more);
        }
    }

    function renderInspector() {
        const box = document.getElementById('uatm-inspector');
        if (!box) return;
        const card = state.activeCardDef;
        if (!card) {
            box.innerHTML = `<div style="font-size:12px; color:#8c93ad; text-align:center;">點選上方卡片檢視效果與標記（雙擊直接加入手牌）</div>`;
            return;
        }
        const rec = getStatusRecord(card);
        const rawEff = displayEffect(card);
        const rawTrig = displayTrigger(card);
        const effText = (rawEff && rawEff !== '-') ? rawEff : '（無主要效果）';
        const trigText = (rawTrig && rawTrig !== '-') ? `\n[Trigger] ${rawTrig}` : '';

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                <span style="font-size:13px; font-weight:900; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(displayName(card))}</span>
                <span style="font-size:11px; color:#b39ddb; flex-shrink:0;">${escapeHtml(card.id)}</span>
            </div>
            <div class="uatm-eff-box">${escapeHtml(effText + trigText)}</div>
            <div class="uatm-btn-row-4">
                <button class="uatm-btn primary" id="uatm-spawn-hand">手牌</button>
                <button class="uatm-btn" id="uatm-spawn-out">場外</button>
                <button class="uatm-btn" id="uatm-spawn-top">牌頂</button>
                <button class="uatm-btn" id="uatm-spawn-life" title="放至生命區頂端，搭配「吃 1 傷」測 Trigger">生命頂</button>
            </div>
            <input type="text" id="uatm-note-input" class="uatm-input" placeholder="問題備註（例如：選目標沒濾卡名）" value="${escapeHtml(rec?.note || '')}">
            <div class="uatm-btn-row">
                <button class="uatm-btn" id="uatm-mark-ok" style="${rec?.status === 'ok' ? 'background:#2ecc71; color:#111; border-color:#2ecc71;' : ''}">標記通過</button>
                <button class="uatm-btn" id="uatm-mark-bug" style="${rec?.status === 'bug' ? 'background:#e74c3c; color:#fff; border-color:#e74c3c;' : ''}">標記有問題</button>
                <button class="uatm-btn" id="uatm-mark-clear">清除標記</button>
            </div>
        `;

        box.querySelector('#uatm-spawn-hand').onclick = () => {
            spawnCard(card, 'my-hand-area', true, { faceDown: false });
            showSysMsg(`已將【${card.name}】加入手牌`);
        };
        box.querySelector('#uatm-spawn-out').onclick = () => {
            spawnCard(card, 'my-outside-area', true, { faceDown: false });
            showSysMsg(`已將【${card.name}】置於場外`);
        };
        box.querySelector('#uatm-spawn-top').onclick = () => {
            spawnCard(card, 'my-deck-area', true, { faceDown: true });
            showSysMsg(`已將【${displayName(card)}】置於牌頂`);
        };
        box.querySelector('#uatm-spawn-life').onclick = () => {
            spawnCard(card, 'my-life-area', true, { faceDown: true });
            showSysMsg(`已將【${displayName(card)}】置於生命區頂端（點「吃 1 傷」即可測試觸發）`);
        };

        const noteInput = box.querySelector('#uatm-note-input');
        box.querySelector('#uatm-mark-ok').onclick = () => saveCardStatus(card, 'ok', noteInput.value);
        box.querySelector('#uatm-mark-bug').onclick = () => saveCardStatus(card, 'bug', noteInput.value);
        box.querySelector('#uatm-mark-clear').onclick = () => saveCardStatus(card, null, '');
        noteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const nextStatus = rec?.status || 'bug';
                saveCardStatus(card, nextStatus, noteInput.value);
                showSysMsg('已儲存備註');
            }
        });
    }

    function enterTestMode() {
        if (!window.nchucgcLobby || !window.nchucgcLobby.isAdminUser()) {
            showSysMsg('僅限管理員帳號可使用單人測試模式。');
            return;
        }
        buildUniqueCatalog();
        loadLocalStatuses();
        initFirebaseSync();
        ensureDrawerDOM();
        populateSeriesDropdown();

        state.active = true;
        document.body.classList.add('in-game');
        document.getElementById('nchucgc-nav').style.display = 'none';
        const matchBar = document.getElementById('global-match-bar');
        if (matchBar) matchBar.style.display = 'none';
        ['home-scene', 'tier-scene', 'lobby-scene', 'builder-scene'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.getElementById('game-scene').style.display = 'flex';

        const hk = document.getElementById('hotkey-guide');
        if (hk) hk.style.display = 'none';

        const drawer = document.getElementById('ua-admin-test-drawer');
        if (drawer) drawer.style.display = 'flex';

        setupSoloBoard();
        renderList();
        renderInspector();

        setTimeout(() => {
            if (typeof window.resetCam === 'function') window.resetCam();
            // 將牌桌稍微往右平移，避開左側 350px 測試抽屜
            window.camX = (window.camX || 0) + 155;
            const table = document.getElementById('game-table-inner');
            if (table) table.style.transform = `translate(${window.camX}px, ${window.camY}px) scale(${window.boardScale})`;
        }, 120);
    }

    function exitTestMode() {
        state.active = false;
        const drawer = document.getElementById('ua-admin-test-drawer');
        if (drawer) drawer.style.display = 'none';
        const hk = document.getElementById('hotkey-guide');
        if (hk) hk.style.display = 'flex';
        if (window.uaEngine) {
            window.uaEngine.isSoloTestMode = false;
            window.uaEngine.soloTestBypass = false;
        }
        if (typeof window.resetBoard === 'function') window.resetBoard();
    }

    window.uaTestMode = {
        enter: enterTestMode,
        exit: exitTestMode,
        isActive: () => state.active
    };
})();
