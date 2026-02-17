// -----------------------------------------
//  ARCON PARTICLE SYSTEM (v3)
//  -- Instant mana return on arcon death
//  -- Better blocking: stationary arcons have 3x collision radius
//  -- Campaign mode: no hardcoded bounds, uses world coords
// -----------------------------------------

const ArconSystem = (() => {
    const MAX_LIFETIME = 5.0;
    const MIN_SPEED_DMG = 20;
    const MAX_ARCONS = 600;       // Hard cap on total arcons
    const MAX_CONTRAILS = 800;    // Hard cap on contrails

    let arcons = [];
    let contrails = [];
    let manaReturnCallbacks = {}; // ownerId -> callback(count)
    let boundsMode = 'arena'; // 'arena' = 960x540, 'dungeon' = no bounds
    let worldBounds = null; // { x, y, w, h } for dungeon mode
    let ownerColors = {}; // ownerId -> { r, g, b }

    function reset() { arcons = []; contrails = []; manaReturnCallbacks = {}; ownerColors = {}; }
    function onManaReturn(ownerId, cb) { manaReturnCallbacks[ownerId] = cb; }
    function returnMana(ownerId, count) {
        if (manaReturnCallbacks[ownerId]) manaReturnCallbacks[ownerId](count);
    }

    function setOwnerColor(ownerId, hexColor) {
        const r = parseInt(hexColor.slice(1,3), 16) || 100;
        const g = parseInt(hexColor.slice(3,5), 16) || 180;
        const b = parseInt(hexColor.slice(5,7), 16) || 255;
        ownerColors[ownerId] = { r, g, b };
    }

    function getOwnerColor(ownerId) {
        if (ownerColors[ownerId]) return ownerColors[ownerId];
        return ownerId === 'player' ? { r:100, g:180, b:255 } : { r:255, g:100, b:80 };
    }

    function setBoundsMode(mode, bounds) {
        boundsMode = mode;
        worldBounds = bounds || null;
    }

    function isOutOfBounds(x, y) {
        if (boundsMode === 'dungeon' && worldBounds) {
            return x < worldBounds.x - 100 || x > worldBounds.x + worldBounds.w + 100 ||
                   y < worldBounds.y - 100 || y > worldBounds.y + worldBounds.h + 100;
        }
        // Arena mode (PvP)
        return x < -50 || x > 1010 || y < -50 || y > 590;
    }

    function castSpell(spell, caster, target, cursorX, cursorY, extraVars) {
        const N = spell.cost;
        const aim = Math.atan2(cursorY - caster.y, cursorX - caster.x);
        const dist = Math.sqrt((cursorX - caster.x) ** 2 + (cursorY - caster.y) ** 2);

        // Targeting range limit: clamp enemy target to max range of 350px
        const MAX_TARGET_RANGE = 350;
        let targetX = target.x, targetY = target.y;
        const tDist = Math.sqrt((target.x - caster.x) ** 2 + (target.y - caster.y) ** 2);
        if (tDist > MAX_TARGET_RANGE) {
            const tAngle = Math.atan2(target.y - caster.y, target.x - caster.x);
            targetX = caster.x + Math.cos(tAngle) * MAX_TARGET_RANGE;
            targetY = caster.y + Math.sin(tAngle) * MAX_TARGET_RANGE;
        }

        // Extended variable context — the loophole system
        const ev = extraVars || {};
        const castVars = {
            'player.x': caster.x, 'player.y': caster.y,
            'cursor.x': cursorX, 'cursor.y': cursorY,
            'enemy.x': targetX, 'enemy.y': targetY,
            'map.w': 960, 'map.h': 540,
            N, aim, dist, 'pi': Math.PI,
            // ── LOOPHOLE VARIABLES ──
            'hp': ev.hp || 100,
            'maxHp': ev.maxHp || 100,
            'mana': ev.mana || 100,
            'maxMana': ev.maxMana || 100,
            'speed': ev.speed || 200,
            'arcons': countActive(caster.id || 'player'),
            'gameTime': ev.gameTime || 0,
            'dt': ev.dt || 0.016,
            'combo': ev.combo || 1,
            'kills': ev.kills || 0,
            'floor': ev.floor || 1,
            'level': ev.level || 1,
            'dx': Math.cos(aim),
            'dy': Math.sin(aim),
            'vel': ev.vel || 0,
            'phase': ev.phase || 0,
            'entropy': Math.random(),
        };

        const pendingArcons = [];
        for (let i = 0; i < N; i++) {
            const vars = { ...castVars, i, t: 0, rand: Math.random() };
            let emitDelay = 0;
            try { emitDelay = spell.emitDelayFn(vars); } catch(e) { emitDelay = i * 0.02; }

            pendingArcons.push({
                index: i, emitDelay: Math.max(0, emitDelay),
                castVars: { ...castVars }, randSeed: Math.random(), emitted: false,
            });
        }

        if (typeof Audio !== 'undefined') Audio.cast();

        return { spell, caster, target, pendingArcons, castTime: 0, ownerId: caster.id, active: true };
    }

    function updateCast(cast, dt) {
        if (!cast.active) return;
        cast.castTime += dt;
        for (const pa of cast.pendingArcons) {
            if (!pa.emitted && cast.castTime >= pa.emitDelay) {
                pa.emitted = true;
                const a = createArcon(cast.spell, pa, cast);
                if (a) arcons.push(a);
            }
        }
        if (cast.pendingArcons.every(p => p.emitted)) cast.active = false;
    }

    function createArcon(spell, pa, cast) {
        if (arcons.length >= MAX_ARCONS) return null; // Hard cap
        const vars = { ...pa.castVars, i: pa.index, t: 0, rand: pa.randSeed };
        let x, y;
        try { x = spell.xFn(vars); y = spell.yFn(vars); } catch(e) { x = pa.castVars['player.x']; y = pa.castVars['player.y']; }
        let width = 4;
        try { width = spell.widthFn ? spell.widthFn(vars) : 4; } catch(e) {}

        return {
            x, y, prevX: x, prevY: y, t: 0, i: pa.index,
            castVars: pa.castVars, randSeed: pa.randSeed,
            xFn: spell.xFn, yFn: spell.yFn, widthFn: spell.widthFn,
            width: Math.max(2, Math.min(20, width)),
            ownerId: cast.ownerId, alive: true, lifetime: 0,
            color: getOwnerColor(cast.ownerId),
        };
    }

    function updateArcons(dt, entities) {
        const density = (typeof window !== 'undefined' && window.GameSettings) ? window.GameSettings.particleDensity : 'high';

        // Contrail decay
        for (let i = contrails.length - 1; i >= 0; i--) {
            contrails[i].life -= dt;
            if (contrails[i].life <= 0) contrails.splice(i, 1);
        }

        // Track mana returns per owner
        const returns = {};

        for (let i = arcons.length - 1; i >= 0; i--) {
            const a = arcons[i];
            if (!a.alive) {
                if (!returns[a.ownerId]) returns[a.ownerId] = 0;
                returns[a.ownerId]++;
                arcons.splice(i, 1);
                continue;
            }

            a.lifetime += dt;
            a.t += dt;
            a.prevX = a.x;
            a.prevY = a.y;

            const vars = { ...a.castVars, i: a.i, t: a.t, rand: a.randSeed };
            const enemy = entities.find(e => e.id !== a.ownerId);
            if (enemy) { vars['enemy.x'] = enemy.x; vars['enemy.y'] = enemy.y; }

            try { a.x = a.xFn(vars); a.y = a.yFn(vars); } catch(e) { a.alive = false; continue; }
            if (isNaN(a.x) || isNaN(a.y)) { a.alive = false; continue; }

            try { if (a.widthFn) a.width = Math.max(2, Math.min(20, a.widthFn(vars))); } catch(e) {}

            if (a.lifetime > MAX_LIFETIME) { a.alive = false; continue; }
            if (isOutOfBounds(a.x, a.y)) { a.alive = false; continue; }

            // Contrail (respect density setting)
            const contrailChance = density === 'low' ? 0.2 : density === 'medium' ? 0.5 : 1;
            if (contrails.length < MAX_CONTRAILS && Math.random() < contrailChance) {
                contrails.push({ x: a.x, y: a.y, size: a.width * 0.6, life: 0.25, maxLife: 0.25, color: a.color });
            }
        }

        // Speed calc helper
        function speed(a) {
            return Math.sqrt((a.x - a.prevX) ** 2 + (a.y - a.prevY) ** 2) / Math.max(dt, 0.001);
        }

        // Arcon vs entity collision
        for (let i = arcons.length - 1; i >= 0; i--) {
            const a = arcons[i];
            if (!a.alive) continue;
            const spd = speed(a);

            for (const ent of entities) {
                if (ent.id === a.ownerId) continue;
                // Dashing or invuln grants i-frames
                if (ent.dashing || (ent.invulnTimer && ent.invulnTimer > 0)) continue;

                const dx = a.x - ent.x, dy = a.y - ent.y;
                const hitDist = a.width / 2 + ent.hitRadius;
                if (dx * dx + dy * dy < hitDist * hitDist) {
                    if (spd >= MIN_SPEED_DMG) {
                        ent.hp = Math.max(0, ent.hp - 1);
                        ent.hitFlash = 0.15;
                        if (typeof Audio !== 'undefined') Audio.hit();
                    }
                    a.alive = false;
                    // Hit sparks (respect density)
                    const sparkCount = density === 'low' ? 1 : density === 'medium' ? 2 : 4;
                    for (let p = 0; p < sparkCount; p++) {
                        contrails.push({
                            x: a.x + (Math.random() - .5) * 10, y: a.y + (Math.random() - .5) * 10,
                            size: a.width * 0.8 + Math.random() * 3, life: 0.35, maxLife: 0.35,
                            color: { r:255, g:255, b:200 },
                        });
                    }
                    break;
                }
            }
        }

        // Arcon vs arcon annihilation (Law 3) — spatial hash for O(n) average
        const CELL = 40;
        const grid = {};
        for (let i = 0; i < arcons.length; i++) {
            if (!arcons[i].alive) continue;
            const cx = Math.floor(arcons[i].x / CELL);
            const cy = Math.floor(arcons[i].y / CELL);
            const key = cx + ',' + cy;
            if (!grid[key]) grid[key] = [];
            grid[key].push(i);
        }

        for (const key in grid) {
            const cell = grid[key];
            const [cx, cy] = key.split(',').map(Number);
            // Check this cell and neighbors
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const nk = (cx+dx) + ',' + (cy+dy);
                    const neighbor = grid[nk];
                    if (!neighbor) continue;
                    const isSame = (nk === key);
                    for (let ci = 0; ci < cell.length; ci++) {
                        const i = cell[ci];
                        if (!arcons[i].alive) continue;
                        const startJ = isSame ? ci + 1 : 0;
                        for (let cj = startJ; cj < neighbor.length; cj++) {
                            const j = neighbor[cj];
                            if (!arcons[j].alive) continue;
                            if (arcons[i].ownerId === arcons[j].ownerId) continue;

                            const a = arcons[i], b = arcons[j];
                            const spdA = speed(a), spdB = speed(b);
                            const radiusA = spdA < 40 ? a.width * 2.5 : a.width;
                            const radiusB = spdB < 40 ? b.width * 2.5 : b.width;

                            const ddx = a.x - b.x, ddy = a.y - b.y;
                            const dist = (radiusA + radiusB) / 2;
                            if (ddx * ddx + ddy * ddy < dist * dist) {
                                a.alive = false;
                                b.alive = false;
                                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                                const annihSparks = density === 'low' ? 2 : density === 'medium' ? 3 : 5;
                                for (let p = 0; p < annihSparks; p++) {
                                    contrails.push({
                                        x: mx + (Math.random() - .5) * 12, y: my + (Math.random() - .5) * 12,
                                        size: 3 + Math.random() * 4, life: 0.3, maxLife: 0.3,
                                        color: { r:255, g:220, b:100 },
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Process dead arcons -> instant mana return
        for (let i = arcons.length - 1; i >= 0; i--) {
            if (!arcons[i].alive) {
                if (!returns[arcons[i].ownerId]) returns[arcons[i].ownerId] = 0;
                returns[arcons[i].ownerId]++;
                arcons.splice(i, 1);
            }
        }

        // Fire mana return callbacks
        for (const id in returns) {
            returnMana(id, returns[id]);
        }
    }

    function countActive(ownerId) { return arcons.filter(a => a.ownerId === ownerId && a.alive).length; }
    function countPending(casts, ownerId) {
        let c = 0;
        for (const cast of casts) { if (cast.ownerId === ownerId && cast.active) c += cast.pendingArcons.filter(p => !p.emitted).length; }
        return c;
    }

    function render(ctx) {
        for (const c of contrails) {
            const alpha = (c.life / c.maxLife) * 0.45;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = `rgb(${c.color.r},${c.color.g},${c.color.b})`;
            const s = c.size * (c.life / c.maxLife);
            ctx.fillRect(Math.floor(c.x - s/2), Math.floor(c.y - s/2), Math.ceil(s), Math.ceil(s));
        }
        ctx.globalAlpha = 1;
        for (const a of arcons) {
            if (!a.alive) continue;
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = `rgb(${a.color.r},${a.color.g},${a.color.b})`;
            const gs = a.width * 2;
            ctx.fillRect(Math.floor(a.x - gs/2), Math.floor(a.y - gs/2), Math.ceil(gs), Math.ceil(gs));
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = `rgb(${Math.min(255,a.color.r+80)},${Math.min(255,a.color.g+80)},${Math.min(255,a.color.b+80)})`;
            ctx.fillRect(Math.floor(a.x - a.width/2), Math.floor(a.y - a.width/2), Math.ceil(a.width), Math.ceil(a.width));
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff';
            ctx.fillRect(Math.floor(a.x - 1), Math.floor(a.y - 1), 2, 2);
        }
        ctx.globalAlpha = 1;
    }

    return {
        reset, castSpell, updateCast, updateArcons, countActive, countPending,
        render, getArcons: () => arcons, onManaReturn, setBoundsMode, setOwnerColor,
    };
})();
