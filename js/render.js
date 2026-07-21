/* ============================================================
   RENDER.JS — отрисовка игры на canvas
   3D-шары с бликами, текстура стола, борта, лузы, кий, прицел.
   ============================================================ */
window.Render = (function(){

  let ctx, canvas;
  let W = 0, H = 0;
  let table = null, R = 12;
  let cueConfig = null;
  let ballSkin = null;
  let cloth = null;
  let aiming = false, aimStart = null, aimCur = null;
  let balls = [], pockets = [], obstacles = [];
  let bgGradient = null;
  let targetType = 'all';

  function init(canvasEl){
    canvas = canvasEl; ctx = canvas.getContext('2d');
  }

  function resize(w, h){
    W = w; H = h;
    bgGradient = null; // пересоздать
  }

  function setTable(t, radius){
    table = t; R = radius;
    FX.setR(radius);
  }

  function setState(state){
    balls = state.balls || balls;
    pockets = state.pockets || pockets;
    obstacles = state.obstacles || obstacles;
    cueConfig = state.cueConfig;
    ballSkin = state.ballSkin;
    cloth = state.cloth;
    aiming = state.aiming;
    aimStart = state.aimStart;
    aimCur = state.aimCur;
    targetType = state.targetType || 'all';
  }

  // ---- Утилиты цвета ----
  // Принимает #rgb, #rrggbb, rgb()/rgba(). Возвращает корректный rgb().
  function parseColor(c){
    if(typeof c !== 'string') return { r:255, g:255, b:255 };
    c = c.trim();
    if(c.startsWith('#')){
      let h = c.slice(1);
      if(h.length === 3) h = h.split('').map(x => x+x).join('');
      if(h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return { r:255, g:255, b:255 };
      return { r:parseInt(h.substr(0,2),16), g:parseInt(h.substr(2,2),16), b:parseInt(h.substr(4,2),16) };
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if(m){
      const parts = m[1].split(',').map(s => parseFloat(s));
      return { r:parts[0]||0, g:parts[1]||0, b:parts[2]||0 };
    }
    return { r:255, g:255, b:255 };
  }
  function lighten(c, amt){
    const p = parseColor(c);
    const r = Math.min(255, Math.round(p.r+amt));
    const g = Math.min(255, Math.round(p.g+amt));
    const bl = Math.min(255, Math.round(p.b+amt));
    return `rgb(${r},${g},${bl})`;
  }
  function darken(c, amt){
    const p = parseColor(c);
    const r = Math.max(0, Math.round(p.r-amt));
    const g = Math.max(0, Math.round(p.g-amt));
    const bl = Math.max(0, Math.round(p.b-amt));
    return `rgb(${r},${g},${bl})`;
  }

  function roundRect(x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }

  // ============ ОСНОВНОЙ Кадр ============
  function draw(gameState, cueBall, shooting){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Фон
    if(!bgGradient){
      bgGradient = ctx.createRadialGradient(W/2, H/2, 50, W/2, H/2, Math.max(W, H));
      bgGradient.addColorStop(0, '#0a2418');
      bgGradient.addColorStop(1, '#020a06');
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, W, H);

    // Тонкие точки-декор фона
    drawBackgroundDots();

    if(gameState === 'menu') return;

    // Применяем тряску
    const sh = FX.getShake();
    ctx.save();
    ctx.translate(sh.x, sh.y);

    drawTable();
    drawObstacles();
    drawPockets();

    // Трейлы под шарами
    FX.drawTrails(ctx);

    // Прицел
    if(aiming && aimStart && aimCur && cueBall && cueBall.active && !shooting){
      drawAim(cueBall);
    }

    // Шары
    for(const b of balls){ if(b.active) drawBall(b); }

    // Кий поверх шаров (если прицеливаемся)
    if(aiming && aimStart && aimCur && cueBall && cueBall.active && !shooting){
      drawCue(cueBall);
    }

    // Частицы поверх
    FX.drawParticles(ctx);

    ctx.restore();

    // Вспышка (поверх всего, без тряски)
    FX.drawFlash(ctx, W, H);
  }

  // Декоративные точки на фоне
  const bgDots = [];
  function ensureBgDots(){
    if(bgDots.length === 0){
      for(let i=0;i<60;i++){
        bgDots.push({ x:Math.random(), y:Math.random(), s:0.5+Math.random()*1.5, a:0.05+Math.random()*0.1 });
      }
    }
  }
  function drawBackgroundDots(){
    ensureBgDots();
    ctx.fillStyle = '#7be0a0';
    for(const d of bgDots){
      ctx.globalAlpha = d.a;
      ctx.beginPath();
      ctx.arc(d.x*W, d.y*H, d.s, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ============ СТОЛ ============
  function drawTable(){
    const wall = table.wall;
    const c = cloth || { felt:'#1b7a3e', feltDark:'#0d4a24', rail:'#5d3a1a', pocket:'#000' };

    // Внешний деревянный борт (тёмный)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    const woodG = ctx.createLinearGradient(table.x - wall, table.y - wall, table.x - wall, table.y + table.h + wall);
    woodG.addColorStop(0, lighten(c.rail, 30));
    woodG.addColorStop(0.5, c.rail);
    woodG.addColorStop(1, darken(c.rail, 25));
    ctx.fillStyle = woodG;
    roundRect(table.x - wall, table.y - wall, table.w + wall*2, table.h + wall*2, wall*0.8);
    ctx.fill();
    ctx.restore();

    // Внутренний бортик светлее
    ctx.fillStyle = lighten(c.rail, 20);
    roundRect(table.x - wall*0.5, table.y - wall*0.5, table.w + wall, table.h + wall, wall*0.6);
    ctx.fill();

    // Сукно с виньеткой
    const cg = ctx.createRadialGradient(
      table.x + table.w/2, table.y + table.h/2, table.w*0.1,
      table.x + table.w/2, table.y + table.h/2, table.h*0.65
    );
    cg.addColorStop(0, lighten(c.felt, 15));
    cg.addColorStop(0.6, c.felt);
    cg.addColorStop(1, c.feltDark);
    ctx.fillStyle = cg;
    ctx.fillRect(table.x, table.y, table.w, table.h);

    // Лёгкая текстура сукна (шум линиями)
    ctx.save();
    ctx.beginPath();
    ctx.rect(table.x, table.y, table.w, table.h);
    ctx.clip();
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.5;
    for(let y = table.y; y < table.y + table.h; y += 3){
      ctx.beginPath();
      ctx.moveTo(table.x, y);
      ctx.lineTo(table.x + table.w, y);
      ctx.stroke();
    }
    ctx.restore();

    // Линии разметки (дом, центр)
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1.5;
    // Линия дома (3/4 вниз)
    ctx.beginPath();
    ctx.moveTo(table.x, table.y + table.h*0.75);
    ctx.lineTo(table.x + table.w, table.y + table.h*0.75);
    ctx.stroke();
    // Дуга дома
    ctx.beginPath();
    ctx.arc(table.x + table.w*0.5, table.y + table.h*0.75, table.w*0.11, Math.PI, 0);
    ctx.stroke();
    // Центральная точка
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.arc(table.x + table.w*0.5, table.y + table.h*0.5, 3, 0, Math.PI*2);
    ctx.fill();
    // Точка на линии дома
    ctx.beginPath();
    ctx.arc(table.x + table.w*0.5, table.y + table.h*0.75, 3, 0, Math.PI*2);
    ctx.fill();
  }

  // ============ ЛУЗЫ ============
  function drawPockets(){
    for(const p of pockets){
      // Тень/углубление
      ctx.save();
      const grad = ctx.createRadialGradient(p.x, p.y, p.r*0.2, p.x, p.y, p.r*1.3);
      grad.addColorStop(0, '#000');
      grad.addColorStop(0.7, '#0a0a0a');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r*1.3, 0, Math.PI*2);
      ctx.fill();
      // Ободок лузы
      ctx.strokeStyle = '#2a1808';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.stroke();
      // Внутренняя кромка светлее
      ctx.strokeStyle = 'rgba(255,210,140,.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r*0.95, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ============ ПРЕПЯТСТВИЯ ============
  function drawObstacles(){
    for(const o of obstacles){
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      const grad = ctx.createRadialGradient(o.x - o.r*0.35, o.y - o.r*0.35, o.r*0.1, o.x, o.y, o.r);
      grad.addColorStop(0, '#64b5f6');
      grad.addColorStop(0.7, '#1976d2');
      grad.addColorStop(1, '#0d47a1');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = '#0d47a1';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Блик
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath();
      ctx.arc(o.x - o.r*0.3, o.y - o.r*0.35, o.r*0.28, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ============ ШАРЫ (3D-стиль) ============
  function drawBall(b){
    const skin = b.cue ? ballSkin : { color:b.color, glow:b.glow, stripe:b.stripe };
    const baseColor = skin.color;
    const glow = skin.glow || lighten(baseColor, 40);

    // Подсветка целевого шара (если этот тип — цель)
    const isCurrentTarget = !b.cue && b.isTarget && (targetType === 'all' || b.type === targetType);
    if(isCurrentTarget){
      const pulse = 0.5 + 0.5*Math.sin(performance.now()/350);
      ctx.save();
      ctx.globalAlpha = 0.25 + pulse*0.25;
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (1.25 + pulse*0.15), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    // Тень
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;

    // Основной шар — радиальный градиент с бликом
    const grad = ctx.createRadialGradient(
      b.x - b.r*0.4, b.y - b.r*0.4, b.r*0.05,
      b.x, b.y, b.r
    );
    grad.addColorStop(0, lighten(glow, 30));
    grad.addColorStop(0.3, glow);
    grad.addColorStop(0.7, baseColor);
    grad.addColorStop(1, darken(baseColor, 40));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();

    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Полоски для striped
    if(!b.cue && b.type === 'striped'){
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.clip();
      const stripeColor = skin.stripe || '#fff';
      ctx.fillStyle = stripeColor;
      // центральная полоса
      ctx.fillRect(b.x - b.r, b.y - b.r*0.42, b.r*2, b.r*0.84);
      ctx.restore();
    }

    // Номер/кружок для не-cue шаров
    if(!b.cue){
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r*0.42, 0, Math.PI*2);
      ctx.fill();
      if(b.number !== undefined){
        ctx.fillStyle = darken(baseColor, 30);
        ctx.font = `900 ${b.r*0.55}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(b.number), b.x, b.y + b.r*0.04);
      }
    }

    // Декоративный рисунок (SVG-подобный) на битке, если у скина задан узор.
    // Рисуется ПОВЕРХ базовой сферы, но ПОД глянцевым бликом, чтобы шар
    // сохранял объёмный 3D-вид. Узор рисуется в нормализованных координатах
    // (центр = 0,0; единица = радиус шара) — как векторный SVG.
    if(b.cue && ballSkin && ballSkin.pattern && window.BallArt && BallArt.has(ballSkin.pattern)){
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.clip();
      ctx.translate(b.x, b.y);
      ctx.scale(b.r, b.r);
      BallArt.draw(ctx, ballSkin.pattern, { base: baseColor, glow: skin.glow, stripe: skin.stripe });
      ctx.restore();
    }

    // Главный блик (глянец)
    const hl = ctx.createRadialGradient(
      b.x - b.r*0.4, b.y - b.r*0.4, 0,
      b.x - b.r*0.4, b.y - b.r*0.4, b.r*0.5
    );
    hl.addColorStop(0, 'rgba(255,255,255,.7)');
    hl.addColorStop(0.5, 'rgba(255,255,255,.15)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();

    // Маленькая точка-блик
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.arc(b.x - b.r*0.35, b.y - b.r*0.35, b.r*0.12, 0, Math.PI*2);
    ctx.fill();

    // Тонкая окантовка снизу для объёма
    ctx.strokeStyle = 'rgba(0,0,0,.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.stroke();

    ctx.restore();
  }

  // ============ ПРИЦЕЛ ============
  function drawAim(cueBall){
    const dx = aimStart.x - aimCur.x, dy = aimStart.y - aimCur.y;
    const ang = Math.atan2(dy, dx);
    const dirx = Math.cos(ang), diry = Math.sin(ang);

    const hit = Physics.predictHit(balls, cueBall.x, cueBall.y, ang, R);

    // Длина основной линии: до шара или ограничена кием
    const maxLen = cueConfig.aimLen * table.h;
    let lineLen = maxLen;
    if(hit) lineLen = Math.min(maxLen, hit.dist);

    const endX = cueBall.x + dirx*lineLen;
    const endY = cueBall.y + diry*lineLen;

    // Основная пунктирная линия прицела
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(cueBall.x, cueBall.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Шар-призрак и линия отражения
    if(hit && (cueConfig.aimMode === 'circle' || cueConfig.aimMode === 'reflect')){
      // Шар-призрак в точке контакта
      ctx.strokeStyle = 'rgba(255,210,74,.7)';
      ctx.fillStyle = 'rgba(255,210,74,.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hit.contactX, hit.contactY, R, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      // Линия отражения — направление полёта цели
      if(cueConfig.aimMode === 'reflect' && cueConfig.reflectLen > 0){
        const reflectLen = cueConfig.reflectLen * table.h;
        // Направление от точки контакта к центру цели = нормаль
        const ux = hit.nx, uy = hit.ny;
        ctx.strokeStyle = 'rgba(255,150,50,.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(hit.tx, hit.ty);
        ctx.lineTo(hit.tx + ux*reflectLen, hit.ty + uy*reflectLen);
        ctx.stroke();
        ctx.setLineDash([]);

        // Стрелка на конце
        drawArrow(hit.tx + ux*reflectLen, hit.ty + uy*reflectLen, Math.atan2(uy, ux), '#ff9a3a');
      }
    }

    // Точка в конце линии
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.beginPath();
    ctx.arc(endX, endY, 3, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function drawArrow(x, y, ang, color){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-10, -5);
    ctx.lineTo(-10, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ============ КИЙ ============
  function drawCue(cueBall){
    const dx = aimStart.x - aimCur.x, dy = aimStart.y - aimCur.y;
    const ang = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    const power = Math.min(dist, table.h*0.4);
    const back = R*2.2 + power*0.45;
    const cueLen = table.h*0.42;
    const cueW = Math.max(3, R*0.5);

    // Точки кия
    const bx = cueBall.x - Math.cos(ang)*back;
    const by = cueBall.y - Math.sin(ang)*back;
    const ex = bx - Math.cos(ang)*cueLen;
    const ey = by - Math.sin(ang)*cueLen;

    const cfg = cueConfig || { color:'#c9a227', tip:'#4a90d9', grip:'#3a2410' };

    ctx.save();
    ctx.lineCap = 'round';

    // Тень кия
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = cueW + 2;
    ctx.beginPath();
    ctx.moveTo(bx + 2, by + 3);
    ctx.lineTo(ex + 2, ey + 3);
    ctx.stroke();

    // Основной черенок (с градиентом: рукоять тёмная → наконечник светлый)
    const grad = ctx.createLinearGradient(bx, by, ex, ey);
    grad.addColorStop(0, cfg.grip || darken(cfg.color, 30));
    grad.addColorStop(0.3, cfg.color);
    grad.addColorStop(0.85, lighten(cfg.color, 20));
    grad.addColorStop(1, cfg.color);
    ctx.strokeStyle = grad;
    ctx.lineWidth = cueW;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Наконечник (tip) — голубая кожаная нашлепка
    ctx.fillStyle = cfg.tip || '#4a90d9';
    ctx.beginPath();
    ctx.arc(bx, by, cueW*0.55, 0, Math.PI*2);
    ctx.fill();
    // Блик на наконечнике
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath();
    ctx.arc(bx - cueW*0.15, by - cueW*0.15, cueW*0.2, 0, Math.PI*2);
    ctx.fill();

    // Декоративное кольцо у рукояти
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = cueW*0.3;
    const ringX = bx - Math.cos(ang)*cueLen*0.25;
    const ringY = by - Math.sin(ang)*cueLen*0.25;
    ctx.beginPath();
    ctx.arc(ringX, ringY, cueW*0.7, 0, Math.PI*2);
    ctx.stroke();

    // Блик по длине
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = cueW*0.25;
    ctx.beginPath();
    ctx.moveTo(bx - Math.cos(ang)*cueW*0.2 + Math.sin(ang)*cueW*0.2,
               by - Math.sin(ang)*cueW*0.2 - Math.cos(ang)*cueW*0.2);
    ctx.lineTo(ex + Math.cos(ang)*cueW*0.3 + Math.sin(ang)*cueW*0.2,
               ey + Math.sin(ang)*cueW*0.3 - Math.cos(ang)*cueW*0.2);
    ctx.stroke();

    ctx.restore();
  }

  return { init, resize, setTable, setState, draw, _lighten:lighten };
})();
