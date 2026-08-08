# Guide utilisateur — premier achat réel OKX (Spot)

Ce guide explique **comment réussir le premier test d’argent réel** avec ce
projet, d’après un cas validé en production : **2 ordres de 1 USDC de SOL**
(SOL-USDC), exécutés via GitHub Actions, sans publier les détails d’ordre dans
le dépôt public.

Public visé : **utilisateur final** (pas développeur). Vous pouvez suivre les
étapes à la main, ou coller ce document à votre agent (Grok, Claude, Cursor…).

---

## En une phrase

Pour qu’un achat Spot parte vraiment :

1. clés API **réelles** (pas démo) sur le **bon site** OKX ;
2. USDC (ou la devise d’achat) sur le compte **Trading**, pas seulement Funding ;
3. secret d’armement exact `ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS` ;
4. plan `live: true` + `demo: false` + montants plafonnés ;
5. **jamais** coller les clés dans le dépôt Git, ni republier `ordId` / quantités
   exactes / frais sur un repo public.

Sans l’un de ces points, le job **échoue sans acheter**, ou **achète trop** si
les garde-fous sont contournés. Lisez tout le guide avant de lancer.

---

## Cas de référence validé

| Paramètre | Valeur |
|---|---|
| Paire | `SOL-USDC` |
| Montants | 1 USDC maintenant, puis 1 USDC ~2 minutes après |
| Exposition max | **2 USDC** total |
| Compte | sous-compte dédié, petit budget |
| Site | EEA (`my.okx.com` / plan `site: eea`) |
| Exécution | GitHub Actions, workflow temporaire de test |
| Résultat | 2 fills Spot réels ; aucun détail d’ordre commité dans le dépôt public |

Les leçons de ce cas sont reprises ci-dessous comme **checklist** et
**dépannage**.

---

## Checklist avant le premier euro / dollar réel

Cochez **dans l’ordre**. Ne passez pas à l’étape suivante tant que la précédente
n’est pas OK.

### A. Compte et fonds OKX

- [ ] Vous avez choisi entre un **sous-compte dédié** au bot (recommandé) et le
      compte principal **avant** de créer la clé API.
- [ ] Si vous avez choisi le sous-compte, créez-le depuis l'URL officielle de
      votre région, ouverte vous-même dans votre navigateur habituel, puis
      allouez-lui seulement le budget du plan (+ une petite marge).
- [ ] Si vous avez choisi le compte principal, vous acceptez que la clé accède à
      son solde Trading et vous n'y laissez que le budget que vous assumez.
- [ ] La devise d’achat est bien sur le compte (**USDC**, **EUR**, etc. selon
      votre plan).
- [ ] **Point le plus oublié** : les fonds sont sur **Trading**, pas seulement
      sur **Funding**.
  - OKX → **Actifs** → **Transfert**
  - De : **Funding** (Financement)
  - Vers : **Trading** (Transaction / Trading)
  - Devise : celle de votre plan (ex. USDC)
  - Montant : **au moins** ce que le plan va dépenser (+ une petite marge)
- [ ] Vous acceptez de perdre le montant du test (volatilité, frais, erreur de
      config).

> **Pourquoi Funding ≠ Trading ?**  
> L’API Spot de ce projet lit le solde **Trading**
> (`/api/v5/account/balance`) et envoie des ordres **Trade**.  
> De l’USDC visible dans Funding **ne sert à rien** pour l’achat tant qu’il n’a
> pas été transféré vers Trading. C’est la cause n°1 d’échec « solde
> insuffisant » alors que l’appli montre « 30 USDC ».

### B. Clé API

- [ ] Créez la clé **après** le choix du compte, afin qu'elle soit rattachée au
      sous-compte dédié ou au compte principal voulu.
- [ ] Ouvrez vous-même la page API officielle dans votre navigateur habituel ;
      ne transmettez jamais vos identifiants à un navigateur intégré ou au chat.
- [ ] Clé créée en mode **réel** (pas depuis l’onglet *Trading démo*).
- [ ] Permissions : **Lecture + Trading**.  
      ❌ **Pas Retrait**.  
      Option utile : **Transfer** si vous voulez que le bot puisse déplacer
      Funding → Trading automatiquement (sinon, transfert manuel comme ci-dessus).
