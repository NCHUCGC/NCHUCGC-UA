/**
 * Union Arena 全自動規則與全效果語義解讀引擎 (ua-rule-engine.js v2.0)
 * 升級重點：
 * 1. 廢除依賴舊爬蟲死板的 abilities 分類，改由引擎在執行期直接對 effectText 與 triggerText 進行完整 AST 語義解讀！
 * 2. 支援「複合時機」（如 [自分のターン中][登場時]、[登場時][アタック時]）。
 * 3. 支援「選發代價」（～てもよい。そうした場合、...）：自動彈出是否支付代價的確認視窗。
 * 4. 完整涵蓋 18 種原子動作（含 REZ 雷姆看3張選任意張放牌頂其餘放場外、手牌/場外特召登場、前線/能源線移動、冰凍鎖定等）。
 * 5. 內建「未知特殊句型半自動結算輔助視窗」，確保全卡池 100% 卡片登場時皆有反應！
 */
(function () {
    const COLOR_NAMES = { RED: '紅', BLUE: '藍', GREEN: '綠', YELLOW: '黃', PURPLE: '紫', NONE: '無' };
    const COLOR_HEX = { RED: '#e74c3c', BLUE: '#3498db', GREEN: '#2ecc71', YELLOW: '#f1c40f', PURPLE: '#9b59b6', NONE: '#95a5a6' };
    const JP_COLOR_MAP = { '赤': 'RED', '青': 'BLUE', '緑': 'GREEN', '黄': 'YELLOW', '紫': 'PURPLE' };

    class UARuleEngine {
constructor() {
            this.enabled = true;
            this.catalogMap = new Map();
            this.baseIdMap = new Map();
            this.resolvedDefCache = new Map(); // 用於 Fix #7 快取衍生定義
            this.turnNumber = 1;
            this.isFirstPlayer = null;
            this.isMyTurn = false;
            this.hasTakenFirstTurn = false; // 追蹤是否已進行過自己的第 1 回合
            this.currentPhase = '起始';
            this.usedExtraDraw = false;
            this.cardRuntime = new Map();
            this.combatState = null;
            this.deckDominantColor = null;
            this.recentLogs = [];
            this.lastExecutedContext = null;
            this.bouncedCharThisTurn = false;
            this.playedFromDeckThisTurn = false;
            this.usedEventThisTurn = false;
            this.pendingApDiscounts = [];
            this.usedNamedAbilityThisTurn = new Set();
            this.waitingForOppTrigger = false;
            this.oppTriggerTimeoutId = null;
            this.oppSyncedKeywords = {};
            this.isSoloTestMode = false;
            this.soloTestBypass = false;
        }

        // Fix #6: 匯出我方場上所有角色的關鍵字徽章，讓對手端能 100% 同步看到
        exportMyKeywordBadgesMap() {
            const map = {};
            if (!this.enabled) return map;
            document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(slot => {
                const topCard = this.getTopCardInSlot(slot);
                if (!topCard || topCard.classList.contains('is-flipped')) return;
                const badges = this.computeBadgesForCard(topCard);
                if (badges.length > 0) map[slot.id] = badges;
            });
            return map;
        }

        applyOpponentKeywordBadgesMap(kwStates) {
            this.oppSyncedKeywords = {};
            if (!kwStates || typeof kwStates !== 'object') return;
            for (const [mySlotId, badges] of Object.entries(kwStates)) {
                const oppSlotId = mySlotId.replace('my-', 'opp-');
                this.oppSyncedKeywords[oppSlotId] = badges;
            }
        }

        computeBadgesForCard(cardEl) {
            const def = this.getCardDef(cardEl);
            if (!def || def.type !== 'CHARACTER') return [];
            const rt = this.getRuntime(cardEl);
            const innate = this.getInnateStaticKeywords(def);
            const badges = [];

            const impactVal = this.getCardImpactValue(cardEl);
            if (impactVal > 0) badges.push({ text: `衝擊(${impactVal})`, bg: '#c0392b' });

            const hasSnipe = innate.snipe || !!(rt?.tempKeywords?.SNIPE);
            if (hasSnipe) badges.push({ text: '狙擊', bg: '#8e44ad' });

            const hasDoubleBlock = innate.doubleBlock || !!(rt?.tempKeywords?.DOUBLE_BLOCK);
            if (hasDoubleBlock) badges.push({ text: '2回阻擋', bg: '#2980b9' });

            const hasDoubleAttack = innate.doubleAttack || !!(rt?.tempKeywords?.DOUBLE_ATTACK);
            if (hasDoubleAttack) badges.push({ text: '2回攻擊', bg: '#d35400' });

            if (innate.impactNullify) badges.push({ text: '衝擊無效', bg: '#2c3e50' });
            return badges;
        }

        // 精準解析卡片「常駐自帶關鍵字」，排除「給予他人」「條件獲得」「衝擊無效被誤判為衝擊」等誤判
        getInnateStaticKeywords(def) {
            const res = { impact: 0, damage: 0, snipe: false, step: false, doubleAttack: false, doubleBlock: false, impactNullify: false };
            if (!def || !def.effectText || def.effectText === '-') return res;
            const lines = def.effectText.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                const clean = line
                    .replace(/］（[^）]*）/g, '］')
                    .replace(/\]（[^）]*）/g, ']')
                    .replace(/(?<!\[[^\]]*)（[^）]*）/g, '')
                    .trim();
                // 僅承認整行都是純靜態關鍵字標籤的行（不含條件句、不含「与える」「を得る」）
                if (!/^(\[[^\]]+\]\s*)+$/.test(clean)) continue;
                const tags = clean.match(/\[[^\]]+\]/g) || [];
                for (const tag of tags) {
                    if (tag.includes('インパクト無効')) res.impactNullify = true;
                    else if (tag.startsWith('[インパクト')) {
                        const m = tag.match(/(\d+)/);
                        res.impact = Math.max(res.impact, m ? parseInt(m[1], 10) : 1);
                    }
                    else if (tag.startsWith('[ダメージ')) {
                        const m = tag.match(/(\d+)/);
                        if (m) res.damage = Math.max(res.damage, parseInt(m[1], 10));
                    }
                    else if (tag === '[狙い撃ち]') res.snipe = true;
                    else if (tag === '[ステップ]') res.step = true;
                    else if (tag === '[2回アタック]') res.doubleAttack = true;
                    else if (tag === '[2回ブロック]') res.doubleBlock = true;
                }
            }
            return res;
        }

        // Fix #9: 讓玩家選擇要將角色登場在前線還是能源線（若兩邊都有空位）
        chooseEmptyFieldSlotAndPlace(cardEl, { allowFront = true, allowEnergy = true, enterRest = true } = {}, onPlaced = null) {
            const emptyFront = allowFront ? Array.from(document.querySelectorAll('#my-front-line .slot')).find(s => s.querySelectorAll('.card').length === 0) : null;
            const emptyEnergy = allowEnergy ? Array.from(document.querySelectorAll('#my-energy-line .slot')).find(s => s.querySelectorAll('.card').length === 0) : null;

            const placeInto = (slot) => {
                if (!slot) {
                    showSysMsg('場上沒有可用空位！');
                    if (onPlaced) onPlaced(null);
                    return;
                }
                this.moveCardToZone(cardEl, slot);
                if (enterRest) cardEl.classList.add('rest');
                else cardEl.classList.remove('rest');
                this.updateEnergyHUD();
                broadcastMyState();
                if (onPlaced) onPlaced(slot);
            };

            if (emptyFront && emptyEnergy) {
                const name = this.getCardDef(cardEl)?.name || '卡片';
                this.promptModal({
                    title: `選擇登場位置：【${name}】`,
                    desc: `請問要將【${name}】登場於【前線】還是【能源線】？`,
                    cards: [cardEl],
                    customButtons: [
                        { label: '⚔️ 登場於【前線 (FRONT LINE)】', color: '#c1596f', onClick: () => placeInto(emptyFront) },
                        { label: '⚡ 登場於【能源線 (ENERGY LINE)】', color: '#4f9678', onClick: () => placeInto(emptyEnergy) }
                    ]
                });
            } else {
                placeInto(emptyFront || emptyEnergy);
            }
        }

        countEventsInMyOutside() {
            let cnt = 0;
            document.querySelectorAll('#my-outside-area .card').forEach(c => {
                const d = this.getCardDef(c);
                if (d && (d.type === 'EVENT' || (d.effectText && d.effectText.includes('イベントカードとしても扱う')))) {
                    cnt++;
                }
            });
            return cnt;
        }

        hasOppLoweredBpChar() {
            return Array.from(document.querySelectorAll('#opp-front-line .slot')).some(slot => {
                if (!this.getTopCardInSlot(slot)) return false;
                const tracker = slot.querySelector('.bp-tracker');
                return tracker && (parseInt(tracker.dataset.bp, 10) || 0) < 0;
            });
        }

        getEffectiveApCost(cardDef) {
            let cost = cardDef?.apCost !== undefined ? cardDef.apCost : 1;
            if (!cardDef || !this.pendingApDiscounts || this.pendingApDiscounts.length === 0) return cost;
            for (const disc of this.pendingApDiscounts) {
                if (disc.matchFn && disc.matchFn(cardDef)) {
                    cost = Math.max(0, cost - (disc.amount || 1));
                    break;
                }
            }
            return cost;
        }

        payApForCard(cardDef) {
            if (this.isSoloTestMode && this.soloTestBypass) return true;
            let cost = cardDef?.apCost !== undefined ? cardDef.apCost : 1;
            if (cardDef && this.pendingApDiscounts && this.pendingApDiscounts.length > 0) {
                const idx = this.pendingApDiscounts.findIndex(d => d.matchFn && d.matchFn(cardDef));
                if (idx !== -1) {
                    const disc = this.pendingApDiscounts.splice(idx, 1)[0];
                    cost = Math.max(0, cost - (disc.amount || 1));
                    showSysMsg(`已套用 AP 減免效果（${disc.desc}），實際支付 ${cost} AP！`);
                }
            }
            return cost === 0 ? true : this.payAp(cost);
        }

        getCardScriptById(cardId) {
            if (!cardId || !window.UACardScripts) return null;
            return window.UACardScripts[this.getBaseCardId(cardId)] || window.UACardScripts[cardId] || null;
        }

        getCardScript(cardEl) {
            if (!cardEl || !cardEl.dataset?.cardId) return null;
            return this.getCardScriptById(cardEl.dataset.cardId);
        }

        resetMatchState() {
            this.clearCombatLock();
            this.turnNumber = 1;
            this.isFirstPlayer = null;
            this.isMyTurn = false;
            this.hasTakenFirstTurn = false;
            this.currentPhase = '起始';
            this.usedExtraDraw = false;
            this.bouncedCharThisTurn = false;
            this.playedFromDeckThisTurn = false;
            this.usedEventThisTurn = false;
            this.pendingApDiscounts = [];
            this.usedNamedAbilityThisTurn.clear();
            this.waitingForOppTrigger = false;
            if (this.oppTriggerTimeoutId) { clearTimeout(this.oppTriggerTimeoutId); this.oppTriggerTimeoutId = null; }
            this.oppSyncedKeywords = {};
            this.cardRuntime.clear();
            this.deckDominantColor = null;
            this.resolvedDefCache.clear();
            this.lastExecutedContext = null;
            const modal = document.getElementById('ua-prompt-modal');
            if (modal) modal.style.display = 'none';
            const btnFirst = document.getElementById('btn-claim-first');
            if (btnFirst) btnFirst.style.display = 'block';
            this.updateEnergyHUD();
        }

        recordLog(msg) {
            if (!msg) return;
            const time = new Date().toLocaleTimeString('zh-TW', { hour12: false });
            this.recentLogs.push(`[${time}] ${msg}`);
            if (this.recentLogs.length > 20) this.recentLogs.shift();
        }

copyBugReportToClipboard(overrideCardEl = null) {
            const targetCardEl = overrideCardEl || window.activeCard || this.lastExecutedContext?.cardEl || null;
            const def = targetCardEl ? this.getCardDef(targetCardEl) : (this.lastExecutedContext?.def || null);
            const rawText = def?.effectText || this.lastExecutedContext?.rawText || '';
            const rawActions = this.lastExecutedContext?.actions || (rawText ? this.compileSequentialClauses(rawText) : []);

            // 安全轉換 actions，避免帶有 getter 異常的測試物件在 JSON.stringify 時拋錯
            const safeActions = (rawActions || []).map(a => {
                try {
                    return JSON.parse(JSON.stringify(a));
                } catch (e) {
                    return { type: a?.type || 'CORRUPTED_ACTION', error: String(e?.message || e) };
                }
            });

            const fullSnap = this.exportEngineStateSnapshot();
            const compactRt = {};
            if (fullSnap && fullSnap.runtimeObj) {
                for (const [k, v] of Object.entries(fullSnap.runtimeObj)) {
                    if (v.enteredThisTurn || v.isRaided || v.usedOncePerTurn || v.attackCountThisTurn > 0 || v.blockCountThisTurn > 0 || v.retireAtEndOfMain || v.frozenNextTurn || (v.tempKeywords && Object.keys(v.tempKeywords).length > 0)) {
                        compactRt[k] = v;
                    }
                }
            }

            const report = {
                cardId: def?.id || targetCardEl?.dataset?.cardId || 'UNKNOWN',
                cardName: def?.name || '',
                phase: this.currentPhase,
                effectText: rawText,
                actions: safeActions,
                lastError: this.lastExecutedContext?.lastError || null,
                engineState: {
                    turn: fullSnap.turnNumber,
                    isFirst: fullSnap.isFirstPlayer,
                    isMyTurn: fullSnap.isMyTurn,
                    phase: fullSnap.currentPhase,
                    extraDraw: fullSnap.usedExtraDraw,
                    activeRt: compactRt
                },
                recentLogs: (this.recentLogs || []).slice(-20)
            };

            const jsonStr = JSON.stringify(report, null, 2);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(jsonStr).then(() => {
                    showSysMsg('📋 已複製效果錯誤回報 JSON！（可直接貼給工程師）');
                }).catch(() => {
                    prompt('請手動複製以下錯誤回報 JSON：', jsonStr);
                });
            } else {
                prompt('請手動複製以下錯誤回報 JSON：', jsonStr);
            }
            console.log('🐞 [Bug Report JSON]', report);
            return report;
        }
        getBaseCardId(id) {
            if (!id) return '';
            return id.replace(/([\/_](p\d+|s|sp\d*)|★)+$/i, '');
        }

        getZhEntry(defOrId) {
            const map = window.UA_ZH_MAP;
            if (!map || !defOrId) return null;
            const rawId = typeof defOrId === 'string' ? defOrId : defOrId.id;
            if (!rawId) return null;
            const base = this.getBaseCardId(rawId);
            if (map[base]) return map[base];
            if (map[rawId]) return map[rawId];
            return null;
        }

        getDisplayName(def) {
            if (!def) return '';
            const zh = this.getZhEntry(def);
            return (zh && zh.name) ? zh.name : (def.name || def.id || '');
        }

        getDisplayEffectText(def) {
            if (!def) return '';
            const zh = this.getZhEntry(def);
            return (zh && zh.effectText) ? zh.effectText : (def.effectText || '');
        }

        getDisplayTriggerText(def) {
            if (!def) return '';
            const zh = this.getZhEntry(def);
            return (zh && zh.triggerText) ? zh.triggerText : (def.triggerText || '');
        }

// 極速索引初始化：只建 Map 參照，不修改原物件、不做深拷貝
        initCatalog() {
            if (typeof masterCardCatalog === 'undefined') return;
            this.catalogMap.clear();
            this.baseIdMap.clear();
            this.resolvedDefCache.clear();

            for (let i = 0; i < masterCardCatalog.length; i++) {
                const c = masterCardCatalog[i];
                this.catalogMap.set(c.id, c);
                if (c.color && c.color !== 'NONE' && (c.bp !== null || c.effectText)) {
                    const baseId = this.getBaseCardId(c.id);
                    if (!this.baseIdMap.has(baseId)) {
                        this.baseIdMap.set(baseId, c);
                    }
                }
            }
        }
        detectMyDeckDominantColor() {
            if (this.deckDominantColor) return this.deckDominantColor;
            const counts = { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0, PURPLE: 0 };
            document.querySelectorAll('#my-deck-area .card, #my-hand-area .card, #my-life-area .card').forEach(el => {
                const rawId = el.dataset.cardId;
                const d = this.catalogMap.get(rawId) || this.baseIdMap.get(this.getBaseCardId(rawId));
                if (d && d.color && counts[d.color] !== undefined) counts[d.color]++;
            });
            let bestColor = 'BLUE', max = 0;
            for (const [col, cnt] of Object.entries(counts)) {
                if (cnt > max) { max = cnt; bestColor = col; }
            }
            if (max > 0) this.deckDominantColor = bestColor;
            return bestColor;
        }

        // 取得卡片定義：回傳獨立複本並惰性解析效果，絕不覆寫 masterCardCatalog 原物件
        getCardDef(cardEl) {
            if (!cardEl) return null;
            if (this.catalogMap.size === 0) this.initCatalog();
            const rawId = cardEl.dataset?.cardId;
            if (!rawId) return null;

            const isOpponentCard = !!(cardEl.parentElement && cardEl.parentElement.id.startsWith('opp-'));
            const cacheKey = `${isOpponentCard ? 'opp' : 'my'}_${rawId}`;
            if (this.resolvedDefCache.has(cacheKey)) {
                return this.resolvedDefCache.get(cacheKey);
            }

            const rawCard = this.catalogMap.get(rawId);
            const baseCard = this.baseIdMap.get(this.getBaseCardId(rawId));
            const source = (rawCard && rawCard.color && rawCard.color !== 'NONE') ? rawCard : (baseCard || rawCard);
            if (!source) return null;

            // 建立淺拷貝複本，與 masterCardCatalog 徹底脫鉤
            const def = {
                ...source,
                id: rawId,
                imageUrl: rawCard ? rawCard.imageUrl : source.imageUrl,
                requiredEnergy: source.requiredEnergy ? { ...source.requiredEnergy } : { color: 'NONE', count: 0 },
                generatedEnergy: source.generatedEnergy ? { ...source.generatedEnergy } : { color: 'NONE', count: 0 },
                traits: source.traits ? [...source.traits] : [],
                keywords: source.keywords ? [...source.keywords] : []
            };

            const isAp = def.type === 'AP' || rawId.includes('-AP');
            if (!isAp) {
                // 自動修復 0 費角色
                if (def.type === 'CHARACTER' && def.requiredEnergy.count === 1 && def.apCost === 1) {
                    const isZeroCostPattern =
                        (def.bp === 1500 && (!def.effectText || def.effectText === '-' || def.effectText.includes('手札を1枚場外に置く') || def.effectText.includes('手札に戻す'))) ||
                        (def.bp === 1000 && (!def.effectText || def.effectText === '-' || def.effectText.includes('退場させる'))) ||
                        (def.bp === 2000 && (!def.effectText || def.effectText === '-') && (!def.triggerText || def.triggerText === ''));
                    if (isZeroCostPattern && def.generatedEnergy.count <= 1) {
                        def.requiredEnergy.count = 0;
                    }
                }

                // 若為自訂無色卡，僅針對我方卡片套用我方牌組主色，且不寫回全域 catalog
                if ((!def.color || def.color === 'NONE') && !isOpponentCard) {
                    const domColor = this.detectMyDeckDominantColor();
                    def.color = domColor;
                    if (def.requiredEnergy.color === 'NONE') def.requiredEnergy.color = domColor;
                    if (def.generatedEnergy.color === 'NONE' || def.generatedEnergy.count === 0) {
                        def.generatedEnergy = { color: domColor, count: 1 };
                    }
                } else if ((def.type === 'CHARACTER' || def.type === 'FIELD') && def.generatedEnergy.count === 0) {
                    def.generatedEnergy = { color: def.color, count: 1 };
                }

                def.parsedAbilities = this.parseCardEffectTextToAbilities(def.effectText);
            }

            this.resolvedDefCache.set(cacheKey, def);
            return def;
        }

        getRuntime(cardEl) {
            if (!cardEl) return null;
            const netId = cardEl.dataset.networkId;
            if (!this.cardRuntime.has(netId)) {
                this.cardRuntime.set(netId, {
                    enteredThisTurn: false,
                    isRaided: false,
                    usedOncePerTurn: false,
                    attackCountThisTurn: 0,
                    blockCountThisTurn: 0,
                    manualEnergyCount: null,
                    tempEnergyBoost: [],
                    tempKeywords: {},
                    retireAtEndOfMain: false,
                    frozenNextTurn: false
                });
            }
            return this.cardRuntime.get(netId);
        }
// 1. 匯出規則引擎狀態供 Ctrl+Z 快照存檔
        exportEngineStateSnapshot() {
            const runtimeObj = {};
            this.cardRuntime.forEach((val, key) => {
                runtimeObj[key] = JSON.parse(JSON.stringify(val));
            });
            return {
                turnNumber: this.turnNumber,
                isFirstPlayer: this.isFirstPlayer,
                isMyTurn: this.isMyTurn,
                hasTakenFirstTurn: this.hasTakenFirstTurn,
                currentPhase: this.currentPhase,
                usedExtraDraw: this.usedExtraDraw,
                runtimeObj
            };
        }

        // 2. 從 Ctrl+Z 快照還原規則引擎狀態
        importEngineStateSnapshot(snap) {
            if (!snap) return;
            this.turnNumber = snap.turnNumber;
            this.isFirstPlayer = snap.isFirstPlayer;
            this.isMyTurn = snap.isMyTurn;
            this.hasTakenFirstTurn = snap.hasTakenFirstTurn;
            this.currentPhase = snap.currentPhase;
            this.usedExtraDraw = snap.usedExtraDraw;
            this.cardRuntime.clear();
            if (snap.runtimeObj) {
                for (const [k, v] of Object.entries(snap.runtimeObj)) {
                    this.cardRuntime.set(k, JSON.parse(JSON.stringify(v)));
                }
            }
            this.updateEnergyHUD();
        }

        // 3. 全卡池 Regex 覆蓋率自動化測試套件 (隨時可在 Console 呼叫 window.uaEngine.runParserTestSuite())
        runParserTestSuite(seriesFilter = null) {
            if (typeof masterCardCatalog === 'undefined') return;
            const seenBase = new Set();
            let totalWithEffect = 0, fullAuto = 0, fallbackCount = 0;
            const patternCounts = new Map();

            masterCardCatalog.forEach(c => {
                if (c.type === 'AP' || c.id.includes('-AP')) return;
                if (seriesFilter && !c.series.includes(seriesFilter) && !c.id.includes(seriesFilter)) return;

                const baseId = this.getBaseCardId(c.id);
                if (seenBase.has(baseId)) return;
                seenBase.add(baseId);

                if (!c.effectText || c.effectText === '-') return;
                totalWithEffect++;

                const abs = this.parseCardEffectTextToAbilities(c.effectText);
                let hasFb = false;
                abs.forEach(ab => {
                    const acts = this.compileSequentialClauses(ab.rawText);
                    acts.forEach(a => {
                        if (a.type === 'INTERACTIVE_FALLBACK') {
                            hasFb = true;
                            const tpl = a.rawSentence
                                .replace(/〈[^〉]+〉/g, '〈卡名〉')
                                .replace(/［特徴：[^］]+］/g, '［特徴：X］')
                                .replace(/\d+/g, 'N');
                            if (!patternCounts.has(tpl)) {
                                patternCounts.set(tpl, { count: 0, example: `${c.id} (${c.name}): ${a.rawSentence}` });
                            }
                            patternCounts.get(tpl).count++;
                        }
                    });
                });
                if (hasFb) fallbackCount++; else fullAuto++;
            });

            const topUnparsed = Array.from(patternCounts.entries())
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 25)
                .map(([tpl, info], i) => ({
                    排名: i + 1,
                    出現張數: info.count,
                    句型模板: tpl,
                    範例卡片: info.example
                }));

            const rate = totalWithEffect > 0 ? ((fullAuto / totalWithEffect) * 100).toFixed(1) : 0;
            console.log(`%c📊 【Regex 解析覆蓋率報告】(${seriesFilter || '全系列'})`, 'color:#00ffcc; font-size:15px; font-weight:bold;');
            console.log(`唯一基底效果卡數：${totalWithEffect} 張 | 🟢 100% 自動解析：${fullAuto} 張 (${rate}%) | 🟡 觸發半自動輔助：${fallbackCount} 張`);
            console.table(topUnparsed);
            window._lastTestReport = topUnparsed;
            return topUnparsed;
        }
        // ==================== v2.0 深度效果文解讀器 (Multi-Timing + Optional Cost + Sequential Clauses) ====================

        parseCardEffectTextToAbilities(effectText) {
            if (!effectText || effectText === '-') return [];
            const abilities = [];
            const lines = effectText.split('\n').map(l => l.trim()).filter(Boolean);

            lines.forEach(line => {
                // 跳過純突襲條件行與純登場狀態行
                if (line.startsWith('[レイド]') && line.includes('移動できる')) return;
                if (line.includes('このフィールドはアクティブで場に登場させる')) return;

                // 移除括號補充說明 (保留中括號內的括號如 [インパクト（1）])
                const cleanLine = line
                    .replace(/］（[^）]*）/g, '］')
                    .replace(/\]（[^）]*）/g, ']')
                    .replace(/(?<!\[[^\]]*)（[^）]*）/g, '')
                    .trim();

                // 若整行只有靜態關鍵字 (如 [ステップ] [インパクト（1）] [狙い撃ち]) 則跳過
                if (/^(\[[^\]]+\]\s*)+$/.test(cleanLine)) return;

                // 1. 提取多重觸發時機 (解決 [自分のターン中][登場時] 或 [登場時][アタック時] 漏觸發的問題！)
                const timings = [];
                if (cleanLine.includes('[登場時]')) timings.push('ON_PLAY');
                if (cleanLine.includes('[アタック時]')) timings.push('ON_ATTACK');
                if (cleanLine.includes('[ブロック時]')) timings.push('ON_BLOCK');
                if (cleanLine.includes('[退場時]')) timings.push('ON_RETIRE');
                if (cleanLine.includes('[起動メイン]')) timings.push('ACTIVATE_MAIN');
                if (timings.length === 0) timings.push('CONTINUOUS');

                // 2. 提取狀態限制條件
                const requireRaided = cleanLine.startsWith('[レイド]');
                const oncePerTurn = cleanLine.includes('[ターン1]');
                const duringMyTurnOnly = cleanLine.includes('[自分のターン中]');
                const duringOppTurnOnly = cleanLine.includes('[相手のターン中]');
                const requireFrontLine = cleanLine.includes('[フロントLにある場合]');
                const requireEnergyLine = cleanLine.includes('[エナジーLにある場合]');

                // 3. 提取啟動/發動標籤型代價 (如 [レストにする], [AP1], [手札を1枚場外に置く])
                const costs = [];
                if (cleanLine.includes('[レストにする]')) costs.push({ type: 'REST_SELF' });
                const apTagMatch = cleanLine.match(/\[AP(\d+)\]/);
                if (apTagMatch) costs.push({ type: 'PAY_AP', amount: parseInt(apTagMatch[1], 10) });
                const handCostTag = cleanLine.match(/\[手札を(\d+)枚場外に置く\]/);
                if (handCostTag) costs.push({ type: 'DISCARD_HAND', amount: parseInt(handCostTag[1], 10) });
                if (cleanLine.includes('[このキャラを退場させる]') || cleanLine.includes('[このカードを退場させる]')) {
                    costs.push({ type: 'RETIRE_SELF' });
                }

                abilities.push({
                    timings,
                    requireRaided,
                    oncePerTurn,
                    duringMyTurnOnly,
                    duringOppTurnOnly,
                    requireFrontLine,
                    requireEnergyLine,
                    costs,
                    rawText: line
                });
            });

            return abilities;
        }

        /**
         * 將單條效果文拆解為嚴格有序的執行步驟 (支援選發代價、牌頂操作、位置移動、特召登場等 18 種動作)
         */
