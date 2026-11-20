/**
 * Union Arena 卡片腳本 DLC：我與機器子 (Me & Roboco) [BTR]
 * 涵蓋：黃（ロボコ 食べ物軸／ボンド 4異名／円ちゅわ～ん）、藍（膝ロボコ／ボンド 事件數彈手／モツオ／ガチゴリラ）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const countDistinctFrontNames = (engine) => {
        const s = new Set();
        engine.getSlotTopCards('#my-front-line .slot').forEach(c => {
            const n = engine.getCardDef(c)?.name;
            if (n) s.add(n);
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
        // ==================== 黃色 ====================
        'UA09BT/BTR-1-004': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'GREEN']) ? 1 : 0 },

        // ロボコ (ST 5費 Raid)：場外有［特徴：食べ物］得衝擊(1)
        'UA09ST/BTR-1-106': {
            requireRaided: true,
            getContinuousImpact: (engine) =>
                Array.from(document.querySelectorAll('#my-outside-area .card')).some(c => engine.getCardDef(c)?.traits?.includes('食べ物')) ? 1 : 0
        },

        // ガチゴリラ (4費)：前線 4 種異名攻擊得傷害(2)
        'UA09BT/BTR-1-024': {
            onAttack(engine, cardEl, done) {
                if (countDistinctFrontNames(engine) >= 4) {
                    engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                }
                done();
            }
        },

        // 黃事件：押忍!!クソ男飯!!／ボドゲの女王／目からビーム
        'UA09ST/BTR-1-109': {
            onEventPlay(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('ロボコ')) engine.activateMyApCards(1);
                engine.executeAbilityActions(cardEl, [
                    { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false },
                    { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
                ], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        },
        'UA09BT/BTR-1-029': {
            onEventPlay(engine, cardEl, done) {
                const limit = engine.hasCharacterOnMyField('円ちゅわ～ん') ? 5000 : 2000;
                retireOppFront(engine, 'ボドゲの女王', limit, () => {
                    engine.executeAbilityActions(cardEl, [{ type: 'LOOK_AND_ARRANGE_TOP', count: 1, keepUpTo: 1, remainderTo: 'BOTTOM' }], 0, { selectedTargets: [], addedFromLook: false }, done);
                });
            }
        },
        'UA09BT/BTR-1-030': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '目からビーム', engine.hasCharacterOnMyField('ロボコ') ? 5000 : 3000, done)
        },
        'UA09ST/BTR-1-030': { onEventPlay: (e, c, d) => window.UACardScripts['UA09BT/BTR-1-030'].onEventPlay(e, c, d) },

        // ==================== 藍色 ====================
        'UA09BT/BTR-1-041': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'GREEN']) ? 1 : 0 },

        // 膝ロボコ (5費)：登場抽2棄2，依場外〈ロボコのヒザ〉×1000退場
        'UA09BT/BTR-1-035': {
            onPlay(engine, cardEl, done) {
                engine.drawCards(2);
                engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 2 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                    const knees = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name?.includes('ロボコのヒザ')).length;
                    retireOppFront(engine, `膝ロボコ（ヒザ ${knees} 張）`, knees * 1000, done);
                });
            }
        },

        // 藍 ボンド (4費 Raid)：登場依場外事件數×1000彈回對手前線，本回合得衝擊(1)
        'UA09BT/BTR-1-038': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
                const limit = engine.countEventsInMyOutside() * 1000;
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
                if (!opp.length) { done(); return; }
                engine.promptModal({
                    title: `ボンド [登場時]（彈回 BP${limit} 以下）`, desc: '選擇最多 1 張對手前線角色退回手牌：',
                    cards: opp, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.requestBounceOpponentCard(sel[0]); done(); }
                });
            }
        },

        // 藍 ガチゴリラ (5費)：攻擊時手牌 5+ 得 BP+1000＆傷害(2)
        'UA09BT/BTR-1-047': {
            onAttack(engine, cardEl, done) {
                if (document.querySelectorAll('#my-hand-area .card').length >= 5) {
                    engine.addSlotBp(cardEl.parentElement, 1000);
                    engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                }
                done();
            }
        },

        // 藍事件：最終兵器破れたり～!!／難問
        'UA09BT/BTR-1-062': {
            onEventPlay(engine, cardEl, done) {
                const cnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('ロボコの敵')).length;
                retireOppFront(engine, '最終兵器破れたり～!!', cnt >= 3 ? 5000 : 3000, done);
            }
        },
        'UA09BT/BTR-1-064': {
            onEventPlay(engine, cardEl, done) {
                const limit = engine.hasCharacterOnMyField('モツオ') ? 5000 : 3000;
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
                const finish = () => { engine.drawCards(1); done(); };
                if (!opp.length) { finish(); return; }
                engine.promptModal({
                    title: `難問（彈回 BP${limit} 以下）`, desc: '選擇 1 張對手前線角色退回手牌並抽 1：',
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => { if (sel.length) engine.requestBounceOpponentCard(sel[0]); finish(); }
                });
            }
        }
    });
})();
