// ─────────────────────────────────────────────
//  SPELLBOOK — Tabbed Editor with Side Palette
// ─────────────────────────────────────────────

const Spellbook = (() => {
    let spells = [];
    let currentSpell = 0;
    let currentFormula = 'x'; // 'x','y','emit','width'
    let ready = false;
    let onReadyCallback = null;

    // Each spell has 4 block editor instances
    // But we only show one at a time (via formula tabs)
    let editors = {}; // editors[spellIdx][formulaProp] = editor instance
    let editorMode = 'blocks'; // 'blocks' or 'formula'

    const FORMULA_KEYS = [
        { prop: 'x', label: 'X(i,t)', desc: 'Horizontal position' },
        { prop: 'y', label: 'Y(i,t)', desc: 'Vertical position' },
        { prop: 'emit', label: 'EMIT(i)', desc: 'Emit delay' },
        { prop: 'width', label: 'SIZE', desc: 'Arcon size' },
    ];

    function init(onReady) {
        onReadyCallback = onReady;
        ready = false;
        spells = [];
        editors = {};
        currentSpell = 0;
        currentFormula = 'x';

        for (let i = 0; i < 6; i++) {
            const def = Blocks.DEFAULTS[i];
            spells.push({
                name: def.name,
                cost: def.cost,
                trees: {
                    x: Blocks.cloneNode(def.x),
                    y: Blocks.cloneNode(def.y),
                    emit: Blocks.cloneNode(def.emit),
                    width: Blocks.cloneNode(def.width),
                },
            });
            editors[i] = {};
        }

        // Auto-load from localStorage if available
        loadFromLocalStorage();
    }

    function buildUI() {
        // Build spell tabs
        const tabsEl = document.getElementById('spellTabs');
        tabsEl.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const tab = document.createElement('button');
            tab.className = 'spell-tab' + (i === currentSpell ? ' active' : '');
            tab.innerHTML = `<span class="tab-num">${i + 1}</span><span class="tab-name">${spells[i].name}</span>`;
            tab.addEventListener('click', () => switchSpell(i));
            tabsEl.appendChild(tab);
        }

        // Library browse button
        const libBtn = document.createElement('button');
        libBtn.className = 'spell-tab library-tab';
        libBtn.innerHTML = '<span class="tab-num">LIB</span><span class="tab-name">LIBRARY</span>';
        libBtn.addEventListener('click', toggleLibrary);
        tabsEl.appendChild(libBtn);

        // Build palette (shared across all spells)
        buildPalette();

        // Build the editor for current spell
        buildEditorPanel();

        // Build spell library panel (hidden by default)
        buildLibraryPanel();

        // Ready button
        document.getElementById('readyBtn').onclick = () => {
            ready = true;
            document.getElementById('readyBtn').textContent = 'WAITING...';
            document.getElementById('readyBtn').style.opacity = '0.5';
            saveToLocalStorage(); // auto-save on ready
            if (onReadyCallback) onReadyCallback(compileSpells());
        };

        // Save/Load/Export/Import buttons in the bottom bar
        const bottomEl = document.querySelector('.spellbook-bottom');
        if (bottomEl) {
            const ioRow = document.createElement('div');
            ioRow.className = 'spellbook-io-row';
            const saveBtn = document.createElement('button');
            saveBtn.className = 'ws-btn';
            saveBtn.textContent = '💾 SAVE';
            saveBtn.title = 'Save spellbook to browser';
            saveBtn.addEventListener('click', () => { saveToLocalStorage(); saveBtn.textContent = '✓ SAVED'; setTimeout(() => saveBtn.textContent = '💾 SAVE', 1500); });
            ioRow.appendChild(saveBtn);

            const loadBtn = document.createElement('button');
            loadBtn.className = 'ws-btn';
            loadBtn.textContent = '📂 LOAD';
            loadBtn.title = 'Load spellbook from browser';
            loadBtn.addEventListener('click', () => { if (loadFromLocalStorage()) { loadBtn.textContent = '✓ LOADED'; setTimeout(() => loadBtn.textContent = '📂 LOAD', 1500); buildUI(); } });
            ioRow.appendChild(loadBtn);

            const exportBtn = document.createElement('button');
            exportBtn.className = 'ws-btn';
            exportBtn.textContent = '⬇ EXPORT';
            exportBtn.title = 'Export to .spellbook file';
            exportBtn.addEventListener('click', exportSpellbook);
            ioRow.appendChild(exportBtn);

            const importBtn = document.createElement('button');
            importBtn.className = 'ws-btn';
            importBtn.textContent = '⬆ IMPORT';
            importBtn.title = 'Import from .spellbook file';
            importBtn.addEventListener('click', importSpellbook);
            ioRow.appendChild(importBtn);

            bottomEl.insertBefore(ioRow, bottomEl.firstChild);
        }
    }

    function buildPalette() {
        const paletteEl = document.getElementById('blockPalette');
        paletteEl.innerHTML = '';

        const categories = [
            {
                label: 'Numbers',
                cls: 'block-num',
                items: Blocks.PALETTE.numbers,
                fmt: (item) => String(item.value),
            },
            {
                label: 'Variables',
                cls: 'block-var',
                items: Blocks.PALETTE.variables,
                fmt: (item) => item.name,
            },
            {
                label: 'Operators',
                cls: 'block-op',
                items: Blocks.PALETTE.operators,
                fmt: (item) => `□ ${item.op} □`,
            },
            {
                label: 'Functions',
                cls: 'block-func',
                items: Blocks.PALETTE.functions,
                fmt: (item) => item.name + '(' + item.args.map(() => '□').join(', ') + ')',
            },
        ];

        for (const cat of categories) {
            const section = document.createElement('div');
            section.className = 'palette-category';

            const label = document.createElement('div');
            label.className = 'palette-cat-label';
            label.textContent = cat.label;
            section.appendChild(label);

            const items = document.createElement('div');
            items.className = 'palette-cat-items';

            for (const item of cat.items) {
                const el = document.createElement('span');
                el.className = 'block ' + cat.cls;
                el.textContent = cat.fmt(item);
                el.addEventListener('click', () => {
                    const editor = getCurrentEditor();
                    if (editor) editor.insertBlock(Blocks.cloneNode(item));
                });
                items.appendChild(el);
            }
            section.appendChild(items);
            paletteEl.appendChild(section);
        }
    }

    function buildEditorPanel() {
        const panel = document.getElementById('spellEditorPanel');
        panel.innerHTML = '';
        const spell = spells[currentSpell];

        // Header: name + cost
        const header = document.createElement('div');
        header.className = 'spell-header';
        header.innerHTML = `
            <div class="card-key">${currentSpell + 1}</div>
            <input class="card-name" value="${spell.name}" placeholder="Spell Name" id="currentSpellName">
            <div class="card-cost">
                <span>N =</span>
                <input type="number" value="${spell.cost}" min="1" max="100" id="currentSpellCost">
                <span>arcons</span>
            </div>
        `;
        panel.appendChild(header);

        // Name/cost listeners
        header.querySelector('#currentSpellName').addEventListener('input', (e) => {
            spell.name = e.target.value;
            updateSpellTab(currentSpell);
        });
        header.querySelector('#currentSpellCost').addEventListener('input', (e) => {
            spell.cost = Math.max(1, Math.min(100, parseInt(e.target.value) || 1));
        });

        // Formula tabs
        const formulaTabs = document.createElement('div');
        formulaTabs.className = 'formula-tabs';
        for (const fk of FORMULA_KEYS) {
            const tab = document.createElement('button');
            tab.className = 'formula-tab' + (fk.prop === currentFormula ? ' active' : '');
            tab.textContent = fk.label;
            tab.title = fk.desc;
            tab.addEventListener('click', () => switchFormula(fk.prop));
            formulaTabs.appendChild(tab);
        }
        panel.appendChild(formulaTabs);

        // Editor mode toggle (Blocks vs Formula text)
        const modeRow = document.createElement('div');
        modeRow.className = 'editor-mode-row';
        const blocksBtn = document.createElement('button');
        blocksBtn.className = 'editor-mode-btn' + (editorMode === 'blocks' ? ' active' : '');
        blocksBtn.textContent = '🧱 BLOCKS';
        blocksBtn.addEventListener('click', () => { editorMode = 'blocks'; buildEditorPanel(); });
        const formulaBtn = document.createElement('button');
        formulaBtn.className = 'editor-mode-btn' + (editorMode === 'formula' ? ' active' : '');
        formulaBtn.textContent = '✏️ FORMULA';
        formulaBtn.addEventListener('click', () => { editorMode = 'formula'; buildEditorPanel(); });
        modeRow.appendChild(blocksBtn);
        modeRow.appendChild(formulaBtn);
        panel.appendChild(modeRow);

        // LaTeX preview
        const latexEl = document.createElement('div');
        latexEl.className = 'latex-preview';
        latexEl.id = 'latexPreview';
        panel.appendChild(latexEl);

        if (editorMode === 'formula') {
            // Formula text input mode
            const formulaInput = document.createElement('textarea');
            formulaInput.className = 'formula-text-input';
            formulaInput.id = 'formulaTextInput';
            formulaInput.placeholder = 'e.g. player.x + cos(aim) * 300 * t';
            // Get current expression from tree
            const currentExpr = spell.trees[currentFormula] ? Blocks.toExpr(spell.trees[currentFormula]) : '0';
            formulaInput.value = currentExpr;
            formulaInput.spellcheck = false;

            // Live parse & preview
            const updateFromText = () => {
                try {
                    const expr = formulaInput.value.trim() || '0';
                    Parser.compile(expr); // test if it parses
                    formulaInput.style.borderColor = 'var(--gold)';
                    // Update LaTeX preview from text
                    try { katex.render(expr.replace(/\*/g, ' \\cdot ').replace(/pi/g, '\\pi'), latexEl, { throwOnError: false, displayMode: true }); } catch(e) { latexEl.textContent = expr; }
                } catch(e) {
                    formulaInput.style.borderColor = 'var(--red)';
                }
            };
            formulaInput.addEventListener('input', updateFromText);

            // On blur, commit to a tree (or store raw expression)
            formulaInput.addEventListener('blur', () => {
                try {
                    const expr = formulaInput.value.trim() || '0';
                    Parser.compile(expr); // validate
                    // Store as a raw expression marker
                    spell.trees[currentFormula] = { type: 'raw', expr };
                } catch(e) { /* keep old tree */ }
            });

            panel.appendChild(formulaInput);
            setTimeout(updateFromText, 0);

            // Toolbar
            const toolbar = document.createElement('div');
            toolbar.className = 'workspace-toolbar';
            const clearBtn = document.createElement('button');
            clearBtn.className = 'ws-btn danger';
            clearBtn.textContent = 'CLEAR';
            clearBtn.addEventListener('click', () => {
                formulaInput.value = '0';
                spell.trees[currentFormula] = null;
            });
            toolbar.appendChild(clearBtn);
            const resetBtn = document.createElement('button');
            resetBtn.className = 'ws-btn';
            resetBtn.textContent = 'RESET TO DEFAULT';
            resetBtn.addEventListener('click', () => {
                const def = Blocks.DEFAULTS[currentSpell];
                const defaultTree = def[currentFormula];
                if (defaultTree) {
                    spell.trees[currentFormula] = Blocks.cloneNode(defaultTree);
                    formulaInput.value = Blocks.toExpr(defaultTree);
                }
            });
            toolbar.appendChild(resetBtn);
            panel.appendChild(toolbar);
        } else {
            // Block workspace (original mode)
            const workspace = document.createElement('div');
            workspace.className = 'block-workspace';
            workspace.id = 'blockWorkspace';
            panel.appendChild(workspace);

            // Toolbar
            const toolbar = document.createElement('div');
            toolbar.className = 'workspace-toolbar';

            const clearBtn = document.createElement('button');
            clearBtn.className = 'ws-btn danger';
            clearBtn.textContent = 'CLEAR';
            clearBtn.addEventListener('click', () => {
                const editor = getCurrentEditor();
                if (editor) {
                    spell.trees[currentFormula] = null;
                    editor.setRoot(null);
                }
            });
            toolbar.appendChild(clearBtn);

            const resetBtn = document.createElement('button');
            resetBtn.className = 'ws-btn';
            resetBtn.textContent = 'RESET TO DEFAULT';
            resetBtn.addEventListener('click', () => {
                const def = Blocks.DEFAULTS[currentSpell];
                const defaultTree = def[currentFormula];
                if (defaultTree) {
                    const clone = Blocks.cloneNode(defaultTree);
                    spell.trees[currentFormula] = clone;
                    const editor = getCurrentEditor();
                    if (editor) editor.setRoot(clone);
                }
            });
            toolbar.appendChild(resetBtn);
            panel.appendChild(toolbar);

            // Initialize/re-initialize the block editor for this formula
            initEditor(currentSpell, currentFormula);
        }
    }

    function initEditor(spellIdx, formulaProp) {
        const spell = spells[spellIdx];
        const workspace = document.getElementById('blockWorkspace');
        const latexEl = document.getElementById('latexPreview');

        // Create a new editor instance bound to the workspace
        const editor = Blocks.createEditorInPlace(workspace, latexEl, spell.trees[formulaProp], (newRoot) => {
            spell.trees[formulaProp] = newRoot;
        });

        editors[spellIdx][formulaProp] = editor;
    }

    function getCurrentEditor() {
        if (editors[currentSpell] && editors[currentSpell][currentFormula]) {
            return editors[currentSpell][currentFormula];
        }
        return null;
    }

    function switchSpell(idx) {
        currentSpell = idx;
        // Update spell tabs
        document.querySelectorAll('.spell-tab').forEach((t, i) => {
            t.classList.toggle('active', i === idx);
        });
        buildEditorPanel();
    }

    function switchFormula(prop) {
        currentFormula = prop;
        buildEditorPanel();
    }

    function updateSpellTab(idx) {
        const tabs = document.querySelectorAll('.spell-tab');
        if (tabs[idx]) {
            const nameEl = tabs[idx].querySelector('.tab-name');
            if (nameEl) nameEl.textContent = spells[idx].name || 'Unnamed';
        }
    }

    let libraryVisible = false;

    function toggleLibrary() {
        libraryVisible = !libraryVisible;
        const libPanel = document.getElementById('libraryPanel');
        const editorPanel = document.getElementById('spellEditorPanel');
        if (libPanel) libPanel.classList.toggle('hidden', !libraryVisible);
        if (editorPanel) editorPanel.classList.toggle('hidden', libraryVisible);
    }

    function buildLibraryPanel() {
        // Check if SpellLibrary exists
        if (typeof SpellLibrary === 'undefined') return;

        let libPanel = document.getElementById('libraryPanel');
        if (!libPanel) {
            libPanel = document.createElement('div');
            libPanel.id = 'libraryPanel';
            libPanel.className = 'spell-library-panel hidden';
            const main = document.querySelector('.spellbook-main');
            if (main) main.insertBefore(libPanel, main.firstChild);
        }
        libPanel.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'library-header';
        header.innerHTML = '<h3>SPELL LIBRARY</h3><p>Drag a spell to a slot tab above to equip it</p>';
        libPanel.appendChild(header);

        // Spell dock drop zones
        let dockEl = document.getElementById('spellDock');
        if (dockEl) {
            dockEl.innerHTML = '';
            for (let i = 0; i < 6; i++) {
                const slot = document.createElement('div');
                slot.className = 'dock-slot';
                slot.dataset.slotIndex = i;
                slot.innerHTML = '<span class="dock-num">' + (i + 1) + '</span><span class="dock-name">' + (spells[i].name || 'Empty') + '</span>';
                slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drag-over'); });
                slot.addEventListener('dragleave', () => { slot.classList.remove('drag-over'); });
                slot.addEventListener('drop', (e) => {
                    e.preventDefault();
                    slot.classList.remove('drag-over');
                    try {
                        const libSpellName = e.dataTransfer.getData('text/plain');
                        const allSpells = SpellLibrary.getAll();
                        const libSpell = allSpells.find(s => s.name === libSpellName);
                        if (libSpell) {
                            equipLibrarySpellToSlot(libSpell, i);
                            updateDockSlots();
                        }
                    } catch(err) {}
                });
                dockEl.appendChild(slot);
            }
        }

        const categories = SpellLibrary.getCategories();
        for (const cat of categories) {
            const catSpells = SpellLibrary.getByCategory(cat);
            if (catSpells.length === 0) continue;

            const section = document.createElement('div');
            section.className = 'library-category';

            const catLabel = document.createElement('div');
            catLabel.className = 'library-cat-label';
            catLabel.textContent = cat.toUpperCase();
            section.appendChild(catLabel);

            const grid = document.createElement('div');
            grid.className = 'library-grid';

            for (const libSpell of catSpells) {
                const card = document.createElement('div');
                card.className = 'library-card';
                card.draggable = true;

                const name = document.createElement('div');
                name.className = 'library-card-name';
                name.textContent = libSpell.name;

                const desc = document.createElement('div');
                desc.className = 'library-card-desc';
                desc.textContent = libSpell.desc || '';
                desc.style.color = 'var(--dim)'; // Ensure descriptions are never red

                card.appendChild(name);
                card.appendChild(desc);

                card.addEventListener('click', () => {
                    equipLibrarySpell(libSpell);
                });

                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', libSpell.name);
                    e.dataTransfer.effectAllowed = 'copy';
                    card.classList.add('dragging');
                });
                card.addEventListener('dragend', () => {
                    card.classList.remove('dragging');
                });

                grid.appendChild(card);
            }

            section.appendChild(grid);
            libPanel.appendChild(section);
        }
    }

    function equipLibrarySpell(libSpell) {
        equipLibrarySpellToSlot(libSpell, currentSpell);
    }

    function equipLibrarySpellToSlot(libSpell, slotIdx) {
        const spell = spells[slotIdx];
        spell.name = libSpell.name;
        spell.cost = libSpell.cost;
        spell.trees = {
            x: Blocks.cloneNode(libSpell.x),
            y: Blocks.cloneNode(libSpell.y),
            emit: Blocks.cloneNode(libSpell.emit),
            width: Blocks.cloneNode(libSpell.width),
        };
        editors[slotIdx] = {};
        updateSpellTab(slotIdx);
        updateDockSlots();

        // If editing this slot, switch back to editor
        if (slotIdx === currentSpell) {
            libraryVisible = false;
            const libPanel = document.getElementById('libraryPanel');
            const editorPanel = document.getElementById('spellEditorPanel');
            if (libPanel) libPanel.classList.add('hidden');
            if (editorPanel) editorPanel.classList.remove('hidden');
            buildEditorPanel();
        }
    }

    function updateDockSlots() {
        const dockEl = document.getElementById('spellDock');
        if (!dockEl) return;
        const slots = dockEl.querySelectorAll('.dock-slot');
        slots.forEach((slot, i) => {
            const nameEl = slot.querySelector('.dock-name');
            if (nameEl) nameEl.textContent = spells[i].name || 'Empty';
        });
    }

    function compileSpells() {
        const compiled = [];
        for (const spell of spells) {
            try {
                const xExpr = spell.trees.x && spell.trees.x.type === 'raw' ? spell.trees.x.expr : Blocks.toExpr(spell.trees.x);
                const yExpr = spell.trees.y && spell.trees.y.type === 'raw' ? spell.trees.y.expr : Blocks.toExpr(spell.trees.y);
                const emitExpr = spell.trees.emit && spell.trees.emit.type === 'raw' ? spell.trees.emit.expr : Blocks.toExpr(spell.trees.emit);
                const widthExpr = spell.trees.width && spell.trees.width.type === 'raw' ? spell.trees.width.expr : Blocks.toExpr(spell.trees.width);

                compiled.push({
                    name: spell.name || 'Unnamed',
                    cost: spell.cost,
                    xFn: Parser.compile(xExpr),
                    yFn: Parser.compile(yExpr),
                    emitDelayFn: Parser.compile(emitExpr),
                    widthFn: Parser.compile(widthExpr),
                    xExpr, yExpr, emitExpr, widthExpr,
                    cooldown: 0,
                    currentCooldown: 0,
                });
            } catch (e) {
                compiled.push({
                    name: spell.name || 'ERROR',
                    cost: spell.cost,
                    xFn: Parser.compile('player.x + cos(aim) * 200 * t'),
                    yFn: Parser.compile('player.y + sin(aim) * 200 * t'),
                    emitDelayFn: Parser.compile('i * 0.02'),
                    widthFn: Parser.compile('4'),
                    xExpr: 'player.x + cos(aim) * 200 * t',
                    yExpr: 'player.y + sin(aim) * 200 * t',
                    emitExpr: 'i * 0.02',
                    widthExpr: '4',
                    cooldown: 0, currentCooldown: 0,
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

    // ═══════════════════════════════════════
    //  SAVE / LOAD / EXPORT / IMPORT
    // ═══════════════════════════════════════
    function serializeSpellbook() {
        return spells.map(s => ({
            name: s.name,
            cost: s.cost,
            trees: {
                x: s.trees.x,
                y: s.trees.y,
                emit: s.trees.emit,
                width: s.trees.width,
            },
        }));
    }

    function deserializeSpellbook(data) {
        if (!Array.isArray(data) || data.length !== 6) return false;
        for (let i = 0; i < 6; i++) {
            const d = data[i];
            if (!d) continue;
            spells[i].name = d.name || spells[i].name;
            spells[i].cost = d.cost || spells[i].cost;
            if (d.trees) {
                spells[i].trees = {
                    x: d.trees.x ? Blocks.cloneNode(d.trees.x) : spells[i].trees.x,
                    y: d.trees.y ? Blocks.cloneNode(d.trees.y) : spells[i].trees.y,
                    emit: d.trees.emit ? Blocks.cloneNode(d.trees.emit) : spells[i].trees.emit,
                    width: d.trees.width ? Blocks.cloneNode(d.trees.width) : spells[i].trees.width,
                };
            }
            editors[i] = {};
        }
        return true;
    }

    function saveToLocalStorage() {
        try {
            localStorage.setItem('arcform-spellbook', JSON.stringify(serializeSpellbook()));
        } catch(e) {}
    }

    function loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem('arcform-spellbook');
            if (!raw) return false;
            return deserializeSpellbook(JSON.parse(raw));
        } catch(e) { return false; }
    }

    function exportSpellbook() {
        try {
            const data = JSON.stringify(serializeSpellbook(), null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'my-spells.spellbook';
            a.click();
            URL.revokeObjectURL(url);
        } catch(e) {}
    }

    function importSpellbook() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.spellbook,.json';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (deserializeSpellbook(data)) {
                        buildUI();
                    }
                } catch(err) { console.warn('Invalid spellbook file'); }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    return { init, show, hide, compileSpells, updateStatus, resetReady, isReady: () => ready };
})();
