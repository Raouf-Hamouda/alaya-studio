/* LES COMPTES du studio (4 octobre 2026) : qui entre, avec quel role. Administrateur ecrit
   dans le site ; Lecture regarde. Reserve aux administrateurs. */
(function(){
'use strict';
var X = window.STUDIO, node = X.node, api = X.api, toast = X.toast, data = null;
var ROLES = { admin: 'Administrateur', lecture: 'Lecture' };
function load(){ return api('users').then(function(r){ if (r.ok){ data = r.body; X.redraw(); } else toast('Les comptes ne se lisent pas : ' + (r.body.error || r.status), true); }); }
X.register('comptes', function(host){
  X.title('Comptes');
  if (!data){ node('p', 'note', host, 'Lecture des comptes…'); load(); return; }
  X.count(String(data.users.length));
  var wrap = node('div', 'tablewrap inner', host), table = node('table', 'table', wrap), hr = node('tr', '', node('thead', '', table)), tb = node('tbody', '', table);
  wrap.style.marginTop = '12px';
  ['Identifiant', 'Nom', 'Rôle', 'Créé le', '', ''].forEach(function(t){ node('th', '', hr, t); });
  data.users.forEach(function(u){
    var tr = node('tr', 'plain', tb), me = u.email === data.me; node('td', 'first', tr, u.email + (me ? ' (vous)' : '')); node('td', '', tr, u.name);
    var rc = node('td', '', tr), se = node('select', '', rc); Object.keys(ROLES).forEach(function(k){ var o = node('option', '', se, ROLES[k]); o.value = k; }); se.value = u.role; se.setAttribute('aria-label', 'Rôle de ' + u.email);
    se.addEventListener('change', function(){ api('users/' + encodeURIComponent(u.email), { method: 'PUT', json: { role: se.value } }).then(function(r){ if (!r.ok){ toast(r.body.error || 'Non enregistré', true); se.value = u.role; return; } toast('Rôle enregistré.'); load(); }); });
    node('td', 'mute', tr, u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '');
    var pc = node('td', 'door', tr), pb = node('button', 'btn small', pc, 'Changer le mot de passe');
    pb.addEventListener('click', function(){ var pw = prompt('Nouveau mot de passe pour ' + u.email + ' (dix caractères au moins)'); if (pw === null) return; api('users/' + encodeURIComponent(u.email), { method: 'PUT', json: { password: pw } }).then(function(r){ toast(r.ok ? 'Mot de passe changé.' : (r.body.error || 'Non changé'), !r.ok); }); });
    var dc = node('td', 'door', tr), db = node('button', 'btn small danger', dc, 'Retirer'); db.disabled = me;
    db.addEventListener('click', function(){ if (!confirm('Retirer le compte ' + u.email + ' ?')) return; api('users/' + encodeURIComponent(u.email), { method: 'DELETE' }).then(function(r){ if (!r.ok){ toast(r.body.error || 'Non retiré', true); return; } toast('Compte retiré.'); load(); }); });
  });
  var sec = node('div', 'sec', host); node('h3', '', sec, 'Nouveau compte');
  var f = node('div', 'fields sender', host), F = {};
  [['email', 'Identifiant', 'Prénom ou e-mail', 'text'], ['name', 'Nom affiché', '', 'text'], ['password', 'Mot de passe', 'Dix caractères au moins', 'password']].forEach(function(d){ var r = node('div', 'field half', f); node('label', '', r, d[1]); var i = node('input', '', r); i.type = d[3]; i.placeholder = d[2]; i.autocomplete = d[3] === 'password' ? 'new-password' : 'off'; F[d[0]] = i; });
  var rr = node('div', 'field half', f); node('label', '', rr, 'Rôle'); var rs = node('select', '', rr); Object.keys(ROLES).forEach(function(k){ var o = node('option', '', rs, ROLES[k]); o.value = k; }); rs.value = 'lecture';
  var act = node('div', 'actions marks', host), go = node('button', 'mark', act, 'Créer le compte');
  go.addEventListener('click', function(){ api('users', { method: 'POST', json: { email: F.email.value, name: F.name.value, password: F.password.value, role: rs.value } }).then(function(r){ if (!r.ok){ toast(r.body.error || 'Non créé', true); return; } toast('Compte créé.'); load(); }); });
});
})();
