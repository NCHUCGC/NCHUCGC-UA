/**
 * NCHUCGC Union Arena 人機對戰 — 通訊與流程控制層 (ua-ai-opponent.js)
 * 職責：連接 VirtualConnection、驅動 AI 回合、派發無頭效果事件 (outgoingEvents) 與大廳 UI 整合。
 */
(function () {
    const DEFAULT_AP_ID = 'UA44BT/EVA-1-AP03';

    function getStepDelay() {
        return typeof window.__AI_STEP_DELAY === 'number' ? window.__AI_STEP_DELAY : 550;
    }

    function getCardDefById(cardId) {
        if (!cardId) return null;
        if (window.UAUtils) return window.UAUtils.getCardById(cardId) || window.UAUtils.getBaseCardById(cardId);
        return window.cardCatalogById ? (window.cardCatalogById.get(cardId) || null) : null;
    }

    function buildAiDeckFromSelection(value) {
        if (window.UAUtils) window.UAUtils.ensureCatalogIndex();
        const catalog = typeof masterCardCatalog !== 'undefined' ? masterCardCatalog : [];
        let mainIds = [], apIds = [], fallbackSeries = null, fallbackColor = null;

        if (value && value.startsWith('player:')) {
            const deckObj = window.allDecks && window.allDecks[value.slice('player:'.length)];
            if (deckObj) {
                const rawMain = Array.isArray(deckObj) ? deckObj : (deckObj.main || []);
                const rawAp = Array.isArray(deckObj) ? [] : (deckObj.ap || []);
                mainIds = rawMain.map(c => (typeof c === 'string' ? c : c?.id)).filter(Boolean);
                apIds = rawAp.map(c => (typeof c === 'string' ? c : c?.id)).filter(Boolean);
                const firstDef = getCardDefById(mainIds[0]);
                if (firstDef) { fallbackSeries = firstDef.series; fallbackColor = firstDef.color; }
            }
        } else if (value && value.startsWith('tier:')) {
            const tierDeck = (window.NCHUCGC_TIER_LIST || []).find(d => d.id === value.slice('tier:'.length));
            if (tierDeck) {
                mainIds = [...(tierDeck.sampleDeck || [])].filter(Boolean);
                fallbackSeries = tierDeck.series;
                fallbackColor = tierDeck.color;
            }
        }

        if (mainIds.length < 50 && catalog.length > 0) {
            const counts = {};
            mainIds.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
            let pool = catalog.filter(c =>
                c && c.id && c.type !== 'AP' && !c.id.includes('-AP') &&
                (!fallbackSeries || c.series === fallbackSeries) &&
                (!fallbackColor || c.color === fallbackColor)
            );
            if (pool.length < 15) pool = catalog.filter(c => c && c.id && c.type === 'CHARACTER' && (!fallbackColor || c.color === fallbackColor));
            if (pool.length === 0) pool = catalog.filter(c => c && c.id && c.type === 'CHARACTER');
            pool.sort((a, b) => {
                const ca = a.requiredEnergy?.count ?? 99;
                const cb = b.requiredEnergy?.count ?? 99;
                return ca !== cb ? ca - cb : ((a.type === 'CHARACTER' ? 0 : 1) - (b.type === 'CHARACTER' ? 0 : 1));
            });

            for (const c of pool) {
                while (mainIds.length < 50 && (counts[c.id] || 0) < 4) {
                    mainIds.push(c.id);
                    counts[c.id] = (counts[c.id] || 0) + 1;
                }
                if (mainIds.length >= 50) break;
            }
        }

        mainIds = mainIds.slice(0, 50);
        while (apIds.length < 3) apIds.push(DEFAULT_AP_ID);
        return { mainIds, apIds: apIds.slice(0, 3) };
    }

    class VirtualConnection {
        constructor(aiOpponent) {
            this.ai = aiOpponent;
            this.isVirtual = true;
            this.open = true;
            this.handlers = { open: [], data: [], close: [] };
        }
        on(event, cb) { if (this.handlers[event]) this.handlers[event].push(cb); }
        emitToPlayer(event, payload) {
            if (!this.open && event === 'data') return;
            (this.handlers[event] || []).forEach(cb => {
                try { cb(payload); } catch (e) { console.error('[AI VirtualConnection] error:', e); }
            });
        }
        send(data) {
            if (!this.open || !this.ai) return;
            setTimeout(() => { if (this.open && this.ai) this.ai.onReceiveFromPlayer(data); }, 0);
        }
        close() {
            if (!this.open) return;
            this.open = false;
            if (this.ai) this.ai.destroy();
            this.emitToPlayer('close');
        }
    }

    class UAAIOpponent {
        constructor(deckIds, apIds, difficulty = 'normal') {
            this.difficulty = difficulty;
            this.st = new window.UAAIState(deckIds, apIds);
            this.brain = window.UAAIBrain;
            this.vconn = new VirtualConnection(this);

            if (this.brain.decideMulligan(this.st.hand, this.difficulty)) {
                this.st.performMulligan();
            }
            this.st.setupLifeArea();

            this.destroyed = false;
            this.timers = new Set();
            this.turnWatchdog = null;
            this.waitWatchdog = null;
            this.coinFlipped = false;
            this.flowState = 'IDLE';
            this.pendingAttack = null;
        }

        schedule(fn, delay) {
            if (this.destroyed) return null;
            const id = setTimeout(() => {
                this.timers.delete(id);
                if (this.destroyed) return;
                try { fn(); } catch (err) {
                    console.error('[UAAIOpponent] error:', err);
                    if (this.flowState !== 'IDLE') this.endAiTurn();
                }
            }, delay);
            this.timers.add(id);
            return id;
        }

        destroy() {
            this.destroyed = true;
            this.timers.forEach(id => clearTimeout(id));
            this.timers.clear();
            if (this.turnWatchdog) { clearTimeout(this.turnWatchdog); this.turnWatchdog = null; }
            if (this.waitWatchdog) { clearTimeout(this.waitWatchdog); this.waitWatchdog = null; }
        }

        sendToPlayer(payload) {
            if (!this.destroyed && this.vconn.open) this.vconn.emitToPlayer('data', payload);
        }

        dispatchEffectOutputs(res) {
            if (!res) return;
            (res.logs || []).forEach(text => this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text }));
            (res.outgoingEvents || []).forEach(evt => this.sendToPlayer(evt));
        }

        syncBoard() { this.sendToPlayer(this.st.exportSyncBoardPayload()); }

        sendStartGame() {
            this.sendToPlayer({ type: 'START_GAME', deck: this.st.initialDeckIds, ap: this.st.initialApIds });
            this.syncBoard();
        }

        onReceiveFromPlayer(data) {
            if (!data || typeof data !== 'object' || this.destroyed) return;
            switch (data.type) {
                case 'START_GAME':
                    this.st.registerPlayerDeck(data.deck);
                    this.sendStartGame();
                    break;
                case 'REQUEST_START_GAME':
                    this.sendStartGame();
                    break;
                case 'SYNC_BOARD':
                    this.st.updatePlayerMirror(data);
                    if (!this.coinFlipped && this.st.playerMirror.lifeCount >= 7) {
                        this.coinFlipped = true;
                        this.schedule(() => this.runAutoCoinFlip(), 400);
                    }
                    break;
                case 'UPDATE_OPP_BP':
                    if (data.slotId && this.st.bpMods.hasOwnProperty(data.slotId)) {
                        this.st.bpMods[data.slotId] = parseInt(data.bp, 10) || 0;
                        this.syncBoard();
                    }
                    break;
                case 'FLIP_CARD': {
                    const c = this.st.life.find(x => x.networkId === data.id);
                    if (c) { c.isFlipped = !c.isFlipped; this.syncBoard(); }
                    break;
                }
                case 'SURRENDER':
                    this.destroy();
                    break;
                case 'ENGINE_EVENT':
                    this.handleEngineEvent(data);
                    break;
            }
        }

        runAutoCoinFlip() {
            if (this.destroyed || (window.uaEngine && window.uaEngine.isFirstPlayer !== null)) return;
            if (Math.random() < 0.5) {
                this.st.isFirstPlayer = false;
                this.st.turnNumber = 1;
                this.st.hasTakenFirstTurn = false;
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: '[人機對戰] 擲硬幣結果：由【玩家先攻】！' });
                if (window.uaEngine?.startMatchAsFirstPlayer) window.uaEngine.startMatchAsFirstPlayer();
            } else {
                this.st.isFirstPlayer = true;
                this.st.turnNumber = 1;
                this.st.hasTakenFirstTurn = true;
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: '[人機對戰] 擲硬幣結果：由【電腦先攻】！' });
                this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'SET_SECOND_PLAYER' });
                this.schedule(() => this.startAiTurn(), getStepDelay());
            }
        }

        handleEngineEvent(data) {
            switch (data.subType) {
                case 'SET_SECOND_PLAYER':
                    this.coinFlipped = true;
                    this.st.isFirstPlayer = false;
                    this.st.turnNumber = 1;
                    this.st.hasTakenFirstTurn = false;
                    this.flowState = 'IDLE';
                    break;
                case 'YOUR_TURN_START':
                    if (!this.st.hasTakenFirstTurn) { this.st.turnNumber = 1; this.st.hasTakenFirstTurn = true; }
                    else { this.st.turnNumber++; }
                    this.schedule(() => this.startAiTurn(), getStepDelay());
                    break;
                case 'ATTACK_DECLARED':
                    this.handlePlayerAttack(data);
                    break;
                case 'BLOCK_RESPONSE':
                    this.handlePlayerBlockResponse(data);
                    break;
                case 'TAKE_LIFE_DAMAGE':
                    this.handleTakeLifeDamage(data.count || 1);
                    break;
                case 'TRIGGER_RESOLUTION_DONE':
                    if (this.flowState === 'WAITING_TRIGGER') {
                        if (this.waitWatchdog) { clearTimeout(this.waitWatchdog); this.waitWatchdog = null; }
                        this.flowState = 'MY_TURN';
                        this.schedule(() => this.runNextAttack(), getStepDelay());
                    }
                    break;
                case 'FORCE_RETIRE_SLOT': {
                    const res = this.st.forceMoveSlotCard(data.slotId, 'OUTSIDE', this.brain, this.difficulty);
                    this.dispatchEffectOutputs(res);
                    this.syncBoard();
                    break;
                }
                case 'FORCE_BOUNCE_SLOT': this.st.forceMoveSlotCard(data.slotId, 'HAND'); this.syncBoard(); break;
                case 'FORCE_BOTTOM_SLOT': this.st.forceMoveSlotCard(data.slotId, 'DECK_BOTTOM'); this.syncBoard(); break;
                case 'FORCE_REMOVE_SLOT': this.st.forceMoveSlotCard(data.slotId, 'REMOVE'); this.syncBoard(); break;
                case 'FORCE_REST_SLOT': {
                    const top = this.st.getSlotTop(data.slotId);
                    if (top) { top.isRest = true; this.syncBoard(); }
                    break;
                }
                case 'FORCE_FREEZE_SLOT': {
                    const top = this.st.getSlotTop(data.slotId);
                    if (top) top.frozenNextTurn = true;
                    break;
                }
                case 'FORCE_DISCARD_HAND': {
                    const cnt = Math.min(Math.max(1, parseInt(data.count, 10) || 1), this.st.hand.length);
                    this.st.discardHandByIndices(this.brain.decideDiscard(this.st, this.st.hand, cnt, this.difficulty), 'OUTSIDE');
                    this.syncBoard();
                    break;
                }
                case 'FORCE_FLIP_LIFE': {
                    const fd = this.st.life.filter(c => c.isFlipped);
                    if (fd.length > 0) {
                        fd[fd.length - 1].isFlipped = false;
                        this.syncBoard();
                    }
                    break;
                }
                case 'FORCE_SEND_TO_LIFE_FACEUP': {
                    const arr = this.st.getSlotArray(data.slotId);
                    if (arr && arr.length > 0) {
                        const top = arr.pop();
                        while (arr.length > 0) {
                            const u = arr.pop();
                            u.isFlipped = false; u.isRest = false; u.isRaided = false;
                            this.st.outside.push(u);
                        }
                        if (this.st.bpMods.hasOwnProperty(data.slotId)) this.st.bpMods[data.slotId] = 0;
                        top.isFlipped = false; top.isRest = false; top.isRaided = false;
                        this.st.life.push(top);
                        this.syncBoard();
                    }
                    break;
                }
                case 'REVEAL_HAND_FOR_TOP_DECK': {
                    const list = this.st.hand.map(c => ({
                        networkId: c.networkId,
                        cardId: c.cardId,
                        name: c.def?.name || c.cardId,
                        imageUrl: c.def?.imageUrl || ''
                    }));
                    this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'OPP_HAND_REVEAL_RESPONSE', cards: list });
                    break;
                }
                case 'FORCE_HAND_CARD_TO_DECK_TOP': {
                    const idx = this.st.hand.findIndex(c => c.networkId === data.networkId);
                    if (idx !== -1) {
                        const [c] = this.st.hand.splice(idx, 1);
                        c.isFlipped = false; c.isRest = false;
                        this.st.deck.push(c);
                        this.syncBoard();
                    }
                    break;
                }
            }
        }

        // ==================== AI 回合流程 ====================
        startAiTurn() {
            if (this.destroyed) return;
            this.flowState = 'MY_TURN';
            if (this.turnWatchdog) clearTimeout(this.turnWatchdog);
            this.turnWatchdog = setTimeout(() => {
                if (!this.destroyed && this.flowState !== 'IDLE') this.endAiTurn();
            }, 60000);

            this.st.phase = '起始階段';
            this.sendToPlayer({ type: 'PHASE_BROADCAST', phase: '起始' });
            const res = this.st.beginTurn();
            this.syncBoard();
            if (res.deckOut) {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: '[人機對戰] 電腦牌庫已空，玩家獲勝！' });
                this.flowState = 'IDLE';
                return;
            }
            if (typeof this.brain.decideExtraDraw === 'function' && this.brain.decideExtraDraw(this.st, this.difficulty)) {
                const ed = this.st.performExtraDraw();
                if (ed && ed.ok) {
                    this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: '[電腦] 消耗 1 AP 發動「額外抽牌」！' });
                    this.syncBoard();
                }
            }
            this.schedule(() => this.runMovePhase(), getStepDelay());
        }

        runMovePhase() {
            this.st.phase = '移動階段';
            this.sendToPlayer({ type: 'PHASE_BROADCAST', phase: '移動' });
            this.schedule(() => this.tryOneMove(), getStepDelay());
        }

        tryOneMove() {
            const action = this.brain.decideMove(this.st, this.st.getLegalMoves(), this.difficulty);
            if (!action) { this.schedule(() => this.runMainPhase(), getStepDelay()); return; }
            this.st.applyMove(action);
            this.syncBoard();
            this.schedule(() => this.tryOneMove(), getStepDelay());
        }

        runMainPhase() {
            this.st.phase = '主要階段';
            this.sendToPlayer({ type: 'PHASE_BROADCAST', phase: '主要' });
            this.schedule(() => this.tryOnePlay(), getStepDelay());
        }

        tryOnePlay() {
            const action = this.brain.decidePlay(this.st, this.st.getLegalPlays(), this.difficulty);
            if (!action) { this.schedule(() => this.runBattlePhase(), getStepDelay()); return; }

            const res = this.st.applyPlay(action, this.brain, this.difficulty);
            const cname = action.card.def?.name || action.card.cardId;
            if (res.playedType === 'RAID') {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦] 發動突襲（レイド）【${cname}】！` });
            } else if (res.playedType === 'EVENT') {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦] 使用事件卡【${cname}】！` });
            } else if (res.playedType === 'ACTIVATE_MAIN') {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦] 發動【${cname}】的 [起動メイン]！` });
            } else {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦] 登場了【${cname}】。` });
            }

            this.dispatchEffectOutputs(res);
            this.syncBoard();
            this.schedule(() => this.tryOnePlay(), getStepDelay());
        }

        runBattlePhase() {
            this.st.phase = '戰鬥階段';
            this.sendToPlayer({ type: 'PHASE_BROADCAST', phase: '戰鬥' });
            this.schedule(() => this.runNextAttack(), getStepDelay());
        }

        runNextAttack() {
            if (this.destroyed) return;
            const choice = this.brain.decideAttack(this.st, this.st.getLegalAttackers(), this.difficulty);
            if (!choice) { this.schedule(() => this.endAiTurn(), getStepDelay()); return; }

            const atkInfo = this.st.applyAttackDeclare(choice.slotId, this.brain, this.difficulty);
            this.dispatchEffectOutputs(atkInfo);

            const attackId = 'ai_atk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            this.pendingAttack = { attackId, ...atkInfo };
            this.flowState = 'WAITING_BLOCK';
            this.syncBoard();

            this.sendToPlayer({
                type: 'ENGINE_EVENT',
                subType: 'ATTACK_DECLARED',
                attackId,
                attackerName: atkInfo.attacker.def?.name || '電腦角色',
                attackerBp: atkInfo.atkBp,
                unblockableMaxBp: atkInfo.unblockableMaxBp || 0,
                unblockableMinBp: atkInfo.unblockableMinBp || 0
            });

            if (this.waitWatchdog) clearTimeout(this.waitWatchdog);
            this.waitWatchdog = setTimeout(() => {
                if (!this.destroyed && this.flowState === 'WAITING_BLOCK') {
                    this.flowState = 'MY_TURN';
                    this.pendingAttack = null;
                    this.endAiTurn();
                }
            }, 35000);
        }

        handlePlayerBlockResponse(data) {
            if (this.flowState !== 'WAITING_BLOCK' || !this.pendingAttack) return;
            if (data.attackId && data.attackId !== this.pendingAttack.attackId) return;
            if (this.waitWatchdog) { clearTimeout(this.waitWatchdog); this.waitWatchdog = null; }

            const { atkBp, impact, damage } = this.pendingAttack;
            this.pendingAttack = null;

            if (data.blocked && data.blockerSlotId) {
                const defBp = typeof data.blockerBp === 'number' ? data.blockerBp : 0;
                const playerSlotId = data.blockerSlotId.replace('opp-', 'my-');
                const blockerDef = this.st.playerMirror.front[playerSlotId]?.def || null;
                const blockerNullifiesImpact = this.st.getCardKeywords({ def: blockerDef }).impactNullify;

                if (atkBp >= defBp) {
                    this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'FORCE_RETIRE_SLOT', slotId: playerSlotId });
                    if (impact > 0 && !blockerNullifiesImpact) {
                        this.flowState = 'WAITING_TRIGGER';
                        this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'TAKE_LIFE_DAMAGE', count: impact });
                        this.armTriggerWatchdog();
                        return;
                    }
                }
                this.flowState = 'MY_TURN';
                this.schedule(() => this.runNextAttack(), getStepDelay());
            } else {
                this.flowState = 'WAITING_TRIGGER';
                this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'TAKE_LIFE_DAMAGE', count: damage || 1 });
                this.armTriggerWatchdog();
            }
        }

        armTriggerWatchdog() {
            if (this.waitWatchdog) clearTimeout(this.waitWatchdog);
            this.waitWatchdog = setTimeout(() => {
                if (!this.destroyed && this.flowState === 'WAITING_TRIGGER') {
                    this.flowState = 'MY_TURN';
                    this.endAiTurn();
                }
            }, 35000);
        }

        endAiTurn() {
            if (this.destroyed) return;
            if (this.turnWatchdog) { clearTimeout(this.turnWatchdog); this.turnWatchdog = null; }
            if (this.waitWatchdog) { clearTimeout(this.waitWatchdog); this.waitWatchdog = null; }

            if (this.st.hand.length > 8) {
                const idxs = this.brain.decideDiscard(this.st, this.st.hand, this.st.hand.length - 8, this.difficulty);
                this.st.discardHandByIndices(idxs, 'REMOVE');
            }
            this.st.finalizeEndTurnState();
            this.flowState = 'IDLE';
            this.syncBoard();
            this.sendToPlayer({ type: 'PHASE_BROADCAST', phase: '結束' });
            this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'YOUR_TURN_START' });
        }

        handlePlayerAttack(data) {
            let blockers = this.st.getLegalBlockers(data.unblockableMaxBp || 0, data.unblockableMinBp || 0);
            if (data.unblockableByRaided) blockers = blockers.filter(b => !b.card?.isRaided);
            const decision = this.brain.decideBlock(this.st, data, blockers, this.difficulty);

            this.schedule(() => {
                if (decision.blocked && decision.slotId) {
                    const blk = this.st.applyBlock(decision.slotId);
                    this.syncBoard();
                    this.sendToPlayer({
                        type: 'ENGINE_EVENT',
                        subType: 'BLOCK_RESPONSE',
                        attackId: data.attackId,
                        blocked: true,
                        blockerSlotId: decision.slotId.replace('my-', 'opp-'),
                        blockerBp: blk ? blk.blockerBp : 0
                    });
                } else {
                    this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'BLOCK_RESPONSE', attackId: data.attackId, blocked: false });
                }
            }, Math.min(400, getStepDelay()));
        }

        handleTakeLifeDamage(count) {
            const flipCount = Math.min(Math.max(1, parseInt(count, 10) || 1), this.st.life.length);
            for (let i = 0; i < flipCount; i++) {
                const c = this.st.life.pop();
                const trigTxt = c.def?.triggerText || '';
                const trigType = c.def?.compiledRules?.trigger?.type || '';
                let activated = false;
                let extraNote = '';

                const getOppFrontSorted = (maxBp = Infinity, preferActive = false) => {
                    return ['my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4']
                        .map(s => ({ slotId: s, info: this.st.playerMirror?.front?.[s] }))
                        .filter(x => x.info && (x.info.effectiveBp || 0) <= maxBp)
                        .sort((a, b) => {
                            if (preferActive && (!!a.info.isRest !== !!b.info.isRest)) return a.info.isRest ? 1 : -1;
                            return (b.info.effectiveBp || 0) - (a.info.effectiveBp || 0);
                        });
                };

                if (trigType === 'SPECIAL' || trigTxt.includes('[スペシャル]')) {
                    c.isFlipped = false;
                    this.st.outside.push(c);
                    const targets = getOppFrontSorted(Infinity, false);
                    if (targets.length > 0) {
                        const t = targets[0];
                        this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'FORCE_RETIRE_SLOT', slotId: t.slotId });
                        if (this.st.playerMirror?.front) this.st.playerMirror.front[t.slotId] = null;
                        activated = true;
                        extraNote = `將玩家前線【${t.info.def?.name || '角色'}】退場！`;
                        this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦觸發] 發動 [スペシャル]（${c.def?.name || ''}）：${extraNote}` });
                    }
                } else if (trigType === 'RAID' || trigTxt.includes('[レイド]')) {
                    // 官方規則：加入手牌，或滿足必要能源且場上有合法突襲基底時可免費突襲
                    const en = this.st.calculateEnergy();
                    const reqCol = c.def?.requiredEnergy?.color || 'NONE';
                    const reqCnt = c.def?.requiredEnergy?.count || 0;
                    const ir = typeof this.st.getV3IR === 'function' ? this.st.getV3IR(c.def) : null;
                    const hasEn = reqCnt <= 0 || reqCol === 'NONE' || (ir?.allColor ? en.ALL : (en[reqCol] || 0)) >= reqCnt;
                    const raidSlots = hasEn
                        ? ['my-en-1', 'my-en-2', 'my-en-3', 'my-en-4', 'my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4']
                            .filter(s => this.st.canRaidOntoSlot(c.def, s))
                        : [];
                    if (raidSlots.length > 0) {
                        // 優先選能源線或最低 BP 基底突襲
                        raidSlots.sort((a, b) => {
                            const isEnA = a.startsWith('my-en-') ? 0 : 1;
                            const isEnB = b.startsWith('my-en-') ? 0 : 1;
                            if (isEnA !== isEnB) return isEnA - isEnB;
                            return (this.st.getSlotTop(a)?.def?.bp || 0) - (this.st.getSlotTop(b)?.def?.bp || 0);
                        });
                        const targetSlot = raidSlots[0];
                        const srcArr = this.st.getSlotArray(targetSlot);
                        c.isFlipped = false;
                        c.isRest = false;
                        c.isRaided = true;
                        srcArr.forEach(u => { u.isRest = false; });
                        srcArr.push(c);
                        if (this.st.bpMods.hasOwnProperty(targetSlot)) this.st.bpMods[targetSlot] = 0;

                        let finalSlot = targetSlot;
                        const emptyFront = ['my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4'].find(s => this.st.front[s].length === 0);
                        if (targetSlot.startsWith('my-en-') && emptyFront) {
                            this.st.front[emptyFront] = srcArr;
                            this.st.energy[targetSlot] = [];
                            finalSlot = emptyFront;
                        }
                        const effRes = this.st.resolveCardEffects(c, finalSlot, 'ON_PLAY', this.brain, this.difficulty);
                        this.dispatchEffectOutputs(effRes);
                        activated = true;
                        extraNote = `免費突襲登場【${c.def?.name || ''}】！`;
                        this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦觸發] 發動 [レイド]：${extraNote}` });
                    } else {
                        c.isFlipped = true;
                        this.st.hand.push(c);
                        activated = true;
                        extraNote = `將【${c.def?.name || ''}】加入手牌！`;
                    }
                } else if (trigType === 'COLOR' || trigTxt.includes('[カラー]')) {
                    c.isFlipped = false;
                    this.st.outside.push(c);
                    const col = c.def?.color || 'NONE';
                    if (col === 'RED') {
                        const targets = getOppFrontSorted(2500, false);
                        if (targets.length > 0) {
                            const t = targets[0];
                            this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'FORCE_RETIRE_SLOT', slotId: t.slotId });
                            if (this.st.playerMirror?.front) this.st.playerMirror.front[t.slotId] = null;
                            activated = true;
                            extraNote = `紅 Color 將【${t.info.def?.name || '角色'}】退場！`;
                        }
                    } else if (col === 'BLUE') {
                        const targets = getOppFrontSorted(3500, false);
                        if (targets.length > 0) {
                            const t = targets[0];
                            this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'FORCE_BOUNCE_SLOT', slotId: t.slotId });
                            if (this.st.playerMirror?.front) this.st.playerMirror.front[t.slotId] = null;
                            activated = true;
                            extraNote = `藍 Color 將【${t.info.def?.name || '角色'}】彈回手牌！`;
                        }
                    } else if (col === 'YELLOW') {
                        const targets = getOppFrontSorted(Infinity, true);
                        if (targets.length > 0) {
                            const t = targets[0];
                            this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'FORCE_REST_SLOT', slotId: t.slotId });
                            this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'FORCE_FREEZE_SLOT', slotId: t.slotId });
                            if (this.st.playerMirror?.front?.[t.slotId]) this.st.playerMirror.front[t.slotId].isRest = true;
                            activated = true;
                            extraNote = `黃 Color 將【${t.info.def?.name || '角色'}】橫置並凍結！`;
                        }
                    } else if (col === 'GREEN') {
                        const emptySlot = ['my-en-1', 'my-en-2', 'my-en-3', 'my-en-4', 'my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4']
                            .find(s => this.st.getSlotArray(s).length === 0);
                        const cands = this.st.hand
                            .filter(hc => hc.def?.type === 'CHARACTER' && hc.def.color === 'GREEN' && (hc.def.requiredEnergy?.count || 0) <= 2)
                            .sort((a, b) => (b.def?.bp || 0) - (a.def?.bp || 0));
                        if (emptySlot && cands.length > 0) {
                            const picked = cands[0];
                            const idx = this.st.hand.indexOf(picked);
                            if (idx !== -1) this.st.hand.splice(idx, 1);
                            picked.isFlipped = false; picked.isRest = false; picked.isRaided = false;
                            this.st.getSlotArray(emptySlot).push(picked);
                            const effRes = this.st.resolveCardEffects(picked, emptySlot, 'ON_PLAY', this.brain, this.difficulty);
                            this.dispatchEffectOutputs(effRes);
                            activated = true;
                            extraNote = `綠 Color 免費直立登場【${picked.def?.name || ''}】！`;
                        }
                    } else if (col === 'PURPLE') {
                        const emptySlot = ['my-en-1', 'my-en-2', 'my-en-3', 'my-en-4', 'my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4']
                            .find(s => this.st.getSlotArray(s).length === 0);
                        const cands = this.st.outside
                            .filter(oc => oc !== c && oc.def?.type === 'CHARACTER' && oc.def.color === 'PURPLE' && (oc.def.requiredEnergy?.count || 0) <= 2 && (oc.def.apCost ?? 1) === 1)
                            .sort((a, b) => (b.def?.bp || 0) - (a.def?.bp || 0));
                        if (emptySlot && cands.length > 0) {
                            const picked = cands[0];
                            const idx = this.st.outside.indexOf(picked);
                            if (idx !== -1) this.st.outside.splice(idx, 1);
                            picked.isFlipped = false; picked.isRest = true; picked.isRaided = false;
                            this.st.getSlotArray(emptySlot).push(picked);
                            const effRes = this.st.resolveCardEffects(picked, emptySlot, 'ON_PLAY', this.brain, this.difficulty);
                            this.dispatchEffectOutputs(effRes);
                            activated = true;
                            extraNote = `紫 Color 從場外復活【${picked.def?.name || ''}】！`;
                        }
                    }
                    if (activated && extraNote) {
                        this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦觸發] 發動 [カラー]：${extraNote}` });
                    }
                } else if (trigType === 'GET' || trigTxt.includes('[ゲット]')) {
                    c.isFlipped = true;
                    this.st.hand.push(c);
                    activated = true;
                } else if (trigType === 'DRAW' || trigTxt.includes('[ドロー]')) {
                    c.isFlipped = false;
                    this.st.outside.push(c);
                    if (this.st.deck.length > 0) {
                        const d = this.st.deck.pop();
                        d.isFlipped = true;
                        this.st.hand.push(d);
                    }
                    activated = true;
                } else if (trigType === 'FINAL' || trigTxt.includes('[ファイナル]')) {
                    c.isFlipped = false;
                    this.st.outside.push(c);
                    if (this.st.life.length === 0 && this.st.deck.length > 0) {
                        const topDeck = this.st.deck.pop();
                        topDeck.isFlipped = true;
                        this.st.life.push(topDeck);
                        activated = true;
                    }
                } else if (trigType === 'ACTIVE' || trigTxt.includes('[アクティブ]')) {
                    c.isFlipped = false;
                    this.st.outside.push(c);
                    const targetSlot = this.brain.decideActiveTriggerTarget(this.st);
                    if (targetSlot) {
                        const top = this.st.getSlotTop(targetSlot);
                        if (top) top.isRest = false;
                        this.st.bpMods[targetSlot] = (this.st.bpMods[targetSlot] || 0) + 3000;
                        activated = true;
                    }
                } else {
                    c.isFlipped = false;
                    this.st.outside.push(c);
                }

                this.sendToPlayer({
                    type: 'ENGINE_EVENT',
                    subType: 'OPP_TRIGGER_REVEAL',
                    cardName: c.def?.name || c.cardId,
                    imageUrl: c.def?.imageUrl || '',
                    triggerText: trigTxt || '無 Trigger',
                    activated
                });
            }

            this.syncBoard();
            this.schedule(() => {
                this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'TRIGGER_RESOLUTION_DONE' });
                if (this.st.life.length === 0) {
                    this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: '[人機對戰] 電腦生命區歸零，恭喜你獲得勝利！' });
                }
            }, Math.min(450, getStepDelay()));
        }
    }

    function populateAiDeckSelector() {
        const sel = document.getElementById('ai-deck-selector');
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '';

        const grpPlayer = document.createElement('optgroup');
        grpPlayer.label = '我的牌組';
        const decks = window.allDecks || {};
        Object.keys(decks).forEach(name => {
            const rawMain = Array.isArray(decks[name]) ? decks[name] : (decks[name]?.main || []);
            const opt = document.createElement('option');
            opt.value = `player:${name}`;
            opt.textContent = `${name} (${rawMain.length}張)`;
            grpPlayer.appendChild(opt);
        });
        sel.appendChild(grpPlayer);

        const tierList = window.NCHUCGC_TIER_LIST || [];
        if (tierList.length > 0) {
            const grpTier = document.createElement('optgroup');
            grpTier.label = '環境排表牌組（不足 50 張自動補齊）';
            tierList.forEach(d => {
                const opt = document.createElement('option');
                opt.value = `tier:${d.id}`;
                opt.textContent = `[${d.tier}] ${d.name}`;
                grpTier.appendChild(opt);
            });
            sel.appendChild(grpTier);
        }

        if (prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
        else if (tierList.length > 0) sel.value = `tier:${tierList[0].id}`;
    }

    function startAiMatch(deckOptionValue, difficultyOverride) {
        if (typeof window.connectVirtualOpponent !== 'function') return alert('系統尚未就緒，請重新整理網頁。');
        const sel = document.getElementById('ai-deck-selector');
        const diffSel = document.getElementById('ai-difficulty-selector');
        const { mainIds, apIds } = buildAiDeckFromSelection(deckOptionValue || sel?.value || '');
        if (mainIds.length === 0) return alert('無法建立電腦牌組，請確認卡庫已載入。');

        const ai = new UAAIOpponent(mainIds, apIds, difficultyOverride || diffSel?.value || 'normal');
        window.uaAiOpponent = ai;
        window.connectVirtualOpponent(ai.vconn);
        ai.vconn.emitToPlayer('open');
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn && !startBtn.disabled) startBtn.click();
    }

    window.uaAiManager = { populateDeckSelector: populateAiDeckSelector, startMatch: startAiMatch };
    window.addEventListener('load', () => {
        populateAiDeckSelector();
        document.getElementById('btn-start-ai-match')?.addEventListener('click', () => startAiMatch());
        document.getElementById('ai-deck-selector')?.addEventListener('focus', populateAiDeckSelector);
    });
})();
