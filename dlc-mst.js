/**
 * Union Arena 卡片腳本 DLC：無職轉生 (Mushoku Tensei) [MST]
 * 涵蓋：藍（ルーデウス／エリス／ルイジェルド デッドエンド＆ロキシー事件軸）、綠（ラノア魔法大學 フィッツ／ロキシー／ザノバ）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
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
        // ==================== 藍色：デッドエンド／ロキシー事件軸 ====================
        'UA54BT/MST-1-005': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA54BT/MST-1-014': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },

        'UA54BT/MST-1-008': {
            requireRaided: true,
            onUnblockedAttack(engine, cardEl, done) { engine.drawCards(1); done(); }
        },
        'UA54BT/MST-1-009': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0
        },
        'UA54BT/MST-1-021': {
            canActivateMain: (engine, cardEl) =>
                !engine.getRuntime(cardEl).usedOncePerTurn && engine.hasCharacterOnMyField('ルーデウス') && engine.hasCharacterOnMyField('エリス'),
            onActivateMain(engine, cardEl, slot, done) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                cardEl.classList.remove('rest');
                done();
            }
        },
        'UA54BT/MST-1-031': {
            requireRaided: true,
            getContinuousImpact: (engine) => (engine.isMyTurn && engine.usedEventThisTurn) ? 1 : 0
        },
        'UA54BT/MST-1-035': {
            onEventPlay(engine, cardEl, done) {
                let d = 0;
                if (engine.hasCharacterOnMyField('ルーデウス')) d++;
                if (engine.hasCharacterOnMyField('エリス')) d++;
                if (engine.hasCharacterOnMyField('ルイジェルド')) d++;
                if (d > 0) engine.drawCards(d);
                done();
            }
        },
        'UA54BT/MST-1-036': {
            getEnergyDiscount: (engine) => Math.floor(engine.countEventsInMyOutside() / 2),
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '豪雷積層雲', 5000, done)
        },
        'UA54BT/MST-1-038': {
            onEventPlay(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('ロキシー')) engine.activateMyApCards(1);
                engine.executeAbilityActions(cardEl, [
                    { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false },
                    { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }
                ], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        },

        // ==================== 綠色：ラノア魔法大學 ====================
        'UA54BT/MST-1-054': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const hasFieldOut = Array.from(document.querySelectorAll('#my-outside-area .card')).some(c => engine.getCardDef(c)?.type === 'FIELD');
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (!hasFieldOut || !opp.length) { done(); return; }
                engine.promptModal({
                    title: 'ロキシー [登場時]', desc: '選擇對手前線最多 1 張角色休息並凍結（失去原效果）：',
                    cards: opp, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.requestRestOpponentCard(sel[0]);
                            engine.requestFreezeOpponentCard(sel[0]);
                        }
                        done();
                    }
                });
            }
        },
        'UA54BT/MST-1-064': {
            onRetire(engine, cardEl, done) {
                engine.moveCardToZone(cardEl, document.getElementById('my-hand-area'));
                showSysMsg('バーディガーディ [退場時]：已返回手牌！');
                done();
            }
        }
    });
})();
