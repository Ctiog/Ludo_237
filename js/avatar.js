// Photo du joueur (réduite à 96×96, gardée sur l'appareil, affichée au bord de sa base)
function setAvatar(c, url) {
  if (url) { AVATARS[c] = url; const im = new Image(); im.onload = () => { staticDirty = true; }; im.src = url; AV_IMG[c] = im; }
  else { delete AVATARS[c]; delete AV_IMG[c]; }
  staticDirty = true;
}
function setAvatars(map) {
  Object.keys(AVATARS).forEach(k => setAvatar(k, null));
  Object.entries(map || {}).forEach(([c, u]) => setAvatar(c, u));
}
const myAvatar = () => loadJSON('ludo_avatar', '');
function pickAvatar(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement('canvas'), s = Math.min(im.width, im.height);
      cv.width = cv.height = 64;
      cv.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 64, 64);
      saveJSON('ludo_avatar', cv.toDataURL('image/jpeg', .7)); showAvatarPreview();
    };
    im.src = r.result;
  };
  r.readAsDataURL(file);
}
function showAvatarPreview() {
  const u = myAvatar(), p = document.getElementById('avatarPrev');
  p.src = u || ''; p.style.display = u ? 'inline-block' : 'none';
  document.getElementById('avatarDel').style.display = u ? 'inline-block' : 'none';
}
function removeAvatar() { saveJSON('ludo_avatar', ''); document.getElementById('avatarFile').value = ''; showAvatarPreview(); }
