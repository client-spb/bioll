// Расширенный probe: тестируем реальный геймплей — удар и забивание.
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
    '--remote-debugging-port=9334','--window-size=420,840','--hide-scrollbars','about:blank'
  ], { stdio:['ignore','pipe','pipe'] });

  await new Promise(r => setTimeout(r, 2500));

  const tabs = await new Promise((resolve, reject) => {
    http.get('http://localhost:9334/json/list', res => {
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
      errors.push(`${d.exception?.description || d.text} @ ${d.url}:${d.lineNumber}`);
    }
  });
  function send(method, params={}){ return new Promise(resolve => { const id=msgId++; pending.set(id,resolve); ws.send(JSON.stringify({id,method,params})); }); }
  function wait(ms){ return new Promise(r => setTimeout(r, ms)); }
  function evalJS(expr){ return send('Runtime.evaluate', { expression:expr, returnByValue:true, awaitPromise:true }); }

  await new Promise(r => ws.once('open', r));
  await send('Runtime.enable'); await send('Page.enable'); await send('Input.dispatchKey');
  await send('Page.navigate', { url:URL });
  await wait(3000);

  // Доходим до игры
  await evalJS(`document.getElementById('shopBtn') ? 'skip_splash_ok' : 'wait'`);
  await wait(2500); // сплэш
  await evalJS(`document.getElementById('playBtn').click()`);
  await wait(500);
  await evalJS(`document.getElementById('startBtn').click()`);
  await wait(1000);

  // Получаем позицию битка и размеры стола
  let info = await evalJS(`(function(){
    // Game закрыт, но canvas есть. Получим биток через DOM-канвас нельзя.
    // Вместо этого симулируем удар мышью от центра-низа к центру-верху.
    var cv = document.getElementById('cv');
    var W = cv.width, H = cv.height;
    // Биток примерно внизу по центру. Цели — вверху.
    return JSON.stringify({W:W,H:H, cx:W/2, cy:H*0.7, tx:W/2, ty:H*0.3});
  })()`);
  const g = JSON.parse(info.result.result.value);
  console.log('GAME_GEOM', JSON.stringify(g));

  // Делаем удар: mouse down у битка, move вверх (натягиваем), up
  await send('Input.dispatchMouseEvent', { type:'mousePressed', x:g.cx, y:g.cy, button:'left', clickCount:1 });
  await wait(60);
  // тянем вниз-в сторону, чтобы придать импульс вверх
  await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:g.cx-40, y:g.cy+120, button:'left' });
  await wait(80);
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:g.cx-40, y:g.cy+120, button:'left', clickCount:1 });
  await wait(2500);

  // Скриншот после удара
  let res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'08_after_shot.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: after_shot');

  // Проверка состояния игры
  let st = await evalJS(`(function(){
    var hud = document.getElementById('coins').textContent;
    var bc = document.getElementById('ballCount').textContent;
    return JSON.stringify({coins:hud, ballCount:bc, gameState: (typeof gameState!=='undefined'?gameState:'na')});
  })()`);
  console.log('AFTER_SHOT_STATE', st.result.result.value);

  // Несколько ударов для теста комбо/забивания
  for(let i=0;i<5;i++){
    await send('Input.dispatchMouseEvent', { type:'mousePressed', x:g.cx, y:g.cy, button:'left', clickCount:1 });
    await wait(50);
    await send('Input.dispatchMouseEvent', { type:'mouseMoved', x:g.cx+(i%2?40:-40), y:g.cy+130, button:'left' });
    await wait(70);
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:g.cx+(i%2?40:-40), y:g.cy+130, button:'left', clickCount:1 });
    await wait(2000);
  }
  res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'09_after_shots.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: after_shots');

  st = await evalJS(`document.getElementById('coins').textContent`);
  console.log('COINS_FINAL', st.result.result.value);

  console.log('=== ERRORS ===');
  errors.forEach(e => console.log(e));
  console.log('=== END errors:'+errors.length+' ===');
  chrome.kill();
  process.exit(0);
})();
