// ─────────────────────────────────────────────
//  CAMPAIGN MODE — Co-op dungeon clearing
//  Uses Dungeon, Enemies, and ArconSystem together
// ─────────────────────────────────────────────

const Campaign = (() => {
    const MANA_MAX = 100;
    const MANA_REGEN = 5;
    const HP_MAX = 150;
    const DASH_SPEED = 700;
    const DASH_DURATION = 0.15;
    const DASH_COOLDOWN = 0.4;
    const DASH_CHAIN_WINDOW = 0.15;
    const DASH_INVULN = 0.25;
    const SYNC_RATE = 1 / 20;

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

    // ── SCREEN EFFECTS ──
    let screenShake = { x: 0, y: 0 };
    let hitFreeze = 0;
    let flashAlpha = 0;
    let vignetteIntensity = 0;

    function init(compiledSpells, floor) {
        currentFloor = floor || 0;
        currentDungeon = Dungeon.generate(currentFloor);
        Dungeon.preRender(currentDungeon);

        player = {
            id: 'player',
            x: currentDungeon.startX * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2,
            y: currentDungeon.startY * Dungeon.TILE_SIZE + Dungeon.TILE_SIZE / 2,
            hp: HP_MAX, maxHp: HP_MAX, mana: MANA_MAX,
            hitRadius: 10, hitFlash: 0, speed: 160,
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
        chestsOpened = 0;
        xpGained = 0;
        keys = {};
        particles = [];
        syncTimer = 0;
        screenShake = { x: 0, y: 0 };
        hitFreeze = 0;
        flashAlpha = 0;

        ArconSystem.reset();
        Enemies.reset();
        Enemies.spawnFromDungeon(currentDungeon);

        ArconSystem.onManaReturn('player', (count) => {
            player.mana = Math.min(MANA_MAX, player.mana + count);
        });

        document.getElementById('campaign-hud').classList.remove('hidden');
        document.getElementById('victory-screen').classList.add('hidden');
    }

    function update(dt) {
        if (gameOver || paused) return;

        // Hit freeze
        if (hitFreeze > 0) {
            hitFreeze -= dt;
            return;
        }

        // ── Player movement ──
        let mx = 0, my = 0;
        if (keys['w'] || keys['arrowup']) my -= 1;
        if (keys['s'] || keys['arrowdown']) my += 1;
        if (keys['a'] || keys['arrowleft']) mx -= 1;
        if (keys['d'] || keys['arrowright']) mx += 1;

        // Chain dash window
        if (player.dashChainWindow > 0) player.dashChainWindow -= dt;

        // Invulnerability
        if (player.invulnTimer > 0) player.invulnTimer -= dt;

        // Dash movement
        if (player.dashing) {
            player.dashTimer -= dt;
            const dashMul = 1 + player.dashChainCount * 0.15; // Chain dashes get faster
            const nx = player.x + player.dashDirX * DASH_SPEED * dashMul * dt;
            const ny = player.y + player.dashDirY * DASH_SPEED * dashMul * dt;

            if (Dungeon.isWalkable(currentDungeon, nx, ny)) {
                player.x = nx;
                player.y = ny;
            } else if (Dungeon.isWalkable(currentDungeon, nx, player.y)) {
                player.x = nx;
            } else if (Dungeon.isWalkable(currentDungeon, player.x, ny)) {
                player.y = ny;
            }

            // Dash trail
            if (Math.random() < 0.8) {
                particles.push({
                    x: player.x + (Math.random() - 0.5) * 10,
                    y: player.y + (Math.random() - 0.5) * 10,
                    vx: -player.dashDirX * 40 + (Math.random() - 0.5) * 20,
                    vy: -player.dashDirY * 40 + (Math.random() - 0.5) * 20,
                    life: 0.3, maxLife: 0.3, size: 3,
                    color: '#4488ff', type: 'dash',
                });
            }

            if (player.dashTimer <= 0) {
                player.dashing = false;
                player.dashChainWindow = DASH_CHAIN_WINDOW;
                // End-dash burst
                for (let p = 0; p < 12; p++) {
                    particles.push({
                        x: player.x + (Math.random() - 0.5) * 20,
                        y: player.y + (Math.random() - 0.5) * 20,
                        vx: (Math.random() - 0.5) * 80,
                        vy: (Math.random() - 0.5) * 80,
                        life: 0.4, maxLife: 0.4, size: 2 + Math.random() * 2,
                        color: '#4488ff', type: 'dash',
                    });
                }
            }
        } else if (mx !== 0 || my !== 0) {
            const len = Math.sqrt(mx * mx + my * my);
            const nx = player.x + (mx / len) * player.speed * dt;
            const ny = player.y + (my / len) * player.speed * dt;

            if (Dungeon.isWalkable(currentDungeon, nx, ny)) {
                player.x = nx;
                player.y = ny;
            } else if (Dungeon.isWalkable(currentDungeon, nx, player.y)) {
                player.x = nx;
            } else if (Dungeon.isWalkable(currentDungeon, player.x, ny)) {
                player.y = ny;
            }
        }

        if (player.dashCooldown > 0) player.dashCooldown -= dt;

        // ── Mana regen ──
        player.mana = Math.min(MANA_MAX, player.mana + MANA_REGEN * dt);
        if (player.hitFlash > 0) player.hitFlash -= dt;

        // ── Spell cooldowns ──
        for (const s of playerSpells) { if (s.currentCooldown > 0) s.currentCooldown -= dt; }

        // ── Update casts ──
        for (const c of playerCasts) ArconSystem.updateCast(c, dt);
        playerCasts = playerCasts.filter(c => c.active);

        // ── Update arcons vs enemies ──
        updateArconsVsEnemies(dt);

        // ── Update enemies ──
        const playersArr = [player, ...allies];
        Enemies.update(dt, playersArr, currentDungeon);

        // ── Camera ──
        Dungeon.updateCamera(
            player.x / Dungeon.TILE_SIZE,
            player.y / Dungeon.TILE_SIZE,
            960, 540, currentDungeon
        );

        // ── Tile interactions ──
        const ptx = Math.floor(player.x / Dungeon.TILE_SIZE);
        const pty = Math.floor(player.y / Dungeon.TILE_SIZE);
        const tile = Dungeon.tileAt(currentDungeon, ptx, pty);

        if (tile === Dungeon.TILE.CHEST) {
            currentDungeon.map[pty][ptx] = Dungeon.TILE.FLOOR;
            chestsOpened++;
            player.hp = Math.min(player.maxHp, player.hp + 30);
            player.mana = MANA_MAX;
            flashAlpha = 0.3;
            Dungeon.preRender(currentDungeon);
        }
        if (tile === Dungeon.TILE.TRAP) {
            currentDungeon.map[pty][ptx] = Dungeon.TILE.FLOOR;
            if (player.invulnTimer <= 0 && !player.dashing) {
                player.hp -= 15;
                player.hitFlash = 0.3;
                screenShake = { x: 3, y: 3 };
            }
            Dungeon.preRender(currentDungeon);
        }
        if (tile === Dungeon.TILE.STAIRS_DOWN && floorCleared) {
            // Advance floor
            init(playerSpells, currentFloor + 1);
            return;
        }

        // ── Check boss defeated ──
        const bossAlive = Enemies.getEnemies().some(e => e.isBoss);
        if (!bossAlive && Enemies.getEnemies().length === 0 && !floorCleared) {
            floorCleared = true;
            flashAlpha = 0.5;
        }

        // ── Particles ──
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Ambient themed particles
        const theme = currentDungeon.theme;
        if (Math.random() < 0.15) {
            const cam = Dungeon.getCamera();
            particles.push({
                x: cam.x + Math.random() * 960,
                y: cam.y + Math.random() * 540,
                vx: (Math.random() - 0.5) * 10,
                vy: -5 - Math.random() * 10,
                life: 3, maxLife: 3, size: 1 + Math.random(),
                color: theme.accent, type: 'ambient',
            });
        }

        // ── Screen effects ──
        if (flashAlpha > 0) flashAlpha -= dt * 2;
        const shake = Enemies.getShake();
        if (shake > 0) {
            screenShake.x = (Math.random() - 0.5) * shake * 2;
            screenShake.y = (Math.random() - 0.5) * shake * 2;
        } else {
            screenShake.x *= 0.85;
            screenShake.y *= 0.85;
        }

        // Vignette when low HP
        vignetteIntensity = Math.max(0, 1 - player.hp / player.maxHp) * 0.4;

        // ── Death ──
        if (player.hp <= 0 && !gameOver) {
            gameOver = true;
            showCampaignEnd(false);
        }

        // ── Network sync ──
        syncTimer -= dt;
        if (syncTimer <= 0 && Network.isConnected()) {
            syncTimer = SYNC_RATE;
            Network.send({
                type: 'campaign-state',
                x: player.x, y: player.y,
                hp: player.hp, mana: player.mana,
                dashing: player.dashing,
            });
        }
    }

    function updateArconsVsEnemies(dt) {
        const arcons = ArconSystem.getArcons();
        const enemies = Enemies.getEnemies();

        for (let i = arcons.length - 1; i >= 0; i--) {
            const a = arcons[i];
            if (!a.alive || a.ownerId === 'enemy') continue;

            for (const e of enemies) {
                if (!e.alive) continue;
                const dx = a.x - e.x, dy = a.y - e.y;
                const hitDist = a.width / 2 + e.size / 2;
                if (dx * dx + dy * dy < hitDist * hitDist) {
                    a.alive = false;
                    const xp = Enemies.damageEnemy(e, 1);
                    if (xp > 0) xpGained += xp;
                    break;
                }
            }
        }

        // Also check enemy projectiles vs arcons (annihilation)
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

    function castSpell(index) {
        if (gameOver) return;
        if (index < 0 || index >= playerSpells.length) return;
        const spell = playerSpells[index];
        if (spell.currentCooldown > 0) return;
        if (player.mana < spell.cost) return;

        player.mana -= spell.cost;
        spell.currentCooldown = spell.cooldown;

        // Create a dummy target (enemy closest to cursor)
        const cam = Dungeon.getCamera();
        const worldX = mouse.x + cam.x;
        const worldY = mouse.y + cam.y;

        let closestEnemy = { x: worldX, y: worldY, id: 'target' };
        let closestDist = Infinity;
        for (const e of Enemies.getEnemies()) {
            const d = Math.sqrt((e.x - worldX) ** 2 + (e.y - worldY) ** 2);
            if (d < closestDist) { closestDist = d; closestEnemy = e; }
        }

        const cast = ArconSystem.castSpell(spell, player,
            { id: 'target', x: closestEnemy.x, y: closestEnemy.y },
            worldX, worldY
        );
        playerCasts.push(cast);

        // Network sync
        if (Network.isConnected()) {
            Network.send({
                type: 'campaign-cast',
                spellIndex: index,
                casterX: player.x, casterY: player.y,
                cursorX: worldX, cursorY: worldY,
                cost: spell.cost,
            });
        }
    }

    function doDash() {
        // Chain dash check
        if (player.dashing) return;

        const isChain = player.dashChainWindow > 0 && player.dashChainCount > 0;

        if (!isChain && player.dashCooldown > 0) return;

        let dx = 0, dy = 0;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;

        if (dx === 0 && dy === 0) {
            const cam = Dungeon.getCamera();
            dx = (mouse.x + cam.x) - player.x;
            dy = (mouse.y + cam.y) - player.y;
        }

        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        player.dashDirX = dx / len;
        player.dashDirY = dy / len;
        player.dashing = true;
        player.dashTimer = DASH_DURATION;
        player.invulnTimer = DASH_INVULN;

        if (isChain) {
            player.dashChainCount++;
            player.dashCooldown = Math.max(0.1, DASH_COOLDOWN - player.dashChainCount * 0.1);
        } else {
            player.dashChainCount = 1;
            player.dashCooldown = DASH_COOLDOWN;
        }

        // Dash sound effect (visual)
        flashAlpha = 0.05;

        Network.send && Network.isConnected() && Network.send({
            type: 'campaign-dash',
            dirX: player.dashDirX, dirY: player.dashDirY,
            chain: player.dashChainCount,
        });
    }

    function handleNetMessage(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'campaign-state': {
                // Update ally position
                let ally = allies.find(a => a.id === 'ally');
                if (!ally) {
                    ally = {
                        id: 'ally', hp: HP_MAX, maxHp: HP_MAX,
                        mana: MANA_MAX, hitRadius: 10,
                        x: data.x, y: data.y,
                        hitFlash: 0, dashing: data.dashing,
                    };
                    allies.push(ally);
                    ArconSystem.onManaReturn('ally', (count) => {
                        ally.mana = Math.min(MANA_MAX, ally.mana + count);
                    });
                }
                ally.x = data.x; ally.y = data.y;
                ally.hp = data.hp; ally.mana = data.mana;
                ally.dashing = data.dashing;
                break;
            }
            case 'campaign-cast': {
                try {
                    const aim = Math.atan2(data.cursorY - data.casterY, data.cursorX - data.casterX);
                    const s = {
                        cost: data.cost,
                        xFn: (v) => data.casterX + Math.cos(aim) * 300 * (v.t - v.i * 0.02),
                        yFn: (v) => data.casterY + Math.sin(aim) * 300 * (v.t - v.i * 0.02),
                        emitDelayFn: (v) => v.i * 0.02,
                        widthFn: () => 4,
                    };
                    const cast = ArconSystem.castSpell(s,
                        { id: 'ally', x: data.casterX, y: data.casterY },
                        { id: 'target', x: data.cursorX, y: data.cursorY },
                        data.cursorX, data.cursorY
                    );
                    allyCasts.push(cast);
                } catch(e) {}
                break;
            }
            case 'campaign-dash': {
                let ally = allies.find(a => a.id === 'ally');
                if (ally) {
                    ally.dashing = true;
                    setTimeout(() => { if (ally) ally.dashing = false; }, DASH_DURATION * 1000);
                }
                break;
            }
            case 'campaign-enemy-hit': {
                const enemies = Enemies.getEnemies();
                const e = enemies.find(en => en.name === data.enemyName);
                if (e) Enemies.damageEnemy(e, data.dmg);
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
            sub.textContent = `XP: ${xpGained} | Chests: ${chestsOpened}`;
        } else {
            h1.textContent = 'FALLEN';
            h1.style.color = '#ff4444';
            sub.textContent = `Floor ${currentFloor + 1} - ${currentDungeon.theme.name}`;
        }
    }

    function render(ctx, W, H) {
        const cam = Dungeon.getCamera();

        // Apply screen shake
        ctx.save();
        ctx.translate(screenShake.x, screenShake.y);

        // Render dungeon
        Dungeon.render(ctx, W, H);

        // Render enemies
        Enemies.render(ctx, cam.x, cam.y);

        // Render arcons (offset by camera)
        ctx.save();
        ctx.translate(-cam.x, -cam.y);
        ArconSystem.render(ctx);
        ctx.restore();

        // Render particles
        for (const p of particles) {
            const sx = p.x - cam.x, sy = p.y - cam.y;
            if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
            ctx.globalAlpha = (p.life / p.maxLife) * 0.6;
            ctx.fillStyle = p.color;
            ctx.fillRect(sx - p.size/2, sy - p.size/2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        // Render allies
        for (const ally of allies) {
            renderCampaignMage(ctx, ally, cam, '#44cc66', '#88ff88');
        }

        // Render player
        renderCampaignMage(ctx, player, cam, '#4488ff', '#88bbff');

        // Aim line
        if (!gameOver) {
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = '#4488ff';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            const px = player.x - cam.x, py = player.y - cam.y;
            ctx.moveTo(px, py);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;

            // Crosshair
            ctx.strokeStyle = '#4488ff';
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 1;
            ctx.strokeRect(mouse.x - 4, mouse.y - 4, 8, 8);
            ctx.fillStyle = '#4488ff';
            ctx.fillRect(mouse.x - 1, mouse.y - 1, 2, 2);
            ctx.globalAlpha = 1;
        }

        ctx.restore(); // screen shake

        // ── POST-PROCESSING ──

        // Screen flash
        if (flashAlpha > 0) {
            ctx.globalAlpha = flashAlpha;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }

        // Vignette
        if (vignetteIntensity > 0.05) {
            const grad = ctx.createRadialGradient(W/2, H/2, W * 0.3, W/2, H/2, W * 0.7);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(80,0,0,${vignetteIntensity})`);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
        }

        // Floor info
        const theme = currentDungeon.theme;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = theme.accent;
        ctx.font = '10px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`FLOOR ${currentFloor + 1} — ${theme.name.toUpperCase()}`, W - 10, H - 8);
        ctx.globalAlpha = 1;

        // Floor cleared message
        if (floorCleared) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 16px "Courier New", monospace';
            ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 300) * 0.3;
            ctx.fillText('FLOOR CLEARED — Find the stairs!', W/2, 30);
            ctx.globalAlpha = 1;
        }

        // HUD
        updateCampaignHUD();
    }

    function renderCampaignMage(ctx, mage, cam, color, light) {
        const sx = mage.x - cam.x, sy = mage.y - cam.y;
        if (sx < -30 || sx > 990 || sy < -30 || sy > 570) return;

        const flash = mage.hitFlash > 0;
        const isDashing = mage.dashing;

        // Ghost trail when dashing
        if (isDashing) {
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = color;
            ctx.fillRect(sx - 8, sy - 16, 16, 28);
            // Motion blur stretch
            ctx.globalAlpha = 0.06;
            const stretchX = (mage.dashDirX || 0) * -20;
            const stretchY = (mage.dashDirY || 0) * -20;
            ctx.fillRect(sx - 6 + stretchX, sy - 12 + stretchY, 12, 24);
            ctx.fillRect(sx - 4 + stretchX * 2, sy - 8 + stretchY * 2, 8, 16);
        }

        ctx.globalAlpha = isDashing ? 0.5 : 1;

        // Shadow
        ctx.globalAlpha *= 0.3;
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - 7, sy + 9, 14, 3);
        ctx.globalAlpha = isDashing ? 0.5 : 1;

        // Body
        ctx.fillStyle = flash ? '#fff' : color;
        ctx.fillRect(sx - 4, sy - 14, 8, 8); // head
        ctx.fillRect(sx - 5, sy - 6, 10, 10); // body
        ctx.fillRect(sx - 5, sy + 4, 4, 6); // legs
        ctx.fillRect(sx + 1, sy + 4, 4, 6);

        // Hat
        if (!flash) ctx.fillStyle = light;
        ctx.fillRect(sx - 6, sy - 16, 12, 2);
        ctx.fillRect(sx - 3, sy - 20, 6, 4);
        ctx.fillRect(sx - 1, sy - 22, 2, 2);

        // Wand
        if (!flash) ctx.fillStyle = '#ffd700';
        ctx.fillRect(sx + 5, sy - 4, 2, 12);
        ctx.globalAlpha = (isDashing ? 0.3 : 0.5) + Math.sin(performance.now() / 200) * 0.3;
        ctx.fillStyle = flash ? '#fff' : '#ffd700';
        ctx.fillRect(sx + 4, sy - 6, 4, 4);
        ctx.globalAlpha = 1;

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx - 2, sy - 12, 2, 2);
        ctx.fillRect(sx + 1, sy - 12, 2, 2);

        // Invuln shimmer
        if (mage.invulnTimer > 0) {
            ctx.globalAlpha = 0.15 + Math.sin(performance.now() / 50) * 0.1;
            ctx.fillStyle = '#88ccff';
            ctx.fillRect(sx - 8, sy - 16, 16, 28);
            ctx.globalAlpha = 1;
        }

        ctx.globalAlpha = 1;
    }

    function updateCampaignHUD() {
        const hpEl = document.getElementById('camp-hp');
        const hpText = document.getElementById('camp-hp-text');
        const manaEl = document.getElementById('camp-mana');
        const manaText = document.getElementById('camp-mana-text');
        const dashEl = document.getElementById('camp-dash');

        if (hpEl) hpEl.style.width = `${(player.hp / player.maxHp) * 100}%`;
        if (hpText) hpText.textContent = Math.ceil(player.hp);
        if (manaEl) manaEl.style.width = `${(player.mana / MANA_MAX) * 100}%`;
        if (manaText) manaText.textContent = Math.ceil(player.mana);

        if (dashEl) {
            if (player.dashCooldown > 0) {
                dashEl.textContent = `DASH ${player.dashCooldown.toFixed(1)}s`;
                dashEl.className = 'dash-cd';
            } else {
                const chainText = player.dashChainWindow > 0 ? ` [CHAIN x${player.dashChainCount}]` : '';
                dashEl.textContent = `DASH [SHIFT]${chainText}`;
                dashEl.className = 'dash-cd ready';
            }
        }

        // Spell HUD
        const keysDiv = document.getElementById('camp-spellKeys');
        if (keysDiv && keysDiv.children.length === 0) {
            for (let i = 0; i < playerSpells.length; i++) {
                const el = document.createElement('div');
                el.className = 'spell-key-hud';
                el.id = `camp-spell-hud-${i}`;
                el.innerHTML = `<span class="key-num">${i + 1}</span><span>${playerSpells[i].name.substring(0, 4)}</span>`;
                keysDiv.appendChild(el);
            }
        }
        for (let i = 0; i < playerSpells.length; i++) {
            const el = document.getElementById(`camp-spell-hud-${i}`);
            if (!el) continue;
            el.className = 'spell-key-hud';
            if (playerSpells[i].currentCooldown > 0) el.classList.add('on-cd');
            else if (player.mana < playerSpells[i].cost) el.classList.add('no-mana');
        }

        // Enemy count
        const countEl = document.getElementById('camp-enemies');
        if (countEl) {
            const remaining = Enemies.getEnemies().length;
            countEl.textContent = remaining > 0 ? `ENEMIES: ${remaining}` : 'CLEAR';
            countEl.style.color = remaining > 0 ? '#ff6644' : '#44cc66';
        }
    }

    function onKeyDown(key) {
        keys[key.toLowerCase()] = true;
        if (key === 'Shift' || key === ' ') doDash();
        const num = parseInt(key);
        if (num >= 1 && num <= 6) castSpell(num - 1);
    }
    function onKeyUp(key) { keys[key.toLowerCase()] = false; }
    function onMouseMove(x, y) { mouse.x = x; mouse.y = y; }
    function onMouseDown(x, y) { mouse.x = x; mouse.y = y; }
    function onMouseUp() {}

    return {
        init, update, render, handleNetMessage,
        onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp,
        isGameOver: () => gameOver,
        getFloor: () => currentFloor,
    };
})();
