/**
 * UA DLC 腳本包：命運石之門 (STEINS;GATE) - 綠色 (共 40 張)
 * 檔名：dlc-stg-green.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function hasMyFrontEmpty() {
        return Array.from(document.querySelectorAll('#my-front-line .slot')).some(s => s.querySelectorAll('.card').length === 0);
    }

    // 01. UA57BT/STG-1-041 秋葉 留未穂
    scripts['UA57BT/STG-1-041'] = {
        onPlay(engine, cardEl, onComplete) {
            const myFields = engine.getSlotTopCards('#my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'FIELD');
            if (myFields.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：秋葉 留未穂', desc: '是否退場我方 1 張場域，從場外登場 1 張不同卡名的綠色場域至能源線？',
                cards: myFields, selectCount: 1, upTo: true,
                customButtons: [{ label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    const oldName = engine.getCardDef(sel[0])?.name || '';
                    engine.retireCardFromSlot(sel[0].parentElement);
                    const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                        const d = engine.getCardDef(c);
                        return d && d.type === 'FIELD' && d.color === 'GREEN' && d.name !== oldName;
                    });
                    if (cands.length === 0) { if (onComplete) onComplete(); return; }
                    engine.promptModal({
                        title: '選擇場外綠色場域卡', desc: '選擇最多 1 張以休息狀態登場至能源線：',
                        cards: cands, selectCount: 1, upTo: true,
                        onConfirm: (s2) => {
                            if (s2.length > 0) {
                                engine.chooseEmptyFieldSlotAndPlace(s2[0], { allowFront: false, allowEnergy: true, enterRest: true }, (p) => {
                                    if (p) engine.triggerCardAbilities(s2[0], 'ON_PLAY', onComplete);
                                    else if (onComplete) onComplete();
                                });
                            } else if (onComplete) onComplete();
                        }
                    });
                }
            });
        }
    };

    // 03. UA57BT/STG-1-043 阿万音 鈴羽
    scripts['UA57BT/STG-1-043'] = {
        onAttack(engine, cardEl, onComplete) {
            if (!engine.usedEventThisTurn) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：阿万音 鈴羽', desc: '本回合已使用過事件卡，是否抽 1 張並捨棄 1 張手牌？',
                cards: [cardEl],
                customButtons: [
                    { label: '抽 1 棄 1', color: '#4f9678', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 04. UA57BT/STG-1-044 阿万音 鈴羽
    scripts['UA57BT/STG-1-044'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        }
    };

    // 06. UA57BT/STG-1-046 阿万音 鈴羽
    scripts['UA57BT/STG-1-046'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            cardEl.classList.remove('rest');
            if (onComplete) onComplete();
        }
    };

    // 08. UA57BT/STG-1-048 漆原 るか
    scripts['UA57BT/STG-1-048'] = {
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn && engine.usedEventThisTurn;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            rt.usedOncePerTurn = true;
            engine.addSlotBp(slot, 1000);
            rt.persistentBp = (rt.persistentBp || 0) + 1000;
            if (onComplete) onComplete();
        }
    };

    // 09. UA57BT/STG-1-049 漆原 るか
    scripts['UA57BT/STG-1-049'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        },
        onPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(4, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `登場時效果：漆原 るか（檢視牌頂 ${cnt} 張）`,
                desc: '選擇最多 1 張場域卡或〈Dメール〉加入手牌（加入後棄 1）：',
                cards: topCards,
                cardFilterFn: (c) => { const d = engine.getCardDef(c); return !!(d && (d.type === 'FIELD' || d.name.includes('Dメール'))); },
                selectCount: 1, upTo: true,
                onConfirm: (picked) => {
                    picked.forEach(c => engine.moveCardToZone(c, document.getElementById('my-hand-area')));
                    const rest = topCards.filter(c => !picked.includes(c));
                    engine.promptOrderCardsToDeck(rest, 'BOTTOM', () => {
                        if (picked.length > 0) engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                        else if (onComplete) onComplete();
                    });
                }
            });
        }
    };

    // 10. UA57BT/STG-1-050 漆原 るか
    scripts['UA57BT/STG-1-050'] = {
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                if (c === cardEl) return false;
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && (d.apCost ?? 1) === 1 && !d.compiledRules?.raidCondition;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            const buttons = [];
            if (!engine.usedNamedAbilityThisTurn.has('るか_無法阻擋')) {
                buttons.push({
                    label: '不被 BP 4000 以上角色防禦', color: '#6c93c7',
                    onClick: () => engine.promptModal({
                        title: '選擇強化目標', desc: '選擇 1 張非突襲 AP1 其他角色：', cards: cands, selectCount: 1, upTo: false,
                        onConfirm: (sel) => {
                            if (sel.length > 0) { engine.getRuntime(cardEl).usedOncePerTurn = true; engine.usedNamedAbilityThisTurn.add('るか_無法阻擋'); showSysMsg(`〈${engine.getCardDef(sel[0])?.name}〉本回合不會被 BP 4000 以上防禦。`); }
                            if (onComplete) onComplete();
                        }
                    })
                });
            }
            if (!engine.usedNamedAbilityThisTurn.has('るか_加BP衝擊')) {
                buttons.push({
                    label: 'BP+1000（本回合用過事件再獲衝擊 1）', color: '#e67e22',
                    onClick: () => engine.promptModal({
                        title: '選擇強化目標', desc: '選擇 1 張非突襲 AP1 其他角色：', cards: cands, selectCount: 1, upTo: false,
                        onConfirm: (sel) => {
                            if (sel.length > 0) {
                                engine.getRuntime(cardEl).usedOncePerTurn = true;
                                engine.usedNamedAbilityThisTurn.add('るか_加BP衝擊');
                                engine.addSlotBp(sel[0].parentElement, 1000);
                                if (engine.usedEventThisTurn) engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1);
                            }
                            if (onComplete) onComplete();
                        }
                    })
                });
            }
            if (buttons.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({ title: '起動メイン：漆原 るか', desc: '選擇 1 項本回合尚未選過的效果：', cards: [], customButtons: buttons });
        }
    };

    // 14. UA57BT/STG-1-054 桐生 萌郁
    scripts['UA57BT/STG-1-054'] = {
        onPlay(engine, cardEl, onComplete) {
            const ibns = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name.includes('IBN5100'));
            if (ibns.length === 0 || document.querySelectorAll('#my-hand-area .card').length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：桐生 萌郁', desc: '是否捨棄 1 張手牌，從場外回收 1 張〈IBN5100〉？', cards: [cardEl],
                customButtons: [
                    { label: '捨棄 1 手牌並回收', color: '#4f9678', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => { engine.moveCardToZone(ibns[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }) },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 19. UA57BT/STG-1-059 椎名 まゆり
    scripts['UA57BT/STG-1-059'] = {
        onPlay(engine, cardEl, onComplete) {
            const allowed = ['阿万音 鈴羽', '岡部 倫太郎', '椎名 まゆり', '橋田 至', '牧瀬 紅莉栖'];
            const cands = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'GREEN' && (d.requiredEnergy?.count || 0) <= 2 && (d.apCost ?? 1) === 1 && allowed.some(n => d.name.includes(n));
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：椎名 まゆり', desc: '從手牌選擇最多 1 張 2 費以下 AP1 指定綠色角色休息登場：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (p) => { if (p) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete); else if (onComplete) onComplete(); });
                    else if (onComplete) onComplete();
                }
            });
        }
    };

    // 20. UA57BT/STG-1-060 椎名 まゆり (突襲：攻擊時選1張BP+1000，若在能源線且前線有空位則移至前線；退場時能源線1張BP+2000並移至前線)
    scripts['UA57BT/STG-1-060'] = {
        requireRaided: true,
        onAttack(engine, cardEl, onComplete) {
            const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
            if (myChars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：椎名 まゆり', desc: '選擇最多 1 張我方角色 BP+1000（若在能源線且前線有空位則移至前線）：',
                cards: myChars, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const target = sel[0];
                        engine.addSlotBp(target.parentElement, 1000);
                        if (target.parentElement.closest('#my-energy-line')) {
                            const emptyFl = Array.from(document.querySelectorAll('#my-front-line .slot')).find(s => s.querySelectorAll('.card').length === 0);
                            if (emptyFl) {
                                Array.from(target.parentElement.querySelectorAll('.card')).forEach(x => emptyFl.appendChild(x));
                                recalcStacking(emptyFl);
                                broadcastMyState();
                            }
                        }
                    }
                    if (onComplete) onComplete();
                }
            });
        },
        onRetire(engine, cardEl, onComplete) {
            const enChars = engine.getSlotTopCards('#my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
            const emptyFl = Array.from(document.querySelectorAll('#my-front-line .slot')).find(s => s.querySelectorAll('.card').length === 0);
            if (enChars.length === 0 || !emptyFl) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '退場時效果：椎名 まゆり', desc: '選擇能源線最多 1 張角色 BP+2000 並移至前線：',
                cards: enChars, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const t = sel[0];
                        Array.from(t.parentElement.querySelectorAll('.card')).forEach(x => emptyFl.appendChild(x));
                        recalcStacking(emptyFl);
                        engine.addSlotBp(emptyFl, 2000);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 26. UA57BT/STG-1-066 フェイリス (突襲：登場抽最多1且我方1張BP+1000；攻擊時用過事件且有場域再發動一次登場時)
    scripts['UA57BT/STG-1-066'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true },
                { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        onAttack(engine, cardEl, onComplete) {
            const hasField = engine.getSlotTopCards('#my-energy-line .slot').some(c => engine.getCardDef(c)?.type === 'FIELD');
            if (engine.usedEventThisTurn && hasField) {
                scripts['UA57BT/STG-1-066'].onPlay(engine, cardEl, onComplete);
            } else if (onComplete) onComplete();
        }
    };

    // 29. UA57BT/STG-1-069 牧瀬 紅莉栖
    scripts['UA57BT/STG-1-069'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '登場時效果：牧瀬 紅莉栖', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    { label: '抽 1 張並捨棄 1 張手牌', color: '#4f9678', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    { label: '其他我方角色 1 張 BP+1000', color: '#e67e22', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: true }, { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) }
                ]
            });
        }
    };

    // 30. UA57BT/STG-1-070 牧瀬 紅莉栖 (突襲：登場賦予抗性；攻擊時二選一：衝擊1 / 前線有空位時抽2棄1)
    scripts['UA57BT/STG-1-070'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            showSysMsg('〈牧瀬 紅莉栖〉可指定其他 1 張我方角色至下次我方回合開始前不被對手效果選擇。');
            if (onComplete) onComplete();
        },
        onAttack(engine, cardEl, onComplete) {
            const buttons = [
                { label: '此角色本回合獲得 [インパクト(1)]', color: '#c1596f', onClick: () => { engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1); if (onComplete) onComplete(); } }
            ];
            if (hasMyFrontEmpty()) {
                buttons.push({
                    label: '抽 2 張並捨棄 1 張手牌（前線有空位）', color: '#4f9678',
                    onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 2 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete)
                });
            }
            engine.promptModal({ title: 'アタック時效果：牧瀬 紅莉栖', desc: '請選擇 1 項效果：', cards: [], customButtons: buttons });
        }
    };

    // 32. UA57BT/STG-1-072 電話レンジ（仮）
    scripts['UA57BT/STG-1-072'] = {
        onPlay(engine, cardEl, onComplete) {
            const dmails = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name.includes('Dメール'));
            if (dmails.length > 0) engine.moveCardToZone(dmails[0], document.getElementById('my-hand-area'));
            if (engine.isFirstPlayer === null || engine.isMyTurn) {
                engine.executeAbilityActions(cardEl, [
                    { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true },
                    { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
                ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            } else if (onComplete) onComplete();
        }
    };

    // 34. UA57BT/STG-1-074 俺は狂気のマッドサイエンティスト！鳳凰院凶真だっ！
    scripts['UA57BT/STG-1-074'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
                if (engine.getCardDef(c)?.type === 'CHARACTER') engine.addSlotBp(c.parentElement, 1000);
            });
            const ap1Chars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && (d.apCost ?? 1) === 1;
            });
            const finish = () => { if (engine.hasCharacterOnMyField('岡部 倫太郎')) engine.drawCards(1); if (onComplete) onComplete(); };
            if (ap1Chars.length === 0) { finish(); return; }
            engine.promptModal({
                title: '鳳凰院凶真だっ！', desc: '選擇最多 1 張消費 AP 1 的角色賦予 [インパクト(1)]：',
                cards: ap1Chars, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1); finish(); }
            });
        }
    };

    // 36. UA57BT/STG-1-076 ツンデレじゃないっ！
    scripts['UA57BT/STG-1-076'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('牧瀬 紅莉栖') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 37. UA57BT/STG-1-077 Dメール
    scripts['UA57BT/STG-1-077'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const activeFields = engine.getSlotTopCards('#my-energy-line .slot').filter(c => !c.classList.contains('rest') && engine.getCardDef(c)?.type === 'FIELD');
            if (activeFields.length === 0) { showSysMsg('場上沒有活動狀態的場域卡。'); if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'Dメール', desc: '選擇 1 張活動的場域轉為休息：', cards: activeFields, selectCount: 1, upTo: false,
                onConfirm: (fSel) => {
                    if (fSel.length === 0) { if (onComplete) onComplete(); return; }
                    fSel[0].classList.add('rest');
                    engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                        const cands = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => {
                            const d = engine.getCardDef(c);
                            return d && d.type === 'CHARACTER' && d.color === 'GREEN' && (d.requiredEnergy?.count || 0) <= 4 && (d.apCost ?? 1) === 1 && !d.compiledRules?.raidCondition;
                        });
                        if (cands.length === 0) { if (onComplete) onComplete(); return; }
                        engine.promptModal({
                            title: 'Dメール：手牌活動登場', desc: '選擇最多 1 張 4 費以下 AP1 非突襲綠色角色活動登場：',
                            cards: cands, selectCount: 1, upTo: true,
                            onConfirm: (sel) => {
                                if (sel.length > 0) engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: false }, (p) => { if (p) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete); else if (onComplete) onComplete(); });
                                else if (onComplete) onComplete();
                            }
                        });
                    });
                }
            });
        }
    };

    // 40. UA57BT/STG-1-080 目を見て混ぜ混ぜ
    scripts['UA57BT/STG-1-080'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(5, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `目を見て混ぜ混ぜ（檢視牌頂 ${cnt} 張）`,
                desc: '選擇最多 1 張公開並加入手牌（若為〈フェイリス・ニャンニャン〉或場域卡再活動 1 AP）：',
                cards: topCards, selectCount: 1, upTo: true,
                onConfirm: (picked) => {
                    picked.forEach(c => {
                        engine.moveCardToZone(c, document.getElementById('my-hand-area'));
                        const d = engine.getCardDef(c);
                        if (d && (d.type === 'FIELD' || d.name.includes('フェイリス'))) engine.activateMyApCards(1);
                    });
                    const rest = topCards.filter(c => !picked.includes(c));
                    engine.promptOrderCardsToDeck(rest, 'BOTTOM', onComplete);
                }
            });
        }
    };

    if (typeof window.registerCardScripts === 'function') {
        window.registerCardScripts(scripts);
    } else {
        window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
    }
})();
