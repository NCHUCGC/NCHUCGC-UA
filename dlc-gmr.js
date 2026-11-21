/**
 * Union Arena 卡片腳本 DLC：卡美拉 -Rebirth- (GAMERA -Rebirth-) [GMR]
 * 涵蓋：藍（ギャオス／ギロン／ジグラ／ジャイガー／バイラス）與 綠（ガメラ 陸／海／空 與 子供軸）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    function countTraitlessInOutside(engine) {
        let cnt = 0;
        document.querySelectorAll('#my-outside-area .card').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.type === 'CHARACTER' && (!d.traits || d.traits.length === 0)) cnt++;
        });
        return cnt;
    }

    function getMyTraitlessFieldChars(engine) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
            const d = engine.getCardDef(c);
            return d && d.type === 'CHARACTER' && (!d.traits || d.traits.length === 0);
        });
    }

    function countMyFrontTrait(engine, trait) {
        let cnt = 0;
        engine.getSlotTopCards('#my-front-line .slot').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && Array.isArray(d.traits) && d.traits.includes(trait)) cnt++;
        });
        return cnt;
    }

    function getRaidBaseDef(engine, cardEl) {
        const slot = cardEl?.parentElement;
        if (!slot) return null;
        const cards = Array.from(slot.querySelectorAll('.card'));
        if (cards.length < 2) return null;
        return engine.getCardDef(cards[cards.length - 2]);
    }

    window.registerCardScripts({
        // ==================== 藍色：怪獸軍團 ====================

        // エスギャオス (BP 4000)：登場橫置+凍結對手前線，可棄1手牌轉活動
        'UA22BT/GMR-1-007': {
            onPlay(engine, cardEl, done) {
                const oppFront = engine.getSlotTopCards('#opp-front-line .slot');
                const askDiscardSelfActive = () => {
                    const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                    if (hand.length === 0) { done(); return; }
                    engine.promptModal({
                        title: 'エスギャオス：選發效果',
                        desc: '是否將 1 張手牌放置於場外，將此角色轉為活動狀態？',
                        cards: hand,
                        selectCount: 1,
                        upTo: true,
                        onConfirm: (sel) => {
                            if (sel.length > 0) {
                                engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                                cardEl.classList.remove('rest');
                                showSysMsg('エスギャオス轉為活動狀態！');
                            }
                            done();
                        }
                    });
                };

                if (oppFront.length === 0) { askDiscardSelfActive(); return; }
                engine.promptModal({
                    title: 'エスギャオス：選擇對手前線角色',
                    desc: '選擇最多 1 張對手前線角色轉為休息並凍結：',
                    cards: oppFront,
                    selectCount: 1,
                    upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            const t = sel[0];
                            engine.requestRestOpponentCard(t);
                            engine.requestFreezeOpponentCard(t);
                        }
                        askDiscardSelfActive();
                    }
                });
            }
        },

        // エスギャオス (7費 Raid BP 5000)：場外無特徵角5張以上減1費；登場抽3張
        'UA22BT/GMR-1-008': {
            getEnergyDiscount(engine) {
                return countTraitlessInOutside(engine) >= 5 ? 1 : 0;
            },
            onPlay(engine, cardEl, done) {
                engine.drawCards(3);
                showSysMsg('エスギャオス [登場時]：抽取 3 張卡片！');
                done();
            }
        },

        // ギャオス (BP 3000)：起動退場我方無特徵角，本回合 BP+1000
        'UA22BT/GMR-1-010': {
            canActivateMain(engine, cardEl) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && getMyTraitlessFieldChars(engine).length > 0;
            },
            onActivateMain(engine, cardEl, slot, done) {
                const cands = getMyTraitlessFieldChars(engine);
                engine.promptModal({
                    title: 'ギャオス [起動メイン]',
                    desc: '選擇 1 張我方場上無特徵角色退場，使此卡本回合 BP+1000：',
                    cards: cands,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            engine.getRuntime(cardEl).usedOncePerTurn = true;
                            engine.retireCardFromSlot(sel[0].parentElement);
                            engine.addSlotBp(slot, 1000);
                            showSysMsg('ギャオス 本回合 BP+1000！');
                        }
                        done();
                    }
                });
            }
        },

        // ギャオス (BP 3000)：橫置自己＋棄手牌無特徵角1張，抽1張
        'UA22BT/GMR-1-011': {
            canActivateMain(engine, cardEl) {
                if (cardEl.classList.contains('rest')) return false;
                return Array.from(document.querySelectorAll('#my-hand-area .card')).some(c => {
                    const d = engine.getCardDef(c);
                    return d && d.type === 'CHARACTER' && (!d.traits || d.traits.length === 0);
                });
            },
            onActivateMain(engine, cardEl, slot, done) {
                const cands = Array.from(document.querySelectorAll('#my-hand-area .card')).filter(c => {
                    const d = engine.getCardDef(c);
                    return d && d.type === 'CHARACTER' && (!d.traits || d.traits.length === 0);
                });
                engine.promptModal({
                    title: 'ギャオス [起動メイン]',
                    desc: '選擇手牌 1 張無特徵角色放置於場外並抽 1 張牌：',
                    cards: cands,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            cardEl.classList.add('rest');
                            engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                            engine.drawCards(1);
                        }
                        done();
                    }
                });
            }
        },

        // ギャオス (4費 Raid BP 4000)：前線起動退場我方無特徵角，抽1張＋AP卡1張轉活動
        'UA22BT/GMR-1-012': {
            requireRaided: true,
            canActivateMain(engine, cardEl, slot) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && !!slot.closest('#my-front-line') && getMyTraitlessFieldChars(engine).length > 0;
            },
            onActivateMain(engine, cardEl, slot, done) {
                const cands = getMyTraitlessFieldChars(engine);
                engine.promptModal({
                    title: 'ギャオス [起動メイン]',
                    desc: '選擇 1 張我方場上無特徵角色退場（抽 1 張牌並將 1 張 AP 卡轉為活動）：',
                    cards: cands,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            engine.getRuntime(cardEl).usedOncePerTurn = true;
                            engine.retireCardFromSlot(sel[0].parentElement);
                            engine.drawCards(1);
                            engine.activateMyApCards(1);
                        }
                        done();
                    }
                });
            }
        },

        // ギロン (5費 Raid BP 4000)：登場二選一（退場BP3000以下 OR 退場BP1000以下且自身BP+1000+衝擊1）
        'UA22BT/GMR-1-016': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const opp3000 = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 3000);
                const opp1000 = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 1000);
                engine.promptModal({
                    title: 'ギロン [登場時]：二選一',
                    desc: '請選擇要發動的效果：',
                    cards: [cardEl],
                    customButtons: [
                        {
                            label: '退場對手前線 BP3000 以下 1 張',
                            color: '#e74c3c',
                            onClick: () => {
                                if (opp3000.length === 0) { showSysMsg('無符合目標。'); done(); return; }
                                engine.promptModal({
                                    title: '選擇退場目標 (BP3000以下)',
                                    desc: '請選擇最多 1 張對手前線角色退場：',
                                    cards: opp3000,
                                    selectCount: 1,
                                    upTo: true,
                                    onConfirm: (sel) => {
                                        if (sel.length > 0) engine.requestRetireOpponentCard(sel[0]);
                                        done();
                                    }
                                });
                            }
                        },
                        {
                            label: '退場 BP1000 以下 1 張＋自身 BP+1000＆衝擊(1)',
                            color: '#9b59b6',
                            onClick: () => {
                                const buffSelf = () => {
                                    engine.addSlotBp(cardEl.parentElement, 1000);
                                    const rt = engine.getRuntime(cardEl);
                                    rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                                    showSysMsg('ギロン 本回合 BP+1000 並獲得 [インパクト(1)]！');
                                    done();
                                };
                                if (opp1000.length === 0) { buffSelf(); return; }
                                engine.promptModal({
                                    title: '選擇退場目標 (BP1000以下)',
                                    desc: '請選擇最多 1 張對手前線角色退場：',
                                    cards: opp1000,
                                    selectCount: 1,
                                    upTo: true,
                                    onConfirm: (sel) => {
                                        if (sel.length > 0) engine.requestRetireOpponentCard(sel[0]);
                                        buffSelf();
                                    }
                                });
                            }
                        }
                    ]
                });
            }
        },

        // ギロン (4費 BP 4000)：未防禦抽1張
        'UA22BT/GMR-1-017': {
            onUnblockedAttack(engine, cardEl, done) {
                engine.drawCards(1);
                showSysMsg('ギロン：攻擊未被防禦，抽取 1 張卡片！');
                done();
            }
        },

        // ジグラ (4費 BP 4000)：攻擊時對手前線有降BP角色則得 [ダメージ(2)]
        'UA22BT/GMR-1-021': {
            onAttack(engine, cardEl, done) {
                if (engine.hasOppLoweredBpChar()) {
                    const rt = engine.getRuntime(cardEl);
                    rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2);
                    showSysMsg('ジグラ [アタック時]：本回合獲得 [ダメージ(2)]！');
                }
                done();
            }
        },

        // ジグラ (4費 Raid BP 4000)：登場對手前線 BP1500 以上全體 -1000；起動看牌頂2張排頂/底
        'UA22BT/GMR-1-022': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                    const top = engine.getTopCardInSlot(slot);
                    if (top && engine.getEffectiveCardBp(top) >= 1500) {
                        engine.addSlotBp(slot, -1000);
                    }
                });
                showSysMsg('ジグラ [登場時]：對手前線 BP1500 以上角色全體 BP-1000！');
                done();
            },
            canActivateMain(engine, cardEl, slot) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && !!slot.closest('#my-front-line') && engine.hasOppLoweredBpChar();
            },
            onActivateMain(engine, cardEl, slot, done) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                engine.executeAbilityActions(cardEl, [{ type: 'LOOK_AND_ARRANGE_TOP', count: 2, keepUpTo: 2, remainderTo: 'BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        },

        // ジャイガー (3費 BP 3500)：登場二選一（場外特召2費以下ジャイガー OR 場外回收ジャイガー）
        'UA22BT/GMR-1-026': {
            onPlay(engine, cardEl, done) {
                const outJaiger = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                    const d = engine.getCardDef(c);
                    return d && d.name && d.name.includes('ジャイガー');
                });
                if (outJaiger.length === 0) { done(); return; }
                const summonCands = outJaiger.filter(c => (engine.getCardDef(c)?.requiredEnergy?.count || 0) <= 2);
                engine.promptModal({
                    title: 'ジャイガー [登場時]：二選一',
                    desc: '請選擇要發動的效果：',
                    cards: [cardEl],
                    customButtons: [
                        {
                            label: '從場外休息登場 2 費以下〈ジャイガー〉',
                            color: '#4f9678',
                            onClick: () => {
                                if (summonCands.length === 0) { showSysMsg('場外沒有 2 費以下〈ジャイガー〉。'); done(); return; }
                                engine.promptModal({
                                    title: '選擇登場目標',
                                    desc: '選擇最多 1 張休息登場：',
                                    cards: summonCands,
                                    selectCount: 1,
                                    upTo: true,
                                    onConfirm: (sel) => {
                                        if (sel.length > 0) engine.chooseEmptyFieldSlotAndPlace(sel[0], { enterRest: true }, () => done());
                                        else done();
                                    }
                                });
                            }
                        },
                        {
                            label: '從場外回收 1 張〈ジャイガー〉至手牌',
                            color: '#6c93c7',
                            onClick: () => {
                                engine.promptModal({
                                    title: '選擇回收目標',
                                    desc: '選擇最多 1 張〈ジャイガー〉加入手牌：',
                                    cards: outJaiger,
                                    selectCount: 1,
                                    upTo: true,
                                    onConfirm: (sel) => {
                                        if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area'));
                                        done();
                                    }
                                });
                            }
                        }
                    ]
                });
            }
        },

        // ジャイガー (3費 Raid BP 3500)：登場看4張特召2費以下1APジャイガー；起動退場其他ジャイガー得BP+500+衝擊1
        'UA22BT/GMR-1-027': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const deckArea = document.getElementById('my-deck-area');
                const allDeck = Array.from(deckArea.querySelectorAll('.card'));
                const topCards = allDeck.slice(Math.max(0, allDeck.length - 4)).reverse();
                if (topCards.length === 0) { done(); return; }
                engine.promptModal({
                    title: 'ジャイガー [登場時]：檢視牌頂 4 張',
                    desc: '選擇最多 1 張必要能源 2 以下、消費 AP 1 的〈ジャイガー〉休息登場，其餘置於牌底：',
                    cards: topCards,
                    cardFilterFn: (c) => {
                        const d = engine.getCardDef(c);
                        return d && d.name && d.name.includes('ジャイガー') && (d.requiredEnergy?.count || 0) <= 2 && (d.apCost || 1) === 1;
                    },
                    selectCount: 1,
                    upTo: true,
                    onConfirm: (sel) => {
                        const rest = topCards.filter(c => !sel.includes(c));
                        const afterOrder = () => {
                            if (sel.length > 0) engine.chooseEmptyFieldSlotAndPlace(sel[0], { enterRest: true }, () => done());
                            else done();
                        };
                        engine.promptOrderCardsToDeck(rest, 'BOTTOM', afterOrder);
                    }
                });
            },
            canActivateMain(engine, cardEl, slot) {
                const rt = engine.getRuntime(cardEl);
                if (rt.usedOncePerTurn || !slot.closest('#my-front-line')) return false;
                return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => c !== cardEl && engine.getCardDef(c)?.name?.includes('ジャイガー'));
            },
            onActivateMain(engine, cardEl, slot, done) {
                const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => c !== cardEl && engine.getCardDef(c)?.name?.includes('ジャイガー'));
                engine.promptModal({
                    title: 'ジャイガー [起動メイン]',
                    desc: '選擇 1 張其他〈ジャイガー〉退場，使此卡本回合 BP+500 並獲得 [インパクト(1)]：',
                    cards: cands,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            const rt = engine.getRuntime(cardEl);
                            rt.usedOncePerTurn = true;
                            engine.retireCardFromSlot(sel[0].parentElement);
                            engine.addSlotBp(slot, 500);
                            rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                            showSysMsg('ジャイガー 本回合 BP+500 並獲得 [インパクト(1)]！');
                        }
                        done();
                    }
                });
            }
        },

        // バイラス (3費 BP 5000 2回アタック)：能源線移除場外12張［特徴：怪獣］或〈オリリウム〉移至前線
        'UA22BT/GMR-1-030': {
            canActivateMain(engine, cardEl, slot) {
                if (!slot.closest('#my-energy-line')) return false;
                const emptyFront = Array.from(document.querySelectorAll('#my-front-line .slot')).some(s => s.querySelectorAll('.card').length === 0);
                if (!emptyFront) return false;
                const pool = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                    const d = engine.getCardDef(c);
                    return d && ((d.traits && d.traits.includes('怪獣')) || (d.name && d.name.includes('オリリウム')));
                });
                return pool.length >= 12;
            },
            onActivateMain(engine, cardEl, slot, done) {
                const pool = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                    const d = engine.getCardDef(c);
                    return d && ((d.traits && d.traits.includes('怪獣')) || (d.name && d.name.includes('オリリウム')));
                });
                const emptyFront = Array.from(document.querySelectorAll('#my-front-line .slot')).find(s => s.querySelectorAll('.card').length === 0);
                if (pool.length < 12 || !emptyFront) { done(); return; }
                const remArea = document.getElementById('my-remove-area');
                pool.slice(0, 12).forEach(c => engine.moveCardToZone(c, remArea));
                Array.from(slot.querySelectorAll('.card')).forEach(c => emptyFront.appendChild(c));
                recalcStacking(emptyFront);
                showSysMsg('バイラス：已將場外 12 張怪獸／オリリウム移至移除區，並移動至前線！');
                done();
            }
        },

        // 藍事件：液状弾
        'UA22BT/GMR-1-033': {
            onEventPlay(engine, cardEl, done) {
                const oppFront = engine.getSlotTopCards('#opp-front-line .slot');
                const applyZygraBonus = () => {
                    if (engine.hasCharacterOnMyField('ジグラ')) {
                        document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                            const top = engine.getTopCardInSlot(slot);
                            if (top && engine.getEffectiveCardBp(top) >= 1500) engine.addSlotBp(slot, -1000);
                        });
                        showSysMsg('液状弾（ジグラ連動）：對手前線 BP1500 以上全體 BP-1000！');
                    }
                    done();
                };
                if (oppFront.length === 0) { applyZygraBonus(); return; }
                engine.promptModal({
                    title: '液状弾：選擇對手前線角色',
                    desc: '選擇最多 1 張對手前線角色轉為休息：',
                    cards: oppFront,
                    selectCount: 1,
                    upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            engine.requestRestOpponentCard(sel[0]);
                        }
                        applyZygraBonus();
                    }
                });
            }
        },

        // 藍事件：超振動ブレード（有ギロン時改為 BP5000 以下）
        'UA22BT/GMR-1-037': {
            onEventPlay(engine, cardEl, done) {
                const limit = engine.hasCharacterOnMyField('ギロン') ? 5000 : 3000;
                const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
                if (cands.length === 0) { showSysMsg(`對手前線無 BP${limit} 以下角色。`); done(); return; }
                engine.promptModal({
                    title: `超振動ブレード (BP${limit}以下)`,
                    desc: `選擇 1 張對手前線 BP${limit} 以下角色退場：`,
                    cards: cands,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) engine.requestRetireOpponentCard(sel[0]);
                        done();
                    }
                });
            }
        },

        // 藍事件：尾棘（場外＋移除區每張ジャイガー上限 +1000）
        'UA22BT/GMR-1-038': {
            onEventPlay(engine, cardEl, done) {
                let jaigerCnt = 0;
                document.querySelectorAll('#my-outside-area .card, #my-remove-area .card').forEach(c => {
                    if (engine.getCardDef(c)?.name?.includes('ジャイガー')) jaigerCnt++;
                });
                const limit = 1000 + jaigerCnt * 1000;
                const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
                if (cands.length === 0) { showSysMsg(`對手前線無 BP${limit} 以下角色。`); done(); return; }
                engine.promptModal({
                    title: `尾棘 (BP${limit}以下)`,
                    desc: `選擇 1 張對手前線 BP${limit} 以下角色退場：`,
                    cards: cands,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) engine.requestRetireOpponentCard(sel[0]);
                        done();
                    }
                });
            }
        },

        // ==================== 綠色：ガメラ 陸／海／空 與 子供軸 ====================

        // ボコ (3費 BP 2000)：前線起動棄1手牌，給予我方〈ガメラ〉[インパクト(+1)]
        'UA22BT/GMR-1-058': {
            canActivateMain(engine, cardEl, slot) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && !!slot.closest('#my-front-line') && document.querySelectorAll('#my-hand-area .card').length >= 1 && engine.hasCharacterOnMyField('ガメラ');
            },
            onActivateMain(engine, cardEl, slot, done) {
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                const gameras = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name?.includes('ガメラ'));
                engine.promptModal({
                    title: 'ボコ [起動メイン]：捨棄 1 張手牌',
                    desc: '選擇 1 張手牌放置於場外：',
                    cards: hand,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (disc) => {
                        if (disc.length === 0) { done(); return; }
                        engine.moveCardToZone(disc[0], document.getElementById('my-outside-area'));
                        engine.promptModal({
                            title: '選擇我方〈ガメラ〉',
                            desc: '選擇 1 張〈ガメラ〉本回合獲得 [インパクト(+1)]：',
                            cards: gameras,
                            selectCount: 1,
                            upTo: false,
                            onConfirm: (sel) => {
                                if (sel.length > 0) {
                                    engine.getRuntime(cardEl).usedOncePerTurn = true;
                                    const trt = engine.getRuntime(sel[0]);
                                    trt.tempKeywords.IMPACT_PLUS = (trt.tempKeywords.IMPACT_PLUS || 0) + 1;
                                    showSysMsg('已賦予〈ガメラ〉[インパクト(+1)]！');
                                }
                                done();
                            }
                        });
                    }
                });
            }
        },

        // ガメラ (5費 Raid 空)：登場若基底為［特徴：海］則抽2棄1
        'UA22BT/GMR-1-064': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const baseDef = getRaidBaseDef(engine, cardEl);
                if (baseDef && Array.isArray(baseDef.traits) && baseDef.traits.includes('海')) {
                    engine.drawCards(2);
                    engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
                } else {
                    done();
                }
            }
        },

        // ガメラ (4費 BP 4000)：未防禦且前線有［特徴：子供］時抽1張
        'UA22BT/GMR-1-065': {
            onUnblockedAttack(engine, cardEl, done) {
                if (countMyFrontTrait(engine, '子供') > 0) {
                    engine.drawCards(1);
                    showSysMsg('ガメラ：前線有［特徴：子供］且攻擊未被防禦，抽取 1 張牌！');
                }
                done();
            }
        },

        // ガメラ (5費 Raid 陸)：前線有子供時剝對手突襲，若基底為［特徴：空］可改退場 BP5000 以下
        'UA22BT/GMR-1-068': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                if (countMyFrontTrait(engine, '子供') === 0) { done(); return; }
                const baseDef = getRaidBaseDef(engine, cardEl);
                const fromSky = !!(baseDef && Array.isArray(baseDef.traits) && baseDef.traits.includes('空'));
                const opp5000 = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 5000);

                if (fromSky && opp5000.length > 0) {
                    engine.promptModal({
                        title: 'ガメラ [登場時]（空基底強化）',
                        desc: '選擇最多 1 張對手前線 BP5000 以下角色退場：',
                        cards: opp5000,
                        selectCount: 1,
                        upTo: true,
                        onConfirm: (sel) => {
                            if (sel.length > 0) engine.requestRetireOpponentCard(sel[0]);
                            done();
                        }
                    });
                } else {
                    showSysMsg('ガメラ [登場時]：請將對手前線 1 張突襲角色最上層移至場外。');
                    done();
                }
            }
        },

        // ガメラ (10費 Raid BP 5000)：陸基底減2費、衝擊(2)、前線每張子供給予 [ダメージ(+1)]
        'UA22BT/GMR-1-072': {
            getEnergyDiscount(engine) {
                const hasLand = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => {
                    const d = engine.getCardDef(c);
                    return d && d.name && d.name.includes('ガメラ') && Array.isArray(d.traits) && d.traits.includes('陸');
                });
                return hasLand ? 2 : 0;
            },
            onAttack(engine, cardEl, done) {
                const kids = countMyFrontTrait(engine, '子供');
                if (kids > 0) {
                    const rt = engine.getRuntime(cardEl);
                    rt.tempKeywords.DAMAGE_PLUS = (rt.tempKeywords.DAMAGE_PLUS || 0) + kids;
                    showSysMsg(`ガメラ：前線有 ${kids} 張［特徴：子供］，本回合 [ダメージ(+${kids})]！`);
                }
                done();
            }
        },
        'UAPR/GMR-1-072': {
            getEnergyDiscount(engine) {
                return window.UACardScripts['UA22BT/GMR-1-072'].getEnergyDiscount(engine);
            },
            onAttack(engine, cardEl, done) {
                return window.UACardScripts['UA22BT/GMR-1-072'].onAttack(engine, cardEl, done);
            }
        },

        // 綠事件：火焔旋撃
        'UA22BT/GMR-1-076': {
            onEventPlay(engine, cardEl, done) {
                const gameras = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name?.includes('ガメラ'));
                if (gameras.length === 0) { done(); return; }
                engine.promptModal({
                    title: '火焔旋撃：選擇我方〈ガメラ〉',
                    desc: '選擇 1 張〈ガメラ〉本回合 BP+1000（若為［特徴：空］再抽 1 張並獲得 [狙い撃ち]）：',
                    cards: gameras,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            const t = sel[0];
                            engine.addSlotBp(t.parentElement, 1000);
                            const d = engine.getCardDef(t);
                            if (d && Array.isArray(d.traits) && d.traits.includes('空')) {
                                engine.drawCards(1);
                                engine.getRuntime(t).tempKeywords.SNIPE = 1;
                                showSysMsg('火焔旋撃（空連動）：抽 1 張並賦予 [狙い撃ち]！');
                            }
                        }
                        done();
                    }
                });
            }
        },

        // 綠事件：火焔弾
        'UA22BT/GMR-1-077': {
            onEventPlay(engine, cardEl, done) {
                const limit = engine.hasCharacterOnMyField('ガメラ') ? 5000 : 2000;
                const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
                const afterRetire = () => {
                    if (countMyFrontTrait(engine, '海') > 0) {
                        engine.executeAbilityActions(cardEl, [{ type: 'LOOK_AND_ARRANGE_TOP', count: 1, keepUpTo: 1, remainderTo: 'OUTSIDE' }], 0, { selectedTargets: [], addedFromLook: false }, done);
                    } else {
                        done();
                    }
                };
                if (cands.length === 0) { showSysMsg(`對手前線無 BP${limit} 以下角色。`); afterRetire(); return; }
                engine.promptModal({
                    title: `火焔弾 (BP${limit}以下)`,
                    desc: `選擇 1 張對手前線 BP${limit} 以下角色退場：`,
                    cards: cands,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) engine.requestRetireOpponentCard(sel[0]);
                        afterRetire();
                    }
                });
            }
        },

        // 綠事件：ガメラとの絆
        'UA22BT/GMR-1-078': {
            onEventPlay(engine, cardEl, done) {
                const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
                if (myChars.length === 0) { done(); return; }
                engine.promptModal({
                    title: 'ガメラとの絆',
                    desc: '選擇 1 張我方角色轉為活動（若為〈ガメラ〉再將 1 張 AP 卡轉為活動）：',
                    cards: myChars,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            sel[0].classList.remove('rest');
                            if (engine.getCardDef(sel[0])?.name?.includes('ガメラ')) {
                                engine.activateMyApCards(1);
                            }
                        }
                        done();
                    }
                });
            }
        },

        // 綠事件：燼滅手
        'UA22BT/GMR-1-080': {
            onEventPlay(engine, cardEl, done) {
                const oppFront = engine.getSlotTopCards('#opp-front-line .slot');
                if (oppFront.length === 0) { done(); return; }
                const toRemove = countMyFrontTrait(engine, '陸') > 0;
                engine.promptModal({
                    title: `燼滅手（${toRemove ? '移至移除區' : '退場'}）`,
                    desc: `選擇 1 張對手前線角色${toRemove ? '移至移除區' : '退場'}：`,
                    cards: oppFront,
                    selectCount: 1,
                    upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length > 0) {
                            const t = sel[0];
                            if (toRemove) {
                                engine.requestRemoveOpponentCard(t);
                            } else {
                                engine.requestRetireOpponentCard(t);
                            }
                        }
                        done();
                    }
                });
            }
        }
    });
})();
