/* js/compat.js */
// Compatibilité avec les anciens navigateurs (Android 5 à 8, WebView non mis à jour)
if (!Object.fromEntries) Object.fromEntries = function (it) { var o = {}; Array.from(it).forEach(function (kv) { o[kv[0]] = kv[1]; }); return o; };
if (!Object.entries) Object.entries = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }); };
if (!Object.values) Object.values = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
if (!Array.prototype.includes) Array.prototype.includes = function (v) { return this.indexOf(v) !== -1; };
if (!String.prototype.padStart) String.prototype.padStart = function (n, s) { var t = String(this); s = s || ' '; while (t.length < n) t = s + t; return t; };
if (window.Element) {
  var EP = Element.prototype;
  if (!EP.matches) EP.matches = EP.msMatchesSelector || EP.webkitMatchesSelector;
  if (!EP.closest) EP.closest = function (sel) { var e = this; while (e && e.nodeType === 1) { if (e.matches(sel)) return e; e = e.parentNode; } return null; };
  if (!EP.remove) EP.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
}
if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;

/* js/config.js */
// Configuration, état du jeu, constantes et fonctions utilitaires du plateau
const canvas = document.getElementById('ludoBoard');
let ctx = canvas.getContext('2d');
const size = 600, grid = size / 15;

const PLAYERS = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
const NAMES = { RED: 'Rouge', GREEN: 'Vert', YELLOW: 'Jaune', BLUE: 'Bleu' };
const PCOL = { RED: '#e74c3c', GREEN: '#2ecc71', YELLOW: '#f1c40f', BLUE: '#3498db' };
const PURPLE = '#9b59b6', BORDER = '#2c3e50';

// Positions d'un pion : -1 = base/prison, 0..50 = boucle (51 cases),
// 51..55 = couloir final (5 cases), 56 = arrivé au centre.
const LAST_LOOP = 50, FINAL = 55, DONE = 56;

let currentPlayerIndex = 0, isRolling = false, globalOpeningPhase = true, gameOver = false;
let playerHasUnlockedSix = { RED: false, GREEN: false, YELLOW: false, BLUE: false };
let currentAttemptInTurn = 0, accumulatedDice = [], currentDiceIndex = 0, isPilotingPhase = false;
let capturedPawnsThisTurn = [];
let gameStarted = false, version = 1, simulating = false;
// Historique des parties : collez ici l'adresse de votre Google Sheet (voir les explications). Vide = désactivé.
const STATS_URL = 'https://script.google.com/macros/s/AKfycbxa4e47FwcsYbdfSmCjes_v_ZbtLlkjPOTNTmkczx8lgbHESmiPtgxYFtGqCQfMkqsF/exec';
let gameStartTime = 0;
function sendStat(etat, gagnant) {
  if (!STATS_URL || (isOnline() && !isHost())) return;
  try {
    fetch(STATS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({
      etat, gagnant, mode: isOnline() ? 'en ligne' : 'local', version, joueurs: ACTIVE.map(c => NAMES[c]).join(', '),
      duree: etat === 'terminée' ? Math.round((Date.now() - gameStartTime) / 60000) : ''
    }) });
  } catch (e) {}
}
let ACTIVE = PLAYERS.slice();
let hlCache = new Set(), dieShown = null, rollSent = false;
let busy = false, skipPending = false, turnSeconds = 0, turnDeadline = 0, turnKey = '', anims = [];
const customName = {};
const net = { mode: 'local', peer: null, conn: null, conns: [], myColor: null, code: '', spec: false, reconnecting: false };
const isOnline = () => net.mode !== 'local';
const isHost = () => net.mode === 'host';
const esc = t => t.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const pawns = {};
PLAYERS.forEach(c => pawns[c] = [0, 1, 2, 3].map(id => ({ id, pos: -1, inJailOf: null })));

const MAIN_PATH = [
  [1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],
  [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],
  [14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],
  [6,14],[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6]
];
const START_INDEX = { RED: 0, GREEN: 13, YELLOW: 26, BLUE: 39 };
const HOME_PATHS = {
  RED:    [[1,7],[2,7],[3,7],[4,7],[5,7]],
  GREEN:  [[7,1],[7,2],[7,3],[7,4],[7,5]],
  YELLOW: [[13,7],[12,7],[11,7],[10,7],[9,7]],
  BLUE:   [[7,13],[7,12],[7,11],[7,10],[7,9]]
};
const ORIGIN = { RED: [0,0], GREEN: [9,0], YELLOW: [9,9], BLUE: [0,9] };
const othersOf = c => PLAYERS.filter(x => x !== c);
const colorFor = c => PCOL[c];
// L'ouverture se termine quand un pion franchit l'entrée de la base suivante (occupée ou non) : toujours 13 cases après le départ
const entryThreshold = () => 13;

