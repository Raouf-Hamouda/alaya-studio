/* ===========================================================
   LE MAILING DU STUDIO ALAYA (4 octobre 2026), sur la newsletter du studio Instinct.
   Cinq ecrans : Contacts, Nouvel envoi, Envois, Boite d'envoi, Desinscrits.
   Tout passe par les routes /api/mailing/... (mailing.js cote programme).

   Repris d'Instinct : l'editeur (nlEditor), la mise en page ecrire a gauche / le
   mail tel qu'il arrive a droite, l'ecran de la boite d'envoi, celui des desinscrits.
   Ecrit ici : les contacts avec leur nom et l'import CSV, les pieces du catalogue
   posees dans le mail, l'essai a une adresse tapee, l'envoi derriere un mot tape.
   Absent, et dit dans l'ecran : ouvertures et clics (il faut un serveur public).
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
  { group: 'Réglages' }, { label: 'Boîte d’envoi', key: 'mail-boite' }, { label: 'Désinscrits', key: 'mail-desinscrits' }
]);

function when(iso){ if (!iso) return ''; var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR') + ' ' + d.toTimeString().slice(0, 5); }
function plural(n, one, many){ return n + ' ' + (n > 1 ? many : one); }
function admin(){ return ST.S.me && ST.S.me.role === 'admin'; }
function err(r){ return (r.body && r.body.error) || String(r.status); }
function load(){ return api('mailing/state').then(function(r){ if (r.ok){ D = r.body; if (!draft) draft = { subject: txt(D.draft.subject), contenu: txt(D.draft.contenu), pieces: (D.draft.pieces || []).slice() }; } return r; }); }
/* every screen: read the state, then draw; a failed read says so in the page */
function screen(draw){
  return function(host){
    clearTimeout(pollTimer);
    var paint = function(){ host.innerHTML = ''; draw(host, function(){ load().then(paint); }); };
    load().then(function(r){ if (!r.ok){ host.innerHTML = ''; node('p', 'note', host, 'Le mailing ne se lit pas : ' + err(r)); return; } paint(); });
  };
}
function block(host, title, count){ var b = node('div', 'block', host), h = node('div', 'sec', b); node('h3', '', h, title); var c = node('span', 'count', h, count || ''); b.head = h; b.count = c; return b; }
function table(box, heads){ var w = node('div', 'tablewrap inner scroll', box), t = node('table', 'table', w), hr = node('tr', '', node('thead', '', t)); heads.forEach(function(x){ node('th', '', hr, x); }); return node('tbody', '', t); }
function fieldRow(box, label, value, opts){
  opts = opts || {};
  var f = node('div', 'field', box); node('label', '', f, label);
  var i = node('input', '', f); i.type = opts.type || 'text'; i.value = value || ''; if (opts.placeholder) i.placeholder = opts.placeholder; if (opts.autocomplete) i.autocomplete = opts.autocomplete; i.disabled = !admin();
  if (opts.hint) node('div', 'fhint', f, opts.hint);
  return i;
}

