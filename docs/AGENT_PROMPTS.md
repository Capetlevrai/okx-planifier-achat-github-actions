# Prompts prêts à copier pour demander à une IA de tout configurer

Collez l’un de ces prompts dans Grok, OpenCode, Claude Code, ChatGPT, Gemini CLI, Cursor ou un autre agent de code.

## Parcours interactif obligatoire

Quel que soit le prompt utilisé, l'agent doit commencer par deux questions
séparées avec boutons ou sélecteurs lorsque l'interface le permet :

1. `Démo (argent fictif)` ou `Argent réel` ;
2. `Europe/EEE`, `États-Unis`, `Turquie` ou `Ailleurs`.

En argent réel, il propose ensuite `Créer un sous-compte dédié` (recommandé) ou
`Utiliser mon compte principal`. Il ne demande une clé API qu'après ce choix.
Il donne l'URL officielle à ouvrir manuellement dans le navigateur habituel de
l'utilisateur et n'ouvre jamais OKX dans un navigateur intégré. Aucun secret
OKX ne doit être collé dans la conversation.

## Exemple minimal identique à cette démo : BTC + ETH

```text
Configure pour moi ce projet : https://github.com/Capetlevrai/okx-planifier-achat-github-actions

Objectif : automatiser des achats OKX avec GitHub Actions, sans VPS, ordinateur éteint possible.
Je veux commencer en compte OKX DÉMO, donc argent fictif.
Je suis en Europe, donc domaine my.okx.com.
Utilise uniquement ces paires : BTC-USDC et ETH-USDC.
Montant : 50 USDC par actif.
Rythme : tous les 15 jours.
Durée : 3 mois.

Fais tout pour moi :
1. Crée mon dépôt en **privé** à partir du template (`gh repo create … --private --template …`).
2. Ne le passe pas en public sans ma demande explicite.
3. Guide-moi pour créer un fine-grained token GitHub si tu dois pousser du code ou ajouter des secrets.
4. Mets mes clés OKX uniquement dans GitHub Actions Secrets, jamais dans le code.
5. Génère le plan en simulation d’abord.
6. Lance un test à blanc.
7. Si je demande la démo armée, exécute seulement sur compte démo.
8. Ne passe aucun ordre en argent réel sans confirmation explicite.
9. Donne-moi le lien du dashboard et explique comment arrêter le système.
```

## Mode réel, avec garde-fous

```text
Je veux utiliser ce projet en argent réel : https://github.com/Capetlevrai/okx-planifier-achat-github-actions

Avant tout ordre réel, affiche-moi clairement :
- les cryptos achetées ;
- le montant par achat ;
- le nombre total d’achats ;
- le montant total engagé ;
- le compte OKX utilisé ;
- le domaine OKX utilisé ;
- comment arrêter le système.

Ne passe l’ordre réel que si je réponds explicitement :
« Je confirme l’activation en argent réel ».

Mes clés API ne doivent jamais être commit : seulement GitHub Actions Secrets.
La clé OKX ne doit jamais avoir la permission Retrait. Lecture + Trading seulement.
Commence toujours par un dry-run.
Exige ensuite une validation prolongée en compte démo. Le premier ordre réel doit
utiliser un montant minimal, être explicitement confirmé, surveillé et passer par
l'environnement GitHub protégé `real-trading`.
```

## Token GitHub fine-grained minimal

Si l’agent doit pousser le code et ajouter les secrets lui-même, créez un token fine-grained limité au dépôt cible :

- Repository access : Only selected repositories
- Contents : Read and write
- Workflows : Read and write
- Secrets : Read and write
- Metadata : Read-only

Selon l’action demandée, il peut aussi falloir :

- Pages : Read and write, si l’agent doit configurer GitHub Pages ;
- Administration : Read and write, seulement si l’agent doit modifier la description, la visibilité ou les paramètres du repo.

Révoquez le token après configuration.

## Verrou argent réel

Même si un plan est configuré en argent réel (`demo: false`) et armé (`live: true`), `scripts/run-due.mjs` refuse d'envoyer un ordre réel tant que la variable suivante n'existe pas :

```text
ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS
```

Pour une vraie utilisation, mettez cette variable dans un environnement GitHub protégé avec approbation humaine, pas comme automatisme silencieux.
