# Ludo 237

Jeu de Ludo (règles du 237) en HTML/CSS/JavaScript pur, sans compilation. Hébergé sur GitHub Pages.

## Structure
- `index.html` : page, fenêtres (départ, victoire, journal, messages)
- `css/style.css` : styles (mise en page adaptative portrait/paysage)
- `js/` (scripts classiques partageant le même espace global, chargés dans cet ordre) :
  `config.js` état et constantes · `board.js` dessin canvas · `ui.js` panneau d'infos ·
  `rules.js` règles, dés, captures, barrières, coups autorisés · `net.js` démarrage et jeu en ligne (PeerJS) ·
  `social.js` messages, bulles, préférences · `main.js` initialisation
- `apps-script/Code.gs` : script Google (historique des parties + messages éditables)

## Principes
- Chaque appareil exécute les mêmes règles ; en ligne, l'hôte tire les dés et valide les actions, puis les diffuse.
- `STATS_URL` (config.js) : adresse du déploiement Apps Script. Vide = historique et messages éditables désactivés.
- Messages : valeurs par défaut dans `social.js` (`DEFAULT_MSG`), remplacées par l'onglet « Messages » du Sheet s'il existe.

## Déploiement
Envoyer tout le contenu de ce dossier à la racine du dépôt GitHub (Pages, branche `main`).
