/* LES VENTES (4 octobre 2026). Le paiement du site est ecrit dans le site lui-meme :
   netlify/functions/creer-paiement.js cree la session Stripe Checkout, et le montant vient de
   netlify/functions/catalogue.json, jamais du navigateur. Ce module ne refait rien de cela.
   Il fait trois choses :

   1. Il lit les commandes dans Stripe (lecture seule) pour les montrer dans le studio.
      Encaisser, rembourser, annuler : dans le tableau de bord Stripe, pas ici.
   2. Il dit ou en est le paiement : la fonction est-elle dans le site, la cle est-elle posee
      sur cette machine, test ou production.
   3. Quand le studio sert lui-meme le site (PUBLIC_SITE=1 sur un serveur), il fait tourner la
      fonction du site a l'adresse ou le site l'appelle, telle qu'elle est ecrite, avec le
      catalogue relu a chaque demande.

   La cle : STRIPE_SECRET_KEY dans l'environnement, jamais dans un fichier du depot, jamais
   renvoyee par une route. STRIPE_API ne sert qu'aux essais (un faux Stripe sur cette machine). */
'use strict';
var fs = require('fs'), path = require('path');

module.exports = function(cfg, tools){
  var FN = path.join(cfg.site, 'netlify', 'functions', 'creer-paiement.js'), CAT = path.join(cfg.site, 'netlify', 'functions', 'catalogue.json');
  var API = (process.env.STRIPE_API || 'https://api.stripe.com').replace(/\/+$/, '');
  function key(){ return process.env.STRIPE_SECRET_KEY || ''; }
  function keyKind(){ var k = key(); return !k ? 'absente' : (/^(sk|rk)_live_/.test(k) ? 'production' : 'test'); }
  function stripe(pathname){
    return fetch(API + pathname, { headers: { Authorization: 'Bearer ' + key() } }).then(function(r){ return r.json().then(function(j){ if (!r.ok) throw new Error((j.error && j.error.message) || 'Stripe a refusé la demande'); return j; }); });
  }
  function order(s){
    var c = s.customer_details || {}, sh = (s.shipping_details || (s.collected_information && s.collected_information.shipping_details) || {}), ad = sh.address || c.address || {};
    return { id: s.id, at: new Date((s.created || 0) * 1000).toISOString(), status: s.status, paid: s.payment_status, total: (s.amount_total || 0) / 100, currency: s.currency || 'eur',
      email: c.email || s.customer_email || '', name: sh.name || c.name || '', phone: c.phone || (s.metadata && s.metadata.telephone) || '', gift: !!(s.metadata && s.metadata.cadeau === 'oui'),
      address: [ad.line1, ad.line2, [ad.postal_code, ad.city].filter(Boolean).join(' '), ad.country].filter(Boolean).join(', '), live: !!s.livemode };
  }
  function status(){
    var cat = tools.readJSON(CAT, null), n = cat ? Object.keys(cat).length : 0;
    return { fonction: fs.existsSync(FN), catalogue: n, payables: cat ? Object.keys(cat).filter(function(k){ return cat[k].centimes > 0 || cat[k].libre; }).length : 0,
      cle: keyKind(), sert: cfg.publicSite, adresse: cfg.publicUrl };
  }

  /* the site's own function, run as written: the catalogue is read again on every call, so a price the studio just changed is the price charged */
  var hits = {};
  function open(req, res, u){
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
  function api(req, res, u, user, p){
    if (p === '/vente' && req.method === 'GET'){
      var st = status();
      if (st.cle === 'absente'){ tools.send(res, 200, { etat: st, commandes: [] }); return true; }
      return stripe('/v1/checkout/sessions?limit=50').then(function(j){ tools.send(res, 200, { etat: st, commandes: (j.data || []).map(order) }); },
        function(e){ tools.send(res, 200, { etat: st, commandes: [], erreur: e.message }); });
    }
    if (p === '/vente/commande' && req.method === 'GET'){
      var id = u.searchParams.get('id') || '';
      if (!/^cs_[A-Za-z0-9_]+$/.test(id) || !key()){ tools.fail(res, 404, 'commande inconnue'); return true; }
      return Promise.all([stripe('/v1/checkout/sessions/' + id), stripe('/v1/checkout/sessions/' + id + '/line_items?limit=30')]).then(function(r){
        tools.send(res, 200, Object.assign(order(r[0]), { lines: (r[1].data || []).map(function(l){ return { name: l.description, quantity: l.quantity, amount: (l.amount_total || 0) / 100 }; }) }));
      }, function(e){ tools.fail(res, 502, e.message); });
    }
    return false;
  }
  return { api: api, open: open, status: status };
};
