/**
 * Union Arena 卡片腳本 DLC：王者天下 (Kingdom) [KGD]
 * 涵蓋：藍（飛信隊 信／羌瘣／王騎／蒙恬／王賁）、黃（合從軍 汗明／李牧／呉鳳明／媧燐）、紅（桓騎／王翦）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const countUniqueTraitNames = (engine, trait) => {
        const s = new Set();
        myFieldTops(engine).forEach(c => {
            const d = engine.getCardDef(c);
            if (d && Array.isArray(d.traits) && d.traits.includes(trait) && d.name) s.add(d.name);
        });
        return s.size;
    };
    const countYellowTraits = (engine) => {
        const s = new Set();
        myFieldTops(engine).forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.color === 'YELLOW' && Array.isArray(d.traits)) d.traits.forEach(t => s.add(t));
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
        // ==================== 藍色：秦國（飛信隊／王騎／蒙恬／王賁） ====================
        'UA48ST/KGD-1-102': {
            onAttack(engine, cardEl, done) { engine.drawCards(1); done(); },
            onRetire(engine, cardEl, done) {
                const shins = myFieldTops(engine).filter(c => engine.getCardDef(c)?.name?.includes('信'));
                if (!shins.length) { done(); return; }
                engine.promptModal({
                    title: '王騎 [退場時]', desc: '選擇最多 1 張我方〈信〉轉為活動並 BP+3000：',
                    cards: shins, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) { sel[0].classList.remove('rest'); engine.addSlotBp(sel[0].parentElement, 3000); } done(); }
                });
            }
        },
        'UA48ST/KGD-1-107': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? countUniqueTraitNames(engine, '飛信隊') * 500 : 0
        },
        'UA48BT/KGD-1-040': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const front = engine.getSlotTopCards('#my-front-line .slot');
                const hasBoth = front.some(c => engine.getCardDef(c)?.name?.includes('信')) && front.some(c => engine.getCardDef(c)?.name?.includes('王賁'));
                engine.drawCards(hasBoth ? 3 : 2);
                engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        },
        'UA48BT/KGD-1-044': {
            requireRaided: true,
            onUnblockedAttack(engine, cardEl, done) {
                const front = engine.getSlotTopCards('#my-front-line .slot');
                const hasBoth = front.some(c => engine.getCardDef(c)?.name?.includes('信')) && front.some(c => engine.getCardDef(c)?.name?.includes('蒙恬'));
                engine.drawCards(hasBoth ? 2 : 1);
                done();
            }
        },
        'UA48ST/KGD-1-067': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'ルアア!!', engine.hasCharacterOnMyField('信') ? 5000 : 3000, done)
        },

        // ==================== 黃色：合從軍 ====================
        'UA48ST/KGD-1-110': {
            getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },
        'UA48BT/KGD-1-028': {
            onEventPlay(engine, cardEl, done) {
                engine.drawCards(countYellowTraits(engine) >= 3 ? 3 : 2);
                done();
            }
        },
        'UA48BT/KGD-1-030': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('楚')).length;
                retireOppFront(engine, `誰が至強か!?（楚 ${cnt} 張）`, cnt * 1000, done);
            }
        },
        'UA48BT/KGD-1-032': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '万に一つも勝ち目はない', engine.hasCharacterOnMyField('李牧') ? 5000 : 3000, done)
        },

        // ==================== 紅色：桓騎軍／王翦 ====================
        'UA48ST/KGD-1-113': {
            canActivateMain: (engine, cardEl) =>
                myFieldTops(engine).some(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('桓騎軍')),
            onActivateMain(engine, cardEl, slot, done) {
                const team = myFieldTops(engine).filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('桓騎軍'));
                engine.promptModal({
                    title: '桓騎 [起動メイン]', desc: '選擇 1 張其他［特徴：桓騎軍］退場，獲得 BP+1000 與 [2回アタック]：',
                    cards: team, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.retireCardFromSlot(sel[0].parentElement);
                            engine.addSlotBp(slot, 1000);
                            engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
                        }
                        done();
                    }
                });
            }
        }
    });
})();
