/**
 * Union Arena 卡片專屬腳本庫 (card-scripts.js)
 * 架構：以基底卡號 (Base Card ID) 為 Key，精準接管複雜效果、常駐加成與跨回合狀態。
 * 目前已實作：
 * - 奇異賢伴 黑色天使 (SYN) 黃色全 55 張 (含 BT / ST / PR 重印)
 */
(function () {
    const scripts = {};

    // ==================== 共用工具：從牌頂公開並免費使用 ====================
    function revealTopAndPlayFree(engine, sourceCardEl, { maxEnergy = null, requireYellow = false, requireMyTurnAndNoir = false }, onComplete) {
        const deckArea = document.getElementById('my-deck-area');
        const handArea = document.getElementById('my-hand-area');
        const allDeckCards = Array.from(deckArea.querySelectorAll('.card'));
        if (allDeckCards.length === 0) {
            showSysMsg('ℹ️ 牌組已無卡片可公開。');
            if (onComplete) onComplete();
            return;
        }
        const topCard = allDeckCards[allDeckCards.length - 1];
        const topDef = engine.getCardDef(topCard);
        const topName = topDef?.name || topCard.dataset.cardId;

        sendSystemChat(`📢 [牌頂公開] 對手公開了牌組頂端的【${topName}】！`);

        // 判定是否符合「APを支払わずに使用する」條件
        const myEn = engine.calculateMyEnergy();
        const req = topDef?.requiredEnergy || { color: 'NONE', count: 0 };
        const energyMet = req.count === 0 || req.color === 'NONE' || (myEn[req.color] || 0) >= req.count;
        const baseId = engine.getBaseCardId(topCard.dataset.cardId);
        // SYN-1-016 カナタ：山札にあるこのカードは消費APを1として扱ってもよい
        const effectiveApInDeck = (baseId === 'UA16BT/SYN-1-016') ? 1 : (topDef?.apCost ?? 1);
        const apOk = effectiveApInDeck === 1;
        const maxEnOk = (maxEnergy === null) || (req.count <= maxEnergy);
        const colorOk = !requireYellow || (topDef?.color === 'YELLOW');
        const noirOk = !requireMyTurnAndNoir || ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('ノワール'));

        const canPlayFree = !!(topDef && energyMet && apOk && maxEnOk && colorOk && noirOk);

        const buttons = [];
        if (canPlayFree) {
            buttons.push({
                label: `⚡ 不支付 AP 直接使用【${topName}】！`,
                color: '#2ecc71',
                onClick: () => engine.playCardFreeFromDeck(topCard, onComplete)
            });
        }
        buttons.push({
            label: `✋ 加入手牌`,
            color: '#4f739e',
            onClick: () => {
                engine.moveCardToZone(topCard, handArea);
                if (onComplete) onComplete();
            }
        });

        engine.promptModal({
            title: `📢 牌頂公開：【${topName}】`,
            desc: canPlayFree
                ? `此卡滿足免費使用條件！請問要不支付 AP 直接使用，還是加入手牌？`
                : `此卡未滿足免費使用條件（能源/AP/顏色/ノワール條件），將加入手牌。`,
            cards: [topCard],
            customButtons: buttons
        });
    }

    // ==================== 奇異賢伴 黑色天使 (SYN) - 黃色 ====================

    // 03. UA16BT/SYN-1-003 ノワール (抽2，選1手牌放牌頂)
    scripts['UA16BT/SYN-1-003'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(2);
            showSysMsg('🃏 【ノワール】抽了 2 張牌，請選 1 張手牌放回牌組頂端。');
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UAPR/SYN-1-003'] = scripts['UA16BT/SYN-1-003'];

    // 04. UA16BT/SYN-1-004 マリア (起動メイン: 橫置+退場自己，場外回收メイガス或クレイドルコフィン1張)
    scripts['UA16BT/SYN-1-004'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.retireCardFromSlot(slot);
            const candidates = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.traits && (d.traits.includes('メイガス') || d.traits.includes('クレイドルコフィン'));
            });
            if (candidates.length === 0) {
                showSysMsg('ℹ️ 場外沒有［特徴：メイガス］或［特徴：クレイドルコフィン］。');
                if (onComplete) onComplete();
                return;
            }
            engine.promptModal({
                title: '♻️ 【マリア】從場外回收卡片',
                desc: '請選擇最多 1 張［特徴：メイガス］或［特徴：クレイドルコフィン］加入手牌：',
                cards: candidates,
                selectCount: 1,
                upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.moveCardToZone(sel[0], document.getElementById('my-hand-area'));
                        sendSystemChat(`♻️ 【マリア】從場外回收了【${engine.getCardDef(sel[0])?.name}】！`);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };
    scripts['UA16ST/SYN-1-004'] = scripts['UA16BT/SYN-1-004'];

    // 07. UA16BT/SYN-1-007 デイジーオーガ (場上有ノワール得衝擊1；前線起動棄2手牌公開牌頂免費使用)
    scripts['UA16BT/SYN-1-007'] = {
        requireRaided: true,
        getContinuousImpact(engine, cardEl) {
            return engine.hasCharacterOnMyField('ノワール') ? 1 : 0;
        },
        canActivateMain(engine, cardEl, slot) {
            const rt = engine.getRuntime(cardEl);
            return !!slot.closest('#my-front-line') && !rt.usedOncePerTurn;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            if (handCards.length < 2) {
                showSysMsg('❌ 手牌不足 2 張，無法發動【デイジーオーガ】效果！');
                if (onComplete) onComplete();
                return;
            }
            engine.promptModal({
                title: '🗑️ 【デイジーオーガ】支付代價：捨棄 2 張手牌',
                desc: '請選擇 2 張手牌放置於場外，之後公開牌頂 1 張：',
                cards: handCards,
                selectCount: 2,
                upTo: false,
                onConfirm: (sel) => {
                    const rt = engine.getRuntime(cardEl);
                    rt.usedOncePerTurn = true;
                    const outside = document.getElementById('my-outside-area');
                    sel.forEach(c => engine.moveCardToZone(c, outside));
                    sendSystemChat('⚡ 【デイジーオーガ】捨棄 2 張手牌發動 [起動メイン]！');
                    revealTopAndPlayFree(engine, cardEl, { maxEnergy: null, requireYellow: false, requireMyTurnAndNoir: false }, onComplete);
                }
            });
        }
    };

    // 08. UA16BT/SYN-1-008 リアリド (場上有アンジェ得衝擊1；登場時可彈回3費以下我方角色，退場對手前線BP3000以下1張)
    scripts['UA16BT/SYN-1-008'] = {
        requireRaided: true,
        getContinuousImpact(engine, cardEl) {
            return engine.hasCharacterOnMyField('アンジェ') ? 1 : 0;
        },
        onPlay(engine, cardEl, onComplete) {
            const bounceCandidates = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && (d.requiredEnergy?.count || 0) <= 3;
            });
            if (bounceCandidates.length === 0) {
                if (onComplete) onComplete();
                return;
            }
            engine.promptModal({
                title: '💡 【リアリド】登場時效果',
                desc: '是否將必要能源 3 以下的我方角色 1 張退回手牌，並退場對手前線 BP 3000 以下的角色 1 張？',
                cards: bounceCandidates,
                selectCount: 1,
                upTo: true,
                customButtons: [{
                    label: '❌ 不發動',
                    color: '#7f8c8d',
                    onClick: () => { if (onComplete) onComplete(); }
                }],
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    engine.bounceSlotTopCardToHand(sel[0].parentElement);
                    engine.executeAbilityActions(cardEl, [
                        { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 3000, count: 1, upTo: true },
                        { type: 'RETIRE_TARGET', target: 'SELECTED' }
                    ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                }
            });
        }
    };

    // 11. UA16BT/SYN-1-011 エリー (本回合有角色回手牌時 BP+500，且攻擊未被防禦時從手牌特召2費AP1黃色角色休息登場)
    scripts['UA16BT/SYN-1-011'] = {
        getContinuousBpBonus(engine, cardEl) {
            if ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.bouncedCharThisTurn) return 500;
            return 0;
        },
        onUnblockedAttack(engine, cardEl, onComplete) {
            if (!engine.bouncedCharThisTurn) { if (onComplete) onComplete(); return; }
            const candidates = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && d.color === 'YELLOW' && (d.requiredEnergy?.count || 0) <= 2 && (d.apCost ?? 1) === 1;
            });
            if (candidates.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '✨ 【エリー】未被防禦效果',
                desc: '可從手牌選擇最多 1 張必要能源 2 以下、消費 AP 1 的黃色角色，以休息狀態免費登場：',
                cards: candidates,
                selectCount: 1,
                upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                            if (placed) {
                                sendSystemChat(`✨ 【エリー】效果將【${engine.getCardDef(sel[0])?.name}】休息登場！`);
                                engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete);
                            } else if (onComplete) {
                                onComplete();
                            }
                        });
                    } else if (onComplete) {
                        onComplete();
                    }
                }
            });
        }
    };

    // 12. UA16BT/SYN-1-012 エリー (登場時看5找アンジェ加手牌則棄1；前線起動[本回合有角色回手牌且同名1次]轉活動1AP)
    scripts['UA16BT/SYN-1-012'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && engine.bouncedCharThisTurn && !engine.usedNamedAbilityThisTurn.has('エリー_AP');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.usedNamedAbilityThisTurn.add('エリー_AP');
            engine.activateMyApCards(1);
            sendSystemChat('⚡ 【エリー】發動效果將 1 張 AP 卡轉為活動狀態！');
            if (onComplete) onComplete();
        }
    };

    // 15. UA16BT/SYN-1-015 カナタ (本回合從牌組使用過卡時 BP+500；若從牌組使用登場則活動)
    scripts['UA16BT/SYN-1-015'] = {
        getContinuousBpBonus(engine, cardEl) {
            if ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.playedFromDeckThisTurn) return 500;
            return 0;
        },
        onPlay(engine, cardEl, onComplete) {
            const rt = engine.getRuntime(cardEl);
            if (rt && rt.enteredFromDeck) {
                cardEl.classList.remove('rest');
                showSysMsg('⚡ 【カナタ】從牌組使用登場，轉為活動狀態！');
                broadcastMyState();
            }
            if (onComplete) onComplete();
        }
    };

    // 20. UA16BT/SYN-1-020 ランゲ (對手場上有紫或紅卡時，手牌必要能源 -1)
    scripts['UA16BT/SYN-1-020'] = {
        getEnergyDiscount(engine) {
            const oppCards = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot');
            const hasPurpleOrRed = oppCards.some(c => {
                const d = engine.getCardDef(c);
                return d && (d.color === 'PURPLE' || d.color === 'RED');
            });
            return hasPurpleOrRed ? 1 : 0;
        }
    };

    // 23. UA16BT/SYN-1-023 アンジェ (起動メイン[ターン1]: 彈回3費以下其他角色1張，二選一：抽1棄1 / 其他角色BP+1000)
    scripts['UA16BT/SYN-1-023'] = {
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const bounceCandidates = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                if (c === cardEl) return false;
                const d = engine.getCardDef(c);
                return d && d.type === 'CHARACTER' && (d.requiredEnergy?.count || 0) <= 3;
            });
            if (bounceCandidates.length === 0) {
                showSysMsg('❌ 場上沒有必要能源 3 以下的其他角色可退回手牌！');
                if (onComplete) onComplete();
                return;
            }
            engine.promptModal({
                title: '↩️ 【アンジェ】選擇退回手牌的角色',
                desc: '請選擇 1 張必要能源 3 以下的其他角色退回手牌：',
                cards: bounceCandidates,
                selectCount: 1,
                upTo: false,
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    engine.getRuntime(cardEl).usedOncePerTurn = true;
                    engine.bounceSlotTopCardToHand(sel[0].parentElement);
                    engine.promptModal({
                        title: '⚡ 【アンジェ】請選擇發動的效果',
                        desc: '請從以下 2 項效果中選擇 1 項：',
                        cards: [],
                        customButtons: [
                            {
                                label: '🃏 抽 1 張牌，並捨棄 1 張手牌',
                                color: '#4f9678',
                                onClick: () => {
                                    engine.executeAbilityActions(cardEl, [
                                        { type: 'DRAW', amount: 1 },
                                        { type: 'DISCARD_HAND', count: 1 }
                                    ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                                }
                            },
                            {
                                label: '⚔️ 我方其他角色 1 張本回合 BP+1000',
                                color: '#e67e22',
                                onClick: () => {
                                    engine.executeAbilityActions(cardEl, [
                                        { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: true },
                                        { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
                                    ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                                }
                            }
                        ]
                    });
                }
            });
        }
    };

    // 24. UA16BT/SYN-1-024 シエル (退場時：選對手前線帶有[レイド]的角色1張橫置)
    scripts['UA16BT/SYN-1-024'] = {
        onRetire(engine, cardEl, onComplete) {
            const candidates = engine.getSlotTopCards('#opp-front-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return d && (d.compiledRules?.raidCondition || (d.effectText && d.effectText.includes('[レイド]')));
            });
            if (candidates.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '❄️ 【シエル】退場時效果',
                desc: '請選擇最多 1 張對手前線持有 [レイド] 的角色轉為休息狀態：',
                cards: candidates,
                selectCount: 1,
                upTo: true,
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

    // 28. UA16BT/SYN-1-028 キャリア (起動メイン[橫置]：二選一：移動1角色到另一線 / 交換前線與能源線各1角色)
    scripts['UA16BT/SYN-1-028'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            broadcastMyState();
            engine.promptModal({
                title: '🚚 【キャリア】請選擇移動方式',
                desc: '請選擇以下 1 項效果：',
                cards: [],
                customButtons: [
                    {
                        label: '↕️ 選擇 1 張角色移動至另一條線',
                        color: '#6c93c7',
                        onClick: () => {
                            const chars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
                            if (chars.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '↕️ 選擇要移動的角色',
                                desc: '選擇 1 張角色移動至另一條線的空位：',
                                cards: chars,
                                selectCount: 1,
                                upTo: true,
                                onConfirm: (sel) => {
                                    if (sel.length > 0) {
                                        const c = sel[0];
                                        const toFront = !!c.parentElement.closest('#my-energy-line');
                                        const destSlot = Array.from(document.querySelectorAll(toFront ? '#my-front-line .slot' : '#my-energy-line .slot')).find(s => s.querySelectorAll('.card').length === 0);
                                        if (destSlot) {
                                            Array.from(c.parentElement.querySelectorAll('.card')).forEach(x => destSlot.appendChild(x));
                                            recalcStacking(destSlot);
                                            broadcastMyState();
                                        } else {
                                            showSysMsg('❌ 目標線已無空位！');
                                        }
                                    }
                                    if (onComplete) onComplete();
                                }
                            });
                        }
                    },
                    {
                        label: '🔄 交換前線與能源線各 1 張角色',
                        color: '#4f9678',
                        onClick: () => {
                            const flChars = engine.getSlotTopCards('#my-front-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
                            const enChars = engine.getSlotTopCards('#my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
                            if (flChars.length === 0 || enChars.length === 0) {
                                showSysMsg('❌ 前線或能源線沒有角色可供交換！');
                                if (onComplete) onComplete();
                                return;
                            }
                            engine.promptModal({
                                title: '🔄 步驟 1/2：選擇前線角色',
                                desc: '請選擇 1 張我方前線角色：',
                                cards: flChars,
                                selectCount: 1,
                                upTo: false,
                                onConfirm: (selFl) => {
                                    if (selFl.length === 0) { if (onComplete) onComplete(); return; }
                                    const flSlot = selFl[0].parentElement;
                                    engine.promptModal({
                                        title: '🔄 步驟 2/2：選擇能源線角色',
                                        desc: '請選擇 1 張我方能源線角色與其互換位置：',
                                        cards: enChars,
                                        selectCount: 1,
                                        upTo: false,
                                        onConfirm: (selEn) => {
                                            if (selEn.length > 0) {
                                                const enSlot = selEn[0].parentElement;
                                                const flCards = Array.from(flSlot.querySelectorAll('.card'));
                                                const enCards = Array.from(enSlot.querySelectorAll('.card'));
                                                flCards.forEach(x => enSlot.appendChild(x));
                                                enCards.forEach(x => flSlot.appendChild(x));
                                                recalcStacking(flSlot);
                                                recalcStacking(enSlot);
                                                broadcastMyState();
                                            }
                                            if (onComplete) onComplete();
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

    // 29. UA16BT/SYN-1-029 ガツンとアタック大作戦 (事件：BP3000以下退場，有[エリー/リアリド]且[アンジェ]改為BP5000以下)
    scripts['UA16BT/SYN-1-029'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const cond = (engine.hasCharacterOnMyField('エリー') || engine.hasCharacterOnMyField('リアリド')) && engine.hasCharacterOnMyField('アンジェ');
            const maxBp = cond ? 5000 : 3000;
            showSysMsg(`💥 【ガツンとアタック大作戦】退場上限：BP ${maxBp} 以下`);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 30. UA16BT/SYN-1-030 マスターとの契約 (事件：看6找[ドリフター/クレイドルコフィン]與[メイガス]各1張加手牌，其餘放牌底)
    scripts['UA16BT/SYN-1-030'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const handArea = document.getElementById('my-hand-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(6, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            const pickedAll = [];

            engine.promptModal({
                title: `🔍 【マスターとの契約】步驟 1/2 (看 ${cnt} 張)`,
                desc: '請選最多 1 張［特徴：ドリフター］或［特徴：クレイドルコフィン］加入手牌：',
                cards: topCards,
                cardFilterFn: (c) => {
                    const d = engine.getCardDef(c);
                    return !!(d && d.traits && (d.traits.includes('ドリフター') || d.traits.includes('クレイドルコフィン')));
                },
                selectCount: 1,
                upTo: true,
                onConfirm: (sel1) => {
                    sel1.forEach(c => { pickedAll.push(c); engine.moveCardToZone(c, handArea); });
                    const remaining = topCards.filter(c => !pickedAll.includes(c));
                    engine.promptModal({
                        title: `🔍 【マスターとの契約】步驟 2/2`,
                        desc: '請選最多 1 張［特徴：メイガス］加入手牌（其餘自動放牌組底部）：',
                        cards: remaining,
                        cardFilterFn: (c) => {
                            const d = engine.getCardDef(c);
                            return !!(d && d.traits && d.traits.includes('メイガス'));
                        },
                        selectCount: 1,
                        upTo: true,
                        onConfirm: (sel2) => {
                            sel2.forEach(c => { pickedAll.push(c); engine.moveCardToZone(c, handArea); });
                            const rest = topCards.filter(c => !pickedAll.includes(c));
                            rest.forEach(c => {
                                deckArea.insertBefore(c, deckArea.firstChild);
                                c.classList.add('is-flipped');
                            });
                            recalcStacking(deckArea);
                            broadcastMyState();
                            if (onComplete) onComplete();
                        }
                    });
                }
            });
        }
    };

    // 32. UA16BT/SYN-1-032 やれってことか！ (事件：BP3000以下退場，有[カナタ/デイジーオーガ]且[ノワール]改為BP5000；若從牌組使用再選我方1角色BP+1000)
    scripts['UA16BT/SYN-1-032'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const cond = (engine.hasCharacterOnMyField('カナタ') || engine.hasCharacterOnMyField('デイジーオーガ')) && engine.hasCharacterOnMyField('ノワール');
            const maxBp = cond ? 5000 : 3000;
            const actions = [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ];
            if (engine.getRuntime(cardEl)?.enteredFromDeck) {
                actions.push({ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true });
                actions.push({ type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' });
            }
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA16ST/SYN-1-032'] = scripts['UA16BT/SYN-1-032'];

    // 33. UA16BT/SYN-1-033 ヨシヲちゃんキーホルダー (事件：前線1角色BP+2000，有[エリー/リアリド]再給[インパクト(+1)])
    scripts['UA16BT/SYN-1-033'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasPair = engine.hasCharacterOnMyField('エリー') || engine.hasCharacterOnMyField('リアリド');
            const actions = [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
            ];
            if (hasPair) {
                actions.push({ type: 'GRANT_KEYWORD', keyword: 'IMPACT_PLUS', value: 1, target: 'SELECTED' });
            }
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 44. UA16ST/SYN-1-102 デイジーオーガ (登場時公開牌頂1張，我方回合且有ノワール且4費以下AP1黃卡可免費使用)
    scripts['UA16ST/SYN-1-102'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            revealTopAndPlayFree(engine, cardEl, { maxEnergy: 4, requireYellow: true, requireMyTurnAndNoir: true }, onComplete);
        }
    };

    // 45. UA16ST/SYN-1-103 カナタ (登場時場外回收ノワール1張；一般情況需棄1手牌，從牌組使用登場則不需棄牌)
    scripts['UA16ST/SYN-1-103'] = {
        onPlay(engine, cardEl, onComplete) {
            const fromDeck = !!engine.getRuntime(cardEl)?.enteredFromDeck;
            const candidates = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && d.name && d.name.includes('ノワール');
            });
            if (candidates.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '♻️ 【カナタ】登場時效果',
                desc: fromDeck
                    ? '從牌組使用登場！可免費從場外回收最多 1 張〈ノワール〉加入手牌：'
                    : '可從場外回收 1 張〈ノワール〉加入手牌（回收後須捨棄 1 張手牌）：',
                cards: candidates,
                selectCount: 1,
                upTo: true,
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    engine.moveCardToZone(sel[0], document.getElementById('my-hand-area'));
                    if (fromDeck) {
                        if (onComplete) onComplete();
                    } else {
                        engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                    }
                }
            });
        }
    };

    // 48. UA16ST/SYN-1-106 ノワール (起動メイン: 橫置+退場自己，再發動一次登場時看2排序)
    scripts['UA16ST/SYN-1-106'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest');
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.retireCardFromSlot(slot);
            engine.executeAbilityActions(cardEl, [
                { type: 'LOOK_AND_ARRANGE_TOP', count: 2, keepUpTo: 2, upTo: true, remainderTo: 'BOTTOM' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 51. UA16ST/SYN-1-109 思い出の写真 (事件：抽3，選1張手牌放牌頂)
    scripts['UA16ST/SYN-1-109'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(3);
            showSysMsg('🃏 【思い出の写真】抽了 3 張牌，請選 1 張手牌放回牌組頂端。');
            engine.executeAbilityActions(cardEl, [{ type: 'PUT_HAND_TO_DECK_TOP', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // 55. UAPR/SYN-P-001 ノワール (登場時可退場自己：看3排牌頂，再公開牌頂1張滿足條件免費使用)
    scripts['UAPR/SYN-P-001'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '💡 【ノワール】登場時選發效果',
                desc: '是否將此角色退場，檢視牌頂 3 張並公開牌頂 1 張（滿足條件可免費使用）？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '✅ 退場自己並發動',
                        color: '#2ecc71',
                        onClick: () => {
                            if (cardEl.parentElement) engine.retireCardFromSlot(cardEl.parentElement);
                            engine.executeAbilityActions(cardEl, [
                                { type: 'LOOK_AND_ARRANGE_TOP', count: 3, keepUpTo: 3, remainderTo: 'TOP' }
                            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                                revealTopAndPlayFree(engine, cardEl, { maxEnergy: null, requireYellow: false, requireMyTurnAndNoir: false }, onComplete);
                            });
                        }
                    },
                    {
                        label: '❌ 不發動',
                        color: '#7f8c8d',
                        onClick: () => { if (onComplete) onComplete(); }
                    }
                ]
            });
        }
    };

    if (typeof window.registerCardScripts === 'function') {
        window.registerCardScripts(scripts);
    } else {
        window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
    }
})();
