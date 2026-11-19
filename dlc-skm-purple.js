/**
 * UA DLC 腳本包：坂本日常 (SAKAMOTO DAYS) - 紫色 (共 41 張)
 * 檔名：dlc-skm-purple.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // 輔助：計算我方場上［特徴：LABO］張數
    function countMyLabo(engine) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => engine.getCardDef(c)?.traits?.includes('LABO')).length;
    }

    // 輕量掛鉤：支援 SMD-1-045 大佛（前線時可不支付 AP 進行エクストラドロー）與本回合是否發動過觸發追蹤
    function installSkmPurpleHooks() {
        const eng = window.uaEngine;
        if (!eng || window._skmPurpleHooked) return;
        window._skmPurpleHooked = true;

        eng.triggeredThisTurn = false;
        const origBegin = eng.beginMyTurn.bind(eng);
        eng.beginMyTurn = function () {
            this.triggeredThisTurn = false;
            return origBegin();
        };

        const origExecTrig = eng.executeTriggerEffect.bind(eng);
        eng.executeTriggerEffect = function (cardEl, def, trig, cb) {
            this.triggeredThisTurn = true;
            return origExecTrig(cardEl, def, trig, cb);
        };

        const origExtraDraw = eng.executeExtraDraw.bind(eng);
        eng.executeExtraDraw = function () {
            if (!this.isMyTurn || this.currentPhase !== '起始' || this.usedExtraDraw) return;
            const hasFreeOsaragi = this.getSlotTopCards('#my-front-line .slot').some(
                c => this.getBaseCardId(c.dataset.cardId) === 'UA43BT/SMD-1-045'
            );
            if (hasFreeOsaragi) {
                this.usedExtraDraw = true;
                this.drawCards(1);
                sendSystemChat('[規則引擎] 對手透過〈大佛〉的效果，不支付 AP 進行了エクストラドロー。');
                this.updateEnergyHUD();
                return;
            }
            return origExtraDraw();
        };

        const origUpdateHud = eng.updateEnergyHUD.bind(eng);
        eng.updateEnergyHUD = function () {
            origUpdateHud();
            const extraDrawBtn = document.getElementById('btn-extra-draw');
            if (extraDrawBtn && this.isMyTurn && this.currentPhase === '起始' && !this.usedExtraDraw) {
                const hasFreeOsaragi = this.getSlotTopCards('#my-front-line .slot').some(
                    c => this.getBaseCardId(c.dataset.cardId) === 'UA43BT/SMD-1-045'
                );
                if (hasFreeOsaragi) {
                    extraDrawBtn.style.display = 'block';
                    extraDrawBtn.innerText = 'エクストラドロー(0AP)';
                } else {
                    extraDrawBtn.innerText = 'エクストラドロー(1AP)';
                }
            }
        };
    }

    if (window.uaEngine) installSkmPurpleHooks();
    else window.addEventListener('load', () => setTimeout(installSkmPurpleHooks, 50));

    // 輔助：從場外或牌組直接觸發指定卡片的 [トリガー]（觸發完畢不移動卡片位置時使用）
    function activateCardTriggerInPlace(engine, cardEl, onComplete) {
        const def = engine.getCardDef(cardEl);
        if (!def || !def.triggerText || def.triggerText === '-') {
            showSysMsg(`〈${def?.name || '此卡'}〉沒有トリガー效果。`);
            if (onComplete) onComplete();
            return;
        }
        engine.triggeredThisTurn = true;
        const trig = def.compiledRules?.trigger || { type: 'TRIGGER' };
        const tTxt = def.triggerText;

        if (trig.type === 'DRAW' || tTxt.includes('[ドロー]')) {
            engine.drawCards(1);
            sendSystemChat(`[トリガー發動] 〈${def.name}〉[ドロー]：抽 1 張牌。`);
            if (onComplete) onComplete();
            return;
        }
        if (trig.type === 'GET' || tTxt.includes('[ゲット]')) {
            // SMD-1-060 南雲：發動 [ゲット] 時可改為 [ドロー] 或 [アクティブ]
            if (engine.getBaseCardId(cardEl.dataset.cardId) === 'UA43BT/SMD-1-060') {
                engine.promptModal({
                    title: 'トリガー替換：南雲',
                    desc: '可將 [ゲット] 替換為 [ドロー] 或 [アクティブ]：',
                    cards: [cardEl],
                    customButtons: [
                        { label: '發動 [ゲット]（加入手牌）', color: '#4f739e', onClick: () => { engine.moveCardToZone(cardEl, document.getElementById('my-hand-area')); if (onComplete) onComplete(); } },
                        { label: '改為 [ドロー]（抽 1 張）', color: '#4f9678', onClick: () => { engine.drawCards(1); if (onComplete) onComplete(); } },
                        {
                            label: '改為 [アクティブ]（活動並 BP+3000）', color: '#e67e22',
                            onClick: () => engine.executeAbilityActions(cardEl, [
                                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false },
                                { type: 'SET_ACTIVE', target: 'SELECTED' },
                                { type: 'MODIFY_BP', amount: 3000, target: 'SELECTED' }
                            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete)
                        }
                    ]
                });
                return;
            }
            engine.moveCardToZone(cardEl, document.getElementById('my-hand-area'));
            if (onComplete) onComplete();
            return;
        }
        if (trig.type === 'RAID' || tTxt.includes('[レイド]')) {
            const myEn = engine.calculateMyEnergy();
            const req = def.requiredEnergy || { color: 'NONE', count: 0 };
            const energyOk = req.count === 0 || (myEn[req.color] >= req.count);
            const raidTargets = [];
            if (energyOk) {
                document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(s => {
                    const top = engine.getTopCardInSlot(s);
                    const isNagumoBase = top && engine.getBaseCardId(top.dataset.cardId) === 'UA43BT/SMD-1-058';
                    if (engine.canRaidOntoSlot(def, s) || isNagumoBase) {
                        if (top) raidTargets.push(top);
                    }
                });
            }
            if (raidTargets.length === 0) {
                engine.moveCardToZone(cardEl, document.getElementById('my-hand-area'));
                if (onComplete) onComplete();
                return;
            }
            engine.promptModal({
                title: `トリガー突襲確認：${def.name}`,
                desc: '請選擇場上的突襲對象，或改為加入手牌：',
                cards: raidTargets, selectCount: 1, upTo: true,
                customButtons: [{ label: '不突襲，加入手牌', color: '#4f739e', onClick: () => { engine.moveCardToZone(cardEl, document.getElementById('my-hand-area')); if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const targetSlot = sel[0].parentElement;
                        const isEn = !!targetSlot.closest('#my-energy-line');
                        const hasEmptyFront = Array.from(document.querySelectorAll('#my-front-line .slot')).some(s => s.querySelectorAll('.card').length === 0);
                        engine.executeRaidSummon(cardEl, def, targetSlot, isEn && hasEmptyFront, cardEl.parentElement, 0, window.finalizeDrop, true, onComplete);
                    } else {
                        engine.moveCardToZone(cardEl, document.getElementById('my-hand-area'));
                        if (onComplete) onComplete();
                    }
                }
            });
            return;
        }
        if (trig.type === 'COLOR' || tTxt.includes('[カラー]')) {
            // 紫カラー：場外必要能源2以下 AP1 紫角色 1 張活動登場至前線
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'PURPLE' && (d.requiredEnergy?.count || 0) <= 2 && (d.apCost ?? 1) === 1;
            });
            if (cands.length === 0) { showSysMsg('場外沒有符合條件的 2 費以下 AP1 紫色角色。'); if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '紫色 [カラー] トリガー',
                desc: '請從場外選擇 1 張必要能源 2 以下、消費 AP 1 的紫色角色，以活動狀態登場至前線：',
                cards: cands, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: false, enterRest: false }, (placed) => {
                            if (placed) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                            else if (onComplete) onComplete();
                        });
                    } else if (onComplete) onComplete();
                }
            });
            return;
        }

        // ACTIVE / SPECIAL 等直接解析執行
        const actions = engine.compileSequentialClauses(tTxt.replace(/\[[^\]]+\]/g, ''));
        engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
    }

    // ==================== 紫色 ORDER（エクストラドロー軸） ====================

    // 04. UA43BT/SMD-1-044 大佛 (我方回合有進行エクストラドロー時 BP+1000)
    scripts['UA43BT/SMD-1-044'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedExtraDraw) ? 1000 : 0;
        }
    };

    // 06. UA43BT/SMD-1-046 大佛 (突襲：攻擊時有エクストラドロー抽最多1張；登場當回合 BP+1000 & ダメージ(2))
    scripts['UA43BT/SMD-1-046'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            if (!engine.usedExtraDraw) { if (onComplete) onComplete(); return; }
            const rt = engine.getRuntime(cardEl);
            if (rt.enteredThisTurn) {
                engine.addSlotBp(cardEl.parentElement, 1000);
                rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2);
                showSysMsg('〈大佛〉本回合獲得 BP+1000 與 [ダメージ(2)]。');
            }
            engine.promptModal({
                title: 'アタック時效果：大佛',
                desc: '本回合已進行エクストラドロー，是否抽 1 張牌？',
                cards: [cardEl],
                customButtons: [
                    { label: '抽 1 張牌', color: '#4f9678', onClick: () => { engine.drawCards(1); if (onComplete) onComplete(); } },
                    { label: '不抽牌', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 14. UA43BT/SMD-1-054 神々廻 (エクストラドロー回合限定起動：橫置+棄1手牌，本回合產生能源+[紫])
    scripts['UA43BT/SMD-1-054'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest')
                && engine.usedExtraDraw
                && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            engine.promptModal({
                title: '起動メイン：神々廻',
                desc: '捨棄 1 張手牌，本回合產生能源 +[紫]：',
                cards: handCards, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        cardEl.classList.add('rest');
                        engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                        engine.getRuntime(cardEl).tempEnergyBoost.push({ color: 'PURPLE', count: 1 });
                        showSysMsg('〈神々廻〉本回合產生能源 +[紫]。');
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 15. UA43BT/SMD-1-055 神々廻 (突襲：登場時有エクストラドロー則活動 1~2 張休息 AP [同名ターン1])
    scripts['UA43BT/SMD-1-055'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            if (!engine.usedExtraDraw || engine.usedNamedAbilityThisTurn.has('神々廻_AP活動')) {
                if (onComplete) onComplete();
                return;
            }
            engine.usedNamedAbilityThisTurn.add('神々廻_AP活動');
            engine.activateMyApCards(2);
            if (onComplete) onComplete();
        }
    };

    // 16. UA43BT/SMD-1-056 篁 (登場時活動自己，退場對手前線角色或場域 1 張)
    scripts['UA43BT/SMD-1-056'] = {
        onPlay(engine, cardEl, onComplete) {
            cardEl.classList.remove('rest');
            const cands = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                const inFront = !!c.parentElement.closest('#opp-front-line');
                return (inFront && d?.type === 'CHARACTER') || d?.type === 'FIELD';
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：篁',
                desc: '選擇對手前線角色或對手場域最多 1 張退場：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) engine.requestRetireOpponentCard(sel[0]);
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 36. UA43BT/SMD-1-076 ゲン担ぎ (事件：抽1，有エクストラドロー活動1張AP)
    scripts['UA43BT/SMD-1-076'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            if (engine.usedExtraDraw) engine.activateMyApCards(1);
            if (onComplete) onComplete();
        }
    };

    // 37. UA43BT/SMD-1-077 B5で暴れて正解やったなァー (事件：3000 / 有神々廻或大佛 4000 / 兩者都有 5000 退場)
    scripts['UA43BT/SMD-1-077'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasS = engine.hasCharacterOnMyField('神々廻');
            const hasO = engine.hasCharacterOnMyField('大佛');
            const maxBp = (hasS && hasO) ? 5000 : ((hasS || hasO) ? 4000 : 3000);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 紫色 ORDER（トリガー發動軸：坂本 太郎／南雲） ====================

    // 08. UA43BT/SMD-1-048 坂本 太郎 (本回合有發動過トリガー時 BP+1000)
    scripts['UA43BT/SMD-1-048'] = {
        getContinuousBpBonus(engine) {
            return engine.triggeredThisTurn ? 1000 : 0;
        }
    };

    // 10. UA43BT/SMD-1-050 坂本 太郎 (登場可棄1手牌，選我方前線非突襲角色1張發動其トリガー)
    scripts['UA43BT/SMD-1-050'] = {
        onPlay(engine, cardEl, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            const nonRaidFront = engine.getSlotTopCards('#my-front-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && !engine.getRuntime(c)?.isRaided && d.triggerText && d.triggerText !== '-';
            });
            if (handCards.length === 0 || nonRaidFront.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：坂本 太郎',
                desc: '是否捨棄 1 張手牌，發動我方前線 1 張非突襲狀態角色的 [トリガー]？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '捨棄 1 手牌並發動', color: '#4f9678',
                        onClick: () => {
                            engine.promptModal({
                                title: '選擇 1 張手牌捨棄', desc: '選擇 1 張手牌放置於場外：',
                                cards: handCards, selectCount: 1, upTo: false,
                                onConfirm: (disc) => {
                                    disc.forEach(c => engine.moveCardToZone(c, document.getElementById('my-outside-area')));
                                    engine.promptModal({
                                        title: '選擇發動 [トリガー] 的前線角色', desc: '選擇最多 1 張非突襲角色：',
                                        cards: nonRaidFront, selectCount: 1, upTo: true,
                                        onConfirm: (sel) => {
                                            if (sel.length > 0) activateCardTriggerInPlace(engine, sel[0], onComplete);
                                            else if (onComplete) onComplete();
                                        }
                                    });
                                }
                            });
                        }
                    },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 11. UA43BT/SMD-1-051 坂本 太郎 (突襲：登場抽1；前線起動看5選1張2費以下紫卡送場外並發動其トリガー)
    scripts['UA43BT/SMD-1-051'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(5, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `起動メイン：坂本 太郎（檢視牌頂 ${cnt} 張）`,
                desc: '選擇最多 1 張必要能源 2 以下的紫色卡片送至場外並發動其 [トリガー]（其餘置於牌底）：',
                cards: topCards,
                cardFilterFn: (c) => {
                    const d = engine.getCardDef(c);
                    return !!(d && d.color === 'PURPLE' && (d.requiredEnergy?.count || 0) <= 2);
                },
                selectCount: 1, upTo: true,
                onConfirm: (picked) => {
                    const rest = topCards.filter(c => !picked.includes(c));
                    rest.forEach(c => { deckArea.insertBefore(c, deckArea.firstChild); c.classList.add('is-flipped'); });
                    recalcStacking(deckArea);
                    if (picked.length > 0) {
                        engine.moveCardToZone(picked[0], document.getElementById('my-outside-area'));
                        activateCardTriggerInPlace(engine, picked[0], onComplete);
                    } else {
                        broadcastMyState();
                        if (onComplete) onComplete();
                    }
                }
            });
        }
    };

    // 21. UA43BT/SMD-1-061 南雲 (突襲：前線登場發動場外紫カラートリガー，或將最上層送場外改發動〈南雲〉以外的レイドトリガー)
    scripts['UA43BT/SMD-1-061'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            if (!cardEl.closest('#my-front-line')) { if (onComplete) onComplete(); return; }
            const colorCands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'PURPLE' && (d.compiledRules?.trigger?.type === 'COLOR' || (d.triggerText || '').includes('[カラー]'));
            });
            const raidCands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'PURPLE' && !d.name.includes('南雲') && (d.compiledRules?.trigger?.type === 'RAID' || (d.triggerText || '').includes('[レイド]'));
            });
            engine.promptModal({
                title: '登場時效果：南雲',
                desc: '請選擇發動方式：',
                cards: [],
                customButtons: [
                    {
                        label: `發動場外紫 [カラー] トリガー (可選 ${colorCands.length})`, color: '#6c93c7',
                        onClick: () => {
                            if (colorCands.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '選擇場外紫 [カラー] 角色', desc: '選擇最多 1 張發動其 [トリガー]：',
                                cards: colorCands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => {
                                    if (sel.length > 0) activateCardTriggerInPlace(engine, sel[0], onComplete);
                                    else if (onComplete) onComplete();
                                }
                            });
                        }
                    },
                    {
                        label: `將此卡最上層送場外：發動〈南雲〉以外的 [レイド] トリガー (可選 ${raidCands.length})`, color: '#c1596f',
                        onClick: () => {
                            if (raidCands.length === 0) { if (onComplete) onComplete(); return; }
                            engine.moveCardToZone(cardEl, document.getElementById('my-outside-area'));
                            engine.promptModal({
                                title: '選擇場外〈南雲〉以外的 [レイド] 角色', desc: '選擇最多 1 張發動其 [レイド] トリガー：',
                                cards: raidCands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => {
                                    if (sel.length > 0) activateCardTriggerInPlace(engine, sel[0], onComplete);
                                    else if (onComplete) onComplete();
                                }
                            });
                        }
                    },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 39. UA43BT/SMD-1-079 変装の達人 (事件：選對手前線BP5000以下1張放牌頂或牌底)
    scripts['UA43BT/SMD-1-079'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasNagumo = engine.hasCharacterOnMyField('南雲');
            showSysMsg(`〈変装の達人〉${hasNagumo ? '場上有〈南雲〉，由我方決定置於對手牌組頂端或底部。' : '由對手決定置於牌組頂端或底部。'}`);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: 'SEND_TARGET_TO_BOTTOM' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 紫色 LABO 軸 ====================

    // 24. UA43BT/SMD-1-064 侵入者排除システム (登場對手前線有4張以上BP4000+時：抽1、活動、至下回合開始BP+2000)
    scripts['UA43BT/SMD-1-064'] = {
        onPlay(engine, cardEl, onComplete) {
            const opp4000 = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 4000).length;
            if (opp4000 >= 4) {
                engine.drawCards(1);
                cardEl.classList.remove('rest');
                engine.addSlotBp(cardEl.parentElement, 2000);
                const rt = engine.getRuntime(cardEl);
                rt.persistentBp = (rt.persistentBp || 0) + 2000;
                showSysMsg('〈侵入者排除システム〉條件達成：抽 1、轉為活動、BP+2000（持續至下次我方回合開始）。');
            }
            if (onComplete) onComplete();
        }
    };

    // 26. UA43BT/SMD-1-066 勢羽 夏生 (登場選1張LABO BP+1000；攻擊時我方全體LABO BP+1000)
    scripts['UA43BT/SMD-1-066'] = {
        onPlay(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                .filter(c => engine.getCardDef(c)?.traits?.includes('LABO'));
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：勢羽 夏生', desc: '選擇最多 1 張［特徴：LABO］本回合 BP+1000：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, 1000); if (onComplete) onComplete(); }
            });
        },
        onAttack(engine, cardEl, onComplete) {
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
                if (engine.getCardDef(c)?.traits?.includes('LABO')) engine.addSlotBp(c.parentElement, 1000);
            });
            if (onComplete) onComplete();
        }
    };

    // 27. UA43BT/SMD-1-067 勢羽 夏生 (攻擊時場上有3張以上LABO則BP+1000)
    scripts['UA43BT/SMD-1-067'] = {
        onAttack(engine, cardEl, onComplete) {
            if (countMyLabo(engine) >= 3) engine.addSlotBp(cardEl.parentElement, 1000);
            if (onComplete) onComplete();
        }
    };

    // 28. UA43BT/SMD-1-068 勢羽 夏生 (登場抽1；攻擊時從手牌特召或突襲4費以下AP1紫色LABO活動登場，不可突襲於此卡上)
    scripts['UA43BT/SMD-1-068'] = {
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); },
        onAttack(engine, cardEl, onComplete) {
            const cands = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'PURPLE' && d.traits?.includes('LABO') && (d.requiredEnergy?.count || 0) <= 4 && (d.apCost ?? 1) === 1;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：勢羽 夏生',
                desc: '可從手牌選擇最多 1 張 4 費以下 AP1 的紫色［特徴：LABO］以活動狀態登場（不可突襲於此卡上）：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: false }, (placed) => {
                            if (placed) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                            else if (onComplete) onComplete();
                        });
                    } else if (onComplete) onComplete();
                }
            });
        }
    };

    // 29. UA43BT/SMD-1-069 勢羽 夏生 (突襲：前線起動[非登場回合][ターン1]抽1，若LABO>=3且對手生命>=3則造成對手1點傷害)
    scripts['UA43BT/SMD-1-069'] = {
        requireRaided: true,
        canActivateMain(engine, cardEl, slot) {
            const rt = engine.getRuntime(cardEl);
            return !!slot.closest('#my-front-line') && !rt.enteredThisTurn && !rt.usedOncePerTurn;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.drawCards(1);
            const oppLifeCnt = document.querySelectorAll('#opp-life-area .card').length;
            if (countMyLabo(engine) >= 3 && oppLifeCnt >= 3) {
                sendSystemChat('[效果傷害] 〈勢羽 夏生〉對對手造成 1 點傷害。');
                engine.sendDamageToOpponent(1);
            }
            if (onComplete) onComplete();
        }
    };

    // 33. UA43BT/SMD-1-073 LABO (場域起動：橫置+棄1手牌，選1張LABO本回合不被BP4000+阻擋)
    scripts['UA43BT/SMD-1-073'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest') && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            engine.promptModal({
                title: '起動メイン：LABO', desc: '捨棄 1 張手牌：',
                cards: handCards, selectCount: 1, upTo: false,
                onConfirm: (disc) => {
                    if (disc.length === 0) { if (onComplete) onComplete(); return; }
                    cardEl.classList.add('rest');
                    engine.moveCardToZone(disc[0], document.getElementById('my-outside-area'));
                    const labos = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                        .filter(c => engine.getCardDef(c)?.traits?.includes('LABO'));
                    if (labos.length === 0) { if (onComplete) onComplete(); return; }
                    engine.promptModal({
                        title: '選擇［特徴：LABO］', desc: '選擇 1 張獲得「不被 BP 4000 以上角色防禦」：',
                        cards: labos, selectCount: 1, upTo: false,
                        onConfirm: (sel) => {
                            if (sel.length > 0) showSysMsg(`〈${engine.getCardDef(sel[0])?.name}〉本回合不會被 BP 4000 以上角色防禦。`);
                            if (onComplete) onComplete();
                        }
                    });
                }
            });
        }
    };

    // 38. UA43BT/SMD-1-078 そろそろ定時なんで上がらせてもらうわ (事件：對手前線1張BP - 1000*我方LABO張數)
    scripts['UA43BT/SMD-1-078'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const delta = -1000 * countMyLabo(engine);
            if (delta === 0) { showSysMsg('場上沒有［特徴：LABO］。'); if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: delta, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 40. UA43BT/SMD-1-080 楽しい実験のはじまりだ～ (事件：活動1張AP並提醒對手下回合移動限制)
    scripts['UA43BT/SMD-1-080'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.activateMyApCards(1);
            sendSystemChat('[效果] 〈楽しい実験のはじまりだ～〉：對手下回合移動階段無法從能源線移至前線，但可從前線移至能源線。');
            if (onComplete) onComplete();
        }
    };

    if (typeof window.registerCardScripts === 'function') {
        window.registerCardScripts(scripts);
    } else {
        window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
    }
})();
