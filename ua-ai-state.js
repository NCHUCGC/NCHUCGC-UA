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
        const res = { impact: 0, damage: 1, snipe: false, step: false, doubleAttack: false, doubleBlock: false, impactNullify: false, unblockableMinBp: 0, unblockableMaxBp: 0 };
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
            res.unblockableMinBp = kw.unblockableMinBp || 0;
            res.unblockableMaxBp = kw.unblockableMaxBp || 0;
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

    function getUnbiasedRandomInt(max) {
        if (max <= 1) return 0;
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const array = new Uint32Array(1);
            const limit = Math.floor(0x100000000 / max) * max;
            let rand;
            do {
                crypto.getRandomValues(array);
                rand = array[0];
            } while (rand >= limit);
            return rand % max;
        }
        return Math.floor(Math.random() * max);
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = getUnbiasedRandomInt(i + 1);
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
            this.usedEventThisTurn = false;
            this.usedEventCountThisTurn = 0;

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
            this.bpMods = { 'my-fl-1': 0, 'my-fl-2': 0, 'my-fl-3': 0, 'my-fl-4': 0, 'my-en-1': 0, 'my-en-2': 0, 'my-en-3': 0, 'my-en-4': 0 };

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
                persistentBp: 0,
                persistentKeywords: {},
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
            const effBpStates = syncData.kwStates && syncData.kwStates.__effBp ? syncData.kwStates.__effBp : null;
            const frontMirror = {};
            FRONT_SLOTS.forEach(slotId => {
                const arr = frontSlots[slotId];
                if (!arr || arr.length === 0) { frontMirror[slotId] = null; return; }
                arr.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                const top = arr[arr.length - 1];
                const def = this.playerCardDefByNetId.get(top.id) || null;
                const mod = parseInt(bpStates[slotId], 10) || 0;
                const syncedEff = effBpStates && typeof effBpStates[slotId] === 'number' ? effBpStates[slotId] : null;
                frontMirror[slotId] = {
                    slotId,
                    networkId: top.id,
                    def,
                    bpMod: mod,
                    isRest: !!top.isRest,
                    effectiveBp: syncedEff !== null ? Math.max(0, syncedEff) : Math.max(0, (def?.bp || 0) + mod)
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

        getV3IR(def) {
            const cat = (typeof window !== 'undefined' && window.UA_V3_CATALOG) ? window.UA_V3_CATALOG : null;
            if (!cat || !def?.id) return null;
            const bid = String(def.id).replace(/([/_](p\d+|s|sp\d*)|★)+$/i, '');
            return cat[bid] || null;
        }

        matchesV3Filter(card, filter, selfCard = null) {
            if (!filter) return true;
            if (filter.or) return filter.or.some(sub => this.matchesV3Filter(card, sub, selfCard));
            if (!card || !card.def) return false;
            if (filter.excludeSelf && card === selfCard) return false;
            const d = card.def;
            const ir = this.getV3IR(d);
            if (filter.type && d.type !== filter.type) return false;
            if (filter.color && !ir?.allColor && d.color !== filter.color) return false;
            if (filter.nameIncludes) {
                const want = filter.nameIncludes.replace(/\s+/g, '');
                const okName = (d.name || '').replace(/\s+/g, '').includes(want)
                    || (Array.isArray(ir?.aliases) && ir.aliases.some(a => a.replace(/\s+/g, '').includes(want)));
                if (!okName) return false;
            }
            if (filter.excludeName && (d.name || '').replace(/\s+/g, '').includes(filter.excludeName.replace(/\s+/g, ''))) return false;
            if (filter.namesAny && !filter.namesAny.some(n => (d.name || '').replace(/\s+/g, '').includes(n.replace(/\s+/g, '')))) return false;
            if (filter.traitIncludes && !(Array.isArray(d.traits) && d.traits.some(t => t.includes(filter.traitIncludes)))) return false;
            if (filter.requireActive && card.isRest) return false;
            if (filter.requireRest && !card.isRest) return false;
            if (filter.requireRaided && !card.isRaided) return false;
            const reqEn = d.requiredEnergy?.count || 0;
            if (filter.maxEnergy !== undefined && reqEn > filter.maxEnergy) return false;
            if (filter.minEnergy !== undefined && reqEn < filter.minEnergy) return false;
            return true;
        }

        countV3Zone(query, selfCard = null) {
            const owner = query.owner || 'MY';
            const zone = query.zone || 'FIELD';
            if (owner === 'OPP') {
                const pm = this.playerMirror || {};
                if (zone === 'HAND') return pm.handCount || 0;
                if (zone === 'LIFE') return pm.lifeCount || 0;
                if (zone === 'DECK') return pm.deckCount || 0;
                if (zone === 'ENERGY') return pm.energyCount || 0;
                const oppCards = Object.values(pm.front || {}).filter(Boolean);
                return oppCards.filter(c => this.matchesV3Filter(c, query.filter, selfCard)).length;
            }
            let pool = [];
            if (zone === 'FRONT') pool = FRONT_SLOTS.map(s => this.getSlotTop(s)).filter(Boolean);
            else if (zone === 'ENERGY') pool = ENERGY_SLOTS.map(s => this.getSlotTop(s)).filter(Boolean);
            else if (zone === 'FIELD') pool = [...FRONT_SLOTS, ...ENERGY_SLOTS].map(s => this.getSlotTop(s)).filter(Boolean);
            else if (zone === 'HAND') pool = this.hand || [];
            else if (zone === 'OUTSIDE') pool = this.outside || [];
            else if (zone === 'REMOVE') pool = this.remove || [];
            else if (zone === 'LIFE') pool = this.life || [];
            else if (zone === 'DECK') pool = this.deck || [];
            const matched = pool.filter(c => this.matchesV3Filter(c, query.filter, selfCard));
            if (query.distinctNames) return new Set(matched.map(c => c.def?.name).filter(Boolean)).size;
            return matched.length;
        }

        evalV3Cond(cond, card = null, slotId = null, currentBp = undefined) {
            if (!cond) return true;
            switch (cond.type) {
                case 'MY_TURN': return !!(this.phase && this.phase !== '等待中');
                case 'OPP_TURN': return !(this.phase && this.phase !== '等待中');
                case 'SELF_IS_ACTIVE': return !!(card && !card.isRest);
                case 'SELF_IS_REST': return !!(card && card.isRest);
                case 'SELF_IN_FRONT': return !!(slotId && FRONT_SLOTS.includes(slotId));
                case 'SELF_IN_ENERGY': return !!(slotId && ENERGY_SLOTS.includes(slotId));
                case 'SELF_IS_RAIDED': return !!(card && card.isRaided);
                case 'SELF_BP_GTE': return (currentBp !== undefined ? currentBp : (card?.def?.bp || 0)) >= cond.value;
                case 'SELF_BP_LTE': return (currentBp !== undefined ? currentBp : (card?.def?.bp || 0)) <= cond.value;
                case 'GENERATED_ENERGY_GTE': {
                    if (this._inCalcEnergy) return false;
                    const en = this.calculateEnergy();
                    const val = cond.color ? (en[cond.color] || 0) : (en.ALL || 0);
                    return val >= (cond.count ?? 0);
                }
                case 'GENERATED_ENERGY_LTE': {
                    if (this._inCalcEnergy) return false;
                    const en = this.calculateEnergy();
                    const val = cond.color ? (en[cond.color] || 0) : (en.ALL || 0);
                    return val <= (cond.count ?? 0);
                }
                case 'COUNT_ZONE': {
                    const cnt = this.countV3Zone(cond, card);
                    if (cond.op === 'LTE') return cnt <= cond.count;
                    if (cond.op === 'EQ') return cnt === cond.count;
                    return cnt >= cond.count;
                }
                case 'HAS_CHAR': return this.hasCharacterOnMyField(cond.name);
                case 'HAS_CHAR_IN_FRONT': return FRONT_SLOTS.some(s => { const t = this.getSlotTop(s); return t?.def && (t.def.name || '').replace(/\s+/g, '').includes((cond.name || '').replace(/\s+/g, '')); });
                case 'HAS_ANY_CHAR': return (cond.names || []).some(n => this.hasCharacterOnMyField(n));
                case 'OUTSIDE_EVENTS_GTE': return (this.outside || []).filter(c => this.isCardTreatedAsEvent(c.def)).length >= cond.count;
                case 'OUTSIDE_CARDS_GTE': return (this.outside || []).length >= cond.count;
                case 'USED_EVENT_THIS_TURN': return !!this.usedEventThisTurn;
                case 'FIELD_EMPTY': return [...FRONT_SLOTS, ...ENERGY_SLOTS].every(s => !this.getSlotTop(s));
                case 'DISTINCT_TRAIT_NAMES_GTE': return this.countV3Zone({ owner: 'MY', zone: 'FIELD', filter: { traitIncludes: cond.trait }, distinctNames: true }, card) >= cond.count;
                case 'NOT': return !this.evalV3Cond(cond.cond, card, slotId, currentBp);
                case 'AND': return (cond.all || []).every(sub => this.evalV3Cond(sub, card, slotId, currentBp));
                case 'OR': return (cond.any || []).some(sub => this.evalV3Cond(sub, card, slotId, currentBp));
                default: return true;
            }
        }

        evalV3Continuous(card, slotId = null) {
            const out = { bpDelta: 0, impact: 0, damage: 0, snipe: false, step: false, doubleAttack: false, doubleBlock: false, impactNullify: false, unblockableMaxBp: 0, unblockableMinBp: 0, cannotBlock: false, cannotAttack: false, genEnergyBonus: 0 };
            if (!card || !card.def) return out;
            const ir = this.getV3IR(card.def);
            if (!ir) return out;
            const kw = ir.staticKeywords || {};
            out.impact = Number(kw.impact) || 0;
            out.damage = Number(kw.damage) || 0;
            out.snipe = !!kw.snipe;
            out.step = !!kw.step;
            out.doubleAttack = !!kw.doubleAttack;
            out.doubleBlock = !!kw.doubleBlock;
            out.impactNullify = !!kw.impactNullify;
            out.unblockableMaxBp = kw.unblockableMaxBp || 0;
            out.unblockableMinBp = kw.unblockableMinBp || 0;
            out.cannotBlock = !!kw.cannotBlock;
            out.cannotAttack = !!kw.cannotAttack;

            const applyRule = (r) => {
                if (r.bpDelta) out.bpDelta += r.bpDelta;
                if (r.bpPerCount && r.bpPerCount.query) {
                    const cnt = this.countV3Zone(r.bpPerCount.query, card);
                    out.bpDelta += (r.bpPerCount.maxCount ? Math.min(cnt, r.bpPerCount.maxCount) : cnt) * r.bpPerCount.step;
                }
                if (r.grantImpact) out.impact = Math.max(out.impact, r.grantImpact);
                if (r.grantDamage) out.damage = Math.max(out.damage, r.grantDamage);
                if (r.grantSnipe) out.snipe = true;
                if (r.grantStep) out.step = true;
                if (r.grantDoubleAttack) out.doubleAttack = true;
                if (r.grantDoubleBlock) out.doubleBlock = true;
                if (r.grantImpactNullify) out.impactNullify = true;
                if (r.grantCannotBlock) out.cannotBlock = true;
                if (r.grantCannotAttack) out.cannotAttack = true;
                if (r.genEnergyDelta) out.genEnergyBonus += r.genEnergyDelta.count || 0;
            };
            const isBpCond = (c) => c && (c.type === 'SELF_BP_GTE' || c.type === 'SELF_BP_LTE' || (c.type === 'AND' && (c.all || []).some(isBpCond)) || (c.type === 'OR' && (c.any || []).some(isBpCond)));
            const deferred = [];
            for (const r of ir.continuous || []) {
                if (r.requireRaided && !card.isRaided) continue;
                if (isBpCond(r.when)) { deferred.push(r); continue; }
                if (!this.evalV3Cond(r.when, card, slotId)) continue;
                applyRule(r);
            }
            if (deferred.length > 0) {
                const curBp = Math.max(0, (card.def.bp || 0) + (slotId ? (this.bpMods[slotId] || 0) : 0) + out.bpDelta);
                for (const r of deferred) {
                    if (!this.evalV3Cond(r.when, card, slotId, curBp)) continue;
                    applyRule(r);
                }
            }
            return out;
        }

        getEffectiveBp(slotId) {
            const top = this.getSlotTop(slotId);
            if (!top || !top.def || !top.def.bp) return 0;
            const v3 = this.evalV3Continuous(top, slotId);
            return Math.max(0, top.def.bp + (this.bpMods[slotId] || 0) + v3.bpDelta);
        }

        getCardKeywords(card, slotId = null) {
            const base = parseStaticKeywords(card?.def);
            const v3 = this.evalV3Continuous(card, slotId);
            const tk = card?.tempKeywords || {};
            const minCands = [base.unblockableMinBp, v3.unblockableMinBp, tk.UNBLOCKABLE_MIN_BP].filter(v => v && v > 0);
            return {
                impact: Math.max(base.impact, v3.impact, tk.IMPACT || 0) + (tk.IMPACT_PLUS || 0),
                damage: Math.max(base.damage, v3.damage || 1, tk.DAMAGE || 1) + (tk.DAMAGE_PLUS || 0),
                snipe: base.snipe || v3.snipe || !!tk.SNIPE,
                step: base.step || v3.step || !!tk.STEP,
                doubleAttack: base.doubleAttack || v3.doubleAttack || !!tk.DOUBLE_ATTACK,
                doubleBlock: base.doubleBlock || v3.doubleBlock || !!tk.DOUBLE_BLOCK,
                impactNullify: base.impactNullify || v3.impactNullify || !!tk.IMPACT_NULLIFY,
                cannotBlock: v3.cannotBlock || !!tk.CANNOT_BLOCK,
                cannotAttack: v3.cannotAttack || !!tk.CANNOT_ATTACK,
                unblockableMaxBp: Math.max(base.unblockableMaxBp || 0, v3.unblockableMaxBp || 0, tk.UNBLOCKABLE_MAX_BP || 0),
                unblockableMinBp: minCands.length > 0 ? Math.min(...minCands) : 0
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
            const prevGuard = this._inCalcEnergy;
            this._inCalcEnergy = true;
            try {
                const addSlot = (slotId, isFront) => {
                    const top = this.getSlotTop(slotId);
                    if (!top || !top.def) return;
                    const ir = this.getV3IR(top.def);
                    if (isFront && !(ir && ir.generateEnergyInFront)) return;
                    const col = (top.def.generatedEnergy?.color && top.def.generatedEnergy.color !== 'NONE')
                        ? top.def.generatedEnergy.color
                        : (top.def.color || 'NONE');
                    let cnt = Math.max(0, top.def.generatedEnergy?.count ?? 1);
                    (top.tempEnergyBoost || []).forEach(b => { cnt += b.count || 0; });
                    if (!prevGuard && ir) {
                        const v3 = this.evalV3Continuous(top, slotId);
                        if (v3.genEnergyBonus) cnt += v3.genEnergyBonus;
                    }
                    if (totals[col] !== undefined) totals[col] += cnt;
                    totals.ALL += cnt;
                };
                ENERGY_SLOTS.forEach(slotId => addSlot(slotId, false));
                FRONT_SLOTS.forEach(slotId => addSlot(slotId, true));
            } finally {
                this._inCalcEnergy = prevGuard;
            }
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
                if (!top || !top.def || top.def.type !== 'CHARACTER') return;
                const ir = this.getV3IR(top.def);
                if (ir && (ir.staticKeywords?.cannotMove || ir.staticKeywords?.cannotMoveToFront)) return;
                if (ir && (ir.continuous || []).some(r => r.cannotMoveToFront && this.evalV3Cond(r.when, top, fromSlot))) return;
                moves.push({ fromSlot, toSlot: emptyFront[0], card: top });
            });
            return moves;
        }

        isCardTreatedAsEvent(def) {
            if (!def) return false;
            if (def.type === 'EVENT') return true;
            if (def.effectText && def.effectText.includes('このカードは全ての場所でイベントカードとしても扱う')) return true;
            const ir = this.getV3IR(def);
            if (ir && Array.isArray(ir.treatAsTypes) && ir.treatAsTypes.includes('EVENT')) return true;
            return false;
        }

        performExtraDraw() {
            if (this.deck.length === 0 || this.getAvailableAp() < 1) return { ok: false };
            if (!this.payAp(1)) return { ok: false };
            const drawn = this.deck.pop();
            drawn.isFlipped = true;
            this.hand.push(drawn);
            return { ok: true, card: drawn };
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
                const ir = this.getV3IR(d);
                let apCost = d.apCost !== undefined ? d.apCost : 1;
                if (ir && Array.isArray(ir.apDiscounts)) {
                    for (const ad of ir.apDiscounts) {
                        if (this.evalV3Cond(ad.when, card)) apCost = Math.max(0, apCost - (ad.amount || 1));
                    }
                }
                if (apCost > availAp) return;

                const reqCol = d.requiredEnergy?.color || 'NONE';
                let reqCnt = d.requiredEnergy?.count || 0;
                if (ir && Array.isArray(ir.energyDiscounts)) {
                    for (const ed of ir.energyDiscounts) {
                        if (this.evalV3Cond(ed.when, card)) reqCnt = Math.max(0, reqCnt - (ed.amount || 1));
                    }
                }
                if (reqCnt > 0 && reqCol !== 'NONE') {
                    const haveEn = ir?.allColor ? (en.ALL || 0) : (en[reqCol] || 0);
                    if (haveEn < reqCnt) return;
                }

                if (d.type === 'EVENT') {
                    const compiled = this.compileActions(d.effectText);
                    const hasV3Event = !!(ir && Array.isArray(ir.onEventPlay) && ir.onEventPlay.length > 0);
                    if (hasV3Event || compiled.some(a => a.type !== 'INTERACTIVE_FALLBACK')) {
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

                if ((d.type === 'CHARACTER' || d.type === 'FIELD') && !ir?.raidOnly) {
                    if (emptyEnergy.length > 0) {
                        actions.push({ type: 'NORMAL', handIndex, card, apCost, targetSlot: emptyEnergy[0], line: 'ENERGY' });
                    } else if ((d.generatedEnergy?.count ?? 1) >= 2 || d.type === 'FIELD') {
                        // 能源線全滿時：允許移除產能較低（≤1）的非雙球卡換上雙球／場域卡
                        const weakEn = ENERGY_SLOTS
                            .map(s => ({ s, top: this.getSlotTop(s) }))
                            .filter(x => x.top && (x.top.def?.generatedEnergy?.count ?? 1) <= 1 && !x.top.isRaided)
                            .sort((a, b) => (a.top.def?.bp || 0) - (b.top.def?.bp || 0));
                        if (weakEn.length > 0) {
                            actions.push({ type: 'NORMAL', handIndex, card, apCost, targetSlot: weakEn[0].s, line: 'ENERGY', replaceSlot: true, replacedCard: weakEn[0].top });
                        }
                    }
                    if (d.type === 'CHARACTER' && !ir?.cannotPlayFront) {
                        if (emptyFront.length > 0) {
                            actions.push({ type: 'NORMAL', handIndex, card, apCost, targetSlot: emptyFront[0], line: 'FRONT' });
                        } else {
                            // 前線全滿時：允許移除最弱非突襲角色換上更強主力
                            const weakFl = FRONT_SLOTS
                                .map(s => ({ s, top: this.getSlotTop(s), bp: this.getEffectiveBp(s) }))
                                .filter(x => x.top && !x.top.isRaided)
                                .sort((a, b) => a.bp - b.bp);
                            if (weakFl.length > 0) {
                                actions.push({ type: 'NORMAL', handIndex, card, apCost, targetSlot: weakFl[0].s, line: 'FRONT', replaceSlot: true, replacedCard: weakFl[0].top, replacedBp: weakFl[0].bp });
                            }
                        }
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
                const kw = this.getCardKeywords(top, slotId);
                if (kw.cannotAttack) return;
                list.push({
                    slotId,
                    card: top,
                    effectiveBp: this.getEffectiveBp(slotId),
                    impact: kw.impact,
                    damage: kw.damage,
                    doubleAttack: kw.doubleAttack,
                    unblockableMaxBp: kw.unblockableMaxBp,
                    unblockableMinBp: kw.unblockableMinBp
                });
            });
            return list;
        }

        getLegalBlockers(unblockableMaxBp = 0, unblockableMinBp = 0) {
            const list = [];
            FRONT_SLOTS.forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (!top || top.isRest || !top.def || top.def.type !== 'CHARACTER') return;
                const kw = this.getCardKeywords(top, slotId);
                if (kw.cannotBlock) return;
                const bp = this.getEffectiveBp(slotId);
                if (unblockableMaxBp && bp <= unblockableMaxBp) return;
                if (unblockableMinBp && bp >= unblockableMinBp) return;
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
                        if (cond.type === 'SELF_IS_REST') return !!sourceCard.isRest;
                        if (cond.type === 'OPP_HAS_LOWERED_BP') return FRONT_SLOTS.some(s => (this.playerMirror.front[s]?.bpMod || 0) < 0);
                        if (cond.type === 'HAS_CHAR_ON_FIELD') return this.hasCharacterOnMyField(cond.name);
                        if (cond.type === 'HAS_ANY_CHAR_ON_FIELD') return (cond.names || []).some(n => this.hasCharacterOnMyField(n));
                        if (cond.type === 'HAS_TRAIT_ON_FIELD') return this.hasTraitOnMyField(cond.trait);
                        if (cond.type === 'IF_ADDED_TO_HAND') return !!ctx.addedFromLook;
                        return true;
                    });
                    if (!ok) continue;
                }

                switch (act.type) {
                    case 'CHOOSE_ONE_BRANCH': {
                        const opts = act.options || [];
                        if (opts.length === 0) break;
                        let chosen = opts[0];
                        if (difficulty === 'random') {
                            chosen = opts[getUnbiasedRandomInt(opts.length)];
                        } else if (brain && typeof brain.estimateActionsValue === 'function') {
                            let bestScore = -Infinity;
                            opts.forEach(opt => {
                                const sc = brain.estimateActionsValue(this, opt.actions || []);
                                if (sc > bestScore) { bestScore = sc; chosen = opt; }
                            });
                        }
                        if (chosen && chosen.actions) {
                            logs.push(`[電腦效果] 【${sourceCard.def.name}】選擇發動：${chosen.label}`);
                            this.executeActionList(sourceCard, sourceSlotId, chosen.actions, ctx, brain, difficulty, outgoingEvents, logs);
                        }
                        break;
                    }

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
                        let effectiveMaxBp = act.maxBp;
                        if (Array.isArray(act.bpUpgrades)) {
                            act.bpUpgrades.forEach(up => {
                                const upOk = (up.conditions || []).every(cond => {
                                    if (cond.type === 'HAS_CHAR_ON_FIELD') return this.hasCharacterOnMyField(cond.name);
                        if (cond.type === 'HAS_ANY_CHAR_ON_FIELD') return (cond.names || []).some(n => this.hasCharacterOnMyField(n));
                                    if (cond.type === 'HAS_TRAIT_ON_FIELD') return this.hasTraitOnMyField(cond.trait);
                                    return true;
                                });
                                if (upOk) effectiveMaxBp = effectiveMaxBp != null ? Math.max(effectiveMaxBp, up.maxBp) : up.maxBp;
                            });
                        }
                        if (act.owner === 'OPP') {
                            const cands = FRONT_SLOTS
                                .map(sid => this.playerMirror.front[sid])
                                .filter(p => {
                                    if (!p) return false;
                                    if (effectiveMaxBp !== null && effectiveMaxBp !== undefined && p.effectiveBp > effectiveMaxBp) return false;
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

                    case 'PUT_DECK_TOP_UNDER_SELF': {
                        const arr = sourceSlotId ? this.getSlotArray(sourceSlotId) : null;
                        if (arr && arr.length > 0) {
                            let placed = 0;
                            for (let i = 0; i < (act.count || 1) && this.deck.length > 0; i++) {
                                const c = this.deck.pop();
                                c.isFlipped = true;
                                c.isRest = false;
                                arr.unshift(c);
                                placed++;
                            }
                            if (placed > 0) logs.push(`[電腦效果] 【${sourceCard.def.name}】將牌頂 ${placed} 張以裏側置於下方`);
                        }
                        break;
                    }

                    case 'OPP_DISCARD_HAND': {
                        const cnt = Math.max(1, act.count || 1);
                        outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_DISCARD_HAND', count: cnt });
                        logs.push(`[電腦效果] 【${sourceCard.def.name}】要求玩家捨棄 ${cnt} 張手牌！`);
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
                        if (act.target === 'SELECTED' && ctx.selectedTargets.length > 0) {
                            ctx.selectedTargets.forEach(t => {
                                if (t.owner === 'OPP') {
                                    outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_BOUNCE_SLOT', slotId: t.slotId });
                                    this.playerMirror.front[t.slotId] = null;
                                    logs.push(`[電腦效果] 【${sourceCard.def.name}】將我方前線角色退回手牌！`);
                                } else {
                                    this.forceMoveSlotCard(t.slotId, 'HAND');
                                }
                            });
                        } else if (act.target === 'MY_OTHER') {
                            const others = [...FRONT_SLOTS, ...ENERGY_SLOTS]
                                .map(sid => ({ sid, card: this.getSlotTop(sid) }))
                                .filter(x => x.card && x.card !== sourceCard && x.card.def?.type === 'CHARACTER' &&
                                    (!act.maxRequiredEnergy || (x.card.def.requiredEnergy?.count || 0) <= act.maxRequiredEnergy));
                            if (others.length > 0) {
                                this.forceMoveSlotCard(others[0].sid, 'HAND');
                                logs.push(`[電腦效果] 【${sourceCard.def.name}】將 1 張場上角色退回手牌`);
                            } else if (act.selfFallback && sourceSlotId) {
                                this.forceMoveSlotCard(sourceSlotId, 'HAND');
                                logs.push(`[電腦效果] 【${sourceCard.def.name}】無其他目標，返回手牌`);
                            }
                        }
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
                        const upgradeRetire = Array.isArray(act.upgradeToRetireConditions) && act.upgradeToRetireConditions.length > 0 &&
                            act.upgradeToRetireConditions.every(cond => {
                                if (cond.type === 'HAS_CHAR_ON_FIELD') return this.hasCharacterOnMyField(cond.name);
                        if (cond.type === 'HAS_ANY_CHAR_ON_FIELD') return (cond.names || []).some(n => this.hasCharacterOnMyField(n));
                                if (cond.type === 'HAS_TRAIT_ON_FIELD') return this.hasTraitOnMyField(cond.trait);
                                return true;
                            });
                        targets.forEach(t => {
                            if (upgradeRetire && t.owner === 'OPP') {
                                outgoingEvents.push({ type: 'ENGINE_EVENT', subType: 'FORCE_RETIRE_SLOT', slotId: t.slotId });
                                this.playerMirror.front[t.slotId] = null;
                                logs.push(`[電腦效果] 【${sourceCard.def.name}】滿足條件升級，使我方前線角色退場！`);
                                return;
                            }
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
                        const targets = act.target === 'SELECTED'
                            ? ctx.selectedTargets
                            : [{ owner: 'MY', slotId: sourceSlotId, card: sourceCard }];
                        targets.forEach(t => {
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

                    case 'GRANT_UNBLOCKABLE_BY_HIGH_BP': {
                        const targets = (act.target === 'SELECTED' && ctx.selectedTargets.length > 0)
                            ? ctx.selectedTargets.filter(t => t.owner === 'MY').map(t => t.card)
                            : [sourceCard];
                        targets.forEach(c => { if (c) c.tempKeywords.UNBLOCKABLE_MIN_BP = act.minBp || 0; });
                        break;
                    }

                    case 'RETRIGGER_ON_PLAY': {
                        const sub = this.resolveCardEffects(sourceCard, sourceSlotId, 'ON_PLAY', brain, difficulty);
                        outgoingEvents.push(...sub.outgoingEvents);
                        logs.push(...sub.logs);
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

                    case 'SPECIAL_SUMMON': {
                        const pool = act.from === 'OUTSIDE' ? this.outside : this.hand;
                        const cands = pool
                            .filter(c => {
                                if (!c.def || c.def.type !== 'CHARACTER') return false;
                                if (act.maxEnergy !== null && act.maxEnergy !== undefined && (c.def.requiredEnergy?.count || 0) > act.maxEnergy) return false;
                                return this.matchesFilters(c.def, act);
                            })
                            .sort((a, b) => (b.def?.bp || 0) - (a.def?.bp || 0));
                        if (cands.length === 0) break;

                        const emptyFront = FRONT_SLOTS.find(s => this.front[s].length === 0);
                        const emptyEnergy = ENERGY_SLOTS.find(s => this.energy[s].length === 0);
                        const destSlot = emptyFront || emptyEnergy;
                        if (!destSlot) break;

                        const chosen = cands[0];
                        const idx = pool.indexOf(chosen);
                        if (idx !== -1) pool.splice(idx, 1);
                        chosen.isFlipped = false;
                        chosen.isRest = !!act.enterRest;
                        chosen.isRaided = false;

                        if (FRONT_SLOTS.includes(destSlot)) this.front[destSlot].push(chosen);
                        else this.energy[destSlot].push(chosen);
                        logs.push(`[電腦效果] 【${sourceCard.def.name}】從${act.from === 'OUTSIDE' ? '場外' : '手牌'}特殊登場了【${chosen.def.name}】`);
                        break;
                    }

                    case 'LOOK_AND_ARRANGE_TOP': {
                        const lookCnt = Math.min(act.count || 1, this.deck.length);
                        if (lookCnt === 0) break;
                        const topCards = [];
                        for (let i = 0; i < lookCnt; i++) topCards.push(this.deck.pop());
                        topCards.sort((a, b) => (b.def?.bp || 0) - (a.def?.bp || 0));

                        const maxKeep = act.keepUpTo !== undefined ? Math.min(act.keepUpTo, lookCnt) : lookCnt;
                        const keepCnt = act.remainderTo === 'TOP' ? lookCnt : Math.min(maxKeep, Math.max(1, Math.ceil(lookCnt / 2)));
                        const kept = topCards.slice(0, keepCnt);
                        const rest = topCards.slice(keepCnt);

                        rest.forEach(c => {
                            if (act.remainderTo === 'OUTSIDE') { c.isFlipped = false; this.outside.push(c); }
                            else if (act.remainderTo === 'REMOVE') { c.isFlipped = false; this.remove.push(c); }
                            else { c.isFlipped = true; this.deck.unshift(c); }
                        });
                        [...kept].reverse().forEach(c => {
                            c.isFlipped = true;
                            this.deck.push(c);
                        });
                        logs.push(`[電腦效果] 【${sourceCard.def.name}】檢視並調整了牌組頂端 ${lookCnt} 張`);
                        break;
                    }

                    case 'MOVE_LINE': {
                        const targets = (act.target === 'SELECTED' && ctx.selectedTargets.length > 0)
                            ? ctx.selectedTargets.filter(t => t.owner === 'MY')
                            : (sourceSlotId ? [{ owner: 'MY', slotId: sourceSlotId, card: sourceCard }] : []);
                        const destPool = act.toZone === 'FRONT_LINE' ? FRONT_SLOTS : ENERGY_SLOTS;
                        targets.forEach(t => {
                            if (!t.slotId) return;
                            const isAlreadyInDest = destPool.includes(t.slotId);
                            if (isAlreadyInDest) return;
                            const emptyDest = destPool.find(s => (this.front[s] || this.energy[s]).length === 0);
                            if (!emptyDest) return;
                            const srcArr = this.getSlotArray(t.slotId);
                            if (!srcArr || srcArr.length === 0) return;
                            if (FRONT_SLOTS.includes(emptyDest)) this.front[emptyDest] = [...srcArr];
                            else this.energy[emptyDest] = [...srcArr];
                            srcArr.length = 0;
                            if (this.bpMods.hasOwnProperty(t.slotId)) this.bpMods[t.slotId] = 0;
                            logs.push(`[電腦效果] 【${t.card?.def?.name || sourceCard.def.name}】移動至${act.toZone === 'FRONT_LINE' ? '前線' : '能源線'}`);
                        });
                        break;
                    }

                    case 'BOOST_GENERATED_ENERGY': {
                        if (sourceCard) {
                            if (!Array.isArray(sourceCard.tempEnergyBoost)) sourceCard.tempEnergyBoost = [];
                            sourceCard.tempEnergyBoost.push({ color: act.color || 'NONE', count: act.count || 1 });
                            logs.push(`[電腦效果] 【${sourceCard.def.name}】本回合產生能源 +${act.count || 1}`);
                        }
                        break;
                    }

                    case 'DELAYED_SELF_RETIRE': {
                        if (sourceCard) {
                            sourceCard.retireAtEndOfMain = true;
                        }
                        break;
                    }

                    case 'GRANT_EVENT_AP_DISCOUNT': {
                        logs.push(`[電腦效果] 【${sourceCard.def.name}】賦予本回合事件卡 AP 減免`);
                        break;
                    }

                    default:
                        break;
                }
            }
        }

        // ==================== 原子狀態變更 ====================
        beginTurn() {
            this.usedEventThisTurn = false;
            this.usedEventCountThisTurn = 0;
            [...FRONT_SLOTS, ...ENERGY_SLOTS].forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (top) {
                    if (top.frozenNextTurn) top.frozenNextTurn = false;
                    else top.isRest = false;
                    top.usedOncePerTurn = false;
                    top.attackCountThisTurn = 0;
                    top.blockCountThisTurn = 0;
                    top.tempKeywords = {};
                    top.persistentBp = 0;
                    top.persistentKeywords = {};
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
            if (this.isCardTreatedAsEvent(card.def)) {
                this.usedEventThisTurn = true;
                this.usedEventCountThisTurn = (this.usedEventCountThisTurn || 0) + 1;
            }

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

            if (action.replaceSlot) {
                const targetArr = action.line === 'FRONT' ? this.front[action.targetSlot] : this.energy[action.targetSlot];
                if (targetArr && targetArr.length > 0) {
                    const topOld = targetArr.pop();
                    topOld.isRest = false; topOld.isRaided = false; topOld.isFlipped = false;
                    this.remove.push(topOld);
                    while (targetArr.length > 0) {
                        const under = targetArr.pop();
                        under.isRest = false; under.isRaided = false; under.isFlipped = false;
                        this.outside.push(under);
                    }
                    if (this.bpMods.hasOwnProperty(action.targetSlot)) this.bpMods[action.targetSlot] = 0;
                }
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
                attackerCardId: attacker.cardId,
                attackerImageUrl: attacker.def?.imageUrl || '',
                attackerIsRaided: !!attacker.isRaided,
                attackerEffectText: attacker.def?.effectText || '',
                atkBp: this.getEffectiveBp(slotId),
                impact: finalKw.impact,
                damage: finalKw.damage,
                doubleAttack: !!finalKw.doubleAttack,
                snipe: !!finalKw.snipe,
                unblockableMaxBp: finalKw.unblockableMaxBp,
                unblockableMinBp: finalKw.unblockableMinBp,
                unblockableByRaided: !!(attacker.tempKeywords?.UNBLOCKABLE_BY_RAIDED || (attacker.def?.effectText || '').includes('レイド状態のキャラにブロックされない')),
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
                if (this.bpMods.hasOwnProperty(slotId)) {
                    this.bpMods[slotId] = (top && top.persistentBp) ? top.persistentBp : 0;
                }
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

            this.deck.forEach((c, idx) => pushCard(c, 'my-deck-area', '0px', '0px', idx + 1, c.isFlipped !== false, false, false));
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
