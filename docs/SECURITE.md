# Sécurité

## Règles non négociables

1. Ne mettez jamais une clé OKX dans le dépôt.
2. Utilisez uniquement GitHub Actions Secrets : `OKX_API_KEY`, `OKX_SECRET_KEY` ou `OKX_API_SECRET`, `OKX_PASSPHRASE`.
3. La permission OKX Retrait doit rester désactivée. Lecture + Trading suffisent.
4. Le mode démo est le défaut.
5. Le mode réel doit être activé volontairement et explicitement.
6. Un dépôt public peut afficher votre planning et votre historique : ne publiez pas des montants que vous souhaitez garder privés.

## Repo privé vs repo public

GitHub Actions fonctionne sur repo privé avec GitHub Free. Vous n’êtes pas obligé de rendre votre dépôt public pour automatiser les achats.

GitHub Pages gratuit est plus simple sur repo public. Si vous voulez garder vos achats privés, utilisez `RAPPORT.md` ou `tableau-de-bord.html` dans le dépôt privé, ou servez l’interface localement.

## Argent réel

Avant d’activer l’argent réel, vérifiez :

- compte OKX correct ;
- paires correctes ;
- devise de cotation approvisionnée ;
- montant total engagé ;
- `plan.live=true` seulement après confirmation ;
- `plan.demo=false` seulement pour compte réel ;
- `DRY_RUN` absent ou à `0` uniquement quand vous voulez transmettre des ordres.

## Idempotence et interruptions GitHub Actions

Le risque critique est l’interruption entre l’envoi de l’ordre à OKX et le commit de `data/plan.json`.

Protection mise en place :

1. `scripts/safety.mjs` calcule un `clOrdId` déterministe pour chaque échéance.
2. `scripts/run-due.mjs` cherche d’abord un ordre OKX existant avec ce `clOrdId`.
3. Si l’ordre existe et est rempli, l’échéance est marquée `done` sans renvoyer d’ordre.
4. Si l’ordre existe mais n’est pas encore rempli, le script attend son état réel.
5. Si aucun ordre n’existe, un seul nouvel ordre est transmis avec ce même `clOrdId`.

Conséquence : un rerun GitHub Actions ne doit pas créer de double achat pour la même échéance.

## Échecs et retries

- `pending` : échéance jamais exécutée.
- `failed` + `retryable: true` : réessayée après `retryAfter`, jusqu’à `risk.maxAttempts`.
- `failed` + `retryable: false` : erreur définitive, intervention humaine requise.
- `done` : jamais rejoué.

## Limites de risque

Chaque `data/plan.json` contient :

```json
"risk": {
  "allowedInstIds": ["BTC-USDC", "ETH-USDC"],
  "maxOrderAmount": 50,
  "maxDailyQuoteAmount": 100,
  "maxAttempts": 3
}
```

Pour l’argent réel, activez aussi un environnement GitHub protégé, par exemple `real-trading`, avec approbation manuelle obligatoire.

## Verrou argent réel

Même si un plan est configuré en argent réel (`demo: false`) et armé (`live: true`), `scripts/run-due.mjs` refuse d'envoyer un ordre réel tant que la variable suivante n'existe pas :

```text
ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS
```

Pour une vraie utilisation, mettez cette variable dans un environnement GitHub protégé avec approbation humaine, pas comme automatisme silencieux.