/* ---------- 1. Contacts ---------- */
ST.register('contacts', screen(function(host, again){
  var out = {}; D.suppressions.forEach(function(s){ out[s.email] = s.reason === 'bounce' ? 'adresse en échec' : 'désinscrit'; });
  ST.count(plural(D.contacts.length, 'adresse', 'adresses'));
  var b = block(host, 'La liste', plural(D.reach, 'personne recevra', 'personnes recevront') + ' le prochain envoi');
  if (!D.contacts.length){ var em = node('div', 'empty', b); node('b', '', em, 'Aucun contact'); node('span', 'sub', em, 'Collez des adresses ci-dessous, ou importez un fichier CSV.'); }
  else {
    var tb = table(b, ['Adresse', 'Nom', 'Ajouté le', '', '']);
    D.contacts.forEach(function(c){
      var tr = node('tr', 'plain', tb); node('td', 'first', tr, c.email); node('td', 'mute', tr, c.name || ''); node('td', 'mute', tr, when(c.addedAt));
      var t1 = node('td', 'mute', tr), t2 = node('td', 'door', tr);
      if (out[c.email]) node('span', 'chip', t1, out[c.email]);
      else if (admin()){ var ub = node('button', 'btn small', t1, 'Désinscrire'); ub.addEventListener('click', function(){ api('mailing/suppressions', { method: 'POST', json: { email: c.email } }).then(function(r){ toast(r.ok ? c.email + ' ne recevra plus rien.' : err(r), !r.ok); again(); }); }); }
      if (admin()){ var x = node('button', 'sign x', t2, '×'); x.title = 'Retirer de la liste'; x.setAttribute('aria-label', 'Retirer ' + c.email); x.addEventListener('click', function(){ if (!confirm('Retirer ' + c.email + ' de la liste ?')) return; api('mailing/contacts?email=' + encodeURIComponent(c.email), { method: 'DELETE' }).then(again); }); }
    });
  }
  if (!admin()) return;
  var a = block(host, 'Ajouter', 'une adresse par ligne ; le nom peut suivre ou précéder');
  var ta = node('textarea', 'nlarea', a); ta.rows = 4; ta.spellcheck = false; ta.placeholder = 'Claire Martin, claire@exemple.fr\nClaire Martin <claire@exemple.fr>\nclaire@exemple.fr';
  var row = node('div', 'marks', a), add = node('button', 'mark', row, 'Ajouter à la liste'), imp = node('label', 'btn', row, 'Importer un CSV'), fi = node('input', '', imp); fi.type = 'file'; fi.accept = '.csv,.txt,text/csv,text/plain'; fi.hidden = true;
  node('span', 'note', row, lastImport ? 'Dernier ajout : ' + lastImport : 'Une adresse déjà présente n’est pas ajoutée deux fois.');
  var send = function(text){ if (!text.trim()){ toast('Tapez ou collez des adresses d’abord.', true); ta.focus(); return; } api('mailing/contacts', { method: 'POST', json: { add: text } }).then(function(r){ if (!r.ok){ toast(err(r), true); return; } var b2 = r.body, parts = [plural(b2.added, 'adresse ajoutée', 'adresses ajoutées'), b2.already + ' déjà là'];
    if (b2.ignored) parts.push(plural(b2.ignored, 'ligne sans adresse valide', 'lignes sans adresse valide'));
    if (b2.unsubscribed) parts.push(b2.unsubscribed + (b2.unsubscribed > 1 ? ' déjà désinscrites, elles le restent' : ' déjà désinscrite, elle le reste'));
    lastImport = parts.join(', ') + '.'; toast(lastImport); again(); }); };
  add.addEventListener('click', function(){ send(ta.value); });
  fi.addEventListener('change', function(){ var f = fi.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function(){ send(String(rd.result)); }; rd.readAsText(f); fi.value = ''; });
}));

/* ---------- THE EDITOR OF THE INSTINCT STUDIO (nlEditor), carried here: format, bold, italic, underline,
   strike, colour, lists, alignment, link, image by its address, table, clear, source. Left out: the
   image from the Mac and YouTube (a mail's image needs a public address; a mail plays no video). ---------- */
