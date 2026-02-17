// ───────────────────────────────────────
//  SANDBOX MODE -- Test spells freely
// ───────────────────────────────────────
const Sandbox = (() => {
    const W = 960, H = 540;
    const ARENA_W = 1600, ARENA_H = 900;
    const PLAYER_RADIUS = 6;
    const MANA_MAX = 100;
    const MANA_REGEN = 80; // per second (fast regen)

    let player = null;
    let playerSpells = [];
    let playerCasts = [];
    let keys = {};
    let mouse = { x: W / 2, y: H / 2 };
    let active = false;
    let dummies = [];
    let particles = [];

    // Target dummy
    function spawnDummies() {
        dummies = [];
        const positions = [
            { x: 500, y: 300 }, { x: 700, y: 200 }, { x: 900, y: 400 },
            { x: 1100, y: 300 }, { x: 800, y: 600 }, { x: 600, y: 500 },
        ];
        for (const p of positions) {
            dummies.push({
                x: p.x, y: p.y, hp: 9999, maxHp: 9999,
                size: 18, color: '#886644', alive: true,
                hitFlash: 0, name: 'dummy',
            });
        }
    }

    function init(compiledSpells) {
        playerSpells = compiledSpells || [];
        for (const s of playerSpells) {
            s.currentCooldown = 0;
        }
        player = {
            id: 'sandbox-player',
            x: ARENA_W / 2, y: ARENA_H / 2,
            hp: 9999, maxHp: 9999, mana: MANA_MAX,
            speed: 200, hitRadius: 10, hitFlash: 0,
            invulnTimer: 0, dashing: false,
            dashCooldown: 0, dashDirX: 0, dashDirY: 0,
        };
        playerCasts = [];
        particles = [];
        spawnDummies();
        active = true;

        ArconSystem.reset();
        ArconSystem.onManaReturn('sandbox-player', (count) => {
            player.mana = Math.min(MANA_MAX, player.mana + count);
        });

        // HUD
        const keysDiv = document.getElementById('sandbox-spellKeys');
        if (keysDiv) {
            keysDiv.innerHTML = '';
            for (let i = 0; i < playerSpells.length; i++) {
                const el = document.createElement('div');
                el.className = 'spell-key-hud';
                el.id = 'sandbox-spell-hud-' + i;
                el.innerHTML = '<span class="key-num">' + (i + 1) + '</span><span>' + playerSpells[i].name.substring(0, 4) + '</span>';
                keysDiv.appendChild(el);
            }
        }

        document.getElementById('sandboxBackBtn').onclick = () => {
            active = false;
            document.getElementById('sandbox-hud').classList.add('hidden');
            // Return to menu
            if (typeof Game !== 'undefined') Game.backToMenu();
        };
    }

    function update(dt) {
        if (!active || !player) return;

        // Mana regen (fast)
        player.mana = Math.min(MANA_MAX, player.mana + MANA_REGEN * dt);

        // Movement
        let mx = 0, my = 0;
        if (keys['w'] || keys['arrowup']) my -= 1;
        if (keys['s'] || keys['arrowdown']) my += 1;
        if (keys['a'] || keys['arrowleft']) mx -= 1;
        if (keys['d'] || keys['arrowright']) mx += 1;

        if (mx !== 0 || my !== 0) {
            const len = Math.sqrt(mx * mx + my * my);
            player.x += (mx / len) * player.speed * dt;
            player.y += (my / len) * player.speed * dt;
        }

        // Clamp to arena
        player.x = Math.max(20, Math.min(ARENA_W - 20, player.x));
        player.y = Math.max(20, Math.min(ARENA_H - 20, player.y));

        if (player.hitFlash > 0) player.hitFlash -= dt;
        if (player.invulnTimer > 0) player.invulnTimer -= dt;

        // Update casts
        for (const c of playerCasts) ArconSystem.updateCast(c, dt);
        playerCasts = playerCasts.filter(c => c.active);

        ArconSystem.updateArcons(dt, [player]);

        // Arcons vs dummies
        const arcons = ArconSystem.getArcons();
        for (let i = arcons.length - 1; i >= 0; i--) {
            const a = arcons[i];
            if (!a.alive) continue;
            for (const d of dummies) {
                const dx = a.x - d.x, dy = a.y - d.y;
                const hitDist = a.width / 2 + d.size / 2;
                if (dx * dx + dy * dy < hitDist * hitDist) {
                    a.alive = false;
                    d.hitFlash = 0.15;
                    // Hit particles
                    for (let j = 0; j < 5; j++) {
                        particles.push({
                            x: d.x, y: d.y,
                            vx: (Math.random() - 0.5) * 80,
                            vy: (Math.random() - 0.5) * 80,
                            life: 0.3, maxLife: 0.3, size: 2,
                            color: '#ffd700',
                        });
                    }
                    break;
                }
            }
        }

        // Dummy flash decay
        for (const d of dummies) {
            if (d.hitFlash > 0) d.hitFlash -= dt;
        }

        // Particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Spell cooldowns
        for (const s of playerSpells) {
            if (s.currentCooldown > 0) s.currentCooldown -= dt;
        }

        updateHUD();
    }

    function castSpell(index) {
        if (!active || !player) return;
        if (index < 0 || index >= playerSpells.length) return;
        const spell = playerSpells[index];
        if (player.mana < spell.cost) return;

        player.mana -= spell.cost;

        const cam = getCamera();
        const worldX = mouse.x + cam.x;
        const worldY = mouse.y + cam.y;

        const cast = ArconSystem.castSpell(spell,
            { id: player.id, x: player.x, y: player.y },
            { id: 'target', x: worldX, y: worldY },
            worldX, worldY, {
                hp: player.hp, maxHp: player.maxHp,
                mana: player.mana, maxMana: MANA_MAX,
                speed: player.speed, level: 1,
                combo: 0, kills: 0, floor: 0,
            }
        );
        playerCasts.push(cast);
    }

    function getCamera() {
        return {
            x: player.x - W / 2,
            y: player.y - H / 2,
        };
    }

    function render(ctx) {
        if (!active || !player) return;
        const cam = getCamera();

        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(-cam.x, -cam.y);

        // Grid floor
        ctx.strokeStyle = '#1a1a2a';
        ctx.lineWidth = 1;
        const gs = 40;
        const startX = Math.floor(cam.x / gs) * gs;
        const startY = Math.floor(cam.y / gs) * gs;
        for (let x = startX; x < cam.x + W + gs; x += gs) {
            ctx.beginPath(); ctx.moveTo(x, cam.y); ctx.lineTo(x, cam.y + H); ctx.stroke();
        }
        for (let y = startY; y < cam.y + H + gs; y += gs) {
            ctx.beginPath(); ctx.moveTo(cam.x, y); ctx.lineTo(cam.x + W, y); ctx.stroke();
        }

        // Arena border
        ctx.strokeStyle = '#334';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, ARENA_W, ARENA_H);

        // Dummies
        for (const d of dummies) {
            const flash = d.hitFlash > 0;
            // Base
            ctx.fillStyle = flash ? '#fff' : '#554433';
            ctx.fillRect(d.x - 4, d.y + 8, 8, 6);
            ctx.fillRect(d.x - 6, d.y + 12, 12, 4);
            // Pole
            ctx.fillStyle = flash ? '#fff' : '#776655';
            ctx.fillRect(d.x - 2, d.y - 12, 4, 20);
            // Crossbar
            ctx.fillRect(d.x - 10, d.y - 8, 20, 4);
            // Head
            ctx.fillStyle = flash ? '#fff' : '#aa8866';
            ctx.fillRect(d.x - 5, d.y - 18, 10, 10);
            // Eyes
            ctx.fillStyle = '#333';
            ctx.fillRect(d.x - 3, d.y - 14, 2, 2);
            ctx.fillRect(d.x + 1, d.y - 14, 2, 2);
            // Label
            ctx.fillStyle = '#555';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('TARGET', d.x, d.y + 22);
        }

        // Player
        const t = performance.now() / 1000;
        const bob = Math.sin(t * 2.5) * 1.5;
        ctx.fillStyle = '#4488ff';
        // Body
        ctx.fillRect(player.x - 5, player.y - 6 + bob, 10, 10);
        // Head
        ctx.fillRect(player.x - 4, player.y - 14 + bob, 8, 8);
        // Hat
        ctx.fillStyle = '#6699ff';
        ctx.fillRect(player.x - 6, player.y - 16 + bob, 12, 2);
        ctx.fillRect(player.x - 3, player.y - 20 + bob, 6, 4);
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(player.x - 2, player.y - 12 + bob, 2, 2);
        ctx.fillRect(player.x + 1, player.y - 12 + bob, 2, 2);
        // Legs
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(player.x - 5, player.y + 4, 4, 6);
        ctx.fillRect(player.x + 1, player.y + 4, 4, 6);

        // Arcons
        ArconSystem.render(ctx, 0, 0);

        // Particles
        for (const p of particles) {
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        ctx.restore();

        // Aim crosshair
        ctx.strokeStyle = '#4488ff';
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.strokeRect(mouse.x - 4, mouse.y - 4, 8, 8);
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(mouse.x - 1, mouse.y - 1, 2, 2);
        ctx.globalAlpha = 1;
    }

    function updateHUD() {
        const manaEl = document.getElementById('sandbox-mana');
        const manaText = document.getElementById('sandbox-mana-text');
        if (manaEl) manaEl.style.width = ((player.mana / MANA_MAX) * 100) + '%';
        if (manaText) manaText.textContent = Math.ceil(player.mana);

        for (let i = 0; i < playerSpells.length; i++) {
            const el = document.getElementById('sandbox-spell-hud-' + i);
            if (!el) continue;
            el.className = 'spell-key-hud';
            if (player.mana < playerSpells[i].cost) el.classList.add('no-mana');
        }
    }

    function onKeyDown(key) {
        keys[key.toLowerCase()] = true;
        const num = parseInt(key);
        if (num >= 1 && num <= 6) castSpell(num - 1);
    }
    function onKeyUp(key) { keys[key.toLowerCase()] = false; }
    function onMouseMove(x, y) { mouse.x = x; mouse.y = y; }
    function onMouseDown(x, y) { mouse.x = x; mouse.y = y; }
    function onMouseUp() {}

    return {
        init, update, render,
        onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp,
        isActive: () => active,
        stop: () => { active = false; },
    };
})();
