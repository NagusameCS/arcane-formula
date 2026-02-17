// -----------------------------------------
//  ENEMY SYSTEM -- Themed enemies, AI, bosses
//  v2: Fixed AI freezing, NaN guards, better behaviors
// -----------------------------------------

const Enemies = (() => {
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
    };

    const BOSSES = {
        'Pharaoh Khet':     { hp: 300, speed: 50, size: 24, color: '#ffd700', dmg: 20, xp: 200, phases: 3 },
        'Lord Thanatos':    { hp: 350, speed: 60, size: 22, color: '#ff4500', dmg: 25, xp: 250, phases: 3 },
        'Elder Thornback':  { hp: 400, speed: 35, size: 28, color: '#228b22', dmg: 18, xp: 300, phases: 3 },
        'Archon Solaris':   { hp: 320, speed: 70, size: 20, color: '#ffffff', dmg: 22, xp: 280, phases: 3 },
        'Core Override':    { hp: 280, speed: 80, size: 20, color: '#00ffff', dmg: 20, xp: 260, phases: 3 },
        'Lich King Morthul':{ hp: 500, speed: 45, size: 26, color: '#9b59b6', dmg: 30, xp: 500, phases: 4 },
    };

    let enemies = [];
    let effects = [];
    let shakeIntensity = 0;
    let shakeTimer = 0;

    function reset() { enemies = []; effects = []; shakeIntensity = 0; shakeTimer = 0; }

    function spawnFromDungeon(dungeon) {
        enemies = [];
        const theme = dungeon.theme;
        const difficulty = 1 + dungeon.floorIndex * 0.3;

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
                const typeName = theme.enemies[Math.floor(Math.random() * theme.enemies.length)];
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

    function createEnemy(name, stats, tileX, tileY, isBoss) {
        return {
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
            aiTimer: Math.random() * 2, // Randomize initial AI timers to prevent sync
            aiDirX: 0, aiDirY: 0,
            phase: 1,
            phaseMax: stats.phases || 1,
            aggro: false,
            aggroRange: isBoss ? 250 : 150,
            attackRange: isBoss ? 100 : 40,
            spawnTimer: 0.5 + Math.random() * 0.5, // Stagger spawn so enemies don't all update frame 1
            tauntTimer: 0,
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
                            const kbX = p.x + (pdx / kbLen) * 30;
                            const kbY = p.y + (pdy / kbLen) * 30;
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
                            'Nova', 'Swarm', 'Flak', 'Icicle', 'Railgun', 'Repulse', 'Tesla', 'Supernova'];
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
            addShake(8, 0.4);
            if (typeof Audio !== 'undefined') Audio.bossRoar();
            // Show taunt on phase change
            if (typeof Cutscene !== 'undefined') {
                const taunt = Cutscene.getBossTaunt(e.name);
                if (taunt) Cutscene.showTaunt(taunt, e.x, e.y - e.size - 20, e.color);
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

        if (e.phase === 1) {
            moveEnemy(e, ndx, ndy, dt, dungeon);
            // Phase 1: Occasional spell cast
            if (e.aiTimer <= 0 && closestDist < 250) {
                e.aiTimer = 2.0 + Math.random();
                const p1Spells = ['Bolt', 'Spray', 'Seeker'];
                bossCastSpell(e, target, p1Spells[Math.floor(Math.random() * p1Spells.length)]);
            }
        } else if (e.phase === 2) {
            moveEnemy(e, ndx * 1.5, ndy * 1.5, dt, dungeon);
            if (e.aiTimer <= 0) {
                e.aiTimer = 1.0 + Math.random() * 0.5;
                // Phase 2: Stronger spells + projectile ring
                if (Math.random() < 0.4) {
                    const p2Spells = ['Wave', 'Spiral', 'Flak', 'Tesla'];
                    bossCastSpell(e, target, p2Spells[Math.floor(Math.random() * p2Spells.length)]);
                } else {
                    for (let a = 0; a < 8; a++) {
                        const angle = (a / 8) * Math.PI * 2;
                        effects.push({
                            type: 'projectile', x: e.x, y: e.y,
                            vx: Math.cos(angle) * 120, vy: Math.sin(angle) * 120,
                            dmg: Math.ceil(e.dmg * 0.3), life: 2.5,
                            color: e.color, size: 5, owner: 'enemy',
                        });
                    }
                }
                addShake(3, 0.15);
            }
        } else if (e.phase === 3) {
            moveEnemy(e, ndx * 2, ndy * 2, dt, dungeon);
            if (e.aiTimer <= 0) {
                e.aiTimer = 0.5 + Math.random() * 0.3;
                // Phase 3: Powerful spells, dense projectiles, teleport
                const roll = Math.random();
                if (roll < 0.3) {
                    const p3Spells = ['Nova', 'Supernova', 'Vortex', 'Repulse', 'Railgun'];
                    bossCastSpell(e, target, p3Spells[Math.floor(Math.random() * p3Spells.length)]);
                } else if (roll < 0.5) {
                    // Teleport near player
                    const teleAngle = Math.random() * Math.PI * 2;
                    const tx = target.x + Math.cos(teleAngle) * 80;
                    const ty = target.y + Math.sin(teleAngle) * 80;
                    if (Dungeon.isWalkable(dungeon, tx, ty)) {
                        e.x = tx; e.y = ty;
                        addShake(5, 0.2);
                    }
                } else {
                    const baseAngle = performance.now() * 0.002;
                    for (let a = 0; a < 12; a++) {
                        const angle = (a / 12) * Math.PI * 2 + baseAngle;
                        effects.push({
                            type: 'projectile', x: e.x, y: e.y,
                            vx: Math.cos(angle) * 160, vy: Math.sin(angle) * 160,
                            dmg: Math.ceil(e.dmg * 0.4), life: 2,
                            color: e.color, size: 4, owner: 'enemy',
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
                e.aiTimer = 0.3 + Math.random() * 0.2;
                // Absolute chaos: multiple spells + summons
                const chaoSpells = ['Swarm', 'Supernova', 'Tesla', 'Nova', 'Spiral'];
                bossCastSpell(e, target, chaoSpells[Math.floor(Math.random() * chaoSpells.length)]);
                // Summon minions occasionally
                if (Math.random() < 0.15 && enemies.length < 20) {
                    const sa = Math.random() * Math.PI * 2;
                    const minion = createEnemy('skeleton', {
                        ...TYPES.skeleton, hp: TYPES.skeleton.hp * 2,
                    }, 0, 0, false);
                    minion.x = e.x + Math.cos(sa) * 30;
                    minion.y = e.y + Math.sin(sa) * 30;
                    minion.spawnTimer = 0.2;
                    minion.aggro = true;
                    enemies.push(minion);
                }
                addShake(6, 0.3);
            }
        }
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

    function render(ctx, cameraX, cameraY) {
        const ZOOM = Dungeon.ZOOM || 1;

        ctx.save();
        ctx.scale(ZOOM, ZOOM);

        for (const e of enemies) {
            if (!e.alive) continue;
            const sx = e.x - cameraX, sy = e.y - cameraY;
            if (sx < -50 || sx > 1010 || sy < -50 || sy > 590) continue;

            // Skip enemies still spawning (fade in)
            if (e.spawnTimer > 0) {
                ctx.globalAlpha = Math.max(0, 1 - e.spawnTimer * 2);
            }

            const flash = e.hitFlash > 0;
            const s = e.size;

            // Shadow
            ctx.globalAlpha = (e.spawnTimer > 0 ? 0.1 : 0.3);
            ctx.fillStyle = '#000';
            ctx.fillRect(sx - s/2, sy + s/2, s, 3);
            ctx.globalAlpha = e.spawnTimer > 0 ? Math.max(0, 1 - e.spawnTimer * 2) : 1;

            // Body
            ctx.fillStyle = flash ? '#fff' : e.color;
            if (e.isBoss) {
                ctx.fillRect(sx - s/2, sy - s/2, s, s);
                ctx.fillRect(sx - s/2 - 2, sy - s/2 - 4, 4, 4);
                ctx.fillRect(sx + s/2 - 2, sy - s/2 - 4, 4, 4);
                ctx.fillStyle = flash ? '#fff' : '#ff0000';
                ctx.fillRect(sx - 4, sy - 3, 3, 3);
                ctx.fillRect(sx + 2, sy - 3, 3, 3);
                ctx.globalAlpha = 0.1 + Math.sin(performance.now() / 200) * 0.05;
                ctx.fillStyle = e.color;
                ctx.fillRect(sx - s, sy - s, s * 2, s * 2);
                ctx.globalAlpha = 1;
            } else {
                ctx.fillRect(sx - s/2, sy - s/2, s, s);
                ctx.fillStyle = '#fff';
                ctx.fillRect(sx - 3, sy - 2, 2, 2);
                ctx.fillRect(sx + 1, sy - 2, 2, 2);
            }

            // HP bar
            if (e.hp < e.maxHp) {
                const barW = Math.max(s, 20);
                const hpPct = e.hp / e.maxHp;
                ctx.fillStyle = '#333';
                ctx.fillRect(sx - barW/2, sy - s/2 - 6, barW, 3);
                ctx.fillStyle = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#cccc44' : '#cc4444';
                ctx.fillRect(sx - barW/2, sy - s/2 - 6, barW * hpPct, 3);
            }

            ctx.globalAlpha = 1;
        }

        // Render projectiles
        for (const fx of effects) {
            if (fx.type === 'projectile' && fx.owner === 'enemy') {
                const sx = fx.x - cameraX, sy = fx.y - cameraY;
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = fx.color;
                ctx.fillRect(sx - fx.size * 1.5, sy - fx.size * 1.5, fx.size * 3, fx.size * 3);
                ctx.globalAlpha = 0.9;
                ctx.fillStyle = '#fff';
                ctx.fillRect(sx - fx.size/2, sy - fx.size/2, fx.size, fx.size);
                ctx.globalAlpha = 1;
            }
        }

        ctx.restore();
    }

    function getShake() {
        if (shakeTimer > 0) return shakeIntensity * (shakeTimer / 0.3);
        return 0;
    }

    return {
        TYPES, BOSSES, reset, spawnFromDungeon, update, render,
        damageEnemy, getShake, addShake,
        getEnemies: () => enemies,
        getEffects: () => effects,
    };
})();
