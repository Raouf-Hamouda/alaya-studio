#!/usr/bin/env python3
"""La demo du studio sur GitHub Pages (12 octobre 2026), en lecture seule.

Pages ne fait pas tourner server.js : on photographie les lectures (GET) d'un studio
lance sur ce Mac, on les range dans docs/api/, et docs/studio/demo.js repond a la place
du serveur. Toute ecriture est refusee. Les adresses mail sont retirees.

    PORT=8799 COURS_AUTO=0 node server.js        (avec .env charge, dans un autre terminal)
    python3 deploiement/demo.py                  puis commit + push de docs/
"""
import json, os, re, shutil, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get('STUDIO', 'http://127.0.0.1:8799') + '/api/'
SITE = 'https://raouf-hamouda.github.io/alaya-fine-jewelry/'
OUT = os.path.join(ROOT, 'docs')
EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}')

env = dict(l.strip().split('=', 1) for l in open(os.path.join(ROOT, '.env')) if '=' in l and not l.startswith('#'))
H = {'X-Requested-With': 'alaya', 'Content-Type': 'application/json'}
login = json.dumps({'email': env['ADMIN_EMAIL'].strip('"'), 'password': env['ADMIN_PASSWORD'].strip('"')}).encode()
r = urllib.request.urlopen(urllib.request.Request(BASE + 'login', login, H))
H['Cookie'] = '; '.join(c.split(';')[0] for c in r.headers.get_all('Set-Cookie'))

def get(p):
    return urllib.request.urlopen(urllib.request.Request(BASE + p, headers=H)).read().decode()

def key(p):  # meme regle que demo.js
    return re.sub(r'[^A-Za-z0-9.-]', '_', p) + '.json'

shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(os.path.join(ROOT, 'studio'), os.path.join(OUT, 'studio'))
os.makedirs(os.path.join(OUT, 'api'))

paths = ['me', 'accueil', 'pieces', 'stock', 'textes', 'textes/chrome', 'publier', 'sauvegardes',
         'vente', 'clients', 'users', 'mailing/state', 'atelier/all']
paths += ['pieces/' + p['slug'] for p in json.loads(get('pieces'))['pieces']]
paths += ['stock/' + p['slug'] for p in json.loads(get('stock'))['stock']]
paths += ['textes/page?f=' + urllib.parse.quote(p['file'], safe='') for p in json.loads(get('textes'))['pages']]
for p in paths:
    body = EMAIL.sub(lambda m: m.group(0).split('@')[0], get(p)).replace(ROOT, '13_STUDIO')
    open(os.path.join(OUT, 'api', key(p)), 'w').write(body)

for f in os.listdir(os.path.join(OUT, 'studio')):
    if f.endswith(('.js', '.html', '.css')):
        p = os.path.join(OUT, 'studio', f)
        s = open(p).read().replace('../site/', SITE)
        if f == 'index.html':
            s = s.replace('<script src="studio.js', '<script src="demo.js"></script>\n<script src="studio.js', 1)
        open(p, 'w').write(s)
shutil.copy(os.path.join(ROOT, 'deploiement', 'demo.js'), os.path.join(OUT, 'studio', 'demo.js'))
shutil.copy(os.path.join(ROOT, '..', '01_SITE_WEB', 'NEW VERSION', 'SITE double-clic', 'images', 'logo', 'alaya-logo-noir.png'), os.path.join(OUT, 'studio', 'logo.png'))
os.makedirs(os.path.join(OUT, 'studio', 'login'))  # pas de porte dans la demo : Quitter ramene au studio
open(os.path.join(OUT, 'studio', 'login', 'index.html'), 'w').write('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=../">')
open(os.path.join(OUT, '.nojekyll'), 'w').close()
open(os.path.join(OUT, 'index.html'), 'w').write('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=studio/"><title>Alaya, le studio</title>')
print(len(paths), 'lectures dans', OUT)
