// -----------------------------------------
//  CUTSCENE / DIALOGUE SYSTEM
//  Boss intro dialogue, mid-fight taunts, floor intros
// -----------------------------------------

const Cutscene = (() => {
    let active = false;
    let lines = [];
    let lineIndex = 0;
    let charIndex = 0;
    let charTimer = 0;
    let displayText = '';
    let speakerName = '';
    let speakerColor = '#ffd700';
    let onComplete = null;
    let waitingForInput = false;
    let skipCooldown = 0;

    const CHAR_SPEED = 0.025; // seconds per character
    const LINE_PAUSE = 0.4;

    // -- Boss Dialogue Data --
    const BOSS_INTRO = {
        'Pharaoh Khet': {
            color: '#ffd700',
            lines: [
                'You dare trespass in the Tomb of Ra?',
                'A thousand years I have guarded these halls.',
                'Your magic is nothing before the power of the sun.',
                'Prepare to be entombed forever, mage.',
            ],
        },
        'Lord Thanatos': {
            color: '#ff4500',
            lines: [
                'Another soul wanders into my domain...',
                'The living do not belong in the Halls of Hades.',
                'Your fire will be snuffed out like all the rest.',
                'Come. Let death embrace you.',
            ],
        },
        'Elder Thornback': {
            color: '#32cd32',
            lines: [
                'The forest stirs at your intrusion.',
                'I have grown for ten thousand seasons, little mage.',
                'Your spells will wither against my roots.',
                'The Verdant Depths will consume you.',
            ],
        },
        'Archon Solaris': {
            color: '#fff8dc',
            lines: [
                'You stand before the light eternal.',
                'I am the guardian of this sanctum.',
                'Your shadow magic offends the radiance.',
                'Be purified.',
            ],
        },
        'Core Override': {
            color: '#00ffff',
            lines: [
                'INTRUSION DETECTED. THREAT LEVEL: HIGH.',
                'DEPLOYING COUNTERMEASURES.',
                'YOUR BIOLOGICAL FORM IS INEFFICIENT.',
                'INITIATING TERMINATION PROTOCOL.',
            ],
        },
        'Lich King Morthul': {
            color: '#9b59b6',
            lines: [
                'At last... a mage worthy of my attention.',
                'I have consumed the souls of a hundred archmages.',
                'Your formulas are crude. Your arcons, weak.',
                'But I shall enjoy dismantling them regardless.',
                'Kneel before the Lich King.',
            ],
        },
    };

    const BOSS_TAUNT = {
        'Pharaoh Khet': [
            'The sun burns brighter!',
            'You cannot escape the sands!',
            'Rise, my servants!',
        ],
        'Lord Thanatos': [
            'Death is patient...',
            'Your soul weakens!',
            'There is no escape from Hades!',
        ],
        'Elder Thornback': [
            'The roots grow deeper!',
            'Nature reclaims all!',
            'Wither and decay!',
        ],
        'Archon Solaris': [
            'The light blinds you!',
            'You cannot hide from radiance!',
            'Be cleansed!',
        ],
        'Core Override': [
            'RECALIBRATING...',
            'POWER SURGE INITIATED.',
            'ERROR: TARGET STILL ALIVE.',
        ],
        'Lich King Morthul': [
            'Amusing... but futile.',
            'Your mana feeds my power!',
            'I have foreseen your every move.',
        ],
    };

    const FLOOR_INTRO = {
        egypt:   { speaker: '???', color: '#ffd700', text: 'The air is thick with dust. Ancient glyphs pulse on the walls...' },
        hades:   { speaker: '???', color: '#ff4500', text: 'Flames lick the stone. The screams of the damned echo from below...' },
        jungle:  { speaker: '???', color: '#32cd32', text: 'Vines twist around crumbling pillars. Something watches from the shadows...' },
        light:   { speaker: '???', color: '#fff8dc', text: 'Blinding white marble stretches endlessly. A humming resonates in your chest...' },
        cyber:   { speaker: '???', color: '#00ffff', text: 'Holographic panels flicker. Data streams cascade along the corridors...' },
        stone:   { speaker: '???', color: '#9b59b6', text: 'The catacombs groan with the weight of ages. Death lingers in every corner...' },
    };

    function startBossIntro(bossName, callback) {
        const data = BOSS_INTRO[bossName];
        if (!data) { if (callback) callback(); return; }

        active = true;
        speakerName = bossName;
        speakerColor = data.color;
        lines = data.lines.slice();
        lineIndex = 0;
        charIndex = 0;
        charTimer = 0;
        displayText = '';
        waitingForInput = false;
        skipCooldown = 0.3;
        onComplete = callback;
    }

    function startFloorIntro(themeName, callback) {
        const data = FLOOR_INTRO[themeName];
        if (!data) { if (callback) callback(); return; }

        active = true;
        speakerName = data.speaker;
        speakerColor = data.color;
        lines = [data.text];
        lineIndex = 0;
        charIndex = 0;
        charTimer = 0;
        displayText = '';
        waitingForInput = false;
        skipCooldown = 0.3;
        onComplete = callback;
    }

    function getBossTaunt(bossName) {
        const taunts = BOSS_TAUNT[bossName];
        if (!taunts || taunts.length === 0) return null;
        return taunts[Math.floor(Math.random() * taunts.length)];
    }

    function update(dt) {
        if (!active) return;
        if (skipCooldown > 0) skipCooldown -= dt;

        if (waitingForInput) return;

        const currentLine = lines[lineIndex];
        if (!currentLine) { finish(); return; }

        charTimer += dt;
        while (charTimer >= CHAR_SPEED && charIndex < currentLine.length) {
            charTimer -= CHAR_SPEED;
            displayText += currentLine[charIndex];
            charIndex++;
            // Blip sound every few characters
            if (charIndex % 3 === 0 && typeof Audio !== 'undefined') {
                Audio.dialogueBlip();
            }
        }

        if (charIndex >= currentLine.length) {
            waitingForInput = true;
        }
    }

    function advance() {
        if (!active) return;
        if (skipCooldown > 0) return;

        if (!waitingForInput) {
            // Skip to end of line
            displayText = lines[lineIndex] || '';
            charIndex = displayText.length;
            waitingForInput = true;
            return;
        }

        lineIndex++;
        if (lineIndex >= lines.length) {
            finish();
            return;
        }
        charIndex = 0;
        charTimer = 0;
        displayText = '';
        waitingForInput = false;
        skipCooldown = 0.1;
    }

    function finish() {
        active = false;
        lines = [];
        lineIndex = 0;
        displayText = '';
        const cb = onComplete;
        onComplete = null;
        if (cb) cb();
    }

    function render(ctx, W, H) {
        if (!active) return;

        // Dim background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, W, H);

        // Dialogue box
        const boxH = 110;
        const boxY = H - boxH - 20;
        const boxX = 40;
        const boxW = W - 80;

        // Box background
        ctx.fillStyle = 'rgba(10, 8, 6, 0.95)';
        ctx.fillRect(boxX, boxY, boxW, boxH);

        // Box border
        ctx.strokeStyle = speakerColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Inner border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + 3, boxY + 3, boxW - 6, boxH - 6);

        // Speaker name plate
        ctx.fillStyle = 'rgba(10, 8, 6, 0.95)';
        const nameW = speakerName.length * 10 + 24;
        ctx.fillRect(boxX + 16, boxY - 14, nameW, 22);
        ctx.strokeStyle = speakerColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + 16, boxY - 14, nameW, 22);

        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = speakerColor;
        ctx.textAlign = 'left';
        ctx.fillText(speakerName, boxX + 24, boxY - 1);

        // Dialogue text
        ctx.font = '13px "Courier New", monospace';
        ctx.fillStyle = '#d4c5a0';
        ctx.textAlign = 'left';

        // Word wrap
        const maxLineW = boxW - 40;
        const words = displayText.split(' ');
        let line = '';
        let ty = boxY + 30;
        for (const word of words) {
            const test = line + (line ? ' ' : '') + word;
            const w = ctx.measureText(test).width;
            if (w > maxLineW && line) {
                ctx.fillText(line, boxX + 20, ty);
                ty += 18;
                line = word;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, boxX + 20, ty);

        // Continue prompt
        if (waitingForInput) {
            const blink = Math.sin(performance.now() / 300) > 0;
            if (blink) {
                ctx.fillStyle = speakerColor;
                ctx.font = '10px "Courier New", monospace';
                ctx.textAlign = 'right';
                ctx.fillText('[CLICK / SPACE]', boxX + boxW - 16, boxY + boxH - 12);
            }
        }

        // Decorative corners
        ctx.strokeStyle = speakerColor;
        ctx.lineWidth = 2;
        const cs = 8;
        // Top-left
        ctx.beginPath(); ctx.moveTo(boxX, boxY + cs); ctx.lineTo(boxX, boxY); ctx.lineTo(boxX + cs, boxY); ctx.stroke();
        // Top-right
        ctx.beginPath(); ctx.moveTo(boxX + boxW - cs, boxY); ctx.lineTo(boxX + boxW, boxY); ctx.lineTo(boxX + boxW, boxY + cs); ctx.stroke();
        // Bottom-left
        ctx.beginPath(); ctx.moveTo(boxX, boxY + boxH - cs); ctx.lineTo(boxX, boxY + boxH); ctx.lineTo(boxX + cs, boxY + boxH); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(boxX + boxW - cs, boxY + boxH); ctx.lineTo(boxX + boxW, boxY + boxH); ctx.lineTo(boxX + boxW, boxY + boxH - cs); ctx.stroke();
    }

    // Floating taunt text above boss
    let taunts = []; // { text, x, y, life, maxLife, color }

    function showTaunt(text, x, y, color) {
        taunts.push({
            text, x, y, life: 2.5, maxLife: 2.5,
            color: color || '#ff4444',
        });
    }

    function updateTaunts(dt) {
        for (let i = taunts.length - 1; i >= 0; i--) {
            taunts[i].life -= dt;
            taunts[i].y -= 15 * dt;
            if (taunts[i].life <= 0) taunts.splice(i, 1);
        }
    }

    function renderTaunts(ctx, camX, camY) {
        for (const t of taunts) {
            const sx = t.x - camX;
            const sy = t.y - camY;
            if (sx < -200 || sx > 1200 || sy < -50 || sy > 600) continue;
            const alpha = Math.min(1, t.life / 0.5) * (t.life / t.maxLife);
            ctx.globalAlpha = alpha * 0.9;
            ctx.font = 'bold 11px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000';
            ctx.fillText(t.text, sx + 1, sy + 1);
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, sx, sy);
            ctx.globalAlpha = 1;
        }
    }

    return {
        isActive: () => active,
        startBossIntro, startFloorIntro, getBossTaunt,
        update, advance, render,
        showTaunt, updateTaunts, renderTaunts,
    };
})();
