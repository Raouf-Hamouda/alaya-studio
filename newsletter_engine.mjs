/*
 * newsletter_engine.mjs
 *
 * Le moteur d'envoi de newsletter construit pour le CRM Eddy (7 septembre 2026),
 * sorti de Next.js et ramene a UN fichier, sans framework, a brancher dans
 * n'importe quelle plateforme Node (Express, Fastify, Next, Nuxt, http nu, un cron).
 *
 * Ce qu'il contient, dans l'ordre du fichier :
 *   1. MIME       : assemblage du mail a la main (multipart/alternative, base64 coupe
 *                   a 76 colonnes, en-tetes encodes, List-Unsubscribe un clic RFC 8058).
 *   2. Transport  : deux tuyaux vers Google. relay = SMTP avec un mot de passe
 *                   d'application (smtp.gmail.com pour un Gmail, smtp-relay.gmail.com
 *                   pour un Workspace). gmail = API Gmail par delegation de domaine
 *                   (compte de service). Meme code, un seul reglage.
 *   3. Suivi      : personnalisation par destinataire. Chaque lien est reecrit vers
 *                   une redirection signee (clics), un pixel signe est pose avant
 *                   </body> (ouvertures), %unsubscribe_url% devient une page signee
 *                   (desinscription). Signatures HMAC : un lien devine ne compte rien.
 *   4. Store      : fichier JSON (campagnes, destinataires, suppressions, evenements).
 *                   Remplacable par n'importe quel objet qui expose les memes methodes.
 *   5. File       : drainQueue, un destinataire a la fois, pause entre deux envois,
 *                   plafond par boite sur 24 h glissantes, reprise sur limite de debit.
 *   6. Rejets     : releve des mailer-daemon dans la boite expeditrice (API Gmail en
 *                   lecture) et mise en suppression des adresses rejetees.
 *   7. Routes     : trois handlers HTTP nus (pixel, clic, desinscription) et un
 *                   middleware (req, res) => bool qui les sert sur /t/o, /t/c, /u.
 *
 * Dependances : nodemailer (obligatoire). googleapis + google-auth-library seulement
 * si TRANSPORT=gmail ou pour le releve des rejets ; charges a la demande.
 *
 * Usage minimal :
 *
 *   import { createEngine } from './newsletter_engine.mjs'
 *   const engine = createEngine({
 *     appUrl: 'https://mon-domaine.tld',          // public, sans slash final
 *     secret: process.env.SESSION_SECRET,         // openssl rand -base64 32
 *     senders: [{ email: 'news@domaine.tld', name: 'Ma boite' }],
 *     transport: { kind: 'relay', relay: { user: 'news@domaine.tld', pass: 'xxxx xxxx xxxx xxxx', host: 'smtp.gmail.com', port: 587 } },
 *     storeFile: './data/newsletter.json',
 *   })
 *   await engine.verifyTransport()                                       // ne rien envoyer, juste s'authentifier
 *   const { campaign } = await engine.createCampaign({ title, subject, from, html, recipients })
 *   await engine.drainQueue(50_000)                                      // a rappeler par un cron chaque minute
 *   const stats = await engine.stats(campaign.id)                        // ouverts, cliques, rejets, desinscrits
 *   app.use(engine.middleware())                                         // Express : sert /t/o, /t/c, /u
 *
 * Tout ce qui est marque « verbatim » est le code du moteur Next tel qu'il a envoye
 * et suivi le mail de test du 7 septembre. Ne pas le retoucher sans raison.
 */

import { createHmac, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// =============================================================================
// 1. MIME (verbatim src/lib/gmail.ts)
// =============================================================================

/** RFC 2045 : le base64 doit etre coupe, une ligne de 998+ caracteres casse le mail. */
export function b64Lines(value) {
  return (Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

/**
 * Un en-tete ne peut pas contenir de saut de ligne : c'est ainsi qu'on en
 * injecte un autre. Les valeurs viennent de listes editables a la main.
 */
export function unLigne(value) {
  return String(value).replace(/[\r\n\u2028\u2029]+/g, ' ').trim()
}

export const ADRESSE_VALIDE = /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]{2,}$/

/** Refuse tout ce qui n'est pas exactement une adresse. */
export function adresse(value, role) {
  const propre = unLigne(value ?? '').toLowerCase()
  if (!ADRESSE_VALIDE.test(propre)) {
    throw new Error(`Adresse ${role} invalide : ${JSON.stringify(String(value ?? '').slice(0, 60))}`)
  }
  return propre
}

export function encodeHeader(value) {
  const propre = unLigne(value)
  if (/^[\x20-\x7e]*$/.test(propre)) return propre
  return `=?UTF-8?B?${Buffer.from(propre, 'utf8').toString('base64')}?=`
}

/**
 * Multipart/alternative, texte puis HTML, tout en base64 coupe. En plus, les
 * en-tetes List-Unsubscribe que Gmail et Outlook transforment en bouton
 * « Se desabonner » (RFC 8058, un clic).
 *
 * opts : { from, fromName, to, toName?, subject, html, text, unsubscribeUrl? }
 */
export function buildMime(opts) {
  const boundary = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  const de = adresse(opts.from, 'expediteur')
  const vers = adresse(opts.to, 'destinataire')
  const entetes = [
    `From: ${encodeHeader(opts.fromName ?? de)} <${de}>`,
    opts.toName ? `To: ${encodeHeader(opts.toName)} <${vers}>` : `To: <${vers}>`,
    `Subject: ${encodeHeader(opts.subject ?? '')}`,
    'MIME-Version: 1.0',
  ]
  if (opts.unsubscribeUrl) {
    const u = unLigne(opts.unsubscribeUrl)
    entetes.push(`List-Unsubscribe: <${u}>`)
    entetes.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click')
  }
  entetes.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)

  return [
    ...entetes,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64Lines(opts.text ?? ''),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64Lines(opts.html ?? ''),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

// =============================================================================
// 2. TRANSPORT (src/lib/transport.ts + src/lib/google.ts)
// =============================================================================

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
]

/** Le JSON du compte de service, en clair ou en base64. */
export function parseServiceAccount(raw) {
  if (!raw) throw new Error('compte de service manquant (GOOGLE_SERVICE_ACCOUNT_JSON)')
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) }
}

