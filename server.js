#!/usr/bin/env node
/* LE STUDIO ALAYA (4 octobre 2026). Le programme du studio Instinct, ramene a ce
   qu'il faut ici : la porte (comptes, mot de passe scrypt, session signee), le
   studio servi derriere la porte, le site servi sous /site/ pour l'apercu et les
   photos, et la lecture des pieces telles que le site les porte. Aucune dependance.

     PORT       8776
     SITE_DIR   le dossier du site (par defaut ../01_SITE_WEB/NEW VERSION/SITE double-clic)
     DATA_DIR   les comptes et le secret (par defaut ./data)
     ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD   le premier compte, cree une fois (.env)

   Le studio ne garde aucune copie des pieces : catalogue.js les lit et les ecrit
   dans le site, qui reste la seule source. */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
var ENV = process.env, ROOT = __dirname;
var cfg = {
  port: +ENV.PORT || 8776,
  data: path.resolve(ENV.DATA_DIR || path.join(ROOT, 'data')),
  studio: path.join(ROOT, 'studio'),
  site: path.resolve(ENV.SITE_DIR || path.join(ROOT, '..', '01_SITE_WEB', 'NEW VERSION', 'SITE double-clic')),
  secure: ENV.SECURE === '1',
  coursAuto: ENV.COURS_AUTO !== '0',   /* les cours (or, argent, diamants) lus tout seuls toutes les douze heures ; COURS_AUTO=0 les laisse a la main */
  /* ON A SERVER (all blank on the Mac): HOST=0.0.0.0 behind the reverse proxy, PUBLIC_URL the address people
     type (https://alayafinejewelry.com), PUBLIC_SITE=1 to serve the site itself at /, TRUST_PROXY=1 to read
     the visitor's address from X-Forwarded-For. See DEPLOIEMENT.md. */
  host: ENV.HOST || '127.0.0.1',
  publicUrl: (ENV.PUBLIC_URL || '').replace(/\/+$/, ''),
  publicSite: ENV.PUBLIC_SITE === '1',
  trustProxy: ENV.TRUST_PROXY === '1',
  sessionDays: 30
};
fs.mkdirSync(cfg.data, { recursive: true });

