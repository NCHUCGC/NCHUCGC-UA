/**
 * UA DLC 腳本包：鏈鋸人 (Chainsaw Man) - 紫色 (共 45 張)
 * 檔名：dlc-csm-purple.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    // UA53BT/CSM-1-004 デンジ
    scripts['UA53BT/CSM-1-004'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; }
    };

    // UA53BT/CSM-1-010 天使の悪魔
    scripts['UA53BT/CSM-1-010'] = {
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.hasCharacterOnMyField('マキマ') && engine.usedEventThisTurn) ? 1000 : 0; }
    };

    // UA53BT/CSM-1-013 パワー
    scripts['UA53BT/CSM-1-013'] = {
        onAttack(engine, cardEl, onComplete) {
            if (engine.hasCharacterOnMyField('デンジ')) engine.addSlotBp(cardEl.parentElement, 500);
            if (onComplete) onComplete();
        }
    };

    // UA53BT/CSM-1-014 ビーム
    scripts['UA53BT/CSM-1-014'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            cardEl.classList.add('rest');
            engine.retireCardFromSlot(slot);
            const denjis = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('デンジ'));
            if (denjis.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：ビーム', desc: '選擇最多 1 張〈デンジ〉BP+1000 與 [インパクト(1)]：',
                cards: denjis, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.addSlotBp(sel[0].parentElement, 1000);
                        engine.getRuntime(sel[0]).tempKeywords.IMPACT = Math.max(engine.getRuntime(sel[0]).tempKeywords.IMPACT || 0, 1);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA53BT/CSM-1-022 マキマ
    scripts['UA53BT/CSM-1-022'] = {
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn && engine.usedEventThisTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            engine.getRuntime(cardEl).usedOncePerTurn = true;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: false },
                { type: 'GRANT_KEYWORD', keyword: 'IMPACT', value: 1, target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA53BT/CSM-1-023 マキマ (突襲)
    scripts['UA53BT/CSM-1-023'] = {
        requireRaided: true,
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const cands = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                if (!d || d.type !== 'EVENT') return false;
                const t = d.triggerText || '';
                const tt = d.compiledRules?.trigger?.type || '';
                return tt !== 'SPECIAL' && tt !== 'FINAL' && !t.includes('[スペシャル]') && !t.includes('[ファイナル]');
            });
            if (cands.length === 0) { showSysMsg('場外沒有非 [スペシャル]／非 [ファイナル] 的事件卡。'); if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：マキマ', desc: '從場外選擇 1 張事件卡加入手牌：',
                cards: cands, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) { engine.getRuntime(cardEl).usedOncePerTurn = true; engine.moveCardToZone(sel[0], document.getElementById('my-hand-area')); }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA53BT/CSM-1-024 マキマ (突襲)
    scripts['UA53BT/CSM-1-024'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.pendingApDiscounts.push({
                amount: 1, desc: '非S/非F事件 AP-1',
                matchFn: (d) => d.type === 'EVENT' && d.compiledRules?.trigger?.type !== 'SPECIAL' && d.compiledRules?.trigger?.type !== 'FINAL' && !(d.triggerText || '').includes('[スペシャル]') && !(d.triggerText || '').includes('[ファイナル]')
            });
            engine.drawCards(1);
            if (onComplete) onComplete();
        }
    };

    // UA53BT/CSM-1-030 レゼ
    scripts['UA53BT/CSM-1-030'] = {
        onPlay(engine, cardEl, onComplete) {
            const others = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => c !== cardEl && engine.getCardDef(c)?.type === 'CHARACTER');
            if (others.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：レゼ', desc: '是否退場 1 張其他我方角色以發動二選一效果？',
                cards: others, selectCount: 1, upTo: true,
                customButtons: [{ label: '不發動', color: '#7f8c8d', onClick: () => { if (onComplete) onComplete(); } }],
                onConfirm: (sel) => {
                    if (sel.length === 0) { if (onComplete) onComplete(); return; }
                    engine.retireCardFromSlot(sel[0].parentElement);
                    engine.promptModal({
                        title: '效果二選一：レゼ', desc: '請選擇 1 項效果：', cards: [],
                        customButtons: [
                            { label: '抽 1 張並選其他 1 角色 BP+2000', color: '#e67e22', onClick: () => { engine.drawCards(1); engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', excludeSelf: true, count: 1, upTo: true }, { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete); } },
                            { label: '抽 2 張牌', color: '#4f9678', onClick: () => { engine.drawCards(2); if (onComplete) onComplete(); } }
                        ]
                    });
                }
            });
        }
    };

    // UA53BT/CSM-1-031 レゼ (突襲)
    scripts['UA53BT/CSM-1-031'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.drawCards(1);
            engine.promptModal({
                title: '登場時效果：レゼ', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    { label: '對手前線 1 角色 BP-1000', color: '#c1596f', onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true }, { type: 'MODIFY_BP', amount: -1000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete) },
                    { label: '活動 1 張 AP（本回合我方〈デンジ〉退場時）', color: '#4f9678', onClick: () => { engine.activateMyApCards(1); if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // UA53BT/CSM-1-038 デンジ君の心臓貰うね・・・
    scripts['UA53BT/CSM-1-038'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
            if (myChars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: 'デンジ君の心臓貰うね・・・', desc: '選擇 1 張我方角色退場，活動 1 AP 並抽 2 張牌：',
                cards: myChars, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) { engine.retireCardFromSlot(sel[0].parentElement); engine.activateMyApCards(1); engine.drawCards(2); }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA53BT/CSM-1-039 ボンっ
    scripts['UA53BT/CSM-1-039'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('レゼ') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA53BT/CSM-1-040 私も田舎のネズミが好き
    scripts['UA53BT/CSM-1-040'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const actions = [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ];
            if (engine.usedEventThisTurn) {
                actions.push({ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true });
                actions.push({ type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' });
            }
            engine.executeAbilityActions(cardEl, actions, 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
