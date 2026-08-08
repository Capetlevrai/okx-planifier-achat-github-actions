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
- devise de cotation approvisionnée **sur le compte Trading** (pas seulement
  Funding — voir ci-dessous) ;
- montant total engagé ;
- `plan.live=true` seulement après confirmation ;
- `plan.demo=false` seulement pour compte réel ;
- clé API créée en mode **réel** (une clé *Trading démo* provoque
  `APIKey does not match current environment` sur le live) ;
- `DRY_RUN=1` pour forcer une simulation ; `DRY_RUN=0` ne peut pas armer un plan
  dont `live` vaut `false`.
- tous les identifiants OKX réels et le secret
  `ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS` dans l'environnement GitHub
  `real-trading`, idéalement protégé par approbateurs.

Guide pas à pas pour le premier test réel (checklist, logs, cas 1+1 USDC SOL) :
**[GUIDE_ACHAT_REEL.md](./GUIDE_ACHAT_REEL.md)**.

## Funding vs Trading (piège n°1)

OKX sépare souvent :

| Compte | Rôle |
|---|---|
| **Funding** (Financement) | dépôt / retrait / stockage hors trading Spot API |
| **Trading** (Transaction) | solde utilisé par les ordres Spot de ce bot |

L’API d’achat (`/api/v5/trade/order`) et le contrôle de solde
(`/api/v5/account/balance`) regardent le **Trading**.  
Un solde confortable en Funding avec Trading à zéro → échec « solde
insuffisant » ou préflight bloqué, **sans** que l’appli OKX « ait l’air vide ».

**Correctif utilisateur** : Actifs → Transfert → Funding → Trading, devise du
plan (ex. USDC), montant ≥ exposition prévue.

**Automatisation optionnelle** : permission Transfer sur la clé + script
`scripts/ensure-trading-usdc.mjs` (logs en buckets, jamais le solde exact).

## Ne pas publier les détails d’ordres réels

Sur un dépôt **public**, évitez de committer volontairement pour des fills
réels : `ordId`, `clOrdId`, quantités exactes, prix moyen, frais, dumps
d’historique. Le workflow de micro-test SOL utilise `permissions: contents: read`
précisément pour ne pas pousser cet état.

## Idempotence et interruptions GitHub Actions

Le risque critique est l’interruption entre l’envoi de l’ordre à OKX et le commit de `data/plan.json`.

Protection mise en place :

1. `scripts/safety.mjs` calcule un `clOrdId` déterministe pour chaque échéance.
2. `scripts/run-due.mjs` cherche d’abord un ordre OKX existant avec ce `clOrdId`.
3. Si l’ordre existe et est rempli, l’échéance est marquée `done` sans renvoyer d’ordre.
4. Si l’ordre existe mais n’est pas terminal, il reste `reconcile_pending` sans
   nouveau POST.
5. Si une tentative ambiguë reste introuvable ou dans un état inconnu, aucun
   nouveau POST automatique n'est permis : seule la réconciliation GET continue.

Conséquence : un rerun GitHub Actions ne doit pas créer de double achat pour la même échéance.

## Échecs et retries

- `pending` : échéance jamais exécutée.
- `failed` + `retryable: true` avant la barrière POST : le préflight peut être
  réévalué après `retryAfter`.
- `submitting` / `reconcile_pending` : aucune retransmission automatique ; GET
  de réconciliation uniquement jusqu'à résolution ou intervention humaine.
- `failed` + `retryable: false` : erreur définitive, intervention humaine requise.
- `done` : jamais rejoué.

## Limites de risque

Chaque `data/plan.json` contient :

```json
"risk": {
  "allowedInstIds": ["BTC-USDC", "ETH-USDC"],
  "maxOrderAmount": 50,
  "maxDailyQuoteAmount": 100,
  "maxPlanQuoteAmount": 600,
  "maxLifetimeQuoteAmount": 600,
  "maxAttempts": 3
}
```

Pour l’argent réel, activez aussi l'environnement GitHub `real-trading`. Des
approbateurs rendent chaque contrôle horaire manuel ; sans approbateur, le plan
reste automatique mais exige toujours son secret d'armement.

## Verrou argent réel

Même si un plan est configuré en argent réel (`demo: false`) et armé (`live: true`), `scripts/run-due.mjs` refuse d'envoyer un ordre réel tant que la variable suivante n'existe pas :

```text
ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS
```

Pour une vraie utilisation, mettez cette variable et tous les identifiants réels
dans l'environnement GitHub `real-trading`, jamais comme secrets de dépôt.

## Corrections de robustesse avant argent réel

Les points suivants sont obligatoires avant toute utilisation réelle :

- la réconciliation OKX par `clOrdId` se fait **avant** les contrôles de solde, whitelist et plafond ;
- un ordre `partially_filled` n'est pas présenté comme un achat complet ; il reste surveillé, ou finit en état `partial` si OKX l'annule avec une quantité partielle ;
- `entry.attempts` est incrémenté juste avant le POST ; une réponse ambiguë ne
  déclenche jamais de retransmission automatique ;
- le verrou argent réel utilise le secret `ALLOW_REAL_TRADING`, pas une variable de dépôt ordinaire ;
- le workflow de configuration conserve l'historique par défaut ; `reset_history` est explicite et refusé en compte réel ;
- tous les appels OKX ont un timeout HTTP explicite.

Pour un DCA automatique réel, créez volontairement ce secret après confirmation humaine :

```text
ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS
```

Seul le job réel est attaché à `environment: real-trading`; la démo reste
automatique et séparée. Configurez-y tous les secrets réels et, si vous acceptez
une validation à chaque contrôle horaire, des approbateurs. Même sans défaut logiciel connu, exigez une validation
prolongée en démo puis un premier montant réel minimal, explicitement confirmé et
surveillé.
