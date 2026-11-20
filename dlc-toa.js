/**
 * Union Arena 卡片腳本 DLC：破曉傳奇 (Tales of Arise) [TOA]
 * 涵蓋：紅（アルフェン 生命自殘軸／シオン）、藍（リンウェル＆ロウ 事件軸／キサラ＆テュオハリム）、綠（アルフェン＆シオン）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

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
        // ==================== 紅色：炎之劍（生命自殘軸） ====================
        'UA06ST/TOA-1-096': {
            onEventPlay(engine, cardEl, done) {
                const limit = (engine.hasCharacterOnMyField('アルフェン') && document.querySelectorAll('#my-life-area .card').length <= 5) ? 5000 : 3000;
                retireOppFront(engine, '緋炎衝・開', limit, done);
            }
        },
        'UA06ST/TOA-1-101': {
            canActivateMain: (engine, cardEl) => !engine.getRuntime(cardEl).usedOncePerTurn && document.querySelectorAll('#my-life-area .card').length >= 1,
            onActivateMain(engine, cardEl, slot, done) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                const life = Array.from(document.querySelectorAll('#my-life-area .card'));
                if (life.length) engine.moveCardToZone(life[life.length - 1], document.getElementById('my-outside-area'));
                engine.addSlotBp(slot, 1000);
                done();
            }
        },
        'UA06ST/TOA-1-102': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                const life = Array.from(document.querySelectorAll('#my-life-area .card'));
                if (!life.length) { done(); return; }
                engine.promptModal({
                    title: 'アルフェン [アタック時]', desc: '是否將 1 張生命卡放置於場外，獲得 [ダメージ(2)]？', cards: [cardEl],
                    customButtons: [
                        {
                            label: '生命 1 張置場外：獲得 [ダメージ(2)]', color: '#c1596f',
                            onClick: () => {
                                engine.moveCardToZone(life[life.length - 1], document.getElementById('my-outside-area'));
                                engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                                done();
                            }
                        },
                        { label: '不發動', color: '#7f8c8d', onClick: () => done() }
                    ]
                });
            }
        },

        // ==================== 藍色：リンウェル事件軸／キサラ ====================
        'UA06BT/TOA-1-009': { getEnergyDiscount: (engine) => hasOppColor(engine, ['GREEN', 'RED']) ? 1 : 0 },
        'UA06BT/TOA-1-010': {
            requireRaided: true,
            onAttack(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2000; done(); }
        },
        'UA06BT/TOA-1-021': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.pendingApDiscounts.push({ amount: 1, desc: 'リンウェル (事件 AP-1)', matchFn: (d) => d?.type === 'EVENT' });
                engine.drawCards(1);
                engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        },
        'UA06BT/TOA-1-025': {
            onAttack(engine, cardEl, done) {
                const ev = engine.countEventsInMyOutside();
                if (ev >= 5) engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                if (ev >= 7) {
                    const opp = engine.getSlotTopCards('#opp-front-line .slot');
                    if (opp.length) {
                        engine.promptModal({
                            title: 'ロウ [アタック時]（場外事件 7+）', desc: '選擇對手前線最多 1 張轉為休息：',
                            cards: opp, selectCount: 1, upTo: true,
                            onConfirm: (sel) => {
                                if (sel.length && sel[0].parentElement?.id.startsWith('opp-') && conn && isConnected) {
                                    sel[0].classList.add('rest');
                                    conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REST_SLOT', slotId: sel[0].parentElement.id.replace('opp-', 'my-') });
                                }
                                done();
                            }
                        });
                        return;
                    }
                }
                done();
            }
        },
        'UA06BT/TOA-1-030': {
            onEventPlay(engine, cardEl, done) {
                const limit = 2000 + (engine.hasCharacterOnMyField('リンウェル') ? engine.countEventsInMyOutside() * 1000 : 0);
                retireOppFront(engine, '白薙・神鳴', limit, done);
            }
        },
        'UA06BT/TOA-1-031': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '聖煌割砕壁', engine.hasCharacterOnMyField('キサラ') ? 5000 : 3000, done)
        },

        // ==================== 綠色 ====================
        'UA06BT/TOA-1-036': {
            getContinuousImpact: (engine) => engine.hasCharacterOnMyField('シオン') ? 1 : 0
        }
    });
})();
