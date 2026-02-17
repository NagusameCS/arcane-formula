// -----------------------------------------
//  DUNGEON SYSTEM -- Procedural generation, rendering, minimap
//  Ported and adapted from Into-The-Deluge
//  v2: zoom support, better collision, minimap, more spawns
// -----------------------------------------

const Dungeon = (() => {
    const TILE = {
        VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3,
        STAIRS_DOWN: 4, CHEST: 5, TRAP: 6,
        TORCH_LIT: 7, BOSS_DOOR: 8, SPAWN: 9,
    };

    const FLOOR_THEMES = {
        egypt: {
            name: 'Tomb of Ra',
            void: '#0a0804', floor: '#c4a35a', wall: '#8b7355',
            door: '#daa520', accent: '#ffd700', highlight: '#fff8dc',
            enemies: ['scarab', 'mummy', 'anubis_guard'],
            boss: 'Pharaoh Khet',
        },
        hades: {
            name: 'Halls of Hades',
            void: '#0a0404', floor: '#3a1a1a', wall: '#5a2020',
            door: '#8b0000', accent: '#ff4500', highlight: '#ff6347',
            enemies: ['shade', 'cerberus_pup', 'fury'],
            boss: 'Lord Thanatos',
        },
        jungle: {
            name: 'Verdant Depths',
            void: '#040a04', floor: '#2a3a2a', wall: '#3a4a3a',
            door: '#228b22', accent: '#32cd32', highlight: '#7cfc00',
            enemies: ['vine_creep', 'spore_bloom', 'jungle_wyrm'],
            boss: 'Elder Thornback',
        },
        light: {
            name: 'Sanctum of Light',
            void: '#0a0a08', floor: '#e8e8e0', wall: '#d4d4cc',
            door: '#ffd700', accent: '#fff8dc', highlight: '#ffffff',
            enemies: ['sentinel', 'radiant_golem', 'seraph'],
            boss: 'Archon Solaris',
        },
        cyber: {
            name: 'Neon Abyss',
            void: '#020208', floor: '#3a3a3a', wall: '#4a4a4a',
            door: '#00bfff', accent: '#00ffff', highlight: '#7df9ff',
            enemies: ['drone', 'turret', 'virus'],
            boss: 'Core Override',
        },
        stone: {
            name: 'Forgotten Catacombs',
            void: '#060508', floor: '#3a3540', wall: '#4a4550',
            door: '#8a7aa0', accent: '#9b59b6', highlight: '#d8bfd8',
            enemies: ['skeleton', 'wraith', 'gargoyle'],
            boss: 'Lich King Morthul',
        },
    };

    const FLOOR_ORDER = ['egypt', 'hades', 'jungle', 'light', 'cyber', 'stone'];

    const MAP_W = 80, MAP_H = 60;
    const TILE_SIZE = 16;
    const MIN_ROOM = 6, MAX_ROOM = 14;
    const BOSS_ROOM_SIZE = 20;
    const ZOOM = 2.0; // Camera zoom factor

    // -- GENERATOR --
    function generate(floorIndex) {
        const theme = FLOOR_THEMES[FLOOR_ORDER[floorIndex % FLOOR_ORDER.length]];
        const map = [];
        for (let y = 0; y < MAP_H; y++) {
            map[y] = [];
            for (let x = 0; x < MAP_W; x++) map[y][x] = TILE.VOID;
        }

        const rooms = [];
        const spawnPoints = [];

        // Generate rooms using 9ths placement
        const cellW = Math.floor(MAP_W / 3);
        const cellH = Math.floor(MAP_H / 3);

        for (let cy = 0; cy < 3; cy++) {
            for (let cx = 0; cx < 3; cx++) {
                if (cx === 1 && cy === 1) continue; // Reserve center for boss
                if (Math.random() < 0.15 && rooms.length >= 5) continue;

                const rw = MIN_ROOM + Math.floor(Math.random() * (MAX_ROOM - MIN_ROOM));
                const rh = MIN_ROOM + Math.floor(Math.random() * (MAX_ROOM - MIN_ROOM));
                const rx = cx * cellW + 2 + Math.floor(Math.random() * (cellW - rw - 4));
                const ry = cy * cellH + 2 + Math.floor(Math.random() * (cellH - rh - 4));

                if (rx < 1 || ry < 1 || rx + rw >= MAP_W - 1 || ry + rh >= MAP_H - 1) continue;

                const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw/2), cy: ry + Math.floor(rh/2) };
                rooms.push(room);
                carveRoom(map, room);
            }
        }

        // Boss room in center
        const bossRoom = {
            x: Math.floor(MAP_W/2) - Math.floor(BOSS_ROOM_SIZE/2),
            y: Math.floor(MAP_H/2) - Math.floor(BOSS_ROOM_SIZE/2),
            w: BOSS_ROOM_SIZE, h: BOSS_ROOM_SIZE,
            cx: Math.floor(MAP_W/2), cy: Math.floor(MAP_H/2),
            isBoss: true,
        };
        rooms.push(bossRoom);
        carveRoom(map, bossRoom);

        // Connect rooms with corridors
        for (let i = 0; i < rooms.length - 1; i++) {
            connectRooms(map, rooms[i], rooms[i + 1]);
        }
        // Extra connections for loops
        for (let i = 0; i < 3; i++) {
            const a = rooms[Math.floor(Math.random() * rooms.length)];
            const b = rooms[Math.floor(Math.random() * rooms.length)];
            if (a !== b) connectRooms(map, a, b);
        }

        // Place walls around floors
        addWalls(map);

        // Place features
        for (const room of rooms) {
            if (room.isBoss) {
                map[room.y][room.cx] = TILE.BOSS_DOOR;
                spawnPoints.push({ x: room.cx, y: room.cy + 5, type: 'boss' });
                continue;
            }

            const area = room.w * room.h;

            // Torches in corners
            const corners = [
                [room.x + 1, room.y + 1], [room.x + room.w - 2, room.y + 1],
                [room.x + 1, room.y + room.h - 2], [room.x + room.w - 2, room.y + room.h - 2],
            ];
            for (const [tx, ty] of corners) {
                if (Math.random() < 0.5 && map[ty] && map[ty][tx] === TILE.FLOOR) {
                    map[ty][tx] = TILE.TORCH_LIT;
                }
            }

            // Chests
            if (Math.random() < 0.35) {
                const cx = room.x + 2 + Math.floor(Math.random() * (room.w - 4));
                const cy = room.y + 2 + Math.floor(Math.random() * (room.h - 4));
                if (map[cy] && map[cy][cx] === TILE.FLOOR) map[cy][cx] = TILE.CHEST;
            }

            // Traps
            if (Math.random() < 0.3) {
                for (let t = 0; t < 3; t++) {
                    const tx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
                    const ty = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
                    if (map[ty] && map[ty][tx] === TILE.FLOOR) map[ty][tx] = TILE.TRAP;
                }
            }

            // Enemy spawn points -- MUCH more enemies
            const minEnemies = Math.max(2, Math.floor(area / 25));
            const maxEnemies = Math.max(3, Math.floor(area / 15));
            const count = minEnemies + Math.floor(Math.random() * (maxEnemies - minEnemies + 1));
            for (let e = 0; e < count; e++) {
                spawnPoints.push({
                    x: room.x + 2 + Math.floor(Math.random() * (room.w - 4)),
                    y: room.y + 2 + Math.floor(Math.random() * (room.h - 4)),
                    type: 'enemy',
                });
            }
        }

        // Player spawn
        const startRoom = rooms[0];
        map[startRoom.cy][startRoom.cx] = TILE.SPAWN;

        // Stairs
        const exitRoom = rooms[Math.max(0, rooms.length - 2)];
        map[exitRoom.cy][exitRoom.cx] = TILE.STAIRS_DOWN;

        return {
            map, rooms, spawnPoints, theme, floorIndex,
            startX: startRoom.cx, startY: startRoom.cy,
            bossRoom,
            pixelW: MAP_W * TILE_SIZE, pixelH: MAP_H * TILE_SIZE,
        };
    }

    function carveRoom(map, room) {
        for (let y = room.y; y < room.y + room.h; y++) {
            for (let x = room.x; x < room.x + room.w; x++) {
                if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W) {
                    map[y][x] = TILE.FLOOR;
                }
            }
        }
    }

    function connectRooms(map, a, b) {
        let x = a.cx, y = a.cy;
        const tx = b.cx, ty = b.cy;
        while (x !== tx) {
            if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
                map[y][x] = TILE.FLOOR;
                if (y > 0) map[y-1][x] = map[y-1][x] === TILE.VOID ? TILE.FLOOR : map[y-1][x];
            }
            x += x < tx ? 1 : -1;
        }
        while (y !== ty) {
            if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
                map[y][x] = TILE.FLOOR;
                if (x > 0) map[y][x-1] = map[y][x-1] === TILE.VOID ? TILE.FLOOR : map[y][x-1];
            }
            y += y < ty ? 1 : -1;
        }
        if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
            map[y][x] = TILE.DOOR;
        }
    }

    function addWalls(map) {
        const temp = map.map(row => [...row]);
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                if (temp[y][x] !== TILE.VOID) continue;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const ny = y + dy, nx = x + dx;
                        if (ny >= 0 && ny < MAP_H && nx >= 0 && nx < MAP_W) {
                            if (temp[ny][nx] === TILE.FLOOR || temp[ny][nx] === TILE.DOOR) {
                                map[y][x] = TILE.WALL;
                            }
                        }
                    }
                }
            }
        }
    }

    // -- PRE-RENDERER --
    let preRendered = null;
    let currentTheme = null;

    function preRender(dungeon) {
        currentTheme = dungeon.theme;
        const canvas = document.createElement('canvas');
        canvas.width = dungeon.pixelW;
        canvas.height = dungeon.pixelH;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = currentTheme.void;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const tile = dungeon.map[y][x];
                const px = x * TILE_SIZE, py = y * TILE_SIZE;
                renderTile(ctx, tile, px, py, currentTheme, x, y);
            }
        }

        preRendered = canvas;
    }

    function renderTile(ctx, tile, px, py, theme, tx, ty) {
        const S = TILE_SIZE;
        switch (tile) {
            case TILE.VOID: break;
            case TILE.FLOOR:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                if ((tx + ty) % 3 === 0) {
                    ctx.globalAlpha = 0.08;
                    ctx.fillStyle = '#000';
                    ctx.fillRect(px, py, S, S);
                    ctx.globalAlpha = 1;
                }
                if ((tx * 7 + ty * 13) % 17 === 0) {
                    ctx.globalAlpha = 0.15;
                    ctx.fillStyle = '#000';
                    ctx.fillRect(px + 2, py + S/2, S - 4, 1);
                    ctx.globalAlpha = 1;
                }
                break;
            case TILE.WALL:
                ctx.fillStyle = theme.wall;
                ctx.fillRect(px, py, S, S);
                ctx.globalAlpha = 0.15;
                ctx.fillStyle = theme.highlight;
                ctx.fillRect(px, py, S, 2);
                ctx.fillRect(px, py, 2, S);
                ctx.globalAlpha = 0.1;
                ctx.fillStyle = '#000';
                ctx.fillRect(px + S - 2, py, 2, S);
                ctx.fillRect(px, py + S - 2, S, 2);
                ctx.globalAlpha = 1;
                break;
            case TILE.DOOR:
                ctx.fillStyle = theme.door;
                ctx.fillRect(px, py, S, S);
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = theme.accent;
                ctx.fillRect(px + 3, py + 1, S - 6, S - 2);
                ctx.globalAlpha = 1;
                break;
            case TILE.STAIRS_DOWN:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.fillStyle = theme.accent;
                for (let i = 0; i < 4; i++) {
                    ctx.fillRect(px + 2, py + 2 + i * 3, S - 4 - i * 2, 2);
                }
                break;
            case TILE.CHEST:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(px + 2, py + 4, S - 4, S - 6);
                ctx.fillStyle = '#DAA520';
                ctx.fillRect(px + S/2 - 1, py + 6, 2, 4);
                ctx.fillRect(px + 2, py + 4, S - 4, 2);
                break;
            case TILE.TRAP:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.globalAlpha = 0.2;
                ctx.strokeStyle = theme.accent;
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(px + 2, py + 2);
                ctx.lineTo(px + S - 2, py + S - 2);
                ctx.moveTo(px + S - 2, py + 2);
                ctx.lineTo(px + 2, py + S - 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
                break;
            case TILE.TORCH_LIT:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.fillStyle = '#654321';
                ctx.fillRect(px + S/2 - 1, py + 4, 2, S - 4);
                ctx.fillStyle = '#ff8800';
                ctx.fillRect(px + S/2 - 2, py + 1, 4, 4);
                ctx.fillStyle = '#ffcc00';
                ctx.fillRect(px + S/2 - 1, py + 2, 2, 2);
                ctx.globalAlpha = 0.06;
                ctx.fillStyle = '#ffaa00';
                const glow = TILE_SIZE * 3;
                ctx.fillRect(px - glow/2, py - glow/2, S + glow, S + glow);
                ctx.globalAlpha = 1;
                break;
            case TILE.BOSS_DOOR:
                ctx.fillStyle = theme.accent;
                ctx.fillRect(px, py, S, S);
                ctx.fillStyle = '#000';
                ctx.globalAlpha = 0.3;
                ctx.fillRect(px + 2, py + 1, S - 4, S - 2);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#fff';
                ctx.fillRect(px + 4, py + 3, 2, 2);
                ctx.fillRect(px + S - 6, py + 3, 2, 2);
                ctx.fillStyle = theme.accent;
                ctx.fillRect(px + 6, py + 7, S - 12, 2);
                break;
            case TILE.SPAWN:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.globalAlpha = 0.2;
                ctx.fillStyle = theme.highlight;
                ctx.fillRect(px + S/2 - 3, py + 2, 6, S - 4);
                ctx.fillRect(px + 2, py + S/2 - 3, S - 4, 6);
                ctx.globalAlpha = 1;
                break;
        }
    }

    // -- CAMERA (with zoom) --
    let camera = { x: 0, y: 0 };

    function updateCamera(targetX, targetY, canvasW, canvasH, dungeon) {
        // Viewport is smaller when zoomed in
        const viewW = canvasW / ZOOM;
        const viewH = canvasH / ZOOM;
        const tx = targetX * TILE_SIZE - viewW / 2;
        const ty = targetY * TILE_SIZE - viewH / 2;
        camera.x += (tx - camera.x) * 0.1;
        camera.y += (ty - camera.y) * 0.1;
        camera.x = Math.max(0, Math.min(dungeon.pixelW - viewW, camera.x));
        camera.y = Math.max(0, Math.min(dungeon.pixelH - viewH, camera.y));
    }

    function render(ctx, canvasW, canvasH) {
        if (!preRendered) return;
        ctx.save();
        ctx.scale(ZOOM, ZOOM);
        ctx.drawImage(preRendered, -camera.x, -camera.y);
        ctx.restore();
    }

    function tileAt(dungeon, tx, ty) {
        if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) return TILE.VOID;
        return dungeon.map[ty][tx];
    }

    function isTileWalkable(tile) {
        return tile === TILE.FLOOR || tile === TILE.DOOR || tile === TILE.STAIRS_DOWN ||
               tile === TILE.CHEST || tile === TILE.TRAP || tile === TILE.TORCH_LIT ||
               tile === TILE.SPAWN || tile === TILE.BOSS_DOOR;
    }

    function isWalkable(dungeon, px, py) {
        const tx = Math.floor(px / TILE_SIZE);
        const ty = Math.floor(py / TILE_SIZE);
        return isTileWalkable(tileAt(dungeon, tx, ty));
    }

    // Multi-point collision for entities with radius
    function isWalkableBox(dungeon, px, py, radius) {
        const r = radius || 5;
        return isWalkable(dungeon, px - r, py - r) &&
               isWalkable(dungeon, px + r, py - r) &&
               isWalkable(dungeon, px - r, py + r) &&
               isWalkable(dungeon, px + r, py + r);
    }

    // -- MINIMAP --
    function renderMinimap(minimapCanvas, dungeon, playerX, playerY, allies) {
        const mctx = minimapCanvas.getContext('2d');
        const mw = minimapCanvas.width;
        const mh = minimapCanvas.height;
        const scaleX = mw / MAP_W;
        const scaleY = mh / MAP_H;

        mctx.fillStyle = 'rgba(0,0,0,0.8)';
        mctx.fillRect(0, 0, mw, mh);

        // Draw tiles
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const tile = dungeon.map[y][x];
                if (tile === TILE.VOID) continue;
                const mx = x * scaleX;
                const my = y * scaleY;
                switch (tile) {
                    case TILE.WALL:
                        mctx.fillStyle = 'rgba(100,90,70,0.5)';
                        break;
                    case TILE.STAIRS_DOWN:
                        mctx.fillStyle = '#ffd700';
                        break;
                    case TILE.BOSS_DOOR:
                        mctx.fillStyle = '#ff4444';
                        break;
                    case TILE.CHEST:
                        mctx.fillStyle = '#daa520';
                        break;
                    default:
                        mctx.fillStyle = 'rgba(80,70,55,0.35)';
                        break;
                }
                mctx.fillRect(mx, my, Math.ceil(scaleX), Math.ceil(scaleY));
            }
        }

        // Player dot
        const ptx = (playerX / TILE_SIZE) * scaleX;
        const pty = (playerY / TILE_SIZE) * scaleY;
        mctx.fillStyle = '#4488ff';
        mctx.fillRect(ptx - 2, pty - 2, 4, 4);
        // Blink effect
        if (Math.sin(performance.now() / 200) > 0) {
            mctx.fillStyle = 'rgba(68,136,255,0.3)';
            mctx.fillRect(ptx - 4, pty - 4, 8, 8);
        }

        // Allies
        if (allies) {
            for (const ally of allies) {
                const ax = (ally.x / TILE_SIZE) * scaleX;
                const ay = (ally.y / TILE_SIZE) * scaleY;
                mctx.fillStyle = '#44cc66';
                mctx.fillRect(ax - 2, ay - 2, 4, 4);
            }
        }

        // Enemy dots
        const enemies = typeof Enemies !== 'undefined' ? Enemies.getEnemies() : [];
        for (const e of enemies) {
            const ex = (e.x / TILE_SIZE) * scaleX;
            const ey = (e.y / TILE_SIZE) * scaleY;
            mctx.fillStyle = e.isBoss ? '#ff4444' : 'rgba(255,80,60,0.6)';
            const dotSize = e.isBoss ? 4 : 2;
            mctx.fillRect(ex - dotSize/2, ey - dotSize/2, dotSize, dotSize);
        }

        // Border
        mctx.strokeStyle = 'rgba(255,215,0,0.3)';
        mctx.lineWidth = 1;
        mctx.strokeRect(0, 0, mw, mh);

        // Camera viewport indicator
        const viewW = 960 / ZOOM;
        const viewH = 540 / ZOOM;
        const cvx = (camera.x / TILE_SIZE) * scaleX;
        const cvy = (camera.y / TILE_SIZE) * scaleY;
        const cvw = (viewW / TILE_SIZE) * scaleX;
        const cvh = (viewH / TILE_SIZE) * scaleY;
        mctx.strokeStyle = 'rgba(255,255,255,0.25)';
        mctx.lineWidth = 1;
        mctx.strokeRect(cvx, cvy, cvw, cvh);
    }

    // Convert screen coords to world coords (accounting for zoom)
    function screenToWorld(screenX, screenY) {
        return {
            x: screenX / ZOOM + camera.x,
            y: screenY / ZOOM + camera.y,
        };
    }

    // Convert world coords to screen coords
    function worldToScreen(worldX, worldY) {
        return {
            x: (worldX - camera.x) * ZOOM,
            y: (worldY - camera.y) * ZOOM,
        };
    }

    return {
        TILE, FLOOR_THEMES, FLOOR_ORDER, TILE_SIZE, MAP_W, MAP_H, ZOOM,
        generate, preRender, render, updateCamera, tileAt, isWalkable, isWalkableBox,
        getCamera: () => camera,
        renderMinimap, screenToWorld, worldToScreen,
    };
})();
