/**
 * UA DLC 腳本包：偶像大師 灰姑娘女孩 (THE iDOLM@STER CINDERELLA GIRLS) - 全色 (藍 / 紅 / 黃，共 140 張)
 * 檔名：dlc/dlc-imc.js
 */
(function () {
    const scripts = {};

    function countMyTrait(engine, trait) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => engine.getCardDef(c)?.traits?.includes(trait)).length;
    }

    function countOnegaiDistinct(engine) {
        const names = new Set();
        document.querySelectorAll('#my-front-line .slot .card, #my-energy-line .slot .card, #my-outside-area .card').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.traits?.includes('お願い！シンデレラ') && d.name) names.add(d.name);
        });
        return names.size;
    }

    function countStarryEn2(engine) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => { const d = engine.getCardDef(c); return d && d.traits?.includes('Starry-Go-Round') && (d.requiredEnergy?.count || 0) === 2; }).length;
    }

    // ==================== 藍色 ====================

    // UA55BT/IMC-1-046 早坂 美玲 / 048 一ノ瀬 志希
    scripts['UA55BT/IMC-1-046'] = { getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; } };
    scripts['UA55BT/IMC-1-048'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; },
        onPlay(engine, cardEl, onComplete) { engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete); }
    };

    // UA55BT/IMC-1-062 ガールズ・イン・ザ・フロンティア / 064 Tulip / 066 Hotel Moonside
    scripts['UA55BT/IMC-1-062'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countMyTrait(engine, 'ガールズ') >= 3 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA55BT/IMC-1-064'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const has3 = countMyTrait(engine, 'LiPPS') >= 3;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: has3 ? 'RETIRE_TARGET' : 'BOUNCE_TO_HAND', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA55BT/IMC-1-066'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const oppHas4500 = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => engine.getEffectiveCardBp(c) >= 4500);
            engine.drawCards(oppHas4500 ? 3 : 2);
            if (onComplete) onComplete();
        }
    };

    // ==================== 紅色 ====================

    // UA55BT/IMC-1-069 小日向 美穂 / 071 城ヶ崎 莉嘉 / 075 諸星 きらり
    scripts['UA55BT/IMC-1-069'] = {
        onPlay(engine, cardEl, onComplete) {
            if (countOnegaiDistinct(engine) >= 6) { engine.drawCards(1); if (onComplete) onComplete(); }
            else engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA55BT/IMC-1-071'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countOnegaiDistinct(engine) >= 6) ? 1500 : 0; } };
    scripts['UA55BT/IMC-1-075'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countOnegaiDistinct(engine) >= 6) ? 1000 : 0; } };

    // UA55BT/IMC-1-077 アナスタシア / 083 & 084 姫川 友紀 / 097 本田 未央
    scripts['UA55BT/IMC-1-077'] = scripts['UA55BT/IMC-1-048'];
    scripts['UAPB/IMC-1-077'] = scripts['UA55BT/IMC-1-048'];
    scripts['UA55BT/IMC-1-083'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countStarryEn2(engine) >= 3) ? 1000 : 0; } };
    scripts['UA55BT/IMC-1-084'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countStarryEn2(engine) >= 3) ? 1500 : 0; } };
    scripts['UA55BT/IMC-1-097'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer !== null && !engine.isMyTurn) ? -1000 : 0; } };
    scripts['UA55ST/IMC-1-097'] = scripts['UA55BT/IMC-1-097'];
    scripts['UAPB/IMC-1-097'] = scripts['UA55BT/IMC-1-097'];

    // UA55BT/IMC-1-098 お願い！シンデレラ / 099 Starry-Go-Round / UA55ST/IMC-1-108 & 109
    scripts['UA55BT/IMC-1-098'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            engine.pendingApDiscounts.push({ amount: 1, desc: 'お願い！シンデレラ AP-1', matchFn: (d) => d.traits?.includes('お願い！シンデレラ') });
            if (onComplete) onComplete();
        }
    };
    scripts['UA55BT/IMC-1-099'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countMyTrait(engine, 'Starry-Go-Round') >= 3 ? 5000 : 2000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                if (countStarryEn2(engine) >= 4) {
                    engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true }, { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                } else if (onComplete) onComplete();
            });
        }
    };
    scripts['UA55ST/IMC-1-108'] = {
        onEventPlay(engine, cardEl, onComplete) {
            document.querySelectorAll('#my-front-line .slot').forEach(s => { if (engine.getTopCardInSlot(s)) engine.addSlotBp(s, 1000); });
            engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };
    scripts['UA55ST/IMC-1-109'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countMyTrait(engine, 'new') * 1000;
            if (maxBp <= 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 黃色 ====================

    // UA55BT/IMC-1-003 大槻 唯 / 006 緒方 智絵里 / 026 本田 未央
    scripts['UA55BT/IMC-1-003'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer !== null && !engine.isMyTurn) ? 1000 : 0; } };
    scripts['UAPB/IMC-1-003'] = scripts['UA55BT/IMC-1-003'];
    scripts['UA55BT/IMC-1-006'] = { getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; } };
    scripts['UA55BT/IMC-1-026'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; } };

    // UA55BT/IMC-1-030 情熱ファンファンファーレ / 032 DOKIDOKIリズム
    scripts['UA55BT/IMC-1-030'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countMyTrait(engine, 'ポジティブパッション') >= 3 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA55BT/IMC-1-032'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('BEYOND'));
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'DOKIDOKIリズム', desc: '選擇 1 張［特徴：BEYOND THE STARLIGHT］BP+2000（〈城ヶ崎 莉嘉〉再獲衝擊 1）：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.addSlotBp(sel[0].parentElement, 2000);
                        if (engine.getCardDef(sel[0])?.name?.includes('城ヶ崎 莉嘉')) {
                            engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1);
                        }
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
