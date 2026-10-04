/* LES VENTES dans le studio (4 octobre 2026) : les commandes lues dans Stripe, en lecture
   seule, et l'etat du paiement en ligne. On encaisse, on rembourse et on annule dans le
   tableau de bord Stripe, pas ici. */
(function(){
'use strict';
var X = window.STUDIO, node = X.node, api = X.api, toast = X.toast, data = null, busy = false;
function euros(v){ return (+v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function when(iso){ var d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toTimeString().slice(0, 5); }
var PAID = { paid: 'Payée', unpaid: 'Non payée', no_payment_required: 'Sans paiement' }, STATE = { complete: 'Terminée', open: 'En cours', expired: 'Abandonnée' };
function load(){ if (busy) return; busy = true; api('vente').then(function(r){ busy = false; if (!r.ok){ toast('Les ventes ne se lisent pas : ' + (r.body.error || r.status), true); return; } data = r.body; X.redraw(); }); }
function need(host){ if (data) return true; node('p', 'note', host, 'Lecture…'); load(); return false; }

X.register('commandes', function(host){
  X.title('Commandes'); if (!need(host)) return;
  var bar = node('div', 'marks', host); bar.style.margin = '12px 0';
  var again = node('button', 'btn small', bar, 'Relire dans Stripe'); again.addEventListener('click', function(){ data = null; X.redraw(); });
  node('span', 'note', bar, 'Lecture seule. Encaisser, rembourser, annuler : dans le tableau de bord Stripe.');
  if (data.etat.cle === 'absente'){ var e0 = node('div', 'empty', host); node('b', '', e0, 'Le paiement en ligne n’est pas ouvert sur cette machine'); node('span', 'sub', e0, 'La clé Stripe n’est pas posée : voir Ventes, Paiement.').style.whiteSpace = 'normal'; return; }
  if (data.erreur){ var e1 = node('div', 'empty', host); node('b', '', e1, 'Stripe n’a pas répondu'); node('span', 'sub', e1, data.erreur).style.whiteSpace = 'normal'; return; }
  X.count(String(data.commandes.length));
  if (!data.commandes.length){ var e2 = node('div', 'empty', host); node('b', '', e2, 'Aucune commande pour l’instant'); node('span', 'sub', e2, 'Les cinquante dernières sessions de paiement s’affichent ici.'); return; }
  var wrap = node('div', 'tablewrap inner', host), table = node('table', 'table', wrap), hr = node('tr', '', node('thead', '', table)), tb = node('tbody', '', table);
  ['Date', 'Client', 'E-mail', 'Total', 'Paiement', 'État', ''].forEach(function(t){ node('th', '', hr, t); });
  data.commandes.forEach(function(c){
    var tr = node('tr', '', tb); node('td', 'first', tr, when(c.at)); node('td', '', tr, c.name); node('td', 'mute', tr, c.email); node('td', 'num', tr, euros(c.total));
    var pc = node('td', '', tr); node('span', 'chip' + (c.paid === 'paid' ? ' on' : ''), pc, PAID[c.paid] || c.paid); node('td', 'mute', tr, STATE[c.status] || c.status);
    var m = node('td', 'mute', tr, c.live ? '' : 'essai');
    tr.tabIndex = 0; tr.addEventListener('click', function(){ open(c); }); tr.addEventListener('keydown', function(e){ if (e.target === tr && e.key === 'Enter') open(c); });
  });
});
function open(c){
  var sheet = X.panel('Commande'), rh = node('div', 'rhead2', sheet.body), rt = node('div', 'rtext', rh); node('h2', 'rtitle', rt, c.name || c.email || 'Commande'); node('div', 'rsub', rt, when(c.at) + ' · ' + euros(c.total));
  var f = node('div', 'fields', sheet.body), row = function(l, v){ if (!v) return; var r = node('div', 'field', f); node('label', '', r, l); node('div', 'v', r, v).style.whiteSpace = 'normal'; };
  row('Paiement', (PAID[c.paid] || c.paid) + (c.live ? '' : ' (essai)')); row('État', STATE[c.status] || c.status); row('E-mail', c.email); row('Téléphone', c.phone); row('Livraison', c.address); row('Cadeau', c.gift ? 'Oui : écrin, mot joint, prix masqué' : ''); row('Session Stripe', c.id);
  node('h3', '', node('div', 'sec', sheet.body), 'Pièces'); var box = node('div', 'items', sheet.body); node('p', 'note', box, 'Lecture…');
  api('vente/commande?id=' + encodeURIComponent(c.id)).then(function(r){
    box.innerHTML = '';
    if (!r.ok){ node('p', 'note', box, 'Les lignes ne se lisent pas : ' + (r.body.error || r.status)); return; }
    r.body.lines.forEach(function(l){ var it = node('div', 'item', box), nm = node('div', 'nm', it); node('b', '', nm, l.name); node('span', 'k', it, (l.quantity > 1 ? l.quantity + ' × ' : '') + euros(l.amount)); });
  });
  node('span', 'saved2', sheet.foot, 'Lecture seule.');
}

X.register('paiement', function(host){
  X.title('Paiement'); if (!need(host)) return;
  var e = data.etat, f = node('div', 'fields sender', host); f.style.marginTop = '14px';
  var row = function(l, v, hint){ var r = node('div', 'field tall', f); node('label', '', r, l); var d = node('div', 'v', r, v); d.style.whiteSpace = 'normal'; if (hint) node('div', 'fhint', r, hint).style.gridColumn = '2'; };
  row('Dans le site', e.fonction ? 'La fonction de paiement est dans le site.' : 'La fonction de paiement n’est pas dans le site.', 'netlify/functions/creer-paiement.js : elle crée la session Stripe Checkout. Le montant vient du serveur, jamais du navigateur.');
  row('Prix qui font foi', e.catalogue + ' pièces, dont ' + e.payables + ' payables en ligne.', 'netlify/functions/catalogue.json. Le studio le tient à jour à chaque ajout, modification ou retrait de pièce.');
  row('Clé Stripe sur cette machine', e.cle === 'absente' ? 'Absente : les commandes ne se lisent pas ici.' : (e.cle === 'test' ? 'Clé d’essai : aucun argent réel.' : 'Clé de production : argent réel.'), 'STRIPE_SECRET_KEY dans le fichier .env du studio. Elle n’est jamais affichée ni enregistrée ailleurs.');
  row('Où tourne le paiement', e.sert ? 'Ce studio sert le site et fait tourner sa fonction' + (e.adresse ? ' à ' + e.adresse : '') + '.' : 'Chez l’hébergeur du site (la fonction part avec le site quand on publie). La clé se pose aussi chez lui.');
  row('Avant d’ouvrir', 'Une commande d’essai avec une clé d’essai, de bout en bout, puis la clé de production.', 'Apple Pay et Google Pay s’activent dans le tableau de bord Stripe (domaine à vérifier pour Apple Pay).');
});
})();