/**
 * Fabrique un transport. config :
 *   { kind: 'relay', relay: { user, pass, host = 'smtp-relay.gmail.com', port = 587 } }
 *   { kind: 'gmail', serviceAccount: <json ou chaine> }
 *   { kind: 'custom', deliver: async (from, to, mime) => ({ messageId, threadId }) }   (tests, autre fournisseur)
 *
 * Renvoie { kind, deliver(from, to, mime), verify(), close(), clientFor(email) }.
 */
export function createTransport(config) {
  const kind = (config?.kind ?? 'relay').toLowerCase()

  if (kind === 'custom') {
    return { kind, deliver: config.deliver, verify: async () => {}, close: () => {}, clientFor: null }
  }

  if (kind === 'relay') {
    const r = config.relay ?? {}
    const host = r.host || 'smtp-relay.gmail.com'
    const port = Number(r.port || 587)
    let relay = null
    const transport = async () => {
      if (!r.user || !r.pass) throw new Error("Boite d'envoi non configuree : renseigne l'adresse et son mot de passe d'application.")
      if (!relay) {
        const nodemailer = (await import('nodemailer')).default
        // Google donne le mot de passe d'application en quatre groupes de quatre : on enleve les espaces.
        const pass = String(r.pass).replace(/\s+/g, '')
        relay = nodemailer.createTransport({ host, port, secure: false, requireTLS: true, auth: { user: r.user, pass }, pool: true, maxConnections: 2 })
      }
      return relay
    }
    return {
      kind,
      user: r.user, host, port,
      /** Le mail ne passe pas par la boite, il n'est pas dans ses Envoyes. */
      async deliver(from, to, mime) {
        const info = await (await transport()).sendMail({ envelope: { from, to: [to] }, raw: mime })
        return { messageId: String(info.messageId ?? info.response ?? ''), threadId: '' }
      },
      /** Ouvre la connexion et s'authentifie, sans envoyer un seul message. */
      async verify() { await (await transport()).verify() },
      close() { if (relay) relay.close(); relay = null },
      clientFor: null,
    }
  }

  if (kind === 'gmail') {
    const sa = parseServiceAccount(config.serviceAccount)
    /** Client agissant *en tant que* cette boite : le mail part de la boite et atterrit dans ses Envoyes. */
    const clientFor = async (email) => {
      const { JWT } = await import('google-auth-library')
      return new JWT({ email: sa.client_email, key: sa.private_key, scopes: SCOPES, subject: email })
    }
    return {
      kind,
      clientFor,
      async deliver(from, to, mime) {
        const { google } = await import('googleapis')
        const gmail = google.gmail({ version: 'v1', auth: await clientFor(from) })
        const raw = Buffer.from(mime, 'utf8').toString('base64')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
        return { threadId: res.data.threadId ?? '', messageId: res.data.id ?? '' }
      },
      async verify(email) {
        const auth = await clientFor(email)
        await auth.authorize()
      },
      close() {},
    }
  }

  throw new Error(`transport inconnu : ${kind}`)
}

/** Assemble puis remet le message par le transport donne. */
export async function sendMail(transport, opts) {
  const mime = buildMime(opts)
  return transport.deliver(adresse(opts.from, 'expediteur'), adresse(opts.to, 'destinataire'), mime)
}

// =============================================================================
// 3. SUIVI : personnalisation par destinataire (verbatim src/lib/render.ts)
// =============================================================================

const NE_PAS_SUIVRE = /^(mailto:|tel:|sms:|#|javascript:|data:)/i

export function extraireLiens(html) {
  const liens = []
  for (const m of html.matchAll(/href\s*=\s*"([^"]+)"/gi)) {
    const url = m[1]
    if (NE_PAS_SUIVRE.test(url)) continue
    if (/%unsubscribe_url%|\{\{\s*unsubscribe\s*\}\}/.test(url)) continue
    if (!liens.includes(url)) liens.push(url)
  }
  return liens
}

