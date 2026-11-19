/**
 * UA DLC 腳本包：Re:從零開始的異世界生活 - 紫色 (一彈 + 二彈，共 48 張)
 * 檔名：dlc-rez-purple.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // 排程「戰鬥階段開始時活動 AP」的輕量掛鉤
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

    // 共用：公開牌頂 1 張，若符合指定名稱且滿足必要能源，可免費休息登場或突襲，否則加入手牌
    function revealTopAndPlayBeatriceOrSubaru(engine, allowedNames, onComplete) {
        const deckArea = document.getElementById('my-deck-area');
        const handArea = document.getElementById('my-hand-area');
        const allDeck = Array.from(deckArea.querySelectorAll('.card'));
        if (allDeck.length === 0) {
            showSysMsg('ℹ️ 牌組已無卡片可公開。');
            if (onComplete) onComplete();
            return;
        }
        const topCard = allDeck[allDeck.length - 1];
        const topDef = engine.getCardDef(topCard);
        const topName = topDef?.name || topCard.dataset.cardId;
        sendSystemChat(`📢 [牌頂公開] 對手公開了牌組頂端的【${topName}】！`);

        const nameMatch = topDef && allowedNames.some(n => topDef.name && topDef.name.includes(n));
        const myEn = engine.calculateMyEnergy();
        const req = topDef?.requiredEnergy || { color: 'NONE', count: 0 };
        const enOk = req.count === 0 || req.color === 'NONE' || (myEn[req.color] || 0) >= req.count;
        const canPlay = !!(nameMatch && enOk);

        const buttons = [];
        if (canPlay) {
            // 檢查是否有合法突襲目標
            const raidTargets = [];
            if (topDef.compiledRules?.raidCondition) {
                document.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(s => {
                    if (engine.canRaidOntoSlot(topDef, s)) {
                        const top = engine.getTopCardInSlot(s);
                        if (top) raidTargets.push(top);
                    }
                });
            }
            if (raidTargets.length > 0) {
                buttons.push({
                    label: `🔥 免費突襲 (レイド)【${topName}】！`,
                    color: '#c1596f',
                    onClick: () => {
                        engine.playedFromDeckThisTurn = true;
                        engine.getRuntime(topCard).enteredFromDeck = true;
                        engine.promptModal({
                            title: `🔥 選擇突襲目標：【${topName}】`,
                            desc: '請點選場上合法目標進行免費突襲：',
                            cards: raidTargets, selectCount: 1, upTo: false,
                            onConfirm: (sel) => {
                                if (sel.length > 0) {
                                    const targetSlot = sel[0].parentElement;
                                    const isEn = !!targetSlot.closest('#my-energy-line');
                                    const hasEmptyFront = Array.from(document.querySelectorAll('#my-front-line .slot')).some(s => s.querySelectorAll('.card').length === 0);
                                    engine.executeRaidSummon(topCard, topDef, targetSlot, isEn && hasEmptyFront, deckArea, 0, window.finalizeDrop, true, onComplete);
                                } else if (onComplete) onComplete();
                            }
                        });
                    }
                });
            }
            buttons.push({
                label: `✨ 免費休息登場【${topName}】`,
                color: '#2ecc71',
                onClick: () => {
                    engine.playedFromDeckThisTurn = true;
                    engine.getRuntime(topCard).enteredFromDeck = true;
                    engine.chooseEmptyFieldSlotAndPlace(topCard, { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                        if (placed) engine.triggerCardAbilities(topCard, 'ON_PLAY', onComplete);
                        else {
                            engine.moveCardToZone(topCard, handArea);
                            if (onComplete) onComplete();
                        }
                    });
                }
            });
        }
        buttons.push({
            label: '✋ 加入手牌',
            color: '#4f739e',
            onClick: () => {
                engine.moveCardToZone(topCard, handArea);
                if (onComplete) onComplete();
            }
        });

        engine.promptModal({
            title: `📢 牌頂公開：【${topName}】`,
            desc: canPlay ? '滿足條件！可選擇免費登場／突襲，或加入手牌：' : '未滿足條件，將加入手牌：',
            cards: [topCard],
            customButtons: buttons
        });
    }

    // ==================== 二彈 (EX17BT/REZ-2，共 10 張) ====================

    // 01. EX17BT/REZ-2-022 ナツキ・スバル
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
                selectCount: 1, upTo: true,
                onConfirm: (picked) => {
                    picked.forEach(c => engine.moveCardToZone(c, outsideArea));
                    const rest = topCards.filter(c => !picked.includes(c));
                    if (rest.length <= 1) {
                        rest.forEach(c => { deckArea.appendChild(c); c.classList.add('is-flipped'); });
                        recalcStacking(deckArea); broadcastMyState();
                        if (onComplete) onComplete(); return;
                    }
                    engine.promptModal({
                        title: '⬆️ 排列放回牌組頂端的順序',
                        desc: '請依序點選（第 1 張將在最頂端）：',
                        cards: rest, selectCount: rest.length, upTo: false, showOrderNumbers: true,
                        onConfirm: (ordered) => {
                            [...ordered].reverse().forEach(c => { deckArea.appendChild(c); c.classList.add('is-flipped'); });
                            recalcStacking(deckArea); broadcastMyState();
                            if (onComplete) onComplete();
                        }
                    });
                }
            });
        }
    };

    // 02. EX17BT/REZ-2-023 フォルトナ
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
                                title: '🗑️ 選擇 1 張手牌捨棄', desc: '選擇 1 張手牌放置於場外：',
                                cards: handCards, selectCount: 1, upTo: false,
                                onConfirm: (disc) => {
                                    disc.forEach(c => engine.moveCardToZone(c, document.getElementById('my-outside-area')));
                                    engine.promptModal({
                                        title: '✨ 選擇場外 0 費紫色〈エミリア〉', desc: '選擇最多 1 張以休息狀態登場至能源線：',
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
    scripts['EX17BT/REZ-2-025'] = {
        onPlay(engine, cardEl, onComplete) {
            showSysMsg('🛡️ 【ベアトリス】本回合對手以效果選擇我方〈ナツキ・スバル〉時，須額外捨棄 1 張手牌！');
            const buttons = [];
            if (engine.hasCharacterOnMyField('ナツキ・スバル')) {
                buttons.push({ label: '🃏 抽 1 張牌（場上有〈ナツキ・スバル〉）', color: '#4f9678', onClick: () => { engine.drawCards(1); if (onComplete) onComplete(); } });
            }
            buttons.push({
                label: '⚡ 戰鬥階段開始時活動 1 張 AP 卡', color: '#e67e22',
                onClick: () => { scheduleAttackPhaseAp(1); showSysMsg('⏳ 已排程：進入戰鬥階段時自動活動 1 張 AP 卡！'); if (onComplete) onComplete(); }
            });
            engine.promptModal({ title: '✨ 【ベアトリス】登場時效果選擇', desc: '請選擇 1 項效果發動：', cards: [], customButtons: buttons });
        }
    };

    // 05. EX17BT/REZ-2-026 リューズ・メイエル
    scripts['EX17BT/REZ-2-026'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest') && (engine.hasCharacterOnMyField('エキドナ') || engine.hasCharacterOnMyField('ベアトリス'));
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
                onConfirm: (sel) => { if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }
            });
        }
    };

    // 06. EX17BT/REZ-2-027 エミリア
    scripts['EX17BT/REZ-2-027'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn && cardEl.classList.contains('rest');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            cardEl.classList.remove('rest');
            showSysMsg('⚡ 【エミリア】起動效果：轉為活動狀態！');
            if (onComplete) onComplete();
        }
    };

    // 07. EX17BT/REZ-2-028 エミリア
    scripts['EX17BT/REZ-2-028'] = {
        onPlay(engine, cardEl, onComplete) {
            if (engine.hasTraitOnMyField('魔女')) engine.drawCards(1);
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            engine.promptModal({
                title: '🗑️ 【エミリア】捨棄 1 張手牌', desc: '捨棄 1 張手牌，本回合產生能源 +[紫]：',
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
                        } else showSysMsg('❌ 另一條線沒有空位可移動！');
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
                title: '⚡ 【エキドナ】選擇前線活動角色轉為休息', desc: '請選擇 1 張我方前線活動角色轉為休息狀態：',
                cards: activeFl, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    engine.getRuntime(cardEl).usedOncePerTurn = true;
                    sel[0].classList.add('rest');
                    broadcastMyState();
                    engine.promptModal({
                        title: '⚡ 【エキドナ】效果二選一', desc: '請選擇 1 項效果發動：', cards: [],
                        customButtons: [
                            {
                                label: '⬇️ 對手前線 BP 2000 以上 1 張 BP-1500', color: '#c1596f',
                                onClick: () => {
                                    const oppCands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 2000);
                                    if (oppCands.length === 0) { if (onComplete) onComplete(); return; }
                                    engine.promptModal({
                                        title: '⬇️ 選擇對手前線角色 BP-1500', desc: '選擇最多 1 張 BP 2000 以上的角色：',
                                        cards: oppCands, selectCount: 1, upTo: true,
                                        onConfirm: (s) => { if (s.length > 0) engine.addSlotBp(s[0].parentElement, -1500); if (onComplete) onComplete(); }
                                    });
                                }
                            },
                            {
                                label: '⚔️ 我方其他角色 1 張 BP+2000', color: '#4f9678',
                                onClick: () => engine.executeAbilityActions(cardEl, [
                                    { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: true },
                                    { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
                                ], 0, { selectedTargets: [], addedFromLook: false }, onComplete)
                            }
                        ]
                    });
                }
            });
        }
    };

    // 10. EX17BT/REZ-2-031 魔晶石
    scripts['EX17BT/REZ-2-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name.includes('ベアトリス'));
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '♻️ 【魔晶石】回收〈ベアトリス〉', desc: '從場外選擇最多 1 張〈ベアトリス〉加入手牌：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }
            });
        }
    };

    // ==================== 一彈 (UA40BT / UA40ST / UAPR，共 38 張) ====================

    // 01. UA40BT/REZ-1-067 ガーフィール (登場對手前線1張BP-2500；前線起動活動自己)
    scripts['UA40BT/REZ-1-067'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'MODIFY_BP', amount: -2500, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn && cardEl.classList.contains('rest');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            cardEl.classList.remove('rest');
            showSysMsg('⚡ 【ガーフィール】起動メイン：轉為活動狀態！');
            if (onComplete) onComplete();
        }
    };

    // 04. UA40BT/REZ-1-070 ナツキ・スバル (登場二選一：抽1選1手牌放牌頂或場外 / 付1AP公開牌頂1張若為滿足能源的ベアトリス可登場或突襲)
    scripts['UA40BT/REZ-1-070'] = {
        onPlay(engine, cardEl, onComplete) {
            const buttons = [
                {
                    label: '🃏 抽 1 張牌，選 1 手牌放牌頂或場外',
                    color: '#4f9678',
                    onClick: () => {
                        engine.drawCards(1);
                        engine.promptModal({
                            title: '選擇 1 張手牌去向', desc: '請選擇將 1 張手牌放回牌頂或場外：', cards: [],
                            customButtons: [
                                { label: '⬆️ 放回牌組頂端', color: '#4f739e', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                                { label: '🗑️ 放置於場外', color: '#c1596f', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) }
                            ]
                        });
                    }
                }
            ];
            if (engine.getActiveApCards().length >= 1) {
                buttons.push({
                    label: '⚡ 付 1 AP：公開牌頂 1 張（〈ベアトリス〉可免費登場/突襲）',
                    color: '#e67e22',
                    onClick: () => {
                        if (engine.payAp(1)) revealTopAndPlayBeatriceOrSubaru(engine, ['ベアトリス'], onComplete);
                        else if (onComplete) onComplete();
                    }
                });
            }
            engine.promptModal({ title: '✨ 【ナツキ・スバル】登場時效果選擇', desc: '請選擇 1 項效果：', cards: [], customButtons: buttons });
        }
    };

    // 05. UA40BT/REZ-1-071 ナツキ・スバル (突襲：登場看2選1送場外其餘放牌頂，抽1；攻擊時付1AP公開牌頂1張若為ベアトリス可登場/突襲)
    scripts['UA40BT/REZ-1-071'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'LOOK_AND_ARRANGE_TOP', count: 2, keepUpTo: 2, upTo: true, remainderTo: 'OUTSIDE' },
                { type: 'DRAW', amount: 1 }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        onAttack(engine, cardEl, onComplete) {
            const rt = engine.getRuntime(cardEl);
            if (rt.usedOncePerTurn || engine.getActiveApCards().length < 1) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '💡 【ナツキ・スバル】攻擊時選發效果 (需 1 AP)',
                desc: '是否支付 1 AP 公開牌頂 1 張（若為滿足能源的〈ベアトリス〉可免費登場或突襲）？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '✅ 支付 1 AP 並公開', color: '#2ecc71',
                        onClick: () => {
                            if (engine.payAp(1)) {
                                rt.usedOncePerTurn = true;
                                revealTopAndPlayBeatriceOrSubaru(engine, ['ベアトリス'], onComplete);
                            } else if (onComplete) onComplete();
                        }
                    },
                    { label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 09. UA40BT/REZ-1-075 ベアトリス (效果登場時抽1)
    scripts['UA40BT/REZ-1-075'] = {
        onPlay(engine, cardEl, onComplete) {
            if (engine.getRuntime(cardEl)?.enteredFromDeck) {
                engine.drawCards(1);
                showSysMsg('🃏 【ベアトリス】藉由效果登場：抽取 1 張牌！');
            }
            if (onComplete) onComplete();
        }
    };

    // 10. UA40BT/REZ-1-076 ベアトリス (前線起動：手牌1張放牌頂，本回合BP+1000)
    scripts['UA40BT/REZ-1-076'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.addSlotBp(slot, 1000);
                if (onComplete) onComplete();
            });
        }
    };

    // 11. UA40BT/REZ-1-077 ベアトリス (突襲：我方回合有スバルBP+500；登場選對手前線1張移至能源線)
    scripts['UA40BT/REZ-1-077'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('ナツキ・スバル')) ? 500 : 0;
        },
        onPlay(engine, cardEl, onComplete) {
            const fromEff = !!engine.getRuntime(cardEl)?.enteredFromDeck;
            showSysMsg(`🌀 【ベアトリス】請對手將前線最多 1 張角色移至能源線${fromEff ? '（並至下次我方回合開始前無法移動）' : ''}！`);
            if (onComplete) onComplete();
        }
    };

    // 12. UA40BT/REZ-1-078 ベアトリス (突襲：有スバル得衝擊1；登場活動我方スバル1張，若效果登場再抽1)
    scripts['UA40BT/REZ-1-078'] = {
        requireRaided: true,
        getContinuousImpact(engine) {
            return engine.hasCharacterOnMyField('ナツキ・スバル') ? 1 : 0;
        },
        onPlay(engine, cardEl, onComplete) {
            const fromEff = !!engine.getRuntime(cardEl)?.enteredFromDeck;
            const subarus = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('ナツキ・スバル'));
            const finish = () => {
                if (fromEff) engine.drawCards(1);
                if (onComplete) onComplete();
            };
            if (subarus.length === 0) { finish(); return; }
            engine.promptModal({
                title: '⚡ 【ベアトリス】活動〈ナツキ・スバル〉', desc: '選擇最多 1 張我方〈ナツキ・スバル〉轉為活動狀態：',
                cards: subarus, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) sel[0].classList.remove('rest'); finish(); }
            });
        }
    };

    // 13. UA40BT/REZ-1-079 ラム (對手場上有黃或藍卡減1紫費)
    scripts['UA40BT/REZ-1-079'] = {
        getEnergyDiscount(engine) {
            const opp = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot');
            return opp.some(c => ['YELLOW', 'BLUE'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // 21. UA40BT/REZ-1-087 エミリア (我方回合BP+1000；登場可移除場外〈”聖域”の”試練”〉1張使自己活動)
    scripts['UA40BT/REZ-1-087'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; },
        onPlay(engine, cardEl, onComplete) {
            const trials = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name.includes('試練'));
            if (trials.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '💡 【エミリア】登場時選發效果',
                desc: '是否將場外 1 張〈”聖域”の”試練”〉移至移除區，使此角色轉為活動狀態？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '✅ 移除〈”聖域”の”試練”〉並活動', color: '#2ecc71',
                        onClick: () => {
                            engine.moveCardToZone(trials[0], document.getElementById('my-remove-area'));
                            cardEl.classList.remove('rest');
                            if (onComplete) onComplete();
                        }
                    },
                    { label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 22. UA40BT/REZ-1-088 エミリア (前線起動：轉活動並至下次我方回合開始前 BP+1000)
    scripts['UA40BT/REZ-1-088'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn && cardEl.classList.contains('rest');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            rt.usedOncePerTurn = true;
            cardEl.classList.remove('rest');
            engine.addSlotBp(slot, 1000);
            rt.persistentBp = (rt.persistentBp || 0) + 1000;
            showSysMsg('⚡ 【エミリア】轉為活動，並獲得 BP+1000（持續至下次我方回合開始）！');
            if (onComplete) onComplete();
        }
    };

    // 23. UA40BT/REZ-1-089 エミリア (突襲：不被BP2000以下防禦；未被防禦時橫置對手前線1張；能源線起動與前線1張互換)
    scripts['UA40BT/REZ-1-089'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2000;
            if (onComplete) onComplete();
        },
        onUnblockedAttack(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'SET_REST', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-energy-line') && !engine.getRuntime(cardEl).usedOncePerTurn && engine.getSlotTopCards('#my-front-line .slot').length > 0;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const flChars = engine.getSlotTopCards('#my-front-line .slot');
            if (flChars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '🔄 【エミリア】與前線角色互換位置', desc: '請選擇 1 張我方前線角色與此卡互換位置：',
                cards: flChars, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        const flSlot = sel[0].parentElement;
                        const flCards = Array.from(flSlot.querySelectorAll('.card'));
                        const enCards = Array.from(slot.querySelectorAll('.card'));
                        flCards.forEach(c => slot.appendChild(c));
                        enCards.forEach(c => flSlot.appendChild(c));
                        recalcStacking(flSlot); recalcStacking(slot);
                        broadcastMyState();
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 24. UA40BT/REZ-1-090 エミリア (突襲：登場對手前線1張BP-3500；前線休息時起動退場對手BP1500以下1張，自己活動並得衝擊1)
    scripts['UA40BT/REZ-1-090'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'MODIFY_BP', amount: -3500, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn && cardEl.classList.contains('rest');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            rt.usedOncePerTurn = true;
            cardEl.classList.remove('rest');
            rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
            showSysMsg('🔥 【エミリア】轉為活動並獲得 [インパクト(1)]！');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 1500, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UAPR/REZ-1-090'] = scripts['UA40BT/REZ-1-090'];

    // 27. UA40BT/REZ-1-093 エキドナ (突襲：登場抽1；前線起動橫置我方前線1活動角色抽1)
    scripts['UA40BT/REZ-1-093'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); },
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn
                && engine.getSlotTopCards('#my-front-line .slot').some(c => !c.classList.contains('rest'));
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const activeFl = engine.getSlotTopCards('#my-front-line .slot').filter(c => !c.classList.contains('rest'));
            if (activeFl.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⚡ 【エキドナ】選擇前線活動角色轉為休息', desc: '選擇 1 張轉為休息並抽 1 張牌：',
                cards: activeFl, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        sel[0].classList.add('rest');
                        engine.drawCards(1);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 28. UA40BT/REZ-1-094 禁書庫 (場域：登場可棄1活動；起動橫置抽1並將1手牌放牌頂)
    scripts['UA40BT/REZ-1-094'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{
                type: 'OPTIONAL_COST_BRANCH',
                cost: { type: 'DISCARD_HAND', count: 1, desc: '捨棄 1 張手牌' },
                thenActions: [{ type: 'SET_ACTIVE', target: 'SELF' }]
            }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.drawCards(1);
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 30. UA40BT/REZ-1-096 エル・ミーニャ (事件：BP3000/有ベアトリス4000/有ベアトリス+スバル5000 退場)
    scripts['UA40BT/REZ-1-096'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasBea = engine.hasCharacterOnMyField('ベアトリス');
            const hasSub = engine.hasCharacterOnMyField('ナツキ・スバル');
            const maxBp = (hasBea && hasSub) ? 5000 : (hasBea ? 4000 : 3000);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 31. UA40BT/REZ-1-097 俺を選べ！ベアトリス!! (事件：看3任意張放牌頂其餘場外，再公開牌頂1張若為滿足能源のスバル/ベアトリス可登場或突襲)
    scripts['UA40BT/REZ-1-097'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'LOOK_AND_ARRANGE_TOP', count: 3, keepUpTo: 3, upTo: true, remainderTo: 'OUTSIDE' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                revealTopAndPlayBeatriceOrSubaru(engine, ['ナツキ・スバル', 'ベアトリス'], onComplete);
            });
        }
    };

    // 32. UA40BT/REZ-1-098 ”聖域”の”試練” (事件：抽2棄1，可橫置前線1活動角色使1AP活動)
    scripts['UA40BT/REZ-1-098'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'DRAW', amount: 2 },
                { type: 'DISCARD_HAND', count: 1 }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                const activeFl = engine.getSlotTopCards('#my-front-line .slot').filter(c => !c.classList.contains('rest'));
                if (activeFl.length === 0) { if (onComplete) onComplete(); return; }
                engine.promptModal({
                    title: '💡 【”聖域”の”試練”】追加效果',
                    desc: '是否將我方前線 1 張活動角色轉為休息，以將 1 張 AP 卡轉為活動？',
                    cards: activeFl, selectCount: 1, upTo: true,
                    customButtons: [{ label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            sel[0].classList.add('rest');
                            engine.activateMyApCards(1);
                        }
                        if (onComplete) onComplete();
                    }
                });
            });
        }
    };

    // 34. UA40BT/REZ-1-100 もう逃がしてあげないから！ (事件：BP3000/有エミリア5000 退場)
    scripts['UA40BT/REZ-1-100'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('エミリア') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 35. UA40ST/REZ-1-112 ベアトリス (我方回合本回合從牌組登場/突襲過則BP+500；效果登場時活動)
    scripts['UA40ST/REZ-1-112'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.playedFromDeckThisTurn) ? 500 : 0;
        },
        onPlay(engine, cardEl, onComplete) {
            if (engine.getRuntime(cardEl)?.enteredFromDeck) {
                cardEl.classList.remove('rest');
                showSysMsg('⚡ 【ベアトリス】藉由效果登場：轉為活動狀態！');
            }
            if (onComplete) onComplete();
        }
    };

    // 36. UA40ST/REZ-1-113 エキドナ (登場可棄1手牌或橫置前線1活動角色，場外回收〈”聖域”の”試練”〉1張)
    scripts['UA40ST/REZ-1-113'] = {
        onPlay(engine, cardEl, onComplete) {
            const trials = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name.includes('試練'));
            if (trials.length === 0) { if (onComplete) onComplete(); return; }
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            const activeFl = engine.getSlotTopCards('#my-front-line .slot').filter(c => !c.classList.contains('rest'));
            const buttons = [];
            if (handCards.length > 0) {
                buttons.push({
                    label: '🗑️ 捨棄 1 張手牌回收〈”聖域”の”試練”〉', color: '#4f9678',
                    onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                        engine.moveCardToZone(trials[0], document.getElementById('my-hand-area'));
                        if (onComplete) onComplete();
                    })
                });
            }
            if (activeFl.length > 0) {
                buttons.push({
                    label: '⚡ 橫置前線 1 張活動角色回收〈”聖域”の”試練”〉', color: '#e67e22',
                    onClick: () => {
                        engine.promptModal({
                            title: '選擇前線 1 張活動角色轉為休息', desc: '選擇 1 張轉為休息：',
                            cards: activeFl, selectCount: 1, upTo: false,
                            onConfirm: (sel) => {
                                if (sel.length > 0) {
                                    sel[0].classList.add('rest');
                                    engine.moveCardToZone(trials[0], document.getElementById('my-hand-area'));
                                }
                                if (onComplete) onComplete();
                            }
                        });
                    }
                });
            }
            buttons.push({ label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } });
            engine.promptModal({ title: '💡 【エキドナ】登場時回收〈”聖域”の”試練”〉', desc: '請選擇支付代價方式：', cards: [cardEl], customButtons: buttons });
        }
    };

    if (typeof window.registerCardScripts === 'function') {
        window.registerCardScripts(scripts);
    } else {
        window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
    }
})();
