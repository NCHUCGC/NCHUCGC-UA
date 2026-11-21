/**
 * Union Arena 卡片腳本 DLC：關於我轉生變成史萊姆這檔事 [TSK]
 * 涵蓋：黃（リムル／ディアブロ／ベニマル 鬼人軸）、藍（リムル 捕食者／シズ／ヴェルドラ）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const retireOppFront = (engine, title, limit, onDone, toRemove = false) => {
        const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
        if (!cands.length) { showSysMsg(`對手前線無 BP${limit} 以下角色。`); onDone(); return; }
        engine.promptModal({
            title: `${title} (BP${limit}以下)`, desc: `選擇最多 1 張對手前線 BP${limit} 以下角色${toRemove ? '移至移除區' : '退場'}：`,
            cards: cands, selectCount: 1, upTo: true,
            onConfirm: (sel) => {
                if (sel.length) {
                    if (toRemove) engine.requestRemoveOpponentCard(sel[0]);
                    else engine.requestRetireOpponentCard(sel[0]);
                }
                onDone();
            }
        });
    };

    window.registerCardScripts({
        // ==================== 黃色：テンペスト（ディアブロ／鬼人） ====================
        'UA07BT/TSK-1-007': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'GREEN']) ? 1 : 0 },
        'UA07BT/TSK-1-006': {
            requireRaided: true,
            getContinuousImpact: (engine, cardEl) => engine.getEffectiveCardBp(cardEl) >= 5000 ? 1 : 0,
            onPlay(engine, cardEl, done) {
                if (engine.getEffectiveCardBp(cardEl) >= 7000) engine.getRuntime(cardEl).tempKeywords.SNIPE = 1;
                done();
            }
        },
        'UA07BT/TSK-1-012': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                engine.drawCards(1);
                const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => c !== cardEl && engine.getEffectiveCardBp(c) >= 3000);
                if (!cands.length) { done(); return; }
                engine.promptModal({
                    title: 'リムル [アタック時]', desc: '選擇最多 1 張 BP3000 以上其他角色 BP+2000：',
                    cards: cands, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.addSlotBp(sel[0].parentElement, 2000); done(); }
                });
            }
        },
        'UA07BT/TSK-1-029': {
            onEventPlay(engine, cardEl, done) {
                engine.pendingApDiscounts.push({ amount: 1, desc: '悪魔召喚 (ディアブロ AP-1)', matchFn: (d) => (d?.name || '').includes('ディアブロ') });
                const out = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name?.includes('ディアブロ'));
                if (!out.length) { done(); return; }
                engine.promptModal({
                    title: '悪魔召喚', desc: '從場外回收最多 1 張〈ディアブロ〉至手牌：', cards: out, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); done(); }
                });
            }
        },
        'UA07BT/TSK-1-032': {
            onEventPlay(engine, cardEl, done) {
                retireOppFront(engine, '原初の黒', engine.hasCharacterOnMyField('ディアブロ') ? 5000 : 2000, () => {
                    if (engine.hasCharacterOnMyField('リムル')) {
                        engine.executeAbilityActions(cardEl, [
                            { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true },
                            { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
                        ], 0, { selectedTargets: [], addedFromLook: false }, done);
                    } else done();
                });
            }
        },
        'UA07BT/TSK-1-033': { onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '収穫祭', 4000, done, true) },
        'UA07BT/TSK-1-034': {
            onEventPlay(engine, cardEl, done) {
                const cnt = engine.getSlotTopCards('#my-front-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('鬼人')).length;
                retireOppFront(engine, '黒炎獄', cnt >= 3 ? 5000 : 3000, done);
            }
        },

        // ==================== 藍色：リムル／シズ ====================
        'UA07BT/TSK-1-048': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'GREEN']) ? 1 : 0 },
        'UA07BT/TSK-1-042': { getContinuousBpBonus: () => -1000 },
        'UA07ST/TSK-1-102': { onRetire(engine, cardEl, done) { engine.drawCards(2); done(); } },
        'UA07ST/TSK-1-107': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const out4000 = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => (engine.getCardDef(c)?.bp || 0) >= 4000).length;
                if (out4000 >= 2) retireOppFront(engine, 'リムル [登場時]', 2000, done);
                else done();
            }
        }
    });
})();
