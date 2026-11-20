/**
 * Union Arena 卡片腳本 DLC：香格里拉·開拓異境 (Shangri-La Frontier) [SNF]
 * 涵蓋：綠（サンラク／エムル／サイガ-0＆サイガ-100 大事件減費軸）、紅（アーサー・ペンシルゴン）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const retireOppFront = (engine, title, limit, onDone) => {
        const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
        if (!cands.length) { showSysMsg(`對手前線無 BP${limit} 以下角色。`); onDone(); return; }
        engine.promptModal({
            title: `${title} (BP${limit}以下)`, desc: `選擇最多 1 張對手前線 BP${limit} 以下角色退場：`,
            cards: cands, selectCount: 1, upTo: true,
            onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); onDone(); }
        });
    };

    window.registerCardScripts({
        // ==================== 綠色：サンラク／サイガ-0 ====================
        'UA32BT/SNF-1-001': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA32BT/SNF-1-005': { getContinuousBpBonus: (engine) => !engine.isMyTurn ? -1000 : 0 },
        'UA32BT/SNF-1-024': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                if (engine.usedEventThisTurn) retireOppFront(engine, 'サイガ-0 [アタック時]', 2000, done);
                else done();
            }
        },
        'UA32BT/SNF-1-032': {
            onEventPlay(engine, cardEl, done) {
                retireOppFront(engine, '最大火力', 99999, () => {
                    document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                        const top = engine.getTopCardInSlot(slot);
                        if (top && engine.getEffectiveCardBp(top) >= 1500) engine.addSlotBp(slot, -1000);
                    });
                    done();
                });
            }
        },
        'UA32BT/SNF-1-033': {
            onEventPlay(engine, cardEl, done) {
                engine.drawCards(2);
                engine.pendingApDiscounts.push({ amount: 1, desc: '神魔の大剣 (非神魔の大剣 AP-1)', matchFn: (d) => !(d?.name || '').includes('神魔の大剣') });
                const saigas = myFieldTops(engine).filter(c => engine.getCardDef(c)?.name?.includes('サイガ-0'));
                if (!saigas.length) { done(); return; }
                engine.promptModal({
                    title: '神魔の大剣', desc: '選擇最多 1 張〈サイガ-0〉本回合獲得 [ダメージ(2)]：',
                    cards: saigas, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.getRuntime(sel[0]).tempKeywords.DAMAGE = Math.max(engine.getRuntime(sel[0]).tempKeywords.DAMAGE || 0, 2); done(); }
                });
            }
        },
        'UA32BT/SNF-1-036': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, 'スパイラルエッジ', engine.hasCharacterOnMyField('サンラク') ? 5000 : 3000, done)
        },

        // ==================== 紅色 ====================
        'UA32BT/SNF-1-042': {
            onPlay(engine, cardEl, done) {
                myFieldTops(engine).forEach(c => engine.addSlotBp(c.parentElement, 500));
                done();
            }
        }
    });
})();
