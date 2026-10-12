/* LA BASE DU STUDIO (7 octobre 2026). Une base SQLite, un seul fichier, data/studio.sqlite,
   lue et ecrite par le module node:sqlite de Node (aucune dependance). Tout ce que le studio
   tient en propre vit ici : l'atelier, le mailing, les commandes, le stock, le cours de l'or.
   Les pieces, elles, restent dans les fichiers du site : le site est leur seule source.

   Ce que la base garantit, et que les fichiers JSON ne garantissaient pas :
   - une ecriture est une transaction : tout passe ou rien ne passe ;
   - un stock ne descend jamais sous zero, une piece unique n'a jamais deux exemplaires,
     un mouvement de stock ne se modifie ni ne s'efface (triggers) ;
   - un numero de document, un courriel de contact, une commande Stripe sont uniques ;
   - une sauvegarde est un fichier : VACUUM INTO data/sauvegardes_base/<jour>.sqlite,
     au demarrage et une fois par jour, les trente derniers gardes.

   Les objets de l'atelier (devis, factures, productions...) gardent leurs champs tels
   qu'Ilyes les a decrits, dans une colonne JSON, avec a cote les colonnes qui servent a
   chercher et a trier (reference, numero, dates). Les tables du commerce (commandes,
   stock, contacts, envois) ont de vraies colonnes.

   Au premier lancement, les fichiers JSON de data/atelier et data/mailing sont importes,
   puis renommes .importe : rien n'est perdu, rien n'est lu deux fois. */
'use strict';
var fs = require('fs'), path = require('path');
var DatabaseSync = require('node:sqlite').DatabaseSync;

