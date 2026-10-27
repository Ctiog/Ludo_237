// Démarrage de partie et jeu en ligne (PeerJS : l'hôte arbitre, les invités envoient leurs actions)
// ---------- Démarrage et jeu en ligne (PeerJS, connexion directe entre joueurs) ----------
function modeChanged() {
  const m = document.querySelector('input[name=mode]:checked').value;
  document.getElementById('joinPart').style.display = m === 'join' ? 'block' : 'none';
  document.getElementById('configPart').style.display = m === 'join' ? 'none' : 'block';
  document.getElementById('setupBtn').innerText = m === 'local' ? 'Commencer la partie' : m === 'host' ? 'Créer la salle' : 'Rejoindre';
}
function startGame() {
  net.mode = document.querySelector('input[name=mode]:checked').value;
  if (net.mode !== 'local' && typeof Peer === 'undefined') { alert("La bibliothèque de jeu en ligne n'a pas pu se charger (connexion internet ?)."); return; }
  if (net.mode === 'join') return joinRoom();
  version = +document.querySelector('input[name=ver]:checked').value;
  ACTIVE = PLAYERS.filter(c => document.getElementById('act_' + c).checked);
  if (ACTIVE.length < 2) { alert('Il faut au moins 2 joueurs.'); return; }
  if (ACTIVE.length === 2 && PLAYERS.indexOf(ACTIVE[1]) - PLAYERS.indexOf(ACTIVE[0]) !== 2) { alert('À 2 joueurs, seules les couleurs opposées sont possibles : Rouge–Jaune ou Vert–Bleu.'); return; }
  ACTIVE.forEach(c => { const v = document.getElementById('name_' + c).value.trim(); if (v) { NAMES[c] = v; customName[c] = true; } });
  if (net.mode === 'host') return hostRoom();
  beginGame();
}
function beginGame() {
  gameStarted = true; currentPlayerIndex = 0; gameStartTime = Date.now();
  document.getElementById('setupModal').style.display = 'none';
  document.getElementById('gameLog').innerHTML = '';
  log(`La partie commence (${version === 2 ? 'version 2 : capture obligatoire' : 'version 1 : classique'}) ! ${NAMES[ACTIVE[0]]} débute.`);
  updateRollBtn(); updateUI(); sendStat('démarrée', '');
}
function broadcast(m) { net.conns.forEach(o => { try { o.conn.send(m); } catch (e) {} }); }
function lobbyMsg(h) { const l = document.getElementById('lobby'); l.style.display = 'block'; l.innerHTML = h; }

