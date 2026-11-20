/**
 * UA DLC 腳本包：鏈鋸人 (Chainsaw Man) - 紅色 (共 40 張)
 * 檔名：dlc-csm-red.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function getFacedownUnder(cardEl) {
        const slot = cardEl?.parentElement;
        if (!slot) return [];
        return Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl && c.classList.contains('is-flipped'));
    }

    // UA53BT/CSM-1-042 岸辺
    scripts['UA53BT/CSM-1-042'] = {
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 2, upTo: true },
                { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA53BT/CSM-1-047 チェンソーマン (突襲)
    scripts['UA53BT/CSM-1-047'] = {
        requireRaided: true,
        onRetire(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '退場時效果：チェンソーマン', desc: '請選擇 1 項效果：', cards: [cardEl],
                customButtons: [
                    { label: '抽 2 張牌', color: '#4f9678', onClick: () => { engine.drawCards(2); if (onComplete) onComplete(); } },
                    {
                        label: '若有裏側墊底卡：將此卡以活動狀態登場至前線', color: '#c1596f',
                        onClick: () => engine.chooseEmptyFieldSlotAndPlace(cardEl, { allowFront: true, allowEnergy: false, enterRest: false }, () => { if (onComplete) onComplete(); })
                    }
                ]
            });
        }
    };

    // UA53BT/CSM-1-054 早川 アキ
    scripts['UA53BT/CSM-1-054'] = {
        onPlay(engine, cardEl, onComplete) {
            if (!engine.hasCharacterOnMyField('姫野')) { if (onComplete) onComplete(); return; }
            engine.drawCards(1);
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            if (handCards.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：早川 アキ', desc: '選擇 1 張手牌裏側墊在此角色底下：',
                cards: handCards, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0 && cardEl.parentElement) {
                        const slot = cardEl.parentElement;
                        slot.insertBefore(sel[0], slot.firstChild);
                        sel[0].classList.add('is-flipped'); sel[0].classList.remove('rest', 'in-life'); sel[0].style.position = 'absolute';
                        recalcStacking(slot); recalcStacking(document.getElementById('my-hand-area')); broadcastMyState();
                    }
                    if (onComplete) onComplete();
                }
            });
        },
        onAttack(engine, cardEl, onComplete) {
            const akisWithUnder = engine.getSlotTopCards('#my-front-line .slot').filter(c => engine.getCardDef(c)?.name.includes('早川 アキ') && getFacedownUnder(c).length > 0);
            if (akisWithUnder.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：早川 アキ', desc: '是否將前線〈早川 アキ〉底下 1 張裏側卡片送場外，本回合 BP+1500？',
                cards: akisWithUnder, selectCount: 1, upTo: true,
                customButtons: [{ label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const u = getFacedownUnder(sel[0]);
                        if (u.length > 0) { engine.moveCardToZone(u[0], document.getElementById('my-outside-area')); engine.addSlotBp(cardEl.parentElement, 1500); }
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA53BT/CSM-1-056 早川 アキ (突襲)
    scripts['UA53BT/CSM-1-056'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            const under = getFacedownUnder(cardEl);
            if (under.length > 0) {
                engine.moveCardToZone(under[0], document.getElementById('my-hand-area'));
            }
            if (engine.hasCharacterOnMyField('姫野') && getFacedownUnder(cardEl).length === 0) {
                const rt = engine.getRuntime(cardEl);
                rt.tempKeywords.SNIPE = 1;
                rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
            }
            if (onComplete) onComplete();
        }
    };

    // UA53BT/CSM-1-059 パワー
    scripts['UA53BT/CSM-1-059'] = {
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                const rt = engine.getRuntime(cardEl);
                rt.usedOncePerTurn = true;
                rt.tempEnergyBoost.push({ color: 'RED', count: 1 });
                if (onComplete) onComplete();
            });
        }
    };

    // UA53BT/CSM-1-061 パワー (突襲)
    scripts['UA53BT/CSM-1-061'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            if (engine.hasCharacterOnMyField('デンジ')) {
                engine.addSlotBp(cardEl.parentElement, 1000);
                showSysMsg('〈パワー〉本回合 BP+1000，對手若可能必須防禦此卡。');
            }
            if (onComplete) onComplete();
        }
    };

    // UA53BT/CSM-1-064 姫野
    scripts['UA53BT/CSM-1-064'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; }
    };

    // UA53BT/CSM-1-065 姫野
    scripts['UA53BT/CSM-1-065'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'ENERGY_LINE', count: 1, upTo: false },
                { type: 'SET_ACTIVE', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA53BT/CSM-1-067 ポチタ
    scripts['UA53BT/CSM-1-067'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.retireCardFromSlot(slot);
            const denjis = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'RED' && (d.requiredEnergy?.count || 0) <= 1 && d.name.includes('デンジ');
            });
            if (denjis.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：ポチタ', desc: '是否從場外將 1 費以下紅色〈デンジ〉活動登場至能源線，並將此卡裏側墊底？',
                cards: denjis, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: false, allowEnergy: true, enterRest: false }, (p) => {
                            if (p) {
                                p.insertBefore(cardEl, p.firstChild);
                                cardEl.classList.add('is-flipped'); cardEl.classList.remove('rest', 'in-life'); cardEl.style.position = 'absolute';
                                recalcStacking(p); broadcastMyState();
                                engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                            } else if (onComplete) onComplete();
                        });
                    } else if (onComplete) onComplete();
                }
            });
        }
    };

    // UA53BT/CSM-1-075 打て！
    scripts['UA53BT/CSM-1-075'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                const akisWithUnder = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('早川 アキ') && getFacedownUnder(c).length > 0);
                if (akisWithUnder.length === 0) { if (onComplete) onComplete(); return; }
                engine.promptModal({
                    title: '打て！追加效果', desc: '是否將〈早川 アキ〉底下 1 張裏側卡送場外，活動 1 AP 並賦予〈早川 アキ〉衝擊 1？',
                    cards: akisWithUnder, selectCount: 1, upTo: true,
                    customButtons: [{ label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            const u = getFacedownUnder(sel[0]);
                            if (u.length > 0) {
                                engine.moveCardToZone(u[0], document.getElementById('my-outside-area'));
                                engine.activateMyApCards(1);
                                engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1);
                            }
                        }
                        if (onComplete) onComplete();
                    }
                });
            });
        }
    };

    // UA53BT/CSM-1-078 最強のパン
    scripts['UA53BT/CSM-1-078'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasHouse = engine.getSlotTopCards('#my-energy-line .slot').some(c => engine.getCardDef(c)?.name.includes('早川家'));
            const denjiHasUnder = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => engine.getCardDef(c)?.name.includes('デンジ') && getFacedownUnder(c).length > 0);
            engine.drawCards((hasHouse || denjiHasUnder) ? 3 : 2);
            if (onComplete) onComplete();
        }
    };

    // UA53BT/CSM-1-080 悪いヤツぁ好きだぜ～？
    scripts['UA53BT/CSM-1-080'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('デンジ') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
