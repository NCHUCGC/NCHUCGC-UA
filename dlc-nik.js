/**
 * UA DLC 腳本包：勝利女神：妮姬 (GODDESS OF VICTORY: NIKKE) - 1彈 + 2彈全色 (綠 / 紫 / 黃，共 180 張)
 * 檔名：dlc/dlc-nik.js
 */
(function () {
    const scripts = {};

    function countMyNoTriggerCards(engine) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => { const d = engine.getCardDef(c); return d && (!d.triggerText || d.triggerText === '-'); }).length;
    }

    function countMyRemove() { return document.querySelectorAll('#my-remove-area .card').length; }

    // ==================== 綠色 ====================

    // PC02BT/NIK-2-041 ノワール / 049 ラプラス / 050 ラプラス (突襲)
    scripts['PC02BT/NIK-2-041'] = { getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; } };
    scripts['PC02BT/NIK-2-049'] = { getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; } };
    scripts['PC02BT/NIK-2-050'] = {
        requireRaided: true,
        getContinuousImpact(engine, cardEl) { return engine.getEffectiveCardBp(cardEl) >= 6000 ? 1 : 0; },
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); engine.addSlotBp(cardEl.parentElement, 1000); if (onComplete) onComplete(); }
    };

    // UA18BT/NIK-1-071 シュガー / 091 ラプラス / 094 ギルティ / 100 ヒーローの登場
    scripts['UA18BT/NIK-1-071'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'PURPLE'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA18BT/NIK-1-091'] = {
        getContinuousBpBonus(engine, cardEl) {
            if (engine.isFirstPlayer !== null && !engine.isMyTurn) return 0;
            return engine.getSlotTopCards('#my-front-line .slot').some(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('ミシリス') && engine.getEffectiveCardBp(c) >= 4000) ? 1000 : 0;
        }
    };
    scripts['UA18BT/NIK-1-094'] = scripts['UA18BT/NIK-1-091'];
    scripts['UA18BT/NIK-1-100'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('ラプラス') ? 5000 : 2000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 紫色 ====================

    // PC02BT/NIK-2-029 ドロシー / 032 リリーバイス / 036 レッドフード (突襲) / 039 雪と狼
    scripts['PC02BT/NIK-2-029'] = { getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; } };
    scripts['PC02BT/NIK-2-032'] = {
        getEnergyDiscount(engine) {
            const names = new Set();
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
                const d = engine.getCardDef(c);
                if (d && d.traits?.includes('ゴッデス') && d.name) names.add(d.name);
            });
            return names.size;
        }
    };
    scripts['PC02BT/NIK-2-036'] = { requireRaided: true, getContinuousImpact(engine, cardEl) { return engine.getEffectiveCardBp(cardEl) >= 6000 ? 1 : 0; } };
    scripts['UAPR/NIK-2-036'] = scripts['PC02BT/NIK-2-036'];
    scripts['PC02BT/NIK-2-039'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasSw = engine.hasCharacterOnMyField('スノーホワイト：イノセントデイズ');
            const hasRf = engine.hasCharacterOnMyField('レッドフード');
            const maxBp = (hasSw && hasRf) ? 5000 : ((hasSw || hasRf) ? 4000 : 3000);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA18BT/NIK-1-039 イサベル / 041 ドロシー / 049 ハラン (突襲) / 053 スノーホワイト / 062 エデン
    scripts['UA18BT/NIK-1-039'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyNoTriggerCards(engine) >= 5) ? 1000 : 0; } };
    scripts['UA18BT/NIK-1-041'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyNoTriggerCards(engine) >= 4) ? 1000 : 0; } };
    scripts['UA18BT/NIK-1-049'] = { requireRaided: true, getContinuousImpact(engine) { return countMyNoTriggerCards(engine) >= 4 ? 1 : 0; } };
    scripts['UA18BT/NIK-1-053'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'GREEN'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA18BT/NIK-1-062'] = { getEnergyDiscount(engine) { return countMyNoTriggerCards(engine) >= 3 ? 3 : 0; } };

    // UA18BT/NIK-1-064 天地万物を斬るとはこういうことだ。 / 066 楽園の翼 / UA18ST/NIK-1-110 紅蓮
    scripts['UA18BT/NIK-1-064'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = document.querySelectorAll('#my-hand-area .card').length <= 3 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA18BT/NIK-1-066'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('ドロシー') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA18ST/NIK-1-110'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && document.querySelectorAll('#my-hand-area .card').length <= 2) ? 1000 : 0; } };

    // ==================== 黃色 ====================

    // PC02BT/NIK-2-002 ネオン / 004 ラピ / 007 アニス / 013 シンデレラ / 016 リトルマーメイド
    scripts['PC02BT/NIK-2-002'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedEventThisTurn) ? 1000 : 0; },
        onUnblockedAttack(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); }
    };
    scripts['PC02BT/NIK-2-004'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedEventThisTurn) ? 1000 : 0; } };
    scripts['PC02BT/NIK-2-007'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; },
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedEventThisTurn) ? 1000 : 0; }
    };
    scripts['PC02BT/NIK-2-013'] = { onPlay(engine, cardEl, onComplete) { if (countMyRemove() >= 3) engine.drawCards(1); if (onComplete) onComplete(); } };
    scripts['PCPR/NIK-2-013'] = scripts['PC02BT/NIK-2-013'];
    scripts['PC02BT/NIK-2-016'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyRemove() >= 3) ? 1000 : 0; } };

    // UA18BT/NIK-1-003 ディーゼル / 028 アニス～レベル～アップ！ / 031 コードネーム・レッドフード / UA18ST/NIK-1-106 ラピ (突襲)
    scripts['UA18BT/NIK-1-003'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['PURPLE', 'GREEN'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA18BT/NIK-1-028'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            engine.pendingApDiscounts.push({ amount: 1, desc: '〈アニス〉AP-1', matchFn: (d) => d.name?.includes('アニス') });
            if (onComplete) onComplete();
        }
    };
    scripts['UA18BT/NIK-1-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('ラピ') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA18ST/NIK-1-031'] = scripts['UA18BT/NIK-1-031'];
    scripts['UA18ST/NIK-1-106'] = {
        requireRaided: true,
        getContinuousImpact(engine, cardEl) {
            const cnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                .filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('カウンターズ')).length;
            return cnt >= 3 ? 1 : 0;
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
