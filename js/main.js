/* ============================================================
   MAIN.JS — игровой цикл, ввод, инициализация, связка модулей
   ============================================================ */
window.Game = (function(){

  // ---- DOM ----
  const cv = document.getElementById('cv');
  let W = 0, H = 0;
  let table = null, R = 12;

  // ---- Состояние игры ----
  let gameState = 'loading'; // loading|menu|start|playing|paused|levelend
  let balls = [], pockets = [], obstacles = [];
  let cueBall = null;
  let level = 1, pendingLevel = 1;
  let targetsLeft = 0, totalTargets = 0;
  let shots = 0, shotLimit = 0, timeLimit = 0;
  let timeRemaining = 0;
  let currentTargetType = 'all';
  let cfg = null;

  let aiming = false, aimStart = null, aimCur = null, shooting = false;
  let combo = 0, comboTimer = 0;
  let potCount = 0;     // за текущий уровень
  let timerInterval = null;
  let levelStartTime = 0;
  let nextIsMenu = false, nextIsRetry = false;

  let ballIdCounter = 0;
  let lastTime = 0;

  // ============================================================
  // РАЗМЕРЫ
  // ============================================================
  function resize(){
    W = cv.width = window.innerWidth;
    H = cv.height = window.innerHeight;
    const margin = 16;
    // Резервируем место под HUD сверху и под шкалу силы/подсказку снизу.
    // safe-area учитывается через env() в CSS, здесь берём с запасом.
    const safeTop = Math.max(8, parseInt(getComputedStyle(document.documentElement).getPropertyValue('sat'))||0);
    const topReserve = 78 + safeTop;   // HUD занимает ~70px + отступ
    const bottomReserve = 64;          // шкала силы + подсказка
    const availW = W - margin*2;
    const availH = H - topReserve - bottomReserve;
    let tw = availW, th = tw*2;
    if(th > availH){ th = availH; tw = th/2; }
    table = {
      x: Math.round((W - tw)/2),
      y: Math.round(topReserve + (availH - th)/2),
      w: tw, h: th,
      wall: Math.max(14, tw*0.05)
    };
    R = Math.max(10, tw*0.035);
    Render.setTable(table, R);
    Render.resize(W, H);
    Physics.configure(table, R, {
      onWallHit: (intensity) => { Audio2.wall(Math.min(1, intensity/8)); FX.shake(intensity*0.4); },
      onBallHit: (intensity, x, y, color) => {
        Audio2.clack(Math.min(1, intensity/6));
        FX.ring(x, y, color || '#fff', R*1.2);
        FX.burst(x, y, 4, '#fff', { speed:2, size:2, life:0.5 });
      },
      onPot: (b) => potBall(b)
    });
  }

  // ============================================================
  // УСТАНОВКА УРОВНЯ
  // ============================================================
  function setupLevel(lv){
    level = lv;
    cfg = Levels.getLevelConfig(lv);
    balls = []; obstacles = [];
    FX.clearTrails();
    ballIdCounter = 0;

    totalTargets = cfg.targets;
    targetsLeft = cfg.targets;
    shots = 0;
    shotLimit = cfg.shotLimit;
    timeLimit = cfg.timeLimit || 0;
    timeRemaining = timeLimit;
    currentTargetType = cfg.targetType;
    combo = 0;
    potCount = 0;
    levelStartTime = Date.now();

    if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }

    // Препятствия
    cfg.obstacles.forEach(o => {
      obstacles.push({ x: table.x + table.w*o.rx, y: table.y + table.h*o.ry, r: table.w*o.w });
    });

    // Биток
    const skin = GameConfig.BALLS[Storage.get().ball];
    cueBall = makeBall(table.x + table.w*0.5, table.y + table.h*0.82, {
      cue: true, color: skin.color, glow: skin.glow, stripe: skin.stripe, type:'cue'
    });
    balls.push(cueBall);

    // Цели
    const positions = Levels.getShapePositions(cfg.shape, cfg.targets);
    for(let i=0; i<cfg.targets && i<positions.length; i++){
      const p = positions[i];
      let type, color, stripe, number;
      if(cfg.targetType === 'striped'){ type='striped'; const c = Levels.STRIPED[i % Levels.STRIPED.length]; color='#f5f5f5'; stripe=c; number = i+9; }
      else if(cfg.targetType === 'solid'){ type='solid'; color = Levels.SOLID[i % Levels.SOLID.length]; stripe=color; number = i+1; }
      else {
        // Чередование solid (1-7) и striped (9-15)
        if(i % 2 === 0){ type='solid'; color = Levels.SOLID[i % Levels.SOLID.length]; stripe=color; number = (i % 7) + 1; }
        else { type='striped'; const c = Levels.STRIPED[i % Levels.STRIPED.length]; color='#f5f5f5'; stripe=c; number = ((i % 7)) + 9; }
      }
      balls.push(makeBall(table.x + table.w*p.x, table.y + table.h*p.y, {
        cue:false, color, glow: Render._lighten(color, 40), stripe, type, isTarget:true, number
      }));
    }

    // Лузы (угловые крупнее, боковые чуть меньше)
    const pr = R*1.9;
    pockets = [
      { x:table.x, y:table.y, r:pr },
      { x:table.x+table.w, y:table.y, r:pr },
      { x:table.x-pr*0.15, y:table.y+table.h/2, r:pr*0.92 },
      { x:table.x+table.w+pr*0.15, y:table.y+table.h/2, r:pr*0.92 },
      { x:table.x, y:table.y+table.h, r:pr },
      { x:table.x+table.w, y:table.y+table.h, r:pr },
    ];

    // Таймер
    if(timeLimit > 0){
      timerInterval = setInterval(() => {
        if(gameState !== 'playing') return;
        const elapsed = Math.floor((Date.now() - levelStartTime)/1000);
        timeRemaining = Math.max(0, timeLimit - elapsed);
        UI.updateHud(currentHudState());
        if(timeRemaining <= 0){
          clearInterval(timerInterval); timerInterval = null;
          failLevel('Время вышло!');
        }
      }, 250);
    }

    updateHud();
  }

  function makeBall(x, y, props){
    const b = { x, y, vx:0, vy:0, r:R, active:true, _id: ++ballIdCounter, ...props };
    return b;
  }

  // ============================================================
  // ФИЗИЧЕСКИЕ СОБЫТИЯ
  // ============================================================
  function potBall(b){
    if(!b.active) return;
    b.active = false; b.vx = 0; b.vy = 0;
    FX.removeTrail(b._id);

    if(b.cue){
      Audio2.fail();
      FX.flash('#ff5b6e', 0.4);
      FX.shake(15);
      FX.burst(b.x, b.y, 25, '#ff5b6e', { speed:6, life:1.2 });
      UI.toast('Белый в лузе!', 'error');
      setTimeout(() => failLevel('Белый шар в лузе!'), 500);
      return;
    }

    // Целевой ли шар?
    const isTarget = b.isTarget && (currentTargetType === 'all' || b.type === currentTargetType);

    // Эффекты попадания
    FX.stars(b.x, b.y, 8, isTarget ? '#ffd24a' : '#888');
    FX.burst(b.x, b.y, 18, b.color, { speed:5, life:1 });
    FX.flash(isTarget ? '#ffd24a' : '#666', isTarget ? 0.25 : 0.1);
    FX.shake(isTarget ? 6 : 3);

    if(isTarget){
      Audio2.pot();
      targetsLeft--;
      potCount++;
      combo++;
      comboTimer = 1.5;

      // Монеты с учётом комбо
      const baseCoins = GameConfig.COIN_PER_POT;
      const comboBonus = (combo - 1) * GameConfig.COIN_PER_POT_COMBO;
      const earned = baseCoins + comboBonus;
      Storage.update(s => { s.coins += earned; s.totalCoins += earned; });

      Audio2.coin();
      if(combo >= 2){
        Audio2.combo(combo);
        UI.showCombo(`<span class="big">×${combo}</span><br>КОМБО!`);
      }
      // Всплывающие очки над лузой (конвертация canvas → screen)
      UI.showScorePop(b.x, b.y, '+' + earned, '#ffd24a');

      updateHud();
      if(targetsLeft <= 0){
        setTimeout(() => winLevel(), 600);
      }
    } else {
      Audio2.fail();
      UI.toast('Не тот шар!', 'error');
      combo = 0;
      updateHud();
    }
  }

  // ============================================================
  // ОКОНЧАНИЕ ХОДА
  // ============================================================
  function onTurnEnd(){
    if(!cueBall.active) return;
    if(targetsLeft <= 0) return; // уже победа
    if(shotLimit > 0 && shots >= shotLimit){
      failLevel('Лимит ударов исчерпан!');
    }
  }

  // ============================================================
  // ПОБЕДА / ПОРАЖЕНИЕ
  // ============================================================
  function calcStars(){
    if(shotLimit > 0){
      const used = shots / shotLimit;
      if(used <= GameConfig.STAR_THRESHOLD.three) return 3;
      if(used <= GameConfig.STAR_THRESHOLD.two) return 2;
      return 1;
    }
    if(timeLimit > 0){
      const used = (timeLimit - timeRemaining) / timeLimit;
      if(used <= GameConfig.STAR_THRESHOLD.three) return 3;
      if(used <= GameConfig.STAR_THRESHOLD.two) return 2;
      return 1;
    }
    return 1;
  }

  function winLevel(){
    gameState = 'levelend';
    if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
    Audio2.win();
    FX.flash('#ffd24a', 0.4);

    const stars = calcStars();
    const isLast = level >= GameConfig.TOTAL_LEVELS;

    // Награды
    const baseReward = GameConfig.COIN_REWARD_BASE + level * GameConfig.COIN_REWARD_PER_LEVEL;
    const potBonus = potCount * 2;
    const starBonus = GameConfig.COIN_STAR_BONUS[stars] || 0;
    const totalReward = baseReward + potBonus + starBonus;

    Storage.update(s => {
      s.coins += totalReward;
      s.totalCoins += totalReward;
      s.stars[level] = Math.max(s.stars[level] || 0, stars);
      if(!isLast){
        s.maxLevel = Math.max(s.maxLevel, level + 1);
        s.level = level + 1;
      }
    });

    nextIsMenu = isLast;
    nextIsRetry = false;

    UI.showLevelEnd({
      win: true,
      level,
      isLast,
      stars,
      coinsReward: baseReward,
      potBonus,
      starBonus,
      nextLabel: isLast ? 'В меню' : 'Уровень ' + (level + 1)
    });
  }

  function failLevel(reason){
    gameState = 'levelend';
    if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
    Audio2.fail();
    FX.flash('#ff5b6e', 0.3);
    nextIsMenu = false;
    nextIsRetry = true;
    UI.showLevelEnd({
      win: false,
      level,
      stars: 0,
      reason: reason || 'Попробуй ещё раз!',
      nextLabel: 'Заново'
    });
  }

  // ============================================================
  // HUD
  // ============================================================
  function currentHudState(){
    return {
      level, targetsLeft, totalTargets, shots, shotLimit,
      timeLimit, timeRemaining, combo, targetType: currentTargetType
    };
  }
  function updateHud(){ UI.updateHud(currentHudState()); }

  // ============================================================
  // ИГРОВОЙ ЦИКЛ
  // ============================================================
  function loop(now){
    const dt = Math.min(0.05, (now - lastTime)/1000) || 0.016;
    lastTime = now;

    if(gameState === 'playing'){
      const moving = Physics.step(balls, obstacles, pockets, 1);
      // Трейлы для движущихся
      for(const b of balls){
        if(b.active && (Math.abs(b.vx) + Math.abs(b.vy)) > 1){
          FX.addTrail(b);
        }
      }
      if(shooting && !moving){
        shooting = false;
        onTurnEnd();
      }
      // Комбо-таймер
      if(combo > 0){
        comboTimer -= dt;
        if(comboTimer <= 0){ combo = 0; updateHud(); }
      }
    }

    FX.update(dt);

    // Состояние для рендера
    const save = Storage.get();
    Render.setState({
      balls, pockets, obstacles,
      cueConfig: GameConfig.CUES[save.cue],
      ballSkin: GameConfig.BALLS[save.ball],
      cloth: GameConfig.CLOTHS[save.cloth],
      aiming, aimStart, aimCur,
      targetType: currentTargetType
    });
    Render.draw(gameState, cueBall, shooting);

    requestAnimationFrame(loop);
  }

  // ============================================================
  // УПРАВЛЕНИЕ
  // ============================================================
  function getPos(e){
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }
  function anyMoving(){ return Physics.isMoving(balls); }

  function onDown(e){
    if(gameState !== 'playing' || shooting || anyMoving() || !cueBall || !cueBall.active) return;
    const p = getPos(e);
    aiming = true;
    aimStart = { x: cueBall.x, y: cueBall.y };
    aimCur = p;
    document.getElementById('powerWrap').style.display = 'block';
    UI.hideHint();
    e.preventDefault();
  }
  function onMove(e){
    if(!aiming) return;
    aimCur = getPos(e);
    const dx = aimStart.x - aimCur.x, dy = aimStart.y - aimCur.y;
    const power = Math.min(Math.hypot(dx, dy) / (table.h*0.4), 1);
    document.getElementById('powerBar').style.width = (power*100) + '%';
    e.preventDefault();
  }
  function onUp(e){
    if(!aiming) return;
    aiming = false;
    document.getElementById('powerWrap').style.display = 'none';
    document.getElementById('powerBar').style.width = '0%';
    const dx = aimStart.x - aimCur.x, dy = aimStart.y - aimCur.y;
    const dist = Math.hypot(dx, dy);
    if(dist < 10){ return; }
    const power = Math.min(dist, table.h*0.4);
    const cue = GameConfig.CUES[Storage.get().cue];
    const speed = power * 0.13 * cue.power;
    const ang = Math.atan2(dy, dx);
    cueBall.vx = Math.cos(ang) * speed;
    cueBall.vy = Math.sin(ang) * speed;
    shooting = true;
    shots++;
    combo = 0; // новый удар — комбо сбрасывается (будет расти при забивании)
    Audio2.hit(power / (table.h*0.4));
    FX.shake(power * 0.05);
    updateHud();
    e.preventDefault();
  }

  // ============================================================
  // СТАРТ УРОВНЯ
  // ============================================================
  function showLevelStart(lv){
    pendingLevel = lv;
    level = lv;
    const c = Levels.getLevelConfig(lv);
    gameState = 'start';
    UI.showLevelStart(lv, c);
  }
  function startLevel(lv){
    resize();
    setupLevel(lv);
    gameState = 'playing';
    UI.hideAllOverlays();
    UI.showHud();
    UI.showHint('Тяни от белого шара для удара');
    UI.hideHintAfter(3500);
    updateHud();
  }

  function onSkinChanged(){
    if(cueBall){
      const skin = GameConfig.BALLS[Storage.get().ball];
      cueBall.color = skin.color;
      cueBall.glow = skin.glow;
      cueBall.stripe = skin.stripe;
    }
  }

  // ============================================================
  // КНОПКИ
  // ============================================================
  function bindButtons(){
    const $ = id => document.getElementById(id);

    $('playBtn').onclick = () => { Audio2.init(); showLevelStart(Storage.get().level); };
    $('startBtn').onclick = () => { Audio2.init(); startLevel(pendingLevel); };
    $('lsMenu').onclick = () => { gameState = 'menu'; UI.showOverlay('mainMenu'); updateHud(); };

    $('nextBtn').onclick = () => {
      if(nextIsMenu){ gameState = 'menu'; UI.showOverlay('mainMenu'); updateHud(); return; }
      if(nextIsRetry){ showLevelStart(level); return; }
      showLevelStart(Storage.get().level);
    };
    $('leMenu').onclick = () => { gameState = 'menu'; UI.showOverlay('mainMenu'); updateHud(); };

    $('shopBtn').onclick = () => { Audio2.init(); UI.openShop('cue'); };
    $('shopBack').onclick = () => {
      if(gameState === 'playing' || gameState === 'paused'){
        UI.hideAllOverlays();
        UI.showPause();
        UI.showHud();
      } else {
        UI.showOverlay('mainMenu');
        updateHud();
      }
    };

    // Табы магазина
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => { Audio2.ui(); UI.openShop(tab.dataset.tab); };
    });

    // Пауза
    $('pauseBtn').onclick = () => {
      if(gameState === 'playing'){
        gameState = 'paused';
        UI.showPause();
      }
    };
    $('resumeBtn').onclick = () => { gameState = 'playing'; UI.hidePause(); };
    $('pauseShopBtn').onclick = () => { Audio2.init(); UI.hidePause(); UI.openShop('cue'); };
    $('pauseMenuBtn').onclick = () => {
      if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
      gameState = 'menu';
      UI.hidePause();
      UI.showOverlay('mainMenu');
      updateHud();
    };

    // Ввод
    cv.addEventListener('touchstart', onDown, { passive:false });
    cv.addEventListener('touchmove', onMove, { passive:false });
    cv.addEventListener('touchend', onUp, { passive:false });
    cv.addEventListener('mousedown', onDown);
    cv.addEventListener('mousemove', onMove);
    cv.addEventListener('mouseup', onUp);
    cv.addEventListener('mouseleave', e => { if(aiming) onUp(e); });

    window.addEventListener('resize', () => {
      resize();
      // При изменении размера стола переносим шары пропорционально
      if(gameState === 'playing' || gameState === 'paused'){
        rescaleBalls();
      }
    });
  }

  // Пропорциональный перенос шаров при ресайзе
  let prevTable = null;
  function rescaleBalls(){
    if(!prevTable){ prevTable = { ...table }; return; }
    const sx = table.w / prevTable.w, sy = table.h / prevTable.h;
    for(const b of balls){
      b.x = table.x + (b.x - prevTable.x) * sx;
      b.y = table.y + (b.y - prevTable.y) * sy;
      b.r = R;
    }
    // Лузы
    const pr = R*1.9;
    pockets = [
      { x:table.x, y:table.y, r:pr },
      { x:table.x+table.w, y:table.y, r:pr },
      { x:table.x-pr*0.15, y:table.y+table.h/2, r:pr*0.92 },
      { x:table.x+table.w+pr*0.15, y:table.y+table.h/2, r:pr*0.92 },
      { x:table.x, y:table.y+table.h, r:pr },
      { x:table.x+table.w, y:table.y+table.h, r:pr },
    ];
    for(const o of obstacles){ o.r = table.w * 0.04; }
    prevTable = { ...table };
  }

  // ============================================================
  // ЗАГРУЗЧИК (сплэш)
  // ============================================================
  function updateLoader(progress, status){
    const bar = document.getElementById('loadingBar');
    const pct = document.getElementById('loadingPercent');
    const st = document.getElementById('loadingStatus');
    const p = Math.min(100, Math.round(progress*100));
    bar.style.width = p + '%';
    pct.textContent = p + '%';
    if(status) st.textContent = status;
  }
  async function loadAssets(){
    const MIN = 1400;
    const start = Date.now();
    const steps = 22;
    for(let i=0;i<=steps;i++){
      updateLoader(i/steps, i < steps*0.6 ? 'Загрузка ресурсов…' : (i < steps*0.9 ? 'Подготовка стола…' : 'Почти готово…'));
      await new Promise(r => setTimeout(r, 50 + Math.random()*40));
    }
    const elapsed = Date.now() - start;
    if(elapsed < MIN){
      await new Promise(r => setTimeout(r, MIN - elapsed));
    }
    updateLoader(1, 'Готово!');
    await new Promise(r => setTimeout(r, 250));
  }

  // ============================================================
  // ИНИЦИАЛИЗАЦИЯ
  // ============================================================
  async function init(){
    Storage.load();
    Render.init(cv);
    resize();
    prevTable = { ...table };
    bindButtons();

    await loadAssets();

    document.getElementById('splashScreen').classList.add('hidden');
    gameState = 'menu';
    UI.showOverlay('mainMenu');
    updateHud();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  return { init, onSkinChanged, startLevel, showLevelStart,
    // Тестовый доступ (не используется в продакшене)
    _debug: () => ({
      gameState, level, targetsLeft, totalTargets, shots, shotLimit,
      timeRemaining, combo, balls: balls.map(b => ({x:b.x,y:b.y,cue:b.cue,active:b.active,isTarget:b.isTarget,type:b.type})),
      table, R
    })
  };
})();

// Запуск
window.addEventListener('DOMContentLoaded', () => Game.init());
