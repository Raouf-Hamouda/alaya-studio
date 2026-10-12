/* ===========================================================
   LE MAILING, derriere la famille Mailing du studio (4 octobre 2026).
   Sur le modele de la newsletter du studio Instinct (server/newsletter.js).

   Tout vit dans la base (base.js, data/studio.sqlite) depuis le 7 octobre 2026 :
     contacts         la liste de la maison (email, nom, source, note)
     campagnes, destinataires, evenements, suppressions, jetons : le store du
                      moteur (newsletter_engine.mjs, le moteur d'Instinct), sur SQL
     reglages mailing la boite d'envoi : adresse, serveur, port, nom affiche
     reglages mailing_draft  le brouillon en cours
   Un seul fichier reste a part : DATA_DIR/mailing/pass, le mot de passe de la boite,
   seul dans son fichier (600), jamais rendu par aucune route.

   Ce qui est repris du moteur d'Instinct : le store, l'assemblage MIME, la version
   texte, les compteurs. Ce qui n'en est PAS repris : le suivi (pixel, liens
   reecrits, page de desinscription). Ils demandent un serveur public ; le studio
   tourne sur ce Mac, donc le mail part avec ses liens tels quels et la
   desinscription est un mailto vers la boite d'envoi. Aucune ouverture, aucun
   clic n'est compte, et aucun chiffre n'est affiche a leur place.

   RIEN NE PART TOUT SEUL : un envoi demande { confirm: 'ENVOYER', count: n } et
   n doit etre le nombre de personnes qui recevront vraiment. Une file interrompue
   par un arret du programme ne repart pas d'elle-meme : bouton Reprendre.
   =========================================================== */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');

