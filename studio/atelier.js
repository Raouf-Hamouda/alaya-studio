/* L'ATELIER DANS LE STUDIO (4 octobre 2026) : certificats (diamants, bijoux, gemmes),
   devis, factures, bons de livraison, et la fiche de la maison qui les signe.
   Les champs ne sont pas ecrits ici : le programme (atelier.js, a cote de server.js)
   envoie leur description, reprise du back-office d'Ilyes, et cet ecran dessine la
   table, la fiche et le formulaire avec. Le document s'ouvre dans un onglet et
   s'imprime depuis le navigateur. */
(function(){
'use strict';
var ST = window.STUDIO, node = ST.node, api = ST.api, toast = ST.toast, txt = ST.txt;
var A = null, busy = false;
var KEYS = ['cert-diamants', 'cert-bijoux', 'cert-gemmes', 'devis', 'factures', 'livraisons', 'transports', 'productions', 'vendors', 'categories', 'founders', 'incomes', 'events'];

ST.menu('Atelier', [
  { label: 'Tableau de bord', key: 'tableau' },
  { group: 'Certificats' }, { label: 'Diamants', key: 'cert-diamants' }, { label: 'Bagues et bijoux', key: 'cert-bijoux' }, { label: 'Gemmes', key: 'cert-gemmes' },
  { group: 'Documents' }, { label: 'Devis', key: 'devis' }, { label: 'Factures', key: 'factures' }, { label: 'Bons de livraison', key: 'livraisons' }, { label: 'Transport', key: 'transports' },
  { group: 'Production' }, { label: 'Productions', key: 'productions' }, { label: 'Inventaire', key: 'inventaire' }, { label: 'Catégories', key: 'categories' },
  { group: 'Fournisseurs' }, { label: 'Fournisseurs', key: 'vendors' }, { label: 'Fonderie', key: 'founders' },
  { group: 'Finances' }, { label: 'Rapports de revenus', key: 'incomes' }, { label: 'Cours de l’or', key: 'or' },
  { group: 'Suivi' }, { label: 'Agenda', key: 'events' }, { label: 'Archives', key: 'archives' },
  { group: 'Réglages' }, { label: 'Maison', key: 'maison' }
]);

function fetchAll(){ busy = true; return api('atelier/all').then(function(r){ busy = false; if (r.ok) A = r.body; else toast('L’atelier ne répond pas : ' + (r.body.error || r.status), true); return r.ok; }); }
function refresh(){ return fetchAll().then(function(){ ST.redraw(); }); }
function day(d){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
function euros(n){ return Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function canWrite(){ return ST.S.me && ST.S.me.role === 'admin'; }
function fieldsOf(t){ return t.groups.reduce(function(a, g){ return a.concat(g[1]); }, []); }
function vendorName(id){ var v = (A.records.vendors || []).filter(function(x){ return x.id === id; })[0]; return v ? v.fullName : ''; }
function goldNow(){ return A.gold && A.gold[0] ? A.gold[0].price : 0; }
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
function printUrl(type, r){ return '../api/atelier/' + type + '/' + r.id + '/document'; }
/* what a column shows: the record's value, said the way the form says it */
function cell(type, r, key){
  var t = A.types[type], src = t.fromQuote && !(key in r) ? (r.quote || {}) : r;
  if (key === 'quoteReference') return (r.quote || {}).reference || '';
  var col = t.list.filter(function(c){ return c[0] === key; })[0] || [];
  if (col[2] === 'money') return r[key] === '' || r[key] === undefined ? '' : euros(r[key]);
  if (col[2] === 'date') return day(txt(r[key]).slice(0, 10));
  if (key === 'vendor') return vendorName(r[key]);
  var f = fieldsOf(t.fromQuote && src !== r ? A.types.devis : t).filter(function(x){ return x[0] === key; })[0], v = src[key];
  if (!f) return txt(v);
  if (f[2] === 'check') return v ? 'Oui' : '';
  if (f[2] === 'date') return day(v);
  if (f[2] === 'radio'){ var o = f[3].filter(function(x){ return x[0] === v; })[0]; return o ? o[1] : ''; }
  return txt(v).replace('.', f[2] === 'number' ? ',' : '.');
}

/* ---------- the table of one object ---------- */
var Q = {};   /* what is typed in the search of each table, kept while moving around */
function screen(type){
  return function(host){
    if (!A){ node('p', 'note', host, 'Chargement…'); if (!busy) refresh(); return; }
    var t = A.types[type], list = A.records[type].slice().reverse();
    ST.count(String(list.length));
    var head = node('div', 'sec atelier-head', host); node('h3', '', head, t.one);
    if (canWrite() && !t.noCreate){ var nb = node('button', 'btn primary add new', head, '+ Nouveau'); nb.addEventListener('click', function(){ open(type, null); }); }
    if (!list.length){
      var em = node('div', 'empty', host); node('b', '', em, 'Aucun document pour l’instant');
      node('span', 'sub', em, t.fromQuote ? 'Une facture se tire d’un devis : elle en garde le client et les lignes.' : (t.noCreate ? 'Un rapport naît avec chaque facture classée.' : 'Le premier portera le numéro ' + t.next + '.')).style.whiteSpace = 'normal';
      return;
    }
    /* the search, as on the Pages screen: the number, the name, the client, whatever the row shows */
    var bar = node('div', 'marks', host); bar.style.margin = '12px 0';
    var s = node('input', 'inline', bar); s.type = 'search'; s.placeholder = 'Chercher un numéro, un nom, un client'; s.value = Q[type] || ''; s.setAttribute('aria-label', 'Chercher dans ' + t.one.toLowerCase());
    var wrap = node('div', 'tablewrap inner', host), table = node('table', 'table', wrap), hr = node('tr', '', node('thead', '', table)), tb = node('tbody', '', table);
    node('th', '', hr, 'N°'); t.list.forEach(function(c){ node('th', '', hr, c[1]); }); if (t.money) node('th', '', hr, 'Total'); node('th', '', hr, '');
    var fill = function(){
      tb.innerHTML = ''; var q = (Q[type] || '').trim().toLocaleLowerCase(), n = 0;
      list.forEach(function(r){
        var cells = [r.reference || r.number || ''].concat(t.list.map(function(c){ return cell(type, r, c[0]); }));
        if (q && cells.join(' ').toLocaleLowerCase().indexOf(q) < 0) return; n++;
        var tr = node('tr', '', tb); node('td', 'first', tr, cells[0]);
        t.list.forEach(function(c, i){ node('td', i ? 'mute' : '', tr, cells[i + 1]); });
        if (t.money) node('td', 'num', tr, euros(r.total));
        var door = node('td', 'door', tr); if (!t.noDoc){ var a = node('a', 'btn small', door, 'Imprimer ↗'); a.href = printUrl(type, r); a.target = '_blank'; a.rel = 'noopener'; a.addEventListener('click', function(e){ e.stopPropagation(); }); }
        tr.tabIndex = 0; tr.addEventListener('click', function(){ open(type, r); });
        tr.addEventListener('keydown', function(e){ if (e.target === tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); open(type, r); } });
      });
      ST.count(q ? n + ' sur ' + list.length : String(list.length));
      if (!n){ var e = node('tr', 'plain', tb), c = node('td', 'emptycell', e); c.colSpan = t.list.length + 3; node('div', 'note', c, 'Rien ne correspond.'); }
    };
    s.addEventListener('input', function(){ Q[type] = s.value; fill(); });
    fill();
  };
}

/* ---------- one field of a form, drawn from its description [key, label, kind, options] ---------- */
var listN = 0;
function control(box, f, V, onChange){
  var kind = f[2] || 'text', key = f[0], el;
  var set = function(v){ V[key] = v; if (onChange) onChange(); };
  if (kind === 'area'){ el = node('textarea', '', box); el.rows = 3; el.value = txt(V[key]); el.addEventListener('input', function(){ set(el.value); }); }
  else if (kind === 'check'){ var l = node('label', 'option-row', box); el = node('input', '', l); el.type = 'checkbox'; el.checked = !!V[key]; node('span', '', l, 'Oui'); el.addEventListener('change', function(){ set(el.checked); }); }
  else if (kind === 'vendor' || kind === 'production'){
    el = node('select', '', box); node('option', '', el, kind === 'vendor' ? 'Choisir un fournisseur…' : 'Aucune').value = '';
    (kind === 'vendor' ? A.records.vendors : A.records.productions).forEach(function(o){ node('option', '', el, kind === 'vendor' ? o.fullName : o.reference + ' · ' + txt(o.productName)).value = o.id; });
    el.value = V[key] || ''; el.addEventListener('change', function(){ set(el.value); if (kind === 'production' && V.onProduction) V.onProduction(el.value); });
  }
  else if (kind === 'calc'){ el = node('input', 'calc', box); el.readOnly = true; el.tabIndex = -1; el.value = txt(V[key]).replace('.', ','); }
  else if (kind === 'radio'){ el = node('select', '', box); f[3].forEach(function(o){ node('option', '', el, o[1]).value = o[0]; }); el.value = V[key] || f[3][0][0]; V[key] = el.value; el.addEventListener('change', function(){ set(el.value); }); }
  else {
    el = node('input', '', box); el.type = kind === 'number' ? 'number' : (kind === 'date' ? 'date' : 'text'); if (kind === 'number'){ el.step = 'any'; el.min = 0; }
    el.value = txt(V[key]);
    if (kind === 'list'){ var id = 'atl-' + (++listN), dl = node('datalist', '', box); dl.id = id; (f[3] === '@categories' ? A.records.categories.map(function(c){ return c.name; }) : f[3]).forEach(function(o){ node('option', '', dl).value = o; }); el.setAttribute('list', id); }
    el.addEventListener('input', function(){ set(el.value); });
  }
  el.setAttribute('aria-label', f[1]); el.disabled = !canWrite();
  return el;
}
function photoField(box, V){
  var wrap = node('div', 'atl-photo', box), frame = node('div', 'frame', wrap), side = node('div', 'side', wrap);
  var show = function(){
    frame.innerHTML = ''; var a = txt(V.avatar), src = V.avatarData || (a.indexOf('image:') === 0 ? '../api/atelier/image/' + a.slice(6) : (a.indexOf('site:') === 0 ? '../site/' + a.slice(5) : ''));
    if (src){ var im = node('img', '', frame); im.alt = ''; im.src = src; }
  };
  show();
  if (!canWrite()) return;
  var up = node('label', 'btn small', side, 'Choisir un fichier'), fi = node('input', '', up); fi.type = 'file'; fi.accept = 'image/jpeg,image/png,image/webp'; fi.hidden = true;
  fi.addEventListener('change', function(){ var file = fi.files[0]; if (!file) return; var r = new FileReader(); r.onload = function(){ V.avatarData = r.result; show(); }; r.readAsDataURL(file); });
  /* or the photo of a piece of the site, which also gives its name to an unnamed certificate */
  var se = node('select', '', side); se.setAttribute('aria-label', 'Photo d’une pièce du site'); node('option', '', se, 'Ou une pièce du site…').value = '';
  ST.S.pieces.forEach(function(p){ node('option', '', se, p.name).value = p.slug; });
  se.addEventListener('change', function(){ var p = ST.S.pieces.filter(function(x){ return x.slug === se.value; })[0]; if (!p) return; delete V.avatarData; V.avatar = 'site:' + p.image; show(); if (V.onPiece) V.onPiece(p); });
  var rm = node('button', 'btn small', side, 'Retirer la photo'); rm.type = 'button'; rm.addEventListener('click', function(){ delete V.avatarData; V.avatar = ''; show(); });
}
function itemsField(box, f, V, onChange, extra){
  var wrap = node('div', 'atl-items', box), listEl = node('div', '', wrap);
  if (!Array.isArray(V[f[0]])) V[f[0]] = [];
  var draw = function(){
    listEl.innerHTML = '';
    V[f[0]].forEach(function(row, k){
      var shown = f[3].filter(function(s){ return s[2] !== 'hidden'; }), it = node('div', 'atl-item' + (shown.length <= 4 ? ' flat' : ''), listEl), calcs = {};
      var changed = function(){ if (LIVE[f[0]]){ LIVE[f[0]](row); Object.keys(calcs).forEach(function(k2){ calcs[k2].value = txt(row[k2]).replace('.', ','); }); } if (onChange) onChange(); };
      if (LIVE[f[0]]) LIVE[f[0]](row);
      shown.forEach(function(s){ var c = node('label', 'cellf ' + (s[2] || 'text'), it); node('span', '', c, s[1]); var e = control(c, s, row, changed); if (s[2] === 'calc') calcs[s[0]] = e; });
      if (row.product) node('span', 'atl-from', it, 'Production ' + row.product.reference + ', or à ' + euros(row.goldValue) + ' le gramme');
      if (canWrite()){ var x = node('button', 'sign x', it, '×'); x.type = 'button'; x.title = 'Retirer la ligne'; x.addEventListener('click', function(){ V[f[0]].splice(k, 1); draw(); if (onChange) onChange(); }); }
    });
    if (!V[f[0]].length) node('p', 'note', listEl, 'Aucune ligne.');
  };
  draw();
  if (!canWrite()) return;
  var acts = node('div', 'actions', wrap), ad = node('button', 'btn small', acts, '+ Ajouter une ligne'); ad.type = 'button';
  ad.addEventListener('click', function(){ V[f[0]].push(f[0] === 'mountsItems' ? { price24k: goldNow() || '' } : {}); draw(); var last = listEl.querySelector('.atl-item:last-child input:not([type=checkbox])'); if (last) last.focus(); });
  if (extra) extra(acts, function(row){ V[f[0]].push(row); draw(); if (onChange) onChange(); });
}

/* ---------- the record sheet: create, edit, print, delete ---------- */
function open(type, rec, quoteId, draft){
  var t = A.types[type], isNew = !rec, V = draft || JSON.parse(JSON.stringify(rec || {})), m = A.maison;
  if (isNew && !draft){
    V.date = new Date().toISOString().slice(0, 10);
    if (type === 'livraisons'){ V.number = t.next; V.transferorCompany = m.fullName || ''; V.transferorAddress = m.address || ''; V.transferorVatNumber = m.vatNumber || ''; V.transferorTaxCode = m.taxCode || ''; }
    if (type === 'devis'){ V.gainPercentage = 0; V.items = [{ quantity: 1 }]; }
    if (type === 'transports'){ V.number = t.next; V.senderCompany = m.fullName || ''; V.senderAddress = m.address || ''; V.senderVatNumber = m.vatNumber || ''; V.senderTaxCode = m.taxCode || ''; V.reglement = 'inAccount'; }
  }
  var P = ST.panel(t.one), body = P.body, foot = P.foot;
  var rh = node('div', 'rhead2', body), rt = node('div', 'rtext', rh), title = node('h2', 'rtitle', rt), sub = node('div', 'rsub', rt);
  var totalEl = null, costEl = null;
  var again = function(){ open(type, rec, undefined, V); };
  /* a jewel certificate fed by a production: its name, its category, its photo, its stones */
  V.onProduction = function(pid){
    var pr = A.records.productions.filter(function(x){ return x.id === pid; })[0]; if (!pr) return;
    if (!txt(V.productName)) V.productName = pr.productName; if (!txt(V.category)) V.category = pr.category; if (!txt(V.avatar) && !V.avatarData) V.avatar = pr.avatar || '';
    if (!(V.diamondsItems || []).length) V.diamondsItems = (pr.diamondsItems || []).map(function(d){ return { isMainDiamond: !!d.isMainDiamond, ct: d.ct }; });
    if (!(V.gemsItems || []).length) V.gemsItems = (pr.gemsItems || []).map(function(g){ return { isMainGem: !!g.isMainGem, weight: g.carat, variety: g.type }; });
    again();
  };
  var head = function(){
    var q = t.fromQuote ? (V.quote || {}) : V;
    title.textContent = txt(q[t.name]) || (isNew ? 'Nouveau ' + t.one.toLowerCase() : t.one);
    sub.textContent = isNew ? ('number' in V ? 'Numéro ' + txt(V.number) : 'Portera le numéro ' + t.next) : 'N° ' + (V.reference || V.number);
    if (totalEl) totalEl.textContent = euros(type === 'transports' ? (V.transportItem || []).reduce(function(s2, it){ return s2 + N(it.price) * N(it.quantity); }, 0) : localTotal(q));
    if (costEl){ var c = costs(V); costEl.innerHTML = ''; [['Montures', c.mountsTotalCost], ['Diamants', c.diamondsTotalCost], ['Gemmes', c.gemsTotalCost], ['Sertissage', c.sertissagesTotalCost], ['Services internes', c.internalServicesTotalCost], ['Coût de fabrication', c.fabricationCost], ['Coût actuel, or à ' + euros(goldNow()) + ' le gramme', c.current], ['Prix de vente, coefficient ' + (A.factor || 3), c.sell]].forEach(function(r, i){ var f = node('div', 'field' + (i > 4 ? ' strong' : ''), costEl); node('label', '', f, r[0]); node('div', 'v', f, euros(r[1])); }); }
  };
  V.onPiece = function(p){ if (!txt(V.productName)){ V.productName = p.name; var i = body.querySelector('input[aria-label="Nom du certificat"]'); if (i) i.value = p.name; head(); } };

  if (t.fromQuote){
    node('h3', '', node('div', 'sec', body), 'Le devis');
    var qf = node('div', 'fields', body);
    if (isNew){
      var fr = node('div', 'field', qf); node('label', '', fr, 'Devis');
      var se = node('select', '', fr); node('option', '', se, 'Choisir un devis…').value = '';
      A.records.devis.slice().reverse().forEach(function(d){ node('option', '', se, d.reference + ' · ' + txt(d.customerName) + ' · ' + euros(d.total)).value = d.id; });
      if (V.quoteId) se.value = V.quoteId;
      se.addEventListener('change', function(){ V.quoteId = se.value; V.quote = A.records.devis.filter(function(d){ return d.id === se.value; })[0] || {}; head(); });
      if (!A.records.devis.length) node('p', 'note', body, 'Il n’y a pas encore de devis. Une facture se tire d’un devis.');
    } else {
      var q = V.quote || {};
      [['Devis', q.reference], ['Client', q.customerName], ['Adresse', q.address], ['Téléphone', q.phoneNumber], ['Code fiscal', q.fiscalCode]].forEach(function(r){ if (!r[1]) return; var f = node('div', 'field', qf); node('label', '', f, r[0]); node('div', 'v', f, r[1]); });
      var its = node('div', 'items', body); (q.items || []).forEach(function(it){ var row = node('div', 'item', its), nm = node('div', 'nm', row); node('b', '', nm, txt(it.name)); node('span', 'k', row, txt(it.quantity) + ' × ' + euros(it.price)); });
    }
  }
  t.groups.forEach(function(g){
    node('h3', '', node('div', 'sec', body), g[0]);
    var fs = node('div', 'fields', body);
    g[1].forEach(function(f){
      if (f[2] === 'items'){
        itemsField(body, f, V, head, type === 'devis' && function(acts, push){
          /* a piece of the site as a line: its name and its price */
          var se2 = node('select', '', acts); se2.setAttribute('aria-label', 'Ajouter une pièce du site'); node('option', '', se2, '+ Une pièce du site…').value = '';
          ST.S.pieces.forEach(function(p){ node('option', '', se2, p.name + (p.price ? ' · ' + euros(p.price) : '')).value = p.slug; });
          se2.addEventListener('change', function(){ var p = ST.S.pieces.filter(function(x){ return x.slug === se2.value; })[0]; se2.value = ''; if (p) push({ name: p.name, price: p.price || '', quantity: 1 }); });
          /* a production as a line: his price, from its cost at today's gold price and the margin of the devis */
          var se3 = node('select', '', acts); se3.setAttribute('aria-label', 'Ajouter une production'); node('option', '', se3, '+ Une production…').value = '';
          A.records.productions.forEach(function(p){ node('option', '', se3, p.reference + ' · ' + txt(p.productName) + ' · coût ' + euros(p.fabricationCost)).value = p.id; });
          se3.addEventListener('change', function(){ var p = A.records.productions.filter(function(x){ return x.id === se3.value; })[0]; se3.value = ''; if (!p) return;
            push({ name: p.productName, price: p.fabricationCost, quantity: 1, productId: p.id, goldValue: goldNow(), product: { reference: p.reference, productName: p.productName, mountsItems: p.mountsItems || [], internalServicesTotalCost: p.internalServicesTotalCost, sertissagesTotalCost: p.sertissagesTotalCost, gemsTotalCost: p.gemsTotalCost, diamondsTotalCost: p.diamondsTotalCost, fabricationCost: p.fabricationCost } }); });
        });
        return;
      }
      var row = node('div', 'field' + (f[2] === 'area' || f[2] === 'photo' ? ' tall' : ''), fs); node('label', '', row, f[1]);
      if (f[2] === 'photo') photoField(row, V); else control(row, f, V, head);
    });
  });
  if (t.money){ var tot = node('div', 'atl-total', body); node('span', '', tot, 'Total'); totalEl = node('b', '', tot); }
  if (type === 'productions'){ node('h3', '', node('div', 'sec', body), 'Les coûts'); costEl = node('div', 'fields costs', body); }
  if (type === 'vendors' && !isNew) vendorSheet(body, V);
  if (type === 'incomes'){
    node('h3', '', node('div', 'sec', body), 'Les chiffres');
    var inf = node('div', 'fields', body); [['Facture', V.reference_ || (V.income || {}).reference], ['Client', V.customerName], ['Fabrication', euros(V.manufacturing)], ['Marge', txt(V.margin) + ' %'], ['Prix de vente', euros(V.sellingPrice)], ['Revenu', euros(V.revenue)]].forEach(function(r){ var f = node('div', 'field', inf); node('label', '', f, r[0]); node('div', 'v', f, txt(r[1])); });
    var il = node('div', 'items', body); ((((V.income || {}).quote || {}).items) || []).forEach(function(it){ var row = node('div', 'item', il), nm = node('div', 'nm', row); node('b', '', nm, txt(it.name)); node('span', 'k', row, txt(it.quantity) + ' × ' + euros(it.price)); });
  }
  head();

  var note = node('span', 'saved2', foot, isNew ? '' : (V.updatedBy ? 'Modifié par ' + V.updatedBy : ''));
  if (!isNew){
    if (canWrite()){
      var del = node('button', 'btn danger', foot, 'Supprimer');
      del.addEventListener('click', function(){ if (!confirm('Supprimer ' + t.one.toLowerCase() + ' ' + (V.reference || V.number) + ' ?')) return; api('atelier/' + type + '/' + V.id, { method: 'DELETE' }).then(function(r){ if (!r.ok){ toast('Non supprimé : ' + (r.body.error || r.status), true); return; } toast('Supprimé.'); P.close(); refresh(); }); });
      if (type === 'devis'){ var inv = node('button', 'btn', foot, 'Créer la facture'); inv.addEventListener('click', function(){ open('factures', null, V.id); }); }
    }
    if (!t.noDoc){ var pr = node('a', 'btn', foot, 'Imprimer ↗'); pr.href = printUrl(type, V); pr.target = '_blank'; pr.rel = 'noopener'; pr.style.textDecoration = 'none'; }
  }
  if (quoteId){ V.quoteId = quoteId; V.quote = A.records.devis.filter(function(d){ return d.id === V.quoteId; })[0] || {}; var s0 = body.querySelector('select'); if (s0) s0.value = V.quoteId; head(); }
  if (!canWrite()) return;
  var sv = node('button', 'btn primary', foot, isNew ? 'Créer' : 'Enregistrer');
  sv.addEventListener('click', function(){
    if (t.fromQuote && isNew && !V.quoteId){ toast('Il faut choisir un devis.', true); return; }
    var out = Object.assign({}, V); delete out.onPiece; delete out.onProduction; delete out.quote; delete out.total;
    sv.disabled = true; note.textContent = 'Enregistrement…';
    api('atelier/' + type + (isNew ? '' : '/' + V.id), { method: isNew ? 'POST' : 'PUT', json: out }).then(function(r){
      sv.disabled = false; note.textContent = '';
      if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; }
      toast(t.one + ' ' + (r.body.reference || r.body.number) + ' enregistré.');
      fetchAll().then(function(){ ST.redraw(); var fresh = A.records[type].filter(function(x){ return x.id === r.body.id; })[0]; if (fresh) open(type, fresh); });
    });
  });
}
/* the same count as the program: quantity x price, the margin on top, to the cent */
function localTotal(q){ var gain = Number(q.gainPercentage) || 0, g = 1 + gain / 100; return (q.items || []).reduce(function(s, it){
  var unit = it.product ? round3(round3(Number(currentCost(it.product, it.goldValue === '' || it.goldValue === undefined ? goldNow() : it.goldValue, N(it.price))) * (1 + gain * 0.01))) : N(it.price) * g;
  return s + Math.round(N(it.quantity) * unit * 100) / 100; }, 0); }

/* ---------- the house: who signs the documents ---------- */
function maisonScreen(host){
  if (!A){ node('p', 'note', host, 'Chargement…'); if (!busy) refresh(); return; }
  var V = Object.assign({}, A.maison);
  var head = node('div', 'sec atelier-head', host); node('h3', '', head, 'La maison sur les documents');
  node('p', 'note', host, 'Ces lignes s’impriment sur les devis, les factures, les bons de livraison et au pied des certificats. Une ligne vide ne s’imprime pas.');
  var fs = node('div', 'fields sender', host);
  A.maisonFields.forEach(function(f){ var row = node('div', 'field' + (f[2] === 'area' ? ' tall' : ''), fs); node('label', '', row, f[1]); control(row, f, V); });
  if (!canWrite()) return;
  var acts = node('div', 'actions marks', host), sv = node('button', 'mark', acts, 'Enregistrer');
  sv.addEventListener('click', function(){ api('atelier/maison', { method: 'PUT', json: V }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } A.maison = r.body; toast('La maison est enregistrée.'); }); });
}

