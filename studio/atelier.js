/* L'ATELIER DANS LE STUDIO (4 octobre 2026, quatrieme passe).
   Ce que la maison avait dans le back-office d'Ilyes, dans la coque et le systeme
   du studio (version 2 : Manrope, Garamond pour ce qui se nomme, etiquette au-dessus
   du champ, pastilles pour les choix, un seul systeme de boutons).

   SON ORGANISATION EST GARDEE : l'ordre de son menu, l'ordre des colonnes de ses
   tables, sa barre de filtres (recherche, tri, statut, categories, mode de paiement),
   ses creations pas a pas (les memes etapes, dans le meme ordre, avec Precedent /
   Suivant et un apercu avant d'enregistrer), ses fiches.
   Les champs ne sont pas ecrits ici : le programme (atelier.js, atelier-gestion.js)
   envoie leur description et ses etapes, cet ecran dessine avec. */
(function(){
'use strict';
var ST = window.STUDIO, node = ST.node, api = ST.api, toast = ST.toast, txt = ST.txt;
var A = null, busy = false;
var KEYS = ['cert-diamants', 'cert-bijoux', 'cert-gemmes', 'devis', 'factures', 'livraisons', 'transports', 'productions', 'vendors', 'categories', 'founders', 'incomes', 'events'];

/* his sidebar, in his order: Dashboard, Users, Vendors, Categories, Inventory, Production and its three certificates,
   Metal casting, then Document (Income Reports, Quotes, Transport, Delivery Notes, Invoices), then Archives. Ours come last. */
var MENU = [
  { label: 'Tableau de bord', key: 'tableau' }, { label: 'Utilisateurs', key: 'droits', admin: true }, { label: 'Fournisseurs', key: 'vendors' }, { label: 'Catégories', key: 'categories' }, { label: 'Inventaire', key: 'inventaire', type: 'productions' },
  { group: 'Production' }, { label: 'Productions', key: 'productions' }, { label: 'Certificats de bijoux', key: 'cert-bijoux' }, { label: 'Certificats de gemmes', key: 'cert-gemmes' }, { label: 'Certificats de diamants', key: 'cert-diamants' }, { label: 'Fonderie', key: 'founders' },
  { group: 'Documents' }, { label: 'Rapports de revenus', key: 'incomes' }, { label: 'Devis', key: 'devis' }, { label: 'Transport', key: 'transports' }, { label: 'Bons de livraison', key: 'livraisons' }, { label: 'Factures', key: 'factures' },
  { group: 'Archives' }, { label: 'Ce qui a été supprimé', key: 'archives', admin: true },
  { group: 'Réglages' }, { label: 'Cours de l’or', key: 'or', admin: true }, { label: 'Agenda', key: 'events' }, { label: 'Maison', key: 'maison', admin: true }
];
/* what an account may not see is not offered to it (his sidebar hid what a user had no permission for) */
function setMenu(){
  var items = MENU.filter(function(it){ if (it.group || !A) return true; if (it.admin && !A.admin) return false; var k = it.type || it.key; return !(A.types[k] && A.types[k].hidden); });
  ST.menu('Atelier', items.filter(function(it, i){ return !it.group || (items[i + 1] && !items[i + 1].group); }));
}
setMenu();

function fetchAll(){ busy = true; return api('atelier/all').then(function(r){ busy = false; if (r.ok){ A = r.body; setMenu(); } else toast('L’atelier ne répond pas : ' + (r.body.error || r.status), true); return r.ok; }); }
function refresh(){ return fetchAll().then(function(){ ST.redraw(); }); }
function ready(host){ if (A) return true; node('p', 'note', host, 'Chargement…'); if (!busy) refresh(); return false; }
function day(d){ var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
function euros(n){ return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function fieldsOf(t){ return t.groups.reduce(function(a, g){ return a.concat(g[1]); }, []); }
function vendorName(id){ var v = (A.records.vendors || []).filter(function(x){ return x.id === id; })[0]; return v ? v.fullName : ''; }
function goldNow(){ return A.gold && A.gold[0] ? A.gold[0].price : 0; }
function printUrl(type, r){ return '../api/atelier/' + type + '/' + r.id + '/document'; }
function empty(host, title, line){ var em = node('div', 'empty', host); node('b', '', em, title); if (line) node('span', 'sub', em, line); return em; }
function tableOf(host, heads){ var wrap = node('div', 'tablewrap inner', host), table = node('table', 'table', wrap), hr = node('tr', '', node('thead', '', table)); heads.forEach(function(h){ node('th', '', hr, h); }); return node('tbody', '', table); }
function chip(box, label, on, change, kind, name){ var l = node('label', 'option-row', box), c = node('input', '', l); c.type = kind || 'checkbox'; if (name) c.name = name; c.checked = !!on; node('span', '', l, label); c.addEventListener('change', function(){ change(c.checked); }); return c; }
function select(box, label, options, value, change){ var se = node('select', '', box); se.setAttribute('aria-label', label); options.forEach(function(o){ node('option', '', se, o[1]).value = o[0]; }); se.value = value; se.addEventListener('change', function(){ change(se.value); }); return se; }

/* HIS FORMULAS, mirrored from atelier-gestion.js so the form counts while one types; the program counts again when it saves */
function fix3(n){ return Number(Number(n).toFixed(3)); }
function round3(c){ return Number(c) % 1 === 0 ? Number(Math.floor(c)) : Number(Number(c).toFixed(3)); }
function N(v){ return Number(v) || 0; }
var LIVE = {
  mountsItems: function(el){ el.weight24k = fix3(N(el.weight18k) * 0.82); el.total1 = fix3(N(el.price24k) * N(el.weight18k) * 0.82); el.total2 = fix3(N(el.manufacture) + N(el.price24k) * N(el.weight18k) * 0.82); },
  diamondsItems: function(el){ el.total = fix3(N(el.xe) * N(el.ct)); }, gemsItems: function(el){ el.total = fix3(N(el.xe) * N(el.carat)); },
  sertissagesItems: function(el){ el.total1 = fix3(N(el.numeroPt) * N(el.xe2)); el.total2 = fix3(N(el.numeroPt) * N(el.xe2) + N(el.cen)); }
};
function currentCost(p, gold, old){
  if (p && p.mountsItems && p.mountsItems.length){ var c = p.mountsItems.reduce(function(s, el){ return s + Number((N(el.manufacture) + N(gold) * N(el.weight18k) * 0.82).toFixed(3)); }, 0) + N(p.internalServicesTotalCost) + N(p.sertissagesTotalCost) + N(p.gemsTotalCost) + N(p.diamondsTotalCost); return Math.max(c % 1 === 0 ? Math.floor(c) : round3(c), old); }
  return Number(old);
}
function costs(V){
  var sum = function(k, key){ return round3((V[k] || []).reduce(function(s, el){ return s + N(el[key]); }, 0)); };
  var o = { mountsTotalCost: sum('mountsItems', 'total2'), diamondsTotalCost: sum('diamondsItems', 'total'), gemsTotalCost: sum('gemsItems', 'total'), sertissagesTotalCost: sum('sertissagesItems', 'total2'), internalServicesTotalCost: sum('internalServicesItems', 'total'), mountsItems: V.mountsItems };
  o.fabricationCost = fix3(o.internalServicesTotalCost + o.sertissagesTotalCost + o.mountsTotalCost + o.diamondsTotalCost + o.gemsTotalCost);
  o.current = round3(currentCost(o, goldNow(), o.fabricationCost)); o.sell = round3(o.current * (A.factor || 3));
  return o;
}
function localTotal(q){ var gain = Number(q.gainPercentage) || 0, g = 1 + gain / 100; return (q.items || []).reduce(function(s, it){
  var unit = it.product ? round3(round3(Number(currentCost(it.product, it.goldValue === '' || it.goldValue === undefined ? goldNow() : it.goldValue, N(it.price))) * (1 + gain * 0.01))) : N(it.price) * g;
  return s + Math.round(N(it.quantity) * unit * 100) / 100; }, 0); }

/* what a column or a summary line shows: the record's value, said the way the form says it */
function say(f, v){
  if (!f) return txt(v);
  var kind = f[2] || 'text';
  if (kind === 'check') return v ? 'Oui' : 'Non';
  if (kind === 'date') return day(v);
  if (kind === 'radio'){ var o = f[3].filter(function(x){ return x[0] === v; })[0]; return o ? o[1] : ''; }
  if (kind === 'vendor') return vendorName(v);
  if (kind === 'production'){ var p = A.records.productions.filter(function(x){ return x.id === v; })[0]; return p ? p.reference + ' · ' + txt(p.productName) : ''; }
  if (kind === 'number' || kind === 'calc') return txt(v).replace('.', ',');
  return txt(v);
}
function cell(type, r, key){
  var t = A.types[type], src = t.fromQuote && !(key in r) ? (r.quote || {}) : r, col = t.list.filter(function(c){ return c[0] === key; })[0] || [];
  if (col[2] === 'money') return r[key] === '' || r[key] === undefined ? '' : euros(r[key]);
  if (col[2] === 'date') return day(txt(src[key]));
  return say(fieldsOf(t.fromQuote && src !== r ? A.types.devis : t).filter(function(x){ return x[0] === key; })[0], src[key]);
}

/* ---------- THE TABLE OF ONE OBJECT, with his filter bar: search, sort, status, categories, payment, the trash for a selection, pages ---------- */
var UI = {}, PER = 20;
var SORTS = [['new', 'Plus récent'], ['old', 'Plus ancien'], ['az', 'De A à Z'], ['za', 'De Z à A']];
function listScreen(type, opts){
  opts = opts || {};
  return function(host){
    if (!ready(host)) return;
    var t = A.types[type], all = A.records[type], u = UI[opts.key || type] = UI[opts.key || type] || { q: '', sort: 'new', status: '', cat: {}, pay: '', page: 0, picked: {}, costs: true };
    var fields = fieldsOf(t), hasStatus = fields.some(function(f){ return f[0] === 'checked'; }), isProd = type === 'productions', cols = (opts.cols || t.list).filter(function(c){ return !(isProd && !u.costs && (c[0] === 'fabricationCost' || c[0] === 'currentCost')); });
    var canNew = t.write && !t.noCreate && !opts.noNew, newBtn = function(box, cls){ var nb = node('button', cls + ' new', box, '+ Nouveau'); nb.addEventListener('click', function(){ open(type, null); }); };
    if (!all.length){ var em = empty(host, 'Rien ici pour l’instant', t.fromQuote ? 'Une facture se tire d’un devis : elle en garde le client et les lignes.' : (t.noCreate ? 'Un rapport naît avec chaque facture classée.' : (t.write ? 'Le premier portera le numéro ' + t.next + '.' : ''))); if (canNew) newBtn(em, 'btn primary cta'); ST.count('0'); return; }
    var bar = node('div', 'marks atl-filters', host), tb, pager;
    var s = node('input', 'inline', bar); s.type = 'search'; s.placeholder = 'Chercher un numéro, un nom, un client'; s.value = u.q; s.setAttribute('aria-label', 'Chercher');
    select(bar, 'Trier', SORTS, u.sort, function(v){ u.sort = v; u.page = 0; fill(); });
    if (hasStatus) select(bar, 'Statut', [['', 'Statut : tous'], ['1', 'Vérifié'], ['0', 'Non vérifié']], u.status, function(v){ u.status = v; u.page = 0; fill(); });
    if (isProd){
      if (!hasStatus || opts.key !== 'inventaire') select(bar, 'Vente', [['', 'Vendu ou non'], ['sold', 'Vendu'], ['wait', 'En attente']], u.sold || '', function(v){ u.sold = v; u.page = 0; fill(); });
      /* his three levels of category, each offered only when a production carries one */
      [['parentCategory', 'Catégorie'], ['mainCategory', 'Sous-catégorie'], ['category', 'Sous-sous-catégorie']].forEach(function(c){ var vals = all.map(function(r){ return txt(r[c[0]]); }).filter(function(v, i, a){ return v && a.indexOf(v) === i; }).sort();
        if (vals.length) select(bar, c[1], [['', c[1] + ' : toutes']].concat(vals.map(function(v){ return [v, v]; })), u.cat[c[0]] || '', function(v){ u.cat[c[0]] = v; u.page = 0; fill(); }); });
      if (!opts.key){ var cg = node('span', 'checks', bar); chip(cg, 'Afficher les coûts', u.costs, function(on){ u.costs = on; ST.redraw(); }); }
    }
    if (type === 'founders') select(bar, 'Mode de paiement', [['', 'Paiement : tous']].concat(A.pay), u.pay, function(v){ u.pay = v; u.page = 0; fill(); });
    var del = node('button', 'btn danger push', bar, ''); del.hidden = true;
    if (canNew) newBtn(bar, 'btn primary' + (del ? '' : ''));
    del.addEventListener('click', function(){ var ids = Object.keys(u.picked); if (!ids.length || !confirm('Supprimer ' + ids.length + ' ' + t.one.toLowerCase() + (ids.length > 1 ? 's' : '') + ' ? Ils iront dans les archives.')) return;
      ids.reduce(function(p, id){ return p.then(function(){ return api('atelier/' + type + '/' + id, { method: 'DELETE' }); }); }, Promise.resolve()).then(function(){ u.picked = {}; toast('Supprimé, rangé dans les archives.'); refresh(); }); });
    var heads = (t.write && !opts.noPick ? [''] : []).concat(['N°']).concat(cols.map(function(c){ return c[1]; })).concat(t.money ? ['Total'] : []).concat(opts.extraHead || []).concat(['']);
    tb = tableOf(host, heads); pager = node('div', 'marks atl-pager', host);
    var fill = function(){
      tb.innerHTML = ''; pager.innerHTML = ''; var q = u.q.trim().toLocaleLowerCase();
      var rows = all.map(function(r){ return { r: r, cells: [r.reference || r.number || ''].concat(cols.map(function(c){ return cell(type, r, c[0]); })) }; }).filter(function(x){
        if (q && x.cells.join(' ').toLocaleLowerCase().indexOf(q) < 0) return false;
        if (u.status && (!!x.r.checked) !== (u.status === '1')) return false;
        if (u.sold && (!!A.sold[x.r.id]) !== (u.sold === 'sold')) return false;
        if (u.pay && x.r.type_payment !== u.pay) return false;
        return Object.keys(u.cat).every(function(k){ return !u.cat[k] || txt(x.r[k]) === u.cat[k]; });
      });
      var name = function(x){ return txt(x.cells[1]).toLocaleLowerCase(); }, when = function(x){ return txt(x.r.createdAt); };
      rows.sort(function(a, b){ return u.sort === 'az' ? name(a).localeCompare(name(b)) : (u.sort === 'za' ? name(b).localeCompare(name(a)) : (u.sort === 'old' ? (when(a) < when(b) ? -1 : 1) : (when(a) < when(b) ? 1 : -1))); });
      var pages = Math.max(1, Math.ceil(rows.length / PER)); if (u.page >= pages) u.page = pages - 1;
      rows.slice(u.page * PER, u.page * PER + PER).forEach(function(x){
        var r = x.r, tr = node('tr', opts.rowClass ? opts.rowClass(r) : '', tb);
        if (t.write && !opts.noPick){ var pc = node('td', 'atl-pick', tr), ck = node('input', '', pc); ck.type = 'checkbox'; ck.checked = !!u.picked[r.id]; ck.setAttribute('aria-label', 'Choisir ' + x.cells[0]); ck.addEventListener('click', function(e){ e.stopPropagation(); }); ck.addEventListener('change', function(){ if (ck.checked) u.picked[r.id] = 1; else delete u.picked[r.id]; mark(); }); }
        node('td', 'first', tr, x.cells[0]);
        cols.forEach(function(c, i){ var d = node('td', i ? 'mute' : '', tr, x.cells[i + 1]); if (!i && isProd && A.sold[r.id]) node('span', 'chip on', d, 'Vendu').style.marginLeft = '10px'; });
        if (t.money) node('td', 'num', tr, euros(r.total));
        if (opts.extraCell) opts.extraCell(tr, r);
        var door = node('td', 'door', tr); if (!t.noDoc){ var a = node('a', 'btn small', door, 'Imprimer ↗'); a.href = printUrl(type, r); a.target = '_blank'; a.rel = 'noopener'; a.addEventListener('click', function(e){ e.stopPropagation(); }); }
        tr.tabIndex = 0; tr.addEventListener('click', function(e){ if (e.target.tagName === 'INPUT') return; open(type, r); });
        tr.addEventListener('keydown', function(e){ if (e.target === tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); open(type, r); } });
      });
      if (!rows.length){ var e = node('tr', 'plain', tb), c = node('td', 'emptycell', e); c.colSpan = heads.length; node('div', 'note', c, 'Rien ne correspond.'); }
      ST.count(rows.length === all.length ? String(all.length) : rows.length + ' sur ' + all.length);
      if (pages > 1){ var pv = node('button', 'btn small', pager, 'Précédent'), lab = node('span', 'note', pager, 'Page ' + (u.page + 1) + ' sur ' + pages), nx = node('button', 'btn small', pager, 'Suivant'); lab.className = 'note';
        pv.disabled = !u.page; nx.disabled = u.page >= pages - 1; pv.addEventListener('click', function(){ u.page--; fill(); }); nx.addEventListener('click', function(){ u.page++; fill(); }); }
      mark();
    };
    var mark = function(){ var n = Object.keys(u.picked).length; del.hidden = !n; del.textContent = 'Supprimer la sélection (' + n + ')'; };
    s.addEventListener('input', function(){ u.q = s.value; u.page = 0; fill(); });
    fill();
  };
}

/* ---------- ONE FIELD, in the system: the label above, a short field on half a line, a choice as chips ---------- */
var uid = 0;
function control(box, f, V, onChange, off, sugg){
  var kind = f[2] || 'text', key = f[0], el, set = function(v){ V[key] = v; if (onChange) onChange(); };
  if (kind === 'area'){ el = node('textarea', '', box); el.rows = 3; el.value = txt(V[key]); el.addEventListener('input', function(){ set(el.value); }); }
  else if (kind === 'check'){ var g = node('div', 'checks', box); el = chip(g, f[1], V[key], set); }
  else if (kind === 'radio' && f[3].length <= 4){ var g2 = node('div', 'checks', box), nm = 'atl-r' + (++uid); if (!V[key]) V[key] = f[3][0][0]; f[3].forEach(function(o){ var c = chip(g2, o[1], V[key] === o[0], function(){ set(o[0]); }, 'radio', nm); c.disabled = !!off; if (!el) el = c; }); return el; }
  else if (kind === 'radio'){ el = select(box, f[1], f[3], V[key] || f[3][0][0], set); V[key] = el.value; }
  else if (kind === 'vendor' || kind === 'production'){
    el = select(box, f[1], [['', kind === 'vendor' ? 'Choisir un fournisseur…' : 'Aucune']].concat((kind === 'vendor' ? A.records.vendors : A.records.productions).map(function(o){ return [o.id, kind === 'vendor' ? o.fullName : o.reference + ' · ' + txt(o.productName)]; })), V[key] || '', function(v){ set(v); if (kind === 'production' && V.onProduction) V.onProduction(v); });
  }
  else if (kind === 'calc'){ el = node('input', 'calc', box); el.readOnly = true; el.tabIndex = -1; el.value = txt(V[key]).replace('.', ','); }
  else {
    el = node('input', '', box); el.type = kind === 'number' ? 'number' : (kind === 'date' ? 'date' : 'text'); if (kind === 'number'){ el.step = 'any'; el.min = 0; }
    el.value = txt(V[key]);
    var opts = kind === 'list' ? (f[3] === '@categories' ? A.records.categories.map(function(c){ return c.name; }) : f[3]) : (kind === 'text' ? sugg : null);
    if (opts && opts.length){ var id = 'atl-' + (++uid), dl = node('datalist', '', box); dl.id = id; opts.forEach(function(o){ node('option', '', dl).value = o; }); el.setAttribute('list', id); }
    el.addEventListener('input', function(){ set(el.value); });
  }
  el.setAttribute('aria-label', f[1]); el.disabled = !!off;
  return el;
}
/* his search suggestions (the client of a past quote, a company of a past note): what was typed before in the same field is offered again */
function suggestions(type, key){ var seen = {}; (A.records[type] || []).forEach(function(r){ var v = txt(r[key]).trim(); if (v) seen[v] = 1; }); return Object.keys(seen).slice(0, 60); }
function fieldRow(box, type, f, V, onChange, off){
  var kind = f[2] || 'text', wide = kind === 'area' || kind === 'photo', row = node('div', 'field' + (wide ? '' : ' half'), box);
  if (kind !== 'check') node('label', '', row, f[1]);
  if (kind === 'photo') photoField(row, V, off); else control(row, f, V, onChange, off, kind === 'text' ? suggestions(type, f[0]) : null);
  return row;
}
function photoField(box, V, off){
  var wrap = node('div', 'atl-photo', box), frame = node('div', 'frame', wrap), side = node('div', 'side', wrap);
  var show = function(){ frame.innerHTML = ''; var a = txt(V.avatar), src = V.avatarData || (a.indexOf('image:') === 0 ? '../api/atelier/image/' + a.slice(6) : (a.indexOf('site:') === 0 ? '../site/' + a.slice(5) : '')); if (src){ var im = node('img', '', frame); im.alt = ''; im.src = src; } };
  show();
  if (off) return;
  var up = node('label', 'btn small', side, 'Choisir un fichier'), fi = node('input', '', up); fi.type = 'file'; fi.accept = 'image/jpeg,image/png,image/webp'; fi.hidden = true;
  fi.addEventListener('change', function(){ var file = fi.files[0]; if (!file) return; var r = new FileReader(); r.onload = function(){ V.avatarData = r.result; show(); }; r.readAsDataURL(file); });
  select(side, 'Photo d’une pièce du site', [['', 'Ou une pièce du site…']].concat(ST.S.pieces.map(function(p){ return [p.slug, p.name]; })), '', function(v){ var p = ST.S.pieces.filter(function(x){ return x.slug === v; })[0]; if (!p) return; delete V.avatarData; V.avatar = 'site:' + p.image; show(); if (V.onPiece) V.onPiece(p); });
  var rm = node('button', 'btn small', side, 'Retirer la photo'); rm.type = 'button'; rm.addEventListener('click', function(){ delete V.avatarData; V.avatar = ''; show(); });
}
/* the lines of a document, the stones of a certificate, the lines of a production: one card per line */
function itemsBlock(box, f, V, onChange, off, extra){
  var wrap = node('div', 'atl-items', box), listEl = node('div', '', wrap);
  if (!Array.isArray(V[f[0]])) V[f[0]] = [];
  var draw = function(){
    listEl.innerHTML = '';
    V[f[0]].forEach(function(row, k){
      var shown = f[3].filter(function(s){ return s[2] !== 'hidden'; }), it = node('div', 'fields sender atl-line' + (shown.length <= 3 ? ' three' : ''), listEl), calcs = {};
      var changed = function(){ if (LIVE[f[0]]){ LIVE[f[0]](row); Object.keys(calcs).forEach(function(k2){ calcs[k2].value = txt(row[k2]).replace('.', ','); }); } if (onChange) onChange(); };
      if (LIVE[f[0]]) LIVE[f[0]](row);
      shown.forEach(function(s){ var c = node('div', 'field half' + (s[0] === 'name' ? ' grow' : ''), it); if (s[2] !== 'check') node('label', '', c, s[1]); var e = control(c, s, row, changed, off); if (s[2] === 'calc') calcs[s[0]] = e; });
      if (row.product) node('p', 'fhint from', it, 'Tirée de la production ' + row.product.reference + ', or à ' + euros(row.goldValue) + ' le gramme : son prix suit le calcul d’origine.');
      if (!off){ var x = node('button', 'sign x', it, '×'); x.type = 'button'; x.title = 'Retirer la ligne'; x.setAttribute('aria-label', 'Retirer la ligne'); x.addEventListener('click', function(){ V[f[0]].splice(k, 1); draw(); if (onChange) onChange(); }); }
    });
    if (!V[f[0]].length) node('p', 'note', listEl, 'Aucune ligne pour l’instant.');
  };
  draw();
  if (off) return;
  var acts = node('div', 'marks', wrap), ad = node('button', 'btn', acts, '+ Ajouter une ligne'); ad.type = 'button';
  ad.addEventListener('click', function(){ V[f[0]].push(f[0] === 'mountsItems' ? { price24k: goldNow() || '' } : {}); draw(); var last = listEl.querySelector('.atl-line:last-child input:not([type=checkbox]),.atl-line:last-child select'); if (last) last.focus(); });
  if (extra) extra(acts, function(row){ V[f[0]].push(row); draw(); if (onChange) onChange(); });
}

/* ---------- THE RECORD, STEP BY STEP: his steps in his order, Back and Next, a summary before saving ---------- */
var PROD_STEPS = ['basicInfo', 'mounts', 'diamonds', 'gems', 'sertissage', 'internalServices'];
function open(type, rec, quoteId, draft, at){
  var t = A.types[type], isNew = !rec, V = draft || JSON.parse(JSON.stringify(rec || {})), m = A.maison, steps = t.steps, step = at || 0;
  if (isNew && !draft){
    V.date = new Date().toISOString().slice(0, 10);
    if (type === 'livraisons'){ V.number = t.next; V.transferorCompany = m.fullName || ''; V.transferorAddress = m.address || ''; V.transferorVatNumber = m.vatNumber || ''; V.transferorTaxCode = m.taxCode || ''; }
    if (type === 'devis'){ V.gainPercentage = 0; V.items = [{ quantity: 1 }]; }
    if (type === 'transports'){ V.number = t.next; V.senderCompany = m.fullName || ''; V.senderAddress = m.address || ''; V.senderVatNumber = m.vatNumber || ''; V.senderTaxCode = m.taxCode || ''; V.reglement = 'inAccount'; }
    if (quoteId){ V.quoteId = quoteId; V.quote = A.records.devis.filter(function(d){ return d.id === quoteId; })[0] || {}; step = 1; }
  }
  /* what this account may write: everything for an admin; for a production, the steps ticked for it */
  var rights = A.my ? A.my.production : null, mayStep = function(i){ return t.write && (type !== 'productions' || !rights || rights[PROD_STEPS[i]].edit); }, seesStep = function(i){ return type !== 'productions' || !rights || rights[PROD_STEPS[i]].edit || rights[PROD_STEPS[i]].viewOnly; };
  var P = ST.panel(t.one), body = P.body; P.foot.remove();
  var form = node('div', 'formpiece', body), rh = node('div', 'rhead2', form), rt = node('div', 'rtext', rh), title = node('h2', 'rtitle', rt), sub = node('div', 'rsub', rt);
  var again = function(){ open(type, rec, undefined, V, step); };
  V.onPiece = function(p){ if (!txt(V.productName)){ V.productName = p.name; again(); } };
  V.onProduction = function(pid){
    var pr = A.records.productions.filter(function(x){ return x.id === pid; })[0]; if (!pr) return;
    if (!txt(V.productName)) V.productName = pr.productName; if (!txt(V.category)) V.category = pr.category; if (!txt(V.avatar) && !V.avatarData) V.avatar = pr.avatar || '';
    if (!(V.diamondsItems || []).length) V.diamondsItems = (pr.diamondsItems || []).map(function(d){ return { isMainDiamond: !!d.isMainDiamond, ct: d.ct }; });
    if (!(V.gemsItems || []).length) V.gemsItems = (pr.gemsItems || []).map(function(g){ return { isMainGem: !!g.isMainGem, weight: g.carat, variety: g.type }; });
    again();
  };
  var Q = function(){ return t.fromQuote ? (V.quote || {}) : V; };
  var sum = function(){ return type === 'transports' ? (V.transportItem || []).reduce(function(s2, it){ return s2 + N(it.price) * N(it.quantity); }, 0) : localTotal(Q()); };
  var totalEl = null, head = function(){
    title.textContent = txt(Q()[t.name]) || (isNew ? 'Nouveau : ' + t.one.toLowerCase() : t.one);
    sub.textContent = (isNew ? ('number' in V ? 'Numéro ' + txt(V.number) : 'Portera le numéro ' + t.next) : 'N° ' + (V.reference || V.number)) + (t.money ? ' · ' + euros(sum()) : '');
    if (totalEl) totalEl.textContent = euros(sum());
  };
  /* the stepper: his steps, then the last one (Preview, Total costs, Summary). A step is one press away at any time. */
  var names = steps.map(function(s){ return s[0]; }).concat([t.last]), tabs = node('div', 'ptabs atl-steps', form), host = node('div', 'atl-step', form), foot = node('div', 'actions marks formfoot', form);
  names.forEach(function(nm, i){ var b = node('button', i === step ? 'cur' : '', tabs, (i + 1) + '. ' + nm); b.type = 'button'; b.hidden = i < steps.length && steps[i][1].length === 1 && !seesStep(steps[i][1][0]) && type === 'productions'; b.addEventListener('click', function(){ go(i); }); });
  function go(i){ if (t.fromQuote && isNew && i > 0 && !V.quoteId){ toast('Il faut d’abord choisir un devis.', true); return; } step = i; Array.prototype.forEach.call(tabs.children, function(b, k){ b.className = k === i ? 'cur' : ''; }); drawStep(); el('panel').scrollTop = 0; }
  function el(id){ return document.getElementById(id); }
  function drawStep(){
    host.innerHTML = ''; totalEl = null;
    if (step >= steps.length) summary(); else {
      if (t.fromQuote && step === 0) findQuote();
      steps[step][1].forEach(function(gi){ group(gi); });
      if (type === 'vendors' && !isNew) vendorSheet(host, V);
      if (type === 'incomes') incomeSheet(host, V);
    }
    drawFoot(); head();
  }
  function group(gi){
    var g = t.groups[gi], off = !mayStep(gi); if (!seesStep(gi)) return;
    node('h3', '', node('div', 'sec', host), g[0]);
    var fs = node('div', 'fields sender', host);
    g[1].forEach(function(f){
      if (f[2] === 'items'){ itemsBlock(host, f, V, head, off, type === 'devis' && lineSources); return; }
      fieldRow(fs, type, f, V, head, off);
    });
    if (!fs.children.length) fs.remove();
  }
  function lineSources(acts, push){
    select(acts, 'Ajouter une pièce du site', [['', '+ Une pièce du site…']].concat(ST.S.pieces.map(function(p){ return [p.slug, p.name + (p.price ? ' · ' + euros(p.price) : '')]; })), '', function(v){ var p = ST.S.pieces.filter(function(x){ return x.slug === v; })[0]; if (p) push({ name: p.name, price: p.price || '', quantity: 1 }); });
    if (A.records.productions.length) select(acts, 'Ajouter une production', [['', '+ Une production…']].concat(A.records.productions.map(function(p){ return [p.id, p.reference + ' · ' + txt(p.productName) + ' · coût ' + euros(p.fabricationCost)]; })), '', function(v){ var p = A.records.productions.filter(function(x){ return x.id === v; })[0]; if (!p) return;
      push({ name: p.productName, price: p.fabricationCost, quantity: 1, productId: p.id, goldValue: goldNow(), product: { reference: p.reference, productName: p.productName, mountsItems: p.mountsItems || [], internalServicesTotalCost: p.internalServicesTotalCost, sertissagesTotalCost: p.sertissagesTotalCost, gemsTotalCost: p.gemsTotalCost, diamondsTotalCost: p.diamondsTotalCost, fabricationCost: p.fabricationCost } }); });
  }
  function findQuote(){
    node('h3', '', node('div', 'sec', host), 'Le devis');
    if (!isNew){ var q = V.quote || {}, inf = node('div', 'fields', host); [['Devis', q.reference], ['Client', q.customerName], ['Adresse', q.address], ['Téléphone', q.phoneNumber], ['Code fiscal', q.fiscalCode]].forEach(function(r){ if (!r[1]) return; var f = node('div', 'field', inf); node('label', '', f, r[0]); node('div', 'v', f, r[1]); }); lines(host, q); return; }
    if (!A.records.devis.length){ empty(host, 'Pas encore de devis', 'Une facture se tire d’un devis : elle en garde le client et les lignes.'); return; }
    var fs = node('div', 'fields sender', host), row = node('div', 'field', fs); node('label', '', row, 'Le devis à facturer');
    select(row, 'Devis', [['', 'Choisir un devis…']].concat(A.records.devis.slice().reverse().map(function(d){ return [d.id, d.reference + ' · ' + txt(d.customerName) + ' · ' + euros(d.total)]; })), V.quoteId || '', function(v){ V.quoteId = v; V.quote = A.records.devis.filter(function(d){ return d.id === v; })[0] || {}; drawStep(); });
    if (V.quoteId) lines(host, V.quote);
  }
  function lines(box, q){ var its = node('div', 'items', box); (q.items || []).forEach(function(it){ var row = node('div', 'item', its), nm = node('div', 'nm', row); node('b', '', nm, txt(it.name)); node('span', 'k', row, txt(it.quantity) + ' × ' + euros(it.price)); }); }
  /* the last step: everything that was typed, read back, with the totals; once saved, the document itself */
  function summary(){
    if (type === 'productions'){ var c = costs(V); node('h3', '', node('div', 'sec', host), 'Les coûts'); var ce = node('div', 'fields costs', host);
      [['Montures', c.mountsTotalCost], ['Diamants', c.diamondsTotalCost], ['Gemmes', c.gemsTotalCost], ['Sertissage', c.sertissagesTotalCost], ['Services internes', c.internalServicesTotalCost], ['Coût de fabrication', c.fabricationCost], ['Coût actuel, or à ' + euros(goldNow()) + ' le gramme', c.current], ['Prix de vente, coefficient ' + (A.factor || 3), c.sell]].forEach(function(r, i){ var f = node('div', 'field' + (i > 4 ? ' strong' : ''), ce); node('label', '', f, r[0]); node('div', 'v', f, euros(r[1])); }); }
    if (!isNew && !t.noDoc && rec){ node('h3', '', node('div', 'sec', host), 'Le document'); var fr = node('iframe', 'atl-preview', host); fr.title = 'Aperçu du document'; fr.src = printUrl(type, V); node('p', 'fhint', host, 'L’aperçu montre le document tel qu’il est enregistré. Enregistrez pour le voir à jour.'); }
    steps.forEach(function(s, si){
      var any = false, box = document.createElement('div'), list = node('div', 'fields', box);
      if (t.fromQuote && si === 0){ var q = Q(); [['Devis', q.reference], ['Client', q.customerName]].forEach(function(r){ if (!r[1]) return; any = true; var f = node('div', 'field', list); node('label', '', f, r[0]); node('div', 'v', f, r[1]); }); lines(box, q); }
      s[1].forEach(function(gi){ if (!seesStep(gi)) return; t.groups[gi][1].forEach(function(f){
        if (f[2] === 'photo') return;
        if (f[2] === 'items'){ (V[f[0]] || []).forEach(function(row){ any = true; var it = node('div', 'item', node('div', 'items', box)), nm = node('div', 'nm', it), shown = f[3].filter(function(x){ return x[2] !== 'hidden' && row[x[0]] !== '' && row[x[0]] !== undefined && row[x[0]] !== false; });
            node('b', '', nm, say(shown[0], row[(shown[0] || [])[0]])); node('span', '', nm, shown.slice(1).map(function(x){ return x[1] + ' ' + say(x, row[x[0]]); }).join(' · ')); }); return; }
        var v = say(f, V[f[0]]); if (!v || (f[2] === 'check' && !V[f[0]])) return; any = true; var r = node('div', 'field', list); node('label', '', r, f[1]); node('div', 'v', r, v); }); });
      if (any){ node('h3', '', node('div', 'sec', host), s[0]); host.appendChild(box); }
    });
    if (t.money){ var tot = node('div', 'atl-total', host); node('span', '', tot, 'Total'); totalEl = node('b', '', tot); }
  }
  function drawFoot(){
    foot.innerHTML = ''; var last = step >= steps.length;
    if (step > 0){ var bk = node('button', 'btn', foot, '← Précédent'); bk.type = 'button'; bk.addEventListener('click', function(){ go(step - 1); }); }
    if (!last){ var nx = node('button', isNew ? 'mark' : 'btn', foot, 'Suivant →'); nx.type = 'button'; nx.addEventListener('click', function(){ go(step + 1); }); }
    if (t.write && (last || !isNew)){ var sv = node('button', 'mark', foot, isNew ? 'Créer' : 'Enregistrer'); sv.type = 'button'; sv.addEventListener('click', function(){ save(sv); }); }
    if (!isNew){
      if (!t.noDoc){ var pr = node('a', 'btn push', foot, 'Imprimer ↗'); pr.href = printUrl(type, V); pr.target = '_blank'; pr.rel = 'noopener'; }
      if (type === 'productions'){ var tk = node('a', 'btn push', foot, 'Étiquette ↗'); tk.href = '../api/atelier/productions/' + V.id + '/ticket'; tk.target = '_blank'; tk.rel = 'noopener'; }
      if (type === 'devis' && A.types.factures.write){ var inv = node('button', 'btn', foot, 'Créer la facture'); inv.type = 'button'; inv.addEventListener('click', function(){ open('factures', null, V.id); }); }
      if (t.write){ var del = node('button', 'mark gone', foot, 'Supprimer'); del.type = 'button'; del.addEventListener('click', function(){ if (!confirm('Supprimer ' + t.one.toLowerCase() + ' ' + (V.reference || V.number) + ' ? Il ira dans les archives.')) return; api('atelier/' + type + '/' + V.id, { method: 'DELETE' }).then(function(r){ if (!r.ok){ toast('Non supprimé : ' + (r.body.error || r.status), true); return; } toast('Supprimé, rangé dans les archives.'); P.close(); refresh(); }); }); }
    }
  }
  function save(btn){
    if (t.fromQuote && isNew && !V.quoteId){ toast('Il faut choisir un devis.', true); go(0); return; }
    var out = Object.assign({}, V); delete out.onPiece; delete out.onProduction; delete out.quote; delete out.total;
    btn.disabled = true;
    api('atelier/' + type + (isNew ? '' : '/' + V.id), { method: isNew ? 'POST' : 'PUT', json: out }).then(function(r){
      btn.disabled = false;
      if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; }
      toast(t.one + ' ' + (r.body.reference || r.body.number) + ' enregistré.');
      fetchAll().then(function(){ ST.redraw(); var fresh = A.records[type].filter(function(x){ return x.id === r.body.id; })[0]; if (fresh) open(type, fresh, undefined, undefined, Math.min(step, A.types[type].steps.length)); });
    });
  }
  drawStep();
}
function incomeSheet(host, V){
  node('h3', '', node('div', 'sec', host), 'Les chiffres');
  var inf = node('div', 'fields', host); [['Facture', (V.income || {}).reference], ['Client', V.customerName], ['Fabrication', euros(V.manufacturing)], ['Marge', txt(V.margin) + ' %'], ['Prix de vente', euros(V.sellingPrice)], ['Revenu', euros(V.revenue)]].forEach(function(r){ var f = node('div', 'field', inf); node('label', '', f, r[0]); node('div', 'v', f, txt(r[1])); });
  var il = node('div', 'items', host); ((((V.income || {}).quote || {}).items) || []).forEach(function(it){ var row = node('div', 'item', il), nm = node('div', 'nm', row); node('b', '', nm, txt(it.name)); node('span', 'k', row, txt(it.quantity) + ' × ' + euros(it.price)); });
}

/* ---------- a vendor's sheet (his vendors/view): the work given, filtered as in his bar, and the payments ---------- */
var VF = { service: '', paid: '', pay: '' };
function vendorSheet(body, V){
  var PAY = A.pay, paid = A.payments.filter(function(x){ return x.vendor === V.id; }).reverse(), names = { mounts: 'Monture', diamonds: 'Diamants', gems: 'Gemmes', sertissages: 'Sertissage', internalServices: 'Service interne' };
  var reopen = function(){ fetchAll().then(function(){ ST.redraw(); open('vendors', A.records.vendors.filter(function(x){ return x.id === V.id; })[0]); }); };
  var due = node('div', 'atl-total', body); node('span', '', due, 'Dû au fournisseur'); node('b', '', due, euros(V.duePayment));
  node('h3', '', node('div', 'sec', body), 'Les travaux confiés');
  var bar = node('div', 'marks atl-filters', body), box = node('div', '', body);
  var draw = function(){
    box.innerHTML = '';
    var mine = A.services.filter(function(x){ return x.vendor === V.id && (!VF.service || x.serviceName === VF.service) && (!VF.paid || (!!x.servicePaid) === (VF.paid === '1')) && (!VF.pay || x.servicePaymentType === VF.pay); }).reverse();
    if (!mine.length) node('p', 'note', box, 'Aucun travail ne correspond. Une ligne de production à son nom en crée un.');
    mine.forEach(function(sv){
      /* his rule (compareDate): unpaid and past its payment date reads in red */
      var late = !sv.servicePaid && sv.servicePaymentDate && sv.servicePaymentDate < new Date().toISOString().slice(0, 10);
      var row = node('div', 'atl-service' + (late ? ' late' : ''), box), nm = node('div', 'nm', row); node('b', '', nm, txt(sv.productRef) + ' · ' + txt(sv.productName)); node('span', '', nm, (names[sv.serviceName] || sv.serviceName) + ' · ' + day(txt(sv.createdAt)) + (late ? ' · en retard' : ''));
      node('span', 'cost', row, euros(sv.serviceCost));
      var put = function(patch){ api('atelier/vendorservices/' + sv.id, { method: 'PUT', json: patch }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } reopen(); }); };
      var f1 = node('div', 'field', row); select(f1, 'Mode de paiement', [['', 'Mode…']].concat(PAY), sv.servicePaymentType || '', function(v){ put({ servicePaymentType: v }); }).disabled = !A.admin;
      var f2 = node('div', 'field', row), dt = node('input', '', f2); dt.type = 'date'; dt.setAttribute('aria-label', 'Date de paiement'); dt.value = sv.servicePaymentDate || ''; dt.disabled = !A.admin; dt.addEventListener('change', function(){ put({ servicePaymentDate: dt.value }); });
      chip(node('span', 'checks', row), 'Payé', sv.servicePaid, function(on){ put({ servicePaid: on }); }).disabled = !A.admin;
    });
  };
  select(bar, 'Service', [['', 'Service : tous']].concat(Object.keys(names).map(function(k){ return [k, names[k]]; })), VF.service, function(v){ VF.service = v; draw(); });
  select(bar, 'Statut', [['', 'Statut : tous'], ['1', 'Payé'], ['0', 'Non payé']], VF.paid, function(v){ VF.paid = v; draw(); });
  select(bar, 'Mode de paiement', [['', 'Paiement : tous']].concat(PAY), VF.pay, function(v){ VF.pay = v; draw(); });
  draw();
  node('h3', '', node('div', 'sec', body), 'Les paiements');
  if (A.admin){
    var fs = node('div', 'fields sender atl-payform', body), P = { sum: '', paymentType: '', description: '' };
    var a = node('div', 'field half', fs); node('label', '', a, 'Somme payée'); control(a, ['sum', 'Somme payée', 'number'], P);
    var b = node('div', 'field half', fs); node('label', '', b, 'Mode du paiement'); select(b, 'Mode du paiement', [['', 'Choisir…']].concat(PAY), '', function(v){ P.paymentType = v; });
    var c = node('div', 'field', fs); node('label', '', c, 'Description'); control(c, ['description', 'Description du paiement'], P);
    var go = node('button', 'btn', node('div', 'marks', body), 'Enregistrer le paiement'); go.type = 'button';
    go.addEventListener('click', function(){ api('atelier/vendors/' + V.id + '/paiements', { method: 'POST', json: P }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } toast('Paiement enregistré.'); reopen(); }); });
  }
  if (!paid.length) node('p', 'note', body, 'Aucun paiement enregistré.');
  var its = node('div', 'items', body);
  paid.forEach(function(h){ var row = node('div', 'item', its), nm = node('div', 'nm', row); node('b', '', nm, h.reference + ' · ' + euros(h.sum)); node('span', '', nm, [(PAY.filter(function(o){ return o[0] === h.paymentType; })[0] || [])[1], h.description, day(txt(h.createdAt))].filter(Boolean).join(' · '));
    if (A.admin){ var x = node('button', 'sign x', row, '×'); x.title = 'Retirer ce paiement de l’historique'; x.setAttribute('aria-label', 'Retirer le paiement ' + h.reference); x.addEventListener('click', function(){ if (!confirm('Retirer le paiement ' + h.reference + ' de l’historique ? Le dû ne change pas.')) return; api('atelier/vendorhistories/' + h.id, { method: 'DELETE' }).then(reopen); }); } });
}

