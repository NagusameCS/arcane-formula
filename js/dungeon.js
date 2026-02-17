// -----------------------------------------
//  DUNGEON SYSTEM -- Procedural generation, rendering, minimap
//  Ported and adapted from Into-The-Deluge
//  v3: zoom support, better collision, minimap, seeded PRNG for co-op sync
// -----------------------------------------

const Dungeon = (() => {
    // ── Seeded PRNG for deterministic dungeon generation ──
    let _seed = 1;
    function seedRandom(s) { _seed = s | 0 || 1; }
    function sRand() {
        _seed = (_seed * 16807 + 0) % 2147483647;
        return (_seed & 0x7fffffff) / 2147483647;
    }
    function sRandInt(max) { return Math.floor(sRand() * max); }
    const TILE = {
        VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3,
        STAIRS_DOWN: 4, CHEST: 5, TRAP: 6,
        TORCH_LIT: 7, BOSS_DOOR: 8, SPAWN: 9,
        SWITCH_OFF: 10, SWITCH_ON: 11, GATE_CLOSED: 12, GATE_OPEN: 13,
        MINIBOSS_SPAWN: 14,
        PORTAL_A: 15, PORTAL_B: 16, // Non-Euclidean portal pairs
        PRESSURE_PLATE: 17, CRACKED_FLOOR: 18, SPIKE_TRAP: 19,
        RUNE_TILE: 20, // Puzzle rune (step in sequence)
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
            enemies: ['shade', 'cerberus_pup', 'fury', 'blink_imp'],
            boss: 'Lord Thanatos',
        },
        jungle: {
            name: 'Verdant Depths',
            void: '#040a04', floor: '#2a3a2a', wall: '#3a4a3a',
            door: '#228b22', accent: '#32cd32', highlight: '#7cfc00',
            enemies: ['vine_creep', 'spore_bloom', 'jungle_wyrm', 'shaman'],
            boss: 'Elder Thornback',
        },
        light: {
            name: 'Sanctum of Light',
            void: '#0a0a08', floor: '#e8e8e0', wall: '#d4d4cc',
            door: '#ffd700', accent: '#fff8dc', highlight: '#ffffff',
            enemies: ['sentinel', 'radiant_golem', 'seraph', 'mirror_knight'],
            boss: 'Archon Solaris',
        },
        cyber: {
            name: 'Neon Abyss',
            void: '#020208', floor: '#3a3a3a', wall: '#4a4a4a',
            door: '#00bfff', accent: '#00ffff', highlight: '#7df9ff',
            enemies: ['drone', 'turret', 'virus', 'charger'],
            boss: 'Core Override',
        },
        stone: {
            name: 'Forgotten Catacombs',
            void: '#060508', floor: '#3a3540', wall: '#4a4550',
            door: '#8a7aa0', accent: '#9b59b6', highlight: '#d8bfd8',
            enemies: ['skeleton', 'wraith', 'gargoyle', 'necro_acolyte'],
            boss: 'Lich King Morthul',
        },
    };

    const FLOOR_ORDER = ['egypt', 'hades', 'jungle', 'light', 'cyber', 'stone'];

    const MAP_W = 120, MAP_H = 90;
    const TILE_SIZE = 16;
    const MIN_ROOM = 6, MAX_ROOM = 16;
    const BOSS_ROOM_SIZE = 22;
    const ZOOM = 2.0; // Camera zoom factor
    const GRID_COLS = 4, GRID_ROWS = 4; // Bigger grid for more rooms

    // Portal link registry: { pairId: { a: {tx,ty}, b: {tx,ty} } }
    let portalLinks = {};

    // -- GENERATOR --
    function generate(floorIndex) {
        // Seed PRNG so co-op clients generate identical dungeons
        seedRandom(floorIndex * 48271 + 12345);
        const theme = FLOOR_THEMES[FLOOR_ORDER[floorIndex % FLOOR_ORDER.length]];
        const map = [];
        for (let y = 0; y < MAP_H; y++) {
            map[y] = [];
            for (let x = 0; x < MAP_W; x++) map[y][x] = TILE.VOID;
        }

        const rooms = [];
        const spawnPoints = [];
        portalLinks = {};

        // Generate rooms using NxN grid placement
        const cellW = Math.floor(MAP_W / GRID_COLS);
        const cellH = Math.floor(MAP_H / GRID_ROWS);

        // Reserve one cell for boss (center-ish)
        const bossCX = Math.floor(GRID_COLS / 2);
        const bossCY = Math.floor(GRID_ROWS / 2);

        for (let cy = 0; cy < GRID_ROWS; cy++) {
            for (let cx = 0; cx < GRID_COLS; cx++) {
                if (cx === bossCX && cy === bossCY) continue; // Reserve for boss
                if (sRand() < 0.1 && rooms.length >= 8) continue; // Occasional skip

                // Sometimes make L-shaped or irregular rooms
                const shapeRoll = sRand();
                if (shapeRoll < 0.2 && rooms.length > 2) {
                    // L-shaped room: two overlapping rects
                    const rw1 = MIN_ROOM + Math.floor(sRand() * (MAX_ROOM - MIN_ROOM - 2));
                    const rh1 = MIN_ROOM + Math.floor(sRand() * 4);
                    const rw2 = MIN_ROOM + Math.floor(sRand() * 4);
                    const rh2 = MIN_ROOM + Math.floor(sRand() * (MAX_ROOM - MIN_ROOM - 2));
                    const rx = cx * cellW + 2 + Math.floor(sRand() * Math.max(1, cellW - Math.max(rw1, rw2) - 4));
                    const ry = cy * cellH + 2 + Math.floor(sRand() * Math.max(1, cellH - Math.max(rh1, rh2) - 4));
                    if (rx < 1 || ry < 1 || rx + Math.max(rw1, rw2) >= MAP_W - 1 || ry + Math.max(rh1, rh2) >= MAP_H - 1) {
                        // Fallback to normal room
                        const rw = MIN_ROOM + Math.floor(sRand() * (MAX_ROOM - MIN_ROOM));
                        const rh = MIN_ROOM + Math.floor(sRand() * (MAX_ROOM - MIN_ROOM));
                        const rx2 = cx * cellW + 2 + Math.floor(sRand() * Math.max(1, cellW - rw - 4));
                        const ry2 = cy * cellH + 2 + Math.floor(sRand() * Math.max(1, cellH - rh - 4));
                        if (rx2 >= 1 && ry2 >= 1 && rx2 + rw < MAP_W - 1 && ry2 + rh < MAP_H - 1) {
                            const room = { x: rx2, y: ry2, w: rw, h: rh, cx: rx2 + Math.floor(rw/2), cy: ry2 + Math.floor(rh/2) };
                            rooms.push(room);
                            carveRoom(map, room);
                        }
                    } else {
                        const room1 = { x: rx, y: ry, w: rw1, h: rh1 };
                        const room2 = { x: rx, y: ry, w: rw2, h: rh2 };
                        carveRoom(map, room1);
                        carveRoom(map, room2);
                        const combined = {
                            x: rx, y: ry,
                            w: Math.max(rw1, rw2), h: Math.max(rh1, rh2),
                            cx: rx + Math.floor(Math.max(rw1, rw2) / 2),
                            cy: ry + Math.floor(Math.max(rh1, rh2) / 2),
                        };
                        rooms.push(combined);
                    }
                } else {
                    // Normal rectangular room
                    const rw = MIN_ROOM + Math.floor(sRand() * (MAX_ROOM - MIN_ROOM));
                    const rh = MIN_ROOM + Math.floor(sRand() * (MAX_ROOM - MIN_ROOM));
                    const rx = cx * cellW + 2 + Math.floor(sRand() * Math.max(1, cellW - rw - 4));
                    const ry = cy * cellH + 2 + Math.floor(sRand() * Math.max(1, cellH - rh - 4));

                    if (rx < 1 || ry < 1 || rx + rw >= MAP_W - 1 || ry + rh >= MAP_H - 1) continue;

                    const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + Math.floor(rw/2), cy: ry + Math.floor(rh/2) };
                    rooms.push(room);
                    carveRoom(map, room);
                }
            }
        }

        // Boss room in center
        const bossRoom = {
            x: bossCX * cellW + Math.floor(cellW/2) - Math.floor(BOSS_ROOM_SIZE/2),
            y: bossCY * cellH + Math.floor(cellH/2) - Math.floor(BOSS_ROOM_SIZE/2),
            w: BOSS_ROOM_SIZE, h: BOSS_ROOM_SIZE,
            cx: bossCX * cellW + Math.floor(cellW/2),
            cy: bossCY * cellH + Math.floor(cellH/2),
            isBoss: true,
        };
        rooms.push(bossRoom);
        carveRoom(map, bossRoom);

        // Connect rooms with corridors (MST-like: connect each to nearest unconnected)
        const connected = [0];
        const unconnected = rooms.map((_, i) => i).slice(1);
        while (unconnected.length > 0) {
            let bestDist = Infinity, bestC = 0, bestU = 0, bestUI = 0;
            for (const ci of connected) {
                for (let ui = 0; ui < unconnected.length; ui++) {
                    const ri = unconnected[ui];
                    const dx = rooms[ci].cx - rooms[ri].cx;
                    const dy = rooms[ci].cy - rooms[ri].cy;
                    const d = dx * dx + dy * dy;
                    if (d < bestDist) { bestDist = d; bestC = ci; bestU = ri; bestUI = ui; }
                }
            }
            connectRooms(map, rooms[bestC], rooms[bestU]);
            connected.push(bestU);
            unconnected.splice(bestUI, 1);
        }

        // Extra connections for loops (more than before for larger map)
        const extraCorridors = 4 + Math.floor(sRand() * 4);
        for (let i = 0; i < extraCorridors; i++) {
            const a = rooms[Math.floor(sRand() * rooms.length)];
            const b = rooms[Math.floor(sRand() * rooms.length)];
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
                if (sRand() < 0.5 && map[ty] && map[ty][tx] === TILE.FLOOR) {
                    map[ty][tx] = TILE.TORCH_LIT;
                }
            }

            // Chests
            if (sRand() < 0.35) {
                const cx = room.x + 2 + Math.floor(sRand() * (room.w - 4));
                const cy = room.y + 2 + Math.floor(sRand() * (room.h - 4));
                if (map[cy] && map[cy][cx] === TILE.FLOOR) map[cy][cx] = TILE.CHEST;
            }

            // Traps (more variety)
            if (sRand() < 0.35) {
                const trapCount = 2 + Math.floor(sRand() * 4);
                for (let t = 0; t < trapCount; t++) {
                    const tx = room.x + 1 + Math.floor(sRand() * (room.w - 2));
                    const ty = room.y + 1 + Math.floor(sRand() * (room.h - 2));
                    if (map[ty] && map[ty][tx] === TILE.FLOOR) {
                        map[ty][tx] = sRand() < 0.4 ? TILE.SPIKE_TRAP : TILE.TRAP;
                    }
                }
            }

            // Cracked floor (environmental hazard)
            if (sRand() < 0.15) {
                const crackCount = 2 + Math.floor(sRand() * 3);
                for (let c = 0; c < crackCount; c++) {
                    const cx = room.x + 1 + Math.floor(sRand() * (room.w - 2));
                    const cy = room.y + 1 + Math.floor(sRand() * (room.h - 2));
                    if (map[cy] && map[cy][cx] === TILE.FLOOR) map[cy][cx] = TILE.CRACKED_FLOOR;
                }
            }

            // Enemy spawn points -- scaled to room size
            const minEnemies = Math.max(2, Math.floor(area / 25));
            const maxEnemies = Math.max(3, Math.floor(area / 12));
            const count = minEnemies + Math.floor(sRand() * (maxEnemies - minEnemies + 1));
            for (let e = 0; e < count; e++) {
                spawnPoints.push({
                    x: room.x + 2 + Math.floor(sRand() * (room.w - 4)),
                    y: room.y + 2 + Math.floor(sRand() * (room.h - 4)),
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

        // ── PUZZLE ROOMS (much improved variety) ──
        const puzzleRooms = [];
        const normalRooms = rooms.filter(r => !r.isBoss && r !== startRoom && r !== exitRoom);
        const puzzleCount = Math.min(4, Math.max(2, Math.floor(normalRooms.length / 3)));
        const shuffled = normalRooms.sort(() => sRand() - 0.5);

        const PUZZLE_TYPES = ['switch_gate', 'multi_switch', 'pressure_sequence', 'trap_gauntlet', 'rune_order'];

        for (let pi = 0; pi < puzzleCount && pi < shuffled.length; pi++) {
            const pr = shuffled[pi];
            pr.isPuzzle = true;
            const puzzleType = PUZZLE_TYPES[Math.floor(sRand() * PUZZLE_TYPES.length)];
            pr.puzzleType = puzzleType;
            puzzleRooms.push(pr);

            switch (puzzleType) {
                case 'switch_gate': {
                    // Classic: hit switch to open gate blocking reward
                    const switchX = pr.x + 1;
                    const switchY = pr.y + Math.floor(pr.h / 2);
                    if (map[switchY] && map[switchY][switchX] === TILE.FLOOR) {
                        map[switchY][switchX] = TILE.SWITCH_OFF;
                    }
                    const gateX = pr.x + pr.w - 2;
                    const gateY = pr.y + Math.floor(pr.h / 2);
                    if (map[gateY] && map[gateY][gateX] === TILE.FLOOR) {
                        map[gateY][gateX] = TILE.GATE_CLOSED;
                    }
                    const rewardX = pr.x + pr.w - 2;
                    const rewardY = pr.y + Math.floor(pr.h / 2) - 1;
                    if (map[rewardY] && map[rewardY][rewardX] === TILE.FLOOR) {
                        map[rewardY][rewardX] = TILE.CHEST;
                    }
                    break;
                }
                case 'multi_switch': {
                    // Multiple switches (2-3) all must be ON to open gate
                    const switchCount = 2 + Math.floor(sRand() * 2);
                    pr.requiredSwitches = switchCount;
                    pr.switchesActivated = 0;
                    for (let si = 0; si < switchCount; si++) {
                        const sx = pr.x + 1 + Math.floor(sRand() * (pr.w - 3));
                        const sy = pr.y + 1 + Math.floor(sRand() * (pr.h - 3));
                        if (map[sy] && map[sy][sx] === TILE.FLOOR) {
                            map[sy][sx] = TILE.SWITCH_OFF;
                        }
                    }
                    const gateX = pr.x + pr.w - 2;
                    const gateY = pr.y + Math.floor(pr.h / 2);
                    if (map[gateY] && map[gateY][gateX] === TILE.FLOOR) {
                        map[gateY][gateX] = TILE.GATE_CLOSED;
                    }
                    const rX = pr.x + pr.w - 2;
                    const rY = pr.y + Math.floor(pr.h / 2) - 1;
                    if (map[rY] && map[rY][rX] === TILE.FLOOR) map[rY][rX] = TILE.CHEST;
                    break;
                }
                case 'pressure_sequence': {
                    // Step on pressure plates in order (marked 1,2,3)
                    pr.plateSequence = [];
                    pr.plateProgress = 0;
                    const plateCount = 3;
                    for (let pi2 = 0; pi2 < plateCount; pi2++) {
                        const px = pr.x + 2 + Math.floor(sRand() * (pr.w - 4));
                        const py = pr.y + 2 + Math.floor(sRand() * (pr.h - 4));
                        if (map[py] && map[py][px] === TILE.FLOOR) {
                            map[py][px] = TILE.PRESSURE_PLATE;
                            pr.plateSequence.push({ x: px, y: py, order: pi2 + 1 });
                        }
                    }
                    // Reward chest
                    const rX = pr.x + Math.floor(pr.w / 2);
                    const rY = pr.y + 1;
                    if (map[rY] && map[rY][rX] === TILE.FLOOR) {
                        map[rY][rX] = TILE.GATE_CLOSED;
                    }
                    if (map[rY - 1] && rY - 1 >= pr.y && map[rY - 1][rX] === TILE.FLOOR) {
                        // place chest just above gate if room allows, else below
                    }
                    const crX = pr.x + Math.floor(pr.w / 2) + 1;
                    const crY = pr.y + 1;
                    if (map[crY] && map[crY][crX] === TILE.FLOOR) map[crY][crX] = TILE.CHEST;
                    break;
                }
                case 'trap_gauntlet': {
                    // Room filled with spike traps with a reward at the end
                    for (let ty = pr.y + 1; ty < pr.y + pr.h - 1; ty++) {
                        for (let tx = pr.x + 1; tx < pr.x + pr.w - 1; tx++) {
                            if (map[ty] && map[ty][tx] === TILE.FLOOR && sRand() < 0.4) {
                                map[ty][tx] = TILE.SPIKE_TRAP;
                            }
                        }
                    }
                    // Clear a narrow safe path
                    const pathY = pr.y + Math.floor(pr.h / 2);
                    for (let tx = pr.x + 1; tx < pr.x + pr.w - 1; tx++) {
                        if (map[pathY] && map[pathY][tx] !== TILE.VOID) {
                            if (sRand() < 0.7) map[pathY][tx] = TILE.FLOOR;
                        }
                    }
                    // Reward
                    const rX = pr.x + pr.w - 2;
                    const rY = pr.y + Math.floor(pr.h / 2);
                    if (map[rY] && map[rY][rX] === TILE.FLOOR) map[rY][rX] = TILE.CHEST;
                    break;
                }
                case 'rune_order': {
                    // Rune tiles that must be stepped on — each lights up
                    pr.runesActivated = 0;
                    pr.totalRunes = 0;
                    const runeCount = 4 + Math.floor(sRand() * 3);
                    for (let ri = 0; ri < runeCount; ri++) {
                        const rx = pr.x + 2 + Math.floor(sRand() * (pr.w - 4));
                        const ry = pr.y + 2 + Math.floor(sRand() * (pr.h - 4));
                        if (map[ry] && map[ry][rx] === TILE.FLOOR) {
                            map[ry][rx] = TILE.RUNE_TILE;
                            pr.totalRunes++;
                        }
                    }
                    // Gate + chest
                    const gx = pr.x + Math.floor(pr.w / 2);
                    const gy = pr.y + pr.h - 2;
                    if (map[gy] && map[gy][gx] === TILE.FLOOR) map[gy][gx] = TILE.GATE_CLOSED;
                    if (map[gy] && map[gy][gx + 1] === TILE.FLOOR) map[gy][gx + 1] = TILE.CHEST;
                    break;
                }
            }
        }

        // ── MINIBOSS ROOMS ──
        const mbCandidates = normalRooms.filter(r => !r.isPuzzle);
        const mbCount = Math.min(2, Math.max(1, Math.floor(mbCandidates.length / 4)));
        for (let mi = 0; mi < mbCount && mi < mbCandidates.length; mi++) {
            const mbRoom = mbCandidates[Math.floor(sRand() * mbCandidates.length)];
            if (mbRoom.isMiniboss) continue;
            mbRoom.isMiniboss = true;
            if (map[mbRoom.cy] && map[mbRoom.cy][mbRoom.cx] === TILE.FLOOR) {
                map[mbRoom.cy][mbRoom.cx] = TILE.MINIBOSS_SPAWN;
            }
            spawnPoints.push({ x: mbRoom.cx, y: mbRoom.cy, type: 'miniboss' });
            const lootX = mbRoom.x + Math.floor(mbRoom.w / 2) + 1;
            const lootY = mbRoom.y + Math.floor(mbRoom.h / 2) + 1;
            if (map[lootY] && map[lootY][lootX] === TILE.FLOOR) {
                map[lootY][lootX] = TILE.CHEST;
            }
        }

        // ── NON-EUCLIDEAN PORTALS ──
        // Place portal pairs that connect distant parts of the map
        const portalPairCount = 2 + Math.floor(sRand() * 2); // 2-3 portal pairs
        const portalCandidates = rooms.filter(r => !r.isBoss && !r.isPuzzle && !r.isMiniboss && r !== startRoom);
        for (let pp = 0; pp < portalPairCount && portalCandidates.length >= 2; pp++) {
            // Pick two distant rooms
            let bestPair = null, bestDist = 0;
            for (let tries = 0; tries < 10; tries++) {
                const ia = Math.floor(sRand() * portalCandidates.length);
                const ib = Math.floor(sRand() * portalCandidates.length);
                if (ia === ib) continue;
                const ra = portalCandidates[ia], rb = portalCandidates[ib];
                const dx = ra.cx - rb.cx, dy = ra.cy - rb.cy;
                const d = dx * dx + dy * dy;
                if (d > bestDist) { bestDist = d; bestPair = [ia, ib]; }
            }
            if (!bestPair) continue;
            const rA = portalCandidates[bestPair[0]];
            const rB = portalCandidates[bestPair[1]];
            // Place portal tiles
            const pax = rA.x + 1 + Math.floor(sRand() * (rA.w - 3));
            const pay = rA.y + 1 + Math.floor(sRand() * (rA.h - 3));
            const pbx = rB.x + 1 + Math.floor(sRand() * (rB.w - 3));
            const pby = rB.y + 1 + Math.floor(sRand() * (rB.h - 3));
            if (map[pay] && map[pay][pax] === TILE.FLOOR && map[pby] && map[pby][pbx] === TILE.FLOOR) {
                map[pay][pax] = TILE.PORTAL_A;
                map[pby][pbx] = TILE.PORTAL_B;
                portalLinks[pp] = {
                    a: { tx: pax, ty: pay },
                    b: { tx: pbx, ty: pby },
                };
            }
            // Remove used rooms from candidates
            portalCandidates.splice(Math.max(bestPair[0], bestPair[1]), 1);
            portalCandidates.splice(Math.min(bestPair[0], bestPair[1]), 1);
        }

        return {
            map, rooms, spawnPoints, theme, floorIndex,
            startX: startRoom.cx, startY: startRoom.cy,
            bossRoom, puzzleRooms, portalLinks,
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
            case TILE.SWITCH_OFF:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.fillStyle = '#666';
                ctx.fillRect(px + 3, py + 3, S - 6, S - 6);
                ctx.fillStyle = '#884444';
                ctx.fillRect(px + 5, py + 5, S - 10, S - 10);
                // Red indicator dot
                ctx.fillStyle = '#ff2222';
                ctx.fillRect(px + S/2 - 1, py + S/2 - 1, 2, 2);
                break;
            case TILE.SWITCH_ON:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.fillStyle = '#666';
                ctx.fillRect(px + 3, py + 3, S - 6, S - 6);
                ctx.fillStyle = '#448844';
                ctx.fillRect(px + 5, py + 5, S - 10, S - 10);
                // Green indicator dot
                ctx.fillStyle = '#22ff22';
                ctx.fillRect(px + S/2 - 1, py + S/2 - 1, 2, 2);
                // Glow
                ctx.globalAlpha = 0.08;
                ctx.fillStyle = '#22ff22';
                ctx.fillRect(px - S, py - S, S * 3, S * 3);
                ctx.globalAlpha = 1;
                break;
            case TILE.GATE_CLOSED:
                ctx.fillStyle = theme.wall;
                ctx.fillRect(px, py, S, S);
                ctx.fillStyle = '#aa4444';
                ctx.fillRect(px + 2, py, S - 4, S);
                // Iron bars
                for (let b = 3; b < S - 3; b += 3) {
                    ctx.fillStyle = '#666';
                    ctx.fillRect(px + b, py, 1, S);
                }
                break;
            case TILE.GATE_OPEN:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.globalAlpha = 0.15;
                ctx.fillStyle = '#448844';
                ctx.fillRect(px, py, S, S);
                ctx.globalAlpha = 1;
                break;
            case TILE.MINIBOSS_SPAWN:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                // Skull marker
                ctx.globalAlpha = 0.2;
                ctx.fillStyle = '#ff4444';
                ctx.fillRect(px + 2, py + 2, S - 4, S - 4);
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#fff';
                ctx.fillRect(px + 4, py + 4, 3, 2);
                ctx.fillRect(px + S - 7, py + 4, 3, 2);
                ctx.fillRect(px + 5, py + 8, S - 10, 2);
                ctx.globalAlpha = 1;
                break;
            case TILE.PORTAL_A:
            case TILE.PORTAL_B: {
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                // Swirling portal effect
                const portalColor = tile === TILE.PORTAL_A ? '#8844ff' : '#ff44aa';
                const portalColor2 = tile === TILE.PORTAL_A ? '#aa66ff' : '#ff88cc';
                ctx.fillStyle = portalColor;
                ctx.globalAlpha = 0.6;
                ctx.fillRect(px + 2, py + 2, S - 4, S - 4);
                ctx.fillStyle = portalColor2;
                ctx.globalAlpha = 0.4;
                ctx.fillRect(px + 4, py + 4, S - 8, S - 8);
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.5;
                ctx.fillRect(px + S/2 - 1, py + S/2 - 1, 2, 2);
                // Glow
                ctx.globalAlpha = 0.08;
                ctx.fillStyle = portalColor;
                ctx.fillRect(px - S, py - S, S * 3, S * 3);
                ctx.globalAlpha = 1;
                break;
            }
            case TILE.PRESSURE_PLATE:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.fillStyle = '#aa8844';
                ctx.globalAlpha = 0.5;
                ctx.fillRect(px + 2, py + 2, S - 4, S - 4);
                ctx.fillStyle = '#ddbb66';
                ctx.globalAlpha = 0.6;
                ctx.fillRect(px + 3, py + 3, S - 6, S - 6);
                ctx.globalAlpha = 1;
                break;
            case TILE.CRACKED_FLOOR:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                ctx.globalAlpha = 0.3;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(px + 3, py + 2);
                ctx.lineTo(px + S/2, py + S/2);
                ctx.lineTo(px + S - 3, py + 4);
                ctx.moveTo(px + S/2, py + S/2);
                ctx.lineTo(px + 4, py + S - 3);
                ctx.stroke();
                ctx.globalAlpha = 1;
                break;
            case TILE.SPIKE_TRAP:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                // Spike pattern
                ctx.fillStyle = '#666';
                ctx.globalAlpha = 0.4;
                for (let sp = 0; sp < 4; sp++) {
                    const spx = px + 2 + (sp % 2) * (S - 6);
                    const spy = py + 2 + Math.floor(sp / 2) * (S - 6);
                    ctx.fillRect(spx, spy, 2, 2);
                }
                ctx.globalAlpha = 1;
                break;
            case TILE.RUNE_TILE:
                ctx.fillStyle = theme.floor;
                ctx.fillRect(px, py, S, S);
                // Arcane rune circle
                ctx.strokeStyle = theme.accent;
                ctx.globalAlpha = 0.4;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(px + S/2, py + S/2, S/2 - 2, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = theme.accent;
                ctx.globalAlpha = 0.15;
                ctx.fillRect(px + 3, py + 3, S - 6, S - 6);
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
               tile === TILE.SPAWN || tile === TILE.BOSS_DOOR ||
               tile === TILE.SWITCH_OFF || tile === TILE.SWITCH_ON ||
               tile === TILE.GATE_OPEN || tile === TILE.MINIBOSS_SPAWN ||
               tile === TILE.PORTAL_A || tile === TILE.PORTAL_B ||
               tile === TILE.PRESSURE_PLATE || tile === TILE.CRACKED_FLOOR ||
               tile === TILE.SPIKE_TRAP || tile === TILE.RUNE_TILE;
        // Note: GATE_CLOSED is NOT walkable (blocks passage)
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

    // Clamp a position to the nearest walkable tile
    // Used to unstick players who end up in walls
    function clampToWalkable(dungeon, px, py, radius) {
        if (isWalkableBox(dungeon, px, py, radius)) return { x: px, y: py };
        // Search in expanding rings for a walkable tile
        for (let r = 1; r <= 5; r++) {
            const step = TILE_SIZE * r;
            const offsets = [
                [0, -step], [0, step], [-step, 0], [step, 0],
                [-step, -step], [step, -step], [-step, step], [step, step],
            ];
            for (const [ox, oy] of offsets) {
                const nx = px + ox, ny = py + oy;
                if (isWalkableBox(dungeon, nx, ny, radius)) return { x: nx, y: ny };
            }
        }
        // Last resort: teleport to dungeon start
        return {
            x: dungeon.startX * TILE_SIZE + TILE_SIZE / 2,
            y: dungeon.startY * TILE_SIZE + TILE_SIZE / 2,
        };
    }

    // Enforce world bounds (cannot leave the dungeon map area)
    function enforceWorldBounds(px, py, dungeon) {
        const margin = TILE_SIZE;
        return {
            x: Math.max(margin, Math.min(dungeon.pixelW - margin, px)),
            y: Math.max(margin, Math.min(dungeon.pixelH - margin, py)),
        };
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
                    case TILE.PORTAL_A:
                        mctx.fillStyle = '#8844ff';
                        break;
                    case TILE.PORTAL_B:
                        mctx.fillStyle = '#ff44aa';
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

    // ── PUZZLE SWITCH TOGGLE ──
    function toggleSwitch(dungeon, tx, ty) {
        if (!dungeon.map[ty] || dungeon.map[ty][tx] !== TILE.SWITCH_OFF) return false;
        dungeon.map[ty][tx] = TILE.SWITCH_ON;
        // Find which puzzle room this switch belongs to
        for (const room of dungeon.rooms) {
            if (room.isPuzzle && tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h) {
                if (room.puzzleType === 'multi_switch') {
                    // Count all switches that are ON in this room
                    let onCount = 0;
                    for (let gy = room.y; gy < room.y + room.h; gy++) {
                        for (let gx = room.x; gx < room.x + room.w; gx++) {
                            if (dungeon.map[gy][gx] === TILE.SWITCH_ON) onCount++;
                        }
                    }
                    // Only open gates when ALL switches are activated
                    if (onCount >= (room.requiredSwitches || 2)) {
                        for (let gy = room.y; gy < room.y + room.h; gy++) {
                            for (let gx = room.x; gx < room.x + room.w; gx++) {
                                if (dungeon.map[gy][gx] === TILE.GATE_CLOSED) {
                                    dungeon.map[gy][gx] = TILE.GATE_OPEN;
                                }
                            }
                        }
                    }
                } else {
                    // Normal single switch: open all gates in room
                    for (let gy = room.y; gy < room.y + room.h; gy++) {
                        for (let gx = room.x; gx < room.x + room.w; gx++) {
                            if (dungeon.map[gy][gx] === TILE.GATE_CLOSED) {
                                dungeon.map[gy][gx] = TILE.GATE_OPEN;
                            }
                        }
                    }
                }
                preRender(dungeon);
                return true;
            }
        }
        preRender(dungeon);
        return true;
    }

    // ── RUNE TILE ACTIVATION ──
    function activateRune(dungeon, tx, ty) {
        if (!dungeon.map[ty] || dungeon.map[ty][tx] !== TILE.RUNE_TILE) return false;
        dungeon.map[ty][tx] = TILE.FLOOR; // "Light up" by becoming floor
        for (const room of dungeon.rooms) {
            if (room.isPuzzle && room.puzzleType === 'rune_order' &&
                tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h) {
                room.runesActivated = (room.runesActivated || 0) + 1;
                if (room.runesActivated >= (room.totalRunes || 1)) {
                    // All runes activated — open gates
                    for (let gy = room.y; gy < room.y + room.h; gy++) {
                        for (let gx = room.x; gx < room.x + room.w; gx++) {
                            if (dungeon.map[gy][gx] === TILE.GATE_CLOSED) {
                                dungeon.map[gy][gx] = TILE.GATE_OPEN;
                            }
                        }
                    }
                }
                preRender(dungeon);
                return true;
            }
        }
        preRender(dungeon);
        return true;
    }

    // ── PRESSURE PLATE HANDLING ──
    function stepOnPlate(dungeon, tx, ty) {
        if (!dungeon.map[ty] || dungeon.map[ty][tx] !== TILE.PRESSURE_PLATE) return false;
        for (const room of dungeon.rooms) {
            if (room.isPuzzle && room.puzzleType === 'pressure_sequence' &&
                tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h) {
                if (!room.plateSequence) break;
                const nextIdx = room.plateProgress || 0;
                const expected = room.plateSequence[nextIdx];
                if (expected && expected.x === tx && expected.y === ty) {
                    room.plateProgress = nextIdx + 1;
                    dungeon.map[ty][tx] = TILE.FLOOR; // Plate depressed
                    if (room.plateProgress >= room.plateSequence.length) {
                        // Open gates
                        for (let gy = room.y; gy < room.y + room.h; gy++) {
                            for (let gx = room.x; gx < room.x + room.w; gx++) {
                                if (dungeon.map[gy][gx] === TILE.GATE_CLOSED) {
                                    dungeon.map[gy][gx] = TILE.GATE_OPEN;
                                }
                            }
                        }
                    }
                    preRender(dungeon);
                    return true;
                } else {
                    // Wrong order: reset all plates
                    room.plateProgress = 0;
                    for (const p of room.plateSequence) {
                        if (dungeon.map[p.y] && dungeon.map[p.y][p.x] === TILE.FLOOR) {
                            dungeon.map[p.y][p.x] = TILE.PRESSURE_PLATE;
                        }
                    }
                    preRender(dungeon);
                    return false;
                }
            }
        }
        return false;
    }

    // ── PORTAL TELEPORT ──
    function checkPortal(dungeon, px, py) {
        const tx = Math.floor(px / TILE_SIZE);
        const ty = Math.floor(py / TILE_SIZE);
        const tile = tileAt(dungeon, tx, ty);
        if (tile !== TILE.PORTAL_A && tile !== TILE.PORTAL_B) return null;
        const links = dungeon.portalLinks || portalLinks;
        for (const pair of Object.values(links)) {
            if (pair.a.tx === tx && pair.a.ty === ty) {
                return { x: pair.b.tx * TILE_SIZE + TILE_SIZE / 2, y: pair.b.ty * TILE_SIZE + TILE_SIZE / 2 };
            }
            if (pair.b.tx === tx && pair.b.ty === ty) {
                return { x: pair.a.tx * TILE_SIZE + TILE_SIZE / 2, y: pair.a.ty * TILE_SIZE + TILE_SIZE / 2 };
            }
        }
        return null;
    }

    // ── MINIBOSS CREATION ──
    function getMinibossData(theme, difficulty) {
        const mbTypes = {
            egypt:  { name: 'Cursed Pharaoh Guard', hp: 150, speed: 55, size: 18, color: '#ffcc00', dmg: 18, behavior: 'dodge', xp: 100 },
            hades:  { name: 'Infernal Warden', hp: 180, speed: 65, size: 18, color: '#ff2200', dmg: 22, behavior: 'charge', xp: 120 },
            jungle: { name: 'Ancient Treant', hp: 200, speed: 30, size: 22, color: '#1a5a1a', dmg: 15, behavior: 'summon', xp: 130 },
            light:  { name: 'Fallen Seraph', hp: 160, speed: 80, size: 16, color: '#ffffcc', dmg: 20, behavior: 'teleport', xp: 110 },
            cyber:  { name: 'Rogue Protocol', hp: 140, speed: 90, size: 16, color: '#00ffaa', dmg: 16, behavior: 'strafe', xp: 100 },
            stone:  { name: 'Bone Colossus', hp: 250, speed: 35, size: 24, color: '#887766', dmg: 25, behavior: 'guard', xp: 150 },
        };
        const themeKey = Object.keys(Dungeon.FLOOR_THEMES).find(k => Dungeon.FLOOR_THEMES[k] === theme) || 'stone';
        const mb = mbTypes[themeKey] || mbTypes.stone;
        return {
            ...mb,
            hp: Math.floor(mb.hp * difficulty),
            dmg: Math.floor(mb.dmg * difficulty),
        };
    }

    return {
        TILE, FLOOR_THEMES, FLOOR_ORDER, TILE_SIZE, MAP_W, MAP_H, ZOOM,
        generate, preRender, render, updateCamera, tileAt, isWalkable, isWalkableBox,
        clampToWalkable, enforceWorldBounds,
        toggleSwitch, activateRune, stepOnPlate, checkPortal, getMinibossData,
        getCamera: () => camera,
        renderMinimap, screenToWorld, worldToScreen,
    };
})();
