/* L'ACCUEIL DU STUDIO (7 octobre 2026) : ce qu'il y a a faire aujourd'hui, lu dans la base et
   dans le site. Des tuiles, puis les dernieres commandes, les ventes des trente jours, le
   stock a surveiller, le dernier envoi, la derniere mise en ligne, le journal. Chaque ligne
   mene a son ecran. */
(function(){
'use strict';
var X = window.STUDIO, node = X.node, api = X.api, txt = X.txt;
function euros(v){ return (+v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'; }
function when(iso){ if (!iso) return ''; var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.toTimeString().slice(0, 5); }
var PREP = { a_preparer: 'À préparer', preparee: 'Préparée', expediee: 'Expédiée', livree: 'Livrée', annulee: 'Annulée', remboursee: 'Remboursée' };
var WHAT = { 'piece-add': 'Pièce ajoutée', 'piece-update': 'Pièce modifiée', 'piece-remove': 'Pièce retirée', 'page-save': 'Page enregistrée', 'chrome-save': 'Textes communs', publish: 'Mise en ligne', undo: 'Annulation', login: 'Entrée', 'mailing-send': 'Envoi lancé', 'mailing-contacts': 'Contacts ajoutés', 'vente-relire': 'Commandes relues', 'vente-preparation': 'Commande préparée', 'stripe-webhook': 'Commande reçue', 'stock-move': 'Mouvement de stock', 'stock-set': 'Stock suivi', 'base-sauvegarde': 'Sauvegarde', 'user-add': 'Compte créé' };

X.register('accueil', function(host){
  X.title('Aujourd’hui'); X.count('');
  node('p', 'note', host, 'Lecture…');
  api('accueil').then(function(r){
    host.innerHTML = '';
    if (!r.ok){ node('p', 'note', host, 'L’accueil ne se lit pas : ' + (r.body.error || r.status)); return; }
    var A = r.body, hello = node('div', 'home-hello', host), h = new Date().getHours();
    node('h2', '', hello, (h < 18 ? 'Bonjour' : 'Bonsoir') + (X.S.me.name ? ', ' + X.S.me.name.split(' ')[0] : '') + '.');
    node('p', '', hello, new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + A.pieces.total + ' pièces sur le site' + (A.dernierePublication ? ' · dernière mise en ligne le ' + when(A.dernierePublication.at) : ' · jamais mis en ligne depuis le studio'));

    var tiles = node('div', 'tiles', host);
    var tile = function(n, label, cls, key, filter){ var t = node('div', 'tile' + (cls ? ' ' + cls : ''), tiles); node('div', 'big', t, String(n)); node('div', 'lbl', t, label); if (key){ t.style.cursor = 'pointer'; t.tabIndex = 0; t.addEventListener('click', function(){ X.open(key, filter); }); } return t; };
    tile(A.commandes.a_preparer, 'commande' + (A.commandes.a_preparer > 1 ? 's' : '') + ' à préparer', A.commandes.a_preparer ? 'warn' : '', 'commandes');
    tile(euros(A.commandes.trente_jours), 'vendus en 30 jours', '', 'commandes');
    tile(A.stock.ruptures, 'rupture' + (A.stock.ruptures > 1 ? 's' : '') + ' de stock', A.stock.ruptures ? 'bad' : '', 'stock');
    tile(A.stock.bas, 'stock' + (A.stock.bas > 1 ? 's' : '') + ' bas', A.stock.bas ? 'warn' : '', 'stock');
    tile(A.clients, 'client' + (A.clients > 1 ? 's' : ''), '', 'clients');
    tile(A.mailing.contacts, 'contact' + (A.mailing.contacts > 1 ? 's' : '') + ' au mailing', '', 'contacts');
    tile(A.or ? A.or.price.toLocaleString('fr-FR') + ' €' : '—', 'le gramme d’or 24k' + (A.or ? ', ' + when(A.or.createdAt).split(' ')[0] : ''), '', 'or');

    var grid = node('div', 'home-grid', host), card = function(title, wide, more, key){ var c = node('div', 'home-card' + (wide ? ' wide' : ''), grid), s = node('div', 'sec', c); node('h3', '', s, title); if (more && key && X.has && !X.has(key)) more = null; if (more){ var b = node('button', 'btn small', s, more); b.addEventListener('click', function(){ X.open(key); }); } return c; };

    var c1 = card('Dernières commandes', false, 'Toutes', 'commandes');
    if (!A.dernieres.length) node('p', 'note', c1, 'Aucune commande pour l’instant. Elles arrivent de Stripe, sur Relire ou par le webhook.');
    else { var w = node('div', 'tablewrap', c1), t = node('table', 'table', w), tb = node('tbody', '', t);
      A.dernieres.forEach(function(c){ var tr = node('tr', '', tb), f = node('td', 'first', tr); X.avatar(c.name || c.email, f); f.appendChild(document.createTextNode(c.name || c.email || c.id)); node('td', 'mute', tr, when(c.at)); node('td', 'num', tr, euros(c.total)); var s = node('td', '', tr); node('span', 'chip state-' + c.preparation, s, c.paid === 'paid' ? PREP[c.preparation] : 'Non payée');
        tr.tabIndex = 0; tr.addEventListener('click', function(){ sessionStorage.setItem('alaya-commande-open', c.id); X.open('commandes'); }); }); }

    var c2 = card('Ventes des 30 jours', false, null);
    var days = {}, total = 0; for (var i = 29; i >= 0; i--) days[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = 0;
    A.jours.forEach(function(j){ if (j.jour in days){ days[j.jour] = j.total; total += j.total; } });
    var max = Math.max.apply(null, Object.keys(days).map(function(k){ return days[k]; }).concat([1]));
    if (!total) node('p', 'note', c2, 'Rien de vendu en ligne ces trente jours.');
    else { var sp = node('div', 'spark', c2); Object.keys(days).forEach(function(k){ var b = node('i', days[k] ? 'on' : '', sp); b.style.height = Math.max(4, days[k] / max * 100) + '%'; b.title = k + ' : ' + euros(days[k]); });
      var kv = node('dl', 'kv', c2); node('dt', '', kv, 'Total'); node('dd', '', kv, euros(total)); node('dt', '', kv, 'Commandes payées'); node('dd', '', kv, String(A.commandes.payees)); }

    var c3 = card('Stock à surveiller', false, 'Le stock', 'stock');
    if (!A.stock.items) node('p', 'note', c3, 'Aucune pièce suivie en stock. Dans Pièces, clic droit sur une pièce : Son stock.');
    else if (!A.stockBas.length) node('p', 'note', c3, 'Tout est au-dessus du seuil.');
    else { var w3 = node('div', 'tablewrap', c3), t3 = node('table', 'table', w3), tb3 = node('tbody', '', t3);
      A.stockBas.forEach(function(s){ var tr = node('tr', '', tb3), f = node('td', 'first', tr), th = node('span', 'th sq', f); if (s.image){ var im = node('img', '', th); im.alt = ''; im.src = 'https://raouf-hamouda.github.io/alaya-fine-jewelry/' + s.image; } f.appendChild(document.createTextNode(s.name)); node('td', 'mute', tr, s.kind === 'unique' ? 'Pièce unique' : 'En stock'); var sc = node('td', '', tr); node('span', 'chip ' + (s.onHand === 0 ? 'bad' : 'warn'), sc, s.onHand === 0 ? (s.kind === 'unique' ? 'Vendue' : 'Rupture') : s.onHand + ' restant' + (s.onHand > 1 ? 's' : ''));
        tr.tabIndex = 0; tr.addEventListener('click', function(){ sessionStorage.setItem('alaya-stock-open', s.slug); X.open('stock'); }); }); }

    var c4 = card('Le mailing et le site', false, null), kv4 = node('dl', 'kv', c4);
    node('dt', '', kv4, 'Dernier envoi'); node('dd', '', kv4, A.mailing.dernier ? A.mailing.dernier.subject + ' · ' + when(A.mailing.dernier.createdAt) + ' · ' + A.mailing.dernier.total + ' personnes' : 'aucun');
    node('dt', '', kv4, 'Envois'); node('dd', '', kv4, String(A.mailing.envois));
    node('dt', '', kv4, 'Mise en ligne'); node('dd', '', kv4, A.dernierePublication ? when(A.dernierePublication.at) + ' · ' + A.dernierePublication.message : 'jamais depuis le studio');
    node('dt', '', kv4, 'Pièces sans prix'); node('dd', '', kv4, A.pieces.sansPrix + ' (prix sur demande)');
    var rayons = Object.keys(A.pieces.rayons).filter(Boolean); if (rayons.length){ node('dt', '', kv4, 'Par rayon'); node('dd', '', kv4, rayons.map(function(k){ return (X.S.rayons[k] || k) + ' ' + A.pieces.rayons[k]; }).join(' · ')); }

    /* 10 octobre (Raouf) : the agenda and the Rapaport indices on the home */
    var ca = card('Agenda', false, 'Tout l’agenda', 'events'), ag = A.agenda || [];
    if (!ag.length) node('p', 'note', ca, 'Rien de prévu. Atelier > Agenda pour ajouter un rendez-vous.');
    else { var al = node('div', 'items home-agenda', ca); ag.forEach(function(e){ var it = node('div', 'item', al), nm = node('div', 'nm', it); node('b', '', nm, txt(e.title) || 'Sans titre'); node('span', '', nm, [when(txt(e.start)) + (e.end && txt(e.end).slice(0, 10) !== txt(e.start).slice(0, 10) ? ' → ' + when(txt(e.end)) : ''), e.place].filter(Boolean).join(' · ')); }); }
    var cr = card('Les indices Rapaport', true, 'Les cours', 'or');
    if (!A.rapaport) node('p', 'note', cr, 'Pas encore lus : ils arrivent avec la première lecture des cours.'); else if (!window.ALAYA_RAPI) node('p', 'note', cr, 'rapi.js ne s’est pas chargé.'); else { var rr = node('div', 'rapi-root rapi-home', cr); window.ALAYA_RAPI.render(rr, A.rapaport, 'fr', { sansCalcul: true }); }
    var c5 = card('Journal', true, 'Tout le journal', 'tableau'), items = node('div', 'items home-journal', c5);
    if (!A.journal.length) node('p', 'note', c5, 'Rien encore.');
    A.journal.forEach(function(j){ var it = node('div', 'item', items), nm = node('div', 'nm', it); node('b', '', nm, (WHAT[txt(j.what).replace(/^atelier-/, 'atelier ')] || txt(j.what)) + (j.reference ? ' · ' + j.reference : '') + (j.slug ? ' · ' + j.slug : '') + (j.message ? ' · ' + j.message : '')); node('span', '', nm, (j.who || 'stripe') + ' · ' + when(j.t)); });
  });
});
})();
