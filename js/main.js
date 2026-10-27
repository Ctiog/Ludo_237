// Démarrage de la page et événements globaux
buildTray(); loadAdminMessages();
updateUI();
setInterval(() => { if (gameStarted && !gameOver) drawBoard(); }, 50);
// Toucher n'importe où (hors boutons et fenêtres) lance le dé quand c'est possible
document.addEventListener('click', e => {
  if (e.target.closest('button, input, label, #setupModal, #winModal, #logPopup, #chatTray')) return;
  rollDice();
}, true);

