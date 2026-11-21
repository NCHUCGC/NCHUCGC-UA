/**
 * UA DLC 腳本包：不死不運 (Undead Unluck) - 全色 (紫 / 紅，共 83 張)
 * 檔名：dlc/dlc-and.js
 */
(function () {
    const scripts = {};

    function countFrontTrait(engine, trait, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes(trait)).length;
    }

    function countFieldTrait(engine, trait, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes(trait)).length;
    }

    // ==================== 紫色 ====================

    // UA25BT/AND-1-005 ビリー / 010 ラトラ / 012 リップ
    scripts['UA25BT/AND-1-005'] = {
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countFrontTrait(engine, 'UNDER', cardEl) >= 2) ? 1500 : 0; }
    };
    scripts['UA25BT/AND-1-010'] = {
        getContinuousBpBonus(engine, cardEl) {
            if (engine.isFirstPlayer !== null && !engine.isMyTurn) return 0;
            const others = engine.getSlotTopCards('#my-front-line .slot').filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('UNDER'));
            return (others.length >= 3 && others.some(c => engine.getCardDef(c)?.name.includes('リップ'))) ? 1000 : 0;
        }
    };
    scripts['UA25BT/AND-1-012'] = {
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countFrontTrait(engine, 'UNDER', cardEl) >= 2) ? 1000 : 0; }
    };

    // UA25BT/AND-1-020 出雲 風子 (突襲)
    scripts['UA25BT/AND-1-020'] = {
        requireRaided: true,
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countFieldTrait(engine, 'UNION', cardEl) >= 3) ? 500 : 0; }
    };

    // UA25BT/AND-1-034 不死
    scripts['UA25BT/AND-1-034'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'RECOVER_FROM_OUTSIDE', count: 1, upTo: true }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                if (engine.hasCharacterOnMyField('アンディ') || engine.hasCharacterOnMyField('ヴィクトル')) engine.drawCards(1);
                if (onComplete) onComplete();
            });
        }
    };

    // UA25BT/AND-1-035 不公平だろう？
    scripts['UA25BT/AND-1-035'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            const hasUnderBilly = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                .some(c => engine.getCardDef(c)?.name.includes('ビリー') && engine.getCardDef(c)?.traits?.includes('UNDER'));
            if (hasUnderBilly) {
                engine.requestOpponentDiscard(1);
            }
            if (onComplete) onComplete();
        }
    };

    // UA25BT/AND-1-038 死刃
    scripts['UA25BT/AND-1-038'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasAndy = engine.hasCharacterOnMyField('アンディ') || engine.hasCharacterOnMyField('ヴィクトル');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: hasAndy ? 5000 : 3000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA25BT/AND-1-039 走刃脚
    scripts['UA25BT/AND-1-039'] = {
        onEventPlay(engine, cardEl, onComplete) {
            if (!engine.hasCharacterOnMyField('リップ')) {
                engine.executeAbilityActions(cardEl, [
                    { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false },
                    { type: 'MODIFY_BP', amount: -3000, target: 'SELECTED' }
                ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                return;
            }
            engine.promptModal({
                title: '走刃脚（場上有〈リップ〉）', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    { label: '改為對手前線 1 角色 BP-4000', color: '#c1596f', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false }, { type: 'MODIFY_BP', amount: -4000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    { label: '對手前線 1 角色 BP-3000 並抽 1 張牌', color: '#4f9678', onClick: () => { engine.drawCards(1); engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false }, { type: 'MODIFY_BP', amount: -3000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete); } }
                ]
            });
        }
    };

    // ==================== 紅色 ====================

    // UA25BT/AND-1-069 ビリー
    scripts['UA25BT/AND-1-069'] = {
        getContinuousBpBonus(engine, cardEl) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? countFrontTrait(engine, 'UNION', cardEl) * 500 : 0; }
    };

    // UA25BT/AND-1-076 黙示録
    scripts['UA25BT/AND-1-076'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasEn5 = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => (engine.getCardDef(c)?.requiredEnergy?.count || 0) >= 5);
            engine.drawCards(hasEn5 ? 2 : 1);
            const lifeCards = Array.from(document.querySelectorAll('#my-life-area .card'));
            if (lifeCards.length > 0) {
                engine.promptModal({
                    title: '黙示録', desc: '是否將 1 張生命卡加入手牌？', cards: [],
                    customButtons: [
                        { label: '將 1 張生命卡加入手牌', color: '#4f9678', onClick: () => { engine.moveCardToZone(lifeCards[lifeCards.length - 1], document.getElementById('my-hand-area')); if (onComplete) onComplete(); } },
                        { label: '不加入', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                    ]
                });
            } else if (onComplete) onComplete();
        }
    };

    // UA25BT/AND-1-080 UNIONの力
    scripts['UA25BT/AND-1-080'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countFieldTrait(engine, 'UNION') * 1000;
            if (maxBp <= 0) { if (onComplete) onComplete(); return; }
            const hasJuiz = engine.hasCharacterOnMyField('ジュイス');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: hasJuiz ? 'SEND_TARGET_TO_REMOVE' : 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
