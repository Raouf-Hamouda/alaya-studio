/* LES VENTES dans le studio (4 octobre 2026, sur la base depuis le 7) : les commandes, lues dans
   la base (Stripe les y pousse par le webhook, ou Relire les y lit), leur preparation comme chez
   Shopify (a preparer, preparee, expediee, livree, annulee, remboursee), le numero de suivi, la
   note, encaisser et rembourser derriere un mot tape. Et l'etat du paiement en ligne. */
(function(){
'use strict';
var X = window.STUDIO, node = X.node, api = X.api, toast = X.toast, txt = X.txt, SITE = 'https://raouf-hamouda.github.io/alaya-fine-jewelry/', data = null, busy = false, q = '', filter = '';
function euros(v){ return (+v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function when(iso){ var d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.toTimeString().slice(0, 5); }
function err(r){ return (r.body && r.body.error) || String(r.status); }
var PAID = { paid: 'Payée', unpaid: 'Non payée', no_payment_required: 'Sans paiement' }, STATE = { complete: 'Terminée', open: 'En cours', expired: 'Abandonnée' };
var PREP = { a_preparer: 'À préparer', preparee: 'Préparée', expediee: 'Expédiée', livree: 'Livrée', annulee: 'Annulée', remboursee: 'Remboursée' }, ORDER = ['a_preparer', 'preparee', 'expediee', 'livree', 'annulee', 'remboursee'];
function admin(){ return X.S.me.role === 'admin'; }
function load(){ if (busy) return; busy = true; api('vente').then(function(r){ busy = false; if (!r.ok){ toast('Les ventes ne se lisent pas : ' + err(r), true); return; } data = r.body; X.redraw(); }); }
function need(host){ if (data) return true; node('p', 'note', host, 'Lecture…'); load(); return false; }
function prepare(id, patch, after){ return api('vente/commande/' + id, { method: 'PUT', json: patch }).then(function(r){ if (!r.ok){ toast(err(r), true); return; } toast(patch.preparation ? PREP[patch.preparation] + '.' : 'Enregistré.'); data = null; api('vente').then(function(r2){ busy = false; if (r2.ok) data = r2.body; X.redraw(); if (after) after(r.body); }); }); }
function money(id, what, after){
  var word = what === 'capturer' ? 'ENCAISSER' : 'REMBOURSER', w = window.prompt((what === 'capturer' ? 'Encaisser cette commande ? La carte autorisée est débitée.' : 'Rembourser cette commande en entier ? Ce qui est remboursé ne revient pas.') + '\n\nTapez ' + word + ' en capitales.');
  if (w === null) return; if (w.trim() !== word){ toast('Rien n’est fait : le mot n’était pas ' + word + '.', true); return; }
  api('vente/commande/' + id + '/' + what, { method: 'POST', json: { confirm: word } }).then(function(r){ if (!r.ok){ toast(err(r), true); return; } toast(what === 'capturer' ? 'Encaissée.' : 'Remboursée.'); data = null; load(); if (after) setTimeout(function(){ after(r.body); }, 300); });
}

X.register('commandes', function(host){
  X.title('Commandes'); if (!need(host)) return;
  var e = data.etat, R = data.resume;
  var tiles = node('div', 'tiles', host), tile = function(n, l, c, f){ var t = node('div', 'tile' + (c ? ' ' + c : ''), tiles); node('div', 'big', t, String(n)); node('div', 'lbl', t, l); if (f !== undefined){ t.style.cursor = 'pointer'; t.addEventListener('click', function(){ filter = f; X.redraw(); }); } };
  tile(R.a_preparer, 'à préparer', R.a_preparer ? 'warn' : '', 'a_preparer'); tile(R.payees, 'payées', '', 'payees'); tile(euros(R.trente_jours), 'sur 30 jours'); tile(euros(R.total), 'au total');
  var bar = node('div', 'marks atl-filters', host), s = node('input', 'inline', bar); s.type = 'search'; s.placeholder = 'Chercher un nom, un e-mail, un numéro'; s.value = q; s.setAttribute('aria-label', 'Chercher');
  var fb = node('div', 'statusbar', bar); [['', 'Toutes'], ['a_preparer', 'À préparer'], ['preparee', 'Préparées'], ['expediee', 'Expédiées'], ['livree', 'Livrées'], ['fin', 'Annulées, remboursées'], ['impayees', 'Non payées']].forEach(function(f){ var b = node('button', f[0] === filter ? 'cur' : '', fb, f[1]); b.type = 'button'; b.addEventListener('click', function(){ filter = f[0]; X.redraw(); }); });
  if (admin()){ var again = node('button', 'btn push', bar, 'Relire dans Stripe'); again.disabled = e.cle === 'absente'; again.title = e.cle === 'absente' ? 'La clé Stripe n’est pas posée sur cette machine' : 'Les cent dernières sessions de paiement'; again.addEventListener('click', function(){ again.disabled = true; again.textContent = 'Lecture…'; api('vente/relire', { method: 'POST' }).then(function(r){ toast(r.ok ? r.body.lus + ' sessions lues, ' + r.body.nouvelles + ' nouvelle' + (r.body.nouvelles > 1 ? 's' : '') + '.' : err(r), !r.ok); data = null; load(); }); }); }
  if (!data.commandes.length){ var e0 = node('div', 'empty', host); node('b', '', e0, e.cle === 'absente' ? 'Le paiement en ligne n’est pas ouvert sur cette machine' : 'Aucune commande pour l’instant'); node('span', 'sub', e0, e.cle === 'absente' ? 'La clé Stripe n’est pas posée : voir Réglages, Paiement. Les commandes arriveront ici, lues dans Stripe ou poussées par son webhook.' : 'Relire dans Stripe lit les cent dernières sessions. Sur un serveur, le webhook les pousse ici à la seconde.'); return; }
  var wrap = node('div', 'tablewrap inner', host), table = node('table', 'table', wrap), hr = node('tr', '', node('thead', '', table)), tb = node('tbody', '', table);
  X.th(hr, 'Client', 'client'); X.th(hr, 'Date', 'date'); X.th(hr, 'Total', 'money'); X.th(hr, 'Paiement', 'status'); X.th(hr, 'Préparation', 'status'); X.th(hr, 'Pièces', 'number'); X.th(hr, '');
  var qq = (q || sessionStorage.getItem('alaya-commande-q') || '').trim().toLocaleLowerCase(); if (!q && qq){ q = qq; s.value = q; sessionStorage.removeItem('alaya-commande-q'); }
  var n = 0;
  data.commandes.forEach(function(c){
    if (qq && (c.name + ' ' + c.email + ' ' + c.id).toLocaleLowerCase().indexOf(qq) < 0) return;
    if (filter === 'payees' && c.paid !== 'paid') return; if (filter === 'impayees' && c.paid === 'paid') return; if (filter === 'fin' && c.preparation !== 'annulee' && c.preparation !== 'remboursee') return;
    if (['a_preparer', 'preparee', 'expediee', 'livree'].indexOf(filter) >= 0 && !(c.paid === 'paid' && c.preparation === filter)) return; n++;
    var tr = node('tr', '', tb), f = node('td', 'first', tr); X.avatar(c.name || c.email, f); f.appendChild(document.createTextNode(c.name || c.email || c.id)); if (!c.live) node('span', 'chip', f, 'essai').style.marginLeft = '8px'; if (c.gift) node('span', 'chip', f, 'cadeau').style.marginLeft = '6px';
    node('td', 'mute', tr, when(c.at)); node('td', 'num', tr, euros(c.total));
    var pc = node('td', '', tr); node('span', 'chip' + (c.paid === 'paid' ? ' ok' : ''), pc, (PAID[c.paid] || c.paid) + (c.capture === 'requires_capture' ? ', à encaisser' : ''));
    var sc = node('td', '', tr); if (c.paid === 'paid') node('span', 'chip state-' + c.preparation, sc, PREP[c.preparation]); else node('span', 'mute', sc, STATE[c.status] || c.status);
    node('td', 'mute', tr, c.email);
    X.rowMenu(tr, function(){ var l = [{ label: 'Ouvrir', icon: 'open', run: function(){ open(c.id); } }, { label: 'Copier l’e-mail', icon: 'copy', run: function(){ X.copy(c.email); } }, { label: 'Le client', icon: 'client', run: function(){ sessionStorage.setItem('alaya-client-open', c.email); X.open('clients'); } }];
      if (admin() && c.paid === 'paid'){ l.push('-'); ['preparee', 'expediee', 'livree'].forEach(function(k){ if (c.preparation !== k && ORDER.indexOf(k) > ORDER.indexOf(c.preparation)) l.push({ label: 'Marquer ' + PREP[k].toLowerCase(), icon: 'check', run: function(){ prepare(c.id, { preparation: k }); } }); });
        if (c.capture === 'requires_capture') l.push('-', { label: 'Encaisser', icon: 'euro', run: function(){ money(c.id, 'capturer'); } });
        if (c.preparation !== 'remboursee') l.push('-', { label: 'Rembourser', icon: 'euro', danger: true, run: function(){ money(c.id, 'rembourser'); } }); }
      return l; }, c.name || c.email);
    tr.tabIndex = 0; tr.addEventListener('click', function(){ open(c.id); }); tr.addEventListener('keydown', function(ev){ if (ev.target === tr && ev.key === 'Enter') open(c.id); });
  });
  if (!n){ var e1 = node('tr', 'plain', tb), c1 = node('td', 'emptycell', e1); c1.colSpan = 7; node('div', 'note', c1, 'Rien ne correspond.'); }
  X.count(n === data.commandes.length ? String(n) : n + ' sur ' + data.commandes.length);
  s.addEventListener('input', function(){ q = s.value; X.redraw(); var i = document.querySelector('.atl-filters input.inline'); if (i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
  var want = sessionStorage.getItem('alaya-commande-open'); if (want){ sessionStorage.removeItem('alaya-commande-open'); open(want); }
});
function open(id){
  var sheet = X.panel('Commande'); node('p', 'note', sheet.body, 'Lecture…');
  api('vente/commande/' + id).then(function(r){
    sheet.body.innerHTML = '';
    if (!r.ok){ node('p', 'note', sheet.body, 'Cette commande ne se lit pas : ' + err(r)); return; }
    var c = r.body, ok = admin() && c.paid === 'paid';
    var rh = node('div', 'rhead2', sheet.body), rt = node('div', 'rtext', rh); node('h2', 'rtitle', rt, c.name || c.email || 'Commande'); var sub = node('div', 'rsub', rt); sub.textContent = when(c.at) + ' · ' + euros(c.total) + (c.live ? '' : ' · essai');
    node('span', 'chip' + (c.paid === 'paid' ? ' ok' : ''), sub, PAID[c.paid] || c.paid).style.marginLeft = '8px'; if (c.paid === 'paid') node('span', 'chip state-' + c.preparation, sub, PREP[c.preparation]).style.marginLeft = '6px';
    if (c.paid === 'paid'){
      node('h3', '', node('div', 'sec', sheet.body), 'Préparation');
      var sb = node('div', 'statusbar', sheet.body); ORDER.forEach(function(k){ var b = node('button', k === c.preparation ? 'cur' : '', sb, PREP[k]); b.type = 'button'; b.disabled = !ok; b.addEventListener('click', function(){ if (k === c.preparation) return; if ((k === 'annulee' || k === 'remboursee') && !confirm('Marquer la commande ' + PREP[k].toLowerCase() + ' ? (Le remboursement lui-même se fait avec le bouton Rembourser.)')) return; prepare(id, { preparation: k }, function(){ open(id); }); }); });
      var fs = node('div', 'fields sender', sheet.body), V = { suivi: c.suivi || '', note: c.note || '' };
      var sf = node('div', 'field half', fs); node('label', '', sf, 'Numéro de suivi'); var si = node('input', '', sf); si.value = V.suivi; si.placeholder = 'Colissimo, DHL, Fedex…'; si.disabled = !ok; si.addEventListener('input', function(){ V.suivi = si.value; });
      var nf = node('div', 'field', fs); node('label', '', nf, 'Note'); var ni = node('textarea', '', nf); ni.rows = 3; ni.value = V.note; ni.placeholder = 'Écrin, gravure, mise à taille, ce qu’on a promis…'; ni.disabled = !ok; ni.addEventListener('input', function(){ V.note = ni.value; });
      if (ok){ var sv = node('button', 'btn', node('div', 'marks', sheet.body), 'Enregistrer'); sv.addEventListener('click', function(){ prepare(id, V, function(){ open(id); }); }); }
    }
    node('h3', '', node('div', 'sec', sheet.body), 'Le client');
    var kv = node('dl', 'kv', sheet.body), row = function(l, v){ if (!v) return; node('dt', '', kv, l); node('dd', '', kv, v); };
    row('Nom', c.name); row('E-mail', c.email); row('Téléphone', c.phone); row('Livraison', c.address); row('Cadeau', c.gift ? 'Oui : écrin, mot joint, prix masqué' : ''); row('État Stripe', (STATE[c.status] || c.status) + (c.capture ? ' · paiement ' + c.capture.replace('requires_capture', 'autorisé, à encaisser').replace('succeeded', 'encaissé') : '')); row('Session', c.id);
    var h = node('div', 'sec', sheet.body); node('h3', '', h, 'Pièces'); node('span', 'count', h, String(c.lines.length));
    var box = node('div', 'items', sheet.body);
    if (!c.lines.length) node('p', 'note', box, 'Les lignes ne sont pas encore lues : Relire dans Stripe.');
    c.lines.forEach(function(l){ var p = X.S.pieces.filter(function(x){ return x.slug === l.slug; })[0], it = node('div', 'item' + (p ? ' link' : ''), box), th = node('span', 'th sq', it); if (p && p.image){ var im = node('img', '', th); im.alt = ''; im.src = SITE + p.image; } var nm = node('div', 'nm', it); node('b', '', nm, l.name); node('span', '', nm, p ? 'sur le site' : 'hors catalogue'); node('span', 'k', it, (l.quantity > 1 ? l.quantity + ' × ' : '') + euros(l.amount)); if (p) it.addEventListener('click', function(){ X.S.open = p.slug; X.open('pieces'); }); });
    var tot = node('div', 'lines-total', sheet.body); node('span', '', tot, 'Total'); node('b', '', tot, euros(c.total));
    if (ok){ if (c.capture === 'requires_capture'){ var cap = node('button', 'mark', sheet.foot, 'Encaisser'); cap.addEventListener('click', function(){ money(id, 'capturer', function(){ open(id); }); }); }
      if (c.preparation !== 'remboursee'){ var rf = node('button', 'btn danger', sheet.foot, 'Rembourser'); rf.addEventListener('click', function(){ money(id, 'rembourser', function(){ open(id); }); }); } }
    node('span', 'saved2', sheet.foot, c.email ? '' : 'Lecture seule.');
    if (c.email){ var cl = node('button', 'btn', sheet.foot, 'Le client'); cl.addEventListener('click', function(){ sessionStorage.setItem('alaya-client-open', c.email); X.open('clients'); }); }
  });
}

X.register('paiement', function(host){
  X.title('Paiement'); if (!need(host)) return;
  var e = data.etat, f = node('div', 'fields sender', host); f.style.marginTop = '8px';
  var row = function(l, v, hint){ var r = node('div', 'field', f); node('label', '', r, l); var d = node('div', 'v', r, v); d.style.whiteSpace = 'normal'; if (hint) node('div', 'fhint', r, hint); };
  row('Dans le site', e.fonction ? 'La fonction de paiement est dans le site.' : 'La fonction de paiement n’est pas dans le site.', 'netlify/functions/creer-paiement.js : elle crée la session Stripe Checkout. Le montant vient du serveur, jamais du navigateur.');
  row('Prix qui font foi', e.catalogue + ' pièces, dont ' + e.payables + ' payables en ligne.', 'netlify/functions/catalogue.json. Le studio le tient à jour à chaque ajout, modification ou retrait de pièce.');
  row('Clé Stripe sur cette machine', e.cle === 'absente' ? 'Absente : les commandes ne se lisent pas ici.' : (e.cle === 'test' ? 'Clé d’essai : aucun argent réel.' : 'Clé de production : argent réel.'), 'STRIPE_SECRET_KEY dans le fichier .env du studio. Elle n’est jamais affichée ni enregistrée ailleurs.');
  row('Webhook', e.webhook ? 'Signé : Stripe pousse chaque commande dans la base' + (e.webhookUrl ? ', à ' + e.webhookUrl : '') + '.' : 'Pas de webhook : les commandes se lisent sur Relire dans Stripe.', 'STRIPE_WEBHOOK_SECRET dans .env, et dans le tableau de bord Stripe un point de terminaison vers <adresse publique>/stripe/webhook, événements checkout.session.*, payment_intent.*, charge.refunded.');
  row('Où tourne le paiement', e.sert ? 'Ce studio sert le site et fait tourner sa fonction' + (e.adresse ? ' à ' + e.adresse : '') + '.' : 'Chez l’hébergeur du site (la fonction part avec le site quand on publie). La clé se pose aussi chez lui.');
  row('Pièces uniques', 'Suivez-les dans Pièces, Stock : une commande payée sort la pièce, et une pièce unique ne sort qu’une fois.', 'Pour que la carte soit seulement autorisée, puis encaissée depuis la fiche de la commande, la fonction du site doit demander capture_method=manual : ce n’est pas le cas aujourd’hui, la carte est débitée au paiement.');
  row('Avant d’ouvrir', 'Une commande d’essai avec une clé d’essai, de bout en bout, puis la clé de production.', 'Apple Pay et Google Pay s’activent dans le tableau de bord Stripe (domaine à vérifier pour Apple Pay).');
});
})();
