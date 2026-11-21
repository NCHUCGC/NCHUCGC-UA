/**
 * NCHUCGC 牌組構築、代牌列印、對戰桌操作、PeerJS 連線與 DLC 載入模組 (app-battle.js)
 */
window.appScale = 1;
        // --- 網頁原生音效引擎 ---
        let audioCtx = null;
        // 監聽第一次點擊來解鎖瀏覽器音效限制
        document.addEventListener('click', () => { 
            if(!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } 
        }, {once:true});

        window.playSound = function(type) {
            if(!audioCtx) return;
            if(audioCtx.state === 'suspended') audioCtx.resume();
            let osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            let now = audioCtx.currentTime;
            
            if(type === 'draw') { 
                osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(1200, now+0.1); 
                gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.1); 
                osc.start(); osc.stop(now+0.1); 
            } else if(type === 'turn') { 
                osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); 
                gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.5); 
                osc.start(); osc.stop(now+0.5); 
            } else if(type === 'play') {
                osc.type = 'triangle'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(40, now+0.1); 
                gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now+0.1); 
                osc.start(); osc.stop(now+0.1); 
            }
        };


        function resizeApp() {
            const canvas = document.getElementById('app-canvas');
            const targetW = 1600;
            const targetH = 900;
            const windowW = window.innerWidth;
            const windowH = window.innerHeight;
            
            if(windowW === 0 || windowH === 0) return; 
            
            window.appScale = Math.min(windowW / targetW, windowH / targetH);
            canvas.style.transform = `scale(${window.appScale})`;
        }
        window.addEventListener('resize', resizeApp);
        setTimeout(resizeApp, 100);
        setTimeout(resizeApp, 500);
        resizeApp();

        function requestFullScreen() {
            let elem = document.documentElement;
            if (elem.requestFullscreen) { elem.requestFullscreen(); }
            else if (elem.webkitRequestFullscreen) { elem.webkitRequestFullscreen(); } 
            else if (elem.msRequestFullscreen) { elem.msRequestFullscreen(); } 
            setTimeout(resizeApp, 300); 
        }

        const preloadedImages = new Set();
        function preloadCardsInBg(cardsArray) {
            cardsArray.forEach(c => {
                if(!preloadedImages.has(c.imageUrl)) {
                    let img = new Image();
                    img.src = c.imageUrl;
                    preloadedImages.add(c.imageUrl);
                }
            });
        }
// 1. 補回被覆蓋掉的 invalidCardsSet 與 markCardInvalid
        localStorage.removeItem('ua_invalid_cards');
        const invalidCardsSet = new Set();
        window.markCardInvalid = function(cardId) {
            invalidCardsSet.add(cardId);
        };

        // 2. 將原本的 ensureCatalogMap() 改為支援動態擴充自訂卡片：
        window.cardCatalogById = window.UAUtils ? window.UAUtils.catalogById : new Map();
        function ensureCatalogMap() {
            if (window.UAUtils) {
                window.UAUtils.ensureCatalogIndex();
                window.cardCatalogById = window.UAUtils.catalogById;
            } else if (typeof masterCardCatalog !== 'undefined' && window.cardCatalogById.size !== masterCardCatalog.length) {
                masterCardCatalog.forEach(c => window.cardCatalogById.set(c.id, c));
            }
        }
