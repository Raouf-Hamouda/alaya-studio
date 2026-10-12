/* LES COURS (10 octobre 2026) : l'or et l'argent au gramme en euros, les diamants au carat.
   Trois sources libres, sans cle ni compte, lues en parallele :
   - gold-api.com : XAU et XAG en dollars l'once, rafraichis a la minute ;
   - frankfurter.dev : le change USD -> EUR de la Banque centrale europeenne, du dernier jour ouvre ;
   - rapaport.com : EXACTEMENT les donnees de leur page diamond-price-index, par la route REST
     publique de leur widget (wp-json/rmw/v1) : diamonds (l'indice RAPI, prix moyen demande au carat
     des 25 meilleurs ronds D-H IF-VS2 GIA sur RapNet, pour 0,30 / 0,50 / 1 / 2 / 3 ct, sur 1 mois,
     3 mois, 1 an), metals (or, argent, platine, palladium, l'once en dollars), currencies (EUR, GBP,
     CNY, INR en dollars), equities (S&P 500, NIFTY 50, Hang Seng). Le flux est garde tel quel
     (`feed`) : le studio l'affiche et l'ecrit sur le guide du diamant du site (rapi.js).
   - stonealgo.com : le calculateur de prix, libre et sans compte (robots.txt l'autorise) : forme,
     poids, couleur, purete (taille, symetrie, poli, fluorescence) -> estimation juste, fourchette,
     prix au carat, variation 30 jours, d'apres l'inventaire des bijoutiers en ligne, mis a jour chaque
     jour. A la demande dans le studio (`estimerPierre`) (studio seulement, rien sur le site).
   goldapi.io (cle GOLD_API dans l'environnement) passe devant pour l'or quand la maison a sa cle.
   Rien n'est invente : une source muette est dite manquante, les autres passent.
     node cours.js          la preuve, hors ligne
     node cours.js --live   une lecture reelle, affichee */
'use strict';
var ONCE = 31.1034768;   /* grammes dans une once troy */
var UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

