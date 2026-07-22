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
  // Единый тумблер: включает/выключает ВСЕ звуки и фоновую музыку вместе.
  function setEnabled(v){
    enabled = v;
    if(master) master.gain.value = v ? 0.6 : 0;
    if(!v) stopMusic();          // выключаем — гасим музыку сразу
  }

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
    // Восходящее арпеджио C-мажор (две октавы) — «взлёт».
    const arp = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0, 2093.0];
    arp.forEach((f,i)=>tone(f, .12, 'triangle', .26, null, i*.07));
    // Полнозвучный мажорный аккорд-фанфара (тоника-терция-квинта-октава).
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach(f=>{
      tone(f, .9, 'triangle', .2, null, .55);
      // Добавляем сверкающий гармонический слой октавой выше.
      tone(f*2, .9, 'sine', .08, null, .55);
    });
    // Финальный звонкий акцент (высокая тоника) с медленным затуханием.
    tone(2637.0, .6, 'sine', .14, null, .6);
    // Короткий «блеск»-перезвон сверху для праздничного послевкусия.
    [2637, 3136, 2637, 3520].forEach((f,i)=>tone(f, .12, 'sine', .1, null, 1.15 + i*.1));
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

  // ============================================================
  // ФОНОВАЯ МУЗЫКА — лёгкая процедурная мелодия (WebAudio, без файлов)
  // Цикл: мягкий пэд + арпеджио + бас. Тихая, ненавязчивая.
  // ============================================================
  let music = null; // { gain, stop(), scheduleTimer }

  function startMusic(){
    if(!ctx) return;
    if(music){ music.gain.gain.value = 0; } // дальше поднимем через fade
    // Создаём отдельный gain для музыки, не зависящий от мастер-громкости эффектов.
    const mgain = ctx.createGain();
    mgain.gain.value = 0;
    mgain.connect(ctx.destination);
    // Плавный fade-in.
    mgain.gain.setValueAtTime(0, ctx.currentTime);
    mgain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1.5);

    // Лёгкая мелодия в A-минорном пентатонике (A C D E G) — звучит спокойно и не напряжённо.
    // Шаги в полутоновых смещениях от A3 (220 Гц).
    const A = 220;
    function semi(o, n){ return A * Math.pow(2, n/12); }
    // Гармонический каркас: аккорды на 4 такта (Am — F — C — G), по 2 секунды.
    const chords = [
      [0, 3, 7, 10],   // Am7
      [-4, 0, 5, 9],   // Fmaj
      [3, 7, 10, 12],  // C
      [7, 10, 14, 17], // G
    ];
    // Арпеджио: поднимающиеся ноты в пределах каждого аккорда.
    const arpPat = [0, 1, 2, 3, 2, 1];
    const beat = 0.5; // полсекунды на ноту арпеджио
    let bar = 0;
    let stopped = false;
    let scheduleTimer = null;

    function schedulePad(time, notes){
      // Мягкий пэд: длинные ноты аккорда, треугольная волна, тихо.
      notes.forEach(n=>{
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = semi(0, n);
        g.gain.setValueAtTime(0, time);
        g.gain.linearRampToValueAtTime(0.06, time + 0.2);
        g.gain.linearRampToValueAtTime(0.05, time + 1.6);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 2.0);
        o.connect(g); g.connect(mgain);
        o.start(time); o.stop(time + 2.02);
      });
    }
    function scheduleBass(time, n){
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = semi(0, n - 12); // на октаву ниже
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(0.14, time + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 1.0);
      o.connect(g); g.connect(mgain);
      o.start(time); o.stop(time + 1.05);
    }
    function scheduleArp(time, n){
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = semi(0, n + 12); // повыше для «колокольчиков»
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(0.05, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
      o.connect(g); g.connect(mgain);
      o.start(time); o.stop(time + 0.5);
    }

    // Планировщик: с запасом в один такт.
    function scheduleBar(time){
      if(stopped) return;
      const ch = chords[bar % chords.length];
      schedulePad(time, ch);
      scheduleBass(time, ch[0]);
      // Арпеджио по 6 нот на такт (3 c, длительность такта = 6*beat).
      for(let i=0;i<6;i++){
        const ni = arpPat[i % ch.length];
        scheduleArp(time + i*beat, ch[ni]);
      }
      bar++;
      // Следующий такт.
      scheduleTimer = setTimeout(()=> scheduleBar(time + 6*beat), (6*beat - 0.2) * 1000);
    }

    scheduleBar(ctx.currentTime + 0.05);

    music = {
      gain: mgain,
      stop(){
        stopped = true;
        if(scheduleTimer){ clearTimeout(scheduleTimer); scheduleTimer = null; }
        // Гасим мгновенно — чтобы выключение музыки было чётким и немедленным.
        const t = ctx.currentTime;
        try{
          mgain.gain.cancelScheduledValues(t);
          mgain.gain.setValueAtTime(0, t);
          mgain.gain.disconnect();
        }catch(e){}
      }
    };
  }
  function stopMusic(){
    if(music){ music.stop(); music = null; }
  }
  // Запускает фоновую музыку, если звук включён.
  function setMusicEnabled(on){
    if(on && enabled){ init(); resume(); startMusic(); }
    else { stopMusic(); }
  }

  return { init, resume, setEnabled, hit, clack, wall, pot, win, fail, coin, buy, combo, ui,
           startMusic, stopMusic, setMusicEnabled };
})();
