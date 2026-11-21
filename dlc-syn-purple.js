/**
 * Union Arena 卡片腳本 DLC：奇異賢伴 黑色天使 - 紫色 (SYN-PURPLE)
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const countMyTrait = (engine, trait, excludeEl = null) =>
        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes(trait)).length;

    window.registerCardScripts({
        // デコ (3費)：對手有黃或赤減 1 費
        'UA16BT/SYN-1-034': {
            getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'RED']) ? 1 : 0
        },

        // マリア (3費)：登場二選一（場外回收メイガス/クレイドルコフィン OR 抽2棄1）
        'UA16BT/SYN-1-036': {
            onPlay(engine, cardEl, done) {
                const outCands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                    const t = engine.getCardDef(c)?.traits || [];
                    return t.includes('メイガス') || t.includes('クレイドルコフィン');
                });
                engine.promptModal({
                    title: 'マリア [登場時]：二選一',
                    desc: '請選擇要發動的效果：',
                    cards: [cardEl],
                    customButtons: [
                        {
                            label: '從場外回收 1 張メイガス／クレイドルコフィン', color: '#6c93c7',
                            onClick: () => {
                                if (!outCands.length) { showSysMsg('場外無符合卡片。'); done(); return; }
                                engine.promptModal({
                                    title: '選擇回收卡片', desc: '選擇最多 1 張加入手牌：', cards: outCands, selectCount: 1, upTo: true,
                                    onConfirm: (sel) => { if (sel.length) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); done(); }
                                });
                            }
                        },
                        {
                            label: '抽 2 張，棄 1 張手牌', color: '#4f9678',
                            onClick: () => {
                                engine.drawCards(2);
                                engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
                            }
                        }
                    ]
                });
            }
        },

        // ヴァイスハイト (6費 BP 5000)：場上其他イデアール4張以上得衝擊(1)；起動退場シエル並從場外回收シエル
        'UA16BT/SYN-1-039': {
            getContinuousImpact: (engine, cardEl) => countMyTrait(engine, 'イデアール', cardEl) >= 4 ? 1 : 0,
            canActivateMain(engine, cardEl, slot) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && !!slot.closest('#my-front-line') && engine.hasCharacterOnMyField('シエル');
            },
            onActivateMain(engine, cardEl, slot, done) {
                const ciels = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => engine.getCardDef(c)?.name?.includes('シエル'));
                engine.promptModal({
                    title: 'ヴァイスハイト [起動メイン]',
                    desc: '選擇場上 1 張〈シエル〉退場，從場外回收 1 張〈シエル〉至手牌：',
                    cards: ciels, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (!sel.length) { done(); return; }
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        engine.retireCardFromSlot(sel[0].parentElement);
                        const outCiels = Array.from(document.querySelectorAll('#my-outside-area .card'))
                            .filter(c => engine.getCardDef(c)?.name?.includes('シエル'));
                        if (!outCiels.length) { done(); return; }
                        engine.promptModal({
                            title: '選擇場外〈シエル〉', desc: '選擇最多 1 張加入手牌：', cards: outCiels, selectCount: 1, upTo: true,
                            onConfirm: (pick) => { if (pick.length) engine.moveCardToZone(pick[0], document.getElementById('my-hand-area')); done(); }
                        });
                    }
                });
            }
        },

        // 黒仮面 (4費 BP 4000)：攻擊時可棄1手牌降對手前線 BP-2000，自身下回合凍結
        'UA16BT/SYN-1-043': {
            onAttack(engine, cardEl, done) {
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (!hand.length || !opp.length) { done(); return; }
                engine.promptModal({
                    title: '黒仮面 [アタック時]',
                    desc: '是否棄 1 張手牌，令對手前線 1 張角色 BP-2000（自身下次無法轉活動）？',
                    cards: hand, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (!sel.length) { done(); return; }
                        engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                        engine.getRuntime(cardEl).frozenNextTurn = true;
                        engine.promptModal({
                            title: '選擇降 BP 目標', desc: '選擇對手前線最多 1 張角色 BP-2000：', cards: opp, selectCount: 1, upTo: true,
                            onConfirm: (t) => { if (t.length) engine.addSlotBp(t[0].parentElement, -2000); done(); }
                        });
                    }
                });
            }
        },

        // ギルボウ (5費 Raid)：登場有シュネー二選一（BP-3000 OR 橫置）；攻擊時可自凍得衝擊(1)
        'UA16BT/SYN-1-053': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (!engine.hasCharacterOnMyField('シュネー') || !opp.length) { done(); return; }
                engine.promptModal({
                    title: 'ギルボウ [登場時]：二選一',
                    desc: '場上有〈シュネー〉，請選擇要發動的效果：',
                    cards: [cardEl],
                    customButtons: [
                        {
                            label: '對手前線 1 張 BP-3000', color: '#c1596f',
                            onClick: () => engine.promptModal({
                                title: '選擇 BP-3000 目標', desc: '選擇最多 1 張：', cards: opp, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length) engine.addSlotBp(sel[0].parentElement, -3000); done(); }
                            })
                        },
                        {
                            label: '對手前線 1 張轉為休息', color: '#8d7cc4',
                            onClick: () => engine.promptModal({
                                title: '選擇休息目標', desc: '選擇最多 1 張：', cards: opp, selectCount: 1, upTo: true,
                                onConfirm: (sel) => {
                                    if (sel.length) engine.requestRestOpponentCard(sel[0]);
                                    done();
                                }
                            })
                        }
                    ]
                });
            },
            onAttack(engine, cardEl, done) {
                engine.promptModal({
                    title: 'ギルボウ [アタック時]',
                    desc: '是否讓此卡本回合獲得 [インパクト(1)]？（代價：下次不會轉為活動）',
                    cards: [cardEl],
                    customButtons: [
                        {
                            label: '獲得 [インパクト(1)] 並凍結自身', color: '#c1596f',
                            onClick: () => {
                                const rt = engine.getRuntime(cardEl);
                                rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                                rt.frozenNextTurn = true;
                                done();
                            }
                        },
                        { label: '不發動', color: '#7f8c8d', onClick: () => done() }
                    ]
                });
            }
        },

        // シエル (3費 BP 3000)：退場時二選一（抽2棄1 OR 抽1且我方回合回1AP）
        'UA16BT/SYN-1-057': {
            onRetire(engine, cardEl, done) {
                engine.promptModal({
                    title: 'シエル [退場時]：二選一',
                    desc: '請選擇要發動的效果：',
                    cards: [cardEl],
                    customButtons: [
                        {
                            label: '抽 2 張，棄 1 張手牌', color: '#4f9678',
                            onClick: () => {
                                engine.drawCards(2);
                                engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
                            }
                        },
                        {
                            label: '抽 1 張（我方回合再將 1 張 AP 轉活動）', color: '#6c93c7',
                            onClick: () => {
                                engine.drawCards(1);
                                if (engine.isMyTurn) engine.activateMyApCards(1);
                                done();
                            }
                        }
                    ]
                });
            }
        },

        // 紫事件：一攫千金（公開3張，必要能源全同或連號全拿，否則拿1張）
        'UA16BT/SYN-1-062': {
            onEventPlay(engine, cardEl, done) {
                const deckArea = document.getElementById('my-deck-area');
                const all = Array.from(deckArea.querySelectorAll('.card'));
                const top3 = all.slice(Math.max(0, all.length - 3)).reverse();
                if (!top3.length) { done(); return; }
                const costs = top3.map(c => engine.getCardDef(c)?.requiredEnergy?.count || 0).sort((a, b) => a - b);
                const jackpot = top3.length === 3 && ((costs[0] === costs[1] && costs[1] === costs[2]) || (costs[0] + 1 === costs[1] && costs[1] + 1 === costs[2]));
                if (jackpot) {
                    const hand = document.getElementById('my-hand-area');
                    top3.forEach(c => engine.moveCardToZone(c, hand));
                    showSysMsg(`一攫千金大成功（費用 ${costs.join('/')}）！3 張全部加入手牌！`);
                    done();
                } else {
                    engine.promptModal({
                        title: `一攫千金（費用 ${costs.join('/')}）`,
                        desc: '請選擇 1 張加入手牌，其餘置於牌底：',
                        cards: top3, selectCount: 1, upTo: false,
                        onConfirm: (sel) => {
                            const hand = document.getElementById('my-hand-area');
                            sel.forEach(c => engine.moveCardToZone(c, hand));
                            const rest = top3.filter(c => !sel.includes(c));
                            engine.promptOrderCardsToDeck(rest, 'BOTTOM', done);
                        }
                    });
                }
            }
        },

        // 紫事件：エネルギー・インパクト・ブレード
        'UA16BT/SYN-1-063': {
            onEventPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (!opp.length) { done(); return; }
                const debuff = ((engine.hasCharacterOnMyField('黒仮面') || engine.hasCharacterOnMyField('ギルボウ')) && engine.hasCharacterOnMyField('シュネー')) ? -5000 : -3000;
                engine.promptModal({
                    title: `エネルギー・インパクト・ブレード (BP${debuff})`,
                    desc: `選擇 1 張對手前線角色 BP${debuff}：`,
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => { if (sel.length) engine.addSlotBp(sel[0].parentElement, debuff); done(); }
                });
            }
        },

        // 紫事件：ランナーズハイ
        'UA16BT/SYN-1-065': {
            onEventPlay(engine, cardEl, done) {
                const hasCore = (engine.hasCharacterOnMyField('トキオ') || engine.hasCharacterOnMyField('白仮面') || engine.hasCharacterOnMyField('ジョンガスメーカー') || engine.hasCharacterOnMyField('ボーンドウル')) && engine.hasCharacterOnMyField('ムートン');
                const limit = hasCore ? 5000 : 3000;
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
                const askCycle = () => {
                    const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                    if (!hand.length) { done(); return; }
                    engine.promptModal({
                        title: 'ランナーズハイ：追加濾牌', desc: '是否棄 1 張手牌並抽 1 張？', cards: hand, selectCount: 1, upTo: true,
                        onConfirm: (sel) => {
                            if (sel.length) { engine.moveCardToZone(sel[0], document.getElementById('my-outside-area')); engine.drawCards(1); }
                            done();
                        }
                    });
                };
                if (!opp.length) { askCycle(); return; }
                engine.promptModal({
                    title: `ランナーズハイ (BP${limit}以下)`, desc: `選擇最多 1 張對手前線 BP${limit} 以下角色退場：`, cards: opp, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); askCycle(); }
                });
            }
        }
    });
})();
