/* LA GESTION DE L'ATELIER (4 octobre 2026) : ce qui, chez Ilyes, tourne autour des
   documents. Production, fournisseurs et leurs paiements, transport, fonderie,
   categories, rapports de revenus, cours de l'or, tableau de bord, archives.
   Charge par atelier.js, qui lui passe ses outils ; il ajoute ses objets a TYPES
   et repond a ses propres routes.

   SES CALCULS SONT REPRIS TELS QU'IL LES A ECRITS, chacun avec son fichier :
   - monture (pages/production/AddMounts.js) : poids 24k = poids 18k x 0,82 ;
     total1 = prix 24k x poids 18k x 0,82 ; total2 = facon + total1.
   - diamant (AddDiamonds.js) : total = X euros x CT. Gemme (AddGems.js) : total = X euros x carat.
   - sertissage (AddSertissage.js) : total1 = nombre de pierres x X euros 2 ; total2 = total1 + CEN.
   - cout de fabrication (TotalCosts.js) : services internes + sertissages + montures + diamants + gemmes.
   - cout actuel (helpers/modules.js, totalCurrentCost) : les montures recomptees au cours du jour,
     plus les quatre autres totaux, jamais moins que le cout d'origine ; sans monture, le cout d'origine.
   - prix d'une ligne de devis tiree d'une production (optimizedPrice) : cout actuel x (1 + marge x 0,01).
   - prix de vente de la table des productions (ProductionTable.js) : cout actuel x coefficient (3 par defaut).
   - rapport de revenus (IncomeReportsTable.js) : fabrication = somme des couts de fabrication des lignes ;
     prix de vente = somme(prix x quantite) x (1 + marge x 0,01) ; revenu = prix de vente - somme(prix x quantite).
   - ventes du jour (controller/invoice.controller.ts, logSale) : somme(prix x quantite) x (marge / 100 + 1),
     ajoutee a la date de creation d'une facture classee, retiree quand elle est supprimee.
   - du d'un fournisseur (controller/production/production.controller.ts) : + le total de chaque ligne
     qui lui est confiee ; (components/filterBar/FilterBarSecondary.js) : - chaque paiement enregistre.
   - fonderie (pages/founders) : or donne 18k = or donne 24k x 0,77 ; or recu en 24k = or recu 18k x 0,77 ;
     difference en 24k = or donne 24k - or recu 18k x 0,77.
   - tableau de bord (controller/dashboard/categoryStats.controller.ts) : part d'une categorie =
     productions de la categorie / productions x 100 ; (components/Price.js) : ecart = un cours moins le precedent. */
'use strict';
var fs = require('fs'), path = require('path'), https = require('https');

