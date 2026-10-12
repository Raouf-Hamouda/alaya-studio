/* LE STOCK (7 octobre 2026, refait le 10) : toutes les pieces du site, une ligne chacune. Une piece
   est suivie ou non ; suivie, elle est unique, en stock ou sur commande (avec son delai) ; sa
   quantite est la somme de ses mouvements, jamais tapee. Une commande payee la sort toute seule,
   une facture classee tiree d'une production liee aussi. Et l'etat ecrit sur le site : disponible,
   vendue (la page reste, le bouton mene au sur-mesure), sur commande avec son delai. */
(function(){
'use strict';
var X = window.STUDIO, node = X.node, api = X.api, toast = X.toast, txt = X.txt, SITE = '../site/';
var KINDS = { unique: 'Pièce unique', stock: 'En stock', made_to_order: 'Sur commande' };
var KIND_HELP = { unique: 'Un seul exemplaire. Vendue, elle ne ressort plus.', stock: 'Plusieurs exemplaires, un seuil bas qui prévient.', made_to_order: 'Fabriquée à la commande, avec un délai en jours.' };
var REASONS = { entree: 'Entrée', sortie: 'Sortie', vente: 'Vente', retour: 'Retour', ajustement: 'Ajustement (+ ou −)' };
var ETATS = { disponible: ['ok', 'Disponible'], vendue: ['bad', 'Vendue'], commande: ['info', 'Sur commande'] };
var data = null, q = '', filter = '';
function euros(v){ return v > 0 ? v.toLocaleString('fr-FR') + ' €' : 'Sur demande'; }
function when(iso){ if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.toTimeString().slice(0, 5); }
function err(r){ return (r.body && r.body.error) || String(r.status); }
function state(s){ if (!s.suivi) return ['none', 'Non suivie']; if (s.kind === 'made_to_order') return ['info', 'Sur commande' + (s.delaiJours ? ', ' + s.delaiJours + ' j' : '')]; if (s.onHand === 0) return s.kind === 'unique' ? ['bad', 'Vendue'] : ['bad', 'Rupture']; if (s.onHand <= s.minStock) return ['warn', 'Stock bas']; return ['ok', s.kind === 'unique' ? 'Disponible' : 'En stock']; }
function load(){ return api('stock').then(function(r){ if (!r.ok){ toast('Le stock ne se lit pas : ' + err(r), true); return; } data = r.body; }); }
function admin(){ return X.S.me.role === 'admin'; }
function pieceCell(tr, st){ var f = node('td', 'first piece-cell', tr), th = node('span', 'th sq', f); if (st.image){ var im = node('img', '', th); im.alt = ''; im.loading = 'lazy'; im.src = SITE + st.image; } var pn = node('div', 'pn', f); node('b', '', pn, st.name); node('span', '', pn, (X.S.rayons[st.rayon] || st.rayon || '') + (st.collection ? ' · ' + (X.S.collections[st.collection] || st.collection) : '')); }
/* the three kinds as cards, one chosen */
function kindPicker(box, V, onChange){ var g = node('div', 'stock-kinds', box), nm = 'stock-kind-' + Date.now(); Object.keys(KINDS).forEach(function(k){ var l = node('label', V.kind === k ? 'on' : '', g), c = node('input', '', l); c.type = 'radio'; c.name = nm; c.value = k; c.checked = V.kind === k; node('b', '', l, KINDS[k]); node('span', '', l, KIND_HELP[k]); c.addEventListener('change', function(){ V.kind = k; Array.prototype.forEach.call(g.children, function(x){ x.classList.toggle('on', x === l); }); if (onChange) onChange(); }); }); return g; }

X.register('stock', function(host){
  X.title('Stock');
  if (!data){ node('p', 'note', host, 'Lecture…'); load().then(function(){ X.redraw(); }); return; }
  var R = data.resume; X.count(R.site + ' pièces');
  /* a piece sent here from its right click or from the inventory : its sheet */
  var want = sessionStorage.getItem('alaya-stock-open'); if (want){ sessionStorage.removeItem('alaya-stock-open'); if (data.stock.some(function(x){ return x.slug === want; })) open(want); }
  var tiles = node('div', 'tiles stock-top', host), tile = function(n, l, c, f){ var t = node('div', 'tile' + (c ? ' ' + c : ''), tiles); node('div', 'big', t, String(n)); node('div', 'lbl', t, l); if (f !== undefined){ t.style.cursor = 'pointer'; t.addEventListener('click', function(){ filter = f; X.redraw(); }); } };
  tile(R.site, 'pièces sur le site', '', ''); tile(R.items, 'suivies', '', 'suivies'); tile(R.nonSuivies, 'non suivies', R.nonSuivies ? 'warn' : '', 'non'); tile(R.units, 'exemplaires en main', '', 'suivies'); tile(R.bas, 'sous le seuil', R.bas ? 'warn' : '', 'bas'); tile(R.ruptures, 'vendues ou en rupture', R.ruptures ? 'bad' : '', 'rupture');
  if (admin() && R.nonSuivies){
    var pick = node('div', 'stock-pick', host); node('b', '', pick, 'Suivre d’un coup les ' + R.nonSuivies + ' pièces non suivies');
    var kind = node('select', '', pick); kind.setAttribute('aria-label', 'Type'); Object.keys(KINDS).forEach(function(k){ node('option', '', kind, 'comme ' + KINDS[k].toLowerCase()).value = k; }); kind.value = 'unique';
    var qty = node('input', '', pick); qty.type = 'number'; qty.min = 0; qty.value = '1'; qty.style.width = '72px'; qty.setAttribute('aria-label', 'Exemplaires de départ');
    var delai = node('input', '', pick); delai.type = 'number'; delai.min = 0; delai.placeholder = 'délai (jours)'; delai.style.width = '110px'; delai.hidden = true; delai.setAttribute('aria-label', 'Délai en jours');
    kind.addEventListener('change', function(){ qty.hidden = kind.value === 'made_to_order'; delai.hidden = kind.value !== 'made_to_order'; });
    var where = node('input', '', pick); where.placeholder = 'Emplacement (coffre, vitrine…)'; where.style.width = '200px';
    var go = node('button', 'btn primary', pick, 'Suivre toutes');
    go.addEventListener('click', function(){ if (!confirm('Suivre les ' + R.nonSuivies + ' pièces non suivies ' + kind.options[kind.selectedIndex].text + (kind.value === 'made_to_order' ? '' : ', ' + (kind.value === 'unique' ? '1 exemplaire' : qty.value + ' exemplaire(s)') + ' chacune') + ' ? Chaque pièce se corrige ensuite une par une.')) return; go.disabled = true;
      api('stock/toutes', { method: 'POST', json: { kind: kind.value, initial: qty.value, minStock: 1, delaiJours: delai.value, emplacement: where.value } }).then(function(r){ go.disabled = false; if (!r.ok){ toast(err(r), true); return; } toast(r.body.n + ' pièces suivies.'); data = { stock: r.body.stock, resume: r.body.resume }; X.redraw(); }); });
    node('span', 'note', pick, 'Ou pièce par pièce : cliquer une ligne.');
  }
  var bar = node('div', 'marks atl-filters', host), s = node('input', 'inline', bar); s.type = 'search'; s.placeholder = 'Chercher une pièce'; s.value = q; s.setAttribute('aria-label', 'Chercher');
  var fb = node('div', 'statusbar', bar); [['', 'Toutes'], ['suivies', 'Suivies'], ['non', 'Non suivies'], ['unique', 'Pièces uniques'], ['stock', 'En stock'], ['made_to_order', 'Sur commande'], ['bas', 'Sous le seuil'], ['rupture', 'Vendues et ruptures']].forEach(function(f){ var b = node('button', f[0] === filter ? 'cur' : '', fb, f[1]); b.type = 'button'; b.addEventListener('click', function(){ filter = f[0]; X.redraw(); }); });
  var wrap = node('div', 'tablewrap inner', host), table = node('table', 'table', wrap), hr = node('tr', '', node('thead', '', table)), tb = node('tbody', '', table);
  X.th(hr, 'Pièce', 'image'); X.th(hr, 'Prix', 'money'); X.th(hr, 'Suivi', 'list'); X.th(hr, 'En main', 'number'); X.th(hr, 'Seuil', 'number'); X.th(hr, 'Emplacement', 'text'); X.th(hr, 'État', 'status'); X.th(hr, 'Sur le site', 'status'); X.th(hr, 'Dernier mouvement', 'date');
  var n = 0, qq = q.trim().toLocaleLowerCase();
  data.stock.forEach(function(st){
    if (qq && (st.name + ' ' + st.slug + ' ' + (st.emplacement || '')).toLocaleLowerCase().indexOf(qq) < 0) return;
    var es = state(st);
    if (filter === 'suivies' && !st.suivi) return; if (filter === 'non' && st.suivi) return;
    if (filter === 'bas' && es[0] !== 'warn') return; if (filter === 'rupture' && es[0] !== 'bad') return;
    if ((filter === 'unique' || filter === 'stock' || filter === 'made_to_order') && st.kind !== filter) return; n++;
    var tr = node('tr', st.suivi ? '' : 'plain', tb); pieceCell(tr, st);
    node('td', 'num mute', tr, euros(st.price)); node('td', 'mute', tr, st.suivi ? KINDS[st.kind] : '—');
    var oh = node('td', 'num', tr, ''); node('b', '', oh, !st.suivi || st.kind === 'made_to_order' ? '—' : String(st.onHand)); node('td', 'mute', tr, st.suivi && st.kind === 'stock' ? String(st.minStock) : '—'); node('td', 'mute', tr, st.emplacement || '—');
    var sc = node('td', '', tr); node('span', 'chip ' + es[0], sc, es[1]);
    var se = node('td', '', tr), e2 = ETATS[st.siteEtat] || ['none', '?']; node('span', 'chip ' + e2[0], se, e2[1]);
    node('td', 'mute', tr, when(st.dernier) || '—');
    X.rowMenu(tr, function(){ var l = [{ label: st.suivi ? 'Ouvrir' : 'Commencer le suivi', icon: 'open', run: function(){ open(st.slug); } }, { label: 'Voir sur le site', icon: 'ext', href: SITE + 'piece/' + st.slug + '/index.html' }, { label: 'La fiche de la pièce', icon: 'piece', run: function(){ X.S.open = st.slug; X.open('pieces'); } }];
      if (admin() && st.suivi && st.kind !== 'made_to_order') l = l.concat(['-', { label: 'Entrée de 1', icon: 'check', run: function(){ move(st.slug, { qty: 1, reason: 'entree' }); } }, { label: 'Sortie de 1', icon: 'tag', run: function(){ move(st.slug, { qty: 1, reason: 'sortie' }); } }, { label: 'Vente de 1', icon: 'euro', run: function(){ move(st.slug, { qty: 1, reason: 'vente' }); } }]);
      if (admin() && st.suivi) l = l.concat(['-', { label: 'Ne plus suivre', icon: 'trash', danger: true, run: function(){ if (!confirm('Ne plus suivre ' + st.name + ' ? Une pièce qui a des mouvements ne se retire pas.')) return; api('stock/' + st.slug, { method: 'DELETE' }).then(function(r){ toast(r.ok ? 'Plus suivie.' : err(r), !r.ok); load().then(function(){ X.redraw(); }); }); } }]);
      return l; }, st.name);
    tr.tabIndex = 0; tr.addEventListener('click', function(){ open(st.slug); }); tr.addEventListener('keydown', function(e){ if (e.target === tr && e.key === 'Enter') open(st.slug); });
  });
  if (!n){ var e = node('tr', 'plain', tb), c = node('td', 'emptycell', e); c.colSpan = 9; node('div', 'note', c, 'Rien ne correspond.'); }
  X.count(n === data.stock.length ? n + ' pièces' : n + ' sur ' + data.stock.length);
  s.addEventListener('input', function(){ q = s.value; X.redraw(); var i = document.querySelector('.atl-filters input.inline'); if (i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
});
function move(slug, m, after){ return api('stock/' + slug + '/mouvement', { method: 'POST', json: m }).then(function(r){ if (!r.ok){ toast(r.body.error || 'Refusé', true); return; } toast('Mouvement enregistré : ' + (r.body.onHand) + ' en main.'); return load().then(function(){ X.redraw(); if (after) after(r.body); }); }); }
function start(sheet, p){
  /* an untracked piece : the question, then the first count */
  var ok = admin(), V = { kind: 'unique', initial: 1, minStock: 1, emplacement: '', delaiJours: '' };
  node('h3', '', node('div', 'sec', sheet.body), 'Commencer le suivi');
  if (!ok){ node('p', 'note', sheet.body, 'Cette pièce n’est pas suivie. Un administrateur peut commencer son suivi.'); return; }
  var fs = node('div', 'fields sender', sheet.body), kf = node('div', 'field', fs); node('label', '', kf, 'Quelle pièce est-ce ?');
  var qf = node('div', 'field half', fs), df = node('div', 'field half', fs), mf = node('div', 'field half', fs), ef = node('div', 'field half', fs);
  var sync = function(){ qf.hidden = V.kind !== 'stock'; df.hidden = V.kind !== 'made_to_order'; mf.hidden = V.kind !== 'stock'; };
  kindPicker(kf, V, sync);
  node('label', '', qf, 'Exemplaires en main'); var qi = node('input', '', qf); qi.type = 'number'; qi.min = 0; qi.value = 1; qi.addEventListener('input', function(){ V.initial = qi.value; });
  node('label', '', mf, 'Seuil bas'); var mi = node('input', '', mf); mi.type = 'number'; mi.min = 0; mi.value = 1; mi.addEventListener('input', function(){ V.minStock = mi.value; });
  node('label', '', df, 'Délai de fabrication (jours)'); var di = node('input', '', df); di.type = 'number'; di.min = 0; di.placeholder = '21'; di.addEventListener('input', function(){ V.delaiJours = di.value; });
  node('label', '', ef, 'Emplacement'); var ei = node('input', '', ef); ei.placeholder = 'Coffre, vitrine, atelier…'; ei.addEventListener('input', function(){ V.emplacement = ei.value; });
  sync();
  var go = node('button', 'mark', node('div', 'marks', sheet.body), 'Suivre cette pièce');
  go.addEventListener('click', function(){ api('stock', { method: 'POST', json: { slug: p.slug, kind: V.kind, initial: V.kind === 'unique' ? 1 : (V.kind === 'stock' ? V.initial : 0), minStock: V.kind === 'stock' ? V.minStock : 0, emplacement: V.emplacement, delaiJours: V.delaiJours } }).then(function(r){ if (!r.ok){ toast(err(r), true); return; } toast(r.body.name + ' est suivie.'); load().then(function(){ X.redraw(); open(p.slug); }); }); });
}
function open(slug){
  var sheet = X.panel('Stock'); node('p', 'note', sheet.body, 'Lecture…');
  var p = (data ? data.stock : []).filter(function(x){ return x.slug === slug; })[0];
  api('stock/' + slug).then(function(r){
    sheet.body.innerHTML = '';
    if (r.ok && r.body.suivi === false){ var u = r.body; head(sheet, u, state(u)); start(sheet, u); siteBlock(sheet, u); return; }
    if (!r.ok){ node('p', 'note', sheet.body, err(r)); return; }
    var st = r.body, es = state(st), ok = admin(); st.siteEtat = p ? p.siteEtat : st.siteEtat;
    head(sheet, st, es);
    node('h3', '', node('div', 'sec', sheet.body), 'En main');
    var big = node('div', 'marks', sheet.body);
    if (st.kind === 'made_to_order') node('span', 'note', big, 'Fabriquée à la commande' + (st.delaiJours ? ', délai ' + st.delaiJours + ' jours' : '') + ' : pas de quantité à compter.');
    else { var qb = node('div', 'qtybox', big), minus = node('button', '', qb, '−'), num = node('b', '', qb, String(st.onHand)), plus = node('button', '', qb, '+'); minus.type = plus.type = 'button'; minus.disabled = !ok || st.onHand <= 0; plus.disabled = !ok || (st.kind === 'unique' && st.onHand >= 1);
      minus.title = 'Sortie de 1'; plus.title = 'Entrée de 1'; minus.addEventListener('click', function(){ move(slug, { qty: 1, reason: 'sortie' }, function(){ open(slug); }); }); plus.addEventListener('click', function(){ move(slug, { qty: 1, reason: 'entree' }, function(){ open(slug); }); });
      node('span', 'note', big, KIND_HELP[st.kind]); }
    node('h3', '', node('div', 'sec', sheet.body), 'Le suivi');
    var fs = node('div', 'fields sender', sheet.body), V = { kind: st.kind, minStock: st.minStock, emplacement: st.emplacement, note: st.note, delaiJours: st.delaiJours || '' };
    var kf = node('div', 'field', fs); node('label', '', kf, 'Type'); var mf = node('div', 'field half', fs), df = node('div', 'field half', fs), ef = node('div', 'field half', fs), nf = node('div', 'field', fs);
    var sync = function(){ mf.hidden = V.kind !== 'stock'; df.hidden = V.kind !== 'made_to_order'; }; if (ok) kindPicker(kf, V, sync); else node('div', 'v', kf, KINDS[V.kind]);
    node('label', '', mf, 'Seuil bas'); var mi = node('input', '', mf); mi.type = 'number'; mi.min = 0; mi.value = V.minStock; mi.disabled = !ok; mi.addEventListener('input', function(){ V.minStock = mi.value; });
    node('label', '', df, 'Délai de fabrication (jours)'); var di = node('input', '', df); di.type = 'number'; di.min = 0; di.value = V.delaiJours; di.disabled = !ok; di.addEventListener('input', function(){ V.delaiJours = di.value; });
    node('label', '', ef, 'Emplacement'); var ei = node('input', '', ef); ei.value = V.emplacement; ei.placeholder = 'Coffre, vitrine, atelier…'; ei.disabled = !ok; ei.addEventListener('input', function(){ V.emplacement = ei.value; });
    node('label', '', nf, 'Note'); var ni = node('textarea', '', nf); ni.rows = 2; ni.value = V.note; ni.disabled = !ok; ni.addEventListener('input', function(){ V.note = ni.value; });
    sync();
    if (ok){ var sv = node('button', 'btn', node('div', 'marks', sheet.body), 'Enregistrer'); sv.addEventListener('click', function(){ api('stock', { method: 'POST', json: { slug: slug, kind: V.kind, minStock: V.minStock, emplacement: V.emplacement, note: V.note, delaiJours: V.delaiJours } }).then(function(r2){ toast(r2.ok ? 'Enregistré.' : err(r2), !r2.ok); load().then(function(){ X.redraw(); open(slug); }); }); }); }
    if (ok && st.kind !== 'made_to_order'){
      node('h3', '', node('div', 'sec', sheet.body), 'Un mouvement');
      var mv = node('div', 'fields sender', sheet.body), M = { reason: 'entree', qty: 1, ref: '', note: '' };
      var rf = node('div', 'field half', mv); node('label', '', rf, 'Motif'); var rs = node('select', '', rf); Object.keys(REASONS).forEach(function(k){ node('option', '', rs, REASONS[k]).value = k; }); rs.addEventListener('change', function(){ M.reason = rs.value; });
      var qf = node('div', 'field half', mv); node('label', '', qf, 'Quantité'); var qi = node('input', '', qf); qi.type = 'number'; qi.value = 1; qi.addEventListener('input', function(){ M.qty = qi.value; });
      var rff = node('div', 'field half', mv); node('label', '', rff, 'Référence'); var ri = node('input', '', rff); ri.placeholder = 'Facture, salon, client…'; ri.addEventListener('input', function(){ M.ref = ri.value; });
      var nff = node('div', 'field half', mv); node('label', '', nff, 'Note'); var nn = node('input', '', nff); nn.addEventListener('input', function(){ M.note = nn.value; });
      var go = node('button', 'mark', node('div', 'marks', sheet.body), 'Enregistrer le mouvement'); go.addEventListener('click', function(){ move(slug, M, function(){ open(slug); }); });
    }
    siteBlock(sheet, st);
    var h3 = node('div', 'sec', sheet.body); node('h3', '', h3, 'Historique'); node('span', 'count', h3, st.mouvements.length ? st.mouvements.length + ' mouvement' + (st.mouvements.length > 1 ? 's' : '') : '');
    var ul = node('ul', 'mv-list', sheet.body);
    if (!st.mouvements.length) node('li', 'note', ul, 'Aucun mouvement.');
    st.mouvements.forEach(function(m){ var li = node('li', '', ul); node('b', m.qty > 0 ? 'pos' : 'neg', li, (m.qty > 0 ? '+' : '') + m.qty); node('span', '', li, REASONS[m.reason].replace(' (+ ou −)', '') + (m.ref ? ' · ' + m.ref : '') + (m.note ? ' · ' + m.note : '') + (m.byUser ? ' · ' + m.byUser : '')); node('time', '', li, when(m.at)); });
    node('span', 'saved2', sheet.foot, 'Une quantité n’est jamais tapée : c’est la somme des mouvements.');
  });
}
function head(sheet, st, es){
  var rh = node('div', 'rhead2', sheet.body), hero = node('div', 'hero sq', rh); if (st.image){ var im = node('img', '', hero); im.alt = ''; im.src = SITE + st.image; im.style.objectFit = 'contain'; }
  var rt = node('div', 'rtext', rh); node('h2', 'rtitle', rt, st.name); var sub = node('div', 'rsub', rt); node('span', 'chip ' + es[0], sub, es[1]); sub.appendChild(document.createTextNode(' ' + euros(st.price) + (st.emplacement ? ' · ' + st.emplacement : '')));
  var see = node('a', 'btn', sheet.foot, 'Voir sur le site ↗'); see.href = SITE + 'piece/' + st.slug + '/index.html'; see.target = '_blank'; see.rel = 'noopener';
}
/* what the page of the piece says : available, sold, made to order. Written on a click, never alone. */
function siteBlock(sheet, st){
  var h3 = node('div', 'sec', sheet.body); node('h3', '', h3, 'Sur le site');
  var e2 = ETATS[st.siteEtat] || ['none', 'illisible'], row = node('div', 'site-etat', sheet.body); node('span', 'chip ' + e2[0], row, e2[1]);
  node('span', 'note', row, st.siteEtat === 'vendue' ? 'La page reste en ligne, marquée vendue, son bouton mène au sur-mesure.' : (st.siteEtat === 'commande' ? 'Le délai est écrit sous les boutons d’achat.' : 'Les boutons d’achat sont en place.'));
  if (!admin()) return;
  var acts = node('div', 'marks', sheet.body), write = function(etat, label, delai){ var b = node('button', 'btn', acts, label); b.type = 'button'; if (etat === st.siteEtat) b.disabled = true;
    b.addEventListener('click', function(){ if (!confirm('Écrire sur la page de ' + st.name + ' : ' + label.toLowerCase() + ' ? Une sauvegarde de la page est gardée.')) return; api('stock/' + st.slug + '/site', { method: 'POST', json: { etat: etat, delai: delai ? delai() : 0 } }).then(function(r){ if (!r.ok){ toast('Non écrit : ' + err(r), true); return; } toast('Écrit sur le site : ' + label.toLowerCase() + '.'); load().then(function(){ X.redraw(); open(st.slug); }); }); }); };
  write('disponible', 'Disponible'); write('vendue', 'Vendue'); write('commande', 'Sur commande', function(){ return st.delaiJours || Number(prompt('Délai en jours ?', '21')) || 0; });
  if (st.suivi && st.kind === 'unique' && st.onHand === 0 && st.siteEtat !== 'vendue') node('p', 'fhint', sheet.body, 'Cette pièce unique est sortie du stock : sa page dit encore « disponible ».');
}
})();
