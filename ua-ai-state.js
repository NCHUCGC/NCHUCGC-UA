/**
 * NCHUCGC Union Arena 人機對戰 — 純資料狀態、規則與無頭效果結算層 (ua-ai-state.js)
 * 職責：
 * 1. 維護 AI 自身純資料盤面（不讀寫 DOM）與玩家盤面鏡像 (playerMirror)。
 * 2. 複用 uaEngine.parseCardEffectTextToAbilities / compileSequentialClauses 解析卡片效果。
 * 3. 無頭執行常見效果（抽牌、棄牌、堆墓、BP增減、退場、彈手、橫置、凍結、關鍵字、牌頂檢索、場外回收、回AP）。
 */
(function () {
    const FRONT_SLOTS = ['my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4'];
    const ENERGY_SLOTS = ['my-en-1', 'my-en-2', 'my-en-3', 'my-en-4'];
    const AP_SLOTS = ['my-ap-1', 'my-ap-2', 'my-ap-3'];

    function getCardDefById(cardId) {
        if (!cardId) return null;
        if (window.UAUtils) {
            return window.UAUtils.getCardById(cardId) || window.UAUtils.getBaseCardById(cardId);
        }
        if (window.cardCatalogById) return window.cardCatalogById.get(cardId) || null;
        return null;
    }

    function parseStaticKeywords(def) {
        const res = { impact: 0, damage: 1, snipe: false, step: false, doubleAttack: false, doubleBlock: false, impactNullify: false };
        if (!def) return res;
        if (window.uaEngine && typeof window.uaEngine.getInnateStaticKeywords === 'function') {
            const kw = window.uaEngine.getInnateStaticKeywords(def);
            res.impact = kw.impact || 0;
            res.damage = kw.damage > 1 ? kw.damage : 1;
            res.snipe = !!kw.snipe;
            res.step = !!kw.step;
            res.doubleAttack = !!kw.doubleAttack;
            res.doubleBlock = !!kw.doubleBlock;
            res.impactNullify = !!kw.impactNullify;
            return res;
        }
        const eff = def.effectText || '';
        if (eff.includes('[インパクト無効]')) res.impactNullify = true;
        const impM = eff.match(/\[インパクト[（(](\d+)[）)]\]/);
        if (impM && !eff.includes('与える')) res.impact = parseInt(impM[1], 10) || 1;
        const dmgM = eff.match(/\[ダメージ[（(](\d+)[）)]\]/);
        if (dmgM && !eff.includes('与える')) res.damage = parseInt(dmgM[1], 10) || 1;
        if (eff.includes('[2回アタック]')) res.doubleAttack = true;
        if (eff.includes('[2回ブロック]')) res.doubleBlock = true;
        return res;
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    class UAAIState {
        constructor(deckIds, apIds) {
            this.initialDeckIds = shuffle(deckIds);
            this.initialApIds = [...apIds];

            this.isFirstPlayer = null;
            this.turnNumber = 1;
            this.hasTakenFirstTurn = false;
            this.phase = '等待中';

            this.deck = [];
            this.hand = [];
            this.life = [];
            this.outside = [];
            this.remove = [];
            this.publicArea = [];
            this.lookArea = [];
            this.front = { 'my-fl-1': [], 'my-fl-2': [], 'my-fl-3': [], 'my-fl-4': [] };
            this.energy = { 'my-en-1': [], 'my-en-2': [], 'my-en-3': [], 'my-en-4': [] };
            this.ap = [];
            this.bpMods = { 'my-fl-1': 0, 'my-fl-2': 0, 'my-fl-3': 0, 'my-fl-4': 0 };

            this.playerMirror = {
                deckCount: 50,
                handCount: 0,
                lifeCount: 0,
                front: { 'my-fl-1': null, 'my-fl-2': null, 'my-fl-3': null, 'my-fl-4': null },
                energyCount: 0
            };
            this.playerCardDefByNetId = new Map();

            this.initCards();
        }

        initCards() {
            this.deck = this.initialDeckIds.map((cardId, i) => ({
                networkId: `p_card_${i}`,
                cardId,
                def: getCardDefById(cardId),
                isRest: false,
                isFlipped: true,
                isRaided: false,
                frozenNextTurn: false,
                usedOncePerTurn: false,
                attackCountThisTurn: 0,
                blockCountThisTurn: 0,
                tempKeywords: {},
                tempEnergyBoost: []
            }));
            this.ap = this.initialApIds.map((cardId, i) => ({
                networkId: `p_ap_${i}`,
                cardId,
                slotId: AP_SLOTS[i],
                unlocked: false,
                isRest: false
            }));

            for (let i = 0; i < 7 && this.deck.length > 0; i++) {
                const c = this.deck.pop();
                c.isFlipped = true;
                this.hand.push(c);
            }
        }

        performMulligan() {
            while (this.hand.length > 0) {
                const c = this.hand.pop();
                c.isFlipped = true;
                this.deck.push(c);
            }
            this.deck = shuffle(this.deck);
            for (let i = 0; i < 7 && this.deck.length > 0; i++) {
                const c = this.deck.pop();
                c.isFlipped = true;
                this.hand.push(c);
            }
        }

        setupLifeArea() {
            for (let i = 0; i < 7 && this.deck.length > 0; i++) {
                const c = this.deck.pop();
                c.isFlipped = true;
                this.life.push(c);
            }
        }

        registerPlayerDeck(deckIds) {
            this.playerCardDefByNetId.clear();
            (deckIds || []).forEach((cid, i) => {
                const id = typeof cid === 'string' ? cid : cid?.id;
                this.playerCardDefByNetId.set(`p_card_${i}`, getCardDefById(id));
            });
        }

        updatePlayerMirror(syncData) {
            if (!syncData || !Array.isArray(syncData.state)) return;
            const frontSlots = { 'my-fl-1': [], 'my-fl-2': [], 'my-fl-3': [], 'my-fl-4': [] };
            let deckCount = 0, handCount = 0, lifeCount = 0, energyCount = 0;

            syncData.state.forEach(item => {
                if (item.parent === 'my-deck-area') deckCount++;
                else if (item.parent === 'my-hand-area') handCount++;
                else if (item.parent === 'my-life-area') lifeCount++;
                else if (ENERGY_SLOTS.includes(item.parent)) energyCount++;
                else if (frontSlots[item.parent]) frontSlots[item.parent].push(item);
            });

            const bpStates = syncData.bpStates || {};
            const frontMirror = {};
            FRONT_SLOTS.forEach(slotId => {
                const arr = frontSlots[slotId];
                if (!arr || arr.length === 0) { frontMirror[slotId] = null; return; }
                arr.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                const top = arr[arr.length - 1];
                const def = this.playerCardDefByNetId.get(top.id) || null;
                const mod = parseInt(bpStates[slotId], 10) || 0;
                frontMirror[slotId] = {
                    slotId,
                    networkId: top.id,
                    def,
                    bpMod: mod,
                    isRest: !!top.isRest,
                    effectiveBp: Math.max(0, (def?.bp || 0) + mod)
                };
            });

            this.playerMirror = { deckCount, handCount, lifeCount, front: frontMirror, energyCount };
        }

        // ==================== 查詢與規則驗證 ====================
        getSlotArray(slotId) {
            if (this.front[slotId]) return this.front[slotId];
            if (this.energy[slotId]) return this.energy[slotId];
            return null;
        }

        getSlotTop(slotId) {
            const arr = this.getSlotArray(slotId);
            return arr && arr.length > 0 ? arr[arr.length - 1] : null;
        }

        getEffectiveBp(slotId) {
            const top = this.getSlotTop(slotId);
            if (!top || !top.def || !top.def.bp) return 0;
            return Math.max(0, top.def.bp + (this.bpMods[slotId] || 0));
        }

        getCardKeywords(card) {
            const base = parseStaticKeywords(card?.def);
            const tk = card?.tempKeywords || {};
            return {
                impact: Math.max(base.impact, tk.IMPACT || 0) + (tk.IMPACT_PLUS || 0),
                damage: Math.max(base.damage, tk.DAMAGE || 1) + (tk.DAMAGE_PLUS || 0),
                snipe: base.snipe || !!tk.SNIPE,
                step: base.step || !!tk.STEP,
                doubleAttack: base.doubleAttack || !!tk.DOUBLE_ATTACK,
                doubleBlock: base.doubleBlock || !!tk.DOUBLE_BLOCK,
                impactNullify: base.impactNullify,
                unblockableMaxBp: tk.UNBLOCKABLE_MAX_BP || 0
            };
        }

        hasCharacterOnMyField(name) {
            if (!name) return false;
            const clean = name.replace(/\s+/g, '');
            return [...FRONT_SLOTS, ...ENERGY_SLOTS].some(sid => {
                const top = this.getSlotTop(sid);
                return top && top.def && (top.def.name || '').replace(/\s+/g, '').includes(clean);
            });
        }

        hasTraitOnMyField(trait) {
            if (!trait) return false;
            return [...FRONT_SLOTS, ...ENERGY_SLOTS].some(sid => {
                const top = this.getSlotTop(sid);
                return top && top.def && Array.isArray(top.def.traits) && top.def.traits.some(t => t.includes(trait));
            });
        }

        calculateEnergy() {
            const totals = { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0, PURPLE: 0, ALL: 0 };
            ENERGY_SLOTS.forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (!top || !top.def) return;
                const col = (top.def.generatedEnergy?.color && top.def.generatedEnergy.color !== 'NONE')
                    ? top.def.generatedEnergy.color
                    : (top.def.color || 'NONE');
                let cnt = Math.max(0, top.def.generatedEnergy?.count ?? 1);
                (top.tempEnergyBoost || []).forEach(b => { cnt += b.count || 0; });
                if (totals[col] !== undefined) totals[col] += cnt;
                totals.ALL += cnt;
            });
            return totals;
        }

        getAvailableAp() {
            return this.ap.filter(a => a.unlocked && !a.isRest).length;
        }

        payAp(amount) {
            const avail = this.ap.filter(a => a.unlocked && !a.isRest);
            if (avail.length < amount) return false;
            for (let i = 0; i < amount; i++) avail[i].isRest = true;
            return true;
        }

        activateAp(count) {
            const rested = this.ap.filter(a => a.unlocked && a.isRest);
            let done = 0;
            for (let i = 0; i < Math.min(count, rested.length); i++) {
                rested[i].isRest = false;
                done++;
            }
            return done;
        }

        getMaxApForTurn() {
            if (this.isFirstPlayer) {
                if (this.turnNumber === 1) return 1;
                if (this.turnNumber === 2) return 2;
                return 3;
            }
            return this.turnNumber <= 2 ? 2 : 3;
        }

        canRaidOntoSlot(raidDef, slotId) {
            const raidCond = raidDef?.compiledRules?.raidCondition;
            if (!raidCond) return false;
            const arr = this.getSlotArray(slotId);
            if (!arr || arr.length === 0) return false;
            const baseCard = arr[arr.length - 1];
            if (!baseCard.def || baseCard.def.type !== 'CHARACTER') return false;
            if (baseCard.isRaided && arr.length > 1) return false;

            if (raidCond.type === 'NAME') {
                const baseName = (baseCard.def.name || '').replace(/\s+/g, '');
                const target = (raidCond.target || '').replace(/\s+/g, '');
                return baseName === target || (baseCard.def.name || '').includes(raidCond.target);
            }
            if (raidCond.type === 'TRAIT') {
                return Array.isArray(baseCard.def.traits) && baseCard.def.traits.includes(raidCond.target);
            }
            return false;
        }

        parseAbilities(def) {
            if (!def || !def.effectText || def.effectText === '-') return [];
            if (window.uaEngine && typeof window.uaEngine.parseCardEffectTextToAbilities === 'function') {
                return window.uaEngine.parseCardEffectTextToAbilities(def.effectText);
            }
            return [];
        }

        compileActions(rawText) {
            if (!rawText || rawText === '-') return [];
            if (window.uaEngine && typeof window.uaEngine.compileSequentialClauses === 'function') {
                return window.uaEngine.compileSequentialClauses(rawText);
            }
            return [];
        }

        // ==================== 合法行動列舉 ====================
        getLegalMoves() {
            const emptyFront = FRONT_SLOTS.filter(s => this.front[s].length === 0);
            if (emptyFront.length === 0) return [];
            const moves = [];
            ENERGY_SLOTS.forEach(fromSlot => {
                const top = this.getSlotTop(fromSlot);
                if (top && top.def && top.def.type === 'CHARACTER') {
                    moves.push({ fromSlot, toSlot: emptyFront[0], card: top });
                }
            });
            return moves;
        }

        getLegalPlays() {
            const availAp = this.getAvailableAp();
            const en = this.calculateEnergy();
            const emptyFront = FRONT_SLOTS.filter(s => this.front[s].length === 0);
            const emptyEnergy = ENERGY_SLOTS.filter(s => this.energy[s].length === 0);
            const actions = [];

            // 1. 場上 [起動メイン] 能力
            [...FRONT_SLOTS, ...ENERGY_SLOTS].forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (!top || !top.def) return;
                const isFront = FRONT_SLOTS.includes(slotId);
                const isEnergy = ENERGY_SLOTS.includes(slotId);
                const abilities = this.parseAbilities(top.def).filter(ab => {
                    if (!ab.timings.includes('ACTIVATE_MAIN')) return false;
                    if (ab.requireRaided && !top.isRaided) return false;
                    if (ab.requireFrontLine && !isFront) return false;
                    if (ab.requireEnergyLine && !isEnergy) return false;
                    if (ab.oncePerTurn && top.usedOncePerTurn) return false;
                    return true;
                });
                abilities.forEach(ab => {
                    if (ab.costs.some(c => c.type === 'REST_SELF') && top.isRest) return;
                    const apNeed = ab.costs.reduce((s, c) => s + (c.type === 'PAY_AP' ? c.amount : 0), 0);
                    if (apNeed > availAp) return;
                    const discNeed = ab.costs.reduce((s, c) => s + (c.type === 'DISCARD_HAND' ? c.amount : 0), 0);
                    if (discNeed > this.hand.length) return;
                    if (ab.costs.some(c => c.type === 'RETIRE_SELF')) return;
                    const compiled = this.compileActions(ab.rawText);
                    if (compiled.length > 0 && !compiled.every(a => a.type === 'INTERACTIVE_FALLBACK')) {
                        actions.push({ type: 'ACTIVATE_MAIN', slotId, card: top, ability: ab, compiledActions: compiled, apCost: apNeed });
                    }
                });
            });

            if (availAp <= 0) return actions;

            // 2. 手牌出牌（角色、場域、突襲、事件）
            this.hand.forEach((card, handIndex) => {
                const d = card.def;
                if (!d) return;
                const apCost = d.apCost !== undefined ? d.apCost : 1;
                if (apCost > availAp) return;

                const reqCol = d.requiredEnergy?.color || 'NONE';
                const reqCnt = d.requiredEnergy?.count || 0;
                if (reqCnt > 0 && reqCol !== 'NONE' && (en[reqCol] || 0) < reqCnt) return;

                if (d.type === 'EVENT') {
                    const compiled = this.compileActions(d.effectText);
                    if (compiled.some(a => a.type !== 'INTERACTIVE_FALLBACK')) {
                        actions.push({ type: 'EVENT', handIndex, card, apCost, compiledActions: compiled });
                    }
                    return;
                }

                if (d.type === 'CHARACTER' && d.compiledRules?.raidCondition) {
                    [...FRONT_SLOTS, ...ENERGY_SLOTS].forEach(slotId => {
                        if (this.canRaidOntoSlot(d, slotId)) {
                            const isEnergy = ENERGY_SLOTS.includes(slotId);
                            actions.push({
                                type: 'RAID',
                                handIndex,
                                card,
                                apCost,
                                targetSlot: slotId,
                                moveToFront: isEnergy && emptyFront.length > 0,
                                destFrontSlot: isEnergy && emptyFront.length > 0 ? emptyFront[0] : slotId
                            });
                        }
                    });
                }

                if (d.type === 'CHARACTER' || d.type === 'FIELD') {
                    if (emptyEnergy.length > 0) {
                        actions.push({ type: 'NORMAL', handIndex, card, apCost, targetSlot: emptyEnergy[0], line: 'ENERGY' });
                    }
                    if (d.type === 'CHARACTER' && emptyFront.length > 0) {
                        actions.push({ type: 'NORMAL', handIndex, card, apCost, targetSlot: emptyFront[0], line: 'FRONT' });
                    }
                }
            });

            return actions;
        }

        getLegalAttackers() {
            const list = [];
            FRONT_SLOTS.forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (!top || top.isRest || !top.def || top.def.type !== 'CHARACTER') return;
                const kw = this.getCardKeywords(top);
                list.push({
                    slotId,
                    card: top,
                    effectiveBp: this.getEffectiveBp(slotId),
                    impact: kw.impact,
                    damage: kw.damage,
                    doubleAttack: kw.doubleAttack,
                    unblockableMaxBp: kw.unblockableMaxBp
                });
            });
            return list;
        }

        getLegalBlockers(unblockableMaxBp = 0) {
            const list = [];
            FRONT_SLOTS.forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (!top || top.isRest || !top.def || top.def.type !== 'CHARACTER') return;
                const bp = this.getEffectiveBp(slotId);
                if (unblockableMaxBp && bp <= unblockableMaxBp) return;
                const kw = this.getCardKeywords(top);
                list.push({
                    slotId,
                    card: top,
                    effectiveBp: bp,
                    doubleBlock: kw.doubleBlock,
                    impactNullify: kw.impactNullify
                });
            });
            return list;
        }

        // ==================== 無頭效果結算器 ====================
        matchesFilters(def, act) {
            if (!def) return false;
            if (act.filterNames && act.filterNames.length > 0) {
                const cname = (def.name || '').replace(/\s+/g, '');
                if (!act.filterNames.some(n => cname.includes(n.replace(/\s+/g, '')))) return false;
            }
            if (act.filterTraits && act.filterTraits.length > 0) {
                const traits = Array.isArray(def.traits) ? def.traits : [];
                if (!act.filterTraits.some(t => traits.some(ct => ct.includes(t)))) return false;
            }
            if (act.filterColor && def.color && def.color !== 'NONE' && def.color !== act.filterColor) return false;
            return true;
        }

        resolveCardEffects(sourceCard, sourceSlotId, timing, brain, difficulty = 'normal', precompiledActions = null) {
            const outgoingEvents = [];
            const logs = [];
            if (!sourceCard || !sourceCard.def) return { outgoingEvents, logs };

            const actionLists = [];
            if (precompiledActions) {
                actionLists.push(precompiledActions);
            } else {
                const isFront = FRONT_SLOTS.includes(sourceSlotId);
                const isEnergy = ENERGY_SLOTS.includes(sourceSlotId);
                const matched = this.parseAbilities(sourceCard.def).filter(ab => {
                    if (!ab.timings.includes(timing)) return false;
                    if (ab.requireRaided && !sourceCard.isRaided) return false;
                    if (ab.requireFrontLine && !isFront) return false;
                    if (ab.requireEnergyLine && !isEnergy) return false;
                    if (ab.duringOppTurnOnly) return false;
                    return true;
                });
                matched.forEach(ab => {
                    const acts = this.compileActions(ab.rawText);
                    if (acts.length > 0) actionLists.push(acts);
                });
            }

            actionLists.forEach(actions => {
                this.executeActionList(sourceCard, sourceSlotId, actions, { selectedTargets: [], addedFromLook: false }, brain, difficulty, outgoingEvents, logs);
            });

            return { outgoingEvents, logs };
        }

        executeActionList(sourceCard, sourceSlotId, actions, ctx, brain, difficulty, outgoingEvents, logs) {
            for (const act of actions) {
                if (act.conditions && act.conditions.length > 0) {
                    const ok = act.conditions.every(cond => {
                        if (cond.type === 'SELF_IS_ACTIVE') return !sourceCard.isRest;
                        if (cond.type === 'HAS_CHAR_ON_FIELD') return this.hasCharacterOnMyField(cond.name);
                        if (cond.type === 'HAS_TRAIT_ON_FIELD') return this.hasTraitOnMyField(cond.trait);
                        if (cond.type === 'IF_ADDED_TO_HAND') return !!ctx.addedFromLook;
                        return true;
                    });
                    if (!ok) continue;
                }

                switch (act.type) {
                    case 'OPTIONAL_COST_BRANCH': {
                        const cost = act.cost;
                        if (!cost || !act.thenActions || act.thenActions.length === 0) break;
                        const val = brain ? brain.estimateActionsValue(this, act.thenActions) : 0;
                        if (val <= 500) break;

                        if (cost.type === 'DISCARD_HAND' && this.hand.length >= cost.count) {
                            const idxs = brain.decideDiscard(this, this.hand, cost.count, difficulty);
                            this.discardHandByIndices(idxs, 'OUTSIDE');
                            logs.push(`[電腦效果] 捨棄 ${cost.count} 張手牌發動【${sourceCard.def.name}】`);
                            this.executeActionList(sourceCard, sourceSlotId, act.thenActions, ctx, brain, difficulty, outgoingEvents, logs);
                        } else if (cost.type === 'PAY_AP' && this.getAvailableAp() >= cost.count) {
                            this.payAp(cost.count);
                            this.executeActionList(sourceCard, sourceSlotId, act.thenActions, ctx, brain, difficulty, outgoingEvents, logs);
                        } else if (cost.type === 'MILL_DECK' && this.deck.length >= cost.count) {
                            for (let i = 0; i < cost.count; i++) {
                                const m = this.deck.pop();
                                m.isFlipped = false;
                                this.outside.push(m);
                            }
                            this.executeActionList(sourceCard, sourceSlotId, act.thenActions, ctx, brain, difficulty, outgoingEvents, logs);
                        }
                        break;
                    }

                    case 'SELECT_TARGET': {
                        const count = act.count || 1;
                        if (act.owner === 'OPP') {
                            const cands = FRONT_SLOTS
                                .map(sid => this.playerMirror.front[sid])
                                .filter(p => {
                                    if (!p) return false;
                                    if (act.maxBp !== null && act.maxBp !== undefined && p.effectiveBp > act.maxBp) return false;
                                    if (act.minBp !== null && act.minBp !== undefined && p.effectiveBp < act.minBp) return false;
                                    if (act.requireState === 'ACTIVE' && p.isRest) return false;
                                    if (act.requireState === 'REST' && !p.isRest) return false;
                                    if (p.def && !this.matchesFilters(p.def, act)) return false;
                                    return true;
                                })
                                .sort((a, b) => b.effectiveBp - a.effectiveBp);
                            ctx.selectedTargets = cands.slice(0, count).map(p => ({ owner: 'OPP', slotId: p.slotId, mirror: p }));
                        } else {
                            const slots = act.zone === 'FRONT_LINE' ? FRONT_SLOTS : (act.zone === 'ENERGY_LINE' ? ENERGY_SLOTS : [...FRONT_SLOTS, ...ENERGY_SLOTS]);
                            const cands = slots
                                .map(sid => ({ slotId: sid, card: this.getSlotTop(sid), bp: this.getEffectiveBp(sid) }))
                                .filter(x => {
                                    if (!x.card || !x.card.def || x.card.def.type !== 'CHARACTER') return false;
                                    if (act.excludeSelf && x.card === sourceCard) return false;
                                    if (act.maxBp !== null && act.maxBp !== undefined && x.bp > act.maxBp) return false;
                                    if (act.minBp !== null && act.minBp !== undefined && x.bp < act.minBp) return false;
                                    if (act.requireState === 'ACTIVE' && x.card.isRest) return false;
                                    if (act.requireState === 'REST' && !x.card.isRest) return false;
                                    if (!this.matchesFilters(x.card.def, act)) return false;
                                    return true;
                                })
                                .sort((a, b) => b.bp - a.bp);
                            ctx.selectedTargets = cands.slice(0, count).map(x => ({ owner: 'MY', slotId: x.slotId, card: x.card }));
                        }
                        break;
                    }

                    case 'DRAW': {
                        let drew = 0;
                        for (let i = 0; i < (act.amount || 1) && this.deck.length > 0; i++) {
                            const c = this.deck.pop();
                            c.isFlipped = true;
                            this.hand.push(c);
                            drew++;
                        }
                        if (drew > 0) logs.push(`[電腦效果] 【${sourceCard.def.name}】抽了 ${drew} 張牌`);
                        break;
                    }

                    case 'MILL_DECK': {
                        let milled = 0;
                        for (let i = 0; i < (act.count || 1) && this.deck.length > 0; i++) {
                            const c = this.deck.pop();
                            c.isFlipped = false;
                            this.outside.push(c);
                            milled++;
                        }
                        if (milled > 0) logs.push(`[電腦效果] 【${sourceCard.def.name}】將牌頂 ${milled} 張送場外`);
                        break;
                    }

                    case 'DISCARD_HAND': {
                        const cnt = Math.min(act.count || 1, this.hand.length);
                        if (cnt > 0) {
                            const idxs = brain.decideDiscard(this, this.hand, cnt, difficulty);
                            this.discardHandByIndices(idxs, 'OUTSIDE');
                            logs.push(`[電腦效果] 【${sourceCard.def.name}】捨棄了 ${cnt} 張手牌`);
                        }
                        break;
                    }

                    case 'ACTIVATE_AP': {
                        const done = this.activateAp(act.count || 1);
                        if (done > 0) logs.push(`[電腦效果] 【${sourceCard.def.name}】將 ${done} 張 AP 轉為活動`);
                        break;
                    }

                    case 'MODIFY_BP': {
                        const amount = act.amount || 0;
                        if (act.target === 'ALL_MY_TRAIT') {
                            FRONT_SLOTS.forEach(sid => {
                                const top = this.getSlotTop(sid);
                                if (top && top.def && (!act.filterTrait || top.def.traits?.includes(act.filterTrait))) {
                                    this.bpMods[sid] = (this.bpMods[sid] || 0) + amount;
                                }
                            });
                            logs.push(`[電腦效果] 【${sourceCard.def.name}】全體 BP ${amount > 0 ? '+' : ''}${amount}`);
                        } else if (act.target === 'SELECTED') {
                            ctx.selectedTargets.forEach(t => {
                                if (t.owner === 'OPP') {
                                    const newMod = (t.mirror.bpMod || 0) + amount;
                                    t.mirror.bpMod = newMod;
                                    t.mirror.effectiveBp = Math.max(0, (t.mirror.def?.bp || 0) + newMod);
                                    outgoingEvents.push({ type: 'UPDATE_OPP_BP', slotId: t.slotId, bp: newMod });
                                    if (t.mirror.effectiveBp <= 0) {
                                        outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_RETIRE_SLOT', slotId: t.slotId });
                                        this.playerMirror.front[t.slotId] = null;
                                    }
                                    logs.push(`[電腦效果] 【${sourceCard.def.name}】調整我方前線 BP ${amount > 0 ? '+' : ''}${amount}`);
                                } else if (this.bpMods.hasOwnProperty(t.slotId)) {
                                    this.bpMods[t.slotId] = (this.bpMods[t.slotId] || 0) + amount;
                                    logs.push(`[電腦效果] 【${sourceCard.def.name}】強化自身側 BP ${amount > 0 ? '+' : ''}${amount}`);
                                }
                            });
                        } else if (sourceSlotId && this.bpMods.hasOwnProperty(sourceSlotId)) {
                            this.bpMods[sourceSlotId] = (this.bpMods[sourceSlotId] || 0) + amount;
                            logs.push(`[電腦效果] 【${sourceCard.def.name}】本回合 BP ${amount > 0 ? '+' : ''}${amount}`);
                        }
                        break;
                    }

                    case 'RETIRE_TARGET': {
                        ctx.selectedTargets.forEach(t => {
                            if (t.owner === 'OPP') {
                                outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_RETIRE_SLOT', slotId: t.slotId });
                                this.playerMirror.front[t.slotId] = null;
                                logs.push(`[電腦效果] 【${sourceCard.def.name}】使我方前線角色退場！`);
                            } else {
                                this.forceMoveSlotCard(t.slotId, 'OUTSIDE');
                            }
                        });
                        break;
                    }

                    case 'BOUNCE_TO_HAND': {
                        ctx.selectedTargets.forEach(t => {
                            if (t.owner === 'OPP') {
                                outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_BOUNCE_SLOT', slotId: t.slotId });
                                this.playerMirror.front[t.slotId] = null;
                                logs.push(`[電腦效果] 【${sourceCard.def.name}】將我方前線角色退回手牌！`);
                            } else {
                                this.forceMoveSlotCard(t.slotId, 'HAND');
                            }
                        });
                        break;
                    }

                    case 'SEND_TARGET_TO_BOTTOM': {
                        ctx.selectedTargets.forEach(t => {
                            if (t.owner === 'OPP') {
                                outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_BOTTOM_SLOT', slotId: t.slotId });
                                this.playerMirror.front[t.slotId] = null;
                                logs.push(`[電腦效果] 【${sourceCard.def.name}】將我方前線角色置於牌底！`);
                            }
                        });
                        break;
                    }

                    case 'SEND_TARGET_TO_REMOVE': {
                        ctx.selectedTargets.forEach(t => {
                            if (t.owner === 'OPP') {
                                outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_REMOVE_SLOT', slotId: t.slotId });
                                this.playerMirror.front[t.slotId] = null;
                                logs.push(`[電腦效果] 【${sourceCard.def.name}】將我方前線角色移至移除區！`);
                            }
                        });
                        break;
                    }

                    case 'SET_REST': {
                        const targets = act.target === 'SELECTED' ? ctx.selectedTargets : [{ owner: 'MY', slotId: sourceSlotId, card: sourceCard }];
                        targets.forEach(t => {
                            if (t.owner === 'OPP') {
                                outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_REST_SLOT', slotId: t.slotId });
                                if (this.playerMirror.front[t.slotId]) this.playerMirror.front[t.slotId].isRest = true;
                                logs.push(`[電腦效果] 【${sourceCard.def.name}】橫置了我方前線角色！`);
                            } else if (t.card) {
                                t.card.isRest = true;
                            }
                        });
                        break;
                    }

                    case 'SET_ACTIVE': {
                        const targets = act.target === 'SELECTED' ? ctx.selectedTargets : [{ owner: 'MY', slotId: sourceSlotId, card: sourceCard }];
                        targets.forEach(t => {
                            if (t.owner === 'MY' && t.card) t.card.isRest = false;
                        });
                        break;
                    }

                    case 'FREEZE_TARGET': {
                        ctx.selectedTargets.forEach(t => {
                            if (t.owner === 'OPP') {
                                outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_FREEZE_SLOT', slotId: t.slotId });
                                logs.push(`[電腦效果] 【${sourceCard.def.name}】凍結了我方前線角色！`);
                            } else if (t.card) {
                                t.card.frozenNextTurn = true;
                            }
                        });
                        break;
                    }

                    case 'GRANT_KEYWORD': {
                        const targets = (act.target === 'SELECTED' && ctx.selectedTargets.length > 0)
                            ? ctx.selectedTargets.filter(t => t.owner === 'MY').map(t => t.card)
                            : [sourceCard];
                        targets.forEach(c => {
                            if (!c) return;
                            c.tempKeywords[act.keyword] = (c.tempKeywords[act.keyword] || 0) + (act.value || 1);
                        });
                        break;
                    }

                    case 'GRANT_UNBLOCKABLE_BY_LOW_BP': {
                        const targets = (act.target === 'SELECTED' && ctx.selectedTargets.length > 0)
                            ? ctx.selectedTargets.filter(t => t.owner === 'MY').map(t => t.card)
                            : [sourceCard];
                        targets.forEach(c => { if (c) c.tempKeywords.UNBLOCKABLE_MAX_BP = act.maxBp || 0; });
                        break;
                    }

                    case 'LOOK_TOP_DECK': {
                        const lookCnt = Math.min(act.count || 1, this.deck.length);
                        if (lookCnt === 0) break;
                        const topCards = [];
                        for (let i = 0; i < lookCnt; i++) topCards.push(this.deck.pop());
                        const pickUpTo = act.pickUpTo ?? 1;
                        const matching = topCards.filter(c => this.matchesFilters(c.def, act));
                        matching.sort((a, b) => (b.def?.bp || 0) - (a.def?.bp || 0));
                        const picked = matching.slice(0, pickUpTo);
                        const rest = topCards.filter(c => !picked.includes(c));

                        picked.forEach(c => {
                            if (act.pickAction === 'OUTSIDE') { c.isFlipped = false; this.outside.push(c); }
                            else { c.isFlipped = true; this.hand.push(c); ctx.addedFromLook = true; }
                        });
                        rest.forEach(c => {
                            if (act.remainderTo === 'OUTSIDE') { c.isFlipped = false; this.outside.push(c); }
                            else if (act.remainderTo === 'REMOVE') { c.isFlipped = false; this.remove.push(c); }
                            else if (act.remainderTo === 'TOP') { c.isFlipped = true; this.deck.push(c); }
                            else { c.isFlipped = true; this.deck.unshift(c); }
                        });
                        if (picked.length > 0 && act.pickAction !== 'OUTSIDE') {
                            logs.push(`[電腦效果] 【${sourceCard.def.name}】檢索牌頂 ${lookCnt} 張並加入 ${picked.length} 張至手牌`);
                        }
                        break;
                    }

                    case 'RECOVER_FROM_OUTSIDE': {
                        const cands = this.outside
                            .filter(c => c.def && c.def.type === 'CHARACTER' && this.matchesFilters(c.def, act))
                            .sort((a, b) => (b.def?.bp || 0) - (a.def?.bp || 0));
                        const picked = cands.slice(0, act.count || 1);
                        picked.forEach(c => {
                            const idx = this.outside.indexOf(c);
                            if (idx !== -1) this.outside.splice(idx, 1);
                            c.isFlipped = true;
                            this.hand.push(c);
                        });
                        if (picked.length > 0) logs.push(`[電腦效果] 【${sourceCard.def.name}】從場外回收了 ${picked.length} 張角色`);
                        break;
                    }

                    default:
                        break;
                }
            }
        }

        // ==================== 原子狀態變更 ====================
        beginTurn() {
            [...FRONT_SLOTS, ...ENERGY_SLOTS].forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (top) {
                    if (top.frozenNextTurn) top.frozenNextTurn = false;
                    else top.isRest = false;
                    top.usedOncePerTurn = false;
                    top.attackCountThisTurn = 0;
                    top.blockCountThisTurn = 0;
                    top.tempKeywords = {};
                    top.tempEnergyBoost = [];
                }
                if (this.bpMods.hasOwnProperty(slotId)) this.bpMods[slotId] = 0;
            });

            const maxAp = this.getMaxApForTurn();
            this.ap.forEach((a, idx) => {
                a.unlocked = idx < maxAp;
                a.isRest = false;
            });

            if (!(this.isFirstPlayer && this.turnNumber === 1)) {
                if (this.deck.length === 0) return { deckOut: true };
                const drawn = this.deck.pop();
                drawn.isFlipped = true;
                this.hand.push(drawn);
            }
            return { deckOut: false };
        }

        applyMove(action) {
            if (!action) return;
            this.front[action.toSlot] = this.energy[action.fromSlot];
            this.energy[action.fromSlot] = [];
        }

        applyPlay(action, brain, difficulty) {
            if (!action) return null;

            if (action.type === 'ACTIVATE_MAIN') {
                const ab = action.ability;
                if (ab.oncePerTurn) action.card.usedOncePerTurn = true;
                ab.costs.forEach(c => {
                    if (c.type === 'REST_SELF') action.card.isRest = true;
                    if (c.type === 'PAY_AP') this.payAp(c.amount);
                    if (c.type === 'DISCARD_HAND') {
                        const idxs = brain.decideDiscard(this, this.hand, c.amount, difficulty);
                        this.discardHandByIndices(idxs, 'OUTSIDE');
                    }
                });
                const effRes = this.resolveCardEffects(action.card, action.slotId, 'ACTIVATE_MAIN', brain, difficulty, action.compiledActions);
                return { playedType: 'ACTIVATE_MAIN', card: action.card, ...effRes };
            }

            this.payAp(action.apCost);
            const [card] = this.hand.splice(action.handIndex, 1);
            card.isFlipped = false;

            if (action.type === 'EVENT') {
                card.isRest = false;
                this.outside.push(card);
                const effRes = this.resolveCardEffects(card, null, 'CONTINUOUS', brain, difficulty, action.compiledActions);
                return { playedType: 'EVENT', card, ...effRes };
            }

            if (action.type === 'RAID') {
                card.isRest = false;
                card.isRaided = true;
                const srcArr = this.getSlotArray(action.targetSlot);
                srcArr.forEach(c => { c.isRest = false; });
                srcArr.push(card);
                if (this.bpMods.hasOwnProperty(action.targetSlot)) this.bpMods[action.targetSlot] = 0;

                let finalSlot = action.targetSlot;
                if (action.moveToFront && action.destFrontSlot && action.destFrontSlot !== action.targetSlot) {
                    this.front[action.destFrontSlot] = srcArr;
                    this.energy[action.targetSlot] = [];
                    finalSlot = action.destFrontSlot;
                }
                const effRes = this.resolveCardEffects(card, finalSlot, 'ON_PLAY', brain, difficulty);
                return { playedType: 'RAID', card, finalSlot, ...effRes };
            }

            card.isRest = !(card.def?.compiledRules?.entersActive);
            card.isRaided = false;
            if (action.line === 'FRONT') this.front[action.targetSlot].push(card);
            else this.energy[action.targetSlot].push(card);
            const effRes = this.resolveCardEffects(card, action.targetSlot, 'ON_PLAY', brain, difficulty);
            return { playedType: 'NORMAL', card, finalSlot: action.targetSlot, ...effRes };
        }

        applyAttackDeclare(slotId, brain, difficulty) {
            const attacker = this.getSlotTop(slotId);
            if (!attacker) return null;
            attacker.isRest = true;
            attacker.attackCountThisTurn++;
            const preKw = this.getCardKeywords(attacker);
            if (preKw.doubleAttack && attacker.attackCountThisTurn === 1) {
                attacker.isRest = false;
            }
            const effRes = this.resolveCardEffects(attacker, slotId, 'ON_ATTACK', brain, difficulty);
            const finalKw = this.getCardKeywords(attacker);
            return {
                slotId,
                attacker,
                atkBp: this.getEffectiveBp(slotId),
                impact: finalKw.impact,
                damage: finalKw.damage,
                unblockableMaxBp: finalKw.unblockableMaxBp,
                ...effRes
            };
        }

        applyBlock(slotId) {
            const blocker = this.getSlotTop(slotId);
            if (!blocker) return null;
            blocker.isRest = true;
            blocker.blockCountThisTurn++;
            const kw = this.getCardKeywords(blocker);
            if (kw.doubleBlock && blocker.blockCountThisTurn === 1) {
                blocker.isRest = false;
            }
            return { slotId, blocker, blockerBp: this.getEffectiveBp(slotId) };
        }

        forceMoveSlotCard(slotId, dest, brain = null, difficulty = 'normal') {
            const arr = this.getSlotArray(slotId);
            if (!arr || arr.length === 0) return { outgoingEvents: [], logs: [] };
            const top = arr.pop();
            while (arr.length > 0) {
                const under = arr.pop();
                under.isFlipped = false;
                under.isRest = false;
                under.isRaided = false;
                this.outside.push(under);
            }
            if (this.bpMods.hasOwnProperty(slotId)) this.bpMods[slotId] = 0;
            top.isRest = false;
            const wasRaided = top.isRaided;
            top.isRaided = false;

            if (dest === 'HAND') { top.isFlipped = true; this.hand.push(top); }
            else if (dest === 'DECK_BOTTOM') { top.isFlipped = true; this.deck.unshift(top); }
            else if (dest === 'REMOVE') { top.isFlipped = false; this.remove.push(top); }
            else {
                top.isFlipped = false;
                this.outside.push(top);
                if (brain) {
                    top.isRaided = wasRaided;
                    const res = this.resolveCardEffects(top, slotId, 'ON_RETIRE', brain, difficulty);
                    top.isRaided = false;
                    return res;
                }
            }
            return { outgoingEvents: [], logs: [] };
        }

        discardHandByIndices(indices, dest = 'OUTSIDE') {
            [...indices].sort((a, b) => b - a).forEach(idx => {
                if (idx >= 0 && idx < this.hand.length) {
                    const [c] = this.hand.splice(idx, 1);
                    c.isFlipped = false;
                    if (dest === 'REMOVE') this.remove.push(c);
                    else this.outside.push(c);
                }
            });
        }

        finalizeEndTurnState() {
            [...FRONT_SLOTS, ...ENERGY_SLOTS].forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (top) {
                    if (top.frozenNextTurn) top.frozenNextTurn = false;
                    else top.isRest = false;
                    top.tempKeywords = {};
                    top.tempEnergyBoost = [];
                }
                if (this.bpMods.hasOwnProperty(slotId)) this.bpMods[slotId] = 0;
            });
            this.phase = '等待中';
        }

        exportKeywordBadgesMap() {
            const map = {};
            [...FRONT_SLOTS, ...ENERGY_SLOTS].forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (!top || top.isFlipped || !top.def || top.def.type !== 'CHARACTER') return;
                const kw = this.getCardKeywords(top);
                const badges = [];
                if (kw.impact > 0) badges.push({ text: `衝擊(${kw.impact})`, bg: '#c0392b' });
                if (kw.snipe) badges.push({ text: '狙擊', bg: '#8e44ad' });
                if (kw.doubleBlock) badges.push({ text: '2回阻擋', bg: '#2980b9' });
                if (kw.doubleAttack) badges.push({ text: '2回攻擊', bg: '#d35400' });
                if (kw.impactNullify) badges.push({ text: '衝擊無效', bg: '#2c3e50' });
                if (badges.length > 0) map[slotId] = badges;
            });
            return map;
        }

        exportSyncBoardPayload() {
            const state = [];
            const pushCard = (c, parent, x, y, zIndex, isFlipped, isRest, inLife) => {
                state.push({ id: c.networkId, parent, x, y, zIndex, isFlipped, isRest, inLife, isDragging: false, tilt: '0deg' });
            };

            this.deck.forEach((c, idx) => pushCard(c, 'my-deck-area', '0px', '0px', idx + 1, true, false, false));
            this.hand.forEach((c, idx) => pushCard(c, 'my-hand-area', '0px', '0px', idx + 1, true, false, false));
            this.lookArea.forEach((c, idx) => pushCard(c, 'my-look-area', '0px', '0px', idx + 1, true, false, false));
            this.outside.forEach((c, idx) => pushCard(c, 'my-outside-area', '0px', '0px', idx + 1, false, false, false));
            this.remove.forEach((c, idx) => pushCard(c, 'my-remove-area', '0px', '0px', idx + 1, false, false, false));
            this.publicArea.forEach((c, idx) => pushCard(c, 'my-public-area', '0px', '0px', idx + 1, false, false, false));

            this.life.forEach((c, idx) => {
                pushCard(
                    c, 'my-life-area',
                    'calc((var(--card-h) - var(--card-w)) / 2)',
                    `calc((var(--card-w) - var(--card-h)) / 2 + ${idx * 26}px)`,
                    idx + 1, c.isFlipped, false, true
                );
            });

            FRONT_SLOTS.forEach(slotId => {
                this.front[slotId].forEach((c, idx) => pushCard(c, slotId, `${idx * 4}px`, `${idx * 12}px`, idx + 1, c.isFlipped, c.isRest, false));
            });
            ENERGY_SLOTS.forEach(slotId => {
                this.energy[slotId].forEach((c, idx) => pushCard(c, slotId, `${idx * 4}px`, `${idx * 12}px`, idx + 1, c.isFlipped, c.isRest, false));
            });
            this.ap.forEach(a => pushCard(a, a.slotId, '0px', '0px', 1, !a.unlocked, a.isRest, false));

            const bpStates = {};
            FRONT_SLOTS.forEach(slotId => {
                if (this.bpMods[slotId] && this.bpMods[slotId] !== 0) bpStates[slotId] = this.bpMods[slotId];
            });

            return {
                type: 'SYNC_BOARD',
                state,
                phase: this.phase,
                markedSlots: [],
                bpStates,
                kwStates: this.exportKeywordBadgesMap()
            };
        }
    }

    window.UAAIState = UAAIState;
})();
