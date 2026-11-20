/**
 * UA DLC 腳本包：一拳超人 (One-Punch Man) - 全色 (綠 / 紅 / 黃，共 129 張)
 * 檔名：dlc/dlc-opm.js
 */
(function () {
    const scripts = {};

    function countMyHeroes(engine, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes('ヒーロー')).length;
    }

    function totalBothLife() {
        return document.querySelectorAll('#my-life-area .card').length + document.querySelectorAll('#opp-life-area .card').length;
    }

    function countMyOutside() {
        return document.querySelectorAll('#my-outside-area .card').length;
    }

    // ==================== 綠色 ====================

    // UA35BT/OPM-1-038 アトミック侍
    scripts['UA35BT/OPM-1-038'] = {
        onPlay(engine, cardEl, onComplete) {
            const maxBp = countMyHeroes(engine, cardEl) >= 6 ? 4000 : 2000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA35BT/OPM-1-044 金属バット (突襲)
    scripts['UA35BT/OPM-1-044'] = {
        requireRaided: true,
        getContinuousImpact(engine, cardEl) { return countMyHeroes(engine, cardEl) >= 3 ? 1 : 0; }
    };

    // UA35BT/OPM-1-045 駆動騎士
    scripts['UA35BT/OPM-1-045'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA35BT/OPM-1-058 ぷりぷりプリズナー
    scripts['UA35BT/OPM-1-058'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && document.querySelectorAll('#my-hand-area .card').length === 0) ? 2000 : 0; },
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length > 0; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            const outside = document.getElementById('my-outside-area');
            Array.from(document.querySelectorAll('#my-hand-area .card')).forEach(c => engine.moveCardToZone(c, outside));
            if (onComplete) onComplete();
        }
    };

    // UA35BT/OPM-1-061 / 062 サイタマ (15 費減費)
    scripts['UA35BT/OPM-1-061'] = {
        getEnergyDiscount(engine) {
            const genosDiscount = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                .filter(c => engine.getBaseCardId(c.dataset.cardId) === 'UA35BT/OPM-1-047').length;
            return Math.floor(countMyOutside() / 5) + genosDiscount;
        }
    };
    scripts['UA35BT/OPM-1-062'] = scripts['UA35BT/OPM-1-061'];

    // UA35BT/OPM-1-064 キングエンジン
    scripts['UA35BT/OPM-1-064'] = {
        onEventPlay(engine, cardEl, onComplete) {
            let maxMyBp = 0;
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => { maxMyBp = Math.max(maxMyBp, engine.getEffectiveCardBp(c)); });
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: maxMyBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA35BT/OPM-1-066 怒羅厳シバき
    scripts['UA35BT/OPM-1-066'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('金属バット') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA35BT/OPM-1-067 マジ殴り
    scripts['UA35BT/OPM-1-067'] = {
        getEnergyDiscount() { return Math.floor(countMyOutside() / 5); },
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' },
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'ENERGY_LINE', count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 紅色 ====================

    // UA35BT/OPM-1-070 音速のソニック
    scripts['UA35BT/OPM-1-070'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && totalBothLife() <= 4) ? 1000 : 0; }
    };

    // UA35BT/OPM-1-074 ガロウ / 094 獣王
    scripts['UA35BT/OPM-1-074'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; } };
    scripts['UAPR/OPM-1-074'] = scripts['UA35BT/OPM-1-074'];
    scripts['UA35BT/OPM-1-094'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; } };

    // UA35BT/OPM-1-077 ガロウ (突襲)
    scripts['UA35BT/OPM-1-077'] = {
        requireRaided: true,
        getContinuousBpBonus() {
            const cnt = countMyOutside();
            return (cnt >= 15 ? 1000 : (cnt >= 10 ? 500 : 0));
        },
        getContinuousImpact() { return countMyOutside() >= 10 ? 1 : 0; },
        onAttack(engine, cardEl, onComplete) { if (countMyOutside() >= 5) engine.drawCards(1); if (onComplete) onComplete(); },
        onUnblockedAttack(engine, cardEl, onComplete) {
            const rt = engine.getRuntime(cardEl);
            if (countMyOutside() >= 15 && !rt.usedOncePerTurn) { rt.usedOncePerTurn = true; cardEl.classList.remove('rest'); }
            if (onComplete) onComplete();
        }
    };

    // UA35BT/OPM-1-082 ボロス (突襲)
    scripts['UA35BT/OPM-1-082'] = {
        requireRaided: true,
        getEnergyDiscount() { return totalBothLife() <= 4 ? 2 : 0; },
        onPlay(engine, cardEl, onComplete) { engine.addSlotBp(cardEl.parentElement, 1000); if (onComplete) onComplete(); }
    };

    // UA35BT/OPM-1-085 ゴウケツ
    scripts['UA35BT/OPM-1-085'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'GREEN'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA35BT/OPM-1-099 風刃脚
    scripts['UA35BT/OPM-1-099'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('音速のソニック') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 黃色 ====================

    // UA35BT/OPM-1-007 ジェノス
    scripts['UA35BT/OPM-1-007'] = {
        getContinuousBpBonus(engine) { return engine.hasCharacterOnMyField('サイタマ') ? 1000 : 0; }
    };

    // UA35BT/OPM-1-013 戦慄のタツマキ
    scripts['UA35BT/OPM-1-013'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedEventThisTurn) ? 1000 : 0; }
    };

    // UA35BT/OPM-1-015 戦慄のタツマキ (突襲)
    scripts['UA35BT/OPM-1-015'] = {
        requireRaided: true,
        getContinuousImpact(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedEventThisTurn) ? 1 : 0; },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.usedNamedAbilityThisTurn.has('タツマキ_AP'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.usedNamedAbilityThisTurn.add('タツマキ_AP');
            engine.pendingApDiscounts.push({ amount: 1, desc: '下次事件卡 AP-1', matchFn: (d) => d.type === 'EVENT' });
            showSysMsg('〈戦慄のタツマキ〉本回合下次手牌事件卡消費 AP-1！');
            if (onComplete) onComplete();
        }
    };

    // UA35BT/OPM-1-022 地獄のフブキ
    scripts['UA35BT/OPM-1-022'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name.includes('戦慄のタツマキ'))) ? 1000 : 0;
        }
    };

    // UA35BT/OPM-1-024 マツゲ＆山猿
    scripts['UA35BT/OPM-1-024'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['GREEN', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA35BT/OPM-1-025 フブキ組
    scripts['UA35BT/OPM-1-025'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest') && engine.usedEventThisTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => { if (engine.getCardDef(c)?.type === 'CHARACTER') engine.addSlotBp(c.parentElement, 1000); });
            if (onComplete) onComplete();
        }
    };

    // UA35BT/OPM-1-029 焼却
    scripts['UA35BT/OPM-1-029'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('ジェノス') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA35ST/OPM-1-029'] = scripts['UA35BT/OPM-1-029'];

    // UA35BT/OPM-1-031 超能力
    scripts['UA35BT/OPM-1-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            let maxBp = 2000;
            if (engine.hasCharacterOnMyField('戦慄のタツマキ')) maxBp += engine.countEventsInMyOutside() * 1000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA35ST/OPM-1-109 ワンパン
    scripts['UA35ST/OPM-1-109'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const oppLife = document.querySelectorAll('#opp-life-area .card').length;
            engine.promptModal({
                title: 'ワンパン', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    ...(oppLife >= 3 ? [{ label: '給予對手玩家 1 點傷害', color: '#c1596f', onClick: () => { engine.sendDamageToOpponent(1); if (onComplete) onComplete(); } }] : []),
                    {
                        label: '我方〈サイタマ〉本回合獲 [インパクト(1)]', color: '#4f9678',
                        onClick: () => {
                            const s = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('サイタマ'));
                            if (s.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '選擇〈サイタマ〉', desc: '選擇最多 1 張：', cards: s, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length > 0) engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1); if (onComplete) onComplete(); }
                            });
                        }
                    }
                ]
            });
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