- [ ] **Pas de restriction IP** pour GitHub Actions (les runners changent d’IP).
- [ ] Site cohérent avec votre compte :
  - Europe (EEA) → souvent `my.okx.com` / plan `site: eea`
  - International → `www.okx.com` / `site: global`
- [ ] La clé **n’a jamais** été collée dans un chat public, un ticket, une
      capture d’écran partagée. Sinon : **révoquez-la** et recréez-en une.

### C. Secrets GitHub (environnement `real-trading`)

Allez dans votre dépôt → **Settings → Environments → `real-trading`**  
(créez l’environnement s’il n’existe pas), puis ajoutez les valeurs dans la
section **Environment secrets**.

> **Attention : ne les ajoutez jamais dans _Environment variables_.** Ces
> variables ne sont pas chiffrées et le workflow ne les utilise pas pour les
> identifiants OKX. Cherchez le bouton **Add environment secret**.

![Section GitHub « Environment secrets », où ajouter les identifiants OKX](images/github-environment-secrets.png)

Ajoutez **ces secrets** (noms exacts) :

| Secret | Valeur |
|---|---|
| `OKX_API_KEY` | votre clé API **réelle** |
| `OKX_API_SECRET` *(ou `OKX_SECRET_KEY`)* | le secret affiché **une seule fois** à la création |
| `OKX_PASSPHRASE` | la passphrase choisie à la création de la clé |
| `ALLOW_REAL_TRADING` | **exactement** `I_CONFIRM_REAL_SPOT_BUYS` |

Règles :

- même orthographe, majuscules, **aucun espace**, **aucun guillemet** ;
- si `ALLOW_REAL_TRADING` est vide ou différent → **aucun ordre réel n’est
  envoyé** (le bot reste en lecture seule : « compte réel désarmé ») ;
- ne mettez **pas** ces valeurs dans le code, dans un commit, ni dans une issue.

En ligne de commande (exemple, le terminal vous demandera la valeur sans la
réafficher ensuite) :

```bash
gh secret set OKX_API_KEY --repo VOTRE_PSEUDO/VOTRE_DEPOT --env real-trading
gh secret set OKX_API_SECRET --repo VOTRE_PSEUDO/VOTRE_DEPOT --env real-trading
gh secret set OKX_PASSPHRASE --repo VOTRE_PSEUDO/VOTRE_DEPOT --env real-trading
gh secret set ALLOW_REAL_TRADING --repo VOTRE_PSEUDO/VOTRE_DEPOT --env real-trading
# puis coller exactement : I_CONFIRM_REAL_SPOT_BUYS
```

> Selon votre copie du projet, les secrets peuvent aussi être au niveau
> *Repository*. L’important est qu’ils soient **visibles du job** qui a
> `environment: real-trading`. Préférez l’environnement `real-trading` pour
> l’argent réel.

### D. Plan et montants

- [ ] Vous avez d’abord validé longtemps en **démo** (`demo: true`).
- [ ] Premier test réel : **montant minimal** (ex. 1 USDC × 1 ou 2 ordres).
- [ ] Plafonds du plan cohérents (ordre / jour / plan / durée de vie).
- [ ] Paire **réellement listée** en Spot sur votre site OKX (ex. `SOL-USDC`).
- [ ] Sur un **dépôt public** : acceptez que le *planning* puisse être visible ;
      les **détails privés d’ordre réel** (ordId, qty exacte, frais, clOrdId)
      ne doivent **pas** être commités volontairement.

---

## Comment lancer un test réel minimal (1 USDC + 1 USDC)

Ce dépôt fournit un workflow de test temporaire :

**Actions → « Test réel SOL — 1 USDC puis +2min »**

### Comportement attendu

1. Déclenché **uniquement** par un push sur `main` dont le message de commit
   contient le fusible **`[sol-real-test]`**.
2. **Pas** de `workflow_dispatch` (pas de bouton « Run workflow » libre) : c’est
   volontaire, pour éviter un clic accidentel.
3. **Pas** de *Re-run* GitHub : `github.run_attempt == 1` uniquement.
4. Le plan 1+1 USDC est **créé dans le runner** (éphémère), pas comme plan
   permanent dans le dépôt.
5. Étapes typiques :
   - garde qualité (`npm test`) ;
   - vérif du fusible `ALLOW_REAL_TRADING` ;
   - préparation du plan live temporaire ;
   - **contrôle solde Trading** (et tentative de transfert Funding→Trading si
     la clé a la permission Transfer) ;
   - achat 1/2 + réconciliation **filled** obligatoire ;
   - attente ~2 minutes ;
   - achat 2/2 + filled.
