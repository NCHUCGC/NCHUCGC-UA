/**
 * Union Arena 卡片腳本 DLC：筋肉人 (Kinnikuman) [KIN]
 * 涵蓋：紫（悪魔将軍／バッファローマン／ブラックホール／ストロング・ザ・武道／ネメシス）、紅（キン肉マン／ウォーズマン／テリーマン／ロビンマスク）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
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
        // ==================== 紫色：悪魔超人／完璧超人 ====================
        'UA39BT/KIN-1-012': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 4000);
                const afterBounce = () => {
                    if (document.querySelectorAll('#opp-hand-area .card').length >= 4 && conn && isConnected) {
                        conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_DISCARD_HAND', count: 1 });
                    }
                    done();
                };
                if (!opp.length) { afterBounce(); return; }
                engine.promptModal({
                    title: 'バッファローマン [登場時]', desc: '選擇對手前線最多 1 張 BP4000 以下角色退回手牌：',
                    cards: opp, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.requestBounceOpponentCard(sel[0]); afterBounce(); }
                });
            }
        },
        'UA39BT/KIN-1-015': {
            requireRaided: true,
            getContinuousImpact: (engine, cardEl) => countUnder(cardEl) > 0 ? 1 : 0
        },
        'UA39BT/KIN-1-021': {
            onPlay(engine, cardEl, done) {
                const allPerfect = myFieldTops(engine).every(c => engine.getCardDef(c)?.traits?.includes('完璧超人'));
                if (allPerfect) retireOppFront(engine, 'ストロング・ザ・武道 [登場時]', 5000, done);
                else done();
            }
        },
        'UA39BT/KIN-1-034': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '吸引ブラックホール', engine.hasCharacterOnMyField('ブラックホール') ? 5000 : 3000, done)
        },

        // ==================== 紅色：正義超人 ====================
        'UA39BT/KIN-1-050': {
            requireRaided: true,
            onPlay(engine, cardEl, done) { engine.drawCards(1); done(); }
        }
    });
})();
