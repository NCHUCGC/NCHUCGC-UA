/**
 * UA DLC 腳本包：魔法少女小圓 (Puella Magi Madoka Magica) - 紅色 (一彈 + 二彈，共 63 張)
 * 檔名：dlc-mmm-red.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function countDistinctMagicalGirls(engine, excludeEl = null) {
        const names = new Set();
        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
            if (c === excludeEl) return;
            const d = engine.getCardDef(c);
            if (d && d.traits?.includes('魔法少女') && d.name) names.add(d.name);
        });
        return names.size;
    }

    function takeTopLifeToHand(engine) {
        const lifeArea = document.getElementById('my-life-area');
        const lifeCards = Array.from(lifeArea.querySelectorAll('.card'));
        if (lifeCards.length === 0) return false;
        const top = lifeCards[lifeCards.length - 1];
        engine.moveCardToZone(top, document.getElementById('my-hand-area'));
        engine.usedNamedAbilityThisTurn.add('MMM_RED_LIFE_TO_HAND');
        return true;
    }

    // EX16BT/MMM-2-067 佐倉 杏子
    scripts['EX16BT/MMM-2-067'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; },
        getContinuousBpBonus(engine, cardEl) {
            if (engine.isFirstPlayer !== null && !engine.isMyTurn) return 0;
            return (countDistinctMagicalGirls(engine, cardEl) >= 4 || engine.usedNamedAbilityThisTurn.has('MMM_RED_LIFE_TO_HAND')) ? 1000 : 0;
        }
    };

    // EX16BT/MMM-2-070 美樹 さやか
    scripts['EX16BT/MMM-2-070'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest')
                && engine.usedNamedAbilityThisTurn.has('MMM_RED_LIFE_TO_HAND')
                && !engine.usedNamedAbilityThisTurn.has('さやか_回血');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.usedNamedAbilityThisTurn.add('さやか_回血');
            cardEl.classList.add('rest');
            engine.drawCards(1);
            const lifeArea = document.getElementById('my-life-area');
            lifeArea.appendChild(cardEl);
            cardEl.classList.remove('is-flipped', 'rest');
            cardEl.classList.add('in-life');
            recalcStacking(lifeArea);
            broadcastMyState();
            if (onComplete) onComplete();
        }
    };

    // EX16BT/MMM-2-071 美樹 さやか
    scripts['EX16BT/MMM-2-071'] = {
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-life-area .card').length > 0;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            if (takeTopLifeToHand(engine)) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                engine.addSlotBp(slot, 2000);
            }
            if (onComplete) onComplete();
        }
    };

    // EX16BT/MMM-2-073 それぞれの想いを胸に
    scripts['EX16BT/MMM-2-073'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            if (countDistinctMagicalGirls(engine) >= 5) engine.activateMyApCards(1);
            const girls = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('魔法少女'));
            if (girls.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'それぞれの想いを胸に', desc: '選擇最多 1 張［特徴：魔法少女］BP+2000（〈鹿目 まどか〉再獲衝擊 1）：',
                cards: girls, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.addSlotBp(sel[0].parentElement, 2000);
                        if (engine.getCardDef(sel[0])?.name.includes('鹿目 まどか')) {
                            engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1);
                        }
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA31BT/MMM-1-068 上条 恭介
    scripts['UA31BT/MMM-1-068'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'PURPLE'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA31BT/MMM-1-078 鹿目 まどか (突襲)
    scripts['UA31BT/MMM-1-078'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const maxBp = countDistinctMagicalGirls(engine, cardEl) * 1000;
            if (maxBp <= 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA31BT/MMM-1-080 佐倉 杏子
    scripts['UA31BT/MMM-1-080'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedNamedAbilityThisTurn.has('MMM_RED_LIFE_TO_HAND')) ? 1000 : 0; }
    };
    scripts['UA31ST/MMM-1-080'] = scripts['UA31BT/MMM-1-080'];

    // UA31BT/MMM-1-083 佐倉 杏子 (突襲)
    scripts['UA31BT/MMM-1-083'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            if (engine.usedNamedAbilityThisTurn.has('MMM_RED_LIFE_TO_HAND')) {
                engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
            }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true },
                { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA31BT/MMM-1-087 美樹 さやか
    scripts['UA31BT/MMM-1-087'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('佐倉 杏子')) ? 1000 : 0; }
    };

    // UA31BT/MMM-1-089 美樹 さやか
    scripts['UA31BT/MMM-1-089'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && document.querySelectorAll('#my-life-area .card').length <= 4) ? 500 : 0; },
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-life-area .card').length > 0; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            if (takeTopLifeToHand(engine)) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                cardEl.classList.remove('rest');
            }
            if (onComplete) onComplete();
        }
    };

    // UA31BT/MMM-1-090 美樹 さやか (突襲)
    scripts['UA31BT/MMM-1-090'] = {
        requireRaided: true,
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-life-area .card').length > 0; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            if (takeTopLifeToHand(engine)) {
                const rt = engine.getRuntime(cardEl);
                rt.usedOncePerTurn = true;
                engine.addSlotBp(slot, 1000);
                rt.persistentBp = (rt.persistentBp || 0) + 1000;
            }
            if (onComplete) onComplete();
        }
    };

    // UA31BT/MMM-1-092 あたしって、ほんとバカ……
    scripts['UA31BT/MMM-1-092'] = {
        onEventPlay(engine, cardEl, onComplete) {
            if (takeTopLifeToHand(engine)) engine.drawCards(2);
            if (onComplete) onComplete();
        }
    };

    // UA31BT/MMM-1-093 奇跡も、魔法も、あるんだよ
    scripts['UA31BT/MMM-1-093'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = (engine.hasCharacterOnMyField('美樹 さやか') && document.querySelectorAll('#my-life-area .card').length <= 5) ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA31BT/MMM-1-094 クラスのみんなには、内緒だよ
    scripts['UA31BT/MMM-1-094'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('鹿目 まどか') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA31ST/MMM-1-094'] = scripts['UA31BT/MMM-1-094'];

    // UA31BT/MMM-1-100 独りぼっちは、寂しいもんな……
    scripts['UA31BT/MMM-1-100'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const kyokos = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('佐倉 杏子'));
            if (kyokos.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '独りぼっちは、寂しいもんな……', desc: '選擇 1 張我方〈佐倉 杏子〉退場：',
                cards: kyokos, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    const bp = engine.getEffectiveCardBp(sel[0]);
                    engine.retireCardFromSlot(sel[0].parentElement);
                    engine.executeAbilityActions(cardEl, [
                        { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: bp, count: 1, upTo: true },
                        { type: 'RETIRE_TARGET', target: 'SELECTED' },
                        { type: 'DRAW', amount: 2 }
                    ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                }
            });
        }
    };

    // UA31ST/MMM-1-104 鹿目 まどか (突襲)
    scripts['UA31ST/MMM-1-104'] = {
        requireRaided: true,
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countDistinctMagicalGirls(engine, cardEl) >= 4) ? 1000 : 0; },
        getContinuousImpact(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countDistinctMagicalGirls(engine, cardEl) >= 4) ? 1 : 0; },
        onUnblockedAttack(engine, cardEl, onComplete) {
            if (countDistinctMagicalGirls(engine, cardEl) >= 2) engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
