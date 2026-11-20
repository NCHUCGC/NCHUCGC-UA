/**
 * Union Arena 卡片腳本 DLC：鬼滅之刃 (Demon Slayer) [KMY]
 * 涵蓋：黃（竈門炭治郎＆禰豆子／柱合会議 産屋敷耀哉＆柱）、紫（鬼舞辻無惨 墓地20+／魘夢 墓地15+／下弦）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));
    const countPillarsAndMaster = (engine, excludeEl = null) =>
        myFieldTops(engine).filter(c => {
            if (c === excludeEl) return false;
            const d = engine.getCardDef(c);
            return d && (d.name?.includes('産屋敷 耀哉') || d.traits?.includes('柱'));
        }).length;

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
        // ==================== 黃色：鬼殺隊／柱 ====================
        'UA05BT/KMY-1-023': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'RED']) ? 1 : 0 },
        'UA05ST/KMY-1-103': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('竈門 禰')) {
                    engine.addSlotBp(cardEl.parentElement, 500);
                    engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
                }
                done();
            }
        },
        'UA05BT/KMY-1-011': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => (engine.isMyTurn && engine.hasCharacterOnMyField('竈門 炭治郎')) ? 500 : 0
        },
        'UA05BT/KMY-1-020': {
            onPlay(engine, cardEl, done) {
                if (!cardEl.parentElement?.closest('#my-front-line')) { done(); return; }
                const cnt = countPillarsAndMaster(engine, cardEl);
                if (cnt >= 6) retireOppFront(engine, '甘露寺 蜜璃（柱 6+）', 4000, done);
                else if (cnt >= 3) retireOppFront(engine, '甘露寺 蜜璃（柱 3~5）', 3000, done);
                else done();
            }
        },
        'UA05BT/KMY-1-026': {
            getContinuousImpact: (engine, cardEl) => countPillarsAndMaster(engine, cardEl) >= 3 ? 1 : 0
        },
        'UA05ST/KMY-1-033': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '水の呼吸 拾ノ型 生生流転', engine.hasCharacterOnMyField('竈門 炭治郎') ? 5000 : 3000, done)
        },
        'UA05BT/KMY-1-033': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '水の呼吸 拾ノ型 生生流転', engine.hasCharacterOnMyField('竈門 炭治郎') ? 5000 : 3000, done)
        },
        'UA05BT/KMY-1-031': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '柱合裁判', countPillarsAndMaster(engine) >= 3 ? 5000 : 3000, done)
        },

        // ==================== 紫色：十二鬼月 ====================
        'UA05BT/KMY-1-039': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'RED']) ? 1 : 0 },
        'UA05BT/KMY-1-045': {
            requireRaided: true,
            getContinuousBpBonus: () => document.querySelectorAll('#my-outside-area .card').length >= 15 ? 500 : 0
        }
    });
})();
