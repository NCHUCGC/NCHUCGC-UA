/**
 * UA DLC 腳本包：Re:從零開始的異世界生活 - 藍色 (一彈 + 二彈，共 44 張)
 * 檔名：dlc-rez-blue.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // 輔助：計算我方場上 0 費藍色〈ナツキ・スバル〉張數
    function countZeroCostBlueSubaru(engine, frontOnly = false) {
        const sel = frontOnly ? '#my-front-line .slot' : '#my-front-line .slot, #my-energy-line .slot';
        return engine.getSlotTopCards(sel).filter(c => {
            const d = engine.getCardDef(c);
            return d && d.type === 'CHARACTER' && d.color === 'BLUE' && (d.requiredEnergy?.count || 0) === 0 && d.name.includes('ナツキ・スバル');
        }).length;
    }

    // 輔助：計算手牌卡片被效果公開時的「參考 BP」（含 UA40BT/REZ-1-058 クルシュ、UA40BT/REZ-1-066 百人一太刀、UA40BT/REZ-1-065 化け物風情が）
    function getHandRefBp(engine, cardEl) {
        const d = engine.getCardDef(cardEl);
        if (!d) return null;
        const baseId = engine.getBaseCardId(cardEl.dataset.cardId);
        let isChar = d.type === 'CHARACTER';
        let bp = d.bp || 0;
        if (baseId === 'UA40BT/REZ-1-065') {
            isChar = true;
            bp = 4000;
        }
        if (!isChar) return null;

        // 前線每張突襲狀態的 UA40BT/REZ-1-058 クルシュ +1000
        engine.getSlotTopCards('#my-front-line .slot').forEach(c => {
            if (engine.getBaseCardId(c.dataset.cardId) === 'UA40BT/REZ-1-058' && engine.getRuntime(c)?.isRaided) {
                bp += 1000;
            }
        });
        if (engine.usedNamedAbilityThisTurn.has('百人一太刀_BP+1000')) {
            bp += 1000;
        }
        return bp;
    }

    // 輔助：選擇敵我任一場上角色 +BP
    function chooseAnyFieldCharBp(engine, amount, upTo = true, excludeSelfEl = null, onComplete = null) {
        const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot, #opp-front-line .slot, #opp-energy-line .slot')
            .filter(c => c !== excludeSelfEl && engine.getCardDef(c)?.type === 'CHARACTER');
        if (cands.length === 0) { if (onComplete) onComplete(); return; }
        engine.promptModal({
            title: `⚔️ 選擇敵我場上角色 BP+${amount}`,
            desc: `請選擇我方或對手場上角色${upTo ? '最多 1' : ' 1'} 張，本回合 BP+${amount}：`,
            cards: cands, selectCount: 1, upTo,
            onConfirm: (sel) => {
                if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, amount);
                if (onComplete) onComplete();
            }
        });
    }

    // 輔助：公開手牌 1 張並置於牌組底部（自動觸發 EX17BT/REZ-2-020 クルシュ 的被公開置底效果）
    function revealHandCardToBottom(engine, { title, desc, upTo = false }, onDone) {
        const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
        if (handCards.length === 0) {
            showSysMsg('ℹ️ 手牌沒有卡片可公開。');
            if (onDone) onDone(null, null);
            return;
        }
        engine.promptModal({
            title, desc, cards: handCards, selectCount: 1, upTo,
            onConfirm: (sel) => {
                if (sel.length === 0) { if (onDone) onDone(null, null); return; }
                const picked = sel[0];
                const def = engine.getCardDef(picked);
                const refBp = getHandRefBp(engine, picked);
                const deckArea = document.getElementById('my-deck-area');
                deckArea.insertBefore(picked, deckArea.firstChild);
                picked.classList.add('is-flipped');
                picked.classList.remove('rest', 'in-life');
                picked.style.position = 'absolute';
                recalcStacking(deckArea);
                recalcStacking(document.getElementById('my-hand-area'));
                updateSlotCounts();
                broadcastMyState();
                sendSystemChat(`📢 [公開置底] 對手公開手牌【${def?.name}】${refBp !== null ? `（參考 BP ${refBp}）` : ''}並置於牌組底部！`);

                // 若公開的是 EX17BT/REZ-2-020 クルシュ・カルステン，觸發其追加 BP+1000 效果
                if (engine.getBaseCardId(picked.dataset.cardId) === 'EX17BT/REZ-2-020') {
                    chooseAnyFieldCharBp(engine, 1000, true, null, () => {
                        if (onDone) onDone(picked, refBp);
                    });
                } else {
                    if (onDone) onDone(picked, refBp);
                }
            }
        });
    }

    // ==================== 二彈 (EX17BT/REZ-2，共 9 張) ====================

    // 01. EX17BT/REZ-2-013 ヴィルヘルム (場上有クルシュ，且對手前線有BP4500+或自己BP5000+時，活動自己 [同名ターン1])
    scripts['EX17BT/REZ-2-013'] = {
        canActivateMain(engine, cardEl) {
            if (engine.usedNamedAbilityThisTurn.has('ヴィルヘルム_活動')) return false;
            if (!engine.hasCharacterOnMyField('クルシュ')) return false;
            const oppHas4500 = engine.getSlotTopCards('#opp-front-line .slot').some(c => engine.getEffectiveCardBp(c) >= 4500);
            const self5000 = engine.getEffectiveCardBp(cardEl) >= 5000;
            return oppHas4500 || self5000;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.usedNamedAbilityThisTurn.add('ヴィルヘルム_活動');
            cardEl.classList.remove('rest');
            showSysMsg('⚡ 【ヴィルヘルム】起動效果：轉為活動狀態！');
            if (onComplete) onComplete();
        }
    };

    // 03. EX17BT/REZ-2-015 フェリス (攻擊時有クルシュ且自身BP4000+時抽1)
    scripts['EX17BT/REZ-2-015'] = {
        onAttack(engine, cardEl, onComplete) {
            if (engine.hasCharacterOnMyField('クルシュ') && engine.getEffectiveCardBp(cardEl) >= 4000) {
                engine.drawCards(1);
            }
            if (onComplete) onComplete();
        }
    };

    // 04. EX17BT/REZ-2-016 フェリス (能源線登場有クルシュ則活動；起動橫置二選一：敵我其他角色+1000 / 公開1手牌置底敵我其他角色+2000，若為BP4000+再抽1)
    scripts['EX17BT/REZ-2-016'] = {
        onPlay(engine, cardEl, onComplete) {
            if (cardEl.closest('#my-energy-line') && engine.hasCharacterOnMyField('クルシュ')) {
                cardEl.classList.remove('rest');
                showSysMsg('⚡ 【フェリス】能源線登場且場上有〈クルシュ〉，轉為活動狀態！');
            }
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            broadcastMyState();
            engine.promptModal({
                title: '✨ 【フェリス】起動メイン二選一',
                desc: '請選擇 1 項效果發動：',
                cards: [],
                customButtons: [
                    {
                        label: '⚔️ 敵我其他角色 1 張 BP+1000',
                        color: '#4f9678',
                        onClick: () => chooseAnyFieldCharBp(engine, 1000, false, cardEl, onComplete)
                    },
                    {
                        label: '📢 公開 1 手牌置底：敵我其他角色 BP+2000（BP4000+再抽 1）',
                        color: '#e67e22',
                        onClick: () => {
                            revealHandCardToBottom(engine, {
                                title: '📢 【フェリス】公開 1 張手牌置於牌底',
                                desc: '選擇 1 張手牌公開並置於牌組底部：',
                                upTo: false
                            }, (picked, refBp) => {
                                if (!picked) { if (onComplete) onComplete(); return; }
                                chooseAnyFieldCharBp(engine, 2000, true, cardEl, () => {
                                    if (refBp !== null && refBp >= 4000) engine.drawCards(1);
                                    if (onComplete) onComplete();
                                });
                            });
                        }
                    }
                ]
            });
        }
    };

    // 05. EX17BT/REZ-2-017 レム (登場看2選1張スバル或レム送場外，其餘排牌頂)
    scripts['EX17BT/REZ-2-017'] = {
        onPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const outsideArea = document.getElementById('my-outside-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(2, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `🔍 【レム】檢視牌頂 ${cnt} 張`,
                desc: '請選最多 1 張〈ナツキ・スバル〉或〈レム〉放置於【場外】，其餘放回牌組頂端：',
                cards: topCards,
                cardFilterFn: (c) => {
                    const n = engine.getCardDef(c)?.name || '';
                    return n.includes('ナツキ・スバル') || n.includes('レム');
                },
                selectCount: 1, upTo: true,
                onConfirm: (picked) => {
                    picked.forEach(c => engine.moveCardToZone(c, outsideArea));
                    const rest = topCards.filter(c => !picked.includes(c));
                    if (rest.length <= 1) {
                        rest.forEach(c => { deckArea.appendChild(c); c.classList.add('is-flipped'); });
                        recalcStacking(deckArea); broadcastMyState();
                        if (onComplete) onComplete(); return;
                    }
                    engine.promptModal({
                        title: '⬆️ 排列放回牌組頂端的順序', desc: '請依序點選（第 1 張將在最頂端）：',
                        cards: rest, selectCount: rest.length, upTo: false, showOrderNumbers: true,
                        onConfirm: (ordered) => {
                            [...ordered].reverse().forEach(c => { deckArea.appendChild(c); c.classList.add('is-flipped'); });
                            recalcStacking(deckArea); broadcastMyState();
                            if (onComplete) onComplete();
                        }
                    });
                }
            });
        }
    };

    // 06. EX17BT/REZ-2-018 レム (登場二選一，本回合同名レム已選過的效果不可再選)
    scripts['EX17BT/REZ-2-018'] = {
        onPlay(engine, cardEl, onComplete) {
            const buttons = [];
            if (!engine.usedNamedAbilityThisTurn.has('青レム_蘇生スバル')) {
                buttons.push({
                    label: '✨ 場外 0 費青〈スバル〉休息登場（主階結束退場）',
                    color: '#4f9678',
                    onClick: () => {
                        engine.usedNamedAbilityThisTurn.add('青レム_蘇生スバル');
                        const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                            const d = engine.getCardDef(c);
                            return d && d.type === 'CHARACTER' && d.color === 'BLUE' && (d.requiredEnergy?.count || 0) === 0 && d.name.includes('ナツキ・スバル');
                        });
                        if (cands.length === 0) { showSysMsg('ℹ️ 場外沒有 0 費藍色〈ナツキ・スバル〉。'); if (onComplete) onComplete(); return; }
                        engine.promptModal({
                            title: '✨ 選擇場外 0 費青〈ナツキ・スバル〉', desc: '選擇最多 1 張以休息狀態登場：',
                            cards: cands, selectCount: 1, upTo: true,
                            onConfirm: (sel) => {
                                if (sel.length > 0) {
                                    engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                                        if (placed) {
                                            engine.getRuntime(sel[0]).retireAtEndOfMain = true;
                                            engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                                        } else if (onComplete) onComplete();
                                    });
                                } else if (onComplete) onComplete();
                            }
                        });
                    }
                });
            }
            if (!engine.usedNamedAbilityThisTurn.has('青レム_スバル戦敗活動')) {
                buttons.push({
                    label: '🔄 賦予 0 費青〈スバル〉戰敗時轉活動 [ターン1]',
                    color: '#6c93c7',
                    onClick: () => {
                        engine.usedNamedAbilityThisTurn.add('青レム_スバル戦敗活動');
                        showSysMsg('✨ 已賦予我方 0 費青〈ナツキ・スバル〉：本回合攻擊戰敗時轉為活動狀態 [ターン1]！');
                        if (onComplete) onComplete();
                    }
                });
            }
            if (buttons.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({ title: '✨ 【レム】登場時效果選擇', desc: '請選擇 1 項本回合尚未選過的效果：', cards: [], customButtons: buttons });
        }
    };

    // 07. EX17BT/REZ-2-019 クルシュ (起動[ターン1]：自身BP5000+時，至下次我方回合開始前獲得 [2回ブロック] 與 [インパクト無効])
    scripts['EX17BT/REZ-2-019'] = {
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn && engine.getEffectiveCardBp(cardEl) >= 5000;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            rt.usedOncePerTurn = true;
            rt.tempKeywords.DOUBLE_BLOCK = 1;
            rt.persistentKeywords = rt.persistentKeywords || {};
            rt.persistentKeywords.DOUBLE_BLOCK = 1;
            showSysMsg('🛡️ 【クルシュ】至下次我方回合開始前獲得 [2回ブロック] 與 [インパクト無効]！');
            if (onComplete) onComplete();
        }
    };

    // 08. EX17BT/REZ-2-020 クルシュ (被突襲時抽 1)
    scripts['EX17BT/REZ-2-020'] = {
        onRaided(engine) {
            engine.drawCards(1);
            showSysMsg('🃏 【クルシュ】被突襲時發動效果：抽取 1 張牌！');
        }
    };

    // 09. EX17BT/REZ-2-021 ナツキ・スバルの介添え人、レム (事件：退場BP5000以下，前線有突襲レム則選0費スバルBP+1500)
    scripts['EX17BT/REZ-2-021'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasRaidedRem = engine.getSlotTopCards('#my-front-line .slot').some(c => {
                const d = engine.getCardDef(c);
                return d && d.name.includes('レム') && engine.getRuntime(c)?.isRaided;
            });
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                if (!hasRaidedRem) { if (onComplete) onComplete(); return; }
                const subarus = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                    const d = engine.getCardDef(c);
                    return d && (d.requiredEnergy?.count || 0) === 0 && d.name.includes('ナツキ・スバル');
                });
                if (subarus.length === 0) { if (onComplete) onComplete(); return; }
                engine.promptModal({
                    title: '⚔️ 選擇 0 費〈ナツキ・スバル〉BP+1500', desc: '選擇最多 1 張 0 費〈ナツキ・スバル〉本回合 BP+1500：',
                    cards: subarus, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, 1500); if (onComplete) onComplete(); }
                });
            });
        }
    };

    // ==================== 一彈 (UA40BT / UA40ST，共 35 張) ====================

    // 10. UA40BT/REZ-1-034 ヴィルヘルム (登場可付1AP退場對手前線BP4500+；起動公開1手牌置底若BP4000+得衝擊1)
    scripts['UA40BT/REZ-1-034'] = {
        onPlay(engine, cardEl, onComplete) {
            if ((engine.isFirstPlayer !== null && !engine.isMyTurn) || engine.getActiveApCards().length < 1) { if (onComplete) onComplete(); return; }
            const opp4500 = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 4500);
            if (opp4500.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '💡 【ヴィルヘルム】登場時選發效果 (需 1 AP)',
                desc: '是否支付 1 AP 退場對手前線 BP 4500 以上的角色 1 張？',
                cards: opp4500, selectCount: 1, upTo: true,
                customButtons: [{ label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length > 0 && engine.payAp(1)) engine.requestRetireOpponentCard(sel[0]);
                    if (onComplete) onComplete();
                }
            });
        },
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            revealHandCardToBottom(engine, {
                title: '📢 【ヴィルヘルム】公開 1 張手牌置底',
                desc: '公開 1 張手牌置於牌底（若為 BP 4000 以上角色則獲得 [インパクト(1)]）：',
                upTo: false
            }, (picked, refBp) => {
                if (refBp !== null && refBp >= 4000) {
                    const rt = engine.getRuntime(cardEl);
                    rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                    showSysMsg('🔥 【ヴィルヘルム】本回合獲得 [インパクト(1)]！');
                }
                if (onComplete) onComplete();
            });
        }
    };

    // 16. UA40BT/REZ-1-040 ナツキ・スバル (突襲：登場抽1；退場時將突襲基底卡1張休息登場)
    scripts['UA40BT/REZ-1-040'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) { engine.drawCards(1); if (onComplete) onComplete(); }
    };

    // 17. UA40BT/REZ-1-041 パトラッシュ (我方回合前線有0費青スバル BP+1000)
    scripts['UA40BT/REZ-1-041'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && countZeroCostBlueSubaru(engine, true) > 0) ? 1000 : 0;
        }
    };

    // 18. UA40BT/REZ-1-042 フェリス (登場敵我其他角色1張BP+1000)
    scripts['UA40BT/REZ-1-042'] = {
        onPlay(engine, cardEl, onComplete) { chooseAnyFieldCharBp(engine, 1000, true, cardEl, onComplete); }
    };

    // 20. UA40BT/REZ-1-044 フェリス (突襲：登場公開1手牌置底，若為角色則從場外選1張非フェリス、AP1且BP<=參考BP的藍角色加入手牌或休息登場)
    scripts['UA40BT/REZ-1-044'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            revealHandCardToBottom(engine, {
                title: '📢 【フェリス】公開最多 1 張手牌置底',
                desc: '選擇最多 1 張手牌公開並置於牌組底部：',
                upTo: true
            }, (picked, refBp) => {
                if (refBp === null) { if (onComplete) onComplete(); return; }
                const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                    const d = engine.getCardDef(c);
                    return d && d.type === 'CHARACTER' && d.color === 'BLUE' && !d.name.includes('フェリス') && (d.apCost ?? 1) === 1 && (d.bp || 0) <= refBp;
                });
                if (cands.length === 0) { showSysMsg(`ℹ️ 場外沒有 BP ${refBp} 以下符合條件的藍色角色。`); if (onComplete) onComplete(); return; }
                engine.promptModal({
                    title: `✨ 【フェリス】選擇場外 BP ${refBp} 以下藍色角色`,
                    desc: '選擇 1 張角色後，可決定加入手牌或休息登場：',
                    cards: cands, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length === 0) { if (onComplete) onComplete(); return; }
                        const target = sel[0];
                        engine.promptModal({
                            title: `選擇【${engine.getCardDef(target)?.name}】的去向`, desc: '要加入手牌還是休息登場？',
                            cards: [target],
                            customButtons: [
                                { label: '✋ 加入手牌', color: '#4f739e', onClick: () => { engine.moveCardToZone(target, document.getElementById('my-hand-area')); if (onComplete) onComplete(); } },
                                {
                                    label: '✨ 休息登場至場上', color: '#2ecc71',
                                    onClick: () => engine.chooseEmptyFieldSlotAndPlace(target, { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                                        if (placed) engine.triggerCardAbilities(target, 'ON_PLAY', onComplete);
                                        else if (onComplete) onComplete();
                                    })
                                }
                            ]
                        });
                    }
                });
            });
        }
    };

    // 21. UA40BT/REZ-1-045 ミミ (起動公開1手牌置底，若BP4000+則自己BP+2500)
    scripts['UA40BT/REZ-1-045'] = {
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            revealHandCardToBottom(engine, {
                title: '📢 【ミミ】公開 1 張手牌置底',
                desc: '若為 BP 4000 以上角色，此角色本回合 BP+2500：',
                upTo: false
            }, (picked, refBp) => {
                if (refBp !== null && refBp >= 4000) engine.addSlotBp(slot, 2500);
                if (onComplete) onComplete();
            });
        }
    };

    // 22. UA40BT/REZ-1-046 ユリウス (登場可彈回0費青スバル1張，自己活動並BP+1000)
    scripts['UA40BT/REZ-1-046'] = {
        onPlay(engine, cardEl, onComplete) {
            const subarus = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'BLUE' && (d.requiredEnergy?.count || 0) === 0 && d.name.includes('ナツキ・スバル');
            });
            if (subarus.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '💡 【ユリウス】登場時選發效果',
                desc: '是否將 1 張 0 費青〈ナツキ・スバル〉退回手牌，使此角色活動並本回合 BP+1000？',
                cards: subarus, selectCount: 1, upTo: true,
                customButtons: [{ label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.bounceSlotTopCardToHand(sel[0].parentElement);
                        cardEl.classList.remove('rest');
                        engine.addSlotBp(cardEl.parentElement, 1000);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 27. UA40BT/REZ-1-051 レム (突襲：登場退場BP 1000 + 1000*我方0費青スバル數 以下的對手前線1張)
    scripts['UA40BT/REZ-1-051'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const maxBp = 1000 + 1000 * countZeroCostBlueSubaru(engine, false);
            showSysMsg(`💥 【レム】退場上限：BP ${maxBp} 以下`);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 28. UA40BT/REZ-1-052 レム (登場二選一：場外0費青スバル活動登場 / 彈回1角色使自己活動並從場外特召或突襲滿足能源AP1青スバル)
    scripts['UA40BT/REZ-1-052'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '✨ 【レム】登場時效果二選一', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    {
                        label: '⚡ 場外 0 費青〈スバル〉活動登場', color: '#4f9678',
                        onClick: () => {
                            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                                const d = engine.getCardDef(c);
                                return d && d.type === 'CHARACTER' && d.color === 'BLUE' && (d.requiredEnergy?.count || 0) === 0 && d.name.includes('ナツキ・スバル');
                            });
                            if (cands.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '⚡ 選擇場外 0 費青〈スバル〉', desc: '選擇最多 1 張以活動狀態登場：',
                                cards: cands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => {
                                    if (sel.length > 0) {
                                        engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: false }, (placed) => {
                                            if (placed) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                                            else if (onComplete) onComplete();
                                        });
                                    } else if (onComplete) onComplete();
                                }
                            });
                        }
                    },
                    {
                        label: '↩️ 彈回 1 角色：自己活動並場外特召/突襲青〈スバル〉', color: '#e67e22',
                        onClick: () => {
                            const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
                            if (myChars.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '↩️ 選擇 1 張我方角色退回手牌', desc: '退回手牌後此卡轉活動，並可從場外登場/突襲青〈スバル〉：',
                                cards: myChars, selectCount: 1, upTo: true,
                                onConfirm: (sel) => {
                                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                                    engine.bounceSlotTopCardToHand(sel[0].parentElement);
                                    cardEl.classList.remove('rest');
                                    const myEn = engine.calculateMyEnergy();
                                    const subarus = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                                        const d = engine.getCardDef(c);
                                        return d && d.type === 'CHARACTER' && d.color === 'BLUE' && (d.apCost ?? 1) === 1 && d.name.includes('ナツキ・スバル') && (myEn.BLUE || 0) >= (d.requiredEnergy?.count || 0);
                                    });
                                    if (subarus.length === 0) { if (onComplete) onComplete(); return; }
                                    engine.promptModal({
                                        title: '✨ 選擇場外青〈ナツキ・スバル〉', desc: '選擇最多 1 張以休息狀態登場（若為突襲卡可手動突襲）：',
                                        cards: subarus, selectCount: 1, upTo: true,
                                        onConfirm: (s2) => {
                                            if (s2.length > 0) {
                                                engine.chooseEmptyFieldSlotAndPlace(s2[0], { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                                                    if (placed) engine.triggerCardAbilities(s2[0], 'ON_PLAY', onComplete);
                                                    else if (onComplete) onComplete();
                                                });
                                            } else if (onComplete) onComplete();
                                        }
                                    });
                                }
                            });
                        }
                    }
                ]
            });
        }
    };

    // 29. UA40BT/REZ-1-053 レム (突襲：登場場外0費青スバル休息登場；攻擊時賦予0費青スバル不被BP4000+防禦)
    scripts['UA40BT/REZ-1-053'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'BLUE' && (d.requiredEnergy?.count || 0) === 0 && d.name.includes('ナツキ・スバル');
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '✨ 【レム】場外登場 0 費青〈ナツキ・スバル〉', desc: '選擇最多 1 張以休息狀態登場：',
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
        },
        onAttack(engine, cardEl, onComplete) {
            showSysMsg('✨ 【レム】可選擇我方 1 張 0 費青〈ナツキ・スバル〉本回合不被 BP 4000 以上角色防禦！');
            if (onComplete) onComplete();
        }
    };

    // 34. UA40BT/REZ-1-058 クルシュ (突襲：登場看2拿1棄1；前線起動敵我場上1張BP+1000)
    scripts['UA40BT/REZ-1-058'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'LOOK_TOP_DECK', count: 2, pickAction: 'HAND', pickUpTo: 1, upTo: false, remainderTo: 'OUTSIDE' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            chooseAnyFieldCharBp(engine, 1000, true, null, onComplete);
        }
    };

    // 35. UA40BT/REZ-1-059 プリシラ (對手場上有黃/紫減1青費)
    scripts['UA40BT/REZ-1-059'] = {
        getEnergyDiscount(engine) {
            const opp = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot');
            return opp.some(c => ['YELLOW', 'PURPLE'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // 36. UA40BT/REZ-1-060 フリューゲルの大樹 (起動橫置退場自己[同名ターン1]：公開1手牌置底，若為角色則退場對手前線BP<=參考BP的1張)
    scripts['UA40BT/REZ-1-060'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest')
                && !engine.usedNamedAbilityThisTurn.has('フリューゲルの大樹')
                && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.usedNamedAbilityThisTurn.add('フリューゲルの大樹');
            cardEl.classList.add('rest');
            engine.retireCardFromSlot(slot);
            revealHandCardToBottom(engine, {
                title: '🌳 【フリューゲルの大樹】公開 1 張手牌置底',
                desc: '公開 1 張手牌置於牌底，若為角色卡可退場對手前線該 BP 以下的角色 1 張：',
                upTo: false
            }, (picked, refBp) => {
                if (refBp === null) { if (onComplete) onComplete(); return; }
                engine.executeAbilityActions(cardEl, [
                    { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: refBp, count: 1, upTo: true },
                    { type: 'RETIRE_TARGET', target: 'SELECTED' }
                ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            });
        }
    };

    // 38. UA40BT/REZ-1-062 言質、取りました！ (事件：選レムBP+1000 & 衝擊+1，抽1)
    scripts['UA40BT/REZ-1-062'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const rems = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('レム'));
            const finish = () => { engine.drawCards(1); if (onComplete) onComplete(); };
            if (rems.length === 0) { finish(); return; }
            engine.promptModal({
                title: '🔥 【言質、取りました！】強化〈レム〉', desc: '選擇 1 張我方〈レム〉BP+1000 與 [インパクト(+1)]：',
                cards: rems, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.addSlotBp(sel[0].parentElement, 1000);
                        const rt = engine.getRuntime(sel[0]);
                        rt.tempKeywords.IMPACT_PLUS = (rt.tempKeywords.IMPACT_PLUS || 0) + 1;
                    }
                    finish();
                }
            });
        }
    };

    // 39. UA40BT/REZ-1-063 スバルくんの匂いを嗅ぐのは、レムの特権です――！ (事件：3000/有レム5000退場)
    scripts['UA40BT/REZ-1-063'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('レム') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 41. UA40BT/REZ-1-065 化け物風情が――！ (事件：退場對手前線BP4500以上1張)
    scripts['UA40BT/REZ-1-065'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 4500);
            if (cands.length === 0) { showSysMsg('ℹ️ 對手前線沒有 BP 4500 以上的角色。'); if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '💥 【化け物風情が――！】退場 BP 4500 以上角色', desc: '選擇 1 張對手前線 BP 4500 以上的角色退場：',
                cards: cands, selectCount: 1, upTo: false,
                onConfirm: (sel) => { if (sel.length > 0) engine.requestRetireOpponentCard(sel[0]); if (onComplete) onComplete(); }
            });
        }
    };

    // 42. UA40BT/REZ-1-066 百人一太刀 (事件：有クルシュ才可用，退場BP5000以下1張，本回合手牌參考BP+1000)
    scripts['UA40BT/REZ-1-066'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.usedNamedAbilityThisTurn.add('百人一太刀_BP+1000');
            showSysMsg('⚔️ 【百人一太刀】本回合我方效果參考手牌角色 BP 時 +1000！');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
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