6. **Aucun** `git commit` / `git push` des fichiers d’état d’ordre dans ce
   workflow de test (permissions `contents: read`).

### Lancer le test (si vous utilisez ce workflow)

1. Checklist A–D validée.
2. Un commit sur `main` dont le message contient **`[sol-real-test]`**, et qui
   touche un des chemins surveillés par le workflow (voir
   `.github/workflows/sol-2min-test.yml`).
3. Ouvrir l’onglet **Actions**, suivre le job `sol-real-test` en direct.
4. Succès attendu : les deux étapes « Achat SOL 1/2 » et « Achat SOL 2/2 »
   sont vertes ; le résumé d’étape indique des achats **confirmés remplis**.

### Ce qu’il ne faut **pas** faire

| Action | Pourquoi c’est dangereux |
|---|---|
| Cliquer **Re-run jobs** | Le workflow refuse `run_attempt > 1`, mais d’autres flux pourraient recréer un plan |
| Repousser `[sol-real-test]` « pour voir » | Peut **racheter** encore 1+1 USDC |
| Coller clé/secret/passphrase dans un chat | Fuite ; il faut **révoquer** la clé |
| Committer `operations.json` / `history.json` avec ordres **réels** sur un repo public | Fuite de détails privés d’exécution |
| Utiliser une clé **démo** avec un plan **réel** | Erreur type *APIKey does not match current environment* |
| Laisser l’argent en **Funding** | Solde Trading = 0 → pas d’achat (ou échec préflight) |

---

## Lire les logs sans paniquer

Dans **Actions → le run → job `sol-real-test`**, regardez les messages suivants.

### Signes que **aucun ordre n’est parti** (souvent rassurant)

| Message / symptôme | Signification |
|---|---|
| `Compte réel désarmé : … aucun nouveau POST possible` | `ALLOW_REAL_TRADING` absent ou incorrect |
| `ALLOW_REAL_TRADING manquant ou incorrect` | Fusible bloqué **avant** tout achat |
| `state=prepared` qui ne devient jamais `filled` | Ordre non soumis / non rempli |
| `solde insuffisant` | Trading sans fonds (souvent encore en Funding) |
| Étape 2/2 **skipped** | L’étape 1 a échoué : normal, le 2ᵉ achat n’a pas eu lieu |

### Signes d’erreur de **clés / environnement**

| Message | Cause probable | Que faire |
|---|---|---|
| `APIKey does not match current environment` | Clé démo vs plan réel (ou l’inverse) | Recréer une clé dans le **bon** mode |
| `API key doesn't exist` | Mauvais site (global vs eea) ou clé révoquée | Vérifier site + recréer la clé |
| `Invalid Sign` / passphrase | Secret ou passphrase incorrects | Recoller les 3 secrets, sans espace |
| `This API key doesn't have permission…` (transfert) | Pas de permission Transfer | Transfert **manuel** Funding→Trading, ou nouvelle clé avec Transfer |

### Signes qu’un achat **réel a réussi**

| Message | Signification |
|---|---|
| `ACHATS ACTIVÉS, les ordres partent` **et** plus de « désarmé » | Armement OK |
| `… filled — montant exécuté et quantité présents` | Remplissage confirmé (sans afficher les détails privés dans le résumé) |
| Étapes 1/2 et 2/2 **success** | Les deux ordres du test sont OK |
| Côté OKX : historique Spot de la paire avec **2** fills récents | Confirmation indépendante |

Les secrets apparaissent comme `***` dans les logs : c’est normal et souhaitable.

---

## Vérifier côté OKX (indépendamment de GitHub)

Après un run :

1. Connexion OKX (même compte / sous-compte que la clé).
2. **Ordres** ou **Historique des trades** → Spot → filtre la paire (ex. SOL-USDC).
3. Fenêtre horaire du run Actions (horodatage **UTC** dans GitHub).
4. Comptez les fills : pour le test 1+1, vous devez voir **deux** achats d’environ
   1 USDC chacun (frais en plus, minimes).

Si GitHub est rouge mais OKX montre déjà un fill : **ne relancez pas** le même
test sans analyse — risque de double achat sur le 2ᵉ volet seulement, ou de
recréer un plan entier.

---

## Script « assurer le solde Trading »

