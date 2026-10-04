"""Egalise le remplissage des vignettes carrees (images/carre/**).

Principe : on mesure la boite du bijou (pixels dont un canal < 235, ombre comprise),
et on le repose au centre d'un carre blanc de meme taille, mis a l'echelle pour que
sqrt(largeur x hauteur) de la boite = CIBLE du cote (poids visuel egal, quelle que soit
la forme : une paire de boucles large et basse ou une bague ronde), avec un plafond :
le plus grand cote de la boite ne depasse jamais PLAFOND du cote.
Rejouable : il remesure a chaque fois, on peut changer CIBLE et relancer.
  python3 egaliser_carres.py "<dossier images/carre>" [CIBLE=0.55] [PLAFOND=0.84]
"""
import sys, os
from PIL import Image, ImageOps
import numpy as np
dossier = sys.argv[1]; CIBLE = float(sys.argv[2]) if len(sys.argv) > 2 else 0.55; PLAFOND = float(sys.argv[3]) if len(sys.argv) > 3 else 0.84
n = 0; stats = []
for root, _, fs in os.walk(dossier):
    for f in sorted(fs):
        if not f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')): continue
        p = os.path.join(root, f)
        im = Image.open(p).convert('RGB'); w, h = im.size; side = max(w, h)
        a = np.asarray(im).astype(int)
        bord = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]); fond = np.median(bord, axis=0)
        if fond.min() < 245:   # fond gris ou creme : on le ramene au blanc, le bijou est ce qui s'en ecarte
            mask = np.abs(a - fond).max(axis=2) > 22
            a[~mask] = 255; im = Image.fromarray(a.astype('uint8')); a = np.asarray(im).astype(int)
        mask = a.min(axis=2) < 235
        rows = np.where(mask.sum(axis=1) >= 3)[0]; cols = np.where(mask.sum(axis=0) >= 3)[0]
        if len(rows) == 0 or len(cols) == 0: continue
        y0, y1, x0, x1 = rows[0], rows[-1], cols[0], cols[-1]
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        s = CIBLE * side / (bw * bh) ** 0.5
        s = min(s, PLAFOND * side / max(bw, bh))
        bijou = im.crop((x0, y0, x1 + 1, y1 + 1))
        nw, nh = max(1, round(bw * s)), max(1, round(bh * s))
        bijou = bijou.resize((nw, nh), Image.LANCZOS)
        out = Image.new('RGB', (side, side), (255, 255, 255))
        out.paste(bijou, ((side - nw) // 2, (side - nh) // 2))
        out.save(p, quality=90, optimize=True) if p.lower().endswith(('.jpg', '.jpeg')) else out.save(p)
        stats.append((f, round(bw / side, 2), round(bh / side, 2), round(nw / side, 2), round(nh / side, 2))); n += 1
print(n, 'images egalisees, cible', CIBLE, 'plafond', PLAFOND)
ws = sorted(max(s[3], s[4]) for s in stats); print('plus grand cote apres : min', ws[0], 'median', ws[len(ws)//2], 'max', ws[-1])
for s in stats[:6]: print('  ', s)
