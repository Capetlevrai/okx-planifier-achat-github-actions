# OKX DCA Planner — exemple minimal BTC + ETH

Ce dépôt public montre un cas concret et volontairement simple :

- **BTC-USDC** : achat démo exécuté avec succès ;
- **ETH-USDC** : achat démo exécuté avec succès ;
- montant prévu : **50 USDC par actif** ;
- rythme : **tous les 15 jours** ;
- durée : **3 mois** ;
- exécution : **GitHub Actions**, ordinateur éteint possible ;
- secrets : uniquement dans **GitHub Actions Secrets**, jamais dans le code.

Interface : https://capetlevrai.github.io/okx-planifier-achat-github-actions/

> GitHub Actions fonctionne aussi en dépôt privé. Ce repo est public pour servir de tutoriel et de démo visible.

---


## Sécurité anti-double achat

Le projet utilise un registre durable `data/operations.json` et des `clOrdId`
déterministes pour éviter les doubles transmissions : une opération ambiguë est
réconciliée chez OKX avant tout nouveau POST, même si le compteur de tentatives,
le solde ou un plafond bloquerait une nouvelle soumission.

Protections en place :

- états d'opération séparés du planning mutable : `prepared`, `submitting`,
  `reconcile_pending`, `terminal` ;
- réconciliation par `clOrdId` avant solde, whitelist, plafonds et `maxAttempts` ;
- compteurs séparés : tentatives de soumission, réconciliations et échecs de
  préflight ;
- whitelist obligatoire, montants finis strictement positifs, dates ISO et
  limites cohérentes ;
- plafonds par ordre, par jour, par plan et sur la durée de vie ;
- audit financier conservant `operationId`, `clOrdId`, état OKX, quantité et
  montant réellement exécutés quand OKX les fournit ;
- voie `buy-now` désactivée : aucune commande ponctuelle ne contourne le moteur ;
- pour l'argent réel, le job GitHub est attaché à l'environnement protégé
  `real-trading` et exige le secret `ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS`.

Aucun mécanisme ne doit être considéré comme une autorisation implicite d'acheter
avec de l'argent réel : il faut une configuration réelle explicite, des secrets
réels valides et le verrou d'armement dans l'environnement protégé.

Ce dépôt automatise uniquement des **ordres spot OKX au marché**. Il ne fait pas de virements bancaires, retraits, paiements carte ou transferts sortants.

### Premier achat réel : lisez ceci avant

Un cas réel minimal a été validé (**1 USDC de SOL, puis encore 1 USDC ~2 min
plus tard**, sous-compte dédié). Les pièges qui bloquent la plupart des
premiers essais — fonds en **Funding** au lieu de **Trading**, clé démo vs plan
réel, secret `ALLOW_REAL_TRADING` manquant, re-run dangereux — sont documentés
pour les utilisateurs finaux :

👉 **[docs/GUIDE_ACHAT_REEL.md](docs/GUIDE_ACHAT_REEL.md)** — checklist,
lancement du micro-test, lecture des logs, FAQ.

Complément sécurité : [docs/SECURITE.md](docs/SECURITE.md).

---
## 🤖 La façon la plus simple : donnez cette URL à votre agent

Ouvrez **Grok**, **OpenCode**, **Claude Code**, **Cursor**, **Codex**, **ChatGPT** ou **Gemini**, et envoyez ceci :

```text
Installe ce projet pour moi : https://github.com/Capetlevrai/okx-planifier-achat-github-actions
```

C'est tout. L'agent lit [AGENTS.md](AGENTS.md) à la racine du dépôt, qui contient
le protocole complet : il vous pose les questions une par une — quelle crypto,
quel montant, quel rythme, démo ou réel — et se charge du reste.

Il installera l'outillage, créera votre dépôt, enregistrera vos clés au bon
endroit, générera votre planning, publiera votre tableau de bord et lancera un
test à blanc devant vous. **Il vous demandera confirmation avant tout achat
réel** — c'est écrit noir sur blanc dans le protocole.

Vous ne tapez aucune commande et n'allez sur aucune page de réglages.

### Si l’agent vous demande un token GitHub

