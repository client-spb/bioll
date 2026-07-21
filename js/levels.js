/* ============================================================
   LEVELS.JS — генерация 100 уровней
   Разнообразие: формы расстановки, типы целей, лимиты, препятствия.
   ============================================================ */
window.Levels = (function(){

  const SOLID = ['#e53935','#43a047','#1e88e5','#8e24aa','#f4511e','#ec407a','#7cb342'];
  const STRIPED = ['#ffb300','#00acc1','#26c6da','#9c27b0','#ff6f00','#d500f9','#00e5ff'];

  function targetCount(lv){
    if(lv <= 2)  return 1;
    if(lv <= 4)  return 2;
    if(lv <= 6)  return 3;
    if(lv <= 8)  return 4;
    if(lv <= 10) return 5;
    if(lv <= 13) return 6;
    if(lv <= 16) return 7;
    if(lv <= 20) return 8;
    if(lv <= 25) return 9;
    if(lv <= 30) return 10;
    if(lv <= 40) return 11;
    if(lv <= 55) return 12;
    if(lv <= 75) return 13;
    return 14;
  }

  function shotLimit(lv){
    if(lv <= 3)  return 20;
    if(lv <= 6)  return 18;
    if(lv <= 10) return 16;
    if(lv <= 15) return 14;
    if(lv <= 22) return 13;
    if(lv <= 30) return 12;
    if(lv <= 40) return 11;
    if(lv <= 55) return 10;
    if(lv <= 75) return 9;
    return 8;
  }

  function getLevelConfig(lv){
    const cfg = {
      level: lv,
      targets: targetCount(lv),
      obstacles: [],
      shotLimit: shotLimit(lv),
      timeLimit: 0,
      desc: '',
      targetType: 'all',
      shape: 'triangle'
    };

    // Тип цели — разнообразие
    const r = lv % 7;
    if(r === 0) cfg.targetType = 'striped';
    else if(r === 1) cfg.targetType = 'solid';
    else if(r === 2) cfg.targetType = 'striped';
    else if(r === 3) cfg.targetType = 'solid';
    else cfg.targetType = 'all';

    // Форма расстановки
    const shapes = ['triangle','diamond','line','square','cluster'];
    cfg.shape = shapes[(lv * 3) % shapes.length];
    if(lv <= 4) cfg.shape = 'triangle';

    // Лимиты ударов
    cfg.shotLimit = shotLimit(lv);

    // Уровни на время (каждый 7-й, начиная с 14)
    if(lv >= 14 && lv % 7 === 0){
      cfg.timeLimit = 18 + Math.floor(lv/7)*2;
      cfg.shotLimit = 0; // на время — без лимита ударов
    }
    // Дополнительный таймер на поздних уровнях (21, 28, ...)
    if(lv >= 28 && lv % 7 === 0){
      cfg.timeLimit = Math.max(cfg.timeLimit, 20 + Math.floor(lv/7)*2);
    }

    // Препятствия — чаще с ростом сложности
    if(lv >= 7 && lv % 3 === 0){
      const count = Math.min(3, 1 + Math.floor(lv/15));
      cfg.obstacles = makeObstacles(lv, count);
    }

    // Описание
    if(cfg.targetType === 'striped') cfg.desc = 'Забей только ПОЛОСАТЫЕ шары';
    else if(cfg.targetType === 'solid') cfg.desc = 'Забей только СПЛОШНЫЕ шары';
    else cfg.desc = 'Забей все шары';

    return cfg;
  }

  function makeObstacles(lv, count){
    const arr = [];
    let seed = lv*137 + 42;
    function rnd(){ seed = (seed*9301+49297)%233280; return seed/233280; }
    for(let i=0;i<count;i++){
      arr.push({ rx: 0.15 + rnd()*0.7, ry: 0.25 + rnd()*0.4, w: 0.03 + rnd()*0.025 });
    }
    return arr;
  }

  // Позиции для разных форм (в относительных координатах стола)
  function getShapePositions(shape, count){
    const positions = [];
    const cx = 0.5, cy = 0.25;

    if(shape === 'triangle'){
      let row = 0, placed = 0;
      while(placed < count){
        const cols = row + 1;
        for(let c=0;c<cols && placed<count;c++){
          const x = cx - (cols-1)*0.025 + c*0.05;
          const y = cy + row*0.06;
          positions.push({x, y}); placed++;
        }
        row++;
      }
    } else if(shape === 'diamond'){
      const size = Math.ceil(Math.sqrt(count));
      for(let r=0;r<size && positions.length<count;r++){
        for(let c=0;c<size && positions.length<count;c++){
          const x = cx - (size-1)*0.025 + c*0.05;
          const y = cy - (size-1)*0.03 + r*0.06;
          positions.push({x, y});
        }
      }
    } else if(shape === 'line'){
      for(let i=0;i<count;i++){
        const x = cx - (count-1)*0.025 + i*0.05;
        const y = cy + 0.02;
        positions.push({x, y});
      }
    } else if(shape === 'square'){
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count/cols);
      for(let r=0;r<rows && positions.length<count;r++){
        for(let c=0;c<cols && positions.length<count;c++){
          const x = cx - (cols-1)*0.025 + c*0.05;
          const y = cy - (rows-1)*0.03 + r*0.06;
          positions.push({x, y});
        }
      }
    } else if(shape === 'cluster'){
      // Случайная кластерная расстановка
      let seed = count*7 + 3;
      function rnd(){ seed = (seed*9301+49297)%233280; return seed/233280; }
      for(let i=0;i<count;i++){
        const x = cx + (rnd()-0.5)*0.4;
        const y = cy + rnd()*0.15;
        positions.push({x, y});
      }
    }
    return positions;
  }

  return { getLevelConfig, getShapePositions, SOLID, STRIPED };
})();