// Case (grille) + clé de regroupement d'un pion
function cellOf(color, p) {
  if (p.inJailOf) {
    const a = p.inJailOf, [ox, oy] = ORIGIN[a];
    return [ox + 1 + othersOf(a).indexOf(color), oy + 4, 'J_' + a + '_' + color];
  }
  if (p.pos === -1) {
    const [ox, oy] = ORIGIN[color];
    return [ox + 2 + (p.id % 2), oy + 2 + (p.id >> 1), 'B_' + color + p.id];
  }
  if (p.pos <= LAST_LOOP) {
    const g = (START_INDEX[color] + p.pos) % 52;
    return [MAIN_PATH[g][0], MAIN_PATH[g][1], 'M_' + g];
  }
  const h = HOME_PATHS[color][p.pos - 51];
  return [h[0], h[1], 'H_' + color + p.pos];
}
function getPawnCoordinates(color, p) {
  const [gx, gy] = cellOf(color, p);
  return { x: (gx + .5) * grid, y: (gy + .5) * grid };
}
function pawnsAt(g) {
  const r = [];
  PLAYERS.forEach(c => pawns[c].forEach(p => {
    if (!p.inJailOf && p.pos >= 0 && p.pos <= LAST_LOOP && (START_INDEX[c] + p.pos) % 52 === g) r.push({ c, p });
  }));
  return r;
}
const finishedCount = c => pawns[c].filter(p => p.pos === DONE).length;
// Mode équipes (2 contre 2) : Rouge + Jaune contre Vert + Bleu
let teamMode = false, series = { n: 0, wins: {} };
const TEAM = { RED: 0, YELLOW: 0, GREEN: 1, BLUE: 1 };
const partnerOf = c => PLAYERS[(PLAYERS.indexOf(c) + 2) % 4];
const sameTeam = (a, b) => teamMode && TEAM[a] === TEAM[b];
const teamWon = c => finishedCount(c) === 4 && (!teamMode || finishedCount(partnerOf(c)) === 4);
// Pions que le joueur du tour déplace : les siens, ou ceux de son partenaire s'il a déjà tout terminé
const actor = () => { const c = ACTIVE[currentPlayerIndex]; return teamMode && finishedCount(c) === 4 ? partnerOf(c) : c; };
const AVATARS = {}, AV_IMG = {};


// Appareils modestes : détectés automatiquement (réglable dans le panneau 💬 : « Mode économie »)
const LOW_END = !!((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 2) || /Android [4-8][.;]/.test(navigator.userAgent || ''));

// Réseau : serveurs STUN gratuits + serveur de relais TURN facultatif (utile sur les réseaux mobiles stricts, voir README)
const TURN_URL = '';   // ex. https://MONAPP.metered.live/api/v1/turn/credentials?apiKey=XXXX
let ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
let iceReady = !TURN_URL;
const peerOpts = () => ({ config: { iceServers: ICE }, debug: 0 });
function loadIce(done) {
  let finished = false;
  const end = () => { if (!finished) { finished = true; iceReady = true; done(); } };
  setTimeout(end, 4000);
  fetch(TURN_URL).then(r => r.json()).then(l => { if (Array.isArray(l)) ICE = ICE.concat(l); }).catch(() => {}).then(end);
}

/* js/board.js */
// Dessin du plateau, du dé central, du lion et des pions (canvas)
// ---------- Dessin ----------
function cell(gx, gy, fill) {
  ctx.fillStyle = fill; ctx.fillRect(gx * grid, gy * grid, grid, grid);
  ctx.strokeStyle = BORDER; ctx.lineWidth = 1; ctx.strokeRect(gx * grid, gy * grid, grid, grid);
}
let staticCv = null, staticDirty = true;
function buildStatic() {   // le fond du plateau (cases, bases, noms) est dessiné une seule fois puis recopié
  if (!staticCv) { staticCv = document.createElement('canvas'); staticCv.width = size; staticCv.height = size; }
  const main = ctx;
  ctx = staticCv.getContext('2d');
  try { drawStatic(); } finally { ctx = main; }
  staticDirty = false;
}
function drawStatic() {
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

  const starts = {};
  PLAYERS.forEach(c => { starts[START_INDEX[c]] = PCOL[c] + '55'; });
  MAIN_PATH.forEach(([gx, gy], i) => {
    cell(gx, gy, '#fff');
    if (starts[i]) { ctx.fillStyle = starts[i]; ctx.fillRect(gx * grid, gy * grid, grid, grid); ctx.strokeRect(gx * grid, gy * grid, grid, grid); }
  });
  PLAYERS.forEach(c => HOME_PATHS[c].forEach(([gx, gy]) => cell(gx, gy, colorFor(c))));

  // Centre lila + couronne + pions arrivés
  ctx.fillStyle = PURPLE; ctx.fillRect(6 * grid, 6 * grid, 3 * grid, 3 * grid);
  ctx.strokeStyle = BORDER; ctx.strokeRect(6 * grid, 6 * grid, 3 * grid, 3 * grid);
}

