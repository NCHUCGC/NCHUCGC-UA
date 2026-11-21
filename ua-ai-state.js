/**
 * NCHUCGC Union Arena 人機對戰 — 純資料狀態與規則層 (ua-ai-state.js)
 * 職責：
 * 1. 維護 AI 自身純資料盤面（不讀寫 DOM）與玩家盤面鏡像 (playerMirror)。
 * 2. 提供能源計算、突襲條件驗證、簡單事件卡解析、合法行動列舉與關鍵字查詢。
 * 3. 提供原子狀態變更 API 與 SYNC_BOARD 快照匯出。
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

    // 解析第二階段支援的「簡單事件卡」（純抽牌、純退場對手前線 BP<=N、或 Final 回 AP）
    function parseSimpleEvent(def) {
        if (!def || def.type !== 'EVENT') return null;
        const eff = (def.effectText || '').replace(/（[^）]*）/g, '');
        if (!eff || eff === '-') return null;

        // 1. 退場對手前線 BP<=N（如 Special）
        const retireM = eff.match(/相手のフロントLの.*BP(\d+)以下のキャラを1枚.*退場させる/);
        if (retireM) {
            return { kind: 'RETIRE_OPP_FRONT', maxBp: parseInt(retireM[1], 10) };
        }
        // 2. Final 類：將 AP 轉活動（且無複雜代價）
        if (eff.includes('APカードを1枚') && eff.includes('アクティブにする') && !eff.includes('手札を')) {
            return { kind: 'ACTIVATE_AP', count: 1 };
        }
        // 3. 純抽牌（不含棄牌/條件/目標選擇）
        const drawM = eff.match(/カードを『?(\d+)枚』?(?:まで)?引[きく]/);
        if (drawM && !eff.includes('手札を') && !eff.includes('選び') && !eff.includes('山札の上から')) {
            return { kind: 'DRAW', amount: parseInt(drawM[1], 10) };
        }
        return null;
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

            // AI 自身盤面
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

            // 玩家盤面鏡像（由玩家送來的 SYNC_BOARD 更新）
            this.playerMirror = {
                deckCount: 50,
                handCount: 0,
                lifeCount: 7,
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
                attackCountThisTurn: 0,
                blockCountThisTurn: 0
            }));
            this.ap = this.initialApIds.map((cardId, i) => ({
                networkId: `p_ap_${i}`,
                cardId,
                slotId: AP_SLOTS[i],
                unlocked: false,
                isRest: false
            }));

            this.drawInitialHandAndLife();
        }

        drawInitialHandAndLife() {
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
                if (!arr || arr.length === 0) {
                    frontMirror[slotId] = null;
                    return;
                }
                arr.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                const top = arr[arr.length - 1];
                const def = this.playerCardDefByNetId.get(top.id) || null;
                const mod = parseInt(bpStates[slotId], 10) || 0;
                const bp = Math.max(0, (def?.bp || 0) + mod);
                frontMirror[slotId] = {
                    slotId,
                    networkId: top.id,
                    def,
                    isRest: !!top.isRest,
                    effectiveBp: bp
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
            return parseStaticKeywords(card?.def);
        }

        calculateEnergy() {
            const totals = { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0, PURPLE: 0, ALL: 0 };
            ENERGY_SLOTS.forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (!top || !top.def) return;
                const col = (top.def.generatedEnergy?.color && top.def.generatedEnergy.color !== 'NONE')
                    ? top.def.generatedEnergy.color
                    : (top.def.color || 'NONE');
                const rawCnt = top.def.generatedEnergy?.count ?? 1;
                const cnt = Math.max(0, rawCnt);
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
            if (availAp <= 0) return [];
            const en = this.calculateEnergy();
            const emptyFront = FRONT_SLOTS.filter(s => this.front[s].length === 0);
            const emptyEnergy = ENERGY_SLOTS.filter(s => this.energy[s].length === 0);
            const actions = [];

            this.hand.forEach((card, handIndex) => {
                const d = card.def;
                if (!d) return;
                const apCost = d.apCost !== undefined ? d.apCost : 1;
                if (apCost > availAp) return;

                const reqCol = d.requiredEnergy?.color || 'NONE';
                const reqCnt = d.requiredEnergy?.count || 0;
                if (reqCnt > 0 && reqCol !== 'NONE' && (en[reqCol] || 0) < reqCnt) return;

                // 1. 簡單事件卡
                if (d.type === 'EVENT') {
                    const simple = parseSimpleEvent(d);
                    if (!simple) return;
                    if (simple.kind === 'RETIRE_OPP_FRONT') {
                        const targets = FRONT_SLOTS
                            .map(sid => this.playerMirror.front[sid])
                            .filter(p => p && p.effectiveBp <= simple.maxBp);
                        if (targets.length > 0) {
                            actions.push({ type: 'EVENT', handIndex, card, apCost, eventEffect: simple, targets });
                        }
                    } else if (simple.kind === 'ACTIVATE_AP') {
                        const hasRestedAp = this.ap.some(a => a.unlocked && a.isRest);
                        if (hasRestedAp) actions.push({ type: 'EVENT', handIndex, card, apCost, eventEffect: simple });
                    } else if (simple.kind === 'DRAW' && this.deck.length >= simple.amount) {
                        actions.push({ type: 'EVENT', handIndex, card, apCost, eventEffect: simple });
                    }
                    return;
                }

                // 2. 突襲 (Raid)
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

                // 3. 一般登場（角色／場域）
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
                    doubleAttack: kw.doubleAttack
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

        // ==================== 原子狀態變更 ====================
        beginTurn() {
            [...FRONT_SLOTS, ...ENERGY_SLOTS].forEach(slotId => {
                const top = this.getSlotTop(slotId);
                if (top) {
                    if (top.frozenNextTurn) top.frozenNextTurn = false;
                    else top.isRest = false;
                    top.attackCountThisTurn = 0;
                    top.blockCountThisTurn = 0;
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

        applyPlay(action) {
            if (!action) return null;
            this.payAp(action.apCost);
            const [card] = this.hand.splice(action.handIndex, 1);
            card.isFlipped = false;

            if (action.type === 'EVENT') {
                card.isRest = false;
                this.outside.push(card);
                const eff = action.eventEffect;
                if (eff.kind === 'DRAW') {
                    for (let i = 0; i < eff.amount && this.deck.length > 0; i++) {
                        const d = this.deck.pop();
                        d.isFlipped = true;
                        this.hand.push(d);
                    }
                    return { eventKind: 'DRAW', card, amount: eff.amount };
                }
                if (eff.kind === 'ACTIVATE_AP') {
                    this.activateAp(eff.count);
                    return { eventKind: 'ACTIVATE_AP', card };
                }
                if (eff.kind === 'RETIRE_OPP_FRONT') {
                    return { eventKind: 'RETIRE_OPP_FRONT', card, targetSlotId: action.chosenTargetSlotId };
                }
                return { eventKind: 'OTHER', card };
            }

            if (action.type === 'RAID') {
                card.isRest = false;
                card.isRaided = true;
                const srcArr = this.getSlotArray(action.targetSlot);
                srcArr.forEach(c => { c.isRest = false; });
                srcArr.push(card);
                if (this.bpMods.hasOwnProperty(action.targetSlot)) this.bpMods[action.targetSlot] = 0;

                if (action.moveToFront && action.destFrontSlot && action.destFrontSlot !== action.targetSlot) {
                    this.front[action.destFrontSlot] = srcArr;
                    this.energy[action.targetSlot] = [];
                }
                return { playedType: 'RAID', card };
            }

            // NORMAL
            card.isRest = !(card.def?.compiledRules?.entersActive);
            card.isRaided = false;
            if (action.line === 'FRONT') this.front[action.targetSlot].push(card);
            else this.energy[action.targetSlot].push(card);
            return { playedType: 'NORMAL', card };
        }

        applyAttackDeclare(slotId) {
            const attacker = this.getSlotTop(slotId);
            if (!attacker) return null;
            attacker.isRest = true;
            attacker.attackCountThisTurn++;
            const kw = this.getCardKeywords(attacker);
            if (kw.doubleAttack && attacker.attackCountThisTurn === 1) {
                attacker.isRest = false;
            }
            return {
                slotId,
                attacker,
                atkBp: this.getEffectiveBp(slotId),
                impact: kw.impact,
                damage: kw.damage
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
            return {
                slotId,
                blocker,
                blockerBp: this.getEffectiveBp(slotId)
            };
        }

        forceMoveSlotCard(slotId, dest) {
            const arr = this.getSlotArray(slotId);
            if (!arr || arr.length === 0) return;
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
            top.isRaided = false;

            if (dest === 'HAND') { top.isFlipped = true; this.hand.push(top); }
            else if (dest === 'DECK_BOTTOM') { top.isFlipped = true; this.deck.unshift(top); }
            else if (dest === 'REMOVE') { top.isFlipped = false; this.remove.push(top); }
            else { top.isFlipped = false; this.outside.push(top); }
        }

        discardHandByIndices(indices, dest = 'OUTSIDE') {
            const sorted = [...indices].sort((a, b) => b - a);
            sorted.forEach(idx => {
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
