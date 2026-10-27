# Ludo 237

Jeu de Ludo (règles du 237) en HTML/CSS/JavaScript pur, sans compilation. Hébergé sur GitHub Pages.

## Structure
- `index.html` : page, fenêtres (départ, victoire, journal, messages)
- `css/style.css` : styles (mise en page adaptative portrait/paysage)
- `js/` (scripts classiques partageant le même espace global, chargés dans cet ordre) :
  `config.js` état et constantes · `board.js` dessin canvas · `ui.js` panneau d'infos ·
  `rules.js` règles, dés, captures, barrières, coups autorisés · `net.js` démarrage et jeu en ligne (PeerJS) ·
  `social.js` messages, bulles, préférences · `audio.js` sons · `anim.js` animation des pions · `timer.js` minuteur de tour · `session.js` sauvegarde et reprise · `rules-text.js` page de règles · `avatar.js` photo du joueur · `voice.js` appel vocal · `match.js` score de série et revanche · `main.js` initialisation
- `manifest.webmanifest`, `sw.js`, `icons/` : installation sur l'écran d'accueil et mode hors ligne (local)
- `apps-script/Code.gs` : script Google (historique des parties + messages éditables)

## Principes
- Chaque appareil exécute les mêmes règles ; en ligne, l'hôte tire les dés et valide les actions, puis les diffuse.
- `STATS_URL` (config.js) : adresse du déploiement Apps Script. Vide = historique et messages éditables désactivés.
- Messages : valeurs par défaut dans `social.js` (`DEFAULT_MSG`), remplacées par l'onglet « Messages » du Sheet s'il existe.

## Déploiement
Envoyer tout le contenu de ce dossier à la racine du dépôt GitHub (Pages, branche `main`).

## Fonctionnement en ligne
- Chaque joueur a un identifiant d'appareil (`ludo_pid`). Après une coupure, l'hôte reconnaît l'identifiant, rend la place et renvoie l'état complet (`getState/setState` dans `session.js`).
- L'état est sauvegardé dans `localStorage` (`ludo_save`) : l'hôte peut rouvrir la même salle après un rechargement.
- Spectateurs : connexion `spec`, ils reçoivent les mêmes messages mais ne peuvent ni lancer ni jouer.
- Pour publier une nouvelle version, changer `CACHE` dans `sw.js` si la liste des fichiers évolue.
- Mode équipes : `TEAM`, `actor()` (config.js) et `teamMode` ; un joueur qui a fini joue les pions de son partenaire.
- Appel vocal : audio WebRTC via PeerJS, l'hôte relaie la liste des participants (`voicelist`) ; le plus petit identifiant appelle l'autre.
