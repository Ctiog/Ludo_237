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
