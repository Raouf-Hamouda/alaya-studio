/* ===========================================================
   LE MAILING DU STUDIO ALAYA (4 octobre 2026), sur la newsletter du studio Instinct.
   Cinq ecrans : Contacts, Nouvel envoi, Envois, Boite d'envoi, Desinscrits.
   Tout passe par les routes /api/mailing/... (mailing.js cote programme).

   Repris d'Instinct : l'editeur (nlEditor), la mise en page ecrire a gauche / le
   mail tel qu'il arrive a droite, l'ecran de la boite d'envoi, celui des desinscrits.
   Ecrit ici : les contacts avec leur nom et l'import CSV, les pieces du catalogue
   posees dans le mail, l'essai a une adresse tapee, l'envoi derriere un mot tape.

   Sur le systeme du studio, version 2 : l'etiquette au-dessus du champ, des titres
   de section en serif, un seul systeme de boutons, des tables qui se lisent d'un
   coup. L'ecran Nouvel envoi se lit de haut en bas : le mail, les pieces, a qui,
   un essai, l'envoi.
   =========================================================== */
(function(){
'use strict';
var ST = window.STUDIO, node = ST.node, api = ST.api, toast = ST.toast, txt = ST.txt;
var D = null;              /* the state read from the program */
var draft = null;          /* the mail being written, kept on the program */
var phone = false, saveTimer = null, pollTimer = null, lastImport = '', lastBounces = '';
var STATUS = { queued: 'en file', sending: 'en cours', paused: 'en pause', done: 'terminé', cancelled: 'annulé' };
var RSTATUS = { queued: 'en file', sent: 'parti', failed: 'échec', skipped: 'sauté', bounced: 'adresse en échec', unsubscribed: 'désinscrit' };

ST.menu('Mailing', [
  { label: 'Contacts', key: 'contacts' }, { label: 'Nouvel envoi', key: 'envoi' }, { label: 'Envois', key: 'envois' },
  { group: 'Réglages' }, { label: 'Désinscrits', key: 'mail-desinscrits' }
]);

function when(iso){ if (!iso) return ''; var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ', ' + d.toTimeString().slice(0, 5); }
function plural(n, one, many){ return n + ' ' + (n > 1 ? many : one); }
function admin(){ return ST.S.me && ST.S.me.role === 'admin'; }
function err(r){ return (r.body && r.body.error) || String(r.status); }
function load(){ return api('mailing/state').then(function(r){ if (r.ok){ D = r.body; if (!draft) draft = { subject: txt(D.draft.subject), contenu: txt(D.draft.contenu), pieces: (D.draft.pieces || []).slice() }; } return r; }); }
/* the menu's own press, to send someone to another screen of the family */
function goTo(label){ var b = Array.prototype.filter.call(document.querySelectorAll('#objects .sub'), function(x){ return x.textContent.indexOf(label) === 0; })[0]; if (b) b.click(); }
/* every screen: read the state, then draw; a failed read says so in the page */
function screen(draw){
  return function(host){
    clearTimeout(pollTimer);
    var paint = function(){ host.innerHTML = ''; draw(host, function(){ load().then(paint); }); };
    load().then(function(r){ if (!r.ok){ host.innerHTML = ''; node('p', 'note', host, 'Le mailing ne se lit pas : ' + err(r)); return; } paint(); });
  };
}
/* a section: its title in serif, a line beside it, and what follows */
function block(host, title, count){ var b = node('div', 'block', host), h = node('div', 'sec', b); node('h3', '', h, title); var c = node('span', 'count', h, count || ''); b.head = h; b.count = c; return b; }
function table(box, heads){ var w = node('div', 'tablewrap inner scroll', box), t = node('table', 'table', w), hr = node('tr', '', node('thead', '', t)); heads.forEach(function(x){ if (Array.isArray(x)) ST.th(hr, x[0], x[1]); else node('th', '', hr, x); }); return node('tbody', '', t); }
/* a field of a form: the label above, the hint under (the studio's .fields.sender) */
function fieldRow(box, label, value, opts){
  opts = opts || {};
  var f = node('div', 'field' + (opts.half ? ' half' : ''), box), id = 'mf-' + label.toLowerCase().replace(/[^a-z]+/g, '-'), l = node('label', '', f, label); l.htmlFor = id;
  var i = node('input', '', f); i.id = id; i.type = opts.type || 'text'; i.value = value || ''; if (opts.placeholder) i.placeholder = opts.placeholder; if (opts.autocomplete) i.autocomplete = opts.autocomplete; i.disabled = !admin();
  if (opts.hint) node('div', 'fhint', f, opts.hint);
  return i;
}

/* ---------- 1. Contacts ---------- */
ST.register('contacts', screen(function(host, again){
  var out = {}; D.suppressions.forEach(function(s){ out[s.email] = s.reason === 'bounce' ? 'adresse en échec' : 'désinscrit'; });
  var none = !D.contacts.length;
  ST.count(none ? '' : plural(D.contacts.length, 'adresse', 'adresses'));
  /* an empty list says what to do first; the box to do it is right under */
  if (none){
    var em = node('div', 'empty', host); node('b', '', em, 'Commencez par vos contacts');
    node('span', 'sub', em, admin() ? 'Collez vos adresses dans la case ci-dessous, ou importez un fichier CSV (un export de Google Contacts, d’Excel, de Shopify). Ensuite : la boîte d’envoi, puis votre premier envoi.' : 'La liste est vide. Un administrateur peut y ajouter des adresses.');
  }
  var adder = function(){
    if (!admin()) return;
    var a = block(host, none ? 'Ajouter des adresses' : 'Ajouter', '');
    var fs = node('div', 'fields sender', a), f = node('div', 'field', fs), l = node('label', '', f, 'Une adresse par ligne'); l.htmlFor = 'mf-ajout';
    var ta = node('textarea', '', f); ta.id = 'mf-ajout'; ta.rows = 4; ta.spellcheck = false; ta.placeholder = 'Claire Martin, claire@exemple.fr\nClaire Martin <claire@exemple.fr>\nclaire@exemple.fr';
    node('div', 'fhint', f, 'Le nom peut précéder ou suivre l’adresse. Une adresse déjà présente n’est pas ajoutée deux fois.');
    var row = node('div', 'actions marks', a), add = node('button', 'mark', row, 'Ajouter à la liste'), imp = node('label', 'btn', row, 'Importer un fichier CSV'), fi = node('input', '', imp); fi.type = 'file'; fi.accept = '.csv,.txt,text/csv,text/plain'; fi.hidden = true;
    if (lastImport) node('span', 'note', row, 'Dernier ajout : ' + lastImport);
    var send = function(text){ if (!text.trim()){ toast('Tapez ou collez des adresses d’abord.', true); ta.focus(); return; } api('mailing/contacts', { method: 'POST', json: { add: text } }).then(function(r){ if (!r.ok){ toast(err(r), true); return; } var b2 = r.body, parts = [plural(b2.added, 'adresse ajoutée', 'adresses ajoutées'), b2.already + ' déjà là'];
      if (b2.ignored) parts.push(plural(b2.ignored, 'ligne sans adresse valide', 'lignes sans adresse valide'));
      if (b2.unsubscribed) parts.push(b2.unsubscribed + (b2.unsubscribed > 1 ? ' déjà désinscrites, elles le restent' : ' déjà désinscrite, elle le reste'));
      lastImport = parts.join(', ') + '.'; toast(lastImport); again(); }); };
    add.addEventListener('click', function(){ send(ta.value); });
    fi.addEventListener('change', function(){ var file = fi.files[0]; if (!file) return; var rd = new FileReader(); rd.onload = function(){ send(String(rd.result)); }; rd.readAsText(file); fi.value = ''; });
  };
  if (none){ adder(); return; }
  var b = block(host, 'La liste', plural(D.reach, 'personne recevra', 'personnes recevront') + ' le prochain envoi');
  var tb = table(b, [['Adresse', 'mail'], ['Nom', 'client'], ['Ajouté le', 'date'], '', '', '']);
  D.contacts.forEach(function(c){
    var tr = node('tr', 'plain', tb), f = node('td', 'first', tr); ST.avatar(c.name || c.email, f); f.appendChild(document.createTextNode(c.email)); node('td', 'mute', tr, c.name || ''); node('td', 'mute', tr, when(c.addedAt));
    var t1 = node('td', 'mute', tr), t2 = node('td', 'door', tr);
    ST.rowMenu(tr, function(){ return [{ label: 'Le client', icon: 'client', run: function(){ sessionStorage.setItem('alaya-client-open', c.email); ST.open('clients'); } }, { label: 'Copier l’adresse', icon: 'copy', run: function(){ ST.copy(c.email); } }, { label: 'Écrire un mail', icon: 'mail', href: 'mailto:' + c.email }]
      .concat(admin() ? ['-', out[c.email] ? { label: 'Réinscrire', icon: 'check', run: function(){ api('mailing/suppressions?email=' + encodeURIComponent(c.email), { method: 'DELETE' }).then(again); } } : { label: 'Désinscrire', icon: 'tag', run: function(){ api('mailing/suppressions', { method: 'POST', json: { email: c.email } }).then(again); } }, { label: 'Retirer de la liste', icon: 'trash', danger: true, run: function(){ if (confirm('Retirer ' + c.email + ' de la liste ?')) api('mailing/contacts?email=' + encodeURIComponent(c.email), { method: 'DELETE' }).then(again); } }] : []); }, c.name || c.email);
    if (out[c.email]) node('span', 'chip', t1, out[c.email]);
    else if (admin()){ var ub = node('button', 'btn small', t1, 'Désinscrire'); ub.addEventListener('click', function(){ api('mailing/suppressions', { method: 'POST', json: { email: c.email } }).then(function(r){ toast(r.ok ? c.email + ' ne recevra plus rien.' : err(r), !r.ok); again(); }); }); }
    if (admin()){ var x = node('button', 'sign x', t2, '×'); x.title = 'Retirer de la liste'; x.setAttribute('aria-label', 'Retirer ' + c.email); x.addEventListener('click', function(){ if (!confirm('Retirer ' + c.email + ' de la liste ?')) return; api('mailing/contacts?email=' + encodeURIComponent(c.email), { method: 'DELETE' }).then(again); }); }
  });
  adder();
}));

/* ---------- THE EDITOR OF THE INSTINCT STUDIO (nlEditor), carried here and kept to one row of tools:
   format, bold, italic, the two lists, link (an empty address takes the link out), image by its
   address, clear, source. What the row no longer holds (underline, strike, colour, alignment,
   table) is still written in Source.
   Left out from the start: the image from the Mac and YouTube (a mail's image needs a public
   address; a mail plays no video). ---------- */
function editor(host, html, onChange){
  var ed = node('div', 'editor', host), bar = node('div', 'ed-bar', ed);
  var fmt = node('select', '', bar); fmt.title = 'Format'; fmt.setAttribute('aria-label', 'Format'); [['', 'Format'], ['p', 'Texte'], ['h1', 'Grand titre'], ['h2', 'Titre'], ['h3', 'Sur-titre']].forEach(function(o){ var op = node('option', '', fmt, o[1]); op.value = o[0]; });
  var sep = function(){ node('span', 'ed-sep', bar); };
  var cmd = function(label, c, title, h){ var b = node('button', '', bar); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); if (h) b.innerHTML = h; else b.textContent = label; b.addEventListener('click', function(){ restore(); document.execCommand(c, false, null); save(); area.dispatchEvent(new Event('input')); }); return b; };
  sep(); cmd('B', 'bold', 'Gras', '<b>B</b>'); cmd('I', 'italic', 'Italique', '<i>I</i>');
  sep(); cmd('•', 'insertUnorderedList', 'Liste à puces'); cmd('1.', 'insertOrderedList', 'Liste numérotée');
  sep(); var ask = function(label, kind, title){ var b = node('button', '', bar, label); b.type = 'button'; b.title = title; b.addEventListener('click', function(){ save(); var old = bar.querySelector('.ed-pop'); if (old) old.remove();
    var pop = node('div', 'ed-pop', bar), inp = node('input', '', pop); inp.placeholder = kind === 'link' ? 'https://… (vide pour retirer le lien)' : 'https://… (l’adresse de l’image)'; inp.setAttribute('aria-label', title); var ok = node('button', 'btn primary small', pop, 'OK'); ok.type = 'button'; var no = node('button', 'btn small', pop, '✕'); no.type = 'button'; no.setAttribute('aria-label', 'Fermer'); no.addEventListener('click', function(){ pop.remove(); });
    var go = function(){ var url = inp.value.trim(); pop.remove(); restore();
      if (!url){ if (kind === 'link'){ document.execCommand('unlink', false, null); save(); area.dispatchEvent(new Event('input')); } return; }
      if (kind === 'link') document.execCommand('createLink', false, url);
      if (kind === 'image') document.execCommand('insertHTML', false, '<p><img src="' + url.replace(/"/g, '') + '" style="max-width:100%"></p>');
      save(); area.dispatchEvent(new Event('input')); };
    ok.addEventListener('click', go); inp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); go(); } }); inp.focus(); }); return b; };
  ask('Lien', 'link', 'Poser ou retirer un lien'); ask('Image', 'image', 'Une image par son adresse');
  sep(); cmd('Effacer', 'removeFormat', 'Effacer la mise en forme');
  var srcb = node('button', '', bar, 'Source'); srcb.type = 'button'; srcb.title = 'Le HTML du mail';
  var area = node('div', 'ed-area', ed); area.contentEditable = 'true'; area.innerHTML = html || '<p><br></p>'; area.spellcheck = true; area.setAttribute('role', 'textbox'); area.setAttribute('aria-multiline', 'true'); area.setAttribute('aria-label', 'Contenu du mail');
  var src = node('textarea', 'ed-src', ed); src.hidden = true; src.spellcheck = false; src.setAttribute('aria-label', 'HTML du mail');
  var range = null, save = function(){ var s = getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange(); }, restore = function(){ if (range){ var s = getSelection(); s.removeAllRanges(); s.addRange(range); } else area.focus(); };
  area.addEventListener('keyup', save); area.addEventListener('mouseup', save);
  fmt.addEventListener('change', function(){ if (fmt.value){ restore(); document.execCommand('formatBlock', false, fmt.value); fmt.value = ''; save(); area.dispatchEvent(new Event('input')); } });
  var empty = function(){ return !area.textContent.trim() && !area.querySelector('img, table, hr'); };
  var emit = function(){ onChange(empty() ? '' : area.innerHTML); area.toggleAttribute('data-vide', empty()); };
  area.addEventListener('input', emit); area.toggleAttribute('data-vide', empty());
  area.addEventListener('focus', function(){ if (!area.firstChild){ area.innerHTML = '<p><br></p>'; } });
  srcb.addEventListener('click', function(){ if (!src.hidden){ area.innerHTML = src.value; src.hidden = true; area.hidden = false; srcb.classList.remove('on'); emit(); } else { src.value = area.innerHTML; src.hidden = false; area.hidden = true; src.style.height = Math.max(160, area.offsetHeight) + 'px'; srcb.classList.add('on'); } });
  src.addEventListener('input', function(){ onChange(src.value); });
}
function hasBody(){ var t = txt(draft.contenu).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(); return !!t || /<(img|table)/i.test(txt(draft.contenu)) || draft.pieces.length > 0; }

