// Démarrage de partie et jeu en ligne (PeerJS : l'hôte arbitre ; reconnexion et spectateurs)
function modeChanged() {
  const m = document.querySelector('input[name=mode]:checked').value;
  document.getElementById('joinPart').style.display = m === 'join' ? 'block' : 'none';
  document.getElementById('configPart').style.display = m === 'join' ? 'none' : 'block';
  document.getElementById('timerSel').value = m === 'host' ? '60' : '0';
  document.getElementById('setupBtn').innerText = m === 'local' ? 'Commencer la partie' : m === 'host' ? 'Créer la salle' : 'Rejoindre';
}
const pseudoVal = () => document.getElementById('pseudo').value.trim().slice(0, 15);
function startGame() {
  audioUnlock();
  net.mode = document.querySelector('input[name=mode]:checked').value;
  if (net.mode !== 'local' && typeof Peer === 'undefined') { alert("La bibliothèque de jeu en ligne n'a pas pu se charger (connexion internet ?)."); return; }
  if (net.mode === 'join') return joinRoom();
  version = +document.querySelector('input[name=ver]:checked').value;
  ACTIVE = PLAYERS.filter(c => document.getElementById('act_' + c).checked);
  if (ACTIVE.length < 2) { alert('Il faut au moins 2 joueurs.'); return; }
  if (ACTIVE.length === 2 && PLAYERS.indexOf(ACTIVE[1]) - PLAYERS.indexOf(ACTIVE[0]) !== 2) { alert('À 2 joueurs, seules les couleurs opposées sont possibles : Rouge–Jaune ou Vert–Bleu.'); return; }
  turnSeconds = +document.getElementById('timerSel').value;
  teamMode = document.getElementById('teamChk').checked;
  if (teamMode && ACTIVE.length !== 4) { alert('Le mode équipes demande 4 joueurs.'); return; }
  series = { n: +document.getElementById('serSel').value, wins: {} };
  setAvatars({}); if (myAvatar()) setAvatar(ACTIVE[0], myAvatar());
  ACTIVE.forEach(c => { const v = document.getElementById('name_' + c).value.trim(); if (v) { NAMES[c] = v; customName[c] = true; } });
  const ps = pseudoVal();
  if (ps && !document.getElementById('name_' + ACTIVE[0]).value.trim()) { NAMES[ACTIVE[0]] = ps; customName[ACTIVE[0]] = true; }
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
function broadcast(m) { net.conns.forEach(o => { try { if (o.conn) o.conn.send(m); } catch (e) {} }); }
function lobbyMsg(h) { const l = document.getElementById('lobby'); l.style.display = 'block'; l.innerHTML = h; }
function banner(t) { const b = document.getElementById('netBanner'); b.innerText = t || ''; b.style.display = t ? 'block' : 'none'; }
const players = () => net.conns.filter(x => !x.spec);

// ----- Hôte -----
function hostRoom() {
  net.myColor = ACTIVE[0]; net.conns = [];
  net.code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  document.getElementById('setupBtn').disabled = true;
  openHostPeer(false, 0);
}
function openHostPeer(resume, tries) {
  lobbyMsg(resume ? 'Réouverture de la salle…' : 'Connexion au serveur…');
  try { if (net.peer) net.peer.destroy(); } catch (e) {}
  net.peer = new Peer('ludo-' + net.code);
  net.peer.on('open', () => { if (resume) { afterResume(); log('🔄 Salle rouverte : les joueurs vont se reconnecter.'); } else showLobby(); });
  net.peer.on('disconnected', () => { try { net.peer.reconnect(); } catch (e) {} });
  net.peer.on('error', e => {
    if (resume && e.type === 'unavailable-id' && tries < 10) { setTimeout(() => openHostPeer(true, tries + 1), 3000); return; }
    lobbyMsg('Erreur réseau : ' + e.type + ' (réessayez)'); document.getElementById('setupBtn').disabled = false;
  });
  net.peer.on('connection', conn => {
    conn.on('data', m => onHostMsg(conn, m));
    conn.on('close', () => {
      const o = net.conns.find(x => x.conn === conn);
      if (o) { o.conn = null; if (o.vid) { o.vid = null; pushVoiceList(); } if (gameStarted) log(`⚠️ ${o.spec ? 'Un spectateur' : NAMES[o.color]} s'est déconnecté (il peut revenir avec le même code).`); }
    });
  });
}
function showLobby() {
  const taken = players().filter(x => x.conn).map(x => x.color), nSpec = net.conns.filter(x => x.spec && x.conn).length;
  lobbyMsg(`<h3>Code de la salle : <span style="font-size:1.6rem;letter-spacing:3px;color:#a6e3a1">${net.code}</span></h3>
    <p>Donnez ce code à vos amis (ils ouvrent le même lien du jeu et choisissent « rejoindre »).<br>Places : ${ACTIVE.slice(1).map(c => `${esc(NAMES[c])} ${taken.includes(c) ? '✅' : '⏳'}`).join(' · ')}${nSpec ? ` · 👁 ${nSpec} spectateur(s)` : ''}</p>
    <p>La partie démarre automatiquement quand tout le monde est connecté.</p>`);
}
function sendSync(conn) {  // attend un moment calme (ni dé en cours, ni pion en mouvement) pour envoyer l'état complet
  if (isRolling || busy) { setTimeout(() => sendSync(conn), 150); return; }
  try { conn.send({ t: 'sync', s: getState() }); } catch (e) {}
}
function onHostMsg(conn, m) {
  let o = net.conns.find(x => x.conn === conn);
  if (m.t === 'join') {
    if (o) return;
    const back = m.pid && net.conns.find(x => x.pid === m.pid);   // joueur ou spectateur déjà connu : il reprend sa place
    if (back) {
      back.conn = conn; back.last = 0;
      conn.send(back.spec ? { t: 'spec' } : { t: 'seat', color: back.color });
      if (gameStarted) { sendSync(conn); log(`✅ ${back.spec ? 'Un spectateur est' : NAMES[back.color] + ' est'} de retour.`); } else showLobby();
      return;
    }
    if (m.spec) {
      net.conns.push({ conn, color: null, spec: true, pid: m.pid });
      conn.send({ t: 'spec' });
      if (gameStarted) sendSync(conn); else showLobby();
      return;
    }
    const seat = gameStarted ? null : ACTIVE.slice(1).find(c => !players().some(x => x.color === c));
    if (!seat) { conn.send({ t: 'full' }); return; }
    if (typeof m.avatar === 'string' && m.avatar.length < 40000) setAvatar(seat, m.avatar);
    if (m.name) { NAMES[seat] = String(m.name).slice(0, 15); customName[seat] = true; }
    net.conns.push({ conn, color: seat, pid: m.pid });
    conn.send({ t: 'seat', color: seat });
    showLobby();
    if (players().length === ACTIVE.length - 1) {
      broadcast({ t: 'start', active: ACTIVE, names: NAMES, custom: customName, version, timer: turnSeconds, team: teamMode, series, avatars: AVATARS });
      beginGame();
    }
  } else if (o && o.color && m.t === 'chat') {
    if (Date.now() - (o.last || 0) > 700) { o.last = Date.now(); relayChat(o.color, m.x); }
  } else if (o && o.color && (m.t === 'voice' || m.t === 'voiceoff')) {
    o.vid = m.t === 'voice' ? String(m.id) : null; pushVoiceList();
  } else if (o && o.color && m.t === 'rematch' && gameOver) {
    doRematch();
  } else if (o && gameStarted && o.color === ACTIVE[currentPlayerIndex]) {
    if (m.t === 'roll' && !isRolling && !isPilotingPhase && !gameOver) hostRoll();
    else if (m.t === 'mv' && isPilotingPhase && !busy && getAllowedMoves(actor()).some(x => x.pawn.id === m.pid && x.type === m.mt)) {
      broadcast(m); applyNetAction(m);
    }
  }
}

// ----- Invité / spectateur -----
function joinRoom(spec) {
  net.code = document.getElementById('joinCode').value.trim().toUpperCase();
  if (!net.code) { alert('Entrez le code de la salle.'); return; }
  net.spec = typeof spec === 'boolean' ? spec : document.getElementById('joinSpec').checked;
  document.getElementById('setupBtn').disabled = true; lobbyMsg('Connexion…'); audioUnlock();
  connectGuest();
}
function connectGuest() {
  net.peer = new Peer();
  net.peer.on('open', () => {
    const conn = net.conn = net.peer.connect('ludo-' + net.code, { reliable: true });
    conn.on('open', () => conn.send({ t: 'join', name: pseudoVal(), pid: MY_PID, spec: net.spec, avatar: myAvatar() }));
    conn.on('data', onGuestMsg);
    conn.on('close', onGuestLost);
  });
  net.peer.on('error', e => {
    if (gameStarted || net.reconnecting) { onGuestLost(); return; }
    lobbyMsg(e.type === 'peer-unavailable' ? 'Salle introuvable : vérifiez le code.' : 'Erreur réseau : ' + e.type);
    document.getElementById('setupBtn').disabled = false;
  });
}
function onGuestLost() {   // coupure : on retente toutes les 3 s, l'hôte renvoie alors l'état de la partie
  if (!net.code || (net.reconnecting && !gameStarted)) return;
  if (net.retryTimer) return;
  banner('📡 Connexion perdue… reconnexion en cours');
  net.retryTimer = setTimeout(() => { net.retryTimer = null; try { net.peer.destroy(); } catch (e) {} connectGuest(); }, 3000);
}
function onGuestMsg(m) {
  if (m.t === 'seat') { net.myColor = m.color; if (voice.state) { hookVoice(); announceVoice(true); } lobbyMsg(`Connecté ! Vous jouez ${esc(NAMES[m.color])}. En attente des autres joueurs…`); }
  else if (m.t === 'spec') { net.myColor = null; net.spec = true; lobbyMsg('👁 Vous regardez la partie en spectateur.'); }
  else if (m.t === 'full') { net.code = ''; banner(''); lobbyMsg('Cette salle est complète ou la partie est déjà commencée.'); document.getElementById('setupBtn').disabled = false; }
  else if (m.t === 'start') {
    ACTIVE = m.active; Object.assign(NAMES, m.names); Object.assign(customName, m.custom); version = m.version; turnSeconds = m.timer || 0; teamMode = !!m.team; series = m.series || { n: 0, wins: {} }; setAvatars(m.avatars);
    beginGame();
  } else if (m.t === 'sync') { setState(m.s); banner(''); afterResume(); }
  else if (m.t === 'rematchgo') rematch(m.first, m.reset);
  else if (m.t === 'voicelist') onVoiceList(m.ids);
  else if (m.t === 'chat') showBubble(m.c, m.x);
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
    if (!isPilotingPhase || isRolling || busy || currentDiceIndex >= accumulatedDice.length) { setTimeout(() => applyNetAction(m), 100); return; }
    const pc = actor();
    const mv = getAllowedMoves(pc).find(x => x.pawn.id === m.pid && x.type === m.mt);
    if (mv) executeMove(pc, mv);
  }
}
