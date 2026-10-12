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
  /* 10 octobre : un pictogramme par rayon */
  bagues: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.5" r="6.5"/><path d="M9 3.5h6l2.2 3.2L12 9.6 6.8 6.7z"/><path d="M9 3.5l3 6.1 3-6.1"/></svg>',
  alliances: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="13" r="6"/><circle cx="15" cy="11" r="6"/></svg>',
  bracelets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 15 0"/><path d="M4.5 12a7.5 7.5 0 0 1 3.2-6.1M19.5 12a7.5 7.5 0 0 0-3.2-6.1"/><circle cx="12" cy="4.5" r="1.6"/></svg>',
  colliers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5c0 7 3.5 10 8 10s8-3 8-10"/><path d="M12 15v2.2"/><path d="M12 17.2l2.6 2.3L12 22l-2.6-2.5z"/></svg>',
  boucles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="5" r="1.6"/><circle cx="16.5" cy="5" r="1.6"/><path d="M7.5 6.6v3.2"/><path d="M16.5 6.6v3.2"/><path d="M7.5 9.8c-2.3 1.9-2.6 4.6-1.3 6.5a3.2 3.2 0 0 0 2.6 1.4 3.2 3.2 0 0 0 2.6-1.4c1.3-1.9 1-4.6-1.3-6.5"/><path d="M16.5 9.8c-2.3 1.9-2.6 4.6-1.3 6.5a3.2 3.2 0 0 0 2.6 1.4 3.2 3.2 0 0 0 2.6-1.4c1.3-1.9 1-4.6-1.3-6.5"/></svg>',
  site: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg>',
  atelier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/></svg>',
  vente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  compte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  accueil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
  reglages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8l9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
  client: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15a5 5 0 0 1 5.5 5"/></svg>',
  /* the small icons of the menus and of the column heads */
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/><path d="m13 5 7 7-7 7"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13 7 4 4"/></svg>',
  euro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6.5A7 7 0 0 0 7.3 9H15"/><path d="M18 17.5A7 7 0 0 1 7.3 15H15"/><path d="M5 12h9"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>',
  number: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/></svg>',
  date: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/></svg>',
  bool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="16" cy="12" r="3"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  status: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>'
};
function svg(name){ var s = document.createElement('span'); s.innerHTML = ICON[name] || ''; return s.firstChild; }
/* a column head with the pictogram of what the column holds: text, number, date, euro, image, bool, mail, phone, status, link, list */
var TH_ICON = { text: 'text', number: 'number', date: 'date', money: 'euro', euro: 'euro', image: 'image', check: 'bool', bool: 'bool', mail: 'mail', phone: 'phone', status: 'status', link: 'ext', list: 'list', client: 'client' };
function thCell(tr, label, kind){ var th = node('th', '', tr); if (kind && TH_ICON[kind]) th.appendChild(svg(TH_ICON[kind])); th.appendChild(document.createTextNode(label)); return th; }
/* the avatar chip: the first letter on one tone, always the same tone for the same name */
var HUES = ['#3e63dd', '#2e8b57', '#d4544f', '#b86e00', '#7c4dcc', '#c2418e', '#1f8fb0', '#5b6b7a'];
function avatar(name, parent){ var t = txt(name).trim(), n = 0; for (var i = 0; i < t.length; i++) n = (n * 31 + t.charCodeAt(i)) >>> 0; var a = node('span', 'avatar', parent, t.charAt(0) || '?'); a.style.background = HUES[n % HUES.length]; return a; }
/* THE MENU ON A RIGHT CLICK (7 October). menuAt(x, y, items, title): an item is { label, icon, run, href, danger, kbd } or '-' */
var MENU_EL = null;
function closeMenu(){ if (MENU_EL){ MENU_EL.remove(); MENU_EL = null; } }
function menuAt(x, y, items, title){
  closeMenu(); var m = MENU_EL = node('div', 'cmenu', document.body); m.setAttribute('role', 'menu');
  if (title) node('div', 'head', m, title);
  items.forEach(function(it){
    if (it === '-'){ node('div', 'sep', m); return; }
    var b = node(it.href ? 'a' : 'button', it.danger ? 'danger' : '', m); b.setAttribute('role', 'menuitem');
    if (it.href){ b.href = it.href; if (!/^mailto:/.test(it.href)){ b.target = '_blank'; b.rel = 'noopener'; } } else b.type = 'button';
    if (it.icon) b.appendChild(svg(it.icon)); node('span', '', b, it.label); if (it.kbd) node('kbd', '', b, it.kbd);
    b.addEventListener('click', function(){ closeMenu(); if (it.run) it.run(); });
  });
  var W = m.offsetWidth, H = m.offsetHeight; m.style.left = Math.max(8, Math.min(x, innerWidth - W - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - H - 8)) + 'px';
  var first = m.querySelector('button, a'); if (first) first.focus();
}
document.addEventListener('mousedown', function(e){ if (MENU_EL && !MENU_EL.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', function(e){ if (!MENU_EL) return; if (e.key === 'Escape'){ closeMenu(); return; } if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); var l = Array.prototype.slice.call(MENU_EL.querySelectorAll('button, a')), i = l.indexOf(document.activeElement); l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length].focus(); } });
window.addEventListener('scroll', function(e){ if (e.target && e.target.classList && e.target.classList.contains('tablewrap')) return; closeMenu(); }, true); window.addEventListener('resize', closeMenu);
/* a row that has a menu: the right click opens it, and a quiet ... at the end of the row too */
function rowMenu(tr, items, title){
  tr.addEventListener('contextmenu', function(e){ e.preventDefault(); menuAt(e.clientX, e.clientY, items(), title); });
  var td = node('td', 'more', tr), b = node('button', 'sign', td, '\u22ef'); b.type = 'button'; b.title = 'Actions'; b.setAttribute('aria-label', 'Actions');
  b.addEventListener('click', function(e){ e.stopPropagation(); var r = b.getBoundingClientRect(); menuAt(r.right - 210, r.bottom + 4, items(), title); });
  return td;
}
function copyText(t){ try { navigator.clipboard.writeText(t); toast('Copié : ' + t); } catch (e){ toast('Copie impossible', true); } }

/* ---------- THE PLUG-IN POINT (4 October). A screen of the studio that lives in its own file
   (textes.js, atelier.js, mailing.js, comptes.js) registers here:
     STUDIO.register('devis', function(host, item){ ... draw inside host ... })
   `host` is the empty <section class="pages"> under the bar; the key is the menu item's key.
     STUDIO.menu('Atelier', [ {group:'..'}, {label:'..', key:'..'} ])  replaces a family's sub-menu.
   Helpers: STUDIO.el, node, txt, api (same-origin JSON, returns {ok,status,body}), toast(msg, bad),
   S (the state: S.me, S.pieces, S.vocab), redraw(), reload(), title(text), count(text),
   panel(kind) -> {body, foot, close} the record sheet on the right, closePanel(). ---------- */
var MENU = [];
var STUDIO = window.STUDIO = { screens: {}, menus: {}, el: el, node: node, txt: txt, api: api, toast: toast, svg: svg, th: thCell, avatar: avatar, menuAt: menuAt, rowMenu: rowMenu, closeMenu: closeMenu, copy: copyText, euros: euros,
  /* open a screen by its key, from anywhere (the home's lists, a client's orders) */
  has: function(key){ return MENU.some(function(f){ return !(f.admin && S.me.role !== 'admin') && f.items.some(function(it){ return it.key === key && !(it.admin && S.me.role !== 'admin'); }); }); },
  open: function(key, filter){ var fam = MENU.filter(function(f){ return f.items.some(function(it){ return it.key === key && (!filter || JSON.stringify(it.filter || null) === JSON.stringify(filter)); }); })[0]; if (!fam) return; go(fam, fam.items.filter(function(it){ return it.key === key && (!filter || JSON.stringify(it.filter || null) === JSON.stringify(filter)); })[0]); },
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
    var who = el('who'); who.innerHTML = ''; avatar(S.me.name || S.me.email, who); var wt = node('span', 'wt', who); node('b', '', wt, S.me.name || S.me.email); node('span', '', wt, S.me.role === 'admin' ? 'Admin' : 'Lecture'); who.title = (S.me.name ? S.me.name + ' · ' : '') + S.me.email;
    if (!MENU.length) buildMenu();
    draw();
  });
}
function shown(){ return S.pieces.filter(function(p){ return !S.filter || p[S.filter.by] === S.filter.key; }); }
function countBy(by, key){ return S.pieces.filter(function(p){ return p[by] === key; }).length; }

/* ---------- the menu: the families of the rail, each with its sub-menu ---------- */
/* an item with `key` and no `soon` is built; `soon` is the line the waiting screen prints */
function buildMenu(){
  var pieces = [{ label: 'Toutes les pièces', key: 'pieces', filter: null }, { label: 'Ajouter une pièce', key: 'ajout', form: true, admin: true }, { label: 'Stock', key: 'stock' }, { group: 'Rayons' }];
  Object.keys(S.rayons).forEach(function(k){ pieces.push({ label: S.rayons[k], key: 'pieces', filter: { by: 'rayon', key: k } }); });
  pieces.push({ group: 'Collections' });
  Object.keys(S.collections).forEach(function(k){ pieces.push({ label: S.collections[k], key: 'pieces', filter: { by: 'collection', key: k } }); });
  pieces.push({ label: '+ Ajouter une collection', key: 'collection-new', admin: true });
  MENU = [
    { title: 'Accueil', icon: 'accueil', items: [{ label: 'Aujourd’hui', key: 'accueil' }] },
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
    { title: 'Ventes', icon: 'vente', items: [{ label: 'Commandes', key: 'commandes' }, { label: 'Clients', key: 'clients' }] },
    { title: 'Réglages', icon: 'reglages', items: [{ label: 'La maison', key: 'maison', admin: true }, { label: 'Boîte d’envoi', key: 'mail-boite', admin: true }, { label: 'Paiement', key: 'paiement', admin: true }, { label: 'Impression', key: 'impression', admin: true }, { group: 'Le studio' }, { label: 'Comptes', key: 'comptes', admin: true }, { label: 'Mon compte', key: 'moi' }, { label: 'Aide', key: 'aide' }, { label: 'Sauvegardes', key: 'sauvegardes', admin: true }] }
  ];
  MENU.forEach(function(f){ if (STUDIO.menus[f.title]) f.items = STUDIO.menus[f.title]; });
  S.family = MENU[0];
}
function currentItem(){ return S.family.items.filter(function(it){ return it.key === S.object && JSON.stringify(it.filter || null) === JSON.stringify(S.filter); })[0] || S.family.items.filter(function(it){ return it.key; })[0]; }
function go(fam, it){ S.family = fam; S.object = it.key; S.filter = it.filter || null; S.open = null; S.q = ''; el('q').value = ''; el('panel').hidden = true; draw(); window.scrollTo(0, 0); }
/* the icon of a menu entry, from its key (Twenty: every object carries its pictogram) */
var ITEM_ICON = { pieces: 'piece', ajout: 'edit', stock: 'stock', accueil: 'accueil', textes: 'text', publier: 'ext', tableau: 'status', droits: 'client', vendors: 'client', categories: 'list', inventaire: 'stock', productions: 'tag', founders: 'euro', incomes: 'euro', devis: 'print', factures: 'print', livraisons: 'print', transports: 'print', archives: 'trash', or: 'euro', events: 'date', maison: 'accueil', contacts: 'client', envoi: 'mail', envois: 'list', 'mail-boite': 'reglages', 'mail-desinscrits': 'trash', commandes: 'vente', clients: 'client', paiement: 'euro', comptes: 'client', sauvegardes: 'copy' };
var RAYON_ICON = { bagues: 'bagues', alliances: 'alliances', bracelets: 'bracelets', 'colliers-et-pendentifs': 'colliers', 'boucles-d-oreilles': 'boucles' };
function itemIcon(it){ if (it.door) return 'ext'; if (it.filter) return it.filter.by === 'collection' ? 'tag' : (RAYON_ICON[it.filter.key] || 'piece'); if (/^cert-/.test(it.key)) return 'check'; return ITEM_ICON[it.key] || 'list'; }
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
    if (it.admin && S.me.role !== 'admin') return;
    if (it.group){ node('div', 'group', box, it.group); return; }
    var b = node('button', 'sub' + (it === cur ? ' cur' : ''), box); b.appendChild(svg(itemIcon(it))); node('span', '', b, it.label);
    if (it.key === 'pieces') node('span', 'n', b, String(it.filter ? countBy(it.filter.by, it.filter.key) : S.pieces.length));
    b.addEventListener('click', function(){ if (it.door){ window.open(it.door, '_blank', 'noopener'); return; } go(S.family, it); });
  });
}

