// ─────────────────────────────────────────────
//  MAIN GAME LOOP — Party-based mode switching
//  Party persists across game modes (PvP/Campaign/Sandbox)
// ─────────────────────────────────────────────

(() => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const W = 960, H = 540;
    canvas.width = W; canvas.height = H;

    let state = 'intro';   // intro → mode-select → lobby → spellbook → battle/campaign/sandbox
    let gameMode = 'pvp';  // pvp | campaign | sandbox
    let pvpMode  = 'ffa';  // ffa | teams | koth | boss | gauntlet | survival | target | duel | campaign
    let lastTime = performance.now();
    let compiledSpells = null;
    let inParty  = false;  // true once a party is active (persists across modes)

    Intro.init();

    // ═══════════════════════════════════════
    //  GAME LOOP
    // ═══════════════════════════════════════
    function gameLoop(ts) {
        const dt = Math.min(0.05, (ts - lastTime) / 1000);
        lastTime = ts;

        switch (state) {
            case 'intro':
                Intro.update(dt);
                if (Intro.isDone()) { state = 'mode-select'; showModeSelect(); }
                break;
            case 'battle':   if (!paused) Battle.update(dt);   break;
            case 'campaign': if (!paused) Campaign.update(dt);  break;
            case 'sandbox':  if (!paused) Sandbox.update(dt);   break;
        }

        ctx.clearRect(0, 0, W, H);
        switch (state) {
            case 'intro': Intro.render(ctx, W, H); break;
            case 'mode-select':
            case 'lobby':
            case 'spellbook':
                ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); break;
            case 'battle':   Battle.render(ctx, W, H);   break;
            case 'campaign': Campaign.render(ctx, W, H); break;
            case 'sandbox':  Sandbox.render(ctx);         break;
        }

        // FPS counter
        if (settings.showFps) {
            const fps = Math.round(1 / Math.max(dt, 0.001));
            ctx.fillStyle = '#ffd700';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('FPS: ' + fps, 8, 16);
        }

        requestAnimationFrame(gameLoop);
    }
    requestAnimationFrame(gameLoop);

    // ═══════════════════════════════════════
    //  MODE SELECT
    // ═══════════════════════════════════════
    function showModeSelect() {
        hideAll();
        document.getElementById('mode-select').classList.remove('hidden');
        const btn = document.getElementById('modeContinue');
        if (btn && typeof Campaign !== 'undefined' && Campaign.hasSave()) btn.classList.remove('hidden');
        else if (btn) btn.classList.add('hidden');

        // First-time tutorial
        if (typeof Tutorial !== 'undefined' && Tutorial.isFirstTime()) {
            Tutorial.start(); // will auto-dismiss
        }
    }

    document.getElementById('modePvp').addEventListener('click', () => {
        sfx(); gameMode = 'pvp';
        document.getElementById('mode-select').classList.add('hidden');
        state = 'lobby';
        showLobby();
    });

    document.getElementById('modeCampaign').addEventListener('click', () => {
        sfx(); gameMode = 'campaign';
        document.getElementById('mode-select').classList.add('hidden');
        state = 'lobby';
        showLobby();
    });

    document.getElementById('modeContinue').addEventListener('click', () => {
        sfx(); gameMode = 'campaign';
        document.getElementById('mode-select').classList.add('hidden');
        state = 'spellbook';
        Spellbook.init((sp) => {
            compiledSpells = sp; Spellbook.hide();
            state = 'campaign'; Campaign.restoreFromSave(compiledSpells);
        });
        Spellbook.show();
    });

    document.getElementById('modeSandbox').addEventListener('click', () => {
        sfx(); gameMode = 'sandbox';
        document.getElementById('mode-select').classList.add('hidden');
        state = 'spellbook';
        Spellbook.init((sp) => {
            compiledSpells = sp; Spellbook.hide();
            state = 'sandbox';
            document.getElementById('sandbox-hud').classList.remove('hidden');
            Sandbox.init(compiledSpells);
        });
        Spellbook.show();
    });

    // ═══════════════════════════════════════
    //  PARTY LOBBY
    // ═══════════════════════════════════════
    function showLobby() {
        hideAll();
        const el = document.getElementById('lobby');
        el.classList.remove('hidden');
        const sub = document.getElementById('lobbySub');
        sub.textContent = gameMode === 'pvp'
            ? 'Create or join a party to battle.'
            : 'Create or join a party for co-op.';

        // Show solo button for campaign AND pvp
        document.getElementById('soloBtn').classList.remove('hidden');

        // If already in a party, jump straight to party panel
        if (inParty && Network.isConnected()) {
            document.getElementById('lobbyActions').classList.add('hidden');
            document.getElementById('roomStatus').textContent = '';
            document.getElementById('roomCodeDisplay').classList.add('hidden');
            showPartyPanel();
        } else {
            document.getElementById('lobbyActions').classList.remove('hidden');
            document.getElementById('partyPanel').classList.add('hidden');
        }

        // Show mode picker only for PvP
        document.getElementById('partyModePicker').classList.toggle('hidden', gameMode !== 'pvp');

        // Party leader enforcement: only host can pick mode and start game
        const isLeader = !Network.isConnected() || Network.isHost();
        document.getElementById('partyStartBtn').textContent = isLeader ? 'START GAME' : 'WAITING FOR HOST…';
        document.getElementById('partyStartBtn').disabled = !isLeader;
        document.getElementById('partyStartBtn').style.opacity = isLeader ? '1' : '0.4';
        // Disable mode buttons for non-host
        document.querySelectorAll('.party-mode-btn').forEach(btn => {
            btn.disabled = !isLeader;
            btn.style.pointerEvents = isLeader ? 'auto' : 'none';
            btn.style.opacity = isLeader ? '1' : '0.6';
        });
    }

    // ── Party mode picker buttons ──
    document.querySelectorAll('.party-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sfx();
            document.querySelectorAll('.party-mode-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            pvpMode = btn.dataset.mode;
            // If campaign mode selected, switch gameMode
            if (pvpMode === 'campaign') {
                gameMode = 'campaign';
            } else {
                gameMode = 'pvp';
            }
        });
    });

    function showPartyPanel() {
        document.getElementById('partyPanel').classList.remove('hidden');
        document.getElementById('partyCodeValue').textContent = Network.getCode();
        refreshMembers(Network.getMembers());
    }

    function refreshMembers(members) {
        const el = document.getElementById('partyMembers');
        if (!el) return;
        el.innerHTML = '';
        for (const m of members) {
            const div = document.createElement('div');
            div.className = 'party-member';
            const crown = m.isHost ? ' 👑' : '';
            const readyDot = m.id === 'self' ? '' : (m.ready ? ' <span style="color:#44cc66">●</span>' : ' <span style="color:#555">○</span>');
            div.innerHTML = '<span class="pm-color" style="background:' + m.color + '"></span>'
                + '<span class="pm-nick">' + m.nick + crown + '</span>'
                + readyDot;
            el.appendChild(div);
        }
    }

    // ── Net callbacks ──
    const netCallbacks = {
        onMessage: (data, fromPeerId) => {
            if (!data || !data.type) return;
            // Party-level messages
            if (data.type === '_party-ready') return; // handled by Network
            if (data.type === 'opponent-ready' || data.type === '_party-ready') {
                if (state === 'spellbook') {
                    Spellbook.updateStatus('Party member ready!');
                    checkAllReady(fromPeerId);
                }
                return;
            }
            if (data.type === 'start-game') {
                if (state === 'spellbook') startGame();
                return;
            }
            if (data.type === 'host-start') {
                // Host picked the mode — adopt it and go to spellbook
                gameMode = data.gameMode || 'pvp';
                pvpMode  = data.pvpMode  || 'ffa';
                if (state === 'lobby') {
                    sfx();
                    document.getElementById('lobby').classList.add('hidden');
                    state = 'spellbook';
                    Spellbook.init(onPlayerReady);
                    Spellbook.show();
                }
                return;
            }
            if (data.type === 'host-exit-to-lobby') {
                // Host sent everyone back to lobby
                hideAll();
                readyPeers = new Set();
                state = 'lobby';
                showLobby();
                return;
            }
            // Game-level routing
            if (state === 'battle')   Battle.handleNetMessage(data, fromPeerId);
            if (state === 'campaign') Campaign.handleNetMessage(data, fromPeerId);
        },
        onConnected: () => {
            inParty = true;
            document.getElementById('roomStatus').textContent = 'Connected!';
            document.getElementById('roomStatus').style.color = '#44cc66';
            document.getElementById('lobbyActions').classList.add('hidden');
            setTimeout(showPartyPanel, 400);
        },
        onDisconnected: () => {
            inParty = false;
            document.getElementById('roomStatus').textContent = 'Disconnected.';
            document.getElementById('roomStatus').style.color = '#ff4444';
            document.getElementById('partyPanel').classList.add('hidden');
            document.getElementById('lobbyActions').classList.remove('hidden');
        },
        onPeerJoin: (pid) => {
            console.log('[Main] Peer joined:', pid);
            if (state === 'battle') Battle.handleNetMessage({ type: 'peer-join', peerId: pid }, pid);
        },
        onPeerLeave: (pid) => {
            console.log('[Main] Peer left:', pid);
            if (state === 'battle') Battle.handleNetMessage({ type: 'peer-leave', peerId: pid }, pid);
        },
        onPartyUpdate: (members) => {
            refreshMembers(members);
        },
    };

    document.getElementById('createRoom').addEventListener('click', async () => {
        sfx();
        document.getElementById('roomStatus').textContent = 'Creating party…';
        try {
            const code = await Network.createParty(netCallbacks);
            document.getElementById('roomStatus').textContent = 'Share this code:';
            const codeEl = document.getElementById('roomCodeDisplay');
            codeEl.textContent = code; codeEl.classList.remove('hidden');
            inParty = true;
            document.getElementById('lobbyActions').classList.add('hidden');
            setTimeout(showPartyPanel, 300);
        } catch(e) {
            document.getElementById('roomStatus').textContent = 'Error: ' + e.message;
            document.getElementById('roomStatus').style.color = '#ff4444';
        }
    });

    document.getElementById('joinRoom').addEventListener('click', async () => {
        sfx();
        const code = document.getElementById('roomCodeInput').value.trim();
        if (!code) return;
        document.getElementById('roomStatus').textContent = 'Connecting…';
        try {
            await Network.joinParty(code, netCallbacks);
        } catch(e) {
            document.getElementById('roomStatus').textContent = 'Error: ' + e.message;
            document.getElementById('roomStatus').style.color = '#ff4444';
        }
    });

    document.getElementById('soloBtn').addEventListener('click', () => {
        sfx();
        document.getElementById('lobby').classList.add('hidden');
        // For PvP, set solo mode
        if (gameMode === 'pvp') { pvpMode = 'solo'; }
        state = 'spellbook';
        Spellbook.init(onPlayerReady);
        Spellbook.show();
    });

    // ── Start button in party panel ──
    document.getElementById('partyStartBtn').addEventListener('click', () => {
        if (Network.isConnected() && !Network.isHost()) return; // non-host can't start
        sfx();
        // Broadcast mode choice to all peers so everyone plays the same mode
        if (Network.isConnected()) {
            Network.sendNow({ type: 'host-start', gameMode, pvpMode });
        }
        document.getElementById('lobby').classList.add('hidden');
        state = 'spellbook';
        Spellbook.init(onPlayerReady);
        Spellbook.show();
    });

    // ═══════════════════════════════════════
    //  SPELLBOOK READY SYSTEM (N players)
    // ═══════════════════════════════════════
    let readyPeers = new Set();

    function onPlayerReady(spells) {
        compiledSpells = spells;

        if ((gameMode === 'campaign' || gameMode === 'sandbox') && !Network.isConnected()) {
            startGame(); return;
        }
        if (!Network.isConnected()) {
            // Solo PvP (vs nobody) — just start
            startGame(); return;
        }

        Network.send({ type: 'opponent-ready' });
        Network.setReady(true);
        readyPeers.add('self');
        updateReadyStatus();

        if (Network.allReady()) {
            Network.send({ type: 'start-game' });
            setTimeout(startGame, 400);
        }
    }

    function checkAllReady(fromPeerId) {
        readyPeers.add(fromPeerId);
        updateReadyStatus();
        if (readyPeers.has('self') && Network.allReady()) {
            Network.send({ type: 'start-game' });
            setTimeout(startGame, 400);
        }
    }

    function updateReadyStatus() {
        const total = Network.getPeerCount() + 1;
        const ready = readyPeers.size;
        Spellbook.updateStatus('Ready: ' + ready + '/' + total);
    }

    function startGame() {
        if (state === 'battle' || state === 'campaign' || state === 'sandbox') return;
        Spellbook.hide();
        if (!compiledSpells) compiledSpells = Spellbook.compileSpells();
        readyPeers = new Set();

        if (gameMode === 'pvp') {
            state = 'battle';
            Battle.init(compiledSpells, pvpMode);
        } else if (gameMode === 'campaign') {
            state = 'campaign';
            Campaign.init(compiledSpells, 0);
        } else {
            state = 'sandbox';
            document.getElementById('sandbox-hud').classList.remove('hidden');
            Sandbox.init(compiledSpells);
        }
    }

    // ═══════════════════════════════════════
    //  VICTORY / RESTART / BACK-TO-PARTY
    // ═══════════════════════════════════════
    document.getElementById('restartBtn').addEventListener('click', () => {
        sfx(); hideAll();
        readyPeers = new Set();
        if (inParty && Network.isConnected()) {
            // Rematch: go back to spellbook within the party
            state = 'spellbook';
            Spellbook.init(onPlayerReady);
            Spellbook.show();
        } else {
            state = 'mode-select';
            showModeSelect();
        }
    });

    document.getElementById('backToPartyBtn').addEventListener('click', () => {
        sfx(); hideAll();
        readyPeers = new Set();
        if (inParty && Network.isConnected()) {
            state = 'lobby';
            showLobby();
        } else {
            state = 'mode-select';
            showModeSelect();
        }
    });

    // ═══════════════════════════════════════
    //  INPUT ROUTING
    // ═══════════════════════════════════════
    function getCanvasCoords(e) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    }

    canvas.addEventListener('click', () => {
        sfx(); if (state === 'intro') Intro.onClick();
    });
    canvas.addEventListener('mousedown', (e) => {
        if (typeof Audio !== 'undefined') Audio.ensureCtx();
        if (state === 'intro') Intro.onMouseDown();
        else if (state === 'battle')   { const c = getCanvasCoords(e); Battle.onMouseDown(c.x, c.y); }
        else if (state === 'campaign') { const c = getCanvasCoords(e); Campaign.onMouseDown(c.x, c.y); }
        else if (state === 'sandbox')  { const c = getCanvasCoords(e); Sandbox.onMouseDown(c.x, c.y); }
    });
    canvas.addEventListener('mouseup', () => {
        if (state === 'intro') Intro.onMouseUp();
        else if (state === 'battle')   Battle.onMouseUp();
        else if (state === 'campaign') Campaign.onMouseUp();
        else if (state === 'sandbox')  Sandbox.onMouseUp();
    });
    document.addEventListener('mousemove', (e) => {
        if (state === 'battle')   { const c = getCanvasCoords(e); Battle.onMouseMove(c.x, c.y); }
        if (state === 'campaign') { const c = getCanvasCoords(e); Campaign.onMouseMove(c.x, c.y); }
        if (state === 'sandbox')  { const c = getCanvasCoords(e); Sandbox.onMouseMove(c.x, c.y); }
    });
    document.addEventListener('keydown', (e) => {
        const k = e.key;
        if (state === 'battle')   { Battle.onKeyDown(k);   if (k === ' ' || k === 'Shift') e.preventDefault(); }
        if (state === 'campaign') { Campaign.onKeyDown(k);  if (k === ' ' || k === 'Shift') e.preventDefault(); }
        if (state === 'sandbox')  { Sandbox.onKeyDown(k);   if (k === ' ' || k === 'Shift') e.preventDefault(); }
    });
    document.addEventListener('keyup', (e) => {
        if (state === 'battle')   Battle.onKeyUp(e.key);
        if (state === 'campaign') Campaign.onKeyUp(e.key);
        if (state === 'sandbox')  Sandbox.onKeyUp(e.key);
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ═══════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════
    function hideAll() {
        ['mode-select','lobby','hud','campaign-hud','sandbox-hud','victory-screen','pause-menu','settings-panel'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
    }

    function sfx() { if (typeof Audio !== 'undefined') Audio.menuClick(); }

    // ═══════════════════════════════════════
    //  PAUSE MENU (ESC key)
    // ═══════════════════════════════════════
    let paused = false;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (state === 'battle' || state === 'campaign' || state === 'sandbox') {
                if (!paused) {
                    paused = true;
                    document.getElementById('pause-menu').classList.remove('hidden');
                } else {
                    resumeGame();
                }
            } else if (paused) {
                resumeGame();
            }
        }
    });

    function resumeGame() {
        paused = false;
        document.getElementById('pause-menu').classList.add('hidden');
    }

    document.getElementById('pauseResume').addEventListener('click', () => {
        sfx(); resumeGame();
    });

    document.getElementById('pauseSpellbook').addEventListener('click', () => {
        sfx(); resumeGame(); hideAll();
        readyPeers = new Set();
        // Broadcast exit to party
        if (inParty && Network.isConnected()) {
            Network.sendNow({ type: 'host-exit-to-lobby' });
        }
        state = 'spellbook';
        Spellbook.init(onPlayerReady);
        Spellbook.show();
    });

    document.getElementById('pauseMenu').addEventListener('click', () => {
        sfx(); resumeGame(); hideAll();
        readyPeers = new Set();
        if (inParty && Network.isConnected()) {
            Network.sendNow({ type: 'host-exit-to-lobby' });
            state = 'lobby';
            showLobby();
        } else {
            state = 'mode-select';
            showModeSelect();
        }
    });

    // ═══════════════════════════════════════
    //  SETTINGS PANEL
    // ═══════════════════════════════════════
    const SETTINGS_KEY = 'arcform-settings';
    let settings = {
        particleDensity: 'high', // low, medium, high
        screenShake: true,
        showFps: false,
    };

    // Load settings from localStorage
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) Object.assign(settings, JSON.parse(saved));
    } catch(e) {}

    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e) {}
    }

    // Expose settings globally for other modules
    window.GameSettings = settings;

    document.getElementById('settingsBtn').addEventListener('click', () => {
        sfx();
        showSettingsPanel();
    });

    document.getElementById('settingsClose').addEventListener('click', () => {
        sfx();
        document.getElementById('settings-panel').classList.add('hidden');
    });

    function showSettingsPanel() {
        const el = document.getElementById('settingsContent');
        el.innerHTML = '';

        // Particle density
        const r1 = document.createElement('div');
        r1.className = 'settings-row';
        r1.innerHTML = '<label>Particle Density</label>';
        const sel = document.createElement('select');
        ['low','medium','high'].forEach(v => {
            const opt = document.createElement('option');
            opt.value = v; opt.textContent = v.toUpperCase();
            if (settings.particleDensity === v) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => { settings.particleDensity = sel.value; saveSettings(); });
        r1.appendChild(sel);
        el.appendChild(r1);

        // Screen shake
        const r2 = document.createElement('div');
        r2.className = 'settings-row';
        r2.innerHTML = '<label>Screen Shake</label>';
        const cb1 = document.createElement('input');
        cb1.type = 'checkbox'; cb1.checked = settings.screenShake;
        cb1.addEventListener('change', () => { settings.screenShake = cb1.checked; saveSettings(); });
        r2.appendChild(cb1);
        el.appendChild(r2);

        // Show FPS
        const r3 = document.createElement('div');
        r3.className = 'settings-row';
        r3.innerHTML = '<label>Show FPS</label>';
        const cb2 = document.createElement('input');
        cb2.type = 'checkbox'; cb2.checked = settings.showFps;
        cb2.addEventListener('change', () => { settings.showFps = cb2.checked; saveSettings(); });
        r3.appendChild(cb2);
        el.appendChild(r3);

        // Replay tutorial
        const r4 = document.createElement('div');
        r4.className = 'settings-row';
        r4.innerHTML = '<label>Tutorial</label>';
        const tutBtn = document.createElement('button');
        tutBtn.className = 'ws-btn';
        tutBtn.textContent = 'REPLAY TUTORIAL';
        tutBtn.addEventListener('click', () => {
            if (typeof Tutorial !== 'undefined') {
                Tutorial.resetTutorial();
                document.getElementById('settings-panel').classList.add('hidden');
                Tutorial.start();
            }
        });
        r4.appendChild(tutBtn);
        el.appendChild(r4);

        document.getElementById('settings-panel').classList.remove('hidden');
    }

    // Expose Game API for sandbox back-to-menu & victory back-to-party
    window.Game = {
        backToMenu() {
            hideAll();
            if (inParty && Network.isConnected()) {
                state = 'lobby'; showLobby();
            } else {
                state = 'mode-select'; showModeSelect();
            }
        },
    };
})();
