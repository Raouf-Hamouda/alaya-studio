/* LES PAGES DU SITE : leurs textes et leurs images, modifies sur place (4 octobre 2026).
   Une page du site est un fichier HTML ecrit a la main. Ce module n'en refait aucune :
   il releve, dans le <main> de la page, chaque element qui porte du texte (titres,
   paragraphes, lignes de liste, etiquettes) et chaque image, et remplace seulement ce
   qui a ete change, a l'endroit exact, sans toucher au reste du fichier.

   Hors de portee, et dit dans le studio : l'en-tete, le menu et le pied de page (les
   memes sur toutes les pages), les vignettes de pieces (elles se changent dans Pieces),
   et les fiches de piece (dans Pieces aussi).

   Les ecritures passent par la transaction du catalogue : l'original est garde, et
   "Annuler la derniere ecriture" le remet. */
'use strict';
var fs = require('fs'), path = require('path');

module.exports = function(cfg, tools){
  var cat = tools.catalogue, NB = ' ';
  function read(rel){ return fs.readFileSync(path.join(cfg.site, rel), 'utf8'); }
  function pages(){ return cat.htmlFiles().filter(function(rel){ return rel.indexOf('piece/') !== 0; }).sort(); }
  function unesc(s){ return String(s).replace(/&#x27;/g, '\'').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&nbsp;/g, NB).replace(/&amp;/g, '&'); }
  function escText(s){ return String(s).replace(/&(?![a-z#0-9]+;)/gi, '&amp;')   /* an entity already written (&larr;) stays */.replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s){ return escText(s).replace(/"/g, '&quot;'); }
  /* French typography, as on the rest of the site: no line break before : ; ? ! */
  function typo(s){ return String(s).replace(/[ \t\r\n]+/g, ' ').trim().replace(/ ([:;?!])/g, NB + '$1'); }
  function titleOf(h){ var m = /<title>([^<]*)<\/title>/.exec(h); return m ? unesc(m[1]) : ''; }
  function metaOf(h){ var m = /<meta name="description" content="([^"]*)"/.exec(h); return m ? unesc(m[1]) : ''; }

  /* an element that carries text: a block whose inside is text and inline marks only, or a
     lone label (surtitre, ligne, cta...) that sits in no block. Scanned left to right, so
     nothing is found twice. */
  var INLINE = '(?:a|b|i|em|strong|span|mark|small|sup|sub|br|abbr|time|u)';
  var TEXT = new RegExp('<(h[1-4]|p|li|figcaption|summary|blockquote|dt|dd|th|td|label|button)\\b([^>]*)>((?:[^<]|<\\/?' + INLINE + '\\b[^>]*>)*?)<\\/\\1>|<(span|a)\\b([^>]*)>([^<]+)<\\/\\4>', 'g');
  var IMG = /<img\b[^>]*>/g, CARD = /<article class="product-card[\s\S]*?<\/article>|<nav class="(?:breadcrumb|fil-bas)"[\s\S]*?<\/nav>/g;   /* piece cards and the breadcrumb are not page texts */
  function scan(h){
    var a = h.indexOf('<main'), b = h.indexOf('</main>');
    if (a < 0 || b < 0) return { texts: [], images: [] };
    var main = h.slice(a, b), skip = [], m, texts = [], images = [];
    CARD.lastIndex = 0; while ((m = CARD.exec(main))) skip.push([m.index, m.index + m[0].length]);
    var inCard = function(i){ return skip.some(function(r){ return i >= r[0] && i < r[1]; }); };
    TEXT.lastIndex = 0;
    while ((m = TEXT.exec(main))){
      var tag = m[1] || m[4], attrs = m[2] || m[5] || '', inner = m[1] ? m[3] : m[6];
      if (inCard(m.index) || !inner.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '')) continue;
      if (/\bhidden\b|aria-hidden="true"/.test(attrs) || /class="[^"]*\b(count|n|chev|vus|panier-compte)\b/.test(attrs)) continue;
      var open = m[0].indexOf('>') + 1, cls = /class="([^"]*)"/.exec(attrs);
      texts.push({ tag: tag, cls: cls ? cls[1] : '', html: inner, plain: inner.indexOf('<') < 0, at: a + m.index + open, len: inner.length });
    }
    IMG.lastIndex = 0;
    while ((m = IMG.exec(main))){
      if (inCard(m.index)) continue;
      var src = /\bsrc="([^"]*)"/.exec(m[0]), alt = /\balt="([^"]*)"/.exec(m[0]);
      if (!src || !/(^|\/)images\//.test(src[1])) continue;
      images.push({ src: src[1], alt: alt ? unesc(alt[1]) : '', at: a + m.index, len: m[0].length, tag: m[0] });
    }
    return { texts: texts, images: images };
  }
  function tagsOf(html){ return (html.match(/<\/?[a-z]+/g) || []).join(' '); }
  function view(rel){
    var h = read(rel), s = scan(h);
    return { file: rel, title: titleOf(h), description: metaOf(h),
      texts: s.texts.map(function(t, i){ return { i: i, tag: t.tag, cls: t.cls, plain: t.plain, text: t.plain ? unesc(t.html) : t.html }; }),
      images: s.images.map(function(im, i){ return { i: i, src: im.src.replace(/^(?:\.\.\/|\.\/)+/, ''), alt: im.alt }; }) };
  }
  var EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  function save(rel, input){
    var h = read(rel), s = scan(h), changes = [], tx = cat.begin('Page ' + (titleOf(h).split(' | ')[0] || rel));
    try {
      (input.texts || []).forEach(function(e){
        var t = s.texts[e.i]; if (!t) throw new Error('texte ' + e.i + ' introuvable : la page a changé, rouvrez-la');
        var neu;
        if (t.plain) neu = escText(typo(e.text));
        else { neu = String(e.text).trim(); if (tagsOf(neu) !== tagsOf(t.html) || /<script|<style|\son[a-z]+=/i.test(neu)) throw new Error('texte ' + (e.i + 1) + ' : les balises du texte doivent rester les mêmes'); }
        if (!neu.replace(/<[^>]*>/g, '').trim()) throw new Error('texte ' + (e.i + 1) + ' : il ne peut pas être vide');
        if (neu !== t.html) changes.push({ at: t.at, len: t.len, by: neu });
      });
      (input.images || []).forEach(function(e, k){
        var im = s.images[e.i]; if (!im) throw new Error('image ' + e.i + ' introuvable : la page a changé, rouvrez-la');
        var tag = im.tag;
        if (e.data){
          var m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(e.data);
          if (!m) throw new Error('image ' + (e.i + 1) + ' : il faut un JPEG, un PNG ou un WebP');
          var file = 'images/edito/studio/' + tx.stamp.slice(0, 19).replace(/[-T]/g, '') + '-' + k + '.' + EXT[m[1]];
          tx.write(file, Buffer.from(m[2], 'base64'));
          var prefix = /^((?:\.\.\/|\.\/)*)/.exec(im.src)[1];
          tag = tag.replace(/\bsrc="[^"]*"/, 'src="' + prefix + file + '"').replace(/\s(?:width|height|srcset|sizes)="[^"]*"/g, '');
        }
        if (typeof e.alt === 'string' && e.alt !== im.alt) tag = /\balt="/.test(tag) ? tag.replace(/\balt="[^"]*"/, 'alt="' + escAttr(typo(e.alt)) + '"') : tag.replace(/<img/, '<img alt="' + escAttr(typo(e.alt)) + '"');
        if (tag !== im.tag) changes.push({ at: im.at, len: im.len, by: tag });
      });
      changes.sort(function(x, y){ return y.at - x.at; }).forEach(function(c){ h = h.slice(0, c.at) + c.by + h.slice(c.at + c.len); });
      if (typeof input.title === 'string' && typo(input.title) && typo(input.title) !== titleOf(h)){
        var ti = escText(typo(input.title));
        h = h.replace(/<title>[^<]*<\/title>/, '<title>' + ti + '</title>').replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + escAttr(typo(input.title)) + '$2');
      }
      if (typeof input.description === 'string' && typo(input.description) !== metaOf(h)){
        var de = escAttr(typo(input.description));
        h = h.replace(/(<meta name="description" content=")[^"]*(")/, '$1' + de + '$2').replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + de + '$2');
      }
      tx.update(rel, function(){ return h; });
      return { file: rel, changed: changes.length };
    } catch (e){ tx.rollback(); throw e; }
  }

  /* ---------- WHAT IS THE SAME ON EVERY PAGE: the top bar, the header, the two menus, the footer.
     Read on the home page, as text between tags, each wording once. A change is carried to every
     page of the site, outside its <main>, wherever that exact wording stands; the English and
     Italian it had follow the new wording. The sentences site.js writes by itself (cart panel,
     quick add) are not in the pages and are not covered. ---------- */
  var WHERE = [['<div class="topbar"', 'Barre du haut'], ['<header', 'En-tête'], ['<nav class="menu-vertical"', 'Menu du téléphone'], ['<footer', 'Pied de page']];
  function outside(h){
    var b = h.indexOf('<body'), a = h.indexOf('<main'), z = h.indexOf('</main>'), e = h.indexOf('<script', z);
    if (b < 0 || a < 0 || z < 0) return null;
    return [[b, a], [z, e < 0 ? h.length : e]];
  }
  function chrome(){
    var h = read('index.html'), parts = outside(h), seen = {}, out = [], re = />([^<>]+)</g;
    parts.forEach(function(r){
      var seg = h.slice(r[0], r[1]), m; re.lastIndex = 0;
      while ((m = re.exec(seg))){
        var raw = m[1], core = raw.trim();
        if (!core || seen[core] || !/[A-Za-zÀ-ÿ]/.test(core.replace(/&[a-z#0-9]+;/gi, '')) || /^\d+$/.test(core)) continue;
        seen[core] = 1;
        var at = r[0] + m.index, where = '';
        WHERE.forEach(function(w){ var i = h.lastIndexOf(w[0], at); if (i >= 0 && (!where || i > where.i)) where = { i: i, label: w[1] }; });
        out.push({ i: out.length, where: where ? where.label : 'En-tête', core: core, text: unesc(core) });
      }
    });
    return out;
  }
  function saveChrome(input){
    var items = chrome(), pairs = [], tx = cat.begin('Textes communs du site');
    try {
      (input.texts || []).forEach(function(e){
        var it = items[e.i]; if (!it) throw new Error('texte ' + e.i + ' introuvable : rouvrez la fiche');
        var neu = escText(typo(e.text)); if (!neu) throw new Error('un texte ne peut pas être vide');
        if (neu !== it.core) pairs.push([it.core, neu, it.text, typo(e.text)]);
      });
      if (!pairs.length) return { changed: 0, pages: 0 };
      var bump = cat.aliasPhrases(tx, pairs.map(function(x){ return [x[2], x[3]]; })), stamp = tx.stamp.slice(0, 16).replace(/[-T]/g, ''), n = 0;
      cat.htmlFiles().forEach(function(rel){
        tx.update(rel, function(h){
          var parts = outside(h); if (!parts) return h;
          var head = h.slice(0, parts[0][0]), top = h.slice(parts[0][0], parts[0][1]), main = h.slice(parts[0][1], parts[1][0]), foot = h.slice(parts[1][0], parts[1][1]), tail = h.slice(parts[1][1]);
          var swap = function(seg){ pairs.forEach(function(x){ seg = seg.replace(new RegExp('>(\\s*)' + x[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s*)<', 'g'), function(all, a, b){ return '>' + a + x[1] + b + '<'; }); }); return seg; };
          var out = head + swap(top) + main + swap(foot) + tail;
          if (bump) out = out.replace(/langues\.js\?v=[0-9a-z]+/g, 'langues.js?v=' + stamp);
          if (out !== h) n++;
          return out;
        });
      });
      return { changed: pairs.length, pages: n };
    } catch (e){ tx.rollback(); throw e; }
  }

  function api(req, res, u, user, p){
    if (p === '/textes/chrome' && req.method === 'GET'){ tools.send(res, 200, { texts: chrome().map(function(t){ return { i: t.i, where: t.where, text: t.text }; }) }); return true; }
    if (p === '/textes/chrome' && req.method === 'PUT'){
      if (user.role !== 'admin'){ tools.fail(res, 403, 'not allowed'); return true; }
      return tools.readJSONBody(req).then(function(b){
        var r; try { r = saveChrome(b); } catch (e){ return tools.fail(res, 400, e.message); }
        tools.audit(user, 'chrome-save', r); tools.send(res, 200, r);
      });
    }
    if (p === '/textes' && req.method === 'GET'){
      tools.send(res, 200, { pages: pages().map(function(rel){ var h = read(rel), s = scan(h); return { file: rel, title: titleOf(h).split(' | ')[0], texts: s.texts.length, images: s.images.length }; }) });
      return true;
    }
    if (p !== '/textes/page') return false;
    var rel = u.searchParams.get('f') || '';
    if (pages().indexOf(rel) < 0){ tools.fail(res, 404, 'page inconnue'); return true; }
    if (req.method === 'GET'){ tools.send(res, 200, view(rel)); return true; }
    if (req.method === 'PUT'){
      if (user.role !== 'admin'){ tools.fail(res, 403, 'not allowed'); return true; }
      return tools.readJSONBody(req, 90 * 1048576).then(function(b){
        var r; try { r = save(rel, b); } catch (e){ return tools.fail(res, 400, e.message); }
        tools.audit(user, 'page-save', r); tools.send(res, 200, r);
      });
    }
    return false;
  }
  return { api: api, scan: scan, view: view, save: save, pages: pages, chrome: chrome, saveChrome: saveChrome };
};
