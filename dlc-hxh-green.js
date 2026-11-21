/**
 * UA DLC 腳本包：Hunter x Hunter 獵人 - 綠色 (一彈 + 二彈，共 70 張)
 * 檔名：dlc-hxh-green.js（直接放入與 index.html 相同資料夾即可自動生效）
 */
(function () {
    const scripts = {};

    function countCoreFriends(engine) {
        let cnt = 0;
        if (engine.hasCharacterOnMyField('ゴン＝フリークス')) cnt++;
        if (engine.hasCharacterOnMyField('キルア＝ゾルディック')) cnt++;
        if (engine.hasCharacterOnMyField('レオリオ')) cnt++;
        return cnt;
    }

    // EX01BT/HTR-2-065 クラピカ
    scripts['EX01BT/HTR-2-065'] = {
        onPlay(engine, cardEl, onComplete) {
            if (countCoreFriends(engine) < 1) { if (onComplete) onComplete(); return; }
            const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => {
                const d = engine.getCardDef(c);
                return engine.getEffectiveCardBp(c) <= 2500 || d?.traits?.includes('幻影旅団');
            });
            if (cands.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '登場時效果：クラピカ', desc: '選擇對手前線 BP 2500 以下或［特徴：幻影旅団］最多 1 張轉為休息：',
                cards: cands, selectCount: 1, upTo: true,
                onConfirm: (sel) => {
                    if (sel.length > 0) engine.requestRestOpponentCard(sel[0]);
                    if (onComplete) onComplete();
                }
            });
        },
        onAttack(engine, cardEl, onComplete) {
            if (countCoreFriends(engine) >= 2) {
                engine.executeAbilityActions(cardEl, [{ type: 'DRAW', amount: 1 }, { type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
            } else if (onComplete) onComplete();
        }
    };

    // EX01BT/HTR-2-073 制約と誓約
    scripts['EX01BT/HTR-2-073'] = {
        onEventPlay(engine, cardEl, onComplete) {
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
                if (engine.getCardDef(c)?.type === 'CHARACTER') engine.addSlotBp(c.parentElement, 1000);
            });
            const handCards = Array.from(document.querySelectorAll('#my-hand-area .card'));
            if (handCards.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '制約と誓約', desc: '可選擇任意張數手牌捨棄，每捨棄 1 張全體我方角色再 BP+500：',
                cards: handCards, selectCount: handCards.length, upTo: true,
                onConfirm: (sel) => {
                    const out = document.getElementById('my-outside-area');
                    sel.forEach(c => engine.moveCardToZone(c, out));
                    if (sel.length > 0) {
                        const bonus = sel.length * 500;
                        engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
                            if (engine.getCardDef(c)?.type === 'CHARACTER') engine.addSlotBp(c.parentElement, bonus);
                        });
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA03BT/HTR-1-068 陰獣
    scripts['UA03BT/HTR-1-068'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['BLUE', 'PURPLE'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA03BT/HTR-1-073 クラピカ
    scripts['UA03BT/HTR-1-073'] = {
        getContinuousImpact(engine) { return (engine.calculateMyEnergy().ALL || 0) >= 6 ? 1 : 0; }
    };

    // UA03BT/HTR-1-074 クラピカ (突襲：登場二選一橫置對手前線1張 / 獲得狙擊)
    scripts['UA03BT/HTR-1-074'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.promptModal({
                title: '登場時效果：クラピカ', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    {
                        label: '對手前線 1 角色轉為休息', color: '#6c93c7',
                        onClick: () => engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', count: 1, upTo: true }, { type: 'SET_REST', target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete)
                    },
                    {
                        label: '此角色本回合獲得 [狙い撃ち]', color: '#8e44ad',
                        onClick: () => { engine.getRuntime(cardEl).tempKeywords.SNIPE = 1; if (onComplete) onComplete(); }
                    }
                ]
            });
        }
    };

    // UA03BT/HTR-1-078 ゴン＝フリークス (突襲)
    scripts['UA03BT/HTR-1-078'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 2, upTo: true }, { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        },
        onAttack(engine, cardEl, onComplete) {
            engine.executeAbilityActions(cardEl, [{ type: 'SELECT_TARGET', owner: 'MY', zone: 'FIELD', count: 2, upTo: true }, { type: 'MODIFY_BP', amount: 1000, target: 'SELECTED' }], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UAPR/HTR-1-078'] = scripts['UA03BT/HTR-1-078'];

    // UA03BT/HTR-1-087 ハンゾー
    scripts['UA03BT/HTR-1-087'] = {
        onAttack(engine, cardEl, onComplete) {
            engine.promptModal({
                title: 'アタック時效果：ハンゾー', desc: '請選擇 1 項效果：', cards: [],
                customButtons: [
                    { label: '本回合 BP+1000', color: '#e67e22', onClick: () => { engine.addSlotBp(cardEl.parentElement, 1000); if (onComplete) onComplete(); } },
                    { label: '本回合獲得 [ダメージ(2)]', color: '#c1596f', onClick: () => { engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2); if (onComplete) onComplete(); } }
                ]
            });
        }
    };

    // UA03BT/HTR-1-092 レオリオ
    scripts['UA03BT/HTR-1-092'] = {
        onUnblockedAttack(engine, cardEl, onComplete) {
            const rt = engine.getRuntime(cardEl);
            if (!rt.usedOncePerTurn) { rt.usedOncePerTurn = true; engine.drawCards(1); }
            if (onComplete) onComplete();
        },
        canActivateMain(engine) { return engine.getActiveApCards().length >= 1; },
        onActivateMain(engine, cardEl, slot, onComplete) {
            if (engine.payAp(1)) {
                engine.addSlotBp(slot, 1500);
                engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1);
            }
            if (onComplete) onComplete();
        }
    };

    // UA03BT/HTR-1-094 キルア＝ゾルディック
    scripts['UA03BT/HTR-1-094'] = {
        canActivateMain(engine, cardEl) {
            const canStand = cardEl.classList.contains('rest') && !engine.getRuntime(cardEl).usedOncePerTurn && engine.getEffectiveCardBp(cardEl) >= 4000;
            const canDebuff = !cardEl.classList.contains('rest');
            return canStand || canDebuff;
        },
        onActivateMain(engine, cardEl, slot, onComplete) {
            if (cardEl.classList.contains('rest') && engine.getEffectiveCardBp(cardEl) >= 4000) {
                engine.getRuntime(cardEl).usedOncePerTurn = true;
                cardEl.classList.remove('rest');
                if (onComplete) onComplete();
                return;
            }
            cardEl.classList.add('rest');
            const opp = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 1500);
            if (opp.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '起動メイン：キルア＝ゾルディック', desc: '選擇對手場上 BP 1500 以上最多 1 張 BP-1000：',
                cards: opp, selectCount: 1, upTo: true,
                onConfirm: (sel) => { if (sel.length > 0) engine.addSlotBp(sel[0].parentElement, -1000); if (onComplete) onComplete(); }
            });
        }
    };

    // UA03BT/HTR-1-096 絶対時間
    scripts['UA03BT/HTR-1-096'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const myChars = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => engine.getCardDef(c)?.type === 'CHARACTER');
            if (myChars.length === 0) { if (onComplete) onComplete(); return; }
            engine.promptModal({
                title: '絶対時間', desc: '選擇 1 張我方角色 BP+3000（若為〈クラピカ〉再賦予 [狙い撃ち]）：',
                cards: myChars, selectCount: 1, upTo: false,
                onConfirm: (sel) => {
                    if (sel.length > 0) {
                        engine.addSlotBp(sel[0].parentElement, 3000);
                        if (engine.getCardDef(sel[0])?.name.includes('クラピカ')) engine.getRuntime(sel[0]).tempKeywords.SNIPE = 1;
                    }
                    if (onComplete) onComplete();
                }
            });
        }
    };

    // UA03BT/HTR-1-097 釣り竿
    scripts['UA03BT/HTR-1-097'] = {
        onEventPlay(engine, cardEl, onComplete) {
            let maxMyBp = 0;
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
                maxMyBp = Math.max(maxMyBp, engine.getEffectiveCardBp(c));
            });
            const hasGon = engine.hasCharacterOnMyField('ゴン＝フリークス');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: maxMyBp, count: 1, upTo: false },
                { type: hasGon ? 'RETIRE_TARGET' : 'BOUNCE_TO_HAND', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA03ST/HTR-1-097'] = scripts['UA03BT/HTR-1-097'];

    // UA03ST/HTR-1-102 ゴン＝フリークス (突襲)
    scripts['UA03ST/HTR-1-102'] = {
        requireRaided: true,
        onPlay(engine, cardEl, onComplete) {
            engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').forEach(c => {
                if (engine.getCardDef(c)?.type === 'CHARACTER') engine.addSlotBp(c.parentElement, 1000);
            });
            if (onComplete) onComplete();
        }
    };

    // UA03ST/HTR-1-109 ジンの写真
    scripts['UA03ST/HTR-1-109'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const deckArea = document.getElementById('my-deck-area');
            const allDeck = Array.from(deckArea.querySelectorAll('.card'));
            const cnt = Math.min(5, allDeck.length);
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            const topCards = allDeck.slice(allDeck.length - cnt).reverse();
            engine.promptModal({
                title: `ジンの写真（檢視牌頂 ${cnt} 張）`, desc: '選擇最多 1 張角色加入手牌（若為〈ゴン＝フリークス〉再抽 1）：',
                cards: topCards, cardFilterFn: (c) => engine.getCardDef(c)?.type === 'CHARACTER', selectCount: 1, upTo: true,
                onConfirm: (picked) => {
                    picked.forEach(c => {
                        engine.moveCardToZone(c, document.getElementById('my-hand-area'));
                        if (engine.getCardDef(c)?.name.includes('ゴン＝フリークス')) engine.drawCards(1);
                    });
                    const rest = topCards.filter(c => !picked.includes(c));
                    engine.promptOrderCardsToDeck(rest, 'BOTTOM', onComplete);
                }
            });
        }
    };

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
