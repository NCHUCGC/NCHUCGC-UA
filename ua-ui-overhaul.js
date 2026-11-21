/**
 * NCHUCGC UI 美術重構輔助腳本 (ua-ui-overhaul.js)
 * 1. 將對戰 HUD 按鈕的 Emoji 替換為統一線條的 SVG 向量圖示
 * 2. 將左側 #hotkey-guide 改為預設收合的側邊抽屜，釋放盤面視野
 */
(function () {
    const ICONS = {
        chat: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        plus: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        minus: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        reset: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>`,
        dice: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:5px;"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/></svg>`,
        exit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-2px;margin-right:5px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
    };

    function applyBattleUIOverhaul() {
        // 1. 替換角落工具按鈕為 SVG
        const chatBtn = document.getElementById('btn-chat-toggle');
        if (chatBtn) chatBtn.innerHTML = ICONS.chat;

        document.querySelectorAll('.cam-ctrl-box .cam-btn').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            if (oc.includes('zoomCam(0.15)')) btn.innerHTML = ICONS.plus;
            else if (oc.includes('zoomCam(-0.15)')) btn.innerHTML = ICONS.minus;
            else if (oc.includes('resetCam()')) btn.innerHTML = ICONS.reset;
        });

        const diceBtn = document.querySelector('#my-match-actions button[onclick*="rollDice"]');
        if (diceBtn) diceBtn.innerHTML = `${ICONS.dice}擲骰`;

        const backBtn = document.getElementById('btn-back-builder');
        if (backBtn) backBtn.innerHTML = `${ICONS.exit}返回`;

        document.querySelectorAll('.bp-badge').forEach(el => {
            el.textContent = 'BP';
        });

        // 2. 將左側 #hotkey-guide 改為可收合側邊抽屜（預設收合，滑入或點擊展開）
        const guide = document.getElementById('hotkey-guide');
        if (guide && !document.getElementById('hotkey-drawer-toggle')) {
            guide.classList.add('is-collapsed');
            guide.style.paddingRight = '36px';

            const tab = document.createElement('button');
            tab.id = 'hotkey-drawer-toggle';
            tab.type = 'button';
            tab.textContent = '快捷操作';
            tab.onclick = (e) => {
                e.stopPropagation();
                guide.classList.toggle('is-collapsed');
            };
            guide.appendChild(tab);
        }

        // 3. 動態對齊右側公開資訊欄，緊貼 .hud-sidebar 下方形成單一戰術欄
        const sidebar = document.querySelector('.hud-sidebar');
        const pubHud = document.getElementById('ua-public-info-hud');
        if (sidebar && pubHud) {
            const syncTop = () => {
                const rect = sidebar.getBoundingClientRect();
                const scale = window.appScale || 1;
                if (rect.height > 0) {
                    pubHud.style.top = Math.round(16 + rect.height / scale) + 'px';
                }
            };
            syncTop();
            const ro = new ResizeObserver(syncTop);
            ro.observe(sidebar);
        }
    }

    window.addEventListener('load', () => {
        setTimeout(applyBattleUIOverhaul, 200);
    });
})();