/**
         * 依「。」切句，但忽略「」與『』內部的「。」（支援巢狀與多個引號）
         */
        splitSentencesOutsideQuotes(text) {
            const result = [];
            if (!text) return result;
            let current = '';
            let depth = 0;
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (ch === '「' || ch === '『') {
                    depth++;
                    current += ch;
                } else if (ch === '」' || ch === '』') {
                    depth = Math.max(0, depth - 1);
                    current += ch;
                } else if (ch === '。' && depth === 0) {
                    const trimmed = current.trim();
                    if (trimmed) result.push(trimmed);
                    current = '';
                } else {
                    current += ch;
                }
            }
            const tail = current.trim();
            if (tail) result.push(tail);
            return result;
        }

        /**
         * 將單條效果文拆解為嚴格有序的執行步驟 (支援選發代價、牌頂操作、位置移動、特召登場等 18 種動作)
         */
/**
         * 將單條效果文拆解為嚴格有序的執行步驟 (支援選發代價、牌頂操作、位置移動、特召登場等 18 種動作)
         */
/**
         * 將單條效果文拆解為嚴格有序的執行步驟 (支援選發代價、牌頂操作、位置移動、特召登場等 18 種動作)
         */
        extractTargetFilters(clause) {
            const filters = {
                filterNames: [],
                filterTraits: [],
                filterColor: null,
                minBp: null,
                requireState: null
            };
            if (!clause) return filters;

            // 指定卡名：〈...〉 或 カード名に「...」を含む
            for (const m of clause.matchAll(/〈([^〉]+)〉/g)) {
                if (m[1]) filters.filterNames.push(m[1].trim());
            }
            for (const m of clause.matchAll(/カード名に「([^」]+)」を含む/g)) {
                if (m[1]) filters.filterNames.push(m[1].trim());
            }

            // 指定特徵：［特徴：...］ 或 特徴に「...」を持つ
            for (const m of clause.matchAll(/［特徴：([^］]+)］/g)) {
                if (m[1]) filters.filterTraits.push(m[1].trim());
            }
            for (const m of clause.matchAll(/特徴に「([^」]+)」を持つ/g)) {
                if (m[1]) filters.filterTraits.push(m[1].trim());
            }

            // 指定顏色：赤の / 青の / 緑の / 黄の / 紫の
            const colM = clause.match(/([赤青緑黄紫])の/);
            if (colM && JP_COLOR_MAP[colM[1]]) {
                filters.filterColor = JP_COLOR_MAP[colM[1]];
            }

            // BP 下限：BP(\d+)以上
            const minBpM = clause.match(/BP(\d+)以上/);
            if (minBpM) filters.minBp = parseInt(minBpM[1], 10);

            // 狀態：アクティブの / レストの
            if (clause.includes('アクティブの')) filters.requireState = 'ACTIVE';
            else if (clause.includes('レストの')) filters.requireState = 'REST';

            return filters;
        }

        matchesTargetFilters(cardEl, filters) {
            if (!cardEl || !filters) return true;
            const d = this.getCardDef(cardEl);
            if (!d) return false;

            if (filters.filterNames && filters.filterNames.length > 0) {
                const cname = (d.name || '').replace(/\s+/g, '');
                const ok = filters.filterNames.some(n => {
                    const target = n.replace(/\s+/g, '');
                    return cname.includes(target) || (d.name || '').includes(n);
                });
                if (!ok) return false;
            }

            if (filters.filterTraits && filters.filterTraits.length > 0) {
                const traits = Array.isArray(d.traits) ? d.traits : [];
                const ok = filters.filterTraits.some(t => traits.some(ct => ct.includes(t)));
                if (!ok) return false;
            }

            if (filters.filterColor && d.color && d.color !== 'NONE' && d.color !== filters.filterColor) {
                return false;
            }

            if (filters.minBp !== null && filters.minBp !== undefined) {
                const bp = cardEl.parentElement && cardEl.parentElement.classList.contains('slot')
                    ? this.getEffectiveCardBp(cardEl)
                    : (d.bp || 0);
                if (bp < filters.minBp) return false;
            }

            if (filters.requireState === 'ACTIVE' && cardEl.classList.contains('rest')) return false;
            if (filters.requireState === 'REST' && !cardEl.classList.contains('rest')) return false;

            return true;
        }

        promptOrderCardsToDeck(cards, dest = 'BOTTOM', onDone = null) {
            const deckArea = document.getElementById('my-deck-area');
            const list = (cards || []).filter(Boolean);
            const placeOrdered = (ordered) => {
                if (dest === 'TOP') {
                    // ordered[0] 為最頂端 -> 最後 appendChild
                    [...ordered].reverse().forEach(c => {
                        deckArea.appendChild(c);
                        c.classList.add('is-flipped');
                        c.classList.remove('rest', 'in-life');
                        c.style.position = 'absolute';
                    });
                } else {
                    // ordered[0] 為最上面（較靠近牌組中央），最後一張為最底端 -> 先放 ordered[0] 再依序 insertBefore firstChild
                    ordered.forEach(c => {
                        deckArea.insertBefore(c, deckArea.firstChild);
                        c.classList.add('is-flipped');
                        c.classList.remove('rest', 'in-life');
                        c.style.position = 'absolute';
                    });
                }
                recalcStacking(deckArea);
                updateSlotCounts();
                broadcastMyState();
                if (onDone) onDone();
            };

            if (list.length <= 1) {
                placeOrdered(list);
                return;
            }

            const isTop = dest === 'TOP';
            this.promptModal({
                title: `選擇放回牌組【${isTop ? '頂端' : '底部'}】的順序 (${list.length} 張)`,
                desc: isTop
                    ? `請依序點選卡片決定順序（1 = 最頂端，${list.length} = 最下面）：`
                    : `請依序點選卡片決定順序（1 = 較上方，${list.length} = 最底端）：`,
                cards: list,
                selectCount: list.length,
                upTo: false,
                showOrderNumbers: true,
                onConfirm: (ordered) => placeOrdered(ordered)
            });
        }

        compileSequentialClauses(rawLine) {
            const actions = [];
            if (!rawLine || rawLine === '-') return actions;

            let cleanText = rawLine
                .replace(/］（[^）]*）/g, '］')
                .replace(/\]（[^）]*）/g, ']')
                .replace(/(?<!\[[^\]]*)（[^）]*）/g, '')
                .replace(/\[(登場時|アタック時|ブロック時|退場時|起動メイン|自分のターン中|相手のターン中|フロントLにある場合|エナジーLにある場合|レイド|レストにする|ターン1|このキャラを退場させる|このカードを退場させる|手札を\d+枚場外に置く|AP\d+)\]/g, '')
                .trim();

            if (!cleanText) return actions;

            // ==================== 跨句號複合套餐優先提取 ====================

            // 套餐 1：選發代價套餐（「～てもよい。そうした場合、...」）
            const optCostMatch = cleanText.match(/^((?:[^。]|「[^」]*」|『[^』]*』)+?てもよい)。そうした場合、([\s\S]+)$/);
            if (optCostMatch) {
                const costClause = optCostMatch[1].trim();
                const effectRemainder = optCostMatch[2].trim();
                let costObj = null;

                const discCost = costClause.match(/手札を(\d+)枚場外に置いてもよい/);
                const apCost = costClause.match(/APを(\d+)支払ってもよい/);
                const millCost = costClause.match(/山札の上から(\d+)枚(?:まで)?(?:を)?場外に置いてもよい/);
                const bounceSelfCost = costClause.includes('他のキャラを1枚手札に戻してもよい');

                if (discCost) costObj = { type: 'DISCARD_HAND', count: parseInt(discCost[1], 10), desc: `將 ${discCost[1]} 張手牌放置於場外` };
                else if (apCost) costObj = { type: 'PAY_AP', count: parseInt(apCost[1], 10), desc: `支付 ${apCost[1]} AP` };
                else if (millCost) costObj = { type: 'MILL_DECK', count: parseInt(millCost[1], 10), desc: `將牌組頂端 ${millCost[1]} 張放置於場外` };
                else if (bounceSelfCost) costObj = { type: 'BOUNCE_OTHER', count: 1, desc: `將場上 1 張其他角色退回手牌` };
                else costObj = { type: 'GENERIC_CONFIRM', desc: costClause };

                actions.push({
                    type: 'OPTIONAL_COST_BRANCH',
                    cost: costObj,
                    thenActions: this.compileSequentialClauses(effectRemainder)
                });
                return actions;
            }

            // 套餐 2 & 3 整合升級：全方位「牌頂檢視 / 公開 / 檢索 / 排序」跨句複合效果擷取（含動態張數「～分カードを見て」）
            const deckLookRegex = /(?:(自分の場に〈[^〉]+〉がある場合、|自分の場に(?:他の)?［特徴：[^］]+］(?:が\d+枚以上)?ある場合、))?(?:自分の)?山札の上から(?:『?(\d+)枚』?(?:を)?|[^。、]*?分(?:の)?カードを)(?:見る。|見て、|公開する。|公開し、?)([\s\S]*)/;
            const deckLookMatch = cleanText.match(deckLookRegex);
            if (deckLookMatch) {
                const preCondText = deckLookMatch[1] || '';
                const lookCount = deckLookMatch[2] ? parseInt(deckLookMatch[2], 10) : 4;
                const afterLook = deckLookMatch[3].trim();

                const preConditions = [];
                const charCondM = preCondText.match(/〈([^〉]+)〉/);
                if (charCondM) preConditions.push({ type: 'HAS_CHAR_ON_FIELD', name: charCondM[1] });
                const traitCondM = preCondText.match(/［特徴：([^］]+)］/);
                if (traitCondM) preConditions.push({ type: 'HAS_TRAIT_ON_FIELD', trait: traitCondM[1] });

                let consumedChars = 0;
                let deckAction = null;

                // 子型態 A：直接決定去向（上か下 / 上か場外 / 上かリムーブエリア / 望む順で山札の上 / 望む順で山札の下）
                const directChoiceM = afterLook.match(/^(?:(?:そのカード|公開したカード|それら)を)?(?:望む順で)?(?:自分の)?山札の(上か下|上か場外|上かリムーブエリア|上と下に望む枚数ずつ望む順|上|下)に置く。?/);
                // 子型態 B：先分流至牌頂，其餘送牌底或場外（その中から望む枚数/N枚まで山札の上に置き、残りを...下/場外に置く）
                const splitTopM = afterLook.match(/^(?:その中から|残りの)?(?:(望む枚数)|(\d+)枚(まで)?)を?(?:望む順で)?(?:自分の)?山札の上に置き、残りを(?:望む順で)?(?:自分の)?(?:山札の)?(下|場外|リムーブエリア)に置く。?/);
                // 子型態 C：從中挑選 N 張加入手牌或送場外，並處理「残りを...」（支援同句「に加え、残りを」與跨句「に加える。残りを」）
                const pickAndRemM = afterLook.match(/^([\s\S]*?(?:手札に加える|手札に加え|手札に加えてもよい|『手札に加える』|場外に置く|場外に置き|リムーブエリアに置く))(?:。|、)?\s*(?:(?:残りを|手札に加えない場合、そのカードを|手札に加えなかった場合、公開したカードを|そうしない場合、そのカードを)(?:望む順で)?(?:自分の)?(?:山札の)?(上か下|上か場外|上と下に望む枚数ずつ望む順|上|下|場外|リムーブエリア)に置く。?)?/);

                if (directChoiceM) {
                    consumedChars = directChoiceM[0].length;
                    const destRaw = directChoiceM[1];
                    if (destRaw === '上') {
                        deckAction = { type: 'LOOK_AND_ARRANGE_TOP', count: lookCount, keepUpTo: lookCount, remainderTo: 'TOP', conditions: preConditions };
                    } else if (destRaw === '下') {
                        deckAction = { type: 'LOOK_AND_ARRANGE_TOP', count: lookCount, keepUpTo: 0, remainderTo: 'BOTTOM', conditions: preConditions };
                    } else {
                        const remMap = {
                            '上か下': 'BOTTOM',
                            '上と下に望む枚数ずつ望む順': 'BOTTOM',
                            '上か場外': 'OUTSIDE',
                            '上かリムーブエリア': 'REMOVE'
                        };
                        deckAction = {
                            type: 'LOOK_AND_ARRANGE_TOP',
                            count: lookCount,
                            keepUpTo: lookCount,
                            remainderTo: remMap[destRaw] || 'BOTTOM',
                            conditions: preConditions
                        };
                    }
                } else if (splitTopM) {
                    consumedChars = splitTopM[0].length;
                    const isAnyCount = !!splitTopM[1];
                    const numCount = splitTopM[2] ? parseInt(splitTopM[2], 10) : lookCount;
                    const destMap = { '下': 'BOTTOM', '場外': 'OUTSIDE', 'リムーブエリア': 'REMOVE' };
                    deckAction = {
                        type: 'LOOK_AND_ARRANGE_TOP',
                        count: lookCount,
                        keepUpTo: isAnyCount ? lookCount : numCount,
                        upTo: isAnyCount ? true : !!splitTopM[3],
                        remainderTo: destMap[splitTopM[4]] || 'BOTTOM',
                        conditions: preConditions
                    };
                } else if (pickAndRemM) {
                    consumedChars = pickAndRemM[0].length;
                    const pickClause = pickAndRemM[1];
                    const remRaw = pickAndRemM[2] || '下';
                    const remMap = {
                        '下': 'BOTTOM',
                        '上': 'TOP',
                        '場外': 'OUTSIDE',
                        'リムーブエリア': 'REMOVE',
                        '上か下': 'TOP_OR_BOTTOM',
                        '上と下に望む枚数ずつ望む順': 'TOP_OR_BOTTOM',
                        '上か場外': 'OUTSIDE'
                    };
                    const isPickToOutside = pickClause.includes('場外に置') && !pickClause.includes('手札に加');
                    const countM = pickClause.match(/(\d+)枚(まで)?/);
                    const anyCount = pickClause.includes('望む枚数');
                    const pickCount = anyCount ? lookCount : (countM ? parseInt(countM[1], 10) : 1);
                    const isUpTo = anyCount || (countM ? !!countM[2] : true) || pickClause.includes('てもよい');

                    const traits = Array.from(pickClause.matchAll(/［特徴：([^］]+)］/g), m => m[1]);
                    const names = Array.from(pickClause.matchAll(/〈([^〉]+)〉/g), m => m[1]);

                    deckAction = {
                        type: 'LOOK_TOP_DECK',
                        count: lookCount,
                        pickAction: isPickToOutside ? 'OUTSIDE' : 'HAND',
                        pickUpTo: pickCount,
                        upTo: isUpTo,
                        filterTrait: traits[0] || null,
                        filterTraits: traits,
                        filterName: names[0] || null,
                        filterNames: names,
                        remainderTo: remMap[remRaw] || 'BOTTOM',
                        conditions: preConditions
                    };
                }

                if (deckAction) {
                    actions.push(deckAction);
                    const fullMatchedLen = deckLookMatch.index + (deckLookMatch[0].length - afterLook.length) + consumedChars;
                    cleanText = (cleanText.slice(0, deckLookMatch.index) + cleanText.slice(fullMatchedLen)).trim();
                }
            }

            // ==================== 逐句 (。) 與逐逗號 (、) 拆解 ====================

            const sentences = this.splitSentencesOutsideQuotes(cleanText);

            sentences.forEach(sentence => {
                const sentenceConditions = [];
                let body = sentence.replace(/^・\s*/, '').trim();

                // 提取句子開頭條件
                let condLoop = true;
                while (condLoop) {
                    condLoop = false;
                    if (body.startsWith('手札に加えた場合、') || body.startsWith('加えた場合、')) {
                        sentenceConditions.push({ type: 'IF_ADDED_TO_HAND' });
                        body = body.replace(/^(手札に)?加えた場合、/, '').trim();
                        condLoop = true;
                    }
                    const charCond = body.match(/^自分の場に〈([^〉]+)〉がある場合、/);
                    if (charCond) {
                        sentenceConditions.push({ type: 'HAS_CHAR_ON_FIELD', name: charCond[1] });
                        body = body.slice(charCond[0].length).trim();
                        condLoop = true;
                    }
                    const traitCond = body.match(/^自分の場に(?:他の)?［特徴：([^］]+)］(?:が\d+枚以上)?ある場合、/);
                    if (traitCond) {
                        sentenceConditions.push({ type: 'HAS_TRAIT_ON_FIELD', trait: traitCond[1] });
                        body = body.slice(traitCond[0].length).trim();
                        condLoop = true;
                    }
                    if (body.startsWith('このキャラがアクティブの場合、')) {
                        sentenceConditions.push({ type: 'SELF_IS_ACTIVE' });
                        body = body.slice('このキャラがアクティブの場合、'.length).trim();
                        condLoop = true;
                    }
                    if (body.startsWith('その後、')) {
                        body = body.slice('その後、'.length).trim();
                        condLoop = true;
                    }
                }

                if (body.startsWith('メインフェイズ終了時、このキャラを退場させる')) {
                    actions.push({ type: 'DELAYED_SELF_RETIRE', timing: 'END_OF_MAIN', conditions: sentenceConditions });
                    return;
                }
                if (body.startsWith('戻せない場合、このキャラを手札に戻す')) {
                    return;
                }
                // 已被前句 LOOK_TOP_DECK / LOOK_AND_ARRANGE_TOP 涵蓋的「残りを...に置く」收尾句，直接歸併不進 Fallback
                if (/^(?:残りを|手札に加えない場合、そのカードを|手札に加えなかった場合、公開したカードを|そうしない場合、そのカードを)(?:望む順で)?(?:自分の)?(?:山札の)?(?:上か下|上か場外|上と下に望む枚数ずつ望む順|上|下|場外|リムーブエリア)に置く$/.test(body)) {
                    return;
                }
                // 單獨的「自分の山札の上からN枚を見る/公開する」句（後接條件分歧時）
                const standaloneLookM = body.match(/^(?:自分の)?山札の上から『?(\d+)枚』?(?:を)?(?:見る|見て|公開する)/);
                if (standaloneLookM && !body.includes('手札に加') && !body.includes('場外に置')) {
                    const cnt = parseInt(standaloneLookM[1], 10);
                    const toOut = body.includes('上か場外');
                    actions.push({
                        type: 'LOOK_AND_ARRANGE_TOP',
                        count: cnt,
                        keepUpTo: cnt,
                        remainderTo: toOut ? 'OUTSIDE' : 'BOTTOM',
                        conditions: sentenceConditions
                    });
                    return;
                }

                const sentenceAllTraitMatch = body.match(/自分の場の［特徴：([^］]+)］全て/);
                const clauses = body.split('、').map(c => c.trim()).filter(Boolean);
                let hasTargetSelectionInSentence = false;
                let apTargetConfig = null;
                let parsedAnyClauseInSentence = false;

                clauses.forEach(clause => {
                    // 0. 牌頂檢視/檢索子句（處理「・自分の山札の上からN枚見て...」或「その中から...手札に加える」）
                    const subLookM = clause.match(/(?:自分の)?山札の上から『?(\d+)枚』?(?:を)?(?:見て|公開し)/);
                    if (subLookM) {
                        parsedAnyClauseInSentence = true;
                        const cnt = parseInt(subLookM[1], 10);
                        actions.push({
                            type: 'LOOK_TOP_DECK',
                            count: cnt,
                            pickAction: body.includes('場外に置') && !body.includes('手札に加') ? 'OUTSIDE' : 'HAND',
                            pickUpTo: 1,
                            upTo: true,
                            remainderTo: body.includes('山札の上') ? 'TOP' : (body.includes('場外') && !body.includes('手札') ? 'TOP' : 'BOTTOM'),
                            conditions: sentenceConditions
                        });
                        return;
                    }

                    // 1. 選擇目標（「～を選び」/「～を選ぶ」）
                    if (clause.includes('選び') || clause.includes('選ぶ')) {
                        parsedAnyClauseInSentence = true;
                        if (clause.includes('APカード')) {
                            const m = clause.match(/(\d+)枚(まで)?/);
                            apTargetConfig = { count: m ? parseInt(m[1], 10) : 1, upTo: clause.includes('まで') };
                        } else {
                            const isOpp = clause.includes('相手');
                            const isFrontOnly = clause.includes('フロントL');
                            const isEnergyOnly = clause.includes('エナジーL');
                            const bpLimit = clause.match(/BP(\d+)以下/);
                            const enLimit = clause.match(/必要エナジーが?(\d+)以下/);
                            const countM = clause.match(/(\d+)枚(まで)?/);
                            const excludeSelf = clause.includes('他のキャラ');
                            const extraFilters = this.extractTargetFilters(clause);
                            actions.push({
                                type: 'SELECT_TARGET',
                                owner: isOpp ? 'OPP' : 'MY',
                                zone: isFrontOnly ? 'FRONT_LINE' : (isEnergyOnly ? 'ENERGY_LINE' : 'FIELD'),
                                maxBp: bpLimit ? parseInt(bpLimit[1], 10) : null,
                                maxEnergy: enLimit ? parseInt(enLimit[1], 10) : null,
                                excludeSelf: excludeSelf,
                                ...extraFilters,
                                count: countM ? parseInt(countM[1], 10) : 1,
                                upTo: clause.includes('まで'),
                                conditions: sentenceConditions
                            });
                            hasTargetSelectionInSentence = true;
                        }
                        return;
                    }

                    // 2. 抽牌（「カードをX枚引き」/「カードをX枚引く」/「X枚まで引く」）
                    const drawM = clause.match(/カードを『?(\d+)枚』?(?:まで)?引[きく]/);
                    if (drawM) {
                        parsedAnyClauseInSentence = true;
                        actions.push({ type: 'DRAW', amount: parseInt(drawM[1], 10), conditions: sentenceConditions });
                        return;
                    }

                    // 3. 盲堆墓（「自分の山札の上からX枚(まで)を場外に置く」）
                    const millM = clause.match(/自分の山札の上から(\d+)枚(?:まで)?を?(?:自分の)?場外に置[きく]/);
                    if (millM) {
                        parsedAnyClauseInSentence = true;
                        actions.push({ type: 'MILL_DECK', count: parseInt(millM[1], 10), conditions: sentenceConditions });
                        return;
                    }

                    // 4. 捨棄手牌（「自分の手札をX枚場外に置く」）
                    const discM = clause.match(/自分の手札を『?(\d+)枚』?(?:まで)?場外に置[きく]/);
                    if (discM) {
                        parsedAnyClauseInSentence = true;
                        actions.push({ type: 'DISCARD_HAND', count: parseInt(discM[1], 10), conditions: sentenceConditions });
                        return;
                    }

                    // 5. 從手牌或場外特召角色登場（「自分の手札/場外から...キャラカードを1枚まで自分の場に...登場させる」）
                    if (clause.includes('登場させる') || clause.includes('レイドさせる')) {
                        parsedAnyClauseInSentence = true;
                        const fromOutside = clause.includes('場外から');
                        const maxEn = clause.match(/必要エナジーが?(\d+)以下/);
                        const enterRest = clause.includes('レストで');
                        const extraFilters = this.extractTargetFilters(clause);
                        actions.push({
                            type: 'SPECIAL_SUMMON',
                            from: fromOutside ? 'OUTSIDE' : 'HAND',
                            maxEnergy: maxEn ? parseInt(maxEn[1], 10) : null,
                            enterRest: enterRest,
                            ...extraFilters,
                            conditions: sentenceConditions
                        });
                        return;
                    }

                    // 6. 轉為活動
                    if (clause.includes('アクティブにし') || clause.includes('アクティブにする')) {
                        parsedAnyClauseInSentence = true;
                        if (apTargetConfig) {
                            actions.push({
                                type: 'ACTIVATE_AP',
                                count: apTargetConfig.count,
                                upTo: apTargetConfig.upTo,
                                conditions: sentenceConditions
                            });
                            apTargetConfig = null;
                        } else {
                            actions.push({
                                type: 'SET_ACTIVE',
                                target: hasTargetSelectionInSentence ? 'SELECTED' : 'SELF',
                                conditions: sentenceConditions
                            });
                        }
                        return;
                    }

                    // 7. 轉為休息
                    if (clause.includes('レストにし') || clause.includes('レストにする')) {
                        parsedAnyClauseInSentence = true;
                        actions.push({
                            type: 'SET_REST',
                            target: hasTargetSelectionInSentence ? 'SELECTED' : 'SELF',
                            conditions: sentenceConditions
                        });
                        return;
                    }

                    // 8. 冰凍鎖定（「次の1回アクティブにならない」/「次のスタートフェイズにアクティブにならない」）
                    if (clause.includes('アクティブにならない')) {
                        parsedAnyClauseInSentence = true;
                        actions.push({
                            type: 'FREEZE_TARGET',
                            target: hasTargetSelectionInSentence ? 'SELECTED' : 'SELF',
                            conditions: sentenceConditions
                        });
                        return;
                    }

                    // 9. 移動線位（「フロントLに移動」/「エナジーLに移動」/「別のラインに移動」）
                    if (clause.includes('フロントLに移動') || clause.includes('エナジーLに移動') || clause.includes('別のラインに移動')) {
                        parsedAnyClauseInSentence = true;
                        const toFront = clause.includes('フロントL');
                        actions.push({
                            type: 'MOVE_LINE',
                            toZone: toFront ? 'FRONT_LINE' : 'ENERGY_LINE',
                            target: hasTargetSelectionInSentence ? 'SELECTED' : 'SELF',
                            conditions: sentenceConditions
                        });
                        return;
                    }

                    // 10. 退場（「退場させる」）
                    if (clause.includes('退場させる')) {
                        parsedAnyClauseInSentence = true;
                        actions.push({
                            type: 'RETIRE_TARGET',
                            target: hasTargetSelectionInSentence ? 'SELECTED' : 'OPP_FRONT_SELECT',
                            conditions: sentenceConditions
                        });
                        return;
                    }

                    // 11. BP 增減（「BP+2000」「BP-3000」）
                    const bpM = clause.match(/BP([+-]\d+)/);
                    if (bpM) {
                        parsedAnyClauseInSentence = true;
                        const amount = parseInt(bpM[1], 10);
                        actions.push({
                            type: 'MODIFY_BP',
                            amount: amount,
                            target: sentenceAllTraitMatch ? 'ALL_MY_TRAIT' : (hasTargetSelectionInSentence ? 'SELECTED' : 'SELF'),
                            filterTrait: sentenceAllTraitMatch ? sentenceAllTraitMatch[1] : null,
                            conditions: sentenceConditions
                        });
                        return;
                    }

                    // 12. 賦予關鍵字
                    const kwMap = [
                        { tag: '[インパクト（1）]', alt: '[インパクト(1)]', kw: 'IMPACT', val: 1 },
                        { tag: '[インパクト（+1）]', alt: '[インパクト(+1)]', kw: 'IMPACT_PLUS', val: 1 },
                        { tag: '[ダメージ（2）]', alt: '[ダメージ(2)]', kw: 'DAMAGE', val: 2 },
                        { tag: '[ダメージ（+1）]', alt: '[ダメージ(+1)]', kw: 'DAMAGE_PLUS', val: 1 },
                        { tag: '[狙い撃ち]', alt: '[狙い撃ち]', kw: 'SNIPE', val: 1 },
                        { tag: '[ステップ]', alt: '[ステップ]', kw: 'STEP', val: 1 },
                        { tag: '[2回アタック]', alt: '[2回アタック]', kw: 'DOUBLE_ATTACK', val: 1 },
                        { tag: '[2回ブロック]', alt: '[2回ブロック]', kw: 'DOUBLE_BLOCK', val: 1 }
                    ];
                    for (const item of kwMap) {
                        if (clause.includes(item.tag) || clause.includes(item.alt)) {
                            parsedAnyClauseInSentence = true;
                            actions.push({
                                type: 'GRANT_KEYWORD',
                                keyword: item.kw,
                                value: item.val,
                                target: (hasTargetSelectionInSentence || body.includes('さらに')) ? 'SELECTED' : 'SELF',
                                conditions: sentenceConditions
                            });
                        }
                    }

                    const unblockM = clause.match(/BP(\d+)以下のキャラにブロックされない/);
                    if (unblockM) {
                        parsedAnyClauseInSentence = true;
                        actions.push({
                            type: 'GRANT_UNBLOCKABLE_BY_LOW_BP',
                            maxBp: parseInt(unblockM[1], 10),
                            target: hasTargetSelectionInSentence ? 'SELECTED' : 'SELF',
                            conditions: sentenceConditions
                        });
                        return;
                    }

                    // 13. 產生能源加成
                    const enBoostM = clause.match(/発生エナジー\+\[([赤青緑黄紫]+)\]/);
                    if (enBoostM) {
                        parsedAnyClauseInSentence = true;
                        const cStr = enBoostM[1];
                        actions.push({
                            type: 'BOOST_GENERATED_ENERGY',
                            color: JP_COLOR_MAP[cStr[0]] || 'NONE',
                            count: cStr.length,
                            duration: sentence.includes('このターン中') ? 'TURN' : 'CONTINUOUS',
                            conditions: sentenceConditions
                        });
                        if (clause.includes('メインフェイズ終了時、このキャラを退場させる') || clause.includes('メインフェイズ終了時、このフィールドを退場させる')) {
                            actions.push({ type: 'DELAYED_SELF_RETIRE', timing: 'END_OF_MAIN', conditions: sentenceConditions });
                        }
                        return;
                    }

                    // 14. 場外回收手牌
                    if (clause.includes('自分の場外から') && clause.includes('手札に加える')) {
                        parsedAnyClauseInSentence = true;
                        const cm = clause.match(/(\d+)枚(まで)?手札に加える/);
                        const extraFilters = this.extractTargetFilters(clause);
                        actions.push({
                            type: 'RECOVER_FROM_OUTSIDE',
                            count: cm ? parseInt(cm[1], 10) : 1,
                            upTo: cm ? !!cm[2] : true,
                            ...extraFilters,
                            conditions: sentenceConditions
                        });
                        return;
                    }

                    // 15. 彈回手牌 / 送回牌底 / 送移除區
                    if (clause.includes('手札に戻す')) {
                        parsedAnyClauseInSentence = true;
                        const reqEnM = clause.match(/必要エナジーが?(\d+)以下/);
                        actions.push({
                            type: 'BOUNCE_TO_HAND',
                            target: hasTargetSelectionInSentence ? 'SELECTED' : (clause.includes('相手') ? 'OPP_FRONT' : 'MY_OTHER'),
                            maxRequiredEnergy: reqEnM ? parseInt(reqEnM[1], 10) : null,
                            selfFallback: cleanText.includes('戻せない場合、このキャラを手札に戻す'),
                            conditions: sentenceConditions
                        });
                        return;
                    }
                    if (clause.includes('山札の下に置く') && hasTargetSelectionInSentence) {
                        parsedAnyClauseInSentence = true;
                        actions.push({ type: 'SEND_TARGET_TO_BOTTOM', conditions: sentenceConditions });
                        return;
                    }
                    if (clause.includes('リムーブエリアに置く') && hasTargetSelectionInSentence) {
                        parsedAnyClauseInSentence = true;
                        actions.push({ type: 'SEND_TARGET_TO_REMOVE', conditions: sentenceConditions });
                        return;
                    }
                });

                // 🌟 萬用保底：若該句為特殊專屬效果（未匹配上述 18 種通用句型），自動推入 INTERACTIVE_FALLBACK，絕不讓卡片無反應！
                if (!parsedAnyClauseInSentence && body.length > 2) {
                    actions.push({
                        type: 'INTERACTIVE_FALLBACK',
                        rawSentence: sentence,
                        conditions: sentenceConditions
                    });
                }
            });

            return actions;
        }

        // ==================== 零重疊內嵌式 UI ====================