var SCHEMA = [
  "PRAGMA journal_mode = WAL", "PRAGMA foreign_keys = ON", "PRAGMA busy_timeout = 5000",
  /* ---- l'atelier : un objet = une ligne, ses champs en JSON, ses cles a cote ---- */
  "CREATE TABLE IF NOT EXISTS objets (type TEXT NOT NULL, id TEXT NOT NULL, reference TEXT, numero TEXT, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT, deleted_at TEXT, PRIMARY KEY (type, id))",
  "CREATE INDEX IF NOT EXISTS objets_vivants ON objets (type, deleted_at, created_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS objets_reference ON objets (type, reference) WHERE reference IS NOT NULL AND reference <> ''",
  "CREATE TABLE IF NOT EXISTS reglages (cle TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS cours_or (id TEXT PRIMARY KEY, prix REAL NOT NULL CHECK (prix > 0), source TEXT, created_at TEXT NOT NULL)",
  /* ---- les diamants (10 octobre) : une lecture de l'indice IDEX = quinze lignes datees, jamais retouchees ---- */
  "CREATE TABLE IF NOT EXISTS cours_diamants (id TEXT PRIMARY KEY, lu_le TEXT NOT NULL, rang INTEGER, driver TEXT NOT NULL, forme TEXT, poids TEXT, carat_min REAL, carat_max REAL, couleur TEXT, purete TEXT, part REAL, usd_ct REAL, eur_ct REAL, indice REAL, variation REAL, source TEXT)",
  "CREATE INDEX IF NOT EXISTS cours_diamants_lu ON cours_diamants (lu_le)",
  "CREATE TABLE IF NOT EXISTS ventes_jour (jour TEXT PRIMARY KEY, total REAL NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS services_fournisseurs (id TEXT PRIMARY KEY, vendor TEXT NOT NULL, service_name TEXT, service_cost REAL NOT NULL DEFAULT 0, service_paid INTEGER NOT NULL DEFAULT 0, service_payment_type TEXT DEFAULT '', service_payment_date TEXT DEFAULT '', product_name TEXT, product_avatar TEXT, product_ref TEXT, fake_id TEXT, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS services_vendor ON services_fournisseurs (vendor)",
  "CREATE TABLE IF NOT EXISTS paiements_fournisseurs (id TEXT PRIMARY KEY, vendor TEXT NOT NULL, somme REAL NOT NULL, payment_type TEXT NOT NULL, description TEXT, reference TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)",
  /* ---- le mailing ---- */
  "CREATE TABLE IF NOT EXISTS contacts (email TEXT PRIMARY KEY, nom TEXT DEFAULT '', source TEXT DEFAULT '', note TEXT DEFAULT '', added_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS suppressions (email TEXT PRIMARY KEY, reason TEXT NOT NULL, at TEXT NOT NULL, campaign_id TEXT)",
  "CREATE TABLE IF NOT EXISTS campagnes (id TEXT PRIMARY KEY, title TEXT, subject TEXT NOT NULL, from_email TEXT, from_name TEXT, html TEXT NOT NULL, tracked INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('queued','sending','paused','done','cancelled')), total INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS destinataires (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campagnes(id) ON DELETE CASCADE, position INTEGER NOT NULL, email TEXT NOT NULL, name TEXT DEFAULT '', status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','skipped','bounced','unsubscribed')), message_id TEXT DEFAULT '', thread_id TEXT DEFAULT '', sent_at TEXT, error TEXT DEFAULT '', opens INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, opened_at TEXT, clicked_at TEXT, unsubscribed_at TEXT, bounce_checked INTEGER NOT NULL DEFAULT 0, bounce_note TEXT DEFAULT '')",
  "CREATE INDEX IF NOT EXISTS destinataires_campagne ON destinataires (campaign_id, position)",
  "CREATE INDEX IF NOT EXISTS destinataires_file ON destinataires (status, campaign_id)",
  "CREATE INDEX IF NOT EXISTS destinataires_email ON destinataires (email)",
  "CREATE TABLE IF NOT EXISTS evenements (id INTEGER PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES destinataires(id) ON DELETE CASCADE, kind TEXT NOT NULL, url TEXT DEFAULT '', at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS jetons (jti TEXT PRIMARY KEY, at TEXT NOT NULL)",
  /* ---- le commerce : les commandes lues dans Stripe, leur preparation, les clients ---- */
  "CREATE TABLE IF NOT EXISTS commandes (id TEXT PRIMARY KEY, at TEXT NOT NULL, status TEXT, paid TEXT, total REAL NOT NULL DEFAULT 0, currency TEXT DEFAULT 'eur', email TEXT DEFAULT '', name TEXT DEFAULT '', phone TEXT DEFAULT '', address TEXT DEFAULT '', gift INTEGER NOT NULL DEFAULT 0, live INTEGER NOT NULL DEFAULT 0, payment_intent TEXT DEFAULT '', capture TEXT DEFAULT '', preparation TEXT NOT NULL DEFAULT 'a_preparer' CHECK (preparation IN ('a_preparer','preparee','expediee','livree','annulee','remboursee')), suivi TEXT DEFAULT '', note TEXT DEFAULT '', data TEXT, updated_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS commandes_date ON commandes (at)",
  "CREATE INDEX IF NOT EXISTS commandes_email ON commandes (email)",
  "CREATE TABLE IF NOT EXISTS commande_lignes (id INTEGER PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commandes(id) ON DELETE CASCADE, slug TEXT DEFAULT '', name TEXT, quantity INTEGER NOT NULL DEFAULT 1, amount REAL NOT NULL DEFAULT 0)",
  "CREATE INDEX IF NOT EXISTS lignes_commande ON commande_lignes (commande_id)",
  "CREATE VIEW IF NOT EXISTS clients AS SELECT e.email AS email, COALESCE(NULLIF(MAX(c.name), ''), MAX(k.nom), '') AS nom, MAX(c.phone) AS phone, MAX(c.address) AS address, COUNT(c.id) AS commandes, COALESCE(SUM(CASE WHEN c.paid = 'paid' THEN c.total ELSE 0 END), 0) AS depense, MIN(c.at) AS premiere, MAX(c.at) AS derniere, MAX(k.email) IS NOT NULL AS abonne, MAX(k.added_at) AS inscrit_le FROM (SELECT email FROM commandes WHERE email <> '' UNION SELECT email FROM contacts) e LEFT JOIN commandes c ON c.email = e.email LEFT JOIN contacts k ON k.email = e.email GROUP BY e.email",
  /* ---- le stock : jamais un nombre range, toujours la somme des mouvements ---- */
  "CREATE TABLE IF NOT EXISTS stock (slug TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'stock' CHECK (kind IN ('unique','stock','made_to_order')), min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0), emplacement TEXT DEFAULT '', note TEXT DEFAULT '', updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS mouvements (id INTEGER PRIMARY KEY, slug TEXT NOT NULL REFERENCES stock(slug) ON DELETE RESTRICT, qty INTEGER NOT NULL CHECK (qty <> 0), reason TEXT NOT NULL CHECK (reason IN ('entree','sortie','vente','retour','ajustement')), ref TEXT DEFAULT '', note TEXT DEFAULT '', by_user TEXT DEFAULT '', at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS mouvements_slug ON mouvements (slug, id)",
  "CREATE VIEW IF NOT EXISTS stock_etat AS SELECT s.*, COALESCE((SELECT SUM(m.qty) FROM mouvements m WHERE m.slug = s.slug), 0) AS on_hand, (SELECT MAX(m.at) FROM mouvements m WHERE m.slug = s.slug) AS dernier FROM stock s",
  "CREATE TRIGGER IF NOT EXISTS mv_jamais_negatif BEFORE INSERT ON mouvements WHEN (SELECT COALESCE(SUM(qty), 0) FROM mouvements WHERE slug = NEW.slug) + NEW.qty < 0 BEGIN SELECT RAISE(ABORT, 'le stock ne descend pas sous zéro'); END",
  "CREATE TRIGGER IF NOT EXISTS mv_piece_unique BEFORE INSERT ON mouvements WHEN (SELECT kind FROM stock WHERE slug = NEW.slug) = 'unique' AND (SELECT COALESCE(SUM(qty), 0) FROM mouvements WHERE slug = NEW.slug) + NEW.qty > 1 BEGIN SELECT RAISE(ABORT, 'pièce unique : un seul exemplaire'); END",
  "CREATE TRIGGER IF NOT EXISTS mv_immuable_update BEFORE UPDATE ON mouvements BEGIN SELECT RAISE(ABORT, 'un mouvement de stock ne se modifie pas'); END",
  "CREATE TRIGGER IF NOT EXISTS mv_immuable_delete BEFORE DELETE ON mouvements BEGIN SELECT RAISE(ABORT, 'un mouvement de stock ne s’efface pas'); END"
];

function now(){ return new Date().toISOString(); }
function readJSON(p, fallback){ try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e){ return fallback; } }
function camel(row){ if (!row) return row; var o = {}; Object.keys(row).forEach(function(k){ o[k.replace(/_([a-z])/g, function(a, c){ return c.toUpperCase(); })] = row[k]; }); return o; }