function drawBoard() {
  if (staticDirty || !staticCv) buildStatic();
  ctx.drawImage(staticCv, 0, 0);
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
  ctx.rotate(prefs.lite ? 0 : Math.sin(Date.now() / 250) * 0.45);
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


/* js/ui.js */
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


/* js/rules.js */
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
  isRolling = true; rollSent = false; updateRollBtn(); sfx('roll');
  const anim = setInterval(() => { dieShown = Math.floor(Math.random() * 6) + 1; }, 70);
  setTimeout(() => {
    clearInterval(anim); dieShown = r; isRolling = false;
    const pc = ACTIVE[currentPlayerIndex];
    log(`${NAMES[pc]} a obtenu un ${r}.`);
    accumulatedDice.push(r);
    if (r === 6) {
      playerHasUnlockedSix[pc] = true;
      log(`C'est un 6 ! Relancez le dé.`);
      sfx('six'); autoTaunt('six', pc);
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
  const pc = actor(), d = accumulatedDice[currentDiceIndex];
  updateUI();
  const raw = getValidMoves(pc, d);
  if (raw.length === 0) {
    log(`Aucun coup possible pour le dé [${d}] de ${NAMES[pc]}.`);
    skipPending = true;
    setTimeout(() => { skipPending = false; currentDiceIndex++; processCurrentDiceInPool(); }, 1000);
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
      if (steps === 6 && !isBlockedByEnemyBarrier(START_INDEX[color], color) && !teammateAt(START_INDEX[color], color)) moves.push({ pawn: p, type: 'EXIT_BASE' });
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
const teammateAt = (g, color) => pawnsAt(g).some(x => x.c !== color && sameTeam(x.c, color));
function canPawnMovePath(color, startPos, steps) {
  for (let i = 1; i <= steps; i++) {
    const n = startPos + i;
    if (n > LAST_LOOP) break;
    const at = pawnsAt((START_INDEX[color] + n) % 52);
    if (at.length >= 2 && !(i === steps && at[0].c === color)) return false;
    if (i === steps && teammateAt((START_INDEX[color] + n) % 52, color)) return false;   // on ne se pose pas sur son partenaire
  }
  return true;
}

canvas.addEventListener('click', e => {
  if (!isPilotingPhase || isRolling || busy || gameOver || currentDiceIndex >= accumulatedDice.length) return;
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * canvas.width / rect.width;
  const cy = (e.clientY - rect.top) * canvas.height / rect.height;
  const pc = actor();
  if (isOnline() && ACTIVE[currentPlayerIndex] !== net.myColor) return;
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
  const before = PLAYERS.map(c => pawns[c].map(p => [p.pos, p.inJailOf]));
  applyMove(color, move);
  const d = animateChanges(before);
  busy = true; hlCache = new Set(); drawBoard();
  setTimeout(() => {
    busy = false;
    if (teamWon(color)) { endGame(color); return; }
    currentDiceIndex++;
    processCurrentDiceInPool();
  }, d + 80);
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
let budget = 0;
function bestScore(color, idx) {
  if (idx >= accumulatedDice.length || --budget < 0) return 0;
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
  budget = prefs.lite ? 1500 : 6000;
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
    if (c !== attacker && !sameTeam(c, attacker)) {
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
  if (isOnline() && ACTIVE[currentPlayerIndex] === net.myColor) { sfx('ding'); if (navigator.vibrate) navigator.vibrate(200); }
  log(`C'est au tour de ${NAMES[ACTIVE[currentPlayerIndex]]}.`);
  updateUI();
}

function endGame(color) {
  gameOver = true; sendStat('terminée', teamLabel(color)); sfx('win'); clearSave();
  const k = winKey(color);
  series.wins[k] = (series.wins[k] || 0) + 1;
  seriesOver = series.n > 0 && series.wins[k] >= Math.ceil(series.n / 2);
  log(`🏆 ${teamLabel(color)} a gagné ${seriesOver ? 'la série' : 'la partie'} !`);
  document.getElementById('winText').innerHTML = `${teamMode ? "L'équipe" : 'Le joueur'} <b style="color:${PCOL[color]}">${esc(teamLabel(color))}</b> remporte ${seriesOver ? 'la série' : 'la partie'} !` + scoreHtml();
  const rb = document.getElementById('rematchBtn');
  rb.innerText = seriesOver ? '🔁 Nouvelle série' : '🔁 Revanche'; rb.style.display = net.spec ? 'none' : 'block';
  document.getElementById('winModal').style.display = 'flex';
  updateUI();
}


/* js/net.js */
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
  gameStarted = true; currentPlayerIndex = 0; gameStartTime = Date.now(); staticDirty = true;
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
  if (!iceReady) { loadIce(() => openHostPeer(resume, tries)); return; }
  lobbyMsg(resume ? 'Réouverture de la salle…' : 'Connexion au serveur…');
  try { if (net.peer) net.peer.destroy(); } catch (e) {}
  net.peer = new Peer('ludo-' + net.code, peerOpts());
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
  if (m.t === 'ping') { try { conn.send({ t: 'pong' }); } catch (e) {} return; }
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
  if (!iceReady) { loadIce(connectGuest); return; }
  net.peer = new Peer(peerOpts());
  net.peer.on('open', () => {
    const conn = net.conn = net.peer.connect('ludo-' + net.code, { reliable: true });
    conn.on('open', () => conn.send({ t: 'join', name: pseudoVal(), pid: MY_PID, spec: net.spec, avatar: myAvatar() })); startBeat();
    conn.on('data', onGuestMsg);
    conn.on('close', onGuestLost);
  });
  net.peer.on('error', e => {
    if (gameStarted || net.reconnecting) { onGuestLost(); return; }
    lobbyMsg(e.type === 'peer-unavailable' ? 'Salle introuvable : vérifiez le code.' : 'Erreur réseau : ' + e.type);
    document.getElementById('setupBtn').disabled = false;
  });
}
function startBeat() {   // battement de coeur : détecte vite une coupure silencieuse (réseau mobile instable)
  net.lastPong = Date.now();
  if (net.beat) return;
  net.beat = setInterval(() => {
    if (!net.conn || net.mode !== 'join') return;
    try { if (net.conn.open) net.conn.send({ t: 'ping' }); } catch (e) {}
    if (Date.now() - net.lastPong > 20000) { net.lastPong = Date.now(); onGuestLost(); }
  }, 5000);
}
function onGuestLost() {   // coupure : on retente toutes les 3 s, l'hôte renvoie alors l'état de la partie
  if (!net.code || (net.reconnecting && !gameStarted)) return;
  if (net.retryTimer) return;
  banner('📡 Connexion perdue… reconnexion en cours');
  net.retryTimer = setTimeout(() => { net.retryTimer = null; try { net.peer.destroy(); } catch (e) {} connectGuest(); }, 3000);
}
function onGuestMsg(m) {
  net.lastPong = Date.now();
  if (m.t === 'pong') return;
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

/* js/social.js */
// Messages rapides, bulles de dialogue, réactions automatiques et préférences du joueur
// Textes par défaut. Ils peuvent être remplacés depuis l'onglet « Messages » du Google Sheet (voir README).
const DEFAULT_MSG = {
  standard: [ // 7 provocations puis 3 réponses
    'Tu vas pleurer ce soir ! 😈', 'Ton pion est déjà en danger... 👀', 'Prépare la prison, j\'arrive ! 🔒',
    'Même mon petit cousin joue mieux ! 😂', 'Trop facile, vraiment trop facile ! 😎',
    'Dépêche-toi, on n\'a pas toute la nuit ! ⏳', 'Le 6 m\'aime, pas toi ! 🍀',
    'Rira bien qui rira le dernier ! 😏', 'Bien joué, je m\'incline 👏', 'Tu parles beaucoup pour quelqu\'un qui perd ! 😂'
  ],
  six: ['Un 6 ! La chance me sourit 😎', 'Six ! Tremblez, mes pions arrivent ! 🔥', 'Le dé m\'adore aujourd\'hui 😏', 'Encore un 6 ? Je n\'y suis pour rien, c\'est le dé 😂'],
  capture: ['Pris ! Direction la prison 🔒😂', 'Merci pour le pion, il était délicieux 😋', 'Au revoir mon cher pion ! 👋', 'On ne passe pas chez moi ! 😤']
};
let MSG = JSON.parse(JSON.stringify(DEFAULT_MSG));
const SAY_DELAY = 1500, BUBBLE_MS = 3200;           // délai minimum entre deux messages, durée d'une bulle
const AUTO_CHANCE = { six: .5, capture: .8 };       // probabilité d'une réaction automatique
const loadJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const prefs = Object.assign({ auto: true, zen: false, sound: true }, loadJSON('ludo_prefs', {}));
if (prefs.lite === undefined) prefs.lite = LOW_END;
let customMsgs = loadJSON('ludo_custom', []);       // 10 messages privés, enregistrés sur l'appareil
let bubbles = [], lastSay = 0;

// Textes modifiables par l'administrateur (Google Sheet, onglet « Messages »)
function loadAdminMessages() {
  if (!STATS_URL) return;
  fetch(STATS_URL).then(r => r.json()).then(d => {
    ['standard', 'six', 'capture'].forEach(k => { if (Array.isArray(d[k]) && d[k].length) MSG[k] = d[k].map(String); });
    buildTray();
  }).catch(() => {});
}

// ----- Envoi et affichage -----
function say(text, color) {
  text = String(text).slice(0, 60);
  if (!text) return;
  if (!isOnline()) { showBubble(color, text); return; }
  if (isHost()) { broadcast({ t: 'chat', c: net.myColor, x: text }); showBubble(net.myColor, text); }
  else net.conn.send({ t: 'chat', x: text });
}
function trySay(text) {
  if (!gameStarted || gameOver || (isOnline() && !net.myColor) || Date.now() - lastSay < SAY_DELAY) return false;
  lastSay = Date.now();
  say(text, isOnline() ? net.myColor : ACTIVE[currentPlayerIndex]);
  return true;
}
function relayChat(color, text) { // hôte : relaie le message d'un invité à tout le monde
  text = String(text).slice(0, 60);
  broadcast({ t: 'chat', c: color, x: text }); showBubble(color, text);
}
function showBubble(color, text) {
  if (prefs.zen && (!isOnline() || color !== net.myColor)) return; // mode zen : on masque les messages des autres
  bubbles = bubbles.filter(b => b.c !== color);
  bubbles.push({ c: color, text, t0: Date.now() }); sfx('bubble');
}
function autoTaunt(kind, color) {
  if (simulating || !gameStarted || gameOver || !prefs.auto) return;
  if (isOnline() && color !== net.myColor) return;   // seul l'appareil du joueur concerné parle pour lui
  const l = MSG[kind];
  if (!l || !l.length || Math.random() > AUTO_CHANCE[kind] || Date.now() - lastSay < SAY_DELAY) return;
  lastSay = Date.now();
  say(l[Math.floor(Math.random() * l.length)], color);
}
function drawBubbles() {
  const now = Date.now();
  bubbles = bubbles.filter(b => now - b.t0 < BUBBLE_MS);
  bubbles.forEach(b => {
    const [ox, oy] = ORIGIN[b.c], cx = (ox + 3) * grid, cy = (oy + (oy === 0 ? 1.8 : 4.2)) * grid, age = now - b.t0;
    ctx.save(); ctx.globalAlpha = age > BUBBLE_MS - 400 ? (BUBBLE_MS - age) / 400 : 1; ctx.font = 'bold 14px sans-serif';
    const lines = []; let cur = '';
    b.text.split(' ').forEach(wd => { const t = cur ? cur + ' ' + wd : wd; if (ctx.measureText(t).width > 170 && cur) { lines.push(cur); cur = wd; } else cur = t; });
    lines.push(cur);
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 20, h = lines.length * 18 + 14;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = PCOL[b.c]; ctx.lineWidth = 4; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 12); else ctx.rect(cx - w / 2, cy - h / 2, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, cx, cy - h / 2 + 16 + i * 18));
    ctx.restore();
  });
}

// ----- Plateau de messages (en bas de l'écran) -----
function chip(t, cls) {
  const b = document.createElement('button');
  b.className = 'chip ' + cls; b.textContent = t;
  b.onclick = () => { if (trySay(t)) closeTray(); };
  return b;
}
function buildTray() {
  const std = document.getElementById('stdMsgs');
  std.innerHTML = '';
  MSG.standard.slice(0, 10).forEach((t, i) => std.appendChild(chip(t, i < 7 ? 'prov' : 'rep')));
  renderMy();
}
function renderMy() {
  const box = document.getElementById('myMsgs'), l = customMsgs.filter(Boolean);
  box.innerHTML = '';
  if (!l.length) { box.innerHTML = '<span class="hint">Aucun message perso. Touchez ✏️ pour en écrire jusqu\'à 10.</span>'; return; }
  l.forEach(t => box.appendChild(chip(t, 'mine')));
}
function toggleEdit() {
  const e = document.getElementById('editBox');
  if (e.style.display !== 'none') { e.style.display = 'none'; return; }
  e.innerHTML = Array.from({ length: 10 }, (_, i) => `<input id="cm${i}" maxlength="40" placeholder="Message ${i + 1}" value="${esc(customMsgs[i] || '')}">`).join('') + '<button onclick="saveCustom()">Enregistrer</button>';
  e.style.display = 'block';
}
function saveCustom() {
  customMsgs = Array.from({ length: 10 }, (_, i) => document.getElementById('cm' + i).value.trim().slice(0, 40));
  saveJSON('ludo_custom', customMsgs);
  document.getElementById('editBox').style.display = 'none'; renderMy();
}
function openTray() {
  document.getElementById('optAuto').checked = prefs.auto; document.getElementById('optLite').checked = prefs.lite; document.getElementById('optZen').checked = prefs.zen;
  document.getElementById('leaveVoice').style.display = voice.state ? 'inline-block' : 'none';
  document.getElementById('chatTray').style.display = 'flex';
}
function closeTray() { document.getElementById('chatTray').style.display = 'none'; }
function savePrefs() {
  prefs.auto = document.getElementById('optAuto').checked; prefs.lite = document.getElementById('optLite').checked; prefs.zen = document.getElementById('optZen').checked;
  saveJSON('ludo_prefs', prefs);
}

/* js/audio.js */
// Sons synthétisés (aucun fichier audio) ; coupés par le bouton 🔊
let actx = null;
function audioUnlock() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {}
}
function tone(f, d, type = 'sine', v = .15, at = 0, f2) {
  if (!actx || !prefs.sound) return;
  const t = actx.currentTime + at, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + .02);
}
const SFX = {
  roll: () => [0, 1, 2, 3, 4, 5].forEach(i => tone(300 + Math.random() * 400, .05, 'square', .06, i * .07)),
  six: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .15, 'triangle', .18, i * .09)),
  step: () => tone(440, .06, 'sine', .12),
  pop: () => tone(300, .12, 'sine', .2, 0, 700),
  capture: () => tone(500, .35, 'sawtooth', .18, 0, 120),
  finish: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, .2, 'triangle', .2, i * .1)),
  win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, .25, 'triangle', .22, i * .12)),
  ding: () => { tone(880, .25, 'sine', .2); tone(1320, .3, 'sine', .15, .12); },
  tick: () => tone(1000, .05, 'square', .08),
  bubble: () => tone(600, .08, 'sine', .12, 0, 900)
};
function sfx(n) { try { if (!simulating) SFX[n](); } catch (e) {} }
function toggleSound() { prefs.sound = !prefs.sound; saveJSON('ludo_prefs', prefs); updateSoundBtn(); audioUnlock(); sfx('pop'); }
function updateSoundBtn() { document.getElementById('soundBtn').innerText = prefs.sound ? '🔊' : '🔇'; }