function hostRoom() {
  net.myColor = ACTIVE[0]; net.conns = [];
  net.code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  document.getElementById('setupBtn').disabled = true;
  lobbyMsg('Connexion au serveur…');
  net.peer = new Peer('ludo-' + net.code);
  net.peer.on('open', showLobby);
  net.peer.on('error', e => { lobbyMsg('Erreur réseau : ' + e.type + ' (réessayez)'); document.getElementById('setupBtn').disabled = false; });
  net.peer.on('connection', conn => {
    conn.on('data', m => onHostMsg(conn, m));
    conn.on('close', () => { const o = net.conns.find(x => x.conn === conn); if (o) log(`⚠️ ${NAMES[o.color]} s'est déconnecté.`); });
  });
}
function showLobby() {
  const taken = net.conns.map(x => x.color);
  lobbyMsg(`<h3>Code de la salle : <span style="font-size:1.6rem;letter-spacing:3px;color:#a6e3a1">${net.code}</span></h3>
    <p>Donnez ce code à vos amis (ils ouvrent le même lien du jeu et choisissent « rejoindre »).<br>Places : ${ACTIVE.slice(1).map(c => `${esc(NAMES[c])} ${taken.includes(c) ? '✅' : '⏳'}`).join(' · ')}</p>
    <p>La partie démarre automatiquement quand tout le monde est connecté.</p>`);
}
function onHostMsg(conn, m) {
  const o = net.conns.find(x => x.conn === conn);
  if (m.t === 'join') {
    if (gameStarted || o) return;
    const taken = net.conns.map(x => x.color);
    const seat = ACTIVE.slice(1).find(c => !taken.includes(c));
    if (!seat) { conn.send({ t: 'full' }); return; }
    if (m.name) { NAMES[seat] = String(m.name).slice(0, 15); customName[seat] = true; }
    net.conns.push({ conn, color: seat });
    conn.send({ t: 'seat', color: seat });
    showLobby();
    if (net.conns.length === ACTIVE.length - 1) {
      broadcast({ t: 'start', active: ACTIVE, names: NAMES, custom: customName, version });
      beginGame();
    }
  } else if (o && m.t === 'chat') {
    if (Date.now() - (o.last || 0) > 700) { o.last = Date.now(); relayChat(o.color, m.x); }
  } else if (o && gameStarted && o.color === ACTIVE[currentPlayerIndex]) {
    if (m.t === 'roll' && !isRolling && !isPilotingPhase && !gameOver) hostRoll();
    else if (m.t === 'mv' && isPilotingPhase && getAllowedMoves(o.color).some(x => x.pawn.id === m.pid && x.type === m.mt)) {
      broadcast(m); applyNetAction(m);
    }
  }
}
function joinRoom() {
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  if (!code) { alert('Entrez le code de la salle.'); return; }
  const btn = document.getElementById('setupBtn');
  btn.disabled = true; lobbyMsg('Connexion…');
  net.peer = new Peer();
  net.peer.on('open', () => {
    const conn = net.conn = net.peer.connect('ludo-' + code, { reliable: true });
    conn.on('open', () => conn.send({ t: 'join', name: document.getElementById('joinName').value.trim() }));
    conn.on('data', onGuestMsg);
    conn.on('close', () => log("⚠️ Connexion perdue avec l'hôte."));
  });
  net.peer.on('error', e => { lobbyMsg(e.type === 'peer-unavailable' ? 'Salle introuvable : vérifiez le code.' : 'Erreur réseau : ' + e.type); btn.disabled = false; });
}
function onGuestMsg(m) {
  if (m.t === 'seat') { net.myColor = m.color; lobbyMsg(`Connecté ! Vous jouez ${esc(NAMES[m.color])}. En attente des autres joueurs…`); }
  else if (m.t === 'full') { lobbyMsg('Cette salle est complète.'); document.getElementById('setupBtn').disabled = false; }
  else if (m.t === 'start') {
    ACTIVE = m.active; Object.assign(NAMES, m.names); Object.assign(customName, m.custom); version = m.version;
    beginGame();
  } else if (m.t === 'chat') showBubble(m.c, m.x);
  else applyNetAction(m);
}
function sendMove(pc, sel) {
  if (!isOnline()) { executeMove(pc, sel); return; }
  const m = { t: 'mv', pid: sel.pawn.id, mt: sel.type };
  if (isHost()) { broadcast(m); executeMove(pc, sel); } else net.conn.send(m);
}
// Chaque appareil applique les mêmes actions dans le même ordre : les parties restent identiques.
function applyNetAction(m) {
  m.n = (m.n || 0) + 1;
  if (m.n > 100) return;
  if (m.t === 'dice') {
    if (isRolling || isPilotingPhase) { setTimeout(() => applyNetAction(m), 100); return; }
    startRoll(m.r);
  } else if (m.t === 'mv') {
    if (!isPilotingPhase || isRolling || currentDiceIndex >= accumulatedDice.length) { setTimeout(() => applyNetAction(m), 100); return; }
    const pc = ACTIVE[currentPlayerIndex];
    const mv = getAllowedMoves(pc).find(x => x.pawn.id === m.pid && x.type === m.mt);
    if (mv) executeMove(pc, mv);
  }
}

