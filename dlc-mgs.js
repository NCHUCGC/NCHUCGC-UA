/**
 * Union Arena 卡片腳本 DLC：物語系列 (Monogatari Series) [MGS]
 * 涵蓋：紫（阿良々木暦／キスショット／忍野忍／羽川翼）、黃（ファイヤーシスターズ 火憐＆月火／千石撫子）、紅（戦場ヶ原ひたぎ／神原駿河）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

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
        // ==================== 紫色：吸血鬼／羽川 ====================
        'UA42BT/MGS-1-034': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'RED']) ? 1 : 0 },
        'UA42BT/MGS-1-036': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },

        'UA42ST/MGS-1-101': {
            requireRaided: true,
            onPlay(engine, cardEl, done) { engine.addSlotBp(cardEl.parentElement, 1000); done(); }
        },
        'UA42ST/MGS-1-105': {
            getContinuousBpBonus: (engine, cardEl) => -countUnder(cardEl) * 1000
        },
        'UA42BT/MGS-1-044': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && engine.hasCharacterOnMyField('阿良々木 暦')) ? 500 : 0
        },
        'UA42ST/MGS-1-067': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '妖刀心渡', (engine.hasCharacterOnMyField('キスショット') || engine.hasCharacterOnMyField('忍野 忍')) ? 5000 : 3000, done)
        },

        // ==================== 黃色：ファイヤーシスターズ／千石撫子 ====================
        'UA42ST/MGS-1-110': { getEnergyDiscount: () => document.querySelectorAll('#my-front-line .card, #my-energy-line .card').length === 0 ? 2 : 0 },
        'UA42BT/MGS-1-005': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'RED']) ? 1 : 0 },

        'UA42BT/MGS-1-025': {
            onRetire(engine, cardEl, done) {
                engine.moveCardToZone(cardEl, document.getElementById('my-hand-area'));
                showSysMsg('阿良々木 月火 [退場時]：不死鳥特性，已返回手牌！');
                done();
            }
        },
        'UA42BT/MGS-1-029': {
            onEventPlay(engine, cardEl, done) {
                engine.pendingApDiscounts.push({
                    amount: 1, desc: '解呪の儀式 (千石 撫子 AP-1)',
                    matchFn: (d) => (d?.name || '').includes('千石 撫子')
                });
                engine.drawCards(1);
                showSysMsg('解呪の儀式：請將我方場上 1 張場域退場，下次〈千石 撫子〉消費 AP-1！');
                done();
            }
        },
        'UA42BT/MGS-1-030': {
            onEventPlay(engine, cardEl, done) {
                const k = engine.hasCharacterOnMyField('阿良々木 火憐');
                const t = engine.hasCharacterOnMyField('阿良々木 月火');
                const limit = (k && t) ? 5000 : ((k || t) ? 4000 : 2000);
                retireOppFront(engine, '栂の木二中のファイヤーシスターズ', limit, done);
            }
        },

        // ==================== 紅色：戦場ヶ原ひたぎ／神原駿河 ====================
        'UA42ST/MGS-1-113': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0,
            onPlay(engine, cardEl, done) {
                const cards = cardEl.parentElement ? Array.from(cardEl.parentElement.querySelectorAll('.card')) : [];
                const baseDef = cards.length >= 2 ? engine.getCardDef(cards[cards.length - 2]) : null;
                const canDouble = (baseDef?.requiredEnergy?.count || 0) >= 1;
                engine.promptModal({
                    title: '戦場ヶ原 ひたぎ [登場時]：二選一', desc: '請選擇要發動的效果：', cards: [cardEl],
                    customButtons: [
                        { label: '抽 1 張牌', color: '#4f9678', onClick: () => { engine.drawCards(1); done(); } },
                        ...(canDouble ? [{ label: '獲得 [2回アタック]', color: '#c1596f', onClick: () => { engine.getRuntime(cardEl).tempKeywords.DOUBLE_ATTACK = 1; done(); } }] : [])
                    ]
                });
            }
        }
    });
})();
