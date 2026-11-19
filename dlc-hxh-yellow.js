/**
 * UA DLC 腳本包：Hunter x Hunter 獵人 - 黃色 (二彈，共 41 張)
 * 檔名：dlc-hxh-yellow.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function countFacedownUnder(cardEl) {
        const slot = cardEl?.parentElement;
        if (!slot) return 0;
        return Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl && c.classList.contains('is-flipped')).length;
    }

    function hasNameInSameLine(engine, cardEl, targetName) {
        const line = cardEl.closest('#my-front-line') ? '#my-front-line .slot' : '#my-energy-line .slot';
        return engine.getSlotTopCards(line).some(c => c !== cardEl && engine.getCardDef(c)?.name.includes(targetName));
    }

    // EX01BT/HTR-2-006 レイザー
    scripts['EX01BT/HTR-2-006'] = {
        canActivateMain(engine, cardEl, slot) {
            return !!slot.closest('#my-front-line') && !engine.getRuntime(cardEl).usedOncePerTurn
                && engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => engine.getCardDef(c)?.traits?.includes('念獣'));
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const beasts = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('念獣'));
            engine.promptModal({
                title: '起動メイン：レイザー', desc: '選擇 1 張［特徴：念獣］退場，抽 1 張並本回合 BP+1000：',
                cards: beasts, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.getRuntime(cardEl).usedOncePerTurn = true;
                        engine.retireCardFromSlot(sel[0].parentElement);
                        engine.drawCards(1);
                        engine.addSlotBp(slot, 1000);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // EX01BT/HTR-2-008 レイザー (突襲)
    scripts['EX01BT/HTR-2-008'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            let total = 0;
            document.querySelectorAll('#my-front-line .slot').forEach(slot => {
                const top = engine.getTopCardInSlot(slot);
                if (!top) return;
                if (engine.getCardDef(top)?.traits?.includes('念獣')) total++;
                total += countFacedownUnder(top);
            });
            const maxBp = total * 1000;
            if (maxBp <= 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // EX01BT/HTR-2-010 No.0
    scripts['EX01BT/HTR-2-010'] = {
        getContinuousBpBonus(engine, cardEl) {
            return (engine.isFirstPlayer === null || engine.isMyTurn) ? countFacedownUnder(cardEl) * 1000 : 0;
        }
    };

    // EX01BT/HTR-2-015 ゴン＝フリークス
    scripts['EX01BT/HTR-2-015'] = {
        onAttack(engine, cardEl, onComplete) {
            if (hasNameInSameLine(engine, cardEl, 'キルア＝ゾルディック')) {
                engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
            }
            if (onComplete) onComplete();
        }
    };

    // EX01BT/HTR-2-016 ゴン＝フリークス (突襲)
    scripts['EX01BT/HTR-2-016'] = {
        requireRaided: true,
        getContinuousBpBonus(engine, cardEl) {
            if (engine.isFirstPlayer !== null && !engine.isMyTurn && cardEl.closest('#my-front-line')) {
                if (hasNameInSameLine(engine, cardEl, 'キルア＝ゾルディック') && hasNameInSameLine(engine, cardEl, 'ヒソカ')) return 2000;
            }
            return 0;
        },
        onAttack(engine, cardEl, onComplete) {
            if (hasNameInSameLine(engine, cardEl, 'キルア＝ゾルディック')) {
                engine.addSlotBp(cardEl.parentElement, 1000);
                engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
            }
            if (onComplete) onComplete();
        }
    };

    // EX01BT/HTR-2-018 ツェズゲラ
    scripts['EX01BT/HTR-2-018'] = {
        onPlay(engine, cardEl, onComplete) {
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => { if (engine.getCardDef(c)?.type === 'CHARACTER') engine.addSlotBp(c.parentElement, 500); });
            if (onComplete) onComplete();
        },
        canActivateMain(engine, cardEl) { return !engine.getRuntime(cardEl).usedOncePerTurn && engine.getActiveApCards().length >= 1; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            if (engine.payAp(1)) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => { if (engine.getCardDef(c)?.type === 'CHARACTER') engine.addSlotBp(c.parentElement, 500); });
            }
            if (onComplete) onComplete();
        }
    };

    // EX01BT/HTR-2-029 キルア＝ゾルディック (突襲)
    scripts['EX01BT/HTR-2-029'] = {
        requireRaided: true,
        canActivateMain(engine, cardEl, slot) { return !!slot.closest('#my-front-line') && !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const gons = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.name.includes('ゴン＝フリークス'));
            if (gons.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：キルア＝ゾルディック', desc: '選擇 1 張我方〈ゴン＝フリークス〉賦予 [ダメージ(+1)]：',
                cards: gons, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        cardEl.classList.add('rest');
                        const trt = engine.getRuntime(sel[0]);
                        trt.tempKeywords.DAMAGE_PLUS = (trt.tempKeywords.DAMAGE_PLUS || 0) + 1;
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };
    scripts['UAPR/HTR-2-029'] = scripts['EX01BT/HTR-2-029'];

    // EX01BT/HTR-2-030 ドッジボールコート
    scripts['EX01BT/HTR-2-030'] = {
        canActivateMain(engine, cardEl) { return !cardEl.classList.contains('rest'); },
        onActivateMain(engine, cardEl, slot, onComplete) {
            const outBeasts = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.traits?.includes('念獣'));
            if (outBeasts.length === 0) { showSysMsg('場外沒有［特徴：念獣］。'); if (onComplete) onComplete(); return; }
            const buttons = [
                {
                    label: '將場外 1 張［特徴：念獣］裏側墊在我方念獸底下', color: '#4f9678',
                    onClick: () => {
                        const fieldBeasts = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('念獣'));
                        if (fieldBeasts.length === 0) { if (onComplete) onComplete(); return; }
                        cardEl.classList.add('rest');
                        engine.promptModal({
                            title: '選擇場外念獸', desc: '選擇 1 張墊底：', cards: outBeasts, selectCount: 1, upTo: false,
                            onConfirm: (s1) => {
                                if (s1.length === 0) { if (onComplete) onComplete(); return; }
                                engine.promptModal({
                                    title: '選擇場上目標念獸', desc: '將該卡裏側墊在目標底下：', cards: fieldBeasts, selectCount: 1, upTo: false,
                                    onConfirm: (s2) => {
                                        if (s2.length > 0) {
                                            const dst = s2[0].parentElement;
                                            dst.insertBefore(s1[0], dst.firstChild);
                                            s1[0].classList.add('is-flipped'); s1[0].classList.remove('rest', 'in-life'); s1[0].style.position = 'absolute';
                                            recalcStacking(dst); broadcastMyState();
                                        }
                                        if (onComplete) onComplete();
                                    }
                                });
                            }
                        });
                    }
                }
            ];
            if (engine.getActiveApCards().length >= 1 && document.querySelectorAll('#my-hand-area .card').length >= 1) {
                buttons.push({
                    label: '付 1 AP＋棄 1 手牌：場外 1 張念獸休息登場', color: '#e67e22',
                    onClick: () => {
                        if (!engine.payAp(1)) { if (onComplete) onComplete(); return; }
                        cardEl.classList.add('rest');
                        engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, () => {
                            engine.promptModal({
                                title: '選擇場外念獸登場', desc: '選擇 1 張以休息狀態登場：', cards: outBeasts, selectCount: 1, upTo: false,
                                onConfirm: (sel) => {
                                    if (sel.length > 0) engine.chooseEmptyFieldSlotAndPlace(sel[0], { allowFront: true, allowEnergy: true, enterRest: true }, (p) => { if (p) engine.triggerCardAbilities(sel[0], 'ON_PLAY', onComplete); else if (onComplete) onComplete(); });
                                    else if (onComplete) onComplete();
                                }
                            });
                        });
                    }
                });
            }
            engine.promptModal({ title: '起動メイン：ドッジボールコート', desc: '請選擇 1 項效果：', cards: [], customButtons: buttons });
        }
    };

    // EX01BT/HTR-2-031 合体
    scripts['EX01BT/HTR-2-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const finish = () => {
                if (engine.hasCharacterOnMyField('キルア＝ゾルディック')) engine.drawCards(1);
                if (engine.hasCharacterOnMyField('ヒソカ')) engine.activateMyApCards(1);
                if (onComplete) onComplete();
            };
            if (engine.hasCharacterOnMyField('ゴン＝フリークス')) {
                engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 1, upTo: true }, { type: 'MODIFY_BP', amount: 2000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, finish);
            } else finish();
        }
    };

    // EX01BT/HTR-2-032 カンペキに勝つ♣だろ？ゴン♥
    scripts['EX01BT/HTR-2-032'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const teamCnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.traits?.includes('レイザー攻略組')).length;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                { type: teamCnt >= 3 ? 'RETIRE_TARGET' : 'SET_REST', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // EX01BT/HTR-2-033 垂直跳び
    scripts['EX01BT/HTR-2-033'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
            if (myChars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '垂直跳び', desc: '選擇 1 張我方角色退回手牌並活動 1 AP（若為〈ツェズゲラ〉再抽 1）：',
                cards: myChars, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        const isTse = engine.getCardDef(sel[0])?.name.includes('ツェズゲラ');
                        engine.bounceSlotTopCardToHand(sel[0].parentElement);
                        engine.activateMyApCards(1);
                        if (isTse) engine.drawCards(1);
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // EX01BT/HTR-2-034 スパイク
    scripts['EX01BT/HTR-2-034'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = engine.hasCharacterOnMyField('レイザー') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
