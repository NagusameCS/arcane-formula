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

    let player, enemy;
    let playerSpells = [];
    let playerCasts = [];
    let enemyCasts = [];
    let keys = {};
    let mouse = { x: 480, y: 270 };
    let gameOver = false;
    let winner = '';
    let syncTimer = 0;
    let arenaParticles = [];

    function init(compiledSpells) {
        ArconSystem.setBoundsMode('arena');
        const isHost = Network.isHost();
        player = {
            id: 'player', x: isHost ? 200 : 760, y: 270,
            hp: HP_MAX, mana: MANA_MAX, hitRadius: 12,
            hitFlash: 0, burnout: 0, speed: 150,
            dashing: false, dashTimer: 0, dashCooldown: 0, dashDirX: 0, dashDirY: 0,
            dashChainCount: 0, dashChainWindow: 0, invulnTimer: 0,
        };
        enemy = {
            id: 'enemy', x: isHost ? 760 : 200, y: 270,
            hp: HP_MAX, mana: MANA_MAX, hitRadius: 12,
            hitFlash: 0, burnout: 0, speed: 150,
            dashing: false, dashTimer: 0, dashCooldown: 0, dashDirX: 0, dashDirY: 0,
            dashChainCount: 0, dashChainWindow: 0, invulnTimer: 0,
        };

        playerSpells = compiledSpells;
        playerCasts = [];
        enemyCasts = [];
        gameOver = false;
        winner = '';
        keys = {};
        arenaParticles = [];
        syncTimer = 0;

        ArconSystem.reset();

        // Instant mana return callbacks
        ArconSystem.onManaReturn('player', (count) => { player.mana = Math.min(MANA_MAX, player.mana + count); });
        ArconSystem.onManaReturn('enemy', (count) => { enemy.mana = Math.min(MANA_MAX, enemy.mana + count); });

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
        if (enemy.invulnTimer > 0) enemy.invulnTimer -= dt;

        // ── Mana regen (only for non-locked mana) ──
        const regenRate = player.burnout > 0 ? MANA_REGEN_BURNOUT : MANA_REGEN;
        player.mana = Math.min(MANA_MAX, player.mana + regenRate * dt);

        if (player.burnout > 0) player.burnout -= dt;
        if (player.hitFlash > 0) player.hitFlash -= dt;
        if (enemy.hitFlash > 0) enemy.hitFlash -= dt;
        if (enemy.burnout > 0) enemy.burnout -= dt;

        // ── Player spell cooldowns ──
        for (const s of playerSpells) { if (s.currentCooldown > 0) s.currentCooldown -= dt; }

        // ── Update casts ──
        for (const c of playerCasts) ArconSystem.updateCast(c, dt);
        for (const c of enemyCasts) ArconSystem.updateCast(c, dt);
        playerCasts = playerCasts.filter(c => c.active);
        enemyCasts = enemyCasts.filter(c => c.active);

        // ── Update arcons ──
        ArconSystem.updateArcons(dt, [player, enemy]);

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
        if (player.hp <= 0 && !gameOver) { gameOver = true; winner = 'enemy'; showVictory(); Network.send({ type: 'gameover', winner: 'player' }); }
        else if (enemy.hp <= 0 && !gameOver) { gameOver = true; winner = 'player'; showVictory(); Network.send({ type: 'gameover', winner: 'enemy' }); }
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

        const cast = ArconSystem.castSpell(spell, player, enemy, mouse.x, mouse.y);
        playerCasts.push(cast);

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

        Network.send({ type: 'dash', dirX: player.dashDirX, dirY: player.dashDirY, chain: player.dashChainCount });
    }

    // Handle messages from opponent
    function handleNetMessage(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'state':
                enemy.x = data.x; enemy.y = data.y;
                enemy.hp = data.hp; enemy.mana = data.mana;
                enemy.dashing = data.dashing;
                break;

            case 'cast':
                // Opponent cast a spell — we simulate it from their perspective
                // Build a simple compiled spell for the enemy arcons
                try {
                    const enemySpell = {
                        cost: data.cost,
                        xFn: null, yFn: null, emitDelayFn: null, widthFn: null,
                    };
                    // We re-use a basic beam pattern since we can't share compiled functions
                    // The actual positions come from the network sender's formula
                    // Better approach: send the formula expressions
                    // For now, use directional beam as approximation
                    const aim = Math.atan2(data.cursorY - data.casterY, data.cursorX - data.casterX);
                    const cx = data.casterX, cy = data.casterY;
                    enemySpell.xFn = (v) => cx + Math.cos(aim) * 300 * (v.t - v.i * 0.02);
                    enemySpell.yFn = (v) => cy + Math.sin(aim) * 300 * (v.t - v.i * 0.02);
                    enemySpell.emitDelayFn = (v) => v.i * 0.02;
                    enemySpell.widthFn = (v) => 4;

                    const cast = ArconSystem.castSpell(enemySpell,
                        { id: 'enemy', x: data.casterX, y: data.casterY },
                        player,
                        data.cursorX, data.cursorY
                    );
                    enemyCasts.push(cast);
                } catch(e) {}
                break;

            case 'castfull':
                // Opponent sends full formula expressions
                try {
                    const s = {
                        cost: data.cost,
                        xFn: Parser.compile(data.xExpr),
                        yFn: Parser.compile(data.yExpr),
                        emitDelayFn: Parser.compile(data.emitExpr),
                        widthFn: Parser.compile(data.widthExpr),
                    };
                    const cast = ArconSystem.castSpell(s,
                        { id:'enemy', x:data.casterX, y:data.casterY },
                        player, data.cursorX, data.cursorY
                    );
                    enemyCasts.push(cast);
                } catch(e) {}
                break;

            case 'dash':
                enemy.dashing = true;
                enemy.dashDirX = data.dirX;
                enemy.dashDirY = data.dirY;
                enemy.dashTimer = DASH_DURATION;
                setTimeout(() => { enemy.dashing = false; }, DASH_DURATION * 1000);
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

        const cast = ArconSystem.castSpell(spell, player, enemy, mouse.x, mouse.y);
        playerCasts.push(cast);

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

        document.getElementById('enemy-hp').style.width = `${(enemy.hp/HP_MAX)*100}%`;
        document.getElementById('enemy-hp-text').textContent = Math.ceil(enemy.hp);
        document.getElementById('enemy-mana').style.width = `${(enemy.mana/MANA_MAX)*100}%`;
        const eLocked = ArconSystem.countActive('enemy') + ArconSystem.countPending(enemyCasts, 'enemy');
        document.getElementById('enemy-mana-locked').style.width = `${(eLocked/MANA_MAX)*100}%`;

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
        if (winner === 'player') { h1.textContent = 'VICTORY'; h1.style.color = '#ffd700'; sub.textContent = 'Your formulas proved superior.'; }
        else { h1.textContent = 'DEFEAT'; h1.style.color = '#ff4444'; sub.textContent = 'Your equations were insufficient.'; }
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
        renderMage(ctx, enemy, '#ff4444', '#ff8877');

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
    }

    function renderMage(ctx, mage, color, light) {
        const flash = mage.hitFlash > 0;
        const isDashing = mage.dashing;

        // Ghost trail when dashing (enhanced with afterimages)
        if (isDashing) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = color;
            const stretchX = (mage.dashDirX || 0) * -25;
            const stretchY = (mage.dashDirY || 0) * -25;
            // Afterimage 1
            ctx.fillRect(mage.x - 6 + stretchX, mage.y - 14 + stretchY, 12, 24);
            // Afterimage 2
            ctx.globalAlpha = 0.05;
            ctx.fillRect(mage.x - 4 + stretchX * 2, mage.y - 10 + stretchY * 2, 8, 18);
            ctx.globalAlpha = 0.15;
            ctx.fillRect(mage.x - 8, mage.y - 16, 16, 28);
        }

        ctx.globalAlpha = isDashing ? 0.4 : 0.3;
        ctx.fillStyle = '#000'; ctx.fillRect(mage.x - 8, mage.y + 8, 16, 4);
        ctx.globalAlpha = isDashing ? 0.5 : 1;

        ctx.fillStyle = flash ? '#fff' : color;
        ctx.fillRect(mage.x - 4, mage.y - 14, 8, 8); // head
        ctx.fillRect(mage.x - 5, mage.y - 6, 10, 10); // body
        ctx.fillRect(mage.x - 5, mage.y + 4, 4, 6); // legs
        ctx.fillRect(mage.x + 1, mage.y + 4, 4, 6);

        if (!flash) ctx.fillStyle = light;
        ctx.fillRect(mage.x - 6, mage.y - 16, 12, 2); // hat brim
        ctx.fillRect(mage.x - 3, mage.y - 20, 6, 4);
        ctx.fillRect(mage.x - 1, mage.y - 22, 2, 2);

        if (!flash) ctx.fillStyle = '#ffd700';
        ctx.fillRect(mage.x + 5, mage.y - 4, 2, 12); // wand
        ctx.globalAlpha = (mage.dashing ? .3 : .5) + Math.sin(performance.now() / 200) * .3;
        ctx.fillStyle = flash ? '#fff' : '#ffd700';
        ctx.fillRect(mage.x + 4, mage.y - 6, 4, 4);
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#fff';
        ctx.fillRect(mage.x - 2, mage.y - 12, 2, 2);
        ctx.fillRect(mage.x + 1, mage.y - 12, 2, 2);

        // Invuln shimmer
        if (mage.invulnTimer > 0) {
            ctx.globalAlpha = 0.15 + Math.sin(performance.now() / 50) * 0.1;
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
    function onMouseDown(x, y) { mouse.x = x; mouse.y = y; }
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
