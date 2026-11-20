/**
 * Union Arena 卡片腳本 DLC：我獨自升級 (Solo Leveling) [SLG]
 * 涵蓋：紫（水篠旬 墓地強化／12費影之君主／向坂雫）、綠（水篠旬 墊底進化／第四次架南島レイド／最上真／向坂雫）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const outsideCount = () => document.querySelectorAll('#my-outside-area .card').length;

    const countTraitOnField = (engine, trait) =>
        myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes(trait)).length;

    const countUniqueTraitNames = (engine, trait) => {
        const set = new Set();
        myFieldTops(engine).forEach(c => {
            const d = engine.getCardDef(c);
            if (d && Array.isArray(d.traits) && d.traits.includes(trait) && d.name) set.add(d.name);
        });
        return set.size;
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
        // ==================== 紫色：影之軍團／墓地堆疊 ====================

        'UA51BT/SLG-1-017': {
            getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0
        },

        // 紫 水篠 旬 (4費 Raid)：攻擊時抽 1 棄 1，再依場外每 5 張 BP+500
        'UA51BT/SLG-1-020': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                engine.drawCards(1);
                engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                    const bonus = Math.floor(outsideCount() / 5) * 500;
                    if (bonus > 0) { engine.addSlotBp(cardEl.parentElement, bonus); showSysMsg(`水篠 旬 [アタック時]：場外強化 BP+${bonus}！`); }
                    done();
                });
            }
        },

        // 紫 水篠 旬 (5費 Raid)：BP6000+ 得衝擊(1)；攻擊時場外每 5 張 BP+500
        'UA51BT/SLG-1-021': {
            requireRaided: true,
            getContinuousImpact: (engine, cardEl) => engine.getEffectiveCardBp(cardEl) >= 6000 ? 1 : 0,
            onAttack(engine, cardEl, done) {
                const bonus = Math.floor(outsideCount() / 5) * 500;
                if (bonus > 0) { engine.addSlotBp(cardEl.parentElement, bonus); showSysMsg(`水篠 旬 [アタック時]：BP+${bonus}！`); }
                done();
            }
        },

        // 紫 水篠 旬 (12費 Raid BP 5000)：場上每張［特徴：影の軍団］減 1 費；登場前線/能源線影之軍團各 1 轉活動並得狙擊
        'UA51BT/SLG-1-022': {
            requireRaided: true,
            getEnergyDiscount: (engine) => countTraitOnField(engine, '影の軍団'),
            onPlay(engine, cardEl, done) {
                engine.getRuntime(cardEl).tempKeywords.SNIPE = 1;
                const frontShadows = engine.getSlotTopCards('#my-front-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('影の軍団'));
                const enShadows = engine.getSlotTopCards('#my-energy-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('影の軍団'));
                const pickEnergy = () => {
                    if (!enShadows.length) { done(); return; }
                    engine.promptModal({
                        title: '水篠 旬 [登場時]：能源線影の軍団轉活動', desc: '選擇最多 1 張轉為活動：',
                        cards: enShadows, selectCount: 1, upTo: true,
                        onConfirm: (sel) => { if (sel.length) sel[0].classList.remove('rest'); done(); }
                    });
                };
                if (!frontShadows.length) { pickEnergy(); return; }
                engine.promptModal({
                    title: '水篠 旬 [登場時]：前線影の軍団轉活動', desc: '選擇最多 1 張轉為活動：',
                    cards: frontShadows, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) sel[0].classList.remove('rest'); pickEnergy(); }
                });
            }
        },
        'UAPR/SLG-1-022': {
            requireRaided: true,
            getEnergyDiscount: (e) => window.UACardScripts['UA51BT/SLG-1-022'].getEnergyDiscount(e),
            onPlay: (e, c, d) => window.UACardScripts['UA51BT/SLG-1-022'].onPlay(e, c, d)
        },

        // スキル：君主の領域 (Field)：橫置全體影の軍団 BP+500（5 張以上 +1000）
        'UA51BT/SLG-1-035': {
            canActivateMain: (engine, cardEl) => !cardEl.classList.contains('rest'),
            onActivateMain(engine, cardEl, slot, done) {
                cardEl.classList.add('rest');
                const bonus = countTraitOnField(engine, '影の軍団') >= 5 ? 1000 : 500;
                myFieldTops(engine).forEach(c => {
                    if (engine.getCardDef(c)?.traits?.includes('影の軍団')) engine.addSlotBp(c.parentElement, bonus);
                });
                showSysMsg(`スキル：君主の領域：全體影の軍団 BP+${bonus}！`);
                done();
            }
        },

        // 紫事件：スキル：乱刀
        'UA51BT/SLG-1-040': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'スキル：乱刀', engine.hasCharacterOnMyField('水篠 旬') ? 5000 : 3000, done)
        },

        // ==================== 綠色：墊底進化／第四次架南島レイド ====================

        // 綠 水篠 旬 (6費 Raid)：常駐 BP+500
        'UA51BT/SLG-1-049': {
            requireRaided: true,
            getContinuousBpBonus: () => 500
        },

        // 綠 最上 真 (0費)：場上第四次架南島レイド 5 張以上我方回合 BP+1500
        'UA51BT/SLG-1-062': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && countTraitOnField(engine, '第四次架南島レイド') >= 5) ? 1500 : 0
        },

        // 綠 最上 真 (4費 Raid)：登場架南島5張以上對手前線 BP1500+ 全體 -1000
        'UA51BT/SLG-1-064': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                if (countTraitOnField(engine, '第四次架南島レイド') >= 5) {
                    document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                        const top = engine.getTopCardInSlot(slot);
                        if (top && engine.getEffectiveCardBp(top) >= 1500) engine.addSlotBp(slot, -1000);
                    });
                    showSysMsg('最上 真 [登場時]：對手前線 BP1500+ 全體 BP-1000！');
                }
                done();
            }
        },

        // 綠 アーシー (4費)：手牌 5 張以上我方回合 BP+1000＆衝擊(1)
        'UA51BT/SLG-1-065': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && document.querySelectorAll('#my-hand-area .card').length >= 5) ? 1000 : 0,
            getContinuousImpact: (engine) => (engine.isMyTurn && document.querySelectorAll('#my-hand-area .card').length >= 5) ? 1 : 0
        },

        // 綠 リュー (4費)：登場手牌 7 張以上回 2 AP
        'UA51BT/SLG-1-073': {
            onPlay(engine, cardEl, done) {
                if (document.querySelectorAll('#my-hand-area .card').length >= 7 && !engine.usedNamedAbilityThisTurn.has('SLG_RYU')) {
                    engine.usedNamedAbilityThisTurn.add('SLG_RYU');
                    engine.activateMyApCards(2);
                    showSysMsg('リュー [登場時]：手牌 7 張以上，將 2 張 AP 卡轉為活動！');
                }
                const chars = myFieldTops(engine);
                if (!chars.length) { done(); return; }
                engine.promptModal({
                    title: 'リュー [登場時]', desc: '選擇最多 1 張我方角色 BP+1000：',
                    cards: chars, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.addSlotBp(sel[0].parentElement, 1000); done(); }
                });
            }
        },

        // 綠事件：俺はな、絶えずレベルアップしてんだよ
        'UA51BT/SLG-1-076': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '俺はな、絶えずレベルアップしてんだよ', engine.hasCharacterOnMyField('水篠 旬') ? 5000 : 3000, done)
        },

        // 綠事件：架南島レイド攻略開始
        'UA51BT/SLG-1-077': {
            onEventPlay(engine, cardEl, done) {
                const limit = countTraitOnField(engine, '第四次架南島レイド') >= 5 ? 5000 : 2000;
                retireOppFront(engine, '架南島レイド攻略開始', limit, () => {
                    if (countUniqueTraitNames(engine, '第四次架南島レイド') >= 5) {
                        const chars = myFieldTops(engine);
                        if (chars.length) {
                            engine.promptModal({
                                title: '架南島レイド攻略開始（5種異名獎勵）', desc: '選擇最多 1 張我方角色 BP+1000：',
                                cards: chars, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length) engine.addSlotBp(sel[0].parentElement, 1000); done(); }
                            });
                            return;
                        }
                    }
                    done();
                });
            }
        }
    });
})();
