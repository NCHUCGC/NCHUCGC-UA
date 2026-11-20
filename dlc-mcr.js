/**
 * Union Arena 卡片腳本 DLC：超時空要塞 (Macross) [MCR]
 * 涵蓋：藍（早乙女アルト／シェリル＆ランカ）、黃（シェリル 突襲墓地軸／ランカ 歌異名軸）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const countOutRaidSheryl = (engine) =>
        Array.from(document.querySelectorAll('#my-outside-area .card'))
            .filter(c => { const d = engine.getCardDef(c); return d && d.name?.includes('シェリル・ノーム') && d.compiledRules?.raidCondition; }).length;

    const countOutRankaSongs = (engine) => {
        const s = new Set();
        document.querySelectorAll('#my-outside-area .card').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.color === 'YELLOW' && d.traits?.includes('歌（ランカ）') && d.name) s.add(d.name);
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
        // ==================== 藍色：メサイア／三角關係 ====================
        'UA36ST/MCR-1-101': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA36ST/MCR-1-102': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA36ST/MCR-1-107': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => (engine.isMyTurn && (engine.hasCharacterOnMyField('シェリル・ノーム') || engine.hasCharacterOnMyField('ランカ・リー'))) ? 1000 : 0,
            getContinuousImpact: (engine) => (engine.isMyTurn && engine.hasCharacterOnMyField('シェリル・ノーム') && engine.hasCharacterOnMyField('ランカ・リー')) ? 1 : 0
        },
        'UA36ST/MCR-1-065': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'トライアングラー', engine.hasCharacterOnMyField('シェリル・ノーム') ? 5000 : 4000, done)
        },

        // ==================== 黃色：シェリル／ランカ ====================
        'UA36BT/MCR-1-017': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'RED']) ? 1 : 0 },
        'UA36BT/MCR-1-011': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => (engine.isMyTurn && countOutRaidSheryl(engine) >= 3) ? 1000 : 0,
            getContinuousImpact: (engine) => (engine.isMyTurn && countOutRaidSheryl(engine) >= 3) ? 1 : 0
        },
        'UA36BT/MCR-1-012': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => (engine.isMyTurn && countOutRaidSheryl(engine) >= 5) ? 500 : 0,
            onAttack(engine, cardEl, done) {
                if (engine.isMyTurn && countOutRaidSheryl(engine) >= 5) engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                done();
            }
        },
        'UA36BT/MCR-1-020': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && countOutRankaSongs(engine) >= 3) ? 500 : 0
        },
        'UA36BT/MCR-1-022': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0,
            canActivateMain: (engine, cardEl, slot) => !!slot.closest('#my-front-line') && !engine.usedNamedAbilityThisTurn.has('MCR_RANKA_AP'),
            onActivateMain(engine, cardEl, slot, done) {
                engine.usedNamedAbilityThisTurn.add('MCR_RANKA_AP');
                engine.pendingApDiscounts.push({ amount: 1, desc: 'ランカ・リー (歌（ランカ）AP-1)', matchFn: (d) => d?.color === 'YELLOW' && d?.traits?.includes('歌（ランカ）') });
                showSysMsg('ランカ・リー：本回合下次使用黃色［特徴：歌（ランカ）］消費 AP-1！');
                done();
            }
        },
        'UA36BT/MCR-1-023': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => (engine.isMyTurn && countOutRankaSongs(engine) >= 3) ? 1000 : 0,
            getContinuousImpact: (engine) => (engine.isMyTurn && countOutRankaSongs(engine) >= 3) ? 1 : 0,
            onPlay(engine, cardEl, done) { if (countOutRankaSongs(engine) >= 1) engine.drawCards(1); done(); }
        },
        'UA36BT/MCR-1-027': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '射手座☆午後九時', engine.hasCharacterOnMyField('シェリル・ノーム') ? 5000 : 3000, done)
        },
        'UA36BT/MCR-1-031': {
            onEventPlay(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('ランカ・リー')) retireOppFront(engine, '星間飛行（退場強化）', 5000, done);
                else { showSysMsg('星間飛行：選擇對手前線 BP5000 以下 1 張休息並凍結。'); done(); }
            }
        },
        'UA36BT/MCR-1-032': {
            onEventPlay(engine, cardEl, done) {
                engine.drawCards(1);
                if (countOutRankaSongs(engine) >= 3) engine.activateMyApCards(1);
                engine.executeAbilityActions(cardEl, [
                    { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true },
                    { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
                ], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        }
    });
})();
