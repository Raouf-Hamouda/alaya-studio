#!/usr/bin/env node
/* LE PARCOURS DU STUDIO DANS UN VRAI NAVIGATEUR, REJOUABLE (4 octobre 2026).
     node tests/parcours.js
   Le vrai site et le vrai studio ne sont pas touches : une copie du site dans le dossier
   temporaire, un studio a part sur le port 8795 avec ses propres donnees, un navigateur
   sans fenetre. Ce qu'il fait : entrer, ouvrir chaque famille et chaque sous-menu a 1600, 930,
   700 et 390 de large (aucune erreur JavaScript, aucun debordement, aucun ecran d'attente),
   ouvrir le menu du clic droit sur une piece et sur une commande, modifier
   une piece et la lire en anglais sur le site, changer un texte de page, creer un compte en
   lecture et verifier qu'il ne peut rien ecrire, puis tout annuler et comparer a l'octet.
   Il faut playwright-core et son Chromium ; les chemins se changent par PLAYWRIGHT et CHROMIUM. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
var ROOT = path.join(__dirname, '..'), REAL = path.resolve(process.env.SITE_DIR || path.join(ROOT, '..', '01_SITE_WEB', 'NEW VERSION', 'SITE double-clic'));
var PW = process.env.PLAYWRIGHT || '/Users/hamouda/Desktop/mezcalitoo/MEZCAL_IVRESSE_DAMOUR/17_SITE/outils/node_modules/playwright-core';
var EXE = process.env.CHROMIUM || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell');
var PORT = 8795, B = 'http://127.0.0.1:' + PORT, TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'alaya-parcours-')), A = path.join(TMP, 'a'), C = path.join(TMP, 'c'), fails = 0, srv;
function ok(cond, label){ console.log((cond ? 'ok     ' : 'ECHEC  ') + label); if (!cond) fails++; }
function copy(from, to){ fs.cpSync(from, to, { recursive: true, filter: function(src){ var b = path.basename(src); return b !== '.git' && !/\.bak_/.test(b); } }); }
function same(){ var bad = 0; (function walk(d){ fs.readdirSync(d, { withFileTypes: true }).forEach(function(e){ var p = path.join(d, e.name), q = path.join(C, path.relative(A, p)); if (e.isDirectory()) walk(p); else if (!fs.existsSync(q) || !fs.readFileSync(p).equals(fs.readFileSync(q))) bad++; }); })(A); return bad; }
(async function(){
  try {
    var pw = require(PW); copy(REAL, A); copy(A, C);
    srv = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), SITE_DIR: C, DATA_DIR: path.join(TMP, 'data'), ADMIN_EMAIL: 'essai', ADMIN_PASSWORD: 'mot-de-passe-essai', STRIPE_SECRET_KEY: '', PUBLIC_SITE: '', PUBLIC_URL: '', COURS_AUTO: '0' }), stdio: 'ignore' });
    await new Promise(function(r){ setTimeout(r, 1800); });
    var b = await pw.chromium.launch({ executablePath: EXE, headless: true }), errs = [];
    var login = async function(ctx, who, pass){ var p = await ctx.newPage(); p.on('pageerror', function(e){ errs.push(e.message); }); p.on('console', function(m){ if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); p.on('response', function(r){ if (r.status() >= 400 && r.status() !== 401 && r.status() !== 403 && !/\/site\/images\//.test(r.url())) errs.push(r.status() + ' ' + r.url()); });   /* the copy of the site carries no images : their 404 is not a fault ; 401 and 403 are the door, tested on purpose */ p.on('dialog', function(d){ d.accept(); });
      await p.goto(B + '/studio/'); await p.fill('#email', who); await p.fill('#password', pass); await p.click('button[type=submit]'); await p.waitForSelector('.home-hello, #table tbody tr'); return p; };
    var shots = process.env.SHOTS ? path.resolve(process.env.SHOTS) : '';
    if (shots) fs.mkdirSync(shots, { recursive: true });
    for (var w of [1600, 930, 700, 390]){
      var ctx = await b.newContext({ viewport: { width: w, height: 1000 }, locale: 'fr-FR' }), p = await login(ctx, 'essai', 'mot-de-passe-essai'), seen = 0, waiting = [], over = [];
      var fams = await p.locator('#railitems button').count();
      for (var f = 0; f < fams; f++){
        await p.locator('#railitems button').nth(f).click(); await p.waitForTimeout(350);
        var subs = await p.locator('#objects .sub').count();
        for (var s = 0; s < subs; s++){ if (/↗/.test(await p.locator('#objects .sub').nth(s).textContent())) continue; await p.locator('#objects .sub').nth(s).click(); await p.waitForTimeout(450); seen++;
          var title = (await p.locator('#title').textContent()).trim();
          if (await p.locator('.pages .empty .sub', { hasText: 'étape suivante' }).count()) waiting.push(title);
          if (await p.evaluate(function(){ return document.documentElement.scrollWidth > innerWidth; })) over.push(title);
          if (shots && (w === 1600 || w === 390)) await p.screenshot({ path: path.join(shots, w + '-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png'), fullPage: false }); }
      }
      ok(!waiting.length && !over.length, 'a ' + w + ' de large : ' + seen + ' ecrans ouverts, aucun ecran d\'attente, aucun debordement' + (waiting.concat(over).length ? ' (' + waiting.concat(over).join(', ') + ')' : ''));
      /* 10 octobre : the sheets on the right at every width : a piece of the stock (untracked, then its first count), a new certificate, a new devis with its number typed */
      await p.locator('#railitems button', { hasText: /^Pièces/ }).click(); await p.waitForTimeout(300); await p.locator('#objects .sub', { hasText: /^Stock/ }).click(); await p.waitForSelector('.pages table.table tbody tr');
      await p.locator('.pages table.table tbody tr:has(.chip.none)').first().click(); await p.waitForSelector('#panel .stock-kinds'); if (shots) await p.screenshot({ path: path.join(shots, w + '-fiche-stock-nouvelle.png') });
      await p.locator('#panel .stock-kinds label').nth(1).click(); await p.locator('#panel .marks .mark', { hasText: 'Suivre cette pièce' }).click(); await p.waitForSelector('#panel .qtybox'); if (shots) await p.screenshot({ path: path.join(shots, w + '-fiche-stock-suivie.png') });
      var sheetOver = await p.evaluate(function(){ return document.documentElement.scrollWidth > innerWidth; });
      ok(await p.locator('#panel .site-etat .chip').count() === 1 && !sheetOver, 'a ' + w + ' : la fiche de stock s\'ouvre, se suit en un clic, dit l\'etat du site, sans debordement');
      await p.keyboard.press('Escape'); await p.locator('#panel .phead .x').click().catch(function(){});
      await p.locator('#railitems button', { hasText: /^Atelier/ }).click(); await p.waitForTimeout(300); await p.locator('#objects .sub', { hasText: /^Certificats de bijoux/ }).click(); await p.waitForTimeout(400);
      await p.locator('.pages .new').first().click(); await p.waitForSelector('#panel .atl-photo'); if (shots) await p.screenshot({ path: path.join(shots, w + '-fiche-certificat.png') });
      var numInput = await p.locator('#panel .rsub input.num').count(); await p.locator('#panel .phead .x').click();
      await p.locator('#objects .sub', { hasText: /^Devis/ }).click(); await p.waitForTimeout(400); await p.locator('.pages .new').first().click(); await p.waitForSelector('#panel .rsub input.num');
      await p.fill('#panel .rsub input.num', 'DEV-TEST-' + w); if (shots) await p.screenshot({ path: path.join(shots, w + '-fiche-devis.png') });
      ok(numInput === 1 && (await p.inputValue('#panel .rsub input.num')) === 'DEV-TEST-' + w, 'a ' + w + ' : le numero d\'un nouveau document se tape');
      await p.locator('#panel .phead .x').click();
      /* the right click on a piece: the menu opens, with its entries, and Escape closes it */
      if (w === 1600){ await p.locator('#railitems button', { hasText: /^Pièces/ }).click(); await p.waitForSelector('#table tbody tr'); await p.locator('#table tbody tr').first().click({ button: 'right' }); await p.waitForTimeout(200);
        var items = await p.locator('.cmenu button, .cmenu a').allTextContents(); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
        ok(items.length >= 5 && items.some(function(t){ return /Son stock/.test(t); }) && !(await p.locator('.cmenu').count()), 'clic droit sur une piece : ' + items.length + ' entrees (' + items.slice(0, 3).join(', ') + '…), Escape ferme');
        await p.locator('#table tbody tr').first().locator('td.more .sign').click(); await p.waitForTimeout(200); var n2 = await p.locator('.cmenu').count(); await p.keyboard.press('Escape');
        ok(n2 === 1, 'les trois points de la ligne ouvrent le meme menu');
        if (shots){ await p.locator('#table tbody tr').first().click({ button: 'right' }); await p.waitForTimeout(200); await p.screenshot({ path: path.join(shots, '1600-clic-droit.png') }); await p.keyboard.press('Escape'); }
        /* the home's tiles lead to their screens */
        await p.locator('#railitems button', { hasText: /^Accueil/ }).click(); await p.waitForSelector('.home-hello'); await p.locator('.tiles .tile').nth(2).click(); await p.waitForTimeout(400);
        ok((await p.locator('#title').textContent()).trim() === 'Stock', 'une tuile de l\'accueil mene a son ecran (Stock)'); }
      await ctx.close();
    }
    var ctx2 = await b.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'fr-FR' }), q = await login(ctx2, 'essai', 'mot-de-passe-essai');
    await q.locator('#railitems button', { hasText: /^Pièces/ }).click(); await q.waitForSelector('#table tbody tr');
    /* the inline edit: a double click on the price, a number, Enter: the site's page carries it */
    await q.fill('#q', 'bague amanda'); await q.waitForTimeout(300); await q.locator('#table tbody tr').first().locator('td.num .cell').dblclick(); await q.locator('.pricepop input[placeholder="Sur demande"]').fill('2600'); await q.locator('.pricepop button', { hasText: 'Enregistrer' }).click(); await q.waitForSelector('.toast'); await q.waitForTimeout(1200);
    ok(/achat-prix">2 600 €/.test(fs.readFileSync(path.join(C, 'piece/bague-amanda/index.html'), 'utf8')), 'double-clic sur le prix dans la table, Entree : 2 600 € ecrit sur le site');
    await q.locator('#table tbody tr').first().locator('td.atl-pick input').check(); await q.waitForTimeout(200);
    ok((await q.locator('#selbar').count()) === 1 && /1 sélectionnée/.test(await q.locator('#selbar').textContent()), 'une case cochee : la barre de selection parait');
    await q.locator('#selbar .btn', { hasText: 'Annuler' }).click(); await q.waitForTimeout(200);
    await q.fill('#q', 'bague amanda'); await q.locator('#table tbody tr').first().click(); await q.waitForSelector('#panel .formpiece');
    await q.locator('#panel .formpiece input[type=text]').first().fill('Bague Amanda Deux'); await q.locator('#panel input[type=number]').fill('2500');
    var tas = q.locator('#panel textarea'); await tas.nth(0).fill('Une émeraude ou un diamant, au choix ?'); await tas.nth(2).fill('An emerald or a diamond, your choice?');
    await q.locator('#panel .formfoot .mark').first().click(); await q.waitForSelector('.toast'); await q.waitForTimeout(900);
    var page = fs.readFileSync(path.join(C, 'piece/bague-amanda/index.html'), 'utf8');
    ok(/<h1>Bague Amanda Deux<\/h1>/.test(page) && /achat-prix">2 500 €/.test(page), 'une piece modifiee depuis sa fiche : nom et prix ecrits sur le site');
    var site = await ctx2.newPage(); await site.goto(B + '/site/piece/bague-amanda/index.html'); await site.evaluate(function(){ localStorage.setItem('alaya-langue', 'en'); }); await site.reload(); await site.waitForTimeout(1000);
    ok((await site.locator('.achat-idee').textContent()) === 'An emerald or a diamond, your choice?', 'sa phrase anglaise s\'affiche sur le site en anglais');
    await q.keyboard.press('Escape'); await q.locator('#railitems button', { hasText: /^Site$/ }).click(); await q.waitForSelector('.pages .table tbody tr');
    await q.locator('.pages .table tbody tr', { hasText: 'la-maison' }).click(); await q.waitForSelector('#panel textarea');
    var t3 = q.locator('#panel textarea').nth(3); await t3.fill((await t3.inputValue()) + ' Phrase ajoutée.'); await q.locator('#panel .pfoot .btn.primary').click(); await q.waitForSelector('.toast'); await q.waitForTimeout(700);
    ok(fs.readFileSync(path.join(C, 'la-maison/index.html'), 'utf8').indexOf('Phrase ajoutée.') > 0, 'un texte de page change depuis sa fiche');
    await q.keyboard.press('Escape'); await q.locator('#railitems button', { hasText: /^Réglages/ }).click(); await q.waitForTimeout(300); await q.locator('#objects .sub', { hasText: 'Comptes' }).click(); await q.waitForSelector('.pages .table tbody tr');
    var inp = q.locator('.pages .fields.sender input'); await inp.nth(0).fill('lecteur'); await inp.nth(1).fill('Lecteur'); await inp.nth(2).fill('mot-de-passe-long'); await q.locator('.pages .actions .mark').click(); await q.waitForTimeout(700);
    var r = await login(await b.newContext({ locale: 'fr-FR' }), 'lecteur', 'mot-de-passe-long');
    var codes = await r.evaluate(function(){ var h = { 'Content-Type': 'application/json', 'X-Requested-With': 'alaya' }; return Promise.all([fetch('../api/pieces/bague-amanda', { method: 'PUT', headers: h, body: '{}' }), fetch('../api/textes/page?f=la-maison/index.html', { method: 'PUT', headers: h, body: '{}' }), fetch('../api/users'), fetch('../api/publier', { method: 'POST', headers: h, body: '{}' })]).then(function(l){ return l.map(function(x){ return x.status; }); }); });
    errs = errs.filter(function(e){ return !/403 \(Forbidden\)/.test(e); });   /* the four refusals just asked for */
    ok(codes.every(function(c){ return c === 403; }), 'un compte en lecture ne peut rien ecrire ni publier (' + codes.join(', ') + ')');
    /* the stock from a piece's right click, and a movement from its sheet */
    await q.locator('#railitems button', { hasText: /^Pièces/ }).click(); await q.waitForSelector('#table tbody tr'); await q.locator('#table tbody tr').nth(1).click({ button: 'right' }); await q.locator('.cmenu button', { hasText: 'Son stock' }).click(); await q.waitForTimeout(900);
    ok((await q.locator('#title').textContent()).trim() === 'Stock' && (await q.locator('#panel .qtybox b').count()) === 1 && (await q.locator('#panel .qtybox b').textContent()) === '1', 'clic droit, Son stock : la piece est suivie, 1 exemplaire, sa fiche ouverte');
    await q.locator('#panel .qtybox button').first().click(); await q.waitForTimeout(900);
    ok((await q.locator('#panel .qtybox b').textContent()) === '0' && (await q.locator('#panel .mv-list li').count()) === 2, 'une sortie depuis la fiche : 0 en main, deux mouvements dans l\'historique');
    await q.keyboard.press('Escape');
    await q.locator('#railitems button', { hasText: /^Pièces/ }).click(); await q.waitForTimeout(400);
    for (var i = 0; i < 3; i++){ await q.locator('#undo').click(); await q.waitForTimeout(1500); }
    ok(same() === 0, 'trois annulations : la copie du site revient a l\'octet pres');
    ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
    await b.close();
  } catch (e){ console.log('ECHEC  le parcours s\'est arrete : ' + String(e.stack || e).split('\n').slice(0, 3).join(' / ')); fails++; }
  finally { if (srv) srv.kill(); fs.rmSync(TMP, { recursive: true, force: true }); }
  console.log('\n' + (fails ? fails + ' echec' + (fails > 1 ? 's' : '') : 'Tout passe.')); process.exit(fails ? 1 : 0);
})();
