/**
 * NCHUCGC 第二階段：Firebase 帳號登入、即時多房間對戰大廳與牌組雲端同步 (firebase-lobby.js)
 * 設計原則：
 * - 若尚未填入 firebase-config.js，自動降級為純 PeerJS 手動輸入代碼模式，不影響現有對戰。
 * - 大廳僅透過 Realtime Database 交換房主的 PeerJS ID，實際對戰維持 P2P 連線以節省資料庫流量。
 */
(function () {
    const state = {
        ready: false,
        auth: null,
        db: null,
        user: null,
        myHostedRoomRef: null,
        myHostedRoomId: null,
        roomsMap: {}
    };

    function isConfigFilled(cfg) {
        return !!(cfg && cfg.apiKey && cfg.apiKey !== 'YOUR_API_KEY' && cfg.databaseURL && !cfg.databaseURL.includes('YOUR_PROJECT_ID'));
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
    }

    function updateAuthUI() {
        const authBox = document.getElementById('nav-auth-box');
        if (!authBox) return;
        if (!state.ready) {
            authBox.innerHTML = `<span style="font-size:12px; color:#8c93ad;">離線大廳模式</span>`;
            return;
        }
        if (state.user) {
            const name = escapeHtml(state.user.displayName || '社員');
            authBox.innerHTML = `
                <span style="font-size:13px; color:#d1c4e9; font-weight:700;">${name}</span>
                <button class="ctrl-btn" id="btn-fb-logout" style="background:#313456; padding:5px 10px; font-size:12px;">登出</button>
            `;
            document.getElementById('btn-fb-logout').onclick = () => state.auth.signOut();
        } else {
            authBox.innerHTML = `
                <button class="ctrl-btn" id="btn-fb-login" style="background:#4f739e; padding:6px 12px; font-size:12px;">Google 登入</button>
            `;
            document.getElementById('btn-fb-login').onclick = () => {
                const provider = new firebase.auth.GoogleAuthProvider();
                state.auth.signInWithPopup(provider).catch(err => {
                    console.error('Google 登入失敗:', err);
                    showSysMsg('登入失敗，請確認已於 Firebase 啟用 Google 登入並加入網域白名單。');
                });
            };
        }
    }

    function renderRoomList() {
        const listBox = document.getElementById('lobby-room-list');
        const statusBanner = document.getElementById('lobby-fb-status');
        if (!listBox) return;

        if (!state.ready) {
            if (statusBanner) {
                statusBanner.style.display = 'block';
                statusBanner.textContent = '尚未設定 firebase-config.js，目前為單機／手動代碼連線模式。請先完成 Firebase 設定以啟用即時多房間大廳。';
            }
            listBox.innerHTML = `<div class="lobby-empty">填入 Firebase 設定後，此處將即時顯示所有線上對戰房間。</div>`;
            return;
        }

        if (statusBanner) statusBanner.style.display = 'none';

        const rooms = Object.entries(state.roomsMap || {})
            .map(([id, r]) => ({ id, ...r }))
            .filter(r => r && r.peerId)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (rooms.length === 0) {
            listBox.innerHTML = `<div class="lobby-empty">目前沒有等待中的房間，點擊上方「建立對戰房間」開始配對。</div>`;
            return;
        }

        listBox.innerHTML = '';
        rooms.forEach(room => {
            const isMine = room.peerId === window.myRoomId;
            const isPlaying = room.status === 'playing';
            const modeLabel = room.mode === 'auto' ? '全自動規則' : '沙盒手動';
            const lockLabel = room.hasPassword ? '密碼房' : '公開';

            const row = document.createElement('div');
            row.className = 'lobby-room-card' + (isPlaying ? ' is-playing' : '');
            row.innerHTML = `
                <div class="room-main">
                    <div class="room-title">${escapeHtml(room.roomName || '未命名房間')}</div>
                    <div class="room-meta">
                        <span>房主：${escapeHtml(room.hostName || '匿名玩家')}</span>
                        <span>模式：${modeLabel}</span>
                        <span>狀態：${isPlaying ? '對戰中 (2/2)' : '等待中 (1/2)'}</span>
                        <span>${lockLabel}</span>
                    </div>
                </div>
                <div class="room-actions">
                    ${isMine
                        ? `<button class="ctrl-btn danger btn-close-room">關閉房間</button>`
                        : `<button class="start-btn btn-join-room" ${isPlaying ? 'disabled' : ''}>${isPlaying ? '對戰中' : '加入對戰'}</button>`
                    }
                </div>
            `;

            const closeBtn = row.querySelector('.btn-close-room');
            if (closeBtn) {
                closeBtn.onclick = () => closeMyHostedRoom();
            }

            const joinBtn = row.querySelector('.btn-join-room');
            if (joinBtn && !isPlaying) {
                joinBtn.onclick = () => {
                    if (room.hasPassword) {
                        const pin = prompt('此房間設有密碼，請輸入房間密碼：');
                        if (pin === null) return;
                        if (pin.trim() !== String(room.pin || '')) {
                            showSysMsg('房間密碼錯誤。');
                            return;
                        }
                    }
                    const targetInput = document.getElementById('target-id');
                    const connectBtn = document.getElementById('btn-connect');
                    if (targetInput && connectBtn) {
                        targetInput.value = room.peerId;
                        connectBtn.click();
                        // 標記房間為對戰中
                        if (state.db) {
                            state.db.ref(`rooms/${room.id}/status`).set('playing').catch(() => {});
                        }
                        showSysMsg(`正在連線至「${room.roomName}」...`);
                    }
                };
            }

            listBox.appendChild(row);
        });
    }

    function createHostedRoom() {
        if (!state.ready) {
            showSysMsg('請先於 firebase-config.js 填入 Firebase 設定。');
            return;
        }
        const myPeerId = document.getElementById('my-peer-id')?.textContent?.trim();
        if (!myPeerId || myPeerId === '產生中...') {
            showSysMsg('正在取得 PeerJS 連線代碼，請稍候 1 秒再試。');
            return;
        }
        const nameInput = document.getElementById('lobby-new-room-name');
        const modeSelect = document.getElementById('lobby-new-room-mode');
        const pinInput = document.getElementById('lobby-new-room-pin');

        const roomName = (nameInput?.value || '').trim() || `${state.user?.displayName || '興大社員'} 的對戰房`;
        const mode = modeSelect?.value || 'auto';
        const pin = (pinInput?.value || '').trim();

        // 若已有舊房先關閉
        if (state.myHostedRoomRef) {
            state.myHostedRoomRef.remove().catch(() => {});
        }

        const roomRef = state.db.ref(`rooms/${myPeerId}`);
        const payload = {
            roomName,
            hostUid: state.user ? state.user.uid : 'guest',
            hostName: state.user ? (state.user.displayName || '社員') : '訪客',
            peerId: myPeerId,
            mode,
            hasPassword: pin.length > 0,
            pin: pin.length > 0 ? pin : '',
            status: 'waiting',
            createdAt: Date.now()
        };

        roomRef.set(payload).then(() => {
            roomRef.onDisconnect().remove();
            state.myHostedRoomRef = roomRef;
            state.myHostedRoomId = myPeerId;
            if (nameInput) nameInput.value = '';
            if (pinInput) pinInput.value = '';
            showSysMsg(`已建立房間「${roomName}」，等待對手加入...`);
        }).catch(err => {
            console.error('建立房間失敗:', err);
            showSysMsg('建立房間失敗，請檢查 Firebase Realtime Database 權限規則。');
        });
    }

    function closeMyHostedRoom() {
        if (state.myHostedRoomRef) {
            state.myHostedRoomRef.remove().catch(() => {});
            state.myHostedRoomRef = null;
            state.myHostedRoomId = null;
            showSysMsg('已關閉你的對戰房間。');
        }
    }

    // 雲端牌組同步：登入時拉取雲端牌組合併，存檔時同步寫回
    function syncCloudDecksOnLogin(uid) {
        if (!state.db || !uid) return;
        const userDecksRef = state.db.ref(`users/${uid}/decks`);
        userDecksRef.once('value').then(snap => {
            const cloudDecks = snap.val();
            if (cloudDecks && typeof cloudDecks === 'object') {
                // 合併雲端與本機牌組（雲端同名牌組優先）
                Object.assign(window.allDecks, cloudDecks);
                localStorage.setItem('ua_all_decks', JSON.stringify(window.allDecks));
                if (typeof window.updateDeckSelector === 'function') window.updateDeckSelector();
                if (typeof window.renderDeck === 'function') window.renderDeck();
                showSysMsg('已從雲端同步你的牌組資料。');
            } else {
                // 首次登入：將本機牌組備份至雲端
                userDecksRef.set(window.allDecks).catch(() => {});
            }
        }).catch(err => console.warn('讀取雲端牌組失敗:', err));
    }

    function hookSaveAllDecks() {
        if (typeof window.saveAllDecks !== 'function' || window._fbDeckHooked) return;
        window._fbDeckHooked = true;
        const origSave = window.saveAllDecks;
        window.saveAllDecks = function () {
            origSave();
            if (state.ready && state.user && state.db) {
                state.db.ref(`users/${state.user.uid}/decks`).set(window.allDecks).catch(() => {});
            }
        };
    }

    function initFirebaseLobby() {
        const cfg = window.NCHUCGC_FIREBASE_CONFIG;
        const createBtn = document.getElementById('btn-lobby-create-room');
        if (createBtn) createBtn.onclick = createHostedRoom;

        const quickConnectBtn = document.getElementById('btn-lobby-quick-connect');
        if (quickConnectBtn) {
            quickConnectBtn.onclick = () => {
                const code = (document.getElementById('lobby-manual-code')?.value || '').trim();
                if (!code) { showSysMsg('請輸入對手房號。'); return; }
                const targetInput = document.getElementById('target-id');
                const connectBtn = document.getElementById('btn-connect');
                if (targetInput && connectBtn) {
                    targetInput.value = code;
                    connectBtn.click();
                }
            };
        }

        if (typeof firebase === 'undefined' || !isConfigFilled(cfg)) {
            state.ready = false;
            updateAuthUI();
            renderRoomList();
            return;
        }

        try {
            if (!firebase.apps.length) firebase.initializeApp(cfg);
            state.auth = firebase.auth();
            state.db = firebase.database();
            state.ready = true;

            state.auth.onAuthStateChanged(user => {
                state.user = user || null;
                updateAuthUI();
                if (user) syncCloudDecksOnLogin(user.uid);
            });

            state.db.ref('rooms').on('value', snap => {
                state.roomsMap = snap.val() || {};
                renderRoomList();
            });

            hookSaveAllDecks();
            updateAuthUI();
            renderRoomList();
        } catch (err) {
            console.error('Firebase 初始化失敗:', err);
            state.ready = false;
            updateAuthUI();
            renderRoomList();
        }
    }

    window.nchucgcLobby = {
        closeMyHostedRoom,
        renderRoomList
    };

    window.addEventListener('load', () => {
        setTimeout(initFirebaseLobby, 120);
    });
})();
