/**
 * Union Arena 卡片腳本 DLC：怪獸8號 (Kaiju No. 8) [KJ8]
 * 涵蓋：黃（亜白ミナ＆伐虎／3費連動 四ノ宮キコル＆市川レノ）、綠（怪獸8號／日比野カフカ／保科宗四郎）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const getSameLineTops = (engine, cardEl) => {
        const line = cardEl?.closest('#my-front-line, #my-energy-line');
        return line ? engine.getSlotTopCards(`#${line.id} .slot`) : [];
    };

    const isReqEnergy3 = (engine, cardEl) => {
        const d = engine.getCardDef(cardEl);
        if (!d) return false;
        if (d.id === 'UA28BT/KJ8-1-018') return true; // 場上視為 [黄×3]
        return (d.requiredEnergy?.count || 0) === 3;
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
        // ==================== 黃色：第3部隊（ミナ／レノ／キコル） ====================

        // 亜白 ミナ (4費)：同線有伐虎攻擊抽 1
        'UA28BT/KJ8-1-004': {
            onAttack(engine, cardEl, done) {
                if (getSameLineTops(engine, cardEl).some(c => engine.getCardDef(c)?.name?.includes('伐虎'))) {
                    engine.drawCards(1);
                    showSysMsg('亜白 ミナ [アタック時]：同線有〈伐虎〉，抽 1 張！');
                }
                done();
            }
        },

        // 亜白 ミナ (5費 Raid)：同線有伐虎得衝擊(1)；起動凍結對手前線休息角
        'UA28BT/KJ8-1-005': {
            requireRaided: true,
            getContinuousImpact: (engine, cardEl) =>
                getSameLineTops(engine, cardEl).some(c => engine.getCardDef(c)?.name?.includes('伐虎')) ? 1 : 0,
            canActivateMain: (engine, cardEl, slot) =>
                !engine.getRuntime(cardEl).usedOncePerTurn && !!slot.closest('#my-front-line') &&
                engine.getSlotTopCards('#opp-front-line .slot').some(c => c.classList.contains('rest')),
            onActivateMain(engine, cardEl, slot, done) {
                const rested = engine.getSlotTopCards('#opp-front-line .slot').filter(c => c.classList.contains('rest'));
                engine.promptModal({
                    title: '亜白 ミナ [起動メイン]', desc: '選擇對手前線 1 張休息角色凍結（下次不會轉活動）：',
                    cards: rested, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.getRuntime(cardEl).usedOncePerTurn = true;
                            engine.requestFreezeOpponentCard(sel[0]);
                        }
                        done();
                    }
                });
            }
        },

        // 市川 レノ (3費 BP 3500 / 3費 Raid) & 四ノ宮 キコル (2費)：3費同線連動 BP+500
        'UA28BT/KJ8-1-011': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0
        },
        'UA28BT/KJ8-1-012': {
            requireRaided: true,
            getContinuousBpBonus: (engine, cardEl) =>
                (engine.isMyTurn && getSameLineTops(engine, cardEl).some(c => c !== cardEl && isReqEnergy3(engine, c))) ? 500 : 0
        },
        'UA28BT/KJ8-1-018': {
            getContinuousBpBonus: (engine, cardEl) =>
                (engine.isMyTurn && getSameLineTops(engine, cardEl).some(c => c !== cardEl && isReqEnergy3(engine, c))) ? 500 : 0
        },

        // 四ノ宮 キコル (4費 Raid)：同線3費角 1+衝擊(1)、2+攻擊抽1、3+BP+1000；攻擊給1張BP+500
        'UA28BT/KJ8-1-020': {
            requireRaided: true,
            getContinuousImpact: (engine, cardEl) =>
                getSameLineTops(engine, cardEl).filter(c => isReqEnergy3(engine, c)).length >= 1 ? 1 : 0,
            getContinuousBpBonus: (engine, cardEl) =>
                getSameLineTops(engine, cardEl).filter(c => isReqEnergy3(engine, c)).length >= 3 ? 1000 : 0,
            onAttack(engine, cardEl, done) {
                const cnt3 = getSameLineTops(engine, cardEl).filter(c => isReqEnergy3(engine, c)).length;
                if (cnt3 >= 2) engine.drawCards(1);
                const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
                if (!myChars.length) { done(); return; }
                engine.promptModal({
                    title: '四ノ宮 キコル [アタック時]', desc: '選擇最多 1 張我方角色 BP+500：',
                    cards: myChars, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.addSlotBp(sel[0].parentElement, 500); done(); }
                });
            }
        },

        // 保科 宗四郎 (黃 4費 Raid)：不被 BP3000 以下阻擋
        'UA28BT/KJ8-1-031': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                engine.getRuntime(cardEl).tempKeywords.UNBLOCKABLE_MAX_BP = 3000;
                done();
            }
        },

        // 黃事件：解放戦力96％
        'UA28BT/KJ8-1-035': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '解放戦力96％', engine.hasCharacterOnMyField('亜白 ミナ') ? 5000 : 3000, done)
        },

        // 黃事件：防衛隊式斧術1式 落雷
        'UA28BT/KJ8-1-040': {
            onEventPlay(engine, cardEl, done) {
                let limit = 2000;
                if (engine.hasCharacterOnMyField('四ノ宮 キコル')) {
                    limit = engine.getSlotTopCards('#my-front-line .slot').some(c => isReqEnergy3(engine, c)) ? 5000 : 4000;
                }
                retireOppFront(engine, '防衛隊式斧術1式 落雷', limit, done);
            }
        },

        // ==================== 綠色：怪獸8號／カフカ／保科 ====================

        // 怪獣8号 (6費 Raid)：登場退場 BP3000（我方回合可自橫改 BP4000）；起動橫置+1000＆衝擊1 或 棄1手轉活動
        'UA28BT/KJ8-1-054': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                if (!engine.isMyTurn) { retireOppFront(engine, '怪獣8号 [登場時]', 3000, done); return; }
                engine.promptModal({
                    title: '怪獣8号 [登場時]', desc: '是否將此角色轉為休息，使退場範圍從 BP3000 提升為 BP4000 以下？',
                    cards: [cardEl],
                    customButtons: [
                        { label: '轉為休息（退場 BP4000 以下）', color: '#c1596f', onClick: () => { cardEl.classList.add('rest'); retireOppFront(engine, '怪獣8号', 4000, done); } },
                        { label: '維持活動（退場 BP3000 以下）', color: '#4f9678', onClick: () => retireOppFront(engine, '怪獣8号', 3000, done) }
                    ]
                });
            },
            canActivateMain(engine, cardEl) {
                const rt = engine.getRuntime(cardEl);
                const canBuff = !rt._kj8BuffUsed && !cardEl.classList.contains('rest');
                const canStand = !rt._kj8StandUsed && document.querySelectorAll('#my-hand-area .card').length >= 1;
                return canBuff || canStand;
            },
            onActivateMain(engine, cardEl, slot, done) {
                const rt = engine.getRuntime(cardEl);
                const btns = [];
                if (!rt._kj8BuffUsed && !cardEl.classList.contains('rest')) {
                    btns.push({
                        label: '橫置自身：BP+1000 並獲得 [インパクト(1)]', color: '#e67e22',
                        onClick: () => {
                            rt._kj8BuffUsed = true;
                            cardEl.classList.add('rest');
                            engine.addSlotBp(slot, 1000);
                            rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                            done();
                        }
                    });
                }
                const hand = Array.from(document.querySelectorAll('#my-hand-area .card'));
                if (!rt._kj8StandUsed && hand.length >= 1) {
                    btns.push({
                        label: '棄 1 張手牌：將自身轉為活動', color: '#4f9678',
                        onClick: () => engine.promptModal({
                            title: '怪獣8号：棄 1 手牌轉活動', desc: '選擇 1 張手牌放置於場外：', cards: hand, selectCount: 1, upTo: false,
                            onConfirm: (sel) => {
                                if (sel.length) {
                                    rt._kj8StandUsed = true;
                                    engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                                    cardEl.classList.remove('rest');
                                }
                                done();
                            }
                        })
                    });
                }
                if (!btns.length) { done(); return; }
                engine.promptModal({ title: '怪獣8号 [起動メイン]', desc: '選擇起動效果：', cards: [cardEl], customButtons: btns });
            }
        },

        // 怪獣8号 (8費 BP 5000)：前線休息角色 2 張以上減 2 費
        'UA28BT/KJ8-1-055': {
            getEnergyDiscount: (engine) =>
                engine.getSlotTopCards('#my-front-line .slot').filter(c => c.classList.contains('rest')).length >= 2 ? 2 : 0
        },
        'UAPR/KJ8-1-055': {
            getEnergyDiscount: (e) => window.UACardScripts['UA28BT/KJ8-1-055'].getEnergyDiscount(e)
        },

        // 綠 四ノ宮 キコル (3費 BP 3000)：我方回合 BP+1000
        'UA28BT/KJ8-1-059': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },

        // 綠 古橋 伊春 (3費 BP 3500)：有レノ時我方回合 BP+500
        'UA28BT/KJ8-1-065': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && engine.hasCharacterOnMyField('市川 レノ')) ? 500 : 0
        },

        // 綠 保科 宗四郎 (4費 Raid)：起動橫置前線其他活動保科，獲得 [2回アタック]
        'UA28BT/KJ8-1-071': {
            requireRaided: true,
            canActivateMain(engine, cardEl) {
                const rt = engine.getRuntime(cardEl);
                return !rt.usedOncePerTurn && engine.getSlotTopCards('#my-front-line .slot')
                    .some(c => c !== cardEl && !c.classList.contains('rest') && engine.getCardDef(c)?.name?.includes('保科 宗四郎'));
            },
            onActivateMain(engine, cardEl, slot, done) {
                const others = engine.getSlotTopCards('#my-front-line .slot')
                    .filter(c => c !== cardEl && !c.classList.contains('rest') && engine.getCardDef(c)?.name?.includes('保科 宗四郎'));
                engine.promptModal({
                    title: '保科 宗四郎 [起動メイン]', desc: '選擇前線 1 張活動的其他〈保科 宗四郎〉轉為休息，獲得 [2回アタック]：',
                    cards: others, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            const rt = engine.getRuntime(cardEl);
                            rt.usedOncePerTurn = true;
                            sel[0].classList.add('rest');
                            rt.tempKeywords.DOUBLE_ATTACK = 1;
                            showSysMsg('保科 宗四郎本回合獲得 [2回アタック]！');
                        }
                        done();
                    }
                });
            }
        },

        // 綠事件：あの日の約束
        'UA28BT/KJ8-1-075': {
            onEventPlay(engine, cardEl, done) {
                const chars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
                if (!chars.length) { done(); return; }
                engine.promptModal({
                    title: 'あの日の約束', desc: '選擇 1 張我方角色轉為活動（若為カフカ／怪獣8号／ミナ再回 1 AP）：',
                    cards: chars, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            sel[0].classList.remove('rest');
                            if (/日比野 カフカ|怪獣[8８]号|亜白 ミナ/.test(engine.getCardDef(sel[0])?.name || '')) engine.activateMyApCards(1);
                        }
                        done();
                    }
                });
            }
        },

        // 綠事件：フォルティチュード9.8
        'UA28BT/KJ8-1-078': {
            onEventPlay(engine, cardEl, done) {
                const targets = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => /日比野 カフカ|怪獣[8８]号/.test(engine.getCardDef(c)?.name || ''));
                const finish = () => { engine.drawCards(1); done(); };
                if (!targets.length) { finish(); return; }
                engine.promptModal({
                    title: 'フォルティチュード9.8', desc: '選擇最多 1 張〈日比野 カフカ〉或〈怪獣8号〉BP+1000：',
                    cards: targets, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (!sel.length) { finish(); return; }
                        const t = sel[0];
                        engine.addSlotBp(t.parentElement, 1000);
                        engine.promptModal({
                            title: '選擇追加關鍵字', desc: '選擇要賦予的效果：', cards: [t],
                            customButtons: [
                                { label: '[インパクト(+1)]', color: '#c1596f', onClick: () => { const trt = engine.getRuntime(t); trt.tempKeywords.IMPACT_PLUS = (trt.tempKeywords.IMPACT_PLUS || 0) + 1; finish(); } },
                                { label: '[ダメージ(+1)]', color: '#e67e22', onClick: () => { const trt = engine.getRuntime(t); trt.tempKeywords.DAMAGE_PLUS = (trt.tempKeywords.DAMAGE_PLUS || 0) + 1; finish(); } }
                            ]
                        });
                    }
                });
            }
        },

        // 綠事件：保科流刀伐術6式 八重討ち
        'UA28BT/KJ8-1-079': {
            onEventPlay(engine, cardEl, done) {
                const cnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => engine.getCardDef(c)?.name?.includes('保科 宗四郎')).length;
                retireOppFront(engine, `保科流刀伐術6式 八重討ち（保科 ${cnt} 張）`, 3000 + cnt * 1000, done);
            }
        }
    });
})();
