/**
 * UA DLC 腳本包：Re:從零開始的異世界生活 - 綠色 (二彈 EX17BT/REZ-2，共 43 張)
 * 檔名：dlc-rez-green.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // 輔助：計算我方場上「不同卡名的綠色角色」種類數
    function countDistinctGreenCharNames(engine, excludeEl = null) {
        const names = new Set();
        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
            if (c === excludeEl) return;
            const d = engine.getCardDef(c);
            if (d && d.type === 'CHARACTER' && d.color === 'GREEN' && d.name) {
                names.add(d.name);
            }
        });
        return names.size;
    }

    // 輔助：計算我方場上「BP 高於原始 BP」的角色張數
    function countMyBoostedBpChars(engine) {
        let cnt = 0;
        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.type === 'CHARACTER' && typeof d.bp === 'number' && engine.getEffectiveCardBp(c) > d.bp) {
                cnt++;
            }
        });
        return cnt;
    }

    // 輔助：檢查角色底下是否有裏側卡片
    function hasFacedownUnder(cardEl) {
        const slot = cardEl?.parentElement;
        if (!slot) return false;
        return Array.from(slot.querySelectorAll('.card')).some(c => c !== cardEl && c.classList.contains('is-flipped'));
    }

    // ==================== 綠色 Re:Zero (EX17BT/REZ-2) ====================

    // 01. EX17BT/REZ-2-032 アル (底下有裏側卡時 BP+500；登場有プリシラ時可退場其他非プリシラ/アル角色墊裏側於底下並活動)
    scripts['EX17BT/REZ-2-032'] = {
        getContinuousBpBonus(engine, cardEl) {
            return hasFacedownUnder(cardEl) ? 500 : 0;
        },
        onPlay(engine, cardEl, onComplete) {
            if (!engine.hasCharacterOnMyField('プリシラ')) { if (onComplete) onComplete(); return; }
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                if (c === cardEl) return false;
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && !d.name.includes('プリシラ') && d.name !== 'アル';
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '💡 【アル】登場時選發效果',
                desc: '是否退場 1 張〈プリシラ〉與〈アル〉以外的我方角色，將其裏側墊於此卡底下並轉為活動狀態？',
                cards: cands, selectCount: 1, upTo: true,
                customButtons: [{ label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const victim = sel[0];
                        const vSlot = victim.parentElement;
                        const under = Array.from(vSlot.querySelectorAll('.card')).filter(x => x !== victim);
                        under.forEach(u => engine.moveCardToZone(u, document.getElementById('my-outside-area')));
                        updateBpDisplay(vSlot, 0);
                        // 將退場角色以裏側墊在 アル 底下
                        const mySlot = cardEl.parentElement;
                        mySlot.insertBefore(victim, mySlot.firstChild);
                        victim.classList.add('is-flipped');
                        victim.classList.remove('rest', 'in-life');
                        victim.style.position = 'absolute';
                        cardEl.classList.remove('rest');
                        recalcStacking(mySlot);
                        updateSlotCounts();
                        broadcastMyState();
                        showSysMsg('🛡️ 【アル】已將角色裏側墊底並轉為活動狀態！');
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 04. EX17BT/REZ-2-035 ガーフィール (空場減2綠費)
    scripts['EX17BT/REZ-2-035'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        }
    };

    // 05. EX17BT/REZ-2-036 キリタカ (前線起動：活動我方〈リリアナ・マスカレード〉1張)
    scripts['EX17BT/REZ-2-036'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('リリアナ'));
            if (cands.length === 0) { showSysMsg('ℹ️ 場上沒有〈リリアナ・マスカレード〉。'); if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⚡ 【キリタカ】活動〈リリアナ・マスカレード〉', desc: '選擇 1 張轉為活動狀態：',
                cards: cands, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        sel[0].classList.remove('rest');
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 06. EX17BT/REZ-2-037 シュルト (登場其他角色1張BP+500；有プリシラ改最多2張)
    scripts['EX17BT/REZ-2-037'] = {
        onPlay(engine, cardEl, onComplete) {
            const cnt = engine.hasCharacterOnMyField('プリシラ') ? 2 : 1;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: cnt, upTo: true },
                { type: 'MODIFY_BP', amount: 500, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 07. EX17BT/REZ-2-038 ナツキ・スバル (登場從手牌休息登場1張3費以下AP1綠色角色，不可與場上同名)
    scripts['EX17BT/REZ-2-038'] = {
        onPlay(engine, cardEl, onComplete) {
            const fieldNames = new Set(engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').map(c => engine.getCardDef(c)?.name).filter(Boolean));
            const cands = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'GREEN' && (d.requiredEnergy?.count || 0) <= 3 && (d.apCost ?? 1) === 1 && !fieldNames.has(d.name);
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '✨ 【ナツキ・スバル】手牌特殊登場',
                desc: '選擇最多 1 張 3 費以下 AP 1 且場上尚未存在的綠色角色，以休息狀態登場：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                            if (placed) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                            else if (onComplete) onComplete();
                        });
                    } else if (onComplete) onComplete();
                }
            });
        }
    };

    // 08. EX17BT/REZ-2-039 ナツキ・スバル (登場從場外特召非スバル且原BP2500綠角色1張，並將該卡或自己轉活動)
    scripts['EX17BT/REZ-2-039'] = {
        onPlay(engine, cardEl, onComplete) {
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'GREEN' && d.bp === 2500 && !d.name.includes('ナツキ・スバル');
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '✨ 【ナツキ・スバル】場外登場原 BP 2500 綠色角色',
                desc: '選擇最多 1 張〈ナツキ・スバル〉以外、原 BP 2500 的綠色角色登場：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    const summoned = sel[0];
                    engine.chooseEmptyFieldSlotAndPlace(summoned, { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                        if (!placed) { if (onComplete) onComplete(); return; }
                        engine.promptModal({
                            title: '⚡ 選擇轉為活動的角色', desc: '請選擇要將哪一張轉為活動狀態：',
                            cards: [summoned, cardEl], selectCount: 1, upTo: false,
                            onConfirm: (actSel) => {
                                if (actSel.length > 0) actSel[0].classList.remove('rest');
                                broadcastMyState();
                                engine.triggerCardAbilities(summoned, 'ON_PLAY', onComplete);
                            }
                        });
                    });
                }
            });
        }
    };

    // 09. EX17BT/REZ-2-040 ハインケル (退場時橫置對手前線BP4500+角色1張)
    scripts['EX17BT/REZ-2-040'] = {
        onRetire(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 4500);
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '❄️ 【ハインケル】退場時橫置對手角色', desc: '選擇最多 1 張對手前線 BP 4500 以上的角色轉為休息：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0 && conn && isConnected) {
                        sel[0].classList.add('rest');
                        conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REST_SLOT', slotId: sel[0].parentElement.id.replace('opp-', 'my-') });
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 11. EX17BT/REZ-2-042 ベアトリス (空場減2綠費)
    scripts['EX17BT/REZ-2-042'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        }
    };

    // 12. EX17BT/REZ-2-043 ミミ (我方回合有アナスタシア或4種以上不同綠角 BP+1500)
    scripts['EX17BT/REZ-2-043'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && (engine.hasCharacterOnMyField('アナスタシア') || countDistinctGreenCharNames(engine) >= 4)) ? 1500 : 0;
        }
    };

    // 13. EX17BT/REZ-2-044 ユリウス (起動[ターン1]：有アナスタシア或4種以上不同綠角，二選一：攻擊時抽1 / BP+500)
    scripts['EX17BT/REZ-2-044'] = {
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn
                && (engine.hasCharacterOnMyField('アナスタシア') || countDistinctGreenCharNames(engine) >= 4);
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            engine.promptModal({
                title: '✨ 【ユリウス】起動メイン二選一', desc: '請選擇本回合獲得的效果：', cards: [],
                customButtons: [
                    {
                        label: '🃏 獲得：[アタック時]抽 1 張牌', color: '#4f9678',
                        onClick: () => { rt.usedOncePerTurn = true; rt.tempKeywords.ON_ATTACK_DRAW = 1; showSysMsg('🃏 【ユリウス】本回合獲得 [アタック時] 抽 1！'); if (onComplete) onComplete(); }
                    },
                    {
                        label: '⚔️ 本回合 BP+500', color: '#e67e22',
                        onClick: () => { rt.usedOncePerTurn = true; engine.addSlotBp(slot, 500); if (onComplete) onComplete(); }
                    }
                ]
            });
        },
        onAttack(engine, cardEl, onComplete) {
            if (engine.getRuntime(cardEl)?.tempKeywords?.ON_ATTACK_DRAW) engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    // 14. EX17BT/REZ-2-045 ヨシュア (退場時有アナスタシア或4種以上不同其他綠角抽1)
    scripts['EX17BT/REZ-2-045'] = {
        onRetire(engine, cardEl, onComplete) {
            if (engine.hasCharacterOnMyField('アナスタシア') || countDistinctGreenCharNames(engine, cardEl) >= 4) {
                engine.drawCards(1);
            }
            if (onComplete) onComplete();
        }
    };

    // 16. EX17BT/REZ-2-047 ラインハルト (前線雙起動：抽1 [ターン1] / 棄1手牌綠卡發動其Trigger [同名ターン1])
    scripts['EX17BT/REZ-2-047'] = {
        canActivateMain(engine, cardEl, slot) {
            if (!slot.closest('#my-front-line')) return false;
            const canDraw = !engine.getRuntime(cardEl).usedOncePerTurn;
            const canTrig = !engine.usedNamedAbilityThisTurn.has('ラインハルト_手牌觸發')
                && Array.from(document.querySelectorAll('#my-hand-area .card')).some(c => engine.getCardDef(c)?.color === 'GREEN');
            return canDraw || canTrig;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const buttons = [];
            if (!engine.getRuntime(cardEl).usedOncePerTurn) {
                buttons.push({
                    label: '🃏 抽 1 張牌 [ターン1]', color: '#4f9678',
                    onClick: () => { engine.getRuntime(cardEl).usedOncePerTurn = true; engine.drawCards(1); if (onComplete) onComplete(); }
                });
            }
            const greenHand = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => engine.getCardDef(c)?.color === 'GREEN');
            if (!engine.usedNamedAbilityThisTurn.has('ラインハルト_手牌觸發') && greenHand.length > 0) {
                buttons.push({
                    label: '⚡ 捨棄 1 張綠色手牌並發動其 [トリガー] [同名ターン1]', color: '#e67e22',
                    onClick: () => {
                        engine.promptModal({
                            title: '⚡ 【ラインハルト】選擇 1 張綠色手牌發動觸發',
                            desc: '捨棄後將直接發動該卡的 [トリガー] 效果：',
                            cards: greenHand, selectCount: 1, upTo: false,
                            onConfirm: (sel) => {
                                if (sel.length === 0) { if (onComplete) onComplete(); return; }
                                engine.usedNamedAbilityThisTurn.add('ラインハルト_手牌觸發');
                                const disc = sel[0];
                                const d = engine.getCardDef(disc);
                                const isDragonSword = engine.getBaseCardId(disc.dataset.cardId) === 'EX17BT/REZ-2-073';
                                const afterTrig = () => {
                                    if (isDragonSword) {
                                        const reinhards = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                                            .filter(c => engine.getCardDef(c)?.name.includes('ラインハルト'));
                                        if (reinhards.length > 0) {
                                            reinhards[0].classList.remove('rest');
                                            showSysMsg('⚔️ 【『龍剣』レイド】因ラインハルト效果送場外：已將〈ラインハルト〉轉為活動！');
                                        }
                                    }
                                    if (onComplete) onComplete();
                                };
                                if (d?.triggerText && d.triggerText !== '-') {
                                    engine.executeTriggerEffect(disc, d, d.compiledRules?.trigger || { type: 'TRIGGER' }, afterTrig);
                                } else {
                                    engine.moveCardToZone(disc, document.getElementById('my-outside-area'));
                                    afterTrig();
                                }
                            }
                        });
                    }
                });
            }
            engine.promptModal({ title: '⚔️ 【ラインハルト】選擇起動效果', desc: '請選擇要發動的 [起動メイン]：', cards: [], customButtons: buttons });
        }
    };

    // 18. EX17BT/REZ-2-049 リカード (我方回合有アナスタシア或4種以上不同綠角 BP+1000)
    scripts['EX17BT/REZ-2-049'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && (engine.hasCharacterOnMyField('アナスタシア') || countDistinctGreenCharNames(engine) >= 4)) ? 1000 : 0;
        }
    };

    // 20. EX17BT/REZ-2-051 リリアナ (能源線6種以上綠角活動自己；橫置其他角色BP+500)
    scripts['EX17BT/REZ-2-051'] = {
        canActivateMain(engine, cardEl, slot) {
            const canRestBuff = !cardEl.classList.contains('rest');
            const canStand = !!slot.closest('#my-energy-line') && cardEl.classList.contains('rest') && !engine.getRuntime(cardEl).usedOncePerTurn && countDistinctGreenCharNames(engine) >= 6;
            return canRestBuff || canStand;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            if (cardEl.classList.contains('rest') && slot.closest('#my-energy-line') && countDistinctGreenCharNames(engine) >= 6) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                cardEl.classList.remove('rest');
                showSysMsg('⚡ 【リリアナ】6 種以上不同綠角：轉為活動狀態！');
                if (onComplete) onComplete();
                return;
            }
            cardEl.classList.add('rest');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 500, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 22. EX17BT/REZ-2-053 レム (起動[ターン1]：棄1抽1)
    scripts['EX17BT/REZ-2-053'] = {
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [
                { type: 'DISCARD_HAND', count: 1 },
                { type: 'DRAW', amount: 1 }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 23. EX17BT/REZ-2-054 アナスタシア (登場二選一：看N=不同綠角數找5費以下角色加手牌棄1 / 其他最多2張BP+500)
    scripts['EX17BT/REZ-2-054'] = {
        onPlay(engine, cardEl, onComplete) {
            const lookN = Math.max(1, countDistinctGreenCharNames(engine));
            engine.promptModal({
                title: '✨ 【アナスタシア】登場時效果二選一', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    {
                        label: `🔍 看牌頂 ${lookN} 張，檢索 5 費以下角色 1 張（加入後棄 1）`, color: '#4f9678',
                        onClick: () => {
                            const deckArea = document.getElementById('my-deck-area');
                            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
                            const cnt = Math.min(lookN, allDeck.length);
                            if (cnt === 0) { if (onComplete) onComplete(); return; }
                            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
                            engine.promptModal({
                                title: `🔍 【アナスタシア】檢索牌頂 ${cnt} 張`, desc: '選擇最多 1 張 5 費以下角色加入手牌（其餘放牌底）：',
                                cards: topCards,
                                cardFilterFn: (c) => { const d = engine.getCardDef(c); return !!(d && d.type === 'CHARACTER' && (d.requiredEnergy?.count || 0) <= 5); },
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
                    },
                    {
                        label: '⚔️ 我方其他角色最多 2 張 BP+500', color: '#e67e22',
                        onClick: () => engine.executeAbilityActions(cardEl, [
                            { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 2, upTo: true },
                            { type: 'MODIFY_BP', amount: 500, target: 'SELECTED' }
                        ], 0, { selectedTargets: [], addedFromLook: false }, onComplete)
                    }
                ]
            });
        }
    };

    // 26. EX17BT/REZ-2-057 エミリア (登場看3找エミリア/水門都市 プリステラ/原BP2500角色加1棄1)
    scripts['EX17BT/REZ-2-057'] = {
        onPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(3, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `🔍 【エミリア】檢索牌頂 ${cnt} 張`,
                desc: '選擇最多 1 張〈エミリア〉、〈水門都市 プリステラ〉或原 BP 2500 角色加入手牌（加入後棄 1）：',
                cards: topCards,
                cardFilterFn: (c) => {
                    const d = engine.getCardDef(c);
                    return !!(d && (d.name.includes('エミリア') || d.name.includes('プリステラ') || (d.type === 'CHARACTER' && d.bp === 2500)));
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

    // 27. EX17BT/REZ-2-058 エミリア (突襲：登場得[2回アタック]與不可被選；攻擊時[ターン1] BP+1000)
    scripts['EX17BT/REZ-2-058'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
            showSysMsg('⚡ 【エミリア】本回合獲得 [2回アタック] 與「不會被對手效果選擇」！');
            if (onComplete) onComplete();
        },
        onAttack(engine, cardEl, onComplete) {
            const rt = engine.getRuntime(cardEl);
            if (!rt.usedOncePerTurn) {
                rt.usedOncePerTurn = true;
                engine.addSlotBp(cardEl.parentElement, 1000);
            }
            if (onComplete) onComplete();
        }
    };

    // 29. EX17BT/REZ-2-060 フェルト (對手回合 BP-1500)
    scripts['EX17BT/REZ-2-060'] = {
        getContinuousBpBonus(engine) {
            return (engine.isFirstPlayer !== null && !engine.isMyTurn) ? -1500 : 0;
        }
    };

    // 30. EX17BT/REZ-2-061 フェルト (登場選原BP2500角色1張 BP+1500)
    scripts['EX17BT/REZ-2-061'] = {
        onPlay(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.bp === 2500;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⚔️ 【フェルト】原 BP 2500 角色 BP+1500', desc: '選擇最多 1 張原 BP 2500 角色：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, 1500); if (onComplete) onComplete(); }
            });
        }
    };

    // 31. EX17BT/REZ-2-062 フェルト (突襲：登場抽1或活動其他1張；前線起動二選一：持續BP+1000&不被4000+阻擋 / 其他1張前線產能)
    scripts['EX17BT/REZ-2-062'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '✨ 【フェルト】登場時效果二選一', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    { label: '🃏 抽 1 張牌', color: '#4f9678', onClick: () => { engine.drawCards(1); if (onComplete) onComplete(); } },
                    {
                        label: '⚡ 活動我方其他角色 1 張', color: '#e67e22',
                        onClick: () => engine.executeAbilityActions(cardEl, [
                            { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: true },
                            { type: 'SET_ACTIVE', target: 'SELECTED' }
                        ], 0, { selectedTargets: [], addedFromLook: false }, onComplete)
                    }
                ]
            });
        },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            engine.promptModal({
                title: '✨ 【フェルト】起動メイン二選一', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    {
                        label: '⚔️ 至下次我方回合開始前 BP+1000 & 不被 BP4000+ 阻擋', color: '#4f9678',
                        onClick: () => {
                            rt.usedOncePerTurn = true;
                            engine.addSlotBp(slot, 1000);
                            rt.persistentBp = (rt.persistentBp || 0) + 1000;
                            showSysMsg('✨ 【フェルト】獲得持續 BP+1000 與不被 BP 4000 以上防禦！');
                            if (onComplete) onComplete();
                        }
                    },
                    {
                        label: '⚡ 指定其他 1 張角色本回合於前線也可產生能源', color: '#6c93c7',
                        onClick: () => {
                            rt.usedOncePerTurn = true;
                            showSysMsg('⚡ 請手動點選能源線徽章補計該前線角色的能源！');
                            if (onComplete) onComplete();
                        }
                    }
                ]
            });
        }
    };

    // 33. EX17BT/REZ-2-064 プリシラ (登場看2[4種以上綠角改看4]選1送場外其餘排牌頂)
    scripts['EX17BT/REZ-2-064'] = {
        onPlay(engine, cardEl, onComplete) {
            const cnt = countDistinctGreenCharNames(engine) >= 4 ? 4 : 2;
            engine.executeAbilityActions(cardEl, [
                { type: 'LOOK_AND_ARRANGE_TOP', count: cnt, keepUpTo: cnt, upTo: true, remainderTo: 'OUTSIDE' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 34. EX17BT/REZ-2-065 プリシラ (突襲：我方回合BP+1000；起動依加BP角色數得傷害2/衝擊1；攻擊時抽1)
    scripts['EX17BT/REZ-2-065'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; },
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            rt.usedOncePerTurn = true;
            const boosted = countMyBoostedBpChars(engine);
            if (boosted >= 3) rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2);
            if (boosted >= 5) rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
            showSysMsg(`🔥 【プリシラ】目前我方加 BP 角色 ${boosted} 張：${boosted >= 5 ? '獲得 [ダメージ(2)] 與 [インパクト(1)]！' : (boosted >= 3 ? '獲得 [ダメージ(2)]！' : '未滿 3 張無追加效果。')}`);
            if (onComplete) onComplete();
        },
        onAttack(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); }
    };

    // 37. EX17BT/REZ-2-068 うりゃ！うりゃ！うりゃぁ！ (事件：選エミリア得[2回アタック])
    scripts['EX17BT/REZ-2-068'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const emilias = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('エミリア'));
            if (emilias.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⚡ 【うりゃ！うりゃ！うりゃぁ！】賦予 [2回アタック]', desc: '選擇 1 張我方〈エミリア〉：',
                cards: emilias, selectCount: 1, upTo: false,
                onConfirm: (sel) => { if (sel.length > 0) engine.getRuntime(sel[0]).tempKeywords.DOUBLE_ATTACK = 1; if (onComplete) onComplete(); }
            });
        }
    };

    // 38. EX17BT/REZ-2-069 俺の名前はナツキ・スバル―― (事件：場外特召原BP2500 AP2 1張 / AP1 最多2張)
    scripts['EX17BT/REZ-2-069'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const ap2Cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'GREEN' && d.bp === 2500 && (d.apCost ?? 1) === 2;
            });
            const ap1Cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'GREEN' && d.bp === 2500 && (d.apCost ?? 1) === 1;
            });
            engine.promptModal({
                title: '✨ 【俺の名前はナツキ・スバル――】二選一', desc: '請選擇要從場外登場的原 BP 2500 綠色角色：', cards: [],
                customButtons: [
                    {
                        label: `⚡ AP 2 的原 BP 2500 綠角 1 張 (可選 ${ap2Cands.length})`, color: '#e67e22',
                        onClick: () => {
                            if (ap2Cands.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '選擇最多 1 張 (AP 2)', desc: '以休息狀態登場：', cards: ap2Cands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => {
                                    if (sel.length > 0) engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (p) => { if (p) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete); else if (onComplete) onComplete(); });
                                    else if (onComplete) onComplete();
                                }
                            });
                        }
                    },
                    {
                        label: `✨ AP 1 的原 BP 2500 綠角最多 2 張 (可選 ${ap1Cands.length})`, color: '#4f9678',
                        onClick: () => {
                            if (ap1Cands.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '選擇最多 2 張 (AP 1)', desc: '以休息狀態登場：', cards: ap1Cands, selectCount: 2, upTo: true,
                                onConfirm: (sel) => {
                                    const placeSeq = (idx) => {
                                        if (idx >= sel.length) { if (onComplete) onComplete(); return; }
                                        engine.chooseEmptyFieldSlotAndPlace(sel[idx], { allowFront: true, allowEnergy: true, enterRest: true }, (p) => {
                                            if (p) engine.triggerCardAbilities(sel[idx], 'ON_PLAY', () => placeSeq(idx + 1));
                                            else placeSeq(idx + 1);
                                        });
                                    };
                                    placeSeq(0);
                                }
                            });
                        }
                    }
                ]
            });
        }
    };

    // 39. EX17BT/REZ-2-070 ゴージャス・タイガー (事件：選ガーフィール BP+3000 & 狙擊)
    scripts['EX17BT/REZ-2-070'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const gars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('ガーフィール'));
            if (gars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '🎯 【ゴージャス・タイガー】強化〈ガーフィール〉', desc: '選擇 1 張〈ガーフィール〉BP+3000 與 [狙い撃ち]：',
                cards: gars, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.addSlotBp(sel[0].parentElement, 3000);
                        engine.getRuntime(sel[0]).tempKeywords.SNIPE = 1;
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 41. EX17BT/REZ-2-072 『陽剣』 (事件：退場BP5000以下，我方加BP角色>=4則選1張我方角色BP+1000)
    scripts['EX17BT/REZ-2-072'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const actions = [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ];
            if (countMyBoostedBpChars(engine) >= 4) {
                actions.push({ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true });
                actions.push({ type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' });
            }
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 42. EX17BT/REZ-2-073 『龍剣』レイド (事件：退場對手前線1張)
    scripts['EX17BT/REZ-2-073'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') {
        window.registerCardScripts(scripts);
    } else {
        window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
    }
})();
