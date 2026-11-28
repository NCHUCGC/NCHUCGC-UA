/**
 * ua-v3-bridge.js — Union Arena 編譯器 v3 確定性 IR 前端橋接層（UMD）
 * ----------------------------------------------------------------------
 * 採方案 A（漸進式能力級混合橋接）：
 *  1. 永遠保留手寫腳本 (window.UACardScripts / 腳本.js) 最高優先權，零衝突。
 *  2. 針對常駐效果（BP 加減、bpPerCount、條件關鍵字、BP 減免免疫、常駐產能、減需能、減 AP、Active 登場），
 *     對全卡池已編譯卡片即時計算，直接修補舊引擎 A1（479 張常駐失效）問題。
 *  3. 針對觸發／啟動／事件能力，全自動卡片（_s === 1）優先以確定性 v3 IR 執行，
 *     完整執行所有條件樹、12 種選發/強制代價與 [ターン1] 限次鎖；未編譯長尾平滑退回舊引擎。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UAV3Bridge = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function getCatalog() {
    if (typeof window !== 'undefined' && window.UA_V3_CATALOG) return window.UA_V3_CATALOG;
    if (typeof globalThis !== 'undefined' && globalThis.UA_V3_CATALOG) return globalThis.UA_V3_CATALOG;
    return null;
  }

  function getBaseId(engine, cardIdOrEl) {
    const id = typeof cardIdOrEl === 'string'
      ? cardIdOrEl
      : (cardIdOrEl?.dataset?.cardId || cardIdOrEl?.id || '');
    if (!id) return '';
    if (engine && typeof engine.getBaseCardId === 'function') return engine.getBaseCardId(id);
    return String(id).replace(/([/_](p\d+|s|sp\d*)|★)+$/i, '');
  }

  function getV3IR(engine, cardDefOrEl) {
    const cat = getCatalog();
    if (!cat || !cardDefOrEl) return null;
    const bid = getBaseId(engine, cardDefOrEl);
    return bid ? (cat[bid] || null) : null;
  }

  function cardMatchesName(def, ir, targetName) {
    if (!def || !targetName) return false;
    const clean = String(targetName).replace(/\s+/g, '');
    if ((def.name || '').replace(/\s+/g, '').includes(clean)) return true;
    const aliases = ir?.aliases || def.aliases;
    if (Array.isArray(aliases) && aliases.some(a => String(a).replace(/\s+/g, '').includes(clean))) return true;
    return false;
  }

  function isEventLike(def, ir) {
    if (!def) return false;
    if (def.type === 'EVENT') return true;
    const tr = ir?.treatAsTypes || def.treatAsTypes;
    return Array.isArray(tr) && tr.includes('EVENT');
  }

  function getFacedownUnderCount(cardEl, facedownOnly = true) {
    const slot = cardEl?.parentElement;
    if (!slot || !slot.querySelectorAll) return 0;
    return Array.from(slot.querySelectorAll('.card')).filter(c =>
      c !== cardEl && (!facedownOnly || c.classList.contains('is-flipped'))
    ).length;
  }

  function getZoneCards(engine, owner, zone) {
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return [];
    const prefix = owner === 'OPP' ? '#opp' : '#my';
    if (zone === 'FRONT') return engine.getSlotTopCards(`${prefix}-front-line .slot`);
    if (zone === 'ENERGY') return engine.getSlotTopCards(`${prefix}-energy-line .slot`);
    if (zone === 'FIELD') return engine.getSlotTopCards(`${prefix}-front-line .slot, ${prefix}-energy-line .slot`);
    if (zone === 'HAND') return Array.from(doc.querySelectorAll(`${prefix}-hand-area .card`));
    if (zone === 'OUTSIDE') return Array.from(doc.querySelectorAll(`${prefix}-outside-area .card`));
    if (zone === 'REMOVE') return Array.from(doc.querySelectorAll(`${prefix}-remove-area .card`));
    if (zone === 'LIFE') return Array.from(doc.querySelectorAll(`${prefix}-life-area .card`));
    if (zone === 'DECK') return Array.from(doc.querySelectorAll(`${prefix}-deck-area .card`));
    return [];
  }

  function matchesFilter(engine, cardEl, filter, sourceCardEl = null) {
    if (!filter) return true;
    if (filter.or) return filter.or.some(sub => matchesFilter(engine, cardEl, sub, sourceCardEl));
    if (!cardEl) return false;
    if (filter.excludeSelf && cardEl === sourceCardEl) return false;
    const def = engine.getCardDef(cardEl);
    if (!def) return false;
    const ir = getV3IR(engine, def);
    const rt = engine.getRuntime ? engine.getRuntime(cardEl) : null;

    if (filter.type) {
      if (filter.type === 'EVENT') {
        if (!isEventLike(def, ir)) return false;
      } else if (def.type !== filter.type) return false;
    }
    const isAllColor = !!(ir?.allColor);
    if (filter.color && !isAllColor && def.color !== filter.color) return false;
    if (filter.excludeColor && !isAllColor && def.color === filter.excludeColor) return false;
    if (filter.nameIncludes && !cardMatchesName(def, ir, filter.nameIncludes)) return false;
    if (filter.excludeName && cardMatchesName(def, ir, filter.excludeName)) return false;
    if (filter.namesAny && !filter.namesAny.some(n => cardMatchesName(def, ir, n))) return false;
    const traits = Array.isArray(def.traits) ? def.traits : [];
    if (filter.traitIncludes && !traits.some(t => t.includes(filter.traitIncludes))) return false;
    if (filter.traitsAny && !filter.traitsAny.some(want => traits.some(t => t.includes(want)))) return false;
    if (filter.excludeTrait && traits.some(t => t.includes(filter.excludeTrait))) return false;
    if (filter.noRaid && def.compiledRules?.raidCondition) return false;
    if (filter.requireRaided && !rt?.isRaided) return false;

    const reqEn = typeof def.requiredEnergy === 'object' ? (def.requiredEnergy?.count || 0) : (parseInt(def.requiredEnergy, 10) || 0);
    if (filter.minEnergy !== undefined && reqEn < filter.minEnergy) return false;
    if (filter.maxEnergy !== undefined && reqEn > filter.maxEnergy) return false;
    if (filter.exactEnergy !== undefined && reqEn !== filter.exactEnergy) return false;

    const apCost = def.apCost !== undefined ? def.apCost : 1;
    if (filter.exactApCost !== undefined && apCost !== filter.exactApCost) return false;
    if (filter.minApCost !== undefined && apCost < filter.minApCost) return false;
    if (filter.maxApCost !== undefined && apCost > filter.maxApCost) return false;

    const origBp = def.bp || 0;
    if (filter.exactOriginalBp !== undefined && origBp !== filter.exactOriginalBp) return false;
    if (filter.minOriginalBp !== undefined && origBp < filter.minOriginalBp) return false;
    if (filter.maxOriginalBp !== undefined && origBp > filter.maxOriginalBp) return false;

    if (filter.requireActive && cardEl.classList?.contains('rest')) return false;
    if (filter.requireRest && !cardEl.classList?.contains('rest')) return false;
    if (filter.hasTrigger && (!def.triggerText || def.triggerText === '-')) return false;

    if (filter.requireEnergyMet && typeof engine.calculateMyEnergy === 'function') {
      const en = engine.calculateMyEnergy();
      const disc = typeof engine.computeAutoEnergyDiscount === 'function' ? engine.computeAutoEnergyDiscount(def) : 0;
      const need = Math.max(0, reqEn - disc);
      if (need > 0) {
        const have = isAllColor ? (en.ALL || Object.values(en).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)) : (en[def.color] || 0);
        if (have < need) return false;
      }
    }

    if (filter.maxBp !== undefined || filter.minBp !== undefined) {
      const onField = !!(cardEl.closest && cardEl.closest('#my-front-line, #my-energy-line, #opp-front-line, #opp-energy-line'));
      const bp = onField ? engine.getEffectiveCardBp(cardEl) : origBp;
      if (filter.maxBp !== undefined && bp > filter.maxBp) return false;
      if (filter.minBp !== undefined && bp < filter.minBp) return false;
    }
    return true;
  }

  function countZone(engine, query, sourceCardEl) {
    const owners = query.owner === 'OPP' ? ['OPP'] : (query.owner === 'BOTH' ? ['MY', 'OPP'] : ['MY']);
    const zone = query.zone || 'FIELD';
    const matched = [];
    for (const o of owners) {
      for (const c of getZoneCards(engine, o, zone)) {
        if (c.classList?.contains('is-flipped') && (zone === 'FIELD' || zone === 'FRONT' || zone === 'ENERGY')) continue;
        if (matchesFilter(engine, c, query.filter, sourceCardEl)) matched.push(c);
      }
    }
    if (query.distinctNames) {
      const names = new Set();
      matched.forEach(c => { const n = engine.getCardDef(c)?.name; if (n) names.add(n); });
      return names.size;
    }
    return matched.length;
  }

  function evalCondition(engine, cond, sourceCardEl, ctx = {}) {
    if (!cond) return true;
    const rt = sourceCardEl && engine.getRuntime ? engine.getRuntime(sourceCardEl) : null;
    switch (cond.type) {
      case 'MY_TURN':
        return engine.isFirstPlayer === null ? true : !!engine.isMyTurn;
      case 'OPP_TURN':
        return engine.isFirstPlayer === null ? false : !engine.isMyTurn;
      case 'SELF_IS_ACTIVE':
        return !!(sourceCardEl && !sourceCardEl.classList?.contains('rest'));
      case 'SELF_IS_REST':
        return !!(sourceCardEl && sourceCardEl.classList?.contains('rest'));
      case 'SELF_IN_FRONT':
        return !!(sourceCardEl && sourceCardEl.closest?.('#my-front-line'));
      case 'SELF_IN_ENERGY':
        return !!(sourceCardEl && sourceCardEl.closest?.('#my-energy-line'));
      case 'SELF_IS_RAIDED':
        return !!rt?.isRaided;
      case 'SELF_BP_GTE': {
        const bp = ctx.currentBp !== undefined ? ctx.currentBp : (sourceCardEl ? engine.getEffectiveCardBp(sourceCardEl) : 0);
        return bp >= cond.value;
      }
      case 'SELF_BP_LTE': {
        const bp = ctx.currentBp !== undefined ? ctx.currentBp : (sourceCardEl ? engine.getEffectiveCardBp(sourceCardEl) : 0);
        return bp <= cond.value;
      }
      case 'SELF_HAS_UNDER_GTE':
        return getFacedownUnderCount(sourceCardEl, cond.facedownOnly !== false) >= (cond.count ?? 1);
      case 'GENERATED_ENERGY_GTE': {
        if (engine._v3InEnergyEval) return false;
        engine._v3InEnergyEval = true;
        try {
          const en = typeof engine.calculateMyEnergy === 'function' ? engine.calculateMyEnergy() : { ALL: 0 };
          const val = cond.color ? (en[cond.color] || 0) : (en.ALL || 0);
          return val >= (cond.count ?? 0);
        } finally { engine._v3InEnergyEval = false; }
      }
      case 'GENERATED_ENERGY_LTE': {
        if (engine._v3InEnergyEval) return false;
        engine._v3InEnergyEval = true;
        try {
          const en = typeof engine.calculateMyEnergy === 'function' ? engine.calculateMyEnergy() : { ALL: 0 };
          const val = cond.color ? (en[cond.color] || 0) : (en.ALL || 0);
          return val <= (cond.count ?? 0);
        } finally { engine._v3InEnergyEval = false; }
      }
      case 'COUNT_ZONE': {
        const cnt = countZone(engine, cond, sourceCardEl);
        const op = cond.op || 'GTE';
        if (op === 'LTE') return cnt <= cond.count;
        if (op === 'EQ') return cnt === cond.count;
        return cnt >= cond.count;
      }
      case 'HAS_CHAR':
        return countZone(engine, { owner: 'MY', zone: 'FIELD', filter: { nameIncludes: cond.name } }, sourceCardEl) >= 1;
      case 'HAS_CHAR_IN_FRONT':
        return countZone(engine, { owner: 'MY', zone: 'FRONT', filter: { nameIncludes: cond.name } }, sourceCardEl) >= 1;
      case 'HAS_ANY_CHAR':
        return (cond.names || []).some(n => countZone(engine, { owner: 'MY', zone: 'FIELD', filter: { nameIncludes: n } }, sourceCardEl) >= 1);
      case 'HAS_RAIDED_CHAR_IN_FRONT':
        return countZone(engine, { owner: 'MY', zone: 'FRONT', filter: { nameIncludes: cond.name, requireRaided: true } }, sourceCardEl) >= 1;
      case 'OUTSIDE_EVENTS_GTE':
        return (typeof engine.countEventsInMyOutside === 'function' ? engine.countEventsInMyOutside() : 0) >= cond.count;
      case 'OUTSIDE_CARDS_GTE':
        return getZoneCards(engine, 'MY', 'OUTSIDE').length >= cond.count;
      case 'USED_EVENT_THIS_TURN':
        return !!engine.usedEventThisTurn;
      case 'HAS_FACEDOWN_UNDER':
        return getFacedownUnderCount(sourceCardEl, true) > 0;
      case 'ENTERED_BY_EFFECT':
        return !!rt?.enteredByEffect;
      case 'FIELD_EMPTY':
        return getZoneCards(engine, 'MY', 'FIELD').length === 0;
      case 'OPP_HAS_EMPTY_ENERGY': {
        const doc = typeof document !== 'undefined' ? document : null;
        return doc ? Array.from(doc.querySelectorAll('#opp-energy-line .slot')).some(s => !engine.getTopCardInSlot(s)) : false;
      }
      case 'MY_HAS_EMPTY_FRONT': {
        const doc = typeof document !== 'undefined' ? document : null;
        return doc ? Array.from(doc.querySelectorAll('#my-front-line .slot')).some(s => !engine.getTopCardInSlot(s)) : false;
      }
      case 'DISTINCT_TRAIT_NAMES_GTE':
        return countZone(engine, { owner: 'MY', zone: 'FIELD', filter: { traitIncludes: cond.trait }, distinctNames: true }, sourceCardEl) >= cond.count;
      case 'OPP_FRONT_HAS_LOWERED_BP':
        return typeof engine.hasOppLoweredBpChar === 'function' ? engine.hasOppLoweredBpChar() : false;
      case 'VAR_TRUTHY':
        return !!(ctx.vars?.[cond.key] || (cond.key === 'added' && ctx.addedFromLook));
      case 'NOT':
        return !evalCondition(engine, cond.cond, sourceCardEl, ctx);
      case 'AND':
        return (cond.all || []).every(sub => evalCondition(engine, sub, sourceCardEl, ctx));
      case 'OR':
        return (cond.any || []).some(sub => evalCondition(engine, sub, sourceCardEl, ctx));
      default:
        return true;
    }
  }

  function condDependsOnSelfBp(cond) {
    if (!cond) return false;
    if (cond.type === 'SELF_BP_GTE' || cond.type === 'SELF_BP_LTE') return true;
    if (cond.type === 'NOT') return condDependsOnSelfBp(cond.cond);
    if (cond.type === 'AND') return (cond.all || []).some(condDependsOnSelfBp);
    if (cond.type === 'OR') return (cond.any || []).some(condDependsOnSelfBp);
    return false;
  }

  // ==================== 常駐視圖計算（解決 A1 479 張常駐失效）====================
  function evalContinuousView(engine, cardEl) {
    const empty = {
      bpDelta: 0, impact: 0, damage: 0, step: false, snipe: false,
      doubleAttack: false, doubleBlock: false, impactNullify: false,
      immuneToBpMinus: false, immuneToOppLeave: false, immuneToOppRetire: false,
      untargetableByOpp: false, cannotMove: false, cannotMoveToFront: false,
      cannotBlock: false, cannotAttack: false,
      unblockableMaxBp: 0, unblockableMinBp: 0,
      generateEnergyInFront: false, genEnergyBonus: 0
    };
    if (!cardEl) return empty;
    const def = engine.getCardDef(cardEl);
    const ir = getV3IR(engine, def);
    if (!ir) return empty;

    const rt = engine.getRuntime ? engine.getRuntime(cardEl) : null;
    const kw = ir.staticKeywords || {};
    const out = {
      ...empty,
      impact: Number(kw.impact) || 0,
      damage: Number(kw.damage) || 0,
      step: !!kw.step,
      snipe: !!kw.snipe,
      doubleAttack: !!kw.doubleAttack,
      doubleBlock: !!kw.doubleBlock,
      impactNullify: !!kw.impactNullify,
      immuneToBpMinus: !!kw.immuneToBpMinus,
      immuneToOppLeave: !!kw.immuneToOppLeave,
      immuneToOppRetire: !!kw.immuneToOppRetire,
      untargetableByOpp: !!kw.untargetableByOpp,
      cannotMove: !!kw.cannotMove,
      cannotMoveToFront: !!(kw.cannotMoveToFront || ir.cannotPlayFront),
      cannotBlock: !!kw.cannotBlock,
      cannotAttack: !!kw.cannotAttack,
      unblockableMaxBp: kw.unblockableMaxBp || 0,
      unblockableMinBp: kw.unblockableMinBp || 0,
      generateEnergyInFront: !!ir.generateEnergyInFront
    };

    const applyRule = (rule) => {
      if (rule.bpDelta) out.bpDelta += rule.bpDelta;
      if (rule.bpPerCount) {
        let cnt = 0;
        if (rule.bpPerCount.selfUnder) cnt = getFacedownUnderCount(cardEl, rule.bpPerCount.facedownOnly !== false);
        else if (rule.bpPerCount.usedEventsThisTurn) cnt = engine.isMyTurn ? (engine.usedEventCountThisTurn || 0) : 0;
        else if (rule.bpPerCount.query) cnt = countZone(engine, rule.bpPerCount.query, cardEl);
        const capped = rule.bpPerCount.maxCount ? Math.min(cnt, rule.bpPerCount.maxCount) : cnt;
        out.bpDelta += capped * rule.bpPerCount.step;
      }
      if (rule.grantImpact) out.impact = Math.max(out.impact, rule.grantImpact);
      if (rule.grantDamage) out.damage = Math.max(out.damage, rule.grantDamage);
      if (rule.grantStep) out.step = true;
      if (rule.grantSnipe) out.snipe = true;
      if (rule.grantDoubleAttack) out.doubleAttack = true;
      if (rule.grantDoubleBlock) out.doubleBlock = true;
      if (rule.grantImpactNullify) out.impactNullify = true;
      if (rule.grantImmuneToBpMinus) out.immuneToBpMinus = true;
      if (rule.grantImmuneToOppLeave) out.immuneToOppLeave = true;
      if (rule.grantImmuneToOppRetire) out.immuneToOppRetire = true;
      if (rule.grantUntargetableByOpp) out.untargetableByOpp = true;
      if (rule.grantCannotBlock) out.cannotBlock = true;
      if (rule.grantCannotAttack) out.cannotAttack = true;
      if (rule.grantCannotMove) out.cannotMove = true;
      if (rule.grantUnblockableMaxBp) out.unblockableMaxBp = Math.max(out.unblockableMaxBp, rule.grantUnblockableMaxBp);
      if (rule.grantUnblockableMinBp) {
        out.unblockableMinBp = out.unblockableMinBp ? Math.min(out.unblockableMinBp, rule.grantUnblockableMinBp) : rule.grantUnblockableMinBp;
      }
      if (rule.generateEnergyInFront) out.generateEnergyInFront = true;
      if (rule.genEnergyDelta) out.genEnergyBonus += rule.genEnergyDelta.count || 0;
    };

    const deferred = [];
    for (const rule of ir.continuous || []) {
      if (rule.requireRaided && !rt?.isRaided) continue;
      if (condDependsOnSelfBp(rule.when)) { deferred.push(rule); continue; }
      if (!evalCondition(engine, rule.when, cardEl, {})) continue;
      applyRule(rule);
    }

    if (deferred.length > 0) {
      const slot = cardEl.parentElement;
      const tracker = slot?.querySelector?.('.bp-tracker');
      const slotMod = tracker ? (parseInt(tracker.dataset.bp, 10) || 0) : 0;
      const currentBp = Math.max(0, (def?.bp || 0) + slotMod + out.bpDelta);
      for (const rule of deferred) {
        if (!evalCondition(engine, rule.when, cardEl, { currentBp })) continue;
        applyRule(rule);
      }
    }
    return out;
  }

  function getHandApDiscount(engine, cardDef) {
    const ir = getV3IR(engine, cardDef);
    if (!ir || !Array.isArray(ir.apDiscounts)) return 0;
    let total = 0;
    for (const d of ir.apDiscounts) {
      if (evalCondition(engine, d.when, null, {})) total += d.amount || 1;
    }
    return total;
  }

  function getHandEnergyDiscount(engine, cardDef) {
    const ir = getV3IR(engine, cardDef);
    if (!ir || !Array.isArray(ir.energyDiscounts)) return 0;
    let total = 0;
    for (const d of ir.energyDiscounts) {
      if (evalCondition(engine, d.when, null, {})) total += d.amount || 1;
    }
    return total;
  }

  function cardEntersActive(engine, cardDef) {
    const ir = getV3IR(engine, cardDef);
    return !!(ir && ir.entersActive);
  }

  // ==================== 確定性 v3 步驟執行器（DOM / 多人同步相容）====================
  function canPayV3Cost(engine, cardEl, cost) {
    if (!cost) return false;
    if (cost.type === 'FREE') return true;
    if (cost.type === 'DISCARD_HAND') return getZoneCards(engine, 'MY', 'HAND').length >= (cost.count || 1);
    if (cost.type === 'PAY_AP') return engine.getActiveApCards().length >= (cost.count || 1);
    if (cost.type === 'REST_SELF') return !!(cardEl && !cardEl.classList?.contains('rest'));
    if (cost.type === 'RETIRE_SELF' || cost.type === 'DECK_BOTTOM_SELF') {
      return !!(cardEl && cardEl.closest?.('#my-front-line, #my-energy-line'));
    }
    if (cost.type === 'LIFE_TO_HAND') return getZoneCards(engine, 'MY', 'LIFE').length >= (cost.count || 1);
    if (cost.type === 'DISCARD_UNDER') return getFacedownUnderCount(cardEl, cost.facedownOnly !== false) >= (cost.count || 1);
    if (cost.type === 'REMOVE_OUTSIDE') {
      const cands = getZoneCards(engine, 'MY', 'OUTSIDE').filter(c => matchesFilter(engine, c, cost.filter, cardEl));
      return cands.length >= (cost.count || 1);
    }
    if (cost.type === 'BOUNCE_MY_CHAR' || cost.type === 'RETIRE_MY_CHAR') {
      return getZoneCards(engine, 'MY', cost.line || 'FIELD').some(c => matchesFilter(engine, c, cost.filter || { type: 'CHARACTER' }, cardEl));
    }
    if (cost.type === 'REST_MY_FRONT_CHAR') {
      return getZoneCards(engine, 'MY', 'FRONT').some(c => c !== cardEl && !c.classList?.contains('rest') && matchesFilter(engine, c, cost.filter, cardEl));
    }
    return false;
  }

  function payV3CostThen(engine, cardEl, cost, thenSteps, ctx, onDone) {
    const doc = typeof document !== 'undefined' ? document : null;
    const runThen = () => runV3Steps(engine, cardEl, thenSteps, ctx, onDone);
    if (cost.type === 'FREE') { runThen(); return; }
    if (cost.type === 'PAY_AP') {
      if (!engine.payAp(cost.count || 1)) { onDone(); return; }
      runThen(); return;
    }
    if (cost.type === 'REST_SELF') {
      cardEl.classList.add('rest');
      runThen(); return;
    }
    if (cost.type === 'RETIRE_SELF') {
      if (cardEl.parentElement) engine.retireCardFromSlot(cardEl.parentElement);
      runThen(); return;
    }
    if (cost.type === 'DECK_BOTTOM_SELF') {
      sendFieldCardToDeckBottom(engine, cardEl);
      runThen(); return;
    }
    if (cost.type === 'LIFE_TO_HAND') {
      const life = getZoneCards(engine, 'MY', 'LIFE');
      const hand = doc?.getElementById('my-hand-area');
      const n = Math.min(cost.count || 1, life.length);
      for (let i = 0; i < n; i++) {
        const c = life[life.length - 1 - i];
        c.classList.remove('is-flipped');
        if (hand) engine.moveCardToZone(c, hand);
      }
      runThen(); return;
    }
    if (cost.type === 'DISCARD_UNDER') {
      const slot = cardEl.parentElement;
      const outside = doc?.getElementById('my-outside-area');
      const unders = slot ? Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl && (cost.facedownOnly === false || c.classList.contains('is-flipped'))) : [];
      const n = Math.min(cost.count || 1, unders.length);
      for (let i = 0; i < n; i++) {
        unders[i].classList.remove('is-flipped');
        if (outside) engine.moveCardToZone(unders[i], outside);
      }
      runThen(); return;
    }
    if (cost.type === 'DISCARD_HAND') {
      runV3Steps(engine, cardEl, [{ op: 'DISCARD_HAND', count: cost.count || 1, min: cost.count || 1 }, ...thenSteps], ctx, onDone);
      return;
    }
    if (cost.type === 'REMOVE_OUTSIDE') {
      const cands = getZoneCards(engine, 'MY', 'OUTSIDE').filter(c => matchesFilter(engine, c, cost.filter, cardEl));
      const cnt = Math.min(cost.count || 1, cands.length);
      const removeArea = doc?.getElementById('my-remove-area');
      if (cnt === 0 || !removeArea) { onDone(); return; }
      engine.promptModal({
        title: `支付代價：從場外移除 ${cnt} 張`,
        desc: `請選擇 ${cnt} 張卡片移至移除區：`,
        cards: cands, selectCount: cnt, upTo: false,
        onConfirm: (sel) => { sel.forEach(c => engine.moveCardToZone(c, removeArea)); runThen(); }
      });
      return;
    }
    if (cost.type === 'BOUNCE_MY_CHAR' || cost.type === 'RETIRE_MY_CHAR' || cost.type === 'REST_MY_FRONT_CHAR') {
      const zone = cost.type === 'REST_MY_FRONT_CHAR' ? 'FRONT' : (cost.line || 'FIELD');
      const cands = getZoneCards(engine, 'MY', zone).filter(c => {
        if (cost.type === 'REST_MY_FRONT_CHAR' && (c === cardEl || c.classList?.contains('rest'))) return false;
        return matchesFilter(engine, c, cost.filter || { type: 'CHARACTER' }, cardEl);
      });
      if (cands.length === 0) { onDone(); return; }
      const applyOne = (target) => {
        if (cost.type === 'BOUNCE_MY_CHAR') engine.bounceSlotTopCardToHand(target.parentElement);
        else if (cost.type === 'RETIRE_MY_CHAR') engine.retireCardFromSlot(target.parentElement);
        else target.classList.add('rest');
        runThen();
      };
      if (cands.length === 1) { applyOne(cands[0]); return; }
      engine.promptModal({
        title: cost.type === 'BOUNCE_MY_CHAR' ? '支付代價：彈回 1 張角色' : (cost.type === 'RETIRE_MY_CHAR' ? '支付代價：退場 1 張卡片' : '支付代價：橫置 1 張前線角色'),
        desc: '請選擇 1 張符合條件的我方卡片：',
        cards: cands, selectCount: 1, upTo: false,
        onConfirm: (sel) => { if (sel[0]) applyOne(sel[0]); else onDone(); }
      });
      return;
    }
    onDone();
  }

  function sendFieldCardToDeckBottom(engine, cardEl) {
    const doc = typeof document !== 'undefined' ? document : null;
    const slot = cardEl?.parentElement;
    if (!slot) return;
    if (slot.id && slot.id.startsWith('opp-')) {
      engine.requestBottomOpponentCard(cardEl);
      return;
    }
    const deck = doc?.getElementById('my-deck-area');
    const outside = doc?.getElementById('my-outside-area');
    Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl).forEach(u => {
      u.classList.remove('is-flipped');
      if (outside) engine.moveCardToZone(u, outside);
    });
    if (deck) {
      cardEl.classList.remove('rest');
      cardEl.classList.add('is-flipped');
      deck.insertBefore(cardEl, deck.firstChild);
    }
  }

  function sendFieldCardToRemove(engine, cardEl) {
    const doc = typeof document !== 'undefined' ? document : null;
    const slot = cardEl?.parentElement;
    if (!slot) return;
    if (slot.id && slot.id.startsWith('opp-')) {
      engine.requestRemoveOpponentCard(cardEl);
      return;
    }
    const removeArea = doc?.getElementById('my-remove-area');
    const outside = doc?.getElementById('my-outside-area');
    Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl).forEach(u => {
      u.classList.remove('is-flipped');
      if (outside) engine.moveCardToZone(u, outside);
    });
    if (removeArea) engine.moveCardToZone(cardEl, removeArea);
  }

  function applyModifierToCard(engine, cardEl, kind, value, expiresAt) {
    if (!cardEl) return;
    const rt = engine.getRuntime(cardEl);
    if (!rt) return;
    const bag = expiresAt === 'NEXT_OWNER_TURN_START' ? (rt.persistentKeywords = rt.persistentKeywords || {}) : (rt.tempKeywords = rt.tempKeywords || {});
    if (kind === 'GRANT_IMPACT') bag.IMPACT = Math.max(bag.IMPACT || 0, value || 1);
    else if (kind === 'GRANT_IMPACT_PLUS') bag.IMPACT_PLUS = (bag.IMPACT_PLUS || 0) + (value || 1);
    else if (kind === 'GRANT_DAMAGE') bag.DAMAGE = Math.max(bag.DAMAGE || 1, value || 2);
    else if (kind === 'GRANT_DOUBLE_ATTACK') bag.DOUBLE_ATTACK = true;
    else if (kind === 'GRANT_DOUBLE_BLOCK') bag.DOUBLE_BLOCK = true;
    else if (kind === 'GRANT_STEP') bag.STEP = true;
    else if (kind === 'GRANT_SNIPE') bag.SNIPE = true;
    else if (kind === 'GRANT_IMPACT_NULLIFY') bag.IMPACT_NULLIFY = true;
    else if (kind === 'UNBLOCKABLE_MIN_BP') bag.UNBLOCKABLE_MIN_BP = bag.UNBLOCKABLE_MIN_BP ? Math.min(bag.UNBLOCKABLE_MIN_BP, value) : value;
    else if (kind === 'UNBLOCKABLE_MAX_BP') bag.UNBLOCKABLE_MAX_BP = Math.max(bag.UNBLOCKABLE_MAX_BP || 0, value);
    else if (kind === 'UNTARGETABLE_BY_OPP') bag.UNTARGETABLE_BY_OPP = true;
    else if (kind === 'IMMUNE_TO_OPP_LEAVE') bag.IMMUNE_TO_OPP_LEAVE = true;
    else if (kind === 'IMMUNE_TO_OPP_RETIRE') bag.IMMUNE_TO_OPP_RETIRE = true;
    else if (kind === 'IMMUNE_TO_BP_MINUS') bag.IMMUNE_TO_BP_MINUS = true;
    else if (kind === 'CANNOT_MOVE') bag.CANNOT_MOVE = true;
    else if (kind === 'CANNOT_BLOCK') bag.CANNOT_BLOCK = true;
    else if (kind === 'CANNOT_ATTACK') bag.CANNOT_ATTACK = true;
    else if (kind === 'GENERATE_ENERGY_IN_FRONT' || kind === 'TEMP_FRONT_ENERGY') bag.GENERATE_ENERGY_IN_FRONT = 1;
    else if (kind === 'REPLACE_LEAVE_WITH_BOUNCE') bag.REPLACE_LEAVE_WITH_BOUNCE = 1;
    else if (kind === 'TEMP_GEN_ENERGY' && value) {
      rt.tempEnergyBoost = rt.tempEnergyBoost || [];
      rt.tempEnergyBoost.push({ color: value.color, count: value.count || 1, amount: value.count || 1 });
    } else if (kind === 'TEMP_ABILITY' && value?.timing && value.ab) {
      rt.v3TempAbilities = rt.v3TempAbilities || [];
      rt.v3TempAbilities.push({ timing: value.timing, ab: value.ab, expiresAt: expiresAt || 'END_OF_TURN' });
    }
  }

  function runV3Steps(engine, sourceCardEl, steps, ctx = {}, onComplete = null) {
    if (!ctx.vars) ctx.vars = {};
    if (!ctx.selected) ctx.selected = [];
    const doc = typeof document !== 'undefined' ? document : null;
    const def = engine.getCardDef(sourceCardEl);

    const execAt = (idx) => {
      if (!steps || idx >= steps.length) {
        if (typeof engine.updateEnergyHUD === 'function') engine.updateEnergyHUD();
        if (typeof broadcastMyState === 'function') broadcastMyState();
        if (onComplete) onComplete();
        return;
      }
      const step = steps[idx];
      const next = () => execAt(idx + 1);
      const targets = (t) => (t === 'SELF' ? (sourceCardEl ? [sourceCardEl] : []) : (ctx.selected || []));

      switch (step.op) {
        case 'IF': {
          const ok = evalCondition(engine, step.condition, sourceCardEl, ctx);
          const sub = ok ? step.thenSteps : (step.elseSteps || []);
          if (sub && sub.length > 0) runV3Steps(engine, sourceCardEl, sub, ctx, next);
          else next();
          return;
        }
        case 'DRAW': {
          engine.drawCards(step.count || 1);
          next(); return;
        }
        case 'MILL_DECK': {
          if (step.upTo) {
            const deckCnt = getZoneCards(engine, 'MY', 'DECK').length;
            const maxM = Math.min(step.count || 1, deckCnt);
            if (maxM === 0) { next(); return; }
            const btns = [];
            for (let n = 0; n <= maxM; n++) {
              btns.push({
                label: n === 0 ? '不堆墓 (0 張)' : `送 ${n} 張至場外`,
                color: n === 0 ? '#7f8c8d' : '#4f739e',
                onClick: () => { if (n > 0) engine.millDeckCards(n); next(); }
              });
            }
            engine.promptModal({ title: `【${def?.name || '效果'}】選擇堆墓張數`, desc: `從牌組上方最多將 ${maxM} 張送至場外：`, cards: [], customButtons: btns });
            return;
          }
          engine.millDeckCards(step.count || 1);
          next(); return;
        }
        case 'ACTIVATE_AP': {
          engine.activateMyApCards(step.count || 1);
          next(); return;
        }
        case 'SET_ACTIVE': {
          targets(step.target).forEach(c => c.classList?.remove('rest'));
          next(); return;
        }
        case 'SET_REST': {
          targets(step.target).forEach(c => {
            if (c.parentElement?.id?.startsWith('opp-')) engine.requestRestOpponentCard(c);
            else c.classList?.add('rest');
          });
          next(); return;
        }
        case 'FREEZE': {
          targets(step.target).forEach(c => {
            if (c.parentElement?.id?.startsWith('opp-')) engine.requestFreezeOpponentCard(c);
            else { const r = engine.getRuntime(c); if (r) r.frozenNextTurn = true; }
          });
          next(); return;
        }
        case 'MODIFY_BP': {
          targets(step.target).forEach(c => {
            if (step.expiresAt === 'NEXT_OWNER_TURN_START') {
              const r = engine.getRuntime(c);
              if (r) r.persistentBp = (r.persistentBp || 0) + (step.amount || 0);
            }
            if (c.parentElement) engine.addSlotBp(c.parentElement, step.amount || 0);
          });
          next(); return;
        }
        case 'MODIFY_BP_ALL': {
          getZoneCards(engine, step.owner || 'OPP', step.line || 'FRONT')
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl))
            .forEach(c => {
              if (step.expiresAt === 'NEXT_OWNER_TURN_START') {
                const r = engine.getRuntime(c);
                if (r) r.persistentBp = (r.persistentBp || 0) + (step.amount || 0);
              }
              if (c.parentElement) engine.addSlotBp(c.parentElement, step.amount || 0);
            });
          next(); return;
        }
        case 'GRANT_MODIFIER': {
          targets(step.target).forEach(c => applyModifierToCard(engine, c, step.kind, step.value ?? 1, step.expiresAt));
          next(); return;
        }
        case 'GRANT_MODIFIER_ALL': {
          getZoneCards(engine, step.owner || 'MY', step.line || 'FIELD')
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl))
            .forEach(c => applyModifierToCard(engine, c, step.kind, step.value ?? 1, step.expiresAt));
          next(); return;
        }
        case 'ADD_DELAYED_TRIGGER': {
          if (step.timing === 'MAIN_PHASE_END' && sourceCardEl) {
            const rt = engine.getRuntime(sourceCardEl);
            if (rt) rt.retireAtEndOfMain = true;
          }
          next(); return;
        }
        case 'ADD_AP_DISCOUNT': {
          engine.pendingApDiscounts = engine.pendingApDiscounts || [];
          engine.pendingApDiscounts.push({
            amount: step.amount || 1,
            desc: `${def?.name || '效果'} 消費AP-${step.amount || 1}`,
            matchFn: (d) => (!step.cardType || d.type === step.cardType) && (!step.noRaid || !d.compiledRules?.raidCondition)
          });
          next(); return;
        }
        case 'RETIRE': {
          targets(step.target).forEach(c => {
            if (c.parentElement?.id?.startsWith('opp-')) engine.requestRetireOpponentCard(c);
            else if (c.parentElement) engine.retireCardFromSlot(c.parentElement);
          });
          next(); return;
        }
        case 'RETIRE_SELF': {
          if (sourceCardEl?.parentElement) engine.retireCardFromSlot(sourceCardEl.parentElement);
          next(); return;
        }
        case 'RETIRE_ALL': {
          getZoneCards(engine, step.owner || 'OPP', step.line || 'FRONT')
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl))
            .forEach(c => {
              if (c.parentElement?.id?.startsWith('opp-')) engine.requestRetireOpponentCard(c);
              else if (c.parentElement) engine.retireCardFromSlot(c.parentElement);
            });
          next(); return;
        }
        case 'SET_REST_ALL': {
          getZoneCards(engine, step.owner || 'OPP', step.line || 'FRONT')
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl))
            .forEach(c => {
              if (c.parentElement?.id?.startsWith('opp-')) engine.requestRestOpponentCard(c);
              else c.classList?.add('rest');
            });
          next(); return;
        }
        case 'SET_ACTIVE_ALL': {
          getZoneCards(engine, step.owner || 'MY', step.line || 'FIELD')
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl))
            .forEach(c => c.classList?.remove('rest'));
          next(); return;
        }
        case 'BOUNCE_SELECTED': {
          targets(step.target).forEach(c => {
            if (c.parentElement?.id?.startsWith('opp-')) engine.requestBounceOpponentCard(c);
            else if (c.parentElement) engine.bounceSlotTopCardToHand(c.parentElement);
          });
          next(); return;
        }
        case 'BOUNCE_SELF': {
          if (sourceCardEl?.parentElement) engine.bounceSlotTopCardToHand(sourceCardEl.parentElement);
          next(); return;
        }
        case 'BOUNCE_OTHER_OR_SELF': {
          const cands = getZoneCards(engine, 'MY', step.line || 'FIELD')
            .filter(c => c !== sourceCardEl && matchesFilter(engine, c, step.filter || { type: 'CHARACTER' }, sourceCardEl));
          if (cands.length === 0) {
            if (sourceCardEl?.parentElement) engine.bounceSlotTopCardToHand(sourceCardEl.parentElement);
            next(); return;
          }
          if (cands.length === 1) {
            engine.bounceSlotTopCardToHand(cands[0].parentElement);
            next(); return;
          }
          engine.promptModal({
            title: `【${def?.name || '登場時'}】選擇 1 張我方其他角色返回手牌`,
            desc: '請選擇 1 張符合條件的我方角色返回手牌：',
            cards: cands, selectCount: 1, upTo: false,
            onConfirm: (sel) => {
              if (sel[0]?.parentElement) engine.bounceSlotTopCardToHand(sel[0].parentElement);
              else if (sourceCardEl?.parentElement) engine.bounceSlotTopCardToHand(sourceCardEl.parentElement);
              next();
            }
          });
          return;
        }
        case 'TO_DECK_BOTTOM': {
          targets(step.target).forEach(c => sendFieldCardToDeckBottom(engine, c));
          next(); return;
        }
        case 'REMOVE_SELECTED': {
          targets(step.target).forEach(c => sendFieldCardToRemove(engine, c));
          next(); return;
        }
        case 'DECK_TOP_TO_UNDER': {
          const slot = sourceCardEl?.parentElement;
          const deck = getZoneCards(engine, 'MY', 'DECK');
          const n = Math.min(step.count || 1, deck.length);
          if (slot && n > 0) {
            for (let i = 0; i < n; i++) {
              const top = deck[deck.length - 1 - i];
              top.classList.remove('rest');
              if (step.facedown !== false) top.classList.add('is-flipped');
              slot.insertBefore(top, slot.firstChild);
            }
          }
          next(); return;
        }
        case 'LIFE_TO_HAND': {
          const life = getZoneCards(engine, 'MY', 'LIFE');
          const hand = doc?.getElementById('my-hand-area');
          const n = Math.min(step.count || 1, life.length);
          for (let i = 0; i < n; i++) {
            const c = life[life.length - 1 - i];
            c.classList.remove('is-flipped');
            if (hand) engine.moveCardToZone(c, hand);
          }
          next(); return;
        }
        case 'DISCARD_HAND': {
          const hand = getZoneCards(engine, 'MY', 'HAND');
          const outside = doc?.getElementById('my-outside-area');
          const maxC = Math.min(step.count || 1, hand.length);
          const minC = Math.min(step.min ?? maxC, maxC);
          if (maxC === 0 || !outside) { next(); return; }
          engine.promptModal({
            title: `【${def?.name || '效果'}】選擇手牌放置於場外`,
            desc: `請選擇 ${minC === maxC ? maxC : `最多 ${maxC}`} 張手牌放置於場外：`,
            cards: hand, selectCount: maxC, upTo: minC === 0,
            onConfirm: (sel) => { sel.forEach(c => engine.moveCardToZone(c, outside)); next(); }
          });
          return;
        }
        case 'HAND_TO_DECK_TOP': {
          const hand = getZoneCards(engine, 'MY', 'HAND');
          const deck = doc?.getElementById('my-deck-area');
          const cnt = Math.min(step.count || 1, hand.length);
          if (cnt === 0 || !deck) { next(); return; }
          engine.promptModal({
            title: `【${def?.name || '效果'}】將手牌放回牌組上方`,
            desc: `請選擇 ${cnt} 張手牌放回自己牌組上方：`,
            cards: hand, selectCount: cnt, upTo: false,
            onConfirm: (sel) => {
              sel.forEach(c => { c.classList.remove('rest'); c.classList.add('is-flipped'); deck.appendChild(c); });
              next();
            }
          });
          return;
        }
        case 'CHOOSE_TARGET': {
          const filter = { ...(step.filter || {}) };
          if (step.dynamicMaxBp) {
            let lim = step.dynamicMaxBp.base;
            for (const up of step.dynamicMaxBp.upgrades || []) {
              if (evalCondition(engine, up.when, sourceCardEl, ctx)) lim = Math.max(lim, up.maxBp);
            }
            filter.maxBp = lim;
          }
          const cands = getZoneCards(engine, step.owner || 'OPP', step.line || 'FRONT').filter(c => {
            if (step.owner === 'OPP') {
              const v = evalContinuousView(engine, c);
              if (v.untargetableByOpp) return false;
            }
            return matchesFilter(engine, c, filter, sourceCardEl);
          });
          if (cands.length === 0) { ctx.selected = []; next(); return; }
          const maxC = Math.min(step.max ?? 1, cands.length);
          const minC = Math.min(step.min ?? 1, cands.length);
          if (cands.length === 1 && minC === 1 && maxC === 1) {
            ctx.selected = [cands[0]];
            next(); return;
          }
          engine.promptModal({
            title: `【${def?.name || '效果'}】選擇目標`,
            desc: `請選擇 ${minC === maxC ? maxC : `最多 ${maxC}`} 張目標卡片：`,
            cards: cands, selectCount: maxC, upTo: minC === 0,
            onConfirm: (sel) => { ctx.selected = sel || []; next(); }
          });
          return;
        }
        case 'RECOVER_FROM_OUTSIDE': {
          const cands = getZoneCards(engine, 'MY', 'OUTSIDE').filter(c => matchesFilter(engine, c, step.filter, sourceCardEl));
          const hand = doc?.getElementById('my-hand-area');
          if (cands.length === 0 || !hand) { next(); return; }
          const maxC = Math.min(step.baseMax ?? 1, cands.length);
          const minC = Math.min(step.min ?? 0, maxC);
          engine.promptModal({
            title: `【${def?.name || '效果'}】從場外加入手牌`,
            desc: `請從場外選擇 ${minC === maxC ? maxC : `最多 ${maxC}`} 張加入手牌：`,
            cards: cands, selectCount: maxC, upTo: minC === 0,
            onConfirm: (sel) => {
              sel.forEach(c => engine.moveCardToZone(c, hand));
              ctx.vars.added = sel.length > 0;
              next();
            }
          });
          return;
        }
        case 'LOOK_TOP': {
          const deck = getZoneCards(engine, 'MY', 'DECK');
          const cnt = Math.min(step.count || 1, deck.length);
          if (cnt === 0) { next(); return; }
          const looked = deck.slice(deck.length - cnt).reverse();
          const eligible = step.pickFilter ? looked.filter(c => matchesFilter(engine, c, step.pickFilter, sourceCardEl)) : looked;
          const finishRest = (picked) => {
            const rest = looked.filter(c => !picked.includes(c));
            const hand = doc?.getElementById('my-hand-area');
            const outside = doc?.getElementById('my-outside-area');
            const removeArea = doc?.getElementById('my-remove-area');
            const deckEl = doc?.getElementById('my-deck-area');
            if (step.pickDest === 'HAND' && hand) picked.forEach(c => engine.moveCardToZone(c, hand));
            else if (step.pickDest === 'OUTSIDE' && outside) picked.forEach(c => engine.moveCardToZone(c, outside));
            else if (step.pickDest === 'REMOVE' && removeArea) picked.forEach(c => engine.moveCardToZone(c, removeArea));
            else if (step.pickDest === 'TOP' && deckEl) [...picked].reverse().forEach(c => { c.classList.add('is-flipped'); deckEl.appendChild(c); });
            if (step.setVarIfPicked) { ctx.vars[step.setVarIfPicked] = picked.length > 0; ctx.addedFromLook = picked.length > 0; }
            if (rest.length === 0) { next(); return; }
            if (step.restDest === 'OUTSIDE' && outside) {
              rest.forEach(c => engine.moveCardToZone(c, outside));
              next(); return;
            }
            if (typeof engine.promptOrderCardsToDeck === 'function' && rest.length > 1 && step.orderRest) {
              engine.promptOrderCardsToDeck(rest, step.restDest === 'TOP' ? 'TOP' : 'BOTTOM', next);
            } else if (deckEl) {
              rest.forEach(c => {
                c.classList.add('is-flipped');
                if (step.restDest === 'TOP') deckEl.appendChild(c);
                else deckEl.insertBefore(c, deckEl.firstChild);
              });
              next();
            } else { next(); }
          };
          if (eligible.length === 0) { finishRest([]); return; }
          const maxPick = Math.min(step.pickMax ?? 1, eligible.length);
          const minPick = Math.min(step.pickMin ?? 0, eligible.length);
          engine.promptModal({
            title: `【${def?.name || '檢視牌頂'}】檢視牌組上方 ${cnt} 張`,
            desc: `請選擇要置於【${step.pickDest}】的卡片（${minPick === maxPick ? maxPick : `最多 ${maxPick}`} 張）：`,
            cards: looked,
            cardFilterFn: (c) => eligible.includes(c),
            selectCount: maxPick,
            upTo: minPick === 0,
            onConfirm: (sel) => finishRest(sel || [])
          });
          return;
        }
        case 'SPECIAL_SUMMON': {
          const pool = step.from === 'HAND_OR_OUTSIDE'
            ? [...getZoneCards(engine, 'MY', 'HAND'), ...getZoneCards(engine, 'MY', 'OUTSIDE')]
            : getZoneCards(engine, 'MY', step.from === 'OUTSIDE' ? 'OUTSIDE' : 'HAND');
          const cands = pool.filter(c => matchesFilter(engine, c, step.filter, sourceCardEl));
          if (cands.length === 0) { next(); return; }
          const allowFront = !step.allowedLines || step.allowedLines.includes('front');
          const allowEnergy = !step.allowedLines || step.allowedLines.includes('energy');
          engine.promptModal({
            title: `【${def?.name || '特殊登場'}】選擇要登場的角色`,
            desc: `請選擇最多 ${step.max ?? 1} 張角色特殊登場（${step.enterRest ? '休息' : '活動'}）：`,
            cards: cands, selectCount: Math.min(step.max ?? 1, cands.length), upTo: (step.min ?? 0) === 0,
            onConfirm: (sel) => {
              if (!sel || sel.length === 0) { next(); return; }
              const placeNext = (i) => {
                if (i >= sel.length) { ctx.vars.summoned = true; next(); return; }
                const target = sel[i];
                const tRt = engine.getRuntime(target);
                if (tRt) tRt.enteredByEffect = true;
                engine.chooseEmptyFieldSlotAndPlace(target, { allowFront, allowEnergy, enterRest: step.enterRest !== false }, () => placeNext(i + 1));
              };
              placeNext(0);
            }
          });
          return;
        }
        case 'OPTIONAL_COST': {
          if (!canPayV3Cost(engine, sourceCardEl, step.cost)) { next(); return; }
          engine.promptModal({
            title: `【${def?.name || '選發效果'}】是否發動選發效果？`,
            desc: step.label || '是否支付代價發動後續效果？',
            cards: [],
            customButtons: [
              { label: '✅ 支付代價並發動', color: '#27ae60', onClick: () => payV3CostThen(engine, sourceCardEl, step.cost, step.thenSteps, ctx, next) },
              { label: '⏭️ 不發動', color: '#7f8c8d', onClick: () => next() }
            ]
          });
          return;
        }
        case 'TRY_COST_THEN': {
          if (!canPayV3Cost(engine, sourceCardEl, step.cost)) { next(); return; }
          payV3CostThen(engine, sourceCardEl, step.cost, step.thenSteps, ctx, next);
          return;
        }
        case 'CHOOSE_BRANCH': {
          const branches = step.branches || [];
          if (branches.length === 0) { next(); return; }
          const btns = branches.map((b, bi) => ({
            label: `選項 ${bi + 1}：${b.label}`,
            color: bi % 2 === 0 ? '#4f739e' : '#8d7cc4',
            onClick: () => runV3Steps(engine, sourceCardEl, b.steps, ctx, next)
          }));
          engine.promptModal({ title: `【${def?.name || '多選一'}】請選擇 1 項效果`, desc: '請點擊要發動的效果分支：', cards: [], customButtons: btns });
          return;
        }
        case 'RETRIGGER_ON_PLAY': {
          engine.triggerCardAbilities(sourceCardEl, 'ON_PLAY', next);
          return;
        }
        case 'RECOVER_RAID_BASE_TO_HAND': {
          next(); return;
        }
        default:
          next(); return;
      }
    };
    execAt(0);
  }

  // ==================== 觸發與啟動橋接入口 ====================
  const TIMING_MAP = {
    ON_PLAY: 'onPlay',
    ON_ATTACK: 'onAttack',
    ON_ATTACK_END: 'onAttackEnd',
    ON_BLOCK: 'onBlock',
    ON_BLOCKED: 'onBlocked',
    ON_UNBLOCKED: 'onUnblocked',
    ON_BATTLE_WIN: 'onBattleWin',
    ON_RETIRE: 'onRetire',
    ON_ATTACK_PHASE_END: 'onAttackPhaseEnd',
    ON_TURN_END: 'onTurnEnd',
    CONTINUOUS: 'onEventPlay'
  };

  function tryTriggerV3(engine, cardEl, timing, onComplete) {
    const def = engine.getCardDef(cardEl);
    if (!def) return false;
    const ir = getV3IR(engine, def);
    const prop = TIMING_MAP[timing];
    if (!prop) return false;
    if (timing === 'CONTINUOUS' && def.type !== 'EVENT') return false;

    const rt = engine.getRuntime(cardEl);
    const tempAbs = (rt?.v3TempAbilities || []).filter(t => t.timing === prop).map(t => t.ab);
    const isFull = !!(ir && ir._s === 1);
    const isNewTimingOnly = ['ON_BATTLE_WIN', 'ON_UNBLOCKED', 'ON_BLOCKED', 'ON_ATTACK_END', 'ON_ATTACK_PHASE_END', 'ON_TURN_END'].includes(timing);

    // 只有 FULL 全自動卡、或舊引擎原本就沒支援的新時機、或有動態 TEMP_ABILITY 時才接管
    const irList = (ir && (isFull || isNewTimingOnly) && Array.isArray(ir[prop])) ? ir[prop] : [];
    const allAbs = [...irList, ...tempAbs];
    if (!isFull && allAbs.length === 0) return false;

    const isFront = !!(cardEl.closest && cardEl.closest('#my-front-line'));
    const isEnergy = !!(cardEl.closest && cardEl.closest('#my-energy-line'));
    rt.usedV3Abilities = rt.usedV3Abilities || new Set();

    const matched = [];
    allAbs.forEach((ab, idx) => {
      if (ab.requireRaided && !rt.isRaided) return;
      if (ab.requireFrontLine && !isFront) return;
      if (ab.requireEnergyLine && !isEnergy) return;
      const key = `${timing}:${idx}`;
      if (ab.oncePerTurn && rt.usedV3Abilities.has(key)) return;
      if (ab.oncePerTurnNamed && engine.usedNamedAbilityThisTurn?.has(ab.oncePerTurnNamed)) return;
      if (ab.when && !evalCondition(engine, ab.when, cardEl, {})) return;
      matched.push({ ab, key });
    });

    if (matched.length === 0) {
      // 全自動卡若該時機沒有觸發能力，直接結束而不回退舊引擎（避免舊引擎誤猜或跳手動視窗）
      if (isFull) {
        if (onComplete) onComplete();
        return true;
      }
      return false;
    }

    const runIdx = (i) => {
      if (i >= matched.length) {
        if (onComplete) onComplete();
        return;
      }
      const { ab, key } = matched[i];
      if (ab.oncePerTurn) rt.usedV3Abilities.add(key);
      if (ab.oncePerTurnNamed && engine.usedNamedAbilityThisTurn) engine.usedNamedAbilityThisTurn.add(ab.oncePerTurnNamed);
      runV3Steps(engine, cardEl, ab.steps, {}, () => runIdx(i + 1));
    };
    runIdx(0);
    return true;
  }

  function getV3MainAbilities(engine, cardEl) {
    const def = engine.getCardDef(cardEl);
    const ir = getV3IR(engine, def);
    if (!ir || ir._s !== 1 || !Array.isArray(ir.activateMain)) return null;
    const rt = engine.getRuntime(cardEl);
    const isFront = !!(cardEl.closest && cardEl.closest('#my-front-line'));
    const isEnergy = !!(cardEl.closest && cardEl.closest('#my-energy-line'));
    rt.usedV3Abilities = rt.usedV3Abilities || new Set();

    const list = [];
    ir.activateMain.forEach((ab, idx) => {
      if (ab.requireRaided && !rt.isRaided) return;
      if (ab.requireFrontLine && !isFront) return;
      if (ab.requireEnergyLine && !isEnergy) return;
      const key = `ACTIVATE_MAIN:${idx}`;
      if (ab.oncePerTurn && rt.usedV3Abilities.has(key)) return;
      if (ab.oncePerTurnNamed && engine.usedNamedAbilityThisTurn?.has(ab.oncePerTurnNamed)) return;
      if (ab.when && !evalCondition(engine, ab.when, cardEl, {})) return;
      for (const cost of ab.costs || []) {
        if (!canPayV3Cost(engine, cardEl, cost)) return;
      }
      list.push({ ab, key, idx });
    });
    return list;
  }

  function activateV3MainAbility(engine, cardEl, item) {
    const def = engine.getCardDef(cardEl);
    const rt = engine.getRuntime(cardEl);
    rt.usedV3Abilities = rt.usedV3Abilities || new Set();
    const { ab, key } = item;

    for (const cost of ab.costs || []) {
      if (!canPayV3Cost(engine, cardEl, cost)) return false;
    }

    const runBody = () => {
      if (ab.oncePerTurn) rt.usedV3Abilities.add(key);
      if (ab.oncePerTurnNamed && engine.usedNamedAbilityThisTurn) engine.usedNamedAbilityThisTurn.add(ab.oncePerTurnNamed);
      if (typeof sendSystemChat === 'function') sendSystemChat(`[規則引擎 v3] 發動了【${def?.name || '卡片'}】的 [起動メイン] 效果！`);
      runV3Steps(engine, cardEl, ab.steps, {});
    };

    const payAllCosts = (ci) => {
      const costs = ab.costs || [];
      if (ci >= costs.length) { runBody(); return; }
      payV3CostThen(engine, cardEl, costs[ci], [], {}, () => payAllCosts(ci + 1));
    };
    payAllCosts(0);
    return true;
  }

  return {
    getV3IR,
    getIR: getV3IR,
    matchesFilter,
    countZone,
    evalCondition,
    evalContinuousView,
    getHandApDiscount,
    getHandEnergyDiscount,
    cardEntersActive,
    runV3Steps,
    tryTriggerV3,
    getV3MainAbilities,
    activateV3MainAbility
  };
});
