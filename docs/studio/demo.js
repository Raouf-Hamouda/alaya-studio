/* La demo GitHub Pages (12 octobre 2026) : pas de serveur, les lectures viennent de ../api/*.json
   (photographiees par deploiement/demo.py), toute ecriture est refusee poliment. */
(function(){
  var real = window.fetch.bind(window);
  var json = function(status, body){ return Promise.resolve(new Response(JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } })); };
  window.fetch = function(url, init){
    if (typeof url !== 'string' || url.indexOf('../api/') !== 0) return real(url, init);
    var p = url.slice(7), method = (init && init.method) || 'GET';
    if (method !== 'GET') return json(403, { error: 'Démo en lecture seule : rien ne s’enregistre ici' });
    return real('../api/' + p.replace(/[^A-Za-z0-9.-]/g, '_') + '.json').then(function(r){ return r.ok ? r : json(404, { error: 'Pas dans la démo' }); });
  };
  document.addEventListener('DOMContentLoaded', function(){
    var b = document.createElement('div');
    b.textContent = 'Démo en lecture seule';
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;background:#111;color:#fff;font:500 12px Inter,sans-serif;padding:6px 10px;border-radius:4px;pointer-events:none';
    document.body.appendChild(b);
  });
})();
