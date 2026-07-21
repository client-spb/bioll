/* ============================================================
   BALLART.JS — декоративные SVG-подобные рисунки на шарах
   ------------------------------------------------------------
   Каждая функция рисует узор ПОВЕРХ уже залитого шара.
   Контекст canvas на входе:
     - уже обрезан (clip) по окружности шара;
     - переведён так, что (0,0) — центр шара;
     - масштабирован: единица длины = 1 радиус шара (r=1).
     То есть шар целиком лежит в круге радиуса 1 вокруг (0,0).
   Все рисунки задаются в этих «нормализованных» координатах,
   благодаря чему узор выглядит чётким и масштабируется вместе
   с шаром — как векторный SVG.
   ============================================================ */
window.BallArt = (function(){

  // registry: имя узора -> функция(ctx, colors)
  // colors: { base, glow, stripe } — палитра текущего скина,
  // узор может опираться на неё для оттенков.
  const PATTERNS = {
    dots:      drawDots,
    flames:    drawFlames,
    snowflake: drawSnowflake,
    galaxy:    drawGalaxy,
    mercury:   drawMercury,
    star:      drawStar,
    hex:       drawHex,
    circuit:   drawCircuit
  };

  function draw(ctx, name, colors){
    const fn = PATTERNS[name];
    if(!fn) return;
    ctx.save();
    fn(ctx, colors || {});
    ctx.restore();
  }

  function has(name){ return !!PATTERNS[name]; }

  // -------- утилиты оттенков --------
  function mix(a, b, t){
    const pa = parse(a), pb = parse(b);
    const r = Math.round(pa.r + (pb.r - pa.r) * t);
    const g = Math.round(pa.g + (pb.g - pa.g) * t);
    const bl = Math.round(pa.b + (pb.b - pa.b) * t);
    return `rgb(${r},${g},${bl})`;
  }
  function parse(c){
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
      const p = m[1].split(',').map(s => parseFloat(s));
      return { r:p[0]||0, g:p[1]||0, b:p[2]||0 };
    }
    return { r:255, g:255, b:255 };
  }
  function lighten(c, amt){
    const p = parse(c);
    return `rgb(${Math.min(255,p.r+amt)},${Math.min(255,p.g+amt)},${Math.min(255,p.b+amt)})`;
  }
  function darken(c, amt){
    const p = parse(c);
    return `rgb(${Math.max(0,p.r-amt)},${Math.max(0,p.g-amt)},${Math.max(0,p.b-amt)})`;
  }

  // ===========================================================
  // УЗОР: россыпь светящихся точек (неон)
  // ===========================================================
  function drawDots(ctx, c){
    const glow = c.glow || '#fff';
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.85;
    // сетка точек по «параллелям»
    const rows = [
      { y:-0.55, n:5, r:0.07 },
      { y:-0.25, n:7, r:0.08 },
      { y: 0.05, n:7, r:0.08 },
      { y: 0.35, n:6, r:0.07 },
      { y: 0.62, n:4, r:0.06 }
    ];
    for(const row of rows){
      for(let i=0;i<row.n;i++){
        const x = -0.7 + (1.4 * (i + 0.5) / row.n);
        // отсекаем точки, явно выходящие за круг (по x^2+y^2>~0.8)
        if(x*x + row.y*row.y > 0.78) continue;
        ctx.beginPath();
        ctx.arc(x, row.y, row.r, 0, Math.PI*2);
        ctx.fill();
      }
    }
    // мягкий центральный ореол
    const g = ctx.createRadialGradient(0,0,0, 0,0, 0.9);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0,0,1,0,Math.PI*2); ctx.fill();
  }

  // ===========================================================
  // УЗОР: языки пламени (огонь)
  // ===========================================================
  function drawFlames(ctx, c){
    const base = c.base || '#ff5722';
    const glow = c.glow || '#ff9a3a';
    // нижняя «подошва» огня — тёмная
    ctx.fillStyle = darken(base, 40);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 0.55, 0.9, 0.45, 0, 0, Math.PI*2);
    ctx.fill();

    // языки пламени — треугольные «капли»
    ctx.globalAlpha = 0.9;
    const flames = [
      { x:-0.55, h:0.6,  w:0.30, col:darken(base, 10) },
      { x:-0.20, h:0.95, w:0.40, col:glow },
      { x: 0.15, h:0.80, w:0.36, col:lighten(glow, 20) },
      { x: 0.50, h:0.55, w:0.28, col:base }
    ];
    for(const f of flames){
      ctx.fillStyle = f.col;
      ctx.beginPath();
      ctx.moveTo(f.x - f.w, 0.55);
      ctx.quadraticCurveTo(f.x - f.w*0.6, 0.55 - f.h*0.6, f.x, 0.55 - f.h);
      ctx.quadraticCurveTo(f.x + f.w*0.6, 0.55 - f.h*0.6, f.x + f.w, 0.55);
      ctx.closePath();
      ctx.fill();
    }
    // внутреннее яркое ядро
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff3c0';
    ctx.beginPath();
    ctx.ellipse(-0.02, 0.25, 0.18, 0.28, 0, 0, Math.PI*2);
    ctx.fill();
  }

  // ===========================================================
  // УЗОР: снежинка (алмаз / лёд)
  // ===========================================================
  function drawSnowflake(ctx, c){
    const col = c.stripe || '#26c6da';
    const glow = c.glow || '#80ffff';
    ctx.translate(0,0);
    ctx.strokeStyle = glow;
    ctx.fillStyle = glow;
    ctx.lineWidth = 0.06;
    ctx.lineCap = 'round';

    // 6 лучей с маленькими веточками
    for(let i=0;i<6;i++){
      ctx.save();
      ctx.rotate(i * Math.PI/3);
      // главный луч
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(0,0); ctx.lineTo(0,-0.8);
      ctx.stroke();
      // боковые веточки
      for(const yy of [-0.35, -0.6]){
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo( 0.16, yy + 0.16);
        ctx.moveTo(0, yy);
        ctx.lineTo(-0.16, yy + 0.16);
        ctx.stroke();
      }
      // наконечник-ромб
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(0,-0.8);
      ctx.lineTo(0.08,-0.7);
      ctx.lineTo(0,-0.6);
      ctx.lineTo(-0.08,-0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // центральная шестигранная втулка
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = col;
    ctx.beginPath();
    for(let i=0;i<6;i++){
      const a = i*Math.PI/3;
      const px = Math.cos(a)*0.16, py = Math.sin(a)*0.16;
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath(); ctx.fill();
    // центральная точка
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0,0,0.06,0,Math.PI*2); ctx.fill();
  }

  // ===========================================================
  // УЗОР: галактика (космос)
  // ===========================================================
  function drawGalaxy(ctx, c){
    const base = c.base || '#9c27b0';
    const glow = c.glow || '#e040fb';
    // спиральные рукава
    ctx.save();
    ctx.rotate(-0.4);
    for(let arm=0; arm<2; arm++){
      ctx.save();
      ctx.rotate(arm * Math.PI);
      ctx.beginPath();
      let prev = null;
      for(let t=0; t<=4.2; t+=0.08){
        const rr = 0.12 + t*0.16;
        const px = Math.cos(t) * rr;
        const py = Math.sin(t) * rr;
        if(prev){
          ctx.strokeStyle = mix(base, glow, t/4.2);
          ctx.lineWidth = 0.16 - t*0.025;
          ctx.globalAlpha = 0.55 - t*0.07;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        prev = { x:px, y:py };
      }
      ctx.restore();
    }
    ctx.restore();

    // россыпь звёзд
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    const stars = [
      [-0.45,-0.3,0.04],[-0.5,0.15,0.03],[-0.2,-0.55,0.05],[0.3,-0.5,0.04],
      [0.55,-0.1,0.03],[0.4,0.35,0.04],[0.1,0.5,0.03],[-0.35,0.45,0.03],
      [-0.6,-0.05,0.025],[0.6,0.15,0.03],[0.05,-0.25,0.025],[-0.05,0.2,0.025]
    ];
    for(const [x,y,r] of stars){
      if(x*x + y*y > 0.8) continue;
      ctx.globalAlpha = 0.7 + 0.3*((x*3+y*7)%1+1)%1;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      // крестик-блик у крупных
      if(r > 0.035){
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x-r*2, y-0.012, r*4, 0.024);
        ctx.fillRect(x-0.012, y-r*2, 0.024, r*4);
      }
    }
    // яркое ядро галактики
    ctx.globalAlpha = 1;
    const core = ctx.createRadialGradient(0,0,0, 0,0, 0.35);
    core.addColorStop(0, '#fff');
    core.addColorStop(0.4, glow);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0,0,0.35,0,Math.PI*2); ctx.fill();
  }

  // ===========================================================
  // УЗОР: жидкий металл (ртуть) — зеркальные разводы
  // ===========================================================
  function drawMercury(ctx, c){
    const base = c.base || '#c0c0c0';
    // длинные «капли»-разводы, имитирующие перелив
    const streaks = [
      { x:-0.4, y:-0.1, w:0.12, h:0.9, rot: 0.5,  col:'rgba(255,255,255,0.55)' },
      { x: 0.1, y: 0.2, w:0.10, h:0.7, rot:-0.3,  col:'rgba(120,160,200,0.45)' },
      { x: 0.35,y:-0.25,w:0.08, h:0.6, rot: 0.9,  col:'rgba(255,255,255,0.4)'  },
      { x:-0.15,y: 0.35,w:0.14, h:0.5, rot:-0.7,  col:'rgba(80,110,150,0.5)'   },
      { x: 0.0, y:-0.45,w:0.07, h:0.45,rot: 0.15, col:'rgba(255,255,255,0.5)'  }
    ];
    for(const s of streaks){
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.col;
      ctx.beginPath();
      ctx.ellipse(0, 0, s.w, s.h, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    // горизонтальная «отражающая» полоса
    ctx.globalAlpha = 0.35;
    const g = ctx.createLinearGradient(0, -0.8, 0, 0.8);
    g.addColorStop(0, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.4, 'rgba(180,200,220,0.1)');
    g.addColorStop(0.6, 'rgba(40,60,90,0.4)');
    g.addColorStop(1, 'rgba(220,230,240,0.5)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0,0,1,0,Math.PI*2); ctx.fill();
    // резкий блик-полоса
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-0.1, -0.35, 0.35, 0.07, -0.3, 0, Math.PI*2);
    ctx.fill();
  }

  // ===========================================================
  // УЗОР: большая звезда (вспомогательный, не в магазине)
  // ===========================================================
  function drawStar(ctx, c){
    const col = c.glow || '#ffd24a';
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.9;
    const spikes = 5, outer = 0.55, inner = 0.24;
    ctx.beginPath();
    for(let i=0;i<spikes*2;i++){
      const r = (i%2===0)?outer:inner;
      const a = -Math.PI/2 + i*Math.PI/spikes;
      const x = Math.cos(a)*r, y = Math.sin(a)*r;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.fill();
  }

  // ===========================================================
  // УЗОР: сотовый паттерн (вспомогательный)
  // ===========================================================
  function drawHex(ctx, c){
    const col = c.stripe || '#26c6da';
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 0.04;
    ctx.globalAlpha = 0.6;
    const s = 0.26;
    function hex(cx, cy){
      ctx.beginPath();
      for(let i=0;i<6;i++){
        const a = i*Math.PI/3;
        const x = cx + Math.cos(a)*s, y = cy + Math.sin(a)*s;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath(); ctx.stroke();
    }
    hex(0,0);
    hex(-0.45,-0.26); hex(0.45,-0.26);
    hex(-0.45, 0.26); hex(0.45, 0.26);
    hex(0,-0.52); hex(0,0.52);
    // заливка центральной ячейки
    ctx.globalAlpha = 0.4;
    hex(0,0); ctx.fill();
  }

  // ===========================================================
  // УЗОР: микросхема (вспомогательный)
  // ===========================================================
  function drawCircuit(ctx, c){
    const col = c.glow || '#7be0ff';
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 0.035;
    ctx.globalAlpha = 0.8;
    // квадратные дорожки
    for(let k=0;k<3;k++){
      const s = 0.3 + k*0.22;
      ctx.beginPath();
      ctx.rect(-s,-s, s*2, s*2);
      ctx.stroke();
    }
    // контакты по углам центрального квадрата
    ctx.globalAlpha = 1;
    for(const [x,y] of [[-0.3,-0.3],[0.3,-0.3],[-0.3,0.3],[0.3,0.3]]){
      ctx.beginPath(); ctx.arc(x,y,0.05,0,Math.PI*2); ctx.fill();
    }
    // центральный чип
    ctx.fillStyle = mix(col, '#000', 0.4);
    ctx.fillRect(-0.12,-0.12,0.24,0.24);
    ctx.fillStyle = col;
    ctx.fillRect(-0.05,-0.05,0.1,0.1);
  }

  return { draw, has, PATTERNS };
})();
