/**
 * UA DLC 腳本包：刀劍神域 (Sword Art Online) - 1彈 + 2彈全色 (藍 / 綠 / 紫 / 黃，共 203 張)
 * 檔名：dlc/dlc-sao.js
 */
(function () {
    const scripts = {};

    function countYuukiOutside(engine) {
        return Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
            const d = engine.getCardDef(c);
            return d && (d.name?.includes('ユウキ') || d.name?.includes('マザーズ・ロザリオ'));
        }).length;
    }

    function countMyFieldTrait(engine, trait, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes(trait)).length;
    }

    // ==================== 藍色 ====================

    // EX08BT/SAO-2-019 ピナ / 024 リーファ / 025 クリスタライト・インゴット
    scripts['EX08BT/SAO-2-019'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('シリカ')) ? 2000 : 0; } };
    scripts['EX08BT/SAO-2-024'] = { getEnergyDiscount() { return Math.max(0, document.querySelectorAll('#my-hand-area .card').length - 1) >= 4 ? 1 : 0; } };
    scripts['EX08BT/SAO-2-025'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(2);
            if (engine.hasCharacterOnMyField('リズベット')) {
                engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            } else if (onComplete) onComplete();
        }
    };

    // UA15BT/SAO-1-037 アスナ (突襲) / 050 アリシャ・ルー / 051 キリト / 057 ユージーン
    scripts['UA15BT/SAO-1-037'] = { requireRaided: true, getContinuousImpact(engine) { return engine.hasCharacterOnMyField('キリト') ? 1 : 0; } };
    scripts['UA15BT/SAO-1-050'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'GREEN'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA15BT/SAO-1-051'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && document.querySelectorAll('#my-hand-area .card').length >= 5) ? 1000 : 0; } };
    scripts['UA15BT/SAO-1-057'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && document.querySelectorAll('#my-hand-area .card').length >= 5) ? 500 : 0; } };

    // UA15BT/SAO-1-064 空中戦 / 065 スターバースト・ストリーム / UA15ST/SAO-1-104 キリト (突襲)
    scripts['UA15BT/SAO-1-064'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const handCnt = document.querySelectorAll('#my-hand-area .card').length;
            const aloCnt = countMyFieldTrait(engine, 'ALO');
            const maxBp = 1000 + (handCnt + aloCnt) * 500;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA15BT/SAO-1-065'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('キリト') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA15ST/SAO-1-065'] = scripts['UA15BT/SAO-1-065'];
    scripts['UA15ST/SAO-1-104'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            if (engine.hasCharacterOnMyField('アスナ')) engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
            if (onComplete) onComplete();
        }
    };
    scripts['UAPR/SAO-1-104'] = scripts['UA15ST/SAO-1-104'];

    // ==================== 綠色 ====================

    // UA15BT/SAO-1-070 アスナ / 071 アスナ (突襲) / 092 シュピーゲル / 099 フォトンソード / 100 マザーズ・ロザリオ
    scripts['UA15BT/SAO-1-070'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countYuukiOutside(engine) >= 4) ? 500 : 0; },
        getContinuousImpact(engine) { return countYuukiOutside(engine) >= 6 ? 1 : 0; }
    };
    scripts['UA15BT/SAO-1-071'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countYuukiOutside(engine) >= 6) ? 1000 : 0; },
        onAttack(engine, cardEl, onComplete) { if (countYuukiOutside(engine) >= 4) engine.drawCards(1); if (onComplete) onComplete(); }
    };
    scripts['UA15BT/SAO-1-092'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'BLUE'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA15BT/SAO-1-099'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const actions = [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
            ];
            if (engine.hasCharacterOnMyField('キリト')) actions.push({ type: 'GRANT_KEYWORD', keyword: 'IMPACT_PLUS', value: 1, target: 'SELECTED' });
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA15BT/SAO-1-100'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const has3 = countYuukiOutside(engine) >= 3;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: has3 ? 'RETIRE_TARGET' : 'BOUNCE_TO_HAND', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 紫色 ====================

    // EX08BT/SAO-2-031 ユナ (突襲) / 042 アスナ (突襲) / 059 リニアー / 062 longing
    scripts['EX08BT/SAO-2-031'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.pendingApDiscounts.push({ amount: 1, desc: '［特徴：歌］AP-1', matchFn: (d) => d.traits?.includes('歌') });
            if (onComplete) onComplete();
        }
    };
    scripts['EX08BT/SAO-2-042'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.addSlotBp(cardEl.parentElement, 1000);
            engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
            if (onComplete) onComplete();
        }
    };
    scripts['UAPR/SAO-2-042'] = scripts['EX08BT/SAO-2-042'];
    scripts['EX08BT/SAO-2-059'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('アスナ') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['EX08BT/SAO-2-062'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 2 }, { type: 'DISCARD_HAND', count: 2 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                if (engine.hasCharacterOnMyField('ユナ')) engine.activateMyApCards(1);
                if (onComplete) onComplete();
            });
        }
    };

    // ==================== 黃色 ====================

    // EX08BT/SAO-2-002 キリト (突襲) / 008 レンリ / 013 記憶解放術
    scripts['EX08BT/SAO-2-002'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const front = engine.getSlotTopCards('#my-front-line .slot');
            const hasBoth = front.some(c => engine.getCardDef(c)?.name?.includes('アリス')) && front.some(c => engine.getCardDef(c)?.name?.includes('ユージオ'));
            if (hasBoth) { engine.drawCards(2); if (onComplete) onComplete(); }
            else engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 2 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['EX08BT/SAO-2-008'] = { getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyFieldTrait(engine, '整合騎士', cardEl) >= 4) ? 1500 : 0; } };
    scripts['EX08BT/SAO-2-013'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countMyFieldTrait(engine, '整合騎士') * 1000;
            if (maxBp <= 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA15BT/SAO-1-012 & 013 アリス / 014 エルドリエ / 015 デュソルバート / 030 金木犀の剣 / 034 ラディアント・ライト
    scripts['UA15BT/SAO-1-012'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('キリト') && engine.hasCharacterOnMyField('ユージオ')) ? 1000 : 0; } };
    scripts['UA15BT/SAO-1-013'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const front = engine.getSlotTopCards('#my-front-line .slot');
            const hasK = front.some(c => engine.getCardDef(c)?.name?.includes('キリト'));
            const hasE = front.some(c => engine.getCardDef(c)?.name?.includes('ユージオ'));
            const maxBp = (hasK && hasE) ? 5000 : ((hasK || hasE) ? 3000 : 2000);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA15BT/SAO-1-014'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer !== null && !engine.isMyTurn) ? 1000 : 0; } };
    scripts['UA15BT/SAO-1-015'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['BLUE', 'GREEN'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA15BT/SAO-1-030'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('アリス') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA15BT/SAO-1-034'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const lifeLe4 = document.querySelectorAll('#my-life-area .card').length <= 4;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                ...(lifeLe4 ? [{ type: 'RETIRE_TARGET', target: 'SELECTED' }] : [{ type: 'SET_REST', target: 'SELECTED' }, { type: 'FREEZE_TARGET', target: 'SELECTED' }])
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
