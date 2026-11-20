/**
 * UA DLC 腳本包：黑色五葉草 (Black Clover) - 綠色 (共 38 張)
 * 檔名：dlc-bcv-green.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // UA20BT/BCV-1-037 シャーロット
    scripts['UA20BT/BCV-1-037'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('ヤミ・スケヒロ')) ? 500 : 0; }
    };

    // UA20BT/BCV-1-038 ノゼル
    scripts['UA20BT/BCV-1-038'] = {
        onAttack(engine, cardEl, onComplete) { if (engine.getEffectiveCardBp(cardEl) >= 5000) engine.drawCards(1); if (onComplete) onComplete(); }
    };

    // UA20BT/BCV-1-042 メレオレオナ (突襲)
    scripts['UA20BT/BCV-1-042'] = {
        requireRaided: true,
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: false },
                { type: 'SET_ACTIVE', target: 'SELECTED' },
                { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA20BT/BCV-1-045 アスタ
    scripts['UA20BT/BCV-1-045'] = {
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            rt.usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.addSlotBp(slot, 1000);
                rt.persistentBp = (rt.persistentBp || 0) + 1000;
                if (onComplete) onComplete();
            });
        }
    };

    // UA20BT/BCV-1-046 アスタ (突襲)
    scripts['UA20BT/BCV-1-046'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            if (allDeck.length === 0) { if (onComplete) onComplete(); return; }
            const top = allDeck[allDeck.length - 1];
            const d = engine.getCardDef(top);
            const isEn3 = (d?.requiredEnergy?.count || 0) === 3 || engine.getBaseCardId(top.dataset.cardId) === 'UA20ST/BCV-1-112';
            if (isEn3) engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
            engine.executeAbilityActions(cardEl, [{ type: 'LOOK_TOP_DECK', count: 1, pickUpTo: 0, remainderTo: 'TOP_OR_BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA20BT/BCV-1-047 セクレ (突襲)
    scripts['UA20BT/BCV-1-047'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.moveCardToZone(cardEl, document.getElementById('my-outside-area'));
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'SET_REST', target: 'SELECTED' },
                { type: 'FREEZE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA20BT/BCV-1-052 ヤミ・スケヒロ
    scripts['UA20BT/BCV-1-052'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; }
    };

    // UA20BT/BCV-1-053 ヤミ・スケヒロ
    scripts['UA20BT/BCV-1-053'] = {
        onPlay(engine, cardEl, onComplete) {
            if (engine.getActiveApCards().length < 1) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：ヤミ・スケヒロ (需 1 AP)', desc: '是否支付 1 AP 選擇 1 項效果？', cards: [],
                customButtons: [
                    { label: '付 1 AP：抽 2 張牌', color: '#4f9678', onClick: () => { if (engine.payAp(1)) engine.drawCards(2); if (onComplete) onComplete(); } },
                    { label: '付 1 AP：將對手前線 1 突襲角色最上層送場外', color: '#c1596f', onClick: () => { if (engine.payAp(1)) showSysMsg('請對手將前線 1 張突襲角色最上層放置於場外。'); if (onComplete) onComplete(); } },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false }, { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA20BT/BCV-1-057 ユノ
    scripts['UA20BT/BCV-1-057'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('アスタ')) ? 500 : 0; }
    };

    // UA20BT/BCV-1-059 ドロシー
    scripts['UA20BT/BCV-1-059'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['PURPLE', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA20BT/BCV-1-063 クローバー王国
    scripts['UA20BT/BCV-1-063'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'LOOK_TOP_DECK', count: 1, pickUpTo: 0, remainderTo: 'TOP_OR_BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => { if (engine.getCardDef(c)?.type === 'CHARACTER') engine.addSlotBp(c.parentElement, 500); });
            if (onComplete) onComplete();
        }
    };

    // UA20BT/BCV-1-065 少しは己のことがわかったようだな…
    scripts['UA20BT/BCV-1-065'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false },
                { type: 'SET_ACTIVE', target: 'SELECTED' },
                { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                if (engine.hasCharacterOnMyField('メレオレオナ')) engine.drawCards(1);
                if (onComplete) onComplete();
            });
        }
    };

    // UA20BT/BCV-1-066 闇纏・次元斬り 彼岸
    scripts['UA20BT/BCV-1-066'] = {
        onEventPlay(engine, cardEl, onComplete) {
            let maxMyBp = 0;
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => { maxMyBp = Math.max(maxMyBp, engine.getEffectiveCardBp(c)); });
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: maxMyBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA20BT/BCV-1-067 ライバル
    scripts['UA20BT/BCV-1-067'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasA = engine.hasCharacterOnMyField('アスタ');
            const hasY = engine.hasCharacterOnMyField('ユノ');
            const maxBp = (hasA && hasY) ? 5000 : ((hasA || hasY) ? 4000 : 2000);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA20ST/BCV-1-112 アスタ
    scripts['UA20ST/BCV-1-112'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('ユノ')) ? 500 : 0; }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
