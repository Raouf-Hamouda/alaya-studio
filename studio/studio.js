/* ===========================================================
   LE STUDIO ALAYA, SUR LE MODELE DU STUDIO INSTINCT (4 octobre 2026).

   Des familles dans le rail : Pieces, Site, Atelier, Mailing, Comptes.
   Une table par objet. Une ligne ouvre sa fiche a droite et la table garde
   sa place. Les pieces sont celles du site, lues par le programme dans
   pieces.js et dans les pages de rayon : le studio n'en garde aucune copie.

   Etat du 4 octobre : les pieces se lisent, une piece s'ajoute (formulaire), une
   piece existante entre ou sort de Fiancailles et de Mariage, la derniere ecriture
   s'annule. Les textes du site, les documents de l'atelier et le mailing ont leur
   place dans le menu et s'ouvrent sur un ecran d'attente.
   =========================================================== */
(function(){
'use strict';

var API = '../api/', SITE = '../site/';
function el(id){ return document.getElementById(id); }
function node(tag, cls, parent, text){ var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; if (parent) parent.appendChild(n); return n; }
function txt(v){ return v === undefined || v === null ? '' : String(v); }
function api(path, opts){
  opts = opts || {};
  var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'alaya' } };
  if (opts.json !== undefined){ init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.json); }
  return fetch(API + path, init).then(function(r){ return r.text().then(function(t){ var b = {}; try { b = t ? JSON.parse(t) : {}; } catch (e){ b = { error: t }; } return { ok: r.ok, status: r.status, body: b }; }); });
}
function toast(msg, bad){ var t = node('div', 'toast' + (bad ? ' bad' : ''), el('toasts'), msg); setTimeout(function(){ t.remove(); }, bad ? 5000 : 2600); }
function euros(p){ return p > 0 ? p.toLocaleString('fr-FR') + ' €' : 'Sur demande'; }
var ICON = {
  piece: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="15" r="6"/><path d="m9.5 4h5l2 3-4.5 3-4.5-3z"/></svg>',
  site: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg>',
  atelier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/></svg>',
  vente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  compte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>'
};
function svg(name){ var s = document.createElement('span'); s.innerHTML = ICON[name] || ''; return s.firstChild; }

/* ---------- THE PLUG-IN POINT (4 October). A screen of the studio that lives in its own file
   (textes.js, atelier.js, mailing.js, comptes.js) registers here:
     STUDIO.register('devis', function(host, item){ ... draw inside host ... })
   `host` is the empty <section class="pages"> under the bar; the key is the menu item's key.
     STUDIO.menu('Atelier', [ {group:'..'}, {label:'..', key:'..'} ])  replaces a family's sub-menu.
   Helpers: STUDIO.el, node, txt, api (same-origin JSON, returns {ok,status,body}), toast(msg, bad),
   S (the state: S.me, S.pieces, S.vocab), redraw(), reload(), title(text), count(text),
   panel(kind) -> {body, foot, close} the record sheet on the right, closePanel(). ---------- */
var MENU = [];
var STUDIO = window.STUDIO = { screens: {}, menus: {}, el: el, node: node, txt: txt, api: api, toast: toast,
  register: function(key, draw){ STUDIO.screens[key] = draw; },
  menu: function(title, items){ STUDIO.menus[title] = items; MENU.forEach(function(f){ if (f.title === title) f.items = items; }); },
  title: function(t){ el('title').textContent = t; }, count: function(t){ el('count').textContent = t; },
  redraw: function(){ draw(); }, reload: function(){ return load(); },
  panel: function(kind){
    var panel = el('panel'); panel.hidden = false; panel.innerHTML = ''; S.open = null;
    var head = node('div', 'phead', panel); node('span', 'kind', head, kind);
    var x = node('button', 'x', head, '\u00d7'); x.title = 'Fermer'; x.setAttribute('aria-label', 'Fermer'); x.addEventListener('click', STUDIO.closePanel);
    return { head: head, body: node('div', 'pbody', panel), foot: node('div', 'pfoot', panel), close: STUDIO.closePanel };
  },
  closePanel: function(){ S.open = null; el('panel').hidden = true; el('panel').innerHTML = ''; } };

