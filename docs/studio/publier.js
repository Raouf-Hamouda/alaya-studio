/* PUBLIER dans le studio (4 octobre 2026) : ce qui a change dans le dossier du site depuis
   la derniere mise en ligne, et le bouton qui l'envoie. Rien ne part sans le mot PUBLIER. */
(function(){
'use strict';
var X = window.STUDIO, node = X.node, api = X.api, toast = X.toast, data = null, busy = false;
var STATES = { M: 'modifié', A: 'ajouté', D: 'retiré', '??': 'nouveau', R: 'renommé' };
function load(){ if (busy) return; busy = true; api('publier').then(function(r){ busy = false; if (!r.ok){ toast('L’état du site ne se lit pas : ' + (r.body.error || r.status), true); return; } data = r.body; X.redraw(); }); }

X.register('publier', function(host){
  X.title('Publier');
  if (!data){ node('p', 'note', host, 'Lecture…'); load(); return; }
  var admin = X.S.me.role === 'admin';
  if (!data.repo){ var e0 = node('div', 'empty', host); node('b', '', e0, 'Le dossier du site n’est pas un dépôt git'); node('span', 'sub', e0, 'La mise en ligne passe par git : ce dossier n’en a pas.'); return; }
  X.count(data.changed ? String(data.changed) : '');
  var top = node('div', 'marks', host); top.style.margin = '12px 0';
  var again = node('button', 'btn small', top, 'Relire'); again.addEventListener('click', function(){ data = null; X.redraw(); });
  node('span', 'note', top, 'Branche ' + data.branch + (data.remote ? ' · ' + data.remote : ' · aucun dépôt distant'));

  var s1 = node('div', 'sec', host); node('h3', '', s1, 'À mettre en ligne'); node('span', 'count', s1, data.changed + (data.changed > 1 ? ' fichiers' : ' fichier') + (data.ahead ? ' · ' + data.ahead + ' enregistrement' + (data.ahead > 1 ? 's' : '') + ' pas encore envoyé' + (data.ahead > 1 ? 's' : '') : ''));
  if (!data.changed && !data.ahead){ var e1 = node('div', 'empty', host); node('b', '', e1, 'Le site en ligne est à jour'); node('span', 'sub', e1, 'Rien n’a changé dans le dossier du site depuis la dernière mise en ligne.'); }
  else {
    var wrap = node('div', 'tablewrap inner scroll', host), table = node('table', 'table', wrap), tb = node('tbody', '', table);
    data.files.forEach(function(f){ var tr = node('tr', 'plain', tb); node('td', 'mute', tr, STATES[f.state] || f.state).style.width = '110px'; node('td', '', tr, f.file); });
    if (data.changed > data.files.length){ var more = node('tr', 'plain', tb); node('td', 'mute', more, ''); node('td', 'mute', more, 'et ' + (data.changed - data.files.length) + ' autres'); }
    if (admin){
      var f = node('div', 'fields sender', host); f.style.marginTop = '14px';
      var r = node('div', 'field', f); node('label', '', r, 'Ce qui part en ligne'); var msg = node('input', '', r); msg.value = data.suggest || ''; msg.placeholder = 'Une phrase : ce qui a changé';
      var act = node('div', 'actions marks', host), go = node('button', 'mark', act, 'Publier sur le site en ligne'); node('span', 'note', act, 'Le studio demande de taper le mot PUBLIER. Ce qui est parti est en ligne.');
      go.addEventListener('click', function(){
        if (!msg.value.trim()){ toast('Il faut une phrase qui dit ce qui part en ligne.', true); msg.focus(); return; }
        var word = prompt('Mettre en ligne ' + data.changed + ' fichier' + (data.changed > 1 ? 's' : '') + ' ?\nTapez PUBLIER pour confirmer.');
        if (word !== 'PUBLIER'){ if (word !== null) toast('Rien n’est parti : le mot n’était pas PUBLIER.', true); return; }
        go.disabled = true; go.textContent = 'Mise en ligne…';
        api('publier', { method: 'POST', json: { message: msg.value, confirm: word } }).then(function(r2){
          if (!r2.ok){ go.disabled = false; go.textContent = 'Publier sur le site en ligne'; var last = (r2.body.log || []).slice(-1)[0]; toast('Non publié : ' + (r2.body.error || (last ? last.cmd + ' : ' + last.out : r2.status)), true); return; }
          toast('C’est en ligne.'); data = null; X.redraw();
        });
      });
    }
  }
  var s2 = node('div', 'sec', host); node('h3', '', s2, 'Dernières mises en ligne');
  var w2 = node('div', 'tablewrap inner', host), t2 = node('table', 'table', w2), b2 = node('tbody', '', t2);
  data.last.forEach(function(c){ var tr = node('tr', 'plain', b2); node('td', 'mute', tr, new Date(c.at).toLocaleDateString('fr-FR') + ' ' + new Date(c.at).toTimeString().slice(0, 5)).style.width = '150px'; var d = node('td', '', tr, c.subject); d.style.whiteSpace = 'normal'; d.style.maxWidth = 'none'; });
});
})();