/* ---------- a vendor's sheet: the work given, paid or not, and the payments made ---------- */
function vendorSheet(body, V){
  var mine = A.services.filter(function(x){ return x.vendor === V.id; }).reverse(), paid = A.payments.filter(function(x){ return x.vendor === V.id; }).reverse(), PAY = A.pay;
  var due = node('div', 'atl-total', body); node('span', '', due, 'Dû au fournisseur'); node('b', '', due, euros(V.duePayment));
  node('h3', '', node('div', 'sec', body), 'Les travaux confiés');
  if (!mine.length) node('p', 'note', body, 'Aucun travail confié. Une ligne de production à son nom en crée un.');
  var names = { mounts: 'Monture', diamonds: 'Diamants', gems: 'Gemmes', sertissages: 'Sertissage', internalServices: 'Service interne' };
  mine.forEach(function(sv){
    /* his rule (compareDate): unpaid and past its payment date reads in red */
    var late = !sv.servicePaid && sv.servicePaymentDate && sv.servicePaymentDate < new Date().toISOString().slice(0, 10);
    var row = node('div', 'atl-service' + (late ? ' late' : ''), body), nm = node('div', 'nm', row); node('b', '', nm, txt(sv.productRef) + ' · ' + txt(sv.productName)); node('span', '', nm, (names[sv.serviceName] || sv.serviceName) + ' · ' + day(txt(sv.createdAt).slice(0, 10)));
    node('span', 'cost', row, euros(sv.serviceCost));
    var put = function(patch){ api('atelier/vendorservices/' + sv.id, { method: 'PUT', json: patch }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } fetchAll().then(function(){ ST.redraw(); open('vendors', A.records.vendors.filter(function(x){ return x.id === V.id; })[0]); }); }); };
    var ty = node('select', '', row); ty.setAttribute('aria-label', 'Mode de paiement'); node('option', '', ty, 'Mode…').value = ''; PAY.forEach(function(o){ node('option', '', ty, o[1]).value = o[0]; }); ty.value = sv.servicePaymentType || ''; ty.disabled = !canWrite(); ty.addEventListener('change', function(){ put({ servicePaymentType: ty.value }); });
    var dt = node('input', '', row); dt.type = 'date'; dt.setAttribute('aria-label', 'Date de paiement'); dt.value = sv.servicePaymentDate || ''; dt.disabled = !canWrite(); dt.addEventListener('change', function(){ put({ servicePaymentDate: dt.value }); });
    var lab = node('label', 'option-row', row), ck = node('input', '', lab); ck.type = 'checkbox'; ck.checked = !!sv.servicePaid; ck.disabled = !canWrite(); node('span', '', lab, 'Payé'); ck.addEventListener('change', function(){ put({ servicePaid: ck.checked }); });
  });
  node('h3', '', node('div', 'sec', body), 'Les paiements');
  if (canWrite()){
    var form = node('div', 'atl-pay', body), sum = node('input', '', form), ty2 = node('select', '', form), ds = node('input', '', form), go = node('button', 'btn', form, 'Enregistrer le paiement');
    sum.type = 'number'; sum.step = 'any'; sum.placeholder = 'Somme'; sum.setAttribute('aria-label', 'Somme payée'); ty2.setAttribute('aria-label', 'Mode du paiement'); node('option', '', ty2, 'Mode…').value = ''; PAY.forEach(function(o){ node('option', '', ty2, o[1]).value = o[0]; }); ds.placeholder = 'Description'; ds.setAttribute('aria-label', 'Description du paiement');
    go.addEventListener('click', function(){ api('atelier/vendors/' + V.id + '/paiements', { method: 'POST', json: { sum: sum.value, paymentType: ty2.value, description: ds.value } }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } toast('Paiement enregistré.'); fetchAll().then(function(){ ST.redraw(); open('vendors', A.records.vendors.filter(function(x){ return x.id === V.id; })[0]); }); }); });
  }
  if (!paid.length) node('p', 'note', body, 'Aucun paiement enregistré.');
  var its = node('div', 'items', body);
  paid.forEach(function(h){ var row = node('div', 'item', its), nm = node('div', 'nm', row); node('b', '', nm, h.reference + ' · ' + euros(h.sum)); node('span', '', nm, [(PAY.filter(function(o){ return o[0] === h.paymentType; })[0] || [])[1], h.description, day(txt(h.createdAt).slice(0, 10))].filter(Boolean).join(' · '));
    if (canWrite()){ var x = node('button', 'rm', row, '×'); x.title = 'Retirer ce paiement de l’historique'; x.addEventListener('click', function(){ if (!confirm('Retirer le paiement ' + h.reference + ' de l’historique ? Le dû ne change pas.')) return; api('atelier/vendorhistories/' + h.id, { method: 'DELETE' }).then(function(){ fetchAll().then(function(){ ST.redraw(); open('vendors', A.records.vendors.filter(function(v){ return v.id === V.id; })[0]); }); }); }); } });
}
function ready(host){ if (A) return true; node('p', 'note', host, 'Chargement…'); if (!busy) refresh(); return false; }
function tableOf(host, heads){ var wrap = node('div', 'tablewrap inner', host), table = node('table', 'table', wrap), hr = node('tr', '', node('thead', '', table)); heads.forEach(function(h){ node('th', '', hr, h); }); return node('tbody', '', table); }
function empty(host, title, line){ var em = node('div', 'empty', host); node('b', '', em, title); node('span', 'sub', em, line).style.whiteSpace = 'normal'; }

