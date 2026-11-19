/**
 * UA DLC 腳本包：Re:從零開始的異世界生活 - 紫色 (二彈 EX17BT/REZ-2，共 10 張)
 * 檔名：dlc-rez-purple.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // 排程「戰鬥階段開始時活動 AP」的輕量掛鉤（免改主引擎）
    let pendingAttackPhaseApActivate = 0;
    function scheduleAttackPhaseAp(count = 1) {
        pendingAttackPhaseApActivate += count;
        if (!window._rezPurplePhaseHooked && window.uaEngine) {
            window._rezPurplePhaseHooked = true;
            const origOnPhaseChanged = window.uaEngine.onPhaseChanged.bind(window.uaEngine);
            window.uaEngine.onPhaseChanged = function (newPhase) {
                origOnPhaseChanged(newPhase);
                if (newPhase === '戰鬥' && pendingAttackPhaseApActivate > 0) {
                    const cnt = pendingAttackPhaseApActivate;
                    pendingAttackPhaseApActivate = 0;
                    window.uaEngine.activateMyApCards(cnt);
                    showSysMsg(`⚡ 【戰鬥階段開始】已自動將 ${cnt} 張 AP 卡轉為活動狀態！`);
                } else if (newPhase === '結束' || newPhase === '起始') {
                    pendingAttackPhaseApActivate = 0;
                }
            };
        }
    }

    // 01. EX17BT/REZ-2-022 ナツキ・スバル
    // [登場時]看牌頂2張，選最多1張〈ナツキ・スバル〉/〈ベアトリス〉/〈禁書庫〉放場外，其餘任意順序放回牌頂
    scripts['EX17BT/REZ-2-022'] = {
        onPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const outsideArea = document.getElementById('my-outside-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(2, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();

            engine.promptModal({
                title: `🔍 【ナツキ・スバル】檢視牌頂 ${cnt} 張`,
                desc: '請選最多 1 張〈ナツキ・スバル〉、〈ベアトリス〉或〈禁書庫〉放置於【場外】，其餘放回牌組頂端：',
                cards: topCards,
                cardFilterFn: (c) => {
                    const n = engine.getCardDef(c)?.name || '';
                    return n.includes('ナツキ・スバル') || n.includes('ベアトリス') || n.includes('禁書庫');
                },
                selectCount: 1,
                upTo: true,
                onConfirm: (picked) => {
                    picked.forEach(c => engine.moveCardToZone(c, outsideArea));
                    const rest = topCards.filter(c => !picked.includes(c));
                    if (rest.length <= 1) {
                        rest.forEach(c => { deckArea.appendChild(c); c.classList.add('is-flipped'); });
                        recalcStacking(deckArea);
                        broadcastMyState();
                        if (onComplete) onComplete();
                        return;
                    }
                    // 若剩餘 2 張，讓玩家決定放回牌頂的順序
                    engine.promptModal({
                        title: '⬆️ 排列放回牌組頂端的順序',
                        desc: '請依序點選（第 1 張將在最頂端）：',
                        cards: rest,
                        selectCount: rest.length,
                        upTo: false,
                        showOrderNumbers: true,
                        onConfirm: (ordered) => {
                            [...ordered].reverse().forEach(c => { deckArea.appendChild(c); c.classList.add('is-flipped'); });
                            recalcStacking(deckArea);
                            broadcastMyState();
                            if (onComplete) onComplete();
                        }
                    });
                }
            });
        }
    };

    // 02. EX17BT/REZ-2-023 フォルトナ
    // [登場時]轉為活動，本回合無法攻擊
    // [退場時]可棄1手牌，從場外將必要能源0的紫色〈エミリア〉1張休息登場至能源線
    scripts['EX17BT/REZ-2-023'] = {
        onPlay(engine, cardEl, onComplete) {
            cardEl.classList.remove('rest');
            engine.getRuntime(cardEl).tempKeywords.CANNOT_ATTACK = 1;
            showSysMsg('⚡ 【フォルトナ】登場轉為活動狀態（本回合無法進行攻擊）。');
            if (onComplete) onComplete();
        },
        onRetire(engine, cardEl, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            const emilias = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'PURPLE' && (d.requiredEnergy?.count || 0) === 0 && d.name.includes('エミリア');
            });
            if (handCards.length === 0 || emilias.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '💡 【フォルトナ】退場時選發效果',
                desc: '是否捨棄 1 張手牌，從場外將必要能源 0 的紫色〈エミリア〉1 張休息登場至能源線？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '✅ 捨棄 1 手牌並發動',
                        color: '#2ecc71',
                        onClick: () => {
                            engine.promptModal({
                                title: '🗑️ 選擇 1 張手牌捨棄',
                                desc: '選擇 1 張手牌放置於場外：',
                                cards: handCards, selectCount: 1, upTo: false,
                                onConfirm: (disc) => {
                                    const outside = document.getElementById('my-outside-area');
                                    disc.forEach(c => engine.moveCardToZone(c, outside));
                                    engine.promptModal({
                                        title: '✨ 選擇場外 0 費紫色〈エミリア〉',
                                        desc: '選擇最多 1 張以休息狀態登場至能源線：',
                                        cards: emilias, selectCount: 1, upTo: true,
                                        onConfirm: (sel) => {
                                            if (sel.length > 0) {
                                                engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: false, allowEnergy: true, enterRest: true }, (placed) => {
                                                    if (placed) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                                                    else if (onComplete) onComplete();
                                                });
                                            } else if (onComplete) onComplete();
                                        }
                                    });
                                }
                            });
                        }
                    },
                    { label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 03. EX17BT/REZ-2-024 ベアトリス
    // 場上0卡時手牌減2紫費；[起動メイン][付1AP][ターン1]選1手牌放牌頂 -> 本回合BP+2000，戰鬥階段開始時活動1AP
    scripts['EX17BT/REZ-2-024'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        },
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn
                && engine.getActiveApCards().length >= 1
                && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            if (handCards.length === 0 || !engine.payAp(1)) { if (onComplete) onComplete(); return; }
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.addSlotBp(slot, 2000);
                scheduleAttackPhaseAp(1);
                showSysMsg('✨ 【ベアトリス】BP+2000！進入戰鬥階段時將自動活動 1 張 AP 卡。');
                if (onComplete) onComplete();
            });
        }
    };

    // 04. EX17BT/REZ-2-025 ベアトリス
    // [登場時]賦予我方〈ナツキ・スバル〉抗性，並二選一：有スバル時抽1 / 戰鬥階段開始時活動1AP
    scripts['EX17BT/REZ-2-025'] = {
        onPlay(engine, cardEl, onComplete) {
            showSysMsg('🛡️ 【ベアトリス】本回合對手以效果選擇我方〈ナツキ・スバル〉時，須額外捨棄 1 張手牌！');
            const hasSubaru = engine.hasCharacterOnMyField('ナツキ・スバル');
            const buttons = [];
            if (hasSubaru) {
                buttons.push({
                    label: '🃏 抽 1 張牌（場上有〈ナツキ・スバル〉）',
                    color: '#4f9678',
                    onClick: () => { engine.drawCards(1); if (onComplete) onComplete(); }
                });
            }
            buttons.push({
                label: '⚡ 戰鬥階段開始時活動 1 張 AP 卡',
                color: '#e67e22',
                onClick: () => {
                    scheduleAttackPhaseAp(1);
                    showSysMsg('⏳ 已排程：進入戰鬥階段時自動活動 1 張 AP 卡！');
                    if (onComplete) onComplete();
                }
            });
            engine.promptModal({
                title: '✨ 【ベアトリス】登場時效果選擇',
                desc: '請選擇 1 項效果發動：',
                cards: [],
                customButtons: buttons
            });
        }
    };

    // 05. EX17BT/REZ-2-026 リューズ・メイエル
    // [起動メイン][橫置][退場自己]場上有〈エキドナ〉或〈ベアトリス〉時，場外回收非S/非F的3費以下紫事件1張
    scripts['EX17BT/REZ-2-026'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest')
                && (engine.hasCharacterOnMyField('エキドナ') || engine.hasCharacterOnMyField('ベアトリス'));
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.retireCardFromSlot(slot);
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                if (!d || d.type !== 'EVENT' || d.color !== 'PURPLE' || (d.requiredEnergy?.count || 0) > 3) return false;
                const tTxt = d.triggerText || '';
                const tType = d.compiledRules?.trigger?.type || '';
                return tType !== 'SPECIAL' && tType !== 'FINAL' && !tTxt.includes('[スペシャル]') && !tTxt.includes('[ファイナル]');
            });
            if (cands.length === 0) { showSysMsg('ℹ️ 場外沒有符合條件的 3 費以下紫色事件卡。'); if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '♻️ 【リューズ・メイエル】回收紫色事件卡',
                desc: '選擇最多 1 張非 [スペシャル]／非 [ファイナル] 且 3 費以下的紫色事件卡加入手牌：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area'));
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 06. EX17BT/REZ-2-027 エミリア
    // [起動メイン][前線][ターン1]本回合曾因我方效果從活動變休息時，轉為活動
    scripts['EX17BT/REZ-2-027'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line')
                && !engine.getRuntime(cardEl).usedOncePerTurn
                && cardEl.classList.contains('rest');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            cardEl.classList.remove('rest');
            showSysMsg('⚡ 【エミリア】起動效果：轉為活動狀態！');
            if (onComplete) onComplete();
        }
    };

    // 07. EX17BT/REZ-2-028 エミリア
    // [登場時]有［特徴：魔女］抽1；[起動メイン][棄1手牌][ターン1]本回合產生能源+[紫]
    scripts['EX17BT/REZ-2-028'] = {
        onPlay(engine, cardEl, onComplete) {
            if (engine.hasTraitOnMyField('魔女')) engine.drawCards(1);
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn
                && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            engine.promptModal({
                title: '🗑️ 【エミリア】捨棄 1 張手牌',
                desc: '捨棄 1 張手牌，本回合產生能源 +[紫]：',
                cards: handCards, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                        const rt = engine.getRuntime(cardEl);
                        rt.usedOncePerTurn = true;
                        rt.tempEnergyBoost.push({ color: 'PURPLE', count: 1 });
                        showSysMsg('🟣 【エミリア】本回合產生能源 +[紫]！');
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 08. EX17BT/REZ-2-029 エキドナ
    // [登場時]可棄1手牌 -> 看牌頂1張放牌頂或牌底，並抽1張
    scripts['EX17BT/REZ-2-029'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{
                type: 'OPTIONAL_COST_BRANCH',
                cost: { type: 'DISCARD_HAND', count: 1, desc: '捨棄 1 張手牌' },
                thenActions: [
                    { type: 'LOOK_TOP_DECK', count: 1, pickUpTo: 0, remainderTo: 'TOP_OR_BOTTOM' },
                    { type: 'DRAW', amount: 1 }
                ]
            }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 09. EX17BT/REZ-2-030 エキドナ
    // [登場時]選我方帶有特徵的角色最多1張，賦予本回合無法攻擊並移至另一條線
    // [起動メイン][ターン1][登場當回合限定]橫置我方前線1張活動角色，二選一：對手前線BP2000以上-1500 / 我方其他角色+2000
    scripts['EX17BT/REZ-2-030'] = {
        onPlay(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && Array.isArray(d.traits) && d.traits.length > 0;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '🔄 【エキドナ】登場時移動帶有特徵的角色',
                desc: '選擇最多 1 張我方帶有［特徴］的角色，賦予本回合無法攻擊並移動至另一條線：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const target = sel[0];
                        engine.getRuntime(target).tempKeywords.CANNOT_ATTACK = 1;
                        const toFront = !!target.parentElement.closest('#my-energy-line');
                        const destSlot = Array.from(document.querySelectorAll(toFront ? '#my-front-line .slot' : '#my-energy-line .slot'))
                            .find(s => s.querySelectorAll('.card').length === 0);
                        if (destSlot) {
                            Array.from(target.parentElement.querySelectorAll('.card')).forEach(x => destSlot.appendChild(x));
                            recalcStacking(destSlot);
                            showSysMsg(`🔄 已將【${engine.getCardDef(target)?.name}】移至${toFront ? '前線' : '能源線'}（本回合無法攻擊）。`);
                        } else {
                            showSysMsg('❌ 另一條線沒有空位可移動！');
                        }
                    }
                    if (onComplete) onComplete();
                }
            });
        },
        canActivateMain(engine, cardEl) {
            const rt = engine.getRuntime(cardEl);
            if (!rt.enteredThisTurn || rt.usedOncePerTurn) return false;
            return engine.getSlotTopCards('#my-front-line .slot').some(c => !c.classList.contains('rest'));
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const activeFl = engine.getSlotTopCards('#my-front-line .slot').filter(c => !c.classList.contains('rest'));
            if (activeFl.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⚡ 【エキドナ】選擇前線活動角色轉為休息',
                desc: '請選擇 1 張我方前線活動角色轉為休息狀態：',
                cards: activeFl, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    engine.getRuntime(cardEl).usedOncePerTurn = true;
                    sel[0].classList.add('rest');
                    broadcastMyState();
                    engine.promptModal({
                        title: '⚡ 【エキドナ】效果二選一',
                        desc: '請選擇 1 項效果發動：',
                        cards: [],
                        customButtons: [
                            {
                                label: '⬇️ 對手前線 BP 2000 以上 1 張 BP-1500',
                                color: '#c1596f',
                                onClick: () => {
                                    const oppCands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 2000);
                                    if (oppCands.length === 0) { if (onComplete) onComplete(); return; }
                                    engine.promptModal({
                                        title: '⬇️ 選擇對手前線角色 BP-1500',
                                        desc: '選擇最多 1 張 BP 2000 以上的角色：',
                                        cards: oppCands, selectCount: 1, upTo: true,
                                        onConfirm: (s) => { if (s.length > 0) engine.addSlotBp(s[0].parentElement, -1500); if (onComplete) onComplete(); }
                                    });
                                }
                            },
                            {
                                label: '⚔️ 我方其他角色 1 張 BP+2000',
                                color: '#4f9678',
                                onClick: () => {
                                    engine.executeAbilityActions(cardEl, [
                                        { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: true },
                                        { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
                                    ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                                }
                            }
                        ]
                    });
                }
            });
        }
    };

    // 10. EX17BT/REZ-2-031 魔晶石 (事件：抽1，場外回收〈ベアトリス〉1張)
    scripts['EX17BT/REZ-2-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name.includes('ベアトリス'));
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '♻️ 【魔晶石】回收〈ベアトリス〉',
                desc: '從場外選擇最多 1 張〈ベアトリス〉加入手牌：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area'));
                    if (onComplete) onComplete();
                }
            });
        }
    };

    if (typeof window.registerCardScripts === 'function') {
        window.registerCardScripts(scripts);
    } else {
        window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
    }
})();