function get(url, headers){
  return fetch(url, { headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json, text/html' }, headers || {}), signal: AbortSignal.timeout(15000), redirect: 'follow' })
    .then(function(r){ if (!r.ok) throw new Error(url.split('/')[2] + ' a répondu ' + r.status); return r.text(); });
}
function json(url, headers){ return get(url, headers).then(JSON.parse); }
function cents(n){ return Math.round(n * 100) / 100; }
/* dollars l'once -> euros le gramme */
function gramme(usdOnce, usdEur){ return cents(usdOnce * usdEur / ONCE); }

var RMW = 'https://rapaport.com/wp-json/rmw/v1/', RMW_H = { Referer: 'https://rapaport.com/diamond-price-index/' };
/* their whole widget, as their page loads it: diamonds on the three ranges, the three other tabs on 30 days */
function lireRapaport(){
  var feed = { at: new Date().toISOString(), diamonds: {} }, dj = function(d){ return json(RMW + 'diamonds?days=' + d + '&sizes=0.3,0.5,1,2,3', RMW_H); };
  return Promise.all([dj(30), dj(91), dj(365), json(RMW + 'metals?days=30', RMW_H), json(RMW + 'currencies?days=30', RMW_H), json(RMW + 'equities?days=30', RMW_H)]).then(function(r){
    feed.diamonds = { '1M': r[0], '3M': r[1], '1Y': r[2] }; feed.metals = r[3]; feed.currencies = r[4]; feed.equities = r[5];
    if (!parseRapi(r[0]).length) throw new Error('rapaport.com : indice RAPI vide');
    return feed; });
}
/* the RAPI rows out of the diamonds feed: { items: [{ size, label, price, changePct, series: [...] }] } */
function parseRapi(j){
  var items = (j && j.items) || [], out = [];
  items.forEach(function(it, i){ var p = Number(it.price), s = Number(it.size); if (!(p > 0) || !(s > 0)) return;
    var lbl = s.toFixed(2).replace('.', ',') + ' ct';
    out.push({ rang: i + 1, driver: 'Rond ' + lbl + ', D-H, IF-VS2', forme: 'Rond', poids: lbl, caratMin: s, caratMax: s, couleur: 'D-H', purete: 'IF-VS2', part: null, usdCt: cents(p), indice: null,
      variation: isFinite(Number(it.changePct)) ? Number(it.changePct) : null, source: 'RAPI' }); });
  return out;
}

function lire(opts){
  opts = opts || {};
  var out = { at: new Date().toISOString(), usdEur: null, fxDate: '', or: null, argent: null, rapi: [], feed: null, manques: [] };
  var fx = json('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR').then(function(j){ out.usdEur = Number(j.rates && j.rates.EUR); out.fxDate = j.date || ''; if (!(out.usdEur > 0)) throw new Error('frankfurter.dev : change USD/EUR illisible'); });
  var once = function(sym){ return json('https://api.gold-api.com/price/' + sym).then(function(j){ var p = Number(j.price); if (!(p > 0)) throw new Error('gold-api.com : ' + sym + ' illisible'); return p; }); };
  var orLibre = fx.then(function(){ return once('XAU'); }).then(function(p){ out.or = { prix: gramme(p, out.usdEur), usdOnce: p, source: 'gold-api.com + BCE' }; });
  var or = opts.goldApiKey
    ? json('https://www.goldapi.io/api/XAU/EUR', { 'x-access-token': opts.goldApiKey }).then(function(j){ var p = Number(j.price_gram_24k); if (!(p > 0)) throw new Error('goldapi.io illisible'); return orLibre['catch'](function(){}).then(function(){ out.or = { prix: cents(p), source: 'goldapi.io' }; }); }, function(){ return orLibre; })
    : orLibre;
  var argent = fx.then(function(){ return once('XAG'); }).then(function(p){ out.argent = { prix: gramme(p, out.usdEur), usdOnce: p, source: 'gold-api.com + BCE' }; });
  var rapi = lireRapaport()['catch'](function(){ return new Promise(function(r){ setTimeout(r, 1500); }).then(lireRapaport); }).then(function(f){ out.feed = f; out.rapi = parseRapi(f.diamonds['1M']); });
  var names = ['or', 'argent', 'diamants Rapaport'];
  return Promise.allSettled([or, argent, rapi]).then(function(rs){
    rs.forEach(function(r, i){ if (r.status === 'rejected') out.manques.push(names[i] + ' : ' + (r.reason && r.reason.message || r.reason)); });
    out.rapi.forEach(function(x){ x.eurCt = out.usdEur ? cents(x.usdCt * out.usdEur) : null; });
    if (out.feed) out.feed.usdEur = out.usdEur;
    return out;
  });
}

/* ---------- StoneAlgo ---------- */
var SA = 'https://www.stonealgo.com/diamond-price-calculator/', saCookie = '', saToken = '';
function saSession(){
  return fetch(SA, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) }).then(function(r){
    var sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];
    saCookie = sc.map(function(c){ return c.split(';')[0]; }).filter(Boolean).join('; '); var m = /csrftoken=([^;]+)/.exec(saCookie); saToken = m ? m[1] : '';
    if (!saToken) throw new Error('stonealgo.com : pas de jeton de session'); });
}
/* their answer -> ours ; a stone they cannot price comes back { rare: true } */
function parseEstimation(j){
  var r = {}; try { r = JSON.parse(j.res_estimate_json || '{}'); } catch (e){}
  var out = { shape: r.shape || '', carat: Number(r.carat) || null, color: r.color || '', clarity: r.clarity || '', cut: r.cut || '', origin: r.origin || 'natural' };
  if (j.return_status === 'rare_request' || !(Number(r.model_value) > 0)){ out.rare = true; return out; }
  var rg = /\$([\d,]+)\s*-\s*\$([\d,]+)/.exec(r.model_range || ''), v = parseFloat(String(r.percent_change || '').replace(/[%+]/g, ''));
  out.valeur = Math.round(Number(r.model_value)); out.caratUsd = Math.round(Number(r.model_ppc)); out.bas = rg ? Number(rg[1].replace(/,/g, '')) : null; out.haut = rg ? Number(rg[2].replace(/,/g, '')) : null;
  out.qualite = r.model_quality || ''; out.variation = isFinite(v) ? v : null; return out;
}
function estimerPierre(p){
  var body = { origin: p.origin === 'lab' ? 'lab' : 'natural', shape: String(p.shape || 'round').toLowerCase(), color: String(p.color || 'g').toLowerCase(), clarity: String(p.clarity || 'vs2').toLowerCase(),
    cut: p.cut || 'ex.', symmetry: p.symmetry || 'ex.', polish: p.polish || 'ex.', fluorescence: p.fluorescence || 'non', calc_request_estimate: 'calc_request_estimate', carat: String(p.carat) };
  var go = function(again){ return fetch(SA, { method: 'POST', signal: AbortSignal.timeout(30000), redirect: 'manual',
      headers: { 'User-Agent': UA, Cookie: saCookie, 'X-CSRFToken': saToken, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json', Referer: SA, Origin: 'https://www.stonealgo.com', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ calcParams: JSON.stringify(body), ax_request_type: 'calc_request_estimate' }).toString() })
    .then(function(r){ if (r.status === 403 && again){ saToken = ''; return saSession().then(function(){ return go(false); }); } if (!r.ok) throw new Error('stonealgo.com a répondu ' + r.status); return r.json().then(parseEstimation); }); };
  return (saToken ? Promise.resolve() : saSession()).then(function(){ return go(true); });
}
module.exports = { lire: lire, lireRapaport: lireRapaport, parseRapi: parseRapi, estimerPierre: estimerPierre, parseEstimation: parseEstimation, gramme: gramme, ONCE: ONCE };

if (require.main === module){
  if (process.argv.indexOf('--live') > 0){
    if (process.argv.indexOf('--pierre') > 0) estimerPierre({ shape: 'Round', carat: 1, color: 'G', clarity: 'VS2' }).then(function(e){ console.log(JSON.stringify(e)); });
    else lire({ goldApiKey: process.env.GOLD_API }).then(function(o){ console.log(JSON.stringify(o, null, 2)); });
  } else {
    var assert = require('assert');
    assert.strictEqual(gramme(4195.6, 0.89238), 120.37);
    var rapi = parseRapi({ from: '2026-09-10', to: '2026-10-10', items: [{ size: 0.3, label: '0.30 ct', price: 950.3267, changePct: -0.99, series: [] }, { size: 1, label: '1.00 ct', price: 6420.5, changePct: 1.4 }, { size: 9, label: 'x', price: 0 }] });
    assert.strictEqual(rapi.length, 2);
    assert.deepStrictEqual(rapi[1], { rang: 2, driver: 'Rond 1,00 ct, D-H, IF-VS2', forme: 'Rond', poids: '1,00 ct', caratMin: 1, caratMax: 1, couleur: 'D-H', purete: 'IF-VS2', part: null, usdCt: 6420.5, indice: null, variation: 1.4, source: 'RAPI' });
    assert.strictEqual(rapi[0].usdCt, 950.33);
    var est = parseEstimation({ return_status: '200', res_estimate_json: JSON.stringify({ model_value: '18686.1915', model_range: '$8,216 - $34,391', model_quality: 'very good', model_ppc: 12457.461, shape: 'Round', color: 'D', clarity: 'IF', carat: '1.5', cut: 'Excellent', origin: 'natural', percent_change: '+0.25%' }) });
    assert.deepStrictEqual(est, { shape: 'Round', carat: 1.5, color: 'D', clarity: 'IF', cut: 'Excellent', origin: 'natural', valeur: 18686, caratUsd: 12457, bas: 8216, haut: 34391, qualite: 'very good', variation: 0.25 });
    assert.strictEqual(parseEstimation({ return_status: 'rare_request', res_estimate_json: '{"shape":"Heart","carat":"5"}' }).rare, true);
    console.log('cours.js : preuve ok (gramme, indice RAPI, estimation StoneAlgo)');
  }
}
