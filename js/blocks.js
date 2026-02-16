// ─────────────────────────────────────────────
//  SCRATCH × LATEX BLOCK EDITOR
//  Visual blocks compose into an AST, rendered as LaTeX, compiled to JS
// ─────────────────────────────────────────────

const Blocks = (() => {

    // ── BLOCK NODE TYPES ──
    // { type:'num', value:5 }
    // { type:'var', name:'t' }
    // { type:'op', op:'+', left:<node>, right:<node> }
    // { type:'func', name:'sin', args:[<node>] }
    // { type:'neg', child:<node> }
    // null = empty slot

    // ── PALETTE DEFINITION ──
    const PALETTE = {
        numbers: [
            { type:'num', value:0 },{ type:'num', value:1 },{ type:'num', value:2 },
            { type:'num', value:3 },{ type:'num', value:5 },{ type:'num', value:10 },
            { type:'num', value:0.5 },{ type:'num', value:0.01 },{ type:'num', value:0.1 },
        ],
        variables: [
            { type:'var', name:'t' },{ type:'var', name:'i' },{ type:'var', name:'N' },
            { type:'var', name:'player.x' },{ type:'var', name:'player.y' },
            { type:'var', name:'cursor.x' },{ type:'var', name:'cursor.y' },
            { type:'var', name:'enemy.x' },{ type:'var', name:'enemy.y' },
            { type:'var', name:'aim' },{ type:'var', name:'dist' },
            { type:'var', name:'pi' },{ type:'var', name:'rand' },
        ],
        operators: [
            { type:'op', op:'+', left:null, right:null },
            { type:'op', op:'-', left:null, right:null },
            { type:'op', op:'*', left:null, right:null },
            { type:'op', op:'/', left:null, right:null },
            { type:'op', op:'^', left:null, right:null },
        ],
        functions: [
            { type:'func', name:'sin', args:[null] },
            { type:'func', name:'cos', args:[null] },
            { type:'func', name:'tan', args:[null] },
            { type:'func', name:'sqrt', args:[null] },
            { type:'func', name:'abs', args:[null] },
            { type:'func', name:'floor', args:[null] },
            { type:'func', name:'neg', args:[null] },
            { type:'func', name:'min', args:[null, null] },
            { type:'func', name:'max', args:[null, null] },
            { type:'func', name:'lerp', args:[null, null, null] },
            { type:'func', name:'atan2', args:[null, null] },
            { type:'func', name:'mod', args:[null, null] },
            { type:'func', name:'sign', args:[null] },
        ]
    };

    // ── DEEP CLONE ──
    function cloneNode(node) {
        if (!node) return null;
        switch (node.type) {
            case 'num': return { type:'num', value:node.value };
            case 'var': return { type:'var', name:node.name };
            case 'op': return { type:'op', op:node.op, left:cloneNode(node.left), right:cloneNode(node.right) };
            case 'func': return { type:'func', name:node.name, args:node.args.map(cloneNode) };
            case 'neg': return { type:'neg', child:cloneNode(node.child) };
        }
        return null;
    }

    // ── AST → LaTeX ──
    const VAR_LATEX = {
        't':'t','i':'i','N':'N',
        'player.x':'p_x','player.y':'p_y',
        'cursor.x':'c_x','cursor.y':'c_y',
        'enemy.x':'e_x','enemy.y':'e_y',
        'aim':'\\theta','dist':'d',
        'pi':'\\pi','rand':'\\xi',
    };
    const FUNC_LATEX = {
        'sin':'\\sin','cos':'\\cos','tan':'\\tan','sqrt':'\\sqrt',
        'abs':'\\left|','floor':'\\lfloor','sign':'\\text{sgn}',
        'min':'\\min','max':'\\max','lerp':'\\text{lerp}',
        'atan2':'\\text{atan2}','mod':'\\bmod','neg':'-',
    };

    function toLatex(node, parentPrec) {
        if (!node) return '\\square';
        parentPrec = parentPrec || 0;

        switch (node.type) {
            case 'num':
                return String(node.value);
            case 'var':
                return VAR_LATEX[node.name] || `\\text{${node.name}}`;
            case 'neg':
                return `-${toLatex(node.child, 10)}`;
            case 'op': {
                const precMap = {'+':1,'-':1,'*':2,'/':2,'^':3};
                const prec = precMap[node.op] || 0;
                const l = toLatex(node.left, prec);
                const r = toLatex(node.right, node.op === '-' || node.op === '/' ? prec + 1 : prec);

                let result;
                if (node.op === '/') {
                    result = `\\frac{${toLatex(node.left, 0)}}{${toLatex(node.right, 0)}}`;
                    return result;
                } else if (node.op === '*') {
                    result = `${l} \\cdot ${r}`;
                } else if (node.op === '^') {
                    result = `${l}^{${toLatex(node.right, 0)}}`;
                    return result;
                } else {
                    result = `${l} ${node.op} ${r}`;
                }
                if (prec < parentPrec) return `\\left(${result}\\right)`;
                return result;
            }
            case 'func': {
                const args = node.args.map(a => toLatex(a, 0));
                if (node.name === 'sqrt') return `\\sqrt{${args[0]}}`;
                if (node.name === 'abs') return `\\left|${args[0]}\\right|`;
                if (node.name === 'floor') return `\\lfloor ${args[0]} \\rfloor`;
                if (node.name === 'neg') return `\\left(-${args[0]}\\right)`;
                const fn = FUNC_LATEX[node.name] || `\\text{${node.name}}`;
                return `${fn}\\left(${args.join(', ')}\\right)`;
            }
        }
        return '\\square';
    }

    // ── AST → Expression string (for the existing parser/compiler) ──
    function toExpr(node) {
        if (!node) return '0';
        switch (node.type) {
            case 'num': return String(node.value);
            case 'var': return node.name;
            case 'neg': return `(-(${toExpr(node.child)}))`;
            case 'op': {
                const l = toExpr(node.left);
                const r = toExpr(node.right);
                if (node.op === '^') return `pow(${l},${r})`;
                return `(${l}${node.op}${r})`;
            }
            case 'func': {
                const args = node.args.map(toExpr);
                if (node.name === 'neg') return `(-(${args[0]}))`;
                return `${node.name}(${args.join(',')})`;
            }
        }
        return '0';
    }

    // ── RENDER A BLOCK NODE TO DOM ──
    // Returns an HTML element. Clicking slots sets them as "active".
    // `onUpdate` is called whenever the tree changes.
    function renderBlock(node, path, activeSlot, onSlotClick, onRemove) {
        if (!node) {
            // Empty slot
            const el = document.createElement('span');
            el.className = 'block-slot' + (activeSlot === path ? ' active' : '');
            el.textContent = '?';
            el.dataset.path = path;
            el.addEventListener('click', (e) => { e.stopPropagation(); onSlotClick(path); });
            return el;
        }

        const wrap = document.createElement('span');
        wrap.className = 'block';
        wrap.dataset.path = path;

        // Remove button (unless it's the root-level and we want to keep structure)
        if (path !== '') {
            const rm = document.createElement('span');
            rm.className = 'block-remove';
            rm.textContent = '×';
            rm.addEventListener('click', (e) => { e.stopPropagation(); onRemove(path); });
            wrap.appendChild(rm);
        }

        switch (node.type) {
            case 'num': {
                wrap.classList.add('block-num');
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.value = node.value;
                inp.step = 'any';
                inp.style.cssText = 'width:45px;background:transparent;border:none;color:inherit;font:inherit;font-size:12px;text-align:center;outline:none;padding:0';
                inp.addEventListener('input', () => {
                    node.value = parseFloat(inp.value) || 0;
                    onSlotClick(null); // trigger update
                });
                inp.addEventListener('click', (e) => e.stopPropagation());
                wrap.appendChild(inp);
                break;
            }
            case 'var': {
                wrap.classList.add('block-var');
                wrap.textContent = node.name;
                break;
            }
            case 'op': {
                wrap.classList.add('block-op');
                wrap.appendChild(renderBlock(node.left, path+'.left', activeSlot, onSlotClick, onRemove));
                const opSpan = document.createElement('span');
                opSpan.textContent = ` ${node.op} `;
                opSpan.style.cssText = 'color:#ffcc66;font-weight:bold;padding:0 2px';
                wrap.appendChild(opSpan);
                wrap.appendChild(renderBlock(node.right, path+'.right', activeSlot, onSlotClick, onRemove));
                break;
            }
            case 'func': {
                wrap.classList.add('block-func');
                const fnName = document.createElement('span');
                fnName.textContent = node.name + '(';
                fnName.style.color = '#cc88ff';
                wrap.appendChild(fnName);
                node.args.forEach((arg, idx) => {
                    if (idx > 0) {
                        const comma = document.createElement('span');
                        comma.textContent = ', ';
                        wrap.appendChild(comma);
                    }
                    wrap.appendChild(renderBlock(arg, path+'.args.'+idx, activeSlot, onSlotClick, onRemove));
                });
                const close = document.createElement('span');
                close.textContent = ')';
                close.style.color = '#cc88ff';
                wrap.appendChild(close);
                break;
            }
        }
        return wrap;
    }

    // ── GET/SET NODE AT PATH ──
    function getNode(root, path) {
        if (!path || path === '') return root;
        const parts = path.split('.').filter(Boolean);
        let node = root;
        for (const p of parts) {
            if (!node) return null;
            if (p === 'left') node = node.left;
            else if (p === 'right') node = node.right;
            else if (p === 'args') continue; // next part is index
            else if (!isNaN(p)) node = node.args ? node.args[parseInt(p)] : null;
            else node = node[p];
        }
        return node;
    }

    function setNode(root, path, value) {
        if (!path || path === '') return value; // replace root
        const parts = path.split('.').filter(Boolean);
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            if (p === 'left' || p === 'right') node = node[p];
            else if (p === 'args') continue;
            else if (!isNaN(p) && node.args) node = node.args[parseInt(p)];
        }
        const last = parts[parts.length - 1];
        if (last === 'left' || last === 'right') node[last] = value;
        else if (!isNaN(last) && node.args) node.args[parseInt(last)] = value;
        else node[last] = value;
        return root;
    }

    // ── RENDER PALETTE ──
    function renderPalette(container, onPick) {
        container.innerHTML = '';
        const sections = [
            { label:'Numbers', items:PALETTE.numbers, cls:'block-num' },
            { label:'Variables', items:PALETTE.variables, cls:'block-var' },
            { label:'Operators', items:PALETTE.operators, cls:'block-op' },
            { label:'Functions', items:PALETTE.functions, cls:'block-func' },
        ];
        for (const sec of sections) {
            const div = document.createElement('div');
            div.className = 'block-palette-section';
            for (const item of sec.items) {
                const el = document.createElement('span');
                el.className = 'block ' + sec.cls;
                el.style.cursor = 'pointer';
                if (item.type === 'num') el.textContent = item.value;
                else if (item.type === 'var') el.textContent = item.name;
                else if (item.type === 'op') el.textContent = `□ ${item.op} □`;
                else if (item.type === 'func') el.textContent = item.name + '(' + item.args.map(() => '□').join(',') + ')';
                el.addEventListener('click', () => onPick(cloneNode(item)));
                div.appendChild(el);
            }
            container.appendChild(div);
        }
    }

    // ── CREATE A FULL BLOCK EDITOR INSTANCE ──
    function createEditor(containerEl, formulaKey, initialNode, onChangeCallback) {
        let root = initialNode ? cloneNode(initialNode) : null;
        let activeSlot = ''; // path of currently selected slot

        const workspaceEl = document.createElement('div');
        workspaceEl.className = 'block-workspace';

        const paletteEl = document.createElement('div');
        paletteEl.className = 'block-palette';

        const latexEl = document.createElement('div');
        latexEl.className = 'latex-preview';

        // Insert into container
        const label = document.createElement('div');
        label.className = 'formula-label';
        label.textContent = formulaKey;
        containerEl.appendChild(label);
        containerEl.appendChild(latexEl);
        containerEl.appendChild(workspaceEl);
        containerEl.appendChild(paletteEl);

        function refresh() {
            // Re-render workspace
            workspaceEl.innerHTML = '';
            if (root) {
                workspaceEl.appendChild(renderBlock(root, '', activeSlot, onSlotClick, onRemoveBlock));
            } else {
                const slot = document.createElement('span');
                slot.className = 'block-slot' + (activeSlot === '' ? ' active' : '');
                slot.textContent = 'click a block to start →';
                slot.style.width = '100%';
                slot.style.justifyContent = 'center';
                slot.style.minHeight = '30px';
                slot.addEventListener('click', () => { activeSlot = ''; refresh(); });
                workspaceEl.appendChild(slot);
            }

            // Render LaTeX
            try {
                const latex = toLatex(root);
                katex.render(latex, latexEl, { throwOnError: false, displayMode: true });
            } catch (e) {
                latexEl.textContent = '?';
            }

            if (onChangeCallback) onChangeCallback(root);
        }

        function onSlotClick(path) {
            if (path === null) { refresh(); return; } // just re-render (e.g. num change)
            activeSlot = path;
            refresh();
        }

        function onRemoveBlock(path) {
            if (path === '') {
                root = null;
            } else {
                root = setNode(root, path, null);
            }
            activeSlot = path;
            refresh();
        }

        function onPaletteClick(block) {
            if (root === null && activeSlot === '') {
                root = block;
                // Set active to first empty slot
                activeSlot = findFirstEmpty(root, '');
            } else if (activeSlot !== null) {
                if (activeSlot === '' && root === null) {
                    root = block;
                } else if (activeSlot === '') {
                    // Replace root
                    // If new block has an empty slot, put old root there
                    if (block.type === 'op' && block.left === null) {
                        block.left = root;
                        root = block;
                    } else if (block.type === 'func' && block.args[0] === null) {
                        block.args[0] = root;
                        root = block;
                    } else {
                        root = block;
                    }
                } else {
                    root = setNode(root, activeSlot, block);
                }
                // Advance to next empty slot
                activeSlot = findFirstEmpty(root, '');
            }
            refresh();
        }

        function findFirstEmpty(node, path) {
            if (!node) return path;
            if (node.type === 'op') {
                if (!node.left) return path + '.left';
                const leftEmpty = findFirstEmpty(node.left, path + '.left');
                if (leftEmpty !== null) return leftEmpty;
                if (!node.right) return path + '.right';
                return findFirstEmpty(node.right, path + '.right');
            }
            if (node.type === 'func') {
                for (let i = 0; i < node.args.length; i++) {
                    if (!node.args[i]) return path + '.args.' + i;
                    const argEmpty = findFirstEmpty(node.args[i], path + '.args.' + i);
                    if (argEmpty !== null) return argEmpty;
                }
            }
            return null; // no empty slots
        }

        // Render palette
        renderPalette(paletteEl, onPaletteClick);

        // Click workspace background to select root
        workspaceEl.addEventListener('click', (e) => {
            if (e.target === workspaceEl) {
                activeSlot = '';
                refresh();
            }
        });

        refresh();

        return {
            getRoot: () => root,
            getExpr: () => toExpr(root),
            getLatex: () => toLatex(root),
            setRoot: (r) => { root = r; activeSlot = findFirstEmpty(root, ''); refresh(); },
            refresh,
        };
    }

    // ── DEFAULT SPELL TREES ──
    // Build default trees programmatically for the 6 starter spells

    function n(v) { return { type:'num', value:v }; }
    function v(name) { return { type:'var', name }; }
    function op(o, l, r) { return { type:'op', op:o, left:l, right:r }; }
    function fn(name, ...args) { return { type:'func', name, args }; }

    const DEFAULTS = [
        { // Beam — player.x + cos(aim) * 300 * (t - i*0.02)
            name: 'Beam', cost: 30,
            x: op('+', v('player.x'), op('*', op('*', fn('cos', v('aim')), n(300)), op('-', v('t'), op('*', v('i'), n(0.02))))),
            y: op('+', v('player.y'), op('*', op('*', fn('sin', v('aim')), n(300)), op('-', v('t'), op('*', v('i'), n(0.02))))),
            emit: op('*', v('i'), n(0.02)),
            width: n(5),
        },
        { // Nova — radial burst
            name: 'Nova', cost: 40,
            x: op('+', v('player.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(180), v('t')))),
            y: op('+', v('player.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('*', n(180), v('t')))),
            emit: n(0),
            width: n(4),
        },
        { // Spiral
            name: 'Spiral', cost: 25,
            x: op('+', v('player.x'), op('*', fn('cos', op('+', op('+', v('aim'), op('*', v('i'), n(0.4))), op('*', v('t'), n(4)))), op('*', n(200), v('t')))),
            y: op('+', v('player.y'), op('*', fn('sin', op('+', op('+', v('aim'), op('*', v('i'), n(0.4))), op('*', v('t'), n(4)))), op('*', n(200), v('t')))),
            emit: op('*', v('i'), n(0.01)),
            width: n(4),
        },
        { // Wall — stationary barrier
            name: 'Wall', cost: 25,
            x: op('+', op('+', v('player.x'), op('*', fn('cos', v('aim')), n(80))), op('*', fn('cos', op('+', v('aim'), op('/', v('pi'), n(2)))), op('*', op('-', v('i'), op('/', v('N'), n(2))), n(5)))),
            y: op('+', op('+', v('player.y'), op('*', fn('sin', v('aim')), n(80))), op('*', fn('sin', op('+', v('aim'), op('/', v('pi'), n(2)))), op('*', op('-', v('i'), op('/', v('N'), n(2))), n(5)))),
            emit: n(0),
            width: n(6),
        },
        { // Shotgun
            name: 'Shotgun', cost: 35,
            x: op('+', v('player.x'), op('*', fn('cos', op('+', v('aim'), op('*', op('-', v('i'), op('/', v('N'), n(2))), n(0.08)))), op('*', n(350), v('t')))),
            y: op('+', v('player.y'), op('*', fn('sin', op('+', v('aim'), op('*', op('-', v('i'), op('/', v('N'), n(2))), n(0.08)))), op('*', n(350), v('t')))),
            emit: n(0),
            width: n(3),
        },
        { // Rain — area denial
            name: 'Rain', cost: 30,
            x: op('+', v('cursor.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('+', n(10), op('*', v('t'), n(40))))),
            y: op('+', v('cursor.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('+', n(10), op('*', v('t'), n(40))))),
            emit: op('*', v('i'), n(0.05)),
            width: n(4),
        },
    ];

    return {
        createEditor,
        cloneNode,
        toLatex,
        toExpr,
        DEFAULTS,
        PALETTE,
        renderPalette,
        n, v, op, fn, // for programmatic tree building
    };
})();
