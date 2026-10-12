/* LE COMMERCE DU STUDIO (7 octobre 2026) : ce qu'une boutique tient a cote de ses pieces et
   de ses commandes. Trois objets, sur la base (base.js) :

   - le stock d'une piece du site : unique, en stock ou sur commande, un seuil bas, un
     emplacement, et des mouvements signes (entree, sortie, vente, retour, ajustement). La
     quantite n'est jamais rangee : c'est la somme des mouvements, et la base refuse ce qui
     casse une regle (sous zero, deux exemplaires d'une piece unique, un mouvement retouche) ;
   - les clients : une vue de la base, qui reunit par adresse les commandes payees et les
     contacts du mailing ; une fiche lit ses commandes, ses envois recus, sa note ;
   - l'accueil : les chiffres du jour, lus dans la base et dans le site.

   Et les sauvegardes de la base : la liste, une a la demande, une a telecharger. */
'use strict';
var fs = require('fs'), path = require('path');

module.exports = function(cfg, tools){
  var B = cfg.base || tools.base, KINDS = ['unique', 'stock', 'made_to_order'], REASONS = ['entree', 'sortie', 'vente', 'retour', 'ajustement'];
  /* 10 octobre (reviewer) : the catalogue is read ONCE per request, never per line */
  function carte(all){ var by = {}; (all || tools.catalogue.all()).forEach(function(p){ by[p.slug] = p; }); return by; }
  function pieceOf(slug, by){ return (by || carte())[slug]; }
  /* a stock line, with the piece it is about, as the site shows it */
  function dress(s, by){ var p = pieceOf(s.slug, by); s.name = p ? p.name : s.slug; s.image = p ? p.image : ''; s.price = p ? p.price : 0; s.rayon = p ? p.rayon : ''; s.collection = p ? p.collection : ''; s.onSite = !!p; s.suivi = true; s.siteEtat = p ? (p.etat || '') : ''; return s; }
  /* the whole site : a tracked piece with its counts, an untracked one with its page only */
  function toutes(){ var all = tools.catalogue.all(), map = carte(all), by = {}; B.stock.list().forEach(function(s){ by[s.slug] = dress(s, map); });
    return all.filter(function(p){ return p.rayon; }).map(function(p){ return by[p.slug] || { slug: p.slug, name: p.name, image: p.image, price: p.price, rayon: p.rayon, collection: p.collection, onSite: true, suivi: false, kind: '', onHand: null, minStock: 0, emplacement: '', note: '', delaiJours: 0, dernier: null, siteEtat: tools.catalogue.etatOf(p.slug) }; }); }
  function resume(){ var r = B.stock.summary(); r.site = tools.catalogue.all().filter(function(p){ return p.rayon; }).length; r.nonSuivies = r.site - r.items; return r; }
  function journal(n){
    var out = []; try { var lines = fs.readFileSync(path.join(cfg.data, 'audit.log'), 'utf8').trim().split('\n'); lines.slice(-n).reverse().forEach(function(l){ try { out.push(JSON.parse(l)); } catch (e){} }); } catch (e){}
    return out;
  }
  function agendaAVenir(){ var today = new Date().toISOString().slice(0, 10), list = []; try { list = B.objets.list('events'); } catch (e){ try { list = tools.readJSON(path.join(cfg.data, 'agenda.json'), []); } catch (e2){ list = []; } }
    return (list || []).filter(function(e){ return tools.txt(e.end || e.start).slice(0, 10) >= today; }).sort(function(a, b){ return tools.txt(a.start) < tools.txt(b.start) ? -1 : 1; }).slice(0, 8).map(function(e){ return { id: e.id, title: e.title, start: e.start, end: e.end, place: e.place || e.location || '', note: e.description || e.note || '' }; }); }
  function accueil(){
    var pieces = tools.catalogue.all(), gold = B.or.list()[0] || null;
    return B.mailStore.listCampaigns().then(function(camps){
      return { pieces: { total: pieces.length, sansPrix: pieces.filter(function(p){ return !(p.price > 0); }).length, rayons: pieces.reduce(function(a, p){ a[p.rayon] = (a[p.rayon] || 0) + 1; return a; }, {}) },
        commandes: B.commandes.summary(), jours: B.commandes.byDay(30), dernieres: B.commandes.list(6).map(function(c){ delete c.data; return c; }),
        stock: B.stock.summary(), stockBas: B.stock.list().filter(function(s){ return s.kind !== 'made_to_order' && s.onHand <= s.minStock; }).slice(0, 8).map(dress),
        mailing: { contacts: B.q('SELECT COUNT(*) AS n FROM contacts').get().n, envois: camps.length, dernier: camps[0] ? { subject: camps[0].subject, createdAt: camps[0].createdAt, status: camps[0].status, total: camps[0].total } : null },
        clients: B.q('SELECT COUNT(*) AS n FROM clients').get().n, or: gold, journal: journal(12), dernierePublication: lastPublish(),
        /* 10 octobre : the home shows the coming agenda and the Rapaport indices */
        agenda: agendaAVenir(), rapaport: B.reglages.get('rapaport', null) };
    });
  }
  function lastPublish(){ var j = journal(400).filter(function(x){ return x.what === 'publish' && x.ok; })[0]; return j ? { at: j.t, message: j.message } : null; }
  function backups(){ var dir = path.join(cfg.data, 'sauvegardes_base'); try { return fs.readdirSync(dir).filter(function(f){ return /\.sqlite$/.test(f); }).sort().reverse().map(function(f){ var st = fs.statSync(path.join(dir, f)); return { name: f, size: st.size, at: st.mtime.toISOString() }; }); } catch (e){ return []; } }

  function api(req, res, u, user, p){
    var m, admin = user.role === 'admin', write = req.method !== 'GET';
    var body = function(fn){ return tools.readJSONBody(req).then(fn)['catch'](function(e){ if (!res.headersSent) tools.fail(res, 400, e.message); }); };
    /* ---- the home ---- */
    if (p === '/accueil' && req.method === 'GET') return accueil().then(function(a){ tools.send(res, 200, a); }, function(e){ tools.fail(res, 500, e.message); });
    /* ---- the stock ---- */
    if (p === '/stock' && req.method === 'GET'){ tools.send(res, 200, { stock: toutes(), resume: resume() }); return true; }
    /* every untracked piece at once, with one kind and one starting count */
    if (p === '/stock/toutes' && req.method === 'POST'){
      if (!admin) return tools.fail(res, 403, 'not allowed'), true;
      return body(function(b){
        if (KINDS.indexOf(b.kind) < 0) return tools.fail(res, 400, 'il faut dire : pièce unique, en stock ou sur commande');
        var first = b.kind === 'made_to_order' ? 0 : Math.max(0, Math.trunc(Number(b.initial) || 0)), n = 0;
        B.tx(function(){ toutes().forEach(function(s){ if (s.suivi) return; B.stock.set(s.slug, { kind: b.kind, minStock: b.kind === 'stock' ? Math.max(0, Math.trunc(Number(b.minStock) || 0)) : 0, emplacement: tools.txt(b.emplacement).trim().slice(0, 120), delaiJours: b.delaiJours }); if (first > 0) B.stock.move(s.slug, b.kind === 'unique' ? 1 : first, 'entree', { note: 'premier comptage', by: user.email }); n++; }); });
        tools.audit(user, 'stock-toutes', { kind: b.kind, n: n }); tools.send(res, 200, { n: n, stock: toutes(), resume: resume() });
      });
    }
    if (p === '/stock' && req.method === 'POST'){
      if (!admin) return tools.fail(res, 403, 'not allowed'), true;
      return body(function(b){
        var slug = tools.txt(b.slug).trim(); if (!pieceOf(slug)) return tools.fail(res, 400, 'cette pièce n’est pas sur le site');
        if (KINDS.indexOf(b.kind) < 0) return tools.fail(res, 400, 'il faut dire : pièce unique, en stock ou sur commande');
        var s = B.tx(function(){
          var out = B.stock.set(slug, { kind: b.kind, minStock: Math.max(0, Math.trunc(Number(b.minStock) || 0)), emplacement: tools.txt(b.emplacement).trim().slice(0, 120), note: tools.txt(b.note).trim().slice(0, 1000), delaiJours: b.delaiJours });
          var first = Math.trunc(Number(b.initial) || 0);
          if (first > 0 && !out.mouvements.length) out = B.stock.move(slug, first, 'entree', { note: 'premier comptage', by: user.email });
          return out;
        });
        tools.audit(user, 'stock-set', { slug: slug, kind: b.kind }); tools.send(res, 200, dress(s));
      });
    }
    /* the state of the piece on the site itself : available, sold (the page stays, the button leads to made-to-measure), made to order with its lead time */
    if ((m = /^\/stock\/([a-z0-9-]+)\/site$/.exec(p)) && req.method === 'POST'){
      if (!admin) return tools.fail(res, 403, 'not allowed'), true;
      return body(function(b){ var r; try { r = tools.catalogue.setEtat(m[1], tools.txt(b.etat), Math.max(0, Math.trunc(Number(b.delai) || 0))); } catch (e){ return tools.fail(res, 400, e.message); } tools.audit(user, 'stock-site', { slug: m[1], etat: r.etat }); tools.send(res, 200, r); });
    }
    if ((m = /^\/stock\/([a-z0-9-]+)(?:\/(mouvement))?$/.exec(p))){
      var slug = m[1], s = B.stock.get(slug);
      /* an untracked piece of the site answers with its line, suivi: false ; a slug off the site is a 404 */
      if (!s && req.method === 'GET' && !m[2]){ var u0 = toutes().filter(function(x){ return x.slug === slug; })[0]; return u0 ? (tools.send(res, 200, u0), true) : (tools.fail(res, 404, 'pièce inconnue'), true); }
      if (!s) return tools.fail(res, 404, 'pas de stock pour cette pièce'), true;
      if (req.method === 'GET' && !m[2]) return tools.send(res, 200, dress(s)), true;
      if (!admin) return tools.fail(res, 403, 'not allowed'), true;
      if (req.method === 'DELETE' && !m[2]){ try { B.stock.remove(slug); } catch (e){ return tools.fail(res, 409, 'cette pièce a des mouvements : son stock ne s’efface pas'), true; } tools.audit(user, 'stock-remove', { slug: slug }); return tools.send(res, 200, { ok: true }), true; }
      if (req.method === 'POST' && m[2]) return body(function(b){
        if (REASONS.indexOf(b.reason) < 0) return tools.fail(res, 400, 'il faut un motif');
        var out; try { out = B.stock.move(slug, b.qty, b.reason, { ref: tools.txt(b.ref).trim().slice(0, 80), note: tools.txt(b.note).trim().slice(0, 300), by: user.email }); } catch (e){ return tools.fail(res, 400, e.message); }
        tools.audit(user, 'stock-move', { slug: slug, qty: b.qty, reason: b.reason }); tools.send(res, 200, dress(out));
      });
      return tools.fail(res, 405, 'method not allowed'), true;
    }
    /* ---- the clients ---- */
    if (p === '/clients' && req.method === 'GET'){ tools.send(res, 200, { clients: B.clients.list() }); return true; }
    if (p === '/clients/un' && req.method === 'GET'){ var c = B.clients.get(tools.txt(u.searchParams.get('email')).trim().toLowerCase()); if (!c) return tools.fail(res, 404, 'client inconnu'), true; tools.send(res, 200, c); return true; }
    /* ---- the backups of the base ---- */
    if (p === '/sauvegardes' && req.method === 'GET'){ tools.send(res, 200, { fichier: B.file, sauvegardes: backups() }); return true; }
    if (p === '/sauvegardes' && req.method === 'POST'){ if (!admin) return tools.fail(res, 403, 'not allowed'), true; try { var f = B.sauvegarde(); tools.audit(user, 'base-sauvegarde', { file: path.basename(f) }); tools.send(res, 201, { name: path.basename(f) }); } catch (e){ tools.fail(res, 500, e.message); } return true; }
    if ((m = /^\/sauvegardes\/(\d{4}-\d{2}-\d{2}\.sqlite)$/.exec(p)) && req.method === 'GET'){ if (!admin) return tools.fail(res, 403, 'not allowed'), true; res.setHeader('Content-Disposition', 'attachment; filename="alaya-studio-' + m[1] + '"'); tools.serveFile(req, res, path.join(cfg.data, 'sauvegardes_base', m[1])); return true; }
    return false;
  }
  return { api: api, accueil: accueil };
};
