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
