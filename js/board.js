// Dessin du plateau, du dé central, du lion et des pions (canvas)
// ---------- Dessin ----------
function cell(gx, gy, fill) {
  ctx.fillStyle = fill; ctx.fillRect(gx * grid, gy * grid, grid, grid);
  ctx.strokeStyle = BORDER; ctx.lineWidth = 1; ctx.strokeRect(gx * grid, gy * grid, grid, grid);
}
function drawBoard() {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);

  PLAYERS.forEach(c => {
    const [ox, oy] = ORIGIN[c];
    ctx.fillStyle = colorFor(c); ctx.fillRect(ox * grid, oy * grid, 6 * grid, 6 * grid);
    ctx.fillStyle = '#fff'; ctx.fillRect((ox + 1) * grid, (oy + 1) * grid, 4 * grid, 4 * grid);
    for (let id = 0; id < 4; id++) cell(ox + 2 + (id % 2), oy + 2 + (id >> 1), '#e8e8e8');
    // 3 cases d'extension pour les prisonniers (une par couleur adverse)
    othersOf(c).forEach((v, s) => {
      if (!ACTIVE.includes(c) || !ACTIVE.includes(v)) return;
      const x = (ox + 1 + s) * grid, y = (oy + 4) * grid;
      ctx.fillStyle = PCOL[v] + '33'; ctx.fillRect(x, y, grid, grid);
      ctx.setLineDash([4, 3]); ctx.strokeStyle = PCOL[v]; ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, grid - 4, grid - 4); ctx.setLineDash([]);
    });
    if (customName[c] && ACTIVE.includes(c)) drawBaseName(c);
    if (ACTIVE.includes(c)) drawAvatar(c);
  });

  const starts = Object.fromEntries(PLAYERS.map(c => [START_INDEX[c], PCOL[c] + '55']));
  MAIN_PATH.forEach(([gx, gy], i) => {
    cell(gx, gy, '#fff');
    if (starts[i]) { ctx.fillStyle = starts[i]; ctx.fillRect(gx * grid, gy * grid, grid, grid); ctx.strokeRect(gx * grid, gy * grid, grid, grid); }
  });
  PLAYERS.forEach(c => HOME_PATHS[c].forEach(([gx, gy]) => cell(gx, gy, colorFor(c))));

  // Centre lila + couronne + pions arrivés
  ctx.fillStyle = PURPLE; ctx.fillRect(6 * grid, 6 * grid, 3 * grid, 3 * grid);
  ctx.strokeStyle = BORDER; ctx.strokeRect(6 * grid, 6 * grid, 3 * grid, 3 * grid);
  drawDie();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const spots = { RED: [6.35, 6.35], GREEN: [8.65, 6.35], YELLOW: [8.65, 8.65], BLUE: [6.35, 8.65] };
  PLAYERS.forEach(c => {
    const n = finishedCount(c);
    if (!n) return;
    const [sx, sy] = spots[c];
    ctx.beginPath(); ctx.arc(sx * grid, sy * grid, grid * .3, 0, Math.PI * 2);
    ctx.fillStyle = PCOL[c]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#000'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(n, sx * grid, sy * grid + 1);
  });

  drawPawns();
  drawMovingPawns();
  drawLion();
  drawBubbles();
}

