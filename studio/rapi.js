/* LES INDICES RAPAPORT DANS LE STUDIO (10 octobre 2026, retire du site le soir meme a la demande de Raouf : back-office seulement). Les memes donnees que la page
   rapaport.com/diamond-price-index, lues par le studio sur la route publique de leur widget
   (wp-json/rmw/v1 : diamonds, metals, currencies, equities) et ecrites ici telles quelles :
   quatre onglets, les lignes, la courbe, les periodes 1M / 3M / 1A pour les diamants, et le
   calcul d'une pierre. Le calcul de Rapaport est reserve a leurs abonnes : ici il repond avec les
   estimations de StoneAlgo (libres, inventaire des bijoutiers en ligne, mises a jour chaque jour) :
   sur le site, une grille lue chaque nuit par le studio (entre deux poids de la grille, on interpole
   et on le dit) ; dans le studio, en direct pour n'importe quelle pierre (opts.estimer).
   Sans dependance ; la preuve de l'interpolation est dans 13_STUDIO/cours.js (node cours.js). */
(function(){
  'use strict';
  var L = {
    fr: { diamonds: 'Diamants', metals: 'Métaux', currencies: 'Devises', equities: 'Indices', rows: 'Prix moyen demandé, le carat', rowsOther: 'Cours', chart: 'Rapaport Trade Diamond Index (RAPI™)', ranges: { '1M': '1 mois', '3M': '3 mois', '1Y': '1 an' },
      read: 'Lu le', source: 'Source : Rapaport. Les prix sont en dollars ; l’euro suit le change de la Banque centrale européenne.', calc: 'Calculer le prix d’une pierre', shape: 'Forme', size: 'Poids (ct)', color: 'Couleur', clarity: 'Pureté', go: 'Calculer',
      per: 'le carat', about: 'soit', fourchette: 'fourchette', sur30: 'sur 30 jours', entre: 'estimé entre les poids', et: 'et', estNote: 'Estimation StoneAlgo d’après l’inventaire des bijoutiers en ligne, pour une pierre naturelle, taille, symétrie et poli excellents, sans fluorescence. Lue le', out: 'Cette pierre n’est pas dans la grille lue par la maison. Demandez-nous une estimation.', rare: 'Trop peu de pierres de ce type sur le marché pour estimer un prix. Demandez-nous.', wait: 'Calcul…', err: 'La source n’a pas répondu. Réessayez dans un instant.', achat: 'Mon prix d’achat visé', sous: 'sous l’estimation', rdv: 'Prendre rendez-vous', sizeErr: 'Indiquez un poids entre 0,01 et 20 ct.', metalNames: { Gold: 'Or', Silver: 'Argent', Platinum: 'Platine', Palladium: 'Palladium' }, gram: 'le gramme', kg: 'le kilo', oz: 'l’once', shapes: { Round: 'Rond', Oval: 'Ovale', Cushion: 'Coussin', Emerald: 'Émeraude', Princess: 'Princesse', Pear: 'Poire', Radiant: 'Radiant', Marquise: 'Marquise', Asscher: 'Asscher', Heart: 'Cœur' } },
    en: { diamonds: 'Diamonds', metals: 'Metals', currencies: 'Currencies', equities: 'Equities', rows: 'Average asking price, per carat', rowsOther: 'Price', chart: 'Rapaport Trade Diamond Index (RAPI™)', ranges: { '1M': '1 month', '3M': '3 months', '1Y': '1 year' },
      read: 'Read on', source: 'Source: Rapaport. Prices in dollars; the euro follows the European Central Bank rate.', calc: 'Calculate your stone price', shape: 'Shape', size: 'Size (ct)', color: 'Color', clarity: 'Clarity', go: 'Calculate',
      per: 'per carat', about: 'about', fourchette: 'range', sur30: 'over 30 days', entre: 'estimated between the sizes', et: 'and', estNote: 'StoneAlgo estimate from online jewelers’ inventory, for a natural stone, excellent cut, symmetry and polish, no fluorescence. Read on', out: 'No live source here. Ask us for an estimate.', rare: 'Too few stones of this kind on the market to estimate a price. Ask us.', wait: 'Calculating…', err: 'The source did not answer. Try again in a moment.', achat: 'My target buying price', sous: 'under the estimate', rdv: 'Book an appointment', sizeErr: 'Enter a size between 0.01 and 20 ct.', metalNames: { Gold: 'Gold', Silver: 'Silver', Platinum: 'Platinum', Palladium: 'Palladium' }, gram: 'per gram', kg: 'per kilo', oz: 'per ounce', shapes: { Round: 'Round', Oval: 'Oval', Cushion: 'Cushion', Emerald: 'Emerald', Princess: 'Princess', Pear: 'Pear', Radiant: 'Radiant', Marquise: 'Marquise', Asscher: 'Asscher', Heart: 'Heart' } },
    it: { diamonds: 'Diamanti', metals: 'Metalli', currencies: 'Valute', equities: 'Indici', rows: 'Prezzo medio richiesto, al carato', rowsOther: 'Quotazione', chart: 'Rapaport Trade Diamond Index (RAPI™)', ranges: { '1M': '1 mese', '3M': '3 mesi', '1Y': '1 anno' },
      read: 'Letto il', source: 'Fonte: Rapaport. Prezzi in dollari; l’euro segue il cambio della Banca centrale europea.', calc: 'Calcola il prezzo di una pietra', shape: 'Forma', size: 'Peso (ct)', color: 'Colore', clarity: 'Purezza', go: 'Calcola',
      per: 'al carato', about: 'circa', fourchette: 'intervallo', sur30: 'su 30 giorni', entre: 'stimato tra i pesi', et: 'e', estNote: 'Stima StoneAlgo dall’inventario dei gioiellieri online, per una pietra naturale, taglio, simmetria e lucidatura eccellenti, senza fluorescenza. Letta il', out: 'Questa pietra non è nella griglia letta dalla maison. Chiedeteci una stima.', rare: 'Troppo poche pietre di questo tipo sul mercato per stimare un prezzo. Chiedeteci.', wait: 'Calcolo…', err: 'La fonte non ha risposto. Riprovate tra un istante.', achat: 'Il mio prezzo d’acquisto', sous: 'sotto la stima', rdv: 'Prendere un appuntamento', sizeErr: 'Indicare un peso tra 0,01 e 20 ct.', metalNames: { Gold: 'Oro', Silver: 'Argento', Platinum: 'Platino', Palladium: 'Palladio' }, gram: 'al grammo', kg: 'al chilo', oz: 'l’oncia', shapes: { Round: 'Rotondo', Oval: 'Ovale', Cushion: 'Cuscino', Emerald: 'Smeraldo', Princess: 'Princess', Pear: 'Goccia', Radiant: 'Radiant', Marquise: 'Marquise', Asscher: 'Asscher', Heart: 'Cuore' } }
  };
  var TABS = ['diamonds', 'metals', 'currencies', 'equities'], RANGES = ['1M', '3M', '1Y'];
  /* StoneAlgo's own lists */
  var SHAPES = ['Round', 'Oval', 'Cushion', 'Emerald', 'Princess', 'Pear', 'Radiant', 'Marquise', 'Asscher', 'Heart'], COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'], CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2'];
  var LOC = { fr: 'fr-FR', en: 'en-US', it: 'it-IT' };

  /* the grid the studio wrote : an exact point, or a straight line between the two grid sizes around the asked one (same shape, color, clarity) ; null when the grid has nothing */
  function estimerGrille(points, p){
    var ct = Number(p.carat), same = (points || []).filter(function(x){ return x.s === p.shape && x.co === p.color && x.cl === p.clarity && x.v > 0; }).sort(function(a, b){ return a.c - b.c; });
    if (!same.length) return null;
    var hit = same.filter(function(x){ return x.c === ct; })[0]; if (hit) return { valeur: hit.v, caratUsd: hit.k, bas: hit.b, haut: hit.h, variation: hit.d };
    if (ct < same[0].c || ct > same[same.length - 1].c) return null;
    for (var i = 1; i < same.length; i++){ if (ct < same[i].c){ var a = same[i - 1], b = same[i], f = (ct - a.c) / (b.c - a.c), mix = function(x, y){ return x === null || y === null ? null : Math.round(x + (y - x) * f); };
      return { valeur: mix(a.v, b.v), caratUsd: mix(a.k, b.k), bas: mix(a.b, b.b), haut: mix(a.h, b.h), variation: null, entre: [a.c, b.c] }; } }
    return null;
  }

  var ONCE = 31.1034768;
  function fmt(n, kind, loc){
    if (kind === 'eurg') return Number(n).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    if (kind === 'rate') return Number(Number(n).toPrecision(4)).toLocaleString(loc, { maximumFractionDigits: 6 });
    if (kind === 'idx') return Math.round(n).toLocaleString(loc);
    return '$' + (n >= 100 ? Math.round(n).toLocaleString(loc) : Number(n).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  function pct(n){ n = Number(n) || 0; return (n >= 0 ? '+' : '') + n.toFixed(2).replace('.', ',') + ' %'; }
  function jour(iso, loc){ var d = new Date(iso.slice(0, 10) + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function el(tag, cls, parent, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e; }

  function render(root, feed, lang, opts){
    opts = opts || {}; lang = L[lang] ? lang : 'fr'; var T = L[lang], loc = LOC[lang], usdEur = Number(feed.usdEur) || 0;
    var st = { tab: 'diamonds', range: '1M', sel: {}, hover: null };
    root.innerHTML = '';
    var tabs = el('div', 'rapi-tabs', root), panel = el('div', 'rapi-panel', root), rowsCol = el('div', 'rapi-rows-col', panel), rowsTitle = el('p', 'rapi-rows-title', rowsCol), rows = el('div', 'rapi-rows', rowsCol);
    var chartCol = el('div', 'rapi-chart-col', panel), head = el('div', 'rapi-chart-head', chartCol), label = el('p', 'rapi-chart-label', head), ranges = el('div', 'rapi-ranges', head), holder = el('div', 'rapi-chart-holder', chartCol), status = el('p', 'rapi-status', root);
    function data(){ return st.tab === 'diamonds' ? (feed.diamonds || {})[st.range] : feed[st.tab]; }
    function items(){ var d = data(); return d && d.items ? d.items : []; }
    function kind(){ return st.tab === 'currencies' ? 'rate' : st.tab === 'equities' ? 'idx' : (st.tab === 'metals' && usdEur) ? 'eurg' : 'usd'; }
    var toGram = function(v){ return v * usdEur / ONCE; };
    function serie(it){ return (it.series || []).map(function(p){ var v = Number(st.tab === 'diamonds' ? p.price : p.value); return { d: p.date, v: kind() === 'eurg' ? toGram(v) : v }; }).filter(function(p){ return isFinite(p.v); }); }
    TABS.forEach(function(t){ if (!feed[t]) return; var b = el('button', 'rapi-tab', tabs, T[t]); b.type = 'button'; b.addEventListener('click', function(){ st.tab = t; st.hover = null; draw(); }); });
    RANGES.forEach(function(r){ var b = el('button', 'rapi-range', ranges, T.ranges[r]); b.type = 'button'; b.addEventListener('click', function(){ st.range = r; st.hover = null; draw(); }); });
    function draw(){
      var its = items(), k = kind(), sel = st.sel[st.tab] || (its[0] && its[0].label), d = data();
      Array.prototype.forEach.call(tabs.children, function(b, i){ b.classList.toggle('is-on', TABS.filter(function(t){ return feed[t]; })[i] === st.tab); });
      ranges.hidden = st.tab !== 'diamonds';
      Array.prototype.forEach.call(ranges.children, function(b, i){ b.classList.toggle('is-on', RANGES[i] === st.range); });
      rowsTitle.textContent = st.tab === 'diamonds' ? T.rows : T.rowsOther; rows.innerHTML = '';
      its.forEach(function(it){ var v = Number(st.tab === 'diamonds' ? it.price : it.value), b = el('button', 'rapi-row' + (it.label === sel ? ' is-on' : ''), rows); b.type = 'button';
        var nm = el('span', 'rapi-row-name', b), vals = el('span', 'rapi-row-vals', b);
        if (k === 'eurg'){ el('b', '', nm, T.metalNames[it.label] || it.label); el('small', '', nm, T.gram); var g = toGram(v);
          el('b', '', vals, fmt(g, 'eurg', loc)); el('small', '', vals, Math.round(g * 1000).toLocaleString(loc) + ' € ' + T.kg + ' · $' + Math.round(v).toLocaleString(loc) + ' ' + T.oz); }
        else { el('b', '', nm, it.label); if (it.unit && it.unit !== it.label) el('small', '', nm, it.unit);
          el('b', '', vals, isFinite(v) ? fmt(v, k, loc) : '—');
          if (k === 'usd' && usdEur && isFinite(v)) el('small', '', vals, '≈ ' + Math.round(v * usdEur).toLocaleString(loc) + ' €' + (st.tab === 'diamonds' ? ' / ct' : '')); }
        el('i', 'rapi-pct ' + (Number(it.changePct) >= 0 ? 'up' : 'down'), b, pct(it.changePct));
        b.addEventListener('click', function(){ st.sel[st.tab] = it.label; st.hover = null; draw(); }); });
      var cur = its.filter(function(i){ return i.label === sel; })[0] || its[0];
      label.textContent = (st.tab === 'diamonds' ? T.chart + ' · ' : (cur ? (k === 'eurg' ? (T.metalNames[cur.label] || cur.label) + ', ' + T.gram : cur.label) + ' · ' : '')) + (d && d.from ? jour(d.from, loc) + ' – ' + jour(d.to, loc) : '');
      holder.innerHTML = ''; if (cur) courbe(holder, serie(cur), k, loc);
      status.textContent = (feed.at ? T.read + ' ' + jour(feed.at, loc) + '. ' : '') + T.source;
    }
    function courbe(box, pts, k, loc){
      if (pts.length < 2){ el('p', 'rapi-empty', box, '—'); return; }
      var W = 640, H = 220, P = { t: 18, r: 14, b: 26, l: 8 }, min = Infinity, max = -Infinity;
      pts.forEach(function(p){ if (p.v < min) min = p.v; if (p.v > max) max = p.v; }); if (max === min){ max += 1; min -= 1; }
      var x = function(i){ return P.l + (W - P.l - P.r) * i / (pts.length - 1); }, y = function(v){ return P.t + (H - P.t - P.b) * (1 - (v - min) / (max - min)); };
      var path = pts.map(function(p, i){ return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1); }).join(' ');
      var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'rapi-svg');
      var mk = function(tag, attrs, text){ var n = document.createElementNS(ns, tag); Object.keys(attrs).forEach(function(a){ n.setAttribute(a, attrs[a]); }); if (text !== undefined) n.textContent = text; svg.appendChild(n); return n; };
      [0, 0.5, 1].forEach(function(f){ var v = min + (max - min) * f; mk('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), 'class': 'rapi-grid' }); mk('text', { x: W - P.r, y: y(v) - 4, 'text-anchor': 'end', 'class': 'rapi-tick' }, fmt(v, k, loc)); });
      mk('path', { d: path + ' L' + x(pts.length - 1).toFixed(1) + ' ' + (H - P.b) + ' L' + P.l + ' ' + (H - P.b) + ' Z', 'class': 'rapi-area' });
      mk('path', { d: path, 'class': 'rapi-line' });
      mk('text', { x: P.l, y: H - 8, 'class': 'rapi-tick' }, jour(pts[0].d, loc)); mk('text', { x: W - P.r, y: H - 8, 'text-anchor': 'end', 'class': 'rapi-tick' }, jour(pts[pts.length - 1].d, loc));
      var dot = mk('circle', { r: 4, 'class': 'rapi-dot', cx: x(pts.length - 1), cy: y(pts[pts.length - 1].v) }), tip = el('p', 'rapi-tip', box, fmt(pts[pts.length - 1].v, k, loc) + ' · ' + jour(pts[pts.length - 1].d, loc));
      svg.addEventListener('mousemove', function(ev){ var r = svg.getBoundingClientRect(), i = Math.round((ev.clientX - r.left) / r.width * W - P.l) / ((W - P.l - P.r) / (pts.length - 1)); i = Math.max(0, Math.min(pts.length - 1, Math.round(i))); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(pts[i].v)); tip.textContent = fmt(pts[i].v, k, loc) + ' · ' + jour(pts[i].d, loc); });
      box.insertBefore(svg, tip);
    }
    if (opts.sansCalcul){ draw(); return; }
    /* the stone calculator : StoneAlgo's inputs ; the answer comes live (opts.estimer, the studio) */
    var calc = el('div', 'rapi-calc', root); el('h3', '', calc, T.calc); var grid = el('div', 'rapi-calc-grid', calc);
    var field = function(lbl, opts2, names){ var f = el('label', 'rapi-field', grid); el('span', '', f, lbl); var s; if (opts2){ s = el('select', '', f); opts2.forEach(function(o){ var op = el('option', '', s, names ? names[o] || o : o); op.value = o; }); } else { s = el('input', '', f); s.inputMode = 'decimal'; s.value = '1'; } return s; };
    var shape = field(T.shape, SHAPES, T.shapes), size = field(T.size), color = field(T.color, COLORS), clarity = field(T.clarity, CLARITIES), go = el('button', 'rapi-calc-btn', grid, T.go); go.type = 'button';
    color.value = 'G'; clarity.value = 'VS2';
    var out = el('div', 'rapi-result', calc), est = feed.estimations || null, remise = 20;
    function montrer(e, luLe){
      out.innerHTML = '';
      if (!e){ out.textContent = T.out + ' '; if (root.dataset.rdv){ var a = el('a', 'rapi-rdv', out, T.rdv); a.href = root.dataset.rdv; } return; }
      if (e.rare){ out.textContent = T.rare; return; }
      el('b', '', out, '$' + Math.round(e.valeur).toLocaleString(loc)); el('span', '', out, (usdEur ? ' · ' + T.about + ' ' + Math.round(e.valeur * usdEur).toLocaleString(loc) + ' €' : '') + (e.bas && e.haut ? ' · ' + T.fourchette + ' $' + Math.round(e.bas).toLocaleString(loc) + ' – $' + Math.round(e.haut).toLocaleString(loc) : '') + (e.caratUsd ? ' · $' + Math.round(e.caratUsd).toLocaleString(loc) + ' ' + T.per : '') + (e.variation !== null && e.variation !== undefined ? ' · ' + pct(e.variation) + ' ' + T.sur30 : ''));
      el('small', '', out, (e.entre ? T.entre + ' ' + String(e.entre[0]).replace('.', ',') + ' ' + T.et + ' ' + String(e.entre[1]).replace('.', ',') + ' ct. ' : '') + T.estNote + ' ' + (luLe ? jour(luLe, loc) : '') + '.');
      /* the buying target : a slider to drag, four quick marks, the price under the estimate */
      var ach = el('div', 'rapi-achat', out), head = el('div', 'rapi-achat-head', ach); el('span', '', head, T.achat); var marks = el('span', 'rapi-marks', head);
      var sl = el('input', 'rapi-slider', ach); sl.type = 'range'; sl.min = '0'; sl.max = '50'; sl.step = '1'; sl.value = String(remise);
      var line = el('p', 'rapi-achat-line', ach);
      var draw2 = function(){ var r = Number(sl.value), v = e.valeur * (1 - r / 100); remise = r; line.innerHTML = ''; el('b', '', line, '$' + Math.round(v).toLocaleString(loc)); el('span', '', line, (usdEur ? ' · ' + T.about + ' ' + Math.round(v * usdEur).toLocaleString(loc) + ' €' : '') + ' · −' + r + ' % ' + T.sous + (e.caratUsd ? ' · $' + Math.round(e.caratUsd * (1 - r / 100)).toLocaleString(loc) + ' ' + T.per : ''));
        Array.prototype.forEach.call(marks.children, function(b){ b.classList.toggle('is-on', Number(b.dataset.r) === r); }); };
      [10, 15, 20, 30].forEach(function(r){ var b = el('button', 'rapi-mark', marks, '−' + r + ' %'); b.type = 'button'; b.dataset.r = r; b.addEventListener('click', function(){ sl.value = String(r); draw2(); }); });
      sl.addEventListener('input', draw2); draw2();
    }
    go.addEventListener('click', function(){
      var ct = Number(String(size.value).replace(',', '.')); out.innerHTML = '';
      if (!(ct > 0.009 && ct <= 20)){ out.textContent = T.sizeErr; return; }
      var p = { shape: shape.value, carat: ct, color: color.value, clarity: clarity.value };
      if (opts.estimer){ out.textContent = T.wait; go.disabled = true; opts.estimer(p).then(function(e){ go.disabled = false; montrer(e, e.at); }, function(){ go.disabled = false; out.textContent = T.err; }); return; }
      montrer(null, null);
    });
    draw();
  }
  window.ALAYA_RAPI = { render: render, estimerGrille: estimerGrille, SHAPES: SHAPES, COLORS: COLORS, CLARITIES: CLARITIES };
})();
