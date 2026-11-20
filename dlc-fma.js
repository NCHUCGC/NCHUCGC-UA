/**
 * Union Arena 卡片腳本 DLC：鋼之鍊金術師 (Fullmetal Alchemist) [FMA]
 * 涵蓋：黃（エドワード＆アルフォンス／傷の男／グリード シン国）、紫（お父様 ホムンクルス 墓地20+）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

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
        // ==================== 黃色：エルリック兄弟／シン国 ====================
        'UA37BT/FMA-1-014': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'PURPLE']) ? 1 : 0 },
        'UA37BT/FMA-1-005': { getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0 },
        'UA37ST/FMA-1-005': { getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0 },
        'UA37BT/FMA-1-012': { requireRaided: true, getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0 },
        'UA37BT/FMA-1-027': { requireRaided: true, getContinuousBpBonus: () => 1000 },
        'UA37BT/FMA-1-013': {
            onPlay(engine, cardEl, done) {
                if ((engine.calculateMyEnergy().ALL || 0) >= 7) {
                    engine.addSlotBp(cardEl.parentElement, 1000);
                    engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
                }
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (!opp.length) { done(); return; }
                engine.promptModal({
                    title: '傷の男(スカー) [登場時]', desc: '選擇對手前線最多 1 張轉為休息：',
                    cards: opp, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length && sel[0].parentElement?.id.startsWith('opp-') && conn && isConnected) {
                            sel[0].classList.add('rest');
                            conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REST_SLOT', slotId: sel[0].parentElement.id.replace('opp-', 'my-') });
                        }
                        done();
                    }
                });
            }
        },
        'UA37ST/FMA-1-033': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '鋼の錬金術師', engine.hasCharacterOnMyField('エドワード・エルリック') ? 5000 : 3000, done)
        },
        'UA37BT/FMA-1-029': {
            onEventPlay(engine, cardEl, done) {
                const chars = myFieldTops(engine);
                if (!chars.length) { done(); return; }
                engine.promptModal({
                    title: '機械鎧', desc: '選擇 1 張我方角色 BP+2000（若為エドワード再選衝擊1或傷害2）：',
                    cards: chars, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (!sel.length) { done(); return; }
                        const t = sel[0];
                        engine.addSlotBp(t.parentElement, 2000);
                        if (engine.getCardDef(t)?.name?.includes('エドワード・エルリック')) {
                            engine.promptModal({
                                title: '機械鎧（エドワード強化）', desc: '選擇賦予關鍵字：', cards: [t],
                                customButtons: [
                                    { label: '[インパクト(1)]', color: '#c1596f', onClick: () => { engine.getRuntime(t).tempKeywords.IMPACT = Math.max(engine.getRuntime(t).tempKeywords.IMPACT || 0, 1); done(); } },
                                    { label: '[ダメージ(2)]', color: '#e67e22', onClick: () => { engine.getRuntime(t).tempKeywords.DAMAGE = Math.max(engine.getRuntime(t).tempKeywords.DAMAGE || 0, 2); done(); } }
                                ]
                            });
                        } else done();
                    }
                });
            }
        },
        'UA37BT/FMA-1-030': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('シン国')).length;
                retireOppFront(engine, `シン国からの旅人（${cnt} 張）`, cnt * 1000, done);
            }
        },

        // ==================== 紫色：ホムンクルス ====================
        'UA37ST/FMA-1-112': {
            getContinuousImpact: () => document.querySelectorAll('#my-outside-area .card').length >= 20 ? 1 : 0
        }
    });
})();