/* js/anim.js */
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

/* js/timer.js */
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

/* js/session.js */
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
  isRolling = false; busy = false; skipPending = false; anims = []; turnKey = ''; gameStarted = true; staticDirty = true;
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

/* js/rules-text.js */
// Texte de la page de règles (modifiable : c'est du HTML simple)
const RULES_HTML = `
<h2>📖 Règles du Ludo 237</h2>
<h3>But du jeu</h3><p>Amener ses 4 pions au centre (case lila 👑) avant les autres.</p>
<h3>Le plateau</h3><p>Une boucle de 51 cases partagée par tous, puis un couloir final de 5 cases à sa couleur. Un pion qui atteint la dernière case du couloir entre automatiquement au centre. Il faut le nombre exact : un dé trop grand ne permet pas d'avancer.</p>
<h3>Début de partie</h3><ul>
<li>Tant que vous n'avez pas fait de 6, vous avez <b>2 lancers</b> par tour. Dès votre premier 6, vous n'avez plus qu'1 lancer par tour.</li>
<li>La phase d'ouverture se termine pour tout le monde dès qu'un pion franchit l'entrée de la base suivante.</li></ul>
<h3>Le tour</h3><ul>
<li>Touchez l'écran pour lancer le dé, puis touchez le pion à jouer. Rien n'est automatique.</li>
<li>Un <b>6</b> permet de sortir un pion de sa base, de libérer un prisonnier ou d'avancer un pion, au choix. Chaque 6 donne un lancer de plus, sans limite.</li>
<li>Vous devez jouer tous vos dés si c'est possible : un dé n'est abandonné que si aucun autre choix n'existe.</li></ul>
<h3>Captures et prison</h3><ul>
<li>Un pion qui tombe exactement sur un pion adverse le capture. Les cases de départ ne sont pas protégées.</li>
<li>Le prisonnier va dans la zone de prison de son vainqueur (3 cases à côté de sa base, une par couleur). Plusieurs prisonniers s'empilent avec un chiffre.</li>
<li>Pour libérer un pion, son propriétaire fait un 6 : le pion retourne dans sa base, il faudra un autre 6 pour le sortir.</li>
<li>Le pion qui vient de capturer ne rejoue plus pendant la série de dés en cours.</li></ul>
<h3>Barrières</h3><p>Deux pions ou plus de la même couleur sur une case forment une barrière (contour épais et chiffre) : personne ne peut la traverser, pas même vous. Vos pions peuvent s'y poser pour la renforcer (jusqu'à 4).</p>
<h3>Versions</h3><ul><li><b>Version 1 :</b> manger est facultatif.</li>
<li><b>Version 2 :</b> si les dés permettent de manger, vous y êtes obligé (sauf si cela vous ferait perdre un dé).</li></ul>
<h3>Mode équipes (2 contre 2)</h3><p>À 4 joueurs : Rouge + Jaune contre Vert + Bleu. On ne mange pas son partenaire et on ne se pose pas sur son pion. Un joueur qui a tout terminé joue les pions de son partenaire avec ses dés. L'équipe gagne quand les 8 pions sont au centre.</p>
<h3>Série et revanche</h3><p>Après chaque partie, « Revanche » relance une manche avec les mêmes joueurs (le joueur suivant commence). En série « meilleur de 3 ou 5 », le premier à la majorité des manches gagne.</p>
<h3>À 2 joueurs</h3><p>Seules les couleurs opposées jouent : Rouge–Jaune ou Vert–Bleu.</p>
<h3>En ligne</h3><p>Un joueur crée la salle et donne le code. Les autres rejoignent avec ce code, ou regardent en spectateurs. Si vous êtes coupé, rouvrez la page : « Reprendre » vous ramène dans la partie. Un minuteur peut jouer à votre place si vous tardez trop. Le bouton 🎙️ lance l'appel vocal de groupe (mettez des écouteurs) ; ajoutez votre photo dans l'écran de départ.</p>
`;

