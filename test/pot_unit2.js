// Дополнительные краевые тесты логики луз.
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8765/index.html';

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new','--disable-gpu','--no-sandbox',
    '--remote-debugging-port=9338','--window-size=420,840','--hide-scrollbars','about:blank'
  ], { stdio:['ignore','pipe','pipe'] });
  await new Promise(r => setTimeout(r, 2500));

  const tabs = await new Promise((resolve, reject) => {
    http.get('http://localhost:9338/json/list', res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error', reject);
  });
  const target = tabs.find(t => t.type==='page') || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1; const pending = new Map();
  ws.on('message', msg => {
    const data = JSON.parse(msg);
    if(data.id && pending.has(data.id)){ pending.get(data.id)(data); pending.delete(data.id); }
  });
  function send(method, params={}){ return new Promise(resolve => { const id=msgId++; pending.set(id,resolve); ws.send(JSON.stringify({id,method,params})); }); }
  function wait(ms){ return new Promise(r => setTimeout(r, ms)); }
  function evalJS(expr){ return send('Runtime.evaluate', { expression:expr, returnByValue:true, awaitPromise:true }); }

  await new Promise(r => ws.once('open', r));
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url:URL });
  await wait(5000);

  function setupExpr(bodyExpr){
    return `
      (function(){
        const R = 10;
        const table = { x:0, y:0, w:200, h:400, wall:14 };
        const pr = R * 1.9;
        const pockets = [
          { x:0,   y:0,   r:pr },
          { x:200, y:0,   r:pr },
          { x:0,   y:200, r:pr*0.92 },
          { x:200, y:200, r:pr*0.92 },
          { x:0,   y:400, r:pr },
          { x:200, y:400, r:pr },
        ];
        const events = { pot:0 };
        window.Physics.configure(table, R, {
          onWallHit:()=>{}, onBallHit:()=>{},
          onPot:(b)=>{ events.pot++; b.active=false; b._potted=true; }
        });
        ${bodyExpr}
      })()
    `;
  }

  function runShot(sx, sy, vx, vy, label){
    return setupExpr(`
      const ball = { x:${sx}, y:${sy}, vx:${vx}, vy:${vy}, r:R, active:true };
      let frames = 0;
      for(let i=0;i<200;i++){
        frames++;
        window.Physics.step([ball], [], pockets, 1);
        if(!ball.active) break;
      }
      return JSON.stringify({ label:${JSON.stringify(label)}, potted:!!ball._potted, potCount:events.pot, frames, fx:ball.x.toFixed(1), fy:ball.y.toFixed(1) });
    `);
  }

  // 1. Высокая скорость прямо в лузу (раньше пролетал насквозь)
  let r1 = await evalJS(runShot(100, 100, -3.5, -3.5, 'быстрый в угловую'));
  console.log('T1', r1.result.result.value);

  // 2. Очень высокая скорость прямо в лузу
  let r2 = await evalJS(runShot(100, 100, -6, -6, 'очень быстрый в угловую'));
  console.log('T2', r2.result.result.value);

  // 3. В боковую лузу слева (0,200) — меньший радиус
  let r3 = await evalJS(runShot(100, 100, -4, 4, 'в боковую левую'));
  console.log('T3', r3.result.result.value);

  // 4. Касательный проход мимо лузы (y=25, луза в 0,0) — НЕ должен забиться
  let r4 = await evalJS(runShot(190, 25, -5, 0, 'касательно мимо'));
  console.log('T4', r4.result.result.value);

  // 5. Борт между лузами (y=100, x движется) — должен отскакивать, не падать
  let r5 = await evalJS(runShot(100, 100, 0, -3, 'в борт между лузами сверху'));
  console.log('T5', r5.result.result.value);

  // 6. Шар прямо в нижнюю угловую (0,400) из (100,300)
  let r6 = await evalJS(runShot(100, 300, -4, 5.6, 'в нижнюю левую угловую'));
  console.log('T6', r6.result.result.value);

  chrome.kill();
  process.exit(0);
})();
