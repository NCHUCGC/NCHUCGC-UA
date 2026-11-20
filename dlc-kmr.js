/**
 * UA DLC 腳本包：假面騎士 (Kamen Rider) - 1彈 + 2彈全色 (藍 / 綠 / 紅 / 黃，共 235 張)
 * 檔名：dlc/dlc-kmr.js
 */
(function () {
    const scripts = {};

    function hasNameOnMyField(engine, sub) {
        return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
            .some(c => engine.getCardDef(c)?.name?.includes(sub));
    }

    // ==================== 藍色 ====================

    // EX12BT/KMR-2-030 フォーゼ コズミックステイツ / 038 メテオ
    scripts['EX12BT/KMR-2-030'] = {
        requireRaided: true,
        getContinuousImpact(engine) {
            if (engine.isFirstPlayer !== null && !engine.isMyTurn) return 0;
            const cnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                .filter(c => engine.getCardDef(c)?.traits?.includes('天ノ川学園高校') && !engine.getCardDef(c)?.name?.includes('フォーゼ')).length;
            return cnt >= 3 ? 1 : 0;
        }
    };
    scripts['EX12BT/KMR-2-038'] = {
        getContinuousBpBonus(engine) {
            if (engine.isFirstPlayer !== null && !engine.isMyTurn) return 0;
            const cnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                .filter(c => engine.getCardDef(c)?.traits?.includes('天ノ川学園高校') && !engine.getCardDef(c)?.name?.includes('メテオ')).length;
            return cnt >= 3 ? 1000 : 0;
        }
    };

    // EX12BT/KMR-2-044 ライダーロケットドリルキック
    scripts['EX12BT/KMR-2-044'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = hasNameOnMyField(engine, 'フォーゼ') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA29BT/KMR-1-038 タカトラーター / 042 ラトラーター / 043 ゲンム / 052 ムテキゲーマー / 061 パラドクス
    scripts['UA29BT/KMR-1-038'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; } };
    scripts['UA29BT/KMR-1-042'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1500 : 0; } };
    scripts['UA29BT/KMR-1-043'] = { getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; } };
    scripts['UA29BT/KMR-1-052'] = { requireRaided: true, getContinuousBpBonus() { return 1000; } };
    scripts['UA29BT/KMR-1-061'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA29BT/KMR-1-064 スキャニングチャージ / 067 マイティクリティカルストライク
    scripts['UA29BT/KMR-1-064'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasOOO = hasNameOnMyField(engine, 'オーズ');
            const handCnt = document.querySelectorAll('#my-hand-area .card').length;
            const maxBp = hasOOO ? (handCnt >= 3 ? 5000 : 4000) : 2000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA29BT/KMR-1-067'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = (hasNameOnMyField(engine, 'エグゼイド') || hasNameOnMyField(engine, 'ゲンム')) ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // UA29ST/KMR-1-110 オーズ タトバ コンボ
    scripts['UA29ST/KMR-1-110'] = {
        getContinuousBpBonus(engine) {
            if (engine.isFirstPlayer !== null && !engine.isMyTurn) return 0;
            return Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => engine.getCardDef(c)?.name?.includes('メダル')).length * 500;
        }
    };

    // ==================== 綠色 ====================

    // EX12BT/KMR-2-046 アクセルトライアル / 051 サイクロンメタル / 053 ヒートトリガー
    scripts['EX12BT/KMR-2-046'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; },
        onPlay(engine, cardEl, onComplete) {
            const hasOtherEn4 = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').some(c => c !== cardEl && (engine.getCardDef(c)?.requiredEnergy?.count || 0) >= 4);
            if (!hasOtherEn4) cardEl.classList.remove('rest');
            if (onComplete) onComplete();
        }
    };
    scripts['EX12BT/KMR-2-051'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer !== null && !engine.isMyTurn) ? -1500 : 0; } };
    scripts['EX12BT/KMR-2-053'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; } };

    // EX12BT/KMR-2-061 さあ、おまえの罪を数えろ
    scripts['EX12BT/KMR-2-061'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const cnt = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                .filter(c => { const d = engine.getCardDef(c); return d && (d.name?.includes('Ｗ') || d.name?.includes('メモリチェンジ')); }).length;
            if (cnt === 0) { if (onComplete) onComplete(); return; }
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: cnt * 1000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // EX12BT/KMR-2-072 キバ(DCD) / 073 クウガ(DCD) / 074 響鬼(DCD) / 075 ブレイド(DCD) / 077 ファイナルアタックライド
    scripts['EX12BT/KMR-2-072'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && hasNameOnMyField(engine, 'ディケイド')) ? 500 : 0; } };
    scripts['EX12BT/KMR-2-073'] = {
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; },
        getContinuousImpact(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1 : 0; }
    };
    scripts['EX12BT/KMR-2-074'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; },
        getContinuousBpBonus(engine) { return (engine.isFirstPlayer !== null && !engine.isMyTurn && (hasNameOnMyField(engine, 'ディケイド') || hasNameOnMyField(engine, 'ディエンド'))) ? 1000 : 0; }
    };
    scripts['EX12BT/KMR-2-075'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && hasNameOnMyField(engine, 'ディケイド')) ? 1000 : 0; } };
    scripts['EX12BT/KMR-2-077'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = hasNameOnMyField(engine, 'ディケイド') ? 5000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 紅色 ====================

    // EX12BT/KMR-2-082 カイザ / 088 ナイト / 091 龍騎 / 096 ドラグレッダー
    scripts['EX12BT/KMR-2-082'] = {
        getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name?.includes('ファイズ')) ? 0 : 2; },
        getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && engine.getSlotTopCards('#my-front-line .slot').some(c => engine.getCardDef(c)?.name?.includes('ファイズ'))) ? 1000 : 0; }
    };
    scripts['EX12BT/KMR-2-088'] = { getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; } };
    scripts['EX12BT/KMR-2-091'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && hasNameOnMyField(engine, 'ナイト')) ? 1000 : 0; } };
    scripts['EX12BT/KMR-2-096'] = { getContinuousBpBonus(engine) { return ((engine.isFirstPlayer === null || engine.isMyTurn) && hasNameOnMyField(engine, '仮面ライダー龍騎サバイブ')) ? 1000 : 0; } };

    // UA29BT/KMR-1-087 スネークオルフェノク / 096 俺の必殺技！ / 099 クリムゾンスマッシュ
    scripts['UA29BT/KMR-1-087'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['YELLOW', 'BLUE'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };
    scripts['UA29BT/KMR-1-096'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasRaidDeno = engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot')
                .some(c => engine.getCardDef(c)?.name?.includes('電王') && engine.getRuntime(c)?.isRaided);
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: hasRaidDeno ? 5000 : 3000, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA29BT/KMR-1-099'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = hasNameOnMyField(engine, 'ファイズ') ? 4000 : 3000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: true },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };

    // ==================== 黃色 ====================

    // EX12BT/KMR-2-020 ブレイキングマンモス / 021 ヘルライジングホッパー / UA29BT/KMR-1-009 ゲイツリバイブ疾風 / 015 ツクヨミ
    scripts['EX12BT/KMR-2-020'] = { getEnergyDiscount(engine) { return engine.getSlotTopCards('#my-front-line .slot, #my-energy-line .slot').length === 0 ? 2 : 0; } };
    scripts['EX12BT/KMR-2-021'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; } };
    scripts['UA29BT/KMR-1-009'] = { getContinuousBpBonus(engine) { return (engine.isFirstPlayer === null || engine.isMyTurn) ? 1000 : 0; } };
    scripts['UA29BT/KMR-1-015'] = {
        getEnergyDiscount(engine) {
            return engine.getSlotTopCards('#opp-front-line .slot, #opp-energy-line .slot').some(c => ['BLUE', 'RED'].includes(engine.getCardDef(c)?.color)) ? 1 : 0;
        }
    };

    // UA29BT/KMR-1-001 仮面ライダーアークワン
    scripts['UA29BT/KMR-1-001'] = {
        getEnergyDiscount(engine) {
            const cnt = Array.from(document.querySelectorAll('#my-outside-area .card')).filter(c => {
                const d = engine.getCardDef(c);
                return d && (d.apCost ?? 1) === 2 && d.traits?.length > 0;
            }).length;
            return cnt >= 2 ? 5 : 0;
        }
    };

    // UA29BT/KMR-1-031 タイムブレーク / 033 ライジングインパクト
    scripts['UA29BT/KMR-1-031'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const maxBp = hasNameOnMyField(engine, 'ジオウ') ? 5000 : 2000;
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp, count: 1, upTo: false },
                { type: 'RETIRE_TARGET', target: 'SELECTED' }
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA29BT/KMR-1-033'] = {
        onEventPlay(engine, cardEl, onComplete) {
            const hasZ1 = hasNameOnMyField(engine, 'ゼロワン');
            engine.executeAbilityActions(cardEl, [
                { type: 'SELECT_TARGET', owner: 'OPP', zone: 'FRONT_LINE', maxBp: 5000, count: 1, upTo: false },
                ...(hasZ1 ? [{ type: 'RETIRE_TARGET', target: 'SELECTED' }] : [{ type: 'SET_REST', target: 'SELECTED' }, { type: 'FREEZE_TARGET', target: 'SELECTED' }])
            ], 0, { selectedTargets: [], addedFromLook: false }, onComplete);
        }
    };
    scripts['UA29ST/KMR-1-033'] = scripts['UA29BT/KMR-1-033'];

    if (typeof window.registerCardScripts === 'function') window.registerCardScripts(scripts);
    else window.UACardScripts = Object.assign(window.UACardScripts || {}, scripts);
})();
