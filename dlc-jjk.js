/**
 * Union Arena 卡片腳本 DLC：咒術迴戰 (Jujutsu Kaisen) [JJK]
 * 涵蓋：藍（宿儺指軸／七海）、黃（五條悟／伏黒式神／釘崎）、紫（真人／東堂／メカ丸／甚爾）、紅（渋谷事變 虎杖／五條／脹相／漏瑚）核心卡片
 */
(function () {
    if (typeof window.registerCardScripts !== 'function') return;

    const countOutsideName = (engine, name) =>
        Array.from(document.querySelectorAll('#my-outside-area .card'))
            .filter(c => engine.getCardDef(c)?.name?.includes(name)).length;

    const hasOppColor = (engine, colors) =>
        engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot')
            .some(c => colors.includes(engine.getCardDef(c)?.color));

    const myDeckCount = () => document.querySelectorAll('#my-deck-area .card').length;

    const retireOppFront = (engine, title, limit, onDone, toRemove = false) => {
        const cands = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= limit);
        if (!cands.length) { showSysMsg(`對手前線無 BP${limit} 以下角色。`); onDone(); return; }
        engine.promptModal({
            title: `${title} (BP${limit}以下)`,
            desc: `選擇最多 1 張對手前線 BP${limit} 以下角色${toRemove ? '移至移除區' : '退場'}：`,
            cards: cands, selectCount: 1, upTo: true,
            onConfirm: (sel) => {
                if (sel.length) {
                    if (toRemove && sel[0].parentElement?.id.startsWith('opp-') && conn && isConnected) {
                        conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REMOVE_SLOT', slotId: sel[0].parentElement.id.replace('opp-', 'my-') });
                    } else {
                        engine.requestRetireOpponentCard(sel[0]);
                    }
                }
                onDone();
            }
        });
    };

    window.registerCardScripts({
        // ==================== 藍色：宿儺指軸／虎杖／七海 ====================

        'UA02BT/JJK-1-035': {
            getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'PURPLE']) ? 1 : 0
        },

        // 宿儺 (ST 4費 Raid)：場外宿儺之指 1+ BP+1000、2+ 衝擊(1)；登場抽2棄1
        'UA02ST/JJK-1-105': {
            requireRaided: true,
            getContinuousBpBonus: (engine) => (engine.isMyTurn && countOutsideName(engine, '宿儺の指') >= 1) ? 1000 : 0,
            getContinuousImpact: (engine) => (engine.isMyTurn && countOutsideName(engine, '宿儺の指') >= 2) ? 1 : 0,
            onPlay(engine, cardEl, done) {
                engine.drawCards(2);
                engine.executeAbilityActions(cardEl, [{ type: 'DISCARD_HAND', count: 1 }], 0, { selectedTargets: [], addedFromLook: false }, done);
            }
        },
        'UAPR/JJK-1-105': {
            requireRaided: true,
            getContinuousBpBonus: (e) => window.UACardScripts['UA02ST/JJK-1-105'].getContinuousBpBonus(e),
            getContinuousImpact: (e) => window.UACardScripts['UA02ST/JJK-1-105'].getContinuousImpact(e),
            onPlay: (e, c, d) => window.UACardScripts['UA02ST/JJK-1-105'].onPlay(e, c, d)
        },

        // 宿儺 (EX 7費 Raid BP 5000)：登場依場外宿儺之指數量選 1 / 2 / 全部
        'EX04BT/JJK-3-015': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const fingers = countOutsideName(engine, '宿儺の指');
                const picks = fingers >= 4 ? 3 : (fingers === 3 ? 2 : 1);
                const doDiscard = (cb) => {
                    engine.drawCards(1);
                    if (conn && isConnected) conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_DISCARD_HAND', count: 1 });
                    showSysMsg('宿儺：我方抽 1 張，對手棄 1 張手牌！');
                    cb();
                };
                const doDebuff = (cb) => {
                    document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                        const top = engine.getTopCardInSlot(slot);
                        if (top && engine.getEffectiveCardBp(top) >= 2500) engine.addSlotBp(slot, -2000);
                    });
                    showSysMsg('宿儺：對手前線 BP2500 以上全體 BP-2000！');
                    cb();
                };
                const doRetire = (cb) => retireOppFront(engine, '宿儺 [登場時]', 3500, cb);

                if (picks === 3) {
                    doDiscard(() => doDebuff(() => doRetire(done)));
                    return;
                }
                const opts = [
                    { key: 'draw', label: '我抽 1、對手棄 1', color: '#4f9678', fn: doDiscard },
                    { key: 'debuff', label: '對手前線 BP2500+ 全體 -2000', color: '#8d7cc4', fn: doDebuff },
                    { key: 'retire', label: '退場對手前線 BP3500 以下 1 張', color: '#c1596f', fn: doRetire }
                ];
                let remaining = picks;
                const used = new Set();
                const askNext = () => {
                    if (remaining <= 0) { done(); return; }
                    engine.promptModal({
                        title: `宿儺 [登場時]（指 ${fingers} 張，可再選 ${remaining} 項）`,
                        desc: '請選擇要發動的效果：',
                        cards: [cardEl],
                        customButtons: opts.filter(o => !used.has(o.key)).map(o => ({
                            label: o.label, color: o.color,
                            onClick: () => { used.add(o.key); remaining--; o.fn(askNext); }
                        }))
                    });
                };
                askNext();
            }
        },
        'UAPR/JJK-3-015': {
            requireRaided: true,
            onPlay: (e, c, d) => window.UACardScripts['EX04BT/JJK-3-015'].onPlay(e, c, d)
        },

        // 宿儺 (NC 4費 BP 3500)：我方回合 BP+500；攻擊時依指數量降對手 BP-1000
        'UA02NC/JJK-2-007': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 500 : 0,
            onAttack(engine, cardEl, done) {
                const maxTargets = 1 + countOutsideName(engine, '宿儺の指');
                const opp = engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 1500);
                if (!opp.length) { done(); return; }
                engine.promptModal({
                    title: `宿儺 [アタック時]（最多 ${maxTargets} 張 BP-1000）`,
                    desc: `選擇最多 ${maxTargets} 張對手 BP1500 以上角色 BP-1000：`,
                    cards: opp, selectCount: Math.min(maxTargets, opp.length), upTo: true,
                    onConfirm: (sel) => { sel.forEach(t => engine.addSlotBp(t.parentElement, -1000)); done(); }
                });
            }
        },

        // 伏魔御廚子 (4費 Field)：橫置給〈宿儺〉依指數量 2+ 傷害(2)、3+ 狙擊、4+ 衝擊(+1)
        'UA02BT/JJK-1-061': {
            canActivateMain: (engine, cardEl) => !cardEl.classList.contains('rest') && engine.hasCharacterOnMyField('宿儺'),
            onActivateMain(engine, cardEl, slot, done) {
                const sukunas = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => engine.getCardDef(c)?.name?.includes('宿儺'));
                const fingers = countOutsideName(engine, '宿儺の指');
                engine.promptModal({
                    title: `伏魔御廚子 [起動メイン]（指 ${fingers} 張）`,
                    desc: '選擇 1 張〈宿儺〉賦予領域效果：',
                    cards: sukunas, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            cardEl.classList.add('rest');
                            const trt = engine.getRuntime(sel[0]);
                            if (fingers >= 2) trt.tempKeywords.DAMAGE = Math.max(trt.tempKeywords.DAMAGE || 0, 2);
                            if (fingers >= 3) trt.tempKeywords.SNIPE = 1;
                            if (fingers >= 4) trt.tempKeywords.IMPACT_PLUS = (trt.tempKeywords.IMPACT_PLUS || 0) + 1;
                            showSysMsg(`伏魔御廚子發動（指 ${fingers} 張）！`);
                        }
                        done();
                    }
                });
            }
        },

        // 七海 建人 (4費 BP 4000)：牌庫 15 以下衝擊(1)；登場可移除場外 7 張抽 3
        'UA02BT/JJK-1-053': {
            getContinuousImpact: () => myDeckCount() <= 15 ? 1 : 0,
            onPlay(engine, cardEl, done) {
                const out = Array.from(document.querySelectorAll('#my-outside-area .card'));
                if (out.length < 7) { done(); return; }
                engine.promptModal({
                    title: '七海 建人 [登場時]',
                    desc: '是否將場外 7 張卡片移至移除區並抽取 3 張牌？',
                    cards: [cardEl],
                    customButtons: [
                        {
                            label: '移除場外 7 張並抽 3 張', color: '#4f9678',
                            onClick: () => {
                                const rem = document.getElementById('my-remove-area');
                                out.slice(0, 7).forEach(c => engine.moveCardToZone(c, rem));
                                engine.drawCards(3);
                                done();
                            }
                        },
                        { label: '不發動', color: '#7f8c8d', onClick: () => done() }
                    ]
                });
            }
        },
        'UAPR/JJK-1-053': {
            getContinuousImpact: () => window.UACardScripts['UA02BT/JJK-1-053'].getContinuousImpact(),
            onPlay: (e, c, d) => window.UACardScripts['UA02BT/JJK-1-053'].onPlay(e, c, d)
        },

        // 七海 建人 (4費 Raid)：牌庫 15 以下 BP+1000、衝擊(1)、傷害(2)
        'UA02BT/JJK-1-054': {
            requireRaided: true,
            getContinuousBpBonus: () => myDeckCount() <= 15 ? 1000 : 0,
            getContinuousImpact: () => myDeckCount() <= 15 ? 1 : 0,
            onAttack(engine, cardEl, done) {
                if (myDeckCount() <= 15) engine.getRuntime(cardEl).tempKeywords.DAMAGE = Math.max(engine.getRuntime(cardEl).tempKeywords.DAMAGE || 0, 2);
                done();
            }
        },

        // 七海 建人 (EX 4費 Raid)：攻擊時堆 1 張，牌庫 15 以下抽 1 且對手前線 BP1500+ 全體 -1000
        'EX04BT/JJK-3-019': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                engine.millDeckCards(1);
                if (myDeckCount() <= 15) {
                    engine.drawCards(1);
                    document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                        const top = engine.getTopCardInSlot(slot);
                        if (top && engine.getEffectiveCardBp(top) >= 1500) engine.addSlotBp(slot, -1000);
                    });
                    showSysMsg('七海 建人 [アタック時]：牌庫 15 張以下，抽 1 張並降對手前線 BP-1000！');
                }
                done();
            }
        },

        // 藍事件：逕庭拳
        'UA02BT/JJK-1-062': {
            onEventPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 5000);
                if (!opp.length) { showSysMsg('對手前線無 BP5000 以下角色。'); done(); return; }
                const retire = engine.hasCharacterOnMyField('虎杖 悠仁');
                engine.promptModal({
                    title: `逕庭拳（${retire ? '退場' : '彈回手牌'}）`,
                    desc: `選擇 1 張對手前線 BP5000 以下角色${retire ? '退場' : '退回手牌'}：`,
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) retire ? engine.requestRetireOpponentCard(sel[0]) : engine.requestBounceOpponentCard(sel[0]);
                        done();
                    }
                });
            }
        },
        'UA02ST/JJK-1-062': { onEventPlay: (e, c, d) => window.UACardScripts['UA02BT/JJK-1-062'].onEventPlay(e, c, d) },

        // 藍事件：誇れ オマエは強い (8費)：前線有宿儺減 2 費，退場原BP4000以上並抽2
        'EX04BT/JJK-3-024': {
            getEnergyDiscount: (engine) => engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name?.includes('宿儺')) ? 2 : 0,
            onEventPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => (engine.getCardDef(c)?.bp || 0) >= 4000);
                const finish = () => { engine.drawCards(2); done(); };
                if (!opp.length) { finish(); return; }
                engine.promptModal({
                    title: '誇れ オマエは強い', desc: '選擇 1 張原 BP 4000 以上的對手前線角色退場，並抽 2 張：',
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => { if (sel.length) engine.requestRetireOpponentCard(sel[0]); finish(); }
                });
            }
        },

        // ==================== 黃色：五條悟／伏黒式神／釘崎 ====================

        'UA02BT/JJK-1-009': {
            getEnergyDiscount: (engine) => hasOppColor(engine, ['BLUE', 'PURPLE']) ? 1 : 0
        },
        'UAPR/JJK-1-009': {
            getEnergyDiscount: (e) => window.UACardScripts['UA02BT/JJK-1-009'].getEnergyDiscount(e)
        },

        // 五条 悟 (6費 BP 5000)：登場抽 1，本回合下次非〈五条 悟〉卡片 AP-1
        'UA02BT/JJK-1-012': {
            onPlay(engine, cardEl, done) {
                engine.drawCards(1);
                engine.pendingApDiscounts.push({
                    amount: 1, desc: '五条 悟 (非五條卡 AP-1)',
                    matchFn: (d) => !(d?.name || '').includes('五条 悟')
                });
                showSysMsg('五条 悟 [登場時]：抽 1 張，本回合下次使用非〈五条 悟〉卡片 AP-1！');
                done();
            }
        },

        // パンダ (4費 Raid)：常駐 BP+1000
        'UA02BT/JJK-1-017': {
            requireRaided: true,
            getContinuousBpBonus: () => 1000
        },

        // 五条 悟 (EX 5費)：同線有夏油傑 或 場上/場外有天內理子，前線我方回合 BP+1000＆衝擊(1)
        'EX04BT/JJK-3-006': {
            getContinuousBpBonus(engine, cardEl) {
                if (!engine.isMyTurn || !cardEl.closest('#my-front-line')) return 0;
                const cond = engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name?.includes('夏油 傑')) ||
                    engine.hasCharacterOnMyField('天内 理子') || countOutsideName(engine, '天内 理子') > 0;
                return cond ? 1000 : 0;
            },
            getContinuousImpact(engine, cardEl) {
                return this.getContinuousBpBonus(engine, cardEl) > 0 ? 1 : 0;
            }
        },

        // 伏黒 恵 (EX 4費)：登場依場上［特徴：式神］＋〈嵌合暗翳庭〉合計張數×1000退場
        'EX04BT/JJK-3-007': {
            onPlay(engine, cardEl, done) {
                const cnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').filter(c => {
                    const d = engine.getCardDef(c);
                    return d && ((d.traits && d.traits.includes('式神')) || (d.name && d.name.includes('嵌合暗翳庭')));
                }).length;
                retireOppFront(engine, `伏黒 恵（式神/領域 ${cnt} 張）`, cnt * 1000, done);
            }
        },

        // 黃事件：虚式「茈」
        'UA02BT/JJK-1-029': {
            onEventPlay: (engine, cardEl, done) => retireOppFront(engine, '虚式「茈」', 99999, done, true)
        },

        // 黃事件：芻霊呪法「共鳴り」
        'UA02BT/JJK-1-032': {
            onEventPlay(engine, cardEl, done) {
                if (engine.hasCharacterOnMyField('釘崎 野薔薇')) engine.activateMyApCards(1);
                showSysMsg('芻霊呪法「共鳴り」：請將我方前線 1 張活動角色與對手前線 1 張角色轉為休息。');
                done();
            }
        },

        // ==================== 紫色：真人／東堂／メカ丸／伏黒甚爾 ====================

        'UA02BT/JJK-1-089': {
            getEnergyDiscount: (engine) => hasOppColor(engine, ['YELLOW', 'BLUE']) ? 1 : 0
        },

        // 伏黒 甚爾 (EX 8費)：雙方生命合計 4 以下減 2 費；我方回合 BP+1000；登場得衝擊(1)＆狙擊
        'EX04BT/JJK-3-026': {
            getEnergyDiscount() {
                const totalLife = document.querySelectorAll('#my-life-area .card').length + document.querySelectorAll('#opp-life-area .card').length;
                return totalLife <= 4 ? 2 : 0;
            },
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0,
            onPlay(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1);
                rt.tempKeywords.SNIPE = 1;
                showSysMsg('伏黒 甚爾 [登場時]：本回合獲得 [インパクト(1)] 與 [狙い撃ち]！');
                done();
            }
        },

        // 究極 メカ丸 絶対形態 (EX 6費 Raid)：京都校5+或三輪霞得衝擊(1)；登場二選一
        'EX04BT/JJK-3-027': {
            requireRaided: true,
            getContinuousImpact(engine, cardEl) {
                const kyoto = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('京都校')).length;
                return (kyoto >= 5 || engine.hasCharacterOnMyField('三輪 霞')) ? 1 : 0;
            },
            onPlay: (engine, cardEl, done) => retireOppFront(engine, '究極 メカ丸 絶対形態 [登場時]', 3500, done)
        },

        // 真人 (EX 5費 Raid)：登場可退場 2 張不同名其他角色，抽 2 並降對手前線 BP-4000
        'EX04BT/JJK-3-035': {
            requireRaided: true,
            onPlay(engine, cardEl, done) {
                const others = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => !engine.getCardDef(c)?.name?.includes('真人'));
                if (others.length < 2) { done(); return; }
                engine.promptModal({
                    title: '真人 [登場時]', desc: '是否退場 2 張不同名的非〈真人〉角色，抽 2 張並降對手前線 BP-4000？',
                    cards: others, selectCount: 2, upTo: true,
                    onConfirm: (sel) => {
                        if (sel.length < 2) { done(); return; }
                        sel.forEach(c => engine.retireCardFromSlot(c.parentElement));
                        engine.drawCards(2);
                        const opp = engine.getSlotTopCards('#opp-front-line .slot');
                        if (!opp.length) { done(); return; }
                        engine.promptModal({
                            title: '選擇降 BP-4000 目標', desc: '選擇對手前線最多 1 張：', cards: opp, selectCount: 1, upTo: true,
                            onConfirm: (t) => { if (t.length) engine.addSlotBp(t[0].parentElement, -4000); done(); }
                        });
                    }
                });
            }
        },

        // 紫事件：大祓砲
        'EX04BT/JJK-3-036': {
            onEventPlay: (engine, cardEl, done) =>
                retireOppFront(engine, '大祓砲', (engine.hasCharacterOnMyField('究極 メカ丸') || engine.hasCharacterOnMyField('与 幸吉')) ? 5000 : 3000, done)
        },

        // ==================== 紅色：渋谷事變 ====================

        // 紅 虎杖 悠仁 (EX 4費 Raid)：攻擊時有其他呪術師3+二選一（衝擊1 OR BP-2000轉活動）
        'EX04BT/JJK-3-043': {
            requireRaided: true,
            onAttack(engine, cardEl, done) {
                const rt = engine.getRuntime(cardEl);
                if (rt.usedOncePerTurn) { done(); return; }
                const sorc = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                    .filter(c => c !== cardEl && engine.getCardDef(c)?.traits?.includes('呪術師')).length;
                if (sorc < 3) { done(); return; }
                rt.usedOncePerTurn = true;
                engine.promptModal({
                    title: '虎杖 悠仁 [アタック時]：二選一', desc: '請選擇要發動的效果：', cards: [cardEl],
                    customButtons: [
                        { label: '獲得 [インパクト(1)]', color: '#c1596f', onClick: () => { rt.tempKeywords.IMPACT = Math.max(rt.tempKeywords.IMPACT || 0, 1); done(); } },
                        { label: '本回合 BP-2000 並轉為活動', color: '#4f9678', onClick: () => { engine.addSlotBp(cardEl.parentElement, -2000); cardEl.classList.remove('rest'); done(); } }
                    ]
                });
            }
        },

        // 紅 冥冥 (5費)：我方回合 BP+1000
        'EX04BT/JJK-3-057': {
            getContinuousBpBonus: (engine) => engine.isMyTurn ? 1000 : 0
        },

        // 紅事件：黒閃
        'EX04BT/JJK-3-069': {
            onEventPlay(engine, cardEl, done) {
                retireOppFront(engine, '黒閃', 5000, () => {
                    const opp4000 = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) >= 4000).length;
                    if (opp4000 >= 2) {
                        const mySorc = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                            .filter(c => engine.getCardDef(c)?.traits?.includes('呪術師') && engine.getEffectiveCardBp(c) >= 4000);
                        if (mySorc.length) {
                            engine.promptModal({
                                title: '黒閃：追加強化', desc: '選擇最多 1 張 BP4000 以上呪術師 BP+2000：', cards: mySorc, selectCount: 1, upTo: true,
                                onConfirm: (sel) => { if (sel.length) engine.addSlotBp(sel[0].parentElement, 2000); done(); }
                            });
                            return;
                        }
                    }
                    done();
                });
            }
        },

        // 紅事件：獄門疆
        'EX04BT/JJK-3-070': {
            onEventPlay(engine, cardEl, done) {
                const opp = engine.getSlotTopCards('#opp-front-line .slot').filter(c => engine.getEffectiveCardBp(c) <= 5000);
                if (!opp.length) { showSysMsg('對手前線無 BP5000 以下角色。'); done(); return; }
                engine.promptModal({
                    title: '獄門疆 (BP5000以下移除)', desc: '選擇 1 張對手前線 BP5000 以下角色移至移除區（若 BP 剛好 5000 再抽 1）：',
                    cards: opp, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                        if (sel.length) {
                            const is5000 = engine.getEffectiveCardBp(sel[0]) === 5000;
                            if (sel[0].parentElement?.id.startsWith('opp-') && conn && isConnected) {
                                conn.send({ type: 'ENGINE_EVENT', subType: 'FORCE_REMOVE_SLOT', slotId: sel[0].parentElement.id.replace('opp-', 'my-') });
                            }
                            if (is5000) engine.drawCards(1);
                        }
                        done();
                    }
                });
            }
        },

        // 紅事件：ミニメカ丸（移除區有五条悟減 3 費）
        'EX04BT/JJK-3-072': {
            getEnergyDiscount: (engine) =>
                Array.from(document.querySelectorAll('#my-remove-area .card'))
                    .some(c => engine.getCardDef(c)?.name?.includes('五条 悟')) ? 3 : 0
        }
    });
})();