/* ---------- the gold price: typed, dated, kept ---------- */
ST.register('or', function(host){
  if (!ready(host)) return;
  node('h3', '', node('div', 'sec atl-head', host), 'Cours de l’or, le gramme de 24k en euros'); ST.count(String(A.gold.length));
  if (A.admin){
    var fs = node('div', 'fields sender', host), P = { price: '', date: new Date().toISOString().slice(0, 10) };
    var a = node('div', 'field half', fs); node('label', '', a, 'Cours, en euros par gramme'); control(a, ['price', 'Cours de l’or', 'number'], P);
    var b = node('div', 'field half', fs); node('label', '', b, 'Date du cours'); control(b, ['date', 'Date du cours', 'date'], P);
    var acts = node('div', 'marks', host), go = node('button', 'mark', acts, 'Enregistrer le cours');
    go.addEventListener('click', function(){ api('atelier/or', { method: 'POST', json: P }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } toast('Cours enregistré.'); refresh(); }); });
    if (A.goldApi){ var live = node('button', 'btn', acts, 'Lire le cours sur goldapi.io'); live.addEventListener('click', function(){ api('atelier/or/actualiser', { method: 'POST' }).then(function(r){ if (!r.ok){ toast('Cours non lu : ' + (r.body.error || r.status), true); return; } toast('Cours lu : ' + euros(r.body.price)); refresh(); }); }); }
  }
  if (!A.gold.length){ empty(host, 'Aucun cours enregistré', 'Le coût actuel et le prix de vente des productions se comptent avec le dernier cours.'); return; }
  var tb = tableOf(host, ['Date', 'Cours', 'Écart', 'Source', '']);
  A.gold.forEach(function(g, i){ var tr = node('tr', 'plain', tb), prev = A.gold[i + 1]; node('td', 'first', tr, day(txt(g.createdAt))); node('td', 'num', tr, euros(g.price)); node('td', 'mute', tr, prev ? String(round3(g.price - prev.price)).replace('.', ',') : ''); node('td', 'mute', tr, txt(g.source));
    var d = node('td', 'door', tr); if (A.admin){ var x = node('button', 'btn small', d, 'Retirer'); x.addEventListener('click', function(){ if (!confirm('Retirer ce cours ?')) return; api('atelier/or/' + g.id, { method: 'DELETE' }).then(refresh); }); } });
});

