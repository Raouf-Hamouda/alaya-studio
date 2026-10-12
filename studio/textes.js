/* LES PAGES DU SITE dans le studio (4 octobre 2026) : la table des pages, et pour chacune
   une fiche a droite avec son titre, sa description pour Google, chacun de ses textes et
   chacune de ses images. Seul ce qui a ete change est envoye ; le programme le remplace a
   l'endroit exact dans le fichier de la page. */
(function(){
'use strict';
var X = window.STUDIO, node = X.node, api = X.api, toast = X.toast, SITE = '../site/';
var NAMES = { h1: 'Titre', h2: 'Titre 2', h3: 'Titre 3', h4: 'Titre 4', p: 'Paragraphe', li: 'Ligne de liste', summary: 'Titre d’accordéon', figcaption: 'Légende', blockquote: 'Citation',
  dt: 'Terme', dd: 'Définition', th: 'En-tête de tableau', td: 'Case de tableau', label: 'Étiquette', button: 'Bouton', span: 'Étiquette', a: 'Lien' };
var list = null, q = '';

X.menu('Site', [{ label: 'Pages du site', key: 'textes' }, { group: 'Mise en ligne' }, { label: 'Publier', key: 'publier' }, { label: 'Voir le site ↗', door: SITE + 'index.html' }]);
X.register('textes', function(host){
  X.title('Pages du site');
  if (!list){ node('p', 'note', host, 'Lecture des pages…'); api('textes').then(function(r){ if (!r.ok){ toast('Les pages ne se lisent pas : ' + (r.body.error || r.status), true); return; } list = r.body.pages; X.redraw(); }); return; }
  var bar = node('div', 'marks', host); bar.style.margin = '12px 0';
  var s = node('input', 'inline', bar); s.type = 'search'; s.placeholder = 'Chercher une page'; s.value = q; s.setAttribute('aria-label', 'Chercher une page');
  node('span', 'note', bar, 'Les textes et les images du corps de chaque page. L’en-tête, le menu et le pied de page se changent dans la première ligne ; les pièces se changent dans Pièces.');
  var wrap = node('div', 'tablewrap inner', host), table = node('table', 'table', wrap), hr = node('tr', '', node('thead', '', table)), tb = node('tbody', '', table);
  [['Page', 'text'], ['Adresse', 'link'], ['Textes', 'number'], ['Images', 'image'], ''].forEach(function(t){ if (Array.isArray(t)) X.th(hr, t[0], t[1]); else node('th', '', hr, t); });
  var fill = function(){
    tb.innerHTML = ''; var n = 0;
    if (!q){ var all = node('tr', '', tb); node('td', 'first', all, 'Partout sur le site'); var c2 = node('td', 'mute', all, 'barre du haut, en-tête, menus, pied de page'); c2.colSpan = 4; all.tabIndex = 0; all.addEventListener('click', openChrome); all.addEventListener('keydown', function(e){ if (e.target === all && e.key === 'Enter') openChrome(); }); }
    list.forEach(function(p){
      if (q && (p.title + ' ' + p.file).toLocaleLowerCase().indexOf(q) < 0) return; n++;
      var tr = node('tr', '', tb); node('td', 'first', tr, p.title || p.file); node('td', 'mute', tr, p.file.replace(/index\.html$/, '') || '/'); node('td', 'num', tr, String(p.texts)); node('td', 'num', tr, String(p.images));
      var d = node('td', 'door', tr), a = node('a', 'btn small', d, 'Voir ↗'); a.href = SITE + p.file; a.target = '_blank'; a.rel = 'noopener'; a.addEventListener('click', function(e){ e.stopPropagation(); });
      X.rowMenu(tr, function(){ return [{ label: 'Ouvrir', icon: 'open', run: function(){ open(p); } }, { label: 'Voir sur le site', icon: 'ext', href: SITE + p.file }, { label: 'Copier l’adresse', icon: 'copy', run: function(){ X.copy('https://alayafinejewelry.com/' + p.file.replace(/index\.html$/, '')); } }]; }, p.title || p.file);
      tr.tabIndex = 0; tr.addEventListener('click', function(){ open(p); }); tr.addEventListener('keydown', function(e){ if (e.target === tr && e.key === 'Enter') open(p); });
    });
    X.count(String(n));
  };
  s.addEventListener('input', function(){ q = s.value.trim().toLocaleLowerCase(); fill(); });
  fill();
});

function openChrome(){
  var sheet = X.panel('Partout sur le site'); node('p', 'note', sheet.body, 'Lecture…');
  api('textes/chrome').then(function(r){
    sheet.body.innerHTML = '';
    if (!r.ok){ node('p', 'note', sheet.body, 'Ces textes ne se lisent pas : ' + (r.body.error || r.status)); return; }
    var admin = X.S.me.role === 'admin', dirty = {}, last = '', box = null;
    var rh = node('div', 'rhead2', sheet.body), rt = node('div', 'rtext', rh); node('h2', 'rtitle', rt, 'Partout sur le site'); node('div', 'rsub', rt, 'Chaque texte est écrit une fois ici et changé sur toutes les pages. Sa traduction anglaise et italienne suit.');
    var mark = function(){ var n = Object.keys(dirty).length; save.disabled = !n; state.textContent = n ? n + (n > 1 ? ' changements' : ' changement') + ' à enregistrer' : 'Rien de changé.'; };
    r.body.texts.forEach(function(t){
      if (t.where !== last){ last = t.where; node('h3', '', node('div', 'sec', sheet.body), t.where); box = node('div', 'fields', sheet.body); }
      var f = node('div', 'field', box), i = node('input', '', f); f.style.gridTemplateColumns = '1fr'; i.value = t.text; i.disabled = !admin; i.setAttribute('aria-label', t.where + ' : ' + t.text);
      i.addEventListener('input', function(){ if (i.value === t.text) delete dirty[t.i]; else dirty[t.i] = i.value; mark(); });
    });
    var state = node('span', 'saved2', sheet.foot, ''), save = node('button', 'btn primary', sheet.foot, 'Enregistrer sur tout le site'); save.hidden = !admin;
    save.addEventListener('click', function(){
      save.disabled = true;
      api('textes/chrome', { method: 'PUT', json: { texts: Object.keys(dirty).map(function(i){ return { i: +i, text: dirty[i] }; }) } }).then(function(r2){
        if (!r2.ok){ save.disabled = false; toast('Non enregistré : ' + (r2.body.error || r2.status), true); return; }
        toast(r2.body.changed + (r2.body.changed > 1 ? ' textes changés' : ' texte changé') + ' sur ' + r2.body.pages + ' pages.'); X.reload().then(openChrome);
      });
    });
    mark();
  });
}
function open(p){
  var sheet = X.panel('Page'); node('p', 'note', sheet.body, 'Lecture de la page…');
  api('textes/page?f=' + encodeURIComponent(p.file)).then(function(r){
    sheet.body.innerHTML = '';
    if (!r.ok){ node('p', 'note', sheet.body, 'Cette page ne se lit pas : ' + (r.body.error || r.status)); return; }
    var d = r.body, admin = X.S.me.role === 'admin', dirty = { texts: {}, images: {} }, head = {};
    var rh = node('div', 'rhead2', sheet.body), rt = node('div', 'rtext', rh); node('h2', 'rtitle', rt, d.title.split(' | ')[0] || d.file); node('div', 'rsub', rt, d.file);
    var mark = function(){ var n = Object.keys(dirty.texts).length + Object.keys(dirty.images).length + Object.keys(head).length; save.disabled = !n; state.textContent = n ? n + (n > 1 ? ' changements' : ' changement') + ' à enregistrer' : 'Rien de changé.'; };
    var area = function(box, label, value, rows, on){ var f = node('div', 'field tall', box); node('label', '', f, label); var a = node('textarea', '', f); a.rows = rows; a.value = value; a.disabled = !admin; a.addEventListener('input', function(){ on(a.value); mark(); }); return a; };
    var rowsFor = function(t){ return Math.max(1, Math.min(10, Math.ceil(t.length / 90))); };

    node('h3', '', node('div', 'sec', sheet.body), 'Pour Google et les partages');
    var f0 = node('div', 'fields', sheet.body);
    area(f0, 'Titre de la page', d.title, 1, function(v){ if (v === d.title) delete head.title; else head.title = v; });
    area(f0, 'Description', d.description, 3, function(v){ if (v === d.description) delete head.description; else head.description = v; });

    var h3 = node('div', 'sec', sheet.body); node('h3', '', h3, 'Textes'); node('span', 'count', h3, String(d.texts.length));
    var f1 = node('div', 'fields', sheet.body);
    if (!d.texts.length) node('p', 'note', f1, 'Aucun texte dans le corps de cette page.');
    var under = '';   /* each text is named by the heading it sits under, so it can be found on the page */
    d.texts.forEach(function(t){
      var name = NAMES[t.tag] || t.tag, plainText = t.text.replace(/<[^>]*>/g, '').trim();
      if (/^h[1-4]$/.test(t.tag)) under = plainText.length > 40 ? plainText.slice(0, 40) + '…' : plainText; else if (under) name += ' · sous « ' + under + ' »';
      var a = area(f1, name, t.text, rowsFor(t.text), function(v){ if (v === t.text) delete dirty.texts[t.i]; else dirty.texts[t.i] = v; });
      if (!t.plain){ node('div', 'fhint', a.parentNode, 'Ce texte porte des liens ou des mises en forme : les balises restent, le texte entre elles se change.'); }
    });

    if (d.images.length){
      var h4 = node('div', 'sec', sheet.body); node('h3', '', h4, 'Images'); node('span', 'count', h4, String(d.images.length));
      var grid = node('div', 'pageimgs', sheet.body);
      d.images.forEach(function(im){
        var c = node('div', 'pageimg', grid), pic = node('img', '', c); pic.src = SITE + im.src; pic.alt = ''; pic.loading = 'lazy';
        var alt = node('input', '', c); alt.value = im.alt; alt.placeholder = 'Texte de remplacement'; alt.setAttribute('aria-label', 'Texte de remplacement'); alt.disabled = !admin;
        var touch = function(){ var e = dirty.images[im.i] || {}; if (alt.value !== im.alt) e.alt = alt.value; else delete e.alt; if (!e.data && e.alt === undefined) delete dirty.images[im.i]; else dirty.images[im.i] = e; mark(); };
        alt.addEventListener('input', touch);
        if (admin){
          var lab = node('label', 'btn small', c, 'Remplacer l’image'), fi = node('input', '', lab); fi.type = 'file'; fi.accept = 'image/jpeg,image/png,image/webp'; fi.hidden = true;
          var takeFile = function(file){ if (!file) return; if (!/^image\/(jpeg|png|webp)$/.test(file.type)){ toast(file.name + ' : il faut un JPEG, un PNG ou un WebP', true); return; } var rd = new FileReader(); rd.onload = function(){ pic.src = rd.result; var e = dirty.images[im.i] || {}; e.data = rd.result; dirty.images[im.i] = e; mark(); }; rd.readAsDataURL(file); };
          fi.addEventListener('change', function(){ takeFile(fi.files[0]); fi.value = ''; });
          /* or the file dropped on the picture itself */
          c.addEventListener('dragover', function(e){ e.preventDefault(); c.classList.add('hot'); }); c.addEventListener('dragleave', function(){ c.classList.remove('hot'); });
          c.addEventListener('drop', function(e){ e.preventDefault(); c.classList.remove('hot'); takeFile(e.dataTransfer.files[0]); });
          c.title = 'Glissez une image ici pour la remplacer';
        }
      });
    }
    var state = node('span', 'saved2', sheet.foot, ''), see = node('a', 'btn', sheet.foot, 'Voir sur le site ↗'); see.href = SITE + d.file; see.target = '_blank'; see.rel = 'noopener'; see.style.textDecoration = 'none';
    var save = node('button', 'btn primary', sheet.foot, 'Enregistrer sur le site'); save.hidden = !admin;
    save.addEventListener('click', function(){
      save.disabled = true;
      var body = Object.assign({ texts: Object.keys(dirty.texts).map(function(i){ return { i: +i, text: dirty.texts[i] }; }), images: Object.keys(dirty.images).map(function(i){ return Object.assign({ i: +i }, dirty.images[i]); }) }, head);
      api('textes/page?f=' + encodeURIComponent(d.file), { method: 'PUT', json: body }).then(function(r2){
        if (!r2.ok){ save.disabled = false; toast('Non enregistré : ' + (r2.body.error || r2.status), true); return; }
        toast('La page est enregistrée sur le site.'); list = null; X.reload().then(function(){ open(p); });
      });
    });
    mark();
  });
}
})();
