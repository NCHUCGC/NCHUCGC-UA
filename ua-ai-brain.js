/**
 * NCHUCGC Union Arena 人機對戰 — 戰術評分與決策層 (ua-ai-brain.js)
 * 職責：評估卡片效果價值（含 v3 IR 語義）、能源曲線規劃、突襲目標擇優、
 *       斬殺線計算與攻擊排序、衝擊無效／傷害2防禦判斷、智慧棄牌。
 * 難度等級：'random'（隨機）｜'normal'（一般）｜'hard'（困難：進階戰術）
 */
(function () {
    const FRONT_SLOTS = ['my-fl-1', 'my-fl-2', 'my-fl-3', 'my-fl-4'];
    const ENERGY_SLOTS = ['my-en-1', 'my-en-2', 'my-en-3', 'my-en-4'];

    function pickRandom(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function getEnergyOccupiedCount(state) {
        return ENERGY_SLOTS.filter(s => state.energy[s].length > 0).length;
    }

    function getFrontOccupiedCount(state) {
        return FRONT_SLOTS.filter(s => state.front[s].length > 0).length;
    }

    function getPlayerFrontList(state) {
        return FRONT_SLOTS.map(s => state.playerMirror?.front?.[s]).filter(Boolean);
    }

    function getTargetEnergyNeeded(state) {
        let maxReq = 3;
        state.hand.forEach(c => {
            const req = c.def?.requiredEnergy?.count || 0;
            if (req > maxReq && req <= 6) maxReq = req;
        });
        return maxReq;
    }

    function isRaidBaseForHand(state, cardDef) {
        if (!cardDef || cardDef.type !== 'CHARACTER') return false;
        return state.hand.some(hc => {
            const rc = hc.def?.compiledRules?.raidCondition;
            if (!rc) return false;
            if (rc.type === 'NAME') return (cardDef.name || '').includes(rc.target);
            if (rc.type === 'TRAIT') return Array.isArray(cardDef.traits) && cardDef.traits.includes(rc.target);
            return false;
        });
    }

    function countPlayableInHand(state) {
        const enAll = state.calculateEnergy().ALL;
        return state.hand.filter(c => (c.def?.requiredEnergy?.count || 0) <= enAll).length;
    }

    const UAAIBrain = {
        estimateV3StepsValue(state, steps) {
            if (!Array.isArray(steps) || steps.length === 0) return 0;
            const oppFront = getPlayerFrontList(state);
            let score = 0;
            let lastTargetOwner = null;
            let lastMaxBp = null;

            for (const s of steps) {
                if (!s) continue;
                switch (s.op) {
                    case 'CHOOSE_TARGET':
                        lastTargetOwner = s.owner || 'OPP';
                        lastMaxBp = s.filter?.maxBp ?? s.dynamicMaxBp?.base ?? null;
                        break;
                    case 'DRAW':
                        score += (s.count || 1) * (state.hand.length <= 4 ? 1350 : 750);
                        break;
                    case 'DISCARD_HAND':
                        score -= (s.count || 1) * 450;
                        break;
                    case 'ACTIVATE_AP': {
                        const restedAp = state.ap.filter(a => a.unlocked && a.isRest).length;
                        const playable = countPlayableInHand(state);
                        score += (restedAp > 0 && playable >= 2) ? 2400 : -1500;
                        break;
                    }
                    case 'RETIRE':
                    case 'BOUNCE_SELECTED':
                    case 'TO_DECK_BOTTOM':
                    case 'REMOVE_SELECTED':
                    case 'MOVE_OPP_FRONT_TO_ENERGY':
                        if (lastTargetOwner === 'OPP' || s.target === 'SELECTED') {
                            const hit = oppFront.find(p => lastMaxBp == null || (p.effectiveBp || 0) <= lastMaxBp);
                            score += hit ? (2800 + (hit.effectiveBp || 0) * 0.65) : -1800;
                        }
                        break;
                    case 'RETIRE_ALL':
                        score += oppFront.length > 0 ? oppFront.length * 2500 : -1800;
                        break;
                    case 'MODIFY_BP':
                    case 'MODIFY_BP_ALL':
                        if ((s.amount || 0) < 0) {
                            score += oppFront.length > 0 ? Math.abs(s.amount) * 0.95 : -1200;
                        } else if ((s.amount || 0) > 0) {
                            score += (s.amount || 0) * 0.65;
                        }
                        break;
                    case 'SET_REST':
                    case 'FREEZE':
                        if (lastTargetOwner === 'OPP') {
                            score += oppFront.some(p => !p.isRest) ? 1500 : -600;
                        }
                        break;
                    case 'SET_ACTIVE':
                        score += 1300;
                        break;
                    case 'GRANT_MODIFIER':
                    case 'GRANT_MODIFIER_ALL':
                        score += 1200;
                        break;
                    case 'LOOK_TOP':
                    case 'RECOVER_FROM_OUTSIDE':
                    case 'RECOVER_RAID_BASE_TO_HAND':
                        score += 1000;
                        break;
                    case 'SPECIAL_SUMMON':
                    case 'SPECIAL_SUMMON_OR_RAID':
                    case 'REVIVE_RAID_BASE':
                    case 'REVEAL_TOP_PLAY_OR_HAND':
                        score += 2400;
                        break;
                    case 'ADD_AP_DISCOUNT':
                        score += 1100;
                        break;
                    case 'IF': {
                        const ok = typeof state.evalV3Cond === 'function' ? state.evalV3Cond(s.condition) : true;
                        score += this.estimateV3StepsValue(state, ok ? s.thenSteps : (s.elseSteps || []));
                        break;
                    }
                    case 'OPTIONAL_COST':
                    case 'TRY_COST_THEN': {
                        const sub = this.estimateV3StepsValue(state, s.thenSteps);
                        if (sub > 600) score += sub * 0.55;
                        break;
                    }
                    case 'CHOOSE_BRANCH': {
                        const best = Math.max(0, ...(s.branches || []).map(b => this.estimateV3StepsValue(state, b.steps)));
                        score += best;
                        break;
                    }
                }
            }
            return score;
        },

        estimateActionsValue(state, actions) {
            if (!actions || actions.length === 0) return 0;
            const oppFront = getPlayerFrontList(state);
            let score = 0;
            let lastSelectOwner = null;
            let lastSelectMaxBp = null;

            for (const act of actions) {
                if (act.type === 'SELECT_TARGET') {
                    lastSelectOwner = act.owner;
                    lastSelectMaxBp = act.maxBp;
                } else if (act.type === 'DRAW') {
                    score += (act.amount || 1) * (state.hand.length <= 4 ? 1300 : 700);
                } else if (act.type === 'DISCARD_HAND') {
                    score -= (act.count || 1) * 500;
                } else if (act.type === 'ACTIVATE_AP') {
                    const restedAp = state.ap.filter(a => a.unlocked && a.isRest).length;
                    score += restedAp > 0 && state.hand.length >= 2 ? 2200 : -1500;
                } else if (act.type === 'RETIRE_TARGET' || act.type === 'BOUNCE_TO_HAND' || act.type === 'SEND_TARGET_TO_BOTTOM' || act.type === 'SEND_TARGET_TO_REMOVE') {
                    if (lastSelectOwner === 'OPP') {
                        const hit = oppFront.find(p => lastSelectMaxBp == null || p.effectiveBp <= lastSelectMaxBp);
                        score += hit ? (2600 + hit.effectiveBp * 0.6) : -2000;
                    }
                } else if (act.type === 'MODIFY_BP') {
                    if (act.amount < 0 && lastSelectOwner === 'OPP') {
                        score += oppFront.length > 0 ? Math.abs(act.amount) * 0.9 : -1500;
                    } else if (act.amount > 0) {
                        score += act.amount * 0.6;
                    }
                } else if (act.type === 'SET_REST' || act.type === 'FREEZE_TARGET') {
                    if (lastSelectOwner === 'OPP') {
                        const activeOpp = oppFront.some(p => !p.isRest);
                        score += activeOpp ? 1400 : -800;
                    }
                } else if (act.type === 'GRANT_KEYWORD') {
                    score += 1100;
                } else if (act.type === 'LOOK_TOP_DECK' || act.type === 'RECOVER_FROM_OUTSIDE' || act.type === 'LOOK_AND_ARRANGE_TOP') {
                    score += 900;
                } else if (act.type === 'SPECIAL_SUMMON') {
                    score += 2200;
                } else if (act.type === 'OPP_DISCARD_HAND') {
                    score += (act.count || 1) * 1400;
                } else if (act.type === 'BOOST_GENERATED_ENERGY') {
                    score += (state.calculateEnergy().ALL < getTargetEnergyNeeded(state)) ? 1600 : 200;
                } else if (act.type === 'PUT_DECK_TOP_UNDER_SELF') {
                    score += 700;
                } else if (act.type === 'CHOOSE_ONE_BRANCH') {
                    const bestOpt = Math.max(0, ...(act.options || []).map(o => this.estimateActionsValue(state, o.actions)));
                    score += bestOpt;
                } else if (act.type === 'OPTIONAL_COST_BRANCH') {
                    const subVal = this.estimateActionsValue(state, act.thenActions);
                    if (subVal > 500) score += subVal * 0.5;
                }
            }
            return score;
        },

        estimateOnPlayValue(state, def, isRaided) {
            if (!def) return 0;
            let total = 0;
            const ir = typeof state.getV3IR === 'function' ? state.getV3IR(def) : null;
            if (ir && Array.isArray(ir.onPlay) && ir.onPlay.length > 0) {
                for (const ab of ir.onPlay) {
                    if (ab.requireRaided && !isRaided) continue;
                    total += this.estimateV3StepsValue(state, ab.steps);
                }
                return total;
            }
            const abilities = state.parseAbilities(def).filter(ab =>
                ab.timings.includes('ON_PLAY') && (!ab.requireRaided || isRaided)
            );
            abilities.forEach(ab => {
                total += this.estimateActionsValue(state, state.compileActions(ab.rawText));
            });
            return total;
        },

        estimateContinuousBonus(state, card, line) {
            if (!card || !card.def || typeof state.evalV3Continuous !== 'function') return 0;
            const fakeSlot = line === 'FRONT' ? 'my-fl-1' : 'my-en-1';
            const v3 = state.evalV3Continuous(card, fakeSlot);
            let bonus = (v3.bpDelta || 0) * 0.85;
            if (line === 'FRONT') {
                bonus += (v3.impact || 0) * 1100;
                bonus += Math.max(0, (v3.damage || 1) - 1) * 1100;
                if (v3.doubleAttack) bonus += 1600;
                if (v3.doubleBlock) bonus += 800;
                if (v3.snipe) bonus += 900;
                if (v3.impactNullify) bonus += 700;
                if (v3.cannotAttack) bonus -= 1800;
                if (v3.cannotBlock) bonus -= 600;
            } else {
                bonus += (v3.genEnergyBonus || 0) * 1200;
            }
            return bonus;
        },

        decideMulligan(handCards, difficulty = 'normal') {
            if (difficulty === 'random') return false;
            const zeroChars = handCards.filter(c =>
                c.def && (c.def.type === 'CHARACTER' || c.def.type === 'FIELD') && (c.def.requiredEnergy?.count ?? 99) === 0
            );
            if (zeroChars.length === 0) return true;
            if (difficulty === 'hard') {
                const lowCurve = handCards.filter(c =>
                    c.def && (c.def.type === 'CHARACTER' || c.def.type === 'FIELD') && (c.def.requiredEnergy?.count ?? 99) <= 2
                ).length;
                const highBricks = handCards.filter(c => (c.def?.requiredEnergy?.count ?? 0) >= 4).length;
                // 只有 1 張 0 費且完全沒有 1-2 費銜接、手牌卡死超過 4 張高費 → 重抽找順手曲線
                if (zeroChars.length === 1 && lowCurve === 1 && highBricks >= 4) return true;
            }
            return false;
        },

        decideMove(state, legalMoves, difficulty = 'normal') {
            if (!legalMoves || legalMoves.length === 0) return null;
            const enOccupied = getEnergyOccupiedCount(state);
            if (difficulty === 'random') {
                return (enOccupied > 1 && Math.random() < 0.5) ? pickRandom(legalMoves) : null;
            }

            const isHard = difficulty === 'hard';
            const curEnergy = state.calculateEnergy().ALL;
            const targetEnergy = getTargetEnergyNeeded(state);
            const oppFront = getPlayerFrontList(state);
            const oppLife = state.playerMirror?.lifeCount ?? 7;
            const flOccupied = getFrontOccupiedCount(state);

            const scored = legalMoves.map(m => {
                const v3 = typeof state.evalV3Continuous === 'function'
                    ? state.evalV3Continuous(m.card, m.toSlot)
                    : { bpDelta: 0, impact: 0, damage: 1, cannotAttack: false };
                if (v3.cannotAttack && flOccupied >= 2) return { move: m, score: -5000 };

                const bp = (m.card.def?.bp || 0) + (v3.bpDelta || 0);
                const gen = (m.card.def?.generatedEnergy?.count ?? 1) + (v3.genEnergyBonus || 0);
                const afterEnergy = curEnergy - gen;
                let score = bp + (v3.impact || 0) * 900 + Math.max(0, (v3.damage || 1) - 1) * 900;

                if (afterEnergy < Math.min(targetEnergy, 3)) score -= 3500;
                else if (isHard && afterEnergy < targetEnergy && state.turnNumber <= 3) score -= 1800;

                if (gen >= 2) score -= (isHard && oppLife > 2) ? 3400 : 2800;
                if (state.turnNumber <= 2 && enOccupied <= 3) score -= 1800;
                if (isRaidBaseForHand(state, m.card.def)) score -= isHard ? 1300 : 1000;

                // 對手前線空門或殘血時，積極上前施壓
                if (oppFront.length === 0 && afterEnergy >= 2 && bp >= 2000) score += isHard ? 1400 : 800;
                if (isHard && oppLife <= 2 && bp >= 2500 && afterEnergy >= 2) score += 1600;
                if (flOccupied === 0 && state.turnNumber >= 2 && afterEnergy >= 3 && bp >= 2500) score += 900;

                return { move: m, score };
            }).filter(x => x.score >= 1500);

            if (scored.length === 0) return null;
            scored.sort((a, b) => b.score - a.score);
            return scored[0].move;
        },

        decidePlay(state, legalPlays, difficulty = 'normal') {
            if (!legalPlays || legalPlays.length === 0) return null;
            if (difficulty === 'random') return pickRandom(legalPlays);

            const isHard = difficulty === 'hard';
            const curEnergy = state.calculateEnergy().ALL;
            const targetEnergy = getTargetEnergyNeeded(state);
            const needEnergy = curEnergy < targetEnergy;
            const flOccupied = getFrontOccupiedCount(state);
            const oppFront = getPlayerFrontList(state);
            const oppLife = state.playerMirror?.lifeCount ?? 7;

            let bestAction = null;
            let bestScore = -Infinity;

            legalPlays.forEach(act => {
                let score = 0;
                const d = act.card.def || {};
                const bp = d.bp || 0;
                const req = d.requiredEnergy?.count || 0;
                const gen = d.generatedEnergy?.count ?? 1;

                if (act.type === 'ACTIVATE_MAIN') {
                    score = this.estimateActionsValue(state, act.compiledActions) - (act.apCost || 0) * 600;
                } else if (act.type === 'EVENT') {
                    const ir = typeof state.getV3IR === 'function' ? state.getV3IR(d) : null;
                    if (ir && Array.isArray(ir.onEventPlay) && ir.onEventPlay.length > 0) {
                        score = ir.onEventPlay.reduce((sum, ab) => sum + this.estimateV3StepsValue(state, ab.steps), 0);
                    } else {
                        score = this.estimateActionsValue(state, act.compiledActions);
                    }
                    // 困難模式：若對手前線有高威脅角色，優先先解場再推進攻
                    if (isHard && oppFront.length > 0 && score > 1500) score += 800;
                } else if (act.type === 'RAID') {
                    const effVal = this.estimateOnPlayValue(state, d, true);
                    const kw = state.getCardKeywords(act.card);
                    const contBonus = this.estimateContinuousBonus(state, act.card, 'FRONT');
                    // 突襲基底評估：優先蓋在能源線或低 BP 基底上，避免浪費已強化主力
                    const baseTop = act.slotId ? state.getSlotTop(act.slotId) : null;
                    const baseBp = baseTop?.def?.bp || 0;
                    const basePenalty = isHard
                        ? (baseBp * 0.45 + (baseTop?.isRaided ? 2200 : 0) + (ENERGY_SLOTS.includes(act.slotId) && (baseTop?.def?.generatedEnergy?.count || 1) >= 2 && curEnergy <= targetEnergy ? 1800 : 0))
                        : (baseBp * 0.25);
                    score = 5500 + bp + effVal + contBonus
                        + (act.moveToFront ? 1000 : 0)
                        + (kw.impact * (oppLife <= 3 ? 1800 : 1200))
                        + ((kw.damage - 1) * 1200)
                        + (kw.doubleAttack ? 1500 : 0)
                        - basePenalty;
                } else if (act.type === 'NORMAL') {
                    const effVal = this.estimateOnPlayValue(state, d, false);
                    const raidBaseBonus = isRaidBaseForHand(state, d) ? (isHard ? 1200 : 900) : 0;
                    const contBonus = this.estimateContinuousBonus(state, act.card, act.line);

                    if (act.line === 'ENERGY') {
                        if (needEnergy) {
                            score = 5200 + gen * 1250 + effVal + contBonus + raidBaseBonus - req * 220;
                        } else {
                            score = 1600 + (gen >= 2 ? 1800 : 0) + (d.type === 'FIELD' ? 1200 : 0) + effVal + contBonus + raidBaseBonus;
                        }
                    } else if (act.line === 'FRONT') {
                        if (needEnergy && state.turnNumber === 1) {
                            score = 900 + bp + effVal + contBonus;
                        } else {
                            const pressureBonus = (flOccupied < 2 ? 950 : 0) + (isHard && oppFront.length === 0 ? 700 : 0);
                            const activeBonus = d.compiledRules?.entersActive ? 1100 : 0;
                            score = 3200 + bp + effVal + contBonus + pressureBonus + activeBonus - (gen >= 2 ? 1600 : 0);
                        }
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestAction = act;
                }
            });

            return bestScore > 200 ? bestAction : null;
        },

        decideAttack(state, legalAttackers, difficulty = 'normal') {
            if (!legalAttackers || legalAttackers.length === 0) return null;
            if (difficulty === 'random') return pickRandom(legalAttackers);

            const isHard = difficulty === 'hard';
            const activeOppBlockers = getPlayerFrontList(state).filter(p => !p.isRest);
            const oppLife = state.playerMirror?.lifeCount ?? 7;

            if (activeOppBlockers.length === 0) {
                const sorted = [...legalAttackers].sort((a, b) => {
                    if (b.damage !== a.damage) return b.damage - a.damage;
                    if (b.effectiveBp !== a.effectiveBp) return b.effectiveBp - a.effectiveBp;
                    return (b.impact || 0) - (a.impact || 0);
                });
                return sorted[0];
            }

            const totalSwings = legalAttackers.reduce(
                (s, a) => s + (a.doubleAttack && (a.card?.attackCountThisTurn || 0) === 0 ? 2 : 1),
                0
            );
            const totalBlocks = activeOppBlockers.reduce(
                (s, b) => s + (state.getCardKeywords({ def: b.def }).doubleBlock ? 2 : 1),
                0
            );

            const evaluated = legalAttackers.map(a => {
                const validBlockers = activeOppBlockers.filter(b => {
                    const bBp = b.effectiveBp || 0;
                    if (a.unblockableMaxBp && bBp <= a.unblockableMaxBp) return false;
                    if (a.unblockableMinBp && bBp >= a.unblockableMinBp) return false;
                    return true;
                });
                const unblockable = validBlockers.length === 0;
                const maxBlockerBp = unblockable ? 0 : Math.max(...validBlockers.map(b => b.effectiveBp || 0));
                const minBlockerBp = unblockable ? 0 : Math.min(...validBlockers.map(b => b.effectiveBp || 0));
                const beatsAll = unblockable || (a.effectiveBp >= maxBlockerBp);
                const beatsSome = unblockable || (a.effectiveBp >= minBlockerBp);
                const impactKill = !unblockable && (a.impact || 0) > 0 && (a.effectiveBp >= minBlockerBp);

                let onAttackVal = 0;
                const ir = (a.card?.def && typeof state.getV3IR === 'function') ? state.getV3IR(a.card.def) : null;
                if (ir && Array.isArray(ir.onAttack) && ir.onAttack.length > 0) {
                    for (const ab of ir.onAttack) {
                        if (ab.requireRaided && !a.card.isRaided) continue;
                        onAttackVal += this.estimateV3StepsValue(state, ab.steps);
                    }
                } else if (a.card?.def && typeof state.parseAbilities === 'function') {
                    const onAtkAbs = state.parseAbilities(a.card.def).filter(ab =>
                        ab.timings.includes('ON_ATTACK') && (!ab.requireRaided || a.card.isRaided)
                    );
                    onAtkAbs.forEach(ab => {
                        onAttackVal += this.estimateActionsValue(state, state.compileActions(ab.rawText));
                    });
                }

                return { attacker: a, unblockable, maxBlockerBp, beatsAll, beatsSome, impactKill, onAttackVal };
            });

            // 斬殺線估算：不可阻擋傷害 + 多出對方阻擋數的溢出攻擊 + 具衝擊威脅
            const unblockableDmg = evaluated.filter(x => x.unblockable).reduce((s, x) => s + (x.attacker.damage || 1), 0);
            const overflowSwings = Math.max(0, totalSwings - totalBlocks);
            const impactThreat = evaluated.filter(x => x.impactKill).reduce((s, x) => s + (x.attacker.impact || 0), 0);
            const hasLethal = (unblockableDmg + overflowSwings + Math.min(impactThreat, totalBlocks)) >= oppLife;

            // 破除平局僵持：只要能擊穿/逼換對方阻擋者、有衝擊、有攻擊時效果、人數優勢、或困難模式有斬殺/高壓
            const anyEffective = evaluated.some(x => x.beatsAll || x.impactKill || x.onAttackVal > 0);
            const canForceTrade = evaluated.some(x => x.beatsSome && (oppLife <= 3 || (isHard && state.life.length >= oppLife)));
            if (!anyEffective && !hasLethal && !canForceTrade && totalSwings <= totalBlocks) return null;

            const hasNumbersAdvantage = totalSwings > totalBlocks;

            evaluated.sort((x, y) => {
                const a = x.attacker, b = y.attacker;

                // 1. 高價值 [アタック時]（退場／橫置／減 BP／抽牌）優先觸發，讓後續攻擊受惠
                const highAtkA = x.onAttackVal >= 800 ? 1 : 0;
                const highAtkB = y.onAttackVal >= 800 ? 1 : 0;
                if (highAtkA !== highAtkB) return highAtkB - highAtkA;
                if (highAtkA && x.onAttackVal !== y.onAttackVal) return y.onAttackVal - x.onAttackVal;

                // 2. 斬殺線達成時（困難模式優先收頭排序）：先派非衝擊單位消耗阻擋者，再以衝擊／高傷害／直擊收尾
                if (isHard && hasLethal && totalBlocks > 0) {
                    const finA = (x.unblockable || (a.impact || 0) > 0) ? 1 : 0;
                    const finB = (y.unblockable || (b.impact || 0) > 0) ? 1 : 0;
                    if (finA !== finB) return finA - finB; // 非終結者先騙擋
                    if (!finA) return a.effectiveBp - b.effectiveBp; // 較弱者先釣魚
                }

                // 3. 無法被阻擋的直擊優先
                if (x.unblockable !== y.unblockable) return x.unblockable ? -1 : 1;
                if (x.unblockable) {
                    if (b.damage !== a.damage) return b.damage - a.damage;
                    return b.effectiveBp - a.effectiveBp;
                }

                // 4. 對方殘血（生命 <= 2）：優先派 [インパクト] 與能擊破阻擋者的高 BP
                if (oppLife <= 2) {
                    const tierX = (x.beatsAll && a.impact > 0) ? 4 : (x.beatsAll ? 3 : (x.impactKill ? 2 : 1));
                    const tierY = (y.beatsAll && b.impact > 0) ? 4 : (y.beatsAll ? 3 : (y.impactKill ? 2 : 1));
                    if (tierX !== tierY) return tierY - tierX;
                    if (tierX === 4 || tierX === 2) {
                        if ((b.impact || 0) !== (a.impact || 0)) return (b.impact || 0) - (a.impact || 0);
                    }
                    if (tierX === 1 && hasNumbersAdvantage) return a.effectiveBp - b.effectiveBp;
                    return b.effectiveBp - a.effectiveBp;
                }

                // 5. 對方生命 > 2：先派不會輸的主力搶血（保留 [インパクト] 留到殘血收頭）
                if (x.beatsAll !== y.beatsAll) return x.beatsAll ? -1 : 1;
                if (x.beatsAll) {
                    const saveImpA = (a.impact || 0) > 0 ? 1 : 0;
                    const saveImpB = (b.impact || 0) > 0 ? 1 : 0;
                    if (saveImpA !== saveImpB) return saveImpA - saveImpB;
                    if (b.damage !== a.damage) return b.damage - a.damage;
                    return b.effectiveBp - a.effectiveBp;
                }

                // 6. 無法直接打穿時：若有人數優勢，派最弱角色釣魚騙掉阻擋者
                if (hasNumbersAdvantage) {
                    if ((a.impact || 0) !== (b.impact || 0)) return (a.impact || 0) - (b.impact || 0);
                    if (a.damage !== b.damage) return a.damage - b.damage;
                    return a.effectiveBp - b.effectiveBp;
                }

                if (x.impactKill !== y.impactKill) return x.impactKill ? -1 : 1;
                return b.effectiveBp - a.effectiveBp;
            });

            return evaluated[0].attacker;
        },

        decideBlock(state, attackInfo, legalBlockers, difficulty = 'normal') {
            if (!legalBlockers || legalBlockers.length === 0) return { blocked: false };
            if (difficulty === 'random') {
                return Math.random() < 0.5 ? { blocked: true, slotId: pickRandom(legalBlockers).slotId } : { blocked: false };
            }

            const isHard = difficulty === 'hard';
            const atkBp = attackInfo.attackerBp || 0;
            const atkDmg = attackInfo.damage || 1;
            const atkImp = attackInfo.impact || 0;
            const myLife = state.life.length;

            // 1. 可以白吃對手（BP 嚴格大於攻擊者）：優先用 2 回阻擋或最低足夠 BP 擋下
            const winners = legalBlockers
                .filter(b => b.effectiveBp > atkBp)
                .sort((a, b) => (b.doubleBlock ? 1 : 0) - (a.doubleBlock ? 1 : 0) || a.effectiveBp - b.effectiveBp);
            if (winners.length > 0) return { blocked: true, slotId: winners[0].slotId };

            // 2. 對手具 [インパクト] 且會造成威脅：若有 [インパクト無効] 阻擋者，必用其擋下（完全化解衝擊！）
            if (atkImp > 0) {
                const nullifiers = legalBlockers
                    .filter(b => b.impactNullify)
                    .sort((a, b) => a.effectiveBp - b.effectiveBp);
                if (nullifiers.length > 0 && (myLife <= 3 || myLife <= atkImp || (isHard && atkDmg >= 2))) {
                    return { blocked: true, slotId: nullifiers[0].slotId };
                }
            }

            // 3. 擋了會輸且對方 [インパクト] >= 傷害（且無衝擊無效）：擋下仍會扣同樣生命並白白退場，絕不擋
            if (atkImp >= atkDmg) return { blocked: false };

            // 4. 面對致命傷害／殘血／高傷（Damage 2+）時，派最便宜的非主力角色擋血
            const dangerThreshold = (isHard && atkDmg >= 2) ? 4 : 2;
            if (myLife <= dangerThreshold || myLife <= atkDmg) {
                const cheapest = [...legalBlockers].sort((a, b) => {
                    const valA = a.effectiveBp + (a.doubleBlock ? 2500 : 0) + (a.card?.isRaided ? 1500 : 0);
                    const valB = b.effectiveBp + (b.doubleBlock ? 2500 : 0) + (b.card?.isRaided ? 1500 : 0);
                    return valA - valB;
                })[0];
                return { blocked: true, slotId: cheapest.slotId };
            }
            return { blocked: false };
        },

        decideDiscard(state, handCards, count, difficulty = 'normal') {
            const indices = handCards.map((_, i) => i);
            if (difficulty === 'random') {
                const res = [];
                while (res.length < count && indices.length > 0) {
                    res.push(indices.splice(Math.floor(Math.random() * indices.length), 1)[0]);
                }
                return res;
            }
            const isHard = difficulty === 'hard';
            const enAll = state.calculateEnergy().ALL;
            const scored = handCards.map((c, idx) => {
                const req = c.def?.requiredEnergy?.count ?? 0;
                const bp = c.def?.bp || 0;
                const unplayablePenalty = req > enAll + 2 ? 5000 : 0;
                const protectZero = (req === 0 && enAll < 3) ? -2500 : 0;
                const protectRaidBase = (isHard && isRaidBaseForHand(state, c.def)) ? -1400 : 0;
                const protectRaid = (isHard && c.def?.compiledRules?.raidCondition && req <= enAll + 1) ? -1200 : 0;
                return { idx, score: unplayablePenalty + req * 300 - bp * 0.2 + protectZero + protectRaidBase + protectRaid };
            });
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, count).map(x => x.idx);
        },

        decideActiveTriggerTarget(state) {
            const frontRested = FRONT_SLOTS
                .map(s => ({ s, top: state.getSlotTop(s) }))
                .filter(x => x.top && x.top.isRest)
                .sort((a, b) => (b.top.def?.bp || 0) - (a.top.def?.bp || 0));
            if (frontRested.length > 0) return frontRested[0].s;
            const frontAny = FRONT_SLOTS
                .map(s => ({ s, top: state.getSlotTop(s) }))
                .filter(x => x.top)
                .sort((a, b) => (b.top.def?.bp || 0) - (a.top.def?.bp || 0));
            return frontAny.length > 0 ? frontAny[0].s : null;
        }
    };

    window.UAAIBrain = UAAIBrain;
})();
