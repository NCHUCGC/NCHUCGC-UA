/**
 * Union Arena 卡片腳本 DLC：死神 BLEACH [BLC]
 * 涵蓋：紫（黒崎一護／阿散井恋次 墓地移除）、黃（ユーハバッハ／ハッシュヴァルト／バンビエッタ／エス・ノト）核心卡片
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
            title: `${title} (BP${limit}以下)`, desc: `選擇最多 1 張對手前線 BP${limit} 以下角色退場：`,
            cards: cands, selectCount: 1, upTo: true,
            onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); onDone(); }
        });
    };

    window.registerCardScripts({
        // ==================== 紫色：死神代行 ====================
        'UA08BT/BLC-1-044': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'GREEN']) ? 1 : 0 },
        'UA08ST/BLC-1-104': {
            requireRaided: true,
            canActivateMain: (engine, cardEl) =>
                !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-outside-area .card').length >= 4,
            onActivateMain(engine, cardEl, slot, done) {
                const out = Array.from(document.querySelectorAll('#my-outside-area .card'));
                const rem = document.getElementById('my-remove-area');
                out.slice(0, 4).forEach(c => engine.moveCardToZone(c, rem));
                const rt = engine.getRuntime(cardEl);
                rt.usedOncePerTurn = true;
                engine.drawCards(1);
                rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                showSysMsg('黒崎 一護 [起動メイン]：移除場外 4 張，抽 1 並獲得 [インパクト(1)]！');
                done();
            }
        },
        'UA08BT/BLC-1-041': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.millDeckCards(2);
                const out = Array.from(document.querySelectorAll('#my-outside-area .card'));
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (!out.length || !opp.length) { done(); return; }
                engine.promptModal({
                    title: '黒崎 一護 [登場時]', desc: '選擇任意張場外卡移至移除區（每 1 張降對手前線 BP-500）：',
                    cards: out, selectCount: out.length, upTo: true,
                    onConfirm: (sel) => {
                        if (!sel.length) { done(); return; }
                        const rem = document.getElementById('my-remove-area');
                        sel.forEach(c => engine.moveCardToZone(c, rem));
                        const debuff = -sel.length * 500;
                        engine.promptModal({
                            title: `選擇降 BP${debuff} 目標`, desc: '選擇對手前線最多 1 張：',
                            cards: opp, selectCount: 1, upTo: true,
                            onConfirm: (t) => { if (t.length) engine.addSlotBp(t[0].parentElement, debuff); done(); }
                        });
                    }
                });
            }
        },
        'UA08ST/BLC-1-064': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '月牙天衝', engine.hasCharacterOnMyField('黒崎 一護') ? 5000 : 3000, done)
        },

        // ==================== 黃色：星十字騎士團 ====================
        'UA08BT/BLC-1-007': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'GREEN']) ? 1 : 0 },
        'UA08BT/BLC-1-019': {
            getContinuousBpBonus: (engine) =>
                engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 4000).length >= 2 ? 500 : 0
        },
        'UA08BT/BLC-1-014': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                if (!engine.isMyTurn) { done(); return; }
                const rested = engine.getSlotTopCards('#opp-front-line .slot').filter(c => c.classList.contains('rest'));
                if (!rested.length) { done(); return; }
                engine.promptModal({
                    title: 'バンビエッタ [登場時]', desc: '選擇對手前線最多 1 張休息角色退場：',
                    cards: rested, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); done(); }
                });
            }
        },
        'UA08BT/BLC-1-033': {
            onEventPlay(engine, cardEl, done) {
                const oppHasRaid = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
                    .some(c => c.parentElement && c.parentElement.querySelectorAll('.card').length >= 2);
                const limit = (oppHasRaid || engine.hasCharacterOnMyField('ユーハバッハ')) ? 5000 : 3000;
                retireOppFront(engine, '星章化', limit, done);
            }
        }
    });
})();
