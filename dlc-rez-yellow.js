/**
 * UA DLC 腳本包：Re:從零開始的異世界生活 - 黃色 (一彈 + 二彈，共 67 張)
 * 檔名：dlc-rez-yellow.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // 輔助：檢查我方場上角色是否全部符合條件
    function allMyChars(engine, pred) {
        const chars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
        return chars.length > 0 && chars.every(c => pred(engine.getCardDef(c), c));
    }

    // ==================== 二彈 (EX17BT/REZ-2) ====================

    // 01. EX17BT/REZ-2-001 パック (能源線起動: 橫置+退場自己，場外0費黃エミリア休息登場至能源線)
    scripts['EX17BT/REZ-2-001'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-energy-line') && !cardEl.classList.contains('rest');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.retireCardFromSlot(slot);
            const candidates = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'YELLOW' && (d.requiredEnergy?.count || 0) === 0 && d.name.includes('エミリア');
            });
            if (candidates.length === 0) { showSysMsg('ℹ️ 場外沒有 0 費黃色〈エミリア〉。'); if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '✨ 【パック】場外登場〈エミリア〉',
                desc: '請選擇最多 1 張場外必要能源 0 的黃色〈エミリア〉，以休息狀態登場至能源線：',
                cards: candidates,
                selectCount: 1,
                upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const emptyEn = Array.from(document.querySelectorAll('#my-energy-line .slot')).find(s => s.querySelectorAll('.card').length === 0);
                        if (emptyEn) {
                            engine.moveCardToZone(sel[0], emptyEn);
                            sel[0].classList.add('rest');
                            engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                            return;
                        }
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 02. EX17BT/REZ-2-002 フレデリカ (能源線登場若本回合用過事件則活動；起動橫置其他角色BP+1000)
    scripts['EX17BT/REZ-2-002'] = {
        onPlay(engine, cardEl, onComplete) {
            if (cardEl.closest('#my-energy-line') && engine.usedEventThisTurn) {
                cardEl.classList.remove('rest');
                showSysMsg('⚡ 【フレデリカ】本回合已使用過事件卡，轉為活動狀態！');
            }
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 03. EX17BT/REZ-2-003 ペトラ (登場二選一：抽1棄1 / 場外回收黃スバル)
    scripts['EX17BT/REZ-2-003'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '✨ 【ペトラ】登場時效果二選一',
                desc: '請選擇 1 項效果發動：',
                cards: [],
                customButtons: [
                    {
                        label: '🃏 抽 1 張牌，並捨棄 1 張手牌',
                        color: '#4f9678',
                        onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete)
                    },
                    {
                        label: '♻️ 從場外回收黃色〈ナツキ・スバル〉1 張',
                        color: '#e67e22',
                        onClick: () => {
                            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                                const d = engine.getCardDef(c);
                                return d && d.color === 'YELLOW' && d.name.includes('ナツキ・スバル');
                            });
                            if (cands.length === 0) { showSysMsg('ℹ️ 場外沒有黃色〈ナツキ・スバル〉。'); if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '♻️ 回收黃色〈ナツキ・スバル〉',
                                desc: '選擇最多 1 張加入手牌：',
                                cards: cands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }
                            });
                        }
                    }
                ]
            });
        }
    };

    // 04. EX17BT/REZ-2-004 ラム (我方回合對手前線有降BP角色時 BP+1500)
    scripts['EX17BT/REZ-2-004'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasOppLoweredBpChar()) ? 1500 : 0;
        }
    };

    // 05. EX17BT/REZ-2-005 ラム (我方回合有レム或ロズワール時 BP+1000)
    scripts['EX17BT/REZ-2-005'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && (engine.hasCharacterOnMyField('レム') || engine.hasCharacterOnMyField('ロズワール'))) ? 1000 : 0;
        }
    };

    // 06. EX17BT/REZ-2-006 ラム (登場對手前線BP1500以上1張BP-1000；攻擊時對手前線有降BP角色則二選一抽1或自己BP+1000)
    scripts['EX17BT/REZ-2-006'] = {
        onPlay(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 1500);
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⬇️ 【ラム】登場時降 BP',
                desc: '選擇對手前線 BP 1500 以上的角色最多 1 張，本回合 BP-1000：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, -1000); if (onComplete) onComplete(); }
            });
        },
        onAttack(engine, cardEl, onComplete) {
            if (!engine.hasOppLoweredBpChar()) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⚔️ 【ラム】攻擊時效果二選一',
                desc: '對手前線有 BP 降低的角色，請選擇 1 項效果：',
                cards: [],
                customButtons: [
                    { label: '🃏 抽 1 張牌', color: '#4f9678', onClick: () => { engine.drawCards(1); if (onComplete) onComplete(); } },
                    { label: '⚔️ 此角色本回合 BP+1000', color: '#e67e22', onClick: () => { engine.addSlotBp(cardEl.parentElement, 1000); if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 07. EX17BT/REZ-2-007 レム (被突襲時若我方全為レム則抽1)
    scripts['EX17BT/REZ-2-007'] = {
        onRaided(engine) {
            if (allMyChars(engine, d => d.name.includes('レム'))) {
                engine.drawCards(1);
                showSysMsg('🃏 【レム】被突襲時發動效果：抽取 1 張牌！');
            }
        }
    };
    scripts['UAPR/REZ-2-007'] = scripts['EX17BT/REZ-2-007'];

    // 08. EX17BT/REZ-2-008 レム (登場抽1棄1；對手前線有降BP角色時可改為純抽1)
    scripts['EX17BT/REZ-2-008'] = {
        onPlay(engine, cardEl, onComplete) {
            if (engine.hasOppLoweredBpChar()) {
                engine.drawCards(1);
                showSysMsg('🃏 【レム】對手前線有降 BP 角色，改為純抽 1 張牌！');
                if (onComplete) onComplete();
            } else {
                engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            }
        }
    };

    // 09. EX17BT/REZ-2-009 レム (我方場上0卡時減2費；登場看1放牌頂或場外)
    scripts['EX17BT/REZ-2-009'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        }
    };

    // 10. EX17BT/REZ-2-010 レム (登場若場上全為レム，可彈回3費以下1張，下次非突襲レム AP-1 [同名ターン1])
    scripts['EX17BT/REZ-2-010'] = {
        onPlay(engine, cardEl, onComplete) {
            if (engine.usedNamedAbilityThisTurn.has('レム_AP減免') || !allMyChars(engine, d => d.name.includes('レム'))) {
                if (onComplete) onComplete();
                return;
            }
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && (d.requiredEnergy?.count || 0) <= 3;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '💡 【レム】登場時選發效果',
                desc: '是否將 3 費以下的我方角色 1 張退回手牌，使本回合下次非突襲〈レム〉消費 AP -1？',
                cards: cands, selectCount: 1, upTo: true,
                customButtons: [{ label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.usedNamedAbilityThisTurn.add('レム_AP減免');
                        engine.bounceSlotTopCardToHand(sel[0].parentElement);
                        engine.pendingApDiscounts.push({
                            amount: 1,
                            desc: '非突襲〈レム〉AP-1',
                            matchFn: (d) => d.type === 'CHARACTER' && d.name.includes('レム') && !d.compiledRules?.raidCondition
                        });
                        showSysMsg('💎 本回合下次使用的非突襲〈レム〉消費 AP -1！');
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 11. EX17BT/REZ-2-011 エミリア (登場時：本回合下次必要能源 <= 1 + floor(場外事件/2) 的事件卡 AP-1 [同名ターン1])
    scripts['EX17BT/REZ-2-011'] = {
        onPlay(engine, cardEl, onComplete) {
            if (!engine.usedNamedAbilityThisTurn.has('エミリア_事件AP減免')) {
                engine.usedNamedAbilityThisTurn.add('エミリア_事件AP減免');
                const maxEn = 1 + Math.floor(engine.countEventsInMyOutside() / 2);
                engine.pendingApDiscounts.push({
                    amount: 1,
                    desc: `必要能源 ${maxEn} 以下事件卡 AP-1`,
                    matchFn: (d) => d.type === 'EVENT' && (d.requiredEnergy?.count || 0) <= maxEn
                });
                showSysMsg(`💎 【エミリア】本回合下次必要能源 ${maxEn} 以下的事件卡消費 AP -1！`);
            }
            if (onComplete) onComplete();
        }
    };
    scripts['UAPR/REZ-2-011'] = scripts['EX17BT/REZ-2-011'];

    // 12. EX17BT/REZ-2-012 私の名前はエミリア。ただのエミリアよ
    scripts['EX17BT/REZ-2-012'] = {
        getEnergyDiscount(engine) {
            return engine.countEventsInMyOutside() >= 4 ? 1 : 0;
        },
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(2);
            const subaruHand = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'YELLOW' && d.name.includes('ナツキ・スバル') && (d.requiredEnergy?.count || 0) <= 3 && (d.apCost ?? 1) === 1;
            });
            const step2 = () => {
                const subarus = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('ナツキ・スバル'));
                if (subarus.length === 0) { if (onComplete) onComplete(); return; }
                engine.promptModal({
                    title: '⚔️ 選擇〈ナツキ・スバル〉BP+1000',
                    desc: '選擇最多 1 張我方場上〈ナツキ・スバル〉本回合 BP+1000：',
                    cards: subarus, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, 1000); if (onComplete) onComplete(); }
                });
            };
            if (subaruHand.length === 0) { step2(); return; }
            engine.promptModal({
                title: '✨ 免費活動登場〈ナツキ・スバル〉',
                desc: '可從手牌選擇最多 1 張 3 費以下 AP 1 的黃色〈ナツキ・スバル〉以活動狀態登場：',
                cards: subaruHand, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: false }, (placed) => {
                            if (placed) engine.triggerCardAbilities(sel[0], 'ON_PLAY', step2);
                            else step2();
                        });
                    } else {
                        step2();
                    }
                }
            });
        }
    };

    // ==================== 一彈 (UA40BT / UA40ST) ====================

    // 14. UA40BT/REZ-1-002 パック (我方回合有エミリア且場外事件>=4則BP+1000；登場有エミリア且場外事件>=6可棄1活動)
    scripts['UA40BT/REZ-1-002'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('エミリア') && engine.countEventsInMyOutside() >= 4) ? 1000 : 0;
        },
        onPlay(engine, cardEl, onComplete) {
            if (!engine.hasCharacterOnMyField('エミリア') || engine.countEventsInMyOutside() < 6) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [{
                type: 'OPTIONAL_COST_BRANCH',
                cost: { type: 'DISCARD_HAND', count: 1, desc: '捨棄 1 張手牌' },
                thenActions: [{ type: 'SET_ACTIVE', target: 'SELF' }]
            }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 15. UA40BT/REZ-1-003 フレデリカ (對手場上有藍或紫卡減1費)
    scripts['UA40BT/REZ-1-003'] = {
        getEnergyDiscount(engine) {
            const opp = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot');
            return opp.some(c => ['BLUE', 'PURPLE'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // 16. UA40BT/REZ-1-004 ベアトリス (登場抽1，本回合用過事件則活動1AP)
    scripts['UA40BT/REZ-1-004'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            if (engine.usedEventThisTurn) engine.activateMyApCards(1);
            if (onComplete) onComplete();
        }
    };

    // 23. UA40BT/REZ-1-011 ラム (登場二選一：對手前線BP1500以上全體-1000 / BP2500以上1張-2000)
    scripts['UA40BT/REZ-1-011'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '⬇️ 【ラム】突襲登場時效果二選一',
                desc: '請選擇 1 項效果：',
                cards: [],
                customButtons: [
                    {
                        label: '🌪️ 對手前線 BP 1500 以上全體 BP-1000',
                        color: '#e67e22',
                        onClick: () => {
                            engine.getSlotTopCards('#opp-front-line .slot').forEach(c => {
                                if (engine.getEffectiveCardBp(c) >= 1500) engine.addSlotBp(c.parentElement, -1000);
                            });
                            if (onComplete) onComplete();
                        }
                    },
                    {
                        label: '🎯 對手前線 BP 2500 以上 1 張 BP-2000',
                        color: '#c1596f',
                        onClick: () => {
                            const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 2500);
                            if (cands.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '🎯 選擇對手前線角色 BP-2000',
                                desc: '選擇最多 1 張 BP 2500 以上的角色：',
                                cards: cands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, -2000); if (onComplete) onComplete(); }
                            });
                        }
                    }
                ]
            });
        }
    };

    // 27. UA40BT/REZ-1-015 レム (我方回合BP+500；登場抽1棄1；前線起動對手前線BP1500以上-1000；攻擊時全レム抽1棄1)
    scripts['UA40BT/REZ-1-015'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; },
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 1500);
            if (cands.length === 0) { showSysMsg('ℹ️ 對手前線沒有 BP 1500 以上的角色。'); if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⬇️ 【レム】起動メイン：BP-1000',
                desc: '選擇 1 張對手前線 BP 1500 以上的角色 BP-1000：',
                cards: cands, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        engine.addSlotBp(sel[0].parentElement, -1000);
                    }
                    if (onComplete) onComplete();
                }
            });
        },
        onAttack(engine, cardEl, onComplete) {
            if (!allMyChars(engine, d => d.name.includes('レム'))) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 30. UA40BT/REZ-1-018 レム (登場對手前線BP2500以上1張BP-2000)
    scripts['UA40BT/REZ-1-018'] = {
        onPlay(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 2500);
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⬇️ 【レム】登場時 BP-2000',
                desc: '選擇對手前線 BP 2500 以上最多 1 張角色 BP-2000：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, -2000); if (onComplete) onComplete(); }
            });
        }
    };

    // 31. UA40BT/REZ-1-019 レム (登場從手牌休息特召3費以下AP1黃ラム/レム；前線起動給ラム或其他レム衝擊1)
    scripts['UA40BT/REZ-1-019'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            const cands = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'YELLOW' && (d.name.includes('ラム') || d.name.includes('レム')) && (d.requiredEnergy?.count || 0) <= 3 && (d.apCost ?? 1) === 1;
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '✨ 【レム】手牌特殊登場',
                desc: '可從手牌選擇最多 1 張 3 費以下 AP 1 的黃色〈ラム〉或〈レム〉以休息狀態登場：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                            if (placed) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                            else if (onComplete) onComplete();
                        });
                    } else if (onComplete) {
                        onComplete();
                    }
                }
            });
        },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                if (c === cardEl) return false;
                const d = engine.getCardDef(c);
                return d && (d.name.includes('ラム') || d.name.includes('レム'));
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '🔥 【レム】賦予 [インパクト(1)]',
                desc: '選擇最多 1 張我方〈ラム〉或其他〈レム〉，本回合賦予 [インパクト(1)]：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        const trt = engine.getRuntime(sel[0]);
                        trt.tempKeywords.IMPACT = Math.max(trt.tempKeywords.IMPACT || 0, 1);
                        showSysMsg(`🔥 已賦予【${engine.getCardDef(sel[0])?.name}】[インパクト(1)]！`);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 32. UA40BT/REZ-1-020 レム (登場若全無特徵得衝擊1；起動獲得狙擊並將1張突襲基底送場外)
    scripts['UA40BT/REZ-1-020'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            if (allMyChars(engine, d => !d.traits || d.traits.length === 0)) {
                const rt = engine.getRuntime(cardEl);
                rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                showSysMsg('🔥 【レム】我方場上全角色無特徵，本回合獲得 [インパクト(1)]！');
            }
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl, slot) {
            return !engine.getRuntime(cardEl).usedOncePerTurn && slot.querySelectorAll('.card').length > 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const cards = Array.from(slot.querySelectorAll('.card'));
            if (cards.length <= 1) { if (onComplete) onComplete(); return; }
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.getRuntime(cardEl).tempKeywords.SNIPE = 1;
            engine.moveCardToZone(cards[0], document.getElementById('my-outside-area'));
            showSysMsg('🎯 【レム】將基底卡送場外，本回合獲得 [狙い撃ち]（限指定 BP 3500 以下）！');
            if (onComplete) onComplete();
        }
    };

    // 33. UA40BT/REZ-1-021 ロズワール (前線起動：場上有ラム與レム時抽1棄1)
    scripts['UA40BT/REZ-1-021'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn && engine.hasCharacterOnMyField('ラム') && engine.hasCharacterOnMyField('レム');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 38. UA40BT/REZ-1-026 エミリア (登場時本回合用過事件則抽1)
    scripts['UA40BT/REZ-1-026'] = {
        onPlay(engine, cardEl, onComplete) {
            if (engine.usedEventThisTurn) engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    // 39. UA40BT/REZ-1-027 エミリア (登場下次3費以下事件AP-1；場外事件>=4橫置對手前線1張，>=8再冰凍)
    scripts['UA40BT/REZ-1-027'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.pendingApDiscounts.push({
                amount: 1,
                desc: '必要能源 3 以下事件卡 AP-1',
                matchFn: (d) => d.type === 'EVENT' && (d.requiredEnergy?.count || 0) <= 3
            });
            showSysMsg('💎 【エミリア】本回合下次必要能源 3 以下的事件卡消費 AP -1！');
            const evCnt = engine.countEventsInMyOutside();
            if (evCnt < 4) { if (onComplete) onComplete(); return; }
            const actions = [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'SET_REST', target: 'SELECTED' }
            ];
            if (evCnt >= 8) actions.push({ type: 'FREEZE_TARGET', target: 'SELECTED' });
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 40. UA40BT/REZ-1-028 フェルト (我方場上0卡減2費)
    scripts['UA40BT/REZ-1-028'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        }
    };
    scripts['UA40ST/REZ-1-028'] = scripts['UA40BT/REZ-1-028'];

    // 43. UA40BT/REZ-1-031 鬼の力 (事件：對手前線BP3000以下退場，有レム改5000)
    scripts['UA40BT/REZ-1-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('レム') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 44. UA40BT/REZ-1-032 終焉の獣 (事件：我方パック1張BP+2000與衝擊1)
    scripts['UA40BT/REZ-1-032'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const pucks = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('パック'));
            if (pucks.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '🔥 【終焉の獣】強化〈パック〉',
                desc: '選擇最多 1 張我方〈パック〉獲得 BP+2000 與 [インパクト(1)]：',
                cards: pucks, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const persist = engine.countEventsInMyOutside() >= 7; // 場外有其他6張以上事件（含剛送進場外的自己共7張）
                        engine.addSlotBp(sel[0].parentElement, 2000);
                        const rt = engine.getRuntime(sel[0]);
                        if (persist) {
                            rt.persistentBp = (rt.persistentBp || 0) + 2000;
                            rt.persistentKeywords = rt.persistentKeywords || {};
                            rt.persistentKeywords.IMPACT = Math.max(rt.persistentKeywords.IMPACT || 0, 1);
                            showSysMsg('🔥 【終焉の獣】場外事件 6 張以上：BP+2000 與衝擊將持續至下次我方回合開始！');
                        } else {
                            rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                        }
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 45. UA40BT/REZ-1-033 精霊術師 (事件：BP5000以下橫置，有エミリア改退場；有エミリア+パック看牌頂1張放頂或場外)
    scripts['UA40BT/REZ-1-033'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasEmilia = engine.hasCharacterOnMyField('エミリア');
            const hasPuck = engine.hasCharacterOnMyField('パック');
            const actions = [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: hasEmilia ? 'RETIRE_TARGET' : 'SET_REST', target: 'SELECTED' }
            ];
            if (hasEmilia && hasPuck) {
                actions.push({ type: 'LOOK_AND_ARRANGE_TOP', count: 1, keepUpTo: 1, upTo: true, remainderTo: 'OUTSIDE' });
            }
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA40ST/REZ-1-033'] = scripts['UA40BT/REZ-1-033'];

    // 55. UA40ST/REZ-1-101 ナツキ・スバル (底下有裏側卡時我方回合BP+1000；退場時有エミリア且無裏側卡可棄1手牌復活至前線並將該卡墊底)
    scripts['UA40ST/REZ-1-101'] = {
        getContinuousBpBonus(engine, cardEl) {
            if (engine.isFirstPlayer !== null && !engine.isMyTurn) return 0;
            const slot = cardEl.parentElement;
            if (!slot) return 0;
            const hasFacedownUnder = Array.from(slot.querySelectorAll('.card')).some(c => c !== cardEl && c.classList.contains('is-flipped'));
            return hasFacedownUnder ? 1000 : 0;
        }
    };

    // 56. UA40ST/REZ-1-102 ラインハルト (我方回合有フェルトBP+1000)
    scripts['UA40ST/REZ-1-102'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('フェルト')) ? 1000 : 0;
        }
    };

    // 58. UA40ST/REZ-1-104 レム (登場對手前線BP1500以上最多2張BP-1000；攻擊時對手前線有降BP角色抽1)
    scripts['UA40ST/REZ-1-104'] = {
        onPlay(engine, cardEl, onComplete) {
            const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 1500);
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '⬇️ 【レム】登場時 BP-1000',
                desc: '選擇對手前線 BP 1500 以上最多 2 張角色，本回合 BP-1000：',
                cards: cands, selectCount: 2, upTo: true,
                onConfirm: (sel) => { sel.forEach(c => engine.addSlotBp(c.parentElement, -1000)); if (onComplete) onComplete(); }
            });
        },
        onAttack(engine, cardEl, onComplete) {
            if (engine.hasOppLoweredBpChar()) engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    // 59. UA40ST/REZ-1-105 エミリア (我方回合用過事件BP+1000)
    scripts['UA40ST/REZ-1-105'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.usedEventThisTurn) ? 1000 : 0;
        }
    };

    // 60. UA40ST/REZ-1-106 エミリア (場外事件>=6得衝擊1；攻擊時看1放頂或場外，用過事件再抽1)
    scripts['UA40ST/REZ-1-106'] = {
        requireRaided: true,
        getContinuousImpact(engine) { return engine.countEventsInMyOutside() >= 6 ? 1 : 0; },
        onAttack(engine, cardEl, onComplete) {
            const actions = [{ type: 'LOOK_AND_ARRANGE_TOP', count: 1, keepUpTo: 1, upTo: true, remainderTo: 'OUTSIDE' }];
            if (engine.usedEventThisTurn) actions.push({ type: 'DRAW', amount: 1 });
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UAPR/REZ-1-106'] = scripts['UA40ST/REZ-1-106'];

    // 61. UA40ST/REZ-1-107 フェルト (登場可付1AP二選一：對手棄1我抽1 / 自己活動並場外回收徽章)
    scripts['UA40ST/REZ-1-107'] = {
        onPlay(engine, cardEl, onComplete) {
            if (engine.getActiveApCards().length < 1) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '💡 【フェルト】登場時選發效果 (需 1 AP)',
                desc: '是否支付 1 AP 發動以下其中 1 項效果？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '🃏 付 1 AP：對手棄 1 手牌、我方抽 1',
                        color: '#4f9678',
                        onClick: () => {
                            if (engine.payAp(1)) {
                                engine.drawCards(1);
                                engine.requestOpponentDiscard(1);
                            }
                            if (onComplete) onComplete();
                        }
                    },
                    {
                        label: '⚡ 付 1 AP：此卡活動並場外回收〈徽章〉',
                        color: '#e67e22',
                        onClick: () => {
                            if (engine.payAp(1)) {
                                cardEl.classList.remove('rest');
                                const badges = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name.includes('徽章'));
                                if (badges.length > 0) engine.moveCardToZone(badges[0], document.getElementById('my-hand-area'));
                            }
                            if (onComplete) onComplete();
                        }
                    },
                    { label: '❌ 不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 63. UA40ST/REZ-1-109 徽章 (事件：看5找王選候補者或事件1張加手牌，若公開的是王選候補者則活動1AP)
    scripts['UA40ST/REZ-1-109'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const handArea = document.getElementById('my-hand-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(5, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `🔍 【徽章】檢索牌頂 ${cnt} 張`,
                desc: '請選最多 1 張［特徴：王選候補者］或事件卡加入手牌（若為王選候補者再將 1 AP 轉為活動）：',
                cards: topCards,
                cardFilterFn: (c) => {
                    const d = engine.getCardDef(c);
                    return !!(d && (d.type === 'EVENT' || (d.traits && d.traits.includes('王選候補者')) || (d.effectText && d.effectText.includes('イベントカードとしても扱う'))));
                },
                selectCount: 1,
                upTo: true,
                onConfirm: (picked) => {
                    picked.forEach(c => {
                        engine.moveCardToZone(c, handArea);
                        if (engine.getCardDef(c)?.traits?.includes('王選候補者')) engine.activateMyApCards(1);
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
