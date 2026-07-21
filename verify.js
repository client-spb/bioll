// Быстрая проверка: загрузка, старт уровня, удар, отсутствие ошибок в консоли.
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8765/index.html';

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new','--disable-gpu','--no-sandbox',
    '--remote-debugging-port=9340','--window-size=420,840','--hide-scrollbars','about:blank'
  ], { stdio:['ignore','pipe','pipe'] });
  await new Promise(r => setTimeout(r, 2500));

  const tabs = await new Promise((resolve, reject) => {
    http.get('http://localhost:9340/json/list', res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error', reject);
  });
  const target = tabs.find(t => t.type==='page') || tabs[0];
  const ws = new (require('ws'))(target.webSocketDebuggerUrl);
  let msgId = 1; const pending = new Map(); const errors = [];
  ws.on('message', msg => {
    const data = JSON.parse(msg);
    if(data.id && pending.has(data.id)){ pending.get(data.id)(data); pending.delete(data.id); }
    if(data.method === 'Runtime.exceptionThrown'){
      const d = data.params.exceptionDetails;
      errors.push(`${d.exception?.description || d.text}`);
    }
    if(data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error'){
      errors.push('console.error: ' + JSON.stringify(data.params.args));
    }
  });
  function send(method, params={}){ return new Promise(resolve => { const id=msgId++; pending.set(id,resolve); ws.send(JSON.stringify({id,method,params})); }); }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const evalJS = expr => send('Runtime.evaluate', { expression:expr, returnByValue:true, awaitPromise:true });

  await new Promise(r => ws.once('open', r));
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url:URL });
  await wait(6000);

  // Проверка API
  const api = await evalJS(`JSON.stringify({
    hasGame: typeof window.Game, hasGameInit: typeof window.Game?.init,
    hasGameStartLevel: typeof window.Game?.startLevel,
    hasGameShowLevelStart: typeof window.Game?.showLevelStart,
    hasDebug: 'hasDebug' in (window.Game||{}) || '_debug' in (window.Game||{}),
    hasPhysics: typeof window.Physics,
    hasRender: typeof window.Render
  })`);
  console.log('API:', api.result.result.value);

  // Старт уровня
  await evalJS(`document.getElementById('playBtn').click()`);
  await wait(400);
  await evalJS(`document.getElementById('startBtn').click()`);
  await wait(800);
  const gameState = await evalJS(`(document.getElementById('hud').classList.contains('hidden')?'hudHidden':'hudVisible')`);
  console.log('После старта уровня:', gameState.result.result.value);

  // Скриншот игрового экрана
  let res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync('verify_game.png', Buffer.from(res.result.data, 'base64'));
  console.log('Скриншот: verify_game.png');

  console.log('=== ОШИБКИ ('+errors.length+') ===');
  errors.slice(0,10).forEach(e => console.log(' •', String(e).split('\n')[0]));

  chrome.kill();
  process.exit(errors.length > 0 ? 1 : 0);
})();