/* ---------- the archives (his seven archive tables in one screen): what was deleted, with its way back ---------- */
ST.register('archives', function(host){
  if (!ready(host)) return;
  node('h3', '', node('div', 'sec atl-head', host), 'Archives'); var keys = Object.keys(A.archives), n = 0;
  if (!keys.length){ empty(host, 'Rien dans les archives', 'Ce qui est supprimé dans l’atelier arrive ici et peut être remis à sa place.'); ST.count('0'); return; }
  keys.forEach(function(k){ var t = A.types[k]; node('h3', '', node('div', 'sec', host), t.one);
    var tb = tableOf(host, ['N°', 'Nom', 'Supprimé le', '']);
    A.archives[k].slice().reverse().forEach(function(r){ n++; var src = t.fromQuote ? (r.quote || {}) : r, tr = node('tr', 'plain', tb); node('td', 'first', tr, r.reference || r.number || ''); node('td', '', tr, txt(src[t.name] || (r.income && ((r.income.quote || {}).customerName)) || '')); node('td', 'mute', tr, day(txt(r.deletedAt)));
      var d = node('td', 'door', tr), b = node('button', 'btn small', d, 'Remettre'); b.addEventListener('click', function(){ api('atelier/' + k + '/' + r.id + '/restaurer', { method: 'POST' }).then(function(x){ if (!x.ok){ toast('Non remis : ' + (x.body.error || x.status), true); return; } toast(t.one + ' remis à sa place.'); refresh(); }); }); }); });
  ST.count(String(n));
});

