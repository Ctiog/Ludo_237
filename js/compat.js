// Compatibilité avec les anciens navigateurs (Android 5 à 8, WebView non mis à jour)
if (!Object.fromEntries) Object.fromEntries = function (it) { var o = {}; Array.from(it).forEach(function (kv) { o[kv[0]] = kv[1]; }); return o; };
if (!Object.entries) Object.entries = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }); };
if (!Object.values) Object.values = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
if (!Array.prototype.includes) Array.prototype.includes = function (v) { return this.indexOf(v) !== -1; };
if (!String.prototype.padStart) String.prototype.padStart = function (n, s) { var t = String(this); s = s || ' '; while (t.length < n) t = s + t; return t; };
if (window.Element) {
  var EP = Element.prototype;
  if (!EP.matches) EP.matches = EP.msMatchesSelector || EP.webkitMatchesSelector;
  if (!EP.closest) EP.closest = function (sel) { var e = this; while (e && e.nodeType === 1) { if (e.matches(sel)) return e; e = e.parentNode; } return null; };
  if (!EP.remove) EP.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
}
if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;
