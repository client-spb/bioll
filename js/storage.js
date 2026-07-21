/* ============================================================
   STORAGE.JS — сохранения с миграцией старых сейвов
   ============================================================ */
window.Storage = (function(){
  const KEY = 'billiardSave_v2';

  const DEFAULT = {
    coins: 0,
    level: 1,
    maxLevel: 1,
    cue: 0,
    ball: 0,
    cloth: 0,
    ownedCues: [0],
    ownedBalls: [0],
    ownedCloths: [0],
    stars: {},        // { 1: 3, 2: 2, ... } — звёзды за уровень
    totalCoins: 0,    // всего заработано (для статистики)
    sound: true
  };

  function migrate(old){
    // Совместимость со старым форматом (billiardSave)
    if(!old) return structuredClone(DEFAULT);
    const s = structuredClone(DEFAULT);
    s.coins = old.coins || 0;
    s.level = old.level || 1;
    s.maxLevel = old.maxLevel || 1;
    s.cue = old.cue || 0;
    s.ball = old.ball || 0;
    s.cloth = old.cloth ?? 0;
    s.ownedCues = Array.isArray(old.ownedCues) && old.ownedCues.length ? old.ownedCues : [0];
    s.ownedBalls = Array.isArray(old.ownedBalls) && old.ownedBalls.length ? old.ownedBalls : [0];
    s.ownedCloths = Array.isArray(old.ownedCloths) && old.ownedCloths.length ? old.ownedCloths : [0];
    s.stars = old.stars || {};
    s.totalCoins = old.totalCoins || s.coins;
    s.sound = old.sound !== false;
    return s;
  }

  let data = null;
  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      const oldFmt = localStorage.getItem('billiardSave');
      data = migrate(raw ? JSON.parse(raw) : (oldFmt ? JSON.parse(oldFmt) : null));
    }catch(e){
      data = structuredClone(DEFAULT);
    }
    return data;
  }
  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(data)); }catch(e){}
  }
  function get(){ if(!data) load(); return data; }
  function update(fn){ if(!data) load(); fn(data); save(); }
  function reset(){ data = structuredClone(DEFAULT); save(); }

  return { load, save, get, update, reset };
})();