/* ---------- the table ---------- */
function th(tr, label){ return node('th', '', tr, label); }
function td(tr, text, cls){ return node('td', cls || '', tr, text); }
function drawTable(){
  var it = currentItem(), table = el('table'), thead = table.tHead, tbody = table.tBodies[0], pages = el('pages');
  thead.innerHTML = ''; tbody.innerHTML = ''; pages.innerHTML = '';
  el('title').textContent = it.label; el('count').textContent = '';
  /* the breadcrumb of the bar: the family, then the object with its icon */
  var crumb = el('crumb'); if (crumb){ crumb.innerHTML = ''; node('span', 'fam', crumb, S.family.title); node('span', 'slash', crumb, '/'); crumb.appendChild(svg(itemIcon(it))); }
  SEL = {}; selectionBar();
  var isPage = !!it.soon || !!it.form || !!STUDIO.screens[it.key];
  pages.hidden = !isPage; table.parentNode.hidden = isPage; el('q').parentNode.hidden = isPage; var pf0 = document.getElementById('pfilters'); if (pf0) pf0.hidden = isPage;
  var nb = el('new'); nb.hidden = it.key !== 'pieces' || S.me.role !== 'admin'; nb.textContent = '+ Ajouter une pièce';
  var ub = el('undo'); ub.hidden = !S.last || S.me.role !== 'admin'; if (S.last) ub.title = S.last.what + ', ' + new Date(S.last.at).toLocaleString('fr-FR') + ' (' + S.last.files + ' fichiers)';
  if (it.form){ if (!FA) FA = blank(); drawForm(pages, FA); return; }
  if (STUDIO.screens[it.key]){ STUDIO.screens[it.key](pages, it); return; }
  if (isPage){
    var em = node('div', 'empty', pages); node('b', '', em, it.label); node('span', 'sub', em, it.soon).style.whiteSpace = 'normal'; node('span', 'sub', em, 'Cette partie se construit à l’étape suivante.');
    return;
  }
  /* 10 octobre : the filter row above the list (rayon, collection, price band, order) ; it keeps its state while the list is open */
  S.f = S.f || { rayon: '', coll: '', prix: '', tri: 'az' };
  var fb = document.getElementById('pfilters'); if (!fb){ fb = document.createElement('div'); fb.id = 'pfilters'; fb.className = 'marks atl-filters pfilters'; table.parentNode.parentNode.insertBefore(fb, table.parentNode); }
  fb.innerHTML = ''; fb.hidden = false;
  var sel = function(label, opts, val, on){ var s = node('select', '', fb); s.setAttribute('aria-label', label); opts.forEach(function(o){ var op = node('option', '', s, o[1]); op.value = o[0]; }); s.value = val; s.addEventListener('change', function(){ on(s.value); drawTable(); }); return s; };
  if (!S.filter || S.filter.by !== 'rayon') sel('Rayon', [['', 'Tous les rayons']].concat(Object.keys(S.rayons).map(function(k){ return [k, S.rayons[k]]; })), S.f.rayon, function(v){ S.f.rayon = v; });
  if (!S.filter || S.filter.by !== 'collection') sel('Collection', [['', 'Toutes les collections'], ['-', 'Sans collection']].concat(Object.keys(S.collections).map(function(k){ return [k, S.collections[k]]; })), S.f.coll, function(v){ S.f.coll = v; });
  sel('Prix', [['', 'Tous les prix'], ['a', 'Moins de 1 500 €'], ['b', 'De 1 500 à 5 000 €'], ['c', 'Plus de 5 000 €'], ['0', 'Sans prix']], S.f.prix, function(v){ S.f.prix = v; });
  sel('Tri', [['az', 'De A à Z'], ['za', 'De Z à A'], ['pa', 'Prix croissant'], ['pd', 'Prix décroissant'], ['ph', 'Le plus de photos']], S.f.tri, function(v){ S.f.tri = v; });
  if (S.f.rayon || S.f.coll || S.f.prix || S.f.tri !== 'az'){ var rz = node('button', 'btn', fb, 'Effacer les filtres'); rz.type = 'button'; rz.addEventListener('click', function(){ S.f = { rayon: '', coll: '', prix: '', tri: 'az' }; drawTable(); }); }
  var garde = function(p){ var pr = Number(p.price) || 0;
    if (S.f.rayon && p.rayon !== S.f.rayon) return false;
    if (S.f.coll === '-' ? !!p.collection : (S.f.coll && p.collection !== S.f.coll)) return false;
    if (S.f.prix === 'a' && !(pr > 0 && pr < 1500)) return false; if (S.f.prix === 'b' && !(pr >= 1500 && pr <= 5000)) return false; if (S.f.prix === 'c' && !(pr > 5000)) return false; if (S.f.prix === '0' && pr > 0) return false;
    return true; };
  var ordre = { az: function(a, b){ return a.name.localeCompare(b.name, 'fr'); }, za: function(a, b){ return b.name.localeCompare(a.name, 'fr'); }, pa: function(a, b){ return (Number(a.price) || 0) - (Number(b.price) || 0); }, pd: function(a, b){ return (Number(b.price) || 0) - (Number(a.price) || 0); }, ph: function(a, b){ return (b.images || []).length - (a.images || []).length; } }[S.f.tri];
  var hr = node('tr', '', thead), n = 0, visible = [];
  var allCk = node('input', '', node('th', 'atl-pick', hr)); allCk.type = 'checkbox'; allCk.setAttribute('aria-label', 'Tout choisir');
  thCell(hr, 'Pièce', 'image'); thCell(hr, 'Rayon', 'text'); thCell(hr, 'Collection', 'text'); thCell(hr, 'Prix', 'money'); thCell(hr, 'Montures', 'number'); thCell(hr, 'Photos', 'number'); th(hr, ''); th(hr, '');
  allCk.addEventListener('change', function(){ visible.forEach(function(s){ if (allCk.checked) SEL[s] = 1; else delete SEL[s]; }); drawTable(); });
  shown().filter(garde).sort(ordre).forEach(function(p){
    if (S.q && (p.name + ' ' + p.slug).toLocaleLowerCase().indexOf(S.q) < 0) return; n++; visible.push(p.slug);
    var tr = node('tr', SEL[p.slug] ? 'sel' : '', tbody), pk = node('td', 'atl-pick', tr), ck = node('input', '', pk); ck.type = 'checkbox'; ck.checked = !!SEL[p.slug]; ck.setAttribute('aria-label', 'Choisir ' + p.name);
    ck.addEventListener('click', function(e){ e.stopPropagation(); }); ck.addEventListener('change', function(){ if (ck.checked) SEL[p.slug] = 1; else delete SEL[p.slug]; tr.classList.toggle('sel', ck.checked); selectionBar(); });
    var first = node('td', 'first', tr), t = node('span', 'th sq', first);
    if (p.image){ var im = node('img', '', t); im.alt = ''; im.loading = 'lazy'; im.src = SITE + p.image; im.addEventListener('error', function(){ im.remove(); }); }
    var nameEl = node('span', 'cell', first, p.name); inlineEdit(nameEl, p, 'name');
    var rc = td(tr, '', ''), cc = td(tr, '', ''); if (p.rayon) tagChip(rc, S.rayons[p.rayon]); if (p.collection) tagChip(cc, S.collections[p.collection]);
    var pc = td(tr, '', 'num'), priceEl = node('span', 'cell', pc, euros(p.price)); if (p.etat === 'commande') node('span', 'chip soft etatchip', pc, 'Sur commande' + (p.delai > 0 ? ' · ' + p.delai + ' j' : '')); else if (p.etat === 'vendue') node('span', 'chip none etatchip', pc, 'Vendue'); pricePop(priceEl, p);
    var montures = p.options.filter(function(o){ return o.a === 'Monture'; })[0];
    td(tr, montures ? String(montures.v.length) : '', 'num'); td(tr, String(p.images.length), 'num');
    var door = node('td', 'door', tr), a = node('a', 'btn small', door, 'Voir ↗'); a.href = SITE + p.url; a.target = '_blank'; a.rel = 'noopener'; a.addEventListener('click', function(e){ e.stopPropagation(); });
    rowMenu(tr, function(){ return [{ label: 'Ouvrir la fiche', icon: 'open', run: function(){ openPiece(p.slug); } }, { label: 'Voir sur le site', icon: 'ext', href: SITE + p.url }, { label: 'Copier l’adresse', icon: 'copy', run: function(){ copyText('https://alayafinejewelry.com/piece/' + p.slug + '/'); } }, '-',
      { label: 'Certificat de bijou', icon: 'check', run: function(){ if (STUDIO.certifierPiece) STUDIO.certifierPiece(p); } },
      { label: 'Son stock', icon: 'stock', run: function(){ sessionStorage.setItem('alaya-stock-open', p.slug); STUDIO.open('stock'); } }, { label: 'Mettre dans un mail', icon: 'mail', run: function(){ sessionStorage.setItem('alaya-mail-piece', p.slug); STUDIO.open('envoi'); } }]
      .concat(S.me.role === 'admin' ? ['-', { label: 'Retirer du site', icon: 'trash', danger: true, run: function(){ openPiece(p.slug); setTimeout(function(){ var d = el('panel').querySelector('.mark.gone'); if (d) d.click(); }, 600); } }] : []); }, p.name);
    /* a click on an editable cell waits a beat: a second click is an edit, not an opening */
    var pend = null;
    tr.tabIndex = 0; tr.addEventListener('click', function(e){ if (e.target.closest && e.target.closest('.cell')){ clearTimeout(pend); if (e.detail > 1) return; pend = setTimeout(function(){ openPiece(p.slug); }, 230); return; } openPiece(p.slug); }); tr.addEventListener('keydown', function(e){ if (e.target === tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openPiece(p.slug); } });
    if (S.open === p.slug) tr.classList.add('cur');
  });
  el('count').textContent = n + (S.q ? ' trouvées' : '');
  allCk.checked = visible.length > 0 && visible.every(function(s){ return SEL[s]; });
  if (!n){ var e = node('tr', '', tbody), c = node('td', 'emptycell', e); c.colSpan = 9; node('div', 'note', c, S.q ? 'Rien ne correspond.' : 'Aucune pièce ici.'); }
  /* the last row adds a record, as Twenty's tables do */
  if (S.me.role === 'admin'){ var ar = node('tr', 'addrow', tbody), ac = node('td', '', ar); ac.colSpan = 9; ac.appendChild(svg('edit')); ac.appendChild(document.createTextNode(' Ajouter une pièce')); ar.addEventListener('click', function(){ go(MENU[1], MENU[1].items[1]); }); }
  selectionBar();
}
/* the selection: a bar in place of the count, with what can be done on several pieces at once */
var SEL = {};
function selectionBar(){
  var old = el('selbar'); if (old) old.remove();
  var keys = Object.keys(SEL); if (!keys.length || S.object !== 'pieces') return;
  var bar = node('div', 'selbar', el('count').parentNode), b; bar.id = 'selbar'; node('b', '', bar, keys.length + ' sélectionnée' + (keys.length > 1 ? 's' : ''));
  b = node('button', 'btn small', bar, 'Mettre dans un mail'); b.addEventListener('click', function(){ keys.slice(0, 12).forEach(function(k){ sessionStorage.setItem('alaya-mail-piece', k); }); sessionStorage.setItem('alaya-mail-pieces', keys.slice(0, 12).join(',')); STUDIO.open('envoi'); });
  b = node('button', 'btn small', bar, 'Copier les adresses'); b.addEventListener('click', function(){ copyText(keys.map(function(k){ return 'https://alayafinejewelry.com/piece/' + k + '/'; }).join('\n')); });
  b = node('button', 'btn small', bar, 'Annuler'); b.addEventListener('click', function(){ SEL = {}; drawTable(); });
  el('count').parentNode.insertBefore(bar, el('count').nextSibling);
}
/* a coloured tag, one soft tone per word, always the same for the same word (Twenty's select values) */
var TAGS = [['#eef1fc', '#3a55c0'], ['#e9f6ee', '#1f7a4a'], ['#fff4dd', '#9a5b00'], ['#fdeeee', '#b9403b'], ['#f3ecfc', '#6b3fb0'], ['#fbecf5', '#a8347a'], ['#e6f2fb', '#2a6fa8'], ['#f1f1f1', '#555']];
function tagChip(parent, word){ var t = txt(word), n = 0; for (var i = 0; i < t.length; i++) n = (n * 31 + t.charCodeAt(i)) >>> 0; var c = node('span', 'chip tag', parent, t), k = TAGS[n % TAGS.length]; c.style.background = k[0]; c.style.color = k[1]; return c; }
/* INLINE EDIT (Twenty's signature): a double click on the name or the price turns the cell into a field;
   Enter writes it on the site through the same route as the sheet, Escape leaves it as it was */