/* ---------- the state: what the program holds, read once ---------- */
var S = STUDIO.S = { me: null, pieces: [], rayons: {}, collections: {}, vocab: null, last: null, object: 'pieces', filter: null, q: '', open: null, family: null };

function load(){
  return Promise.all([api('me'), api('pieces')]).then(function(rs){
    if (!rs[0].ok){ location.replace('login'); return; }
    S.me = rs[0].body;
    if (rs[1].ok){ S.pieces = rs[1].body.pieces; S.vocab = rs[1].body.vocab; S.rayons = S.vocab.rayons; S.collections = S.vocab.collections; S.last = rs[1].body.last; }
    else toast('Les pièces du site ne se lisent pas : ' + (rs[1].body.error || rs[1].status), true);
    el('who').textContent = S.me.name || S.me.email;
    if (!MENU.length) buildMenu();
    draw();
  });
}
function shown(){ return S.pieces.filter(function(p){ return !S.filter || p[S.filter.by] === S.filter.key; }); }
function countBy(by, key){ return S.pieces.filter(function(p){ return p[by] === key; }).length; }

/* ---------- the menu: the families of the rail, each with its sub-menu ---------- */
/* an item with `key` and no `soon` is built; `soon` is the line the waiting screen prints */
function buildMenu(){
  var pieces = [{ label: 'Toutes les pièces', key: 'pieces', filter: null }, { label: 'Ajouter une pièce', key: 'ajout', form: true }, { group: 'Rayons' }];
  Object.keys(S.rayons).forEach(function(k){ pieces.push({ label: S.rayons[k], key: 'pieces', filter: { by: 'rayon', key: k } }); });
  pieces.push({ group: 'Collections' });
  Object.keys(S.collections).forEach(function(k){ pieces.push({ label: S.collections[k], key: 'pieces', filter: { by: 'collection', key: k } }); });
  MENU = [
    { title: 'Pièces', icon: 'piece', n: function(){ return S.pieces.length; }, items: pieces },
    { title: 'Site', icon: 'site', items: [
      { label: 'Textes des pages', key: 'textes', soon: 'Les textes de chaque page du site, modifiables sur place : accueil, la maison, guide du diamant, pages légales.' },
      { label: 'Images', key: 'images', soon: 'Les images éditoriales du site, à remplacer une par une.' }] },
    { title: 'Atelier', icon: 'atelier', items: [
      { group: 'Certificats' },
      { label: 'Diamants', key: 'cert-diamants', soon: 'Les certificats de diamant, repris du back-office existant et redessinés.' },
      { label: 'Bagues et bijoux', key: 'cert-bijoux', soon: 'Les certificats de pièce, repris du back-office existant et redessinés.' },
      { label: 'Gemmes', key: 'cert-gemmes', soon: 'Les certificats de gemme, repris du back-office existant et redessinés.' },
      { group: 'Documents' },
      { label: 'Devis', key: 'devis', soon: 'Les devis, repris du back-office existant.' },
      { label: 'Factures', key: 'factures', soon: 'Les factures, reprises du back-office existant.' },
      { label: 'Bons de livraison', key: 'livraisons', soon: 'Les bons de livraison, repris du back-office existant.' }] },
    { title: 'Mailing', icon: 'mail', items: [
      { label: 'Contacts', key: 'contacts', soon: 'La liste des contacts de la maison.' },
      { label: 'Nouvel envoi', key: 'envoi', soon: 'L’écriture d’un envoi, avec son aperçu.' },
      { label: 'Envois', key: 'envois', soon: 'Les envois passés et leur suivi.' }] },
    { title: 'Ventes', icon: 'vente', items: [{ label: 'Commandes', key: 'commandes', soon: 'Les commandes payées en ligne.' }, { label: 'Paiement', key: 'paiement', soon: 'L’état du paiement en ligne.' }] },
    { title: 'Comptes', icon: 'compte', admin: true, items: [{ label: 'Tous les comptes', key: 'comptes', soon: 'Les comptes du studio : créer, changer un rôle, retirer.' }] },
    { title: 'Le site', icon: 'link', door: SITE + 'index.html', items: [] }
  ];
  MENU.forEach(function(f){ if (STUDIO.menus[f.title]) f.items = STUDIO.menus[f.title]; });
  S.family = MENU[0];
}
function currentItem(){ return S.family.items.filter(function(it){ return it.key === S.object && JSON.stringify(it.filter || null) === JSON.stringify(S.filter); })[0] || S.family.items.filter(function(it){ return it.key; })[0]; }
function go(fam, it){ S.family = fam; S.object = it.key; S.filter = it.filter || null; S.open = null; S.q = ''; el('q').value = ''; el('panel').hidden = true; draw(); window.scrollTo(0, 0); }
function drawSide(){
  var rail = el('railitems'), box = el('objects'); rail.innerHTML = ''; box.innerHTML = '';
  MENU.forEach(function(f){
    if (f.admin && S.me.role !== 'admin') return;
    var b = node('button', f === S.family ? 'cur' : '', rail); b.appendChild(svg(f.icon)); node('span', '', b, f.title);
    if (f.n) node('span', 'n', b, String(f.n()));
    b.addEventListener('click', function(){ if (f.door){ window.open(f.door, '_blank', 'noopener'); return; } go(f, f.items.filter(function(it){ return it.key; })[0]); });
  });
  var head = el('subhead'); head.innerHTML = ''; node('span', '', head, S.family.title);
  var cur = currentItem();
  S.family.items.forEach(function(it){
    if (it.group){ node('div', 'group', box, it.group); return; }
    var b = node('button', 'sub' + (it === cur ? ' cur' : ''), box); node('span', '', b, it.label);
    if (it.key === 'pieces') node('span', 'n', b, String(it.filter ? countBy(it.filter.by, it.filter.key) : S.pieces.length));
    b.addEventListener('click', function(){ go(S.family, it); });
  });
}