function now(){ return new Date().toISOString(); }
function txt(v){ return (v === 0 || v) ? String(v) : ''; }
function readJSON(p, fallback){ try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e){ return fallback; } }
/* every write lands whole or not at all: a temp file beside the target, then a rename */
function writeAtomic(p, data){ var tmp = p + '.' + process.pid + '.' + Date.now() + '.tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, p); }
function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function unb64u(s){ s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Buffer.from(s, 'base64'); }
function audit(who, what, extra){ fs.appendFileSync(path.join(cfg.data, 'audit.log'), JSON.stringify(Object.assign({ t: now(), who: who ? who.email : '', what: what }, extra || {})) + '\n'); }

/* ---------- who ---------- */
var SECRET = (function(){
  var p = path.join(cfg.data, 'secret');
  try { return fs.readFileSync(p, 'utf8').trim(); } catch (e){}
  var s = b64u(crypto.randomBytes(48));
  fs.writeFileSync(p, s, { mode: 0o600 });
  return s;
})();
function users(){ return readJSON(path.join(cfg.data, 'users.json'), []); }
function hashPassword(pw, salt){ return crypto.scryptSync(String(pw), salt, 64).toString('hex'); }
function userByEmail(email){ email = txt(email).trim().toLowerCase(); return users().filter(function(u){ return u.email.toLowerCase() === email; })[0] || null; }
function checkPassword(u, pw){
  if (!u || !u.salt || !u.hash) return false;
  var h = Buffer.from(hashPassword(pw, u.salt), 'hex'), g = Buffer.from(u.hash, 'hex');
  return h.length === g.length && crypto.timingSafeEqual(h, g);
}
function addUser(email, name, role, password){
  var list = users().filter(function(u){ return u.email.toLowerCase() !== txt(email).toLowerCase(); });
  var salt = b64u(crypto.randomBytes(16));
  list.push({ email: txt(email).trim(), name: txt(name).trim(), role: role, salt: salt, hash: hashPassword(password, salt), createdAt: now() });
  var p = path.join(cfg.data, 'users.json'); writeAtomic(p, JSON.stringify(list, null, 2) + '\n'); fs.chmodSync(p, 0o600);
}
/* THE DOOR SLOWS DOWN, IT DOES NOT LOCK. Five wrong passwords for one login from
   one address, and the next try waits: 2, 4, 8 seconds, up to a minute. */
var TRIES = {};
function ipOf(req){ return cfg.trustProxy && req.headers['x-forwarded-for'] ? txt(req.headers['x-forwarded-for']).split(',')[0].trim() : txt(req.socket && req.socket.remoteAddress); }
function tryKey(req, email){ return ipOf(req) + '|' + txt(email).trim().toLowerCase(); }
function throttled(key){ var t = TRIES[key]; return (t && t.until > Date.now()) ? Math.ceil((t.until - Date.now()) / 1000) : 0; }
function failedTry(key){ var t = TRIES[key] || { n: 0, until: 0 }; t.n++; if (t.n >= 5) t.until = Date.now() + Math.min(60000, 1000 * Math.pow(2, t.n - 4)); TRIES[key] = t; }
function sign(payload){ var body = b64u(JSON.stringify(payload)); return body + '.' + b64u(crypto.createHmac('sha256', SECRET).update(body).digest()); }
function verify(token){
  if (!token || token.indexOf('.') < 0) return null;
  var parts = token.split('.'), body = parts[0], mac = parts[1];
  var want = b64u(crypto.createHmac('sha256', SECRET).update(body).digest());
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  try {
    var p = JSON.parse(unb64u(body).toString('utf8'));
    if (!p || !p.e || !p.x || p.x < Date.now()) return null;
    var u = userByEmail(p.e);   /* the account has to still exist and still hold that role */
    if (!u || u.role !== p.r) return null;
    return { email: u.email, name: u.name, role: u.role };
  } catch (e){ return null; }
}
var ROLES = { admin: 1, lecture: 1 };   /* admin writes in the site; lecture looks */
function cookieOf(req){ var m = /(?:^|;\s*)asr=([^;]+)/.exec(req.headers.cookie || ''); return m ? m[1] : ''; }
function setSession(res, user){
  var token = sign({ e: user.email, r: user.role, x: Date.now() + cfg.sessionDays * 86400000 });
  res.setHeader('Set-Cookie', 'asr=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (cfg.sessionDays * 86400) + (cfg.secure ? '; Secure' : ''));
}
function clearSession(res){ res.setHeader('Set-Cookie', 'asr=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (cfg.secure ? '; Secure' : '')); }
/* the first account, from the environment, once */
if (ENV.ADMIN_EMAIL && ENV.ADMIN_PASSWORD && !userByEmail(ENV.ADMIN_EMAIL)){
  addUser(ENV.ADMIN_EMAIL, ENV.ADMIN_NAME || ENV.ADMIN_EMAIL, 'admin', ENV.ADMIN_PASSWORD);
  console.log('compte admin cree pour ' + ENV.ADMIN_EMAIL);
}

/* ---------- les pieces : lues et ecrites dans le site par catalogue.js ---------- */
var catalogue = require('./catalogue')(cfg);
/* ---------- la base (7 octobre 2026) : tout ce que le studio tient en propre, data/studio.sqlite ---------- */
var base = require('./base')(cfg.data);
cfg.base = base;
/* une sauvegarde de la base au demarrage, puis chaque jour ; les trente derniers jours gardes */
function backup(){ try { var f = base.sauvegarde(); if (f) console.log('base sauvegardee : ' + f); } catch (e){ console.log('sauvegarde de la base refusee : ' + e.message); } }
setTimeout(backup, 3000); setInterval(backup, 86400000).unref();

/* ---------- serving ---------- */
var MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.gif': 'image/gif', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
function send(res, code, body, headers){
  var h = Object.assign({ 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin' }, headers || {});
  if (body !== undefined && typeof body !== 'string' && !Buffer.isBuffer(body)){ body = JSON.stringify(body); h['Content-Type'] = 'application/json; charset=utf-8'; }
  res.writeHead(code, h); res.end(body);
}
function fail(res, code, error){ send(res, code, { error: error }); }
/* the body as it came, byte for byte: a signed webhook is checked on these bytes */
function readRaw(req, limit){
  return new Promise(function(resolve, reject){
    var size = 0, chunks = [];
    req.on('data', function(c){ size += c.length; if (size > (limit || 1048576)){ reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', function(){ resolve(Buffer.concat(chunks)); }); req.on('error', reject);
  });
}
function readJSONBody(req, limit){
  return new Promise(function(resolve, reject){
    var size = 0, chunks = [];
    req.on('data', function(c){ size += c.length; if (size > (limit || 1048576)){ reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', function(){ try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e){ reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
function serveFile(req, res, file){
  var st;
  try { st = fs.statSync(file); } catch (e){ return fail(res, 404, 'not found'); }
  if (!st.isFile()) return fail(res, 404, 'not found');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache',
                       'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Last-Modified': st.mtime.toUTCString() });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}
/* a file of the public site: indexable, cached a year when its address carries a stamp, an hour otherwise */
function servePublic(req, res, file, code, stamped){
  var st; try { st = fs.statSync(file); } catch (e){ res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Page introuvable'); }
  var html = /\.html$/.test(file);
  res.writeHead(code, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Last-Modified': st.mtime.toUTCString(),
    'Cache-Control': html ? 'no-cache' : (stamped ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}
/* a path inside a root, or nothing: no dot files, no climbing out */
function safeJoin(root, rel){
  var clean;
  try { clean = decodeURIComponent(rel).replace(/\\/g, '/'); } catch (e){ return null; }
  if (/(^|\/)\./.test(clean)) return null;
  var p = path.normalize(path.join(root, clean));
  if (p.indexOf(root + path.sep) !== 0 && p !== root) return null;
  return p;
}
var DENY = /\.(command|sh|conf|md|docx|zip|key|log|tmp)$|\.bak/i;

/* ---------- THE MODULES (4 October). A file beside this one, <name>.js, exporting
     module.exports = function(cfg, tools){ return { api: function(req, res, u, user, p){ ... } }; }
   `p` is the path after /api (e.g. '/atelier/devis'). api() returns true (or the promise of its
   work) when the route is its own, and a falsy value otherwise. The user is signed in when it is
   called; the module checks the role itself (user.role === 'admin'), and for anything that is not a
   GET the X-Requested-With: alaya header has already been checked.
   tools: send(res, code, body, headers), fail(res, code, error), readJSONBody(req, limit), audit(user, what, extra),
          readJSON(path, fallback), writeAtomic(path, data), now(), txt(v), serveFile(req, res, file), catalogue,
          readRaw(req, limit) -> Buffer, ipOf(req)
   A module may also export open(req, res, u): the routes that need NO session (a visitor of the site, a mail
   client, Stripe). It is called first on every request, before the door; it returns true (or a promise) when
   the route is its own. cfg.publicUrl is the public address when the studio runs on a server, '' on the Mac. ---------- */
var MODULES = ['textes', 'atelier', 'mailing', 'vente', 'commerce', 'publier'].map(function(n){
  var f = path.join(ROOT, n + '.js');
  return fs.existsSync(f) ? require(f)(cfg, { send: send, fail: fail, readJSONBody: readJSONBody, audit: audit, readJSON: readJSON, writeAtomic: writeAtomic, now: now, txt: txt, serveFile: serveFile, catalogue: catalogue, readRaw: readRaw, ipOf: ipOf, base: base, users: users }) : null;
}).filter(Boolean);

function api(req, res, u, user){
  var p = u.pathname.replace(/^\/api/, '');
  /* a browser cannot send this header across sites without asking first, so its
     presence is what says the request came from the studio and nowhere else */
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'alaya') return fail(res, 403, 'missing X-Requested-With');
  if (p === '/login' && req.method === 'POST'){
    return readJSONBody(req).then(function(b){
      var key = tryKey(req, b.email), wait = throttled(key);
      if (wait) return send(res, 429, { error: 'too many attempts, wait ' + wait + ' s' }, { 'Retry-After': String(wait) });
      var acc = userByEmail(b.email);
      if (!checkPassword(acc, txt(b.password))){ failedTry(key); audit(null, 'login-failed', { email: txt(b.email).slice(0, 80) }); return fail(res, 401, 'wrong user or password'); }
      delete TRIES[key]; setSession(res, acc); audit(acc, 'login');
      send(res, 200, { email: acc.email, name: acc.name, role: acc.role });
    });
  }
  if (p === '/logout' && req.method === 'POST'){ clearSession(res); return send(res, 204); }
  if (!user) return fail(res, 401, 'not signed in');
  if (p === '/me' && req.method === 'GET') return send(res, 200, user);
  if (p === '/pieces' && req.method === 'GET') return send(res, 200, { pieces: catalogue.all(), vocab: catalogue.vocab(), last: catalogue.lastSave() });
  /* ACCOUNTS: a login is a first name or an email; an admin creates, changes a role or a password, removes.
     Nobody removes or demotes the last admin, nor removes the account they are signed in with. */
  /* 10 octobre : my own account : my name and my password (the current one asked), whatever my role */
  if (p === '/moi' && req.method === 'PUT'){ return readJSONBody(req).then(function(b){
    var list = users(), me = list.filter(function(x){ return x.email.toLowerCase() === user.email.toLowerCase(); })[0]; if (!me) return fail(res, 404, 'compte inconnu');
    if (b.password !== undefined){ if (!checkPassword(me, txt(b.current))) return fail(res, 403, 'le mot de passe actuel ne correspond pas'); if (txt(b.password).length < 10) return fail(res, 400, 'dix caract\u00e8res au moins'); me.salt = b64u(crypto.randomBytes(16)); me.hash = hashPassword(b.password, me.salt); }
    if (typeof b.name === 'string' && b.name.trim()) me.name = b.name.trim();
    var f = path.join(cfg.data, 'users.json'); writeAtomic(f, JSON.stringify(list, null, 2) + '\n'); fs.chmodSync(f, 0o600); audit(user, 'moi-update', { password: b.password !== undefined, name: !!b.name }); send(res, 200, { email: me.email, name: me.name, role: me.role }); }); }
  var acc = /^\/users(?:\/([^\/]+))?$/.exec(p);
  if (acc){
    if (user.role !== 'admin') return fail(res, 403, 'not allowed');
    var list = users(), admins = list.filter(function(x){ return x.role === 'admin'; }).length, who = acc[1] ? decodeURIComponent(acc[1]).toLowerCase() : '';
    var target = list.filter(function(x){ return x.email.toLowerCase() === who; })[0];
    var saveUsers = function(l){ var f = path.join(cfg.data, 'users.json'); writeAtomic(f, JSON.stringify(l, null, 2) + '\n'); fs.chmodSync(f, 0o600); };
    if (!acc[1] && req.method === 'GET') return send(res, 200, { users: list.map(function(x){ return { email: x.email, name: x.name, role: x.role, createdAt: x.createdAt }; }), me: user.email });
    if (!acc[1] && req.method === 'POST') return readJSONBody(req).then(function(b){
      var login = txt(b.email).trim().toLowerCase();
      if (!/^[a-z0-9._@+-]{2,80}$/.test(login) || !ROLES[b.role] || txt(b.password).length < 10) return fail(res, 400, 'il faut un identifiant (pr\u00e9nom ou e-mail), un r\u00f4le et un mot de passe de dix caract\u00e8res au moins');
      if (userByEmail(login)) return fail(res, 409, 'cet identifiant existe d\u00e9j\u00e0');
      addUser(login, txt(b.name).trim() || login, b.role, b.password); audit(user, 'user-add', { email: login, role: b.role }); send(res, 201, { email: login });
    });
    if (!target) return fail(res, 404, 'compte inconnu');
    if (req.method === 'PUT') return readJSONBody(req).then(function(b){
      if (b.role && !ROLES[b.role]) return fail(res, 400, 'r\u00f4le inconnu');
      if (b.role && b.role !== 'admin' && target.role === 'admin' && admins < 2) return fail(res, 400, 'il faut garder au moins un administrateur');
      if (b.password !== undefined && txt(b.password).length < 10) return fail(res, 400, 'dix caract\u00e8res au moins');
      if (b.role) target.role = b.role;
      if (typeof b.name === 'string' && b.name.trim()) target.name = b.name.trim();
      if (b.password !== undefined){ target.salt = b64u(crypto.randomBytes(16)); target.hash = hashPassword(b.password, target.salt); }
      saveUsers(list); audit(user, 'user-change', { email: target.email, role: target.role, password: b.password !== undefined }); send(res, 200, { email: target.email, role: target.role });
    });
    if (req.method === 'DELETE'){
      if (target.email.toLowerCase() === user.email.toLowerCase()) return fail(res, 400, 'on ne retire pas le compte avec lequel on est connect\u00e9');
      if (target.role === 'admin' && admins < 2) return fail(res, 400, 'il faut garder au moins un administrateur');
      saveUsers(list.filter(function(x){ return x !== target; })); audit(user, 'user-remove', { email: target.email }); return send(res, 204);
    }
    return fail(res, 405, 'method not allowed');
  }
  var one = /^\/pieces\/([a-z0-9-]+)$/.exec(p);
  if (one && req.method === 'GET'){ try { return send(res, 200, catalogue.get(one[1])); } catch (e){ return fail(res, 404, e.message); } }
  /* the screens that live in their own file (textes, atelier, mailing): each answers its own routes */
  for (var k = 0; k < MODULES.length; k++){ var handled = MODULES[k].api(req, res, u, user, p); if (handled) return handled; }
  /* what follows writes in the site: admins only. A refusal of the catalogue (a name missing, an address taken) is a 400 with its sentence. */
  var m, refuse = function(e){ fail(res, 400, e.message); };
  if (user.role !== 'admin') return fail(res, 403, 'not allowed');
  if (p === '/collections' && req.method === 'POST'){
    if (user.role !== 'admin') return fail(res, 403, 'not allowed');
    return readJSONBody(req).then(function(b){ var r; try { r = catalogue.addCollection(txt(b.name)); } catch (e){ return fail(res, 400, e.message); } audit(user, 'collection-add', { reference: r.slug }); send(res, 201, r); });
  }
  if (p === '/pieces' && req.method === 'POST'){
    /* the photos travel in the body as data URLs: twelve photos of a few megabytes */
    return readJSONBody(req, 90 * 1048576).then(function(b){
      var r; try { r = catalogue.add(b); } catch (e){ return refuse(e); }
      audit(user, 'piece-add', { slug: r.slug, pages: r.pages }); send(res, 201, r);
    });
  }
  if ((m = /^\/pieces\/([a-z0-9-]+)\/sections$/.exec(p)) && req.method === 'PUT'){
    return readJSONBody(req).then(function(b){
      var r; try { r = catalogue.setSections(m[1], b); } catch (e){ return refuse(e); }
      audit(user, 'piece-sections', { slug: m[1], fiancailles: !!b.fiancailles, mariage: !!b.mariage }); send(res, 200, r);
    });
  }
  if (one && req.method === 'PUT'){
    return readJSONBody(req, 90 * 1048576).then(function(b){
      var r; try { r = catalogue.update(one[1], b); } catch (e){ return refuse(e); }
      audit(user, 'piece-update', { slug: one[1] }); send(res, 200, r);
    });
  }
  if (one && req.method === 'DELETE'){
    var gone; try { gone = catalogue.remove(one[1]); } catch (e){ return refuse(e); }
    audit(user, 'piece-remove', gone); return send(res, 200, gone);
  }
  if (p === '/annuler' && req.method === 'POST'){
    var u0; try { u0 = catalogue.undo(); } catch (e){ return refuse(e); }
    audit(user, 'undo', { what: u0.what }); return send(res, 200, u0);
  }
  fail(res, 404, 'not found');
}

http.createServer(function(req, res){
  var u;
  try { u = new URL(req.url, 'http://x'); } catch (e){ return fail(res, 400, 'bad url'); }
  var user = verify(cookieOf(req)), pth = u.pathname;
  /* OPEN_STUDIO=1 : la porte ouverte, sans login, sur le Mac seulement. Refusee des que le programme
     ecoute ailleurs que sur cette machine ou sert le site au public. */
  if (!user && ENV.OPEN_STUDIO === '1' && cfg.host === '127.0.0.1' && !cfg.publicSite){
    var first = users().filter(function(a){ return a.role === 'admin'; })[0];
    if (first) user = { email: first.email, name: first.name, role: first.role };
  }
  var oops = function(e){ if (!res.headersSent) fail(res, e.message === 'body too large' ? 413 : (e.message === 'bad json' ? 400 : 500), e.message); };
  for (var k = 0; k < MODULES.length; k++){
    if (!MODULES[k].open) continue;
    var op; try { op = MODULES[k].open(req, res, u); } catch (e){ return oops(e); }
    if (op){ if (op.then) op['catch'](oops); return; }
  }
  if (pth === '/api' || pth.indexOf('/api/') === 0){
    var pr;
    try { pr = api(req, res, u, user); } catch (e){ return fail(res, 500, e.message); }
    if (pr && pr.then) pr['catch'](function(e){ if (!res.headersSent) fail(res, e.message === 'body too large' ? 413 : (e.message === 'bad json' ? 400 : 500), e.message); });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method not allowed');
  if (pth === '/' && !cfg.publicSite){ res.writeHead(302, { Location: '/studio/' }); return res.end(); }
  /* the site as it is on disk, for the preview and the photos, behind the door too */
  if (pth.indexOf('/site/') === 0){
    if (!user) return fail(res, 401, 'not signed in');
    var rel0 = pth.slice('/site/'.length) || 'index.html'; if (/\/$/.test(rel0)) rel0 += 'index.html';
    var sf = safeJoin(cfg.site, rel0);
    if (!sf || DENY.test(sf)) return fail(res, 404, 'not found');
    return serveFile(req, res, sf);
  }
  /* the back office, behind the door: the door is /studio/login, the studio is /studio/ */
  if (pth === '/studio'){ res.writeHead(302, { Location: '/studio/' }); return res.end(); }
  if (pth.indexOf('/studio/') === 0){
    var rel = pth.slice('/studio/'.length) || 'index.html';
    if (rel === 'login') rel = 'login.html';
    var open = rel === 'login.html' || rel === 'studio.css' || rel === 'systeme.css' || rel === 'logo.png';
    if (!user && !open){
      if (/\.html$/.test(rel)){ res.writeHead(302, { Location: 'login' }); return res.end(); }
      return fail(res, 401, 'not signed in');
    }
    if (user && rel === 'login.html'){ res.writeHead(302, { Location: './' }); return res.end(); }
    if (rel === 'logo.png') return serveFile(req, res, path.join(cfg.site, 'images', 'logo', 'alaya-logo-noir.png'));
    var f = safeJoin(cfg.studio, rel);
    if (!f || DENY.test(f)) return fail(res, 404, 'not found');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    return serveFile(req, res, f);
  }
  /* ON A SERVER: the site itself, for everyone, at the root. Folders answer with their index.html, an
     unknown address with the site's own 404 page. */
  if (cfg.publicSite){
    var rp = pth.slice(1) || 'index.html'; if (/\/$/.test(rp)) rp += 'index.html';
    var pf = safeJoin(cfg.site, rp);
    if (pf && !DENY.test(pf) && !/^netlify(\/|\.toml$)/.test(rp)){   /* the payment function and its price file are the server's, not the visitor's */
      var st0 = null; try { st0 = fs.statSync(pf); } catch (e){}
      if (st0 && st0.isDirectory()){ res.writeHead(301, { Location: pth + '/' + (u.search || '') }); return res.end(); }
      if (st0 && st0.isFile()) return servePublic(req, res, pf, 200, u.searchParams.get('v'));
    }
    return servePublic(req, res, path.join(cfg.site, '404.html'), 404);
  }
  fail(res, 404, 'not found');
}).listen(cfg.port, cfg.host, function(){
  console.log('studio alaya sur http://' + cfg.host + ':' + cfg.port + '/studio/' + (cfg.publicSite ? '   (le site est servi a la racine)' : ''));
  console.log('  site     ' + cfg.site);
  console.log('  comptes  ' + path.join(cfg.data, 'users.json') + '  (' + users().length + ')');
});