/* ---------- the dashboard, in the order of his: overview, product status, gold price, categories, activity, logs ---------- */
var dashDay = '', dashSpan = '7';
var WHAT = { create: 'Création', update: 'Modification', 'delete': 'Suppression', restore: 'Remise en place', paiement: 'Paiement d’un fournisseur', 'paiement-delete': 'Paiement retiré', service: 'Travail d’un fournisseur', or: 'Cours de l’or', 'or-delete': 'Cours retiré', maison: 'Maison', droits: 'Droits d’un utilisateur' };
ST.register('tableau', function(host){
  if (!ready(host)) return;
  var D = A.dash; ST.count('');
  node('h3', '', node('div', 'sec atl-head', host), 'Vue d’ensemble');
  var tiles = node('div', 'tiles', host); [['Utilisateurs', D.overview.users], ['Fournisseurs', D.overview.vendors], ['Catégories', D.overview.categories], ['Productions', D.overview.products]].forEach(function(o){ var ti = node('div', 'tile', tiles); node('div', 'big', ti, String(o[1])); node('div', 'lbl', ti, o[0]); });
  var grid = node('div', 'atl-dash', host), card = function(title, wide){ var c = node('div', 'card' + (wide ? ' wide' : ''), grid), h = node('div', 'sec', c); node('h3', '', h, title); c.head = h; return c; };
  var bars = function(box, list){ list.forEach(function(c){ var r = node('div', 'bar', box); node('span', '', r, c[0]); var tr = node('i', '', r); node('b', '', tr).style.width = c[1] + '%'; node('em', '', r, String(round3(c[1])).replace('.', ',') + ' %'); }); };
  var st = card('Statut des produits'), tot = D.status.sold + D.status.standby;
  if (!tot) node('p', 'note', st, 'Aucune production.'); else { bars(st, [['Vendus (' + D.status.sold + ')', D.status.sold / tot * 100], ['En attente (' + D.status.standby + ')', D.status.standby / tot * 100]]); node('p', 'fhint', st, 'Une production est vendue quand une facture classée porte une ligne tirée d’elle.'); }
  var gold = card('Cours de l’or, le gramme');
  if (!D.gold.length) node('p', 'note', gold, 'Aucun cours enregistré.');
  else { node('div', 'bigfig', gold, euros(D.gold[0].price)); var gl = node('div', 'fields', gold); D.gold.slice(1).forEach(function(g){ var r = node('div', 'field', gl); node('label', '', r, day(txt(g.createdAt))); node('div', 'v', r, euros(g.price) + (g.difference ? '   ' + (g.difference > 0 ? '+' : '') + String(g.difference).replace('.', ',') : '')); }); }
  var cats = card('Catégories des productions');
  if (!D.categories.length) node('p', 'note', cats, 'Aucune production.'); else bars(cats, D.categories.map(function(c){ return [c.category || 'Sans catégorie', c.percentage]; }));
  var fo = card('Fonderie');
  if (!D.founders.count) node('p', 'note', fo, 'Aucune transaction.');
  else { var fl = node('div', 'fields', fo); [['Or reçu 18k', D.founders.received18 + ' g'], ['Or donné 24k', D.founders.given24 + ' g'], ['Différence en 24k', D.founders.difference + ' g'], ['Transactions', D.founders.count]].forEach(function(o){ var r = node('div', 'field', fl); node('label', '', r, o[0]); node('div', 'v', r, String(o[1]).replace('.', ',')); }); }
  var act = card('Activité, les ventes', true);
  select(act.head, 'Période', [['7', '7 derniers jours'], ['day', 'Par jour'], ['month', 'Par mois'], ['year', 'Par année']], dashSpan, function(v){ dashSpan = v; ST.redraw(); }).className = 'add';
  var pts = {};
  if (dashSpan === '7'){ for (var i = 6; i >= 0; i--){ pts[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = 0; } D.sales.forEach(function(x){ if (x.date in pts) pts[x.date] += x.total; }); }
  else D.sales.forEach(function(x){ var k = dashSpan === 'year' ? x.date.slice(0, 4) : (dashSpan === 'month' ? x.date.slice(0, 7) : x.date); pts[k] = (pts[k] || 0) + x.total; });
  var ks = Object.keys(pts), max = Math.max.apply(null, ks.map(function(k){ return pts[k]; }).concat([0]));
  if (!D.sales.length) node('p', 'note', act, 'Aucune vente : une facture classée en inscrit une au jour de sa création.');
  else { var ch = node('div', 'chart', act); ks.forEach(function(k){ var c = node('div', 'col', ch); c.title = k + ' : ' + euros(pts[k]); node('em', '', c, pts[k] ? euros(pts[k]) : ''); node('i', '', c).style.height = (max ? Math.max(pts[k] / max * 100, pts[k] ? 2 : 0) : 0) + '%'; node('span', '', c, dashSpan === '7' || dashSpan === 'day' ? day(k).slice(0, 5) : k); }); }
  var lg = card('Journal', true), dd = node('input', 'add', lg.head); dd.type = 'date'; dd.setAttribute('aria-label', 'Jour du journal'); dd.value = dashDay || new Date().toISOString().slice(0, 10);
  var lines = node('div', 'items', lg), fill = function(){ api('atelier/journal/' + dd.value).then(function(r){ lines.innerHTML = ''; var l = r.ok ? r.body.logs : []; if (!l.length) node('p', 'note', lines, 'Aucune action ce jour-là.'); l.forEach(function(x){ var row = node('div', 'item', lines), nm = node('div', 'nm', row); node('b', '', nm, (WHAT[txt(x.what).replace('atelier-', '')] || txt(x.what)) + (x.type ? ' · ' + (A.types[x.type] ? A.types[x.type].one : x.type) : '') + (x.reference ? ' · ' + x.reference : '')); node('span', '', nm, txt(x.who) + ' · ' + txt(x.t).slice(11, 16)); }); }); };
  dd.addEventListener('change', function(){ dashDay = dd.value; fill(); }); fill();
});

/* ---------- his Users screen: the studio's accounts and what each may do in the atelier (his permissions, under his names) ---------- */
ST.register('droits', function(host){
  if (!ready(host)) return;
  node('h3', '', node('div', 'sec atl-head', host), 'Utilisateurs et droits'); ST.count(String((A.users || []).length));
  node('p', 'note', host, 'Les comptes se créent dans Comptes. Un admin du studio fait tout ; pour les autres, on coche ici ce qu’ils voient et modifient dans l’atelier.');
  var tb = tableOf(host, ['Nom', 'Rôle', 'Droits dans l’atelier', '']);
  var DOCS = [['quotes', 'Devis'], ['invoice', 'Factures'], ['transport', 'Transport'], ['deliveryNotes', 'Bons de livraison'], ['incomeReports', 'Rapports de revenus']], STEP = [['basicInfo', 'Informations de base'], ['mounts', 'Montures'], ['diamonds', 'Diamants'], ['gems', 'Gemmes'], ['sertissage', 'Sertissage'], ['internalServices', 'Services internes']];
  (A.users || []).forEach(function(u){
    var tr = node('tr', '', tb), r = u.rights, admin = u.role === 'admin', has = DOCS.filter(function(d){ return r[d[0]]; }).map(function(d){ return d[1]; }).concat(STEP.some(function(s){ return r.production[s[0]].edit || r.production[s[0]].viewOnly; }) ? ['Production'] : []);
    node('td', 'first', tr, u.name || u.email); node('td', 'mute', tr, admin ? 'Admin' : u.role); node('td', 'mute', tr, admin ? 'Tout' : (has.join(', ') || 'Aucun')); node('td', 'door', tr);
    if (admin){ tr.className = 'plain'; return; }
    tr.tabIndex = 0; tr.addEventListener('click', function(){
      var R = JSON.parse(JSON.stringify(r)), P = ST.panel('Utilisateur'), form = node('div', 'formpiece', P.body); P.foot.remove();
      node('h2', 'rtitle', form, u.name || u.email); node('div', 'rsub', form, u.email + ' · ' + u.role);
      node('h3', '', node('div', 'sec', form), 'Documents'); var g = node('div', 'checks', form); DOCS.forEach(function(d){ chip(g, d[1], R[d[0]], function(on){ R[d[0]] = on; }); });
      node('h3', '', node('div', 'sec', form), 'Production, étape par étape');
      var fs = node('div', 'fields sender', form); STEP.forEach(function(s){ var f = node('div', 'field half', fs); node('label', '', f, s[1]); var c = node('div', 'checks', f), view = chip(c, 'Voir', R.production[s[0]].viewOnly || R.production[s[0]].edit, function(on){ R.production[s[0]].viewOnly = on; if (!on){ R.production[s[0]].edit = false; ed.checked = false; } }), ed = chip(c, 'Modifier', R.production[s[0]].edit, function(on){ R.production[s[0]].edit = on; if (on){ R.production[s[0]].viewOnly = true; view.checked = true; } }); });
      var foot = node('div', 'actions marks formfoot', form), sv = node('button', 'mark', foot, 'Enregistrer les droits');
      sv.addEventListener('click', function(){ api('atelier/droits/' + encodeURIComponent(u.email), { method: 'PUT', json: R }).then(function(x){ if (!x.ok){ toast('Non enregistré : ' + (x.body.error || x.status), true); return; } toast('Droits enregistrés.'); P.close(); refresh(); }); });
    });
  });
});

/* ---------- the house: who signs the documents, and the settings his app kept in the account and the filter bar ---------- */
ST.register('maison', function(host){
  if (!ready(host)) return;
  var V = Object.assign({}, A.maison);
  node('h3', '', node('div', 'sec atl-head', host), 'La maison sur les documents');
  node('p', 'note', host, 'Ces lignes s’impriment sur les devis, les factures, les bons et au pied des certificats. Une ligne vide ne s’imprime pas.');
  var fs = node('div', 'fields sender', host);
  A.maisonFields.forEach(function(f){ fieldRow(fs, 'maison', f, V, null, !A.admin); });
  if (!A.admin) return;
  var sv = node('button', 'mark', node('div', 'actions marks formfoot', host), 'Enregistrer');
  sv.addEventListener('click', function(){ api('atelier/maison', { method: 'PUT', json: V }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } toast('La maison est enregistrée.'); refresh(); }); });
});

KEYS.forEach(function(k){ ST.register(k, listScreen(k)); });
/* his inventory: the productions, with the quantity one press away, the empty ones in red */
ST.register('inventaire', listScreen('productions', { key: 'inventaire', title: 'Inventaire', noNew: true, noPick: true,
  cols: [['productName', 'Nom'], ['category', 'Catégorie'], ['createdAt', 'Date', 'date']], extraHead: ['Quantité'], rowClass: function(r){ return N(r.productQuantity) <= 0 ? 'late' : ''; },
  extraCell: function(tr, p){ var c = node('td', 'field', tr), q = node('input', 'qty', c); q.type = 'number'; q.min = 0; q.step = 1; q.value = N(p.productQuantity); q.disabled = !A.types.productions.write; q.setAttribute('aria-label', 'Quantité de ' + txt(p.productName));
    q.addEventListener('click', function(e){ e.stopPropagation(); });
    q.addEventListener('change', function(){ api('atelier/productions/' + p.id, { method: 'PUT', json: { productQuantity: q.value } }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } toast('Quantité enregistrée.'); refresh(); }); }); } }));
})();
