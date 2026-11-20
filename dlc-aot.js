/**
 * Union Arena 卡片腳本 DLC：進擊的巨人 (Attack on Titan) [AOT]
 * 涵蓋：紅（エレン／ミカサ 104期兵）、藍（リヴァイ／ヒストリア／ユミル 事件軸）、綠（ジーク 無垢の巨人／鎧／超大型／女型 マーレの戦士）核心卡片
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
        // ==================== 紅色：104期兵 ====================
        'UA23ST/AOT-1-107': {
            requireRaided: true,
            onPlay(engine, cardEl, done) { engine.drawCards(1); done(); },
            canActivateMain: (engine, cardEl, slot) =>
                !!slot.closest('#my-front-line') && !engine.usedNamedAbilityThisTurn.has('AOT_EREN_LIFE_AP') && document.querySelectorAll('#my-life-area .card').length >= 1,
            onActivateMain(engine, cardEl, slot, done) {
                engine.usedNamedAbilityThisTurn.add('AOT_EREN_LIFE_AP');
                const life = Array.from(document.querySelectorAll('#my-life-area .card'));
                if (life.length) engine.moveCardToZone(life[life.length - 1], document.getElementById('my-outside-area'));
                engine.activateMyApCards(1);
                done();
            }
        },
        'UA23ST/AOT-1-109': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('104期兵')).length;
                retireOppFront(engine, `104期訓練兵団（${cnt} 張）`, cnt * 1000, done);
            }
        },

        // ==================== 藍色：調査兵団／ヒストリア ====================
        'UA23BT/AOT-1-016': { getEnergyDiscount: (engine) => hasOppColor(engine, ['GREEN', 'RED']) ? 1 : 0 },
        'UA23BT/AOT-1-011': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.addSlotBp(cardEl.parentElement, 1000);
                engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
                done();
            }
        },
        'UA23BT/AOT-1-014': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                if (rt.usedOncePerTurn) { done(); return; }
                rt.usedOncePerTurn = true;
                engine.drawCards(1);
                engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                    if (engine.countEventsInMyOutside() >= 6) { cardEl.classList.remove('rest'); showSysMsg('ユミル：場外事件 6 張以上，轉為活動！'); }
                    done();
                });
            }
        },
        'UA23BT/AOT-1-033': {
            onEventPlay(engine, cardEl, done) {
                const limit = 2000 + (engine.hasCharacterOnMyField('ヒストリア・レイス') ? engine.countEventsInMyOutside() * 1000 : 0);
                retireOppFront(engine, 'ヒストリアの決意', limit, done);
            }
        },
        'UA23BT/AOT-1-034': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, 'リヴァイの連撃', engine.hasCharacterOnMyField('リヴァイ') ? 5000 : 3000, done)
        },

        // ==================== 綠色：巨人／マーレの戦士 ====================
        'UA23BT/AOT-1-035': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'RED']) ? 1 : 0 },
        'UA23ST/AOT-1-112': {
            onPlay(engine, cardEl, done) {
                const limit = (engine.calculateMyEnergy().ALL || 0) >= 8 ? 4000 : 2000;
                retireOppFront(engine, '鎧の巨人 [登場時]', limit, done);
            }
        },
        'UA23BT/AOT-1-038': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 2000 : 0,
            onAttack(engine, cardEl, done) {
                if (engine.isMyTurn && engine.getSlotTopCards('#opp-front-line .slot').some(c => !c.classList.contains('rest'))) {
                    engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                }
                done();
            }
        },
        'UA23BT/AOT-1-048': {
            requireRaided: true,
            getEnergyDiscount: (engine) => myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('無垢の巨人')).length,
            onPlay(engine, cardEl, done) {
                myFieldTops(engine).forEach(c => { if (engine.getCardDef(c)?.traits?.includes('無垢の巨人')) engine.addSlotBp(c.parentElement, 1000); });
                done();
            }
        }
    });
})();
