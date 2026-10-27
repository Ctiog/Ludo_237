// Google Apps Script lié au Google Sheet du jeu.
// - doPost : enregistre une ligne par partie (onglet des parties, en premier).
// - doGet  : renvoie les messages écrits dans l'onglet « Messages » (colonne A = type, colonne B = texte).
//            Types : standard (les 10 messages du plateau), six, capture.
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Parties') || ss.getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(['Date', 'État', 'Mode', 'Version', 'Joueurs', 'Gagnant', 'Durée (min)']);
  sh.appendRow([new Date(), d.etat, d.mode, d.version, d.joueurs, d.gagnant, d.duree]);
  return ContentService.createTextOutput('ok');
}
function doGet() {
  var out = { standard: [], six: [], capture: [] };
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Messages');
  if (sh) sh.getDataRange().getValues().forEach(function (r) {
    var type = String(r[0]).trim().toLowerCase(), txt = String(r[1]).trim();
    if (txt && out[type]) out[type].push(txt);
  });
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