// (已整合至上方動態擴充版 ensureCatalogMap)

        // 將儲存的卡號或舊版物件還原為完整卡片參照
        function hydrateDeckList(list) {
            if (!Array.isArray(list)) return [];
            ensureCatalogMap();
            return list.map(item => {
                let id = (typeof item === 'string') ? item : item?.id;
                let found = window.cardCatalogById.get(id);
                if (found) return found;
                // 若為自訂上傳圖片卡片 (CUSTOM_ 開頭)，保留其自訂結構
                return (typeof item === 'object' && item !== null) ? item : null;
            }).filter(Boolean);
        }

        // 存檔時：官方卡片只存卡號字串，自訂圖片卡才存物件，省下 95% localStorage 空間！
        function dehydrateDeckList(list) {
            return (list || []).map(c => {
                if (typeof c === 'string') return c;
                if (c.id && c.id.startsWith('CUSTOM_')) {
                    return { id: c.id, name: c.name, series: c.series, imageUrl: c.imageUrl };
                }
                return c.id;
            });
        }

        let allDecks = JSON.parse(localStorage.getItem('ua_all_decks')) || { "預設牌組": { main: [], ap: [] } };
        // 讓 firebase-lobby.js 的雲端同步讀得到牌組（top-level let 不會自動成為 window 屬性）
        Object.defineProperty(window, 'allDecks', { get: () => allDecks, set: v => { allDecks = v; }, configurable: true });
        let currentDeckName = localStorage.getItem('ua_current_deck_name') || "預設牌組";
        if (!allDecks[currentDeckName]) currentDeckName = Object.keys(allDecks)[0]; 
        if (Array.isArray(allDecks[currentDeckName])) allDecks[currentDeckName] = { main: allDecks[currentDeckName], ap: [] };
        
        let myDeckData = hydrateDeckList(allDecks[currentDeckName].main);
        let myApData = hydrateDeckList(allDecks[currentDeckName].ap || []);

        function saveAllDecks() {
            allDecks[currentDeckName] = {
                main: dehydrateDeckList(myDeckData),
                ap: dehydrateDeckList(myApData)
            };
            try {
                localStorage.setItem('ua_all_decks', JSON.stringify(allDecks));
                localStorage.setItem('ua_current_deck_name', currentDeckName);
                return true;
            } catch (err) {
                console.error('saveAllDecks failed', err);
                if (!window._deckSaveWarned) {
                    window._deckSaveWarned = true;
                    alert('⚠️ 無法寫入瀏覽器儲存空間（可能已滿，常見原因是匯入了大量自訂圖片卡）。\n本次的牌組變更只會暫存到關閉頁面為止，請先匯出或清理不需要的自訂卡片。');
                }
                return false;
            }
        }

        const deckSelector = document.getElementById('deck-selector');
        const lobbyDeckSelector = document.getElementById('lobby-deck-selector');

        function updateLobbyDeckStatus() {
            const st = document.getElementById('lobby-deck-status');
            if (!st) return;
            const mainOk = myDeckData.length === 50;
            const apOk = myApData.length === 3;
            st.className = 'lobby-deck-status ' + (mainOk && apOk ? 'ok' : 'warn');
            st.innerHTML = `<span>主牌 ${myDeckData.length} / 50 ｜ AP ${myApData.length} / 3</span><span>${mainOk && apOk ? '可出戰' : '尚未完成'}</span>`;
            if (typeof window.renderHomeDashboard === 'function') window.renderHomeDashboard();
        }

        function updateDeckSelector() {
            [deckSelector, lobbyDeckSelector].forEach(sel => {
                if (!sel) return;
                sel.innerHTML = '';
                for (let name in allDecks) {
                    let opt = document.createElement('option'); opt.value = name; opt.innerText = name;
                    if (name === currentDeckName) opt.selected = true;
                    sel.appendChild(opt);
                }
            });
            updateLobbyDeckStatus();
        }

        function switchCurrentDeck(newName) {
            if (!allDecks[newName]) return;
            saveAllDecks();
            currentDeckName = newName;
            if (Array.isArray(allDecks[currentDeckName])) allDecks[currentDeckName] = { main: allDecks[currentDeckName], ap: [] };
            myDeckData = hydrateDeckList(allDecks[currentDeckName].main);
            myApData = hydrateDeckList(allDecks[currentDeckName].ap);
            updateDeckSelector();
            renderDeck();
        }

        deckSelector.addEventListener('change', (e) => switchCurrentDeck(e.target.value));
        lobbyDeckSelector?.addEventListener('change', (e) => switchCurrentDeck(e.target.value));

        document.getElementById('btn-delete-deck')?.addEventListener('click', () => {
            const names = Object.keys(allDecks);
            if (names.length <= 1) {
                alert('至少需保留一副牌組，若要重組請改用「清空」。');
                return;
            }
            if (!confirm(`確定要永久刪除牌組「${currentDeckName}」嗎？此操作無法復原。`)) return;
            const deletedName = currentDeckName;
            delete allDecks[deletedName];
            currentDeckName = Object.keys(allDecks)[0];
            if (Array.isArray(allDecks[currentDeckName])) allDecks[currentDeckName] = { main: allDecks[currentDeckName], ap: [] };
            myDeckData = hydrateDeckList(allDecks[currentDeckName].main);
            myApData = hydrateDeckList(allDecks[currentDeckName].ap);
            updateDeckSelector();
            renderDeck();
            saveAllDecks();
            showSysMsg(`已刪除牌組「${deletedName}」。`);
        });

        function deckNameTaken(name) { return Object.prototype.hasOwnProperty.call(allDecks, name); }

        document.getElementById('btn-rename-deck').addEventListener('click', () => {
            const raw = prompt("請輸入新的牌組名稱：", currentDeckName);
            if (raw === null) return;
            const newName = raw.trim();
            if (!newName) { alert("❌ 牌組名稱不能是空白。"); return; }
            if (newName === currentDeckName) return;
            if (newName === '__proto__' || deckNameTaken(newName)) {
                alert(`❌ 已經有名為「${newName}」的牌組了，請換一個名稱。`);
                return;
            }
            saveAllDecks();
            allDecks[newName] = allDecks[currentDeckName];
            delete allDecks[currentDeckName];
            currentDeckName = newName;
            saveAllDecks();
            updateDeckSelector();
        });

        document.getElementById('btn-new-deck').addEventListener('click', () => {
            const raw = prompt("請輸入新牌組的名稱：");
            if (raw === null) return;
            const newName = raw.trim();
            if (!newName) { alert("❌ 牌組名稱不能是空白。"); return; }
            if (newName === '__proto__' || deckNameTaken(newName)) {
                alert(`❌ 已經有名為「${newName}」的牌組了，請換一個名稱。`);
                return;
            }
            saveAllDecks();
            allDecks[newName] = { main: [], ap: [] };
            currentDeckName = newName;
            myDeckData = [];
            myApData = [];
            updateDeckSelector(); renderDeck(); saveAllDecks();
            if (typeof showSysMsg === 'function') showSysMsg(`已建立新牌組「${newName}」。`);
        });

        window.updateBuilderBadges = function() {
            let allCounts = {};
            myDeckData.forEach(c => allCounts[c.id] = (allCounts[c.id]||0)+1);
            myApData.forEach(c => allCounts[c.id] = (allCounts[c.id]||0)+1);
            
            document.querySelectorAll('#catalog-grid .preview-card').forEach(el => {
                let cardId = el.dataset.cardId;
                let count = allCounts[cardId] || 0;
                let badge = el.querySelector('.in-deck-badge');
                if (count > 0) {
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.className = 'card-badge in-deck-badge';
                        el.appendChild(badge);
                    }
                    badge.innerText = count;
                } else if (badge) {
                    badge.remove();
                }
            });
        };

        window.executeBatchImport = function() {
            let series = document.getElementById('import-series-name').value.trim() || "自訂匯入";
            let rawText = document.getElementById('import-raw-text').value;
            
            let rawIds = rawText.split(/[,\s\n\t，]+/); 
            
            let ids = rawIds.map(s => s.trim().toUpperCase()).filter(s => s.length > 5 && (s.startsWith('UA') || s.startsWith('EX')));
            if(ids.length === 0) return alert("❌ 找不到任何有效的卡片編號！請確認輸入格式");
            
            ids = [...new Set(ids)]; 
            let newCards = ids.map(id => ({ id: id, name: id, series: series, imageUrl: `https://rugiacreation.com/ua/cardlist/small/${id.replace(/\//g, '_')}.jpg` }));
            
            if(typeof masterCardCatalog !== 'undefined') masterCardCatalog.push(...newCards);
            let savedCustom = JSON.parse(localStorage.getItem('ua_custom_cards')) || [];
            savedCustom.push(...newCards); localStorage.setItem('ua_custom_cards', JSON.stringify(savedCustom));
            initSeriesFilter(); renderBuilder(series); document.getElementById('series-filter').value = series; document.getElementById('import-raw-text').value = '';
            alert(`✨ 成功萃取並匯入 ${ids.length} 種新卡片到「${series}」分類！`);
        };
        // ===== 新增：本地圖片批次匯入功能 =====
        window.executeImageImport = async function() {
            let series = document.getElementById('import-series-name').value.trim() || "自訂圖片匯入";
            let fileInput = document.getElementById('import-images');
            let files = fileInput.files;

            if (files.length === 0) return;

            let newCards = [];
            showSysMsg(`⏳ 正在壓縮與處理 ${files.length} 張圖片，請稍候...`);

            for (let i = 0; i < files.length; i++) {
                let file = files[i];
                if (!file.type.startsWith('image/')) continue;

                // 壓縮並轉換為 Base64，設定基準寬度 252px (強制套用 63x88mm 比例)
                let base64Img = await compressAndResizeImage(file, 252); 
                let uniqueId = 'CUSTOM_' + Date.now() + '_' + i;
                
                newCards.push({
                    id: uniqueId,
                    name: file.name.split('.')[0], // 自動使用圖片檔名作為卡片名稱
                    series: series,
                    imageUrl: base64Img
                });
            }

            if (newCards.length === 0) return alert("❌ 找不到有效的圖片檔案！");

            if(typeof masterCardCatalog !== 'undefined') masterCardCatalog.push(...newCards);
            
            try {
                let savedCustom = JSON.parse(localStorage.getItem('ua_custom_cards')) || [];
                savedCustom.push(...newCards);
                localStorage.setItem('ua_custom_cards', JSON.stringify(savedCustom));
            } catch (e) {
                console.warn("LocalStorage 空間不足", e);
                alert("⚠️ 瀏覽器儲存空間已滿！本次圖片仍可使用，但重新整理網頁後將會消失。建議清除部分舊有自訂卡片。");
            }

            initSeriesFilter(); 
            renderBuilder(series); 
            document.getElementById('series-filter').value = series; 
            fileInput.value = ''; // 清空上傳欄位
            
            alert(`✨ 成功將 ${newCards.length} 張圖片匯入至「${series}」分類！`);
        };

        // ===== 新增：圖片壓縮與 63x88mm 比例裁切工具 =====
        function compressAndResizeImage(file, targetWidth) {
            return new Promise((resolve) => {
                let reader = new FileReader();
                reader.onload = function(event) {
                    let img = new Image();
                    img.onload = function() {
                        let canvas = document.createElement('canvas');
                        let ctx = canvas.getContext('2d');
                        
                        let ratio = 63 / 88;
                        let targetHeight = Math.round(targetWidth / ratio);
                        
                        canvas.width = targetWidth;
                        canvas.height = targetHeight;

                        let imgRatio = img.width / img.height;
                        let renderWidth = targetWidth;
                        let renderHeight = targetHeight;
                        let offsetX = 0;
                        let offsetY = 0;

                        if (imgRatio > ratio) {
                            renderWidth = targetHeight * imgRatio;
                            offsetX = (targetWidth - renderWidth) / 2;
                        } else {
                            renderHeight = targetWidth / imgRatio;
                            offsetY = (targetHeight - renderHeight) / 2;
                        }

                        ctx.fillStyle = "#14162a"; 
                        ctx.fillRect(0, 0, targetWidth, targetHeight);
                        ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
                        
                        resolve(canvas.toDataURL('image/jpeg', 0.75));
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        function initSeriesFilter() {
            if(typeof masterCardCatalog === 'undefined') return;
            const filterSelect = document.getElementById('series-filter');
            let seriesSet = new Set(masterCardCatalog.map(c => c.series));
            filterSelect.innerHTML = '';
            
            let allOpt = document.createElement('option');
            allOpt.value = 'ALL';
            allOpt.textContent = '全部作品 (All)';
            filterSelect.appendChild(allOpt);

            seriesSet.forEach(s => {
                let opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s; // 安全賦值，防止自訂系列名稱觸發 XSS
                filterSelect.appendChild(opt);
            });

            if (!filterSelect.dataset.bound) {
                filterSelect.dataset.bound = 'true';
                filterSelect.addEventListener('change', (e) => renderBuilder(e.target.value));

                const searchInput = document.getElementById('catalog-search');
                let searchDebounceTimer = null;
                searchInput.addEventListener('input', () => {
                    clearTimeout(searchDebounceTimer);
                    searchDebounceTimer = setTimeout(() => {
                        renderBuilder(document.getElementById('series-filter').value);
                    }, 200);
                });
            }
        }

        // 【效能優化】：圖鑑目前有上萬張卡片，改成「分批渲染 + 捲動到底才載入下一批」(infinite scroll)，
        // 避免每次篩選都把上萬個 DOM 節點一次塞進畫面造成卡頓。
        let catalogObserver = null;
        const CATALOG_BATCH_SIZE = 120;

        function getCurrentDeckCount(cardId) {
            let count = 0;
            for (let i = 0; i < myDeckData.length; i++) if (myDeckData[i].id === cardId) count++;
            for (let i = 0; i < myApData.length; i++) if (myApData[i].id === cardId) count++;
            return count;
        }

        function createCatalogCardEl(card) {
            let el = document.createElement('div'); el.className = 'preview-card';
            el.dataset.cardId = card.id;
            el.innerHTML = `<img src="${card.imageUrl}" loading="lazy" onerror="this.closest('.preview-card').style.display='none'; window.markCardInvalid('${card.id}');">`;

            let count = getCurrentDeckCount(card.id);
            if (count > 0) {
                let badge = document.createElement('div');
                badge.className = 'card-badge in-deck-badge';
                badge.innerText = count;
                el.appendChild(badge);
            }

            el.onclick = () => {
                if(card.series.includes("AP卡") || card.series.includes("Action Point") || card.id.includes("-AP")) {
                    if(myApData.length < 3) myApData.push({...card}); else alert("AP 卡最多只能配置 3 張！");
                } else {
                    if(myDeckData.length < 50) myDeckData.push({...card}); else alert("主牌組最多 50 張！");
                }
                renderDeck(); 
            };
            return el;
        }

        let builderColorFilter = 'ALL';
        document.querySelectorAll('#builder-color-pills .tier-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#builder-color-pills .tier-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                builderColorFilter = btn.dataset.color;
                renderBuilder(document.getElementById('series-filter').value);
            });
        });

        function renderBuilder(filterSeries = 'ALL') {
            let catGrid = document.getElementById('catalog-grid');
            catGrid.innerHTML = '';
            if (catalogObserver) { catalogObserver.disconnect(); catalogObserver = null; }
            if(typeof masterCardCatalog === 'undefined') return;

            let searchTerm = (document.getElementById('catalog-search')?.value || '').trim().toUpperCase();

            let filteredCards = masterCardCatalog.filter(c => {
                if (invalidCardsSet.has(c.id)) return false;
                if (filterSeries !== 'ALL' && c.series !== filterSeries) return false;
                if (builderColorFilter !== 'ALL' && c.color !== builderColorFilter) return false;
                if (searchTerm) {
                    let hay = (c.id + ' ' + (c.name || '')).toUpperCase();
                    if (!hay.includes(searchTerm)) return false;
                }
                return true;
            });

            if (filterSeries !== 'ALL' && filteredCards.length < 500) preloadCardsInBg(filteredCards);

            if (filteredCards.length === 0) {
                catGrid.innerHTML = '<div style="opacity:0.6; padding:30px; text-align:center; width:100%;">😥 找不到符合的卡片，換個關鍵字試試？</div>';
                return;
            }

            // 依系列分組，但保留原本出現順序
            let groupedCards = {};
            let seriesOrder = [];
            filteredCards.forEach(c => {
                if (!groupedCards[c.series]) { groupedCards[c.series] = []; seriesOrder.push(c.series); }
                groupedCards[c.series].push(c);
            });

            // 攤平成 render queue：標題與卡片依序排列，方便分批處理
            let renderQueue = [];
            seriesOrder.forEach(series => {
                renderQueue.push({ type: 'title', series });
                groupedCards[series].forEach(card => renderQueue.push({ type: 'card', card }));
            });

            let sentinel = document.createElement('div');
            sentinel.style.cssText = 'width:100%; height:1px;';
            catGrid.appendChild(sentinel);

            let cursor = 0;
            let currentGrid = null;
            let currentSeries = null;

            function ensureGridFor(series) {
                if (currentSeries === series && currentGrid) return;
                let title = document.createElement('div'); title.className = 'series-title'; title.innerText = series;
                catGrid.insertBefore(title, sentinel);
                currentGrid = document.createElement('div'); currentGrid.className = 'card-grid';
                catGrid.insertBefore(currentGrid, sentinel);
                currentSeries = series;
            }

            function renderNextBatch() {
                let count = 0;
                while (cursor < renderQueue.length && count < CATALOG_BATCH_SIZE) {
                    let item = renderQueue[cursor++];
                    if (item.type === 'title') {
                        ensureGridFor(item.series);
                    } else {
                        ensureGridFor(item.card.series);
                        currentGrid.appendChild(createCatalogCardEl(item.card));
                        count++;
                    }
                }
                if (cursor >= renderQueue.length && catalogObserver) {
                    catalogObserver.disconnect(); catalogObserver = null;
                    if (sentinel.parentNode) sentinel.remove();
                }
            }

            renderNextBatch(); // 先渲染第一批，讓畫面立即有內容

            if (cursor < renderQueue.length) {
                catalogObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => { if (entry.isIntersecting) renderNextBatch(); });
                }, { root: catGrid, rootMargin: '600px' });
                catalogObserver.observe(sentinel);
            }
        }

        function renderDeck() {
            let dGrid = document.getElementById('deck-grid-inner'); dGrid.innerHTML = '';
            let apGrid = document.getElementById('ap-deck-grid'); apGrid.innerHTML = '';
            
            preloadCardsInBg(myDeckData);
            preloadCardsInBg(myApData);

            let deckCounts = {}, apCounts = {};
            let uniqueDeck = [], uniqueAp = [];

            myDeckData.forEach(card => {
                if(!deckCounts[card.id]) { deckCounts[card.id] = 0; uniqueDeck.push(card); }
                deckCounts[card.id]++;
            });
            myApData.forEach(card => {
                if(!apCounts[card.id]) { apCounts[card.id] = 0; uniqueAp.push(card); }
                apCounts[card.id]++;
            });

            uniqueDeck.forEach(card => {
                let el = document.createElement('div'); el.className = 'preview-card'; el.dataset.cardId = card.id;
                el.innerHTML = `<img src="${card.imageUrl}">` + (deckCounts[card.id] > 1 ? `<div class="card-badge">${deckCounts[card.id]}</div>` : '');
                el.onclick = () => { 
                    let idx = myDeckData.findIndex(c => c.id === card.id);
                    if(idx !== -1) myDeckData.splice(idx, 1); 
                    renderDeck(); 
                }; 
                dGrid.appendChild(el);
            });
            
            uniqueAp.forEach(card => {
                let el = document.createElement('div'); el.className = 'preview-card'; el.dataset.cardId = card.id;
                el.innerHTML = `<img src="${card.imageUrl}">` + (apCounts[card.id] > 1 ? `<div class="card-badge">${apCounts[card.id]}</div>` : '');
                el.onclick = () => { 
                    let idx = myApData.findIndex(c => c.id === card.id);
                    if(idx !== -1) myApData.splice(idx, 1); 
                    renderDeck(); 
                }; 
                apGrid.appendChild(el);
            });

            document.getElementById('deck-counter').innerText = `${myDeckData.length} / 50`;
            document.getElementById('ap-counter').innerText = `${myApData.length} / 3`;
            saveAllDecks();
            updateLobbyDeckStatus();
            updateBuilderBadges(); 
        }
        
        window.clearDeck = function() { if(confirm("清空當前牌組與AP卡？")) { myDeckData = []; myApData = []; renderDeck(); } };
        
        let sysMsgTimer = null;
        function showSysMsg(msg) { 
            let box = document.getElementById('sys-msg'); 
            box.innerText = msg; 
            box.style.display = 'block'; 
            clearTimeout(sysMsgTimer);
            sysMsgTimer = setTimeout(() => { box.style.display = 'none'; }, 4000); 
        }

        function showCenterAlert(icon, title, value, color) {
            let overlay = document.getElementById('center-overlay');
            let iconEl = document.getElementById('overlay-icon');
            if (icon) { iconEl.innerText = icon; iconEl.style.display = 'block'; } 
            else { iconEl.style.display = 'none'; }
            document.getElementById('overlay-title').innerText = title;
            let valEl = document.getElementById('overlay-value');
            valEl.innerText = value;
            valEl.style.color = color;
            valEl.style.textShadow = `0 0 20px ${color}`;
            overlay.style.border = `4px solid ${color}`;
            overlay.style.boxShadow = `0 0 50px ${color}`;
            overlay.style.display = 'block';
            setTimeout(() => { overlay.style.display = 'none'; }, 500);
        }

        document.getElementById('btn-chat-toggle').addEventListener('click', function() {
            let panel = document.getElementById('chat-panel');
            if(panel.style.display === 'none') {
                panel.style.display = 'flex';
                this.classList.remove('has-unread');
            } else {
                panel.style.display = 'none';
            }
        });

        function sendChatMsg() {
            let input = document.getElementById('chat-input');
            let text = input.value.trim();
            if(text && isConnected && conn) {
                conn.send({ type: 'CHAT_MSG', text: text });
                appendChatMsg('me', text);
                input.value = '';
            }
        }

        document.getElementById('btn-chat-send').addEventListener('click', sendChatMsg);
        document.getElementById('chat-input').addEventListener('keydown', e => {
            if(e.key === 'Enter') sendChatMsg();
        });

        function sendSystemChat(msg) {
            appendChatMsg('system', msg); 
            if(conn && isConnected) {
                conn.send({ type: 'CHAT_MSG', text: msg, isSystem: true }); 
            }
        }

        function appendChatMsg(sender, text) {
            let msgDiv = document.createElement('div');
            msgDiv.style.padding = '6px 10px';
            msgDiv.style.borderRadius = '8px';
            msgDiv.style.maxWidth = '85%';
            msgDiv.style.wordBreak = 'break-word';
            msgDiv.style.lineHeight = '1.3';
            if (sender === 'system') {
                msgDiv.style.alignSelf = 'center';
                msgDiv.style.background = 'rgba(141, 124, 196, 0.25)';
                msgDiv.style.border = '1px solid rgba(141, 124, 196, 0.5)';
                msgDiv.style.color = '#c9bce0';
                msgDiv.style.fontSize = '12px';
                msgDiv.innerText = text;
            } else if (sender === 'me') {
                msgDiv.style.alignSelf = 'flex-end';
                msgDiv.style.background = 'rgba(111, 184, 151, 0.25)';
                msgDiv.style.border = '1px solid rgba(111, 184, 151, 0.5)';
                msgDiv.style.color = '#6fb897';
                msgDiv.innerText = text;
            } else {
                msgDiv.style.alignSelf = 'flex-start';
                msgDiv.style.background = 'rgba(209, 196, 233, 0.25)';
                msgDiv.style.border = '1px solid rgba(209, 196, 233, 0.5)';
                msgDiv.style.color = '#d1c4e9';
                msgDiv.innerText = text;
                
                let panel = document.getElementById('chat-panel');
                if(panel.style.display === 'none') {
                    document.getElementById('btn-chat-toggle').classList.add('has-unread');
                }
            }
            let container = document.getElementById('chat-messages');
            container.appendChild(msgDiv);
            container.scrollTop = container.scrollHeight;
        }

        window.camX = 0; window.camY = 0;
        let isCamDragging = false;
        let camStartX = 0, camStartY = 0;
        window.boardScale = 1; 

        function updateCamera() {
            let gameTable = document.getElementById('game-table-inner');
            if(gameTable) gameTable.style.transform = `translate(${window.camX}px, ${window.camY}px) scale(${window.boardScale})`;
        }

        window.zoomCam = function(delta) {
            window.boardScale += delta;
            if(window.boardScale < 0.3) window.boardScale = 0.3;
            if(window.boardScale > 2) window.boardScale = 2;
            updateCamera();
        };

        window.resetCam = function() {
            let wrapper = document.getElementById('board-viewport');
            if(!wrapper) return;
            
            let topUIHeight = 36;
            let bottomUIHeight = window.is3D ? 155 : 175;
            
            let safeHeight = wrapper.clientHeight - topUIHeight - bottomUIHeight;
            let targetHeight = window.is3D ? 820 : 910;
            
            window.boardScale = safeHeight / targetHeight;
            
            if(window.boardScale > 1.35) window.boardScale = 1.35;
            if(window.boardScale < 0.3) window.boardScale = 0.3;
            
            window.camX = (wrapper.clientWidth - (1150 * window.boardScale)) / 2;
            window.camY = topUIHeight + (safeHeight - (1000 * window.boardScale)) / 2 + (window.is3D ? -12 : 0);
            
            updateCamera();
        };

        window.is3D = false;
        window.toggle3D = function() {
            window.is3D = !window.is3D;
            let btn = document.getElementById('btn-3d');
            btn.style.background = window.is3D ? '#c1596f' : 'rgba(0,0,0,0.8)';
            let table = document.getElementById('game-table-inner');
            if(window.is3D) table.classList.add('mode-3d');
            else table.classList.remove('mode-3d');
            resetCam();
        };

        function startPan(e) {
            if(e.target.closest('.card') || e.target.closest('.marker') || e.target.closest('.bp-badge') || e.target.closest('.cam-btn') || 
               e.target.closest('.hud-sidebar') || e.target.closest('.hud-top') || e.target.closest('.hud-bottom') || 
               e.target.closest('#chat-wrapper') || e.target.closest('#hotkey-guide') || 
               e.target.closest('#search-modal') || e.target.closest('#mulligan-modal')) return; 
               document.querySelectorAll('.active-touch').forEach(el => el.classList.remove('active-touch'));
               window.activeCard = null;
            isCamDragging = true;
            let clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            let clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            
            clientX = clientX / (window.appScale || 1);
            clientY = clientY / (window.appScale || 1);

            camStartX = clientX - window.camX;
            camStartY = clientY - window.camY;
        }

        function doPan(e) {
            if(!isCamDragging) return;
            if (e.cancelable) e.preventDefault(); 
            let clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            let clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            
            clientX = clientX / (window.appScale || 1);
            clientY = clientY / (window.appScale || 1);

            window.camX = clientX - camStartX;
            window.camY = clientY - camStartY;
            updateCamera();
        }

        function endPan() { isCamDragging = false; }

        window.onload = () => { 
            let savedCustom = JSON.parse(localStorage.getItem('ua_custom_cards')) || [];
            if(typeof masterCardCatalog !== 'undefined') masterCardCatalog.push(...savedCustom);
            ensureCatalogMap();
            myDeckData = hydrateDeckList(allDecks[currentDeckName].main);
            myApData = hydrateDeckList(allDecks[currentDeckName].ap || []);
            updateDeckSelector(); initSeriesFilter(); renderBuilder(); renderDeck();

            document.querySelectorAll('.slot').forEach(slot => {
                if (!slot.id.includes('hand') && !slot.id.includes('look') && !slot.id.includes('deck')) {
                    let m = document.createElement('div');
                    m.className = 'marker';
                    slot.appendChild(m);
                    
                    m.addEventListener('click', (e) => {
                        e.stopPropagation();
                        slot.classList.toggle('marked');
                        broadcastMyState();
                    });
                }
            });
            
            document.querySelectorAll('#my-front-line .slot, #opp-front-line .slot').forEach(slot => {
                let tracker = document.createElement('div');
                tracker.className = 'bp-tracker';
                tracker.dataset.bp = 0;
                slot.appendChild(tracker);
                
                let btn = document.createElement('div');
                btn.className = 'bp-badge';
                btn.innerText = 'BP';
                slot.appendChild(btn);
                
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    window.currentBpSlot = slot;
                    let menu = document.getElementById('bp-menu');
                    let canvasRect = document.getElementById('app-canvas').getBoundingClientRect();
                    let localX = (e.clientX - canvasRect.left) / (window.appScale || 1);
                    let localY = (e.clientY - canvasRect.top) / (window.appScale || 1);
                    
                    menu.style.left = localX + 'px';
                    menu.style.top = localY + 'px';
                    menu.style.display = 'flex';
                });
            });

            document.addEventListener('click', e => {
                if(!e.target.closest('#bp-menu')) {
                    let menu = document.getElementById('bp-menu');
                    if(menu) menu.style.display = 'none';
                }
            });

            let wrapper = document.getElementById('board-viewport');
            
            wrapper.addEventListener('wheel', e => {
                if(document.getElementById('game-scene').style.display === 'none') return;
                e.preventDefault(); 
                let delta = e.deltaY > 0 ? -0.05 : 0.05;
                zoomCam(delta);
            }, { passive: false });

            wrapper.addEventListener('mousedown', startPan);
            wrapper.addEventListener('touchstart', startPan, {passive: false});
            window.addEventListener('mousemove', doPan);
            window.addEventListener('touchmove', doPan, {passive: false});
            window.addEventListener('mouseup', endPan);
            window.addEventListener('touchend', endPan);
            window.addEventListener('touchcancel', endPan); 

            const hkToggle = document.getElementById('hotkey-drawer-toggle');
            const hkGuide = document.getElementById('hotkey-guide');
            if (hkToggle && hkGuide) {
                hkToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hkGuide.classList.toggle('is-collapsed');
                });
            }
            window.addEventListener('resize', resetCam);
        };
        
        function updateBpDisplay(slot, bpVal) {
            let tracker = slot.querySelector('.bp-tracker');
            if(!tracker) return;
            tracker.dataset.bp = bpVal;
            if(bpVal === 0) {
                tracker.classList.remove('active', 'positive', 'negative');
            } else {
                tracker.classList.add('active');
                if(bpVal > 0) { 
                    tracker.classList.add('positive'); tracker.classList.remove('negative');
                    tracker.innerText = `+${bpVal}`; 
                } else { 
                    tracker.classList.add('negative'); tracker.classList.remove('positive');
                    tracker.innerText = `${bpVal}`; 
                }
            }
        }

        window.changeBp = function(amount) {
            if(!window.currentBpSlot) return;
            let slot = window.currentBpSlot;
            let tracker = slot.querySelector('.bp-tracker');
            let currentBp = parseInt(tracker.dataset.bp) || 0;
            
            if(amount === 0) currentBp = 0; 
            else currentBp += amount;
            
            updateBpDisplay(slot, currentBp);
            document.getElementById('bp-menu').style.display = 'none';

            if (slot.id.includes('my-')) {
                broadcastMyState(); 
            } else if (slot.id.includes('opp-')) {
                if (conn && isConnected) {
                    let oppLocalId = slot.id.replace('opp-', 'my-');
                    conn.send({ type: 'UPDATE_OPP_BP', slotId: oppLocalId, bp: currentBp });
                }
            }
        };

