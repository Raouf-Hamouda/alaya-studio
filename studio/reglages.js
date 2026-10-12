/* LES REGLAGES DU STUDIO (7 octobre 2026) : les sauvegardes de la base. La maison, la boite
   d'envoi, le paiement et les comptes ont chacun leur ecran, ranges dans la meme famille. */
(function(){
'use strict';
var X = window.STUDIO, node = X.node, api = X.api, toast = X.toast;
function when(iso){ var d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + d.toTimeString().slice(0, 5); }
function size(n){ return n > 1048576 ? (n / 1048576).toFixed(1) + ' Mo' : Math.round(n / 1024) + ' Ko'; }
X.register('sauvegardes', function(host){
  X.title('Sauvegardes'); node('p', 'note', host, 'Lecture…');
  api('sauvegardes').then(function(r){
    host.innerHTML = '';
    if (!r.ok){ node('p', 'note', host, 'Les sauvegardes ne se lisent pas : ' + (r.body.error || r.status)); return; }
    X.count(String(r.body.sauvegardes.length));
    node('p', 'lead', host, 'La base du studio est un seul fichier : ' + r.body.fichier + '. Elle tient l’atelier, le mailing, les commandes, le stock et les réglages. Les pièces, elles, sont dans les fichiers du site. Une copie de la base est faite au démarrage et chaque jour, les trente dernières sont gardées. Pour mettre la base à l’abri ailleurs, téléchargez une copie.');
    if (X.S.me.role === 'admin'){ var acts = node('div', 'actions marks', host), go = node('button', 'btn primary', acts, 'Sauvegarder maintenant'); go.addEventListener('click', function(){ go.disabled = true; api('sauvegardes', { method: 'POST' }).then(function(r2){ go.disabled = false; toast(r2.ok ? 'Sauvegarde faite : ' + r2.body.name : (r2.body.error || 'Refusée'), !r2.ok); X.redraw(); }); }); }
    var h = node('div', 'sec', host); node('h3', '', h, 'Les copies');
    if (!r.body.sauvegardes.length){ node('p', 'note', host, 'Aucune copie pour l’instant.'); return; }
    var w = node('div', 'tablewrap inner', host), t = node('table', 'table', w), hr = node('tr', '', node('thead', '', t)), tb = node('tbody', '', t);
    X.th(hr, 'Jour', 'date'); X.th(hr, 'Taille', 'number'); X.th(hr, 'Faite le', 'date'); X.th(hr, '');
    r.body.sauvegardes.forEach(function(s){ var tr = node('tr', 'plain', tb); node('td', 'first', tr, s.name.replace('.sqlite', '')); node('td', 'num', tr, size(s.size)); node('td', 'mute', tr, when(s.at)); var d = node('td', 'door', tr); if (X.S.me.role === 'admin'){ var a = node('a', 'btn small', d, 'Télécharger'); a.href = '../api/sauvegardes/' + s.name; a.style.opacity = 1; } });
  });
});
})();