module.exports = function(cfg, tools, A){
  var TYPES = A.TYPES;
  function fix3(n){ return Number(Number(n).toFixed(3)); }
  /* his roundFixedNumber: a whole number stays whole, anything else keeps three decimals */
  function round3(cost){ return Number(cost) % 1 === 0 ? Number(Math.floor(cost)) : Number(Number(cost).toFixed(3)); }
  function N(v){ return Number(v) || 0; }
  function plain(name, fallback){ return tools.readJSON(A.fileOf(name), fallback); }
  function write(name, value){ tools.writeAtomic(A.fileOf(name), JSON.stringify(value, null, 1) + '\n'); }

  /* ---------- the gold price: typed and dated, his export read once ---------- */
  function gold(){
    if (!fs.existsSync(A.fileOf('or'))){
      var his = tools.readJSON(path.join(__dirname, '..', '12_BACKOFFICE_ILYES', 'alaya-backend', 'src', 'scripts', 'database', 'goldprices.json'), []);
      write('or', (Array.isArray(his) ? his : []).filter(function(g){ return g && isFinite(Number(g.price)); }).map(function(g){ return { id: A.newId(), price: Number(g.price), createdAt: tools.txt(g.createdAt), source: 'export Ilyes' }; }));
    }
    return plain('or', []).sort(function(a, b){ return a.createdAt < b.createdAt ? 1 : -1; });
  }
  function goldNow(){ var g = gold()[0]; return g ? g.price : 0; }

  /* ---------- his formulas ---------- */
  function computeProduction(r){
    (r.mountsItems || []).forEach(function(el){ el.weight24k = fix3(N(el.weight18k) * 0.82); el.total1 = fix3(N(el.price24k) * N(el.weight18k) * 0.82); el.total2 = fix3(N(el.manufacture) + N(el.price24k) * N(el.weight18k) * 0.82); });
    (r.diamondsItems || []).forEach(function(el){ el.total = fix3(N(el.xe) * N(el.ct)); });
    (r.gemsItems || []).forEach(function(el){ el.total = fix3(N(el.xe) * N(el.carat)); });
    (r.sertissagesItems || []).forEach(function(el){ el.total1 = fix3(N(el.numeroPt) * N(el.xe2)); el.total2 = fix3(N(el.numeroPt) * N(el.xe2) + N(el.cen)); });
    var sum = function(list, key){ return round3((list || []).reduce(function(s, el){ return s + N(el[key]); }, 0)); };
    r.mountsTotalCost = sum(r.mountsItems, 'total2'); r.diamondsTotalCost = sum(r.diamondsItems, 'total'); r.gemsTotalCost = sum(r.gemsItems, 'total');
    r.sertissagesTotalCost = sum(r.sertissagesItems, 'total2'); r.internalServicesTotalCost = sum(r.internalServicesItems, 'total');
    r.fabricationCost = fix3(r.internalServicesTotalCost + r.sertissagesTotalCost + r.mountsTotalCost + r.diamondsTotalCost + r.gemsTotalCost);
    ['mountsItems', 'diamondsItems', 'gemsItems', 'sertissagesItems', 'internalServicesItems'].forEach(function(k){ (r[k] || []).forEach(function(el){ if (!el.fakeId) el.fakeId = A.newId(); }); });
  }
  function totalCurrentCost(production, currentGoldValue, oldCost){
    if (production && production.mountsItems && production.mountsItems.length !== 0){
      var mounts = production.mountsItems.reduce(function(s, el){ return s + Number((N(el.manufacture) + N(currentGoldValue) * N(el.weight18k) * 0.82).toFixed(3)); }, 0);
      var cost = mounts + N(production.internalServicesTotalCost) + N(production.sertissagesTotalCost) + N(production.gemsTotalCost) + N(production.diamondsTotalCost);
      return Math.max(cost % 1 === 0 ? Math.floor(cost) : round3(cost), oldCost);
    }
    return Number(oldCost);
  }
  function totalValue(tot, percentage){ return round3(Number(tot) * (1 + percentage * 0.01)); }
  function optimizedPrice(gainPercentage, product, goldValue, fabricationCost){ return round3(totalValue(totalCurrentCost(product, goldValue, fabricationCost), gainPercentage)); }
  function saleOf(q){ return (q.items || []).reduce(function(s, el){ return s + N(el.price) * N(el.quantity) * (N(q.gainPercentage) / 100 + 1); }, 0); }
  function income(r){
    var q = (r.income || {}).quote || {}, base = (q.items || []).reduce(function(s, el){ return s + N(el.price) * N(el.quantity); }, 0), sell = base + base * N(q.gainPercentage) * 0.01;
    return { reference: (r.income || {}).reference || '', customerName: q.customerName || '', items: (q.items || []).length,
      manufacturing: round3((q.items || []).reduce(function(s, el){ return s + N((el.product || {}).fabricationCost); }, 0)), margin: N(q.gainPercentage), sellingPrice: round3(sell), revenue: Number((sell - base).toFixed(3)) };
  }
  /* the day's sales, as his logSale and logSaleOnDelete keep them */
  function logSale(q, date, sign){
    var list = plain('ventes', []), day = list.filter(function(s){ return s.date === date; })[0], total = saleOf(q);
    if (sign > 0){ if (day) day.total += total; else list.push({ date: date, total: total }); }
    else if (day) day.total = Math.max(day.total - total, 0);
    write('ventes', list);
  }

  /* ---------- the objects he had, described the way atelier.js describes its own ---------- */
  var PAY = [['cash', 'Espèces'], ['bank', 'Virement'], ['check', 'Chèque']];
  var GEMS = ['Pearls', 'Emerald', 'Amethyst', 'Topaz', 'Sapphire', 'Opal', 'Garnet', 'Aquamarine', 'Ruby', 'Peridot', 'Citrine', 'Turquoise', 'Tanzanite', 'Lapis Lazuli', 'Onyx', 'Iolite'];
  var SERVICES = ['cad', 'impression', 'fusion', 'oraf', 'plt', 'cert', 'incis', 'mat extr'];
  var V = ['vendor', 'Fournisseur', 'vendor'], ID = ['fakeId', '', 'hidden'];
  var SIDE = function(who){ return [[who + 'Company', 'Société'], [who + 'Branch', 'Établissement'], [who + 'Address', 'Domicile ou résidence', 'area'], [who + 'TaxCode', 'Code fiscal'], [who + 'VatNumber', 'Numéro de TVA']]; };
  var LANG = ['lang', 'Langue du document', 'radio', [['it', 'Italiano'], ['fr', 'Français'], ['en', 'English']]];
  Object.assign(TYPES, {
    'productions': { file: 'productions', numeric: true, noDoc: true, one: 'Production', name: 'productName', compute: computeProduction,
      list: [['productName', 'Nom'], ['category', 'Catégorie'], ['fabricationCost', 'Coût', 'money'], ['currentCost', 'Coût actuel', 'money'], ['sellPrice', 'Prix de vente', 'money']],
      groups: [['Le produit', [['avatar', 'Photo', 'photo'], ['productName', 'Nom du produit'], ['parentCategory', 'Catégorie parente', 'list', '@categories'], ['mainCategory', 'Catégorie principale', 'list', '@categories'], ['category', 'Catégorie', 'list', '@categories'], ['description', 'Description', 'area'], ['productQuantity', 'Quantité en stock', 'number'], ['checked', 'Vérifiée', 'check']]],
        ['Les montures', [['mountsItems', 'Montures', 'items', [V, ['weight18k', 'Poids 18k', 'number'], ['weight24k', 'Poids 24k', 'calc'], ['price24k', 'Prix 24k', 'number'], ['total1', 'Total 1', 'calc'], ['manufacture', 'Façon', 'number'], ['total2', 'Total 2', 'calc'], ID]]]],
        ['Les diamants', [['diamondsItems', 'Diamants', 'items', [V, ['lots', 'Lots'], ['ct', 'CT', 'number'], ['xe', 'X €', 'number'], ['total', 'Total', 'calc'], ['isMainDiamond', 'Principal', 'check'], ID]]]],
        ['Les gemmes', [['gemsItems', 'Gemmes', 'items', [V, ['type', 'Type', 'list', GEMS], ['lots', 'Lots'], ['carat', 'Carat', 'number'], ['xe', 'X €', 'number'], ['total', 'Total', 'calc'], ['isMainGem', 'Principale', 'check'], ID]]]],
        ['Le sertissage', [['sertissagesItems', 'Sertissage', 'items', [V, ['numeroPt', 'N° PT', 'number'], ['xe2', 'X € 2', 'number'], ['total1', 'Total 1', 'calc'], ['cen', 'CEN', 'number'], ['total2', 'Total 2', 'calc'], ID]]]],
        ['Les services internes', [['internalServicesItems', 'Services internes', 'items', [V, ['service', 'Service', 'list', SERVICES], ['total', 'Total', 'number'], ID]]]]] },
    'vendors': { file: 'fournisseurs', numeric: true, noDoc: true, one: 'Fournisseur', name: 'fullName', list: [['fullName', 'Nom'], ['phoneNumber', 'Téléphone'], ['services', 'Services'], ['duePayment', 'Dû', 'money']],
      groups: [['Le fournisseur', [['avatar', 'Photo', 'photo'], ['fullName', 'Nom complet'], ['address', 'Adresse', 'area'], ['phoneNumber', 'Téléphone'], ['vatNumber', 'Numéro de TVA']]]] },
    'categories': { file: 'categories', numeric: true, noDoc: true, one: 'Catégorie', name: 'name', list: [['name', 'Nom'], ['mainCategory', 'Catégorie principale'], ['parentCategory', 'Catégorie parente'], ['description', 'Description']],
      groups: [['La catégorie', [['mainCategory', 'Catégorie principale', 'list', '@categories'], ['parentCategory', 'Catégorie parente', 'list', '@categories'], ['name', 'Nom de la catégorie'], ['description', 'Description', 'area']]]] },
    'founders': { file: 'fonderie', numeric: true, noDoc: true, one: 'Transaction de fonderie', name: 'date', compute: function(r){ r.gold_given_18k = N(r.gold_given_24k) * 0.77; },
      list: [['gold_token_18k', 'Or reçu 18k'], ['received24', 'Or reçu 24k'], ['manufacturing_cost', 'Coût de façon', 'money'], ['gold_given_24k', 'Or donné 24k'], ['difference', 'Différence en 24k'], ['type_payment', 'Paiement'], ['date', 'Date', 'date']],
      groups: [['La transaction', [['gold_token_18k', 'Or reçu 18k (g)', 'number'], ['manufacturing_cost', 'Coût de façon', 'number'], ['gold_given_24k', 'Or donné 24k (g)', 'number'], ['type_payment', 'Mode de paiement', 'radio', PAY], ['date', 'Date de la transaction', 'date']]]] },
    'transports': { file: 'transports', byNumber: true, prefix: 'TR', one: 'Document de transport', name: 'receiverCompany', money: 'transport', list: [['receiverCompany', 'Destinataire'], ['senderCompany', 'Expéditeur'], ['date', 'Date', 'date'], ['checked', 'Vérifié']],
      groups: [['Le document', [LANG, ['number', 'Numéro'], ['date', 'Du', 'date'], ['checked', 'Vérifié', 'check']]], ['L’expéditeur', SIDE('sender')], ['Le destinataire', SIDE('receiver')],
        ['Le transport', [['transportReason', 'Motif du transport'], ['order', 'Votre commande'], ['orderDate', 'Du', 'date'], ['reglement', 'Règlement', 'radio', [['inAccount', 'En compte'], ['onBalance', 'Pour solde']]]]],
        ['Les biens', [['transportItem', 'Biens', 'items', [['name', 'Désignation'], ['price', 'Prix (€)', 'number'], ['quantity', 'Quantité', 'number']]]]],
        ['Les colis', [['goodsAppearance', 'Aspect extérieur des biens'], ['numberOfPackage', 'Nombre de colis', 'number'], ['weight', 'Poids (kg)', 'number'], ['port', 'Port'], ['pickupDate', 'Date et heure de l’enlèvement'], ['annotationOrVariations', 'Annotations, variations', 'area']]]] },
    /* never typed: one is born with each invoice marked "classee", as in his createInvoiceHandler */
    'incomes': { file: 'rapports-revenus', numeric: true, noDoc: true, noCreate: true, one: 'Rapport de revenus', name: 'customerName',
      list: [['customerName', 'Client'], ['items', 'Lignes'], ['manufacturing', 'Fabrication', 'money'], ['margin', 'Marge (%)'], ['sellingPrice', 'Prix de vente', 'money'], ['revenue', 'Revenu', 'money'], ['checked', 'Vérifié']],
      groups: [['Le rapport', [['checked', 'Vérifié', 'check']]]] },
    'events': { file: 'agenda', numeric: true, noDoc: true, one: 'Événement', name: 'title', list: [['title', 'Titre'], ['start', 'Début', 'date'], ['end', 'Fin', 'date']],
      groups: [['L’événement', [['title', 'Titre'], ['start', 'Début', 'date'], ['end', 'Fin', 'date']]]] }
  });
  /* HIS ORGANISATION, kept inside the studio: the steps of each creation flow in his order (pages/document/constant.js,
     pages/production/certificates/constant.js), each step made of the groups of fields it holds, and the columns of
     each table in the order of his tables (the { name } headers of each pages/.../index.js). */
  var STEPS = { 'cert-bijoux': [['Informations générales', [0, 3]], ['Diamants', [1]], ['Gemmes', [2]]], 'cert-diamants': [['Informations générales', [0, 1, 2]]], 'cert-gemmes': [['Informations générales', [0, 1, 2]]],
    'devis': [['Informations de base', [0, 1]], ['Lignes', [2]]], 'factures': [['Trouver le devis', []], ['Informations complémentaires', [0]]],
    'livraisons': [['Informations générales', [0, 1, 2]], ['Liste des marchandises', [3]], ['Transporteur', [4]]], 'transports': [['Informations générales', [0, 1, 2, 3]], ['Liste des biens', [4]], ['Informations complémentaires', [5]]],
    'productions': [['Informations de base', [0]], ['Montures', [1]], ['Diamants', [2]], ['Gemmes', [3]], ['Sertissage', [4]], ['Services internes', [5]]] };
  var LAST = { devis: 'Aperçu', factures: 'Aperçu', livraisons: 'Aperçu', transports: 'Aperçu', productions: 'Coûts totaux' };
  var CERT = [['productName', 'Produit'], ['createdAt', 'Créé le', 'date']], DOC = function(client){ return [[client, 'Client'], ['date', 'Date', 'date'], ['itemsCount', 'Lignes']]; };
  var LISTS = { 'cert-diamants': CERT, 'cert-gemmes': CERT, 'cert-bijoux': CERT, devis: DOC('customerName'), factures: DOC('customerName'), livraisons: DOC('assigneeCompany'), transports: DOC('receiverCompany'),
    productions: [['productName', 'Nom'], ['category', 'Catégorie'], ['createdAt', 'Date', 'date'], ['fabricationCost', 'Coût', 'money'], ['currentCost', 'Coût actuel', 'money'], ['sellPrice', 'Prix de vente', 'money']],
    vendors: [['fullName', 'Nom'], ['services', 'Services'], ['lastAssignment', 'Dernier travail', 'date'], ['duePayment', 'Dû', 'money']], categories: [['name', 'Nom'], ['description', 'Description']] };
  Object.keys(TYPES).forEach(function(k){ var t = TYPES[k]; if (LISTS[k]) t.list = LISTS[k]; t.steps = STEPS[k] || [[t.groups[0][0], t.groups.map(function(g, i){ return i; })]]; t.last = LAST[k] || 'Résumé'; });
  A.MAISON.push(['invoiceNumbering', 'Numérotation des factures', 'radio', [['studio', 'FAC-année-numéro'], ['ilyes', 'Numéro-refJJMMAAAA, comme avant']]], ['ticketWidth', 'Largeur de l’étiquette de production (mm)', 'number'], ['ticketHeight', 'Hauteur de l’étiquette de production (mm)', 'number']);
  A.MAISON.push(['sellingPriceFactor', 'Coefficient du prix de vente des productions (3 par défaut)', 'number']);
  function factor(){ var f = Number(A.maison().sellingPriceFactor); return f > 0 ? f : 3; }

  /* what a row shows beyond what is stored */
  TYPES.productions.view = function(r){ var cur = totalCurrentCost(r, goldNow(), r.fabricationCost); return { currentCost: round3(cur), sellPrice: round3(cur * factor()) }; };
  TYPES.vendors.view = function(r){ var mine = plain('fournisseurs-services', []).filter(function(s){ return s.vendor === r.id; }); return { services: mine.length, lastAssignment: mine.reduce(function(m, s){ return s.createdAt > m ? s.createdAt : m; }, ''), duePayment: round3(N(r.duePayment)) }; };
  TYPES.founders.view = function(r){ return { received24: round3(N(r.gold_token_18k) * 0.77), difference: round3(N(r.gold_given_24k) - N(r.gold_token_18k) * 0.77) }; };
  TYPES.incomes.view = income;
  TYPES.transports.total = function(r){ return round3((r.transportItem || []).reduce(function(s, el){ return s + N(el.price) * N(el.quantity); }, 0)); };

  /* a production gives work to its vendors: one service per line the first time the line is seen, and the vendor's due grows by it */
  TYPES.productions.after = function(r){
    var services = plain('fournisseurs-services', []), vendors = A.load('vendors'), changed = false;
    [['mountsItems', 'total2', 'mounts'], ['diamondsItems', 'total', 'diamonds'], ['gemsItems', 'total', 'gems'], ['sertissagesItems', 'total2', 'sertissages'], ['internalServicesItems', 'total', 'internalServices']].forEach(function(k){
      (r[k[0]] || []).forEach(function(x){
        var vend = vendors.filter(function(v){ return v.id === x.vendor; })[0];
        if (!vend || services.some(function(s){ return s.fakeId === x.fakeId; })) return;
        services.push({ id: A.newId(), vendor: x.vendor, serviceCost: N(x[k[1]]), servicePaid: false, servicePaymentType: '', servicePaymentDate: '', serviceName: k[2], productName: r.productName, productAvatar: r.avatar || '', productRef: r.reference, fakeId: x.fakeId, createdAt: tools.now() });
        vend.duePayment = N(vend.duePayment) + N(x[k[1]]); changed = true;
      });
    });
    if (changed){ write('fournisseurs-services', services); A.save('vendors', vendors); }
  };
  /* a devis line drawn from a production keeps the production as it was, and the gold price of that day */
  TYPES.devis.compute = function(r){
    var prods = A.load('productions'), g = goldNow();
    (r.items || []).forEach(function(it){
      if (!it.productId){ delete it.product; delete it.goldValue; return; }
      var p = prods.filter(function(x){ return x.id === it.productId; })[0];
      if (!it.product && p) it.product = { reference: p.reference, productName: p.productName, mountsItems: p.mountsItems || [], internalServicesTotalCost: p.internalServicesTotalCost, sertissagesTotalCost: p.sertissagesTotalCost, gemsTotalCost: p.gemsTotalCost, diamondsTotalCost: p.diamondsTotalCost, fabricationCost: p.fabricationCost };
      if (!it.product){ delete it.productId; return; }
      if (it.goldValue === '' || it.goldValue === undefined) it.goldValue = g;
    });
  };
  TYPES.factures.after = function(r, isNew){
    if (!isNew || !r.filed) return;
    var list = A.load('incomes'); list.push({ id: A.newId(), reference: A.nextRef('incomes', A.everHad('incomes', list)), createdAt: tools.now(), income: JSON.parse(JSON.stringify(r)), checked: false }); A.save('incomes', list);
    logSale(r.quote || {}, tools.txt(r.createdAt).slice(0, 10), 1);
  };
  TYPES.factures.onDelete = function(r){ if (r.filed) logSale(r.quote || {}, tools.txt(r.createdAt).slice(0, 10), -1); };
  TYPES.factures.onRestore = function(r){ if (r.filed) logSale(r.quote || {}, tools.txt(r.createdAt).slice(0, 10), 1); };

  /* ---------- sold or waiting: a production is sold when a line of a filed invoice was drawn from it (his dashboard printed a fixed 71 / 29) ---------- */
  function soldIds(){ var ids = {}; A.load('factures').forEach(function(f){ if (f.filed) ((f.quote || {}).items || []).forEach(function(it){ if (it.productId) ids[it.productId] = 1; }); }); return ids; }

  /* ---------- HIS PER-USER PERMISSIONS (models/user.model.ts, components/permission), under his names, for the studio's accounts.
     An admin of the studio does everything. Anyone else sees and writes only what is ticked for them here. ---------- */
  var PROD_STEPS = ['basicInfo', 'mounts', 'diamonds', 'gems', 'sertissage', 'internalServices'], FLAG = { devis: 'quotes', factures: 'invoice', transports: 'transport', livraisons: 'deliveryNotes', incomes: 'incomeReports' };
  function blankRights(){ var p = { prodStatus: false }; PROD_STEPS.forEach(function(k){ p[k] = { viewOnly: false, edit: false }; }); return { production: p, quotes: false, transport: false, invoice: false, deliveryNotes: false, incomeReports: false }; }
  function rightsOf(email){ var all = plain('droits', {}), mine = all[tools.txt(email).toLowerCase()] || {}, r = blankRights(); Object.keys(FLAG).forEach(function(k){ r[FLAG[k]] = mine[FLAG[k]] === true; });
    PROD_STEPS.forEach(function(k){ var m = (mine.production || {})[k] || {}; r.production[k] = { viewOnly: m.viewOnly === true, edit: m.edit === true }; }); r.production.prodStatus = (mine.production || {}).prodStatus === true; return r; }
  function can(user, type, write){
    if (user.role === 'admin') return true;
    var r = rightsOf(user.email);
    if (FLAG[type]) return r[FLAG[type]];
    if (type === 'productions') return PROD_STEPS.some(function(k){ return r.production[k].edit || (!write && r.production[k].viewOnly); });
    return !write && ['vendors', 'categories'].indexOf(type) >= 0 && can(user, 'productions', false);   /* the names a production form needs */
  }
  /* to delete a production one must hold its first step, the one that names it */
  function canDelete(user, type){ return user.role === 'admin' || (type === 'productions' ? rightsOf(user.email).production.basicInfo.edit : can(user, type, true)); }
  /* the fields of a production a user may write: those of the steps ticked "edit" */
  function prodFields(user){ if (user.role === 'admin') return null; var r = rightsOf(user.email), out = []; TYPES.productions.groups.forEach(function(g, i){ if (r.production[PROD_STEPS[i]].edit) out = out.concat(g[1]); }); return out; }

  /* ---------- his production ticket (pages/production/PrintTicketComponent.js): the code, the number, the price, the carats, the gold, the stones ---------- */
  function ticket(p, qr){
    var m = A.maison(), w = Number(m.ticketWidth) > 0 ? Number(m.ticketWidth) : 60, h = Number(m.ticketHeight) > 0 ? Number(m.ticketHeight) : 30, byType = {};
    var ct = (p.diamondsItems || []).reduce(function(s, e){ return s + N(e.ct); }, 0), gold18 = (p.mountsItems || []).reduce(function(s, e){ return s + N(e.weight18k); }, 0), gems = (p.gemsItems || []).reduce(function(s, e){ return s + N(e.carat); }, 0), pt = (p.sertissagesItems || []).reduce(function(s, e){ return s + N(e.numeroPt); }, 0);
    (p.gemsItems || []).forEach(function(e){ byType[e.type || ''] = (byType[e.type || ''] || 0) + N(e.carat); });
    var esc = function(x){ return tools.txt(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Étiquette ' + esc(p.reference) + '</title><style>@page{size:' + w + 'mm ' + h + 'mm;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#f3f3f1;font-family:"Times New Roman",Times,serif;color:#000}' +
      '.tools{display:flex;gap:10px;justify-content:center;padding:12px;background:#fff;border-bottom:1px solid #e6e6e6;font-family:Helvetica,Arial,sans-serif}.tools button{font:600 13px Helvetica,Arial,sans-serif;height:36px;padding:0 16px;border:1px solid #111;border-radius:6px;background:#111;color:#fff;cursor:pointer}.tools span{align-self:center;font-size:13px;color:#555}' +
      '.label{width:' + w + 'mm;height:' + h + 'mm;margin:12mm auto;background:#fff;box-shadow:0 0 0 1px #d9d9d9;display:grid;grid-template-columns:auto 1fr 1fr;gap:1.5mm;align-items:center;padding:1.5mm 2mm;overflow:hidden}.label svg{height:' + (h - 5) + 'mm;width:' + (h - 5) + 'mm;display:block}' +
      '.col{display:flex;flex-direction:column;gap:.4mm;font-weight:600;font-size:' + Math.max(5.5, h / 4.6).toFixed(1) + 'pt;line-height:1.15;min-width:0}.col b{font-size:1.15em}.brand{letter-spacing:.2em;font-size:.8em}.brand small{display:block;font-size:.6em;letter-spacing:.24em}' +
      '@media print{html,body{background:#fff}.tools{display:none}.label{margin:0;box-shadow:none}}</style></head><body><div class="tools"><button onclick="window.print()">Imprimer l’étiquette</button><span>' + w + ' x ' + h + ' mm, réglable dans Maison</span></div>' +
      '<div class="label">' + qr(String(p.reference)) + '<div class="col"><span class="brand">ALAYA<small>FINE JEWELRY</small></span><b>#' + esc(p.reference) + '</b><span>' + round3(N(p.fabricationCost) * factor()).toFixed(2) + '€</span></div>' +
      '<div class="col"><span>' + ct.toFixed(2) + 'ct</span><span>' + gold18.toFixed(2) + 'g</span><span>' + (gems ? round3(gems) + 'ct ' + Object.keys(byType).map(function(t){ return round3(byType[t]) + t.slice(0, 2); }).join(' ') + ' ' : '') + pt + 'PT</span></div></div></body></html>';
  }
  /* his invoice numbers (controller/invoice.controller.ts): N-refDDMMYYYY for a filed invoice, ndN-refDDMMYYYY otherwise, each counted on its own */
  function hisInvoiceRef(filed, list){
    var d = new Date(), stamp = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear(), re = filed ? /^(\d+)-ref/ : /^nd(\d+)-ref/;
    var max = list.reduce(function(m, r){ var x = re.exec(tools.txt(r.reference)); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    return (filed ? '' : 'nd') + (max + 1) + '-ref' + stamp;
  }

  /* ---------- the dashboard: his figures, counted from what the studio holds ---------- */
  function dashboard(){
    var prods = A.load('productions'), byCat = {}, g = gold();
    prods.forEach(function(p){ var c = p.category || ''; byCat[c] = (byCat[c] || 0) + 1; });
    var sold = soldIds(), nSold = prods.filter(function(p){ return sold[p.id]; }).length;
    return { status: { sold: nSold, standby: prods.length - nSold }, overview: { users: tools.readJSON(path.join(cfg.data, 'users.json'), []).length, vendors: A.load('vendors').length, categories: A.load('categories').length, products: prods.length },
      categories: Object.keys(byCat).map(function(c){ return { category: c, percentage: byCat[c] / prods.length * 100 }; }),
      gold: g.slice(0, 6).map(function(x, i){ var prev = g[i + 1]; return { price: x.price, createdAt: x.createdAt, difference: prev && x.price >= 0 && prev.price >= 0 ? round3(x.price - prev.price) : 0 }; }),
      sales: plain('ventes', []).sort(function(a, b){ return a.date < b.date ? -1 : 1; }), founders: (function(l){ var s = function(k){ return round3(l.reduce(function(t, x){ return t + N(x[k]); }, 0)); };
        return { count: l.length, received18: s('gold_token_18k'), given24: s('gold_given_24k'), manufacturing: s('manufacturing_cost'), difference: round3(s('gold_given_24k') - s('gold_token_18k') * 0.77) }; })(A.load('founders')) };
  }
  function journal(day){
    var out = []; try { fs.readFileSync(path.join(cfg.data, 'audit.log'), 'utf8').split('\n').forEach(function(l){ if (l.indexOf('"t":"' + day) < 0) return; try { var j = JSON.parse(l); if (/^atelier|^piece|^undo|^text/.test(j.what)) out.push(j); } catch (e){} }); } catch (e){}
    return out.reverse();
  }
  function extend(out, user){
    var admin = user.role === 'admin';
    out.my = admin ? null : rightsOf(user.email); out.admin = admin; out.sold = soldIds();
    if (admin) out.users = tools.readJSON(path.join(cfg.data, 'users.json'), []).map(function(x){ return { email: x.email, name: x.name, role: x.role, rights: rightsOf(x.email) }; });
    Object.keys(TYPES).forEach(function(k){ if (!admin && !can(user, k, false)){ out.records[k] = []; out.types[k].hidden = true; } out.types[k].write = can(user, k, true); });
    out.gold = gold(); out.goldApi = !!process.env.GOLD_API; out.services = plain('fournisseurs-services', []); out.payments = plain('fournisseurs-paiements', []); out.dash = dashboard(); out.factor = factor(); out.pay = PAY;
    if (!admin){ out.services = []; out.payments = []; }
    out.archives = {}; Object.keys(TYPES).forEach(function(k){ var bin = tools.readJSON(A.fileOf(TYPES[k].file + '.corbeille'), []); if (bin.length) out.archives[k] = bin; });
  }
  /* his source, only when the house has put its key in the environment: goldapi.io, the 24k gram in euros */
  function fetchGold(){
    return new Promise(function(resolve, reject){
      https.get('https://www.goldapi.io/api/XAU/EUR', { headers: { 'x-access-token': process.env.GOLD_API, 'Content-Type': 'application/json' } }, function(r){
        var body = ''; r.on('data', function(c){ body += c; }); r.on('end', function(){ try { var p = Number(JSON.parse(body).price_gram_24k); if (r.statusCode !== 200 || !isFinite(p)) throw new Error('goldapi.io a répondu ' + r.statusCode); resolve(Number(p.toFixed(2))); } catch (e){ reject(e); } });
      }).on('error', reject);
    });
  }

  /* ---------- its own routes. Returns undefined when the route is not one of them. ---------- */
  function api(req, res, user, parts){
    var a = parts[0], id = parts[1], M = req.method;
    if (M === 'GET' && a === 'journal'){ var day = /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '') ? parts[1] : new Date().toISOString().slice(0, 10); tools.send(res, 200, { day: day, logs: journal(day) }); return true; }
    if (M === 'GET' && a === 'productions' && parts[2] === 'ticket'){
      var tp = can(user, 'productions', false) ? A.load('productions').filter(function(x){ return x.id === id; })[0] : null;
      if (!tp){ tools.fail(res, 404, 'not found'); return true; }
      tools.send(res, 200, ticket(tp, A.qrSVG), { 'Content-Type': 'text/html; charset=utf-8' }); return true;
    }
    if (a === 'droits' && M === 'PUT'){
      if (user.role !== 'admin'){ tools.fail(res, 403, 'not allowed'); return true; }
      return tools.readJSONBody(req).then(function(b){
        var email = decodeURIComponent(id || '').toLowerCase(), all = plain('droits', {}), r = blankRights();
        if (!tools.readJSON(path.join(cfg.data, 'users.json'), []).some(function(x){ return x.email.toLowerCase() === email; })) return tools.fail(res, 404, 'not found');
        Object.keys(FLAG).forEach(function(k){ r[FLAG[k]] = b[FLAG[k]] === true; });
        PROD_STEPS.forEach(function(k){ var m = (b.production || {})[k] || {}; r.production[k] = { viewOnly: m.viewOnly === true || m.edit === true, edit: m.edit === true }; }); r.production.prodStatus = (b.production || {}).prodStatus === true;
        all[email] = r; write('droits', all); tools.audit(user, 'atelier-droits', { reference: email }); tools.send(res, 200, r);
      });
    }
    if (M === 'GET' || ['or', 'vendorservices', 'vendorhistories'].indexOf(a) < 0 && !(a === 'vendors' && parts[2] === 'paiements') && parts[2] !== 'restaurer') return undefined;
    if (user.role !== 'admin'){ tools.fail(res, 403, 'not allowed'); return true; }
    if (parts[2] === 'restaurer' && M === 'POST' && TYPES[a]){
      var binFile = TYPES[a].file + '.corbeille', bin = plain(binFile, []), back = bin.filter(function(r){ return r.id === id; })[0], live = A.load(a);
      if (!back){ tools.fail(res, 404, 'not found'); return true; }
      var key = TYPES[a].byNumber ? 'number' : 'reference';
      if (live.some(function(r){ return r.id === back.id || (back[key] && r[key] === back[key]); })){ tools.fail(res, 409, 'ce numéro est déjà dans la liste : ' + back[key]); return true; }
      delete back.deletedAt; live.push(back); A.save(a, live); write(binFile, bin.filter(function(r){ return r.id !== id; }));
      if (TYPES[a].onRestore) TYPES[a].onRestore(back);
      tools.audit(user, 'atelier-restore', { type: a, reference: back[key] }); tools.send(res, 200, back); return true;
    }
    if (a === 'or' && M === 'DELETE' && id){ write('or', gold().filter(function(g){ return g.id !== id; })); tools.audit(user, 'atelier-or-delete'); tools.send(res, 200, { ok: true }); return true; }
    if (a === 'or' && M === 'POST' && id === 'actualiser'){
      if (!process.env.GOLD_API){ tools.fail(res, 400, 'aucune clé GOLD_API dans l’environnement'); return true; }
      return fetchGold().then(function(p){ var l = gold(); l.push({ id: A.newId(), price: p, createdAt: tools.now(), source: 'goldapi.io' }); write('or', l); tools.audit(user, 'atelier-or', { price: p }); tools.send(res, 201, { price: p }); }, function(e){ tools.fail(res, 502, e.message); });
    }
    if (a === 'vendorhistories' && M === 'DELETE' && id){ write('fournisseurs-paiements', plain('fournisseurs-paiements', []).filter(function(h){ return h.id !== id; })); tools.audit(user, 'atelier-paiement-delete'); tools.send(res, 200, { ok: true }); return true; }
    return tools.readJSONBody(req).then(function(b){
      if (a === 'or' && M === 'POST'){
        var price = Number(String(b.price).replace(',', '.'));
        if (!(price > 0)) return tools.fail(res, 400, 'il faut un cours, en euros par gramme');
        var l = gold(), when = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date + 'T12:00:00.000Z' : tools.now();
        l.push({ id: A.newId(), price: Number(price.toFixed(2)), createdAt: when, source: 'saisi' }); write('or', l); tools.audit(user, 'atelier-or', { price: price }); return tools.send(res, 201, { price: price });
      }
      if (a === 'vendorservices' && M === 'PUT'){
        var services = plain('fournisseurs-services', []), s = services.filter(function(x){ return x.id === id; })[0];
        if (!s) return tools.fail(res, 404, 'not found');
        if ('servicePaid' in b) s.servicePaid = b.servicePaid === true;
        if ('servicePaymentType' in b) s.servicePaymentType = PAY.some(function(o){ return o[0] === b.servicePaymentType; }) ? b.servicePaymentType : '';
        if ('servicePaymentDate' in b) s.servicePaymentDate = /^\d{4}-\d{2}-\d{2}$/.test(b.servicePaymentDate) ? b.servicePaymentDate : '';
        write('fournisseurs-services', services); tools.audit(user, 'atelier-service', { reference: s.productRef }); return tools.send(res, 200, s);
      }
      if (a === 'vendors' && parts[2] === 'paiements' && M === 'POST'){
        var vendors = A.load('vendors'), v = vendors.filter(function(x){ return x.id === id; })[0], sum = Number(String(b.sum).replace(',', '.'));
        if (!v) return tools.fail(res, 404, 'not found');
        if (!sum) return tools.fail(res, 400, 'il faut une somme');
        if (!PAY.some(function(o){ return o[0] === b.paymentType; })) return tools.fail(res, 400, 'il faut un mode de paiement');
        var hist = plain('fournisseurs-paiements', []), max = hist.reduce(function(m, h){ return Math.max(m, Number(h.reference) || 0); }, -1);
        hist.push({ id: A.newId(), vendor: id, sum: sum, paymentType: b.paymentType, description: tools.txt(b.description).trim().toLowerCase().slice(0, 300), reference: String(max + 1).padStart(6, '0'), createdAt: tools.now() });
        v.duePayment = N(v.duePayment) - sum;
        write('fournisseurs-paiements', hist); A.save('vendors', vendors); tools.audit(user, 'atelier-paiement', { vendor: v.fullName, sum: sum }); return tools.send(res, 201, { duePayment: v.duePayment });
      }
      tools.fail(res, 404, 'not found');
    });
  }
  return { api: api, extend: extend, can: can, canDelete: canDelete, prodFields: prodFields, hisInvoiceRef: hisInvoiceRef, soldIds: soldIds, rightsOf: rightsOf, ticket: ticket, goldNow: goldNow, optimizedPrice: optimizedPrice, totalCurrentCost: totalCurrentCost, computeProduction: computeProduction, income: income, round3: round3 };
};
