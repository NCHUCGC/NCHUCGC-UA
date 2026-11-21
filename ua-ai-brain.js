/**
 * NCHUCGC Union Arena 人機對戰 — 純函式決策層 (ua-ai-brain.js)
 * 職責：無狀態、不碰 DOM、不修改 state，僅依難度 ('normal' | 'random') 回傳最佳行動。
 */
(function () {
    function pickRandom(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function getEnergyOccupiedCount(state) {
        return ['my-en-1', 'my-en-2', 'my-en-3', 'my-en-4'].filter(s => state.energy[s].length > 0).length;
    }

    function getFrontOccupiedCount(state) {
        return ['my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4'].filter(s => state.front[s].length > 0).length;
    }

    function getMaxPlayerFrontBp(state) {
        let maxBp = 0;
        const f = state.playerMirror?.front || {};
        Object.values(f).forEach(p => { if (p && p.effectiveBp > maxBp) maxBp = p.effectiveBp; });
        return maxBp;
    }

    const UAAIBrain = {
        // 起手沒有任何 0 費或 1 費角色時執行調度
        decideMulligan(handCards, difficulty = 'normal') {
            if (difficulty === 'random') return false;
            const hasLowCost = handCards.some(c =>
                c.def && c.def.type === 'CHARACTER' && (c.def.requiredEnergy?.count ?? 99) <= 1
            );
            return !hasLowCost;
        },

        // 移動階段：回傳單一移動動作，或 null 結束移動
        decideMove(state, legalMoves, difficulty = 'normal') {
            if (!legalMoves || legalMoves.length === 0) return null;
            const enOccupied = getEnergyOccupiedCount(state);

            if (difficulty === 'random') {
                if (enOccupied <= 1 || Math.random() >= 0.5) return null;
                return pickRandom(legalMoves);
            }

            // 一般 AI：至少保留 2 格能源線（T1~T2 優先穩住產能），優先把高 BP 且非雙球產能角移上前線
            const minKeepEnergy = state.turnNumber <= 2 ? 3 : 2;
            if (enOccupied <= minKeepEnergy) return null;

            const scored = legalMoves.map(m => {
                const bp = m.card.def?.bp || 0;
                const gen = m.card.def?.generatedEnergy?.count ?? 1;
                // 高 BP 加分，雙球產能角大幅扣分（盡量留在能源線）
                const score = bp - (gen >= 2 ? 2500 : 0);
                return { move: m, score };
            }).filter(x => x.score >= 1500);

            if (scored.length === 0) return null;
            scored.sort((a, b) => b.score - a.score);
            return scored[0].move;
        },

        // 主要階段：回傳單一出牌/突襲/簡單事件動作，或 null 結束主要階段
        decidePlay(state, legalPlays, difficulty = 'normal') {
            if (!legalPlays || legalPlays.length === 0) return null;
            if (difficulty === 'random') {
                const act = pickRandom(legalPlays);
                if (act && act.type === 'EVENT' && act.targets && act.targets.length > 0) {
                    act.chosenTargetSlotId = pickRandom(act.targets).slotId;
                }
                return act;
            }

            const enOccupied = getEnergyOccupiedCount(state);
            const flOccupied = getFrontOccupiedCount(state);
            const needEnergy = enOccupied < 3;

            let bestAction = null;
            let bestScore = -Infinity;

            legalPlays.forEach(act => {
                let score = 0;
                const d = act.card.def || {};
                const bp = d.bp || 0;
                const req = d.requiredEnergy?.count || 0;
                const gen = d.generatedEnergy?.count ?? 1;

                if (act.type === 'EVENT') {
                    if (act.eventEffect.kind === 'ACTIVATE_AP') {
                        // 有多餘手牌且 AP 不足時才開 Final
                        score = state.hand.length >= 3 ? 6500 : -1000;
                    } else if (act.eventEffect.kind === 'RETIRE_OPP_FRONT') {
                        // 優先炸掉玩家前線最高 BP 目標
                        const sortedTargets = [...act.targets].sort((a, b) => b.effectiveBp - a.effectiveBp);
                        const bestTarget = sortedTargets[0];
                        act.chosenTargetSlotId = bestTarget.slotId;
                        score = 5000 + bestTarget.effectiveBp;
                    } else if (act.eventEffect.kind === 'DRAW') {
                        score = state.hand.length <= 4 ? 4200 : 1500;
                    }
                } else if (act.type === 'RAID') {
                    // 突襲通常能立刻活動攻擊，優先度極高
                    score = 7000 + bp + (act.moveToFront ? 800 : 0);
                } else if (act.type === 'NORMAL') {
                    if (act.line === 'ENERGY') {
                        if (needEnergy) {
                            score = 6000 + (gen >= 2 ? 1500 : 0) - req * 200;
                        } else {
                            // 能源線已有 3 格以上，僅在雙球或場域時優先放能源線
                            score = 1800 + (gen >= 2 ? 2000 : 0) + (d.type === 'FIELD' ? 1200 : 0);
                        }
                    } else if (act.line === 'FRONT') {
                        if (needEnergy && state.turnNumber === 1) {
                            score = 1000 + bp;
                        } else {
                            score = 3500 + bp + (flOccupied < 2 ? 800 : 0);
                        }
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestAction = act;
                }
            });

            return bestScore > 0 ? bestAction : null;
        },

        // 戰鬥階段：決定下一個攻擊者（低 BP 先攻消耗防禦者，高 BP / 帶衝擊或傷害者後攻收頭）
        decideAttack(state, legalAttackers, difficulty = 'normal') {
            if (!legalAttackers || legalAttackers.length === 0) return null;
            if (difficulty === 'random') return pickRandom(legalAttackers);

            const sorted = [...legalAttackers].sort((a, b) => {
                const finA = (a.impact > 0 ? 1 : 0) + (a.damage > 1 ? 1 : 0);
                const finB = (b.impact > 0 ? 1 : 0) + (b.damage > 1 ? 1 : 0);
                if (finA !== finB) return finA - finB;
                return a.effectiveBp - b.effectiveBp;
            });
            return sorted[0];
        },

        // 防禦階段：決定是否防禦及用哪一隻防禦
        decideBlock(state, attackInfo, legalBlockers, difficulty = 'normal') {
            if (!legalBlockers || legalBlockers.length === 0) return { blocked: false };

            if (difficulty === 'random') {
                if (Math.random() < 0.5) return { blocked: true, slotId: pickRandom(legalBlockers).slotId };
                return { blocked: false };
            }

            const atkBp = attackInfo.attackerBp || 0;
            // 1. 優先用 BP 嚴格大於攻擊者的「最小 BP」角色無傷擋下
            const winners = legalBlockers
                .filter(b => b.effectiveBp > atkBp)
                .sort((a, b) => a.effectiveBp - b.effectiveBp);
            if (winners.length > 0) {
                return { blocked: true, slotId: winners[0].slotId };
            }

            // 2. 生命危機（<= 2 滴血）時，用最低 BP 角色擋刀保命
            if (state.life.length <= 2) {
                const cheapest = [...legalBlockers].sort((a, b) => a.effectiveBp - b.effectiveBp)[0];
                return { blocked: true, slotId: cheapest.slotId };
            }

            // 3. 否則不白白送掉前線角色
            return { blocked: false };
        },

        // 棄牌選擇：優先棄掉高費卡手牌或重複低 BP 牌
        decideDiscard(state, handCards, count, difficulty = 'normal') {
            const indices = handCards.map((_, i) => i);
            if (difficulty === 'random') {
                const res = [];
                while (res.length < count && indices.length > 0) {
                    const pick = Math.floor(Math.random() * indices.length);
                    res.push(indices.splice(pick, 1)[0]);
                }
                return res;
            }

            const enAll = state.calculateEnergy().ALL;
            const scored = handCards.map((c, idx) => {
                const req = c.def?.requiredEnergy?.count ?? 0;
                const bp = c.def?.bp || 0;
                // 遠超目前產能的高費卡優先棄掉
                const unplayablePenalty = req > enAll + 2 ? 5000 : 0;
                const score = unplayablePenalty + req * 300 - bp * 0.2;
                return { idx, score };
            });
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, count).map(x => x.idx);
        },

        // 生命區 ACTIVE Trigger 目標選擇：優先選前線休息角色，其次選前線任意角色
        decideActiveTriggerTarget(state) {
            const frontRested = ['my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4'].filter(s => {
                const top = state.getSlotTop(s);
                return top && top.isRest;
            });
            if (frontRested.length > 0) return frontRested[0];
            const frontAny = ['my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4'].filter(s => state.getSlotTop(s));
            return frontAny.length > 0 ? frontAny[0] : null;
        }
    };

    window.UAAIBrain = UAAIBrain;
})();