/* ---------- the table ---------- */
function th(tr, label){ return node('th', '', tr, label); }
function td(tr, text, cls){ return node('td', cls || '', tr, text); }
function drawTable(){
  var it = currentItem(), table = el('table'), thead = table.tHead, tbody = table.tBodies[0], pages = el('pages');
  thead.innerHTML = ''; tbody.innerHTML = ''; pages.innerHTML = '';
  el('title').textContent = it.label; el('count').textContent = '';
  var isPage = !!it.soon || !!it.form || !!STUDIO.screens[it.key];
  pages.hidden = !isPage; table.parentNode.hidden = isPage; el('q').parentNode.hidden = isPage;
  var nb = el('new'); nb.hidden = it.key !== 'pieces'; nb.textContent = '+ Ajouter une pièce';
  var ub = el('undo'); ub.hidden = !S.last || S.me.role !== 'admin'; if (S.last) ub.title = S.last.what + ', ' + new Date(S.last.at).toLocaleString('fr-FR') + ' (' + S.last.files + ' fichiers)';
  if (it.form){ if (!FA) FA = blank(); drawForm(pages, FA); return; }
  if (STUDIO.screens[it.key]){ STUDIO.screens[it.key](pages, it); return; }
  if (isPage){
    var em = node('div', 'empty', pages); node('b', '', em, it.label); node('span', 'sub', em, it.soon).style.whiteSpace = 'normal'; node('span', 'sub', em, 'Cette partie se construit à l’étape suivante.');
    return;
  }
  var hr = node('tr', '', thead), n = 0;
  th(hr, 'Pièce'); th(hr, 'Rayon'); th(hr, 'Collection'); th(hr, 'Prix'); th(hr, 'Montures'); th(hr, 'Photos'); th(hr, '');
  shown().forEach(function(p){
    if (S.q && (p.name + ' ' + p.slug).toLocaleLowerCase().indexOf(S.q) < 0) return; n++;
    var tr = node('tr', '', tbody), first = node('td', 'first', tr), t = node('span', 'th sq', first);
    if (p.image){ var im = node('img', '', t); im.alt = ''; im.loading = 'lazy'; im.src = SITE + p.image; im.addEventListener('error', function(){ im.remove(); }); }
    first.appendChild(document.createTextNode(p.name));
    td(tr, S.rayons[p.rayon] || '', 'mute'); td(tr, S.collections[p.collection] || '', 'mute'); td(tr, euros(p.price), 'num');
    var montures = p.options.filter(function(o){ return o.a === 'Monture'; })[0];
    td(tr, montures ? String(montures.v.length) : '', 'num'); td(tr, String(p.images.length), 'num');
    var door = node('td', 'door', tr), a = node('a', 'btn small', door, 'Voir ↗'); a.href = SITE + p.url; a.target = '_blank'; a.rel = 'noopener'; a.addEventListener('click', function(e){ e.stopPropagation(); });
    tr.tabIndex = 0; tr.addEventListener('click', function(){ openPiece(p.slug); }); tr.addEventListener('keydown', function(e){ if (e.target === tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openPiece(p.slug); } });
    if (S.open === p.slug) tr.classList.add('cur');
  });
  el('count').textContent = n + (S.q ? ' trouvées' : '');
  if (!n){ var e = node('tr', '', tbody), c = node('td', 'emptycell', e); c.colSpan = 7; node('div', 'note', c, S.q ? 'Rien ne correspond.' : 'Aucune pièce ici.'); }
}

