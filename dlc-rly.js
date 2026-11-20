/**
 * Union Arena 卡片腳本 DLC：超超超超超喜歡你的100個女朋友 [RLY]
 * 涵蓋：黃（愛城恋太郎 異名軸／院田唐音／花園羽香里＆羽々里）、綠（栄逢凪乃／薬膳楠莉）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const countDistinctOtherNames = (engine, excludeName) => {
        const s = new Set();
        myFieldTops(engine).forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.type === 'CHARACTER' && d.name && !d.name.includes(excludeName)) s.add(d.name);
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
        // ==================== 黃色：恋太郎／唐音／花園家 ====================
        'UA26BT/RLY-1-002': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && countDistinctOtherNames(engine, '愛城 恋太郎') >= 3) ? 1000 : 0,
            getContinuousImpact: (engine) => countDistinctOtherNames(engine, '愛城 恋太郎') >= 6 ? 1 : 0,
            onAttack(engine, cardEl, done) {
                if (countDistinctOtherNames(engine, '愛城 恋太郎') >= 6) engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                done();
            }
        },
        'UA26BT/RLY-1-012': { getEnergyDiscount: (engine) => myFieldTops(engine).length >= 3 ? 1 : 0 },
        'UA26BT/RLY-1-030': { getContinuousBpBonus: (engine) => (engine.isMyTurn && engine.hasCharacterOnMyField('花園 羽香里')) ? 500 : 0 },
        'UA26BT/RLY-1-031': {
            onPlay(engine, cardEl, done) {
                engine.pendingApDiscounts.push({ amount: 1, desc: '花園 羽々里 (羽香里 AP-1)', matchFn: (d) => (d?.name || '').includes('花園 羽香里') });
                done();
            }
        },
        'UA26BT/RLY-1-034': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '嬉ションするところだった…!!!', engine.hasCharacterOnMyField('花園 羽香里') ? 5000 : 3000, done)
        },

        // ==================== 綠色：栄逢凪乃／薬膳楠莉 ====================
        'UA26BT/RLY-1-051': {
            getContinuousImpact: (engine) =>
                Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name?.includes('栄逢 凪乃')).length >= 5 ? 1 : 0,
            onPlay(engine, cardEl, done) { engine.drawCards(1); done(); }
        },
        'UA26BT/RLY-1-058': {
            getContinuousImpact: (engine, cardEl) => engine.getEffectiveCardBp(cardEl) >= 5000 ? 1 : 0
        },
        'UA26BT/RLY-1-060': {
            requireRaided: true,
            getContinuousImpact: (engine, cardEl) => engine.getEffectiveCardBp(cardEl) >= 4500 ? 1 : 0
        }
    });
})();
