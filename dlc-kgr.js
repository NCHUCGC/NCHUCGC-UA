/**
 * Union Arena 卡片腳本 DLC：神樂缽 (Kagurabachi) [KGR]
 * 涵蓋：紫（六平千鉱 居合白禊流／座村／双城厳一／漣京羅 楽座市）、紅（六平千鉱＆漣伯理＆柴登吾／香刈緋雪 神奈備）核心卡片
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
        // ==================== 紫色：妖刀／居合白禊流／楽座市 ====================
        'UA46BT/KGR-1-015': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2000;
                done();
            }
        },
        'UA46BT/KGR-1-036': {
            getEnergyDiscount: (engine) => engine.hasCharacterOnMyField('昼彦') ? 2 : 0,
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '血鶴', 5000, done)
        },
        'UA46BT/KGR-1-039': {
            onEventPlay(engine, cardEl, done) {
                const hasPair = engine.hasCharacterOnMyField('六平 千鉱') &&
                    (engine.hasCharacterOnMyField('座村 イヲリ') || myFieldTops(engine).some(c => engine.getCardDef(c)?.traits?.includes('居合白禊流')));
                retireOppFront(engine, '居合白禊流', hasPair ? 5000 : 2000, done);
            }
        },
        'UA46BT/KGR-1-040': {
            onEventPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 1500);
                const afterDebuff = () => {
                    if (engine.hasCharacterOnMyField('双城 厳一')) retireOppFront(engine, '刳雲 鳴（双城連動）', 4000, done);
                    else done();
                };
                if (!opp.length) { afterDebuff(); return; }
                engine.promptModal({
                    title: '刳雲 鳴', desc: '選擇對手前線 1 張 BP1500+ 角色 BP-1000：', cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => { if (sel.length) engine.addSlotBp(sel[0].parentElement, -1000); afterDebuff(); }
                });
            }
        },
        'UA46BT/KGR-1-041': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '勾罪 蜈', (engine.hasCharacterOnMyField('漣 京羅') || engine.hasCharacterOnMyField('楽座市')) ? 5000 : 4000, done)
        },

        // ==================== 紅色：千鉱＆伯理＆柴／神奈備 ====================
        'UA46BT/KGR-1-065': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && document.querySelectorAll('#opp-life-area .card').length <= 3) ? 500 : 0
        },
        'UA46BT/KGR-1-067': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('神奈備')).length;
                if (cnt < 4) { done(); return; }
                engine.promptModal({
                    title: '香刈 緋雪 [登場時]（神奈備 4+）', desc: '選擇本回合獲得的關鍵字：', cards: [cardEl],
                    customButtons: [
                        { label: '[インパクト(1)]', color: '#c1596f', onClick: () => { engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1); done(); } },
                        { label: '[ダメージ(2)]', color: '#e67e22', onClick: () => { engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2); done(); } }
                    ]
                });
            }
        },
        'UA46BT/KGR-1-079': {
            onEventPlay(engine, cardEl, done) {
                retireOppFront(engine, '炎骨 陸郎', engine.hasCharacterOnMyField('香刈 緋雪') ? 5000 : 2000, () => {
                    const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('神奈備')).length;
                    if (cnt >= 4) engine.executeAbilityActions(cardEl, [{ type: 'LOOK_AND_ARRANGE_TOP', count: 1, keepUpTo: 1, remainderTo: 'BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, done);
                    else done();
                });
            }
        }
    });
})();
