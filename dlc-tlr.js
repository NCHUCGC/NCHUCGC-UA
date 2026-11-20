/**
 * UA DLC 腳本包：To LOVE 出包王女 (To LOVE-Ru) - 全色 (紅 / 黃，共 95 張)
 * 檔名：dlc/dlc-tlr.js
 */
(function () {
    const scripts = {};

    // ==================== 紅色 ====================

    // UA45BT/TLR-1-052 西連寺 春菜
    scripts['UA45BT/TLR-1-052'] = {
        onPlay(engine, cardEl, onComplete) {
            const othersCnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => c !== cardEl).length;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: true },
                { type: 'MODIFY_BP', amount: othersCnt >= 5 ? 2000 : 1000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA45BT/TLR-1-053 西連寺 春菜 (突襲)
    scripts['UA45BT/TLR-1-053'] = {
        requireRaided: true,
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn
                && engine.getSlotTopCards('#my-front-line .slot').some(c => !engine.getCardDef(c)?.name.includes('西連寺 春菜'));
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot').filter(c => !engine.getCardDef(c)?.name.includes('西連寺 春菜'));
            engine.promptModal({
                title: '起動メイン：西連寺 春菜', desc: '選擇前線 1 張〈西連寺 春菜〉以外的角色 BP+1000 並抽 1 張牌：',
                cards: cands, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) { engine.getRuntime(cardEl).usedOncePerTurn = true; engine.addSlotBp(sel[0].parentElement, 1000); engine.drawCards(1); }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA45BT/TLR-1-059 / 061 ナナ・アスタ・デビルーク
    scripts['UA45BT/TLR-1-059'] = {
        onRetire(engine, cardEl, onComplete) { if (engine.hasCharacterOnMyField('モモ・ベリア・デビルーク')) engine.drawCards(1); if (onComplete) onComplete(); }
    };
    scripts['UA45BT/TLR-1-061'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('モモ・ベリア・デビルーク')) ? 1500 : 0; }
    };

    // UA45BT/TLR-1-073 ララ・サタリン・デビルーク
    scripts['UA45BT/TLR-1-073'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer !== null && !engine.isMyTurn) ? 500 : 0; }
    };
    scripts['UAPB/TLR-1-073'] = scripts['UA45BT/TLR-1-073'];

    // UA45BT/TLR-1-078 キャノンフラワー
    scripts['UA45BT/TLR-1-078'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('モモ・ベリア・デビルーク') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA45BT/TLR-1-081 ハレンチなっ!!
    scripts['UA45BT/TLR-1-081'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: 'ハレンチなっ!!', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    { label: '退場對手前線 BP4000 以下 1 角色', color: '#c1596f', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 4000, count: 1, upTo: false }, { type: 'RETIRE_TARGET', target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    {
                        label: '我方〈古手川 唯〉BP+2000 與衝擊 1 並抽 1 張', color: '#4f9678',
                        onClick: () => {
                            engine.drawCards(1);
                            const yuis = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('古手川 唯'));
                            if (yuis.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '選擇〈古手川 唯〉', desc: '選擇最多 1 張：', cards: yuis, selectCount: 1, upTo: true,
                                onConfirm: (sel) => {
                                    if (sel.length > 0) {
                                        engine.addSlotBp(sel[0].parentElement, 2000);
                                        engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1);
                                    }
                                    if (onComplete) onComplete();
                                }
                            });
                        }
                    }
                ]
            });
        }
    };

    // ==================== 黃色 ====================

    // UA45BT/TLR-1-001 霧崎 恭子
    scripts['UA45BT/TLR-1-001'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn
                && engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name.includes('ルン・エルシ・ジュエリア'));
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const runs = engine.getSlotTopCards('#my-front-line .slot').filter(c => engine.getCardDef(c)?.name.includes('ルン・エルシ・ジュエリア'));
            engine.promptModal({
                title: '起動メイン：霧崎 恭子', desc: '選擇前線 1 張〈ルン〉，雙方 BP+1000 且此卡獲衝擊 1：',
                cards: runs, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const rt = engine.getRuntime(cardEl);
                        rt.usedOncePerTurn = true;
                        engine.addSlotBp(sel[0].parentElement, 1000);
                        engine.addSlotBp(slot, 1000);
                        rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA45BT/TLR-1-018 ルン・エルシ・ジュエリア
    scripts['UA45BT/TLR-1-018'] = {
        onAttack(engine, cardEl, onComplete) {
            if (engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name.includes('霧崎 恭子'))) engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    // UA45BT/TLR-1-022 黒咲 芽亜 / 027 金色の闇 / 028 突襲金色の闇 / 029 ダークネス
    scripts['UA45BT/TLR-1-022'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; } };
    scripts['UA45BT/TLR-1-027'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('結城 美柑')) ? 1000 : 0; } };
    scripts['UA45BT/TLR-1-028'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('結城 美柑')) ? 1500 : 0; },
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); }
    };
    scripts['UA45BT/TLR-1-029'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; } };

    // UA45BT/TLR-1-037 えっちぃのはキライです
    scripts['UA45BT/TLR-1-037'] = {
        onEventPlay(engine, cardEl, onComplete) {
            let maxBp = 3000;
            if (engine.hasCharacterOnMyField('金色の闇') || engine.hasCharacterOnMyField('ダークネス')) {
                const lowEnCnt = engine.getSlotTopCards('#my-front-line .slot').filter(c => (engine.getCardDef(c)?.requiredEnergy?.count || 0) <= 3).length;
                maxBp += lowEnCnt * 1000;
            }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA45BT/TLR-1-039 ダークマター
    scripts['UA45BT/TLR-1-039'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('ネメシス') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'SEND_TARGET_TO_REMOVE' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA45BT/TLR-1-041 美柑の手料理
    scripts['UA45BT/TLR-1-041'] = {
        onEventPlay(engine, cardEl, onComplete) {
            document.querySelectorAll('#my-front-line .slot').forEach(s => { if (engine.getTopCardInSlot(s)) engine.addSlotBp(s, 1000); });
            engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
