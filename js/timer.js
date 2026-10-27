// Minuteur de tour : chaque appareil affiche le compte à rebours, l'hôte (ou le jeu local) joue automatiquement à zéro
let lastTick = 99;
const isMyInput = () => !isOnline() || ACTIVE[currentPlayerIndex] === net.myColor;
function awaitingInput() {
  return gameStarted && !gameOver && !isRolling && !busy && !skipPending && (!isPilotingPhase || currentDiceIndex < accumulatedDice.length);
}
function timerTick() {
  const el = document.getElementById('timerText');
  if (!turnSeconds || !awaitingInput()) { turnKey = ''; el.innerText = ''; return; }
  const k = [currentPlayerIndex, accumulatedDice.length, currentDiceIndex, isPilotingPhase ? 1 : 0].join('|');
  if (k !== turnKey) { turnKey = k; turnDeadline = Date.now() + turnSeconds * 1000; lastTick = 99; }
  const left = Math.ceil((turnDeadline - Date.now()) / 1000);
  el.innerText = '⏱ ' + Math.max(0, left) + ' s'; el.className = left <= 10 ? 'late' : '';
  if (left <= 5 && left > 0 && left !== lastTick) { lastTick = left; if (isMyInput()) sfx('tick'); }
  if (left <= 0) autoPlay();
}
function autoPlay() {
  if (isOnline() && !isHost()) return;
  turnDeadline = Date.now() + turnSeconds * 1000;
  const pc = actor();
  log(`⏱ Temps écoulé : ${NAMES[pc]} est joué automatiquement.`);
  if (!isPilotingPhase) { hostRoll(); return; }
  const mv = getAllowedMoves(pc);
  if (mv.length) sendMove(pc, mv[Math.floor(Math.random() * mv.length)]);
}