/* ---------- the record panel: the piece as the site holds it, read only for now ---------- */
function openPiece(slug){ S.open = slug; draw(); }
function field(box, label, value){ var f = node('div', 'field', box); node('label', '', f, label); node('div', 'v' + (value ? '' : ' mute'), f, value || 'Aucune'); }
/* the record of a piece IS its form: what the site holds, read from its page, changed on one press */
var E = null;
function drawPanel(){
  var panel = el('panel');
  if (!S.pieces.some(function(x){ return x.slug === S.open; })){ panel.hidden = true; return; }
  if (E && E.slug === S.open && panel.querySelector('.formpiece')){ panel.hidden = false; return; }   /* the table redrawn under an open form: what is typed stays */
  panel.hidden = false; panel.innerHTML = '';
  var head = node('div', 'phead', panel); node('span', 'kind', head, 'Pièce');
  var x = node('button', 'x', head, '×'); x.title = 'Fermer'; x.setAttribute('aria-label', 'Fermer'); x.addEventListener('click', closePanel);
  var body = node('div', 'pbody', panel), slug = S.open; node('p', 'note', body, 'Lecture de la fiche…');
  api('pieces/' + slug).then(function(r){
    if (S.open !== slug) return;
    body.innerHTML = '';
    if (!r.ok){ node('p', 'note', body, 'Cette fiche ne se lit pas : ' + (r.body.error || r.status)); return; }
    var p = r.body;
    E = { slug: slug, special: p.special, name: p.name, rayon: p.rayon || 'bagues', collection: p.collection, price: p.price > 0 ? String(p.price) : '', fiancailles: p.fiancailles, mariage: p.mariage,
      photos: p.variants.map(function(v){ return { image: v.image, couleur: v.couleur || 'blanc', pierre: v.pierre, name: v.image.split('/').pop() }; }),
      montures: p.montures, sizes: p.sizes.join(', '), ligne: p.ligne, description: p.description, reference: p.reference, details: p.details.length ? p.details : [['', '']], filtres: p.filtres,
      ligneEn: p.en.ligne, descEn: p.en.description, ligneIt: p.it.ligne, descIt: p.it.description, pages: p.pages, url: p.url, locked: !p.rayon };
    drawForm(body, E, true);
  });
}
function closePanel(){ S.open = null; E = null; el('panel').hidden = true; el('panel').innerHTML = ''; drawTable(); }
function draw(){ drawSide(); drawTable(); if (S.open) drawPanel(); }

/* ---------- the names of the list pages, as the site's menu says them ---------- */
var PAGES = { 'toute-la-collection': 'Toute la collection', 'mariages-et-celebrations': 'Mariages & Célébrations', 'mariages-et-celebrations/fiancailles': 'Fiançailles',
  'mariages-et-celebrations/bagues-de-fiancailles': 'Bagues de fiançailles', 'mariages-et-celebrations/mariage': 'Mariage', 'cadeaux/pour-elle': 'Cadeaux pour elle',
  'cadeaux/fiancailles': 'Cadeaux de fiançailles', 'cadeaux/mariage': 'Cadeaux de mariage', 'cadeaux/moins-de-1500': 'Cadeaux à moins de 1 500 €',
  'cadeaux/de-1500-a-5000': 'Cadeaux de 1 500 à 5 000 €', 'cadeaux/plus-de-5000': 'Cadeaux à plus de 5 000 €' };
