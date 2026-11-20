/**
 * UA DLC 腳本包：Code Geass 反叛的魯路修 (1彈 + 2彈全色：紅 / 藍 / 綠 / 紫，共 204 張)
 * 檔名：dlc/dlc-cgh.js
 */
(function () {
    const scripts = {};

    function countMyTrait(engine, trait, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes(trait)).length;
    }

    // ==================== 藍色 ====================

    // EX02BT/CGH-2-025 暁 直参仕様（C.C.機）(突襲)
    scripts['EX02BT/CGH-2-025'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            document.querySelectorAll('#opp-front-line .slot').forEach(s => {
                const top = engine.getTopCardInSlot(s);
                if (top && engine.getEffectiveCardBp(top) >= 1000) engine.addSlotBp(s, -500);
            });
            if (onComplete) onComplete();
        }
    };

    // EX02BT/CGH-2-027 サザーランド可翔式（ジェレミア機）(突襲)
    scripts['EX02BT/CGH-2-027'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; }
    };

    // EX02BT/CGH-2-029 鋼髏 (突襲)
    scripts['EX02BT/CGH-2-029'] = {
        requireRaided: true,
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyTrait(engine, '中華連邦', cardEl) >= 4) ? 1000 : 0; }
    };

    // EX02BT/CGH-2-035 天愕覇王荷電粒子重砲
    scripts['EX02BT/CGH-2-035'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasXing = engine.hasCharacterOnMyField('黎 星刻') || engine.hasCharacterOnMyField('神虎');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: hasXing ? 5000 : 3000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 綠色 ====================

    // EX02BT/CGH-2-058 トリスタン / 059 モルドレッド (突襲)
    scripts['EX02BT/CGH-2-058'] = {
        requireRaided: true,
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyTrait(engine, 'ナイトオブラウンズ', cardEl) >= 3) ? 500 : 0; },
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); }
    };
    scripts['EX02BT/CGH-2-059'] = {
        requireRaided: true,
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyTrait(engine, 'ナイトオブラウンズ', cardEl) >= 3) ? 500 : 0; }
    };

    // EX02BT/CGH-2-060 ランスロット・コンクエスター (突襲)
    scripts['EX02BT/CGH-2-060'] = {
        requireRaided: true,
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyTrait(engine, 'ナイトオブラウンズ', cardEl) >= 3) ? 1000 : 0; },
        getContinuousImpact(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyTrait(engine, 'ナイトオブラウンズ', cardEl) >= 3) ? 1 : 0; }
    };

    // UA01BT/CGH-1-040 シャルル・ジ・ブリタニア
    scripts['UA01BT/CGH-1-040'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.pendingApDiscounts.push({ amount: 1, desc: '下次事件卡 AP-1', matchFn: (d) => d.type === 'EVENT' });
            engine.executeAbilityActions(cardEl, [{ type: 'LOOK_TOP_DECK', count: 3, pickAction: 'HAND', pickUpTo: 1, upTo: false, remainderTo: 'BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA01BT/CGH-1-049 ヴィレッタ・ヌゥ
    scripts['UA01BT/CGH-1-049'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['PURPLE', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA01BT/CGH-1-056 グロースター（親衛隊機）(突襲)
    scripts['UA01BT/CGH-1-056'] = {
        requireRaided: true,
        getContinuousBpBonus(engine, cardEl) {
            if (!cardEl.closest('#my-front-line')) return 0;
            return engine.getSlotTopCards('#my-front-line .slot').filter(c => c !== cardEl).length * 500;
        },
        getContinuousImpact(engine, cardEl) { return engine.getEffectiveCardBp(cardEl) >= 4000 ? 1 : 0; }
    };

    // UA01BT/CGH-1-057 サザーランド（純血派機）(突襲)
    scripts['UA01BT/CGH-1-057'] = {
        requireRaided: true,
        getContinuousBpBonus() { return 1000; }
    };

    // UA01BT/CGH-1-059 ランスロット (突襲)
    scripts['UA01BT/CGH-1-059'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.addSlotBp(cardEl.parentElement, 1000);
            engine.getRuntime(cardEl).persistentBp = (engine.getRuntime(cardEl).persistentBp || 0) + 1000;
            if (onComplete) onComplete();
        }
    };

    // UA01BT/CGH-1-063 V.A.R.I.S
    scripts['UA01BT/CGH-1-063'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasS = engine.hasCharacterOnMyField('枢木 スザク') || engine.hasCharacterOnMyField('ランスロット');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: hasS ? 5000 : 3000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA01BT/CGH-1-067 軍備拡張
    scripts['UA01BT/CGH-1-067'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = 1000 + engine.getSlotTopCards('#my-front-line .slot').length * 1000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 紫色 ====================

    // EX02BT/CGH-2-038 紅月 カレン
    scripts['EX02BT/CGH-2-038'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            engine.pendingApDiscounts.push({ amount: 1, desc: 'AP2卡片 AP-1', matchFn: (d) => (d.apCost ?? 1) === 2 });
            if (onComplete) onComplete();
        }
    };

    // UA01BT/CGH-1-010 玉城 真一郎
    scripts['UA01BT/CGH-1-010'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['GREEN', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA01BT/CGH-1-022 ガウェイン (突襲)
    scripts['UA01BT/CGH-1-022'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            document.querySelectorAll('#opp-front-line .slot').forEach(s => { if (engine.getTopCardInSlot(s)) engine.addSlotBp(s, -1000); });
            if (onComplete) onComplete();
        }
    };

    // UA01BT/CGH-1-030 絶対遵守のギアス
    scripts['UA01BT/CGH-1-030'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                if (engine.hasCharacterOnMyField('ルルーシュ')) engine.activateMyApCards(1);
                if (onComplete) onComplete();
            });
        }
    };
    scripts['UA01ST/CGH-1-030'] = scripts['UA01BT/CGH-1-030'];

    // UA01BT/CGH-1-031 旋回活殺自在陣
    scripts['UA01BT/CGH-1-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const cnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && (d.traits?.includes('四聖剣') || d.name.includes('藤堂 鏡志朗') || d.name.includes('月下（藤堂機）'));
            }).length;
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: -1000 * cnt, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA01BT/CGH-1-033 チェックメイト
    scripts['UA01BT/CGH-1-033'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const actions = [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
            ];
            if (engine.hasCharacterOnMyField('ルルーシュ')) actions.push({ type: 'GRANT_KEYWORD', keyword: 'IMPACT_PLUS', value: 1, target: 'SELECTED' });
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA01ST/CGH-1-033'] = scripts['UA01BT/CGH-1-033'];

    // ==================== 紅色 ====================

    // UA01BT/CGH-1-085 ニーナ・アインシュタイン
    scripts['UA01BT/CGH-1-085'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['PURPLE', 'GREEN'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA01BT/CGH-1-092 ルルーシュ・ランペルージ (突襲)
    scripts['UA01BT/CGH-1-092'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const maxBp = engine.countEventsInMyOutside() >= 4 ? 4000 : 2000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA01BT/CGH-1-097 チェス勝負
    scripts['UA01BT/CGH-1-097'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.countEventsInMyOutside() >= 3 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA01BT/CGH-1-098 ホラーハウス
    scripts['UA01BT/CGH-1-098'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const oppLife = document.querySelectorAll('#opp-life-area .card').length;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: oppLife <= 4 ? 5000 : 3000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
