/**
 * UA DLC 腳本包：坂本日常 (SAKAMOTO DAYS) - 黃色 (共 42 張)
 * 檔名：dlc-skm-yellow.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // 輔助：計算我方場上［特徴：坂本商店］的不同卡名種類數
    function countDistinctSakamotoShopNames(engine) {
        const names = new Set();
        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.traits?.includes('坂本商店') && d.name) {
                names.add(d.name);
            }
        });
        return names.size;
    }

    // 輔助：計算敵我雙方牌組與生命區中的「表側卡片」總數
    function countFaceupDeckAndLifeCards() {
        let cnt = 0;
        document.querySelectorAll('#my-deck-area .card, #opp-deck-area .card, #my-life-area .card, #opp-life-area .card').forEach(c => {
            if (!c.classList.contains('is-flipped')) cnt++;
        });
        return cnt;
    }

    // 輔助：將我方牌組最頂端 1 張設為表側
    function flipMyDeckTopFaceup() {
        const deckArea = document.getElementById('my-deck-area');
        const cards = Array.from(deckArea.querySelectorAll('.card'));
        if (cards.length === 0) return null;
        const top = cards[cards.length - 1];
        top.classList.remove('is-flipped');
        recalcStacking(deckArea);
        broadcastMyState();
        return top;
    }

    // 輔助：抽 1 張牌並回傳該卡原本是否為表側，隨後將新牌頂 1 張設為表側
    function drawAndFlipTopCheck(engine, cardEl, onComplete) {
        const deckArea = document.getElementById('my-deck-area');
        const cards = Array.from(deckArea.querySelectorAll('.card'));
        if (cards.length === 0) { if (onComplete) onComplete(); return; }
        const drawn = cards[cards.length - 1];
        const wasFaceup = !drawn.classList.contains('is-flipped');
        engine.moveCardToZone(drawn, document.getElementById('my-hand-area'));
        flipMyDeckTopFaceup();
        if (!wasFaceup) {
            engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        } else {
            showSysMsg('抽到表側卡片，無需捨棄手牌。');
            if (onComplete) onComplete();
        }
    }

    // 輔助：看我方牌頂 1 張，選擇置頂（設為表側）或置底（裏側）
    function lookTop1FaceupOrBottom(engine, title, onComplete) {
        const deckArea = document.getElementById('my-deck-area');
        const allDeck = Array.from(deckArea.querySelectorAll('.card'));
        if (allDeck.length === 0) { if (onComplete) onComplete(); return; }
        const top = allDeck[allDeck.length - 1];
        engine.promptModal({
            title,
            desc: `檢視牌組頂端：〈${engine.getCardDef(top)?.name}〉。請選擇置於牌組頂端（表側）或底部（裏側）：`,
            cards: [top],
            customButtons: [
                {
                    label: '置於牌組頂端（表側）', color: '#4f739e',
                    onClick: () => {
                        top.classList.remove('is-flipped');
                        recalcStacking(deckArea);
                        broadcastMyState();
                        sendSystemChat(`[效果] 對手檢視牌頂 1 張後，以表側置於牌組頂端（〈${engine.getCardDef(top)?.name}〉）。`);
                        if (onComplete) onComplete();
                    }
                },
                {
                    label: '置於牌組底部（裏側）', color: '#8d7cc4',
                    onClick: () => {
                        deckArea.insertBefore(top, deckArea.firstChild);
                        top.classList.add('is-flipped');
                        recalcStacking(deckArea);
                        broadcastMyState();
                        sendSystemChat('[效果] 對手檢視牌頂 1 張後，置於牌組底部。');
                        if (onComplete) onComplete();
                    }
                }
            ]
        });
    }

    // 輕量掛鉤：支援 SMD-1-033 朝倉 與 SMD-1-040 丸聞こえだぜ… 的手牌常駐 AP 減免
    function installSkmYellowHooks() {
        const eng = window.uaEngine;
        if (!eng || window._skmYellowHooked) return;
        window._skmYellowHooked = true;

        function getStaticApDiscount(cardDef) {
            if (!cardDef) return 0;
            const bid = eng.getBaseCardId(cardDef.id);
            if (bid === 'UA43BT/SMD-1-033' && countFaceupDeckAndLifeCards() > 0) return 1;
            if (bid === 'UA43BT/SMD-1-040' && eng.hasCharacterOnMyField('朝倉 シン')) return 1;
            return 0;
        }

        const origGetEffAp = eng.getEffectiveApCost.bind(eng);
        eng.getEffectiveApCost = function (cardDef) {
            return Math.max(0, origGetEffAp(cardDef) - getStaticApDiscount(cardDef));
        };

        const origPayApForCard = eng.payApForCard.bind(eng);
        eng.payApForCard = function (cardDef) {
            const disc = getStaticApDiscount(cardDef);
            if (disc > 0) {
                const patched = { ...cardDef, apCost: Math.max(0, (cardDef.apCost ?? 1) - disc) };
                showSysMsg(`〈${cardDef.name}〉消費 AP -${disc}。`);
                return origPayApForCard(patched);
            }
            return origPayApForCard(cardDef);
        };
    }

    if (window.uaEngine) installSkmYellowHooks();
    else window.addEventListener('load', () => setTimeout(installSkmYellowHooks, 60));

    // ==================== 黃色 眞霜 平助／朝倉 シン（表側牌頂＆生命軸） ====================

    // 06. UA43BT/SMD-1-006 眞霜 平助 (起動：橫置+棄1手牌，將我方裏側生命1張翻為表側，其他角色1張BP+2000)
    scripts['UA43BT/SMD-1-006'] = {
        canActivateMain(engine, cardEl) {
            const hasFacedownLife = Array.from(document.querySelectorAll('#my-life-area .card')).some(c => c.classList.contains('is-flipped'));
            return !cardEl.classList.contains('rest')
                && document.querySelectorAll('#my-hand-area .card').length >= 1
                && hasFacedownLife;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            engine.promptModal({
                title: '起動メイン：眞霜 平助', desc: '捨棄 1 張手牌：',
                cards: handCards, selectCount: 1, upTo: false,
                onConfirm: (disc) => {
                    if (disc.length === 0) { if (onComplete) onComplete(); return; }
                    cardEl.classList.add('rest');
                    engine.moveCardToZone(disc[0], document.getElementById('my-outside-area'));
                    const lifeCards = Array.from(document.querySelectorAll('#my-life-area .card')).filter(c => c.classList.contains('is-flipped'));
                    if (lifeCards.length > 0) {
                        const targetLife = lifeCards[lifeCards.length - 1];
                        targetLife.classList.remove('is-flipped');
                        broadcastMyState();
                        sendSystemChat(`[效果] 〈眞霜 平助〉將我方 1 張裏側生命翻為表側（〈${engine.getCardDef(targetLife)?.name}〉）。`);
                    }
                    engine.executeAbilityActions(cardEl, [
                        { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: true },
                        { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
                    ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
                }
            });
        }
    };

    // 07. UA43BT/SMD-1-007 眞霜 平助 (登場：選對手前線1張以表側置於對手生命區)
    scripts['UA43BT/SMD-1-007'] = {
        onPlay(engine, cardEl, onComplete) {
            const oppFront = engine.getSlotTopCards('#opp-front-line .slot');
            if (oppFront.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：眞霜 平助',
                desc: '選擇對手前線最多 1 張角色，以表側置於對手生命區（請對手手動將該卡拖曳至生命區並翻開表側）：',
                cards: oppFront, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) sendSystemChat(`[效果] 〈眞霜 平助〉指定對手的〈${engine.getCardDef(sel[0])?.name}〉以表側置於生命區。`);
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 08. UA43BT/SMD-1-008 眞霜 平助 (突襲：登場得狙擊，翻我方生命1張表側並請對手翻1張表側；起動雙方牌組與生命表側>=3得衝擊1)
    scripts['UA43BT/SMD-1-008'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.getRuntime(cardEl).tempKeywords.SNIPE = 1;
            const facedownLife = Array.from(document.querySelectorAll('#my-life-area .card')).filter(c => c.classList.contains('is-flipped'));
            if (facedownLife.length > 0) {
                const topLife = facedownLife[facedownLife.length - 1];
                topLife.classList.remove('is-flipped');
                broadcastMyState();
            }
            sendSystemChat('[效果] 〈眞霜 平助〉獲得 [狙い撃ち]；雙方各將 1 張裏側生命翻為表側。');
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn && countFaceupDeckAndLifeCards() >= 3;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const rt = engine.getRuntime(cardEl);
            rt.usedOncePerTurn = true;
            rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
            showSysMsg('〈眞霜 平助〉本回合獲得 [インパクト(1)]。');
            if (onComplete) onComplete();
        }
    };

    // 10. UA43BT/SMD-1-010 陸 無糖 (登場有陸 少糖則活動)
    scripts['UA43BT/SMD-1-010'] = {
        onPlay(engine, cardEl, onComplete) {
            if (engine.hasCharacterOnMyField('陸 少糖')) cardEl.classList.remove('rest');
            if (onComplete) onComplete();
        }
    };

    // 13. UA43BT/SMD-1-013 朝倉 シン (登場看1置頂表側或置底)
    scripts['UA43BT/SMD-1-013'] = {
        onPlay(engine, cardEl, onComplete) {
            lookTop1FaceupOrBottom(engine, '登場時效果：朝倉 シン', onComplete);
        }
    };

    // 15. UA43BT/SMD-1-015 朝倉 シン (攻擊時坂本商店>=3種：二選一抽1 / BP+1000)
    scripts['UA43BT/SMD-1-015'] = {
        onAttack(engine, cardEl, onComplete) {
            if (countDistinctSakamotoShopNames(engine) < 3) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：朝倉 シン', desc: '場上［特徴：坂本商店］達 3 種以上，請選擇 1 項效果：', cards: [],
                customButtons: [
                    { label: '抽 1 張牌', color: '#4f9678', onClick: () => { engine.drawCards(1); if (onComplete) onComplete(); } },
                    { label: '本回合 BP+1000', color: '#e67e22', onClick: () => { engine.addSlotBp(cardEl.parentElement, 1000); if (onComplete) onComplete(); } },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 16. UA43BT/SMD-1-016 朝倉 シン (登場二選一：看1置頂表側或置底 / 敵我牌組或生命有表側卡時下次原消費AP2的卡消費AP-1)
    scripts['UA43BT/SMD-1-016'] = {
        onPlay(engine, cardEl, onComplete) {
            const buttons = [
                { label: '檢視牌頂 1 張（置頂表側／置底）', color: '#4f739e', onClick: () => lookTop1FaceupOrBottom(engine, '登場時效果：朝倉 シン', onComplete) }
            ];
            if (countFaceupDeckAndLifeCards() > 0) {
                buttons.push({
                    label: '本回合下次原消費 AP 2 的卡片消費 AP -1', color: '#e67e22',
                    onClick: () => {
                        engine.pendingApDiscounts.push({
                            amount: 1,
                            desc: '原消費 AP 2 卡片 AP-1',
                            matchFn: (d) => (d.apCost ?? 1) === 2
                        });
                        showSysMsg('本回合下次使用的原消費 AP 2 卡片消費 AP -1。');
                        if (onComplete) onComplete();
                    }
                });
            }
            engine.promptModal({ title: '登場時效果：朝倉 シン', desc: '請選擇 1 項效果：', cards: [], customButtons: buttons });
        }
    };

    // 17. UA43BT/SMD-1-017 朝倉 シン (突襲：登場請對手公開手牌選1放牌頂表側；前線起動抽1並翻牌頂表側，若抽到的非表側則棄1)
    scripts['UA43BT/SMD-1-017'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            sendSystemChat('[效果] 〈朝倉 シン〉登場時：請對手公開全部手牌，由我方選最多 1 張以表側置於對手牌組頂端。');
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            drawAndFlipTopCheck(engine, cardEl, onComplete);
        }
    };

    // 18. UA43BT/SMD-1-018 朝倉 シン (登場橫置並冰凍對手前線1張；若牌頂為表側可加入手牌並活動自己再翻新牌頂表側)
    scripts['UA43BT/SMD-1-018'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true },
                { type: 'SET_REST', target: 'SELECTED' },
                { type: 'FREEZE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                const deckArea = document.getElementById('my-deck-area');
                const cards = Array.from(deckArea.querySelectorAll('.card'));
                const top = cards[cards.length - 1];
                if (!top || top.classList.contains('is-flipped')) { if (onComplete) onComplete(); return; }
                engine.promptModal({
                    title: '追加效果：朝倉 シン',
                    desc: `牌組頂端有表側卡片〈${engine.getCardDef(top)?.name}〉，是否加入手牌使此卡轉為活動，並再翻開牌頂 1 張？`,
                    cards: [top],
                    customButtons: [
                        {
                            label: '加入手牌、轉為活動並翻開牌頂', color: '#4f9678',
                            onClick: () => {
                                engine.moveCardToZone(top, document.getElementById('my-hand-area'));
                                cardEl.classList.remove('rest');
                                flipMyDeckTopFaceup();
                                if (onComplete) onComplete();
                            }
                        },
                        { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                    ]
                });
            });
        }
    };

    // 32. UA43BT/SMD-1-032 朝倉 (登場抽1並翻牌頂表側，抽到非表側棄1)
    scripts['UA43BT/SMD-1-032'] = {
        onPlay(engine, cardEl, onComplete) { drawAndFlipTopCheck(engine, cardEl, onComplete); }
    };

    // 33. UA43BT/SMD-1-033 朝倉 (起動橫置二選一：抽1棄1 / 牌頂1張翻表側)
    scripts['UA43BT/SMD-1-033'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            broadcastMyState();
            engine.promptModal({
                title: '起動メイン：朝倉', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    { label: '抽 1 張並捨棄 1 張手牌', color: '#4f9678', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    { label: '將牌組頂端 1 張翻為表側', color: '#4f739e', onClick: () => { flipMyDeckTopFaceup(); if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // 37. UA43BT/SMD-1-037 超能力 (事件：抽2，請對手公開手牌)
    scripts['UA43BT/SMD-1-037'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(2);
            sendSystemChat('[效果] 〈超能力〉：請對手公開全部手牌。');
            if (onComplete) onComplete();
        }
    };

    // ==================== 黃色 坂本商店軸 ====================

    // 19. UA43BT/SMD-1-019 坂本 葵 (能源線登場坂本商店>=3種則活動；起動橫置其他角色BP+1000)
    scripts['UA43BT/SMD-1-019'] = {
        onPlay(engine, cardEl, onComplete) {
            if (cardEl.closest('#my-energy-line') && countDistinctSakamotoShopNames(engine) >= 3) {
                cardEl.classList.remove('rest');
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

    // 22. UA43BT/SMD-1-022 坂本 太郎 (我方回合坂本商店>=3種 BP+1000)
    scripts['UA43BT/SMD-1-022'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && countDistinctSakamotoShopNames(engine) >= 3) ? 1000 : 0;
        }
    };
    scripts['UAPR/SMD-1-022'] = scripts['UA43BT/SMD-1-022'];

    // 24. UA43BT/SMD-1-024 坂本 太郎 (空場減2黃費)
    scripts['UA43BT/SMD-1-024'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0;
        }
    };

    // 25. UA43BT/SMD-1-025 坂本 太郎 (突襲：登場不退場不降BP，並賦予我方1角色不可被對手效果選擇至下回合開始)
    scripts['UA43BT/SMD-1-025'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            showSysMsg('〈坂本 太郎〉至下次我方回合開始前不會退場且不受降 BP 效果影響。');
            const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
            if (myChars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：坂本 太郎', desc: '選擇最多 1 張我方角色，至下次我方回合開始前不會被對手效果選擇：',
                cards: myChars, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) sendSystemChat(`[效果] 〈${engine.getCardDef(sel[0])?.name}〉至下次我方回合開始前不會被對手角色／事件效果選擇。`);
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // 26. UA43BT/SMD-1-026 坂本 太郎 (突襲：登場BP+1000 & 衝擊1，看5免費活動登場〈坂本商店〉或BP3500以下AP1黃角色)
    scripts['UA43BT/SMD-1-026'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.addSlotBp(cardEl.parentElement, 1000);
            const rt = engine.getRuntime(cardEl);
            rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);

            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(5, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `登場時效果：坂本 太郎（檢視牌頂 ${cnt} 張）`,
                desc: '選擇最多 1 張〈坂本商店〉或 BP 3500 以下、消費 AP 1 的黃色角色以活動狀態登場（其餘置於牌底）：',
                cards: topCards,
                cardFilterFn: (c) => {
                    const d = engine.getCardDef(c);
                    if (!d) return false;
                    return d.name === '坂本商店' || (d.type === 'CHARACTER' && d.color === 'YELLOW' && (d.bp || 0) <= 3500 && (d.apCost ?? 1) === 1);
                },
                selectCount: 1, upTo: true,
                onConfirm: (picked) => {
                    topCards.filter(c => !picked.includes(c)).forEach(c => { deckArea.insertBefore(c, deckArea.firstChild); c.classList.add('is-flipped'); });
                    recalcStacking(deckArea);
                    if (picked.length > 0) {
                        const target = picked[0];
                        const isField = engine.getCardDef(target)?.type === 'FIELD';
                        engine.chooseEmptyFieldSlotAndPlace(target, { allowFront: !isField, allowEnergy: true, enterRest: false }, (placed) => {
                            if (placed) engine.triggerCardAbilities(target, 'ON_PLAY', onComplete);
                            else if (onComplete) onComplete();
                        });
                    } else {
                        broadcastMyState();
                        if (onComplete) onComplete();
                    }
                }
            });
        }
    };
    scripts['UAPR/SMD-1-026'] = scripts['UA43BT/SMD-1-026'];

    // 28. UA43BT/SMD-1-028 陸 少糖 (我方回合坂本商店>=3種 BP+2000)
    scripts['UA43BT/SMD-1-028'] = {
        getContinuousBpBonus(engine) {
            return ((engine.isFirstPlayer === null || engine.isMyTurn) && countDistinctSakamotoShopNames(engine) >= 3) ? 2000 : 0;
        }
    };

    // 30. UA43BT/SMD-1-030 陸 少糖 (攻擊未被防禦時抽1)
    scripts['UA43BT/SMD-1-030'] = {
        onUnblockedAttack(engine, cardEl, onComplete) {
            engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    // 31. UA43BT/SMD-1-031 陸 少糖 (起動[同名ターン1]：棄 max(0, 6 - 坂本商店種類數) 張手牌，本回合BP+2000 & 2回アタック)
    scripts['UA43BT/SMD-1-031'] = {
        canActivateMain(engine) {
            if (engine.usedNamedAbilityThisTurn.has('陸少糖_2回攻擊')) return false;
            const cost = Math.max(0, 6 - countDistinctSakamotoShopNames(engine));
            return document.querySelectorAll('#my-hand-area .card').length >= cost;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const cost = Math.max(0, 6 - countDistinctSakamotoShopNames(engine));
            const applyBuff = () => {
                engine.usedNamedAbilityThisTurn.add('陸少糖_2回攻擊');
                engine.addSlotBp(slot, 2000);
                engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
                showSysMsg('〈陸 少糖〉本回合獲得 BP+2000 與 [2回アタック]。');
                if (onComplete) onComplete();
            };
            if (cost === 0) { applyBuff(); return; }
            engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: cost }], 0, { selectedTargets: [], addedFromLook: false }, applyBuff);
        }
    };

    // 35. UA43BT/SMD-1-035 坂本商店 (場域起動：橫置+棄1手牌，活動原BP3500以下坂本商店角色1張)
    scripts['UA43BT/SMD-1-035'] = {
        canActivateMain(engine, cardEl) {
            return !cardEl.classList.contains('rest') && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            engine.promptModal({
                title: '起動メイン：坂本商店', desc: '捨棄 1 張手牌：',
                cards: handCards, selectCount: 1, upTo: false,
                onConfirm: (disc) => {
                    if (disc.length === 0) { if (onComplete) onComplete(); return; }
                    cardEl.classList.add('rest');
                    engine.moveCardToZone(disc[0], document.getElementById('my-outside-area'));
                    const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                        const d = engine.getCardDef(c);
                        return d && d.type === 'CHARACTER' && d.traits?.includes('坂本商店') && (d.bp || 0) <= 3500;
                    });
                    if (cands.length === 0) { if (onComplete) onComplete(); return; }
                    engine.promptModal({
                        title: '選擇活動的角色', desc: '選擇 1 張原 BP 3500 以下的［特徴：坂本商店］角色轉為活動：',
                        cards: cands, selectCount: 1, upTo: false,
                        onConfirm: (sel) => { if (sel.length > 0) sel[0].classList.remove('rest'); if (onComplete) onComplete(); }
                    });
                }
            });
        }
    };

    // 38. UA43BT/SMD-1-038 伝説の男 (事件：BP2000/有坂本太郎5000退場；坂本商店>=5種再選1角色BP+1000)
    scripts['UA43BT/SMD-1-038'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('坂本 太郎') ? 5000 : 2000;
            const actions = [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ];
            if (countDistinctSakamotoShopNames(engine) >= 5) {
                actions.push({ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true });
                actions.push({ type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' });
            }
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') {
        window.registerCardScripts(scripts);
    } else {
        window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
    }
})();