/* the pieces of the catalogue, to put under the text: a search, a press adds or takes out */
function pickPieces(then){
  var back = node('div', 'picker', document.body), box = node('div', 'pick', back), head = node('div', 'pk-head', box);
  var q = node('input', '', head); q.type = 'search'; q.placeholder = 'Chercher une pièce'; q.setAttribute('aria-label', 'Chercher une pièce');
  var done = node('button', 'btn primary', head, 'Terminé'), list = node('div', 'list', box), foot = node('div', 'foot', box);
  var close = function(){ back.remove(); document.removeEventListener('keydown', esc); then(); }, esc = function(e){ if (e.key === 'Escape') close(); };
  done.addEventListener('click', close); back.addEventListener('click', function(e){ if (e.target === back) close(); }); document.addEventListener('keydown', esc);
  var paint = function(){
    list.innerHTML = ''; var s = q.value.trim().toLocaleLowerCase(), n = 0;
    ST.S.pieces.forEach(function(p){
      if (!p.rayon || (s && p.name.toLocaleLowerCase().indexOf(s) < 0)) return; n++;
      var on = draft.pieces.indexOf(p.slug) >= 0, row = node('button', 'row' + (on ? ' chosen' : ''), list), t = node('span', 'th', row); row.type = 'button'; row.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (p.image){ var im = node('img', '', t); im.alt = ''; im.loading = 'lazy'; im.src = '../site/' + p.image; }
      var nm = node('span', 'nm', row); node('b', '', nm, p.name); node('span', '', nm, p.price > 0 ? p.price.toLocaleString('fr-FR') + ' €' : 'Prix sur demande');
      node('span', 'k', row, on ? 'Dans le mail' : '');
      row.addEventListener('click', function(){ if (on) draft.pieces = draft.pieces.filter(function(x){ return x !== p.slug; }); else if (draft.pieces.length >= 12){ toast('Douze pièces au plus dans un mail.', true); return; } else draft.pieces.push(p.slug); paint(); });
    });
    if (!n) node('p', 'note', list, 'Rien ne correspond.');
    foot.textContent = plural(draft.pieces.length, 'pièce dans le mail', 'pièces dans le mail') + ', deux par rangée.';
  };
  q.addEventListener('input', paint); paint(); q.focus();
}

