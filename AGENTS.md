# Protocole d'installation assistée

**Ce fichier s'adresse à un agent IA** (Claude Code, Cursor, Codex, ChatGPT…) à qui
l'utilisateur a donné l'URL de ce dépôt. Suis-le du début à la fin.

Objectif : l'utilisateur ne tape aucune commande. Il répond à des choix guidés,
l'agent fait la partie technique, et l'utilisateur ouvre lui-même dans son
navigateur habituel les pages sensibles OKX (connexion, sous-compte, clé API).

---

## Règles impératives

1. **Ne passe jamais un ordre réel sans confirmation explicite** dans le message
   qui précède. « Configure tout » n'est pas une autorisation d'acheter.
2. **Le mode démo est le défaut.** Ne bascule en réel que si l'utilisateur le
   demande, et redis-lui ce que ça implique avant.
3. **Les clés API ne vont jamais dans le dépôt.** Uniquement dans `.env` (déjà
   dans `.gitignore`) en local, et dans les secrets GitHub Actions.
4. **Refuse une clé qui a la permission de retrait.** Lecture + Trading suffit.
5. **Parle la langue de l'utilisateur** et introduis chaque étape sensible en
   **2 à 5 phrases courtes** avant de poser la question. L'utilisateur doit
   comprendre : pourquoi cette étape existe, ce qu'il doit faire, ce qui sera
   vérifié ensuite et ce qui ne se produira pas encore. Une question nue comme
   « Europe ou ailleurs ? » ou « Envoie ta clé API » est interdite.
6. **Une question à la fois.** Quand l'interface sait afficher des boutons, une
   liste de choix ou un sélecteur (par exemple son outil natif de question
   structurée), utilise impérativement ce composant : ne
   demande pas à l'utilisateur de retaper une option au clavier. Si aucun choix
   interactif n'est disponible, affiche les options numérotées et accepte le
   numéro ou le libellé. Propose toujours une valeur recommandée.
7. **N'ouvre jamais le navigateur intégré pour OKX.** Donne l'URL officielle
   correspondant à la région et demande à l'utilisateur de l'ouvrir lui-même
   dans son navigateur habituel, où il est déjà connecté.
8. **Ne demande jamais une clé, un secret ou une passphrase dans le chat.** Ces
   valeurs sont saisies hors conversation dans un terminal masqué, un fichier
   local `.env` ignoré par Git, ou directement dans GitHub Actions Secrets.
9. **Le fusible `ALLOW_REAL_TRADING` est géré par l'agent.** Ne le présente
   jamais comme un secret que l'utilisateur doit créer, saisir, mémoriser ou
   supprimer. Après la confirmation finale, crée-le toi-même juste avant
   l'exécution réelle ; lorsqu'il faut arrêter, retire-le toi-même avant de
   désactiver le workflow. Son nom peut rester visible dans les explications
   techniques et les diagnostics, mais pas dans la checklist utilisateur.
9. **Donne des liens Markdown cliquables et nommés**, jamais une URL sensible
   seule ni entourée de backticks. Exemple :
   `[Ouvrir la gestion des sous-comptes OKX](https://...)`. Précise que la page
   peut d'abord demander une connexion, puis redirigera vers la bonne rubrique.
10. **Marque la progression.** Après chaque réponse, résume en une ligne ce qui
    est acquis et annonce l'étape suivante. Ne transforme pas l'entretien en
    interrogatoire et ne répète pas une information déjà donnée par
    l'utilisateur.

---

## Étape 1 — Vérifier l'outillage

```bash
node -v   # attendu : v20 ou plus
git --version
gh --version && gh auth status
```

