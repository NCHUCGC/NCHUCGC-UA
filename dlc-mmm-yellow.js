/**
 * UA DLC 腳本包：魔法少女小圓 (Puella Magi Madoka Magica) - 黃色 (一彈 + 二彈，共 49 張)
 * 檔名：dlc-mmm-yellow.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function countEventsWithMamiBonus(engine, excludeEl = null) {
        let cnt = 0;
        document.querySelectorAll('#my-outside-area .card').forEach(c => {
            if (c === excludeEl) return;
            if (engine.getCardDef(c)?.type === 'EVENT') cnt++;
        });
        const hasMamiBonus = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .some(c => engine.getBaseCardId(c.dataset.cardId) === 'EX16BT/MMM-2-007');
        if (hasMamiBonus) cnt += 1;
        return cnt;
    }

    // EX16BT/MMM-2-004 鹿目 まどか
    scripts['EX16BT/MMM-2-004'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; }
    };

    // EX16BT/MMM-2-009 手作りケーキに挑戦中
    scripts['EX16BT/MMM-2-009'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const drawAmt = countEventsWithMamiBonus(engine, cardEl) >= 6 ? 2 : 1;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 2, upTo: true },
                { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' },
                { type: 'DRAW', amount: drawAmt }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // EX16BT/MMM-2-010 またね、ほむらちゃん
    scripts['EX16BT/MMM-2-010'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const amt = engine.hasCharacterOnMyField('鹿目 まどか') ? 3 : 2;
            engine.drawCards(amt);
            engine.moveCardToZone(cardEl, document.getElementById('my-remove-area'));
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            if (handCards.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'またね、ほむらちゃん', desc: '選擇 1 張手牌移至移除區：',
                cards: handCards, selectCount: 1, upTo: false,
                onConfirm: (sel) => { if (sel.length > 0) engine.moveCardToZone(sel[0], document.getElementById('my-remove-area')); if (onComplete) onComplete(); }
            });
        }
    };

    // UA31BT/MMM-1-005 暁美 ほむら
    scripts['UA31BT/MMM-1-005'] = {
        onAttack(engine, cardEl, onComplete) {
            const ult = Array.from(document.querySelectorAll('#my-remove-area .card')).filter(c => engine.getCardDef(c)?.name.includes('アルティメットまどか'));
            if (ult.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'アタック時效果：暁美 ほむら', desc: '是否將移除區 1 張〈アルティメットまどか〉送場外，本回合 BP+1000 與 [インパクト(1)]？',
                cards: [cardEl],
                customButtons: [
                    {
                        label: '送場外並強化', color: '#c1596f',
                        onClick: () => {
                            engine.moveCardToZone(ult[0], document.getElementById('my-outside-area'));
                            engine.addSlotBp(cardEl.parentElement, 1000);
                            engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
                            if (onComplete) onComplete();
                        }
                    },
                    { label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // UA31BT/MMM-1-010 佐倉 杏子
    scripts['UA31BT/MMM-1-010'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['PURPLE', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA31BT/MMM-1-017 巴 マミ
    scripts['UA31BT/MMM-1-017'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && countEventsWithMamiBonus(engine) >= 2) ? 1000 : 0; }
    };

    // UA31BT/MMM-1-019 巴 マミ (突襲)
    scripts['UA31BT/MMM-1-019'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                const maxBp = countEventsWithMamiBonus(engine) * 1000;
                if (maxBp <= 0) { if (onComplete) onComplete(); return; }
                engine.executeAbilityActions(cardEl, [
                    { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                    { type: 'BOUNCE_TO_HAND', target: 'SELECTED' }
                ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            });
        }
    };

    // UA31BT/MMM-1-020 巴 マミ
    scripts['UA31BT/MMM-1-020'] = {
        getEnergyDiscount(engine) { return countEventsWithMamiBonus(engine) >= 4 ? 5 : 0; }
    };

    // UA31BT/MMM-1-022 百江 なぎさ
    scripts['UA31BT/MMM-1-022'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; }
    };

    // UA31BT/MMM-1-028 円環の理
    scripts['UA31BT/MMM-1-028'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: 'SEND_TARGET_TO_REMOVE' }
            ], 0, { selectedTargets: [], addedFromLook: false }, () => {
                engine.moveCardToZone(cardEl, document.getElementById('my-remove-area'));
                if (onComplete) onComplete();
            });
        }
    };

    // UA31BT/MMM-1-029 こんなの！ 絶対おかしいよ！
    scripts['UA31BT/MMM-1-029'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const activeFl = engine.getSlotTopCards('#my-front-line .slot').filter(c => !c.classList.contains('rest'));
            if (activeFl.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'こんなの！ 絶対おかしいよ！', desc: '選擇前線 1 張活動角色轉為休息並抽 3 張牌：',
                cards: activeFl, selectCount: 1, upTo: false,
                onConfirm: (sel) => { if (sel.length > 0) { sel[0].classList.add('rest'); engine.drawCards(3); } if (onComplete) onComplete(); }
            });
        }
    };

    // UA31BT/MMM-1-032 ティロ・フィナーレ
    scripts['UA31BT/MMM-1-032'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasMami = engine.hasCharacterOnMyField('巴 マミ');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                ...(hasMami ? [{ type: 'RETIRE_TARGET', target: 'SELECTED' }] : [{ type: 'SET_REST', target: 'SELECTED' }, { type: 'FREEZE_TARGET', target: 'SELECTED' }])
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA31BT/MMM-1-033 もう何も恐くない
    scripts['UA31BT/MMM-1-033'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const freeze = engine.hasCharacterOnMyField('巴 マミ') && countEventsWithMamiBonus(engine, cardEl) >= 2;
            const actions = [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: false },
                { type: 'SET_REST', target: 'SELECTED' }
            ];
            if (freeze) actions.push({ type: 'FREEZE_TARGET', target: 'SELECTED' });
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA31BT/MMM-1-034 訳が分からないよ
    scripts['UA31BT/MMM-1-034'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.drawCards(2);
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            if (handCards.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '訳が分からないよ', desc: '選擇 1 張手牌送場外（若為事件卡再活動 1 AP）：',
                cards: handCards, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const isEv = engine.getCardDef(sel[0])?.type === 'EVENT';
                        engine.moveCardToZone(sel[0], document.getElementById('my-outside-area'));
                        if (isEv) engine.activateMyApCards(1);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA31ST/MMM-1-110 巴 マミ (突襲)
    scripts['UA31ST/MMM-1-110'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.pendingApDiscounts.push({ amount: 1, desc: '3費以下事件 AP-1', matchFn: (d) => d.type === 'EVENT' && (d.requiredEnergy?.count || 0) <= 3 });
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl) {
            return !engine.getRuntime(cardEl).usedOncePerTurn
                && countEventsWithMamiBonus(engine) >= 6
                && document.querySelectorAll('#my-hand-area .card').length >= 1;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [
                { type: 'DISCARD_HAND', count: 1 },
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: false },
                { type: 'SET_ACTIVE', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
