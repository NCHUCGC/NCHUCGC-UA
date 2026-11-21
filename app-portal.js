/**
 * NCHUCGC 首頁儀表板、社團公告與環境排表模組 (app-portal.js)
 */
(function initNCHUCGC() {
            const COLOR_ZH = window.UAUtils ? window.UAUtils.COLOR_ZH : { RED: '紅', BLUE: '藍', GREEN: '綠', YELLOW: '黃', PURPLE: '紫' };
            const TIER_DEFS = [
                { key: 'T0', label: 'T0' },
                { key: 'T1', label: 'T1' },
                { key: 'T2', label: 'T2' },
                { key: 'T3', label: 'T3' },
                { key: 'T4', label: 'T4' },
                { key: 'T5', label: 'T5' },
                { key: 'T6', label: 'T6' },
                { key: 'UNRATED', label: '待評定' }
            ];

            let tierColorFilter = 'ALL';
            let tierSeriesFilter = 'ALL';
            const tierTagFilter = new Set();
            let tagPanelOpen = false;
            let seriesOptionsSig = '';
            let draggedDeckId = null;

            function isAdmin() {
                return !!(window.nchucgcLobby && window.nchucgcLobby.isAdminUser());
            }

            function syncTierListNow() {
                if (!isAdmin()) return;
                const cleanList = (window.NCHUCGC_TIER_LIST || []).map(({ _isCustom, ...rest }) => rest);
                window.nchucgcLobby.publishOfficialTierList(cleanList);
            }

            window.switchMainView = function (viewName) {
                const map = {
                    home: document.getElementById('home-scene'),
                    tier: document.getElementById('tier-scene'),
                    builder: document.getElementById('builder-scene'),
                    rooms: document.getElementById('lobby-scene')
                };
                Object.entries(map).forEach(([k, el]) => {
                    if (el) el.style.display = (k === viewName) ? 'flex' : 'none';
                });
                document.querySelectorAll('#nchucgc-nav .nav-tab').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.view === viewName);
                });
                if (viewName === 'tier') renderTierBoard();
                if (viewName === 'home') renderHome();
                if (typeof updateBackTop === 'function') updateBackTop();
            };

            function getCoverUrl(cardId, series, color) {
                return window.UAUtils ? window.UAUtils.getCoverUrl(cardId, series, color) : '';
            }

            function formatDiff(d) {
                return (d === null || d === undefined || d === '') ? '待評' : `${d} / 5`;
            }

            function renderHome() {
                const meta = window.NCHUCGC_TIER_META || {};
                const updEl = document.getElementById('home-updated-at');
                if (updEl && meta.updatedAt) updEl.textContent = `更新於 ${meta.updatedAt}`;

                // 1. 即時數據條（線上房間、排表副數、卡庫張數）
                const roomsEl = document.getElementById('home-stat-rooms');
                if (roomsEl) {
                    const summary = (window.nchucgcLobby && typeof window.nchucgcLobby.getRoomsSummary === 'function')
                        ? window.nchucgcLobby.getRoomsSummary()
                        : { waiting: 0, playing: 0, total: 0 };
                    roomsEl.innerHTML = `${summary.waiting}<small>等待中${summary.playing ? ` / ${summary.playing} 對戰中` : ''}</small>`;
                }
                const list = window.NCHUCGC_TIER_LIST || [];
                const decksEl = document.getElementById('home-stat-decks');
                if (decksEl) decksEl.innerHTML = `${list.length}<small>副牌組</small>`;
                const cardsEl = document.getElementById('home-stat-cards');
                if (cardsEl && typeof masterCardCatalog !== 'undefined') {
                    cardsEl.innerHTML = `${masterCardCatalog.length.toLocaleString()}<small>張卡片</small>`;
                }

                // 2. 目前出戰牌組狀態
                const nameEl = document.getElementById('home-active-deck-name');
                const cntEl = document.getElementById('home-active-deck-cnt');
                const badgeEl = document.getElementById('home-ready-badge');
                if (nameEl) nameEl.textContent = currentDeckName || '預設牌組';
                if (cntEl) cntEl.textContent = `主牌 ${myDeckData.length} / 50 ｜ AP ${myApData.length} / 3`;
                if (badgeEl) {
                    const ok = myDeckData.length === 50 && myApData.length === 3;
                    badgeEl.className = 'home-ready-badge ' + (ok ? 'ok' : 'warn');
                    badgeEl.textContent = ok ? '已就緒' : '構築中';
                }

                // 3. 環境焦點牌組（優先 T0 -> T1 -> T2 -> 其餘，最多顯示 8 副）
                const metaGrid = document.getElementById('home-meta-grid');
                if (metaGrid) {
                    const rankOrder = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4, T5: 5, T6: 6, UNRATED: 7 };
                    const topDecks = [...list]
                        .sort((a, b) => (rankOrder[a.tier] ?? 9) - (rankOrder[b.tier] ?? 9))
                        .slice(0, 8);
                    metaGrid.innerHTML = '';
                    if (topDecks.length === 0) {
                        metaGrid.innerHTML = '<div style="grid-column:1/-1; color:#7f85a3; font-size:13px; padding:24px; text-align:center;">尚無排表資料</div>';
                    } else {
                        topDecks.forEach(deck => {
                            const tierLabel = TIER_DEFS.find(t => t.key === deck.tier)?.label || deck.tier;
                            const card = document.createElement('div');
                            card.className = `home-meta-card ${deck.color}`;
                            card.innerHTML = `
                                <span class="home-meta-tier ${esc(deck.tier)}">${esc(tierLabel)}</span>
                                ${coverThumbHtml(deck)}
                                <div class="home-meta-info">
                                    <div class="home-meta-name">${esc(deck.name)}</div>
                                    <div class="home-meta-sub">
                                        <span class="home-meta-series">${esc(deck.series)}</span>
                                        <span>${COLOR_ZH[deck.color] || deck.color}</span>
                                    </div>
                                </div>
                            `;
                            card.onclick = () => openTierDetail(deck);
                            metaGrid.appendChild(card);
                        });
                    }
                }

                // 4. 社團公告與管理員編輯入口
                const editAnnBtn = document.getElementById('btn-home-edit-ann');
                if (editAnnBtn) editAnnBtn.style.display = isAdmin() ? 'inline-block' : 'none';

                const box = document.getElementById('home-announcements');
                const anns = Array.isArray(meta.announcements) ? meta.announcements : [];
                if (box) {
                    if (anns.length === 0) {
                        box.innerHTML = '<div style="color:#7f85a3; font-size:13px; padding:16px; text-align:center;">目前尚無社團公告</div>';
                    } else {
                        box.innerHTML = anns.map(a => `
                            <div class="announce-item">
                                <div class="announce-head"><span>${esc(a.title)}</span><span class="announce-date">${esc(a.date)}</span></div>
                                <div class="announce-body">${esc(a.body)}</div>
                            </div>
                        `).join('');
                    }
                }
            }
            window.renderHomeDashboard = renderHome;

            function renderAnnEditorList() {
                const listBox = document.getElementById('home-ann-edit-list');
                if (!listBox) return;
                const anns = (window.NCHUCGC_TIER_META && Array.isArray(window.NCHUCGC_TIER_META.announcements))
                    ? window.NCHUCGC_TIER_META.announcements : [];
                if (anns.length === 0) {
                    listBox.innerHTML = '<div style="color:#7f85a3; font-size:12px; text-align:center; padding:10px;">目前沒有公告</div>';
                    return;
                }
                listBox.innerHTML = '';
                anns.forEach((a, idx) => {
                    const row = document.createElement('div');
                    row.className = 'home-ann-edit-row';
                    row.innerHTML = `
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:13px; font-weight:700; color:#fff;">${esc(a.title)} <span style="font-size:11px; color:#8c96b5; font-weight:400;">(${esc(a.date)})</span></div>
                            <div style="font-size:12px; color:#b8c0d9; margin-top:3px;">${esc(a.body)}</div>
                        </div>
                        <button class="ctrl-btn danger" style="padding:4px 10px; font-size:11px; flex-shrink:0;">刪除</button>
                    `;
                    row.querySelector('button').onclick = () => {
                        const next = anns.filter((_, i) => i !== idx);
                        window.NCHUCGC_TIER_META.announcements = next;
                        renderHome();
                        renderAnnEditorList();
                        if (window.nchucgcLobby && typeof window.nchucgcLobby.publishAnnouncements === 'function') {
                            window.nchucgcLobby.publishAnnouncements(next);
                        }
                    };
                    listBox.appendChild(row);
                });
            }

            const esc = window.UAUtils ? window.UAUtils.escapeHtml : (v => String(v == null ? '' : v));

            // 代表卡：優先使用 coverCardIds（最多 3 張，混軸用），相容舊資料 coverCardId
            function getDeckCoverIds(deck) {
                const ids = (Array.isArray(deck.coverCardIds) && deck.coverCardIds.length)
                    ? deck.coverCardIds : (deck.coverCardId ? [deck.coverCardId] : []);
                return ids.filter(Boolean).slice(0, 3);
            }

            function coverThumbHtml(deck) {
                const ids = getDeckCoverIds(deck);
                if (ids.length >= 2) {
                    return `<div class="tier-deck-cover-dual">${ids.map(id => `<img src="${esc(getCoverUrl(id, deck.series, deck.color))}" loading="lazy" alt="">`).join('')}</div>`;
                }
                return `<img class="tier-deck-cover" src="${esc(getCoverUrl(ids[0] || '', deck.series, deck.color))}" loading="lazy" alt="${esc(deck.name)}">`;
            }

            function fillCardDatalist(series) {
                const dl = document.getElementById('tier-card-datalist');
                if (!dl || typeof masterCardCatalog === 'undefined') return;
                dl.innerHTML = masterCardCatalog
                    .filter(c => c.series === series && c.type !== 'AP')
                    .map(c => `<option value="${esc(c.id)}">${esc((COLOR_ZH[c.color] || '') + ' ' + c.name)}</option>`).join('');
            }

            function bindCoverPreview(input, img) {
                if (!input || !img) return;
                const update = () => {
                    const id = input.value.trim().toUpperCase();
                    if (!id) { img.style.display = 'none'; img.removeAttribute('src'); return; }
                    img.src = getCoverUrl(id);
                    img.style.display = 'block';
                };
                input.addEventListener('input', update);
                input.addEventListener('change', update);
                img.onerror = () => { img.style.display = 'none'; };
                update();
            }

            function parseCoverInputs(...vals) {
                return vals.map(v => (v || '').trim().toUpperCase()).filter(Boolean).slice(0, 3);
            }
            function parseTags(str) {
                return (str || '').split(/[,，、;；\s]+/).map(t => t.trim()).filter(Boolean);
            }
            function parseLines(str) {
                return (str || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);
            }

            // ===== 牌表與統計（資料來源：cards.js 的 masterCardCatalog；sampleDeck 為卡號平面清單，重複＝張數） =====
            const TRIGGER_ORDER = ['ドロー', 'アクティブ', 'ゲット', 'カラー', 'スペシャル', 'ファイナル', 'レイド'];

            function parseDeckText(text) {
                const out = [];
                const re = /(?:(\d{1,2})\s*[x×*＊]\s*)?((?:UA|EX)[0-9A-Z]*\/[0-9A-Z]+(?:-[0-9A-Z]+)+)(?:\s*[x×*＊]\s*(\d{1,2}))?/gi;
                let m;
                while ((m = re.exec(text || '')) !== null) {
                    const id = m[2].toUpperCase();
                    const n = Math.min(Number(m[1] || m[3] || 1), 60);
                    for (let i = 0; i < n; i++) out.push(id);
                }
                return out;
            }

            function cardCost(c) { return (c && c.requiredEnergy && Number(c.requiredEnergy.count)) || 0; }

            function groupDeck(ids) {
                if (typeof ensureCatalogMap === 'function') ensureCatalogMap();
                const map = new Map();
                (ids || []).forEach(id => map.set(id, (map.get(id) || 0) + 1));
                const typeRank = { CHARACTER: 0, EVENT: 1, FIELD: 2 };
                return Array.from(map.entries()).map(([id, n]) => ({ id, n, card: window.cardCatalogById && window.cardCatalogById.get(id) }))
                    .sort((a, b) => {
                        const ca = a.card ? cardCost(a.card) : 999, cb = b.card ? cardCost(b.card) : 999;
                        if (ca !== cb) return ca - cb;
                        const ta = a.card ? (typeRank[a.card.type] ?? 9) : 9, tb = b.card ? (typeRank[b.card.type] ?? 9) : 9;
                        return ta - tb || a.id.localeCompare(b.id);
                    });
            }

            function deckToText(ids) {
                return groupDeck(ids).map(g => `${g.id} x${g.n}`).join('\n');
            }

            function computeDeckStats(ids) {
                const groups = groupDeck(ids);
                const known = groups.filter(g => g.card && g.card.type !== 'AP');
                const st = { total: 0, unknown: 0, ap: 0, buckets: Array(8).fill(0), types: { CHARACTER: 0, EVENT: 0, FIELD: 0 },
                    triggers: {}, triggerTotal: 0, costSum: 0, bpSum: 0, bpCount: 0, over4: [] };
                groups.forEach(g => {
                    if (!g.card) st.unknown += g.n;
                    else if (g.card.type === 'AP') st.ap += g.n;
                    if (g.n > 4) st.over4.push(g.id);
                });
                known.forEach(({ card, n }) => {
                    st.total += n;
                    const cost = cardCost(card);
                    st.buckets[Math.min(cost >= 100 ? 0 : cost, 7)] += n;
                    st.costSum += (cost >= 100 ? 0 : cost) * n;
                    if (st.types[card.type] !== undefined) st.types[card.type] += n;
                    if (card.type === 'CHARACTER' && card.bp) { st.bpSum += card.bp * n; st.bpCount += n; }
                    const tt = (card.triggerText || '').trim();
                    if (tt) {
                        const m = tt.match(/^\[([^\]]+)\]/);
                        const name = m ? m[1] : '其他';
                        st.triggers[name] = (st.triggers[name] || 0) + n;
                        st.triggerTotal += n;
                    }
                });
                return st;
            }

            function deckSectionHtml(deck) {
                const ids = deck.sampleDeck || [];
                if (!ids.length) return '';
                const st = computeDeckStats(ids);
                const groups = groupDeck(ids);
                const isFull = ids.length >= 40;
                const title = isFull ? `牌表（${ids.length} 張）` : `核心組件（${ids.length} 張，非完整牌表）`;
                const avg = st.total ? (st.costSum / st.total).toFixed(2) : '-';
                const avgBp = st.bpCount ? Math.round(st.bpSum / st.bpCount) : '-';
                const maxB = Math.max(1, ...st.buckets);
                const warns = [];
                if (ids.length > 50) warns.push(`牌表共 ${ids.length} 張，超過 50 張。`);
                if (st.over4.length) warns.push(`有卡片超過 4 張：${st.over4.map(esc).join('、')}`);
                if (st.unknown) warns.push(`有 ${st.unknown} 張卡號在卡庫中找不到，未列入統計。`);
                if (!isFull) warns.push('張數不足完整牌表，統計僅供參考。');
                const trigNames = Object.keys(st.triggers).sort((a, b) => {
                    const ia = TRIGGER_ORDER.indexOf(a), ib = TRIGGER_ORDER.indexOf(b);
                    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                });
                return `
                    <div class="td-section">
                        <h4><span>${title}</span><small>統計依 cards.js 卡庫自動計算</small></h4>
                        ${warns.length ? `<div class="ds-warn">${warns.join('<br>')}</div>` : ''}
                        <div class="ds-stats">
                            <div>
                                <div style="font-size:12px; color:#9aa0b8; margin-bottom:4px;">費用曲線（必要能源）</div>
                                <div class="ds-curve">
                                    ${st.buckets.map((n, i) => `<div class="ds-bar-col"><span>${n || ''}</span><div class="ds-bar" style="height:${Math.round(n / maxB * 62)}px;${n ? '' : 'opacity:0.25;'}"></div><span class="ds-bar-label">${i === 7 ? '7+' : i}</span></div>`).join('')}
                                </div>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <div class="ds-badges">
                                    <span class="td-badge">平均費用 ${avg}</span>
                                    <span class="td-badge">平均 BP ${avgBp}</span>
                                </div>
                                <div class="ds-badges">
                                    <span class="td-badge">角色 ${st.types.CHARACTER}</span>
                                    <span class="td-badge">事件 ${st.types.EVENT}</span>
                                    <span class="td-badge">場域 ${st.types.FIELD}</span>
                                </div>
                                <div style="font-size:12px; color:#9aa0b8;">Trigger 共 ${st.triggerTotal} 張${st.total ? `（${Math.round(st.triggerTotal / st.total * 100)}%）` : ''}</div>
                                <div class="ds-badges">
                                    ${trigNames.length ? trigNames.map(n => `<span class="td-badge">${esc(n)} ${st.triggers[n]}</span>`).join('') : '<span style="color:#7f85a3; font-size:12px;">無 Trigger 資料</span>'}
                                </div>
                            </div>
                        </div>
                        <div class="ds-grid">
                            ${groups.map(g => `
                                <div class="ds-card ${g.card ? '' : 'is-unknown'}" title="${esc(g.id)}${g.card ? ' ' + esc(g.card.name) : '（卡庫查無此卡號）'}">
                                    <img src="${esc(getCoverUrl(g.id))}" loading="lazy" alt="${esc(g.id)}" onerror="this.style.opacity=0.2">
                                    ${g.card && g.card.type !== 'AP' ? `<span class="ds-cost">${cardCost(g.card) >= 100 ? '-' : cardCost(g.card)}</span>` : ''}
                                    <span class="ds-count">×${g.n}</span>
                                </div>`).join('')}
                        </div>
                    </div>`;
            }

            // ===== 牌表輸入工具：從「我的牌組」帶入、搜尋加入單張 =====
            function deckToolsHtml(p) {
                let names = [];
                try { names = Object.keys(allDecks || {}); } catch (e) { names = []; }
                const opts = names.map(n => {
                    const cnt = ((allDecks[n] && allDecks[n].main) || []).length;
                    return `<option value="${esc(n)}">${esc(n)}（${cnt} 張）</option>`;
                }).join('');
                return `
                    <div class="deck-tools">
                        <select id="${p}-mydeck" title="選擇你在牌組構築做好的牌組">${opts || '<option value="">（尚無牌組）</option>'}</select>
                        <button type="button" class="ctrl-btn" id="${p}-btn-mydeck" style="background:#3b6ea8; padding:6px 12px; font-size:12px;">帶入我的牌組</button>
                        <span class="dt-sep"></span>
                        <input type="text" id="${p}-quick" list="tier-quick-datalist" placeholder="搜尋卡號或日文卡名，Enter 加入">
                        <select id="${p}-qty">${[1, 2, 3, 4].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n} 張</option>`).join('')}</select>
                        <button type="button" class="ctrl-btn" id="${p}-btn-quick" style="background:#6fb897; color:#0f1420; padding:6px 12px; font-size:12px;">＋加入</button>
                        <span class="dt-count" id="${p}-count"></span>
                    </div>`;
            }

            function bindDeckTools(p, textarea, getSeries) {
                if (!textarea) return;
                const $ = id => document.getElementById(`${p}-${id}`);
                const refreshCount = () => {
                    const n = parseDeckText(textarea.value).length;
                    const c = $('count');
                    if (c) c.textContent = `目前 ${n} 張${n === 50 ? ' ✔' : ''}`;
                };
                const setIds = ids => { textarea.value = deckToText(ids); refreshCount(); };

                textarea.addEventListener('input', refreshCount);
                refreshCount();

                $('btn-mydeck').onclick = () => {
                    const name = $('mydeck').value;
                    if (!name || !allDecks[name]) { showSysMsg('找不到這個牌組。'); return; }
                    try { saveAllDecks(); } catch (e) { /* 即使存檔失敗，仍可使用記憶體內的牌組 */ }
                    const ids = ((allDecks[name].main) || [])
                        .map(c => (typeof c === 'string') ? c : (c && c.id))
                        .filter(id => id && !String(id).startsWith('CUSTOM_'));
                    if (!ids.length) { showSysMsg(`「${name}」目前沒有可用的官方卡片。`); return; }
                    if (textarea.value.trim() && !confirm(`會用「${name}」覆蓋目前的牌表內容，確定嗎？`)) return;
                    setIds(ids);
                    showSysMsg(`已帶入「${name}」共 ${ids.length} 張。`);
                };

                // 搜尋建議：依輸入即時從整個卡庫篩選（本作品優先），最多 40 筆
                const quick = $('quick');
                const dl = document.getElementById('tier-quick-datalist');
                quick.addEventListener('input', () => {
                    const q = quick.value.trim().toLowerCase();
                    if (q.length < 2 || typeof masterCardCatalog === 'undefined') { dl.innerHTML = ''; return; }
                    const series = getSeries ? getSeries() : '';
                    const hits = [];
                    for (const c of masterCardCatalog) {
                        if (c.type === 'AP') continue;
                        if (c.id.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q)) {
                            hits.push(c);
                            if (hits.length > 400) break;
                        }
                    }
                    hits.sort((a, b) => (b.series === series) - (a.series === series));
                    dl.innerHTML = hits.slice(0, 40).map(c =>
                        `<option value="${esc(c.id)}">${esc((COLOR_ZH[c.color] || '') + ' ' + c.name + '（' + cardCost(c) + '費）')}</option>`).join('');
                });
                const addQuick = () => {
                    const id = quick.value.trim().toUpperCase();
                    if (!id) return;
                    if (typeof ensureCatalogMap === 'function') ensureCatalogMap();
                    if (!window.cardCatalogById.get(id)) { showSysMsg('卡庫找不到這個卡號，請從建議清單選擇。'); return; }
                    const n = Number($('qty').value) || 1;
                    const ids = parseDeckText(textarea.value);
                    for (let i = 0; i < n; i++) ids.push(id);
                    setIds(ids);
                    quick.value = '';
                    dl.innerHTML = '';
                    quick.focus();
                };
                $('btn-quick').onclick = addQuick;
                quick.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addQuick(); } });
            }

            function openTierDetail(deck) {
                const modal = document.getElementById('tier-detail-modal');
                const box = document.getElementById('tier-detail-content');
                const coverIds = getDeckCoverIds(deck);
                const coversHtml = (coverIds.length ? coverIds : ['']).map(id =>
                    `<img class="td-cover" src="${esc(getCoverUrl(id, deck.series, deck.color))}" alt="${esc(deck.name)}">`).join('');
                const tagsHtml = (deck.tags || []).map(t => `<span class="td-badge td-tag-link" data-tag="${esc(t)}" title="點擊篩選此標籤">#${esc(t)}</span>`).join('');
                const prosHtml = (deck.pros && deck.pros.length) ? deck.pros.map(p => `<li>${esc(p)}</li>`).join('') : '<li style="color:#7f85a3;">尚待補充</li>';
                const consHtml = (deck.cons && deck.cons.length) ? deck.cons.map(c => `<li>${esc(c)}</li>`).join('') : '<li style="color:#7f85a3;">尚待補充</li>';
                const sampleCount = (deck.sampleDeck || []).length;
                const tierLabel = TIER_DEFS.find(t => t.key === deck.tier)?.label || deck.tier;
                const admin = isAdmin();
                // 雲端同步會把清單換成新物件，因此每次修改都依 id 重新取得最新的牌組
                const cur = () => (window.NCHUCGC_TIER_LIST || []).find(d => d.id === deck.id) || deck;

                const adminControlsHtml = admin ? `
                    <div style="background:rgba(111,184,151,0.1); border:1px solid rgba(111,184,151,0.4); border-radius:8px; padding:12px 14px; display:flex; flex-wrap:wrap; gap:14px; align-items:center;">
                        <strong style="font-size:13px; color:#82cca9;">管理員即時調整</strong>
                        <label style="font-size:13px; display:flex; align-items:center; gap:6px;">
                            階級
                            <select id="td-edit-tier" class="tier-select">
                                ${TIER_DEFS.map(t => `<option value="${t.key}" ${deck.tier === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}
                            </select>
                        </label>
                        <label style="font-size:13px; display:flex; align-items:center; gap:6px;">
                            操作難度
                            <select id="td-edit-diff" class="tier-select">
                                <option value="" ${deck.difficulty == null ? 'selected' : ''}>待評</option>
                                ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${Number(deck.difficulty) === n ? 'selected' : ''}>${n} / 5</option>`).join('')}
                            </select>
                        </label>
                        <button class="ctrl-btn" id="td-btn-edit" style="background:#3b6ea8; padding:7px 14px;">編輯牌組資訊</button>
                        <button class="ctrl-btn danger" id="td-btn-del-deck" style="margin-left:auto;">刪除此牌組</button>
                    </div>
                    <div id="td-edit-panel" class="td-edit-grid" style="display:none;">
                        <label class="full">牌組名稱<input type="text" id="te-name" value="${esc(deck.name)}"></label>
                        <label>代表卡 1<input type="text" id="te-cover1" list="tier-card-datalist" value="${esc(coverIds[0] || '')}" placeholder="卡號"></label>
                        <label>代表卡 2（混軸用，選填）<input type="text" id="te-cover2" list="tier-card-datalist" value="${esc(coverIds[1] || '')}" placeholder="卡號"></label>
                        <label>代表卡 3（選填）<input type="text" id="te-cover3" list="tier-card-datalist" value="${esc(coverIds[2] || '')}" placeholder="卡號"></label>
                        <label class="full">牌組簡介<textarea id="te-summary" rows="3">${esc(deck.summary || '')}</textarea></label>
                        <label class="full">標籤（逗號或空白分隔）<input type="text" id="te-tags" value="${esc((deck.tags || []).join(', '))}"></label>
                        <label>優勢（一行一條）<textarea id="te-pros" rows="4">${esc((deck.pros || []).join('\n'))}</textarea></label>
                        <label>弱點與對局注意（一行一條）<textarea id="te-cons" rows="4">${esc((deck.cons || []).join('\n'))}</textarea></label>
                        <div class="full" id="te-deck-tools"></div>
                        <label class="full">牌表（一行一種：「卡號 x張數」，也可貼上逗號分隔的卡號；滿 50 張即為完整牌表）<textarea id="te-deck" rows="7" style="font-family:monospace;">${esc(deckToText(deck.sampleDeck))}</textarea></label>
                        <div class="full" style="display:flex; justify-content:flex-end; gap:10px;">
                            <button class="ctrl-btn" id="te-cancel" style="background:#313456; padding:7px 14px;">取消</button>
                            <button class="start-btn" id="te-save" style="padding:7px 18px;">儲存並同步</button>
                        </div>
                    </div>
                ` : '';

                box.innerHTML = `
                    <div class="td-header">
                        <div class="td-covers">${coversHtml}</div>
                        <div style="flex:1;">
                            <div style="font-size:12px; color:#9aa0b8; margin-bottom:4px;">${esc(deck.series)} / ${COLOR_ZH[deck.color] || deck.color} / ${tierLabel}</div>
                            <h2 style="margin:0 0 8px 0; font-size:22px; color:#fff;">${esc(deck.name)}</h2>
                            <div class="td-meta-row">
                                <span class="td-badge">操作難度：${formatDiff(deck.difficulty)}</span>
                                ${tagsHtml}
                            </div>
                            <p style="margin:8px 0 0 0; font-size:14px; color:#d5d9ea; line-height:1.6; white-space:pre-wrap;">${deck.summary ? esc(deck.summary) : '尚無簡介。'}</p>
                        </div>
                    </div>
                    ${adminControlsHtml}
                    <div class="td-cols">
                        <div class="td-list-box">
                            <h4>優勢</h4>
                            <ul>${prosHtml}</ul>
                        </div>
                        <div class="td-list-box">
                            <h4>弱點與對局注意</h4>
                            <ul>${consHtml}</ul>
                        </div>
                    </div>
                    ${deckSectionHtml(deck)}
                    <div class="td-actions">
                        <button class="ctrl-btn" id="td-btn-close" style="background:#313456; padding:9px 16px;">關閉</button>
                        ${sampleCount > 0 ? `<button class="start-btn" id="td-btn-import" style="padding:9px 18px;">匯入核心組件至牌組（${sampleCount} 張）</button>` : ''}
                    </div>
                `;

                box.querySelector('#td-btn-close').onclick = () => { modal.style.display = 'none'; };
                box.querySelectorAll('.td-tag-link').forEach(el => {
                    el.onclick = () => {
                        modal.style.display = 'none';
                        tierTagFilter.add(el.dataset.tag);
                        tagPanelOpen = true;
                        renderTierBoard();
                        tierScene().scrollTo({ top: 0, behavior: 'smooth' });
                    };
                });

                const editTier = box.querySelector('#td-edit-tier');
                if (editTier) {
                    editTier.onchange = () => {
                        cur().tier = editTier.value;
                        renderTierBoard();
                        syncTierListNow();
                    };
                }
                const editDiff = box.querySelector('#td-edit-diff');
                if (editDiff) {
                    editDiff.onchange = () => {
                        cur().difficulty = editDiff.value === '' ? null : Number(editDiff.value);
                        renderTierBoard();
                        syncTierListNow();
                    };
                }
                const editBtn = box.querySelector('#td-btn-edit');
                if (editBtn) {
                    const panel = box.querySelector('#td-edit-panel');
                    editBtn.onclick = () => {
                        fillCardDatalist(deck.series);
                        const holder = box.querySelector('#te-deck-tools');
                        if (!holder.innerHTML) {
                            holder.innerHTML = deckToolsHtml('te');
                            bindDeckTools('te', box.querySelector('#te-deck'), () => deck.series);
                        }
                        panel.style.display = panel.style.display === 'none' ? 'grid' : 'none';
                    };
                    box.querySelector('#te-cancel').onclick = () => { panel.style.display = 'none'; };
                    box.querySelector('#te-save').onclick = () => {
                        const target = cur();
                        const name = box.querySelector('#te-name').value.trim();
                        if (!name) { showSysMsg('牌組名稱不可為空。'); return; }
                        const ids = parseCoverInputs(box.querySelector('#te-cover1').value, box.querySelector('#te-cover2').value, box.querySelector('#te-cover3').value);
                        target.name = name;
                        target.coverCardIds = ids;
                        target.coverCardId = ids[0] || '';
                        target.summary = box.querySelector('#te-summary').value.trim();
                        target.tags = parseTags(box.querySelector('#te-tags').value);
                        target.pros = parseLines(box.querySelector('#te-pros').value);
                        target.cons = parseLines(box.querySelector('#te-cons').value);
                        target.sampleDeck = parseDeckText(box.querySelector('#te-deck').value);
                        renderTierBoard();
                        syncTierListNow();
                        openTierDetail(target);
                    };
                }
                const delBtn = box.querySelector('#td-btn-del-deck');
                if (delBtn) {
                    delBtn.onclick = () => {
                        if (!confirm(`確定要從排表刪除「${deck.name}」嗎？`)) return;
                        window.NCHUCGC_TIER_LIST = (window.NCHUCGC_TIER_LIST || []).filter(d => d.id !== deck.id);
                        modal.style.display = 'none';
                        renderTierBoard();
                        syncTierListNow();
                    };
                }
                const importBtn = box.querySelector('#td-btn-import');
                if (importBtn) {
                    importBtn.onclick = () => {
                        const deckName = `[排表] ${deck.name}`;
                        allDecks[deckName] = { main: [...deck.sampleDeck], ap: [] };
                        currentDeckName = deckName;
                        myDeckData = hydrateDeckList(allDecks[deckName].main);
                        myApData = [];
                        saveAllDecks();
                        updateDeckSelector();
                        renderDeck();
                        modal.style.display = 'none';
                        switchMainView('builder');
                        showSysMsg(`已建立牌組「${deckName}」（共 ${myDeckData.length} 張）。`);
                    };
                }
                modal.style.display = 'flex';
            }

            // ===== 捲動輔助：快速跳轉、回到頂端、拖曳時自動捲動 =====
            function tierScene() { return document.getElementById('tier-scene'); }

            function jumpToTier(key) {
                const scene = tierScene();
                const row = document.querySelector(`#tier-board .tier-row[data-tier="${key}"]`);
                if (!scene || !row) return;
                const scale = window.appScale || 1;
                const sr = scene.getBoundingClientRect();
                const rr = row.getBoundingClientRect();
                const stickyH = document.getElementById('tier-sticky').getBoundingClientRect().height / scale;
                scene.scrollTo({ top: scene.scrollTop + (rr.top - sr.top) / scale - stickyH - 4, behavior: 'smooth' });
            }

            function updateBackTop() {
                const btn = document.getElementById('tier-back-top');
                const scene = tierScene();
                if (!btn || !scene) return;
                const visible = scene.style.display !== 'none' && getComputedStyle(scene).display !== 'none' && scene.scrollTop > 240;
                btn.style.display = visible ? 'block' : 'none';
            }

            let dragY = null;
            let dragRaf = null;
            function dragScrollLoop() {
                const scene = tierScene();
                if (!scene || draggedDeckId == null || dragY == null) { dragRaf = null; return; }
                const scale = window.appScale || 1;
                const sceneRect = scene.getBoundingClientRect();
                const topEdge = document.getElementById('tier-sticky').getBoundingClientRect().bottom;
                const zone = 110 * scale;
                let dy = 0;
                if (dragY < topEdge + zone) {
                    const depth = 1 - Math.min(Math.max(dragY - topEdge, 0), zone) / zone;
                    dy = -(3 + depth * 26);
                } else if (dragY > sceneRect.bottom - zone) {
                    const depth = 1 - Math.min(Math.max(sceneRect.bottom - dragY, 0), zone) / zone;
                    dy = 3 + depth * 26;
                }
                if (dy) scene.scrollTop += dy;
                dragRaf = requestAnimationFrame(dragScrollLoop);
            }
            function startDragScroll() { if (!dragRaf) dragRaf = requestAnimationFrame(dragScrollLoop); }
            function stopDragScroll() { draggedDeckId = null; dragY = null; }

            window.renderTierBoard = function () {
                const board = document.getElementById('tier-board');
                if (!board) return;
                const scene = tierScene();
                const prevScroll = scene ? scene.scrollTop : 0;   // 重繪前記住位置，避免畫面跳回最上方
                const list = window.NCHUCGC_TIER_LIST || [];
                const q = (document.getElementById('tier-search-input')?.value || '').trim().toLowerCase();
                const diffFilter = document.getElementById('tier-diff-filter')?.value || 'ALL';
                const admin = isAdmin();

                const adminBar = document.getElementById('tier-admin-bar');
                if (adminBar) adminBar.style.display = admin ? 'flex' : 'none';
                const addBtn = document.getElementById('btn-tier-add-deck');
                if (addBtn) addBtn.style.display = admin ? 'inline-block' : 'none';

                const jumpItems = [];
                board.innerHTML = '';
                TIER_DEFS.forEach(t => {
                    const matched = list.filter(d => {
                        if (d.tier !== t.key) return false;
                        if (tierColorFilter !== 'ALL' && d.color !== tierColorFilter) return false;
                        if (tierSeriesFilter !== 'ALL' && d.series !== tierSeriesFilter) return false;
                        if (tierTagFilter.size && !Array.from(tierTagFilter).every(tg => (d.tags || []).includes(tg))) return false;
                        if (diffFilter === 'UNRATED' && d.difficulty !== null && d.difficulty !== undefined) return false;
                        if (diffFilter !== 'ALL' && diffFilter !== 'UNRATED' && String(d.difficulty) !== diffFilter) return false;
                        if (q) {
                            const hay = `${d.name} ${d.series} ${(d.tags || []).join(' ')}`.toLowerCase();
                            if (!hay.includes(q)) return false;
                        }
                        return true;
                    });

                    // 一般玩家若「待評定」為空則不顯示該列，保持畫面簡潔
                    if (!admin && t.key === 'UNRATED' && matched.length === 0) return;
                    jumpItems.push({ key: t.key, label: t.label, count: matched.length });

                    const row = document.createElement('div');
                    row.className = 'tier-row';
                    row.dataset.tier = t.key;
                    row.innerHTML = `<div class="tier-label ${t.key}">${t.label}</div><div class="tier-cards"></div>`;
                    const cardsBox = row.querySelector('.tier-cards');

                    const clearDropIndicators = () => {
                        board.querySelectorAll('.drop-before, .drop-after, .drag-over').forEach(el => {
                            el.classList.remove('drop-before', 'drop-after', 'drag-over');
                        });
                    };

                    const moveDeckInTierList = (sourceId, targetTier, targetDeckId, insertAfter) => {
                        const arr = window.NCHUCGC_TIER_LIST || [];
                        const fromIdx = arr.findIndex(d => d.id === sourceId);
                        if (fromIdx === -1) return false;
                        if (targetDeckId && targetDeckId === sourceId) return false;

                        const prevSig = arr.map(d => `${d.id}:${d.tier}`).join('|');
                        const [moved] = arr.splice(fromIdx, 1);
                        moved.tier = targetTier;

                        if (targetDeckId) {
                            const toIdx = arr.findIndex(d => d.id === targetDeckId);
                            if (toIdx !== -1) {
                                arr.splice(insertAfter ? toIdx + 1 : toIdx, 0, moved);
                            } else {
                                arr.push(moved);
                            }
                        } else {
                            arr.push(moved);
                        }

                        const nextSig = arr.map(d => `${d.id}:${d.tier}`).join('|');
                        return nextSig !== prevSig;
                    };

                    if (admin) {
                        row.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            row.classList.add('drag-over');
                        });
                        row.addEventListener('dragleave', (e) => {
                            if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over');
                        });
                        row.addEventListener('drop', (e) => {
                            e.preventDefault();
                            clearDropIndicators();
                            const id = draggedDeckId || e.dataTransfer.getData('text/plain');
                            stopDragScroll();
                            if (!id) return;
                            if (moveDeckInTierList(id, t.key, null, true)) {
                                renderTierBoard();
                                syncTierListNow();
                            }
                        });
                    }

                    if (matched.length === 0) {
                        cardsBox.innerHTML = `<div style="color:#6c7290; font-size:13px; padding:12px;">${admin ? '可將牌組拖曳至此階級' : '尚無牌組'}</div>`;
                    } else {
                        matched.forEach(deck => {
                            const card = document.createElement('div');
                            card.className = `tier-deck-card ${deck.color}` + (admin ? ' is-draggable' : '');
                            card.dataset.deckId = deck.id;
                            if (admin) {
                                card.draggable = true;
                                card.addEventListener('dragstart', (e) => {
                                    draggedDeckId = deck.id;
                                    card.classList.add('is-dragging');
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', deck.id);
                                    startDragScroll();
                                });
                                card.addEventListener('dragend', () => {
                                    card.classList.remove('is-dragging');
                                    clearDropIndicators();
                                    stopDragScroll();
                                });
                                card.addEventListener('dragover', (e) => {
                                    e.preventDefault();
                                    if (!draggedDeckId || draggedDeckId === deck.id) return;
                                    const rect = card.getBoundingClientRect();
                                    const isAfter = e.clientX > rect.left + rect.width / 2;
                                    board.querySelectorAll('.drop-before, .drop-after').forEach(el => {
                                        if (el !== card) el.classList.remove('drop-before', 'drop-after');
                                    });
                                    card.classList.toggle('drop-before', !isAfter);
                                    card.classList.toggle('drop-after', isAfter);
                                });
                                card.addEventListener('dragleave', (e) => {
                                    if (!card.contains(e.relatedTarget)) {
                                        card.classList.remove('drop-before', 'drop-after');
                                    }
                                });
                                card.addEventListener('drop', (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const rect = card.getBoundingClientRect();
                                    const isAfter = e.clientX > rect.left + rect.width / 2;
                                    clearDropIndicators();
                                    const id = draggedDeckId || e.dataTransfer.getData('text/plain');
                                    stopDragScroll();
                                    if (!id) return;
                                    if (moveDeckInTierList(id, t.key, deck.id, isAfter)) {
                                        renderTierBoard();
                                        syncTierListNow();
                                    }
                                });
                            }
                            card.innerHTML = `
                                ${coverThumbHtml(deck)}
                                <div class="tier-deck-info">
                                    <div class="tier-deck-name">${esc(deck.name)}</div>
                                    <div class="tier-deck-sub"><span>${COLOR_ZH[deck.color] || deck.color}</span><span>難度 ${formatDiff(deck.difficulty)}</span></div>
                                    ${(deck.tags && deck.tags.length) ? `<div class="tier-deck-tags">${deck.tags.slice(0, 3).map(tg => `<span class="tier-deck-tag ${tierTagFilter.has(tg) ? 'active' : ''}" data-tag="${esc(tg)}">${esc(tg)}</span>`).join('')}</div>` : ''}
                                </div>
                            `;
                            card.querySelectorAll('.tier-deck-tag').forEach(el => {
                                el.onclick = (ev) => {
                                    ev.stopPropagation();
                                    toggleTagFilter(el.dataset.tag);
                                };
                            });
                            card.onclick = () => openTierDetail(deck);
                            cardsBox.appendChild(card);
                        });
                    }
                    board.appendChild(row);
                });

                const jump = document.getElementById('tier-jump');
                if (jump) {
                    jump.innerHTML = '<span class="tier-jump-label">快速跳轉</span>' + jumpItems.map(j =>
                        `<button class="tier-jump-chip" data-jump="${j.key}">${j.label}<small>${j.count}</small></button>`).join('');
                    jump.querySelectorAll('.tier-jump-chip').forEach(b => b.onclick = () => jumpToTier(b.dataset.jump));
                }
                renderFilterControls(list, jumpItems, admin);
                if (scene) scene.scrollTop = prevScroll;
                updateBackTop();
            };

            function toggleTagFilter(tag) {
                if (tierTagFilter.has(tag)) tierTagFilter.delete(tag); else tierTagFilter.add(tag);
                renderTierBoard();
            }

            function clearAllTierFilters() {
                const si = document.getElementById('tier-search-input'); if (si) si.value = '';
                const df = document.getElementById('tier-diff-filter'); if (df) df.value = 'ALL';
                tierColorFilter = 'ALL';
                document.querySelectorAll('#tier-color-pills .tier-pill').forEach(b => b.classList.toggle('active', b.dataset.color === 'ALL'));
                tierSeriesFilter = 'ALL';
                tierTagFilter.clear();
                renderTierBoard();
            }

            function renderFilterControls(list, jumpItems, admin) {
                // 作品系列下拉（內容有變才重建，避免雲端同步時把已展開的選單關掉）
                const seriesSel = document.getElementById('tier-series-filter');
                if (seriesSel) {
                    const counts = {};
                    list.forEach(d => { if (d.series) counts[d.series] = (counts[d.series] || 0) + 1; });
                    if (tierSeriesFilter !== 'ALL' && !counts[tierSeriesFilter]) tierSeriesFilter = 'ALL';
                    const names = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
                    const sig = names.map(n => n + ':' + counts[n]).join('|');
                    if (sig !== seriesOptionsSig) {
                        seriesOptionsSig = sig;
                        seriesSel.innerHTML = `<option value="ALL">全部作品（${list.length}）</option>` +
                            names.map(n => `<option value="${esc(n)}">${esc(n)}（${counts[n]}）</option>`).join('');
                    }
                    seriesSel.value = tierSeriesFilter;
                }

                // 標籤面板
                const tagCounts = {};
                list.forEach(d => (d.tags || []).forEach(tg => { tagCounts[tg] = (tagCounts[tg] || 0) + 1; }));
                Array.from(tierTagFilter).forEach(tg => { if (!tagCounts[tg]) tierTagFilter.delete(tg); });
                const tagNames = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a] || a.localeCompare(b, 'zh-Hant'));
                const panel = document.getElementById('tier-tag-panel');
                const toggle = document.getElementById('tier-tag-toggle');
                if (panel) {
                    panel.style.display = (tagPanelOpen && tagNames.length) ? 'flex' : 'none';
                    panel.innerHTML = tagNames.map(tg =>
                        `<button class="tier-tag-chip ${tierTagFilter.has(tg) ? 'active' : ''}" data-tag="${esc(tg)}">#${esc(tg)}<small>${tagCounts[tg]}</small></button>`).join('');
                    panel.querySelectorAll('.tier-tag-chip').forEach(b => b.onclick = () => toggleTagFilter(b.dataset.tag));
                }
                if (toggle) {
                    toggle.textContent = `標籤 ${tagPanelOpen ? '▴' : '▾'}${tierTagFilter.size ? ` (${tierTagFilter.size})` : ''}`;
                    toggle.classList.toggle('has-filter', tierTagFilter.size > 0);
                }

                // 清除篩選按鈕與無結果提示
                const q = (document.getElementById('tier-search-input')?.value || '').trim();
                const diff = document.getElementById('tier-diff-filter')?.value || 'ALL';
                const anyFilter = !!q || tierColorFilter !== 'ALL' || diff !== 'ALL' || tierSeriesFilter !== 'ALL' || tierTagFilter.size > 0;
                const clearBtn = document.getElementById('tier-clear-filters');
                if (clearBtn) clearBtn.style.display = anyFilter ? 'inline-block' : 'none';
                const total = jumpItems.reduce((n, j) => n + j.count, 0);
                const board = document.getElementById('tier-board');
                if (board && anyFilter && total === 0) {
                    const note = document.createElement('div');
                    note.className = 'tier-empty-note';
                    note.textContent = '沒有符合目前篩選條件的牌組，可按上方「清除篩選」重設。';
                    board.prepend(note);
                }
            }


            function populateAddDeckSeriesSelect() {
                const sel = document.getElementById('add-deck-series');
                if (!sel || typeof masterCardCatalog === 'undefined') return;
                const set = new Set();
                masterCardCatalog.forEach(c => {
                    if (c.series && !c.series.includes('AP') && !c.series.includes('紀念卡')) set.add(c.series);
                });
                sel.innerHTML = Array.from(set).sort().map(s => `<option value="${s}">${s}</option>`).join('');
            }

            window.addEventListener('load', () => {
                renderHome();
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('join')) switchMainView('rooms');

                document.getElementById('tier-search-input')?.addEventListener('input', renderTierBoard);
                document.getElementById('tier-diff-filter')?.addEventListener('change', renderTierBoard);
                document.querySelectorAll('#tier-color-pills .tier-pill').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('#tier-color-pills .tier-pill').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        tierColorFilter = btn.dataset.color;
                        renderTierBoard();
                    });
                });

                // 篩選：作品、標籤、清除
                document.getElementById('tier-series-filter')?.addEventListener('change', (e) => {
                    tierSeriesFilter = e.target.value;
                    renderTierBoard();
                });
                document.getElementById('tier-tag-toggle')?.addEventListener('click', () => {
                    tagPanelOpen = !tagPanelOpen;
                    renderTierBoard();
                });
                document.getElementById('tier-clear-filters')?.addEventListener('click', clearAllTierFilters);

                // 捲動／拖曳輔助
                const sceneEl = tierScene();
                sceneEl?.addEventListener('scroll', updateBackTop, { passive: true });
                document.getElementById('tier-back-top')?.addEventListener('click', () => {
                    tierScene().scrollTo({ top: 0, behavior: 'smooth' });
                });
                document.addEventListener('dragover', (e) => { if (draggedDeckId != null) dragY = e.clientY; });
                document.addEventListener('dragend', stopDragScroll);
                document.addEventListener('drop', () => setTimeout(stopDragScroll, 0));

                // 新增牌組視窗
                bindCoverPreview(document.getElementById('add-deck-cover1'), document.getElementById('add-deck-prev1'));
                bindCoverPreview(document.getElementById('add-deck-cover2'), document.getElementById('add-deck-prev2'));
                bindCoverPreview(document.getElementById('add-deck-cover3'), document.getElementById('add-deck-prev3'));
                document.getElementById('add-deck-series')?.addEventListener('change', (e) => fillCardDatalist(e.target.value));

                document.getElementById('btn-tier-add-deck')?.addEventListener('click', () => {
                    if (!isAdmin()) return;
                    populateAddDeckSeriesSelect();
                    fillCardDatalist(document.getElementById('add-deck-series').value);
                    ['add-deck-name', 'add-deck-cover1', 'add-deck-cover2', 'add-deck-cover3', 'add-deck-summary', 'add-deck-tags', 'add-deck-deck'].forEach(id => {
                        document.getElementById(id).value = '';
                    });
                    ['add-deck-prev1', 'add-deck-prev2', 'add-deck-prev3'].forEach(id => { document.getElementById(id).style.display = 'none'; });
                    document.getElementById('add-deck-tools').innerHTML = deckToolsHtml('ad');
                    bindDeckTools('ad', document.getElementById('add-deck-deck'), () => document.getElementById('add-deck-series').value);
                    document.getElementById('tier-add-modal').style.display = 'flex';
                });

                document.getElementById('btn-add-deck-cancel')?.addEventListener('click', () => {
                    document.getElementById('tier-add-modal').style.display = 'none';
                });

                document.getElementById('btn-add-deck-confirm')?.addEventListener('click', () => {
                    if (!isAdmin()) return;
                    const series = document.getElementById('add-deck-series').value;
                    const color = document.getElementById('add-deck-color').value;
                    const name = document.getElementById('add-deck-name').value.trim();
                    const tier = document.getElementById('add-deck-tier').value;
                    const diffRaw = document.getElementById('add-deck-diff').value;
                    const coverIds = parseCoverInputs(document.getElementById('add-deck-cover1').value, document.getElementById('add-deck-cover2').value, document.getElementById('add-deck-cover3').value);
                    const summary = document.getElementById('add-deck-summary').value.trim();
                    const tags = parseTags(document.getElementById('add-deck-tags').value);
                    const deckIds = parseDeckText(document.getElementById('add-deck-deck').value);
                    if (!name) { showSysMsg('請輸入牌組名稱。'); return; }
                    const newDeck = {
                        id: 'deck-' + Date.now(),
                        tier,
                        series,
                        color,
                        name,
                        coverCardId: coverIds[0] || '',
                        coverCardIds: coverIds,
                        difficulty: diffRaw === '' ? null : Number(diffRaw),
                        tags,
                        summary,
                        pros: [],
                        cons: [],
                        sampleDeck: deckIds.length ? deckIds : [...coverIds]
                    };
                    window.NCHUCGC_TIER_LIST = window.NCHUCGC_TIER_LIST || [];
                    window.NCHUCGC_TIER_LIST.push(newDeck);
                    document.getElementById('tier-add-modal').style.display = 'none';
                    renderTierBoard();
                    syncTierListNow();
                    // 新增後自動捲到該牌組所在的階級，免得找不到
                    setTimeout(() => jumpToTier(tier), 60);
                });

                document.getElementById('tier-detail-modal')?.addEventListener('click', (e) => {
                    if (e.target.id === 'tier-detail-modal') e.target.style.display = 'none';
                });
                document.getElementById('tier-add-modal')?.addEventListener('click', (e) => {
                    if (e.target.id === 'tier-add-modal') e.target.style.display = 'none';
                });

                document.getElementById('btn-home-edit-ann')?.addEventListener('click', () => {
                    if (!isAdmin()) return;
                    renderAnnEditorList();
                    document.getElementById('home-ann-modal').style.display = 'flex';
                });
                document.getElementById('btn-ann-close')?.addEventListener('click', () => {
                    document.getElementById('home-ann-modal').style.display = 'none';
                });
                document.getElementById('home-ann-modal')?.addEventListener('click', (e) => {
                    if (e.target.id === 'home-ann-modal') e.target.style.display = 'none';
                });
                document.getElementById('btn-ann-add')?.addEventListener('click', () => {
                    if (!isAdmin()) return;
                    const titleEl = document.getElementById('ann-input-title');
                    const bodyEl = document.getElementById('ann-input-body');
                    const title = (titleEl?.value || '').trim();
                    const body = (bodyEl?.value || '').trim();
                    if (!title || !body) { showSysMsg('請填寫公告標題與內容。'); return; }
                    const today = new Date().toISOString().slice(0, 10);
                    window.NCHUCGC_TIER_META = window.NCHUCGC_TIER_META || {};
                    const next = [{ date: today, title, body }, ...(window.NCHUCGC_TIER_META.announcements || [])];
                    window.NCHUCGC_TIER_META.announcements = next;
                    if (titleEl) titleEl.value = '';
                    if (bodyEl) bodyEl.value = '';
                    renderHome();
                    renderAnnEditorList();
                    if (window.nchucgcLobby && typeof window.nchucgcLobby.publishAnnouncements === 'function') {
                        window.nchucgcLobby.publishAnnouncements(next);
                    }
                });
            });
        })();
