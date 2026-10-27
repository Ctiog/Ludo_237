// Règles : dés, déplacements, captures, barrières, prison, coups autorisés, fin de tour et de partie
// ---------- Dés ----------
function canRollNow() {
  return gameStarted && !gameOver && !isRolling && !isPilotingPhase && (!isOnline() || ACTIVE[currentPlayerIndex] === net.myColor);
}
function updateRollBtn() { document.getElementById('tapHint').style.display = canRollNow() ? 'block' : 'none'; }
function rollDice() {
  if (!canRollNow()) return;
  if (isOnline() && !isHost()) {
    if (rollSent) return;
    rollSent = true; setTimeout(() => { rollSent = false; }, 2500);
    net.conn.send({ t: 'roll' }); return;
  }
  hostRoll();
}
function hostRoll() {
  const r = Math.floor(Math.random() * 6) + 1;
  if (isHost()) broadcast({ t: 'dice', r });
  startRoll(r);
}
function startRoll(r) {
  isRolling = true; rollSent = false; updateRollBtn();
  const anim = setInterval(() => { dieShown = Math.floor(Math.random() * 6) + 1; }, 70);
  setTimeout(() => {
    clearInterval(anim); dieShown = r; isRolling = false;
    const pc = ACTIVE[currentPlayerIndex];
    log(`${NAMES[pc]} a obtenu un ${r}.`);
    accumulatedDice.push(r);
    if (r === 6) {
      playerHasUnlockedSix[pc] = true;
      log(`C'est un 6 ! Relancez le dé.`);
      autoTaunt('six', pc);
      updateUI();
    } else if (globalOpeningPhase && !playerHasUnlockedSix[pc] && currentAttemptInTurn === 0) {
      currentAttemptInTurn = 1;
      log(`2ème lancer de la phase d'ouverture pour ${NAMES[pc]}.`);
      updateUI();
    } else startPilotingPhase();
  }, 450);
}
function startPilotingPhase() {
  isPilotingPhase = true; currentDiceIndex = 0; capturedPawnsThisTurn = [];
  processCurrentDiceInPool();
}
function processCurrentDiceInPool() {
  if (gameOver) return;
  if (currentDiceIndex >= accumulatedDice.length) { finishTurn(); return; }
  const pc = ACTIVE[currentPlayerIndex], d = accumulatedDice[currentDiceIndex];
  updateUI();
  const raw = getValidMoves(pc, d);
  if (raw.length === 0) {
    log(`Aucun coup possible pour le dé [${d}] de ${NAMES[pc]}.`);
    setTimeout(() => { currentDiceIndex++; processCurrentDiceInPool(); }, 1000);
  } else {
    if (getAllowedMoves(pc).length < raw.length)
      log(`⚠️ Certains coups sont interdits : ${version === 2 ? 'capture obligatoire, et ' : ''}un dé ne peut être abandonné que si aucun autre choix n'est possible.`);
    log(`Pilotez un pion avec le dé [${d}].`);
  }
}

// ---------- Règles de déplacement ----------
function getValidMoves(color, steps) {
  const moves = [];
  pawns[color].forEach(p => {
    if (p.pos === DONE || capturedPawnsThisTurn.includes(p.id)) return;
    if (p.inJailOf) { if (steps === 6) moves.push({ pawn: p, type: 'RELEASE_JAIL' }); return; }
    if (p.pos === -1) {
      if (steps === 6 && !isBlockedByEnemyBarrier(START_INDEX[color], color)) moves.push({ pawn: p, type: 'EXIT_BASE' });
      return;
    }
    const t = p.pos + steps;
    if (t <= FINAL && canPawnMovePath(color, p.pos, steps)) moves.push({ pawn: p, type: 'MOVE', targetPos: t });
  });
  return moves;
}
function isBlockedByEnemyBarrier(g, myColor) {
  const at = pawnsAt(g);
  return at.length >= 2 && at[0].c !== myColor;
}
// Une barrière bloque le passage de tous (adversaires ET pions de la même couleur).
// Un pion de la même couleur peut seulement s'y poser (la barrière monte de niveau).
function canPawnMovePath(color, startPos, steps) {
  for (let i = 1; i <= steps; i++) {
    const n = startPos + i;
    if (n > LAST_LOOP) break;
    const at = pawnsAt((START_INDEX[color] + n) % 52);
    if (at.length >= 2 && !(i === steps && at[0].c === color)) return false;
  }
  return true;
}

canvas.addEventListener('click', e => {
  if (!isPilotingPhase || isRolling || gameOver || currentDiceIndex >= accumulatedDice.length) return;
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * canvas.width / rect.width;
  const cy = (e.clientY - rect.top) * canvas.height / rect.height;
  const pc = ACTIVE[currentPlayerIndex];
  if (isOnline() && pc !== net.myColor) return;
  let sel = null, best = 999;
  getAllowedMoves(pc).forEach(m => {
    const c = getPawnCoordinates(pc, m.pawn), d = Math.hypot(c.x - cx, c.y - cy);
    if (d < grid && d < best) { best = d; sel = m; }
  });
  if (sel) sendMove(pc, sel);
});

