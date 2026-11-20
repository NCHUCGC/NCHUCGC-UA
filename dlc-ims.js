/**
 * UA DLC 腳本包：偶像大師 閃耀色彩 (THE iDOLM@STER SHINY COLORS) - 1~3彈全色 (藍 / 紫 / 紅 / 黃，共 264 張)
 * 檔名：dlc/dlc-ims.js
 */
(function () {
    const scripts = {};

    function countDistinctTraitOnField(engine, trait, excludeEl = null) {
        const names = new Set();
        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
            if (c === excludeEl) return;
            const d = engine.getCardDef(c);
            if (d && d.traits?.includes(trait) && d.name) names.add(d.name);
        });
        return names.size;
    }

    function countFieldTrait(engine, trait, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes(trait)).length;
    }

    function countMyRemove() { return document.querySelectorAll('#my-remove-area .card').length; }
    function countMyOutside() { return document.querySelectorAll('#my-outside-area .card').length; }
    function countMyDeck() { return document.querySelectorAll('#my-deck-area .card').length; }

    function hasNoOtherRestInSameLine(engine, cardEl) {
        const line = cardEl.closest('#my-front-line, #my-energy-line');
        if (!line) return false;
        return !engine.getSlotTopCards(`#${line.id} .slot`).some(c => c !== cardEl && c.classList.contains('rest'));
    }

    // ==================== 藍色 ====================

    // PC01BT/IMS-3-012 月岡 恋鐘 / 016 市川 雛菜 / 018 福丸 小糸 (突襲)
    scripts['PC01BT/IMS-3-012'] = { getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countDistinctTraitOnField(engine, "L'Antica", cardEl) >= 2) ? 500 : 0; } };
    scripts['PC01BT/IMS-3-016'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('福丸 小糸')) ? 1000 : 0; } };
    scripts['PC01BT/IMS-3-018'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('市川 雛菜')) ? 500 : 0; }
    };

    // PC01BT/IMS-3-019 がんばれ！ ノロマ号
    scripts['PC01BT/IMS-3-019'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            if (countFieldTrait(engine, 'noctchill') >= 1) engine.activateMyApCards(1);
            if (onComplete) onComplete();
        }
    };

    // UA04BT/IMS-1-037 田中 摩美々 / 043 三峰 結華
    scripts['UA04BT/IMS-1-037'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA04BT/IMS-1-043'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer !== null && !engine.isMyTurn) ? 1000 : 0; } };

    // UA04BT/IMS-1-061 かっとばし党の長い夏 / 062 SIDE：K
    scripts['UA04BT/IMS-1-061'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const has3 = countDistinctTraitOnField(engine, 'noctchill') >= 3;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: has3 ? 'SEND_TARGET_TO_BOTTOM' : 'BOUNCE_TO_HAND', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA04BT/IMS-1-062'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countDistinctTraitOnField(engine, "L'Antica") >= 3 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 紫色 ====================

    // EX03BT/IMS-2-043 田中 摩美々 (突襲) / 052 幽谷 霧子 (突襲)
    scripts['EX03BT/IMS-2-043'] = { requireRaided: true, getContinuousImpact() { return countMyDeck() <= 20 ? 1 : 0; } };

    // EX03BT/IMS-2-053 斑鳩 ルカ / 055 SIDE：Y / 058 Noir
    scripts['EX03BT/IMS-2-053'] = {
        onPlay(engine, cardEl, onComplete) {
            const has283 = engine.getSlotTopCards('#my-energy-line .slot').some(c => engine.getCardDef(c)?.name?.includes('283プロダクション'));
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'MODIFY_BP', amount: has283 ? -4000 : -2000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['EX03BT/IMS-2-055'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const cnt = countFieldTrait(engine, "L'Antica");
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: -1000 * cnt, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['EX03BT/IMS-2-058'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countDistinctTraitOnField(engine, 'ALSTROEMERIA') >= 3 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // PC01BT/IMS-3-030 斑鳩 ルカ / 037 鈴木 羽那 / 041 ※CAUTION※
    scripts['PC01BT/IMS-3-030'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyRemove() >= 3) ? 1000 : 0; } };
    scripts['PC01BT/IMS-3-037'] = { getContinuousBpBonus() { return countMyRemove() >= 3 ? 1000 : 0; } };
    scripts['UAPR/IMS-3-037'] = scripts['PC01BT/IMS-3-037'];
    scripts['PC01BT/IMS-3-041'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countFieldTrait(engine, 'CoMETIK') >= 3 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 紅色 ====================

    // EX03BT/IMS-2-061 和泉 愛依 (突襲) / 064 芹沢 あさひ / PC01BT/IMS-3-046 小宮 果穂 (突襲)
    scripts['EX03BT/IMS-2-061'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countDistinctTraitOnField(engine, 'Straylight') >= 3) ? 1000 : 0; },
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); }
    };
    scripts['EX03BT/IMS-2-064'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; } };
    scripts['PC01BT/IMS-3-046'] = { requireRaided: true, getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; } };

    // UA04BT/IMS-1-083 小宮 果穂 (突襲) / 084 西城 樹里 / 086 西城 樹里 (突襲)
    scripts['UA04BT/IMS-1-083'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            if (hasNoOtherRestInSameLine(engine, cardEl)) {
                engine.addSlotBp(cardEl.parentElement, 500);
                engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
            }
            if (onComplete) onComplete();
        }
    };
    scripts['UA04BT/IMS-1-084'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'BLUE'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA04BT/IMS-1-086'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            if (hasNoOtherRestInSameLine(engine, cardEl)) {
                engine.addSlotBp(cardEl.parentElement, 1000);
                engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
            }
            if (onComplete) onComplete();
        }
    };

    // UA04BT/IMS-1-094 グッド・ラック・ボール / 098 ノー墨・勝者フェイス / 100 反撃の狼煙をあげよ！
    scripts['UA04BT/IMS-1-094'] = {
        onEventPlay(engine, cardEl, onComplete) {
            if (document.querySelectorAll('#opp-life-area .card').length >= 3) engine.sendDamageToOpponent(1);
            if (onComplete) onComplete();
        }
    };
    scripts['UA04BT/IMS-1-098'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countDistinctTraitOnField(engine, 'Straylight') >= 3 ? 4000 : 2000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' },
                { type: 'DRAW', amount: 1 },
                { type: 'DISCARD_HAND', count: 1 }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA04BT/IMS-1-100'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countDistinctTraitOnField(engine, '放課後クライマックスガールズ') >= 3 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 黃色 ====================

    // EX03BT/IMS-2-002 大崎 甜花 / 006 風野 灯織 / 008 櫻木 真乃 (突襲)
    scripts['EX03BT/IMS-2-002'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyOutside() === 0) ? 1500 : 0; } };
    scripts['EX03BT/IMS-2-006'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('櫻木 真乃') && engine.hasCharacterOnMyField('八宮 めぐる')) ? 500 : 0; } };
    scripts['EX03BT/IMS-2-008'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('風野 灯織')) ? 500 : 0; }
    };

    // UA04BT/IMS-1-004 大崎 甘奈 / 007 大崎 甜花 / 008 桑山 千雪 / 025 七草 にちか
    scripts['UA04BT/IMS-1-004'] = { requireRaided: true, getEnergyDiscount() { return countMyOutside() <= 3 ? 1 : 0; } };
    scripts['UA04BT/IMS-1-007'] = { requireRaided: true, getContinuousImpact() { return countMyOutside() <= 3 ? 1 : 0; } };
    scripts['UA04BT/IMS-1-008'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['BLUE', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA04BT/IMS-1-025'] = { requireRaided: true, getContinuousImpact(engine) { return engine.hasCharacterOnMyField('緋田 美琴') ? 1 : 0; } };

    // UA04BT/IMS-1-028 お揃いスナップ / 029 こんなのホラーでしょ最悪
    scripts['UA04BT/IMS-1-028'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const has3 = countDistinctTraitOnField(engine, 'illumination') >= 3;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: has3 ? 'RETIRE_TARGET' : 'SET_REST', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA04ST/IMS-1-028'] = scripts['UA04BT/IMS-1-028'];
    scripts['UA04BT/IMS-1-029'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countDistinctTraitOnField(engine, 'SHHis') >= 2 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
