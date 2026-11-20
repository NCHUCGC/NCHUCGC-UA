/**
 * Union Arena 卡片腳本 DLC：鐵拳 7 (Tekken 7) [TKN]
 * 涵蓋：紅（三島一八 墊底／三島平八）、藍（アリサ／ラース／キング／巌竜）、紫（風間飛鳥＆リリ／ニーナ）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));
    const countUnder = (cardEl) =>
        cardEl?.parentElement ? Array.from(cardEl.parentElement.querySelectorAll('.card')).filter(c => c !== cardEl && c.classList.contains('is-flipped')).length : 0;

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
        // ==================== 紅色：三島家 ====================
        'UA13ST/TKN-1-103': { onAttack(engine, cardEl, done) { engine.drawCards(1); done(); } },
        'UA13ST/TKN-1-107': {
            requireRaided: true,
            getContinuousBpBonus: (engine, cardEl) => engine.isMyTurn ? countUnder(cardEl) * 500 : 0
        },
        'UA13ST/TKN-1-097': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '地獄へ送ってやろう！', engine.hasCharacterOnMyField('三島 一八') ? 5000 : 3000, done)
        },

        // ==================== 藍色：ヴァイオレット・システムズ／プロレス ====================
        'UA13BT/TKN-1-002': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'RED']) ? 1 : 0 },
        'UA13BT/TKN-1-003': { getContinuousBpBonus: (engine) => engine.isMyTurn ? 1500 : 0 },
        'UA13BT/TKN-1-007': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name?.includes('キング'))) ? 500 : 0
        },
        'UA13BT/TKN-1-023': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0,
            onPlay(engine, cardEl, done) {
                document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                    const top = engine.getTopCardInSlot(slot);
                    if (top && engine.getEffectiveCardBp(top) >= 1500) engine.addSlotBp(slot, -1000);
                });
                done();
            }
        },
        'UA13BT/TKN-1-032': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('ヴァイオレット・システムズ')).length;
                retireOppFront(engine, `排除します！（${cnt} 張）`, cnt * 1000, done);
            }
        },

        // ==================== 紫色：三島財閥／飛鳥＆リリ ====================
        'UA13BT/TKN-1-048': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'RED']) ? 1 : 0 },
        'UA13BT/TKN-1-039': {
            requireRaided: true,
            onPlay(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1); done(); }
        },
        'UA13BT/TKN-1-045': {
            requireRaided: true,
            onAttack(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2000; done(); }
        }
    });
})();
