/* LES VENTES (4 octobre 2026, sur la base depuis le 7). Le paiement du site est ecrit dans le
   site lui-meme : netlify/functions/creer-paiement.js cree la session Stripe Checkout, et le
   montant vient de netlify/functions/catalogue.json, jamais du navigateur. Ce module ne refait
   rien de cela. Il fait cinq choses :

   1. Il tient les commandes dans la base (table commandes + commande_lignes) : lues dans Stripe
      sur un bouton (Relire), ou poussees par Stripe lui-meme (le webhook, quand le studio a
      une adresse publique et une cle STRIPE_WEBHOOK_SECRET). Ce que Stripe dit est reecrit a
      chaque lecture ; ce que la maison tape (preparation, numero de suivi, note) est garde.
   2. La preparation d'une commande, comme chez Shopify : a preparer, preparee, expediee,
      livree, annulee, remboursee ; un numero de suivi ; une note.
   3. Le stock : une commande payee sort ses pieces du stock, une fois (le mouvement porte le
      numero de la commande). Une piece unique sortie ne peut plus sortir : la base refuse.
   4. Encaisser (quand la fonction du site autorise sans capturer : capture manuelle) et
      rembourser, depuis la fiche, chacun derriere un mot tape.
   5. Il dit ou en est le paiement, et quand le studio sert le site (PUBLIC_SITE=1) il fait
      tourner la fonction du site a l'adresse ou le site l'appelle.

   La cle : STRIPE_SECRET_KEY dans l'environnement, jamais dans un fichier du depot, jamais
   renvoyee par une route. STRIPE_API ne sert qu'aux essais (un faux Stripe sur cette machine). */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');