function editor(host, html, onChange){
  var ed = node('div', 'editor full', host), bar = node('div', 'ed-bar', ed);
  var fmt = node('select', '', bar); fmt.title = 'Format'; [['', 'Format'], ['p', 'Normal'], ['h1', 'Titre 1'], ['h2', 'Titre 2'], ['h3', 'Titre 3']].forEach(function(o){ var op = node('option', '', fmt, o[1]); op.value = o[0]; });
  var sep = function(){ node('span', 'ed-sep', bar); };
  var cmd = function(label, c, title, h){ var b = node('button', '', bar); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); if (h) b.innerHTML = h; else b.textContent = label; b.addEventListener('click', function(){ restore(); document.execCommand(c, false, null); save(); area.dispatchEvent(new Event('input')); }); return b; };
  sep(); cmd('B', 'bold', 'Gras', '<b>B</b>'); cmd('I', 'italic', 'Italique', '<i>I</i>'); cmd('U', 'underline', 'Souligné', '<u>U</u>'); cmd('S', 'strikeThrough', 'Barré', '<s>S</s>');
  var col = node('label', 'ed-color', bar, 'A'); col.title = 'Couleur du texte'; var ci = node('input', '', col); ci.type = 'color'; ci.value = '#000000'; ci.setAttribute('aria-label', 'Couleur du texte'); ci.addEventListener('input', function(){ restore(); document.execCommand('foreColor', false, ci.value); save(); area.dispatchEvent(new Event('input')); });
  sep(); cmd('1.', 'insertOrderedList', 'Liste numérotée'); cmd('•', 'insertUnorderedList', 'Liste à puces');
  sep(); cmd('⟝', 'justifyLeft', 'Aligner à gauche'); cmd('☰', 'justifyCenter', 'Centrer'); cmd('⟞', 'justifyRight', 'Aligner à droite');
  sep(); var ask = function(label, kind, title){ var b = node('button', '', bar, label); b.type = 'button'; b.title = title; b.addEventListener('click', function(){ save(); var old = bar.querySelector('.ed-pop'); if (old) old.remove();
    var pop = node('div', 'ed-pop', bar), inp = node('input', '', pop); inp.placeholder = kind === 'link' ? 'https://… (le lien)' : 'https://… (l’adresse de l’image)'; inp.setAttribute('aria-label', title); var ok = node('button', 'btn primary small', pop, 'OK'); ok.type = 'button'; var no = node('button', 'btn small', pop, '✕'); no.type = 'button'; no.setAttribute('aria-label', 'Fermer'); no.addEventListener('click', function(){ pop.remove(); });
    var go = function(){ var url = inp.value.trim(); pop.remove(); if (!url) return; restore();
      if (kind === 'link') document.execCommand('createLink', false, url);
      if (kind === 'image') document.execCommand('insertHTML', false, '<p><img src="' + url.replace(/"/g, '') + '" style="max-width:100%"></p>');
      save(); area.dispatchEvent(new Event('input')); };
    ok.addEventListener('click', go); inp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); go(); } }); inp.focus(); }); return b; };
  ask('Lien', 'link', 'Lien'); cmd('⊘', 'unlink', 'Retirer le lien'); ask('Image', 'image', 'Une image par son adresse');
  var tb = node('button', '', bar, 'Tableau'); tb.type = 'button'; tb.title = 'Tableau'; tb.addEventListener('click', function(){ restore(); document.execCommand('insertHTML', false, '<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table><p></p>'); save(); area.dispatchEvent(new Event('input')); });
  sep(); cmd('Tx', 'removeFormat', 'Effacer la mise en forme');
  var srcb = node('button', '', bar, 'Source'); srcb.type = 'button'; srcb.title = 'Le HTML';
  var area = node('div', 'ed-area', ed); area.contentEditable = 'true'; area.innerHTML = html || '<p><br></p>'; area.spellcheck = true; area.setAttribute('role', 'textbox'); area.setAttribute('aria-label', 'Contenu du mail');
  var src = node('textarea', 'ed-src', ed); src.hidden = true; src.spellcheck = false;
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
  var done = node('button', 'btn primary small', head, 'Terminé'), list = node('div', 'list', box), foot = node('div', 'foot', box);
  var close = function(){ back.remove(); document.removeEventListener('keydown', esc); then(); }, esc = function(e){ if (e.key === 'Escape') close(); };
  done.addEventListener('click', close); back.addEventListener('click', function(e){ if (e.target === back) close(); }); document.addEventListener('keydown', esc);
  var paint = function(){
    list.innerHTML = ''; var s = q.value.trim().toLocaleLowerCase(), n = 0;
    ST.S.pieces.forEach(function(p){
      if (!p.rayon || (s && p.name.toLocaleLowerCase().indexOf(s) < 0)) return; n++;
      var on = draft.pieces.indexOf(p.slug) >= 0, row = node('button', 'row' + (on ? ' chosen' : ''), list), t = node('span', 'th', row); row.type = 'button';
      if (p.image){ var im = node('img', '', t); im.alt = ''; im.loading = 'lazy'; im.src = '../site/' + p.image; }
      var nm = node('span', 'nm', row); node('b', '', nm, p.name); node('span', '', nm, p.price > 0 ? p.price.toLocaleString('fr-FR') + ' €' : 'Prix sur demande');
      node('span', 'k', row, on ? 'dans le mail' : '');
      row.addEventListener('click', function(){ if (on) draft.pieces = draft.pieces.filter(function(x){ return x !== p.slug; }); else if (draft.pieces.length >= 12){ toast('Douze pièces au plus dans un mail.', true); return; } else draft.pieces.push(p.slug); paint(); });
    });
    if (!n) node('p', 'note', list, 'Rien ne correspond.');
    foot.textContent = plural(draft.pieces.length, 'pièce dans le mail', 'pièces dans le mail') + ', deux par rangée.';
  };
  q.addEventListener('input', paint); paint(); q.focus();
}

