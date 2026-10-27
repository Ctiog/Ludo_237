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
