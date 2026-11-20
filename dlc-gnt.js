/**
 * Union Arena 卡片腳本 DLC：銀魂 (Gintama) [GNT]
 * 涵蓋：紅（万事屋 坂田銀時／神楽／志村新八）、黃（真選組 土方十四郎／沖田総悟／近藤勲／御庭番衆）、紫（神威／高杉）核心卡片
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
        // ==================== 紅色：万事屋 ====================
        'UA11ST/GNT-1-105': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                const others = myFieldTops(engine).filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('万事屋')).length;
                if (others >= 3) engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                done();
            }
        },
        'UA11ST/GNT-1-099': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '木刀・洞爺湖', engine.hasCharacterOnMyField('坂田 銀時') ? 5000 : 3000, done)
        },
        'UA11ST/GNT-1-109': {
            onEventPlay(engine, cardEl, done) {
                const chars = myFieldTops(engine);
                if (!chars.length) { done(); return; }
                engine.promptModal({
                    title: 'ゴチになりまーす', desc: '選擇 1 張我方角色 BP+2000（若為［特徴：万事屋］再獲 [インパクト(+1)]）：',
                    cards: chars, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.addSlotBp(sel[0].parentElement, 2000);
                            if (engine.getCardDef(sel[0])?.traits?.includes('万事屋')) {
                                const rt = engine.getRuntime(sel[0]);
                                rt.tempKeywords.IMPACT_PLUS = (rt.tempKeywords.IMPACT_PLUS || 0) + 1;
                            }
                        }
                        done();
                    }
                });
            }
        },

        // ==================== 黃色：真選組／御庭番衆 ====================
        'UA11BT/GNT-1-020': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'RED']) ? 1 : 0 },
        'UA11BT/GNT-1-021': {
            getEnergyDiscount: (engine) => myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('真選組')).length
        },
        'UA11BT/GNT-1-006': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => (engine.isMyTurn && (engine.hasCharacterOnMyField('徳川 茂茂') || engine.hasCharacterOnMyField('服部 全蔵'))) ? 1000 : 0
        },
        'UA11BT/GNT-1-011': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && (engine.hasCharacterOnMyField('徳川 茂茂') || engine.hasCharacterOnMyField('猿飛 あやめ'))) ? 500 : 0
        },
        'UA11BT/GNT-1-015': {
            requireRaided: true,
            getContinuousImpact: (engine, cardEl) => engine.getEffectiveCardBp(cardEl) >= 4000 ? 1 : 0
        },
        'UA11BT/GNT-1-018': {
            getContinuousImpact: (engine, cardEl) => myFieldTops(engine).filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('真選組')).length >= 5 ? 1 : 0
        },
        'UA11BT/GNT-1-031': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('真選組')).length;
                retireOppFront(engine, `真選組バズーカ（${cnt} 張）`, cnt * 1000, done);
            }
        },

        // ==================== 紫色：春雨／鬼兵隊 ====================
        'UA11BT/GNT-1-037': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'RED']) ? 1 : 0 },
        'UA11BT/GNT-1-042': { getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0 }
    });
})();
