// Score de série (meilleur de 3 ou 5), libellés d'équipe et revanche
let seriesOver = false;
const winKey = c => teamMode ? 'T' + TEAM[c] : c;
const teamLabel = c => teamMode ? NAMES[c] + ' + ' + NAMES[partnerOf(c)] : NAMES[c];
function scoreText() {
  const items = teamMode ? [0, 1].map(k => ['T' + k, ACTIVE.filter(c => TEAM[c] === k).map(c => NAMES[c]).join('+')]) : ACTIVE.map(c => [c, NAMES[c]]);
  return items.map(([k, n]) => `${n} ${series.wins[k] || 0}`).join(' · ');
}
const scoreHtml = () => series.n ? `<br><small>Série (meilleur de ${series.n}) : ${esc(scoreText())}</small>` : '';
function askRematch() {
  if (isOnline() && !isHost()) { net.conn.send({ t: 'rematch' }); document.getElementById('rematchBtn').innerText = '⏳ Demande envoyée…'; return; }
  doRematch();
}
function doRematch() {   // le joueur suivant le vainqueur commence
  const first = (currentPlayerIndex + 1) % ACTIVE.length, reset = seriesOver || !series.n;
  if (isHost()) broadcast({ t: 'rematchgo', first, reset });
  rematch(first, reset);
}
function rematch(first, reset) {
  PLAYERS.forEach(c => pawns[c].forEach(p => { p.pos = -1; p.inJailOf = null; }));
  PLAYERS.forEach(c => { playerHasUnlockedSix[c] = false; });
  globalOpeningPhase = true; gameOver = false; currentAttemptInTurn = 0; accumulatedDice = []; currentDiceIndex = 0;
  isPilotingPhase = false; capturedPawnsThisTurn = []; isRolling = false; busy = false; skipPending = false; anims = []; dieShown = null; bubbles = [];
  if (reset) series.wins = {};
  seriesOver = false; currentPlayerIndex = first; gameStartTime = Date.now();
  document.getElementById('winModal').style.display = 'none';
  log(`🔁 Nouvelle manche ! ${NAMES[ACTIVE[first]]} commence.`);
  updateRollBtn(); updateUI(); sendStat('démarrée', '');
}
