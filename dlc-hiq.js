/**
 * Union Arena 卡片腳本 DLC：排球少年！！ (Haikyu!!) [HIQ]
 * 涵蓋：紅（烏野 日向／影山）、黃（音駒＆梟谷 高校3種異名）、藍（青葉城西 及川／岩泉、白鳥澤 牛島若利）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const myFieldTops = (engine) => engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot');
    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const countSchoolTraits = (engine) => {
        const s = new Set();
        myFieldTops(engine).forEach(c => {
            (engine.getCardDef(c)?.traits || []).forEach(t => { if (t.includes('高校')) s.add(t); });
        });
        return s.size;
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
        // ==================== 紅色：烏野高校 ====================
        'UA19ST/HIQ-1-106': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },
        'UA19ST/HIQ-1-100': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'ドンピシャ!!!', engine.hasCharacterOnMyField('日向 翔陽') ? 5000 : 3000, done)
        },

        // ==================== 黃色：音駒／梟谷（高校3種連動） ====================
        'UA19BT/HIQ-1-026': { getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'RED']) ? 1 : 0 },

        // 黃事件：強豪校との合宿
        'UA19BT/HIQ-1-031': {
            onEventPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 5000);
                if (!opp.length) { showSysMsg('對手前線無 BP5000 以下角色。'); done(); return; }
                const retire = countSchoolTraits(engine) >= 3;
                engine.promptModal({
                    title: `強豪校との合宿（${retire ? '退場' : '休息'}）`,
                    desc: `選擇 1 張對手前線 BP5000 以下角色${retire ? '退場' : '轉為休息'}：`,
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            if (retire) engine.requestRetireOpponentCard(sel[0]);
                            else {
                                sel[0].classList.add('rest');
                                if (sel[0].parentElement?.id.startsWith('opp-') && conn && isConnected) {
                                    conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REST_SLOT', slotId: sel[0].parentElement.id.replace('opp-', 'my-') });
                                }
                            }
                        }
                        done();
                    }
                });
            }
        },

        // ==================== 藍色：青葉城西／白鳥澤 ====================
        'UA19BT/HIQ-1-048': { getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'RED']) ? 1 : 0 },

        // 岩泉 一 (4費 Raid)：登場依場上［特徴：青葉城西高校］張數×500彈回對手前線
        'UA19BT/HIQ-1-035': {
            onPlay(engine, cardEl, done) {
                const isRaid = !!engine.getRuntime(cardEl)?.isRaided;
                const pool = isRaid ? myFieldTops(engine) : engine.getSlotTopCards('#my-energy-line .slot');
                const cnt = pool.filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('青葉城西高校')).length;
                const limit = cnt * 500;
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
                if (!opp.length) { done(); return; }
                engine.promptModal({
                    title: `岩泉 一 [登場時]（彈回 BP${limit} 以下）`, desc: '選擇最多 1 張對手前線角色退回手牌：',
                    cards: opp, selectCount: 1, upTo: true,
                    onConfirm: (sel) => { if (sel.length) engine.requestBounceOpponentCard(sel[0]); done(); }
                });
            }
        },

        // 牛島 若利 (5費)：起動橫置任意張其他活動白鳥澤角色，1+衝擊(1)、3+BP+1000＆傷害(2)
        'UA19BT/HIQ-1-051': {
            canActivateMain: (engine, cardEl) =>
                !engine.getRuntime(cardEl).usedOncePerTurn &&
                myFieldTops(engine).some(c => c !== cardEl && !c.classList.contains('rest') && engine.getCardDef(c)?.traits?.includes('白鳥沢学園高校')),
            onActivateMain(engine, cardEl, slot, done) {
                const cands = myFieldTops(engine).filter(c => c !== cardEl && !c.classList.contains('rest') && engine.getCardDef(c)?.traits?.includes('白鳥沢学園高校'));
                engine.promptModal({
                    title: '牛島 若利 [起動メイン]', desc: '選擇任意張其他活動的［特徴：白鳥沢学園高校］轉為休息（1+ 衝擊1、3+ BP+1000＆傷害2）：',
                    cards: cands, selectCount: cands.length, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            const rt = engine.getRuntime(cardEl);
                            rt.usedOncePerTurn = true;
                            sel.forEach(c => c.classList.add('rest'));
                            if (sel.length >= 1) rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                            if (sel.length >= 3) { engine.addSlotBp(slot, 1000); rt.tempKeywords.DAMAGE = Math.max(rt.tempKeywords.DAMAGE || 0, 2); }
                        }
                        done();
                    }
                });
            }
        },

        // 牛島 若利 (6費 BP 4500)：場上其他白鳥澤 5 張以上 BP+500＆傷害(2)
        'UA19BT/HIQ-1-052': {
            getContinuousBpBonus: (engine, cardEl) =>
                myFieldTops(engine).filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('白鳥沢学園高校')).length >= 5 ? 500 : 0,
            onAttack(engine, cardEl, done) {
                if (myFieldTops(engine).filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('白鳥沢学園高校')).length >= 5) {
                    engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                }
                done();
            }
        },

        // 藍事件：ジャンプサーブ／スーパーエース
        'UA19BT/HIQ-1-065': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, 'ジャンプサーブ', engine.hasCharacterOnMyField('及川 徹') ? 5000 : 3000, done)
        },
        'UA19BT/HIQ-1-066': {
            onEventPlay(engine, cardEl, done) {
                const chars = myFieldTops(engine);
                if (!chars.length) { done(); return; }
                engine.promptModal({
                    title: 'スーパーエース', desc: '選擇 1 張我方角色 BP+1000 並獲得 [狙い撃ち]：',
                    cards: chars, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) { engine.addSlotBp(sel[0].parentElement, 1000); engine.getRuntime(sel[0]).tempKeywords.SNIPE = 1; }
                        const ushi = chars.filter(c => engine.getCardDef(c)?.name?.includes('牛島 若利'));
                        if (ushi.length) ushi[0].classList.remove('rest');
                        done();
                    }
                });
            }
        }
    });
})();
