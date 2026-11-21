/**
 * Union Arena 卡片腳本 DLC：我的英雄學院 (My Hero Academia) [MHA]
 * 涵蓋：紫（オール・フォー・ワン／死柄木／荼毘／トゥワイス）、綠（オールマイト／通形ミリオ／綠谷出久）、紅（エンデヴァー）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const countOtherReq4Plus = (engine, cardEl) =>
        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== cardEl && (engine.getCardDef(c)?.requiredEnergy?.count || 0) >= 4).length;

    const retireOppFront = (engine, title, limit, onDone, toRemove = false) => {
        const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
        if (!cands.length) { showSysMsg(`對手前線無 BP${limit} 以下角色。`); onDone(); return; }
        engine.promptModal({
            title: `${title} (BP${limit}以下)`, desc: `選擇最多 1 張對手前線 BP${limit} 以下角色${toRemove ? '移至移除區' : '退場'}：`,
            cards: cands, selectCount: 1, upTo: true,
            onConfirm: (sel) => {
                if (sel.length) {
                    if (toRemove) engine.requestRemoveOpponentCard(sel[0]);
                    else engine.requestRetireOpponentCard(sel[0]);
                }
                onDone();
            }
        });
    };

    window.registerCardScripts({
        // ==================== 紫色：敵聯合 ====================
        'UA10BT/MHA-1-021': { getEnergyDiscount: (engine) => hasOppColor(engine, ['GREEN', 'RED']) ? 1 : 0 },

        // オール・フォー・ワン (8費)：場上起動メイン角色 3 張以上減 3 費
        'UA10BT/MHA-1-004': {
            getEnergyDiscount: (engine) =>
                engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => (engine.getCardDef(c)?.effectText || '').includes('[起動メイン]')).length >= 3 ? 3 : 0
        },

        // ギガントマキア (5費)：我方回合 BP+2000；起動得傷害(2)
        'UA10BT/MHA-1-005': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 2000 : 0,
            canActivateMain: (engine, cardEl) => !engine.getRuntime(cardEl).usedOncePerTurn,
            onActivateMain(engine, cardEl, slot, done) {
                const rt = engine.getRuntime(cardEl);
                rt.usedOncePerTurn = true;
                rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2);
                done();
            }
        },

        // 死柄木 弔 (5費 Raid)：前線起動移除對手前線 BP2000 以下
        'UA10BT/MHA-1-010': {
            requireRaided: true,
            canActivateMain: (engine, cardEl, slot) => !engine.getRuntime(cardEl).usedOncePerTurn && !!slot.closest('#my-front-line'),
            onActivateMain(engine, cardEl, slot, done) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                retireOppFront(engine, '死柄木 弔 [起動メイン]', 2000, done, true);
            }
        },

        // 紫事件：崩壊
        'UA10BT/MHA-1-033': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '崩壊', 4000, done, true)
        },

        // ==================== 綠色：雄英高校／BIG3 ====================
        'UA10BT/MHA-1-037': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'RED']) ? 1 : 0 },

        // オールマイト (ST 4費)：我方回合 BP+1000；前線登場持續 BP+1000
        'UA10ST/MHA-1-102': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0,
            onPlay(engine, cardEl, done) {
                if (cardEl.closest('#my-front-line')) {
                    const rt = engine.getRuntime(cardEl);
                    rt.persistentBp = (rt.persistentBp || 0) + 1000;
                    engine.addSlotBp(cardEl.parentElement, 1000);
                }
                done();
            }
        },

        // オールマイト (8費 BP 5000)：我方前線空場且對手前線 3 張以上減 6 費
        'UA10BT/MHA-1-045': {
            getEnergyDiscount(engine) {
                const myFl = engine.getSlotTopCards('#my-front-line .slot').length;
                const oppFl = engine.getSlotTopCards('#opp-front-line .slot').length;
                return (myFl === 0 && oppFl >= 3) ? 6 : 0;
            }
        },

        // 通形 ミリオ (4費 / 6費 Raid)：4費減1費；不被 BP3000 以下阻擋；6費未防禦抽1
        'UA10BT/MHA-1-050': {
            getEnergyDiscount: () => 1,
            onAttack(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 3000; done(); }
        },
        'UA10BT/MHA-1-051': {
            requireRaided: true,
            onAttack(engine, cardEl, done) { engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 3000; done(); },
            onUnblockedAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                if (!rt.usedOncePerTurn) { rt.usedOncePerTurn = true; engine.drawCards(1); }
                done();
            }
        },

        // 波動 ねじれ (5費)：登場有其他 4 費以上 3 張則退場對手前線 BP5000 以下
        'UA10BT/MHA-1-055': {
            onPlay(engine, cardEl, done) {
                if (countOtherReq4Plus(engine, cardEl) >= 3) retireOppFront(engine, '波動 ねじれ [登場時]', 5000, done);
                else done();
            }
        },

        // 綠谷 出久 (3費 Raid)：我方回合 BP+500
        'UA10BT/MHA-1-060': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0
        },

        // 綠事件：デトロイト スマッシュ／ファントム・メナス
        'UA10BT/MHA-1-063': {
            onEventPlay(engine, cardEl, done) {
                const chars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
                if (!chars.length) { done(); return; }
                engine.promptModal({
                    title: 'デトロイト スマッシュ', desc: '選擇 1 張我方角色 BP+2500（オールマイト／緑谷出久再獲得 [狙い撃ち]）：',
                    cards: chars, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.addSlotBp(sel[0].parentElement, 2500);
                            if (/オールマイト|緑谷 出久/.test(engine.getCardDef(sel[0])?.name || '')) engine.getRuntime(sel[0]).tempKeywords.SNIPE = 1;
                        }
                        done();
                    }
                });
            }
        },
        'UA10ST/MHA-1-063': { onEventPlay: (e, c, d) => window.UACardScripts['UA10BT/MHA-1-063'].onEventPlay(e, c, d) },
        'UA10BT/MHA-1-064': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'ファントム・メナス', engine.hasCharacterOnMyField('通形 ミリオ') ? 5000 : 3000, done)
        },

        // ==================== 紅色：エンデヴァー ====================
        'UA10BT/MHA-1-069': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'GREEN']) ? 1 : 0 },

        // エンデヴァー (5費)：攻擊時棄任意張手牌，退場張數×1000以下
        'UA10BT/MHA-1-072': {
            onAttack(engine, cardEl, done) {
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                if (!hand.length) { done(); return; }
                engine.promptModal({
                    title: 'エンデヴァー [アタック時]', desc: '選擇任意張手牌放置於場外（退場 張數×1000 以下對手前線 1 張）：',
                    cards: hand, selectCount: hand.length, upTo: true,
                    onConfirm: (sel) => {
                        if (!sel.length) { done(); return; }
                        const out = document.getElementById('my-outside-area');
                        sel.forEach(c => engine.moveCardToZone(c, out));
                        retireOppFront(engine, `エンデヴァー（棄 ${sel.length} 張）`, sel.length * 1000, done);
                    }
                });
            }
        }
    });
})();
