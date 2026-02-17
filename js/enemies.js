// -----------------------------------------
//  ENEMY SYSTEM -- Themed enemies, AI, bosses
//  v3: Full pixel sprites, animations, seeded spawn
// -----------------------------------------

const Enemies = (() => {
    // ── Seeded PRNG for deterministic spawns in co-op ──
    let _seed = 42;
    function seedRandom(s) { _seed = s; }
    function seededRandom() {
        _seed = (_seed * 16807 + 0) % 2147483647;
        return (_seed & 0x7fffffff) / 2147483647;
    }

    const TYPES = {
        scarab:        { hp: 15, speed: 80,  size: 8,  color: '#c4a35a', dmg: 5,  behavior: 'chase',  xp: 10 },
        mummy:         { hp: 40, speed: 40,  size: 12, color: '#d4c5a0', dmg: 10, behavior: 'patrol', xp: 25 },
        anubis_guard:  { hp: 60, speed: 60,  size: 14, color: '#ffd700', dmg: 15, behavior: 'guard',  xp: 40 },
        shade:         { hp: 20, speed: 100, size: 8,  color: '#5a2040', dmg: 8,  behavior: 'chase',  xp: 15 },
        cerberus_pup:  { hp: 50, speed: 70,  size: 14, color: '#8b0000', dmg: 12, behavior: 'lunge',  xp: 30 },
        fury:          { hp: 35, speed: 120, size: 10, color: '#ff4500', dmg: 15, behavior: 'strafe', xp: 35 },
        vine_creep:    { hp: 25, speed: 50,  size: 10, color: '#228b22', dmg: 8,  behavior: 'chase',  xp: 12 },
        spore_bloom:   { hp: 30, speed: 0,   size: 12, color: '#32cd32', dmg: 10, behavior: 'turret', xp: 20 },
        jungle_wyrm:   { hp: 70, speed: 60,  size: 16, color: '#006400', dmg: 15, behavior: 'patrol', xp: 45 },
        sentinel:      { hp: 45, speed: 55,  size: 12, color: '#e8e8e0', dmg: 12, behavior: 'guard',  xp: 30 },
        radiant_golem: { hp: 80, speed: 35,  size: 18, color: '#ffd700', dmg: 20, behavior: 'chase',  xp: 50 },
        seraph:        { hp: 30, speed: 110, size: 10, color: '#ffffff', dmg: 10, behavior: 'strafe', xp: 25 },
        drone:         { hp: 15, speed: 130, size: 8,  color: '#00bfff', dmg: 6,  behavior: 'strafe', xp: 12 },
        turret:        { hp: 50, speed: 0,   size: 14, color: '#4a4a4a', dmg: 15, behavior: 'turret', xp: 35 },
        virus:         { hp: 25, speed: 90,  size: 8,  color: '#00ff00', dmg: 8,  behavior: 'chase',  xp: 15 },
        skeleton:      { hp: 30, speed: 60,  size: 10, color: '#d4c5a0', dmg: 10, behavior: 'chase',  xp: 15 },
        wraith:        { hp: 25, speed: 100, size: 10, color: '#9b59b6', dmg: 12, behavior: 'strafe', xp: 25 },
        gargoyle:      { hp: 80, speed: 40,  size: 16, color: '#4a4550', dmg: 18, behavior: 'guard',  xp: 40 },
        // New enemy types with advanced behaviors
        blink_imp:     { hp: 20, speed: 90,  size: 8,  color: '#bb44ff', dmg: 10, behavior: 'teleport', xp: 20 },
        mirror_knight: { hp: 60, speed: 55,  size: 14, color: '#c0c0c0', dmg: 14, behavior: 'dodge',   xp: 45 },
        necro_acolyte: { hp: 35, speed: 45,  size: 10, color: '#44005a', dmg: 8,  behavior: 'summon',  xp: 35 },
        charger:       { hp: 55, speed: 60,  size: 14, color: '#cc6600', dmg: 18, behavior: 'charge',  xp: 30 },
        shaman:        { hp: 40, speed: 40,  size: 12, color: '#ff8844', dmg: 6,  behavior: 'healer',  xp: 40 },
        // Minotaur — rare wandering miniboss
        minotaur:      { hp: 300, speed: 70, size: 22, color: '#8B4513', dmg: 30, behavior: 'charge', xp: 200, phases: 2 },
    };

    const BOSSES = {
        'Pharaoh Khet':     { hp: 1500, speed: 50, size: 24, color: '#ffd700', dmg: 20, xp: 200, phases: 3 },
        'Lord Thanatos':    { hp: 1750, speed: 60, size: 22, color: '#ff4500', dmg: 25, xp: 250, phases: 3 },
        'Elder Thornback':  { hp: 2000, speed: 35, size: 28, color: '#228b22', dmg: 18, xp: 300, phases: 3 },
        'Archon Solaris':   { hp: 1600, speed: 70, size: 20, color: '#ffffff', dmg: 22, xp: 280, phases: 3 },
        'Core Override':    { hp: 1400, speed: 80, size: 20, color: '#00ffff', dmg: 20, xp: 260, phases: 3 },
        'Lich King Morthul':{ hp: 2500, speed: 45, size: 26, color: '#9b59b6', dmg: 30, xp: 500, phases: 4 },
    };

    let enemies = [];
    let effects = [];
    let shakeIntensity = 0;
    let shakeTimer = 0;
    let uidCounter = 0;

    function reset() { enemies = []; effects = []; shakeIntensity = 0; shakeTimer = 0; uidCounter = 0; }

    function spawnFromDungeon(dungeon) {
        enemies = [];
        const theme = dungeon.theme;
        const difficulty = 1 + dungeon.floorIndex * 0.3;
        // Seed PRNG from floor index so co-op clients spawn identical mobs
        seedRandom(dungeon.floorIndex * 7919 + 13337);

        for (const sp of dungeon.spawnPoints) {
            if (sp.type === 'boss') {
                const bossData = BOSSES[theme.boss];
                if (bossData) {
                    enemies.push(createEnemy(theme.boss, {
                        ...bossData,
                        hp: Math.floor(bossData.hp * difficulty),
                        behavior: 'boss',
                    }, sp.x, sp.y, true));
                }
            } else if (sp.type === 'miniboss') {
                const mbData = Dungeon.getMinibossData(dungeon.theme, difficulty);
                if (mbData) {
                    const mb = createEnemy(mbData.name, {
                        ...mbData,
                        hp: mbData.hp,
                        dmg: mbData.dmg,
                        phases: 2,
                    }, sp.x, sp.y, false);
                    mb.isMiniboss = true;
                    mb.aggroRange = 200;
                    mb.attackRange = 60;
                    enemies.push(mb);
                }
            } else {
                const typeName = theme.enemies[Math.floor(seededRandom() * theme.enemies.length)];
                const typeData = TYPES[typeName];
                if (typeData) {
                    enemies.push(createEnemy(typeName, {
                        ...typeData,
                        hp: Math.floor(typeData.hp * difficulty),
                        dmg: Math.floor(typeData.dmg * difficulty),
                    }, sp.x, sp.y, false));
                }
            }
        }
    }

    // ── MOB MAGIC SPELLS ── Uses player.x/player.y = caster, enemy.x/enemy.y = target
    const MOB_SPELL_EXPRS = [
        // BOLT: straight shot at target
        { xExpr: 'player.x+cos(aim)*250*(t-i*0.03)', yExpr: 'player.y+sin(aim)*250*(t-i*0.03)', emitExpr: 'i*0.03', widthExpr: '3', name: 'bolt', cost: 12 },
        // WAVE: wavy shot toward target
        { xExpr: 'player.x+cos(aim+sin(t*3)*0.3)*180*t', yExpr: 'player.y+sin(aim+sin(t*3)*0.3)*180*t', emitExpr: 'i*0.04', widthExpr: '4', name: 'wave', cost: 15 },
        // SCATTER: fan of arcons
        { xExpr: 'player.x+cos(aim+(i-N/2)*0.15)*200*t', yExpr: 'player.y+sin(aim+(i-N/2)*0.15)*200*t', emitExpr: 'i*0.02', widthExpr: '3', name: 'scatter', cost: 18 },
        // SPIRAL: spiraling shot
        { xExpr: 'player.x+cos(aim+t*4+i*0.3)*120*t', yExpr: 'player.y+sin(aim+t*4+i*0.3)*120*t', emitExpr: 'i*0.04', widthExpr: '3', name: 'spiral', cost: 15 },
        // RING: expanding ring of arcons
        { xExpr: 'player.x+cos(i/N*2*pi)*150*t', yExpr: 'player.y+sin(i/N*2*pi)*150*t', emitExpr: '0', widthExpr: '4', name: 'ring', cost: 20 },
        // LANCE: directed lance toward target
        { xExpr: 'player.x+cos(aim)*300*(t-i*0.01)', yExpr: 'player.y+sin(aim)*300*(t-i*0.01)', emitExpr: 'i*0.01', widthExpr: '5', name: 'lance', cost: 10 },
        // NOVA: radial burst that expands outward
        { xExpr: 'player.x+cos(i/N*2*pi+t*2)*80*(1+t*2)', yExpr: 'player.y+sin(i/N*2*pi+t*2)*80*(1+t*2)', emitExpr: '0', widthExpr: '3', name: 'nova', cost: 22 },
        // COMET: fast single arcon barrage
        { xExpr: 'player.x+cos(aim+sin(i)*0.05)*350*(t-i*0.05)', yExpr: 'player.y+sin(aim+sin(i)*0.05)*350*(t-i*0.05)', emitExpr: 'i*0.05', widthExpr: '4', name: 'comet', cost: 14 },
        // ZIGZAG: zig-zagging projectile
        { xExpr: 'player.x+cos(aim)*200*t+sin(t*8)*20', yExpr: 'player.y+sin(aim)*200*t+cos(t*8)*20', emitExpr: 'i*0.03', widthExpr: '3', name: 'zigzag', cost: 14 },
        // MORTAR: arcing lobbed shot
        { xExpr: 'lerp(player.x,enemy.x,t*0.8)+sin(t*pi)*40', yExpr: 'lerp(player.y,enemy.y,t*0.8)-sin(t*pi)*60', emitExpr: 'i*0.03', widthExpr: '5', name: 'mortar', cost: 16 },
        // CHAIN: rapid chain hits
        { xExpr: 'lerp(player.x,enemy.x,min(1,t*2-i*0.1))', yExpr: 'lerp(player.y,enemy.y,min(1,t*2-i*0.1))+sin(t*6)*10', emitExpr: 'i*0.08', widthExpr: '3', name: 'chain', cost: 16 },
        // SHURIKEN: spinning outward
        { xExpr: 'player.x+cos(aim+i/N*2*pi)*160*t', yExpr: 'player.y+sin(aim+i/N*2*pi)*160*t', emitExpr: '0', widthExpr: '3', name: 'shuriken', cost: 18 },
    ];

    // Behavior-specific spell affinities — some behaviors favor certain spells
    const BEHAVIOR_SPELL_MAP = {
        'chase': ['bolt', 'lance', 'comet', 'zigzag'],
        'patrol': ['wave', 'scatter', 'mortar'],
        'guard': ['ring', 'nova', 'scatter'],
        'strafe': ['bolt', 'zigzag', 'shuriken', 'chain'],
        'lunge': ['lance', 'comet', 'bolt'],
        'turret': ['scatter', 'ring', 'nova', 'mortar', 'spiral'],
        'teleport': ['nova', 'ring', 'shuriken'],
        'dodge': ['bolt', 'zigzag', 'chain', 'comet'],
        'summon': ['spiral', 'wave', 'mortar'],
        'charge': ['lance', 'bolt', 'comet'],
        'healer': ['wave', 'spiral', 'ring'],
    };

    function createEnemy(name, stats, tileX, tileY, isBoss) {
        uidCounter++;
        // Assign a behavior-appropriate spell to ALL non-boss enemies
        let mobSpell = null;
        if (!isBoss && stats.behavior !== 'boss') {
            // Pick a spell based on behavior affinity
            const affinity = BEHAVIOR_SPELL_MAP[stats.behavior] || ['bolt', 'wave', 'scatter'];
            const affinityName = affinity[Math.floor(seededRandom() * affinity.length)];
            const spellT = MOB_SPELL_EXPRS.find(s => s.name === affinityName) || MOB_SPELL_EXPRS[0];
            try {
                mobSpell = {
                    cost: spellT.cost || 12,
                    xFn: Parser.compile(spellT.xExpr),
                    yFn: Parser.compile(spellT.yExpr),
                    emitDelayFn: Parser.compile(spellT.emitExpr),
                    widthFn: Parser.compile(spellT.widthExpr),
                    xExpr: spellT.xExpr,
                    yExpr: spellT.yExpr,
                    emitExpr: spellT.emitExpr,
                    widthExpr: spellT.widthExpr,
                    name: spellT.name,
                };
            } catch(e) {}
        }
        return {
            uid: uidCounter,
            name, isBoss,
            x: tileX * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2,
            y: tileY * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2,
            hp: stats.hp, maxHp: stats.hp,
            speed: stats.speed || 0,
            size: stats.size,
            color: stats.color,
            dmg: stats.dmg,
            behavior: stats.behavior || 'chase',
            xp: stats.xp || 10,
            alive: true,
            hitFlash: 0,
            attackCd: 0,
            aiTimer: seededRandom() * 2,
            aiDirX: 0, aiDirY: 0,
            phase: 1,
            phaseMax: stats.phases || 1,
            aggro: false,
            aggroRange: isBoss ? 250 : 150,
            attackRange: isBoss ? 100 : 40,
            spawnTimer: 0.5 + seededRandom() * 0.5,
            tauntTimer: 0,
            // Mob spell (non-boss only)
            spell: mobSpell,
            mana: isBoss ? 0 : 30,
            maxMana: isBoss ? 0 : 30,
            spellCd: 2 + seededRandom() * 3,
            // Animation state
            animTimer: 0,
            animFrame: 0,
            facing: 1, // 1=right, -1=left
            animState: 'idle', // idle, walk, attack, hurt, death
            deathTimer: 0,
            prevX: 0, prevY: 0,
        };
    }

    function update(dt, players, dungeon) {
        // Clamp dt to prevent large jumps causing NaN
        dt = Math.min(dt, 0.05);

        // Update shake
        if (shakeTimer > 0) {
            shakeTimer -= dt;
            if (shakeTimer <= 0) { shakeIntensity = 0; }
        }

        for (let ei = 0; ei < enemies.length; ei++) {
            const e = enemies[ei];
            if (!e.alive) continue;

            // NaN guard - if enemy position is corrupt, remove them
            if (isNaN(e.x) || isNaN(e.y)) {
                e.alive = false;
                continue;
            }

            if (e.hitFlash > 0) e.hitFlash -= dt;
            if (e.attackCd > 0) e.attackCd -= dt;

            // Spawn delay
            if (e.spawnTimer > 0) {
                e.spawnTimer -= dt;
                continue;
            }

            // ── PISTON KNOCKBACK: bounce off walls for 3s ──
            if (e.knockbackTimer && e.knockbackTimer > 0) {
                e.knockbackTimer -= dt;
                const kbX = e.x + (e.knockbackVX || 0) * dt;
                const kbY = e.y + (e.knockbackVY || 0) * dt;
                // Bounce off walls
                if (!Dungeon.isWalkable(dungeon, kbX, e.y)) {
                    e.knockbackVX = -(e.knockbackVX || 0) * 0.7;
                } else {
                    e.x = kbX;
                }
                if (!Dungeon.isWalkable(dungeon, e.x, kbY)) {
                    e.knockbackVY = -(e.knockbackVY || 0) * 0.7;
                } else {
                    e.y = kbY;
                }
                // Friction decay
                if (e.knockbackVX) e.knockbackVX *= 0.97;
                if (e.knockbackVY) e.knockbackVY *= 0.97;
                // Sparks while bouncing
                if (Math.random() < 0.15 && effects.length < 200) {
                    effects.push({
                        type: 'projectile', x: e.x, y: e.y,
                        vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
                        dmg: 0, life: 0.2, color: '#ff8800', size: 2, owner: 'none',
                    });
                }
                if (e.knockbackTimer <= 0) {
                    e.knockbackVX = 0;
                    e.knockbackVY = 0;
                }
                continue; // Skip normal AI while being knocked back
            }

            // Find closest player
            let closestDist = Infinity, target = null;
            for (const p of players) {
                if (p.hp <= 0) continue;
                const dx = p.x - e.x, dy = p.y - e.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < closestDist) { closestDist = d; target = p; }
            }

            if (!target) continue;

            // Aggro check - once aggroed, stay aggroed
            if (closestDist < e.aggroRange) e.aggro = true;
            if (!e.aggro && !e.isBoss) continue;

            const dx = target.x - e.x;
            const dy = target.y - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.01; // Prevent div by 0
            const ndx = dx / dist;
            const ndy = dy / dist;

            // AI behavior
            e.aiTimer -= dt;
            switch (e.behavior) {
                case 'chase':
                    moveEnemy(e, ndx, ndy, dt, dungeon);
                    break;

                case 'patrol':
                    if (e.aiTimer <= 0) {
                        e.aiTimer = 1.5 + Math.random() * 2;
                        if (e.aggro) {
                            e.aiDirX = ndx; e.aiDirY = ndy;
                        } else {
                            const a = Math.random() * Math.PI * 2;
                            e.aiDirX = Math.cos(a); e.aiDirY = Math.sin(a);
                        }
                    }
                    moveEnemy(e, e.aiDirX, e.aiDirY, dt, dungeon);
                    break;

                case 'guard':
                    if (closestDist < e.attackRange * 3) {
                        moveEnemy(e, ndx, ndy, dt, dungeon);
                    }
                    break;

                case 'strafe': {
                    const perpX = -ndy, perpY = ndx;
                    if (e.aiTimer <= 0) {
                        e.aiTimer = 0.8 + Math.random() * 1.2;
                        const side = Math.random() > 0.5 ? 1 : -1;
                        e.aiDirX = perpX * side;
                        e.aiDirY = perpY * side;
                    }
                    if (closestDist > e.attackRange * 3) {
                        moveEnemy(e, ndx * 0.6 + e.aiDirX * 0.4, ndy * 0.6 + e.aiDirY * 0.4, dt, dungeon);
                    } else {
                        moveEnemy(e, e.aiDirX, e.aiDirY, dt, dungeon);
                    }
                    break;
                }

                case 'lunge':
                    if (closestDist < e.attackRange * 3 && e.aiTimer <= 0) {
                        e.aiTimer = 1.5 + Math.random();
                        // Lunge forward
                        const lungeX = e.x + ndx * 50;
                        const lungeY = e.y + ndy * 50;
                        if (Dungeon.isWalkable(dungeon, lungeX, lungeY)) {
                            e.x = lungeX;
                            e.y = lungeY;
                        }
                    } else if (closestDist > e.attackRange) {
                        moveEnemy(e, ndx, ndy, dt, dungeon);
                    }
                    break;

                case 'turret':
                    // Stationary, handled by ranged attack below
                    break;

                case 'teleport':
                    // Blink imp: teleport near player every few seconds
                    if (e.aiTimer <= 0) {
                        e.aiTimer = 2.0 + Math.random() * 1.5;
                        const teleAngle = Math.random() * Math.PI * 2;
                        const teleDist = 40 + Math.random() * 60;
                        const tx = target.x + Math.cos(teleAngle) * teleDist;
                        const ty = target.y + Math.sin(teleAngle) * teleDist;
                        if (Dungeon.isWalkable(dungeon, tx, ty)) {
                            // Poof particles at old position
                            for (let p = 0; p < 6; p++) {
                                effects.push({ type: 'projectile', x: e.x, y: e.y,
                                    vx: (Math.random()-0.5)*80, vy: (Math.random()-0.5)*80,
                                    dmg: 0, life: 0.3, color: e.color, size: 3, owner: 'none' });
                            }
                            e.x = tx; e.y = ty;
                            // Poof at new position
                            for (let p = 0; p < 4; p++) {
                                effects.push({ type: 'projectile', x: e.x, y: e.y,
                                    vx: (Math.random()-0.5)*60, vy: (Math.random()-0.5)*60,
                                    dmg: 0, life: 0.3, color: '#ffffff', size: 2, owner: 'none' });
                            }
                        }
                    } else if (closestDist > 30) {
                        moveEnemy(e, ndx, ndy, dt, dungeon);
                    }
                    break;

                case 'dodge':
                    // Mirror knight: dodge sideways when player is close, strafe otherwise
                    if (closestDist < 60 && e.aiTimer <= 0) {
                        e.aiTimer = 0.6 + Math.random() * 0.4;
                        // Quick dodge perpendicular
                        const dodgeAngle = Math.atan2(ndy, ndx) + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2);
                        const dodgeDist = 40 + Math.random() * 20;
                        const dodgeX = e.x + Math.cos(dodgeAngle) * dodgeDist;
                        const dodgeY = e.y + Math.sin(dodgeAngle) * dodgeDist;
                        if (Dungeon.isWalkable(dungeon, dodgeX, dodgeY)) {
                            e.x = dodgeX; e.y = dodgeY;
                        }
                    } else if (closestDist > 80) {
                        moveEnemy(e, ndx, ndy, dt, dungeon);
                    } else {
                        // Circle strafe
                        const perpX2 = -ndy, perpY2 = ndx;
                        moveEnemy(e, perpX2, perpY2, dt, dungeon);
                    }
                    break;

                case 'summon':
                    // Necro acolyte: stays back and summons minions
                    if (closestDist < 80) {
                        moveEnemy(e, -ndx, -ndy, dt, dungeon); // Run away
                    } else if (e.aiTimer <= 0 && enemies.length < 25) {
                        e.aiTimer = 4 + Math.random() * 3;
                        // Summon a scarab near self
                        const sa = Math.random() * Math.PI * 2;
                        const sx = e.x + Math.cos(sa) * 20;
                        const sy = e.y + Math.sin(sa) * 20;
                        if (Dungeon.isWalkable(dungeon, sx, sy)) {
                            const minion = createEnemy('scarab', {
                                ...TYPES.scarab, hp: Math.floor(TYPES.scarab.hp * 0.7),
                            }, 0, 0, false);
                            minion.x = sx; minion.y = sy;
                            minion.spawnTimer = 0.3;
                            minion.aggro = true;
                            enemies.push(minion);
                            for (let p = 0; p < 5; p++) {
                                effects.push({ type: 'projectile', x: sx, y: sy,
                                    vx: (Math.random()-0.5)*40, vy: -Math.random()*40,
                                    dmg: 0, life: 0.4, color: '#44005a', size: 2, owner: 'none' });
                            }
                        }
                    }
                    break;

                case 'charge':
                    // Charger: picks a direction and charges fast, then pauses
                    if (e.aiTimer <= 0 && closestDist < 200) {
                        e.aiTimer = 2.5 + Math.random();
                        // Charge in direction of player
                        e.aiDirX = ndx; e.aiDirY = ndy;
                        // Do 5 fast steps
                        for (let step = 0; step < 5; step++) {
                            const cx = e.x + e.aiDirX * 16;
                            const cy = e.y + e.aiDirY * 16;
                            if (Dungeon.isWalkable(dungeon, cx, cy)) {
                                e.x = cx; e.y = cy;
                            } else break;
                        }
                        addShake(3, 0.15);
                    } else if (closestDist > 120) {
                        moveEnemy(e, ndx, ndy, dt, dungeon);
                    }
                    break;

                case 'healer':
                    // Shaman: heals nearby allies, stays back
                    if (closestDist < 100) {
                        moveEnemy(e, -ndx * 0.5, -ndy * 0.5, dt, dungeon);
                    }
                    if (e.aiTimer <= 0) {
                        e.aiTimer = 3 + Math.random() * 2;
                        // Heal nearby wounded allies
                        for (const ally of enemies) {
                            if (ally === e || !ally.alive) continue;
                            const adx = ally.x - e.x, ady = ally.y - e.y;
                            if (Math.sqrt(adx*adx + ady*ady) < 100 && ally.hp < ally.maxHp) {
                                ally.hp = Math.min(ally.maxHp, ally.hp + Math.floor(ally.maxHp * 0.15));
                                // Heal particles
                                for (let p = 0; p < 3; p++) {
                                    effects.push({ type: 'projectile', x: ally.x, y: ally.y,
                                        vx: (Math.random()-0.5)*20, vy: -Math.random()*30,
                                        dmg: 0, life: 0.5, color: '#44ff88', size: 2, owner: 'none' });
                                }
                            }
                        }
                    }
                    break;

                case 'boss':
                    updateBoss(e, target, dt, dungeon, closestDist);
                    break;
            }

            // ── Mob spell casting (ALL non-boss enemies with spells) ──
            if (!e.isBoss && e.spell && e.aggro && target) {
                if (e.spellCd !== undefined) e.spellCd -= dt;
                const maxM = e.maxMana || 30;
                e.mana = Math.min(maxM, (e.mana || 0) + dt * 5); // faster mana regen
                if (e.spellCd <= 0 && e.mana >= e.spell.cost && closestDist < 250) {
                    e.mana -= e.spell.cost;
                    e.spellCd = 2.5 + Math.random() * 2.5;
                    e.animState = 'attack'; // show attack animation when casting
                    try {
                        const cast = ArconSystem.castSpell(e.spell,
                            { id: 'enemy_' + e.uid, x: e.x, y: e.y },
                            target, target.x, target.y);
                        // Store enemy casts in effects so they render
                        if (cast) effects.push({ type: 'spell-cast', cast: cast });
                        // Casting flash particles
                        if (effects.length < 200) {
                            for (let cp = 0; cp < 4; cp++) {
                                effects.push({
                                    type: 'projectile', x: e.x, y: e.y - e.size * 0.3,
                                    vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30 - 10,
                                    dmg: 0, life: 0.3, color: e.color, size: 2, owner: 'none',
                                });
                            }
                        }
                    } catch(err) {}
                }
            }

            // ── Animation state tracking ──
            e.animTimer += dt;
            // Update facing based on movement direction
            const mvx = e.x - (e.prevX || e.x);
            if (mvx > 0.5) e.facing = 1;
            else if (mvx < -0.5) e.facing = -1;
            e.prevX = e.x; e.prevY = e.y;
            // Determine animState
            if (e.hitFlash > 0.1) {
                e.animState = 'hurt';
            } else if (Math.abs(mvx) > 0.3 || Math.abs(e.y - (e.prevY || e.y)) > 0.3) {
                e.animState = 'walk';
            } else if (e.attackCd > 0.5) {
                e.animState = 'attack';
            } else {
                e.animState = 'idle';
            }
            // Advance frame
            if (e.animTimer > 0.15) { e.animTimer = 0; e.animFrame = (e.animFrame + 1) % 4; }

            // Contact damage
            if (closestDist < e.size + 12 && e.attackCd <= 0) {
                for (const p of players) {
                    const pdx = p.x - e.x, pdy = p.y - e.y;
                    const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
                    if (pDist < e.size + (p.hitRadius || 10)) {
                        if (!p.dashing && !(p.invulnTimer > 0)) {
                            p.hp -= e.dmg;
                            p.hitFlash = 0.2;
                            e.attackCd = 0.8;
                            // Knockback with walkability check
                            const kbLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
                            const kbX = p.x + (pdx / kbLen) * 15;
                            const kbY = p.y + (pdy / kbLen) * 15;
                            if (Dungeon.isWalkableBox(dungeon, kbX, kbY, 6)) {
                                p.x = kbX; p.y = kbY;
                            } else if (Dungeon.isWalkableBox(dungeon, kbX, p.y, 6)) {
                                p.x = kbX;
                            } else if (Dungeon.isWalkableBox(dungeon, p.x, kbY, 6)) {
                                p.y = kbY;
                            }
                            // Final safety clamp
                            const bounded = Dungeon.enforceWorldBounds(p.x, p.y, dungeon);
                            p.x = bounded.x; p.y = bounded.y;
                            addShake(4, 0.15);
                            if (typeof Audio !== 'undefined') Audio.playerHurt();
                        }
                    }
                }
            }

            // Turret / ranged shooting
            if ((e.behavior === 'turret' || (e.isBoss && e.phase >= 2)) && e.attackCd <= 0 && closestDist < 250) {
                e.attackCd = e.isBoss ? 0.5 : 1.8;
                effects.push({
                    type: 'projectile',
                    x: e.x, y: e.y,
                    vx: ndx * 150, vy: ndy * 150,
                    dmg: Math.ceil(e.dmg * 0.5),
                    life: 3, color: e.color, size: 4,
                    owner: 'enemy',
                });
            }
        }

        // Update effects
        for (let i = effects.length - 1; i >= 0; i--) {
            const fx = effects[i];
            if (fx.type === 'projectile') {
                // ── HOMING PROJECTILES: curve toward target ──
                if (fx.homing && fx.homingTarget && fx.homingTarget.hp > 0) {
                    const hdx = fx.homingTarget.x - fx.x;
                    const hdy = fx.homingTarget.y - fx.y;
                    const hDist = Math.sqrt(hdx * hdx + hdy * hdy) || 1;
                    const strength = fx.homingStrength || 1;
                    fx.vx += (hdx / hDist) * strength * 60 * dt;
                    fx.vy += (hdy / hDist) * strength * 60 * dt;
                    // Cap speed
                    const spd = Math.sqrt(fx.vx * fx.vx + fx.vy * fx.vy);
                    if (spd > 250) { fx.vx = (fx.vx / spd) * 250; fx.vy = (fx.vy / spd) * 250; }
                }
                fx.x += fx.vx * dt;
                fx.y += fx.vy * dt;
                fx.life -= dt;
                if (fx.life <= 0) { effects.splice(i, 1); continue; }

                // Hit players
                for (const p of players) {
                    if (p.dashing || p.hp <= 0 || (p.invulnTimer && p.invulnTimer > 0)) continue;
                    const dx = fx.x - p.x, dy = fx.y - p.y;
                    if (Math.sqrt(dx * dx + dy * dy) < fx.size + (p.hitRadius || 10)) {
                        p.hp -= fx.dmg;
                        p.hitFlash = 0.2;
                        effects.splice(i, 1);
                        if (typeof Audio !== 'undefined') Audio.playerHurt();
                        break;
                    }
                }
            } else if (fx.type === 'spell-cast') {
                // Enemy spell casts — advance through ArconSystem
                if (fx.cast && fx.cast.active) {
                    ArconSystem.updateCast(fx.cast, dt);
                } else {
                    effects.splice(i, 1);
                }
            } else if (fx.type === 'shake') {
                fx.duration -= dt;
                if (fx.duration <= 0) effects.splice(i, 1);
            }
        }

        // Remove dead enemies
        const prevLen = enemies.length;
        enemies = enemies.filter(e => e.alive);
        // Play death sounds for removed enemies
        if (enemies.length < prevLen && typeof Audio !== 'undefined') {
            Audio.enemyDeath();
        }
    }

    // Boss spell casting from the library
    let bossSpellCache = {};
    function getBossSpells() {
        if (Object.keys(bossSpellCache).length > 0) return bossSpellCache;
        if (typeof SpellLibrary === 'undefined') return {};
        const lib = SpellLibrary.getAll();
        // Pick a variety of spells for bosses to use
        const spellNames = ['Bolt', 'Spray', 'Wave', 'Spiral', 'Seeker', 'Shield', 'Burst', 'Vortex',
                            'Nova', 'Swarm', 'Flak', 'Icicle', 'Railgun', 'Repulse', 'Tesla', 'Supernova',
                            'Cross', 'Gatling', 'Meteor', 'Buzzsaw', 'Helix', 'Lemniscate'];
        for (const name of spellNames) {
            const found = lib.find(s => s.name === name);
            if (found) {
                try {
                    const xE = found.xExpr || (found.x ? Blocks.toExpr(found.x) : null);
                    const yE = found.yExpr || (found.y ? Blocks.toExpr(found.y) : null);
                    const emE = found.emitExpr || (found.emit ? Blocks.toExpr(found.emit) : 'i*0.02');
                    const wE = found.widthExpr || (found.width ? Blocks.toExpr(found.width) : '4');
                    if (!xE || !yE) continue;
                    bossSpellCache[name] = {
                        cost: found.cost,
                        xFn: Parser.compile(xE),
                        yFn: Parser.compile(yE),
                        emitDelayFn: Parser.compile(emE),
                        widthFn: Parser.compile(wE),
                    };
                } catch(e) {}
            }
        }
        return bossSpellCache;
    }

    function bossCastSpell(boss, target, spellName) {
        const spells = getBossSpells();
        const spell = spells[spellName];
        if (!spell) return;
        try {
            const cast = ArconSystem.castSpell(spell,
                { id: 'boss_' + boss.name, x: boss.x, y: boss.y },
                target, target.x, target.y
            );
            // Store boss casts in effects as a special type
            if (cast && cast.arcons) {
                // ArconSystem handles them, we just need to track them
            }
        } catch(e) {}
    }

    function updateBoss(e, target, dt, dungeon, closestDist) {
        const dx = target.x - e.x, dy = target.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const ndx = dx / dist, ndy = dy / dist;
        if (closestDist === undefined) closestDist = dist;

        // Phase transitions
        const hpPct = e.hp / e.maxHp;
        const oldPhase = e.phase;
        if (e.phaseMax >= 4 && hpPct < 0.2) e.phase = 4;
        else if (e.phaseMax >= 3 && hpPct < 0.33) e.phase = 3;
        else if (e.phaseMax >= 2 && hpPct < 0.66) e.phase = 2;

        // Phase transition effects
        if (e.phase !== oldPhase) {
            addShake(10, 0.5);
            if (typeof Audio !== 'undefined') Audio.bossRoar();
            if (typeof Cutscene !== 'undefined') {
                const taunt = Cutscene.getBossTaunt(e.name);
                if (taunt) Cutscene.showTaunt(taunt, e.x, e.y - e.size - 20, e.color);
            }
            // Phase transition burst + heal a small amount
            e.hp = Math.min(e.maxHp, e.hp + Math.floor(e.maxHp * 0.03));
            for (let a = 0; a < 24; a++) {
                const angle = (a / 24) * Math.PI * 2;
                effects.push({
                    type: 'projectile', x: e.x, y: e.y,
                    vx: Math.cos(angle) * 120, vy: Math.sin(angle) * 120,
                    dmg: Math.ceil(e.dmg * 0.2), life: 1.5,
                    color: e.color, size: 4, owner: 'enemy',
                });
            }
        }

        // Boss taunt timer
        e.tauntTimer -= dt;
        if (e.tauntTimer <= 0) {
            e.tauntTimer = 8 + Math.random() * 5;
            if (typeof Cutscene !== 'undefined') {
                const taunt = Cutscene.getBossTaunt(e.name);
                if (taunt) Cutscene.showTaunt(taunt, e.x, e.y - e.size - 20, e.color);
            }
        }

        e.aiTimer -= dt;
        if (!e._chargeState) e._chargeState = 'none';
        if (!e._laserAngle) e._laserAngle = 0;
        if (!e._specialCooldown) e._specialCooldown = 0;
        if (!e._enrageTimer) e._enrageTimer = 0;
        e._specialCooldown -= dt;
        e._enrageTimer += dt;

        // ── Boss-specific signature attacks ──
        const bossSignature = getBossSignature(e, target, dt, dungeon);

        // ── ENRAGE: Bosses get faster & attack more after 60s ──
        const enrageMultiplier = e._enrageTimer > 60 ? 1.5 : 1.0;

        // ── MELEE SLAM: All bosses slam if player is very close ──
        if (closestDist < 35 && e.attackCd <= 0) {
            e.attackCd = 0.5;
            // Melee slam - burst of projectiles
            for (let a = 0; a < 8; a++) {
                const ang = (a / 8) * Math.PI * 2;
                effects.push({
                    type: 'projectile', x: e.x, y: e.y,
                    vx: Math.cos(ang) * 180, vy: Math.sin(ang) * 180,
                    dmg: Math.ceil(e.dmg * 0.6), life: 0.8,
                    color: e.color, size: 5, owner: 'enemy',
                });
            }
            addShake(6, 0.2);
        }

        if (e.phase === 1) {
            moveEnemy(e, ndx, ndy, dt, dungeon);
            if (e.aiTimer <= 0 && closestDist < 300) {
                e.aiTimer = (1.4 + Math.random() * 0.6) / enrageMultiplier;
                const p1Spells = ['Bolt', 'Spray', 'Seeker'];
                bossCastSpell(e, target, p1Spells[Math.floor(Math.random() * p1Spells.length)]);
                // Also fire aimed projectiles
                if (Math.random() < 0.4) {
                    for (let p = 0; p < 3; p++) {
                        const spread = (p - 1) * 0.15;
                        const aim = Math.atan2(dy, dx) + spread;
                        effects.push({
                            type: 'projectile', x: e.x, y: e.y,
                            vx: Math.cos(aim) * 160, vy: Math.sin(aim) * 160,
                            dmg: Math.ceil(e.dmg * 0.25), life: 2,
                            color: e.color, size: 4, owner: 'enemy',
                        });
                    }
                }
            }
        } else if (e.phase === 2) {
            moveEnemy(e, ndx * 1.6, ndy * 1.6, dt, dungeon);
            if (e.aiTimer <= 0) {
                e.aiTimer = (0.6 + Math.random() * 0.4) / enrageMultiplier;
                const roll = Math.random();
                if (roll < 0.2 && e._specialCooldown <= 0) {
                    bossSignature();
                    e._specialCooldown = 3.5;
                } else if (roll < 0.45) {
                    const p2Spells = ['Wave', 'Spiral', 'Flak', 'Tesla'];
                    bossCastSpell(e, target, p2Spells[Math.floor(Math.random() * p2Spells.length)]);
                } else if (roll < 0.65) {
                    // Aimed burst
                    const aim = Math.atan2(dy, dx);
                    for (let p = 0; p < 5; p++) {
                        const spread = (p - 2) * 0.12;
                        effects.push({
                            type: 'projectile', x: e.x, y: e.y,
                            vx: Math.cos(aim + spread) * 200, vy: Math.sin(aim + spread) * 200,
                            dmg: Math.ceil(e.dmg * 0.3), life: 2,
                            color: e.color, size: 5, owner: 'enemy',
                        });
                    }
                } else {
                    // Projectile ring
                    const ringCount = 10 + e.phase * 2;
                    const baseAngle = Math.random() * Math.PI * 2;
                    for (let a = 0; a < ringCount; a++) {
                        const angle = baseAngle + (a / ringCount) * Math.PI * 2;
                        effects.push({
                            type: 'projectile', x: e.x, y: e.y,
                            vx: Math.cos(angle) * 130, vy: Math.sin(angle) * 130,
                            dmg: Math.ceil(e.dmg * 0.3), life: 2.5,
                            color: e.color, size: 5, owner: 'enemy',
                        });
                    }
                }
                addShake(4, 0.15);
            }
        } else if (e.phase === 3) {
            // Phase 3: Aggressive teleporting, dense attacks
            moveEnemy(e, ndx * 2.2, ndy * 2.2, dt, dungeon);
            if (e.aiTimer <= 0) {
                e.aiTimer = (0.3 + Math.random() * 0.2) / enrageMultiplier;
                const roll = Math.random();
                if (roll < 0.18 && e._specialCooldown <= 0) {
                    bossSignature();
                    e._specialCooldown = 2.5;
                } else if (roll < 0.35) {
                    const p3Spells = ['Nova', 'Supernova', 'Vortex', 'Repulse', 'Railgun'];
                    bossCastSpell(e, target, p3Spells[Math.floor(Math.random() * p3Spells.length)]);
                } else if (roll < 0.5) {
                    // Teleport near player + slam
                    const teleAngle = Math.random() * Math.PI * 2;
                    const tx = target.x + Math.cos(teleAngle) * 60;
                    const ty = target.y + Math.sin(teleAngle) * 60;
                    if (Dungeon.isWalkable(dungeon, tx, ty)) {
                        e.x = tx; e.y = ty;
                        addShake(6, 0.25);
                        for (let a = 0; a < 10; a++) {
                            const ang = (a / 10) * Math.PI * 2;
                            effects.push({
                                type: 'projectile', x: e.x, y: e.y,
                                vx: Math.cos(ang) * 140, vy: Math.sin(ang) * 140,
                                dmg: Math.ceil(e.dmg * 0.35), life: 1.5,
                                color: e.color, size: 5, owner: 'enemy',
                            });
                        }
                    }
                } else if (roll < 0.65) {
                    // Double spiral barrage
                    const baseAngle = performance.now() * 0.003;
                    for (let w = 0; w < 4; w++) {
                        for (let a = 0; a < 8; a++) {
                            const angle = baseAngle + (a / 8) * Math.PI * 2 + w * 0.25;
                            effects.push({
                                type: 'projectile', x: e.x, y: e.y,
                                vx: Math.cos(angle) * (100 + w * 50),
                                vy: Math.sin(angle) * (100 + w * 50),
                                dmg: Math.ceil(e.dmg * 0.25), life: 2.5,
                                color: e.color, size: 4, owner: 'enemy',
                            });
                        }
                    }
                } else if (roll < 0.8) {
                    // Homing barrage: projectiles that curve toward player
                    for (let p = 0; p < 6; p++) {
                        const ang = Math.random() * Math.PI * 2;
                        const speed = 80 + Math.random() * 60;
                        effects.push({
                            type: 'projectile', x: e.x, y: e.y,
                            vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
                            dmg: Math.ceil(e.dmg * 0.3), life: 3,
                            color: e.color, size: 5, owner: 'enemy',
                            homing: true, homingTarget: target, homingStrength: 2,
                        });
                    }
                } else {
                    // Dense ring + aimed burst combo
                    const baseAngle = performance.now() * 0.002;
                    for (let a = 0; a < 16; a++) {
                        const angle = (a / 16) * Math.PI * 2 + baseAngle;
                        effects.push({
                            type: 'projectile', x: e.x, y: e.y,
                            vx: Math.cos(angle) * 160, vy: Math.sin(angle) * 160,
                            dmg: Math.ceil(e.dmg * 0.35), life: 2,
                            color: e.color, size: 4, owner: 'enemy',
                        });
                    }
                    // Plus aimed burst
                    const aim = Math.atan2(dy, dx);
                    for (let p = 0; p < 4; p++) {
                        effects.push({
                            type: 'projectile', x: e.x, y: e.y,
                            vx: Math.cos(aim) * (200 + p * 30), vy: Math.sin(aim) * (200 + p * 30),
                            dmg: Math.ceil(e.dmg * 0.4), life: 2,
                            color: '#ffffff', size: 3, owner: 'enemy',
                        });
                    }
                }
                addShake(5, 0.25);
            }
        }

        // Phase 4 (Lich King only)
        if (e.phase >= 4) {
            moveEnemy(e, ndx * 2.5, ndy * 2.5, dt, dungeon);
            if (e.aiTimer <= 0) {
                e.aiTimer = 0.25 + Math.random() * 0.15;
                const roll = Math.random();
                if (roll < 0.15 && e._specialCooldown <= 0) {
                    bossSignature();
                    e._specialCooldown = 2;
                } else if (roll < 0.5) {
                    const chaoSpells = ['Swarm', 'Supernova', 'Tesla', 'Nova', 'Spiral'];
                    bossCastSpell(e, target, chaoSpells[Math.floor(Math.random() * chaoSpells.length)]);
                } else if (roll < 0.65) {
                    // Summon minions
                    if (enemies.length < 20) {
                        for (let s = 0; s < 2; s++) {
                            const sa = Math.random() * Math.PI * 2;
                            const minion = createEnemy('skeleton', {
                                ...TYPES.skeleton, hp: TYPES.skeleton.hp * 2,
                            }, 0, 0, false);
                            minion.x = e.x + Math.cos(sa) * 40;
                            minion.y = e.y + Math.sin(sa) * 40;
                            minion.spawnTimer = 0.2;
                            minion.aggro = true;
                            enemies.push(minion);
                        }
                    }
                } else {
                    // Chaos spiral barrage
                    for (let w = 0; w < 4; w++) {
                        const baseAngle = performance.now() * 0.005 + w * Math.PI / 4;
                        for (let a = 0; a < 4; a++) {
                            const angle = baseAngle + (a / 4) * Math.PI * 2;
                            effects.push({
                                type: 'projectile', x: e.x, y: e.y,
                                vx: Math.cos(angle) * (80 + w * 60),
                                vy: Math.sin(angle) * (80 + w * 60),
                                dmg: Math.ceil(e.dmg * 0.3), life: 3,
                                color: e.color, size: 5, owner: 'enemy',
                            });
                        }
                    }
                }
                addShake(6, 0.3);
            }
        }
    }

    // ── Boss-specific signature attacks ──
    function getBossSignature(boss, target, dt, dungeon) {
        const name = boss.name;
        return () => {
            const dx = target.x - boss.x, dy = target.y - boss.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const aimAngle = Math.atan2(dy, dx);

            switch (name) {
                case 'Pharaoh Khet': {
                    // SANDSTORM SWEEP: Wide cone of projectiles sweeping left to right
                    addShake(8, 0.5);
                    for (let w = 0; w < 5; w++) {
                        setTimeout(() => {
                            const sweepAngle = aimAngle - 0.6 + (w / 4) * 1.2;
                            for (let p = 0; p < 4; p++) {
                                const a = sweepAngle + (p - 1.5) * 0.08;
                                effects.push({
                                    type: 'projectile', x: boss.x, y: boss.y,
                                    vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
                                    dmg: Math.ceil(boss.dmg * 0.4), life: 2,
                                    color: '#c4a35a', size: 6, owner: 'enemy',
                                });
                            }
                        }, w * 120);
                    }
                    break;
                }
                case 'Lord Thanatos': {
                    // DEATH CHARGE: Rush toward player with trail of fire
                    boss._chargeState = 'charging';
                    const chargeAngle = aimAngle;
                    const speed = 300;
                    let chargeTime = 0;
                    const chargeInterval = setInterval(() => {
                        chargeTime += 0.03;
                        if (chargeTime > 0.8 || boss._chargeState !== 'charging') {
                            clearInterval(chargeInterval);
                            boss._chargeState = 'none';
                            // Explosion at end
                            for (let a = 0; a < 12; a++) {
                                const ang = (a / 12) * Math.PI * 2;
                                effects.push({
                                    type: 'projectile', x: boss.x, y: boss.y,
                                    vx: Math.cos(ang) * 140, vy: Math.sin(ang) * 140,
                                    dmg: Math.ceil(boss.dmg * 0.5), life: 1.5,
                                    color: '#ff4500', size: 5, owner: 'enemy',
                                });
                            }
                            addShake(10, 0.3);
                            return;
                        }
                        const mx = boss.x + Math.cos(chargeAngle) * speed * 0.03;
                        const my = boss.y + Math.sin(chargeAngle) * speed * 0.03;
                        if (Dungeon.isWalkable(dungeon, mx, my)) {
                            boss.x = mx; boss.y = my;
                        }
                        // Fire trail
                        effects.push({
                            type: 'projectile', x: boss.x, y: boss.y,
                            vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
                            dmg: Math.ceil(boss.dmg * 0.2), life: 1.5,
                            color: '#ff6600', size: 4, owner: 'enemy',
                        });
                    }, 30);
                    addShake(6, 0.8);
                    break;
                }
                case 'Elder Thornback': {
                    // VINE ERUPTION: Line of projectiles that erupt from the ground toward player
                    addShake(6, 0.4);
                    for (let s = 1; s <= 8; s++) {
                        setTimeout(() => {
                            const spawnX = boss.x + (dx / dist) * s * 25;
                            const spawnY = boss.y + (dy / dist) * s * 25;
                            // Eruption burst at each point
                            for (let a = 0; a < 4; a++) {
                                const ang = (a / 4) * Math.PI * 2;
                                effects.push({
                                    type: 'projectile', x: spawnX, y: spawnY,
                                    vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60,
                                    dmg: Math.ceil(boss.dmg * 0.3), life: 1.5,
                                    color: '#228b22', size: 5, owner: 'enemy',
                                });
                            }
                        }, s * 100);
                    }
                    break;
                }
                case 'Archon Solaris': {
                    // LASER SWEEP: Rotating beam of dense projectiles
                    addShake(5, 1.0);
                    let sweepAngle = aimAngle - Math.PI / 3;
                    let sweepTicks = 0;
                    const sweepInterval = setInterval(() => {
                        sweepTicks++;
                        sweepAngle += 0.08;
                        if (sweepTicks > 25) { clearInterval(sweepInterval); return; }
                        for (let d = 30; d < 200; d += 25) {
                            effects.push({
                                type: 'projectile',
                                x: boss.x + Math.cos(sweepAngle) * d,
                                y: boss.y + Math.sin(sweepAngle) * d,
                                vx: Math.cos(sweepAngle) * 50, vy: Math.sin(sweepAngle) * 50,
                                dmg: Math.ceil(boss.dmg * 0.2), life: 0.4,
                                color: '#ffffff', size: 3, owner: 'enemy',
                            });
                        }
                    }, 40);
                    break;
                }
                case 'Core Override': {
                    // GRID LOCK: Cross-shaped laser grid that expands
                    addShake(6, 0.5);
                    for (let d = 0; d < 4; d++) {
                        const baseAng = d * Math.PI / 2 + performance.now() * 0.001;
                        for (let s = 1; s <= 6; s++) {
                            setTimeout(() => {
                                effects.push({
                                    type: 'projectile',
                                    x: boss.x + Math.cos(baseAng) * s * 30,
                                    y: boss.y + Math.sin(baseAng) * s * 30,
                                    vx: Math.cos(baseAng) * 180, vy: Math.sin(baseAng) * 180,
                                    dmg: Math.ceil(boss.dmg * 0.35), life: 1.5,
                                    color: '#00ffff', size: 4, owner: 'enemy',
                                });
                            }, s * 60);
                        }
                    }
                    break;
                }
                case 'Lich King Morthul': {
                    // DEATH NOVA + SUMMON: Massive expanding ring + skeleton wave
                    addShake(10, 0.6);
                    // Giant ring
                    for (let a = 0; a < 24; a++) {
                        const ang = (a / 24) * Math.PI * 2;
                        effects.push({
                            type: 'projectile', x: boss.x, y: boss.y,
                            vx: Math.cos(ang) * 100, vy: Math.sin(ang) * 100,
                            dmg: Math.ceil(boss.dmg * 0.4), life: 3,
                            color: '#9b59b6', size: 6, owner: 'enemy',
                        });
                    }
                    // Summon ring of skeletons
                    if (enemies.length < 25) {
                        for (let s = 0; s < 4; s++) {
                            const sa = (s / 4) * Math.PI * 2;
                            const minion = createEnemy('skeleton', {
                                ...TYPES.skeleton, hp: TYPES.skeleton.hp * 3,
                            }, 0, 0, false);
                            minion.x = boss.x + Math.cos(sa) * 60;
                            minion.y = boss.y + Math.sin(sa) * 60;
                            minion.spawnTimer = 0.3;
                            minion.aggro = true;
                            enemies.push(minion);
                        }
                    }
                    // Delayed inner ring
                    setTimeout(() => {
                        for (let a = 0; a < 16; a++) {
                            const ang = (a / 16) * Math.PI * 2 + 0.2;
                            effects.push({
                                type: 'projectile', x: boss.x, y: boss.y,
                                vx: Math.cos(ang) * 180, vy: Math.sin(ang) * 180,
                                dmg: Math.ceil(boss.dmg * 0.35), life: 2,
                                color: '#d8bfd8', size: 5, owner: 'enemy',
                            });
                        }
                    }, 500);
                    break;
                }
                default: {
                    // Generic fallback: concentrated burst
                    for (let a = 0; a < 12; a++) {
                        const ang = aimAngle + (a - 5.5) * 0.1;
                        effects.push({
                            type: 'projectile', x: boss.x, y: boss.y,
                            vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200,
                            dmg: Math.ceil(boss.dmg * 0.3), life: 2,
                            color: boss.color, size: 4, owner: 'enemy',
                        });
                    }
                    break;
                }
            }
        };
    }

    function moveEnemy(e, dirX, dirY, dt, dungeon) {
        // Normalize direction
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len < 0.01 || e.speed <= 0) return;
        const nx = dirX / len;
        const ny = dirY / len;

        const moveX = e.x + nx * e.speed * dt;
        const moveY = e.y + ny * e.speed * dt;

        // NaN guard
        if (isNaN(moveX) || isNaN(moveY)) return;

        if (Dungeon.isWalkable(dungeon, moveX, moveY)) {
            e.x = moveX;
            e.y = moveY;
        } else if (Dungeon.isWalkable(dungeon, moveX, e.y)) {
            e.x = moveX;
        } else if (Dungeon.isWalkable(dungeon, e.x, moveY)) {
            e.y = moveY;
        } else {
            // Stuck - randomize direction
            e.aiTimer = 0;
        }
    }

    function addShake(intensity, duration) {
        shakeIntensity = Math.max(shakeIntensity, intensity);
        shakeTimer = Math.max(shakeTimer, duration);
    }

    function damageEnemy(enemy, dmg) {
        enemy.hp -= dmg;
        enemy.hitFlash = 0.15;
        enemy.aggro = true;
        if (typeof Audio !== 'undefined') Audio.enemyHit();
        if (enemy.hp <= 0) {
            enemy.alive = false;
            // Death particles
            for (let i = 0; i < 12; i++) {
                effects.push({
                    type: 'projectile',
                    x: enemy.x, y: enemy.y,
                    vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100,
                    dmg: 0, life: 0.5, color: enemy.color, size: 3, owner: 'none',
                });
            }
            return enemy.xp;
        }
        return 0;
    }

    function damageEnemyByUid(uid, dmg) {
        const enemy = enemies.find(e => e.uid === uid && e.alive);
        if (enemy) {
            enemy.hp -= dmg;
            enemy.hitFlash = 0.15;
            enemy.aggro = true;
            if (typeof Audio !== 'undefined') Audio.enemyHit();
            if (enemy.hp <= 0) {
                enemy.alive = false;
                for (let i = 0; i < 12; i++) {
                    effects.push({
                        type: 'projectile',
                        x: enemy.x, y: enemy.y,
                        vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100,
                        dmg: 0, life: 0.5, color: enemy.color, size: 3, owner: 'none',
                    });
                }
                return enemy.xp;
            }
        }
        return 0;
    }

    // ─── Pixel Sprite Definitions ───
    // Each sprite is drawn with canvas fillRect at pixel scale (px=2)
    // Defines body shape, limbs, features per frame
    const SPRITES = {
        // ─── DESERT ───
        scarab: {
            bodyColor: '#886622', accent: '#ccaa33',
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2, h = s * 0.6;
                // Rounded shell body
                ctx.fillStyle = f ? '#fff' : '#886622';
                ctx.fillRect(sx - s/2 + px, sy - h/2, s - px*2, h);
                ctx.fillRect(sx - s/2, sy - h/2 + px, s, h - px*2);
                // Shell pattern
                ctx.fillStyle = f ? '#fff' : '#ccaa33';
                ctx.fillRect(sx - px, sy - h/2 + px, px*2, h - px*2);
                // Eyes
                ctx.fillStyle = '#ff4444';
                ctx.fillRect(sx - px*2, sy - px, px, px);
                ctx.fillRect(sx + px, sy - px, px, px);
                // Legs animated
                const lo = anim === 'walk' ? Math.sin(frame * Math.PI) * 3 : 0;
                ctx.fillStyle = f ? '#fff' : '#664411';
                ctx.fillRect(sx - s/2 - px, sy + h/2 - px + lo, px, px*2);
                ctx.fillRect(sx - s/2 + px*2, sy + h/2 - px - lo, px, px*2);
                ctx.fillRect(sx + s/2 - px*2, sy + h/2 - px + lo, px, px*2);
                ctx.fillRect(sx + s/2, sy + h/2 - px - lo, px, px*2);
            }
        },
        mummy: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                // Body wrapped
                ctx.fillStyle = f ? '#fff' : '#d4c8a0';
                ctx.fillRect(sx - s*0.3, sy - s*0.5, s*0.6, s);
                // Head
                ctx.fillRect(sx - s*0.25, sy - s*0.65, s*0.5, s*0.3);
                // Bandage lines
                ctx.fillStyle = f ? '#fff' : '#b0a480';
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(sx - s*0.3, sy - s*0.4 + i * s*0.22, s*0.6, px);
                }
                // Eyes glowing
                ctx.fillStyle = '#44ff88';
                ctx.fillRect(sx - px*2, sy - s*0.55, px, px);
                ctx.fillRect(sx + px, sy - s*0.55, px, px);
                // Arms reaching out (animated)
                const armOff = anim === 'walk' ? Math.sin(frame * Math.PI) * 4 : 0;
                ctx.fillStyle = f ? '#fff' : '#d4c8a0';
                ctx.fillRect(sx - s*0.3 - px*3, sy - s*0.1 + armOff, px*3, px*2);
                ctx.fillRect(sx + s*0.3, sy - s*0.1 - armOff, px*3, px*2);
            }
        },
        anubis_guard: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                // Tall body
                ctx.fillStyle = f ? '#fff' : '#222255';
                ctx.fillRect(sx - s*0.3, sy - s*0.6, s*0.6, s*1.1);
                // Jackal head
                ctx.fillStyle = f ? '#fff' : '#1a1a44';
                ctx.fillRect(sx - s*0.25, sy - s*0.85, s*0.5, s*0.35);
                // Snout
                ctx.fillRect(sx - px, sy - s*0.75, px*4, px*2);
                // Ears
                ctx.fillRect(sx - s*0.25, sy - s*0.95, px*2, px*3);
                ctx.fillRect(sx + s*0.25 - px*2, sy - s*0.95, px*2, px*3);
                // Eyes
                ctx.fillStyle = '#ffcc00';
                ctx.fillRect(sx - px*2, sy - s*0.8, px, px);
                ctx.fillRect(sx + px, sy - s*0.8, px, px);
                // Staff
                const staffOff = anim === 'attack' ? -4 : 0;
                ctx.fillStyle = '#ccaa00';
                ctx.fillRect(sx + s*0.3 + px, sy - s*0.7 + staffOff, px, s*1.2);
                ctx.fillRect(sx + s*0.3, sy - s*0.75 + staffOff, px*3, px*2);
            }
        },
        // ─── UNDERWORLD ───
        shade: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const bob = Math.sin(frame * Math.PI * 0.5) * 3;
                // Wispy body (tapered bottom)
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = f ? '#fff' : '#332244';
                ctx.fillRect(sx - s*0.4, sy - s*0.5 + bob, s*0.8, s*0.5);
                ctx.fillRect(sx - s*0.3, sy + bob, s*0.6, s*0.3);
                ctx.fillRect(sx - s*0.2, sy + s*0.3 + bob, s*0.4, s*0.2);
                ctx.globalAlpha = 1;
                // Hollow eyes
                ctx.fillStyle = '#8844cc';
                ctx.fillRect(sx - px*2, sy - s*0.3 + bob, px*1.5, px*2);
                ctx.fillRect(sx + px, sy - s*0.3 + bob, px*1.5, px*2);
                // Wisps trailing
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#6633aa';
                ctx.fillRect(sx - s*0.5, sy + s*0.35 + bob, px*2, px*3);
                ctx.fillRect(sx + s*0.3, sy + s*0.4 + bob, px*2, px*3);
                ctx.globalAlpha = 1;
            }
        },
        cerberus_pup: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const lo = anim === 'walk' ? Math.sin(frame * Math.PI) * 3 : 0;
                // Body
                ctx.fillStyle = f ? '#fff' : '#882222';
                ctx.fillRect(sx - s*0.4, sy - s*0.2, s*0.8, s*0.5);
                // Head
                ctx.fillRect(sx + s*0.15, sy - s*0.5, s*0.35, s*0.4);
                // Ears
                ctx.fillRect(sx + s*0.15, sy - s*0.6, px*2, px*2);
                ctx.fillRect(sx + s*0.4, sy - s*0.6, px*2, px*2);
                // Eyes
                ctx.fillStyle = '#ff6600';
                ctx.fillRect(sx + s*0.25, sy - s*0.4, px, px);
                ctx.fillRect(sx + s*0.38, sy - s*0.4, px, px);
                // Legs
                ctx.fillStyle = f ? '#fff' : '#661111';
                ctx.fillRect(sx - s*0.3, sy + s*0.3 + lo, px*2, px*3);
                ctx.fillRect(sx - s*0.05, sy + s*0.3 - lo, px*2, px*3);
                ctx.fillRect(sx + s*0.15, sy + s*0.3 + lo, px*2, px*3);
                // Tail
                ctx.fillStyle = f ? '#fff' : '#882222';
                ctx.fillRect(sx - s*0.45, sy - s*0.15 - lo, px*2, px);
            }
        },
        fury: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const flapOff = Math.sin(frame * Math.PI) * 5;
                // Body
                ctx.fillStyle = f ? '#fff' : '#993355';
                ctx.fillRect(sx - s*0.25, sy - s*0.3, s*0.5, s*0.7);
                // Wings
                ctx.fillStyle = f ? '#fff' : '#771144';
                ctx.fillRect(sx - s*0.6, sy - s*0.4 - flapOff, s*0.3, s*0.5);
                ctx.fillRect(sx + s*0.3, sy - s*0.4 - flapOff, s*0.3, s*0.5);
                // Wing tips
                ctx.fillRect(sx - s*0.65, sy - s*0.5 - flapOff, px*2, s*0.3);
                ctx.fillRect(sx + s*0.55, sy - s*0.5 - flapOff, px*2, s*0.3);
                // Head
                ctx.fillStyle = f ? '#fff' : '#993355';
                ctx.fillRect(sx - s*0.15, sy - s*0.5, s*0.3, s*0.25);
                // Eyes
                ctx.fillStyle = '#ff3366';
                ctx.fillRect(sx - px*2, sy - s*0.4, px, px);
                ctx.fillRect(sx + px, sy - s*0.4, px, px);
                // Talons
                ctx.fillStyle = '#ffcc44';
                ctx.fillRect(sx - s*0.15, sy + s*0.4, px*2, px*2);
                ctx.fillRect(sx + s*0.05, sy + s*0.4, px*2, px*2);
            }
        },
        // ─── JUNGLE ───
        vine_creep: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const wave = Math.sin(frame * Math.PI * 0.7) * 2;
                // Central stem
                ctx.fillStyle = f ? '#fff' : '#226622';
                ctx.fillRect(sx - px*1.5, sy - s*0.6, px*3, s*1.2);
                // Tendrils
                ctx.fillStyle = f ? '#fff' : '#338833';
                ctx.fillRect(sx - s*0.4 + wave, sy - s*0.3, s*0.3, px*2);
                ctx.fillRect(sx + s*0.1 - wave, sy - s*0.1, s*0.3, px*2);
                ctx.fillRect(sx - s*0.35, sy + s*0.15 - wave, s*0.25, px*2);
                ctx.fillRect(sx + s*0.15 + wave, sy + s*0.3, s*0.25, px*2);
                // Eyes in stem
                ctx.fillStyle = '#ccff44';
                ctx.fillRect(sx - px, sy - s*0.4, px, px);
                ctx.fillRect(sx + px*0.5, sy - s*0.4, px, px);
                // Thorns
                ctx.fillStyle = '#114411';
                ctx.fillRect(sx - px*2.5, sy - s*0.15, px, px);
                ctx.fillRect(sx + px*2, sy + s*0.05, px, px);
            }
        },
        spore_bloom: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const pulse = Math.sin(frame * Math.PI * 0.5) * 2;
                // Stem
                ctx.fillStyle = f ? '#fff' : '#446622';
                ctx.fillRect(sx - px, sy, px*2, s*0.5);
                // Mushroom cap
                ctx.fillStyle = f ? '#fff' : '#bb4488';
                ctx.fillRect(sx - s*0.35, sy - s*0.3 - pulse, s*0.7, s*0.4);
                ctx.fillRect(sx - s*0.45, sy - s*0.15 - pulse, s*0.9, s*0.2);
                // Spots
                ctx.fillStyle = f ? '#fff' : '#dd88aa';
                ctx.fillRect(sx - s*0.15, sy - s*0.2 - pulse, px*2, px*2);
                ctx.fillRect(sx + s*0.1, sy - s*0.15 - pulse, px, px);
                // Eyes under cap
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(sx - px*2, sy - px, px, px);
                ctx.fillRect(sx + px, sy - px, px, px);
                // Spore particles when attacking
                if (anim === 'attack') {
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = '#ffccee';
                    for (let i = 0; i < 3; i++) {
                        const a = frame * 1.2 + i * 2.1;
                        ctx.fillRect(sx + Math.cos(a) * s*0.6, sy - s*0.3 + Math.sin(a) * s*0.3, px, px);
                    }
                    ctx.globalAlpha = 1;
                }
            }
        },
        jungle_wyrm: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                // Serpentine body segments
                ctx.fillStyle = f ? '#fff' : '#228844';
                for (let i = 0; i < 5; i++) {
                    const segOff = Math.sin(frame * Math.PI * 0.5 + i * 0.8) * 3;
                    ctx.fillRect(sx - s*0.15 + segOff, sy - s*0.5 + i * s*0.22, s*0.3, s*0.2);
                }
                // Belly scales
                ctx.fillStyle = f ? '#fff' : '#66cc88';
                ctx.fillRect(sx - s*0.1, sy - s*0.3, s*0.2, s*0.6);
                // Head
                ctx.fillStyle = f ? '#fff' : '#116633';
                ctx.fillRect(sx - s*0.2, sy - s*0.6, s*0.4, s*0.2);
                // Eyes
                ctx.fillStyle = '#ffff44';
                ctx.fillRect(sx - px*2, sy - s*0.55, px, px);
                ctx.fillRect(sx + px, sy - s*0.55, px, px);
                // Fangs
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(sx - px, sy - s*0.42, px, px*2);
                ctx.fillRect(sx + px*0.5, sy - s*0.42, px, px*2);
            }
        },
        // ─── CELESTIAL ───
        sentinel: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                // Armored body
                ctx.fillStyle = f ? '#fff' : '#8899bb';
                ctx.fillRect(sx - s*0.35, sy - s*0.4, s*0.7, s*0.9);
                // Shoulder guards
                ctx.fillStyle = f ? '#fff' : '#aabbdd';
                ctx.fillRect(sx - s*0.45, sy - s*0.4, s*0.2, s*0.3);
                ctx.fillRect(sx + s*0.25, sy - s*0.4, s*0.2, s*0.3);
                // Helmet
                ctx.fillStyle = f ? '#fff' : '#667799';
                ctx.fillRect(sx - s*0.25, sy - s*0.6, s*0.5, s*0.25);
                ctx.fillRect(sx - s*0.15, sy - s*0.65, s*0.3, px*2);
                // Visor glow
                ctx.fillStyle = '#66ccff';
                ctx.fillRect(sx - s*0.15, sy - s*0.52, s*0.3, px*1.5);
                // Legs
                const lo = anim === 'walk' ? Math.sin(frame * Math.PI) * 3 : 0;
                ctx.fillStyle = f ? '#fff' : '#667799';
                ctx.fillRect(sx - s*0.2, sy + s*0.5 + lo, s*0.15, s*0.15);
                ctx.fillRect(sx + s*0.05, sy + s*0.5 - lo, s*0.15, s*0.15);
            }
        },
        radiant_golem: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                // Large rocky body
                ctx.fillStyle = f ? '#fff' : '#aa8844';
                ctx.fillRect(sx - s*0.4, sy - s*0.4, s*0.8, s*0.9);
                // Stone texture lines
                ctx.fillStyle = f ? '#fff' : '#887733';
                ctx.fillRect(sx - s*0.1, sy - s*0.3, px, s*0.7);
                ctx.fillRect(sx - s*0.35, sy, s*0.7, px);
                // Head
                ctx.fillStyle = f ? '#fff' : '#ccaa55';
                ctx.fillRect(sx - s*0.25, sy - s*0.55, s*0.5, s*0.2);
                // Glowing core
                ctx.fillStyle = '#ffdd44';
                ctx.globalAlpha = 0.7 + Math.sin(frame * Math.PI) * 0.3;
                ctx.fillRect(sx - s*0.12, sy - s*0.15, s*0.24, s*0.24);
                ctx.globalAlpha = 1;
                // Eyes
                ctx.fillStyle = '#ffcc00';
                ctx.fillRect(sx - px*2.5, sy - s*0.5, px*1.5, px);
                ctx.fillRect(sx + px, sy - s*0.5, px*1.5, px);
                // Arms
                const armOff = anim === 'attack' ? -5 : 0;
                ctx.fillStyle = f ? '#fff' : '#998844';
                ctx.fillRect(sx - s*0.55, sy - s*0.2 + armOff, s*0.15, s*0.5);
                ctx.fillRect(sx + s*0.4, sy - s*0.2 + armOff, s*0.15, s*0.5);
            }
        },
        seraph: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const flapOff = Math.sin(frame * Math.PI) * 4;
                // Robed body
                ctx.fillStyle = f ? '#fff' : '#ddddff';
                ctx.fillRect(sx - s*0.2, sy - s*0.3, s*0.4, s*0.8);
                ctx.fillRect(sx - s*0.3, sy + s*0.2, s*0.6, s*0.3);
                // Wings (feathered)
                ctx.fillStyle = f ? '#fff' : '#eeeeff';
                ctx.fillRect(sx - s*0.7, sy - s*0.5 - flapOff, s*0.4, s*0.6);
                ctx.fillRect(sx + s*0.3, sy - s*0.5 - flapOff, s*0.4, s*0.6);
                // Wing feather details
                ctx.fillStyle = '#ccccee';
                ctx.fillRect(sx - s*0.65, sy - flapOff, s*0.3, px);
                ctx.fillRect(sx + s*0.35, sy - flapOff, s*0.3, px);
                // Head halo
                ctx.fillStyle = '#ffff88';
                ctx.globalAlpha = 0.6;
                ctx.fillRect(sx - s*0.2, sy - s*0.55, s*0.4, px*2);
                ctx.globalAlpha = 1;
                // Face
                ctx.fillStyle = f ? '#fff' : '#ccccee';
                ctx.fillRect(sx - s*0.12, sy - s*0.5, s*0.24, s*0.2);
                // Eyes
                ctx.fillStyle = '#8888ff';
                ctx.fillRect(sx - px*1.5, sy - s*0.42, px, px);
                ctx.fillRect(sx + px*0.5, sy - s*0.42, px, px);
            }
        },
        // ─── CYBER ───
        drone: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const hover = Math.sin(frame * Math.PI * 0.5) * 2;
                // Mechanical body
                ctx.fillStyle = f ? '#fff' : '#556677';
                ctx.fillRect(sx - s*0.35, sy - s*0.2 + hover, s*0.7, s*0.4);
                // Rotors
                const rot = frame * Math.PI * 0.8;
                ctx.fillStyle = f ? '#fff' : '#334455';
                ctx.fillRect(sx - s*0.5, sy - s*0.25 + hover, s*0.15, px*2);
                ctx.fillRect(sx + s*0.35, sy - s*0.25 + hover, s*0.15, px*2);
                // Eye/sensor
                ctx.fillStyle = '#ff3333';
                ctx.fillRect(sx - px, sy - s*0.05 + hover, px*2, px*2);
                // Antenna
                ctx.fillStyle = f ? '#fff' : '#778899';
                ctx.fillRect(sx, sy - s*0.35 + hover, px, s*0.15);
                ctx.fillRect(sx - px, sy - s*0.38 + hover, px*3, px);
            }
        },
        turret: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                // Base
                ctx.fillStyle = f ? '#fff' : '#445566';
                ctx.fillRect(sx - s*0.4, sy + s*0.1, s*0.8, s*0.4);
                // Body
                ctx.fillStyle = f ? '#fff' : '#556677';
                ctx.fillRect(sx - s*0.3, sy - s*0.2, s*0.6, s*0.4);
                // Barrel
                const barrelKick = anim === 'attack' ? -3 : 0;
                ctx.fillStyle = f ? '#fff' : '#667788';
                ctx.fillRect(sx - px*1.5, sy - s*0.45 + barrelKick, px*3, s*0.3);
                ctx.fillRect(sx - px*2.5, sy - s*0.5 + barrelKick, px*5, px*2);
                // Targeting light
                ctx.fillStyle = anim === 'attack' ? '#ff0000' : '#ff6600';
                ctx.fillRect(sx - px, sy - s*0.1, px*2, px*2);
                // Bolts
                ctx.fillStyle = '#888';
                ctx.fillRect(sx - s*0.25, sy - s*0.05, px, px);
                ctx.fillRect(sx + s*0.2, sy - s*0.05, px, px);
            }
        },
        virus: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const pulse = Math.sin(frame * Math.PI * 0.6) * 2;
                // Blobby body
                ctx.fillStyle = f ? '#fff' : '#44bb66';
                ctx.fillRect(sx - s*0.3 - pulse, sy - s*0.3 - pulse, s*0.6 + pulse*2, s*0.6 + pulse*2);
                ctx.fillRect(sx - s*0.4, sy - s*0.15, s*0.8, s*0.3);
                ctx.fillRect(sx - s*0.15, sy - s*0.4, s*0.3, s*0.8);
                // Darker spots
                ctx.fillStyle = f ? '#fff' : '#339955';
                ctx.fillRect(sx - s*0.1, sy - s*0.15, px*2, px*2);
                ctx.fillRect(sx + s*0.1, sy + s*0.05, px, px);
                // Eyes
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(sx - px*2, sy - px*1.5, px*1.5, px*1.5);
                ctx.fillRect(sx + px*0.5, sy - px*1.5, px*1.5, px*1.5);
                ctx.fillStyle = '#000';
                ctx.fillRect(sx - px*1.5, sy - px, px, px);
                ctx.fillRect(sx + px, sy - px, px, px);
            }
        },
        // ─── CRYPT ───
        skeleton: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const lo = anim === 'walk' ? Math.sin(frame * Math.PI) * 3 : 0;
                // Ribcage body
                ctx.fillStyle = f ? '#fff' : '#ddddcc';
                ctx.fillRect(sx - s*0.2, sy - s*0.3, s*0.4, s*0.5);
                // Ribs
                ctx.fillStyle = f ? '#fff' : '#bbbbaa';
                for (let i = 0; i < 3; i++) {
                    ctx.fillRect(sx - s*0.25, sy - s*0.2 + i * px*3, s*0.5, px);
                }
                // Skull
                ctx.fillStyle = f ? '#fff' : '#eeeecc';
                ctx.fillRect(sx - s*0.2, sy - s*0.55, s*0.4, s*0.3);
                ctx.fillRect(sx - s*0.15, sy - s*0.6, s*0.3, px*2);
                // Eye sockets
                ctx.fillStyle = '#000';
                ctx.fillRect(sx - px*2.5, sy - s*0.45, px*2, px*2);
                ctx.fillRect(sx + px*0.5, sy - s*0.45, px*2, px*2);
                // Jaw
                ctx.fillStyle = f ? '#fff' : '#ccccbb';
                ctx.fillRect(sx - s*0.12, sy - s*0.27, s*0.24, px*2);
                // Arms (bone segments)
                ctx.fillStyle = f ? '#fff' : '#ddddcc';
                ctx.fillRect(sx - s*0.35, sy - s*0.15, s*0.12, px*2);
                ctx.fillRect(sx + s*0.23, sy - s*0.15, s*0.12, px*2);
                // Legs
                ctx.fillRect(sx - s*0.15, sy + s*0.2 + lo, px*2, s*0.25);
                ctx.fillRect(sx + s*0.05, sy + s*0.2 - lo, px*2, s*0.25);
            }
        },
        wraith: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const bob = Math.sin(frame * Math.PI * 0.4) * 3;
                // Hood
                ctx.fillStyle = f ? '#fff' : '#222233';
                ctx.fillRect(sx - s*0.3, sy - s*0.6 + bob, s*0.6, s*0.35);
                ctx.fillRect(sx - s*0.35, sy - s*0.45 + bob, s*0.7, s*0.2);
                // Robed body (fading)
                ctx.globalAlpha = 0.8;
                ctx.fillStyle = f ? '#fff' : '#1a1a2e';
                ctx.fillRect(sx - s*0.25, sy - s*0.25 + bob, s*0.5, s*0.55);
                ctx.globalAlpha = 0.5;
                ctx.fillRect(sx - s*0.2, sy + s*0.3 + bob, s*0.4, s*0.2);
                ctx.globalAlpha = 0.3;
                ctx.fillRect(sx - s*0.15, sy + s*0.5 + bob, s*0.3, s*0.15);
                ctx.globalAlpha = 1;
                // Glowing eyes
                ctx.fillStyle = '#66ffff';
                ctx.fillRect(sx - px*2, sy - s*0.45 + bob, px*1.5, px);
                ctx.fillRect(sx + px*0.5, sy - s*0.45 + bob, px*1.5, px);
                // Trailing wisps
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#4444ff';
                ctx.fillRect(sx - px, sy + s*0.6 + bob, px, px*2);
                ctx.fillRect(sx + px*0.5, sy + s*0.65 + bob, px, px);
                ctx.globalAlpha = 1;
            }
        },
        gargoyle: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const wingOff = anim === 'walk' ? Math.sin(frame * Math.PI) * 4 : 0;
                // Stone body
                ctx.fillStyle = f ? '#fff' : '#778888';
                ctx.fillRect(sx - s*0.3, sy - s*0.3, s*0.6, s*0.7);
                // Stone wings
                ctx.fillStyle = f ? '#fff' : '#667777';
                ctx.fillRect(sx - s*0.6, sy - s*0.4 - wingOff, s*0.25, s*0.5);
                ctx.fillRect(sx + s*0.35, sy - s*0.4 - wingOff, s*0.25, s*0.5);
                // Head with horns
                ctx.fillStyle = f ? '#fff' : '#889999';
                ctx.fillRect(sx - s*0.2, sy - s*0.5, s*0.4, s*0.25);
                // Horns
                ctx.fillStyle = f ? '#fff' : '#556666';
                ctx.fillRect(sx - s*0.25, sy - s*0.6, px*2, px*3);
                ctx.fillRect(sx + s*0.2, sy - s*0.6, px*2, px*3);
                // Eyes
                ctx.fillStyle = '#ff4400';
                ctx.fillRect(sx - px*2, sy - s*0.42, px, px);
                ctx.fillRect(sx + px, sy - s*0.42, px, px);
                // Claws
                ctx.fillStyle = '#aabbbb';
                ctx.fillRect(sx - s*0.25, sy + s*0.4, px*2, px*2);
                ctx.fillRect(sx + s*0.15, sy + s*0.4, px*2, px*2);
            }
        },
        blink_imp: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const hop = anim === 'walk' ? Math.abs(Math.sin(frame * Math.PI)) * 4 : 0;
                // Small demon body
                ctx.fillStyle = f ? '#fff' : '#bb33cc';
                ctx.fillRect(sx - s*0.3, sy - s*0.25 - hop, s*0.6, s*0.5);
                // Pointy head
                ctx.fillRect(sx - s*0.2, sy - s*0.45 - hop, s*0.4, s*0.25);
                ctx.fillRect(sx - s*0.1, sy - s*0.55 - hop, s*0.2, px*2);
                // Horns
                ctx.fillStyle = f ? '#fff' : '#881199';
                ctx.fillRect(sx - s*0.25, sy - s*0.5 - hop, px*2, px*3);
                ctx.fillRect(sx + s*0.15, sy - s*0.5 - hop, px*2, px*3);
                // Big eyes
                ctx.fillStyle = '#ffff00';
                ctx.fillRect(sx - px*2.5, sy - s*0.35 - hop, px*2, px*2);
                ctx.fillRect(sx + px*0.5, sy - s*0.35 - hop, px*2, px*2);
                // Tail
                ctx.fillStyle = f ? '#fff' : '#9922aa';
                ctx.fillRect(sx - s*0.35, sy + s*0.1 - hop, px*2, px);
                ctx.fillRect(sx - s*0.4, sy + s*0.05 - hop, px, px*2);
                // Tiny feet
                ctx.fillStyle = '#660088';
                ctx.fillRect(sx - s*0.15, sy + s*0.25, px*2, px*2);
                ctx.fillRect(sx + s*0.05, sy + s*0.25, px*2, px*2);
            }
        },
        mirror_knight: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const lo = anim === 'walk' ? Math.sin(frame * Math.PI) * 3 : 0;
                // Armored body (reflective)
                ctx.fillStyle = f ? '#fff' : '#aabbcc';
                ctx.fillRect(sx - s*0.3, sy - s*0.4, s*0.6, s*0.85);
                // Shiny highlight
                ctx.fillStyle = '#ddeeff';
                ctx.fillRect(sx - s*0.1, sy - s*0.3, s*0.15, s*0.5);
                // Helmet
                ctx.fillStyle = f ? '#fff' : '#8899aa';
                ctx.fillRect(sx - s*0.25, sy - s*0.6, s*0.5, s*0.25);
                // Visor slit
                ctx.fillStyle = '#334455';
                ctx.fillRect(sx - s*0.15, sy - s*0.5, s*0.3, px*1.5);
                // Eyes behind visor
                ctx.fillStyle = '#66ddff';
                ctx.fillRect(sx - px*2, sy - s*0.48, px, px);
                ctx.fillRect(sx + px, sy - s*0.48, px, px);
                // Shield
                ctx.fillStyle = f ? '#fff' : '#99aabb';
                ctx.fillRect(sx - s*0.5, sy - s*0.3, s*0.18, s*0.5);
                ctx.fillStyle = '#bbccdd';
                ctx.fillRect(sx - s*0.47, sy - s*0.15, s*0.12, s*0.15);
                // Sword
                const swordOff = anim === 'attack' ? -6 : 0;
                ctx.fillStyle = '#cccccc';
                ctx.fillRect(sx + s*0.35, sy - s*0.5 + swordOff, px*2, s*0.6);
                ctx.fillStyle = '#888';
                ctx.fillRect(sx + s*0.3, sy - s*0.15, px*4, px*2);
                // Legs
                ctx.fillStyle = f ? '#fff' : '#8899aa';
                ctx.fillRect(sx - s*0.2, sy + s*0.45 + lo, px*3, s*0.15);
                ctx.fillRect(sx + s*0.05, sy + s*0.45 - lo, px*3, s*0.15);
            }
        },
        necro_acolyte: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                // Dark robe
                ctx.fillStyle = f ? '#fff' : '#2a1a3a';
                ctx.fillRect(sx - s*0.25, sy - s*0.3, s*0.5, s*0.8);
                ctx.fillRect(sx - s*0.35, sy + s*0.2, s*0.7, s*0.3);
                // Hood
                ctx.fillStyle = f ? '#fff' : '#1a0a2a';
                ctx.fillRect(sx - s*0.25, sy - s*0.55, s*0.5, s*0.3);
                ctx.fillRect(sx - s*0.3, sy - s*0.4, s*0.6, s*0.15);
                // Eyes
                ctx.fillStyle = '#aa44ff';
                ctx.fillRect(sx - px*2, sy - s*0.42, px, px);
                ctx.fillRect(sx + px, sy - s*0.42, px, px);
                // Staff with skull
                const staffGlow = Math.sin(frame * Math.PI) * 0.3;
                ctx.fillStyle = '#554433';
                ctx.fillRect(sx + s*0.3, sy - s*0.6, px*1.5, s*1.1);
                ctx.fillStyle = '#bbbbaa';
                ctx.fillRect(sx + s*0.25, sy - s*0.7, px*4, px*3);
                ctx.fillStyle = '#000';
                ctx.fillRect(sx + s*0.28, sy - s*0.67, px, px);
                // Summoning glow
                if (anim === 'attack') {
                    ctx.globalAlpha = 0.4 + staffGlow;
                    ctx.fillStyle = '#aa44ff';
                    ctx.fillRect(sx - s*0.15, sy + s*0.4, s*0.3, px*3);
                    ctx.globalAlpha = 1;
                }
            }
        },
        charger: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                const lo = anim === 'walk' ? Math.sin(frame * Math.PI) * 4 : 0;
                // Bulky body
                ctx.fillStyle = f ? '#fff' : '#884422';
                ctx.fillRect(sx - s*0.4, sy - s*0.25, s*0.8, s*0.5);
                // Head (lowered for charging)
                const headOff = anim === 'attack' ? 4 : 0;
                ctx.fillStyle = f ? '#fff' : '#773311';
                ctx.fillRect(sx + s*0.15, sy - s*0.45 + headOff, s*0.35, s*0.3);
                // Horns
                ctx.fillStyle = f ? '#fff' : '#ccbb88';
                ctx.fillRect(sx + s*0.45, sy - s*0.55 + headOff, px*3, px*2);
                ctx.fillRect(sx + s*0.45, sy - s*0.35 + headOff, px*3, px*2);
                // Eye
                ctx.fillStyle = '#ff3300';
                ctx.fillRect(sx + s*0.35, sy - s*0.35 + headOff, px, px);
                // Legs
                ctx.fillStyle = f ? '#fff' : '#663311';
                ctx.fillRect(sx - s*0.3, sy + s*0.25 + lo, px*3, s*0.2);
                ctx.fillRect(sx - s*0.05, sy + s*0.25 - lo, px*3, s*0.2);
                ctx.fillRect(sx + s*0.15, sy + s*0.25 + lo, px*3, s*0.2);
                // Dust when charging
                if (anim === 'attack') {
                    ctx.globalAlpha = 0.4;
                    ctx.fillStyle = '#aa8866';
                    ctx.fillRect(sx - s*0.55, sy + s*0.3, px*3, px*2);
                    ctx.fillRect(sx - s*0.6, sy + s*0.2, px*2, px);
                    ctx.globalAlpha = 1;
                }
            }
        },
        shaman: {
            draw(ctx, sx, sy, s, f, frame, anim) {
                const px = 2;
                // Tribal robe
                ctx.fillStyle = f ? '#fff' : '#335544';
                ctx.fillRect(sx - s*0.25, sy - s*0.3, s*0.5, s*0.8);
                // Feather headdress
                ctx.fillStyle = f ? '#fff' : '#22aa44';
                ctx.fillRect(sx - s*0.2, sy - s*0.55, s*0.4, s*0.3);
                // Feathers
                ctx.fillStyle = '#44cc66';
                ctx.fillRect(sx - s*0.15, sy - s*0.7, px*2, px*4);
                ctx.fillRect(sx, sy - s*0.7, px*2, px*4);
                ctx.fillStyle = '#ff6644';
                ctx.fillRect(sx - s*0.08, sy - s*0.75, px*2, px*3);
                // Face
                ctx.fillStyle = '#88aa77';
                ctx.fillRect(sx - s*0.12, sy - s*0.45, s*0.24, s*0.15);
                // Eyes
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(sx - px*2, sy - s*0.42, px, px);
                ctx.fillRect(sx + px, sy - s*0.42, px, px);
                // Staff with gems
                ctx.fillStyle = '#664422';
                ctx.fillRect(sx - s*0.35, sy - s*0.4, px*1.5, s*0.9);
                // Healing glow
                if (anim === 'attack') {
                    ctx.globalAlpha = 0.5;
                    ctx.fillStyle = '#44ff88';
                    ctx.fillRect(sx - s*0.4, sy - s*0.45, px*4, px*4);
                    ctx.globalAlpha = 1;
                } else {
                    ctx.fillStyle = '#44cc88';
                    ctx.fillRect(sx - s*0.38, sy - s*0.42, px*2, px*2);
                }
            }
        },
    };

    // Fallback for any enemy type not in SPRITES
    function drawFallbackSprite(ctx, sx, sy, s, f, frame, anim, color) {
        const px = 2;
        ctx.fillStyle = f ? '#fff' : color;
        ctx.fillRect(sx - s/2, sy - s/2, s, s);
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx - 3, sy - 2, 2, 2);
        ctx.fillRect(sx + 1, sy - 2, 2, 2);
    }

    function render(ctx, cameraX, cameraY) {
        const ZOOM = Dungeon.ZOOM || 1;

        ctx.save();
        ctx.scale(ZOOM, ZOOM);

        for (const e of enemies) {
            if (!e.alive) continue;
            const sx = e.x - cameraX, sy = e.y - cameraY;
            if (sx < -60 || sx > 1020 || sy < -60 || sy > 600) continue;

            // Spawn fade-in
            if (e.spawnTimer > 0) {
                ctx.globalAlpha = Math.max(0, 1 - e.spawnTimer * 2);
            }

            const flash = e.hitFlash > 0;
            const s = e.size;

            // Shadow
            ctx.globalAlpha = (e.spawnTimer > 0 ? 0.1 : 0.3);
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(sx, sy + s/2 + 2, s * 0.4, 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = e.spawnTimer > 0 ? Math.max(0, 1 - e.spawnTimer * 2) : 1;

            // Flip based on facing
            ctx.save();
            ctx.translate(sx, sy);
            ctx.scale(e.facing, 1);
            ctx.translate(-sx, -sy);

            // Draw sprite using the SPRITES lookup
            const spriteData = SPRITES[e.name];
            if (spriteData) {
                spriteData.draw(ctx, sx, sy, s, flash, e.animFrame, e.animState);
            } else {
                drawFallbackSprite(ctx, sx, sy, s, flash, e.animFrame, e.animState, e.color);
            }

            ctx.restore();

            // Boss aura glow
            if (e.isBoss || e.isMiniboss) {
                ctx.globalAlpha = 0.08 + Math.sin(performance.now() / 200) * 0.04;
                ctx.fillStyle = e.color;
                ctx.beginPath();
                ctx.arc(sx, sy, s * 1.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                // Boss name label
                ctx.fillStyle = '#ffcc44';
                ctx.font = '7px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(e.name.replace(/_/g, ' ').toUpperCase(), sx, sy - s/2 - 12);
            }

            // HP bar
            if (e.hp < e.maxHp) {
                const barW = Math.max(s + 4, 22);
                const hpPct = e.hp / e.maxHp;
                ctx.fillStyle = '#111';
                ctx.fillRect(sx - barW/2 - 1, sy - s/2 - 8, barW + 2, 5);
                ctx.fillStyle = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#cccc44' : '#cc4444';
                ctx.fillRect(sx - barW/2, sy - s/2 - 7, barW * hpPct, 3);
            }

            ctx.globalAlpha = 1;
        }

        // Render projectiles (improved)
        for (const fx of effects) {
            if (fx.type === 'projectile' && fx.owner === 'enemy') {
                const sx = fx.x - cameraX, sy = fx.y - cameraY;
                // Glow
                ctx.globalAlpha = 0.25;
                ctx.fillStyle = fx.color;
                ctx.beginPath();
                ctx.arc(sx, sy, fx.size * 2.5, 0, Math.PI * 2);
                ctx.fill();
                // Core
                ctx.globalAlpha = 0.9;
                ctx.fillStyle = '#fff';
                ctx.fillRect(sx - fx.size/2, sy - fx.size/2, fx.size, fx.size);
                // Color ring
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = fx.color;
                ctx.fillRect(sx - fx.size, sy - fx.size, fx.size * 2, fx.size * 2);
                ctx.fillStyle = '#fff';
                ctx.fillRect(sx - fx.size * 0.4, sy - fx.size * 0.4, fx.size * 0.8, fx.size * 0.8);
                ctx.globalAlpha = 1;
            }
        }

        ctx.restore();
    }

    function getShake() {
        if (shakeTimer > 0) return shakeIntensity * (shakeTimer / 0.3);
        return 0;
    }

    // ── MINOTAUR RANDOM SPAWN SYSTEM ──
    let minotaurTimer = 0;
    let minotaurSpawning = null; // { x, y, shadowTimer, landed }
    const MINOTAUR_INTERVAL_MIN = 45; // seconds between possible spawns
    const MINOTAUR_INTERVAL_MAX = 90;
    let nextMinotaurTime = MINOTAUR_INTERVAL_MIN + Math.random() * (MINOTAUR_INTERVAL_MAX - MINOTAUR_INTERVAL_MIN);

    function updateMinotaur(dt, playerX, playerY, dungeon, difficulty) {
        minotaurTimer += dt;

        // Shadow drop-in animation
        if (minotaurSpawning) {
            minotaurSpawning.shadowTimer -= dt;
            if (minotaurSpawning.shadowTimer <= 0 && !minotaurSpawning.landed) {
                minotaurSpawning.landed = true;
                // Create the minotaur enemy
                const mData = TYPES.minotaur;
                const m = createEnemy('Minotaur', {
                    ...mData,
                    hp: Math.floor(mData.hp * (difficulty || 1)),
                    dmg: Math.floor(mData.dmg * (difficulty || 1)),
                    phases: 2,
                }, Math.floor(minotaurSpawning.x / Dungeon.TILE_SIZE), Math.floor(minotaurSpawning.y / Dungeon.TILE_SIZE), false);
                m.isMiniboss = true;
                m.aggroRange = 300;
                m.attackRange = 60;
                m.x = minotaurSpawning.x;
                m.y = minotaurSpawning.y;
                m.spawnTimer = 0;
                m.aggro = true;
                enemies.push(m);
                addShake(8, 0.5);
                // Impact particles
                for (let p = 0; p < 20; p++) {
                    effects.push({
                        type: 'projectile', x: m.x, y: m.y,
                        vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200,
                        dmg: 0, life: 0.6, color: '#8B4513', size: 4, owner: 'none',
                    });
                }
                minotaurSpawning = null;
            }
            return;
        }

        if (minotaurTimer >= nextMinotaurTime) {
            minotaurTimer = 0;
            nextMinotaurTime = MINOTAUR_INTERVAL_MIN + Math.random() * (MINOTAUR_INTERVAL_MAX - MINOTAUR_INTERVAL_MIN);
            // Pick a random position near the player
            const angle = Math.random() * Math.PI * 2;
            const dist = 120 + Math.random() * 100;
            const sx = playerX + Math.cos(angle) * dist;
            const sy = playerY + Math.sin(angle) * dist;
            if (dungeon && Dungeon.isWalkable(dungeon, sx, sy)) {
                minotaurSpawning = { x: sx, y: sy, shadowTimer: 1.5, landed: false };
                addShake(2, 1.5); // rumble warning
            }
        }
    }

    function renderMinotaurShadow(ctx, cameraX, cameraY) {
        if (!minotaurSpawning || minotaurSpawning.landed) return;
        const ms = minotaurSpawning;
        const sx = ms.x - cameraX, sy = ms.y - cameraY;
        const progress = 1 - (ms.shadowTimer / 1.5);

        // Growing shadow on ground
        ctx.save();
        ctx.globalAlpha = 0.3 + progress * 0.4;
        ctx.fillStyle = '#000';
        const shadowW = 20 + progress * 30;
        const shadowH = 8 + progress * 12;
        ctx.beginPath();
        ctx.ellipse(sx, sy, shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Falling silhouette
        const dropY = sy - (1 - progress) * 200;
        ctx.globalAlpha = 0.5 + progress * 0.3;
        ctx.fillStyle = '#4a2810';
        // Simple minotaur silhouette (body)
        ctx.fillRect(sx - 10, dropY - 18, 20, 24);
        // Head with horns
        ctx.fillRect(sx - 8, dropY - 26, 16, 10);
        ctx.fillRect(sx - 14, dropY - 28, 6, 4); // left horn
        ctx.fillRect(sx + 8, dropY - 28, 6, 4); // right horn
        // Legs
        ctx.fillRect(sx - 8, dropY + 6, 6, 8);
        ctx.fillRect(sx + 2, dropY + 6, 6, 8);

        // Warning indicator
        if (Math.sin(performance.now() / 100) > 0) {
            ctx.fillStyle = '#ff4444';
            ctx.globalAlpha = 0.6;
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('⚠', sx, sy - 40 - (1 - progress) * 150);
        }

        ctx.restore();
    }

    function resetMinotaurTimer() {
        minotaurTimer = 0;
        minotaurSpawning = null;
        nextMinotaurTime = MINOTAUR_INTERVAL_MIN + Math.random() * (MINOTAUR_INTERVAL_MAX - MINOTAUR_INTERVAL_MIN);
    }

    return {
        TYPES, BOSSES, reset, spawnFromDungeon, update, render,
        damageEnemy, damageEnemyByUid, getShake, addShake, seedRandom,
        getEnemies: () => enemies,
        getEffects: () => effects,
        updateMinotaur, renderMinotaurShadow, resetMinotaurTimer,
    };
})();
