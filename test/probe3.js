// Целевой тест забивания: получаем координаты через Game._debug() и бьём точно в цель.
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
    '--remote-debugging-port=9335','--window-size=420,840','--hide-scrollbars','about:blank'
  ], { stdio:['ignore','pipe','pipe'] });
  await new Promise(r => setTimeout(r, 2500));

  const tabs = await new Promise((resolve, reject) => {
    http.get('http://localhost:9335/json/list', res => {
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

  await evalJS(`document.getElementById('playBtn').click()`);
  await wait(500);
  await evalJS(`document.getElementById('startBtn').click()`);
  await wait(1000);

  // Получаем координаты битка и цели
  let dbg = await evalJS(`JSON.stringify(window.Game._debug())`);
  let d = JSON.parse(dbg.result.result.value);
  console.log('INITIAL balls:', d.balls.length, 'targets left:', d.targetsLeft);
  console.log('table:', JSON.stringify(d.table));

  const cue = d.balls.find(b => b.cue);
  const target_ball = d.balls.find(b => !b.cue && b.active);
  console.log('cue at:', cue.x, cue.y, '| target at:', target_ball.x, target_ball.y);

  // Бьём прямо вверх с максимальной силой. Биток в (249, 528), цель в (249, 220).
  // Прямой удар по оси Y отправит цель вверх к верхней грани, отскочит. Но проверим физику.
  // Для забивания в верхнюю-среднюю лузу (250, 86) — нужно бить чуть влево, чтобы цель
  // после удара пошла к лузе. Но для теста достаточно убедиться, что шары сталкиваются.
  // Бьём максимально сильно прямо вверх: mousedown на битке, mousemove далеко вниз.
  const pullDist = d.table.h * 0.4; // макс сила
  // Прямо вверх: тянем вниз от битка
  const pullX = cue.x;
  const pullY = cue.y + pullDist;

  console.log('pull to:', pullX, pullY);

  await send('Input.dispatchMouseEvent', { type:'mousePressed', x:cue.x, y:cue.y, button:'left', clickCount:1 });
  await wait(100);
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:pullX, y:pullY, button:'left' });
  await wait(150);
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:pullX, y:pullY, button:'left', clickCount:1 });
  await wait(3000);

  let st = await evalJS(`JSON.stringify({coins:document.getElementById('coins').textContent, ballCount:document.getElementById('ballCount').textContent, le: !document.getElementById('levelEnd').classList.contains('hidden')})`);
  console.log('AFTER_SHOT', st.result.result.value);

  let dbg2 = await evalJS(`JSON.stringify(window.Game._debug())`);
  let d2 = JSON.parse(dbg2.result.result.value);
  console.log('targets left now:', d2.targetsLeft, 'active balls:', d2.balls.filter(b=>b.active).length);

  let res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'10_targeted.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: targeted');

  console.log('=== ERRORS ('+errors.length+') ===');
  errors.forEach(e => console.log(e));
  chrome.kill();
  process.exit(0);
})();
