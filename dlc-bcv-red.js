/**
 * UA DLC 腳本包：黑色五葉草 (Black Clover) - 紅色 (共 53 張)
 * 檔名：dlc-bcv-red.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function getFacedownUnder(cardEl) {
        const slot = cardEl?.parentElement;
        if (!slot) return [];
        return Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl && c.classList.contains('is-flipped'));
    }

    function putDeckTopFacedownUnder(targetCardEl) {
        const deckArea = document.getElementById('my-deck-area');
        const allDeck = Array.from(deckArea.querySelectorAll('.card'));
        if (allDeck.length === 0 || !targetCardEl?.parentElement) return false;
        const top = allDeck[allDeck.length - 1];
        const slot = targetCardEl.parentElement;
        slot.insertBefore(top, slot.firstChild);
        top.classList.add('is-flipped');
        top.classList.remove('rest', 'in-life');
        top.style.position = 'absolute';
        recalcStacking(deckArea);
        recalcStacking(slot);
        updateSlotCounts();
        broadcastMyState();
        return true;
    }

    // UA20BT/BCV-1-069 ロロペチカ
    scripts['UA20BT/BCV-1-069'] = {
        getContinuousBpBonus(engine) { return engine.countEventsInMyOutside() >= 4 ? 1500 : 0; }
    };

    // UA20BT/BCV-1-070 ロロペチカ
    scripts['UA20BT/BCV-1-070'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.countEventsInMyOutside() >= 4) ? 500 : 0; }
    };

    // UA20BT/BCV-1-071 ロロペチカ
    scripts['UA20BT/BCV-1-071'] = {
        onPlay(engine, cardEl, onComplete) {
            const evCands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'EVENT' && d.color === 'RED' && (d.requiredEnergy?.count || 0) <= 2;
            });
            if (evCands.length === 0 || document.querySelectorAll('#my-hand-area .card').length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：ロロペチカ', desc: '是否捨棄 1 張手牌，從場外回收 1 張 2 費以下紅色事件卡？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '捨棄 1 手牌並回收', color: '#4f9678',
                        onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                            engine.promptModal({
                                title: '選擇場外 2 費以下紅色事件卡', desc: '選擇最多 1 張加入手牌：',
                                cards: evCands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }
                            });
                        })
                    },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // UA20BT/BCV-1-072 リーベ
    scripts['UA20BT/BCV-1-072'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            if (handCards.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：リーベ', desc: '選擇 1 張手牌裏側墊在此角色底下：',
                cards: handCards, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0 && cardEl.parentElement) {
                        const slot = cardEl.parentElement;
                        slot.insertBefore(sel[0], slot.firstChild);
                        sel[0].classList.add('is-flipped'); sel[0].classList.remove('rest', 'in-life'); sel[0].style.position = 'absolute';
                        recalcStacking(slot); recalcStacking(document.getElementById('my-hand-area')); broadcastMyState();
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA20BT/BCV-1-075 アスタ (突襲)
    scripts['UA20BT/BCV-1-075'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 4000, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UAPR/BCV-1-075'] = scripts['UA20BT/BCV-1-075'];

    // UA20BT/BCV-1-076 グレイ
    scripts['UA20BT/BCV-1-076'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest') && document.querySelectorAll('#my-hand-area .card').length >= 1; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.retireCardFromSlot(slot);
                const cands = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => {
                    const d = engine.getCardDef(c);
                    return d && d.type === 'CHARACTER' && d.color === 'RED' && d.traits?.includes('黒の暴牛') && (d.requiredEnergy?.count || 0) <= 3 && (d.apCost ?? 1) === 1;
                });
                if (cands.length === 0) { if (onComplete) onComplete(); return; }
                engine.promptModal({
                    title: '起動メイン：グレイ', desc: '從手牌選擇最多 1 張 3 費以下 AP1 紅色［特徴：黒の暴牛］活動登場並 BP+1000：',
                    cards: cands, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: false }, (p) => {
                                if (p) { engine.addSlotBp(p, 1000); engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete); }
                                else if (onComplete) onComplete();
                            });
                        } else if (onComplete) onComplete();
                    }
                });
            });
        }
    };

    // UA20BT/BCV-1-077 ゴーシュ・アドレイ
    scripts['UA20BT/BCV-1-077'] = {
        onPlay(engine, cardEl, onComplete) { putDeckTopFacedownUnder(cardEl); if (onComplete) onComplete(); },
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && getFacedownUnder(cardEl).length > 0; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const under = getFacedownUnder(cardEl);
            if (under.length === 0) { if (onComplete) onComplete(); return; }
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.moveCardToZone(under[0], document.getElementById('my-outside-area'));
            engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
            if (onComplete) onComplete();
        }
    };
    scripts['UA20ST/BCV-1-077'] = scripts['UA20BT/BCV-1-077'];

    // UA20BT/BCV-1-079 ナハト・ファウスト
    scripts['UA20BT/BCV-1-079'] = {
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); },
        onAttack(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                const n = engine.getCardDef(c)?.name || '';
                return n.includes('アスタ') || n.includes('リーベ');
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：ナハト・ファウスト', desc: '選擇最多 1 張〈アスタ〉或〈リーベ〉BP+1000 並將牌頂 1 張裏側墊底：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) { engine.addSlotBp(sel[0].parentElement, 1000); putDeckTopFacedownUnder(sel[0]); }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA20BT/BCV-1-082 ノエル・シルヴァ
    scripts['UA20BT/BCV-1-082'] = {
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn && engine.usedEventThisTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [{ type: 'LOOK_AND_ARRANGE_TOP', count: 1, keepUpTo: 1, upTo: true, remainderTo: 'OUTSIDE' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA20BT/BCV-1-083 ノエル・シルヴァ (突襲)
    scripts['UA20BT/BCV-1-083'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return engine.usedEventThisTurn ? 1000 : 0; },
        getContinuousImpact(engine) { return engine.usedEventThisTurn ? 1 : 0; },
        onPlay(engine, cardEl, onComplete) {
            const evCnt = engine.countEventsInMyOutside();
            if (evCnt >= 2) engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 3000;
            if (evCnt >= 4) showSysMsg('〈ノエル・シルヴァ〉場外事件達 4 張以上：對手若可能必須防禦此卡的攻擊。');
            if (onComplete) onComplete();
        }
    };

    // UA20BT/BCV-1-085 フィンラル
    scripts['UA20BT/BCV-1-085'] = {
        onPlay(engine, cardEl, onComplete) { putDeckTopFacedownUnder(cardEl); if (onComplete) onComplete(); }
    };
    scripts['UA20ST/BCV-1-085'] = scripts['UA20BT/BCV-1-085'];

    // UA20BT/BCV-1-086 ヘンリー
    scripts['UA20BT/BCV-1-086'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['PURPLE', 'GREEN'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA20BT/BCV-1-088 ヤミ・スケヒロ
    scripts['UA20BT/BCV-1-088'] = {
        onPlay(engine, cardEl, onComplete) {
            const withUnder = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => getFacedownUnder(c).length > 0);
            if (withUnder.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：ヤミ・スケヒロ', desc: '是否將我方角色底下 1 張裏側卡片送場外並抽 1 張牌？',
                cards: withUnder, selectCount: 1, upTo: true,
                customButtons: [{ label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const u = getFacedownUnder(sel[0]);
                        if (u.length > 0) { engine.moveCardToZone(u[0], document.getElementById('my-outside-area')); engine.drawCards(1); }
                    }
                    if (onComplete) onComplete();
                }
            });
        },
        onAttack(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('黒の暴牛'));
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：ヤミ・スケヒロ', desc: '選擇最多 1 張其他［特徴：黒の暴牛］，將牌頂 1 張裏側墊底：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) putDeckTopFacedownUnder(sel[0]); if (onComplete) onComplete(); }
            });
        }
    };

    // UA20BT/BCV-1-093 ミモザ (突襲)
    scripts['UA20BT/BCV-1-093'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            engine.promptModal({
                title: '登場時效果：ミモザ・ヴァーミリオン', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    {
                        label: '下次 2 費以下事件卡消費 AP -1', color: '#4f9678',
                        onClick: () => {
                            engine.pendingApDiscounts.push({ amount: 1, desc: '2費以下事件 AP-1', matchFn: (d) => d.type === 'EVENT' && (d.requiredEnergy?.count || 0) <= 2 });
                            if (onComplete) onComplete();
                        }
                    },
                    {
                        label: '捨棄 1 張手牌事件卡，場外回收 AP1 紅色角色 1 張', color: '#e67e22',
                        onClick: () => {
                            const evHand = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => engine.getCardDef(c)?.type === 'EVENT');
                            const outRed = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                                const d = engine.getCardDef(c);
                                return d && d.type === 'CHARACTER' && d.color === 'RED' && (d.apCost ?? 1) === 1;
                            });
                            if (evHand.length === 0 || outRed.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '捨棄 1 張手牌事件卡', desc: '選擇 1 張事件卡送場外：', cards: evHand, selectCount: 1, upTo: true,
                                onConfirm: (s1) => {
                                    if (s1.length === 0) { if (onComplete) onComplete(); return; }
                                    engine.moveCardToZone(s1[0], document.getElementById('my-outside-area'));
                                    engine.promptModal({
                                        title: '回收 AP1 紅色角色', desc: '選擇最多 1 張加入手牌：', cards: outRed, selectCount: 1, upTo: true,
                                        onConfirm: (s2) => { if (s2.length > 0) engine.moveCardToZone(s2[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }
                                    });
                                }
                            });
                        }
                    }
                ]
            });
        }
    };

    // UA20BT/BCV-1-094 ユノ
    scripts['UA20BT/BCV-1-094'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('アスタ')) ? 500 : 0; }
    };

    // UA20BT/BCV-1-097 海神戦乙女の羽衣鎧
    scripts['UA20BT/BCV-1-097'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
            if (myChars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '海神戦乙女の羽衣鎧', desc: '選擇 1 張我方角色 BP+2500 且不被 BP 2500 以下防禦：',
                cards: myChars, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.addSlotBp(sel[0].parentElement, 2500);
                        engine.getRuntime(sel[0]).tempKeywords.UNBLOCKABLE_MAX_BP = 2500;
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA20BT/BCV-1-098 海竜の巣
    scripts['UA20BT/BCV-1-098'] = {
        onEventPlay(engine, cardEl, onComplete) {
            if (engine.hasCharacterOnMyField('ノエル・シルヴァ')) engine.activateMyApCards(1);
            showSysMsg('〈海竜の巣〉指定前線 1 角色至下次我方回合開始前不會被對手效果選擇。');
            if (onComplete) onComplete();
        }
    };

    // UA20BT/BCV-1-099 全智の巫女
    scripts['UA20BT/BCV-1-099'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(2, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `全智の巫女（檢視牌頂 ${cnt} 張）`, desc: '選擇 1 張加入手牌（其餘放回牌頂）：',
                cards: topCards, selectCount: 1, upTo: false,
                onConfirm: (picked) => {
                    picked.forEach(c => {
                        engine.moveCardToZone(c, document.getElementById('my-hand-area'));
                        const d = engine.getCardDef(c);
                        if (d && (d.name.includes('ノエル') || d.name.includes('ミモザ') || d.name.includes('ロロペチカ') || (d.type === 'EVENT' && (d.requiredEnergy?.count || 0) <= 2))) {
                            engine.activateMyApCards(1);
                        }
                    });
                    topCards.filter(c => !picked.includes(c)).forEach(c => { deckArea.appendChild(c); c.classList.add('is-flipped'); });
                    recalcStacking(deckArea); broadcastMyState();
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA20BT/BCV-1-100 断魔の剣
    scripts['UA20BT/BCV-1-100'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('アスタ') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA20ST/BCV-1-100'] = scripts['UA20BT/BCV-1-100'];

    // UA20ST/BCV-1-101 メレオレオナ
    scripts['UA20ST/BCV-1-101'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; }
    };

    // UA20ST/BCV-1-103 アスタ (突襲)
    scripts['UA20ST/BCV-1-103'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            putDeckTopFacedownUnder(cardEl);
            showSysMsg('〈アスタ〉可指定對手前線 1 角色至下次我方回合開始前失去原有效果。');
            if (onComplete) onComplete();
        },
        onAttack(engine, cardEl, onComplete) {
            const rt = engine.getRuntime(cardEl);
            const under = getFacedownUnder(cardEl);
            if (rt.usedOncePerTurn || under.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：アスタ', desc: '是否將此角色底下 1 張裏側卡片送場外，獲得 [インパクト(1)]？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '送場外並獲得 [インパクト(1)]', color: '#c1596f',
                        onClick: () => {
                            rt.usedOncePerTurn = true;
                            engine.moveCardToZone(under[0], document.getElementById('my-outside-area'));
                            rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                            if (onComplete) onComplete();
                        }
                    },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // UA20ST/BCV-1-109 緊急会議
    scripts['UA20ST/BCV-1-109'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.retireCardFromSlot(slot);
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'RED' && (d.requiredEnergy?.count || 0) <= 3;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：緊急会議', desc: '從場外選擇最多 2 張 3 費以下紅色角色加入手牌：',
                cards: cands, selectCount: 2, upTo: true,
                onConfirm: (sel) => { sel.forEach(c => engine.moveCardToZone(c, document.getElementById('my-hand-area'))); if (onComplete) onComplete(); }
            });
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
