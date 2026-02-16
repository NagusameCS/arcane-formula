// ─────────────────────────────────────────────
//  SPELL FORMULA PARSER (kept from v1 — compiles expression strings)
// ─────────────────────────────────────────────

const Parser = (() => {
    function tokenize(expr) {
        const tokens = [];
        let i = 0;
        const src = expr.trim();
        while (i < src.length) {
            const ch = src[i];
            if (ch === ' ' || ch === '\t') { i++; continue; }
            if (ch >= '0' && ch <= '9' || (ch === '.' && i + 1 < src.length && src[i+1] >= '0' && src[i+1] <= '9')) {
                let num = '';
                while (i < src.length && ((src[i] >= '0' && src[i] <= '9') || src[i] === '.')) num += src[i++];
                tokens.push({ type: 'NUM', value: parseFloat(num) });
                continue;
            }
            if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
                let id = '';
                while (i < src.length && ((src[i] >= 'a' && src[i] <= 'z') || (src[i] >= 'A' && src[i] <= 'Z') || (src[i] >= '0' && src[i] <= '9') || src[i] === '_' || src[i] === '.')) id += src[i++];
                tokens.push({ type: 'ID', value: id });
                continue;
            }
            if ('+-*/(),%^'.includes(ch)) { tokens.push({ type: 'OP', value: ch }); i++; continue; }
            i++;
        }
        return tokens;
    }

    function parse(tokens) {
        let pos = 0;
        function peek() { return pos < tokens.length ? tokens[pos] : null; }
        function consume() { return tokens[pos++]; }
        function expect(type, value) {
            const t = consume();
            if (!t || t.type !== type || (value !== undefined && t.value !== value))
                throw new Error(`Expected ${type} '${value}' got ${t ? t.value : 'EOF'}`);
            return t;
        }
        function parseExpr() {
            let left = parseTerm();
            while (peek() && peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
                const op = consume().value; left = { type: 'BIN', op, left, right: parseTerm() };
            }
            return left;
        }
        function parseTerm() {
            let left = parsePower();
            while (peek() && peek().type === 'OP' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
                const op = consume().value; left = { type: 'BIN', op, left, right: parsePower() };
            }
            return left;
        }
        function parsePower() {
            let left = parseUnary();
            while (peek() && peek().type === 'OP' && peek().value === '^') {
                consume(); left = { type: 'BIN', op: '^', left, right: parseUnary() };
            }
            return left;
        }
        function parseUnary() {
            if (peek() && peek().type === 'OP' && (peek().value === '-' || peek().value === '+')) {
                const op = consume().value;
                const operand = parseUnary();
                return op === '-' ? { type: 'NEG', operand } : operand;
            }
            return parseAtom();
        }
        function parseAtom() {
            const t = peek();
            if (!t) throw new Error('Unexpected end');
            if (t.type === 'NUM') { consume(); return { type: 'NUM', value: t.value }; }
            if (t.type === 'ID') {
                consume();
                if (peek() && peek().type === 'OP' && peek().value === '(') {
                    consume();
                    const args = [];
                    if (!(peek() && peek().type === 'OP' && peek().value === ')')) {
                        args.push(parseExpr());
                        while (peek() && peek().type === 'OP' && peek().value === ',') { consume(); args.push(parseExpr()); }
                    }
                    expect('OP', ')');
                    return { type: 'CALL', name: t.value, args };
                }
                return { type: 'VAR', name: t.value };
            }
            if (t.type === 'OP' && t.value === '(') {
                consume(); const inner = parseExpr(); expect('OP', ')'); return inner;
            }
            throw new Error(`Unexpected: ${t.value}`);
        }
        const ast = parseExpr();
        if (pos < tokens.length) throw new Error(`Unexpected: ${tokens[pos].value}`);
        return ast;
    }

    function compileAST(ast) {
        switch (ast.type) {
            case 'NUM': return () => ast.value;
            case 'VAR': return (v) => { if (ast.name in v) return v[ast.name]; return 0; };
            case 'NEG': { const fn = compileAST(ast.operand); return (v) => -fn(v); }
            case 'BIN': {
                const l = compileAST(ast.left), r = compileAST(ast.right);
                switch (ast.op) {
                    case '+': return (v) => l(v) + r(v);
                    case '-': return (v) => l(v) - r(v);
                    case '*': return (v) => l(v) * r(v);
                    case '/': return (v) => { const rv = r(v); return rv === 0 ? 0 : l(v) / rv; };
                    case '%': return (v) => { const rv = r(v); return rv === 0 ? 0 : l(v) % rv; };
                    case '^': return (v) => Math.pow(l(v), r(v));
                }
                break;
            }
            case 'CALL': {
                const argFns = ast.args.map(compileAST);
                const builtins = {
                    sin: a=>Math.sin(a[0]),cos: a=>Math.cos(a[0]),tan: a=>Math.tan(a[0]),
                    atan2: a=>Math.atan2(a[0],a[1]),sqrt: a=>Math.sqrt(Math.abs(a[0])),
                    abs: a=>Math.abs(a[0]),min: a=>Math.min(a[0],a[1]),max: a=>Math.max(a[0],a[1]),
                    floor: a=>Math.floor(a[0]),ceil: a=>Math.ceil(a[0]),pow: a=>Math.pow(a[0],a[1]),
                    mod: a=>a[1]===0?0:a[0]%a[1],sign: a=>Math.sign(a[0]),neg: a=>-(a[0]),
                    lerp: a=>a[0]+(a[1]-a[0])*Math.max(0,Math.min(1,a[2])),
                    rand: ()=>Math.random(),clamp: a=>Math.max(a[1],Math.min(a[2],a[0])),
                    step: a=>a[0]>=a[1]?1:0,
                };
                if (!(ast.name in builtins)) throw new Error(`Unknown fn: ${ast.name}`);
                return (v) => { const args = argFns.map(fn => fn(v)); return builtins[ast.name](args); };
            }
        }
        throw new Error('Invalid AST');
    }

    function compile(exprStr) {
        return compileAST(parse(tokenize(exprStr)));
    }

    function validate(exprStr) {
        try {
            const fn = compile(exprStr);
            const dummyVars = { 'player.x':100,'player.y':100,'cursor.x':200,'cursor.y':200,'enemy.x':300,'enemy.y':300,'map.w':960,'map.h':540,'t':0.5,'i':5,'N':20,'aim':0.5,'dist':100,'pi':Math.PI,'rand':0.5 };
            const r = fn(dummyVars);
            return (typeof r !== 'number' || isNaN(r)) ? 'NaN result' : null;
        } catch(e) { return e.message; }
    }

    return { compile, validate, tokenize, parse };
})();
