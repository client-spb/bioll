const http=require('http');const {spawn}=require('child_process');const WebSocket=require('ws');
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-sandbox','--remote-debugging-port=9336','--window-size=420,840','about:blank'],{stdio:['ignore','pipe','pipe']});
setTimeout(async()=>{
  try{
    const tabs=await new Promise((res,rej)=>{http.get('http://localhost:9336/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});
    const ws=new WebSocket(tabs[0].webSocketDebuggerUrl);let id=1;const p=new Map();
    ws.on('message',m=>{const d=JSON.parse(m);if(d.id&&p.has(d.id)){p.get(d.id)(d);p.delete(d.id);}});
    const send=(m,a={})=>new Promise(r=>{const i=id++;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:a}));});
    await new Promise(r=>ws.once('open',r));
    await send('Runtime.enable');await send('Page.enable');
    await send('Page.navigate',{url:'http://localhost:8765/index.html'});
    await new Promise(r=>setTimeout(r,5000));
    const res=await send('Runtime.evaluate',{expression:`JSON.stringify({innerW:window.innerWidth,innerH:window.innerHeight,dpr:window.devicePixelRatio,cvAttrW:document.getElementById('cv').width,cvAttrH:document.getElementById('cv').height,cvCssW:document.getElementById('cv').clientWidth,cvCssH:document.getElementById('cv').clientHeight})`,returnByValue:true});
    console.log('GEOM:', res.result.result.value);
  }catch(e){ console.error('ERR',e.message); }
  chrome.kill();process.exit(0);
},2500);
