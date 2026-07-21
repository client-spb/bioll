/* ============================================================
   UI.JS — управление DOM: экраны, HUD, магазин, тосты
   ============================================================ */
window.UI = (function(){
  const $ = id => document.getElementById(id);
  const OVERLAYS = ['mainMenu','shop','levelEnd','levelStart','pauseMenu'];

  let shopTab = 'cue';

  // ---- Экраны ----
  function showOverlay(id){
    OVERLAYS.forEach(o => $(o).classList.add('hidden'));
    if(id) $(id).classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('hint').classList.remove('show');
    $('powerWrap').style.display = 'none';
  }
  function hideAllOverlays(){
    OVERLAYS.forEach(o => $(o).classList.add('hidden'));
  }
  function showHud(){
    $('hud').classList.remove('hidden');
  }
  function showHint(text){
    if(text) $('hint').textContent = text;
    $('hint').classList.add('show');
  }
  function hideHint(){ $('hint').classList.remove('show'); }
  function hideHintAfter(ms){
    setTimeout(() => $('hint').classList.remove('show'), ms);
  }

  // ---- HUD обновление ----
  function updateHud(state){
    const save = Storage.get();
    $('coins').textContent = save.coins;
    $('menuCoins').textContent = save.coins;
    $('shopCoins').textContent = save.coins;
    $('menuLevel').textContent = save.level;
    $('lvlNum').textContent = state.level;
    $('ballCount').textContent = state.targetsLeft;
    $('coins').parentElement && ($('coins').textContent = save.coins);

    // Звёзды
    let total = 0, max = 0;
    Object.values(save.stars).forEach(s => total += s);
    max = GameConfig.TOTAL_LEVELS * 3;
    $('totalStars').textContent = total;
    $('totalStarsMax').textContent = max;

    // Лимит ударов
    if(state.shotLimit > 0){
      $('ballCount').textContent = state.targetsLeft + ' · ' + (state.shotLimit - state.shots);
    } else {
      $('ballCount').textContent = state.targetsLeft;
    }

    // Таймер
    if(state.timeLimit > 0){
      $('timerDisplay').classList.remove('hidden');
      $('timerNum').textContent = state.timeRemaining;
      if(state.timeRemaining <= 5) $('timerDisplay').classList.add('urgent');
      else $('timerDisplay').classList.remove('urgent');
    } else {
      $('timerDisplay').classList.add('hidden');
    }

    // Комбо
    if(state.combo > 1){
      $('comboBadge').classList.add('active');
      $('comboNum').textContent = state.combo;
    } else {
      $('comboBadge').classList.remove('active');
    }
  }

  // ---- Тост ----
  let toastTimer;
  function toast(text, type=''){
    const el = $('toast');
    el.textContent = text;
    el.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.className = 'toast ' + type, 1500);
  }

  // ---- Всплывающее комбо ----
  function showCombo(text){
    const el = $('comboFlyout');
    const pop = document.createElement('div');
    pop.className = 'combo-pop';
    pop.innerHTML = text;
    el.appendChild(pop);
    setTimeout(() => pop.remove(), 900);
  }

  // ---- Всплывающие очки над точкой ----
  function showScorePop(x, y, text, color){
    const el = document.createElement('div');
    el.className = 'score-pop';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if(color) el.style.color = color;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  // ============ МАГАЗИН ============
  function openShop(tab){
    shopTab = tab || shopTab;
    hideAllOverlays();
    $('shop').classList.remove('hidden');
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === shopTab);
    });
    renderShop();
    updateHud({ level:0, targetsLeft:0, shots:0, shotLimit:0, timeLimit:0, combo:1 });
  }

  function renderShop(){
    const save = Storage.get();
    const list = $('shopList');
    list.innerHTML = '';

    let items, owned, sel;
    if(shopTab === 'cue'){ items = GameConfig.CUES; owned = save.ownedCues; sel = save.cue; }
    else if(shopTab === 'cloth'){ items = GameConfig.CLOTHS; owned = save.ownedCloths; sel = save.cloth; }
    else { items = GameConfig.BALLS; owned = save.ownedBalls; sel = save.ball; }

    items.forEach((it, i) => {
      const div = document.createElement('div');
      div.className = 'shopItem';
      const isOwned = owned.includes(i);
      const isSel = sel === i;
      if(isSel) div.classList.add('selected');

      // Превью
      const prev = document.createElement('div');
      prev.className = 'prev';
      prev.appendChild(buildPreview(shopTab, it));

      // Инфо
      const info = document.createElement('div');
      info.className = 'cinfo';
      let statsHtml = '';
      if(shopTab === 'cue'){
        statsHtml = `<span class="stat-chip power">Сила ${Math.round(it.power*100)}%</span>
                     <span class="stat-chip aim">${it.aimText}</span>`;
      } else if(shopTab === 'cloth'){
        statsHtml = `<span class="stat-chip">Сукно стола</span>`;
      } else {
        statsHtml = `<span class="stat-chip">Скин битка</span>`;
      }
      info.innerHTML = `<b>${it.name}</b><div class="desc">${it.desc||''}</div><div class="stats">${statsHtml}</div>`;

      // Кнопка
      const btn = document.createElement('button');
      btn.className = 'buyb';
      if(isOwned){
        if(isSel){
          btn.textContent = 'Выбран';
          btn.classList.add('sel');
        } else {
          btn.textContent = 'Выбрать';
          btn.classList.add('owned');
          btn.onclick = () => { selectItem(i); Audio2.ui(); };
        }
      } else {
        btn.innerHTML = `<span class="ic-coin"></span>${it.price}`;
        if(save.coins < it.price) btn.classList.add('locked');
        else {
          btn.classList.add('buy');
          btn.onclick = () => buyItem(i);
        }
      }

      div.appendChild(prev);
      div.appendChild(info);
      div.appendChild(btn);
      list.appendChild(div);
    });

    $('shopCoins').textContent = save.coins;
  }

  function selectItem(i){
    Storage.update(s => {
      if(shopTab === 'cue') s.cue = i;
      else if(shopTab === 'cloth') s.cloth = i;
      else s.ball = i;
    });
    Audio2.ui();
    renderShop();
    // Сообщаем игре, чтобы обновить скин
    if(window.Game && Game.onSkinChanged) Game.onSkinChanged();
  }

  function buyItem(i){
    const save = Storage.get();
    let items, owned;
    if(shopTab === 'cue'){ items = GameConfig.CUES; owned = save.ownedCues; }
    else if(shopTab === 'cloth'){ items = GameConfig.CLOTHS; owned = save.ownedCloths; }
    else { items = GameConfig.BALLS; owned = save.ownedBalls; }
    const it = items[i];
    if(save.coins < it.price){ toast('Недостаточно монет', 'error'); Audio2.fail(); return; }
    Storage.update(s => {
      s.coins -= it.price;
      owned.push(i);
      if(shopTab === 'cue') s.cue = i;
      else if(shopTab === 'cloth') s.cloth = i;
      else s.ball = i;
    });
    Audio2.buy();
    toast('Куплено: ' + it.name, 'success');
    renderShop();
    if(window.Game && Game.onSkinChanged) Game.onSkinChanged();
  }

  // Построение превью для каждой категории
  function buildPreview(tab, it){
    const wrap = document.createElement('div');
    if(tab === 'cue'){
      wrap.className = 'prev-cue';
      const shaft = document.createElement('div');
      shaft.className = 'shaft';
      const grad = `linear-gradient(90deg, ${it.grip||it.color} 0%, ${it.color} 30%, ${shade(it.color, 30)} 100%)`;
      shaft.style.background = grad;
      const tip = document.createElement('div');
      tip.className = 'tip';
      tip.style.background = it.tip || '#4a90d9';
      const grip = document.createElement('div');
      grip.className = 'grip';
      grip.style.background = it.grip || shade(it.color, -30);
      wrap.appendChild(shaft); wrap.appendChild(tip); wrap.appendChild(grip);
    } else if(tab === 'cloth'){
      wrap.className = 'prev-cloth';
      const inner = document.createElement('div');
      inner.className = 'inner';
      inner.style.background = `radial-gradient(circle at 50% 40%, ${shade(it.felt, 20)}, ${it.felt} 60%, ${it.feltDark})`;
      inner.style.boxShadow = `inset 0 0 8px ${shade(it.felt, -40)}`;
      wrap.style.borderColor = it.rail;
      wrap.appendChild(inner);
    } else { // ball
      wrap.className = 'prev-ball';
      wrap.style.background = `radial-gradient(circle at 32% 28%, ${shade(it.color, 60)}, ${it.color} 55%, ${shade(it.color, -40)})`;
      wrap.style.boxShadow = `inset -6px -6px 12px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.4), 0 0 12px ${it.glow}66`;
    }
    return wrap;
  }

  // Простой сдвиг HEX цвета (поддержка #rgb и #rrggbb)
  function shade(hex, amt){
    hex = String(hex || '#ffffff').replace('#','');
    if(hex.length === 3) hex = hex.split('').map(x => x+x).join('');
    if(hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) hex = 'ffffff';
    let r = parseInt(hex.substr(0,2),16),
        g = parseInt(hex.substr(2,2),16),
        b = parseInt(hex.substr(4,2),16);
    r = Math.max(0, Math.min(255, r+amt));
    g = Math.max(0, Math.min(255, g+amt));
    b = Math.max(0, Math.min(255, b+amt));
    return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
  }

  // ---- Экраны результата ----
  function showLevelEnd(data){
    const save = Storage.get();
    const isWin = data.win;
    $('leTitle').textContent = isWin
      ? (data.isLast ? 'Ты Бильярд Мастер!' : 'Уровень ' + data.level + ' пройден!')
      : 'Поражение';
    $('leTitle').style.color = isWin ? '' : '#ff5b6e';

    // Звёзды
    const starsEl = $('leStars');
    starsEl.innerHTML = '';
    if(isWin){
      for(let i=0;i<3;i++){
        const s = document.createElement('span');
        s.className = 'star' + (i < data.stars ? '' : ' empty');
        starsEl.appendChild(s);
      }
    }

    // Награды
    const rewardsEl = $('leRewards');
    if(isWin){
      let html = '';
      html += `<div class="rw"><span class="ic-coin"></span> Награда <span class="plus">+${data.coinsReward}</span></div>`;
      if(data.potBonus > 0) html += `<div class="rw"><span class="ball-mini"></span> Забитые шары <span class="plus">+${data.potBonus}</span></div>`;
      if(data.starBonus > 0) html += `<div class="rw"><span class="star-mini"></span> Бонус звёзд <span class="plus">+${data.starBonus}</span></div>`;
      rewardsEl.innerHTML = html;
    } else {
      rewardsEl.innerHTML = `<div class="rw" style="color:#ff8a9a">${data.reason}</div>`;
    }

    // Кнопка "дальше"
    $('nextBtn').textContent = data.nextLabel;
    $('nextBtn').className = 'btn ' + (isWin ? 'btn-primary' : 'btn-back');

    hideAllOverlays();
    $('levelEnd').classList.remove('hidden');
  }

  function showLevelStart(lv, cfg){
    $('lsTitle').textContent = 'Уровень ' + lv + ' из ' + GameConfig.TOTAL_LEVELS;
    let g = `<div class="goal-line"><span class="gl-ic">${iconTarget()}</span><div><b>Цель:</b> ${cfg.desc}</div></div>`;
    g += `<div class="goal-line"><span class="gl-ic">${iconBall()}</span><div>Шаров забить: <b>${cfg.targets}</b></div></div>`;
    if(cfg.shotLimit > 0) g += `<div class="goal-line"><span class="gl-ic">${iconBolt()}</span><div>Лимит ударов: <b>${cfg.shotLimit}</b></div></div>`;
    if(cfg.timeLimit > 0) g += `<div class="goal-line"><span class="gl-ic">${iconClock()}</span><div>Время: <b>${cfg.timeLimit} сек</b></div></div>`;
    if(cfg.obstacles.length > 0) g += `<div class="goal-line"><span class="gl-ic">${iconBrick()}</span><div>На поле <b>препятствия</b></div></div>`;
    $('lsGoal').innerHTML = g;
    hideAllOverlays();
    $('levelStart').classList.remove('hidden');
  }

  // Иконки для целей (SVG inline)
  function iconTarget(){ return `<svg viewBox="0 0 24 24" width="20" height="20" fill="#ffd24a"><circle cx="12" cy="12" r="10" fill="none" stroke="#ffd24a" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="#ffd24a" stroke-width="2"/><circle cx="12" cy="12" r="2"/></svg>`; }
  function iconBall(){ return `<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9" fill="#f5f5f5" stroke="#888"/></svg>`; }
  function iconBolt(){ return `<svg viewBox="0 0 24 24" width="20" height="20" fill="#ffd24a"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>`; }
  function iconClock(){ return `<svg viewBox="0 0 24 24" width="20" height="20" fill="#ff5b6e"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5h-2v6l5 3 1-1.7-4-2.3z"/></svg>`; }
  function iconBrick(){ return `<svg viewBox="0 0 24 24" width="20" height="20" fill="#64b5f6"><circle cx="12" cy="12" r="9"/></svg>`; }

  function showPause(){
    $('pauseMenu').classList.remove('hidden');
  }
  function hidePause(){
    $('pauseMenu').classList.add('hidden');
  }

  function setShopTab(tab){ shopTab = tab; }

  return {
    showOverlay, hideAllOverlays, showHud, showHint, hideHint, hideHintAfter,
    updateHud, toast, showCombo, showScorePop,
    openShop, renderShop, setShopTab,
    showLevelEnd, showLevelStart, showPause, hidePause,
    $
  };
})();
