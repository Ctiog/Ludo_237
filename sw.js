// Service worker : permet l'installation et le jeu hors ligne (mode local). Réseau d'abord pour recevoir les mises à jour.
const CACHE = 'ludo237-v2';
const FILES = ["./", "index.html", "css/style.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "js/config.js", "js/board.js", "js/ui.js", "js/rules.js", "js/net.js", "js/social.js", "js/audio.js", "js/anim.js", "js/timer.js", "js/session.js", "js/rules-text.js", "js/avatar.js", "js/voice.js", "js/match.js", "js/main.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
