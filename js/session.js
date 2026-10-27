// Sauvegarde sur l'appareil, état complet de la partie et reprise après coupure ou rechargement
const MY_PID = (() => { let p = loadJSON('ludo_pid', ''); if (!p) { p = Math.random().toString(36).slice(2, 10); saveJSON('ludo_pid', p); } return p; })();

function getState() {
  return { active: ACTIVE, names: NAMES, custom: customName, version, timer: turnSeconds,
    pawns: PLAYERS.map(c => pawns[c].map(p => [p.pos, p.inJailOf])), cur: currentPlayerIndex, dice: accumulatedDice, di: currentDiceIndex,
    piloting: isPilotingPhase, open: globalOpeningPhase, six: playerHasUnlockedSix, att: currentAttemptInTurn, capt: capturedPawnsThisTurn,
    die: dieShown, over: gameOver, team: teamMode, series, avatars: AVATARS };
}
function setState(s) {
  ACTIVE = s.active; Object.assign(NAMES, s.names);
  Object.keys(customName).forEach(k => delete customName[k]); Object.assign(customName, s.custom);
  version = s.version; turnSeconds = s.timer || 0; teamMode = !!s.team; series = s.series || { n: 0, wins: {} }; setAvatars(s.avatars);
  PLAYERS.forEach((c, i) => pawns[c].forEach((p, j) => { p.pos = s.pawns[i][j][0]; p.inJailOf = s.pawns[i][j][1]; }));
  currentPlayerIndex = s.cur; accumulatedDice = s.dice; currentDiceIndex = s.di; isPilotingPhase = s.piloting; globalOpeningPhase = s.open;
  Object.assign(playerHasUnlockedSix, s.six); currentAttemptInTurn = s.att; capturedPawnsThisTurn = s.capt; dieShown = s.die; gameOver = s.over;
  isRolling = false; busy = false; skipPending = false; anims = []; turnKey = ''; gameStarted = true;
}
function afterResume() {
  document.getElementById('setupModal').style.display = 'none';
  updateUI();
  if (isPilotingPhase && !gameOver) processCurrentDiceInPool();
}
function saveSession() {
  if (!gameStarted || gameOver || simulating) return;
  const s = { mode: net.mode, t: Date.now() };
  if (net.mode === 'local') s.state = getState();
  else if (net.mode === 'host') Object.assign(s, { code: net.code, color: net.myColor, state: getState(), seats: net.conns.map(o => ({ pid: o.pid, color: o.color, spec: o.spec })) });
  else Object.assign(s, { code: net.code, spec: net.spec });
  saveJSON('ludo_save', s);
}
function clearSave() { try { localStorage.removeItem('ludo_save'); } catch (e) {} }
function loadSession() { const s = loadJSON('ludo_save', null); return s && Date.now() - s.t < 12 * 3600e3 ? s : null; }
function showResume() {
  const s = loadSession();
  if (!s) return;
  document.getElementById('resumeBox').style.display = 'block';
  document.getElementById('resumeText').innerText = s.mode === 'local' ? 'Partie locale en cours' : `Partie en ligne en cours (salle ${s.code}${s.spec ? ', spectateur' : ''})`;
}
function forgetSession() { clearSave(); document.getElementById('resumeBox').style.display = 'none'; }
function resumeGame() {
  audioUnlock();
  const s = loadSession();
  if (!s) return;
  net.mode = s.mode;
  if (s.mode === 'local') { setState(s.state); afterResume(); }
  else if (s.mode === 'host') {
    setState(s.state); net.myColor = s.color; net.code = s.code;
    net.conns = (s.seats || []).map(x => Object.assign({ conn: null }, x));
    openHostPeer(true, 0);
  } else { document.getElementById('joinCode').value = s.code; joinRoom(!!s.spec); }
}
