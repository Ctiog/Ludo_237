#!/usr/bin/env python3
"""Génère index.html (version de production) à partir de index.dev.html :
tous les scripts js/*.js sont regroupés dans js/ludo.bundle.js (une seule requête, utile sur réseau lent).
Lancer après toute modification des fichiers js : python3 build.py"""
import re
src = open('index.dev.html', encoding='utf-8').read()
files = re.findall(r'<script src="(js/[^"]+\.js)"></script>\n', src)
files = [f for f in files if f != 'js/peerjs.min.js']
bundle = '\n'.join('/* ' + f + ' */\n' + open(f, encoding='utf-8').read() for f in files)
open('js/ludo.bundle.js', 'w', encoding='utf-8').write(bundle)
first = src.index('<script src="' + files[0] + '">')
last = src.index('</script>\n', src.index('<script src="' + files[-1] + '">')) + len('</script>\n')
open('index.html', 'w', encoding='utf-8').write(src[:first] + '<script src="js/ludo.bundle.js"></script>\n' + src[last:])
print('OK :', len(files), 'fichiers regroupés,', len(bundle) // 1024, 'Ko')
