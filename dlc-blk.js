/**
 * Union Arena 卡片腳本 DLC：藍色監獄 (Blue Lock) [BLK]
 * 涵蓋：藍（潔世一／蜂楽廻／國神錬介 チームZ 墊底軸）、黃（凪誠士郎＆御影玲王／馬狼照英／潔世一）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));
    const hasUnder = (cardEl) =>
        cardEl?.parentElement ? Array.from(cardEl.parentElement.querySelectorAll('.card')).some(c => c !== cardEl && c.classList.contains('is-flipped')) : false;

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
        // ==================== 藍色：チームZ ====================
        'UA12BT/BLK-1-060': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'RED']) ? 1 : 0 },
        'UA12ST/BLK-1-107': {
            getEnergyDiscount: (engine) => myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('チームZ')).length >= 5 ? 1 : 0
        },
        'UA12BT/BLK-1-039': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
                done();
            }
        },
        'UA12BT/BLK-1-059': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2000;
                const others = myFieldTops(engine).filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('チームZ')).length;
                if (others >= 5) {
                    document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                        const top = engine.getTopCardInSlot(slot);
                        if (top && engine.getEffectiveCardBp(top) >= 1500) engine.addSlotBp(slot, -1000);
                    });
                }
                done();
            }
        },
        'UA12ST/BLK-1-065': {
            onEventPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 5000);
                if (!opp.length) { showSysMsg('對手前線無 BP5000 以下角色。'); done(); return; }
                const retire = engine.hasCharacterOnMyField('潔 世一');
                engine.promptModal({
                    title: `直撃蹴弾（${retire ? '退場' : '彈回手牌'}）`, desc: `選擇 1 張對手前線 BP5000 以下角色${retire ? '退場' : '退回手牌'}：`,
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => { if (sel.length) retire ? engine.requestRetireOpponentCard(sel[0]) : engine.requestBounceOpponentCard(sel[0]); done(); }
                });
            }
        },
        'UA12BT/BLK-1-063': {
            onEventPlay(engine, cardEl, done) {
                const blues = engine.getSlotTopCards('#my-front-line .slot').filter(c => engine.getCardDef(c)?.color === 'BLUE');
                if (!blues.length) { done(); return; }
                engine.promptModal({
                    title: '成功の方程式', desc: '選擇前線 1 張藍色角色 BP+2000（若有墊底卡再獲 [インパクト(+1)]）：',
                    cards: blues, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.addSlotBp(sel[0].parentElement, 2000);
                            if (hasUnder(sel[0])) { const rt = engine.getRuntime(sel[0]); rt.tempKeywords.IMPACT_PLUS = (rt.tempKeywords.IMPACT_PLUS || 0) + 1; }
                        }
                        done();
                    }
                });
            }
        },

        // ==================== 黃色：凪＆玲王／馬狼 ====================
        'UA12BT/BLK-1-016': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'RED']) ? 1 : 0 },
        'UA12BT/BLK-1-004': { requireRaided: true, getContinuousBpBonus: (engine, cardEl) => hasUnder(cardEl) ? 1000 : 0 },
        'UA12BT/BLK-1-022': { requireRaided: true, getContinuousBpBonus: (engine, cardEl) => hasUnder(cardEl) ? 1000 : 0 },
        'UA12BT/BLK-1-031': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, 'UA12BT/BLK-1-031', engine.hasCharacterOnMyField('凪 誠士郎') ? 5000 : 3000, done)
        }
    });
})();
