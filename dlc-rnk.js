/**
 * Union Arena 卡片腳本 DLC：浪客劍心 (Rurouni Kenshin) [RNK]
 * 涵蓋：紅（緋村剣心／相楽左之助／斎藤一）、藍（比古清十郎／緋村剣心／四乃森蒼紫）、紫（斎藤一 無特徵軸）核心卡片
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
        // ==================== 紅色 ====================
        'UA41ST/RNK-1-105': { getContinuousBpBonus: (engine) => engine.isMyTurn ? -1000 : 0 },

        // ==================== 藍色：飛天御剣流／御庭番衆 ====================
        'UA41BT/RNK-1-012': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'RED']) ? 1 : 0 },
        'UA41BT/RNK-1-025': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },

        // 比古 清十郎 (7費 Raid BP 5000)：我方回合 BP+3000、不被 BP2000 以下阻擋
        'UA41BT/RNK-1-008': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 3000 : 0,
            onAttack(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2000; done(); }
        },

        // 藍 緋村 剣心 (5費 Raid)：BP6000 以上獲得 [2回アタック]
        'UA41BT/RNK-1-011': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                if (engine.getEffectiveCardBp(cardEl) >= 6000) engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
                done();
            }
        },

        // 藍事件：回天剣舞／九頭龍閃
        'UA41BT/RNK-1-028': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.name?.includes('四乃森 蒼紫')).length;
                retireOppFront(engine, `回天剣舞（蒼紫 ${cnt} 張）`, 3000 + cnt * 1000, done);
            }
        },
        'UA41BT/RNK-1-030': {
            onEventPlay(engine, cardEl, done) {
                const hasHiko = engine.hasCharacterOnMyField('比古 清十郎');
                retireOppFront(engine, '九頭龍閃', hasHiko ? 5000 : 3000, () => {
                    if (hasHiko) {
                        const kenshins = myFieldTops(engine).filter(c => engine.getCardDef(c)?.name?.includes('緋村 剣心'));
                        if (kenshins.length) engine.addSlotBp(kenshins[0].parentElement, 1000);
                    }
                    done();
                });
            }
        },

        // ==================== 紫色：斎藤一 ====================
        'UA41BT/RNK-1-038': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA41BT/RNK-1-039': {
            requireRaided: true,
            onAttack(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2000; done(); }
        },
        'UA41BT/RNK-1-040': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const hasAnyTrait = myFieldTops(engine).some(c => (engine.getCardDef(c)?.traits || []).length > 0);
                if (!hasAnyTrait) {
                    engine.addSlotBp(cardEl.parentElement, 1000);
                    showSysMsg('斎藤 一 [登場時]：場上無特徵卡，本回合 BP+1000 並可從能源線攻擊！');
                }
                done();
            }
        }
    });
})();
