// ─────────────────────────────────────────────
//  BATTLE ARENA — PvP with Dash + Instant Mana Return
// ─────────────────────────────────────────────

const Battle = (() => {
    const MANA_MAX = 100;
    const MANA_REGEN = 3;
    const MANA_REGEN_BURNOUT = 0.5;
    const HP_MAX = 100;
    const BURNOUT_THRESHOLD = 0.7;
    const BACKLASH_DAMAGE = 10;
    const DASH_SPEED = 700;
    const DASH_DURATION = 0.15;
    const DASH_COOLDOWN = 0.5;
    const DASH_CHAIN_WINDOW = 0.15;
    const DASH_INVULN = 0.25;
    const SYNC_RATE = 1 / 20; // 20 Hz

    // Melee constants
    const MELEE_RANGE = 50;
    const MELEE_ARC = Math.PI * 0.6;
    const MELEE_COOLDOWN = 0.35;
    const MELEE_DURATION = 0.15;
    const MELEE_DAMAGE = 12;

    let player;
    let enemies = {}; // Map of peerId -> enemy object (supports 2+ players)
    let playerSpells = [];
    let playerCasts = [];
    let enemyCasts = [];
    let keys = {};
    let mouse = { x: 480, y: 270 };
    let gameOver = false;
    let winner = '';
    let syncTimer = 0;
    let arenaParticles = [];
    let meleeTimer = 0;
    let meleeCooldown = 0;
    let meleeAngle = 0;
    let meleeHit = false;
    let enemyMelees = []; // visual only
    const ENEMY_COLORS = ['#ff4444','#44ff88','#ff88ff','#ffaa22','#22ddff','#cccc44','#ff6688'];

    // Helper: get all enemy objects as array
    function getEnemies() { return Object.values(enemies); }
    // Helper: nearest enemy to player
    function nearestEnemy() {
        let best = null, bestDist = Infinity;
        for (const e of getEnemies()) {
            const dx = e.x - player.x, dy = e.y - player.y;
            const d = dx*dx + dy*dy;
            if (d < bestDist) { bestDist = d; best = e; }
        }
        return best;
    }

    function makeEnemy(peerId, x, y, colorIdx) {
        return {
            id: peerId, x: x, y: y,
            hp: HP_MAX, mana: MANA_MAX, hitRadius: 12,
            hitFlash: 0, burnout: 0, speed: 150,
            dashing: false, dashTimer: 0, dashCooldown: 0, dashDirX: 0, dashDirY: 0,
            dashChainCount: 0, dashChainWindow: 0, invulnTimer: 0,
            color: ENEMY_COLORS[colorIdx % ENEMY_COLORS.length],
            colorLight: ENEMY_COLORS[colorIdx % ENEMY_COLORS.length] + '88',
            alive: true,
        };
    }

    function init(compiledSpells) {
        ArconSystem.setBoundsMode('arena');
        player = {
            id: 'player', x: 200, y: 270,
            hp: HP_MAX, mana: MANA_MAX, hitRadius: 12,
            hitFlash: 0, burnout: 0, speed: 150,
            dashing: false, dashTimer: 0, dashCooldown: 0, dashDirX: 0, dashDirY: 0,
            dashChainCount: 0, dashChainWindow: 0, invulnTimer: 0,
        };
        enemies = {};

        playerSpells = compiledSpells;
        playerCasts = [];
        enemyCasts = [];
        gameOver = false;
        winner = '';
        keys = {};
        arenaParticles = [];
        syncTimer = 0;
        meleeTimer = 0;
        meleeCooldown = 0;
        meleeHit = false;
        enemyMelees = [];

        ArconSystem.reset();

        // Instant mana return callbacks
        ArconSystem.onManaReturn('player', (count) => { player.mana = Math.min(MANA_MAX, player.mana + count); });

        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('victory-screen').classList.add('hidden');

        const keysDiv = document.getElementById('spellKeys');
        keysDiv.innerHTML = '';
        for (let i = 0; i < playerSpells.length; i++) {
            const el = document.createElement('div');
            el.className = 'spell-key-hud';
            el.id = `spell-hud-${i}`;
            el.innerHTML = `<span class="key-num">${i + 1}</span><span>${playerSpells[i].name.substring(0, 4)}</span>`;
            keysDiv.appendChild(el);
        }
    }

    function update(dt) {
        if (gameOver) return;

        // ── Player movement ──
        let mx = 0, my = 0;
        if (keys['w'] || keys['arrowup']) my -= 1;
        if (keys['s'] || keys['arrowdown']) my += 1;
        if (keys['a'] || keys['arrowleft']) mx -= 1;
        if (keys['d'] || keys['arrowright']) mx += 1;

        // Dash
        if (player.dashing) {
            player.dashTimer -= dt;
            const dashMul = 1 + player.dashChainCount * 0.15;
            player.x += player.dashDirX * DASH_SPEED * dashMul * dt;
            player.y += player.dashDirY * DASH_SPEED * dashMul * dt;
            // Dash trail
            if (Math.random() < 0.8) {
                arenaParticles.push({
                    x: player.x + (Math.random() - .5) * 10, y: player.y + (Math.random() - .5) * 10,
                    vx: -player.dashDirX * 40 + (Math.random() - .5) * 20,
                    vy: -player.dashDirY * 40 + (Math.random() - .5) * 20,
                    life: 0.3, maxLife: 0.3, size: 3, color: '#4488ff',
                });
            }
            if (player.dashTimer <= 0) {
                player.dashing = false;
                player.dashChainWindow = DASH_CHAIN_WINDOW;
                // Dash burst
                for (let p = 0; p < 12; p++) {
                    arenaParticles.push({
                        x: player.x + (Math.random() - .5) * 20, y: player.y + (Math.random() - .5) * 20,
                        vx: (Math.random() - .5) * 80, vy: (Math.random() - .5) * 80,
                        life: 0.4, maxLife: 0.4, size: 2 + Math.random() * 2, color: '#4488ff',
                    });
                }
            }
        } else if (mx !== 0 || my !== 0) {
            const len = Math.sqrt(mx * mx + my * my);
            player.x += (mx / len) * player.speed * dt;
            player.y += (my / len) * player.speed * dt;
        }
        player.x = Math.max(20, Math.min(940, player.x));
        player.y = Math.max(20, Math.min(520, player.y));

        if (player.dashCooldown > 0) player.dashCooldown -= dt;
        if (player.dashChainWindow > 0) player.dashChainWindow -= dt;
        if (player.invulnTimer > 0) player.invulnTimer -= dt;
        for (const e of getEnemies()) { if (e.invulnTimer > 0) e.invulnTimer -= dt; }

        // ── Melee ──
        if (meleeCooldown > 0) meleeCooldown -= dt;
        if (meleeTimer > 0) {
            meleeTimer -= dt;
            if (!meleeHit) {
                for (const e of getEnemies()) {
                    if (!e.alive) continue;
                    const dx = e.x - player.x, dy = e.y - player.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < MELEE_RANGE) {
                        const angle = Math.atan2(dy, dx);
                        let diff = angle - meleeAngle;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        if (Math.abs(diff) < MELEE_ARC / 2 && e.invulnTimer <= 0 && !e.dashing) {
                            meleeHit = true;
                            e.hp -= MELEE_DAMAGE;
                            e.hitFlash = 0.3;
                            if (typeof Audio !== 'undefined') Audio.hit();
                            Network.send({ type: 'state', x: player.x, y: player.y, hp: player.hp, mana: player.mana, dashing: player.dashing });
                            break;
                        }
                    }
                }
            }
        }
        for (let i = enemyMelees.length - 1; i >= 0; i--) {
            enemyMelees[i].timer -= dt;
            if (enemyMelees[i].timer <= 0) enemyMelees.splice(i, 1);
        }

        // ── Mana regen (only for non-locked mana) ──
        const regenRate = player.burnout > 0 ? MANA_REGEN_BURNOUT : MANA_REGEN;
        player.mana = Math.min(MANA_MAX, player.mana + regenRate * dt);

        if (player.burnout > 0) player.burnout -= dt;
        if (player.hitFlash > 0) player.hitFlash -= dt;
        for (const e of getEnemies()) {
            if (e.hitFlash > 0) e.hitFlash -= dt;
            if (e.burnout > 0) e.burnout -= dt;
        }

        // ── Player spell cooldowns ──
        for (const s of playerSpells) { if (s.currentCooldown > 0) s.currentCooldown -= dt; }

        // ── Update casts ──
        for (const c of playerCasts) ArconSystem.updateCast(c, dt);
        for (const c of enemyCasts) ArconSystem.updateCast(c, dt);
        playerCasts = playerCasts.filter(c => c.active);
        enemyCasts = enemyCasts.filter(c => c.active);

        // ── Update arcons ──
        ArconSystem.updateArcons(dt, [player, ...getEnemies()]);

        // ── Ambient particles ──
        if (Math.random() < 0.3) {
            arenaParticles.push({ x:Math.random()*960, y:550, vx:0, vy:-10-Math.random()*20, life:2+Math.random()*3, maxLife:5, size:1+Math.random(), color:'#ffd700' });
        }
        for (let i = arenaParticles.length - 1; i >= 0; i--) {
            const p = arenaParticles[i];
            p.x += (p.vx || 0) * dt; p.y += p.vy * dt; p.life -= dt;
            if (p.life <= 0) arenaParticles.splice(i, 1);
        }

        // ── Network sync ──
        syncTimer -= dt;
        if (syncTimer <= 0 && Network.isConnected()) {
            syncTimer = SYNC_RATE;
            Network.send({
                type: 'state',
                x: player.x, y: player.y,
                hp: player.hp, mana: player.mana,
                dashing: player.dashing,
            });
        }

        // ── HUD ──
        updateHUD();

        // ── Win condition ──
        if (player.hp <= 0 && !gameOver) {
            gameOver = true; winner = 'enemy'; showVictory();
            Network.send({ type: 'gameover', winner: 'player' });
        } else if (!gameOver) {
            const allDead = getEnemies().length > 0 && getEnemies().every(e => e.hp <= 0);
            if (allDead) {
                gameOver = true; winner = 'player'; showVictory();
                Network.send({ type: 'gameover', winner: 'enemy' });
            }
        }
    }

    function castPlayerSpell(index) {
        if (gameOver) return;
        if (index < 0 || index >= playerSpells.length) return;
        const spell = playerSpells[index];
        if (spell.currentCooldown > 0) return;

        if (player.mana < spell.cost) {
            if (player.mana <= 0) { player.hp = Math.max(0, player.hp - BACKLASH_DAMAGE); player.hitFlash = 0.3; }
            return;
        }

        if (spell.cost > player.mana * BURNOUT_THRESHOLD) player.burnout = 3;

        player.mana -= spell.cost;
        spell.currentCooldown = spell.cooldown;

        const target = nearestEnemy() || { x: mouse.x, y: mouse.y, id: 'target' };
        const cast = ArconSystem.castSpell(spell, player, target, mouse.x, mouse.y);
        playerCasts.push(cast);
        if (typeof Audio !== 'undefined') Audio.cast();

        // Send cast to opponent
        Network.send({
            type: 'cast',
            spellIndex: index,
            casterX: player.x, casterY: player.y,
            cursorX: mouse.x, cursorY: mouse.y,
            cost: spell.cost,
        });
    }

    function doDash() {
        if (player.dashing) return;

        const isChain = player.dashChainWindow > 0 && player.dashChainCount > 0;
        if (!isChain && player.dashCooldown > 0) return;

        let dx = 0, dy = 0;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;
        if (dx === 0 && dy === 0) {
            // Dash toward cursor
            dx = mouse.x - player.x; dy = mouse.y - player.y;
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
            player.dashCooldown = Math.max(0.15, DASH_COOLDOWN - player.dashChainCount * 0.1);
        } else {
            player.dashChainCount = 1;
            player.dashCooldown = DASH_COOLDOWN;
        }

        if (typeof Audio !== 'undefined') Audio.dash();

        Network.send({ type: 'dash', dirX: player.dashDirX, dirY: player.dashDirY, chain: player.dashChainCount });
    }

    // Handle messages from opponents
    function handleNetMessage(data, fromPeerId) {
        if (!data || !data.type) return;
        const pid = fromPeerId || 'enemy';

        // Auto-create enemy on first message
        if (!enemies[pid] && data.type === 'state') {
            const idx = Object.keys(enemies).length;
            const spawnX = 300 + idx * 200;
            enemies[pid] = makeEnemy(pid, data.x || spawnX, data.y || 270, idx);
            ArconSystem.onManaReturn(pid, (count) => {
                if (enemies[pid]) enemies[pid].mana = Math.min(MANA_MAX, enemies[pid].mana + count);
            });
        }

        const enemy = enemies[pid];

        switch (data.type) {
            case 'state':
                if (enemy) {
                    enemy.x = data.x; enemy.y = data.y;
                    enemy.hp = data.hp; enemy.mana = data.mana;
                    enemy.dashing = data.dashing;
                }
                break;

            case 'cast':
                try {
                    const aim = Math.atan2(data.cursorY - data.casterY, data.cursorX - data.casterX);
                    const cx = data.casterX, cy = data.casterY;
                    const enemySpell = {
                        cost: data.cost,
                        xFn: (v) => cx + Math.cos(aim) * 300 * (v.t - v.i * 0.02),
                        yFn: (v) => cy + Math.sin(aim) * 300 * (v.t - v.i * 0.02),
                        emitDelayFn: (v) => v.i * 0.02,
                        widthFn: (v) => 4,
                    };
                    const cast = ArconSystem.castSpell(enemySpell,
                        { id: pid, x: data.casterX, y: data.casterY },
                        player, data.cursorX, data.cursorY
                    );
                    enemyCasts.push(cast);
                } catch(e) {}
                break;

            case 'castfull':
                try {
                    const s = {
                        cost: data.cost,
                        xFn: Parser.compile(data.xExpr),
                        yFn: Parser.compile(data.yExpr),
                        emitDelayFn: Parser.compile(data.emitExpr),
                        widthFn: Parser.compile(data.widthExpr),
                    };
                    const cast = ArconSystem.castSpell(s,
                        { id: pid, x: data.casterX, y: data.casterY },
                        player, data.cursorX, data.cursorY
                    );
                    enemyCasts.push(cast);
                } catch(e) {}
                break;

            case 'dash':
                if (enemy) {
                    enemy.dashing = true;
                    enemy.dashDirX = data.dirX;
                    enemy.dashDirY = data.dirY;
                    enemy.dashTimer = DASH_DURATION;
                    const dashEnemy = enemy;
                    setTimeout(() => { dashEnemy.dashing = false; }, DASH_DURATION * 1000);
                }
                break;

            case 'melee':
                // Show enemy melee visual
                enemyMelees.push({ x: data.x, y: data.y, angle: data.angle, timer: MELEE_DURATION, peerId: pid });
                // Damage check — if we're in their cone
                if (!player.dashing && player.invulnTimer <= 0) {
                    const dx = player.x - data.x, dy = player.y - data.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < MELEE_RANGE) {
                        const angle = Math.atan2(dy, dx);
                        let diff = angle - data.angle;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        if (Math.abs(diff) < MELEE_ARC / 2) {
                            player.hp -= MELEE_DAMAGE;
                            player.hitFlash = 0.3;
                            if (typeof Audio !== 'undefined') Audio.playerHurt();
                        }
                    }
                }
                break;

            case 'peer-join':
                // New peer joined mid-game
                if (!enemies[data.peerId]) {
                    const idx = Object.keys(enemies).length;
                    enemies[data.peerId] = makeEnemy(data.peerId, 480, 270, idx);
                    ArconSystem.onManaReturn(data.peerId, (count) => {
                        if (enemies[data.peerId]) enemies[data.peerId].mana = Math.min(MANA_MAX, enemies[data.peerId].mana + count);
                    });
                }
                break;

            case 'peer-leave':
                delete enemies[data.peerId];
                break;

            case 'gameover':
                if (!gameOver) { gameOver = true; winner = data.winner; showVictory(); }
                break;
        }
    }

    // Enhanced cast that sends full expressions
    function castPlayerSpellFull(index) {
        if (gameOver) return;
        if (index < 0 || index >= playerSpells.length) return;
        const spell = playerSpells[index];
        if (spell.currentCooldown > 0) return;
        if (player.mana < spell.cost) {
            if (player.mana <= 0) { player.hp = Math.max(0, player.hp - BACKLASH_DAMAGE); player.hitFlash = 0.3; }
            return;
        }
        if (spell.cost > player.mana * BURNOUT_THRESHOLD) player.burnout = 3;
        player.mana -= spell.cost;
        spell.currentCooldown = spell.cooldown;

        const target = nearestEnemy() || { x: mouse.x, y: mouse.y, id: 'target' };
        const cast = ArconSystem.castSpell(spell, player, target, mouse.x, mouse.y);
        playerCasts.push(cast);
        if (typeof Audio !== 'undefined') Audio.cast();

        // Send full formula if available
        if (spell.xExpr && spell.yExpr) {
            Network.send({
                type: 'castfull',
                cost: spell.cost,
                casterX: player.x, casterY: player.y,
                cursorX: mouse.x, cursorY: mouse.y,
                xExpr: spell.xExpr, yExpr: spell.yExpr,
                emitExpr: spell.emitExpr || 'i*0.02',
                widthExpr: spell.widthExpr || '4',
            });
        } else {
            Network.send({
                type: 'cast',
                spellIndex: index,
                casterX: player.x, casterY: player.y,
                cursorX: mouse.x, cursorY: mouse.y,
                cost: spell.cost,
            });
        }
    }

    function updateHUD() {
        document.getElementById('player-hp').style.width = `${(player.hp/HP_MAX)*100}%`;
        document.getElementById('player-hp-text').textContent = Math.ceil(player.hp);
        document.getElementById('player-mana').style.width = `${(player.mana/MANA_MAX)*100}%`;
        document.getElementById('player-mana-text').textContent = Math.ceil(player.mana);

        const pLocked = ArconSystem.countActive('player') + ArconSystem.countPending(playerCasts, 'player');
        document.getElementById('player-mana-locked').style.width = `${(pLocked/MANA_MAX)*100}%`;

        // Show first enemy stats in the standard enemy bar (or average if multiple)
        const eArr = getEnemies();
        if (eArr.length > 0) {
            const e0 = eArr[0];
            document.getElementById('enemy-hp').style.width = `${(e0.hp/HP_MAX)*100}%`;
            document.getElementById('enemy-hp-text').textContent = eArr.length > 1 ? `${Math.ceil(e0.hp)} (+${eArr.length - 1})` : Math.ceil(e0.hp);
            document.getElementById('enemy-mana').style.width = `${(e0.mana/MANA_MAX)*100}%`;
            const eLocked = ArconSystem.countActive(e0.id) + ArconSystem.countPending(enemyCasts, e0.id);
            document.getElementById('enemy-mana-locked').style.width = `${(eLocked/MANA_MAX)*100}%`;
        }

        for (let i = 0; i < playerSpells.length; i++) {
            const el = document.getElementById(`spell-hud-${i}`);
            if (!el) continue;
            el.className = 'spell-key-hud';
            if (playerSpells[i].currentCooldown > 0) el.classList.add('on-cd');
            else if (player.mana < playerSpells[i].cost) el.classList.add('no-mana');
        }

        const dashEl = document.getElementById('dash-cd');
        if (player.dashCooldown > 0 && !player.dashing) {
            dashEl.textContent = `DASH ${player.dashCooldown.toFixed(1)}s`;
            dashEl.className = 'dash-cd';
        } else {
            const chainText = player.dashChainWindow > 0 ? ` [CHAIN x${player.dashChainCount}]` : '';
            dashEl.textContent = `DASH [SHIFT]${chainText}`;
            dashEl.className = 'dash-cd ready';
        }
    }

    function showVictory() {
        document.getElementById('hud').classList.add('hidden');
        const screen = document.getElementById('victory-screen');
        screen.classList.remove('hidden');
        const h1 = document.getElementById('victory-text');
        const sub = document.getElementById('victory-sub');
        if (winner === 'player') {
            h1.textContent = 'VICTORY'; h1.style.color = '#ffd700'; sub.textContent = 'Your formulas proved superior.';
            if (typeof Audio !== 'undefined') Audio.pvpWin();
        } else {
            h1.textContent = 'DEFEAT'; h1.style.color = '#ff4444'; sub.textContent = 'Your equations were insufficient.';
            if (typeof Audio !== 'undefined') Audio.pvpLose();
        }
    }

    function render(ctx, W, H) {
        ctx.fillStyle = '#0a0806'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#151210'; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        ctx.strokeStyle = '#2a2015'; ctx.lineWidth = 2; ctx.strokeRect(8, 8, W - 16, H - 16);

        for (const p of arenaParticles) {
            ctx.globalAlpha = (p.life / p.maxLife) * 0.15;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        ArconSystem.render(ctx);
        renderMage(ctx, player, '#4488ff', '#88bbff');
        for (const e of getEnemies()) {
            renderMage(ctx, e, e.color || '#ff4444', e.colorLight || '#ff8877');
        }

        if (!gameOver) {
            ctx.globalAlpha = 0.12; ctx.strokeStyle = '#4488ff'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha = 1;
            ctx.strokeStyle = '#4488ff'; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
            ctx.strokeRect(mouse.x - 4, mouse.y - 4, 8, 8);
            ctx.fillStyle = '#4488ff'; ctx.fillRect(mouse.x - 1, mouse.y - 1, 2, 2);
            ctx.globalAlpha = 1;
        }
        if (player.burnout > 0) {
            ctx.globalAlpha = .4 + Math.sin(performance.now() / 100) * .2;
            ctx.fillStyle = '#ff8800'; ctx.font = 'bold 10px "Courier New",monospace'; ctx.textAlign = 'center';
            ctx.fillText('BURNOUT', player.x, player.y - 28); ctx.globalAlpha = 1;
        }

        // Melee arc
        if (meleeTimer > 0) {
            const progress = 1 - meleeTimer / MELEE_DURATION;
            ctx.save();
            ctx.globalAlpha = 0.6 * (1 - progress);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, MELEE_RANGE * (0.3 + progress * 0.7),
                meleeAngle - MELEE_ARC / 2, meleeAngle + MELEE_ARC / 2);
            ctx.stroke();
            ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(player.x, player.y, MELEE_RANGE * 0.6 * (0.3 + progress * 0.7),
                meleeAngle - MELEE_ARC / 2 + progress * 0.3, meleeAngle + MELEE_ARC / 2 - progress * 0.3);
            ctx.stroke();
            ctx.restore();
        }
        // Enemy melee arcs
        for (const em of enemyMelees) {
            const p = 1 - em.timer / MELEE_DURATION;
            ctx.save();
            ctx.globalAlpha = 0.4 * (1 - p);
            ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(em.x, em.y, MELEE_RANGE * (0.3 + p * 0.7),
                em.angle - MELEE_ARC / 2, em.angle + MELEE_ARC / 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    function doMelee(mx, my) {
        if (gameOver || meleeTimer > 0 || meleeCooldown > 0) return;
        meleeAngle = Math.atan2(my - player.y, mx - player.x);
        meleeTimer = MELEE_DURATION;
        meleeCooldown = MELEE_COOLDOWN;
        meleeHit = false;
        if (typeof Audio !== 'undefined') Audio.melee();
        // Slash particles
        for (let i = 0; i < 6; i++) {
            const a = meleeAngle - MELEE_ARC / 2 + (MELEE_ARC / 6) * i;
            arenaParticles.push({
                x: player.x + Math.cos(a) * MELEE_RANGE * 0.3,
                y: player.y + Math.sin(a) * MELEE_RANGE * 0.3,
                vx: Math.cos(a) * 80, vy: Math.sin(a) * 80,
                life: 0.2, maxLife: 0.2, size: 2 + Math.random() * 2, color: '#ffffff',
            });
        }
        Network.send({ type: 'melee', x: player.x, y: player.y, angle: meleeAngle });
    }

    function renderMage(ctx, mage, color, light) {
        const flash = mage.hitFlash > 0;
        const isDashing = mage.dashing;
        const isMoving = mage === player ? (keys['w'] || keys['s'] || keys['a'] || keys['d'] || keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright']) : false;
        const isMeleeing = mage === player ? (meleeTimer > 0) : (enemyMelees.length > 0);
        const isHurt = mage.hitFlash > 0.1;
        const t = performance.now() / 1000;

        // Animation state
        let animState = 'idle';
        if (isDashing) animState = 'dash';
        else if (isHurt) animState = 'hurt';
        else if (isMeleeing) animState = 'melee';
        else if (isMoving) animState = 'walk';

        // Frame timing
        const walkBob = Math.sin(t * 10) * 2;
        const idleBob = Math.sin(t * 2.5) * 1.5;
        const breathe = Math.sin(t * 3) * 0.5;

        // Ghost trail when dashing
        if (isDashing) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = color;
            const stretchX = (mage.dashDirX || 0) * -25;
            const stretchY = (mage.dashDirY || 0) * -25;
            ctx.fillRect(mage.x - 6 + stretchX, mage.y - 14 + stretchY, 12, 24);
            ctx.globalAlpha = 0.05;
            ctx.fillRect(mage.x - 4 + stretchX * 2, mage.y - 10 + stretchY * 2, 8, 18);
            ctx.globalAlpha = 0.15;
            ctx.fillRect(mage.x - 8, mage.y - 16, 16, 28);
        }

        // Shadow
        ctx.globalAlpha = isDashing ? 0.15 : 0.3;
        ctx.fillStyle = '#000';
        const shadowW = isDashing ? 10 : 14;
        ctx.fillRect(mage.x - shadowW/2, mage.y + 8 + (animState === 'walk' ? Math.abs(walkBob) * 0.5 : 0), shadowW, 3);
        ctx.globalAlpha = isDashing ? 0.5 : 1;

        // Calculate offsets based on animation state
        let bodyOffY = 0, headOffY = 0, legLOff = 0, legROff = 0, armAngle = 0, bodyTilt = 0;

        switch (animState) {
            case 'idle':
                bodyOffY = idleBob;
                headOffY = idleBob * 0.7;
                legLOff = 0; legROff = 0;
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
                const prog = mage === player ? (1 - meleeTimer / MELEE_DURATION) : 0.5;
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
        ctx.translate(mage.x, mage.y + bodyOffY);
        if (bodyTilt) ctx.rotate(bodyTilt);

        // Legs (animated separately)
        ctx.fillStyle = flash ? '#fff' : color;
        ctx.fillRect(-5, 4 + legLOff, 4, 6);  // left leg
        ctx.fillRect(1, 4 + legROff, 4, 6);    // right leg

        // Body
        ctx.fillRect(-5, -6 + breathe, 10, 10);

        // Head
        const headY = -14 + headOffY;
        ctx.fillRect(-4, headY, 8, 8);

        // Hat
        if (!flash) ctx.fillStyle = light;
        ctx.fillRect(-6, headY - 2, 12, 2);      // brim
        ctx.fillRect(-3, headY - 6, 6, 4);        // crown
        ctx.fillRect(-1, headY - 8, 2, 2);        // tip

        // Wand arm (rotates based on animation)
        ctx.save();
        ctx.translate(5, -2);
        ctx.rotate(armAngle);
        if (!flash) ctx.fillStyle = '#ffd700';
        ctx.fillRect(0, -2, 2, 12);              // wand shaft
        ctx.globalAlpha = (isDashing ? 0.3 : 0.5) + Math.sin(t * 5) * 0.3;
        ctx.fillStyle = flash ? '#fff' : '#ffd700';
        ctx.fillRect(-1, -4, 4, 4);              // wand orb
        ctx.globalAlpha = isDashing ? 0.5 : 1;
        ctx.restore();

        // Eyes (with blink animation)
        const blinkPhase = t % 4;
        const eyeH = (blinkPhase > 3.85 && blinkPhase < 3.95) ? 1 : 2;  // blink every ~4s
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, headY + 2, 2, eyeH);
        ctx.fillRect(1, headY + 2, 2, eyeH);

        // Eye pupils follow cursor/enemy direction
        if (eyeH > 1) {
            const lookTarget = mage === player ? mouse : (nearestEnemy() || player);
            const lookDx = lookTarget.x - mage.x;
            const lookOff = lookDx > 0 ? 1 : 0;
            ctx.fillStyle = color;
            ctx.fillRect(-2 + lookOff, headY + 2, 1, 1);
            ctx.fillRect(1 + lookOff, headY + 2, 1, 1);
        }

        ctx.restore();

        // Invuln shimmer
        if (mage.invulnTimer > 0) {
            ctx.globalAlpha = 0.15 + Math.sin(t * 50) * 0.1;
            ctx.fillStyle = '#88ccff';
            ctx.fillRect(mage.x - 8, mage.y - 16, 16, 28);
        }

        ctx.globalAlpha = 1;
    }

    function onKeyDown(key) {
        keys[key.toLowerCase()] = true;
        if (key === 'Shift' || key === ' ') doDash();
        const num = parseInt(key);
        if (num >= 1 && num <= 6) castPlayerSpellFull(num - 1);
    }
    function onKeyUp(key) { keys[key.toLowerCase()] = false; }
    function onMouseMove(x, y) { mouse.x = x; mouse.y = y; }
    function onMouseDown(x, y) { mouse.x = x; mouse.y = y; doMelee(x, y); }
    function onMouseUp() {}

    return {
        init, update, render, handleNetMessage,
        onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp,
        isGameOver: () => gameOver,
        setSpellExprs: (spells) => {
            // Attach expression strings so network can send them
            for (const s of spells) {
                // Already set by spellbook via blocks.toExpr
            }
            playerSpells = spells;
        }
    };
})();
