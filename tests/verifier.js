#!/usr/bin/env node
/* LES PREUVES DU STUDIO, REJOUABLES (4 octobre 2026).
     node tests/verifier.js
   Le vrai site n'est jamais ecrit : le script en prend une copie dans le dossier temporaire du
   systeme, fait tout sur la copie, et l'efface a la fin. Ce qu'il prouve :
   1. les regles d'ecriture, appliquees au site tel qu'il est, ne changent aucun octet ;
   2. modifier des pieces sans rien changer ne change rien (hors l'estampille de pieces.js) ;
   3. ajouter, changer de section, modifier, traduire, retirer, puis annuler : la copie revient
      a l'octet pres, et le fichier des prix du paiement a suivi a chaque pas ;
   4. les textes d'une page et les textes communs s'ecrivent et s'annulent de meme ;
   5. l'annulation refuse de passer si un fichier a change entre-temps.
   Sortie : une ligne par preuve, "ok" ou "ECHEC", et le code de sortie 1 au premier echec compte. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), vm = require('vm');
var ROOT = path.join(__dirname, '..'), REAL = path.resolve(process.env.SITE_DIR || path.join(ROOT, '..', '01_SITE_WEB', 'NEW VERSION', 'SITE double-clic'));
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'alaya-preuves-')), A = path.join(TMP, 'a'), C = path.join(TMP, 'c'), fails = 0;
function ok(cond, label){ console.log((cond ? 'ok     ' : 'ECHEC  ') + label); if (!cond) fails++; }
function copy(from, to){ fs.cpSync(from, to, { recursive: true, filter: function(src){ var b = path.basename(src); return b !== '.git' && !/\.bak_/.test(b); } }); }
function files(dir){ var out = []; (function walk(d){ fs.readdirSync(d, { withFileTypes: true }).forEach(function(e){ var p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p)); }); })(dir); return out.sort(); }
/* the files that differ between the two copies; `loose` forgets the stamp of pieces.js and langues.js */
function differing(loose){
  var fa = files(A), fc = files(C), all = fa.concat(fc.filter(function(f){ return fa.indexOf(f) < 0; })), strip = function(s){ return s.replace(/(pieces|langues)\.js\?v=\w+/g, ''); };
  return all.filter(function(f){
    var x = path.join(A, f), y = path.join(C, f); if (!fs.existsSync(x) || !fs.existsSync(y)) return true;
    var bx = fs.readFileSync(x), by = fs.readFileSync(y); if (bx.equals(by)) return false;
    return !(loose && /\.(html|js|xml)$/.test(f) && strip(bx.toString('utf8')) === strip(by.toString('utf8')));
  });
}
function reset(){ fs.rmSync(C, { recursive: true, force: true }); copy(A, C); fs.rmSync(path.join(TMP, 'data'), { recursive: true, force: true }); }
function rd(f){ return fs.readFileSync(path.join(C, f), 'utf8'); }
function asInput(g){ return { name: g.name, price: g.price, rayon: g.rayon, collection: g.collection, ligne: g.ligne, description: g.description, reference: g.reference, details: g.details, filtres: g.filtres, fiancailles: g.fiancailles, mariage: g.mariage,
  photos: g.variants.map(function(v){ return { image: v.image, couleur: v.couleur, pierre: v.pierre }; }), montures: g.montures, sizes: g.sizes, en: g.en, it: g.it }; }