/* ---------- 2. Nouvel envoi: five steps from top to bottom, the mail as it arrives beside them ---------- */
ST.register('envoi', screen(function(host, again){
  var can = D.sender.configured, isAdmin = admin();
  ST.count(plural(D.reach, 'destinataire', 'destinataires'));
  var fromPieces = (sessionStorage.getItem('alaya-mail-pieces') || sessionStorage.getItem('alaya-mail-piece') || '').split(',').filter(Boolean), put = 0; sessionStorage.removeItem('alaya-mail-piece'); sessionStorage.removeItem('alaya-mail-pieces');
  fromPieces.forEach(function(sl){ if (draft.pieces.indexOf(sl) < 0 && draft.pieces.length < 12){ draft.pieces.push(sl); put++; } });
  if (put){ if (isAdmin) api('mailing/draft', { method: 'PUT', json: draft }); toast(put > 1 ? put + ' pièces sont dans le mail.' : 'La pièce est dans le mail.'); }
  var wrap = node('div', 'nlcompose', host), left = node('div', 'nlleft', wrap), right = node('div', 'nlright', wrap);
  var changed = function(){ clearTimeout(saveTimer); saveTimer = setTimeout(function(){ if (isAdmin) api('mailing/draft', { method: 'PUT', json: draft }); preview(); }, 500); };

  /* 1. the mail */
  var s1 = block(left, 'Le mail', 'Le brouillon s’enregistre tout seul.'), fs = node('div', 'fields sender', s1), sf = node('div', 'field', fs), sl = node('label', '', sf, 'Objet'); sl.htmlFor = 'mf-objet';
  var subj = node('input', '', sf); subj.id = 'mf-objet'; subj.value = draft.subject; subj.placeholder = 'Ce que la personne lit avant d’ouvrir'; subj.addEventListener('input', function(){ draft.subject = subj.value; changed(); });
  var cf = node('div', 'field', fs); node('label', '', cf, 'Contenu');
  editor(node('div', 'edhost', cf), draft.contenu, function(h){ draft.contenu = h; changed(); });
  node('div', 'fhint', cf, 'Écrivez {{prenom}} là où le prénom du contact doit paraître, {{nom}} pour son nom entier.');

  /* 2. the pieces put forward */
  var s2 = block(left, 'Les pièces', ''), pa = node('button', 'btn add', s2.head, draft.pieces.length ? 'Changer les pièces' : 'Choisir des pièces'), items = node('div', 'items', s2);
  var pieces = function(){
    items.innerHTML = ''; s2.count.textContent = draft.pieces.length ? plural(draft.pieces.length, 'pièce sous le texte', 'pièces sous le texte') : 'Facultatif : des pièces du catalogue, sous le texte.'; pa.textContent = draft.pieces.length ? 'Changer les pièces' : 'Choisir des pièces';
    draft.pieces.forEach(function(slug, k){
      var p = ST.S.pieces.filter(function(x){ return x.slug === slug; })[0]; if (!p) return;
      var it = node('div', 'item', items), t = node('span', 'th sq', it); if (p.image){ var im = node('img', '', t); im.alt = ''; im.src = '../site/' + p.image; }
      var nm = node('div', 'nm', it); node('b', '', nm, p.name); node('span', '', nm, p.price > 0 ? p.price.toLocaleString('fr-FR') + ' €' : 'Prix sur demande');
      if (k){ var up = node('button', 'sign', it, '↑'); up.title = 'Monter'; up.setAttribute('aria-label', 'Monter ' + p.name); up.addEventListener('click', function(){ draft.pieces.splice(k - 1, 0, draft.pieces.splice(k, 1)[0]); pieces(); changed(); }); }
      var x = node('button', 'sign x', it, '×'); x.title = 'Retirer du mail'; x.setAttribute('aria-label', 'Retirer ' + p.name); x.addEventListener('click', function(){ draft.pieces.splice(k, 1); pieces(); changed(); });
    });
  };
  pa.addEventListener('click', function(){ pickPieces(function(){ pieces(); changed(); }); }); pieces();

  /* 3. from whom, to whom */
  var s3 = block(left, 'À qui', ''), who = node('dl', 'who', s3), line = function(label, value, mute){ node('dt', '', who, label); return node('dd', mute ? 'mute' : '', who, value); };
  var fromLine = line('De', can ? D.sender.name + ' <' + D.sender.user + '>' : 'Aucune boîte d’envoi pour l’instant', !can);
  if (!can){ var door = node('button', 'btn small', fromLine, 'Renseigner la boîte d’envoi'); door.addEventListener('click', function(){ goTo('Boîte'); }); }
  line('À', D.reach ? plural(D.reach, 'personne', 'personnes') + ' de vos contacts' + (D.contacts.length - D.reach ? ', ' + plural(D.contacts.length - D.reach, 'adresse écartée', 'adresses écartées') + ' (désinscrite ou en échec)' : '') : 'Personne : la liste des contacts est vide', !D.reach);
  if (can) line('Aujourd’hui', 'encore ' + plural(D.remaining, 'envoi possible', 'envois possibles') + ' (plafond de ' + D.cap + ' par 24 h)', true);

  /* the mail as the person receives it, desktop or phone width */
  var pv = node('div', 'nlvivant' + (phone ? ' tel' : ''), right), pvh = node('div', 'nlvivant-head', pv); node('b', '', pvh, 'Ce que la personne reçoit'); node('span', 'spacer', pvh);
  var vt = node('div', 'ptabs', pvh); [[false, 'Ordinateur'], [true, 'Téléphone']].forEach(function(w){ var b = node('button', w[0] === phone ? 'cur' : '', vt, w[1]); b.type = 'button'; b.addEventListener('click', function(){ phone = w[0]; pv.classList.toggle('tel', phone); Array.prototype.forEach.call(vt.querySelectorAll('button'), function(x){ x.classList.toggle('cur', x === b); }); }); });
  var frame = node('iframe', 'nlpreview', pv); frame.setAttribute('sandbox', 'allow-same-origin'); frame.title = 'Aperçu du mail';
  node('p', 'note', right, 'Dans l’aperçu, le logo et les photos sont lus sur ce Mac. Dans le mail, ils viennent de ' + D.origin.replace('https://', '') + ' : ils s’affichent chez la personne une fois le nouveau site en ligne à cette adresse.');
  /* in the preview only, the site's pictures are read from this Mac, so the mail shows whole before the site is live */
  var preview = function(){ api('mailing/preview', { method: 'POST', json: draft }).then(function(r){ if (r.ok) frame.srcdoc = r.body.html.split(D.origin + '/images/').join('../site/images/'); }); };
  preview();
  if (!isAdmin){ node('p', 'note', left, 'Votre compte lit le mailing. L’essai et l’envoi sont réservés aux administrateurs.'); return; }

  /* 4. a test first */
  var ready = function(){ if (!draft.subject.trim() || !hasBody()){ toast('Il faut un objet et un contenu.', true); subj.focus(); return false; } return true; };
  var s4 = block(left, 'Un essai d’abord', 'Le mail part à une seule adresse, la vôtre.'), tl = node('div', 'tryline', s4), tlb = node('label', '', tl, 'Votre adresse'); tlb.htmlFor = 'mf-essai';
  var ti = node('input', '', tl); ti.id = 'mf-essai'; ti.type = 'email'; ti.placeholder = 'vous@exemple.fr'; try { ti.value = localStorage.getItem('alaya-mail-essai') || ''; } catch (e){}
  var tst = node('button', 'btn', tl, 'Envoyer l’essai'); tst.disabled = !can;
  tst.addEventListener('click', function(){ if (!ready()) return; if (!ti.value.trim()){ toast('Tapez l’adresse qui reçoit l’essai.', true); ti.focus(); return; } try { localStorage.setItem('alaya-mail-essai', ti.value.trim()); } catch (e){}
    tst.disabled = true; api('mailing/test', { method: 'POST', json: { to: ti.value.trim(), subject: draft.subject, contenu: draft.contenu, pieces: draft.pieces } }).then(function(r){ tst.disabled = false; toast(r.ok ? 'Essai parti vers ' + r.body.to + '.' : 'L’essai n’est pas parti : ' + err(r), !r.ok); }); });

  /* 5. THE SEND. Nothing leaves on a single press; the word is typed, and the program checks it again with the count */
  var s5 = block(left, 'L’envoi', ''), box = node('div', 'sendbox', s5), sb = node('div', 'sendtext', box);
  node('b', '', sb, D.reach ? 'Ce mail partira à ' + plural(D.reach, 'personne', 'personnes') + '.' : 'Personne à qui écrire pour l’instant.');
  node('span', '', sb, !can ? 'Renseignez d’abord la boîte d’envoi : rien ne peut partir sans elle.' : 'Ce qui est parti ne se rattrape pas. Le studio vous demandera de taper le mot ENVOYER.');
  var snd = node('button', 'mark sendgo', box, D.reach ? 'Envoyer à ' + plural(D.reach, 'personne', 'personnes') : 'Envoyer'); snd.disabled = !can || !D.reach;
  snd.addEventListener('click', function(){ if (!ready()) return;
    var word = window.prompt('Envoyer « ' + draft.subject.trim() + ' » à ' + plural(D.reach, 'personne', 'personnes') + ' depuis ' + D.sender.user + ' ?\n\nPour envoyer, tapez ENVOYER en capitales.');
    if (word === null) return; if (word.trim() !== 'ENVOYER'){ toast('Rien n’est parti : le mot tapé n’est pas ENVOYER.', true); return; }
    snd.disabled = true;
    api('mailing/send', { method: 'POST', json: { subject: draft.subject, contenu: draft.contenu, pieces: draft.pieces, confirm: 'ENVOYER', count: D.reach } }).then(function(r){
      snd.disabled = false; if (!r.ok){ toast('Rien n’est parti : ' + err(r), true); again(); return; }
      toast('En file : ' + plural(r.body.added, 'adresse', 'adresses') + '. Le suivi est dans Envois.'); again(); });
  });
}));

