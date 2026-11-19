/**
 * UA DLC 腳本包：Hunter x Hunter 獵人 - 紫色 (一彈 + 二彈，共 49 張)
 * 檔名：dlc-hxh-purple.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // EX01BT/HTR-2-054 ヒソカ
    scripts['EX01BT/HTR-2-054'] = {
        onPlay(engine, cardEl, onComplete) {
            if (document.querySelectorAll('#opp-hand-area .card').length >= 3 && conn && isConnected) {
                conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_DISCARD_HAND', count: 1 });
            }
            if (onComplete) onComplete();
        }
    };

    // EX01BT/HTR-2-059 キルア＝ゾルディック (突襲)
    scripts['EX01BT/HTR-2-059'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; }
    };

    // EX01BT/HTR-2-061 鎮魂歌
    scripts['EX01BT/HTR-2-061'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 2 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                const hasUvo = Array.from(document.querySelectorAll('#my-outside-area .card')).some(c => engine.getCardDef(c)?.name.includes('ウボォーギン'));
                if (hasUvo) {
                    engine.getSlotTopCards('#opp-front-line .slot').forEach(c => engine.addSlotBp(c.parentElement, -1000));
                }
                if (onComplete) onComplete();
            });
        }
    };

    // UA03BT/HTR-1-037 クロロ (突襲：複製場上其他幻影旅団角色的登場時效果)
    scripts['UA03BT/HTR-1-037'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && d.traits?.includes('幻影旅団') && !d.name.includes('クロロ');
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：クロロ', desc: '選擇最多 1 張〈クロロ〉以外的［特徴：幻影旅団］，發動其 [登場時] 效果：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                    else if (onComplete) onComplete();
                }
            });
        }
    };

    // UA03BT/HTR-1-039 シャルナーク
    scripts['UA03BT/HTR-1-039'] = {
        onPlay(engine, cardEl, onComplete) {
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.traits?.includes('幻影旅団') && !d.name.includes('シャルナーク') && (d.requiredEnergy?.count || 0) <= 3 && (d.apCost ?? 1) === 1;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：シャルナーク', desc: '從場外選擇最多 1 張 3 費以下 AP1 的［特徴：幻影旅団］休息登場：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (p) => { if (p) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete); else if (onComplete) onComplete(); });
                    else if (onComplete) onComplete();
                }
            });
        }
    };

    // UA03BT/HTR-1-045 フェイタン
    scripts['UA03BT/HTR-1-045'] = {
        onPlay(engine, cardEl, onComplete) {
            const delta = document.querySelectorAll('#my-life-area .card').length <= 4 ? -3000 : -2000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'MODIFY_BP', amount: delta, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA03BT/HTR-1-054 ゴトー
    scripts['UA03BT/HTR-1-054'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['BLUE', 'GREEN'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA03BT/HTR-1-056 シルバ
    scripts['UA03BT/HTR-1-056'] = {
        canActivateMain() { return document.querySelectorAll('#my-hand-area .card').length >= 2; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 2 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.getRuntime(cardEl).tempKeywords.SNIPE = 1;
                if (onComplete) onComplete();
            });
        }
    };

    // UA03BT/HTR-1-057 ゼノ
    scripts['UA03BT/HTR-1-057'] = {
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 4000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.moveCardToZone(cardEl, document.getElementById('my-remove-area'));
                if (onComplete) onComplete();
            });
        }
    };

    // UA03BT/HTR-1-061 試しの門
    scripts['UA03BT/HTR-1-061'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest')
                && engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => !c.classList.contains('rest') && engine.getCardDef(c)?.type === 'CHARACTER');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const activeChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => !c.classList.contains('rest') && engine.getCardDef(c)?.type === 'CHARACTER');
            engine.promptModal({
                title: '起動メイン：試しの門', desc: '選擇 1 張活動角色轉為休息（BP 3000 以上純抽 1，否則抽 1 棄 1）：',
                cards: activeChars, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    cardEl.classList.add('rest');
                    sel[0].classList.add('rest');
                    if (engine.getEffectiveCardBp(sel[0]) >= 3000) { engine.drawCards(1); if (onComplete) onComplete(); }
                    else engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                }
            });
        }
    };

    // UA03BT/HTR-1-065 盗賊の極意
    scripts['UA03BT/HTR-1-065'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: -3000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                if (!engine.hasCharacterOnMyField('クロロ')) { if (onComplete) onComplete(); return; }
                const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                    const d = engine.getCardDef(c);
                    return d && d.traits?.includes('幻影旅団') && !d.name.includes('クロロ') && (d.requiredEnergy?.count || 0) <= 3;
                });
                if (cands.length === 0) { if (onComplete) onComplete(); return; }
                engine.promptModal({
                    title: '盗賊の極意', desc: '選擇最多 1 張 3 費以下［特徴：幻影旅団］發動其 [登場時] 效果：',
                    cards: cands, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length > 0) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete); else if (onComplete) onComplete(); }
                });
            });
        }
    };

    // UA03BT/HTR-1-066 龍頭戯画
    scripts['UA03BT/HTR-1-066'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const zoldyckCnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('ゾルディック家')).length;
            const maxBp = zoldyckCnt >= 3 ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