Ce qui manque : [Node.js](https://nodejs.org) · [Git](https://git-scm.com/downloads) ·
[GitHub CLI](https://cli.github.com). Après installation de `gh`, l'utilisateur
doit lancer `gh auth login` lui-même (connexion navigateur, tu ne peux pas la
faire à sa place).

Installe l'outillage OKX — le CLI pour le terminal, le MCP pour te donner 171
outils OKX :

```bash
npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli
```

---

## Étape 2 — L'entretien interactif

Les **deux premières questions sont obligatoirement posées en premier, dans cet
ordre, une par une et sous forme de choix cliquables/sélectionnables** lorsque
l'interface le permet.

### Format conversationnel obligatoire

Avant chaque question, affiche un petit bloc lisible contenant :

1. **But** — pourquoi l'information est nécessaire ;
2. **Impact** — ce que le choix change concrètement ;
3. **Sécurité** — ce qui reste désarmé ou confidentiel ;
4. **Action** — une seule question ou un seul lien à traiter maintenant.

Ne termine jamais une étape par le seul texte « Réponds simplement… ». Le
parcours doit convenir à une personne qui n'a jamais utilisé une API, GitHub
Actions ou un sous-compte OKX.

**Question 1 — mode du compte**

Explique d'abord :

> Nous choisissons d'abord sur quel type de compte les vérifications seront
> faites. Le mode Démo utilise des fonds fictifs ; le mode Argent réel utilise
> le solde Spot réel du compte OKX. Même si vous choisissez Argent réel, aucun
> ordre ne sera transmis pendant l'installation et le test à blanc : une
> confirmation finale séparée restera obligatoire.

- `Démo (argent fictif)` — recommandé pour tester sans risque ;
- `Argent réel` — ordres Spot réels, jamais armés sans confirmation finale.

Attends la réponse avant d'afficher la question 2.

**Question 2 — région du compte OKX**

Explique d'abord :

> La région détermine le domaine OKX et l'adresse API utilisés. Choisir le
> mauvais site produit souvent l'erreur « API key doesn't exist », même avec une
> clé valide. Sélectionnez la région correspondant au site sur lequel votre
> compte est réellement connecté ; elle n'est pas déduite de votre position.

- `Europe/EEE` — recommandé si le compte est sur `my.okx.com` ;
- `États-Unis` ;
- `Turquie` ;
- `Ailleurs`.

Attends la réponse avant de poursuivre. N'infère pas la région depuis le fuseau
horaire ou l'adresse IP.

**Question 3 — isolation du budget (argent réel uniquement)**

Avant de parler de clé API, propose un nouveau choix cliquable :

> Un sous-compte est un espace OKX séparé, rattaché au compte principal. Il
> permet d'isoler le bot avec uniquement le petit budget du plan : une erreur de
> configuration ne peut alors pas utiliser tout le solde Trading principal.
> C'est recommandé mais facultatif ; il ne s'agit pas d'ouvrir un nouveau compte
> bancaire ni de refaire l'identité du titulaire.

- `Créer un sous-compte dédié` — recommandé ; limite le budget exposé au bot ;
- `Utiliser mon compte principal` — aucun sous-compte.

Si l'utilisateur choisit le sous-compte, donne l'URL régionale de sous-compte,
demande-lui de l'ouvrir dans son propre navigateur, puis donne **une seule tâche
à la fois** :

1. ouvrir le lien et se connecter si OKX le demande ;
2. choisir **Créer un sous-compte** puis le type **Standard** (pas « Managed
   trading »), avec un nom reconnaissable comme `dca-github` ;
3. confirmer la création avec la 2FA puis revenir dire seulement « créé » ;
4. annoncer le montant total calculé, par exemple « Transfère au moins 20 USDC
   du compte principal vers le sous-compte, avec une petite marge pour les
   frais », puis afficher **immédiatement après cette phrase** le lien régional
   de transfert principal → sous-compte. En Europe/EEE, utiliser exactement
   [Transférer du compte principal vers le sous-compte](https://my.okx.com/fr-fr/balance/sub-transfer) ;
5. vérifier ensuite que la devise est disponible dans le solde **Trading** du
   sous-compte. Si elle est seulement dans **Funding / Financement**, donner le
   lien Funding → Trading correspondant ;
6. ouvrir ensuite la page API, cliquer **Créer une clé API**, puis sélectionner
   ce sous-compte dans le champ **Compte**.

Si le champ Compte n'est pas sélectionnable, explique que cela signifie en
général qu'aucun sous-compte n'est encore lié ou que la page est ouverte depuis
le mauvais compte. Ne continue pas avec une clé du compte principal sans le
signaler clairement.

S'il choisit le compte principal, ne crée rien : rappelle que la clé accédera au
solde Trading principal et recommande de n'y laisser que le budget accepté.
Demande une confirmation de ce choix, puis donne l'URL régionale de création de
clé.

En mode démo, explique qu'un sous-compte de budget n'est pas nécessaire puisque
les fonds sont fictifs, puis donne l'URL API régionale et demande de créer la clé
depuis *Trading démo*.

Dans tous les cas, guide la création de clé écran par écran : nom explicite
(`github-dca`), bon compte dans le sélecteur, objectif « API trading »,
permissions **Lecture + Trading**, jamais **Retrait**, passphrase unique, puis
2FA. Pour GitHub Actions, explique avant validation que l'adresse IP ne peut pas
être figée car les runners changent d'IP. L'utilisateur ouvre lui-même l'URL
dans son navigateur habituel ; ne prends pas le contrôle du navigateur et ne
demande jamais les identifiants API dans le chat.

Pose ensuite, une par une :

| # | Question | Défaut |
|---|---|---|
| 4 | Quelle(s) crypto acheter ? | BTC-USDC,ETH-USDC |
| 5 | Combien à chaque achat ? | 50 |
| 6 | Tous les combien de jours ? | 15 |
| 7 | Pendant combien de mois ? | 3 |
| 8 | Nom du dépôt à créer sur son compte ? | mes-achats-crypto |

Pour ces questions, ne donne pas seulement une valeur par défaut :

- **Actif(s)** : explique qu'une paire comme `SOL-USDC` signifie « acheter SOL
  en dépensant des USDC » et que toutes les paires doivent avoir la même devise
  de droite ;
- **Montant** : précise qu'il s'agit du montant dépensé **par actif et par
  échéance**, puis calcule le total prévu avant toute confirmation ;
- **Rythme et durée** : traduis la réponse en dates et en nombre exact
  d'échéances. Si l'utilisateur demande « maintenant puis dans 15 jours »,
  utilise `--count 2` et annonce les deux dates ;
- **Dépôt** : explique qu'il contiendra le plan et l'historique, qu'il sera créé
  privé par défaut et qu'aucune clé API n'y sera enregistrée.

Si l'utilisateur a déjà donné un actif, un montant, un rythme ou un nombre
d'achats dans son premier message, conserve ces valeurs et affiche un
récapitulatif ; ne lui demande que les informations manquantes.

**Question 2 → paramètre `site` et devise :**

| Réponse | `site` | Domaine | Devise conseillée |
|---|---|---|---|
| Europe | `eea` | my.okx.com | `-USDC` en démo, `-EUR` ou `-USDC` en réel selon disponibilité |
| US | `us` | us.okx.com | `-USD` |
| Turquie | `tr` | tr.okx.com | `-TRY` |
| Ailleurs | `global` | www.okx.com | `-USDT` |

**URLs cliquables à remettre à l'utilisateur (ouverture manuelle uniquement) :**

| Région | Sous-comptes | Clés API | Funding → Trading |
|---|---|---|---|
| Europe/EEE | [Ouvrir les sous-comptes OKX Europe](https://my.okx.com/fr-fr/account/sub-account) | [Ouvrir les clés API OKX Europe](https://my.okx.com/fr-fr/account/my-api) | [Ouvrir le transfert Funding → Trading](https://my.okx.com/fr-fr/balance/transfer) |
| États-Unis | [Ouvrir les sous-comptes OKX US](https://us.okx.com/account/sub-account) | [Ouvrir les clés API OKX US](https://us.okx.com/account/my-api) | [Ouvrir le transfert Funding → Trading](https://us.okx.com/balance/transfer) |
| Turquie | [Ouvrir les sous-comptes OKX TR](https://tr.okx.com/account/sub-account) | [Ouvrir les clés API OKX TR](https://tr.okx.com/account/my-api) | [Ouvrir le transfert Funding → Trading](https://tr.okx.com/balance/transfer) |
| Ailleurs | [Ouvrir les sous-comptes OKX](https://www.okx.com/account/sub-account) | [Ouvrir les clés API OKX](https://www.okx.com/account/my-api) | [Ouvrir le transfert Funding → Trading](https://www.okx.com/balance/transfer) |

Pour l'Europe/EEE, le transfert **compte principal → sous-compte** utilise une
page distincte : [Transférer vers un sous-compte OKX Europe](https://my.okx.com/fr-fr/balance/sub-transfer).
Ne remplace pas ce lien par la page Funding → Trading : les deux transferts ne
servent pas à la même étape.

Ajoute aussi, si l'utilisateur hésite, les explications officielles :

- [Comprendre et créer un sous-compte](https://www.okx.com/fr-fr/help/what-is-a-sub-account) ;
- [FAQ OKX Europe : sous-comptes et connexions API](https://www.okx.com/fr-fr/help/subaccounts-account-mode-and-api-connections-faq) ;
- [FAQ officielle sur les clés API](https://www.okx.com/en-eu/help/api-faq).

Pour toute clé : permissions **Lecture + Trading**, jamais Retrait. Pour le mode
démo, l'utilisateur doit d'abord basculer sur *Trading démo* puis créer une clé
démo. Pour GitHub Actions, explique l'absence de restriction IP avant qu'il
valide la clé, car les runners utilisent des adresses variables.

**Question 4 :** n'importe quelle paire au comptant d'OKX fonctionne. Plusieurs
sont possibles, séparées par des virgules, à condition de partager la même devise
de cotation (`BTC-USDC,ETH-USDC` ✅ · `BTC-EUR,ETH-USDC` ❌ si les devises sont mélangées).

⚠️ Un compte **démo** n'est pas approvisionné en EUR. Si l'utilisateur choisit le
mode démo, propose d’abord des paires en `-USDC` comme `BTC-USDC,ETH-USDC`.

---

## Étape 3 — Configurer OKX en local

Ne récupère pas les secrets dans le chat. Fais-les saisir par l'utilisateur via
une saisie locale masquée ou demande-lui de remplir `.env` localement, sans
jamais afficher ensuite son contenu. Si ce canal sûr n'est pas disponible,
saute la configuration locale et guide l'utilisateur vers les Secrets GitHub.

```bash
okx config add-profile AK=<clé> SK=<secret> PP=<passphrase> site=<site> demo=<true|false>
```

Vérifie immédiatement, et montre le solde à l'utilisateur :

```bash
okx account balance
```

Si ça échoue, c'est presque toujours la passphrase ou le mauvais `site`. Ne
continue pas tant que ça ne passe pas.

Branche aussi le MCP OKX sur ton propre client, pour la suite :

```bash
okx setup --client claude-code
```

(`claude-desktop`, `cursor`, `vscode`, `windsurf` sont aussi acceptés.)

---

## Étape 4 — Créer le dépôt de l'utilisateur

**Toujours en privé.** N’utilise jamais `--public` pour le parcours agent, sauf
demande **explicite** de l’utilisateur (ex. GitHub Pages gratuit). Par défaut :

```bash
gh repo create <nom-du-dépôt> --private --template Capetlevrai/okx-planifier-achat-github-actions
```

Si tu proposes un nom de dépôt, crée-le **privé** sans reposer la question
« public ou privé » : le privé est le choix forcé du protocole.

```bash
git clone https://github.com/<pseudo>/<nom-du-dépôt>.git
```

Crée ensuite `.env` à la racine du clone (il est ignoré par git) :

```
OKX_API_KEY=<clé>
OKX_SECRET_KEY=<secret>
OKX_PASSPHRASE=<passphrase>
OKX_DEMO=1
OKX_BASE_URL=https://my.okx.com
```

Ces valeurs locales doivent correspondre au plan : toute divergence de
`OKX_DEMO` est refusée afin qu'un même `operationId`/`clOrdId` ne puisse jamais
passer du compte démo au compte réel, et `OKX_BASE_URL` doit correspondre au
`site` du plan.

---

## Étape 5 — Enregistrer les secrets sur GitHub

Ne te contente jamais de donner le lien général **Settings → Environments**.
Guide l'utilisateur écran par écran, une action à la fois :

1. ouvre `https://github.com/<pseudo>/<nom-du-dépôt>/settings/environments` ;
2. sur la page qui liste les environnements, clique sur la grande carte
   **`real-trading`** (pas sur l'icône corbeille) ;
3. sur la page suivante, descends jusqu'à **Environment secrets** ;
4. clique sur **Add environment secret** pour ajouter, un par un,
   `OKX_API_KEY`, `OKX_SECRET_KEY` et `OKX_PASSPHRASE` ;
5. précise systématiquement : **utilise Environment secrets, jamais
   Environment variables**. Les variables ne sont pas lues comme identifiants
   OKX par le workflow et provoqueraient un échec difficile à comprendre ;
6. demande seulement « indique-moi quand les trois secrets sont ajoutés ».
   Ne demande jamais leurs valeurs dans la conversation.

Si `real-trading` n'existe pas, crée d'abord cet environnement, puis fais
revenir l'utilisateur sur la liste et demande-lui de cliquer sur sa carte.
Lorsque la saisie est terminée, vérifie uniquement les **noms** via l'API GitHub,
jamais les valeurs.

Si une saisie locale sûre est disponible, l'équivalent CLI doit toujours cibler
l'environnement :

```bash
gh secret set OKX_API_KEY --repo <pseudo>/<nom-du-dépôt> --env real-trading
gh secret set OKX_SECRET_KEY --repo <pseudo>/<nom-du-dépôt> --env real-trading
gh secret set OKX_PASSPHRASE --repo <pseudo>/<nom-du-dépôt> --env real-trading
```

Le mode démo/réel et le domaine viennent du plan versionné. N'utilise pas une
variable de dépôt pour convertir un plan démo en réel ou changer silencieusement
de région.

---

## Étape 6 — Générer le planning

Depuis le clone. **Sans `--live`** : on reste en simulation à ce stade.

```bash
node scripts/plan.mjs --instId <paires> --amount <montant> --every <jours> --months <mois> --check --force
```

`--check` valide les paires auprès d'OKX. Puis :

```bash
git add data/ && git commit -m "Mon plan d'achats" && git push
```

---

## Étape 7 — Interface (sans passer en public par défaut)

Le dépôt reste **privé**. L’interface se consulte dans le dépôt :

- `RAPPORT.md`
- `tableau-de-bord.html`

Ne passe **pas** le dépôt en public pour Pages, sauf si l’utilisateur le
demande **explicitement** et comprend que planning / historique versionnés
seront visibles. Dans ce cas seulement :

```bash
gh repo edit <pseudo>/<nom-du-dépôt> --visibility public --accept-visibility-change-consequences
gh api -X POST repos/<pseudo>/<nom-du-dépôt>/pages -f build_type=workflow
gh workflow run pages.yml --repo <pseudo>/<nom-du-dépôt>
```

Sinon, désactive Pages si besoin et pointe vers `RAPPORT.md`.

S'il refuse, désactive le workflow pour éviter des runs rouges à répétition, et
dis-lui qu'il peut consulter l'interface en local avec ``npm run site -- -l tcp://0.0.0.0:4173` :

```bash
gh workflow disable pages.yml --repo <pseudo>/<nom-du-dépôt>
```

**URL du tableau de bord à communiquer :**

- dépôt public avec Pages activées : `https://<pseudo>.github.io/<nom-du-dépôt>/` ;
- dépôt privé ou Pages indisponibles :
  `https://github.com/<pseudo>/<nom-du-dépôt>/blob/main/RAPPORT.md`.

Ne présente jamais une URL Pages comme disponible si elle ne l'est pas. Un dépôt
privé reste le défaut ; passer en public uniquement pour obtenir Pages exige une
demande explicite de l'utilisateur.

---

## Sécurité obligatoire avant argent réel

Avant de proposer l’argent réel à l’utilisateur, vérifie que :

- `scripts/run-due.mjs` utilise un `clOrdId` déterministe ;
- le script recherche l’ordre OKX par `clOrdId` avant tout nouvel envoi ;
- les paires sont limitées par `risk.allowedInstIds` ;
- `risk.maxOrderAmount` et `risk.maxDailyQuoteAmount` sont cohérents ;
- un dry-run passe ;
- un petit ordre démo passe ;
- le workflow réel utilise l'environnement GitHub `real-trading`, avec le secret
  d'armement et, si possible, des approbateurs obligatoires ;
- les tests d'orchestration à API factice passent ;
- le workflow `3. Keepalive — clé API OKX` existe, tourne toutes les 48h et
  appelle uniquement un endpoint authentifié de solde, jamais l'endpoint d'ordre ;
- une validation démo prolongée a été réalisée avant tout montant réel minimal.

Ne confonds pas ce projet avec des paiements bancaires : il ne fait que des achats spot OKX.

## Étape 8 — Test à blanc, puis armement

Lance un test qui ne transmet rien, et **montre les logs à l'utilisateur** :

```bash
gh workflow run dca.yml --repo <pseudo>/<nom-du-dépôt> -f dry_run=1
```

```bash
gh run watch --repo <pseudo>/<nom-du-dépôt>
```

Résume-lui ce qu'il vient de se passer : prix relevé, solde vérifié, échéance
détectée, ordre **non** transmis.

Puis pose la question, en clair :

> Tout fonctionne. Veux-tu que je passe le système en mode réel ? À partir de là,
> GitHub achètera automatiquement <montant> de <actifs> tous les <n> jours,
> <cycles> fois, sans que tu aies quoi que ce soit à faire — même ordinateur
> éteint. Total engagé : <total>.

**Attends une réponse affirmative claire.** Ensuite seulement :

### Parcours réel immédiat — une seule exécution, sans course

Pour un premier achat « maintenant », suis impérativement cette séquence dans
l'ordre. Ne lance pas de workflow et ne régénère pas le plan en parallèle : un
job qui termine pourrait réécrire un ancien état par-dessus le nouveau plan.

1. Attends que tous les runs `dca.yml` déjà déclenchés soient **terminés**, puis
   fais `git pull --rebase`. S'il y a un run actif, attends sa fin avant toute
   reconfiguration.
2. Utilise **l'heure UTC actuelle**, pas une heure choisie arbitrairement : une
   échéance datée de l'heure UTC en cours est immédiatement due. Pour un nombre
   exact d'achats, emploie `--count <cycles>` plutôt que `--months`.
3. Génère une seule fois le plan armé, commit et pousse-le. Vérifie que le
   `git push` a réussi avant de continuer.
4. Crée alors seulement le secret d'environnement `ALLOW_REAL_TRADING` avec la
   valeur exacte `I_CONFIRM_REAL_SPOT_BUYS`, puis lance **un seul** dispatch
   `dry_run=0` et attends son résultat. Ne clique jamais sur « Re-run ».
5. Vérifie que le log indique `filled` et que l'historique Spot OKX confirme le
   fill avant de conclure. En cas d'échec ou d'ambiguïté, n'exécute rien de
   nouveau : réconcilie d'abord l'ordre par son `clOrdId`.

Exemple : pour deux achats de 10 USDC de BTC, le premier immédiatement et le
second 15 jours après, renseigne `--count 2 --every 15`, avec `--start` égal à
la date UTC du jour et `--hour` égal à l'heure UTC courante.

```bash
node scripts/plan.mjs --instId <paires> --amount <montant> --every <jours> --count <cycles> --start <AAAA-MM-JJ-UTC> --hour <HEURE-UTC-ACTUELLE> --account reel --site <site> --live --force
```

```bash
git add data/ && git commit -m "Armer le plan" && git push
```

Puis, uniquement après un `git push` réussi :

```bash
gh secret set ALLOW_REAL_TRADING --repo <pseudo>/<nom-du-dépôt> --env real-trading --body "I_CONFIRM_REAL_SPOT_BUYS"
gh workflow run dca.yml --repo <pseudo>/<nom-du-dépôt> -f dry_run=0
gh run watch --repo <pseudo>/<nom-du-dépôt>
```

---

## Étape 9 — Récapitulatif final

Donne à l'utilisateur, en clair :

- l'URL de son dépôt et celle de son interface ;
- ce qui va être acheté, quand, combien de fois, pour quel total ;
- s'il est en démo ou en réel ;
- **après chaque achat effectivement rempli**, exactement ces deux liens pour
  qu'il puisse vérifier lui-même :
  - `Tableau de bord : <URL Pages si activée, sinon URL RAPPORT.md>` ;
  - `Historique des achats OKX : <URL de la région du compte>`.
  Pour Europe/EEE, l'URL OKX est
  `https://my.okx.com/fr-fr/balance/report-center/unified/account-history`.
  N'annonce jamais un achat à partir du seul statut du workflow : il doit être
  confirmé `filled` avant de remettre ces liens.
- **comment tout arrêter immédiatement** : l'utilisateur peut simplement
  demander « arrête les achats ». Retire alors le fusible d'armement avant de
  désactiver `dca.yml`, puis confirme que les deux protections sont appliquées.
  Ne lui demande pas de manipuler le secret technique. Ne régénère pas un plan
  après un achat réel pour « arrêter » sans avoir d'abord lu son registre.

---

## Dépannage

| Symptôme | Cause | Correctif |
|---|---|---|
| `50119 API key doesn't exist` | mauvais `site` / domaine | vérifier `site` et `OKX_BASE_URL` |
| `50113 Invalid Sign` | passphrase erronée | refaire `okx config add-profile` |
| `Solde insuffisant` | devise non approvisionnée | changer de paire (démo : `-USDC`) |
| `refusing to allow an OAuth App…workflow scope` | jeton `gh` limité | `gh auth refresh -s workflow`, ou `git push` (Credential Manager) |
| Pages : `422 plan does not support` | dépôt privé, plan gratuit | passer le dépôt en public |
| Le cron n'achète pas | plan non armé | `plan.mjs … --live`, commit, push |

## Repères sur le code

| Fichier | Rôle |
|---|---|
| `scripts/okx.mjs` | client REST OKX signé, zéro dépendance |
| `scripts/plan.mjs` | génère `data/plan.json` |
| `scripts/run-due.mjs` | exécute les échéances dues (idempotent) |
| `scripts/buy-now.mjs` | voie ponctuelle désactivée pour éviter tout contournement |
| `data/plan.json` | le planning ; `live: true` = armé |
| `data/history.json` | les achats réalisés |
| `site/index.html` | l'interface, sans build |

Le garde-fou est dans `configure()` (`scripts/okx.mjs`) et dans le moteur :
`DRY_RUN=1` force la simulation, tandis que `DRY_RUN=0` ne peut pas armer un plan
non-live. Un plan démo ne peut pas être converti en réel par l'environnement.


## Accès GitHub depuis un agent

Si l'utilisateur est sur téléphone et veut que tu fasses les modifications toi-même, demande un **fine-grained personal access token** limité au dépôt cible. Permissions minimales :

- Contents: Read and write
- Workflows: Read and write
- Secrets: Read and write si tu dois ajouter les secrets OKX
- Metadata: Read-only

Teste l'accès avec l'API GitHub avant de pousser. Révoque/recommande de révoquer le token une fois terminé.

## Interface locale hébergée par l'agent

Pour montrer l'interface à l'utilisateur sans GitHub Pages, lance :

```bash
npm run site -- -l tcp://0.0.0.0:4173
```

Puis donne l'URL réseau/Tailscale de la machine : `http://<ip>:4173/site/` et `http://<ip>:4173/tableau-de-bord.html`.

## Corrections de robustesse avant argent réel

Les points suivants sont obligatoires avant toute utilisation réelle :

- la réconciliation OKX par `clOrdId` se fait **avant** les contrôles de solde, whitelist et plafond ;
- un ordre `partially_filled` n'est pas présenté comme un achat complet ; il reste surveillé, ou finit en état `partial` si OKX l'annule avec une quantité partielle ;
- `entry.attempts` est incrémenté à un seul endroit, juste avant l'envoi d'un nouvel ordre ;
- le verrou argent réel utilise le secret `ALLOW_REAL_TRADING`, pas une variable de dépôt ordinaire ;
- le workflow de configuration conserve l'historique par défaut ; `reset_history` est explicite et refusé en compte réel ;
- tous les appels OKX ont un timeout HTTP explicite.

Pour un DCA automatique réel, l'agent crée lui-même ce secret après confirmation humaine :

```text
ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS
```

Le job utilise déjà `environment: real-trading`. Configure cet environnement avec
les secrets réels et des approbateurs. N'annonce jamais la sûreté réelle sur les
seuls tests : exige une validation démo prolongée puis un premier montant réel
minimal explicitement confirmé.

## Dépôt privé (recommandé pour les utilisateurs finaux)

Si l'utilisateur veut copier le projet **sans tout exposer** :

1. Crée **toujours** un dépôt **private** :
   `gh repo create <nom> --private --template Capetlevrai/okx-planifier-achat-github-actions`
2. Configure les trois identifiants OKX dans l'environnement `real-trading` ;
   le fusible d'armement reste géré séparément par l'agent.
3. Vérifie Actions : CI vert, puis `workflow_dispatch` du DCA avec `dry_run=1`.
4. Tableau de bord = `RAPPORT.md` / `tableau-de-bord.html` (pas de passage en public pour Pages).
5. Guide détaillé : [`docs/REPO_PRIVE.md`](docs/REPO_PRIVE.md).

Ne dis jamais que le DCA « nécessite un dépôt public ».  
Ne propose pas le public par défaut.

## Premier achat réel — guider l'utilisateur (obligatoire)

Avant tout micro-test ou DCA réel, **fais lire ou résume** le guide utilisateur :

- [`docs/GUIDE_ACHAT_REEL.md`](docs/GUIDE_ACHAT_REEL.md)

Points à vérifier **avec l'humain**, un par un (ne les saute pas) :

1. Fonds sur le compte **Trading** OKX, pas seulement **Funding** (piège n°1).
2. Clé API **live** (pas démo) + site cohérent (`eea` / `global` / …).
3. Secrets utilisateur `OKX_API_KEY`, `OKX_API_SECRET` ou `OKX_SECRET_KEY` et
   `OKX_PASSPHRASE`. Vérifie toi-même le fusible d'armement séparé sans demander
   à l'utilisateur de le créer ni de saisir sa valeur.
4. Montant minimal confirmé ; exposition plafonnée.
5. Après un run : lire les logs (désarmé / 401 environment / solde) **et**
   l’historique Spot OKX avant tout re-push ou re-run.
6. Ne jamais committer ni coller en clair : clés, `ordId`, quantités/frais exacts
   d’ordres réels sur un dépôt public.
7. En cas de clés collées dans le chat : exiger **révocation** + nouveaux secrets.