/* ---------- 3. Envois: what left, to how many, when, with what result ---------- */
function pct(n, base){ return n && base ? ' (' + Math.round(n / base * 100) + ' %)' : ''; }
ST.register('envois', screen(function(host, again){
  ST.count(D.campaigns.length ? plural(D.campaigns.length, 'envoi', 'envois') : '');
  /* the figures exist only for the sends that left with a public address; the screen says which case this is */
  var figures = D.tracking || D.campaigns.some(function(c){ return c.tracked; });
  if (!D.campaigns.length){
    var em = node('div', 'empty', host); node('b', '', em, 'Rien n’est encore parti'); node('span', 'sub', em, 'Chaque envoi paraîtra ici : son objet, à combien de personnes, quand, et ce qu’il est devenu.');
    if (admin()){ var go = node('button', 'btn primary', em, 'Écrire un envoi'); go.addEventListener('click', function(){ goTo('Nouvel envoi'); }); }
    return;
  }
  var b = block(host, 'Les envois', lastBounces ? 'Dernière lecture des retours : ' + lastBounces : 'Le plus récent en premier. Une ligne s’ouvre sur ses destinataires.');
  if (admin()){ var lr = node('button', 'btn add', b.head, 'Lire les retours'); lr.title = 'Lit dans la boîte d’envoi les mails revenus pour adresse inexistante';
    lr.addEventListener('click', function(){ lr.disabled = true; b.count.textContent = 'Lecture de la boîte…'; api('mailing/bounces', { method: 'POST' }).then(function(r){ lr.disabled = false;
      if (!r.ok){ b.count.textContent = ''; toast('Les retours ne se lisent pas : ' + err(r), true); return; }
      var x = r.body, parts = [plural(x.read, 'retour lu', 'retours lus'), plural(x.bounced.length, 'adresse en échec', 'adresses en échec') + (x.bounced.length ? ' (' + x.bounced.join(', ') + ')' : '')];
      if (x.delayed) parts.push(x.delayed + ' simple' + (x.delayed > 1 ? 's' : '') + ' retard' + (x.delayed > 1 ? 's' : '')); if (x.already) parts.push(x.already + ' déjà lu' + (x.already > 1 ? 's' : '')); if (x.unknown) parts.push(x.unknown + ' pour une adresse hors de nos envois'); if (x.unreadable) parts.push(x.unreadable + ' illisible' + (x.unreadable > 1 ? 's' : ''));
      lastBounces = parts.join(', ') + '.'; toast(lastBounces); again(); }); }); }
  var tb = table(b, [['Envoi', 'mail'], ['Résultat', 'status']].concat(figures ? [['Ouverts', 'number'], ['Cliqués', 'number'], ['Désinscrits', 'number']] : [], [['État', 'status']])), detail = node('div', 'nldetail', host), live = false;
  D.campaigns.forEach(function(c){
    var st = c.stats || {}, tr = node('tr', '', tb), stuck = (c.status === 'queued' || c.status === 'sending' || c.status === 'paused') && st.queued > 0 && !D.draining, bad = (st.failed || 0) + (st.bounced || 0);
    if ((c.status === 'queued' || c.status === 'sending') && D.draining) live = true;
    tr.tabIndex = 0; tr.setAttribute('aria-label', 'Voir les destinataires de ' + c.subject);
    var first = node('td', 'first two', tr); node('b', '', first, c.subject); node('span', '', first, when(c.createdAt));   /* what left, and when */
    /* the result in words: how many left, and what did not */
    var res = node('td', 'result', tr); node('span', '', res, (st.sent || 0) === (st.total || 0) ? (st.total > 1 ? 'Parti aux ' + st.total + ' personnes' : 'Parti à la personne') : plural(st.sent || 0, 'parti', 'partis') + ' sur ' + (st.total || 0));
    if (bad) node('span', 'chip bad', res, plural(bad, 'échec', 'échecs')); if (st.skipped) node('span', 'chip', res, plural(st.skipped, 'sauté', 'sautés')); if (st.queued) node('span', 'chip', res, st.queued + ' en file');
    if (figures){ if (c.tracked){ node('td', 'num', tr, (st.opened || 0) + pct(st.opened, st.sent)); node('td', 'num', tr, (st.clicked || 0) + pct(st.clicked, st.sent)); node('td', 'num', tr, String(st.unsubscribed || 0)); } else { var nt = node('td', 'mute', tr, 'parti sans suivi'); nt.colSpan = 3; } }
    /* the state says why a queue waits: the day's ceiling, or a stop of the program */
    var sc = node('td', 'state', tr);
    if (c.status === 'paused') node('span', 'why', sc, 'En pause : le plafond de ' + plural(D.cap, 'envoi', 'envois') + ' par 24 h a été atteint.');
    else if (stuck) node('span', 'why', sc, 'Interrompu avant la fin.');
    else node('span', 'chip' + (c.status === 'sending' || c.status === 'queued' ? ' on' : ''), sc, STATUS[c.status] || c.status);
    var cell = node('span', 'acts', sc), act = function(a){ api('mailing/campaigns/' + c.id + '/' + a, { method: 'POST' }).then(function(r){ if (!r.ok) toast(err(r), true); again(); }); };
    if (admin() && stuck){ var rb = node('button', 'btn small', cell, 'Reprendre'); rb.addEventListener('click', function(e){ e.stopPropagation(); if (window.prompt('Reprendre l’envoi « ' + c.subject + ' » : ' + st.queued + ' adresses restent. Tapez ENVOYER.') === 'ENVOYER') act('run'); }); }
    if (admin() && c.status !== 'done' && c.status !== 'cancelled'){ var cb = node('button', 'btn small danger', cell, 'Annuler'); cb.addEventListener('click', function(e){ e.stopPropagation(); if (confirm('Annuler cet envoi ? Ce qui est parti est parti.')) act('cancel'); }); }
    var openIt = function(){ api('mailing/campaigns/' + c.id).then(function(r){
      if (!r.ok) return; Array.prototype.forEach.call(tb.querySelectorAll('tr'), function(x){ x.classList.toggle('cur', x === tr); });
      detail.innerHTML = ''; var h = node('div', 'sec', detail); node('h3', '', h, 'Les destinataires'); node('span', 'count', h, c.subject);
      var trk = r.body.tracked, t2 = table(detail, ['Adresse', 'Nom', 'État', 'Parti le'].concat(trk ? ['Ouvert', 'Clics'] : [], ['']));
      r.body.recipients.forEach(function(x){ var r2 = node('tr', 'plain', t2); node('td', 'first', r2, x.email); node('td', 'mute', r2, x.name || '');
        node('td', 'mute', r2, x.status === 'queued' && r.body.status === 'cancelled' ? 'pas parti (envoi annulé)' : (RSTATUS[x.status] || x.status) + (x.unsubscribedAt ? ' le ' + when(x.unsubscribedAt) : '')); node('td', 'mute', r2, when(x.sentAt));
        if (trk){ node('td', 'mute', r2, x.opens ? when(x.openedAt) + (x.opens > 1 ? ' (' + x.opens + ' fois)' : '') : ''); node('td', 'num', r2, x.clicks ? String(x.clicks) : ''); }
        node('td', 'mute', r2, x.error || '').style.whiteSpace = 'normal'; });
      detail.scrollIntoView({ block: 'nearest' }); }); };
    tr.addEventListener('click', openIt); tr.addEventListener('keydown', function(e){ if (e.target === tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openIt(); } });
  });
  node('p', 'note', b, figures
    ? 'Les ouvertures sont un ordre de grandeur : une messagerie qui bloque les images n’est pas comptée, une messagerie qui les charge d’avance (Apple Mail, Gmail) compte une ouverture que personne n’a faite. Les clics et les désinscriptions sont exacts.'
    : 'Les ouvertures et les clics ne sont pas comptés : le studio tourne sur ce Mac, le mail ne peut pas lui répondre. Ils le seront quand le studio sera sur un serveur.');
  if (live) pollTimer = setTimeout(again, 4000);   /* a send in progress repaints the counts */
}));

