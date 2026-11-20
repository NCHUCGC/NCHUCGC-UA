/**
 * Union Arena 卡片腳本 DLC：學園偶像大師 (Gakuen Idolmaster) [GIM]
 * 涵蓋：藍（補習組 千奈／広、生徒會 星南／美鈴／佑芽）、紅（Re;IRIS 咲季／手毬／ことね、清夏＆リーリヤ）、黃（3年生／1年生）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const myFrontTops = (engine) => engine.getSlotTopCards('#my-front-line .slot');

    const countBaseBpLe2500 = (engine, frontOnly = false) =>
        (frontOnly ? myFrontTops(engine) : myFieldTops(engine))
            .filter(c => (engine.getCardDef(c)?.bp || 9999) <= 2500).length;

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
            title: `${title} (BP${limit}以下)`,
            desc: `選擇最多 1 張對手前線 BP${limit} 以下角色退場：`,
            cards: cands, selectCount: 1, upTo: true,
            onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); onDone(); }
        });
    };

    window.registerCardScripts({
        // ==================== 藍色：補習組／生徒會 ====================

        // 倉本 千奈 (3費 Raid)：登場選原BP2500以下其他角色轉活動並雙方 BP+1500；起動棄1手再發動
        'UA27BT/GIM-1-006': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const cands = myFieldTops(engine).filter(c => c !== cardEl && (engine.getCardDef(c)?.bp || 9999) <= 2500);
                if (!cands.length) { done(); return; }
                engine.promptModal({
                    title: '倉本 千奈 [登場時]',
                    desc: '選擇最多 1 張原 BP2500 以下其他角色轉為活動，雙方本回合 BP+1500：',
                    cards: cands, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            sel[0].classList.remove('rest');
                            engine.addSlotBp(sel[0].parentElement, 1500);
                            engine.addSlotBp(cardEl.parentElement, 1500);
                        }
                        done();
                    }
                });
            },
            canActivateMain: (engine, cardEl, slot) =>
                !engine.getRuntime(cardEl).usedOncePerTurn && !!slot.closest('#my-front-line') && document.querySelectorAll('#my-hand-area .card').length >= 1,
            onActivateMain(engine, cardEl, slot, done) {
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                engine.promptModal({
                    title: '倉本 千奈 [起動メイン]：棄 1 張手牌', desc: '選擇 1 張手牌放置於場外：', cards: hand, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (!sel.length) { done(); return; }
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                        this.onPlay(engine, cardEl, done);
                    }
                });
            }
        },

        // 篠澤 広 (3費 Raid)：前線有原BP2500以下我方回合 BP+1000
        'UA27BT/GIM-1-011': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => (engine.isMyTurn && countBaseBpLe2500(engine, true) > 0) ? 1000 : 0
        },

        // 篠澤 広 (EX 2費 Raid)：前線登場有千奈抽 3；我方回合前線有其他原BP2500以下 BP+1500
        'EX13BT/GIM-2-047': {
            requireRaided: true,
            getContinuousBpBonus: (engine, cardEl) =>
                (engine.isMyTurn && myFrontTops(engine).some(c => c !== cardEl && (engine.getCardDef(c)?.bp || 9999) <= 2500)) ? 1500 : 0,
            onPlay(engine, cardEl, done) {
                if (cardEl.closest('#my-front-line') && engine.hasCharacterOnMyField('倉本 千奈')) {
                    engine.drawCards(3);
                    showSysMsg('篠澤 広 [登場時]：場上有〈倉本 千奈〉，抽取 3 張！');
                }
                done();
            }
        },

        // 倉本 千奈 (EX 2費)：我方場上無卡減 2 費
        'EX13BT/GIM-2-044': {
            getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0
        },

        // 十王 星南 (5費 BP 4000)：我方回合 BP+1000；起動棄1手牌給 BP5000+ 星南/美鈴/佑芽 [ダメージ(2)]
        'UA27BT/GIM-1-019': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0,
            canActivateMain: (engine, cardEl, slot) =>
                !engine.getRuntime(cardEl).usedOncePerTurn && !!slot.closest('#my-front-line') && document.querySelectorAll('#my-hand-area .card').length >= 1,
            onActivateMain(engine, cardEl, slot, done) {
                const targets = myFieldTops(engine).filter(c => /花海 佑芽|秦谷 美鈴|十王 星南/.test(engine.getCardDef(c)?.name || '') && engine.getEffectiveCardBp(c) >= 5000);
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                if (!targets.length || !hand.length) { done(); return; }
                engine.promptModal({
                    title: '十王 星南 [起動メイン]：棄 1 手牌', desc: '選擇 1 張手牌放置於場外：', cards: hand, selectCount: 1, upTo: false,
                    onConfirm: (disc) => {
                        if (!disc.length) { done(); return; }
                        engine.moveCardToZone(disc[0], document.getElementById('my-outside-area'));
                        engine.promptModal({
                            title: '選擇賦予 [ダメージ(2)] 目標', desc: '選擇 1 張 BP5000 以上角色：', cards: targets, selectCount: 1, upTo: false,
                            onConfirm: (sel) => {
                                if (sel.length) {
                                    engine.getRuntime(cardEl).usedOncePerTurn = true;
                                    engine.getRuntime(sel[0]).tempKeywords.DAMAGE = Math.max(engine.getRuntime(sel[0]).tempKeywords.DAMAGE || 0, 2);
                                }
                                done();
                            }
                        });
                    }
                });
            }
        },

        // 秦谷 美鈴 (5費 Raid / EX 5費)：我方回合 BP+1000
        'UA27BT/GIM-1-024': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },
        'EX13BT/GIM-2-050': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },

        // 花海 佑芽 (3費／4費)：前線有其他 BP5000+ 我方回合 BP+1000
        'UA27BT/GIM-1-028': {
            getContinuousBpBonus: (engine, cardEl) =>
                (engine.isMyTurn && myFrontTops(engine).some(c => c !== cardEl && !engine.getCardDef(c)?.name?.includes('花海 佑芽') && engine.getEffectiveCardBp(c) >= 5000)) ? 1000 : 0
        },
        'UA27BT/GIM-1-029': {
            getContinuousBpBonus: (engine, cardEl) =>
                (engine.isMyTurn && myFrontTops(engine).some(c => c !== cardEl && !engine.getCardDef(c)?.name?.includes('花海 佑芽') && engine.getEffectiveCardBp(c) >= 5000)) ? 1000 : 0,
            canActivateMain: (engine, cardEl) => !engine.getRuntime(cardEl).usedOncePerTurn && engine.getEffectiveCardBp(cardEl) >= 5000,
            onActivateMain(engine, cardEl, slot, done) {
                const rt = engine.getRuntime(cardEl);
                engine.promptModal({
                    title: '花海 佑芽 [起動メイン]：二選一', desc: '請選擇本回合獲得的效果：', cards: [cardEl],
                    customButtons: [
                        { label: '攻擊時抽 1 張', color: '#4f9678', onClick: () => { rt.usedOncePerTurn = true; rt._umeDrawOnAtk = true; done(); } },
                        { label: '不被 BP3000 以下角色阻擋', color: '#6c93c7', onClick: () => { rt.usedOncePerTurn = true; rt.tempKeywords.UNBLOCKABLE_MAX_BP = 3000; done(); } }
                    ]
                });
            },
            onAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                if (rt._umeDrawOnAtk) { rt._umeDrawOnAtk = false; engine.drawCards(1); }
                done();
            }
        },

        // 藍事件：可愛いと可愛いで可愛い！
        'UA27BT/GIM-1-036': {
            onEventPlay(engine, cardEl, done) {
                myFieldTops(engine).forEach(c => {
                    if ((engine.getCardDef(c)?.bp || 9999) <= 2500) engine.addSlotBp(c.parentElement, 1500);
                });
                const front = myFrontTops(engine);
                if (!front.length) { done(); return; }
                engine.promptModal({
                    title: '可愛いと可愛いで可愛い！', desc: '選擇前線 1 張角色本回合獲得 [インパクト(1)]：', cards: front, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1);
                        done();
                    }
                });
            }
        },

        // 藍事件：わたしたち、やればできる
        'UA27BT/GIM-1-039': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'わたしたち、やればできる', countBaseBpLe2500(engine, false) * 1000, done)
        },

        // 藍事件：私の目に狂いはない
        'UA27BT/GIM-1-040': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => /花海 佑芽|秦谷 美鈴|十王 星南/.test(engine.getCardDef(c)?.name || '')).length;
                retireOppFront(engine, '私の目に狂いはない', cnt >= 3 ? 5000 : 3000, done);
            }
        },

        // ==================== 紅色：Re;IRIS／リーリヤ＆清夏 ====================

        'UA27BT/GIM-1-044': {
            getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0
        },

        'UA27BT/GIM-1-057': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },

        // 紫雲 清夏 (EX 3費 Raid)：我方回合 BP+1000
        'EX13BT/GIM-2-060': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },

        // 月村 手毬 (4費 Raid)：攻擊時有咲季與ことね抽 1
        'UA27BT/GIM-1-063': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('花海 咲季') && engine.hasCharacterOnMyField('藤田 ことね')) {
                    engine.drawCards(1);
                    showSysMsg('月村 手毬 [アタック時]：抽 1 張！');
                }
                done();
            }
        },
        'UAPR/GIM-1-063': {
            requireRaided: true,
            onAttack: (e, c, d) => window.UACardScripts['UA27BT/GIM-1-063'].onAttack(e, c, d)
        },

        // 紅事件：おいしい顔、いただき～！
        'UA27BT/GIM-1-075': {
            onEventPlay(engine, cardEl, done) {
                const hasL = engine.hasCharacterOnMyField('葛城 リーリヤ');
                const hasS = engine.hasCharacterOnMyField('紫雲 清夏');
                const limit = (hasL && hasS) ? 5000 : ((hasL || hasS) ? 4000 : 3000);
                retireOppFront(engine, 'おいしい顔、いただき～！', limit, done);
            }
        },

        // 紅事件：こいつらめんどくさー
        'UA27BT/GIM-1-077': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => /花海 咲季|月村 手毬|藤田 ことね/.test(engine.getCardDef(c)?.name || '')).length;
                retireOppFront(engine, 'こいつらめんどくさー', cnt >= 3 ? 5000 : 3000, done);
            }
        },

        // 紅事件：ほら、一緒に持と♪
        'UA27BT/GIM-1-079': {
            onEventPlay(engine, cardEl, done) {
                engine.drawCards(1);
                engine.pendingApDiscounts.push({
                    amount: 1, desc: 'ほら、一緒に持と♪ (リーリヤ/清夏 AP-1)',
                    matchFn: (d) => /葛城 リーリヤ|紫雲 清夏/.test(d?.name || '')
                });
                done();
            }
        },

        // 紅事件：そろそろ焼けたかな？
        'EX13BT/GIM-2-069': {
            onEventPlay(engine, cardEl, done) {
                engine.drawCards(engine.usedEventThisTurn ? 3 : 2);
                done();
            }
        },

        // ==================== 黃色：3年生／1年生 ====================

        'EX13BT/GIM-2-008': {
            getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0
        },

        // 雨夜 燕 (EX 5費 Raid)：有十王星南得傷害(2)
        'EX13BT/GIM-2-012': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('十王 星南')) {
                    engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                }
                done();
            }
        },

        // 有村 麻央 (EX 4費 Raid)：有十王星南得衝擊(1)；登場 BP+1000
        'EX13BT/GIM-2-016': {
            requireRaided: true,
            getContinuousImpact: (engine) => engine.hasCharacterOnMyField('十王 星南') ? 1 : 0,
            onPlay(engine, cardEl, done) {
                engine.addSlotBp(cardEl.parentElement, 1000);
                done();
            }
        },

        // 黃事件：さあ、もう一戦！
        'EX13BT/GIM-2-038': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('3年生')).length;
                retireOppFront(engine, `さあ、もう一戦！（3年生 ${cnt} 張）`, cnt * 1000, done);
            }
        },

        // 黃事件：似合うんじゃない？
        'EX13BT/GIM-2-040': {
            onEventPlay(engine, cardEl, done) {
                const chars = myFieldTops(engine);
                if (!chars.length) { done(); return; }
                engine.promptModal({
                    title: '似合うんじゃない？', desc: '選擇 1 張我方角色轉為活動（若為［特徴：1年生］再將 1 張 AP 轉活動）：',
                    cards: chars, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            sel[0].classList.remove('rest');
                            if (engine.getCardDef(sel[0])?.traits?.includes('1年生')) engine.activateMyApCards(1);
                        }
                        done();
                    }
                });
            }
        },

        // 黃事件：もう一度、最初から！
        'EX13BT/GIM-2-042': {
            onEventPlay(engine, cardEl, done) {
                const limit = countUniqueTraitNames(engine, '1年生') >= 4 ? 5000 : 3000;
                retireOppFront(engine, 'もう一度、最初から！', limit, () => {
                    engine.drawCards(1);
                    engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
                });
            }
        }
    });
})();
