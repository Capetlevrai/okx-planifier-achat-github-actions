# Prompts prêts à copier pour demander à une IA de tout configurer

Collez l’un de ces prompts dans Grok, OpenCode, Claude Code, ChatGPT, Gemini CLI, Cursor ou un autre agent de code.

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
1. Vérifie que GitHub Actions fonctionne aussi en dépôt privé.
2. Crée ou configure un dépôt à partir du template.
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
