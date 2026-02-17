// ─────────────────────────────────────────────
//  MAIN GAME LOOP — Mode Select → Lobby → Spellbook → Battle/Campaign
// ─────────────────────────────────────────────

(() => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const W = 960, H = 540;
    canvas.width = W; canvas.height = H;

    let state = 'intro'; // intro → mode-select → lobby → spellbook → battle/campaign
    let gameMode = 'pvp'; // 'pvp' or 'campaign'
    let lastTime = performance.now();
    let compiledSpells = null;

    Intro.init();

    // ── GAME LOOP ──
    function gameLoop(timestamp) {
        const dt = Math.min(0.05, (timestamp - lastTime) / 1000);
        lastTime = timestamp;

        switch (state) {
            case 'intro':
                Intro.update(dt);
                if (Intro.isDone()) { state = 'mode-select'; showModeSelect(); }
                break;
            case 'battle':
                Battle.update(dt);
                break;
            case 'campaign':
                Campaign.update(dt);
                break;
        }

        ctx.clearRect(0, 0, W, H);
        switch (state) {
            case 'intro': Intro.render(ctx, W, H); break;
            case 'mode-select':
            case 'lobby':
            case 'spellbook':
                ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); break;
            case 'battle': Battle.render(ctx, W, H); break;
            case 'campaign': Campaign.render(ctx, W, H); break;
        }
        requestAnimationFrame(gameLoop);
    }
    requestAnimationFrame(gameLoop);

    // ── MODE SELECT ──
    function showModeSelect() {
        document.getElementById('mode-select').classList.remove('hidden');
    }

    document.getElementById('modePvp').addEventListener('click', () => {
        gameMode = 'pvp';
        document.getElementById('mode-select').classList.add('hidden');
        state = 'lobby';
        showLobby();
    });

    document.getElementById('modeCampaign').addEventListener('click', () => {
        gameMode = 'campaign';
        document.getElementById('mode-select').classList.add('hidden');
        state = 'lobby';
        showLobby();
    });

    // ── LOBBY ──
    function showLobby() {
        document.getElementById('lobby').classList.remove('hidden');
        const lobbyTitle = document.querySelector('.lobby-sub');
        if (lobbyTitle) {
            lobbyTitle.textContent = gameMode === 'pvp'
                ? 'Two mages. Their formulas. One arena.'
                : 'Clear the dungeon together. Or alone.';
        }
        // Show solo button for campaign
        const soloBtn = document.getElementById('soloBtn');
        if (soloBtn) soloBtn.classList.toggle('hidden', gameMode !== 'campaign');
    }

    const netCallbacks = {
        onMessage: (data) => {
            if (state === 'spellbook' && data.type === 'opponent-ready') {
                Spellbook.updateStatus('Opponent is ready!');
                checkBothReady(data);
            } else if (state === 'spellbook' && data.type === 'start-battle') {
                startGame();
            } else if (state === 'battle') {
                Battle.handleNetMessage(data);
            } else if (state === 'campaign') {
                Campaign.handleNetMessage(data);
            }
        },
        onConnected: () => {
            document.getElementById('roomStatus').textContent = 'Connected! Entering spellbook...';
            document.getElementById('roomStatus').style.color = '#44cc66';
            setTimeout(() => {
                document.getElementById('lobby').classList.add('hidden');
                state = 'spellbook';
                Spellbook.init(onPlayerReady);
                Spellbook.show();
            }, 800);
        },
        onDisconnected: () => {
            document.getElementById('roomStatus').textContent = 'Disconnected.';
            document.getElementById('roomStatus').style.color = '#ff4444';
        },
    };

    document.getElementById('createRoom').addEventListener('click', async () => {
        document.getElementById('roomStatus').textContent = 'Creating room...';
        try {
            const code = await Network.createRoom(netCallbacks);
            document.getElementById('roomStatus').textContent = 'Share this code with your opponent:';
            const codeEl = document.getElementById('roomCodeDisplay');
            codeEl.textContent = code;
            codeEl.classList.remove('hidden');
        } catch (e) {
            document.getElementById('roomStatus').textContent = 'Error: ' + e.message;
            document.getElementById('roomStatus').style.color = '#ff4444';
        }
    });

    document.getElementById('joinRoom').addEventListener('click', async () => {
        const code = document.getElementById('roomCodeInput').value.trim();
        if (!code) return;
        document.getElementById('roomStatus').textContent = 'Connecting...';
        try {
            await Network.joinRoom(code, netCallbacks);
        } catch (e) {
            document.getElementById('roomStatus').textContent = 'Error: ' + e.message;
            document.getElementById('roomStatus').style.color = '#ff4444';
        }
    });

    // Solo campaign button
    document.getElementById('soloBtn').addEventListener('click', () => {
        document.getElementById('lobby').classList.add('hidden');
        state = 'spellbook';
        Spellbook.init(onPlayerReady);
        Spellbook.show();
    });

    // ── SPELLBOOK READY ──
    let playerReady = false;
    let opponentReady = false;

    function onPlayerReady(spells) {
        compiledSpells = spells;
        playerReady = true;

        if (gameMode === 'campaign' && !Network.isConnected()) {
            // Solo campaign — start immediately
            startGame();
            return;
        }

        Network.send({ type: 'opponent-ready' });
        Spellbook.updateStatus(opponentReady ? 'Both ready! Starting...' : 'Waiting for opponent...');
        if (opponentReady) {
            Network.send({ type: 'start-battle' });
            setTimeout(startGame, 500);
        }
    }

    function checkBothReady(data) {
        opponentReady = true;
        if (playerReady) {
            Spellbook.updateStatus('Both ready! Starting...');
            Network.send({ type: 'start-battle' });
            setTimeout(startGame, 500);
        }
    }

    function startGame() {
        if (state === 'battle' || state === 'campaign') return;
        Spellbook.hide();
        if (!compiledSpells) compiledSpells = Spellbook.compileSpells();

        if (gameMode === 'pvp') {
            state = 'battle';
            Battle.init(compiledSpells);
        } else {
            state = 'campaign';
            Campaign.init(compiledSpells, 0);
        }
    }

    // ── RESTART ──
    document.getElementById('restartBtn').addEventListener('click', () => {
        document.getElementById('victory-screen').classList.add('hidden');
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('campaign-hud').classList.add('hidden');
        state = 'mode-select';
        playerReady = false;
        opponentReady = false;
        showModeSelect();
    });

    // ── INPUT ──
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
    }

    canvas.addEventListener('click', () => { if (state === 'intro') Intro.onClick(); });
    canvas.addEventListener('mousedown', (e) => {
        if (state === 'intro') Intro.onMouseDown();
        else if (state === 'battle') { const c = getCanvasCoords(e); Battle.onMouseDown(c.x, c.y); }
        else if (state === 'campaign') { const c = getCanvasCoords(e); Campaign.onMouseDown(c.x, c.y); }
    });
    canvas.addEventListener('mouseup', () => {
        if (state === 'intro') Intro.onMouseUp();
        else if (state === 'battle') Battle.onMouseUp();
        else if (state === 'campaign') Campaign.onMouseUp();
    });
    document.addEventListener('mousemove', (e) => {
        if (state === 'battle') { const c = getCanvasCoords(e); Battle.onMouseMove(c.x, c.y); }
        else if (state === 'campaign') { const c = getCanvasCoords(e); Campaign.onMouseMove(c.x, c.y); }
    });
    document.addEventListener('keydown', (e) => {
        if (state === 'battle') {
            Battle.onKeyDown(e.key);
            if (e.key === ' ' || e.key === 'Shift') e.preventDefault();
        } else if (state === 'campaign') {
            Campaign.onKeyDown(e.key);
            if (e.key === ' ' || e.key === 'Shift') e.preventDefault();
        }
    });
    document.addEventListener('keyup', (e) => {
        if (state === 'battle') Battle.onKeyUp(e.key);
        else if (state === 'campaign') Campaign.onKeyUp(e.key);
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

})();
