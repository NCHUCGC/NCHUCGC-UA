/**
 * NCHUCGC 第三階段：Firebase 帳號登入、即時多房間大廳、好友與邀請系統、雲端 Tier List 與難度投票 (firebase-lobby.js)
 */
(function () {
    const state = {
        ready: false,
        auth: null,
        db: null,
        user: null,
        myFriendCode: null,
        myHostedRoomRef: null,
        myHostedRoomId: null,
        roomsMap: {},
        friendsMap: {},
        statusesMap: {},
        cloudTierList: null,
        tierVotes: {}
    };

    function isConfigFilled(cfg) {
        return !!(cfg && cfg.apiKey && cfg.apiKey !== 'YOUR_API_KEY' && cfg.databaseURL && !cfg.databaseURL.includes('YOUR_PROJECT_ID'));
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
    }

    function isAdminUser() {
        const admins = window.NCHUCGC_ADMIN_UIDS || [];
        return !!(state.user && Array.isArray(admins) && admins.includes(state.user.uid));
    }

    function generateFriendCode() {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
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
            const adminTag = isAdminUser() ? `<span style="font-size:11px; background:#6fb897; color:#111; padding:2px 6px; border-radius:4px; font-weight:900;">管理員</span>` : '';
            authBox.innerHTML = `
                ${adminTag}
                <span id="nav-user-name" title="點擊複製你的 UID（用於設定管理員權限）" style="font-size:13px; color:#d1c4e9; font-weight:700; cursor:pointer;">${name}</span>
                <button class="ctrl-btn" id="btn-fb-logout" style="background:#313456; padding:5px 10px; font-size:12px;">登出</button>
            `;
            document.getElementById('nav-user-name').onclick = () => {
                navigator.clipboard.writeText(state.user.uid).then(() => showSysMsg(`已複製你的 UID：${state.user.uid}`));
            };
            document.getElementById('btn-fb-logout').onclick = () => {
                setMyPresence('offline');
                state.auth.signOut();
            };
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
        if (typeof window.renderTierBoard === 'function') window.renderTierBoard();
    }

    // ==================== 在線狀態 (Presence) ====================

    function setMyPresence(statusStr) {
        if (!state.ready || !state.user || !state.db) return;
        const ref = state.db.ref(`status/${state.user.uid}`);
        ref.set({
            state: statusStr,
            name: state.user.displayName || '社員',
            peerId: window.myRoomId || '',
            updatedAt: Date.now()
        }).catch(() => {});
    }

    function initPresence(user) {
        const ref = state.db.ref(`status/${user.uid}`);
        const connectedRef = state.db.ref('.info/connected');
        connectedRef.on('value', snap => {
            if (snap.val() === true) {
                ref.onDisconnect().set({
                    state: 'offline',
                    name: user.displayName || '社員',
                    peerId: '',
                    updatedAt: Date.now()
                });
                setMyPresence('online');
            }
        });
    }

    // ==================== 好友系統與直接邀請 ====================

    function ensureUserProfileAndFriendCode(user) {
        const profileRef = state.db.ref(`users/${user.uid}/profile`);
        profileRef.once('value').then(snap => {
            const val = snap.val();
            if (val && val.friendCode) {
                state.myFriendCode = val.friendCode;
                // 同步更新顯示名稱
                profileRef.update({ name: user.displayName || '社員' }).catch(() => {});
                renderFriendsPanel();
            } else {
                const newCode = generateFriendCode();
                state.myFriendCode = newCode;
                profileRef.set({
                    name: user.displayName || '社員',
                    friendCode: newCode,
                    createdAt: Date.now()
                }).catch(() => {});
                state.db.ref(`friendCodes/${newCode}`).set({
                    uid: user.uid,
                    name: user.displayName || '社員'
                }).catch(() => {});
                renderFriendsPanel();
            }
        }).catch(() => {});
    }

    function listenFriendsAndInvites(uid) {
        // 監聽好友名單
        state.db.ref(`users/${uid}/friends`).on('value', snap => {
            state.friendsMap = snap.val() || {};
            renderFriendsPanel();
        });

        // 監聽全體在線狀態（社團規模輕量直接監聽）
        state.db.ref('status').on('value', snap => {
            state.statusesMap = snap.val() || {};
            renderFriendsPanel();
        });

        // 監聽收到的對戰邀請
        state.db.ref(`invites/${uid}`).on('value', snap => {
            const invMap = snap.val() || {};
            const list = Object.entries(invMap)
                .map(([fromUid, data]) => ({ fromUid, ...data }))
                .filter(inv => inv && inv.peerId && (Date.now() - (inv.createdAt || 0) < 120000));
            renderInviteToast(list[0] || null);
        });
    }

    function renderInviteToast(invite) {
        const box = document.getElementById('nchucgc-invite-toast');
        if (!box) return;
        if (!invite) {
            box.style.display = 'none';
            return;
        }
        box.innerHTML = `
            <div style="font-size:12px; color:#6fb897; font-weight:700; margin-bottom:4px;">收到好友對戰邀請</div>
            <div style="font-size:15px; font-weight:900; color:#fff; margin-bottom:10px;">${escapeHtml(invite.fromName || '好友')} 邀請你進行對戰</div>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button class="ctrl-btn" id="btn-inv-decline" style="background:#313456; padding:6px 12px;">婉拒</button>
                <button class="start-btn" id="btn-inv-accept" style="padding:6px 14px;">接受並加入</button>
            </div>
        `;
        box.style.display = 'block';

        box.querySelector('#btn-inv-decline').onclick = () => {
            if (state.db && state.user) state.db.ref(`invites/${state.user.uid}/${invite.fromUid}`).remove().catch(() => {});
            box.style.display = 'none';
        };
        box.querySelector('#btn-inv-accept').onclick = () => {
            if (state.db && state.user) state.db.ref(`invites/${state.user.uid}/${invite.fromUid}`).remove().catch(() => {});
            box.style.display = 'none';
            const targetInput = document.getElementById('target-id');
            const connectBtn = document.getElementById('btn-connect');
            if (targetInput && connectBtn) {
                if (typeof window.switchMainView === 'function') window.switchMainView('builder');
                targetInput.value = invite.peerId;
                connectBtn.click();
                showSysMsg(`已接受 ${invite.fromName} 的邀請，正在建立連線...`);
            }
        };
    }

    function addFriendByCode() {
        if (!state.ready || !state.user) {
            showSysMsg('請先使用 Google 登入以使用好友功能。');
            return;
        }
        const input = document.getElementById('lobby-friend-code-input');
        const code = (input?.value || '').trim().toUpperCase();
        if (!code || code.length < 4) {
            showSysMsg('請輸入有效的 6 碼好友碼。');
            return;
        }
        if (code === state.myFriendCode) {
            showSysMsg('不能加自己為好友。');
            return;
        }
        state.db.ref(`friendCodes/${code}`).once('value').then(snap => {
            const target = snap.val();
            if (!target || !target.uid) {
                showSysMsg('找不到此好友碼，請確認輸入是否正確。');
                return;
            }
            const myUid = state.user.uid;
            const myName = state.user.displayName || '社員';
            // 雙向加入好友
            state.db.ref(`users/${myUid}/friends/${target.uid}`).set({ name: target.name || '社員', addedAt: Date.now() }).catch(() => {});
            state.db.ref(`users/${target.uid}/friends/${myUid}`).set({ name: myName, addedAt: Date.now() }).catch(() => {});
            if (input) input.value = '';
            showSysMsg(`已成功與「${target.name || '社員'}」成為好友。`);
        }).catch(err => {
            console.error('加好友失敗:', err);
            showSysMsg('加好友失敗，請確認已更新 Firebase 安全規則。');
        });
    }

    function sendInviteToFriend(friendUid, friendName) {
        if (!state.ready || !state.user) return;
        const myPeerId = document.getElementById('my-peer-id')?.textContent?.trim();
        if (!myPeerId || myPeerId === '產生中...') {
            showSysMsg('正在取得連線代碼，請稍候再試。');
            return;
        }
        state.db.ref(`invites/${friendUid}/${state.user.uid}`).set({
            fromUid: state.user.uid,
            fromName: state.user.displayName || '社員',
            peerId: myPeerId,
            createdAt: Date.now()
        }).then(() => {
            showSysMsg(`已發送對戰邀請給「${friendName}」，請等待對方接受。`);
        }).catch(err => {
            console.error('發送邀請失敗:', err);
            showSysMsg('發送邀請失敗，請確認 Firebase 安全規則。');
        });
    }

    function renderFriendsPanel() {
        const codeEl = document.getElementById('lobby-my-friend-code');
        const listEl = document.getElementById('lobby-friends-list');
        if (!listEl) return;

        if (!state.ready || !state.user) {
            if (codeEl) codeEl.textContent = '請先登入';
            listEl.innerHTML = `<div class="lobby-empty" style="padding:16px;">登入 Google 帳號後即可查看好友名單與發送直接邀請。</div>`;
            return;
        }

        if (codeEl) {
            codeEl.textContent = state.myFriendCode || '產生中...';
            codeEl.onclick = () => {
                if (state.myFriendCode) navigator.clipboard.writeText(state.myFriendCode).then(() => showSysMsg(`已複製好友碼：${state.myFriendCode}`));
            };
        }

        const friends = Object.entries(state.friendsMap || {}).map(([uid, info]) => {
            const st = state.statusesMap[uid] || { state: 'offline' };
            return { uid, name: st.name || info.name || '社員', status: st.state || 'offline' };
        }).sort((a, b) => {
            const order = { online: 0, playing: 1, offline: 2 };
            return (order[a.status] ?? 2) - (order[b.status] ?? 2);
        });

        if (friends.length === 0) {
            listEl.innerHTML = `<div class="lobby-empty" style="padding:16px;">尚無好友，輸入對方的 6 碼好友碼即可加入。</div>`;
            return;
        }

        listEl.innerHTML = '';
        friends.forEach(f => {
            const statusText = f.status === 'online' ? '在線' : (f.status === 'playing' ? '對戰中' : '離線');
            const dotColor = f.status === 'online' ? '#2ecc71' : (f.status === 'playing' ? '#f1c40f' : '#6c7290');
            const row = document.createElement('div');
            row.className = 'friend-row';
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                    <span style="width:9px; height:9px; border-radius:50%; background:${dotColor}; flex-shrink:0;"></span>
                    <span style="font-size:13px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(f.name)}</span>
                    <span style="font-size:11px; color:#8c93ad;">${statusText}</span>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button class="ctrl-btn btn-invite-friend" style="background:#4f9678; padding:4px 9px; font-size:12px;" ${f.status === 'offline' ? 'disabled' : ''}>邀請</button>
                    <button class="ctrl-btn btn-remove-friend" style="background:#313456; padding:4px 8px; font-size:12px;">移除</button>
                </div>
            `;
            row.querySelector('.btn-invite-friend').onclick = () => sendInviteToFriend(f.uid, f.name);
            row.querySelector('.btn-remove-friend').onclick = () => {
                if (confirm(`確定要移除好友「${f.name}」嗎？`)) {
                    state.db.ref(`users/${state.user.uid}/friends/${f.uid}`).remove().catch(() => {});
                }
            };
            listEl.appendChild(row);
        });
    }

    // ==================== 房間列表 ====================

    function renderRoomList() {
        const listBox = document.getElementById('lobby-room-list');
        const statusBanner = document.getElementById('lobby-fb-status');
        if (!listBox) return;

        if (!state.ready) {
            if (statusBanner) {
                statusBanner.style.display = 'block';
                statusBanner.textContent = '尚未設定 firebase-config.js，目前為單機／手動代碼連線模式。';
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
            listBox.innerHTML = `<div class="lobby-empty">目前沒有等待中的房間，點擊右側「建立對戰房間」開始配對。</div>`;
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
            if (closeBtn) closeBtn.onclick = () => closeMyHostedRoom();

            const joinBtn = row.querySelector('.btn-join-room');
            if (joinBtn && !isPlaying) {
                joinBtn.onclick = () => {
                    if (room.hasPassword) {
                        const pin = prompt('此房間設有密碼，請輸入房間密碼：');
                        if (pin === null) return;
                        if (pin.trim() !== String(room.pin || '')) { showSysMsg('房間密碼錯誤。'); return; }
                    }
                    const targetInput = document.getElementById('target-id');
                    const connectBtn = document.getElementById('btn-connect');
                    if (targetInput && connectBtn) {
                        targetInput.value = room.peerId;
                        connectBtn.click();
                        if (state.db) state.db.ref(`rooms/${room.id}/status`).set('playing').catch(() => {});
                        showSysMsg(`正在連線至「${room.roomName}」...`);
                    }
                };
            }
            listBox.appendChild(row);
        });
    }

    function createHostedRoom() {
        if (!state.ready) { showSysMsg('請先於 firebase-config.js 填入 Firebase 設定。'); return; }
        const myPeerId = document.getElementById('my-peer-id')?.textContent?.trim();
        if (!myPeerId || myPeerId === '產生中...') { showSysMsg('正在取得 PeerJS 連線代碼，請稍候 1 秒再試。'); return; }
        const nameInput = document.getElementById('lobby-new-room-name');
        const modeSelect = document.getElementById('lobby-new-room-mode');
        const pinInput = document.getElementById('lobby-new-room-pin');

        const roomName = (nameInput?.value || '').trim() || `${state.user?.displayName || '興大社員'} 的對戰房`;
        const mode = modeSelect?.value || 'auto';
        const pin = (pinInput?.value || '').trim();

        if (state.myHostedRoomRef) state.myHostedRoomRef.remove().catch(() => {});

        const roomRef = state.db.ref(`rooms/${myPeerId}`);
        roomRef.set({
            roomName,
            hostUid: state.user ? state.user.uid : 'guest',
            hostName: state.user ? (state.user.displayName || '社員') : '訪客',
            peerId: myPeerId,
            mode,
            hasPassword: pin.length > 0,
            pin: pin.length > 0 ? pin : '',
            status: 'waiting',
            createdAt: Date.now()
        }).then(() => {
            roomRef.onDisconnect().remove();
            state.myHostedRoomRef = roomRef;
            state.myHostedRoomId = myPeerId;
            if (nameInput) nameInput.value = '';
            if (pinInput) pinInput.value = '';
            showSysMsg(`已建立房間「${roomName}」，等待對手加入...`);
        }).catch(err => {
            console.error('建立房間失敗:', err);
            showSysMsg('建立房間失敗，請檢查 Firebase 安全規則。');
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

    // ==================== 雲端 Tier List 與難度投票 ====================

    function listenCloudTierList() {
        state.db.ref('tierList').on('value', snap => {
            const val = snap.val();
            if (Array.isArray(val) && val.length > 0) {
                state.cloudTierList = val;
                window.NCHUCGC_TIER_LIST = val;
                if (typeof window.renderTierBoard === 'function') window.renderTierBoard();
            }
        });
        state.db.ref('tierVotes').on('value', snap => {
            state.tierVotes = snap.val() || {};
            if (typeof window.renderTierBoard === 'function') window.renderTierBoard();
        });
    }

    function publishOfficialTierList(cleanList) {
        if (!state.ready || !isAdminUser()) {
            showSysMsg('僅限管理員帳號可調整排表。');
            return;
        }
        state.db.ref('tierList').set(cleanList).then(() => {
            showSysMsg('排表已即時同步更新');
        }).catch(err => {
            console.error('發佈排表失敗:', err);
            showSysMsg('同步失敗，請確認 Firebase 安全規則已加入你的管理員 UID。');
        });
    }

    function voteDeckDifficulty(deckId, score) {
        if (!state.ready || !state.user) {
            showSysMsg('請先 Google 登入後再進行難度評分。');
            return;
        }
        state.db.ref(`tierVotes/${deckId}/${state.user.uid}`).set(Number(score)).then(() => {
            showSysMsg(`已送出你的難度評分（${score} / 5）。`);
        }).catch(() => showSysMsg('評分送出失敗，請確認 Firebase 安全規則。'));
    }

    function getDeckVoteSummary(deckId) {
        const votesObj = state.tierVotes[deckId];
        if (!votesObj) return null;
        const vals = Object.values(votesObj).map(Number).filter(n => n >= 1 && n <= 5);
        if (vals.length === 0) return null;
        const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
        const myVote = state.user ? votesObj[state.user.uid] : null;
        return { avg, count: vals.length, myVote };
    }

    // ==================== 雲端牌組同步 ====================

    // Firebase 的鍵名不可含 . $ # [ ] /，牌組名稱（例如「[排表] …」）可能含有這些字元，寫入前先編碼、讀回後解碼
    function encodeDeckKey(name) {
        return String(name).replace(/[%.$#\[\]\/]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
    }
    function decodeDeckKey(key) {
        try { return decodeURIComponent(key); } catch (e) { return key; }
    }
    // 轉成可寫入 Firebase 的格式：編碼鍵名，並用 JSON 轉換去掉 undefined
    function toCloudDecks(decks) {
        const clean = JSON.parse(JSON.stringify(decks || {}));
        const out = {};
        Object.keys(clean).forEach(name => { out[encodeDeckKey(name)] = clean[name]; });
        return out;
    }
    function fromCloudDecks(cloud) {
        const out = {};
        Object.keys(cloud || {}).forEach(key => { out[decodeDeckKey(key)] = cloud[key]; });
        return out;
    }

    function syncCloudDecksOnLogin(uid) {
        if (!state.db || !uid) return;
        const userDecksRef = state.db.ref(`users/${uid}/decks`);
        userDecksRef.once('value').then(snap => {
            const cloudDecks = snap.val();
            if (cloudDecks && typeof cloudDecks === 'object') {
                Object.assign(window.allDecks, fromCloudDecks(cloudDecks));
                localStorage.setItem('ua_all_decks', JSON.stringify(window.allDecks));
                if (typeof window.updateDeckSelector === 'function') window.updateDeckSelector();
                if (typeof window.renderDeck === 'function') window.renderDeck();
                showSysMsg('已從雲端同步你的牌組資料。');
            } else {
                try { userDecksRef.set(toCloudDecks(window.allDecks)).catch(() => {}); } catch (e) { console.warn('雲端牌組初始化失敗', e); }
            }
        }).catch(() => {});
    }

    function hookSaveAllDecks() {
        if (typeof window.saveAllDecks !== 'function' || window._fbDeckHooked) return;
        window._fbDeckHooked = true;
        const origSave = window.saveAllDecks;
        window.saveAllDecks = function () {
            const result = origSave.apply(this, arguments);
            // 雲端同步失敗不可中斷本機操作（否則新增牌組等流程會整段中止）
            try {
                if (state.ready && state.user && state.db && window.allDecks) {
                    state.db.ref(`users/${state.user.uid}/decks`).set(toCloudDecks(window.allDecks)).catch(() => {});
                }
            } catch (e) {
                console.warn('雲端牌組同步失敗（本機已存檔）', e);
            }
            return result;
        };
    }

    function initFirebaseLobby() {
        const cfg = window.NCHUCGC_FIREBASE_CONFIG;
        document.getElementById('btn-lobby-create-room')?.addEventListener('click', createHostedRoom);
        document.getElementById('btn-lobby-add-friend')?.addEventListener('click', addFriendByCode);
        document.getElementById('btn-lobby-quick-connect')?.addEventListener('click', () => {
            const code = (document.getElementById('lobby-manual-code')?.value || '').trim();
            if (!code) { showSysMsg('請輸入對手房號。'); return; }
            const targetInput = document.getElementById('target-id');
            const connectBtn = document.getElementById('btn-connect');
            if (targetInput && connectBtn) { targetInput.value = code; connectBtn.click(); }
        });

        if (typeof firebase === 'undefined' || !isConfigFilled(cfg)) {
            state.ready = false;
            updateAuthUI();
            renderRoomList();
            renderFriendsPanel();
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
                renderFriendsPanel();
                if (user) {
                    initPresence(user);
                    ensureUserProfileAndFriendCode(user);
                    listenFriendsAndInvites(user.uid);
                    syncCloudDecksOnLogin(user.uid);
                }
            });

            state.db.ref('rooms').on('value', snap => {
                state.roomsMap = snap.val() || {};
                renderRoomList();
            });

            listenCloudTierList();
            hookSaveAllDecks();
            updateAuthUI();
            renderRoomList();
            renderFriendsPanel();
        } catch (err) {
            console.error('Firebase 初始化失敗:', err);
            state.ready = false;
            updateAuthUI();
            renderRoomList();
            renderFriendsPanel();
        }
    }

    window.nchucgcLobby = {
        closeMyHostedRoom,
        renderRoomList,
        setMyPresence,
        isAdminUser,
        isLoggedIn: () => !!(state.ready && state.user),
        publishOfficialTierList,
        voteDeckDifficulty,
        getDeckVoteSummary
    };

    window.addEventListener('load', () => {
        setTimeout(initFirebaseLobby, 120);
    });
})();
