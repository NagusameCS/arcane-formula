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
            { type:'num', value:100 },{ type:'num', value:180 },{ type:'num', value:300 },
            { type:'num', value:0.5 },{ type:'num', value:0.01 },{ type:'num', value:0.02 },
            { type:'num', value:0.05 },{ type:'num', value:0.1 },{ type:'num', value:0.4 },
        ],
        variables: [
            { type:'var', name:'t' },{ type:'var', name:'i' },{ type:'var', name:'N' },
            { type:'var', name:'player.x' },{ type:'var', name:'player.y' },
            { type:'var', name:'cursor.x' },{ type:'var', name:'cursor.y' },
            { type:'var', name:'enemy.x' },{ type:'var', name:'enemy.y' },
            { type:'var', name:'aim' },{ type:'var', name:'dist' },
            { type:'var', name:'pi' },{ type:'var', name:'rand' },
            // ── Loophole variables ──
            { type:'var', name:'hp' },{ type:'var', name:'maxHp' },
            { type:'var', name:'mana' },{ type:'var', name:'maxMana' },
            { type:'var', name:'speed' },{ type:'var', name:'arcons' },
            { type:'var', name:'gameTime' },{ type:'var', name:'dt' },
            { type:'var', name:'combo' },{ type:'var', name:'kills' },
            { type:'var', name:'floor' },{ type:'var', name:'level' },
            { type:'var', name:'dx' },{ type:'var', name:'dy' },
            { type:'var', name:'vel' },{ type:'var', name:'phase' },
            { type:'var', name:'entropy' },
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
            // ── Loophole functions (key picks from each domain) ──
            { type:'func', name:'warp', args:[null, null, null] },
            { type:'func', name:'fold', args:[null, null] },
            { type:'func', name:'polar_x', args:[null, null, null] },
            { type:'func', name:'polar_y', args:[null, null, null] },
            { type:'func', name:'blink_to', args:[null, null, null, null] },
            { type:'func', name:'gate', args:[null, null, null, null] },
            { type:'func', name:'tunnel', args:[null, null, null, null] },
            { type:'func', name:'clone_offset', args:[null, null, null, null, null] },
            { type:'func', name:'mirror_x', args:[null, null] },
            { type:'func', name:'split', args:[null, null, null, null] },
            { type:'func', name:'loop_t', args:[null, null] },
            { type:'func', name:'pingpong', args:[null, null] },
            { type:'func', name:'reverse_t', args:[null, null] },
            { type:'func', name:'freeze_at', args:[null, null] },
            { type:'func', name:'ease_in', args:[null, null] },
            { type:'func', name:'ease_out', args:[null, null] },
            { type:'func', name:'impulse', args:[null, null, null] },
            { type:'func', name:'spring', args:[null, null, null, null] },
            { type:'func', name:'mana_scale', args:[null, null] },
            { type:'func', name:'desperation', args:[null, null, null, null] },
            { type:'func', name:'wave', args:[null, null, null, null] },
            { type:'func', name:'noise', args:[null, null] },
            { type:'func', name:'ifgt', args:[null, null, null, null] },
            { type:'func', name:'select', args:[null, null, null, null] },
            { type:'func', name:'mix', args:[null, null, null] },
            { type:'func', name:'snap', args:[null, null] },
            { type:'func', name:'fract', args:[null] },
            { type:'func', name:'clamp', args:[null, null, null] },
            { type:'func', name:'step', args:[null, null] },
            { type:'func', name:'smoothstep', args:[null, null, null] },
            { type:'func', name:'hypot', args:[null, null] },
            { type:'func', name:'exp', args:[null] },
            { type:'func', name:'tanh', args:[null] },
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
        // Loophole vars
        'hp':'\\text{hp}','maxHp':'\\text{HP}_{max}',
        'mana':'\\mu','maxMana':'\\mu_{max}',
        'speed':'v_p','arcons':'\\alpha_n',
        'gameTime':'T_g','dt':'\\Delta t',
        'combo':'\\kappa','kills':'K',
        'floor':'F','level':'L',
        'dx':'\\hat{x}','dy':'\\hat{y}',
        'vel':'v','phase':'\\phi',
        'entropy':'\\mathcal{E}',
    };
    const FUNC_LATEX = {
        'sin':'\\sin','cos':'\\cos','tan':'\\tan','sqrt':'\\sqrt',
        'abs':'\\left|','floor':'\\lfloor','sign':'\\text{sgn}',
        'min':'\\min','max':'\\max','lerp':'\\text{lerp}',
        'atan2':'\\text{atan2}','mod':'\\bmod','neg':'-',
        // Loophole function rendering
        'warp':'\\text{warp}','fold':'\\text{fold}','mirror':'\\text{mirror}',
        'polar_x':'\\text{polar}_x','polar_y':'\\text{polar}_y',
        'blink_to':'\\text{blink}','gate':'\\text{gate}','tunnel':'\\text{tunnel}',
        'clone_offset':'\\text{clone}','mirror_x':'\\text{mir}_x','split':'\\text{split}',
        'loop_t':'\\text{loop}','pingpong':'\\text{pp}','reverse_t':'\\text{rev}',
        'freeze_at':'\\text{freeze}',
        'ease_in':'\\text{ease}_{in}','ease_out':'\\text{ease}_{out}',
        'impulse':'\\text{impulse}','spring':'\\text{spring}',
        'mana_scale':'\\mu\\text{scale}','desperation':'\\text{desp}',
        'wave':'\\text{wave}','noise':'\\text{noise}',
        'ifgt':'\\text{if>}','select':'\\text{sel}',
        'mix':'\\text{mix}','snap':'\\text{snap}',
        'fract':'\\text{fract}','clamp':'\\text{clamp}','step':'\\text{step}',
        'smoothstep':'\\text{smooth}','hypot':'\\text{hypot}',
        'exp':'\\text{exp}','tanh':'\\tanh',
        'phase_shift':'\\text{shift}','quantum_pos':'\\text{qpos}',
        'spiral_r':'\\text{spiral}','inflate':'\\text{inflate}',
    };

    function toLatex(node, parentPrec) {
        if (!node) return '\\square';
        parentPrec = parentPrec || 0;

        switch (node.type) {
            case 'num':
                return String(node.value);
            case 'var':
                return VAR_LATEX[node.name] || '\\text{' + node.name + '}';
            case 'neg':
                return '-' + toLatex(node.child, 10);
            case 'op': {
                const precMap = {'+':1,'-':1,'*':2,'/':2,'^':3};
                const prec = precMap[node.op] || 0;
                const l = toLatex(node.left, prec);
                const r = toLatex(node.right, node.op === '-' || node.op === '/' ? prec + 1 : prec);

                let result;
                if (node.op === '/') {
                    result = '\\frac{' + toLatex(node.left, 0) + '}{' + toLatex(node.right, 0) + '}';
                    return result;
                } else if (node.op === '*') {
                    result = l + ' \\cdot ' + r;
                } else if (node.op === '^') {
                    result = l + '^{' + toLatex(node.right, 0) + '}';
                    return result;
                } else {
                    result = l + ' ' + node.op + ' ' + r;
                }
                if (prec < parentPrec) return '\\left(' + result + '\\right)';
                return result;
            }
            case 'func': {
                const args = node.args.map(function(a) { return toLatex(a, 0); });
                if (node.name === 'sqrt') return '\\sqrt{' + args[0] + '}';
                if (node.name === 'abs') return '\\left|' + args[0] + '\\right|';
                if (node.name === 'floor') return '\\lfloor ' + args[0] + ' \\rfloor';
                if (node.name === 'neg') return '\\left(-' + args[0] + '\\right)';
                var fn = FUNC_LATEX[node.name] || '\\text{' + node.name + '}';
                return fn + '\\left(' + args.join(', ') + '\\right)';
            }
        }
        return '\\square';
    }

    // ── AST → Expression string ──
    function toExpr(node) {
        if (!node) return '0';
        switch (node.type) {
            case 'num': return String(node.value);
            case 'var': return node.name;
            case 'neg': return '(-(' + toExpr(node.child) + '))';
            case 'op': {
                var l = toExpr(node.left);
                var r = toExpr(node.right);
                if (node.op === '^') return 'pow(' + l + ',' + r + ')';
                return '(' + l + node.op + r + ')';
            }
            case 'func': {
                var args = node.args.map(toExpr);
                if (node.name === 'neg') return '(-(' + args[0] + '))';
                return node.name + '(' + args.join(',') + ')';
            }
        }
        return '0';
    }

    // ── RENDER A BLOCK NODE TO DOM ──
    function renderBlock(node, path, activeSlot, onSlotClick, onRemove) {
        if (!node) {
            var el = document.createElement('span');
            el.className = 'block-slot' + (activeSlot === path ? ' active' : '');
            el.textContent = '?';
            el.dataset.path = path;
            el.addEventListener('click', function(e) { e.stopPropagation(); onSlotClick(path); });
            return el;
        }

        var wrap = document.createElement('span');
        wrap.className = 'block';
        wrap.dataset.path = path;

        if (path !== '') {
            var rm = document.createElement('span');
            rm.className = 'block-remove';
            rm.textContent = '\u00d7';
            rm.addEventListener('click', function(e) { e.stopPropagation(); onRemove(path); });
            wrap.appendChild(rm);
        }

        switch (node.type) {
            case 'num': {
                wrap.classList.add('block-num');
                var inp = document.createElement('input');
                inp.type = 'number';
                inp.value = node.value;
                inp.step = 'any';
                inp.style.cssText = 'width:50px;background:transparent;border:none;color:inherit;font:inherit;font-size:12px;text-align:center;outline:none;padding:0';
                inp.addEventListener('input', function() {
                    node.value = parseFloat(inp.value) || 0;
                    onSlotClick(null);
                });
                inp.addEventListener('click', function(e) { e.stopPropagation(); });
                wrap.appendChild(inp);
                break;
            }
            case 'var': {
                wrap.classList.add('block-var');
                wrap.appendChild(document.createTextNode(node.name));
                break;
            }
            case 'op': {
                wrap.classList.add('block-op');
                wrap.appendChild(renderBlock(node.left, path + '.left', activeSlot, onSlotClick, onRemove));
                var opSpan = document.createElement('span');
                opSpan.textContent = ' ' + node.op + ' ';
                opSpan.style.cssText = 'color:#ffcc66;font-weight:bold;padding:0 3px';
                wrap.appendChild(opSpan);
                wrap.appendChild(renderBlock(node.right, path + '.right', activeSlot, onSlotClick, onRemove));
                break;
            }
            case 'func': {
                wrap.classList.add('block-func');
                var fnName = document.createElement('span');
                fnName.textContent = node.name + '(';
                fnName.style.color = '#cc88ff';
                wrap.appendChild(fnName);
                node.args.forEach(function(arg, idx) {
                    if (idx > 0) {
                        var comma = document.createElement('span');
                        comma.textContent = ', ';
                        wrap.appendChild(comma);
                    }
                    wrap.appendChild(renderBlock(arg, path + '.args.' + idx, activeSlot, onSlotClick, onRemove));
                });
                var close = document.createElement('span');
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
        var parts = path.split('.').filter(Boolean);
        var node = root;
        for (var k = 0; k < parts.length; k++) {
            var p = parts[k];
            if (!node) return null;
            if (p === 'left') node = node.left;
            else if (p === 'right') node = node.right;
            else if (p === 'args') continue;
            else if (!isNaN(p)) node = node.args ? node.args[parseInt(p)] : null;
            else node = node[p];
        }
        return node;
    }

    function setNode(root, path, value) {
        if (!path || path === '') return value;
        var parts = path.split('.').filter(Boolean);
        var node = root;
        for (var i = 0; i < parts.length - 1; i++) {
            var p = parts[i];
            if (p === 'left' || p === 'right') node = node[p];
            else if (p === 'args') continue;
            else if (!isNaN(p) && node.args) node = node.args[parseInt(p)];
        }
        var last = parts[parts.length - 1];
        if (last === 'left' || last === 'right') node[last] = value;
        else if (!isNaN(last) && node.args) node.args[parseInt(last)] = value;
        else node[last] = value;
        return root;
    }

    function findFirstEmpty(node, path) {
        if (!node) return path;
        if (node.type === 'op') {
            if (!node.left) return path + '.left';
            var leftEmpty = findFirstEmpty(node.left, path + '.left');
            if (leftEmpty !== null) return leftEmpty;
            if (!node.right) return path + '.right';
            return findFirstEmpty(node.right, path + '.right');
        }
        if (node.type === 'func') {
            for (var i = 0; i < node.args.length; i++) {
                if (!node.args[i]) return path + '.args.' + i;
                var argEmpty = findFirstEmpty(node.args[i], path + '.args.' + i);
                if (argEmpty !== null) return argEmpty;
            }
        }
        return null;
    }

    // ── CREATE EDITOR IN-PLACE (renders into provided workspace + latex elements) ──
    function createEditorInPlace(workspaceEl, latexEl, initialNode, onChangeCallback) {
        var root = initialNode ? cloneNode(initialNode) : null;
        var activeSlot = '';

        function refresh() {
            workspaceEl.innerHTML = '';
            if (root) {
                workspaceEl.appendChild(renderBlock(root, '', activeSlot, onSlotClick, onRemoveBlock));
            } else {
                var empty = document.createElement('div');
                empty.className = 'block-workspace-empty';
                empty.textContent = 'Click a block from the palette \u2192';
                empty.addEventListener('click', function() { activeSlot = ''; refresh(); });
                workspaceEl.appendChild(empty);
            }

            // Render LaTeX
            try {
                var latex = toLatex(root);
                katex.render(latex, latexEl, { throwOnError: false, displayMode: true });
            } catch (e) {
                latexEl.textContent = '?';
            }

            if (onChangeCallback) onChangeCallback(root);
        }

        function onSlotClick(path) {
            if (path === null) { refresh(); return; }
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

        function insertBlock(block) {
            if (root === null && activeSlot === '') {
                root = block;
                activeSlot = findFirstEmpty(root, '');
            } else if (activeSlot !== null) {
                if (activeSlot === '' && root === null) {
                    root = block;
                } else if (activeSlot === '') {
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
                activeSlot = findFirstEmpty(root, '');
            }
            refresh();
        }

        // Click workspace background to select root
        workspaceEl.addEventListener('click', function(e) {
            if (e.target === workspaceEl) {
                activeSlot = '';
                refresh();
            }
        });

        refresh();

        return {
            getRoot: function() { return root; },
            getExpr: function() { return toExpr(root); },
            getLatex: function() { return toLatex(root); },
            setRoot: function(r) { root = r; activeSlot = findFirstEmpty(root, ''); refresh(); },
            insertBlock: insertBlock,
            refresh: refresh,
        };
    }

    // ── LEGACY createEditor (for backward compat) ──
    function createEditor(containerEl, formulaKey, initialNode, onChangeCallback) {
        var root = initialNode ? cloneNode(initialNode) : null;
        var activeSlot = '';

        var workspaceEl = document.createElement('div');
        workspaceEl.className = 'block-workspace';

        var paletteEl = document.createElement('div');
        paletteEl.className = 'block-palette';

        var latexEl = document.createElement('div');
        latexEl.className = 'latex-preview';

        var label = document.createElement('div');
        label.className = 'formula-label';
        label.textContent = formulaKey;
        containerEl.appendChild(label);
        containerEl.appendChild(latexEl);
        containerEl.appendChild(workspaceEl);
        containerEl.appendChild(paletteEl);

        var inPlace = createEditorInPlace(workspaceEl, latexEl, initialNode, onChangeCallback);

        // Render palette into the local palette element
        renderPaletteInto(paletteEl, function(block) { inPlace.insertBlock(block); });

        return inPlace;
    }

    function renderPaletteInto(container, onPick) {
        container.innerHTML = '';
        var sections = [
            { label:'Numbers', items:PALETTE.numbers, cls:'block-num' },
            { label:'Variables', items:PALETTE.variables, cls:'block-var' },
            { label:'Operators', items:PALETTE.operators, cls:'block-op' },
            { label:'Functions', items:PALETTE.functions, cls:'block-func' },
        ];
        for (var s = 0; s < sections.length; s++) {
            var sec = sections[s];
            var div = document.createElement('div');
            div.className = 'block-palette-section';
            for (var j = 0; j < sec.items.length; j++) {
                var item = sec.items[j];
                var el = document.createElement('span');
                el.className = 'block ' + sec.cls;
                el.style.cursor = 'pointer';
                if (item.type === 'num') el.textContent = item.value;
                else if (item.type === 'var') el.textContent = item.name;
                else if (item.type === 'op') el.textContent = '\u25a1 ' + item.op + ' \u25a1';
                else if (item.type === 'func') el.textContent = item.name + '(' + item.args.map(function() { return '\u25a1'; }).join(',') + ')';
                (function(it) {
                    el.addEventListener('click', function() { onPick(cloneNode(it)); });
                })(item);
                div.appendChild(el);
            }
            container.appendChild(div);
        }
    }

    // ── DEFAULT SPELL TREES ──
    function n(v) { return { type:'num', value:v }; }
    function v(name) { return { type:'var', name:name }; }
    function op(o, l, r) { return { type:'op', op:o, left:l, right:r }; }
    function fn(name) {
        var args = [];
        for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
        return { type:'func', name:name, args:args };
    }

    var DEFAULTS = [
        { // Beam
            name: 'Beam', cost: 30,
            x: op('+', v('player.x'), op('*', op('*', fn('cos', v('aim')), n(300)), op('-', v('t'), op('*', v('i'), n(0.02))))),
            y: op('+', v('player.y'), op('*', op('*', fn('sin', v('aim')), n(300)), op('-', v('t'), op('*', v('i'), n(0.02))))),
            emit: op('*', v('i'), n(0.02)),
            width: n(5),
        },
        { // Nova
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
        { // Wall
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
        { // Rain
            name: 'Rain', cost: 30,
            x: op('+', v('cursor.x'), op('*', fn('cos', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('+', n(10), op('*', v('t'), n(40))))),
            y: op('+', v('cursor.y'), op('*', fn('sin', op('*', op('*', n(2), v('pi')), op('/', v('i'), v('N')))), op('+', n(10), op('*', v('t'), n(40))))),
            emit: op('*', v('i'), n(0.05)),
            width: n(4),
        },
    ];

    return {
        createEditor: createEditor,
        createEditorInPlace: createEditorInPlace,
        cloneNode: cloneNode,
        toLatex: toLatex,
        toExpr: toExpr,
        DEFAULTS: DEFAULTS,
        PALETTE: PALETTE,
        renderPalette: renderPaletteInto,
        n: n, v: v, op: op, fn: fn,
    };
})();
