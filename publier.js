/* PUBLIER : ce que le studio a ecrit dans le dossier du site part en ligne (4 octobre 2026).
   Le dossier du site est un depot git ; la mise en ligne, c'est un commit et un push vers
   son depot distant (GitHub aujourd'hui, la plateforme qui sert le site le reprend de la).
   Le studio n'invente aucune autre route : il montre ce qui a change depuis la derniere
   mise en ligne, et sur un mot tape (PUBLIER) il enregistre et pousse.

   Rien n'est pousse sans ce mot. Le programme ne publie jamais de lui-meme. */
'use strict';
var cp = require('child_process'), fs = require('fs'), path = require('path');

module.exports = function(cfg, tools){
  function git(args, timeout){
    return new Promise(function(resolve){
      cp.execFile('git', ['-C', cfg.site].concat(args), { timeout: timeout || 20000, maxBuffer: 8 * 1048576 }, function(err, out, errout){
        resolve({ ok: !err, out: String(out || '').replace(/\s+$/, ''), err: String(errout || (err && err.message) || '').replace(/\s+$/, '') });
      });
    });
  }
  function state(){
    if (!fs.existsSync(path.join(cfg.site, '.git'))) return Promise.resolve({ repo: false });
    return Promise.all([git(['status', '--porcelain']), git(['log', '-6', '--format=%h\t%cI\t%s']), git(['rev-parse', '--abbrev-ref', 'HEAD']), git(['remote', 'get-url', 'origin']), git(['rev-list', '--count', '@{u}..HEAD'])]).then(function(r){
      var files = r[0].out ? r[0].out.split('\n') : [];
      /* what the studio wrote since: the names of its saved writes, newest first, as the suggested message */
      var writes = [], dir = path.join(cfg.data, 'sauvegardes');
      try { fs.readdirSync(dir).filter(function(d){ return !/\.annule$/.test(d); }).sort().reverse().slice(0, 12).forEach(function(d){ var m = tools.readJSON(path.join(dir, d, 'manifest.json'), null); if (m && writes.indexOf(m.what) < 0) writes.push(m.what); }); } catch (e){}
      return { repo: true, changed: files.length, files: files.slice(0, 60).map(function(l){ return { state: l.slice(0, 2).trim(), file: l.slice(3) }; }),
        last: r[1].out ? r[1].out.split('\n').map(function(l){ var x = l.split('\t'); return { hash: x[0], at: x[1], subject: x.slice(2).join(' ') }; }) : [],
        branch: r[2].out, remote: r[3].ok ? r[3].out.replace(/\/\/[^@\/]+@/, '//') : '', ahead: r[4].ok ? +r[4].out : 0,
        suggest: writes.length ? 'Studio : ' + writes.slice(0, 6).join(', ') : '' };
    });
  }
  function publish(message){
    var log = [], step = function(args, t){ return git(args, t).then(function(r){ log.push({ cmd: 'git ' + args[0], ok: r.ok, out: (r.out + (r.err ? '\n' + r.err : '')).trim().slice(-600) }); return r; }); };
    return step(['add', '-A']).then(function(a){
      if (!a.ok) return { ok: false, log: log };
      return git(['status', '--porcelain']).then(function(s){
        return (s.out ? step(['commit', '-m', message]) : Promise.resolve({ ok: true })).then(function(c){
          if (!c.ok) return { ok: false, log: log };
          return step(['push'], 120000).then(function(p){ return { ok: p.ok, log: log }; });
        });
      });
    });
  }
  function api(req, res, u, user, p){
    if (p !== '/publier') return false;
    if (req.method === 'GET') return state().then(function(s){ tools.send(res, 200, s); });
    if (req.method === 'POST'){
      if (user.role !== 'admin'){ tools.fail(res, 403, 'not allowed'); return true; }
      return tools.readJSONBody(req).then(function(b){
        var msg = tools.txt(b.message).replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
        if (b.confirm !== 'PUBLIER') return tools.fail(res, 400, 'il faut taper le mot PUBLIER');
        if (!msg) return tools.fail(res, 400, 'il faut une phrase qui dit ce qui part en ligne');
        return publish(msg).then(function(r){ tools.audit(user, 'publish', { ok: r.ok, message: msg }); tools.send(res, r.ok ? 200 : 502, r); });
      });
    }
    return false;
  }
  return { api: api, state: state, publish: publish };
};
