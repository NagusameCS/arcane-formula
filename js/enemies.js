// ─────────────────────────────────────────────
//  ENEMY SYSTEM — Themed enemies, AI, bosses
//  Ported and adapted from Into-The-Deluge
// ─────────────────────────────────────────────

const Enemies = (() => {
    // ── ENEMY TYPE DEFINITIONS ──
    const TYPES = {
        // Egypt
        scarab: { hp: 15, speed: 80, size: 8, color: '#c4a35a', dmg: 5, behavior: 'chase', xp: 10 },
        mummy: { hp: 40, speed: 40, size: 12, color: '#d4c5a0', dmg: 10, behavior: 'patrol', xp: 25 },
        anubis_guard: { hp: 60, speed: 60, size: 14, color: '#ffd700', dmg: 15, behavior: 'guard', xp: 40 },
        // Hades
        shade: { hp: 20, speed: 100, size: 8, color: '#5a2040', dmg: 8, behavior: 'chase', xp: 15 },
        cerberus_pup: { hp: 50, speed: 70, size: 14, color: '#8b0000', dmg: 12, behavior: 'lunge', xp: 30 },
        fury: { hp: 35, speed: 120, size: 10, color: '#ff4500', dmg: 15, behavior: 'strafe', xp: 35 },
        // Jungle
        vine_creep: { hp: 25, speed: 50, size: 10, color: '#228b22', dmg: 8, behavior: 'chase', xp: 12 },
        spore_bloom: { hp: 30, speed: 0, size: 12, color: '#32cd32', dmg: 10, behavior: 'turret', xp: 20 },
        jungle_wyrm: { hp: 70, speed: 60, size: 16, color: '#006400', dmg: 15, behavior: 'patrol', xp: 45 },
        // Light
        sentinel: { hp: 45, speed: 55, size: 12, color: '#e8e8e0', dmg: 12, behavior: 'guard', xp: 30 },
        radiant_golem: { hp: 80, speed: 35, size: 18, color: '#ffd700', dmg: 20, behavior: 'chase', xp: 50 },
        seraph: { hp: 30, speed: 110, size: 10, color: '#ffffff', dmg: 10, behavior: 'strafe', xp: 25 },
        // Cyber
        drone: { hp: 15, speed: 130, size: 8, color: '#00bfff', dmg: 6, behavior: 'strafe', xp: 12 },
        turret: { hp: 50, speed: 0, size: 14, color: '#4a4a4a', dmg: 15, behavior: 'turret', xp: 35 },
        virus: { hp: 25, speed: 90, size: 8, color: '#00ff00', dmg: 8, behavior: 'chase', xp: 15 },
        // Stone
        skeleton: { hp: 30, speed: 60, size: 10, color: '#d4c5a0', dmg: 10, behavior: 'chase', xp: 15 },
        wraith: { hp: 25, speed: 100, size: 10, color: '#9b59b6', dmg: 12, behavior: 'strafe', xp: 25 },
        gargoyle: { hp: 80, speed: 40, size: 16, color: '#4a4550', dmg: 18, behavior: 'guard', xp: 40 },
    };

    // ── BOSS DEFINITIONS ──
    const BOSSES = {
        'Pharaoh Khet':   { hp: 300, speed: 50, size: 24, color: '#ffd700', dmg: 20, xp: 200, phases: 3 },
        'Lord Thanatos':   { hp: 350, speed: 60, size: 22, color: '#ff4500', dmg: 25, xp: 250, phases: 3 },
        'Elder Thornback': { hp: 400, speed: 35, size: 28, color: '#228b22', dmg: 18, xp: 300, phases: 3 },
        'Archon Solaris':  { hp: 320, speed: 70, size: 20, color: '#ffffff', dmg: 22, xp: 280, phases: 3 },
        'Core Override':   { hp: 280, speed: 80, size: 20, color: '#00ffff', dmg: 20, xp: 260, phases: 3 },
        'Lich King Morthul': { hp: 500, speed: 45, size: 26, color: '#9b59b6', dmg: 30, xp: 500, phases: 4 },
    };

    let enemies = [];
    let effects = [];

    function reset() { enemies = []; effects = []; }

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
            speed: stats.speed,
            size: stats.size,
            color: stats.color,
            dmg: stats.dmg,
            behavior: stats.behavior || 'chase',
            xp: stats.xp || 10,
            alive: true,
            hitFlash: 0,
            attackCd: 0,
            aiTimer: 0,
            aiDirX: 0, aiDirY: 0,
            phase: 1,
            phaseMax: stats.phases || 1,
            aggro: false,
            aggroRange: isBoss ? 200 : 120,
            attackRange: isBoss ? 100 : 40,
            spawnTimer: 0,
        };
    }

    function update(dt, players, dungeon) {
        for (const e of enemies) {
            if (!e.alive) continue;
            if (e.hitFlash > 0) e.hitFlash -= dt;
            if (e.attackCd > 0) e.attackCd -= dt;
            if (e.spawnTimer > 0) { e.spawnTimer -= dt; continue; }

            // Find closest player
            let closestDist = Infinity, target = null;
            for (const p of players) {
                if (p.hp <= 0) continue;
                const dx = p.x - e.x, dy = p.y - e.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < closestDist) { closestDist = d; target = p; }
            }

            if (!target) continue;

            // Aggro check
            if (closestDist < e.aggroRange) e.aggro = true;
            if (!e.aggro && !e.isBoss) continue;

            const dx = target.x - e.x, dy = target.y - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const ndx = dx / dist, ndy = dy / dist;

            // AI behavior
            e.aiTimer -= dt;
            switch (e.behavior) {
                case 'chase':
                    moveEnemy(e, ndx, ndy, dt, dungeon);
                    break;

                case 'patrol':
                    if (e.aiTimer <= 0) {
                        e.aiTimer = 2 + Math.random() * 2;
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
                    if (closestDist < e.attackRange * 2) {
                        moveEnemy(e, ndx, ndy, dt, dungeon);
                    }
                    break;

                case 'strafe':
                    // Circle around target
                    const perpX = -ndy, perpY = ndx;
                    if (e.aiTimer <= 0) {
                        e.aiTimer = 1 + Math.random();
                        e.aiDirX = perpX * (Math.random() > 0.5 ? 1 : -1);
                        e.aiDirY = perpY * (Math.random() > 0.5 ? 1 : -1);
                    }
                    if (closestDist > e.attackRange * 3) {
                        moveEnemy(e, ndx * 0.5 + e.aiDirX * 0.5, ndy * 0.5 + e.aiDirY * 0.5, dt, dungeon);
                    } else {
                        moveEnemy(e, e.aiDirX, e.aiDirY, dt, dungeon);
                    }
                    break;

                case 'lunge':
                    if (closestDist < e.attackRange * 3 && e.aiTimer <= 0) {
                        // Lunge at player
                        e.aiTimer = 2;
                        e.x += ndx * 60;
                        e.y += ndy * 60;
                    } else if (closestDist > e.attackRange) {
                        moveEnemy(e, ndx, ndy, dt, dungeon);
                    }
                    break;

                case 'turret':
                    // Stationary, shoots (handled by attack below)
                    break;

                case 'boss':
                    updateBoss(e, target, dt, dungeon);
                    break;
            }

            // Contact damage
            if (closestDist < e.size + 12 && e.attackCd <= 0) {
                for (const p of players) {
                    const pdx = p.x - e.x, pdy = p.y - e.y;
                    if (Math.sqrt(pdx * pdx + pdy * pdy) < e.size + p.hitRadius) {
                        if (!p.dashing) {
                            p.hp -= e.dmg;
                            p.hitFlash = 0.2;
                            e.attackCd = 1;
                            // Knockback
                            p.x += (pdx / (Math.abs(pdx) + Math.abs(pdy) || 1)) * 30;
                            p.y += (pdy / (Math.abs(pdx) + Math.abs(pdy) || 1)) * 30;
                            // Screen shake effect
                            effects.push({ type: 'shake', duration: 0.15, intensity: 4 });
                        }
                    }
                }
            }

            // Turret/ranged shooting
            if ((e.behavior === 'turret' || (e.isBoss && e.phase >= 2)) && e.attackCd <= 0 && closestDist < 200) {
                e.attackCd = e.isBoss ? 0.5 : 2;
                // Fire arcon-like projectile
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
                    if (p.dashing || p.hp <= 0) continue;
                    const dx = fx.x - p.x, dy = fx.y - p.y;
                    if (Math.sqrt(dx * dx + dy * dy) < fx.size + p.hitRadius) {
                        p.hp -= fx.dmg;
                        p.hitFlash = 0.2;
                        effects.splice(i, 1);
                        break;
                    }
                }
            } else if (fx.type === 'shake') {
                fx.duration -= dt;
                if (fx.duration <= 0) effects.splice(i, 1);
            }
        }

        // Remove dead
        enemies = enemies.filter(e => e.alive);
    }

    function updateBoss(e, target, dt, dungeon) {
        const dx = target.x - e.x, dy = target.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // Phase transitions
        const hpPct = e.hp / e.maxHp;
        if (e.phaseMax >= 3 && hpPct < 0.33) e.phase = 3;
        else if (e.phaseMax >= 2 && hpPct < 0.66) e.phase = 2;

        e.aiTimer -= dt;

        // Boss behavior per phase
        if (e.phase === 1) {
            // Slow chase
            moveEnemy(e, dx / dist, dy / dist, dt, dungeon);
        } else if (e.phase === 2) {
            // Faster + ranged attacks
            moveEnemy(e, dx / dist * 1.5, dy / dist * 1.5, dt, dungeon);
            if (e.aiTimer <= 0) {
                e.aiTimer = 1.5;
                // Burst attack
                for (let a = 0; a < 8; a++) {
                    const angle = (a / 8) * Math.PI * 2;
                    effects.push({
                        type: 'projectile',
                        x: e.x, y: e.y,
                        vx: Math.cos(angle) * 120, vy: Math.sin(angle) * 120,
                        dmg: Math.ceil(e.dmg * 0.3), life: 2.5,
                        color: e.color, size: 5, owner: 'enemy',
                    });
                }
            }
        } else if (e.phase === 3) {
            // Enraged — fast, constant attacks
            moveEnemy(e, dx / dist * 2, dy / dist * 2, dt, dungeon);
            if (e.aiTimer <= 0) {
                e.aiTimer = 0.8;
                for (let a = 0; a < 12; a++) {
                    const angle = (a / 12) * Math.PI * 2 + performance.now() * 0.001;
                    effects.push({
                        type: 'projectile',
                        x: e.x, y: e.y,
                        vx: Math.cos(angle) * 150, vy: Math.sin(angle) * 150,
                        dmg: Math.ceil(e.dmg * 0.4), life: 2,
                        color: e.color, size: 4, owner: 'enemy',
                    });
                }
                // Screen shake
                effects.push({ type: 'shake', duration: 0.3, intensity: 6 });
            }
        }
    }

    function moveEnemy(e, dirX, dirY, dt, dungeon) {
        const nx = e.x + dirX * e.speed * dt;
        const ny = e.y + dirY * e.speed * dt;
        if (Dungeon.isWalkable(dungeon, nx, ny)) {
            e.x = nx;
            e.y = ny;
        } else if (Dungeon.isWalkable(dungeon, nx, e.y)) {
            e.x = nx;
        } else if (Dungeon.isWalkable(dungeon, e.x, ny)) {
            e.y = ny;
        }
    }

    function damageEnemy(enemy, dmg) {
        enemy.hp -= dmg;
        enemy.hitFlash = 0.15;
        enemy.aggro = true;
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
        for (const e of enemies) {
            if (!e.alive) continue;
            const sx = e.x - cameraX, sy = e.y - cameraY;

            // Skip if off screen
            if (sx < -50 || sx > 1010 || sy < -50 || sy > 590) continue;

            const flash = e.hitFlash > 0;
            const s = e.size;

            // Shadow
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#000';
            ctx.fillRect(sx - s/2, sy + s/2, s, 3);
            ctx.globalAlpha = 1;

            // Body
            ctx.fillStyle = flash ? '#fff' : e.color;
            if (e.isBoss) {
                // Boss has fancier rendering
                ctx.fillRect(sx - s/2, sy - s/2, s, s);
                // Crown/horns
                ctx.fillRect(sx - s/2 - 2, sy - s/2 - 4, 4, 4);
                ctx.fillRect(sx + s/2 - 2, sy - s/2 - 4, 4, 4);
                // Eyes
                ctx.fillStyle = flash ? '#fff' : '#ff0000';
                ctx.fillRect(sx - 4, sy - 3, 3, 3);
                ctx.fillRect(sx + 2, sy - 3, 3, 3);
                // Boss aura
                ctx.globalAlpha = 0.1 + Math.sin(performance.now() / 200) * 0.05;
                ctx.fillStyle = e.color;
                ctx.fillRect(sx - s, sy - s, s * 2, s * 2);
                ctx.globalAlpha = 1;
            } else {
                // Regular enemy
                ctx.fillRect(sx - s/2, sy - s/2, s, s);
                // Eyes
                ctx.fillStyle = '#fff';
                ctx.fillRect(sx - 3, sy - 2, 2, 2);
                ctx.fillRect(sx + 1, sy - 2, 2, 2);
            }

            // HP bar (only if damaged)
            if (e.hp < e.maxHp) {
                const barW = Math.max(s, 20);
                const hpPct = e.hp / e.maxHp;
                ctx.fillStyle = '#333';
                ctx.fillRect(sx - barW/2, sy - s/2 - 6, barW, 3);
                ctx.fillStyle = hpPct > 0.5 ? '#44cc44' : hpPct > 0.25 ? '#cccc44' : '#cc4444';
                ctx.fillRect(sx - barW/2, sy - s/2 - 6, barW * hpPct, 3);
            }
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
    }

    function getShake() {
        for (const fx of effects) {
            if (fx.type === 'shake' && fx.duration > 0) {
                return fx.intensity * (fx.duration / 0.3);
            }
        }
        return 0;
    }

    return {
        TYPES, BOSSES, reset, spawnFromDungeon, update, render,
        damageEnemy, getShake,
        getEnemies: () => enemies,
        getEffects: () => effects,
    };
})();