/* js/avatar.js */
// Photo du joueur (réduite à 96×96, gardée sur l'appareil, affichée au bord de sa base)
function setAvatar(c, url) {
  if (url) { AVATARS[c] = url; const im = new Image(); im.onload = () => { staticDirty = true; }; im.src = url; AV_IMG[c] = im; }
  else { delete AVATARS[c]; delete AV_IMG[c]; }
  staticDirty = true;
}
function setAvatars(map) {
  Object.keys(AVATARS).forEach(k => setAvatar(k, null));
  Object.entries(map || {}).forEach(([c, u]) => setAvatar(c, u));
}
const myAvatar = () => loadJSON('ludo_avatar', '');
function pickAvatar(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement('canvas'), s = Math.min(im.width, im.height);
      cv.width = cv.height = 64;
      cv.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 64, 64);
      saveJSON('ludo_avatar', cv.toDataURL('image/jpeg', .7)); showAvatarPreview();
    };
    im.src = r.result;
  };
  r.readAsDataURL(file);
}
function showAvatarPreview() {
  const u = myAvatar(), p = document.getElementById('avatarPrev');
  p.src = u || ''; p.style.display = u ? 'inline-block' : 'none';
  document.getElementById('avatarDel').style.display = u ? 'inline-block' : 'none';
}
function removeAvatar() { saveJSON('ludo_avatar', ''); document.getElementById('avatarFile').value = ''; showAvatarPreview(); }

