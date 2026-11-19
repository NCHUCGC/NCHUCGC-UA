/**
 * UA DLC 腳本包：Hunter x Hunter 獵人 - 藍色 (一彈 + 二彈，共 50 張)
 * 檔名：dlc-hxh-blue.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // 輔助：計算我方場上與手牌中［特徴：指定ポケット］的不同卡名種類數
    function countDistinctPocketInFieldAndHand(engine) {
        const names = new Set();
        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.traits?.includes('指定ポケット') && d.name) names.add(d.name);
        });
        document.querySelectorAll('#my-hand-area .card').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.traits?.includes('指定ポケット') && d.name) names.add(d.name);
        });
        return names.size;
    }

    // 輔助：公開牌頂 1 張並判定必要能源是否 >= 2（爆弾魔軸共用）
    function revealTopForEnergy2(engine, onResult) {
        const deckArea = document.getElementById('my-deck-area');
        const allDeck = Array.from(deckArea.querySelectorAll('.card'));
        if (allDeck.length === 0) { if (onResult) onResult(null, false); return; }
        const top = allDeck[allDeck.length - 1];
        const def = engine.getCardDef(top);
        const isGe2 = (def?.requiredEnergy?.count || 0) >= 2 || engine.getBaseCardId(top.dataset.cardId) === 'EX01BT/HTR-2-045';
        sendSystemChat(`[牌頂公開] 對手公開了〈${def?.name}〉（必要能源 ${isGe2 ? '2 以上' : '1 以下'}）。`);
        if (onResult) onResult(top, isGe2);
    }

    // EX01BT/HTR-2-038 ゴン＝フリークス (突襲：登場下次手牌指定ポケット消費AP-1；退場場外回收指定ポケット1張)
    scripts['EX01BT/HTR-2-038'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.pendingApDiscounts.push({
                amount: 1, desc: '［特徴：指定ポケット］AP-1',
                matchFn: (d) => !!(d.traits && d.traits.includes('指定ポケット'))
            });
            showSysMsg('本回合下次從手牌使用的［特徴：指定ポケット］消費 AP -1。');
            if (onComplete) onComplete();
        },
        onRetire(engine, cardEl, onComplete) {
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.traits?.includes('指定ポケット'));
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '退場時效果：ゴン＝フリークス', desc: '從場外選擇最多 1 張［特徴：指定ポケット］加入手牌：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }
            });
        }
    };

    // EX01BT/HTR-2-043 キルア＝ゾルディック
    scripts['EX01BT/HTR-2-043'] = {
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: false },
                { type: 'SET_ACTIVE', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // EX01BT/HTR-2-046 アウト―!!
    scripts['EX01BT/HTR-2-046'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.usedNamedAbilityThisTurn.add('アウト_リスキーダイス對手');
            showSysMsg('本回合下次〈リスキーダイス〉起動可改選對手前線角色。');
            if (onComplete) onComplete();
        }
    };

    // EX01BT/HTR-2-048 再来
    scripts['EX01BT/HTR-2-048'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
            if (myChars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '再来', desc: '選擇 1 張我方角色退回手牌並抽 2 張牌：',
                cards: myChars, selectCount: 1, upTo: false,
                onConfirm: (sel) => { if (sel.length > 0) { engine.bounceSlotTopCardToHand(sel[0].parentElement); engine.drawCards(2); } if (onComplete) onComplete(); }
            });
        }
    };

    // UA03BT/HTR-1-007 ゴン＝フリークス
    scripts['UA03BT/HTR-1-007'] = {
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            rt.usedOncePerTurn = true;
            const types = countDistinctPocketInFieldAndHand(engine);
            if (types >= 3) engine.drawCards(1);
            if (types >= 4) rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
            showSysMsg(`〈ゴン＝フリークス〉場上與手牌［特徴：指定ポケット］共 ${types} 種。`);
            if (onComplete) onComplete();
        }
    };

    // UA03BT/HTR-1-008 ツェズゲラ
    scripts['UA03BT/HTR-1-008'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['PURPLE', 'GREEN'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA03BT/HTR-1-011 ビスケ
    scripts['UA03BT/HTR-1-011'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.retireCardFromSlot(slot);
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.traits?.includes('指定ポケット'));
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：ビスケ', desc: '從場外選擇 1 張［特徴：指定ポケット］加入手牌：',
                cards: cands, selectCount: 1, upTo: false,
                onConfirm: (sel) => { if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }
            });
        }
    };

    // UA03BT/HTR-1-019 キルア＝ゾルディック (突襲)
    scripts['UA03BT/HTR-1-019'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            const rt = engine.getRuntime(cardEl);
            if (rt.usedOncePerTurn) { if (onComplete) onComplete(); return; }
            rt.usedOncePerTurn = true;
            const types = countDistinctPocketInFieldAndHand(engine);
            if (types >= 2) engine.drawCards(1);
            if (types >= 4) rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2);
            showSysMsg(`〈キルア＝ゾルディック〉場上與手牌［特徴：指定ポケット］共 ${types} 種。`);
            if (onComplete) onComplete();
        }
    };

    // UA03BT/HTR-1-023 ゲンスルー (突襲)
    scripts['UA03BT/HTR-1-023'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            revealTopForEnergy2(engine, (top, isGe2) => {
                if (!top) { if (onComplete) onComplete(); return; }
                const finishPut = () => engine.executeAbilityActions(cardEl, [{ type: 'LOOK_TOP_DECK', count: 1, pickUpTo: 0, remainderTo: 'TOP_OR_BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                if (isGe2) {
                    engine.executeAbilityActions(cardEl, [
                        { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 3000, count: 1, upTo: true },
                        { type: 'RETIRE_TARGET', target: 'SELECTED' }
                    ], 0, { selectedTargets: [], addedFromLook: false }, finishPut);
                } else finishPut();
            });
        }
    };

    // UA03BT/HTR-1-025 バラ
    scripts['UA03BT/HTR-1-025'] = {
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            revealTopForEnergy2(engine, (top, isGe2) => {
                if (!top) { if (onComplete) onComplete(); return; }
                const finishPut = () => engine.executeAbilityActions(cardEl, [{ type: 'LOOK_TOP_DECK', count: 1, pickUpTo: 0, remainderTo: 'TOP_OR_BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                if (isGe2) {
                    const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 1500);
                    if (opp.length > 0) {
                        engine.promptModal({
                            title: '起動メイン：バラ', desc: '選擇對手前線 BP 1500 以上最多 1 張 BP-1000：',
                            cards: opp, selectCount: 1, upTo: true,
                            onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, -1000); finishPut(); }
                        });
                    } else finishPut();
                } else finishPut();
            });
        }
    };

    // UA03BT/HTR-1-027 リスキーダイス
    scripts['UA03BT/HTR-1-027'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            const allowOpp = engine.usedNamedAbilityThisTurn.has('アウト_リスキーダイス對手');
            if (allowOpp) engine.usedNamedAbilityThisTurn.delete('アウト_リスキーダイス對手');
            const selStr = allowOpp ? '#my-front-line .slot, #my-energy-line .slot, #opp-front-line .slot' : '#my-front-line .slot, #my-energy-line .slot';
            const cands = engine.getSlotTopCards(selStr).filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：リスキーダイス', desc: '選擇 1 張角色進行風險骰子判定：',
                cards: cands, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    const target = sel[0];
                    revealTopForEnergy2(engine, (top, isGe2) => {
                        if (!top) { if (onComplete) onComplete(); return; }
                        if (isGe2) {
                            engine.moveCardToZone(top, document.getElementById('my-hand-area'));
                            engine.addSlotBp(target.parentElement, 1000);
                        } else {
                            engine.moveCardToZone(top, document.getElementById('my-outside-area'));
                            if (target.parentElement.id.startsWith('opp-')) engine.requestRetireOpponentCard(target);
                            else engine.retireCardFromSlot(target.parentElement);
                        }
                        if (onComplete) onComplete();
                    });
                }
            });
        }
    };

    // UA03BT/HTR-1-031 ジャジャン拳
    scripts['UA03BT/HTR-1-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('ゴン＝フリークス') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA03BT/HTR-1-033 解放
    scripts['UA03BT/HTR-1-033'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