export function signer(secret, ...parts) {
  return createHmac('sha256', secret).update(parts.join('|')).digest('base64url').slice(0, 16)
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

/**
 * Personnalisation d'un mail pour UN destinataire, sur le HTML compile :
 *  - chaque lien http(s) est reecrit vers /t/c/<rid>/<n>/<sig> pour compter les clics ;
 *  - un pixel /t/o/<rid>/<sig> est pose avant </body> pour compter les ouvertures ;
 *  - %unsubscribe_url% (la variable Mailgun) et {{unsubscribe}} deviennent /u/<rid>/<sig> ;
 *  - {{prenom}} et {{nom}} sont remplis si le destinataire a un nom.
 * p : { rid, email, name? }
 */
export function personnaliser(html, p, appUrl, secret) {
  const liens = extraireLiens(html)
  const sig = (s) => signer(secret, p.rid, s)
  const unsubscribeUrl = `${appUrl}/u/${p.rid}/${sig('u')}`
  const prenom = (p.name ?? '').trim().split(/\s+/)[0] ?? ''

  let out = html
    .replace(/%unsubscribe_url%/g, unsubscribeUrl)
    .replace(/\{\{\s*unsubscribe\s*\}\}/g, unsubscribeUrl)
    .replace(/\{\{\s*prenom\s*\}\}/g, escapeHtml(prenom))
    .replace(/\{\{\s*nom\s*\}\}/g, escapeHtml((p.name ?? '').trim()))

  out = out.replace(/href\s*=\s*"([^"]+)"/gi, (tout, url) => {
    const n = liens.indexOf(url)
    if (n < 0) return tout
    return `href="${appUrl}/t/c/${p.rid}/${n}/${sig(`c${n}`)}"`
  })

  const pixel = `<img src="${appUrl}/t/o/${p.rid}/${sig('o')}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${pixel}</body>`) : out + pixel

  return { html: out, text: versTexte(out), unsubscribeUrl, liens }
}

/** Version texte du corps HTML, pour la partie text/plain. */
export function versTexte(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br[^>]*>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, u, t) => {
      const txt = t.replace(/<[^>]+>/g, '').trim()
      return txt ? `${txt} (${u})` : u
    })
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

// =============================================================================
// 4. STORE fichier JSON (semantique verbatim src/lib/store.ts, branche fichier)
// =============================================================================

const EMPTY = () => ({ usedTokens: [], settings: {}, campaigns: [], recipients: [], suppressions: [], events: [] })

/**
 * Un store = un objet avec ces methodes. Celui-ci ecrit un fichier JSON et
 * serialise les read-modify-write (sans ca deux envois concurrents se perdent).
 * Pour Postgres, Mongo, Prisma ou autre : reecrire ces memes methodes.
 */
