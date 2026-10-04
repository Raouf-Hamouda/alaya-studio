/* L'ATELIER (4 octobre 2026) : les certificats et les documents de la maison.
   Repris du back-office d'Ilyes Tlili (12_BACKOFFICE_ILYES, lu avant d'ecrire) :
   ses objets, ses champs, sous leurs noms a lui. Certificat de diamant, de gemme,
   de bijou (type diamonds / gems / prod chez lui), devis (quote), facture (invoice,
   tiree d'un devis), bon de livraison (deliveryNote), et la fiche de l'emetteur
   (les champs fullName, address, vatNumber, taxCode, ibanNumber, bicOrSwiftCode
   de son compte utilisateur), ici "Maison".

   Pas de base : un fichier JSON par objet dans data/atelier/. Son export Mongo
   (src/scripts/database/*.json) est vide, rien a importer.

   UNE SEULE DESCRIPTION DES CHAMPS (TYPES) : elle nettoie ce qui arrive, elle est
   envoyee au studio qui dessine les formulaires avec, et elle ecrit le document. */
'use strict';
var fs = require('fs'), path = require('path');

module.exports = function(cfg, tools){
  var DIR = path.join(cfg.data, 'atelier'), IMG = path.join(DIR, 'images');
  fs.mkdirSync(IMG, { recursive: true });

  /* ---------- his lists (alaya-frontend/src/pages/production/certificates/constant.js) ---------- */
  var SHAPES = ['Round Brilliant', 'Princess', 'Emerald', 'Asscher', 'Radiant', 'Cushion', 'Marquise', 'Pear', 'Oval', 'Heart', 'Trillion', 'Baguette', 'Kite', 'Old European Cut', 'Rose Cut', 'Briolette', 'Half Moon', 'Bullet Cut', 'Shield', 'Tapered Baguette', 'Trapezoid', 'Radiant-Cut Trapezoid', 'Lozenge', 'Fan', 'Cross', 'Snowflake', 'Star', 'Butterfly', 'Boat-shaped', 'Hexagonal', 'Pentagon', 'Square Cushion', 'Barrel', 'Octagonal', 'Triangular Brilliant', 'Quadrillion'];
  var COLOURS = ['D', 'EW+ (D) - EW (E)', 'E', 'EW (E) - RW+ (F)', 'F', 'RW+ (F) - RW (G)', 'G', 'RW (G) - W (H)', 'H', 'W (H) - STW+ (I)', 'I', 'STW+ (I) - STW (J)', 'J', 'STW (J) - TW+ (K)', 'K', 'TW+ (K) - TW (L)', 'L', 'TW (L) - TC (M-Z)', 'M-Z'];
  var CLARITIES = ['VVS', 'VVS1', 'VVS2', 'VS', 'VS1', 'VS2', 'SI', 'SI1', 'SI2', 'P', 'P1', 'P2', 'P3'];
  var SETTINGS = ['pavé', 'bar', 'channel', 'flush', 'bezel', 'invisible'];
  var TRANSPARENCIES = ['Transparent', 'Translucent', 'Opaque'];
  var QUALITY = [['Natural', 'Naturel'], ['Lab Grown', 'De laboratoire']];
  /* the scales his diamond report prints (GradingScale.js) and his jewel report prints (constant.js) */
  var SCALE_COLOUR = [['Incolore', 'DEF'], ['Presque incolore', 'GHIJ'], ['Faible', 'KLM'], ['Très clair', 'NOPQR'], ['Clair', 'STUVWXYZ']];
  var SCALE_CLARITY = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'];
  var SCALE_CUT = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];
  var GRADES = [['Exceptional White', 'D'], ['Exceptional White', 'E'], ['Rare White +', 'F'], ['Rare White', 'G'], ['White', 'H'], ['Slightly Tinted White +', 'I'], ['Slightly Tinted White', 'J'], ['Tinted White +', 'K'], ['Tinted White', 'L'], ['Tinted Colour', 'M-Z']];
  var CLARITY_TABLE = [['LC', 'Loupe clean', 'LC'], ['VVS', 'Very very small inclusions', 'VVS1 · VVS2'], ['VS', 'Very small inclusions', 'VS1 · VS2'], ['SI', 'Small inclusions', 'SI1 · SI2'], ['P', 'Piqué', 'P1 · P2 · P3']];

  /* ---------- the objects. A field: [his key, the French label, kind, options] ----------
     kinds: text, area, number, date, list (free text with his list offered), radio, check, photo, items */
  var PARTY = function(who){ return [[who + 'Company', 'Société'], [who + 'Branch', 'Établissement'], [who + 'Address', 'Domicile ou résidence', 'area'], [who + 'VatNumber', 'Numéro de TVA'], [who + 'TaxCode', 'Code fiscal']]; };
  var TYPES = {
    'cert-diamants': { file: 'certificats-diamants', prefix: 'D', one: 'Certificat de diamant', name: 'productName', list: [['productName', 'Certificat'], ['carat', 'Carat'], ['colourGrade', 'Couleur'], ['clarityGrade', 'Pureté'], ['date', 'Date']],
      groups: [['Le certificat', [['lang', 'Langue du document', 'radio', [['en', 'English'], ['fr', 'Français'], ['it', 'Italiano']]], ['avatar', 'Photo', 'photo'], ['date', 'Date', 'date'], ['productName', 'Nom du certificat'], ['diamondQuality', 'Nature', 'radio', QUALITY]]],
               ['La pierre', [['shape', 'Forme et taille', 'list', SHAPES], ['measurements', 'Dimensions'], ['carat', 'Poids en carats', 'number']]],
               ['La gradation', [['colourGrade', 'Couleur', 'list', COLOURS], ['clarityGrade', 'Pureté', 'list', CLARITIES], ['cut', 'Taille (cut)', 'list', SCALE_CUT], ['polish', 'Poli'], ['symmetry', 'Symétrie'], ['fluorescence', 'Fluorescence'], ['clarityCharacteristics', 'Caractéristiques de pureté'], ['inscription', 'Inscription'], ['girdle', 'Rondiste']]]] },
    'cert-gemmes': { file: 'certificats-gemmes', prefix: 'G', one: 'Certificat de gemme', name: 'productName', list: [['productName', 'Certificat'], ['species', 'Espèce'], ['variety', 'Variété'], ['weight', 'Poids'], ['date', 'Date']],
      groups: [['Le certificat', [['lang', 'Langue du document', 'radio', [['en', 'English'], ['fr', 'Français'], ['it', 'Italiano']]], ['avatar', 'Photo', 'photo'], ['date', 'Date', 'date'], ['productName', 'Nom du certificat'], ['diamondQuality', 'Nature', 'radio', QUALITY]]],
               ['La pierre', [['weight', 'Poids', 'number'], ['measurements', 'Dimensions'], ['shape', 'Forme', 'list', SHAPES], ['cuttingStyleCrown', 'Style de taille : couronne'], ['cuttingStylePavilion', 'Style de taille : culasse'], ['transparency', 'Transparence', 'list', TRANSPARENCIES], ['color', 'Couleur']]],
               ['La conclusion', [['species', 'Espèce'], ['variety', 'Variété'], ['description', 'Commentaires', 'area'], ['additionalInfos', 'Informations complémentaires', 'area']]]] },
    'cert-bijoux': { file: 'certificats-bijoux', prefix: 'J', one: 'Certificat de bijou', name: 'productName', list: [['productName', 'Certificat'], ['category', 'Type de bijou'], ['material', 'Matière'], ['date', 'Date']],
      groups: [['Le certificat', [['lang', 'Langue du document', 'radio', [['en', 'English'], ['fr', 'Français'], ['it', 'Italiano']]], ['productId', 'Production liée', 'production'], ['avatar', 'Photo', 'photo'], ['date', 'Date', 'date'], ['productName', 'Nom du certificat'], ['category', 'Type de bijou'], ['inscription', 'Inscription'], ['material', 'Description de la matière'],
                 /* chez lui ce poids vient de la production (somme des mountsItems.weight18k) : il en vient quand une production est liee, il se saisit sinon */
                 ['totalWeight', 'Poids total du bijou (g)', 'number'], ['setting', 'Serti', 'list', SETTINGS]]],
               ['Les diamants', [['diamondsItems', 'Diamants', 'items', [['isMainDiamond', 'Principal', 'check'], ['shape', 'Forme', 'list', SHAPES], ['ct', 'Carat', 'number'], ['numeroPt', 'Nombre', 'number'], ['weight', 'Poids', 'number'], ['measurements', 'Dimensions'], ['colourGrade', 'Couleur', 'list', COLOURS], ['clarityGrade', 'Pureté', 'list', CLARITIES], ['symmetry', 'Symétrie']]]]],
               ['Les gemmes', [['gemsItems', 'Gemmes', 'items', [['isMainGem', 'Principale', 'check'], ['shape', 'Forme', 'list', SHAPES], ['weight', 'Poids', 'number'], ['color', 'Couleur'], ['specy', 'Espèce'], ['variety', 'Variété'], ['transparency', 'Transparence', 'list', TRANSPARENCIES]]]]],
               ['Les textes', [['additionalInfos', 'Informations complémentaires', 'area'], ['description', 'Commentaires', 'area']]]] },
    'devis': { file: 'devis', prefix: 'DEV', one: 'Devis', name: 'customerName', money: true, list: [['customerName', 'Client'], ['clientType', 'Type'], ['date', 'Date'], ['checked', 'Vérifié']],
      groups: [['Le client', [['customerName', 'Nom du client'], ['address', 'Adresse', 'area'], ['phoneNumber', 'Téléphone'], ['fiscalCode', 'Code fiscal'], ['clientType', 'Type de client', 'radio', [['particular', 'Particulier'], ['professional', 'Professionnel']]]]],
               ['Le devis', [['lang', 'Langue du document', 'radio', [['it', 'Italiano'], ['fr', 'Français'], ['en', 'English']]], ['date', 'Date du devis', 'date'], ['gainPercentage', 'Marge (%)', 'number'], ['checked', 'Vérifié', 'check']]],
               ['Les lignes', [['items', 'Lignes', 'items', [['name', 'Désignation'], ['price', 'Prix (€)', 'number'], ['quantity', 'Quantité', 'number']]]]]] },
    /* chez lui une facture se tire d'un devis et le garde tel quel (quote) ; seuls le classement, la date et la verification lui appartiennent */
    'factures': { file: 'factures', prefix: 'FAC', one: 'Facture', name: 'customerName', money: true, fromQuote: true, list: [['customerName', 'Client'], ['quoteReference', 'Devis'], ['filed', 'Classée'], ['date', 'Date'], ['checked', 'Vérifiée']],
      groups: [['La facture', [['lang', 'Langue du document', 'radio', [['it', 'Italiano'], ['fr', 'Français'], ['en', 'English']]], ['date', 'Date de la facture', 'date'], ['filed', 'Classée', 'check'], ['checked', 'Vérifiée', 'check']]]] },
    'livraisons': { file: 'bons-de-livraison', prefix: 'BL', byNumber: true, one: 'Bon de livraison', name: 'assigneeCompany', list: [['assigneeCompany', 'Cessionnaire'], ['number', 'Numéro'], ['date', 'Date'], ['checked', 'Vérifié']],
      groups: [['Le bon', [['lang', 'Langue du document', 'radio', [['it', 'Italiano'], ['fr', 'Français'], ['en', 'English']]], ['number', 'Numéro progressif attribué'], ['date', 'Date', 'date'], ['checked', 'Vérifié', 'check']]],
               ['Le cédant', PARTY('transferor')], ['Le cessionnaire', PARTY('assignee')],
               ['Les marchandises', [['deliveryNoteItem', 'Marchandises', 'items', [['name', 'Description des marchandises (nature et qualité)'], ['returned', 'Rendue', 'number'], ['delivered', 'Livrée', 'number'], ['replaced', 'Remplacée', 'number']]]]],
               ['Le transport', [['vehicleLicense', 'Plaque du véhicule'], ['deliveryDriver', 'Le conducteur ou le cessionnaire']]]] }
  };
  /* the house as it signs its documents. Nothing is known in advance: every line is empty until typed, and an empty line is not printed. */
  var MAISON = [['fullName', 'Nom ou raison sociale'], ['address', 'Adresse', 'area'], ['vatNumber', 'Numéro de TVA'], ['taxCode', 'Code fiscal ou SIRET'], ['bankName', 'Banque'], ['ibanNumber', 'IBAN'], ['bicOrSwiftCode', 'BIC / SWIFT'], ['mentions', 'Mentions au pied des devis et factures', 'area']];

  /* ---------- the store ---------- */
  function fileOf(name){ return path.join(DIR, name + '.json'); }
  function load(type){ return tools.readJSON(fileOf(TYPES[type].file), []); }
  function save(type, list){ tools.writeAtomic(fileOf(TYPES[type].file), JSON.stringify(list, null, 1) + '\n'); }
  function maison(){ return tools.readJSON(fileOf('maison'), {}); }
  function fieldsOf(type){ return TYPES[type].groups.reduce(function(a, g){ return a.concat(g[1]); }, []); }

  /* ---------- what arrives is cleaned by the description, field by field ---------- */
  function cleanValue(f, v){
    var kind = f[2] || 'text';
    if (kind === 'number'){ if (v === '' || v === null || v === undefined) return ''; var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : ''; }
    if (kind === 'check') return v === true || v === 'true';
    if (kind === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
    if (kind === 'radio') return f[3].some(function(o){ return o[0] === v; }) ? v : f[3][0][0];
    if (kind === 'vendor' || kind === 'production'){ var kid = tools.txt(v); return load(kind === 'vendor' ? 'vendors' : 'productions').some(function(r){ return r.id === kid; }) ? kid : ''; }
    if (kind === 'hidden') return tools.txt(v).slice(0, 60);
    /* a line keeps what the form does not show (the production it came from, the gold price of that day) */
    if (kind === 'items') return (Array.isArray(v) ? v : []).slice(0, 200).map(function(row){ var o = {}; f[3].forEach(function(s){ if (s[2] !== 'calc') o[s[0]] = cleanValue(s, row ? row[s[0]] : ''); });
        if (f[0] === 'items' && row && row.productId){ o.productId = cleanValue(['', '', 'production'], row.productId); if (row.product && typeof row.product === 'object') o.product = row.product; o.goldValue = cleanValue(['', '', 'number'], row.goldValue); }
        return o; })
      .filter(function(o){ return f[3].some(function(s){ return ['hidden', 'check', 'calc'].indexOf(s[2]) < 0 && o[s[0]] !== '' && o[s[0]] !== undefined; }); });
    return tools.txt(v).trim().slice(0, kind === 'area' ? 4000 : 300);
  }
  function clean(fields, input, into){
    fields.forEach(function(f){ if (f[2] !== 'photo' && f[2] !== 'calc' && Object.prototype.hasOwnProperty.call(input, f[0])) into[f[0]] = cleanValue(f, input[f[0]]); });
    return into;
  }
  /* the photo of a certificate: a file dropped in the form, or a photo of a piece of the site */
  var EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  function photo(rec, input){
    if (input.avatarData){
      var m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(input.avatarData);
      if (!m) throw new Error('la photo doit être un JPEG, un PNG ou un WebP');
      var name = rec.id + '-' + Date.now() + '.' + EXT[m[1]];
      fs.writeFileSync(path.join(IMG, name), Buffer.from(m[2], 'base64'));
      rec.avatar = 'image:' + name;
    } else if (typeof input.avatar === 'string' && (input.avatar === '' || /^site:images\/[A-Za-z0-9_\-\/.]+\.(jpe?g|png|webp)$/i.test(input.avatar) && input.avatar.indexOf('..') < 0)) rec.avatar = input.avatar;
  }
  /* numbering: the prefix, the year, then one more than the highest of that year */
  function nextRef(type, list){
    /* his productions, vendors' payments and foundry lines count from 000000, six digits */
    if (TYPES[type].numeric){ var top = list.reduce(function(m, r){ return /^\d+$/.test(tools.txt(r.reference)) ? Math.max(m, Number(r.reference)) : m; }, -1); return String(top + 1).padStart(6, '0'); }
    var pre = TYPES[type].prefix + '-' + new Date().getFullYear() + '-', max = 0;
    list.forEach(function(r){ if (tools.txt(r.reference).indexOf(pre) === 0) max = Math.max(max, parseInt(r.reference.slice(pre.length), 10) || 0); });
    return pre + String(max + 1).padStart(4, '0');
  }
  function nextNumber(list){ return String(list.reduce(function(m, r){ return Math.max(m, parseInt(r.number, 10) || 0); }, 0) + 1); }
  /* a number is never given twice: what was deleted still counts */
  function everHad(type, list){ return list.concat(tools.readJSON(fileOf(TYPES[type].file + '.corbeille'), [])); }
  function newId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---------- money, the way his quote counts: quantity x price, the margin on top ---------- */
  /* a line drawn from a production is priced his way (optimizedPrice): the production's cost at the gold price kept on the line, the margin on top */
  function lines(q){ var g = 1 + (Number(q.gainPercentage) || 0) / 100; return (q.items || []).map(function(it){
    var qty = Number(it.quantity) || 0, unit = it.product ? G.optimizedPrice(Number(q.gainPercentage) || 0, it.product, it.goldValue === '' || it.goldValue === undefined ? G.goldNow() : it.goldValue, Number(it.price) || 0) : (Number(it.price) || 0) * g;
    var amount = Math.round(qty * unit * 100) / 100; return { name: it.name, quantity: qty, unit: qty ? Math.round(amount / qty * 100) / 100 : 0, amount: amount }; }); }
  function total(q){ return Math.round(lines(q).reduce(function(s, l){ return s + l.amount; }, 0) * 100) / 100; }

  /* ---------- the QR code, as his reports carry one (qrcode, errorCorrectionLevel M). No library:
     byte mode, level M, versions 1 to 6 (up to 106 bytes), the best of the eight masks. ---------- */
  var QR_M = [null, [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2], [172, 16, 4]];   /* version: total codewords, EC per block, blocks */
  var GF_EXP = [], GF_LOG = [];
  (function(){ var x = 1; for (var i = 0; i < 255; i++){ GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]; })();
  function rsEC(data, n){
    var gen = [1], i, j;
    for (i = 0; i < n; i++){ var next = new Array(gen.length + 1).fill(0); for (j = 0; j < gen.length; j++){ next[j] ^= gen[j]; next[j + 1] ^= gen[j] ? GF_EXP[GF_LOG[gen[j]] + i] : 0; } gen = next; }
    var rem = new Array(n).fill(0);
    data.forEach(function(d){ var f = d ^ rem.shift(); rem.push(0); if (f) for (j = 0; j < n; j++) rem[j] ^= GF_EXP[GF_LOG[gen[j + 1]] + GF_LOG[f]]; });
    return rem;
  }
  function qrMatrix(text){
    var bytes = Array.from(Buffer.from(String(text), 'utf8')), v = 1, spec;
    while (v <= 6 && QR_M[v][0] - QR_M[v][1] * QR_M[v][2] - 2 < bytes.length) v++;
    if (v > 6) throw new Error('QR : texte trop long');
    spec = QR_M[v]; var nData = spec[0] - spec[1] * spec[2], bits = [], put = function(val, len){ for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4); put(bytes.length, 8); bytes.forEach(function(b){ put(b, 8); }); put(0, Math.min(4, nData * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var cw = []; for (var i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (var pad = 0; cw.length < nData; pad++) cw.push(pad % 2 ? 17 : 236);
    var per = nData / spec[2], blocks = [], ecs = [], out = [];
    for (i = 0; i < spec[2]; i++){ blocks.push(cw.slice(i * per, (i + 1) * per)); ecs.push(rsEC(blocks[i], spec[1])); }
    for (i = 0; i < per; i++) blocks.forEach(function(b){ out.push(b[i]); });
    for (i = 0; i < spec[1]; i++) ecs.forEach(function(e){ out.push(e[i]); });
    var n = 17 + 4 * v, M = [], R = [], r, c;
    for (r = 0; r < n; r++){ M.push(new Array(n).fill(0)); R.push(new Array(n).fill(false)); }
    var set = function(y, x, dark){ if (y >= 0 && y < n && x >= 0 && x < n){ M[y][x] = dark ? 1 : 0; R[y][x] = true; } };
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function(o){ for (r = -1; r <= 7; r++) for (c = -1; c <= 7; c++) set(o[0] + r, o[1] + c, r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))); });
    for (i = 8; i < n - 8; i++){ set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    if (v > 1){ var a = n - 7; for (r = -2; r <= 2; r++) for (c = -2; c <= 2; c++) set(a + r, a + c, Math.max(Math.abs(r), Math.abs(c)) !== 1); }
    for (i = 0; i < 9; i++){ if (!R[8][i]) set(8, i, 0); if (!R[i][8]) set(i, 8, 0); }
    for (i = 0; i < 8; i++){ set(8, n - 1 - i, 0); set(n - 1 - i, 8, 0); }
    set(n - 8, 8, 1);
    var stream = []; out.forEach(function(b){ for (var k = 7; k >= 0; k--) stream.push((b >> k) & 1); });
    var k = 0, up = true;
    for (c = n - 1; c > 0; c -= 2){ if (c === 6) c--; for (i = 0; i < n; i++){ r = up ? n - 1 - i : i; for (var d = 0; d < 2; d++) if (!R[r][c - d]) M[r][c - d] = k < stream.length ? stream[k++] : 0; } up = !up; }
    var MASKS = [function(y, x){ return (y + x) % 2 === 0; }, function(y){ return y % 2 === 0; }, function(y, x){ return x % 3 === 0; }, function(y, x){ return (y + x) % 3 === 0; },
      function(y, x){ return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; }, function(y, x){ return (y * x) % 2 + (y * x) % 3 === 0; }, function(y, x){ return ((y * x) % 2 + (y * x) % 3) % 2 === 0; }, function(y, x){ return ((y + x) % 2 + (y * x) % 3) % 2 === 0; }];
    var build = function(mask){
      var G = M.map(function(row, y){ return row.map(function(val, x){ return !R[y][x] && MASKS[mask](y, x) ? val ^ 1 : val; }); });
      var f = mask, rem = f << 10; for (var b = 14; b >= 10; b--) if ((rem >> b) & 1) rem ^= 0x537 << (b - 10);   /* level M is 00, so the five format bits are the mask */
      f = ((f << 10) | rem) ^ 0x5412;
      for (var j = 0; j < 15; j++){ var bit = (f >> j) & 1;
        if (j < 6) G[j][8] = bit; else if (j < 8) G[j + 1][8] = bit; else G[8][14 - j + (j === 8 ? 1 : 0)] = bit;
        if (j < 8) G[8][n - 1 - j] = bit; else G[n - 15 + j][8] = bit; }
      G[8][7] = (f >> 8) & 1; G[8][8] = (f >> 7) & 1;   /* the corner of the first copy, around the timing line */
      for (j = 9; j < 15; j++) G[8][14 - j] = (f >> j) & 1;
      return G;
    };
    var penalty = function(G){
      var p = 0, y, x, dark = 0;
      for (var pass = 0; pass < 2; pass++) for (y = 0; y < n; y++){ var run = 1; for (x = 1; x <= n; x++){ var cur = x < n ? (pass ? G[x][y] : G[y][x]) : -1, prev = pass ? G[x - 1][y] : G[y][x - 1]; if (cur === prev) run++; else { if (run >= 5) p += run - 2; run = 1; } } }
      for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++) if (G[y][x] === G[y][x + 1] && G[y][x] === G[y + 1][x] && G[y][x] === G[y + 1][x + 1]) p += 3;
      var pat = '10111010000', tap = '00001011101';
      for (y = 0; y < n; y++){ var row = G[y].join(''), col = G.map(function(l){ return l[y]; }).join(''); [row, col].forEach(function(s){ for (var q = 0; q + 11 <= n; q++){ var seg = s.substr(q, 11); if (seg === pat || seg === tap) p += 40; } }); }
      G.forEach(function(l){ l.forEach(function(val){ dark += val; }); });
      return p + Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
    };
    var best = null, bestP = Infinity;
    for (i = 0; i < 8; i++){ var G = build(i), pp = penalty(G); if (pp < bestP){ bestP = pp; best = G; } }
    return best;
  }
  function qrSVG(text){
    var G = qrMatrix(text), n = G.length, d = '';
    G.forEach(function(row, y){ row.forEach(function(val, x){ if (val) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z'; }); });
    return '<svg class="qrc" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 8) + ' ' + (n + 8) + '" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  /* what the code says: the house's address with the report number behind it. His encodes the production
     reference, or the address alone; there is no public page per report, so the number rides as a fragment. */
  function qrText(rec){ return 'https://alayafinejewelry.com/#' + tools.txt(rec.reference); }

  /* ---------- the words of the documents, in three languages ----------
     English on the certificates and Italian on the devis, facture and bon are HIS words (his PDF and
     certificate pages), spelling mistakes put right. Everything else is translated here. */
  var W = {
    en: { locale: 'en-GB', dec: '.', k_diamond: 'Alaya Fine Jewelry Report', k_gem: 'Identification Report', k_jewel: 'Jewelry Report', ident: 'Identification', report_number: 'Report Number', nature: 'Origin', natural: 'Natural', lab: 'Lab Grown',
      shape_cut: 'Shape and Cutting Style', measurements: 'Measurements', grading: 'Grading Results', carat: 'Carat Weight', colour: 'Color Grade', clarity: 'Clarity Grade', cut: 'Cut Grade', add_grading: 'Additional Grading Information',
      polish: 'Polish', symmetry: 'Symmetry', fluorescence: 'Fluorescence', clarity_char: 'Clarity Characteristics', girdle: 'Girdle', inscription: 'Inscription', scale: 'Grading Scale', s_colour: 'Color Scale', s_clarity: 'Clarity Scale', s_cut: 'Cut Scale',
      groups: ['Colorless', 'Near colorless', 'Faint', 'Very light', 'Light'], disclaimer: 'The results documented in this report refer only to the stone described, and were obtained using the techniques and equipment available to Alaya at the time of examination. This report is not a guarantee or valuation.',
      weight: 'Weight', shape: 'Shape', crown: 'Cutting Style: Crown', pavilion: 'Cutting Style: Pavilion', transparency: 'Transparency', color: 'Color', conclusion: 'Conclusion', species: 'Species', variety: 'Variety', comments: 'Comments', additional: 'Additional Information', approx: 'Image is approximate.',
      description: 'Description', type: 'Type of Jewel', material: 'Description of Material', t_weight: 'Total Weight of Jewel', t_stones: 'Total Amount of Stones', t_diamonds: 'Total Weight of Diamonds', t_gems: 'Total Weight of Gems', setting: 'Setting',
      diamonds: 'Diamonds', gems: 'Gems', n_diamonds: 'diamond(s)', n_gems: 'gem(s)', approx_total: 'total approx.', shapes: 'Shapes', colors: 'Colors', species_pl: 'Species', varieties: 'Varieties', colour_j: 'Colour Grade',
      t_colour: 'Colour Grades for Set Diamonds', t_clarity: 'Clarity Grades for Set Diamonds', check: 'Report Check', check_line: 'Check your jewelry report online at', jewel_foot: 'This report describes the jewel as examined at the atelier. It is not a guarantee or valuation.',
      quote: 'Quote', invoice: 'Invoice', from: 'From', client: 'Client', fiscal: 'Tax code', vat: 'VAT', designation: 'Description', qty: 'Quantity', unit: 'Unit price', amount: 'Amount', total: 'Total', pay: 'Payment by bank transfer', bank: 'Bank', of_quote: 'Quote',
      delivery: 'Delivery note', transferor: 'Transferor', assignee: 'Assignee', place: 'Place of delivery', goods: 'Description of the goods (nature and quality)', delivered: 'Delivered', returned: 'Returned', replaced: 'Replaced', plate: 'Vehicle license plate', driver: 'The driver or the transferee', taxcode: 'Tax code', ddt: 'Transport document', sender: 'Sender', recipient: 'Recipient', destination: 'Place of destination', reason: 'Transport reason', order: 'Your order', of: 'of', in_conto: 'On account', a_saldo: 'In settlement', importo: 'Amount', appearance: 'External appearance of the goods', packages: 'No. packages', weightkg: 'Weight kg', port: 'Port', pickup: 'Date and time of pick-up', notes: 'Annotations - Variations', sign_driver: 'Driver’s signature', sign_recipient: 'Recipient’s signature', by: 'By', delivery_by: 'Delivery' },
    fr: { locale: 'fr-FR', dec: ',', k_diamond: 'Rapport de diamant', k_gem: 'Rapport d’identification', k_jewel: 'Rapport de bijou', ident: 'Identification', report_number: 'Numéro du rapport', nature: 'Nature', natural: 'Naturel', lab: 'De laboratoire',
      shape_cut: 'Forme et taille', measurements: 'Dimensions', grading: 'Résultats de gradation', carat: 'Poids en carats', colour: 'Couleur', clarity: 'Pureté', cut: 'Taille', add_grading: 'Informations complémentaires',
      polish: 'Poli', symmetry: 'Symétrie', fluorescence: 'Fluorescence', clarity_char: 'Caractéristiques de pureté', girdle: 'Rondiste', inscription: 'Inscription', scale: 'Échelles de gradation', s_colour: 'Couleur', s_clarity: 'Pureté', s_cut: 'Taille',
      groups: ['Incolore', 'Presque incolore', 'Faible', 'Très clair', 'Clair'], disclaimer: 'Les résultats consignés dans ce rapport ne concernent que la pierre décrite. Ils ont été obtenus avec les techniques et l’équipement dont Alaya disposait au moment de l’examen. Ce rapport n’est ni une garantie ni une estimation de valeur.',
      weight: 'Poids', shape: 'Forme', crown: 'Style de taille, couronne', pavilion: 'Style de taille, culasse', transparency: 'Transparence', color: 'Couleur', conclusion: 'Conclusion', species: 'Espèce', variety: 'Variété', comments: 'Commentaires', additional: 'Informations complémentaires', approx: 'L’image est approximative.',
      description: 'Description', type: 'Type de bijou', material: 'Description de la matière', t_weight: 'Poids total du bijou', t_stones: 'Nombre total de pierres', t_diamonds: 'Poids total des diamants', t_gems: 'Poids total des gemmes', setting: 'Serti',
      diamonds: 'Diamants', gems: 'Gemmes', n_diamonds: 'diamant(s)', n_gems: 'gemme(s)', approx_total: 'total env.', shapes: 'Formes', colors: 'Couleurs', species_pl: 'Espèces', varieties: 'Variétés', colour_j: 'Couleur',
      t_colour: 'Couleur des diamants sertis', t_clarity: 'Pureté des diamants sertis', check: 'Vérification du rapport', check_line: 'Vérifiez votre rapport en ligne sur', jewel_foot: 'Ce rapport décrit le bijou tel qu’il a été examiné à l’atelier. Il n’est ni une garantie ni une estimation de valeur.',
      quote: 'Devis', invoice: 'Facture', from: 'Émetteur', client: 'Client', fiscal: 'Code fiscal', vat: 'TVA', designation: 'Désignation', qty: 'Quantité', unit: 'Prix unitaire', amount: 'Montant', total: 'Total', pay: 'Règlement par virement', bank: 'Banque', of_quote: 'Devis',
      delivery: 'Bon de livraison', transferor: 'Cédant', assignee: 'Cessionnaire', place: 'Lieu de livraison', goods: 'Description des marchandises (nature et qualité)', delivered: 'Livrée', returned: 'Rendue', replaced: 'Remplacée', plate: 'Plaque du véhicule', driver: 'Le conducteur ou le cessionnaire', taxcode: 'Code fiscal', ddt: 'Document de transport', sender: 'Expéditeur', recipient: 'Destinataire', destination: 'Lieu de destination', reason: 'Motif du transport', order: 'Votre commande', of: 'du', in_conto: 'En compte', a_saldo: 'Pour solde', importo: 'Montant', appearance: 'Aspect extérieur des biens', packages: 'Nombre de colis', weightkg: 'Poids kg', port: 'Port', pickup: 'Date et heure de l’enlèvement', notes: 'Annotations, variations', sign_driver: 'Signature du conducteur', sign_recipient: 'Signature du destinataire', by: 'Par', delivery_by: 'Livraison' },
    it: { locale: 'it-IT', dec: ',', k_diamond: 'Rapporto Alaya Fine Jewelry', k_gem: 'Rapporto di identificazione', k_jewel: 'Rapporto del gioiello', ident: 'Identificazione', report_number: 'Numero del rapporto', nature: 'Origine', natural: 'Naturale', lab: 'Di laboratorio',
      shape_cut: 'Forma e stile di taglio', measurements: 'Misure', grading: 'Risultati della classificazione', carat: 'Peso in carati', colour: 'Colore', clarity: 'Purezza', cut: 'Taglio', add_grading: 'Informazioni aggiuntive',
      polish: 'Politura', symmetry: 'Simmetria', fluorescence: 'Fluorescenza', clarity_char: 'Caratteristiche di purezza', girdle: 'Cintura', inscription: 'Iscrizione', scale: 'Scala di classificazione', s_colour: 'Colore', s_clarity: 'Purezza', s_cut: 'Taglio',
      groups: ['Incolore', 'Quasi incolore', 'Tenue', 'Molto chiaro', 'Chiaro'], disclaimer: 'I risultati riportati in questo rapporto si riferiscono solo alla pietra descritta e sono stati ottenuti con le tecniche e le attrezzature a disposizione di Alaya al momento dell’esame. Questo rapporto non è una garanzia né una valutazione.',
      weight: 'Peso', shape: 'Forma', crown: 'Stile di taglio, corona', pavilion: 'Stile di taglio, padiglione', transparency: 'Trasparenza', color: 'Colore', conclusion: 'Conclusione', species: 'Specie', variety: 'Varietà', comments: 'Commenti', additional: 'Informazioni aggiuntive', approx: 'L’immagine è approssimativa.',
      description: 'Descrizione', type: 'Tipo di gioiello', material: 'Descrizione del materiale', t_weight: 'Peso totale del gioiello', t_stones: 'Numero totale di pietre', t_diamonds: 'Peso totale dei diamanti', t_gems: 'Peso totale delle gemme', setting: 'Incastonatura',
      diamonds: 'Diamanti', gems: 'Gemme', n_diamonds: 'diamante/i', n_gems: 'gemma/e', approx_total: 'totale circa', shapes: 'Forme', colors: 'Colori', species_pl: 'Specie', varieties: 'Varietà', colour_j: 'Colore',
      t_colour: 'Colore dei diamanti incastonati', t_clarity: 'Purezza dei diamanti incastonati', check: 'Verifica del rapporto', check_line: 'Verifichi il suo rapporto online su', jewel_foot: 'Questo rapporto descrive il gioiello come esaminato in atelier. Non è una garanzia né una valutazione.',
      quote: 'Preventivo', invoice: 'Fattura', from: 'Emittente', client: 'Cliente', fiscal: 'CF', vat: 'Partita IVA', designation: 'Descrizione prestazioni', qty: 'Quantità', unit: 'Prezzo unitario', amount: 'Importo in €', total: 'Totale', pay: 'Bonifico bancario su IBAN', bank: 'Banca', of_quote: 'Preventivo',
      delivery: 'Nota di consegna', transferor: 'Mittente', assignee: 'Cessionario', place: 'Luogo di consegna', goods: 'Descrizione dei beni (natura e qualità)', delivered: 'Consegnate', returned: 'Restituite', replaced: 'Sostituite', plate: 'Targa automezzo', driver: 'Il conducente o il cessionario', taxcode: 'Cod. Fisc.', ddt: 'Documento di trasporto (D.d.t.)', sender: 'Mittente', recipient: 'Destinatario', destination: 'Luogo di destinazione', reason: 'Causale del trasporto', order: 'Vs. ordine', of: 'del', in_conto: 'In conto', a_saldo: 'A saldo', importo: 'Importo (*)', appearance: 'Aspetto esteriore dei beni', packages: 'N. colli', weightkg: 'Peso kg', port: 'Porto', pickup: 'Data e ora del ritiro', notes: 'Annotazioni - Variazioni', sign_driver: 'Firma del conducente', sign_recipient: 'Firma del destinatario', by: 'A mezzo', delivery_by: 'Consegna',
      /* his lines, printed only in his language */
      dpr_t: 'D.P.R. 472 del 14-08-1996 - D.P.R. 696 del 21-12-1996', star: '(*) Solo in caso di utilizzo in sostituzione della certificazione fiscale', tentata: 'Tentata vendita', dpr_d: '(D.P.R. 472 del 14-08-1996)', bollo: 'Bollo', bollo_note: '«Bollo sull’originale di 2,00 euro. La marca da bollo va applicata solo qualora gli importi non soggetti ad IVA siano superiori a 77,47 euro»' }
  };
  var DEFAULT_LANG = { 'cert-diamants': 'en', 'cert-gemmes': 'en', 'cert-bijoux': 'en', 'devis': 'it', 'factures': 'it', 'livraisons': 'it', 'transports': 'it' };

  /* ---------- the document: A4 pages printed from the browser. The head and the foot are the head and
     the foot of a table, so they come back on every page when the document runs over one. ---------- */
  function esc(s){ return tools.txt(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nl(s){ return esc(s).replace(/\n/g, '<br>'); }
  function rows(list){ return list.filter(function(r){ return r[1] !== '' && r[1] !== undefined && r[1] !== null; }).map(function(r){ return '<div class="row"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>'; }).join(''); }
  function block(title, inner){ return inner ? '<section><h3>' + esc(title) + '</h3>' + inner + '</section>' : ''; }
  function text(title, v){ return block(title, v ? '<p class="text">' + nl(v) + '</p>' : ''); }
  function picture(rec){ var a = tools.txt(rec.avatar), src = a.indexOf('image:') === 0 ? '/api/atelier/image/' + a.slice(6) : (a.indexOf('site:') === 0 ? '/site/' + a.slice(5) : ''); return src ? '<figure class="photo"><img src="' + esc(src) + '" alt=""></figure>' : ''; }
  function houseLine(m){ return [m.fullName, tools.txt(m.address).replace(/\n/g, ', ')].filter(Boolean).map(esc).join(' · '); }
  function sum(list, fn){ return Math.round(list.reduce(function(s, x){ return s + (fn(x) || 0); }, 0) * 100) / 100; }
  function uniq(list){ return list.filter(function(v, i, a){ return v !== '' && v !== undefined && a.indexOf(v) === i; }).join(', '); }
  /* everything that depends on the language of one document */
  function speak(lang){
    var w = W[lang] || W.fr;
    return { w: w,
      day: function(d){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(w.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''; },
      num: function(n, unit){ return n === '' || n === undefined || n === null ? '' : String(n).replace('.', w.dec) + (unit ? ' ' + unit : ''); },
      euros: function(n){ return Number(n).toLocaleString(w.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; },
      quality: function(v){ return v === 'Natural' ? w.natural : (v === 'Lab Grown' ? w.lab : ''); } };
  }
  function scales(rec, w){
    var col = tools.txt(rec.colourGrade).trim().toUpperCase(), cla = tools.txt(rec.clarityGrade).trim().toUpperCase(), cut = tools.txt(rec.cut).trim().toLowerCase();
    var c1 = SCALE_COLOUR.map(function(g, i){ return '<div class="grp"><div class="cells">' + g[1].split('').map(function(l){ return '<i' + (col === l ? ' class="on"' : '') + '>' + l + '</i>'; }).join('') + '</div><em>' + esc(w.groups[i]) + '</em></div>'; }).join('');
    var c2 = SCALE_CLARITY.map(function(l){ return '<i' + (cla && (l === cla || (cla.length < l.length && l.indexOf(cla) === 0)) ? ' class="on"' : '') + '>' + l + '</i>'; }).join('');
    var c3 = SCALE_CUT.map(function(l){ return '<i' + (cut === l.toLowerCase() ? ' class="on"' : '') + '>' + l + '</i>'; }).join('');
    return '<section class="scales"><h3>' + esc(w.scale) + '</h3><p class="cap">' + esc(w.s_colour) + '</p><div class="scale colour">' + c1 + '</div><p class="cap">' + esc(w.s_clarity) + '</p><div class="scale"><div class="cells">' + c2 + '</div></div><p class="cap">' + esc(w.s_cut) + '</p><div class="scale"><div class="cells wide">' + c3 + '</div></div></section>';
  }
  /* his "report check": the code, the number, where to check */
  function check(rec, w){ return '<section class="check"><h3>' + esc(w.check) + '</h3><div class="checkin">' + qrSVG(qrText(rec)) + '<p><b>N° ' + esc(rec.reference) + '</b>' + esc(w.check_line) + '<br>alayafinejewelry.com</p></div></section>'; }
  function certHead(kind, rec, L){ return '<header class="chead"><img class="logo" src="/studio/logo.png" alt="Alaya Fine Jewelry"><p class="kind">' + esc(kind) + '</p><h1>' + esc(rec.productName || '') + '</h1><p class="ref">N° ' + esc(rec.reference) + (L.day(rec.date) ? ' <span>·</span> ' + L.day(rec.date) : '') + '</p></header>'; }
  function foot(m, lead){ return '<footer class="foot">' + (lead ? '<p class="lead0">' + esc(lead) + '</p>' : '') + (houseLine(m) ? '<p>' + houseLine(m) + '</p>' : '') + '<p>alayafinejewelry.com</p></footer>'; }
  function docHead(title, number, date, extra){ return '<header class="dhead"><img class="logo" src="/studio/logo.png" alt="Alaya Fine Jewelry"><div class="dtitle"><h1>' + esc(title) + '</h1>' + (extra || []).filter(Boolean).map(function(x){ return '<p class="legal">' + esc(x) + '</p>'; }).join('') + '<p>N° ' + esc(number) + '</p>' + (date ? '<p>' + date + '</p>' : '') + '</div></header>'; }

  /* each body gives the three parts of its page: head, content, foot */
  var BODY = {
    'cert-diamants': function(r, m, L){ var w = L.w;
      return [certHead(w.k_diamond, r, L), '<div class="cols"><div class="col">' +
        block(w.ident, rows([[w.report_number, r.reference], [w.nature, L.quality(r.diamondQuality)], [w.shape_cut, r.shape], [w.measurements, r.measurements]])) +
        block(w.grading, rows([[w.carat, L.num(r.carat, 'ct')], [w.colour, r.colourGrade], [w.clarity, r.clarityGrade], [w.cut, r.cut]])) +
        block(w.add_grading, rows([[w.polish, r.polish], [w.symmetry, r.symmetry], [w.fluorescence, r.fluorescence], [w.clarity_char, r.clarityCharacteristics], [w.girdle, r.girdle], [w.inscription, r.inscription]])) +
        '</div><div class="col">' + picture(r) + scales(r, w) + check(r, w) + '</div></div>', foot(m, w.disclaimer)];
    },
    'cert-gemmes': function(r, m, L){ var w = L.w;
      return [certHead(w.k_gem, r, L), '<div class="cols"><div class="col">' +
        block(w.ident, rows([[w.report_number, r.reference], [w.nature, L.quality(r.diamondQuality)], [w.weight, L.num(r.weight, 'g')], [w.measurements, r.measurements], [w.shape, r.shape], [w.crown, r.cuttingStyleCrown], [w.pavilion, r.cuttingStylePavilion], [w.transparency, r.transparency], [w.color, r.color]])) +
        block(w.conclusion, rows([[w.species, r.species], [w.variety, r.variety]])) + text(w.comments, r.description) +
        '</div><div class="col">' + picture(r) + (picture(r) ? '<p class="approx">' + esc(w.approx) + '</p>' : '') + text(w.additional, r.additionalInfos) + check(r, w) + '</div></div>', foot(m, w.disclaimer)];
    },
    'cert-bijoux': function(r, m, L){ var w = L.w;
      var ds = r.diamondsItems || [], gs = r.gemsItems || [], n = function(x){ return Number(x.numeroPt) || 1; }, byShape = {};
      ds.forEach(function(d){ var k = d.shape || 'Round Brilliant'; (byShape[k] = byShape[k] || []).push(d); });
      /* his Certficate.js: with a production, the jewel's weight is the sum of its mounts' 18k weights and the stones are counted on its setting lines */
      var prod = r.productId ? load('productions').filter(function(x){ return x.id === r.productId; })[0] : null;
      var jewelWeight = prod ? G.round3(sum(prod.mountsItems || [], function(x){ return Number(x.weight18k); })) : r.totalWeight;
      var stoneCount = prod ? sum(prod.sertissagesItems || [], function(x){ return Number(x.numeroPt) || 1; }) : sum(ds, n) + gs.length;
      var diamonds = Object.keys(byShape).map(function(shape){ var it = byShape[shape];
        return '<div class="lot"><p class="lead"><b>' + L.num(sum(it, n)) + ' ' + esc(w.n_diamonds) + '</b><span>' + esc(w.approx_total) + ' ' + L.num(sum(it, function(x){ return n(x) * Number(x.ct); }), 'ct') + '</span></p>' +
          '<div class="pair">' + rows([[w.shape, shape], [w.measurements, uniq(it.map(function(x){ return x.measurements; }))], [w.clarity, uniq(it.map(function(x){ return x.clarityGrade; }))], [w.colour_j, uniq(it.map(function(x){ return x.colourGrade; }))], [w.symmetry, uniq(it.map(function(x){ return x.symmetry; }))]]) + '</div></div>'; }).join('');
      var gems = gs.length ? '<div class="lot"><p class="lead"><b>' + gs.length + ' ' + esc(w.n_gems) + '</b></p>' + rows([[w.weight, L.num(sum(gs, function(x){ return Number(x.weight); }) || '', 'g')], [w.shapes, uniq(gs.map(function(x){ return x.shape; }))], [w.transparency, uniq(gs.map(function(x){ return x.transparency; }))], [w.colors, uniq(gs.map(function(x){ return x.color; }))], [w.species_pl, uniq(gs.map(function(x){ return x.specy; }))], [w.varieties, uniq(gs.map(function(x){ return x.variety; }))]]) + '</div>' : '';
      var grades = '<table class="grades">' + GRADES.map(function(g){ return '<tr><td>' + g[0] + '</td><td>' + g[1] + '</td></tr>'; }).join('') + '</table>';
      var clar = '<table class="grades">' + CLARITY_TABLE.map(function(g){ return '<tr><td>' + g[0] + '</td><td>' + g[1] + '</td><td>' + g[2] + '</td></tr>'; }).join('') + '</table>';
      return [certHead(w.k_jewel, r, L), '<div class="cols"><div class="col">' + picture(r) +
        block(w.description, rows([[w.type, r.category], [w.inscription, r.inscription], [w.material, r.material], [w.t_weight, L.num(jewelWeight, 'g')], [w.t_stones, stoneCount || ''], [w.t_diamonds, ds.length ? L.num(sum(ds, function(x){ return n(x) * Number(x.ct); }), 'ct') : ''], [w.t_gems, gs.length ? L.num(sum(gs, function(x){ return Number(x.weight); }), 'g') : ''], [w.setting, r.setting]])) +
        text(w.additional, r.additionalInfos) + text(w.comments, r.description) +
        (ds.length ? '<div class="refs">' + block(w.t_colour, grades) + block(w.t_clarity, clar) + '</div>' : '') + check(r, w) +
        '</div><div class="col">' + block(w.diamonds, diamonds) + block(w.gems, gems) + '</div></div>', foot(m, w.jewel_foot)];
    },
    'devis': function(r, m, L){ return commercial(L.w.quote, r, r, m, L); },
    'factures': function(r, m, L){ return commercial(L.w.invoice, r, r.quote || {}, m, L, r.quote && r.quote.reference ? L.w.of_quote + ' ' + r.quote.reference : ''); },
    'livraisons': function(r, m, L){ var w = L.w;
      var party = function(who){ return [r[who + 'Company'], r[who + 'Branch']].filter(Boolean).map(esc).join(', ') + (r[who + 'Address'] ? '<br>' + nl(r[who + 'Address']) : '') + (r[who + 'VatNumber'] ? '<br>' + esc(w.vat) + ' ' + esc(r[who + 'VatNumber']) : '') + (r[who + 'TaxCode'] ? '<br>' + esc(w.taxcode) + ' ' + esc(r[who + 'TaxCode']) : ''); };
      var q = function(v){ return v === '' || v === undefined ? '' : L.num(v); };
      return [docHead(w.delivery, r.number, L.day(r.date), [w.dpr_d, w.tentata]), '<div class="parties"><div><h3>' + esc(w.transferor) + '</h3><p>' + party('transferor') + '</p></div><div><h3>' + esc(w.assignee) + '</h3><p>' + party('assignee') + '</p></div></div>' +
        (r.assigneeAddress ? '<section class="place"><h3>' + esc(w.place) + '</h3><p>' + nl(r.assigneeAddress) + '</p></section>' : '') +
        '<table class="lines"><thead><tr><th>' + esc(w.goods) + '</th><th class="n">' + esc(w.delivered) + '</th><th class="n">' + esc(w.returned) + '</th><th class="n">' + esc(w.replaced) + '</th></tr></thead><tbody>' +
        (r.deliveryNoteItem || []).map(function(it){ return '<tr><td>' + esc(it.name) + '</td><td class="n">' + q(it.delivered) + '</td><td class="n">' + q(it.returned) + '</td><td class="n">' + q(it.replaced) + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<div class="parties signs"><div><h3>' + esc(w.plate) + '</h3><p>' + esc(r.vehicleLicense || '') + '</p></div><div><h3>' + esc(w.driver) + '</h3><p>' + esc(r.deliveryDriver || '') + '</p><div class="sign"></div></div></div>', foot(m)];
    }
  };
  BODY.transports = function(r, m, L){ var w = L.w, box = function(on){ return '<i class="box' + (on ? ' on' : '') + '"></i>'; };
    var side = function(who){ return [r[who + 'Company'], r[who + 'Branch']].filter(Boolean).map(esc).join(', ') + (r[who + 'Address'] ? '<br>' + nl(r[who + 'Address']) : '') + (r[who + 'TaxCode'] ? '<br>' + esc(w.taxcode) + ' ' + esc(r[who + 'TaxCode']) : '') + (r[who + 'VatNumber'] ? '<br>' + esc(w.vat) + ' ' + esc(r[who + 'VatNumber']) : ''); };
    var items = r.transportItem || [], tot = items.reduce(function(s, it){ return s + (Number(it.price) || 0) * (Number(it.quantity) || 0); }, 0), pair = '<span class="boxes">' + box(false) + esc(w.sender.toLowerCase()) + box(false) + esc(w.recipient.toLowerCase()) + '</span>';
    return [docHead(w.ddt, r.number, L.day(r.date), [w.dpr_t]), '<div class="parties"><div><h3>' + esc(w.sender) + '</h3><p>' + side('sender') + '</p></div><div><h3>' + esc(w.recipient) + '</h3><p>' + side('receiver') + '</p></div></div>' +
      '<section class="facts">' + rows([[w.destination, tools.txt(r.receiverAddress).replace(/\n/g, ', ')], [w.reason, r.transportReason], [w.order, [r.order, L.day(r.orderDate) ? w.of + ' ' + L.day(r.orderDate) : ''].filter(Boolean).join(' ')]]) +
      '<div class="row"><span>' + esc(w.in_conto) + ' / ' + esc(w.a_saldo) + '</span><b class="boxes">' + box(r.reglement !== 'onBalance') + esc(w.in_conto) + box(r.reglement === 'onBalance') + esc(w.a_saldo) + '</b></div><div class="row"><span>' + esc(w.by) + '</span><b>' + pair + '</b></div></section>' +
      '<table class="lines"><thead><tr><th class="q">' + esc(w.qty) + '</th><th>' + esc(w.goods) + '</th><th class="n">' + esc(w.importo) + '</th></tr></thead><tbody>' +
      items.map(function(it){ return '<tr><td class="q">' + L.num(it.quantity) + '</td><td>' + esc(it.name) + '</td><td class="n">' + ((Number(it.price) || 0) ? L.euros((Number(it.price) || 0) * (Number(it.quantity) || 0)) : '') + '</td></tr>'; }).join('') +
      '</tbody></table><div class="totalrow"><span>' + esc(w.total) + '</span><b>' + L.euros(tot) + '</b></div>' +
      '<section class="facts two">' + rows([[w.appearance, r.goodsAppearance], [w.packages, L.num(r.numberOfPackage)], [w.weightkg, L.num(r.weight)], [w.port, r.port], [w.pickup, r.pickupDate], [w.notes, r.annotationOrVariations]]) + '<div class="row"><span>' + esc(w.delivery_by) + '</span><b>' + pair + '</b></div></section>' +
      '<div class="parties signs"><div><h3>' + esc(w.sign_driver) + '</h3><div class="sign"></div></div><div><h3>' + esc(w.sign_recipient) + '</h3><div class="sign"></div></div></div>' + (w.star ? '<p class="mentions">' + esc(w.star) + '</p>' : ''), foot(m)];
  };
  function commercial(title, r, q, m, L, note){ var w = L.w, ls = lines(q);
    var house = [m.fullName ? '<b>' + esc(m.fullName) + '</b>' : '', m.address ? nl(m.address) : '', m.vatNumber ? esc(w.vat) + ' ' + esc(m.vatNumber) : '', m.taxCode ? esc(m.taxCode) : ''].filter(Boolean).join('<br>');
    var client = ['<b>' + esc(q.customerName || '') + '</b>', q.address ? nl(q.address) : '', esc(q.phoneNumber || ''), q.fiscalCode ? esc(w.fiscal) + ' ' + esc(q.fiscalCode) : ''].filter(Boolean).join('<br>');
    var bank = rows([[w.bank, m.bankName], ['IBAN', m.ibanNumber], ['BIC / SWIFT', m.bicOrSwiftCode]]);
    return [docHead(title, r.reference, L.day(r.date)), '<div class="parties"><div><h3>' + esc(w.from) + '</h3><p>' + (house || '&nbsp;') + '</p></div><div><h3>' + esc(w.client) + '</h3><p>' + client + '</p></div></div>' + (note ? '<p class="note">' + esc(note) + '</p>' : '') +
      '<table class="lines"><thead><tr><th>' + esc(w.designation) + '</th><th class="n">' + esc(w.qty) + '</th><th class="n">' + esc(w.unit) + '</th><th class="n">' + esc(w.amount) + '</th></tr></thead><tbody>' +
      ls.map(function(l){ return '<tr><td>' + esc(l.name) + '</td><td class="n">' + L.num(l.quantity) + '</td><td class="n">' + L.euros(l.unit) + '</td><td class="n">' + L.euros(l.amount) + '</td></tr>'; }).join('') +
      '</tbody></table>' + (w.bollo ? '<div class="bollo"><span>' + esc(w.bollo) + '</span><b></b></div>' : '') + '<div class="totalrow"><span>' + esc(w.total) + '</span><b>' + L.euros(total(q)) + '</b></div>' +
      (bank ? '<section class="pay"><h3>' + esc(w.pay) + '</h3>' + bank + '</section>' : '') + (m.mentions ? '<p class="mentions">' + nl(m.mentions) + '</p>' : '') + (w.bollo_note ? '<p class="mentions">' + esc(w.bollo_note) + '</p>' : ''), foot(m)];
  }
  var CSS = '@page{size:A4;margin:8mm 19mm 11mm}*{box-sizing:border-box}html,body{margin:0;background:#f3f3f1;color:#111;font:400 10.5pt/1.5 "Manrope",Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.tools{position:sticky;top:0;display:flex;gap:10px;justify-content:center;padding:12px;background:#fff;border-bottom:1px solid #e6e6e6;z-index:2}.tools button{font:500 13px "Manrope",sans-serif;height:32px;padding:0 16px;border:1px solid #111;border-radius:4px;background:#111;color:#fff;cursor:pointer}.tools button.q{background:#fff;color:#111;border-color:#d6d6d6}' +
    '.paper{position:relative;width:210mm;min-height:297mm;margin:10mm auto;padding:16mm 19mm 11mm;background:#fff;box-shadow:0 0 0 1px #e3e3e0;display:flex;flex-direction:column}.paper>.foot{margin-top:auto}.sheet{width:100%;border-collapse:collapse}.sheet>thead>tr>td,.sheet>tfoot>tr>td,.sheet>tbody>tr>td{padding:0;vertical-align:top}.runhead,.cover,.headspace,.footspace{display:none}.dtitle .legal{font:400 6.6pt "Overpass Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:#111;margin-top:1mm}.facts{margin-bottom:6mm}.facts .row{padding:1.6mm 0;font-size:9pt}.facts.two{display:grid;grid-template-columns:1fr 1fr;column-gap:14mm}.doc h1{font-size:21pt;white-space:nowrap}.doc .dhead{padding-bottom:7mm;margin-bottom:7mm}.doc .parties{margin-bottom:7mm}.doc .signs .sign{height:15mm}.boxes{display:inline-flex;align-items:center;gap:2mm;font-weight:400}.box{display:inline-block;width:3mm;height:3mm;border:1px solid #111;margin-left:3mm}.box.on{background:#111}.lines .q{width:22mm;text-align:left}.bollo{display:flex;justify-content:space-between;padding:3mm 0;font-size:10pt;color:#666}' +
    'h1{font:400 26pt/1.15 "EB Garamond",Georgia,serif;margin:0;letter-spacing:.01em}h3,.kind,.cap,.lines th{font:400 7pt/1.3 "Overpass Mono",ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:#777;margin:0}' +
    '.logo{height:11mm;width:auto;display:block}.chead{text-align:center;padding-bottom:7mm;border-bottom:1px solid #111;margin-bottom:7mm}.chead .logo{margin:0 auto 7mm}.chead .kind{margin-bottom:3mm;color:#111}.chead .ref{margin:3mm 0 0;font-size:9pt;color:#555}.chead .ref span{margin:0 2mm}' +
    '.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12mm;align-items:start}.col{min-width:0}.col>section,.col>.photo{margin-bottom:6.5mm}.cols .row{padding:1.75mm 0;font-size:9pt}section h3{padding-bottom:2.2mm;border-bottom:1px solid #111;margin-bottom:.5mm;break-after:avoid}' +
    '.row{display:flex;justify-content:space-between;gap:6mm;padding:2.1mm 0;border-bottom:1px solid #e4e4e4;font-size:9.5pt;break-inside:avoid}.row span{color:#666}.row b{font-weight:500;text-align:right}' +
    '.photo{margin:0 0 6.5mm;border:1px solid #e4e4e4;aspect-ratio:3/2;display:flex;align-items:center;justify-content:center;background:#fff;break-inside:avoid}.photo img{max-width:88%;max-height:88%;object-fit:contain}.approx{margin:-5mm 0 6.5mm;font-size:7.5pt;color:#888;text-align:center}' +
    '.text{margin:3mm 0 0;font:400 11pt/1.5 "EB Garamond",Georgia,serif;orphans:3;widows:3}.cap{margin:4mm 0 1.6mm;letter-spacing:.14em}.scales,.check,.refs,.pay,.signs{break-inside:avoid}.scale{display:flex;gap:1.2mm;flex-wrap:nowrap}.scale>.cells{flex:1}.scale.colour{gap:1mm}.scale.colour .grp{min-width:0}.scale.colour .grp:nth-child(1){flex:3}.scale.colour .grp:nth-child(2){flex:4}.scale.colour .grp:nth-child(3){flex:3}.scale.colour .grp:nth-child(4){flex:5}.scale.colour .grp:nth-child(5){flex:8}' +
    '.cells{display:flex;gap:.6mm}.cells i{flex:1;min-width:0;height:5.6mm;display:flex;align-items:center;justify-content:center;border:1px solid #d9d9d9;font:400 6pt "Manrope",sans-serif;font-style:normal;color:#666;white-space:nowrap;padding:0}.cells.wide i{font-size:6.2pt}.cells i.on{background:#111;border-color:#111;color:#fff;font-weight:600}.grp em{display:block;font:400 4.5pt/1.25 "Manrope",sans-serif;font-style:normal;color:#888;margin-top:1mm;text-transform:uppercase;letter-spacing:0;overflow-wrap:anywhere}' +
    '.checkin{display:flex;gap:5mm;align-items:center;padding-top:3mm}.qrc{width:24mm;height:24mm;flex:0 0 auto}.checkin p{margin:0;font-size:7.6pt;color:#666;line-height:1.5}.checkin b{display:block;font:500 9pt "Manrope",sans-serif;color:#111;margin-bottom:1mm}' +
    '.lot{margin-bottom:3.5mm;break-inside:avoid}.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:5mm}.pair .row{padding:1.3mm 0;font-size:8.2pt;gap:3mm}.refs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:5mm;margin:2mm 0 6.5mm}.refs section{margin:0}.refs h3{letter-spacing:.06em;font-size:5.6pt;line-height:1.35;min-height:6.4mm;display:flex;align-items:flex-end}.lead{display:flex;justify-content:space-between;margin:2.5mm 0 0;font:400 12pt "EB Garamond",Georgia,serif}.lead b{font-weight:500}.lead span{color:#555}.grades{width:100%;border-collapse:collapse;font-size:7pt;margin-top:.5mm}.grades td{padding:.5mm 0;line-height:1.3;border-bottom:1px solid #e4e4e4;color:#555}.grades td:last-child{text-align:right;color:#111;font-weight:600}' +
    '.foot{padding-top:4mm;border-top:1px solid #111;text-align:center}.foot p{margin:0 auto 1.5mm;max-width:150mm;font:400 6.6pt "Overpass Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#111}.foot p.lead0{font:400 7.4pt/1.5 "Manrope",sans-serif;letter-spacing:0;text-transform:none;color:#666}' +
    '.dhead{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:9mm;border-bottom:1px solid #111;margin-bottom:9mm}.dtitle{text-align:right}.dtitle p{margin:1.5mm 0 0;font-size:9.5pt;color:#555}' +
    '.parties{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-bottom:10mm;break-inside:avoid}.parties h3{margin-bottom:2.5mm}.parties p{margin:0;font-size:10pt;line-height:1.55}.parties b{font-weight:600}.place{margin-bottom:9mm}.place p{margin:2mm 0 0}.note{margin:-4mm 0 8mm;font-size:9pt;color:#666}' +
    '.lines{width:100%;border-collapse:collapse}.lines th{text-align:left;padding:0 0 2.5mm;border-bottom:1px solid #111;font-weight:400}.lines td{padding:3mm 0;border-bottom:1px solid #e4e4e4;vertical-align:top;font-size:10pt}.lines tr{break-inside:avoid}.lines .n{text-align:right;white-space:nowrap;padding-left:6mm;font-variant-numeric:tabular-nums}' +
    '.totalrow{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #111;margin:-1px 0 9mm;padding-top:4mm;font:400 15pt "EB Garamond",Georgia,serif;break-inside:avoid}.totalrow b{font-weight:400}.lines+.parties{margin-top:9mm}' +
    '.pay{width:55%;margin-bottom:8mm}.mentions{font-size:8pt;color:#666;margin:0 0 6mm}.signs{margin-top:9mm}.sign{height:22mm;border-bottom:1px solid #111;margin-top:4mm}' +
    '@media print{html,body{background:#fff}.tools{display:none}.paper{display:block;width:auto;min-height:0;margin:0;padding:0;box-shadow:none}' +
    /* the table head and foot are only spacers that come back on every page; the running head and the foot are fixed, so they print on every sheet; a white block hides the running head on the first */
    '.headspace{display:block;height:9mm}.footspace{display:block;height:16mm}.cert .footspace{height:25mm}.runhead{display:flex;position:fixed;top:0;left:0;right:0;height:6mm;align-items:center;justify-content:space-between;border-bottom:1px solid #111;padding-bottom:2mm;font:400 6.4pt "Overpass Mono",monospace;letter-spacing:.14em;text-transform:uppercase}.runhead img{height:3.6mm;width:auto}.cover{display:block;position:absolute;top:-6mm;left:-6mm;right:-6mm;height:15mm;background:#fff;z-index:2}.paper>.foot{position:fixed;bottom:0;left:0;right:0;margin:0;background:#fff}}';
  function page(type, rec){
    var t = TYPES[type], lang = W[rec.lang] ? rec.lang : DEFAULT_LANG[type], parts = BODY[type](rec, maison(), speak(lang));
    return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>' + esc(t.one + ' ' + (rec.reference || rec.number || '')) + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Manrope:wght@400;500;600&family=Overpass+Mono:wght@400&display=swap">' +
      '<style>' + CSS + '</style></head><body><div class="tools"><button onclick="window.print()">Imprimer ou enregistrer en PDF</button><button class="q" onclick="window.close()">Fermer</button></div>' +
      '<main class="paper ' + (/^cert/.test(type) ? 'cert' : 'doc') + '"><div class="runhead"><img src="/studio/logo.png" alt=""><span>' + ((/<p class="kind">([^<]*)/.exec(parts[0]) || /<h1>([^<]*)/.exec(parts[0]) || [])[1] || '') + ' · N° ' + esc(rec.reference || rec.number || '') + '</span></div><div class="cover"></div>' +
      '<table class="sheet"><thead><tr><td><div class="headspace"></div></td></tr></thead><tfoot><tr><td><div class="footspace"></div></td></tr></tfoot><tbody><tr><td>' + parts[0] + parts[1] + '</td></tr></tbody></table>' + parts[2] + '</main></body></html>';
  }

  /* ---------- the management layer (atelier-gestion.js): production, vendors, transport, foundry, reports, gold, dashboard ---------- */
  var G = require('./atelier-gestion')(cfg, tools, { TYPES: TYPES, MAISON: MAISON, fileOf: fileOf, load: load, save: save, maison: maison, newId: newId, nextRef: nextRef, everHad: everHad, qrSVG: qrSVG });

  /* ---------- the routes, under /api/atelier ---------- */
  function api(req, res, u, user, p){
    if (p !== '/atelier' && p.indexOf('/atelier/') !== 0) return false;
    var parts = p.split('/').slice(2), type = parts[0], id = parts[1];
    var mine = G.api(req, res, user, parts);
    if (mine !== undefined) return mine;
    var G_ = req.method === 'GET';
    if (G_ && type === 'all'){
      var out = { types: {}, maison: maison(), maisonFields: MAISON, records: {} };
      Object.keys(TYPES).forEach(function(k){ var t = TYPES[k], list = load(k);
        out.types[k] = { one: t.one, name: t.name, list: t.list, groups: t.groups, steps: t.steps, last: t.last, money: !!t.money, fromQuote: !!t.fromQuote, noDoc: !!t.noDoc, noCreate: !!t.noCreate, next: t.byNumber ? nextNumber(everHad(k, list)) : nextRef(k, everHad(k, list)) };
        out.records[k] = list.map(function(r){ return Object.assign({ itemsCount: ((t.fromQuote ? (r.quote || {}).items : r.items || r.deliveryNoteItem || r.transportItem) || []).length }, r, t.view ? t.view(r) : null, t.money ? { total: t.total ? t.total(r) : total(t.fromQuote ? (r.quote || {}) : r) } : null); }); });
      G.extend(out, user);
      tools.send(res, 200, out); return true;
    }
    if (G_ && type === 'image' && /^[a-z0-9-]+\.(jpg|png|webp)$/.test(id || '')){ tools.serveFile(req, res, path.join(IMG, id)); return true; }
    if (!TYPES[type] && type !== 'maison'){ tools.fail(res, 404, 'not found'); return true; }
    if (G_ && TYPES[type] && !TYPES[type].noDoc && parts[2] === 'document'){
      var doc = !G.can(user, type, false) ? null : load(type).filter(function(r){ return r.id === id; })[0];
      if (!doc){ tools.fail(res, 404, 'not found'); return true; }
      tools.send(res, 200, page(type, doc), { 'Content-Type': 'text/html; charset=utf-8' }); return true;
    }
    if (G_){ tools.fail(res, 404, 'not found'); return true; }
    /* his permissions: an admin writes everywhere, anyone else only where it is ticked for them (the house's settings stay with the admins) */
    if (!(type === 'maison' ? user.role === 'admin' : G.can(user, type, true))){ tools.fail(res, 403, 'not allowed'); return true; }
    if (req.method === 'DELETE' && TYPES[type] && id){
      if (!G.canDelete(user, type)){ tools.fail(res, 403, 'not allowed'); return true; }
      var all = load(type), gone = all.filter(function(r){ return r.id === id; })[0];
      if (!gone){ tools.fail(res, 404, 'not found'); return true; }
      /* nothing is destroyed: what leaves the list is appended to the bin of its object */
      var bin = fileOf(TYPES[type].file + '.corbeille'); tools.writeAtomic(bin, JSON.stringify(tools.readJSON(bin, []).concat([Object.assign({ deletedAt: tools.now() }, gone)]), null, 1) + '\n');
      save(type, all.filter(function(r){ return r.id !== id; })); if (TYPES[type].onDelete) TYPES[type].onDelete(gone); tools.audit(user, 'atelier-delete', { type: type, reference: gone.reference || gone.number });
      tools.send(res, 200, { ok: true }); return true;
    }
    return tools.readJSONBody(req, 12 * 1048576).then(function(b){
      try {
        if (type === 'maison' && req.method === 'PUT'){
          var m = clean(MAISON, b, maison()); tools.writeAtomic(fileOf('maison'), JSON.stringify(m, null, 1) + '\n'); tools.audit(user, 'atelier-maison'); return tools.send(res, 200, m);
        }
        var t = TYPES[type], list = load(type), rec;
        if (req.method === 'POST' && !id){
          if (t.noCreate) throw new Error('cet objet ne se crée pas à la main');
          rec = { id: newId(), createdAt: tools.now() };
          if (t.fromQuote){
            var q = load('devis').filter(function(x){ return x.id === b.quoteId; })[0];
            if (!q) throw new Error('il faut choisir un devis');
            rec.quote = JSON.parse(JSON.stringify(q));
          }
          if (!t.byNumber) rec.reference = type === 'factures' && maison().invoiceNumbering === 'ilyes' ? G.hisInvoiceRef(b.filed === true, everHad(type, list)) : nextRef(type, everHad(type, list));
          list.push(rec);
        } else if (req.method === 'PUT' && id){
          rec = list.filter(function(r){ return r.id === id; })[0];
          if (!rec) return tools.fail(res, 404, 'not found');
        } else return tools.fail(res, 404, 'not found');
        clean((type === 'productions' && G.prodFields(user)) || fieldsOf(type), b, rec); if (user.role === 'admin' || type !== 'productions') photo(rec, b);
        if (t.compute) t.compute(rec);
        if (t.byNumber){
          if (!rec.number) rec.number = nextNumber(everHad(type, list.filter(function(r){ return r !== rec; })));
          if (list.some(function(r){ return r !== rec && tools.txt(r.number).toLowerCase() === rec.number.toLowerCase(); })) throw new Error('ce numéro existe déjà : ' + rec.number);
        }
        if (!rec.date && req.method === 'POST' && fieldsOf(type).some(function(f){ return f[0] === 'date'; })) rec.date = new Date().toISOString().slice(0, 10);
        rec.updatedAt = tools.now(); rec.updatedBy = user.name || user.email;
        save(type, list); if (t.after) t.after(rec, req.method === 'POST'); tools.audit(user, 'atelier-' + (req.method === 'POST' ? 'create' : 'update'), { type: type, reference: rec.reference || rec.number });
        tools.send(res, req.method === 'POST' ? 201 : 200, rec);
      } catch (e){ tools.fail(res, 400, e.message); }
    });
  }
  return { api: api, /* for the check */ lines: lines, total: total, nextRef: nextRef, cleanValue: cleanValue, rsEC: rsEC, qrMatrix: qrMatrix, qrSVG: qrSVG, G: G };
};

/* the check: node atelier.js */
if (require.main === module){
  var assert = require('assert'), os = require('os');
  var m = module.exports({ data: fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-')) }, { txt: function(v){ return (v === 0 || v) ? String(v) : ''; }, readJSON: function(p, f){ return f; }, writeAtomic: function(){} });
  assert.strictEqual(m.total({ gainPercentage: 10, items: [{ price: 100, quantity: 2 }, { price: 33.33, quantity: 3 }] }), 329.99);
  assert.strictEqual(m.total({ items: [{ price: 1200, quantity: 1 }] }), 1200);
  var y = new Date().getFullYear();
  assert.strictEqual(m.nextRef('devis', [{ reference: 'DEV-' + y + '-0007' }, { reference: 'DEV-' + (y - 1) + '-0031' }, { reference: 'FAC-' + y + '-0040' }]), 'DEV-' + y + '-0008');
  assert.strictEqual(m.cleanValue(['carat', '', 'number'], '1,25'), 1.25);
  assert.strictEqual(m.cleanValue(['date', '', 'date'], '<script>'), '');
  assert.deepStrictEqual(m.rsEC([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  assert.strictEqual(m.qrMatrix('https://alayafinejewelry.com/#D-2026-0001').length, 29);   /* 40 bytes: version 3 */
  /* a production: mount 5 g of 18k at 100 euros the gram of 24k with 50 of making; a 0.5 ct diamond at 2000; a 1 ct gem at 300; 10 stones set at 3 plus 5; 20 of internal service */
  var pr = { mountsItems: [{ weight18k: 5, price24k: 100, manufacture: 50 }], diamondsItems: [{ ct: 0.5, xe: 2000 }], gemsItems: [{ carat: 1, xe: 300 }], sertissagesItems: [{ numeroPt: 10, xe2: 3, cen: 5 }], internalServicesItems: [{ total: 20 }] };
  m.G.computeProduction(pr);
  assert.strictEqual(pr.mountsItems[0].weight24k, 4.1); assert.strictEqual(pr.mountsItems[0].total1, 410); assert.strictEqual(pr.mountsItems[0].total2, 460);
  assert.strictEqual(pr.diamondsTotalCost, 1000); assert.strictEqual(pr.gemsTotalCost, 300); assert.strictEqual(pr.sertissagesItems[0].total1, 30); assert.strictEqual(pr.sertissagesTotalCost, 35);
  assert.strictEqual(pr.fabricationCost, 1815);
  /* gold at 121.68: mounts 50 + 121.68 x 5 x 0.82 = 548.888, so 1903.888; never under the first cost; 10 % on top = 2094.277 */
  assert.strictEqual(m.G.totalCurrentCost(pr, 121.68, 1815), 1903.888); assert.strictEqual(m.G.totalCurrentCost(pr, 10, 1815), 1815); assert.strictEqual(m.G.totalCurrentCost({}, 121.68, 700), 700);
  assert.strictEqual(m.G.optimizedPrice(10, pr, 121.68, 1815), 2094.277);
  assert.strictEqual(m.total({ gainPercentage: 10, items: [{ price: 1815, quantity: 1, product: pr, goldValue: 121.68 }] }), 2094.28);
  /* the income report of an invoice of that quote: 1815 made, sold 1815 x 1.1 = 1996.5, revenue 181.5 */
  assert.deepStrictEqual(m.G.income({ income: { reference: 'x', quote: { customerName: 'c', gainPercentage: 10, items: [{ price: 1815, quantity: 1, product: pr }] } } }), { reference: 'x', customerName: 'c', items: 1, manufacturing: 1815, margin: 10, sellingPrice: 1996.5, revenue: 181.5 });
  assert.strictEqual(m.nextRef('productions', []), '000000'); assert.strictEqual(m.nextRef('productions', [{ reference: '000041' }]), '000042');
  /* his invoice numbers: filed ones count on their own, the others carry nd */
  var st = function(){ var d = new Date(); return String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear(); }();
  assert.strictEqual(m.G.hisInvoiceRef(true, []), '1-ref' + st); assert.strictEqual(m.G.hisInvoiceRef(true, [{ reference: '7-ref01012026' }, { reference: 'nd40-ref01012026' }, { reference: 'FAC-2026-0009' }]), '8-ref' + st);
  assert.strictEqual(m.G.hisInvoiceRef(false, [{ reference: '7-ref01012026' }, { reference: 'nd40-ref01012026' }]), 'nd41-ref' + st);
  /* his permissions: nothing ticked, nothing allowed; an admin is never asked */
  assert.strictEqual(m.G.can({ role: 'admin' }, 'devis', true), true); assert.strictEqual(m.G.can({ role: 'producer', email: 'x' }, 'devis', true), false); assert.strictEqual(m.G.can({ role: 'producer', email: 'x' }, 'productions', false), false);
  /* his ticket: 0.50 ct of diamonds, 5.00 g of gold, 1 ct of sapphire, 10 stones, the cost times the factor */
  var tk = m.G.ticket(Object.assign({ reference: '000007', gemsItems: [{ carat: 1, xe: 300, type: 'Sapphire' }] }, pr, { gemsItems: [{ carat: 1, type: 'Sapphire' }] }), m.qrSVG);
  assert.ok(/#000007/.test(tk) && /5445\.00€/.test(tk) && /0\.50ct/.test(tk) && /5\.00g/.test(tk) && /1ct 1Sa 10PT/.test(tk), 'ticket');
  console.log('atelier ok');
}
