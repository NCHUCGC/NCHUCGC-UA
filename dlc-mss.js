/**
 * Union Arena 卡片腳本 DLC：魔都精兵的奴隸 (Chained Soldier) [MSS]
 * 涵蓋：黃（羽前京香＆和倉優希 無窮の鎖／七番組 異名4+ 東日万凛＆駿河朱々）、綠（醜鬼 和倉青羽／東八千穂／出雲天花）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const countUniqueUnit7 = (engine) => {
        const s = new Set();
        myFieldTops(engine).forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.traits?.includes('七番組') && d.name) s.add(d.name);
        });
        return s.size;
    };

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
        // ==================== 黃色：七番組／無窮の鎖 ====================
        'UA49BT/MSS-1-016': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA49BT/MSS-1-005': {
            getContinuousBpBonus: (engine, cardEl) => {
                if (!engine.isMyTurn) return 0;
                const row = cardEl.parentElement?.closest('#my-front-line, #my-energy-line');
                if (!row) return 0;
                return engine.getSlotTopCards(`#${row.id} .slot`).some(c => engine.getCardDef(c)?.name?.includes('駿河 朱々')) ? 2000 : 0;
            },
            onAttack(engine, cardEl, done) {
                const row = cardEl.parentElement?.closest('#my-front-line, #my-energy-line');
                if (engine.isMyTurn && row && engine.getSlotTopCards(`#${row.id} .slot`).some(c => engine.getCardDef(c)?.name?.includes('駿河 朱々'))) {
                    engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                }
                done();
            }
        },
        'UA49BT/MSS-1-013': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                if (countUniqueUnit7(engine) >= 4) engine.getRuntime(cardEl).tempKeywords.SNIPE = 1;
                done();
            }
        },
        'UA49BT/MSS-1-038': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '屈服の時間だ！', engine.hasCharacterOnMyField('羽前 京香') ? 5000 : 3000, done)
        },
        'UA49BT/MSS-1-042': {
            onEventPlay(engine, cardEl, done) {
                retireOppFront(engine, '魔都精兵の七番組', countUniqueUnit7(engine) >= 4 ? 5000 : 3000, () => {
                    engine.drawCards(1);
                    engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
                });
            }
        },

        // ==================== 綠色：醜鬼／魔防隊 ====================
        'UA49BT/MSS-1-043': {
            getContinuousBpBonus: (engine) =>
                (engine.isMyTurn && engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name?.includes('和倉 青羽'))) ? 500 : 0
        },
        'UA49BT/MSS-1-051': {
            onAttack(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MIN_BP = 4000; done(); }
        }
    });
})();
