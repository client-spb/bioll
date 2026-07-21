// Тест забивания в лузу: получаем координаты через Game._debug(),
// вычисляем траекторию, прицельно бьём так, чтобы цель пошла в ближайшую лузу.
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8765/index.html';
const OUT = path.join(__dirname, 'screens');
if(!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive:true });

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new','--disable-gpu','--no-sandbox',
    '--remote-debugging-port=9336','--window-size=420,840','--hide-scrollbars','about:blank'
  ], { stdio:['ignore','pipe','pipe'] });
  await new Promise(r => setTimeout(r, 2500));

  const tabs = await new Promise((resolve, reject) => {
    http.get('http://localhost:9336/json/list', res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error', reject);
  });
  const target = tabs.find(t => t.type==='page') || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1; const pending = new Map(); const errors = [];
  ws.on('message', msg => {
    const data = JSON.parse(msg);
    if(data.id && pending.has(data.id)){ pending.get(data.id)(data); pending.delete(data.id); }
    if(data.method === 'Runtime.exceptionThrown'){
      const d = data.params.exceptionDetails;
      errors.push(`${d.exception?.description || d.text}`);
    }
  });
  function send(method, params={}){ return new Promise(resolve => { const id=msgId++; pending.set(id,resolve); ws.send(JSON.stringify({id,method,params})); }); }
  function wait(ms){ return new Promise(r => setTimeout(r, ms)); }
  function evalJS(expr){ return send('Runtime.evaluate', { expression:expr, returnByValue:true, awaitPromise:true }); }

  await new Promise(r => ws.once('open', r));
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url:URL });
  await wait(3000);
  await wait(2500);

  // Пропускаем сплэш и меню, стартуем уровень
  await evalJS(`document.getElementById('playBtn').click()`);
  await wait(400);
  await evalJS(`document.getElementById('startBtn').click()`);
  await wait(800);

  let dbg = await evalJS(`JSON.stringify(window.Game._debug())`);
  let d = JSON.parse(dbg.result.result.value);
  console.log('INITIAL balls:', d.balls.length, 'targets left:', d.targetsLeft);
  console.log('table:', JSON.stringify(d.table), 'R:', d.R);

  const cue = d.balls.find(b => b.cue);

  // Восстанавливаем координаты луз (логика из main.js)
  const R = d.R, T = d.table, pr = R*1.9;
  const pockets = [
    { x:T.x,            y:T.y,          r:pr, name:'TL' },
    { x:T.x+T.w,        y:T.y,          r:pr, name:'TR' },
    { x:T.x-pr*0.15,    y:T.y+T.h/2,    r:pr*0.92, name:'ML' },
    { x:T.x+T.w+pr*0.15,y:T.y+T.h/2,    r:pr*0.92, name:'MR' },
    { x:T.x,            y:T.y+T.h,      r:pr, name:'BL' },
    { x:T.x+T.w,        y:T.y+T.h,      r:pr, name:'BR' },
  ];

  // Для каждого целевого шара найдём ближайшую лузу и направление удара
  // (удар должен пройти через цель в сторону лузы — «direct-in»).
  const targets = d.balls.filter(b => !b.cue && b.active);

  function pickShot(){
    for(const t of targets){
      // ищем лузу, к которой путь «цель → луза» свободен (по возможности)
      let bestPocket = null, bestScore = Infinity;
      for(const p of pockets){
        const dx = p.x - t.x, dy = p.y - t.y;
        const distPL = Math.hypot(dx, dy);
        if(distPL < 1) continue;
        // Точка контакта битка: цель минус сумма радиусов вдоль нормали от цели к лузе
        const nx = dx/distPL, ny = dy/distPL;
        const contactX = t.x - nx * 2 * R; // биток должен коснуться цели со стороны, противоположной лузе
        const contactY = t.y - ny * 2 * R;
        // Нужно, чтобы биток был способен дойти до contactX,contactY по прямой.
        const cueDx = contactX - cue.x, cueDy = contactY - cue.y;
        const cueDist = Math.hypot(cueDx, cueDy);
        if(cueDist < 1) continue;
        // угол cue→contact должен совпадать с углом cue→target (иначе будет «касса»)
        const angCue = Math.atan2(cueDy, cueDx);
        const angTarget = Math.atan2(t.y - cue.y, t.x - cue.x);
        let dAng = Math.abs(angCue - angTarget);
        while(dAng > Math.PI) dAng = Math.abs(dAng - 2*Math.PI);
        // preferring shots where cue, target, pocket are roughly aligned
        const score = dAng + distPL * 0.001;
        if(score < bestScore){ bestScore = score; bestPocket = { p, t, contactX, contactY, angCue, distPL }; }
      }
      if(bestPocket && bestScore < 0.35) return bestPocket; // достаточно «прямой» удар
    }
    // если прямого нет — берём первый таргет и ближайшую лузу
    const t = targets[0];
    let best = null, bd = Infinity;
    for(const p of pockets){
      const dd = Math.hypot(p.x - t.x, p.y - t.y);
      if(dd < bd){ bd = dd; best = { p, t, contactX:t.x, contactY:t.y, angCue:Math.atan2(t.y-cue.y,t.x-cue.x), distPL:dd }; }
    }
    return best;
  }

  const shot = pickShot();
  console.log('SHOT target at', shot.t.x.toFixed(0), shot.t.y.toFixed(0),
              '-> pocket', shot.p.name, '(', shot.p.x.toFixed(0), shot.p.y.toFixed(0), ')',
              'ang', shot.angCue.toFixed(3));

  // Тянем кий в направлении, противоположном удару: hit direction = angCue, pull direction = angCue + PI
  const pullDist = T.h * 0.4; // макс сила
  const pullX = cue.x - Math.cos(shot.angCue) * pullDist;
  const pullY = cue.y - Math.sin(shot.angCue) * pullDist;

  console.log('cue at', cue.x.toFixed(0), cue.y.toFixed(0), 'pull to', pullX.toFixed(0), pullY.toFixed(0));

  await send('Input.dispatchMouseEvent', { type:'mousePressed', x:cue.x, y:cue.y, button:'left', clickCount:1 });
  await wait(120);
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:pullX, y:pullY, button:'left' });
  await wait(180);
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:pullX, y:pullY, button:'left', clickCount:1 });
  await wait(3500);

  let dbg2 = await evalJS(`JSON.stringify(window.Game._debug())`);
  let d2 = JSON.parse(dbg2.result.result.value);
  const activeTargetsAfter = d2.balls.filter(b => !b.cue && b.active).length;
  console.log('AFTER: targetsLeft=', d2.targetsLeft, 'activeTargetBalls=', activeTargetsAfter);

  let res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'pot_test_after.png'), Buffer.from(res.result.data, 'base64'));

  const potted = d.targetsLeft - d2.targetsLeft;
  console.log(`RESULT: potted ${potted} target ball(s).`);
  console.log(potted > 0 ? 'PASS — шар забился в лузу' : 'FAIL — шар НЕ забился');

  console.log('=== ERRORS ('+errors.length+') ===');
  errors.slice(0,5).forEach(e => console.log(e.split('\n')[0]));
  chrome.kill();
  process.exit(potted > 0 ? 0 : 1);
})();