module.exports = function open(dataDir, opts){
  opts = opts || {};
  var file = dataDir === ':memory:' ? ':memory:' : path.join(dataDir, 'studio.sqlite');
  if (file !== ':memory:') fs.mkdirSync(dataDir, { recursive: true });
  var db = new DatabaseSync(file);
  SCHEMA.forEach(function(s){ db.exec(s); });
  /* 10 octobre : la table de l'or porte aussi l'argent, une colonne metal ('or' par defaut, pour les lignes d'avant) */
  if (!db.prepare('PRAGMA table_info(cours_or)').all().some(function(c){ return c.name === 'metal'; })) db.exec("ALTER TABLE cours_or ADD COLUMN metal TEXT NOT NULL DEFAULT 'or'");
  /* 10 octobre : une piece sur commande porte son delai, en jours */
  if (!db.prepare('PRAGMA table_info(stock)').all().some(function(c){ return c.name === 'delai_jours'; })) db.exec('ALTER TABLE stock ADD COLUMN delai_jours INTEGER NOT NULL DEFAULT 0');
  var S = {};   /* prepared statements, once */
  function q(sql){ return S[sql] || (S[sql] = db.prepare(sql)); }
  /* a transaction inside a transaction just runs inside it (a production's save writes its vendors from within the save) */
  var depth = 0;
  function tx(fn){ if (depth) return fn(); depth++; db.exec('BEGIN IMMEDIATE'); try { var r = fn(); db.exec('COMMIT'); depth--; return r; } catch (e){ depth--; try { db.exec('ROLLBACK'); } catch (e2){} throw e; } }

  /* ---------- les objets de l'atelier ---------- */
  function rowToRec(r){ var o = JSON.parse(r.data); if (r.deleted_at) o.deletedAt = r.deleted_at; return o; }
  var objets = {
    list: function(type, deleted){ return q('SELECT data, deleted_at FROM objets WHERE type = ? AND deleted_at IS ' + (deleted ? 'NOT ' : '') + 'NULL ORDER BY created_at, rowid').all(type).map(rowToRec); },
    get: function(type, id){ var r = q('SELECT data, deleted_at FROM objets WHERE type = ? AND id = ? AND deleted_at IS NULL').get(type, id); return r ? rowToRec(r) : null; },
    /* a record is written whole: its JSON, and beside it the keys the base indexes */
    put: function(type, rec){
      var clean = Object.assign({}, rec); delete clean.deletedAt;
      q('INSERT INTO objets (type, id, reference, numero, data, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT (type, id) DO UPDATE SET reference = excluded.reference, numero = excluded.numero, data = excluded.data, updated_at = excluded.updated_at, deleted_at = NULL')
        .run(type, String(rec.id), rec.reference ? String(rec.reference) : null, rec.number ? String(rec.number) : null, JSON.stringify(clean), rec.createdAt || now(), rec.updatedAt || now());
      return rec;
    },
    putAll: function(type, list){ tx(function(){ list.forEach(function(r){ objets.put(type, r); }); }); },
    trash: function(type, id){ var r = objets.get(type, id); if (!r) return null; q('UPDATE objets SET deleted_at = ? WHERE type = ? AND id = ?').run(now(), type, id); return r; },
    restore: function(type, id){ q('UPDATE objets SET deleted_at = NULL WHERE type = ? AND id = ?').run(type, id); return objets.get(type, id); },
    trashed: function(type){ return objets.list(type, true); },
    types: function(){ return q('SELECT DISTINCT type FROM objets').all().map(function(r){ return r.type; }); }
  };
  var reglages = {
    get: function(cle, fallback){ var r = q('SELECT data FROM reglages WHERE cle = ?').get(cle); return r ? JSON.parse(r.data) : fallback; },
    set: function(cle, value){ q('INSERT INTO reglages (cle, data, updated_at) VALUES (?, ?, ?) ON CONFLICT (cle) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(cle, JSON.stringify(value), now()); return value; }
  };
  /* ---- les metaux : l'or (les formules de l'atelier lisent `or`) et l'argent, le gramme en euros ---- */
  var metaux = {
    list: function(metal){ return q('SELECT id, metal, prix AS price, source, created_at AS createdAt FROM cours_or WHERE metal = ? ORDER BY created_at DESC, rowid DESC').all(metal); },
    add: function(metal, g){ q('INSERT INTO cours_or (id, metal, prix, source, created_at) VALUES (?, ?, ?, ?, ?)').run(g.id, metal, g.price, g.source || '', g.createdAt || now()); return g; },
    remove: function(id){ q('DELETE FROM cours_or WHERE id = ?').run(id); }
  };
  var or = { list: function(){ return metaux.list('or'); }, add: function(g){ return metaux.add('or', g); }, remove: metaux.remove };
  /* ---- les diamants : la derniere lecture de l'indice, et la liste des lectures ---- */
  var diamants = {
    dernier: function(){ var r = q('SELECT MAX(lu_le) AS lu FROM cours_diamants').get(); return r && r.lu ? q('SELECT * FROM cours_diamants WHERE lu_le = ? ORDER BY rang').all(r.lu).map(camel) : []; },
    lectures: function(n){ return q('SELECT lu_le AS luLe, COUNT(*) AS n, source FROM cours_diamants GROUP BY lu_le ORDER BY lu_le DESC LIMIT ?').all(n || 30); },
    add: function(luLe, rows, source){ tx(function(){ rows.forEach(function(x, i){ q('INSERT INTO cours_diamants (id, lu_le, rang, driver, forme, poids, carat_min, carat_max, couleur, purete, part, usd_ct, eur_ct, indice, variation, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(luLe + '-' + i, luLe, x.rang, x.driver, x.forme || '', x.poids || '', x.caratMin, x.caratMax, x.couleur || '', x.purete || '', x.part, x.usdCt, x.eurCt, x.indice, x.variation, x.source || source || 'IDEX'); }); }); return rows.length; }
  };
  var ventes = {
    list: function(){ return q('SELECT jour AS date, total FROM ventes_jour ORDER BY jour').all(); },
    add: function(date, delta){ q('INSERT OR IGNORE INTO ventes_jour (jour, total) VALUES (?, 0)').run(date); q('UPDATE ventes_jour SET total = MAX(total + ?, 0) WHERE jour = ?').run(delta, date); }
  };
  var SVC = { serviceCost: 'service_cost', servicePaid: 'service_paid', servicePaymentType: 'service_payment_type', servicePaymentDate: 'service_payment_date' };
  var services = {
    list: function(){ return q('SELECT id, vendor, service_name AS serviceName, service_cost AS serviceCost, service_paid AS servicePaid, service_payment_type AS servicePaymentType, service_payment_date AS servicePaymentDate, product_name AS productName, product_avatar AS productAvatar, product_ref AS productRef, fake_id AS fakeId, created_at AS createdAt FROM services_fournisseurs ORDER BY created_at, rowid').all().map(function(s){ s.servicePaid = !!s.servicePaid; return s; }); },
    add: function(s){ q('INSERT INTO services_fournisseurs (id, vendor, service_name, service_cost, service_paid, service_payment_type, service_payment_date, product_name, product_avatar, product_ref, fake_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(s.id, s.vendor, s.serviceName || '', +s.serviceCost || 0, s.servicePaid ? 1 : 0, s.servicePaymentType || '', s.servicePaymentDate || '', s.productName || '', s.productAvatar || '', s.productRef || '', s.fakeId || '', s.createdAt || now()); },
    patch: function(id, patch){ var sets = Object.keys(patch).filter(function(k){ return SVC[k]; }); if (!sets.length) return; var st = q('UPDATE services_fournisseurs SET ' + sets.map(function(k){ return SVC[k] + ' = ?'; }).join(', ') + ' WHERE id = ?'); st.run.apply(st, sets.map(function(k){ return k === 'servicePaid' ? (patch[k] ? 1 : 0) : patch[k]; }).concat([id])); },
    has: function(fakeId){ return !!q('SELECT 1 FROM services_fournisseurs WHERE fake_id = ?').get(fakeId); }
  };
  var paiements = {
    list: function(){ return q('SELECT id, vendor, somme AS sum, payment_type AS paymentType, description, reference, created_at AS createdAt FROM paiements_fournisseurs ORDER BY created_at, rowid').all(); },
    add: function(h){ q('INSERT INTO paiements_fournisseurs (id, vendor, somme, payment_type, description, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(h.id, h.vendor, h.sum, h.paymentType, h.description || '', h.reference, h.createdAt || now()); },
    remove: function(id){ q('DELETE FROM paiements_fournisseurs WHERE id = ?').run(id); },
    nextRef: function(){ var r = q('SELECT MAX(CAST(reference AS INTEGER)) AS m FROM paiements_fournisseurs').get(); return String((r && r.m !== null ? r.m : -1) + 1).padStart(6, '0'); }
  };

  /* ---------- le mailing ---------- */
  var contacts = {
    list: function(){ return q('SELECT email, nom AS name, source, note, added_at AS addedAt FROM contacts ORDER BY added_at DESC, email').all(); },
    add: function(c){ return q('INSERT OR IGNORE INTO contacts (email, nom, source, note, added_at) VALUES (?, ?, ?, ?, ?)').run(c.email, c.name || '', c.source || '', c.note || '', c.addedAt || now()).changes > 0; },
    patch: function(email, p){ q('UPDATE contacts SET nom = COALESCE(?, nom), note = COALESCE(?, note) WHERE email = ?').run(p.name === undefined ? null : p.name, p.note === undefined ? null : p.note, email); },
    remove: function(email){ q('DELETE FROM contacts WHERE email = ?').run(email); },
    has: function(email){ return !!q('SELECT 1 FROM contacts WHERE email = ?').get(email); }
  };
  /* the store the mailing engine expects (the same verbs as its JSON store), on SQL */
  var R = 'id, campaign_id AS campaignId, position, email, name, status, message_id AS messageId, thread_id AS threadId, sent_at AS sentAt, error, opens, clicks, opened_at AS openedAt, clicked_at AS clickedAt, unsubscribed_at AS unsubscribedAt, bounce_checked AS bounceChecked, bounce_note AS bounceNote';
  var C = 'id, title, subject, from_email AS fromEmail, from_name AS fromName, html, tracked, created_by AS createdBy, created_at AS createdAt, status, total';
  function recip(r){ if (r){ r.bounceChecked = !!r.bounceChecked; } return r; }
  function camp(c){ if (c){ c.tracked = !!c.tracked; } return c; }
  var P = function(v){ return Promise.resolve(v); };
  var RP = { status: 'status', messageId: 'message_id', threadId: 'thread_id', sentAt: 'sent_at', error: 'error', opens: 'opens', clicks: 'clicks', openedAt: 'opened_at', clickedAt: 'clicked_at', unsubscribedAt: 'unsubscribed_at', bounceChecked: 'bounce_checked', bounceNote: 'bounce_note' };
  function patchRecipient(id, patch){ var ks = Object.keys(patch).filter(function(k){ return RP[k]; }); if (!ks.length) return; var st = q('UPDATE destinataires SET ' + ks.map(function(k){ return RP[k] + ' = ?'; }).join(', ') + ' WHERE id = ?'); st.run.apply(st, ks.map(function(k){ return k === 'bounceChecked' ? (patch[k] ? 1 : 0) : patch[k]; }).concat([id])); }
  function addEvent(rid, kind, url){ q('INSERT INTO evenements (recipient_id, kind, url, at) VALUES (?, ?, ?, ?)').run(rid, kind, url || '', now()); }
  var VALID = /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]{2,}$/;
  var mailStore = {
    consumeToken: function(jti){ return P(q('INSERT OR IGNORE INTO jetons (jti, at) VALUES (?, ?)').run(jti, now()).changes > 0); },
    isSuppressed: function(email){ return P(!!q('SELECT 1 FROM suppressions WHERE email = ?').get(String(email).trim().toLowerCase())); },
    listSuppressions: function(){ return P(q('SELECT email, reason, at, campaign_id AS campaignId FROM suppressions ORDER BY at DESC').all()); },
    addSuppression: function(email, reason, campaignId){ var e = String(email).trim().toLowerCase(); if (e) q('INSERT OR IGNORE INTO suppressions (email, reason, at, campaign_id) VALUES (?, ?, ?, ?)').run(e, reason, now(), campaignId || null); return P(); },
    removeSuppression: function(email){ q('DELETE FROM suppressions WHERE email = ?').run(String(email).trim().toLowerCase()); return P(); },
    createCampaign: function(input, people){
      var seen = {}, clean = [], duplicates = 0, invalid = 0;
      people.forEach(function(p){ var e = String(p.email || '').trim().toLowerCase(); if (!VALID.test(e)){ invalid++; return; } if (seen[e]){ duplicates++; return; } seen[e] = 1; clean.push({ email: e, name: String(p.name || '').trim() }); });
      var sup = {}; q('SELECT email FROM suppressions').all().forEach(function(s){ sup[s.email] = 1; });
      var kept = clean.filter(function(p){ return !sup[p.email]; }), id = require('crypto').randomUUID(), at = now();
      var campaign = Object.assign({}, input, { id: id, createdAt: at, status: 'queued', total: kept.length });
      tx(function(){
        q('INSERT INTO campagnes (id, title, subject, from_email, from_name, html, tracked, created_by, created_at, status, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.title || '', input.subject, input.fromEmail || '', input.fromName || '', input.html, input.tracked ? 1 : 0, input.createdBy || '', at, 'queued', kept.length);
        var ins = q('INSERT INTO destinataires (id, campaign_id, position, email, name, status) VALUES (?, ?, ?, ?, ?, ?)');
        kept.forEach(function(p, i){ ins.run(require('crypto').randomUUID().replace(/-/g, '').slice(0, 20), id, i, p.email, p.name, 'queued'); });
      });
      return P({ campaign: campaign, added: kept.length, suppressed: clean.length - kept.length, duplicates: duplicates, invalid: invalid });
    },
    getCampaign: function(id){ return P(camp(q('SELECT ' + C + ' FROM campagnes WHERE id = ?').get(id)) || null); },
    listCampaigns: function(){ return P(q('SELECT ' + C + ' FROM campagnes ORDER BY created_at DESC').all().map(camp)); },
    setCampaignStatus: function(id, status){ q('UPDATE campagnes SET status = ? WHERE id = ?').run(status, id); return P(); },
    deleteCampaign: function(id){ q('DELETE FROM campagnes WHERE id = ?').run(id); return P(); },
    listRecipients: function(cid){ return P(q('SELECT ' + R + ' FROM destinataires WHERE campaign_id = ? ORDER BY position').all(cid).map(recip)); },
    getRecipient: function(id){ return P(recip(q('SELECT ' + R + ' FROM destinataires WHERE id = ?').get(id)) || null); },
    nextQueued: function(limit){ return P(q('SELECT d.id AS id, d.campaign_id AS campaignId, d.position AS position, d.email AS email, d.name AS name, d.status AS status, d.message_id AS messageId, d.thread_id AS threadId, d.sent_at AS sentAt, d.error AS error, d.opens, d.clicks, d.opened_at AS openedAt, d.clicked_at AS clickedAt, d.unsubscribed_at AS unsubscribedAt, d.bounce_checked AS bounceChecked, d.bounce_note AS bounceNote FROM destinataires d JOIN campagnes c ON c.id = d.campaign_id WHERE d.status = ? AND c.status IN (?, ?) ORDER BY c.created_at, d.position LIMIT ?').all('queued', 'queued', 'sending', limit).map(recip)); },
    sentLast24h: function(fromEmail){ var since = new Date(Date.now() - 86400000).toISOString(); return P(q('SELECT COUNT(*) AS n FROM destinataires d JOIN campagnes c ON c.id = d.campaign_id WHERE c.from_email = ? AND d.sent_at IS NOT NULL AND d.sent_at > ?').get(fromEmail, since).n); },
    markSent: function(id, messageId, threadId){ patchRecipient(id, { status: 'sent', messageId: messageId || '', threadId: threadId || '', sentAt: now(), error: '' }); return P(); },
    markFailed: function(id, error){ patchRecipient(id, { status: 'failed', error: String(error).slice(0, 500) }); return P(); },
    markSkipped: function(id, why){ patchRecipient(id, { status: 'skipped', error: why }); return P(); },
    markBounce: function(id, note){ patchRecipient(id, { status: 'bounced', bounceChecked: true, bounceNote: String(note).slice(0, 500) }); return P(); },
    markBounceChecked: function(id){ patchRecipient(id, { bounceChecked: true }); return P(); },
    recipientsToCheck: function(limit){ var min = new Date(Date.now() - 600000).toISOString(), max = new Date(Date.now() - 7 * 86400000).toISOString(); return P(q('SELECT ' + R + ' FROM destinataires WHERE status IN (?, ?) AND bounce_checked = 0 AND sent_at IS NOT NULL AND sent_at < ? AND sent_at > ? LIMIT ?').all('sent', 'unsubscribed', min, max, limit).map(recip)); },
    recordOpen: function(id){ var r = q('SELECT opens, opened_at FROM destinataires WHERE id = ?').get(id); if (!r) return P(); patchRecipient(id, { opens: r.opens + 1, openedAt: r.opened_at || now() }); addEvent(id, 'open'); return P(); },
    recordClick: function(id, url){ var r = q('SELECT opens, clicks, opened_at, clicked_at FROM destinataires WHERE id = ?').get(id); if (!r) return P(); patchRecipient(id, { clicks: r.clicks + 1, clickedAt: r.clicked_at || now(), opens: r.opens || 1, openedAt: r.opened_at || now() }); addEvent(id, 'click', url); return P(); },
    unsubscribe: function(id){ var r = recip(q('SELECT ' + R + ' FROM destinataires WHERE id = ?').get(id)); if (!r) return P(null); mailStore.addSuppression(r.email, 'unsubscribe', r.campaignId); if (r.status === 'sent') patchRecipient(id, { status: 'unsubscribed', unsubscribedAt: now() }); else if (r.status === 'queued') patchRecipient(id, { status: 'skipped', error: 'desinscrit' }); addEvent(id, 'unsubscribe'); return P(r); },
    listEvents: function(cid){ return P(q('SELECT e.recipient_id AS recipientId, e.kind, e.url, e.at FROM evenements e JOIN destinataires d ON d.id = e.recipient_id WHERE d.campaign_id = ? ORDER BY e.id').all(cid)); },
    getSettings: function(){ return P(reglages.get('mailing_store', {})); },
    setSetting: function(k, v){ var s = reglages.get('mailing_store', {}); s[k] = v; reglages.set('mailing_store', s); return P(); }
  };

  /* ---------- les commandes ---------- */
  var commandes = {
    list: function(limit){ return q('SELECT * FROM commandes ORDER BY at DESC LIMIT ?').all(limit || 500).map(camel); },
    get: function(id){ var c = camel(q('SELECT * FROM commandes WHERE id = ?').get(id)); if (c){ c.gift = !!c.gift; c.live = !!c.live; c.lines = q('SELECT slug, name, quantity, amount FROM commande_lignes WHERE commande_id = ? ORDER BY id').all(id); } return c; },
    /* what Stripe says is written over; what the house typed (preparation, tracking, note) is kept */
    upsert: function(o, lines){
      return tx(function(){
        q('INSERT INTO commandes (id, at, status, paid, total, currency, email, name, phone, address, gift, live, payment_intent, capture, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET status = excluded.status, paid = excluded.paid, total = excluded.total, currency = excluded.currency, email = excluded.email, name = excluded.name, phone = excluded.phone, address = excluded.address, gift = excluded.gift, live = excluded.live, payment_intent = excluded.payment_intent, capture = excluded.capture, data = excluded.data, updated_at = excluded.updated_at')
          .run(o.id, o.at, o.status || '', o.paid || '', +o.total || 0, o.currency || 'eur', o.email || '', o.name || '', o.phone || '', o.address || '', o.gift ? 1 : 0, o.live ? 1 : 0, o.paymentIntent || '', o.capture || '', o.data ? JSON.stringify(o.data) : null, now());
        if (lines){ q('DELETE FROM commande_lignes WHERE commande_id = ?').run(o.id); var ins = q('INSERT INTO commande_lignes (commande_id, slug, name, quantity, amount) VALUES (?, ?, ?, ?, ?)'); lines.forEach(function(l){ ins.run(o.id, l.slug || '', l.name || '', +l.quantity || 1, +l.amount || 0); }); }
        return commandes.get(o.id);
      });
    },
    prepare: function(id, p){ q('UPDATE commandes SET preparation = COALESCE(?, preparation), suivi = COALESCE(?, suivi), note = COALESCE(?, note), updated_at = ? WHERE id = ?').run(p.preparation === undefined ? null : p.preparation, p.suivi === undefined ? null : p.suivi, p.note === undefined ? null : p.note, now(), id); return commandes.get(id); },
    summary: function(){ return q("SELECT COUNT(*) AS n, COALESCE(SUM(paid = 'paid'), 0) AS payees, COALESCE(SUM(paid = 'paid' AND preparation = 'a_preparer'), 0) AS a_preparer, COALESCE(SUM(CASE WHEN paid = 'paid' AND at > ? THEN total ELSE 0 END), 0) AS trente_jours, COALESCE(SUM(CASE WHEN paid = 'paid' THEN total ELSE 0 END), 0) AS total FROM commandes").get(new Date(Date.now() - 30 * 86400000).toISOString()); },
    byDay: function(days){ return q("SELECT substr(at, 1, 10) AS jour, COUNT(*) AS n, SUM(total) AS total FROM commandes WHERE paid = 'paid' AND at > ? GROUP BY jour ORDER BY jour").all(new Date(Date.now() - days * 86400000).toISOString()); }
  };
  var clients = {
    list: function(){ return q('SELECT * FROM clients ORDER BY derniere DESC NULLS LAST, inscrit_le DESC').all(); },
    get: function(email){ var c = q('SELECT * FROM clients WHERE email = ?').get(email); if (!c) return null; c.commandesList = q('SELECT id, at, paid, total, preparation FROM commandes WHERE email = ? ORDER BY at DESC').all(email); c.envois = q('SELECT c.subject, d.status, d.sent_at AS sentAt, d.opens, d.clicks FROM destinataires d JOIN campagnes c ON c.id = d.campaign_id WHERE d.email = ? ORDER BY c.created_at DESC').all(email); var k = q('SELECT note FROM contacts WHERE email = ?').get(email); c.note = k ? k.note : ''; return c; }
  };

  /* ---------- le stock ---------- */
  var stock = {
    list: function(){ return q('SELECT * FROM stock_etat ORDER BY updated_at DESC').all().map(camel); },
    get: function(slug){ var s = camel(q('SELECT * FROM stock_etat WHERE slug = ?').get(slug)); if (s) s.mouvements = q('SELECT id, qty, reason, ref, note, by_user AS byUser, at FROM mouvements WHERE slug = ? ORDER BY id DESC').all(slug); return s; },
    set: function(slug, p){ q('INSERT INTO stock (slug, kind, min_stock, emplacement, note, delai_jours, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (slug) DO UPDATE SET kind = excluded.kind, min_stock = excluded.min_stock, emplacement = excluded.emplacement, note = excluded.note, delai_jours = excluded.delai_jours, updated_at = excluded.updated_at').run(slug, p.kind || 'stock', +p.minStock || 0, p.emplacement || '', p.note || '', Math.max(0, Math.trunc(+p.delaiJours || 0)), now()); return stock.get(slug); },
    /* the only way a quantity changes: a signed movement, refused by the base when it breaks a rule */
    move: function(slug, qty, reason, extra){ extra = extra || {}; var n = Math.trunc(Number(qty)); if (!n) throw new Error('il faut une quantité'); var signed = reason === 'sortie' || reason === 'vente' ? -Math.abs(n) : (reason === 'ajustement' ? n : Math.abs(n)); q('INSERT INTO mouvements (slug, qty, reason, ref, note, by_user, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(slug, signed, reason, extra.ref || '', extra.note || '', extra.by || '', now()); return stock.get(slug); },
    remove: function(slug){ q('DELETE FROM stock WHERE slug = ?').run(slug); },
    summary: function(){ return q('SELECT COUNT(*) AS items, COALESCE(SUM(on_hand), 0) AS units, COALESCE(SUM(on_hand = 0 AND kind <> \'made_to_order\'), 0) AS ruptures, COALESCE(SUM(on_hand > 0 AND on_hand <= min_stock), 0) AS bas FROM stock_etat').get(); }
  };

  /* ---------- la sauvegarde : un fichier par jour, les trente derniers ---------- */
  function sauvegarde(){
    if (file === ':memory:') return null;
    var dir = path.join(dataDir, 'sauvegardes_base'); fs.mkdirSync(dir, { recursive: true });
    var out = path.join(dir, new Date().toISOString().slice(0, 10) + '.sqlite');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    db.exec("VACUUM INTO '" + out.replace(/'/g, "''") + "'");
    fs.readdirSync(dir).filter(function(f){ return /^\d{4}-\d{2}-\d{2}\.sqlite$/.test(f); }).sort().slice(0, -30).forEach(function(f){ fs.unlinkSync(path.join(dir, f)); });
    return out;
  }

  /* ---------- l'import des fichiers JSON d'avant, une fois ---------- */
  function importJSON(TYPES){
    var done = [], A = path.join(dataDir, 'atelier'), M = path.join(dataDir, 'mailing');
    var take = function(p, fn){ if (!fs.existsSync(p)) return; var v = readJSON(p, null); if (v !== null){ fn(v); } fs.renameSync(p, p + '.importe'); done.push(path.basename(p)); };
    tx(function(){
      Object.keys(TYPES || {}).forEach(function(k){ var f = TYPES[k].file;
        take(path.join(A, f + '.json'), function(l){ (Array.isArray(l) ? l : []).forEach(function(r){ objets.put(k, r); }); });
        take(path.join(A, f + '.corbeille.json'), function(l){ (Array.isArray(l) ? l : []).forEach(function(r){ var d = r.deletedAt || now(); objets.put(k, r); q('UPDATE objets SET deleted_at = ? WHERE type = ? AND id = ?').run(d, k, String(r.id)); }); }); });
      take(path.join(A, 'or.json'), function(l){ (Array.isArray(l) ? l : []).forEach(function(g){ if (g && g.id && g.price > 0) q('INSERT OR IGNORE INTO cours_or (id, prix, source, created_at) VALUES (?, ?, ?, ?)').run(String(g.id), +g.price, g.source || '', g.createdAt || now()); }); });
      take(path.join(A, 'ventes.json'), function(l){ (Array.isArray(l) ? l : []).forEach(function(v){ if (v && v.date) ventes.add(v.date, +v.total || 0); }); });
      take(path.join(A, 'fournisseurs-services.json'), function(l){ (Array.isArray(l) ? l : []).forEach(function(s){ if (s && s.id && !q('SELECT 1 FROM services_fournisseurs WHERE id = ?').get(s.id)) services.add(s); }); });
      take(path.join(A, 'fournisseurs-paiements.json'), function(l){ (Array.isArray(l) ? l : []).forEach(function(h){ if (h && h.id && !q('SELECT 1 FROM paiements_fournisseurs WHERE id = ?').get(h.id)) paiements.add(h); }); });
      take(path.join(A, 'droits.json'), function(v){ reglages.set('droits', v); });
      take(path.join(A, 'maison.json'), function(v){ reglages.set('maison', v); });
      take(path.join(M, 'contacts.json'), function(l){ (Array.isArray(l) ? l : []).forEach(function(c){ if (c && c.email) contacts.add(c); }); });
      take(path.join(M, 'settings.json'), function(v){ reglages.set('mailing', v); });
      take(path.join(M, 'draft.json'), function(v){ reglages.set('mailing_draft', v); });
      take(path.join(M, 'store.json'), function(d){
        (d.suppressions || []).forEach(function(s){ q('INSERT OR IGNORE INTO suppressions (email, reason, at, campaign_id) VALUES (?, ?, ?, ?)').run(s.email, s.reason || 'manual', s.at || now(), s.campaignId || null); });
        (d.campaigns || []).forEach(function(c){ q('INSERT OR IGNORE INTO campagnes (id, title, subject, from_email, from_name, html, tracked, created_by, created_at, status, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(c.id, c.title || '', c.subject || '', c.fromEmail || '', c.fromName || '', c.html || '', c.tracked ? 1 : 0, c.createdBy || '', c.createdAt || now(), c.status || 'done', +c.total || 0); });
        (d.recipients || []).forEach(function(r){ q('INSERT OR IGNORE INTO destinataires (id, campaign_id, position, email, name, status, message_id, thread_id, sent_at, error, opens, clicks, opened_at, clicked_at, unsubscribed_at, bounce_checked, bounce_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(r.id, r.campaignId, +r.position || 0, r.email, r.name || '', r.status || 'sent', r.messageId || '', r.threadId || '', r.sentAt || null, r.error || '', +r.opens || 0, +r.clicks || 0, r.openedAt || null, r.clickedAt || null, r.unsubscribedAt || null, r.bounceChecked ? 1 : 0, r.bounceNote || ''); });
        (d.events || []).forEach(function(e){ if (q('SELECT 1 FROM destinataires WHERE id = ?').get(e.recipientId)) q('INSERT INTO evenements (recipient_id, kind, url, at) VALUES (?, ?, ?, ?)').run(e.recipientId, e.kind, e.url || '', e.at || now()); });
        (d.usedTokens || []).forEach(function(j){ q('INSERT OR IGNORE INTO jetons (jti, at) VALUES (?, ?)').run(j, now()); });
        if (d.settings) reglages.set('mailing_store', d.settings);
      });
    });
    return done;
  }

  return { file: file, db: db, q: q, tx: tx, objets: objets, reglages: reglages, or: or, metaux: metaux, diamants: diamants, ventes: ventes, services: services, paiements: paiements, contacts: contacts, mailStore: mailStore, commandes: commandes, clients: clients, stock: stock, sauvegarde: sauvegarde, importJSON: importJSON, close: function(){ db.close(); } };
};

/* le controle : node base.js */
if (require.main === module){
  var assert = require('assert'), B = module.exports(':memory:');
  var e0 = B.commandes.summary(), s0 = B.stock.summary(); assert.strictEqual(e0.payees, 0); assert.strictEqual(e0.a_preparer, 0); assert.strictEqual(s0.ruptures, 0); assert.strictEqual(s0.bas, 0);
  B.objets.put('devis', { id: 'a', reference: 'DEV-2026-0001', createdAt: '2026-01-01T00:00:00.000Z', customerName: 'x' });
  B.objets.put('devis', { id: 'a', reference: 'DEV-2026-0001', createdAt: '2026-01-01T00:00:00.000Z', customerName: 'y' });
  assert.strictEqual(B.objets.list('devis').length, 1); assert.strictEqual(B.objets.get('devis', 'a').customerName, 'y');
  assert.throws(function(){ B.objets.put('devis', { id: 'b', reference: 'DEV-2026-0001' }); }, /UNIQUE/, 'two quotes cannot carry one number');
  B.objets.trash('devis', 'a'); assert.strictEqual(B.objets.list('devis').length, 0); assert.strictEqual(B.objets.trashed('devis').length, 1); B.objets.restore('devis', 'a'); assert.strictEqual(B.objets.list('devis').length, 1);
  B.stock.set('bague-a', { kind: 'unique' }); B.stock.move('bague-a', 1, 'entree');
  assert.throws(function(){ B.stock.move('bague-a', 1, 'entree'); }, /unique/); assert.throws(function(){ B.stock.move('bague-a', 2, 'vente'); }, /zéro/);
  B.stock.move('bague-a', 1, 'vente', { ref: 'cs_1' }); assert.strictEqual(B.stock.get('bague-a').onHand, 0);
  assert.throws(function(){ B.db.exec('DELETE FROM mouvements'); }, /efface/); assert.throws(function(){ B.db.exec('UPDATE mouvements SET qty = 9'); }, /modifie/);
  B.stock.set('bague-b', { kind: 'stock', minStock: 2 }); B.stock.move('bague-b', 3, 'entree'); B.stock.move('bague-b', 2, 'sortie');
  var sm = B.stock.summary(); assert.strictEqual(sm.items, 2); assert.strictEqual(sm.ruptures, 1); assert.strictEqual(sm.bas, 1);
  B.commandes.upsert({ id: 'cs_1', at: '2026-10-01T10:00:00.000Z', paid: 'paid', total: 1200, email: 'a@b.fr', name: 'A' }, [{ slug: 'bague-a', name: 'Bague A', quantity: 1, amount: 1200 }]);
  B.commandes.prepare('cs_1', { preparation: 'expediee', suivi: 'LA123' }); B.commandes.upsert({ id: 'cs_1', at: '2026-10-01T10:00:00.000Z', paid: 'paid', total: 1200, email: 'a@b.fr', name: 'A' });
  var c1 = B.commandes.get('cs_1'); assert.strictEqual(c1.preparation, 'expediee'); assert.strictEqual(c1.suivi, 'LA123'); assert.strictEqual(c1.lines.length, 1);
  assert.throws(function(){ B.commandes.prepare('cs_1', { preparation: 'perdue' }); }, /CHECK/);
  B.contacts.add({ email: 'a@b.fr', name: 'Anna' }); B.contacts.add({ email: 'c@d.fr' }); assert.strictEqual(B.contacts.add({ email: 'c@d.fr' }), false);
  var cl = B.clients.list(); assert.strictEqual(cl.length, 2); assert.strictEqual(B.clients.get('a@b.fr').commandes, 1); assert.strictEqual(B.clients.get('a@b.fr').depense, 1200); assert.strictEqual(B.clients.get('c@d.fr').abonne, 1);
  B.mailStore.createCampaign({ subject: 'S', html: '<p>x</p>', fromEmail: 'f@g.fr' }, [{ email: 'a@b.fr', name: 'Anna' }, { email: 'a@b.fr' }, { email: 'bad' }]).then(function(out){
    assert.strictEqual(out.added, 1); assert.strictEqual(out.duplicates, 1); assert.strictEqual(out.invalid, 1);
    return B.mailStore.nextQueued(10).then(function(l){ assert.strictEqual(l.length, 1); assert.strictEqual(l[0].email, 'a@b.fr'); return B.mailStore.markSent(l[0].id, 'm1', '').then(function(){ return B.mailStore.sentLast24h('f@g.fr'); }).then(function(n){ assert.strictEqual(n, 1); return B.mailStore.unsubscribe(l[0].id); }); });
  }).then(function(r){ assert.strictEqual(r.email, 'a@b.fr'); return B.mailStore.isSuppressed('a@b.fr'); }).then(function(s){ assert.strictEqual(s, true); return B.mailStore.consumeToken('t1'); }).then(function(f){ assert.strictEqual(f, true); return B.mailStore.consumeToken('t1'); }).then(function(f){ assert.strictEqual(f, false);
    B.or.add({ id: 'g1', price: 120, createdAt: '2026-01-01T00:00:00.000Z' }); B.or.add({ id: 'g2', price: 121.5, createdAt: '2026-02-01T00:00:00.000Z' }); assert.strictEqual(B.or.list()[0].price, 121.5);
    B.metaux.add('argent', { id: 'a1', price: 1.75, createdAt: '2026-02-01T00:00:00.000Z' }); assert.strictEqual(B.metaux.list('argent')[0].price, 1.75); assert.strictEqual(B.or.list().length, 2);
    B.diamants.add('2026-10-10T12:00:00.000Z', [{ rang: 1, driver: 'Round, 4/4 (1.00-1.49), D-K, IF-I1', forme: 'Round', caratMin: 1, caratMax: 1.49, couleur: 'D-K', purete: 'IF-I1', part: 12.06, usdCt: 3035.99, eurCt: 2709.26, indice: 61.54, variation: 0.03 }], 'IDEX'); assert.strictEqual(B.diamants.dernier()[0].eurCt, 2709.26); assert.strictEqual(B.diamants.lectures()[0].n, 1);
    B.ventes.add('2026-10-01', 100); B.ventes.add('2026-10-01', -300); assert.strictEqual(B.ventes.list()[0].total, 0);
    B.reglages.set('maison', { fullName: 'Alaya' }); assert.strictEqual(B.reglages.get('maison').fullName, 'Alaya');
    console.log('base ok');
  })['catch'](function(e){ console.error(e); process.exit(1); });
}