// Applique un coup (sans dessin). Renvoie true si une capture a eu lieu.
function applyMove(color, move) {
  const p = move.pawn;
  let cap = false;
  if (move.type === 'RELEASE_JAIL') {
    p.inJailOf = null; p.pos = -1;
    log(`${NAMES[color]} a libéré un pion de prison (il retourne dans sa base).`);
  } else {
    if (move.type === 'EXIT_BASE') {
      p.pos = 0; log(`${NAMES[color]} a sorti un pion de sa base.`);
    } else {
      p.pos = move.targetPos;
      if (globalOpeningPhase && p.pos >= entryThreshold(color)) {
        globalOpeningPhase = false;
        log(`🚀 Un pion a franchi l'entrée de l'adversaire : la phase d'ouverture est terminée pour tout le monde.`);
      }
      if (p.pos === FINAL) { p.pos = DONE; log(`🏁 ${NAMES[color]} a amené un pion au centre (${finishedCount(color)}/4).`); }
    }
    if (p.pos >= 0 && p.pos <= LAST_LOOP && checkCapture(color, (START_INDEX[color] + p.pos) % 52)) {
      capturedPawnsThisTurn.push(p.id); cap = true; autoTaunt('capture', color);
      log(`🔒 Ce pion a mangé et est verrouillé pour la suite de cette série de dés.`);
    }
  }
  return cap;
}

function executeMove(color, move) {
  applyMove(color, move);
  drawBoard();
  if (finishedCount(color) === 4) { endGame(color); return; }
  currentDiceIndex++;
  processCurrentDiceInPool();
}

// ---- Coups autorisés : on doit jouer le maximum de dés (et, en version 2, manger si possible)
function snapshot() {
  return { p: PLAYERS.map(c => pawns[c].map(x => [x.pos, x.inJailOf])), cap: capturedPawnsThisTurn.slice(), open: globalOpeningPhase };
}
function restore(s) {
  PLAYERS.forEach((c, i) => pawns[c].forEach((x, j) => { x.pos = s.p[i][j][0]; x.inJailOf = s.p[i][j][1]; }));
  capturedPawnsThisTurn = s.cap.slice(); globalOpeningPhase = s.open;
}
// score = nombre de dés joués × 10 + (capture possible ? 1 : 0) : les dés jouent d'abord, la capture ensuite
function combine(cap, sub) {
  return (1 + Math.floor(sub / 10)) * 10 + (version === 2 && (cap || sub % 10 === 1) ? 1 : 0);
}
function moveKey(m) {
  return m.type + (m.type === 'MOVE' ? m.pawn.pos : m.type === 'RELEASE_JAIL' ? m.pawn.inJailOf : '');
}
function bestScore(color, idx) {
  if (idx >= accumulatedDice.length) return 0;
  const seen = new Set();
  const moves = getValidMoves(color, accumulatedDice[idx]).filter(m => { const k = moveKey(m); if (seen.has(k)) return false; seen.add(k); return true; });
  if (!moves.length) return bestScore(color, idx + 1);
  let best = -1;
  moves.forEach(m => {
    const s = snapshot(), cap = applyMove(color, m), sub = bestScore(color, idx + 1);
    restore(s);
    best = Math.max(best, combine(cap, sub));
  });
  return best;
}
function getAllowedMoves(color) {
  if (currentDiceIndex >= accumulatedDice.length) return [];
  const raw = getValidMoves(color, accumulatedDice[currentDiceIndex]);
  if (raw.length < 2) return raw;
  let scored;
  simulating = true;
  try {
    scored = raw.map(m => {
      const s = snapshot(), cap = applyMove(color, m), sub = bestScore(color, currentDiceIndex + 1);
      restore(s);
      return { m, sc: combine(cap, sub) };
    });
  } finally { simulating = false; }
  const mx = Math.max(...scored.map(x => x.sc));
  return scored.filter(x => x.sc === mx).map(x => x.m);
}

function checkCapture(attacker, g) {
  let hit = false;
  pawnsAt(g).forEach(({ c, p }) => {
    if (c !== attacker) {
      p.pos = -1; p.inJailOf = attacker; hit = true;
      log(`⚔️ ${NAMES[attacker]} a capturé un pion de ${NAMES[c]} (envoyé en prison).`);
    }
  });
  return hit;
}

function finishTurn() {
  currentAttemptInTurn = 0; accumulatedDice = []; isPilotingPhase = false; capturedPawnsThisTurn = [];
  currentPlayerIndex = (currentPlayerIndex + 1) % ACTIVE.length;
  updateRollBtn();
  if (isOnline() && ACTIVE[currentPlayerIndex] === net.myColor && navigator.vibrate) navigator.vibrate(200);
  log(`C'est au tour de ${NAMES[ACTIVE[currentPlayerIndex]]}.`);
  updateUI();
}

function endGame(color) {
  gameOver = true; sendStat('terminée', NAMES[color]);
  log(`🏆 ${NAMES[color]} a gagné la partie !`);
  document.getElementById('winText').innerHTML = `Le joueur <b style="color:${PCOL[color]}">${esc(NAMES[color])}</b> remporte la partie !`;
  document.getElementById('winModal').style.display = 'flex';
  updateUI();
}

