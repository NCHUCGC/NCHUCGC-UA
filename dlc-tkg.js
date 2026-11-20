/**
 * Union Arena 卡片腳本 DLC：東京喰種 (Tokyo Ghoul) [TKG]
 * 涵蓋：紫（金木研／霧嶋董香／ウタ）、黃（有馬貴将／佐々木琲世／鈴屋什造）、紅（金木研 生命軸）核心卡片
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
        // ==================== 紫色：あんていく ====================
        'UA47ST/TKG-1-103': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0
        },
        'UA47ST/TKG-1-104': {
            canActivateMain: (engine, cardEl) =>
                !engine.getRuntime(cardEl).usedOncePerTurn &&
                engine.getSlotTopCards('#my-front-line .slot').some(c => !c.classList.contains('rest') && engine.getCardDef(c)?.name?.includes('金木 研') && (engine.getCardDef(c)?.requiredEnergy?.count || 0) <= 4),
            onActivateMain(engine, cardEl, slot, done) {
                const kanekis = engine.getSlotTopCards('#my-front-line .slot')
                    .filter(c => !c.classList.contains('rest') && engine.getCardDef(c)?.name?.includes('金木 研') && (engine.getCardDef(c)?.requiredEnergy?.count || 0) <= 4);
                engine.promptModal({
                    title: '霧嶋 董香 [起動メイン]', desc: '選擇前線 1 張 4 費以下活動〈金木 研〉休息，獲得 [2回アタック]：',
                    cards: kanekis, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            const rt = engine.getRuntime(cardEl);
                            rt.usedOncePerTurn = true;
                            sel[0].classList.add('rest');
                            rt.tempKeywords.DOUBLE_ATTACK = 1;
                        }
                        done();
                    }
                });
            }
        },
        'UA47ST/TKG-1-109': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'ここに てめえのものなんか...', engine.hasCharacterOnMyField('霧嶋 董香') ? 5000 : 3000, done)
        },

        // ==================== 黃色：CCG ====================
        'UA47BT/TKG-1-012': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'RED']) ? 1 : 0 },
        'UA47BT/TKG-1-004': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                if (!rt._arimaAtk1) { rt._arimaAtk1 = true; rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2); }
                done();
            }
        },
        'UA47BT/TKG-1-016': {
            requireRaided: true,
            canActivateMain: (engine, cardEl) => {
                const rt = engine.getRuntime(cardEl);
                return rt.enteredThisTurn && !rt.usedOncePerTurn;
            },
            onActivateMain(engine, cardEl, slot, done) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                engine.activateMyApCards(3);
                showSysMsg('佐々木 琲世 [起動メイン]：全部 AP 卡轉為活動（本回合無法使用手牌）！');
                done();
            }
        },
        'UA47BT/TKG-1-029': {
            onEventPlay(engine, cardEl, done) {
                retireOppFront(engine, 'CCGの死神', 5000, () => {
                    engine.drawCards(1);
                    engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
                });
            }
        },
        'UA47BT/TKG-1-032': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '僕に...勇気を...。', engine.hasCharacterOnMyField('佐々木 琲世') ? 5000 : 3000, done)
        },

        // ==================== 紅色：金木研 生命軸 ====================
        'UA47ST/TKG-1-112': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && document.querySelectorAll('#my-life-area .card').length <= 5) ? 500 : 0
        }
    });
})();
