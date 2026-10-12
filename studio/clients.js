/* LES CLIENTS (7 octobre 2026) : une adresse, ce qu'elle a commande, ce qu'elle a recu, une
   note. La liste vient de la base (les commandes payees et les contacts du mailing reunis).
   La table, le clic droit, la fiche. */
(function(){
'use strict';
var X = window.STUDIO, node = X.node, api = X.api, toast = X.toast, txt = X.txt;
var data = null, q = '', filter = '';
function euros(v){ return (+v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'; }
function when(iso){ if (!iso) return ''; var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); }
function err(r){ return (r.body && r.body.error) || String(r.status); }
var PREP = { a_preparer: 'À préparer', preparee: 'Préparée', expediee: 'Expédiée', livree: 'Livrée', annulee: 'Annulée', remboursee: 'Remboursée' };
var RST = { queued: 'en file', sent: 'reçu', failed: 'échec', skipped: 'sauté', bounced: 'adresse en échec', unsubscribed: 'désinscrit' };
function load(){ return api('clients').then(function(r){ if (!r.ok){ toast('Les clients ne se lisent pas : ' + err(r), true); return; } data = r.body.clients; }); }
function admin(){ return X.S.me.role === 'admin'; }

X.register('clients', function(host){
  X.title('Clients');
  if (!data){ node('p', 'note', host, 'Lecture…'); load().then(function(){ X.redraw(); }); return; }
  var bar = node('div', 'marks atl-filters', host), s = node('input', 'inline', bar); s.type = 'search'; s.placeholder = 'Chercher un nom, une adresse'; s.value = q; s.setAttribute('aria-label', 'Chercher');
  var fb = node('div', 'statusbar', bar); [['', 'Tous'], ['achete', 'Ont acheté'], ['abonne', 'Abonnés au mailing'], ['les-deux', 'Les deux']].forEach(function(f){ var b = node('button', f[0] === filter ? 'cur' : '', fb, f[1]); b.type = 'button'; b.addEventListener('click', function(){ filter = f[0]; X.redraw(); }); });
  if (!data.length){ var em = node('div', 'empty', host); node('b', '', em, 'Aucun client pour l’instant'); node('span', 'sub', em, 'Un client naît d’une commande payée (Ventes, Relire dans Stripe) ou d’un contact du mailing.'); return; }
  var wrap = node('div', 'tablewrap inner', host), table = node('table', 'table', wrap), hr = node('tr', '', node('thead', '', table)), tb = node('tbody', '', table);
  X.th(hr, 'Client', 'client'); X.th(hr, 'E-mail', 'mail'); X.th(hr, 'Commandes', 'number'); X.th(hr, 'Dépensé', 'money'); X.th(hr, 'Dernière commande', 'date'); X.th(hr, 'Mailing', 'status'); X.th(hr, '');
  var n = 0, qq = q.trim().toLocaleLowerCase();
  data.forEach(function(c){
    if (qq && (c.nom + ' ' + c.email).toLocaleLowerCase().indexOf(qq) < 0) return;
    if (filter === 'achete' && !c.commandes) return; if (filter === 'abonne' && !c.abonne) return; if (filter === 'les-deux' && !(c.commandes && c.abonne)) return; n++;
    var tr = node('tr', '', tb), f = node('td', 'first', tr); X.avatar(c.nom || c.email, f); f.appendChild(document.createTextNode(c.nom || '—'));
    node('td', 'mute', tr, c.email); node('td', 'num', tr, String(c.commandes)); node('td', 'num', tr, c.depense ? euros(c.depense) : '—'); node('td', 'mute', tr, when(c.derniere) || '—');
    var ms = node('td', '', tr); node('span', 'chip' + (c.abonne ? ' on' : ''), ms, c.abonne ? 'Abonné' : 'Non abonné');
    X.rowMenu(tr, function(){ return [{ label: 'Ouvrir', icon: 'open', run: function(){ open(c.email); } }, { label: 'Copier l’e-mail', icon: 'copy', run: function(){ X.copy(c.email); } }, { label: 'Écrire un mail', icon: 'mail', href: 'mailto:' + c.email }]
      .concat(c.commandes ? ['-', { label: 'Ses commandes', icon: 'vente', run: function(){ sessionStorage.setItem('alaya-commande-q', c.email); X.open('commandes'); } }] : [])
      .concat(admin() && c.abonne ? ['-', { label: 'Désinscrire du mailing', icon: 'trash', danger: true, run: function(){ if (!confirm('Désinscrire ' + c.email + ' ?')) return; api('mailing/suppressions', { method: 'POST', json: { email: c.email } }).then(function(r){ toast(r.ok ? c.email + ' ne recevra plus rien.' : err(r), !r.ok); }); } }] : []); }, c.nom || c.email);
    tr.tabIndex = 0; tr.addEventListener('click', function(){ open(c.email); }); tr.addEventListener('keydown', function(e){ if (e.target === tr && e.key === 'Enter') open(c.email); });
  });
  if (!n){ var e = node('tr', 'plain', tb), cc = node('td', 'emptycell', e); cc.colSpan = 7; node('div', 'note', cc, 'Rien ne correspond.'); }
  X.count(n === data.length ? String(n) : n + ' sur ' + data.length);
  s.addEventListener('input', function(){ q = s.value; X.redraw(); var i = document.querySelector('.atl-filters input.inline'); if (i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
  var want = sessionStorage.getItem('alaya-client-open'); if (want){ sessionStorage.removeItem('alaya-client-open'); open(want); }
});
function open(email){
  var sheet = X.panel('Client'); node('p', 'note', sheet.body, 'Lecture…');
  api('clients/un?email=' + encodeURIComponent(email)).then(function(r){
    sheet.body.innerHTML = '';
    if (!r.ok){ node('p', 'note', sheet.body, err(r)); return; }
    var c = r.body, rh = node('div', 'rhead2', sheet.body), rt = node('div', 'rtext', rh); node('h2', 'rtitle', rt, c.nom || c.email); node('div', 'rsub', rt, c.email + (c.phone ? ' · ' + c.phone : ''));
    var kv = node('dl', 'kv', sheet.body); var row = function(l, v){ if (!v) return; node('dt', '', kv, l); node('dd', '', kv, v); };
    row('Commandes', c.commandes ? c.commandes + ' · ' + euros(c.depense) : 'aucune'); row('Première', when(c.premiere)); row('Dernière', when(c.derniere)); row('Adresse', c.address); row('Mailing', c.abonne ? 'abonné depuis le ' + when(c.inscrit_le) : 'non abonné');
    var h = node('div', 'sec', sheet.body); node('h3', '', h, 'Commandes'); node('span', 'count', h, String(c.commandesList.length));
    if (!c.commandesList.length) node('p', 'note', sheet.body, 'Aucune commande.');
    else { var w = node('div', 'tablewrap inner', sheet.body), t = node('table', 'table', w), tb = node('tbody', '', t); c.commandesList.forEach(function(o){ var tr = node('tr', '', tb); node('td', 'first', tr, when(o.at)); node('td', 'num', tr, euros(o.total)); var s = node('td', '', tr); node('span', 'chip state-' + o.preparation, s, o.paid === 'paid' ? PREP[o.preparation] : 'Non payée'); tr.tabIndex = 0; tr.addEventListener('click', function(){ sessionStorage.setItem('alaya-commande-open', o.id); X.open('commandes'); }); }); }
    var h2 = node('div', 'sec', sheet.body); node('h3', '', h2, 'Mails reçus'); node('span', 'count', h2, String(c.envois.length));
    if (!c.envois.length) node('p', 'note', sheet.body, 'Aucun envoi.');
    else { var its = node('div', 'items', sheet.body); c.envois.forEach(function(e){ var it = node('div', 'item', its), nm = node('div', 'nm', it); node('b', '', nm, e.subject); node('span', '', nm, (RST[e.status] || e.status) + (e.sentAt ? ' · ' + when(e.sentAt) : '') + (e.opens ? ' · ouvert' : '') + (e.clicks ? ' · ' + e.clicks + ' clic' + (e.clicks > 1 ? 's' : '') : '')); }); }
    if (c.abonne){
      node('h3', '', node('div', 'sec', sheet.body), 'Note');
      var ta = node('textarea', 'nlarea', sheet.body); ta.rows = 3; ta.value = c.note || ''; ta.placeholder = 'Ce qu’elle aime, ce qu’on lui a promis…'; ta.disabled = !admin();
      if (admin()){ var sv = node('button', 'btn', node('div', 'marks', sheet.body), 'Enregistrer la note'); sv.addEventListener('click', function(){ api('mailing/contacts', { method: 'PUT', json: { email: c.email, note: ta.value } }).then(function(r2){ toast(r2.ok ? 'Note enregistrée.' : err(r2), !r2.ok); }); }); }
    }
    var mail = node('a', 'btn', sheet.foot, 'Écrire un mail'); mail.href = 'mailto:' + c.email;
    node('span', 'saved2', sheet.foot, 'Encaisser et rembourser : dans la commande.');
  });
}
})();