/* ---------- 4. Boite d'envoi (Instinct's Sender box) ---------- */
ST.register('mail-boite', screen(function(host, again){
  var s = D.sender; ST.count(!s.user ? 'Pas encore renseignée' : (!s.passSet ? 'Mot de passe manquant' : 'Prête'));
  node('p', 'lead', host, 'L’adresse d’où partent les mails, et son mot de passe d’application.');
  var b = block(host, 'La boîte', ''), fs = node('div', 'fields sender', b);
  var user = fieldRow(fs, 'Adresse', s.user, { half: true, type: 'email', placeholder: 'contact@alayafinejewelry.com', hint: 'Les mails partent de cette adresse.' });
  var name = fieldRow(fs, 'Nom affiché', s.name, { half: true, placeholder: 'Alaya Fine Jewelry', hint: 'Ce que la personne lit comme expéditeur.' });
  var pass = fieldRow(fs, 'Mot de passe d’application', '', { type: 'password', autocomplete: 'new-password', placeholder: s.passSet ? '••••••••••••••••' : 'abcd efgh ijkl mnop', hint: (s.passSet ? 'Un mot de passe est enregistré : laissez vide pour le garder. ' : '') + 'Gmail : myaccount.google.com/apppasswords, avec la validation en deux étapes. Pas le mot de passe du compte.' });
  var b2 = block(host, 'Les serveurs', 'Déjà remplis pour Gmail.'), fs2 = node('div', 'fields sender', b2);
  var hostI = fieldRow(fs2, 'Serveur d’envoi', s.host, { half: true, placeholder: 'smtp.gmail.com' });
  var port = fieldRow(fs2, 'Port d’envoi', String(s.port), { half: true, placeholder: '587', hint: '587 ou 465.' });
  var imapH = fieldRow(fs2, 'Serveur de réception', s.imapHost, { half: true, placeholder: 'imap.gmail.com', hint: 'Pour « Lire les retours », dans Envois : les mails revenus pour adresse inexistante.' });
  var imapP = fieldRow(fs2, 'Port de réception', String(s.imapPort), { half: true, placeholder: '993' });
  if (!admin()) return;
  var acts = node('div', 'actions marks', host), sv = node('button', 'btn primary', acts, 'Enregistrer'), ck = node('button', 'btn', acts, 'Tester la connexion'), say = node('span', 'note', acts, 'Le test ouvre la connexion et s’identifie. Aucun mail ne part.');
  var save = function(){ var body = { user: user.value.trim(), name: name.value.trim(), host: hostI.value.trim(), port: port.value.trim(), imapHost: imapH.value.trim(), imapPort: imapP.value.trim() }; if (pass.value.trim()) body.pass = pass.value; return api('mailing/settings', { method: 'POST', json: body }); };
  sv.addEventListener('click', function(){ save().then(function(r){ toast(r.ok ? 'Boîte d’envoi enregistrée.' : err(r), !r.ok); if (r.ok) again(); }); });
  ck.addEventListener('click', function(){ say.textContent = 'Connexion…'; ck.disabled = true; save().then(function(r){ if (!r.ok){ ck.disabled = false; say.textContent = err(r); return; } return api('mailing/settings/verify', { method: 'POST' }).then(function(rr){ ck.disabled = false; pass.value = ''; say.textContent = rr.ok ? 'Connexion acceptée pour ' + rr.body.user + '.' : 'Refusée : ' + err(rr); toast(rr.ok ? 'La boîte répond, elle peut envoyer. Aucun mail n’est parti.' : 'La boîte ne répond pas : ' + err(rr), !rr.ok); }); }); });
}));