/* js/voice.js */
// Appel vocal de groupe : audio WebRTC (PeerJS) entre les joueurs de la salle
const voice = { state: 0, stream: null, calls: {}, hooked: null };   // state : 0 hors appel, 1 micro ouvert, 2 micro coupé
const voiceBtnUpdate = () => { document.getElementById('voiceBtn').innerText = ['🎙️', '🎤', '🔇'][voice.state]; };
function hookVoice() { if (voice.hooked !== net.peer) { net.peer.on('call', call => { if (!voice.stream) { call.close(); return; } call.answer(voice.stream); voiceAttach(call); }); voice.hooked = net.peer; } }
function voiceAttach(call) {
  voice.calls[call.peer] = call;
  call.on('stream', s => {
    const id = 'va_' + call.peer.replace(/\W/g, '');
    let a = document.getElementById(id);
    if (!a) { a = document.createElement('audio'); a.id = id; a.autoplay = true; document.body.appendChild(a); }
    a.srcObject = s; if (a.play) a.play().catch(() => {});
  });
  call.on('close', () => { delete voice.calls[call.peer]; });
}
function announceVoice(on) {
  const m = { t: on ? 'voice' : 'voiceoff', id: net.peer.id };
  if (isHost()) { net.hostVid = on ? net.peer.id : null; pushVoiceList(); } else net.conn.send(m);
}
function pushVoiceList() {   // hôte : liste des participants à l'appel, envoyée à tous
  const ids = net.conns.filter(x => x.vid && x.conn).map(x => x.vid);
  if (voice.state && net.peer) ids.push(net.peer.id);
  broadcast({ t: 'voicelist', ids }); onVoiceList(ids);
}
function onVoiceList(ids) {
  if (!voice.state || !voice.stream || !net.peer) return;
  ids = ids.filter(id => id !== net.peer.id);
  ids.forEach(id => { if (net.peer.id < id && !voice.calls[id]) voiceAttach(net.peer.call(id, voice.stream)); });  // le plus petit identifiant appelle
  Object.keys(voice.calls).forEach(id => { if (!ids.includes(id)) { voice.calls[id].close(); delete voice.calls[id]; } });
}
function toggleVoice() {
  if (!isOnline() || !net.myColor || !net.peer) { alert("L'appel vocal est réservé aux joueurs d'une partie en ligne."); return; }
  audioUnlock();
  if (voice.state !== 0) {
    voice.state = voice.state === 1 ? 2 : 1;
    voice.stream.getAudioTracks().forEach(t => { t.enabled = voice.state === 1; });
    voiceBtnUpdate(); return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert("Cet appareil ne permet pas l'appel vocal."); return; }
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(stream => {
    voice.stream = stream; voice.state = 1; hookVoice(); announceVoice(true); voiceBtnUpdate();
    log('🎧 Appel vocal activé : utilisez des écouteurs pour éviter l\'écho. Touchez 🎤 pour couper votre micro.');
  }).catch(() => alert('Micro refusé ou indisponible : autorisez le micro dans votre navigateur.'));
}
function leaveVoice() {
  if (!voice.state) return;
  voice.stream.getTracks().forEach(t => t.stop()); Object.values(voice.calls).forEach(c => c.close());
  voice.calls = {}; voice.stream = null; voice.state = 0; announceVoice(false); voiceBtnUpdate();
  document.querySelectorAll && document.querySelectorAll('audio[id^=va_]').forEach(a => a.remove());
}

