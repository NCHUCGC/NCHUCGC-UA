/**
 * Union Arena 卡片腳本 DLC：美食獵人 TORIKO [TRK]
 * 涵蓋：黃（美食四天王 トリコ／ココ／サニー／ゼブラ＆八王夥伴）、藍（トリコ 食材軸／一龍）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFrontTops = (engine) => engine.getSlotTopCards('#my-front-line .slot');
    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const hasAllFourKings = (engine, frontOnly = false) => {
        const pool = frontOnly ? myFrontTops(engine) : engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
        const has = (n) => pool.some(c => engine.getCardDef(c)?.name?.includes(n));
        return has('トリコ') && has('ココ') && has('サニー') && has('ゼブラ');
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
        // ==================== 黃色：美食四天王 ====================
        'UA17BT/TRK-1-003': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'PURPLE']) ? 1 : 0 },
        'UA17BT/TRK-1-001': {
            onAttack(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2000; done(); }
        },
        'UA17BT/TRK-1-009': {
            requireRaided: true,
            getContinuousBpBonus: () => 500
        },
        'UA17BT/TRK-1-012': {
            getContinuousBpBonus: (engine) =>
                (engine.hasCharacterOnMyField('トリコ') && engine.hasCharacterOnMyField('ココ') && engine.hasCharacterOnMyField('ゼブラ')) ? 500 : 0
        },
        'UA17BT/TRK-1-021': {
            getContinuousImpact: (engine) => {
                const fl = myFrontTops(engine);
                const has = (n) => fl.some(c => engine.getCardDef(c)?.name?.includes(n));
                return (has('ココ') && has('サニー') && has('ゼブラ')) ? 1 : 0;
            }
        },
        'UA17BT/TRK-1-026': {
            onEventPlay(engine, cardEl, done) {
                const limit = hasAllFourKings(engine, false) ? 5000 : 3000;
                retireOppFront(engine, '王食晩餐', limit, () => {
                    const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                    if (hasAllFourKings(engine, true) && hand.length >= 2) {
                        engine.promptModal({
                            title: '王食晩餐（四天王前線齊聚！）', desc: '是否棄 2 張手牌，將我方前線全部角色轉為活動？',
                            cards: hand, selectCount: 2, upTo: true,
                            onConfirm: (sel) => {
                                if (sel.length === 2) {
                                    const out = document.getElementById('my-outside-area');
                                    sel.forEach(c => engine.moveCardToZone(c, out));
                                    myFrontTops(engine).forEach(c => c.classList.remove('rest'));
                                }
                                done();
                            }
                        });
                        return;
                    }
                    done();
                });
            }
        },
        'UA17BT/TRK-1-029': {
            onEventPlay(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('ココ')) engine.activateMyApCards(1);
                retireOppFront(engine, 'モウルドスピア', 3000, done);
            }
        },

        // ==================== 藍色：トリコ ====================
        'UA17ST/TRK-1-062': {
            onEventPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 5000);
                if (!opp.length) { showSysMsg('對手前線無 BP5000 以下角色。'); done(); return; }
                const retire = engine.hasCharacterOnMyField('トリコ');
                engine.promptModal({
                    title: `釘パンチ（${retire ? '退場' : '彈回手牌'}）`,
                    desc: `選擇 1 張對手前線 BP5000 以下角色${retire ? '退場' : '退回手牌'}：`,
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => { if (sel.length) retire ? engine.requestRetireOpponentCard(sel[0]) : engine.requestBounceOpponentCard(sel[0]); done(); }
                });
            }
        }
    });
})();