/* ---------- the gold price: typed, dated, kept ---------- */
ST.register('or', function(host){
  if (!ready(host)) return;
  var head = node('div', 'sec atelier-head', host); node('h3', '', head, 'Cours de l’or, le gramme de 24k en euros');
  ST.count(String(A.gold.length));
  if (canWrite()){
    var bar = node('div', 'atl-pay', host), pr = node('input', '', bar), dt = node('input', '', bar), go = node('button', 'btn primary', bar, 'Enregistrer le cours');
    pr.type = 'number'; pr.step = 'any'; pr.placeholder = 'Cours en € / g'; pr.setAttribute('aria-label', 'Cours de l’or'); dt.type = 'date'; dt.setAttribute('aria-label', 'Date du cours'); dt.value = new Date().toISOString().slice(0, 10);
    go.addEventListener('click', function(){ api('atelier/or', { method: 'POST', json: { price: pr.value, date: dt.value } }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } toast('Cours enregistré.'); refresh(); }); });
    if (A.goldApi){ var live = node('button', 'btn', bar, 'Lire le cours sur goldapi.io'); live.addEventListener('click', function(){ api('atelier/or/actualiser', { method: 'POST' }).then(function(r){ if (!r.ok){ toast('Cours non lu : ' + (r.body.error || r.status), true); return; } toast('Cours lu : ' + euros(r.body.price)); refresh(); }); }); }
  }
  if (!A.gold.length){ empty(host, 'Aucun cours enregistré', 'Le coût actuel et le prix de vente des productions se comptent avec le dernier cours.'); return; }
  var tb = tableOf(host, ['Date', 'Cours', 'Écart', 'Source', '']);
  A.gold.forEach(function(g, i){ var tr = node('tr', 'plain', tb), prev = A.gold[i + 1]; node('td', 'first', tr, day(txt(g.createdAt).slice(0, 10))); node('td', 'num', tr, euros(g.price)); node('td', 'num', tr, prev ? String(round3(g.price - prev.price)).replace('.', ',') : ''); node('td', 'mute', tr, txt(g.source));
    var d = node('td', 'door', tr); if (canWrite()){ var x = node('button', 'btn small', d, 'Retirer'); x.addEventListener('click', function(){ if (!confirm('Retirer ce cours ?')) return; api('atelier/or/' + g.id, { method: 'DELETE' }).then(refresh); }); } });
});

