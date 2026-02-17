// -----------------------------------------
//  AUDIO SYSTEM -- Procedural sounds + ambient music
//  All generated via Web Audio API, no external files
// -----------------------------------------

const Audio = (() => {
    let ctx = null;
    let masterGain = null;
    let musicGain = null;
    let sfxGain = null;
    let musicPlaying = false;
    let musicNodes = [];
    let currentTheme = null;

    function ensureCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.5;
            masterGain.connect(ctx.destination);
            musicGain = ctx.createGain();
            musicGain.gain.value = 0.25;
            musicGain.connect(masterGain);
            sfxGain = ctx.createGain();
            sfxGain.gain.value = 0.6;
            sfxGain.connect(masterGain);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // -- SFX Helpers --

    function playTone(freq, duration, type, vol, dest) {
        const c = ensureCtx();
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type || 'square';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(vol || 0.15, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
        osc.connect(g);
        g.connect(dest || sfxGain);
        osc.start(c.currentTime);
        osc.stop(c.currentTime + duration);
    }

    function playNoise(duration, vol, dest) {
        const c = ensureCtx();
        const bufSize = c.sampleRate * duration;
        const buf = c.createBuffer(1, bufSize, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        g.gain.setValueAtTime(vol || 0.1, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
        src.connect(g);
        g.connect(dest || sfxGain);
        src.start();
    }

    // -- Sound Effects --

    function cast() {
        playTone(600, 0.08, 'square', 0.12);
        playTone(900, 0.12, 'sine', 0.08);
    }

    function hit() {
        playNoise(0.06, 0.15);
        playTone(200, 0.08, 'square', 0.1);
    }

    function dash() {
        const c = ensureCtx();
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, c.currentTime + 0.15);
        g.gain.setValueAtTime(0.1, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
        osc.connect(g);
        g.connect(sfxGain);
        osc.start();
        osc.stop(c.currentTime + 0.15);
    }

    function enemyHit() {
        playTone(300, 0.06, 'square', 0.08);
        playNoise(0.04, 0.06);
    }

    function enemyDeath() {
        playTone(400, 0.1, 'square', 0.1);
        playTone(250, 0.15, 'square', 0.08);
        playNoise(0.1, 0.08);
    }

    function chest() {
        playTone(523, 0.1, 'square', 0.1);
        setTimeout(() => playTone(659, 0.1, 'square', 0.1), 80);
        setTimeout(() => playTone(784, 0.15, 'square', 0.1), 160);
    }

    function trap() {
        playTone(150, 0.12, 'sawtooth', 0.12);
        playNoise(0.08, 0.1);
    }

    function playerHurt() {
        playTone(180, 0.15, 'sawtooth', 0.15);
        playNoise(0.08, 0.12);
    }

    function bossRoar() {
        const c = ensureCtx();
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, c.currentTime);
        osc.frequency.linearRampToValueAtTime(40, c.currentTime + 0.6);
        g.gain.setValueAtTime(0.2, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
        osc.connect(g);
        g.connect(sfxGain);
        osc.start();
        osc.stop(c.currentTime + 0.6);
        playNoise(0.4, 0.15);
    }

    function floorClear() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => {
            setTimeout(() => playTone(f, 0.2, 'square', 0.1), i * 120);
        });
    }

    function death() {
        const c = ensureCtx();
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                playTone(200 - i * 30, 0.2, 'sawtooth', 0.1);
            }, i * 100);
        }
    }

    function menuClick() {
        playTone(800, 0.04, 'square', 0.06);
    }

    function stairsDown() {
        const c = ensureCtx();
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.4);
        g.gain.setValueAtTime(0.1, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
        osc.connect(g);
        g.connect(sfxGain);
        osc.start();
        osc.stop(c.currentTime + 0.4);
    }

    function dialogueBlip() {
        playTone(400 + Math.random() * 200, 0.03, 'square', 0.05);
    }

    // -- Ambient Music --
    // Generates a dark droning ambient track procedurally

    const THEME_NOTES = {
        egypt:   { base: 110, scale: [0, 2, 3, 5, 7, 8, 10] },   // A minor (exotic)
        hades:   { base: 98,  scale: [0, 1, 3, 5, 6, 8, 10] },   // G phrygian
        jungle:  { base: 130, scale: [0, 2, 4, 5, 7, 9, 11] },   // C major
        light:   { base: 146, scale: [0, 2, 4, 7, 9] },           // D pentatonic
        cyber:   { base: 82,  scale: [0, 3, 5, 7, 10] },          // E minor pentatonic
        stone:   { base: 73,  scale: [0, 1, 4, 5, 7, 8, 10] },   // D harmonic minor
    };

    function startMusic(themeName) {
        stopMusic();
        const c = ensureCtx();
        currentTheme = themeName;
        musicPlaying = true;

        const tn = THEME_NOTES[themeName] || THEME_NOTES.stone;

        // Drone bass
        const drone = c.createOscillator();
        const droneG = c.createGain();
        drone.type = 'triangle';
        drone.frequency.value = tn.base;
        droneG.gain.value = 0.08;
        drone.connect(droneG);
        droneG.connect(musicGain);
        drone.start();
        musicNodes.push(drone, droneG);

        // Sub bass
        const sub = c.createOscillator();
        const subG = c.createGain();
        sub.type = 'sine';
        sub.frequency.value = tn.base / 2;
        subG.gain.value = 0.06;
        sub.connect(subG);
        subG.connect(musicGain);
        sub.start();
        musicNodes.push(sub, subG);

        // Pad with LFO
        const pad = c.createOscillator();
        const padG = c.createGain();
        const lfo = c.createOscillator();
        const lfoG = c.createGain();
        pad.type = 'sine';
        pad.frequency.value = tn.base * 2;
        padG.gain.value = 0.04;
        lfo.type = 'sine';
        lfo.frequency.value = 0.3;
        lfoG.gain.value = 0.03;
        lfo.connect(lfoG);
        lfoG.connect(padG.gain);
        pad.connect(padG);
        padG.connect(musicGain);
        pad.start();
        lfo.start();
        musicNodes.push(pad, padG, lfo, lfoG);

        // Melodic arp (subtle random notes from scale)
        scheduleArp(tn);
    }

    let arpInterval = null;

    function scheduleArp(tn) {
        if (arpInterval) clearInterval(arpInterval);
        arpInterval = setInterval(() => {
            if (!musicPlaying || !ctx) return;
            const c = ctx;
            const note = tn.scale[Math.floor(Math.random() * tn.scale.length)];
            const octave = Math.random() > 0.5 ? 2 : 4;
            const freq = tn.base * octave * Math.pow(2, note / 12);

            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = Math.random() > 0.5 ? 'sine' : 'triangle';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.02, c.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.5);
            osc.connect(g);
            g.connect(musicGain);
            osc.start();
            osc.stop(c.currentTime + 1.5);
        }, 2000 + Math.random() * 3000);
    }

    function stopMusic() {
        musicPlaying = false;
        if (arpInterval) { clearInterval(arpInterval); arpInterval = null; }
        for (const n of musicNodes) {
            try { n.stop && n.stop(); } catch(e) {}
            try { n.disconnect(); } catch(e) {}
        }
        musicNodes = [];
        currentTheme = null;
    }

    function bossMusic() {
        stopMusic();
        const c = ensureCtx();
        musicPlaying = true;

        // Intense droning
        const drone = c.createOscillator();
        const droneG = c.createGain();
        drone.type = 'sawtooth';
        drone.frequency.value = 55;
        droneG.gain.value = 0.06;
        drone.connect(droneG);
        droneG.connect(musicGain);
        drone.start();
        musicNodes.push(drone, droneG);

        // Pulse
        const pulse = c.createOscillator();
        const pulseG = c.createGain();
        const pulseLFO = c.createOscillator();
        const pulseLFOG = c.createGain();
        pulse.type = 'square';
        pulse.frequency.value = 110;
        pulseG.gain.value = 0.04;
        pulseLFO.type = 'square';
        pulseLFO.frequency.value = 2;
        pulseLFOG.gain.value = 0.04;
        pulseLFO.connect(pulseLFOG);
        pulseLFOG.connect(pulseG.gain);
        pulse.connect(pulseG);
        pulseG.connect(musicGain);
        pulse.start();
        pulseLFO.start();
        musicNodes.push(pulse, pulseG, pulseLFO, pulseLFOG);
    }

    return {
        ensureCtx,
        cast, hit, dash, enemyHit, enemyDeath,
        chest, trap, playerHurt, bossRoar,
        floorClear, death, menuClick, stairsDown, dialogueBlip,
        startMusic, stopMusic, bossMusic,
    };
})();