Le projet inclut `scripts/ensure-trading-usdc.mjs` (utilisé par le workflow de
test SOL) :

1. lit le solde **Trading** USDC ;
2. s’il est insuffisant, lit le **Funding** ;
3. tente un transfert Funding → Trading **si** la clé a la permission ;
4. **ne log jamais le solde exact** (uniquement des *buckets* : zero / under /
   ok) ;
5. si le transfert est refusé (permission manquante), le job s’arrête avec un
   message clair : faire le transfert **dans l’interface OKX**.

Vous pouvez vous en inspirer pour tout premier passage en réel, même hors SOL.

---

## Passage au DCA réel « normal » (après le micro-test)

Une fois le micro-test 1–2 USDC réussi :

1. Gardez le secret `ALLOW_REAL_TRADING` **uniquement** si vous voulez vraiment
   l’automatisation réelle.
2. Configurez un plan réel via le workflow de setup / votre agent, avec :
   - paires choisies ;
   - montants **que vous assumez** ;
   - plafonds `risk.*` stricts ;
   - `demo: false`, `live: true` seulement quand vous êtes prêt.
3. Option : ajoutez des **approbateurs** sur l’environnement GitHub
   `real-trading` pour valider chaque run horaire à la main.
4. Surveillez le **premier** cron réel comme le micro-test.
5. Ne laissez pas traîner une clé qui a fuité ; le workflow keepalive maintient
   l’activité API sans passer d’ordres.

Pour retirer l’armement réel sans supprimer les clés :

- supprimez ou videz le secret `ALLOW_REAL_TRADING`, **ou**
- repassez le plan en `live: false` / `demo: true`.

---

## FAQ rapide

### « J’ai 30 USDC sur OKX mais le bot dit solde insuffisant »

Presque toujours : l’argent est en **Funding**. Transférez vers **Trading**.

### « Le job dit compte réel mais aucun achat »

Cherchez `désarmé` ou `ALLOW_REAL_TRADING manquant`. Le secret d’armement n’est
pas exactement `I_CONFIRM_REAL_SPOT_BUYS`.

### « HTTP 401 APIKey does not match current environment »

Clé **démo** utilisée contre un plan **réel** (ou l’inverse). Recréez la clé
dans le bon mode.

### « Est-ce que mon dépôt public affiche mes vrais achats ? »

Le workflow de test SOL est conçu pour **ne pas committer** l’état d’ordre réel.
Le workflow DCA principal, selon configuration, peut mettre à jour des fichiers
d’état : sur un repo **public**, privilégiez de petits montants et lisez
[SECURITE.md](./SECURITE.md). En cas de doute : **dépôt privé**.

### « Puis-je rejouer le test pour être sûr ? »

Uniquement si vous acceptez **racheter** (encore 2 USDC pour le test SOL).  
Ne faites **jamais** un Re-run aveugle. Vérifiez d’abord l’historique OKX.

### « Quelle permission pour le transfert auto Funding → Trading ? »

En plus de Lecture + Trading, activez la permission de **transfert interne**
lors de la création de la clé (libellé selon l’interface OKX). Sinon, transférez
à la main : c’est ce qui a débloqué le cas de référence.

---

## Récap sécurité (à relire)

1. Sous-compte + petit budget.
2. Lecture + Trading, **sans Retrait**.
3. Fonds en **Trading**.
4. Secrets GitHub uniquement ; armement `I_CONFIRM_REAL_SPOT_BUYS`.
5. Micro-montant d’abord, surveillance du run.
6. Pas de clés dans le chat ; en cas de fuite → **révocation**.
7. Pas de re-run / re-push de test sans vérifier OKX.
8. Sur repo public : ne publiez pas les détails privés d’ordres réels.

---

## Documents liés

- [README.md](../README.md) — vue d’ensemble et démarrage
- [SECURITE.md](./SECURITE.md) — règles de sécurité
- [AGENTS.md](../AGENTS.md) — protocole pour les agents d’installation
- Workflow : `.github/workflows/sol-2min-test.yml`
- Scripts : `scripts/prepare-sol-2min-test.mjs`, `scripts/ensure-trading-usdc.mjs`,
  `scripts/run-due.mjs`

---

## Avertissement

Ce guide est technique. Ce n’est **pas** un conseil en investissement. Les
crypto-actifs sont volatils ; vous pouvez perdre les montants engagés. Vous
restez responsable des ordres passés sur votre compte OKX.