/* ---------- the inventory: the productions and what is in stock ---------- */
ST.register('inventaire', function(host){
  if (!ready(host)) return;
  var head = node('div', 'sec atelier-head', host); node('h3', '', head, 'Inventaire'); var list = A.records.productions.slice().reverse(); ST.count(String(list.length));
  if (!list.length){ empty(host, 'Aucune production', 'L’inventaire liste les productions et leur quantité en stock.'); return; }
  var tb = tableOf(host, ['N°', 'Nom', 'Catégorie', 'Date', 'Quantité']);
  list.forEach(function(p){ var out = N(p.productQuantity) <= 0, tr = node('tr', 'plain' + (out ? ' late' : ''), tb); node('td', 'first', tr, p.reference); node('td', '', tr, txt(p.productName)); node('td', 'mute', tr, txt(p.category)); node('td', 'mute', tr, day(txt(p.createdAt).slice(0, 10)));
    var c = node('td', '', tr), q = node('input', 'qty', c); q.type = 'number'; q.min = 0; q.step = 1; q.value = N(p.productQuantity); q.disabled = !canWrite(); q.setAttribute('aria-label', 'Quantité de ' + txt(p.productName));
    q.addEventListener('change', function(){ api('atelier/productions/' + p.id, { method: 'PUT', json: { productQuantity: q.value } }).then(function(r){ if (!r.ok){ toast('Non enregistré : ' + (r.body.error || r.status), true); return; } toast('Quantité enregistrée.'); refresh(); }); }); });
});

