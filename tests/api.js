#!/usr/bin/env node
/* LES ROUTES DU STUDIO SUR LA BASE, REJOUABLES (7 octobre 2026).
     node tests/api.js
   Le vrai site et le vrai studio ne sont pas touches : une copie du site dans le dossier
   temporaire, un studio a part sur le port 8796 avec ses propres donnees (une base vide),
   un faux Stripe sur le port 8797. Ce qu'il prouve : la porte, l'accueil, le stock et ses
   regles, les clients, le mailing sur la base, l'atelier sur la base (creer, lire, supprimer,
   remettre), les commandes lues dans le faux Stripe et le webhook signe, les sauvegardes. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http'), crypto = require('crypto'), assert = require('assert');
var ROOT = path.join(__dirname, '..'), REAL = path.resolve(process.env.SITE_DIR || path.join(ROOT, '..', '01_SITE_WEB', 'NEW VERSION', 'SITE double-clic'));
var PORT = 8796, SPORT = 8797, B = 'http://127.0.0.1:' + PORT + '/api', TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'alaya-api-')), C = path.join(TMP, 'c'), fails = 0, srv, fake, cookie = '', WH = 'whsec_essai';
function ok(cond, label){ console.log((cond ? 'ok     ' : 'ECHEC  ') + label); if (!cond) fails++; }
function copy(from, to){ fs.cpSync(from, to, { recursive: true, filter: function(src){ var b = path.basename(src); return b !== '.git' && !/\.bak_/.test(b) && b !== 'images'; } }); }
function call(method, p, body, raw){
  var h = { 'X-Requested-With': 'alaya', Cookie: cookie }; if (body !== undefined){ h['Content-Type'] = raw ? 'application/json' : 'application/json'; }
  if (raw && raw.sig) h['Stripe-Signature'] = raw.sig;
  return fetch((raw && raw.abs ? 'http://127.0.0.1:' + PORT : B) + p, { method: method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }).then(function(r){
    var sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e){ j = { raw: t }; } return { status: r.status, body: j }; });
  });
}
/* a Stripe of this machine: two sessions, their lines, a capture and a refund that answer yes */
var SESSIONS = {
  cs_test_a: { id: 'cs_test_a', created: 1759900000, status: 'complete', payment_status: 'paid', amount_total: 340000, currency: 'eur', livemode: false, customer_details: { email: 'cliente@exemple.fr', name: 'Claire Martin', phone: '+33600000000', address: { line1: '1 rue de la Paix', postal_code: '75002', city: 'Paris', country: 'FR' } }, metadata: { cadeau: 'oui' }, payment_intent: { id: 'pi_a', status: 'requires_capture' } },
  cs_test_b: { id: 'cs_test_b', created: 1759800000, status: 'open', payment_status: 'unpaid', amount_total: 120000, currency: 'eur', livemode: false, customer_details: { email: 'autre@exemple.fr', name: 'Autre' }, payment_intent: null }
};
var LINES = { cs_test_a: [{ description: '__PIECE__', quantity: 1, amount_total: 340000 }], cs_test_b: [{ description: 'Bague inconnue', quantity: 1, amount_total: 120000 }] };
function fakeStripe(){
  return http.createServer(function(req, res){
    var u = new URL(req.url, 'http://x'), m, j = function(code, o){ res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/v1/checkout/sessions') return j(200, { data: Object.keys(SESSIONS).map(function(k){ return SESSIONS[k]; }) });
    if ((m = /^\/v1\/checkout\/sessions\/(cs_[a-z_]+)\/line_items$/.exec(u.pathname))) return j(200, { data: LINES[m[1]] || [] });
    if ((m = /^\/v1\/checkout\/sessions\/(cs_[a-z_]+)$/.exec(u.pathname))) return SESSIONS[m[1]] ? j(200, SESSIONS[m[1]]) : j(404, { error: { message: 'No such session' } });
    if (/^\/v1\/payment_intents\/pi_a\/capture$/.test(u.pathname)){ SESSIONS.cs_test_a.payment_intent.status = 'succeeded'; return j(200, { id: 'pi_a', status: 'succeeded' }); }
    if (u.pathname === '/v1/refunds') return j(200, { id: 're_1', status: 'succeeded' });
    j(404, { error: { message: 'unknown ' + u.pathname } });
  });
}
(async function(){
  try {
    console.log('site : ' + REAL + '\ncopie : ' + TMP + '\n');
    copy(REAL, C);
    fake = fakeStripe(); await new Promise(function(r){ fake.listen(SPORT, '127.0.0.1', r); });
    srv = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), SITE_DIR: C, DATA_DIR: path.join(TMP, 'data'), ADMIN_EMAIL: 'essai', ADMIN_PASSWORD: 'mot-de-passe-essai', STRIPE_SECRET_KEY: 'sk_test_essai', STRIPE_API: 'http://127.0.0.1:' + SPORT, STRIPE_WEBHOOK_SECRET: WH, PUBLIC_SITE: '', PUBLIC_URL: '', COURS_AUTO: '0', OPEN_STUDIO: '' }), stdio: ['ignore', 'pipe', 'pipe'] });
    var log = ''; srv.stdout.on('data', function(d){ log += d; }); srv.stderr.on('data', function(d){ log += d; });
    await new Promise(function(r){ setTimeout(r, 1500); });
    ok(/studio alaya sur/.test(log), 'le studio demarre' + (/studio alaya sur/.test(log) ? '' : ' : ' + log.slice(-300)));

    console.log('\n1. La porte');
    var r = await call('GET', '/accueil'); ok(r.status === 401, 'sans session : 401');
    r = await call('POST', '/login', { email: 'essai', password: 'faux' }); ok(r.status === 401, 'mauvais mot de passe : 401');
    r = await call('POST', '/login', { email: 'essai', password: 'mot-de-passe-essai' }); ok(r.status === 200 && r.body.role === 'admin', 'entre, admin');

    console.log('\n2. L\'accueil');
    r = await call('GET', '/accueil'); ok(r.status === 200 && r.body.pieces.total > 100 && r.body.commandes.n === 0 && r.body.stock.items === 0, 'accueil : ' + r.body.pieces.total + ' pieces, 0 commande, 0 stock');

    console.log('\n3. Le stock');
    var pieces = (await call('GET', '/pieces')).body.pieces, piece = pieces.filter(function(p){ return p.price > 0 && p.rayon === 'bagues'; })[0];
    r = await call('POST', '/stock', { slug: piece.slug, kind: 'unique', minStock: 0, emplacement: 'Coffre', initial: 1 }); ok(r.status === 200 && r.body.onHand === 1 && r.body.name === piece.name, 'piece unique au coffre, 1 exemplaire');
    r = await call('POST', '/stock/' + piece.slug + '/mouvement', { qty: 1, reason: 'entree' }); ok(r.status === 400 && /unique/.test(r.body.error), 'un second exemplaire refuse : ' + r.body.error);
    r = await call('POST', '/stock', { slug: 'piece-qui-n-existe-pas', kind: 'stock' }); ok(r.status === 400, 'une piece hors du site refusee');
    var p2 = pieces.filter(function(p){ return p.price > 0 && p.rayon === 'bracelets'; })[0];
    r = await call('POST', '/stock', { slug: p2.slug, kind: 'stock', minStock: 2, initial: 3 }); ok(r.body.onHand === 3, 'un bracelet en stock, 3');
    r = await call('POST', '/stock/' + p2.slug + '/mouvement', { qty: 2, reason: 'sortie', note: 'salon' }); ok(r.body.onHand === 1, 'sortie de 2 : reste 1');
    r = await call('POST', '/stock/' + p2.slug + '/mouvement', { qty: 5, reason: 'vente' }); ok(r.status === 400 && /zéro/.test(r.body.error), 'une vente de 5 sur 1 refusee');
    r = await call('GET', '/stock'); ok(r.body.resume.items === 2 && r.body.resume.bas === 1 && r.body.stock.every(function(s){ return s.name && s.image; }), 'resume : 2 pieces, 1 stock bas, chaque ligne porte nom et photo');
    ok(r.body.stock.length === r.body.resume.site && r.body.resume.site > 100 && r.body.resume.nonSuivies === r.body.resume.site - 2 && r.body.stock.filter(function(s){ return s.suivi; }).length === 2, 'toutes les pieces du site sont la : ' + r.body.resume.site + ', dont 2 suivies');
    ok(r.body.stock.every(function(s){ return s.siteEtat === 'disponible'; }), 'chaque page du site dit disponible');
    r = await call('POST', '/stock/' + piece.slug + '/site', { etat: 'vendue' }); ok(r.status === 200 && r.body.etat === 'vendue', 'la page de la piece unique passe a vendue (sur la copie)');
    var pageV = fs.readFileSync(path.join(C, 'piece', piece.slug, 'index.html'), 'utf8'); ok(/achat-boutons achat-vendue/.test(pageV) && /sur-mesure\/index\.html/.test(pageV) && /\.achat-etat/.test(fs.readFileSync(path.join(C, 'style.css'), 'utf8')), 'la page porte la mention vendue, le bouton mene au sur-mesure, la feuille a la regle');
    r = await call('POST', '/stock/' + p2.slug + '/site', { etat: 'commande', delai: 21 }); ok(r.status === 200 && /délai 21 jours/.test(fs.readFileSync(path.join(C, 'piece', p2.slug, 'index.html'), 'utf8')), 'le bracelet dit sur commande, delai 21 jours');
    r = await call('POST', '/stock/' + p2.slug + '/site', { etat: 'disponible' }); ok(r.status === 200 && !/achat-etat/.test(fs.readFileSync(path.join(C, 'piece', p2.slug, 'index.html'), 'utf8')), 'et revient disponible, sans trace');
    r = await call('GET', '/stock'); ok(r.body.stock.filter(function(s){ return s.slug === piece.slug; })[0].siteEtat === 'vendue', 'le stock relit l’etat du site');
    r = await call('POST', '/stock/toutes', { kind: 'made_to_order', delaiJours: 30 }); ok(r.status === 200 && r.body.n === r.body.resume.site - 2 && r.body.resume.nonSuivies === 0 && r.body.stock.every(function(s){ return s.suivi; }), 'toutes les autres suivies d’un coup, sur commande a 30 jours : ' + r.body.n);
    ok(r.body.stock.filter(function(s){ return s.kind === 'made_to_order'; })[0].delaiJours === 30, 'le delai est garde');
    console.log('\n3 bis. Une collection');
    r = await call('POST', '/collections', { name: 'Jardin d’hiver' }); ok(r.status === 201 && r.body.slug === 'jardin-d-hiver', 'la collection est creee : ' + (r.body.slug || r.body.error));
    var newPage = path.join(C, 'collections', 'jardin-d-hiver', 'index.html'); ok(fs.existsSync(newPage) && /<h1>Jardin d’hiver <span class="count">\(0\)<\/span>/.test(fs.readFileSync(newPage, 'utf8')), 'sa page existe, vide, a son nom');
    var home = fs.readFileSync(path.join(C, 'index.html'), 'utf8'); ok((home.match(/collections\/jardin-d-hiver\/index\.html/g) || []).length === 2 && /jardin-d-hiver\/index\.html">Jardin d’hiver <span class="n">0<\/span>/.test(home), 'l’accueil la porte dans les deux menus, a 0');
    ok(/collections\/jardin-d-hiver\//.test(fs.readFileSync(path.join(C, 'sitemap.xml'), 'utf8')) && (fs.readFileSync(newPage, 'utf8').match(/jardin-d-hiver\/index\.html/g) || []).length === 2, 'dans le plan du site, et sa propre page a aussi ses menus');
    r = await call('GET', '/pieces'); ok(r.body.vocab.collections['jardin-d-hiver'] === 'Jardin d’hiver', 'le vocabulaire la connait');
    r = await call('POST', '/collections', { name: 'Jardin d’hiver' }); ok(r.status === 400, 'deux fois : refusee');

    console.log('\n4. L\'atelier sur la base');
    r = await call('POST', '/atelier/devis', { customerName: 'Client Essai', items: [{ name: 'Bague', price: 1000, quantity: 2 }], gainPercentage: 10 });
    ok(r.status === 201 && /^DEV-\d{4}-0001$/.test(r.body.reference), 'un devis cree, numero ' + r.body.reference);
    var devis = r.body; r = await call('GET', '/atelier/all'); ok(r.body.records.devis.length === 1 && r.body.records.devis[0].total === 2200, 'relu dans la base, total 2 200 (marge 10 %)');
    r = await call('PUT', '/atelier/maison', { vatRate: '22', quoteDeposit: '30' }); ok(r.status === 200 && r.body.vatRate === '22', 'la maison pose une TVA de 22 % et un acompte de 30 %');
    r = await call('GET', '/atelier/all'); ok(r.body.records.devis[0].total === 2684, 'le total du devis devient TTC : 2 684');
    r = await call('GET', '/atelier/devis/' + devis.id + '/document', undefined, { abs: false }); ok(r.status === 200 && /Sous-total HT|Imponibile/.test(r.body.raw) && /Acconto|Acompte/.test(r.body.raw) && /805,20|805.20/.test(r.body.raw), 'le document imprime le sous-total, la TVA et l’acompte (30 % de 2 684 = 805,20)');
    r = await fetch(B + '/atelier/devis/' + devis.id + '/pdf', { headers: { Cookie: cookie } }); var ct = r.headers.get('content-type') || '', pdf = ct.indexOf('application/pdf') === 0 ? Buffer.from(await r.arrayBuffer()) : null;
    ok(r.status === 200 && pdf && pdf.slice(0, 5).toString() === '%PDF-' || r.status === 501, r.status === 501 ? 'PDF : pas de Chromium sur cette machine, la route le dit (501)' : 'le PDF du devis sort de Chromium (' + (pdf ? pdf.length : 0) + ' octets)');
    r = await call('PUT', '/atelier/maison', { vatRate: '', quoteDeposit: '' }); ok(r.status === 200, 'la maison revient sans TVA');
    r = await call('DELETE', '/atelier/devis/' + devis.id); ok(r.status === 200, 'supprime');
    r = await call('GET', '/atelier/all'); ok(r.body.records.devis.length === 0 && r.body.archives.devis && r.body.archives.devis.length === 1, 'dans les archives');
    r = await call('POST', '/atelier/devis/' + devis.id + '/restaurer'); ok(r.status === 200, 'remis a sa place');
    var r9 = await call('POST', '/atelier/devis', { reference: 'DEV-2026-0099', customerName: 'Numero choisi', items: [{ name: 'X', price: 1, quantity: 1 }] }); ok(r9.status === 201 && r9.body.reference === 'DEV-2026-0099', 'un numero tape a la creation est garde');
    r9 = await call('POST', '/atelier/devis', { reference: 'DEV-2026-0099', customerName: 'Doublon', items: [] }); ok(r9.status === 409, 'le meme numero une seconde fois : 409');
    r = await call('POST', '/atelier/or', { price: '121,68', date: '2026-10-07' }); ok(r.status === 201, 'un cours de l’or enregistre');
    r = await call('PUT', '/atelier/maison', { fullName: 'Alaya Fine Jewelry', invoiceNumbering: 'studio' }); ok(r.status === 200 && r.body.fullName === 'Alaya Fine Jewelry', 'la maison enregistree dans les reglages');

    console.log('\n5. Le mailing sur la base');
    r = await call('POST', '/mailing/contacts', { add: 'Claire Martin, cliente@exemple.fr\nautre@exemple.fr\npas une adresse' }); ok(r.status === 200 && r.body.added === 2 && r.body.ignored === 1, '2 contacts ajoutes, 1 ligne ignoree');
    r = await call('PUT', '/mailing/contacts', { email: 'cliente@exemple.fr', note: 'Aime les saphirs' }); ok(r.status === 200, 'une note sur un contact');
    r = await call('POST', '/mailing/suppressions', { email: 'autre@exemple.fr' }); ok(r.status === 200, 'un desinscrit');
    r = await call('GET', '/mailing/state'); ok(r.body.contacts.length === 2 && r.body.reach === 1 && r.body.suppressions.length === 1, 'etat : 2 contacts, 1 recevra, 1 desinscrit');
    r = await call('PUT', '/mailing/draft', { subject: 'Essai', contenu: '<p>Bonjour</p>', pieces: [piece.slug] }); ok(r.status === 200, 'brouillon garde');
    r = await call('GET', '/mailing/state'); ok(r.body.draft.subject === 'Essai' && r.body.draft.pieces[0] === piece.slug, 'brouillon relu dans la base');

    console.log('\n6. Les commandes, le faux Stripe, le webhook');
    LINES.cs_test_a[0].description = piece.name;
    r = await call('POST', '/vente/relire'); ok(r.status === 200 && r.body.lus === 2 && r.body.nouvelles === 2, 'relire : 2 sessions lues, 2 nouvelles');
    r = await call('GET', '/vente'); ok(r.body.commandes.length === 2 && r.body.resume.payees === 1 && r.body.resume.a_preparer === 1, '2 commandes, 1 payee a preparer');
    r = await call('GET', '/vente/commande/cs_test_a'); ok(r.body.lines.length === 1 && r.body.lines[0].slug === piece.slug && r.body.gift === true && r.body.capture === 'requires_capture', 'la ligne de la commande porte la piece du site ; cadeau ; a encaisser');
    r = await call('GET', '/stock/' + piece.slug); ok(r.body.onHand === 0 && r.body.mouvements[0].reason === 'vente' && r.body.mouvements[0].ref === 'cs_test_a', 'la piece unique est sortie du stock par la commande');
    r = await call('POST', '/vente/relire'); r = await call('GET', '/stock/' + piece.slug); ok(r.body.mouvements.length === 2, 'relire encore : pas de seconde sortie');
    r = await call('PUT', '/vente/commande/cs_test_a', { preparation: 'expediee', suivi: 'LA123456789FR' }); ok(r.status === 200 && r.body.preparation === 'expediee', 'expediee, numero de suivi');
    r = await call('PUT', '/vente/commande/cs_test_a', { preparation: 'perdue' }); ok(r.status === 400, 'un etat inconnu refuse');
    r = await call('POST', '/vente/commande/cs_test_a/capturer', { confirm: 'non' }); ok(r.status === 409, 'encaisser sans le mot : refuse');
    r = await call('POST', '/vente/commande/cs_test_a/capturer', { confirm: 'ENCAISSER' }); ok(r.status === 200 && r.body.capture === 'succeeded' && r.body.preparation === 'expediee', 'encaisse ; la preparation tapee est gardee');
    var payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_b' } } }), t = Math.floor(Date.now() / 1000), sig = 't=' + t + ',v1=' + crypto.createHmac('sha256', WH).update(t + '.' + payload).digest('hex');
    SESSIONS.cs_test_b.payment_status = 'paid'; SESSIONS.cs_test_b.status = 'complete';
    r = await call('POST', '/stripe/webhook', payload, { abs: true, sig: 't=' + t + ',v1=deadbeef' }); ok(r.status === 400, 'webhook mal signe : 400');
    cookie = ''; r = await call('POST', '/stripe/webhook', payload, { abs: true, sig: sig }); ok(r.status === 200 && r.body.ok === true, 'webhook signe, sans session : accepte');
    await call('POST', '/login', { email: 'essai', password: 'mot-de-passe-essai' });
    r = await call('GET', '/vente/commande/cs_test_b'); ok(r.body.paid === 'paid' && r.body.status === 'complete', 'la commande b est passee payee par le webhook');
    r = await call('GET', '/clients'); ok(r.body.clients.length === 2 && r.body.clients.some(function(c){ return c.email === 'cliente@exemple.fr' && c.commandes === 1 && c.depense === 3400 && c.abonne === 1; }), '2 clients ; la cliente : 1 commande, 3 400 depenses, abonnee');
    r = await call('GET', '/clients/un?email=cliente@exemple.fr'); ok(r.body.note === 'Aime les saphirs' && r.body.commandesList.length === 1, 'sa fiche : la note, la commande');
    r = await call('POST', '/vente/commande/cs_test_a/rembourser', { confirm: 'REMBOURSER' }); ok(r.status === 200 && r.body.preparation === 'remboursee', 'remboursee');

    console.log('\n7. Les sauvegardes et la lecture');
    r = await call('POST', '/sauvegardes'); ok(r.status === 201 && /\.sqlite$/.test(r.body.name), 'une sauvegarde faite : ' + r.body.name);
    r = await call('GET', '/sauvegardes'); ok(r.body.sauvegardes.length >= 1 && r.body.sauvegardes[0].size > 0, 'listee, non vide');
    await call('POST', '/users', { email: 'lecteur', name: 'Lecteur', password: 'mot-de-passe-long', role: 'lecture' });
    cookie = ''; await call('POST', '/login', { email: 'lecteur', password: 'mot-de-passe-long' });
    var codes = [await call('POST', '/stock', { slug: p2.slug, kind: 'stock' }), await call('PUT', '/vente/commande/cs_test_a', { note: 'x' }), await call('POST', '/sauvegardes'), await call('POST', '/mailing/contacts', { add: 'x@y.fr' })].map(function(x){ return x.status; });
    ok(codes.every(function(c){ return c === 403; }), 'un compte en lecture n’ecrit rien (' + codes.join(', ') + ')');
    r = await call('GET', '/accueil'); ok(r.status === 200 && r.body.commandes.payees === 2, 'mais lit l’accueil : 2 commandes payees');
    ok(!/Error|TypeError|ReferenceError/.test(log), 'aucune erreur dans le journal du serveur' + (/Error/.test(log) ? ' : ' + log.slice(-400) : ''));
  } catch (e){ console.log('ECHEC  le script s\'est arrete : ' + e.stack); fails++; }
  finally { if (srv) srv.kill(); if (fake) fake.close(); fs.rmSync(TMP, { recursive: true, force: true }); }
  console.log('\n' + (fails ? fails + ' echec' + (fails > 1 ? 's' : '') : 'Tout passe.')); process.exit(fails ? 1 : 0);
})();
