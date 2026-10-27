// Panneau d'informations, série de dés et journal
// ---------- Interface ----------
function updateUI() {
  const pc = ACTIVE[currentPlayerIndex];
  document.getElementById('turnDot').style.backgroundColor = PCOL[pc];
  document.getElementById('turnText').innerText = NAMES[pc];
  const info = [];
  if (gameStarted) {
    info.push(version === 2 ? 'Version 2 : capture obligatoire' : 'Version 1 : classique');
    if (teamMode) info.push('Équipes : ' + [0, 1].map(k => ACTIVE.filter(c => TEAM[c] === k).map(c => NAMES[c]).join('+')).join(' contre '));
    if (series.n) info.push(`Série (meilleur de ${series.n}) : ` + scoreText());
    if (globalOpeningPhase) info.push(playerHasUnlockedSix[pc] ? 'Ouverture : 1 lancer' : 'Ouverture : 2 lancers');
    if (isOnline() && net.myColor) info.push('Vous jouez : ' + NAMES[net.myColor]);
    else if (isOnline() && net.spec) info.push('👁 Spectateur');
  }
  document.getElementById('infoLine').innerText = info.join(' · ');
  updateDicePoolUI(); updateRollBtn(); hlCache = movablePawns(); drawBoard(); saveSession();
}
function updateDicePoolUI() {
  const pool = document.getElementById('dicePool');
  pool.innerHTML = '';
  accumulatedDice.forEach((val, idx) => {
    const chip = document.createElement('div');
    let s = '';
    if (isPilotingPhase) s = idx < currentDiceIndex ? ' used' : (idx === currentDiceIndex ? ' active' : '');
    chip.className = 'dice-chip' + s;
    chip.innerText = val;
    pool.appendChild(chip);
  });
}
function log(msg) {
  if (simulating) return;
  document.getElementById('statusLine').innerText = msg;
  const box = document.getElementById('gameLog');
  const e = document.createElement('div');
  e.className = 'log-entry'; e.innerText = '> ' + msg;
  box.insertBefore(e, box.firstChild);
}

