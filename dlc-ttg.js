/**
 * Union Arena 卡片腳本 DLC：天元突破 紅蓮螺巖 (Gurren Lagann) [TTG]
 * 涵蓋：綠（大グレン団／シモン＆ヴィラル／アーク・超銀河・天元突破グレンラガン）與 紅（カミナ／シモン＆ニア／グレンラガン）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myTotalEnergy = (engine) => engine.calculateMyEnergy().ALL || 0;
    const myDeckCount = () => document.querySelectorAll('#my-deck-area .card').length;
    const countUnderCards = (cardEl) => {
        const slot = cardEl?.parentElement;
        if (!slot) return 0;
        return Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl && c.classList.contains('is-flipped')).length;
    };
    const hasNameOnFieldOrBase = (engine, name) =>
        Array.from(document.querySelectorAll('#my-front-line .card, #my-energy-line .card'))
            .some(c => engine.getCardDef(c)?.name?.includes(name));

    window.registerCardScripts({
        // ==================== 綠色：螺旋力／超銀河・天元突破 ====================

        // ヴィラル (5費 BP 4000)：能源20以上起動，選我方1張角色轉活動
        'UA56BT/TTG-1-003': {
            canActivateMain(engine, cardEl, slot) {
                return !!slot.closest('#my-front-line') && myTotalEnergy(engine) >= 20 && !engine.usedNamedAbilityThisTurn.has('TTG_VIRAL_ACT');
            },
            onActivateMain(engine, cardEl, slot, done) {
                const chars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
                engine.promptModal({
                    title: 'ヴィラル [起動メイン]（能源 20 以上）',
                    desc: '選擇 1 張我方角色轉為活動：',
                    cards: chars, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.usedNamedAbilityThisTurn.add('TTG_VIRAL_ACT');
                            sel[0].classList.remove('rest');
                        }
                        done();
                    }
                });
            }
        },

        // キタン (BP 3000)：我方回合能源 6 以上 BP+1000
        'UA56BT/TTG-1-006': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && myTotalEnergy(engine) >= 6) ? 1000 : 0
        },

        // シモン (3費 BP 2500)：我方回合能源 8 以上 BP+1500；起動加綠能源
        'UA56BT/TTG-1-011': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && myTotalEnergy(engine) >= 8) ? 1500 : 0,
            canActivateMain: (engine, cardEl) => !engine.getRuntime(cardEl).usedOncePerTurn,
            onActivateMain(engine, cardEl, slot, done) {
                const rt = engine.getRuntime(cardEl);
                rt.usedOncePerTurn = true;
                rt.tempEnergyBoost.push({ color: 'GREEN', count: 1 });
                showSysMsg('シモン [起動メイン]：產生能源 +[緑]！');
                done();
            }
        },

        // ニア (3費 BP 2000)：起動能源 8 以上產生能源 +[緑][緑]
        'UA56BT/TTG-1-017': {
            canActivateMain: (engine, cardEl) => !engine.getRuntime(cardEl).usedOncePerTurn && myTotalEnergy(engine) >= 8,
            onActivateMain(engine, cardEl, slot, done) {
                const rt = engine.getRuntime(cardEl);
                rt.usedOncePerTurn = true;
                rt.tempEnergyBoost.push({ color: 'GREEN', count: 2 });
                showSysMsg('ニア [起動メイン]：產生能源 +[緑][緑]！');
                done();
            }
        },

        // ヨーコ (2費)：我方場上無卡時減 2 費
        'UA56BT/TTG-1-020': {
            getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0
        },

        // ロージェノム (2費 BP 4000)：前線橫置退場自己，給〈シモン〉+[緑×3] 並回 1 AP
        'UA56BT/TTG-1-025': {
            canActivateMain: (engine, cardEl, slot) =>
                !cardEl.classList.contains('rest') && !!slot.closest('#my-front-line') && myTotalEnergy(engine) >= 6 && engine.hasCharacterOnMyField('シモン'),
            onActivateMain(engine, cardEl, slot, done) {
                const simons = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => engine.getCardDef(c)?.name?.includes('シモン'));
                engine.promptModal({
                    title: 'ロージェノム [起動メイン]',
                    desc: '選擇 1 張我方〈シモン〉本回合產生能源 +[緑×3] 並將 1 張 AP 轉活動：',
                    cards: simons, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.retireCardFromSlot(slot);
                            engine.getRuntime(sel[0]).tempEnergyBoost.push({ color: 'GREEN', count: 3 });
                            engine.activateMyApCards(1);
                        }
                        done();
                    }
                });
            }
        },

        // アークグレンラガン (7費 Raid)：常駐 BP+1000＆衝擊(1)；登場依墊底數退場BP5000以下/回AP；攻擊時可棄2墊底得傷害(2)
        'UA56BT/TTG-1-027': {
            requireRaided: true,
            getContinuousBpBonus: () => 1000,
            getContinuousImpact: () => 1,
            onPlay(engine, cardEl, done) {
                const under = countUnderCards(cardEl);
                if (under >= 3) engine.activateMyApCards(1);
                if (under >= 1) {
                    const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 5000);
                    if (opp.length) {
                        engine.promptModal({
                            title: `アークグレンラガン [登場時]（墊底 ${under} 張）`,
                            desc: '選擇最多 1 張對手前線 BP5000 以下角色退場：',
                            cards: opp, selectCount: 1, upTo: true,
                            onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); done(); }
                        });
                        return;
                    }
                }
                done();
            },
            onAttack(engine, cardEl, done) {
                const underCards = Array.from(cardEl.parentElement.querySelectorAll('.card')).filter(c => c !== cardEl && c.classList.contains('is-flipped'));
                if (underCards.length < 2) { done(); return; }
                engine.promptModal({
                    title: 'アークグレンラガン [アタック時]',
                    desc: '是否將 2 張裏側墊底卡放置於場外，使此卡本回合獲得 [ダメージ(2)]？',
                    cards: [cardEl],
                    customButtons: [
                        {
                            label: '棄 2 張墊底卡獲得 [ダメージ(2)]', color: '#e67e22',
                            onClick: () => {
                                const out = document.getElementById('my-outside-area');
                                underCards.slice(0, 2).forEach(c => engine.moveCardToZone(c, out));
                                engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                                done();
                            }
                        },
                        { label: '不發動', color: '#7f8c8d', onClick: () => done() }
                    ]
                });
            }
        },

        // 超銀河グレンラガン (10費 Raid)：常駐 BP+1000＆傷害(2)；登場至下次我方回合開始 BP+5000，能源20+回1AP、50+抽2
        'UA56BT/TTG-1-031': {
            requireRaided: true,
            getContinuousBpBonus: () => 1000,
            onPlay(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                rt.persistentBp = (rt.persistentBp || 0) + 5000;
                engine.addSlotBp(cardEl.parentElement, 5000);
                if (!engine.usedNamedAbilityThisTurn.has('TTG_SUPER_GALAXY')) {
                    engine.usedNamedAbilityThisTurn.add('TTG_SUPER_GALAXY');
                    const en = myTotalEnergy(engine);
                    if (en >= 20) engine.activateMyApCards(1);
                    if (en >= 50) engine.drawCards(2);
                }
                done();
            },
            onAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2);
                done();
            }
        },

        // 天元突破グレンラガン (100費 BP 50000 Raid)：我方回合衝擊(4)＆傷害(7)；攻擊時可棄2墊底退場對手前線1張
        'UA56BT/TTG-1-032': {
            requireRaided: true,
            getContinuousImpact: (engine) => engine.isMyTurn ? 4 : 0,
            onAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 7);
                const underCards = Array.from(cardEl.parentElement.querySelectorAll('.card')).filter(c => c !== cardEl && c.classList.contains('is-flipped'));
                const opp = engine.getSlotTopCards('#opp-front-line .slot');
                if (underCards.length < 2 || !opp.length) { done(); return; }
                engine.promptModal({
                    title: '天元突破グレンラガン [アタック時]',
                    desc: '是否棄 2 張裏側墊底卡，退場對手前線 1 張角色？',
                    cards: opp, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            const out = document.getElementById('my-outside-area');
                            underCards.slice(0, 2).forEach(c => engine.moveCardToZone(c, out));
                            engine.requestRetireOpponentCard(sel[0]);
                        }
                        done();
                    }
                });
            }
        },

        // 綠事件：時空烈断バーストスピニングパンチ
        'UA56BT/TTG-1-035': {
            onEventPlay(engine, cardEl, done) {
                const limit = hasNameOnFieldOrBase(engine, 'シモン') ? 5000 : 3000;
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
                if (!opp.length) { showSysMsg(`對手前線無 BP${limit} 以下角色。`); done(); return; }
                engine.promptModal({
                    title: `時空烈断バーストスピニングパンチ (BP${limit}以下)`,
                    desc: `選擇 1 張對手前線 BP${limit} 以下角色移至移除區：`,
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) engine.requestRemoveOpponentCard(sel[0]);
                        done();
                    }
                });
            }
        },

        // 綠事件：ラガンインパクト
        'UA56BT/TTG-1-039': {
            onEventPlay(engine, cardEl, done) {
                const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
                const maxBp = Math.max(0, ...myChars.map(c => engine.getEffectiveCardBp(c)));
                const targets = myChars.filter(c => /ラガン|シモン/.test(engine.getCardDef(c)?.name || ''));
                if (!targets.length) { done(); return; }
                engine.promptModal({
                    title: `ラガンインパクト (BP+${maxBp}＆衝擊1)`,
                    desc: '選擇 1 張含「ラガン」或〈シモン〉的角色強化：',
                    cards: targets, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            engine.addSlotBp(sel[0].parentElement, maxBp);
                            engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1);
                        }
                        done();
                    }
                });
            }
        },

        // ==================== 紅色：カミナ／ニア／グレンラガン ====================

        // 紅 カミナ (3費 BP 3500)：我方回合有シモン時 BP+500
        'UA56BT/TTG-1-044': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && hasNameOnFieldOrBase(engine, 'シモン')) ? 500 : 0
        },

        // 紅 ニア (0費)：登場給其他角色 BP+1000（シモン／基底シモン改 +1500）
        'UA56BT/TTG-1-058': {
            onPlay(engine, cardEl, done) {
                const others = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => c !== cardEl);
                if (!others.length) { done(); return; }
                engine.promptModal({
                    title: 'ニア [登場時]',
                    desc: '選擇最多 1 張其他角色強化 BP（〈シモン〉系 +1500，其餘 +1000）：',
                    cards: others, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            const slot = sel[0].parentElement;
                            const isSimon = Array.from(slot.querySelectorAll('.card')).some(c => engine.getCardDef(c)?.name?.includes('シモン'));
                            engine.addSlotBp(slot, isSimon ? 1500 : 1000);
                        }
                        done();
                    }
                });
            }
        },

        // 紅 グレンラガン (4費 カミナ軸 Raid)：有墊底卡時 BP+1000＆衝擊(1)、登場退場 BP5000 以下
        'UA56BT/TTG-1-073': {
            requireRaided: true,
            getContinuousBpBonus: (engine, cardEl) => countUnderCards(cardEl) > 0 ? 1000 : 0,
            getContinuousImpact: (engine, cardEl) => countUnderCards(cardEl) > 0 ? 1 : 0,
            onPlay(engine, cardEl, done) {
                if (countUnderCards(cardEl) === 0) { done(); return; }
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 5000);
                if (!opp.length) { done(); return; }
                engine.promptModal({
                    title: 'グレンラガン [登場時]',
                    desc: '選擇最多 1 張對手前線 BP5000 以下角色退場：',
                    cards: opp, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); done(); }
                });
            }
        },

        // 紅 グレンラガン (4費 ニア軸 Raid)：登場抽1（有墊底再抽1），牌庫20以下 BP+1000＆傷害(2)，5以下再 BP+3000
        'UA56BT/TTG-1-074': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.drawCards(countUnderCards(cardEl) > 0 ? 2 : 1);
                const left = myDeckCount();
                if (left <= 20) {
                    engine.addSlotBp(cardEl.parentElement, left <= 5 ? 4000 : 1000);
                    engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                    showSysMsg(`グレンラガン：牌庫剩餘 ${left} 張，本回合獲得 [ダメージ(2)] 與 BP 強化！`);
                }
                done();
            }
        },

        // 紅事件：俺を誰だと思っていやがる!!
        'UA56BT/TTG-1-080': {
            onEventPlay(engine, cardEl, done) {
                const out = Array.from(document.querySelectorAll('#my-outside-area .card'))
                    .filter(c => /^(ラガン|グレン|グレンラガン)$/.test(engine.getCardDef(c)?.name || ''));
                engine.pendingApDiscounts.push({
                    amount: 1, desc: '俺を誰だと思っていやがる!! (ラガン/グレン/グレンラガン AP-1)',
                    matchFn: (d) => /^(ラガン|グレン|グレンラガン)$/.test(d?.name || '')
                });
                if (!out.length) { done(); return; }
                engine.promptModal({
                    title: '俺を誰だと思っていやがる!!',
                    desc: '選擇場外最多 1 張〈ラガン〉／〈グレン〉／〈グレンラガン〉加入手牌：',
                    cards: out, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); done(); }
                });
            }
        },

        // 紅事件：ギガドリルブレイク
        'UA56BT/TTG-1-081': {
            onEventPlay(engine, cardEl, done) {
                const limit = (hasNameOnFieldOrBase(engine, 'シモン') || hasNameOnFieldOrBase(engine, 'カミナ')) ? 5000 : 3000;
                const opp = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
                if (!opp.length) { showSysMsg(`對手場上無 BP${limit} 以下角色。`); done(); return; }
                engine.promptModal({
                    title: `ギガドリルブレイク (BP${limit}以下)`,
                    desc: `選擇 1 張對手場上 BP${limit} 以下角色退場：`,
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); done(); }
                });
            }
        }
    });
})();