// 產生 6 碼純數字房號（對外顯示 6 碼數字，對 PeerJS 註冊時自動加上 nchucgc- 前綴防撞號）
        const PEER_PREFIX = 'nchucgc-';
        function generateRoomId() {
            const arr = new Uint32Array(1);
            crypto.getRandomValues(arr);
            return String(100000 + (arr[0] % 900000));
        }
        let myRoomId = generateRoomId();
        window.myRoomId = myRoomId;
        window.peerReady = false;

        let peer = new Peer(PEER_PREFIX + myRoomId, {
            secure: true,
            pingInterval: 5000,
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: "stun:stun.relay.metered.ca:80" },
                    {
                        urls: "turn:global.relay.metered.ca:80",
                        username: "968921041e4bdb371cce4413",
                        credential: "x/xElHfaL9G++EO/"
                    },
                    {
                        urls: "turn:global.relay.metered.ca:80?transport=tcp",
                        username: "968921041e4bdb371cce4413",
                        credential: "x/xElHfaL9G++EO/"
                    },
                    {
                        urls: "turn:global.relay.metered.ca:443",
                        username: "968921041e4bdb371cce4413",
                        credential: "x/xElHfaL9G++EO/"
                    },
                    {
                        urls: "turns:global.relay.metered.ca:443?transport=tcp",
                        username: "968921041e4bdb371cce4413",
                        credential: "x/xElHfaL9G++EO/"
                    }
                ]
            }
        });

        let conn = null; let isConnected = false;

        window.connectToPeer = function (rawCode) {
            const cleanCode = String(rawCode || '').replace(/\D/g, '');
            if (cleanCode.length !== 6) {
                showSysMsg('請輸入正確的 6 碼數字房號。');
                return;
            }
            if (cleanCode === myRoomId) {
                showSysMsg('無法連線至自己的房號。');
                return;
            }
            showSysMsg(`正在連線至房號 ${cleanCode}...`);
            conn = peer.connect(PEER_PREFIX + cleanCode, { reliable: true });
            let connectTimeout = setTimeout(() => {
                if (!isConnected) {
                    showSysMsg('連線逾時，請確認對手房號是否正確且仍在頁面中。');
                    if (conn) conn.close();
                }
            }, 10000);
            setupConnection(connectTimeout);
        };

        peer.on('open', () => {
            window.peerReady = true;
            const idEl = document.getElementById('my-peer-id');
            if (idEl) {
                idEl.innerText = myRoomId;
                idEl.onclick = () => {
                    let inviteUrl = window.location.origin + window.location.pathname + '?join=' + myRoomId;
                    navigator.clipboard.writeText(inviteUrl);
                    showSysMsg(`已複製邀請連結（房號 ${myRoomId}）`);
                };
            }

            const urlParams = new URLSearchParams(window.location.search);
            const joinId = urlParams.get('join');
            if (joinId && joinId !== myRoomId) {
                if (typeof window.switchMainView === 'function') window.switchMainView('rooms');
                const manualInput = document.getElementById('lobby-manual-code');
                if (manualInput) manualInput.value = joinId;
                showSysMsg(`偵測到邀請房號 ${joinId}，2 秒後自動嘗試連線...`);
                setTimeout(() => window.connectToPeer(joinId), 2000);
            }
        });

        peer.on('disconnected', () => {
            console.warn("⚠️ 與配對伺服器失去聯繫，自動重連...");
            if (!peer.destroyed) peer.reconnect();
        });

        peer.on('error', err => {
            console.error(err);
            if (err.type === 'unavailable-id') {
                showSysMsg("房號發生碰撞，正在重新產生專屬房號...");
                setTimeout(() => window.location.reload(), 800);
            } else if (err.type === 'peer-unavailable') {
                alert("❌ 找不到這個對手！請確認對手的 6 碼數字房號是否正確且網頁沒有關閉。");
            } else if (err.type === 'network' || err.type === 'server-error') {
                showSysMsg("配對伺服器連線波動，系統自動重試中...");
            }
        });

        peer.on('connection', connection => {
            if (isConnected && conn && conn.open) {
                console.warn("已拒絕第三者插入連線:", connection.peer);
                connection.on('open', () => connection.close());
                return;
            }
            conn = connection;
            setupConnection();
        });
        window.pendingOppSyncData = null;
        window.lastStartGameReqTime = 0;
        window.oppCustomImgMap = new Map();

        function sendStartGamePayload(deckList, apList) {
            if (!conn || !isConnected) return;
            // 僅傳送卡號字串，避免 Base64 圖片撐爆 WebRTC DataChannel (64KB 上限)
            const lightDeck = (deckList || []).map(c => (typeof c === 'string') ? c : c.id);
            const lightAp = (apList || []).map(c => (typeof c === 'string') ? c : c.id);
            conn.send({ type: 'START_GAME', deck: lightDeck, ap: lightAp });

            // 若牌組含有自訂本地圖片 (CUSTOM_)，改為逐張分批傳送
            const sentIds = new Set();
            [...(deckList || []), ...(apList || [])].forEach(c => {
                if (c && typeof c === 'object' && c.id && c.id.startsWith('CUSTOM_') && c.imageUrl && !sentIds.has(c.id)) {
                    sentIds.add(c.id);
                    const idx = sentIds.size;
                    setTimeout(() => {
                        if (conn && isConnected) {
                            conn.send({ type: 'CUSTOM_CARD_IMG', id: c.id, imageUrl: c.imageUrl });
                        }
                    }, idx * 40);
                }
            });
        }

        function setupConnection(timeoutId) {
            conn.on('open', () => {
                if(timeoutId) clearTimeout(timeoutId);
                isConnected = true; showSysMsg("連線成功！");
                const matchBar = document.getElementById('global-match-bar');
                if (matchBar) matchBar.style.display = 'flex';
                window.history.replaceState({}, document.title, window.location.pathname); 
                
                let btn = document.getElementById('start-game-btn'); btn.disabled = false; btn.innerText = "雙方就緒，進入對戰 ➔";
                btn.onclick = () => {
                    if(myDeckData.length === 0) { alert("請先建立主牌組！"); return; }
                    if(myApData.length !== 3) { alert("請挑選剛好 3 張 AP 卡！"); return; }
                    
                    requestFullScreen();

                    document.body.classList.add('in-game');
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(err => console.log('視覺提示已啟動'));
                    }

                    // 【修改】：移除無差別的 resetBoard()，改為「只清空我方區域」，保護已經在背景載入的對手卡片
                    myCardsElements.forEach(c => { if(c && c.parentNode) c.remove(); });
                    myCardsElements = [];
                    document.querySelectorAll('#my-board .card, #my-hand-area .card, #my-look-area .card').forEach(c => c.remove());
                    
                    document.getElementById('nchucgc-nav').style.display = 'none';
                    const matchBarOnStart = document.getElementById('global-match-bar');
                    if (matchBarOnStart) matchBarOnStart.style.display = 'none';
                    document.getElementById('home-scene').style.display = 'none';
                    document.getElementById('tier-scene').style.display = 'none';
                    document.getElementById('lobby-scene').style.display = 'none';
                    document.getElementById('builder-scene').style.display = 'none'; 
                    document.getElementById('game-scene').style.display = 'flex';
                    setTimeout(resetCam, 100); 
                    
                    let deckClone = JSON.parse(JSON.stringify(myDeckData));
                    let apClone = JSON.parse(JSON.stringify(myApData));
                    let shuffledDeck = shuffleArray(deckClone);
                    
                    // 記錄本次對局的輕量起始牌組，供對手漏接時自動補傳
                    window.myLastStartDeck = shuffledDeck;
                    window.myLastStartAp = apClone;

                    // 先送輕量 START_GAME（僅傳 ID，確保 < 2KB 絕不被 WebRTC 丟包）
                    sendStartGamePayload(shuffledDeck, apClone);

                    // 再初始化我方盤面並廣播 SYNC_BOARD
                    if (window.nchucgcLobby) window.nchucgcLobby.setMyPresence('playing');
                    initMyBoard(shuffledDeck, apClone);
                };
            });
            conn.on('data', data => {
                if(data.type === 'START_GAME') { 
                    showSysMsg("對手已進入盤面，正在等你就緒！"); 
                    initOpponentBoard(data.deck, data.ap); 
                    let startBtn = document.getElementById('start-game-btn');
                    if (startBtn) {
                        startBtn.innerText = "⚔️ 對手已就緒，點擊進入對戰";
                        startBtn.style.background = "#b39ddb";
                        startBtn.style.boxShadow = "0 0 15px #b39ddb";
                    }
                }
                else if(data.type === 'CUSTOM_CARD_IMG') {
                    // 接收對手分批送來的自訂卡圖片並即時更新對應卡面
                    if (data.id && typeof data.imageUrl === 'string' && /^(https:\/\/|data:image\/)/i.test(data.imageUrl.trim())) {
                        window.oppCustomImgMap = window.oppCustomImgMap || new Map();
                        window.oppCustomImgMap.set(data.id, data.imageUrl.trim());
                        oppCardsElements.forEach(el => {
                            if (el.dataset.cardId === data.id) {
                                let img = el.querySelector('.card-front img');
                                if (img) img.src = data.imageUrl.trim();
                            }
                        });
                    }
                }
                else if(data.type === 'REQUEST_START_GAME') {
                    // 對手偵測到漏接 START_GAME，立即補傳起始牌組與目前盤面狀態
                    if (window.myLastStartDeck && window.myLastStartAp) {
                        sendStartGamePayload(window.myLastStartDeck, window.myLastStartAp);
                        setTimeout(() => broadcastMyState(), 150);
                    }
                }
                else if(data.type === 'SYNC_BOARD') applyOpponentSync(data);
                else if(data.type === 'FLIP_CARD') applyOpponentFlip(data.id);
                else if(data.type === 'CHAT_MSG') appendChatMsg(data.isSystem ? 'system' : 'opp', data.text);
                else if(data.type === 'DICE_ROLL') showCenterAlert('🎲', '對手擲出了：', data.value, '#c1596f');
                else if(data.type === 'SHUFFLE_DECK') showCenterAlert('🔀', '對手洗牌中', 'Shuffling...', '#8d7cc4');
                else if(data.type === 'PHASE_BROADCAST') { 
                    if (data.phase === '結束') showCenterAlert('⚠️', '對手回合結束', '輪到你了！', '#6fb897');
                    else showCenterAlert('⚠️', '對手進入了', data.phase + '階段', '#b39ddb');
                }
                else if(data.type === 'SURRENDER') {
                    alert("對手已投降並返回構築區！\n點擊確定後將同步返回大廳。");
                    resetBoard();
                }
                else if(data.type === 'UPDATE_OPP_BP') {
                    let slot = document.getElementById(data.slotId);
                    if(slot) {
                        updateBpDisplay(slot, data.bp);
                        broadcastMyState(); 
                        showCenterAlert('⚔️', 'BP 已變更', `對手調整了你的 BP`, '#b39ddb');
                    }
                }
            });
            conn.on('close', () => {
                isConnected = false;
                const matchBarOnClose = document.getElementById('global-match-bar');
                if (matchBarOnClose) matchBarOnClose.style.display = 'none';
                if (window.uaEngine) window.uaEngine.clearCombatLock();
                const inGame = document.getElementById('game-scene').style.display !== 'none';
                if (inGame) {
                    showSysMsg("⚠️ 與對手連線暫時中斷！盤面已為您保留，等待對手重新連線，或可點擊右下角「投降返回」回到大廳。");
                } else {
                    showSysMsg("⚠️ 對手已離線。");
                }
            });
        } // 👈 就是少了這一個關閉 setupConnection 函式的大括號！

        // 供單機人機對戰接入虛擬對手（沿用既有 setupConnection 訊息協定，不影響 P2P）
        window.connectVirtualOpponent = function (virtualConn) {
            if (conn && conn.open) {
                try { conn.close(); } catch (e) {}
            }
            conn = virtualConn;
            isConnected = false;
            setupConnection();
        };
        document.getElementById('btn-back-builder').addEventListener('click', () => {
            if (window.uaTestMode && window.uaTestMode.isActive()) {
                window.uaTestMode.exit();
                return;
            }
            if(confirm("確定要投降並返回構築區嗎？")) {
                if(conn && isConnected) conn.send({ type: 'SURRENDER' });
                resetBoard();
            }
        });

        function resetBoard() {
            document.body.classList.remove('in-game');
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }

            myCardsElements.forEach(c => { if(c && c.parentNode) c.remove(); });
            oppCardsElements.forEach(c => { if(c && c.parentNode) c.remove(); });
            document.querySelectorAll('.card').forEach(c => c.remove());

            // 1. 手牌區與檢索區可以直接清空
            document.querySelectorAll('.hand-area, .look-area').forEach(el => {
                el.innerHTML = ''; 
            });
            
            // 2. 針對卡槽(slot)，只移除殘留的卡片，嚴格保留你的標記與 BP 元件
            document.querySelectorAll('.slot').forEach(slot => {
                Array.from(slot.children).forEach(child => {
                    if (!child.classList.contains('marker') && !child.classList.contains('bp-tracker') && !child.classList.contains('bp-badge')) {
                        child.remove();
                    }
                });
            });

            document.querySelectorAll('.slot.marked').forEach(s => s.classList.remove('marked'));
            document.querySelectorAll('.phase-step').forEach(btn => btn.classList.remove('active'));
            document.querySelector('.phase-step:first-child').classList.add('active');
            document.getElementById('game-scene').style.display = 'none'; 
            document.getElementById('nchucgc-nav').style.display = 'flex';
            const matchBarOnReset = document.getElementById('global-match-bar');
            if (matchBarOnReset && isConnected) matchBarOnReset.style.display = 'flex';
            switchMainView('rooms');
            myCardsElements = []; oppCardsElements = [];

            // 【新增】新的一局開始前，把上一局殘留的復原歷史、連線快取與規則引擎狀態清空
            undoHistory = []; lastMySnapshot = null; isUndoing = false;
            window.pendingOppSyncData = null;
            window.myLastStartDeck = null;
            window.myLastStartAp = null;
            if (window.oppCustomImgMap) window.oppCustomImgMap.clear();
            if (conn && conn.isVirtual) {
                try { conn.close(); } catch (e) {}
                conn = null;
                isConnected = false;
            }
            if (window.uaEngine && typeof window.uaEngine.resetMatchState === 'function') {
                window.uaEngine.resetMatchState();
            }
            if (window.nchucgcLobby) window.nchucgcLobby.setMyPresence('online');
            updateUndoButtonState();
        }

        window.rollDice = function() {
            let result = Math.floor(Math.random() * 6) + 1;
            showCenterAlert('🎲', '你擲出了：', result, '#6fb897');
            if (conn) conn.send({ type: 'DICE_ROLL', value: result });
        };

        window.setPhase = function(el, phaseName) {
            document.querySelectorAll('.phase-step').forEach(btn => btn.classList.remove('active'));
            el.classList.add('active');
            broadcastMyState();
            showCenterAlert('🔄', '進入階段', phaseName + '階段', '#6c93c7');
            if(conn && isConnected) conn.send({ type: 'PHASE_BROADCAST', phase: phaseName });
        };

        window.endTurn = function() {
            document.querySelectorAll('.phase-step').forEach(btn => btn.classList.remove('active'));
            document.querySelector('.phase-step:first-child').classList.add('active'); 
            
            document.querySelectorAll('#my-board .card.rest').forEach(c => c.classList.remove('rest'));
            document.querySelectorAll('.slot.marked').forEach(s => s.classList.remove('marked'));
            
            broadcastMyState();
            showCenterAlert('⛔', '回合結束', '換對手回合', '#c1596f');
            if(conn && isConnected) conn.send({ type: 'PHASE_BROADCAST', phase: '結束' });
        };

        let myCardsElements = []; let oppCardsElements = [];
        Object.defineProperty(window, "myCardsElements", { get: () => myCardsElements, set: v => { myCardsElements = v; }, configurable: true });
        Object.defineProperty(window, "oppCardsElements", { get: () => oppCardsElements, set: v => { oppCardsElements = v; }, configurable: true });

        // ===== 【新增】復原上一步操作 (Undo) =====
        // 設計原則：不去每個操作點都手動插入「存檔」，而是掛在 broadcastMyState() 這個
        // 「每次盤面確定變動後都會呼叫」的既有函式上，自動偵測狀態改變並記錄快照。
        // 拖曳中(卡片還在 board-viewport 上飄)的過程不算數，只記錄「放定」後的結果。
        let undoHistory = [];
        const MAX_UNDO_STEPS = 25;
        let isUndoing = false;
        let lastMySnapshot = null;

        function captureBoardSnapshot() {
            let cards = myCardsElements.filter(el => el && el.parentElement).map(el => {
                let siblingCards = Array.from(el.parentElement.children).filter(c => c.classList && c.classList.contains('card'));
                return {
                    id: el.dataset.networkId,
                    parentId: el.parentElement.id,
                    order: siblingCards.indexOf(el),
                    isFlipped: el.classList.contains('is-flipped'),
                    isRest: el.classList.contains('rest'),
                    inLife: el.classList.contains('in-life'),
                    tilt: el.style.getPropertyValue('--tilt') || '0deg'
                };
            });
            let activePhaseEl = document.querySelector('.phase-step.active');
            let phaseIndex = activePhaseEl ? Array.from(document.querySelectorAll('.phase-step')).indexOf(activePhaseEl) : 0;
            let markedSlots = Array.from(document.querySelectorAll('.slot.marked')).map(el => el.id);
            let bpStates = {};
            document.querySelectorAll('#my-front-line .slot').forEach(slot => {
                let t = slot.querySelector('.bp-tracker');
                if (t && t.dataset.bp != 0) bpStates[slot.id] = t.dataset.bp;
            });
            return {
                cards,
                phaseIndex,
                markedSlots,
                bpStates,
                engineState: window.uaEngine ? window.uaEngine.exportEngineStateSnapshot() : null
            };
        }

        function updateUndoButtonState() {
            let btn = document.getElementById('btn-undo');
            if (btn) btn.disabled = undoHistory.length === 0;
        }

        // 每次盤面「確定」變動後都會經過這裡：若目前沒有卡片正在拖曳中，且跟上一次記錄的快照不同，
        // 就把「上一個」快照推進歷史堆疊，並把「這一個」設為新的基準點。
        function maybeRecordUndoHistory() {
            if (isUndoing) return; // 復原操作本身觸發的 broadcast 不重複記錄
            let anyDragging = myCardsElements.some(el => el && el.parentElement && el.parentElement.id === 'board-viewport');
            if (anyDragging) return;

            let snap = captureBoardSnapshot();
            let serialized = JSON.stringify(snap);
            if (lastMySnapshot && lastMySnapshot.serialized !== serialized) {
                undoHistory.push(lastMySnapshot.data);
                if (undoHistory.length > MAX_UNDO_STEPS) undoHistory.shift();
                updateUndoButtonState();
            }
            lastMySnapshot = { serialized, data: snap };
        }

        function applySnapshotToMyBoard(snapshot) {
            if (!snapshot) return;
            isUndoing = true;

            let byParent = {};
            snapshot.cards.forEach(c => { (byParent[c.parentId] = byParent[c.parentId] || []).push(c); });
            Object.keys(byParent).forEach(pid => byParent[pid].sort((a, b) => a.order - b.order));

            Object.keys(byParent).forEach(pid => {
                let parentEl = document.getElementById(pid);
                if (!parentEl) return;
                byParent[pid].forEach(c => {
                    let el = myCardsElements.find(x => x.dataset.networkId === c.id);
                    if (!el) return;
                    parentEl.appendChild(el);
                    el.classList.toggle('is-flipped', c.isFlipped);
                    el.classList.toggle('rest', c.isRest);
                    el.classList.toggle('in-life', c.inLife);
                    el.style.setProperty('--tilt', c.tilt);
                });
                recalcStacking(parentEl);
            });

            let phaseButtons = document.querySelectorAll('.phase-step');
            phaseButtons.forEach((btn, idx) => btn.classList.toggle('active', idx === snapshot.phaseIndex));

            document.querySelectorAll('.slot.marked').forEach(s => s.classList.remove('marked'));
            (snapshot.markedSlots || []).forEach(id => { let s = document.getElementById(id); if (s) s.classList.add('marked'); });

            document.querySelectorAll('#my-front-line .slot').forEach(slot => {
                let bpVal = (snapshot.bpStates && snapshot.bpStates[slot.id]) || 0;
                updateBpDisplay(slot, bpVal);
            });

            updateSlotCounts();
            // 🌟 新增這一行：還原規則引擎的執行期狀態 (含每回合一次限制、暫時能源與回合數)
            if (window.uaEngine && snapshot.engineState) {
                window.uaEngine.importEngineStateSnapshot(snapshot.engineState);
            }
            lastMySnapshot = { serialized: JSON.stringify(snapshot), data: snapshot };
            broadcastMyState(); // 同步給對手，此時 isUndoing 仍為 true，不會又記錄一筆新歷史
            isUndoing = false;
        }

        window.undoLastAction = function() {
            if (undoHistory.length === 0) { showSysMsg("目前沒有可以復原的操作了"); return; }
            let snap = undoHistory.pop();
            applySnapshotToMyBoard(snap);
            updateUndoButtonState();
            showSysMsg("已復原上一步操作");
        };

        function broadcastMyState() {
            maybeRecordUndoHistory();
            if(!conn || !isConnected) return;
            let state = [];
            
            myCardsElements.forEach((el, index) => {
                if (!el || !el.parentElement) return;

                let pId = el.parentElement.id || 'none';
                let isFlipped = el.classList.contains('is-flipped');
                
                if (pId.includes('hand') || pId.includes('look') || el.dataset.isSecretDrag === 'true') {
                    isFlipped = true;
                }

                let xVal = el.style.left;
                let yVal = el.style.top;
                let isGlobalDragging = (pId === 'board-viewport');
                
                if (isGlobalDragging) {
                    let px = parseFloat(el.style.left);
                    let py = parseFloat(el.style.top);
                    let cardW = el.offsetWidth;
                    let cardH = el.offsetHeight;
                    let currentScale = window.boardScale * 1.05; 
                    
                    let cx = px + (cardW * currentScale) / 2;
                    let cy = py + (cardH * currentScale) / 2;
                    
                    let logicalCx = (cx - window.camX) / window.boardScale;
                    let logicalCy = (cy - window.camY) / window.boardScale;
                    
                    xVal = (logicalCx / 1150).toString() + '_board';
                    yVal = (logicalCy / 1000).toString() + '_board';
                }

                let tiltVal = el.style.getPropertyValue('--tilt') || '0deg';

                let absoluteZIndex = el.style.zIndex !== '' ? parseInt(el.style.zIndex) : index;
                if (pId.includes('hand') || pId.includes('look')) {
                    const sibs = Array.from(el.parentElement.querySelectorAll('.card'));
                    absoluteZIndex = sibs.indexOf(el) + 1;
                }

                state.push({ 
                    id: el.dataset.networkId, parent: pId, 
                    x: xVal, y: yVal, 
                    zIndex: absoluteZIndex,
                    isFlipped: isFlipped, isRest: el.classList.contains('rest'), inLife: el.classList.contains('in-life'),
                    isDragging: isGlobalDragging,
                    tilt: tiltVal 
                });
            });

            let activePhaseEl = document.querySelector('.phase-step.active');
            let myPhase = activePhaseEl ? activePhaseEl.innerText : '等待中';
            let markedSlots = Array.from(document.querySelectorAll('.slot.marked')).map(el => el.id);

            let bpStates = {};
            document.querySelectorAll('#my-front-line .slot').forEach(slot => {
                let t = slot.querySelector('.bp-tracker');
                if(t && t.dataset.bp != 0) bpStates[slot.id] = t.dataset.bp;
            });

            let kwStates = (window.uaEngine && typeof window.uaEngine.exportMyKeywordBadgesMap === 'function')
                ? window.uaEngine.exportMyKeywordBadgesMap()
                : {};

            conn.send({ type: 'SYNC_BOARD', state: state, phase: myPhase, markedSlots: markedSlots, bpStates: bpStates, kwStates: kwStates });
        }

        function applyOpponentSync(data) {
            let stateData = data.state || [];
            // 若尚未收到 START_GAME（oppCardsElements 為空），先暫存同步封包並自動請對手補傳
            if (oppCardsElements.length === 0 && stateData.length > 0) {
                window.pendingOppSyncData = data;
                let now = Date.now();
                if (conn && isConnected && now - (window.lastStartGameReqTime || 0) > 1500) {
                    window.lastStartGameReqTime = now;
                    conn.send({ type: 'REQUEST_START_GAME' });
                }
                return;
            }
            stateData.forEach(d => {
                let el = oppCardsElements.find(c => c.dataset.networkId === d.id);
                if(el) {
                    if (d.parent === 'none') { el.style.opacity = '0'; return; }
                    el.style.opacity = '1';

                    let targetParentId = d.parent.replace('my-', 'opp-');
                    
                    // ⚡ FIX 2: 檢索視窗防呆！如果對手自己開了 Modal 把卡片拉進去，我們不要把卡片吸進我們隱藏的 Modal 導致永久消失
                    if (targetParentId.includes('modal')) {
                        targetParentId = el.parentElement ? el.parentElement.id : 'opp-outside-area';
                    }

                    let actualParentEl = d.isDragging ? document.getElementById('board-viewport') : document.getElementById(targetParentId);
                    let isInModal = el.parentElement && el.parentElement.id.includes('modal');
                    
                    if (!isInModal) {
                        if(actualParentEl && el.parentElement !== actualParentEl) actualParentEl.appendChild(el);
                        
                        el.style.position = (targetParentId.includes('hand') || targetParentId.includes('look')) && !d.isDragging ? 'relative' : 'absolute';
                        
                        if (d.isDragging && typeof d.x === 'string' && d.x.endsWith('_board')) {
                            let nx = parseFloat(d.x);
                            let ny = parseFloat(d.y);
                            let flippedNx = 1 - nx;
                            let flippedNy = 1 - ny;
                            let logicalCx = flippedNx * 1150;
                            let logicalCy = flippedNy * 1000;
                            let cx = logicalCx * window.boardScale + window.camX;
                            let cy = logicalCy * window.boardScale + window.camY;
                            let cardW = el.offsetWidth;
                            let cardH = el.offsetHeight;
                            let currentScale = window.boardScale * 1.05;
                            let px = cx - (cardW * currentScale) / 2;
                            let py = cy - (cardH * currentScale) / 2;

                            el.style.left = px + 'px';
                            el.style.top = py + 'px';
                            el.style.transform = `scale(${currentScale})`;
                            el.classList.add('dragging'); 
                            el.style.zIndex = 999999;
                            
                        } else if (d.isDragging && typeof d.x === 'string' && d.x.endsWith('_vp')) {
                            let px = parseFloat(d.x);
                            let py = parseFloat(d.y);
                            let vp = document.getElementById('board-viewport');
                            el.style.left = ((1 - px) * vp.clientWidth - el.offsetWidth) + 'px';
                            el.style.top = ((1 - py) * vp.clientHeight - el.offsetHeight) + 'px';
                            el.style.transform = `scale(${window.boardScale * 1.05})`; 
                            el.classList.add('dragging'); 
                            el.style.zIndex = 999999;
                        } else {
                            el.style.left = d.x; 
                            el.style.top = d.y;
                            el.style.transform = '';
                            el.classList.remove('dragging');
                            el.style.zIndex = (d.zIndex !== undefined && d.zIndex !== null) ? d.zIndex : ''; 
                        }
                    }
                    
                    if(d.isFlipped) el.classList.add('is-flipped'); else el.classList.remove('is-flipped');
                    if(d.isRest) el.classList.add('rest'); else el.classList.remove('rest');
                    
                    // ⚡ FIX 3: 如果卡片正在我們的 Modal 裡面，我們絕對不要再套用 .in-life 讓它亂旋轉
                    if(d.inLife && !isInModal) el.classList.add('in-life'); else el.classList.remove('in-life');
                    
                    if(d.tilt) el.style.setProperty('--tilt', d.tilt);
                }
            });

            if(data.phase) document.getElementById('opp-phase-display').innerText = data.phase;
            
            document.querySelectorAll('.slot').forEach(el => el.classList.remove('marked'));
            if(data.markedSlots) {
                data.markedSlots.forEach(id => {
                    let localId = id.startsWith('my-') ? id.replace('my-', 'opp-') : id.replace('opp-', 'my-');
                    let slot = document.getElementById(localId);
                    if(slot) slot.classList.add('marked');
                });
            }

            if(data.bpStates) {
                document.querySelectorAll('#opp-front-line .slot').forEach(slot => {
                    let localId = slot.id.replace('opp-', 'my-');
                    let bpVal = data.bpStates[localId] || 0;
                    updateBpDisplay(slot, bpVal);
                });
            } else {
                document.querySelectorAll('#opp-front-line .slot').forEach(slot => updateBpDisplay(slot, 0));
            }

            recalcStacking(document.getElementById('opp-hand-area'));
            recalcStacking(document.getElementById('opp-look-area'));
            updateSlotCounts();
            updateLifeAreaHeight(document.getElementById('opp-life-area'));
            if (window.uaEngine) {
                if (data.kwStates && typeof window.uaEngine.applyOpponentKeywordBadgesMap === 'function') {
                    window.uaEngine.applyOpponentKeywordBadgesMap(data.kwStates);
                }
                if (typeof window.uaEngine.renderKeywordBadgesOnBoard === 'function') {
                    window.uaEngine.renderKeywordBadgesOnBoard();
                }
                if (typeof window.uaEngine.updatePublicInfoHUD === 'function') {
                    window.uaEngine.updatePublicInfoHUD();
                }
            }
        }

        function applyOpponentFlip(networkId) {
            let el = myCardsElements.find(c => c.dataset.networkId === networkId);
            if(el) {
                el.classList.toggle('is-flipped');
                broadcastMyState(); 
            }
        }

        function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
        function shuffleDOMDeck(deckArea) { let cards = Array.from(deckArea.querySelectorAll('.card')); shuffleArray(cards).forEach(c => deckArea.appendChild(c)); recalcStacking(deckArea); }

