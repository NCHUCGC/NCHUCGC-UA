/**
 * Union Arena 卡片腳本 DLC：防風少年 (WIND BREAKER) [WBK]
 * 涵蓋：黃（獅子頭連 兎耳山丁子＆十亀条 墓地無角色軸／ボウフウリン 梅宮一＆桜遥＆杉下京太郎）、綠（桜遥／蘇枋隼飛／柘浦大河）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const noCharInOutside = (engine) =>
        !Array.from(document.querySelectorAll('#my-outside-area .card')).some(c => engine.getCardDef(c)?.type === 'CHARACTER');

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
        // ==================== 黃色：獅子頭連／ボウフウリン ====================
        'UA38BT/WBK-1-007': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0,
            onAttack(engine, cardEl, done) {
                const hasHiiragi = engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name?.includes('柊 登馬'));
                if (hasHiiragi || noCharInOutside(engine)) engine.drawCards(1);
                done();
            }
        },
        'UA38BT/WBK-1-011': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && noCharInOutside(engine)) ? 500 : 0
        },
        'UA38BT/WBK-1-012': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                    const top = engine.getTopCardInSlot(slot);
                    if (top && engine.getEffectiveCardBp(top) >= 1500) engine.addSlotBp(slot, -1000);
                });
                done();
            }
        },
        'UA38BT/WBK-1-015': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0,
            onPlay(engine, cardEl, done) {
                if (noCharInOutside(engine) && !engine.usedNamedAbilityThisTurn.has('WBK_TOMIYAMA_ACT')) {
                    engine.usedNamedAbilityThisTurn.add('WBK_TOMIYAMA_ACT');
                    cardEl.classList.remove('rest');
                }
                done();
            }
        },
        'UA38BT/WBK-1-017': {
            requireRaided: true,
            getContinuousImpact: (engine) => noCharInOutside(engine) ? 1 : 0
        },
        'UA38BT/WBK-1-029': {
            requireRaided: true,
            onPlay(engine, cardEl, done) { engine.addSlotBp(cardEl.parentElement, 1000); done(); }
        },
        'UA38BT/WBK-1-035': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('ボウフウリン')).length;
                retireOppFront(engine, `オレは100％負けない（${cnt} 張）`, cnt * 1000, done);
            }
        },
        'UA38BT/WBK-1-036': {
            onEventPlay(engine, cardEl, done) {
                engine.pendingApDiscounts.push({ amount: 1, desc: 'クズがいていい場所じゃない (獅子頭連 AP-1)', matchFn: (d) => d?.traits?.includes('獅子頭連') });
                const out = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.traits?.includes('獅子頭連'));
                const finish = () => { if (noCharInOutside(engine)) engine.drawCards(1); done(); };
                if (!out.length) { finish(); return; }
                engine.promptModal({
                    title: 'クズがいていい場所じゃない', desc: '將場外最多 2 張［特徴：獅子頭連］移至移除區：',
                    cards: out, selectCount: Math.min(2, out.length), upTo: true,
                    onConfirm: (sel) => {
                        const rem = document.getElementById('my-remove-area');
                        sel.forEach(c => engine.moveCardToZone(c, rem));
                        finish();
                    }
                });
            }
        },
        'UA38BT/WBK-1-040': { onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '全部いらない', 5000, done) },

        // ==================== 綠色：ボウフウリン ====================
        'UA38BT/WBK-1-067': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 }
    });
})();