module.exports = function(cfg, tools){
  var B = cfg.base || tools.base, FN = path.join(cfg.site, 'netlify', 'functions', 'creer-paiement.js'), CAT = path.join(cfg.site, 'netlify', 'functions', 'catalogue.json');
  var API = (process.env.STRIPE_API || 'https://api.stripe.com').replace(/\/+$/, '');
  function key(){ return process.env.STRIPE_SECRET_KEY || ''; }
  function keyKind(){ var k = key(); return !k ? 'absente' : (/^(sk|rk)_live_/.test(k) ? 'production' : 'test'); }
  function stripe(pathname, form){
    var init = { headers: { Authorization: 'Bearer ' + key() } };
    if (form){ init.method = 'POST'; init.headers['Content-Type'] = 'application/x-www-form-urlencoded'; init.body = new URLSearchParams(form).toString(); }
    return fetch(API + pathname, init).then(function(r){ return r.json().then(function(j){ if (!r.ok) throw new Error((j.error && j.error.message) || 'Stripe a refusé la demande'); return j; }); });
  }
  /* a session of Stripe, read as a line of the base */
  function order(s){
    var c = s.customer_details || {}, sh = (s.shipping_details || (s.collected_information && s.collected_information.shipping_details) || {}), ad = sh.address || c.address || {};
    var pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
    return { id: s.id, at: new Date((s.created || 0) * 1000).toISOString(), status: s.status, paid: s.payment_status, total: (s.amount_total || 0) / 100, currency: s.currency || 'eur',
      email: (c.email || s.customer_email || '').toLowerCase(), name: sh.name || c.name || '', phone: c.phone || (s.metadata && s.metadata.telephone) || '', gift: !!(s.metadata && s.metadata.cadeau === 'oui'),
      address: [ad.line1, ad.line2, [ad.postal_code, ad.city].filter(Boolean).join(' '), ad.country].filter(Boolean).join(', '), live: !!s.livemode,
      paymentIntent: pi ? pi.id : (typeof s.payment_intent === 'string' ? s.payment_intent : ''), capture: pi ? pi.status : '' };
  }
  /* a line of the order, and the piece of the site it names (the payment function sends the name, the base keeps the slug) */
  function slugOf(name){ var p = tools.catalogue.all().filter(function(x){ return x.name === name; })[0]; return p ? p.slug : ''; }
  function lines(j){ return (j.data || []).map(function(l){ return { slug: slugOf(l.description), name: l.description, quantity: l.quantity, amount: (l.amount_total || 0) / 100 }; }); }
  /* a paid order takes its pieces out of the stock, once: the movement carries the order's number */
  function takeStock(o){
    if (o.paid !== 'paid') return [];
    var notes = [];
    o.lines.forEach(function(l){
      if (!l.slug) return;
      var st = B.stock.get(l.slug); if (!st || st.kind === 'made_to_order') return;
      if (B.q('SELECT 1 FROM mouvements WHERE slug = ? AND ref = ?').get(l.slug, o.id)) return;
      try { B.stock.move(l.slug, l.quantity, 'vente', { ref: o.id, note: o.name || o.email, by: 'stripe' }); }
      catch (e){ notes.push(l.name + ' : ' + e.message); }
    });
    if (notes.length){ var cur = B.commandes.get(o.id); B.commandes.prepare(o.id, { note: ((cur.note || '') + '\n' + notes.join('\n')).trim() }); }
    return notes;
  }
  function pull(session){
    return stripe('/v1/checkout/sessions/' + session.id + '/line_items?limit=30').then(function(li){
      var o = B.commandes.upsert(order(session), lines(li)); takeStock(o); return o;
    });
  }
  function status(){
    var cat = tools.readJSON(CAT, null), n = cat ? Object.keys(cat).length : 0;
    return { fonction: fs.existsSync(FN), catalogue: n, payables: cat ? Object.keys(cat).filter(function(k){ return cat[k].centimes > 0 || cat[k].libre; }).length : 0,
      cle: keyKind(), sert: cfg.publicSite, adresse: cfg.publicUrl, webhook: !!process.env.STRIPE_WEBHOOK_SECRET, webhookUrl: cfg.publicUrl ? cfg.publicUrl + '/stripe/webhook' : '' };
  }

  /* ---------- THE WEBHOOK: Stripe calls, the signature is checked on the raw bytes, the order lands in the base ---------- */
  function goodSignature(raw, header){
    var secret = process.env.STRIPE_WEBHOOK_SECRET || '', t = '', v1 = [];
    String(header || '').split(',').forEach(function(x){ var kv = x.trim().split('='); if (kv[0] === 't') t = kv[1]; if (kv[0] === 'v1') v1.push(kv[1]); });
    if (!secret || !t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
    var want = crypto.createHmac('sha256', secret).update(t + '.').update(raw).digest('hex');
    return v1.some(function(sig){ return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)); });
  }
  var hits = {};
  function open(req, res, u){
    if (u.pathname === '/stripe/webhook' && req.method === 'POST'){
      if (!process.env.STRIPE_WEBHOOK_SECRET){ tools.fail(res, 503, 'webhook non configuré : STRIPE_WEBHOOK_SECRET manque'); return true; }
      return tools.readRaw(req, 1048576).then(function(raw){
        if (!goodSignature(raw, req.headers['stripe-signature'])){ tools.audit(null, 'stripe-webhook-refused', { ip: tools.ipOf(req) }); return tools.fail(res, 400, 'signature invalide'); }
        var ev; try { ev = JSON.parse(raw.toString('utf8')); } catch (e){ return tools.fail(res, 400, 'bad json'); }
        var obj = ev.data && ev.data.object || {}, type = String(ev.type || '');
        if (/^checkout\.session\./.test(type) && obj.id){
          /* the session is read back from Stripe, never trusted from the body alone */
          return stripe('/v1/checkout/sessions/' + obj.id + '?expand[]=payment_intent').then(pull).then(function(o){ tools.audit(null, 'stripe-webhook', { type: type, id: o.id, paid: o.paid }); tools.send(res, 200, { ok: true }); }, function(e){ tools.fail(res, 502, e.message); });
        }
        if (/^(payment_intent|charge)\./.test(type)){
          var pi = type.indexOf('charge') === 0 ? obj.payment_intent : obj.id, c = pi ? B.q('SELECT id FROM commandes WHERE payment_intent = ?').get(pi) : null;
          if (c) return stripe('/v1/checkout/sessions/' + c.id + '?expand[]=payment_intent').then(pull).then(function(){ tools.send(res, 200, { ok: true }); }, function(e){ tools.fail(res, 502, e.message); });
        }
        tools.send(res, 200, { ok: true, ignored: type });
      });
    }
    /* the site's own payment function, run as written: the catalogue is read again on every call */
    if (!cfg.publicSite || u.pathname !== '/.netlify/functions/creer-paiement') return false;
    if (!fs.existsSync(FN)){ tools.fail(res, 404, 'not found'); return true; }
    var ip = tools.ipOf(req), now = Date.now(), h = hits[ip] = (hits[ip] || []).filter(function(t){ return now - t < 60000; });
    if (h.length >= 12){ tools.send(res, 429, { erreur: 'Trop de demandes, réessayez dans une minute.' }); return true; }
    h.push(now);
    return tools.readRaw(req, 65536).then(function(body){
      if (!process.env.ALAYA_ORIGINES && cfg.publicUrl) process.env.ALAYA_ORIGINES = cfg.publicUrl;
      delete require.cache[require.resolve(FN)]; delete require.cache[require.resolve(CAT)];
      return require(FN).handler({ httpMethod: req.method, headers: req.headers, body: body.toString('utf8') }).then(function(r){ res.writeHead(r.statusCode, r.headers || {}); res.end(r.body || ''); });
    });
  }

  /* ---------- the routes, under /vente ---------- */
  var PREP = ['a_preparer', 'preparee', 'expediee', 'livree', 'annulee', 'remboursee'];
  function api(req, res, u, user, p){
    var m, admin = user.role === 'admin', oops = function(e){ if (!res.headersSent) tools.fail(res, 502, e.message); };
    if (p === '/vente' && req.method === 'GET'){
      tools.send(res, 200, { etat: status(), commandes: B.commandes.list(500).map(function(c){ c.gift = !!c.gift; c.live = !!c.live; delete c.data; return c; }), resume: B.commandes.summary(), jours: B.commandes.byDay(30) }); return true;
    }
    /* the last hundred sessions of Stripe, read into the base (the lines of the new ones too) */
    if (p === '/vente/relire' && req.method === 'POST'){
      if (!admin) return tools.fail(res, 403, 'not allowed'), true;
      if (!key()) return tools.fail(res, 409, 'la clé Stripe n’est pas posée sur cette machine'), true;
      return stripe('/v1/checkout/sessions?limit=100&expand[]=data.payment_intent').then(function(j){
        var fresh = 0, sessions = j.data || [];
        return sessions.reduce(function(pr, s){ return pr.then(function(){
          var known = B.commandes.get(s.id), o = order(s);
          if (known && known.lines.length && known.paid === o.paid && known.capture === o.capture){ B.commandes.upsert(o); return; }
          fresh++; return pull(s); }); }, Promise.resolve()).then(function(){ tools.audit(user, 'vente-relire', { lus: sessions.length, nouvelles: fresh }); tools.send(res, 200, { lus: sessions.length, nouvelles: fresh }); });
      })['catch'](oops);
    }
    if ((m = /^\/vente\/commande\/([A-Za-z0-9_]+)(?:\/(capturer|rembourser))?$/.exec(p))){
      var id = m[1], c = B.commandes.get(id);
      if (!c) return tools.fail(res, 404, 'commande inconnue'), true;
      if (req.method === 'GET' && !m[2]) return tools.send(res, 200, c), true;
      if (!admin) return tools.fail(res, 403, 'not allowed'), true;
      if (req.method === 'PUT' && !m[2]) return tools.readJSONBody(req).then(function(b){
        var patch = {};
        if (b.preparation !== undefined){ if (PREP.indexOf(b.preparation) < 0) return tools.fail(res, 400, 'état inconnu'); patch.preparation = b.preparation; }
        if (b.suivi !== undefined) patch.suivi = tools.txt(b.suivi).trim().slice(0, 120);
        if (b.note !== undefined) patch.note = tools.txt(b.note).trim().slice(0, 4000);
        var out = B.commandes.prepare(id, patch); tools.audit(user, 'vente-preparation', { id: id, preparation: out.preparation }); tools.send(res, 200, out);
      });
      if (req.method === 'POST' && m[2]) return tools.readJSONBody(req).then(function(b){
        if (!key()) return tools.fail(res, 409, 'la clé Stripe n’est pas posée sur cette machine');
        if (!c.paymentIntent) return tools.fail(res, 409, 'cette commande n’a pas de paiement Stripe');
        var word = m[2] === 'capturer' ? 'ENCAISSER' : 'REMBOURSER';
        if (b.confirm !== word) return tools.fail(res, 409, 'il faut taper ' + word);
        var call = m[2] === 'capturer' ? stripe('/v1/payment_intents/' + c.paymentIntent + '/capture', {}) : stripe('/v1/refunds', { payment_intent: c.paymentIntent });
        return call.then(function(){ return stripe('/v1/checkout/sessions/' + id + '?expand[]=payment_intent'); }).then(pull).then(function(o){
          if (m[2] === 'rembourser') o = B.commandes.prepare(id, { preparation: 'remboursee' });
          tools.audit(user, 'vente-' + m[2], { id: id }); tools.send(res, 200, o);
        })['catch'](oops);
      });
      return tools.fail(res, 405, 'method not allowed'), true;
    }
    return false;
  }
  return { api: api, open: open, status: status, goodSignature: goodSignature, order: order };
};