function bodyOfPiece(g){ return { name: g.name, rayon: g.rayon, collection: g.collection, price: g.price, fiancailles: g.fiancailles, mariage: g.mariage, montures: g.montures, ligne: g.ligne, description: g.description, reference: g.reference, sizes: g.sizes, details: g.details, filtres: g.filtres, photos: g.variants.map(function(v){ return { image: v.image, couleur: v.couleur, pierre: v.pierre }; }), en: g.en, it: g.it }; }
/* 10 octobre (Raouf : "change the price to sur demande or sur commande") : a double click on the price opens a small box :
   a price, or Sur demande (no price, the page says Demander le prix), or Sur commande with its delay, or back to Disponible */
function pricePop(cell, p){
  if (S.me.role !== 'admin') return;
  cell.title = 'Double-clic pour modifier le prix ou l’état';
  cell.addEventListener('dblclick', function(e){
    e.stopPropagation(); var old = document.querySelector('.pricepop'); if (old) old.remove();
    var box = node('div', 'pricepop', document.body), r = cell.getBoundingClientRect(); box.style.left = Math.max(12, Math.min(innerWidth - 300, r.left - 40)) + 'px'; box.style.top = (r.bottom + scrollY + 6) + 'px';
    node('b', '', box, p.name);
    var row = node('label', 'pp-row', box); node('span', '', row, 'Prix'); var inp = node('input', '', row); inp.type = 'number'; inp.min = '0'; inp.step = '10'; inp.value = p.price > 0 ? p.price : ''; inp.placeholder = 'Sur demande';
    var row2 = node('label', 'pp-row', box); node('span', '', row2, 'Délai (jours)'); var del = node('input', '', row2); del.type = 'number'; del.min = '0'; del.value = p.delai > 0 ? p.delai : ''; del.placeholder = '30';
    var acts = node('div', 'pp-acts', box), close = function(){ box.remove(); document.removeEventListener('mousedown', outside); };
    var outside = function(ev){ if (!box.contains(ev.target)) close(); }; setTimeout(function(){ document.addEventListener('mousedown', outside); }, 0);
    var writePrice = function(v){ return api('pieces/' + p.slug).then(function(r){ if (!r.ok) throw new Error(r.body.error || r.status); var body = bodyOfPiece(r.body); body.price = v; return api('pieces/' + p.slug, { method: 'PUT', json: body }); }).then(function(r){ if (!r.ok) throw new Error(r.body.error || r.status); }); };
    var writeEtat = function(etat){ return api('stock/' + p.slug + '/site', { method: 'POST', json: { etat: etat, delai: etat === 'commande' ? (+del.value || 0) : 0 } }).then(function(r){ if (!r.ok) throw new Error(r.body.error || r.status); }); };
    var go = function(label, fn){ var b = node('button', 'btn' + (label === 'Enregistrer' ? ' primary' : ''), acts, label); b.type = 'button'; b.addEventListener('click', function(){ acts.querySelectorAll('button').forEach(function(x){ x.disabled = true; }); fn().then(function(){ toast(p.name + ' : écrit sur le site.'); close(); return load(); }, function(err){ toast('Non enregistré : ' + err.message, true); close(); }); }); return b; };
    go('Enregistrer', function(){ var v = +inp.value || 0; return (v === p.price ? Promise.resolve() : writePrice(v)); });
    go('Sur demande', function(){ inp.value = ''; return writePrice(0); });
    go('Sur commande', function(){ var v = +inp.value || 0; return (v === p.price ? Promise.resolve() : writePrice(v)).then(function(){ return writeEtat('commande'); }); });
    if (p.etat !== 'disponible') go('Disponible', function(){ return writeEtat('disponible'); });
    inp.focus(); inp.select();
    inp.addEventListener('keydown', function(k){ if (k.key === 'Enter'){ k.preventDefault(); acts.querySelector('button').click(); } if (k.key === 'Escape') close(); });
  });
}
function inlineEdit(cell, p, key){
  if (S.me.role !== 'admin') return;
  cell.title = 'Double-clic pour modifier';
  cell.addEventListener('dblclick', function(e){
    e.stopPropagation(); if (cell.querySelector('input')) return;
    var was = cell.textContent, inp = node('input', 'inline-cell', null); inp.type = key === 'price' ? 'number' : 'text'; inp.value = key === 'price' ? (p.price > 0 ? p.price : '') : p.name; if (key === 'price') inp.placeholder = 'Sur demande';
    cell.textContent = ''; cell.appendChild(inp); inp.focus(); inp.select();
    var done = false, leave = function(){ if (done) return; done = true; cell.textContent = was; };
    var save = function(){
      if (done) return; var v = inp.value.trim(); done = true;
      if ((key === 'name' && (!v || v === p.name)) || (key === 'price' && (+v || 0) === p.price)){ cell.textContent = was; return; }
      cell.textContent = key === 'price' ? euros(+v || 0) : v; cell.classList.add('saving');
      api('pieces/' + p.slug).then(function(r){ if (!r.ok) throw new Error(r.body.error || r.status); var body = bodyOfPiece(r.body); body[key] = key === 'price' ? (+v || 0) : v; return api('pieces/' + p.slug, { method: 'PUT', json: body }); })
        .then(function(r){ if (!r.ok) throw new Error(r.body.error || r.status); toast(p.name + ' : ' + (key === 'price' ? 'prix' : 'nom') + ' écrit sur le site.'); return load(); })
        ['catch'](function(err){ cell.classList.remove('saving'); cell.textContent = was; toast('Non enregistré : ' + err.message, true); });
    };
    inp.addEventListener('keydown', function(k){ if (k.key === 'Enter'){ k.preventDefault(); save(); } if (k.key === 'Escape'){ k.preventDefault(); leave(); } });
    inp.addEventListener('blur', function(){ setTimeout(leave, 0); });
    inp.addEventListener('click', function(k){ k.stopPropagation(); });
  });
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
function draw(){ closeMenu(); drawSide(); drawTable(); if (S.open) drawPanel(); }

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
  function row(box, label, tall, kind){ var f = node('div', 'field' + (tall ? ' tall' : ''), box), l = node('label', '', f); if (kind && TH_ICON[kind]) l.appendChild(svg(TH_ICON[kind])); l.appendChild(document.createTextNode(label)); return f; }
  function input(box, label, key, ph, type){ var f = row(box, label, false, type === 'number' ? 'number' : 'text'), i = node('input', '', f); i.type = type || 'text'; i.value = F[key]; if (ph) i.placeholder = ph; i.addEventListener('input', function(){ F[key] = i.value; where(); }); return i; }
  function area(box, label, key, ph, rows){ var f = row(box, label, true, 'text'), a = node('textarea', '', f); a.rows = rows; a.value = F[key]; a.placeholder = ph; a.addEventListener('input', function(){ F[key] = a.value; }); return a; }
  function select(box, label, key, options){ var f = row(box, label, false, 'list'), se = node('select', '', f); f.classList.add('half'); options.forEach(function(o){ var op = node('option', '', se, o[1]); op.value = o[0]; }); se.value = F[key]; return se; }
  function checks(box, label, list, key){ var f = row(box, label, true, 'bool'), g = node('div', 'checks', f); list.forEach(function(o){ var l = node('label', 'option-row', g), c = node('input', '', l); c.type = 'checkbox'; c.checked = F[key].indexOf(o[0]) >= 0; node('span', '', l, o[1]); c.addEventListener('change', function(){ F[key] = F[key].filter(function(x){ return x !== o[0]; }); if (c.checked) F[key].push(o[0]); }); }); }

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
  pbox.addEventListener('dragover', function(e){ if (e.dataTransfer.types.indexOf('Files') >= 0){ e.preventDefault(); drop.classList.add('hot'); } });
  pbox.addEventListener('dragleave', function(){ drop.classList.remove('hot'); });
  pbox.addEventListener('drop', function(e){ if (e.dataTransfer.files.length){ e.preventDefault(); drop.classList.remove('hot'); take(e.dataTransfer.files); } });
  var dragFrom = -1;
  function photos(){
    plist.innerHTML = '';
    F.photos.forEach(function(ph, k){
      var r = node('div', 'photo', plist), im = node('img', '', r); im.src = ph.data || SITE + ph.image; im.alt = '';
      /* a photo drags above another: the order of the sheet follows, the first stays the thumbnail */
      r.draggable = true; r.title = 'Glisser pour changer l’ordre';
      r.addEventListener('dragstart', function(e){ dragFrom = k; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(k)); } catch (x){} });
      r.addEventListener('dragend', function(){ dragFrom = -1; r.classList.remove('dragging'); });
      r.addEventListener('dragover', function(e){ if (dragFrom < 0 || dragFrom === k) return; e.preventDefault(); e.stopPropagation(); r.classList.add('over'); });
      r.addEventListener('dragleave', function(){ r.classList.remove('over'); });
      r.addEventListener('drop', function(e){ if (dragFrom < 0) return; e.preventDefault(); e.stopPropagation(); F.photos.splice(k, 0, F.photos.splice(dragFrom, 1)[0]); dragFrom = -1; photos(); });
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

  if (!admin){ wrap.querySelectorAll('input, select, textarea, button').forEach(function(x){ x.disabled = true; }); node('p', 'note', wrap, 'Un administrateur modifie les pièces. Ici, vous les lisez.'); return; }
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
  wrap.addEventListener('keydown', function(e){ if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !goB.hidden && !goB.disabled){ e.preventDefault(); goB.click(); } });
  where();
}
/* "/" puts the cursor in the search, from anywhere that is not a field */
document.addEventListener('keydown', function(e){ if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return; var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return; var q = el('q'); if (q && !q.parentNode.hidden){ e.preventDefault(); q.focus(); q.select(); } });

