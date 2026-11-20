/**
 * Union Arena 卡片腳本 DLC：奇異賢伴 黑色天使 - 紅色 (SYN-RED)
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const retireOppFront = (engine, title, limit, onDone) => {
        const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
        if (!cands.length) { showSysMsg(`對手前線無 BP${limit} 以下角色。`); onDone(); return; }
        engine.promptModal({
            title: `${title} (BP${limit}以下)`,
            desc: `選擇最多 1 張對手前線 BP${limit} 以下角色退場：`,
            cards: cands, selectCount: 1, upTo: true,
            onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); onDone(); }
        });
    };

    window.registerCardScripts({
        // マリア (3費)：對手場上有黃或紫減 1 費
        'UA16BT/SYN-1-067': {
            getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'PURPLE']) ? 1 : 0
        },

        // グレンシノビ (5費 Raid)：攻擊時有フラム可棄 2 手牌退場對手前線（依玩家選擇）
        'UA16BT/SYN-1-070': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                if (!engine.hasCharacterOnMyField('フラム') || hand.length < 2) { done(); return; }
                engine.promptModal({
                    title: 'グレンシノビ [アタック時]',
                    desc: '是否將 2 張手牌放置於場外，退場對手前線 1 張角色？',
                    cards: hand, selectCount: 2, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length < 2) { done(); return; }
                        const out = document.getElementById('my-outside-area');
                        sel.forEach(c => engine.moveCardToZone(c, out));
                        const opp = engine.getSlotTopCards('#opp-front-line .slot');
                        if (!opp.length) { done(); return; }
                        engine.promptModal({
                            title: '選擇退場目標（依本回合抽牌數×1000以下）',
                            desc: '請選擇最多 1 張對手前線角色退場：',
                            cards: opp, selectCount: 1, upTo: true,
                            onConfirm: (t) => { if (t.length) engine.requestRetireOpponentCard(t[0]); done(); }
                        });
                    }
                });
            }
        },

        // デイジーオーガ (3費 Raid)：登場 BP+500；起動付 1AP 再發動登場時
        'UA16BT/SYN-1-071': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.addSlotBp(cardEl.parentElement, 500);
                if (engine.hasCharacterOnMyField('シエル')) showSysMsg('デイジーオーガ：場上有〈シエル〉，可指定對手前線 1 張角色本回合無法攻擊與防禦。');
                done();
            },
            canActivateMain(engine, cardEl, slot) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && !rt.enteredThisTurn && !!slot.closest('#my-front-line') && engine.getActiveApCards().length >= 1;
            },
            onActivateMain(engine, cardEl, slot, done) {
                if (!engine.payAp(1)) { done(); return; }
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                engine.addSlotBp(slot, 500);
                showSysMsg('デイジーオーガ [起動メイン]：再發動登場效果，本回合 BP+500！');
                done();
            }
        },

        // デイジーオーガアルター (5費 Raid)：登場退場 BP2000 以下，可將場上ミステル墊底改為 BP4000 以下；退場時墊底卡全回手
        'UA16BT/SYN-1-072': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const mistels = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => c !== cardEl && engine.getCardDef(c)?.name?.includes('ミステル'));
                if (!mistels.length) { retireOppFront(engine, 'デイジーオーガアルター', 2000, done); return; }
                engine.promptModal({
                    title: 'デイジーオーガアルター [登場時]',
                    desc: '是否將場上 1 張〈ミステル〉裏側墊於此卡下方，使退場範圍提升為 BP4000 以下？',
                    cards: mistels, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        let limit = 2000;
                        if (sel.length) {
                            const slot = cardEl.parentElement;
                            const m = sel[0];
                            slot.insertBefore(m, slot.firstChild);
                            m.classList.add('is-flipped'); m.classList.remove('rest');
                            recalcStacking(slot);
                            limit = 4000;
                        }
                        retireOppFront(engine, 'デイジーオーガアルター', limit, done);
                    }
                });
            },
            onRetire(engine, cardEl, done) {
                showSysMsg('デイジーオーガアルター [退場時]：請將原本裏側墊底的卡片加入手牌。');
                done();
            }
        },

        // カナタ (4費 BP 4000)：前線起動給予我方〈デイジーオーガ〉／〈デイジーオーガアルター〉[インパクト(+1)]
        'UA16BT/SYN-1-077': {
            canActivateMain(engine, cardEl, slot) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && !!slot.closest('#my-front-line') &&
                    (engine.hasCharacterOnMyField('デイジーオーガ') || engine.hasCharacterOnMyField('デイジーオーガアルター'));
            },
            onActivateMain(engine, cardEl, slot, done) {
                const targets = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => /デイジーオーガ/.test(engine.getCardDef(c)?.name || ''));
                engine.promptModal({
                    title: 'カナタ [起動メイン]',
                    desc: '選擇 1 張〈デイジーオーガ〉系角色本回合獲得 [インパクト(+1)]：',
                    cards: targets, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.getRuntime(cardEl).usedOncePerTurn = true;
                            const trt = engine.getRuntime(sel[0]);
                            trt.tempKeywords.IMPACT_PLUS = (trt.tempKeywords.IMPACT_PLUS || 0) + 1;
                            showSysMsg('已賦予 [インパクト(+1)]！');
                        }
                        done();
                    }
                });
            }
        },

        // フラム (3費 BP 3000)：登場當回合起動，棄1手牌＋付1AP，退場對手前線 BP3000 以下並抽1
        'UA16BT/SYN-1-089': {
            canActivateMain(engine, cardEl) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && rt.enteredThisTurn &&
                    engine.getActiveApCards().length >= 1 &&
                    document.querySelectorAll('#my-hand-area .card').length >= 1;
            },
            onActivateMain(engine, cardEl, slot, done) {
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                engine.promptModal({
                    title: 'フラム [起動メイン]：捨棄 1 張手牌',
                    desc: '選擇 1 張手牌放置於場外（同時支付 1 AP）：',
                    cards: hand, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (!sel.length || !engine.payAp(1)) { done(); return; }
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                        retireOppFront(engine, 'フラム', 3000, () => {
                            engine.drawCards(1);
                            showSysMsg('フラム：我方抽 1 張（請通知對手抽 1 張，若有グレンシノビ則改由我方再抽 1 張）。');
                            done();
                        });
                    }
                });
            }
        },

        // ミステル (3費 BP 3000)：攻擊時二選一（BP+1000 OR 棄1手退場BP1500以下）
        'UA16BT/SYN-1-092': {
            onAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                if (rt.usedOncePerTurn) { done(); return; }
                rt.usedOncePerTurn = true;
                engine.promptModal({
                    title: 'ミステル [アタック時]：二選一',
                    desc: '請選擇要發動的效果：',
                    cards: [cardEl],
                    customButtons: [
                        { label: '自身本回合 BP+1000', color: '#4f9678', onClick: () => { engine.addSlotBp(cardEl.parentElement, 1000); done(); } },
                        {
                            label: '棄 1 手牌退場對手前線 BP1500 以下 1 張', color: '#c1596f',
                            onClick: () => {
                                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                                if (!hand.length) { done(); return; }
                                engine.promptModal({
                                    title: '選擇捨棄手牌', desc: '選擇 1 張手牌放置於場外：', cards: hand, selectCount: 1, upTo: true,
                                    onConfirm: (sel) => {
                                        if (!sel.length) { done(); return; }
                                        engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                                        retireOppFront(engine, 'ミステル', 1500, done);
                                    }
                                });
                            }
                        }
                    ]
                });
            }
        },
        'UAPR/SYN-1-092': {
            onAttack: (e, c, d) => window.UACardScripts['UA16BT/SYN-1-092'].onAttack(e, c, d)
        },

        // 紅事件：この熱はあなたがくれたもの
        'UA16BT/SYN-1-094': {
            onEventPlay(engine, cardEl, done) {
                const canRetire = (engine.hasCharacterOnMyField('カナタ') || engine.hasCharacterOnMyField('デイジーオーガ')) && engine.hasCharacterOnMyField('シエル');
                if (canRetire) {
                    retireOppFront(engine, 'この熱はあなたがくれたもの（退場強化）', 5000, done);
                } else {
                    showSysMsg('この熱はあなたがくれたもの：選擇對手前線 BP5000 以下 1 張角色，本回合無法防禦。');
                    done();
                }
            }
        },

        // 紅事件：高い授業料
        'UA16BT/SYN-1-096': {
            onEventPlay(engine, cardEl, done) {
                const hasCore = engine.hasCharacterOnMyField('クラウディア') || engine.hasCharacterOnMyField('フラム') || engine.hasCharacterOnMyField('グレンシノビ');
                engine.drawCards(hasCore ? 2 : 1);
                showSysMsg(hasCore ? '高い授業料：抽 2 張（本回合原應由對手抽牌的效果改由我方抽牌）！' : '高い授業料：抽 1 張！');
                done();
            }
        },

        // 紅事件：メラメラバッキューン
        'UA16BT/SYN-1-099': {
            onEventPlay(engine, cardEl, done) {
                const limit = ((engine.hasCharacterOnMyField('クラウディア') || engine.hasCharacterOnMyField('グレンシノビ')) && engine.hasCharacterOnMyField('フラム')) ? 5000 : 2500;
                retireOppFront(engine, 'メラメラバッキューン', limit, () => {
                    engine.drawCards(1);
                    engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
                });
            }
        },

        // 紅事件：雷光の槍
        'UA16BT/SYN-1-100': {
            onEventPlay(engine, cardEl, done) {
                const limit = ((engine.hasCharacterOnMyField('カナタ') || engine.hasCharacterOnMyField('デイジーオーガアルター')) && engine.hasCharacterOnMyField('ミステル')) ? 5000 : 3000;
                retireOppFront(engine, '雷光の槍', limit, () => {
                    engine.executeAbilityActions(cardEl, [{ type: 'LOOK_AND_ARRANGE_TOP', count: 1, keepUpTo: 1, remainderTo: 'BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, done);
                });
            }
        }
    });
})();
