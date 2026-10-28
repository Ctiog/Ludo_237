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
