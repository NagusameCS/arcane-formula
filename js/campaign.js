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
    const MELEE_RANGE = 40;
    const MELEE_ARC = Math.PI * 0.6; // 108 degree cone
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

    // Melee state
    let meleeTimer = 0;
    let meleeCooldown = 0;
    let meleeAngle = 0;
    let meleeHitEnemies = []; // Already hit this swing
    let allyMelees = []; // { x, y, angle, timer }
    let lastSpellCast = -1; // Track spell spam
    let spamCount = 0;

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

    // Co-op voting system
    let coopVotes = {}; // { peerId: skillKey }
    let myVote = null;
    let voteTimeout = null;
    let isCoopMode = false; // Set to true when allies exist

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
    function getMeleeDmg() { return Math.floor(8 + skills.damage * 4 + playerLevel * 2); }

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
        playerSpells = compiledSpells;
        playerCasts = [];
        allyCasts = [];
        gameOver = false;
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

        // Level up UI blocking
        if (showingLevelUp) return;

        // Cutscene active
        if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) {
            Cutscene.update(dt);
            return;
        }

        if (floorIntroTimer > 0) floorIntroTimer -= dt;

        if (hitFreeze > 0) { hitFreeze -= dt; return; }

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

        // Death
        if (player.hp <= 0 && !gameOver) {
            gameOver = true;
            if (typeof Audio !== 'undefined') { Audio.death(); Audio.stopMusic(); }
            showCampaignEnd(false);
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
        if (gameOver || meleeTimer > 0 || meleeCooldown > 0) return;
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
        if (gameOver) return;
        if (typeof Cutscene !== 'undefined' && Cutscene.isActive()) return;
        if (index < 0 || index >= playerSpells.length) return;
        const spell = playerSpells[index];
        if (spell.currentCooldown > 0) return;
        if (player.mana < spell.cost) return;

        player.mana -= spell.cost;

        // Spam penalty: casting same spell repeatedly increases cooldown
        if (index === lastSpellCast) {
            spamCount = Math.min(spamCount + 1, 5);
        } else {
            spamCount = 0;
        }
        lastSpellCast = index;
        spell.currentCooldown = spell.cooldown * (1 + spamCount * 0.3);

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
        if (player.dashing) return;
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
                    ally = {
                        id: pid, hp: getMaxHP(), maxHp: getMaxHP(),
                        mana: getMaxMana(), hitRadius: 10,
                        x: data.x, y: data.y, hitFlash: 0, dashing: data.dashing,
                        level: data.level || 1,
                    };
                    allies.push(ally);
                    ArconSystem.onManaReturn(pid, (count) => {
                        ally.mana = Math.min(getMaxMana(), ally.mana + count);
                    });
                }
                ally.x = data.x; ally.y = data.y;
                ally.hp = data.hp; ally.mana = data.mana;
                ally.dashing = data.dashing;
                ally.level = data.level || ally.level;
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
                // Ally voted for a skill
                coopVotes[pid] = data.skill;
                updateVoteDisplay();
                checkVoteConsensus();
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

        // Allies
        for (const ally of allies) {
            renderCampaignMage(ctx, ally, cam, ZOOM, '#44cc66', '#88ff88');
        }

        // Player
        renderCampaignMage(ctx, player, cam, ZOOM, '#4488ff', '#88bbff');

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

    // ── SKILL POINT ALLOCATION UI (with co-op voting) ──
    function showLevelUpUI() {
        isCoopMode = Network.isConnected() && allies.length > 0;
        coopVotes = {};
        myVote = null;

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
                    <button class="btn-gold levelup-done" id="levelup-done">CONTINUE</button>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.classList.remove('hidden');

        document.getElementById('levelup-level').textContent = 'LEVEL ' + playerLevel;
        const voteStatus = document.getElementById('vote-status');
        if (isCoopMode) {
            voteStatus.style.display = 'block';
            voteStatus.textContent = 'Co-op: Vote on stat upgrade! Majority wins.';
        } else {
            voteStatus.style.display = 'none';
        }
        rebuildSkillButtons();

        document.getElementById('levelup-done').onclick = () => {
            if (isCoopMode && !myVote) return; // Must vote in co-op
            levelUpQueue--;
            if (levelUpQueue > 0) {
                coopVotes = {};
                myVote = null;
                rebuildSkillButtons();
            } else {
                overlay.classList.add('hidden');
                showingLevelUp = false;
            }
        };

        // Auto-close vote after 15s in co-op
        if (isCoopMode) {
            if (voteTimeout) clearTimeout(voteTimeout);
            voteTimeout = setTimeout(() => {
                if (showingLevelUp && !myVote) {
                    // Auto-vote random
                    const keys = Object.keys(skills);
                    myVote = keys[Math.floor(Math.random() * keys.length)];
                    coopVotes['self'] = myVote;
                    Network.send({ type: 'campaign-vote', skill: myVote });
                    checkVoteConsensus();
                }
            }, 15000);
        }
    }

    function updateVoteDisplay() {
        const voteStatus = document.getElementById('vote-status');
        if (!voteStatus || !isCoopMode) return;
        const totalPlayers = allies.length + 1;
        const totalVotes = Object.keys(coopVotes).length + (myVote ? 1 : 0);
        const voteCounts = {};
        if (myVote) voteCounts[myVote] = (voteCounts[myVote] || 0) + 1;
        for (const v of Object.values(coopVotes)) {
            voteCounts[v] = (voteCounts[v] || 0) + 1;
        }
        const voteStrs = Object.entries(voteCounts).map(([k, v]) => k.toUpperCase() + ':' + v).join(' ');
        voteStatus.textContent = `Votes (${totalVotes}/${totalPlayers}): ${voteStrs || 'none yet'}`;
        rebuildSkillButtons();
    }

    function checkVoteConsensus() {
        if (!isCoopMode) return;
        const totalPlayers = allies.length + 1;
        const totalVotes = Object.keys(coopVotes).length + (myVote ? 1 : 0);
        if (totalVotes < totalPlayers) return; // Wait for all

        // Count votes
        const voteCounts = {};
        if (myVote) voteCounts[myVote] = (voteCounts[myVote] || 0) + 1;
        for (const v of Object.values(coopVotes)) {
            voteCounts[v] = (voteCounts[v] || 0) + 1;
        }

        // Find winner (highest votes, tie = random among tied)
        let maxVotes = 0;
        for (const v of Object.values(voteCounts)) { if (v > maxVotes) maxVotes = v; }
        const winners = Object.entries(voteCounts).filter(([, v]) => v === maxVotes).map(([k]) => k);
        const winner = winners[Math.floor(Math.random() * winners.length)];

        // Apply the voted skill
        spendSkillPoint(winner);

        const voteStatus = document.getElementById('vote-status');
        if (voteStatus) voteStatus.textContent = `Vote result: ${winner.toUpperCase()} wins!`;

        // Auto-continue after 1.5s
        setTimeout(() => {
            levelUpQueue--;
            if (levelUpQueue > 0) {
                coopVotes = {};
                myVote = null;
                rebuildSkillButtons();
                if (document.getElementById('vote-status')) {
                    document.getElementById('vote-status').textContent = 'Co-op: Vote on stat upgrade!';
                }
            } else {
                const overlay = document.getElementById('levelup-overlay');
                if (overlay) overlay.classList.add('hidden');
                showingLevelUp = false;
            }
        }, 1500);
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

        // Count votes for display
        const voteCounts = {};
        if (myVote) voteCounts[myVote] = (voteCounts[myVote] || 0) + 1;
        for (const v of Object.values(coopVotes)) {
            voteCounts[v] = (voteCounts[v] || 0) + 1;
        }

        for (const s of skillData) {
            const btn = document.createElement('button');
            btn.className = 'levelup-skill-btn';
            btn.style.borderColor = s.color;
            const voteIndicator = isCoopMode && voteCounts[s.key] ? ` [${voteCounts[s.key]} vote${voteCounts[s.key] > 1 ? 's' : ''}]` : '';
            const myVoteMarker = myVote === s.key ? ' ★' : '';
            btn.innerHTML = `
                <span class="skill-name" style="color:${s.color}">${s.name}${myVoteMarker}</span>
                <span class="skill-pips">${'|'.repeat(s.cur)}${s.cur > 0 ? '' : '-'}${voteIndicator}</span>
                <span class="skill-desc">${s.desc}</span>
            `;
            if (isCoopMode) {
                // Co-op mode: clicking is a vote, not a direct spend
                if (!myVote) {
                    btn.onclick = () => {
                        myVote = s.key;
                        Network.send({ type: 'campaign-vote', skill: s.key });
                        updateVoteDisplay();
                        checkVoteConsensus();
                    };
                } else {
                    btn.disabled = true;
                    btn.style.opacity = myVote === s.key ? '1' : '0.4';
                }
            } else {
                // Solo mode: direct spend
                if (skillPoints > 0) {
                    btn.onclick = () => {
                        spendSkillPoint(s.key);
                        rebuildSkillButtons();
                    };
                } else {
                    btn.disabled = true;
                    btn.style.opacity = '0.4';
                }
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

    return {
        init, update, render, handleNetMessage,
        onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp,
        isGameOver: () => gameOver,
        getFloor: () => currentFloor,
        hasSave, restoreFromSave, clearCheckpoint,
    };
})();
