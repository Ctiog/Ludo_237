// Animation des pions : avance case par case, sortie de base, envoi en prison
const STEP_MS = 110;
const centerOf = (c, pos, jail, id) => { const [gx, gy] = cellOf(c, { pos, inJailOf: jail, id }); return { x: (gx + .5) * grid, y: (gy + .5) * grid }; };

// Compare l'état avant/après un coup, lance les animations et les sons, renvoie la durée (ms)
function animateChanges(before) {
  let maxD = 0, caught = false, popped = false, done = false;
  PLAYERS.forEach((c, i) => pawns[c].forEach((p, j) => {
    const [pos0, jail0] = before[i][j];
    if (pos0 === p.pos && jail0 === p.inJailOf) return;
    let pts = [], dur;
    if (pos0 >= 0 && !jail0 && p.pos > pos0) {
      for (let q = pos0; q <= Math.min(p.pos, FINAL); q++) pts.push(centerOf(c, q, null, p.id));
      dur = (pts.length - 1) * STEP_MS;
      for (let k = 1; k < pts.length; k++) setTimeout(() => sfx('step'), k * STEP_MS);
      if (p.pos === DONE) done = true;
    } else {
      pts = [centerOf(c, pos0, jail0, p.id), centerOf(c, p.pos === DONE ? FINAL : p.pos, p.inJailOf, p.id)];
      dur = 380;
      if (p.inJailOf) caught = true; else popped = true;
    }
    anims.push({ c, p, pts, t0: Date.now(), dur }); maxD = Math.max(maxD, dur);
  }));
  if (caught) setTimeout(() => sfx('capture'), 150); else if (popped) sfx('pop');
  if (done) setTimeout(() => sfx('finish'), maxD);
  return maxD;
}
function drawMovingPawns() {
  const now = Date.now();
  anims.forEach(a => {
    const u = Math.min(1, Math.max(0, (now - a.t0) / a.dur)), n = a.pts.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
    const A = a.pts[i], B = a.pts[i + 1], x = A.x + (B.x - A.x) * k, y = A.y + (B.y - A.y) * k - Math.sin(Math.PI * k) * 7;
    ctx.beginPath(); ctx.arc(x, y, grid * .38, 0, Math.PI * 2); ctx.fillStyle = PCOL[a.c]; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  });
}
