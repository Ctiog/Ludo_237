// Démarrage de la page et événements globaux
document.getElementById('pseudo').value = loadJSON('ludo_pseudo', '');
document.getElementById('pseudo').oninput = e => saveJSON('ludo_pseudo', e.target.value.trim().slice(0, 15));
buildTray(); loadAdminMessages(); showResume(); updateSoundBtn(); showAvatarPreview();
updateUI();
setInterval(() => { if (gameStarted && !gameOver) drawBoard(); }, 50);
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
