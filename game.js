// Mobile-friendly maze-chase demo
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const pauseBtn = document.getElementById('pauseBtn');

  let DPR = Math.max(1, window.devicePixelRatio || 1);

  // Simple tile-based map (0 = empty/pellet, 1 = wall)
  // We'll generate a bordered maze with inner blocks for simplicity
  const cols = 21;
  const rows = 15;
  let tileSize = 24; // will be recalculated

  let map = [];
  function generateMap() {
    map = Array.from({length: rows}, (_, y) => {
      return Array.from({length: cols}, (_, x) => {
        // border walls
        if (x === 0 || y === 0 || x === cols-1 || y === rows-1) return 1;
        // create checkerboard inner blocks for obstacles
        if ((x % 2 === 0) && (y % 2 === 0)) return 1;
        return 0;
      });
    });
    // carve some openings
    map[1][1] = 0;
    map[rows-2][cols-2] = 0;
  }

  generateMap();

  let pellets = new Set();
  function populatePellets(){
    pellets.clear();
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        if(map[y][x] === 0) pellets.add(`${x},${y}`);
      }
    }
  }
  populatePellets();

  const player = { x:1, y:1, px:1, py:1, dir:null, nextDir:null, speed:6, radius:0.4 };
  let ghosts = [];
  function spawnGhosts(){
    ghosts = [
      { x: cols-2, y:1, px:cols-2, py:1, dir:null, speed:3 },
      { x: 1, y:rows-2, px:1, py:rows-2, dir:null, speed:3.5 }
    ];
  }
  spawnGhosts();

  let score = 0;
  let lives = 3;
  let running = true;

  function resizeCanvas(){
    const wrap = canvas.parentElement;
    const w = Math.min(wrap.clientWidth, 760) * DPR;
    const h = (wrap.clientHeight || (w / 1.4)) * DPR;
    canvas.width = Math.floor(w);
    canvas.height = Math.floor(h);
    tileSize = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  }
  window.addEventListener('resize', () => { DPR = Math.max(1, window.devicePixelRatio || 1); resizeCanvas(); });
  resizeCanvas();

  // Input
  const keyMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w:'up', s:'down', a:'left', d:'right' };
  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.key];
    if(k) player.nextDir = k;
  });

  // Touch buttons
  const btnUp = document.getElementById('btn-up');
  const btnDown = document.getElementById('btn-down');
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  function bindBtn(btn, dir){
    let pressed=false;
    btn.addEventListener('touchstart', (e)=>{ e.preventDefault(); pressed=true; player.nextDir = dir; }, {passive:false});
    btn.addEventListener('mousedown', (e)=>{ e.preventDefault(); pressed=true; player.nextDir = dir; });
    const stop = ()=>{ pressed=false; if(player.dir === dir) player.dir = null; };
    btn.addEventListener('touchend', stop);
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
  }
  bindBtn(btnUp,'up'); bindBtn(btnDown,'down'); bindBtn(btnLeft,'left'); bindBtn(btnRight,'right');

  pauseBtn.addEventListener('click', () => { running = !running; pauseBtn.textContent = running ? 'Pause' : 'Resume'; });

  // Movement helpers
  const DIRS = {
    up: {dx:0, dy:-1},
    down:{dx:0, dy:1},
    left:{dx:-1, dy:0},
    right:{dx:1, dy:0},
  };

  function canMoveTo(tx, ty){
    if(tx<0||ty<0||tx>=cols||ty>=rows) return false;
    return map[ty][tx] === 0;
  }

  function updatePlayer(dt){
    // If we're exactly at a tile coordinate, allow direction changes
    if(Math.abs(player.px - Math.round(player.px)) < 0.001 && Math.abs(player.py - Math.round(player.py)) < 0.001){
      player.x = Math.round(player.px);
      player.y = Math.round(player.py);
      // prefer nextDir if valid
      if(player.nextDir && canMoveTo(player.x + DIRS[player.nextDir].dx, player.y + DIRS[player.nextDir].dy)){
        player.dir = player.nextDir;
      }
      // otherwise if current dir blocked, stop
      if(player.dir && !canMoveTo(player.x + DIRS[player.dir].dx, player.y + DIRS[player.dir].dy)){
        player.dir = null;
      }
    }
    if(player.dir){
      player.px += DIRS[player.dir].dx * player.speed * dt;
      player.py += DIRS[player.dir].dy * player.speed * dt;
    }
    // eat pellet if on tile
    const key = `${Math.round(player.px)},${Math.round(player.py)}`;
    if(pellets.has(key)){
      pellets.delete(key);
      score += 10;
      scoreEl.textContent = `Score: ${score}`;
    }
  }

  function updateGhost(g, dt){
    // simple movement: if at tile, pick a random available direction (not reverse if possible)
    if(Math.abs(g.px - Math.round(g.px)) < 0.001 && Math.abs(g.py - Math.round(g.py)) < 0.001){
      g.x = Math.round(g.px);
      g.y = Math.round(g.py);
      const avail = [];
      for(const [k,v] of Object.entries(DIRS)){
        if(canMoveTo(g.x + v.dx, g.y + v.dy)) avail.push(k);
      }
      if(avail.length>0){
        // avoid reversing direction when possible
        const reverse = {up:'down', down:'up', left:'right', right:'left'};
        let choices = avail;
        if(g.dir && avail.length>1){
          choices = avail.filter(d => d !== reverse[g.dir]);
          if(choices.length===0) choices = avail;
        }
        g.dir = choices[Math.floor(Math.random()*choices.length)];
      } else {
        g.dir = null;
      }
    }
    if(g.dir){
      g.px += DIRS[g.dir].dx * g.speed * dt;
      g.py += DIRS[g.dir].dy * g.speed * dt;
    }
  }

  function checkCollisions(){
    for(const g of ghosts){
      const dx = g.px - player.px;
      const dy = g.py - player.py;
      const dist2 = dx*dx + dy*dy;
      if(dist2 < 0.35){ // collision threshold
        // lose a life and reset positions
        lives--;
        livesEl.textContent = `Lives: ${lives}`;
        resetPositions();
        if(lives <= 0){
          running = false;
          alert(`Game Over!\nScore: ${score}`);
          // reset game
          score = 0; lives = 3; scoreEl.textContent = `Score: ${score}`; livesEl.textContent = `Lives: ${lives}`;
          populatePellets();
          running = true;
        }
        break;
      }
    }
  }

  function resetPositions(){
    player.px = player.x = 1; player.py = player.y = 1; player.dir = player.nextDir = null;
    spawnGhosts();
    ghosts.forEach(g => { g.px = g.x; g.py = g.y; g.dir = null; });
  }

  // Render
  function draw(){
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const offsetX = Math.floor((canvas.width - tileSize*cols)/2);
    const offsetY = Math.floor((canvas.height - tileSize*rows)/2);

    // draw map
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const px = offsetX + x*tileSize;
        const py = offsetY + y*tileSize;
        if(map[y][x] === 1){
          ctx.fillStyle = '#0b61a4';
          ctx.fillRect(px, py, tileSize, tileSize);
        } else {
          // floor
          ctx.fillStyle = '#071427';
          ctx.fillRect(px, py, tileSize, tileSize);
          // pellet
          if(pellets.has(`${x},${y}`)){
            ctx.fillStyle = '#ffee99';
            const r = Math.max(2, tileSize * 0.08);
            ctx.beginPath();
            ctx.arc(px + tileSize/2, py + tileSize/2, r, 0, Math.PI*2);
            ctx.fill();
          }
        }
      }
    }

    // draw player
    const playerX = offsetX + player.px*tileSize;
    const playerY = offsetY + player.py*tileSize;
    ctx.fillStyle = '#ffd400';
    ctx.beginPath();
    ctx.arc(playerX + tileSize/2, playerY + tileSize/2, tileSize*player.radius, 0, Math.PI*2);
    ctx.fill();

    // draw ghosts
    for(const g of ghosts){
      const gx = offsetX + g.px*tileSize;
      const gy = offsetY + g.py*tileSize;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(gx + tileSize*0.12, gy + tileSize*0.12, tileSize*0.76, tileSize*0.76);
    }
  }

  // Game loop
  let last = performance.now();
  function loop(now){
    const dt = Math.min(0.05, (now - last) / 1000); // cap dt
    last = now;
    if(running){
      updatePlayer(dt);
      ghosts.forEach(g => updateGhost(g, dt));
      checkCollisions();
      draw();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Initial placement (use px/py as floats)
  player.px = player.x = 1; player.py = player.y = 1;
  ghosts.forEach(g => { g.px = g.x; g.py = g.y; });

  // ensure canvas sizing on first paint
  resizeCanvas();
  window.setTimeout(() => resizeCanvas(), 200);

  // Accessibility: pause with space
  window.addEventListener('keydown', (e) => {
    if(e.code === 'Space'){ running = !running; pauseBtn.textContent = running ? 'Pause' : 'Resume'; }
  });

})();