module.exports = function(cfg, T){
  var dir = path.join(cfg.data, 'mailing');
  fs.mkdirSync(dir, { recursive: true });
  var passFile = path.join(dir, 'pass'), B = cfg.base || T.base;
  var ORIGIN = 'https://alayafinejewelry.com', DAILY_CAP = +process.env.MAILING_DAILY_CAP || 1800, PAUSE_MS = process.env.MAILING_PAUSE_MS === undefined ? 1000 : +process.env.MAILING_PAUSE_MS;
  var VALID = /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]{2,}$/;

  /* THE PUBLIC ADDRESS (round 3). On a server, cfg.publicUrl is the address people reach: the mail then
     carries a pixel, its links pass through the studio, and the way out is a real page, all under /m/.
     On the Mac it is '' and nothing of this exists: no pixel, links as written, a mailto to unsubscribe. */
  var PUBLIC = T.txt(cfg.publicUrl).replace(/\/+$/, ''), TRACK = PUBLIC ? PUBLIC + '/m' : '';
  var secretFile = path.join(dir, 'secret');
  /* what signs the links of a mail: made once, kept in its own file (600), never sent anywhere */
  function secret(){
    try { var v = fs.readFileSync(secretFile, 'utf8').trim(); if (v) return v; } catch (e){}
    var n = crypto.randomBytes(48).toString('base64url'); fs.writeFileSync(secretFile, n + '\n', { mode: 0o600 }); fs.chmodSync(secretFile, 0o600); return n;
  }
  var engine = import('./newsletter_engine.mjs');   /* the module, once */
  var store = Promise.resolve(B.mailStore);   /* the engine's store, on the base */

  /* ---------- the sender box ---------- */
  function settings(){
    var s = B.reglages.get('mailing', {}), pass = ''; try { pass = fs.readFileSync(passFile, 'utf8').trim(); } catch (e){}
    return { user: T.txt(s.user).trim().toLowerCase(), host: T.txt(s.host).trim() || 'smtp.gmail.com', port: +s.port || 587, name: T.txt(s.name).trim() || 'Alaya Fine Jewelry', pass: pass,
             imapHost: T.txt(s.imapHost).trim() || (T.txt(s.host).trim() || 'smtp.gmail.com').replace(/^smtp[.-]/, 'imap.'), imapPort: +s.imapPort || 993 };
  }
  function publicSettings(){ var s = settings(); return { user: s.user, host: s.host, port: s.port, name: s.name, imapHost: s.imapHost, imapPort: s.imapPort, passSet: !!s.pass, configured: !!(s.user && s.pass) }; }
  /* SMTP with the box's password. 465 is TLS from the first byte, anything else upgrades with
     STARTTLS and refuses to go on without it, except a server on this Mac (the test bench). */
  function transport(){
    var s = settings();
    if (!VALID.test(s.user) || !s.pass) throw new Error('bo\u00eete d\u2019envoi non renseign\u00e9e : l\u2019adresse et son mot de passe');
    var local = /^(127\.0\.0\.1|localhost)$/.test(s.host);
    return require('nodemailer').createTransport({ host: s.host, port: s.port, secure: s.port === 465, requireTLS: !local && s.port !== 465, ignoreTLS: local,
      auth: { user: s.user, pass: s.pass.replace(/\s+/g, '') }, connectionTimeout: 15000, greetingTimeout: 15000 });
  }

  /* ---------- the contacts ---------- */
  function contacts(){ return B.contacts.list(); }
  /* people out of anything pasted or out of a CSV: one per line, the address wherever it sits on
     the line. The line is cut in cells the way a CSV is ("Martin, Claire" is one cell); the name is
     "Name <a@b>" or the first other cell that reads like a name. A line without an address is counted. */
  function cells(line){
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++){
      var ch = line[i];
      if (ch === '"'){ if (q && line[i + 1] === '"'){ cur += '"'; i++; } else q = !q; }
      else if (!q && (ch === ',' || ch === ';' || ch === '\t')){ out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map(function(c){ return c.trim(); });
  }
  function parsePeople(text){
    var out = [], seen = {}, ignored = 0, twice = 0;
    T.txt(text).replace(/^﻿/, '').split(/[\n\r]+/).forEach(function(line, n){
      if (!line.trim()) return;
      var cs = cells(line), found = [], names = [];
      cs.forEach(function(c){
        var m = /^(.*?)<?([^\s<>"'()]+@[^\s<>"'()]+\.[^\s<>"'()]+?)>?[.]*$/.exec(c);
        var e = m ? m[2].toLowerCase().replace(/^mailto:/, '') : '';
        if (m && VALID.test(e)){ found.push(e); if (m[1].trim()) names.push(m[1].trim()); }
        else if (c && c.indexOf('@') < 0 && /[A-Za-zÀ-ſ]/.test(c)) names.push(c);
      });
      if (!found.length){ if (!(n === 0 && cs.every(function(c){ return /^(e-?mail|nom|name|pr[eé]nom|adresse|courriel|)$/i.test(c); }))) ignored++; return; }
      var name = found.length === 1 ? (names[0] || '').replace(/\s+/g, ' ').slice(0, 120) : '';
      found.forEach(function(e){ if (seen[e]){ twice++; return; } seen[e] = 1; out.push({ email: e, name: name }); });
    });
    out.ignored = ignored; out.twice = twice;
    return out;
  }
  function addContacts(text, source){
    var added = [], people = parsePeople(text), already = people.twice;
    B.tx(function(){ people.forEach(function(p){ if (B.contacts.add({ email: p.email, name: p.name, source: source || 'studio', addedAt: T.now() })) added.push(p.email); else already++; }); });
    return { added: added.length, already: already, ignored: people.ignored, emails: added };
  }

  /* ---------- the mail: Alaya's dress, one column, tables and inline styles because it is a mail ---------- */
  function esc(s){ return T.txt(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var SERIF = "font-family:'EB Garamond',Georgia,'Times New Roman',serif", SANS = "font-family:Manrope,'Helvetica Neue',Helvetica,Arial,sans-serif";
  var THEME = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="format-detection" content="telephone=no"><title>{{subject}}</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Manrope:wght@400;600&display=swap" rel="stylesheet">' +
    '<style>body{margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%}table{border-collapse:collapse}img{border:0;outline:none;text-decoration:none;display:block}' +
    'a{text-decoration:none}@media only screen and (max-width:640px){.wrap{width:100% !important}.pad{padding-left:20px !important;padding-right:20px !important}}</style></head>' +
    '<body style="margin:0;padding:0;background:#ffffff">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:40px 16px 44px">' +
    '<table role="presentation" class="wrap" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px">' +
    '<tr><td align="center" style="padding:0 0 40px"><a href="' + ORIGIN + '/" style="text-decoration:none"><img src="' + ORIGIN + '/images/logo/alaya-logo-noir.png" width="170" alt="Alaya Fine Jewelry" style="width:170px;height:auto;margin:0 auto"></a></td></tr>' +
    '<tr><td class="pad" style="padding:0 40px">{{contenu}}</td></tr>' +
    '{{pieces}}' +
    '<tr><td class="pad" style="padding:34px 40px 0;' + SANS + ';font-size:12px;line-height:1.8;color:#8a8a8a;text-align:center;border-top:1px solid #ebebeb">' +
    '<span style="font-size:10px;line-height:1;letter-spacing:.2em;text-transform:uppercase;color:#111;font-weight:600">Alaya Fine Jewelry</span><br>9 rue Ramey, 75018 Paris<br>' +
    '<a href="https://www.instagram.com/alayafinejewelry/" style="color:#8a8a8a;text-decoration:underline">Instagram</a>' +
    '&nbsp;&nbsp;\u00b7&nbsp;&nbsp;<a href="{{unsubscribe}}" style="color:#8a8a8a;text-decoration:underline">Ne plus recevoir ces mails</a></td></tr>' +
    '</table></td></tr></table></body></html>';
  /* each paragraph without a style takes the mail's paragraph style (Instinct's styleContent, in Alaya's fonts) */
  function styleContent(html){
    return T.txt(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<p(?![^>]*style=)/gi, '<p style="margin:0 0 16px;' + SERIF + ';font-size:17px;line-height:1.6;color:#111"')
      .replace(/<h1(?![^>]*style=)/gi, '<h1 style="margin:0 0 16px;' + SERIF + ';font-size:28px;line-height:1.25;font-weight:400;color:#111"')
      .replace(/<h2(?![^>]*style=)/gi, '<h2 style="margin:24px 0 10px;' + SERIF + ';font-size:21px;line-height:1.3;font-weight:400;color:#111"')
      .replace(/<h3(?![^>]*style=)/gi, '<h3 style="margin:24px 0 8px;' + SANS + ';font-size:10px;line-height:1;letter-spacing:.2em;text-transform:uppercase;font-weight:600;color:#111"')
      .replace(/<li(?![^>]*style=)/gi, '<li style="' + SERIF + ';font-size:17px;line-height:1.6;color:#111"')
      .replace(/<img(?![^>]*width=)/gi, '<img width="100%" style="max-width:560px;height:auto;display:block;margin:0 0 16px"')
      .replace(/<a(?![^>]*style=)/gi, '<a style="color:#111;text-decoration:underline"');
  }
  function prix(p){ return p > 0 ? String(Math.round(p)).replace(/\B(?=(\d{3})+$)/g, '\u00a0') + '\u00a0\u20ac' : 'Prix sur demande'; }
  /* the pieces put forward, two per row, each one the site's own square, its name, its price, its page */
  function pieceCards(slugs){
    var all = {}; T.catalogue.all().forEach(function(p){ all[p.slug] = p; });
    var list = (Array.isArray(slugs) ? slugs : []).map(function(s){ return all[s]; }).filter(Boolean).slice(0, 12);
    if (!list.length) return '';
    var cell = function(p){
      var url = ORIGIN + '/piece/' + p.slug + '/';
      return '<td width="50%" valign="top" align="center" style="padding:0 10px 30px"><a href="' + url + '" style="text-decoration:none;color:#111">' +
        '<img src="' + ORIGIN + '/' + esc(p.image) + '" width="260" alt="' + esc(p.name) + '" style="width:100%;max-width:260px;height:auto;margin:0 auto"></a>' +
        '<p style="margin:12px 0 2px;' + SERIF + ';font-size:17px;line-height:1.3;color:#111"><a href="' + url + '" style="color:#111;text-decoration:none">' + esc(p.name) + '</a></p>' +
        '<p style="margin:0 0 8px;' + SANS + ';font-size:12px;line-height:1.4;color:#6b6b6b">' + prix(p.price) + '</p>' +
        '<a href="' + url + '" style="' + SANS + ';font-size:10px;letter-spacing:.18em;text-transform:uppercase;font-weight:600;color:#111;text-decoration:underline">D\u00e9couvrir</a></td>';
    };
    var rows = '';
    /* 10 octobre : a lone piece (the only one, or the last of an odd list) takes the whole row and sits centred */
    for (var i = 0; i < list.length; i += 2) rows += '<tr>' + (list[i + 1] ? cell(list[i]) + cell(list[i + 1]) : cell(list[i]).replace('<td width="50%"', '<td colspan="2" width="100%"')) + '</tr>';
    return '<tr><td class="pad" style="padding:14px 30px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table></td></tr>';
  }
  function unsubscribeLink(){ var s = settings(); return 'mailto:' + (s.user || 'contact@alayafinejewelry.com') + '?subject=' + encodeURIComponent('D\u00e9sinscription'); }
  function htmlOf(b, tracked){
    return THEME.replace('{{subject}}', esc(b.subject)).replace('{{contenu}}', styleContent(b.contenu) || '<p style="margin:0">&nbsp;</p>')
      .replace('{{pieces}}', pieceCards(b.pieces)).replace('{{unsubscribe}}', tracked ? '%unsubscribe_url%' : unsubscribeLink());
  }
  /* the text part is the body only: the <title> is not a line of the mail */
  function noHead(html){ return html.replace(/<head>[\s\S]*?<\/head>/i, ''); }
  function headOf(html){ var i = html.indexOf('</head>'); return i < 0 ? '' : html.slice(0, i + 7); }
  function bodyOf(html){ return html.slice(headOf(html).length); }
  /* a name with a comma ("Martin, Claire") is quoted, or the To line reads as two addresses */
  function displayName(n){ n = T.txt(n).trim(); if (!n) return undefined; return /^[\x20-\x7e]*$/.test(n) && /[,;:<>@()\[\]"\\]/.test(n) ? '"' + n.replace(/["\\]/g, '') + '"' : n; }
  function hasBody(b){ var c = T.txt(b.contenu); return !!c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() || /<(img|table)/i.test(c) || (Array.isArray(b.pieces) && b.pieces.length > 0); }

  /* ---------- who receives: the contacts, minus the unsubscribed ---------- */
  function audience(){
    return store.then(function(st){ return st.listSuppressions(); }).then(function(sup){
      var out = {}; sup.forEach(function(s){ out[s.email] = 1; });
      return contacts().filter(function(c){ return VALID.test(c.email) && !out[c.email]; });
    });
  }

  /* ---------- the queue: one person at a time, a pause between two, nothing rewritten in the mail ---------- */
  var draining = false;
  function drain(){
    if (draining) return Promise.resolve();
    draining = true;
    return Promise.all([engine, store]).then(function(x){
      var M = x[0], st = x[1], s = settings(), tr = transport(), unsub = unsubscribeLink();
      var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
      var one = function(r){
        return Promise.all([st.getCampaign(r.campaignId), st.isSuppressed(r.email), st.sentLast24h(s.user)]).then(function(y){
          var c = y[0];
          if (!c || ['queued', 'sending'].indexOf(c.status) < 0) return;
          if (y[1]) return st.markSkipped(r.id, 'adresse d\u00e9sinscrite');
          if (y[2] >= DAILY_CAP) return st.setCampaignStatus(c.id, 'paused');
          /* "Martin, Claire" is a family name first: the first name is what follows the comma */
          var nm = T.txt(r.name).trim(), prenom = (nm.indexOf(',') >= 0 ? nm.split(',')[1] : nm).trim().split(/\s+/)[0] || '';
          var html = c.html.replace(/\{\{\s*prenom\s*\}\}/g, M.escapeHtml(prenom)).replace(/\{\{\s*nom\s*\}\}/g, M.escapeHtml(T.txt(r.name).trim()));
          /* a send made with a public address: the engine's own personalisation (Instinct's), every link
             through /m/t/c, the pixel /m/t/o, the way out /m/u, each signed for this one person; and the
             two List-Unsubscribe headers of the one-click rule. Otherwise the mail as written, and a mailto. */
          /* only the body is personalised: the <head> holds the link to the fonts, which is not a link of the mail */
          var perso = (c.tracked && TRACK) ? M.personnaliser(bodyOf(html), { rid: r.id, email: r.email, name: r.name }, TRACK, secret()) : null;
          var out = perso ? headOf(html) + perso.html : html.replace(/%unsubscribe_url%/g, unsub);
          var mime = M.buildMime({ from: c.fromEmail, fromName: c.fromName, to: r.email, toName: displayName(r.name), subject: c.subject, html: out, text: M.versTexte(noHead(out)), unsubscribeUrl: perso ? perso.unsubscribeUrl : undefined });
          if (!perso) mime = mime.replace('MIME-Version: 1.0', 'MIME-Version: 1.0\r\nList-Unsubscribe: <' + unsub + '>');
          return (c.status === 'queued' ? st.setCampaignStatus(c.id, 'sending') : Promise.resolve())
            /* NOBODY RECEIVES TWICE: the line is marked before the mail is handed over. A stop of the program
               between the two leaves it "failed, to check", and Reprendre does not write to that person again. */
            .then(function(){ return st.markFailed(r.id, 'envoi interrompu avant confirmation : à vérifier dans la boîte d’envoi'); })
            .then(function(){ return tr.sendMail({ envelope: { from: c.fromEmail, to: [r.email] }, raw: mime }); })
            .then(function(info){ return st.markSent(r.id, String(info.messageId || info.response || ''), ''); }, function(e){ return st.markFailed(r.id, e && e.message || String(e)); })
            .then(function(){ return sleep(PAUSE_MS); });
        });
      };
      var loop = function(){
        return st.nextQueued(20).then(function(lot){
          if (!lot.length) return;
          return lot.reduce(function(p, r){ return p.then(function(){ return one(r); }); }, Promise.resolve()).then(loop);
        });
      };
      return loop().then(function(){ return st.listCampaigns(); }).then(function(cs){
        return Promise.all(cs.filter(function(c){ return c.status === 'sending' || c.status === 'queued'; }).map(function(c){
          return st.listRecipients(c.id).then(function(rs){ if (!rs.some(function(r){ return r.status === 'queued'; })) return st.setCampaignStatus(c.id, 'done'); });
        }));
      }).then(function(){ tr.close(); });
    }).then(function(){ draining = false; }, function(e){ draining = false; throw e; });
  }

  function state(){
    return Promise.all([engine, store]).then(function(x){
      var M = x[0], st = x[1], s = publicSettings();
      return Promise.all([st.listSuppressions(), st.listCampaigns(), s.user ? st.sentLast24h(s.user) : 0]).then(function(y){
        var out = {}; y[0].forEach(function(q){ out[q.email] = 1; });
        var list = contacts();
        return Promise.all(y[1].map(function(c){ return M.campaignStats(st, c.id).then(function(stats){ return { id: c.id, subject: c.subject, createdAt: c.createdAt, createdBy: c.createdBy || '', status: c.status, tracked: !!c.tracked, stats: stats }; }); })).then(function(camps){
          return { sender: s, contacts: list, suppressions: y[0], reach: list.filter(function(c){ return !out[c.email]; }).length, remaining: Math.max(0, DAILY_CAP - y[2]),
                   campaigns: camps, draining: draining, cap: DAILY_CAP, tracking: !!TRACK, publicUrl: PUBLIC, draft: B.reglages.get('mailing_draft', { subject: '', contenu: '', pieces: [] }), origin: ORIGIN };
        });
      });
    });
  }

  /* ---------- THE RETURNS: the mails a server sends back when an address does not exist ----------
     Instinct's engine reads them through the Gmail API (a service account, googleapis): that road needs
     two libraries the studio does not have. Here the sender box is read over IMAP with what Node has
     (tls), the box's own address and password: the messages of the last days that come from
     mailer-daemon or postmaster, each one read once. A delivery-status notification names the address
     (Final-Recipient) and says how it ended (Status 5.x.x, Action failed): that address is marked
     "adresse en échec" on its send and joins the list nobody writes to. A 4.x.x (delayed) is left alone.
     ponytail: LOGIN only, INBOX only, 100 messages at most; a box behind OAuth, or returns filed in
     another folder, are not read. An IMAP library if that day comes. */
  function imapRead(o){
    return new Promise(function(resolve, reject){
      var local = /^(127\.0\.0\.1|localhost)$/.test(o.host);
      var sock = local ? require('net').connect(o.port, o.host) : require('tls').connect({ host: o.host, port: o.port, servername: o.host });
      var buf = Buffer.alloc(0), tag = 0, waiting = null, parts = [], done = false, greeted = false;
      var finish = function(err, val){ if (done) return; done = true; sock.destroy(); if (err) reject(err); else resolve(val); };
      var cmd = function(text){ return new Promise(function(ok, ko){ var t = 'A' + (++tag); parts = []; waiting = { tag: t, ok: ok, ko: ko }; sock.write(t + ' ' + text + '\r\n'); }); };
      var q = function(v){ return '"' + String(v).replace(/[\\"]/g, '\\$&') + '"'; };
      var d = new Date(Date.now() - o.days * 86400000), since = d.getUTCDate() + '-' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + '-' + d.getUTCFullYear();
      var start = function(){
        cmd('LOGIN ' + q(o.user) + ' ' + q(o.pass)).then(function(){ return cmd('EXAMINE INBOX'); })
          .then(function(){ return cmd('UID SEARCH SINCE ' + since + ' OR FROM "mailer-daemon" FROM "postmaster"'); })
          .then(function(ps){
            var ids = []; ps.forEach(function(l){ if (typeof l === 'string' && /^\* SEARCH/i.test(l)) l.split(/\s+/).slice(2).forEach(function(x){ if (/^\d+$/.test(x)) ids.push(x); }); });
            var out = [];
            return ids.slice(-100).reduce(function(pr, id){ return pr.then(function(){ return cmd('UID FETCH ' + id + ' BODY.PEEK[]'); }).then(function(ps2){ ps2.forEach(function(x){ if (Buffer.isBuffer(x)) out.push(x.toString('utf8')); }); }); }, Promise.resolve()).then(function(){ return out; });
          }).then(function(out){ try { sock.write('Z LOGOUT\r\n'); } catch (e){} finish(null, out); }, finish);
      };
      /* the reader: lines, and the literals {n} some of them announce */
      var pump = function(){
        for (;;){
          var i = buf.indexOf('\r\n'); if (i < 0) return;
          var line = buf.slice(0, i).toString('latin1'), lit = /\{(\d+)\}$/.exec(line);
          if (lit){ var n = +lit[1]; if (n > 5 * 1048576) return finish(new Error('message trop gros')); if (buf.length < i + 2 + n) return; parts.push(line, buf.slice(i + 2, i + 2 + n)); buf = buf.slice(i + 2 + n); continue; }
          buf = buf.slice(i + 2);
          if (!greeted){ greeted = true; if (!/^\* OK/i.test(line)) return finish(new Error('la boîte de réception a répondu : ' + line.slice(0, 120))); start(); continue; }
          if (waiting && line.indexOf(waiting.tag + ' ') === 0){ var w = waiting; waiting = null; if (/^\S+ OK/i.test(line)) w.ok(parts); else w.ko(new Error('la boîte de réception a refusé : ' + line.slice(w.tag.length + 1, 160))); }
          else parts.push(line);
        }
      };
      sock.setTimeout(20000, function(){ finish(new Error('la boîte de réception ne répond pas (' + o.host + ':' + o.port + ')')); });
      sock.on('error', function(e){ finish(new Error('la boîte de réception ne se lit pas : ' + e.message)); });
      sock.on('close', function(){ finish(new Error('la boîte de réception a fermé la connexion')); });
      sock.on('data', function(c){ buf = Buffer.concat([buf, c]); pump(); });
    });
  }
  /* one notification: who, and whether it is final */
  function parseDsn(raw){
    var one = function(re){ var m = re.exec(raw); return m ? m[1].trim() : ''; };
    var email = one(/^(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^\s<>;]+@[^\s<>;]+)>?/im).toLowerCase(), status = one(/^Status:\s*([245]\.\d+\.\d+)/im), action = one(/^Action:\s*([a-z]+)/im).toLowerCase();
    return { id: one(/^Message-ID:\s*(\S+)/im) || crypto.createHash('sha1').update(raw).digest('hex'), email: VALID.test(email) ? email : '', status: status,
             hard: /^5/.test(status) || (action === 'failed' && !/^4/.test(status)), note: (status + ' ' + one(/^Diagnostic-Code:\s*(.+)/im).replace(/^smtp;\s*/i, '')).trim().slice(0, 300) };
  }
  function readBounces(){
    var s = settings();
    if (!VALID.test(s.user) || !s.pass) return Promise.reject(new Error('boîte d’envoi non renseignée : l’adresse et son mot de passe'));
    return Promise.all([store, imapRead({ host: s.imapHost, port: s.imapPort, user: s.user, pass: s.pass.replace(/\s+/g, ''), days: 14 })]).then(function(x){
      var st = x[0], out = { read: x[1].length, bounced: [], delayed: 0, unreadable: 0, unknown: 0, already: 0 };
      return st.listCampaigns().then(function(cs){ return Promise.all(cs.map(function(c){ return st.listRecipients(c.id); })); }).then(function(lists){
        var rows = [].concat.apply([], lists).filter(function(r){ return r.status === 'sent' || r.status === 'unsubscribed'; }).sort(function(a, b){ return T.txt(b.sentAt).localeCompare(T.txt(a.sentAt)); });
        return x[1].map(parseDsn).reduce(function(pr, dsn){ return pr.then(function(){
          if (!dsn.email){ out.unreadable++; return; }
          if (!dsn.hard){ out.delayed++; return; }
          return st.consumeToken('dsn:' + dsn.id).then(function(fresh){
            if (!fresh){ out.already++; return; }
            var r = rows.filter(function(y){ return y.email === dsn.email; })[0];
            if (!r){ out.unknown++; return; }   /* an address the studio never wrote to is nobody's to exclude */
            out.bounced.push(dsn.email);
            return st.markBounce(r.id, dsn.note).then(function(){ return st.addSuppression(dsn.email, 'bounce', r.campaignId); });
          });
        }); }, Promise.resolve()).then(function(){ return out; });
      });
    });
  }

  /* ---------- THE PUBLIC ROUTES, under /m/, without a session: what a mail points at ----------
     /m/t/o/<rid>/<sig>      the pixel: an image, and one opening counted when the signature is the right one
     /m/t/c/<rid>/<n>/<sig>  a link of the mail: counted, then sent on to the address that WAS in that mail,
                             http or https only. Nothing in the URL says where to go: no open redirect.
     /m/u/<rid>/<sig>        the way out: GET shows the page and its one button, POST unsubscribes
                             (the button, and the "se désabonner" of mail programs, RFC 8058)
     <rid> is the random name of one line of one send (no address in it), <sig> an HMAC of it with the
     secret: a link cannot be guessed, forged, or walked through. The paths and the signature are the
     engine's own (Instinct's /t/o, /t/c, /u), under /m. */
  var GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  function page(res, code, title, text, button){
    var h = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' + esc(title) + ' | Alaya Fine Jewelry</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Manrope:wght@400;500&display=swap" rel="stylesheet">' +
      '<style>body{margin:0;background:#fff;color:#111;font-family:Manrope,-apple-system,"Helvetica Neue",Arial,sans-serif;display:grid;place-items:center;min-height:100vh}' +
      '.box{max-width:460px;padding:40px 24px;text-align:center}img{width:170px;height:auto;margin:0 auto 54px;display:block}h1{font-family:"EB Garamond",Georgia,serif;font-weight:400;font-size:30px;line-height:1.2;margin:0 0 16px}' +
      'p{font-size:15px;line-height:1.6;color:#555;margin:0 0 30px;overflow-wrap:anywhere}button{font:inherit;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:500;background:#111;color:#fff;border:1px solid #111;padding:15px 28px;cursor:pointer}' +
      'button:hover{background:#000}a{color:#111;font-size:13px}</style></head><body><main class="box"><img src="' + PUBLIC + '/studio/logo.png" alt="Alaya Fine Jewelry" width="1812" height="315">' +
      '<h1>' + esc(title) + '</h1><p>' + esc(text) + '</p>' + (button ? '<form method="post"><button type="submit">' + esc(button) + '</button></form>' : '<a href="' + ORIGIN + '/">alayafinejewelry.com</a>') + '</main></body></html>';
    res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); res.end(h);
  }
  function open(req, res, u){
    var p = u.pathname, m;
    if (!TRACK || p.indexOf('/m/') !== 0) return false;
    var no = function(){ page(res, 404, 'Lien invalide', 'Ce lien n’est pas reconnu.'); };
    var oops = function(){ if (!res.headersSent) page(res, 500, 'Un instant', 'La page ne répond pas pour le moment. Réessayez plus tard.'); };
    return Promise.all([engine, store]).then(function(x){
      var M = x[0], st = x[1];
      var good = function(rid, what, sig){ var a = Buffer.from(M.signer(secret(), rid, what)), b = Buffer.from(T.txt(sig)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
      if ((m = /^\/m\/t\/o\/([A-Za-z0-9]+)\/([A-Za-z0-9_-]+)\/?$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')){
        var gif = function(){ res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': GIF.length, 'Cache-Control': 'no-store, no-cache, must-revalidate, private', 'Pragma': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : GIF); };
        return (good(m[1], 'o', m[2]) && req.method === 'GET' ? st.recordOpen(m[1])['catch'](function(){}) : Promise.resolve()).then(gif);   /* never block the image */
      }
      if ((m = /^\/m\/t\/c\/([A-Za-z0-9]+)\/(\d{1,4})\/([A-Za-z0-9_-]+)\/?$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')){
        if (!good(m[1], 'c' + (+m[2]), m[3])) return no();
        return st.getRecipient(m[1]).then(function(r){ return r ? st.getCampaign(r.campaignId) : null; }).then(function(c){
          var url = c ? M.extraireLiens(bodyOf(c.html))[+m[2]] : '';
          if (!url || !/^https?:\/\//i.test(url)) return no();
          return (req.method === 'GET' ? st.recordClick(m[1], url)['catch'](function(){}) : Promise.resolve()).then(function(){ res.writeHead(302, { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); });
        });
      }
      if ((m = /^\/m\/u\/([A-Za-z0-9]+)\/([A-Za-z0-9_-]+)\/?$/.exec(p))){
        if (!good(m[1], 'u', m[2])) return no();
        if (req.method === 'POST') return st.unsubscribe(m[1]).then(function(r){ if (!r) return no(); page(res, 200, 'C’est noté', r.email + ' ne recevra plus les lettres d’Alaya Fine Jewelry.'); });
        if (req.method !== 'GET' && req.method !== 'HEAD') return no();
        return st.getRecipient(m[1]).then(function(r){
          if (!r) return no();
          return st.isSuppressed(r.email).then(function(gone){
            if (gone) return page(res, 200, 'Déjà désinscrit', r.email + ' ne reçoit plus les lettres d’Alaya Fine Jewelry.');
            page(res, 200, 'Se désinscrire', 'Ne plus recevoir les lettres d’Alaya Fine Jewelry à l’adresse ' + r.email + ' ?', 'Confirmer la désinscription');
          });
        });
      }
      return no();
    })['catch'](oops);
  }

  /* ---------- the routes, all under /mailing ---------- */
  function api(req, res, u, user, p){
    if (p.indexOf('/mailing') !== 0) return false;
    var m, admin = user.role === 'admin', write = req.method !== 'GET';
    if (write && !admin) return T.fail(res, 403, 'r\u00e9serv\u00e9 aux administrateurs'), true;
    var oops = function(e){ if (!res.headersSent) T.fail(res, 500, e && e.message || String(e)); };
    var body = function(fn){ return T.readJSONBody(req, 2 * 1048576).then(fn)['catch'](oops); };

    if (p === '/mailing/state' && req.method === 'GET') return state().then(function(s){ T.send(res, 200, s); }, oops);

    if (p === '/mailing/contacts' && req.method === 'POST') return body(function(b){
      var r = addContacts(b.add); if (r.added) T.audit(user, 'mailing-contacts', { added: r.added });
      /* an address that unsubscribed before stays unsubscribed: it is in the list, and it is said */
      return store.then(function(st){ return st.listSuppressions(); }).then(function(sup){
        var out = {}; sup.forEach(function(q){ out[q.email] = 1; });
        T.send(res, 200, { added: r.added, already: r.already, ignored: r.ignored, unsubscribed: r.emails.filter(function(e){ return out[e]; }).length });
      }); });
    if (p === '/mailing/contacts' && req.method === 'DELETE'){
      var e = T.txt(u.searchParams.get('email')).trim().toLowerCase();
      B.contacts.remove(e); T.audit(user, 'mailing-contact-removed', { email: e }); return T.send(res, 200, { ok: true }), true;
    }
    /* a contact's name or note, typed on its sheet */
    if (p === '/mailing/contacts' && req.method === 'PUT') return body(function(b){
      var e1 = T.txt(b.email).trim().toLowerCase(); if (!B.contacts.has(e1)) return T.fail(res, 404, 'contact inconnu');
      B.contacts.patch(e1, { name: typeof b.name === 'string' ? b.name.trim().slice(0, 120) : undefined, note: typeof b.note === 'string' ? b.note.trim().slice(0, 2000) : undefined }); T.send(res, 200, { ok: true }); });
    if (p === '/mailing/suppressions' && req.method === 'POST') return body(function(b){
      var e2 = T.txt(b.email).trim().toLowerCase(); if (!VALID.test(e2)) return T.fail(res, 400, 'adresse invalide');
      return store.then(function(st){ return st.addSuppression(e2, 'manual'); }).then(function(){ T.audit(user, 'mailing-unsubscribed', { email: e2 }); T.send(res, 200, { ok: true }); }); });
    if (p === '/mailing/suppressions' && req.method === 'DELETE')
      return store.then(function(st){ return st.removeSuppression(T.txt(u.searchParams.get('email'))); }).then(function(){ T.send(res, 200, { ok: true }); }, oops);

    if (p === '/mailing/draft' && req.method === 'PUT') return body(function(b){
      var d = { subject: T.txt(b.subject).slice(0, 300), contenu: T.txt(b.contenu).slice(0, 400000), pieces: (Array.isArray(b.pieces) ? b.pieces : []).map(String).slice(0, 12), updatedAt: T.now(), by: user.email };
      B.reglages.set('mailing_draft', d); T.send(res, 200, d); });
    if (p === '/mailing/preview' && req.method === 'POST') return T.readJSONBody(req, 2 * 1048576).then(function(b){ T.send(res, 200, { html: htmlOf(b) }); })['catch'](oops);

    if (p === '/mailing/test' && req.method === 'POST') return body(function(b){
      var to = T.txt(b.to).trim().toLowerCase(), s = settings();
      if (!VALID.test(to)) return T.fail(res, 400, 'il faut une adresse pour l\u2019essai');
      if (!T.txt(b.subject).trim() || !hasBody(b)) return T.fail(res, 400, 'il faut un objet et un contenu');
      var tr; try { tr = transport(); } catch (e3){ return T.fail(res, 409, e3.message); }
      return engine.then(function(M){
        var html = htmlOf(b).replace(/\{\{\s*(prenom|nom)\s*\}\}/g, ''), mime = M.buildMime({ from: s.user, fromName: s.name, to: to, subject: '[Essai] ' + T.txt(b.subject).trim(), html: html, text: M.versTexte(noHead(html)) });
        return tr.sendMail({ envelope: { from: s.user, to: [to] }, raw: mime });
      }).then(function(info){ tr.close(); T.audit(user, 'mailing-test', { to: to }); T.send(res, 200, { ok: true, to: to, messageId: T.txt(info.messageId) }); }, function(e4){ tr.close(); T.fail(res, 502, e4.message); });
    });

    if (p === '/mailing/send' && req.method === 'POST') return body(function(b){
      var s = settings(), subject = T.txt(b.subject).trim();
      if (!subject || !hasBody(b)) return T.fail(res, 400, 'il faut un objet et un contenu');
      try { transport().close(); } catch (e5){ return T.fail(res, 409, e5.message); }
      return audience().then(function(people){
        if (!people.length) return T.fail(res, 400, 'personne \u00e0 qui \u00e9crire');
        /* THE DOOR: the word typed in the studio, and the number of people the sender saw */
        if (b.confirm !== 'ENVOYER' || +b.count !== people.length) return T.fail(res, 409, 'envoi non confirm\u00e9 : il faut taper ENVOYER, pour ' + people.length + ' personnes');
        return store.then(function(st){
          return st.createCampaign({ title: subject, subject: subject, fromEmail: s.user, fromName: s.name, html: htmlOf(b, !!TRACK), tracked: !!TRACK, createdBy: user.email }, people.map(function(c){ return { email: c.email, name: c.name }; }));
        }).then(function(out){
          T.audit(user, 'mailing-send', { id: out.campaign.id, added: out.added });
          drain()['catch'](function(){});
          T.send(res, 200, { id: out.campaign.id, added: out.added, suppressed: out.suppressed, duplicates: out.duplicates, invalid: out.invalid });
        });
      });
    });

    if ((m = /^\/mailing\/campaigns\/([A-Za-z0-9-]+)$/.exec(p)) && req.method === 'GET')
      return store.then(function(st){ return Promise.all([st.getCampaign(m[1]), st.listRecipients(m[1])]); }).then(function(x){
        if (!x[0]) return T.fail(res, 404, 'envoi introuvable');
        T.send(res, 200, { subject: x[0].subject, html: x[0].html, status: x[0].status, recipients: x[1].map(function(r){ return { email: r.email, name: r.name, status: r.status, sentAt: r.sentAt, error: r.error || r.bounceNote || '', opens: r.opens || 0, clicks: r.clicks || 0, openedAt: r.openedAt, unsubscribedAt: r.unsubscribedAt }; }), tracked: !!x[0].tracked });
      }, oops);
    if ((m = /^\/mailing\/campaigns\/([A-Za-z0-9-]+)\/(cancel|run)$/.exec(p)) && req.method === 'POST')
      return store.then(function(st){ return st.getCampaign(m[1]).then(function(c){
        if (!c) return T.fail(res, 404, 'envoi introuvable');
        if (c.status === 'done' || c.status === 'cancelled') return T.send(res, 200, { status: c.status });
        if (m[2] === 'cancel') return st.setCampaignStatus(c.id, 'cancelled').then(function(){ T.audit(user, 'mailing-cancel', { id: c.id }); T.send(res, 200, { status: 'cancelled' }); });
        /* run: a queue left by a stop of the program, or by the day's ceiling, taken up again on a press */
        try { transport().close(); } catch (e6){ return T.fail(res, 409, e6.message); }
        return st.setCampaignStatus(c.id, 'sending').then(function(){ T.audit(user, 'mailing-run', { id: c.id }); drain()['catch'](function(){}); T.send(res, 200, { status: 'sending' }); });
      }); })['catch'](oops);

    if (p === '/mailing/settings' && req.method === 'POST') return body(function(b){
      var s = B.reglages.get('mailing', {});
      if (b.user !== undefined){ var us = T.txt(b.user).trim().toLowerCase(); if (us && !VALID.test(us)) return T.fail(res, 400, 'l\u2019adresse de la bo\u00eete n\u2019est pas une adresse'); s.user = us; }
      if (b.host !== undefined) s.host = T.txt(b.host).trim().slice(0, 200);
      if (b.port !== undefined) s.port = +b.port || 587;
      if (b.name !== undefined) s.name = T.txt(b.name).replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
      if (b.imapHost !== undefined) s.imapHost = T.txt(b.imapHost).trim().slice(0, 200);
      if (b.imapPort !== undefined) s.imapPort = +b.imapPort || 993;
      B.reglages.set('mailing', s);
      if (T.txt(b.pass).trim()){ fs.writeFileSync(passFile, T.txt(b.pass).trim() + '\n', { mode: 0o600 }); fs.chmodSync(passFile, 0o600); }
      T.audit(user, 'mailing-settings', { user: s.user, host: s.host, password: !!T.txt(b.pass).trim() });
      T.send(res, 200, publicSettings());
    });
    /* the returns are read on a press, never on their own */
    if (p === '/mailing/bounces' && req.method === 'POST')
      return readBounces().then(function(r){ T.audit(user, 'mailing-bounces', { read: r.read, bounced: r.bounced.length }); T.send(res, 200, r); }, function(e9){ T.fail(res, 502, e9 && e9.message || String(e9)); });
    if (p === '/mailing/settings/verify' && req.method === 'POST'){
      var tr; try { tr = transport(); } catch (e7){ return T.fail(res, 409, e7.message), true; }
      return tr.verify().then(function(){ tr.close(); T.send(res, 200, { ok: true, user: settings().user }); }, function(e8){ tr.close(); T.fail(res, 502, e8.message); });
    }
    return T.fail(res, 404, 'not found'), true;
  }

  return { api: api, open: open, parsePeople: parsePeople, htmlOf: htmlOf, parseDsn: parseDsn };
};