/* ---------- 2. Nouvel envoi ---------- */
ST.register('envoi', screen(function(host, again){
  var can = D.sender.configured, isAdmin = admin();
  ST.count(plural(D.reach, 'destinataire', 'destinataires'));
  if (!can) node('p', 'note', host, 'La boîte d’envoi n’est pas renseignée : rien ne peut partir. Le mail s’écrit et se prévisualise quand même.');
  var wrap = node('div', 'nlcompose', host), left = node('div', 'nlleft', wrap), right = node('div', 'nlright', wrap);
  var changed = function(){ clearTimeout(saveTimer); saveTimer = setTimeout(function(){ if (isAdmin) api('mailing/draft', { method: 'PUT', json: draft }); preview(); }, 500); };
  var fs = node('div', 'fields', left), sf = node('div', 'field', fs); node('label', '', sf, 'Objet');
  var subj = node('input', '', sf); subj.value = draft.subject; subj.placeholder = 'L’objet du mail'; subj.addEventListener('input', function(){ draft.subject = subj.value; changed(); });
  var cf = node('div', 'field tall', fs); node('label', '', cf, 'Contenu');
  editor(node('div', 'edhost', cf), draft.contenu, function(h){ draft.contenu = h; changed(); });
  node('div', 'fhint', fs, '{{prenom}} et {{nom}} sont remplacés par ceux du contact, quand il en a.');
  /* the pieces put forward */
  var ph = node('div', 'sec', left); node('h3', '', ph, 'Pièces du catalogue'); var pc = node('span', 'count', ph, ''), pa = node('button', 'btn small add', ph, '+ Choisir des pièces'), items = node('div', 'items', left);
  var pieces = function(){
    items.innerHTML = ''; pc.textContent = draft.pieces.length ? String(draft.pieces.length) : 'aucune';
    draft.pieces.forEach(function(slug, k){
      var p = ST.S.pieces.filter(function(x){ return x.slug === slug; })[0]; if (!p) return;
      var it = node('div', 'item', items), t = node('span', 'th sq', it); if (p.image){ var im = node('img', '', t); im.alt = ''; im.src = '../site/' + p.image; }
      var nm = node('div', 'nm', it); node('b', '', nm, p.name); node('span', '', nm, D.origin.replace('https://', '') + '/piece/' + p.slug + '/');
      if (k){ var up = node('button', 'sign', it, '↑'); up.title = 'Monter'; up.setAttribute('aria-label', 'Monter ' + p.name); up.addEventListener('click', function(){ draft.pieces.splice(k - 1, 0, draft.pieces.splice(k, 1)[0]); pieces(); changed(); }); }
      var x = node('button', 'sign x', it, '×'); x.title = 'Retirer du mail'; x.setAttribute('aria-label', 'Retirer ' + p.name); x.addEventListener('click', function(){ draft.pieces.splice(k, 1); pieces(); changed(); });
    });
  };
  pa.addEventListener('click', function(){ pickPieces(function(){ pieces(); changed(); }); }); pieces();
  /* the preview: the mail as the person receives it, desktop or phone width */
  var pv = node('div', 'nlvivant' + (phone ? ' tel' : ''), right), pvh = node('div', 'nlvivant-head', pv); node('b', '', pvh, 'Ce que la personne reçoit'); node('span', 'spacer', pvh);
  var vt = node('div', 'ptabs', pvh); [[false, 'Ordinateur'], [true, 'Téléphone']].forEach(function(w){ var b = node('button', w[0] === phone ? 'cur' : '', vt, w[1]); b.type = 'button'; b.addEventListener('click', function(){ phone = w[0]; pv.classList.toggle('tel', phone); Array.prototype.forEach.call(vt.querySelectorAll('button'), function(x){ x.classList.toggle('cur', x === b); }); }); });
  var frame = node('iframe', 'nlpreview', pv); frame.setAttribute('sandbox', 'allow-same-origin'); frame.title = 'Aperçu du mail';
  node('p', 'note', right, 'Dans l’aperçu, le logo et les photos sont lus sur ce Mac. Dans le mail, ils viennent de ' + D.origin.replace('https://', '') + ' : ils s’affichent chez la personne une fois le nouveau site en ligne à cette adresse.');
  /* in the preview only, the site's pictures are read from this Mac, so the mail shows whole before the site is live */
  var preview = function(){ api('mailing/preview', { method: 'POST', json: draft }).then(function(r){ if (r.ok) frame.srcdoc = r.body.html.split(D.origin + '/images/').join('../site/images/'); }); };
  preview();
  /* from, to, the test, the send */
  var from = node('div', 'marks', left); node('span', 'kind', from, 'De');
  node('span', 'fromv' + (can ? '' : ' mute'), from, can ? D.sender.name + ' <' + D.sender.user + '> · ' + D.remaining + ' envois possibles aujourd’hui' : 'Aucune boîte d’envoi');
  var to = node('div', 'marks', left); node('span', 'kind', to, 'À');
  node('span', 'fromv', to, plural(D.reach, 'personne', 'personnes') + ' de la liste' + (D.contacts.length - D.reach ? ' (' + plural(D.contacts.length - D.reach, 'désinscrit écarté', 'désinscrits écartés') + ')' : ''));
  if (!isAdmin) return;
  var ready = function(){ if (!draft.subject.trim() || !hasBody()){ toast('Il faut un objet et un contenu.', true); return false; } return true; };
  var tl = node('div', 'marks', left); node('span', 'kind', tl, 'Essai');
  var ti = node('input', 'inline', tl); ti.type = 'email'; ti.placeholder = 'votre adresse, pour voir le mail arriver'; ti.setAttribute('aria-label', 'Adresse pour l’essai'); try { ti.value = localStorage.getItem('alaya-mail-essai') || ''; } catch (e){}
  var tst = node('button', 'btn', tl, 'Envoyer un essai'); tst.disabled = !can;
  tst.addEventListener('click', function(){ if (!ready()) return; if (!ti.value.trim()){ toast('Tapez l’adresse qui reçoit l’essai.', true); ti.focus(); return; } try { localStorage.setItem('alaya-mail-essai', ti.value.trim()); } catch (e){}
    tst.disabled = true; api('mailing/test', { method: 'POST', json: { to: ti.value.trim(), subject: draft.subject, contenu: draft.contenu, pieces: draft.pieces } }).then(function(r){ tst.disabled = false; toast(r.ok ? 'Essai parti vers ' + r.body.to + '.' : 'L’essai n’est pas parti : ' + err(r), !r.ok); }); });
  var acts = node('div', 'actions marks', left), snd = node('button', 'mark', acts, 'Envoyer à ' + plural(D.reach, 'personne', 'personnes')); snd.disabled = !can || !D.reach;
  node('span', 'note', acts, 'L’envoi demande de taper le mot ENVOYER. Ce qui est parti est parti.');
  /* THE DOOR: nothing leaves on a single press; the word is typed, and the program checks it again with the count */
  snd.addEventListener('click', function(){ if (!ready()) return;
    var word = window.prompt('Envoyer « ' + draft.subject.trim() + ' » à ' + plural(D.reach, 'personne', 'personnes') + ' depuis ' + D.sender.user + ' ?\n\nPour envoyer, tapez ENVOYER en capitales.');
    if (word === null) return; if (word.trim() !== 'ENVOYER'){ toast('Rien n’est parti : le mot tapé n’est pas ENVOYER.', true); return; }
    snd.disabled = true;
    api('mailing/send', { method: 'POST', json: { subject: draft.subject, contenu: draft.contenu, pieces: draft.pieces, confirm: 'ENVOYER', count: D.reach } }).then(function(r){
      snd.disabled = false; if (!r.ok){ toast('Rien n’est parti : ' + err(r), true); again(); return; }
      toast('En file : ' + plural(r.body.added, 'adresse', 'adresses') + '. Le suivi est dans Envois.'); again(); });
  });
}));