/* ---------- the archives: what was deleted, kept, with its way back ---------- */
ST.register('archives', function(host){
  if (!ready(host)) return;
  var head = node('div', 'sec atelier-head', host); node('h3', '', head, 'Archives'); var keys = Object.keys(A.archives), n = 0;
  if (!keys.length){ empty(host, 'Rien dans les archives', 'Ce qui est supprimé dans l’atelier arrive ici et peut être remis à sa place.'); ST.count('0'); return; }
  keys.forEach(function(k){ var t = A.types[k]; node('h3', '', node('div', 'sec', host), t.one);
    var tb = tableOf(host, ['N°', 'Nom', 'Supprimé le', '']);
    A.archives[k].slice().reverse().forEach(function(r){ n++; var src = t.fromQuote ? (r.quote || {}) : r, tr = node('tr', 'plain', tb); node('td', 'first', tr, r.reference || r.number || ''); node('td', '', tr, txt(src[t.name] || (r.income && ((r.income.quote || {}).customerName)) || '')); node('td', 'mute', tr, day(txt(r.deletedAt).slice(0, 10)));
      var d = node('td', 'door', tr); if (canWrite()){ var b = node('button', 'btn small', d, 'Remettre'); b.addEventListener('click', function(){ api('atelier/' + k + '/' + r.id + '/restaurer', { method: 'POST' }).then(function(x){ if (!x.ok){ toast('Non remis : ' + (x.body.error || x.status), true); return; } toast(t.one + ' remis à sa place.'); refresh(); }); }); } }); });
  ST.count(String(n));
});

