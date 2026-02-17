// -----------------------------------------
//  CAMPAIGN MODE -- Co-op dungeon clearing
//  v3: Melee slash, Level/Skill system, stuck fix, cutscene sync, sounds everywhere
// -----------------------------------------

const Campaign = (() => {
    const BASE_MANA = 100;
    const BASE_HP = 150;
    const BASE_SPEED = 160;
    const BASE_DMG = 1;
    const DASH_SPEED = 700;
    const DASH_DURATION = 0.15;
    const BASE_DASH_COOLDOWN = 0.4;
    const DASH_CHAIN_WINDOW = 0.15;
    const DASH_INVULN = 0.25;
    const SYNC_RATE = 1 / 20;
    const PLAYER_RADIUS = 6;

    // Melee constants
    const MELEE_RANGE = 70;
    const MELEE_ARC = Math.PI * 0.75; // 135 degree cone
    const MELEE_COOLDOWN = 0.35;
    const MELEE_DURATION = 0.15;

    let player, allies;
    let playerSpells = [];
    let playerCasts = [];
    let allyCasts = [];
    let keys = {};
    let mouse = { x: 480, y: 270 };
    let currentDungeon = null;
    let currentFloor = 0;
    let gameOver = false;
    let paused = false;
    let syncTimer = 0;
    let xpGained = 0;
    let chestsOpened = 0;
    let bossDefeated = false;
    let floorCleared = false;
    let particles = [];
    let bossIntroPlayed = false;
    let floorIntroPlayed = false;
    let floorIntroTimer = 0;
    let stuckTimer = 0; // Track if player is stuck

    // Death / respawn
    let playerDead = false;
    let respawnTimer = 0;
    const RESPAWN_TIME = 10;

    // Melee state
    let meleeTimer = 0;
    let meleeCooldown = 0;
    let meleeAngle = 0;
    let meleeHitEnemies = []; // Already hit this swing
    let allyMelees = []; // { x, y, angle, timer }
    let lastSpellCast = -1; // Track spell spam
    let spamCount = 0;

    // Bot party system
    let bots = []; // Array of bot objects (also pushed to allies)
    let botIdCounter = 0;
    const BOT_COLORS = [
        { body: '#cc66ff', accent: '#ddaaff', name: 'Violet' },
        { body: '#ffaa44', accent: '#ffcc88', name: 'Amber' },
        { body: '#44ddcc', accent: '#88ffee', name: 'Teal' },
        { body: '#ff6688', accent: '#ffaacc', name: 'Rose' },
    ];
    const BOT_THINK_RATE = 0.3; // Seconds between AI decisions

    // Level & Skill system (persists across floors)
    let playerLevel = 1;
    let playerXP = 0;
    let skillPoints = 0;
    let skills = {
        damage: 0,  // +20% arcon & melee dmg per point
        vitality: 0, // +25 HP per point
        arcana: 0,  // +15 mana per point
        swiftness: 0, // +20 speed per point
        dash: 0,     // -0.05s dash cooldown per point
    };
    let showingLevelUp = false;
    let levelUpQueue = 0; // Pending level-ups to show

    // Round-robin skill chooser (replaces voting system)
    // One random player gets to choose, then another, etc.
    let roundRobinChooser = ''; // peerId of current chooser ('' = local player)
    let isMyTurn = false;       // true when local player picks
    let isCoopMode = false;     // true when allies exist
    let roundRobinOrder = [];   // shuffled list of player ids for round-robin
    let roundRobinIdx = 0;      // current index into roundRobinOrder

    function xpForLevel(lvl) { return Math.floor(40 + lvl * 25 + lvl * lvl * 5); }

    // ── SAVE / LOAD (checkpoints) ──
    function saveCheckpoint() {
        try {
            const data = {
                floor: currentFloor,
                level: playerLevel,
                xp: playerXP,
                skillPoints: skillPoints,
                skills: { ...skills },
                timestamp: Date.now(),
            };
            localStorage.setItem('arcform-campaign-save', JSON.stringify(data));
        } catch(e) { /* localStorage not available */ }
    }

    function loadCheckpoint() {
        try {
            const raw = localStorage.getItem('arcform-campaign-save');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch(e) { return null; }
    }

    function clearCheckpoint() {
        try { localStorage.removeItem('arcform-campaign-save'); } catch(e) {}
    }

    function hasSave() {
        return loadCheckpoint() !== null;
    }

    function restoreFromSave(compiledSpellsArr) {
        const save = loadCheckpoint();
        if (!save) return false;
        playerLevel = save.level || 1;
        playerXP = save.xp || 0;
        skillPoints = save.skillPoints || 0;
        if (save.skills) {
            for (const k in save.skills) {
                if (skills.hasOwnProperty(k)) skills[k] = save.skills[k];
            }
        }
        init(compiledSpellsArr, save.floor || 0);
        return true;
    }

    function getMaxHP() { return BASE_HP + skills.vitality * 25; }
    function getMaxMana() { return BASE_MANA + skills.arcana * 15; }
    function getSpeed() { return BASE_SPEED + skills.swiftness * 20; }
    function getDmg() { return BASE_DMG + skills.damage * 0.4; }
    function getDashCooldown() { return Math.max(0.1, BASE_DASH_COOLDOWN - skills.dash * 0.05); }
    function getMeleeDmg() { return Math.floor(4 + skills.damage * 1.5 + playerLevel * 0.8); }

    // Screen effects
    let screenShake = { x: 0, y: 0 };
    let hitFreeze = 0;
    let flashAlpha = 0;
    let vignetteIntensity = 0;

    function init(compiledSpells, floor) {
        currentFloor = floor || 0;
        currentDungeon = Dungeon.generate(currentFloor);
        Dungeon.preRender(currentDungeon);

        ArconSystem.setBoundsMode('dungeon', {
            x: 0, y: 0,
            w: currentDungeon.pixelW,
            h: currentDungeon.pixelH,
        });

        const maxHp = getMaxHP();
        const maxMana = getMaxMana();

        player = {
            id: 'player',
            x: currentDungeon.startX * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2,
            y: currentDungeon.startY * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2,
            hp: maxHp, maxHp: maxHp, mana: maxMana,
            hitRadius: 10, hitFlash: 0, speed: getSpeed(),
            dashing: false, dashTimer: 0, dashCooldown: 0,
            dashDirX: 0, dashDirY: 0,
            dashChainCount: 0, dashChainWindow: 0,
            invulnTimer: 0,
        };

        allies = [];
        // Re-add bots to allies after floor transition
        for (const bot of bots) {
            bot.x = player.x + (Math.random() - 0.5) * 40;
            bot.y = player.y + (Math.random() - 0.5) * 40;
            bot.maxHp = getMaxHP();
            bot.hp = bot.maxHp;
            bot.mana = getMaxMana();
            bot.speed = getSpeed();
            bot.level = playerLevel;
            bot.dashing = false;
            bot.dashCooldown = 0;
            bot.invulnTimer = 0;
            bot.deathTimer = 0;
            bot.aiThinkTimer = Math.random() * BOT_THINK_RATE;
            bot.aiTargetX = bot.x;
            bot.aiTargetY = bot.y;
            bot.castCooldown = 1 + Math.random();
            bot.meleeCooldown = 0;
            bot.hitFlash = 0;
            allies.push(bot);
            ArconSystem.onManaReturn(bot.id, (count) => {
                bot.mana = Math.min(getMaxMana(), bot.mana + count);
            });
        }
        playerSpells = compiledSpells;
        playerCasts = [];
        allyCasts = [];
        gameOver = false;
        playerDead = false;
        respawnTimer = 0;
        floorCleared = false;
        bossDefeated = false;
        bossIntroPlayed = false;
        floorIntroPlayed = false;
        floorIntroTimer = 2.5;
        chestsOpened = 0;
        xpGained = 0;
        keys = {};
        particles = [];
        syncTimer = 0;
        stuckTimer = 0;
        meleeTimer = 0;
        meleeCooldown = 0;
        meleeHitEnemies = [];
        allyMelees = [];
        lastSpellCast = -1;
        spamCount = 0;
        screenShake = { x: 0, y: 0 };
        hitFreeze = 0;
        flashAlpha = 0;
        showingLevelUp = false;

        ArconSystem.reset();
        Enemies.reset();
        Enemies.spawnFromDungeon(currentDungeon);

        // Set player arcon color from network
        const playerColor = (typeof Network !== 'undefined' && Network.getColor) ? Network.getColor() : '#4488ff';
        ArconSystem.setOwnerColor('player', playerColor);

        ArconSystem.onManaReturn('player', (count) => {
            player.mana = Math.min(getMaxMana(), player.mana + count);
        });

        document.getElementById('campaign-hud').classList.remove('hidden');
        document.getElementById('victory-screen').classList.add('hidden');

        const keysDiv = document.getElementById('camp-spellKeys');
        if (keysDiv) keysDiv.innerHTML = '';

        const themeKey = Dungeon.FLOOR_ORDER[currentFloor % Dungeon.FLOOR_ORDER.length];
        if (typeof Audio !== 'undefined') Audio.startMusic(themeKey);

        if (typeof Cutscene !== 'undefined' && currentFloor === 0) {
            Cutscene.startFloorIntro(themeKey, () => { floorIntroPlayed = true; });
        } else {
            floorIntroPlayed = true;
        }
    }

    function update(dt) {
        if (gameOver) return;

        // Respawn timer (still tick even if showing UI)
        if (playerDead && !gameOver) {
            respawnTimer -= dt;
            if (respawnTimer <= 0) {
                playerDead = false;
                player.hp = Math.floor(player.maxHp * 0.5);
                player.mana = Math.floor(getMaxMana() * 0.3);
                if (currentDungeon && currentDungeon.startX != null) {
                    player.x = currentDungeon.startX * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2;
                    player.y = currentDungeon.startY * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2;
                }
                player.invulnTimer = 2;
                flashAlpha = 0.3;
            }
        }

        // Level up UI blocking
        if (showingLevelUp) return;

        // Cutscene active
        if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) {
            Cutscene.update(dt);
            return;
        }

        if (floorIntroTimer > 0) floorIntroTimer -= dt;

        if (hitFreeze > 0) { hitFreeze -= dt; return; }

        // ── NaN GUARD ──
        if (isNaN(player.x) || isNaN(player.y)) {
            player.x = currentDungeon.startX * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2;
            player.y = currentDungeon.startY * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2;
        }

        // ── STUCK DETECTION ──
        if (!Dungeon.isWalkableBox(currentDungeon, player.x, player.y, PLAYER_RADIUS)) {
            stuckTimer += dt;
            if (stuckTimer > 0.1) {
                const fixed = Dungeon.clampToWalkable(currentDungeon, player.x, player.y, PLAYER_RADIUS);
                player.x = fixed.x;
                player.y = fixed.y;
                stuckTimer = 0;
            }
        } else {
            stuckTimer = 0;
        }

        // ── WORLD BOUNDS ──
        const bounded = Dungeon.enforceWorldBounds(player.x, player.y, currentDungeon);
        player.x = bounded.x;
        player.y = bounded.y;

        // Skip player input when dead
        if (playerDead) {
            // Still update passive systems
            if (player.hitFlash > 0) player.hitFlash -= dt;
        } else {
        // ── MOVEMENT ──
        let mx = 0, my = 0;
        if (keys['w'] || keys['arrowup']) my -= 1;
        if (keys['s'] || keys['arrowdown']) my += 1;
        if (keys['a'] || keys['arrowleft']) mx -= 1;
        if (keys['d'] || keys['arrowright']) mx += 1;

        if (player.dashChainWindow > 0) player.dashChainWindow -= dt;
        if (player.invulnTimer > 0) player.invulnTimer -= dt;

        // Dash
        if (player.dashing) {
            player.dashTimer -= dt;
            const dashMul = 1 + player.dashChainCount * 0.15;
            const nx = player.x + player.dashDirX * DASH_SPEED * dashMul * dt;
            const ny = player.y + player.dashDirY * DASH_SPEED * dashMul * dt;

            if (Dungeon.isWalkableBox(currentDungeon, nx, ny, PLAYER_RADIUS)) {
                player.x = nx; player.y = ny;
            } else if (Dungeon.isWalkableBox(currentDungeon, nx, player.y, PLAYER_RADIUS)) {
                player.x = nx;
            } else if (Dungeon.isWalkableBox(currentDungeon, player.x, ny, PLAYER_RADIUS)) {
                player.y = ny;
            } else {
                player.dashTimer = 0;
            }

            if (Math.random() < 0.8) {
                particles.push({
                    x: player.x + (Math.random() - 0.5) * 10,
                    y: player.y + (Math.random() - 0.5) * 10,
                    vx: -player.dashDirX * 40 + (Math.random() - 0.5) * 20,
                    vy: -player.dashDirY * 40 + (Math.random() - 0.5) * 20,
                    life: 0.3, maxLife: 0.3, size: 3, color: '#4488ff', type: 'dash',
                });
            }

            if (player.dashTimer <= 0) {
                player.dashing = false;
                player.dashChainWindow = DASH_CHAIN_WINDOW;
                for (let p = 0; p < 12; p++) {
                    particles.push({
                        x: player.x + (Math.random() - 0.5) * 20,
                        y: player.y + (Math.random() - 0.5) * 20,
                        vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80,
                        life: 0.4, maxLife: 0.4, size: 2 + Math.random() * 2, color: '#4488ff', type: 'dash',
                    });
                }
            }
        } else if (mx !== 0 || my !== 0) {
            const len = Math.sqrt(mx * mx + my * my);
            const nx = player.x + (mx / len) * player.speed * dt;
            const ny = player.y + (my / len) * player.speed * dt;

            if (Dungeon.isWalkableBox(currentDungeon, nx, ny, PLAYER_RADIUS)) {
                player.x = nx; player.y = ny;
            } else if (Dungeon.isWalkableBox(currentDungeon, nx, player.y, PLAYER_RADIUS)) {
                player.x = nx;
            } else if (Dungeon.isWalkableBox(currentDungeon, player.x, ny, PLAYER_RADIUS)) {
                player.y = ny;
            }
        }

        if (player.dashCooldown > 0) player.dashCooldown -= dt;
        if (player.hitFlash > 0) player.hitFlash -= dt;

        // ── MELEE ──
        if (meleeCooldown > 0) meleeCooldown -= dt;
        if (meleeTimer > 0) {
            meleeTimer -= dt;
            // Melee damage sweep
            const enemies = Enemies.getEnemies();
            for (const e of enemies) {
                if (!e.alive || meleeHitEnemies.includes(e)) continue;
                const dx = e.x - player.x, dy = e.y - player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > MELEE_RANGE * Dungeon.ZOOM) continue;
                const angle = Math.atan2(dy, dx);
                let diff = angle - meleeAngle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) < MELEE_ARC / 2) {
                    meleeHitEnemies.push(e);
                    const dmg = getMeleeDmg();
                    const xp = Enemies.damageEnemy(e, dmg);
                    if (xp > 0) addXP(xp);
                    if (Network.isConnected()) Network.send({ type: 'campaign-enemy-dmg', uid: e.uid, dmg });
                    // Knockback
                    const kbLen = Math.sqrt(dx * dx + dy * dy) || 1;
                    e.x += (dx / kbLen) * 20;
                    e.y += (dy / kbLen) * 20;
                    hitFreeze = 0.03;
                    screenShake = { x: 3, y: 3 };
                }
            }
        }

        // Update ally melee visuals
        for (let i = allyMelees.length - 1; i >= 0; i--) {
            allyMelees[i].timer -= dt;
            if (allyMelees[i].timer <= 0) allyMelees.splice(i, 1);
        }

        } // end playerDead else

        // Update bot AI
        updateBots(dt);
        // Update bot HUD periodically
        if (bots.length > 0 && Math.random() < 0.1) updateBotHUD();

        // Spell cooldowns
        for (const s of playerSpells) { if (s.currentCooldown > 0) s.currentCooldown -= dt; }

        // Update casts
        for (const c of playerCasts) ArconSystem.updateCast(c, dt);
        for (const c of allyCasts) ArconSystem.updateCast(c, dt);
        playerCasts = playerCasts.filter(c => c.active);
        allyCasts = allyCasts.filter(c => c.active);

        const worldEntities = [player, ...allies];
        ArconSystem.updateArcons(dt, worldEntities);

        // Arcon vs enemy
        updateArconsVsEnemies(dt);

        // Enemies
        const playersArr = [player, ...allies];
        Enemies.update(dt, playersArr, currentDungeon);

        // ── BOSS INTRO CUTSCENE (synced to all players) ──
        if (!bossIntroPlayed) {
            const boss = Enemies.getEnemies().find(e => e.isBoss);
            if (boss) {
                // Check if ANY player is near the boss
                let anyClose = false;
                for (const p of [player, ...allies]) {
                    const pdx = p.x - boss.x, pdy = p.y - boss.y;
                    if (Math.sqrt(pdx * pdx + pdy * pdy) < 200) { anyClose = true; break; }
                }
                if (anyClose) {
                    bossIntroPlayed = true;
                    if (typeof Audio !== 'undefined') Audio.bossMusic();
                    if (typeof Cutscene !== 'undefined') {
                        Cutscene.startBossIntro(boss.name, () => {});
                    }
                    // Sync to co-op partner
                    if (Network.isConnected()) {
                        Network.send({ type: 'campaign-cutscene', cutscene: 'boss-intro', boss: boss.name });
                    }
                }
            }
        }

        if (typeof Cutscene !== 'undefined') Cutscene.updateTaunts(dt);

        // Camera
        Dungeon.updateCamera(
            player.x / Dungeon.TILE_SIZE, player.y / Dungeon.TILE_SIZE,
            960, 540, currentDungeon
        );

        // ── TILE INTERACTIONS ──
        const ptx = Math.floor(player.x / Dungeon.TILE_SIZE);
        const pty = Math.floor(player.y / Dungeon.TILE_SIZE);
        const tile = Dungeon.tileAt(currentDungeon, ptx, pty);

        if (tile === Dungeon.TILE.CHEST) {
            currentDungeon.map[pty][ptx] = Dungeon.TILE.FLOOR;
            chestsOpened++;
            player.hp = Math.min(player.maxHp, player.hp + 30);
            player.mana = getMaxMana();
            flashAlpha = 0.3;
            Dungeon.preRender(currentDungeon);
            if (typeof Audio !== 'undefined') Audio.chest();
        }
        if (tile === Dungeon.TILE.SWITCH_OFF) {
            const toggled = Dungeon.toggleSwitch(currentDungeon, ptx, pty);
            if (toggled) {
                flashAlpha = 0.25;
                screenShake = { x: 4, y: 2 };
                if (typeof Audio !== 'undefined') Audio.chest(); // reuse chest sound for switch
                // Broadcast to co-op allies
                if (Network && Network.isHost()) {
                    Network.send({ type: 'campaign-switch', tx: ptx, ty: pty });
                }
            }
        }
        if (tile === Dungeon.TILE.TRAP) {
            currentDungeon.map[pty][ptx] = Dungeon.TILE.FLOOR;
            if (player.invulnTimer <= 0 && !player.dashing) {
                player.hp -= 15;
                player.hitFlash = 0.3;
                screenShake = { x: 3, y: 3 };
                if (typeof Audio !== 'undefined') Audio.trap();
            }
            Dungeon.preRender(currentDungeon);
        }
        // Spike traps (don't disappear, do less damage but repeatable)
        if (tile === Dungeon.TILE.SPIKE_TRAP) {
            if (player.invulnTimer <= 0 && !player.dashing) {
                player.hp -= 8;
                player.hitFlash = 0.2;
                player.invulnTimer = 0.5; // Brief invuln to prevent rapid hits
                screenShake = { x: 2, y: 2 };
                if (typeof Audio !== 'undefined') Audio.trap();
            }
        }
        // Cracked floor (collapses after stepping on it)
        if (tile === Dungeon.TILE.CRACKED_FLOOR) {
            // Mark for delayed collapse
            if (!player._crackedTimer) player._crackedTimer = {};
            const key = ptx + ',' + pty;
            if (!player._crackedTimer[key]) {
                player._crackedTimer[key] = 0.5; // Collapse after 0.5s
            }
        }
        // Update cracked floor timers
        if (player._crackedTimer) {
            for (const [key, timer] of Object.entries(player._crackedTimer)) {
                player._crackedTimer[key] -= dt;
                if (player._crackedTimer[key] <= 0) {
                    const [cx, cy] = key.split(',').map(Number);
                    if (currentDungeon.map[cy] && currentDungeon.map[cy][cx] === Dungeon.TILE.CRACKED_FLOOR) {
                        currentDungeon.map[cy][cx] = Dungeon.TILE.VOID;
                        Dungeon.preRender(currentDungeon);
                    }
                    delete player._crackedTimer[key];
                }
            }
        }
        // Rune tiles
        if (tile === Dungeon.TILE.RUNE_TILE) {
            Dungeon.activateRune(currentDungeon, ptx, pty);
            flashAlpha = 0.15;
            if (typeof Audio !== 'undefined') Audio.chest();
        }
        // Pressure plates
        if (tile === Dungeon.TILE.PRESSURE_PLATE) {
            const success = Dungeon.stepOnPlate(currentDungeon, ptx, pty);
            if (success) {
                flashAlpha = 0.15;
                if (typeof Audio !== 'undefined') Audio.chest();
            } else {
                // Wrong order feedback
                screenShake = { x: 3, y: 3 };
            }
        }
        // Portal teleportation
        if (tile === Dungeon.TILE.PORTAL_A || tile === Dungeon.TILE.PORTAL_B) {
            if (!player._portalCooldown || player._portalCooldown <= 0) {
                const dest = Dungeon.checkPortal(currentDungeon, player.x, player.y);
                if (dest) {
                    player.x = dest.x;
                    player.y = dest.y;
                    player._portalCooldown = 1.0; // Prevent instant re-teleport
                    flashAlpha = 0.5;
                    screenShake = { x: 6, y: 6 };
                    if (typeof Audio !== 'undefined') Audio.stairsDown();
                    // Snap camera to new position
                    Dungeon.updateCamera(
                        player.x / Dungeon.TILE_SIZE, player.y / Dungeon.TILE_SIZE,
                        960, 540, currentDungeon
                    );
                }
            }
        }
        if (player._portalCooldown > 0) player._portalCooldown -= dt;
        if (tile === Dungeon.TILE.STAIRS_DOWN && floorCleared) {
            if (typeof Audio !== 'undefined') Audio.stairsDown();
            saveCheckpoint(); // Checkpoint before next floor
            init(playerSpells, currentFloor + 1);
            return;
        }

        // Floor cleared
        const bossAlive = Enemies.getEnemies().some(e => e.isBoss);
        if (!bossAlive && Enemies.getEnemies().length === 0 && !floorCleared) {
            floorCleared = true;
            flashAlpha = 0.5;
            if (typeof Audio !== 'undefined') Audio.floorClear();
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Ambient themed particles
        const theme = currentDungeon.theme;
        if (Math.random() < 0.15) {
            const cam = Dungeon.getCamera();
            const viewW = 960 / Dungeon.ZOOM, viewH = 540 / Dungeon.ZOOM;
            particles.push({
                x: cam.x + Math.random() * viewW, y: cam.y + Math.random() * viewH,
                vx: (Math.random() - 0.5) * 10, vy: -5 - Math.random() * 10,
                life: 3, maxLife: 3, size: 1 + Math.random(), color: theme.accent, type: 'ambient',
            });
        }

        // Screen effects
        if (flashAlpha > 0) flashAlpha -= dt * 2;
        const shake = Enemies.getShake();
        if (shake > 0) {
            screenShake.x = (Math.random() - 0.5) * shake * 2;
            screenShake.y = (Math.random() - 0.5) * shake * 2;
        } else {
            screenShake.x *= 0.85; screenShake.y *= 0.85;
        }

        vignetteIntensity = Math.max(0, 1 - player.hp / player.maxHp) * 0.4;

        // Death / Respawn
        if (player.hp <= 0 && !gameOver && !playerDead) {
            playerDead = true;
            respawnTimer = RESPAWN_TIME;
            if (typeof Audio !== 'undefined') Audio.death();

            // Check if ALL human players are dead (TPK)
            const allAlliesDead = allies.filter(a => !a.isBot).every(a => a.hp <= 0);
            const botsAllDead = bots.length === 0 || bots.every(b => b.hp <= 0);
            if (allAlliesDead && botsAllDead) {
                // Total party kill
                gameOver = true;
                if (typeof Audio !== 'undefined') Audio.stopMusic();
                showCampaignEnd(false);
            }
        }

        // Network sync
        syncTimer -= dt;
        if (syncTimer <= 0 && Network.isConnected()) {
            syncTimer = SYNC_RATE;
            Network.send({
                type: 'campaign-state',
                x: player.x, y: player.y,
                hp: player.hp, mana: player.mana,
                dashing: player.dashing,
                level: playerLevel,
                color: (typeof Network !== 'undefined') ? Network.getColor() : '#4488ff',
            });
        }
    }

    function updateArconsVsEnemies(dt) {
        const arcons = ArconSystem.getArcons();
        const enemies = Enemies.getEnemies();
        const dmgMul = getDmg();

        for (let i = arcons.length - 1; i >= 0; i--) {
            const a = arcons[i];
            if (!a.alive || a.ownerId === 'enemy') continue;

            for (const e of enemies) {
                if (!e.alive) continue;
                const dx = a.x - e.x, dy = a.y - e.y;
                const hitDist = a.width / 2 + e.size / 2;
                if (dx * dx + dy * dy < hitDist * hitDist) {
                    a.alive = false;
                    const xp = Enemies.damageEnemy(e, Math.ceil(dmgMul));
                    if (xp > 0) addXP(xp);
                    if (Network.isConnected()) Network.send({ type: 'campaign-enemy-dmg', uid: e.uid, dmg: Math.ceil(dmgMul) });
                    break;
                }
            }
        }

        // Enemy projectiles vs player arcons (annihilation)
        const effects = Enemies.getEffects();
        for (let i = effects.length - 1; i >= 0; i--) {
            const fx = effects[i];
            if (fx.type !== 'projectile' || fx.owner !== 'enemy') continue;
            for (let j = arcons.length - 1; j >= 0; j--) {
                const a = arcons[j];
                if (!a.alive) continue;
                const dx = fx.x - a.x, dy = fx.y - a.y;
                if (Math.sqrt(dx * dx + dy * dy) < fx.size + a.width) {
                    a.alive = false;
                    effects.splice(i, 1);
                    break;
                }
            }
        }
    }

    // ── XP & LEVELING ──
    function addXP(amount) {
        xpGained += amount;
        playerXP += amount;

        // Share XP with allies in co-op
        if (Network.isConnected()) {
            Network.send({ type: 'campaign-xp', amount });
        }

        while (playerXP >= xpForLevel(playerLevel)) {
            playerXP -= xpForLevel(playerLevel);
            playerLevel++;
            skillPoints++;
            levelUpQueue++;
            if (typeof Audio !== 'undefined') Audio.levelUp();
            // Heal on level up
            player.maxHp = getMaxHP();
            player.hp = player.maxHp;
            player.mana = getMaxMana();
            player.speed = getSpeed();
            flashAlpha = 0.4;
        }
    }

    function spendSkillPoint(skill) {
        if (skillPoints <= 0) return;
        if (!skills.hasOwnProperty(skill)) return;
        skills[skill]++;
        skillPoints--;
        // Re-apply stats
        player.maxHp = getMaxHP();
        player.hp = Math.min(player.hp, player.maxHp);
        player.speed = getSpeed();
        if (typeof Audio !== 'undefined') Audio.menuClick();
    }

    // ── MELEE ──
    function doMelee(worldX, worldY) {
        if (gameOver || playerDead || meleeTimer > 0 || meleeCooldown > 0) return;
        if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) return;

        meleeAngle = Math.atan2(worldY - player.y, worldX - player.x);
        meleeTimer = MELEE_DURATION;
        meleeCooldown = MELEE_COOLDOWN;
        meleeHitEnemies = [];

        if (typeof Audio !== 'undefined') Audio.melee();

        // Melee slash particles
        for (let i = 0; i < 8; i++) {
            const a = meleeAngle - MELEE_ARC / 2 + (MELEE_ARC / 8) * i + (Math.random() - 0.5) * 0.2;
            const r = MELEE_RANGE * 0.4 + Math.random() * MELEE_RANGE * 0.6;
            particles.push({
                x: player.x + Math.cos(a) * r * 0.5,
                y: player.y + Math.sin(a) * r * 0.5,
                vx: Math.cos(a) * 100 + (Math.random() - 0.5) * 30,
                vy: Math.sin(a) * 100 + (Math.random() - 0.5) * 30,
                life: 0.2, maxLife: 0.2, size: 2 + Math.random() * 2,
                color: '#ffffff', type: 'melee',
            });
        }

        if (Network.isConnected()) {
            Network.send({ type: 'campaign-melee', x: player.x, y: player.y, angle: meleeAngle });
        }
    }

    // ── SPELLCASTING ──
    function castSpell(index) {
        if (gameOver || playerDead) return;
        if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) return;
        if (index < 0 || index >= playerSpells.length) return;
        const spell = playerSpells[index];
        if (spell.currentCooldown > 0) return;
        if (player.mana < spell.cost) return;

        player.mana -= spell.cost;

        // No cooldowns — only mana-gated
        spell.currentCooldown = 0;

        const world = Dungeon.screenToWorld(mouse.x, mouse.y);

        let closestEnemy = { x: world.x, y: world.y, id: 'target' };
        let closestDist = Infinity;
        for (const e of Enemies.getEnemies()) {
            const d = Math.sqrt((e.x - world.x) ** 2 + (e.y - world.y) ** 2);
            if (d < closestDist) { closestDist = d; closestEnemy = e; }
        }

        const cast = ArconSystem.castSpell(spell, player,
            { id: 'target', x: closestEnemy.x, y: closestEnemy.y },
            world.x, world.y, {
                hp: player.hp, maxHp: player.maxHp, mana: player.mana,
                maxMana: getMaxMana(), speed: player.speed, level: playerLevel,
                combo: 0, kills: 0, floor: currentFloor,
            }
        );
        playerCasts.push(cast);

        if (Network.isConnected()) {
            Network.send({
                type: 'campaign-cast', spellIndex: index,
                casterX: player.x, casterY: player.y,
                cursorX: world.x, cursorY: world.y, cost: spell.cost,
            });
        }
    }

    function doDash() {
        if (playerDead || player.dashing) return;
        if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) return;

        const isChain = player.dashChainWindow > 0 && player.dashChainCount > 0;
        if (!isChain && player.dashCooldown > 0) return;

        let dx = 0, dy = 0;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;

        if (dx === 0 && dy === 0) {
            const world = Dungeon.screenToWorld(mouse.x, mouse.y);
            dx = world.x - player.x; dy = world.y - player.y;
        }

        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        player.dashDirX = dx / len; player.dashDirY = dy / len;
        player.dashing = true;
        player.dashTimer = DASH_DURATION;
        player.invulnTimer = DASH_INVULN;

        const dashCd = getDashCooldown();
        if (isChain) {
            player.dashChainCount++;
            player.dashCooldown = Math.max(0.1, dashCd - player.dashChainCount * 0.1);
        } else {
            player.dashChainCount = 1;
            player.dashCooldown = dashCd;
        }

        flashAlpha = 0.05;
        if (typeof Audio !== 'undefined') Audio.dash();

        if (Network.isConnected()) {
            Network.send({
                type: 'campaign-dash', dirX: player.dashDirX, dirY: player.dashDirY,
                chain: player.dashChainCount,
            });
        }
    }

    // ── NETWORK ──
    function handleNetMessage(data, fromPeerId) {
        if (!data || !data.type) return;
        const pid = fromPeerId || 'ally';

        switch (data.type) {
            case 'campaign-state': {
                let ally = allies.find(a => a.id === pid);
                if (!ally) {
                    // Assign a unique color based on ally index
                    const allyIdx = allies.length + 1;
                    const colors = (typeof Network !== 'undefined' && Network.PARTY_COLORS) ? Network.PARTY_COLORS : ['#4488ff','#ff4444','#44cc66','#ff88ff','#ffaa22','#22ddff'];
                    const allyColor = data.color || colors[allyIdx % colors.length];
                    ally = {
                        id: pid, hp: getMaxHP(), maxHp: getMaxHP(),
                        mana: getMaxMana(), hitRadius: 10,
                        x: data.x, y: data.y, hitFlash: 0, dashing: data.dashing,
                        level: data.level || 1,
                        peerColor: allyColor,
                        peerAccent: allyColor + '88',
                    };
                    allies.push(ally);
                    ArconSystem.onManaReturn(pid, (count) => {
                        ally.mana = Math.min(getMaxMana(), ally.mana + count);
                    });
                    ArconSystem.setOwnerColor(pid, allyColor);
                }
                ally.x = data.x; ally.y = data.y;
                ally.hp = data.hp; ally.mana = data.mana;
                ally.dashing = data.dashing;
                ally.level = data.level || ally.level;
                if (data.color && !ally.botColor) { ally.peerColor = data.color; ally.peerAccent = data.color + '88'; }
                break;
            }
            case 'campaign-cast': {
                try {
                    const aim = Math.atan2(data.cursorY - data.casterY, data.cursorX - data.casterX);
                    const s = {
                        cost: data.cost,
                        xFn: (v) => data.casterX + Math.cos(aim) * 300 * (v.t - v.i * 0.02),
                        yFn: (v) => data.casterY + Math.sin(aim) * 300 * (v.t - v.i * 0.02),
                        emitDelayFn: (v) => v.i * 0.02, widthFn: () => 4,
                    };
                    const cast = ArconSystem.castSpell(s,
                        { id: pid, x: data.casterX, y: data.casterY },
                        { id: 'target', x: data.cursorX, y: data.cursorY },
                        data.cursorX, data.cursorY
                    );
                    allyCasts.push(cast);
                } catch(e) {}
                break;
            }
            case 'campaign-dash': {
                let ally = allies.find(a => a.id === pid);
                if (ally) {
                    ally.dashing = true;
                    setTimeout(() => { if (ally) ally.dashing = false; }, DASH_DURATION * 1000);
                }
                break;
            }
            case 'campaign-melee': {
                // Show ally melee visual
                allyMelees.push({ x: data.x, y: data.y, angle: data.angle, timer: MELEE_DURATION });
                break;
            }
            case 'campaign-cutscene': {
                // Receive cutscene trigger from partner
                if (data.cutscene === 'boss-intro' && !bossIntroPlayed) {
                    bossIntroPlayed = true;
                    if (typeof Audio !== 'undefined') Audio.bossMusic();
                    if (typeof Cutscene !== 'undefined') {
                        Cutscene.startBossIntro(data.boss, () => {});
                    }
                }
                break;
            }
            case 'campaign-xp': {
                // Receive shared XP from ally (don't re-broadcast)
                xpGained += data.amount;
                playerXP += data.amount;
                while (playerXP >= xpForLevel(playerLevel)) {
                    playerXP -= xpForLevel(playerLevel);
                    playerLevel++;
                    skillPoints++;
                    levelUpQueue++;
                    if (typeof Audio !== 'undefined') Audio.levelUp();
                    player.maxHp = getMaxHP();
                    player.hp = player.maxHp;
                    player.mana = getMaxMana();
                    player.speed = getSpeed();
                    flashAlpha = 0.4;
                }
                break;
            }
            case 'campaign-vote': {
                // Legacy vote handler — ignored (replaced by round-robin)
                break;
            }
            case 'campaign-skill-spend': {
                // Linked skill points: another player chose a skill for the whole party
                if (data.skill && skills.hasOwnProperty(data.skill)) {
                    spendSkillPoint(data.skill);
                    // Advance round-robin and close/advance level-up UI
                    roundRobinIdx++;
                    levelUpQueue--;
                    if (levelUpQueue > 0) {
                        setTimeout(() => { showLevelUpUI(); }, 800);
                    } else {
                        setTimeout(() => {
                            const overlay = document.getElementById('levelup-overlay');
                            if (overlay) overlay.classList.add('hidden');
                            showingLevelUp = false;
                        }, 600);
                    }
                }
                break;
            }
            case 'campaign-switch': {
                // Ally toggled a puzzle switch
                if (currentDungeon) {
                    Dungeon.toggleSwitch(currentDungeon, data.tx, data.ty);
                    flashAlpha = 0.2;
                    screenShake = { x: 3, y: 2 };
                    if (typeof Audio !== 'undefined') Audio.chest();
                }
                break;
            }
            case 'campaign-enemy-dmg': {
                // Ally damaged an enemy — apply locally (don't re-broadcast)
                const xp = Enemies.damageEnemyByUid(data.uid, data.dmg);
                if (xp > 0) addXP(xp);
                break;
            }
        }
    }

    function showCampaignEnd(win) {
        document.getElementById('campaign-hud').classList.add('hidden');
        const screen = document.getElementById('victory-screen');
        screen.classList.remove('hidden');
        const h1 = document.getElementById('victory-text');
        const sub = document.getElementById('victory-sub');
        if (win) {
            h1.textContent = 'FLOOR CLEARED';
            h1.style.color = '#ffd700';
            sub.textContent = 'XP: ' + xpGained + ' | Chests: ' + chestsOpened;
        } else {
            h1.textContent = 'FALLEN';
            h1.style.color = '#ff4444';
            sub.textContent = 'Floor ' + (currentFloor + 1) + ' -- Level ' + playerLevel;
        }
    }

    // ── RENDER ──
    function render(ctx, W, H) {
        const cam = Dungeon.getCamera();
        const ZOOM = Dungeon.ZOOM;

        ctx.save();
        ctx.translate(screenShake.x, screenShake.y);

        Dungeon.render(ctx, W, H);
        Enemies.render(ctx, cam.x, cam.y);

        // Arcons (world coords)
        ctx.save();
        ctx.scale(ZOOM, ZOOM);
        ctx.translate(-cam.x, -cam.y);
        ArconSystem.render(ctx);
        ctx.restore();

        // Particles
        ctx.save();
        ctx.scale(ZOOM, ZOOM);
        for (const p of particles) {
            const sx = p.x - cam.x, sy = p.y - cam.y;
            if (sx < -10 || sx > W/ZOOM + 10 || sy < -10 || sy > H/ZOOM + 10) continue;
            ctx.globalAlpha = (p.life / p.maxLife) * 0.6;
            ctx.fillStyle = p.color;
            ctx.fillRect(sx - p.size/2, sy - p.size/2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // Allies (including bots)
        for (const ally of allies) {
            if (ally.hp <= 0) continue; // Don't render dead bots
            const bodyCol = ally.peerColor || ally.botColor || '#44cc66';
            const accCol = ally.peerAccent || ally.botAccent || '#88ff88';
            renderCampaignMage(ctx, ally, cam, ZOOM, bodyCol, accCol);
        }

        // Player
        const myCol = (typeof Network !== 'undefined' && Network.getColor) ? Network.getColor() : '#4488ff';
        const myAccent = myCol.length >= 7 ? myCol + '88' : '#88bbff';
        renderCampaignMage(ctx, player, cam, ZOOM, myCol, myAccent);

        // ── MELEE SLASH ARC ──
        if (meleeTimer > 0) {
            const pScreen = Dungeon.worldToScreen(player.x, player.y);
            const progress = 1 - meleeTimer / MELEE_DURATION;
            const arcAlpha = 0.6 * (1 - progress);
            ctx.save();
            ctx.globalAlpha = arcAlpha;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(pScreen.x, pScreen.y, MELEE_RANGE * ZOOM * (0.3 + progress * 0.7),
                meleeAngle - MELEE_ARC / 2, meleeAngle + MELEE_ARC / 2);
            ctx.stroke();
            // Inner bright arc
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pScreen.x, pScreen.y, MELEE_RANGE * ZOOM * 0.6 * (0.3 + progress * 0.7),
                meleeAngle - MELEE_ARC / 2 + progress * 0.3, meleeAngle + MELEE_ARC / 2 - progress * 0.3);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        // Ally melee arcs
        for (const am of allyMelees) {
            const s = Dungeon.worldToScreen(am.x, am.y);
            const p = 1 - am.timer / MELEE_DURATION;
            ctx.save();
            ctx.globalAlpha = 0.4 * (1 - p);
            ctx.strokeStyle = '#44cc66';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(s.x, s.y, MELEE_RANGE * ZOOM * (0.3 + p * 0.7),
                am.angle - MELEE_ARC / 2, am.angle + MELEE_ARC / 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        // Boss taunts
        if (typeof Cutscene !== 'undefined') {
            ctx.save();
            ctx.scale(ZOOM, ZOOM);
            Cutscene.renderTaunts(ctx, cam.x, cam.y);
            ctx.restore();
        }

        // Aim line + crosshair
        if (!gameOver) {
            const pScreen = Dungeon.worldToScreen(player.x, player.y);
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = '#4488ff'; ctx.lineWidth = 1;
            ctx.setLineDash([3, 5]);
            ctx.beginPath(); ctx.moveTo(pScreen.x, pScreen.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha = 1;

            ctx.strokeStyle = '#4488ff'; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
            ctx.strokeRect(mouse.x - 4, mouse.y - 4, 8, 8);
            ctx.fillStyle = '#4488ff'; ctx.fillRect(mouse.x - 1, mouse.y - 1, 2, 2);
            ctx.globalAlpha = 1;
        }

        ctx.restore(); // screen shake

        // Post-processing
        if (flashAlpha > 0) {
            ctx.globalAlpha = flashAlpha;
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }
        if (vignetteIntensity > 0.05) {
            const grad = ctx.createRadialGradient(W/2, H/2, W * 0.3, W/2, H/2, W * 0.7);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(80,0,0,' + vignetteIntensity + ')');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
        }

        // Floor intro overlay
        if (floorIntroTimer > 0) {
            const alpha = Math.min(1, floorIntroTimer / 1.0);
            const theme = currentDungeon.theme;
            ctx.globalAlpha = alpha * 0.8;
            ctx.fillStyle = '#000'; ctx.fillRect(0, H/2 - 40, W, 80);
            ctx.globalAlpha = alpha; ctx.textAlign = 'center';
            ctx.fillStyle = theme.accent;
            ctx.font = 'bold 22px "Courier New", monospace';
            ctx.fillText('FLOOR ' + (currentFloor + 1), W/2, H/2 - 8);
            ctx.font = '14px "Courier New", monospace';
            ctx.fillStyle = '#d4c5a0';
            ctx.fillText(theme.name, W/2, H/2 + 18);
            ctx.globalAlpha = 1;
        }

        // Floor corner info
        const theme = currentDungeon.theme;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = theme.accent;
        ctx.font = '10px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('FLOOR ' + (currentFloor + 1) + ' -- ' + theme.name.toUpperCase(), W - 10, H - 8);
        ctx.globalAlpha = 1;

        // Floor cleared message
        if (floorCleared) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 16px "Courier New", monospace';
            ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 300) * 0.3;
            ctx.fillText('FLOOR CLEARED -- Find the stairs!', W/2, 30);
            ctx.globalAlpha = 1;
        }

        // Cutscene overlay
        if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) {
            Cutscene.render(ctx, W, H);
        }

        // ── LEVEL UP NOTIFICATION ──
        if (levelUpQueue > 0 && !showingLevelUp) {
            showingLevelUp = true;
            showLevelUpUI();
        }
        renderLevelHUD(ctx, W, H);

        // Respawn overlay
        if (playerDead && !gameOver) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 24px "Courier New", monospace';
            ctx.fillText('YOU DIED', W / 2, H / 2 - 30);
            ctx.fillStyle = '#ffd700';
            ctx.font = '16px "Courier New", monospace';
            ctx.fillText('Respawning in ' + Math.ceil(respawnTimer) + 's...', W / 2, H / 2 + 10);
            ctx.fillStyle = '#888';
            ctx.font = '11px "Courier New", monospace';
            ctx.fillText('Your allies are still fighting!', W / 2, H / 2 + 40);
            ctx.restore();
        }

        // Minimap
        const minimapCanvas = document.getElementById('minimapCanvas');
        if (minimapCanvas) {
            Dungeon.renderMinimap(minimapCanvas, currentDungeon, player.x, player.y, allies);
        }

        updateCampaignHUD();
    }

    // ── LEVEL HUD (top-right of screen, shows level & XP bar) ──
    function renderLevelHUD(ctx, W, H) {
        ctx.save();
        ctx.textAlign = 'right';

        // XP bar
        const barW = 100, barH = 6;
        const barX = W - barW - 10;
        const barY = H - 24;
        const xpPct = playerXP / xpForLevel(playerLevel);

        ctx.fillStyle = 'rgba(10,8,6,0.7)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        ctx.fillStyle = '#1a1510';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(barX, barY, barW * xpPct, barH);

        ctx.font = '9px "Courier New", monospace';
        ctx.fillStyle = '#aa8800';
        ctx.fillText('LV ' + playerLevel + (skillPoints > 0 ? ' [' + skillPoints + ' SP]' : ''), W - 10, barY - 4);

        ctx.restore();
    }

    // ── SKILL POINT ALLOCATION UI (round-robin chooser, linked skill points) ──
    function showLevelUpUI() {
        isCoopMode = Network.isConnected() && allies.filter(a => !a.isBot).length > 0;

        // Build round-robin order: shuffle all player ids
        if (isCoopMode && roundRobinOrder.length === 0) {
            const ids = ['self', ...Network.getPeerIds()];
            // Fisher-Yates shuffle
            for (let i = ids.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [ids[i], ids[j]] = [ids[j], ids[i]];
            }
            roundRobinOrder = ids;
            roundRobinIdx = 0;
        }

        // Determine whose turn it is
        if (isCoopMode) {
            const currentChooser = roundRobinOrder[roundRobinIdx % roundRobinOrder.length];
            isMyTurn = currentChooser === 'self';
            roundRobinChooser = currentChooser;
        } else {
            isMyTurn = true;
            roundRobinChooser = 'self';
        }

        // Create overlay
        let overlay = document.getElementById('levelup-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'levelup-overlay';
            overlay.className = 'overlay';
            overlay.style.zIndex = '200';
            overlay.innerHTML = `
                <div class="levelup-box">
                    <h2 class="levelup-title">LEVEL UP</h2>
                    <div class="levelup-level" id="levelup-level"></div>
                    <p class="levelup-sub">Choose a stat to improve</p>
                    <div id="vote-status" style="color:#ffd700;font-size:11px;margin-bottom:6px;display:none;"></div>
                    <div class="levelup-skills" id="levelup-skills"></div>
                    <button class="btn-gold levelup-done hidden" id="levelup-done">CONTINUE</button>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.classList.remove('hidden');

        document.getElementById('levelup-level').textContent = 'LEVEL ' + playerLevel;
        const voteStatus = document.getElementById('vote-status');
        const doneBtn = document.getElementById('levelup-done');

        if (isCoopMode) {
            voteStatus.style.display = 'block';
            if (isMyTurn) {
                voteStatus.textContent = '🎯 YOUR TURN — choose a stat for the whole party!';
                doneBtn.classList.add('hidden'); // clicking a skill auto-advances
            } else {
                const chooserName = roundRobinChooser.substring(0, 8);
                voteStatus.textContent = '⏳ Waiting for ' + chooserName + ' to choose...';
                doneBtn.classList.add('hidden');
            }
        } else {
            voteStatus.style.display = 'none';
            doneBtn.classList.add('hidden');
        }
        rebuildSkillButtons();

        // Auto-choose after 15s if it's our turn and we haven't picked
        if (isCoopMode && isMyTurn) {
            setTimeout(() => {
                if (showingLevelUp && isMyTurn && skillPoints > 0) {
                    const keys = Object.keys(skills);
                    const pick = keys[Math.floor(Math.random() * keys.length)];
                    applyLinkedSkillPoint(pick);
                }
            }, 15000);
        }
    }

    // Apply a skill point and broadcast to all party members (linked)
    function applyLinkedSkillPoint(skill) {
        if (skillPoints <= 0) return;
        spendSkillPoint(skill);

        // Broadcast to all party members — they apply the same skill
        if (Network.isConnected()) {
            Network.send({ type: 'campaign-skill-spend', skill: skill });
        }

        // Advance round-robin
        roundRobinIdx++;

        // Continue or close
        levelUpQueue--;
        if (levelUpQueue > 0) {
            // Next level-up: determine next chooser
            setTimeout(() => {
                showLevelUpUI();
            }, 800);
        } else {
            setTimeout(() => {
                const overlay = document.getElementById('levelup-overlay');
                if (overlay) overlay.classList.add('hidden');
                showingLevelUp = false;
            }, 600);
        }
    }

    function rebuildSkillButtons() {
        const container = document.getElementById('levelup-skills');
        container.innerHTML = '';

        const skillData = [
            { key: 'damage', name: 'DAMAGE', desc: '+20% arcon & melee damage', cur: skills.damage, color: '#ff4444' },
            { key: 'vitality', name: 'VITALITY', desc: '+25 max HP', cur: skills.vitality, color: '#44cc66' },
            { key: 'arcana', name: 'ARCANA', desc: '+15 max mana', cur: skills.arcana, color: '#4488ff' },
            { key: 'swiftness', name: 'SWIFTNESS', desc: '+20 movement speed', cur: skills.swiftness, color: '#ffaa44' },
            { key: 'dash', name: 'DASH', desc: '-0.05s dash cooldown', cur: skills.dash, color: '#aa88ff' },
        ];

        const canPick = isMyTurn || !isCoopMode;

        for (const s of skillData) {
            const btn = document.createElement('button');
            btn.className = 'levelup-skill-btn';
            btn.style.borderColor = s.color;
            btn.innerHTML = `
                <span class="skill-name" style="color:${s.color}">${s.name}</span>
                <span class="skill-pips">${'|'.repeat(s.cur)}${s.cur > 0 ? '' : '-'}</span>
                <span class="skill-desc">${s.desc}</span>
            `;
            if (canPick && skillPoints > 0) {
                btn.onclick = () => {
                    if (isCoopMode) {
                        applyLinkedSkillPoint(s.key);
                    } else {
                        spendSkillPoint(s.key);
                        levelUpQueue--;
                        if (levelUpQueue > 0) {
                            rebuildSkillButtons();
                        } else {
                            const overlay = document.getElementById('levelup-overlay');
                            if (overlay) overlay.classList.add('hidden');
                            showingLevelUp = false;
                        }
                    }
                };
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.4';
                if (isCoopMode && !isMyTurn) btn.style.cursor = 'not-allowed';
            }
            container.appendChild(btn);
        }

        // Update SP display
        const spLabel = document.querySelector('.levelup-sub');
        if (spLabel) {
            spLabel.textContent = skillPoints > 0
                ? 'Skill Points: ' + skillPoints
                : 'No skill points remaining';
        }
    }

    function renderCampaignMage(ctx, mage, cam, zoom, color, light) {
        const screen = Dungeon.worldToScreen(mage.x, mage.y);
        const sx = screen.x, sy = screen.y;
        if (sx < -30 || sx > 990 || sy < -30 || sy > 570) return;

        const flash = mage.hitFlash > 0;
        const isDashing = mage.dashing;
        const s = zoom;
        const t = performance.now() / 1000;

        // Determine animation state
        const isPlayer = mage === player;
        const isMoving = isPlayer ? (keys['w'] || keys['s'] || keys['a'] || keys['d'] || keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright']) : false;
        const isMeleeing = isPlayer ? (meleeTimer > 0) : false;
        const isHurt = mage.hitFlash > 0.1;

        let animState = 'idle';
        if (isDashing) animState = 'dash';
        else if (isHurt) animState = 'hurt';
        else if (isMeleeing) animState = 'melee';
        else if (isMoving) animState = 'walk';

        // Animation calculations
        const walkBob = Math.sin(t * 10) * 2;
        const idleBob = Math.sin(t * 2.5) * 1.5;
        const breathe = Math.sin(t * 3) * 0.5;

        let bodyOffY = 0, headOffY = 0, legLOff = 0, legROff = 0, armAngle = 0, bodyTilt = 0;

        switch (animState) {
            case 'idle':
                bodyOffY = idleBob;
                headOffY = idleBob * 0.7;
                armAngle = Math.sin(t * 1.5) * 0.1;
                break;
            case 'walk':
                bodyOffY = Math.abs(walkBob) * 0.5;
                headOffY = Math.abs(walkBob) * 0.3;
                legLOff = walkBob * 1.5;
                legROff = -walkBob * 1.5;
                armAngle = Math.sin(t * 10) * 0.4;
                break;
            case 'dash':
                bodyOffY = -2;
                headOffY = -3;
                bodyTilt = (mage.dashDirX || 0) * 0.2;
                break;
            case 'melee': {
                const prog = 1 - meleeTimer / MELEE_DURATION;
                bodyOffY = -1;
                armAngle = -1.5 + prog * 3;
                bodyTilt = Math.sin(prog * Math.PI) * 0.15;
                break;
            }
            case 'hurt':
                bodyOffY = Math.sin(t * 30) * 2;
                headOffY = Math.sin(t * 30 + 1) * 2;
                break;
        }

        ctx.save();

        // Dash afterimages
        if (isDashing) {
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = color;
            ctx.fillRect(sx - 8*s, sy - 16*s, 16*s, 28*s);
            ctx.globalAlpha = 0.06;
            const stretchX = (mage.dashDirX || 0) * -20 * s;
            const stretchY = (mage.dashDirY || 0) * -20 * s;
            ctx.fillRect(sx - 6*s + stretchX, sy - 12*s + stretchY, 12*s, 24*s);
        }

        ctx.globalAlpha = isDashing ? 0.5 : 1;

        // Shadow
        ctx.globalAlpha *= 0.3;
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - 7*s, sy + 9*s, 14*s, 3*s);
        ctx.globalAlpha = isDashing ? 0.5 : 1;

        // Transform for body animation
        ctx.save();
        ctx.translate(sx, sy + bodyOffY * s);
        if (bodyTilt) ctx.rotate(bodyTilt);

        ctx.fillStyle = flash ? '#fff' : color;

        // Legs (animated)
        ctx.fillRect(-5*s, 4*s + legLOff * s, 4*s, 6*s);
        ctx.fillRect(1*s, 4*s + legROff * s, 4*s, 6*s);

        // Body
        ctx.fillRect(-5*s, (-6 + breathe)*s, 10*s, 10*s);

        // Head
        const headY = (-14 + headOffY) * s;
        ctx.fillRect(-4*s, headY, 8*s, 8*s);

        // Hat
        if (!flash) ctx.fillStyle = light;
        ctx.fillRect(-6*s, headY - 2*s, 12*s, 2*s);
        ctx.fillRect(-3*s, headY - 6*s, 6*s, 4*s);
        ctx.fillRect(-1*s, headY - 8*s, 2*s, 2*s);

        // Wand arm (rotates)
        ctx.save();
        ctx.translate(5*s, -2*s);
        ctx.rotate(armAngle);
        if (!flash) ctx.fillStyle = '#ffd700';
        ctx.fillRect(0, -2*s, 2*s, 12*s);
        ctx.globalAlpha = (isDashing ? 0.3 : 0.5) + Math.sin(t * 5) * 0.3;
        ctx.fillStyle = flash ? '#fff' : '#ffd700';
        ctx.fillRect(-1*s, -4*s, 4*s, 4*s);
        ctx.globalAlpha = isDashing ? 0.5 : 1;
        ctx.restore();

        // Eyes (with blinking)
        const blinkPhase = t % 4;
        const eyeH = (blinkPhase > 3.85 && blinkPhase < 3.95) ? 1*s : 2*s;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2*s, headY + 2*s, 2*s, eyeH);
        ctx.fillRect(1*s, headY + 2*s, 2*s, eyeH);

        ctx.restore(); // body transform

        // Invuln shimmer
        if (mage.invulnTimer > 0) {
            ctx.globalAlpha = 0.15 + Math.sin(t * 50) * 0.1;
            ctx.fillStyle = '#88ccff';
            ctx.fillRect(sx - 8*s, sy - 16*s, 16*s, 28*s);
            ctx.globalAlpha = 1;
        }

        // Level badge
        const lvl = isPlayer ? playerLevel : (mage.level || 1);
        if (lvl > 1) {
            ctx.font = 'bold 8px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd700';
            ctx.globalAlpha = 0.7;
            ctx.fillText('Lv' + lvl, sx, sy + 16*s);
            ctx.globalAlpha = 1;
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function updateCampaignHUD() {
        const hpEl = document.getElementById('camp-hp');
        const hpText = document.getElementById('camp-hp-text');
        const manaEl = document.getElementById('camp-mana');
        const manaText = document.getElementById('camp-mana-text');
        const dashEl = document.getElementById('camp-dash');

        if (hpEl) hpEl.style.width = ((player.hp / player.maxHp) * 100) + '%';
        if (hpText) hpText.textContent = Math.ceil(player.hp);
        if (manaEl) manaEl.style.width = ((player.mana / getMaxMana()) * 100) + '%';
        if (manaText) manaText.textContent = Math.ceil(player.mana);

        if (dashEl) {
            if (player.dashCooldown > 0) {
                dashEl.textContent = 'DASH ' + player.dashCooldown.toFixed(1) + 's';
                dashEl.className = 'dash-cd';
            } else {
                const chainText = player.dashChainWindow > 0 ? ' [CHAIN x' + player.dashChainCount + ']' : '';
                dashEl.textContent = 'DASH [SHIFT]' + chainText;
                dashEl.className = 'dash-cd ready';
            }
        }

        const keysDiv = document.getElementById('camp-spellKeys');
        if (keysDiv && keysDiv.children.length === 0) {
            for (let i = 0; i < playerSpells.length; i++) {
                const el = document.createElement('div');
                el.className = 'spell-key-hud';
                el.id = 'camp-spell-hud-' + i;
                el.innerHTML = '<span class="key-num">' + (i + 1) + '</span><span>' + playerSpells[i].name.substring(0, 4) + '</span>';
                keysDiv.appendChild(el);
            }
        }
        for (let i = 0; i < playerSpells.length; i++) {
            const el = document.getElementById('camp-spell-hud-' + i);
            if (!el) continue;
            el.className = 'spell-key-hud';
            if (playerSpells[i].currentCooldown > 0) el.classList.add('on-cd');
            else if (player.mana < playerSpells[i].cost) el.classList.add('no-mana');
        }

        const countEl = document.getElementById('camp-enemies');
        if (countEl) {
            const remaining = Enemies.getEnemies().length;
            countEl.textContent = remaining > 0 ? 'ENEMIES: ' + remaining : 'CLEAR';
            countEl.style.color = remaining > 0 ? '#ff6644' : '#44cc66';
        }
    }

    // ── INPUT ──
    function onKeyDown(key) {
        keys[key.toLowerCase()] = true;

        if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) {
            if (key === ' ' || key === 'Enter') { Cutscene.advance(); return; }
        }

        if (showingLevelUp) return;

        if (key === 'Shift' || key === ' ') doDash();
        const num = parseInt(key);
        if (num >= 1 && num <= 6) castSpell(num - 1);
    }
    function onKeyUp(key) { keys[key.toLowerCase()] = false; }
    function onMouseMove(x, y) { mouse.x = x; mouse.y = y; }
    function onMouseDown(x, y) {
        mouse.x = x; mouse.y = y;

        if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) {
            Cutscene.advance();
            return;
        }
        if (showingLevelUp) return;

        // Left click = melee
        const world = Dungeon.screenToWorld(x, y);
        doMelee(world.x, world.y);
    }
    function onMouseUp() {}

    // ── BOT AI SYSTEM ──
    function addBot() {
        if (bots.length >= 4) return; // Max 4 bots
        const colorSet = BOT_COLORS[bots.length % BOT_COLORS.length];
        botIdCounter++;
        const bot = {
            id: 'bot_' + botIdCounter,
            isBot: true,
            botName: colorSet.name,
            botColor: colorSet.body,
            botAccent: colorSet.accent,
            x: player ? player.x + (Math.random() - 0.5) * 40 : 480,
            y: player ? player.y + (Math.random() - 0.5) * 40 : 270,
            hp: getMaxHP(),
            maxHp: getMaxHP(),
            mana: getMaxMana(),
            hitRadius: 10,
            hitFlash: 0,
            speed: getSpeed(),
            dashing: false,
            dashCooldown: 0,
            dashDirX: 0, dashDirY: 0,
            invulnTimer: 0,
            level: playerLevel,
            // AI state
            aiThinkTimer: Math.random() * BOT_THINK_RATE,
            aiTargetX: 0, aiTargetY: 0,
            aiState: 'follow', // follow, fight, retreat, heal
            castCooldown: 1 + Math.random(),
            meleeCooldown: 0,
        };
        bots.push(bot);
        if (allies.indexOf(bot) === -1) allies.push(bot);
        ArconSystem.onManaReturn(bot.id, (count) => {
            bot.mana = Math.min(getMaxMana(), bot.mana + count);
        });
        updateBotHUD();
    }

    function removeBot() {
        if (bots.length === 0) return;
        const bot = bots.pop();
        const idx = allies.indexOf(bot);
        if (idx >= 0) allies.splice(idx, 1);
        updateBotHUD();
    }

    function updateBots(dt) {
        for (const bot of bots) {
            if (bot.hp <= 0) {
                // Dead bot: respawn after 5 seconds with half HP
                bot.deathTimer = (bot.deathTimer || 0) + dt;
                if (bot.deathTimer >= 5) {
                    bot.hp = Math.floor(bot.maxHp * 0.5);
                    bot.mana = Math.floor(getMaxMana() * 0.3);
                    bot.x = player.x + (Math.random() - 0.5) * 30;
                    bot.y = player.y + (Math.random() - 0.5) * 30;
                    bot.deathTimer = 0;
                }
                continue;
            }

            // Mana regen
            bot.mana = Math.min(getMaxMana(), bot.mana + dt * 3);
            bot.maxHp = getMaxHP();
            bot.level = playerLevel;
            bot.speed = getSpeed();

            // Invuln and flash timers
            if (bot.invulnTimer > 0) bot.invulnTimer -= dt;
            if (bot.hitFlash > 0) bot.hitFlash -= dt;
            if (bot.dashCooldown > 0) bot.dashCooldown -= dt;
            if (bot.castCooldown > 0) bot.castCooldown -= dt;
            if (bot.meleeCooldown > 0) bot.meleeCooldown -= dt;

            // AI thinking
            bot.aiThinkTimer -= dt;
            if (bot.aiThinkTimer <= 0) {
                bot.aiThinkTimer = BOT_THINK_RATE + Math.random() * 0.1;
                botThink(bot);
            }

            // Move toward AI target
            const tdx = bot.aiTargetX - bot.x;
            const tdy = bot.aiTargetY - bot.y;
            const tDist = Math.sqrt(tdx * tdx + tdy * tdy);
            if (tDist > 8) {
                const moveSpeed = bot.speed * dt;
                const ndx = tdx / tDist;
                const ndy = tdy / tDist;
                const nx = bot.x + ndx * moveSpeed;
                const ny = bot.y + ndy * moveSpeed;
                if (currentDungeon && Dungeon.isWalkableBox(currentDungeon, nx, ny, 5)) {
                    bot.x = nx; bot.y = ny;
                } else if (currentDungeon && Dungeon.isWalkableBox(currentDungeon, nx, bot.y, 5)) {
                    bot.x = nx;
                } else if (currentDungeon && Dungeon.isWalkableBox(currentDungeon, bot.x, ny, 5)) {
                    bot.y = ny;
                }
            }

            // NaN guard
            if (isNaN(bot.x) || isNaN(bot.y)) {
                bot.x = player.x; bot.y = player.y;
            }

            // World bounds
            if (currentDungeon) {
                const b = Dungeon.enforceWorldBounds(bot.x, bot.y, currentDungeon);
                bot.x = b.x; bot.y = b.y;
            }
        }
    }

    function botThink(bot) {
        const enemies = Enemies.getEnemies().filter(e => e.alive);
        let nearestEnemy = null, nearestDist = Infinity;
        for (const e of enemies) {
            const dx = e.x - bot.x, dy = e.y - bot.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < nearestDist) { nearestDist = d; nearestEnemy = e; }
        }

        const hpPct = bot.hp / bot.maxHp;

        // State decision
        if (hpPct < 0.25 && nearestDist < 120) {
            bot.aiState = 'retreat';
        } else if (nearestEnemy && nearestDist < 200) {
            bot.aiState = 'fight';
        } else {
            bot.aiState = 'follow';
        }

        switch (bot.aiState) {
            case 'follow': {
                // Follow player at offset distance
                const angle = Math.random() * Math.PI * 2;
                bot.aiTargetX = player.x + Math.cos(angle) * 40;
                bot.aiTargetY = player.y + Math.sin(angle) * 40;
                break;
            }
            case 'fight': {
                if (!nearestEnemy) break;
                // Move to attack range
                const dx = nearestEnemy.x - bot.x;
                const dy = nearestEnemy.y - bot.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                if (dist < 60) {
                    // Close enough to melee
                    if (bot.meleeCooldown <= 0) {
                        botDoMelee(bot, nearestEnemy);
                    }
                    // Strafe around enemy
                    const perpAngle = Math.atan2(dy, dx) + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2);
                    bot.aiTargetX = bot.x + Math.cos(perpAngle) * 50;
                    bot.aiTargetY = bot.y + Math.sin(perpAngle) * 50;
                } else {
                    // Move toward enemy
                    bot.aiTargetX = nearestEnemy.x - (dx / dist) * 45;
                    bot.aiTargetY = nearestEnemy.y - (dy / dist) * 45;
                }

                // Cast spells at range
                if (bot.castCooldown <= 0 && dist < 180 && bot.mana >= 10 && playerSpells.length > 0) {
                    botCastSpell(bot, nearestEnemy);
                }
                break;
            }
            case 'retreat': {
                // Run away from nearest enemy, toward player
                if (nearestEnemy) {
                    const dx = bot.x - nearestEnemy.x;
                    const dy = bot.y - nearestEnemy.y;
                    const d = Math.sqrt(dx * dx + dy * dy) || 1;
                    bot.aiTargetX = bot.x + (dx / d) * 80;
                    bot.aiTargetY = bot.y + (dy / d) * 80;
                } else {
                    bot.aiTargetX = player.x;
                    bot.aiTargetY = player.y;
                }
                // Emergency dash
                if (hpPct < 0.15 && bot.dashCooldown <= 0 && nearestDist < 80) {
                    botDash(bot, nearestEnemy);
                }
                break;
            }
        }
    }

    function botDoMelee(bot, target) {
        const angle = Math.atan2(target.y - bot.y, target.x - bot.x);
        bot.meleeCooldown = MELEE_COOLDOWN + Math.random() * 0.2;

        // Damage enemies in arc
        const meleeDmg = getMeleeDmg();
        for (const e of Enemies.getEnemies()) {
            if (!e.alive) continue;
            const dx = e.x - bot.x, dy = e.y - bot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > MELEE_RANGE) continue;
            const eAngle = Math.atan2(dy, dx);
            let angleDiff = eAngle - angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            if (Math.abs(angleDiff) <= MELEE_ARC / 2) {
                const xp = Enemies.damageEnemy(e, meleeDmg, bot.x, bot.y, 20);
                if (xp > 0) {
                    xpGained += xp;
                    playerXP += xp;
                }
                if (Network.isConnected()) Network.send({ type: 'campaign-enemy-dmg', uid: e.uid, dmg: meleeDmg });
            }
        }

        // Visual melee arc
        allyMelees.push({ x: bot.x, y: bot.y, angle, timer: MELEE_DURATION });

        // Particles
        for (let i = 0; i < 4; i++) {
            const a = angle - MELEE_ARC/2 + (MELEE_ARC / 4) * i;
            const r = MELEE_RANGE * 0.5;
            particles.push({
                x: bot.x + Math.cos(a) * r * 0.5,
                y: bot.y + Math.sin(a) * r * 0.5,
                vx: Math.cos(a) * 80, vy: Math.sin(a) * 80,
                life: 0.15, maxLife: 0.15, size: 2, color: bot.botColor, type: 'melee',
            });
        }
    }

    function botCastSpell(bot, target) {
        // Pick a random spell that bot can afford
        const affordable = playerSpells.filter(s => bot.mana >= s.cost && !(s.currentCooldown > 0));
        if (affordable.length === 0) return;
        const spell = affordable[Math.floor(Math.random() * affordable.length)];

        bot.mana -= spell.cost;
        bot.castCooldown = 1.5 + Math.random() * 1.5;

        const cast = ArconSystem.castSpell(spell,
            { id: bot.id, x: bot.x, y: bot.y },
            { id: 'target', x: target.x, y: target.y },
            target.x, target.y, {
                hp: bot.hp, maxHp: bot.maxHp, mana: bot.mana,
                maxMana: getMaxMana(), speed: bot.speed, level: playerLevel,
                combo: 0, kills: 0, floor: currentFloor,
            }
        );
        allyCasts.push(cast);
    }

    function botDash(bot, awayFrom) {
        let dx = bot.x - awayFrom.x, dy = bot.y - awayFrom.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= len; dy /= len;
        const dashDist = DASH_SPEED * DASH_DURATION;
        const nx = bot.x + dx * dashDist;
        const ny = bot.y + dy * dashDist;
        if (currentDungeon && Dungeon.isWalkableBox(currentDungeon, nx, ny, 5)) {
            bot.x = nx; bot.y = ny;
        }
        bot.dashCooldown = getDashCooldown();
        bot.invulnTimer = DASH_INVULN;
    }

    function getBotCount() { return bots.length; }

    function updateBotHUD() {
        let container = document.getElementById('bot-party-hud');
        if (!container) {
            container = document.createElement('div');
            container.id = 'bot-party-hud';
            container.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:20;';
            document.getElementById('campaign-hud').appendChild(container);
        }
        container.innerHTML = '';
        for (const bot of bots) {
            const div = document.createElement('div');
            div.style.cssText = 'background:rgba(0,0,0,0.7);border:1px solid ' + bot.botColor + ';border-radius:4px;padding:2px 6px;font:9px monospace;color:#fff;text-align:center;min-width:50px;';
            const hpPct = Math.max(0, bot.hp / bot.maxHp);
            const hpColor = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#cccc44' : '#cc4444';
            div.innerHTML = '<span style="color:' + bot.botColor + '">' + bot.botName + '</span>'
                + '<div style="height:3px;background:#333;margin-top:2px;border-radius:1px;">'
                + '<div style="height:100%;width:' + (hpPct*100) + '%;background:' + hpColor + ';border-radius:1px;"></div></div>';
            container.appendChild(div);
        }
    }

    return {
        init, update, render, handleNetMessage,
        onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp,
        isGameOver: () => gameOver,
        getFloor: () => currentFloor,
        hasSave, restoreFromSave, clearCheckpoint,
        addBot, removeBot, getBotCount,
    };
})();