Créez un **fine-grained personal access token** limité à votre dépôt cible :

- `Repository access` : `Only selected repositories`
- `Contents` : `Read and write`
- `Workflows` : `Read and write`
- `Secrets` : `Read and write`
- `Metadata` : `Read-only`

Ce token permet à l’agent de pousser les fichiers et d’ajouter les secrets
GitHub Actions sans voir ensuite leur valeur. Révoquez-le après configuration.

Prompts prêts à copier : [docs/AGENT_PROMPTS.md](docs/AGENT_PROMPTS.md).

---

## 🖱️ Ou : à la main, sans rien installer

**Ni Node, ni Git, ni ligne de commande. Uniquement votre navigateur.**

### 1. Créez votre copie

Cliquez sur **[Use this template](../../generate)** en haut de cette page →
*Create a new repository*. Nommez-le comme vous voulez, laissez-le **privé**.

### 2. Créez vos clés OKX

Sur [my.okx.com](https://my.okx.com) → Profil → API → **Créer une clé API**.

- Permissions : **Lecture + Trading**. ❌ **Jamais Retrait.**
- Placez la devise d’achat (ex. USDC) sur le compte **Trading**, pas seulement
  **Funding** — voir [docs/GUIDE_ACHAT_REEL.md](docs/GUIDE_ACHAT_REEL.md).
- Pour GitHub Actions, ne liez pas la clé à une IP GitHub : les runners GitHub
  utilisent de nombreuses plages IP variables. Préférez un **sous-compte dédié**
  avec petit budget, sans retrait ni transfert.
- OKX indique qu'une clé non liée à une IP avec permission `trade` peut expirer
  après **14 jours d'inactivité**. Le workflow **`3. Keepalive — clé API OKX`**
  tourne donc **chaque jour** (06:00 UTC) et effectue uniquement un appel
  authentifié de solde (`/api/v5/account/balance`) : cela garde la clé active
  sans passer d'ordre.
- Pour vous entraîner sans risque, basculez d'abord sur *Trading démo* et créez
  une clé démo — c'est le mode par défaut du projet.

Notez la **clé**, le **secret** et la **passphrase**.

### 3. Collez-les dans votre dépôt

**Settings → Secrets and variables → Actions → New repository secret.**
Trois secrets à créer, un par un :

| Nom | Valeur |
|---|---|
| `OKX_API_KEY` | votre clé |
| `OKX_SECRET_KEY` ou `OKX_API_SECRET` | votre secret |
| `OKX_PASSPHRASE` | votre passphrase |

GitHub les chiffre. Ils ne sont jamais visibles, ni dans le code, ni dans les logs.

### 4. Décrivez votre plan

Onglet **Actions** → **1. Configurer mon plan** → bouton **Run workflow** (à
droite) → remplissez le formulaire → bouton vert **Run workflow**.

Sept champs, tous avec une valeur par défaut :

| Champ | Ce que ça règle |
|---|---|
| `paires` | ce que vous achetez — `BTC-EUR`, `ETH-USDC`, plusieurs séparées par des virgules |
| `montant` | combien à chaque achat |
| `intervalle` | tous les combien de jours |
| `duree` | pendant combien de mois |
| `compte` | `demo` (argent fictif) ou `reel` (votre vrai argent) |
| `region` | `eea` Europe · `global` · `us` · `tr` |
| `execution` | `simulation` (rien ne part) ou `acheter` (les ordres partent) |

`compte` et `execution` sont **indépendants**. On teste d'abord en `demo` +
`simulation`, puis `demo` + `acheter` pour voir un vrai ordre sans risque, et on
ne passe en `reel` qu'ensuite.

Vous pouvez relancer ce formulaire quand vous voulez pour tout changer.

### 5. Consultez votre tableau de bord

Dans votre dépôt, ouvrez **`tableau-de-bord.html`** → bouton **Download raw
file** → **double-cliquez** sur le fichier téléchargé.

La page s'ouvre dans votre navigateur : positions, achats effectués, montants,
dates, achats à venir, avancement. Thème clair et sombre.

C'est un fichier unique, avec vos données déjà incluses : **aucun serveur,
aucune installation, et votre dépôt reste privé.** Il est régénéré
automatiquement après chaque achat — retéléchargez-le pour la version à jour.

> **Aperçu immédiat sans téléchargement :** ouvrez `RAPPORT.md`, GitHub l'affiche
> directement dans la page. Mêmes informations, présentation plus sobre.
>
> **Version en ligne :** possible via *Settings → Pages → Source : GitHub
> Actions*, mais GitHub Pages **exige un dépôt public** — vos achats seraient
> alors visibles de tous. Réservé à ceux que ça ne dérange pas.

### 6. Les achats

Une fois `execution` sur `acheter`, GitHub vérifie chaque heure s'il y a une
échéance. En compte réel, le job passe par l'environnement `real-trading` : si
vous lui imposez des approbateurs, chaque exécution attendra leur validation.

**Pour ne pas attendre demain**, déclenchez un achat tout de suite :
Actions → **2. Acheter — routine automatique** → **Run workflow** → menu
déroulant sur **`0`** → bouton vert **Run workflow**.

> `0` autorise uniquement l'exécution d'un plan déjà marqué `live` ; il ne peut
> pas armer un plan en simulation. `1` force la simulation pour ce lancement.

**Pour tout arrêter :** Actions → **2. Acheter** → menu `···` → *Disable workflow*.
Ou relancez le formulaire de configuration avec `execution = simulation`.

---

**Vous n'avez ouvert aucun terminal.** Les trois sections qui suivent
(agent IA, prompt détaillé, installation locale) sont des alternatives, pas des
étapes supplémentaires.

---

## 🧑‍💻 Le prompt détaillé, si vous préférez le contrôle

L'agent n'a besoin que de l'URL du dépôt. Mais si vous voulez cadrer précisément
ce qu'il fait, collez plutôt ceci :

```text
Installe et configure pour moi le projet OKX DCA Planner :
https://github.com/Capetlevrai/okx-planifier-achat-github-actions

Voici ce que j'attends, étape par étape :

1. Vérifie que Node.js 20+, Git et GitHub CLI (gh) sont installés. Installe ce
   qui manque et dis-moi si une action de ma part est nécessaire.
2. Installe l'outillage OKX :
   npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli
   Puis enregistre le serveur MCP dans mon agent : okx setup --client claude-code
3. Demande-moi mes clés API OKX (clé, secret, passphrase) et si je veux
   travailler sur le compte DÉMO ou RÉEL. Configure le profil avec :
   okx config add-profile AK=<clé> SK=<secret> PP=<passphrase> site=<global|eea|us|tr> demo=<true|false>
   Vérifie que ça marche avec : okx account balance
4. Crée-moi une copie du dépôt via "Use this template" (gh repo create
   --template Capetlevrai/okx-planifier-achat-github-actions), clone-la en
   local, et installe les dépendances s'il y en a.
5. Demande-moi ma stratégie : montant par achat, intervalle en jours, durée, et
   quelle(s) crypto(s) acheter. N'importe quelle paire au comptant d'OKX marche
   (BTC-EUR, ETH-USDC, SOL-EUR…) et on peut en mettre plusieurs, séparées par des
   virgules, à condition qu'elles partagent la même devise de cotation.
   Génère ensuite le planning :
   node scripts/plan.mjs --amount <montant> --every <jours> --months <mois> --instId <paires> --check
6. Enregistre mes 3 clés dans les secrets GitHub Actions du dépôt
   (OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE) avec la commande gh secret set.
7. Active GitHub Pages sur le dépôt (source : GitHub Actions) pour publier
   l'interface, et donne-moi l'URL finale.
8. Lance un test À BLANC du workflow (DRY_RUN=1) et montre-moi les logs.

IMPORTANT :
- Ne passe AUCUN ordre réel sans me demander confirmation explicite d'abord.
- Laisse DRY_RUN=1 partout tant que je n'ai pas validé le test à blanc.
- Ne commit jamais mes clés dans le dépôt : elles vont dans .env (ignoré par
  git) en local, et dans les secrets GitHub pour le workflow.
- Explique-moi en français ce que tu fais à chaque étape.
```

---

## ⚙️ Ou : en local, à la main

**Cette partie est facultative.** Elle n'a d'intérêt que si vous voulez modifier
le code, tester avant de publier, ou piloter OKX depuis votre terminal et votre
agent IA. Le parcours navigateur ci-dessus suffit à faire tourner le système.

### Prérequis

| Outil | Pourquoi | Vérifier |
|---|---|---|
| **Node.js 20+** | exécuter les scripts | `node -v` |
| **Git** | versionner et pousser le projet | `git --version` |
| **Compte GitHub** | héberger le dépôt et exécuter le planning | [github.com/signup](https://github.com/signup) |
| **GitHub CLI** *(optionnel)* | automatiser la config | `gh --version` |
| **Compte OKX + clés API** | passer les ordres | voir plus bas |

Téléchargements : [Node.js](https://nodejs.org) · [Git](https://git-scm.com/downloads) · [GitHub CLI](https://cli.github.com)

### Installer l'outillage OKX

```bash
npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli
```

- **`okx-trade-cli`** — le CLI (`okx`) : consulter les marchés, les soldes, passer des ordres à la main.
- **`okx-trade-mcp`** — le serveur MCP : donne à votre agent IA 171 outils OKX (marché, spot, swap, futures, options, bots, earn…).

Brancher le MCP sur votre agent :

```bash
okx setup --client claude-code
```

`--client` accepte aussi `claude-desktop`, `cursor`, `vscode`, `windsurf`.

### Créer les clés API OKX

1. Connectez-vous à OKX ([my.okx.com](https://my.okx.com) pour l'Europe).
2. **Pour s'entraîner sans risque** : basculez sur *Trading démo*, puis créez une clé API démo.
3. Profil → API → **Créer une clé API**. Permissions : **Lecture + Trading**. ❌ **Jamais Retrait.**
4. Notez la **clé**, le **secret** et la **passphrase** — le secret n'est affiché qu'une fois.
5. Restreignez l'accès par IP si vous le pouvez.

Enregistrer le profil dans le CLI :

```bash
okx config add-profile AK=votre_cle SK=votre_secret PP=votre_passphrase site=eea demo=true
```

`site` : `global` (www.okx.com) · `eea` (my.okx.com, Europe) · `us` · `tr`.

Vérification :

```bash
okx account balance
```

---

### Mise en place du projet

**1. Récupérez le dépôt** — bouton **Use this template**, puis clonez votre copie :

```bash
git clone https://github.com/VOTRE-PSEUDO/VOTRE-DEPOT.git
```

**2. Configurez vos clés en local** — copiez `.env.example` vers `.env` et remplissez-le.
`.env` est ignoré par git : vos secrets ne partiront jamais sur GitHub.

**3. Générez votre planning** :

Le dépôt est livré avec un `data/plan.json` d'exemple (25 USDC de BTC, ETH et SOL
tous les 15 jours) — remplacez-le par le vôtre :

```bash
node scripts/plan.mjs --amount 50 --every 15 --months 3 --instId BTC-EUR --force
```

| Option | Rôle | Défaut |
|---|---|---|
| `--amount` | montant par actif et par échéance | `50` |
| `--split` | répartit `--amount` entre les actifs au lieu de le dupliquer | — |
| `--instId` | paire(s), séparées par des virgules | `BTC-USDC` |
| `--every` | intervalle en jours | `15` |
| `--months` | durée totale | `3` |
| `--count` | nombre d'échéances (prioritaire sur `--months`) | — |
| `--start` | date de la première échéance (AAAA-MM-JJ) | aujourd'hui |
| `--hour` | heure d'exécution UTC (0-23) | `9` |
| `--check` | vérifie auprès d'OKX que chaque paire existe | — |
| `--force` | écrase un planning existant | — |

### Plusieurs actifs à la fois

30 € de BTC **+** 30 € d'ETH **+** 30 € de SOL chaque semaine (90 € par cycle) :

```bash
node scripts/plan.mjs --amount 30 --every 7 --instId BTC-EUR,ETH-EUR,SOL-EUR
```

Le même budget de 90 € réparti à parts égales entre les trois (30 € chacun) :

```bash
node scripts/plan.mjs --amount 90 --split --instId BTC-EUR,ETH-EUR,SOL-EUR
```

Toutes les paires d'un même plan doivent partager la **même devise de cotation**
(que des `-EUR`, ou que des `-USDC`) : c'est ce qui permet de vérifier un seul solde
et d'afficher des totaux cohérents. Utilisez `--check` pour valider les paires
auprès d'OKX avant de générer le plan.

> **Quelle devise choisir ?** Sur un compte réel OKX Europe, `-EUR` achète
> directement en euros. Le compte **démo** n'est pas approvisionné en EUR — utilisez
> `-USDC` pour vos tests.

**4. Testez à blanc** (aucun ordre n'est transmis) :

```bash
node --env-file=.env scripts/run-due.mjs
```

**5. Poussez sur GitHub** :

```bash
gh repo create okx-planifier-achat-github-actions --private --source=. --push
```

**6. Enregistrez les secrets démo** au niveau du dépôt — `Settings → Secrets and variables → Actions`, ou :

```bash
gh secret set OKX_API_KEY
```

Trois secrets démo à créer : `OKX_API_KEY`, `OKX_SECRET_KEY` (ou `OKX_API_SECRET`) et `OKX_PASSPHRASE`.
Pour le réel, ne réutilisez pas ces secrets de dépôt : placez la clé réelle, son
secret, sa passphrase et `ALLOW_REAL_TRADING` uniquement dans l'environnement
GitHub `real-trading`.

**7. Publiez l'interface** — `Settings → Pages → Source : GitHub Actions`.
Elle sera servie sur `https://VOTRE-PSEUDO.github.io/okx-planifier-achat-github-actions/`.

**8. Lancez un test à blanc sur GitHub** — onglet **Actions** → *DCA — achats
programmés* → **Run workflow**, en laissant `dry_run` sur `1`.

**9. N'activez le réel qu'après une validation démo prolongée.** Il faut à la
fois un plan `live: true` et `demo: false`, le job GitHub sur la branche `main`,
les identifiants du compte réel, et le secret d'environnement protégé
`ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS`. Commencez ensuite par un montant
réel minimal explicitement confirmé et surveillé.

**10. Avant le premier euro réel**, suivez le guide utilisateur :
[docs/GUIDE_ACHAT_REEL.md](docs/GUIDE_ACHAT_REEL.md)
(surtout **Funding → Trading**, clés live, fusible d’armement, ne pas re-run).

---

## Variables locales optionnelles

Ces variables servent à l'exécution locale. Le workflow GitHub prend le mode et
le domaine directement dans le plan afin d'éviter une divergence :

| Variable | Effet | Défaut |
|---|---|---|
| `DRY_RUN` | `1` force la simulation ; `0` n'agit que si le plan est déjà `live` | décision du plan |
| `OKX_DEMO` | doit correspondre exactement au mode du plan ; toute divergence est refusée pour préserver l'identité et l'audit des opérations | décision du plan |
| `OKX_BASE_URL` | doit correspondre exactement au `site` du plan, sinon l'exécution est refusée | domaine du plan |

---

## Commandes

```bash
node scripts/plan.mjs --amount 50 --every 15 --months 3 --instId BTC-EUR,ETH-EUR
```

```bash
node --env-file=.env scripts/run-due.mjs
```

`scripts/buy-now.mjs` est volontairement désactivé : toute opération doit passer
par le registre idempotent du planificateur.

Prévisualiser l'interface en local :

```bash
npm run site -- -l tcp://0.0.0.0:4173
```

L'agent peut ensuite vous donner une URL du type `http://IP-DE-LA-MACHINE:4173/site/` ou `http://IP-DE-LA-MACHINE:4173/tableau-de-bord.html`.

---

## Fonctionnement

```
data/plan.json          le planning : une entrée par achat, avec son échéance
        │
        ▼
.github/workflows/dca.yml   cron horaire
        │                   → scripts/run-due.mjs
        │                   → n'agit que sur les échéances atteintes
        ▼
data/operations.json    registre canonique : intention, soumission, réconciliation
        │
        ▼
data/history.json       projection d'audit et de présentation
        │
        ▼
site/index.html         l'interface, publiée par GitHub Pages
```

**Le cron GitHub est toujours en UTC** — `0 * * * *` vérifie au début de chaque heure.
Le déclenchement peut avoir 5 à 15 minutes de retard quand les runners sont chargés :
sans conséquence pour du DCA.

Le moteur conserve le même `clOrdId` déterministe et teste les frontières de
crash avec une API factice. Dès qu'une opération franchit la barrière pré-POST,
elle n'est **jamais retransmise automatiquement** : elle reste dans le registre
et les reprises sont limitées à la réconciliation GET jusqu'à un état terminal.

Sur un dépôt **public**, les crons sont suspendus après 60 jours sans commit — le
workflow commitant lui-même ses résultats, le problème ne se pose pas en pratique.

---

## Sécurité

- **Jamais la permission « Retrait »** sur votre clé API. Lecture + Trading suffit.
- Les fonds d’achat doivent être sur le compte **Trading** OKX, pas seulement
  **Funding** (sinon le bot voit un solde à zéro).
- `.env` est dans `.gitignore`. Vérifiez avec `git status` avant chaque commit.
- Les secrets GitHub sont chiffrés et masqués dans les logs. Sur un dépôt public,
  ils ne sont **pas** exposés aux forks ni aux pull requests externes.
- Entraînez-vous longtemps sur un **plan démo** (`demo: true`) avant tout passage en réel.
- Premier passage en réel : un petit montant, et surveillez le premier run —
  voir [docs/GUIDE_ACHAT_REEL.md](docs/GUIDE_ACHAT_REEL.md).
- Une clé qui a circulé en clair (chat, capture d'écran, log) doit être révoquée.

---

## Avertissement

Ce projet est un outil technique, pas un conseil en investissement. Le DCA
(*dollar-cost averaging*) lisse le prix d'entrée, il ne protège pas contre les
pertes. Les crypto-actifs sont volatils et vous pouvez perdre votre capital.
Vous restez seul responsable des ordres passés depuis votre compte.

---

## Licence

MIT — faites-en ce que vous voulez.

Réalisé par **Capetlevrai** ·
[X](https://x.com/capetlevrai) ·
[Discord](https://discord.gg/VmBa7f9ZAt) ·
[Twitch](https://www.twitch.tv/capetlevrai) ·
[YouTube](https://www.youtube.com/@CAPETCRYPTO)

## Verrou argent réel

Même si un plan est configuré en argent réel (`demo: false`) et armé (`live: true`), `scripts/run-due.mjs` refuse d'envoyer un ordre réel tant que la variable suivante n'existe pas :

```text
ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS
```

Pour une vraie utilisation, mettez cette variable et tous les identifiants réels
dans l'environnement GitHub `real-trading`, jamais au niveau du dépôt.

## Corrections de robustesse avant argent réel

Les points suivants sont obligatoires avant toute utilisation réelle :

- la réconciliation OKX par `clOrdId` se fait **avant** les contrôles de solde, whitelist et plafond ;
- un ordre `partially_filled` n'est pas présenté comme un achat complet ; il reste surveillé, ou finit en état `partial` si OKX l'annule avec une quantité partielle ;
- `entry.attempts` est incrémenté juste avant le POST ; après une réponse ambiguë, aucune retransmission automatique n'est permise ;
- le verrou argent réel utilise le secret `ALLOW_REAL_TRADING`, pas une variable de dépôt ordinaire ;
- le workflow de configuration conserve l'historique par défaut ; `reset_history` est explicite et refusé en compte réel ;
- tous les appels OKX ont un timeout HTTP explicite.

Pour un DCA automatique réel, créez volontairement ce secret après confirmation humaine :

```text
ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS
```

Seul le job réel utilise `environment: real-trading`; la démo ne dépend pas de
cet environnement. Configurez-y **tous** les secrets réels. Si vous ajoutez des
approbateurs, GitHub demandera une validation à chaque contrôle horaire du plan
réel, même lorsqu'aucune échéance n'est finalement soumise. Sans approbateurs,
le secret constitue un armement volontaire mais automatique. Il ne remplace ni
la validation démo prolongée, ni un premier montant réel minimal explicitement confirmé.