/* js/match.js */
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

/* js/main.js */
// Démarrage de la page et événements globaux
document.getElementById('pseudo').value = loadJSON('ludo_pseudo', '');
document.getElementById('pseudo').oninput = e => saveJSON('ludo_pseudo', e.target.value.trim().slice(0, 15));
buildTray(); loadAdminMessages(); showResume(); updateSoundBtn(); showAvatarPreview();
updateUI();
(function frame() {   // en mode économie : on ne redessine que s'il y a du mouvement
  if (gameStarted && !gameOver && !(prefs.lite && !anims.length && !bubbles.length && !isRolling)) drawBoard();
  setTimeout(frame, prefs.lite ? 100 : 50);
})();
// Taille du plateau calculée en JavaScript (fonctionne même sans min(), dvh, etc. sur les vieux navigateurs)
function fitBoard() {
  const W = window.innerWidth, H = window.innerHeight, land = W > H;
  const px = Math.max(220, Math.floor(land ? Math.min(H, W - 250) : Math.min(W, H - 150))) + 'px';
  canvas.style.width = px; canvas.style.height = px;
  const p = document.getElementById('panel');
  p.style.width = land ? '230px' : px; p.style.height = land ? px : '';
  document.getElementById('app').style.flexDirection = land ? 'row' : 'column';
}
window.addEventListener('resize', fitBoard);
window.addEventListener('orientationchange', () => setTimeout(fitBoard, 250));
fitBoard();
setInterval(timerTick, 250);
// Toucher n'importe où (hors boutons et fenêtres) lance le dé quand c'est possible
document.addEventListener('click', e => {
  if (e.target.closest('button, input, label, select, #setupModal, #winModal, #logPopup, #chatTray, #rulesPopup')) return;
  audioUnlock(); rollDice();
}, true);
function openRules() { document.getElementById('rulesBox').innerHTML = RULES_HTML; document.getElementById('rulesPopup').style.display = 'flex'; }
// Installation sur l'écran d'accueil
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; document.getElementById('installBtn').style.display = 'block'; });
function installApp() { if (installEvt) { installEvt.prompt(); installEvt = null; document.getElementById('installBtn').style.display = 'none'; } }
if (matchMedia('(display-mode: standalone)').matches) document.getElementById('installBox').style.display = 'none';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__ludoReady = true;
