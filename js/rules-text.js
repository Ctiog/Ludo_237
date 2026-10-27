// Texte de la page de règles (modifiable : c'est du HTML simple)
const RULES_HTML = `
<h2>📖 Règles du Ludo 237</h2>
<h3>But du jeu</h3><p>Amener ses 4 pions au centre (case lila 👑) avant les autres.</p>
<h3>Le plateau</h3><p>Une boucle de 51 cases partagée par tous, puis un couloir final de 5 cases à sa couleur. Un pion qui atteint la dernière case du couloir entre automatiquement au centre. Il faut le nombre exact : un dé trop grand ne permet pas d'avancer.</p>
<h3>Début de partie</h3><ul>
<li>Tant que vous n'avez pas fait de 6, vous avez <b>2 lancers</b> par tour. Dès votre premier 6, vous n'avez plus qu'1 lancer par tour.</li>
<li>La phase d'ouverture se termine pour tout le monde dès qu'un pion franchit l'entrée de la base suivante.</li></ul>
<h3>Le tour</h3><ul>
<li>Touchez l'écran pour lancer le dé, puis touchez le pion à jouer. Rien n'est automatique.</li>
<li>Un <b>6</b> permet de sortir un pion de sa base, de libérer un prisonnier ou d'avancer un pion, au choix. Chaque 6 donne un lancer de plus, sans limite.</li>
<li>Vous devez jouer tous vos dés si c'est possible : un dé n'est abandonné que si aucun autre choix n'existe.</li></ul>
<h3>Captures et prison</h3><ul>
<li>Un pion qui tombe exactement sur un pion adverse le capture. Les cases de départ ne sont pas protégées.</li>
<li>Le prisonnier va dans la zone de prison de son vainqueur (3 cases à côté de sa base, une par couleur). Plusieurs prisonniers s'empilent avec un chiffre.</li>
<li>Pour libérer un pion, son propriétaire fait un 6 : le pion retourne dans sa base, il faudra un autre 6 pour le sortir.</li>
<li>Le pion qui vient de capturer ne rejoue plus pendant la série de dés en cours.</li></ul>
<h3>Barrières</h3><p>Deux pions ou plus de la même couleur sur une case forment une barrière (contour épais et chiffre) : personne ne peut la traverser, pas même vous. Vos pions peuvent s'y poser pour la renforcer (jusqu'à 4).</p>
<h3>Versions</h3><ul><li><b>Version 1 :</b> manger est facultatif.</li>
<li><b>Version 2 :</b> si les dés permettent de manger, vous y êtes obligé (sauf si cela vous ferait perdre un dé).</li></ul>
<h3>Mode équipes (2 contre 2)</h3><p>À 4 joueurs : Rouge + Jaune contre Vert + Bleu. On ne mange pas son partenaire et on ne se pose pas sur son pion. Un joueur qui a tout terminé joue les pions de son partenaire avec ses dés. L'équipe gagne quand les 8 pions sont au centre.</p>
<h3>Série et revanche</h3><p>Après chaque partie, « Revanche » relance une manche avec les mêmes joueurs (le joueur suivant commence). En série « meilleur de 3 ou 5 », le premier à la majorité des manches gagne.</p>
<h3>À 2 joueurs</h3><p>Seules les couleurs opposées jouent : Rouge–Jaune ou Vert–Bleu.</p>
<h3>En ligne</h3><p>Un joueur crée la salle et donne le code. Les autres rejoignent avec ce code, ou regardent en spectateurs. Si vous êtes coupé, rouvrez la page : « Reprendre » vous ramène dans la partie. Un minuteur peut jouer à votre place si vous tardez trop. Le bouton 🎙️ lance l'appel vocal de groupe (mettez des écouteurs) ; ajoutez votre photo dans l'écran de départ.</p>
`;