function drawDie() {
  const cx = 7.5 * grid, cy = 7.5 * grid, d = 1.5 * grid;
  ctx.fillStyle = '#fff'; ctx.lineWidth = canRollNow() ? 5 : 2; ctx.strokeStyle = canRollNow() ? '#ffeb3b' : '#222';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - d / 2, cy - d / 2, d, d, 9); else ctx.rect(cx - d / 2, cy - d / 2, d, d);
  ctx.fill(); ctx.stroke();
  if (!dieShown) { ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText('👑', cx, cy + 2); return; }
  const o = d * .25, P = { 1: [[0,0]], 2: [[-1,-1],[1,1]], 3: [[-1,-1],[0,0],[1,1]], 4: [[-1,-1],[1,-1],[-1,1],[1,1]],
    5: [[-1,-1],[1,-1],[0,0],[-1,1],[1,1]], 6: [[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]] };
  ctx.fillStyle = '#111';
  P[dieShown].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(cx + a * o, cy + b * o, d * .075, 0, Math.PI * 2); ctx.fill(); });
}
// Tête de lion qui se balance sur le côté d'entrée de la base du joueur dont c'est le tour
function drawLion() {
  if (!gameStarted || gameOver) return;
  const c = ACTIVE[currentPlayerIndex], [ox, oy] = ORIGIN[c];
  // Côté de la base où se trouve l'entrée (case de départ) de chaque couleur
  const side = { RED: [3, 5.5], GREEN: [.5, 3], YELLOW: [3, .5], BLUE: [5.5, 3] }[c];
  const x = (ox + side[0]) * grid, y = (oy + side[1]) * grid;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.rotate(Math.sin(Date.now() / 250) * 0.45);
  ctx.font = '28px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000'; ctx.fillText('🦁', 0, 2);
  ctx.restore();
}

function drawAvatar(c) {  // photo du joueur, en rond, à l'extrémité du bord de sa base
  const im = AV_IMG[c];
  if (!im || !im.complete || !im.naturalWidth) return;
  const [ox, oy] = ORIGIN[c], x = (ox + .5) * grid, y = (oy + (oy === 0 ? .5 : 5.5)) * grid, r = 17;
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(im, x - r, y - r, 2 * r, 2 * r); ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
}
function drawBaseName(c) {
  const [ox, oy] = ORIGIN[c], cx = (ox + 3) * grid, cy = (oy + (oy === 0 ? .5 : 5.5)) * grid;
  let fs = 20;
  ctx.font = `bold ${fs}px sans-serif`;
  const w = ctx.measureText(NAMES[c]).width;
  const maxW = AV_IMG[c] ? 170 : 220;
  if (w > maxW) { fs = Math.floor(fs * maxW / w); ctx.font = `bold ${fs}px sans-serif`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(NAMES[c], cx, cy);
  ctx.fillStyle = '#fff'; ctx.fillText(NAMES[c], cx, cy);
}

function movablePawns() {
  if (isOnline() && ACTIVE[currentPlayerIndex] !== net.myColor) return new Set();
  if (!isPilotingPhase || gameOver || currentDiceIndex >= accumulatedDice.length) return new Set();
  return new Set(getAllowedMoves(actor()).map(m => m.pawn));
}

function drawPawns() {
  const hl = hlCache, groups = {}, now = Date.now();
  anims = anims.filter(a => now < a.t0 + a.dur);
  const moving = new Set(anims.map(a => a.p));
  ACTIVE.forEach(c => pawns[c].forEach(p => {
    if (p.pos === DONE || moving.has(p)) return;
    const [gx, gy, k] = cellOf(c, p);
    (groups[k] = groups[k] || []).push({ c, p, gx, gy });
  }));
  Object.entries(groups).forEach(([k, g]) => {
    const n = g.length, barrier = k[0] === 'M' && n >= 2;
    g.forEach((it, i) => {
      const x = (it.gx + .5) * grid + i * 3, y = (it.gy + .5) * grid - i * 3;
      ctx.beginPath(); ctx.arc(x, y, grid * .38, 0, Math.PI * 2);
      ctx.fillStyle = PCOL[it.c]; ctx.fill();
      ctx.lineWidth = barrier ? 5 : 2; ctx.strokeStyle = barrier ? '#000' : '#fff'; ctx.stroke();
      if (hl.has(it.p)) {
        ctx.beginPath(); ctx.arc(x, y, grid * .5, 0, Math.PI * 2);
        ctx.setLineDash([5, 3]); ctx.lineWidth = 3; ctx.strokeStyle = '#ffeb3b'; ctx.stroke(); ctx.setLineDash([]);
      }
      if (i === n - 1) {
        if (n >= 2) {
          ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(n, x, y + 1);
          ctx.fillStyle = '#fff'; ctx.fillText(n, x, y + 1);
        } else if (it.p.inJailOf) {
          ctx.beginPath(); ctx.arc(x, y, grid * .12, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();
        }
      }
    });
  });
}

