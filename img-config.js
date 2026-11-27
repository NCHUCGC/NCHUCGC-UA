/**
 * NCHUCGC 自架圖床與卡圖降級設定檔 (img-config.js)
 *
 * 【切換為你的 Cloudflare R2 自架圖床只需改 1 行】
 * 1. 將下方的 baseUrl 填入你的 R2 公開網址（結尾加斜線），例如：
 *      baseUrl: 'https://pub-xxxxxxxxxxxx.r2.dev/cards/'
 *    或本地資料夾測試：
 *      baseUrl: './card-images/'
 * 2. 若已轉成 WebP，將 ext 設為 'webp'（若直接上傳原 PNG 則改為 'png'）。
 * 3. 完成後可將 fallbackToRugia 改為 false，即 100% 僅讀取你的自架圖床。
 *
 * 詳細架設與批次轉檔上傳步驟請見：tools/r2-setup-guide.md
 */
(function () {
    const CONFIG = Object.assign({
        // 你的自架圖床根目錄網址（留空 '' 時進入過渡模式）
        baseUrl: '',
        // 自架圖床使用的圖片副檔名（'webp' | 'png' | 'jpg'）
        ext: 'webp',
        // 過渡期備援：當 baseUrl 留空時，暫時使用支援 CORS 的備援圖床避免全站黑畫面
        // （當你填好自己的 R2 baseUrl 後，建議改為 false）
        fallbackToRugia: true,
        // 自訂卡背圖網址（留空則自動使用內建高質感 SVG 卡背，完全不依賴外部網站）
        customCardBack: '',
        customApBack: ''
    }, window.UA_IMG_CONFIG || {});

    window.UA_IMG_CONFIG = CONFIG;

    const COLOR_BG = {
        RED: ['#5c1822', '#260b10', '#e74c3c'],
        BLUE: ['#153963', '#0b182b', '#3498db'],
        GREEN: ['#144d32', '#092116', '#2ecc71'],
        YELLOW: ['#614d12', '#261e08', '#f1c40f'],
        PURPLE: ['#3f1d61', '#1a0c29', '#9b59b6'],
        NONE: ['#2a2f45', '#121521', '#8c93ad']
    };

    function stripQueryAndExt(raw) {
        if (!raw) return '';
        let s = String(raw).trim();
        if (/^https?:\/\//i.test(s)) {
            s = s.split('/').pop() || '';
        }
        s = s.split('?')[0].split('#')[0];
        return s.replace(/\.(png|jpg|jpeg|webp)$/i, '').replace(/\//g, '_');
    }

    function getBaseFilename(stem) {
        return String(stem || '').replace(/(_(p\d+|s|sp\d*)|★)+$/i, '');
    }

    function buildRugiaUrl(stem) {
        if (!stem) return '';
        return `https://rugiacreation.com/ua/cardlist/small/${encodeURIComponent(stem)}.jpg`;
    }

    function resolveCardImageUrl(rawFileOrId) {
        if (!rawFileOrId) return '';
        const raw = String(rawFileOrId).trim();
        if (/^data:image\//i.test(raw)) return raw;
        // 保留使用者自訂圖床/非官網的外部 HTTPS 連結（例如玩家自製卡）
        if (/^https?:\/\//i.test(raw) && !/unionarena-tcg\.com/i.test(raw)) {
            return raw;
        }
        const stem = stripQueryAndExt(raw);
        if (!stem) return '';

        const base = (CONFIG.baseUrl || '').trim();
        if (base) {
            const normBase = base.endsWith('/') ? base : (base + '/');
            const ext = (CONFIG.ext || 'webp').replace(/^\./, '');
            return `${normBase}${encodeURIComponent(stem)}.${ext}`;
        }
        if (CONFIG.fallbackToRugia) {
            return buildRugiaUrl(stem);
        }
        return makeFallbackSvg(stem);
    }

    function escXml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
        }[c]));
    }

    function makeFallbackSvg(cardOrId) {
        let def = null;
        if (cardOrId && typeof cardOrId === 'object') {
            def = cardOrId;
        } else if (typeof cardOrId === 'string' && window.UAUtils && typeof window.UAUtils.getCardById === 'function') {
            def = window.UAUtils.getCardById(cardOrId);
        }
        const idText = (def && def.id) ? def.id : (typeof cardOrId === 'string' ? cardOrId.replace(/_/g, '/') : 'CARD');
        const displayName = (def && window.UAUtils && typeof window.UAUtils.getDisplayName === 'function')
            ? window.UAUtils.getDisplayName(def)
            : ((def && def.name) ? def.name : idText);
        const colorKey = (def && def.color && COLOR_BG[def.color]) ? def.color : 'NONE';
        const [cTop, cBot, cAccent] = COLOR_BG[colorKey];
        const bpStr = (def && def.bp != null) ? `BP ${def.bp}` : (def && def.type ? def.type : '');
        const reqStr = (def && def.requiredEnergy && def.requiredEnergy.count > 0)
            ? `⚡${def.requiredEnergy.count}` : '';
        const nameLine1 = displayName.slice(0, 11);
        const nameLine2 = displayName.length > 11 ? displayName.slice(11, 22) : '';

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350">`
            + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`
            + `<stop offset="0%" stop-color="${cTop}"/><stop offset="100%" stop-color="${cBot}"/>`
            + `</linearGradient></defs>`
            + `<rect width="250" height="350" rx="14" fill="url(#g)"/>`
            + `<rect x="8" y="8" width="234" height="334" rx="10" fill="none" stroke="${cAccent}" stroke-width="3" stroke-opacity="0.75"/>`
            + `<rect x="16" y="18" width="218" height="34" rx="6" fill="rgba(0,0,0,0.45)"/>`
            + `<text x="26" y="40" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="700">${escXml(reqStr)}</text>`
            + `<text x="224" y="40" text-anchor="end" fill="#ffd97d" font-family="sans-serif" font-size="15" font-weight="700">${escXml(bpStr)}</text>`
            + `<text x="125" y="165" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="20" font-weight="700">${escXml(nameLine1)}</text>`
            + (nameLine2 ? `<text x="125" y="194" text-anchor="middle" fill="#e5e9f5" font-family="sans-serif" font-size="18" font-weight="600">${escXml(nameLine2)}</text>` : '')
            + `<text x="125" y="245" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-family="monospace" font-size="13">${escXml(idText)}</text>`
            + `<text x="125" y="324" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-family="sans-serif" font-size="12">NCHUCGC 卡圖佔位</text>`
            + `</svg>`;
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }

    function makeCardBackSvg(isAp) {
        const bg1 = isAp ? '#36215c' : '#16254a';
        const bg2 = isAp ? '#140c26' : '#090e1f';
        const ring = isAp ? '#d4b8ff' : '#d8b46a';
        const title = isAp ? 'ACTION' : 'UNION';
        const sub = isAp ? 'POINT' : 'ARENA';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 350">`
            + `<defs><radialGradient id="b" cx="50%" cy="45%" r="65%">`
            + `<stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/>`
            + `</radialGradient></defs>`
            + `<rect width="250" height="350" rx="14" fill="url(#b)"/>`
            + `<rect x="10" y="10" width="230" height="330" rx="10" fill="none" stroke="${ring}" stroke-width="2.5" stroke-opacity="0.7"/>`
            + `<rect x="18" y="18" width="214" height="314" rx="7" fill="none" stroke="${ring}" stroke-width="1" stroke-opacity="0.35"/>`
            + `<polygon points="125,68 188,175 125,282 62,175" fill="none" stroke="${ring}" stroke-width="2" stroke-opacity="0.65"/>`
            + `<circle cx="125" cy="175" r="54" fill="rgba(0,0,0,0.35)" stroke="${ring}" stroke-width="2"/>`
            + `<text x="125" y="170" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="22" font-weight="800" letter-spacing="3">${title}</text>`
            + `<text x="125" y="196" text-anchor="middle" fill="${ring}" font-family="sans-serif" font-size="16" font-weight="700" letter-spacing="4">${sub}</text>`
            + `<text x="125" y="316" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-family="sans-serif" font-size="11" letter-spacing="2">NCHUCGC</text>`
            + `</svg>`;
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }

    function handleImgError(imgEl, cardOrId) {
        if (!imgEl) return;
        const stage = Number(imgEl.dataset.imgFallbackStage || 0);
        const rawId = (cardOrId && typeof cardOrId === 'object') ? (cardOrId.id || '') : String(cardOrId || '');
        const stem = stripQueryAndExt(rawId || imgEl.getAttribute('src') || '');
        const baseStem = getBaseFilename(stem);

        // 第 1 階段：如果是異圖（如 _p1 / _p2），先降級嘗試同卡號原圖
        if (stage < 1 && baseStem && baseStem !== stem) {
            imgEl.dataset.imgFallbackStage = '1';
            imgEl.src = resolveCardImageUrl(baseStem);
            return;
        }
        // 第 2 階段：若使用自架圖床但該張缺圖、且允許備援，嘗試備援圖床
        if (stage < 2 && CONFIG.baseUrl && CONFIG.fallbackToRugia && baseStem) {
            imgEl.dataset.imgFallbackStage = '2';
            imgEl.src = buildRugiaUrl(baseStem);
            return;
        }
        // 第 3 階段：優雅降級為 SVG 文字卡面（永不顯示破圖或黑框）
        imgEl.dataset.imgFallbackStage = '3';
        imgEl.onerror = null;
        imgEl.src = makeFallbackSvg(cardOrId || rawId);
    }

    // 將卡背圖注入 CSS 變數（支援自架卡背或內建 SVG，徹底移除官網熱連）
    function applyCardBackCssVars() {
        if (typeof document === 'undefined' || !document.documentElement) return;
        const normalBack = (CONFIG.customCardBack || '').trim() || makeCardBackSvg(false);
        const apBack = (CONFIG.customApBack || '').trim() || makeCardBackSvg(true);
        document.documentElement.style.setProperty('--ua-card-back', `url("${normalBack}")`);
        document.documentElement.style.setProperty('--ua-ap-back', `url("${apBack}")`);
    }

    if (typeof document !== 'undefined') {
        if (document.documentElement) applyCardBackCssVars();
        else document.addEventListener('DOMContentLoaded', applyCardBackCssVars);
    }

    window.UA_IMG_HELPER = {
        resolveCardImageUrl,
        makeFallbackSvg,
        makeCardBackSvg,
        handleImgError,
        applyCardBackCssVars
    };
})();
