/**
 * ua-v3-bridge.js — Union Arena 編譯器 v3 確定性 IR 前端橋接層（UMD）
 * ----------------------------------------------------------------------
 * 採方案 A（漸進式能力級混合橋接）：
 *  1. 永遠保留手寫腳本 (window.UACardScripts / 腳本.js) 最高優先權，零衝突。
 *  2. 針對常駐效果（BP 加減、bpPerCount、條件關鍵字、BP 減免免疫、常駐產能、減需能、減 AP、Active 登場、B1~B8 擴充欄位與光環），
 *     對全卡池已編譯卡片即時計算，直接修補舊引擎 A1（479 張常駐失效）問題。
 *  3. 針對觸發／啟動／事件能力，全自動卡片（_s === 1）優先以確定性 v3 IR 執行；
 *     部分自動卡片（_s === 2）於舊引擎未支援的新時機或 TEMP_ABILITY 接管執行；未編譯長尾平滑退回舊引擎。
 *  4. 對尚未在 M2b (ua-rule-engine.js) 實作的輔助方法與 DOM/P2P 全域函式，提供完整存在性檢查與安全回退。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UAV3Bridge = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // ==================== 安全環境與全域輔助包裝 ====================
  function getCatalog() {
    if (typeof window !== 'undefined' && window.UA_V3_CATALOG) return window.UA_V3_CATALOG;
    if (typeof globalThis !== 'undefined' && globalThis.UA_V3_CATALOG) return globalThis.UA_V3_CATALOG;
    return null;
  }

  function safeUpdateBpDisplay(slot, bp) {
    if (typeof updateBpDisplay === 'function' && slot) updateBpDisplay(slot, bp);
    else if (slot?.querySelector) {
      const tr = slot.querySelector('.bp-tracker');
      if (tr) tr.dataset.bp = String(bp);
    }
  }

  function safeRecalcStacking(slot) {
    if (typeof recalcStacking === 'function' && slot) recalcStacking(slot);
  }

  function safeUpdateSlotCounts() {
    if (typeof updateSlotCounts === 'function') updateSlotCounts();
  }

  function safeBroadcastMyState() {
    if (typeof broadcastMyState === 'function') broadcastMyState();
  }

  function safeSendSystemChat(msg) {
    if (typeof sendSystemChat === 'function') sendSystemChat(msg);
  }

  function safeShowSysMsg(msg) {
    if (typeof showSysMsg === 'function') showSysMsg(msg);
  }

  function safeShowCenterAlert(title, msg) {
    if (typeof showCenterAlert === 'function') showCenterAlert(title, msg);
  }

  function safeConnSend(payload) {
    if (typeof conn !== 'undefined' && conn && (typeof isConnected === 'undefined' || isConnected) && typeof conn.send === 'function') {
      conn.send(payload);
      return true;
    }
    return false;
  }

  function getBaseId(engine, cardIdOrEl) {
    const id = typeof cardIdOrEl === 'string'
      ? cardIdOrEl
      : (cardIdOrEl?.dataset?.cardId || cardIdOrEl?.id || '');
    if (!id) return '';
    if (engine && typeof engine.getBaseCardId === 'function') return engine.getBaseCardId(id);
    return String(id).replace(/([/_](p\d+|s|sp\d*)|★)+$/i, '');
  }

  // 單／雙參數相容防護：同時支援 getV3IR(engine, cardDefOrEl) 與舊處誤呼叫 getV3IR(def)
  function getV3IR(engineOrCard, cardDefOrEl) {
    const cat = getCatalog();
    if (!cat) return null;
    let engine = engineOrCard;
    let target = cardDefOrEl;
    if (
      target === undefined &&
      engineOrCard &&
      typeof engineOrCard.getBaseCardId !== 'function' &&
      (typeof engineOrCard === 'string' || typeof engineOrCard.id === 'string' || engineOrCard.dataset)
    ) {
      target = engineOrCard;
      engine = null;
    }
    if (!target) return null;
    const bid = getBaseId(engine, target);
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

  let _treatAsDepth = 0;
  const _viewEvalStack = new Set();
  let _auraScanDepth = 0;

  function isCardSilenced(engine, cardEl) {
    if (!cardEl || !engine?.getRuntime) return false;
    const rt = engine.getRuntime(cardEl);
    return !!(rt?.silenced || rt?.tempKeywords?.SILENCE || rt?.persistentKeywords?.SILENCE);
  }

  function isEventLike(engine, def, ir, cardEl = null) {
    if (!def) return false;
    if (def.type === 'EVENT') return true;
    const tr = ir?.treatAsTypes || def.treatAsTypes;
    if (Array.isArray(tr) && tr.includes('EVENT')) return true;
    if (_treatAsDepth > 0) return false;
    _treatAsDepth++;
    try {
      for (const rule of engine?.tempTreatAsTypeRules || []) {
        if (Array.isArray(rule.treatAsTypes) && rule.treatAsTypes.includes('EVENT')) {
          if (!rule.filter || (cardEl && matchesFilter(engine, cardEl, rule.filter, null, {})) || (!cardEl && matchesFilterDef(engine, def, ir, rule.filter))) {
            return true;
          }
        }
      }
      if (engine && typeof engine.getSlotTopCards === 'function') {
        const myField = getZoneCards(engine, 'MY', 'FIELD');
        for (const provEl of myField) {
          if (isCardSilenced(engine, provEl)) continue;
          const provDef = engine.getCardDef(provEl);
          const provIr = getV3IR(engine, provDef);
          if (!provIr || !Array.isArray(provIr.continuous)) continue;
          for (const r of provIr.continuous) {
            if (!r.grantTreatAsTypesToCards) continue;
            if (r.when && !evalCondition(engine, r.when, provEl, {})) continue;
            const g = r.grantTreatAsTypesToCards;
            if (Array.isArray(g.treatAsTypes) && g.treatAsTypes.includes('EVENT')) {
              if (!g.filter || (cardEl && matchesFilter(engine, cardEl, g.filter, provEl, {})) || (!cardEl && matchesFilterDef(engine, def, ir, g.filter))) {
                return true;
              }
            }
          }
        }
      }
    } finally {
      _treatAsDepth--;
    }
    return false;
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

  function getRequiredEnergyOptions(def, ir, zone) {
    const base = typeof def.requiredEnergy === 'object'
      ? (def.requiredEnergy || { color: 'NONE', count: 0 })
      : { color: def.color || 'NONE', count: parseInt(def.requiredEnergy, 10) || 0 };
    const isAllColor = !!(ir?.allColor || def.allColor);
    const opts = [{ color: isAllColor ? 'ANY' : (base.color || 'NONE'), count: base.count || 0 }];
    const deckReq = ir?.deckRequiredEnergy ?? def.deckRequiredEnergy;
    if (zone === 'DECK' && deckReq !== undefined && deckReq !== null) {
      if (typeof deckReq === 'number') {
        opts.push({ color: isAllColor ? 'ANY' : (def.color || base.color || 'NONE'), count: deckReq });
      } else if (typeof deckReq === 'object') {
        opts.push({
          color: isAllColor ? 'ANY' : (deckReq.color || def.color || base.color || 'NONE'),
          count: deckReq.count || 0
        });
      }
    }
    return opts;
  }

  function matchesFilterDef(engine, def, ir, filter) {
    if (!filter) return true;
    if (filter.or) return filter.or.some(sub => matchesFilterDef(engine, def, ir, sub));
    if (!def) return false;
    if (filter.type) {
      if (filter.type === 'EVENT') {
        if (!isEventLike(engine, def, ir, null)) return false;
      } else if (def.type !== filter.type) return false;
    }
    const isAllColor = !!(ir?.allColor || def.allColor);
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
    if (filter.requireRaidKeyword && !def.compiledRules?.raidCondition) return false;
    const tType = def.compiledRules?.trigger?.type || ir?.trigger?.type;
    if (Array.isArray(filter.excludeTriggers) && tType && filter.excludeTriggers.includes(tType)) return false;
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
    return true;
  }

  function matchesFilter(engine, cardEl, filter, sourceCardEl = null, ctx = {}) {
    if (!filter) return true;
    if (filter.or) return filter.or.some(sub => matchesFilter(engine, cardEl, sub, sourceCardEl, ctx));
    if (!cardEl) return false;
    if (filter.excludeSelf && cardEl === sourceCardEl) return false;
    const def = engine.getCardDef(cardEl);
    if (!def) return false;
    const ir = getV3IR(engine, def);
    const rt = engine.getRuntime ? engine.getRuntime(cardEl) : null;

    if (filter.type) {
      if (filter.type === 'EVENT') {
        if (!isEventLike(engine, def, ir, cardEl)) return false;
      } else if (def.type !== filter.type) return false;
    }
    const zoneForEn = ctx?.zone || (cardEl.parentElement?.id === 'my-deck-area' || cardEl.parentElement?.id === 'opp-deck-area' ? 'DECK' : null);
    const enOpts = getRequiredEnergyOptions(def, ir, zoneForEn);
    const isAllColor = !!(ir?.allColor || def.allColor);
    if (filter.color && !isAllColor) {
      const colorMatch = def.color === filter.color || (zoneForEn === 'DECK' && enOpts.some(o => o.color === filter.color));
      if (!colorMatch) return false;
    }
    if (filter.excludeColor && !isAllColor && def.color === filter.excludeColor) return false;
    if (filter.nameIncludes && !cardMatchesName(def, ir, filter.nameIncludes)) return false;
    if (filter.excludeName && cardMatchesName(def, ir, filter.excludeName)) return false;
    if (filter.namesAny && !filter.namesAny.some(n => cardMatchesName(def, ir, n))) return false;
    if (filter.sameNameAsVar) {
      const rawRef = ctx?.vars?.[filter.sameNameAsVar];
      const refEl = Array.isArray(rawRef) ? rawRef[0] : rawRef;
      const refDef = refEl ? engine.getCardDef(refEl) : null;
      if (!refDef || !cardMatchesName(def, ir, refDef.name)) return false;
    }
    const traits = Array.isArray(def.traits) ? def.traits : [];
    if (filter.traitIncludes && !traits.some(t => t.includes(filter.traitIncludes))) return false;
    if (filter.traitsAny && !filter.traitsAny.some(want => traits.some(t => t.includes(want)))) return false;
    if (filter.excludeTrait && traits.some(t => t.includes(filter.excludeTrait))) return false;
    if (filter.noRaid && def.compiledRules?.raidCondition) return false;
    if (filter.requireRaidKeyword && !def.compiledRules?.raidCondition) return false;
    if (filter.requireRaided && !rt?.isRaided) return false;
    if (filter.requireFacedownUnder && getFacedownUnderCount(cardEl, true) <= 0) return false;
    if (filter.isFaceUp && cardEl.classList?.contains('is-flipped')) return false;
    const tType = def.compiledRules?.trigger?.type || ir?.trigger?.type;
    if (Array.isArray(filter.excludeTriggers) && tType && filter.excludeTriggers.includes(tType)) return false;

    const reqEn = typeof def.requiredEnergy === 'object' ? (def.requiredEnergy?.count || 0) : (parseInt(def.requiredEnergy, 10) || 0);
    if (filter.minEnergy !== undefined || filter.maxEnergy !== undefined || filter.exactEnergy !== undefined) {
      const enMatch = enOpts.some(o => {
        if (filter.color && !isAllColor && o.color !== filter.color && o.color !== 'ANY') return false;
        if (filter.minEnergy !== undefined && o.count < filter.minEnergy) return false;
        if (filter.maxEnergy !== undefined && o.count > filter.maxEnergy) return false;
        if (filter.exactEnergy !== undefined && o.count !== filter.exactEnergy) return false;
        return true;
      });
      if (!enMatch) return false;
    }

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

    const onField = !!(cardEl.closest && cardEl.closest('#my-front-line, #my-energy-line, #opp-front-line, #opp-energy-line'));
    if (filter.aboveOriginalBp) {
      if (!onField || _viewEvalStack.has(cardEl)) return false;
      if (engine.getEffectiveCardBp(cardEl) <= origBp) return false;
    }
    if (filter.maxBp !== undefined || filter.minBp !== undefined) {
      const bp = (onField && !_viewEvalStack.has(cardEl)) ? engine.getEffectiveCardBp(cardEl) : origBp;
      if (filter.maxBp !== undefined && bp > filter.maxBp) return false;
      if (filter.minBp !== undefined && bp < filter.minBp) return false;
    }
    return true;
  }

  function countZone(engine, query, sourceCardEl, ctx = {}) {
    const owners = query.owner === 'OPP' ? ['OPP'] : (query.owner === 'BOTH' ? ['MY', 'OPP'] : ['MY']);
    const zone = query.zone || 'FIELD';
    const matched = [];
    for (const o of owners) {
      for (const c of getZoneCards(engine, o, zone)) {
        if (c.classList?.contains('is-flipped') && (zone === 'FIELD' || zone === 'FRONT' || zone === 'ENERGY')) continue;
        if (matchesFilter(engine, c, query.filter, sourceCardEl, ctx)) matched.push(c);
      }
    }
    if (query.distinctNames) {
      const names = new Set();
      matched.forEach(c => { const n = engine.getCardDef(c)?.name; if (n) names.add(n); });
      return names.size;
    }
    return matched.length;
  }

  function calculateOwnerEnergy(engine, owner) {
    if (owner !== 'OPP') {
      return typeof engine.calculateMyEnergy === 'function' ? engine.calculateMyEnergy() : { ALL: 0 };
    }
    if (typeof engine.calculateOppEnergy === 'function') return engine.calculateOppEnergy();
    const totals = { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0, PURPLE: 0, ALL: 0 };
    const addCard = (c, requireFrontGen) => {
      if (!c || c.classList?.contains('is-flipped')) return;
      const v = evalContinuousView(engine, c);
      if (requireFrontGen && !v.generateEnergyInFront) return;
      const ge = v.generatedEnergy || engine.getCardDef(c)?.generatedEnergy;
      if (ge && ge.count > 0 && ge.color && totals[ge.color] !== undefined) {
        totals[ge.color] += ge.count;
        totals.ALL += ge.count;
      }
    };
    getZoneCards(engine, 'OPP', 'ENERGY').forEach(c => addCard(c, false));
    getZoneCards(engine, 'OPP', 'FRONT').forEach(c => addCard(c, true));
    return totals;
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
      case 'SELF_HAS_ABOVE_ORIG_BP': {
        if (!sourceCardEl || !sourceCardEl.closest?.('#my-front-line, #my-energy-line, #opp-front-line, #opp-energy-line')) return false;
        const bp = ctx.currentBp !== undefined ? ctx.currentBp : engine.getEffectiveCardBp(sourceCardEl);
        const orig = engine.getCardDef(sourceCardEl)?.bp || 0;
        return bp > orig;
      }
      case 'SELF_NOT_ENTERED_THIS_TURN':
        return !rt?.enteredThisTurn;
      case 'SELF_HAS_UNDER_GTE':
        return getFacedownUnderCount(sourceCardEl, cond.facedownOnly !== false) >= (cond.count ?? 1);
      case 'GENERATED_ENERGY_GTE': {
        if (engine._v3InEnergyEval) return false;
        engine._v3InEnergyEval = true;
        try {
          const en = calculateOwnerEnergy(engine, cond.owner === 'OPP' ? 'OPP' : 'MY');
          const val = cond.color ? (en[cond.color] || 0) : (en.ALL || 0);
          return val >= (cond.count ?? 0);
        } finally { engine._v3InEnergyEval = false; }
      }
      case 'GENERATED_ENERGY_LTE': {
        if (engine._v3InEnergyEval) return false;
        engine._v3InEnergyEval = true;
        try {
          const en = calculateOwnerEnergy(engine, cond.owner === 'OPP' ? 'OPP' : 'MY');
          const val = cond.color ? (en[cond.color] || 0) : (en.ALL || 0);
          return val <= (cond.count ?? 0);
        } finally { engine._v3InEnergyEval = false; }
      }
      case 'COUNT_ZONE': {
        const cnt = countZone(engine, cond, sourceCardEl, ctx);
        const op = cond.op || 'GTE';
        if (op === 'LTE') return cnt <= cond.count;
        if (op === 'EQ') return cnt === cond.count;
        return cnt >= cond.count;
      }
      case 'SAME_LINE_HAS_CHAR': {
        if (!sourceCardEl || !sourceCardEl.closest) return false;
        const inMyFront = !!sourceCardEl.closest('#my-front-line');
        const inMyEn = !!sourceCardEl.closest('#my-energy-line');
        const inOppFront = !!sourceCardEl.closest('#opp-front-line');
        const inOppEn = !!sourceCardEl.closest('#opp-energy-line');
        if (!inMyFront && !inMyEn && !inOppFront && !inOppEn) return false;
        const owner = (inOppFront || inOppEn) ? 'OPP' : 'MY';
        const line = (inMyFront || inOppFront) ? 'FRONT' : 'ENERGY';
        const lineFilter = cond.filter || (cond.name ? { nameIncludes: cond.name } : {});
        return getZoneCards(engine, owner, line).some(c => {
          if (cond.excludeSelf !== false && c === sourceCardEl) return false;
          return matchesFilter(engine, c, lineFilter, sourceCardEl, ctx);
        });
      }
      case 'ALL_FIELD_MATCH': {
        const owner = cond.owner === 'OPP' ? 'OPP' : 'MY';
        const cards = getZoneCards(engine, owner, cond.zone || 'FIELD');
        if (cond.requireNonEmpty && cards.length === 0) return false;
        return cards.every(c => matchesFilter(engine, c, cond.filter, sourceCardEl, ctx));
      }
      case 'FIELD_AND_OUTSIDE_MATCH': {
        const owner = cond.owner === 'OPP' ? 'OPP' : 'MY';
        const allCards = [...getZoneCards(engine, owner, 'FIELD'), ...getZoneCards(engine, owner, 'OUTSIDE')];
        const items = cond.itemFilter
          ? allCards.filter(c => matchesFilter(engine, c, cond.itemFilter, sourceCardEl, ctx))
          : allCards;
        if (cond.forbidAny) return items.length === 0;
        if (cond.requireNonEmpty && items.length === 0) return false;
        if (cond.requireAllMatch) {
          return items.every(c => matchesFilter(engine, c, cond.requireAllMatch, sourceCardEl, ctx));
        }
        return true;
      }
      case 'HAS_CHAR':
        return countZone(engine, { owner: 'MY', zone: 'FIELD', filter: { nameIncludes: cond.name } }, sourceCardEl, ctx) >= 1;
      case 'HAS_CHAR_IN_FRONT':
        return countZone(engine, { owner: 'MY', zone: 'FRONT', filter: { nameIncludes: cond.name } }, sourceCardEl, ctx) >= 1;
      case 'HAS_ANY_CHAR':
        return (cond.names || []).some(n => countZone(engine, { owner: 'MY', zone: 'FIELD', filter: { nameIncludes: n } }, sourceCardEl, ctx) >= 1);
      case 'HAS_RAIDED_CHAR_IN_FRONT':
        return countZone(engine, { owner: 'MY', zone: 'FRONT', filter: { nameIncludes: cond.name, requireRaided: true } }, sourceCardEl, ctx) >= 1;
      case 'OUTSIDE_EVENTS_GTE':
        return (typeof engine.countEventsInMyOutside === 'function' ? engine.countEventsInMyOutside() : 0) >= cond.count;
      case 'OUTSIDE_CARDS_GTE':
        return getZoneCards(engine, 'MY', 'OUTSIDE').length >= cond.count;
      case 'USED_EVENT_THIS_TURN':
        return (engine.isFirstPlayer === null || engine.isMyTurn) && !!engine.usedEventThisTurn;
      case 'USED_EVENT_COUNT_GTE':
        return (engine.isFirstPlayer === null || engine.isMyTurn) && (engine.usedEventCountThisTurn || 0) >= (cond.count ?? 1);
      case 'RETIRED_CHAR_NAME_THIS_TURN': {
        const clean = String(cond.name || '').replace(/\s+/g, '');
        return Array.isArray(engine.retiredCharNamesThisTurn)
          && engine.retiredCharNamesThisTurn.some(n => String(n).replace(/\s+/g, '').includes(clean));
      }
      case 'MOVED_THIS_TURN':
        return !!rt?.movedThisTurn;
      case 'MOVED_OUTSIDE_PHASE_THIS_TURN':
        return !!rt?.movedOutsideMovePhaseThisTurn;
      case 'ENTERED_FROM_REMOVE':
        return !!(rt?.enteredFromRemove || ctx.vars?.enteredFromRemove);
      case 'ENTERED_BY_CHARACTER_EFFECT':
        return !!(rt && (rt.enteredByCharEffect ?? rt.enteredByEffect));
      case 'TRIGGER_ACTIVATED_THIS_TURN':
        return cond.owner === 'BOTH'
          ? !!(engine.triggerActivatedThisTurn || engine.oppTriggeredThisTurn)
          : !!engine.triggerActivatedThisTurn;
      case 'DECK_EMPTY': {
        const owner = cond.owner === 'OPP' ? 'OPP' : 'MY';
        return getZoneCards(engine, owner, 'DECK').length === 0;
      }
      case 'HAS_FACEUP_DECK_OR_LIFE': {
        const doc = typeof document !== 'undefined' ? document : null;
        if (!doc) return false;
        const all = Array.from(doc.querySelectorAll('#my-deck-area .card, #my-life-area .card, #opp-deck-area .card, #opp-life-area .card'));
        return all.some(c => !c.classList?.contains('is-flipped'));
      }
      case 'HAS_FACEDOWN_UNDER':
        return getFacedownUnderCount(sourceCardEl, true) > 0;
      case 'NO_FACEDOWN_UNDER_BEFORE_RETIRE':
        return !(ctx.hadFacedownUnder ?? rt?.hadFacedownUnder);
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
      case 'ALL_MY_CHARS_TRAITLESS':
        return getZoneCards(engine, 'MY', 'FIELD').every(c => {
          const d = engine.getCardDef(c);
          return !d || d.type !== 'CHARACTER' || !Array.isArray(d.traits) || d.traits.length === 0;
        });
      case 'DISTINCT_TRAIT_NAMES_GTE':
        return countZone(engine, { owner: 'MY', zone: 'FIELD', filter: { traitIncludes: cond.trait }, distinctNames: true }, sourceCardEl, ctx) >= cond.count;
      case 'OPP_FRONT_HAS_LOWERED_BP':
        return typeof engine.hasOppLoweredBpChar === 'function' ? engine.hasOppLoweredBpChar() : false;
      case 'HAS_RAID_BASE_IN_OUTSIDE': {
        const bases = ctx.raidBaseIds || rt?.lastRaidBases || [];
        return bases.some(el => el?.parentElement?.id === 'my-outside-area');
      }
      case 'SELECTED_MATCHES': {
        const raw = ctx.vars?.[cond.varKey || 'selected'] ?? ctx.selected;
        const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        return arr.some(c => matchesFilter(engine, c, cond.filter, sourceCardEl, ctx));
      }
      case 'VAR_TRUTHY': {
        const v = ctx.vars?.[cond.key];
        if (Array.isArray(v)) return v.length > 0;
        return !!(v || (cond.key === 'added' && ctx.addedFromLook));
      }
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
    if (cond.type === 'SELF_BP_GTE' || cond.type === 'SELF_BP_LTE' || cond.type === 'SELF_HAS_ABOVE_ORIG_BP') return true;
    if (cond.type === 'NOT') return condDependsOnSelfBp(cond.cond);
    if (cond.type === 'AND') return (cond.all || []).some(condDependsOnSelfBp);
    if (cond.type === 'OR') return (cond.any || []).some(condDependsOnSelfBp);
    return false;
  }

  // ==================== 常駐視圖計算（解決 A1 479 張常駐失效 ＋ B1~B8 全部欄位）====================
  function evalContinuousView(engine, cardEl) {
    const empty = {
      bpDelta: 0, impact: 0, damage: 0, step: false, snipe: false,
      snipeForbiddenMinBp: 0,
      doubleAttack: false, doubleBlock: false, impactNullify: false,
      immuneToBpMinus: false, immuneToOppLeave: false, immuneToOppRetire: false,
      untargetableByOpp: false, untargetableSources: [],
      targetTaxAp: 0, mustBlock: false, blockedTriggers: [],
      stripsImpactNullify: false, cannotBeRaided: false, canBeRaidedByTrigger: false,
      freeExtraDraw: false, grantStepToOthers: false, grantTreatAsTypesToCards: [],
      triggerOverrides: null, replaceLeaveDest: null, excessDiscardDest: null,
      silenced: false, standOnBattleLossOnce: false,
      cannotMove: false, cannotMoveToFront: false,
      cannotBlock: false, cannotAttack: false,
      unblockableMaxBp: 0, unblockableMinBp: 0,
      generateEnergyInFront: false, genEnergyBonus: 0,
      generatedEnergy: { color: 'NONE', count: 0 }
    };
    if (!cardEl) return empty;
    if (_viewEvalStack.has(cardEl)) return empty;
    const def = engine.getCardDef(cardEl);
    if (!def) return empty;
    const ir = getV3IR(engine, def);
    const rt = engine.getRuntime ? engine.getRuntime(cardEl) : null;
    const silenced = !!(rt?.silenced || rt?.tempKeywords?.SILENCE || rt?.persistentKeywords?.SILENCE);

    const baseGen = def.generatedEnergy && typeof def.generatedEnergy === 'object'
      ? { color: def.generatedEnergy.color || 'NONE', count: def.generatedEnergy.count || 0 }
      : { color: def.color || 'NONE', count: parseInt(def.generatedEnergy, 10) || 0 };

    const kw = silenced ? {} : (ir?.staticKeywords || {});
    const untargetableSources = Array.isArray(kw.untargetableSources)
      ? [...kw.untargetableSources]
      : (kw.untargetableByOpp ? ['ALL'] : []);
    const blockedTriggers = Array.isArray(kw.blockedTriggers) ? [...kw.blockedTriggers] : [];

    const out = {
      ...empty,
      impact: Number(kw.impact) || 0,
      damage: Number(kw.damage) || 0,
      step: !!kw.step,
      snipe: !!kw.snipe,
      snipeForbiddenMinBp: kw.snipeForbiddenMinBp || 0,
      doubleAttack: !!kw.doubleAttack,
      doubleBlock: !!kw.doubleBlock,
      impactNullify: !!kw.impactNullify,
      immuneToBpMinus: !!kw.immuneToBpMinus,
      immuneToOppLeave: !!kw.immuneToOppLeave,
      immuneToOppRetire: !!kw.immuneToOppRetire,
      untargetableByOpp: !!kw.untargetableByOpp,
      untargetableSources,
      targetTaxAp: Number(kw.targetTaxAp) || 0,
      mustBlock: !!kw.mustBlock,
      blockedTriggers,
      stripsImpactNullify: !!kw.stripsImpactNullify,
      cannotBeRaided: !!kw.cannotBeRaided,
      canBeRaidedByTrigger: !!((!silenced && (ir?.canBeRaidedByTrigger || def.canBeRaidedByTrigger)) || kw.canBeRaidedByTrigger),
      freeExtraDraw: !!kw.freeExtraDraw,
      grantStepToOthers: false,
      grantTreatAsTypesToCards: [],
      triggerOverrides: silenced ? null : (ir?.triggerOverrides || def.triggerOverrides || null),
      replaceLeaveDest: silenced ? null : (ir?.replaceLeaveDest || def.replaceLeaveDest || null),
      excessDiscardDest: silenced ? null : (ir?.excessDiscardDest || def.excessDiscardDest || null),
      silenced,
      cannotMove: !!kw.cannotMove,
      cannotMoveToFront: !!(kw.cannotMoveToFront || (!silenced && (ir?.cannotPlayFront || def.cannotPlayFront))),
      cannotBlock: !!kw.cannotBlock,
      cannotAttack: !!kw.cannotAttack,
      unblockableMaxBp: kw.unblockableMaxBp || 0,
      unblockableMinBp: kw.unblockableMinBp || 0,
      generateEnergyInFront: !!(!silenced && (ir?.generateEnergyInFront || def.generateEnergyInFront)),
      generatedEnergy: baseGen
    };

    const addUntargetableSources = (srcs) => {
      for (const s of srcs || []) {
        if (!out.untargetableSources.includes(s)) out.untargetableSources.push(s);
      }
      if (out.untargetableSources.includes('ALL')) out.untargetableByOpp = true;
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
      if (rule.grantUntargetableByOpp) { out.untargetableByOpp = true; addUntargetableSources(['ALL']); }
      if (rule.grantUntargetableSources) addUntargetableSources(rule.grantUntargetableSources);
      if (rule.grantTargetTaxAp) out.targetTaxAp += rule.grantTargetTaxAp;
      if (rule.grantMustBlock) out.mustBlock = true;
      if (rule.grantStripsImpactNullify) out.stripsImpactNullify = true;
      if (rule.grantCannotBeRaided) out.cannotBeRaided = true;
      if (rule.grantCanBeRaidedByTrigger) out.canBeRaidedByTrigger = true;
      if (rule.grantFreeExtraDraw) out.freeExtraDraw = true;
      if (rule.grantStepToOthers) out.grantStepToOthers = true;
      if (rule.grantBlockedTriggers) {
        for (const bt of rule.grantBlockedTriggers) if (!out.blockedTriggers.includes(bt)) out.blockedTriggers.push(bt);
      }
      if (rule.grantTreatAsTypesToCards) out.grantTreatAsTypesToCards.push(rule.grantTreatAsTypesToCards);
      if (rule.grantCannotBlock) out.cannotBlock = true;
      if (rule.grantCannotAttack) out.cannotAttack = true;
      if (rule.grantCannotMove) out.cannotMove = true;
      if (rule.cannotMoveToFront || rule.cannotPlayFront) out.cannotMoveToFront = true;
      if (rule.grantUnblockableMaxBp) out.unblockableMaxBp = Math.max(out.unblockableMaxBp, rule.grantUnblockableMaxBp);
      if (rule.grantUnblockableMinBp) {
        out.unblockableMinBp = out.unblockableMinBp ? Math.min(out.unblockableMinBp, rule.grantUnblockableMinBp) : rule.grantUnblockableMinBp;
      }
      if (rule.generateEnergyInFront) out.generateEnergyInFront = true;
      if (rule.genEnergyDelta) {
        out.genEnergyBonus += rule.genEnergyDelta.count || 0;
        if (out.generatedEnergy.color === 'NONE') out.generatedEnergy.color = rule.genEnergyDelta.color;
        out.generatedEnergy.count += rule.genEnergyDelta.count || 0;
      }
    };

    const getSlotTopCard = (slot) => {
      if (!slot) return null;
      if (typeof engine.getTopCardInSlot === 'function') return engine.getTopCardInSlot(slot);
      const cards = slot.querySelectorAll?.('.card');
      return cards && cards.length ? cards[cards.length - 1] : null;
    };
    const isMyFieldTop = !!(cardEl.closest?.('#my-front-line, #my-energy-line') && getSlotTopCard(cardEl.parentElement) === cardEl);
    const isOppFieldTop = !!(cardEl.closest?.('#opp-front-line, #opp-energy-line') && getSlotTopCard(cardEl.parentElement) === cardEl);
    const isTopOnField = isMyFieldTop || isOppFieldTop;
    const inAnySlot = !!cardEl.closest?.('#my-front-line, #my-energy-line, #opp-front-line, #opp-energy-line');

    _viewEvalStack.add(cardEl);
    try {
      const deferred = [];
      if (!silenced && Array.isArray(ir?.continuous)) {
        for (const rule of ir.continuous) {
          if (!isTopOnField) {
            if (inAnySlot) continue;
            if (!rule.cannotPlayFront && !rule.cannotMoveToFront) continue;
            if (!evalCondition(engine, rule.when, cardEl, {})) continue;
            out.cannotMoveToFront = true;
            continue;
          }
          if (rule.requireRaided && !rt?.isRaided) continue;
          if (condDependsOnSelfBp(rule.when)) { deferred.push(rule); continue; }
          if (!evalCondition(engine, rule.when, cardEl, {})) continue;
          applyRule(rule);
          if (rule.auraToAllies) {
            const auras = Array.isArray(rule.auraToAllies) ? rule.auraToAllies : [rule.auraToAllies];
            for (const a of auras) {
              if (a.includeSelf && (!a.filter || matchesFilter(engine, cardEl, a.filter, cardEl, {}))) {
                if (a.bpDelta) out.bpDelta += a.bpDelta;
                if (a.grantStep) out.step = true;
                if (a.grantUntargetableSources) addUntargetableSources(a.grantUntargetableSources);
              }
            }
          }
        }
      }

      // 場上他卡擴散光環（auraToAllies 與 grantStepToOthers，防重入）
      if (isTopOnField && _auraScanDepth === 0) {
        _auraScanDepth++;
        try {
          const ownerKey = isOppFieldTop ? 'OPP' : 'MY';
          const inFront = !!cardEl.closest?.(isOppFieldTop ? '#opp-front-line' : '#my-front-line');
          const inEnergy = !!cardEl.closest?.(isOppFieldTop ? '#opp-energy-line' : '#my-energy-line');
          for (const provEl of getZoneCards(engine, ownerKey, 'FIELD')) {
            if (provEl === cardEl) continue;
            if (isCardSilenced(engine, provEl)) continue;
            const provDef = engine.getCardDef(provEl);
            const provIr = getV3IR(engine, provDef);
            if (!provIr || !Array.isArray(provIr.continuous)) continue;
            const provRt = engine.getRuntime ? engine.getRuntime(provEl) : null;
            for (const rule of provIr.continuous) {
              if (!rule.auraToAllies && !rule.grantStepToOthers) continue;
              if (rule.requireRaided && !provRt?.isRaided) continue;
              if (condDependsOnSelfBp(rule.when)) continue;
              if (!evalCondition(engine, rule.when, provEl, {})) continue;
              if (rule.grantStepToOthers) out.step = true;
              if (!rule.auraToAllies) continue;
              const auras = Array.isArray(rule.auraToAllies) ? rule.auraToAllies : [rule.auraToAllies];
              for (const a of auras) {
                if (a.line === 'FRONT' && !inFront) continue;
                if (a.line === 'ENERGY' && !inEnergy) continue;
                if (a.filter && !matchesFilter(engine, cardEl, a.filter, provEl, {})) continue;
                if (a.bpDelta) out.bpDelta += a.bpDelta;
                if (a.grantStep) out.step = true;
                if (a.grantUntargetableSources) addUntargetableSources(a.grantUntargetableSources);
              }
            }
          }
        } finally {
          _auraScanDepth--;
        }
      }

      // 讀取運行時 tempKeywords / persistentKeywords（含沉默後新增之動態關鍵字／B1~B8 欄位）
      for (const bag of [rt?.tempKeywords, rt?.persistentKeywords]) {
        if (!bag) continue;
        if (bag.IMPACT) out.impact = Math.max(out.impact, Number(bag.IMPACT) || 0);
        if (bag.IMPACT_PLUS) out.impact += Number(bag.IMPACT_PLUS) || 0;
        if (bag.DAMAGE) out.damage = Math.max(out.damage, Number(bag.DAMAGE) || 0);
        if (bag.STEP) out.step = true;
        if (bag.SNIPE) out.snipe = true;
        if (bag.DOUBLE_ATTACK) out.doubleAttack = true;
        if (bag.DOUBLE_BLOCK) out.doubleBlock = true;
        if (bag.IMPACT_NULLIFY) out.impactNullify = true;
        if (bag.IMMUNE_TO_BP_MINUS) out.immuneToBpMinus = true;
        if (bag.IMMUNE_TO_OPP_LEAVE) out.immuneToOppLeave = true;
        if (bag.IMMUNE_TO_OPP_RETIRE) out.immuneToOppRetire = true;
        if (bag.CANNOT_MOVE) out.cannotMove = true;
        if (bag.CANNOT_BLOCK) out.cannotBlock = true;
        if (bag.CANNOT_ATTACK) out.cannotAttack = true;
        if (bag.UNTARGETABLE_BY_OPP) { out.untargetableByOpp = true; addUntargetableSources(['ALL']); }
        if (bag.UNTARGETABLE_SOURCES) addUntargetableSources(Array.isArray(bag.UNTARGETABLE_SOURCES) ? bag.UNTARGETABLE_SOURCES : [bag.UNTARGETABLE_SOURCES]);
        if (bag.TARGET_TAX_AP) out.targetTaxAp += Number(bag.TARGET_TAX_AP) || 1;
        if (bag.MUST_BLOCK) out.mustBlock = true;
        if (bag.CANNOT_BE_RAIDED) out.cannotBeRaided = true;
        if (bag.STRIPS_IMPACT_NULLIFY) out.stripsImpactNullify = true;
        if (bag.BLOCKED_TRIGGERS) {
          for (const bt of (Array.isArray(bag.BLOCKED_TRIGGERS) ? bag.BLOCKED_TRIGGERS : [bag.BLOCKED_TRIGGERS])) {
            if (!out.blockedTriggers.includes(bt)) out.blockedTriggers.push(bt);
          }
        }
        if (bag.SNIPE_FORBIDDEN_MIN_BP) {
          out.snipeForbiddenMinBp = out.snipeForbiddenMinBp ? Math.min(out.snipeForbiddenMinBp, bag.SNIPE_FORBIDDEN_MIN_BP) : bag.SNIPE_FORBIDDEN_MIN_BP;
        }
        if (bag.UNBLOCKABLE_MIN_BP) {
          out.unblockableMinBp = out.unblockableMinBp ? Math.min(out.unblockableMinBp, bag.UNBLOCKABLE_MIN_BP) : bag.UNBLOCKABLE_MIN_BP;
        }
        if (bag.UNBLOCKABLE_MAX_BP) out.unblockableMaxBp = Math.max(out.unblockableMaxBp, bag.UNBLOCKABLE_MAX_BP);
        if (bag.GENERATE_ENERGY_IN_FRONT || bag.TEMP_FRONT_ENERGY) out.generateEnergyInFront = true;
        if (bag.STAND_ON_BATTLE_LOSS_ONCE) out.standOnBattleLossOnce = true;
        if (bag.REPLACE_LEAVE_WITH_BOUNCE && !out.replaceLeaveDest) out.replaceLeaveDest = { to: 'HAND', optional: true };
      }

      if (Array.isArray(rt?.tempEnergyBoost)) {
        for (const boost of rt.tempEnergyBoost) {
          const cnt = boost.count ?? boost.amount ?? 0;
          if (out.generatedEnergy.color === 'NONE' && boost.color) out.generatedEnergy.color = boost.color;
          out.generatedEnergy.count += cnt;
          out.genEnergyBonus += cnt;
        }
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
    } finally {
      _viewEvalStack.delete(cardEl);
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

  // ==================== 確定性 v3 步驟執行器（DOM / 多人同步 / Pre-M2b 相容回退）====================
  function canPayV3Cost(engine, cardEl, cost) {
    if (!cost) return false;
    if (cost.type === 'FREE') return true;
    if (cost.type === 'ANY_OF') {
      return (cost.options || []).some(opt => canPayV3Cost(engine, cardEl, opt));
    }
    if (cost.type === 'DISCARD_HAND') {
      const cands = getZoneCards(engine, 'MY', 'HAND').filter(c => matchesFilter(engine, c, cost.filter, cardEl));
      return cands.length >= (cost.count || 1);
    }
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
    if (cost.type === 'ANY_OF') {
      const payable = (cost.options || []).filter(opt => canPayV3Cost(engine, cardEl, opt));
      if (payable.length === 0) { onDone(); return; }
      if (payable.length === 1) { payV3CostThen(engine, cardEl, payable[0], thenSteps, ctx, onDone); return; }
      const btns = payable.map((opt, idx) => ({
        label: opt.label || opt.type,
        color: idx % 2 === 0 ? '#27ae60' : '#4f739e',
        onClick: () => payV3CostThen(engine, cardEl, opt, thenSteps, ctx, onDone)
      }));
      engine.promptModal({
        title: '選擇支付代價方式',
        desc: '請選擇要支付哪一項代價：',
        cards: [],
        customButtons: btns
      });
      return;
    }
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
        if (cost.storeAs) {
          ctx.vars = ctx.vars || {};
          ctx.vars[cost.storeAs] = unders[i];
        }
      }
      runThen(); return;
    }
    if (cost.type === 'DISCARD_HAND') {
      runV3Steps(engine, cardEl, [{ op: 'DISCARD_HAND', count: cost.count || 1, min: cost.count || 1, filter: cost.filter, storeAs: cost.storeAs }, ...thenSteps], ctx, onDone);
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
      if (typeof engine.requestBottomOpponentCard === 'function') engine.requestBottomOpponentCard(cardEl);
      return;
    }
    const deck = doc?.getElementById('my-deck-area');
    const outside = doc?.getElementById('my-outside-area');
    if (slot.classList?.contains('slot')) {
      Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl).forEach(u => {
        u.classList.remove('is-flipped');
        if (outside) engine.moveCardToZone(u, outside);
      });
    }
    if (deck) {
      cardEl.classList.remove('rest');
      cardEl.classList.add('is-flipped');
      deck.insertBefore(cardEl, deck.firstChild);
    }
  }

  function sendFieldCardToDeckTop(engine, cardEl) {
    const doc = typeof document !== 'undefined' ? document : null;
    const slot = cardEl?.parentElement;
    if (!slot) return;
    if (slot.id && slot.id.startsWith('opp-')) {
      if (typeof engine.requestTopOpponentCard === 'function') engine.requestTopOpponentCard(cardEl);
      else safeConnSend({ type: 'ENGINE_EVENT', subType: 'TOP_OPPONENT_CARD', slotId: slot.id.replace(/^opp-/, 'my-'), cardId: cardEl.dataset?.cardId });
      return;
    }
    const deck = doc?.getElementById('my-deck-area');
    const outside = doc?.getElementById('my-outside-area');
    if (slot.classList?.contains('slot')) {
      Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl).forEach(u => {
        u.classList.remove('is-flipped');
        if (outside) engine.moveCardToZone(u, outside);
      });
    }
    if (deck) {
      cardEl.classList.remove('rest');
      cardEl.classList.add('is-flipped');
      deck.appendChild(cardEl);
    }
  }

  function sendFieldCardToRemove(engine, cardEl) {
    const doc = typeof document !== 'undefined' ? document : null;
    const slot = cardEl?.parentElement;
    if (!slot) return;
    if (slot.id && slot.id.startsWith('opp-')) {
      if (typeof engine.requestRemoveOpponentCard === 'function') engine.requestRemoveOpponentCard(cardEl);
      return;
    }
    const removeArea = doc?.getElementById('my-remove-area');
    const outside = doc?.getElementById('my-outside-area');
    if (slot.classList?.contains('slot')) {
      Array.from(slot.querySelectorAll('.card')).filter(c => c !== cardEl).forEach(u => {
        u.classList.remove('is-flipped');
        if (outside) engine.moveCardToZone(u, outside);
      });
    }
    if (removeArea) engine.moveCardToZone(cardEl, removeArea);
  }

  function applyModifierToCard(engine, cardEl, kind, value, expiresAt) {
    if (!cardEl) return;
    const rt = engine.getRuntime ? engine.getRuntime(cardEl) : null;
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
    else if (kind === 'UNTARGETABLE_SOURCES') {
      const cur = Array.isArray(bag.UNTARGETABLE_SOURCES) ? bag.UNTARGETABLE_SOURCES : [];
      for (const s of (Array.isArray(value) ? value : [value])) if (!cur.includes(s)) cur.push(s);
      bag.UNTARGETABLE_SOURCES = cur;
    }
    else if (kind === 'TARGET_TAX_AP') bag.TARGET_TAX_AP = (Number(bag.TARGET_TAX_AP) || 0) + (Number(value) || 1);
    else if (kind === 'MUST_BLOCK') bag.MUST_BLOCK = true;
    else if (kind === 'CANNOT_BE_RAIDED') bag.CANNOT_BE_RAIDED = true;
    else if (kind === 'STRIPS_IMPACT_NULLIFY') bag.STRIPS_IMPACT_NULLIFY = true;
    else if (kind === 'BLOCKED_TRIGGERS') {
      const cur = Array.isArray(bag.BLOCKED_TRIGGERS) ? bag.BLOCKED_TRIGGERS : [];
      for (const b of (Array.isArray(value) ? value : [value])) if (!cur.includes(b)) cur.push(b);
      bag.BLOCKED_TRIGGERS = cur;
    }
    else if (kind === 'SNIPE_FORBIDDEN_MIN_BP') bag.SNIPE_FORBIDDEN_MIN_BP = bag.SNIPE_FORBIDDEN_MIN_BP ? Math.min(bag.SNIPE_FORBIDDEN_MIN_BP, value) : value;
    else if (kind === 'STAND_ON_BATTLE_LOSS_ONCE') bag.STAND_ON_BATTLE_LOSS_ONCE = true;
    else if (kind === 'IMMUNE_TO_OPP_LEAVE') bag.IMMUNE_TO_OPP_LEAVE = true;
    else if (kind === 'IMMUNE_TO_OPP_RETIRE') bag.IMMUNE_TO_OPP_RETIRE = true;
    else if (kind === 'IMMUNE_TO_BP_MINUS') bag.IMMUNE_TO_BP_MINUS = true;
    else if (kind === 'CANNOT_MOVE') bag.CANNOT_MOVE = true;
    else if (kind === 'CANNOT_BLOCK') bag.CANNOT_BLOCK = true;
    else if (kind === 'CANNOT_ATTACK') bag.CANNOT_ATTACK = true;
    else if (kind === 'SILENCE') {
      rt.silenced = true;
      bag.SILENCE = true;
    }
    else if (kind === 'GEN_ENERGY_IN_FRONT' || kind === 'GENERATE_ENERGY_IN_FRONT' || kind === 'TEMP_FRONT_ENERGY') bag.GENERATE_ENERGY_IN_FRONT = 1;
    else if (kind === 'REPLACE_LEAVE_WITH_BOUNCE') bag.REPLACE_LEAVE_WITH_BOUNCE = 1;
    else if (kind === 'TEMP_GEN_ENERGY' && value) {
      rt.tempEnergyBoost = rt.tempEnergyBoost || [];
      rt.tempEnergyBoost.push({ color: value.color, count: value.count || 1, amount: value.count || 1 });
    } else if (kind === 'TEMP_ABILITY' && value?.timing && value.ab) {
      rt.v3TempAbilities = rt.v3TempAbilities || [];
      rt.v3TempAbilities.push({ timing: value.timing, ab: value.ab, expiresAt: expiresAt || 'END_OF_TURN' });
    }
  }

  function resolveTargets(sourceCardEl, targetKey, step = null, ctx = {}) {
    if (targetKey === 'SELF') return sourceCardEl ? [sourceCardEl] : [];
    if (targetKey === 'RAID_TARGET') {
      const rtEl = ctx.raidTarget || ctx.raidInstanceEl || ctx.raidInstanceId;
      if (rtEl) return [rtEl];
      if (Array.isArray(ctx.raidBaseIds) && ctx.raidBaseIds.length > 0) return [ctx.raidBaseIds[0]];
      return [];
    }
    if (targetKey === 'VAR' || targetKey === 'FROM_VAR') {
      const k = step?.fromVar || ctx._varKey;
      const v = k ? ctx.vars?.[k] : null;
      return Array.isArray(v) ? v : (v ? [v] : []);
    }
    return ctx.selected || [];
  }

  function moveSlotCardWithFallback(engine, fromSlot, toSlot, opts = {}) {
    if (!fromSlot || !toSlot || fromSlot === toSlot) return false;
    if (typeof engine.moveSlotCard === 'function') {
      return engine.moveSlotCard(fromSlot, toSlot, opts);
    }
    const cards = Array.from(fromSlot.querySelectorAll('.card'));
    if (cards.length === 0) return false;
    const fromTr = fromSlot.querySelector?.('.bp-tracker');
    const bpDelta = fromTr ? (parseInt(fromTr.dataset.bp, 10) || 0) : 0;
    cards.forEach(c => toSlot.appendChild(c));
    safeUpdateBpDisplay(fromSlot, 0);
    if (bpDelta !== 0) safeUpdateBpDisplay(toSlot, bpDelta);
    safeRecalcStacking(fromSlot);
    safeRecalcStacking(toSlot);
    safeUpdateSlotCounts();
    const topCard = cards[cards.length - 1];
    const rt = engine.getRuntime ? engine.getRuntime(topCard) : null;
    if (rt) {
      rt.movedThisTurn = true;
      if (!opts.isMovePhase) rt.movedOutsideMovePhaseThisTurn = true;
    }
    if (!opts.isMovePhase) {
      tryTriggerV3(engine, topCard, 'ON_NON_PHASE_MOVE');
    }
    return true;
  }

  function swapSlotCardsWithFallback(engine, slotA, slotB, opts = {}) {
    if (!slotA || !slotB || slotA === slotB) return false;
    if (typeof engine.swapSlotCards === 'function') {
      return engine.swapSlotCards(slotA, slotB, opts);
    }
    const cardsA = Array.from(slotA.querySelectorAll('.card'));
    const cardsB = Array.from(slotB.querySelectorAll('.card'));
    const trA = slotA.querySelector?.('.bp-tracker');
    const trB = slotB.querySelector?.('.bp-tracker');
    const bpA = trA ? (parseInt(trA.dataset.bp, 10) || 0) : 0;
    const bpB = trB ? (parseInt(trB.dataset.bp, 10) || 0) : 0;
    cardsA.forEach(c => slotB.appendChild(c));
    cardsB.forEach(c => slotA.appendChild(c));
    safeUpdateBpDisplay(slotA, bpB);
    safeUpdateBpDisplay(slotB, bpA);
    safeRecalcStacking(slotA);
    safeRecalcStacking(slotB);
    safeUpdateSlotCounts();
    for (const topCard of [cardsA[cardsA.length - 1], cardsB[cardsB.length - 1]]) {
      if (!topCard) continue;
      const rt = engine.getRuntime ? engine.getRuntime(topCard) : null;
      if (rt) {
        rt.movedThisTurn = true;
        if (!opts.isMovePhase) rt.movedOutsideMovePhaseThisTurn = true;
      }
      if (!opts.isMovePhase) {
        tryTriggerV3(engine, topCard, 'ON_NON_PHASE_MOVE');
      }
    }
    return true;
  }

  function safeExecuteRaidSummon(engine, cardEl, cDef, targetSlot, moveToFront, onDone) {
    const rawFinalize = engine._rawFinalizeDrop
      || (typeof finalizeDrop === 'function' ? finalizeDrop : null)
      || ((cards, slot) => { cards.forEach(c => { c.classList?.remove('is-flipped', 'rest'); slot.appendChild(c); }); });
    if (typeof engine.executeRaidSummon === 'function') {
      engine.executeRaidSummon(cardEl, cDef, targetSlot, moveToFront, cardEl.parentElement, 0, rawFinalize, true, onDone);
      return;
    }
    rawFinalize([cardEl], targetSlot, 'top-faceup', cardEl.parentElement, 0);
    const rt = engine.getRuntime ? engine.getRuntime(cardEl) : null;
    if (rt) { rt.enteredThisTurn = true; rt.isRaided = true; }
    if (moveToFront) {
      const doc = typeof document !== 'undefined' ? document : null;
      const emptyFl = doc ? Array.from(doc.querySelectorAll('#my-front-line .slot')).find(s => s.querySelectorAll('.card').length === 0) : null;
      if (emptyFl) moveSlotCardWithFallback(engine, targetSlot, emptyFl, { isMovePhase: false });
    }
    if (typeof engine.triggerCardAbilities === 'function') engine.triggerCardAbilities(cardEl, 'ON_PLAY', onDone);
    else if (onDone) onDone();
  }

  function collectValidRaidSlots(engine, cardDef) {
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc || !cardDef?.compiledRules?.raidCondition || typeof engine.canRaidOntoSlot !== 'function') return [];
    const out = [];
    doc.querySelectorAll('#my-front-line .slot, #my-energy-line .slot').forEach(slot => {
      if (!engine.canRaidOntoSlot(cardDef, slot)) return;
      const top = engine.getTopCardInSlot ? engine.getTopCardInSlot(slot) : null;
      if (!top) return;
      if (evalContinuousView(engine, top).cannotBeRaided) return;
      out.push(slot);
    });
    return out;
  }

  function dispatchDiscardTrigger(engine, discardedEl, sourceCardEl, onDone) {
    const sourceDef = sourceCardEl ? engine.getCardDef(sourceCardEl) : null;
    const handled = tryTriggerV3(engine, discardedEl, 'ON_DISCARDED_BY_EFFECT', { sourceDef, sourceCardEl }, onDone);
    if (!handled && onDone) onDone();
  }

  function isUntargetableBySourceView(view, sourceKind) {
    const srcs = view?.untargetableSources || [];
    if (view?.untargetableByOpp || srcs.includes('ALL')) return true;
    if (!sourceKind) return false;
    if (sourceKind === 'EVENT_FROM_HAND') return srcs.includes('EVENT_FROM_HAND') || srcs.includes('EVENT');
    return srcs.includes(sourceKind);
  }

  function runV3Steps(engine, sourceCardEl, steps, ctx = {}, onComplete = null) {
    if (!ctx.vars) ctx.vars = {};
    if (!ctx.selected) ctx.selected = [];
    const doc = typeof document !== 'undefined' ? document : null;
    const def = sourceCardEl ? engine.getCardDef(sourceCardEl) : null;

    const execAt = (idx) => {
      if (!steps || idx >= steps.length) {
        if (typeof engine.updateEnergyHUD === 'function') engine.updateEnergyHUD();
        safeBroadcastMyState();
        if (onComplete) onComplete();
        return;
      }
      const step = steps[idx];
      const next = () => execAt(idx + 1);
      const targets = (t) => resolveTargets(sourceCardEl, t, step, ctx);

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
            if (c.parentElement?.id?.startsWith('opp-')) {
              if (typeof engine.requestRestOpponentCard === 'function') engine.requestRestOpponentCard(c);
            } else c.classList?.add('rest');
          });
          next(); return;
        }
        case 'FREEZE': {
          targets(step.target || 'SELECTED').forEach(c => {
            if (c.parentElement?.id?.startsWith('opp-')) {
              if (typeof engine.requestFreezeOpponentCard === 'function') engine.requestFreezeOpponentCard(c);
            } else {
              const r = engine.getRuntime(c);
              if (r) r.frozenNextTurn = true;
            }
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
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx))
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
          targets(step.target).forEach(c => {
            if (c.parentElement?.id?.startsWith('opp-')) {
              if (typeof engine.requestApplyOpponentModifier === 'function') {
                engine.requestApplyOpponentModifier(c, step.kind, step.value ?? 1, step.expiresAt || 'END_OF_TURN');
              } else if (!safeConnSend({ type: 'ENGINE_EVENT', subType: 'FORCE_APPLY_MODIFIER', slotId: c.parentElement.id.replace(/^opp-/, 'my-'), kind: step.kind, value: step.value ?? 1, expiresAt: step.expiresAt || 'END_OF_TURN' })) {
                applyModifierToCard(engine, c, step.kind, step.value ?? 1, step.expiresAt);
              }
            } else {
              applyModifierToCard(engine, c, step.kind, step.value ?? 1, step.expiresAt);
            }
          });
          next(); return;
        }
        case 'GRANT_MODIFIER_ALL': {
          getZoneCards(engine, step.owner || 'MY', step.line || 'FIELD')
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx))
            .forEach(c => applyModifierToCard(engine, c, step.kind, step.value ?? 1, step.expiresAt));
          next(); return;
        }
        case 'SILENCE': {
          const exp = step.expiresAt || 'NEXT_OWNER_TURN_START';
          targets(step.target || 'SELECTED').forEach(c => {
            applyModifierToCard(engine, c, 'SILENCE', 1, exp);
            if (c.parentElement?.id?.startsWith('opp-')) {
              if (typeof engine.requestApplyOpponentModifier === 'function') {
                engine.requestApplyOpponentModifier(c, 'SILENCE', 1, exp);
              } else {
                safeConnSend({ type: 'ENGINE_EVENT', subType: 'FORCE_APPLY_MODIFIER', slotId: c.parentElement.id.replace(/^opp-/, 'my-'), kind: 'SILENCE', value: 1, expiresAt: exp });
              }
            }
          });
          next(); return;
        }
        case 'GRANT_TREAT_AS_TYPE_RULE': {
          engine.tempTreatAsTypeRules = engine.tempTreatAsTypeRules || [];
          engine.tempTreatAsTypeRules.push({
            filter: step.filter || null,
            treatAsTypes: step.treatAsTypes || ['EVENT'],
            expiresAt: step.expiresAt || 'END_OF_TURN'
          });
          next(); return;
        }
        case 'DECLARE_SPECIAL_WIN':
        case 'SPECIAL_WIN': {
          const reason = step.reason || 'SPECIAL_WIN';
          if (typeof engine.declareSpecialWin === 'function') {
            engine.declareSpecialWin(reason);
          } else {
            engine.specialWinner = 'MY';
            engine.winReason = reason;
            safeShowCenterAlert('特殊勝利！', `發動【${def?.name || '卡片'}】特殊勝利條件，獲勝！`);
            safeSendSystemChat(`[規則引擎 v3] 發動了【${def?.name || '卡片'}】的特殊勝利效果！`);
            safeConnSend({ type: 'ENGINE_EVENT', subType: 'DECLARE_SPECIAL_WIN', reason });
          }
          next(); return;
        }
        case 'DEAL_DAMAGE': {
          const cnt = step.count || 1;
          if (typeof engine.sendDamageToOpponent === 'function') {
            engine.sendDamageToOpponent(cnt);
          } else {
            safeSendSystemChat(`[規則引擎 v3] 【${def?.name || '效果'}】給予對手 ${cnt} 點傷害！`);
          }
          next(); return;
        }
        case 'STRIP_RAID_BASE': {
          const slot = sourceCardEl?.parentElement;
          const outside = doc?.getElementById('my-outside-area');
          if (slot && outside) {
            const bases = Array.from(slot.querySelectorAll('.card')).filter(c => c !== sourceCardEl && !c.classList.contains('is-flipped'));
            if (bases.length > 0) {
              engine.moveCardToZone(bases[0], outside);
              const stillBase = Array.from(slot.querySelectorAll('.card')).some(c => c !== sourceCardEl && !c.classList.contains('is-flipped'));
              const rt = engine.getRuntime ? engine.getRuntime(sourceCardEl) : null;
              if (!stillBase && rt) rt.isRaided = false;
              safeRecalcStacking(slot);
            }
          }
          next(); return;
        }
        case 'DERAID_TOP_TO_OUTSIDE': {
          targets(step.target || 'SELF').forEach(c => {
            const slot = c?.parentElement;
            if (!slot) return;
            const isOpp = !!slot.id?.startsWith('opp-');
            const bases = Array.from(slot.querySelectorAll('.card')).filter(u => u !== c && !u.classList.contains('is-flipped'));
            const rt = engine.getRuntime ? engine.getRuntime(c) : null;
            if (!rt?.isRaided && bases.length === 0) return;
            if (isOpp && typeof engine.requestDeraidOpponentCard === 'function') {
              engine.requestDeraidOpponentCard(c);
              return;
            }
            const wasRest = c.classList.contains('rest');
            const outArea = doc?.getElementById(isOpp ? 'opp-outside-area' : 'my-outside-area');
            if (outArea) engine.moveCardToZone(c, outArea);
            else if (isOpp && typeof engine.requestRetireOpponentCard === 'function') engine.requestRetireOpponentCard(c);
            if (bases[0]) {
              const bRt = engine.getRuntime ? engine.getRuntime(bases[0]) : null;
              if (bRt) bRt.isRaided = false;
              if (wasRest) bases[0].classList.add('rest');
              else bases[0].classList.remove('rest');
            }
            safeUpdateBpDisplay(slot, 0);
            safeRecalcStacking(slot);
          });
          next(); return;
        }
        case 'HAND_TO_UNDER': {
          const targetIds = targets(step.target || 'SELF');
          const tc = targetIds[0];
          const slot = tc?.parentElement;
          const hand = getZoneCards(engine, 'MY', 'HAND');
          const cnt = Math.min(step.count || 1, hand.length);
          if (!slot || cnt === 0) { next(); return; }
          const placeUnder = (sel) => {
            sel.forEach(c => {
              c.classList.remove('rest');
              if (step.facedown !== false) c.classList.add('is-flipped');
              slot.insertBefore(c, slot.firstChild);
            });
            safeRecalcStacking(slot);
            next();
          };
          if (hand.length === cnt) { placeUnder([...hand]); return; }
          engine.promptModal({
            title: `【${def?.name || '效果'}】選擇手牌墊於角色下方`,
            desc: `請選擇 ${cnt} 張手牌置於角色下方：`,
            cards: hand, selectCount: cnt, upTo: false,
            onConfirm: (sel) => placeUnder(sel || [])
          });
          return;
        }
        case 'UNDER_TO_HAND': {
          const slot = sourceCardEl?.parentElement;
          const hand = doc?.getElementById('my-hand-area');
          if (!slot || !hand) { next(); return; }
          const unders = Array.from(slot.querySelectorAll('.card')).filter(c =>
            c !== sourceCardEl && (step.facedownOnly === false || c.classList.contains('is-flipped'))
          );
          const cnt = Math.min(step.count || 1, unders.length);
          for (let i = 0; i < cnt; i++) {
            unders[i].classList.remove('is-flipped');
            engine.moveCardToZone(unders[i], hand);
            if (step.storeAs) ctx.vars[step.storeAs] = unders[i];
          }
          safeRecalcStacking(slot);
          next(); return;
        }
        case 'MOVE_LINE': {
          targets(step.target || 'SELF').forEach(c => {
            const slot = c?.parentElement;
            if (!slot) return;
            const inFront = !!slot.closest?.('#my-front-line');
            const inEnergy = !!slot.closest?.('#my-energy-line');
            if (!inFront && !inEnergy) return;
            if (step.onlyFromEnergy && !inEnergy) return;
            const fromLine = inFront ? 'front' : 'energy';
            const toLine = step.toZone === 'OTHER_LINE'
              ? (fromLine === 'front' ? 'energy' : 'front')
              : (step.toZone === 'ENERGY_LINE' ? 'energy' : 'front');
            if (fromLine === toLine) return;
            const view = evalContinuousView(engine, c);
            if (view.cannotMove) return;
            if (toLine === 'front' && view.cannotMoveToFront) return;
            const emptySlot = doc ? Array.from(doc.querySelectorAll(toLine === 'front' ? '#my-front-line .slot' : '#my-energy-line .slot'))
              .find(s => s.querySelectorAll('.card').length === 0) : null;
            if (!emptySlot) return;
            moveSlotCardWithFallback(engine, slot, emptySlot, { isMovePhase: !!step.isMovePhase });
          });
          next(); return;
        }
        case 'SWAP_POSITIONS': {
          const cardA = resolveTargets(sourceCardEl, step.targetA || 'SELF', { fromVar: step.varA }, ctx)[0];
          const cardB = resolveTargets(sourceCardEl, step.targetB || 'SELECTED', { fromVar: step.varB }, ctx)[0];
          if (!cardA || !cardB || cardA === cardB) { next(); return; }
          const slotA = cardA.parentElement;
          const slotB = cardB.parentElement;
          if (!slotA || !slotB) { next(); return; }
          const aFront = !!slotA.closest?.('#my-front-line');
          const bFront = !!slotB.closest?.('#my-front-line');
          const aField = aFront || !!slotA.closest?.('#my-energy-line');
          const bField = bFront || !!slotB.closest?.('#my-energy-line');
          if (!aField || !bField) { next(); return; }
          const vA = evalContinuousView(engine, cardA);
          const vB = evalContinuousView(engine, cardB);
          if (vA.cannotMove || vB.cannotMove) { next(); return; }
          if (bFront && !aFront && vA.cannotMoveToFront) { next(); return; }
          if (aFront && !bFront && vB.cannotMoveToFront) { next(); return; }
          swapSlotCardsWithFallback(engine, slotA, slotB, { isMovePhase: !!step.isMovePhase });
          next(); return;
        }
        case 'OPP_HAND_REVEAL': {
          if (typeof engine.requestOppHandReveal === 'function') {
            engine.requestOppHandReveal(next);
            return;
          }
          if (safeConnSend({ type: 'ENGINE_EVENT', subType: 'OPP_HAND_REVEAL' })) {
            safeSendSystemChat(`[規則引擎 v3] 已請求檢視對手手牌。`);
            next(); return;
          }
          const oppHand = getZoneCards(engine, 'OPP', 'HAND');
          if (engine.isSoloTestMode && oppHand.length > 0) {
            engine.promptModal({
              title: `【${def?.name || '公開對手手牌'}】檢視對手手牌`,
              desc: `目前對手手牌共 ${oppHand.length} 張：`,
              cards: oppHand,
              customButtons: [{ label: '確認完畢', color: '#4f739e', onClick: () => next() }]
            });
            return;
          }
          next(); return;
        }
        case 'REVEAL_TOP_FACE_UP': {
          const deck = getZoneCards(engine, 'MY', 'DECK');
          if (deck.length > 0) {
            const top = deck[deck.length - 1];
            top.classList.remove('is-flipped');
            const topDef = engine.getCardDef(top);
            if (typeof engine.updatePublicInfoHUD === 'function') engine.updatePublicInfoHUD();
            safeSendSystemChat(`[規則引擎 v3] 公開了牌組最上方卡片：【${topDef?.name || '卡片'}】。`);
          }
          next(); return;
        }
        case 'CHOOSE_TOP_OR_BOTTOM': {
          const tc = targets(step.target || 'SELECTED')[0];
          if (!tc) { next(); return; }
          const isOpp = !!tc.parentElement?.id?.startsWith('opp-');
          if (isOpp && evalContinuousView(engine, tc).immuneToOppLeave) { next(); return; }
          const overrideToMe = step.chooserOverrideWhen && evalCondition(engine, step.chooserOverrideWhen, sourceCardEl, ctx);
          const chooser = (step.chooser === 'OPP' && !overrideToMe) ? 'OPP' : 'MY';
          if (chooser === 'OPP' && typeof engine.requestOpponentChooseTopOrBottom === 'function') {
            engine.requestOpponentChooseTopOrBottom(tc, next);
            return;
          }
          if (chooser === 'OPP' && safeConnSend({ type: 'ENGINE_EVENT', subType: 'CHOOSE_TOP_OR_BOTTOM', slotId: tc.parentElement?.id?.replace(/^opp-/, 'my-') })) {
            next(); return;
          }
          const tName = engine.getCardDef(tc)?.name || '卡片';
          engine.promptModal({
            title: `【${def?.name || '效果'}】選擇放回牌組位置`,
            desc: `請選擇將【${tName}】放回牌組頂端或底端：`,
            cards: [tc],
            customButtons: [
              { label: '⬆️ 放回牌組頂端', color: '#4f739e', onClick: () => { sendFieldCardToDeckTop(engine, tc); next(); } },
              { label: '⬇️ 放回牌組底端', color: '#8d7cc4', onClick: () => { sendFieldCardToDeckBottom(engine, tc); next(); } }
            ]
          });
          return;
        }
        case 'RECOVER_SELF_FROM_OUTSIDE': {
          const hand = doc?.getElementById('my-hand-area');
          if (sourceCardEl && sourceCardEl.parentElement?.id === 'my-outside-area' && hand) {
            engine.moveCardToZone(sourceCardEl, hand);
          }
          next(); return;
        }
        case 'MOVE_OPP_FRONT_TO_ENERGY': {
          const lockCannotMove = !!(step.lockCannotMove || (step.lockCannotMoveIfByEffect && engine.getRuntime?.(sourceCardEl)?.enteredByEffect));
          const cands = targets(step.target || 'SELECTED').filter(c => c.parentElement?.closest?.('#opp-front-line'));
          const processNext = (ci) => {
            if (ci >= cands.length) { next(); return; }
            const c = cands[ci];
            if (evalContinuousView(engine, c).immuneToOppLeave) { processNext(ci + 1); return; }
            if (typeof engine.requestMoveOpponentFrontToEnergy === 'function') {
              engine.requestMoveOpponentFrontToEnergy(c, { lockCannotMove, removeOnFullEnergy: !!step.removeOnFullEnergy }, () => processNext(ci + 1));
              return;
            }
            if (safeConnSend({ type: 'ENGINE_EVENT', subType: 'FORCE_MOVE_TO_ENERGY_SLOT', slotId: c.parentElement?.id?.replace(/^opp-/, 'my-'), lockCannotMove, removeOnFullEnergy: !!step.removeOnFullEnergy })) {
              processNext(ci + 1);
              return;
            }
            if (engine.isSoloTestMode && doc) {
              const oppEnSlots = Array.from(doc.querySelectorAll('#opp-energy-line .slot'));
              const emptyEn = oppEnSlots.find(s => s.querySelectorAll('.card').length === 0);
              const finishMove = (destSlot) => {
                const srcSlot = c.parentElement;
                Array.from(srcSlot.querySelectorAll('.card')).forEach(u => destSlot.appendChild(u));
                safeUpdateBpDisplay(srcSlot, 0);
                safeRecalcStacking(srcSlot);
                safeRecalcStacking(destSlot);
                if (lockCannotMove) applyModifierToCard(engine, c, 'CANNOT_MOVE', 1, 'NEXT_OWNER_TURN_START');
                processNext(ci + 1);
              };
              if (emptyEn) { finishMove(emptyEn); return; }
              if (step.removeOnFullEnergy) {
                const oppEnCards = getZoneCards(engine, 'OPP', 'ENERGY');
                const oppRemove = doc.getElementById('opp-remove-area');
                if (oppEnCards.length > 0 && oppRemove) {
                  engine.promptModal({
                    title: '對手能源線已滿',
                    desc: '請選擇 1 張對手能源線卡片移至移除區：',
                    cards: oppEnCards, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                      const chosen = sel?.[0];
                      if (chosen) {
                        const freedSlot = chosen.parentElement;
                        Array.from(freedSlot.querySelectorAll('.card')).filter(u => u !== chosen).forEach(u => {
                          const outA = doc.getElementById('opp-outside-area');
                          if (outA) engine.moveCardToZone(u, outA);
                        });
                        engine.moveCardToZone(chosen, oppRemove);
                        finishMove(freedSlot);
                      } else processNext(ci + 1);
                    }
                  });
                  return;
                }
              }
            }
            processNext(ci + 1);
          };
          processNext(0);
          return;
        }
        case 'GRANT_OPP_MOVE_RULE': {
          const rule = {
            forbidEnergyToFront: !!step.forbidEnergyToFront,
            allowFrontToEnergy: !!step.allowFrontToEnergy,
            expiresAt: step.expiresAt || 'NEXT_OWNER_TURN_START'
          };
          if (typeof engine.grantOppMoveRule === 'function') {
            engine.grantOppMoveRule(rule);
          } else {
            engine.oppNextTurnMoveRule = rule;
            safeConnSend({ type: 'ENGINE_EVENT', subType: 'GRANT_OPP_MOVE_RULE', rule });
          }
          next(); return;
        }
        case 'ADD_AP_DISCOUNT': {
          engine.pendingApDiscounts = engine.pendingApDiscounts || [];
          const outerEngine = engine;
          const stepSnap = { ...step };
          engine.pendingApDiscounts.push({
            amount: step.amount || 1,
            desc: `${def?.name || '效果'} 消費AP-${step.amount || 1}`,
            matchFn: (d) => {
              const dIr = getV3IR(outerEngine, d);
              if (stepSnap.cardType) {
                if (stepSnap.cardType === 'EVENT') {
                  if (!isEventLike(outerEngine, d, dIr, null)) return false;
                } else if (d.type !== stepSnap.cardType) return false;
              }
              if (stepSnap.noRaid && d.compiledRules?.raidCondition) return false;
              if (stepSnap.filter && !matchesFilterDef(outerEngine, d, dIr, stepSnap.filter)) return false;
              if (stepSnap.baseMaxEnergy !== null && stepSnap.baseMaxEnergy !== undefined) {
                const evOutside = typeof outerEngine.countEventsInMyOutside === 'function' ? outerEngine.countEventsInMyOutside() : 0;
                const maxEn = stepSnap.baseMaxEnergy + (stepSnap.perOutsideEvents > 0
                  ? Math.floor(evOutside / stepSnap.perOutsideEvents) * (stepSnap.energyStep || 1)
                  : 0);
                const reqEn = typeof d.requiredEnergy === 'object' ? (d.requiredEnergy?.count || 0) : (parseInt(d.requiredEnergy, 10) || 0);
                if (reqEn > maxEn) return false;
              }
              return true;
            }
          });
          next(); return;
        }
        case 'ADD_DELAYED_TRIGGER': {
          if (step.timing === 'MAIN_PHASE_END' && sourceCardEl && (!step.steps || step.steps.length === 0 || (step.steps.length === 1 && step.steps[0].op === 'RETIRE_SELF'))) {
            const rt = engine.getRuntime(sourceCardEl);
            if (rt) rt.retireAtEndOfMain = true;
          }
          engine.v3DelayedTriggers = engine.v3DelayedTriggers || [];
          const varsCopy = {};
          if (step.targetVar && ctx.vars[step.targetVar]) varsCopy[step.targetVar] = ctx.vars[step.targetVar];
          engine.v3DelayedTriggers.push({
            timing: step.timing,
            sourceCardEl,
            vars: varsCopy,
            steps: step.steps || [],
            expiresAt: step.expiresAt || (step.timing === 'OPP_ATTACK_PHASE_END' ? 'NEXT_OWNER_TURN_START' : 'END_OF_TURN')
          });
          next(); return;
        }
        case 'ADD_TARGET_TAX': {
          engine.targetTaxes = engine.targetTaxes || [];
          engine.targetTaxes.push({
            name: step.name,
            discardHand: step.discardHand || 0,
            ap: step.ap || 0,
            expiresAt: step.expiresAt || 'END_OF_TURN'
          });
          next(); return;
        }
        case 'REVIVE_SELF_WITH_UNDER': {
          const underEl = ctx.vars?.[step.fromVar];
          const emptyFl = doc ? Array.from(doc.querySelectorAll('#my-front-line .slot')).find(s => s.querySelectorAll('.card').length === 0) : null;
          if (emptyFl && sourceCardEl && sourceCardEl.parentElement?.id === 'my-outside-area') {
            engine.moveCardToZone(sourceCardEl, emptyFl);
            sourceCardEl.classList.add('rest');
            sourceCardEl.classList.remove('is-flipped');
            const rt = engine.getRuntime ? engine.getRuntime(sourceCardEl) : null;
            if (rt) { rt.enteredThisTurn = true; rt.enteredByEffect = true; rt.enteredByCharEffect = (def?.type === 'CHARACTER'); }
            if (underEl && underEl.parentElement?.id === 'my-outside-area') {
              underEl.classList.remove('rest');
              underEl.classList.add('is-flipped');
              emptyFl.insertBefore(underEl, emptyFl.firstChild);
            }
            safeRecalcStacking(emptyFl);
            safeUpdateSlotCounts();
          }
          next(); return;
        }
        case 'RETIRE': {
          const list = targets(step.target);
          const retireNext = (i) => {
            if (i >= list.length) { next(); return; }
            const c = list[i];
            if (!c?.parentElement) { retireNext(i + 1); return; }
            if (c.parentElement.id?.startsWith('opp-')) {
              if (typeof engine.requestRetireOpponentCard === 'function') engine.requestRetireOpponentCard(c);
              retireNext(i + 1);
            } else {
              engine.retireCardFromSlot(c.parentElement, () => retireNext(i + 1));
            }
          };
          retireNext(0);
          return;
        }
        case 'RETIRE_SELF': {
          if (sourceCardEl?.parentElement) {
            engine.retireCardFromSlot(sourceCardEl.parentElement, () => next());
          } else {
            next();
          }
          return;
        }
        case 'RETIRE_VAR': {
          const raw = ctx.vars?.[step.fromVar];
          const list = (Array.isArray(raw) ? raw : (raw ? [raw] : []))
            .filter(c => c?.parentElement && (engine.getTopCardInSlot ? engine.getTopCardInSlot(c.parentElement) === c : true));
          const retireNext = (i) => {
            if (i >= list.length) { next(); return; }
            const c = list[i];
            if (!c?.parentElement) { retireNext(i + 1); return; }
            if (c.parentElement.id?.startsWith('opp-')) {
              if (typeof engine.requestRetireOpponentCard === 'function') engine.requestRetireOpponentCard(c);
              retireNext(i + 1);
            } else {
              engine.retireCardFromSlot(c.parentElement, () => retireNext(i + 1));
            }
          };
          retireNext(0);
          return;
        }
        case 'RETIRE_ALL': {
          const list = getZoneCards(engine, step.owner || 'OPP', step.line || 'FRONT')
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx));
          const retireNext = (i) => {
            if (i >= list.length) { next(); return; }
            const c = list[i];
            if (!c?.parentElement) { retireNext(i + 1); return; }
            if (c.parentElement.id?.startsWith('opp-')) {
              if (typeof engine.requestRetireOpponentCard === 'function') engine.requestRetireOpponentCard(c);
              retireNext(i + 1);
            } else {
              engine.retireCardFromSlot(c.parentElement, () => retireNext(i + 1));
            }
          };
          retireNext(0);
          return;
        }
        case 'SET_REST_ALL': {
          getZoneCards(engine, step.owner || 'OPP', step.line || 'FRONT')
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx))
            .forEach(c => {
              if (c.parentElement?.id?.startsWith('opp-')) {
                if (typeof engine.requestRestOpponentCard === 'function') engine.requestRestOpponentCard(c);
              } else c.classList?.add('rest');
            });
          next(); return;
        }
        case 'SET_ACTIVE_ALL': {
          getZoneCards(engine, step.owner || 'MY', step.line || 'FIELD')
            .filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx))
            .forEach(c => c.classList?.remove('rest'));
          next(); return;
        }
        case 'BOUNCE_SELECTED': {
          targets(step.target).forEach(c => {
            if (c.parentElement?.id?.startsWith('opp-')) {
              if (typeof engine.requestBounceOpponentCard === 'function') engine.requestBounceOpponentCard(c);
            } else if (c.parentElement) engine.bounceSlotTopCardToHand(c.parentElement);
          });
          next(); return;
        }
        case 'BOUNCE_SELF': {
          if (sourceCardEl?.parentElement) engine.bounceSlotTopCardToHand(sourceCardEl.parentElement);
          next(); return;
        }
        case 'BOUNCE_OTHER_OR_SELF': {
          const cands = getZoneCards(engine, 'MY', step.line || 'FIELD')
            .filter(c => c !== sourceCardEl && matchesFilter(engine, c, step.filter || { type: 'CHARACTER' }, sourceCardEl, ctx));
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
            safeRecalcStacking(slot);
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
          const hand = getZoneCards(engine, 'MY', 'HAND').filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx));
          const outside = doc?.getElementById('my-outside-area');
          const maxC = Math.min(step.count || 1, hand.length);
          const minC = Math.min(step.min ?? maxC, maxC);
          if (maxC === 0 || !outside) { next(); return; }
          const finishDiscard = (sel) => {
            const arr = sel || [];
            if (step.storeAs && arr[0]) ctx.vars[step.storeAs] = arr[0];
            const triggerIdx = (di) => {
              if (di >= arr.length) { next(); return; }
              engine.moveCardToZone(arr[di], outside);
              dispatchDiscardTrigger(engine, arr[di], sourceCardEl, () => triggerIdx(di + 1));
            };
            triggerIdx(0);
          };
          if (minC === hand.length && minC === maxC) {
            finishDiscard([...hand]);
            return;
          }
          engine.promptModal({
            title: `【${def?.name || '效果'}】選擇手牌放置於場外`,
            desc: `請選擇 ${minC === maxC ? maxC : `最多 ${maxC}`} 張手牌放置於場外：`,
            cards: hand, selectCount: maxC, upTo: minC === 0,
            onConfirm: finishDiscard
          });
          return;
        }
        case 'DISCARD_UP_TO_AND_DRAW_SAME': {
          const hand = getZoneCards(engine, 'MY', 'HAND');
          const outside = doc?.getElementById('my-outside-area');
          const maxC = Math.min(step.max || 2, hand.length);
          if (maxC === 0 || !outside) { next(); return; }
          engine.promptModal({
            title: `【${def?.name || '效果'}】棄牌並抽相同張數`,
            desc: `可選擇最多 ${maxC} 張手牌捨棄，並抽取相同張數：`,
            cards: hand, selectCount: maxC, upTo: true,
            onConfirm: (sel) => {
              const arr = sel || [];
              const triggerIdx = (di) => {
                if (di >= arr.length) {
                  if (arr.length > 0) engine.drawCards(arr.length);
                  next(); return;
                }
                engine.moveCardToZone(arr[di], outside);
                dispatchDiscardTrigger(engine, arr[di], sourceCardEl, () => triggerIdx(di + 1));
              };
              triggerIdx(0);
            }
          });
          return;
        }
        case 'DISCARD_AND_FIRE_TRIGGER': {
          const cands = getZoneCards(engine, 'MY', 'HAND').filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx));
          const outside = doc?.getElementById('my-outside-area');
          if (cands.length === 0 || !outside) { next(); return; }
          engine.promptModal({
            title: `【${def?.name || '效果'}】棄牌並發動 Trigger`,
            desc: '請選擇 1 張符合條件的手牌捨棄並發動其 Trigger 效果：',
            cards: cands, selectCount: 1, upTo: false,
            onConfirm: (sel) => {
              const chosen = sel?.[0];
              if (!chosen) { next(); return; }
              engine.moveCardToZone(chosen, outside);
              dispatchDiscardTrigger(engine, chosen, sourceCardEl, () => {
                const cDef = engine.getCardDef(chosen);
                const trig = cDef?.compiledRules?.trigger;
                if (trig && typeof engine.executeTriggerEffect === 'function') {
                  engine.executeTriggerEffect(chosen, cDef, trig, next);
                } else {
                  if (trig) safeSendSystemChat(`[規則引擎 v3] 棄置【${cDef?.name || '卡片'}】並觸發 [${trig.type}]！`);
                  next();
                }
              });
            }
          });
          return;
        }
        case 'DISCARD_UNDER_STEP': {
          const slot = sourceCardEl?.parentElement;
          const outside = doc?.getElementById('my-outside-area');
          if (!slot || !outside) { next(); return; }
          const unders = Array.from(slot.querySelectorAll('.card')).filter(c =>
            c !== sourceCardEl && (step.facedownOnly === false || c.classList.contains('is-flipped'))
          );
          const cnt = Math.min(step.count || 1, unders.length);
          for (let i = 0; i < cnt; i++) {
            unders[i].classList.remove('is-flipped');
            engine.moveCardToZone(unders[i], outside);
            if (step.storeAs) ctx.vars[step.storeAs] = unders[i];
          }
          safeRecalcStacking(slot);
          next(); return;
        }
        case 'HAND_TO_DECK_TOP': {
          const hand = getZoneCards(engine, 'MY', 'HAND');
          const deck = doc?.getElementById('my-deck-area');
          const outside = doc?.getElementById('my-outside-area');
          const cnt = Math.min(step.count || 1, hand.length);
          if (cnt === 0 || !deck) { next(); return; }
          engine.promptModal({
            title: `【${def?.name || '效果'}】${step.allowOutside ? '將手牌放回牌頂或場外' : '將手牌放回牌組上方'}`,
            desc: step.allowOutside ? '請選擇 1 張手牌：' : `請選擇 ${cnt} 張手牌放回自己牌組上方：`,
            cards: hand, selectCount: cnt, upTo: false,
            onConfirm: (sel) => {
              const chosen = sel || [];
              if (step.allowOutside && chosen[0] && outside) {
                engine.promptModal({
                  title: '選擇放置區域',
                  desc: `將【${engine.getCardDef(chosen[0])?.name || '手牌'}】置於何處？`,
                  cards: [chosen[0]],
                  customButtons: [
                    { label: '⬆️ 放回牌組上方', color: '#4f739e', onClick: () => { chosen[0].classList.remove('rest'); chosen[0].classList.add('is-flipped'); deck.appendChild(chosen[0]); next(); } },
                    { label: '🪦 放置於場外', color: '#8d7cc4', onClick: () => { engine.moveCardToZone(chosen[0], outside); next(); } }
                  ]
                });
                return;
              }
              chosen.forEach(c => { c.classList.remove('rest'); c.classList.add('is-flipped'); deck.appendChild(c); });
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
            if (step.dynamicMaxBp.perMatchingField) {
              const pm = step.dynamicMaxBp.perMatchingField;
              const cnt = getZoneCards(engine, pm.owner || 'MY', pm.line || 'FIELD')
                .filter(c => matchesFilter(engine, c, pm.filter, sourceCardEl, ctx)).length;
              lim += cnt * pm.step;
            }
            filter.maxBp = lim;
          }
          const sourceKind = ctx.isTrigger ? 'TRIGGER'
            : (def?.type === 'EVENT' ? 'EVENT_FROM_HAND' : (def?.type || 'CHARACTER'));
          const targetOwner = step.owner || 'OPP';
          const cands = getZoneCards(engine, targetOwner, step.line || 'FRONT').filter(c => {
            if (targetOwner === 'OPP') {
              const v = evalContinuousView(engine, c);
              if (isUntargetableBySourceView(v, sourceKind)) return false;
            }
            return matchesFilter(engine, c, filter, sourceCardEl, ctx);
          });
          const storeKey = step.storeAs || 'selected';
          const setResult = (sel) => {
            ctx.vars[storeKey] = sel;
            if (!step.storeAs || step.storeAs === 'selected') ctx.selected = sel;
          };
          if (cands.length === 0) { setResult([]); next(); return; }
          const maxC = Math.min(step.max ?? 1, cands.length);
          const minC = Math.min(step.min ?? 1, cands.length);
          if (cands.length === 1 && minC === 1 && maxC === 1) {
            setResult([cands[0]]);
            next(); return;
          }
          engine.promptModal({
            title: `【${def?.name || '效果'}】選擇目標`,
            desc: `請選擇 ${minC === maxC ? maxC : `最多 ${maxC}`} 張目標卡片：`,
            cards: cands, selectCount: maxC, upTo: minC === 0,
            onConfirm: (sel) => { setResult(sel || []); next(); }
          });
          return;
        }
        case 'CHOOSE_ACTIVE_SELF_OR_VAR': {
          const list = [];
          const isOnMyField = (c) => !!(c && c.closest?.('#my-front-line, #my-energy-line'));
          if (isOnMyField(sourceCardEl)) list.push(sourceCardEl);
          const rawOther = ctx.vars?.[step.fromVar];
          const otherArr = Array.isArray(rawOther) ? rawOther : (rawOther ? [rawOther] : []);
          for (const oc of otherArr) {
            if (oc && !list.includes(oc) && isOnMyField(oc)) list.push(oc);
          }
          if (list.length === 0) { next(); return; }
          if (list.length === 1) {
            list[0].classList?.remove('rest');
            next(); return;
          }
          engine.promptModal({
            title: `【${def?.name || '效果'}】選擇轉為活動的角色`,
            desc: '請選擇 1 張角色轉為活動狀態：',
            cards: list, selectCount: 1, upTo: false,
            onConfirm: (sel) => { if (sel?.[0]) sel[0].classList?.remove('rest'); next(); }
          });
          return;
        }
        case 'RECOVER_FROM_OUTSIDE': {
          const cands = getZoneCards(engine, 'MY', 'OUTSIDE').filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx));
          const hand = doc?.getElementById('my-hand-area');
          if (cands.length === 0 || !hand) { next(); return; }
          let maxC = step.baseMax ?? 1;
          if (step.perOutside > 0) {
            const outCnt = getZoneCards(engine, 'MY', 'OUTSIDE').length;
            maxC += Math.floor(outCnt / step.perOutside) * (step.step || 1);
          }
          if (step.distinctOriginalEnergy) {
            const distinctEns = new Set(cands.map(c => {
              const d = engine.getCardDef(c);
              return typeof d?.requiredEnergy === 'object' ? (d.requiredEnergy?.count || 0) : (parseInt(d?.requiredEnergy, 10) || 0);
            }));
            maxC = Math.min(maxC, distinctEns.size);
          }
          maxC = Math.min(maxC, cands.length);
          const minC = Math.min(step.min ?? 0, maxC);
          const promptPick = () => {
            engine.promptModal({
              title: `【${def?.name || '效果'}】從場外加入手牌`,
              desc: `請從場外選擇 ${minC === maxC ? maxC : `最多 ${maxC}`} 張加入手牌${step.distinctOriginalEnergy ? '（不可選相同原本必要能源）' : ''}：`,
              cards: cands, selectCount: maxC, upTo: minC === 0,
              onConfirm: (sel) => {
                const picked = sel || [];
                if (step.distinctOriginalEnergy && picked.length > 1) {
                  const seen = new Set();
                  let dup = false;
                  for (const c of picked) {
                    const d = engine.getCardDef(c);
                    const en = typeof d?.requiredEnergy === 'object' ? (d.requiredEnergy?.count || 0) : (parseInt(d?.requiredEnergy, 10) || 0);
                    if (seen.has(en)) { dup = true; break; }
                    seen.add(en);
                  }
                  if (dup) { safeShowSysMsg('不可選擇原本必要能源相同的卡片！'); promptPick(); return; }
                }
                picked.forEach(c => engine.moveCardToZone(c, hand));
                ctx.vars.added = picked.length > 0;
                next();
              }
            });
          };
          promptPick();
          return;
        }
        case 'LOOK_TOP': {
          const deck = getZoneCards(engine, 'MY', 'DECK');
          const cnt = Math.min(step.count || 1, deck.length);
          if (cnt === 0) { next(); return; }
          const looked = deck.slice(deck.length - cnt).reverse();
          const eligible = step.pickFilter ? looked.filter(c => matchesFilter(engine, c, step.pickFilter, sourceCardEl, ctx)) : looked;
          const finishRest = (picked) => {
            const rest = looked.filter(c => !picked.includes(c));
            const hand = doc?.getElementById('my-hand-area');
            const outside = doc?.getElementById('my-outside-area');
            const removeArea = doc?.getElementById('my-remove-area');
            const deckEl = doc?.getElementById('my-deck-area');
            const placeRest = () => {
              if (rest.length === 0) { next(); return; }
              if (step.restDest === 'OUTSIDE' && outside) {
                rest.forEach(c => engine.moveCardToZone(c, outside));
                next(); return;
              }
              if (step.restDest === 'TOP_OR_BOTTOM' && deckEl) {
                engine.promptModal({
                  title: '剩餘卡片放置位置',
                  desc: `請選擇將剩餘 ${rest.length} 張卡片置於牌組頂端或底端：`,
                  cards: rest,
                  customButtons: [
                    { label: '⬆️ 置於牌組頂端', color: '#4f739e', onClick: () => { [...rest].reverse().forEach(c => { c.classList.add('is-flipped'); deckEl.appendChild(c); }); next(); } },
                    { label: '⬇️ 置於牌組底端', color: '#8d7cc4', onClick: () => { rest.forEach(c => { c.classList.add('is-flipped'); deckEl.insertBefore(c, deckEl.firstChild); }); next(); } }
                  ]
                });
                return;
              }
              if (typeof engine.promptOrderCardsToDeck === 'function' && rest.length > 1 && step.orderRest) {
                engine.promptOrderCardsToDeck(rest, step.restDest === 'TOP' ? 'TOP' : 'BOTTOM', next);
              } else if (deckEl) {
                if (step.restDest === 'TOP') {
                  [...rest].reverse().forEach(c => { c.classList.add('is-flipped'); deckEl.appendChild(c); });
                } else {
                  rest.forEach(c => { c.classList.add('is-flipped'); deckEl.insertBefore(c, deckEl.firstChild); });
                }
                next();
              } else { next(); }
            };

            if (step.setVarIfPicked) { ctx.vars[step.setVarIfPicked] = picked.length > 0; ctx.addedFromLook = picked.length > 0; }
            if (step.pickDest === 'HAND' && hand) { picked.forEach(c => engine.moveCardToZone(c, hand)); placeRest(); return; }
            if (step.pickDest === 'OUTSIDE' && outside) { picked.forEach(c => engine.moveCardToZone(c, outside)); placeRest(); return; }
            if (step.pickDest === 'REMOVE' && removeArea) { picked.forEach(c => engine.moveCardToZone(c, removeArea)); placeRest(); return; }
            if (step.pickDest === 'TOP' && deckEl) { [...picked].reverse().forEach(c => { c.classList.add('is-flipped'); deckEl.appendChild(c); }); placeRest(); return; }
            if (step.pickDest === 'FIELD' && picked.length > 0) {
              const allowFront = !step.allowedLines || step.allowedLines.includes('front');
              const allowEnergy = !step.allowedLines || step.allowedLines.includes('energy');
              const placeNext = (pi) => {
                if (pi >= picked.length) { placeRest(); return; }
                const target = picked[pi];
                engine.chooseEmptyFieldSlotAndPlace(target, { allowFront, allowEnergy, enterRest: !!step.enterRest }, (placedSlot) => {
                  if (placedSlot) {
                    const tRt = engine.getRuntime ? engine.getRuntime(target) : null;
                    if (tRt) {
                      tRt.enteredThisTurn = true;
                      tRt.enteredByEffect = true;
                      tRt.enteredByCharEffect = (def?.type === 'CHARACTER');
                    }
                    if (typeof engine.triggerCardAbilities === 'function') {
                      engine.triggerCardAbilities(target, 'ON_PLAY', () => placeNext(pi + 1));
                      return;
                    }
                  } else if (outside) {
                    engine.moveCardToZone(target, outside);
                  }
                  placeNext(pi + 1);
                });
              };
              placeNext(0);
              return;
            }
            placeRest();
          };
          if (eligible.length === 0 || step.pickMax === 0) { finishRest([]); return; }
          if (step.autoPickIfMatch) {
            finishRest(eligible.slice(0, step.pickMax ?? 1));
            return;
          }
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
        case 'REVEAL_TOP_PLAY_OR_HAND': {
          const deck = getZoneCards(engine, 'MY', 'DECK');
          const hand = doc?.getElementById('my-hand-area');
          if (deck.length === 0) { next(); return; }
          const topCard = deck[deck.length - 1];
          const topDef = engine.getCardDef(topCard);
          const topIr = getV3IR(engine, topDef);
          const nameMatch = (step.matchNames || []).some(n => cardMatchesName(topDef, topIr, n));
          let enOk = true;
          if (typeof engine.calculateMyEnergy === 'function') {
            const en = engine.calculateMyEnergy();
            const reqEn = typeof topDef?.requiredEnergy === 'object' ? (topDef.requiredEnergy?.count || 0) : (parseInt(topDef?.requiredEnergy, 10) || 0);
            const disc = typeof engine.computeAutoEnergyDiscount === 'function' ? engine.computeAutoEnergyDiscount(topDef) : 0;
            const need = Math.max(0, reqEn - disc);
            if (need > 0) {
              const isAll = !!(topIr?.allColor || topDef?.allColor);
              const have = isAll ? (en.ALL || 0) : (en[topDef?.color] || 0);
              enOk = have >= need;
            }
          }
          if (!nameMatch || !enOk) {
            if (hand) engine.moveCardToZone(topCard, hand);
            next(); return;
          }
          const raidSlots = collectValidRaidSlots(engine, topDef);
          const btns = [];
          if (hand) btns.push({ label: '加入手牌', color: '#6c93c7', onClick: () => { engine.moveCardToZone(topCard, hand); next(); } });
          btns.push({
            label: '免費休息登場', color: '#27ae60',
            onClick: () => {
              engine.chooseEmptyFieldSlotAndPlace(topCard, { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                if (!placed) {
                  if (hand) engine.moveCardToZone(topCard, hand);
                  next();
                } else {
                  const tRt = engine.getRuntime ? engine.getRuntime(topCard) : null;
                  if (tRt) {
                    tRt.enteredThisTurn = true;
                    tRt.enteredByEffect = true;
                    tRt.enteredByCharEffect = (def?.type === 'CHARACTER');
                  }
                  if (typeof engine.triggerCardAbilities === 'function') { engine.triggerCardAbilities(topCard, 'ON_PLAY', next); return; }
                  next();
                }
              });
            }
          });
          if (raidSlots.length > 0) {
            btns.push({
              label: '免費突襲登場', color: '#e67e22',
              onClick: () => {
                const targetCards = raidSlots.map(s => engine.getTopCardInSlot(s)).filter(Boolean);
                engine.promptModal({
                  title: `突襲選擇：${topDef?.name || ''}`,
                  desc: '請選擇突襲目標角色：',
                  cards: targetCards, selectCount: 1, upTo: false,
                  onConfirm: (sel) => {
                    const targetSlot = sel?.[0]?.parentElement;
                    if (!targetSlot) { if (hand) engine.moveCardToZone(topCard, hand); next(); return; }
                    const tRt = engine.getRuntime ? engine.getRuntime(topCard) : null;
                    if (tRt) { tRt.enteredByEffect = true; tRt.enteredByCharEffect = (def?.type === 'CHARACTER'); }
                    const isEn = !!targetSlot.closest?.('#my-energy-line');
                    const hasEmptyFl = doc ? Array.from(doc.querySelectorAll('#my-front-line .slot')).some(s => s.querySelectorAll('.card').length === 0) : false;
                    safeExecuteRaidSummon(engine, topCard, topDef, targetSlot, isEn && hasEmptyFl, next);
                  }
                });
              }
            });
          }
          engine.promptModal({
            title: `公開牌頂【${topDef?.name || '卡片'}】`,
            desc: '請選擇加入手牌或免費登場／突襲：',
            cards: [topCard],
            customButtons: btns
          });
          return;
        }
        case 'REVEAL_TOP_DECIDE': {
          const deck = getZoneCards(engine, 'MY', 'DECK');
          const deckEl = doc?.getElementById('my-deck-area');
          const hand = doc?.getElementById('my-hand-area');
          const outside = doc?.getElementById('my-outside-area');
          if (deck.length === 0 || !deckEl) { next(); return; }
          const topCard = deck[deck.length - 1];
          const topDef = engine.getCardDef(topCard);
          const matched = matchesFilter(engine, topCard, step.filter, sourceCardEl, { ...ctx, zone: 'DECK' });

          if (step.mode === 'CHECK_FILTER_GRANT_AND_TOP_OR_BOTTOM') {
            if (matched && step.grantKind) {
              applyModifierToCard(engine, sourceCardEl, step.grantKind, step.grantValue ?? 1, step.expiresAt || 'END_OF_TURN');
            }
            engine.promptModal({
              title: `公開牌頂【${topDef?.name || '卡片'}】`,
              desc: '請選擇放回牌組頂端或底端：',
              cards: [topCard],
              customButtons: [
                { label: '⬆️ 放回牌組頂端', color: '#4f739e', onClick: () => { topCard.classList.add('is-flipped'); deckEl.appendChild(topCard); next(); } },
                { label: '⬇️ 放回牌組底端', color: '#8d7cc4', onClick: () => { topCard.classList.add('is-flipped'); deckEl.insertBefore(topCard, deckEl.firstChild); next(); } }
              ]
            });
            return;
          }

          if (step.mode === 'MATCH_TO_HAND_OR_TOP_BOTTOM') {
            if (matched && hand) {
              engine.moveCardToZone(topCard, hand);
              next(); return;
            }
            engine.promptModal({
              title: `公開牌頂【${topDef?.name || '卡片'}】`,
              desc: '未符合條件，請選擇放回牌組頂端或底端：',
              cards: [topCard],
              customButtons: [
                { label: '⬆️ 放回牌組頂端', color: '#4f739e', onClick: () => { topCard.classList.add('is-flipped'); deckEl.appendChild(topCard); next(); } },
                { label: '⬇️ 放回牌組底端', color: '#8d7cc4', onClick: () => { topCard.classList.add('is-flipped'); deckEl.insertBefore(topCard, deckEl.firstChild); next(); } }
              ]
            });
            return;
          }

          // 預設 / DISCARD_HAND_PLAY_OR_TOP_BOTTOM
          const btns = [
            { label: '⬆️ 置於牌組頂端', color: '#4f739e', onClick: () => { topCard.classList.add('is-flipped'); deckEl.appendChild(topCard); next(); } },
            { label: '⬇️ 置於牌組底端', color: '#8d7cc4', onClick: () => { topCard.classList.add('is-flipped'); deckEl.insertBefore(topCard, deckEl.firstChild); next(); } }
          ];
          const myHand = getZoneCards(engine, 'MY', 'HAND');
          if (matched && myHand.length > 0 && outside) {
            const raidSlots = topDef?.type === 'CHARACTER' ? collectValidRaidSlots(engine, topDef) : [];
            const hasEmpty = doc ? Array.from(doc.querySelectorAll('#my-front-line .slot, #my-energy-line .slot')).some(s => s.querySelectorAll('.card').length === 0) : false;
            if (hasEmpty || raidSlots.length > 0) {
              btns.push({
                label: '棄 1 手牌並免費登場／突襲', color: '#27ae60',
                onClick: () => {
                  engine.promptModal({
                    title: '請選擇 1 張手牌放置於場外',
                    desc: '捨棄 1 張手牌後將公開卡登場或突襲：',
                    cards: myHand, selectCount: 1, upTo: false,
                    onConfirm: (sel) => {
                      const dCard = sel?.[0];
                      if (!dCard) { deckEl.appendChild(topCard); next(); return; }
                      engine.moveCardToZone(dCard, outside);
                      dispatchDiscardTrigger(engine, dCard, sourceCardEl, () => {
                        const doNormalTopSummon = () => {
                          engine.chooseEmptyFieldSlotAndPlace(topCard, { allowFront: true, allowEnergy: true, enterRest: true }, (placed) => {
                            if (placed) {
                              const tRt = engine.getRuntime ? engine.getRuntime(topCard) : null;
                              if (tRt) {
                                tRt.enteredThisTurn = true;
                                tRt.enteredByEffect = true;
                                tRt.enteredByCharEffect = (def?.type === 'CHARACTER');
                              }
                              if (typeof engine.triggerCardAbilities === 'function') { engine.triggerCardAbilities(topCard, 'ON_PLAY', next); return; }
                            }
                            next();
                          });
                        };
                        if (raidSlots.length > 0) {
                          const tCards = raidSlots.map(s => engine.getTopCardInSlot(s)).filter(Boolean);
                          engine.promptModal({
                            title: `突襲或登場：${topDef?.name || ''}`,
                            desc: '可選擇突襲目標，或不突襲直接一般登場：',
                            cards: tCards, selectCount: 1, upTo: true,
                            customButtons: hasEmpty ? [{
                              label: '一般休息登場', color: '#6c93c7',
                              onClick: doNormalTopSummon
                            }] : [],
                            onConfirm: (rs) => {
                              if (rs?.[0]?.parentElement) {
                                const tSlot = rs[0].parentElement;
                                const tRt = engine.getRuntime ? engine.getRuntime(topCard) : null;
                                if (tRt) { tRt.enteredByEffect = true; tRt.enteredByCharEffect = (def?.type === 'CHARACTER'); }
                                const isEn = !!tSlot.closest?.('#my-energy-line');
                                const emptyFl = doc ? Array.from(doc.querySelectorAll('#my-front-line .slot')).some(s => s.querySelectorAll('.card').length === 0) : false;
                                safeExecuteRaidSummon(engine, topCard, topDef, tSlot, isEn && emptyFl, next);
                              } else if (hasEmpty) {
                                doNormalTopSummon();
                              } else { deckEl.appendChild(topCard); next(); }
                            }
                          });
                        } else {
                          doNormalTopSummon();
                        }
                      });
                    }
                  });
                }
              });
            }
          }
          engine.promptModal({
            title: `公開牌頂【${topDef?.name || '卡片'}】`,
            desc: '請選擇去向：',
            cards: [topCard],
            customButtons: btns
          });
          return;
        }
        case 'SPECIAL_SUMMON':
        case 'REVIVE_RAID_BASE': {
          let pool;
          if (step.op === 'REVIVE_RAID_BASE') {
            const rt = sourceCardEl && engine.getRuntime ? engine.getRuntime(sourceCardEl) : null;
            const rawBases = ctx.raidBaseIds || rt?.lastRaidBases || [];
            pool = rawBases.filter(el => el?.parentElement?.id === 'my-outside-area');
          } else if (step.fromVar) {
            const v = ctx.vars[step.fromVar];
            pool = Array.isArray(v) ? v : (v ? [v] : []);
          } else if (step.from === 'HAND_OR_OUTSIDE') {
            pool = [...getZoneCards(engine, 'MY', 'HAND'), ...getZoneCards(engine, 'MY', 'OUTSIDE')];
          } else if (step.from === 'OUTSIDE_OR_REMOVE') {
            pool = [...getZoneCards(engine, 'MY', 'OUTSIDE'), ...getZoneCards(engine, 'MY', 'REMOVE')];
          } else if (step.from === 'HAND_OR_REMOVE') {
            pool = [...getZoneCards(engine, 'MY', 'HAND'), ...getZoneCards(engine, 'MY', 'REMOVE')];
          } else if (step.from === 'REMOVE') {
            pool = getZoneCards(engine, 'MY', 'REMOVE');
          } else if (step.from === 'OUTSIDE') {
            pool = getZoneCards(engine, 'MY', 'OUTSIDE');
          } else {
            pool = getZoneCards(engine, 'MY', 'HAND');
          }
          const cands = step.op === 'REVIVE_RAID_BASE'
            ? pool
            : pool.filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx));
          if (cands.length === 0) {
            if (step.storeAs) ctx.vars[step.storeAs] = null;
            next(); return;
          }
          const allowFront = !step.allowedLines || step.allowedLines.includes('front');
          const allowEnergy = !step.allowedLines || step.allowedLines.includes('energy');
          engine.promptModal({
            title: `【${def?.name || '特殊登場'}】選擇要登場的角色`,
            desc: `請選擇最多 ${step.max ?? 1} 張角色特殊登場（${step.enterRest !== false ? '休息' : '活動'}）：`,
            cards: cands, selectCount: Math.min(step.max ?? 1, cands.length), upTo: (step.min ?? 0) === 0,
            onConfirm: (sel) => {
              if (!sel || sel.length === 0) {
                if (step.storeAs) ctx.vars[step.storeAs] = null;
                next(); return;
              }
              const placedCards = [];
              const placeNext = (i) => {
                if (i >= sel.length) {
                  ctx.vars.summoned = placedCards.length > 0;
                  if (step.storeAs) ctx.vars[step.storeAs] = placedCards[0] || null;
                  next(); return;
                }
                const target = sel[i];
                const fromRemove = target.parentElement?.id === 'my-remove-area';
                engine.chooseEmptyFieldSlotAndPlace(target, { allowFront, allowEnergy, enterRest: step.enterRest !== false }, (placedSlot) => {
                  if (placedSlot) {
                    const tRt = engine.getRuntime ? engine.getRuntime(target) : null;
                    if (tRt) {
                      tRt.enteredThisTurn = true;
                      tRt.enteredByEffect = true;
                      tRt.enteredByCharEffect = (def?.type === 'CHARACTER');
                      tRt.enteredFromRemove = fromRemove;
                    }
                    placedCards.push(target);
                    if (typeof engine.triggerCardAbilities === 'function') {
                      engine.triggerCardAbilities(target, 'ON_PLAY', () => placeNext(i + 1));
                      return;
                    }
                  }
                  placeNext(i + 1);
                });
              };
              placeNext(0);
            }
          });
          return;
        }
        case 'SPECIAL_SUMMON_OR_RAID':
        case 'RAID_FROM_ZONE': {
          let pool;
          if (step.from === 'OUTSIDE_OR_REMOVE') pool = [...getZoneCards(engine, 'MY', 'OUTSIDE'), ...getZoneCards(engine, 'MY', 'REMOVE')];
          else if (step.from === 'HAND_OR_OUTSIDE') pool = [...getZoneCards(engine, 'MY', 'HAND'), ...getZoneCards(engine, 'MY', 'OUTSIDE')];
          else if (step.from === 'REMOVE') pool = getZoneCards(engine, 'MY', 'REMOVE');
          else if (step.from === 'OUTSIDE') pool = getZoneCards(engine, 'MY', 'OUTSIDE');
          else pool = getZoneCards(engine, 'MY', 'HAND');
          const cands = pool.filter(c => matchesFilter(engine, c, step.filter, sourceCardEl, ctx));
          const isRaidOnly = step.op === 'RAID_FROM_ZONE';
          const hasEmptySlot = !isRaidOnly && doc && Array.from(doc.querySelectorAll('#my-front-line .slot, #my-energy-line .slot')).some(s => s.querySelectorAll('.card').length === 0);
          const viable = cands.filter(c => hasEmptySlot || collectValidRaidSlots(engine, engine.getCardDef(c)).length > 0);
          if (viable.length === 0) {
            if (step.storeAs) ctx.vars[step.storeAs] = null;
            next(); return;
          }
          const minC = Math.min(step.min ?? (isRaidOnly ? 1 : 0), viable.length);
          engine.promptModal({
            title: `【${def?.name || '效果'}】選擇要${isRaidOnly ? '突襲' : '登場／突襲'}的角色`,
            desc: `請選擇 1 張角色：`,
            cards: viable, selectCount: 1, upTo: minC === 0,
            onConfirm: (sel) => {
              const target = sel?.[0];
              if (!target) { if (step.storeAs) ctx.vars[step.storeAs] = null; next(); return; }
              const fromRemove = target.parentElement?.id === 'my-remove-area';
              const tDef = engine.getCardDef(target);
              const tRt = engine.getRuntime ? engine.getRuntime(target) : null;
              const raidSlots = collectValidRaidSlots(engine, tDef);
              const doNormalSummon = () => {
                engine.chooseEmptyFieldSlotAndPlace(target, { allowFront: true, allowEnergy: true, enterRest: step.enterRest !== false }, (placedSlot) => {
                  if (placedSlot) {
                    if (tRt) {
                      tRt.enteredThisTurn = true;
                      tRt.enteredByEffect = true;
                      tRt.enteredByCharEffect = (def?.type === 'CHARACTER');
                      tRt.enteredFromRemove = fromRemove;
                    }
                    if (step.storeAs) ctx.vars[step.storeAs] = target;
                    if (typeof engine.triggerCardAbilities === 'function') {
                      engine.triggerCardAbilities(target, 'ON_PLAY', next);
                      return;
                    }
                  } else if (step.storeAs) {
                    ctx.vars[step.storeAs] = null;
                  }
                  next();
                });
              };
              const doRaidOn = (slot) => {
                if (tRt) {
                  tRt.enteredByEffect = true;
                  tRt.enteredByCharEffect = (def?.type === 'CHARACTER');
                  tRt.enteredFromRemove = fromRemove;
                }
                if (step.storeAs) ctx.vars[step.storeAs] = target;
                const isEn = !!slot.closest?.('#my-energy-line');
                const emptyFl = doc ? Array.from(doc.querySelectorAll('#my-front-line .slot')).some(s => s.querySelectorAll('.card').length === 0) : false;
                safeExecuteRaidSummon(engine, target, tDef, slot, isEn && emptyFl, next);
              };
              if (raidSlots.length === 0) {
                if (isRaidOnly) { if (step.storeAs) ctx.vars[step.storeAs] = null; next(); return; }
                doNormalSummon(); return;
              }
              if (isRaidOnly && raidSlots.length === 1) { doRaidOn(raidSlots[0]); return; }
              const raidCards = raidSlots.map(s => engine.getTopCardInSlot(s)).filter(Boolean);
              const extraBtns = (!isRaidOnly && hasEmptySlot) ? [{ label: '一般休息登場', color: '#6c93c7', onClick: doNormalSummon }] : [];
              engine.promptModal({
                title: `選擇突襲目標：${tDef?.name || ''}`,
                desc: '請選擇突襲基底角色：',
                cards: raidCards, selectCount: 1, upTo: isRaidOnly ? false : true,
                customButtons: extraBtns,
                onConfirm: (rSel) => {
                  if (rSel?.[0]?.parentElement) doRaidOn(rSel[0].parentElement);
                  else if (!isRaidOnly && hasEmptySlot) doNormalSummon();
                  else { if (step.storeAs) ctx.vars[step.storeAs] = null; next(); }
                }
              });
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
          engine.usedNamedBranches = engine.usedNamedBranches || new Set();
          const avail = [];
          branches.forEach((b, bi) => {
            if (step.namedLockKey && engine.usedNamedBranches.has(`${step.namedLockKey}:${bi}`)) return;
            if (b.oncePerTurnNamed && engine.usedNamedAbilityThisTurn?.has(b.oncePerTurnNamed)) return;
            if (b.when && !evalCondition(engine, b.when, sourceCardEl, ctx)) return;
            avail.push({ b, bi });
          });
          if (avail.length === 0) { next(); return; }
          const btns = avail.map(({ b, bi }, i) => ({
            label: `選項 ${i + 1}：${b.label}`,
            color: i % 2 === 0 ? '#4f739e' : '#8d7cc4',
            onClick: () => {
              if (step.namedLockKey) engine.usedNamedBranches.add(`${step.namedLockKey}:${bi}`);
              if (b.oncePerTurnNamed && engine.usedNamedAbilityThisTurn) engine.usedNamedAbilityThisTurn.add(b.oncePerTurnNamed);
              runV3Steps(engine, sourceCardEl, b.steps, ctx, next);
            }
          }));
          engine.promptModal({ title: `【${def?.name || '多選一'}】請選擇 1 項效果`, desc: '請點擊要發動的效果分支：', cards: [], customButtons: btns });
          return;
        }
        case 'RETRIGGER_ON_PLAY': {
          const tList = targets(step.target || 'SELF');
          const runT = (ti) => {
            if (ti >= tList.length) { next(); return; }
            engine.triggerCardAbilities(tList[ti], 'ON_PLAY', () => runT(ti + 1));
          };
          runT(0);
          return;
        }
        case 'RECOVER_RAID_BASE_TO_HAND': {
          const rt = sourceCardEl && engine.getRuntime ? engine.getRuntime(sourceCardEl) : null;
          const hand = doc?.getElementById('my-hand-area');
          const cands = (ctx.raidBaseIds || rt?.lastRaidBases || []).filter(el => el?.parentElement?.id === 'my-outside-area');
          if (cands.length === 0 || !hand) { next(); return; }
          const maxPick = Math.min(step.max ?? 1, cands.length);
          const minPick = Math.min(step.min ?? 0, maxPick);
          engine.promptModal({
            title: `【${def?.name || '突襲基底回收'}】是否將突襲基底加回手牌`,
            desc: `可選擇最多 ${maxPick} 張突襲基底卡加回手牌：`,
            cards: cands, selectCount: maxPick, upTo: minPick === 0,
            onConfirm: (sel) => { (sel || []).forEach(c => engine.moveCardToZone(c, hand)); next(); }
          });
          return;
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
    ON_RAIDED: 'onRaided',
    ON_TURN_START: 'onTurnStart',
    ON_ATTACK_PHASE_START: 'onAttackPhaseStart',
    ON_ATTACK_PHASE_END: 'onAttackPhaseEnd',
    ON_OPP_ATTACK_PHASE_END: 'onOppAttackPhaseEnd',
    ON_TURN_END: 'onTurnEnd',
    ON_NON_PHASE_MOVE: 'onNonPhaseMove',
    ON_ALLY_BATTLE_WIN: 'onAllyBattleWin',
    ON_ALLY_ATTACK_END: 'onAllyAttackEnd',
    ON_OPP_ACTIVATED_MAIN: 'onOppActivatedMain',
    ON_DISCARDED_BY_EFFECT: 'onDiscardedByEffect',
    CONTINUOUS: 'onEventPlay'
  };

  const NEW_TIMINGS_ONLY = new Set([
    'ON_BATTLE_WIN', 'ON_UNBLOCKED', 'ON_BLOCKED', 'ON_ATTACK_END',
    'ON_ATTACK_PHASE_END', 'ON_TURN_END', 'ON_TURN_START', 'ON_RAIDED',
    'ON_DISCARDED_BY_EFFECT', 'ON_NON_PHASE_MOVE', 'ON_ATTACK_PHASE_START',
    'ON_OPP_ATTACK_PHASE_END', 'ON_ALLY_BATTLE_WIN', 'ON_ALLY_ATTACK_END',
    'ON_OPP_ACTIVATED_MAIN'
  ]);

  function tryTriggerV3(engine, cardEl, timing, ctxOrOnComplete, maybeOnComplete) {
    let initCtx = {};
    let onComplete = null;
    if (typeof ctxOrOnComplete === 'function') {
      onComplete = ctxOrOnComplete;
    } else if (ctxOrOnComplete && typeof ctxOrOnComplete === 'object') {
      initCtx = ctxOrOnComplete;
      onComplete = typeof maybeOnComplete === 'function' ? maybeOnComplete : null;
    }

    const def = engine.getCardDef(cardEl);
    if (!def) return false;
    const ir = getV3IR(engine, def);
    const prop = TIMING_MAP[timing];
    if (!prop) return false;
    if (timing === 'CONTINUOUS' && !isEventLike(engine, def, ir, cardEl)) return false;

    const rt = engine.getRuntime(cardEl);
    const silenced = isCardSilenced(engine, cardEl);
    const tempAbs = (rt?.v3TempAbilities || []).filter(t => t.timing === prop).map(t => t.ab);
    const isFull = !!(ir && ir._s === 1);
    const isNewTimingOnly = NEW_TIMINGS_ONLY.has(timing);

    // 只有 FULL 全自動卡、或舊引擎原本就沒支援的新時機、或有動態 TEMP_ABILITY 時才接管
    let irList = (!silenced && ir && (isFull || isNewTimingOnly) && Array.isArray(ir[prop])) ? [...ir[prop]] : [];

    // 繼承突襲基底時機 (inheritRaidBaseTimings)
    if (!silenced && rt?.isRaided && Array.isArray(ir?.inheritRaidBaseTimings) && ir.inheritRaidBaseTimings.includes(prop)) {
      let baseEls = initCtx.raidBaseIds || [];
      if (baseEls.length === 0 && cardEl.parentElement?.querySelectorAll) {
        baseEls = Array.from(cardEl.parentElement.querySelectorAll('.card')).filter(u => u !== cardEl && !u.classList.contains('is-flipped'));
      }
      for (const bEl of baseEls) {
        const bDef = engine.getCardDef(bEl);
        const bIr = getV3IR(engine, bDef);
        if (bIr && Array.isArray(bIr[prop])) irList.push(...bIr[prop]);
      }
    }

    const allAbs = [...irList, ...tempAbs];
    if (!isFull && allAbs.length === 0) return false;

    const isFront = !!(cardEl.closest && cardEl.closest('#my-front-line'));
    const isEnergy = !!(cardEl.closest && cardEl.closest('#my-energy-line'));
    if (rt) rt.usedV3Abilities = rt.usedV3Abilities || new Set();

    const baseCtx = { ...initCtx, vars: { ...(initCtx.vars || {}) } };
    const matched = [];
    allAbs.forEach((ab, idx) => {
      if (ab.requireRaided && !rt?.isRaided) return;
      if (ab.requireFrontLine && !isFront) return;
      if (ab.requireEnergyLine && !isEnergy) return;
      if (timing === 'ON_DISCARDED_BY_EFFECT') {
        const sDef = initCtx.sourceDef;
        if (ab.sourceColor && sDef?.color !== ab.sourceColor) return;
        if (ab.sourceName) {
          const sIr = sDef ? getV3IR(engine, sDef) : null;
          if (!cardMatchesName(sDef, sIr, ab.sourceName)) return;
        }
      }
      const key = `${timing}:${idx}`;
      if (ab.oncePerTurn && rt?.usedV3Abilities?.has(key)) return;
      if (ab.oncePerTurnNamed && engine.usedNamedAbilityThisTurn?.has(ab.oncePerTurnNamed)) return;
      if (ab.when && !evalCondition(engine, ab.when, cardEl, baseCtx)) return;
      matched.push({ ab, key });
    });

    if (matched.length === 0) {
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
      if (ab.oncePerTurn && rt?.usedV3Abilities) rt.usedV3Abilities.add(key);
      if (ab.oncePerTurnNamed && engine.usedNamedAbilityThisTurn) engine.usedNamedAbilityThisTurn.add(ab.oncePerTurnNamed);
      runV3Steps(engine, cardEl, ab.steps, { ...baseCtx, vars: { ...baseCtx.vars } }, () => runIdx(i + 1));
    };
    runIdx(0);
    return true;
  }

  function getV3MainAbilities(engine, cardEl) {
    if (isCardSilenced(engine, cardEl)) return null;
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

    const ctx = { vars: {} };
    const runBody = () => {
      if (ab.oncePerTurn) rt.usedV3Abilities.add(key);
      if (ab.oncePerTurnNamed && engine.usedNamedAbilityThisTurn) engine.usedNamedAbilityThisTurn.add(ab.oncePerTurnNamed);
      safeSendSystemChat(`[規則引擎 v3] 發動了【${def?.name || '卡片'}】的 [起動メイン] 效果！`);
      runV3Steps(engine, cardEl, ab.steps, ctx);
    };

    const payAllCosts = (ci) => {
      const costs = ab.costs || [];
      if (ci >= costs.length) { runBody(); return; }
      payV3CostThen(engine, cardEl, costs[ci], [], ctx, () => payAllCosts(ci + 1));
    };
    payAllCosts(0);
    return true;
  }

  return {
    getV3IR,
    getIR: getV3IR,
    isEventLike,
    matchesFilter,
    countZone,
    evalCondition,
    evalContinuousView,
    applyModifierToCard,
    getHandApDiscount,
    getHandEnergyDiscount,
    cardEntersActive,
    runV3Steps,
    tryTriggerV3,
    getV3MainAbilities,
    activateV3MainAbility
  };
});