export function createJsonStore(file) {
  const FILE = file
  let lock = Promise.resolve()

  async function read() {
    try { return { ...EMPTY(), ...JSON.parse(await fs.readFile(FILE, 'utf8')) } } catch { return EMPTY() }
  }
  function withDoc(fn) {
    const next = lock.then(async () => {
      const doc = await read()
      const result = await fn(doc)
      await fs.mkdir(path.dirname(FILE), { recursive: true })
      await fs.writeFile(FILE, JSON.stringify(doc, null, 2))
      return result
    })
    lock = next.catch(() => {})
    return next
  }
  const patchRecipient = (id, patch) => withDoc((doc) => { const r = doc.recipients.find((x) => x.id === id); if (r) Object.assign(r, patch) })
  const addEvent = (recipientId, kind, url = '') => withDoc((doc) => { doc.events.push({ recipientId, kind, url, at: new Date().toISOString() }) })

  const store = {
    file: FILE,

    /** Marque un jeton comme consomme. false s'il l'etait deja. */
    consumeToken: (jti) => withDoc((doc) => { if (doc.usedTokens.includes(jti)) return false; doc.usedTokens.push(jti); return true }),

    // --- suppressions : desinscrits, rejetes, retires a la main -------------
    isSuppressed: async (email) => { const e = email.trim().toLowerCase(); return (await read()).suppressions.some((s) => s.email === e) },
    listSuppressions: async () => [...(await read()).suppressions].sort((a, b) => b.at.localeCompare(a.at)),
    addSuppression: async (email, reason, campaignId = null) => {
      const e = email.trim().toLowerCase()
      if (!e) return
      await withDoc((doc) => { if (!doc.suppressions.some((s) => s.email === e)) doc.suppressions.push({ email: e, reason, at: new Date().toISOString(), campaignId }) })
    },
    removeSuppression: async (email) => { const e = email.trim().toLowerCase(); await withDoc((doc) => { doc.suppressions = doc.suppressions.filter((s) => s.email !== e) }) },

    // --- campagnes ------------------------------------------------------------
    /**
     * Cree une campagne et sa file. Les adresses supprimees et les doublons sont
     * ecartes ici, une fois pour toutes : ce qui entre dans la file part.
     */
    createCampaign: async (input, people) => {
      const vus = new Set()
      const propres = []
      let duplicates = 0, invalid = 0
      for (const p of people) {
        const e = (p.email ?? '').trim().toLowerCase()
        if (!ADRESSE_VALIDE.test(e)) { invalid++; continue }
        if (vus.has(e)) { duplicates++; continue }
        vus.add(e)
        propres.push({ email: e, name: (p.name ?? '').trim() })
      }
      const supp = new Set((await store.listSuppressions()).map((s) => s.email))
      const retenus = propres.filter((p) => !supp.has(p.email))
      const suppressed = propres.length - retenus.length
      const campaign = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), status: 'queued', total: retenus.length }
      const recs = retenus.map((p, i) => ({
        id: randomUUID().replace(/-/g, '').slice(0, 20), campaignId: campaign.id, position: i,
        email: p.email, name: p.name, status: 'queued', messageId: '', threadId: '', sentAt: null, error: '',
        opens: 0, clicks: 0, openedAt: null, clickedAt: null, unsubscribedAt: null, bounceChecked: false, bounceNote: '',
      }))
      await withDoc((doc) => { doc.campaigns.push(campaign); doc.recipients.push(...recs) })
      return { campaign, added: recs.length, suppressed, duplicates, invalid }
    },
    getCampaign: async (id) => (await read()).campaigns.find((c) => c.id === id) ?? null,
    listCampaigns: async () => [...(await read()).campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    setCampaignStatus: (id, status) => withDoc((doc) => { const c = doc.campaigns.find((x) => x.id === id); if (c) c.status = status }),
    deleteCampaign: (id) => withDoc((doc) => {
      const ids = new Set(doc.recipients.filter((r) => r.campaignId === id).map((r) => r.id))
      doc.campaigns = doc.campaigns.filter((c) => c.id !== id)
      doc.recipients = doc.recipients.filter((r) => r.campaignId !== id)
      doc.events = doc.events.filter((e) => !ids.has(e.recipientId))
    }),

    // --- destinataires ----------------------------------------------------------
    listRecipients: async (campaignId) => (await read()).recipients.filter((r) => r.campaignId === campaignId).sort((a, b) => a.position - b.position),
    getRecipient: async (id) => (await read()).recipients.find((r) => r.id === id) ?? null,
    /** Les prochains destinataires a servir, toutes campagnes actives confondues, dans l'ordre. */
    nextQueued: async (limit) => {
      const doc = await read()
      const actives = new Map(doc.campaigns.filter((c) => ['queued', 'sending'].includes(c.status)).map((c) => [c.id, c]))
      return doc.recipients
        .filter((r) => r.status === 'queued' && actives.has(r.campaignId))
        .sort((a, b) => actives.get(a.campaignId).createdAt.localeCompare(actives.get(b.campaignId).createdAt) || a.position - b.position)
        .slice(0, limit)
    },
    /** Envois partis de cette boite dans les 24 dernieres heures. */
    sentLast24h: async (fromEmail) => {
      const depuis = new Date(Date.now() - 24 * 3600_000).toISOString()
      const doc = await read()
      const ids = new Set(doc.campaigns.filter((c) => c.fromEmail === fromEmail).map((c) => c.id))
      return doc.recipients.filter((r) => ids.has(r.campaignId) && r.sentAt && r.sentAt > depuis).length
    },
    markSent: (id, messageId, threadId) => patchRecipient(id, { status: 'sent', messageId, threadId, sentAt: new Date().toISOString(), error: '' }),
    markFailed: (id, error) => patchRecipient(id, { status: 'failed', error: String(error).slice(0, 500) }),
    markSkipped: (id, why) => patchRecipient(id, { status: 'skipped', error: why }),
    markBounce: (id, note) => patchRecipient(id, { status: 'bounced', bounceChecked: true, bounceNote: String(note).slice(0, 500) }),
    markBounceChecked: (id) => patchRecipient(id, { bounceChecked: true }),
    /** Destinataires envoyes a verifier pour un rejet : au moins 10 min et au plus 7 jours apres l'envoi. */
    recipientsToCheck: async (limit) => {
      const min = new Date(Date.now() - 10 * 60_000).toISOString()
      const max = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
      return (await read()).recipients
        .filter((r) => ['sent', 'unsubscribed'].includes(r.status) && !r.bounceChecked && r.sentAt && r.sentAt < min && r.sentAt > max)
        .slice(0, limit)
    },

    // --- evenements : ouvertures, clics, desinscriptions -------------------------
    recordOpen: async (id) => {
      const r = await store.getRecipient(id)
      if (!r) return
      await patchRecipient(id, { opens: r.opens + 1, openedAt: r.openedAt ?? new Date().toISOString() })
      await addEvent(id, 'open')
    },
    recordClick: async (id, url) => {
      const r = await store.getRecipient(id)
      if (!r) return
      await patchRecipient(id, {
        clicks: r.clicks + 1, clickedAt: r.clickedAt ?? new Date().toISOString(),
        // Un clic prouve une ouverture, meme quand le pixel a ete bloque.
        opens: r.opens || 1, openedAt: r.openedAt ?? new Date().toISOString(),
      })
      await addEvent(id, 'click', url)
    },
    unsubscribe: async (id) => {
      const r = await store.getRecipient(id)
      if (!r) return null
      await store.addSuppression(r.email, 'unsubscribe', r.campaignId)
      if (r.status === 'sent') await patchRecipient(id, { status: 'unsubscribed', unsubscribedAt: new Date().toISOString() })
      else if (r.status === 'queued') await patchRecipient(id, { status: 'skipped', error: 'desinscrit' })
      await addEvent(id, 'unsubscribe')
      return r
    },
    listEvents: async (campaignId) => {
      const doc = await read()
      const ids = new Set(doc.recipients.filter((r) => r.campaignId === campaignId).map((r) => r.id))
      return doc.events.filter((e) => ids.has(e.recipientId))
    },

    // --- reglages libres --------------------------------------------------------
    getSettings: async () => (await read()).settings ?? {},
    setSetting: (key, value) => withDoc((doc) => { doc.settings = { ...(doc.settings ?? {}), [key]: value } }),
  }
  return store
}

/** Compteurs d'une campagne. */
export async function campaignStats(store, id) {
  const recs = await store.listRecipients(id)
  const n = (s) => recs.filter((r) => r.status === s).length
  return {
    total: recs.length,
    queued: n('queued'), sent: n('sent') + n('unsubscribed'), bounced: n('bounced'), failed: n('failed'),
    skipped: n('skipped'), unsubscribed: n('unsubscribed'),
    opened: recs.filter((r) => r.opens > 0).length,
    clicked: recs.filter((r) => r.clicks > 0).length,
  }
}

/**
 * Le detail par lien : combien de clics au total, et combien de personnes
 * differentes. Deux chiffres, parce qu'une meme personne qui clique trois fois
 * n'est pas trois personnes.
 */