/* ---------- 3. Envois ---------- */
function pct(n, base){ return n && base ? ' · ' + Math.round(n / base * 100) + ' %' : ''; }
ST.register('envois', screen(function(host, again){
  ST.count(plural(D.campaigns.length, 'envoi', 'envois'));
  /* the figures exist only for the sends that left with a public address; the screen says which case this is */
  var figures = D.tracking || D.campaigns.some(function(c){ return c.tracked; });
  node('p', 'note', host, figures
    ? 'Chaque envoi, le plus récent en premier. Les ouvertures sont un ordre de grandeur : une messagerie qui bloque les images n’est pas comptée, une messagerie qui les charge d’avance (Apple Mail, Gmail) compte une ouverture que personne n’a faite. Les clics et les désinscriptions sont exacts.'
    : 'Chaque envoi, le plus récent en premier. Les ouvertures et les clics ne sont pas comptés : le studio tourne sur ce Mac, le mail ne peut pas lui répondre. Ils le seront quand le studio sera sur un serveur.');
  var b = block(host, 'Les envois', '');
  if (admin()){ var lr = node('button', 'btn small add', b.head, 'Lire les retours'); lr.title = 'Lit dans la boîte d’envoi les mails revenus pour adresse inexistante';
    lr.addEventListener('click', function(){ lr.disabled = true; b.count.textContent = 'Lecture de la boîte…'; api('mailing/bounces', { method: 'POST' }).then(function(r){ lr.disabled = false;
      if (!r.ok){ b.count.textContent = ''; toast('Les retours ne se lisent pas : ' + err(r), true); return; }
      var x = r.body, parts = [plural(x.read, 'retour lu', 'retours lus'), plural(x.bounced.length, 'adresse en échec', 'adresses en échec') + (x.bounced.length ? ' (' + x.bounced.join(', ') + ')' : '')];
      if (x.delayed) parts.push(x.delayed + ' simple' + (x.delayed > 1 ? 's' : '') + ' retard' + (x.delayed > 1 ? 's' : '')); if (x.already) parts.push(x.already + ' déjà lu' + (x.already > 1 ? 's' : '')); if (x.unknown) parts.push(x.unknown + ' pour une adresse hors de nos envois'); if (x.unreadable) parts.push(x.unreadable + ' illisible' + (x.unreadable > 1 ? 's' : ''));
      lastBounces = parts.join(', ') + '.'; toast(lastBounces); again(); }); }); }
  if (lastBounces) b.count.textContent = 'Dernière lecture : ' + lastBounces;
  if (!D.campaigns.length){ var em = node('div', 'empty', b); node('b', '', em, 'Rien n’est encore parti'); return; }
  var tb = table(b, ['Quand', 'Objet', 'Partis'].concat(figures ? ['Ouverts', 'Cliqués', 'Désinscrits'] : [], ['En échec', 'Sautés', 'État', ''])), detail = node('div', 'nldetail', host), live = false;
  D.campaigns.forEach(function(c){
    var st = c.stats || {}, tr = node('tr', '', tb), stuck = (c.status === 'queued' || c.status === 'sending' || c.status === 'paused') && st.queued > 0 && !D.draining;
    if ((c.status === 'queued' || c.status === 'sending') && D.draining) live = true;
    node('td', 'mute', tr, when(c.createdAt)); node('td', 'first', tr, c.subject); node('td', 'num', tr, (st.sent || 0) + ' / ' + (st.total || 0));
    if (figures){ if (c.tracked){ node('td', 'num', tr, (st.opened || 0) + pct(st.opened, st.sent)); node('td', 'num', tr, (st.clicked || 0) + pct(st.clicked, st.sent)); node('td', 'num', tr, String(st.unsubscribed || 0)); } else { var nt = node('td', 'mute', tr, 'parti sans suivi'); nt.colSpan = 3; } }
    node('td', 'num', tr, String((st.failed || 0) + (st.bounced || 0))); node('td', 'num', tr, String(st.skipped || 0));
    /* the state says why a queue waits: the day's ceiling, or a stop of the program */
    node('td', 'mute', tr, c.status === 'paused' ? 'en pause : le plafond de ' + D.cap + ' envois par 24 h a été atteint, ' + st.queued + ' en file' : (stuck ? 'interrompu, ' + st.queued + ' en file' : (STATUS[c.status] || c.status)));
    var cell = node('td', 'door', tr), act = function(a){ api('mailing/campaigns/' + c.id + '/' + a, { method: 'POST' }).then(function(r){ if (!r.ok) toast(err(r), true); again(); }); };
    if (admin() && stuck){ var rb = node('button', 'btn small', cell, 'Reprendre'); rb.addEventListener('click', function(e){ e.stopPropagation(); if (window.prompt('Reprendre l’envoi « ' + c.subject + ' » : ' + st.queued + ' adresses restent. Tapez ENVOYER.') === 'ENVOYER') act('run'); }); }
    if (admin() && c.status !== 'done' && c.status !== 'cancelled'){ var cb = node('button', 'btn small danger', cell, 'Annuler'); cb.style.marginLeft = '8px'; cb.addEventListener('click', function(e){ e.stopPropagation(); if (confirm('Annuler cet envoi ? Ce qui est parti est parti.')) act('cancel'); }); }
    tr.addEventListener('click', function(){ api('mailing/campaigns/' + c.id).then(function(r){
      if (!r.ok) return; detail.innerHTML = ''; var h = node('div', 'sec', detail); node('h3', '', h, 'Les destinataires'); node('span', 'count', h, c.subject);
      var trk = r.body.tracked, t2 = table(detail, ['Adresse', 'Nom', 'État', 'Parti le'].concat(trk ? ['Ouvert', 'Clics'] : [], ['']));
      r.body.recipients.forEach(function(x){ var r2 = node('tr', 'plain', t2); node('td', 'first', r2, x.email); node('td', 'mute', r2, x.name || '');
        node('td', 'mute', r2, x.status === 'queued' && r.body.status === 'cancelled' ? 'pas parti (envoi annulé)' : (RSTATUS[x.status] || x.status) + (x.unsubscribedAt ? ' le ' + when(x.unsubscribedAt) : '')); node('td', 'mute', r2, when(x.sentAt));
        if (trk){ node('td', 'mute', r2, x.opens ? when(x.openedAt) + (x.opens > 1 ? ' (' + x.opens + ' fois)' : '') : ''); node('td', 'num', r2, x.clicks ? String(x.clicks) : ''); }
        node('td', 'mute', r2, x.error || '').style.whiteSpace = 'normal'; });
      detail.scrollIntoView({ block: 'nearest' }); }); });
  });
  if (live) pollTimer = setTimeout(again, 4000);   /* a send in progress repaints the counts */
}));

