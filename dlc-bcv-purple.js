/**
 * UA DLC 腳本包：黑色五葉草 (Black Clover) - 紫色 (共 35 張)
 * 檔名：dlc-bcv-purple.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function countBlackBulls(engine, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes('黒の暴牛')).length;
    }

    function removeOutsideCards(engine, count, onDone) {
        const outCards = Array.from(document.querySelectorAll('#my-outside-area .card'));
        if (outCards.length < count) { showSysMsg(`場外卡片不足 ${count} 張。`); if (onDone) onDone(false); return; }
        engine.promptModal({
            title: `從場外移除 ${count} 張卡片`, desc: `請選擇 ${count} 張場外卡片移至移除區：`,
            cards: outCards, selectCount: count, upTo: false,
            onConfirm: (sel) => {
                const rem = document.getElementById('my-remove-area');
                sel.forEach(c => engine.moveCardToZone(c, rem));
                if (onDone) onDone(sel.length === count);
            }
        });
    }

    // UA20BT/BCV-1-003 アスタ
    scripts['UA20BT/BCV-1-003'] = {
        getContinuousBpBonus(engine, cardEl) { return (engine.isFirstPlayer !== null && !engine.isMyTurn && countBlackBulls(engine, cardEl) >= 4) ? 500 : 0; }
    };

    // UA20BT/BCV-1-004 アスタ (突襲)
    scripts['UA20BT/BCV-1-004'] = {
        requireRaided: true,
        getContinuousImpact(engine, cardEl) { return countBlackBulls(engine, cardEl) >= 4 ? 1 : 0; }
    };

    // UA20BT/BCV-1-007 ゴードン
    scripts['UA20BT/BCV-1-007'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['GREEN', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA20BT/BCV-1-012 バネッサ
    scripts['UA20BT/BCV-1-012'] = {
        onPlay(engine, cardEl, onComplete) {
            const maxEn = countBlackBulls(engine, cardEl) >= 6 ? 4 : 2;
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'PURPLE' && d.traits?.includes('黒の暴牛') && (d.requiredEnergy?.count || 0) <= maxEn && (d.apCost ?? 1) === 1;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: `登場時效果：バネッサ（必要能源 ${maxEn} 以下）`, desc: '從場外選擇最多 1 張紫色［特徴：黒の暴牛］休息登場：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (p) => { if (p) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete); else if (onComplete) onComplete(); });
                    else if (onComplete) onComplete();
                }
            });
        }
    };

    // UA20BT/BCV-1-015 ヤミ・スケヒロ
    scripts['UA20BT/BCV-1-015'] = {
        onPlay(engine, cardEl, onComplete) {
            if (countBlackBulls(engine, cardEl) < 6) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 4000, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        onAttack(engine, cardEl, onComplete) {
            const bulls = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('黒の暴牛'));
            if (bulls.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：ヤミ・スケヒロ', desc: '選擇最多 1 張［特徴：黒の暴牛］BP+1000：',
                cards: bulls, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, 1000); if (onComplete) onComplete(); }
            });
        }
    };

    // UA20BT/BCV-1-016 ラック
    scripts['UA20BT/BCV-1-016'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; },
        onPlay(engine, cardEl, onComplete) {
            if (countBlackBulls(engine, cardEl) >= 6) cardEl.classList.remove('rest');
            if (onComplete) onComplete();
        }
    };

    // UA20BT/BCV-1-023 ゼノン (突襲)
    scripts['UA20BT/BCV-1-023'] = {
        requireRaided: true,
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-outside-area .card').length >= 4; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            removeOutsideCards(engine, 4, (ok) => {
                if (ok) { engine.getRuntime(cardEl).usedOncePerTurn = true; engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 3000; }
                if (onComplete) onComplete();
            });
        },
        onAttack(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); }
    };

    // UA20BT/BCV-1-026 ダンテ
    scripts['UA20BT/BCV-1-026'] = {
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-outside-area .card').length >= 4; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            removeOutsideCards(engine, 4, (ok) => {
                if (!ok) { if (onComplete) onComplete(); return; }
                const rt = engine.getRuntime(cardEl);
                rt.usedOncePerTurn = true;
                engine.promptModal({
                    title: '起動メイン：ダンテ', desc: '請選擇 1 項效果：', cards: [],
                    customButtons: [
                        { label: '本回合獲得 [ダメージ(2)]', color: '#c1596f', onClick: () => { rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2); if (onComplete) onComplete(); } },
                        { label: '至下次我方回合開始前獲得 [2回ブロック] 與 [インパクト無効]', color: '#2980b9', onClick: () => { rt.tempKeywords.DOUBLE_BLOCK = 1; rt.persistentKeywords = rt.persistentKeywords || {}; rt.persistentKeywords.DOUBLE_BLOCK = 1; if (onComplete) onComplete(); } }
                    ]
                });
            });
        }
    };

    // UA20BT/BCV-1-027 ダンテ (突襲)
    scripts['UA20BT/BCV-1-027'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 2, upTo: true },
                { type: 'MODIFY_BP', amount: -1000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        onAttack(engine, cardEl, onComplete) { engine.millDeckCards(2); if (onComplete) onComplete(); }
    };

    // UA20BT/BCV-1-028 クリフォトの樹
    scripts['UA20BT/BCV-1-028'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest')
                && !engine.usedNamedAbilityThisTurn.has('クリフォトの樹')
                && document.querySelectorAll('#my-outside-area .card').length >= 4;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            removeOutsideCards(engine, 4, (ok) => {
                if (!ok) { if (onComplete) onComplete(); return; }
                engine.usedNamedAbilityThisTurn.add('クリフォトの樹');
                cardEl.classList.add('rest');
                engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            });
        }
    };

    // UA20BT/BCV-1-031 黒の暴牛
    scripts['UA20BT/BCV-1-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const delta = -1000 * countBlackBulls(engine);
            if (delta === 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: delta, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA20BT/BCV-1-033 魔王の御前
    scripts['UA20BT/BCV-1-033'] = {
        onEventPlay(engine, cardEl, onComplete) {
            if (!engine.hasCharacterOnMyField('ダンテ・ゾグラティス')) {
                engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false }, { type: 'MODIFY_BP', amount: -3000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                return;
            }
            engine.promptModal({
                title: '魔王の御前', desc: '場上有〈ダンテ・ゾグラティス〉，請選擇 1 項：', cards: [],
                customButtons: [
                    { label: '改為 BP-4000', color: '#c1596f', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false }, { type: 'MODIFY_BP', amount: -4000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    { label: 'BP-3000 並抽 1 張牌', color: '#4f9678', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false }, { type: 'MODIFY_BP', amount: -3000, target: 'SELECTED' }, { type: 'DRAW', amount: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) }
                ]
            });
        }
    };

    // UA20ST/BCV-1-110 アスタ
    scripts['UA20ST/BCV-1-110'] = {
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countBlackBulls(engine, cardEl) >= 4) ? 1000 : 0; }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
