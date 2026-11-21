/**
 * Union Arena 卡片腳本 DLC：幽遊白書 (Yu Yu Hakusho) [YYH]
 * 涵蓋：紫（戸愚呂弟／鴉／陣／是流）、綠（浦飯幽助／蔵馬／桑原／飛影）、紅（飛影事件軸／妖狐蔵馬）核心卡片
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
            title: `${title} (BP${limit}以下)`,
            desc: `選擇最多 1 張對手前線 BP${limit} 以下角色退場：`,
            cards: cands, selectCount: 1, upTo: true,
            onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); onDone(); }
        });
    };

    window.registerCardScripts({
        // ==================== 紫色：暗黑武術會／戸愚呂隊 ====================

        'UA21BT/YYH-1-004': {
            getEnergyDiscount: (engine) => hasOppColor(engine, ['GREEN', 'RED']) ? 1 : 0
        },

        // 鴉 (5費 Raid)：登場對手前線有 BP3000 以下則純抽 2，否則抽 2 棄 1
        'UA21BT/YYH-1-008': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.drawCards(2);
                const hasLow = engine.getSlotTopCards('#opp-front-line .slot').some(c => engine.getEffectiveCardBp(c) <= 3000);
                if (hasLow) { showSysMsg('鴉 [登場時]：對手前線有 BP3000 以下角色，純抽 2 張！'); done(); }
                else engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        },

        // 是流 (5費)：有〈酎〉或〈鈴駒〉得傷害(2)；攻擊時可棄 2 手牌得衝擊(1)
        'UA21BT/YYH-1-018': {
            onAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                if (engine.hasCharacterOnMyField('酎') || engine.hasCharacterOnMyField('鈴駒')) {
                    rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2);
                }
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                if (hand.length < 2) { done(); return; }
                engine.promptModal({
                    title: '是流 [アタック時]',
                    desc: '是否棄 2 張手牌獲得 [インパクト(1)]？',
                    cards: hand, selectCount: 2, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length === 2) {
                            const out = document.getElementById('my-outside-area');
                            sel.forEach(c => engine.moveCardToZone(c, out));
                            rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                        }
                        done();
                    }
                });
            }
        },

        // 酎 (4費)：登場 BP+1000＆傷害(2)；攻擊時對手能源線滿 4 張抽 1
        'UA21BT/YYH-1-019': {
            onPlay(engine, cardEl, done) {
                engine.addSlotBp(cardEl.parentElement, 1000);
                engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                done();
            },
            onAttack(engine, cardEl, done) {
                const oppEn = engine.getSlotTopCards('#opp-energy-line .slot').length;
                if (oppEn >= 4) { engine.drawCards(1); showSysMsg('酎 [アタック時]：對手能源線無空位，抽 1 張！'); }
                done();
            }
        },

        // 戸愚呂（弟） (ST 5費)：起動退場我方其他角色，降對手前線 BP-2000 並得衝擊(1)
        'UA21ST/YYH-1-111': {
            canActivateMain(engine, cardEl, slot) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && !!slot.closest('#my-front-line') &&
                    engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => c !== cardEl);
            },
            onActivateMain(engine, cardEl, slot, done) {
                const others = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => c !== cardEl);
                engine.promptModal({
                    title: '戸愚呂（弟）[起動メイン]', desc: '選擇 1 張其他角色退場：', cards: others, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (!sel.length) { done(); return; }
                        const rt = engine.getRuntime(cardEl);
                        rt.usedOncePerTurn = true;
                        engine.retireCardFromSlot(sel[0].parentElement);
                        rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                        const opp = engine.getSlotTopCards('#opp-front-line .slot');
                        if (!opp.length) { done(); return; }
                        engine.promptModal({
                            title: '選擇降 BP 目標', desc: '選擇對手前線最多 1 張 BP-2000：', cards: opp, selectCount: 1, upTo: true,
                            onConfirm: (t) => { if (t.length) engine.addSlotBp(t[0].parentElement, -2000); done(); }
                        });
                    }
                });
            }
        },

        // 戸愚呂（弟） (8費 Raid BP 5000)：登場對手前線全體 BP-1000，再退場 BP4000 以下 1 張
        'UA21BT/YYH-1-025': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                    if (engine.getTopCardInSlot(slot)) engine.addSlotBp(slot, -1000);
                });
                retireOppFront(engine, '戸愚呂（弟）[登場時]', 4000, done);
            }
        },

        // 紫事件：100%中の100%
        'UA21BT/YYH-1-032': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '100%中の100%', engine.hasCharacterOnMyField('戸愚呂（弟）') ? 5000 : 3000, done)
        },

        // ==================== 綠色：浦飯隊 ====================

        'UA21BT/YYH-1-062': {
            getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'RED']) ? 1 : 0
        },

        // 浦飯 幽助 (7費 Raid BP 5000)：登場得狙擊；攻擊時二選一（未防禦橫置對手 OR 衝擊1）
        'UA21BT/YYH-1-038': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.getRuntime(cardEl).tempKeywords.SNIPE = 1;
                showSysMsg('浦飯 幽助 [登場時]：本回合獲得 [狙い撃ち]！');
                done();
            },
            onAttack(engine, cardEl, done) {
                engine.promptModal({
                    title: '浦飯 幽助 [アタック時]：二選一',
                    desc: '請選擇要發動的效果：',
                    cards: [cardEl],
                    customButtons: [
                        { label: '獲得 [インパクト(1)]', color: '#c1596f', onClick: () => { engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1); done(); } },
                        { label: '未防禦時橫置對手前線 1 張', color: '#4f9678', onClick: () => { engine.getRuntime(cardEl)._yyhRestOnUnblocked = true; done(); } }
                    ]
                });
            },
            onUnblockedAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                if (!rt._yyhRestOnUnblocked) { done(); return; }
                rt._yyhRestOnUnblocked = false;
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (!opp.length) { done(); return; }
                engine.promptModal({
                    title: '浦飯 幽助：未防禦觸發', desc: '選擇對手前線最多 1 張轉為休息：', cards: opp, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length) engine.requestRestOpponentCard(sel[0]);
                        done();
                    }
                });
            }
        },
        'UAPR/YYH-1-038': {
            requireRaided: true,
            onPlay: (e, c, d) => window.UACardScripts['UA21BT/YYH-1-038'].onPlay(e, c, d),
            onAttack: (e, c, d) => window.UACardScripts['UA21BT/YYH-1-038'].onAttack(e, c, d),
            onUnblockedAttack: (e, c, d) => window.UACardScripts['UA21BT/YYH-1-038'].onUnblockedAttack(e, c, d)
        },

        // 綠 飛影 (5費 BP 4000)：攻擊時二選一（不被 BP2500 以下阻擋 OR 傷害(2)）
        'UA21BT/YYH-1-054': {
            onAttack(engine, cardEl, done) {
                engine.promptModal({
                    title: '飛影 [アタック時]：二選一', desc: '請選擇要發動的效果：', cards: [cardEl],
                    customButtons: [
                        { label: '不被 BP2500 以下角色阻擋', color: '#6c93c7', onClick: () => { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 2500; done(); } },
                        { label: '獲得 [ダメージ(2)]', color: '#e67e22', onClick: () => { engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2); done(); } }
                    ]
                });
            }
        },

        // 綠事件：霊丸
        'UA21BT/YYH-1-065': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '霊丸', engine.hasCharacterOnMyField('浦飯 幽助') ? 5000 : 3000, done)
        },
        'UA21ST/YYH-1-065': {
            onEventPlay: (e, c, d) => window.UACardScripts['UA21BT/YYH-1-065'].onEventPlay(e, c, d)
        },

        // ==================== 紅色：飛影事件軸／妖狐蔵馬 ====================

        'UA21BT/YYH-1-077': {
            getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'GREEN']) ? 1 : 0
        },

        // 紅 蔵馬 (5費)：登場抽牌到手牌 3 張
        'UA21BT/YYH-1-073': {
            onPlay(engine, cardEl, done) {
                const need = Math.max(0, 3 - document.querySelectorAll('#my-hand-area .card').length);
                if (need > 0) engine.drawCards(need);
                done();
            }
        },

        // 紅 飛影 (4費 Raid)：本回合用過事件得衝擊(1)
        'UA21BT/YYH-1-083': {
            requireRaided: true,
            getContinuousImpact: (engine) => (engine.isMyTurn && engine.usedEventThisTurn) ? 1 : 0,
            onPlay(engine, cardEl, done) {
                if (!engine.isMyTurn) { done(); return; }
                const blacks = Array.from(document.querySelectorAll('#my-outside-area .card'))
                    .filter(c => engine.getCardDef(c)?.name?.includes('邪王炎殺黒龍波'));
                if (!blacks.length || engine.getActiveApCards().length < 1) { done(); return; }
                engine.promptModal({
                    title: '飛影 [登場時]', desc: '是否支付 1 AP 從場外發動〈邪王炎殺黒龍波〉（使用後移至移除區）？',
                    cards: blacks, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (!sel.length || !engine.payAp(1)) { done(); return; }
                        engine.usedEventThisTurn = true;
                        engine.moveCardToZone(sel[0], document.getElementById('my-remove-area'));
                        retireOppFront(engine, '邪王炎殺黒龍波（場外發動）', 5000, done);
                    }
                });
            }
        },

        // 紅 雪菜 (3費)：登場下次事件卡 AP-1
        'UA21BT/YYH-1-090': {
            onPlay(engine, cardEl, done) {
                engine.pendingApDiscounts.push({
                    amount: 1, desc: '雪菜 (事件卡 AP-1)',
                    matchFn: (d) => d?.type === 'EVENT'
                });
                showSysMsg('雪菜 [登場時]：本回合下次使用事件卡消費 AP-1！');
                done();
            }
        },

        // 妖狐蔵馬 (4費 Raid)：起動給 BP+1000 或 棄2手牌得 2回アタック
        'UA21BT/YYH-1-091': {
            requireRaided: true,
            canActivateMain(engine, cardEl, slot) {
                const rt = engine.getRuntime(cardEl);
                return !!slot.closest('#my-front-line') && (!rt._yokoBpUsed || (!rt._yokoDoubleUsed && document.querySelectorAll('#my-hand-area .card').length >= 2));
            },
            onActivateMain(engine, cardEl, slot, done) {
                const rt = engine.getRuntime(cardEl);
                const btns = [];
                if (!rt._yokoBpUsed) {
                    btns.push({
                        label: '我方角色 1 張 BP+1000', color: '#4f9678',
                        onClick: () => {
                            const chars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
                            engine.promptModal({
                                title: '妖狐蔵馬：選擇強化目標', desc: '選擇 1 張角色 BP+1000：', cards: chars, selectCount: 1, upTo: false,
                                onConfirm: (sel) => { if (sel.length) { rt._yokoBpUsed = true; engine.addSlotBp(sel[0].parentElement, 1000); } done(); }
                            });
                        }
                    });
                }
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                if (!rt._yokoDoubleUsed && hand.length >= 2) {
                    btns.push({
                        label: '棄 2 張手牌獲得 [2回アタック]', color: '#d35400',
                        onClick: () => engine.promptModal({
                            title: '妖狐蔵馬：棄 2 張手牌', desc: '選擇 2 張手牌放置於場外：', cards: hand, selectCount: 2, upTo: false,
                            onConfirm: (sel) => {
                                if (sel.length === 2) {
                                    rt._yokoDoubleUsed = true;
                                    const out = document.getElementById('my-outside-area');
                                    sel.forEach(c => engine.moveCardToZone(c, out));
                                    rt.tempKeywords.DOUBLE_ATTACK = 1;
                                    showSysMsg('妖狐蔵馬本回合獲得 [2回アタック]！');
                                }
                                done();
                            }
                        })
                    });
                }
                if (!btns.length) { done(); return; }
                engine.promptModal({ title: '妖狐蔵馬 [起動メイン]', desc: '選擇要發動的起動效果：', cards: [cardEl], customButtons: btns });
            }
        },

        // 妖狐蔵馬 (6費 Raid)：登場 BP+3000；BP5000+ 衝擊(1)、BP8000+ 狙擊；起動棄 1 手牌 BP+1000
        'UA21BT/YYH-1-092': {
            requireRaided: true,
            getContinuousImpact: (engine, cardEl) => (engine.isMyTurn && engine.getEffectiveCardBp(cardEl) >= 5000) ? 1 : 0,
            onPlay(engine, cardEl, done) {
                engine.addSlotBp(cardEl.parentElement, 3000);
                if (engine.getEffectiveCardBp(cardEl) >= 8000) engine.getRuntime(cardEl).tempKeywords.SNIPE = 1;
                done();
            },
            canActivateMain: (engine, cardEl, slot) => !!slot.closest('#my-front-line') && document.querySelectorAll('#my-hand-area .card').length >= 1,
            onActivateMain(engine, cardEl, slot, done) {
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                engine.promptModal({
                    title: '妖狐蔵馬 [起動メイン]：BP+1000', desc: '選擇 1 張手牌放置於場外：', cards: hand, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                            engine.addSlotBp(slot, 1000);
                            if (engine.getEffectiveCardBp(cardEl) >= 8000) engine.getRuntime(cardEl).tempKeywords.SNIPE = 1;
                        }
                        done();
                    }
                });
            }
        },

        // 紅事件：邪王炎殺黒龍波
        'UA21BT/YYH-1-097': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '邪王炎殺黒龍波', engine.hasCharacterOnMyField('飛影') ? 5000 : 3000, done)
        },

        // 紅事件：薔薇棘鞭刃
        'UA21BT/YYH-1-100': {
            onEventPlay: (engine, cardEl, done) => {
                const otherHand = document.querySelectorAll('#my-hand-area .card').length;
                retireOppFront(engine, '薔薇棘鞭刃', otherHand <= 3 ? 5000 : 3000, done);
            }
        }
    });
})();
