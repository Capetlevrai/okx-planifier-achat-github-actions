# Protocole d'installation assistée

**Ce fichier s'adresse à un agent IA** (Claude Code, Cursor, Codex, ChatGPT…) à qui
l'utilisateur a donné l'URL de ce dépôt. Suis-le du début à la fin.

Objectif : l'utilisateur ne tape aucune commande et ne va sur aucune page de
réglages. Il répond à des questions, tu fais le reste.

---

## Règles impératives

1. **Ne passe jamais un ordre réel sans confirmation explicite** dans le message
   qui précède. « Configure tout » n'est pas une autorisation d'acheter.
2. **Le mode démo est le défaut.** Ne bascule en réel que si l'utilisateur le
   demande, et redis-lui ce que ça implique avant.
3. **Les clés API ne vont jamais dans le dépôt.** Uniquement dans `.env` (déjà
   dans `.gitignore`) en local, et dans les secrets GitHub Actions.
4. **Refuse une clé qui a la permission de retrait.** Lecture + Trading suffit.
5. **Parle la langue de l'utilisateur** et explique chaque étape en une phrase.
6. **Une question à la fois** si l'interface le permet, sinon groupe-les. Propose
   toujours une valeur par défaut pour que l'utilisateur puisse dire « ok ».

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

## Étape 2 — L'entretien

Pose ces questions. Les valeurs entre crochets sont les défauts à proposer.

| # | Question | Défaut |
|---|---|---|
| 1 | Compte **démo** (argent fictif) ou **réel** ? | démo |
| 2 | Tu es en Europe, aux US, en Turquie, ou ailleurs ? | Europe |
| 3 | Ta clé API OKX ? | — |
| 4 | Ton secret ? | — |
| 5 | Ta passphrase ? | — |
| 6 | Quelle(s) crypto acheter ? | BTC-USDC,ETH-USDC |
| 7 | Combien à chaque achat ? | 50 |
| 8 | Tous les combien de jours ? | 15 |
| 9 | Pendant combien de mois ? | 3 |
| 10 | Nom du dépôt à créer sur son compte ? | mes-achats-crypto |

**Question 2 → paramètre `site` et devise :**

| Réponse | `site` | Domaine | Devise conseillée |
|---|---|---|---|
| Europe | `eea` | my.okx.com | `-USDC` en démo, `-EUR` ou `-USDC` en réel selon disponibilité |
| US | `us` | us.okx.com | `-USD` |
| Turquie | `tr` | tr.okx.com | `-TRY` |
| Ailleurs | `global` | www.okx.com | `-USDT` |

Si l'utilisateur n'a pas encore de clés, guide-le : OKX → Profil → API → Créer
une clé API → permissions **Lecture + Trading**, jamais Retrait. Pour le mode
démo, il doit d'abord basculer sur *Trading démo* puis créer une clé démo.

**Question 6 :** n'importe quelle paire au comptant d'OKX fonctionne. Plusieurs
sont possibles, séparées par des virgules, à condition de partager la même devise
de cotation (`BTC-USDC,ETH-USDC` ✅ · `BTC-EUR,ETH-USDC` ❌ si les devises sont mélangées).

⚠️ Un compte **démo** n'est pas approvisionné en EUR. Si l'utilisateur choisit le
mode démo, propose d’abord des paires en `-USDC` comme `BTC-USDC,ETH-USDC`.

---

## Étape 3 — Configurer OKX en local

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

```bash
gh secret set OKX_API_KEY --body "<clé>" --repo <pseudo>/<nom-du-dépôt>
```

Idem pour `OKX_SECRET_KEY` et `OKX_PASSPHRASE`.

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

```bash
node scripts/plan.mjs --instId <paires> --amount <montant> --every <jours> --months <mois> --account reel --site <site> --live --force
```

```bash
git add data/ && git commit -m "Armer le plan" && git push
```

---

## Étape 9 — Récapitulatif final

Donne à l'utilisateur, en clair :

- l'URL de son dépôt et celle de son interface ;
- ce qui va être acheté, quand, combien de fois, pour quel total ;
- s'il est en démo ou en réel ;
- **comment tout arrêter** : relancer `plan.mjs` sans `--live` et pousser, ou
  `gh workflow disable dca.yml`.

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

Pour un DCA automatique réel, créez volontairement ce secret après confirmation humaine :

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
2. Configure les **mêmes secrets** + env `real-trading`.
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
3. Secrets `OKX_API_KEY`, `OKX_API_SECRET` ou `OKX_SECRET_KEY`, `OKX_PASSPHRASE`,
   et `ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS` (orthographe exacte).
4. Montant minimal confirmé ; exposition plafonnée.
5. Après un run : lire les logs (désarmé / 401 environment / solde) **et**
   l’historique Spot OKX avant tout re-push ou re-run.
6. Ne jamais committer ni coller en clair : clés, `ordId`, quantités/frais exacts
   d’ordres réels sur un dépôt public.
7. En cas de clés collées dans le chat : exiger **révocation** + nouveaux secrets.