injectEngineUI() {
            // 自動攔截 showSysMsg 與 sendSystemChat，保存最近 20 行系統訊息
            if (!window._uaLogHooked) {
                window._uaLogHooked = true;
                if (typeof window.showSysMsg === 'function') {
                    const origShowSys = window.showSysMsg;
                    window.showSysMsg = (msg) => {
                        this.recordLog(`SYS: ${msg}`);
                        return origShowSys(msg);
                    };
                }
                if (typeof window.sendSystemChat === 'function') {
                    const origSendChat = window.sendSystemChat;
                    window.sendSystemChat = (msg) => {
                        this.recordLog(`CHAT: ${msg}`);
                        return origSendChat(msg);
                    };
                }
            }

            const modeSelect = document.getElementById('game-mode-selector');
            if (modeSelect) {
                modeSelect.style.display = 'inline-block';
                modeSelect.value = 'auto';
                this.enabled = true;
                modeSelect.addEventListener('change', (e) => {
                    this.enabled = (e.target.value === 'auto');
                    showSysMsg(this.enabled ? '⚡ 已切換為【全自動規則引擎模式】' : '🛠️ 已切換為【沙盒手動模式】');
                    this.updateEnergyHUD();
                });
            }

            const oldHud = document.getElementById('ua-engine-hud');
            if (oldHud) oldHud.remove();

            const sidebar = document.querySelector('.hud-sidebar');
            if (sidebar && !document.getElementById('eng-sidebar-panel')) {
                sidebar.style.gap = '8px';
                sidebar.style.padding = '10px';
                sidebar.style.width = '140px';
                sidebar.querySelectorAll('.phase-step').forEach(p => {
                    p.style.padding = '6px';
                    p.style.fontSize = '13px';
                });

                const engPanel = document.createElement('div');
                engPanel.id = 'eng-sidebar-panel';
                engPanel.style.cssText = `
                    display: flex; flex-direction: column; gap: 6px;
                    background: rgba(0, 255, 204, 0.08); border: 1px solid rgba(0, 255, 204, 0.4);
                    border-radius: 8px; padding: 8px; text-align: center;
                `;
                engPanel.innerHTML = `
                    <div id="eng-turn-badge" style="background:#313456; color:#00ffcc; padding:3px 6px; border-radius:4px; font-size:12px; font-weight:bold;">⚡ 自由/未定先攻</div>
                    <button id="btn-claim-first" class="ctrl-btn" style="background:#8d7cc4; padding:6px 4px; font-size:12px; width:100%;">🎲 設我方先攻</button>
                    <button id="btn-extra-draw" class="ctrl-btn" style="background:#4f9678; padding:6px 4px; font-size:12px; width:100%; display:none;">💎 額外抽卡(1AP)</button>
                `;
                sidebar.insertBefore(engPanel, sidebar.firstChild);

                document.getElementById('btn-claim-first').onclick = () => this.startMatchAsFirstPlayer();
                document.getElementById('btn-extra-draw').onclick = () => this.executeExtraDraw();
            }

            const myEnergyRow = document.getElementById('my-energy-line');
            if (myEnergyRow && myEnergyRow.previousElementSibling && !document.getElementById('eng-inline-energy')) {
                const labelEl = myEnergyRow.previousElementSibling;
                labelEl.style.pointerEvents = 'auto';
                labelEl.innerHTML = `ENERGY LINE <span id="eng-inline-energy" style="margin-left:8px; color:#00ffcc;"></span>`;
            }

            const myApRow = document.getElementById('my-ap-area');
            if (myApRow && myApRow.previousElementSibling && !document.getElementById('eng-inline-ap')) {
                const labelEl = myApRow.previousElementSibling;
                labelEl.style.pointerEvents = 'auto';
                labelEl.innerHTML = `ACTION POINT <span id="eng-inline-ap" style="margin-left:8px; color:#f1c40f;"></span>`;
            }

            if (!document.getElementById('ua-public-info-hud')) {
                const infoHud = document.createElement('div');
                infoHud.id = 'ua-public-info-hud';
                infoHud.style.cssText = `
                    position: absolute; top: 435px; right: 20px; z-index: 10008;
                    background: rgba(15, 18, 32, 0.86); border: 1px solid rgba(108, 147, 199, 0.55);
                    border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #eee;
                    backdrop-filter: blur(4px); box-shadow: 0 6px 20px rgba(0,0,0,0.7);
                    pointer-events: auto; width: 140px; box-sizing: border-box; line-height: 1.45;
                `;
                infoHud.innerHTML = `<div style="color:#b39ddb; font-weight:bold; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:3px; margin-bottom:4px; text-align:center;">公開資訊</div><div id="ua-pub-info-body">載入中...</div>`;
                const vp = document.getElementById('board-viewport');
                if (vp) vp.appendChild(infoHud);
            }

            if (!document.getElementById('ua-prompt-modal')) {
                const modal = document.createElement('div');
                modal.id = 'ua-prompt-modal';
                modal.style.cssText = `
                    display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: rgba(15, 18, 32, 0.97); border: 3px solid #00ffcc; border-radius: 14px;
                    padding: 22px 28px; z-index: 100600; min-width: 380px; max-width: 750px;
                    text-align: center; box-shadow: 0 0 50px rgba(0, 255, 204, 0.4); color: white;
                `;
                modal.innerHTML = `
                    <h3 id="ua-prompt-title" style="margin:0 0 10px 0; color:#00ffcc; font-size:20px;">系統詢問</h3>
                    <div id="ua-prompt-desc" style="font-size:15px; color:#ddd; margin-bottom:18px; line-height:1.5; white-space:pre-wrap;"></div>
                    <div id="ua-prompt-cards" style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center; max-height:320px; overflow-y:auto; margin-bottom:18px;"></div>
                    <div id="ua-prompt-actions" style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;"></div>
                `;
                document.getElementById('app-canvas').appendChild(modal);
            }
        }

        // ==================== 能源與 AP 計算 ====================

        calculateMyEnergy() {
            const totals = { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0, PURPLE: 0, ALL: 0 };
            const slots = document.querySelectorAll('#my-energy-line .slot');
            const domColor = this.detectMyDeckDominantColor();

            slots.forEach(slot => {
                slot.querySelectorAll('.eng-slot-en-badge').forEach(b => b.remove());

                const cards = slot.querySelectorAll('.card');
                if (cards.length === 0) return;
                const topCard = cards[cards.length - 1];
                const def = this.getCardDef(topCard);
                const rt = this.getRuntime(topCard);
                const isActive = !topCard.classList.contains('rest');

                let col = (def?.generatedEnergy?.color && def.generatedEnergy.color !== 'NONE')
                    ? def.generatedEnergy.color
                    : (def?.color && def.color !== 'NONE' ? def.color : domColor);

                // 新版 cards.js 基礎產生能源解碼（支援 0 / 1 / 2 / 3 球）：
                // 若為 2 且效果文含自身「発生エナジー+」則還原為基礎 1 球＋動態條件加成；3 球直接保留為 3
                const effText = (def?.effectText && def.effectText !== '-') ? def.effectText : '';
                const hasSelfGenBoostText = /発生エナジー\+\[([赤青緑黄紫]+)\]/.test(effText) && !effText.includes('を与える');
                let rawBase = (def?.generatedEnergy?.count !== undefined && def?.generatedEnergy?.count !== null) ? def.generatedEnergy.count : 1;
                let baseCnt;
                if (rawBase >= 3) baseCnt = 3;
                else if (rawBase === 2) baseCnt = hasSelfGenBoostText ? 1 : 2;
                else baseCnt = Math.max(0, rawBase);

                let cnt;
                if (rt && rt.manualEnergyCount !== null) {
                    cnt = rt.manualEnergyCount;
                } else {
                    cnt = baseCnt + this.computeContinuousGeneratedEnergyBonus(topCard, def, slot, isActive);
                }

                if (rt && rt.tempEnergyBoost.length > 0) {
                    rt.tempEnergyBoost.forEach(b => { cnt += b.count; });
                }

                totals[col] = (totals[col] || 0) + cnt;
                totals.ALL += cnt;

                if (this.enabled) {
                    const badge = document.createElement('div');
                    badge.className = 'eng-slot-en-badge';
                    badge.title = '點擊可循環切換此卡產生 1 / 2 / 3 顆能源';
                    badge.innerText = `${COLOR_NAMES[col]}×${cnt}`;
                    badge.style.cssText = `
                        position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%);
                        background: #14162a; color: ${COLOR_HEX[col]}; border: 2px solid ${COLOR_HEX[col]};
                        border-radius: 10px; padding: 1px 8px; font-size: 12px; font-weight: 900;
                        z-index: 1100; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.9);
                        white-space: nowrap; pointer-events: auto;
                    `;
                    badge.onclick = (e) => {
                        e.stopPropagation();
                        rt.manualEnergyCount = (cnt >= 3) ? 1 : (cnt + 1);
                        showSysMsg(`已將【${def?.name || '此卡'}】的產生能源切換為 ${rt.manualEnergyCount} 顆！`);
                        this.updateEnergyHUD();
                    };
                    slot.appendChild(badge);
                }
            });

            return totals;
        }


        computeContinuousGeneratedEnergyBonus(cardEl, def, slot, isActive) {
            const eff = (def?.effectText && def.effectText !== '-') ? def.effectText : '';
            if (!eff || !eff.includes('発生エナジー+')) return 0;

            let bonus = 0;
            const lines = eff.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (!line.includes('発生エナジー+')) continue;
                // 起動メイン／登場時／アタック時／ブロック時／退場時 為觸發或啟動型，交由 tempEnergyBoost 處理，不常駐加總
                if (/\[(起動メイン|登場時|アタック時|ブロック時|退場時)\]/.test(line)) continue;
                if (line.includes('を与える') || line.includes('このターン中') || line.includes('次の自分のターン開始時まで')) continue;

                const boostMatch = line.match(/発生エナジー\+\[([赤青緑黄紫]+)\]/);
                if (!boostMatch) continue;
                const val = boostMatch[1].length;

                // 1. 此角色為活動狀態
                if (line.includes('このキャラがアクティブの場合')) {
                    if (isActive) bonus += val;
                    continue;
                }
                // 2. 我方前線有〈指定卡名〉
                const flNameM = line.match(/自分のフロントLに〈([^〉]+)〉がある場合/);
                if (flNameM) {
                    const target = flNameM[1].replace(/\s+/g, '');
                    const hasFl = this.getSlotTopCards('#my-front-line .slot').some(c => (this.getCardDef(c)?.name || '').replace(/\s+/g, '').includes(target));
                    if (hasFl) bonus += val;
                    continue;
                }
                // 3. 我方場上有〈指定卡名〉
                const fieldNameM = line.match(/自分の場に〈([^〉]+)〉がある場合/);
                if (fieldNameM) {
                    if (this.hasCharacterOnMyField(fieldNameM[1])) bonus += val;
                    continue;
                }
                // 4. 我方場上（其他）［特徴：X］有 N 張以上
                const traitCntM = line.match(/自分の場に(他の)?［特徴：([^］]+)］が(\d+)枚以上ある場合/);
                if (traitCntM) {
                    const exclSelf = !!traitCntM[1];
                    const trait = traitCntM[2];
                    const need = parseInt(traitCntM[3], 10) || 1;
                    const cnt = this.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                        if (exclSelf && c === cardEl) return false;
                        const d = this.getCardDef(c);
                        return d && Array.isArray(d.traits) && d.traits.some(t => t.includes(trait));
                    }).length;
                    if (cnt >= need) bonus += val;
                    continue;
                }
                // 5. 此卡下方有裏側卡片（每 1 張 或 存在時）
                if (line.includes('下に裏向きのカード')) {
                    const allInSlot = slot ? Array.from(slot.querySelectorAll('.card')) : [];
                    const faceDownUnder = allInSlot.filter(c => c !== cardEl && c.classList.contains('is-flipped')).length;
                    if (line.includes('1枚につき')) bonus += faceDownUnder * val;
                    else if (faceDownUnder > 0) bonus += val;
                    continue;
                }
                // 6. 純常駐（例如突襲後常駐 発生エナジー+[緑]）
                if (/^(?:\[レイド\])?この(?:キャラ|カード|フィールド)の発生エナジー\+\[/.test(line)) {
                    const rt = this.getRuntime(cardEl);
                    if (!line.startsWith('[レイド]') || (rt && rt.isRaided)) {
                        bonus += val;
                    }
                }
            }
            return bonus;
        }

        computeAutoEnergyDiscount(cardDef) {
            const eff = (cardDef?.effectText && cardDef.effectText !== '-') ? cardDef.effectText : '';
            if (!eff || !eff.includes('必要エナジーを')) return 0;

            let totalDiscount = 0;
            const lines = eff.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (!line.includes('手札にあるこのカードの必要エナジーを') || !line.includes('減らす')) continue;
                const valM = line.match(/必要エナジーを\[[^\]]*?(\d+)\]減らす/);
                if (!valM) continue;
                const val = parseInt(valM[1], 10) || 0;
                if (val <= 0) continue;

                // 1. 自己場上沒有任何卡片（66 張卡）
                if (line.includes('自分の場にカードが1枚もない場合') || line.includes('自分の場にカードがない場合')) {
                    if (this.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0) {
                        totalDiscount += val;
                    }
                    continue;
                }
                // 2. 對手場上有指定顏色卡片（101 張卡）
                const oppColM = line.match(/相手の場に([赤青緑黄紫])(?:か([赤青緑黄紫]))?のカードがある場合/);
                if (oppColM) {
                    const wantCols = [JP_COLOR_MAP[oppColM[1]], oppColM[2] ? JP_COLOR_MAP[oppColM[2]] : null].filter(Boolean);
                    const hasOppCol = this.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => {
                        if (c.classList.contains('is-flipped')) return false;
                        const d = this.getCardDef(c);
                        return d && wantCols.includes(d.color);
                    });
                    if (hasOppCol) totalDiscount += val;
                    continue;
                }
                // 3. 自己場上沒有場域卡
                if (line.includes('自分の場にフィールドがない場合')) {
                    const hasField = this.getSlotTopCards('#my-energy-line .slot').some(c => this.getCardDef(c)?.type === 'FIELD');
                    if (!hasField) totalDiscount += val;
                    continue;
                }
                // 4. 自己場上有〈指定卡名〉
                const myNameM = line.match(/自分の場に〈([^〉]+)〉がある場合/);
                if (myNameM) {
                    if (this.hasCharacterOnMyField(myNameM[1])) totalDiscount += val;
                    continue;
                }
                // 5. 自己場上有［特徴：X］
                const myTraitM = line.match(/自分の場に［特徴：([^］]+)］がある場合/);
                if (myTraitM) {
                    if (this.hasTraitOnMyField(myTraitM[1])) totalDiscount += val;
                    continue;
                }
                // 6. 自己場外有〈指定卡名〉
                const outNameM = line.match(/自分の場外に〈([^〉]+)〉がある場合/);
                if (outNameM) {
                    const target = outNameM[1].replace(/\s+/g, '');
                    const hasOut = Array.from(document.querySelectorAll('#my-outside-area .card')).some(c => (this.getCardDef(c)?.name || '').replace(/\s+/g, '').includes(target));
                    if (hasOut) totalDiscount += val;
                    continue;
                }
                // 7. 場外每 N 張減 X
                const outPerM = line.match(/自分の場外にあるカード(\d+)枚につき/);
                if (outPerM) {
                    const per = parseInt(outPerM[1], 10) || 1;
                    const outCnt = document.querySelectorAll('#my-outside-area .card').length;
                    totalDiscount += Math.floor(outCnt / per) * val;
                    continue;
                }
                // 8. 雙方生命合計 <= N
                const lifeSumM = line.match(/自分と相手のライフの合計が(\d+)以下の場合/);
                if (lifeSumM) {
                    const lim = parseInt(lifeSumM[1], 10) || 0;
                    const myL = document.querySelectorAll('#my-life-area .card').length;
                    const oppL = document.querySelectorAll('#opp-life-area .card').length;
                    if (myL + oppL <= lim) totalDiscount += val;
                    continue;
                }
                // 9. 無條件手牌減費
                if (/^手札にあるこのカードの必要エナジーを/.test(line)) {
                    totalDiscount += val;
                }
            }
            return totalDiscount;
        }

        getActiveApCards() {
            const apCards = [];
            document.querySelectorAll('#my-ap-area .slot .card').forEach(c => {
                if (!c.classList.contains('is-flipped') && !c.classList.contains('rest')) apCards.push(c);
            });
            return apCards;
        }

        getTotalUnlockedApCards() {
            const unlocked = [];
            document.querySelectorAll('#my-ap-area .slot .card').forEach(c => {
                if (!c.classList.contains('is-flipped')) unlocked.push(c);
            });
            return unlocked;
        }

        payAp(amount) {
            const activeAps = this.getActiveApCards();
            if (activeAps.length < amount) return false;
            for (let i = 0; i < amount; i++) activeAps[i].classList.add('rest');
            this.updateEnergyHUD();
            broadcastMyState();
            return true;
        }

        activateMyApCards(maxCount) {
            const restedAps = [];
            document.querySelectorAll('#my-ap-area .slot .card').forEach(c => {
                if (!c.classList.contains('is-flipped') && c.classList.contains('rest')) restedAps.push(c);
            });
            let activated = 0;
            for (let i = 0; i < Math.min(maxCount, restedAps.length); i++) {
                restedAps[i].classList.remove('rest');
                activated++;
            }
            if (activated > 0) {
                showSysMsg(`效果發動：已將 ${activated} 張 AP 卡轉為活動狀態！`);
                this.updateEnergyHUD();
                broadcastMyState();
            }
        }

        updateEnergyHUD() {
            const panel = document.getElementById('eng-sidebar-panel');
            const inlineEn = document.getElementById('eng-inline-energy');
            const inlineAp = document.getElementById('eng-inline-ap');

            if (panel) panel.style.display = this.enabled ? 'flex' : 'none';
            if (!this.enabled) {
                if (inlineEn) inlineEn.innerHTML = '';
                if (inlineAp) inlineAp.innerHTML = '';
                document.querySelectorAll('.eng-card-btn, .eng-slot-en-badge').forEach(b => b.remove());
                return;
            }

            const en = this.calculateMyEnergy();
            const enParts = [];
            ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE'].forEach(c => {
                if (en[c] > 0) enParts.push(`${COLOR_NAMES[c]}×${en[c]}`);
            });
            if (inlineEn) {
                inlineEn.innerHTML = enParts.length > 0 ? `[產生能源: ${enParts.join(' ')}]` : '[產生能源: 0]';
            }

            const activeAp = this.getActiveApCards().length;
            const maxAp = this.getTotalUnlockedApCards().length;
            if (inlineAp) {
                inlineAp.innerHTML = `[可用 AP: ${activeAp} / ${maxAp}]`;
            }

            const badge = document.getElementById('eng-turn-badge');
            if (badge) {
                if (this.isFirstPlayer === null) {
                    badge.innerText = '⚡ 自由/未定先攻';
                    badge.style.background = '#313456';
                    badge.style.color = '#00ffcc';
                } else {
                    badge.innerText = `${this.isFirstPlayer ? '先攻' : '後攻'} T${this.turnNumber} (${this.isMyTurn ? '我方' : '對手'})`;
                    badge.style.background = this.isMyTurn ? '#2ecc71' : '#c1596f';
                    badge.style.color = this.isMyTurn ? '#000' : '#fff';
                }
            }

            const extraDrawBtn = document.getElementById('btn-extra-draw');
            if (extraDrawBtn) {
                extraDrawBtn.style.display = (this.isMyTurn && this.currentPhase === '起始' && !this.usedExtraDraw && activeAp >= 1) ? 'block' : 'none';
            }

            this.renderFieldActionOverlayButtons();
            this.updatePublicInfoHUD();
        }

        updatePublicInfoHUD() {
            const body = document.getElementById('ua-pub-info-body');
            if (!body) return;

            const countSide = (prefix) => {
                const handCnt = document.querySelectorAll(`#${prefix}-hand-area .card`).length;
                const deckCnt = document.querySelectorAll(`#${prefix}-deck-area .card`).length;
                const outCnt = document.querySelectorAll(`#${prefix}-outside-area .card`).length;

                let seenFinal = 0, seenSpecial = 0, seenColor = 0;
                const publicZones = [
                    `#${prefix}-outside-area .card`,
                    `#${prefix}-remove-area .card`,
                    `#${prefix}-public-area .card`,
                    `#${prefix}-front-line .card`,
                    `#${prefix}-energy-line .card`
                ].join(', ');

                document.querySelectorAll(publicZones).forEach(c => {
                    if (c.classList.contains('is-flipped')) return;
                    const d = this.getCardDef(c);
                    if (!d) return;
                    const tType = d.compiledRules?.trigger?.type || '';
                    const tTxt = d.triggerText || '';
                    if (tType === 'FINAL' || tTxt.includes('[ファイナル]')) seenFinal++;
                    else if (tType === 'SPECIAL' || tTxt.includes('[スペシャル]')) seenSpecial++;
                    else if (tType === 'COLOR' || tTxt.includes('[カラー]')) seenColor++;
                });

                return {
                    handCnt, deckCnt, outCnt,
                    remFinal: Math.max(0, 4 - seenFinal),
                    remSpecial: Math.max(0, 4 - seenSpecial),
                    remColor: Math.max(0, 4 - seenColor)
                };
            };

            const opp = countSide('opp');
            const my = countSide('my');
            body.innerHTML = `
                <div style="margin-bottom:6px; padding-bottom:5px; border-bottom:1px dashed rgba(255,255,255,0.15);">
                    <div style="color:#ff8a80; font-weight:bold;">對手</div>
                    <div style="font-size:11px; color:#ddd;">手牌 ${opp.handCnt} / 牌組 ${opp.deckCnt} / 場外 ${opp.outCnt}</div>
                    <div style="font-size:11px; color:#ddd;">F:<b style="color:#f1c40f;">${opp.remFinal}</b> S:<b style="color:#ff7675;">${opp.remSpecial}</b> C:<b style="color:#74b9ff;">${opp.remColor}</b></div>
                </div>
                <div>
                    <div style="color:#6fb897; font-weight:bold;">我方</div>
                    <div style="font-size:11px; color:#ddd;">手牌 ${my.handCnt} / 牌組 ${my.deckCnt} / 場外 ${my.outCnt}</div>
                    <div style="font-size:11px; color:#ddd;">F:<b style="color:#f1c40f;">${my.remFinal}</b> S:<b style="color:#ff7675;">${my.remSpecial}</b> C:<b style="color:#74b9ff;">${my.remColor}</b></div>
                </div>
            `;
        }

        // ==================== 先後攻與階段控制 ====================

        startMatchAsFirstPlayer() {
            this.isFirstPlayer = true;
            this.turnNumber = 1;
            this.hasTakenFirstTurn = true; // 先攻立即開始第 1 回合
            document.getElementById('btn-claim-first').style.display = 'none';
            if (conn && isConnected) {
                conn.send({ type: 'ENGINE_EVENT', subType: 'SET_SECOND_PLAYER' });
            }
            sendSystemChat('[規則引擎] 對局開始！由先攻玩家進行第 1 回合（先攻 T1 起始階段不抽牌，AP 上限為 1）。');
            this.beginMyTurn();
        }

        setAsSecondPlayer() {
            this.isFirstPlayer = false;
            this.turnNumber = 1;
            this.hasTakenFirstTurn = false; // 後攻尚未進行自己的第 1 回合！
            this.isMyTurn = false;
            const btn = document.getElementById('btn-claim-first');
            if (btn) btn.style.display = 'none';
            document.querySelectorAll('#my-ap-area .slot .card').forEach(c => c.classList.add('is-flipped'));
            this.updateEnergyHUD();
            broadcastMyState();
        }

        getMaxApForCurrentTurn() {
            if (this.isFirstPlayer) {
                if (this.turnNumber === 1) return 1;
                if (this.turnNumber === 2) return 2;
                return 3;
            } else {
                if (this.turnNumber === 1) return 2;
                if (this.turnNumber === 2) return 2;
                return 3;
            }
        }

        beginMyTurn() {
            this.isMyTurn = true;
            this.usedExtraDraw = false;
            this.bouncedCharThisTurn = false;
            this.playedFromDeckThisTurn = false;
            this.usedEventThisTurn = false;
            this.pendingApDiscounts = [];
            this.usedNamedAbilityThisTurn.clear();

            this.cardRuntime.forEach(rt => {
                rt.enteredThisTurn = false;
                rt.usedOncePerTurn = false;
                rt.attackCountThisTurn = 0;
                rt.blockCountThisTurn = 0;
                rt.tempEnergyBoost = [];
                rt.tempKeywords = {};
                rt.retireAtEndOfMain = false;
                rt.persistentBp = 0;
                rt.persistentKeywords = {};
            });

            // 輪到我方新回合開始時，清除所有殘留與「至下次我方回合開始為止」的 BP 增減
            document.querySelectorAll('#my-front-line .slot').forEach(slot => updateBpDisplay(slot, 0));

            document.querySelectorAll('#my-board .card').forEach(c => {
                const rt = this.getRuntime(c);
                if (rt && rt.frozenNextTurn) {
                    rt.frozenNextTurn = false;
                    showSysMsg(`️ 【${this.getCardDef(c)?.name || '角色'}】受凍結效果影響，本回合起始階段無法轉為活動！`);
                } else {
                    c.classList.remove('rest');
                }
            });

            const targetApCount = this.getMaxApForCurrentTurn();
            const apSlots = document.querySelectorAll('#my-ap-area .slot');
            apSlots.forEach((slot, idx) => {
                const c = slot.querySelector('.card');
                if (!c) return;
                if (idx < targetApCount) c.classList.remove('is-flipped', 'rest');
                else c.classList.add('is-flipped');
            });

            if (!(this.isFirstPlayer && this.turnNumber === 1)) {
                const drew = this.drawCards(1);
                if (!drew) {
                    alert('💀 牌組已無卡可抽！根據官方規則，我方落敗！');
                    sendSystemChat('[規則引擎] 對手在起始階段牌組為 0 無法抽卡，由你獲得勝利！');
                    return;
                }
            }

            const firstPhaseBtn = document.querySelector('.phase-step:first-child');
            if (firstPhaseBtn) window.setPhase(firstPhaseBtn, '起始');
            this.currentPhase = '起始';
            this.updateEnergyHUD();
            broadcastMyState();
        }

        executeExtraDraw() {
            if (!this.isMyTurn || this.currentPhase !== '起始' || this.usedExtraDraw) return;
            if (!this.payAp(1)) {
                showSysMsg('AP 不足，無法進行額外抽卡！');
                return;
            }
            this.usedExtraDraw = true;
            this.drawCards(1);
            sendSystemChat('[規則引擎] 對手支付 1 AP 進行了「額外抽卡 (Extra Draw)」。');
            this.updateEnergyHUD();
        }

        onPhaseChanged(newPhase) {
            const oldPhase = this.currentPhase;
            this.currentPhase = newPhase;
            if (!this.enabled) return;

            if (oldPhase === '主要' && newPhase !== '主要') {
                document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(slot => {
                    const topCard = this.getTopCardInSlot(slot);
                    if (topCard) {
                        const rt = this.getRuntime(topCard);
                        if (rt && rt.retireAtEndOfMain) {
                            rt.retireAtEndOfMain = false;
                            showSysMsg(`【主要階段結束】${this.getCardDef(topCard)?.name || ''} 因自身效果退場！`);
                            this.retireCardFromSlot(slot);
                        }
                    }
                });
            }
            this.updateEnergyHUD();
        }

        handleEndTurnIntercept(originalEndTurnFn) {
            if (!this.enabled) {
                originalEndTurnFn();
                return;
            }

            this.onPhaseChanged('結束');

            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            if (handCards.length > 8) {
                const excess = handCards.length - 8;
                this.promptModal({
                    title: `️ 手牌超過上限 (${handCards.length}/8)`,
                    desc: `根據官方規則，結束階段手牌有 9 張以上時，請點選 ${excess} 張手牌放置於【移除區】後結束回合。`,
                    cards: handCards,
                    selectCount: excess,
                    upTo: false,
                    onConfirm: (selectedCards) => {
                        const removeArea = document.getElementById('my-remove-area');
                        selectedCards.forEach(c => this.moveCardToZone(c, removeArea));
                        sendSystemChat(`️ [規則引擎] 對手在結束階段將 ${excess} 張超額手牌放置於移除區。`);
                        this.finalizeEndTurn();
                    }
                });
                return;
            }
            this.finalizeEndTurn();
        }

        finalizeEndTurn() {
            // 1. 回合結束時，將未受凍結效果影響的場上角色轉為活動（AP 卡維持休息，待下回合起始階段重置）
            document.querySelectorAll('#my-front-line .card, #my-energy-line .card').forEach(c => {
                const rt = this.getRuntime(c);
                if (rt && rt.frozenNextTurn) {
                    rt.frozenNextTurn = false;
                    showSysMsg(`️ 【${this.getCardDef(c)?.name || '角色'}】受凍結效果影響，無法轉為活動！`);
                } else {
                    c.classList.remove('rest');
                }
            });

            // 2. 重置本回合限定 BP，但保留「持續至下次我方回合開始」的 BP (persistentBp)
            document.querySelectorAll('#my-front-line .slot').forEach(slot => {
                const top = this.getTopCardInSlot(slot);
                const rt = top ? this.getRuntime(top) : null;
                const keepBp = (rt && rt.persistentBp) ? rt.persistentBp : 0;
                updateBpDisplay(slot, keepBp);
            });
            // 對手前線若無持續性 BP 則於交換回合時歸零（若對手有持續性 BP 會在對手同步封包中保留）
            document.querySelectorAll('#opp-front-line .slot').forEach(slot => updateBpDisplay(slot, 0));

            this.cardRuntime.forEach(rt => {
                rt.tempEnergyBoost = [];
                rt.tempKeywords = {};
            });

            this.isMyTurn = false;
            this.currentPhase = '等待中';

            document.querySelectorAll('.phase-step').forEach(btn => btn.classList.remove('active'));
            const firstPhaseBtn = document.querySelector('.phase-step:first-child');
            if (firstPhaseBtn) firstPhaseBtn.classList.add('active');
            document.querySelectorAll('.slot.marked').forEach(s => s.classList.remove('marked'));

            showCenterAlert('⛔', '回合結束', '換對手回合', '#c1596f');
            if (conn && isConnected) {
                conn.send({ type: 'PHASE_BROADCAST', phase: '結束' });
                conn.send({ type: 'ENGINE_EVENT', subType: 'YOUR_TURN_START' });
            }
            this.updateEnergyHUD();
            broadcastMyState();
        }

        // ==================== 出牌與突襲判定 ====================

        getTopCardInSlot(slot) {
            if (!slot) return null;
            const cards = Array.from(slot.querySelectorAll('.card'));
            if (cards.length === 0) return null;
            if (cards.length === 1) return cards[0];
            let best = cards[cards.length - 1];
            let bestZ = parseInt(best.style.zIndex, 10);
            if (isNaN(bestZ)) bestZ = cards.length - 1;
            for (let i = 0; i < cards.length; i++) {
                let z = parseInt(cards[i].style.zIndex, 10);
                if (isNaN(z)) z = i;
                if (z >= bestZ) {
                    bestZ = z;
                    best = cards[i];
                }
            }
            return best;
        }

        hasCharacterOnMyField(targetName) {
            let found = false;
            document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(slot => {
                const top = this.getTopCardInSlot(slot);
                const def = this.getCardDef(top);
                if (def && def.type === 'CHARACTER' && def.name.includes(targetName)) found = true;
            });
            return found;
        }

        hasTraitOnMyField(targetTrait) {
            let found = false;
            document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(slot => {
                const top = this.getTopCardInSlot(slot);
                const def = this.getCardDef(top);
                if (def && def.traits && def.traits.includes(targetTrait)) found = true;
            });
            return found;
        }

        checkPlayRequirements(cardDef) {
            if (!cardDef) return { ok: true };
            if (this.isSoloTestMode && this.soloTestBypass) return { ok: true };
            if (this.isFirstPlayer !== null && !this.isMyTurn) {
                return { ok: false, reason: '目前是對手的回合！' };
            }
            if (this.currentPhase !== '主要') {
                return { ok: false, reason: `只能在【主要階段】使用卡片！（請先點選右側「主要階段」）` };
            }

            const activeAp = this.getActiveApCards().length;
            const costAp = this.getEffectiveApCost(cardDef);
            if (activeAp < costAp) {
                return { ok: false, reason: `行動值 (AP) 不足！需要 ${costAp} AP，目前可用 ${activeAp} AP。（提示：點擊 AP 卡可翻面/轉直立）` };
            }

            const req = cardDef.requiredEnergy || { color: 'NONE', count: 0 };
            const script = this.getCardScriptById(cardDef.id);
            const scriptDiscount = (script && typeof script.getEnergyDiscount === 'function') ? (script.getEnergyDiscount(this, cardDef) || 0) : 0;
            const autoDiscount = this.computeAutoEnergyDiscount(cardDef);
            const discount = Math.max(scriptDiscount, autoDiscount);
            const neededCount = Math.max(0, req.count - discount);
            if (neededCount > 0 && req.color !== 'NONE') {
                const myEn = this.calculateMyEnergy();
                const colorCount = myEn[req.color] || 0;
                if (colorCount < neededCount) {
                    return {
                        ok: false,
                        reason: `能源不足！【${cardDef.name}】需要 ${COLOR_NAMES[req.color]}×${neededCount}，目前能源線僅產生 ${COLOR_NAMES[req.color]}×${colorCount}。（若能源線有雙球卡，可點擊卡槽下方的能源徽章切換為 ×2）`
                    };
                }
            }
            return { ok: true };
        }

        canRaidOntoSlot(raidCardDef, targetSlot) {
            const raidCond = raidCardDef?.compiledRules?.raidCondition;
            if (!raidCond) return false;
            const baseCard = this.getTopCardInSlot(targetSlot);
            if (!baseCard) return false;

            const baseDef = this.getCardDef(baseCard);
            const baseRt = this.getRuntime(baseCard);
            if (!baseDef || baseDef.type !== 'CHARACTER') return false;

            if (baseRt && baseRt.isRaided && targetSlot.querySelectorAll('.card').length > 1) return false;

            if (raidCond.type === 'NAME') {
                return baseDef.name.replace(/\s+/g, '') === raidCond.target.replace(/\s+/g, '') || baseDef.name.includes(raidCond.target);
            }
            if (raidCond.type === 'TRAIT') {
                return Array.isArray(baseDef.traits) && baseDef.traits.includes(raidCond.target);
            }
            return true;
        }

        interceptCardDrop(cards, dropZone, action, originalParent, endX, defaultFinalizeFn) {
            if (!this.enabled || !cards || cards.length === 0 || !dropZone || action === 'cancel') {
                defaultFinalizeFn(cards, dropZone, action, originalParent, endX);
                this.updateEnergyHUD();
                return;
            }

            const mainCard = cards[0];
            const def = this.getCardDef(mainCard);
            if (!def) {
                defaultFinalizeFn(cards, dropZone, action, originalParent, endX);
                this.updateEnergyHUD();
                return;
            }

            const fromHand = originalParent && originalParent.id === 'my-hand-area';
            const fromFront = originalParent && originalParent.closest('#my-front-line');
            const fromEnergy = originalParent && originalParent.closest('#my-energy-line');
            const toFront = dropZone.closest('#my-front-line');
            const toEnergy = dropZone.closest('#my-energy-line');
            const toOutside = dropZone.id === 'my-outside-area';
            const toRemove = dropZone.id === 'my-remove-area';

            // A. 場上移動（解除階段硬鎖，確保主要/戰鬥階段的移動效果與手動換位皆可順利操作）
            if ((fromFront || fromEnergy) && (toFront || toEnergy) && originalParent !== dropZone) {
                const existingCards = Array.from(dropZone.querySelectorAll('.card'));
                if (existingCards.length > 0) {
                    // 目標卡槽已有卡片：若是 [ステップ] 退回能源線則自動互換；否則開啟疊牌／交換選單
                    const hasStep = def.keywords?.includes('ステップ') || def.compiledRules?.staticKeywords?.step || this.getRuntime(mainCard)?.tempKeywords?.STEP;
                    if (fromFront && toEnergy && hasStep && this.currentPhase === '移動') {
                        const targetTop = this.getTopCardInSlot(dropZone);
                        if (this.getCardDef(targetTop)?.type === 'CHARACTER') {
                            existingCards.forEach(ec => originalParent.appendChild(ec));
                            recalcStacking(originalParent);
                            showSysMsg('發動 [ステップ]：已與能源線的角色互換位置！');
                            defaultFinalizeFn(cards, dropZone, 'default', originalParent, endX);
                            this.updateEnergyHUD();
                            return;
                        }
                    }
                    this.promptOverlayPlacementMenu(cards, mainCard, def, dropZone, originalParent, endX, defaultFinalizeFn, false);
                    return;
                }

                if (this.currentPhase !== '移動') {
                    showSysMsg(`非移動階段移動：【${def.name}】（視為效果移動）`);
                } else if (fromFront && toEnergy) {
                    const hasStep = def.keywords?.includes('ステップ') || def.compiledRules?.staticKeywords?.step || this.getRuntime(mainCard)?.tempKeywords?.STEP;
                    if (!hasStep) {
                        showSysMsg(`ℹ️ 【${def.name}】已退回能源線（若非卡片效果，請注意需具備 [ステップ]）`);
                    }
                }
                defaultFinalizeFn(cards, dropZone, 'default', originalParent, endX);
                this.updateEnergyHUD();
                return;
            }

            // B. 場上移至移除區（允許效果移至移除區，不硬性阻擋）
            if ((fromFront || fromEnergy) && toRemove) {
                const allInSlot = Array.from(originalParent.querySelectorAll('.card'));
                if (allInSlot.length > 1 && cards.length > 1) {
                    const topCard = allInSlot[allInSlot.length - 1];
                    const underCards = allInSlot.slice(0, allInSlot.length - 1);
                    const outsideArea = document.getElementById('my-outside-area');
                    underCards.forEach(uc => this.moveCardToZone(uc, outsideArea));
                    defaultFinalizeFn([topCard], dropZone, action, originalParent, endX);
                } else {
                    defaultFinalizeFn(cards, dropZone, action, originalParent, endX);
                }
                this.updateEnergyHUD();
                return;
            }

            // C. 突襲疊牌離場拆解（若返回手牌則記錄本回合有角色離場回手牌）
            if ((fromFront || fromEnergy) && !toFront && !toEnergy) {
                if (dropZone.id === 'my-hand-area' && def.type === 'CHARACTER') {
                    this.bouncedCharThisTurn = true;
                }
                const allInSlot = Array.from(originalParent.querySelectorAll('.card'));
                if (allInSlot.length > 1 && cards.length > 1) {
                    const topCard = allInSlot[allInSlot.length - 1];
                    const underCards = allInSlot.slice(0, allInSlot.length - 1);
                    const outsideArea = document.getElementById('my-outside-area');
                    underCards.forEach(uc => this.moveCardToZone(uc, outsideArea));
                    defaultFinalizeFn([topCard], dropZone, action, originalParent, endX);
                    this.updateEnergyHUD();
                    return;
                }
            }

            // D. 從非場上區域（手牌／場外／檢索等）覆蓋到已有卡片的場上卡槽：統一跳出「突襲／正表放上／背表放下／正表放下」選單
            if ((toFront || toEnergy) && dropZone.querySelectorAll('.card').length > 0) {
                this.promptOverlayPlacementMenu(cards, mainCard, def, dropZone, originalParent, endX, defaultFinalizeFn, fromHand);
                return;
            }

            // E. 從手牌打出至空白卡槽或場外（事件卡）
            if (fromHand && (toFront || toEnergy || toOutside)) {
                if (def.type === 'EVENT') {
                    const check = this.checkPlayRequirements(def);
                    if (!check.ok) {
                        showSysMsg(`${check.reason}`);
                        defaultFinalizeFn(cards, null, 'cancel', originalParent, endX);
                        return;
                    }
                    this.payApForCard(def);
                    this.usedEventThisTurn = true;
                    const outsideArea = document.getElementById('my-outside-area');
                    defaultFinalizeFn(cards, outsideArea, 'default', originalParent, endX);
                    sendSystemChat(`[規則引擎] 對手使用了事件卡【${def.name}】！`);
                    this.triggerCardAbilities(mainCard, 'CONTINUOUS');
                    this.updateEnergyHUD();
                    return;
                }

                if (def.type === 'FIELD' && toFront) {
                    showSysMsg('根據規則：場域卡（Field）無法在前線登場，請放置於能源線！');
                    defaultFinalizeFn(cards, null, 'cancel', originalParent, endX);
                    return;
                }

                const check = this.checkPlayRequirements(def);
                if (!check.ok) {
                    showSysMsg(`${check.reason}`);
                    defaultFinalizeFn(cards, null, 'cancel', originalParent, endX);
                    return;
                }

                this.completeNormalPlay(cards, mainCard, def, dropZone, originalParent, endX, defaultFinalizeFn);
                return;
            }

            defaultFinalizeFn(cards, dropZone, action, originalParent, endX);
            this.updateEnergyHUD();
        }

        promptOverlayPlacementMenu(cards, mainCard, def, dropZone, originalParent, endX, defaultFinalizeFn, isFromHand) {
            const toFront = !!dropZone.closest('#my-front-line');
            const isEnergySlot = !!dropZone.closest('#my-energy-line');
            const existingCards = Array.from(dropZone.querySelectorAll('.card'));
            const emptyFrontSlot = Array.from(document.querySelectorAll('#my-front-line .slot')).find(s => s.querySelectorAll('.card').length === 0);
            const canRaid = isFromHand && this.canRaidOntoSlot(def, dropZone);
            const playCheck = isFromHand ? this.checkPlayRequirements(def) : { ok: false };

            const buttons = [];

            // 1. 突襲選項：只要此卡具備突襲條件（或為突襲角色），都提供突襲選項
            const isRaidCard = !!(def?.compiledRules?.raidCondition || (def?.effectText && def.effectText.includes('[レイド]')));
            if (canRaid && playCheck.ok) {
                if (isEnergySlot && emptyFrontSlot) {
                    buttons.push({
                        label: '突襲並移至前線（支付 AP）',
                        color: '#e67e22',
                        onClick: () => this.executeRaidSummon(mainCard, def, dropZone, true, originalParent, endX, defaultFinalizeFn)
                    });
                }
                buttons.push({
                    label: '突襲（支付 AP）',
                    color: '#c1596f',
                    onClick: () => this.executeRaidSummon(mainCard, def, dropZone, false, originalParent, endX, defaultFinalizeFn)
                });
            } else if (isRaidCard) {
                if (isEnergySlot && emptyFrontSlot) {
                    buttons.push({
                        label: '突襲並移至前線（不支付 AP）',
                        color: '#e67e22',
                        onClick: () => this.executeRaidSummon(mainCard, def, dropZone, true, originalParent, endX, defaultFinalizeFn, true)
                    });
                }
                buttons.push({
                    label: '突襲（不支付 AP）',
                    color: '#c1596f',
                    onClick: () => this.executeRaidSummon(mainCard, def, dropZone, false, originalParent, endX, defaultFinalizeFn, true)
                });
            }

            // 2. 滿 4 張覆蓋登場選項
            if (isFromHand && playCheck.ok) {
                const lineSelector = toFront ? '#my-front-line .slot' : '#my-energy-line .slot';
                let occupied = 0;
                document.querySelectorAll(lineSelector).forEach(s => {
                    if (s.querySelectorAll('.card').length > 0) occupied++;
                });
                if (occupied >= 4) {
                    buttons.push({
                        label: '移除原卡並登場（支付 AP）',
                        color: '#d35400',
                        onClick: () => {
                            const removeArea = document.getElementById('my-remove-area');
                            const topOld = existingCards[existingCards.length - 1];
                            const underOld = existingCards.slice(0, existingCards.length - 1);
                            this.moveCardToZone(topOld, removeArea);
                            underOld.forEach(uc => this.moveCardToZone(uc, document.getElementById('my-outside-area')));
                            this.completeNormalPlay(cards, mainCard, def, dropZone, originalParent, endX, defaultFinalizeFn);
                        }
                    });
                }
            }

            // 3. 場上卡片互相交換位置（若從場上另一格拖來）
            if (!isFromHand && originalParent && (originalParent.closest('#my-front-line') || originalParent.closest('#my-energy-line'))) {
                buttons.push({
                    label: '與此格角色互換位置',
                    color: '#4f9678',
                    onClick: () => {
                        existingCards.forEach(ec => originalParent.appendChild(ec));
                        recalcStacking(originalParent);
                        defaultFinalizeFn(cards, dropZone, 'default', originalParent, endX);
                        this.updateEnergyHUD();
                    }
                });
            }

            // 4. 完整保留原本的疊牌選項（正表放上／背表放下／正表放下，不扣 AP，供各種效果使用）
            buttons.push({
                label: '表側置於上方',
                color: '#6c93c7',
                onClick: () => {
                    defaultFinalizeFn(cards, dropZone, 'top-faceup', originalParent, endX);
                    this.updateEnergyHUD();
                }
            });
            buttons.push({
                label: '裏側置於下方',
                color: '#5c6bc0',
                onClick: () => {
                    defaultFinalizeFn(cards, dropZone, 'bottom-facedown', originalParent, endX);
                    this.updateEnergyHUD();
                }
            });
            buttons.push({
                label: '表側置於下方',
                color: '#7e57c2',
                onClick: () => {
                    defaultFinalizeFn(cards, dropZone, 'bottom-faceup', originalParent, endX);
                    this.updateEnergyHUD();
                }
            });
            buttons.push({
                label: '取消',
                color: '#7f8c8d',
                onClick: () => {
                    defaultFinalizeFn(cards, null, 'cancel', originalParent, endX);
                }
            });

            this.promptModal({
                title: `放置方式：${def?.name || '卡片'}`, 
                desc: canRaid && !playCheck.ok
                    ? `（提示：目前無法消耗 AP 突襲：${playCheck.reason}，仍可選擇下方手動疊放方式）`
                    : `請選擇要如何將此卡放置於該卡槽：`,
                cards: [],
                customButtons: buttons
            });
        }

        completeNormalPlay(cards, mainCard, def, dropZone, originalParent, endX, defaultFinalizeFn) {
            this.payApForCard(def);
            defaultFinalizeFn(cards, dropZone, 'default', originalParent, endX);

            const rt = this.getRuntime(mainCard);
            rt.enteredThisTurn = true;
            rt.isRaided = false;

            if (def.compiledRules && def.compiledRules.entersActive) {
                mainCard.classList.remove('rest');
            } else {
                mainCard.classList.add('rest');
            }

            sendSystemChat(`[規則引擎] 對手消耗 ${def.apCost} AP 登場了【${def.name}】。`);
            this.triggerCardAbilities(mainCard, 'ON_PLAY');
            this.updateEnergyHUD();
            broadcastMyState();
        }

        promptRaidConfirmation(cardEl, def, targetSlot, originalParent, endX, defaultFinalizeFn) {
            const isEnergySlot = !!targetSlot.closest('#my-energy-line');
            const emptyFrontSlot = Array.from(document.querySelectorAll('#my-front-line .slot')).find(s => s.querySelectorAll('.card').length === 0);

            const buttons = [
                {
                    label: '⚡ 發動突襲 (レイド：活動狀態疊放)',
                    color: '#c1596f',
                    onClick: () => {
                        this.executeRaidSummon(cardEl, def, targetSlot, false, originalParent, endX, defaultFinalizeFn);
                    }
                }
            ];

            if (isEnergySlot && emptyFrontSlot) {
                buttons.unshift({
                    label: '🚀 突襲並直接移至【前線】！',
                    color: '#e67e22',
                    onClick: () => {
                        this.executeRaidSummon(cardEl, def, targetSlot, true, originalParent, endX, defaultFinalizeFn);
                    }
                });
            }

            buttons.push({
                label: '✋ 不突襲，取消放置',
                color: '#7f8c8d',
                onClick: () => {
                    defaultFinalizeFn([cardEl], null, 'cancel', originalParent, endX);
                }
            });

            this.promptModal({
                title: `突襲宣言：【${def.name}】`,
                desc: `偵測到合法突襲目標！請選擇登場方式：\n（規則：突襲後將轉為活動狀態，且基底卡原有的效果與BP增減將失效）`,
                cards: [],
                customButtons: buttons
            });
        }

        executeRaidSummon(cardEl, def, targetSlot, moveToFront, originalParent, endX, defaultFinalizeFn, isFreeFromTrigger = false, onComplete = null) {
            const baseCardUnder = this.getTopCardInSlot(targetSlot);
            if (!isFreeFromTrigger) this.payApForCard(def);
            updateBpDisplay(targetSlot, 0);

            defaultFinalizeFn([cardEl], targetSlot, 'top-faceup', originalParent, endX);
            if (baseCardUnder) {
                const baseScript = this.getCardScript(baseCardUnder);
                if (baseScript && typeof baseScript.onRaided === 'function') {
                    baseScript.onRaided(this, baseCardUnder, cardEl);
                }
            }
            cardEl.classList.remove('rest', 'is-flipped');

            const rt = this.getRuntime(cardEl);
            rt.enteredThisTurn = true;
            rt.isRaided = true;

            if (moveToFront) {
                const emptyFrontSlot = Array.from(document.querySelectorAll('#my-front-line .slot')).find(s => s.querySelectorAll('.card').length === 0);
                if (emptyFrontSlot) {
                    Array.from(targetSlot.querySelectorAll('.card')).forEach(c => emptyFrontSlot.appendChild(c));
                    recalcStacking(emptyFrontSlot);
                }
            }

            sendSystemChat(`[規則引擎] 對手發動了【${def.name}】的突襲（レイド）！`);
            this.updateEnergyHUD();
            broadcastMyState();
            this.triggerCardAbilities(cardEl, 'ON_PLAY', onComplete);
        }

        // ==================== 逗號時序效果佇列執行器 ====================

        renderKeywordBadgesOnBoard() {
            document.querySelectorAll('.eng-kw-badges').forEach(b => b.remove());
            if (!this.enabled) return;

            document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot, #opp-front-line .slot, #opp-energy-line .slot').forEach(slot => {
                const isOppSlot = slot.id.startsWith('opp-');
                const topCard = this.getTopCardInSlot(slot);
                if (!topCard) return;

                let badges = [];
                if (isOppSlot && this.oppSyncedKeywords && Array.isArray(this.oppSyncedKeywords[slot.id])) {
                    badges = this.oppSyncedKeywords[slot.id];
                } else {
                    if (topCard.classList.contains('is-flipped')) return;
                    const def = this.getCardDef(topCard);
                    if (!def || def.type !== 'CHARACTER') return;
                    badges = this.computeBadgesForCard(topCard);
                }

                if (badges.length === 0) return;

                const wrap = document.createElement('div');
                wrap.className = 'eng-kw-badges';
                wrap.style.cssText = `
                    position: absolute; bottom: 4px; left: 2px; right: 2px;
                    display: flex; flex-wrap: wrap; gap: 2px; justify-content: center;
                    z-index: 1120; pointer-events: none;
                `;
                badges.forEach(b => {
                    const tag = document.createElement('span');
                    tag.innerText = b.text;
                    tag.style.cssText = `
                        background: ${b.bg}; color: #fff; font-size: 10px; font-weight: 900;
                        padding: 1px 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.7);
                        box-shadow: 0 1px 3px rgba(0,0,0,0.9); white-space: nowrap;
                    `;
                    wrap.appendChild(tag);
                });
                slot.appendChild(wrap);
            });
        }

        renderFieldActionOverlayButtons() {
            document.querySelectorAll('.eng-card-btn').forEach(b => b.remove());
            this.renderKeywordBadgesOnBoard();
            if (!this.enabled || !this.isMyTurn) return;

            if (this.currentPhase === '主要') {
                document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(slot => {
                    const topCard = this.getTopCardInSlot(slot);
                    if (!topCard) return;
                    const def = this.getCardDef(topCard);
                    const rt = this.getRuntime(topCard);
                    if (!def || !def.parsedAbilities) return;

                    const isFront = !!slot.closest('#my-front-line');
                    const isEnergy = !!slot.closest('#my-energy-line');

                    const script = this.getCardScript(topCard);
                    if (script && typeof script.onActivateMain === 'function') {
                        const raidOk = !script.requireRaided || !!rt.isRaided;
                        const canAct = raidOk && (typeof script.canActivateMain === 'function' ? script.canActivateMain(this, topCard, slot) : true);
                        if (canAct) {
                            const btn = document.createElement('button');
                            btn.className = 'eng-card-btn';
                            btn.innerText = '起動メイン';
                            btn.style.cssText = `
                                position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
                                width: 92%; background: linear-gradient(135deg, #f39c12, #d35400); color: #fff;
                                border: 2px solid #fff; border-radius: 8px; padding: 8px 6px;
                                font-size: 14px; font-weight: 900; cursor: pointer; z-index: 1200;
                                box-shadow: 0 4px 12px rgba(0,0,0,0.9); white-space: nowrap;
                            `;
                            btn.onclick = (e) => {
                                e.stopPropagation();
                                script.onActivateMain(this, topCard, slot, () => {
                                    this.updateEnergyHUD();
                                    broadcastMyState();
                                });
                            };
                            slot.appendChild(btn);
                        }
                        return;
                    }

                    const mainAbilities = def.parsedAbilities.filter(a => {
                        if (!a.timings.includes('ACTIVATE_MAIN')) return false;
                        if (a.requireRaided && !rt.isRaided) return false;
                        if (a.requireFrontLine && !isFront) return false;
                        if (a.requireEnergyLine && !isEnergy) return false;
                        return true;
                    });

                    mainAbilities.forEach((ab) => {
                        if (ab.oncePerTurn && rt.usedOncePerTurn) return;
                        if (ab.costs.some(c => c.type === 'REST_SELF') && topCard.classList.contains('rest')) return;
                        const btn = document.createElement('button');
                        btn.className = 'eng-card-btn';
                        btn.innerText = '起動メイン';
                        btn.style.cssText = `
                            position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
                            width: 92%; background: linear-gradient(135deg, #f39c12, #d35400); color: #fff;
                            border: 2px solid #fff; border-radius: 8px; padding: 8px 6px;
                            font-size: 14px; font-weight: 900; cursor: pointer; z-index: 1200;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.9); white-space: nowrap;
                        `;
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            this.activateMainAbility(topCard, ab, slot);
                        };
                        slot.appendChild(btn);
                    });
                });
            }

            if (this.currentPhase === '戰鬥') {
                if (this.waitingForOppTrigger) {
                    const firstSlot = document.querySelector('#my-front-line .slot');
                    if (firstSlot) {
                        const waitBadge = document.createElement('button');
                        waitBadge.className = 'eng-card-btn';
                        waitBadge.innerText = '對手處理觸發中（點此手動解除）';
                        waitBadge.style.cssText = `
                            position: absolute; top: -44px; left: 0;
                            background: rgba(241, 196, 15, 0.95); color: #000; border: 2px solid #fff;
                            padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 900;
                            cursor: pointer; z-index: 1300; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.8);
                        `;
                        waitBadge.onclick = (e) => {
                            e.stopPropagation();
                            this.waitingForOppTrigger = false;
                            if (this.oppTriggerTimeoutId) { clearTimeout(this.oppTriggerTimeoutId); this.oppTriggerTimeoutId = null; }
                            this.updateEnergyHUD();
                        };
                        firstSlot.appendChild(waitBadge);
                    }
                    return;
                }
                document.querySelectorAll('#my-front-line .slot').forEach(slot => {
                    const topCard = this.getTopCardInSlot(slot);
                    if (!topCard || topCard.classList.contains('rest')) return;
                    const def = this.getCardDef(topCard);
                    const rt = this.getRuntime(topCard);
                    if (!def || def.type !== 'CHARACTER') return;

                    const innateKw = this.getInnateStaticKeywords(def);
                    const hasSnipe = !!(innateKw.snipe || rt?.tempKeywords?.SNIPE);
                    const atkBtn = document.createElement('button');
                    atkBtn.className = 'eng-card-btn';
                    atkBtn.innerText = '攻擊';
                    atkBtn.style.cssText = `
                        position: absolute; ${hasSnipe ? 'top: 24%;' : 'top: 50%;'} left: 50%; transform: translate(-50%, -50%);
                        width: 94%; background: linear-gradient(135deg, #e74c3c, #c0392b); color: #fff; border: 2px solid #fff;
                        border-radius: 8px; padding: 12px 6px; font-size: 16px; font-weight: 900; letter-spacing: 1px;
                        cursor: pointer; z-index: 1200; box-shadow: 0 6px 16px rgba(0,0,0,0.9); white-space: nowrap;
                    `;
                    atkBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.declareAttack(slot, topCard, null);
                    };
                    slot.appendChild(atkBtn);

                    if (hasSnipe) {
                        const snipeBtn = document.createElement('button');
                        snipeBtn.className = 'eng-card-btn';
                        snipeBtn.innerText = '狙擊';
                        snipeBtn.style.cssText = `
                            position: absolute; top: 68%; left: 50%; transform: translate(-50%, -50%);
                            width: 94%; background: linear-gradient(135deg, #9b59b6, #6c3483); color: #fff; border: 2px solid #fff;
                            border-radius: 8px; padding: 11px 6px; font-size: 15px; font-weight: 900; letter-spacing: 1px;
                            cursor: pointer; z-index: 1200; box-shadow: 0 6px 16px rgba(0,0,0,0.9); white-space: nowrap;
                        `;
                        snipeBtn.onclick = (e) => {
                            e.stopPropagation();
                            this.promptSnipeTarget(slot, topCard);
                        };
                        slot.appendChild(snipeBtn);
                    }
                });
            }
        }

        activateMainAbility(cardEl, ability, slot) {
            const def = this.getCardDef(cardEl);
            const rt = this.getRuntime(cardEl);

            for (const cost of ability.costs) {
                if (cost.type === 'REST_SELF' && cardEl.classList.contains('rest')) {
                    showSysMsg('此卡片已經是休息狀態，無法支付 [レストにする] 代價！');
                    return;
                }
                if (cost.type === 'PAY_AP' && this.getActiveApCards().length < cost.amount) {
                    showSysMsg(`AP 不足，需要支付 ${cost.amount} AP！`);
                    return;
                }
                if (cost.type === 'DISCARD_HAND' && document.querySelectorAll('#my-hand-area .card').length < cost.amount) {
                    showSysMsg(`手牌不足 ${cost.amount} 張，無法支付代價！`);
                    return;
                }
            }

            const runMainBody = () => {
                if (ability.oncePerTurn) rt.usedOncePerTurn = true;
                sendSystemChat(`[規則引擎] 對手發動了【${def.name}】的 [起動メイン] 效果！`);
                const orderedActions = this.compileSequentialClauses(ability.rawText || def.effectText);
                this.executeAbilityActions(cardEl, orderedActions, 0, { selectedTargets: [], addedFromLook: false });
                this.updateEnergyHUD();
                broadcastMyState();
            };

            let needDiscardCost = 0;
            ability.costs.forEach(cost => {
                if (cost.type === 'REST_SELF') cardEl.classList.add('rest');
                if (cost.type === 'PAY_AP') this.payAp(cost.amount);
                if (cost.type === 'RETIRE_SELF') this.retireCardFromSlot(slot);
                if (cost.type === 'DISCARD_HAND') needDiscardCost = cost.amount;
            });

            if (needDiscardCost > 0) {
                const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
                this.promptModal({
                    title: `️ 支付啟動代價：捨棄 ${needDiscardCost} 張手牌`,
                    desc: `請選擇 ${needDiscardCost} 張手牌放置於場外以發動【${def.name}】的效果：`,
                    cards: handCards,
                    selectCount: needDiscardCost,
                    upTo: false,
                    onConfirm: (selected) => {
                        const outside = document.getElementById('my-outside-area');
                        selected.forEach(c => this.moveCardToZone(c, outside));
                        runMainBody();
                    }
                });
            } else {
                runMainBody();
            }
        }

        triggerCardAbilities(cardEl, timing, onComplete = null) {
            const def = this.getCardDef(cardEl);
            const rt = this.getRuntime(cardEl);
            if (!def) {
                if (onComplete) onComplete();
                return;
            }

            const script = this.getCardScript(cardEl);
            if (script) {
                const raidBlocked = !!script.requireRaided && !rt.isRaided;
                if (raidBlocked) {
                    if (onComplete) onComplete();
                    return;
                }
                if (timing === 'ON_PLAY' && typeof script.onPlay === 'function') {
                    script.onPlay(this, cardEl, () => { this.updateEnergyHUD(); broadcastMyState(); if (onComplete) onComplete(); });
                    return;
                }
                if (timing === 'ON_ATTACK' && typeof script.onAttack === 'function') {
                    script.onAttack(this, cardEl, () => { this.updateEnergyHUD(); broadcastMyState(); if (onComplete) onComplete(); });
                    return;
                }
                if (timing === 'ON_RETIRE' && typeof script.onRetire === 'function') {
                    script.onRetire(this, cardEl, () => { this.updateEnergyHUD(); broadcastMyState(); if (onComplete) onComplete(); });
                    return;
                }
                if (timing === 'CONTINUOUS' && def.type === 'EVENT' && typeof script.onEventPlay === 'function') {
                    script.onEventPlay(this, cardEl, () => { this.updateEnergyHUD(); broadcastMyState(); if (onComplete) onComplete(); });
                    return;
                }
            }

            if (!def.parsedAbilities) {
                if (onComplete) onComplete();
                return;
            }

            const isFront = !!cardEl.closest('#my-front-line');
            const isEnergy = !!cardEl.closest('#my-energy-line');

            const matched = def.parsedAbilities.filter(ab => {
                if (!ab.timings.includes(timing)) return false;
                if (ab.requireRaided && !rt.isRaided) return false;
                if (ab.duringMyTurnOnly && this.isFirstPlayer !== null && !this.isMyTurn) return false;
                if (ab.duringOppTurnOnly && this.isFirstPlayer !== null && this.isMyTurn) return false;
                if (ab.requireFrontLine && !isFront) return false;
                if (ab.requireEnergyLine && !isEnergy) return false;
                return true;
            });

            const runNextAbility = (idx) => {
                if (idx >= matched.length) {
                    if (onComplete) onComplete();
                    return;
                }
                const ab = matched[idx];
                const orderedActions = this.compileSequentialClauses(ab.rawText || def.effectText);
                this.executeAbilityActions(
                    cardEl,
                    orderedActions,
                    0,
                    { selectedTargets: [], addedFromLook: false },
                    () => runNextAbility(idx + 1)
                );
            };
            runNextAbility(0);
        }

        checkActionConditions(sourceCardEl, conditions, taskContext) {
            if (!conditions || conditions.length === 0) return true;
            return conditions.every(cond => {
                if (cond.type === 'SELF_IS_ACTIVE') return !sourceCardEl.classList.contains('rest');
                if (cond.type === 'HAS_CHAR_ON_FIELD') return this.hasCharacterOnMyField(cond.name);
                if (cond.type === 'HAS_TRAIT_ON_FIELD') return this.hasTraitOnMyField(cond.trait);
                if (cond.type === 'IF_ADDED_TO_HAND') return !!taskContext.addedFromLook;
                return true;
            });
        }

        executeAbilityActions(sourceCardEl, actions, index = 0, taskContext = { selectedTargets: [], addedFromLook: false }, onComplete = null) {
            const sourceDef = this.getCardDef(sourceCardEl);
            if (!this.recentLogs) this.recentLogs = [];

            if (index === 0 && actions && actions.length > 0) {
                this.lastExecutedContext = {
                    cardEl: sourceCardEl,
                    def: sourceDef,
                    rawText: sourceDef?.effectText || '',
                    actions: actions,
                    lastError: null
                };
            }

            if (!actions || index >= actions.length) {
                this.updateEnergyHUD();
                broadcastMyState();
                if (onComplete) onComplete();
                return;
            }

            const next = () => this.executeAbilityActions(sourceCardEl, actions, index + 1, taskContext, onComplete);
            let act = null;

            try {
                act = actions[index];
                const rt = this.getRuntime(sourceCardEl);

                if (!this.checkActionConditions(sourceCardEl, act.conditions, taskContext)) {
                    next();
                    return;
                }

                switch (act.type) {
                    // 🌟 選發代價分支（「～てもよい。そうした場合、...」）
                    case 'OPTIONAL_COST_BRANCH': {
                        const cost = act.cost;
                        this.promptModal({
                            title: `選發效果確認：【${this.getDisplayName(sourceDef) || '卡片效果'}】`,
                            desc: `${this.getDisplayEffectText(sourceDef)}\n\n請問是否要支付代價【${cost.desc}】來發動後續效果？`,
                            cards: [sourceCardEl],
                            customButtons: [
                                {
                                    label: `✅ 支付代價並發動 (${cost.desc})`,
                                    color: '#2ecc71',
                                    onClick: () => {
                                        if (cost.type === 'DISCARD_HAND') {
                                            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
                                            if (handCards.length < cost.count) {
                                                showSysMsg(`手牌不足 ${cost.count} 張，無法支付代價！`);
                                                next();
                                                return;
                                            }
                                            this.promptModal({
                                                title: `️ 請選擇 ${cost.count} 張手牌捨棄`,
                                                desc: `選擇 ${cost.count} 張手牌放置於場外：`,
                                                cards: handCards,
                                                selectCount: cost.count,
                                                upTo: false,
                                                onConfirm: (sel) => {
                                                    const outside = document.getElementById('my-outside-area');
                                                    sel.forEach(c => this.moveCardToZone(c, outside));
                                                    this.executeAbilityActions(sourceCardEl, act.thenActions, 0, taskContext, next);
                                                }
                                            });
                                        } else if (cost.type === 'PAY_AP') {
                                            if (!this.payAp(cost.count)) {
                                                showSysMsg(`可用 AP 不足 ${cost.count} 點！`);
                                                next();
                                                return;
                                            }
                                            this.executeAbilityActions(sourceCardEl, act.thenActions, 0, taskContext, next);
                                        } else if (cost.type === 'MILL_DECK') {
                                            this.millDeckCards(cost.count);
                                            this.executeAbilityActions(sourceCardEl, act.thenActions, 0, taskContext, next);
                                        } else {
                                            this.executeAbilityActions(sourceCardEl, act.thenActions, 0, taskContext, next);
                                        }
                                    }
                                },
                                {
                                    label: '❌ 不發動 (略過此效果)',
                                    color: '#7f8c8d',
                                    onClick: () => next()
                                }
                            ]
                        });
                        break;
                    }

                    case 'SELECT_TARGET': {
                        let selector = '#my-front-line .slot, #my-energy-line .slot';
                        if (act.owner === 'OPP') {
                            selector = act.zone === 'FRONT_LINE' ? '#opp-front-line .slot' : (act.zone === 'ENERGY_LINE' ? '#opp-energy-line .slot' : '#opp-front-line .slot, #opp-energy-line .slot');
                        } else {
                            selector = act.zone === 'FRONT_LINE' ? '#my-front-line .slot' : (act.zone === 'ENERGY_LINE' ? '#my-energy-line .slot' : '#my-front-line .slot, #my-energy-line .slot');
                        }

                        const candidates = this.getSlotTopCards(selector).filter(c => {
                            if (act.excludeSelf && c === sourceCardEl) return false;
                            const d = this.getCardDef(c);
                            if (d && d.type !== 'CHARACTER') return false;
                            if (act.maxBp !== null && act.maxBp !== undefined) {
                                if (this.getEffectiveCardBp(c) > act.maxBp) return false;
                            }
                            if (act.maxEnergy !== null && act.maxEnergy !== undefined) {
                                if ((d?.requiredEnergy?.count || 0) > act.maxEnergy) return false;
                            }
                            if (!this.matchesTargetFilters(c, act)) return false;
                            return true;
                        });

                        if (candidates.length === 0) {
                            taskContext.selectedTargets = [];
                            showSysMsg(`ℹ️ 場上沒有符合條件的目標。`);
                            next();
                            break;
                        }

                        this.promptModal({
                            title: `選擇效果目標：【${sourceDef?.name || '效果'}】`,
                            desc: `請選擇 ${act.owner === 'OPP' ? '對手' : '我方'}${act.zone === 'FRONT_LINE' ? '前線' : '場上'}${act.maxBp ? ` BP ${act.maxBp} 以下的` : ''}角色 ${act.upTo ? `最多 ${act.count}` : act.count} 張：`,
                            cards: candidates,
                            selectCount: act.count,
                            upTo: act.upTo,
                            onConfirm: (selected) => {
                                taskContext.selectedTargets = selected;
                                next();
                            }
                        });
                        break;
                    }

                    // 看牌頂 N 張，選最多 keepUpTo 張放回牌頂，其餘去場外/牌底/移除區
                    case 'LOOK_AND_ARRANGE_TOP': {
                        const deckArea = document.getElementById('my-deck-area');
                        const outsideArea = document.getElementById('my-outside-area');
                        const removeArea = document.getElementById('my-remove-area');
                        const allDeckCards = Array.from(deckArea.querySelectorAll('.card'));
                        const lookCount = Math.min(act.count, allDeckCards.length);
                        if (lookCount === 0) { next(); break; }

                        const topCards = allDeckCards.slice(allDeckCards.length - lookCount).reverse();
                        const maxKeep = act.keepUpTo !== undefined ? Math.min(act.keepUpTo, lookCount) : lookCount;
                        const isUpTo = act.upTo !== undefined ? act.upTo : true;
                        const destLabel = act.remainderTo === 'OUTSIDE' ? '場外' : (act.remainderTo === 'REMOVE' ? '移除區' : '牌組底部');

                        if (act.remainderTo === 'TOP') {
                            this.promptModal({
                                title: `檢視並排序牌頂 ${lookCount} 張：【${sourceDef?.name || ''}】`,
                                desc: `請依序點選這 ${lookCount} 張卡片（第 1 張將在最頂端，第 ${lookCount} 張在最下面），選滿後按確認：`,
                                cards: topCards,
                                selectCount: lookCount,
                                upTo: false,
                                showOrderNumbers: true,
                                onConfirm: (orderedCards) => {
                                    // orderedCards[0] 放最頂端 -> 最後 appendChild
                                    [...orderedCards].reverse().forEach(c => {
                                        deckArea.appendChild(c);
                                        c.classList.add('is-flipped');
                                    });
                                    recalcStacking(deckArea);
                                    broadcastMyState();
                                    sendSystemChat(`[規則引擎] 對手檢視並重新排列了牌頂 ${lookCount} 張卡片的順序。`);
                                    next();
                                }
                            });
                            break;
                        }

                        this.promptModal({
                            title: `檢視牌頂 ${lookCount} 張：【${sourceDef?.name || ''}】`,
                            desc: `請點選要【放回牌組頂端】的卡片（${isUpTo ? `可選 0 ~ ${maxKeep}` : `請選 ${maxKeep}`} 張），未選取的卡片將置於【${destLabel}】：`,
                            cards: topCards,
                            selectCount: maxKeep,
                            upTo: isUpTo,
                            onConfirm: (keptOnTop) => {
                                const rest = topCards.filter(c => !keptOnTop.includes(c));
                                const finishTop = () => {
                                    this.promptOrderCardsToDeck(keptOnTop, 'TOP', () => {
                                        sendSystemChat(`[規則引擎] 對手檢視牌頂 ${lookCount} 張，將 ${keptOnTop.length} 張置於牌頂、${rest.length} 張置於${destLabel}。`);
                                        next();
                                    });
                                };
                                if (act.remainderTo === 'OUTSIDE') {
                                    rest.forEach(c => this.moveCardToZone(c, outsideArea));
                                    finishTop();
                                } else if (act.remainderTo === 'REMOVE') {
                                    rest.forEach(c => this.moveCardToZone(c, removeArea));
                                    finishTop();
                                } else {
                                    this.promptOrderCardsToDeck(rest, 'BOTTOM', finishTop);
                                }
                            }
                        });
                        break;
                    }

                    case 'DRAW': {
                        this.drawCards(act.amount);
                        showSysMsg(`效果發動：抽取了 ${act.amount} 張卡片！`);
                        next();
                        break;
                    }

                    case 'MILL_DECK': {
                        this.millDeckCards(act.count);
                        next();
                        break;
                    }

                    case 'PUT_HAND_TO_DECK_TOP': {
                        const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
                        if (handCards.length === 0) { next(); break; }
                        const cnt = Math.min(act.count || 1, handCards.length);
                        this.promptModal({
                            title: `️ 選擇 ${cnt} 張手牌放回牌組頂端`,
                            desc: `請選擇 ${cnt} 張手牌放回牌組頂端：`,
                            cards: handCards,
                            selectCount: cnt,
                            upTo: false,
                            onConfirm: (selected) => {
                                const deckArea = document.getElementById('my-deck-area');
                                selected.forEach(c => {
                                    deckArea.appendChild(c);
                                    c.classList.add('is-flipped');
                                    c.classList.remove('rest', 'in-life');
                                    c.style.position = 'absolute';
                                });
                                recalcStacking(deckArea);
                                updateSlotCounts();
                                broadcastMyState();
                                sendSystemChat(`️ [規則引擎] 對手將 ${selected.length} 張手牌放回牌組頂端。`);
                                next();
                            }
                        });
                        break;
                    }

                    case 'DISCARD_HAND': {
                        const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
                        if (handCards.length === 0) { next(); break; }
                        this.promptModal({
                            title: `️ 捨棄手牌 (${act.count}張)`,
                            desc: `請選擇 ${act.count} 張我方手牌放置於場外：`,
                            cards: handCards,
                            selectCount: act.count,
                            upTo: false,
                            onConfirm: (selected) => {
                                const outside = document.getElementById('my-outside-area');
                                selected.forEach(c => this.moveCardToZone(c, outside));
                                sendSystemChat(`️ [規則引擎] 對手將 ${selected.length} 張手牌放置於場外。`);
                                next();
                            }
                        });
                        break;
                    }

                    case 'SPECIAL_SUMMON': {
                        const zoneEl = document.getElementById(act.from === 'OUTSIDE' ? 'my-outside-area' : 'my-hand-area');
                        const candidates = Array.from(zoneEl.querySelectorAll('.card')).filter(c => {
                            const d = this.getCardDef(c);
                            if (!d || d.type !== 'CHARACTER') return false;
                            if (act.maxEnergy !== null && (d.requiredEnergy?.count || 0) > act.maxEnergy) return false;
                            if (!this.matchesTargetFilters(c, act)) return false;
                            return true;
                        });
                        if (candidates.length === 0) {
                            showSysMsg(`ℹ️ ${act.from === 'OUTSIDE' ? '場外' : '手牌'}沒有符合特召條件的角色。`);
                            next();
                            break;
                        }
                        this.promptModal({
                            title: `特殊登場：從${act.from === 'OUTSIDE' ? '場外' : '手牌'}選擇角色`,
                            desc: `請選擇最多 1 張角色免費登場至場上空位：`,
                            cards: candidates,
                            selectCount: 1,
                            upTo: true,
                            onConfirm: (selected) => {
                                if (selected.length > 0) {
                                    this.chooseEmptyFieldSlotAndPlace(selected[0], { allowFront: true, allowEnergy: true, enterRest: !!act.enterRest }, (placedSlot) => {
                                        if (placedSlot) {
                                            sendSystemChat(`[規則引擎] 對手藉由效果將【${this.getCardDef(selected[0])?.name}】特殊登場！`);
                                            this.triggerCardAbilities(selected[0], 'ON_PLAY', next);
                                        } else {
                                            next();
                                        }
                                    });
                                } else {
                                    next();
                                }
                            }
                        });
                        break;
                    }

                    case 'MOVE_LINE': {
                        const targets = act.target === 'SELECTED' && taskContext.selectedTargets.length > 0 ? taskContext.selectedTargets : [sourceCardEl];
                        const destSelector = act.toZone === 'FRONT_LINE' ? '#my-front-line .slot' : '#my-energy-line .slot';
                        targets.forEach(t => {
                            const emptySlot = Array.from(document.querySelectorAll(destSelector)).find(s => s.querySelectorAll('.card').length === 0);
                            if (emptySlot && t.parentElement) {
                                const prevSlot = t.parentElement;
                                Array.from(prevSlot.querySelectorAll('.card')).forEach(c => emptySlot.appendChild(c));
                                recalcStacking(emptySlot);
                                showSysMsg(`已將【${this.getCardDef(t)?.name}】移動至${act.toZone === 'FRONT_LINE' ? '前線' : '能源線'}！`);
                            }
                        });
                        next();
                        break;
                    }

                    case 'SET_ACTIVE': {
                        const targets = act.target === 'SELECTED' ? taskContext.selectedTargets : [sourceCardEl];
                        targets.forEach(t => { if (t) t.classList.remove('rest'); });
                        next();
                        break;
                    }

                    case 'SET_REST': {
                        const targets = act.target === 'SELECTED' ? taskContext.selectedTargets : [sourceCardEl];
                        targets.forEach(t => {
                            if (!t) return;
                            t.classList.add('rest');
                            if (t.parentElement?.id.startsWith('opp-') && conn && isConnected) {
                                conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REST_SLOT', slotId: t.parentElement.id.replace('opp-', 'my-') });
                            }
                        });
                        next();
                        break;
                    }

                    case 'FREEZE_TARGET': {
                        const targets = act.target === 'SELECTED' ? taskContext.selectedTargets : [sourceCardEl];
                        targets.forEach(t => {
                            if (!t) return;
                            if (t.parentElement?.id.startsWith('opp-') && conn && isConnected) {
                                conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_FREEZE_SLOT', slotId: t.parentElement.id.replace('opp-', 'my-') });
                            } else if (this.getRuntime(t)) {
                                this.getRuntime(t).frozenNextTurn = true;
                            }
                        });
                        showSysMsg('️ 已對目標賦予「下次起始階段無法轉為活動」效果！');
                        next();
                        break;
                    }

                    case 'RETIRE_TARGET': {
                        const targets = act.target === 'SELECTED' ? taskContext.selectedTargets : [];
                        targets.forEach(t => {
                            if (t.parentElement && t.parentElement.id.startsWith('opp-')) {
                                this.requestRetireOpponentCard(t);
                            } else if (t.parentElement) {
                                this.retireCardFromSlot(t.parentElement);
                            }
                        });
                        next();
                        break;
                    }

                    case 'SEND_TARGET_TO_BOTTOM': {
                        taskContext.selectedTargets.forEach(t => {
                            if (t.parentElement && t.parentElement.id.startsWith('opp-')) {
                                if (conn && isConnected) {
                                    conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_BOTTOM_SLOT', slotId: t.parentElement.id.replace('opp-', 'my-') });
                                } else if (this.isSoloTestMode) {
                                    const oppDeck = document.getElementById('opp-deck-area');
                                    if (oppDeck) {
                                        updateBpDisplay(t.parentElement, 0);
                                        oppDeck.insertBefore(t, oppDeck.firstChild);
                                        t.classList.add('is-flipped'); t.classList.remove('rest');
                                        recalcStacking(oppDeck); updateSlotCounts();
                                    }
                                }
                            }
                        });
                        next();
                        break;
                    }

                    case 'SEND_TARGET_TO_REMOVE': {
                        taskContext.selectedTargets.forEach(t => {
                            if (t.parentElement && t.parentElement.id.startsWith('opp-')) {
                                if (conn && isConnected) {
                                    conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REMOVE_SLOT', slotId: t.parentElement.id.replace('opp-', 'my-') });
                                } else if (this.isSoloTestMode) {
                                    const oppRem = document.getElementById('opp-remove-area');
                                    if (oppRem) {
                                        updateBpDisplay(t.parentElement, 0);
                                        this.moveCardToZone(t, oppRem);
                                    }
                                }
                            }
                        });
                        next();
                        break;
                    }

                    case 'MODIFY_BP': {
                        if (act.target === 'ALL_MY_TRAIT') {
                            document.querySelectorAll('#my-front-line .slot').forEach(slot => {
                                const top = this.getTopCardInSlot(slot);
                                const d = this.getCardDef(top);
                                if (d && (!act.filterTrait || d.traits?.includes(act.filterTrait))) {
                                    this.addSlotBp(slot, act.amount);
                                }
                            });
                            showSysMsg(`️ 我方全體 [${act.filterTrait}] 角色本回合 BP ${act.amount > 0 ? '+' : ''}${act.amount}！`);
                        } else {
                            const targets = act.target === 'SELECTED' ? taskContext.selectedTargets : [sourceCardEl];
                            targets.forEach(t => {
                                if (t && t.parentElement) this.addSlotBp(t.parentElement, act.amount);
                            });
                        }
                        next();
                        break;
                    }

                    case 'GRANT_KEYWORD': {
                        const targets = act.target === 'SELECTED' && taskContext.selectedTargets.length > 0
                            ? taskContext.selectedTargets
                            : [sourceCardEl];
                        targets.forEach(t => {
                            const trt = this.getRuntime(t);
                            if (trt) {
                                trt.tempKeywords[act.keyword] = (trt.tempKeywords[act.keyword] || 0) + act.value;
                                showSysMsg(`已賦予【${this.getCardDef(t)?.name || '角色'}】[${act.keyword} (${act.value})]！`);
                            }
                        });
                        next();
                        break;
                    }

                    case 'GRANT_UNBLOCKABLE_BY_LOW_BP': {
                        const targets = act.target === 'SELECTED' && taskContext.selectedTargets.length > 0
                            ? taskContext.selectedTargets
                            : [sourceCardEl];
                        targets.forEach(t => {
                            const trt = this.getRuntime(t);
                            if (trt) {
                                trt.tempKeywords.UNBLOCKABLE_MAX_BP = act.maxBp;
                                showSysMsg(`【${this.getCardDef(t)?.name}】本回合不會被 BP ${act.maxBp} 以下的角色防禦！`);
                            }
                        });
                        next();
                        break;
                    }

                    case 'BOOST_GENERATED_ENERGY': {
                        if (act.duration === 'TURN' && rt) {
                            rt.tempEnergyBoost.push({ color: act.color, count: act.count });
                            showSysMsg(`【${sourceDef?.name}】本回合產生能源 +${COLOR_NAMES[act.color]}×${act.count}！`);
                        }
                        next();
                        break;
                    }

                    case 'DELAYED_SELF_RETIRE': {
                        if (rt) rt.retireAtEndOfMain = true;
                        showSysMsg(`已排程：【${sourceDef?.name}】將於主要階段結束時自動退場。`);
                        next();
                        break;
                    }

                    case 'ACTIVATE_AP': {
                        this.activateMyApCards(act.count);
                        next();
                        break;
                    }

                    case 'LOOK_TOP_DECK': {
                        const deckArea = document.getElementById('my-deck-area');
                        const outsideArea = document.getElementById('my-outside-area');
                        const removeArea = document.getElementById('my-remove-area');
                        const allDeckCards = Array.from(deckArea.querySelectorAll('.card'));
                        const lookCount = Math.min(act.count, allDeckCards.length);
                        if (lookCount === 0) { next(); break; }

                        const topCards = allDeckCards.slice(allDeckCards.length - lookCount).reverse();

                        if (act.pickUpTo === 0 && act.remainderTo === 'TOP_OR_BOTTOM') {
                            this.promptModal({
                                title: `檢視牌組頂端 ${lookCount} 張`,
                                desc: `你檢視了【${this.getCardDef(topCards[0])?.name}】，請選擇要放回牌組頂部或底部：`,
                                cards: topCards,
                                customButtons: [
                                    {
                                        label: '⬆️ 放回牌組【頂部】',
                                        color: '#4f739e',
                                        onClick: () => {
                                            sendSystemChat(`[規則引擎] 對手檢視牌頂 ${lookCount} 張後，將其放回牌組【頂部】。`);
                                            next();
                                        }
                                    },
                                    {
                                        label: '⬇️ 放回牌組【底部】',
                                        color: '#8d7cc4',
                                        onClick: () => {
                                            topCards.forEach(c => deckArea.insertBefore(c, deckArea.firstChild));
                                            recalcStacking(deckArea);
                                            sendSystemChat(`[規則引擎] 對手檢視牌頂 ${lookCount} 張後，將其放到牌組【底部】。`);
                                            next();
                                        }
                                    }
                                ]
                            });
                            break;
                        }

                        const isPickOutside = act.pickAction === 'OUTSIDE';
                        const remDestLabel = act.remainderTo === 'OUTSIDE' ? '場外' : (act.remainderTo === 'TOP' ? '牌組頂端' : (act.remainderTo === 'REMOVE' ? '移除區' : '牌組底部'));
                        const traitList = act.filterTraits?.length ? act.filterTraits : (act.filterTrait ? [act.filterTrait] : []);
                        const nameList = act.filterNames?.length ? act.filterNames : (act.filterName ? [act.filterName] : []);

                        this.promptModal({
                            title: `檢索牌組頂端 ${lookCount} 張`,
                            desc: `請點選${act.upTo !== false ? '最多' : ''} ${act.pickUpTo} 張${traitList.length ? `［特徴：${traitList.join('/')}］` : ''}${nameList.length ? `〈${nameList.join('/')}〉` : ''}卡片${isPickOutside ? '放置於【場外】' : '加入【手牌】'}，其餘卡片將自動置於【${remDestLabel}】：`,
                            cards: topCards,
                            cardFilterFn: (c) => {
                                const d = this.getCardDef(c);
                                if (!d) return false;
                                if (traitList.length > 0 || nameList.length > 0) {
                                    const matchTrait = traitList.some(t => d.traits && d.traits.includes(t));
                                    const matchName = nameList.some(n => d.name && d.name.includes(n));
                                    return matchTrait || matchName;
                                }
                                return true;
                            },
                            selectCount: act.pickUpTo,
                            upTo: act.upTo !== false,
                            onConfirm: (picked) => {
                                const handArea = document.getElementById('my-hand-area');
                                picked.forEach(c => {
                                    if (isPickOutside) {
                                        this.moveCardToZone(c, outsideArea);
                                        sendSystemChat(`️ [牌頂堆墓] 對手從牌頂將【${this.getCardDef(c)?.name}】放置於場外！`);
                                    } else {
                                        this.moveCardToZone(c, handArea);
                                        sendSystemChat(`[公開檢索] 對手從牌頂檢索並公開了【${this.getCardDef(c)?.name}】加入手牌！`);
                                    }
                                });
                                const restCards = topCards.filter(c => !picked.includes(c));
                                if (!isPickOutside) taskContext.addedFromLook = picked.length > 0;
                                if (act.remainderTo === 'OUTSIDE') {
                                    restCards.forEach(c => this.moveCardToZone(c, outsideArea));
                                    recalcStacking(deckArea);
                                    next();
                                } else if (act.remainderTo === 'REMOVE') {
                                    restCards.forEach(c => this.moveCardToZone(c, removeArea));
                                    recalcStacking(deckArea);
                                    next();
                                } else if (act.remainderTo === 'TOP') {
                                    this.promptOrderCardsToDeck(restCards, 'TOP', next);
                                } else {
                                    this.promptOrderCardsToDeck(restCards, 'BOTTOM', next);
                                }
                            }
                        });
                        break;
                    }

                    case 'RECOVER_FROM_OUTSIDE': {
                        const outsideCards = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                            const d = this.getCardDef(c);
                            if (!d || d.type !== 'CHARACTER') return false;
                            if (!this.matchesTargetFilters(c, act)) return false;
                            return true;
                        });
                        if (outsideCards.length === 0) {
                            showSysMsg('ℹ️ 場外目前沒有可回收的角色卡。');
                            next();
                            break;
                        }
                        this.promptModal({
                            title: `️ 從場外回收角色卡`,
                            desc: `請選擇最多 ${act.count} 張場外的角色卡加入手牌：`,
                            cards: outsideCards,
                            selectCount: act.count,
                            upTo: true,
                            onConfirm: (selected) => {
                                const hand = document.getElementById('my-hand-area');
                                selected.forEach(c => {
                                    this.moveCardToZone(c, hand);
                                    sendSystemChat(`️ [規則引擎] 對手從場外回收了【${this.getCardDef(c)?.name}】至手牌。`);
                                });
                                next();
                            }
                        });
                        break;
                    }

                    case 'BOUNCE_TO_HAND': {
                        if (act.target === 'SELECTED' && taskContext.selectedTargets.length > 0) {
                            taskContext.selectedTargets.forEach(t => {
                                if (t.parentElement && t.parentElement.id.startsWith('opp-')) {
                                    this.requestBounceOpponentCard(t);
                                } else if (t.parentElement) {
                                    this.bounceSlotTopCardToHand(t.parentElement);
                                }
                            });
                            next();
                            break;
                        }

                        const otherCandidates = this.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                            if (c === sourceCardEl) return false;
                            const d = this.getCardDef(c);
                            return d && d.type === 'CHARACTER' && (!act.maxRequiredEnergy || d.requiredEnergy.count <= act.maxRequiredEnergy);
                        });

                        const hand = document.getElementById('my-hand-area');
                        if (otherCandidates.length === 0) {
                            if (act.selfFallback) {
                                showSysMsg(`️ 場上無其他符合條件的角色，【${sourceDef?.name}】依效果返回手牌！`);
                                this.moveCardToZone(sourceCardEl, hand);
                            }
                            next();
                            break;
                        }

                        this.promptModal({
                            title: `️ 選擇彈回手牌的角色`,
                            desc: `請選擇 1 張我方場上必要能源 ${act.maxRequiredEnergy} 以下的其他角色返回手牌：`,
                            cards: otherCandidates,
                            selectCount: 1,
                            upTo: false,
                            onConfirm: (selected) => {
                                if (selected.length > 0) this.bounceSlotTopCardToHand(selected[0].parentElement);
                                next();
                            }
                        });
                        break;
                    }

                    // 🌟 遇到複雜專屬句型時，改為非阻塞提示並直接交回控制權讓玩家手動操作，不再彈出大視窗打斷對戰
                    case 'INTERACTIVE_FALLBACK': {
                        const cname = sourceDef?.name || '此卡';
                        showSysMsg(`ℹ️ 【${cname}】含進階效果，請直接在牌桌手動處理`);
                        this.recordLog(`MANUAL_SKIP: ${cname} -> ${act.rawSentence}`);
                        next();
                        break;
                    }

                    default:
                        next();
                        break;
                }
            } catch (err) {
                const actionType = act && typeof act.type === 'string' ? act.type : 'UNKNOWN';
                const errMsg = `效果執行異常 (${actionType}): ${err?.message || err}`;
                console.warn('⚠️ [UARuleEngine Caught Error]', errMsg);
                if (typeof this.recordLog === 'function') {
                    this.recordLog(`ERROR: ${errMsg}`);
                }
                if (this.lastExecutedContext) {
                    this.lastExecutedContext.lastError = errMsg;
                }
                showSysMsg(`️ ${errMsg}，已自動切換為手動輔助結算！`);
                this.openInteractiveFallbackModal(
                    sourceCardEl,
                    {
                        type: 'INTERACTIVE_FALLBACK',
                        rawSentence: (act && typeof act.rawSentence === 'string' ? act.rawSentence : `[動作異常: ${actionType}] ${err?.message || ''}`)
                    },
                    taskContext,
                    next
                );
            }
        }
        openInteractiveFallbackModal(sourceCardEl, act, taskContext, onDone) {
            const sourceDef = this.getCardDef(sourceCardEl);
            const cardName = this.getDisplayName(sourceDef) || '卡片';
            const fullEffect = this.getDisplayEffectText(sourceDef) || act.rawSentence || '';

            const reopenSelf = () => this.openInteractiveFallbackModal(sourceCardEl, act, taskContext, onDone);

            this.promptModal({
                title: `️ 手動輔助結算：【${cardName}】 (${sourceDef?.id || ''})`,
                desc: `【當前待結算子句】\n「${act.rawSentence}」\n\n【卡片完整效果原文】\n${fullEffect}`,
                cards: sourceCardEl ? [sourceCardEl] : [],
                customButtons: [
                    {
                        label: '✅ 已手動處理完成',
                        color: '#2ecc71',
                        onClick: () => {
                            showSysMsg(`️ 【${cardName}】此效果為手動處理`);
                            sendSystemChat(`️ [手動處理] 【${cardName}】的效果（「${act.rawSentence}」）此效果為手動處理。`);
                            onDone();
                        }
                    },
                    {
                        label: '⏭️ 略過',
                        color: '#7f8c8d',
                        onClick: () => {
                            showSysMsg(`⏭️ 已略過【${cardName}】的子效果`);
                            onDone();
                        }
                    },
                    {
                        label: '🐞 複製錯誤回報',
                        color: '#d35400',
                        onClick: () => {
                            this.copyBugReportToClipboard(sourceCardEl);
                            reopenSelf();
                        }
                    }
                ]
            });

            const actionsBox = document.getElementById('ua-prompt-actions');
            const modal = document.getElementById('ua-prompt-modal');
            if (!actionsBox || !modal) return;

            const oldToolbox = document.getElementById('ua-fallback-toolbox');
            if (oldToolbox) oldToolbox.remove();

            const toolbox = document.createElement('div');
            toolbox.id = 'ua-fallback-toolbox';
            toolbox.style.cssText = `
                width: 100%; background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(0, 255, 204, 0.35);
                border-radius: 10px; padding: 12px; margin-bottom: 14px; display: flex;
                flex-direction: column; gap: 10px; box-sizing: border-box; text-align: left;
            `;

            const inputStyle = `width: 52px; padding: 4px 6px; border-radius: 4px; border: 1px solid #6c93c7; background: #1c1f36; color: #fff; font-weight: bold; text-align: center;`;
            const selectStyle = `padding: 4px 6px; border-radius: 4px; border: 1px solid #6c93c7; background: #1c1f36; color: #fff; font-weight: bold;`;
            const rowStyle = `display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px;`;

            toolbox.innerHTML = `
                <div style="color:#00ffcc; font-weight:bold; font-size:13px; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:4px;">
                    🧰 通用效果調整工具（執行後可繼續操作，完成後請點下方「已手動處理完成」）
                </div>
                <div style="${rowStyle}">
                    <span>🃏 抽牌：</span>
                    <input id="fb-draw-n" type="number" min="1" max="10" value="1" style="${inputStyle}">
                    <span>張</span>
                    <button id="fb-btn-draw" class="ctrl-btn" style="background:#4f9678;">執行抽牌</button>
                    <span style="margin-left:10px;">🔍 看牌頂：</span>
                    <input id="fb-look-n" type="number" min="1" max="10" value="3" style="${inputStyle}">
                    <span>張</span>
                    <button id="fb-btn-look" class="ctrl-btn" style="background:#6c93c7;">檢視/排序牌頂</button>
                </div>
                <div style="${rowStyle}">
                    <span>⚔️ 選目標 BP：</span>
                    <select id="fb-bp-owner" style="${selectStyle}">
                        <option value="MY">我方前線</option>
                        <option value="OPP">對手前線</option>
                    </select>
                    <input id="fb-bp-val" type="number" step="500" value="1000" style="width:76px; padding:4px 6px; border-radius:4px; border:1px solid #e67e22; background:#1c1f36; color:#fff; font-weight:bold; text-align:center;">
                    <button id="fb-btn-bp" class="ctrl-btn" style="background:#e67e22;">選目標改 BP</button>
                    <button id="fb-btn-bp-neg" class="ctrl-btn" style="background:#c1596f;">選目標 -BP</button>
                </div>
                <div style="${rowStyle}">
                    <span>🔄 卡片移動：</span>
                    <select id="fb-move-src" style="${selectStyle}">
                        <option value="OPP_FIELD">對手場上角色</option>
                        <option value="MY_FIELD">我方場上角色</option>
                        <option value="MY_HAND">我方手牌</option>
                        <option value="MY_OUTSIDE">我方場外</option>
                    </select>
                    <span>➔</span>
                    <select id="fb-move-dest" style="${selectStyle}">
                        <option value="RETIRE">退場 (送場外)</option>
                        <option value="HAND">返回/加入手牌</option>
                        <option value="OUTSIDE">放置於場外</option>
                    </select>
                    <button id="fb-btn-move" class="ctrl-btn" style="background:#8d7cc4;">選擇卡片移動</button>
                </div>
            `;

            actionsBox.parentNode.insertBefore(toolbox, actionsBox);

            // 1. 抽牌 N 張
            toolbox.querySelector('#fb-btn-draw').onclick = () => {
                const n = Math.max(1, parseInt(toolbox.querySelector('#fb-draw-n').value, 10) || 1);
                this.drawCards(n);
                showSysMsg(`️ [手動處理] 抽取了 ${n} 張牌`);
                sendSystemChat(`️ [手動處理] 對手因【${cardName}】效果抽取了 ${n} 張牌（此效果為手動處理）。`);
            };

            // 2. 看牌頂 N 張
            toolbox.querySelector('#fb-btn-look').onclick = () => {
                const n = Math.max(1, parseInt(toolbox.querySelector('#fb-look-n').value, 10) || 1);
                modal.style.display = 'none';
                toolbox.remove();
                this.executeAbilityActions(
                    sourceCardEl,
                    [{ type: 'LOOK_AND_ARRANGE_TOP', count: n, keepUpTo: n, remainderTo: 'BOTTOM' }],
                    0,
                    taskContext,
                    reopenSelf
                );
            };

            // 3. 選目標 BP ±N
            const triggerBpSelect = (sign = 1) => {
                const owner = toolbox.querySelector('#fb-bp-owner').value;
                const rawVal = parseInt(toolbox.querySelector('#fb-bp-val').value, 10) || 1000;
                const amount = sign < 0 ? -Math.abs(rawVal) : rawVal;
                modal.style.display = 'none';
                toolbox.remove();
                this.executeAbilityActions(
                    sourceCardEl,
                    [
                        { type: 'SELECT_TARGET', owner, zone: 'FRONT_LINE', count: 1, upTo: true },
                        { type: 'MODIFY_BP', amount, target: 'SELECTED' }
                    ],
                    0,
                    { ...taskContext, selectedTargets: [] },
                    reopenSelf
                );
            };
            toolbox.querySelector('#fb-btn-bp').onclick = () => triggerBpSelect(1);
            toolbox.querySelector('#fb-btn-bp-neg').onclick = () => triggerBpSelect(-1);

            // 4. 退場 / 手牌 / 場外移動
            toolbox.querySelector('#fb-btn-move').onclick = () => {
                const src = toolbox.querySelector('#fb-move-src').value;
                const dest = toolbox.querySelector('#fb-move-dest').value;
                let candidates = [];
                if (src === 'OPP_FIELD') candidates = this.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot');
                else if (src === 'MY_FIELD') candidates = this.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
                else if (src === 'MY_HAND') candidates = Array.from(document.querySelectorAll('#my-hand-area .card'));
                else if (src === 'MY_OUTSIDE') candidates = Array.from(document.querySelectorAll('#my-outside-area .card'));

                if (candidates.length === 0) {
                    showSysMsg('ℹ️ 該來源區域目前沒有可選擇的卡片。');
                    return;
                }

                toolbox.remove();
                this.promptModal({
                    title: `手動選擇卡片移動 (${src} ➔ ${dest})`,
                    desc: `請點選 1 張目標卡片執行【${dest === 'RETIRE' ? '退場' : (dest === 'HAND' ? '移至手牌' : '移至場外')}】：`,
                    cards: candidates,
                    selectCount: 1,
                    upTo: true,
                    onConfirm: (selected) => {
                        if (selected.length > 0) {
                            const target = selected[0];
                            if (src === 'OPP_FIELD') {
                                if (dest === 'HAND') this.requestBounceOpponentCard(target);
                                else this.requestRetireOpponentCard(target);
                            } else if (src === 'MY_FIELD') {
                                if (dest === 'HAND') this.bounceSlotTopCardToHand(target.parentElement);
                                else this.retireCardFromSlot(target.parentElement);
                            } else {
                                const zoneEl = document.getElementById(dest === 'HAND' ? 'my-hand-area' : 'my-outside-area');
                                this.moveCardToZone(target, zoneEl);
                            }
                            showSysMsg(`️ 【${cardName}】此效果為手動處理`);
                            sendSystemChat(`️ [手動處理] 對手透過【${cardName}】移動了卡片（此效果為手動處理）。`);
                        }
                        reopenSelf();
                    }
                });
            };
        }
        // ==================== 戰鬥與生命區 Trigger ====================

        getEffectiveCardBp(cardEl) {
            const def = this.getCardDef(cardEl);
            if (!def || !def.bp) return 0;
            const slot = cardEl.parentElement;
            const tracker = slot ? slot.querySelector('.bp-tracker') : null;
            const mod = tracker ? (parseInt(tracker.dataset.bp, 10) || 0) : 0;
            const script = this.getCardScript(cardEl);
            const rtBp = this.getRuntime(cardEl);
            const raidBpOk = !script?.requireRaided || !!rtBp?.isRaided;
            const scriptBonus = (script && raidBpOk && typeof script.getContinuousBpBonus === 'function') ? (script.getContinuousBpBonus(this, cardEl) || 0) : 0;
            return Math.max(0, def.bp + mod + scriptBonus);
        }

        addSlotBp(slot, delta) {
            if (!slot) return;
            const tracker = slot.querySelector('.bp-tracker');
            if (!tracker) return;
            const newBp = (parseInt(tracker.dataset.bp, 10) || 0) + delta;
            updateBpDisplay(slot, newBp);

            const topCard = this.getTopCardInSlot(slot);
            if (topCard && this.getEffectiveCardBp(topCard) <= 0) {
                showSysMsg(`【${this.getCardDef(topCard)?.name}】因 BP 降至 0 以下而退場！`);
                if (slot.id.startsWith('my-')) {
                    this.retireCardFromSlot(slot);
                } else if (conn && isConnected) {
                    const localSlotId = slot.id.replace('opp-', 'my-');
                    conn.send({ type: 'UPDATE_OPP_BP', slotId: localSlotId, bp: newBp });
                    conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_RETIRE_SLOT', slotId: localSlotId });
                } else if (this.isSoloTestMode) {
                    this.requestRetireOpponentCard(topCard);
                }
                return;
            }

            if (slot.id.startsWith('opp-') && conn && isConnected) {
                conn.send({ type: 'UPDATE_OPP_BP', slotId: slot.id.replace('opp-', 'my-'), bp: newBp });
            }
            broadcastMyState();
        }

        promptSnipeTarget(attackerSlot, attackerCard) {
            const oppFrontCards = this.getSlotTopCards('#opp-front-line .slot');
            if (oppFrontCards.length === 0) {
                showSysMsg('對手前線沒有角色可供狙擊！');
                return;
            }
            this.promptModal({
                title: `發動 [狙い撃ち (狙擊)]`,
                desc: `請選擇對手前線 1 張角色進行指定攻擊（對手無法使用其他角色防禦，且不觸發防禦時效果）：`,
                cards: oppFrontCards,
                selectCount: 1,
                upTo: false,
                onConfirm: (selected) => {
                    if (selected.length > 0) this.declareAttack(attackerSlot, attackerCard, selected[0].parentElement);
                }
            });
        }

