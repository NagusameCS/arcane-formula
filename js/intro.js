// ─────────────────────────────────────────────
//  INTRO SEQUENCE (kept from v1 — FMA stone tablets)
// ─────────────────────────────────────────────

const Intro = (() => {
    const LAWS = [
        { title:"THE FIRST LAW", subtitle:"CONSERVATION OF MANA",
          lines:["All magic is composed of particles called ARCONS.","Each mage possesses a finite reservoir of mana.",
            "One mana begets one arcon. One arcon carries one damage.","While an arcon persists, its mana is BOUND.",
            "The instant an arcon expires, its mana RETURNS."] },
        { title:"THE SECOND LAW", subtitle:"THE FORMLESS NATURE",
          lines:["There are no elements. No types. No categories.","Magic is raw, shapeless ENERGY.",
            "The trajectory of each arcon is defined","solely by the caster's FORMULA.",
            "Creativity is the only weapon."] },
        { title:"THE THIRD LAW", subtitle:"ARCON ANNIHILATION",
          lines:["When two opposing arcons collide,","both are DESTROYED in equal exchange.",
            "Stationary arcons form stronger barriers.","Defense is offense aimed differently."] },
        { title:"THE FOURTH LAW", subtitle:"FIRST INTERSECTION",
          lines:["An arcon is destroyed upon contact","with a target or a boundary.",
            "Each arcon deals exactly ONE damage.","Power lies in QUANTITY and AIM."] },
        { title:"THE FIFTH LAW", subtitle:"TEMPORAL DECAY",
          lines:["No arcon may persist beyond FIVE seconds.","After this threshold, the particle dissipates",
            "and its mana INSTANTLY returns to the caster."] },
        { title:"THE SIXTH LAW", subtitle:"THE BURNOUT THRESHOLD",
          lines:["A caster who expends more than SEVENTY percent","of available mana in a single incantation",
            "shall suffer BURNOUT — the flow of mana slows."] },
        { title:"THE SEVENTH LAW", subtitle:"THE GIFT OF EVASION",
          lines:["Every mage may DASH — a swift blink","that renders them briefly intangible.",
            "But the gift has limits.","Use it wisely, for it is not infinite."] },
    ];

    let currentLaw = -1, charIndex = 0, lineIndex = 0;
    let phase = 'fade-in', timer = 0, alpha = 0;
    let particles = [], shakeAmount = 0, done = false;
    let skipHeld = false, skipTimer = 0;

    function spawnParticles(count) {
        for (let i = 0; i < count; i++) {
            particles.push({ x:Math.random()*960, y:Math.random()*540, vx:(Math.random()-.5)*15,
                vy:-Math.random()*30-10, life:Math.random()*3+1, maxLife:0,
                size:Math.random()*2+1, color:`hsl(${40+Math.random()*20},70%,${50+Math.random()*30}%)` });
            particles[particles.length-1].maxLife = particles[particles.length-1].life;
        }
    }

    function init() { currentLaw=-1;phase='fade-in';timer=0;alpha=0;done=false;particles=[];charIndex=0;lineIndex=0;spawnParticles(30); }

    function nextLaw() {
        currentLaw++;
        if (currentLaw >= LAWS.length) { phase='final-fade';timer=0;alpha=1;shakeAmount=0;return; }
        phase='title';timer=0;alpha=0;lineIndex=0;charIndex=0;shakeAmount=8;spawnParticles(20);
    }

    function update(dt) {
        if (done) return;
        if (skipHeld) skipTimer += dt; else skipTimer = 0;
        timer += dt;
        for (let i=particles.length-1;i>=0;i--) { particles[i].x+=particles[i].vx*dt;particles[i].y+=particles[i].vy*dt;particles[i].life-=dt;if(particles[i].life<=0)particles.splice(i,1); }
        shakeAmount *= 0.92;

        if (phase==='fade-in') { alpha=Math.min(1,timer/2);if(timer>2.5){phase='opening-text';timer=0;alpha=0;} }
        else if (phase==='opening-text') { alpha=Math.min(1,timer/1.5);if(timer>5){phase='opening-fade';timer=0;} }
        else if (phase==='opening-fade') { alpha=1-Math.min(1,timer/1.5);if(timer>2)nextLaw(); }
        else if (phase==='title') { alpha=Math.min(1,timer/0.8);if(timer>1.8){phase='subtitle';timer=0;} }
        else if (phase==='subtitle') { alpha=Math.min(1,timer/0.6);if(timer>1.2){phase='lines';timer=0;lineIndex=0;charIndex=0;} }
        else if (phase==='lines') {
            const law=LAWS[currentLaw];
            if(lineIndex<law.lines.length){charIndex+=35*dt;if(charIndex>=law.lines[lineIndex].length){charIndex=0;lineIndex++;if(lineIndex>=law.lines.length){phase='wait';timer=0;}}}
        }
        else if (phase==='wait') { if(timer>2){phase='law-fade';timer=0;} }
        else if (phase==='law-fade') { alpha=1-Math.min(1,timer/1);if(timer>1.5)nextLaw(); }
        else if (phase==='final-fade') { alpha=1-Math.min(1,timer/2);if(timer>2.5)done=true; }
        if (skipTimer > 1.0) done = true;
    }

    function render(ctx, W, H) {
        ctx.save();
        if(shakeAmount>.5) ctx.translate((Math.random()-.5)*shakeAmount,(Math.random()-.5)*shakeAmount);
        ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
        const grad=ctx.createRadialGradient(W/2,H/2,100,W/2,H/2,W*.7);
        grad.addColorStop(0,'rgba(20,15,8,0)');grad.addColorStop(1,'rgba(0,0,0,0.7)');
        ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
        for(const p of particles){ctx.globalAlpha=(p.life/p.maxLife)*.6;ctx.fillStyle=p.color;ctx.fillRect(Math.floor(p.x),Math.floor(p.y),p.size,p.size);}
        ctx.globalAlpha=1;

        if(phase==='opening-text'||phase==='opening-fade'){
            ctx.globalAlpha=alpha;ctx.textAlign='center';
            ctx.font='14px "Courier New",monospace';ctx.fillStyle='#665533';
            ctx.fillText('THE UNIVERSE SPEAKS IN SILENCE',W/2,H/2-80);
            ctx.font='bold 22px "Courier New",monospace';ctx.fillStyle='#ffd700';ctx.shadowColor='#ffd700';ctx.shadowBlur=20;
            ctx.fillText('BUT TO THOSE WHO LISTEN',W/2,H/2-30);
            ctx.font='bold 28px "Courier New",monospace';ctx.fillStyle='#fff';ctx.shadowBlur=30;
            ctx.fillText('IT REVEALS ITS IMMUTABLE LAWS',W/2,H/2+30);
            ctx.shadowBlur=0;ctx.font='12px "Courier New",monospace';ctx.fillStyle='#554';
            ctx.fillText('— Inscription upon the First Tablet',W/2,H/2+80);
            ctx.globalAlpha=1;
        } else if(currentLaw>=0&&currentLaw<LAWS.length){
            const law=LAWS[currentLaw];const fa=phase==='law-fade'?alpha:Math.min(1,alpha);
            ctx.globalAlpha=fa;
            drawTablet(ctx,W/2-340,H/2-200,680,400);
            ctx.textAlign='center';ctx.font='bold 11px "Courier New",monospace';ctx.fillStyle='#665533';
            ctx.fillText(`— ${law.title} —`,W/2,H/2-150);
            ctx.font='bold 24px "Courier New",monospace';ctx.fillStyle='#ffd700';ctx.shadowColor='#ffd700';ctx.shadowBlur=phase==='title'?15:8;
            ctx.fillText(law.subtitle,W/2,H/2-110);ctx.shadowBlur=0;
            if(phase==='lines'||phase==='wait'||phase==='law-fade'){
                ctx.font='14px "Courier New",monospace';ctx.textAlign='center';
                for(let l=0;l<law.lines.length;l++){
                    let text=law.lines[l];
                    if(phase==='lines'&&l===lineIndex) text=text.substring(0,Math.floor(charIndex));
                    else if(phase==='lines'&&l>lineIndex) continue;
                    drawHL(ctx,text,W/2,H/2-60+l*28);
                }
            }
            ctx.globalAlpha=1;
        } else if(phase==='final-fade'){
            ctx.globalAlpha=alpha;ctx.textAlign='center';
            ctx.font='bold 20px "Courier New",monospace';ctx.fillStyle='#ffd700';ctx.shadowColor='#ffd700';ctx.shadowBlur=25;
            ctx.fillText('NOW, SCRIBE YOUR FORMULAS',W/2,H/2-10);ctx.shadowBlur=0;
            ctx.font='13px "Courier New",monospace';ctx.fillStyle='#665533';
            ctx.fillText('And let the arena judge your mastery.',W/2,H/2+30);ctx.globalAlpha=1;
        }

        ctx.globalAlpha=.3;ctx.textAlign='center';ctx.font='11px "Courier New",monospace';ctx.fillStyle='#665';
        ctx.fillText('[HOLD CLICK TO SKIP]',W/2,H-25);
        if(skipTimer>0){ctx.fillStyle='#ffd700';ctx.globalAlpha=.5;ctx.fillRect(W/2-60,H-15,120*Math.min(1,skipTimer/1),3);}
        ctx.globalAlpha=1;
        if(phase==='wait'){ctx.globalAlpha=.4+Math.sin(timer*3)*.2;ctx.textAlign='center';ctx.font='12px "Courier New",monospace';ctx.fillStyle='#887';ctx.fillText('[ CLICK TO CONTINUE ]',W/2,H/2+175);ctx.globalAlpha=1;}
        ctx.restore();
    }

    function drawTablet(ctx,x,y,w,h){
        ctx.fillStyle='#1a1510';ctx.fillRect(x,y,w,h);
        ctx.strokeStyle='#3a2f20';ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,w-8,h-8);
        ctx.strokeStyle='#2a1f15';ctx.lineWidth=1;ctx.strokeRect(x+8,y+8,w-16,h-16);
        const cs=6;ctx.fillStyle='#3a2f20';
        ctx.fillRect(x+12,y+12,cs,cs);ctx.fillRect(x+w-12-cs,y+12,cs,cs);
        ctx.fillRect(x+12,y+h-12-cs,cs,cs);ctx.fillRect(x+w-12-cs,y+h-12-cs,cs,cs);
        ctx.globalAlpha=.03;ctx.strokeStyle='#fff';
        for(let i=0;i<20;i++){const ly=y+Math.random()*h;ctx.beginPath();ctx.moveTo(x,ly);ctx.lineTo(x+w,ly+(Math.random()-.5)*10);ctx.stroke();}
        ctx.globalAlpha=1;
    }

    function drawHL(ctx,text,x,y){
        const words=text.split(' ');const fw=ctx.measureText(text).width;let cx=x-fw/2;
        for(const w of words){
            const hi=w===w.toUpperCase()&&w.length>1&&/[A-Z]/.test(w);
            if(hi){ctx.fillStyle='#ffd700';ctx.shadowColor='#ffd700';ctx.shadowBlur=6;}
            else{ctx.fillStyle='#d4c5a0';ctx.shadowBlur=0;}
            ctx.textAlign='left';ctx.fillText(w,cx,y);cx+=ctx.measureText(w+' ').width;ctx.shadowBlur=0;
        }
    }

    function onClick(){if(phase==='wait'){phase='law-fade';timer=0;}else if(phase==='opening-text'){phase='opening-fade';timer=0;}}
    function onMouseDown(){skipHeld=true}
    function onMouseUp(){skipHeld=false}

    return { init, update, render, onClick, onMouseDown, onMouseUp, isDone:()=>done };
})();
