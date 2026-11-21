/**
 * Union Arena 卡片腳本 DLC：我想成為影之強者！(The Eminence in Shadow) [KJN]
 * 涵蓋：黃（アレクシア＆ローズ 移除區展開／クレア 墊底／ベアトリクス）、紫（シャドウ 墓地10+／七陰 7種異名）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const outsideCount = () => document.querySelectorAll('#my-outside-area .card').length;
    const countUnder = (cardEl) =>
        cardEl?.parentElement ? Array.from(cardEl.parentElement.querySelectorAll('.card')).filter(c => c !== cardEl && c.classList.contains('is-flipped')).length : 0;

    const countUniqueSevenShadows = (engine) => {
        const set = new Set();
        myFieldTops(engine).forEach(c => {
            const d = engine.getCardDef(c);
            if (d && Array.isArray(d.traits) && d.traits.includes('七陰') && d.name) set.add(d.name);
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
        // ==================== 黃色：ミドガル／クレア／ローズ ====================

        // クレア・カゲノー (5費 Raid)：我方回合有墊底卡 BP+1000＆衝擊(1)
        'UA52BT/KJN-1-015': {
            requireRaided: true,
            getContinuousBpBonus: (engine, cardEl) => (engine.isMyTurn && countUnder(cardEl) > 0) ? 1000 : 0,
            getContinuousImpact: (engine, cardEl) => (engine.isMyTurn && countUnder(cardEl) > 0) ? 1 : 0
        },

        // クレア・カゲノー (6費 Raid)：有墊底卡 BP+1000＆2回アタック
        'UA52BT/KJN-1-016': {
            requireRaided: true,
            getContinuousBpBonus: (engine, cardEl) => countUnder(cardEl) > 0 ? 1000 : 0,
            onAttack(engine, cardEl, done) {
                if (countUnder(cardEl) > 0) engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1;
                done();
            }
        },

        // ベアトリクス (2費)：對手前線有 BP4500+ 起動 BP+2000
        'UA52BT/KJN-1-027': {
            canActivateMain: (engine, cardEl) =>
                !engine.getRuntime(cardEl).usedOncePerTurn &&
                engine.getSlotTopCards('#opp-front-line .slot').some(c => engine.getEffectiveCardBp(c) >= 4500),
            onActivateMain(engine, cardEl, slot, done) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                engine.addSlotBp(slot, 2000);
                done();
            }
        },

        // ベアトリクス (5費)：我方回合 BP+1000；登場對手前線有 BP4500+ 轉活動並橫置 1 張 BP4500+
        'UA52BT/KJN-1-028': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0,
            onPlay(engine, cardEl, done) {
                const big = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 4500);
                if (!big.length || engine.usedNamedAbilityThisTurn.has('KJN_BEATRIX')) { done(); return; }
                engine.usedNamedAbilityThisTurn.add('KJN_BEATRIX');
                cardEl.classList.remove('rest');
                engine.promptModal({
                    title: 'ベアトリクス [登場時]', desc: '選擇對手前線最多 1 張 BP4500 以上角色轉為休息：',
                    cards: big, selectCount: 1, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length) engine.requestRestOpponentCard(sel[0]);
                        done();
                    }
                });
            }
        },

        // 黃事件：あなたを断罪します！
        'UA52BT/KJN-1-037': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'あなたを断罪します！', engine.hasCharacterOnMyField('ローズ・オリアナ') ? 5000 : 2000, done)
        },

        // 黃事件：覚醒の刻
        'UA52BT/KJN-1-038': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '覚醒の刻', engine.hasCharacterOnMyField('クレア・カゲノー') ? 5000 : 3000, done)
        },

        // ==================== 紫色：シャドウガーデン／七陰 ====================

        // 559 (4費)：攻擊時場外每 10 張抽 1 張
        'UA52BT/KJN-1-040': {
            onAttack(engine, cardEl, done) {
                const draws = Math.floor(outsideCount() / 10);
                if (draws > 0) { engine.drawCards(draws); showSysMsg(`559 [アタック時]：抽 ${draws} 張！`); }
                done();
            }
        },

        // シド・カゲノー (3費)：被突襲時給突襲角衝擊(1)或傷害(2)
        'UA52BT/KJN-1-046': {
            onRaided(engine, baseEl, raidEl) {
                engine.promptModal({
                    title: 'シド・カゲノー（突襲基底觸發）', desc: '選擇要賦予突襲角色的效果：', cards: [raidEl],
                    customButtons: [
                        { label: '[インパクト(1)]', color: '#c1596f', onClick: () => { engine.getRuntime(raidEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(raidEl).tempKeywords.IMPACT || 0, 1); engine.updateEnergyHUD(); } },
                        { label: '[ダメージ(2)]', color: '#e67e22', onClick: () => { engine.getRuntime(raidEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(raidEl).tempKeywords.DAMAGE || 0, 2); engine.updateEnergyHUD(); } }
                    ]
                });
            }
        },

        // シャドウ (4費)：前線登場場外10張以上可轉活動
        'UA52BT/KJN-1-047': {
            onPlay(engine, cardEl, done) {
                if (cardEl.closest('#my-front-line') && outsideCount() >= 10 && !engine.usedNamedAbilityThisTurn.has('KJN_CID_STAND')) {
                    engine.usedNamedAbilityThisTurn.add('KJN_CID_STAND');
                    cardEl.classList.remove('rest');
                    showSysMsg('シャドウ [登場時]：場外 10 張以上，轉為活動！');
                }
                done();
            }
        },
        'UAPR/KJN-1-047': {
            onPlay: (e, c, d) => window.UACardScripts['UA52BT/KJN-1-047'].onPlay(e, c, d)
        },

        // シャドウ (8費 Raid BP 5000)：登場下次非突襲卡 AP-1，並依場外張數回收不同費用的シャドウガーデン／アイ・アム……
        'UA52BT/KJN-1-049': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                engine.pendingApDiscounts.push({
                    amount: 1, desc: 'シャドウ (非突襲卡 AP-1)',
                    matchFn: (d) => !d?.compiledRules?.raidCondition
                });
                const maxPick = 1 + Math.floor(outsideCount() / 10);
                const pool = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                    const d = engine.getCardDef(c);
                    return d && ((d.traits?.includes('シャドウガーデン') && !d.compiledRules?.raidCondition) || d.name?.includes('アイ・アム'));
                });
                if (!pool.length) { done(); return; }
                engine.promptModal({
                    title: `シャドウ [登場時]（最多回收 ${maxPick} 張不同費用）`,
                    desc: `選擇場外最多 ${maxPick} 張不同必要能源的卡片加入手牌：`,
                    cards: pool, selectCount: Math.min(maxPick, pool.length), upTo: true,
                    onConfirm: (sel) => {
                        const hand = document.getElementById('my-hand-area');
                        sel.forEach(c => engine.moveCardToZone(c, hand));
                        done();
                    }
                });
            }
        },

        // アルファ (5費 Raid)：起動得衝擊(1)；場上七陰7種以上可選七陰1張 BP+1000＆衝擊(1)
        'UA52BT/KJN-1-056': {
            requireRaided: true,
            canActivateMain: (engine, cardEl, slot) => !!slot.closest('#my-front-line') && !engine.usedNamedAbilityThisTurn.has('KJN_ALPHA_MAIN'),
            onActivateMain(engine, cardEl, slot, done) {
                engine.usedNamedAbilityThisTurn.add('KJN_ALPHA_MAIN');
                if (countUniqueSevenShadows(engine) >= 7) {
                    const sevens = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('七陰'));
                    engine.promptModal({
                        title: 'アルファ [起動メイン]（七陰 7 種以上）', desc: '選擇 1 張［特徴：七陰］BP+1000 並獲得 [インパクト(1)]：',
                        cards: sevens, selectCount: 1, upTo: false,
                        onConfirm: (sel) => {
                            if (sel.length) {
                                engine.addSlotBp(sel[0].parentElement, 1000);
                                engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1);
                            }
                            done();
                        }
                    });
                } else {
                    engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
                    showSysMsg('アルファ [起動メイン]：本回合獲得 [インパクト(1)]！');
                    done();
                }
            }
        },
        'UAPR/KJN-1-056': {
            requireRaided: true,
            canActivateMain: (e, c, s) => window.UACardScripts['UA52BT/KJN-1-056'].canActivateMain(e, c, s),
            onActivateMain: (e, c, s, d) => window.UACardScripts['UA52BT/KJN-1-056'].onActivateMain(e, c, s, d)
        },

        // 紫事件：アイ・アム…… (6費)：場上有〈シド・カゲノー〉（含シャドウ）減 2 費
        'UA52BT/KJN-1-076': {
            getEnergyDiscount: (engine) => (engine.hasCharacterOnMyField('シド・カゲノー') || engine.hasCharacterOnMyField('シャドウ')) ? 2 : 0,
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, 'アイ・アム……', 5000, done)
        },

        // 紫事件：七陰
        'UA52BT/KJN-1-078': {
            onEventPlay(engine, cardEl, done) {
                const cnt = myFieldTops(engine).filter(c => engine.getCardDef(c)?.traits?.includes('七陰')).length;
                retireOppFront(engine, `七陰（場上 ${cnt} 張）`, cnt * 1000, done);
            }
        }
    });
})();
