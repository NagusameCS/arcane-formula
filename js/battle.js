// ─────────────────────────────────────────────
//  BATTLE ARENA — Multi-player PvP (2+) with game modes
//  Modes: FFA, Teams, KOTH, Boss, Gauntlet, Survival,
//         Target Practice, Duel, Solo (vs AI bots)
//  v10: solo mode, boundary clamping, smarter AI, enemy spells, 5x boss HP
// ─────────────────────────────────────────────

const Battle = (() => {
    const MANA_MAX = 100, MANA_REGEN = 3, MANA_REGEN_BURNOUT = 0.5;
    const HP_MAX = 100, BURNOUT_THRESHOLD = 0.7, BACKLASH_DAMAGE = 10;
    const DASH_SPEED = 700, DASH_DURATION = 0.15, DASH_COOLDOWN = 0.5;
    const DASH_CHAIN_WINDOW = 0.15, DASH_INVULN = 0.25;
    const SYNC_RATE = 1 / 20;
    const MELEE_RANGE = 75, MELEE_ARC = Math.PI * 0.75;
    const MELEE_COOLDOWN = 0.35, MELEE_DURATION = 0.15, MELEE_DAMAGE = 6;
    const ARENA_W = 960, ARENA_H = 540;
    const ARENA_PAD = 20; // boundary padding

    let player, enemies = {};          // peerId → enemy obj
    let playerSpells = [], playerCasts = [], enemyCasts = [];
    let keys = {}, mouse = { x: 480, y: 270 };
    let gameOver = false, winner = '';
    let syncTimer = 0, arenaParticles = [];
    let meleeTimer = 0, meleeCooldown = 0, meleeAngle = 0, meleeHit = false;
    let enemyMelees = [];

    // ── Mode state ──
    let arenaMode = 'ffa';            // current sub-mode
    let scores = {};                   // peerId → score (kills)
    let playerScore = 0;
    let teamAssignments = {};          // peerId → 0 or 1
    let playerTeam = 0;
    let teamScores = [0, 0];

    // KOTH
    let kothZone = { x: 480, y: 270, r: 60 };
    let kothHolder = '';
    let kothTimer = 0;
    const KOTH_WIN = 30;

    // Boss / Gauntlet
    let arenaBosses = [], gauntletIndex = 0, gauntletBossOrder = [];

    // Survival
    let survivalWave = 0, survivalEnemies = [], survivalSpawnTimer = 0;
    let survivalScore = 0;

    // Target Practice
    let targetDummies = [], targetTimer = 60, targetHits = 0;

    // Respawn
    const RESPAWN_TIME = 5;
    let playerDead = false, respawnTimer = 0;

    // ── Solo mode bots ──
    let soloBots = [];                 // AI controlled enemies for solo mode
    const SOLO_BOT_COUNT = 3;

    // ── Random spells for non-boss mobs ──
    const MOB_SPELL_EXPRS = [
        { xExpr: 'cx+cos(atan2(cy2-cy,cx2-cx))*300*(t-i*0.03)', yExpr: 'cy+sin(atan2(cy2-cy,cx2-cx))*300*(t-i*0.03)', emitExpr: 'i*0.03', widthExpr: '3', name: 'bolt' },
        { xExpr: 'cx+cos(atan2(cy2-cy,cx2-cx)+sin(t*3)*0.3)*200*t', yExpr: 'cy+sin(atan2(cy2-cy,cx2-cx)+sin(t*3)*0.3)*200*t', emitExpr: 'i*0.04', widthExpr: '5', name: 'wave' },
        { xExpr: 'cx+cos(atan2(cy2-cy,cx2-cx)+i*0.5)*150*t', yExpr: 'cy+sin(atan2(cy2-cy,cx2-cx)+i*0.5)*150*t', emitExpr: 'i*0.06', widthExpr: '3', name: 'scatter' },
        { xExpr: 'cx+cos(atan2(cy2-cy,cx2-cx))*250*(t-i*0.02)', yExpr: 'cy+sin(atan2(cy2-cy,cx2-cx))*250*(t-i*0.02)+sin(t*8)*20', emitExpr: 'i*0.02', widthExpr: '4', name: 'zigzag' },
    ];

    const ENEMY_COLORS = ['#ff4444','#44ff88','#ff88ff','#ffaa22','#22ddff','#cccc44','#ff6688','#88ff44'];
    const TEAM_COLORS  = [['#4488ff','#88bbff'], ['#ff4444','#ff8877']];
    const BOT_NAMES = ['Pyros','Glacius','Voltarc','Umbral','Solara','Toxin','Zephyr','Crimson'];

    function getEnemies() { return Object.values(enemies); }

    // ── Boundary clamping helper ──
    function clampArena(x, y) {
        return {
            x: Math.max(ARENA_PAD, Math.min(ARENA_W - ARENA_PAD, x)),
            y: Math.max(ARENA_PAD, Math.min(ARENA_H - ARENA_PAD, y)),
        };
    }
    function inArena(x, y) {
        return x >= ARENA_PAD && x <= ARENA_W - ARENA_PAD && y >= ARENA_PAD && y <= ARENA_H - ARENA_PAD;
    }

    function nearestEnemy() {
        let best = null, bd = Infinity;
        for (const e of getEnemies()) {
            if (!e.alive) continue;
            const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }

    function makeEnemy(pid, x, y, idx) {
        // Assign a random spell to non-boss enemies
        const spellTemplate = MOB_SPELL_EXPRS[Math.floor(Math.random() * MOB_SPELL_EXPRS.length)];
        let compiledSpell = null;
        try {
            compiledSpell = {
                cost: Math.floor(MANA_MAX * 0.5), // half player's mana
                xFn: Parser.compile(spellTemplate.xExpr),
                yFn: Parser.compile(spellTemplate.yExpr),
                emitDelayFn: Parser.compile(spellTemplate.emitExpr),
                widthFn: Parser.compile(spellTemplate.widthExpr),
                xExpr: spellTemplate.xExpr,
                yExpr: spellTemplate.yExpr,
                emitExpr: spellTemplate.emitExpr,
                widthExpr: spellTemplate.widthExpr,
                name: spellTemplate.name,
            };
        } catch(e) {}

        return {
            id: pid, x, y, hp: HP_MAX, mana: MANA_MAX, hitRadius: 12,
            hitFlash: 0, burnout: 0, speed: 150,
            dashing: false, dashTimer: 0, dashCooldown: 0, dashDirX: 0, dashDirY: 0,
            dashChainCount: 0, dashChainWindow: 0, invulnTimer: 0,
            color: ENEMY_COLORS[idx % ENEMY_COLORS.length],
            colorLight: ENEMY_COLORS[idx % ENEMY_COLORS.length] + '88',
            alive: true, score: 0, team: -1,
            // AI fields
            isBot: false,
            spell: compiledSpell,
            spellCd: 2 + Math.random() * 3,
            aiState: 'idle',
            aiTimer: Math.random() * 1.5,
            aiTargetX: x, aiTargetY: y,
            meleeCd: 0,
            dashAiCd: 0,
        };
    }

    // ════════════════════════════════════════
    //  SOLO BOT creation
    // ════════════════════════════════════════
    function spawnSoloBots(count) {
        soloBots = [];
        for (let i = 0; i < count; i++) {
            const pid = 'bot_' + i;
            const bx = 200 + Math.random() * 560;
            const by = 100 + Math.random() * 340;
            const enemy = makeEnemy(pid, bx, by, i);
            enemy.isBot = true;
            enemy.speed = 120 + Math.random() * 40;
            enemies[pid] = enemy;
            soloBots.push(pid);
            ArconSystem.onManaReturn(pid, (n) => { if (enemies[pid]) enemies[pid].mana = Math.min(MANA_MAX, enemies[pid].mana + n); });
        }
    }

    // ════════════════════════════════════════
    //  INIT
    // ════════════════════════════════════════
    function init(compiledSpells, mode) {
        ArconSystem.setBoundsMode('arena');
        arenaMode = mode || 'ffa';

        player = {
            id: 'player', x: 200, y: 270, hp: HP_MAX, mana: MANA_MAX,
            hitRadius: 12, hitFlash: 0, burnout: 0, speed: 150,
            dashing: false, dashTimer: 0, dashCooldown: 0, dashDirX: 0, dashDirY: 0,
            dashChainCount: 0, dashChainWindow: 0, invulnTimer: 0, alive: true,
        };
        enemies = {};
        playerSpells = compiledSpells;
        playerCasts = []; enemyCasts = [];
        gameOver = false; winner = '';
        keys = {}; arenaParticles = [];
        syncTimer = 0; meleeTimer = 0; meleeCooldown = 0; meleeHit = false;
        enemyMelees = [];
        playerScore = 0; scores = {};
        playerDead = false; respawnTimer = 0;
        arenaBosses = []; gauntletIndex = 0;
        survivalWave = 0; survivalEnemies = []; survivalSpawnTimer = 2; survivalScore = 0;
        targetDummies = []; targetTimer = 60; targetHits = 0;
        teamScores = [0, 0]; teamAssignments = {};
        kothHolder = ''; kothTimer = 0;
        soloBots = [];

        ArconSystem.reset();
        ArconSystem.onManaReturn('player', (n) => { player.mana = Math.min(MANA_MAX, player.mana + n); });

        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('victory-screen').classList.add('hidden');

        const keysDiv = document.getElementById('spellKeys');
        keysDiv.innerHTML = '';
        for (let i = 0; i < playerSpells.length; i++) {
            const el = document.createElement('div');
            el.className = 'spell-key-hud'; el.id = 'spell-hud-' + i;
            el.innerHTML = '<span class="key-num">' + (i + 1) + '</span><span>' + playerSpells[i].name.substring(0, 4) + '</span>';
            keysDiv.appendChild(el);
        }

        // Mode label
        const modeLabel = document.getElementById('pvp-mode-label');
        const modeNames = { ffa:'FREE FOR ALL', teams:'TEAM DEATHMATCH', koth:'KING OF THE HILL',
            boss:'BOSS FIGHT', gauntlet:'BOSS GAUNTLET', survival:'SURVIVAL',
            target:'TARGET PRACTICE', duel:'1v1 DUEL', solo:'SOLO VS BOTS' };
        if (modeLabel) modeLabel.textContent = modeNames[arenaMode] || arenaMode.toUpperCase();

        // Teams setup
        if (arenaMode === 'teams') { playerTeam = 0; }

        // Solo mode: spawn AI bots
        if (arenaMode === 'solo') {
            spawnSoloBots(SOLO_BOT_COUNT);
        }

        // Boss / Gauntlet (5x HP applied in spawnArenaBoss)
        if (arenaMode === 'boss') {
            spawnArenaBoss(randomBossKey());
        } else if (arenaMode === 'gauntlet') {
            gauntletBossOrder = shuffleArray(Object.keys(Enemies.BOSSES));
            spawnArenaBoss(gauntletBossOrder[0]);
        }

        // Survival
        if (arenaMode === 'survival') {
            survivalWave = 0;
            spawnSurvivalWave();
        }

        // Target Practice
        if (arenaMode === 'target') {
            spawnTargets();
        }

        // KOTH
        if (arenaMode === 'koth') {
            kothZone = { x: 480, y: 270, r: 60 };
            kothTimer = 0; kothHolder = '';
        }
    }

    // ════════════════════════════════════════
    //  BOSS HELPERS — 5x HP
    // ════════════════════════════════════════
    function randomBossKey() {
        const k = Object.keys(Enemies.BOSSES);
        return k[Math.floor(Math.random() * k.length)];
    }
    function shuffleArray(a) {
        a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a;
    }
    function spawnArenaBoss(key) {
        const bd = Enemies.BOSSES[key]; if (!bd) return;
        const bossHp = bd.hp * 5; // ★ 5x boss HP
        arenaBosses.push({
            name: key, isBoss: true, x: 700, y: 270,
            hp: bossHp, maxHp: bossHp, speed: bd.speed || 40,
            size: bd.size || 30, color: bd.color || '#ff4444',
            dmg: bd.dmg || 15, alive: true, hitFlash: 0, attackCd: 0,
            phase: 1, phaseMax: bd.phases || 2,
            spawnTimer: 1, animTimer: 0, animFrame: 0, facing: -1,
            _meleeHitThisSwing: false,
        });
    }

    // ════════════════════════════════════════
    //  SURVIVAL HELPERS
    // ════════════════════════════════════════
    function spawnSurvivalWave() {
        survivalWave++;
        const count = 3 + survivalWave * 2;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const cx = 480, cy = 270, dist = 300;
            const spellT = MOB_SPELL_EXPRS[Math.floor(Math.random() * MOB_SPELL_EXPRS.length)];
            let compiledMobSpell = null;
            try {
                compiledMobSpell = {
                    cost: Math.floor(MANA_MAX * 0.5),
                    xFn: Parser.compile(spellT.xExpr),
                    yFn: Parser.compile(spellT.yExpr),
                    emitDelayFn: Parser.compile(spellT.emitExpr),
                    widthFn: Parser.compile(spellT.widthExpr),
                };
            } catch(e) {}
            survivalEnemies.push({
                x: cx + Math.cos(angle) * dist,
                y: cy + Math.sin(angle) * dist,
                hp: 3 + survivalWave, maxHp: 3 + survivalWave,
                speed: 40 + survivalWave * 5, size: 10 + Math.min(survivalWave, 8),
                color: ENEMY_COLORS[i % ENEMY_COLORS.length],
                dmg: 5 + survivalWave * 2, alive: true,
                hitFlash: 0, attackCd: 0,
                mana: 50, spell: compiledMobSpell, spellCd: 3 + Math.random() * 4,
            });
        }
    }

    // ════════════════════════════════════════
    //  TARGET PRACTICE HELPERS
    // ════════════════════════════════════════
    function spawnTargets() {
        targetDummies = [];
        for (let i = 0; i < 6; i++) {
            targetDummies.push({
                x: 100 + Math.random() * 760, y: 80 + Math.random() * 380,
                size: 14, alive: true, hitFlash: 0,
                respawnTimer: 0, maxRespawn: 2,
            });
        }
    }

    // ════════════════════════════════════════
    //  BOT AI (for solo mode + smarter enemies)
    // ════════════════════════════════════════
    function updateBotAI(dt) {
        for (const pid of soloBots) {
            const bot = enemies[pid];
            if (!bot || !bot.alive) {
                // Respawn dead bots after RESPAWN_TIME
                if (bot && !bot.alive) {
                    bot._respawnTimer = (bot._respawnTimer || RESPAWN_TIME) - dt;
                    if (bot._respawnTimer <= 0) {
                        bot.alive = true; bot.hp = HP_MAX; bot.mana = MANA_MAX;
                        const c = clampArena(200 + Math.random() * 560, 100 + Math.random() * 340);
                        bot.x = c.x; bot.y = c.y;
                        bot.invulnTimer = 2; bot._respawnTimer = RESPAWN_TIME;
                    }
                }
                continue;
            }

            // Mana regen
            bot.mana = Math.min(MANA_MAX, bot.mana + MANA_REGEN * dt);
            if (bot.invulnTimer > 0) bot.invulnTimer -= dt;
            if (bot.hitFlash > 0) bot.hitFlash -= dt;
            if (bot.dashAiCd > 0) bot.dashAiCd -= dt;
            if (bot.meleeCd > 0) bot.meleeCd -= dt;
            if (bot.spellCd > 0) bot.spellCd -= dt;

            bot.aiTimer -= dt;
            if (bot.aiTimer <= 0) {
                bot.aiTimer = 0.3 + Math.random() * 0.5;
                botDecide(bot);
            }

            // Move toward AI target
            const dx = bot.aiTargetX - bot.x;
            const dy = bot.aiTargetY - bot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 10) {
                bot.x += (dx / dist) * bot.speed * dt;
                bot.y += (dy / dist) * bot.speed * dt;
            }
            const c = clampArena(bot.x, bot.y);
            bot.x = c.x; bot.y = c.y;

            // Dash AI
            if (bot.dashAiCd <= 0 && bot.aiState === 'fight') {
                const toPlayer = Math.sqrt((player.x - bot.x) ** 2 + (player.y - bot.y) ** 2);
                if (toPlayer < 80 && Math.random() < 0.02) {
                    botDoDash(bot, player);
                }
            }

            // Melee AI
            if (bot.meleeCd <= 0 && bot.aiState === 'fight') {
                const toPlayer = Math.sqrt((player.x - bot.x) ** 2 + (player.y - bot.y) ** 2);
                if (toPlayer < MELEE_RANGE && player.alive && !playerDead) {
                    botDoMelee(bot);
                }
            }

            // Spell casting AI
            if (bot.spellCd <= 0 && bot.spell && bot.mana >= bot.spell.cost && bot.aiState === 'fight') {
                botCastSpell(bot);
            }
        }
    }

    function botDecide(bot) {
        if (!player.alive || playerDead) { bot.aiState = 'wander'; }
        else {
            const dx = player.x - bot.x, dy = player.y - bot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const hpPct = bot.hp / HP_MAX;

            if (hpPct < 0.25 && dist < 150) {
                // Retreat when low HP
                bot.aiState = 'retreat';
                const len = dist || 1;
                bot.aiTargetX = bot.x - (dx / len) * 120;
                bot.aiTargetY = bot.y - (dy / len) * 120;
                const c = clampArena(bot.aiTargetX, bot.aiTargetY);
                bot.aiTargetX = c.x; bot.aiTargetY = c.y;
            } else if (dist < 250) {
                // Fight: strafe around player
                bot.aiState = 'fight';
                const perpAngle = Math.atan2(dy, dx) + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
                const strafeDist = 60 + Math.random() * 40;
                bot.aiTargetX = player.x + Math.cos(perpAngle) * strafeDist;
                bot.aiTargetY = player.y + Math.sin(perpAngle) * strafeDist;
                const c = clampArena(bot.aiTargetX, bot.aiTargetY);
                bot.aiTargetX = c.x; bot.aiTargetY = c.y;
            } else {
                // Chase
                bot.aiState = 'fight';
                bot.aiTargetX = player.x + (Math.random() - 0.5) * 60;
                bot.aiTargetY = player.y + (Math.random() - 0.5) * 60;
                const c = clampArena(bot.aiTargetX, bot.aiTargetY);
                bot.aiTargetX = c.x; bot.aiTargetY = c.y;
            }
        }
    }

    function botDoDash(bot, away) {
        const dx = bot.x - away.x, dy = bot.y - away.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        bot.dashDirX = dx / len; bot.dashDirY = dy / len;
        bot.dashing = true; bot.dashTimer = DASH_DURATION; bot.invulnTimer = DASH_INVULN;
        bot.dashAiCd = DASH_COOLDOWN + Math.random();
        setTimeout(() => { if (bot) bot.dashing = false; }, DASH_DURATION * 1000);
    }

    function botDoMelee(bot) {
        const angle = Math.atan2(player.y - bot.y, player.x - bot.x);
        bot.meleeCd = MELEE_COOLDOWN + 0.3 + Math.random() * 0.5;
        enemyMelees.push({ x: bot.x, y: bot.y, angle: angle, timer: MELEE_DURATION, peerId: bot.id });

        // Actually damage player if in range and arc
        if (!player.dashing && player.invulnTimer <= 0 && player.alive) {
            const dx = player.x - bot.x, dy = player.y - bot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < MELEE_RANGE) {
                const a = Math.atan2(dy, dx);
                let diff = a - angle; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) < MELEE_ARC / 2) {
                    player.hp -= MELEE_DAMAGE; player.hitFlash = 0.3;
                    if (typeof Audio !== 'undefined') Audio.playerHurt();
                    if (player.hp <= 0 && player.alive) { playerDead = true; player.alive = false; respawnTimer = RESPAWN_TIME; }
                }
            }
        }
    }

    function botCastSpell(bot) {
        if (!bot.spell || !player.alive) return;
        bot.mana -= bot.spell.cost;
        bot.spellCd = 3 + Math.random() * 3;

        try {
            const cast = ArconSystem.castSpell(bot.spell,
                { id: bot.id, x: bot.x, y: bot.y },
                player,
                player.x, player.y);
            enemyCasts.push(cast);
        } catch(e) {}
    }

    // ════════════════════════════════════════
    //  UPDATE
    // ════════════════════════════════════════
    function update(dt) {
        if (gameOver) return;

        // ── Respawn ──
        if (playerDead) {
            respawnTimer -= dt;
            if (respawnTimer <= 0) {
                playerDead = false; player.alive = true;
                player.hp = HP_MAX; player.mana = MANA_MAX;
                const c = clampArena(100 + Math.random() * 300, 100 + Math.random() * 340);
                player.x = c.x; player.y = c.y;
                player.invulnTimer = 2;
            }
            updatePassive(dt);
            if (arenaMode === 'solo') updateBotAI(dt);
            return;
        }

        // ── Player movement ──
        let mx = 0, my = 0;
        if (keys['w'] || keys['arrowup']) my -= 1;
        if (keys['s'] || keys['arrowdown']) my += 1;
        if (keys['a'] || keys['arrowleft']) mx -= 1;
        if (keys['d'] || keys['arrowright']) mx += 1;

        if (player.dashing) {
            player.dashTimer -= dt;
            const mul = 1 + player.dashChainCount * 0.15;
            player.x += player.dashDirX * DASH_SPEED * mul * dt;
            player.y += player.dashDirY * DASH_SPEED * mul * dt;
            if (Math.random() < 0.8) arenaParticles.push({ x: player.x + (Math.random()-.5)*10, y: player.y + (Math.random()-.5)*10, vx: -player.dashDirX*40+(Math.random()-.5)*20, vy: -player.dashDirY*40+(Math.random()-.5)*20, life: .3, maxLife: .3, size: 3, color: '#4488ff' });
            if (player.dashTimer <= 0) {
                player.dashing = false; player.dashChainWindow = DASH_CHAIN_WINDOW;
                for (let p = 0; p < 12; p++) arenaParticles.push({ x: player.x+(Math.random()-.5)*20, y: player.y+(Math.random()-.5)*20, vx:(Math.random()-.5)*80, vy:(Math.random()-.5)*80, life:.4, maxLife:.4, size: 2+Math.random()*2, color:'#4488ff' });
            }
        } else if (mx !== 0 || my !== 0) {
            const len = Math.sqrt(mx*mx + my*my);
            player.x += (mx/len) * player.speed * dt;
            player.y += (my/len) * player.speed * dt;
        }
        // ★ Clamp player to arena
        const pc = clampArena(player.x, player.y);
        player.x = pc.x; player.y = pc.y;

        if (player.dashCooldown > 0) player.dashCooldown -= dt;
        if (player.dashChainWindow > 0) player.dashChainWindow -= dt;
        if (player.invulnTimer > 0) player.invulnTimer -= dt;
        for (const e of getEnemies()) {
            if (e.invulnTimer > 0) e.invulnTimer -= dt;
            // ★ Clamp all enemies to arena bounds
            const ec = clampArena(e.x, e.y);
            e.x = ec.x; e.y = ec.y;
        }

        // ── Melee (only hits targets inside arena) ──
        if (meleeCooldown > 0) meleeCooldown -= dt;
        if (meleeTimer > 0) {
            meleeTimer -= dt;
            if (!meleeHit) {
                if (arenaMode !== 'boss' && arenaMode !== 'gauntlet' && arenaMode !== 'survival' && arenaMode !== 'target') {
                    for (const e of getEnemies()) {
                        if (!e.alive) continue;
                        if (!inArena(e.x, e.y)) continue; // ★ skip out-of-bounds
                        if (arenaMode === 'teams' && e.team === playerTeam) continue;
                        const dx = e.x - player.x, dy = e.y - player.y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist < MELEE_RANGE) {
                            const a = Math.atan2(dy, dx);
                            let diff = a - meleeAngle; while (diff > Math.PI) diff -= Math.PI*2; while (diff < -Math.PI) diff += Math.PI*2;
                            if (Math.abs(diff) < MELEE_ARC/2 && e.invulnTimer <= 0 && !e.dashing) {
                                meleeHit = true;
                                e.hp -= MELEE_DAMAGE; e.hitFlash = 0.3;
                                if (typeof Audio !== 'undefined') Audio.hit();
                                if (e.hp <= 0) { e.alive = false; onKill(e.id); }
                                if (Network.isConnected()) Network.send({ type: 'state', x: player.x, y: player.y, hp: player.hp, mana: player.mana, dashing: player.dashing });
                                break;
                            }
                        }
                    }
                }
            }
        }
        for (let i = enemyMelees.length - 1; i >= 0; i--) {
            enemyMelees[i].timer -= dt;
            if (enemyMelees[i].timer <= 0) enemyMelees.splice(i, 1);
        }

        // ── Mana ──
        const regen = player.burnout > 0 ? MANA_REGEN_BURNOUT : MANA_REGEN;
        player.mana = Math.min(MANA_MAX, player.mana + regen * dt);
        if (player.burnout > 0) player.burnout -= dt;
        if (player.hitFlash > 0) player.hitFlash -= dt;
        for (const e of getEnemies()) { if (e.hitFlash > 0) e.hitFlash -= dt; if (e.burnout > 0) e.burnout -= dt; }
        for (const s of playerSpells) { if (s.currentCooldown > 0) s.currentCooldown -= dt; }

        // ── Casts ──
        for (const c of playerCasts) ArconSystem.updateCast(c, dt);
        for (const c of enemyCasts) ArconSystem.updateCast(c, dt);
        playerCasts = playerCasts.filter(c => c.active);
        enemyCasts = enemyCasts.filter(c => c.active);

        // ── Arcon collision ──
        ArconSystem.updateArcons(dt, [player, ...getEnemies()]);

        // Check arcon kills
        for (const e of getEnemies()) {
            if (!e.alive) continue;
            if (arenaMode === 'teams' && e.team === playerTeam) continue;
            if (e.hp <= 0 && e.alive) { e.alive = false; onKill(e.id); }
        }

        // ── Solo bot AI ──
        if (arenaMode === 'solo') updateBotAI(dt);

        // ── Survival mob spellcasting ──
        if (arenaMode === 'survival') {
            for (const mob of survivalEnemies) {
                if (!mob.alive || !mob.spell) continue;
                mob.spellCd -= dt;
                if (mob.spellCd <= 0 && mob.mana >= mob.spell.cost) {
                    mob.mana -= mob.spell.cost;
                    mob.spellCd = 4 + Math.random() * 3;
                    try {
                        const cast = ArconSystem.castSpell(mob.spell,
                            { id: 'mob', x: mob.x, y: mob.y }, player, player.x, player.y);
                        enemyCasts.push(cast);
                    } catch(e) {}
                }
                mob.mana = Math.min(50, mob.mana + dt * 1.5);
            }
        }

        // ── Mode-specific updates ──
        if (arenaMode === 'boss' || arenaMode === 'gauntlet') updateArenaBosses(dt);
        if (arenaMode === 'survival') updateSurvival(dt);
        if (arenaMode === 'target') updateTargetPractice(dt);
        if (arenaMode === 'koth') updateKOTH(dt);

        updatePassive(dt);

        // ── Network sync ──
        syncTimer -= dt;
        if (syncTimer <= 0 && Network.isConnected()) {
            syncTimer = SYNC_RATE;
            Network.send({ type: 'state', x: player.x, y: player.y, hp: player.hp, mana: player.mana, dashing: player.dashing, score: playerScore });
        }

        updateHUD();
        checkWinCondition();
    }

    function updatePassive(dt) {
        if (Math.random() < 0.3) arenaParticles.push({ x: Math.random()*ARENA_W, y: ARENA_H + 10, vx: 0, vy: -10-Math.random()*20, life: 2+Math.random()*3, maxLife: 5, size: 1+Math.random(), color:'#ffd700' });
        for (let i = arenaParticles.length - 1; i >= 0; i--) {
            const p = arenaParticles[i];
            p.x += (p.vx||0)*0.016; p.y += p.vy*0.016; p.life -= 0.016;
            if (p.life <= 0) arenaParticles.splice(i, 1);
        }
    }

    // ════════════════════════════════════════
    //  ARENA BOSSES
    // ════════════════════════════════════════
    function updateArenaBosses(dt) {
        const arcons = ArconSystem.getArcons();
        const allPlayers = [player, ...getEnemies().filter(e => e.alive)];

        for (let bi = arenaBosses.length - 1; bi >= 0; bi--) {
            const boss = arenaBosses[bi]; if (!boss.alive) continue;
            if (boss.spawnTimer > 0) { boss.spawnTimer -= dt; continue; }
            if (boss.hitFlash > 0) boss.hitFlash -= dt;
            boss.attackCd -= dt;

            let closest = null, closeDist = Infinity;
            for (const p of allPlayers) {
                const d = Math.sqrt((p.x - boss.x)**2 + (p.y - boss.y)**2);
                if (d < closeDist) { closeDist = d; closest = p; }
            }
            if (closest) {
                const dx = closest.x - boss.x, dy = closest.y - boss.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                boss.facing = dx > 0 ? 1 : -1;
                if (dist > 60) { boss.x += (dx/dist) * boss.speed * dt; boss.y += (dy/dist) * boss.speed * dt; }

                if (dist < 30 && boss.attackCd <= 0) {
                    if (closest === player && player.invulnTimer <= 0 && !player.dashing) {
                        player.hp -= boss.dmg; player.hitFlash = 0.2; boss.attackCd = 1.5;
                        if (typeof Audio !== 'undefined') Audio.hit();
                        if (player.hp <= 0) { playerDead = true; player.alive = false; respawnTimer = RESPAWN_TIME; }
                    } else if (closest !== player) {
                        Network.send({ type: 'boss-hit', dmg: boss.dmg }, closest.id);
                    }
                }
            }
            // ★ Clamp boss to arena
            const bc = clampArena(boss.x, boss.y);
            boss.x = bc.x; boss.y = bc.y;

            if (boss.hp / boss.maxHp < 0.5 && boss.phase < boss.phaseMax) { boss.phase++; boss.speed *= 1.3; }

            for (let i = arcons.length - 1; i >= 0; i--) {
                const a = arcons[i]; if (!a.alive) continue;
                const adx = a.x - boss.x, ady = a.y - boss.y;
                if (adx*adx + ady*ady < ((a.width/2 + boss.size/2) ** 2)) {
                    a.alive = false; boss.hp -= 1; boss.hitFlash = 0.1;
                    if (typeof Audio !== 'undefined') Audio.enemyHit();
                    if (boss.hp <= 0) { killBoss(boss, bi); break; }
                }
            }

            if (meleeTimer > 0 && !boss._meleeHitThisSwing) {
                const mdx = boss.x - player.x, mdy = boss.y - player.y;
                const d = Math.sqrt(mdx*mdx + mdy*mdy);
                if (d < MELEE_RANGE) {
                    const a = Math.atan2(mdy, mdx);
                    let diff = a - meleeAngle; while (diff > Math.PI) diff -= Math.PI*2; while (diff < -Math.PI) diff += Math.PI*2;
                    if (Math.abs(diff) < MELEE_ARC/2) {
                        boss._meleeHitThisSwing = true; boss.hp -= MELEE_DAMAGE; boss.hitFlash = 0.15;
                        if (typeof Audio !== 'undefined') Audio.enemyHit();
                        if (boss.hp <= 0) killBoss(boss, bi);
                    }
                }
            }
            if (meleeTimer <= 0) boss._meleeHitThisSwing = false;
        }
    }

    function killBoss(boss, bi) {
        boss.alive = false;
        for (let j = 0; j < 15; j++) arenaParticles.push({ x:boss.x, y:boss.y, vx:(Math.random()-.5)*120, vy:(Math.random()-.5)*120, life:.6, maxLife:.6, size:3+Math.random()*3, color:boss.color });
        if (arenaMode === 'gauntlet') {
            gauntletIndex++;
            if (gauntletIndex < gauntletBossOrder.length) {
                setTimeout(() => spawnArenaBoss(gauntletBossOrder[gauntletIndex]), 2000);
            } else { gameOver = true; winner = 'player'; showVictory(); }
        } else { gameOver = true; winner = 'player'; showVictory(); }
    }

    // ════════════════════════════════════════
    //  SURVIVAL
    // ════════════════════════════════════════
    function updateSurvival(dt) {
        const arcons = ArconSystem.getArcons();
        const allPlayers = [player, ...getEnemies().filter(e => e.alive)];

        for (let i = survivalEnemies.length - 1; i >= 0; i--) {
            const mob = survivalEnemies[i]; if (!mob.alive) continue;
            if (mob.hitFlash > 0) mob.hitFlash -= dt;
            mob.attackCd -= dt;

            let tgt = player, td = Infinity;
            for (const p of allPlayers) {
                const d = (p.x - mob.x)**2 + (p.y - mob.y)**2;
                if (d < td) { td = d; tgt = p; }
            }
            const dx = tgt.x - mob.x, dy = tgt.y - mob.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            mob.x += (dx/dist) * mob.speed * dt;
            mob.y += (dy/dist) * mob.speed * dt;
            // ★ Clamp mobs
            const mc = clampArena(mob.x, mob.y);
            mob.x = mc.x; mob.y = mc.y;

            if (dist < 20 && mob.attackCd <= 0) {
                if (tgt === player && player.invulnTimer <= 0 && !player.dashing) {
                    player.hp -= mob.dmg; player.hitFlash = 0.2; mob.attackCd = 1;
                    if (typeof Audio !== 'undefined') Audio.hit();
                    if (player.hp <= 0) { playerDead = true; player.alive = false; respawnTimer = RESPAWN_TIME; }
                }
            }

            for (let j = arcons.length - 1; j >= 0; j--) {
                const a = arcons[j]; if (!a.alive) continue;
                const adx = a.x - mob.x, ady = a.y - mob.y;
                if (adx*adx + ady*ady < ((a.width/2 + mob.size/2)**2)) {
                    a.alive = false; mob.hp -= 1; mob.hitFlash = 0.1;
                    if (mob.hp <= 0) {
                        mob.alive = false; survivalScore++;
                        for (let k = 0; k < 6; k++) arenaParticles.push({ x:mob.x, y:mob.y, vx:(Math.random()-.5)*80, vy:(Math.random()-.5)*80, life:.3, maxLife:.3, size:2, color:mob.color });
                    }
                    break;
                }
            }

            if (meleeTimer > 0 && !mob._meleeHit) {
                const mdx = mob.x - player.x, mdy = mob.y - player.y;
                const md = Math.sqrt(mdx*mdx + mdy*mdy);
                if (md < MELEE_RANGE) {
                    const ma = Math.atan2(mdy, mdx);
                    let diff = ma - meleeAngle; while (diff > Math.PI) diff -= Math.PI*2; while (diff < -Math.PI) diff += Math.PI*2;
                    if (Math.abs(diff) < MELEE_ARC/2) {
                        mob._meleeHit = true; mob.hp -= MELEE_DAMAGE; mob.hitFlash = 0.15;
                        if (mob.hp <= 0) {
                            mob.alive = false; survivalScore++;
                            for (let k = 0; k < 6; k++) arenaParticles.push({ x:mob.x, y:mob.y, vx:(Math.random()-.5)*80, vy:(Math.random()-.5)*80, life:.3, maxLife:.3, size:2, color:mob.color });
                        }
                    }
                }
            }
            if (meleeTimer <= 0 && mob._meleeHit) mob._meleeHit = false;
        }

        survivalEnemies = survivalEnemies.filter(e => e.alive);
        if (survivalEnemies.length === 0) {
            survivalSpawnTimer -= dt;
            if (survivalSpawnTimer <= 0) { spawnSurvivalWave(); survivalSpawnTimer = 2; }
        }
    }

    // ════════════════════════════════════════
    //  TARGET PRACTICE
    // ════════════════════════════════════════
    function updateTargetPractice(dt) {
        targetTimer -= dt;
        if (targetTimer <= 0) {
            gameOver = true; winner = 'player';
            showVictory('TIME UP — Hits: ' + targetHits);
            return;
        }
        const arcons = ArconSystem.getArcons();
        for (const t of targetDummies) {
            if (t.hitFlash > 0) t.hitFlash -= dt;
            if (!t.alive) {
                t.respawnTimer -= dt;
                if (t.respawnTimer <= 0) {
                    t.alive = true;
                    const c = clampArena(60 + Math.random() * 840, 60 + Math.random() * 420);
                    t.x = c.x; t.y = c.y;
                }
                continue;
            }
            for (let i = arcons.length - 1; i >= 0; i--) {
                const a = arcons[i]; if (!a.alive) continue;
                const dx = a.x - t.x, dy = a.y - t.y;
                if (dx*dx + dy*dy < ((a.width/2 + t.size/2)**2)) {
                    a.alive = false; t.hitFlash = 0.15; t.alive = false;
                    t.respawnTimer = t.maxRespawn; targetHits++;
                    for (let k = 0; k < 5; k++) arenaParticles.push({ x:t.x, y:t.y, vx:(Math.random()-.5)*60, vy:(Math.random()-.5)*60, life:.2, maxLife:.2, size:2, color:'#ffd700' });
                    break;
                }
            }
        }
    }

    // ════════════════════════════════════════
    //  KING OF THE HILL
    // ════════════════════════════════════════
    function updateKOTH(dt) {
        const inZone = [];
        const pdx = player.x - kothZone.x, pdy = player.y - kothZone.y;
        if (pdx*pdx + pdy*pdy < kothZone.r * kothZone.r && player.alive) inZone.push('player');
        for (const e of getEnemies()) {
            if (!e.alive) continue;
            const dx = e.x - kothZone.x, dy = e.y - kothZone.y;
            if (dx*dx + dy*dy < kothZone.r * kothZone.r) inZone.push(e.id);
        }
        if (inZone.length === 1) {
            const holder = inZone[0];
            if (kothHolder !== holder) { kothHolder = holder; }
            kothTimer += dt;
            if (kothTimer >= KOTH_WIN) {
                gameOver = true;
                winner = kothHolder === 'player' ? 'player' : 'enemy';
                showVictory();
            }
        } else if (inZone.length === 0) {
            kothTimer = Math.max(0, kothTimer - dt * 0.5);
        }
    }

    // ════════════════════════════════════════
    //  SCORING / KILLS
    // ════════════════════════════════════════
    function onKill(victimId) {
        playerScore++;
        if (arenaMode === 'teams') { teamScores[playerTeam]++; }
        if (Network.isConnected()) Network.send({ type: 'kill', victim: victimId, killer: 'player' });
    }

    function checkWinCondition() {
        if (gameOver) return;
        switch (arenaMode) {
            case 'solo':
            case 'ffa': {
                if (playerScore >= 10) { gameOver = true; winner = 'player'; showVictory(); }
                for (const [pid, s] of Object.entries(scores)) {
                    if (s >= 10) { gameOver = true; winner = 'enemy'; showVictory(); break; }
                }
                break;
            }
            case 'duel': {
                if (playerScore >= 5) { gameOver = true; winner = 'player'; showVictory(); }
                for (const [pid, s] of Object.entries(scores)) {
                    if (s >= 5) { gameOver = true; winner = 'enemy'; showVictory(); break; }
                }
                break;
            }
            case 'teams': {
                if (teamScores[playerTeam] >= 15) { gameOver = true; winner = 'player'; showVictory(); }
                const ot = 1 - playerTeam;
                if (teamScores[ot] >= 15) { gameOver = true; winner = 'enemy'; showVictory(); }
                break;
            }
            case 'survival': {
                if (player.hp <= 0) {
                    gameOver = true; winner = 'enemy';
                    showVictory('Waves: ' + survivalWave + ' | Kills: ' + survivalScore);
                }
                break;
            }
        }
    }

    // ════════════════════════════════════════
    //  CASTING
    // ════════════════════════════════════════
    function castPlayerSpell(index) {
        if (gameOver || playerDead) return;
        if (index < 0 || index >= playerSpells.length) return;
        const spell = playerSpells[index];
        if (spell.currentCooldown > 0) return;
        if (player.mana < spell.cost) {
            if (player.mana <= 0) { player.hp = Math.max(0, player.hp - BACKLASH_DAMAGE); player.hitFlash = 0.3; }
            return;
        }
        if (spell.cost > player.mana * BURNOUT_THRESHOLD) player.burnout = 3;
        player.mana -= spell.cost;
        spell.currentCooldown = 0;

        const target = nearestEnemy() || { x: mouse.x, y: mouse.y, id: 'target' };
        const cast = ArconSystem.castSpell(spell, player, target, mouse.x, mouse.y, {
            hp: player.hp, maxHp: HP_MAX, mana: player.mana, maxMana: MANA_MAX,
            speed: player.speed, level: 1, combo: 0, kills: playerScore, floor: 0,
        });
        playerCasts.push(cast);
        if (typeof Audio !== 'undefined') Audio.cast();

        if (spell.xExpr && spell.yExpr) {
            Network.send({ type: 'castfull', cost: spell.cost, casterX: player.x, casterY: player.y, cursorX: mouse.x, cursorY: mouse.y, xExpr: spell.xExpr, yExpr: spell.yExpr, emitExpr: spell.emitExpr || 'i*0.02', widthExpr: spell.widthExpr || '4' });
        } else {
            Network.send({ type: 'cast', spellIndex: index, casterX: player.x, casterY: player.y, cursorX: mouse.x, cursorY: mouse.y, cost: spell.cost });
        }
    }

    function doDash() {
        if (playerDead || player.dashing) return;
        const isChain = player.dashChainWindow > 0 && player.dashChainCount > 0;
        if (!isChain && player.dashCooldown > 0) return;
        let dx = 0, dy = 0;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;
        if (dx === 0 && dy === 0) { dx = mouse.x - player.x; dy = mouse.y - player.y; }
        const len = Math.sqrt(dx*dx + dy*dy); if (len === 0) return;
        player.dashDirX = dx/len; player.dashDirY = dy/len;
        player.dashing = true; player.dashTimer = DASH_DURATION; player.invulnTimer = DASH_INVULN;
        if (isChain) { player.dashChainCount++; player.dashCooldown = Math.max(.15, DASH_COOLDOWN - player.dashChainCount*.1); }
        else { player.dashChainCount = 1; player.dashCooldown = DASH_COOLDOWN; }
        if (typeof Audio !== 'undefined') Audio.dash();
        Network.send({ type: 'dash', dirX: player.dashDirX, dirY: player.dashDirY, chain: player.dashChainCount });
    }

    function doMelee(mx, my) {
        if (gameOver || playerDead || meleeTimer > 0 || meleeCooldown > 0) return;
        meleeAngle = Math.atan2(my - player.y, mx - player.x);
        meleeTimer = MELEE_DURATION; meleeCooldown = MELEE_COOLDOWN; meleeHit = false;
        if (typeof Audio !== 'undefined') Audio.melee();
        for (let i = 0; i < 6; i++) {
            const a = meleeAngle - MELEE_ARC/2 + (MELEE_ARC/6)*i;
            arenaParticles.push({ x: player.x+Math.cos(a)*MELEE_RANGE*.3, y: player.y+Math.sin(a)*MELEE_RANGE*.3, vx: Math.cos(a)*80, vy: Math.sin(a)*80, life:.2, maxLife:.2, size: 2+Math.random()*2, color:'#fff' });
        }
        Network.send({ type: 'melee', x: player.x, y: player.y, angle: meleeAngle });
    }

    // ════════════════════════════════════════
    //  NETWORK MESSAGES
    // ════════════════════════════════════════
    function handleNetMessage(data, fromPeerId) {
        if (!data || !data.type) return;
        const pid = fromPeerId || 'enemy';

        if (!enemies[pid] && data.type === 'state') {
            const idx = Object.keys(enemies).length;
            enemies[pid] = makeEnemy(pid, data.x || 480, data.y || 270, idx);
            ArconSystem.onManaReturn(pid, (n) => { if (enemies[pid]) enemies[pid].mana = Math.min(MANA_MAX, enemies[pid].mana + n); });
            if (arenaMode === 'teams') {
                const team = idx % 2 === 0 ? 1 : 0;
                enemies[pid].team = team;
                teamAssignments[pid] = team;
                enemies[pid].color = TEAM_COLORS[team][0];
                enemies[pid].colorLight = TEAM_COLORS[team][1];
            }
        }

        const enemy = enemies[pid];

        switch (data.type) {
            case 'state':
                if (enemy) {
                    // ★ Clamp incoming positions to arena
                    const c = clampArena(data.x, data.y);
                    enemy.x = c.x; enemy.y = c.y;
                    enemy.hp = data.hp; enemy.mana = data.mana; enemy.dashing = data.dashing;
                    enemy.score = data.score || 0; scores[pid] = data.score || 0;
                }
                break;
            case 'cast':
                try {
                    const aim = Math.atan2(data.cursorY - data.casterY, data.cursorX - data.casterX);
                    const cx = data.casterX, cy = data.casterY;
                    const s = { cost: data.cost, xFn: (v) => cx + Math.cos(aim)*300*(v.t - v.i*.02), yFn: (v) => cy + Math.sin(aim)*300*(v.t - v.i*.02), emitDelayFn: (v) => v.i*.02, widthFn: () => 4 };
                    enemyCasts.push(ArconSystem.castSpell(s, { id: pid, x: data.casterX, y: data.casterY }, player, data.cursorX, data.cursorY));
                } catch(e) {}
                break;
            case 'castfull':
                try {
                    const s = { cost: data.cost, xFn: Parser.compile(data.xExpr), yFn: Parser.compile(data.yExpr), emitDelayFn: Parser.compile(data.emitExpr), widthFn: Parser.compile(data.widthExpr) };
                    enemyCasts.push(ArconSystem.castSpell(s, { id: pid, x: data.casterX, y: data.casterY }, player, data.cursorX, data.cursorY));
                } catch(e) {}
                break;
            case 'dash':
                if (enemy) { enemy.dashing = true; enemy.dashDirX = data.dirX; enemy.dashDirY = data.dirY; enemy.dashTimer = DASH_DURATION; const de = enemy; setTimeout(() => { de.dashing = false; }, DASH_DURATION*1000); }
                break;
            case 'melee':
                enemyMelees.push({ x: data.x, y: data.y, angle: data.angle, timer: MELEE_DURATION, peerId: pid });
                if (!player.dashing && player.invulnTimer <= 0 && player.alive) {
                    if (arenaMode === 'teams' && teamAssignments[pid] === playerTeam) break;
                    const dx = player.x - data.x, dy = player.y - data.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < MELEE_RANGE) {
                        const a = Math.atan2(dy, dx);
                        let diff = a - data.angle; while (diff > Math.PI) diff -= Math.PI*2; while (diff < -Math.PI) diff += Math.PI*2;
                        if (Math.abs(diff) < MELEE_ARC/2) {
                            player.hp -= MELEE_DAMAGE; player.hitFlash = 0.3;
                            if (typeof Audio !== 'undefined') Audio.playerHurt();
                            if (player.hp <= 0 && player.alive) { playerDead = true; player.alive = false; respawnTimer = RESPAWN_TIME; }
                        }
                    }
                }
                break;
            case 'kill':
                if (data.killer !== 'player') { scores[pid] = (scores[pid] || 0) + 1; }
                break;
            case 'boss-hit':
                if (player.invulnTimer <= 0 && !player.dashing) {
                    player.hp -= data.dmg; player.hitFlash = 0.2;
                    if (player.hp <= 0) { playerDead = true; player.alive = false; respawnTimer = RESPAWN_TIME; }
                }
                break;
            case 'peer-join':
                if (!enemies[data.peerId]) {
                    const idx = Object.keys(enemies).length;
                    enemies[data.peerId] = makeEnemy(data.peerId, 480, 270, idx);
                    ArconSystem.onManaReturn(data.peerId, (n) => { if (enemies[data.peerId]) enemies[data.peerId].mana = Math.min(MANA_MAX, enemies[data.peerId].mana + n); });
                }
                break;
            case 'peer-leave':
                delete enemies[data.peerId]; delete scores[data.peerId];
                break;
            case 'gameover':
                if (!gameOver) { gameOver = true; winner = data.winner; showVictory(); }
                break;
        }
    }

    // ════════════════════════════════════════
    //  HUD
    // ════════════════════════════════════════
    function updateHUD() {
        document.getElementById('player-hp').style.width = (player.hp/HP_MAX*100) + '%';
        document.getElementById('player-hp-text').textContent = Math.max(0, Math.ceil(player.hp));
        document.getElementById('player-mana').style.width = (player.mana/MANA_MAX*100) + '%';
        document.getElementById('player-mana-text').textContent = Math.ceil(player.mana);
        const pLocked = ArconSystem.countActive('player') + ArconSystem.countPending(playerCasts, 'player');
        document.getElementById('player-mana-locked').style.width = (pLocked/MANA_MAX*100) + '%';

        for (let i = 0; i < playerSpells.length; i++) {
            const el = document.getElementById('spell-hud-' + i); if (!el) continue;
            el.className = 'spell-key-hud';
            if (playerSpells[i].currentCooldown > 0) el.classList.add('on-cd');
            else if (player.mana < playerSpells[i].cost) el.classList.add('no-mana');
        }

        const dashEl = document.getElementById('dash-cd');
        if (player.dashCooldown > 0 && !player.dashing) { dashEl.textContent = 'DASH ' + player.dashCooldown.toFixed(1) + 's'; dashEl.className = 'dash-cd'; }
        else { const ct = player.dashChainWindow > 0 ? ' [CHAIN x' + player.dashChainCount + ']' : ''; dashEl.textContent = 'DASH [SHIFT]' + ct; dashEl.className = 'dash-cd ready'; }

        const sb = document.getElementById('pvp-scoreboard');
        if (sb) {
            let lines = '<span style="color:#4488ff">You: ' + playerScore + '</span>';
            const eArr = getEnemies();
            for (const e of eArr) {
                const name = e.isBot ? (BOT_NAMES[parseInt(e.id.split('_')[1]) % BOT_NAMES.length] || e.id) : e.id.substring(0,8);
                lines += '<br><span style="color:' + e.color + '">' + name + ': ' + (scores[e.id] || e.score || 0) + '</span>';
            }
            if (arenaMode === 'survival') lines = '<span style="color:#ffd700">Wave: ' + survivalWave + ' | Kills: ' + survivalScore + '</span>';
            if (arenaMode === 'target') lines = '<span style="color:#ffd700">Hits: ' + targetHits + ' | Time: ' + Math.ceil(targetTimer) + 's</span>';
            if (arenaMode === 'koth') lines += '<br><span style="color:#ffd700">Hill: ' + kothTimer.toFixed(1) + '/' + KOTH_WIN + 's</span>';
            if (arenaMode === 'teams') lines = '<span style="color:' + TEAM_COLORS[0][0] + '">Blue: ' + teamScores[0] + '</span><br><span style="color:' + TEAM_COLORS[1][0] + '">Red: ' + teamScores[1] + '</span>';
            sb.innerHTML = lines;
        }
    }

    function showVictory(customSub) {
        document.getElementById('hud').classList.add('hidden');
        const screen = document.getElementById('victory-screen');
        screen.classList.remove('hidden');
        const h1 = document.getElementById('victory-text');
        const sub = document.getElementById('victory-sub');
        if (winner === 'player') {
            h1.textContent = 'VICTORY'; h1.style.color = '#ffd700';
            sub.textContent = customSub || 'Your formulas proved superior.';
            if (typeof Audio !== 'undefined') Audio.pvpWin();
        } else {
            h1.textContent = 'DEFEAT'; h1.style.color = '#ff4444';
            sub.textContent = customSub || 'Your equations were insufficient.';
            if (typeof Audio !== 'undefined') Audio.pvpLose();
        }
    }

    // ════════════════════════════════════════
    //  RENDER
    // ════════════════════════════════════════
    function render(ctx, W, H) {
        ctx.fillStyle = '#0a0806'; ctx.fillRect(0, 0, W, H);

        // Grid
        ctx.strokeStyle = '#151210'; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
        for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
        // ★ Clean arena border (only at edges, no interior tiles)
        ctx.strokeStyle = '#2a2015'; ctx.lineWidth = 2;
        ctx.strokeRect(ARENA_PAD, ARENA_PAD, ARENA_W - ARENA_PAD * 2, ARENA_H - ARENA_PAD * 2);

        // KOTH zone
        if (arenaMode === 'koth') {
            ctx.save();
            ctx.globalAlpha = 0.08 + Math.sin(performance.now()/300) * 0.04;
            ctx.fillStyle = kothHolder === 'player' ? '#4488ff' : kothHolder ? '#ff4444' : '#ffd700';
            ctx.beginPath(); ctx.arc(kothZone.x, kothZone.y, kothZone.r, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke();
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#ffd700'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
            ctx.fillText('HILL', kothZone.x, kothZone.y + 4);
            ctx.restore();
        }

        // Particles
        for (const p of arenaParticles) {
            ctx.globalAlpha = (p.life/p.maxLife) * 0.15; ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        ArconSystem.render(ctx);

        // Survival mobs
        for (const mob of survivalEnemies) {
            if (!mob.alive) continue;
            ctx.fillStyle = mob.hitFlash > 0 ? '#fff' : mob.color;
            ctx.fillRect(mob.x - mob.size/2, mob.y - mob.size/2, mob.size, mob.size);
            ctx.fillStyle = '#111'; ctx.fillRect(mob.x - mob.size/2, mob.y - mob.size/2 - 5, mob.size, 3);
            ctx.fillStyle = '#44cc44'; ctx.fillRect(mob.x - mob.size/2, mob.y - mob.size/2 - 5, mob.size * (mob.hp/mob.maxHp), 3);
        }

        // Target dummies
        for (const t of targetDummies) {
            if (!t.alive) continue;
            ctx.fillStyle = t.hitFlash > 0 ? '#fff' : '#886644';
            ctx.fillRect(t.x - 4, t.y + 4, 8, 6);
            ctx.fillRect(t.x - 2, t.y - 10, 4, 14);
            ctx.fillRect(t.x - 8, t.y - 6, 16, 4);
            ctx.fillRect(t.x - 5, t.y - 16, 10, 10);
        }

        // Arena bosses
        for (const boss of arenaBosses) {
            if (!boss.alive) continue;
            const fl = boss.hitFlash > 0, s = boss.size;
            ctx.globalAlpha = boss.spawnTimer > 0 ? 0.3 : 1;
            ctx.fillStyle = fl ? '#fff' : boss.color;
            ctx.fillRect(boss.x - s*.4, boss.y - s*.5, s*.8, s);
            ctx.fillRect(boss.x - s*.3, boss.y - s*.8, s*.6, s*.35);
            ctx.fillStyle = '#ff0'; ctx.fillRect(boss.x - s*.15, boss.y - s*.65, 3, 3); ctx.fillRect(boss.x + s*.05, boss.y - s*.65, 3, 3);
            ctx.globalAlpha = 0.08 + Math.sin(performance.now()/200)*.04;
            ctx.fillStyle = boss.color; ctx.beginPath(); ctx.arc(boss.x, boss.y, s*1.2, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffcc44'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
            ctx.fillText(boss.name.replace(/_/g,' ').toUpperCase(), boss.x, boss.y - s*.85 - 4);
            const bw = Math.max(s+10, 40), hp = boss.hp/boss.maxHp;
            ctx.fillStyle = '#111'; ctx.fillRect(boss.x - bw/2 - 1, boss.y - s/2 - 14, bw+2, 6);
            ctx.fillStyle = hp > .5 ? '#44cc44' : hp > .25 ? '#cccc44' : '#cc4444';
            ctx.fillRect(boss.x - bw/2, boss.y - s/2 - 13, bw*hp, 4);
        }

        // Player
        if (player.alive && !playerDead) renderMage(ctx, player, arenaMode === 'teams' ? TEAM_COLORS[playerTeam][0] : '#4488ff', arenaMode === 'teams' ? TEAM_COLORS[playerTeam][1] : '#88bbff');

        // Enemies
        for (const e of getEnemies()) {
            if (!e.alive) continue;
            renderMage(ctx, e, e.color, e.colorLight);
        }

        // Melee arcs
        if (meleeTimer > 0) {
            const p = 1 - meleeTimer/MELEE_DURATION;
            ctx.save(); ctx.globalAlpha = .6*(1-p); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(player.x, player.y, MELEE_RANGE*(.3+p*.7), meleeAngle - MELEE_ARC/2, meleeAngle + MELEE_ARC/2); ctx.stroke();
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(player.x, player.y, MELEE_RANGE*.6*(.3+p*.7), meleeAngle - MELEE_ARC/2 + p*.3, meleeAngle + MELEE_ARC/2 - p*.3); ctx.stroke();
            ctx.restore();
        }
        for (const em of enemyMelees) {
            const p = 1 - em.timer/MELEE_DURATION;
            ctx.save(); ctx.globalAlpha = .4*(1-p); ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(em.x, em.y, MELEE_RANGE*(.3+p*.7), em.angle - MELEE_ARC/2, em.angle + MELEE_ARC/2); ctx.stroke();
            ctx.restore();
        }

        // Aim line + crosshair
        if (!gameOver && !playerDead) {
            ctx.globalAlpha = .12; ctx.strokeStyle = '#4488ff'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
            ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha = .4; ctx.strokeRect(mouse.x-4, mouse.y-4, 8, 8);
            ctx.fillStyle = '#4488ff'; ctx.fillRect(mouse.x-1, mouse.y-1, 2, 2);
            ctx.globalAlpha = 1;
        }

        // Burnout
        if (player.burnout > 0) {
            ctx.globalAlpha = .4 + Math.sin(performance.now()/100)*.2;
            ctx.fillStyle = '#ff8800'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
            ctx.fillText('BURNOUT', player.x, player.y - 28); ctx.globalAlpha = 1;
        }

        // Respawn overlay
        if (playerDead) {
            ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);
            ctx.globalAlpha = 1; ctx.textAlign = 'center';
            ctx.fillStyle = '#ff4444'; ctx.font = 'bold 24px monospace';
            ctx.fillText('RESPAWNING...', W/2, H/2 - 10);
            ctx.fillStyle = '#ffd700'; ctx.font = '14px monospace';
            ctx.fillText(Math.ceil(respawnTimer) + 's', W/2, H/2 + 20);
            ctx.restore();
        }
    }

    function renderMage(ctx, mage, color, light) {
        const flash = mage.hitFlash > 0;
        const isDashing = mage.dashing;
        const t = performance.now() / 1000;
        const isPlayer = mage === player;
        const isMoving = isPlayer ? (keys['w']||keys['s']||keys['a']||keys['d']||keys['arrowup']||keys['arrowdown']||keys['arrowleft']||keys['arrowright']) : false;

        const idleBob = Math.sin(t * 2.5) * 1.5;
        const walkBob = Math.sin(t * 10) * 2;

        let bodyOff = 0, legL = 0, legR = 0;
        if (isDashing) bodyOff = -2;
        else if (isMoving) { bodyOff = Math.abs(walkBob)*.5; legL = walkBob*1.5; legR = -walkBob*1.5; }
        else bodyOff = idleBob;

        if (isDashing) { ctx.globalAlpha = .1; ctx.fillStyle = color; ctx.fillRect(mage.x-6 + (mage.dashDirX||0)*-25, mage.y-14 + (mage.dashDirY||0)*-25, 12, 24); ctx.globalAlpha = isDashing ? .5 : 1; }
        ctx.globalAlpha = isDashing ? .5 : 1;
        ctx.fillStyle = '#000'; ctx.globalAlpha *= .3;
        ctx.fillRect(mage.x - 7, mage.y + 8, 14, 3);
        ctx.globalAlpha = isDashing ? .5 : 1;

        ctx.save(); ctx.translate(mage.x, mage.y + bodyOff);
        ctx.fillStyle = flash ? '#fff' : color;
        ctx.fillRect(-5, 4+legL, 4, 6); ctx.fillRect(1, 4+legR, 4, 6);
        ctx.fillRect(-5, -6, 10, 10);
        const hy = -14;
        ctx.fillRect(-4, hy, 8, 8);
        if (!flash) ctx.fillStyle = light;
        ctx.fillRect(-6, hy-2, 12, 2); ctx.fillRect(-3, hy-6, 6, 4); ctx.fillRect(-1, hy-8, 2, 2);
        if (!flash) ctx.fillStyle = '#ffd700';
        ctx.fillRect(5, -4, 2, 12);
        ctx.globalAlpha = .5 + Math.sin(t*5)*.3; ctx.fillStyle = flash ? '#fff' : '#ffd700';
        ctx.fillRect(4, -6, 4, 4); ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        const blink = t % 4; const eyeH = (blink > 3.85 && blink < 3.95) ? 1 : 2;
        ctx.fillRect(-2, hy+2, 2, eyeH); ctx.fillRect(1, hy+2, 2, eyeH);
        ctx.restore();

        if (mage.invulnTimer > 0) { ctx.globalAlpha = .15 + Math.sin(t*50)*.1; ctx.fillStyle = '#88ccff'; ctx.fillRect(mage.x-8, mage.y-16, 16, 28); }
        ctx.globalAlpha = 1;

        if (!isPlayer) {
            const name = mage.isBot ? (BOT_NAMES[parseInt(mage.id.split('_')[1]) % BOT_NAMES.length] || mage.id) : mage.id.substring(0,8);
            ctx.globalAlpha = 0.5; ctx.fillStyle = color; ctx.font = '8px monospace'; ctx.textAlign = 'center';
            ctx.fillText(name, mage.x, mage.y - 22);
            ctx.globalAlpha = 1;
        }
    }

    // ════════════════════════════════════════
    //  INPUT
    // ════════════════════════════════════════
    function onKeyDown(key) {
        keys[key.toLowerCase()] = true;
        if (key === 'Shift' || key === ' ') doDash();
        const num = parseInt(key);
        if (num >= 1 && num <= 6) castPlayerSpell(num - 1);
    }
    function onKeyUp(key) { keys[key.toLowerCase()] = false; }
    function onMouseMove(x, y) { mouse.x = x; mouse.y = y; }
    function onMouseDown(x, y) { mouse.x = x; mouse.y = y; doMelee(x, y); }
    function onMouseUp() {}

    return {
        init, update, render, handleNetMessage,
        onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp,
        isGameOver: () => gameOver,
    };
})();