export async function linkStats(store, campaignId) {
  const par = new Map()
  for (const e of await store.listEvents(campaignId)) {
    if (e.kind !== 'click' || !e.url) continue
    const c = par.get(e.url) ?? { clicks: 0, gens: new Set() }
    c.clicks += 1; c.gens.add(e.recipientId); par.set(e.url, c)
  }
  return [...par.entries()]
    .map(([url, c]) => ({ url, clicks: c.clicks, people: c.gens.size }))
    .sort((a, b) => b.clicks - a.clicks)
}

// =============================================================================
// 5. FILE D'ENVOI (verbatim src/lib/send.ts, drainQueue)
// =============================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Si Gmail refuse pour cause de debit, on souffle et on retente une fois.
 * Un contact perdu sur une limite passagere serait invisible sinon.
 */
async function envoyerAvecReprise(transport, opts) {
  try {
    return await sendMail(transport, opts)
  } catch (e) {
    const message = e?.message ?? ''
    if (!/rate ?limit|quota|429|4\.7\.|userRateLimitExceeded|too many/i.test(message)) throw e
    await sleep(10_000)
    return sendMail(transport, opts)
  }
}

/**
 * Vide la file pendant `budgetMs` au plus : un destinataire a la fois, une
 * pause entre deux envois, plafond journalier par boite. A rappeler par un
 * cron chaque minute jusqu'a ce que tout soit parti.
 *
 * ctx : { store, transport, appUrl, secret, senderByEmail, dailyCap, pauseMs }
 */
export async function drainQueue(ctx, budgetMs) {
  const { store, transport, appUrl, secret, senderByEmail, dailyCap, pauseMs } = ctx
  const t0 = Date.now()
  const out = { sent: 0, failed: 0, skipped: 0, capped: [], done: [] }
  const campagnes = new Map()
  const compteurs = new Map()
  const plafonnees = new Set()

  while (Date.now() - t0 < budgetMs) {
    const lot = await store.nextQueued(20)
    if (!lot.length) break
    let progres = false

    for (const r of lot) {
      if (Date.now() - t0 >= budgetMs) break
      let c = campagnes.get(r.campaignId)
      if (!c) { c = (await store.getCampaign(r.campaignId)) ?? undefined; if (c) campagnes.set(c.id, c) }
      if (!c || !['queued', 'sending'].includes(c.status)) continue
      if (plafonnees.has(c.fromEmail)) continue

      // L'identite d'envoi vient de la campagne, elle-meme limitee a la liste des boites.
      const sender = senderByEmail(c.fromEmail)
      if (!sender) { await store.markFailed(r.id, 'boite expeditrice hors liste'); out.failed++; progres = true; continue }

      if (!compteurs.has(c.fromEmail)) compteurs.set(c.fromEmail, await store.sentLast24h(c.fromEmail))
      if ((compteurs.get(c.fromEmail) ?? 0) >= dailyCap) {
        plafonnees.add(c.fromEmail)
        out.capped.push(c.fromEmail)
        continue
      }

      // Une desinscription arrivee entre la creation et l'envoi compte encore.
      if (await store.isSuppressed(r.email)) { await store.markSkipped(r.id, 'adresse supprimee'); out.skipped++; progres = true; continue }

      if (c.status === 'queued') { await store.setCampaignStatus(c.id, 'sending'); c.status = 'sending' }

      const perso = personnaliser(c.html, { rid: r.id, email: r.email, name: r.name }, appUrl, secret)
      try {
        const { threadId, messageId } = await envoyerAvecReprise(transport, {
          from: c.fromEmail, fromName: c.fromName, to: r.email, toName: r.name || undefined,
          subject: c.subject, html: perso.html, text: perso.text, unsubscribeUrl: perso.unsubscribeUrl,
        })
        await store.markSent(r.id, messageId, threadId)
        compteurs.set(c.fromEmail, (compteurs.get(c.fromEmail) ?? 0) + 1)
        out.sent++
        progres = true
        await sleep(pauseMs)
      } catch (e) {
        await store.markFailed(r.id, e?.message ?? String(e))
        out.failed++
        progres = true
      }
    }

    for (const c of campagnes.values()) {
      if (c.status !== 'sending') continue
      const reste = (await store.listRecipients(c.id)).some((x) => x.status === 'queued')
      if (!reste) { await store.setCampaignStatus(c.id, 'done'); c.status = 'done'; out.done.push(c.id) }
    }
    if (!progres) break
  }
  return out
}

// =============================================================================
// 6. REJETS (verbatim src/lib/gmail.ts + src/lib/send.ts, checkBounces)
// =============================================================================

/**
 * Un rejet n'est pas une reponse. Sans cette distinction, « Adresse
 * introuvable » s'affichait comme si le contact avait repondu.
 */
export function estUnRejet(from, sujet) {
  const f = (from ?? '').toLowerCase()
  const s = (sujet ?? '').toLowerCase()
  return (
    /mailer-daemon|postmaster|no-?reply@.*(google|outlook|protection)/.test(f) ||
    /delivery status notification|undelivered mail|delivery has failed|adresse introuvable|address not found|returned to sender|echec de la remise|échec de la remise/.test(s)
  )
}

/**
 * Releve des rejets pour le relais : les mailer-daemon reviennent dans la
 * boite expeditrice. On lit les messages recents de ce type et on en extrait
 * les adresses citees ; l'appelant les rapproche de ses envois.
 * auth : un client JWT (compte de service, subject = la boite).
 */
