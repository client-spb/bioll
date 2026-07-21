/* ============================================================
   EFFECTS.JS — частицы, тряска, трейлы, всплывающие очки
   Все эффекты рисуются на canvas, кроме DOM-всплывашек очков.
   ============================================================ */
window.FX = (function(){
  const particles = [];
  const trails = new Map();   // ballId -> [{x,y,life}]
  let shakeMag = 0, shakeX = 0, shakeY = 0;
  let flashAlpha = 0, flashColor = '#fff';
  let timeScale = 1;          // для slow-mo эффектов

  // ---- ЧАСТИЦЫ ----
  function burst(x, y, n, color, opts={}){
    const speed = opts.speed || 4;
    const life = opts.life || 1;
    const size = opts.size || 3;
    const gravity = opts.gravity ?? 0.05;
    for(let i=0;i<n;i++){
      const a = Math.random()*Math.PI*2;
      const s = (0.3 + Math.random()) * speed;
      particles.push({
        x, y,
        vx: Math.cos(a)*s, vy: Math.sin(a)*s,
        life: life, maxLife: life,
        size: size*(0.6+Math.random()*0.6),
        color, gravity,
        kind: opts.kind || 'spark'
      });
    }
  }

  // Кольцо при ударе шара о шар
  function ring(x, y, color, radius=20){
    particles.push({ x, y, life:0.5, maxLife:0.5, color, kind:'ring', r:radius*0.3, maxR:radius });
  }

  // Звёздочки при забивании
  function stars(x, y, n, color){
    for(let i=0;i<n;i++){
      const a = Math.random()*Math.PI*2;
      const s = 2+Math.random()*5;
      particles.push({
        x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s - 2,
        life:1, maxLife:1, size:4+Math.random()*3, color, gravity:0.12, kind:'star', rot:Math.random()*6.28
      });
    }
  }

  // Дым/пыль
  function dust(x, y, n, color){
    for(let i=0;i<n;i++){
      const a = Math.random()*Math.PI*2;
      const s = 0.5+Math.random()*1.5;
      particles.push({
        x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s - 0.5,
        life:1, maxLife:1, size:8+Math.random()*8, color, gravity:-0.02, kind:'smoke'
      });
    }
  }

  // ---- ТРЕЙЛЫ ----
  function addTrail(ball){
    if(Math.abs(ball.vx) + Math.abs(ball.vy) < 1.5) return;
    let arr = trails.get(ball._id);
    if(!arr){ arr = []; trails.set(ball._id, arr); }
    arr.push({ x:ball.x, y:ball.y, life:1 });
    if(arr.length > 12) arr.shift();
  }
  function clearTrails(){ trails.clear(); }
  function removeTrail(id){ trails.delete(id); }

  // ---- ТРЯСКА ----
  function shake(mag=8){ shakeMag = Math.max(shakeMag, mag); }

  // ---- ВСПЫШКА ----
  function flash(color='#fff', alpha=0.4){ flashColor = color; flashAlpha = alpha; }

  // ---- ОБНОВЛЕНИЕ ----
  function update(dt){
    // частицы
    for(let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.life -= dt * (p.kind==='ring' ? 2.5 : 1.4);
      if(p.life <= 0){ particles.splice(i,1); continue; }
      if(p.kind === 'ring'){
        const t = 1 - p.life/p.maxLife;
        p.r = p.maxR * t;
      } else {
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.94; p.vy *= 0.94;
        p.vy += p.gravity;
        if(p.rot !== undefined) p.rot += 0.2;
      }
    }
    // трейлы
    trails.forEach(arr => {
      for(let i=arr.length-1;i>=0;i--){
        arr[i].life -= dt*2.5;
        if(arr[i].life <= 0) arr.splice(i,1);
      }
    });
    // тряска
    if(shakeMag > 0.1){
      shakeX = (Math.random()*2-1) * shakeMag;
      shakeY = (Math.random()*2-1) * shakeMag;
      shakeMag *= 0.85;
    } else { shakeX = 0; shakeY = 0; shakeMag = 0; }
    // вспышка
    if(flashAlpha > 0.001) flashAlpha *= 0.82;
    else flashAlpha = 0;
  }

  // ---- ОТРИСОВКА (вызывается из render) ----
  function drawTrails(ctx){
    trails.forEach((arr, id) => {
      if(arr.length < 2) return;
      for(let i=0;i<arr.length-1;i++){
        const t = arr[i], tn = arr[i+1];
        const alpha = t.life * (i/arr.length) * 0.5;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = t.color || '#fff';
        ctx.lineWidth = (R_REF * 1.6) * (i/arr.length);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(tn.x, tn.y);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }

  let R_REF = 12; // обновляется из main
  function setR(r){ R_REF = r; }

  function drawParticles(ctx){
    for(const p of particles){
      const a = p.life/p.maxLife;
      if(p.kind === 'ring'){
        ctx.globalAlpha = a * 0.7;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.stroke();
      } else if(p.kind === 'star'){
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        if(p.rot !== undefined) ctx.rotate(p.rot);
        drawStarShape(ctx, 0, 0, 5, p.size*a, p.size*a*0.5);
        ctx.fill();
        ctx.restore();
      } else if(p.kind === 'smoke'){
        ctx.globalAlpha = a * 0.3;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(1.5-a), 0, Math.PI*2); ctx.fill();
      } else { // spark
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size*a, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFlash(ctx, W, H){
    if(flashAlpha > 0.01){
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0,0,W,H);
      ctx.globalAlpha = 1;
    }
  }

  function drawStarShape(ctx, cx, cy, spikes, outer, inner){
    let rot = -Math.PI/2;
    const step = Math.PI/spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outer);
    for(let i=0;i<spikes;i++){
      ctx.lineTo(cx + Math.cos(rot)*outer, cy + Math.sin(rot)*outer); rot += step;
      ctx.lineTo(cx + Math.cos(rot)*inner, cy + Math.sin(rot)*inner); rot += step;
    }
    ctx.closePath();
  }

  function getShake(){ return { x:shakeX, y:shakeY }; }

  return {
    burst, ring, stars, dust,
    addTrail, clearTrails, removeTrail, drawTrails,
    shake, flash, update, drawParticles, drawFlash,
    getShake, setR, drawStarShape
  };
})();
