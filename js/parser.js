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
                if (!(ast.name in Parser._builtins)) throw new Error(`Unknown fn: ${ast.name}`);
                return (v) => { const args = argFns.map(fn => fn(v)); return Parser._builtins[ast.name](args); };
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
            const dummyVars = {
                'player.x':100,'player.y':100,'cursor.x':200,'cursor.y':200,
                'enemy.x':300,'enemy.y':300,'map.w':960,'map.h':540,
                't':0.5,'i':5,'N':20,'aim':0.5,'dist':100,'pi':Math.PI,'rand':0.5,
                'hp':80,'maxHp':100,'mana':50,'maxMana':100,'speed':200,
                'arcons':10,'gameTime':30.5,'dt':0.016,'combo':1,
                'kills':0,'floor':1,'level':1,'dx':1,'dy':0,
                'vel':200,'phase':0,'entropy':0.5,
            };
            const r = fn(dummyVars);
            return (typeof r !== 'number' || isNaN(r)) ? 'NaN result' : null;
        } catch(e) { return e.message; }
    }

    // ═══════════════════════════════════════════════════════════════
    //  BUILT-IN FUNCTIONS — The backbone of the magic system
    //  Each function is a potential "loophole" — a creative building
    //  block that can be combined in unexpected ways.
    //  120+ functions across 14 domains.
    // ═══════════════════════════════════════════════════════════════
    const _builtins = {
        // ── BASIC MATH (original core) ──
        sin: a=>Math.sin(a[0]),cos: a=>Math.cos(a[0]),tan: a=>Math.tan(a[0]),
        atan2: a=>Math.atan2(a[0],a[1]),sqrt: a=>Math.sqrt(Math.abs(a[0])),
        abs: a=>Math.abs(a[0]),min: a=>Math.min(a[0],a[1]),max: a=>Math.max(a[0],a[1]),
        floor: a=>Math.floor(a[0]),ceil: a=>Math.ceil(a[0]),pow: a=>Math.pow(a[0],a[1]),
        mod: a=>(a[1]===0?0:a[0]%a[1]),sign: a=>Math.sign(a[0]),neg: a=>-(a[0]),
        lerp: a=>a[0]+(a[1]-a[0])*Math.max(0,Math.min(1,a[2])),
        rand: ()=>Math.random(),clamp: a=>Math.max(a[1],Math.min(a[2],a[0])),
        step: a=>(a[0]>=a[1]?1:0),

        // ── EXTENDED MATH ──
        log: a=>Math.log(Math.max(0.001,a[0])),
        log2: a=>Math.log2(Math.max(0.001,a[0])),
        exp: a=>Math.min(1e6,Math.exp(Math.min(20,a[0]))),
        fract: a=>a[0]-Math.floor(a[0]),
        round: a=>Math.round(a[0]),
        trunc: a=>Math.trunc(a[0]),
        asin: a=>Math.asin(Math.max(-1,Math.min(1,a[0]))),
        acos: a=>Math.acos(Math.max(-1,Math.min(1,a[0]))),
        atan: a=>Math.atan(a[0]),
        sinh: a=>Math.sinh(Math.min(20,a[0])),
        cosh: a=>Math.cosh(Math.min(20,a[0])),
        tanh: a=>Math.tanh(a[0]),
        hypot: a=>Math.hypot(a[0],a[1]),
        cbrt: a=>Math.cbrt(a[0]),

        // ═══ LOOPHOLE DOMAIN 1: SPACE MANIPULATION ═══
        warp: a=>a[0]+a[1]*Math.sin(a[2]),
        fold: a=>{const p=a[1]||100;return a[0]>0?(a[0]%p):(p+a[0]%p)%p;},
        mirror: a=>{const p=a[1]||200;const m=((a[0]%p)+p)%p;return m<p/2?m*2:(p-m)*2;},
        spiral_r: a=>a[0]*a[1],
        polar_x: a=>a[0]+a[2]*Math.cos(a[1]),
        polar_y: a=>a[0]+a[2]*Math.sin(a[1]),
        swizzle: a=>{const s=Math.sin(a[2]);const c=Math.cos(a[2]);return a[0]*c-a[1]*s;},
        swizzle_y: a=>{const s=Math.sin(a[2]);const c=Math.cos(a[2]);return a[0]*s+a[1]*c;},
        inflate: a=>a[0]*(1+a[1]*Math.sin(a[2])),
        compress: a=>a[0]/(1+Math.abs(a[1])),
        tesseract: a=>a[0]+a[1]*Math.sin(a[2])*Math.cos(a[3]),
        hyperplane: a=>a[0]*Math.cos(a[1])+a[2]*Math.sin(a[1]),
        gravity_well: a=>{const d=Math.max(1,Math.hypot(a[0]-a[2],a[1]-a[3]));return a[4]/(d*d);},

        // ═══ LOOPHOLE DOMAIN 2: TELEPORTATION ═══
        blink_to: a=>(a[2]>=a[3]?a[1]:a[0]),
        phase_shift: a=>a[0]+a[1]*(Math.floor(a[2]*a[3])%2===0?0:1),
        quantum_pos: a=>a[Math.floor(Math.abs(a[2]*a[3]))%2],
        gate: a=>{const p=((a[2]%a[3])+a[3])%a[3];return p<a[3]/2?a[0]:a[1];},
        scatter_to: a=>a[0]+(a[1]-a[0])*(Math.random()>0.5?1:0),
        flicker: a=>a[0]+a[1]*((Math.floor(a[2]*a[3])%3===0)?1:0),
        rift: a=>{const d=a[0]-a[1];return Math.abs(d)<a[2]?a[0]+a[3]*Math.sign(d):a[0];},
        tunnel: a=>{const f=Math.sin(a[2]*a[3]);return a[0]*(1-Math.abs(f))+a[1]*Math.abs(f);},

        // ═══ LOOPHOLE DOMAIN 3: CLONING / DUPLICATION ═══
        clone_offset: a=>a[0]+a[1]*(Math.floor(a[2]/(a[3]||1))%(a[4]||2)),
        mirror_x: a=>2*a[1]-a[0],
        mirror_y: a=>2*a[1]-a[0],
        phantom: a=>a[0]+a[1]*Math.sin(a[2]+a[3]*Math.PI*2/(a[4]||1)),
        kaleidoscope: a=>{const seg=Math.floor(a[2]/(a[3]||1))%(a[4]||6);const ang=seg*Math.PI*2/(a[4]||6);return a[0]+a[1]*Math.cos(ang);},
        fractal_clone: a=>a[0]+a[1]*Math.pow(a[2]||0.5,Math.floor(Math.abs(a[3]))%5),
        echo: a=>a[0]+a[1]*Math.sin(a[2]-a[3]*0.2),
        split: a=>{const g=Math.floor(a[1])%(a[2]||2);return a[0]+g*a[3]-(((a[2]||2)-1)*a[3])/2;},

        // ═══ LOOPHOLE DOMAIN 4: TIME MANIPULATION ═══
        timescale: a=>a[0]*a[1],
        reverse_t: a=>Math.max(0,a[1]-a[0]),
        freeze_at: a=>(a[0]>a[1]?a[1]:a[0]),
        loop_t: a=>(a[1]===0?0:((a[0]%a[1])+a[1])%a[1]),
        pingpong: a=>{const p=a[1]||1;const m=((a[0]%(2*p))+(2*p))%(2*p);return m<p?m:2*p-m;},
        stutter: a=>Math.floor(a[0]*a[1])/(a[1]||1),
        dilate: a=>a[0]*Math.pow(Math.abs(a[1])||1,Math.min(5,a[0])),
        wormhole_t: a=>(a[0]<a[1]?a[0]:a[0]+a[2]),
        rewind: a=>{const p=a[1]||2;const cycle=Math.floor(a[0]/p);return cycle%2===0?((a[0]%p)+p)%p:p-((a[0]%p)+p)%p;},
        chrono_split: a=>{const phase=Math.floor(a[0]/(a[1]||1))%3;return [a[0],a[0]*0.5,a[0]*2][phase];},
        bullet_time: a=>a[0]*(a[1]>0?a[1]:0.1),
        paradox: a=>{const v=Math.sin(a[0]*a[1]);return a[0]+v*a[2];},

        // ═══ LOOPHOLE DOMAIN 5: VELOCITY MANIPULATION ═══
        accel: a=>a[0]*a[1]*a[1],
        decel: a=>a[0]*Math.max(0,1-a[1]),
        ease_in: a=>a[0]*Math.pow(Math.max(0,Math.min(1,a[1])),3),
        ease_out: a=>{const t=1-Math.pow(1-Math.max(0,Math.min(1,a[1])),3);return a[0]*t;},
        ease_inout: a=>{const tt=Math.max(0,Math.min(1,a[1]));const t=tt<0.5?4*tt*tt*tt:1-Math.pow(-2*tt+2,3)/2;return a[0]*t;},
        impulse: a=>{const t=Math.max(0,a[1]);return a[0]*t*Math.exp(1-t*(a[2]||1));},
        spring: a=>a[0]*Math.exp(-(a[2]||0.5)*a[1])*Math.cos((a[3]||5)*a[1]),
        bounce: a=>{const t=((a[1]%1)+1)%1;return a[0]*Math.abs(Math.sin(t*Math.PI*(a[2]||3)))*Math.pow(a[3]||0.8,Math.floor(a[1]));},
        whip: a=>a[0]*(a[1]<(a[2]||0.3)?Math.pow(a[1]/(a[2]||0.3),0.3):Math.pow(Math.max(0,1-(a[1]-(a[2]||0.3))*2),2)),
        orbit_speed: a=>a[0]/Math.max(1,Math.sqrt(Math.abs(a[1]))),
        terminal_v: a=>a[0]*Math.tanh(a[1]*(a[2]||1)),
        slingshot: a=>{const t=a[1];return a[0]*(t<0.3?-t*2:Math.pow(Math.max(0,t-0.3),2)*8);},

        // ═══ LOOPHOLE DOMAIN 6: MANA / RESOURCE MANIPULATION ═══
        mana_scale: a=>a[0]*(a[1]/Math.max(1,a[2]||100)),
        mana_pulse: a=>a[0]*Math.sin(a[1]*(a[2]||1)/(a[3]||1)),
        hp_ratio: a=>a[0]*(a[1]/Math.max(1,a[2]||1)),
        desperation: a=>a[0]*(1+Math.max(0,1-a[1]/Math.max(1,a[2]||1))*(a[3]||2)),
        overflow: a=>(a[0]>(a[1]||50)?a[0]-(a[1]||50):0),
        sacrifice: a=>a[0]+a[1]*(1-a[2]/Math.max(1,a[3]||1)),
        resonance: a=>a[0]*(1+0.5*Math.sin(a[1]*(a[2]||1))),
        entropy: a=>a[0]*(1+(a[1]||0.5)*Math.random()),

        // ═══ LOOPHOLE DOMAIN 7: WAVE PHYSICS ═══
        wave: a=>a[0]*Math.sin((a[1]||1)*a[2]+(a[3]||0)),
        standing: a=>a[0]*Math.sin((a[1]||1)*a[2])*Math.cos((a[3]||1)*a[2]),
        harmonic: a=>{let s=0;for(let h=1;h<=Math.min(a[3]||3,8);h++)s+=Math.sin(h*(a[1]||1)*a[2])/h;return a[0]*s;},
        beat: a=>a[0]*Math.cos(((a[1]||1)-(a[2]||1.5))*(a[3]||1)/2)*Math.sin(((a[1]||1)+(a[2]||1.5))*(a[3]||1)/2),
        doppler: a=>{const v=a[2]||1;const vs=340;return a[0]*(a[1]||1)*vs/(vs-Math.max(-300,Math.min(300,v)));},
        interference: a=>a[0]*(Math.sin(a[1]||0)+Math.sin(a[2]||0)),
        diffract: a=>{const x=a[1]||0.01;return a[0]*Math.sin(x)/Math.max(0.01,Math.abs(x));},
        soliton: a=>a[0]/Math.cosh(a[1]-(a[2]||1)*(a[3]||0)),

        // ═══ LOOPHOLE DOMAIN 8: FRACTAL / PROCEDURAL ═══
        noise: a=>{const x=a[0]*0.1;return (Math.sin(x*12.9898+(a[1]||0)*78.233)*43758.5453)%1;},
        fbm: a=>{let v=0,amp=0.5,f=a[0];for(let o=0;o<4;o++){v+=amp*((Math.sin(f*12.9898)*43758.5453)%1);f*=2;amp*=0.5;}return v;},
        voronoi: a=>{const cx=Math.floor(a[0]),cy=Math.floor(a[1]||0);let md=9;for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){const h=Math.sin((cx+ox)*12.9898+(cy+oy)*78.233)*43758.5453;const px=cx+ox+(h%1)*0.8+0.1;const py=cy+oy+((h*1.7)%1)*0.8+0.1;const d=Math.hypot(a[0]-px,(a[1]||0)-py);md=Math.min(md,d);}return md;},
        sierpinski: a=>{let x=Math.abs(a[0]),y=Math.abs(a[1]||0),s=a[2]||100;for(let i=0;i<5;i++){x=2*x%s;y=2*y%s;}return (x+y)/s;},
        mandelbrot: a=>{let zr=0,zi=0;for(let i=0;i<10;i++){const tr=zr*zr-zi*zi+a[0]/100;zi=2*zr*zi+(a[1]||0)/100;zr=tr;if(zr*zr+zi*zi>4)return i/10;}return 1;},
        julia: a=>{let zr=a[0]/100,zi=(a[1]||0)/100;for(let i=0;i<10;i++){const tr=zr*zr-zi*zi+(a[2]||0.355);zi=2*zr*zi+(a[3]||0.355);zr=tr;if(zr*zr+zi*zi>4)return i/10;}return 1;},
        rose: a=>Math.cos((a[1]||3)*a[0]),
        lissajous_x: a=>Math.sin((a[1]||3)*a[0]+(a[2]||0)),
        lissajous_y: a=>Math.sin((a[1]||2)*a[0]),
        superformula: a=>{const phi=a[0];const m=a[1]||4;const n1=a[2]||1;const n2=a[3]||1;const n3=a[4]||1;return Math.pow(Math.pow(Math.abs(Math.cos(m*phi/4)),n2)+Math.pow(Math.abs(Math.sin(m*phi/4)),n3),-1/(n1||1));},

        // ═══ LOOPHOLE DOMAIN 9: FIELD EFFECTS ═══
        attract: a=>{const dx=(a[2]||0)-a[0],dy=(a[3]||0)-a[1];const d=Math.max(5,Math.hypot(dx,dy));return (a[4]||1)*dx/d;},
        attract_y: a=>{const dx=(a[2]||0)-a[0],dy=(a[3]||0)-a[1];const d=Math.max(5,Math.hypot(dx,dy));return (a[4]||1)*dy/d;},
        repel: a=>{const dx=a[0]-(a[2]||0),dy=(a[1]||0)-(a[3]||0);const d=Math.max(5,Math.hypot(dx,dy));return a[0]+(a[4]||50)*dx/(d*d);},
        vortex_x: a=>{const dx=a[0]-(a[2]||0),dy=(a[1]||0)-(a[3]||0);const d=Math.max(5,Math.hypot(dx,dy));return (a[2]||0)-(a[4]||50)*dy/d;},
        vortex_y: a=>{const dx=a[0]-(a[2]||0),dy=(a[1]||0)-(a[3]||0);const d=Math.max(5,Math.hypot(dx,dy));return (a[3]||0)+(a[4]||50)*dx/d;},
        lorenz_x: a=>{return a[0]+10*((a[1]||0)-a[0])*0.01;},
        lorenz_y: a=>{return (a[1]||0)+(a[0]*(28-(a[2]||0))-(a[1]||0))*0.01;},
        gradient: a=>{const t=Math.max(0,Math.min(1,(a[0]-(a[1]||0))/((a[2]||1)-(a[1]||0)||1)));return (a[3]||0)+t*((a[4]||1)-(a[3]||0));},
        smoothstep: a=>{const t=Math.max(0,Math.min(1,(a[0]-(a[1]||0))/((a[2]||1)-(a[1]||0)||1)));return t*t*(3-2*t);},
        magnetic: a=>{const d=Math.max(1,Math.hypot(a[0]-(a[2]||0),(a[1]||0)-(a[3]||0)));return (a[4]||50)*Math.cos(d*0.05)/d;},

        // ═══ LOOPHOLE DOMAIN 10: QUANTUM / PROBABILITY ═══
        qrand: a=>{const seed=a[0]*12345.6789;return ((Math.sin(seed)*43758.5453)%1+1)%1;},
        superpose: a=>{const p=((Math.sin((a[3]||0)*99.9)*43758.5453)%1+1)%1;return p>0.5?a[0]+(a[2]||0):a[1]+(a[2]||0);},
        uncertainty: a=>a[0]+(a[1]||10)*(((Math.sin((a[2]||0)*173.17)*43758.5453)%1+1)%1-0.5),
        tunnel_prob: a=>(((Math.sin((a[2]||0)*(a[3]||1)*91.7)*43758.5453)%1+1)%1>(a[1]||0.5)?a[0]+(a[4]||50):a[0]),
        collapse: a=>{const r=((Math.sin((a[2]||0)*71.137)*43758.5453)%1+1)%1;return r<(a[3]||0.5)?a[0]:(a[1]||0);},
        entangle: a=>a[0]+(a[1]||0)-(a[2]||0),
        decohere: a=>a[0]+((a[1]||0)-a[0])*Math.min(1,(a[2]||0)*(a[3]||1)),
        spin: a=>(Math.floor(a[0]*(a[1]||1))%2===0?(a[2]||1):-(a[2]||1)),

        // ═══ LOOPHOLE DOMAIN 11: GEOMETRY / TOPOLOGY ═══
        torus_x: a=>((a[2]||80)+(a[3]||20)*Math.cos(a[1]||0))*Math.cos(a[0]),
        torus_y: a=>((a[2]||80)+(a[3]||20)*Math.cos(a[1]||0))*Math.sin(a[0]),
        mobius: a=>{const u=a[0],v=a[1]||0,R=a[2]||80;return (R+(v||0)*Math.cos(u/2))*Math.cos(u);},
        klein: a=>{const u=a[0],v=a[1]||0;return (2+Math.cos(u/2)*Math.sin(v)-Math.sin(u/2)*Math.sin(2*v))*Math.cos(u)*30;},
        helix_x: a=>(a[2]||50)*Math.cos(a[0])+(a[3]||0)*(a[1]||0),
        helix_y: a=>(a[2]||50)*Math.sin(a[0]),
        trefoil_x: a=>{const t=a[0];return (2+Math.cos(3*t))*Math.cos(2*t)*(a[1]||30);},
        trefoil_y: a=>{const t=a[0];return (2+Math.cos(3*t))*Math.sin(2*t)*(a[1]||30);},
        epicycloid_x: a=>{const R=a[1]||60,r=a[2]||15;return (R+r)*Math.cos(a[0])-r*Math.cos((R+r)*a[0]/(r||1));},
        epicycloid_y: a=>{const R=a[1]||60,r=a[2]||15;return (R+r)*Math.sin(a[0])-r*Math.sin((R+r)*a[0]/(r||1));},
        hypotrochoid_x: a=>{const R=a[1]||60,r=a[2]||20,d=a[3]||30;return (R-r)*Math.cos(a[0])+d*Math.cos((R-r)*a[0]/(r||1));},
        hypotrochoid_y: a=>{const R=a[1]||60,r=a[2]||20,d=a[3]||30;return (R-r)*Math.sin(a[0])-d*Math.sin((R-r)*a[0]/(r||1));},
        cardioid: a=>(1-Math.cos(a[0]))*(a[1]||50),

        // ═══ LOOPHOLE DOMAIN 12: CONDITIONAL / LOGIC ═══
        ifgt: a=>(a[0]>(a[1]||0)?(a[2]||1):(a[3]||0)),
        iflt: a=>(a[0]<(a[1]||0)?(a[2]||1):(a[3]||0)),
        ifeq: a=>(Math.abs(a[0]-(a[1]||0))<(a[4]||0.01)?(a[2]||1):(a[3]||0)),
        select: a=>{const idx=Math.floor(Math.abs(a[0]))%Math.max(1,a.length-1);return a[idx+1]||0;},
        sawtooth: a=>((a[1]||1)===0?0:(((a[0]/(a[1]||1))%1+1)%1)*(a[2]||1)),
        square_wave: a=>(Math.sin(a[0]*(a[1]||1))>0?(a[2]||1):-(a[2]||1)),
        triangle_wave: a=>{const p=a[1]||1;return (a[2]||1)*2/Math.PI*Math.asin(Math.sin(2*Math.PI*a[0]/p));},
        pulse: a=>((((a[0]%(a[1]||1))+(a[1]||1))%(a[1]||1))<(a[2]||0.5)?(a[3]||1):0),
        ramp: a=>Math.min(a[1]||1,a[0]*(a[2]||1)),
        decay: a=>a[0]*Math.exp(-(a[1]||0)*(a[2]||1)),
        threshold: a=>(a[0]>(a[1]||0)?a[0]:0),
        wrap: a=>{const lo=a[1]||0,hi=a[2]||1;const r=hi-lo;return r===0?lo:lo+((a[0]-lo)%r+r)%r;},

        // ═══ LOOPHOLE DOMAIN 13: COMPOSITE / META ═══
        mix: a=>a[0]*(1-(a[2]||0.5))+(a[1]||0)*(a[2]||0.5),
        remap: a=>{const t=(a[0]-(a[1]||0))/((a[2]||1)-(a[1]||0)||1);return (a[3]||0)+t*((a[4]||1)-(a[3]||0));},
        snap: a=>((a[1]||1)===0?a[0]:Math.round(a[0]/(a[1]||1))*(a[1]||1)),
        quantize: a=>((a[1]||1)===0?a[0]:Math.floor(a[0]/(a[1]||1))*(a[1]||1)),
        smooth: a=>a[0]+((a[1]||0)-a[0])*Math.min(1,a[2]||0.1),
        wobble: a=>a[0]+(a[1]||10)*Math.sin(a[2]||0)*Math.cos((a[3]||0)*1.7),
        zigzag: a=>{const p=a[1]||1;const t=(((a[0]/p)%2)+2)%2;return (a[2]||1)*(t<1?t:2-t);},
        orbit_x: a=>a[0]+(a[2]||50)*Math.cos((a[3]||1)*(a[4]||0)+(a[5]||0)),
        orbit_y: a=>(a[1]||0)+(a[2]||50)*Math.sin((a[3]||1)*(a[4]||0)+(a[5]||0)),
        pendulum: a=>a[0]*Math.sin(a[1]||0)*Math.exp(-(a[2]||0.1)*(a[3]||0)),
        cascade: a=>{const d=Math.floor(a[0])*(a[1]||0.1);return (a[2]||0)+(a[3]||1)*Math.sin((a[4]||0)-d);},

        // ═══ LOOPHOLE DOMAIN 14: CHAOS THEORY ═══
        logistic: a=>{let x=Math.max(0.01,Math.min(0.99,a[0]||0.5));const r=a[1]||3.9;for(let i=0;i<Math.min(10,Math.floor(Math.abs(a[2])||1));i++)x=r*x*(1-x);return x;},
        henon_x: a=>{return 1-(a[2]||1.4)*(a[0]||0)*(a[0]||0)+(a[1]||0);},
        henon_y: a=>{return (a[2]||0.3)*(a[0]||0);},
        rossler_x: a=>{return a[0]+(-( a[1]||0)-(a[2]||0))*0.01;},
        bifurcate: a=>{const r=a[0]||3.5;let x=0.5;for(let i=0;i<20;i++)x=r*x*(1-x);return x*(a[1]||100);},
        feigenbaum: a=>{const t=a[0]||0,s=a[1]||100;return s*Math.sin(t*4.669201)*Math.cos(t*2.502907);},
        chaos_orbit: a=>{const t=a[0]||0,r=a[1]||80;return r*Math.sin(t*Math.E)*Math.cos(t*Math.PI);},
    };

    return { compile, validate, tokenize, parse, _builtins };
})();