// 嚴格白名單驗證：只允許合法的前線與能源線卡槽 ID
        isValidMySlotId(slotId) {
            return typeof slotId === 'string' && /^my-(fl|en)-[1-4]$/.test(slotId);
        }

        isValidOppSlotId(slotId) {
            return typeof slotId === 'string' && /^opp-(fl|en)-[1-4]$/.test(slotId);
        }

        clearCombatLock() {
            if (this.combatTimeoutId) {
                clearTimeout(this.combatTimeoutId);
                this.combatTimeoutId = null;
            }
            this.combatState = null;
            this.updateEnergyHUD();
        }

        declareAttack(attackerSlot, attackerCard, snipedOppSlot = null) {
            if (this.waitingForOppTrigger) {
                showSysMsg('對手正在處理生命觸發效果，請稍候！');
                return;
            }
            if (this.combatState) {
                showSysMsg('請等待當前攻擊結算完成！');
                return;
            }

            const def = this.getCardDef(attackerCard);
            const rt = this.getRuntime(attackerCard);

            attackerCard.classList.add('rest');
            rt.attackCountThisTurn++;

            const innateAtkKw = this.getInnateStaticKeywords(def);
            if ((innateAtkKw.doubleAttack || rt.tempKeywords?.DOUBLE_ATTACK) && rt.attackCountThisTurn === 1) {
                attackerCard.classList.remove('rest');
                showSysMsg(`發動 [2回アタック]：【${def.name}】在第一次攻擊時重新轉為活動狀態！`);
            }

            // 等待 [アタック時] 效果（含選發彈窗與 BP 加成）全部結算完畢後，再計算最終 BP 並送出攻擊宣告
            this.triggerCardAbilities(attackerCard, 'ON_ATTACK', () => {
                broadcastMyState();

                const atkBp = this.getEffectiveCardBp(attackerCard);

                if (snipedOppSlot) {
                    const targetCard = this.getTopCardInSlot(snipedOppSlot);
                    sendSystemChat(`[戰鬥] 對手的【${def.name} (BP ${atkBp})】對你的【${this.getCardDef(targetCard)?.name}】發動了狙擊！`);
                    this.resolveCharacterBattle(attackerSlot, attackerCard, snipedOppSlot, targetCard);
                    return;
                }

                sendSystemChat(`️ [戰鬥] 【${def.name} (BP ${atkBp})】向對手玩家宣告攻擊！`);
                if (conn && isConnected) {
                    const attackId = 'atk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                    this.combatState = {
                        attackId,
                        attackerSlotId: attackerSlot.id,
                        attackerNetId: attackerCard.dataset.networkId
                    };
                    this.updateEnergyHUD();

                    // 設定 25 秒防卡死逾時保護：若對手斷線或關閉視窗未回應，自動解除鎖定
                    this.combatTimeoutId = setTimeout(() => {
                        if (this.combatState && this.combatState.attackId === attackId) {
                            showSysMsg('️ 對手逾時未回應防禦，已自動解除戰鬥等待鎖定。');
                            this.clearCombatLock();
                        }
                    }, 25000);

                    conn.send({
                        type: 'ENGINE_EVENT',
                        subType: 'ATTACK_DECLARED',
                        attackId,
                        attackerName: def.name,
                        attackerBp: atkBp,
                        unblockableMaxBp: rt.tempKeywords.UNBLOCKABLE_MAX_BP || 0
                    });
                    showSysMsg('等待對手選擇是否進行防禦 (Block)...');
                } else if (this.isSoloTestMode) {
                    const unblockMax = rt.tempKeywords.UNBLOCKABLE_MAX_BP || 0;
                    const oppBlockers = this.getSlotTopCards('#opp-front-line .slot').filter(c => {
                        if (c.classList.contains('rest')) return false;
                        if (unblockMax && this.getEffectiveCardBp(c) <= unblockMax) return false;
                        return true;
                    });
                    if (oppBlockers.length === 0) {
                        if (unblockMax > 0) showSysMsg(`[測試] 對手沒有 BP 超過 ${unblockMax} 的可防禦角色，直接命中生命！`);
                        this.inflictPlayerDamage(attackerCard);
                    } else {
                        this.promptModal({
                            title: `【測試】模擬對手防禦：${this.getDisplayName(def)} (BP ${atkBp})`,
                            desc: `請選擇對手前線 1 張角色進行防禦（測試比 BP 與衝擊），或點擊「不防禦（直擊生命）」：` + (unblockMax ? `
（已自動過濾 BP ${unblockMax} 以下不可防禦的角色）` : ''),
                            cards: oppBlockers,
                            selectCount: 1,
                            upTo: true,
                            customButtons: [{
                                label: '不防禦（直擊生命）',
                                color: '#c1596f',
                                onClick: () => this.inflictPlayerDamage(attackerCard)
                            }],
                            onConfirm: (selected) => {
                                if (selected.length === 0) {
                                    this.inflictPlayerDamage(attackerCard);
                                    return;
                                }
                                const defCard = selected[0];
                                defCard.classList.add('rest');
                                this.resolveCharacterBattle(attackerSlot, attackerCard, defCard.parentElement, defCard);
                            }
                        });
                    }
                } else {
                    this.inflictPlayerDamage(attackerCard);
                }
            });
        }

        onOpponentAttackDeclared(data) {
            if (!this.enabled) return;

            const blockers = this.getSlotTopCards('#my-front-line .slot').filter(c => {
                if (c.classList.contains('rest')) return false;
                if (data.unblockableMaxBp && this.getEffectiveCardBp(c) <= data.unblockableMaxBp) return false;
                return true;
            });

            this.promptModal({
                title: `防禦確認：${data.attackerName} (BP ${data.attackerBp})`, 
                desc: blockers.length > 0
                    ? `請點選 1 張我方前線活動的角色進行【防禦 (Block)】，或點擊下方「不防禦（承受生命傷害）」：`
                    : `我方前線目前沒有可進行防禦的角色，請點擊下方按鈕承受傷害並翻開生命區 Trigger：`,
                cards: blockers,
                selectCount: 1,
                upTo: true,
                customButtons: [
                    {
                        label: '不防禦（承受傷害）',
                        color: '#c1596f',
                        onClick: () => {
                            if (conn && isConnected) {
                                conn.send({ type: 'ENGINE_EVENT', subType: 'BLOCK_RESPONSE', attackId: data.attackId, blocked: false });
                            } else if (this.isSoloTestMode) {
                                this.processMyLifeDamage(data.damage || 1);
                            }
                        }
                    }
                ],
                onConfirm: (selected) => {
                    if (selected.length === 0) {
                        if (conn && isConnected) {
                            conn.send({ type: 'ENGINE_EVENT', subType: 'BLOCK_RESPONSE', attackId: data.attackId, blocked: false });
                        } else if (this.isSoloTestMode) {
                            this.processMyLifeDamage(data.damage || 1);
                        }
                        return;
                    }
                    const blockerCard = selected[0];
                    const blockerSlot = blockerCard.parentElement;
                    const bDef = this.getCardDef(blockerCard);
                    const bRt = this.getRuntime(blockerCard);

                    blockerCard.classList.add('rest');
                    bRt.blockCountThisTurn++;

                    const innateBlkKw = this.getInnateStaticKeywords(bDef);
                    if ((innateBlkKw.doubleBlock || bRt.tempKeywords?.DOUBLE_BLOCK) && bRt.blockCountThisTurn === 1) {
                        blockerCard.classList.remove('rest');
                        showSysMsg(`發動 [2回ブロック]：【${this.getDisplayName(bDef)}】防禦後重新轉為活動狀態！`);
                    }

                    this.triggerCardAbilities(blockerCard, 'ON_BLOCK', () => {
                        broadcastMyState();
                        const finalBlockerBp = this.getEffectiveCardBp(blockerCard);
                        if (conn && isConnected) {
                            conn.send({
                                type: 'ENGINE_EVENT',
                                subType: 'BLOCK_RESPONSE',
                                attackId: data.attackId,
                                blocked: true,
                                blockerSlotId: blockerSlot.id.replace('my-', 'opp-'),
                                blockerBp: finalBlockerBp
                            });
                        } else if (this.isSoloTestMode) {
                            if (finalBlockerBp > data.attackerBp) {
                                showCenterAlert('🛡️', '防禦成功！', `${finalBlockerBp} vs ${data.attackerBp}`, '#6fb897');
                                showSysMsg(`[測試] 【${this.getDisplayName(bDef)} (BP ${finalBlockerBp})】成功擋下攻擊！`);
                            } else {
                                showCenterAlert('⚔️', '防禦角色退場', `${data.attackerBp} vs ${finalBlockerBp}`, '#c1596f');
                                this.retireCardFromSlot(blockerSlot);
                                if (data.impact > 0 && !innateBlkKw.impactNullify) {
                                    showSysMsg(`[測試] 對手發動衝擊(${data.impact})，承受 ${data.impact} 點生命傷害！`);
                                    this.processMyLifeDamage(data.impact);
                                }
                            }
                            this.updateEnergyHUD();
                        }
                    });
                }
            });
        }

        resolveCharacterBattle(attackerSlot, attackerCard, defenderOppSlot, defenderCard, reportedDefBp = null) {
            const atkBp = this.getEffectiveCardBp(attackerCard);
            const defBp = (typeof reportedDefBp === 'number' && !isNaN(reportedDefBp)) ? reportedDefBp : this.getEffectiveCardBp(defenderCard);
            const atkDef = this.getCardDef(attackerCard);
            const defDef = this.getCardDef(defenderCard);

            if (atkBp >= defBp) {
                showCenterAlert('⚔️', '對戰獲勝！', `${atkBp} vs ${defBp}`, '#6fb897');
                this.requestRetireOpponentCard(defenderCard);

                const defenderNullifiesImpact = this.getInnateStaticKeywords(defDef).impactNullify;
                if (!defenderNullifiesImpact) {
                    const impactDmg = this.getCardImpactValue(attackerCard);
                    if (impactDmg > 0) {
                        sendSystemChat(`[衝擊發動] 【${atkDef.name}】對戰獲勝，發動 [インパクト (${impactDmg})] 造成對手 ${impactDmg} 點傷害！`);
                        this.sendDamageToOpponent(impactDmg);
                    }
                }
            } else {
                showCenterAlert('🛡️', '攻擊被擋下', `${atkBp} vs ${defBp}`, '#c1596f');
                sendSystemChat(`️ [戰鬥結果] 對手的防禦角色（BP ${defBp}）擋下了【${atkDef.name}（BP ${atkBp}）】的攻擊！（依規則攻擊方不退場）`);
            }
            this.updateEnergyHUD();
            broadcastMyState();
        }

        getCardImpactValue(cardEl) {
            const def = this.getCardDef(cardEl);
            const rt = this.getRuntime(cardEl);
            let baseImpact = this.getInnateStaticKeywords(def).impact;

            const script = this.getCardScript(cardEl);
            const raidImpOk = !script?.requireRaided || !!rt?.isRaided;
            if (script && raidImpOk && typeof script.getContinuousImpact === 'function') {
                baseImpact = Math.max(baseImpact, script.getContinuousImpact(this, cardEl) || 0);
            }
            if (rt?.persistentKeywords?.IMPACT) baseImpact = Math.max(baseImpact, rt.persistentKeywords.IMPACT);
            if (rt?.tempKeywords?.IMPACT) baseImpact = Math.max(baseImpact, rt.tempKeywords.IMPACT);
            if (rt?.tempKeywords?.IMPACT_PLUS) baseImpact += rt.tempKeywords.IMPACT_PLUS;
            return baseImpact;
        }

        getCardDamageValue(cardEl) {
            const def = this.getCardDef(cardEl);
            const rt = this.getRuntime(cardEl);
            let dmg = 1;
            if (def?.compiledRules?.staticKeywords?.damage) {
                const v = def.compiledRules.staticKeywords.damage;
                if (!String(v).startsWith('+')) dmg = parseInt(v, 10) || 1;
                else dmg += parseInt(v, 10) || 0;
            }
            if (rt?.tempKeywords?.DAMAGE) dmg = Math.max(dmg, rt.tempKeywords.DAMAGE);
            if (rt?.tempKeywords?.DAMAGE_PLUS) dmg += rt.tempKeywords.DAMAGE_PLUS;
            return dmg;
        }

        inflictPlayerDamage(attackerCard) {
            const dmg = this.getCardDamageValue(attackerCard);
            sendSystemChat(`[直擊傷害] 【${this.getCardDef(attackerCard)?.name}】對玩家造成 ${dmg} 點傷害！`);
            this.sendDamageToOpponent(dmg);
            const script = this.getCardScript(attackerCard);
            if (script && typeof script.onUnblockedAttack === 'function') {
                script.onUnblockedAttack(this, attackerCard, () => {
                    this.updateEnergyHUD();
                    broadcastMyState();
                });
            }
        }

        sendDamageToOpponent(damageCount) {
            if (conn && isConnected) {
                this.waitingForOppTrigger = true;
                if (this.oppTriggerTimeoutId) clearTimeout(this.oppTriggerTimeoutId);
                this.oppTriggerTimeoutId = setTimeout(() => {
                    this.waitingForOppTrigger = false;
                    this.updateEnergyHUD();
                }, 30000);
                this.updateEnergyHUD();
                showSysMsg('對手正在處理生命觸發效果...');
                conn.send({ type: 'ENGINE_EVENT', subType: 'TAKE_LIFE_DAMAGE', count: damageCount });
            } else if (this.isSoloTestMode) {
                const oppLife = document.getElementById('opp-life-area');
                const oppOut = document.getElementById('opp-outside-area');
                if (oppLife && oppOut) {
                    const cards = Array.from(oppLife.querySelectorAll('.card'));
                    const n = Math.min(Math.max(1, parseInt(damageCount, 10) || 1), cards.length);
                    for (let i = 0; i < n; i++) this.moveCardToZone(cards.pop(), oppOut);
                    showSysMsg(`[測試] 對假敵人造成 ${damageCount} 點傷害（剩餘生命 ${oppLife.querySelectorAll('.card').length}）`);
                }
            }
        }

        processMyLifeDamage(damageCount) {
            const safeCount = Math.max(1, Math.min(7, parseInt(damageCount, 10) || 1));
            const lifeArea = document.getElementById('my-life-area');
            const lifeCards = Array.from(lifeArea.querySelectorAll('.card'));
            if (lifeCards.length === 0) {
                if (conn && isConnected) conn.send({ type: 'ENGINE_EVENT', subType: 'TRIGGER_RESOLUTION_DONE' });
                return;
            }

            const flipCount = Math.min(safeCount, lifeCards.length);
            const flippedCards = [];
            for (let i = 0; i < flipCount; i++) {
                const c = lifeCards.pop();
                c.classList.remove('is-flipped', 'in-life');
                flippedCards.push(c);
            }

            this.resolveTriggerSequence(flippedCards, () => {
                if (conn && isConnected) {
                    conn.send({ type: 'ENGINE_EVENT', subType: 'TRIGGER_RESOLUTION_DONE' });
                }
                if (lifeArea.querySelectorAll('.card').length === 0) {
                    alert('💀 我方生命區已歸零，本局對戰落敗！');
                    sendSystemChat('[規則引擎] 對手生命區歸零，恭喜你獲得對戰勝利！');
                }
            });
        }

        resolveTriggerSequence(cards, onComplete) {
            if (cards.length === 0) {
                if (onComplete) onComplete();
                this.updateEnergyHUD();
                broadcastMyState();
                return;
            }

            const cardEl = cards.shift();
            const def = this.getCardDef(cardEl);
            const trig = def?.compiledRules?.trigger;
            const outsideArea = document.getElementById('my-outside-area');

            const cardImgUrl = cardEl.querySelector('.card-front img')?.src || def?.imageUrl || '';
            if (!trig && (!def?.triggerText || def.triggerText === '-')) {
                this.moveCardToZone(cardEl, outsideArea);
                sendSystemChat(`️ [生命觸發確認] 翻開【${def?.name || '卡片'}】（無 Trigger），放置於場外。`);
                if (conn && isConnected) {
                    conn.send({ type: 'ENGINE_EVENT', subType: 'OPP_TRIGGER_REVEAL', cardName: def?.name || '卡片', imageUrl: cardImgUrl, triggerText: '無 Trigger', activated: false });
                }
                this.resolveTriggerSequence(cards, onComplete);
                return;
            }

            const trigType = trig?.type || 'TRIGGER';
            if (conn && isConnected) {
                conn.send({ type: 'ENGINE_EVENT', subType: 'OPP_TRIGGER_REVEAL', cardName: def.name, imageUrl: cardImgUrl, triggerText: def.triggerText || trigType, activated: null });
            }
            this.promptModal({
                title: `觸發確認：${this.getDisplayName(def)}`, 
                desc: `翻開了帶有觸發效果的卡片：\n${this.getDisplayTriggerText(def)}\n\n請問是否要發動此 Trigger 效果？`,
                cards: [cardEl],
                customButtons: [
                    {
                        label: `發動 [${trigType}] 觸發`, 
                        color: '#2ecc71',
                        onClick: () => {
                            if (conn && isConnected) {
                                conn.send({ type: 'ENGINE_EVENT', subType: 'OPP_TRIGGER_REVEAL', cardName: def.name, imageUrl: cardImgUrl, triggerText: def.triggerText || trigType, activated: true });
                            }
                            this.executeTriggerEffect(cardEl, def, { type: trigType }, () => {
                                this.resolveTriggerSequence(cards, onComplete);
                            });
                        }
                    },
                    {
                        label: '不發動（置於場外）',
                        color: '#7f8c8d',
                        onClick: () => {
                            if (conn && isConnected) {
                                conn.send({ type: 'ENGINE_EVENT', subType: 'OPP_TRIGGER_REVEAL', cardName: def.name, imageUrl: cardImgUrl, triggerText: def.triggerText || trigType, activated: false });
                            }
                            this.moveCardToZone(cardEl, outsideArea);
                            this.resolveTriggerSequence(cards, onComplete);
                        }
                    }
                ]
            });
        }

        executeTriggerEffect(cardEl, def, trig, callback) {
            const outsideArea = document.getElementById('my-outside-area');
            const handArea = document.getElementById('my-hand-area');

            if (trig.type === 'GET' || def.triggerText?.includes('[ゲット]')) {
                this.moveCardToZone(cardEl, handArea);
                sendSystemChat(`[Trigger: GET] 對手將生命區的【${def.name}】加入手牌！`);
                callback();
                return;
            }
            if (trig.type === 'DRAW' || def.triggerText?.includes('[ドロー]')) {
                this.moveCardToZone(cardEl, outsideArea);
                this.drawCards(1);
                sendSystemChat(`[Trigger: DRAW] 對手發動抽牌觸發，抽取了 1 張卡！`);
                callback();
                return;
            }
            if (trig.type === 'FINAL' || def.triggerText?.includes('[ファイナル]')) {
                this.moveCardToZone(cardEl, outsideArea);
                const lifeArea = document.getElementById('my-life-area');
                if (lifeArea.querySelectorAll('.card').length === 0) {
                    const deckArea = document.getElementById('my-deck-area');
                    const deckCards = deckArea.querySelectorAll('.card');
                    if (deckCards.length > 0) {
                        const topDeck = deckCards[deckCards.length - 1];
                        lifeArea.appendChild(topDeck);
                        topDeck.classList.add('is-flipped', 'in-life');
                        recalcStacking(lifeArea);
                        sendSystemChat(`[Trigger: FINAL] 對手生命歸零時發動 Final Trigger，從牌頂補充了 1 張生命卡！`);
                    }
                }
                callback();
                return;
            }
            if (trig.type === 'RAID' || def.triggerText?.includes('[レイド]')) {
                const myEn = this.calculateMyEnergy();
                const req = def.requiredEnergy || { color: 'NONE', count: 0 };
                const energyOk = req.count === 0 || (myEn[req.color] >= req.count);
                const raidTargets = [];
                if (energyOk) {
                    document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(s => {
                        if (this.canRaidOntoSlot(def, s)) raidTargets.push(this.getTopCardInSlot(s));
                    });
                }

                if (raidTargets.length === 0) {
                    this.moveCardToZone(cardEl, handArea);
                    sendSystemChat(`[Trigger: RAID] 對手將【${def.name}】加入手牌。`);
                    callback();
                    return;
                }

                this.promptModal({
                    title: `[レイド] 觸發：請選擇要突襲的目標或加入手牌`,
                    desc: `能源條件已滿足！點選場上目標即可直接免 AP 突襲登場，或點擊下方按鈕加入手牌：`,
                    cards: raidTargets,
                    selectCount: 1,
                    upTo: true,
                    customButtons: [
                        {
                            label: '✋ 不突襲，直接加入手牌',
                            color: '#4f739e',
                            onClick: () => {
                                this.moveCardToZone(cardEl, handArea);
                                sendSystemChat(`[Trigger: RAID] 對手將【${def.name}】加入手牌。`);
                                callback();
                            }
                        }
                    ],
                    onConfirm: (selected) => {
                        if (selected.length > 0) {
                            const targetSlot = selected[0].parentElement;
                            const isEn = !!targetSlot.closest('#my-energy-line');
                            this.executeRaidSummon(cardEl, def, targetSlot, isEn, cardEl.parentElement, 0, window.finalizeDrop, true, callback);
                        } else {
                            this.moveCardToZone(cardEl, handArea);
                            callback();
                        }
                    }
                });
                return;
            }

            // ACTIVE / SPECIAL / COLOR 等直接透過逗號時序解析器執行 triggerText，結算完畢才執行下一張 Trigger
            this.moveCardToZone(cardEl, outsideArea);
            const trigActions = this.compileSequentialClauses(def.triggerText.replace(/\[[^\]]+\]/g, ''));
            this.executeAbilityActions(cardEl, trigActions, 0, { selectedTargets: [], addedFromLook: false }, callback);
        }

        // ==================== 工具方法 ====================

        drawCards(count) {
            const deckArea = document.getElementById('my-deck-area');
            const handArea = document.getElementById('my-hand-area');
            for (let i = 0; i < count; i++) {
                const cards = Array.from(deckArea.querySelectorAll('.card'));
                if (cards.length === 0) return false;
                const c = cards[cards.length - 1];
                this.moveCardToZone(c, handArea);
            }
            if (typeof playSound === 'function') playSound('draw');
            return true;
        }

        millDeckCards(count) {
            const deckArea = document.getElementById('my-deck-area');
            const outsideArea = document.getElementById('my-outside-area');
            let milled = 0;
            for (let i = 0; i < count; i++) {
                const cards = Array.from(deckArea.querySelectorAll('.card'));
                if (cards.length === 0) break;
                const c = cards[cards.length - 1];
                this.moveCardToZone(c, outsideArea);
                milled++;
            }
            if (milled > 0) {
                sendSystemChat(`️ [規則引擎] 對手從牌組頂端將 ${milled} 張卡片放置於場外。`);
            }
            return milled;
        }

        moveCardToZone(cardEl, destZone) {
            if (!cardEl || !destZone) return;
            const prevParent = cardEl.parentElement;
            destZone.appendChild(cardEl);
            cardEl.classList.remove('rest', 'in-life', 'is-flipped');
            cardEl.style.setProperty('--tilt', '0deg');
            cardEl.style.transform = '';

            if (destZone.id.includes('hand') || destZone.id.includes('look')) {
                cardEl.style.position = 'relative';
                cardEl.style.left = '0';
                cardEl.style.top = '0';
                recalcStacking(destZone);
            } else {
                cardEl.style.position = 'absolute';
                recalcStacking(destZone);
            }
            if (prevParent && !prevParent.id.includes('modal')) recalcStacking(prevParent);
            updateSlotCounts();
            broadcastMyState();
        }

        getSlotTopCards(selector) {
            const list = [];
            document.querySelectorAll(selector).forEach(slot => {
                const top = this.getTopCardInSlot(slot);
                if (top) list.push(top);
            });
            return list;
        }

        retireCardFromSlot(slot) {
            if (!slot) return;
            const cards = Array.from(slot.querySelectorAll('.card'));
            if (cards.length === 0) return;

            const topCard = cards[cards.length - 1];
            const underCards = cards.slice(0, cards.length - 1);
            const outsideArea = document.getElementById('my-outside-area');

            updateBpDisplay(slot, 0);
            underCards.forEach(uc => this.moveCardToZone(uc, outsideArea));
            this.moveCardToZone(topCard, outsideArea);

            this.triggerCardAbilities(topCard, 'ON_RETIRE');
            this.updateEnergyHUD();
            broadcastMyState();
        }

        playCardFreeFromDeck(cardEl, onComplete = null) {
            const def = this.getCardDef(cardEl);
            const rt = this.getRuntime(cardEl);
            this.playedFromDeckThisTurn = true;
            if (rt) {
                rt.enteredFromDeck = true;
                rt.enteredThisTurn = true;
            }

            if (def?.type === 'EVENT') {
                this.usedEventThisTurn = true;
                this.moveCardToZone(cardEl, document.getElementById('my-outside-area'));
                sendSystemChat(`[效果] 對手不支付 AP 使用了事件卡〈${def.name}〉。`);
                this.triggerCardAbilities(cardEl, 'CONTINUOUS', onComplete);
                return;
            }

            const isField = def?.type === 'FIELD';
            const enterRest = !(def?.compiledRules?.entersActive);

            const doNormalFreeSummon = () => {
                this.chooseEmptyFieldSlotAndPlace(cardEl, { allowFront: !isField, allowEnergy: true, enterRest }, (placedSlot) => {
                    if (!placedSlot) {
                        showSysMsg('場上沒有空位，改將卡片加入手牌！');
                        this.moveCardToZone(cardEl, document.getElementById('my-hand-area'));
                        if (onComplete) onComplete();
                        return;
                    }
                    sendSystemChat(`[效果] 對手不支付 AP 登場了〈${def?.name}〉。`);
                    this.triggerCardAbilities(cardEl, 'ON_PLAY', onComplete);
                });
            };

            // Fix #7: 若從牌頂免費使用的卡片是突襲角色且場上有合法突襲目標，提供免費突襲選項！
            if (def?.compiledRules?.raidCondition) {
                const raidTargets = [];
                document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(s => {
                    if (this.canRaidOntoSlot(def, s)) {
                        const top = this.getTopCardInSlot(s);
                        if (top) raidTargets.push(top);
                    }
                });
                if (raidTargets.length > 0) {
                    this.promptModal({
                        title: `突襲確認：${def.name}`, 
                        desc: `可不支付 AP 進行突襲（レイド）。請選擇場上的突襲對象，或改為一般登場：`, 
                        cards: raidTargets,
                        selectCount: 1,
                        upTo: true,
                        customButtons: [{
                            label: '不突襲，一般登場',
                            color: '#6c93c7',
                            onClick: () => doNormalFreeSummon()
                        }],
                        onConfirm: (selected) => {
                            if (selected.length > 0) {
                                const targetSlot = selected[0].parentElement;
                                const isEn = !!targetSlot.closest('#my-energy-line');
                                const hasEmptyFront = Array.from(document.querySelectorAll('#my-front-line .slot')).some(s => s.querySelectorAll('.card').length === 0);
                                this.executeRaidSummon(cardEl, def, targetSlot, isEn && hasEmptyFront, cardEl.parentElement, 0, window.finalizeDrop, true, onComplete);
                            } else {
                                doNormalFreeSummon();
                            }
                        }
                    });
                    return;
                }
            }

            doNormalFreeSummon();
        }

        bounceSlotTopCardToHand(slot) {
            if (!slot) return;
            const cards = Array.from(slot.querySelectorAll('.card'));
            if (cards.length === 0) return;
            const topCard = cards[cards.length - 1];
            const underCards = cards.slice(0, cards.length - 1);
            const outsideArea = document.getElementById('my-outside-area');
            const handArea = document.getElementById('my-hand-area');

            if (this.getCardDef(topCard)?.type === 'CHARACTER') {
                this.bouncedCharThisTurn = true;
            }

            updateBpDisplay(slot, 0);
            underCards.forEach(uc => this.moveCardToZone(uc, outsideArea));
            this.moveCardToZone(topCard, handArea);
            this.updateEnergyHUD();
            broadcastMyState();
        }

        requestRetireOpponentCard(oppCardEl) {
            const oppSlot = oppCardEl.parentElement;
            if (!oppSlot) return;
            const def = this.getCardDef(oppCardEl);
            sendSystemChat(`[規則引擎] 對手的【${def?.name || '角色'}】退場！`);
            if (conn && isConnected) {
                conn.send({
                    type: 'ENGINE_EVENT',
                    subType: 'FORCE_RETIRE_SLOT',
                    slotId: oppSlot.id.replace('opp-', 'my-')
                });
            } else if (this.isSoloTestMode) {
                const oppOut = document.getElementById('opp-outside-area');
                if (oppOut) {
                    updateBpDisplay(oppSlot, 0);
                    Array.from(oppSlot.querySelectorAll('.card')).forEach(c => this.moveCardToZone(c, oppOut));
                }
            }
        }

        requestBounceOpponentCard(oppCardEl) {
            const oppSlot = oppCardEl.parentElement;
            if (!oppSlot) return;
            const def = this.getCardDef(oppCardEl);
            sendSystemChat(`️ [規則引擎] 對手的【${def?.name || '角色'}】被退回手牌！`);
            if (conn && isConnected) {
                conn.send({
                    type: 'ENGINE_EVENT',
                    subType: 'FORCE_BOUNCE_SLOT',
                    slotId: oppSlot.id.replace('opp-', 'my-')
                });
            } else if (this.isSoloTestMode) {
                const oppHand = document.getElementById('opp-hand-area');
                const oppOut = document.getElementById('opp-outside-area');
                if (oppHand) {
                    const cards = Array.from(oppSlot.querySelectorAll('.card'));
                    const top = cards[cards.length - 1];
                    const under = cards.slice(0, cards.length - 1);
                    updateBpDisplay(oppSlot, 0);
                    if (oppOut) under.forEach(uc => this.moveCardToZone(uc, oppOut));
                    if (top) this.moveCardToZone(top, oppHand);
                }
            }
        }


        requestRestOpponentCard(oppCardEl) {
            if (!oppCardEl) return;
            const oppSlot = oppCardEl.parentElement;
            if (!oppSlot || !oppSlot.id.startsWith('opp-')) return;
            oppCardEl.classList.add('rest');
            const def = this.getCardDef(oppCardEl);
            sendSystemChat(`[規則引擎] 對手的【${def?.name || '角色'}】轉為休息狀態！`);
            if (conn && isConnected) {
                conn.send({
                    type: 'ENGINE_EVENT',
                    subType: 'FORCE_REST_SLOT',
                    slotId: oppSlot.id.replace('opp-', 'my-')
                });
            } else if (this.isSoloTestMode) {
                showSysMsg(`[測試] 假敵人【${this.getDisplayName(def)}】已轉為休息狀態`);
            }
        }

        requestFreezeOpponentCard(oppCardEl) {
            if (!oppCardEl) return;
            const oppSlot = oppCardEl.parentElement;
            if (!oppSlot || !oppSlot.id.startsWith('opp-')) return;
            const def = this.getCardDef(oppCardEl);
            sendSystemChat(`[規則引擎] 對手的【${def?.name || '角色'}】下次起始階段無法轉為活動！`);
            if (conn && isConnected) {
                conn.send({
                    type: 'ENGINE_EVENT',
                    subType: 'FORCE_FREEZE_SLOT',
                    slotId: oppSlot.id.replace('opp-', 'my-')
                });
            } else if (this.isSoloTestMode) {
                const rt = this.getRuntime(oppCardEl);
                if (rt) rt.frozenNextTurn = true;
                showSysMsg(`[測試] 假敵人【${this.getDisplayName(def)}】已被凍結（下次不活動）`);
            }
        }

        requestRemoveOpponentCard(oppCardEl) {
            if (!oppCardEl) return;
            const oppSlot = oppCardEl.parentElement;
            if (!oppSlot || !oppSlot.id.startsWith('opp-')) return;
            const def = this.getCardDef(oppCardEl);
            sendSystemChat(`[規則引擎] 對手的【${def?.name || '角色'}】被放置於移除區！`);
            if (conn && isConnected) {
                conn.send({
                    type: 'ENGINE_EVENT',
                    subType: 'FORCE_REMOVE_SLOT',
                    slotId: oppSlot.id.replace('opp-', 'my-')
                });
            } else if (this.isSoloTestMode) {
                const oppRem = document.getElementById('opp-remove-area');
                const oppOut = document.getElementById('opp-outside-area');
                if (oppRem) {
                    const cards = Array.from(oppSlot.querySelectorAll('.card'));
                    const top = cards[cards.length - 1];
                    const under = cards.slice(0, cards.length - 1);
                    updateBpDisplay(oppSlot, 0);
                    if (oppOut) under.forEach(uc => this.moveCardToZone(uc, oppOut));
                    if (top) this.moveCardToZone(top, oppRem);
                }
            }
        }

        requestBottomOpponentCard(oppCardEl) {
            if (!oppCardEl) return;
            const oppSlot = oppCardEl.parentElement;
            if (!oppSlot || !oppSlot.id.startsWith('opp-')) return;
            const def = this.getCardDef(oppCardEl);
            sendSystemChat(`[規則引擎] 對手的【${def?.name || '角色'}】被放置於牌組底部！`);
            if (conn && isConnected) {
                conn.send({
                    type: 'ENGINE_EVENT',
                    subType: 'FORCE_BOTTOM_SLOT',
                    slotId: oppSlot.id.replace('opp-', 'my-')
                });
            } else if (this.isSoloTestMode) {
                const oppDeck = document.getElementById('opp-deck-area');
                const oppOut = document.getElementById('opp-outside-area');
                if (oppDeck) {
                    const cards = Array.from(oppSlot.querySelectorAll('.card'));
                    const top = cards[cards.length - 1];
                    const under = cards.slice(0, cards.length - 1);
                    updateBpDisplay(oppSlot, 0);
                    if (oppOut) under.forEach(uc => this.moveCardToZone(uc, oppOut));
                    if (top) {
                        oppDeck.insertBefore(top, oppDeck.firstChild);
                        top.classList.add('is-flipped');
                        top.classList.remove('rest', 'in-life');
                        top.style.position = 'absolute';
                        recalcStacking(oppDeck);
                        updateSlotCounts();
                    }
                }
            }
        }

        requestOpponentDiscard(count = 1) {
            const n = Math.max(1, parseInt(count, 10) || 1);
            sendSystemChat(`[規則引擎] 要求對手捨棄 ${n} 張手牌！`);
            if (conn && isConnected) {
                conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_DISCARD_HAND', count: n });
            } else if (this.isSoloTestMode) {
                const oppHand = document.getElementById('opp-hand-area');
                const oppOut = document.getElementById('opp-outside-area');
                if (oppHand && oppOut) {
                    const cards = Array.from(oppHand.querySelectorAll('.card'));
                    const drop = Math.min(n, cards.length);
                    for (let i = 0; i < drop; i++) this.moveCardToZone(cards.pop(), oppOut);
                    showSysMsg(`[測試] 假敵人已棄置 ${drop} 張手牌（剩餘 ${oppHand.querySelectorAll('.card').length} 張）`);
                }
            }
        }

        promptModal({ title, desc, cards = [], cardFilterFn = null, selectCount = 1, upTo = false, showOrderNumbers = false, customButtons = [], onConfirm = null }) {
            const modal = document.getElementById('ua-prompt-modal');
            const titleEl = document.getElementById('ua-prompt-title');
            const descEl = document.getElementById('ua-prompt-desc');
            const cardsBox = document.getElementById('ua-prompt-cards');
            const actionsBox = document.getElementById('ua-prompt-actions');

            const oldToolbox = document.getElementById('ua-fallback-toolbox');
            if (oldToolbox) oldToolbox.remove();

            titleEl.innerText = title;
            descEl.innerText = desc;
            cardsBox.innerHTML = '';
            actionsBox.innerHTML = '';

            const selectedList = [];
            const wrapperMap = new Map();

            const refreshOrderBadges = () => {
                if (!showOrderNumbers) return;
                wrapperMap.forEach((wrap, cEl) => {
                    let b = wrap.querySelector('.order-num-badge');
                    const idx = selectedList.indexOf(cEl);
                    if (idx !== -1) {
                        if (!b) {
                            b = document.createElement('div');
                            b.className = 'order-num-badge';
                            b.style.cssText = 'position:absolute; top:4px; left:4px; background:#00ffcc; color:#000; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:15px; box-shadow:0 2px 6px rgba(0,0,0,0.9);';
                            wrap.appendChild(b);
                        }
                        b.innerText = String(idx + 1);
                    } else if (b) {
                        b.remove();
                    }
                });
            };

            const createCardWrapper = (cardEl, sizeW = 110, sizeH = 154) => {
                const def = this.getCardDef(cardEl);
                const imgUrl = cardEl.querySelector('.card-front img')?.src || def?.imageUrl || '';
                const selectable = cardFilterFn ? cardFilterFn(cardEl) : true;

                const wrapper = document.createElement('div');
                wrapper.style.cssText = `
                    width: ${sizeW}px; height: ${sizeH}px; border-radius: 8px; overflow: hidden;
                    border: 3px solid ${selectable ? 'rgba(255,255,255,0.25)' : 'rgba(255,0,0,0.2)'};
                    opacity: ${selectable ? '1' : '0.4'}; cursor: ${selectable ? 'pointer' : 'not-allowed'};
                    transition: 0.2s; position: relative; flex-shrink: 0;
                `;
                wrapper.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover;">`;
                wrapperMap.set(cardEl, wrapper);

                if (selectable && onConfirm) {
                    wrapper.onclick = () => {
                        const existingIdx = selectedList.indexOf(cardEl);
                        if (existingIdx !== -1) {
                            selectedList.splice(existingIdx, 1);
                            wrapper.style.borderColor = 'rgba(255,255,255,0.25)';
                            wrapper.style.transform = 'scale(1)';
                        } else {
                            if (selectedList.length >= selectCount) {
                                if (selectCount === 1) {
                                    selectedList.length = 0;
                                    wrapperMap.forEach(w => {
                                        w.style.borderColor = 'rgba(255,255,255,0.25)';
                                        w.style.transform = 'scale(1)';
                                    });
                                } else {
                                    return;
                                }
                            }
                            selectedList.push(cardEl);
                            wrapper.style.borderColor = '#00ffcc';
                            wrapper.style.transform = 'scale(1.06)';
                        }
                        refreshOrderBadges();
                        if (confirmBtn && upTo) {
                            confirmBtn.innerText = `確認選擇 (已選 ${selectedList.length} / 最多 ${selectCount} 張)`;
                        }
                    };
                }
                return wrapper;
            };

            // 若所有候選卡皆位於場上卡槽（前線／能源線），自動依實際盤面位置（前線 4 格／能源線 4 格）排版
            const fieldSlotPat = /^(my|opp)-(fl|en)-([1-4])$/;
            const isFieldSelection = cards.length > 0 && cards.every(c => c && c.parentElement && fieldSlotPat.test(c.parentElement.id || ''));

            if (isFieldSelection) {
                const slotToCard = new Map();
                let hasMy = false, hasOpp = false;
                cards.forEach(c => {
                    const sid = c.parentElement.id;
                    slotToCard.set(sid, c);
                    if (sid.startsWith('my-')) hasMy = true;
                    if (sid.startsWith('opp-')) hasOpp = true;
                });

                const buildFieldRow = (label, slotIds, accentColor) => {
                    const hasAnyInRow = slotIds.some(sid => slotToCard.has(sid));
                    if (!hasAnyInRow) return null;
                    const rowWrap = document.createElement('div');
                    rowWrap.style.cssText = 'width:100%; display:flex; flex-direction:column; align-items:center; gap:6px; margin-bottom:6px;';
                    const lbl = document.createElement('div');
                    lbl.textContent = label;
                    lbl.style.cssText = `font-size:12px; font-weight:900; color:${accentColor}; letter-spacing:1px;`;
                    rowWrap.appendChild(lbl);

                    const grid = document.createElement('div');
                    grid.style.cssText = 'display:grid; grid-template-columns:repeat(4, 96px); gap:10px; justify-content:center;';
                    slotIds.forEach(sid => {
                        const c = slotToCard.get(sid);
                        if (c) {
                            grid.appendChild(createCardWrapper(c, 96, 134));
                        } else {
                            const empty = document.createElement('div');
                            empty.style.cssText = 'width:96px; height:134px; border-radius:8px; border:2px dashed rgba(255,255,255,0.14); background:rgba(255,255,255,0.03); display:flex; align-items:center; justify-content:center; font-size:11px; color:#555;';
                            empty.textContent = '空';
                            grid.appendChild(empty);
                        }
                    });
                    rowWrap.appendChild(grid);
                    return rowWrap;
                };

                const boardWrap = document.createElement('div');
                boardWrap.style.cssText = 'width:100%; display:flex; flex-direction:column; gap:6px; align-items:center;';
                if (hasOpp) {
                    const oppEn = buildFieldRow('對手 能源線 (ENERGY LINE)', ['opp-en-4', 'opp-en-3', 'opp-en-2', 'opp-en-1'], '#f39c12');
                    const oppFl = buildFieldRow('對手 前線 (FRONT LINE)', ['opp-fl-4', 'opp-fl-3', 'opp-fl-2', 'opp-fl-1'], '#e74c3c');
                    if (oppEn) boardWrap.appendChild(oppEn);
                    if (oppFl) boardWrap.appendChild(oppFl);
                }
                if (hasMy) {
                    const myFl = buildFieldRow('我方 前線 (FRONT LINE)', ['my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4'], '#6fb897');
                    const myEn = buildFieldRow('我方 能源線 (ENERGY LINE)', ['my-en-1', 'my-en-2', 'my-en-3', 'my-en-4'], '#6c93c7');
                    if (myFl) boardWrap.appendChild(myFl);
                    if (myEn) boardWrap.appendChild(myEn);
                }
                cardsBox.appendChild(boardWrap);
            } else {
                cards.forEach(cardEl => {
                    cardsBox.appendChild(createCardWrapper(cardEl, 110, 154));
                });
            }

            let confirmBtn = null;
            if (onConfirm) {
                confirmBtn = document.createElement('button');
                confirmBtn.className = 'start-btn';
                confirmBtn.innerText = upTo ? `確認選擇 (已選 0 / 最多 ${selectCount} 張)` : `確認選擇 (${selectCount} 張)`;
                confirmBtn.onclick = () => {
                    if (!upTo && selectedList.length !== selectCount && cards.length >= selectCount) {
                        alert(`請選擇剛好 ${selectCount} 張卡片！`);
                        return;
                    }
                    modal.style.display = 'none';
                    onConfirm([...selectedList]);
                };
                actionsBox.appendChild(confirmBtn);
            }

            customButtons.forEach(b => {
                const btn = document.createElement('button');
                btn.className = 'ctrl-btn';
                btn.style.background = b.color || '#6c93c7';
                btn.style.padding = '10px 18px';
                btn.style.fontSize = '14px';
                btn.innerText = b.label;
                btn.onclick = () => {
                    modal.style.display = 'none';
                    b.onClick();
                };
                actionsBox.appendChild(btn);
            });

            modal.style.display = 'block';
        }

