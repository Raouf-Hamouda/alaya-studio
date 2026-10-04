# Mettre le studio Alaya sur un serveur

Ecrit le 4 octobre 2026. Rien de ce dossier n'a ete deploye : l'image a ete construite et lancee
sur le Mac de Raouf, contre une copie du site, et c'est tout.

## Les deux facons de faire, et laquelle est en place

**A. Le site chez un hebergeur, le studio a cote (ce qui existe aujourd'hui).**
Le dossier du site est un depot git. Le studio ecrit dedans, puis Site > Publier fait le commit
et le push ; l'hebergeur (GitHub Pages aujourd'hui, Netlify pour le paiement) reprend le depot.
Le paiement tourne chez l'hebergeur : `netlify/functions/creer-paiement.js`, avec la cle Stripe
posee chez lui. Le studio peut rester sur un Mac (`OUVRIR.command`) ou aller sur un serveur ;
dans les deux cas il n'a besoin que du depot et d'un acces en ecriture au depot distant.
Limite : sans adresse publique pour le studio, pas de suivi des mails ni de page de desinscription.

**B. Le studio sert aussi le site (`PUBLIC_SITE=1`).**
Un seul serveur : le site a la racine, le studio sous `/studio/` derriere son login, la fonction
de paiement du site executee par le studio a l'adresse ou le site l'appelle
(`/.netlify/functions/creer-paiement`), le suivi des mails sous `/m/`. C'est ce que monte le
`docker-compose.yml` de ce dossier.

Le choix entre A et B, le serveur, et le moment ou le domaine bascule sont a Raouf.

## B, pas a pas

1. Un serveur Linux avec Docker, et le domaine pointe dessus (enregistrements A / AAAA).
2. Copier le dossier `13_STUDIO` sur le serveur.
3. Dans `13_STUDIO/deploiement/` : `git clone <depot du site> site`, puis `cp env.exemple .env`
   et remplir `.env`.
4. `docker compose up -d --build`. Caddy prend le certificat HTTPS au premier appel.
5. Ouvrir `https://<domaine>/studio/`, entrer avec le compte de `.env`, creer les autres comptes
   dans Comptes, puis retirer `ADMIN_PASSWORD` de `.env`.
6. Pour que Publier pousse vers le depot distant depuis le serveur : une cle de deploiement en
   ecriture sur le depot (cle SSH montee dans le conteneur, ou jeton dans l'adresse du depot
   distant). Sans elle, Publier enregistre et echoue au push, et le dit.

## Ce que le programme lit dans l'environnement

| Variable | Role |
|---|---|
| `PORT`, `HOST` | ou il ecoute (8776, 127.0.0.1 sur le Mac ; 0.0.0.0 dans le conteneur) |
| `SITE_DIR`, `DATA_DIR` | le dossier du site, le dossier des donnees du studio |
| `PUBLIC_SITE=1` | sert le site a la racine, pour tout le monde |
| `PUBLIC_URL` | l'adresse publique ; active le suivi des mails et la page de desinscription |
| `SECURE=1` | cookie de session reserve a HTTPS |
| `TRUST_PROXY=1` | lit l'adresse du visiteur dans X-Forwarded-For (derriere Caddy) |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | le premier compte, cree une fois |
| `STRIPE_SECRET_KEY` | la cle Stripe ; vide, le paiement reste ferme |
| `ALAYA_ORIGINES` | les adresses du site acceptees par la fonction de paiement (par defaut `PUBLIC_URL`) |
| `MAILING_DAILY_CAP` | plafond d'envois par 24 h |
| `EGALISER` | chemin de l'outil qui met les photos au carre |

## Ce qui doit etre sauvegarde

Le dossier `data/` (comptes, documents de l'atelier, contacts et envois, sauvegardes d'ecriture)
et le depot du site. Le reste se reconstruit.

## Ce qui n'est pas fait

- Aucun deploiement, aucun domaine bascule, aucune cle Stripe posee.
- Pas de sauvegarde automatique de `data/` vers un autre endroit.
- Le webhook Stripe n'existe pas : le studio lit les commandes dans Stripe quand on ouvre l'ecran.
- La capture manuelle et le stock des pieces uniques (note du 4 aout, section 7) ne sont pas dans
  la fonction de paiement du site : aujourd'hui une carte est debitee des le paiement.