/* ---------- 4. Boite d'envoi (Instinct's Sender box) ---------- */
ST.register('mail-boite', screen(function(host, again){
  var s = D.sender; ST.count('');
  node('p', 'note', host, 'La boîte d’où partent les mails. Pour un Gmail ou un Google Workspace : l’adresse et son mot de passe d’application (les seize lettres que Google donne après la validation en deux étapes, pas le mot de passe du compte). Le mot de passe est gardé sur ce Mac et ne revient jamais à l’écran.');
  var b = block(host, 'Boîte d’envoi', !s.user ? 'Aucune adresse enregistrée' : (!s.passSet ? 'Mot de passe manquant' : 'Mot de passe enregistré'));
  var fs = node('div', 'fields sender', b);
  var user = fieldRow(fs, 'Adresse', s.user, { type: 'email', placeholder: 'contact@alayafinejewelry.com', hint: 'Les mails partent de cette adresse, et les désinscriptions y reviennent.' });
  var name = fieldRow(fs, 'Nom affiché', s.name, { placeholder: 'Alaya Fine Jewelry' });
  var pass = fieldRow(fs, 'Mot de passe', '', { type: 'password', autocomplete: 'new-password', placeholder: s.passSet ? '••••••••••••••••' : 'abcd efgh ijkl mnop', hint: s.passSet ? 'Laisser vide pour garder celui qui est enregistré.' : 'Les espaces sont ignorés.' });
  var hostI = fieldRow(fs, 'Serveur', s.host, { placeholder: 'smtp.gmail.com', hint: 'smtp.gmail.com pour un Gmail. Pour une autre boîte, le serveur SMTP de l’hébergeur.' });
  var port = fieldRow(fs, 'Port', String(s.port), { placeholder: '587', hint: '587 (STARTTLS) ou 465 (TLS).' });
  var imapH = fieldRow(fs, 'Serveur de réception', s.imapHost, { placeholder: 'imap.gmail.com', hint: 'IMAP, pour « Lire les retours » dans Envois : les mails revenus pour adresse inexistante. Même adresse, même mot de passe.' });
  var imapP = fieldRow(fs, 'Port de réception', String(s.imapPort), { placeholder: '993' });
  if (!admin()) return;
  var acts = node('div', 'actions marks', b), sv = node('button', 'btn primary', acts, 'Enregistrer'), ck = node('button', 'btn', acts, 'Tester la connexion');
  var save = function(){ var body = { user: user.value.trim(), name: name.value.trim(), host: hostI.value.trim(), port: port.value.trim(), imapHost: imapH.value.trim(), imapPort: imapP.value.trim() }; if (pass.value.trim()) body.pass = pass.value; return api('mailing/settings', { method: 'POST', json: body }); };
  sv.addEventListener('click', function(){ save().then(function(r){ toast(r.ok ? 'Boîte d’envoi enregistrée.' : err(r), !r.ok); if (r.ok) again(); }); });
  ck.addEventListener('click', function(){ b.count.textContent = 'Connexion…'; ck.disabled = true; save().then(function(r){ if (!r.ok){ ck.disabled = false; b.count.textContent = err(r); return; } return api('mailing/settings/verify', { method: 'POST' }).then(function(rr){ ck.disabled = false; pass.value = ''; b.count.textContent = rr.ok ? 'Connexion acceptée pour ' + rr.body.user : err(rr); toast(rr.ok ? 'La boîte répond, elle peut envoyer. Aucun mail n’est parti.' : 'La boîte ne répond pas : ' + err(rr), !rr.ok); }); }); });
}));

