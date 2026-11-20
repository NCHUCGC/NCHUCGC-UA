/**
 * Union Arena 卡片腳本 DLC：犬夜叉 (Inuyasha) [IYS]
 * 涵蓋：紫（殺生丸 場外蘇生／奈落 墊底一派）、紅（犬夜叉／日暮かごめ／珊瑚＆弥勒）核心卡片
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
        // ==================== 紫色：殺生丸／奈落 ====================
        'UA50BT/IYS-1-005': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },

        'UA50BT/IYS-1-027': {
            canActivateMain: (engine, cardEl) =>
                !engine.getRuntime(cardEl).usedOncePerTurn && myFieldTops(engine).some(c => engine.getCardDef(c)?.traits?.includes('奈落一派')),
            onActivateMain(engine, cardEl, slot, done) {
                const narakuTeam = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('奈落一派'));
                engine.promptModal({
                    title: '奈落 [起動メイン]：退場奈落一派', desc: '選擇 1 張［特徴：奈落一派］退場（自身轉活動＋衝擊 1＋降對手 BP-1000）：',
                    cards: narakuTeam, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (!sel.length) { done(); return; }
                        const rt = engine.getRuntime(cardEl);
                        rt.usedOncePerTurn = true;
                        engine.retireCardFromSlot(sel[0].parentElement);
                        cardEl.classList.remove('rest');
                        rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                        const opp = engine.getSlotTopCards('#opp-front-line .slot');
                        if (!opp.length) { done(); return; }
                        engine.promptModal({
                            title: '選擇降 BP-1000 目標', desc: '選擇對手前線最多 1 張：', cards: opp, selectCount: 1, upTo: true,
                            onConfirm: (t) => { if (t.length) engine.addSlotBp(t[0].parentElement, -1000); done(); }
                        });
                    }
                });
            }
        },
        'UA50BT/IYS-1-035': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('奈落一派')).length;
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (!opp.length || cnt === 0) { done(); return; }
                engine.promptModal({
                    title: `瘴気 (BP-${cnt * 1000})`, desc: '選擇對手前線 1 張角色降 BP：', cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => { if (sel.length) engine.addSlotBp(sel[0].parentElement, -cnt * 1000); done(); }
                });
            }
        },
        'UA50BT/IYS-1-037': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '爆砕牙', engine.hasCharacterOnMyField('殺生丸') ? 5000 : 3000, done)
        },

        // ==================== 紅色：犬夜叉一行 ====================
        'UA50BT/IYS-1-043': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA50BT/IYS-1-061': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },

        'UA50BT/IYS-1-046': {
            requireRaided: true,
            onUnblockedAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                if (!rt._iysUnblockedDraw) { rt._iysUnblockedDraw = true; engine.drawCards(1); }
                done();
            }
        },
        'UA50BT/IYS-1-059': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.drawCards(engine.hasCharacterOnMyField('弥勒') ? 2 : 1);
                engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        },
        'UA50BT/IYS-1-071': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const outEv = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.type === 'EVENT');
                const hasSango = engine.hasCharacterOnMyField('珊瑚');
                if (!outEv.length || !hasSango) { retireOppFront(engine, '弥勒 [登場時]', 2500, done); return; }
                engine.promptModal({
                    title: '弥勒 [登場時]：移除場外事件強化', desc: '選擇任意張場外事件卡移至移除區（每 1 張退場上限 +500）：',
                    cards: outEv, selectCount: outEv.length, upTo: true,
                    onConfirm: (sel) => {
                        const rem = document.getElementById('my-remove-area');
                        sel.forEach(c => engine.moveCardToZone(c, rem));
                        retireOppFront(engine, `弥勒（移除 ${sel.length} 張）`, 2500 + sel.length * 500, done);
                    }
                });
            }
        },
        'UA50BT/IYS-1-075': {
            onEventPlay(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('七宝')) engine.activateMyApCards(1);
                engine.executeAbilityActions(cardEl, [
                    { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true },
                    { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }
                ], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        }
    });
})();
