// Простой probe-скрипт для headless Chrome через CDP
// Используем Chrome DevTools Protocol напрямую (без puppeteer)
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require(wsPath());

function wsPath(){
  try { return require.resolve('ws'); } catch(e){ return null; }
}

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8765/index.html';
const OUT = path.join(__dirname, 'screens');

if(!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive:true });

(async () => {
  if(!wsPath()){ console.log('NO_WS_MODULE'); process.exit(2); }
  const WebSocket = require('ws');

  // Запускаем Chrome с remote debugging
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=9333',
    '--window-size=420,840',
    '--hide-scrollbars',
    'about:blank'
  ], { stdio:['ignore','pipe','pipe'] });

  let chromeStderr = '';
  chrome.stderr.on('data', d => { chromeStderr += d.toString(); });

  // Ждём запуск DevTools
  await new Promise(r => setTimeout(r, 2500));

  // Получаем ws url
  const tabs = await new Promise((resolve, reject) => {
    http.get('http://localhost:9333/json/list', res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error', reject);
  }).catch(()=>null);

  if(!tabs || !tabs.length){
    console.log('NO_TABS', chromeStderr.slice(0,500));
    chrome.kill();
    process.exit(1);
  }

  const target = tabs.find(t => t.type==='page') || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  const logs = [];
  const errors = [];

  ws.on('message', msg => {
    const data = JSON.parse(msg);
    if(data.id && pending.has(data.id)){
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
    if(data.method === 'Runtime.consoleAPICalled'){
      const text = data.params.args.map(a => a.value || a.description || '').join(' ');
      logs.push(`[${data.params.type}] ${text}`);
    }
    if(data.method === 'Runtime.exceptionThrown'){
      const d = data.params.exceptionDetails;
      errors.push(`${d.exception?.description || d.text} @ ${d.url}:${d.lineNumber}`);
    }
    if(data.method === 'Log.entryAdded'){
      errors.push(`[LOG] ${JSON.stringify(data.params.entry)}`);
    }
  });

  function send(method, params={}){
    return new Promise(resolve => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise(r => ws.once('open', r));

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: URL });

  // Ждём загрузки и сплэш
  await wait(3000);

  // Скриншот сплэша
  let res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'01_splash.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: splash');

  // Ждём завершения сплэша (mainMenu)
  await wait(2500);
  res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'02_menu.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: menu');

  // Открываем магазин
  await send('Runtime.evaluate', { expression:`document.getElementById('shopBtn').click()` });
  await wait(800);
  res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'03_shop_cue.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: shop_cue');

  // Таб полотен
  await send('Runtime.evaluate', { expression:`document.querySelector('.tab[data-tab="cloth"]').click()` });
  await wait(500);
  res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'04_shop_cloth.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: shop_cloth');

  // Таб шаров
  await send('Runtime.evaluate', { expression:`document.querySelector('.tab[data-tab="ball"]').click()` });
  await wait(500);
  res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'05_shop_ball.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: shop_ball');

  // Назад, играть
  await send('Runtime.evaluate', { expression:`document.getElementById('shopBack').click()` });
  await wait(400);
  await send('Runtime.evaluate', { expression:`document.getElementById('playBtn').click()` });
  await wait(600);
  res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'06_level_start.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: level_start');

  // Начать уровень
  await send('Runtime.evaluate', { expression:`document.getElementById('startBtn').click()` });
  await wait(1000);
  res = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync(path.join(OUT,'07_game.png'), Buffer.from(res.result.data, 'base64'));
  console.log('SCREENSHOT: game');

  // Проверяем состояние игры
  res = await send('Runtime.evaluate', { expression:`JSON.stringify({state: window.Game ? 'has_Game' : 'no_Game', balls: (typeof balls!=='undefined'?balls.length:'na')})`, returnByValue:true });
  console.log('STATE:', res.result && res.result.result && res.result.result.value);

  console.log('=== CONSOLE LOGS ===');
  logs.slice(-30).forEach(l => console.log(l));
  console.log('=== ERRORS ===');
  errors.forEach(e => console.log(e));
  console.log('=== END (errors:'+errors.length+') ===');

  chrome.kill();
  process.exit(0);

  function wait(ms){ return new Promise(r => setTimeout(r, ms)); }
})();