handleNetworkEvent(data) {
            if (!data || typeof data !== 'object') return;
            switch (data.subType) {
                case 'SET_SECOND_PLAYER':
                    this.setAsSecondPlayer();
                    showSysMsg('對手已設為先攻，你為【後攻玩家】！');
                    break;
                case 'YOUR_TURN_START':
                    if (!this.hasTakenFirstTurn) {
                        this.turnNumber = 1;
                        this.hasTakenFirstTurn = true;
                    } else {
                        this.turnNumber++;
                    }
                    showCenterAlert('⚡', '輪到你的回合', `Turn ${this.turnNumber}`, '#00ffcc');
                    this.beginMyTurn();
                    break;
                case 'FORCE_RETIRE_SLOT': {
                    if (!this.isValidMySlotId(data.slotId)) return;
                    const slot = document.getElementById(data.slotId);
                    if (slot) this.retireCardFromSlot(slot);
                    break;
                }
                case 'FORCE_BOUNCE_SLOT': {
                    if (!this.isValidMySlotId(data.slotId)) return;
                    const slot = document.getElementById(data.slotId);
                    if (slot) this.bounceSlotTopCardToHand(slot);
                    break;
                }
                case 'FORCE_BOTTOM_SLOT': {
                    if (!this.isValidMySlotId(data.slotId)) return;
                    const slot = document.getElementById(data.slotId);
                    const cards = slot ? Array.from(slot.querySelectorAll('.card')) : [];
                    const deck = document.getElementById('my-deck-area');
                    const outside = document.getElementById('my-outside-area');
                    if (cards.length > 0 && deck) {
                        const top = cards[cards.length - 1];
                        const under = cards.slice(0, cards.length - 1);
                        updateBpDisplay(slot, 0);
                        under.forEach(uc => this.moveCardToZone(uc, outside));
                        deck.insertBefore(top, deck.firstChild);
                        top.classList.add('is-flipped');
                        top.classList.remove('rest', 'in-life');
                        top.style.position = 'absolute';
                        recalcStacking(deck);
                        recalcStacking(slot);
                        updateSlotCounts();
                        this.updateEnergyHUD();
                        broadcastMyState();
                    }
                    break;
                }
                case 'FORCE_REMOVE_SLOT': {
                    if (!this.isValidMySlotId(data.slotId)) return;
                    const slot = document.getElementById(data.slotId);
                    const cards = slot ? Array.from(slot.querySelectorAll('.card')) : [];
                    const rem = document.getElementById('my-remove-area');
                    const outside = document.getElementById('my-outside-area');
                    if (cards.length > 0 && rem) {
                        const top = cards[cards.length - 1];
                        const under = cards.slice(0, cards.length - 1);
                        updateBpDisplay(slot, 0);
                        under.forEach(uc => this.moveCardToZone(uc, outside));
                        this.moveCardToZone(top, rem);
                        this.updateEnergyHUD();
                        broadcastMyState();
                    }
                    break;
                }
                case 'FORCE_REST_SLOT': {
                    if (!this.isValidMySlotId(data.slotId)) return;
                    const slot = document.getElementById(data.slotId);
                    const top = this.getTopCardInSlot(slot);
                    if (top) { top.classList.add('rest'); broadcastMyState(); }
                    break;
                }
                case 'FORCE_FREEZE_SLOT': {
                    if (!this.isValidMySlotId(data.slotId)) return;
                    const slot = document.getElementById(data.slotId);
                    const top = this.getTopCardInSlot(slot);
                    if (top) { this.getRuntime(top).frozenNextTurn = true; }
                    break;
                }
                case 'ATTACK_DECLARED':
                    this.onOpponentAttackDeclared(data);
                    break;
                case 'BLOCK_RESPONSE': {
                    if (!this.combatState) break;
                    if (data.attackId && this.combatState.attackId && data.attackId !== this.combatState.attackId) break;
                    const atkSlot = document.getElementById(this.combatState.attackerSlotId);
                    const atkCard = this.getTopCardInSlot(atkSlot);
                    this.clearCombatLock();
                    if (!atkCard) break;

                    if (data.blocked && this.isValidOppSlotId(data.blockerSlotId)) {
                        const defOppSlot = document.getElementById(data.blockerSlotId);
                        const defCard = this.getTopCardInSlot(defOppSlot);
                        if (defCard) this.resolveCharacterBattle(atkSlot, atkCard, defOppSlot, defCard, data.blockerBp);
                    } else {
                        this.inflictPlayerDamage(atkCard);
                    }
                    break;
                }
                case 'FORCE_DISCARD_HAND': {
                    const cnt = Math.max(1, parseInt(data.count, 10) || 1);
                    this.executeAbilityActions(null, [{ type: 'DISCARD_HAND', count: cnt }], 0, { selectedTargets: [], addedFromLook: false });
                    break;
                }
                case 'OPP_TRIGGER_REVEAL': {
                    const statusTxt = data.activated === true ? '⚡ 對手已發動觸發效果！' : (data.activated === false ? '🛡️ 未發動 / 無觸發' : '⏳ 對手正在處理觸發效果中...');
                    let overlay = document.getElementById('opp-trigger-img-overlay');
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.id = 'opp-trigger-img-overlay';
                        overlay.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(15,18,32,0.96); border:3px solid #f1c40f; border-radius:16px; padding:18px 24px; z-index:100550; text-align:center; box-shadow:0 0 40px rgba(241,196,15,0.6); color:#fff; min-width:260px;';
                        document.getElementById('app-canvas').appendChild(overlay);
                    }
                    const safeUrl = (typeof data.imageUrl === 'string' && /^(https:\/\/|data:image\/)/i.test(data.imageUrl.trim())) ? data.imageUrl.trim() : '';
                    overlay.innerHTML = `
                        <div style="font-size:16px; font-weight:900; color:#f1c40f; margin-bottom:10px;">✨ 對手生命觸發確認</div>
                        ${safeUrl ? `<img src="${safeUrl}" style="width:170px; height:238px; object-fit:cover; border-radius:8px; border:2px solid #fff; margin-bottom:10px;">` : ''}
                        <div style="font-size:15px; font-weight:bold; margin-bottom:6px;">${data.cardName || ''}</div>
                        <div style="font-size:14px; color:#00ffcc; font-weight:bold;">${statusTxt}</div>
                    `;
                    overlay.style.display = 'block';
                    clearTimeout(window._oppTrigOverlayTimer);
                    if (data.activated !== null) {
                        window._oppTrigOverlayTimer = setTimeout(() => { overlay.style.display = 'none'; }, 1800);
                    }
                    break;
                }
                case 'TRIGGER_RESOLUTION_DONE': {
                    this.waitingForOppTrigger = false;
                    if (this.oppTriggerTimeoutId) { clearTimeout(this.oppTriggerTimeoutId); this.oppTriggerTimeoutId = null; }
                    const overlay = document.getElementById('opp-trigger-img-overlay');
                    if (overlay) setTimeout(() => { overlay.style.display = 'none'; }, 900);
                    this.updateEnergyHUD();
                    showSysMsg('對手生命觸發已處理完畢，可繼續操作！');
                    break;
                }
                case 'TAKE_LIFE_DAMAGE':
                    this.processMyLifeDamage(data.count);
                    break;
            }
        }
    }

    window.uaEngine = new UARuleEngine();

    window.addEventListener('load', () => {
        window.uaEngine.initCatalog();
        window.uaEngine.injectEngineUI();

        const origFinalizeDrop = window.finalizeDrop;
        window.finalizeDrop = function (cards, dropZone, action, originalParent, endX) {
            window.uaEngine.interceptCardDrop(cards, dropZone, action, originalParent, endX, origFinalizeDrop);
        };

        const origSetPhase = window.setPhase;
        window.setPhase = function (el, phaseName) {
            origSetPhase(el, phaseName);
            window.uaEngine.onPhaseChanged(phaseName);
        };

        const origEndTurn = window.endTurn;
        window.endTurn = function () {
            window.uaEngine.handleEndTurnIntercept(origEndTurn);
        };

        const origSetupLifeArea = window.setupLifeArea;
        if (typeof origSetupLifeArea === 'function') {
            window.setupLifeArea = function () {
                origSetupLifeArea();
                setTimeout(() => {
                    const btnFirst = document.getElementById('btn-claim-first');
                    if (btnFirst && window.uaEngine.isFirstPlayer === null) {
                        btnFirst.style.display = 'block';
                    }
                    window.uaEngine.updateEnergyHUD();
                }, 300);
            };
        }

        const origSetupConnection = window.setupConnection;
        window.setupConnection = function (timeoutId) {
            origSetupConnection(timeoutId);
            if (conn) {
                conn.on('data', (data) => {
                    if (data && data.type === 'ENGINE_EVENT') {
                        window.uaEngine.handleNetworkEvent(data);
                    }
                });
            }
        };
    });
})();