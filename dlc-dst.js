/**
 * Union Arena 卡片腳本 DLC：新石紀 Dr.STONE [DST]
 * 涵蓋：綠（石神千空 復活液石化軸／大木大樹）、黃（七海龍水 石油棄牌軸／コハク 石神村）、紫（獅子王司／氷月／あさぎりゲン）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

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
        // ==================== 綠色：科學王國／石化復活 ====================
        'UA14ST/DST-1-102': {
            onPlay(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                rt.persistentBp = (rt.persistentBp || 0) + 1000;
                engine.addSlotBp(cardEl.parentElement, 1000);
                done();
            }
        },
        'UA14ST/DST-1-105': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },
        'UA14ST/DST-1-096': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '科学で勝ってやんぞ', engine.hasCharacterOnMyField('石神 千空') ? 5000 : 3000, done)
        },

        // ==================== 黃色：七海龍水／石神村 ====================
        'UA14BT/DST-1-024': { getEnergyDiscount: (engine) => hasOppColor(engine, ['PURPLE', 'GREEN']) ? 1 : 0 },
        'UA14BT/DST-1-027': {
            getEnergyDiscount: (engine) => (engine.hasCharacterOnMyField('七海 龍水') && engine.hasCharacterOnMyField('石神 千空')) ? 2 : 0
        },
        'UA14BT/DST-1-020': {
            requireRaided: true,
            getContinuousImpact(engine, cardEl) {
                const cnt = myFieldTops(engine).filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('石神村')).length;
                return (cnt >= 5 || engine.hasCharacterOnMyField('ルリ')) ? 1 : 0;
            }
        },
        'UA14BT/DST-1-028': {
            onEventPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 5000);
                if (!opp.length) { showSysMsg('對手前線無 BP5000 以下角色。'); done(); return; }
                const retire = engine.hasCharacterOnMyField('七海 龍水');
                engine.promptModal({
                    title: `当たるぜ 船乗りのカンは？（${retire ? '退場' : '休息＋凍結'}）`,
                    desc: `選擇 1 張對手前線 BP5000 以下角色${retire ? '退場' : '休息並凍結'}：`,
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            if (retire) engine.requestRetireOpponentCard(sel[0]);
                            else if (sel[0].parentElement?.id.startsWith('opp-') && conn && isConnected) {
                                sel[0].classList.add('rest');
                                const sid = sel[0].parentElement.id.replace('opp-', 'my-');
                                conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REST_SLOT', slotId: sid });
                                conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_FREEZE_SLOT', slotId: sid });
                            }
                        }
                        done();
                    }
                });
            }
        },
        'UA14BT/DST-1-029': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'STONE WARS', engine.hasCharacterOnMyField('コハク') ? 5000 : 3000, done)
        },

        // ==================== 紫色：司帝國／あさぎりゲン ====================
        'UA14BT/DST-1-055': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'GREEN']) ? 1 : 0 },
        'UA14BT/DST-1-041': {
            getContinuousBpBonus: (engine) => (engine.isMyTurn && engine.hasCharacterOnMyField('ケータイ')) ? 500 : 0
        },

        // 紫 獅子王 司 (6費 BP 4500)：起動付1AP轉活動 / 橫置二選一(BP+1000+衝擊1 OR BP+1000+傷害2)
        'UA14BT/DST-1-054': {
            canActivateMain: (engine, cardEl) => engine.getActiveApCards().length >= 1 || !cardEl.classList.contains('rest'),
            onActivateMain(engine, cardEl, slot, done) {
                const btns = [];
                if (engine.getActiveApCards().length >= 1) {
                    btns.push({ label: '付 1 AP：轉為活動', color: '#4f9678', onClick: () => { if (engine.payAp(1)) cardEl.classList.remove('rest'); done(); } });
                }
                if (!cardEl.classList.contains('rest')) {
                    btns.push({
                        label: '橫置：BP+1000＆[インパクト(1)]', color: '#c1596f',
                        onClick: () => { cardEl.classList.add('rest'); engine.addSlotBp(slot, 1000); engine.getRuntime(cardEl).tempKeywords.IMPACT = Math.max(engine.getRuntime(cardEl).tempKeywords.IMPACT || 0, 1); done(); }
                    });
                    btns.push({
                        label: '橫置：BP+1000＆[ダメージ(2)]', color: '#e67e22',
                        onClick: () => { cardEl.classList.add('rest'); engine.addSlotBp(slot, 1000); engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2); done(); }
                    });
                }
                if (!btns.length) { done(); return; }
                engine.promptModal({ title: '獅子王 司 [起動メイン]', desc: '選擇起動效果：', cards: [cardEl], customButtons: btns });
            }
        },

        // 紫 氷月 (5費 Raid)：登場退場 BP3000 以下（我方回合可付 1 AP 改 BP5000 以下）
        'UA14BT/DST-1-058': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                if (!engine.isMyTurn || engine.getActiveApCards().length < 1) { retireOppFront(engine, '氷月 [登場時]', 3000, done); return; }
                engine.promptModal({
                    title: '氷月 [登場時]', desc: '是否支付 1 AP 將退場範圍從 BP3000 提升為 BP5000 以下？', cards: [cardEl],
                    customButtons: [
                        { label: '付 1 AP（退場 BP5000 以下）', color: '#c1596f', onClick: () => { if (engine.payAp(1)) retireOppFront(engine, '氷月', 5000, done); else done(); } },
                        { label: '不支付（退場 BP3000 以下）', color: '#4f9678', onClick: () => retireOppFront(engine, '氷月', 3000, done) }
                    ]
                });
            }
        },

        // 紫事件：霊長類最強の男
        'UA14BT/DST-1-067': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '霊長類最強の男', engine.hasCharacterOnMyField('獅子王 司') ? 5000 : 3000, done)
        }
    });
})();