export async function scanBounces(auth, sinceDays = 7, max = 100) {
  const { google } = await import('googleapis')
  const gmail = google.gmail({ version: 'v1', auth })
  const { data } = await gmail.users.messages.list({
    userId: 'me', maxResults: max,
    q: `(from:mailer-daemon OR from:postmaster OR subject:"Delivery Status Notification" OR subject:"Undelivered") newer_than:${sinceDays}d`,
  })
  const out = []
  for (const m of data.messages ?? []) {
    if (!m.id) continue
    try {
      const { data: full } = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
      const textes = [full.snippet ?? '']
      const walk = (p) => {
        if (!p) return
        if (p.body?.data && /^(text\/plain|message\/delivery-status|text\/html)$/.test(p.mimeType ?? ''))
          textes.push(Buffer.from(p.body.data, 'base64url').toString('utf8'))
        for (const sub of p.parts ?? []) walk(sub)
      }
      walk(full.payload)
      const adresses = [...new Set((textes.join('\n').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []).map((a) => a.toLowerCase()))]
        .filter((a) => !/mailer-daemon|postmaster|google\.com$/.test(a))
      out.push({ id: m.id, receivedAt: new Date(Number(full.internalDate ?? Date.now())).toISOString(), snippet: full.snippet ?? '', adresses })
    } catch {
      // message hors de portee : ignore
    }
  }
  return out
}

/**
 * Le dernier message du fil qui ne vient pas de la boite expeditrice (mode gmail :
 * on relit le fil de chaque envoi). On ne lit que les en-tetes et le snippet.
 */
export async function findReply(auth, threadId, senderEmail) {
  const { google } = await import('googleapis')
  const gmail = google.gmail({ version: 'v1', auth })
  const res = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'metadata', metadataHeaders: ['From', 'Date', 'Subject'] })
  const messages = res.data.messages ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const entete = (nom) => m.payload?.headers?.find((h) => h.name === nom)?.value ?? ''
    const from = entete('From')
    if (from.toLowerCase().includes(senderEmail.toLowerCase())) continue
    return { from, snippet: m.snippet ?? '', receivedAt: new Date(Number(m.internalDate ?? Date.now())).toISOString(), kind: estUnRejet(from, entete('Subject')) ? 'echec' : 'reponse' }
  }
  return null
}

/**
 * Releve des rejets. Une adresse rejetee est mise en suppression : on ne lui ecrit plus jamais.
 *  - relay : lecture des mailer-daemon de la boite expeditrice, via un compte de service
 *            (clientFor). Sans compte de service, le releve est simplement saute.
 *  - gmail : relecture du fil de chaque envoi recent.
 * ctx : { store, transport, clientFor? }
 */
export async function checkBounces(ctx, limit = 300) {
  const { store, transport } = ctx
  const clientFor = ctx.clientFor ?? transport.clientFor
  const lot = await store.recipientsToCheck(limit)
  const campagnes = new Map()
  let bounced = 0
  const campagneDe = async (id) => {
    let c = campagnes.get(id)
    if (!c) { c = (await store.getCampaign(id)) ?? undefined; if (c) campagnes.set(c.id, c) }
    return c
  }

  if (transport.kind !== 'gmail') {
    if (!clientFor) return { checked: 0, bounced: 0, skipped: 'compte de service absent, releve des rejets impossible' }
    const parBoite = new Map()
    for (const r of lot) {
      const c = await campagneDe(r.campaignId)
      if (!c) continue
      parBoite.set(c.fromEmail, [...(parBoite.get(c.fromEmail) ?? []), r])
    }
    for (const [boite, envois] of parBoite) {
      const auth = await clientFor(boite)
      let dsns = []
      try { dsns = await scanBounces(auth) } catch { continue }
      const parAdresse = new Map(envois.map((r) => [r.email, r]))
      for (const d of dsns) {
        // Chaque avis de rejet n'est lu qu'une fois.
        if (!(await store.consumeToken(`dsn:${boite}:${d.id}`))) continue
        for (const a of d.adresses) {
          const r = parAdresse.get(a)
          if (!r) continue
          await store.markBounce(r.id, d.snippet)
          await store.addSuppression(r.email, 'bounce', r.campaignId)
          bounced++
        }
      }
      // Les autres envois de ce passage sont consideres arrives, sauf avis ulterieur.
      for (const r of envois) if (r.status === 'sent' || r.status === 'unsubscribed') {
        const encore = (await store.listRecipients(r.campaignId)).find((x) => x.id === r.id)
        if (encore && encore.status !== 'bounced') await store.markBounceChecked(r.id)
      }
    }
    return { checked: lot.length, bounced }
  }

  const auths = new Map()
  for (let i = 0; i < lot.length; i += 5) {
    await Promise.all(lot.slice(i, i + 5).map(async (r) => {
      const c = await campagneDe(r.campaignId)
      if (!c) return
      let auth = auths.get(c.fromEmail)
      if (!auth) { auth = await clientFor(c.fromEmail); auths.set(c.fromEmail, auth) }
      try {
        const reply = await findReply(auth, r.threadId, c.fromEmail)
        if (reply?.kind === 'echec') {
          await store.markBounce(r.id, reply.snippet)
          await store.addSuppression(r.email, 'bounce', c.id)
          bounced++
        } else {
          await store.markBounceChecked(r.id)
        }
      } catch {
        // Fil hors de portee : on reessaiera au prochain passage.
      }
    }))
  }
  return { checked: lot.length, bounced }
}

// =============================================================================
// 7. ROUTES HTTP nues (verbatim src/app/t/o, t/c, u) : renvoient { status, headers, body }
// =============================================================================

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

