/**
 * NCHUCGC Union Arena 人機對戰 — 通訊與流程控制層 (ua-ai-opponent.js)
 * 職責：
 * 1. 提供相容 PeerJS 的 VirtualConnection，將訊息收發導向本機 AI。
 * 2. 驅動 AI 回合階段排程、防卡死看門狗，並將狀態操作委派給 UAAIState、決策委派給 UAAIBrain。
 * 3. 負責對戰大廳「人機對戰」牌組選單、難度切換與開局啟動。
 */
(function () {
    const DEFAULT_AP_ID = 'UA44BT/EVA-1-AP03';

    function getStepDelay() {
        return typeof window.__AI_STEP_DELAY === 'number' ? window.__AI_STEP_DELAY : 550;
    }

    function getCardDefById(cardId) {
        if (!cardId) return null;
        if (window.UAUtils) {
            return window.UAUtils.getCardById(cardId) || window.UAUtils.getBaseCardById(cardId);
        }
        if (window.cardCatalogById) return window.cardCatalogById.get(cardId) || null;
        return null;
    }

    // 從玩家牌組或 tier-data.js 組出合法 50 張主牌 + 3 張 AP
    function buildAiDeckFromSelection(value) {
        if (window.UAUtils) window.UAUtils.ensureCatalogIndex();
        const catalog = typeof masterCardCatalog !== 'undefined' ? masterCardCatalog : [];
        let mainIds = [];
        let apIds = [];
        let fallbackSeries = null;
        let fallbackColor = null;

        if (value && value.startsWith('player:')) {
            const deckName = value.slice('player:'.length);
            const deckObj = window.allDecks && window.allDecks[deckName];
            if (deckObj) {
                const rawMain = Array.isArray(deckObj) ? deckObj : (deckObj.main || []);
                const rawAp = Array.isArray(deckObj) ? [] : (deckObj.ap || []);
                mainIds = rawMain.map(c => (typeof c === 'string' ? c : c?.id)).filter(Boolean);
                apIds = rawAp.map(c => (typeof c === 'string' ? c : c?.id)).filter(Boolean);
                const firstDef = getCardDefById(mainIds[0]);
                if (firstDef) {
                    fallbackSeries = firstDef.series;
                    fallbackColor = firstDef.color;
                }
            }
        } else if (value && value.startsWith('tier:')) {
            const tierId = value.slice('tier:'.length);
            const tierDeck = (window.NCHUCGC_TIER_LIST || []).find(d => d.id === tierId);
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
            if (pool.length < 15) {
                pool = catalog.filter(c => c && c.id && c.type === 'CHARACTER' && (!fallbackColor || c.color === fallbackColor));
            }
            if (pool.length === 0) {
                pool = catalog.filter(c => c && c.id && c.type === 'CHARACTER');
            }

            pool.sort((a, b) => {
                const ca = a.requiredEnergy?.count ?? 99;
                const cb = b.requiredEnergy?.count ?? 99;
                if (ca !== cb) return ca - cb;
                return (a.type === 'CHARACTER' ? 0 : 1) - (b.type === 'CHARACTER' ? 0 : 1);
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
        apIds = apIds.slice(0, 3);
        return { mainIds, apIds };
    }

    // ==================== 虛擬連線（相容 PeerJS DataConnection） ====================
    class VirtualConnection {
        constructor(aiOpponent) {
            this.ai = aiOpponent;
            this.isVirtual = true;
            this.open = true;
            this.handlers = { open: [], data: [], close: [] };
        }

        on(event, cb) {
            if (this.handlers[event]) this.handlers[event].push(cb);
        }

        emitToPlayer(event, payload) {
            if (!this.open && event === 'data') return;
            (this.handlers[event] || []).forEach(cb => {
                try { cb(payload); } catch (e) { console.error('[AI VirtualConnection] handler error:', e); }
            });
        }

        send(data) {
            if (!this.open || !this.ai) return;
            setTimeout(() => {
                if (this.open && this.ai) this.ai.onReceiveFromPlayer(data);
            }, 0);
        }

        close() {
            if (!this.open) return;
            this.open = false;
            if (this.ai) this.ai.destroy();
            this.emitToPlayer('close');
        }
    }

    // ==================== AI 流程控制器 ====================
    class UAAIOpponent {
        constructor(deckIds, apIds, difficulty = 'normal') {
            this.difficulty = difficulty;
            this.st = new window.UAAIState(deckIds, apIds);
            this.brain = window.UAAIBrain;
            this.vconn = new VirtualConnection(this);

            // AI 起手調度判斷與生命區配置
            if (this.brain.decideMulligan(this.st.hand, this.difficulty)) {
                this.st.performMulligan();
            }
            this.st.setupLifeArea();

            this.destroyed = false;
            this.timers = new Set();
            this.turnWatchdog = null;
            this.waitWatchdog = null;

            this.coinFlipped = false;
            this.flowState = 'IDLE'; // IDLE | MY_TURN | WAITING_BLOCK | WAITING_TRIGGER
            this.pendingAttack = null;
        }

        schedule(fn, delay) {
            if (this.destroyed) return null;
            const id = setTimeout(() => {
                this.timers.delete(id);
                if (this.destroyed) return;
                try {
                    fn();
                } catch (err) {
                    console.error('[UAAIOpponent] step error:', err);
                    if (this.flowState !== 'IDLE') this.endAiTurn();
                }
            }, delay);
            this.timers.add(id);
            return id;
        }

        clearAllTimers() {
            this.timers.forEach(id => clearTimeout(id));
            this.timers.clear();
            if (this.turnWatchdog) { clearTimeout(this.turnWatchdog); this.turnWatchdog = null; }
            if (this.waitWatchdog) { clearTimeout(this.waitWatchdog); this.waitWatchdog = null; }
        }

        destroy() {
            this.destroyed = true;
            this.clearAllTimers();
        }

        sendToPlayer(payload) {
            if (this.destroyed || !this.vconn.open) return;
            this.vconn.emitToPlayer('data', payload);
        }

        syncBoard() {
            this.sendToPlayer(this.st.exportSyncBoardPayload());
        }

        sendStartGame() {
            this.sendToPlayer({
                type: 'START_GAME',
                deck: this.st.initialDeckIds,
                ap: this.st.initialApIds
            });
            this.syncBoard();
        }

        // ==================== 接收玩家端訊息 ====================
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
                    const card = this.st.life.find(c => c.networkId === data.id);
                    if (card) {
                        card.isFlipped = !card.isFlipped;
                        this.syncBoard();
                    }
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
            if (this.destroyed) return;
            if (window.uaEngine && window.uaEngine.isFirstPlayer !== null) return;

            const playerFirst = Math.random() < 0.5;
            if (playerFirst) {
                this.st.isFirstPlayer = false;
                this.st.turnNumber = 1;
                this.st.hasTakenFirstTurn = false;
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: '[人機對戰] 擲硬幣結果：由【玩家先攻】！' });
                if (window.uaEngine && typeof window.uaEngine.startMatchAsFirstPlayer === 'function') {
                    window.uaEngine.startMatchAsFirstPlayer();
                }
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
                    if (!this.st.hasTakenFirstTurn) {
                        this.st.turnNumber = 1;
                        this.st.hasTakenFirstTurn = true;
                    } else {
                        this.st.turnNumber++;
                    }
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

                case 'FORCE_RETIRE_SLOT':
                    this.st.forceMoveSlotCard(data.slotId, 'OUTSIDE');
                    this.syncBoard();
                    break;
                case 'FORCE_BOUNCE_SLOT':
                    this.st.forceMoveSlotCard(data.slotId, 'HAND');
                    this.syncBoard();
                    break;
                case 'FORCE_BOTTOM_SLOT':
                    this.st.forceMoveSlotCard(data.slotId, 'DECK_BOTTOM');
                    this.syncBoard();
                    break;
                case 'FORCE_REMOVE_SLOT':
                    this.st.forceMoveSlotCard(data.slotId, 'REMOVE');
                    this.syncBoard();
                    break;
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
                    const idxs = this.brain.decideDiscard(this.st, this.st.hand, cnt, this.difficulty);
                    this.st.discardHandByIndices(idxs, 'OUTSIDE');
                    this.syncBoard();
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
                if (!this.destroyed && this.flowState !== 'IDLE') {
                    console.warn('[UAAIOpponent] Turn watchdog triggered, forcing end turn.');
                    this.endAiTurn();
                }
            }, 60000);

            this.st.phase = '起始階段';
            this.sendToPlayer({ type: 'PHASE_BROADCAST', phase: '起始' });

            const res = this.st.beginTurn();
            this.syncBoard();
            if (res.deckOut) {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: '[人機對戰] 電腦牌庫已空無法抽牌，玩家獲勝！' });
                this.flowState = 'IDLE';
                return;
            }

            this.schedule(() => this.runMovePhase(), getStepDelay());
        }

        runMovePhase() {
            this.st.phase = '移動階段';
            this.sendToPlayer({ type: 'PHASE_BROADCAST', phase: '移動' });
            this.schedule(() => this.tryOneMove(), getStepDelay());
        }

        tryOneMove() {
            const legalMoves = this.st.getLegalMoves();
            const action = this.brain.decideMove(this.st, legalMoves, this.difficulty);
            if (!action) {
                this.schedule(() => this.runMainPhase(), getStepDelay());
                return;
            }
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
            const legalPlays = this.st.getLegalPlays();
            const action = this.brain.decidePlay(this.st, legalPlays, this.difficulty);
            if (!action) {
                this.schedule(() => this.runBattlePhase(), getStepDelay());
                return;
            }

            const result = this.st.applyPlay(action);
            const cname = action.card.def?.name || action.card.cardId;

            if (result && result.eventKind === 'RETIRE_OPP_FRONT' && result.targetSlotId) {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦] 使用事件卡【${cname}】，指定退場我方前線角色！` });
                this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'FORCE_RETIRE_SLOT', slotId: result.targetSlotId });
                // 同步更新鏡像避免同回合重複選同一目標
                this.st.playerMirror.front[result.targetSlotId] = null;
            } else if (result && result.eventKind === 'DRAW') {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦] 使用事件卡【${cname}】，抽取 ${result.amount} 張牌。` });
            } else if (result && result.eventKind === 'ACTIVATE_AP') {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦] 使用事件卡【${cname}】，將 1 張 AP 轉為活動！` });
            } else if (result && result.playedType === 'RAID') {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦] 發動突襲（レイド）【${cname}】！` });
            } else {
                this.sendToPlayer({ type: 'CHAT_MSG', isSystem: true, text: `[電腦] 登場了【${cname}】。` });
            }

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
            const attackers = this.st.getLegalAttackers();
            const choice = this.brain.decideAttack(this.st, attackers, this.difficulty);
            if (!choice) {
                this.schedule(() => this.endAiTurn(), getStepDelay());
                return;
            }

            const atkInfo = this.st.applyAttackDeclare(choice.slotId);
            if (!atkInfo) {
                this.schedule(() => this.endAiTurn(), getStepDelay());
                return;
            }

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
                unblockableMaxBp: 0
            });

            if (this.waitWatchdog) clearTimeout(this.waitWatchdog);
            this.waitWatchdog = setTimeout(() => {
                if (!this.destroyed && this.flowState === 'WAITING_BLOCK') {
                    console.warn('[UAAIOpponent] Waiting block timeout.');
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
                    this.sendToPlayer({
                        type: 'ENGINE_EVENT',
                        subType: 'FORCE_RETIRE_SLOT',
                        slotId: playerSlotId
                    });
                    if (impact > 0 && !blockerNullifiesImpact) {
                        this.flowState = 'WAITING_TRIGGER';
                        this.sendToPlayer({
                            type: 'ENGINE_EVENT',
                            subType: 'TAKE_LIFE_DAMAGE',
                            count: impact
                        });
                        this.armTriggerWatchdog();
                        return;
                    }
                }
                this.flowState = 'MY_TURN';
                this.schedule(() => this.runNextAttack(), getStepDelay());
            } else {
                this.flowState = 'WAITING_TRIGGER';
                this.sendToPlayer({
                    type: 'ENGINE_EVENT',
                    subType: 'TAKE_LIFE_DAMAGE',
                    count: damage || 1
                });
                this.armTriggerWatchdog();
            }
        }

        armTriggerWatchdog() {
            if (this.waitWatchdog) clearTimeout(this.waitWatchdog);
            this.waitWatchdog = setTimeout(() => {
                if (!this.destroyed && this.flowState === 'WAITING_TRIGGER') {
                    console.warn('[UAAIOpponent] Waiting trigger timeout.');
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
                const excess = this.st.hand.length - 8;
                const idxs = this.brain.decideDiscard(this.st, this.st.hand, excess, this.difficulty);
                this.st.discardHandByIndices(idxs, 'REMOVE');
            }

            this.st.finalizeEndTurnState();
            this.flowState = 'IDLE';
            this.syncBoard();
            this.sendToPlayer({ type: 'PHASE_BROADCAST', phase: '結束' });
            this.sendToPlayer({ type: 'ENGINE_EVENT', subType: 'YOUR_TURN_START' });
        }

        // ==================== 玩家回合中：防禦與生命傷害 ====================
        handlePlayerAttack(data) {
            const blockers = this.st.getLegalBlockers(data.unblockableMaxBp || 0);
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
                    this.sendToPlayer({
                        type: 'ENGINE_EVENT',
                        subType: 'BLOCK_RESPONSE',
                        attackId: data.attackId,
                        blocked: false
                    });
                }
            }, Math.min(400, getStepDelay()));
        }

        handleTakeLifeDamage(count) {
            const dmg = Math.max(1, Math.min(7, parseInt(count, 10) || 1));
            const flipCount = Math.min(dmg, this.st.life.length);

            for (let i = 0; i < flipCount; i++) {
                const c = this.st.life.pop();
                const trigTxt = c.def?.triggerText || '';
                const trigType = c.def?.compiledRules?.trigger?.type || '';
                let activated = false;

                if (trigType === 'GET' || trigTxt.includes('[ゲット]')) {
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
                    if (typeof window.showCenterAlert === 'function') {
                        window.showCenterAlert('🏆', '對戰勝利！', '擊敗電腦對手', '#6fb897');
                    }
                }
            }, Math.min(450, getStepDelay()));
        }
    }

    // ==================== 大廳 UI 整合 ====================
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

        if (prev && Array.from(sel.options).some(o => o.value === prev)) {
            sel.value = prev;
        } else if (tierList.length > 0) {
            sel.value = `tier:${tierList[0].id}`;
        }
    }

    function startAiMatch(deckOptionValue, difficultyOverride) {
        if (typeof window.connectVirtualOpponent !== 'function') {
            alert('系統尚未就緒，請重新整理網頁。');
            return;
        }
        const sel = document.getElementById('ai-deck-selector');
        const diffSel = document.getElementById('ai-difficulty-selector');
        const chosen = deckOptionValue || (sel ? sel.value : '');
        const difficulty = difficultyOverride || (diffSel ? diffSel.value : 'normal');
        const { mainIds, apIds } = buildAiDeckFromSelection(chosen);

        if (mainIds.length === 0) {
            alert('無法建立電腦牌組，請確認卡庫已載入。');
            return;
        }

        const ai = new UAAIOpponent(mainIds, apIds, difficulty);
        window.uaAiOpponent = ai;
        window.connectVirtualOpponent(ai.vconn);

        ai.vconn.emitToPlayer('open');
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn && !startBtn.disabled) {
            startBtn.click();
        }
    }

    window.uaAiManager = {
        populateDeckSelector: populateAiDeckSelector,
        startMatch: startAiMatch
    };

    window.addEventListener('load', () => {
        populateAiDeckSelector();
        const btn = document.getElementById('btn-start-ai-match');
        if (btn) btn.addEventListener('click', () => startAiMatch());
        const sel = document.getElementById('ai-deck-selector');
        if (sel) sel.addEventListener('focus', populateAiDeckSelector);
    });
})();