/* ---------- 5. Desinscrits (Instinct's Unsubscribed) ---------- */
ST.register('mail-desinscrits', screen(function(host, again){
  ST.count(plural(D.suppressions.length, 'adresse', 'adresses'));
  node('p', 'note', host, 'Les adresses auxquelles on n’écrit plus. Chaque mail porte la ligne « Ne plus recevoir ces mails ». ' + (D.tracking
    ? 'Elle ouvre une page de désinscription : la personne confirme, son adresse arrive ici toute seule.'
    : 'Tant que le studio tourne sur ce Mac, elle ouvre un mail vers la boîte d’envoi, objet Désinscription : quand un tel mail arrive, ajoutez l’adresse ici.') + ' Les adresses en échec viennent de « Lire les retours », dans Envois. La liste est relue avant chaque envoi.');
  var b = block(host, 'Désinscrits', '');
  if (admin()){
    var line = node('div', 'marks', b), inp = node('input', 'inline', line); inp.type = 'email'; inp.placeholder = 'nom@exemple.fr'; inp.setAttribute('aria-label', 'Adresse à désinscrire');
    var add = node('button', 'mark', line, 'Désinscrire'); add.addEventListener('click', function(){ var m = inp.value.trim(); if (!m){ inp.focus(); return; } api('mailing/suppressions', { method: 'POST', json: { email: m } }).then(function(r){ toast(r.ok ? m + ' ne recevra plus rien.' : err(r), !r.ok); if (r.ok) again(); }); });
  }
  if (!D.suppressions.length){ node('p', 'note', b, 'Personne ne s’est désinscrit.'); return; }
  var reasons = { unsubscribe: 'désinscrit', bounce: 'adresse en échec', manual: 'retiré à la main' }, tb = table(b, ['Adresse', 'Raison', 'Depuis', '']);
  D.suppressions.forEach(function(x){ var tr = node('tr', 'plain', tb); node('td', 'first', tr, x.email); node('td', 'mute', tr, reasons[x.reason] || x.reason || ''); node('td', 'mute', tr, when(x.at)); var td = node('td', 'door', tr);
    if (admin()){ var rm = node('button', 'btn small', td, 'Réinscrire'); rm.addEventListener('click', function(){ if (!confirm('Réinscrire ' + x.email + ' ? La personne recevra de nouveau les envois.')) return; api('mailing/suppressions?email=' + encodeURIComponent(x.email), { method: 'DELETE' }).then(function(r){ toast(r.ok ? x.email + ' recevra de nouveau les envois.' : err(r), !r.ok); again(); }); }); } });
}));
})();
