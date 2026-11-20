/**
 * UA DLC 腳本包：SHY 靦腆英雄 - 全色 (藍 / 紅，共 88 張)
 * 檔名：dlc/dlc-shy.js
 */
(function () {
    const scripts = {};

    function hasHeroOnMyField(engine) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .some(c => engine.getCardDef(c)?.traits?.includes('ヒーロー'));
    }

    function countHighEnHeroes(engine, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes('ヒーロー') && (engine.getCardDef(c)?.requiredEnergy?.count || 0) >= 4).length;
    }

    // ==================== 藍色 ====================

    // UA24BT/SHY-1-012 クフフ (突襲)
    scripts['UA24BT/SHY-1-012'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            if (!hasHeroOnMyField(engine)) {
                engine.pendingApDiscounts.push({ amount: 1, desc: '下次事件卡 AP-1', matchFn: (d) => d.type === 'EVENT' });
            }
            engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA24BT/SHY-1-017 ツィベタ
    scripts['UA24BT/SHY-1-017'] = {
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !cardEl.classList.contains('rest') && !engine.getRuntime(cardEl).usedOncePerTurn && engine.usedEventThisTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    // UA24BT/SHY-1-019 ツィベタ (突襲)
    scripts['UA24BT/SHY-1-019'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            if (!hasHeroOnMyField(engine)) {
                document.querySelectorAll('#opp-front-line .slot').forEach(s => {
                    const top = engine.getTopCardInSlot(s);
                    if (top && engine.getEffectiveCardBp(top) >= 1500) engine.addSlotBp(s, -1000);
                });
            }
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && engine.usedEventThisTurn && !engine.usedNamedAbilityThisTurn.has('ツィベタ_rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.usedNamedAbilityThisTurn.add('ツィベタ_rest');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'SET_REST', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA24BT/SHY-1-022 シャイ
    scripts['UA24BT/SHY-1-022'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('スピリッツ')) ? 500 : 0; }
    };

    // UA24BT/SHY-1-038 母との思い出
    scripts['UA24BT/SHY-1-038'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(3);
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA24BT/SHY-1-040 ふわふわ砲
    scripts['UA24BT/SHY-1-040'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasSp = engine.hasCharacterOnMyField('スピリッツ');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: true },
                { type: hasSp ? 'RETIRE_TARGET' : 'BOUNCE_TO_HAND', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA24BT/SHY-1-041 ようこそ私の心の中へ
    scripts['UA24BT/SHY-1-041'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasTz = engine.hasCharacterOnMyField('ツィベタ');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                ...(hasTz ? [{ type: 'RETIRE_TARGET', target: 'SELECTED' }] : [{ type: 'SET_REST', target: 'SELECTED' }, { type: 'FREEZE_TARGET', target: 'SELECTED' }])
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UAPR/SHY-P-001 ツィベタ
    scripts['UAPR/SHY-P-001'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedEventThisTurn) ? 500 : 0; },
        canActivateMain(engine, cardEl) { return !hasHeroOnMyField(engine) && engine.usedEventThisTurn && cardEl.classList.contains('rest') && !engine.usedNamedAbilityThisTurn.has('ツィベタ_active'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.usedNamedAbilityThisTurn.add('ツィベタ_active');
            cardEl.classList.remove('rest');
            if (onComplete) onComplete();
        }
    };

    // UAPR/SHY-P-002 スピリッツ
    scripts['UAPR/SHY-P-002'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; }
    };

    // ==================== 紅色 ====================

    // UA24BT/SHY-1-048 シャイ
    scripts['UA24BT/SHY-1-048'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('小石川 惟子')) ? 1000 : 0; }
    };
    scripts['UAPR/SHY-1-048'] = scripts['UA24BT/SHY-1-048'];

    // UA24BT/SHY-1-050 シャイ
    scripts['UA24BT/SHY-1-050'] = {
        onPlay(engine, cardEl, onComplete) { if (engine.hasCharacterOnMyField('小石川 惟子')) cardEl.classList.remove('rest'); if (onComplete) onComplete(); },
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && engine.getSlotTopCards('#opp-front-line .slot').length >= 4; },
        onActivateMain(engine, cardEl, slot, onComplete) { engine.getRuntime(cardEl).usedOncePerTurn = true; engine.addSlotBp(slot, 1000); if (onComplete) onComplete(); }
    };

    // UA24BT/SHY-1-054 スターダスト
    scripts['UA24BT/SHY-1-054'] = {
        getEnergyDiscount(engine) { return countHighEnHeroes(engine) >= 3 ? 2 : 0; }
    };

    // UA24BT/SHY-1-061 ミェンロン
    scripts['UA24BT/SHY-1-061'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countHighEnHeroes(engine) >= 1) ? 1000 : 0; }
    };

    // UA24BT/SHY-1-062 ミェンロン / 072 レディ・ブラック
    scripts['UA24BT/SHY-1-062'] = { getEnergyDiscount() { return 1; } };
    scripts['UA24BT/SHY-1-072'] = { getEnergyDiscount() { return 2; } };

    // UA24BT/SHY-1-074 火炎一文字
    scripts['UA24BT/SHY-1-074'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasShy = engine.hasCharacterOnMyField('シャイ');
            const hasIko = engine.hasCharacterOnMyField('小石川 惟子');
            const maxBp = (hasShy && hasIko) ? 5000 : (hasShy ? 4000 : 2000);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA24BT/SHY-1-075 睡眠
    scripts['UA24BT/SHY-1-075'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const activeM = engine.getSlotTopCards('#my-front-line .slot').filter(c => !c.classList.contains('rest') && engine.getCardDef(c)?.name.includes('ミェンロン'));
            if (activeM.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '睡眠', desc: '選擇前線 1 張活動的〈ミェンロン〉轉為休息並抽 3 張牌：',
                cards: activeM, selectCount: 1, upTo: false,
                onConfirm: (sel) => { if (sel.length > 0) { sel[0].classList.add('rest'); engine.drawCards(3); } if (onComplete) onComplete(); }
            });
        }
    };

    // UA24BT/SHY-1-077 ヒーローの休日
    scripts['UA24BT/SHY-1-077'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(2);
            if (engine.hasCharacterOnMyField('シャイ') && engine.hasCharacterOnMyField('小石川 惟子')) {
                engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            } else if (onComplete) onComplete();
        }
    };

    // UA24BT/SHY-1-078 勇気の火
    scripts['UA24BT/SHY-1-078'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
            if (myChars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '勇気の火', desc: '選擇 1 張我方角色 BP+2000（〈シャイ〉再獲得衝擊+1）：',
                cards: myChars, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.addSlotBp(sel[0].parentElement, 2000);
                        if (engine.getCardDef(sel[0])?.name.includes('シャイ')) {
                            engine.getRuntime(sel[0]).tempKeywords.IMPACT_PLUS = (engine.getRuntime(sel[0]).tempKeywords.IMPACT_PLUS || 0) + 1;
                        }
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA24BT/SHY-1-079 龍眠拳転心流
    scripts['UA24BT/SHY-1-079'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('ミェンロン') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
