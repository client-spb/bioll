/* ============================================================
   AUDIO.JS — синтезированный звук на WebAudio
   Никаких внешних файлов — всё генерируется на лету.
   ============================================================ */
window.Audio2 = (function(){
  let ctx = null, master = null, enabled = true;

  function init(){
    if(ctx) { resume(); return; }
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
    }catch(e){ ctx = null; }
  }
  function resume(){ if(ctx && ctx.state === 'suspended') ctx.resume(); }
  function setEnabled(v){ enabled = v; if(master) master.gain.value = v ? 0.6 : 0; }

  // Базовый тон с огибающей
  function tone(freq, dur, type='sine', vol=.3, slideTo=null, delay=0){
    if(!ctx || !enabled) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // Шум (для стенки/трения)
  function noise(dur, vol=.15, filterFreq=800, delay=0){
    if(!ctx || !enabled) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i] = (Math.random()*2-1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=filterFreq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  // === Игровые звуки ===
  // power 0..1 — сила удара
  function hit(power=0.5){
    const p = Math.max(0, Math.min(1, power));
    tone(160 + p*140, .1, 'triangle', .4 - p*.1);
    tone(80, .14, 'sine', .25);
    noise(.04, .12 + p*.1, 1200);
  }
  // столкновение шаров (мягкое)
  function clack(intensity=1){
    tone(620 + Math.random()*60, .04, 'square', .12*intensity, 880);
    noise(.02, .08*intensity, 2000);
  }
  // удар о борт
  function wall(intensity=1){
    tone(130, .08, 'sine', .18*intensity);
    noise(.05, .12*intensity, 500);
  }
  // шар в лузе
  function pot(){
    tone(380, .09, 'sine', .3, 620);
    tone(660, .12, 'sine', .28, 980, .05);
  }
  function win(){
    [523, 659, 784, 1047, 1319].forEach((f,i)=>tone(f, .14, 'triangle', .28, null, i*.09));
  }
  function fail(){
    tone(320, .35, 'sawtooth', .28, 70);
    tone(160, .4, 'sine', .2, 50, .05);
  }
  function coin(){
    tone(880, .06, 'square', .22);
    tone(1320, .1, 'square', .22, null, .05);
  }
  function buy(){
    [660, 880, 1100, 1320].forEach((f,i)=>tone(f, .1, 'triangle', .24, null, i*.06));
  }
  function combo(level){
    // растёт по высоте с уровнем комбо
    const base = 600 + level*80;
    tone(base, .1, 'triangle', .26);
    tone(base*1.5, .12, 'sine', .22, null, .06);
  }
  function ui(){
    tone(500, .04, 'sine', .15);
  }

  return { init, resume, setEnabled, hit, clack, wall, pot, win, fail, coin, buy, combo, ui };
})();
