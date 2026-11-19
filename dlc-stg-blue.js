/**
 * UA DLC 腳本包：命運石之門 (STEINS;GATE) - 藍色 (共 43 張)
 * 檔名：dlc-stg-blue.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // 輔助：計算我方場外「必要能源 3 以下的藍色事件卡」之不同 [トリガー] 種類數
    function countDistinctBlueLowEventTriggers(engine, excludeCardEl = null) {
        const types = new Set();
        document.querySelectorAll('#my-outside-area .card').forEach(c => {
            if (c === excludeCardEl) return;
            const d = engine.getCardDef(c);
            if (!d || d.type !== 'EVENT' || d.color !== 'BLUE' || (d.requiredEnergy?.count || 0) > 3) return;
            const tType = d.compiledRules?.trigger?.type || '';
            const tTxt = d.triggerText || '';
            if (tType) types.add(tType);
            else if (tTxt.includes('[ゲット]')) types.add('GET');
            else if (tTxt.includes('[ドロー]')) types.add('DRAW');
            else if (tTxt.includes('[アクティブ]')) types.add('ACTIVE');
            else if (tTxt.includes('[カラー]')) types.add('COLOR');
            else if (tTxt.includes('[スペシャル]')) types.add('SPECIAL');
            else if (tTxt.includes('[ファイナル]')) types.add('FINAL');
        });
        return types.size;
    }

    // 輔助：計算我方場外藍色〈椎名 まゆり〉張數
    function countBlueMayuriInOutside(engine) {
        return Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
            const d = engine.getCardDef(c);
            return d && d.color === 'BLUE' && d.name && d.name.includes('椎名 まゆり');
        }).length;
    }

    // 03. UA57BT/STG-1-003 阿万音 鈴羽
    scripts['UA57BT/STG-1-003'] = {
        onPlay(engine, cardEl, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            const evCands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'EVENT' && (d.requiredEnergy?.count || 0) <= 3 && !(d.triggerText || '').includes('[ファイナル]') && d.compiledRules?.trigger?.type !== 'FINAL';
            });
            if (handCards.length === 0 || evCands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：阿万音 鈴羽',
                desc: '是否捨棄 1 張手牌，從場外回收 1 張必要能源 3 以下且非 [ファイナル] 的事件卡？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '捨棄 1 手牌並回收事件卡', color: '#4f9678',
                        onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                            engine.promptModal({
                                title: '選擇場外事件卡', desc: '選擇最多 1 張加入手牌：',
                                cards: evCands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }
                            });
                        })
                    },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        },
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn
                && engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => c !== cardEl && c.classList.contains('rest'));
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rested = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => c !== cardEl && c.classList.contains('rest'));
            if (rested.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：阿万音 鈴羽', desc: '選擇 1 張本回合因效果轉為休息的其他角色轉為活動：',
                cards: rested, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) { engine.getRuntime(cardEl).usedOncePerTurn = true; sel[0].classList.remove('rest'); }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 04. UA57BT/STG-1-004 阿万音 鈴羽
    scripts['UA57BT/STG-1-004'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedEventThisTurn) ? 1000 : 0;
        },
        onPlay(engine, cardEl, onComplete) {
            if (countDistinctBlueLowEventTriggers(engine) >= 4) {
                engine.drawCards(1);
                if (onComplete) onComplete();
            } else {
                engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            }
        }
    };

    // 08. UA57BT/STG-1-008 岡部 倫太郎
    scripts['UA57BT/STG-1-008'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        }
    };

    // 10. UA57BT/STG-1-010 岡部 倫太郎
    scripts['UA57BT/STG-1-010'] = {
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn
                && engine.getSlotTopCards('#my-front-line .slot').some(c => !c.classList.contains('rest') && engine.getCardDef(c)?.name.includes('牧瀬 紅莉栖'));
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const kurisuFl = engine.getSlotTopCards('#my-front-line .slot').filter(c => !c.classList.contains('rest') && engine.getCardDef(c)?.name.includes('牧瀬 紅莉栖'));
            if (kurisuFl.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：岡部 倫太郎', desc: '選擇前線 1 張活動的〈牧瀬 紅莉栖〉轉為休息：',
                cards: kurisuFl, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    engine.getRuntime(cardEl).usedOncePerTurn = true;
                    sel[0].classList.add('rest');
                    broadcastMyState();
                    engine.promptModal({
                        title: '效果二選一：岡部 倫太郎', desc: '請選擇 1 項效果：', cards: [],
                        customButtons: [
                            {
                                label: '此角色本回合獲得 [インパクト(1)]', color: '#c1596f',
                                onClick: () => { engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1); if (onComplete) onComplete(); }
                            },
                            {
                                label: '對手前線 BP 1500 以上 1 張 BP-1000', color: '#e67e22',
                                onClick: () => {
                                    const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 1500);
                                    if (opp.length === 0) { if (onComplete) onComplete(); return; }
                                    engine.promptModal({
                                        title: '選擇對手前線角色 BP-1000', desc: '選擇最多 1 張 BP 1500 以上的角色：',
                                        cards: opp, selectCount: 1, upTo: true,
                                        onConfirm: (s) => { if (s.length > 0) engine.addSlotBp(s[0].parentElement, -1000); if (onComplete) onComplete(); }
                                    });
                                }
                            }
                        ]
                    });
                }
            });
        }
    };

    // 11. UA57BT/STG-1-011 岡部 倫太郎 (突襲：登場場外2費以下[移除區登場改4費以下]AP1藍まゆり休息登場或突襲)
    scripts['UA57BT/STG-1-011'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const maxEn = engine.getRuntime(cardEl)?.enteredFromRemove ? 4 : 2;
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'BLUE' && d.name.includes('椎名 まゆり') && (d.requiredEnergy?.count || 0) <= maxEn && (d.apCost ?? 1) === 1;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: `登場時效果：岡部 倫太郎（必要能源 ${maxEn} 以下）`,
                desc: '選擇場外最多 1 張藍色〈椎名 まゆり〉以休息狀態登場（若為突襲卡可手動突襲）：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.getRuntime(sel[0]).enteredByCharEffect = true;
                        engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                            if (placed) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                            else if (onComplete) onComplete();
                        });
                    } else if (onComplete) onComplete();
                }
            });
        }
    };

    // 13. UA57BT/STG-1-013 桐生 萌郁
    scripts['UA57BT/STG-1-013'] = {
        onPlay(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => c !== cardEl && engine.getCardDef(c)?.type === 'CHARACTER');
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：桐生 萌郁', desc: '是否退場 1 張其他我方角色並抽 2 張牌？',
                cards: cands, selectCount: 1, upTo: true,
                customButtons: [{ label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length > 0) { engine.retireCardFromSlot(sel[0].parentElement); engine.drawCards(2); }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 16. UA57BT/STG-1-016 椎名 まゆり
    scripts['UA57BT/STG-1-016'] = {
        onPlay(engine, cardEl, onComplete) {
            const cnt = engine.getRuntime(cardEl)?.enteredByCharEffect ? 3 : 2;
            engine.executeAbilityActions(cardEl, [
                { type: 'LOOK_AND_ARRANGE_TOP', count: cnt, keepUpTo: cnt, upTo: true, remainderTo: 'OUTSIDE' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 17. UA57BT/STG-1-017 椎名 まゆり (突襲：登場抽1並指定對手前線1張至下回合開始無法攻擊[角色效果登場改無法攻防]；攻擊時我方1角色BP+2000)
    scripts['UA57BT/STG-1-017'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            const oppFl = engine.getSlotTopCards('#opp-front-line .slot');
            if (oppFl.length === 0) { if (onComplete) onComplete(); return; }
            const byChar = !!engine.getRuntime(cardEl)?.enteredByCharEffect;
            engine.promptModal({
                title: '登場時效果：椎名 まゆり',
                desc: `選擇對手前線最多 1 張角色，至下次我方回合開始前無法${byChar ? '攻擊與防禦' : '攻擊'}：`,
                cards: oppFl, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) sendSystemChat(`[效果] 〈椎名 まゆり〉指定對手〈${engine.getCardDef(sel[0])?.name}〉至下次我方回合開始前無法${byChar ? '攻擊與防禦' : '攻擊'}。`);
                    if (onComplete) onComplete();
                }
            });
        },
        onAttack(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true },
                { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 18. UA57BT/STG-1-018 椎名 まゆり (起動[同名ターン1]活動自己)
    scripts['UA57BT/STG-1-018'] = {
        canActivateMain(engine, cardEl) {
            return cardEl.classList.contains('rest') && !engine.usedNamedAbilityThisTurn.has('椎名まゆり_活動');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.usedNamedAbilityThisTurn.add('椎名まゆり_活動');
            cardEl.classList.remove('rest');
            if (onComplete) onComplete();
        }
    };

    // 20. UA57BT/STG-1-020 橋田 至
    scripts['UA57BT/STG-1-020'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedEventThisTurn) ? 1500 : 0;
        }
    };

    // 21. UA57BT/STG-1-021 橋田 至
    scripts['UA57BT/STG-1-021'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '登場時效果：橋田 至', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    { label: '抽 1 張並捨棄 1 張手牌', color: '#4f9678', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    {
                        label: '我方〈阿万音 鈴羽〉或〈橋田 至〉1 張 BP+2000', color: '#e67e22',
                        onClick: () => {
                            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                                const n = engine.getCardDef(c)?.name || '';
                                return n.includes('阿万音 鈴羽') || n.includes('橋田 至');
                            });
                            if (cands.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '選擇 BP+2000 目標', desc: '選擇最多 1 張：', cards: cands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, 2000); if (onComplete) onComplete(); }
                            });
                        }
                    }
                ]
            });
        }
    };

    // 22. UA57BT/STG-1-022 フェイリス
    scripts['UA57BT/STG-1-022'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; }
    };

    // 25. UA57BT/STG-1-025 牧瀬 紅莉栖
    scripts['UA57BT/STG-1-025'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        },
        onRaided(engine) {
            if (countDistinctBlueLowEventTriggers(engine) >= 3) {
                engine.drawCards(1);
                showSysMsg('〈牧瀬 紅莉栖〉被突襲時發動效果：抽 1 張牌。');
            }
        }
    };

    // 26. UA57BT/STG-1-026 牧瀬 紅莉栖
    scripts['UA57BT/STG-1-026'] = {
        onPlay(engine, cardEl, onComplete) {
            const lookN = countDistinctBlueLowEventTriggers(engine) >= 3 ? 5 : 3;
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(lookN, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `登場時效果：牧瀬 紅莉栖（檢視牌頂 ${cnt} 張）`,
                desc: '選擇最多 1 張必要能源 3 以下且非 [ファイナル] 的事件卡加入手牌（加入後棄 1）：',
                cards: topCards,
                cardFilterFn: (c) => {
                    const d = engine.getCardDef(c);
                    return !!(d && d.type === 'EVENT' && (d.requiredEnergy?.count || 0) <= 3 && !(d.triggerText || '').includes('[ファイナル]') && d.compiledRules?.trigger?.type !== 'FINAL');
                },
                selectCount: 1, upTo: true,
                onConfirm: (picked) => {
                    picked.forEach(c => engine.moveCardToZone(c, document.getElementById('my-hand-area')));
                    topCards.filter(c => !picked.includes(c)).forEach(c => { deckArea.insertBefore(c, deckArea.firstChild); c.classList.add('is-flipped'); });
                    recalcStacking(deckArea); broadcastMyState();
                    if (picked.length > 0) engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                    else if (onComplete) onComplete();
                }
            });
        }
    };

    // 28. UA57BT/STG-1-028 牧瀬 紅莉栖 (突襲：前線起動下次3費以下非F事件AP-1 [同名ターン1] / 休息時起動其他1張BP+2000)
    scripts['UA57BT/STG-1-028'] = {
        requireRaided: true,
        canActivateMain(engine, cardEl, slot) {
            if (!slot.closest('#my-front-line')) return false;
            const canDisc = !engine.usedNamedAbilityThisTurn.has('紅莉栖_事件AP減免');
            const canBuff = cardEl.classList.contains('rest') && !engine.getRuntime(cardEl).usedOncePerTurn;
            return canDisc || canBuff;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const buttons = [];
            if (!engine.usedNamedAbilityThisTurn.has('紅莉栖_事件AP減免')) {
                buttons.push({
                    label: '下次 3 費以下非 [ファイナル] 事件卡消費 AP -1', color: '#4f9678',
                    onClick: () => {
                        engine.usedNamedAbilityThisTurn.add('紅莉栖_事件AP減免');
                        engine.pendingApDiscounts.push({
                            amount: 1, desc: '3費以下非F事件 AP-1',
                            matchFn: (d) => d.type === 'EVENT' && (d.requiredEnergy?.count || 0) <= 3 && !(d.triggerText || '').includes('[ファイナル]') && d.compiledRules?.trigger?.type !== 'FINAL'
                        });
                        showSysMsg('本回合下次使用的 3 費以下非 [ファイナル] 事件卡消費 AP -1。');
                        if (onComplete) onComplete();
                    }
                });
            }
            if (cardEl.classList.contains('rest') && !engine.getRuntime(cardEl).usedOncePerTurn) {
                buttons.push({
                    label: '其他我方角色 1 張 BP+2000', color: '#e67e22',
                    onClick: () => {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        engine.executeAbilityActions(cardEl, [
                            { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: false },
                            { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
                        ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                    }
                });
            }
            engine.promptModal({ title: '起動メイン：牧瀬 紅莉栖', desc: '請選擇要發動的效果：', cards: [], customButtons: buttons });
        }
    };

    // 29. UA57BT/STG-1-029 牧瀬 紅莉栖 (突襲：登場依場外3費以下藍事件Trigger種類數×1000退場對手前線1張；>=5種獲得衝擊1)
    scripts['UA57BT/STG-1-029'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const trigTypes = countDistinctBlueLowEventTriggers(engine);
            if (trigTypes >= 5) {
                const rt = engine.getRuntime(cardEl);
                rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                showSysMsg('〈牧瀬 紅莉栖〉本回合獲得 [インパクト(1)]。');
            }
            const maxBp = trigTypes * 1000;
            if (maxBp <= 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UAPR/STG-1-029'] = scripts['UA57BT/STG-1-029'];

    // 33. UA57BT/STG-1-033 オペレーション・スクルド
    scripts['UA57BT/STG-1-033'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'LOOK_AND_ARRANGE_TOP', count: 1, keepUpTo: 1, upTo: true, remainderTo: 'OUTSIDE' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                const maxEn = countDistinctBlueLowEventTriggers(engine) >= 5 ? 4 : 3;
                const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                    const d = engine.getCardDef(c);
                    return d && d.type === 'CHARACTER' && d.color === 'BLUE' && (d.requiredEnergy?.count || 0) <= maxEn && (d.apCost ?? 1) === 1;
                });
                const stepStand = () => {
                    engine.executeAbilityActions(cardEl, [
                        { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true },
                        { type: 'SET_ACTIVE', target: 'SELECTED' }
                    ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                };
                if (cands.length === 0) { stepStand(); return; }
                engine.promptModal({
                    title: `オペレーション・スクルド（必要能源 ${maxEn} 以下）`,
                    desc: '選擇場外最多 1 張 AP1 藍色角色休息登場：',
                    cards: cands, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (p) => {
                                if (p) engine.triggerCardAbilities(sel[0], 'ON_PLAY', stepStand);
                                else stepStand();
                            });
                        } else stepStand();
                    }
                });
            });
        }
    };

    // 35. UA57BT/STG-1-035 最初のお前を騙せ 世界を騙せ
    scripts['UA57BT/STG-1-035'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const kurisuFl = engine.getSlotTopCards('#my-front-line .slot').filter(c => !c.classList.contains('rest') && engine.getCardDef(c)?.name.includes('牧瀬 紅莉栖'));
            if (kurisuFl.length === 0) { showSysMsg('前線沒有活動狀態的〈牧瀬 紅莉栖〉。'); if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '最初のお前を騙せ 世界を騙せ', desc: '選擇前線 1 張活動的〈牧瀬 紅莉栖〉轉為休息並抽 3 張牌：',
                cards: kurisuFl, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) { sel[0].classList.add('rest'); engine.drawCards(3); }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 37. UA57BT/STG-1-037 ダイバージェンス1％の壁を越えて
    scripts['UA57BT/STG-1-037'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                if (countBlueMayuriInOutside(engine) < 7) { if (onComplete) onComplete(); return; }
                const okabes = [
                    ...engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot'),
                    ...Array.from(document.querySelectorAll('#my-outside-area .card'))
                ].filter(c => engine.getCardDef(c)?.name.includes('岡部 倫太郎'));
                if (okabes.length === 0) { if (onComplete) onComplete(); return; }
                engine.promptModal({
                    title: '追加效果：移至移除區', desc: '場外有 7 張以上藍色〈椎名 まゆり〉，可選擇最多 1 張〈岡部 倫太郎〉移至移除區：',
                    cards: okabes, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-remove-area'));
                        if (onComplete) onComplete();
                    }
                });
            });
        }
    };

    // 39. UA57BT/STG-1-039 まゆしぃのビンタ
    scripts['UA57BT/STG-1-039'] = {
        onEventPlay(engine, cardEl, onComplete) {
            if (countDistinctBlueLowEventTriggers(engine, cardEl) >= 3) engine.activateMyApCards(1);
            engine.promptModal({
                title: 'まゆしぃのビンタ', desc: '請選擇最多 2 項效果（此處提供最常用的單項快捷，其餘可手動補足）：', cards: [],
                customButtons: [
                    { label: '我方 1 角色轉活動 + 我方 1 角色 BP+2000', color: '#4f9678', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false }, { type: 'SET_ACTIVE', target: 'SELECTED' }, { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false }, { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    { label: '我方 1 角色 BP+2000 + 對手前線 1 角色橫置', color: '#e67e22', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false }, { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }, { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false }, { type: 'SET_REST', target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    { label: '我方 1 角色轉活動 + 對手前線 1 角色橫置', color: '#6c93c7', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false }, { type: 'SET_ACTIVE', target: 'SELECTED' }, { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false }, { type: 'SET_REST', target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) }
                ]
            });
        }
    };

    // 40. UA57BT/STG-1-040 無論だ。フゥーハハハ！
    scripts['UA57BT/STG-1-040'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const drawExtra = countDistinctBlueLowEventTriggers(engine, cardEl) >= 3;
            const kurisus = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('牧瀬 紅莉栖'));
            const finish = () => { if (drawExtra) engine.drawCards(1); if (onComplete) onComplete(); };
            if (kurisus.length === 0) { finish(); return; }
            engine.promptModal({
                title: '無論だ。フゥーハハハ！', desc: '選擇 1 張我方〈牧瀬 紅莉栖〉本回合 BP+1500 且不被 BP 4000 以上防禦：',
                cards: kurisus, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, 1500);
                    finish();
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