/* ---------- the dashboard: his figures, counted from the studio's own records ---------- */
var dashDay = '', dashSpan = '7';
var WHAT = { create: 'Création', update: 'Modification', 'delete': 'Suppression', restore: 'Remise en place', paiement: 'Paiement d’un fournisseur', 'paiement-delete': 'Paiement retiré', service: 'Travail d’un fournisseur', or: 'Cours de l’or', 'or-delete': 'Cours retiré', maison: 'Maison' };
ST.register('tableau', function(host){
  if (!ready(host)) return;
  var D = A.dash; ST.count('');
  node('h3', '', node('div', 'sec atelier-head', host), 'Vue d’ensemble');
  var tiles = node('div', 'tiles', host); [['Utilisateurs', D.overview.users], ['Fournisseurs', D.overview.vendors], ['Catégories', D.overview.categories], ['Productions', D.overview.products]].forEach(function(o){ var ti = node('div', 'tile', tiles); node('div', 'big', ti, String(o[1])); node('div', 'lbl', ti, o[0]); });
  var grid = node('div', 'atl-dash', host);
  var gold = node('div', 'card', grid); node('h3', '', node('div', 'sec', gold), 'Cours de l’or, le gramme');
  if (!D.gold.length) node('p', 'note', gold, 'Aucun cours enregistré.');
  else { node('div', 'bigfig', gold, euros(D.gold[0].price)); D.gold.slice(1).forEach(function(g){ var r = node('div', 'field', gold); node('label', '', r, day(txt(g.createdAt).slice(0, 10))); node('div', 'v', r, euros(g.price) + (g.difference ? '   ' + (g.difference > 0 ? '+' : '') + String(g.difference).replace('.', ',') : '')); }); }
  var cats = node('div', 'card', grid); node('h3', '', node('div', 'sec', cats), 'Catégories des productions');
  if (!D.categories.length) node('p', 'note', cats, 'Aucune production.');
  D.categories.forEach(function(c){ var r = node('div', 'bar', cats); node('span', '', r, c.category || 'Sans catégorie'); var tr = node('i', '', r); node('b', '', tr).style.width = c.percentage + '%'; node('em', '', r, String(round3(c.percentage)).replace('.', ',') + ' %'); });
  var act = node('div', 'card wide', grid), ah = node('div', 'sec', act); node('h3', '', ah, 'Activité, les ventes');
  var sp = node('select', 'add', ah); sp.setAttribute('aria-label', 'Période'); [['7', '7 derniers jours'], ['day', 'Par jour'], ['month', 'Par mois'], ['year', 'Par année']].forEach(function(o){ node('option', '', sp, o[1]).value = o[0]; }); sp.value = dashSpan; sp.addEventListener('change', function(){ dashSpan = sp.value; ST.redraw(); });
  var pts = {};
  if (dashSpan === '7'){ for (var i = 6; i >= 0; i--){ var d0 = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); pts[d0] = 0; } D.sales.forEach(function(x){ if (x.date in pts) pts[x.date] += x.total; }); }
  else D.sales.forEach(function(x){ var k = dashSpan === 'year' ? x.date.slice(0, 4) : (dashSpan === 'month' ? x.date.slice(0, 7) : x.date); pts[k] = (pts[k] || 0) + x.total; });
  var ks = Object.keys(pts), max = Math.max.apply(null, ks.map(function(k){ return pts[k]; }).concat([0]));
  if (!D.sales.length) node('p', 'note', act, 'Aucune vente : une facture classée en inscrit une au jour de sa création.');
  else { var ch = node('div', 'chart', act); ks.forEach(function(k){ var c = node('div', 'col', ch); c.title = k + ' : ' + euros(pts[k]); node('em', '', c, pts[k] ? euros(pts[k]) : ''); node('i', '', c).style.height = (max ? Math.max(pts[k] / max * 100, pts[k] ? 2 : 0) : 0) + '%'; node('span', '', c, dashSpan === '7' || dashSpan === 'day' ? day(k).slice(0, 5) : k); }); }
  var fo = node('div', 'card', grid); node('h3', '', node('div', 'sec', fo), 'Fonderie');
  if (!D.founders.count) node('p', 'note', fo, 'Aucune transaction.');
  else [['Or reçu 18k', D.founders.received18 + ' g'], ['Or donné 24k', D.founders.given24 + ' g'], ['Différence en 24k', D.founders.difference + ' g'], ['Transactions', D.founders.count]].forEach(function(o){ var r = node('div', 'field', fo); node('label', '', r, o[0]); node('div', 'v', r, String(o[1]).replace('.', ',')); });
  var lg = node('div', 'card', grid), lh = node('div', 'sec', lg); node('h3', '', lh, 'Journal');
  var dd = node('input', 'add', lh); dd.type = 'date'; dd.setAttribute('aria-label', 'Jour du journal'); dd.value = dashDay || new Date().toISOString().slice(0, 10);
  var lines = node('div', 'items', lg), fill = function(){ api('atelier/journal/' + dd.value).then(function(r){ lines.innerHTML = ''; var l = r.ok ? r.body.logs : []; if (!l.length) node('p', 'note', lines, 'Aucune action ce jour-là.'); l.forEach(function(x){ var row = node('div', 'item', lines), nm = node('div', 'nm', row); node('b', '', nm, (WHAT[txt(x.what).replace('atelier-', '')] || txt(x.what)) + (x.type ? ' · ' + (A.types[x.type] ? A.types[x.type].one : x.type) : '') + (x.reference ? ' · ' + x.reference : '')); node('span', '', nm, txt(x.who) + ' · ' + txt(x.t).slice(11, 16)); }); }); };
  dd.addEventListener('change', function(){ dashDay = dd.value; fill(); }); fill();
});

KEYS.forEach(function(k){ ST.register(k, screen(k)); });
ST.register('maison', maisonScreen);
})();