/** Pixel d'ouverture. Une signature fausse rend le pixel sans rien compter. */
export async function handleOpen(ctx, rid, sig) {
  if (sig === signer(ctx.secret, rid, 'o')) {
    try { await ctx.store.recordOpen(rid) } catch { /* jamais bloquer l'image */ }
  }
  return { status: 200, headers: { 'content-type': 'image/gif', 'cache-control': 'no-store, no-cache, must-revalidate, private', pragma: 'no-cache' }, body: GIF }
}

/** Redirection suivie : on compte, puis on renvoie vers le lien d'origine de la campagne. */
export async function handleClick(ctx, rid, n, sig) {
  const idx = Number(n)
  const retour = (url) => ({ status: 302, headers: { location: url, 'cache-control': 'no-store' }, body: '' })
  if (sig !== signer(ctx.secret, rid, `c${idx}`)) return retour(ctx.appUrl)
  const r = await ctx.store.getRecipient(rid)
  const c = r ? await ctx.store.getCampaign(r.campaignId) : null
  const url = c ? extraireLiens(c.html)[idx] : undefined
  if (!url) return retour(ctx.appUrl)
  try { await ctx.store.recordClick(rid, url) } catch { /* jamais bloquer la redirection */ }
  return retour(url)
}

const pageHtml = (titre, texte, bouton) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(titre)}</title>
  <style>body{margin:0;background:#f7f7f5;color:#16161a;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:grid;place-items:center;min-height:100vh}
  .box{max-width:440px;padding:32px;text-align:center}h1{font-weight:500;font-size:22px;margin:0 0 12px}p{color:#6b6b74;line-height:1.5}
  button{background:#1f3d2f;color:#fff;border:0;border-radius:8px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer}</style></head>
  <body><div class="box"><h1>${escapeHtml(titre)}</h1><p>${escapeHtml(texte)}</p>${bouton ? `<form method="post"><button type="submit">${escapeHtml(bouton)}</button></form>` : ''}</div></body></html>`

/**
 * Desinscription. GET = page de confirmation (un clic dans le mail ne desinscrit
 * pas encore, le bouton oui). POST = le bouton de la page, et le clic
 * « Se desabonner » des messageries (RFC 8058, un clic).
 * ctx.brand : le nom affiche dans la page (« les newsletters d'Eddy »).
 */
export async function handleUnsubscribe(ctx, method, rid, sig) {
  const page = (titre, texte, bouton) => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, body: pageHtml(titre, texte, bouton) })
  const invalide = () => page('Lien invalide', 'Ce lien de désinscription n’est pas reconnu.')
  if (sig !== signer(ctx.secret, rid, 'u')) return invalide()
  const brand = ctx.brand ?? 'nos newsletters'
  if (method.toUpperCase() === 'POST') {
    const r = await ctx.store.unsubscribe(rid)
    if (!r) return invalide()
    return page('Désinscription prise en compte', `${r.email} ne recevra plus ${brand}.`)
  }
  const r = await ctx.store.getRecipient(rid)
  if (!r) return invalide()
  if (r.status === 'unsubscribed') return page('Déjà désinscrit', `${r.email} ne recevra plus ${brand}.`)
  return page('Se désinscrire', `Ne plus recevoir ${brand} à l’adresse ${r.email} ?`, 'Confirmer la désinscription')
}

/**
 * Aiguillage sur un chemin : /t/o/<rid>/<sig>, /t/c/<rid>/<n>/<sig>, /u/<rid>/<sig>.
 * Renvoie la reponse nue, ou null si le chemin n'est pas a nous.
 */
export async function route(ctx, method, pathname) {
  let m
  if ((m = pathname.match(/^\/t\/o\/([A-Za-z0-9]+)\/([A-Za-z0-9_-]+)\/?$/))) return handleOpen(ctx, m[1], m[2])
  if ((m = pathname.match(/^\/t\/c\/([A-Za-z0-9]+)\/(\d+)\/([A-Za-z0-9_-]+)\/?$/))) return handleClick(ctx, m[1], m[2], m[3])
  if ((m = pathname.match(/^\/u\/([A-Za-z0-9]+)\/([A-Za-z0-9_-]+)\/?$/))) return handleUnsubscribe(ctx, method, m[1], m[2])
  return null
}

// =============================================================================
// 8. LE MOTEUR : tout relie dans un objet
// =============================================================================

/**
 * config :
 *   appUrl      URL publique sans slash final (pixel, clics, desinscription). En local : un tunnel.
 *   secret      signe les liens de suivi. Le changer invalide les liens deja envoyes.
 *   senders     [{ email, name }] : les seules boites d'ou un mail peut partir.
 *   transport   voir createTransport (relay | gmail | custom), ou un transport deja fabrique.
 *   store       un store (createJsonStore ou le votre). Par defaut storeFile.
 *   storeFile   chemin du JSON (defaut ./data/newsletter.json).
 *   dailyCap    plafond par boite et par 24 h glissantes (defaut 9000 relay, 1800 gmail).
 *   pauseMs     pause entre deux envois (defaut 1000 relay, 2000 gmail).
 *   brand       texte de la page de desinscription (« les newsletters d'Eddy »).
 *   serviceAccount  (optionnel, mode relay) JSON du compte de service pour lire les rejets.
 */
export function createEngine(config) {
  if (!config?.secret) throw new Error('secret manquant (signe les liens de suivi)')
  const appUrl = String(config.appUrl ?? 'http://localhost:3000').replace(/\/$/, '')
  const senders = (config.senders ?? []).map((s) => ({ email: s.email.trim().toLowerCase(), name: (s.name ?? s.email).trim() }))
  const senderByEmail = (email) => senders.find((s) => s.email === (email ?? '').trim().toLowerCase())
  // Un transport deja fabrique (ou un simple { deliver }) est pris tel quel, complete de ce qui manque.
  const transport = typeof config.transport?.deliver === 'function'
    ? { kind: 'custom', verify: async () => {}, close: () => {}, clientFor: null, ...config.transport }
    : createTransport(config.transport)
  const store = config.store ?? createJsonStore(config.storeFile ?? path.join(process.cwd(), 'data', 'newsletter.json'))
  const isGmail = transport.kind === 'gmail'
  const dailyCap = Math.max(1, Number(config.dailyCap ?? (isGmail ? 1800 : 9000)))
  const pauseMs = Math.max(0, Number(config.pauseMs ?? (isGmail ? 2000 : 1000)))

  let clientFor = transport.clientFor
  if (!clientFor && config.serviceAccount) {
    const sa = parseServiceAccount(config.serviceAccount)
    clientFor = async (email) => {
      const { JWT } = await import('google-auth-library')
      return new JWT({ email: sa.client_email, key: sa.private_key, scopes: SCOPES, subject: email })
    }
  }

  const ctx = { store, transport, appUrl, secret: config.secret, senderByEmail, dailyCap, pauseMs, brand: config.brand, clientFor }

  const engine = {
    ctx, store, transport, senders, appUrl, dailyCap, pauseMs,

    /** Ouvre la connexion et s'authentifie, sans rien envoyer. Jette si ca ne passe pas. */
    verifyTransport: () => transport.verify(senders[0]?.email),

    /**
     * Cree une campagne : { title, subject, from, html, recipients: [{ email, name? }], createdBy?, crmNewsletterId? }.
     * L'identite d'envoi est validee contre senders, jamais prise telle quelle.
     */
    async createCampaign(body) {
      const sender = senderByEmail(body.from)
      if (!sender) throw new Error('boite expeditrice inconnue : ' + body.from)
      const title = (body.title ?? '').trim()
      const subject = (body.subject ?? '').trim() || title
      const html = (body.html ?? '').trim()
      if (!title || !html) throw new Error('titre ou html vide')
      if (!Array.isArray(body.recipients) || body.recipients.length === 0) throw new Error('aucun destinataire')
      return store.createCampaign(
        { title, subject, fromEmail: sender.email, fromName: sender.name, html, createdBy: body.createdBy ?? '', crmNewsletterId: body.crmNewsletterId ? String(body.crmNewsletterId) : null },
        body.recipients,
      )
    },

    /**
     * Envoi d'essai : le HTML tel quel, objet prefixe [Test]. Rien n'est
     * enregistre, aucun pixel, aucun lien reecrit : on juge le rendu et
     * l'atterrissage, pas les compteurs.
     */
    async sendTest({ from, to, toName, subject, html }) {
      const sender = senderByEmail(from)
      if (!sender) throw new Error('boite expeditrice inconnue : ' + from)
      const propre = (html ?? '').replace(/%unsubscribe_url%/g, '#').replace(/\{\{\s*unsubscribe\s*\}\}/g, '#')
      return sendMail(transport, { from: sender.email, fromName: sender.name, to, toName, subject: `[Test] ${subject ?? ''}`.trim(), html: propre, text: versTexte(propre) })
    },

    /** Vide la file pendant budgetMs au plus. A rappeler chaque minute par un cron. */
    drainQueue: (budgetMs = 50_000) => drainQueue(ctx, budgetMs),

    pause: (id) => store.setCampaignStatus(id, 'paused'),
    resume: (id) => store.setCampaignStatus(id, 'sending'),
    cancel: (id) => store.setCampaignStatus(id, 'cancelled'),

    stats: (id) => campaignStats(store, id),
    links: (id) => linkStats(store, id),
    recipients: (id) => store.listRecipients(id),
    campaign: (id) => store.getCampaign(id),
    campaigns: () => store.listCampaigns(),
    /** Compte restant pour une boite aujourd'hui. */
    remaining: async (email) => Math.max(0, dailyCap - (await store.sentLast24h(email))),

    suppressions: () => store.listSuppressions(),
    suppress: (email) => store.addSuppression(email, 'manual'),
    unsuppress: (email) => store.removeSuppression(email),

    /** Releve des rejets (relay : compte de service requis ; gmail : fils relus). */
    checkBounces: (limit = 300) => checkBounces(ctx, limit),

    personnaliser: (html, p) => personnaliser(html, p, appUrl, config.secret),
    handleOpen: (rid, sig) => handleOpen(ctx, rid, sig),
    handleClick: (rid, n, sig) => handleClick(ctx, rid, n, sig),
    handleUnsubscribe: (method, rid, sig) => handleUnsubscribe(ctx, method, rid, sig),
    route: (method, pathname) => route(ctx, method, pathname),

    /**
     * Middleware pour http nu, Express, Fastify (via reply.raw), Koa (ctx.req/ctx.res) :
     * sert /t/o, /t/c et /u. Renvoie true si la requete a ete servie.
     *   Express : app.use(engine.middleware())
     *   http    : createServer(async (req, res) => { if (await handler(req, res)) return; ... })
     */
    middleware() {
      return async (req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://x').pathname
        const rep = await route(ctx, req.method ?? 'GET', pathname)
        if (!rep) { if (typeof next === 'function') next(); return false }
        res.writeHead(rep.status, rep.headers)
        res.end(rep.body)
        return true
      }
    },

    close: () => transport.close(),
  }
  return engine
}

export default createEngine
