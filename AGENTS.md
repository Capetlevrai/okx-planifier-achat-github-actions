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

```bash
gh repo create <nom-du-dépôt> --private --template Capetlevrai/okx-planifier-achat-github-actions
```

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

`OKX_DEMO=0` et le bon domaine si l'utilisateur est en réel.

---

## Étape 5 — Enregistrer les secrets sur GitHub

```bash
gh secret set OKX_API_KEY --body "<clé>" --repo <pseudo>/<nom-du-dépôt>
```

Idem pour `OKX_SECRET_KEY` et `OKX_PASSPHRASE`.

Si le compte est réel ou hors Europe, ajoute aussi les variables :

```bash
gh variable set OKX_DEMO --body "0" --repo <pseudo>/<nom-du-dépôt>
```

```bash
gh variable set OKX_BASE_URL --body "https://www.okx.com" --repo <pseudo>/<nom-du-dépôt>
```

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

## Étape 7 — Publier l'interface

GitHub Pages exige un dépôt **public**, sauf abonnement payant. Demande à
l'utilisateur s'il accepte de rendre son dépôt public — ses achats seront alors
visibles de tous (ses clés, elles, restent dans les secrets, jamais exposées).

S'il accepte :

```bash
gh repo edit <pseudo>/<nom-du-dépôt> --visibility public --accept-visibility-change-consequences
```

```bash
gh api -X POST repos/<pseudo>/<nom-du-dépôt>/pages -f build_type=workflow
```

```bash
gh workflow run pages.yml --repo <pseudo>/<nom-du-dépôt>
```

L'interface sera sur `https://<pseudo>.github.io/<nom-du-dépôt>/`.

S'il refuse, désactive le workflow pour éviter des runs rouges à répétition, et
dis-lui qu'il peut consulter l'interface en local avec ``npm run site -- -l tcp://0.0.0.0:4173` :

```bash
gh workflow disable pages.yml --repo <pseudo>/<nom-du-dépôt>
```

---

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
node scripts/plan.mjs --instId <paires> --amount <montant> --every <jours> --months <mois> --live --force
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
| `scripts/buy-now.mjs` | achat ponctuel hors planning |
| `data/plan.json` | le planning ; `live: true` = armé |
| `data/history.json` | les achats réalisés |
| `site/index.html` | l'interface, sans build |

Le garde-fou est dans `resolveDryRun()` (`scripts/okx.mjs`) : la variable
d'environnement `DRY_RUN` l'emporte si elle est fournie, sinon c'est `live` du
planning qui décide, et en l'absence des deux **on simule**.


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