try {
  console.log('site : ' + REAL + '\ncopie : ' + TMP + '\n');
  copy(REAL, A); copy(A, C);
  var cfg = { site: C, data: path.join(TMP, 'data') }, cat = require(path.join(ROOT, 'catalogue.js'))(cfg), textes = require(path.join(ROOT, 'textes.js'))(cfg, { catalogue: cat });
  var all = cat.all(), slugs = all.map(function(p){ return p.slug; });

  console.log('1. Les regles, sur le site tel qu\'il est');
  var bad = cat.LISTS.filter(function(k){ var h = cat.read(cat.listFile(k)); try { return cat.rebuild(h) !== h; } catch (e){ return true; } });
  ok(!bad.length, cat.LISTS.length + ' pages de liste reecrites a l\'identique' + (bad.length ? ' (sauf ' + bad.join(', ') + ')' : ''));
  var tx = cat.begin('preuve'); cat.refreshSite(tx, ''); ok(!differing(false).length, 'les compteurs du menu, recalcules, ne changent aucune page');
  var raw = rd('netlify/functions/catalogue.json'); ok(cat.py0(JSON.parse(raw)) === raw, 'le fichier des prix du paiement se reecrit a l\'identique');
  var special = all.filter(function(p){ return cat.get(p.slug).special; }).map(function(p){ return p.slug; });
  ok(special.length <= 1, (all.length - special.length) + ' pieces sur ' + all.length + ' entierement modifiables' + (special.length ? ' (a part : ' + special.join(', ') + ')' : ''));

  console.log('\n2. Modifier sans rien changer');
  var sample = slugs.filter(function(s, i){ return special.indexOf(s) < 0 && i % 9 === 0; });
  sample.forEach(function(s){ cat.update(s, asInput(cat.get(s))); });
  var d2 = differing(true), typo = d2.filter(function(f){ return /^piece\//.test(f); });
  ok(d2.length === typo.length && typo.length <= sample.length, sample.length + ' pieces renvoyees telles quelles : rien ne bouge hors l\'estampille' + (typo.length ? ' (et l\'espace insecable pose sur ' + typo.length + ' fiche' + (typo.length > 1 ? 's' : '') + ')' : ''));
  ok(fs.readFileSync(path.join(A, 'netlify/functions/catalogue.json'), 'utf8') === rd('netlify/functions/catalogue.json'), 'le fichier des prix du paiement n\'a pas bouge');
  /* 5 Oct 2026: the piece page was redrawn (texts in the buying card and the panels) and the studio, still reading the old
     layout, wiped the descriptions and the Pierres row on every save. Every piece is now sent back, and a price goes and returns. */
  reset();
  var whole = slugs.filter(function(s){ return special.indexOf(s) < 0; }), lost = [];
  whole.forEach(function(s){ var g = cat.get(s); if (!g.ligne || !g.description) lost.push(s); cat.update(s, asInput(g)); });
  var d3 = differing(true).filter(function(f){ return f !== 'langues.js'; });
  ok(!lost.length, whole.length + ' pieces : la phrase et la description sont lues sur la fiche' + (lost.length ? ' (vides : ' + lost.slice(0, 5).join(', ') + ')' : ''));
  ok(!d3.length, whole.length + ' pieces renvoyees telles quelles : aucune page ne change' + (d3.length ? ' (' + d3.length + ' : ' + d3.slice(0, 5).join(', ') + ')' : ''));
  var one = whole.filter(function(s){ return /class="li-pierres"/.test(rd('piece/' + s + '/index.html')); })[0], g1 = cat.get(one), before = rd('piece/' + one + '/index.html');
  cat.update(one, Object.assign(asInput(g1), { price: g1.price + 1 }));
  var after = rd('piece/' + one + '/index.html'), meta = function(h){ return (/<meta name="description" content="([^"]*)"/.exec(h) || [])[1]; };
  ok(meta(after) === meta(before) && /class="li-pierres"/.test(after) && /class="acc-faits"/.test(after) && /class="achat-idee"/.test(after), 'un prix change sur ' + one + ' : description, ligne Pierres, phrase et SEO restent');
  cat.update(one, asInput(g1));
  ok(rd('piece/' + one + '/index.html') === before, 'le prix remis : la fiche revient a l\'octet pres');

  console.log('\n3. Ajouter, sections, modifier, traduire, retirer, annuler');
  reset();
  var src = all.filter(function(p){ return /\.jpe?g$/.test(p.image); })[0], img = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(C, src.image)).toString('base64'), n0 = all.length;
  var r = cat.add({ name: 'Bague Preuve d\'Essai', rayon: 'bagues', collection: 'mother-nature', price: 3400, fiancailles: true, montures: [], sizes: ['50', '52'], ligne: 'Une phrase ?', description: 'Une description.', details: [['Forme', 'Poire']], filtres: ['Solitaire'],
    photos: [{ data: img, couleur: 'blanc', pierre: 'Diamant' }, { data: img, couleur: 'rose', pierre: 'Diamant' }] });
  var slug = r.slug, P = cat.all(), neu = P.filter(function(p){ return p.slug === slug; })[0];
  ok(P.length === n0 + 1 && r.pages.length === 9 && !r.warnings.length, 'ajout : la piece est dans 9 pages, photos mises au carre');
  ok(neu && neu.fiancailles && neu.pages.indexOf('mariages-et-celebrations/bagues-de-fiancailles') >= 0 && neu.pages.indexOf('cadeaux/de-1500-a-5000') >= 0, 'ajout : Fiancailles, Bagues de fiancailles et la page budget');
  ok(/"centimes": 340000/.test(rd('netlify/functions/catalogue.json')) && rd('sitemap.xml').indexOf('/piece/' + slug + '/') > 0, 'ajout : le prix du paiement et le plan du site ont suivi');
  ok(/window\.CATALOGUE=\[\{"n": "Bague Preuve d'Essai"/.test(rd('recherche/index.html')), 'ajout : la piece est la premiere de la page de recherche');
  ok(new RegExp('Bagues <span class="n">' + (all.filter(function(p){ return p.rayon === 'bagues'; }).length + 1) + '</span>').test(rd('index.html')), 'ajout : le compteur du menu a monte sur les pages');
  cat.setSections(slugs.filter(function(s){ return special.indexOf(s) < 0; })[0], { fiancailles: true, mariage: true });
  var g = cat.get(slug), inp = asInput(g); inp.name = 'Bague Preuve Deux'; inp.price = 6100; inp.collection = 'eternal-balance'; inp.en = { ligne: 'A sentence?' }; inp.it = { ligne: 'Una frase?' };
  cat.update(slug, inp); var e = cat.get(slug), page = rd('piece/' + slug + '/index.html');
  ok(e.name === 'Bague Preuve Deux' && /<h1>Bague Preuve Deux<\/h1>/.test(page) && /achat-prix">6 100 €/.test(page), 'modification : nom et prix sur la fiche');
  ok(e.pages.indexOf('collections/eternal-balance') >= 0 && e.pages.indexOf('collections/mother-nature') < 0 && e.pages.indexOf('cadeaux/plus-de-5000') >= 0, 'modification : la piece a change de collection et de page budget');
  ok(/"centimes": 610000/.test(rd('netlify/functions/catalogue.json')), 'modification : le prix du paiement a suivi');
  ok(/\{"n": "Bague Preuve Deux", "u": "piece\/[a-z-]+\/index\.html", "i": "[^"]+", "p": "6 100 €", "r": "Bagues", "c": "Eternal Balance"\}/.test(rd('recherche/index.html')), 'modification : la ligne de la recherche a suivi (nom, prix, collection)');
  var w = {}; vm.runInNewContext(rd('langues.js'), { window: w }); ok(w.ALAYA_LANGUES.PHRASES.en['Une phrase ?'] === 'A sentence?' && e.it.ligne === 'Una frase?', 'traduction : la phrase anglaise et italienne sont dans langues.js, qui tourne toujours');
  var victim = slugs.filter(function(s){ return special.indexOf(s) < 0; })[3]; cat.remove(victim);
  ok(!fs.existsSync(path.join(C, 'piece', victim, 'index.html')) && rd('sitemap.xml').indexOf('/piece/' + victim + '/') < 0 && !(victim in JSON.parse(rd('netlify/functions/catalogue.json'))) && !files(C).some(function(f){ return /\.html$/.test(f) && rd(f).indexOf('piece/' + victim + '/index.html') >= 0; }), 'retrait : plus de fiche, plus de vignette, plus de prix, plus de ligne au plan du site');
  /* someone else writes in between: the undo must refuse */
  var f404 = path.join(C, '404.html'), keep = fs.readFileSync(f404); fs.appendFileSync(f404, '<!-- autre -->'); var refused = false; try { cat.undo(); } catch (x){ refused = true; } fs.writeFileSync(f404, keep);
  ok(refused, 'annulation refusee quand un fichier a change entre-temps');
  cat.undo(); cat.undo(); cat.undo(); cat.undo();
  ok(!differing(false).length, 'quatre annulations : la copie revient a l\'octet pres');

  console.log('\n4. Les textes');
  reset();
  var pg = textes.pages().filter(function(f){ return /la-maison/.test(f); })[0] || textes.pages()[0], v = textes.view(pg), t = v.texts.filter(function(x){ return x.plain && x.tag === 'p'; })[0];
  ok(textes.save(pg, { texts: [], images: [] }).changed === 0 && !differing(false).length, 'page ' + pg + ' : ' + v.texts.length + ' textes, ' + v.images.length + ' images ; enregistrer sans changement ne change rien');
  textes.save(pg, { texts: [{ i: t.i, text: t.text + ' Ajout ; pour voir.' }] }); ok(rd(pg).indexOf('Ajout ; pour voir.') > 0 && differing(true).filter(function(f){ return f !== 'langues.js'; }).join() === pg, 'un paragraphe change : une seule page touchee (hors estampille et langues.js), la typographie posee');
  var W = {}; require('vm').runInNewContext(rd('langues.js'), { window: W }); var EN = W.ALAYA_LANGUES.PHRASES.en, newFr = Object.keys(EN).filter(function(k){ return k.indexOf('Ajout') > 0; })[0];
  ok(!EN[t.text] || (newFr && EN[newFr] === EN[t.text]), 'sa traduction anglaise suit le paragraphe modifie');
  cat.undo(); ok(!differing(false).length, 'annule : identique');
  var ch = textes.chrome(), first = ch[0], res = textes.saveChrome({ texts: [{ i: first.i, text: first.text + ' bis' }] });
  var w2 = {}; vm.runInNewContext(rd('langues.js'), { window: w2 });
  ok(res.pages > 100 && rd('bagues/index.html').indexOf('>' + first.text + ' bis<') > 0, ch.length + ' textes communs ; "' + first.text + '" change sur ' + res.pages + ' pages');
  var hadEn = false; vm.runInNewContext(fs.readFileSync(path.join(A, 'langues.js'), 'utf8'), { window: w }); hadEn = !!w.ALAYA_LANGUES.PHRASES.en[first.text];
  ok(!hadEn || w2.ALAYA_LANGUES.PHRASES.en[first.text + ' bis'] === w.ALAYA_LANGUES.PHRASES.en[first.text], 'sa traduction anglaise suit la nouvelle formulation');
  cat.undo(); ok(!differing(false).length, 'annule : identique');

  console.log('\n5. Les calculs de l\'atelier (son propre controle)');
  var self = cp.spawnSync(process.execPath, [path.join(ROOT, 'atelier.js')], { encoding: 'utf8', timeout: 60000 });
  ok(self.status === 0, 'node atelier.js : ' + ((self.stdout || '').trim().split('\n').pop() || 'sans sortie').slice(0, 110));
} catch (e){ console.log('ECHEC  le script s\'est arrete : ' + e.stack); fails++; }
finally { fs.rmSync(TMP, { recursive: true, force: true }); }
console.log('\n' + (fails ? fails + ' echec' + (fails > 1 ? 's' : '') : 'Tout passe.'));
process.exit(fails ? 1 : 0);
