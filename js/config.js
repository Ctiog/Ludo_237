// Configuration, état du jeu, constantes et fonctions utilitaires du plateau
const canvas = document.getElementById('ludoBoard');
const ctx = canvas.getContext('2d');
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