function pageLabel(key){ return PAGES[key] || S.rayons[key] || S.collections[key.replace('collections/', '')] || key; }
/* where a piece will appear: the same rule the program applies when it writes */
function targets(f){
  var M = 'mariages-et-celebrations', t = [f.rayon, 'toute-la-collection', 'cadeaux/pour-elle'];
  if (f.collection) t.push('collections/' + f.collection);
  if (f.fiancailles){ t.push(M + '/fiancailles', 'cadeaux/fiancailles'); if (f.rayon === 'bagues') t.push(M + '/bagues-de-fiancailles'); }
  if (f.mariage) t.push(M + '/mariage', 'cadeaux/mariage');
  if (f.fiancailles || f.mariage) t.push(M);
  if (f.price > 0) t.push('cadeaux/' + (f.price < 1500 ? 'moins-de-1500' : (f.price <= 5000 ? 'de-1500-a-5000' : 'plus-de-5000')));
  return t;
}
function slugify(t){ return txt(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }

/* ---------- the form: a new piece, written in the site on one press ---------- */
/* what is typed is kept here, so moving in the menu and coming back loses nothing */
var FA = null;
function blank(){ return { ligneEn: '', descEn: '', ligneIt: '', descIt: '', name: '', rayon: 'bagues', collection: '', price: '', fiancailles: false, mariage: false, photos: [], montures: [], sizes: null, ligne: '', description: '', reference: '', details: [['', '']], filtres: [] }; }
function drawForm(host, F, edit){
  var V = S.vocab;
  if (F.sizes === null) F.sizes = V.axes[F.rayon] ? V.axes[F.rayon].v.join(', ') : '';
  var wrap = node('div', 'formpiece', host), admin = S.me.role === 'admin';
  if (edit && F.special) node('p', 'note', wrap, 'Cette fiche a une mise en page particulière (la carte cadeau) : son nom, son prix, ses textes et ses sections se modifient ici ; ses photos et ses choix restent tels quels.');
  function sec(title, hint){ var h = node('div', 'sec', wrap); node('h3', '', h, title); if (hint) node('span', 'count', h, hint); return node('div', 'fields sender', wrap); }
  function row(box, label, tall){ var f = node('div', 'field' + (tall ? ' tall' : ''), box); node('label', '', f, label); return f; }
  function input(box, label, key, ph, type){ var f = row(box, label), i = node('input', '', f); i.type = type || 'text'; i.value = F[key]; if (ph) i.placeholder = ph; i.addEventListener('input', function(){ F[key] = i.value; where(); }); return i; }
  function area(box, label, key, ph, rows){ var f = row(box, label, true), a = node('textarea', '', f); a.rows = rows; a.value = F[key]; a.placeholder = ph; a.addEventListener('input', function(){ F[key] = a.value; }); return a; }
  function select(box, label, key, options){ var f = row(box, label), se = node('select', '', f); f.classList.add('half'); options.forEach(function(o){ var op = node('option', '', se, o[1]); op.value = o[0]; }); se.value = F[key]; return se; }
  function checks(box, label, list, key){ var f = row(box, label, true), g = node('div', 'checks', f); list.forEach(function(o){ var l = node('label', 'option-row', g), c = node('input', '', l); c.type = 'checkbox'; c.checked = F[key].indexOf(o[0]) >= 0; node('span', '', l, o[1]); c.addEventListener('change', function(){ F[key] = F[key].filter(function(x){ return x !== o[0]; }); if (c.checked) F[key].push(o[0]); }); }); }

  var a = sec('La pièce');
  var nameI = input(a, 'Nom', 'name', 'Bague Livia'), adr = node('div', 'fhint', nameI.parentNode);
  var ray = select(a, 'Rayon', 'rayon', Object.keys(V.rayons).map(function(k){ return [k, V.rayons[k]]; }));
  ray.addEventListener('change', function(){ F.rayon = ray.value; F.sizes = V.axes[F.rayon] ? V.axes[F.rayon].v.join(', ') : ''; redraw(); });
  if (edit && F.locked){ ray.disabled = true; }
  var col = select(a, 'Collection', 'collection', [['', 'Aucune']].concat(Object.keys(V.collections).map(function(k){ return [k, V.collections[k]]; })));
  col.addEventListener('change', function(){ F.collection = col.value; where(); });
  var priceI = input(a, 'Prix en euros', 'price', 'Vide = Prix sur demande', 'number'); priceI.min = 0; priceI.step = 1; priceI.parentNode.classList.add('half');

  var b = sec('Où elle paraît');
  var sf = row(b, 'Sections', true), sg = node('div', 'checks', sf);
  [['fiancailles', 'Fiançailles'], ['mariage', 'Mariage']].forEach(function(o){ var l = node('label', 'option-row', sg), c = node('input', '', l); c.type = 'checkbox'; c.checked = F[o[0]]; node('span', '', l, o[1]); c.addEventListener('change', function(){ F[o[0]] = c.checked; where(); }); });
  var wf = row(b, 'Pages du site', true), wv = node('div', 'note', wf);
  function where(){
    var slug = edit ? F.slug : slugify(F.name), taken = !edit && S.pieces.some(function(p){ return p.slug === slug; });
    adr.textContent = slug ? (taken ? 'Cette adresse existe déjà : piece/' + slug + '/' : 'Adresse : piece/' + slug + '/' + (edit ? ' (elle ne change pas)' : '')) : ''; adr.style.color = taken ? 'var(--danger)' : '';
    wv.textContent = targets({ rayon: F.rayon, collection: F.collection, fiancailles: F.fiancailles, mariage: F.mariage, price: +F.price || 0 }).map(pageLabel).join(' · ') + ' · la recherche · le plan du site';
  }

  var c = sec('Photos', 'la première est la vignette ; une photo par monture ou par pierre');
  var pf = row(c, 'Fichiers', true), pbox = node('div', '', pf), plist = node('div', 'photos', pbox);
  var drop = node('label', 'dropzone', pbox); node('span', 'plus', drop, '+'); var dzt = node('span', 'dztext', drop); node('b', '', dzt, 'Ajouter des photos'); node('span', '', dzt, 'JPEG, PNG ou WebP, sur fond blanc. Le studio les met au carré comme les autres.');
  var fi = node('input', '', drop); fi.type = 'file'; fi.accept = 'image/jpeg,image/png,image/webp'; fi.multiple = true; fi.hidden = true;
  function take(files){ Array.prototype.forEach.call(files, function(file){ if (!/^image\/(jpeg|png|webp)$/.test(file.type)){ toast(file.name + ' : il faut un JPEG, un PNG ou un WebP', true); return; } var r = new FileReader(); r.onload = function(){ F.photos.push({ data: r.result, couleur: 'blanc', pierre: 'Diamant', name: file.name }); photos(); }; r.readAsDataURL(file); }); }
  fi.addEventListener('change', function(){ take(fi.files); fi.value = ''; });
  drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.classList.add('hot'); }); drop.addEventListener('dragleave', function(){ drop.classList.remove('hot'); });
  drop.addEventListener('drop', function(e){ e.preventDefault(); drop.classList.remove('hot'); take(e.dataTransfer.files); });
  if (!el('pierres-list')){ var dl = node('datalist', '', document.body); dl.id = 'pierres-list'; V.pierres.forEach(function(x){ node('option', '', dl).value = x; }); }
  function photos(){
    plist.innerHTML = '';
    F.photos.forEach(function(ph, k){
      var r = node('div', 'photo', plist), im = node('img', '', r); im.src = ph.data || SITE + ph.image; im.alt = '';
      var nm = node('div', 'nm', r); node('b', '', nm, k ? 'Photo ' + (k + 1) : 'Vignette'); node('span', '', nm, ph.name);
      var se = node('select', '', r); se.setAttribute('aria-label', 'Couleur de l’or'); [['blanc', 'Or blanc'], ['rose', 'Or rose'], ['jaune', 'Or jaune']].forEach(function(o){ var op = node('option', '', se, o[1]); op.value = o[0]; }); se.value = ph.couleur; se.addEventListener('change', function(){ ph.couleur = se.value; });
      var pi = node('input', '', r); pi.setAttribute('aria-label', 'Pierre'); pi.setAttribute('list', 'pierres-list'); pi.value = ph.pierre; pi.addEventListener('input', function(){ ph.pierre = pi.value; });
      if (k){ var up = node('button', 'sign', r, '↑'); up.type = 'button'; up.title = 'Monter'; up.addEventListener('click', function(){ F.photos.splice(k - 1, 0, F.photos.splice(k, 1)[0]); photos(); }); } else node('span', '', r);
      var x = node('button', 'sign x', r, '×'); x.type = 'button'; x.title = 'Retirer'; x.addEventListener('click', function(){ F.photos.splice(k, 1); photos(); });
    });
  }
  photos();
  if (edit && F.special){ c.hidden = true; c.previousSibling.hidden = true; }

  var d = sec('Ce qui se choisit');
  checks(d, 'Montures', V.montures.map(function(m){ return [m.value, m.value]; }), 'montures');
  if (V.axes[F.rayon]){ var si = input(d, V.axes[F.rayon].l, 'sizes', ''); node('div', 'fhint', si.parentNode, 'Séparées par des virgules. Vide = pas de choix de taille.'); }

  if (edit && F.special){ d.hidden = true; d.previousSibling.hidden = true; }

  var e = sec('Les textes');
  area(e, 'La phrase de dessin', 'ligne', 'Ce qu’est la pièce, en une ou deux phrases. Elle s’affiche en grand sous la photo.', 3);
  area(e, 'La description', 'description', 'Bague Livia, or blanc ou rose 750/1000, sertie de… Elle sert aussi à Google.', 3);
  input(e, 'Référence', 'reference', 'Facultative');
  var tr = sec('Traductions', 'facultatives : vide, le site traduit avec son vocabulaire de joaillerie');
  area(tr, 'Phrase de dessin, anglais', 'ligneEn', '', 2); area(tr, 'Description, anglais', 'descEn', '', 2);
  area(tr, 'Phrase de dessin, italien', 'ligneIt', '', 2); area(tr, 'Description, italien', 'descIt', '', 2);

  var g = sec('Dans le détail', edit ? 'les lignes de la fiche, telles qu’elles s’affichent' : 'la monture s’écrit toute seule');
  var df = row(g, 'Lignes', true), dbox = node('div', '', df), rows = node('div', 'crows', dbox);
  if (!el('details-list')){ var dl2 = node('datalist', '', document.body); dl2.id = 'details-list'; V.details.forEach(function(x){ node('option', '', dl2).value = x; }); }
  function details(){
    rows.innerHTML = '';
    F.details.forEach(function(r, k){
      var rw = node('div', 'crow', rows), li = node('input', '', rw); li.placeholder = 'Pierre principale'; li.setAttribute('list', 'details-list'); li.setAttribute('aria-label', 'Intitulé'); li.value = r[0]; li.addEventListener('input', function(){ r[0] = li.value; });
      var vi = node('input', '', rw); vi.placeholder = 'Diamant 0,50 ct'; vi.setAttribute('aria-label', 'Valeur'); vi.value = r[1]; vi.addEventListener('input', function(){ r[1] = vi.value; });
      var x = node('button', 'sign x', rw, '×'); x.type = 'button'; x.title = 'Retirer la ligne'; x.addEventListener('click', function(){ F.details.splice(k, 1); details(); });
    });
  }
  details();
  var ad = node('button', 'btn small', dbox, '+ Ajouter une ligne'); ad.type = 'button'; ad.style.marginTop = '8px'; ad.addEventListener('click', function(){ F.details.push(['', '']); details(); });

  var h = sec('Filtres de la grille', 'facultatifs');
  checks(h, 'Serti', V.filtres.filter(function(f){ return f.indexOf('Forme ') !== 0; }).map(function(f){ return [f, f]; }), 'filtres');
  checks(h, 'Forme de la pierre', V.filtres.filter(function(f){ return f.indexOf('Forme ') === 0; }).map(function(f){ return [f, f.slice(6)]; }), 'filtres');

  var foot = node('div', 'actions marks formfoot', wrap), goB = node('button', 'mark', foot, edit ? 'Enregistrer sur le site' : 'Ajouter au site'), clr = node('button', 'btn', foot, 'Vider le formulaire'), msg = node('span', 'note', foot, '');
  goB.hidden = !admin; clr.hidden = !!edit;
  clr.type = 'button'; clr.addEventListener('click', function(){ if (confirm('Vider le formulaire ?')){ FA = blank(); host.innerHTML = ''; drawForm(host, FA); } });
  if (edit){
    var see = node('a', 'btn', foot, 'Voir sur le site ↗'); see.href = SITE + F.url; see.target = '_blank'; see.rel = 'noopener'; see.style.textDecoration = 'none';
    var del = node('button', 'mark gone', foot, 'Retirer du site'); del.type = 'button'; del.hidden = !admin; del.style.marginLeft = 'auto';
    del.addEventListener('click', function(){
      if (!confirm('Retirer ' + F.name + ' du site ?\nSa fiche, ses vignettes et sa ligne dans la recherche sont enlevées. Les photos restent sur le disque, et « Annuler la dernière écriture » la remet.')) return;
      del.disabled = true;
      api('pieces/' + F.slug, { method: 'DELETE' }).then(function(r){ if (!r.ok){ del.disabled = false; toast('Non retirée : ' + (r.body.error || r.status), true); return; } toast(r.body.name + ' est retirée du site.'); S.open = null; E = null; el('panel').hidden = true; load(); });
    });
  }
  goB.addEventListener('click', function(){
    if (!F.name.trim()){ toast('Il faut un nom.', true); nameI.focus(); return; }
    if (!F.photos.length && !(edit && F.special)){ toast('Il faut au moins une photo.', true); return; }
    goB.disabled = true; msg.textContent = 'Écriture dans le site…';
    var body = { name: F.name, rayon: F.rayon, collection: F.collection, price: +F.price || 0, fiancailles: F.fiancailles, mariage: F.mariage, montures: F.montures, ligne: F.ligne, description: F.description, reference: F.reference,
      sizes: V.axes[F.rayon] ? F.sizes.split(',') : [], details: F.details, filtres: F.filtres, photos: F.photos.map(function(p){ return { data: p.data, image: p.image, couleur: p.couleur, pierre: p.pierre }; }),
      en: { ligne: F.ligneEn, description: F.descEn }, it: { ligne: F.ligneIt, description: F.descIt } };
    var label = F.name.trim();
    api(edit ? 'pieces/' + F.slug : 'pieces', { method: edit ? 'PUT' : 'POST', json: body }).then(function(r){
      goB.disabled = false; msg.textContent = '';
      if (!r.ok){ toast((edit ? 'Non enregistrée : ' : 'Non ajoutée : ') + (r.body.error || r.status), true); return; }
      (r.body.warnings || []).forEach(function(w){ toast(w, true); });
      toast(edit ? label + ' est enregistrée sur le site.' : label + ' est sur le site, dans ' + r.body.pages.length + ' pages.');
      var slug = r.body.slug; if (edit) E = null; else FA = null;
      load().then(function(){ S.family = MENU[0]; S.object = 'pieces'; S.filter = null; S.open = slug; draw(); });
    })['catch'](function(){ goB.disabled = false; msg.textContent = ''; toast('Le serveur n’a pas répondu.', true); });
  });
  function redraw(){ host.innerHTML = ''; drawForm(host, F, edit); }
  where();
}

el('q').addEventListener('input', function(){ S.q = this.value.trim().toLocaleLowerCase(); drawTable(); });
el('new').addEventListener('click', function(){ go(MENU[0], MENU[0].items[1]); });
el('undo').addEventListener('click', function(){
  if (!S.last || !confirm('Annuler la dernière écriture ?\n' + S.last.what + ' (' + S.last.files + ' fichiers du site remis comme avant)')) return;
  api('annuler', { method: 'POST' }).then(function(r){ if (!r.ok){ toast('Non annulé : ' + (r.body.error || r.status), true); return; } toast('Annulé : ' + r.body.what); S.open = null; el('panel').hidden = true; load(); });
});
el('logout').addEventListener('click', function(){ api('logout', { method: 'POST' }).then(function(){ location.replace('login'); }); });
document.addEventListener('keydown', function(e){ if (e.key !== 'Escape' || el('panel').hidden) return; if (S.open) closePanel(); else STUDIO.closePanel(); });
/* the first read waits for every screen file to have registered */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
