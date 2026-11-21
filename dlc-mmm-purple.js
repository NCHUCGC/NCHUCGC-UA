/**
 * UA DLC 腳本包：魔法少女小圓 (Puella Magi Madoka Magica) - 紫色 (一彈 + 二彈，共 46 張)
 * 檔名：dlc-mmm-purple.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function countQuintet(engine, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes('ピュエラ・マギ・ホーリー・クインテット')).length;
    }

    // EX16BT/MMM-2-013 暁美 ほむら
    scripts['EX16BT/MMM-2-013'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('鹿目 まどか')) ? 1000 : 0; }
    };

    // UA31BT/MMM-1-035 悪魔ほむら
    scripts['UA31BT/MMM-1-035'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-energy-line') && !engine.getRuntime(cardEl).usedOncePerTurn
                && engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name.includes('鹿目 まどか'));
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const madokas = engine.getSlotTopCards('#my-front-line .slot').filter(c => engine.getCardDef(c)?.name.includes('鹿目 まどか'));
            if (madokas.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：悪魔ほむら', desc: '選擇前線 1 張〈鹿目 まどか〉互換位置：',
                cards: madokas, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        const flSlot = sel[0].parentElement;
                        const flCards = Array.from(flSlot.querySelectorAll('.card'));
                        const enCards = Array.from(slot.querySelectorAll('.card'));
                        flCards.forEach(c => slot.appendChild(c));
                        enCards.forEach(c => flSlot.appendChild(c));
                        recalcStacking(flSlot); recalcStacking(slot); broadcastMyState();
                    }
                    if (onComplete) onComplete();
                }
            });
        },
        onAttack(engine, cardEl, onComplete) {
            const hasEnMadoka = engine.getSlotTopCards('#my-energy-line .slot').some(c => engine.getCardDef(c)?.name.includes('鹿目 まどか'));
            if (!hasEnMadoka) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'MODIFY_BP', amount: -1000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA31BT/MMM-1-037 キュゥべえ
    scripts['UA31BT/MMM-1-037'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA31BT/MMM-1-044 百江 なぎさ (突襲)
    scripts['UA31BT/MMM-1-044'] = {
        requireRaided: true,
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
                    const d = engine.getCardDef(c);
                    if (d && (d.name.includes('百江 なぎさ') || d.traits?.includes('ピュエラ・マギ・ホーリー・クインテット'))) {
                        engine.addSlotBp(c.parentElement, 1000);
                    }
                });
                if (onComplete) onComplete();
            });
        }
    };

    // UA31BT/MMM-1-049 鹿目 まどか
    scripts['UA31BT/MMM-1-049'] = {
        canActivateMain(engine, cardEl) {
            const rt = engine.getRuntime(cardEl);
            return !!rt.enteredThisTurn && !rt.usedOncePerTurn;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: false },
                { type: 'GRANT_KEYWORD', keyword: 'IMPACT', value: 1, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA31BT/MMM-1-052 佐倉 杏子
    scripts['UA31BT/MMM-1-052'] = {
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && cardEl.classList.contains('rest') && engine.getEffectiveCardBp(cardEl) >= 5000; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            cardEl.classList.remove('rest');
            if (onComplete) onComplete();
        }
    };

    // UA31BT/MMM-1-056 巴 マミ (突襲)
    scripts['UA31BT/MMM-1-056'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            if (countQuintet(engine, cardEl) >= 4) {
                engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
            }
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(4, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `登場時效果：巴 マミ（檢視牌頂 ${cnt} 張）`, desc: '選擇最多 1 張 2 費以下 AP1 紫色角色休息登場（其餘置底）：',
                cards: topCards,
                cardFilterFn: (c) => { const d = engine.getCardDef(c); return !!(d && d.type === 'CHARACTER' && d.color === 'PURPLE' && (d.requiredEnergy?.count || 0) <= 2 && (d.apCost ?? 1) === 1); },
                selectCount: 1, upTo: true,
                onConfirm: (picked) => {
                    const rest = topCards.filter(c => !picked.includes(c));
                    const afterOrder = () => {
                        if (picked.length > 0) engine.chooseEmptyFieldSlotAndPlace(picked[0], { allowFront: true, allowEnergy: true, enterRest: true }, (p) => { if (p) engine.triggerCardAbilities(picked[0], 'ON_PLAY', onComplete); else if (onComplete) onComplete(); });
                        else { broadcastMyState(); if (onComplete) onComplete(); }
                    };
                    engine.promptOrderCardsToDeck(rest, 'BOTTOM', afterOrder);
                }
            });
        }
    };

    // UA31BT/MMM-1-062 このときを、待ってた…
    scripts['UA31BT/MMM-1-062'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' },
                { type: 'GRANT_KEYWORD', keyword: 'IMPACT_PLUS', value: 1, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                if (engine.hasCharacterOnMyField('暁美 ほむら')) engine.drawCards(1);
                if (onComplete) onComplete();
            });
        }
    };

    // UA31BT/MMM-1-064 ティロ・デュエット
    scripts['UA31BT/MMM-1-064'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = 2000 + countQuintet(engine) * 1000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA31BT/MMM-1-066 もう誰にも頼らない
    scripts['UA31BT/MMM-1-066'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('暁美 ほむら') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA31BT/MMM-1-067 私は何度でも繰り返す……
    scripts['UA31BT/MMM-1-067'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' },
                { type: 'GRANT_KEYWORD', keyword: 'DOUBLE_ATTACK', value: 1, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