el('q').addEventListener('input', function(){ S.q = this.value.trim().toLocaleLowerCase(); drawTable(); });
/* 10 octobre : the family list changed (the home came first), so the button finds the add-piece entry by what it is, not by its place */
el('new').addEventListener('click', function(){ var fam = MENU.filter(function(f){ return f.items.some(function(i){ return i.form; }); })[0]; if (fam) go(fam, fam.items.filter(function(i){ return i.form; })[0]); });
el('undo').addEventListener('click', function(){
  if (!S.last || !confirm('Annuler la dernière écriture ?\n' + S.last.what + ' (' + S.last.files + ' fichiers du site remis comme avant)')) return;
  api('annuler', { method: 'POST' }).then(function(r){ if (!r.ok){ toast('Non annulé : ' + (r.body.error || r.status), true); return; } toast('Annulé : ' + r.body.what); S.open = null; el('panel').hidden = true; load(); });
});
/* 10 octobre : a new collection = a new page of the site, its line in every menu, its place in the sub-menu here */
STUDIO.register('collection-new', function(host){
  STUDIO.title('Ajouter une collection'); STUDIO.count('');
  var f = node('div', 'formpiece', host); node('h3', '', node('div', 'sec', f), 'Une nouvelle collection');
  node('p', 'note', f, 'Le studio crée sa page sur le site (vide, prête à recevoir des pièces), l’ajoute à la colonne Collections du menu de chaque page et au plan du site. Ensuite, chaque pièce se range dedans depuis sa fiche.');
  if (S.me.role !== 'admin'){ node('p', 'note', f, 'Un administrateur peut ajouter une collection.'); return; }
  var fs = node('div', 'fields sender', f), fd = node('div', 'field', fs); node('label', '', fd, 'Nom de la collection'); var inp = node('input', '', fd); inp.placeholder = 'Par exemple : Jardin d’hiver'; inp.setAttribute('aria-label', 'Nom de la collection');
  var go = node('button', 'mark', node('div', 'marks', f), 'Créer la collection sur le site'); go.type = 'button';
  go.addEventListener('click', function(){ var name = inp.value.trim(); if (!name){ toast('Il faut un nom.', true); return; } if (!confirm('Créer la collection « ' + name + ' » sur le site ? Sa page et les menus de toutes les pages seront écrits (une sauvegarde est gardée).')) return; go.disabled = true;
    api('collections', { method: 'POST', json: { name: name } }).then(function(r){ go.disabled = false; if (!r.ok){ toast('Non créée : ' + (r.body.error || r.status), true); return; } toast('Collection créée : ' + r.body.name + '.'); MENU.length = 0; load().then(function(){ S.filter = { by: 'collection', key: r.body.slug }; STUDIO.open('pieces'); }); }); });
});
el('logout').addEventListener('click', function(){ api('logout', { method: 'POST' }).then(function(){ location.replace('login'); }); });
document.addEventListener('keydown', function(e){ if (e.key !== 'Escape' || el('panel').hidden) return; if (S.open) closePanel(); else STUDIO.closePanel(); });
/* the first read waits for every screen file to have registered */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
