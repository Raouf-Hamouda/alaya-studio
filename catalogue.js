/* LE CATALOGUE : lire et ecrire les pieces dans le site tel qu'il est sur le disque
   (4 octobre 2026). Le site n'a pas de base : une piece, c'est sa page
   piece/<adresse>/, sa ligne dans pieces.js, sa vignette dans la grille de chaque
   page de liste ou elle parait, les compteurs de ces pages et du menu de toutes les
   pages, et sa ligne dans sitemap.xml. Ce fichier ecrit tout cela d'un coup, ou rien.

   Les regles relevees dans le site (verifiees sur les 110 pieces avant d'ecrire) :
   - une piece a UN rayon, zero ou une collection ;
   - elle est toujours dans Toute la collection et dans Cadeaux pour elle ;
   - Fiancailles = mariages/fiancailles + cadeaux/fiancailles (+ bagues-de-fiancailles si c'est une bague) ;
   - Mariage = mariages/mariage + cadeaux/mariage ; la page Mariages = l'union des deux ;
   - la page budget des cadeaux suit le prix (moins de 1 500, 1 500 a 5 000, plus de 5 000).

   Chaque ecriture passe par une transaction : l'original de chaque fichier touche
   est copie dans data/sauvegardes/<date>/ avant, et une erreur en route remet tout. */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');

