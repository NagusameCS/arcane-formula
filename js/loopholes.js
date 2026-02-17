// ═══════════════════════════════════════════════════════════════════════
//  LOOPHOLE ENGINE — The Hidden Depths of the Arcane Formula System
//
//  This file documents 100+ "loopholes" in the magic system — creative
//  exploits of the formula engine that allow for space manipulation,
//  teleportation, cloning, time control, velocity hacks, mana abuse,
//  and reality-breaking effects.
//
//  Each loophole is a documented technique with a name, domain, and
//  explanation of how it works. The DEV SPELLS are proof-of-concept
//  implementations that demonstrate the loopholes in action.
//
//  Console command:  __arcane_dev()   — unlocks all dev spells
// ═══════════════════════════════════════════════════════════════════════

const Loopholes = (() => {
    const { n, v, op, fn } = Blocks;

    // ═══════════════════════════════════════════════════════════════
    //  THE LOOPHOLE REGISTRY — 100+ documented creative exploits
    //  Organized by domain. Each loophole describes a technique
    //  that players can use to create never-before-seen spells.
    // ═══════════════════════════════════════════════════════════════
    const REGISTRY = [
        // ═══════════════════════════════════════
        //  DOMAIN 1: SPACE MANIPULATION (1–13)
        // ═══════════════════════════════════════
        { id: 1,  domain: 'Space', name: 'Coordinate Warping',
          desc: 'Use warp(pos, amplitude, phase) to distort arcon positions with sinusoidal space-bending. Combine with t for animated distortions.',
          example: 'warp(player.x, 50, t * 3)' },
        { id: 2,  domain: 'Space', name: 'Spatial Folding',
          desc: 'fold(pos, period) wraps coordinates so arcons that fly off one edge reappear on the other, creating infinite-loop patterns.',
          example: 'fold(player.x + cos(aim) * 300 * t, 200)' },
        { id: 3,  domain: 'Space', name: 'Mirror Dimension',
          desc: 'mirror(pos, period) reflects coordinates, making arcons bounce back and forth in a confined space like a hall of mirrors.',
          example: 'mirror(player.x + cos(aim) * 400 * t, 300)' },
        { id: 4,  domain: 'Space', name: 'Polar Coordinate Abuse',
          desc: 'Use polar_x(cx, angle, radius) and polar_y() to define arcon positions in polar coordinates, enabling perfect circles, spirals, and flowers.',
          example: 'polar_x(player.x, i * 2 * pi / N + t * 3, 50 + t * 100)' },
        { id: 5,  domain: 'Space', name: 'Coordinate Swizzling',
          desc: 'swizzle(x, y, angle) rotates the entire coordinate system. Apply to make patterns that tumble and spin freely.',
          example: 'swizzle(cos(aim) * 200 * t, sin(aim) * 200 * t, t * 2)' },
        { id: 6,  domain: 'Space', name: 'Space Inflation',
          desc: 'inflate(radius, amount, time) creates pulsating space — arcon orbits that breathe in and out.',
          example: 'polar_x(player.x, i * 2 * pi / N, inflate(60, 0.5, t * 4))' },
        { id: 7,  domain: 'Space', name: 'Asymptotic Compression',
          desc: 'compress(pos, factor) squishes space so far-away arcons cluster together. Creates dense cores with sparse halos.',
          example: 'player.x + compress(cos(aim) * 300 * t, t * 2)' },
        { id: 8,  domain: 'Space', name: '4D Projection',
          desc: 'tesseract(base, amp, u, v) projects 4D coordinates into 2D. Feed t and i as the extra dimensions for alien geometries.',
          example: 'player.x + tesseract(0, 80, t * 2, i * 0.5)' },
        { id: 9,  domain: 'Space', name: 'Hyperplane Slicing',
          desc: 'hyperplane(x, angle, y) slices a 2D plane at an angle. Combine with time-varying angle for sweeping effects.',
          example: 'hyperplane(cos(aim) * 200 * t, t, sin(aim) * 200 * t) + player.x' },
        { id: 10, domain: 'Space', name: 'Gravity Well',
          desc: 'gravity_well(x, y, cx, cy, mass) creates inverse-square attraction. Place at cursor or enemy position for pulling arcons.',
          example: 'player.x + cos(aim) * 200 * t + gravity_well(px, py, cursor.x, cursor.y, 5000)' },
        { id: 11, domain: 'Space', name: 'Spiral Radius Hack',
          desc: 'spiral_r(angle, expansion) computes radius for Archimedean spirals. Feed i-based angles for expanding spiral arms.',
          example: 'polar_x(player.x, i * 0.5 + t * 3, spiral_r(i * 0.5, 5))' },
        { id: 12, domain: 'Space', name: 'Dual-Axis Mirror',
          desc: 'Combine mirror_x and mirror_y to create 4-fold symmetry. Every arcon produces 4 apparent copies.',
          example: 'Use mirror_x(x, center) on X formula and mirror_y(y, center) on Y' },
        { id: 13, domain: 'Space', name: 'Fractal Space',
          desc: 'Use mandelbrot(x, y) or julia(x, y, cr, ci) to warp arcon positions through fractal transforms. Reality shatters.',
          example: 'player.x + mandelbrot(i * 10, t * 50) * 200' },

        // ═══════════════════════════════════════
        //  DOMAIN 2: TELEPORTATION (14–25)
        // ═══════════════════════════════════════
        { id: 14, domain: 'Teleportation', name: 'Threshold Blink',
          desc: 'blink_to(from, to, t, threshold) teleports arcons from one position to another at a specific time. Instant relocation.',
          example: 'blink_to(player.x, enemy.x, t, 0.5)' },
        { id: 15, domain: 'Teleportation', name: 'Phase Shifting',
          desc: 'phase_shift(pos, offset, t, freq) makes arcons alternate between two positions rapidly. They appear to exist in two places.',
          example: 'phase_shift(player.x, 200, t, 8)' },
        { id: 16, domain: 'Teleportation', name: 'Quantum Superposition',
          desc: 'quantum_pos(posA, posB, t, freq) toggles arcon positions between two states. The arcon is both here and there.',
          example: 'quantum_pos(player.x, enemy.x, t, 5)' },
        { id: 17, domain: 'Teleportation', name: 'Portal Gate',
          desc: 'gate(posA, posB, t, period) swaps arcons between two positions cyclically. Creates a portal effect.',
          example: 'gate(player.x + cos(aim) * 100, cursor.x, t, 1)' },
        { id: 18, domain: 'Teleportation', name: 'Probability Scatter',
          desc: 'scatter_to(from, to) gives each arcon a random chance to teleport. Creates flickering ghost copies.',
          example: 'scatter_to(player.x + cos(aim) * 200 * t, cursor.x)' },
        { id: 19, domain: 'Teleportation', name: 'Sporadic Flicker',
          desc: 'flicker(pos, offset, t, freq) displaces arcons at irregular intervals. Makes spells look glitchy and unstable.',
          example: 'flicker(player.x + cos(aim) * 200 * t, 100, t, 12)' },
        { id: 20, domain: 'Teleportation', name: 'Spatial Rift',
          desc: 'rift(pos, center, radius, push) creates a tear in space that pushes arcons outward when they get close.',
          example: 'rift(player.x + cos(aim) * 200 * t, cursor.x, 30, 80)' },
        { id: 21, domain: 'Teleportation', name: 'Smooth Tunneling',
          desc: 'tunnel(from, to, t, freq) smoothly interpolates between two positions with sine-based tunneling.',
          example: 'tunnel(player.x, enemy.x, t, 2)' },
        { id: 22, domain: 'Teleportation', name: 'Cursor Warp',
          desc: 'Combine blink_to with cursor.x/cursor.y to teleport arcons to wherever the mouse is at a set time.',
          example: 'blink_to(player.x + cos(aim) * 200 * t, cursor.x, t, 0.3)' },
        { id: 23, domain: 'Teleportation', name: 'Chain Teleport',
          desc: 'Use select(floor(t*3), posA, posB, posC) to chain multiple teleport destinations in sequence.',
          example: 'select(floor(t * 3), player.x, cursor.x, enemy.x)' },
        { id: 24, domain: 'Teleportation', name: 'Delayed Arrival',
          desc: 'Combine emit delay with blink_to — arcons appear at player then instantly jump to enemy with staggered timing.',
          example: 'blink_to(player.x, enemy.x, t, i * 0.05)' },
        { id: 25, domain: 'Teleportation', name: 'Afterimage Trail',
          desc: 'Use echo(pos, amplitude, t, i) to create trailing afterimages — each arcon slightly delayed behind the previous.',
          example: 'echo(player.x + cos(aim) * 200 * t, 20, t, i)' },

        // ═══════════════════════════════════════
        //  DOMAIN 3: CLONING (26–36)
        // ═══════════════════════════════════════
        { id: 26, domain: 'Cloning', name: 'Group Cloning',
          desc: 'clone_offset(pos, spacing, i, groupSize, numClones) splits arcons into groups that replicate the same pattern offset.',
          example: 'clone_offset(player.x + cos(aim) * 200 * t, 80, i, 5, 4)' },
        { id: 27, domain: 'Cloning', name: 'Mirror Clone',
          desc: 'mirror_x(x, center) reflects positions across an axis. Fire a beam right and its mirror fires left.',
          example: 'Use mirror_x(beamX, player.x) for the X of half the arcons' },
        { id: 28, domain: 'Cloning', name: 'Phantom Circle',
          desc: 'phantom(pos, radius, angle, cloneId, total) places phantom copies in a circle. Use floor(i/group) as cloneId.',
          example: 'phantom(player.x, 60, aim, floor(i / 5), 4)' },
        { id: 29, domain: 'Cloning', name: 'Kaleidoscope',
          desc: 'kaleidoscope(pos, radius, i, groupSize, segments) creates rotational symmetry — 6-fold, 8-fold, etc.',
          example: 'player.x + kaleidoscope(0, 80 * t, i, 3, 6)' },
        { id: 30, domain: 'Cloning', name: 'Fractal Copies',
          desc: 'fractal_clone(pos, scale, ratio, depth) creates self-similar copies at different scales. Recursive feel.',
          example: 'fractal_clone(player.x, 50, 0.6, i)' },
        { id: 31, domain: 'Cloning', name: 'Temporal Echo',
          desc: 'echo(pos, amp, t, i) offsets each arcon in time, creating a trailing echo of the spell.',
          example: 'echo(player.x + cos(aim) * 300 * t, 30, t, i)' },
        { id: 32, domain: 'Cloning', name: 'Binary Split',
          desc: 'split(pos, i, 2, spacing) divides arcons into 2 mirrored groups with configurable gap.',
          example: 'split(player.x + cos(aim) * 200 * t, i, 2, 40)' },
        { id: 33, domain: 'Cloning', name: 'Triple Split',
          desc: 'split(pos, i, 3, spacing) creates 3 parallel spell copies. Trident of destruction.',
          example: 'split(player.x + cos(aim) * 200 * t, i, 3, 30)' },
        { id: 34, domain: 'Cloning', name: 'Spin Duplication',
          desc: 'Combine clone_offset with sin/cos to create rotated copies — copies at 0°, 90°, 180°, 270°.',
          example: 'clone_offset + cos(aim + floor(i/group) * pi/2) for each clone' },
        { id: 35, domain: 'Cloning', name: 'Holographic Burst',
          desc: 'Use split + phase_shift to create clones that blink in and out. Confusing to track.',
          example: 'split(phase_shift(baseX, 50, t, 6), i, 3, 40)' },
        { id: 36, domain: 'Cloning', name: 'Entangled Pairs',
          desc: 'entangle(posA, posB, center) creates quantum-entangled mirror copies. When one moves left, the other moves right.',
          example: 'spin(i, 1, 1) > 0 ? baseX : entangle(baseX, mirror_x(baseX, player.x), player.x)' },

        // ═══════════════════════════════════════
        //  DOMAIN 4: TIME MANIPULATION (37–49)
        // ═══════════════════════════════════════
        { id: 37, domain: 'Time', name: 'Time Dilation',
          desc: 'Replace t with timescale(t, factor) to speed up or slow down spell evolution. Factor 0.5 = half speed.',
          example: 'player.x + cos(aim) * 200 * timescale(t, 0.3)' },
        { id: 38, domain: 'Time', name: 'Time Reversal',
          desc: 'reverse_t(t, maxTime) makes arcons fly backwards. Spells retract instead of expanding.',
          example: 'player.x + cos(aim) * 200 * reverse_t(t, 3)' },
        { id: 39, domain: 'Time', name: 'Time Freeze',
          desc: 'freeze_at(t, freezeTime) caps time at a value. Arcons freeze in place after a duration.',
          example: 'player.x + cos(aim) * 200 * freeze_at(t, 0.5)' },
        { id: 40, domain: 'Time', name: 'Time Loop',
          desc: 'loop_t(t, period) wraps time cyclically. Arcons repeat their path forever in a loop.',
          example: 'player.x + cos(aim) * 200 * loop_t(t, 1)' },
        { id: 41, domain: 'Time', name: 'Ping-Pong Time',
          desc: 'pingpong(t, period) bounces time forward and backward. Arcons advance then retrace their steps.',
          example: 'player.x + cos(aim) * 200 * pingpong(t, 0.8)' },
        { id: 42, domain: 'Time', name: 'Stuttered Time',
          desc: 'stutter(t, fps) quantizes time to a framerate. Creates choppy, stop-motion movement.',
          example: 'player.x + cos(aim) * 200 * stutter(t, 4)' },
        { id: 43, domain: 'Time', name: 'Exponential Dilation',
          desc: 'dilate(t, factor) applies exponential time scaling. Arcons accelerate dramatically over time.',
          example: 'player.x + cos(aim) * 100 * dilate(t, 1.5)' },
        { id: 44, domain: 'Time', name: 'Time Skip (Wormhole)',
          desc: 'wormhole_t(t, threshold, jump) creates a time jump — arcons skip ahead at threshold. Creates gaps in trajectories.',
          example: 'player.x + cos(aim) * 200 * wormhole_t(t, 0.3, 0.5)' },
        { id: 45, domain: 'Time', name: 'Rewind Loop',
          desc: 'rewind(t, period) alternates forward and backward playback. Arcons surge forward then pull back.',
          example: 'player.x + cos(aim) * 200 * rewind(t, 1)' },
        { id: 46, domain: 'Time', name: 'Chrono Split',
          desc: 'chrono_split(t, period) cycles between 3 time speeds: normal, half, double. Different arcons evolve at different rates.',
          example: 'player.x + cos(aim) * 200 * chrono_split(t, 0.5)' },
        { id: 47, domain: 'Time', name: 'Bullet Time',
          desc: 'bullet_time(t, factor) applies dynamic slowdown. Feed mana or hp as factor for resource-driven time control.',
          example: 'player.x + cos(aim) * 200 * bullet_time(t, mana / maxMana)' },
        { id: 48, domain: 'Time', name: 'Time Paradox',
          desc: 'paradox(t, freq, amplitude) creates oscillating time distortions. Time wobbles unpredictably.',
          example: 'player.x + cos(aim) * 200 * paradox(t, 3, 0.3)' },
        { id: 49, domain: 'Time', name: 'Per-Arcon Time',
          desc: 'Subtract i * delay from t to give each arcon its own timeline. Combined with freeze_at, each arcon stops at a different distance.',
          example: 'player.x + cos(aim) * 300 * freeze_at(t - i * 0.08, 0.5 + i * 0.02)' },

        // ═══════════════════════════════════════
        //  DOMAIN 5: VELOCITY MANIPULATION (50–60)
        // ═══════════════════════════════════════
        { id: 50, domain: 'Velocity', name: 'Quadratic Acceleration',
          desc: 'accel(speed, t) squares time for parabolic acceleration. Arcons start slow, end fast.',
          example: 'player.x + cos(aim) * accel(200, t)' },
        { id: 51, domain: 'Velocity', name: 'Linear Deceleration',
          desc: 'decel(speed, t) slows arcons to a stop over 1 second. Creates stalling projectiles.',
          example: 'player.x + cos(aim) * 200 * decel(1, t)' },
        { id: 52, domain: 'Velocity', name: 'Cubic Ease-In',
          desc: 'ease_in(target, t) uses cubic easing for cinematic slow starts. Combine with lerp for smooth approaches.',
          example: 'lerp(player.x, cursor.x, ease_in(1, min(1, t)))' },
        { id: 53, domain: 'Velocity', name: 'Cubic Ease-Out',
          desc: 'ease_out(target, t) decelerates smoothly. Arcons arrive gently at their destination.',
          example: 'lerp(player.x, enemy.x, ease_out(1, min(1, t * 0.8)))' },
        { id: 54, domain: 'Velocity', name: 'Impulse Spike',
          desc: 'impulse(height, t, decay) creates a sharp burst then falloff. Perfect for explosion effects.',
          example: 'player.x + cos(i * 2 * pi / N) * impulse(200, t, 3)' },
        { id: 55, domain: 'Velocity', name: 'Spring Physics',
          desc: 'spring(amp, t, damping, freq) creates damped oscillation. Arcons overshoot then settle.',
          example: 'cursor.x + spring(80, t, 0.8, 6) * cos(i * 2 * pi / N)' },
        { id: 56, domain: 'Velocity', name: 'Bounce Dynamics',
          desc: 'bounce(amp, t, bounces, decay) simulates bouncing balls. Each bounce lower than the last.',
          example: 'cursor.y + bounce(100, t, 3, 0.7)' },
        { id: 57, domain: 'Velocity', name: 'Whip Crack',
          desc: 'whip(dist, t, crackTime) starts slow (windup) then snaps forward explosively.',
          example: 'player.x + cos(aim) * whip(300, t, 0.2)' },
        { id: 58, domain: 'Velocity', name: 'Terminal Velocity',
          desc: 'terminal_v(max, t, drag) caps speed with tanh curve. Fast start, asymptotic maximum.',
          example: 'player.x + cos(aim) * terminal_v(300, t, 2)' },
        { id: 59, domain: 'Velocity', name: 'Slingshot Pull-Back',
          desc: 'slingshot(power, t) pulls arcons backward briefly before launching them forward with extra force.',
          example: 'player.x + cos(aim) * slingshot(200, t)' },
        { id: 60, domain: 'Velocity', name: 'Orbital Speed',
          desc: 'orbit_speed(base, radius) makes inner orbits faster than outer ones (Kepler). Realistic orbital mechanics.',
          example: 'polar_x(player.x, t * orbit_speed(5, 30 + i * 3), 30 + i * 3)' },

        // ═══════════════════════════════════════
        //  DOMAIN 6: MANA MANIPULATION (61–68)
        // ═══════════════════════════════════════
        { id: 61, domain: 'Mana', name: 'Mana-Scaled Radius',
          desc: 'mana_scale(base, mana) scales spell size by current mana. Full mana = full power, empty = tiny.',
          example: 'polar_x(player.x, i * 2 * pi / N, mana_scale(100, mana))' },
        { id: 62, domain: 'Mana', name: 'Mana Pulse Wave',
          desc: 'mana_pulse(amp, mana, t, divisor) oscillates using mana level as a driver. Unique per mana state.',
          example: 'player.x + mana_pulse(60, mana, t, 10) * cos(i * 2 * pi / N)' },
        { id: 63, domain: 'Mana', name: 'HP-Ratio Scaling',
          desc: 'hp_ratio(base, hp, maxHp) scales by health percentage. Shields shrink as you take damage.',
          example: 'polar_x(player.x, i * 2 * pi / N + t * 2, hp_ratio(60, hp, maxHp))' },
        { id: 64, domain: 'Mana', name: 'Desperation Mode',
          desc: 'desperation(base, hp, maxHp, bonus) gets STRONGER at low HP. The more hurt you are, the more powerful.',
          example: 'player.x + cos(aim) * desperation(200, hp, maxHp, 3) * t' },
        { id: 65, domain: 'Mana', name: 'Mana Overflow',
          desc: 'overflow(mana, threshold) only activates when mana exceeds threshold. Reward for mana conservation.',
          example: 'player.x + cos(aim) * (200 + overflow(mana, 50) * 3) * t' },
        { id: 66, domain: 'Mana', name: 'Blood Magic',
          desc: 'sacrifice(base, bonus, hp, maxHp) trades health for power. More damage taken = more bonus damage.',
          example: 'player.x + cos(aim) * sacrifice(150, 200, hp, maxHp) * t' },
        { id: 67, domain: 'Mana', name: 'Mana Resonance',
          desc: 'resonance(base, mana, t) creates mana-driven oscillation. Spell pattern changes with mana state.',
          example: 'player.x + cos(i * 2 * pi / N) * resonance(50, mana, t)' },
        { id: 68, domain: 'Mana', name: 'Entropy Chaos',
          desc: 'entropy(base, chaos) adds random variation scaled by a chaos factor. More chaos = more unpredictable.',
          example: 'player.x + cos(aim) * entropy(200, 0.3) * t' },

        // ═══════════════════════════════════════
        //  DOMAIN 7: WAVE PHYSICS (69–76)
        // ═══════════════════════════════════════
        { id: 69, domain: 'Waves', name: 'Parametric Waves',
          desc: 'wave(amp, freq, t, phase) creates clean sine waves. Stack multiples for complex waveforms.',
          example: 'player.y + wave(40, 3, t, i * 0.5)' },
        { id: 70, domain: 'Waves', name: 'Standing Waves',
          desc: 'standing(amp, freq1, t, freq2) creates stationary wave patterns — nodes that never move.',
          example: 'player.x + cos(aim) * 200 * t + standing(30, 5, t, 7) * sin(aim + pi/2)' },
        { id: 71, domain: 'Waves', name: 'Harmonic Series',
          desc: 'harmonic(amp, freq, t, harmonics) sums multiple harmonics. Creates sawtooth-like complex waveforms.',
          example: 'player.y + harmonic(30, 2, t + i * 0.1, 5)' },
        { id: 72, domain: 'Waves', name: 'Beat Frequency',
          desc: 'beat(amp, freq1, freq2, t) creates beating patterns — slow pulsing from two close frequencies.',
          example: 'player.x + cos(aim) * (200 + beat(50, 5, 5.5, t)) * t' },
        { id: 73, domain: 'Waves', name: 'Doppler Effect',
          desc: 'doppler(amp, freq, velocity) shifts frequency based on velocity. Moving arcons change pitch/behavior.',
          example: 'wave(doppler(40, 3, vel), 1, t, i * 0.5)' },
        { id: 74, domain: 'Waves', name: 'Wave Interference',
          desc: 'interference(amp, phase1, phase2) sums two waves. Creates constructive/destructive interference patterns.',
          example: 'player.y + interference(30, t * 5 + i * 0.3, t * 7 + i * 0.5)' },
        { id: 75, domain: 'Waves', name: 'Soliton Packets',
          desc: 'soliton(amp, x, speed, t) creates non-dispersing wave packets — clean bumps that travel without spreading.',
          example: 'player.y + soliton(50, i * 5, 30, t)' },
        { id: 76, domain: 'Waves', name: 'Diffraction Pattern',
          desc: 'diffract(amp, angle) creates sinc-function diffraction patterns. Sharp central peak with diminishing side lobes.',
          example: 'player.y + diffract(60, (i - N/2) * 0.5)' },

        // ═══════════════════════════════════════
        //  DOMAIN 8: FRACTALS & PROCEDURAL (77–84)
        // ═══════════════════════════════════════
        { id: 77, domain: 'Fractals', name: 'Pseudo-Noise Displacement',
          desc: 'noise(x, y) generates pseudo-random values from coordinates. Use to scatter arcons organically.',
          example: 'player.x + noise(i, t) * 200' },
        { id: 78, domain: 'Fractals', name: 'Fractal Brownian Motion',
          desc: 'fbm(x) layers multiple octaves of noise. Creates naturalistic flowing patterns.',
          example: 'player.x + cos(aim) * 200 * t + fbm(i + t * 3) * 50' },
        { id: 79, domain: 'Fractals', name: 'Voronoi Cells',
          desc: 'voronoi(x, y) generates cell-like patterns. Arcons cluster into organic groupings.',
          example: 'player.x + voronoi(i * 0.5, t * 2) * 100' },
        { id: 80, domain: 'Fractals', name: 'Sierpinski Patterns',
          desc: 'sierpinski(x, y, scale) generates Sierpinski triangle-like patterns. Self-similar at every scale.',
          example: 'player.x + sierpinski(i * 10, t * 50, 100) * 150' },
        { id: 81, domain: 'Fractals', name: 'Mandelbrot Warping',
          desc: 'mandelbrot(x, y) maps positions through the Mandelbrot set. Creates fractal boundary distortions.',
          example: 'player.x + mandelbrot(cos(aim) * t * 100, sin(aim) * t * 100) * 300' },
        { id: 82, domain: 'Fractals', name: 'Julia Set Morphing',
          desc: 'julia(x, y, cr, ci) uses Julia set math. Change cr/ci parameters for different fractal shapes.',
          example: 'player.x + julia(i * 5, t * 30, 0.355, 0.355) * 200' },
        { id: 83, domain: 'Fractals', name: 'Rose Curves',
          desc: 'rose(angle, petals) generates mathematical rose curve radii. Petals parameter = number of lobes.',
          example: 'polar_x(player.x, i * 2 * pi / N + t, rose(i * 2 * pi / N + t, 5) * 80)' },
        { id: 84, domain: 'Fractals', name: 'Superformula Shapes',
          desc: 'superformula(phi, m, n1, n2, n3) generates any 2D supershape. Starfish, squares, flowers, anything.',
          example: 'polar_x(player.x, i * 2*pi/N, superformula(i * 2*pi/N, 5, 1, 1, 1) * 80)' },

        // ═══════════════════════════════════════
        //  DOMAIN 9: FIELD EFFECTS (85–91)
        // ═══════════════════════════════════════
        { id: 85, domain: 'Fields', name: 'Gravitational Attraction',
          desc: 'attract(x, y, tx, ty, force) pulls arcons toward a target. Use with cursor/enemy positions.',
          example: 'player.x + cos(aim) * 200 * t + attract(px, py, enemy.x, enemy.y, 30) * t' },
        { id: 86, domain: 'Fields', name: 'Repulsion Field',
          desc: 'repel(x, y, cx, cy, force) pushes arcons away from a point with inverse-square falloff.',
          example: 'repel(player.x + cos(aim) * 200 * t, py, cursor.x, cursor.y, 3000)' },
        { id: 87, domain: 'Fields', name: 'Vortex Field',
          desc: 'vortex_x/vortex_y create tangential forces. Arcons spiral around a point instead of toward it.',
          example: 'vortex_x(px, py, cursor.x, cursor.y, 80 * t)' },
        { id: 88, domain: 'Fields', name: 'Lorenz Attractor',
          desc: 'lorenz_x(x, y) and lorenz_y(y, x, z) apply chaotic attractor dynamics. Butterfly-effect patterns.',
          example: 'player.x + lorenz_x(i * 10, t * 30) * 5' },
        { id: 89, domain: 'Fields', name: 'Smooth Gradient Remap',
          desc: 'gradient(x, min, max, outMin, outMax) remaps values. Transform any range to any other range.',
          example: 'gradient(t, 0, 2, player.x, enemy.x)' },
        { id: 90, domain: 'Fields', name: 'Magnetic Oscillation',
          desc: 'magnetic(x, y, cx, cy, strength) creates oscillating field that alternates push/pull. Electromagnetic.',
          example: 'player.x + cos(aim) * 200 * t + magnetic(px, py, cursor.x, cursor.y, 50) * t' },
        { id: 91, domain: 'Fields', name: 'Smoothstep Transitions',
          desc: 'smoothstep(x, edge0, edge1) creates smooth on/off transitions. No sharp jumps, just silk.',
          example: 'lerp(player.x, enemy.x, smoothstep(t, 0.2, 0.8))' },

        // ═══════════════════════════════════════
        //  DOMAIN 10: QUANTUM (92–98)
        // ═══════════════════════════════════════
        { id: 92, domain: 'Quantum', name: 'Deterministic Quantum Random',
          desc: 'qrand(seed) generates deterministic "random" values from a seed. Same seed = same result every time.',
          example: 'player.x + cos(qrand(i) * 2 * pi) * 100 * t' },
        { id: 93, domain: 'Quantum', name: 'Wave Function Collapse',
          desc: 'collapse(stateA, stateB, seed, probability) collapses to one state based on probability. Schrodinger spell.',
          example: 'collapse(player.x, enemy.x, i, 0.3) + cos(aim) * 50 * t' },
        { id: 94, domain: 'Quantum', name: 'Quantum Tunneling',
          desc: 'tunnel_prob(pos, prob, i, t, jump) gives arcons a probability of tunneling through barriers.',
          example: 'tunnel_prob(player.x + cos(aim) * 200 * t, 0.3, i, t, 100)' },
        { id: 95, domain: 'Quantum', name: 'Heisenberg Uncertainty',
          desc: 'uncertainty(pos, spread, seed) adds position uncertainty. The more you know velocity, the less you know position.',
          example: 'uncertainty(player.x + cos(aim) * 200 * t, 30, i + t * 10)' },
        { id: 96, domain: 'Quantum', name: 'Quantum Entanglement',
          desc: 'entangle(posA, posB, center) creates paired arcons that mirror each other around center.',
          example: 'entangle(player.x + cos(aim) * 100 * t, player.x - cos(aim) * 100 * t, player.x)' },
        { id: 97, domain: 'Quantum', name: 'Quantum Spin',
          desc: 'spin(i, freq, value) assigns quantum spin — half the arcons get +value, half get -value.',
          example: 'player.y + spin(i, 1, 30) + sin(aim) * 200 * t' },
        { id: 98, domain: 'Quantum', name: 'Decoherence',
          desc: 'decohere(quantum, classical, t, rate) transitions from quantum to classical behavior over time.',
          example: 'decohere(scatter_to(player.x, enemy.x), player.x + cos(aim)*200*t, t, 0.5)' },

        // ═══════════════════════════════════════
        //  DOMAIN 11: GEOMETRY / TOPOLOGY (99–108)
        // ═══════════════════════════════════════
        { id: 99,  domain: 'Geometry', name: 'Torus Projection',
          desc: 'torus_x/torus_y(u, v, R, r) project donut-shaped patterns into 2D. Feed i-based angles.',
          example: 'player.x + torus_x(i * 2 * pi / N + t, t * 3, 80, 25)' },
        { id: 100, domain: 'Geometry', name: 'Möbius Strip',
          desc: 'mobius(u, v, R) projects a Möbius strip — a surface with only one side. Mind-bending topology.',
          example: 'player.x + mobius(i * 2 * pi / N, sin(t * 3) * 20, 70)' },
        { id: 101, domain: 'Geometry', name: 'Trefoil Knot',
          desc: 'trefoil_x/trefoil_y(t, scale) traces a trefoil knot — a 3D knot projected to 2D.',
          example: 'player.x + trefoil_x(i * 2 * pi / N + t * 2, 25)' },
        { id: 102, domain: 'Geometry', name: 'Spirograph (Hypotrochoid)',
          desc: 'hypotrochoid_x/y(t, R, r, d) generates spirograph patterns. Endless variations with different R/r/d ratios.',
          example: 'player.x + hypotrochoid_x(i * 0.3 + t * 4, 60, 20, 30)' },
        { id: 103, domain: 'Geometry', name: 'Epicycloid Wheels',
          desc: 'epicycloid_x/y(t, R, r) generates epicycloid patterns — wheels rolling on wheels.',
          example: 'player.x + epicycloid_x(i * 0.2 + t * 3, 50, 15)' },
        { id: 104, domain: 'Geometry', name: 'Cardioid Heart',
          desc: 'cardioid(angle, scale) generates the heart-shaped cardioid curve. Romantic destruction.',
          example: 'polar_x(player.x, i * 2*pi/N + t, cardioid(i * 2*pi/N + t, 40))' },
        { id: 105, domain: 'Geometry', name: 'Helix Projection',
          desc: 'helix_x/helix_y(angle, pitch_t, radius, advance) projects 3D helices into 2D.',
          example: 'player.x + helix_x(i * 0.5 + t * 5, t, 30, cos(aim) * 100)' },
        { id: 106, domain: 'Geometry', name: 'Lissajous Figures',
          desc: 'lissajous_x(t, freqX, phase) and lissajous_y(t, freqY) create Lissajous figures — TV test patterns.',
          example: 'player.x + lissajous_x(t + i * 0.1, 3, pi/4) * 80' },
        { id: 107, domain: 'Geometry', name: 'Klein Bottle',
          desc: 'klein(u, v) projects the impossible Klein bottle into 2D. A surface that passes through itself.',
          example: 'player.x + klein(i * 2 * pi / N + t, t * 2)' },
        { id: 108, domain: 'Geometry', name: 'Multi-Shape Superformula',
          desc: 'Vary superformula m/n params with t to morph between shapes — star→circle→flower in real-time.',
          example: 'superformula(angle, 3 + floor(t) % 8, 1, 1, 1) * 80' },

        // ═══════════════════════════════════════
        //  DOMAIN 12: CONDITIONAL / LOGIC (109–115)
        // ═══════════════════════════════════════
        { id: 109, domain: 'Logic', name: 'Conditional Branching',
          desc: 'ifgt(a, b, then, else) creates branching spell behavior. Different effects based on conditions.',
          example: 'ifgt(t, 0.5, enemy.x, player.x + cos(aim) * 200 * t)' },
        { id: 110, domain: 'Logic', name: 'Index Selection',
          desc: 'select(index, v0, v1, v2...) picks a value based on index. Create multi-phase spells.',
          example: 'select(floor(t * 2), player.x, cursor.x, enemy.x)' },
        { id: 111, domain: 'Logic', name: 'Square Wave Oscillation',
          desc: 'square_wave(t, freq, amp) creates hard on/off oscillation. Digital feel to analog magic.',
          example: 'player.x + cos(aim) * 200 * t + square_wave(t, 4, 30)' },
        { id: 112, domain: 'Logic', name: 'Pulse Train',
          desc: 'pulse(t, period, width, amp) creates periodic pulses. Duty cycle controls on-time vs off-time.',
          example: 'player.x + cos(aim) * 200 * t * pulse(t, 0.5, 0.3, 1)' },
        { id: 113, domain: 'Logic', name: 'Threshold Gate',
          desc: 'threshold(value, min) only passes values above minimum. Creates activation barriers.',
          example: 'player.x + cos(aim) * threshold(200 * t - 50, 0)' },
        { id: 114, domain: 'Logic', name: 'Value Snapping',
          desc: 'snap(value, grid) rounds to grid. Creates pixel-art-like stepped movement.',
          example: 'snap(player.x + cos(aim) * 200 * t, 20)' },
        { id: 115, domain: 'Logic', name: 'Range Wrapping',
          desc: 'wrap(value, min, max) wraps values to a range. Arcons that leave the top reappear at the bottom.',
          example: 'wrap(player.y + sin(aim) * 400 * t, 0, 540)' },

        // ═══════════════════════════════════════
        //  DOMAIN 13: COMPOSITE / META (116–122)
        // ═══════════════════════════════════════
        { id: 116, domain: 'Meta', name: 'Unclamped Mix',
          desc: 'mix(a, b, factor) blends two values with unclamped factor. Extrapolation possible with factor > 1.',
          example: 'mix(player.x, enemy.x, t * 1.5) — overshoots past enemy' },
        { id: 117, domain: 'Meta', name: 'Full Remap',
          desc: 'remap(value, inMin, inMax, outMin, outMax) transforms any range to any other range. Universal converter.',
          example: 'remap(sin(t * 3), -1, 1, player.x, enemy.x)' },
        { id: 118, domain: 'Meta', name: 'Grid Quantization',
          desc: 'quantize(value, step) forces values to discrete steps. Creates digital/pixelated spell patterns.',
          example: 'quantize(player.x + cos(aim) * 200 * t, 32)' },
        { id: 119, domain: 'Meta', name: 'Zigzag Paths',
          desc: 'zigzag(t, period, amp) creates sharp V-shaped oscillation. More aggressive than sine waves.',
          example: 'player.y + zigzag(t + i * 0.1, 0.5, 40)' },
        { id: 120, domain: 'Meta', name: 'Cascading Delay',
          desc: 'cascade(i, delay, base, amp, t) creates sequential wave effects. Mexican wave through arcons.',
          example: 'player.y + cascade(i, 0.08, 0, 40, t)' },
        { id: 121, domain: 'Meta', name: 'Wobble Composition',
          desc: 'wobble(base, amp, phase1, phase2) combines two frequencies for complex oscillation patterns.',
          example: 'player.y + sin(aim) * 200 * t + wobble(0, 25, t * 3 + i, t * 5)' },
        { id: 122, domain: 'Meta', name: 'Damped Pendulum',
          desc: 'pendulum(amp, angle, damping, t) creates pendulum motion that settles over time.',
          example: 'player.x + pendulum(80, t * 3, 0.5, t)' },

        // ═══════════════════════════════════════
        //  DOMAIN 14: CHAOS THEORY (123–130)
        // ═══════════════════════════════════════
        { id: 123, domain: 'Chaos', name: 'Logistic Map',
          desc: 'logistic(x0, r, iterations) applies the logistic map. At r≈3.57 it becomes chaotic. Deterministic chaos.',
          example: 'player.x + logistic(0.5, 3.9, i) * 400 - 200' },
        { id: 124, domain: 'Chaos', name: 'Hénon Attractor',
          desc: 'henon_x(x, y, a) and henon_y(x, b) create the Hénon strange attractor. Fractal butterfly.',
          example: 'player.x + henon_x(i * 0.1, t, 1.4) * 100' },
        { id: 125, domain: 'Chaos', name: 'Bifurcation Diagram',
          desc: 'bifurcate(r, scale) samples the bifurcation diagram at parameter r. Visualize order→chaos transition.',
          example: 'player.x + bifurcate(2 + t, 200)' },
        { id: 126, domain: 'Chaos', name: 'Feigenbaum Constants',
          desc: 'feigenbaum(t, scale) encodes the Feigenbaum constants (4.669..., 2.502...) into irrational-frequency orbits.',
          example: 'player.x + feigenbaum(t + i * 0.1, 60)' },
        { id: 127, domain: 'Chaos', name: 'Irrational Orbit',
          desc: 'chaos_orbit(t, radius) uses e and π as frequencies. Never repeats — truly aperiodic.',
          example: 'player.x + chaos_orbit(t + i * 0.3, 60)' },
        { id: 128, domain: 'Chaos', name: 'Double Pendulum',
          desc: 'Combine two pendulum() calls with different params. Small changes → wildly different outcomes.',
          example: 'player.x + pendulum(50, t*2, 0.3, t) + pendulum(30, t*3.7, 0.2, t)' },
        { id: 129, domain: 'Chaos', name: 'Rössler Attractor',
          desc: 'rossler_x(x, y, z) applies Rössler attractor dynamics. Simpler than Lorenz but still chaotic.',
          example: 'player.x + rossler_x(i * 5, t * 20, sin(t) * 10) * 10' },
        { id: 130, domain: 'Chaos', name: 'Self-Modifying Chaos',
          desc: 'Feed the output of one chaotic function as input to another. logistic into bifurcate into noise. Reality melts.',
          example: 'player.x + noise(logistic(0.5, 3.9, i), bifurcate(t + i * 0.1, 1)) * 300' },
    ];

    // ═══════════════════════════════════════════════════════════════
    //  DEVELOPER SPELLS — Proof-of-concept spells using loopholes.
    //  Unlocked via console command: __arcane_dev()
    //  These are intentionally powerful / creative / reality-breaking.
    // ═══════════════════════════════════════════════════════════════
    const DEV_CATEGORIES = [
        'Spacetime', 'Quantum', 'Forbidden', 'Geometric', 'Chaotic', 'Resourceful'
    ];

    const DEV_SPELLS = [
        // ═══ SPACETIME ═══
        {
            name: 'Temporal Rewind Beam', category: 'Spacetime', cost: 35,
            desc: '⚡ LOOPHOLE #38+#45 — Beam that fires forward then rewinds back. Hits twice.',
            x: op('+', v('player.x'), op('*', fn('cos', v('aim')), op('*', n(300), fn('rewind', v('t'), n(1))))),
            y: op('+', v('player.y'), op('*', fn('sin', v('aim')), op('*', n(300), fn('rewind', v('t'), n(1))))),
            emit: op('*', v('i'), n(0.015)),
            width: n(5),
        },
        {
            name: 'Frozen Nova', category: 'Spacetime', cost: 40,
            desc: '⚡ LOOPHOLE #39 — Nova that freezes at maximum radius. Persistent ring of death.',
            x: op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(120), fn('freeze_at', v('t'), n(0.6))))),
            y: op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(120), fn('freeze_at', v('t'), n(0.6))))),
            emit: n(0),
            width: n(5),
        },
        {
            name: 'Time Loop Orbit', category: 'Spacetime', cost: 30,
            desc: '⚡ LOOPHOLE #40 — Orbiting shield that loops time, never expanding outward.',
            x: op('+', v('player.x'), op('*', fn('cos', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), op('*', fn('loop_t', v('t'), n(1.5)), n(4)))), n(55))),
            y: op('+', v('player.y'), op('*', fn('sin', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), op('*', fn('loop_t', v('t'), n(1.5)), n(4)))), n(55))),
            emit: n(0),
            width: n(5),
        },
        {
            name: 'Bullet Time Seeker', category: 'Spacetime', cost: 25,
            desc: '⚡ LOOPHOLE #47+#64 — Mana-driven slow-motion homing. Full mana = crawling, empty mana = lightspeed.',
            x: op('+', fn('lerp', v('player.x'), v('enemy.x'), fn('min', n(1), fn('bullet_time', v('t'), op('/', v('mana'), v('maxMana'))))),
                op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(40), fn('max', n(0), op('-', n(1), v('t')))))),
            y: op('+', fn('lerp', v('player.y'), v('enemy.y'), fn('min', n(1), fn('bullet_time', v('t'), op('/', v('mana'), v('maxMana'))))),
                op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(40), fn('max', n(0), op('-', n(1), v('t')))))),
            emit: op('*', v('i'), n(0.02)),
            width: n(4),
        },
        {
            name: 'Chrono Stutter Blast', category: 'Spacetime', cost: 45,
            desc: '⚡ LOOPHOLE #42 — Shotgun with stuttered time. Arcons move in stop-motion jerks.',
            x: op('+', v('player.x'), op('*', fn('cos', op('+', v('aim'), op('*', op('-', v('i'), op('/', v('N'), n(2))), n(0.06)))), op('*', n(350), fn('stutter', v('t'), n(5))))),
            y: op('+', v('player.y'), op('*', fn('sin', op('+', v('aim'), op('*', op('-', v('i'), op('/', v('N'), n(2))), n(0.06)))), op('*', n(350), fn('stutter', v('t'), n(5))))),
            emit: n(0),
            width: n(4),
        },
        {
            name: 'Ping-Pong Wall', category: 'Spacetime', cost: 30,
            desc: '⚡ LOOPHOLE #41 — Defensive wall that bounces in and out. Perpetual barrier.',
            x: op('+', op('+', v('player.x'), op('*', fn('cos', v('aim')), op('*', n(80), fn('pingpong', v('t'), n(0.8))))),
                op('*', fn('cos', op('+', v('aim'), op('/', v('pi'), n(2)))), op('*', op('-', v('i'), op('/', v('N'), n(2))), n(5)))),
            y: op('+', op('+', v('player.y'), op('*', fn('sin', v('aim')), op('*', n(80), fn('pingpong', v('t'), n(0.8))))),
                op('*', fn('sin', op('+', v('aim'), op('/', v('pi'), n(2)))), op('*', op('-', v('i'), op('/', v('N'), n(2))), n(5)))),
            emit: n(0),
            width: n(7),
        },

        // ═══ QUANTUM ═══
        {
            name: 'Schrödinger Bolt', category: 'Quantum', cost: 30,
            desc: '⚡ LOOPHOLE #93 — Each arcon collapses to either beam or nova at random. Quantum uncertainty.',
            x: op('+', fn('collapse', 
                op('+', v('player.x'), op('*', fn('cos', v('aim')), op('*', n(300), v('t')))),
                op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(150), v('t')))),
                v('i'), n(0.5)),
                n(0)),
            y: op('+', fn('collapse',
                op('+', v('player.y'), op('*', fn('sin', v('aim')), op('*', n(300), v('t')))),
                op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(150), v('t')))),
                v('i'), n(0.5)),
                n(0)),
            emit: op('*', v('i'), n(0.015)),
            width: n(4),
        },
        {
            name: 'Uncertainty Cloud', category: 'Quantum', cost: 40,
            desc: '⚡ LOOPHOLE #95 — Arcons with Heisenberg uncertainty. Position constantly fuzzy.',
            x: fn('uncertainty',
                op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(100), v('t')))),
                op('*', n(40), v('t')),
                op('+', v('i'), op('*', v('t'), n(10)))),
            y: fn('uncertainty',
                op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(100), v('t')))),
                op('*', n(40), v('t')),
                op('+', op('*', v('i'), n(7)), op('*', v('t'), n(13)))),
            emit: n(0),
            width: n(4),
        },
        {
            name: 'Quantum Tunnel Shot', category: 'Quantum', cost: 20,
            desc: '⚡ LOOPHOLE #94 — Arcons probabilistically tunnel forward in space. Teleporting bullets.',
            x: fn('tunnel_prob',
                op('+', v('player.x'), op('*', fn('cos', v('aim')), op('*', n(200), v('t')))),
                n(0.3), v('i'), v('t'), op('*', fn('cos', v('aim')), n(80))),
            y: fn('tunnel_prob',
                op('+', v('player.y'), op('*', fn('sin', v('aim')), op('*', n(200), v('t')))),
                n(0.3), v('i'), v('t'), op('*', fn('sin', v('aim')), n(80))),
            emit: op('*', v('i'), n(0.02)),
            width: n(3),
        },
        {
            name: 'Entangled Dual Beam', category: 'Quantum', cost: 35,
            desc: '⚡ LOOPHOLE #96+#97 — Two entangled beams. Spin-up goes forward, spin-down fires backward.',
            x: op('+', v('player.x'), op('*', fn('cos', v('aim')), op('*', fn('spin', v('i'), n(1), n(1)), op('*', n(300), v('t'))))),
            y: op('+', v('player.y'), op('*', fn('sin', v('aim')), op('*', fn('spin', v('i'), n(1), n(1)), op('*', n(300), v('t'))))),
            emit: op('*', v('i'), n(0.02)),
            width: n(4),
        },
        {
            name: 'Superposition Ring', category: 'Quantum', cost: 40,
            desc: '⚡ LOOPHOLE #16 — Ring of arcons switching between two radii. Quantum double-ring.',
            x: op('+', v('player.x'), op('*', fn('cos', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), op('*', v('t'), n(3)))),
                fn('quantum_pos', n(40), n(80), v('t'), n(6)))),
            y: op('+', v('player.y'), op('*', fn('sin', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), op('*', v('t'), n(3)))),
                fn('quantum_pos', n(40), n(80), v('t'), n(6)))),
            emit: n(0),
            width: n(5),
        },

        // ═══ FORBIDDEN ═══
        {
            name: 'Portal Strike', category: 'Forbidden', cost: 30,
            desc: '⚡ LOOPHOLE #17+#22 — Arcons portal between player and cursor. Damage everywhere.',
            x: fn('gate',
                op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(60), v('t')))),
                op('+', v('cursor.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(60), v('t')))),
                v('t'), n(0.6)),
            y: fn('gate',
                op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(60), v('t')))),
                op('+', v('cursor.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(60), v('t')))),
                v('t'), n(0.6)),
            emit: n(0),
            width: n(5),
        },
        {
            name: 'Spatial Fold Beam', category: 'Forbidden', cost: 35,
            desc: '⚡ LOOPHOLE #2 — Beam that wraps around the arena. Infinite reach through folded space.',
            x: fn('fold',
                op('+', v('player.x'), op('*', fn('cos', v('aim')), op('*', n(400), op('-', v('t'), op('*', v('i'), n(0.02)))))),
                n(960)),
            y: fn('fold',
                op('+', v('player.y'), op('*', fn('sin', v('aim')), op('*', n(400), op('-', v('t'), op('*', v('i'), n(0.02)))))),
                n(540)),
            emit: op('*', v('i'), n(0.02)),
            width: n(4),
        },
        {
            name: 'Mirror Dimension Nova', category: 'Forbidden', cost: 45,
            desc: '⚡ LOOPHOLE #3+#12 — Nova that bounces off invisible walls. Arcons trapped in a mirror box.',
            x: fn('mirror',
                op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(300), v('t')))),
                n(200)),
            y: fn('mirror',
                op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(300), v('t')))),
                n(200)),
            emit: n(0),
            width: n(5),
        },
        {
            name: 'Gravity Well Trap', category: 'Forbidden', cost: 35,
            desc: '⚡ LOOPHOLE #10+#87 — Vortex at cursor that sucks arcons into an inescapable well.',
            x: fn('vortex_x',
                op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(200), v('t')))),
                op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(200), v('t')))),
                v('cursor.x'), v('cursor.y'), op('*', n(80), fn('min', n(1), v('t')))),
            y: fn('vortex_y',
                op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(200), v('t')))),
                op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(200), v('t')))),
                v('cursor.x'), v('cursor.y'), op('*', n(80), fn('min', n(1), v('t')))),
            emit: n(0),
            width: n(4),
        },
        {
            name: 'Phase Shift Barrage', category: 'Forbidden', cost: 40,
            desc: '⚡ LOOPHOLE #15 — Beam that phase-shifts between two parallel tracks. Dodging is futile.',
            x: op('+', v('player.x'), op('*', fn('cos', v('aim')), op('*', n(300), op('-', v('t'), op('*', v('i'), n(0.015)))))),
            y: fn('phase_shift',
                op('+', v('player.y'), op('*', fn('sin', v('aim')), op('*', n(300), op('-', v('t'), op('*', v('i'), n(0.015)))))),
                n(40), v('t'), n(8)),
            emit: op('*', v('i'), n(0.015)),
            width: n(4),
        },
        {
            name: 'Clone Army', category: 'Forbidden', cost: 50,
            desc: '⚡ LOOPHOLE #26+#34 — 5 cloned beams fired in a fan. Each a perfect copy offset.',
            x: op('+', v('player.x'), op('*', fn('cos', op('+', v('aim'),
                op('*', op('-', fn('mod', fn('floor', op('/', v('i'), op('/', v('N'), n(5)))), n(5)), n(2)), n(0.2)))),
                op('*', n(300), op('-', v('t'), op('*', fn('mod', v('i'), op('/', v('N'), n(5))), n(0.015)))))),
            y: op('+', v('player.y'), op('*', fn('sin', op('+', v('aim'),
                op('*', op('-', fn('mod', fn('floor', op('/', v('i'), op('/', v('N'), n(5)))), n(5)), n(2)), n(0.2)))),
                op('*', n(300), op('-', v('t'), op('*', fn('mod', v('i'), op('/', v('N'), n(5))), n(0.015)))))),
            emit: op('*', fn('mod', v('i'), op('/', v('N'), n(5))), n(0.015)),
            width: n(3),
        },

        // ═══ GEOMETRIC ═══
        {
            name: 'Trefoil Knot', category: 'Geometric', cost: 40,
            desc: '⚡ LOOPHOLE #101 — Arcons trace a beautiful 3D trefoil knot projected into 2D.',
            x: op('+', v('player.x'), fn('trefoil_x', op('+', op('*', v('i'), op('/', op('*', n(2), v('pi')), v('N'))), op('*', v('t'), n(2))), n(30))),
            y: op('+', v('player.y'), fn('trefoil_y', op('+', op('*', v('i'), op('/', op('*', n(2), v('pi')), v('N'))), op('*', v('t'), n(2))), n(30))),
            emit: n(0),
            width: n(4),
        },
        {
            name: 'Spirograph Shield', category: 'Geometric', cost: 45,
            desc: '⚡ LOOPHOLE #102 — Hypotrochoid spirograph pattern orbiting the caster.',
            x: op('+', v('player.x'), fn('hypotrochoid_x', op('+', op('*', v('i'), n(0.25)), op('*', v('t'), n(4))), n(60), n(21), n(30))),
            y: op('+', v('player.y'), fn('hypotrochoid_y', op('+', op('*', v('i'), n(0.25)), op('*', v('t'), n(4))), n(60), n(21), n(30))),
            emit: n(0),
            width: n(4),
        },
        {
            name: 'Torus Blast', category: 'Geometric', cost: 45,
            desc: '⚡ LOOPHOLE #99 — Donut-shaped blast that expands outward. 3D torus in 2D.',
            x: op('+', v('player.x'), fn('torus_x',
                op('+', op('*', v('i'), op('/', op('*', n(2), v('pi')), v('N'))), op('*', v('t'), n(1))),
                op('*', v('t'), n(5)),
                op('*', n(80), v('t')),
                n(20))),
            y: op('+', v('player.y'), fn('torus_y',
                op('+', op('*', v('i'), op('/', op('*', n(2), v('pi')), v('N'))), op('*', v('t'), n(1))),
                op('*', v('t'), n(5)),
                op('*', n(80), v('t')),
                n(20))),
            emit: n(0),
            width: n(4),
        },
        {
            name: 'Rose Petal Storm', category: 'Geometric', cost: 35,
            desc: '⚡ LOOPHOLE #83 — Mathematical rose curve. Arcons trace flower petals around the caster.',
            x: op('+', v('player.x'), op('*', fn('cos', op('+', op('*', v('i'), op('/', op('*', n(2), v('pi')), v('N'))), v('t'))),
                op('*', fn('rose', op('+', op('*', v('i'), op('/', op('*', n(2), v('pi')), v('N'))), v('t')), n(5)), op('+', n(60), op('*', n(30), v('t')))))),
            y: op('+', v('player.y'), op('*', fn('sin', op('+', op('*', v('i'), op('/', op('*', n(2), v('pi')), v('N'))), v('t'))),
                op('*', fn('rose', op('+', op('*', v('i'), op('/', op('*', n(2), v('pi')), v('N'))), v('t')), n(5)), op('+', n(60), op('*', n(30), v('t')))))),
            emit: n(0),
            width: n(4),
        },
        {
            name: 'Epicycloid Wheel', category: 'Geometric', cost: 40,
            desc: '⚡ LOOPHOLE #103 — Wheels within wheels. Arcons trace epicycloid curves outward.',
            x: op('+', v('player.x'), fn('epicycloid_x', op('+', op('*', v('i'), n(0.2)), op('*', v('t'), n(3))), op('*', n(40), op('+', n(1), v('t'))), n(12))),
            y: op('+', v('player.y'), fn('epicycloid_y', op('+', op('*', v('i'), n(0.2)), op('*', v('t'), n(3))), op('*', n(40), op('+', n(1), v('t'))), n(12))),
            emit: n(0),
            width: n(4),
        },
        {
            name: 'Lissajous Cage', category: 'Geometric', cost: 35,
            desc: '⚡ LOOPHOLE #106 — Arcons trace Lissajous figures. Cage of intersecting sine curves.',
            x: op('+', v('player.x'), op('*', fn('lissajous_x', op('+', v('t'), op('*', v('i'), n(0.1))), n(3), op('/', v('pi'), n(4))), n(80))),
            y: op('+', v('player.y'), op('*', fn('lissajous_y', op('+', v('t'), op('*', v('i'), n(0.1))), n(2)), n(80))),
            emit: n(0),
            width: n(4),
        },

        // ═══ CHAOTIC ═══
        {
            name: 'Lorenz Butterfly', category: 'Chaotic', cost: 40,
            desc: '⚡ LOOPHOLE #88 — Arcons evolve along the Lorenz attractor. Chaotic butterfly effect.',
            x: op('+', v('player.x'), op('*', fn('lorenz_x', op('*', v('i'), n(5)), op('*', v('t'), n(20))), n(8))),
            y: op('+', v('player.y'), op('*', fn('lorenz_y', op('*', v('t'), n(20)), op('*', v('i'), n(5)), op('*', fn('sin', v('t')), n(15))), n(8))),
            emit: op('*', v('i'), n(0.02)),
            width: n(3),
        },
        {
            name: 'Mandelbrot Shatter', category: 'Chaotic', cost: 50,
            desc: '⚡ LOOPHOLE #81 — Arcons warped through the Mandelbrot set. Fractal boundary explosions.',
            x: op('+', v('player.x'), op('*', fn('mandelbrot',
                op('*', fn('cos', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), v('t'))), op('*', n(150), v('t'))),
                op('*', fn('sin', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), v('t'))), op('*', n(150), v('t')))),
                n(250))),
            y: op('+', v('player.y'), op('*', fn('julia',
                op('*', fn('cos', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), v('t'))), op('*', n(150), v('t'))),
                op('*', fn('sin', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), v('t'))), op('*', n(150), v('t'))),
                n(0.355), n(0.355)),
                n(250))),
            emit: n(0),
            width: n(4),
        },
        {
            name: 'Feigenbaum Cascade', category: 'Chaotic', cost: 35,
            desc: '⚡ LOOPHOLE #126 — Spell driven by the Feigenbaum constants. Aperiodic madness.',
            x: op('+', v('player.x'), op('*', fn('cos', v('aim')), op('*', n(200), v('t')))),
            y: op('+', v('player.y'), op('+', op('*', fn('sin', v('aim')), op('*', n(200), v('t'))), fn('feigenbaum', op('+', v('t'), op('*', v('i'), n(0.08))), n(40)))),
            emit: op('*', v('i'), n(0.015)),
            width: n(4),
        },
        {
            name: 'Logistic Chaos Spray', category: 'Chaotic', cost: 40,
            desc: '⚡ LOOPHOLE #123 — Each arcon angle from the logistic map. Deterministic yet unpredictable.',
            x: op('+', v('player.x'), op('*', fn('cos', op('+', v('aim'), op('*', fn('logistic', n(0.5), n(3.95), v('i')), n(3)))), op('*', n(250), v('t')))),
            y: op('+', v('player.y'), op('*', fn('sin', op('+', v('aim'), op('*', fn('logistic', n(0.5), n(3.95), v('i')), n(3)))), op('*', n(250), v('t')))),
            emit: op('*', v('i'), n(0.01)),
            width: n(3),
        },
        {
            name: 'Noise Storm', category: 'Chaotic', cost: 45,
            desc: '⚡ LOOPHOLE #77+#78 — FBM-driven chaotic displacement on a spiral. Organic turbulence.',
            x: op('+', v('player.x'), op('+', op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(120), v('t'))),
                op('*', fn('fbm', op('+', v('i'), op('*', v('t'), n(5)))), op('*', n(80), v('t'))))),
            y: op('+', v('player.y'), op('+', op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(120), v('t'))),
                op('*', fn('noise', v('i'), op('*', v('t'), n(3))), op('*', n(80), v('t'))))),
            emit: n(0),
            width: n(3),
        },

        // ═══ RESOURCEFUL ═══
        {
            name: 'Desperation Nova', category: 'Resourceful', cost: 45,
            desc: '⚡ LOOPHOLE #64 — Nova that scales with missing HP. Near-death = massive blast.',
            x: op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))),
                fn('desperation', n(100), v('hp'), v('maxHp'), n(3)))),
            y: op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))),
                fn('desperation', n(100), v('hp'), v('maxHp'), n(3)))),
            emit: n(0),
            width: op('+', n(3), fn('desperation', n(0), v('hp'), v('maxHp'), n(4))),
        },
        {
            name: 'Blood Magic Beam', category: 'Resourceful', cost: 30,
            desc: '⚡ LOOPHOLE #66 — Beam that gets stronger as you lose HP. Sacrifice for power.',
            x: op('+', v('player.x'), op('*', fn('cos', v('aim')), op('*', fn('sacrifice', n(150), n(250), v('hp'), v('maxHp')), op('-', v('t'), op('*', v('i'), n(0.02)))))),
            y: op('+', v('player.y'), op('*', fn('sin', v('aim')), op('*', fn('sacrifice', n(150), n(250), v('hp'), v('maxHp')), op('-', v('t'), op('*', v('i'), n(0.02)))))),
            emit: op('*', v('i'), n(0.02)),
            width: n(5),
        },
        {
            name: 'Mana Resonance Shield', category: 'Resourceful', cost: 35,
            desc: '⚡ LOOPHOLE #67+#63 — Shield that pulses with mana and shrinks as you take damage.',
            x: op('+', v('player.x'), op('*', fn('cos', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), op('*', v('t'), n(3)))),
                fn('resonance', fn('hp_ratio', n(55), v('hp'), v('maxHp')), v('mana'), v('t')))),
            y: op('+', v('player.y'), op('*', fn('sin', op('+', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N'))), op('*', v('t'), n(3)))),
                fn('resonance', fn('hp_ratio', n(55), v('hp'), v('maxHp')), v('mana'), v('t')))),
            emit: n(0),
            width: n(6),
        },
        {
            name: 'Overflow Burst', category: 'Resourceful', cost: 40,
            desc: '⚡ LOOPHOLE #65 — Only activates at high mana. Reward for conservation. Excess mana = bonus range.',
            x: op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))),
                op('+', op('*', n(80), v('t')), op('*', fn('overflow', v('mana'), n(40)), v('t'))))),
            y: op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))),
                op('+', op('*', n(80), v('t')), op('*', fn('overflow', v('mana'), n(40)), v('t'))))),
            emit: n(0),
            width: n(5),
        },
        {
            name: 'Slingshot Snipe', category: 'Resourceful', cost: 15,
            desc: '⚡ LOOPHOLE #59 — Arcons pull back briefly then launch at extreme speed. Windup sniper.',
            x: op('+', v('player.x'), op('*', fn('cos', v('aim')), fn('slingshot', n(400), v('t')))),
            y: op('+', v('player.y'), op('*', fn('sin', v('aim')), fn('slingshot', n(400), v('t')))),
            emit: op('*', v('i'), n(0.01)),
            width: n(3),
        },
        {
            name: 'Spring Trap', category: 'Resourceful', cost: 30,
            desc: '⚡ LOOPHOLE #55 — Arcons placed at cursor with spring physics. Bounce and settle.',
            x: op('+', v('cursor.x'), op('*', fn('spring', n(60), v('t'), n(0.6), n(5)), fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))))),
            y: op('+', v('cursor.y'), op('*', fn('spring', n(60), v('t'), n(0.6), n(5)), fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))))),
            emit: op('*', v('i'), n(0.02)),
            width: n(5),
        },
    ];

    // ═══════════════════════════════════════════════════════════════
    //  DEV UNLOCK SYSTEM
    // ═══════════════════════════════════════════════════════════════
    let devUnlocked = false;

    function unlockDev() {
        if (devUnlocked) {
            console.log('%c[ARCANE DEV] Already unlocked!', 'color: #ff0; font-weight: bold');
            return;
        }
        devUnlocked = true;

        // Add dev categories
        for (const cat of DEV_CATEGORIES) {
            if (!SpellLibrary.CATEGORIES.includes(cat)) {
                SpellLibrary.CATEGORIES.push(cat);
            }
        }

        // Add dev spells to main library
        for (const spell of DEV_SPELLS) {
            SpellLibrary.SPELLS.push(spell);
        }

        console.log('%c╔══════════════════════════════════════════╗', 'color: #f0f; font-weight: bold');
        console.log('%c║   🔮 ARCANE DEVELOPER MODE UNLOCKED 🔮   ║', 'color: #f0f; font-weight: bold');
        console.log('%c╠══════════════════════════════════════════╣', 'color: #f0f; font-weight: bold');
        console.log(`%c║  ${DEV_SPELLS.length} dev spells added to the library     ║`, 'color: #ff0');
        console.log(`%c║  ${REGISTRY.length} loopholes documented               ║`, 'color: #ff0');
        console.log(`%c║  ${Object.keys(Parser._builtins).length} formula functions available       ║`, 'color: #ff0');
        console.log('%c║                                          ║', 'color: #f0f');
        console.log('%c║  New categories:                         ║', 'color: #0ff');
        for (const cat of DEV_CATEGORIES) {
            const count = DEV_SPELLS.filter(s => s.category === cat).length;
            console.log(`%c║    ⚡ ${cat.padEnd(15)} (${count} spells)        ║`, 'color: #0ff');
        }
        console.log('%c║                                          ║', 'color: #f0f');
        console.log('%c║  Loophole domains:                       ║', 'color: #0f0');
        const domains = [...new Set(REGISTRY.map(l => l.domain))];
        for (const d of domains) {
            const count = REGISTRY.filter(l => l.domain === d).length;
            console.log(`%c║    📐 ${d.padEnd(15)} (${count} loopholes)    ║`, 'color: #0f0');
        }
        console.log('%c╠══════════════════════════════════════════╣', 'color: #f0f; font-weight: bold');
        console.log('%c║  Commands:                               ║', 'color: #fff');
        console.log('%c║    __arcane_loopholes()  — list all      ║', 'color: #aaa');
        console.log('%c║    __arcane_loophole(id) — details       ║', 'color: #aaa');
        console.log('%c║    __arcane_functions()  — list funcs    ║', 'color: #aaa');
        console.log('%c║    __arcane_vars()       — list vars     ║', 'color: #aaa');
        console.log('%c╚══════════════════════════════════════════╝', 'color: #f0f; font-weight: bold');
    }

    function listLoopholes(domain) {
        const filtered = domain ? REGISTRY.filter(l => l.domain.toLowerCase() === domain.toLowerCase()) : REGISTRY;
        console.log(`%c── ${filtered.length} Loopholes ${domain ? '('+domain+')' : '(all)'} ──`, 'color: #ff0; font-weight: bold');
        for (const l of filtered) {
            console.log(`%c#${l.id} [${l.domain}] ${l.name}`, 'color: #0ff; font-weight: bold');
            console.log(`  ${l.desc}`);
        }
    }

    function loopholeDetail(id) {
        const l = REGISTRY.find(r => r.id === id);
        if (!l) { console.log(`Loophole #${id} not found.`); return; }
        console.log(`%c═══ LOOPHOLE #${l.id}: ${l.name} ═══`, 'color: #f0f; font-weight: bold; font-size: 14px');
        console.log(`%cDomain: ${l.domain}`, 'color: #0ff');
        console.log(`%c${l.desc}`, 'color: #fff');
        console.log(`%cExample: ${l.example}`, 'color: #0f0; font-style: italic');
    }

    function listFunctions() {
        const fns = Object.keys(Parser._builtins);
        console.log(`%c── ${fns.length} Available Formula Functions ──`, 'color: #ff0; font-weight: bold');
        const perLine = 8;
        for (let i = 0; i < fns.length; i += perLine) {
            console.log('  ' + fns.slice(i, i + perLine).join(', '));
        }
    }

    function listVars() {
        const vars = [
            't — time since cast',
            'i — arcon index (0..N-1)',
            'N — total arcon count (spell cost)',
            'player.x / player.y — caster position',
            'cursor.x / cursor.y — mouse position',
            'enemy.x / enemy.y — target position',
            'aim — angle from player to cursor',
            'dist — distance from player to cursor',
            'pi — 3.14159...',
            'rand — random value per arcon (0-1)',
            'hp — current health',
            'maxHp — maximum health',
            'mana — current mana',
            'maxMana — maximum mana',
            'speed — player move speed',
            'arcons — active arcon count',
            'gameTime — total game elapsed time',
            'dt — frame delta time',
            'combo — combo counter',
            'kills — kill count',
            'floor — dungeon floor number',
            'level — player level',
            'dx / dy — aim direction unit vector',
            'vel — player velocity',
            'phase — cast phase counter',
            'entropy — random per-cast value (0-1)',
        ];
        console.log(`%c── ${vars.length} Available Variables ──`, 'color: #ff0; font-weight: bold');
        for (const v of vars) {
            console.log(`  %c${v}`, 'color: #0ff');
        }
    }

    // ── EXPOSE CONSOLE COMMANDS ──
    window.__arcane_dev = unlockDev;
    window.__arcane_loopholes = listLoopholes;
    window.__arcane_loophole = loopholeDetail;
    window.__arcane_functions = listFunctions;
    window.__arcane_vars = listVars;

    return {
        REGISTRY,
        DEV_SPELLS,
        DEV_CATEGORIES,
        isDevUnlocked: () => devUnlocked,
        unlockDev,
    };
})();
