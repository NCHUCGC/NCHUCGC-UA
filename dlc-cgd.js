/**
 * UA DLC 腳本包：Code Geass 奪還的羅潔 (Code Geass: Rozé of the Recapture) - 全色 (藍 / 黃，共 83 張)
 * 檔名：dlc/dlc-cgd.js
 */
(function () {
    const scripts = {};

    // ==================== 藍色 ====================

    // UA34BT/CGD-1-050 キャサリン・サバスラ
    scripts['UA34BT/CGD-1-050'] = {
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.addSlotBp(slot, 1000);
                if (onComplete) onComplete();
            });
        }
    };

    // UA34BT/CGD-1-054 クリストフ・シザーマン
    scripts['UA34BT/CGD-1-054'] = {
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn
                && engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => c !== cardEl && engine.getCardDef(c)?.type === 'CHARACTER');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const others = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => c !== cardEl && engine.getCardDef(c)?.type === 'CHARACTER');
            engine.promptModal({
                title: '起動メイン：クリストフ', desc: '選擇 1 張其他我方角色退場，本回合 BP+2500：',
                cards: others, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        engine.retireCardFromSlot(sel[0].parentElement);
                        engine.addSlotBp(slot, 2500);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA34BT/CGD-1-057 ディボック・メルテ
    scripts['UA34BT/CGD-1-057'] = {
        getContinuousBpBonus(engine) {
            return (engine.isFirstPlayer !== null && !engine.isMyTurn && engine.getSlotTopCards('#my-energy-line .slot').some(c => engine.getCardDef(c)?.name.includes('天空要塞ダモクレス'))) ? 500 : 0;
        }
    };

    // UA34BT/CGD-1-068 クインアスラ (突襲)
    scripts['UA34BT/CGD-1-068'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(3);
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 2 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            if (allDeck.length === 0) { if (onComplete) onComplete(); return; }
            const top = allDeck[allDeck.length - 1];
            const isEn4 = (engine.getCardDef(top)?.requiredEnergy?.count || 0) === 4;
            deckArea.insertBefore(top, deckArea.firstChild);
            recalcStacking(deckArea);
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            if (isEn4) {
                engine.addSlotBp(slot, 1000);
                engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
            }
            if (onComplete) onComplete();
        }
    };

    // UA34BT/CGD-1-077 ザコはゆっくりおやすみなさい♪
    scripts['UA34BT/CGD-1-077'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasC = engine.hasCharacterOnMyField('キャサリン') || engine.hasCharacterOnMyField('クインクラカ');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: hasC ? 5000 : 3000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA34BT/CGD-1-080 ノーランドの思惑
    scripts['UA34BT/CGD-1-080'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.pendingApDiscounts.push({
                amount: 1, desc: 'ノーランド／ファウルバウト AP-1',
                matchFn: (d) => d.name && (d.name.includes('ノーランド') || d.name.includes('ファウルバウト'))
            });
            engine.executeAbilityActions(cardEl, [{ type: 'LOOK_TOP_DECK', count: 3, pickAction: 'HAND', pickUpTo: 1, upTo: false, remainderTo: 'BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 黃色 ====================

    // UA34BT/CGD-1-006 黒戸 剣成
    scripts['UA34BT/CGD-1-006'] = {
        onPlay(engine, cardEl, onComplete) {
            if (!engine.usedNamedAbilityThisTurn.has('黒戸 剣成')) {
                engine.usedNamedAbilityThisTurn.add('黒戸 剣成');
                engine.pendingApDiscounts.push({
                    amount: 1, desc: '3費以下 KMF AP-1',
                    matchFn: (d) => d.traits?.includes('KMF') && (d.requiredEnergy?.count || 0) <= 3
                });
            }
            if (onComplete) onComplete();
        }
    };

    // UA34BT/CGD-1-011 琉高 ハルカ
    scripts['UA34BT/CGD-1-011'] = {
        getContinuousBpBonus(engine) {
            if (engine.isFirstPlayer !== null && !engine.isMyTurn) return 0;
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => {
                const d = engine.getCardDef(c);
                return d && d.traits?.includes('KMF') && (d.requiredEnergy?.count || 0) <= 3;
            }) ? 500 : 0;
        }
    };

    // UA34BT/CGD-1-024 アッシュ
    scripts['UA34BT/CGD-1-024'] = {
        onAttack(engine, cardEl, onComplete) {
            if (engine.hasCharacterOnMyField('ラズベリー')) engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    // UA34BT/CGD-1-030 雪花 (突襲)
    scripts['UA34BT/CGD-1-030'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; },
        onPlay(engine, cardEl, onComplete) {
            const hasKmf = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('KMF') && (engine.getCardDef(c)?.requiredEnergy?.count || 0) <= 3);
            if (hasKmf) engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    // UA34BT/CGD-1-035 おかわりはいかがです？
    scripts['UA34BT/CGD-1-035'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
                if (engine.getCardDef(c)?.traits?.includes('喫茶シュマリ')) c.classList.remove('rest');
            });
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' },
                { type: 'GRANT_KEYWORD', keyword: 'IMPACT', value: 1, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA34BT/CGD-1-039 七煌星団のエース
    scripts['UA34BT/CGD-1-039'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasAce = engine.hasCharacterOnMyField('琉高 ハルカ') || engine.hasCharacterOnMyField('蛍雪');
            const hasKmf = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => engine.getCardDef(c)?.traits?.includes('KMF') && (engine.getCardDef(c)?.requiredEnergy?.count || 0) <= 3);
            const maxBp = hasAce ? (hasKmf ? 5000 : 4000) : 2000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
