/**
 * UA DLC 腳本包：魔法少女小圓 (Puella Magi Madoka Magica) - 綠色 (二彈，共 44 張)
 * 檔名：dlc-mmm-green.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function countDistinctMagius(engine) {
        const names = new Set();
        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.traits?.includes('マギウス') && d.name) names.add(d.name);
        });
        return names.size;
    }

    // EX16BT/MMM-2-020 呉 キリカ
    scripts['EX16BT/MMM-2-020'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('美国 織莉子')) ? 1000 : 0; },
        onRetire(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('美国 織莉子'));
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '退場時效果：呉 キリカ', desc: '選擇最多 1 張〈美国 織莉子〉BP+1000：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, 1000); if (onComplete) onComplete(); }
            });
        }
    };

    // EX16BT/MMM-2-036 深月 フェリシア
    scripts['EX16BT/MMM-2-036'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; }
    };

    // EX16BT/MMM-2-041 由比 鶴乃
    scripts['EX16BT/MMM-2-041'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
            if (onComplete) onComplete();
        }
    };

    // EX16BT/MMM-2-043 アリナ・グレイ
    scripts['EX16BT/MMM-2-043'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; }
    };

    // EX16BT/MMM-2-045 アリナ・グレイ (突襲)
    scripts['EX16BT/MMM-2-045'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) {
            const oppCnt = engine.getSlotTopCards('#opp-front-line .slot').length;
            return Math.floor(oppCnt / 2) * 500;
        }
    };

    // EX16BT/MMM-2-047 里見 灯花
    scripts['EX16BT/MMM-2-047'] = {
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.getRuntime(cardEl).tempEnergyBoost.push({ color: 'GREEN', count: 1 });
                if (onComplete) onComplete();
            });
        }
    };

    // EX16BT/MMM-2-049 里見 灯花 (突襲)
    scripts['EX16BT/MMM-2-049'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(2);
            engine.promptModal({
                title: '登場時效果：里見 灯花', desc: '將 1 張手牌置於牌組頂端或場外：', cards: [],
                customButtons: [
                    { label: '置於牌組頂端', color: '#4f739e', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    { label: '放置於場外', color: '#c1596f', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) }
                ]
            });
        },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.drawCards(1);
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // EX16BT/MMM-2-055 梓 みふゆ
    scripts['EX16BT/MMM-2-055'] = {
        getEnergyDiscount() { return 2; }
    };

    // EX16BT/MMM-2-059 沈黙のドッペル
    scripts['EX16BT/MMM-2-059'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('環 いろは') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // EX16BT/MMM-2-060 箱庭クリエイター
    scripts['EX16BT/MMM-2-060'] = {
        getEnergyDiscount() { return 2; },
        onEventPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(4, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `箱庭クリエイター（檢視牌頂 ${cnt} 張）`, desc: '選擇最多 2 張加入手牌（其餘放回牌組頂端）：',
                cards: topCards, selectCount: 2, upTo: true,
                onConfirm: (picked) => {
                    picked.forEach(c => engine.moveCardToZone(c, document.getElementById('my-hand-area')));
                    topCards.filter(c => !picked.includes(c)).reverse().forEach(c => { deckArea.appendChild(c); c.classList.add('is-flipped'); });
                    recalcStacking(deckArea); broadcastMyState();
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // EX16BT/MMM-2-061 Marigold Dadaism
    scripts['EX16BT/MMM-2-061'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const cnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                .filter(c => { const t = engine.getCardDef(c)?.traits || []; return t.includes('マギウス') || t.includes('マギウスの翼'); }).length;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: cnt * 1000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' },
                { type: 'DRAW', amount: 1 },
                { type: 'DISCARD_HAND', count: 1 }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
