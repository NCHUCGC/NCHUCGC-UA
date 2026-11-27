/**
 * NCHUCGC 共用工具與卡庫索引模組 (ua-utils.js)
 * 統一管理色票常數、HTML 跳脫、卡號標準化、中文翻譯查詢與卡庫 Map 索引
 */
(function () {
    const COLOR_ZH = { RED: '紅', BLUE: '藍', GREEN: '綠', YELLOW: '黃', PURPLE: '紫', NONE: '無' };
    const COLOR_HEX = { RED: '#e74c3c', BLUE: '#3498db', GREEN: '#2ecc71', YELLOW: '#f1c40f', PURPLE: '#9b59b6', NONE: '#8c93ad' };
    const JP_COLOR_MAP = { '赤': 'RED', '青': 'BLUE', '緑': 'GREEN', '黄': 'YELLOW', '紫': 'PURPLE' };

    const catalogById = new Map();
    const catalogByBaseId = new Map();
    let indexedLength = -1;

    function escapeHtml(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function getBaseCardId(id) {
        if (!id) return '';
        return String(id).replace(/([/_](p\d+|s|sp\d*)|★)+$/i, '');
    }

    function getCanonicalKey(id) {
        const b = getBaseCardId(id);
        return b.includes('/') ? b.split('/', 2)[1] : b;
    }

    function ensureCatalogIndex(force = false) {
        if (typeof masterCardCatalog === 'undefined') return catalogById;
        if (!force && indexedLength === masterCardCatalog.length && catalogById.size > 0) {
            return catalogById;
        }
        catalogById.clear();
        catalogByBaseId.clear();
        for (let i = 0; i < masterCardCatalog.length; i++) {
            const c = masterCardCatalog[i];
            if (!c || !c.id) continue;
            catalogById.set(c.id, c);
            if (c.color && c.color !== 'NONE' && (c.bp !== null || c.effectText)) {
                const baseId = getBaseCardId(c.id);
                if (!catalogByBaseId.has(baseId)) {
                    catalogByBaseId.set(baseId, c);
                }
            }
        }
        indexedLength = masterCardCatalog.length;
        window.cardCatalogById = catalogById;
        return catalogById;
    }

    function getCardById(id) {
        if (!id) return null;
        ensureCatalogIndex();
        return catalogById.get(id) || null;
    }

    function getBaseCardById(id) {
        if (!id) return null;
        ensureCatalogIndex();
        return catalogByBaseId.get(getBaseCardId(id)) || null;
    }

    function getZhEntry(defOrId) {
        const map = window.UA_ZH_MAP;
        if (!map || !defOrId) return null;
        const rawId = typeof defOrId === 'string' ? defOrId : defOrId.id;
        if (!rawId) return null;
        const base = getBaseCardId(rawId);
        return map[base] || map[rawId] || null;
    }

    function getDisplayName(def) {
        if (!def) return '';
        const zh = getZhEntry(def);
        return (zh && zh.name) ? zh.name : (def.name || def.id || '');
    }

    function getDisplayEffectText(def) {
        if (!def) return '';
        const zh = getZhEntry(def);
        return (zh && zh.effectText) ? zh.effectText : (def.effectText || '');
    }

    function getDisplayTriggerText(def) {
        if (!def) return '';
        const zh = getZhEntry(def);
        return (zh && zh.triggerText) ? zh.triggerText : (def.triggerText || '');
    }

    function getCoverUrl(cardId, series, color) {
        ensureCatalogIndex();
        if (cardId) {
            const found = catalogById.get(cardId);
            if (found && found.imageUrl) return found.imageUrl;
            if (window.UA_IMG_HELPER) return window.UA_IMG_HELPER.resolveCardImageUrl(cardId);
            return `https://rugiacreation.com/ua/cardlist/small/${cardId.replace(/\//g, '_')}.jpg`;
        }
        if (typeof masterCardCatalog !== 'undefined' && series) {
            const fallback = masterCardCatalog.find(
                c => c.series === series && c.color === color && c.type === 'CHARACTER' && c.imageUrl
            );
            if (fallback) return fallback.imageUrl;
        }
        return '';
    }

    window.UAUtils = {
        COLOR_ZH,
        COLOR_HEX,
        JP_COLOR_MAP,
        catalogById,
        catalogByBaseId,
        escapeHtml,
        getBaseCardId,
        getCanonicalKey,
        ensureCatalogIndex,
        getCardById,
        getBaseCardById,
        getZhEntry,
        getDisplayName,
        getDisplayEffectText,
        getDisplayTriggerText,
        getCoverUrl
    };
})();
