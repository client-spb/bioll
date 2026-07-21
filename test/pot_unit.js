// Прямой unit-тест логики луз через Physics.step.
// Загружаем страницу (чтобы window.Physics был определён), затем в eval
// создаём синтетический стол/лузу/шар и прогоняем физику.
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8765/index.html';

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new','--disable-gpu','--no-sandbox',
    '--remote-debugging-port=9337','--window-size=420,840','--hide-scrollbars','about:blank'
  ], { stdio:['ignore','pipe','pipe'] });
  await new Promise(r => setTimeout(r, 2500));

  const tabs = await new Promise((resolve, reject) => {
    http.get('http://localhost:9337/json/list', res => {
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
  await wait(2000);

  // Сценарий: стол 200x400 в (0,0), радиус шара R=10, луза pr=19 в углу (0,0).
  // Шар стартует в (100,100) и летит по прямой к лузе со скоростью 4 px/кадр.
  // За N кадров должен попасть в зону лузы и сработать onPot.
  const testExpr = `
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
      // Шар летит из (100,100) прямо в угловую лузу (0,0).
      const ball = { x:100, y:100, vx:0, vy:0, r:R, active:true };
      const dirx = 0 - 100, diry = 0 - 100;
      const dlen = Math.hypot(dirx, diry);
      const speed = 4;
      ball.vx = dirx/dlen * speed;
      ball.vy = diry/dlen * speed;
      let frames = 0;
      for(let i=0;i<200;i++){
        frames++;
        window.Physics.step([ball], [], pockets, 1);
        if(!ball.active) break;
      }
      return JSON.stringify({
        potted: !!ball._potted,
        potCount: events.pot,
        frames,
        finalX: ball.x.toFixed(2),
        finalY: ball.y.toFixed(2),
        finalActive: ball.active
      });
    })()
  `;
  let res = await evalJS(testExpr);
  console.log('TEST1 (шар прямо в угловую лузу):', res.result.result.value);

  // Тест 2: шар летит мимо лузы (должен НЕ забиться) — контроль ложных срабатываний
  const test2Expr = `
    (function(){
      const R = 10;
      const table = { x:0, y:0, w:200, h:400, wall:14 };
      const pr = R * 1.9;
      const pockets = [ { x:0, y:0, r:pr } ]; // только одна луза в углу
      const events = { pot:0 };
      window.Physics.configure(table, R, {
        onPot:(b)=>{ events.pot++; b.active=false; b._potted=true; }
      });
      // Шар летит горизонтально вдоль y=50 (далеко от лузы в (0,0) — пройдёт мимо)
      const ball = { x:190, y:50, vx:-4, vy:0, r:R, active:true };
      //但他 отскочит от стенок; нам важно, что не должен попасть в лузу сразу
      let frames = 0;
      for(let i=0;i<50;i++){
        frames++;
        window.Physics.step([ball], [], pockets, 1);
        if(!ball.active) break;
      }
      return JSON.stringify({ potted: !!ball._potted, potCount: events.pot, frames, finalX: ball.x.toFixed(2), finalY: ball.y.toFixed(2) });
    })()
  `;
  let res2 = await evalJS(test2Expr);
  console.log('TEST2 (шар мимо лузы, контроль):', res2.result.result.value);

  console.log('=== ERRORS ('+errors.length+') ===');
  errors.slice(0,5).forEach(e => console.log(String(e).split('\n')[0]));
  chrome.kill();
  process.exit(0);
})();
