/**
 * Union Arena 卡片腳本 DLC：新世紀福音戰士 (EVANGELION) [EVA]
 * 涵蓋：紅（初號機 疑似シン化／2號機 無Trigger軸／零號機）、紫（第13號機 墓地13/26／ガイウスの槍／WILLE 改2/改8/新2）、黃（アスカ／レイ／マリ）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const outsideCount = () => document.querySelectorAll('#my-outside-area .card').length;
    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const countNoTriggerOnField = (engine) =>
        myFieldTops(engine).filter(c => {
            const d = engine.getCardDef(c);
            return d && (!d.triggerText || d.triggerText === '-' || d.triggerText.trim() === '');
        }).length;

    const countUnder = (cardEl) =>
        cardEl?.parentElement ? Array.from(cardEl.parentElement.querySelectorAll('.card')).filter(c => c !== cardEl && c.classList.contains('is-flipped')).length : 0;

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
        // ==================== 紅色：初號機／零號機／2號機 無Trigger軸 ====================

        'UA44BT/EVA-1-076': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'PURPLE']) ? 1 : 0 },
        'UA44ST/EVA-1-076': { getEnergyDiscount: (e) => window.UACardScripts['UA44BT/EVA-1-076'].getEnergyDiscount(e) },
        'UA44BT/EVA-1-074': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA44BT/EVA-1-088': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },

        // エヴァンゲリオン初号機 (ST 5費 Raid)：攻擊時橫置能源線活動卡，費用合計 4+ BP+3000、8+ 傷害(2)
        'UA44ST/EVA-1-104': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                const actEn = engine.getSlotTopCards('#my-energy-line .slot').filter(c => !c.classList.contains('rest'));
                if (!actEn.length) { done(); return; }
                engine.promptModal({
                    title: '初号機 [アタック時]', desc: '選擇任意張能源線活動卡片轉為休息（必要能源合計 4+ BP+3000、8+ 傷害 2）：',
                    cards: actEn, selectCount: actEn.length, upTo: true,
                    onConfirm: (sel) => {
                        let sum = 0;
                        sel.forEach(c => { c.classList.add('rest'); sum += (engine.getCardDef(c)?.requiredEnergy?.count || 0); });
                        if (sum >= 4) engine.addSlotBp(cardEl.parentElement, 3000);
                        if (sum >= 8) engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                        if (sum >= 4) showSysMsg(`初号機：合計費用 ${sum}，強化發動！`);
                        done();
                    }
                });
            }
        },

        // 式波・アスカ・ラングレー (ST 4費)：場上無 Trigger 卡 4 張以上得衝擊(1)
        'UA44ST/EVA-1-106': {
            getContinuousImpact: (engine) => countNoTriggerOnField(engine) >= 4 ? 1 : 0
        },

        // エヴァンゲリオン初号機 疑似シン化 (7費 Raid BP 5000)：墊底 0 張時我方回合 BP+5000＆衝擊(3)
        'UA44BT/EVA-1-079': {
            requireRaided: true,
            getContinuousBpBonus: (engine, cardEl) => (engine.isMyTurn && countUnder(cardEl) === 0) ? 5000 : 0,
            getContinuousImpact: (engine, cardEl) => (engine.isMyTurn && countUnder(cardEl) === 0) ? 3 : 0,
            onPlay(engine, cardEl, done) {
                const slot = cardEl.parentElement;
                const reis = Array.from(document.querySelectorAll('#my-outside-area .card'))
                    .filter(c => { const d = engine.getCardDef(c); return d && d.color === 'RED' && d.name?.includes('綾波 レイ'); });
                const seenCost = new Set();
                let placed = 0;
                reis.forEach(r => {
                    const cost = engine.getCardDef(r)?.requiredEnergy?.count ?? -1;
                    if (!seenCost.has(cost)) {
                        seenCost.add(cost);
                        slot.insertBefore(r, slot.firstChild);
                        r.classList.add('is-flipped'); r.classList.remove('rest');
                        placed++;
                    }
                });
                if (placed > 0) { recalcStacking(slot); showSysMsg(`初号機 疑似シン化：已從場外將 ${placed} 張不同費用的〈綾波 レイ〉墊底！`); }
                done();
            }
        },
        'UAPR/EVA-1-079': {
            requireRaided: true,
            getContinuousBpBonus: (e, c) => window.UACardScripts['UA44BT/EVA-1-079'].getContinuousBpBonus(e, c),
            getContinuousImpact: (e, c) => window.UACardScripts['UA44BT/EVA-1-079'].getContinuousImpact(e, c),
            onPlay: (e, c, d) => window.UACardScripts['UA44BT/EVA-1-079'].onPlay(e, c, d)
        },

        // エヴァンゲリオン零号機 (6費 Raid)：起動自爆退場對手前線 1 張，下次シンジ/初号機 AP-1；退場抽 2
        'UA44BT/EVA-1-080': {
            requireRaided: true,
            canActivateMain: (engine, cardEl, slot) => !!slot.closest('#my-front-line'),
            onActivateMain(engine, cardEl, slot, done) {
                engine.retireCardFromSlot(slot);
                engine.pendingApDiscounts.push({
                    amount: 1, desc: '零号機 (シンジ/初号機 AP-1)',
                    matchFn: (d) => /碇 シンジ|初号機/.test(d?.name || '')
                });
                retireOppFront(engine, '零号機 [起動メイン]', 99999, done);
            },
            onRetire(engine, cardEl, done) { engine.drawCards(2); done(); }
        },
        'UAPR/EVA-1-080': {
            requireRaided: true,
            canActivateMain: (e, c, s) => window.UACardScripts['UA44BT/EVA-1-080'].canActivateMain(e, c, s),
            onActivateMain: (e, c, s, d) => window.UACardScripts['UA44BT/EVA-1-080'].onActivateMain(e, c, s, d),
            onRetire: (e, c, d) => window.UACardScripts['UA44BT/EVA-1-080'].onRetire(e, c, d)
        },

        // 紅事件：陽電子砲／超電磁洋弓銃／身…を…捨てて…
        'UA44BT/EVA-1-095': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '陽電子砲', (engine.hasCharacterOnMyField('碇 シンジ') || engine.hasCharacterOnMyField('初号機')) ? 5000 : 3000, done)
        },
        'UA44ST/EVA-1-095': { onEventPlay: (e, c, d) => window.UACardScripts['UA44BT/EVA-1-095'].onEventPlay(e, c, d) },
        'UA44BT/EVA-1-098': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '超電磁洋弓銃', 2000 + countNoTriggerOnField(engine) * 1000, done)
        },
        'UA44BT/EVA-1-099': {
            onEventPlay(engine, cardEl, done) {
                engine.drawCards(countNoTriggerOnField(engine) >= 4 ? 3 : 2);
                done();
            }
        },

        // ==================== 紫色：第13號機／ガイウスの槍／WILLE ====================

        'UA44ST/EVA-1-112': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA44BT/EVA-1-047': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'RED']) ? 1 : 0 },

        // 紫 碇 シンジ (5費)：手牌固定減 2 費；場上有其他5費以上我方回合 BP+1000
        'UA44BT/EVA-1-031': {
            getEnergyDiscount: () => 2,
            getContinuousBpBonus: (engine, cardEl) =>
                (engine.isMyTurn && myFieldTops(engine).some(c => c !== cardEl && (engine.getCardDef(c)?.requiredEnergy?.count || 0) >= 5)) ? 1000 : 0
        },

        // エヴァンゲリオン第13号機 (4費 Raid)：墓地 13+ BP+1000＆傷害(2)、26+ 再 BP+1000＆衝擊(4)
        'UA44BT/EVA-1-034': {
            requireRaided: true,
            getContinuousBpBonus(engine) {
                if (!engine.isMyTurn) return 0;
                const n = outsideCount();
                return n >= 26 ? 2000 : (n >= 13 ? 1000 : 0);
            },
            getContinuousImpact: (engine) => (engine.isMyTurn && outsideCount() >= 26) ? 4 : 0,
            onAttack(engine, cardEl, done) {
                if (engine.isMyTurn && outsideCount() >= 13) {
                    engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                }
                done();
            }
        },

        // EVANGELION Mark.09 (4費 Raid)：我方回合 BP+500
        'UA44BT/EVA-1-036': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0
        },

        // エヴァンゲリオン改8号機 (5費 Raid)：墊底每張 BP+500
        'UA44BT/EVA-1-042': {
            requireRaided: true,
            getContinuousBpBonus: (engine, cardEl) => countUnder(cardEl) * 500
        },

        // 式波・アスカ・ラングレー (6費 紫)：我方回合 BP+1000
        'UA44BT/EVA-1-051': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },

        // 紫事件：ガイウスの槍／絶望の槍ロンギヌス
        'UA44BT/EVA-1-063': {
            onEventPlay(engine, cardEl, done) {
                const limit = (engine.hasCharacterOnMyField('碇 シンジ') || engine.hasCharacterOnMyField('ガイウスの槍')) ? 5000 : 3000;
                retireOppFront(engine, 'ガイウスの槍', limit, () => {
                    engine.drawCards(1);
                    engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
                });
            }
        },
        'UA44BT/EVA-1-065': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '絶望の槍ロンギヌス', 5000, done)
        },

        // ==================== 黃色：アスカ／レイ／マリ ====================

        'UA44BT/EVA-1-015': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'RED']) ? 1 : 0 },

        // 黃事件：あんたバカぁ？
        'UA44BT/EVA-1-020': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'あんたバカぁ？', engine.hasCharacterOnMyField('式波・アスカ・ラングレー') ? 5000 : 3000, done)
        },

        // 黃事件：碇君と一緒にいるとポカポカする
        'UA44BT/EVA-1-021': {
            onEventPlay(engine, cardEl, done) {
                const chars = myFieldTops(engine);
                if (!chars.length) { done(); return; }
                engine.promptModal({
                    title: '碇君と一緒にいるとポカポカする', desc: '選擇 1 張我方角色轉為活動（若為〈綾波 レイ〉再回 1 AP）：',
                    cards: chars, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            sel[0].classList.remove('rest');
                            if (engine.getCardDef(sel[0])?.name?.includes('綾波 レイ')) engine.activateMyApCards(1);
                        }
                        if (myFieldTops(engine).some(c => { const d = engine.getCardDef(c); return d && d.color !== 'YELLOW' && d.name?.includes('碇 シンジ'); })) {
                            engine.drawCards(1);
                        }
                        done();
                    }
                });
            }
        }
    });
})();
