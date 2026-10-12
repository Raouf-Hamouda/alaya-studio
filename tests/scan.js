#!/usr/bin/env node
/* LE BALAYAGE DU STUDIO (7 octobre 2026) : chaque ecran, a 1600 et a 390 de large, mesure.
     node tests/scan.js
   Ce qu'il releve, ecran par ecran : les erreurs de console, les requetes en echec (404, 500),
   le debordement horizontal, un "null", "undefined" ou "NaN" dans le texte, un identifiant en
   double, une image cassee, un bouton sans mot, et la marge gauche de la barre et du contenu
   (elles doivent etre les memes partout). Une ligne par defaut trouve, et le compte a la fin. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
var ROOT = path.join(__dirname, '..'), REAL = path.resolve(process.env.SITE_DIR || path.join(ROOT, '..', '01_SITE_WEB', 'NEW VERSION', 'SITE double-clic'));
var PW = process.env.PLAYWRIGHT || '/Users/hamouda/Desktop/mezcalitoo/MEZCAL_IVRESSE_DAMOUR/17_SITE/outils/node_modules/playwright-core';
var EXE = process.env.CHROMIUM || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell');
var PORT = Number(process.env.PORT_TEST) || 8793, B = 'http://127.0.0.1:' + PORT, TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'alaya-scan-')), C = path.join(TMP, 'c'), srv, found = 0;
function copy(from, to){ fs.cpSync(from, to, { recursive: true, filter: function(src){ var b = path.basename(src); return b !== '.git' && !/\.bak_/.test(b); } }); }
(async function(){
  try {
    var pw = require(PW); copy(REAL, C);
    srv = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), SITE_DIR: C, DATA_DIR: path.join(TMP, 'data'), ADMIN_EMAIL: 'essai', ADMIN_PASSWORD: 'mot-de-passe-essai', STRIPE_SECRET_KEY: '', PUBLIC_SITE: '', PUBLIC_URL: '', OPEN_STUDIO: '' }), stdio: 'ignore' });
    await new Promise(function(r){ setTimeout(r, 1600); });
    var b = await pw.chromium.launch({ executablePath: EXE, headless: true });
    for (var w of [1600, 390]){
      var ctx = await b.newContext({ viewport: { width: w, height: 1000 }, locale: 'fr-FR' }), p = await ctx.newPage(), errs = [], bad = [];
      p.on('pageerror', function(e){ errs.push(e.message); }); p.on('console', function(m){ if (m.type() === 'error') errs.push(m.text()); });
      p.on('response', function(r){ if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(B, '')); }); p.on('dialog', function(d){ d.accept(); });
      await p.goto(B + '/studio/'); await p.fill('#email', 'essai'); await p.fill('#password', 'mot-de-passe-essai'); await p.click('button[type=submit]'); await p.waitForSelector('.home-hello');
      var fams = await p.locator('#railitems button').count(), margins = {}, seen = 0;
      for (var f = 0; f < fams; f++){
        await p.locator('#railitems button').nth(f).click(); await p.waitForTimeout(300);
        var subs = await p.locator('#objects .sub').count();
        for (var s = 0; s < subs; s++){
          if (/↗/.test(await p.locator('#objects .sub').nth(s).textContent())) continue;
          errs.length = 0; bad.length = 0;
          await p.locator('#objects .sub').nth(s).click(); await p.waitForTimeout(700); seen++;
          var title = (await p.locator('#title').textContent()).trim(), tag = w + ' · ' + title;
          var m = await p.evaluate(function(){
            var out = { over: document.documentElement.scrollWidth > innerWidth, nulls: [], dupIds: [], brokenImg: 0, emptyBtn: 0, barLeft: 0, contentLeft: 0, contentTop: 0 };
            var walker = document.createTreeWalker(document.querySelector('.main'), NodeFilter.SHOW_TEXT), t;
            while ((t = walker.nextNode())){ if (/\b(null|undefined|NaN)\b/.test(t.nodeValue) && t.parentElement.offsetParent) out.nulls.push(t.nodeValue.trim().slice(0, 40)); }
            var ids = {}; document.querySelectorAll('[id]').forEach(function(e){ ids[e.id] = (ids[e.id] || 0) + 1; }); Object.keys(ids).forEach(function(k){ if (ids[k] > 1) out.dupIds.push(k); });
            document.querySelectorAll('.main img, #panel img').forEach(function(i){ if (i.complete && i.naturalWidth === 0 && i.offsetParent) out.brokenImg++; });
            document.querySelectorAll('.main button, #panel button').forEach(function(bt){ if (bt.offsetParent && !bt.textContent.trim() && !bt.getAttribute('aria-label') && !bt.title) out.emptyBtn++; });
            var main = document.querySelector('.main').getBoundingClientRect(), bar = document.querySelector('.bar h1, .bar .crumb'), first = document.querySelector('#pfilters:not([hidden]), .tablewrap:not([hidden]) table, .pages:not([hidden]) > *:not(.note)');
            if (bar) out.barLeft = Math.round(bar.getBoundingClientRect().left - main.left);
            if (first){ var r = first.getBoundingClientRect(); out.contentLeft = Math.round(r.left - main.left); out.contentTop = Math.round(r.top - document.querySelector('.bar').getBoundingClientRect().bottom); }
            return out;
          });
          var key = m.barLeft + '/' + m.contentLeft; margins[key] = (margins[key] || []).concat([title]);
          var say = function(x){ console.log('DEFAUT  ' + tag + ' : ' + x); found++; };
          if (errs.length) say('console : ' + errs.slice(0, 2).join(' | ').slice(0, 160));
          if (bad.length) say('requetes : ' + bad.slice(0, 3).join(', '));
          if (m.over) say('deborde horizontalement');
          if (m.nulls.length) say('texte null/undefined/NaN : ' + m.nulls.slice(0, 3).join(' ; '));
          if (m.dupIds.length) say('ids en double : ' + m.dupIds.join(', '));
          if (m.brokenImg) say(m.brokenImg + ' image(s) cassee(s)');
          if (m.emptyBtn) say(m.emptyBtn + ' bouton(s) sans mot ni etiquette');
          if (m.contentTop > 40) say('contenu a ' + m.contentTop + ' px sous la barre');
        }
      }
      console.log(w + ' de large : ' + seen + ' ecrans. Marges (barre/contenu) : ' + Object.keys(margins).map(function(k){ return k + ' x' + margins[k].length + (margins[k].length < 4 ? ' (' + margins[k].join(', ') + ')' : ''); }).join(' ; '));
      await ctx.close();
    }
    await b.close();
  } catch (e){ console.log('ECHEC  le balayage s\'est arrete : ' + String(e.stack || e).split('\n').slice(0, 2).join(' / ')); found++; }
  finally { if (srv) srv.kill(); fs.rmSync(TMP, { recursive: true, force: true }); }
  console.log('\n' + (found ? found + ' defaut' + (found > 1 ? 's' : '') : 'Rien a signaler.')); process.exit(found ? 1 : 0);
})();
