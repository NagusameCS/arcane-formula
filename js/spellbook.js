// ─────────────────────────────────────────────
//  SPELLBOOK — Carousel with Block Editors
// ─────────────────────────────────────────────

const Spellbook = (() => {
    let spells = []; // { name, cost, editors:{x,y,emit,width} }
    let currentSlot = 0;
    let ready = false;
    let onReadyCallback = null;

    function init(onReady) {
        onReadyCallback = onReady;
        ready = false;
        spells = [];
        currentSlot = 0;

        for (let i = 0; i < 6; i++) {
            const def = Blocks.DEFAULTS[i];
            spells.push({
                name: def.name,
                cost: def.cost,
                trees: { x: Blocks.cloneNode(def.x), y: Blocks.cloneNode(def.y), emit: Blocks.cloneNode(def.emit), width: Blocks.cloneNode(def.width) },
                editors: {},
            });
        }
    }

    function buildUI() {
        const track = document.getElementById('carouselTrack');
        track.innerHTML = '';
        const dots = document.getElementById('carouselDots');
        dots.innerHTML = '';

        for (let i = 0; i < 6; i++) {
            const spell = spells[i];

            // Dot
            const dot = document.createElement('div');
            dot.className = 'carousel-dot' + (i === currentSlot ? ' active' : '');
            dot.addEventListener('click', () => goTo(i));
            dots.appendChild(dot);

            // Card
            const card = document.createElement('div');
            card.className = 'spell-card';
            card.id = `spell-card-${i}`;

            // Header row
            const top = document.createElement('div');
            top.className = 'card-top';
            top.innerHTML = `
                <div class="card-key">${i + 1}</div>
                <input class="card-name" value="${spell.name}" data-idx="${i}" placeholder="Spell Name">
                <div class="card-cost"><span>N =</span><input type="number" value="${spell.cost}" min="1" max="100" data-idx="${i}" class="cost-input"><span>arcons</span></div>
            `;
            card.appendChild(top);

            // Block editors for each formula
            const editorArea = document.createElement('div');
            editorArea.className = 'block-editor-area';

            const formulas = [
                { key: 'x(i,t)', tree: spell.trees.x, prop: 'x' },
                { key: 'y(i,t)', tree: spell.trees.y, prop: 'y' },
                { key: 'emit_delay(i)', tree: spell.trees.emit, prop: 'emit' },
                { key: 'width', tree: spell.trees.width, prop: 'width' },
            ];

            for (const f of formulas) {
                const editorContainer = document.createElement('div');
                editorContainer.style.marginBottom = '4px';
                const editor = Blocks.createEditor(editorContainer, f.key, f.tree, (newRoot) => {
                    spell.trees[f.prop] = newRoot;
                });
                spell.editors[f.prop] = editor;
                editorArea.appendChild(editorContainer);
            }

            card.appendChild(editorArea);
            track.appendChild(card);
        }

        // Event listeners for name/cost inputs
        track.querySelectorAll('.card-name').forEach(inp => {
            inp.addEventListener('input', (e) => {
                spells[parseInt(e.target.dataset.idx)].name = e.target.value;
            });
        });
        track.querySelectorAll('.cost-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                spells[parseInt(e.target.dataset.idx)].cost = Math.max(1, Math.min(100, parseInt(e.target.value) || 1));
            });
        });

        // Carousel arrows
        document.getElementById('prevSpell').onclick = () => goTo(currentSlot - 1);
        document.getElementById('nextSpell').onclick = () => goTo(currentSlot + 1);

        // Ready button
        document.getElementById('readyBtn').onclick = () => {
            ready = true;
            document.getElementById('readyBtn').textContent = 'WAITING...';
            document.getElementById('readyBtn').style.opacity = '0.5';
            if (onReadyCallback) onReadyCallback(compileSpells());
        };

        goTo(0);
    }

    function goTo(idx) {
        currentSlot = Math.max(0, Math.min(5, idx));
        const track = document.getElementById('carouselTrack');
        track.style.transform = `translateX(-${currentSlot * 100}%)`;

        // Update dots
        document.querySelectorAll('.carousel-dot').forEach((d, i) => {
            d.classList.toggle('active', i === currentSlot);
        });
    }

    function compileSpells() {
        const compiled = [];
        for (const spell of spells) {
            try {
                const xExpr = Blocks.toExpr(spell.trees.x);
                const yExpr = Blocks.toExpr(spell.trees.y);
                const emitExpr = Blocks.toExpr(spell.trees.emit);
                const widthExpr = Blocks.toExpr(spell.trees.width);

                compiled.push({
                    name: spell.name || 'Unnamed',
                    cost: spell.cost,
                    xFn: Parser.compile(xExpr),
                    yFn: Parser.compile(yExpr),
                    emitDelayFn: Parser.compile(emitExpr),
                    widthFn: Parser.compile(widthExpr),
                    xExpr, yExpr, emitExpr, widthExpr, // for network sync
                    cooldown: Math.max(0.5, spell.cost * 0.03),
                    currentCooldown: 0,
                });
            } catch (e) {
                // Fallback bolt
                compiled.push({
                    name: spell.name || 'ERROR',
                    cost: spell.cost,
                    xFn: Parser.compile('player.x + cos(aim) * 200 * t'),
                    yFn: Parser.compile('player.y + sin(aim) * 200 * t'),
                    emitDelayFn: Parser.compile('i * 0.02'),
                    widthFn: Parser.compile('4'),
                    cooldown: 1, currentCooldown: 0,
                });
            }
        }
        return compiled;
    }

    function show() {
        buildUI();
        document.getElementById('spellbook-ui').classList.remove('hidden');
    }

    function hide() {
        document.getElementById('spellbook-ui').classList.add('hidden');
    }

    function updateStatus(text) {
        document.getElementById('readyStatus').textContent = text;
    }

    function resetReady() {
        ready = false;
        const btn = document.getElementById('readyBtn');
        if (btn) { btn.textContent = 'READY'; btn.style.opacity = '1'; }
    }

    return { init, show, hide, compileSpells, updateStatus, resetReady, isReady: () => ready };
})();
