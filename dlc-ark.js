/**
 * Union Arena 卡片腳本 DLC：明日方舟 (Arknights) [ARK]
 * 涵蓋：藍（ロドス アーミヤ／ブレイズ／ニアール）、黃（レユニオン タルラ／フロストノヴァ／パトリオット／スカルシュレッダー）、紅（チェン）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
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
                    if (toRemove && sel[0].parentElement?.id.startsWith('opp-') && conn && isConnected) {
                        conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REMOVE_SLOT', slotId: sel[0].parentElement.id.replace('opp-', 'my-') });
                    } else engine.requestRetireOpponentCard(sel[0]);
                }
                onDone();
            }
        });
    };

    window.registerCardScripts({
        // ==================== 藍色：ロドス ====================
        'UA30ST/ARK-1-104': {
            onPlay(engine, cardEl, done) {
                engine.getSlotTopCards('#my-front-line .slot').forEach(c => { if (c !== cardEl) engine.addSlotBp(c.parentElement, 1000); });
                done();
            },
            onRetire(engine, cardEl, done) {
                engine.getSlotTopCards('#my-front-line .slot').forEach(c => { if (c !== cardEl) engine.addSlotBp(c.parentElement, 1000); });
                done();
            }
        },
        'UA30ST/ARK-1-107': {
            getContinuousImpact: (engine, cardEl) =>
                (engine.isMyTurn && engine.getSlotTopCards('#my-front-line .slot').some(c => c !== cardEl && engine.getEffectiveCardBp(c) >= 4000)) ? 1 : 0
        },
        'UA30ST/ARK-1-064': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'ソウルブースト', engine.hasCharacterOnMyField('アーミヤ') ? 5000 : 3000, done)
        },

        // ==================== 黃色：レユニオン ====================
        'UA30BT/ARK-1-018': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'RED']) ? 1 : 0 },
        'UA30BT/ARK-1-007': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1500 : 0
        },
        'UA30BT/ARK-1-006': {
            requireRaided: true,
            onAttack(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2000; done(); }
        },
        'UA30BT/ARK-1-011': {
            onUnblockedAttack(engine, cardEl, done) {
                const need = Math.max(0, 2 - document.querySelectorAll('#my-hand-area .card').length);
                if (need > 0) engine.drawCards(need);
                done();
            }
        },
        'UA30BT/ARK-1-015': {
            onPlay(engine, cardEl, done) {
                const act = myFieldTops(engine).filter(c => !c.classList.contains('rest'));
                if (!act.length) { retireOppFront(engine, 'タルラ [登場時]', 1000, done); return; }
                engine.promptModal({
                    title: 'タルラ [登場時]', desc: '選擇任意張活動角色轉為休息（每 1 張退場上限 +1000）：',
                    cards: act, selectCount: act.length, upTo: true,
                    onConfirm: (sel) => {
                        sel.forEach(c => c.classList.add('rest'));
                        retireOppFront(engine, `タルラ（休息 ${sel.length} 張）`, 1000 + sel.length * 1000, done);
                    }
                });
            },
            canActivateMain: (engine, cardEl) =>
                !engine.getRuntime(cardEl).usedOncePerTurn && myFieldTops(engine).some(c => c !== cardEl && c.classList.contains('rest')),
            onActivateMain(engine, cardEl, slot, done) {
                const rested = myFieldTops(engine).filter(c => c !== cardEl && c.classList.contains('rest'));
                engine.promptModal({
                    title: 'タルラ [起動メイン]', desc: '選擇任意張休息中的其他角色退場（每 1 張退場上限 +1000）：',
                    cards: rested, selectCount: rested.length, upTo: true,
                    onConfirm: (sel) => {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        sel.forEach(c => engine.retireCardFromSlot(c.parentElement));
                        retireOppFront(engine, `タルラ [起動メイン]`, 1000 + sel.length * 1000, done);
                    }
                });
            }
        },
        'UA30BT/ARK-1-016': {
            onAttack(engine, cardEl, done) {
                if (engine.isMyTurn && document.querySelectorAll('#my-hand-area .card').length <= 3) {
                    engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                }
                done();
            }
        },
        'UA30BT/ARK-1-017': {
            getEnergyDiscount: (engine) =>
                engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').filter(c => c.classList.contains('rest')).length >= 2 ? 4 : 0
        },
        'UA30BT/ARK-1-027': {
            canActivateMain: (engine, cardEl, slot) =>
                !cardEl.classList.contains('rest') && !!slot.closest('#my-front-line') && !engine.usedNamedAbilityThisTurn.has('ARK_FROSTNOVA'),
            onActivateMain(engine, cardEl, slot, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (!opp.length) { done(); return; }
                engine.promptModal({
                    title: 'フロストノヴァ [起動メイン]', desc: '選擇對手前線最多 2 張角色休息並凍結：',
                    cards: opp, selectCount: Math.min(2, opp.length), upTo: true,
                    onConfirm: (sel) => {
                        cardEl.classList.add('rest');
                        engine.usedNamedAbilityThisTurn.add('ARK_FROSTNOVA');
                        sel.forEach(t => {
                            t.classList.add('rest');
                            if (t.parentElement?.id.startsWith('opp-') && conn && isConnected) {
                                const sid = t.parentElement.id.replace('opp-', 'my-');
                                conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REST_SLOT', slotId: sid });
                                conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_FREEZE_SLOT', slotId: sid });
                            }
                        });
                        done();
                    }
                });
            }
        },
        'UA30BT/ARK-1-030': { onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '灼熱の息吹', 99999, done, true) },
        'UA30BT/ARK-1-031': {
            onEventPlay(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('フロストノヴァ')) retireOppFront(engine, 'Lullabye（退場強化）', 5000, done);
                else { showSysMsg('Lullabye：選擇對手前線 BP5000 以下 1 張休息並凍結。'); done(); }
            }
        }
    });
})();