/* ---------- 5. Desinscrits (Instinct's Unsubscribed) ---------- */
ST.register('mail-desinscrits', screen(function(host, again){
  ST.count(D.suppressions.length ? plural(D.suppressions.length, 'adresse', 'adresses') : '');
  node('p', 'lead', host, 'Les adresses auxquelles on n’écrit plus.' + (D.tracking ? '' : ' Un mail « Désinscription » dans la boîte d’envoi : l’adresse s’ajoute ici.'));
  if (admin()){
    var a = block(host, 'Désinscrire une adresse', ''), tl = node('div', 'tryline', a), lb = node('label', '', tl, 'Adresse'); lb.htmlFor = 'mf-desinscrire';
    var inp = node('input', '', tl); inp.id = 'mf-desinscrire'; inp.type = 'email'; inp.placeholder = 'nom@exemple.fr';
    var add = node('button', 'btn primary', tl, 'Désinscrire'); add.addEventListener('click', function(){ var m = inp.value.trim(); if (!m){ inp.focus(); return; } api('mailing/suppressions', { method: 'POST', json: { email: m } }).then(function(r){ toast(r.ok ? m + ' ne recevra plus rien.' : err(r), !r.ok); if (r.ok) again(); }); });
  }
  var b = block(host, 'La liste', D.suppressions.length ? 'Les adresses en échec viennent de « Lire les retours », dans Envois.' : '');
  if (!D.suppressions.length){ var em = node('div', 'empty', b); node('b', '', em, 'Personne ne s’est désinscrit'); node('span', 'sub', em, 'Une adresse désinscrite, ou revenue en échec, paraîtra ici et ne recevra plus rien.'); return; }
  var reasons = { unsubscribe: 'désinscrit', bounce: 'adresse en échec', manual: 'retiré à la main' }, tb = table(b, ['Adresse', 'Raison', 'Depuis', '']);
  D.suppressions.forEach(function(x){ var tr = node('tr', 'plain', tb); node('td', 'first', tr, x.email); node('td', 'mute', tr, reasons[x.reason] || x.reason || ''); node('td', 'mute', tr, when(x.at)); var td = node('td', 'door', tr);
    if (admin()){ var rm = node('button', 'btn small', td, 'Réinscrire'); rm.addEventListener('click', function(){ if (!confirm('Réinscrire ' + x.email + ' ? La personne recevra de nouveau les envois.')) return; api('mailing/suppressions?email=' + encodeURIComponent(x.email), { method: 'DELETE' }).then(function(r){ toast(r.ok ? x.email + ' recevra de nouveau les envois.' : err(r), !r.ok); again(); }); }); } });
}));
})();
