/**
 * NCHUCGC Union Arena 人機對戰 — 戰術評分與決策層 (ua-ai-brain.js)
 * 職責：評估卡片效果價值、能源曲線規劃、突襲優先級、攻擊排序與理性防禦。
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

    const UAAIBrain = {
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
            const abilities = state.parseAbilities(def).filter(ab =>
                ab.timings.includes('ON_PLAY') && (!ab.requireRaided || isRaided)
            );
            let total = 0;
            abilities.forEach(ab => {
                total += this.estimateActionsValue(state, state.compileActions(ab.rawText));
            });
            return total;
        },

        decideMulligan(handCards, difficulty = 'normal') {
            if (difficulty === 'random') return false;
            const hasZeroCost = handCards.some(c =>
                c.def && (c.def.type === 'CHARACTER' || c.def.type === 'FIELD') && (c.def.requiredEnergy?.count ?? 99) === 0
            );
            return !hasZeroCost;
        },

        decideMove(state, legalMoves, difficulty = 'normal') {
            if (!legalMoves || legalMoves.length === 0) return null;
            const enOccupied = getEnergyOccupiedCount(state);
            if (difficulty === 'random') {
                return (enOccupied > 1 && Math.random() < 0.5) ? pickRandom(legalMoves) : null;
            }

            const curEnergy = state.calculateEnergy().ALL;
            const targetEnergy = getTargetEnergyNeeded(state);

            const scored = legalMoves.map(m => {
                const bp = m.card.def?.bp || 0;
                const gen = m.card.def?.generatedEnergy?.count ?? 1;
                const afterEnergy = curEnergy - gen;
                let score = bp;
                if (afterEnergy < Math.min(targetEnergy, 3)) score -= 3500;
                if (gen >= 2) score -= 2800;
                if (state.turnNumber <= 2 && enOccupied <= 3) score -= 1800;
                if (isRaidBaseForHand(state, m.card.def)) score -= 1000;
                return { move: m, score };
            }).filter(x => x.score >= 1500);

            if (scored.length === 0) return null;
            scored.sort((a, b) => b.score - a.score);
            return scored[0].move;
        },

        decidePlay(state, legalPlays, difficulty = 'normal') {
            if (!legalPlays || legalPlays.length === 0) return null;
            if (difficulty === 'random') return pickRandom(legalPlays);

            const curEnergy = state.calculateEnergy().ALL;
            const targetEnergy = getTargetEnergyNeeded(state);
            const needEnergy = curEnergy < targetEnergy;
            const flOccupied = getFrontOccupiedCount(state);

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
                    score = this.estimateActionsValue(state, act.compiledActions);
                } else if (act.type === 'RAID') {
                    const effVal = this.estimateOnPlayValue(state, d, true);
                    const kw = state.getCardKeywords(act.card);
                    score = 5500 + bp + effVal + (act.moveToFront ? 900 : 0) + (kw.impact * 1200) + ((kw.damage - 1) * 1200);
                } else if (act.type === 'NORMAL') {
                    const effVal = this.estimateOnPlayValue(state, d, false);
                    const raidBaseBonus = isRaidBaseForHand(state, d) ? 900 : 0;

                    if (act.line === 'ENERGY') {
                        if (needEnergy) {
                            score = 5200 + gen * 1200 + effVal + raidBaseBonus - req * 250;
                        } else {
                            score = 1600 + (gen >= 2 ? 1800 : 0) + (d.type === 'FIELD' ? 1200 : 0) + effVal + raidBaseBonus;
                        }
                    } else if (act.line === 'FRONT') {
                        if (needEnergy && state.turnNumber === 1) {
                            score = 900 + bp + effVal;
                        } else {
                            score = 3200 + bp + effVal + (flOccupied < 2 ? 900 : 0) - (gen >= 2 ? 1500 : 0);
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
                const impactKill = !unblockable && (a.impact || 0) > 0 && (a.effectiveBp >= minBlockerBp);

                let onAttackVal = 0;
                if (a.card?.def && typeof state.parseAbilities === 'function') {
                    const onAtkAbs = state.parseAbilities(a.card.def).filter(ab =>
                        ab.timings.includes('ON_ATTACK') && (!ab.requireRaided || a.card.isRaided)
                    );
                    onAtkAbs.forEach(ab => {
                        onAttackVal += this.estimateActionsValue(state, state.compileActions(ab.rawText));
                    });
                }

                return { attacker: a, unblockable, maxBlockerBp, beatsAll, impactKill, onAttackVal };
            });

            const anyEffective = evaluated.some(x => x.beatsAll || x.impactKill || x.onAttackVal > 0);
            if (!anyEffective && totalSwings <= totalBlocks) return null;

            const hasNumbersAdvantage = totalSwings > totalBlocks;

            evaluated.sort((x, y) => {
                const a = x.attacker, b = y.attacker;

                // 1. 高價值 [アタック時]（退場／橫置／減 BP／抽牌）優先觸發，讓後續攻擊受惠
                const highAtkA = x.onAttackVal >= 800 ? 1 : 0;
                const highAtkB = y.onAttackVal >= 800 ? 1 : 0;
                if (highAtkA !== highAtkB) return highAtkB - highAtkA;
                if (highAtkA && x.onAttackVal !== y.onAttackVal) return y.onAttackVal - x.onAttackVal;

                // 2. 無法被阻擋的直擊優先
                if (x.unblockable !== y.unblockable) return x.unblockable ? -1 : 1;
                if (x.unblockable) {
                    if (b.damage !== a.damage) return b.damage - a.damage;
                    return b.effectiveBp - a.effectiveBp;
                }

                // 3. 對方殘血（生命 <= 2，被迫以最弱角色擋下）：優先派 [インパクト] 與能擊破阻擋者的高 BP
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

                // 4. 對方生命 > 2：先派不會輸的主力趁對方不擋搶血（保留 [インパクト] 留到殘血收頭）
                if (x.beatsAll !== y.beatsAll) return x.beatsAll ? -1 : 1;
                if (x.beatsAll) {
                    const saveImpA = (a.impact || 0) > 0 ? 1 : 0;
                    const saveImpB = (b.impact || 0) > 0 ? 1 : 0;
                    if (saveImpA !== saveImpB) return saveImpA - saveImpB;
                    if (b.damage !== a.damage) return b.damage - a.damage;
                    return b.effectiveBp - a.effectiveBp;
                }

                // 5. 無法直接打穿時：若有人數優勢，派最弱角色釣魚騙掉阻擋者
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

            const atkBp = attackInfo.attackerBp || 0;
            const atkDmg = attackInfo.damage || 1;
            const atkImp = attackInfo.impact || 0;
            const myLife = state.life.length;

            const winners = legalBlockers
                .filter(b => b.effectiveBp > atkBp)
                .sort((a, b) => (b.doubleBlock ? 1 : 0) - (a.doubleBlock ? 1 : 0) || a.effectiveBp - b.effectiveBp);
            if (winners.length > 0) return { blocked: true, slotId: winners[0].slotId };

            // 擋了會輸且對方 [インパクト] >= 傷害時，擋下仍會扣同樣生命並白白退場，絕不擋
            if (atkImp >= atkDmg) return { blocked: false };

            if (myLife <= 2 || myLife <= atkDmg) {
                const cheapest = [...legalBlockers].sort((a, b) =>
                    ((a.doubleBlock ? 1 : 0) - (b.doubleBlock ? 1 : 0)) || (a.effectiveBp - b.effectiveBp)
                )[0];
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
            const enAll = state.calculateEnergy().ALL;
            const scored = handCards.map((c, idx) => {
                const req = c.def?.requiredEnergy?.count ?? 0;
                const bp = c.def?.bp || 0;
                const unplayablePenalty = req > enAll + 2 ? 5000 : 0;
                return { idx, score: unplayablePenalty + req * 300 - bp * 0.2 };
            });
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, count).map(x => x.idx);
        },

        decideActiveTriggerTarget(state) {
            const frontRested = FRONT_SLOTS.filter(s => { const top = state.getSlotTop(s); return top && top.isRest; });
            if (frontRested.length > 0) return frontRested[0];
            const frontAny = FRONT_SLOTS.filter(s => state.getSlotTop(s));
            return frontAny.length > 0 ? frontAny[0] : null;
        }
    };

    window.UAAIBrain = UAAIBrain;
})();
