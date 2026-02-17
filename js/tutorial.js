// ─────────────────────────────────────────────
//  TUTORIAL — First-time walkthrough
// ─────────────────────────────────────────────

const Tutorial = (() => {
    const STORAGE_KEY = 'arcform-tutorial-done';

    const STEPS = [
        {
            title: 'Welcome, Mage! ✨',
            text: 'Arcane Formula is a spell-crafting combat game.\nYou build spells using math formulas, then battle other mages!',
            highlight: null,
            position: 'center',
        },
        {
            title: 'Choose Your Path',
            text: '<b>PVP Arena</b> — Battle other players online\n<b>Campaign</b> — Clear dungeons solo or co-op\n<b>Sandbox</b> — Test spells freely',
            highlight: '#mode-select',
            position: 'center',
        },
        {
            title: 'The Spellbook 📖',
            text: 'You have <b>6 spell slots</b>. Each spell is a math formula\nthat controls how your projectiles (arcons) move.\n\nUse the <b>tabs</b> at the top to switch spells.',
            highlight: '.spellbook-topbar',
            position: 'bottom',
        },
        {
            title: 'Building Spells',
            text: 'Each spell has 4 formulas:\n• <b>X(i,t)</b> — horizontal position\n• <b>Y(i,t)</b> — vertical position\n• <b>EMIT(i)</b> — spawn delay\n• <b>SIZE</b> — projectile size\n\nUse <b>BLOCKS</b> mode to drag-and-drop, or\n<b>FORMULA</b> mode to type expressions directly.',
            highlight: '.spell-editor-panel',
            position: 'right',
        },
        {
            title: 'Block Palette',
            text: 'Pick blocks from the palette on the right:\n• <b>Numbers</b> — constants like 100, 300\n• <b>Variables</b> — t (time), i (index), aim, etc.\n• <b>Operators</b> — +, -, *, /, ^\n• <b>Functions</b> — sin, cos, lerp, etc.',
            highlight: '.palette-panel',
            position: 'left',
        },
        {
            title: 'Spell Library',
            text: 'Click <b>LIB</b> to browse pre-made spells.\nDrag them onto a slot to equip them.\nGreat for learning how spells work!',
            highlight: '.library-tab',
            position: 'bottom',
        },
        {
            title: 'Ready Up!',
            text: 'When your spells are ready, click <b>READY</b>.\nIn multiplayer, everyone must be ready to start.\n\nYour spells auto-save to your browser.\nUse 💾 SAVE / 📂 LOAD to manage them.',
            highlight: '.spellbook-bottom',
            position: 'top',
        },
        {
            title: 'Controls',
            text: '<b>WASD</b> — Move\n<b>1-6</b> — Cast spells\n<b>SHIFT</b> — Dash (i-frames!)\n<b>SPACE</b> — Melee attack\n<b>ESC</b> — Pause menu\n\nAim with your <b>mouse cursor</b>.',
            highlight: null,
            position: 'center',
        },
        {
            title: 'You\'re Ready! 🔥',
            text: 'Go craft some spells and show them what arcane power looks like.\n\nYou can replay this tutorial from the Settings menu.',
            highlight: null,
            position: 'center',
        },
    ];

    let currentStep = 0;
    let overlay = null;
    let onComplete = null;

    function isFirstTime() {
        try { return !localStorage.getItem(STORAGE_KEY); } catch(e) { return false; }
    }

    function markComplete() {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch(e) {}
    }

    function resetTutorial() {
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
    }

    function start(cb) {
        currentStep = 0;
        onComplete = cb || null;
        buildOverlay();
        showStep(0);
    }

    function buildOverlay() {
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.className = 'tutorial-overlay';
        overlay.innerHTML = `
            <div class="tutorial-backdrop"></div>
            <div class="tutorial-card" id="tutorialCard">
                <div class="tutorial-step-indicator" id="tutorialSteps"></div>
                <h2 class="tutorial-title" id="tutorialTitle"></h2>
                <div class="tutorial-text" id="tutorialText"></div>
                <div class="tutorial-nav">
                    <button class="ws-btn" id="tutorialSkip">SKIP TUTORIAL</button>
                    <div style="flex:1"></div>
                    <button class="ws-btn" id="tutorialPrev" style="display:none">← BACK</button>
                    <button class="btn-gold" id="tutorialNext" style="padding:6px 20px;font-size:12px">NEXT →</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('tutorialNext').addEventListener('click', () => nextStep());
        document.getElementById('tutorialPrev').addEventListener('click', () => prevStep());
        document.getElementById('tutorialSkip').addEventListener('click', () => finish());
    }

    function showStep(idx) {
        currentStep = idx;
        const step = STEPS[idx];
        document.getElementById('tutorialTitle').textContent = step.title;
        document.getElementById('tutorialText').innerHTML = step.text.replace(/\n/g, '<br>');

        // Step indicators
        const stepsEl = document.getElementById('tutorialSteps');
        stepsEl.innerHTML = '';
        for (let i = 0; i < STEPS.length; i++) {
            const dot = document.createElement('span');
            dot.className = 'tutorial-dot' + (i === idx ? ' active' : '') + (i < idx ? ' done' : '');
            stepsEl.appendChild(dot);
        }

        // Nav buttons
        document.getElementById('tutorialPrev').style.display = idx > 0 ? 'inline-block' : 'none';
        const nextBtn = document.getElementById('tutorialNext');
        nextBtn.textContent = idx === STEPS.length - 1 ? 'START PLAYING!' : 'NEXT →';

        // Highlight
        const card = document.getElementById('tutorialCard');
        card.className = 'tutorial-card tutorial-pos-' + step.position;
    }

    function nextStep() {
        if (currentStep < STEPS.length - 1) {
            showStep(currentStep + 1);
        } else {
            finish();
        }
    }

    function prevStep() {
        if (currentStep > 0) showStep(currentStep - 1);
    }

    function finish() {
        markComplete();
        if (overlay) { overlay.remove(); overlay = null; }
        if (onComplete) onComplete();
    }

    return { isFirstTime, start, resetTutorial, markComplete };
})();
