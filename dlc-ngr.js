/**
 * UA DLC 腳本包：2.5次元的誘惑 (2.5 Dimensional Seduction) - 全色 (藍 / 黃，共 88 張)
 * 檔名：dlc/dlc-ngr.js
 */
(function () {
    const scripts = {};

    function countFrontDistinctAirborne(engine) {
        const names = new Set();
        engine.getSlotTopCards('#my-front-line .slot').forEach(c => {
            const d = engine.getCardDef(c);
            if (d && d.traits?.includes('天使空挺隊') && d.name) names.add(d.name);
        });
        return names.size;
    }

    function countMyAirborne(engine, excludeEl = null) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .filter(c => c !== excludeEl && engine.getCardDef(c)?.traits?.includes('天使空挺隊')).length;
    }

    // ==================== 藍色 ====================

    // UA33BT/NGR-1-043 奥村 正宗
    scripts['UA33BT/NGR-1-043'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '登場時效果：奥村 正宗', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    {
                        label: '從場外回收 1 張含「リリサ」角色', color: '#4f739e',
                        onClick: () => {
                            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                                const d = engine.getCardDef(c);
                                return d && d.type === 'CHARACTER' && d.name.includes('リリサ');
                            });
                            if (cands.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '回收含「リリサ」角色', desc: '選擇最多 1 張加入手牌：', cards: cands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); if (onComplete) onComplete(); }
                            });
                        }
                    },
                    {
                        label: '使場上 1 張含「リリサ」角色轉為活動', color: '#4f9678',
                        onClick: () => {
                            const cands = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('リリサ'));
                            if (cands.length === 0) { if (onComplete) onComplete(); return; }
                            engine.promptModal({
                                title: '選擇含「リリサ」角色轉為活動', desc: '選擇最多 1 張：', cards: cands, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length > 0) sel[0].classList.remove('rest'); if (onComplete) onComplete(); }
                            });
                        }
                    }
                ]
            });
        }
    };

    // UA33BT/NGR-1-055 753♡
    scripts['UA33BT/NGR-1-055'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; }
    };

    // UA33BT/NGR-1-061 アリエル 天使空挺隊/アリア (突襲)
    scripts['UA33BT/NGR-1-061'] = {
        requireRaided: true,
        getContinuousImpact(engine) { return countFrontDistinctAirborne(engine) >= 3 ? 1 : 0; },
        onPlay(engine, cardEl, onComplete) {
            if (countFrontDistinctAirborne(engine) >= 2) {
                engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 2 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            } else if (onComplete) onComplete();
        },
        onAttack(engine, cardEl, onComplete) {
            if (countFrontDistinctAirborne(engine) >= 4) {
                document.querySelectorAll('#my-front-line .slot').forEach(s => { if (engine.getTopCardInSlot(s)) engine.addSlotBp(s, 1000); });
            }
            if (onComplete) onComplete();
        }
    };

    // UA33BT/NGR-1-063 ノキエル 天使空挺隊/ノノア
    scripts['UA33BT/NGR-1-063'] = {
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyAirborne(engine, cardEl) >= 3) ? 1000 : 0; }
    };

    // UA33BT/NGR-1-064 ノキエル 天使空挺隊/ノノア
    scripts['UA33BT/NGR-1-064'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countFrontDistinctAirborne(engine) >= 3) ? 500 : 0; }
    };

    // UA33BT/NGR-1-065 ミリエラ 天使空挺隊/美花莉
    scripts['UA33BT/NGR-1-065'] = {
        getContinuousBpBonus(engine, cardEl) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countMyAirborne(engine, cardEl) >= 3) ? 1000 : 0; }
    };

    // UA33BT/NGR-1-067 ミリエラ 天使空挺隊/美花莉
    scripts['UA33BT/NGR-1-067'] = {
        onPlay(engine, cardEl, onComplete) {
            if (cardEl.closest('#my-front-line') && countFrontDistinctAirborne(engine) >= 4) cardEl.classList.remove('rest');
            if (onComplete) onComplete();
        },
        onAttack(engine, cardEl, onComplete) {
            if (countFrontDistinctAirborne(engine) >= 3) {
                engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            } else if (onComplete) onComplete();
        }
    };

    // UA33BT/NGR-1-070 リリエル 天使空挺隊/リリサ (突襲)
    scripts['UA33BT/NGR-1-070'] = {
        requireRaided: true,
        getContinuousImpact(engine, cardEl) { return (countFrontDistinctAirborne(engine) >= 4 && engine.getEffectiveCardBp(cardEl) >= 5000) ? 1 : 0; }
    };

    // UA33BT/NGR-1-071 イコラ/753♡
    scripts['UA33BT/NGR-1-071'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; }
    };

    // UA33BT/NGR-1-077 負けられないのよっ!!!
    scripts['UA33BT/NGR-1-077'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const has753 = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => engine.getCardDef(c)?.name.includes('753♡'));
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: has753 ? 5000 : 3000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA33BT/NGR-1-078 初めてのイベント
    scripts['UA33BT/NGR-1-078'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: false },
                { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' },
                { type: 'ACTIVATE_AP', count: 1 }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA33BT/NGR-1-079 私たちは本気だ
    scripts['UA33BT/NGR-1-079'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = countMyAirborne(engine) * 1000;
            if (maxBp <= 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 黃色 ====================

    // UA33BT/NGR-1-009 喜咲 アリア
    scripts['UA33BT/NGR-1-009'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; }
    };

    // UA33BT/NGR-1-018 ノノア
    scripts['UA33BT/NGR-1-018'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer !== null && !engine.isMyTurn) ? 1000 : 0; }
    };

    // UA33BT/NGR-1-022 クーリア/ノノア (突襲)
    scripts['UA33BT/NGR-1-022'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; }
    };

    // UA33BT/NGR-1-024 ミリエラ 衛生小隊/美花莉 (突襲)
    scripts['UA33BT/NGR-1-024'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; },
        onPlay(engine, cardEl, onComplete) { engine.addSlotBp(cardEl.parentElement, 1000); if (onComplete) onComplete(); }
    };

    // UA33BT/NGR-1-025 ミリエラ 衛生小隊/美花莉 (突襲)
    scripts['UA33BT/NGR-1-025'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) { engine.addSlotBp(cardEl.parentElement, 1000); if (onComplete) onComplete(); }
    };

    // UA33BT/NGR-1-026 メリア/アリア (突襲)
    scripts['UA33BT/NGR-1-026'] = {
        requireRaided: true,
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 500 : 0; }
    };

    // UA33BT/NGR-1-037 透き通る氷の煌めき
    scripts['UA33BT/NGR-1-037'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasNonoa = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => engine.getCardDef(c)?.name.includes('ノノア'));
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                ...(hasNonoa ? [{ type: 'RETIRE_TARGET', target: 'SELECTED' }] : [{ type: 'SET_REST', target: 'SELECTED' }, { type: 'FREEZE_TARGET', target: 'SELECTED' }])
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA33BT/NGR-1-039 私リリエルが大好きなんです
    scripts['UA33BT/NGR-1-039'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasLilysa = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => engine.getCardDef(c)?.name.includes('リリサ'));
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: hasLilysa ? 5000 : 3000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