module.exports = function(cfg){
  var SITE = cfg.site, ORIGIN = 'https://alayafinejewelry.com', M = 'mariages-et-celebrations';
  var RAYONS = { 'bagues': 'Bagues', 'alliances': 'Alliances', 'bracelets': 'Bracelets', 'colliers-et-pendentifs': 'Colliers et pendentifs', 'boucles-d-oreilles': 'Boucles d’oreilles' };
  var COLLECTIONS = { 'timeless-elegance': 'Timeless Elegance', 'eternal-balance': 'Eternal Balance', 'mother-nature': 'Mother Nature' };
  var BUDGETS = ['cadeaux/moins-de-1500', 'cadeaux/de-1500-a-5000', 'cadeaux/plus-de-5000'];
  var LISTS = Object.keys(RAYONS).concat(Object.keys(COLLECTIONS).map(function(c){ return 'collections/' + c; }),
    [M, M + '/fiancailles', M + '/bagues-de-fiancailles', M + '/mariage', 'cadeaux/pour-elle', 'cadeaux/fiancailles', 'cadeaux/mariage'], BUDGETS, ['toute-la-collection']);
  /* the gold of the house, as the 110 pages write it (unbreakable spaces inside) */
  var NB = ' ';
  var MONTURES = [['Or blanc 750 ‰', 'blanc'], ['Or rose 750 ‰', 'rose'], ['Or jaune 750 ‰', 'jaune'], ['Or Rose et Blanc', 'rose'], ['Or Jaune et Blanc', 'jaune']].map(function(m){ return { value: m[0].replace(/ /g, NB), couleur: m[1] }; });
  var PASTILLE = { blanc: '#e6e6e4', rose: '#dfa992', jaune: '#d9b64e' };
  var AXES = { 'bagues': { a: 'Taille de la bague', l: 'Taille de bague', v: ['46', '48', '50', '52', '54', '56', '58', '60'] },
               'alliances': { a: 'Taille de la bague', l: 'Taille de bague', v: ['46', '48', '50', '52', '54', '56', '58', '60'] },
               'colliers-et-pendentifs': { a: 'Longueur de la chaine', l: 'Longueur de chaîne', v: ['40', '45', '50', '55', '60'] } };

  function file(rel){ return path.join(SITE, rel); }
  function read(rel){ return fs.readFileSync(file(rel), 'utf8'); }
  function listFile(key){ return key + '/index.html'; }
  function prefixOf(key){ return key.split('/').map(function(){ return '../'; }).join(''); }
  /* the way the site's pages were written: Python's html.escape and json.dumps */
  function esc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'); }
  function unesc(s){ return String(s).replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'); }
  function pyJSON(v){
    if (Array.isArray(v)) return '[' + v.map(pyJSON).join(', ') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).map(function(k){ return JSON.stringify(k) + ': ' + pyJSON(v[k]); }).join(', ') + '}';
    return JSON.stringify(v);
  }
  function ld(v){ return '<script type="application/ld+json">' + pyJSON(v).replace(/<\//g, '<\\/') + '</script>'; }
  function prix(p){ return p > 0 ? String(Math.round(p)).replace(/\B(?=(\d{3})+$)/g, ' ') + ' €' : 'Prix sur demande'; }
  function pyFloat(p){ return Number.isInteger(p) ? p + '.0' : String(p); }
  /* French typography, as on the rest of the site: no line break before : ; ? ! */
  function typo(s){ return String(s).replace(/[ \t\r\n]+/g, ' ').trim().replace(/ ([:;?!])/g, NB + '$1'); }
  function slugify(t){ return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }

  /* ---------- pieces.js : the text is kept as it is, an entry is appended, never the file rewritten ---------- */
  function piecesMap(){ var raw = read('pieces.js'); return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); }

  /* ---------- a list page: its grid, as a sequence of cards and editorial chapters ---------- */
  var TOKEN = /<article class="product-card[^"]*"[\s\S]*?<\/article>|<a class="grid-chapitre[^"]*"[\s\S]*?<\/a>/y;
  function parseGrid(html){
    var open = /<div class="grid-results[^"]*"[^>]*>/.exec(html);
    if (!open) return null;
    var pos = open.index + open[0].length, start = pos, tokens = [], m;
    for (;;){ TOKEN.lastIndex = pos; m = TOKEN.exec(html); if (!m) break; tokens.push(m[0]); pos = TOKEN.lastIndex; }
    if (html.slice(pos, pos + 6) !== '</div>') throw new Error('grille illisible');
    var page = /data-page="(\d+)"/.exec(open[0]);
    return { start: start, end: pos, tokens: tokens, page: page ? +page[1] : 0 };
  }
  function isCard(t){ return t.indexOf('<article') === 0; }
  function slugOf(t){ var m = /piece\/([a-z0-9-]+)\/index\.html/.exec(t); return m ? m[1] : ''; }
  function cardsOf(html){ var g = parseGrid(html); return g ? g.tokens.filter(isCard) : []; }
  function cardHTML(p, prefix){
    return '<article class="product-card" data-filtres="' + esc((p.filtres || []).join('; ')) + '"><a href="' + prefix + 'piece/' + p.slug + '/index.html"><img src="' + prefix + p.image + '" alt="' + esc(p.name) + '" loading="lazy"><p class="name">' + esc(p.name) + '</p><p class="price">' + prix(p.price) + '</p></a></article>';
  }
  /* the page rewritten from its cards: the chapters keep their place (the number of
     cards before each one), the "Voir plus" fold, the title's count, the counter,
     the filter chips, the ItemList and the leading number of the text below */
  function rebuild(html, edit){
    var g = parseGrid(html);
    if (!g) throw new Error('pas de grille');
    var cards = [], chapters = [];
    g.tokens.forEach(function(t){ if (isCard(t)) cards.push(t); else chapters.push({ at: cards.length, html: t }); });
    var before = cards.length;
    if (edit) cards = edit(cards);
    if (g.page) cards = cards.map(function(c, i){ return c.replace(/^<article class="product-card[^"]*"/, '<article class="product-card' + (i >= g.page ? ' is-more' : '') + '"'); });
    var seq = [], k = 0;
    cards.forEach(function(c, i){ while (k < chapters.length && chapters[k].at <= i) seq.push(chapters[k++].html); seq.push(c); });
    while (k < chapters.length) seq.push(chapters[k++].html);
    var n = cards.length, out = html.slice(0, g.start) + seq.join('') + html.slice(g.end);
    out = out.replace(/(<h1>[^<]*<span class="count">\()\d+(\)<\/span>)/, '$1' + n + '$2');
    out = out.replace(/(<span class="vus">\d+<\/span> sur )\d+/, '$1' + n);
    out = out.replace(/(<div class="grid-seo-text"><p>)(\d+)( )/, function(all, a, old, c){ return +old === before ? a + n + c : all; });
    var filtres = cards.map(function(c){ var m = /data-filtres="([^"]*)"/.exec(c); return m ? unesc(m[1]).split('; ') : []; });
    out = out.replace(/(<button class="chip" data-filtre="([^"]*)">[^<]*<span class="n">)\d+(<\/span>)/g, function(all, a, f, c){ f = unesc(f); return a + filtres.filter(function(l){ return l.indexOf(f) >= 0; }).length + c; });
    out = out.replace(/<script type="application\/ld\+json">(\{"@context": "https:\/\/schema\.org", "@type": "ItemList"[\s\S]*?)<\/script>/, function(all, json){
      var old = JSON.parse(json);
      return ld({ '@context': 'https://schema.org', '@type': 'ItemList', name: old.name, numberOfItems: n, itemListElement: cards.slice(0, 30).map(function(c, i){   /* the site lists the first thirty */
        return { '@type': 'ListItem', position: i + 1, url: ORIGIN + '/piece/' + slugOf(c) + '/', name: unesc((/<p class="name">([^<]*)<\/p>/.exec(c) || [])[1] || '') }; }) });
    });
    return out;
  }

  /* ---------- where a piece is, and where it goes ---------- */
  function targets(p){
    var t = [p.rayon, 'toute-la-collection', 'cadeaux/pour-elle'];
    if (p.collection) t.push('collections/' + p.collection);
    if (p.fiancailles){ t.push(M + '/fiancailles', 'cadeaux/fiancailles'); if (p.rayon === 'bagues') t.push(M + '/bagues-de-fiancailles'); }
    if (p.mariage) t.push(M + '/mariage', 'cadeaux/mariage');
    if (p.fiancailles || p.mariage) t.push(M);
    if (p.price > 0) t.push(p.price < 1500 ? BUDGETS[0] : (p.price <= 5000 ? BUDGETS[1] : BUDGETS[2]));
    return t;
  }
  function membership(){
    var on = {}, cards = {};
    LISTS.forEach(function(key){ cardsOf(read(listFile(key))).forEach(function(c){ var s = slugOf(c); (on[s] = on[s] || []).push(key); if (!cards[s]) cards[s] = c; }); });
    return { on: on, cards: cards };
  }
  function all(){
    var P = piecesMap(), mem = membership();
    return Object.keys(P).map(function(slug){
      var p = P[slug], on = mem.on[slug] || [], rayon = on.filter(function(k){ return RAYONS[k]; })[0] || '';
      var coll = (on.filter(function(k){ return k.indexOf('collections/') === 0; })[0] || '').replace('collections/', '');
      var f = /data-filtres="([^"]*)"/.exec(mem.cards[slug] || '');
      return { slug: slug, name: p.n, price: p.p, image: p.i, url: p.u, options: p.o || [], images: p.im || [], rayon: rayon, collection: coll, pages: on,
               fiancailles: on.indexOf(M + '/fiancailles') >= 0, mariage: on.indexOf(M + '/mariage') >= 0, filtres: f && f[1] ? unesc(f[1]).split('; ') : [] };
    });
  }
  /* what the form offers: the words the site already uses, nothing invented */
  function vocab(){
    var filtres = {}, labels = {}, pierres = {};
    all().forEach(function(p){ p.filtres.forEach(function(f){ filtres[f] = 1; }); });
    Object.keys(piecesMap()).forEach(function(slug){
      var h; try { h = read('piece/' + slug + '/index.html'); } catch (e){ return; }
      var ul = /<ul class="attributs">([\s\S]*?)<\/ul>/.exec(h), re = /<li><span>([^<]+)<\/span>/g, m;
      if (ul) while ((m = re.exec(ul[1]))) labels[unesc(m[1])] = (labels[unesc(m[1])] || 0) + 1;
      re = /class="gal-groupe" data-couleur="\w*" data-pierre="([^"]+)"/g; while ((m = re.exec(h))) pierres[unesc(m[1])] = 1;
    });
    return { rayons: RAYONS, collections: COLLECTIONS, montures: MONTURES, axes: AXES, filtres: Object.keys(filtres).sort(),
             details: Object.keys(labels).filter(function(l){ return l !== 'Monture' && labels[l] > 2; }).sort(function(a, b){ return labels[b] - labels[a]; }), pierres: Object.keys(pierres).sort() };
  }

  /* ---------- the transaction: every original kept before it is touched ---------- */
  var SAVES = path.join(cfg.data, 'sauvegardes');
  function begin(what){
    var stamp = new Date().toISOString().replace(/[:.]/g, '-'), dir = path.join(SAVES, stamp), seen = {}, manifest = { what: what, at: new Date().toISOString(), changed: [], created: [], after: {} };
    var note = function(){ fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1)); };
    var tx = {
      write: function(rel, data){
        var f = file(rel);
        if (!seen[rel]){
          seen[rel] = 1; fs.mkdirSync(dir, { recursive: true });
          if (fs.existsSync(f)){ var b = path.join(dir, rel); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(f, b); manifest.changed.push(rel); }
          else manifest.created.push(rel);
        }
        fs.mkdirSync(path.dirname(f), { recursive: true });
        var tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, f);
        manifest.after[rel] = sha(f); note();
      },
      /* a file the transaction wrote and another program then changed (the photos, made square) */
      seal: function(rel){ manifest.after[rel] = sha(file(rel)); note(); },
      remove: function(rel){
        if (!seen[rel]){ seen[rel] = 1; fs.mkdirSync(dir, { recursive: true }); var b = path.join(dir, rel); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(file(rel), b); manifest.changed.push(rel); }
        fs.unlinkSync(file(rel)); try { fs.rmdirSync(path.dirname(file(rel))); } catch (e){}
        manifest.after[rel] = ''; note();
      },
      update: function(rel, fn){ var old = read(rel), neu = fn(old); if (neu !== old) tx.write(rel, neu); },
      rollback: function(){ if (fs.existsSync(path.join(dir, 'manifest.json'))) restore(dir, true); },
      stamp: stamp
    };
    return tx;
  }
  function sha(f){ try { return crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'); } catch (e){ return ''; } }
  /* UNDO NEVER WALKS OVER SOMEONE ELSE'S WORK: every file is put back only if it is
     still the file this write left. One file changed since, and nothing is touched. */
  function restore(dir, force){
    var man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (!force){
      var moved = Object.keys(man.after || {}).filter(function(rel){ return sha(file(rel)) !== man.after[rel]; });
      if (moved.length) throw new Error('le site a changé depuis cette écriture (' + moved.length + ' fichiers, dont ' + moved[0] + ') : rien n’a été annulé');
    }
    man.changed.forEach(function(rel){ fs.mkdirSync(path.dirname(file(rel)), { recursive: true }); fs.copyFileSync(path.join(dir, rel), file(rel)); });
    man.created.forEach(function(rel){ try { fs.unlinkSync(file(rel)); } catch (e){} var d = path.dirname(file(rel)); for (var up = 0; up < 3 && d.length > SITE.length; up++){ try { fs.rmdirSync(d); } catch (e){ break; } d = path.dirname(d); } });   /* the folders it emptied go too */
    fs.renameSync(dir, dir + '.annule');
    return man;
  }
  function lastSave(){
    var dirs = []; try { dirs = fs.readdirSync(SAVES).filter(function(d){ return !/\.annule$/.test(d) && fs.existsSync(path.join(SAVES, d, 'manifest.json')); }).sort(); } catch (e){}
    if (!dirs.length) return null;
    var d = dirs[dirs.length - 1], man = JSON.parse(fs.readFileSync(path.join(SAVES, d, 'manifest.json'), 'utf8'));
    return { dir: path.join(SAVES, d), what: man.what, at: man.at, files: man.changed.length + man.created.length };
  }
  function undo(){ var l = lastSave(); if (!l) throw new Error('rien à annuler'); restore(l.dir); return l; }

  /* ---------- the counts of the menu, on every page of the site ---------- */
  function htmlFiles(){
    var out = [];
    (function walk(rel){ fs.readdirSync(file(rel || '.'), { withFileTypes: true }).forEach(function(e){
      if (e.name[0] === '.') return;
      var r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()){ if (e.name !== 'images') walk(r); } else if (/\.html$/.test(e.name)) out.push(r);
    }); })('');
    return out;
  }
  function refreshSite(tx, bumpPieces){
    var counts = {};
    LISTS.forEach(function(key){ if (BUDGETS.indexOf(key) < 0) counts[key] = cardsOf(read(listFile(key))).length; });
    var res = Object.keys(counts).map(function(key){ return [new RegExp('(href="(?:\\.\\./)*' + key.replace(/[-\/]/g, '\\$&') + '/index\\.html">[^<]*<span class="n">)\\d+(</span>)', 'g'), counts[key]]; });
    htmlFiles().forEach(function(rel){
      tx.update(rel, function(h){
        res.forEach(function(r){ h = h.replace(r[0], '$1' + r[1] + '$2'); });
        if (bumpPieces) h = h.replace(/pieces\.js\?v=[0-9a-z]+/g, 'pieces.js?v=' + bumpPieces);
        if (tx.langues) h = h.replace(/langues\.js\?v=[0-9a-z]+/g, 'langues.js?v=' + tx.stamp.slice(0, 16).replace(/[-T]/g, ''));
        return h;
      });
    });
  }
  function setMembership(tx, key, p, want){
    tx.update(listFile(key), function(h){
      return rebuild(h, function(cards){
        var rest = cards.filter(function(c){ return slugOf(c) !== p.slug; });
        return want ? [cardHTML(p, prefixOf(key))].concat(rest) : rest;
      });
    });
  }

  /* the gallery and the buying card of a piece page: written by the same two functions for a new piece and for an edited one */
  /* THE AXIS THAT CHANGES THE PHOTO. Besides the gold (Monture) and the size, a piece may offer one more
     choice that shows another photo: the stone (Pierre principale: Diamant, Rubis), a pearl (Perle: Noire,
     Gold), an enamel (Email: Bleu, Rose). Each value points at the photo group it shows: the group whose
     name is the value itself, or the axis name followed by the value ("Perle noire"). */
  function isSizeAxis(a){ return Object.keys(AXES).some(function(r){ return AXES[r].a === a; }); }
  function isVariantAxis(a){ return a !== 'Monture' && !isSizeAxis(a); }
  function pierreOf(o, v, variants){
    var low = String(v).toLowerCase(), hit = variants.filter(function(x){ var p = x.pierre.toLowerCase(); return p === low || p === (o.a + ' ' + v).toLowerCase(); })[0];
    return hit ? hit.pierre : v;
  }
  function valueOf(axis, pierre){ var pre = axis + ' '; return axis !== 'Pierre principale' && pierre.toLowerCase().indexOf(pre.toLowerCase()) === 0 ? pierre.charAt(pre.length).toUpperCase() + pierre.slice(pre.length + 1) : pierre; }

  function galHTML(name, variants, pre){
    function attr(v){ return esc(v); }
    var p = { name: name };
    return variants.map(function(v, i){ return '<div class="gal-groupe" data-couleur="' + v.couleur + '" data-pierre="' + attr(v.pierre) + '"' + (i ? ' hidden' : '') + '><div class="gal-vue"><img src="' + pre + v.image + '" alt="' + attr(p.name) + '"' + (v.attrs || '') + '></div>' + (v.extra || '') + '</div>'; }).join('');
  }
  function achatHTML(p, variants, pre){
    function attr(v){ return esc(v); }
    var vigns = variants.length > 1 ? '<div class="variations"><p class="variations-titre">Variations</p><div class="gal-vigns">' + variants.map(function(v, i){
      return '<button class="gal-vign' + (i ? '' : ' is-on') + '" data-couleur="' + v.couleur + '" data-pierre="' + attr(v.pierre) + '" type="button" aria-label="' + attr(v.aria || v.pierre) + '"><img src="' + pre + v.image + '" alt=""' + (v.vattrs || '') + '></button>'; }).join('') + '</div></div>' : '';
    var sels = p.options.map(function(o){
      return '<div class="sel" data-axe="' + attr(o.a) + '">\n  <button class="sel-tete"><span class="sel-label">' + esc(o.l) + '</span><span class="sel-val"></span><span class="chev">&rsaquo;</span></button>\n  <div class="sel-corps" hidden>' + o.v.map(function(v){
        var m = o.a === 'Monture' ? MONTURES.filter(function(x){ return x.value === v; })[0] : null;
        if (m) return '<button class="opt opt--metal" data-axe="Monture" data-value="' + attr(v) + '" data-couleur="' + m.couleur + '"><span class="pastille" style="background:' + PASTILLE[m.couleur] + '"></span>' + esc(v) + '</button>';
        return '<button class="opt" data-axe="' + attr(o.a) + '" data-value="' + attr(v) + '"' + (isVariantAxis(o.a) ? ' data-pierre="' + attr(pierreOf(o, v, variants)) + '"' : '') + '>' + esc(v) + '</button>';
      }).join('') + '</div>\n</div>'; }).join('');
    var ring = p.options.some(function(o){ return Object.keys(AXES).some(function(r){ return AXES[r].a === o.a; }); });   /* a size to choose, a guide to choose it */
    var buy = p.price > 0
      ? '<div class="achat-boutons"><button class="btn-pay" type="button">&#63743; Pay</button><button class="btn-panier" type="button" data-slug="' + p.slug + '">Ajouter au panier</button></div>'
      : '<div class="achat-boutons"><a class="btn-panier btn-panier--plein" href="' + pre + 'nous-contacter/index.html">Demander le prix</a></div>';
    return '<div class="achat" data-nom="' + attr(p.name) + '" data-prix="' + pyFloat(p.price) + '" data-img="' + p.image + '" data-url="piece/' + p.slug + '/index.html">\n  <h1>' + esc(p.name) + '</h1>\n  ' + vigns + '\n  ' + sels +
      '\n  <label class="offrir-opt"><input type="checkbox" class="chk-offrir"><span>Offrir ce bijou</span><small>écrin, mot joint, prix masqué</small></label>\n  ' +
      (ring ? '<div class="achat-guide"><button class="lien-guide" type="button"><span>Quelle taille choisir' + NB + '?</span></button></div>\n  ' : '') +
      '<p class="achat-prix">' + prix(p.price) + '</p>\n  ' + buy + '\n</div>';
  }

  /* ---------- the page of a piece, on the frame of the pages that exist ---------- */
  function piecePage(p, variants, P){
    var refSlug = Object.keys(P).filter(function(s){ return /<div class="modale" id="modale-tailles"/.test(read('piece/' + s + '/index.html')) && /class="lien-guide"/.test(read('piece/' + s + '/index.html')); })[0];
    var ref = read('piece/' + refSlug + '/index.html'), url = ORIGIN + '/piece/' + p.slug + '/', pre = '../../';
    var head = ref.slice(0, ref.indexOf('<main>')), tail = ref.slice(ref.indexOf('</main>'));
    var modale = ref.slice(ref.indexOf('<div class="modale" id="modale-tailles"'), ref.indexOf('<section class="fiche-bas">'));
    var accs = ref.slice(ref.indexOf('<div class="fiche-accs">'), ref.indexOf('</section>', ref.indexOf('<div class="fiche-accs">')));
    var title = p.name + ' | Alaya Fine Jewelry', desc = p.description || p.ligne || p.name, montures = p.montures.join(', ');
    function attr(v){ return esc(v); }
    var product = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: [p.ligne, p.description].filter(Boolean).join(' '), url: url,
      brand: { '@type': 'Brand', name: 'Alaya Fine Jewelry' }, category: 'Joaillerie', image: [ORIGIN + '/' + p.image] };
    if (p.reference) product.sku = p.reference;
    if (montures) product.material = montures;
    if (p.price > 0) product.offers = { '@type': 'Offer', price: String(Math.round(p.price)), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: url, seller: { '@type': 'Organization', name: 'Alaya Fine Jewelry' }, itemCondition: 'https://schema.org/NewCondition' };
    var crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Joaillerie', item: ORIGIN + '/toute-la-collection/' },
      { '@type': 'ListItem', position: 2, name: RAYONS[p.rayon].replace('’', '\''), item: ORIGIN + '/' + p.rayon + '/' },
      { '@type': 'ListItem', position: 3, name: p.name }] };
    head = head.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>')
      .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + attr(desc) + '$2')
      .replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + url + '$2')
      .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + attr(title) + '$2')
      .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + attr(desc) + '$2')
      .replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + url + '$2')
      .replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + ORIGIN + '/' + p.image + '$2');
    var n = 0; head = head.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, function(){ return ld(n++ === 0 ? crumbs : product); });
    if (n !== 2) throw new Error('page de référence inattendue');

    var rows = [['Monture', montures]].concat(p.details).filter(function(r){ return r[0] && r[1]; });
    accs = accs.replace(/<ul class="attributs">[\s\S]*?<\/ul>/, '<ul class="attributs">' + rows.map(function(r){ return '<li><span>' + esc(r[0]) + '</span> ' + esc(r[1]) + '</li>'; }).join('') + '</ul>')
      .replace(/<p class="note-specs">[^<]*<\/p>/, '').replace('</ul></div></details>', '</ul>' + (rows.some(function(r){ return r[0] !== 'Monture'; }) ? '<p class="note-specs">Caratages, poids et dimensions donnés à titre indicatif.</p>' : '') + '</div></details>');
    var near = cardsOf(read(listFile(p.collection ? 'collections/' + p.collection : p.rayon))).filter(function(c){ return slugOf(c) !== p.slug; }).slice(0, 4)
      .map(function(c){ return c.replace(/(href|src)="(?:\.\.\/)+/g, '$1="' + pre).replace(' is-more', ''); }).join('');
    var main = '<main>\n<section class="fiche-haut">\n  <div class="gal">' + galHTML(p.name, variants, pre) + '</div>\n  ' + achatHTML(p, variants, pre) + '\n</section>\n' + modale +
      '<section class="fiche-bas">\n  <div class="fiche-texte">\n    ' + (p.ligne ? '<p class="fiche-ligne">' + esc(p.ligne) + '</p>' : '') + (p.description ? '<p>' + esc(p.description) + '</p>' : '') + '\n    ' +
      (p.reference ? '<p class="ref">Référence du produit : ' + esc(p.reference) + '</p>' : '') + '\n    <p class="ref">Une question ? <a href="' + pre + 'nous-contacter/index.html">Contactez-nous</a></p>\n  </div>\n  ' + accs + '</section>\n' +
      (near ? '<section class="apparentees"><h2>' + (p.collection ? 'Dans la même collection' : 'Dans le même rayon') + '</h2><div class="grid-results">' + near + '</div></section>\n' : '') +
      '<nav class="fil-bas"><a href="' + pre + 'toute-la-collection/index.html">Joaillerie</a><span class="sep">|</span><a href="' + pre + p.rayon + '/index.html">' + esc(RAYONS[p.rayon].replace('’', '\'')) + '</a><span class="sep">|</span><span>' + esc(p.name) + '</span></nav>\n';
    return head + main + tail;
  }

  /* ---------- the photos: written beside the others, then made square and of equal weight by the site's own tool ---------- */
  var EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  function savePhotos(tx, slug, photos, from, warnings){
    var tool = process.env.EGALISER || path.join(__dirname, '..', '10_OUTILS', 'RENDU', 'egaliser_carres.py'), bins = ['/Library/Developer/CommandLineTools/usr/bin/python3', 'python3'];   /* EGALISER: the tool's path on a server */
    var tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'alaya-')), out = [];
    try {
      photos.forEach(function(ph, i){
        var m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(ph.data || '');
        if (!m) throw new Error('photo ' + (i + 1) + ' : il faut un JPEG, un PNG ou un WebP');
        var name = slug + '-' + (from + i) + '.' + EXT[m[1]]; fs.writeFileSync(path.join(tmp, name), Buffer.from(m[2], 'base64')); out.push(name);
      });
      var ok = !out.length;
      for (var k = 0; k < bins.length && !ok; k++){ try { cp.execFileSync(bins[k], [tool, tmp], { stdio: 'pipe', timeout: 120000 }); ok = true; } catch (e){} }
      if (!ok) warnings.push('Les photos n\u2019ont pas pu \u00eatre mises au carr\u00e9 : elles sont pos\u00e9es telles quelles.');
      return out.map(function(name){ var rel = 'images/carre/studio/' + slug + '/' + name; tx.write(rel, fs.readFileSync(path.join(tmp, name))); return rel; });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  function entryText(slug, e){ return JSON.stringify(slug) + ':' + JSON.stringify(e).replace(/"p":(\d+),/, '"p":$1.0,'); }

  /* ---------- THE PRICES THE PAYMENT TRUSTS. The site's payment function (netlify/functions/creer-paiement.js)
     never takes a price from the browser: it reads netlify/functions/catalogue.json. So every time the studio
     adds a piece, changes a name, a price or a first photo, or removes a piece, that file follows in the same
     write. An entry that carries a free amount (the gift card) is left as it is. The file keeps its layout
     (one key per line, as Python wrote it), so a write that changes nothing changes no byte. ---------- */
  var PAIEMENT = 'netlify/functions/catalogue.json';
  function py0(v){ return v && typeof v === 'object' ? '{\n' + Object.keys(v).map(function(k){ return JSON.stringify(k) + ': ' + py0(v[k]); }).join(',\n') + '\n}' : JSON.stringify(v); }
  function syncPaiement(tx){
    if (!fs.existsSync(file(PAIEMENT))) return;
    tx.update(PAIEMENT, function(raw){
      var C = JSON.parse(raw), P = piecesMap(), out = {};
      Object.keys(C).forEach(function(k){ if (P[k]) out[k] = C[k]; });
      Object.keys(P).forEach(function(k){ if (!(out[k] && out[k].libre)) out[k] = Object.assign(out[k] || {}, { nom: P[k].n, centimes: Math.round(P[k].p * 100), image: P[k].i }); });
      var neu = py0(out);
      return JSON.stringify(JSON.parse(raw)) === JSON.stringify(out) ? raw : neu;
    });
  }

  /* ---------- THE SEARCH PAGE carries its own list of the pieces (window.CATALOGUE in recherche/index.html):
     name, address, photo, price as printed, rayon, collection. The studio keeps the line of the piece it
     touches in step: a new piece goes first, a changed one keeps its place, a removed one leaves. The other
     lines are not rewritten. ---------- */
  function syncRecherche(tx, slug, p){
    if (!fs.existsSync(file('recherche/index.html'))) return;
    tx.update('recherche/index.html', function(h){
      var m = /(window\.CATALOGUE=)(\[[\s\S]*?\])(;)/.exec(h); if (!m) return h;
      var list = JSON.parse(m[2]), u = 'piece/' + slug + '/index.html', at = -1; list.forEach(function(x, i){ if (x.u === u) at = i; });
      if (!p){ if (at < 0) return h; list.splice(at, 1); }
      else {
        var line = { n: p.name, u: u, i: p.image, p: prix(p.price), r: (RAYONS[p.rayon] || '').replace('\u2019', '\''), c: COLLECTIONS[p.collection] || '' };
        if (at < 0) list.unshift(line); else list[at] = line;
      }
      var neu = pyJSON(list);
      return neu === m[2] ? h : h.slice(0, m.index) + m[1] + neu + m[3] + h.slice(m.index + m[0].length);
    });
  }

  /* ---------- add a piece ---------- */
  function add(input){
    var P = piecesMap(), name = typo(input.name || ''), slug = slugify(input.slug || name);
    if (!name) throw new Error('il faut un nom');
    if (!slug || P[slug] || fs.existsSync(file('piece/' + slug))) throw new Error('cette adresse existe déjà : ' + slug);
    if (!RAYONS[input.rayon]) throw new Error('il faut un rayon');
    var collection = COLLECTIONS[input.collection] ? input.collection : '';
    var price = Math.max(0, Number(input.price) || 0);
    var photos = Array.isArray(input.photos) ? input.photos : [];
    if (!photos.length) throw new Error('il faut au moins une photo');
    if (photos.length > 12) throw new Error('douze photos au plus');
    var montures = (input.montures || []).filter(function(v){ return MONTURES.some(function(m){ return m.value === v; }); });
    var tx = begin('Ajout de ' + name), warnings = [];
    try {
      photos.forEach(function(ph, i){ if (!PASTILLE[ph.couleur]) throw new Error('photo ' + (i + 1) + ' : il faut la couleur de l\u2019or'); });
      var files = savePhotos(tx, slug, photos, 1, warnings), variants = photos.map(function(ph, i){ return { couleur: ph.couleur, pierre: typo(ph.pierre || 'Diamant'), image: files[i] }; });
      var options = [], pierres = variants.map(function(v){ return v.pierre; }).filter(function(v, i, a){ return a.indexOf(v) === i; });
      if (montures.length > 1) options.push({ a: 'Monture', l: 'Choisir une monture', v: montures });
      if (pierres.length > 1) options.push({ a: 'Pierre principale', l: 'Choisir la pierre', v: pierres });
      var sizes = (input.sizes || []).map(function(v){ return typo(v); }).filter(Boolean);
      if (AXES[input.rayon] && sizes.length) options.push({ a: AXES[input.rayon].a, l: AXES[input.rayon].l, v: sizes });
      var p = { slug: slug, name: name, rayon: input.rayon, collection: collection, price: price, image: variants[0].image, montures: montures, options: options,
        ligne: typo(input.ligne || ''), description: typo(input.description || ''), reference: typo(input.reference || ''),
        details: (input.details || []).map(function(r){ return [typo(r[0] || ''), typo(r[1] || '')]; }),
        filtres: (input.filtres || []).map(function(f){ return typo(f); }).filter(Boolean), fiancailles: !!input.fiancailles, mariage: !!input.mariage };
      var where = targets(p);
      where.forEach(function(key){ setMembership(tx, key, p, true); });
      tx.write('piece/' + slug + '/index.html', piecePage(p, variants, P));
      var entry = { n: name, p: price, i: p.image, u: 'piece/' + slug + '/index.html', o: options, im: variants.map(function(v){ return v.image; }) };
      tx.update('pieces.js', function(raw){ var end = raw.lastIndexOf('}'); return raw.slice(0, end) + ',' + entryText(slug, entry) + raw.slice(end); });
      tx.update('sitemap.xml', function(x){ return x.replace('</urlset>', '<url><loc>' + ORIGIN + '/piece/' + slug + '/</loc><lastmod>' + new Date().toISOString().slice(0, 10) + '</lastmod><priority>0.8</priority></url>\n</urlset>'); });
      setTranslations(tx, input, p);
      syncPaiement(tx);
      syncRecherche(tx, slug, p);
      refreshSite(tx, tx.stamp.slice(0, 16).replace(/[-T]/g, ''));
      piecesMap();   /* the file still parses, or everything goes back */
      return { slug: slug, url: 'piece/' + slug + '/index.html', pages: where, warnings: warnings };
    } catch (e){ tx.rollback(); throw e; }
  }

  /* ---------- an existing piece moved in or out of Fiancailles and Mariage ---------- */
  function setSections(slug, want){
    var p = all().filter(function(x){ return x.slug === slug; })[0];
    if (!p) throw new Error('pièce inconnue');
    if (!p.rayon) throw new Error('cette pièce n’a pas de rayon');
    var next = Object.assign({}, p, { fiancailles: !!want.fiancailles, mariage: !!want.mariage });
    var now = targets(next), tx = begin('Sections de ' + p.name);
    try {
      [M, M + '/fiancailles', M + '/bagues-de-fiancailles', M + '/mariage', 'cadeaux/fiancailles', 'cadeaux/mariage'].forEach(function(key){
        var has = p.pages.indexOf(key) >= 0, should = now.indexOf(key) >= 0;
        if (has !== should) setMembership(tx, key, next, should);
      });
      refreshSite(tx, '');
      return { slug: slug, pages: now };
    } catch (e){ tx.rollback(); throw e; }
  }

  /* ---------- the translations of a piece's two texts: whole sentences, in langues.js ----------
     The site translates a text node by the whole string (PHRASES) and, failing that, word by word
     with its jewelry vocabulary (TERMES). The studio keeps its sentences in one block at the head of
     each language, between two marks, one "french": "translation" per line. */
  var MARK = ['/* studio : debut */', '/* studio : fin */'];
  function studioBlock(text, lang){
    var m = new RegExp('PHRASES:\\s*\\{[\\s\\S]*?\\n\\s*' + lang + ':\\s*\\{').exec(text);
    if (!m) throw new Error('langues.js : langue ' + lang + ' introuvable');
    var at = m.index + m[0].length, a = text.indexOf(MARK[0], at), b = text.indexOf(MARK[1], at), map = {};
    if (a === at + 1 || (a > -1 && text.slice(at, a).trim() === '')){ map = JSON.parse('{' + text.slice(a + MARK[0].length, b).trim().replace(/,$/, '') + '}'); return { from: at, to: b + MARK[1].length, map: map }; }
    return { from: at, to: at, map: map };
  }
  function putBlock(text, blk){
    var keys = Object.keys(blk.map), body = keys.length ? '\n      ' + MARK[0] + '\n' + keys.map(function(k){ return '      ' + JSON.stringify(k) + ': ' + JSON.stringify(blk.map[k]) + ','; }).join('\n') + '\n      ' + MARK[1] : '';
    return text.slice(0, blk.from) + body + text.slice(blk.to);
  }
  /* a French sentence of the site reworded: the translations it had follow the new wording */
  function aliasPhrases(tx, pairs){
    var text = read('langues.js'), w = {}, changed = false, norm = function(t){ return t.replace(/[\u2019\u2018]/g, "'").replace(/\s+/g, ' ').trim(); };
    require('vm').runInNewContext(text, { window: w });
    ['en', 'it'].forEach(function(lang){
      var src = (w.ALAYA_LANGUES.PHRASES || {})[lang] || {}, dico = {}; Object.keys(src).forEach(function(k){ dico[norm(k)] = src[k]; });
      var blk = studioBlock(text, lang), before = JSON.stringify(blk.map);
      pairs.forEach(function(x){ var tr = dico[norm(x[0])]; if (tr && !dico[norm(x[1])]) blk.map[x[1]] = tr; });
      if (JSON.stringify(blk.map) !== before){ text = putBlock(text, blk); changed = true; }
    });
    if (changed){ tx.write('langues.js', text); tx.langues = true; }
    return changed;
  }
  function translationsOf(frs){
    var text = read('langues.js'), out = {};
    ['en', 'it'].forEach(function(lang){ var map = studioBlock(text, lang).map; out[lang] = frs.map(function(fr){ return map[fr] || ''; }); });
    return out;
  }
  function setTranslations(tx, input, p){
    var pairs = [[p.ligne, 'ligne'], [p.description.split('\n\n')[0], 'description']].filter(function(x){ return x[0]; }), changed = false;
    var text = read('langues.js');
    ['en', 'it'].forEach(function(lang){
      var blk = studioBlock(text, lang), before = JSON.stringify(blk.map);
      pairs.forEach(function(x){ var v = typo((input[lang] || {})[x[1]] || ''); if (v) blk.map[x[0]] = v; else delete blk.map[x[0]]; });
      if (JSON.stringify(blk.map) === before) return;
      text = putBlock(text, blk); changed = true;
    });
    if (changed){ tx.write('langues.js', text); tx.langues = true; }
  }

  /* ---------- an existing piece, read from its page ---------- */
  var GROUP = /<div class="gal-groupe" data-couleur="(\w*)" data-pierre="([^"]*)"(?: hidden)?>((?:<div class="gal-vue[^"]*"><img[^>]*><\/div>)+)<\/div>/g;
  function hautOf(h){ var a = h.indexOf('<section class="fiche-haut">'), b = h.indexOf('</section>', a); return a < 0 ? null : { a: a, b: b + '</section>'.length, html: h.slice(a, b + '</section>'.length) }; }
  function hautHTML(p, variants){ return '<section class="fiche-haut">\n  <div class="gal">' + galHTML(p.name, variants, '../../') + '</div>\n  ' + achatHTML(p, variants, '../../') + '\n</section>'; }
  function get(slug){
    var base = all().filter(function(x){ return x.slug === slug; })[0];
    if (!base) throw new Error('pi\u00e8ce inconnue');
    var h = read('piece/' + slug + '/index.html');
    var t = /<div class="fiche-texte">\s*(?:<p class="fiche-ligne">([\s\S]*?)<\/p>)?((?:<p>[\s\S]*?<\/p>)*)/.exec(h) || [], paras = [];
    (t[2] || '').replace(/<p>([\s\S]*?)<\/p>/g, function(a, x){ paras.push(unesc(x)); });
    var ref = /R\u00e9f\u00e9rence du produit : ([^<]*)</.exec(h), ul = /<ul class="attributs">([\s\S]*?)<\/ul>/.exec(h), details = [], re = /<li><span>([^<]*)<\/span>\s*([^<]*)<\/li>/g, m;
    if (ul) while ((m = re.exec(ul[1]))) details.push([unesc(m[1]), unesc(m[2])]);
    var variants = [], g = /<div class="gal">([\s\S]*?)<\/div>\n  <div class="achat"/.exec(h);
    if (g){ GROUP.lastIndex = 0; while ((m = GROUP.exec(g[1]))){ var first = /^<div class="gal-vue[^"]*"><img src="(?:\.\.\/)*([^"]+)"(?: alt="[^"]*")?([^>]*)><\/div>/.exec(m[3]); variants.push({ couleur: m[1], pierre: unesc(m[2]), image: first[1], attrs: first[2] || '', extra: m[3].slice(first[0].length) });   /* attrs: what else the photo's tag carries (the lighter phone versions), kept with the photo */ } }
    var axis = function(a){ var o = base.options.filter(function(x){ return x.a === a; })[0]; return o ? o.v : []; }, size = AXES[base.rayon];
    var p = Object.assign({}, base, { ligne: unesc(t[1] || ''), description: paras.join('\n\n'), reference: ref ? unesc(ref[1]).trim() : '', details: details, variants: variants,
      montures: axis('Monture'), sizes: size ? axis(size.a) : [] });
    /* a page whose gallery and buying card are not what the studio would write (pearl or enamel variants,
       the gift card) keeps them: its name, price and texts are edited in place, nothing else */
    var haut = hautOf(h);
    var arias = []; if (haut) haut.html.replace(/<button class="gal-vign[^>]*aria-label="([^"]*)"/g, function(a, x){ arias.push(unesc(x)); });
    variants.forEach(function(v, i){ if (arias[i]) v.aria = arias[i]; });
    var vat = []; if (haut) haut.html.replace(/<button class="gal-vign[^>]*><img src="[^"]*" alt=""([^>]*)>/g, function(a, x){ vat.push(x); });
    variants.forEach(function(v, i){ v.vattrs = vat[i] || ''; });   /* the thumbnail's own extra attributes, kept too */
    var flat = function(x){ return x.replace(/\s+/g, ' ').replace(/> </g, '><'); };
    p.special = !haut || flat(hautHTML(p, variants)) !== flat(haut.html);
    var tr = translationsOf([p.ligne, paras[0] || '']);
    p.en = { ligne: tr.en[0], description: tr.en[1] }; p.it = { ligne: tr.it[0], description: tr.it[1] };
    return p;
  }

  /* the card of a piece wherever it shows (grids, home, "dans la meme collection" of other pieces): kept where it is, its content rewritten */
  var ANYCARD = /<article class="product-card[^"]*"[\s\S]*?<\/article>/g;
  function patchCards(h, p){
    return h.replace(ANYCARD, function(c){
      var m = new RegExp('href="((?:\\.\\./)*|\\./)piece/' + p.slug + '/index\\.html"').exec(c);
      if (!m) return c;
      return c.replace(/(<img src=")[^"]*(" alt=")[^"]*(")/, '$1' + m[1] + p.image + '$2' + esc(p.name) + '$3').replace(/(<p class="name">)[^<]*(<\/p>)/, '$1' + esc(p.name) + '$2')
        .replace(/(<p class="price">)[^<]*(<\/p>)/, '$1' + prix(p.price) + '$2').replace(/( data-filtres=")[^"]*(")/, '$1' + esc(p.filtres.join('; ')) + '$2');
    });
  }
  function pieceSpan(raw, slug){
    var key = JSON.stringify(slug) + ':{', i = raw.indexOf(key); if (i < 0) return null;
    for (var k = i + key.length - 1, depth = 0, str = false; k < raw.length; k++){
      var c = raw[k];
      if (str){ if (c === '\\') k++; else if (c === '"') str = false; }
      else if (c === '"') str = true; else if (c === '{') depth++; else if (c === '}' && !--depth) return { start: i, end: k + 1 };
    }
    return null;
  }

  /* ---------- change an existing piece ---------- */
  function update(slug, input){
    var cur = get(slug), warnings = [];
    if (!cur.rayon) throw new Error('cette pi\u00e8ce ne se modifie pas ici');
    var name = typo(input.name || '') || cur.name, price = Math.max(0, Number(input.price) || 0);
    var p = { slug: slug, name: name, price: price, rayon: RAYONS[input.rayon] ? input.rayon : cur.rayon, collection: input.collection === '' || COLLECTIONS[input.collection] ? input.collection : cur.collection,
      ligne: typo(input.ligne || ''), description: String(input.description || '').split(/\n\s*\n/).map(typo).filter(Boolean).join('\n\n'), reference: typo(input.reference || ''),
      details: (input.details || []).map(function(r){ return [typo(r[0] || ''), typo(r[1] || '')]; }).filter(function(r){ return r[0] && r[1]; }),
      filtres: (input.filtres || []).map(function(f){ return typo(f); }).filter(Boolean), fiancailles: !!input.fiancailles, mariage: !!input.mariage };
    var tx = begin('Modification de ' + cur.name);
    try {
      var variants = cur.variants, options = cur.options;
      if (!cur.special){
        var photos = Array.isArray(input.photos) ? input.photos : [];
        if (!photos.length) throw new Error('il faut au moins une photo');
        if (photos.length > 12) throw new Error('douze photos au plus');
        var fresh = photos.filter(function(ph){ return ph.data; }), n0 = 1;
        while (fs.existsSync(file('images/carre/studio/' + slug + '/' + slug + '-' + n0 + '.jpg')) || fs.existsSync(file('images/carre/studio/' + slug + '/' + slug + '-' + n0 + '.png')) || fs.existsSync(file('images/carre/studio/' + slug + '/' + slug + '-' + n0 + '.webp'))) n0++;
        var files = savePhotos(tx, slug, fresh, n0, warnings), k = 0;
        variants = photos.map(function(ph, i){
          if (!PASTILLE[ph.couleur]) throw new Error('photo ' + (i + 1) + ' : il faut la couleur de l\u2019or');
          if (ph.data) return { couleur: ph.couleur, pierre: typo(ph.pierre || 'Diamant'), image: files[k++], extra: '' };
          var old = cur.variants.filter(function(v){ return v.image === ph.image; })[0];
          if (!old) throw new Error('photo ' + (i + 1) + ' : image inconnue');
          return { couleur: ph.couleur, pierre: typo(ph.pierre || 'Diamant'), image: old.image, attrs: old.attrs, vattrs: old.vattrs, extra: old.extra, aria: old.couleur === ph.couleur && old.pierre === typo(ph.pierre || 'Diamant') ? old.aria : '' };
        });
        var montures = (input.montures || []).filter(function(v){ return MONTURES.some(function(m){ return m.value === v; }); });
        var pierres = variants.map(function(v){ return v.pierre; }).filter(function(v, i, a){ return a.indexOf(v) === i; }), sizes = (input.sizes || []).map(function(v){ return typo(v); }).filter(Boolean);
        /* the choices keep the order and the names the fiche already has; a new one takes the usual place */
        var was = cur.options.filter(function(o){ return isVariantAxis(o.a); })[0] || { a: 'Pierre principale', l: 'Choisir la pierre' }, made = [];
        if (montures.length > 1) made.push({ a: 'Monture', l: 'Choisir une monture', v: montures });
        if (pierres.length > 1) made.push({ a: was.a, l: was.l, v: pierres.map(function(x){ return valueOf(was.a, x); }) });
        if (AXES[p.rayon] && sizes.length) made.push({ a: AXES[p.rayon].a, l: AXES[p.rayon].l, v: sizes });
        var rank = function(o){ var i = cur.options.map(function(x){ return x.a; }).indexOf(o.a); return i < 0 ? 100 + made.indexOf(o) : i; };
        options = made.slice().sort(function(x, y){ return rank(x) - rank(y); });
      }
      p.options = options; p.image = cur.special ? cur.image : variants[0].image;
      /* the gallery and the buying card are rewritten only when what they show changed: photos, choices, or a price that appears or disappears */
      var shape = function(vs, os){ return JSON.stringify([vs.map(function(v){ return [v.couleur, v.pierre, v.image]; }), os]); };
      var rewrite = !cur.special && (shape(variants, options) !== shape(cur.variants, cur.options) || (price > 0) !== (cur.price > 0));
      if (cur.special && (price > 0) !== (cur.price > 0)) warnings.push('Le bouton d\u2019achat de cette fiche n\u2019a pas \u00e9t\u00e9 chang\u00e9 : elle a une mise en page particuli\u00e8re.');
      var url = ORIGIN + '/piece/' + slug + '/', title = name + ' | Alaya Fine Jewelry', paras = p.description ? p.description.split('\n\n') : [], desc = paras[0] || p.ligne || name;
      tx.update('piece/' + slug + '/index.html', function(h){
        var n = 0;
        h = h.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>')
          .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(desc) + '$2').replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + esc(title) + '$2')
          .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + esc(desc) + '$2').replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + ORIGIN + '/' + p.image + '$2');
        h = h.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, function(all, json){
          var d = JSON.parse(json); n++;
          if (d['@type'] === 'BreadcrumbList'){ var it = d.itemListElement; it[it.length - 1].name = name; if (it.length === 3){ it[1].name = RAYONS[p.rayon].replace('\u2019', '\''); it[1].item = ORIGIN + '/' + p.rayon + '/'; } return ld(d); }
          if (d['@type'] !== 'Product') return all;
          d.name = name; if (p.ligne !== typo(cur.ligne) || p.description !== cur.description.split(/\n\s*\n/).map(typo).filter(Boolean).join('\n\n')) d.description = [p.ligne].concat(paras).filter(Boolean).join(' '); d.image = [ORIGIN + '/' + p.image];
          var mont = p.details.filter(function(r){ return r[0] === 'Monture'; })[0]; if (mont) d.material = mont[1]; else delete d.material;
          if (p.reference) d.sku = p.reference;
          if (price > 0) d.offers = { '@type': 'Offer', price: String(Math.round(price)), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: url, seller: { '@type': 'Organization', name: 'Alaya Fine Jewelry' }, itemCondition: 'https://schema.org/NewCondition' };
          else delete d.offers;
          return ld(d);
        });
        var haut = hautOf(h);
        if (rewrite) h = h.slice(0, haut.a) + hautHTML(p, variants) + h.slice(haut.b);
        else {
          var block = haut.html.replace(/( data-img=")[^"]*(")/, '$1' + p.image + '$2').replace(/(<h1>)[^<]*(<\/h1>)/, '$1' + esc(name) + '$2').replace(/( data-nom=")[^"]*(")/, '$1' + esc(name) + '$2').replace(/( data-prix=")[^"]*(")/, '$1' + pyFloat(price) + '$2')
            .replace(/(<p class="achat-prix">)[^<]*(<\/p>)/, '$1' + prix(price) + '$2').split('alt="' + esc(cur.name)).join('alt="' + esc(name));
          h = h.slice(0, haut.a) + block + h.slice(haut.b);
        }
        h = h.replace(/(<div class="fiche-texte">\s*)(?:<p class="fiche-ligne">[\s\S]*?<\/p>)?(?:<p>[\s\S]*?<\/p>)*/, function(all, a){ return a + (p.ligne ? '<p class="fiche-ligne">' + esc(p.ligne) + '</p>' : '') + paras.map(function(x){ return '<p>' + esc(x) + '</p>'; }).join(''); });
        h = h.replace(/\s*<p class="ref">R\u00e9f\u00e9rence du produit : [^<]*<\/p>/, '');
        if (p.reference) h = h.replace(/(\s*)(<p class="ref">Une question)/, '$1<p class="ref">R\u00e9f\u00e9rence du produit : ' + esc(p.reference) + '</p>$1$2');
        h = h.replace(/<ul class="attributs">[\s\S]*?<\/ul>/, '<ul class="attributs">' + p.details.map(function(r){ return '<li><span>' + esc(r[0]) + '</span> ' + esc(r[1]) + '</li>'; }).join('') + '</ul>');
        h = h.replace(/(<nav class="fil-bas">[\s\S]*?<span class="sep">\|<\/span>)<a href="[^"]*">[^<]*<\/a>(<span class="sep">\|<\/span><span>)[^<]*(<\/span><\/nav>)/, '$1<a href="../../' + p.rayon + '/index.html">' + esc(RAYONS[p.rayon].replace('\u2019', '\'')) + '</a>$2' + esc(name) + '$3');
        return h;
      });
      /* its card, everywhere it already is */
      htmlFiles().forEach(function(rel){ if (rel !== 'piece/' + slug + '/index.html') tx.update(rel, function(h){ return h.indexOf('piece/' + slug + '/index.html') < 0 ? h : patchCards(h, p); }); });
      /* then the pages it enters or leaves */
      var want = targets(p);
      LISTS.forEach(function(key){ var has = cur.pages.indexOf(key) >= 0, should = want.indexOf(key) >= 0; if (has !== should) setMembership(tx, key, p, should); });
      var entry = { n: name, p: price, i: p.image, u: 'piece/' + slug + '/index.html', o: rewrite ? options : cur.options, im: rewrite ? variants.map(function(v){ return v.image; }) : cur.images };   /* photos untouched: the list the site had stays */
      tx.update('pieces.js', function(raw){ var sp = pieceSpan(raw, slug); if (!sp) throw new Error('pieces.js : entr\u00e9e introuvable'); return raw.slice(0, sp.start) + entryText(slug, entry) + raw.slice(sp.end); });
      setTranslations(tx, input, p);
      syncPaiement(tx);
      syncRecherche(tx, slug, p);
      refreshSite(tx, tx.stamp.slice(0, 16).replace(/[-T]/g, ''));
      piecesMap();
      return { slug: slug, pages: want, warnings: warnings };
    } catch (e){ tx.rollback(); throw e; }
  }

  /* ---------- take a piece off the site: its page, its cards, its line in pieces.js and in the sitemap. The photos stay on the disk. ---------- */
  function remove(slug){
    var cur = all().filter(function(x){ return x.slug === slug; })[0];
    if (!cur) throw new Error('pi\u00e8ce inconnue');
    var tx = begin('Retrait de ' + cur.name);
    try {
      cur.pages.forEach(function(key){ setMembership(tx, key, cur, false); });
      htmlFiles().forEach(function(rel){ if (rel !== cur.url) tx.update(rel, function(h){ return h.indexOf('piece/' + slug + '/index.html') < 0 ? h : h.replace(ANYCARD, function(c){ return c.indexOf('piece/' + slug + '/index.html"') >= 0 ? '' : c; }); }); });
      tx.remove(cur.url);
      tx.update('pieces.js', function(raw){ var sp = pieceSpan(raw, slug), a = sp.start, b = sp.end; if (raw[b] === ',') b++; else if (raw[a - 1] === ',') a--; return raw.slice(0, a) + raw.slice(b); });
      syncPaiement(tx);
      syncRecherche(tx, slug, null);
      tx.update('sitemap.xml', function(x){ return x.split('\n').filter(function(l){ return l.indexOf('<loc>' + ORIGIN + '/piece/' + slug + '/</loc>') < 0; }).join('\n'); });
      refreshSite(tx, tx.stamp.slice(0, 16).replace(/[-T]/g, ''));
      piecesMap();
      return { slug: slug, name: cur.name };
    } catch (e){ tx.rollback(); throw e; }
  }

  return { all: all, vocab: vocab, syncPaiement: syncPaiement, py0: py0, aliasPhrases: aliasPhrases, get: get, update: update, remove: remove, hautHTML: hautHTML, add: add, setSections: setSections, undo: undo, lastSave: lastSave, slugify: slugify,
           /* for the checks */ rebuild: rebuild, LISTS: LISTS, listFile: listFile, read: read, htmlFiles: htmlFiles, refreshSite: refreshSite, begin: begin };
};