function createCardDOM(cardData, networkId, isMine) {
            ensureCatalogMap();
            let cardId = (typeof cardData === 'string') ? cardData : (cardData?.id || '');
            let localDef = window.cardCatalogById.get(cardId);

            // 優先使用本地圖鑑或已接收的對手自訂圖片；最後針對文字匯入卡號補上圖床 fallback
            let safeImgUrl = localDef ? localDef.imageUrl : '';
            if (!safeImgUrl && window.oppCustomImgMap && window.oppCustomImgMap.has(cardId)) {
                safeImgUrl = window.oppCustomImgMap.get(cardId);
            }
            if (!safeImgUrl && cardData && typeof cardData.imageUrl === 'string') {
                if (/^(https:\/\/|data:image\/)/i.test(cardData.imageUrl.trim())) {
                    safeImgUrl = cardData.imageUrl.trim();
                }
            }
            if (!safeImgUrl && cardId && !cardId.startsWith('CUSTOM_')) {
                safeImgUrl = `https://rugiacreation.com/ua/cardlist/small/${cardId.replace(/\//g, '_')}.jpg`;
            }

            let el = document.createElement("div");
            el.className = "card is-flipped";
            el.dataset.networkId = networkId;
            el.dataset.cardId = cardId;

            let inner = document.createElement("div");
            inner.className = "card-inner";

            let front = document.createElement("div");
            front.className = "card-front";

            let img = document.createElement("img");
            img.src = safeImgUrl; // 透過 DOM 屬性賦值，徹底根絕 XSS 注入

            let back = document.createElement("div");
            back.className = "card-back";

            front.appendChild(img);
            inner.appendChild(front);
            inner.appendChild(back);
            el.appendChild(inner);

            if(isMine) attachMyDragEvents(el);
            return el;
        }

        function initMyBoard(deck, apDeck) {
            myCardsElements.forEach(c => { if(c && c.parentNode) c.remove(); });
            myCardsElements = []; document.getElementById('my-deck-area').innerHTML = ''; 
            
            deck.forEach((card, i) => {
                let el = createCardDOM(card, `p_card_${i}`, true); myCardsElements.push(el); document.getElementById('my-deck-area').appendChild(el); el.style.left = '0px'; el.style.top = '0px';
            });
            let apSlots = document.querySelectorAll('#my-ap-area .slot');
            apSlots.forEach((slot, i) => {
                slot.innerHTML = ''; let apData = apDeck[i] || apDeck[0] || {imageUrl: "https://rugiacreation.com/ua/cardlist/small/UA44BT_EVA-1-AP03.jpg"};
                let apEl = createCardDOM(apData, `p_ap_${i}`, true); apEl.classList.add('ap-card');
                myCardsElements.push(apEl); slot.appendChild(apEl); apEl.style.left = '0px'; apEl.style.top = '0px';
            });
            updateSlotCounts(); broadcastMyState(); showSysMsg("發放起手牌..."); setTimeout(drawInitialHand, 800);
        }

        function initOpponentBoard(deck, apDeck) {
            oppCardsElements.forEach(c => { if(c && c.parentNode) c.remove(); });
            oppCardsElements = [];
            let oppDeckArea = document.getElementById('opp-deck-area');
            oppDeckArea.innerHTML = '';
            
            (deck || []).forEach((card, i) => {
                let el = createCardDOM(card, `p_card_${i}`, false);
                oppCardsElements.push(el);
                oppDeckArea.appendChild(el);
                el.style.left = '0px';
                el.style.top = '0px';
            });
            recalcStacking(oppDeckArea);

            let apSlots = document.querySelectorAll('#opp-ap-area .slot');
            apSlots.forEach((slot, i) => {
                Array.from(slot.querySelectorAll('.card')).forEach(c => c.remove());
                let apData = (apDeck && (apDeck[i] || apDeck[0])) || { id: 'UA44BT/EVA-1-AP03', imageUrl: 'https://rugiacreation.com/ua/cardlist/small/UA44BT_EVA-1-AP03.jpg' };
                let apEl = createCardDOM(apData, `p_ap_${i}`, false);
                apEl.classList.add('ap-card');
                oppCardsElements.push(apEl);
                slot.appendChild(apEl);
                apEl.style.left = '0px';
                apEl.style.top = '0px';
            });
            updateSlotCounts();

            // 若稍早已先收到對手的 SYNC_BOARD，立刻補套用，徹底消除競態條件
            if (window.pendingOppSyncData) {
                let cached = window.pendingOppSyncData;
                window.pendingOppSyncData = null;
                applyOpponentSync(cached);
            }
            
            if (isConnected && myCardsElements.length > 0) broadcastMyState(); 
        }

        function drawInitialHand() {
            let deckArea = document.getElementById('my-deck-area'), handArea = document.getElementById('my-hand-area'); let cards = Array.from(deckArea.querySelectorAll('.card'));
            for(let i=0; i<7; i++) { if(cards.length > 0) { let c = cards.pop(); handArea.appendChild(c); c.style.position = 'relative'; c.style.left = '0'; c.style.top = '0'; c.style.zIndex = ''; c.classList.remove('is-flipped', 'rest'); } }
            recalcStacking(deckArea); recalcStacking(handArea); updateSlotCounts(); broadcastMyState(); document.getElementById('mulligan-modal').style.display = 'block';
        }

        window.confirmHand = function() { document.getElementById('mulligan-modal').style.display = 'none'; setupLifeArea(); };
        window.executeMulligan = function() {
            document.getElementById('mulligan-modal').style.display = 'none'; let deckArea = document.getElementById('my-deck-area'), handArea = document.getElementById('my-hand-area');
            Array.from(handArea.querySelectorAll('.card')).forEach(c => { deckArea.appendChild(c); c.style.position = 'absolute'; c.classList.add('is-flipped'); });
            shuffleDOMDeck(deckArea); updateSlotCounts(); broadcastMyState(); showSysMsg("重新洗牌中...");
            setTimeout(() => {
                let cards = Array.from(deckArea.querySelectorAll('.card'));
                for(let i=0; i<7; i++) { if(cards.length > 0) { let c = cards.pop(); handArea.appendChild(c); c.style.position = 'relative'; c.style.left = '0'; c.style.top = '0'; c.style.zIndex = ''; c.classList.remove('is-flipped', 'rest'); } }
                recalcStacking(deckArea); recalcStacking(handArea); updateSlotCounts(); broadcastMyState(); setTimeout(setupLifeArea, 800);
            }, 600);
        };

        window.setupLifeArea = function setupLifeArea() {
            let deckArea = document.getElementById('my-deck-area'), lifeArea = document.getElementById('my-life-area'); let cards = Array.from(deckArea.querySelectorAll('.card'));
            for(let i=0; i<7; i++) { if(cards.length > 0) { let c = cards.pop(); lifeArea.appendChild(c); c.style.position = 'absolute'; c.classList.add('is-flipped'); } }
            recalcStacking(deckArea); recalcStacking(lifeArea); updateSlotCounts(); broadcastMyState(); showSysMsg("對戰開始！");
        };

        function applyStackingStyle(card, slotBelow, myIndex) {
            if (!slotBelow) return;
            card.style.zIndex = myIndex + 1;
            if (slotBelow.id !== 'my-hand-area') {
                card.style.removeProperty('--fan-rot');
                card.style.removeProperty('--fan-y');
            } 
            
            if (slotBelow.id.includes('hand') || slotBelow.id.includes('look') || slotBelow.id.includes('modal')) { 
                card.style.position = 'relative';
                card.style.left = '0px'; 
                card.style.top = '0px';
                card.classList.remove('in-life');
            }
            else {
                card.style.position = 'absolute';
                if (slotBelow.id.includes('deck') || slotBelow.id.includes('outside') || slotBelow.id.includes('remove') || slotBelow.id.includes('public') || slotBelow.id.includes('ap')) { 
                    card.style.left='0px'; card.style.top='0px'; 
                    card.classList.remove('in-life');
                }
                else if (slotBelow.id.includes('life')) { 
                    card.style.left = 'calc((var(--card-h) - var(--card-w)) / 2)'; 
                    card.style.top = `calc((var(--card-w) - var(--card-h)) / 2 + ${myIndex * 26}px)`; 
                    card.classList.add('in-life'); 
                    card.classList.remove('rest');
                }
                else if (slotBelow.classList.contains('slot')) { 
                    card.style.left=(myIndex*4)+'px'; card.style.top=(myIndex*12)+'px'; 
                    card.classList.remove('in-life');
                } 
            }
        }
        
        // 【修正】生命區容器原本用固定高度 (卡寬 + 160px) 預留給「理論上最多可能疊放的張數」，
        // 但實際生命卡數量比較少時，底下就會空出一大塊沒用到的空白。改成依實際卡片數量算出剛好的高度。
        function updateLifeAreaHeight(areaElement) {
            if (!areaElement || !areaElement.classList.contains('life-slot')) return;
            let count = areaElement.querySelectorAll('.card').length;
            if (count === 0) {
                areaElement.style.height = ''; // 沒有卡片時，交還給 CSS 的預設高度
            } else {
                areaElement.style.height = `calc(var(--card-w) + ${(count - 1) * 26}px + 6px)`;
            }
        }

        function recalcStacking(areaElement) { 
            if(!areaElement) return; 
            let cards = Array.from(areaElement.querySelectorAll('.card'));
            let isMyHand = areaElement.id === 'my-hand-area';
            let n = cards.length;
            let center = (n - 1) / 2;
            let stepDeg = n > 1 ? Math.min(2.6, 18 / n) : 0;
            cards.forEach((c, idx) => {
                applyStackingStyle(c, areaElement, idx);
                if (isMyHand) {
                    let offset = idx - center;
                    let fanRot = (offset * stepDeg).toFixed(2);
                    let fanY = (offset * offset * 1.8).toFixed(1);
                    c.style.setProperty('--fan-rot', `${fanRot}deg`);
                    c.style.setProperty('--fan-y', `${fanY}px`);
                } else {
                    c.style.removeProperty('--fan-rot');
                    c.style.removeProperty('--fan-y');
                }
            }); 
            updateLifeAreaHeight(areaElement);
        }

        function attachMyDragEvents(cardElement) {
            cardElement.clickTimeout = null;
            let viewportLayer = document.getElementById('board-viewport');

            function dragStart(event) {
                if (event.type === 'mousedown' && window.isTouchDevice) return;
                if (event.type === 'touchstart') window.isTouchDevice = true;
                if (event.type === 'mousedown' && event.button !== 0) return; 

                event.stopPropagation();
                
                // 【觸控優化】：標記目前被點選的卡片
                document.querySelectorAll('.active-touch').forEach(el => el.classList.remove('active-touch'));
                cardElement.classList.add('active-touch');
                window.activeCard = cardElement;
                
                let isDragging = false, isStackDrag = false, stackCardsData = [];
                let originalParent = cardElement.parentElement;
                
                clearTimeout(magnifyTimer); document.getElementById('card-magnifier').style.display = 'none';

                var longPressTimer = setTimeout(() => {
                    if(!isDragging && originalParent && originalParent.classList.contains('slot')) {
                        isStackDrag = true; originalParent.querySelectorAll('.card').forEach(c => c.classList.add('stack-glowing'));
                        if (navigator.vibrate) navigator.vibrate(50); 
                    }
                }, 300);

                let isTouch = event.type.includes('touch');
                let clientX = isTouch ? event.touches[0].clientX : event.clientX;
                let clientY = isTouch ? event.touches[0].clientY : event.clientY;
                
                clientX = clientX / (window.appScale || 1);
                clientY = clientY / (window.appScale || 1);
                
                cardElement.dataset.isSecretDrag = (originalParent && (originalParent.id.includes('hand') || originalParent.id.includes('look'))) ? 'true' : 'false';

                let dragThreshold = isTouch ? 15 : 6;
                let startClientX = clientX;
                let startClientY = clientY;

                function onMove(event) {
                    let curClientX = isTouch ? event.touches[0].clientX : event.clientX;
                    let curClientY = isTouch ? event.touches[0].clientY : event.clientY;
                    
                    curClientX = curClientX / (window.appScale || 1);
                    curClientY = curClientY / (window.appScale || 1);

                    if (!isDragging && (Math.abs(curClientX - startClientX) > dragThreshold || Math.abs(curClientY - startClientY) > dragThreshold)) {
                        isDragging = true; if(typeof longPressTimer !== 'undefined') clearTimeout(longPressTimer);
                        
                        if (isStackDrag) {
                            if (stackCardsData.length === 0) {
                                Array.from(originalParent.querySelectorAll('.card')).forEach(c => {
                                    stackCardsData.push({ el: c });
                                    viewportLayer.appendChild(c); 
                                    c.style.position = 'absolute'; c.classList.add('dragging'); c.classList.remove('in-life', 'stack-glowing'); 
                                    c.style.setProperty('--tilt', '0deg');
                                });
                            }
                        } else {
                            viewportLayer.appendChild(cardElement); 
                            cardElement.style.position = 'absolute';
                            cardElement.classList.add('dragging'); cardElement.classList.remove('in-life'); 
                            cardElement.style.setProperty('--tilt', '0deg');
                        }
                    }
                    if (isDragging) {
                        if (event.type.includes('touch') && event.cancelable) event.preventDefault(); 
                        
                        let viewportRect = viewportLayer.getBoundingClientRect();
                        
                        if (isStackDrag) {
                            stackCardsData.forEach((item, index) => { 
                                let localX = (curClientX - viewportRect.left/(window.appScale || 1)) - (item.el.offsetWidth / 2) + (index * 8);
                                let localY = (curClientY - viewportRect.top/(window.appScale || 1)) - (item.el.offsetHeight / 2) + (index * 8);
                                item.el.style.left = localX + 'px'; item.el.style.top = localY + 'px'; 
                                item.el.style.transform = `scale(${window.boardScale * 1.05})`; 
                            });
                        } else { 
                            let localX = (curClientX - viewportRect.left/(window.appScale || 1)) - (cardElement.offsetWidth / 2);
                            let localY = (curClientY - viewportRect.top/(window.appScale || 1)) - (cardElement.offsetHeight / 2);
                            cardElement.style.left = localX + 'px'; cardElement.style.top = localY + 'px'; 
                            cardElement.style.transform = `scale(${window.boardScale * 1.05})`; 
                        }
                        // 【修改這裡】：加入網路廣播節流 (Throttle)，限制每 50 毫秒最多發送一次
                        if (!cardElement.broadcastTimeout) {
                            cardElement.broadcastTimeout = setTimeout(() => {
                                broadcastMyState();
                                cardElement.broadcastTimeout = null;
                            }, 50); // 約 20 FPS 的同步率，非常順暢且不卡頓
                        }
                    }
                }

                function onEnd(event) {
                    document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onEnd);
                    document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd);
                    if(typeof longPressTimer !== 'undefined') clearTimeout(longPressTimer);

                    if (isTouch && event.cancelable) event.preventDefault();

                    if (!isDragging) {
                        delete cardElement.dataset.isSecretDrag;
                        
                        if(originalParent) originalParent.querySelectorAll('.card').forEach(c => c.classList.remove('stack-glowing'));
                        
                        let noRestZones = ['hand', 'look', 'outside', 'deck', 'remove', 'public'];
                        let canRest = !noRestZones.some(z => originalParent.id.includes(z));
                        
                        if (isTouch) {
                            let currentTime = new Date().getTime();
                            let tapLength = currentTime - (cardElement.lastTapTime || 0);
                            cardElement.lastTapTime = currentTime;

                            if (tapLength < 300 && tapLength > 0) {
                                clearTimeout(cardElement.singleTapTimeout);
                                cardElement.classList.toggle('is-flipped');
                                broadcastMyState();
                                if(typeof playSound === 'function') playSound('turn'); 
                            } else {
                                cardElement.singleTapTimeout = setTimeout(() => {
                                    if (!cardElement.classList.contains('in-life') && canRest) {
                                        cardElement.classList.toggle("rest");
                                        broadcastMyState();
                                    }
                                }, 250);
                            }
                        } else {
                            if (!cardElement.classList.contains('in-life') && canRest) {
                                cardElement.classList.toggle("rest");
                                broadcastMyState();
                            }
                        }
                    } else {
                        let endX = event.type.includes('touch') ? event.changedTouches[0].clientX : event.clientX;
                        let endY = event.type.includes('touch') ? event.changedTouches[0].clientY : event.clientY;
                        
                        let cardsToDrop = isStackDrag ? stackCardsData.map(item => item.el) : [cardElement];
                        
                        cardsToDrop.forEach(c => { c.style.display = 'none'; c.style.transform = ''; }); 
                        let elemBelow = document.elementFromPoint(endX, endY);
                        cardsToDrop.forEach(c => c.style.display = 'block'); 
                        
                        let dropZone = elemBelow ? elemBelow.closest('.slot, .hand-area, .look-area, #modal-cards-container, #modal-public-container') : null;
                        
                        if(dropZone && dropZone.id.includes('opp-')) dropZone = null;
                        
                        if (!dropZone) { finalizeDrop(cardsToDrop, null, 'cancel', originalParent, endX); return; }

                        let isDropFieldSlot = dropZone && dropZone.closest('#my-front-line, #my-energy-line');
                        let hasExistingCards = isDropFieldSlot && dropZone.querySelectorAll('.card').length > 0;
                        let isSameSlot = originalParent === dropZone;

                        if (isDropFieldSlot && hasExistingCards && !isSameSlot && !(window.uaEngine && window.uaEngine.enabled)) {
                            let menu = document.getElementById('drop-menu');
                            let canvasRect = document.getElementById('app-canvas').getBoundingClientRect();
                            let localX = (endX - canvasRect.left) / (window.appScale || 1);
                            let localY = (endY - canvasRect.top) / (window.appScale || 1);
                            
                            menu.style.left = (localX + 15) + 'px'; 
                            menu.style.top = (localY + 15) + 'px';
                            menu.style.display = 'flex'; 
                            window.pendingDrop = { cards: cardsToDrop, dropZone: dropZone, originalParent: originalParent, endX: endX };
                        } else finalizeDrop(cardsToDrop, dropZone, 'default', originalParent, endX);
                    }
                }
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onEnd);
                document.addEventListener('touchmove', onMove, {passive: false}); document.addEventListener('touchend', onEnd);
            }
            cardElement.onmousedown = dragStart; cardElement.ontouchstart = dragStart; cardElement.ondragstart = function() { return false; };
        }

        function finalizeDrop(cards, dropZone, action, originalParent, endX) {
            let processCards = (action.startsWith('bottom')) ? [...cards].reverse() : cards;

            processCards.forEach(c => {
                c.classList.remove('dragging', 'stack-glowing');
                delete c.dataset.isSecretDrag; 

                if (dropZone && action !== 'cancel') {
                    if (action === 'top-faceup') { dropZone.appendChild(c); c.classList.remove('is-flipped', 'rest'); dropZone.querySelectorAll('.card').forEach(cardInSlot => cardInSlot.classList.remove('rest')); } 
                    else if (action === 'bottom-facedown') { dropZone.insertBefore(c, dropZone.firstChild); c.classList.add('is-flipped'); c.classList.remove('rest'); } 
                    else if (action === 'bottom-faceup') { dropZone.insertBefore(c, dropZone.firstChild); c.classList.remove('is-flipped', 'rest'); } 
                    else {
                        if (dropZone.id.includes('hand') || dropZone.id.includes('look') || dropZone.id.includes('modal-')) {
                            let siblings = Array.from(dropZone.querySelectorAll('.card:not(.dragging)'));
                            let inserted = false;
                            if (endX !== undefined) {
                                for (let sibling of siblings) {
                                    if (sibling === c) continue;
                                    let rect = sibling.getBoundingClientRect();
                                    if (endX < rect.left + rect.width / 2) {
                                        dropZone.insertBefore(c, sibling);
                                        inserted = true; break;
                                    }
                                }
                            }
                            if (!inserted) dropZone.appendChild(c); 
                        } else {
                            dropZone.appendChild(c);
                        }

                        if (dropZone.id.includes('deck')) { 
                            if (originalParent && originalParent.id.includes('public')) c.classList.remove('is-flipped'); else c.classList.add('is-flipped'); 
                            
                            // 自動判定放置位置並公播
                            let isBottom = (action === 'bottom-facedown' || action === 'bottom-faceup');
                            let actionTxt = isBottom ? "底部" : "頂部";
                            sendSystemChat(`[系統動作] 對手將卡片放置於牌組【${actionTxt}】。`);
                        }
                        else if (dropZone.id.includes('public') || dropZone.id.includes('modal-public')) c.classList.remove('is-flipped');
                        
                        if (dropZone.id.includes('outside') || dropZone.id.includes('remove') || dropZone.id.includes('deck') || dropZone.id.includes('public')) {
                            c.classList.remove('rest');
                        } else if (dropZone.closest('#my-front-line, #my-energy-line')) { let fromField = originalParent && originalParent.closest('#my-front-line, #my-energy-line'); if (!fromField) c.classList.add('rest'); }
                    }
                    if(dropZone.id.includes('hand') || dropZone.id.includes('look') || dropZone.id.includes('modal-')) { 
                        c.style.position = 'relative'; c.style.left = '0'; c.style.top = '0'; 
                        c.style.zIndex = ''; 
                        c.classList.remove('is-flipped', 'rest'); 
                    } 
                    else c.style.position = 'absolute'; 
                } else if (originalParent) {
                    originalParent.appendChild(c);
                    if(originalParent.id.includes('hand') || originalParent.id.includes('look')) { c.style.position = 'relative'; c.style.left = '0'; c.style.top = '0'; } 
                    else c.style.position = 'absolute';
                }
            });
            if (dropZone && action !== 'cancel' && !dropZone.id.includes('modal-')) recalcStacking(dropZone); 
            else if (originalParent && !originalParent.id.includes('modal-')) recalcStacking(originalParent);
            updateSlotCounts(); broadcastMyState();
            
            if (action !== 'cancel' && typeof playSound === 'function') {
                playSound('play');
            }
        }

        function updateSlotCounts() { document.querySelectorAll('.slot').forEach(slot => { slot.setAttribute('data-count', slot.querySelectorAll('.card').length); }); }

        let hoveredCard = null, hoveredSlot = null, magnifyTimer = null;
        document.addEventListener('mouseover', e => {
            let card = e.target.closest('.card');
            let previewCard = e.target.closest('.preview-card'); 
            let slot = e.target.closest('.slot'); 
            if(slot) hoveredSlot = slot;
            
            if(card || previewCard) {
                hoveredCard = card; 
                clearTimeout(magnifyTimer);
                magnifyTimer = setTimeout(() => {
                    let imgSrc = "";
                    if(card) {
                        if(card.parentElement && (card.parentElement.id.includes('opp-hand') || card.parentElement.id.includes('opp-look'))) return;
                        if(card.classList.contains('is-flipped')) return;
                        let frontImg = card.querySelector('.card-front img');
                        if(frontImg) imgSrc = frontImg.src;
                    } else if (previewCard) {
                        let img = previewCard.querySelector('img');
                        if(img) imgSrc = img.src;
                    }

                    let magView = document.getElementById('card-magnifier'), magImg = document.getElementById('magnifier-img');
                    if(imgSrc && magView && magImg) { 
                        magImg.src = imgSrc; 
                        magView.style.display = 'block'; 
                    }
                }, 600); 
            }
        });
        document.addEventListener('mouseout', e => { 
            let card = e.target.closest('.card'); 
            let previewCard = e.target.closest('.preview-card');
            if(card || previewCard) { 
                if(card && card === hoveredCard) hoveredCard = null; 
                clearTimeout(magnifyTimer); 
                let magView = document.getElementById('card-magnifier'); 
                if(magView) magView.style.display = 'none'; 
            }
            let slot = e.target.closest('.slot'); 
            if(slot === hoveredSlot) hoveredSlot = null; 
        });

        document.addEventListener('keydown', e => {
            if(document.getElementById('game-scene').style.display === 'none') return;
            if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            let key = e.key.toLowerCase();

            if ((e.ctrlKey || e.metaKey) && key === 'z') {
                e.preventDefault();
                undoLastAction();
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                if(confirm("確定要結束回合嗎？")) { 
                    endTurn(); 
                    playSound('turn'); 
                }
                return;
            }

            if (key === 'd') {
                let deckArea = document.getElementById('my-deck-area');
                let cards = Array.from(deckArea.querySelectorAll('.card'));
                if (cards.length > 0) {
                    let cardToDraw = cards[cards.length - 1]; 
                    let handArea = document.getElementById('my-hand-area');
                    handArea.appendChild(cardToDraw);
                    cardToDraw.style.position = 'relative'; cardToDraw.style.left = '0'; cardToDraw.style.top = '0'; cardToDraw.style.transform = 'none';
                    cardToDraw.classList.remove('is-flipped', 'rest', 'in-life');
                    recalcStacking(deckArea); recalcStacking(handArea); updateSlotCounts(); broadcastMyState(); 
                    
                    playSound('draw'); 
                    showCenterAlert('', '抽牌', 'Draw!', '#6fb897');
                }
                return;
            }
            
            if (key === 'r') {
                let isHoveringDeck = hoveredSlot && hoveredSlot.id === 'my-deck-area';
                if (isHoveringDeck || !hoveredCard) {
                    let deckArea = document.getElementById('my-deck-area');
                    let cards = Array.from(deckArea.querySelectorAll('.card'));
                    if(cards.length > 1) {
                        cards.forEach(c => {
                            let rx = (Math.random() - 0.5) * 60;
                            let ry = (Math.random() - 0.5) * 60;
                            let rr = (Math.random() - 0.5) * 45;
                            c.style.transition = 'transform 0.2s ease-out';
                            c.style.transform = `translate(${rx}px, ${ry}px) rotate(${rr}deg)`;
                        });
                        showCenterAlert('🔀', '洗牌中', 'Shuffling', '#6c93c7');
                        if(conn && isConnected) conn.send({ type: 'SHUFFLE_DECK' });
                        
                        setTimeout(() => {
                            cards.forEach(c => c.style.transform = '');
                            shuffleDOMDeck(deckArea);
                            broadcastMyState();
                        }, 400);
                    }
                    return; 
                }
                
                if (hoveredCard && !hoveredCard.parentElement.id.includes('opp-')) {
                    let pId = hoveredCard.parentElement ? hoveredCard.parentElement.id : '';
                    let noRestZones = ['hand', 'look', 'outside', 'deck', 'remove', 'public'];
                    if (!hoveredCard.classList.contains('in-life') && !noRestZones.some(z => pId.includes(z))) {
                        hoveredCard.classList.toggle('rest'); broadcastMyState(); 
                    }
                }
            }

            if(hoveredCard && !hoveredCard.parentElement.id.includes('opp-')) {
                if(key === 'f') { 
                    hoveredCard.classList.toggle('is-flipped'); 
                    broadcastMyState(); 
                    if(typeof playSound === 'function') playSound('turn'); 
                }

                if(key === 'b' || key === 't') {
                    let dest = document.getElementById('my-deck-area');
                    if (key === 'b') dest.insertBefore(hoveredCard, dest.firstChild); 
                    else dest.appendChild(hoveredCard); 
                    
                    hoveredCard.classList.add('is-flipped');
                    hoveredCard.classList.remove('rest', 'in-life');
                    hoveredCard.style.setProperty('--tilt', '0deg');
                    
                    let prevParent = hoveredCard.parentElement;
                    recalcStacking(dest);
                    if(prevParent) recalcStacking(prevParent);
                    
                    updateSlotCounts();
                    broadcastMyState();
                    
                    // 【新增】：快捷鍵操作也要觸發全域公播訊息
                    let actionTxt = (key === 'b') ? "底部" : "頂部";
                    sendSystemChat(`[系統動作] 對手將卡片放回牌組【${actionTxt}】。`);
                }

                if(key === 'c' || key === 'v' || key === 'g' || key === 'n') {
                    let targetCard = hoveredCard || (hoveredSlot ? hoveredSlot.querySelectorAll('.card')[hoveredSlot.querySelectorAll('.card').length-1] : null);
                    if(targetCard) {
                        let destId = 'my-outside-area';
                        if (key === 'c') destId = 'my-hand-area';
                        else if (key === 'g') destId = 'my-look-area';
                        else if (key === 'n') destId = 'my-remove-area'; 

                        let dest = document.getElementById(destId);
                        let prevParent = targetCard.parentElement;
                        dest.appendChild(targetCard); 
                        targetCard.classList.remove('rest', 'is-flipped');
                        targetCard.style.setProperty('--tilt', '0deg');

                        if(dest.id.includes('hand') || dest.id.includes('look')) {
                            targetCard.style.position = 'relative';
                            targetCard.style.zIndex = ''; 
                        } else { 
                            targetCard.style.position = 'absolute'; 
                            applyStackingStyle(targetCard, dest, Array.from(dest.querySelectorAll('.card')).indexOf(targetCard)); 
                        }
                        recalcStacking(dest);
                        if(prevParent) recalcStacking(prevParent);
                        updateSlotCounts(); broadcastMyState();
                        
                        if (key === 'c') playSound('draw');
                        else playSound('play');
                    }
                }
            }
        });

        document.getElementById('btn-top-faceup').addEventListener('click', () => { if(window.pendingDrop) finalizeDrop(window.pendingDrop.cards, window.pendingDrop.dropZone, 'top-faceup', window.pendingDrop.originalParent, window.pendingDrop.endX); document.getElementById('drop-menu').style.display = 'none'; window.pendingDrop = null; });
        document.getElementById('btn-bottom-facedown').addEventListener('click', () => { if(window.pendingDrop) finalizeDrop(window.pendingDrop.cards, window.pendingDrop.dropZone, 'bottom-facedown', window.pendingDrop.originalParent, window.pendingDrop.endX); document.getElementById('drop-menu').style.display = 'none'; window.pendingDrop = null; });
        document.getElementById('btn-bottom-faceup').addEventListener('click', () => { if(window.pendingDrop) finalizeDrop(window.pendingDrop.cards, window.pendingDrop.dropZone, 'bottom-faceup', window.pendingDrop.originalParent, window.pendingDrop.endX); document.getElementById('drop-menu').style.display = 'none'; window.pendingDrop = null; });
        document.getElementById('btn-cancel-drop').addEventListener('click', () => { if(window.pendingDrop) finalizeDrop(window.pendingDrop.cards, null, 'cancel', window.pendingDrop.originalParent, window.pendingDrop.endX); document.getElementById('drop-menu').style.display = 'none'; window.pendingDrop = null; });
        // ===== 觸控面板操作功能 =====
        window.executeTouchAction = function(key) {
            let targetCard = window.activeCard;
            if (!targetCard) return showSysMsg("請先點選一張要操作的卡片");
            if (targetCard.parentElement && targetCard.parentElement.id.includes('opp-')) return showSysMsg("無法操作對手的卡片");

            if (key === 'f') {
                targetCard.classList.toggle('is-flipped'); 
                broadcastMyState(); 
                if(typeof playSound === 'function') playSound('turn'); 
            }
            else if (key === 'r') {
                let pId = targetCard.parentElement ? targetCard.parentElement.id : '';
                let noRestZones = ['hand', 'look', 'outside', 'deck', 'remove', 'public'];
                if (!targetCard.classList.contains('in-life') && !noRestZones.some(z => pId.includes(z))) {
                    targetCard.classList.toggle('rest'); broadcastMyState(); 
                }
            }
            else if (key === 'b' || key === 't') {
                let dest = document.getElementById('my-deck-area');
                if (key === 'b') dest.insertBefore(targetCard, dest.firstChild); 
                else dest.appendChild(targetCard); 
                
                targetCard.classList.add('is-flipped');
                targetCard.classList.remove('rest', 'in-life');
                targetCard.style.setProperty('--tilt', '0deg');
                
                let prevParent = targetCard.parentElement;
                recalcStacking(dest);
                if(prevParent) recalcStacking(prevParent);
                
                updateSlotCounts(); broadcastMyState();
                
                let actionTxt = (key === 'b') ? "底部" : "頂部";
                sendSystemChat(`[系統動作] 對手將卡片放回牌組【${actionTxt}】。`);
            }
            else if (key === 'c' || key === 'v' || key === 'g' || key === 'n') {
                let destId = 'my-outside-area';
                if (key === 'c') destId = 'my-hand-area';
                else if (key === 'g') destId = 'my-look-area';
                else if (key === 'n') destId = 'my-remove-area'; 

                let dest = document.getElementById(destId);
                let prevParent = targetCard.parentElement;
                dest.appendChild(targetCard); 
                targetCard.classList.remove('rest', 'is-flipped');
                targetCard.style.setProperty('--tilt', '0deg');

                if(dest.id.includes('hand') || dest.id.includes('look')) {
                    targetCard.style.position = 'relative'; targetCard.style.zIndex = ''; 
                } else { 
                    targetCard.style.position = 'absolute'; 
                    applyStackingStyle(targetCard, dest, Array.from(dest.querySelectorAll('.card')).indexOf(targetCard)); 
                }
                recalcStacking(dest);
                if(prevParent) recalcStacking(prevParent);
                updateSlotCounts(); broadcastMyState();
                
                if (key === 'c') playSound('draw'); else playSound('play');
            }
        };

        window.executeGlobalTouch = function(action) {
            let deckArea = document.getElementById('my-deck-area');
            let cards = Array.from(deckArea.querySelectorAll('.card'));
            
            if (action === 'd' && cards.length > 0) {
                let cardToDraw = cards[cards.length - 1]; 
                let handArea = document.getElementById('my-hand-area');
                handArea.appendChild(cardToDraw);
                cardToDraw.style.position = 'relative'; cardToDraw.style.left = '0'; cardToDraw.style.top = '0'; cardToDraw.style.transform = 'none';
                cardToDraw.classList.remove('is-flipped', 'rest', 'in-life');
                recalcStacking(deckArea); recalcStacking(handArea); updateSlotCounts(); broadcastMyState(); 
                
                playSound('draw'); showCenterAlert('', '抽牌', 'Draw!', '#6fb897');
            } else if (action === 'shuffle' && cards.length > 1) {
                cards.forEach(c => {
                    let rx = (Math.random() - 0.5) * 60; let ry = (Math.random() - 0.5) * 60; let rr = (Math.random() - 0.5) * 45;
                    c.style.transition = 'transform 0.2s ease-out';
                    c.style.transform = `translate(${rx}px, ${ry}px) rotate(${rr}deg)`;
                });
                showCenterAlert('🔀', '洗牌中', 'Shuffling', '#6c93c7');
                if(conn && isConnected) conn.send({ type: 'SHUFFLE_DECK' });
                
                setTimeout(() => {
                    cards.forEach(c => c.style.transform = '');
                    shuffleDOMDeck(deckArea); broadcastMyState();
                }, 400);
            }
        };
        // ============================

        window.sendToDeck = function(sourceId, destId, toBottom) {
            let source = document.getElementById(sourceId), dest = document.getElementById(destId); 
            let cards = Array.from(source.querySelectorAll('.card')).sort((a,b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
            
            if(toBottom) {
                cards.reverse().forEach(c => { dest.insertBefore(c, dest.firstChild); c.classList.add('is-flipped'); c.classList.remove('rest'); c.style.position = 'absolute'; });
            } else {
                cards.forEach(c => { dest.appendChild(c); c.classList.add('is-flipped'); c.classList.remove('rest'); c.style.position = 'absolute'; });
            }
            
            recalcStacking(dest); recalcStacking(source); updateSlotCounts(); broadcastMyState();
            
            // 全域公播訊息
            let actionTxt = toBottom ? "底部" : "頂部";
            sendSystemChat(`[系統動作] 對手將卡片放回牌組【${actionTxt}】。`);
        };

        const modal = document.getElementById('search-modal'), modalContainer = document.getElementById('modal-cards-container'), modalTitle = document.getElementById('modal-title');
        let currentModalSourceSlot = null;
        
        document.querySelectorAll('#my-outside-area, #my-remove-area, #my-life-area, #my-public-area, #opp-outside-area, #opp-remove-area, #opp-life-area, #opp-public-area, #my-front-line .slot, #my-energy-line .slot, #opp-front-line .slot, #opp-energy-line .slot').forEach(zone => {
            zone.addEventListener('contextmenu', e => {
                e.preventDefault(); 
                let cards = Array.from(zone.querySelectorAll('.card')); 
                if (cards.length === 0 && !zone.id.includes('outside') && !zone.id.includes('public') && !zone.id.includes('life')) return; 
                currentModalSourceSlot = zone;
                
                if(zone.id.includes('outside')) modalTitle.innerText = `檢索中：場外 (${cards.length}張)`;
                else if(zone.id.includes('remove')) modalTitle.innerText = `檢索中：移除區 (${cards.length}張)`;
                else if(zone.id.includes('public')) modalTitle.innerText = `檢索中：公開區 (${cards.length}張)`;
                else if(zone.id.includes('life')) modalTitle.innerText = `檢索中：生命區 (${cards.length}張) (點擊可翻開)`;
                else if(zone.id.includes('fl-') || zone.id.includes('en-')) modalTitle.innerText = `檢索中：場上疊牌 (${cards.length}張)`;
                
                let isDualPane = zone.id === 'my-outside-area' || zone.id === 'my-life-area' || (zone.classList.contains('slot') && (zone.id.includes('my-fl-') || zone.id.includes('my-en-')));
                
                if(isDualPane) {
                    document.getElementById('secondary-modal-header').style.display = 'flex';
                    document.getElementById('modal-public-container').style.display = 'flex';
                    Array.from(document.getElementById('my-public-area').querySelectorAll('.card')).forEach(c => {
                        document.getElementById('modal-public-container').appendChild(c);
                        c.classList.remove('in-life', 'rest', 'is-flipped'); c.style.position = 'relative'; c.style.left = '0'; c.style.top = '0'; c.style.transform = 'none';
                        c.style.zIndex = '';
                    });
                }
                
                cards.forEach(card => { 
                    modalContainer.appendChild(card); 
                    if(!zone.id.includes('life') && !zone.id.includes('opp-')) card.classList.remove('is-flipped'); else if (zone.id.includes('life')) card.classList.add('is-flipped'); 
                    card.classList.remove('rest', 'in-life'); 
                    card.style.position = 'relative'; card.style.left = '0px'; card.style.top = '0px'; card.style.transform = 'none';
                    card.style.zIndex = '';
                });
                modal.style.display = 'flex';
            });
        });

        modalContainer.addEventListener('click', e => {
            let card = e.target.closest('.card');
            if(!card) return;

            if(currentModalSourceSlot && currentModalSourceSlot.id.includes('life')) {
                card.classList.toggle('is-flipped');
                if (myCardsElements.includes(card)) {
                    broadcastMyState();
                    if (!card.classList.contains('is-flipped')) {
                        if(typeof playSound === 'function') playSound('turn');
                    }
                } else {
                    if (conn) conn.send({ type: 'FLIP_CARD', id: card.dataset.networkId });
                }
            }
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            Array.from(modalContainer.querySelectorAll('.card')).forEach((card, index) => { 
                currentModalSourceSlot.appendChild(card); 
                card.style.position = 'absolute'; 
                card.style.transform = ''; 
                
                if (currentModalSourceSlot.classList.contains('slot') && (currentModalSourceSlot.id.includes('my-fl-') || currentModalSourceSlot.id.includes('my-en-'))) {
                    let randomTilt = (Math.random() * 7 - 3.5).toFixed(1);
                    card.style.setProperty('--tilt', `${randomTilt}deg`);
                }
                
                applyStackingStyle(card, currentModalSourceSlot, index); 
            });
            
            let isDualPane = currentModalSourceSlot && (currentModalSourceSlot.id === 'my-outside-area' || currentModalSourceSlot.id === 'my-life-area' || (currentModalSourceSlot.classList.contains('slot') && (currentModalSourceSlot.id.includes('my-fl-') || currentModalSourceSlot.id.includes('my-en-'))));
            
            if (isDualPane) {
                Array.from(document.getElementById('modal-public-container').querySelectorAll('.card')).forEach((card, index) => { 
                    document.getElementById('my-public-area').appendChild(card); 
                    card.style.position = 'absolute'; 
                    card.style.transform = ''; 
                    applyStackingStyle(card, document.getElementById('my-public-area'), index); 
                });
                document.getElementById('secondary-modal-header').style.display = 'none';
                document.getElementById('modal-public-container').style.display = 'none';
            }
            modal.style.display = 'none'; currentModalSourceSlot = null; updateSlotCounts(); broadcastMyState();
        });
// README 說明書的開關事件
        document.getElementById('btn-show-readme').addEventListener('click', () => {
            document.getElementById('readme-modal').style.display = 'flex';
        });
        document.getElementById('close-readme-btn').addEventListener('click', () => {
            document.getElementById('readme-modal').style.display = 'none';
        });
        // 點擊 Modal 半透明背景也可關閉
        document.getElementById('readme-modal').addEventListener('click', (e) => {
            if (e.target.id === 'readme-modal') {
                document.getElementById('readme-modal').style.display = 'none';
            }
        });

        window.generatePrintLayout = async function() {
            let allPrintCards = [...myDeckData, ...myApData];
            if (allPrintCards.length === 0) return alert("牌組目前是空的，無法列印喔！");
            
            let printArea = document.getElementById('print-area');
            printArea.innerHTML = ''; 
            printArea.style.display = 'block';
            
            const CARDS_PER_PAGE = 9;
            let imgPromises = []; // 用來追蹤所有圖片的載入狀態
            
            for (let i = 0; i < allPrintCards.length; i += CARDS_PER_PAGE) {
                let pageCards = allPrintCards.slice(i, i + CARDS_PER_PAGE);
                let pageDiv = document.createElement('div'); 
                pageDiv.className = 'print-page';
                
                pageCards.forEach(card => {
                    let cardDiv = document.createElement('div'); 
                    cardDiv.className = 'print-card';
                    
                    let img = new Image();
                    img.src = card.imageUrl;
                    
                    // 把每張圖片的載入事件包裝成 Promise
                    imgPromises.push(new Promise((resolve) => {
                        img.onload = resolve;
                        img.onerror = resolve; // 就算單張圖破圖也繼續，避免整個當掉
                    }));
                    
                    cardDiv.appendChild(img);
                    pageDiv.appendChild(cardDiv);
                });
                printArea.appendChild(pageDiv);
            }

            showSysMsg("正在下載 50+ 張卡圖，請稍候幾秒鐘...");
            
            // 🌟 關鍵：強制等待所有圖片都真正下載並渲染完畢
            await Promise.all(imgPromises);

            showSysMsg("卡圖載入完成！準備列印...");
            
            // 給瀏覽器一點緩衝時間重繪畫面再彈出列印視窗
            setTimeout(() => {
                window.print();
                // 視窗關閉後清理 DOM
                setTimeout(() => { printArea.style.display = 'none'; printArea.innerHTML = ''; }, 1000);
            }, 500);
        };

// ===== UA 卡片腳本合併檔載入器 =====
        window.UACardScripts = window.UACardScripts || {};
        window.registerCardScripts = function (map) {
            if (map && typeof map === 'object') Object.assign(window.UACardScripts, map);
        };
        (function loadCardScriptsBundle() {
            const s = document.createElement('script');
            s.src = encodeURI('腳本.js');
            s.async = false;
            s.onerror = () => console.warn('載入 腳本.js 失敗，請確認檔案位於專案根目錄');
            document.body.appendChild(s);
        })();
