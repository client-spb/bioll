/* ============================================================
   PHYSICS.JS — физический движок бильярда
   - Стабильные столкновения шаров (с разделением перекрытия)
   - Отскок от бортов с потерей энергии
   - Круглые препятствия
   - Лузы
   ============================================================ */
window.Physics = (function(){

  const FRICTION = 0.988;
  const MINV = 0.05;
  const WALL_BOUNCE = 0.82;
  const OBSTACLE_BOUNCE = 0.88;

  let table = null, R = 12;
  let onWallHit = null, onBallHit = null, onPot = null;

  function configure(t, radius, callbacks={}){
    table = t; R = radius;
    onWallHit = callbacks.onWallHit || (()=>{});
    onBallHit = callbacks.onBallHit || (()=>{});
    onPot = callbacks.onPot || (()=>{});
  }

  function setR(r){ R = r; }

  function step(balls, obstacles, pockets, dt=1){
    let moving = false;

    // 1) Перемещение + трение + стены
    for(const b of balls){
      if(!b.active) continue;
      b.x += b.vx; b.y += b.vy;
      b.vx *= FRICTION; b.vy *= FRICTION;
      if(Math.abs(b.vx) < MINV) b.vx = 0;
      if(Math.abs(b.vy) < MINV) b.vy = 0;
      if(b.vx !== 0 || b.vy !== 0) moving = true;

      const left = table.x + b.r, right = table.x + table.w - b.r;
      const top = table.y + b.r, bot = table.y + table.h - b.r;
      if(b.x < left){ b.x = left; b.vx = Math.abs(b.vx)*WALL_BOUNCE; if(Math.abs(b.vx)>1.5) onWallHit(Math.abs(b.vx), b); }
      if(b.x > right){ b.x = right; b.vx = -Math.abs(b.vx)*WALL_BOUNCE; if(Math.abs(b.vx)>1.5) onWallHit(Math.abs(b.vx), b); }
      if(b.y < top){ b.y = top; b.vy = Math.abs(b.vy)*WALL_BOUNCE; if(Math.abs(b.vy)>1.5) onWallHit(Math.abs(b.vy), b); }
      if(b.y > bot){ b.y = bot; b.vy = -Math.abs(b.vy)*WALL_BOUNCE; if(Math.abs(b.vy)>1.5) onWallHit(Math.abs(b.vy), b); }
    }

    // 2) Препятствия (круглые)
    for(const b of balls){
      if(!b.active) continue;
      for(const o of obstacles){
        const dx = b.x - o.x, dy = b.y - o.y;
        const d = Math.hypot(dx, dy), min = o.r + b.r;
        if(d < min && d > 0.0001){
          const nx = dx/d, ny = dy/d;
          const overlap = min - d;
          b.x += nx * overlap; b.y += ny * overlap;
          const dot = b.vx*nx + b.vy*ny;
          if(dot < 0){
            b.vx -= 2*dot*nx; b.vy -= 2*dot*ny;
            b.vx *= OBSTACLE_BOUNCE; b.vy *= OBSTACLE_BOUNCE;
            onBallHit(Math.abs(dot), (b.x+o.x)/2, (b.y+o.y)/2, b.color);
          }
        }
      }
    }

    // 3) Столкновения шаров (несколько итераций для стабильности)
    for(let iter=0; iter<2; iter++){
      for(let i=0;i<balls.length;i++){
        for(let j=i+1;j<balls.length;j++){
          const a = balls[i], b = balls[j];
          if(!a.active || !b.active) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy), min = a.r + b.r;
          if(d < min && d > 0.0001){
            const nx = dx/d, ny = dy/d;
            const overlap = min - d;
            // Разделение
            a.x -= nx*overlap*0.5; a.y -= ny*overlap*0.5;
            b.x += nx*overlap*0.5; b.y += ny*overlap*0.5;
            // Импульс (упругое столкновение равных масс)
            const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
            const dot = dvx*nx + dvy*ny;
            if(dot < 0){
              const imp = dot;
              a.vx += imp*nx; a.vy += imp*ny;
              b.vx -= imp*nx; b.vy -= imp*ny;
              if(iter === 0 && Math.abs(imp) > 0.8){
                onBallHit(Math.abs(imp), (a.x+b.x)/2, (a.y+b.y)/2, '#fff');
              }
            }
          }
        }
      }
    }

    // 4) Лузы
    // Логика:
    //  - если центр шара достаточно глубоко внутри лузы (dist < potR) — шар забит;
    //  - иначе, если шар в зоне «горлышка» лузы (potR <= dist < catchR),
    //    отключаем отскок от борта в районе этой лузы и заметно подтягиваем
    //    шар к центру, чтобы он реально «провалился», а не пролетел мимо.
    for(const b of balls){
      if(!b.active) continue;
      for(const p of pockets){
        const dist = Math.hypot(b.x - p.x, b.y - p.y);
        const potR = p.r * 0.7;    // радиус «забития»: центр шара внутри → pot
        const catchR = p.r * 1.05; // радиус «горлышка»: зона притяжения
        if(dist < catchR){
          if(dist < potR){ onPot(b); break; }
          // Заметное затягивание к центру лузы.
          // Чем ближе к центру — тем сильнее, чтобы шар не выскочил обратно.
          const t = 1 - dist / catchR;          // 0 .. 1
          const pull = 0.35 + 0.9 * t;          // 0.35 .. 1.25
          b.vx += (p.x - b.x) * pull * 0.02;
          b.vy += (p.y - b.y) * pull * 0.02;
          // Гасим боковую (касательную) составляющую, чтобы шар
          // входил в лузу, а не проезжал мимо неё.
          if(dist > 0.001){
            const nx = (p.x - b.x) / dist, ny = (p.y - b.y) / dist;
            const tx = -ny, ty = nx;
            const tan = b.vx * tx + b.vy * ty;
            b.vx -= tx * tan * 0.6;
            b.vy -= ty * tan * 0.6;
          }
        }
      }
    }

    return moving;
  }

  function isMoving(balls){
    return balls.some(b => b.active && (b.vx !== 0 || b.vy !== 0));
  }

  // Предсказание траектории для прицела
  function predictHit(balls, sx, sy, ang, cueR){
    const dirx = Math.cos(ang), diry = Math.sin(ang);
    let best = null, bestD = Infinity;
    for(const b of balls){
      if(!b.active || b.cue) continue;
      const ex = b.x - sx, ey = b.y - sy;
      const proj = ex*dirx + ey*diry;
      if(proj < 0) continue;
      const perp = Math.abs(ex*diry - ey*dirx);
      const sumR = cueR + b.r;
      if(perp < sumR){
        const back = Math.sqrt(Math.max(0, sumR*sumR - perp*perp));
        const dist = proj - back;
        if(dist < bestD && dist > 0){
          bestD = dist;
          // Точка, где центр битка коснётся цели:
          // b - cue_position_at_contact*dir = dir*sumR
          // => центр битка в момент касания = (b.x - nx*sumR, b.y - ny*sumR), где (nx,ny) нормаль от цели к битку
          const contactX = sx + dirx*dist, contactY = sy + diry*dist;
          const nx = (b.x - contactX), ny = (b.y - contactY);
          const nl = Math.hypot(nx, ny) || 1;
          best = {
            dist,
            tx: b.x, ty: b.y,            // центр цели
            contactX, contactY,          // центр битка в момент удара
            nx: nx/nl, ny: ny/nl         // нормаль от битка к цели
          };
        }
      }
    }
    // Учитываем стену: находим, где луч упирается в борт (без шара на пути)
    let wallDist = Infinity, wallPoint = null;
    checkWall(sx, sy, dirx, diry, cueR, (d, px, py) => {
      if(d < wallDist && d < bestD){ wallDist = d; wallPoint = { x:px, y:py }; }
    });
    if(best) return best;
    return null;
  }

  function checkWall(sx, sy, dx, dy, r, cb){
    const left = table.x + r, right = table.x + table.w - r;
    const top = table.y + r, bot = table.y + table.h - r;
    if(dx > 0){ const d = (right - sx)/dx; if(d > 0) cb(d, right, sy + dy*d); }
    if(dx < 0){ const d = (left - sx)/dx; if(d > 0) cb(d, left, sy + dy*d); }
    if(dy > 0){ const d = (bot - sy)/dy; if(d > 0) cb(d, sx + dx*d, bot); }
    if(dy < 0){ const d = (top - sy)/dy; if(d > 0) cb(d, sx + dx*d, top); }
  }

  return { configure, setR, step, isMoving, predictHit, FRICTION };
})();
